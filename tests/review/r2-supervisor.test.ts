import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { superviseR2Host } from '../../src/review/r2-supervisor.js';
import { aggregate } from './fixtures/bp5-results.js';
import { TARGET_FILTER_VERSION, TARGET_LIMITATIONS } from '../../src/review/target-selection.js';

function successfulReceipt(version = '0.2') {
  const base = aggregate();
  const body = version === '0.2' ? base : { ...base, schema_version: 'bp-mcp-review-0.3',
    selection: { mode: 'review_targets', filter_version: TARGET_FILTER_VERSION, requested_asset_types: ['business_rule'],
      action_scope: 'insert_or_update_only', order: 'sys_id_asc',
      excluded_counts: { unsupported_assets: null, deleted_assets: null, other_actions: null } },
    coverage: { ...base.coverage, analysis_scope: 'selected_candidate_window', candidate_inventory_complete: false,
      update_set_inventory_complete: false }, limitations: [...base.limitations, ...TARGET_LIMITATIONS] };
  return { ok: true, cleanup: 'complete', mcpListed: true, tokenMayHaveBeenIssued: true, otherAccountTokenPossible: false,
    result: { isError: false, content: [{ type: 'text', text: JSON.stringify(body) }] } };
}

function osChild() {
  const child = Object.assign(new EventEmitter(), { pid: 12345, connected: true, exitCode: null, signalCode: null,
    send: vi.fn((_value: unknown, callback?: (error: Error | null) => void) => { callback?.(null); return true; }),
    kill: vi.fn(() => true), unref: vi.fn(), disconnect: vi.fn() });
  return child as unknown as ChildProcess & typeof child;
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('secret-free dedicated host supervisor', () => {
  it('requires a matching versioned prepared digest before granting an approved run', async () => {
    const child = osChild();
    const task = superviseR2Host('/nonexistent/synthetic-manifest', { approvedDigest: 'a'.repeat(64), spawnHost: () => child });
    child.emit('message', { type: 'prepared_v2', digest: 'a'.repeat(64) });
    expect(child.send).toHaveBeenCalledWith({ type: 'run_grant_v2', digest: 'a'.repeat(64), remaining_ms: expect.any(Number) }, expect.any(Function));
    child.emit('exit', 10, null); child.emit('close', 10, null); await task;
  });
  it.each(['legacy', 'wrong-digest', 'extra'] as const)('never downgrades an approved run for %s prepared messages', async mode => {
    const child = osChild();
    const task = superviseR2Host('/nonexistent/synthetic-manifest', { approvedDigest: 'a'.repeat(64), spawnHost: () => child });
    child.emit('message', mode === 'legacy' ? { type: 'prepared' }
      : mode === 'wrong-digest' ? { type: 'prepared_v2', digest: 'b'.repeat(64) }
        : { type: 'prepared_v2', digest: 'a'.repeat(64), extra: 'PRIVATE_VALUE' });
    expect(child.send).not.toHaveBeenCalled(); expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
    child.emit('exit', null, 'SIGKILL'); child.emit('close', null, 'SIGKILL');
    expect(await task).toMatchObject({ terminal_reason: 'protocol_error', token_issuance: 'unknown' });
  });
  it('observes actual fixed-host exit and close without reading an invalid manifest', async () => {
    const result = await superviseR2Host('/nonexistent/synthetic-manifest');
    expect(result).toMatchObject({ schema_version: 'bp5-r2-host-exit-0.1',
      process_termination: 'confirmed', exit_observed: true, close_observed: true,
      cleanup: 'unknown', token_issuance: 'unknown' });
    expect(['protocol_error', 'preflight_timeout', 'host_failed']).toContain(result.terminal_reason);
    expect(result).not.toHaveProperty('runner_receipt');
  }, 15000);
  it('arms the independent 385-second deadline before grant, reserves 3 seconds, and confirms exit plus close', async () => {
    vi.useFakeTimers(); const child = osChild();
    const task = superviseR2Host('/nonexistent/synthetic-manifest', { spawnHost: () => child });
    child.emit('message', { type: 'prepared' });
    expect(child.send).toHaveBeenCalledWith({ type: 'run_grant', remaining_ms: 385000 }, expect.any(Function));
    await vi.advanceTimersByTimeAsync(381999); expect(child.kill).not.toHaveBeenCalled();
    expect(child.send.mock.calls.some(([v]) => (v as {type: string}).type === 'stop')).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(child.send.mock.calls.some(([v]) => (v as {type: string}).type === 'stop')).toBe(true);
    await vi.advanceTimersByTimeAsync(2999); expect(child.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
    let done = false; void task.then(() => { done = true; });
    child.emit('exit', null, 'SIGKILL'); await Promise.resolve(); expect(done).toBe(false);
    child.emit('close', null, 'SIGKILL');
    expect(await task).toMatchObject({ terminal_reason: 'deadline_exceeded', process_termination: 'confirmed',
      cleanup: 'unknown', token_issuance: 'unknown', host_exit: { code: null, signal: 'SIGKILL' } });
    await vi.advanceTimersByTimeAsync(10000); expect(child.kill).toHaveBeenCalledTimes(1);
  });
  it('adopts a strict failure receipt only after ack, matching exit and close', async () => {
    vi.useFakeTimers(); const child = osChild();
    const receipt = { ok: false, code: 'authorization_denied', cleanup: 'complete', mcpListed: false,
      tokenMayHaveBeenIssued: false, otherAccountTokenPossible: false };
    const task = superviseR2Host('/nonexistent/synthetic-manifest', { spawnHost: () => child });
    child.emit('message', { type: 'prepared' }); child.emit('message', { type: 'stopping' });
    child.emit('message', { type: 'finished', receipt });
    expect(child.send).toHaveBeenLastCalledWith({ type: 'finished_ack' }, expect.any(Function));
    child.emit('disconnect'); expect(child.kill).not.toHaveBeenCalled();
    child.emit('exit', 10, null); child.emit('close', 10, null);
    expect(await task).toMatchObject({ terminal_reason: 'review_failed', process_termination: 'confirmed',
      cleanup: 'complete', token_issuance: 'not_attempted', runner_receipt: receipt });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('reports unconfirmed rather than equating a successful kill request with termination', async () => {
    vi.useFakeTimers(); const child = osChild();
    const task = superviseR2Host('/nonexistent/synthetic-manifest', { spawnHost: () => child,
      totalTimeoutMs: 4000, cleanupTimeoutMs: 500 });
    child.emit('message', { type: 'prepared' });
    await vi.advanceTimersByTimeAsync(4999);
    let done = false; void task.then(() => { done = true; }); await Promise.resolve(); expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await task).toMatchObject({ terminal_reason: 'termination_unconfirmed', process_termination: 'unconfirmed',
      exit_observed: false, close_observed: false, kill_request: 'sent', token_issuance: 'unknown' });
    child.emit('exit', 0, null); child.emit('close', 0, null);
    expect(child.kill).toHaveBeenCalledTimes(1);
  });
  it('kills a real host with a blocked main loop using the independent deadline', async () => {
    const result = await superviseR2Host('/nonexistent/synthetic-manifest', { totalTimeoutMs: 400, cleanupTimeoutMs: 100,
      spawnHost: (command, _args, options) => spawn(command, ['tests/review/fixtures/r2-supervised-host.mjs', 'block'], options) });
    expect(result).toMatchObject({ terminal_reason: 'deadline_exceeded', process_termination: 'confirmed',
      kill_request: 'sent', host_exit: { code: null, signal: 'SIGKILL' }, cleanup: 'unknown', token_issuance: 'unknown' });
    expect(result).not.toHaveProperty('runner_receipt');
  }, 15000);
  it('rejects async ready consumers without exposing or leaving their rejection unhandled', async () => {
    vi.useFakeTimers(); const child = osChild();
    const task = superviseR2Host('/nonexistent/synthetic-manifest', { spawnHost: () => child,
      onReady: () => Promise.reject(new Error('PRIVATE_READY_FAILURE')) });
    child.emit('message', { type: 'prepared' }); child.emit('message', { type: 'ready' });
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
    child.emit('exit', null, 'SIGKILL'); child.emit('close', null, 'SIGKILL');
    expect(JSON.stringify(await task)).not.toContain('PRIVATE');
  });
  it.each(['kill-false', 'kill-throws', 'exit-only', 'close-only'] as const)(
    'keeps termination unconfirmed for %s and never retries a PID', async mode => {
    vi.useFakeTimers(); const child = osChild();
    if (mode === 'kill-false') child.kill.mockReturnValue(false);
    if (mode === 'kill-throws') child.kill.mockImplementation(() => { throw Error('PRIVATE_KILL_ERROR'); });
    const task = superviseR2Host('/nonexistent/synthetic-manifest', { spawnHost: () => child });
    child.emit('message', { type: 'prepared' });
    if (mode === 'exit-only') child.emit('exit', 0, null);
    else if (mode === 'close-only') child.emit('close', 0, null);
    else { child.emit('message', { type: 'unknown' }); }
    await vi.advanceTimersByTimeAsync(1000);
    const result = await task;
    expect(result).toMatchObject({ terminal_reason: 'termination_unconfirmed', process_termination: 'unconfirmed',
      cleanup: 'unknown', token_issuance: 'unknown' });
    expect(result).not.toHaveProperty('runner_receipt'); expect(JSON.stringify(result)).not.toContain('PRIVATE');
    if (mode.startsWith('kill-')) expect(result.kill_request).toBe('failed');
    if (mode === 'exit-only') expect(child.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400000); expect(child.kill.mock.calls.length).toBeLessThanOrEqual(1);
  });
  it.each([
    { ok: false, code: 'PRIVATE_TOKEN' },
    { ok: false, code: 'cancelled', cleanup: 'incomplete' },
    { ok: false, code: 'cancelled', otherAccountTokenPossible: true },
    { ok: false, code: 'cancelled', headers: { authorization: 'PRIVATE_TOKEN' } },
    { ok: true, result: { isError: false, content: [{ type: 'text', text: '{"script":"PRIVATE_CODE"}' }] } },
    { ok: true, mcpListed: true, tokenMayHaveBeenIssued: true,
      result: { isError: true, content: [{ type: 'text', text: '{"status":"failed","error":{"stage":"identity","code":"PRIVATE"}}' }] } },
  ])('rejects an invalid receipt without reflecting any of its fields (%#)', async invalid => {
    vi.useFakeTimers(); const child = osChild();
    const task = superviseR2Host('/nonexistent/synthetic-manifest', { spawnHost: () => child });
    child.emit('message', { type: 'prepared' }); child.emit('message', { type: 'stopping' });
    child.emit('message', { type: 'finished', receipt: { cleanup: 'complete', mcpListed: false,
      tokenMayHaveBeenIssued: false, otherAccountTokenPossible: false, ...invalid } });
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
    child.emit('exit', null, 'SIGKILL'); child.emit('close', null, 'SIGKILL');
    const result = await task; expect(result.terminal_reason).toBe('protocol_error');
    expect(result).not.toHaveProperty('runner_receipt'); expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
  it.each(['duplicate-prepared', 'duplicate-ready', 'duplicate-stopping', 'unknown', 'oversize', 'handle'] as const)(
    'rejects %s IPC without extending the deadline', async mode => {
    vi.useFakeTimers(); const child = osChild();
    const task = superviseR2Host('/nonexistent/synthetic-manifest', { spawnHost: () => child });
    child.emit('message', { type: 'prepared' });
    if (mode === 'duplicate-prepared') child.emit('message', { type: 'prepared' });
    else if (mode === 'duplicate-ready') { child.emit('message', { type: 'ready' }); child.emit('message', { type: 'ready' }); }
    else if (mode === 'duplicate-stopping') { child.emit('message', { type: 'stopping' }); child.emit('message', { type: 'stopping' }); }
    else if (mode === 'oversize') child.emit('message', { type: 'ready', padding: 'PRIVATE'.repeat(1000) });
    else child.emit('message', { type: 'unknown' }, mode === 'handle' ? {} : undefined);
    child.emit('exit', null, 'SIGKILL'); child.emit('close', null, 'SIGKILL');
    expect(await task).toMatchObject({ terminal_reason: 'protocol_error', process_termination: 'confirmed', token_issuance: 'unknown' });
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
  });
  it('a dedicated supervisor process forces its host on SIGINT then SIGTERM without leaking output', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'tests/review/fixtures/r2-supervisor-signal.mjs'],
      { env: {}, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], serialization: 'json' });
    let output = '', report: unknown;
    child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
    child.on('message', (m: {ready?: boolean; stopped?: boolean; report?: unknown}) => {
      if (m.ready) child.kill('SIGINT'); if (m.stopped) child.kill('SIGTERM'); if (m.report) report = m.report;
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
    try {
      expect(await new Promise(resolve => child.once('close', resolve))).toBe(0);
      expect(report).toMatchObject({ terminal_reason: 'forced_stop', process_termination: 'confirmed',
        host_exit: { signal: 'SIGKILL', code: null }, token_issuance: 'unknown' });
      expect(output).toBe('');
    } finally { clearTimeout(timer); if (child.exitCode === null) child.kill('SIGKILL'); }
  }, 15000);
  it('never adopts a successful review after cancellation has begun', async () => {
    vi.useFakeTimers(); const child = osChild(), root = new AbortController();
    const task = superviseR2Host('/nonexistent/synthetic-manifest', { spawnHost: () => child, signal: root.signal });
    child.emit('message', { type: 'prepared' }); root.abort();
    child.emit('message', { type: 'stopping' }); child.emit('message', { type: 'finished', receipt: successfulReceipt() });
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
    child.emit('exit', null, 'SIGKILL'); child.emit('close', null, 'SIGKILL');
    expect(await task).not.toHaveProperty('runner_receipt');
  });
  it.each(['0.2', '0.3'])('preserves validated %s partial JSON without calling it a complete analysis', async version => {
    vi.useFakeTimers(); const child = osChild();
    const task = superviseR2Host('/nonexistent/synthetic-manifest', { spawnHost: () => child });
    child.emit('message', { type: 'prepared' }); child.emit('message', { type: 'stopping' });
    child.emit('message', { type: 'finished', receipt: successfulReceipt(version) });
    child.emit('exit', 0, null); child.emit('close', 0, null);
    const report = await task;
    expect(report).toMatchObject({ terminal_reason: 'completed', cleanup: 'complete', token_issuance: 'possible' });
    expect(report.runner_receipt?.ok).toBe(true);
    if (report.runner_receipt?.ok) expect(JSON.parse(report.runner_receipt.result.content[0].text))
      .toMatchObject({ schema_version: `bp-mcp-review-${version}`, status: 'partial', code_return_mode: 'none' });
  });
  it.each([0, 70, 71])('does not trust a failure receipt with a contradictory exit %s', async code => {
    vi.useFakeTimers(); const child = osChild();
    const task = superviseR2Host('/nonexistent/synthetic-manifest', { spawnHost: () => child });
    child.emit('message', { type: 'prepared' }); child.emit('message', { type: 'stopping' });
    child.emit('message', { type: 'finished', receipt: { ok: false, code: 'authorization_denied', cleanup: 'complete',
      mcpListed: false, tokenMayHaveBeenIssued: false, otherAccountTokenPossible: false } });
    child.emit('exit', code, null); child.emit('close', code, null);
    const report = await task;
    expect(report).not.toHaveProperty('runner_receipt'); expect(report.token_issuance).toBe('unknown');
    expect(report.cleanup).toBe(code === 71 ? 'incomplete' : 'unknown');
  });
  it('preserves a validated MCP isError result rather than upgrading it to success', async () => {
    vi.useFakeTimers(); const child = osChild();
    const task = superviseR2Host('/nonexistent/synthetic-manifest', { spawnHost: () => child });
    child.emit('message', { type: 'prepared' }); child.emit('message', { type: 'stopping' });
    child.emit('message', { type: 'finished', receipt: { ...successfulReceipt(), result: { isError: true,
      content: [{ type: 'text', text: '{"status":"failed","error":{"stage":"output","code":"response_limit"}}' }] } } });
    child.emit('exit', 10, null); child.emit('close', 10, null);
    expect(await task).toMatchObject({ terminal_reason: 'review_failed', runner_receipt: { ok: true, result: { isError: true } } });
  });
  it('bounds preflight independently and never grants an unprepared host', async () => {
    vi.useFakeTimers(); const child = osChild();
    const task = superviseR2Host('/nonexistent/synthetic-manifest', { spawnHost: () => child });
    await vi.advanceTimersByTimeAsync(4999); expect(child.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
    expect(child.send).not.toHaveBeenCalled(); child.emit('exit', null, 'SIGKILL'); child.emit('close', null, 'SIGKILL');
    expect(await task).toMatchObject({ terminal_reason: 'preflight_timeout', process_termination: 'confirmed' });
  });
  it('checks monotonic elapsed time when deadline timers have not run yet', async () => {
    vi.useFakeTimers(); const clock = vi.spyOn(performance, 'now').mockReturnValue(0), child = osChild();
    const task = superviseR2Host('/nonexistent/synthetic-manifest', { spawnHost: () => child });
    child.emit('message', { type: 'prepared' }); clock.mockReturnValue(385001);
    child.emit('message', { type: 'stopping' }); expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
    child.emit('exit', null, 'SIGKILL'); child.emit('close', null, 'SIGKILL');
    expect(await task).toMatchObject({ terminal_reason: 'deadline_exceeded', token_issuance: 'unknown' });
  });
  it.each([{ totalTimeoutMs: 385001 }, { totalTimeoutMs: 0 }, { cleanupTimeoutMs: 3001 },
    { totalTimeoutMs: 3000 }, { preflightTimeoutMs: 5001 }, { observationTimeoutMs: 1001 }])(
    'rejects options that exceed a fixed ceiling (%#)', async limits => {
    const spawnHost = vi.fn();
    expect(await superviseR2Host('/nonexistent/synthetic-manifest', { ...limits, spawnHost }))
      .toMatchObject({ terminal_reason: 'invalid_options', process_termination: 'not_started' });
    expect(spawnHost).not.toHaveBeenCalled();
  });
  it('uses only the fixed executable/entry, empty environment and isolated ignored stdio', async () => {
    vi.useFakeTimers(); const child = osChild(), boundary = vi.fn(() => child);
    const options = { spawnHost: boundary, totalTimeoutMs: 4000, cleanupTimeoutMs: 500 };
    const task = superviseR2Host('/nonexistent/synthetic-manifest', options); options.totalTimeoutMs = 385000;
    const [command, args, launch] = boundary.mock.calls[0] as unknown as [string, string[], Record<string, unknown>];
    expect(command).toBe(process.execPath); expect(args.at(-2)).toMatch(/r2-host-entry\.ts$/);
    expect(launch).toEqual({ env: {}, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], shell: false, detached: true, serialization: 'json' });
    child.emit('message', { type: 'prepared' });
    expect(child.send).toHaveBeenCalledWith({ type: 'run_grant', remaining_ms: 4000 }, expect.any(Function));
    child.emit('exit', 10, null); child.emit('close', 10, null); await task;
  });
  it('discards an acknowledged result if the host lingers past the original cleanup budget', async () => {
    vi.useFakeTimers(); const child = osChild();
    const task = superviseR2Host('/nonexistent/synthetic-manifest', { spawnHost: () => child });
    child.emit('message', { type: 'prepared' }); child.emit('message', { type: 'stopping' });
    child.emit('message', { type: 'finished', receipt: successfulReceipt() });
    await vi.advanceTimersByTimeAsync(3000); expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
    child.emit('exit', null, 'SIGKILL'); child.emit('close', null, 'SIGKILL');
    const report = await task; expect(report).not.toHaveProperty('runner_receipt');
    expect(report).toMatchObject({ terminal_reason: 'cleanup_incomplete', cleanup: 'unknown', token_issuance: 'unknown' });
  });
});
