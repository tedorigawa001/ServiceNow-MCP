/** Pure isolated fake only. No real meter, parser, registry, root, issuer or resources. */
const CLOSED = Object.freeze({ model: 'wfb-k0-entry-fake-1', schedule: 'fixture-5-unit-1', ready: false,
  runtimeCoverage: 'unknown', nativeCost: 'unknown', k0Work: 'excluded', seed: 'not_acquired', coreInvocation: 'not_called' } as const);
const E_REQ = 5;
type Reason = 'raw_limits' | 'raw_work' | 'raw_overflow' | 'raw_internal';
type Usage = { readonly state: 'unavailable' } | { readonly state: 'observed'; readonly charged: 5; readonly executed: number; readonly prepaidUnused: number };
interface Diagnostics { readonly firstReason: Reason | 'none'; readonly snapshot: 'not_failed' | 'unavailable' | 'not_reported'; readonly cleanup: 'not_started' | 'simulated_released' | 'simulated_unconfirmed' | 'not_reported' }
type Result = typeof CLOSED & { readonly kind: 'non_executable_fake_entry'; readonly entry: 'not_acquired' | 'acquired'; readonly bootstrapUsage: Usage; readonly diagnostics: Diagnostics }
  & ({ readonly ok: true } | { readonly ok: false; readonly reason: Reason });
const unavailable = Object.freeze({ state: 'unavailable' } as const);
const carrier = (reason: Reason, acquired: boolean): Result => Object.freeze({ ...CLOSED, kind: 'non_executable_fake_entry', ok: false,
  reason, entry: acquired ? 'acquired' : 'not_acquired', bootstrapUsage: unavailable,
  diagnostics: Object.freeze({ firstReason: reason, snapshot: 'not_reported', cleanup: 'not_reported' }) });
const carriers = Object.freeze(Object.fromEntries((['raw_limits', 'raw_work', 'raw_overflow', 'raw_internal'] as const)
  .map(reason => [reason, Object.freeze({ before: carrier(reason, false), after: carrier(reason, true) })]))) as Readonly<Record<Reason, { readonly before: Result; readonly after: Result }>>;
const uint = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
type Scenario = 'normal' | 'entry_build_failure' | 'profile_rejected' | 'snapshot_failure' | 'cleanup_failure' | 'snapshot_cleanup_failure';
class Assembly {
  #cap = 0; #parser = 0; #bridge = 0; #valid = false;
  #state: 'BaseUnestablished' | 'BaseEstablished' | 'EntryDebited' | 'EntryBuilding' | 'EntryBuilt' | 'FakeProfileChecked' | 'Retired' | 'Rejected' = 'BaseUnestablished';
  #acquired = false; #attempted = false; #terminal: Result | undefined;
  #ownerBuilt = false; #buildAttempted = false; #profileChecked = false;
  #prepareUsed = 0; #terminalUsed = 0; #cleanupAttempts = 0; #creditRetires = 0;
  #first: Reason | 'none' = 'none'; #snapshotFailed = false; #cleanupFailed = false; #afterClose: Result | undefined;
  constructor(cap: unknown, parser: unknown, bridge: unknown, private readonly scenario: Scenario = 'normal') {
    if (!uint(cap) || cap === 0 || !uint(parser) || !uint(bridge)) { this.#terminal = carriers.raw_limits.before; return; }
    if (bridge > Number.MAX_SAFE_INTEGER - parser) { this.#terminal = carriers.raw_overflow.before; return; }
    if (parser + bridge > cap) { this.#terminal = carriers.raw_limits.before; return; }
    this.#cap = cap; this.#parser = parser; this.#bridge = bridge; this.#valid = true; this.#state = 'BaseEstablished';
  }
  acquireEntry(): Result {
    const stopped = this.stopped(); if (stopped) return stopped;
    if (this.#attempted) return this.reject('raw_limits');
    this.#attempted = true;
    if (E_REQ > this.#cap - this.#parser - this.#bridge) return this.reject('raw_work');
    this.#bridge += E_REQ; this.#acquired = true; this.#state = 'EntryDebited';
    return this.result();
  }
  private stopped(): Result | undefined {
    if (!this.#terminal || !this.#terminal.ok) return this.#terminal;
    // A late operation is refused without changing the completed run's stored diagnostics.
    this.#afterClose ??= Object.freeze({ ...this.#terminal, ok: false, reason: 'raw_limits' }); return this.#afterClose;
  }
  private usage(): Usage {
    if (!this.#ownerBuilt || this.#snapshotFailed) return unavailable;
    const executed = this.#prepareUsed + this.#terminalUsed;
    return Object.freeze({ state: 'observed', charged: E_REQ, executed, prepaidUnused: E_REQ - executed });
  }
  private diagnostics(): Diagnostics {
    if (this.#terminal && !this.#acquired) return this.#terminal.diagnostics;
    return Object.freeze({ firstReason: this.#first, snapshot: this.#snapshotFailed ? 'unavailable' : 'not_failed',
      cleanup: this.#cleanupAttempts === 0 ? 'not_started' : this.#cleanupFailed ? 'simulated_unconfirmed' : 'simulated_released' });
  }
  private result(reason?: Reason): Result {
    const common = { ...CLOSED, kind: 'non_executable_fake_entry' as const, entry: this.#acquired ? 'acquired' as const : 'not_acquired' as const,
      bootstrapUsage: this.usage(), diagnostics: this.diagnostics() };
    return reason ? Object.freeze({ ...common, ok: false, reason }) : Object.freeze({ ...common, ok: true });
  }
  private finish(reason?: Reason): Result {
    if (this.#terminal) return this.#terminal;
    if (reason && this.#first === 'none') this.#first = reason;
    if (this.#acquired) {
      // Fixed fixture schedule: prepare 2, terminal (diagnostic/cleanup/retire) 3. No extra debit.
      this.#terminalUsed = 3; this.#cleanupAttempts = 1; this.#creditRetires = 1;
      this.#cleanupFailed = this.scenario === 'cleanup_failure' || this.scenario === 'snapshot_cleanup_failure';
      this.#snapshotFailed = this.#ownerBuilt && (this.scenario === 'snapshot_failure' || this.scenario === 'snapshot_cleanup_failure');
      if ((this.#cleanupFailed || this.#snapshotFailed) && this.#first === 'none') this.#first = 'raw_internal';
    }
    this.#state = this.#first === 'none' ? 'Retired' : 'Rejected';
    this.#terminal = !this.#ownerBuilt && this.#first !== 'none'
      ? carriers[this.#first][this.#acquired ? 'after' : 'before']
      : this.result(this.#first === 'none' ? undefined : this.#first);
    return this.#terminal;
  }
  reject(reason: unknown): Result {
    const stopped = this.stopped(); if (stopped) return stopped;
    return this.finish(reason === 'raw_limits' || reason === 'raw_work' || reason === 'raw_overflow' || reason === 'raw_internal' ? reason : 'raw_limits');
  }
  inspect() {
    return Object.freeze({ ...CLOSED, state: this.#state, entry: this.#acquired ? 'acquired' as const : 'not_acquired' as const,
      ownerBuilt: this.#ownerBuilt, acquisitionAttempted: this.#attempted, entryDebits: this.#acquired ? 1 : 0,
      buildAttempted: this.#buildAttempted, profileChecked: this.#profileChecked, cleanupAttempts: this.#cleanupAttempts, creditRetires: this.#creditRetires,
      bootstrapUsage: this.usage(), diagnostics: this.diagnostics(),
      budget: this.#valid ? Object.freeze({ state: 'observed' as const, parser: this.#parser, bridge: this.#bridge, total: this.#parser + this.#bridge }) : unavailable });
  }
  buildEntry(): Result {
    const stopped = this.stopped(); if (stopped) return stopped;
    if (this.#state !== 'EntryDebited') return this.finish('raw_limits');
    this.#state = 'EntryBuilding'; this.#buildAttempted = true; this.#prepareUsed++;
    if (this.scenario === 'entry_build_failure') return this.finish('raw_internal');
    this.#ownerBuilt = true; this.#state = 'EntryBuilt'; return this.result();
  }
  checkProfile(): Result {
    const stopped = this.stopped(); if (stopped) return stopped;
    if (this.#state !== 'EntryBuilt') return this.finish('raw_limits');
    this.#prepareUsed++; this.#profileChecked = true;
    if (this.scenario === 'profile_rejected') return this.finish('raw_limits');
    this.#state = 'FakeProfileChecked'; return this.result();
  }
  close(): Result {
    if (this.#terminal) return this.#terminal;
    return this.finish(this.#state === 'FakeProfileChecked' ? undefined : 'raw_limits');
  }
}
function facade(assembly: Assembly) {
  return Object.freeze({ acquireEntry: () => assembly.acquireEntry(), inspect: () => assembly.inspect(),
    buildEntry: () => assembly.buildEntry(), checkProfile: () => assembly.checkProfile(), close: () => assembly.close(), reject: (reason: unknown) => assembly.reject(reason) });
}
export function createSeedBootstrapFake(cap: unknown, parser: unknown, bridge: unknown) { return facade(new Assembly(cap, parser, bridge)); }
/** Fixed pure fault scenarios, not arbitrary suppliers and not native failure injection. */
export function createFixedBootstrapFake(scenario: unknown) {
  if (scenario !== 'entry_build_failure' && scenario !== 'profile_rejected' && scenario !== 'snapshot_failure'
    && scenario !== 'cleanup_failure' && scenario !== 'snapshot_cleanup_failure') return facade(new Assembly(undefined, undefined, undefined));
  return facade(new Assembly(20, 10, 0, scenario));
}
