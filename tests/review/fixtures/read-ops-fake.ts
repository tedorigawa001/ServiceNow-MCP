/** Pure A-stage control model. No buffers, hashing, file I/O, supply, core or runtime imports. */
type Reason = 'binding' | 'operation_invalid' | 'source_limit' | 'source_unavailable' | 'source_changed'
  | 'content_mismatch' | 'cancelled' | 'deadline' | 'clock_unavailable' | 'closed' | 'incomplete';
type Cleanup = 'not_attempted' | 'no_resource' | 'closed_confirmed' | 'close_unconfirmed';
type FileHash = 'not_started' | 'pending' | 'incomplete' | 'content_mismatch';
interface Slot { readonly fileId: string; readonly hash: FileHash; readonly cleanup: Cleanup }
interface Resource { readonly ordinal: number }
type OpenOutcome = { readonly kind: 'opened'; readonly resource: Resource }
  | { readonly kind: 'no_resource' } | { readonly kind: 'failed_owned'; readonly resource: Resource };
interface Observation { readonly kind: 'regular' | 'other'; readonly identity: Resource; readonly size: number; readonly stamp: number }
type ReadOutcome = { readonly kind: 'bytes'; readonly n: number } | { readonly kind: 'eof' }
  | { readonly kind: 'interrupted' } | { readonly kind: 'failed' };
interface ReadOps {
  openOnce(ordinal: number): OpenOutcome;
  observeOnce(resource: Resource, after: boolean): Observation;
  readOnce(resource: Resource, offset: number, requested: number): ReadOutcome;
  closeOnce(resource: Resource): boolean;
}
const CLOSED = Object.freeze({ model: 'wfb-read-ops-fake-A-1', kind: 'non_executable_read_ops', synthetic: true,
  ready: false, authority: 'none', hashConnection: 'not_connected', hashCalls: 0, runtimeCoverage: 'unknown',
  nativeCost: 'unknown', entryRequirement: 'unknown', seedRequirement: 'unknown', coreInvocation: 'not_called' } as const);
const PROFILE = Object.freeze({ maxFile: 1_048_576, maxExpected: 8_388_608, received: 8_388_609, chunk: 65_536,
  read: 65_536, retry: 32, open: 32, observe: 64, close: 32, guards: 131_330, stop: 900, end: 1000 });
type Result = typeof CLOSED & ({ readonly ok: true } | { readonly ok: false; readonly reason: Reason });
const SCENARIOS = ['normal', 'interrupt_once', 'interrupt_always', 'open_no_resource', 'open_owned_failure', 'shared_read_cap',
  'early_eof', 'extra_byte', 'invalid_n', 'read_throw', 'read_failed', 'observe_throw', 'before_size',
  'cancel_during_read', 'deadline_during_read', 'mismatch_close_failure', 'capacity_files', 'read_limit',
  'open_throw_unknown', 'close_throw_late', 'clock_throw', 'shared_received_cap', 'shared_retry_cap',
  'bad_file_size', 'bad_total_size', 'after_stamp', 'guard_cap', 'slot_build_failure', 'after_size', 'after_identity',
  'after_kind', 'before_identity', 'before_kind'] as const;
type Scenario = (typeof SCENARIOS)[number];
class FakeClock {
  time = 0; calls = 0;
  constructor(private readonly throws: boolean) {}
  now(): number { this.calls++; if (this.throws) throw new Error('synthetic_clock'); return this.time; }
}
interface Signals { clock: FakeClock; cancelled: boolean }
class FakeOps implements ReadOps {
  readonly calls = { open: 0, observe: 0, read: 0, close: 0 };
  #readWithin = 0;
  constructor(private readonly sizes: readonly number[], private readonly scenario: Scenario, private readonly signals: Signals) {}
  openOnce(ordinal: number): OpenOutcome {
    this.calls.open++; this.#readWithin = 0;
    if (this.scenario === 'open_throw_unknown') throw new Error('synthetic_open');
    if (this.scenario === 'open_no_resource') return { kind: 'no_resource' };
    const resource = Object.freeze({ ordinal });
    return this.scenario === 'open_owned_failure' ? { kind: 'failed_owned', resource } : { kind: 'opened', resource };
  }
  observeOnce(resource: Resource, _after: boolean): Observation {
    this.calls.observe++;
    if (this.scenario === 'observe_throw') throw new Error('synthetic_observe');
    const changed = (name: string) => this.scenario === `${_after ? 'after' : 'before'}_${name}`;
    return { kind: changed('kind') ? 'other' : 'regular', identity: changed('identity') ? Object.freeze({ ordinal: resource.ordinal }) : resource,
      size: this.sizes[resource.ordinal] + (this.scenario === 'before_size' || (_after && this.scenario === 'after_size') ? 1 : 0),
      stamp: this.scenario === 'after_stamp' && _after ? 2 : 1 };
  }
  readOnce(resource: Resource, offset: number, requested: number): ReadOutcome {
    this.calls.read++; this.#readWithin++;
    if (this.scenario === 'interrupt_always' || (['interrupt_once', 'shared_retry_cap'].includes(this.scenario) && this.#readWithin === 1)) return { kind: 'interrupted' };
    if (this.scenario === 'read_throw') throw new Error('synthetic_read');
    if (this.scenario === 'read_failed') return { kind: 'failed' };
    if (this.scenario === 'early_eof' || this.scenario === 'mismatch_close_failure') return { kind: 'eof' };
    if (this.scenario === 'invalid_n') return { kind: 'bytes', n: requested + 1 };
    if (this.scenario === 'cancel_during_read') this.signals.cancelled = true;
    if (this.scenario === 'deadline_during_read') this.signals.clock.time = 900;
    const remaining = this.sizes[resource.ordinal] - offset;
    if (remaining === 0 && this.scenario === 'extra_byte') return { kind: 'bytes', n: 1 };
    return remaining === 0 ? { kind: 'eof' } : { kind: 'bytes', n: this.scenario === 'read_limit' ? 1 : Math.min(requested, remaining) };
  }
  closeOnce(_resource: Resource): boolean {
    this.calls.close++;
    if (this.scenario === 'close_throw_late') { this.signals.clock.time = 1000; throw new Error('synthetic_close'); }
    return this.scenario !== 'mismatch_close_failure';
  }
}
class Session {
  readonly #profile: Readonly<Record<keyof typeof PROFILE, number>>;
  readonly #sizes: readonly number[];
  readonly #ops: FakeOps;
  readonly #budget = { open: 0, observe: 0, read: 0, retry: 0, received: 0, cleanupReserved: 0, cleanupUnused: 0, close: 0 };
  readonly #slots: Slot[];
  #slotsState: 'prepared' | 'unavailable' = 'prepared';
  readonly #rows = Object.freeze(Array.from({ length: 12 }, (_, i) => Object.freeze({ rowId: `SC${String(i + 1).padStart(2, '0')}`, state: 'not_aggregated' as const })));
  #resource: Resource | undefined; #ordinal = 0;
  #stage: 'none' | 'opened' | 'before' | 'reading' | 'eof' | 'after' = 'none';
  #offset = 0; #before: Observation | undefined;
  #retry: { readonly offset: number; readonly requested: number } | undefined;
  #receivedState: 'observed' | 'unavailable' = 'observed';
  #first: Reason | 'none' = 'none';
  #stopReason: Reason | 'none' = 'none';
  readonly #signals: Signals;
  #lastTime = 0; #clockInvalid = false; #guards = 0;
  #cleanupReason: 'none' | 'close_unconfirmed' = 'none';
  #acquisitionUncertain = false;
  #cleanupTiming: 'not_checked' | 'within' | 'expired' | 'unknown' = 'not_checked';
  #terminal: ReturnType<Session['snapshot']> | undefined;
  constructor(scenario: Scenario = 'normal', admitted = true) {
    this.#profile = scenario === 'shared_read_cap' ? Object.freeze({ ...PROFILE, read: 3, chunk: 2 })
      : scenario === 'shared_received_cap' ? Object.freeze({ ...PROFILE, received: 4 })
      : scenario === 'shared_retry_cap' ? Object.freeze({ ...PROFILE, retry: 1 })
      : scenario === 'guard_cap' ? Object.freeze({ ...PROFILE, guards: 3 }) : PROFILE;
    this.#sizes = Object.freeze(scenario === 'capacity_files' ? Array<number>(32).fill(262_144) : scenario === 'read_limit' ? [1_048_576]
      : scenario === 'bad_file_size' ? [1_048_577] : scenario === 'bad_total_size' ? Array<number>(9).fill(1_048_576) : [3, 2]);
    this.#signals = { clock: new FakeClock(scenario === 'clock_throw'), cancelled: false };
    this.#ops = new FakeOps(this.#sizes, scenario, this.#signals);
    const slots: Slot[] = [];
    try {
      for (let i = 0; i < this.#sizes.length; i++) {
        if (scenario === 'slot_build_failure' && i === 1) throw new Error('synthetic_slot_build');
        slots.push({ fileId: `F${String(i + 1).padStart(2, '0')}`, hash: 'not_started', cleanup: 'not_attempted' });
      }
    } catch { slots.length = 0; this.#slotsState = 'unavailable'; this.stop('source_unavailable'); }
    this.#slots = slots;
    if (!admitted) this.stop('binding');
    else if (this.#sizes.length > 32 || this.#sizes.some(n => !Number.isSafeInteger(n) || n < 1 || n > this.#profile.maxFile)
      || this.#sizes.reduce((a, b) => a + b, 0) > this.#profile.maxExpected) this.stop('source_limit');
  }
  private result(reason?: Reason): Result { return Object.freeze(reason ? { ...CLOSED, ok: false, reason } : { ...CLOSED, ok: true }); }
  private complete(): boolean { return this.#slotsState === 'prepared' && this.#sizes.length > 0 && this.#ordinal >= this.#sizes.length; }
  private stop(reason: Reason): Result {
    const late = ['cancelled', 'deadline', 'clock_unavailable', 'source_limit'].includes(reason);
    if (this.#first === 'none' && !(late && this.complete())) this.#first = reason;
    if (this.#stopReason === 'none' && ['cancelled', 'deadline', 'clock_unavailable', 'source_limit'].includes(reason)) this.#stopReason = reason;
    return this.result(this.#first);
  }
  private guard(cleanup = false, alsoStop = false): boolean {
    if (this.#guards >= this.#profile.guards) {
      if (cleanup) this.#cleanupTiming = 'unknown'; this.stop('source_limit'); return false;
    }
    this.#guards++;
    let time: number;
    try { time = this.#signals.clock.now(); } catch { this.#clockInvalid = true; time = NaN; }
    if (this.#clockInvalid || !Number.isSafeInteger(time) || time < this.#lastTime) {
      this.#clockInvalid = true;
      if (cleanup) this.#cleanupTiming = 'unknown'; this.stop('clock_unavailable'); return false;
    }
    this.#lastTime = time;
    if (cleanup) {
      if (this.#cleanupTiming !== 'unknown') this.#cleanupTiming = time >= this.#profile.end ? 'expired' : this.#cleanupTiming === 'expired' ? 'expired' : 'within';
      if (time >= this.#profile.end) { this.stop('deadline'); return false; }
      if (!alsoStop) return true;
    }
    if (this.#signals.cancelled) { this.stop('cancelled'); return false; }
    if (time >= this.#profile.stop) { this.stop('deadline'); return false; }
    return true;
  }
  advanceTo(time: unknown): void { if (this.#terminal) return; if (typeof time === 'number') this.#signals.clock.time = time; else this.#clockInvalid = true; }
  cancel(): void { if (!this.#terminal) { this.#signals.cancelled = true; this.stop('cancelled'); } }
  private attempted(action: () => void, read = false): Result {
    try { action(); } catch { if (read) this.#receivedState = 'unavailable'; this.stop('source_unavailable'); }
    this.guard(); return this.#first === 'none' ? this.result() : this.result(this.#first);
  }
  private blocked(): Result | undefined { return this.#terminal ? this.result('closed') : this.#first !== 'none' ? this.result(this.#first) : undefined; }
  openOnce(ordinal: unknown): Result {
    const stopped = this.blocked(); if (stopped) return stopped;
    if (!this.guard()) return this.result(this.#first as Reason);
    if (this.#resource || ordinal !== this.#ordinal || this.#ordinal >= this.#sizes.length
      || this.#slots[this.#ordinal].hash !== 'not_started') return this.stop('binding');
    if (this.#budget.open >= this.#profile.open || this.#budget.cleanupReserved >= this.#profile.close) return this.stop('source_limit');
    this.#budget.cleanupReserved++; this.#budget.open++;
    return this.attempted(() => {
      let opened: OpenOutcome;
      try { opened = this.#ops.openOnce(this.#ordinal); } catch {
        this.#acquisitionUncertain = true; this.#cleanupReason = 'close_unconfirmed';
        this.#slots[this.#ordinal] = { ...this.#slots[this.#ordinal], hash: 'incomplete', cleanup: 'close_unconfirmed' }; throw new Error('open_unavailable');
      }
      if (opened.kind === 'no_resource') { this.#budget.cleanupUnused++; this.#slots[this.#ordinal] = { ...this.#slots[this.#ordinal], hash: 'incomplete', cleanup: 'no_resource' }; this.stop('source_unavailable'); return; }
      this.#resource = opened.resource; this.#stage = 'opened'; this.#offset = 0;
      this.#slots[this.#ordinal] = { ...this.#slots[this.#ordinal], hash: 'pending' };
      if (opened.kind === 'failed_owned') this.stop('source_unavailable');
    });
  }
  observeOnce(): Result {
    const stopped = this.blocked(); if (stopped) return stopped;
    if (!this.guard()) return this.result(this.#first as Reason);
    if (!this.#resource || this.#retry || (this.#stage !== 'opened' && this.#stage !== 'eof')) return this.stop('operation_invalid');
    const resource = this.#resource;
    if (this.#budget.observe >= this.#profile.observe) return this.stop('source_limit');
    this.#budget.observe++;
    return this.attempted(() => {
      const observation = this.#ops.observeOnce(resource, this.#stage === 'eof');
      if (observation.identity !== resource || observation.kind !== 'regular') { this.stop(this.#stage === 'eof' ? 'source_changed' : 'binding'); return; }
      if (this.#stage === 'opened') {
        if (observation.size !== this.#sizes[this.#ordinal]) { this.mismatch(); return; }
        this.#before = observation; this.#stage = 'before';
      } else {
        if (!this.#before || observation.size !== this.#before.size || observation.stamp !== this.#before.stamp) { this.stop('source_changed'); return; }
        this.#stage = 'after';
      }
    });
  }
  private mismatch(): Result {
    this.#slots[this.#ordinal] = { ...this.#slots[this.#ordinal], hash: 'content_mismatch' };
    return this.stop('content_mismatch');
  }
  readOnce(offset: unknown, requested: unknown): Result {
    const stopped = this.blocked(); if (stopped) return stopped;
    if (!this.guard()) return this.result(this.#first as Reason);
    if (!this.#resource || (this.#stage !== 'before' && this.#stage !== 'reading') || offset !== this.#offset
      || typeof requested !== 'number' || !Number.isSafeInteger(requested) || requested < 1) return this.stop('operation_invalid');
    const resource = this.#resource;
    const remaining = this.#sizes[this.#ordinal] - this.#offset;
    if (requested > (remaining ? Math.min(remaining, this.#profile.chunk) : 1)) return this.stop('operation_invalid');
    if (this.#retry && (this.#retry.offset !== offset || this.#retry.requested !== requested)) return this.stop('binding');
    if (requested > this.#profile.received - this.#budget.received) return this.stop('source_limit');
    if (this.#budget.read >= this.#profile.read || (this.#retry && this.#budget.retry >= this.#profile.retry)) return this.stop('source_limit');
    if (this.#retry) this.#budget.retry++;
    this.#budget.read++;
    return this.attempted(() => {
      const read = this.#ops.readOnce(resource, this.#offset, requested);
      if (read.kind === 'interrupted') { this.#retry = { offset: this.#offset, requested }; return; }
      this.#retry = undefined;
      if (read.kind === 'failed') { this.stop('source_unavailable'); return; }
      if (read.kind === 'eof') { if (remaining) this.mismatch(); else this.#stage = 'eof'; return; }
      if (!Number.isSafeInteger(read.n) || read.n < 1 || read.n > requested) { this.#receivedState = 'unavailable'; this.stop('operation_invalid'); return; }
      if (read.n > this.#profile.received - this.#budget.received) { this.stop('source_limit'); return; }
      this.#budget.received += read.n;
      if (!remaining) { this.mismatch(); return; }
      this.#offset += read.n; this.#stage = 'reading';
    }, true);
  }
  closeOnce(): Result {
    if (this.#terminal) return this.result('closed');
    if (!this.#resource) return this.#first === 'none' ? this.result() : this.result(this.#first);
    const completed = this.#stage === 'after';
    if (!completed) this.stop('incomplete');
    this.guard(true);
    this.#budget.close++;
    let confirmed = false;
    try { confirmed = this.#ops.closeOnce(this.#resource); } catch { /* fixed unconfirmed cleanup */ }
    this.#resource = undefined; this.#before = undefined; this.#retry = undefined;
    if (!confirmed) { this.#cleanupReason = 'close_unconfirmed'; this.stop('source_unavailable'); }
    this.guard(true, true);
    const accepted = completed && confirmed && this.#first === 'none';
    const hash = this.#slots[this.#ordinal].hash;
    this.#slots[this.#ordinal] = { ...this.#slots[this.#ordinal], hash: hash === 'content_mismatch' ? 'content_mismatch' : accepted ? 'pending' : 'incomplete',
      cleanup: confirmed ? 'closed_confirmed' : 'close_unconfirmed' };
    if (accepted) this.#ordinal++;
    this.#stage = 'none';
    return this.#first === 'none' ? this.result() : this.result(this.#first);
  }
  private snapshot() { return Object.freeze({ ...CLOSED, firstReason: this.#first, retainedResource: this.#resource !== undefined,
    stopReason: this.#stopReason, acceptedFiles: this.#ordinal, cleanupReason: this.#cleanupReason, cleanupTiming: this.#cleanupTiming, guards: this.#guards,
    clockCalls: this.#signals.clock.calls, acquisitionUncertain: this.#acquisitionUncertain,
    cleanupOutstanding: this.#budget.cleanupReserved - this.#budget.cleanupUnused - this.#budget.close,
    deadlines: Object.freeze({ stop: this.#profile.stop, end: this.#profile.end }),
    offset: this.#offset, stage: this.#stage, receivedState: this.#receivedState,
    pendingRetry: this.#retry !== undefined, slotsState: this.#slotsState,
    budget: Object.freeze({ ...this.#budget }), ops: Object.freeze({ ...this.#ops.calls }),
    slots: Object.freeze(this.#slots.map(s => Object.freeze({ ...s }))), rows: this.#rows }); }
  inspect() { return this.#terminal ?? this.snapshot(); }
  finish() { if (this.#terminal) return this.#terminal; this.guard(); this.closeOnce(); this.guard(true); this.#terminal = this.snapshot(); return this.#terminal; }
}
function facade(session: Session) { return Object.freeze({ openOnce: (ordinal: unknown) => session.openOnce(ordinal),
  observeOnce: () => session.observeOnce(), readOnce: (offset: unknown, requested: unknown) => session.readOnce(offset, requested),
  advanceTo: (time: unknown) => session.advanceTo(time), cancel: () => session.cancel(),
  closeOnce: () => session.closeOnce(), inspect: () => session.inspect(), finish: () => session.finish() }); }
export function createReadOpsFake(...args: readonly unknown[]) { return facade(new Session('normal', args.length === 0)); }
export function createFixedReadOpsFake(scenario: unknown, ...args: readonly unknown[]) {
  const valid = args.length === 0 && typeof scenario === 'string' && SCENARIOS.includes(scenario as Scenario);
  return facade(new Session(valid ? scenario as Scenario : 'normal', valid));
}
