/** Internal BP-5 orchestration only. No MCP registration, logging, persistence or live-record fallback. */
import { z } from 'zod';
import type { ServiceNowClient } from '../servicenow/client.js';
import { BoundedReadError, type BoundedReadOptions, type BoundedReadSession } from '../servicenow/bounded-read.js';
import { BoundedUpdateSetSource, type ReviewMetadata } from './bounded-source.js';
import type { AnyAggregateReview as AggregateReview } from './aggregate-schema.js';
import { selectionModeSchema, targetSelection, TARGET_LIMITATIONS } from './target-selection.js';
import { bp5RuleIdsSchema, bp5RulesetFor } from './result-schema-v2.js';
import { CATALOG_VERSION, RULES } from './catalog.js';
import { ReviewWorker, ReviewWorkerError, type ReviewWorkerFactory } from './worker-supervisor.js';

export const reviewUpdateSetInputSchema = z.strictObject({ update_set_sys_id: z.string().regex(/^[a-f0-9]{32}$/),
  selection_mode: selectionModeSchema.optional(),
  max_records: z.number().int().min(1).max(100).default(20),
  requested_rule_ids: bp5RuleIdsSchema.refine(ids => new Set(ids).size === ids.length)
    .default(['AU-BR-001', 'AU-BR-002', 'AU-CL-004']),
});
type Stage = AggregateReview['errors'][number]['stage'];
type ErrorCode = AggregateReview['errors'][number]['code'] | 'review_busy' | 'cancelled' | 'worker_unavailable';
type Asset = AggregateReview['assets'][number];
export type BoundedReviewOutcome = { isError: false; result: AggregateReview }
  | { isError: true; error: { stage: Stage; code: ErrorCode }; result?: AggregateReview };
const fail = (stage: Stage, code: ErrorCode): BoundedReviewOutcome => ({ isError: true, error: { stage, code } });
function addError(run: AggregateReview, error: AggregateReview['errors'][number]) {
  if (run.errors.length < 100) {
    if (error.code === 'candidate_filter_violation') {
      if (run.schema_version !== 'bp-mcp-review-0.3') throw new Error('internal_review_error');
      run.errors.push(error);
    } else run.errors.push({ ...error, code: error.code });
  }
  else if (!run.limitations.includes('error_details_truncated')) run.limitations.push('error_details_truncated');
}

function classify(row: ReviewMetadata, rules: AggregateReview['coverage']['requested_rule_ids']): Asset | undefined {
  const base = { update_xml_sys_id: row.sys_id };
  if (row.action === 'DELETE') return { ...base, state: 'skipped_deleted', reason: 'deleted_asset' };
  if (row.action !== 'INSERT_OR_UPDATE') return { ...base, state: 'rejected', reason: 'unsupported_action' };
  const table = /^([a-z][a-z0-9_]*)_[a-f0-9]{32}$/.exec(row.name)?.[1];
  // Dictionary/Choice updates use composite names, not table_sys_id. Validate
  // identity syntax only for target-like names; retain known non-target table IDs
  // (including sys_script_include, which overlaps the BR prefix) as unsupported.
  if (!table && (row.name.startsWith('sys_script_') || row.name.startsWith('sys_script_client_'))) {
    return { ...base, state: 'rejected', reason: 'identity_mismatch' };
  }
  const type = table === 'sys_script' ? 'business_rule' : table === 'sys_script_client' ? 'client_script' : 'other';
  if (type === 'other') return { ...base, state: 'not_applicable', asset_type: type, reason: 'asset_type_unsupported' };
  if (!rules.some(id => RULES.find(r => r.rule_id === id)!.asset_types.includes(type))) {
    return { ...base, state: 'not_applicable', asset_type: type, reason: 'no_requested_rules' };
  }
  return undefined;
}

/** Trusted OS/transport boundary injection only; never tool input. */
export interface ReviewAdapterOptions extends BoundedReadOptions { workerFactory?: ReviewWorkerFactory }
interface Execution { session?: BoundedReadSession; cpu?: ReviewWorker; stage: () => Stage }
export async function reviewBoundedUpdateSet(client: ServiceNowClient, raw: unknown,
  options?: ReviewAdapterOptions): Promise<BoundedReviewOutcome> {
  const execution: Execution = { stage: () => 'input' };
  let outcome: BoundedReviewOutcome;
  try { outcome = await executeReview(client, raw, execution, options); }
  catch { outcome = fail(execution.stage(), 'internal_review_error'); }
  try { await execution.cpu?.close(); }
  catch { outcome = fail('output', 'internal_review_error'); }
  finally { execution.session?.close(); }
  // Include worker termination/cleanup in the same admission and run budget.
  if (execution.session && execution.session.remainingMs() <= 0) return fail(execution.stage(), 'deadline_exceeded');
  if (execution.session && options?.signal?.aborted) return fail(execution.stage(), 'cancelled');
  return outcome;
}
async function executeReview(client: ServiceNowClient, raw: unknown, execution: Execution,
  options?: ReviewAdapterOptions): Promise<BoundedReviewOutcome> {
  const parsed = reviewUpdateSetInputSchema.safeParse(raw);
  if (!parsed.success) return fail('input', 'invalid_input');
  const input = parsed.data;
  let stage: Stage = 'input';
  const getStage = (): Stage => stage;
  execution.stage = getStage;
  let reserveMs = 0;
  const cpu = () => execution.cpu ??= new ReviewWorker({ remainingMs: () => execution.session!.phaseRemainingMs(),
    signal: options?.signal, factory: options?.workerFactory });
  const finish = (run: AggregateReview) => {
    stage = 'output'; execution.session!.setPhaseReserve(0); return cpu().finish(run);
  };
  let progress: { run: AggregateReview; rows: ReviewMetadata[]; verify?: () => Promise<{ consistency: 'stable_observation' | 'changed' }> } | undefined;
  try {
    execution.session = client.createBoundedReadSession(options);
    reserveMs = Math.min(10000, execution.session.deadlineMs / 6);
    execution.session.setPhaseReserve(reserveMs);
    const source = new BoundedUpdateSetSource(execution.session,
      { update_set_sys_id: input.update_set_sys_id, max_records: input.max_records,
        selection_mode: input.selection_mode, requested_rule_ids: input.requested_rule_ids });
    const result = await (async () => {
        stage = 'parent'; await source.readParent();
        stage = 'release'; const decision = await source.resolveRelease();
        const legacy: Extract<AggregateReview, { schema_version: 'bp-mcp-review-0.2' }> = {
          schema_version: 'bp-mcp-review-0.2', poc_only: true, code_return_mode: 'none', status: 'partial',
          target: { update_set_sys_id: input.update_set_sys_id, target_version: 'update_set_payload', instance_binding: source.instanceBinding },
          versions: { knowledge_base: CATALOG_VERSION, ruleset: bp5RulesetFor(input.requested_rule_ids), asset_schema: 'bp-review-0.2' },
          started_at: source.startedAt, ended_at: source.startedAt, instance_release: decision.instance_release,
          release_match: decision.release_match, principal: { auth_mode: source.authMode },
          collection: { scope: 'caller_acl_visible', status: 'not_started', metadata_seen: 0, selected: 0, truncated: false },
          consistency: 'unverified', coverage: { requested_rule_ids: input.requested_rule_ids, skipped_rules: [], analysis_complete: false },
          assets: [], counts: { reviewed: 0, not_applicable: 0, skipped_deleted: 0, rejected: 0, retrieval_failed: 0, not_processed: 0, result_omitted: 0, findings: 0 },
          limits: { max_records: input.max_records, max_findings: 100, max_response_bytes: 262144, deadline_ms: 60000 },
          limitations: ['source_approval_pending', 'caller_acl_visible_only', ...decision.limitations], errors: [],
        };
        const run: AggregateReview = input.selection_mode === 'review_targets' ? { ...legacy,
          schema_version: 'bp-mcp-review-0.3', selection: targetSelection(input.requested_rule_ids),
          coverage: { ...legacy.coverage, analysis_scope: 'selected_candidate_window',
            candidate_inventory_complete: false, update_set_inventory_complete: false },
          limitations: [...legacy.limitations, ...TARGET_LIMITATIONS],
        } : legacy;
        progress = { run, rows: [] };
        if (decision.release_match !== 'matched') {
          const reason = decision.release_match === 'unknown' ? 'release_unknown' : 'release_mismatch';
          run.coverage.skipped_rules = input.requested_rule_ids.map(rule_id => ({ rule_id, reason }));
          return finish(run);
        }
        stage = 'metadata'; const metadata = await source.listMetadata(decision.permit);
        progress.rows = metadata.rows;
        progress.verify = () => source.verify(decision.permit);
        run.collection = { ...run.collection, status: 'complete', metadata_seen: metadata.metadata_seen,
          selected: metadata.rows.length, truncated: metadata.truncated };
        if (metadata.truncated) run.limitations.push('metadata_truncated');
        for (const row of metadata.rows) {
          stage = 'payload';
          execution.session!.assertActive();
          const classified = classify(row, input.requested_rule_ids);
          if (classified) { run.assets.push(classified); continue; }
          stage = 'payload';
          let detail: Awaited<ReturnType<typeof source.readPayload>>;
          try { detail = await source.readPayload(row.sys_id, decision.permit); }
          catch (error) {
            if (!(error instanceof BoundedReadError)) throw error;
            if (error.code === 'upstream_unavailable') {
              run.limitations.push(error.code);
              run.assets.push({ state: 'not_processed', update_xml_sys_id: row.sys_id, reason: error.code });
              addError(run, { stage: 'payload', code: error.code, update_xml_sys_id: row.sys_id });
              continue;
            }
            if (error.code === 'request_budget_exceeded') {
              run.limitations.push(error.code);
              addError(run, { stage: 'payload', code: error.code, update_xml_sys_id: row.sys_id });
              const done = new Set(run.assets.map(a => a.update_xml_sys_id));
              for (const pending of metadata.rows.filter(r => !done.has(r.sys_id))) {
                run.assets.push({ state: 'not_processed', update_xml_sys_id: pending.sys_id, reason: error.code });
              }
              break;
            }
            const reasons = { not_found_or_not_visible: 'payload_unavailable', invalid_response: 'missing_required_field',
              changed_during_review: 'changed_during_review' } as const;
            if (error.code === 'payload_limit') {
              run.assets.push({ state: 'rejected', update_xml_sys_id: row.sys_id, reason: 'payload_limit' }); continue;
            }
            if (error.code in reasons) {
              run.assets.push({ state: 'retrieval_failed', update_xml_sys_id: row.sys_id,
                reason: reasons[error.code as keyof typeof reasons] }); continue;
            }
            throw error;
          }
          const type = row.name.startsWith('sys_script_client_') ? 'client_script' : 'business_rule';
          const rules = input.requested_rule_ids.filter(id => RULES.find(r => r.rule_id === id)!.asset_types.includes(type));
          const timestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(detail.sys_updated_on)
            ? detail.sys_updated_on.replace(' ', 'T') + 'Z' : detail.sys_updated_on;
          if (!z.iso.datetime().safeParse(timestamp).success) {
            run.assets.push({ state: 'retrieval_failed', update_xml_sys_id: row.sys_id, reason: 'missing_required_field' }); continue;
          }
          stage = 'analysis';
          const validated = await cpu().analyze({ update_set_id: input.update_set_sys_id, update_xml_sys_id: row.sys_id,
            name: row.name, payload: detail.payload, retrieved_at: new Date().toISOString(),
            record_updated_at: timestamp, instance_binding: source.instanceBinding,
            instance_release: decision.instance_release, release_limitations: decision.limitations, requested_rule_ids: rules });
          const findings = run.assets.reduce((n, a) => n + (a.state === 'reviewed' ? a.result.findings.length : 0), 0);
          if (validated.state === 'reviewed' && findings + validated.result.findings.length > run.limits.max_findings) {
            run.assets.push({ state: 'result_omitted', update_xml_sys_id: row.sys_id, reason: 'response_limit' });
            if (!run.limitations.includes('response_truncated')) {
              run.limitations.push('response_truncated', 'finding_budget_exceeded');
              addError(run, { stage: 'output', code: 'response_limit' });
            }
          } else {
            run.assets.push(validated);
            if (validated.state === 'result_omitted' && !run.limitations.includes('response_truncated')) {
              run.limitations.push('response_truncated'); addError(run, { stage: 'output', code: 'response_limit' });
            }
          }
        }
        execution.session!.setPhaseReserve(reserveMs / 2);
        stage = 'consistency'; run.consistency = (await source.verify(decision.permit)).consistency;
        if (run.consistency === 'changed') {
          run.limitations.push('provisional_results', 'changed_during_review');
          addError(run, { stage, code: 'changed_during_review' });
        }
        stage = 'output'; return finish(run);
      })();
    return { isError: false, result };
  } catch (error) {
    const failureStage = getStage();
    // TypeScript does not track assignments inside the awaited orchestration.
    stage = failureStage;
    const soft = error instanceof BoundedReadError && error.code === 'phase_deadline_exceeded'
      || error instanceof ReviewWorkerError && error.code === 'deadline_exceeded' && stage === 'analysis'
        && execution.session!.remainingMs() > 0;
    if (soft) {
      if (!progress || execution.session!.remainingMs() <= 0) return fail(stage, 'deadline_exceeded');
      if (options?.signal?.aborted) return fail(stage, 'cancelled');
      // A timed-out CPU has already been terminated/awaited by the supervisor.
      // Never reuse it and never overlap analysis and finalization workers.
      if (error instanceof ReviewWorkerError) { await execution.cpu?.close(); execution.cpu = undefined; }
      const { run, rows, verify } = progress;
      run.limitations.push('soft_deadline_reached', 'deadline_exceeded');
      addError(run, { stage, code: 'deadline_exceeded' });
      const done = new Set(run.assets.map(a => a.update_xml_sys_id));
      for (const row of rows.filter(r => !done.has(r.sys_id))) {
        run.assets.push({ state: 'not_processed', update_xml_sys_id: row.sys_id, reason: 'deadline_exceeded' });
      }
      if (stage !== 'consistency' && verify) {
        stage = 'consistency';
        execution.session!.setPhaseReserve(reserveMs / 2);
        try { run.consistency = (await verify()).consistency; }
        catch (failure) {
          if (!(failure instanceof BoundedReadError)) return fail('consistency', 'internal_review_error');
          if (failure.code === 'cancelled' || execution.session!.remainingMs() <= 0) {
            return fail('consistency', failure.code === 'cancelled' ? 'cancelled' : 'deadline_exceeded');
          }
          const reasons = { phase_deadline_exceeded: 'deadline_exceeded', invalid_response: 'metadata_unavailable',
            not_found_or_not_visible: 'not_found_or_not_visible', authentication_failed: 'authentication_failed',
            access_denied: 'access_denied', upstream_unavailable: 'upstream_unavailable',
            request_budget_exceeded: 'request_budget_exceeded', receive_budget_exceeded: 'receive_budget_exceeded',
            payload_budget_exceeded: 'payload_budget_exceeded', candidate_filter_violation: 'candidate_filter_violation' } as const;
          if (!(failure.code in reasons)) return fail('consistency', 'internal_review_error');
          run.consistency = 'unverified';
          addError(run, { stage: 'consistency', code: reasons[failure.code as keyof typeof reasons] });
        }
      }
      if (run.consistency !== 'stable_observation') {
        run.limitations.push('provisional_results', run.consistency === 'changed' ? 'changed_during_review' : 'consistency_unverified');
      }
      if (run.consistency === 'changed') addError(run, { stage: 'consistency', code: 'changed_during_review' });
      if (stage === 'metadata') { run.collection.status = 'failed'; run.status = 'failed'; }
      try {
        const result = await finish(run);
        return result.status === 'failed' ? { isError: true, error: { stage: failureStage, code: 'deadline_exceeded' }, result }
          : { isError: false, result };
      } catch (failure) { return fail('output', failure instanceof ReviewWorkerError ? failure.code : 'internal_review_error'); }
    }
    if (error instanceof ReviewWorkerError) return fail(stage, error.code);
    if (error instanceof BoundedReadError) {
      const allowed: ErrorCode[] = ['invalid_input', 'config_invalid', 'authentication_failed', 'access_denied',
        'not_found_or_not_visible', 'upstream_unavailable', 'deadline_exceeded', 'receive_budget_exceeded',
        'request_budget_exceeded', 'payload_budget_exceeded', 'review_busy', 'cancelled', 'candidate_filter_violation'];
      const code: ErrorCode = error.code === 'invalid_response' && (stage === 'metadata' || stage === 'consistency') ? 'metadata_unavailable'
        : allowed.includes(error.code as ErrorCode) ? error.code as ErrorCode : 'internal_review_error';
      if (progress && stage === 'metadata' && !['deadline_exceeded', 'cancelled', 'internal_review_error'].includes(code)) {
        const { run } = progress;
        run.status = 'failed'; run.collection.status = 'failed'; addError(run, { stage, code: code as AggregateReview['errors'][number]['code'] });
        try { return { isError: true, error: { stage, code }, result: await finish(run) }; }
        catch (failure) { return fail('output', failure instanceof ReviewWorkerError ? failure.code : 'internal_review_error'); }
      }
      const stopReasons = ['authentication_failed', 'access_denied', 'request_budget_exceeded',
        'receive_budget_exceeded', 'payload_budget_exceeded', 'upstream_unavailable'] as const;
      if (progress && (stage === 'payload' || stage === 'consistency')
        && (stopReasons.some(reason => reason === code) || stage === 'consistency' && ['not_found_or_not_visible', 'metadata_unavailable', 'candidate_filter_violation'].includes(code))) {
        const { run, rows } = progress;
        const done = new Set(run.assets.map(a => a.update_xml_sys_id));
        const reason = stopReasons.find(reason => reason === code);
        if (reason) {
          run.limitations.push(reason);
          for (const row of rows.filter(r => !done.has(r.sys_id))) run.assets.push({ state: 'not_processed', update_xml_sys_id: row.sys_id, reason });
        }
        run.limitations.push('provisional_results', 'consistency_unverified');
        run.consistency = 'unverified';
        addError(run, { stage, code: code as AggregateReview['errors'][number]['code'] });
        run.status = code === 'candidate_filter_violation' || run.assets.some(a => a.state === 'reviewed') ? 'partial' : 'failed';
        try {
          const result = await finish(run);
          return result.status === 'failed' ? { isError: true, error: { stage: failureStage, code }, result } : { isError: false, result };
        } catch (failure) { return fail('output', failure instanceof ReviewWorkerError ? failure.code : 'internal_review_error'); }
      }
      return fail(stage, code);
    }
    return fail(stage, 'internal_review_error');
  }
}
