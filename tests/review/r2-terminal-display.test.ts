import { afterEach, expect, it, vi } from 'vitest';
import { Writable } from 'node:stream';
import { R2TerminalDisplay } from '../../src/review/r2-terminal-display.js';
import http from 'node:http';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('prints only the fixed ready URL, never a host supplied URL, before a strict exit summary', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('NETWORK_FORBIDDEN'));
  const request = vi.spyOn(http, 'request').mockImplementation(() => { throw Error('REQUEST_FORBIDDEN'); });
  let text = ''; const output = Object.assign(new Writable({ write(chunk, _encoding, done) { text += chunk; done(); } }), { isTTY: true });
  const display = new R2TerminalDisplay(output, () => { throw Error('UNEXPECTED_FAILURE'); });
  try {
    expect(display.ready()).toBeUndefined(); expect(await display.readySettled()).toBe(true);
    expect(text).toBe('http://127.0.0.1:18765/bp5/start\n');
    expect(await display.show({ schema_version: 'bp5-r2-host-exit-0.1', terminal_reason: 'host_failed',
      process_termination: 'confirmed', exit_observed: true, close_observed: true, cleanup: 'unknown', token_issuance: 'unknown',
      other_account_token: 'unknown', kill_request: 'not_requested', host_exit: { code: 10, signal: null } })).toMatchObject({ ok: true });
    expect(text).toContain('"token_issuance":"unknown"');
    expect(fetcher).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
  } finally { display.close(); }
});
it('bounds a stalled final-summary write after host termination instead of treating display as success', async () => {
  const fail = vi.fn();
  const output = Object.assign(new Writable({ write() { /* Synthetic terminal never confirms the write. */ } }), { isTTY: true });
  const display = new R2TerminalDisplay(output, fail, 20);
  try {
    const result = await display.show({ schema_version: 'bp5-r2-host-exit-0.1', terminal_reason: 'host_failed',
      process_termination: 'confirmed', exit_observed: true, close_observed: true, cleanup: 'unknown', token_issuance: 'unknown',
      other_account_token: 'unknown', kill_request: 'not_requested', host_exit: { code: 10, signal: null } });
    expect(result).toEqual({ ok: false, code: 'display_failed' }); expect(fail).toHaveBeenCalledTimes(1);
  } finally { display.close(); }
});
it('prints only a fixed unavailable marker for a non-strict report and never falls back to raw JSON', async () => {
  let text = ''; const fail = vi.fn();
  const output = Object.assign(new Writable({ write(chunk, _encoding, done) { text += chunk; done(); } }), { isTTY: true });
  const display = new R2TerminalDisplay(output, fail);
  try {
    expect(await display.show({ token: 'PRIVATE_TOKEN', payload: 'PRIVATE_CODE' })).toEqual({ ok: false, code: 'report_unavailable' });
    expect(text).toBe('report_unavailable\n'); expect(fail).toHaveBeenCalledTimes(1);
    display.ready(); expect(await display.readySettled()).toBe(false); expect(text).not.toContain('PRIVATE');
  } finally { display.close(); }
});
it.each(['throw', 'callback', 'event', 'timeout'] as const)('aborts on ready display %s and never prints a success summary', async kind => {
  const fail = vi.fn(); let text = '';
  const output = Object.assign(new Writable({ write(chunk, _encoding, done) {
    if (kind === 'callback') { done(Error('PRIVATE_CALLBACK')); return; }
    if (kind !== 'timeout') { text += chunk; done(); }
  } }), { isTTY: true });
  if (kind === 'throw') vi.spyOn(output, 'write').mockImplementation(() => { throw Error('PRIVATE_WRITE'); });
  const display = new R2TerminalDisplay(output, fail, 20);
  try {
    display.ready();
    if (kind === 'event') output.emit('error', Error('PRIVATE_EVENT'));
    expect(await display.readySettled()).toBe(false);
    expect(await display.show({ private: 'PRIVATE_REPORT' })).toEqual({ ok: false, code: 'display_failed' });
    expect(fail).toHaveBeenCalledTimes(1); expect(text).not.toMatch(/PRIVATE|exit-summary/);
  } finally { display.close(); }
});
it('does not let a delayed write callback escape its bounded deadline or re-advertise a closed display', async () => {
  vi.useFakeTimers(); const fail = vi.fn(); let callback!: (error?: Error | null) => void;
  const output = Object.assign(new Writable({ write(_chunk, _encoding, done) { callback = done; } }), { isTTY: true });
  const display = new R2TerminalDisplay(output, fail);
  display.ready(); await vi.advanceTimersByTimeAsync(1000); callback();
  expect(await display.readySettled()).toBe(false); display.close(); display.ready();
  await vi.runAllTimersAsync(); // Release the native-error guard after the callback's error-emission turn.
  expect(fail).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});
it('rejects duplicate ready notifications and non-TTY output without expanding the output budget', async () => {
  let writes = 0; const fail = vi.fn();
  const output = Object.assign(new Writable({ write(_chunk, _encoding, done) { writes++; done(); } }), { isTTY: true });
  const display = new R2TerminalDisplay(output, fail);
  try { display.ready(); await display.readySettled(); display.ready(); expect(await display.readySettled()).toBe(false); expect(writes).toBe(1); }
  finally { display.close(); }
  output.isTTY = false; const unavailable = new R2TerminalDisplay(output, fail, 1001);
  unavailable.ready(); expect(await unavailable.readySettled()).toBe(false); unavailable.close(); expect(writes).toBe(1);
});
it('guards a late native write error after display timeout and releases the non-secret guard after native settlement', async () => {
  let callback!: (error?: Error | null) => void;
  let completed = false;
  const output = Object.assign(new Writable({ write(_chunk, _encoding, done) { callback = done; } }), { isTTY: true });
  const display = new R2TerminalDisplay(output, () => {}, 20);
  try {
    display.ready(); expect(await display.readySettled()).toBe(false); display.close();
    expect(output.listenerCount('error')).toBeGreaterThan(0);
    completed = true; callback(Error('PRIVATE_LATE_NATIVE_WRITE'));
    await new Promise(resolve => setImmediate(resolve));
    expect(output.listenerCount('error')).toBe(0);
  } finally { if (!completed) callback?.(); display.close(); }
});
