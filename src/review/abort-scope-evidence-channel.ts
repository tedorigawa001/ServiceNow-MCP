/** Synthetic channel only. No worker, source, timer, I/O or production completion authority. */
import { z } from 'zod';
import { SCOPE_PROTOCOL, SCOPE_WIRE_LIMITS, scopeWireLimit, scopeRequestSchema, scopeResponseSchema,
  scopeAssetRejectionSchema, scopeDiagnosticSchema, type ScopeRequest, type ScopeResponse, type ScopeDiagnostic } from './abort-scope-evidence-protocol.js';
type Code = ScopeDiagnostic['code'];
type Stage = ScopeDiagnostic['stage'];
type Result<T> = Readonly<{ ok: true; value: T } | { ok: false; diagnostic: ScopeDiagnostic }>;
declare const peerBrand: unique symbol;
export type SyntheticScopePeer = { readonly [peerBrand]: true };
const configSchema = z.strictObject({ run_nonce: z.string().regex(/^[a-f0-9]{64}$/), worker_generation: z.string().regex(/^[a-f0-9]{64}$/) });
const stageFor = (kind: ScopeRequest['kind']): Stage => kind === 'hello' ? 'protocol'
  : kind === 'observe_initial' ? 'initial' : kind === 'observe_final' ? 'final' : kind;

/** The caller supplies fixture identity only; scalar matches are NOT real-session/worker proof. */
export function createSyntheticScopeChannel(rawConfig: unknown) {
  const config = (() => { try { return configSchema.parse(rawConfig); } catch { throw new Error('invalid_input'); } })();
  const peer = Object.freeze(Object.create(null)) as SyntheticScopePeer;
  type Job = { phase: 'prepared' | 'initial' | 'final' | 'done'; plan?: Extract<ScopeResponse, {kind:'prepare_ok'}>['body'] };
  const jobs = new Map<number, Job>();
  const assets = new Set<string>();
  const assetFailures = new Map<number, Readonly<{ stage: 'prepare'; code: z.infer<typeof scopeAssetRejectionSchema> }>>();
  let ready = false, sequence = 0, planBytes = 0, sites = 0;
  let pending: ScopeRequest | undefined;
  let primary: { stage: Stage; code: Code } | undefined;
  let runBinding: { instance: string; updateSet: string; startedAt: string; deadline: number } | undefined;
  let cleanup: ScopeDiagnostic['cleanup'] = 'not_started';
  function diagnostic(): ScopeDiagnostic | null {
    return primary ? Object.freeze({ state: 'stopped', ...primary, cleanup }) : null;
  }
  function stop(stage: Stage, code: Code): Result<never> {
    primary ??= { stage, code }; pending = undefined; jobs.clear(); assets.clear();
    return Object.freeze({ ok: false, diagnostic: diagnostic()! });
  }
  function unavailable(): Result<never> { return stop(primary!.stage, primary!.code); }
  function matchesPlan(request: Extract<ScopeRequest, {kind:'observe_initial'|'observe_final'|'compare'}>, job: Job) {
    const p = job.plan;
    return p?.state === 'needs_observation' && p.payload_hash === request.body.payload_hash && p.code_hash === request.body.code_hash;
  }
  return Object.freeze({
    peer,
    begin(kind: ScopeRequest['kind'], jobId: number | null, body: unknown): Result<string> {
      if (primary) return unavailable();
      try {
      if (pending || sequence >= Number.MAX_SAFE_INTEGER) return stop('protocol', 'protocol_invalid');
      const parsed = scopeRequestSchema.safeParse({ protocol: SCOPE_PROTOCOL, ...config, request_id: ++sequence,
        job_id: jobId, kind, body });
      // Synthetic object inputs may contain getters; do not dispatch after reentrant invalidation/start.
      if (primary) return unavailable();
      if (pending) return stop('protocol', 'protocol_invalid');
      if (!parsed.success) return stop('protocol', 'protocol_invalid');
      const request = parsed.data, stage = stageFor(request.kind);
      const wire = JSON.stringify(request);
      if (Buffer.byteLength(wire) > scopeWireLimit(request.kind)) return stop(stage, 'scope_evidence_limit');
      if (request.kind === 'hello') {
        if (ready || jobs.size) return stop('protocol', 'invalid_state');
      } else {
        if (!ready) return stop('protocol', 'invalid_state');
        if (request.kind === 'prepare') {
          if (jobs.has(request.job_id) || assets.has(request.body.target.update_xml_sys_id)) return stop(stage, 'invalid_state');
          if (jobs.size >= 100) return stop(stage, 'scope_evidence_limit');
          if (request.body.metadata.name !== `sys_script_${request.body.target.asset_sys_id}`
            || Date.parse(request.body.retrieved_at) < Date.parse(request.body.started_at)
            || Date.parse(request.body.retrieved_at) >= Date.parse(request.body.started_at) + request.body.deadline_ms)
            return stop(stage, 'evidence_binding_mismatch');
          const b = { instance: request.body.instance_binding, updateSet: request.body.target.update_set_sys_id,
            startedAt: request.body.started_at, deadline: request.body.deadline_ms };
          if (runBinding && JSON.stringify(b) !== JSON.stringify(runBinding)) return stop(stage, 'evidence_binding_mismatch');
          runBinding ??= b;
          assets.add(request.body.target.update_xml_sys_id);
          jobs.set(request.job_id, { phase: 'prepared' });
        } else {
          const job = jobs.get(request.job_id);
          const expected = request.kind === 'observe_initial' ? 'prepared' : request.kind === 'observe_final' ? 'initial' : 'final';
          if (!job || job.phase !== expected || !matchesPlan(request, job)) return stop(stage, 'evidence_binding_mismatch');
          if (request.kind !== 'compare') {
            const o = request.body.observation, phase = request.kind === 'observe_initial' ? 'initial' : 'final';
            if (o.phase !== phase) return stop(stage, 'invalid_phase_order');
            const collection = job.plan?.state === 'needs_observation' ? job.plan.collection : undefined;
            if (o.state === 'rows' && o.rows.some(row => row.name !== collection)) return stop(stage, 'table_binding_mismatch');
          }
        }
      }
      pending = request; return Object.freeze({ ok: true, value: wire });
      } catch { return stop('protocol', 'protocol_invalid'); }
    },
    receive(from: SyntheticScopePeer, wire: unknown): Result<true> {
      if (primary) return unavailable(); // Late messages cannot replace the terminal diagnosis.
      if (from !== peer || !pending || typeof wire !== 'string' || wire.length > SCOPE_WIRE_LIMITS.response
        || Buffer.byteLength(wire) > SCOPE_WIRE_LIMITS.response) return stop('protocol', 'protocol_invalid');
      let response: ScopeResponse;
      try {
        const parsed = scopeResponseSchema.safeParse(JSON.parse(wire));
        if (!parsed.success) return stop('protocol', 'protocol_invalid');
        response = parsed.data;
      } catch { return stop('protocol', 'protocol_invalid'); }
      const req = pending;
      if (Buffer.byteLength(wire) > scopeWireLimit(response.kind) || response.run_nonce !== config.run_nonce
        || response.worker_generation !== config.worker_generation || response.request_id !== req.request_id
        || response.job_id !== req.job_id) return stop('protocol', 'protocol_invalid');
      if (response.kind === 'error') {
        const stage = stageFor(req.kind), code = response.body.code;
        if (response.body.stage !== stage || req.kind === 'hello' && code !== 'internal_review_error'
          || req.kind !== 'prepare' && scopeAssetRejectionSchema.safeParse(code).success) return stop('protocol', 'protocol_invalid');
        pending = undefined;
        const rejected = scopeAssetRejectionSchema.safeParse(code);
        if (req.kind === 'prepare' && rejected.success) {
          jobs.get(req.job_id)!.phase = 'done'; assetFailures.set(req.job_id, Object.freeze({ stage: 'prepare', code: rejected.data }));
        }
        else return stop(stage, code);
        return Object.freeze({ ok: true, value: true });
      }
      if (response.kind !== `${req.kind}_ok`) return stop('protocol', 'protocol_invalid');
      if (response.kind === 'hello_ok') ready = true;
      else if (response.kind === 'prepare_ok' && req.kind === 'prepare') {
        if (JSON.stringify(response.body.target) !== JSON.stringify(req.body.target)) return stop('prepare', 'evidence_binding_mismatch');
        planBytes += Buffer.byteLength(wire);
        if (response.body.state === 'needs_observation') sites += response.body.sites.length;
        if (planBytes > SCOPE_WIRE_LIMITS.planTotal || sites > 100) return stop('prepare', 'scope_evidence_limit');
        jobs.set(req.job_id, { phase: response.body.state === 'not_needed' ? 'done' : 'prepared', plan: response.body });
      } else if (response.kind === 'observe_initial_ok' && req.kind === 'observe_initial') jobs.get(req.job_id)!.phase = 'initial';
      else if (response.kind === 'observe_final_ok' && req.kind === 'observe_final') jobs.get(req.job_id)!.phase = 'final';
      else if (response.kind === 'compare_ok' && req.kind === 'compare') {
        if (response.body.payload_hash !== req.body.payload_hash || response.body.code_hash !== req.body.code_hash)
          return stop('compare', 'evidence_binding_mismatch');
        jobs.set(req.job_id, { phase: 'done' });
      } else return stop('protocol', 'protocol_invalid');
      pending = undefined; return Object.freeze({ ok: true, value: true });
    },
    invalidate(raw: unknown): Result<never> {
      if (primary) return unavailable();
      try {
      const parsed = scopeDiagnosticSchema.omit({ state: true, cleanup: true }).safeParse(raw);
      return parsed.success ? stop(parsed.data.stage, parsed.data.code) : stop('protocol', 'protocol_invalid');
      } catch { return stop('protocol', 'protocol_invalid'); }
    },
    finishCleanup(value: 'confirmed' | 'unconfirmed'): Result<never> {
      if (value !== 'confirmed' && value !== 'unconfirmed') return stop('protocol', 'protocol_invalid');
      if (cleanup !== 'unconfirmed') cleanup = value;
      if (!primary) return stop('output', 'invalid_state');
      return unavailable();
    },
    diagnostic,
    assetDiagnostic(jobId: number) { return assetFailures.get(jobId) ?? null; },
  });
}
