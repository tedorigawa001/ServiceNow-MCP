/** Pure synthetic model only. No store, process, dispatcher, timer or runtime authority. */
export const CHECKPOINT_LIMIT = 6;
export type Trigger = 'conditions_ready' | 'child_started' | 'first_anomaly' | 'slow_hint' | 'test_terminal' | 'stop_requested';
export type State = 'Gated' | 'Reserved' | 'Observing' | 'Draining' | 'Verifying' | 'Published' | 'Closed';
export type Reason = 'state' | 'clock' | 'deadline' | 'window' | 'checkpoint' | 'binding' | 'cancelled' | 'recorder';
type TestResult = 'passed' | 'failed' | 'incomplete';
export interface Axes {
  test_result: TestResult;
  measurement: 'complete' | 'incomplete';
  preservation: 'verified' | 'unverified';
  termination: 'confirmed' | 'unconfirmed';
}
export interface Reservations {
  stop: number; force: number; confirm: number; flush: number; manifest: number; final: number;
}
export interface Timing {
  startedAt: number; outerMs: number; sessionDeadline: number; marginMs: number;
  reservations: Reservations;
}
const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
const natural = (n: number) => Number.isSafeInteger(n) && n >= 0;
/** Explicit test values, not approved operational caps. Every reserve is inside all. */
export function planTime(input: Timing) {
  const { startedAt, outerMs, sessionDeadline, marginMs, reservations: r } = input;
  const values = [r.stop, r.force, r.confirm, r.flush, r.manifest, r.final];
  if (!natural(startedAt) || !positive(outerMs) || !positive(sessionDeadline)
    || !positive(marginMs) || !values.every(positive)) return undefined;
  const end = startedAt + outerMs;
  const sum = values.reduce((a, b) => a + b, 0);
  const minimum = 218_000 + marginMs;
  if (![end, sum, minimum].every(Number.isSafeInteger)) return undefined;
  const all = Math.min(end, sessionDeadline);
  const stop = all - sum;
  if (!natural(stop) || stop - startedAt <= minimum) return undefined;
  let deadline = stop;
  const stages = values.map(value => (deadline += value));
  return Object.freeze({ startedAt, stop, all, minimum, stages: Object.freeze(stages) });
}
export interface Checkpoint { readonly sequence: number; readonly trigger: Trigger; readonly at: number }

/** The only effects are bounded in-memory fake state transitions. */
export class FakeFixedRecorder {
  #state: State = 'Gated';
  #last: number;
  #failure: Reason | undefined;
  #testFailure = false;
  #triggers = new Set<Trigger>();
  #queue: Checkpoint[] = [];
  #axes: Axes = { test_result: 'incomplete', measurement: 'incomplete', preservation: 'unverified', termination: 'unconfirmed' };
  #ended = false;
  #verified = false;
  #conditionsWritten = false;
  #readingClock = false;
  readonly #plan: NonNullable<ReturnType<typeof planTime>>;
  private constructor(plan: NonNullable<ReturnType<typeof planTime>>, private readonly now: () => number) {
    this.#plan = plan;
    this.#last = plan.startedAt;
  }
  static create(input: Timing, now: () => number) {
    const plan = planTime(input);
    return plan ? new FakeFixedRecorder(plan, now) : undefined;
  }
  #stop(reason: Reason) {
    if (this.#state === 'Closed') return false;
    this.#failure ??= reason;
    if (this.#state !== 'Published') this.#axes.preservation = 'unverified';
    // A misused call after the terminal is only a diagnostic: it must not take the real stop slot.
    const stray = reason === 'state' && (this.#state === 'Draining' || this.#state === 'Verifying');
    if (this.#state !== 'Published' && !stray) this.#checkpoint('stop_requested', this.#last);
    if (this.#state === 'Gated' || this.#state === 'Reserved') this.#state = 'Closed';
    else if (this.#state === 'Observing') this.#state = 'Draining';
    return false;
  }
  #time(bound: number): number | undefined {
    if (this.#readingClock) { this.#stop('clock'); return undefined; }
    const state = this.#state;
    const failure = this.#failure;
    let at: number;
    this.#readingClock = true;
    try { at = this.now(); } catch { this.#stop('clock'); return undefined; }
    finally { this.#readingClock = false; }
    if (this.#state !== state || this.#failure !== failure) { this.#stop('clock'); return undefined; }
    if (!natural(at) || at < this.#last) { this.#stop('clock'); return undefined; }
    this.#last = at;
    if (at >= bound) {
      this.#stop('deadline');
      if (this.#state === 'Verifying') this.#state = 'Closed';
      return undefined;
    }
    return at;
  }
  #checkpoint(trigger: Trigger, at: number): Checkpoint | undefined {
    if (this.#triggers.has(trigger)) return undefined;
    // Distinct trigger slots bound both total issuance and queue, not just its current size.
    if (this.#triggers.size === CHECKPOINT_LIMIT || this.#queue.length === CHECKPOINT_LIMIT) return undefined;
    const slot = Object.freeze({ sequence: this.#triggers.size + 1, trigger, at });
    this.#triggers.add(trigger);
    this.#queue.push(slot);
    return slot;
  }
  reserve(gates: boolean) {
    if (this.#state !== 'Gated' || this.#failure) return this.#stop('state');
    if (gates !== true) return this.#stop('binding');
    const at = this.#time(this.#plan.stop);
    if (at === undefined) return false;
    this.#state = 'Reserved';
    this.#checkpoint('conditions_ready', at);
    return true;
  }
  /** Fake writer completion: identity and FIFO checks; never means physical preservation. */
  acknowledge(slot: Checkpoint) {
    if (this.#state === 'Closed') return false;
    if (this.#queue[0] !== slot) return this.#stop('checkpoint');
    if (this.#time(this.#plan.all) === undefined) return false;
    this.#queue.shift();
    if (slot.trigger === 'conditions_ready') this.#conditionsWritten = true;
    return true;
  }
  start() {
    if (this.#state !== 'Reserved' || this.#failure || !this.#conditionsWritten) return this.#stop('state');
    const at = this.#time(this.#plan.stop);
    if (at === undefined) return false;
    if (this.#plan.stop - at <= this.#plan.minimum) return this.#stop('window');
    this.#state = 'Observing';
    this.#checkpoint('child_started', at);
    return true;
  }
  poll() {
    if (this.#state !== 'Observing' || this.#failure) return this.#stop('state');
    const at = this.#time(this.#plan.stop);
    if (at === undefined) return false;
    if (at - this.#plan.startedAt > 120_000) this.#checkpoint('slow_hint', at);
    return true;
  }
  testAnomaly() {
    if (this.#state !== 'Observing' || this.#failure) return this.#stop('state');
    const at = this.#time(this.#plan.stop);
    if (at === undefined) return false;
    this.#testFailure = true;
    this.#checkpoint('first_anomaly', at);
    return true;
  }
  endTest(result: TestResult, complete: boolean) {
    if (this.#state !== 'Observing' || this.#failure || this.#ended) return this.#stop('state');
    if (!['passed', 'failed', 'incomplete'].includes(result) || typeof complete !== 'boolean'
      || (this.#testFailure && result === 'passed')) return this.#stop('binding');
    const at = this.#time(this.#plan.stop);
    if (at === undefined) return false;
    this.#ended = true;
    this.#axes.test_result = result;
    this.#axes.measurement = complete ? 'complete' : 'incomplete';
    this.#checkpoint('test_terminal', at);
    this.#state = 'Draining';
    return true;
  }
  cancel() { return this.#stop('cancelled'); }
  recorderFailure() { return this.#stop('recorder'); }
  /** Tests inject the separate fake termination result, not a root-exit inference. */
  verify(termination: boolean) {
    if (this.#state !== 'Draining' || this.#verified) return this.#stop('state');
    if (typeof termination !== 'boolean') return this.#stop('binding');
    if (this.#time(this.#plan.stages[2]) === undefined) return false;
    this.#verified = true;
    this.#axes.termination = termination ? 'confirmed' : 'unconfirmed';
    this.#state = 'Verifying';
    return true;
  }
  publish(preserved: boolean) {
    if (this.#state !== 'Verifying' || this.#queue.length || typeof preserved !== 'boolean') return this.#stop('state');
    if (this.#time(this.#plan.stages[4]) === undefined) return false;
    this.#axes.preservation = preserved ? 'verified' : 'unverified';
    this.#state = preserved ? 'Published' : 'Closed';
    return true;
  }
  close() {
    if (this.#state !== 'Published') return this.#stop('state');
    if (this.#time(this.#plan.all) === undefined) return false;
    this.#state = 'Closed';
    return true;
  }
  /** Explicit unconfirmed terminal for exhausted budget; never a publication success. */
  abandon() {
    if (this.#state === 'Closed') return false;
    // #stop keeps a preservation result that Published already established.
    this.#stop('recorder');
    this.#state = 'Closed';
    return true;
  }
  snapshot() {
    return Object.freeze({ state: this.#state, reason: this.#failure, testFailure: this.#testFailure,
      axes: Object.freeze({ ...this.#axes }), issued: this.#triggers.size,
      checkpoints: Object.freeze([...this.#queue]), deadlines: this.#plan,
      // Closed accepts no acknowledgement, so what remains was never saved.
      unsaved: this.#state === 'Closed' ? this.#queue.length : 0 });
  }
}
