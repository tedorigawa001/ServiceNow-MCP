import { afterEach, expect, it, vi } from 'vitest';
import { PassThrough, Writable } from 'node:stream';
import { rmSync, writeFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter, getEventListeners } from 'node:events';
import { fileURLToPath } from 'node:url';
import { approvedPlanFixture } from './fixtures/r2-approved-plan.js';
import { runR2ApprovedEntry } from '../../src/review/r2-launcher-run.js';
import { selectR2EntryExitCode } from '../../src/review/r2-entry-terminal.js';
const dirs: string[] = [];
function plan() { const f = approvedPlanFixture(); dirs.push(f.dir); return f; }
function tty(reply: string, beforeReply = () => {}) {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false }); let text = '';
  const output = Object.assign(new Writable({ write(chunk, _encoding, done) {
    text += String(chunk); done();
    if (String(chunk).includes('Type APPROVE')) setImmediate(() => { beforeReply(); input.write(reply); });
  } }), { isTTY: true });
  return { input, output, text: () => text };
}
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
it('requires the real checker and TTY approval, and never starts a host after denial', async () => {
  const f = plan(), terminal = tty('NO\n'), spawnHost = vi.fn();
  const result = await runR2ApprovedEntry(['run', f.path], { ...terminal, supervisor: { spawnHost } });
  expect(selectR2EntryExitCode(result)).toBe(82); expect(spawnHost).not.toHaveBeenCalled();
  expect(terminal.text()).toContain('Type APPROVE');
  expect(terminal.text()).toContain('"code":"approval_denied"');
  expect(terminal.text()).not.toMatch(/PRIVATE|service-now|manifest\.json/);
});
it('rejects an expired plan before prompting or starting a host', async () => {
  const f = plan(), terminal = tty('APPROVE\n'), spawnHost = vi.fn();
  f.document.approval.expires_at = new Date(Date.now() - 1).toISOString(); writeFileSync(f.path, JSON.stringify(f.document));
  const result = await runR2ApprovedEntry(['run', f.path], { ...terminal, supervisor: { spawnHost } });
  expect(selectR2EntryExitCode(result)).toBe(10); expect(spawnHost).not.toHaveBeenCalled();
  expect(terminal.text()).not.toContain('Type APPROVE'); expect(terminal.text()).toContain('approval_expired');
});
it.each(['changed', 'expired'] as const)('never grants work if the plan becomes %s during confirmation (real bound host, bind forbidden)', async kind => {
  const f = plan(), terminal = tty('APPROVE\n', () => {
    if (kind === 'changed') f.document.review.max_records++;
    else f.document.approval.expires_at = new Date(Date.now() - 1).toISOString();
    writeFileSync(f.path, JSON.stringify(f.document));
  });
  const sent: unknown[] = [], received: unknown[] = [];
  const result = await runR2ApprovedEntry(['run', f.path], { ...terminal, supervisor: { spawnHost: (command, args, options) => {
    const replaced = [...args];
    const index = replaced.findIndex(value => /r2-host-entry\.(ts|js)$/.test(value));
    expect(index).toBeGreaterThanOrEqual(0); expect(replaced.at(-1)).toBe('--approval-bound');
    replaced[index] = fileURLToPath(new URL('./fixtures/r2-bound-host.mjs', import.meta.url));
    const child = spawn(command, replaced, options);
    const spy = vi.spyOn(child, 'send');
    child.on('message', value => { received.push(value); });
    child.on('close', () => { sent.push(...spy.mock.calls.map(([value]) => value)); });
    return child;
  } } });
  expect(selectR2EntryExitCode(result)).toBe(10);
  expect(result).toMatchObject({ mode: 'run', result: { stage: 'execution', report: { process_termination: 'confirmed', token_issuance: 'unknown' } } });
  expect(sent).not.toContainEqual(expect.objectContaining({ type: 'run_grant_v2' }));
  expect(received).not.toContainEqual({ type: 'ready' });
  expect(terminal.text()).not.toMatch(/PRIVATE|service-now|content|manifest\.json/);
});

function peer(digest: string, sent: Array<{ type: string; digest?: string }>) {
  const child = Object.assign(new EventEmitter(), { pid: 12345, connected: true,
    exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
    unref: vi.fn(), disconnect: vi.fn(), kill: vi.fn(() => {
      queueMicrotask(() => { child.signalCode = 'SIGKILL'; child.emit('exit', null, 'SIGKILL'); child.emit('close'); }); return true;
    }), send: vi.fn((value: { type: string; digest?: string }, callback: (error: null) => void) => {
      sent.push(value); callback(null);
      if (value.type === 'run_grant_v2') queueMicrotask(() => {
        expect(value.digest).toBe(digest);
        child.emit('message', { type: 'ready' }); child.emit('message', { type: 'stopping' });
        child.emit('message', { type: 'finished', receipt: { ok: false, code: 'authorization_denied', cleanup: 'complete',
          mcpListed: false, tokenMayHaveBeenIssued: false, otherAccountTokenPossible: false } });
      });
      if (value.type === 'finished_ack') queueMicrotask(() => { child.exitCode = 10; child.emit('exit', 10, null); child.emit('close'); });
      return true;
    }) });
  return child;
}
it('binds the exact approved digest, never uses legacy grant, and displays ready/summary only once', async () => {
  const f = plan(), terminal = tty('APPROVE\n'), root = new AbortController(), sent: Array<{ type: string; digest?: string }> = [];
  const child = peer(f.digest, sent), before = process.listenerCount('SIGINT');
  const supervisor = { spawnHost: vi.fn((_command: string, args: readonly string[]) => {
    expect(args.at(-1)).toBe('--approval-bound');
    queueMicrotask(() => child.emit('message', { type: 'prepared_v2', digest: f.digest })); return child as unknown as ChildProcess;
  }) };
  Reflect.set(supervisor, 'approvedDigest', 'f'.repeat(64)); // Not a public option; must not override checker + approval.
  const result = await runR2ApprovedEntry(['run', f.path], { ...terminal, signal: root.signal, supervisor });
  expect(selectR2EntryExitCode(result)).toBe(10);
  expect(result).toMatchObject({ mode: 'run', result: { stage: 'execution', report: { cleanup: 'complete', token_issuance: 'not_attempted' } } });
  expect(sent.filter(value => value.type === 'run_grant_v2')).toHaveLength(1);
  expect(sent.filter(value => value.type === 'run_grant')).toHaveLength(0);
  expect(terminal.text().match(/http:\/\/127\.0\.0\.1:18765\/bp5\/start/g)).toHaveLength(1);
  expect(terminal.text().match(/bp5-r2-exit-summary-0.1/g)).toHaveLength(1);
  expect(process.listenerCount('SIGINT')).toBe(before); expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
});
it('never grants work to a peer whose prepared digest differs from the approved snapshot', async () => {
  const f = plan(), terminal = tty('APPROVE\n'), sent: Array<{ type: string; digest?: string }> = [], child = peer(f.digest, sent);
  const result = await runR2ApprovedEntry(['run', f.path], { ...terminal, supervisor: { spawnHost: () => {
    queueMicrotask(() => child.emit('message', { type: 'prepared_v2', digest: '0'.repeat(64) })); return child as unknown as ChildProcess;
  } } });
  expect(selectR2EntryExitCode(result)).toBe(10);
  expect(sent.some(value => value.type === 'run_grant_v2' || value.type === 'run_grant')).toBe(false);
  expect(child.kill).toHaveBeenCalledTimes(1);
});
it.each([[], ['/PRIVATE_PLAN'], ['run'], ['run', '/PRIVATE_PLAN', '--yes'], ['run', '/tmp/../PRIVATE_PLAN'],
  ['run', '/PRIVATE_PLAN', '--digest=' + 'f'.repeat(64)], ['run', '/PRIVATE_PLAN', '--legacy']].map((args, id) => ({ args, id })))(
  'refuses bypass/unsupported syntax before checker or host: $id', async ({ args }) => {
    const terminal = tty('APPROVE\n'), spawnChecker = vi.fn(), spawnHost = vi.fn();
    const result = await runR2ApprovedEntry(args, { ...terminal, checker: { spawnChecker }, supervisor: { spawnHost } });
    expect(selectR2EntryExitCode(result)).toBe(64); expect(spawnChecker).not.toHaveBeenCalled(); expect(spawnHost).not.toHaveBeenCalled();
    expect(terminal.text()).not.toMatch(/PRIVATE|fffff|Type APPROVE/);
  });
it.each(['raw', 'input-non-tty', 'output-non-tty', 'buffered', 'reader'] as const)(
  'fails closed on unusable dedicated TTY: %s', async kind => {
    const f = plan(), terminal = tty('APPROVE\n'), spawnChecker = vi.fn(), spawnHost = vi.fn();
    if (kind === 'raw') terminal.input.isRaw = true;
    if (kind === 'input-non-tty') terminal.input.isTTY = false;
    if (kind === 'output-non-tty') terminal.output.isTTY = false;
    if (kind === 'buffered') terminal.input.write('APPROVE\n');
    const reader = () => {}; if (kind === 'reader') terminal.input.on('data', reader);
    const result = await runR2ApprovedEntry(['run', f.path], { ...terminal, checker: { spawnChecker }, supervisor: { spawnHost } });
    expect(selectR2EntryExitCode(result)).toBe(kind === 'output-non-tty' ? 81 : 10);
    expect(spawnChecker).not.toHaveBeenCalled(); expect(spawnHost).not.toHaveBeenCalled();
    expect(terminal.text()).not.toContain('Type APPROVE');
    if (kind === 'reader') expect(terminal.input.listeners('data')).toContain(reader);
  });
it('maps a failed final denial notice to nonzero display failure without retry or host startup', async () => {
  const f = plan(), input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false });
  let prompts = 0, notices = 0;
  const output = Object.assign(new Writable({ write(chunk, _encoding, done) {
    if (String(chunk).includes('Type APPROVE')) { prompts++; done(); setImmediate(() => input.write('NO\n')); }
    else { notices++; done(Error('PRIVATE_DISPLAY')); }
  } }), { isTTY: true });
  const spawnHost = vi.fn();
  const result = await runR2ApprovedEntry(['run', f.path], { input, output, supervisor: { spawnHost } });
  expect(selectR2EntryExitCode(result)).toBe(81); expect(prompts).toBe(1); expect(notices).toBe(1); expect(spawnHost).not.toHaveBeenCalled();
});
it('keeps cleanup priority before and after a failed summary, with no duplicate bootstrap notification', async () => {
  const f = plan(), input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false }), known = vi.fn();
  const output = Object.assign(new Writable({ write(chunk, _encoding, done) {
    if (String(chunk).includes('Type APPROVE')) { done(); setImmediate(() => input.write('APPROVE\n')); }
    else { expect(known).toHaveBeenCalledWith(71); done(Error('PRIVATE_SUMMARY')); }
  } }), { isTTY: true });
  const child = Object.assign(new EventEmitter(), { pid: 12345, connected: true, exitCode: null as number | null, signalCode: null,
    kill: vi.fn(), unref: vi.fn(), disconnect: vi.fn(), send: (value: { type: string }, callback: (error: null) => void) => {
      callback(null);
      if (value.type === 'run_grant_v2') queueMicrotask(() => { child.exitCode = 71; child.emit('exit', 71, null); child.emit('close'); }); return true;
    } });
  const result = await runR2ApprovedEntry(['run', f.path], { input, output, onKnownPriority: known, supervisor: { spawnHost: () => {
    queueMicrotask(() => child.emit('message', { type: 'prepared_v2', digest: f.digest })); return child as unknown as ChildProcess;
  } } });
  expect(selectR2EntryExitCode(result)).toBe(71); expect(known).toHaveBeenCalledTimes(1);
});
it.each([71, 73] as const)('owns SIGINT during a pending final summary and preserves priority %s', async priority => {
  const f = plan(), input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false }), known = vi.fn();
  const before = process.listeners('SIGINT'), beforeTerm = process.listeners('SIGTERM');
  let owned = false, handled = false, waitedForTimeout = false, release = () => {};
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const output = Object.assign(new Writable({ write(chunk, _encoding, done) {
    if (String(chunk).includes('Type APPROVE')) { done(); setImmediate(() => input.write('APPROVE\n')); }
    else {
      release = done;
      setImmediate(() => {
        owned = process.listenerCount('SIGINT') === before.length + 1;
        stallTimer = setTimeout(() => { waitedForTimeout = true; }, 200);
        // Dispatch through Node's signal listeners without killing the test worker on the RED path.
        handled = process.emit('SIGINT');
      });
    }
  } }), { isTTY: true });
  const child = Object.assign(new EventEmitter(), { pid: 12345, connected: true, exitCode: null as number | null, signalCode: null,
    kill: vi.fn(() => false), unref: vi.fn(), disconnect: vi.fn(), send: (value: { type: string }, callback: (error: null) => void) => {
      callback(null);
      if (priority === 71 && value.type === 'run_grant_v2') queueMicrotask(() => {
        child.exitCode = 71; child.emit('exit', 71, null); child.emit('close');
      });
      return true;
    } });
  try {
    const result = await runR2ApprovedEntry(['run', f.path], { input, output, onKnownPriority: known,
      supervisor: { totalTimeoutMs: 100, cleanupTimeoutMs: 10, observationTimeoutMs: 10, spawnHost: () => {
        queueMicrotask(() => child.emit('message', { type: 'prepared_v2', digest: f.digest })); return child as unknown as ChildProcess;
      } } });
    expect(owned).toBe(true); expect(handled).toBe(true); expect(waitedForTimeout).toBe(false);
    expect(result).toMatchObject({ mode: 'run', display: 'failed', result: { stage: 'display', code: 'display_failed' } });
    expect(selectR2EntryExitCode(result)).toBe(priority); expect(known).toHaveBeenCalledExactlyOnceWith(priority);
    expect(process.listeners('SIGINT')).toEqual(before); expect(process.listeners('SIGTERM')).toEqual(beforeTerm);
  } finally { clearTimeout(stallTimer); release(); }
});
it.each(['changed', 'expired'] as const)('stops after TTY approval if the on-disk plan is %s before host preparation', async kind => {
  const f = plan(), terminal = tty('APPROVE\n'), sent: unknown[] = [], received: unknown[] = [];
  const result = await runR2ApprovedEntry(['run', f.path], { ...terminal, supervisor: { spawnHost: (command, args, options) => {
    expect(terminal.text()).toContain('Type APPROVE');
    if (kind === 'changed') f.document.review.max_records++;
    else f.document.approval.expires_at = new Date(Date.now() - 1).toISOString();
    writeFileSync(f.path, JSON.stringify(f.document)); // This boundary is reached only after APPROVE was accepted.
    const replaced = [...args], index = replaced.findIndex(value => /r2-host-entry\.(ts|js)$/.test(value));
    expect(index).toBeGreaterThanOrEqual(0); replaced[index] = fileURLToPath(new URL('./fixtures/r2-bound-host.mjs', import.meta.url));
    const child = spawn(command, replaced, options), spy = vi.spyOn(child, 'send');
    child.on('message', value => { received.push(value); });
    child.on('close', () => { sent.push(...spy.mock.calls.map(([value]) => value)); }); return child;
  } } });
  expect(selectR2EntryExitCode(result)).toBe(10);
  expect(sent).not.toContainEqual(expect.objectContaining({ type: 'run_grant_v2' }));
  expect(received).not.toContainEqual({ type: 'ready' });
});
it('enforces a bounded TTY approval deadline and never grants work on timeout', async () => {
  const f = plan(), terminal = tty(''), spawnHost = vi.fn(), before = process.listenerCount('SIGINT');
  const result = await runR2ApprovedEntry(['run', f.path], { ...terminal, approvalTimeoutMs: 20, supervisor: { spawnHost } });
  expect(selectR2EntryExitCode(result)).toBe(124); expect(spawnHost).not.toHaveBeenCalled();
  expect(terminal.text()).toContain('approval_timeout'); expect(process.listenerCount('SIGINT')).toBe(before);
});
it('does not prompt, authorize or copy an external abort reason after pre-cancellation', async () => {
  const f = plan(), terminal = tty('APPROVE\n'), spawnChecker = vi.fn(), spawnHost = vi.fn(), root = new AbortController();
  root.abort(Error('PRIVATE_ABORT_REASON'));
  const result = await runR2ApprovedEntry(['run', f.path], { ...terminal, signal: root.signal, checker: { spawnChecker }, supervisor: { spawnHost } });
  expect(selectR2EntryExitCode(result)).toBe(130); expect(spawnChecker).not.toHaveBeenCalled(); expect(spawnHost).not.toHaveBeenCalled();
  expect(terminal.text()).not.toMatch(/Type APPROVE|PRIVATE/); expect(terminal.text()).toContain('checker_cancelled');
});
