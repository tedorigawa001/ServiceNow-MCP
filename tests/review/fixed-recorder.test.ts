import { describe, expect, it } from 'vitest';
import { FakeFixedRecorder, planTime, type Timing, type Checkpoint } from './fixtures/fixed-recorder.js';

function setup() {
  let at = 0;
  const timing: Timing = { startedAt: 0, outerMs: 300_000, sessionDeadline: 600_000, marginMs: 1_000,
    reservations: { stop: 1_000, force: 2_000, confirm: 3_000, flush: 4_000, manifest: 5_000, final: 6_000 } };
  const recorder = FakeFixedRecorder.create(timing, () => at)!;
  return { recorder, timing, set: (value: number) => { at = value; } };
}
function drain(recorder: FakeFixedRecorder) {
  while (recorder.snapshot().checkpoints.length) expect(recorder.acknowledge(recorder.snapshot().checkpoints[0])).toBe(true);
}
function started() {
  const f = setup();
  expect(f.recorder.reserve(true)).toBe(true);
  drain(f.recorder);
  expect(f.recorder.start()).toBe(true);
  return f;
}

describe('fixed recorder: pure fake outer time planner', () => {
  it('matches an independently handwritten reservation oracle; copies inputs', () => {
    const { timing } = setup();
    const plan = planTime(timing)!;
    expect(plan).toEqual({ startedAt: 0, stop: 279_000, all: 300_000, minimum: 219_000,
      stages: [280_000, 282_000, 285_000, 289_000, 294_000, 300_000] });
    timing.reservations.stop = 999;
    expect(plan.stages[0]).toBe(280_000);
    expect(Object.isFrozen(plan.stages)).toBe(true);
  });
  it('uses the earlier session deadline rather than granting a fresh outer window', () => {
    const { timing } = setup();
    timing.sessionDeadline = 280_000;
    expect(planTime(timing)?.stop).toBe(259_000);
    timing.sessionDeadline = 240_000;
    expect(planTime(timing)).toBeUndefined(); // exactly 218s + 1s margin is insufficient
    timing.sessionDeadline++;
    expect(planTime(timing)?.stop).toBe(219_001);
  });
  it.each([NaN, Infinity, -1, 0, 0.5, Number.MAX_SAFE_INTEGER])('rejects invalid/overflow reservation %s', n => {
    const { timing } = setup();
    timing.reservations.flush = n;
    expect(planTime(timing)).toBeUndefined();
  });
  it.each(['startedAt', 'outerMs', 'sessionDeadline', 'marginMs'] as const)('rejects invalid %s', key => {
    const { timing } = setup();
    timing[key] = NaN;
    expect(FakeFixedRecorder.create(timing, () => 0)).toBeUndefined();
  });
  it('rejects safe inputs whose addition overflows', () => {
    const { timing } = setup();
    timing.startedAt = Number.MAX_SAFE_INTEGER - 1;
    expect(planTime(timing)).toBeUndefined();
    timing.startedAt = 0;
    timing.marginMs = Number.MAX_SAFE_INTEGER;
    expect(planTime(timing)).toBeUndefined();
  });
});

describe('fixed recorder: state and one-shot checkpoint planner', () => {
  it('takes the full normal sequence without storage or process effects', () => {
    const { recorder } = started();
    expect(recorder.endTest('passed', true)).toBe(true);
    expect(recorder.snapshot().state).toBe('Draining');
    drain(recorder);
    expect(recorder.verify(true)).toBe(true);
    expect(recorder.snapshot().state).toBe('Verifying');
    expect(recorder.publish(true)).toBe(true);
    expect(recorder.snapshot().state).toBe('Published');
    expect(recorder.close()).toBe(true);
    expect(recorder.snapshot().state).toBe('Closed');
    expect(recorder.snapshot().axes).toEqual({ test_result: 'passed', measurement: 'complete', preservation: 'verified', termination: 'confirmed' });
    const before = recorder.snapshot();
    expect(recorder.cancel()).toBe(false);
    expect(recorder.close()).toBe(false);
    expect(recorder.snapshot()).toEqual(before);
  });
  it('requires conditions acknowledgement before starting and never resumes after rejection', () => {
    const { recorder } = setup();
    expect(recorder.reserve(true)).toBe(true);
    expect(recorder.start()).toBe(false);
    expect(recorder.snapshot().state).toBe('Closed');
    expect(recorder.start()).toBe(false);
    expect(recorder.reserve(true)).toBe(false);
    expect(recorder.snapshot().reason).toBe('state');
  });
  it('retains all six finite trigger slots; repeated anomalies/polls do not issue again', () => {
    const { recorder, set } = setup();
    recorder.reserve(true);
    const first = recorder.snapshot().checkpoints[0];
    recorder.acknowledge(first);
    recorder.start();
    recorder.testAnomaly();
    set(120_000);
    expect(recorder.poll()).toBe(true);
    expect(recorder.snapshot().issued).toBe(3);
    set(120_001);
    for (let i = 0; i < 1_000; i++) {
      expect(recorder.testAnomaly()).toBe(true);
      expect(recorder.poll()).toBe(true);
    }
    expect(recorder.endTest('failed', true)).toBe(true);
    recorder.cancel();
    recorder.recorderFailure();
    const view = recorder.snapshot();
    expect(view.issued).toBe(6);
    expect([first, ...view.checkpoints].map(x => [x.sequence, x.trigger])).toEqual([
      [1, 'conditions_ready'], [2, 'child_started'], [3, 'first_anomaly'],
      [4, 'slow_hint'], [5, 'test_terminal'], [6, 'stop_requested'],
    ]);
    expect(view.reason).toBe('cancelled');
    expect(view.axes.test_result).toBe('failed');
    expect(view.testFailure).toBe(true);
    expect(Object.isFrozen(view.checkpoints[0])).toBe(true);
    drain(recorder);
    expect(recorder.snapshot().issued).toBe(6); // draining is not quota reset
  });
  it.each(['copy', 'foreign', 'replay', 'out_of_order'])('rejects %s checkpoint without consuming the wrong slot', mode => {
    const { recorder } = setup();
    recorder.reserve(true);
    const slot = recorder.snapshot().checkpoints[0];
    let wrong: Checkpoint = { ...slot };
    if (mode === 'foreign') {
      const other = setup().recorder;
      other.reserve(true);
      wrong = other.snapshot().checkpoints[0];
    }
    if (mode === 'replay' || mode === 'out_of_order') {
      recorder.acknowledge(slot);
      recorder.start();
      if (mode === 'out_of_order') {
        recorder.testAnomaly();
        wrong = recorder.snapshot().checkpoints[1];
      } else wrong = slot;
    }
    const original = recorder.snapshot().checkpoints[0];
    expect(recorder.acknowledge(wrong)).toBe(false);
    expect(recorder.snapshot().checkpoints[0]).toBe(original);
    expect(recorder.snapshot().reason).toBe('checkpoint');
  });
  it.each(['start', 'poll', 'testAnomaly', 'verify', 'publish', 'close'] as const)('rejects %s before reserve, sticky', action => {
    const { recorder } = setup();
    const result = action === 'verify' ? recorder.verify(true) : action === 'publish' ? recorder.publish(true) : recorder[action]();
    expect(result).toBe(false);
    expect(recorder.reserve(true)).toBe(false);
  });
  it('rejects gate denial and repeated reserve without creating a fresh run', () => {
    const { recorder } = setup();
    expect(recorder.reserve(false)).toBe(false);
    expect(recorder.reserve(true)).toBe(false);
    expect(recorder.snapshot().reason).toBe('binding');
    const next = setup().recorder;
    next.reserve(true);
    expect(next.reserve(true)).toBe(false);
    expect(next.start()).toBe(false);
  });
});

describe('fixed recorder: four independent fake terminal axes', () => {
  for (const result of ['passed', 'failed', 'incomplete'] as const) {
    for (const measurement of [true, false]) for (const preserved of [true, false]) for (const exited of [true, false]) {
      it(`${result}: measurement=${measurement}, preserved=${preserved}, exited=${exited}`, () => {
        const { recorder } = started();
        expect(recorder.endTest(result, measurement)).toBe(true);
        drain(recorder);
        expect(recorder.verify(exited)).toBe(true);
        expect(recorder.publish(preserved)).toBe(true);
        expect(recorder.close()).toBe(preserved);
        expect(recorder.snapshot().axes).toEqual({ test_result: result, measurement: measurement ? 'complete' : 'incomplete',
          preservation: preserved ? 'verified' : 'unverified', termination: exited ? 'confirmed' : 'unconfirmed' });
      });
    }
  }
  it('does not turn a first test failure into passing or erase it with cleanup failure', () => {
    const { recorder } = started();
    recorder.testAnomaly();
    expect(recorder.endTest('passed', true)).toBe(false);
    recorder.recorderFailure();
    expect(recorder.snapshot().testFailure).toBe(true);
    expect(recorder.snapshot().reason).toBe('binding');
    recorder.abandon();
    expect(recorder.snapshot().axes.preservation).toBe('unverified');
    expect(recorder.snapshot().axes.termination).toBe('unconfirmed');
  });
  it('cannot publish with pending checkpoints or verify twice', () => {
    const { recorder } = started();
    recorder.endTest('passed', true);
    recorder.verify(true);
    expect(recorder.publish(true)).toBe(false);
    expect(recorder.verify(true)).toBe(false);
    recorder.abandon();
    expect(recorder.snapshot().state).toBe('Closed');
    expect(recorder.publish(true)).toBe(false);
  });
  it.each(['Draining', 'Verifying', 'Published'] as const)('records cancellation in %s without backwards transition', state => {
    const { recorder } = started();
    recorder.endTest('failed', true);
    drain(recorder);
    if (state !== 'Draining') recorder.verify(true);
    if (state === 'Published') recorder.publish(true);
    expect(recorder.cancel()).toBe(false);
    expect(recorder.snapshot().state).toBe(state);
    expect(recorder.snapshot().axes.measurement).toBe('complete');
    expect(recorder.snapshot().axes.test_result).toBe('failed');
    if (state === 'Published') expect(recorder.snapshot().axes.preservation).toBe('verified');
    recorder.recorderFailure();
    expect(recorder.snapshot().reason).toBe('cancelled');
    expect(recorder.snapshot().state).toBe(state);
  });
  it('closes directly on reserved cancellation and on preservation failure', () => {
    const first = setup().recorder;
    first.reserve(true);
    first.cancel();
    expect(first.snapshot().state).toBe('Closed');
    expect(first.start()).toBe(false);
    const { recorder } = started();
    recorder.endTest('failed', true);
    drain(recorder);
    recorder.verify(true);
    expect(recorder.publish(false)).toBe(true);
    expect(recorder.snapshot().state).toBe('Closed');
    expect(recorder.snapshot().axes.preservation).toBe('unverified');
    expect(recorder.publish(true)).toBe(false);
  });
});

describe('fixed recorder: immutable outer origin and fake clock failures', () => {
  it('counts preparation time and refuses an insufficient remaining window', () => {
    const { recorder, set } = setup();
    recorder.reserve(true);
    drain(recorder);
    set(60_000);
    expect(recorder.start()).toBe(false); // 279000 - 60000 = 219000, strict greater required
    expect(recorder.snapshot().reason).toBe('window');
    expect(recorder.snapshot().deadlines.startedAt).toBe(0);
  });
  it('does not stop at 120 seconds; late delivery at D_stop stops without extending', () => {
    const { recorder, set } = started();
    set(120_001);
    expect(recorder.poll()).toBe(true);
    set(279_000);
    expect(recorder.poll()).toBe(false);
    expect(recorder.snapshot().reason).toBe('deadline');
    expect(recorder.snapshot().deadlines.all).toBe(300_000);
    expect(recorder.start()).toBe(false);
  });
  it.each([NaN, Infinity, -1, 0.5])('rejects invalid clock %s with fixed diagnostics', at => {
    const f = started();
    f.set(at);
    expect(f.recorder.poll()).toBe(false);
    expect(f.recorder.snapshot().reason).toBe('clock');
  });
  it('rejects regression and throws without retaining raw secrets', () => {
    const f = started();
    f.set(5);
    f.recorder.poll();
    f.set(4);
    expect(f.recorder.poll()).toBe(false);
    expect(f.recorder.snapshot().reason).toBe('clock');
    const { timing } = setup();
    const recorder = FakeFixedRecorder.create(timing, () => { throw Error('SECRET'); })!;
    expect(recorder.reserve(true)).toBe(false);
    expect(JSON.stringify(recorder.snapshot())).not.toContain('SECRET');
    expect(recorder.snapshot().reason).toBe('clock');
  });
  it.each(['cancel', 'reenter'] as const)('does not revive after clock callback %s', mode => {
    const { timing } = setup();
    let recorder: FakeFixedRecorder;
    let invoke = false;
    recorder = FakeFixedRecorder.create(timing, () => {
      if (invoke) {
        if (mode === 'cancel') recorder.cancel();
        else recorder.poll();
      }
      return 0;
    })!;
    recorder.reserve(true);
    drain(recorder);
    recorder.start();
    invoke = true;
    expect(recorder.poll()).toBe(false);
    expect(recorder.snapshot().state).toBe('Draining');
    expect(recorder.snapshot().reason).toBe(mode === 'cancel' ? 'cancelled' : 'clock');
    expect(recorder.start()).toBe(false);
  });
  it.each([['anomaly', 'slow'], ['slow', 'anomaly']] as const)('assigns sequences in actual %s/%s order', (first, second) => {
    const { recorder, set } = started();
    const actions = { anomaly: () => recorder.testAnomaly(), slow: () => { set(120_001); return recorder.poll(); } };
    actions[first]();
    actions[second]();
    expect(recorder.snapshot().checkpoints.map(slot => slot.trigger)).toEqual([
      'child_started', first === 'anomaly' ? 'first_anomaly' : 'slow_hint', second === 'anomaly' ? 'first_anomaly' : 'slow_hint',
    ]);
    expect(recorder.snapshot().checkpoints.map(slot => slot.sequence)).toEqual([2, 3, 4]);
  });
  it.each(['verify', 'publish', 'close'] as const)('enforces the reserved %s deadline at equality', phase => {
    const { recorder, set } = started();
    recorder.endTest('failed', true);
    drain(recorder);
    if (phase === 'verify') set(285_000);
    else {
      expect(recorder.verify(true)).toBe(true);
      if (phase === 'publish') set(294_000);
      else { expect(recorder.publish(true)).toBe(true); set(300_000); }
    }
    expect(phase === 'verify' ? recorder.verify(true) : phase === 'publish' ? recorder.publish(true) : recorder.close()).toBe(false);
    expect(recorder.snapshot().reason).toBe('deadline');
    expect(recorder.snapshot().axes.test_result).toBe('failed');
    if (phase === 'publish') expect(recorder.snapshot().state).toBe('Closed');
    recorder.abandon();
    expect(recorder.snapshot().state).toBe('Closed');
    expect(recorder.snapshot().axes.preservation).toBe(phase === 'close' ? 'verified' : 'unverified');
  });
  it('keeps a pending checkpoint until the whole deadline, not the observation stop', () => {
    const { recorder, set } = started();
    recorder.endTest('failed', true);
    set(299_999);
    expect(recorder.acknowledge(recorder.snapshot().checkpoints[0])).toBe(true);
    const pending = recorder.snapshot().checkpoints[0];
    set(300_000);
    expect(recorder.acknowledge(pending)).toBe(false);
    expect(recorder.snapshot().checkpoints[0]).toBe(pending);
    expect(recorder.snapshot().reason).toBe('deadline');
  });
});

describe('fixed recorder: review regressions', () => {
  it.each([
    ['startedAt', -1], ['startedAt', 0.5],
    ['outerMs', 300_000.5], ['sessionDeadline', 600_000.5],
    ['marginMs', 0], ['marginMs', -1],
  ] as const)('rejects %s=%s even where a later check would not notice', (key, value) => {
    const { timing } = setup();
    if (key === 'outerMs') timing.sessionDeadline = 280_000;
    timing[key] = value;
    expect(planTime(timing)).toBeUndefined();
  });
  it.each(['recorderFailure', 'clock', 'checkpoint', 'cancel'] as const)('keeps complete measurement after a post-terminal %s', cause => {
    const f = started();
    expect(f.recorder.endTest('passed', true)).toBe(true);
    drain(f.recorder);
    if (cause === 'recorderFailure') f.recorder.recorderFailure();
    if (cause === 'cancel') f.recorder.cancel();
    if (cause === 'checkpoint') f.recorder.acknowledge({ sequence: 1, trigger: 'test_terminal', at: 0 });
    if (cause === 'clock') { f.set(5); f.recorder.verify(true); f.set(4); f.recorder.publish(true); }
    expect(f.recorder.snapshot().reason).toBe(cause === 'recorderFailure' ? 'recorder' : cause === 'cancel' ? 'cancelled' : cause);
    expect(f.recorder.snapshot().axes).toMatchObject({ test_result: 'passed', measurement: 'complete' });
  });
  it('keeps measurement and preservation when a failure follows Published', () => {
    const { recorder } = started();
    recorder.endTest('passed', true);
    drain(recorder);
    recorder.verify(true);
    recorder.publish(true);
    const issued = recorder.snapshot().issued;
    recorder.recorderFailure();
    recorder.cancel();
    expect(recorder.snapshot().issued).toBe(issued);
    expect(recorder.snapshot().axes).toEqual({ test_result: 'passed', measurement: 'complete', preservation: 'verified', termination: 'confirmed' });
    expect(recorder.abandon()).toBe(true);
    expect(recorder.snapshot().state).toBe('Closed');
    expect(recorder.snapshot().axes.preservation).toBe('verified');
  });
  it('reports checkpoints left behind by Closed as unsaved', () => {
    const { recorder } = setup();
    recorder.reserve(true);
    expect(recorder.snapshot().unsaved).toBe(0);
    recorder.cancel();
    const view = recorder.snapshot();
    expect(view.state).toBe('Closed');
    expect(view.checkpoints.map(slot => slot.trigger)).toEqual(['conditions_ready', 'stop_requested']);
    expect(view.unsaved).toBe(2);
    expect(recorder.acknowledge(view.checkpoints[0])).toBe(false);
    expect(recorder.snapshot().unsaved).toBe(2);
    const open = started().recorder;
    expect(open.snapshot().unsaved).toBe(0);
    open.endTest('failed', true);
    open.abandon();
    expect(open.snapshot().checkpoints.map(slot => slot.trigger)).toEqual(['child_started', 'test_terminal', 'stop_requested']);
    expect(open.snapshot().unsaved).toBe(3);
  });
  it('does not spend the stop slot on a stray call after the terminal', () => {
    const { recorder } = started();
    recorder.endTest('passed', true);
    drain(recorder);
    expect(recorder.poll()).toBe(false);
    expect(recorder.snapshot().reason).toBe('state');
    expect(recorder.snapshot().checkpoints).toEqual([]);
    recorder.verify(true);
    expect(recorder.start()).toBe(false);
    expect(recorder.snapshot().checkpoints).toEqual([]);
    expect(recorder.snapshot().state).toBe('Verifying');
  });
  it('still records a stop when the same misuse happens while observing', () => {
    const { recorder } = started();
    expect(recorder.start()).toBe(false);
    expect(recorder.snapshot().state).toBe('Draining');
    expect(recorder.snapshot().checkpoints.map(slot => slot.trigger)).toEqual(['child_started', 'stop_requested']);
  });
  it('closes a denied gate directly', () => {
    const { recorder } = setup();
    expect(recorder.reserve(false)).toBe(false);
    expect(recorder.snapshot().state).toBe('Closed');
  });
  it.each(['result', 'complete', 'termination', 'preserved'] as const)('rejects a non-conforming runtime %s', field => {
    const { recorder } = started();
    if (field === 'result') expect(recorder.endTest('other' as never, true)).toBe(false);
    if (field === 'complete') expect(recorder.endTest('passed', 1 as never)).toBe(false);
    if (field === 'result' || field === 'complete') {
      expect(recorder.snapshot().reason).toBe('binding');
      expect(recorder.snapshot().axes.test_result).toBe('incomplete');
      return;
    }
    recorder.endTest('passed', true);
    drain(recorder);
    if (field === 'termination') {
      expect(recorder.verify('yes' as never)).toBe(false);
      expect(recorder.snapshot().reason).toBe('binding');
      expect(recorder.snapshot().axes.termination).toBe('unconfirmed');
      expect(recorder.snapshot().state).toBe('Draining');
      return;
    }
    recorder.verify(true);
    expect(recorder.publish(1 as never)).toBe(false);
    expect(recorder.snapshot().axes.preservation).toBe('unverified');
    expect(recorder.snapshot().state).toBe('Verifying');
  });
  it('returns snapshots that later transitions cannot change', () => {
    const { recorder } = started();
    const before = recorder.snapshot();
    expect(Object.isFrozen(before.axes)).toBe(true);
    expect(Object.isFrozen(before.checkpoints)).toBe(true);
    recorder.endTest('failed', true);
    expect(before.axes.test_result).toBe('incomplete');
    expect(before.checkpoints.map(slot => slot.trigger)).toEqual(['child_started']);
  });
});
