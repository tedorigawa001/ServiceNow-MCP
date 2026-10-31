/** Isolated, read-only transport. Never uses the legacy client's retries, logging or body readers. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import type { ServiceNowConfig } from './types.js';
import { pinReviewReleaseConfig } from './review-release-config.js';
import { registerReviewEvidenceSession, type ReviewRunBudgetLease, type ReviewSourceReleaseSnapshot } from './review-evidence-lifecycle.js';
import {BoundedUpdateSetSource,parseBoundedSourceInput,type CompositionSourceConstruction} from '../review/bounded-source.js';
import {createCanonicalReviewBudget,CanonicalBudgetError} from './review-canonical-budget.js';
import {createReviewBootstrapContract} from './review-bootstrap-contract.js';
import {pinCompositionFakeIO,type CompositionFakeIO} from './review-composition-fake-io.js';

export const BOUNDED_LIMITS = Object.freeze({ responseBytes: 4 * 1024 * 1024, totalBytes: 16 * 1024 * 1024,
  payloadBytes: 2 * 1024 * 1024, totalPayloadBytes: 8 * 1024 * 1024,
  deadlineMs: 60000, requestTimeoutMs: 10000, requests: 210, retryDelayMs: 250 });
export type ReadFailureCode = 'invalid_input' | 'authentication_failed' | 'access_denied' | 'not_found_or_not_visible'
  | 'upstream_unavailable' | 'deadline_exceeded' | 'receive_budget_exceeded' | 'request_budget_exceeded'
  | 'payload_budget_exceeded' | 'payload_limit' | 'invalid_response' | 'review_busy' | 'cancelled' | 'closed' | 'changed_during_review' | 'release_not_admitted' | 'config_invalid' | 'phase_deadline_exceeded' | 'candidate_filter_violation' | 'internal_review_error';
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
type CompositionOptions=Pick<BoundedReadOptions,'signal'|'limits'>;
type CompositionSummary=Readonly<{auth_ready:boolean;ready_generation:number;budget:Readonly<{requests:number;received_bytes:number;payload_bytes:number}>;phase_reserve_ms:number;dispatch:'unavailable';evidence_issuance:'disabled';reserved:0;cleanup:'closed'}>;
type ConstructorSummary=CompositionSummary&Readonly<{state:'constructor_bound';initial_source:'bound';transport_claim:'claimed'}>;
type PreparedSummary=CompositionSummary&ReviewSourceReleaseSnapshot&Readonly<{state:'prepared_only';fake_io:true}>;
let active = 0;
const principals = new Set<string>();
const snapshotKeys = new Set(['instanceUrl', 'authMode', 'perUserBearerToken', 'oauth', 'accessToken', 'tokenExpiry', 'reviewReleaseConfig', 'reviewReleaseConfigProvider']);
const oauthKeys = new Set(['clientId', 'clientSecret', 'username', 'password']);
/** Copy a caller-supplied object once from plain data properties: a getter or proxy could answer validation and storage differently. */
function pinDataObject(raw: unknown, keys: Set<string>): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) throw new BoundedReadError('invalid_input');
  const fields = Object.getOwnPropertyDescriptors(raw), pinned: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(fields)) {
    const field = Reflect.get(fields, key) as PropertyDescriptor;
    if (typeof key !== 'string' || !keys.has(key) || !Object.hasOwn(field, 'value')) throw new BoundedReadError('invalid_input');
    pinned[key] = field.value;
  }
  return pinned;
}
let sourceConstructionClaim:(session:unknown,key:object,source:BoundedUpdateSetSource)=>boolean=()=>false;
/** Immutable ESM friend function: boolean consumption only, never a registration or mutable-port getter. */
export function claimPrivateCompositionSource(session:unknown,key:object,source:BoundedUpdateSetSource){return sourceConstructionClaim(session,key,source);}

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
  readonly #snapshot: ReadSnapshot;
  readonly #runLease: ReviewRunBudgetLease;
  readonly #runOwner: ReturnType<typeof registerReviewEvidenceSession>;
  private token?: string;
  private readyPromise?: Promise<void>;
  readonly #budget:ReturnType<typeof createCanonicalReviewBudget>;
  #stopPropagated=false;
  #compositionStarted=false;
  #compositionKey?:object;
  #compositionSource?:BoundedUpdateSetSource;
  #compositionRevoke?:()=>void;
  private get stopCode(){return this.#budget.view.failure()??undefined;}
  private disposed = false;
  private busy = false;
  private readonly removeExternal: () => void;
  readonly releasePolicy: ReturnType<typeof pinReviewReleaseConfig>;

  /** Fixed new-run boundary. The opt-in lane accepts bounded fake bytes, never a fetch or source callback. */
  static prepareNewReviewComposition(snapshot:ReadSnapshot,input:unknown,options:CompositionOptions&{synthetic_io:CompositionFakeIO}):Promise<PreparedSummary>;
  static prepareNewReviewComposition(snapshot:ReadSnapshot,input:unknown,options?:CompositionOptions):ConstructorSummary;
  static prepareNewReviewComposition(snapshot:ReadSnapshot,input:unknown,options:CompositionOptions&{synthetic_io?:CompositionFakeIO}={}):ConstructorSummary|Promise<PreparedSummary>{
    let session:BoundedReadSession|undefined;
    let fake:ReturnType<typeof pinCompositionFakeIO>|undefined;
    try{
      if(!options||typeof options!=='object')throw new BoundedReadError('invalid_input');
      const fields=Object.getOwnPropertyDescriptors(options);
      if(Reflect.ownKeys(fields).some(k=>k!=='signal'&&k!=='limits'&&k!=='synthetic_io'||!Object.hasOwn(Reflect.get(fields,k)!,'value')))
        throw new BoundedReadError('invalid_input');
      const signal=fields.signal?.value as AbortSignal|undefined,limits=fields.limits?.value as BoundedReadOptions['limits'];
      if(signal!==undefined){
        try{
          // Reject signal-shaped callbacks before the ordinary constructor allocates admission/timers.
          if(Object.getPrototypeOf(signal)!==AbortSignal.prototype||['addEventListener','removeEventListener','aborted'].some(k=>Object.hasOwn(signal,k)))throw Error();
          Reflect.apply(Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!,signal,[]);
        }catch{throw new BoundedReadError('invalid_input');}
      }
      const pinned=pinDataObject(snapshot,snapshotKeys);
      const fixed=Object.freeze({...pinned,oauth:Object.freeze(pinDataObject(pinned.oauth,oauthKeys))}) as unknown as ReadSnapshot;
      const parsed=parseBoundedSourceInput(input);
      if(fields.synthetic_io){try{fake=pinCompositionFakeIO(fields.synthetic_io.value);}catch{throw new BoundedReadError('invalid_input');}}
      // The class and source are fixed, not caller-supplied factories. No later mode switch or registry lookup.
      session=new BoundedReadSession(fixed,{signal,limits,fetch:()=>{throw new BoundedReadError('internal_review_error');}});
      if(fake){
        const owned=session,io=fake;session=undefined;fake=undefined;
        return owned.#prepareCompositionIO(parsed,io).then(value=>{owned.#close();return Object.freeze({...value,reserved:0 as const,cleanup:'closed' as const});},error=>{throw error instanceof BoundedReadError?error:new BoundedReadError('internal_review_error');}).finally(()=>{io.dispose();owned.#close();});
      }
      const bound=session.#prepareComposition(parsed);
      session.#close();
      return Object.freeze({...bound,reserved:0 as const,cleanup:'closed' as const});
    }catch(error){
      throw error instanceof BoundedReadError?error:new BoundedReadError('internal_review_error');
    }finally{fake?.dispose();if(session)session.#close();}
  }

  static {
    sourceConstructionClaim=(session:unknown,key:object,source:BoundedUpdateSetSource):boolean=>{
    if(!key||typeof key!=='object'||!session||typeof session!=='object'||types.isProxy(session)||!(#compositionKey in session)||!session.#compositionKey||session.#compositionKey!==key||session.#compositionSource||!session.#compositionStarted||session.disposed||session.#stopPropagated)return false;
    session.#compositionSource=source;return true;
    };
  }

  #prepareComposition(input:ReturnType<typeof parseBoundedSourceInput>){
    const scope=this.#openComposition(input);
    try{
      scope.accounting.reserve();this.#checkComposition();
      const status=this.#runOwner.inspect(this.#snapshot,this.#runLease);this.#checkComposition();
      if(status.transport_claim!=='claimed')throw new BoundedReadError('internal_review_error');
      return Object.freeze({...scope.bound,auth_ready:status.auth_ready,ready_generation:status.ready_generation,
        transport_claim:'claimed' as const,budget:this.#budget.view.stats(),phase_reserve_ms:this.reserveMs,dispatch:'unavailable' as const});
    }catch(error){throw this.#adopt(error);}finally{scope.accounting.release();}
  }
  #openComposition(input:ReturnType<typeof parseBoundedSourceInput>,creation?:CompositionSourceConstruction){
    if(this.#compositionStarted)throw new BoundedReadError('internal_review_error');
    this.#compositionStarted=true;
    let accounting:ReturnType<ReturnType<typeof createCanonicalReviewBudget>['construction']['takeBootstrapAccounting']>|undefined;
    try{
      this.#checkComposition();
      // One phase value, not a second bootstrap cutoff. No I/O phase timer is armed in this stage.
      this.reserveMs=Math.min(10000,this.limits.deadlineMs/6);
      const source=new BoundedUpdateSetSource(this,input,creation);
      const claim=this.#runOwner.transportConstructor.claim(this.#snapshot,this.#runLease);
      if(!claim.ok){this.#syncRunFailure();throw new BoundedReadError(this.stopCode??'internal_review_error');}
      const bound=this.#runOwner.transportConstructor.bindInitialSource(claim.value,this.#snapshot,this.#runLease,source);
      if(!bound.ok){this.#syncRunFailure();throw new BoundedReadError(this.stopCode??'internal_review_error');}
      const statusBinding=this.#runOwner.transportConstructor.claimStatusBinding(claim.value,this.#snapshot,this.#runLease,source);
      if(!statusBinding.ok){this.#syncRunFailure();throw new BoundedReadError(this.stopCode??'internal_review_error');}
      accounting=this.#budget.construction.takeBootstrapAccounting();
      return {source,handle:claim.value,accounting,bound:bound.value,statusBinding:statusBinding.value};
    }catch(error){accounting?.release();throw this.#adopt(error);}
  }
  async #prepareCompositionIO(input:ReturnType<typeof parseBoundedSourceInput>,fake:ReturnType<typeof pinCompositionFakeIO>){
    const key=Object.freeze({});this.#compositionKey=key;
    const acks=new WeakMap<object,{purpose:'parent'|'release';value:unknown}>();let consumer:Parameters<CompositionSourceConstruction['capture']>[0]|undefined;
    const guard=()=>{if(this.#compositionKey!==key)throw new BoundedReadError(this.stopCode??'closed');this.#checkComposition();};
    const mint=(purpose:'parent'|'release',value:unknown)=>{guard();const ack=Object.freeze({});acks.set(ack,{purpose,value});return ack;};
    const scope=this.#openComposition(input,{key,check:guard,take:(ack,purpose)=>{guard();const value=acks.get(ack);acks.delete(ack);if(!value||value.purpose!==purpose)throw new BoundedReadError('internal_review_error');return value.value;},capture:c=>{if(consumer)throw new BoundedReadError('internal_review_error');consumer=c;}});
    let contract:ReturnType<typeof createReviewBootstrapContract<typeof scope.handle>>|undefined;
    try{
      guard();if(!consumer||this.#compositionSource!==scope.source)throw new BoundedReadError('internal_review_error');
      const statusContext=scope.statusBinding.inspect(scope.handle,this.#snapshot,this.#runLease,scope.source);
      if(!statusContext.ok){this.#syncRunFailure();throw new BoundedReadError(this.stopCode??'internal_review_error');}
      const auth=this.authMode==='per-user'?'per-user':this.#snapshot.accessToken&&(this.#snapshot.tokenExpiry??0)>Date.now()+this.limits.deadlineMs?'cached':'exchange';
      if(!fake.matches(auth==='exchange'))throw new BoundedReadError('invalid_input');
      const stop=(code:unknown)=>{this.#runOwner.revoke(code);this.#budget.writer.stop(code);this.stop(this.stopCode??'internal_review_error');};
      contract=createReviewBootstrapContract({lease:this.#runLease,phaseReserveMs:this.reserveMs,sample:()=>this.#runLease.read(),check:(h,s,l)=>this.#runOwner.transportConstructor.inspect(h,s,l),
        ready:()=>this.#runOwner.markReady(this.#snapshot,this.#runLease),acceptParent:r=>{guard();if(r.status!==200)throw new BoundedReadError('invalid_response');consumer!.parent(mint('parent',r.value));guard();},
        bind:(s,p,port)=>this.#runOwner.inspectSource(this.#snapshot,this.#runLease,s,p,port)!==null,
        prepared:(h,s,l,source,p,port)=>this.#runOwner.transportConstructor.inspectPrepared(h,s,l,source,p,port),stop,failure:()=>this.#runOwner.failure(),
      },{fake_io:true,typed_body:true,native_body:true,lease:this.#runLease,source:scope.source,target:input.update_set_sys_id,auth,
        limits:{requests:this.limits.requests,total_bytes:this.limits.totalBytes,response_bytes:this.limits.responseBytes,deadline_ms:this.limits.deadlineMs},accounting:scope.accounting,
        dispatch:(r,signal)=>fake.dispatch(r,signal),schedule:(ms,wake)=>{const timer=setTimeout(wake,ms);return ()=>clearTimeout(timer);},
        resolveRelease:async r=>{guard();
          // Only the fixed-200 transcript is adopted; a 403 must never reach the C-mode fallback through a missing body.
          if(r.status!==200)throw new BoundedReadError('invalid_response');const decision=await consumer!.release(mint('release',r.value));guard();if(decision.release_match!=='matched')return null;const port=BoundedUpdateSetSource.releasePortFor(scope.source,this,decision.permit);if(!port)throw new BoundedReadError('internal_review_error');return {source:scope.source,permit:decision.permit,port};},
      });
      this.#compositionRevoke=()=>{this.#compositionKey=undefined;consumer?.revoke();contract?.revoke();};
      const result=await contract.run(scope.handle,this.#snapshot,this.#runLease);
      if(!result.ok)throw new BoundedReadError(this.stopCode??(['invalid_state','invalid_observation_time','evidence_binding_mismatch'].includes(result.code)?'internal_review_error':result.code as ReadFailureCode));
      guard();const status=this.#runOwner.inspect(this.#snapshot,this.#runLease);guard();
      return Object.freeze({...result.value,fake_io:true as const,auth_ready:status.auth_ready,ready_generation:status.ready_generation,budget:this.#budget.view.stats(),phase_reserve_ms:this.reserveMs});
    }finally{this.#compositionKey=undefined;consumer?.revoke();contract?.revoke();scope.accounting.release();this.#compositionRevoke=undefined;}
  }
  #checkComposition(){
    this.#syncRunFailure();
    const sample=this.#runLease.read(),failure=this.#budget.view.failure();
    if(failure)throw this.#adopt(new CanonicalBudgetError(failure));
    if(this.disposed)throw new BoundedReadError('closed');
    if(sample.remaining_ms<=this.reserveMs)throw new BoundedReadError('phase_deadline_exceeded');
  }

  constructor(snapshot: ReadSnapshot, options: BoundedReadOptions = {}) {
    this.#snapshot = { ...snapshot, oauth: { ...snapshot.oauth } };
    this.limits = { ...BOUNDED_LIMITS };
    for (const [key, value] of Object.entries(options.limits ?? {})) {
      if (!(key in BOUNDED_LIMITS) || !Number.isInteger(value) || value! < 1 || value! > BOUNDED_LIMITS[key as keyof typeof BOUNDED_LIMITS]) {
        throw new BoundedReadError('invalid_input');
      }
      this.limits[key as keyof typeof BOUNDED_LIMITS] = value!;
    }
    // Validate and key the stored copy, never the caller's object again.
    const copy = this.#snapshot;
    let url: URL;
    try { url = new URL(copy.instanceUrl); } catch { throw new BoundedReadError('invalid_input'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
      throw new BoundedReadError('invalid_input');
    }
    this.baseUrl = url.origin;
    try { this.releasePolicy = pinReviewReleaseConfig(copy.reviewReleaseConfigProvider
      ? copy.reviewReleaseConfigProvider() : copy.reviewReleaseConfig, this.baseUrl, this.startedAt, this.limits.deadlineMs); }
    catch { throw new BoundedReadError('config_invalid'); }
    if (copy.authMode === 'impersonation') throw new BoundedReadError('authentication_failed');
    this.authMode = copy.authMode === 'per-user' ? 'per-user' : 'service-account';
    if (this.authMode === 'per-user' && !copy.perUserBearerToken) throw new BoundedReadError('authentication_failed');
    // Credential-key admission, not a stable user ID: rotated per-user tokens count as distinct keys.
    this.principalKey = createHash('sha256').update(JSON.stringify([this.baseUrl, this.authMode,
      this.authMode === 'per-user' ? copy.perUserBearerToken : [copy.oauth.clientId, copy.oauth.username ?? '']])).digest('hex');
    if (active >= 2 || principals.has(this.principalKey)) throw new BoundedReadError('review_busy');
    this.#budget=createCanonicalReviewBudget({clock:{remainingMs:()=>Math.max(0,this.limits.deadlineMs-(performance.now()-this.started))},limits:{requests:this.limits.requests,totalBytes:this.limits.totalBytes,payloadBytes:this.limits.payloadBytes,totalPayloadBytes:this.limits.totalPayloadBytes,deadlineMs:this.limits.deadlineMs}});
    active++; principals.add(this.principalKey);
    this.#runLease=Object.freeze({read:()=>{
      try{return this.#budget.view.lease.read();}catch(error){throw this.#adopt(error,'internal_review_error');}
    }});
    this.#runOwner=registerReviewEvidenceSession(this,this.#snapshot,this.#runLease);
    this.fetcher = options.fetch ?? ((...args) => globalThis.fetch(...args));
    this.timer = setTimeout(() => this.stop('deadline_exceeded'), Math.max(0, this.limits.deadlineMs - (performance.now() - this.started)));
    const cancel = () => this.stop('cancelled');
    const external = options.signal;
    external?.addEventListener('abort', cancel, { once: true });
    this.removeExternal = () => external?.removeEventListener('abort', cancel);
    if (external?.aborted) cancel();
  }

  stats() { return {...this.#budget.view.stats()}; }
  #account(operation:()=>void){
    try{operation();}catch(error){throw this.#adopt(error);}
  }
  /** Core stops reach the owner with their internal reason first; only the session sees the public mapping. */
  #adopt(error:unknown,fallback?:ReadFailureCode){
    if(!(error instanceof CanonicalBudgetError))return error;
    const primary=this.#budget.view.diagnostic().primary;
    if(primary)this.#runOwner.revoke(primary.internal);
    const reason=this.#budget.view.failure()??fallback;
    if(reason)this.stop(reason);
    return new BoundedReadError(error.code);
  }
  /** Fixed readonly diagnostics only: no handles, credentials, lease or activation authority. */
  reviewRunStatus() {
    const status=this.#runOwner.inspect(this.#snapshot,this.#runLease);
    this.#syncRunFailure();return status;
  }
  /** Prepared release binding only; the concrete source verifies its own private permit/port. */
  bindReviewReleaseSource(source:BoundedUpdateSetSource,permit:object){
    this.check();const port=BoundedUpdateSetSource.releasePortFor(source,this,permit);
    if(!port){this.#runOwner.rejectSource();this.#syncRunFailure();throw new BoundedReadError(this.stopCode??'internal_review_error');}
    const bound=this.#runOwner.bindSource(this.#snapshot,this.#runLease,source,permit,port);
    this.#syncRunFailure();if(!bound)throw new BoundedReadError(this.stopCode??'internal_review_error');
  }
  reviewReleaseSourceStatus(source:BoundedUpdateSetSource,permit:object){
    const port=BoundedUpdateSetSource.releasePortFor(source,this,permit);
    if(!port)this.#runOwner.rejectSource();
    const result=port?this.#runOwner.inspectSource(this.#snapshot,this.#runLease,source,permit,port):null;
    this.#syncRunFailure();if(!result)throw new BoundedReadError(this.stopCode??(this.disposed?'closed':'internal_review_error'));return result;
  }
  #syncRunFailure(){
    const reason=this.#runOwner.failure();
    if(reason&&!this.#stopPropagated&&!this.disposed){this.#budget.writer.stop(reason);this.stop(this.stopCode!);}
  }
  /** Monotonic run budget, also usable for safe CPU finalization after an HTTP stop. */
  remainingMs() { return Math.max(0, this.limits.deadlineMs - (performance.now() - this.started)); }
  get deadlineMs() { return this.limits.deadlineMs; }
  phaseRemainingMs() { return Math.max(0, this.remainingMs() - this.reserveMs); }
  /** Internal phase boundary only. Never extends the original hard deadline. */
  setPhaseReserve(reserveMs: number) {
    if (!Number.isFinite(reserveMs) || reserveMs < 0 || reserveMs >= this.limits.deadlineMs || this.busy || this.disposed) {
      throw new BoundedReadError('invalid_input');
    }
    clearTimeout(this.phaseTimer);
    this.phase = new AbortController(); this.reserveMs = reserveMs;
    if (reserveMs > 0) this.phaseTimer = setTimeout(() => this.phase.abort(), this.phaseRemainingMs());
  }
  assertActive() { this.check(); }
  private stop(code: ReadFailureCode) {
    this.#budget.writer.stop(code);
    if(this.#stopPropagated)return;
    this.#stopPropagated=true;
    this.#runOwner.revoke(this.stopCode!);
    this.#compositionRevoke?.();
    this.controller.abort();
  }
  private check() {
    if(this.#compositionKey){this.#checkComposition();return;}
    this.#syncRunFailure();
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
    this.#close();
  }
  #close() {
    if (this.disposed) return;
    this.#compositionRevoke?.();this.#compositionKey=undefined;this.#compositionSource=undefined;
    this.#runOwner.close(this.stopCode ?? 'closed');
    this.#budget.writer.close();
    this.disposed = true; clearTimeout(this.timer); clearTimeout(this.phaseTimer); this.removeExternal();
    this.phase.abort();
    this.controller.abort(); active--; principals.delete(this.principalKey);
    this.token = undefined;
    // A closed snapshot must not retain per-user credentials after its owner
    // revokes an R-2 session. This snapshot is an isolated copy, not user config.
    this.#snapshot.perUserBearerToken = undefined;
    this.#snapshot.accessToken = undefined;
  }
  private async attempt(path: string, init: RequestInit, final: boolean): Promise<{ status: number; value?: unknown }> {
    this.check();
    // Four attempts remain reserved for final parent + metadata verification (including retries).
    const prior=this.#budget.view.stats();
    if (prior.requests >= this.limits.requests - (final ? 0 : 4)) throw new BoundedReadError('request_budget_exceeded');
    if (prior.received_bytes >= this.limits.totalBytes) { this.stop('receive_budget_exceeded'); this.check(); }
    this.#account(()=>this.#budget.writer.dispatch(final));
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
        this.#account(()=>this.#budget.writer.chunk(chunk.value.byteLength));
        if (size > this.limits.responseBytes) {
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
    if (this.authMode === 'per-user') { this.token = this.#snapshot.perUserBearerToken; return; }
    if (this.#snapshot.accessToken && (this.#snapshot.tokenExpiry ?? 0) > Date.now() + this.limits.deadlineMs) {
      this.token = this.#snapshot.accessToken; return;
    }
    const oauth = this.#snapshot.oauth;
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
    if (!/^\/api\/now\/table\/(sys_update_set|sys_cluster_state|sys_update_xml)(\/[^/?]+)?\?/.test(path)) throw new BoundedReadError('invalid_input');
    if (this.busy) throw new BoundedReadError('review_busy');
    this.busy = true;
    try {
      this.readyPromise ??= this.authenticate().then(() => {
        if(!this.#runOwner.markReady(this.#snapshot,this.#runLease)){this.#syncRunFailure();this.check();throw new BoundedReadError('internal_review_error');}
      }, error => {
        this.#runOwner.revoke(error instanceof BoundedReadError ? error.code : 'internal_review_error','authentication');
        throw error;
      });
      await this.readyPromise; this.check();
      return await this.request(path, { method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${this.token}` } }, final);
    } finally { this.busy = false; }
  }
  chargePayload(payload: string) {
    this.check();
    this.chargePayloadBytes(payload);
  }
  /** One charge of a received payload string at the source boundary. */
  private chargePayloadBytes(payload: string) {
    this.#account(()=>this.#budget.writer.payload(payload));
  }
}
