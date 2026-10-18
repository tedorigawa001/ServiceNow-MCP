import { expect, it } from 'vitest';
import { aggregate } from './fixtures/bp5-results.js';
import { summarizeR2Report, parseR2SupervisorReport } from '../../src/review/r2-report-summary.js';
import { TARGET_LIMITATIONS, TARGET_FILTER_VERSION } from '../../src/review/target-selection.js';
function report() {
  return { schema_version: 'bp5-r2-host-exit-0.1', terminal_reason: 'completed', process_termination: 'confirmed',
    exit_observed: true, close_observed: true, cleanup: 'complete', token_issuance: 'possible', other_account_token: 'not_reported',
    kill_request: 'not_requested', host_exit: { code: 0, signal: null }, runner_receipt: {
      ok: true, cleanup: 'complete', mcpListed: true, tokenMayHaveBeenIssued: true, otherAccountTokenPossible: false,
      result: { isError: false, content: [{ type: 'text', text: JSON.stringify(aggregate()) }] } } };
}
it('validates lifecycle and inner JSON but displays only fixed counts and reason categories', () => {
  const value = report(), body = aggregate();
  body.limitations.push('PRIVATE_TOKEN https://private-fixture.example/script');
  value.runner_receipt.result.content[0].text = JSON.stringify(body);
  expect(parseR2SupervisorReport(value)).toBeDefined();
  const summary = summarizeR2Report(value);
  expect(summary).toMatchObject({ schema_version: 'bp5-r2-exit-summary-0.1', terminal_reason: 'completed',
    interpretation: 'lifecycle_only_not_safety', review: { schema_version: 'bp-mcp-review-0.2', status: 'partial', isError: false,
      counts: { reviewed: 1, findings: 1 }, limitation_counts: expect.arrayContaining([{ reason: 'unclassified', count: 1 }]) } });
  expect(JSON.stringify(summary)).not.toMatch(/PRIVATE|https|update_set_sys_id|instance_binding|content|target|sys_id/);
});

it.each(['extra', 'receipt-extra', 'inner-extra', 'exit', 'close', 'kill', 'signal', 'cleanup', 'token', 'other-account', 'reason', 'unknown-signal'] as const)(
  'refuses inconsistent or non-strict reports without a partial summary: %s', kind => {
    const value = report();
    if (kind === 'extra') Reflect.set(value, 'private', 'PRIVATE_ROOT');
    if (kind === 'receipt-extra') Reflect.set(value.runner_receipt, 'private', 'PRIVATE_RECEIPT');
    if (kind === 'inner-extra') { const body = aggregate(); Reflect.set(body, 'private', 'PRIVATE_BODY'); value.runner_receipt.result.content[0].text = JSON.stringify(body); }
    if (kind === 'exit') value.exit_observed = false;
    if (kind === 'close') value.close_observed = false;
    if (kind === 'kill') value.kill_request = 'sent';
    if (kind === 'signal') Reflect.set(value, 'host_exit', { code: null, signal: 'SIGKILL' });
    if (kind === 'cleanup') value.cleanup = 'unknown';
    if (kind === 'token') value.token_issuance = 'not_attempted';
    if (kind === 'other-account') value.other_account_token = 'possible';
    if (kind === 'reason') value.terminal_reason = 'PRIVATE_REASON';
    if (kind === 'unknown-signal') Reflect.set(value, 'host_exit', { code: null, signal: 'PRIVATE_SIGNAL' });
    expect(parseR2SupervisorReport(value)).toBeUndefined(); expect(summarizeR2Report(value)).toBeUndefined();
  });
it('preserves 0.3 partial semantics and fixed rejection/error counts, not asset identifiers', () => {
  const value = report(), base = aggregate();
  const body = { ...base, schema_version: 'bp-mcp-review-0.3',
    selection: { mode: 'review_targets', filter_version: TARGET_FILTER_VERSION, requested_asset_types: ['business_rule'],
      action_scope: 'insert_or_update_only', order: 'sys_id_asc', excluded_counts: { unsupported_assets: null, deleted_assets: null, other_actions: null } },
    coverage: { ...base.coverage, analysis_complete: false, analysis_scope: 'selected_candidate_window', candidate_inventory_complete: false, update_set_inventory_complete: false },
    limitations: [...base.limitations, ...TARGET_LIMITATIONS],
    assets: [{ state: 'rejected', update_xml_sys_id: 'a'.repeat(32), reason: 'forbidden_dtd' }],
    counts: { ...base.counts, reviewed: 0, rejected: 1, findings: 0 }, errors: [{ stage: 'payload', code: 'access_denied', update_xml_sys_id: 'a'.repeat(32) }] };
  value.runner_receipt.result.content[0].text = JSON.stringify(body);
  const summary = summarizeR2Report(value);
  expect(summary).toMatchObject({ review: { schema_version: 'bp-mcp-review-0.3', status: 'partial', analysis_complete: false,
    rejection_counts: [{ reason: 'forbidden_dtd', count: 1 }], error_counts: [{ reason: 'access_denied', count: 1 }] } });
  expect(JSON.stringify(summary)).not.toContain('a'.repeat(32));
});
it('preserves tool isError without inventing an aggregate review', () => {
  const value = report(); value.terminal_reason = 'review_failed'; value.host_exit.code = 10;
  value.runner_receipt.result.isError = true;
  value.runner_receipt.result.content[0].text = JSON.stringify({ status: 'failed', error: { stage: 'input', code: 'config_invalid' } });
  expect(summarizeR2Report(value)).toMatchObject({ terminal_reason: 'review_failed', tool_error_code: 'config_invalid' });
  expect(summarizeR2Report(value)).not.toHaveProperty('review');
});
it('retains termination/token uncertainty and never infers not_attempted from an absent receipt', () => {
  const value = { ...report(), terminal_reason: 'termination_unconfirmed', process_termination: 'unconfirmed', exit_observed: false,
    close_observed: false, cleanup: 'unknown', token_issuance: 'unknown', other_account_token: 'unknown', kill_request: 'sent', host_exit: { code: null, signal: null } };
  Reflect.deleteProperty(value, 'runner_receipt');
  expect(summarizeR2Report(value)).toMatchObject({ token_issuance: 'unknown', process_termination: 'unconfirmed' });
  value.token_issuance = 'not_attempted'; expect(summarizeR2Report(value)).toBeUndefined();
});
it('does not hide the dedicated host cleanup-incomplete exit behind an unknown cleanup state', () => {
  const value = { ...report(), terminal_reason: 'cleanup_incomplete', cleanup: 'unknown', token_issuance: 'unknown',
    other_account_token: 'unknown', host_exit: { code: 71, signal: null } };
  Reflect.deleteProperty(value, 'runner_receipt');
  expect(parseR2SupervisorReport(value)).toBeUndefined();
});
