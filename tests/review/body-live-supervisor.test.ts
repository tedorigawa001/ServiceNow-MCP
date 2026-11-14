import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { addSupervisorBytes, createBodyLiveSupervisor, type SupervisorEvent, type SupervisorCommand } from './fixtures/body-live-supervisor.js';
import { inspectBodyLiveProtocol, isIncompleteBodyLiveControl } from './fixtures/body-live-supervisor-protocol.js';

// Independent wire oracle: no constants, classifier, or serializer imported from the kernel.
function wire(mode: 'reference' | 'js', change?: (old: Record<string, unknown>, result: Record<string, unknown>) => void) {
  const old = { compiled: true, fields: 56, brands: 6, copies: 6, fixedReferenceControls: 6, writableControls: 6,
    priorStageControls: 45, priorIdentityControls: 45, preflightControls: 7, issuedRetention: true, readonlyRuntime: true,
    liveInitialRecheck: true, rejectedIdentity: true, priorDiagnosis: true, typeRejections: 19, livePrefixControls: 9,
    enumerableControl: true, sealedControl: true, phaseAllowlist: true };
  const result = { blb: true, mode, payloadEmits: mode === 'js' ? 2 : 306,
    execution: { modules: 304, observations: 385, digest: 'a'.repeat(64),
      caseDigests: Array.from({ length: 304 }, (_, i) => i.toString(16).padStart(64, '0')) },
    isolation: { freshFactories: true, freshBrands: true, closeIndependent: true, foreignRefusals: 2, copyRefusals: 1, proxyRefusals: 1, hooks: 0 },
    loader: { phase: 'sealed', first: 'none', busy: false, completed: 304, writes: 304, imports: 304, observations: 385,
      isolationImports: 2, isolationConfirmed: true, bodyTranspiles: mode === 'js' ? 1 : 304, normalRoute: 'unchanged', bodyStartup: 'closed' } };
  change?.(old, result);
  return JSON.stringify(old) + '\n' + JSON.stringify(result) + '\n';
}
class Rig {
  s: ReturnType<typeof createBodyLiveSupervisor>; token: object = {}; now = 0; log: SupervisorCommand[] = [];
  constructor(factory = createBodyLiveSupervisor) { this.s = factory(); }
  collect() { this.log.push(...this.s.drain()); }
  start(at = this.now) { this.now = at; this.token = this.s.start(at)!; this.collect(); return this.token; }
  event(e: SupervisorEvent, at = this.now) { this.now = at; this.s.send(this.token, at, e); this.collect(); }
  boot(at = this.now) {
    this.start(at); this.event({ type: 'prepared', ok: true }); this.event({ type: 'spawned', pid: 42 });
    this.event({ type: 'attach', stream: 'stdout' }); this.event({ type: 'attach', stream: 'stderr' }); return this;
  }
  data(text: string | Uint8Array, stream: 'stdout' | 'stderr' = 'stdout') {
    this.event({ type: 'data', stream, bytes: typeof text === 'string' ? new TextEncoder().encode(text) : text });
  }
  output() { this.data(wire(this.s.inspect().run!.mode)); }
  finish(at = this.now, code: number | null = 0, signal: string | null = null) {
    this.now = at;
    for (const s of this.run.group.signals) if (s.result === 'pending') this.event({ type: 'signal', name: s.name, result: 'ok' });
    this.event({ type: 'end', stream: 'stdout' }); this.event({ type: 'end', stream: 'stderr' });
    this.event({ type: 'exit', code, signal }); this.event({ type: 'close', code, signal });
    for (const s of this.run.group.signals) if (s.result === 'pending') this.event({ type: 'signal', name: s.name, result: 'ok' });
    this.event({ type: 'group', state: 'absent' });
    this.event({ type: 'tick' }, this.now + 100); this.event({ type: 'group', state: 'absent' });
    this.deliver();
  }
  deliver(removeOK = true, reportOK = true) {
    if (this.s.inspect().run?.phase === 'removing') this.event({ type: 'removed', ok: removeOK });
    if (this.s.inspect().run?.phase === 'reporting') this.event({ type: 'reported', ok: reportOK });
  }
  get run() { return this.s.inspect().run!; }
}

describe('SG-A pure supervisor', () => {
  it('SF01: serial ABBA accepts full observations and both group absences, never just exit', () => {
    const r = new Rig();
    for (const mode of ['reference', 'js', 'js', 'reference']) {
      r.boot(); expect(r.run.mode).toBe(mode); expect(r.s.start(r.now)).toBeUndefined();
      const bytes = new TextEncoder().encode(wire(r.run.mode));
      for (let i = 0; i < bytes.length; i += 137) r.data(bytes.subarray(i, i + 137));
      r.finish(r.now + 1_000);
      expect(r.run).toMatchObject({ verdict: 'passed', first: 'none', cleanupConfirmed: true, removed: true, retainedDuty: false });
    }
    expect(r.s.inspect()).toMatchObject({ starts: 4, complete: true });
    expect(r.log.filter(x => x.kind === 'spawn')).toHaveLength(4);
    expect(r.log.filter(x => x.kind === 'signal')).toHaveLength(0);
    expect(r.s.start(r.now)).toBeUndefined();
  });
  it.each(['stdout', 'stderr'] as const)('SF02: exact byte boundaries for %s, including split multibyte data', name => {
    for (const n of [65_535, 65_536, 65_537]) {
      const r = new Rig().boot();
      r.data(new Uint8Array(n - 2), name); r.data(new Uint8Array([0xc3]), name); r.data(new Uint8Array([0xa9]), name);
      expect(r.run.streams[name]).toMatchObject({ seen: n, retained: Math.min(n, 65_536), truncated: n > 65_536 });
      if (name === 'stdout' && n <= 65_536) expect(r.run.first).toBe('none');
      else expect(r.run.first).toBe(name === 'stderr' ? 'stderr' : 'output_limit');
    }
  });
  it('SF03: drains after overflow without retaining input backing buffers; saturates checked counts', () => {
    const r = new Rig().boot(), input = new Uint8Array(70_000);
    r.data(input); input.fill(255);
    for (let i = 0; i < 20; i++) r.data(input);
    expect(r.run.streams.stdout).toMatchObject({ retained: 65_536, seen: 1_470_000, truncated: true });
    expect(r.log.filter(x => x.kind === 'signal')).toHaveLength(1);
    expect(addSupervisorBytes(Number.MAX_SAFE_INTEGER - 1, 1)).toEqual({ seen: Number.MAX_SAFE_INTEGER, overflow: false });
    expect(addSupervisorBytes(Number.MAX_SAFE_INTEGER, 1)).toEqual({ seen: Number.MAX_SAFE_INTEGER, overflow: true });
    expect(addSupervisorBytes(-1, 1).overflow).toBe(true);
    r.event({ type: 'tick' }, 3_000); r.deliver();
    expect(r.run).toMatchObject({ verdict: 'failed', retainedDuty: true });
  });
  it('SF01/SF08: a valid wire split into single bytes stays within the finite event allowance', () => {
    const r = new Rig().boot(), bytes = new TextEncoder().encode(wire('reference'));
    for (let i = 0; i < bytes.length; i++) r.data(bytes.subarray(i, i + 1));
    r.finish(1_000); expect(r.run.verdict).toBe('passed');
  });
  it('SF02: multibyte text is charged by bytes, not decoded character length', () => {
    const r = new Rig().boot(); r.data('€'.repeat(21_846));
    expect(r.run.streams.stdout).toMatchObject({ seen: 65_538, retained: 65_536, truncated: true });
  });
  it('SF03: accepted chunks are copied into bounded storage before the producer can mutate them', () => {
    const r = new Rig().boot(), bytes = new TextEncoder().encode(wire('reference'));
    r.data(bytes); bytes.fill(255); r.finish(1_000);
    expect(r.run).toMatchObject({ verdict: 'passed', cleanupConfirmed: true });
  });
  it.each(['unattached', 'error', 'no-eof'] as const)('SF04: distinguishes %s from captured empty EOF', kind => {
    const r = new Rig();
    if (kind === 'unattached') { r.start(); r.event({ type: 'prepared', ok: true }); r.event({ type: 'spawned', pid: 42 }); r.data(''); }
    else { r.boot(); if (kind === 'error') r.event({ type: 'stream_error', stream: 'stderr' }); }
    if (kind !== 'no-eof') r.event({ type: 'end', stream: 'stderr' });
    r.event({ type: 'tick' }, 60_000); r.event({ type: 'tick' }, 63_000); r.deliver();
    expect(r.run).toMatchObject({ verdict: 'failed', cleanupConfirmed: false, retainedDuty: true });
    expect(r.s.start(r.now)).toBeUndefined();
    expect(r.run.streams.stderr.ended).toBe(kind !== 'no-eof');
  });
  it('SF05: empty and partial summaries cannot be accepted as successful empty output', () => {
    for (const text of ['', '{}', '{}\n{}', '{}\n{']) {
      expect(inspectBodyLiveProtocol(new TextEncoder().encode(text), 'js')).toEqual({ ok: false });
    }
  });
  it('SF18: cancellation before start emits no spawn and never permits a later start', () => {
    const s = createBodyLiveSupervisor();
    s.cancel(0);
    expect(s.start(0)).toBeUndefined();
    expect(s.inspect()).toMatchObject({ first: 'cancelled', starts: 0, verdict: 'failed' });
    expect(s.drain()).toEqual([]);
  });
  it('SF18: cancellation between two clean ABBA arms blocks the next start without rewriting the completed arm', () => {
    const r = new Rig().boot(); r.output(); r.finish(1_000);
    r.s.cancel(r.now);
    expect(r.s.start(r.now)).toBeUndefined();
    expect(r.s.inspect()).toMatchObject({ verdict: 'failed', first: 'cancelled', starts: 1, complete: false });
    expect(r.run.verdict).toBe('passed');
    expect(r.s.inspect().completed[0].verdict).toBe('passed');
  });
  it.each(['', '{}\n', '{}\n{'])('SF05: code 0 cannot mask missing or partial summaries (%j)', text => {
    const r = new Rig().boot(); r.data(text); r.finish(1_000);
    expect(r.run).toMatchObject({ verdict: 'failed', reason: 'protocol', cleanupConfirmed: true });
  });
  it.each(['json', 'extra-line', 'duplicate-line', 'extra-field', 'digest', 'type', 'utf8'] as const)('SF06: strict protocol rejects %s without echoing raw output', fault => {
    const text = wire('reference', (old, result) => {
      if (fault === 'extra-field') result.secret = 'RAW_SECRET';
      if (fault === 'type') old.fields = '56';
      if (fault === 'digest') (result.execution as { digest: string }).digest = 'invalid';
    });
    const r = new Rig().boot();
    r.data(fault === 'json' ? '{\n{}' : fault === 'extra-line' ? text + '{}\n'
      : fault === 'duplicate-line' ? text + text : fault === 'utf8' ? new Uint8Array([255]) : text);
    r.finish(1_000);
    expect(r.run.verdict).toBe('failed');
    expect(JSON.stringify(r.s.inspect())).not.toContain('RAW_SECRET');
  });
  it.each(['modules', 'observations', 'typeRejections', 'isolation', 'case-order'] as const)('SF07: independent full-observation oracle catches %s only', field => {
    const r = new Rig().boot(); r.output(); r.finish(1_000); r.boot(r.now + 1);
    r.data(wire('js', (old, result) => {
      const e = result.execution as { modules: number; observations: number; caseDigests: string[] };
      if (field === 'modules') e.modules = 303;
      if (field === 'observations') e.observations = 384;
      if (field === 'typeRejections') old.typeRejections = 18;
      if (field === 'isolation') (result.isolation as { hooks: number }).hooks = 1;
      if (field === 'case-order') [e.caseDigests[0], e.caseDigests[1]] = [e.caseDigests[1], e.caseDigests[0]];
    }));
    r.finish(r.now + 1_000);
    expect(r.run).toMatchObject({ verdict: 'failed', reason: field === 'case-order' ? 'comparison' : 'protocol' });
  });
  it('SF08: finite fake pipe stalls without drain; listen commands permit progress through the real kernel', () => {
    const r = new Rig(); r.start(); r.event({ type: 'prepared', ok: true }); r.event({ type: 'spawned', pid: 42 });
    const pipe = { buffered: 64, written: 64, blocked: true };
    const drain = (commands: SupervisorCommand[]) => {
      if (commands.some(x => x.kind === 'listen' && x.stream === 'stdout')) {
        pipe.buffered = 0; pipe.blocked = false; pipe.written += 64;
      }
    };
    drain(r.log.filter(x => x.kind !== 'listen')); expect(pipe.blocked).toBe(true);
    drain(r.log); expect(pipe).toEqual({ buffered: 0, blocked: false, written: 128 });
    r.event({ type: 'attach', stream: 'stdout' }); r.event({ type: 'attach', stream: 'stderr' }); r.output(); r.finish(1_000);
    expect(r.run.verdict).toBe('passed');
  });
  it('SF09: exit and two group absences do not stand in for stdio close', () => {
    const r = new Rig().boot(); r.output(); r.event({ type: 'exit', code: 0, signal: null });
    expect(r.run.process.close).toBeUndefined(); expect(r.s.start(0)).toBeUndefined();
    r.event({ type: 'tick' }, 60_000); r.event({ type: 'group', state: 'absent' });
    r.event({ type: 'tick' }, 60_100); r.event({ type: 'group', state: 'absent' });
    r.event({ type: 'tick' }, 63_000); r.deliver();
    expect(r.run).toMatchObject({ verdict: 'failed', cleanupConfirmed: false, retainedDuty: true });
    expect(r.run.process.close).toBeUndefined();
  });
  it('SF10/SF13: close with surviving group requests TERM then KILL only once and cannot start another run', () => {
    const r = new Rig().boot(); r.output();
    r.event({ type: 'close', code: 0, signal: null }, 1_000); r.event({ type: 'group', state: 'alive' });
    r.event({ type: 'signal', name: 'SIGTERM', result: 'ok' });
    r.event({ type: 'tick' }, 1_999); expect(r.log.filter(x => x.signal === 'SIGKILL')).toHaveLength(0);
    r.event({ type: 'tick' }, 2_000); r.event({ type: 'group', state: 'alive' });
    r.event({ type: 'signal', name: 'SIGKILL', result: 'ok' });
    r.event({ type: 'tick' }, 3_000); r.event({ type: 'tick' }, 4_000); r.deliver();
    expect(r.log.filter(x => x.kind === 'signal').map(x => x.signal)).toEqual(['SIGTERM', 'SIGKILL']);
    expect(r.run).toMatchObject({ verdict: 'failed', first: 'group', retainedDuty: true });
    expect(r.s.start(r.now)).toBeUndefined();
  });
  it.each([true, false])('SF11: spawn failure with noneCreated=%s preserves actual creation uncertainty', noneCreated => {
    const r = new Rig(); r.start(); r.event({ type: 'prepared', ok: true }); r.event({ type: 'spawn_error', noneCreated });
    if (!noneCreated) r.event({ type: 'tick' }, 3_000);
    r.deliver(); expect(r.run).toMatchObject({ verdict: 'failed', first: 'spawn', cleanupConfirmed: noneCreated, retainedDuty: !noneCreated });
  });
  it('SF12: absence count resets on alive and Unknown never becomes ESRCH', () => {
    const r = new Rig().boot(); r.output(); r.event({ type: 'close', code: 0, signal: null }, 1_000);
    r.event({ type: 'group', state: 'absent' }); r.event({ type: 'tick' }, 1_100); r.event({ type: 'group', state: 'alive' });
    expect(r.run.group.absent).toBe(0);
    r.event({ type: 'tick' }, 1_200); r.event({ type: 'group', state: 'unknown' });
    expect(r.run.group).toMatchObject({ state: 'unknown', absent: 0 });
    r.event({ type: 'tick' }, 4_000); r.deliver(); expect(r.run.retainedDuty).toBe(true);
  });
  it.each(['ok', 'ESRCH', 'error'] as const)('SF14: signal result %s alone cannot prove group absence', result => {
    const r = new Rig().boot(); r.event({ type: 'cancel' }); r.event({ type: 'signal', name: 'SIGTERM', result });
    expect(r.run.group.absent).toBe(0); r.event({ type: 'tick' }, 3_000); r.deliver();
    expect(r.run).toMatchObject({ verdict: 'failed', cleanupConfirmed: false, first: 'cancelled' });
  });
  it('SF13: cached alive before the one-second escalation point does not authorize KILL', () => {
    const r = new Rig().boot(); r.event({ type: 'cancel' }); r.event({ type: 'group', state: 'alive' });
    r.event({ type: 'tick' }, 1_000);
    expect(r.log.filter(x => x.signal === 'SIGKILL')).toHaveLength(0);
    r.event({ type: 'group', state: 'alive' });
    expect(r.log.filter(x => x.signal === 'SIGKILL')).toHaveLength(1);
  });
  it.each([59_999, 60_000, 60_001])('SF15: close observed at %i uses the original deadline even without a timer', at => {
    const r = new Rig().boot(); r.output(); r.finish(at);
    expect(r.run.verdict).toBe(at < 60_000 ? 'passed' : 'inconclusive');
    if (at >= 60_000) expect(r.run.reason).toBe('control_deadline');
  });
  it('SF16: clean control timeout is inconclusive, incomplete output retained as such, no remaining ABBA', () => {
    const r = new Rig().boot(); r.event({ type: 'tick' }, 60_000);
    r.finish(60_050, null, 'SIGTERM');
    expect(r.run).toMatchObject({ verdict: 'inconclusive', reason: 'control_deadline', cleanupConfirmed: true });
    expect(r.run.streams.protocol).toBe('incomplete'); expect(r.s.start(r.now)).toBeUndefined();
  });
  it.each(['overflow', 'stream', 'protocol', 'cleanup'] as const)('SF17: control deadline cannot hide %s', fault => {
    const r = new Rig().boot(); r.event({ type: 'tick' }, 60_000);
    if (fault === 'overflow') r.data(new Uint8Array(65_537));
    if (fault === 'stream') r.event({ type: 'stream_error', stream: 'stderr' });
    if (fault === 'protocol') r.data('{}\n{}');
    if (fault === 'cleanup') { r.event({ type: 'tick' }, 63_000); r.deliver(); } else r.finish(60_100, null, 'SIGTERM');
    expect(r.run.verdict).toBe('failed'); expect(r.run.reason).not.toBe('control_deadline');
    expect(r.run.execution.flags).toContain('deadline');
  });
  it('SF17: even a single completed invalid first summary is not excused by a control deadline', () => {
    const r = new Rig().boot(); r.event({ type: 'tick' }, 60_000); r.data('{}'); r.finish(60_050, null, 'SIGTERM');
    expect(r.run).toMatchObject({ verdict: 'failed', reason: 'protocol' });
  });
  it('SF16: a valid first summary followed by a terminated partial second line remains incomplete', () => {
    const r = new Rig().boot(); r.event({ type: 'tick' }, 60_000);
    r.data(wire('reference').split('\n')[0] + '\n{"blb":'); r.finish(60_050, null, 'SIGTERM');
    expect(r.run).toMatchObject({ verdict: 'inconclusive', reason: 'control_deadline' });
    expect(r.run.streams.protocol).toBe('incomplete');
  });
  it.each([
    ['{', true], ['{"a":', true], ['{"a":[1,', true], ['{"a":"\\u0', true],
    ['{"a":"\\x', false], ['{"a":01', false], ['{"a":1e+', true], ['{"a":1e?', false],
    ['{"a":tru', true], ['{"a":trX', false], ['{"a":??', false], ['{"a":1,}', false],
    ['{"a":[1,]}', false], ['[{}', false], ['{\n', false], ['{"a":'.repeat(18), false],
  ] as const)('SF16/SF17: incomplete-prefix grammar %j => %s, not a value acceptance', (text, expected) => {
    expect(isIncompleteBodyLiveControl(new TextEncoder().encode(text))).toBe(expected);
  });
  it.each([false, true])('SF18: cancellation (summary=%s) survives late code 0 and repeated cancel', summary => {
    const r = new Rig().boot(); if (summary) r.output();
    r.event({ type: 'cancel' }, 10); r.event({ type: 'cancel' }); r.finish(100);
    expect(r.run).toMatchObject({ verdict: 'failed', first: 'cancelled' });
    expect(r.log.filter(x => x.kind === 'signal')).toHaveLength(1);
  });
  it.each(['throw', 'nan', 'reverse'] as const)('SF19: clock %s leaves time and cleanup Unknown', fault => {
    const r = new Rig().boot(10);
    if (fault === 'throw') r.event({ type: 'fault', point: 'clock' });
    else r.event({ type: 'tick' }, fault === 'nan' ? NaN : 9);
    r.deliver(); expect(r.run).toMatchObject({ phase: 'done', verdict: 'failed', first: 'clock', cleanupConfirmed: false });
    expect(r.run.execution.timeKnown).toBe(false);
  });
  it('SF20: identical exit is idempotent, conflicting exit and foreign token reject without replacing first', () => {
    const r = new Rig().boot(); r.event({ type: 'exit', code: 0, signal: null });
    r.event({ type: 'exit', code: 0, signal: null }); expect(r.run.first).toBe('none');
    r.event({ type: 'exit', code: 1, signal: null });
    r.s.send({}, 0, { type: 'tick' }); r.collect();
    expect(r.run.first).toBe('event_conflict'); expect(r.run.execution.flags).toContain('origin');
    expect(r.run.process.exit?.code).toBe(0);
  });
  it('SF21: ceiling keeps unresolved duties and emits one report, never root deletion', () => {
    const r = new Rig().boot(); r.event({ type: 'tick' }, 60_000); r.event({ type: 'tick' }, 63_000);
    r.deliver(); r.event({ type: 'tick' }, 64_000);
    expect(r.run.retainedDuty).toBe(true);
    expect(r.log.filter(x => x.kind === 'report')).toHaveLength(1);
    expect(r.log.filter(x => x.kind === 'remove')).toHaveLength(0);
  });
  it.each(['prepare', 'remove', 'report', 'parent_lost', 'escaped'] as const)('SF22/SF23/SF24: retains %s failure without escalating ownership', point => {
    const r = new Rig();
    if (point === 'prepare') { r.start(); r.event({ type: 'prepared', ok: false }); r.deliver(); }
    else {
      r.boot(); r.output();
      if (point === 'remove' || point === 'report') {
        r.event({ type: 'end', stream: 'stdout' }); r.event({ type: 'end', stream: 'stderr' });
        r.event({ type: 'exit', code: 0, signal: null }); r.event({ type: 'close', code: 0, signal: null });
        r.event({ type: 'group', state: 'absent' }); r.event({ type: 'tick' }, 100); r.event({ type: 'group', state: 'absent' });
        r.deliver(point !== 'remove', point !== 'report');
      } else { r.event({ type: 'fault', point }); r.deliver(); }
    }
    expect(r.run).toMatchObject({ verdict: 'failed', first: point }); expect(r.s.start(r.now)).toBeUndefined();
    expect(r.log.every(x => x.ordinal === 1)).toBe(true);
  });
  it('SF25 boundary only: rejects checkpoint events rather than silently widening the two-summary protocol', () => {
    const r = new Rig().boot(); r.data('{"version":2,"phase":"start"}\n' + wire('reference')); r.finish(1_000);
    expect(r.run).toMatchObject({ verdict: 'failed', reason: 'protocol' });
  });
  it('SF18/SF23: cancellation between removal and report acknowledgement cannot publish passed', () => {
    const r = new Rig().boot(); r.output();
    r.event({ type: 'end', stream: 'stdout' }); r.event({ type: 'end', stream: 'stderr' });
    r.event({ type: 'exit', code: 0, signal: null }); r.event({ type: 'close', code: 0, signal: null });
    r.event({ type: 'group', state: 'absent' }); r.event({ type: 'tick' }, 100); r.event({ type: 'group', state: 'absent' });
    r.event({ type: 'removed', ok: true }); r.event({ type: 'cancel' }); r.event({ type: 'reported', ok: true });
    expect(r.run).toMatchObject({ verdict: 'failed', first: 'cancelled' });
    expect(r.s.start(r.now)).toBeUndefined();
  });
  it('SF16: a child failure before the deadline must not become an inconclusive control timeout', () => {
    const r = new Rig().boot(); r.event({ type: 'exit', code: 1, signal: null }, 10);
    r.finish(60_000, 1);
    expect(r.run).toMatchObject({ verdict: 'failed', first: 'child' });
  });
  it('SF15: the JS arm remains failed at the exact deadline', () => {
    const r = new Rig().boot(); r.output(); r.finish(1_000); r.boot(r.now + 1); r.output();
    r.finish(r.run.deadline); expect(r.run).toMatchObject({ verdict: 'failed', reason: 'child_deadline' });
  });
  it('SF20: a copied token and an old run token cannot control another run', () => {
    const r = new Rig().boot(), old = r.token;
    r.output(); r.finish(1_000); r.boot(r.now + 1);
    expect(r.s.send({ ...r.token }, r.now, { type: 'tick' })).toBe(false);
    expect(r.s.send(old, r.now, { type: 'tick' })).toBe(false);
    expect(r.run.first).toBe('origin'); expect(r.s.inspect().starts).toBe(2);
  });
  it('SF20: event and command queues have finite bounds even if the fake refuses to drain', () => {
    const s = createBodyLiveSupervisor(), token = s.start(0)!;
    s.send(token, 0, { type: 'prepared', ok: true }); s.send(token, 0, { type: 'spawned', pid: 42 });
    for (let i = 0; i < 131_204; i++) s.send(token, 0, { type: 'tick' });
    expect(s.inspect().run).toMatchObject({ events: 131_200, first: 'event_limit' });
    expect(s.drain().length).toBeLessThanOrEqual(32);
  });
  it.each(['remove', 'report'] as const)('SF21/SF22/SF23: missing %s acknowledgement cannot hold the parent forever', point => {
    const r = new Rig().boot(); r.output();
    r.event({ type: 'end', stream: 'stdout' }); r.event({ type: 'end', stream: 'stderr' });
    r.event({ type: 'exit', code: 0, signal: null }); r.event({ type: 'close', code: 0, signal: null });
    r.event({ type: 'group', state: 'absent' }); r.event({ type: 'tick' }, 100); r.event({ type: 'group', state: 'absent' });
    if (point === 'report') r.event({ type: 'removed', ok: true });
    r.event({ type: 'tick' }, 3_000);
    expect(r.run).toMatchObject({ phase: 'done', verdict: 'failed', first: point, reportDelivered: false });
    expect(r.s.start(r.now)).toBeUndefined();
  });
  it.each([0, 1])('SF11/SF14: refuses pid %i so no group signal can target the parent or every process', pid => {
    const r = new Rig(); r.start(); r.event({ type: 'prepared', ok: true }); r.event({ type: 'spawned', pid });
    r.event({ type: 'cancel' });
    expect(r.run).toMatchObject({ first: 'event_conflict', process: { spawned: false } });
    expect(r.log.filter(x => x.kind === 'listen' || x.kind === 'signal')).toHaveLength(0);
  });
  it.each([
    ['mode', (_: Record<string, unknown>, x: Record<string, unknown>) => { x.mode = 'js'; }],
    ['payloadEmits', (_: Record<string, unknown>, x: Record<string, unknown>) => { x.payloadEmits = 2; }],
    ['loader', (_: Record<string, unknown>, x: Record<string, unknown>) => { (x.loader as { writes: number }).writes = 303; }],
    ['caseDigest format', (_: Record<string, unknown>, x: Record<string, unknown>) => { (x.execution as { caseDigests: string[] }).caseDigests[0] = 'x'; }],
    ['caseDigest count', (_: Record<string, unknown>, x: Record<string, unknown>) => { (x.execution as { caseDigests: string[] }).caseDigests.push('f'.repeat(64)); }],
    ['execution keys', (_: Record<string, unknown>, x: Record<string, unknown>) => { (x.execution as Record<string, unknown>).extra = 1; }],
  ] as const)('SF06: the strict summary check rejects a %s change on its own', (_, change) => {
    const encode = (t: string) => new TextEncoder().encode(t);
    expect(inspectBodyLiveProtocol(encode(wire('reference')), 'reference').ok).toBe(true);
    expect(inspectBodyLiveProtocol(encode(wire('reference', change)), 'reference')).toEqual({ ok: false });
  });
  it('SF16/SF17: a third line is never an incomplete control prefix', () => {
    const first = wire('reference').split('\n')[0];
    expect(isIncompleteBodyLiveControl(new TextEncoder().encode(first + '\n{"blb":'))).toBe(true);
    expect(isIncompleteBodyLiveControl(new TextEncoder().encode(first + '\n{"blb":\n{'))).toBe(false);
  });
  it('SF21: a stop first observed after the deadline still ends cleanup at t0 + 63 s', () => {
    const r = new Rig().boot(); r.event({ type: 'tick' }, 60_500);
    expect(r.run).toMatchObject({ first: 'deadline', cleanupDeadline: 63_000 });
  });
  it('SF12/SF13: an Unknown group answer after one second never authorizes SIGKILL', () => {
    const r = new Rig().boot(); r.event({ type: 'cancel' }); r.event({ type: 'signal', name: 'SIGTERM', result: 'ok' });
    r.event({ type: 'group', state: 'unknown' }, 1_000); r.event({ type: 'tick' }, 1_500);
    expect(r.log.filter(x => x.signal === 'SIGKILL')).toHaveLength(0);
    expect(r.run.execution.flags).toContain('group');
  });
  it('SF13: no signal is sent to a group already observed absent', () => {
    const r = new Rig().boot(); r.output();
    r.event({ type: 'end', stream: 'stdout' }); r.event({ type: 'end', stream: 'stderr' });
    r.event({ type: 'exit', code: 0, signal: null }); r.event({ type: 'close', code: 0, signal: null }, 100);
    r.event({ type: 'group', state: 'absent' }); r.event({ type: 'cancel' }, 150);
    expect(r.run.first).toBe('cancelled');
    expect(r.log.filter(x => x.kind === 'signal')).toHaveLength(0);
  });
  it.each(['clock', 'escaped'] as const)('SF19/SF24: a %s fault after full collection leaves cleanup unconfirmed', point => {
    const r = new Rig().boot(); r.output();
    r.event({ type: 'end', stream: 'stdout' }); r.event({ type: 'end', stream: 'stderr' });
    r.event({ type: 'exit', code: 0, signal: null }); r.event({ type: 'close', code: 0, signal: null });
    r.event({ type: 'group', state: 'absent' }); r.event({ type: 'tick' }, 100); r.event({ type: 'group', state: 'absent' });
    expect(r.run.phase).toBe('removing');
    r.event({ type: 'fault', point });
    expect(r.run).toMatchObject({ first: point, cleanupConfirmed: false, retainedDuty: true });
  });
  it('SF20: the undrained command queue stops at 32 values and records the limit', () => {
    const s = createBodyLiveSupervisor(), token = s.start(0)!;
    s.send(token, 0, { type: 'prepared', ok: true }); s.send(token, 0, { type: 'spawned', pid: 42 });
    s.send(token, 0, { type: 'cancel' });
    for (let t = 100; t < 3_000; t += 100) { s.send(token, t, { type: 'tick' }); s.send(token, t, { type: 'group', state: 'alive' }); }
    expect(s.drain()).toHaveLength(32);
    expect(s.inspect().run?.execution.flags).toContain('event_limit');
  });
  it('SF20: an exit/close disagreement is diagnosed as a conflict, not only as a child failure', () => {
    const r = new Rig().boot(); r.event({ type: 'exit', code: 0, signal: null }); r.event({ type: 'close', code: 0, signal: 'SIGTERM' });
    expect(r.run.execution.flags).toEqual(expect.arrayContaining(['event_conflict', 'child']));
  });
  it('SF04/SF20: a missing stderr listener cannot be supplied after terminal classification', () => {
    const r = new Rig(); r.start(); r.event({ type: 'prepared', ok: true }); r.event({ type: 'spawned', pid: 42 });
    r.event({ type: 'attach', stream: 'stdout' }); r.output();
    r.event({ type: 'end', stream: 'stdout' }); r.event({ type: 'end', stream: 'stderr' });
    r.event({ type: 'exit', code: 0, signal: null }); r.event({ type: 'close', code: 0, signal: null });
    r.event({ type: 'signal', name: 'SIGTERM', result: 'ok' });
    r.event({ type: 'group', state: 'absent' }); r.event({ type: 'tick' }, 100); r.event({ type: 'group', state: 'absent' });
    r.event({ type: 'attach', stream: 'stderr' }); r.deliver();
    expect(r.run.verdict).toBe('failed');
    expect(r.run.streams.stderr.attached).toBe(false);
  });
});

// Mutate only scratch-generated in-memory JS; source files and the normal runner are never patched.
const kernelText = readFileSync(new URL('./fixtures/body-live-supervisor.ts', import.meta.url), 'utf8');
const protocolText = readFileSync(new URL('./fixtures/body-live-supervisor-protocol.ts', import.meta.url), 'utf8');
const emit = (text: string) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const dataURL = (text: string) => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
async function variant(changes: readonly (readonly [string, string])[]) {
  let text = kernelText;
  for (const [before, after] of changes) {
    expect(text.split(before)).toHaveLength(2); // Drift/import/syntax errors never count as kills.
    text = text.replace(before, after);
  }
  const js = emit(text).replace("'./body-live-supervisor-protocol.js'", JSON.stringify(dataURL(emit(protocolText))));
  const loaded = await import(/* @vite-ignore */ dataURL(js)) as { createBodyLiveSupervisor: typeof createBodyLiveSupervisor };
  return loaded.createBodyLiveSupervisor;
}
type Factory = typeof createBodyLiveSupervisor;
const sensitivity: { id: string; changes: readonly (readonly [string, string])[]; probe: (factory: Factory) => boolean }[] = [
  { id: 'SF08 listen/drain', changes: [["command(r, 'listen', { stream: 'stdout' });", '']],
    probe: f => new Rig(f).boot().log.some(x => x.kind === 'listen' && x.stream === 'stdout') },
  { id: 'SF02 byte cap', changes: [['s.truncated ||= s.seen > STREAM_BYTES;', 's.truncated ||= s.seen > STREAM_BYTES + 1;']],
    probe: f => { const r = new Rig(f).boot(); r.data(new Uint8Array(65_537)); return r.run.streams.stdout.truncated; } },
  { id: 'SF02 byte not character counting', changes: [['const counted = addSupervisorBytes(s.seen, e.bytes.byteLength);',
    'const counted = addSupervisorBytes(s.seen, new TextDecoder().decode(e.bytes).length);']],
    probe: f => { const r = new Rig(f).boot(); r.data('€'.repeat(21_846)); return r.run.streams.stdout.truncated; } },
  { id: 'SF09 exit is not close', changes: [['r[e.type] = { code: e.code, signal: e.signal, at: now };',
    "r[e.type] = { code: e.code, signal: e.signal, at: now }; if (e.type === 'exit') r.close = r.exit;"]],
    probe: f => { const r = new Rig(f).boot(); r.event({ type: 'exit', code: 0, signal: null }); return r.run.process.close === undefined; } },
  { id: 'SF12 two absent probes', changes: [['r.absent = 1; r.absentAt = now;', 'r.absent = 2; r.absentAt = now;']],
    probe: f => { const r = new Rig(f).boot(); r.output(); r.event({ type: 'close', code: 0, signal: null });
      r.event({ type: 'group', state: 'absent' }); return r.run.group.absent === 1; } },
  { id: 'SF17 deadline priority', changes: [["if (anomalies.length) {", "if (r.mode === 'reference' && r.flags.has('deadline')) { r.verdict = 'inconclusive'; r.reason = 'control_deadline'; return; }\n    if (anomalies.length) {"]],
    probe: f => { const r = new Rig(f).boot(); r.event({ type: 'tick' }, 60_000); r.data(new Uint8Array(65_537)); r.finish(60_050, null, 'SIGTERM'); return r.run.verdict === 'failed'; } },
  { id: 'SF15 absolute observed deadline', changes: [
    ["if (r.phase !== 'done' && !r.close && now >= r.deadline) stop(r, 'deadline');", ''],
    ["if (now >= r.deadline) stop(r, 'deadline');", '']],
    probe: f => { const r = new Rig(f).boot(); r.output(); r.finish(60_000); return r.run.verdict !== 'passed'; } },
  { id: 'SF18 next-run gate', changes: [["if (first !== 'none' || starts === 4 || (active && (active.phase !== 'done' || active.verdict !== 'passed' || !active.reportDelivered))) return undefined;", 'if (starts === 4) return undefined;']],
    probe: f => { const r = new Rig(f).boot(); return r.s.start(0) === undefined; } },
];
describe('SG-A independent sensitivity controls (in-memory modules, no child processes)', () => {
  it.each(sensitivity)('$id kills its semantic bypass, never an import failure', async ({ changes, probe }) => {
    expect(probe(createBodyLiveSupervisor)).toBe(true);
    expect(probe(await variant(changes))).toBe(false);
  });
});
