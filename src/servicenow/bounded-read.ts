/** Isolated, read-only transport. Never uses the legacy client's retries, logging or body readers. */
import { createHash } from 'node:crypto';
import type { ServiceNowConfig } from './types.js';
import { pinReviewReleaseConfig } from './review-release-config.js';
import { registerReviewEvidenceSession, markReviewEvidenceAuthReady, revokeReviewEvidenceSession } from './review-evidence-lifecycle.js';
import type { PreparedTransportBudget, PreparedTransportOutcome, PreparedFinalSkip, PreparedAttemptSettlement } from './review-transport-budget.js';

export const BOUNDED_LIMITS = Object.freeze({ responseBytes: 4 * 1024 * 1024, totalBytes: 16 * 1024 * 1024,
  payloadBytes: 2 * 1024 * 1024, totalPayloadBytes: 8 * 1024 * 1024,
  deadlineMs: 60000, requestTimeoutMs: 10000, requests: 210, retryDelayMs: 250 });
export type ReadFailureCode = 'invalid_input' | 'authentication_failed' | 'access_denied' | 'not_found_or_not_visible'
  | 'upstream_unavailable' | 'deadline_exceeded' | 'receive_budget_exceeded' | 'request_budget_exceeded'
  | 'payload_budget_exceeded' | 'payload_limit' | 'invalid_response' | 'review_busy' | 'cancelled' | 'closed' | 'changed_during_review' | 'release_not_admitted' | 'config_invalid' | 'phase_deadline_exceeded' | 'candidate_filter_violation';
export class BoundedReadError extends Error {
  constructor(readonly code: ReadFailureCode) { super(code); this.name = 'BoundedReadError'; }
}
export interface ReadSnapshot {
  instanceUrl: string; authMode: ServiceNowConfig['authMode']; perUserBearerToken?: string;
  oauth: ServiceNowConfig['oauth']; accessToken?: string; tokenExpiry?: number;
  reviewReleaseConfig?: unknown;
  reviewReleaseConfigProvider?: () => unknown;
}
/** Trusted dependency injection only; callers may lower, never raise production ceilings. */
export interface BoundedReadOptions {
  fetch?: typeof fetch; signal?: AbortSignal; limits?: Partial<typeof BOUNDED_LIMITS>;
}
let active = 0;
const principals = new Set<string>();

export class BoundedReadSession {
  private readonly controller = new AbortController();
  private phase = new AbortController();
  private phaseTimer?: ReturnType<typeof setTimeout>;
  private reserveMs = 0;
  private readonly limits: Record<keyof typeof BOUNDED_LIMITS, number>;
  private readonly baseUrl: string;
  private readonly principalKey: string;
  private readonly fetcher: typeof fetch;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly started = performance.now();
  readonly startedAt = new Date().toISOString();
  readonly authMode: 'per-user' | 'service-account';
  private readonly snapshot: ReadSnapshot;
  private token?: string;
  private readyPromise?: Promise<void>;
  private stopCode?: ReadFailureCode;
  private disposed = false;
  private busy = false;
  private requests = 0;
  private receivedBytes = 0;
  private payloadBytes = 0;
  private transportOwned = false;
  private evidenceBytes = 0;
  private readonly removeExternal: () => void;
  readonly releasePolicy: ReturnType<typeof pinReviewReleaseConfig>;

  constructor(snapshot: ReadSnapshot, options: BoundedReadOptions = {}) {
    this.snapshot = { ...snapshot, oauth: { ...snapshot.oauth } };
    this.limits = { ...BOUNDED_LIMITS };
    for (const [key, value] of Object.entries(options.limits ?? {})) {
      if (!(key in BOUNDED_LIMITS) || !Number.isInteger(value) || value! < 1 || value! > BOUNDED_LIMITS[key as keyof typeof BOUNDED_LIMITS]) {
        throw new BoundedReadError('invalid_input');
      }
      this.limits[key as keyof typeof BOUNDED_LIMITS] = value!;
    }
    let url: URL;
    try { url = new URL(snapshot.instanceUrl); } catch { throw new BoundedReadError('invalid_input'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
      throw new BoundedReadError('invalid_input');
    }
    this.baseUrl = url.origin;
    try { this.releasePolicy = pinReviewReleaseConfig(snapshot.reviewReleaseConfigProvider
      ? snapshot.reviewReleaseConfigProvider() : snapshot.reviewReleaseConfig, this.baseUrl, this.startedAt, this.limits.deadlineMs); }
    catch { throw new BoundedReadError('config_invalid'); }
    if (snapshot.authMode === 'impersonation') throw new BoundedReadError('authentication_failed');
    this.authMode = snapshot.authMode === 'per-user' ? 'per-user' : 'service-account';
    if (this.authMode === 'per-user' && !snapshot.perUserBearerToken) throw new BoundedReadError('authentication_failed');
    // Credential-key admission, not a stable user ID: rotated per-user tokens count as distinct keys.
    this.principalKey = createHash('sha256').update(JSON.stringify([this.baseUrl, this.authMode,
      this.authMode === 'per-user' ? snapshot.perUserBearerToken : [snapshot.oauth.clientId, snapshot.oauth.username ?? '']])).digest('hex');
    if (active >= 2 || principals.has(this.principalKey)) throw new BoundedReadError('review_busy');
    active++; principals.add(this.principalKey);
    registerReviewEvidenceSession(this, this.snapshot, () => this.claimTransportBudget());
    this.fetcher = options.fetch ?? ((...args) => globalThis.fetch(...args));
    this.timer = setTimeout(() => this.stop('deadline_exceeded'), Math.max(0, this.limits.deadlineMs - (performance.now() - this.started)));
    const cancel = () => this.stop('cancelled');
    const external = options.signal;
    external?.addEventListener('abort', cancel, { once: true });
    this.removeExternal = () => external?.removeEventListener('abort', cancel);
    if (external?.aborted) cancel();
  }

  stats() { return { requests: this.requests, received_bytes: this.receivedBytes, payload_bytes: this.payloadBytes }; }
  /** Only the prepared lifecycle can claim this one-shot, non-network accounting port. */
  private claimTransportBudget():PreparedTransportBudget {
    this.check();
    if(this.transportOwned||this.busy)throw new BoundedReadError('invalid_input');
    this.transportOwned=true;
    let reserved=4,final=false,cursor=0,evidenceClosed=false,active:{purpose:string;key:string;size:number;ordinal:1|2}|undefined;
    // A successful payload attempt opens one payload charge at the source boundary; the next dispatch closes it.
    let payloadReady=false;
    const slots=new Map<string,number>([['parent_final',2],['metadata_final',2]]);
    type Table={state:'pending'|'retryable'|'available'|'unavailable'|'not_completed';outcome:PreparedTransportOutcome|null};
    const tables=new Map<string,Table>();
    const reads=new Map<string,{ordinal:number;retry:boolean}>();
    const fail=(code:ReadFailureCode):never=>{this.stop(code);throw new BoundedReadError(code);};
    const check=()=>this.check();
    return Object.freeze({deadlineMs:this.limits.deadlineMs,requestTimeoutMs:this.limits.requestTimeoutMs,authMode:this.authMode,signal:this.controller.signal,
      now:()=>{check();return performance.now()-this.started;},check,
      dispatch:(purpose:string,target:string|undefined,ordinal:1|2)=>{
        check();if(active||final!==purpose.endsWith('_final'))return fail('invalid_input');
        if(this.receivedBytes>=this.limits.totalBytes)return fail('receive_budget_exceeded');
        if(purpose.startsWith('table_')&&evidenceClosed)throw Error('scope_evidence_limit');
        if(!['parent_initial','release_rows','metadata_initial','payload','table_initial','parent_final','metadata_final','table_final'].includes(purpose)
          ||!([1,2] as number[]).includes(ordinal)||purpose.startsWith('table_')&&(!target||!/^[a-z][a-z0-9_]{0,79}$/.test(target)||target==='global'))return fail('invalid_input');
        const key=`${purpose}:${target??''}`,previous=reads.get(key);
        if(previous?ordinal!==previous.ordinal+1||!previous.retry:ordinal!==1)return fail('invalid_input');
        if(purpose==='table_initial'&&!tables.has(target!)){
          if(tables.size>=8||this.requests+reserved+4>this.limits.requests)throw Error('scope_evidence_limit');
          tables.set(target!,{state:'pending',outcome:null});slots.set(`table_final:${target}`,2);reserved+=2;
        }
        const slot=purpose.startsWith('table_')?`table_final:${target}`:purpose;
        if(final){
          const keys=[...slots.keys()];if(keys[cursor]!==slot||(slots.get(slot)??0)<1)return fail('invalid_input');
          if(purpose==='table_final'&&tables.get(target!)?.state!=='available')return fail('invalid_input');
          slots.set(slot,slots.get(slot)!-1);reserved--;
        }else if(this.requests+1+reserved>this.limits.requests)throw new BoundedReadError('request_budget_exceeded');
        if(this.requests>=this.limits.requests)return fail('request_budget_exceeded');
        this.requests++;reads.set(key,{ordinal,retry:false});active={purpose,key,size:0,ordinal};payloadReady=false;
      },
      chunk:(n:number)=>{
        check();if(!active||!Number.isSafeInteger(n)||n<0)return fail('invalid_input');
        // Payload bytes are charged once on the decoded payload string (chargePayload), not on response chunks.
        const size=active.size+n,g=this.receivedBytes+n,e=this.evidenceBytes+(active.purpose.startsWith('table_')?n:0);
        if(![size,g,e].every(Number.isSafeInteger))return fail('receive_budget_exceeded');
        active.size=size;this.receivedBytes=g;this.evidenceBytes=e;
        if(e>=262144)evidenceClosed=true;
        if(g>this.limits.totalBytes||size>this.limits.responseBytes)return fail('receive_budget_exceeded');
        if(active.purpose.startsWith('table_')&&(size>16384||e>262144))throw Error('scope_evidence_limit');
      },
      settle:(result:PreparedAttemptSettlement)=>{
        if(!active)return;
        const retry=result.retryable&&active.ordinal===1&&result.cleanup==='confirmed';
        payloadReady=active.purpose==='payload'&&result.outcome==='body'&&result.cleanup==='confirmed';
        reads.get(active.key)!.retry=retry;
        if(active.purpose==='table_initial'){
          const table=tables.get(active.key.slice('table_initial:'.length))!;table.outcome=result.outcome;
          table.state=retry?'retryable':result.outcome==='body'&&result.cleanup==='confirmed'?'available':'unavailable';
        }
        if(final&&!retry){const key=active.purpose==='table_final'?`table_final:${active.key.slice('table_final:'.length)}`:active.purpose;
          reserved-=slots.get(key)??0;slots.set(key,0);cursor++;}
        active=undefined;
      },
      enterFinal:()=>{check();if(active||final)return fail('invalid_input');
        for(const table of tables.values())if(table.state==='pending'||table.state==='retryable')table.state='not_completed';
        final=true;},
      skipFinal:(target:string):PreparedFinalSkip=>{
        check();const key=`table_final:${target}`,table=tables.get(target),left=slots.get(key);
        if(!final||active||!table||[...slots.keys()][cursor]!==key||!left)return fail('invalid_input');
        if(table.state!=='unavailable'&&table.state!=='not_completed'&&!evidenceClosed)return fail('invalid_input');
        const reason=evidenceClosed?'evidence_budget_exhausted':table.state==='not_completed'?'initial_not_completed':'initial_unavailable';
        reserved-=left;slots.set(key,0);cursor++;const read=reads.get(`${key}`);if(read)read.retry=false;
        return Object.freeze({state:'skipped',reason,initial_outcome:table.outcome,released_attempts:left,synthetic:true,evidence_issuance:'disabled'});
      },
      chargePayload:(payload:string)=>{
        check();if(typeof payload!=='string'||!payloadReady||active)return fail('invalid_input');
        payloadReady=false;this.chargePayloadBytes(payload);
      },
      stop:(code:string)=>this.stop(['cancelled','closed','deadline_exceeded','authentication_failed','access_denied','receive_budget_exceeded','payload_budget_exceeded'].includes(code)?code as ReadFailureCode:'invalid_input'),
      stats:()=>Object.freeze({...this.stats(),evidence_bytes:this.evidenceBytes,reserved}),
    });
  }
  /** Monotonic run budget, also usable for safe CPU finalization after an HTTP stop. */
  remainingMs() { return Math.max(0, this.limits.deadlineMs - (performance.now() - this.started)); }
  get deadlineMs() { return this.limits.deadlineMs; }
  phaseRemainingMs() { return Math.max(0, this.remainingMs() - this.reserveMs); }
  /** Internal phase boundary only. Never extends the original hard deadline. */
  setPhaseReserve(reserveMs: number) {
    if(this.transportOwned)throw new BoundedReadError('invalid_input');
    if (!Number.isFinite(reserveMs) || reserveMs < 0 || reserveMs >= this.limits.deadlineMs || this.busy || this.disposed) {
      throw new BoundedReadError('invalid_input');
    }
    clearTimeout(this.phaseTimer);
    this.phase = new AbortController(); this.reserveMs = reserveMs;
    if (reserveMs > 0) this.phaseTimer = setTimeout(() => this.phase.abort(), this.phaseRemainingMs());
  }
  assertActive() { this.check(); }
  private stop(code: ReadFailureCode) {
    this.stopCode ??= code;
    revokeReviewEvidenceSession(this, this.stopCode);
    this.controller.abort();
  }
  private check() {
    if (performance.now() - this.started >= this.limits.deadlineMs) this.stop('deadline_exceeded');
    if (this.stopCode) throw new BoundedReadError(this.stopCode);
    if (this.disposed) throw new BoundedReadError('closed');
    if (this.phaseRemainingMs() <= 0 || this.phase.signal.aborted) throw new BoundedReadError('phase_deadline_exceeded');
  }
  /** Race even non-cooperative fetch/body implementations; late responses are cancelled by attempt(). */
  private async guarded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
    const failure = () => this.stopCode ?? (this.phase.signal.aborted || this.phaseRemainingMs() <= 0 ? 'phase_deadline_exceeded' : 'upstream_unavailable');
    if (signal.aborted) throw new BoundedReadError(failure());
    let abort!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(new BoundedReadError(failure()));
      signal.addEventListener('abort', abort, { once: true });
    });
    try { return await Promise.race([work, cancelled]); } finally { signal.removeEventListener('abort', abort); }
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    try {
      this.check();
      const result = await this.guarded(Promise.resolve().then(work), this.controller.signal);
      this.check();
      return result;
    }
    finally { this.close(); }
  }
  close() {
    if (this.disposed) return;
    revokeReviewEvidenceSession(this, this.stopCode ?? 'closed');
    this.disposed = true; clearTimeout(this.timer); clearTimeout(this.phaseTimer); this.removeExternal();
    this.phase.abort();
    this.controller.abort(); active--; principals.delete(this.principalKey);
    this.token = undefined;
    // A closed snapshot must not retain per-user credentials after its owner
    // revokes an R-2 session. This snapshot is an isolated copy, not user config.
    this.snapshot.perUserBearerToken = undefined;
    this.snapshot.accessToken = undefined;
  }
  private async attempt(path: string, init: RequestInit, final: boolean): Promise<{ status: number; value?: unknown }> {
    this.check();
    // Four attempts remain reserved for final parent + metadata verification (including retries).
    if (this.requests >= this.limits.requests - (final ? 0 : 4)) throw new BoundedReadError('request_budget_exceeded');
    if (this.receivedBytes >= this.limits.totalBytes) { this.stop('receive_budget_exceeded'); this.check(); }
    this.requests++;
    const controller = new AbortController();
    const onStop = () => controller.abort();
    this.controller.signal.addEventListener('abort', onStop, { once: true });
    const phaseSignal = this.phase.signal;
    phaseSignal.addEventListener('abort', onStop, { once: true });
    const timer = setTimeout(() => controller.abort(), Math.min(this.limits.requestTimeoutMs,
      this.phaseRemainingMs()));
    let response: Response | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const pending = this.fetcher(new URL(path, this.baseUrl), { ...init, signal: controller.signal, redirect: 'error' });
      void pending.then(late => { if (controller.signal.aborted) void late.body?.cancel().catch(() => {}); }, () => {});
      response = await this.guarded(pending, controller.signal);
      this.check();
      // Terminal statuses need no body. Cancel immediately: a stalled 401 body must never become a retryable timeout.
      if (!response.ok && response.status !== 429 && response.status < 500) return { status: response.status };
      if (!response.body) throw new BoundedReadError('invalid_response');
      reader = response.body.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const chunk = await this.guarded(reader.read(), controller.signal);
        this.check();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        this.receivedBytes += chunk.value.byteLength;
        if (size > this.limits.responseBytes || this.receivedBytes > this.limits.totalBytes) {
          this.stop('receive_budget_exceeded'); this.check();
        }
        if (response.ok) chunks.push(chunk.value);
      }
      if (!response.ok) return { status: response.status };
      let value: unknown;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { throw new BoundedReadError('invalid_response'); }
      this.check();
      return { status: response.status, value };
    } catch (error) {
      if (error instanceof BoundedReadError) throw error;
      throw new BoundedReadError(this.stopCode ?? (phaseSignal.aborted || this.phaseRemainingMs() <= 0 ? 'phase_deadline_exceeded' : 'upstream_unavailable'));
    } finally {
      clearTimeout(timer); this.controller.signal.removeEventListener('abort', onStop);
      phaseSignal.removeEventListener('abort', onStop);
      controller.abort();
      if (reader) void reader.cancel().catch(() => {});
      else if (response) void response.body?.cancel().catch(() => {});
    }
  }
  private async request(path: string, init: RequestInit, final = false): Promise<unknown> {
    for (let n = 0; n < 2; n++) {
      try {
        const r = await this.attempt(path, init, final);
        if (r.status === 403 && path.startsWith('/api/now/table/sys_cluster_state?')) {
          throw new BoundedReadError('access_denied');
        }
        if (r.status === 401 || r.status === 403) {
          this.stop(r.status === 401 ? 'authentication_failed' : 'access_denied'); this.check();
        }
        if (r.status === 404) throw new BoundedReadError('not_found_or_not_visible');
        if (r.status >= 200 && r.status < 300) return r.value;
        if (r.status !== 429 && r.status < 500) throw new BoundedReadError('invalid_response');
        throw new BoundedReadError('upstream_unavailable');
      } catch (error) {
        if (!(error instanceof BoundedReadError) || error.code !== 'upstream_unavailable' || n === 1) throw error;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const controller = new AbortController();
        const abort = () => controller.abort();
        this.controller.signal.addEventListener('abort', abort, { once: true });
        const phaseSignal = this.phase.signal;
        phaseSignal.addEventListener('abort', abort, { once: true });
        if (this.controller.signal.aborted || phaseSignal.aborted) controller.abort();
        try { await this.guarded(new Promise(resolve => { timer = setTimeout(resolve, this.limits.retryDelayMs); }), controller.signal); }
        finally { clearTimeout(timer); this.controller.signal.removeEventListener('abort', abort); phaseSignal.removeEventListener('abort', abort); }
      }
    }
    throw new BoundedReadError('upstream_unavailable');
  }
  private async authenticate() {
    if (this.authMode === 'per-user') { this.token = this.snapshot.perUserBearerToken; return; }
    if (this.snapshot.accessToken && (this.snapshot.tokenExpiry ?? 0) > Date.now() + this.limits.deadlineMs) {
      this.token = this.snapshot.accessToken; return;
    }
    const oauth = this.snapshot.oauth;
    if (!oauth.clientId || !oauth.clientSecret) throw new BoundedReadError('authentication_failed');
    const body = new URLSearchParams({ client_id: oauth.clientId, client_secret: oauth.clientSecret,
      grant_type: oauth.username && oauth.password ? 'password' : 'client_credentials' });
    if (oauth.username && oauth.password) { body.set('username', oauth.username); body.set('password', oauth.password); }
    const value = await this.request('/oauth_token.do', { method: 'POST', body: body.toString(),
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' } });
    const data = value as { access_token?: unknown; expires_in?: unknown; token_type?: unknown } | null;
    if (!data || typeof data.access_token !== 'string' || !data.access_token || /[\r\n]/.test(data.access_token)
      || typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in * 1000 <= this.limits.deadlineMs
      || (data.token_type !== undefined && String(data.token_type).toLowerCase() !== 'bearer')) throw new BoundedReadError('authentication_failed');
    this.token = data.access_token;
  }
  async get(path: string, final = false): Promise<unknown> {
    this.check();
    if(this.transportOwned)throw new BoundedReadError('invalid_input');
    if (!/^\/api\/now\/table\/(sys_update_set|sys_cluster_state|sys_update_xml)(\/[^/?]+)?\?/.test(path)) throw new BoundedReadError('invalid_input');
    if (this.busy) throw new BoundedReadError('review_busy');
    this.busy = true;
    try {
      this.readyPromise ??= this.authenticate().then(() => { markReviewEvidenceAuthReady(this); }, error => {
        revokeReviewEvidenceSession(this, error instanceof BoundedReadError ? error.code : 'internal_review_error');
        throw error;
      });
      await this.readyPromise; this.check();
      return await this.request(path, { method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${this.token}` } }, final);
    } finally { this.busy = false; }
  }
  chargePayload(payload: string) {
    this.check();
    if(this.transportOwned)throw new BoundedReadError('invalid_input');
    this.chargePayloadBytes(payload);
  }
  /** One charge of a received payload string, shared by the legacy source and the transport port. */
  private chargePayloadBytes(payload: string) {
    const bytes = Buffer.byteLength(payload, 'utf8');
    this.payloadBytes += bytes;
    if (this.payloadBytes > this.limits.totalPayloadBytes) { this.stop('payload_budget_exceeded'); this.check(); }
    if (bytes > this.limits.payloadBytes) throw new BoundedReadError('payload_limit');
  }
}
