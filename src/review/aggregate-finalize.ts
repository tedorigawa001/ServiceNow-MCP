/** CPU-side aggregate accounting, whole-result omission, validation and serialization. */
import { anyAggregateReviewSchema, type AnyAggregateReview as AggregateReview } from './aggregate-schema.js';

export function addReviewError(run: AggregateReview, error: AggregateReview['errors'][number]) {
  if (run.errors.length < 100) {
    if (error.code === 'candidate_filter_violation') {
      if (run.schema_version !== 'bp-mcp-review-0.3') throw new Error('internal_review_error');
      run.errors.push(error);
    } else run.errors.push({ ...error, code: error.code });
  }
  else if (!run.limitations.includes('error_details_truncated')) run.limitations.push('error_details_truncated');
}
export function finalizeAggregate(run: AggregateReview): AggregateReview {
  run.ended_at = new Date().toISOString();
  const states = ['reviewed', 'not_applicable', 'skipped_deleted', 'rejected', 'retrieval_failed', 'not_processed', 'result_omitted'] as const;
  const recount = () => {
    for (const state of states) run.counts[state] = run.assets.filter(a => a.state === state).length;
    run.counts.findings = run.assets.reduce((n, a) => n + (a.state === 'reviewed' ? a.result.findings.length : 0), 0);
  };
  const omit = (i: number) => {
    run.assets[i] = { state: 'result_omitted', update_xml_sys_id: run.assets[i].update_xml_sys_id, reason: 'response_limit' };
    if (!run.limitations.includes('response_truncated')) {
      run.limitations.push('response_truncated'); addReviewError(run, { stage: 'output', code: 'response_limit' });
    }
    run.coverage.analysis_complete = false; recount();
  };
  let retained = 0;
  for (let i = 0; i < run.assets.length; i++) {
    const asset = run.assets[i];
    if (asset.state !== 'reviewed') continue;
    if (retained + asset.result.findings.length > run.limits.max_findings) {
      if (!run.limitations.includes('finding_budget_exceeded')) run.limitations.push('finding_budget_exceeded');
      omit(i);
    } else retained += asset.result.findings.length;
  }
  recount();
  run.coverage.analysis_complete = run.collection.status === 'complete' && !run.collection.truncated
    && (run.schema_version !== 'bp-mcp-review-0.3' || run.collection.selected > 0)
    && run.consistency === 'stable_observation' && run.release_match === 'matched' && !run.errors.length
    && run.assets.every(a => a.state === 'not_applicable' || a.state === 'skipped_deleted'
      || a.state === 'reviewed' && !a.result.coverage.skipped_rules.length
        && !['query_like_unresolved', 'br_table_context_unknown', 'br_dynamic_scope_unresolved', 'abort_flow_unresolved', 'display_write_unresolved', 'ui_policy_control_unresolved', 'client_lookup_unresolved', 'onchange_loading_flow_unresolved', 'onload_data_flow_unresolved', 'onload_input_unknown', 'dom_receiver_unresolved', 'setvalue_receiver_unresolved', 'fulltext_query_unresolved'].some(x => a.result.limitations.includes(x)));
  while (Buffer.byteLength(JSON.stringify(run), 'utf8') > run.limits.max_response_bytes - 256) {
    let i = run.assets.length - 1;
    while (i >= 0 && run.assets[i].state !== 'reviewed') i--;
    if (i < 0) throw new Error('internal_review_error');
    omit(i);
  }
  run.limitations = [...new Set(run.limitations)];
  return anyAggregateReviewSchema.parse(run);
}
