import { expect, it } from 'vitest';
import { aggregate } from './fixtures/bp5-results.js';
import { rejectedR2PlanCheck, r2PlanCheckFailureCodeSchema } from '../../src/review/r2-plan-check.js';
import { summarizeR2Report } from '../../src/review/r2-report-summary.js';
import { parseR2EntryTerminal, selectR2EntryExitCode, R2_ENTRY_EXIT } from '../../src/review/r2-entry-terminal.js';
import { targetSelection, TARGET_LIMITATIONS } from '../../src/review/target-selection.js';

const base = { schema_version: 'bp5-r2-entry-terminal-0.1', display: 'confirmed', finalization: 'complete', fatal: false };
function completed(version = '0.2') {
  const initial = aggregate();
  const body = version === '0.3' ? { ...initial, schema_version: 'bp-mcp-review-0.3',
    selection: targetSelection(['AU-BR-001']),
    coverage: { ...initial.coverage, analysis_complete: false, analysis_scope: 'selected_candidate_window',
      candidate_inventory_complete: false, update_set_inventory_complete: false },
    limitations: [...initial.limitations, ...TARGET_LIMITATIONS] } : initial;
  if (version === 'error') return { ...stopped('review_failed'), host_exit: { code: 10, signal: null }, cleanup: 'complete',
    token_issuance: 'possible', other_account_token: 'not_reported', kill_request: 'not_requested', runner_receipt: {
      ok: true, cleanup: 'complete', mcpListed: true, tokenMayHaveBeenIssued: true, otherAccountTokenPossible: false,
      result: { isError: true, content: [{ type: 'text', text: JSON.stringify({ status: 'failed', error: { stage: 'input', code: 'config_invalid' } }) }] } } };
  return { schema_version: 'bp5-r2-host-exit-0.1', terminal_reason: 'completed', process_termination: 'confirmed',
    exit_observed: true, close_observed: true, cleanup: 'complete', token_issuance: 'possible', other_account_token: 'not_reported',
    kill_request: 'not_requested', host_exit: { code: 0, signal: null }, runner_receipt: {
      ok: true, cleanup: 'complete', mcpListed: true, tokenMayHaveBeenIssued: true, otherAccountTokenPossible: false,
      result: { isError: false, content: [{ type: 'text', text: JSON.stringify(body) }] } } };
}
function stopped(reason: string) {
  const unconfirmed = reason === 'termination_unconfirmed';
  return { schema_version: 'bp5-r2-host-exit-0.1', terminal_reason: reason,
    process_termination: unconfirmed ? 'unconfirmed' : 'confirmed', exit_observed: !unconfirmed, close_observed: !unconfirmed,
    cleanup: reason === 'cleanup_incomplete' ? 'incomplete' : 'unknown', token_issuance: 'unknown', other_account_token: 'unknown',
    kill_request: 'sent', host_exit: unconfirmed ? { code: null, signal: null }
      : reason === 'cleanup_incomplete' ? { code: 71, signal: null } : { code: null, signal: 'SIGKILL' } };
}
function execution(report: object = completed()) {
  return { ...base, mode: 'run', result: { stage: 'execution', report, summary: summarizeR2Report(report) } };
}
function display(report?: unknown, code = 'display_failed') {
  return { ...base, display: 'failed', mode: 'run', result: { stage: 'display', ok: false, code, ...(report ? { report } : {}) } };
}

it('keeps partial/completed distinct from safety and never changes the host report', () => {
  const input = execution(), before = structuredClone(input);
  expect(input.result.summary?.review).toMatchObject({ status: 'partial', analysis_complete: true });
  expect(parseR2EntryTerminal(input)).toBeDefined();
  expect(selectR2EntryExitCode(input)).toBe(0);
  expect(selectR2EntryExitCode({ ...input, display: 'failed' })).toBe(81);
  expect(input).toEqual(before);
  expect(selectR2EntryExitCode(execution(completed('error')))).toBe(10);
});
it('preserves the 0.3 incomplete candidate-window review without pretending it is a failure or full review', () => {
  const input = execution(completed('0.3'));
  expect(input.result.summary?.review).toMatchObject({ schema_version: 'bp-mcp-review-0.3', status: 'partial', analysis_complete: false });
  expect(selectR2EntryExitCode(input)).toBe(0);
  expect(selectR2EntryExitCode({ ...input, display: 'failed' })).toBe(81);
});

it.each([
  ['termination_unconfirmed', 73], ['cleanup_incomplete', 71], ['fatal', 70], ['forced_stop', 72],
  ['deadline_exceeded', 124], ['preflight_timeout', 124], ['cancelled', 130],
  ['host_failed', 10], ['protocol_error', 10], ['spawn_failed', 10], ['invalid_options', 10], ['unsupported_platform', 10],
] as const)('selects supervisor reason %s independently of observed host exit', (reason, expected) => {
  const input = execution(stopped(reason));
  expect(parseR2EntryTerminal(input)).toBeDefined();
  expect(selectR2EntryExitCode(input)).toBe(expected);
  expect(selectR2EntryExitCode(display(stopped(reason)))).toBe(expected === 124 || expected === 130 || expected === 10 ? 81 : expected);
});

it.each(r2PlanCheckFailureCodeSchema.options)('handles the fixed checker failure %s in both modes', code => {
  const expected = code === 'checker_termination_unconfirmed' ? 73 : code === 'checker_timeout' ? 124 : code === 'checker_cancelled' ? 130 : 10;
  for (const input of [
    { ...base, mode: 'check-plan', result: rejectedR2PlanCheck(code) },
    { ...base, mode: 'run', result: { stage: 'check', ok: false, code } },
  ]) {
    expect(selectR2EntryExitCode(input)).toBe(expected);
    expect(selectR2EntryExitCode({ ...input, display: 'failed' })).toBe(expected === 73 ? 73 : 81);
  }
});
it.each([['approval_denied', 82], ['approval_timeout', 124], ['approval_cancelled', 130], ['approval_unavailable', 10]] as const)(
  'handles approval code %s', (code, expected) => {
    const input = { ...base, mode: 'run', result: { stage: 'approval', ok: false, code } };
    expect(selectR2EntryExitCode(input)).toBe(expected);
    expect(selectR2EntryExitCode({ ...input, display: 'failed' })).toBe(81);
  });

it('applies the full priority ladder including simultaneous failures', () => {
  expect(selectR2EntryExitCode({ ...display(stopped('termination_unconfirmed')), finalization: 'incomplete', fatal: true })).toBe(73);
  expect(selectR2EntryExitCode({ ...display(stopped('cleanup_incomplete')), fatal: true })).toBe(71);
  expect(selectR2EntryExitCode({ ...display(stopped('forced_stop')), fatal: true })).toBe(70);
  expect(selectR2EntryExitCode(display(stopped('forced_stop'), 'report_unavailable'))).toBe(72);
  expect(selectR2EntryExitCode(display(undefined, 'report_unavailable'))).toBe(80);
  expect(selectR2EntryExitCode({ ...execution(), finalization: 'incomplete' })).toBe(71);
  expect(selectR2EntryExitCode({ ...base, mode: 'entry', code: 'usage' })).toBe(64);
  expect(selectR2EntryExitCode({ ...base, mode: 'entry', code: 'usage', display: 'failed' })).toBe(81);
  expect(selectR2EntryExitCode({ ...base, mode: 'entry', code: 'fatal' })).toBe(70);
  expect(selectR2EntryExitCode({ ...base, mode: 'entry', code: 'report_unavailable', display: 'failed' })).toBe(80);
});

it.each([['deadline_exceeded', 124], ['cancelled', 130]] as const)(
  'does not copy host exit 130 over the supervisor decision %s', (reason, expected) => {
    const report = { ...stopped(reason), cleanup: 'complete', token_issuance: 'not_attempted',
      other_account_token: 'not_reported', kill_request: 'not_requested', host_exit: { code: 130, signal: null },
      runner_receipt: { ok: false, code: 'cancelled', cleanup: 'complete', mcpListed: false,
        tokenMayHaveBeenIssued: false, otherAccountTokenPossible: false } };
    const input = { ...base, mode: 'run', result: { stage: 'execution', report, summary: summarizeR2Report(report) } };
    expect(parseR2EntryTerminal(input)).toBeDefined();
    expect(selectR2EntryExitCode(input)).toBe(expected);
    expect(report.host_exit.code).toBe(130);
  });

it('matches reprojected summary structurally rather than by JSON key order', () => {
  const input = execution();
  input.result.summary = Object.fromEntries(Object.entries(input.result.summary!).reverse()) as typeof input.result.summary;
  expect(selectR2EntryExitCode(input)).toBe(0);
});

it('accepts offline success only as a check-plan result with confirmed display', () => {
  const input = { ...base, mode: 'check-plan', result: { schema_version: 'bp5-r2-plan-check-0.1', mode: 'check-plan', pdi: 'not_verified',
    status: 'offline_valid', checks: { structure: true, file_trust: true, binding: true, validity: true }, selection_mode: 'bounded_all',
    max_records: 100, requested_rule_ids: ['AU-BR-001'], has_release_assertion: false, digest: 'a'.repeat(64) } };
  expect(selectR2EntryExitCode(input)).toBe(0);
  expect(selectR2EntryExitCode({ ...input, display: 'failed' })).toBe(81);
  expect(selectR2EntryExitCode({ ...input, mode: 'run' })).toBe(80);
});

it.each(['root-extra', 'unknown-code', 'wrong-stage-code', 'summary-change', 'summary-extra', 'raw-report-extra', 'raw-unconfirmed',
  'display-contradiction', 'missing-display', 'unknown-finalization', 'missing-fatal'])(
  'rejects the whole terminal snapshot without trusting individual fields: %s', kind => {
    const input: Record<string, unknown> = execution();
    if (kind === 'root-extra') input.secret = 'PRIVATE';
    if (kind === 'unknown-code') input.result = { stage: 'approval', ok: false, code: 'PRIVATE' };
    if (kind === 'wrong-stage-code') input.result = { stage: 'approval', ok: false, code: 'checker_termination_unconfirmed' };
    if (kind === 'summary-change') Reflect.set((input.result as ReturnType<typeof execution>['result']).summary!, 'terminal_reason', 'cancelled');
    if (kind === 'summary-extra') Reflect.set((input.result as ReturnType<typeof execution>['result']).summary!, 'secret', 'PRIVATE');
    if (kind === 'raw-report-extra') Reflect.set((input.result as ReturnType<typeof execution>['result']).report, 'secret', 'PRIVATE');
    if (kind === 'raw-unconfirmed') { Object.assign(input, display({ ...stopped('termination_unconfirmed'), secret: 'PRIVATE' })); input.finalization = 'incomplete'; input.fatal = true; }
    if (kind === 'display-contradiction') Object.assign(input, display(), { display: 'confirmed' });
    if (kind === 'missing-display') delete input.display;
    if (kind === 'unknown-finalization') input.finalization = 'PRIVATE';
    if (kind === 'missing-fatal') delete input.fatal;
    expect(parseR2EntryTerminal(input)).toBeUndefined();
    expect(selectR2EntryExitCode(input)).toBe(80);
  });
it('catches hostile getters and has no exception or secret output channel', () => {
  const value = { get mode() { throw new Error('PRIVATE_TOKEN'); } };
  expect(selectR2EntryExitCode(value)).toBe(80);
  expect(parseR2EntryTerminal(value)).toBeUndefined();
  expect(Object.values(R2_ENTRY_EXIT).every(code => Number.isInteger(code) && code >= 0 && code <= 255)).toBe(true);
  expect([R2_ENTRY_EXIT.report_unavailable, R2_ENTRY_EXIT.display_failed, R2_ENTRY_EXIT.approval_denied]).toEqual([80, 81, 82]);
});
