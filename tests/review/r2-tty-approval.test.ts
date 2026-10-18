import { afterEach, expect, it, vi } from 'vitest';
import { PassThrough, Writable } from 'node:stream';
import { getEventListeners } from 'node:events';
import { requestR2TtyApproval } from '../../src/review/r2-tty-approval.js';
const digest = 'a'.repeat(64);
function terminal(tty = true) {
  const input = Object.assign(new PassThrough(), { isTTY: tty, isRaw: false });
  let text = '';
  const output = Object.assign(new Writable({ write(chunk, _encoding, done) { text += String(chunk); done(); } }), { isTTY: tty });
  return { input, output, text: () => text };
}
afterEach(() => { vi.useRealTimers(); });
it('requires an exact cooked-mode line on an actual TTY boundary and cleans up its subscriptions', async () => {
  const t = terminal(), before = process.listeners('SIGINT');
  const pending = requestR2TtyApproval(digest, t);
  await new Promise(resolve => setImmediate(resolve));
  t.input.write('APPROVE\n');
  expect(await pending).toEqual({ ok: true });
  expect(t.text()).toContain(digest); expect(t.text()).not.toContain('http');
  expect(process.listeners('SIGINT')).toEqual(before);
  expect(t.input.listenerCount('data')).toBe(0); expect(t.input.isPaused()).toBe(true);
});

it.each(['NO\n', 'APPROVE\nAPPROVE\n', 'approve\n', '\x03', '\x04', 'X'.repeat(65)])('denies unapproved or ambiguous input without echoing it', async line => {
  const t = terminal(), task = requestR2TtyApproval(digest, t);
  await new Promise(resolve => setImmediate(resolve)); t.input.write(line);
  expect(await task).toEqual({ ok: false, code: 'approval_denied' });
  expect(t.input.listenerCount('data')).toBe(0);
});
it.each(['input-pipe', 'output-pipe', 'raw', 'buffered', 'digest', 'budget'] as const)('rejects an unavailable exclusive cooked TTY before prompting: %s', async kind => {
  const t = terminal();
  if (kind === 'input-pipe') t.input.isTTY = false;
  if (kind === 'output-pipe') t.output.isTTY = false;
  if (kind === 'raw') t.input.isRaw = true;
  if (kind === 'buffered') t.input.write('APPROVE\n');
  expect(await requestR2TtyApproval(kind === 'digest' ? 'PRIVATE_INVALID' : digest, { ...t, timeoutMs: kind === 'budget' ? 60001 : 60000 }))
    .toEqual({ ok: false, code: 'approval_unavailable' });
  expect(t.text()).toBe('');
});
it('stops at the 60s boundary without accepting a late approval or leaking timers', async () => {
  vi.useFakeTimers(); const t = terminal(), task = requestR2TtyApproval(digest, t);
  await vi.advanceTimersByTimeAsync(60000); t.input.write('APPROVE\n');
  expect(await task).toEqual({ ok: false, code: 'approval_timeout' }); expect(vi.getTimerCount()).toBe(0);
});
it.each(['eof', 'abort', 'signal', 'write-error'] as const)('stops safely on %s and releases only its own handlers', async kind => {
  const t = terminal(), root = new AbortController(), before = process.listeners('SIGINT');
  if (kind === 'write-error') vi.spyOn(t.output, 'write').mockImplementation(() => { throw Error('PRIVATE_OUTPUT_ERROR'); });
  const task = requestR2TtyApproval(digest, { ...t, signal: root.signal });
  await new Promise(resolve => setImmediate(resolve));
  if (kind === 'eof') t.input.end();
  if (kind === 'abort') root.abort();
  if (kind === 'signal') process.emit('SIGINT');
  expect(await task).toEqual({ ok: false, code: kind === 'eof' ? 'approval_denied' : kind === 'write-error' ? 'approval_unavailable' : 'approval_cancelled' });
  expect(process.listeners('SIGINT')).toEqual(before); expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
  expect(t.text()).not.toContain('PRIVATE'); vi.restoreAllMocks();
});
it('never prints an unvalidated confirmation payload or uses its private strings in the prompt', async () => {
  const t = terminal();
  expect(await requestR2TtyApproval(digest, { ...t, checkedPlan: { private: 'PRIVATE_TOKEN' } as never }))
    .toEqual({ ok: false, code: 'approval_unavailable' });
  expect(t.text()).toBe('');
});
