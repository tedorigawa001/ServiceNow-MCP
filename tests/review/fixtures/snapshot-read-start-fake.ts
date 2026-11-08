/** C-start only. No read/hash kernel, I/O, real budget, source pins or runtime imports. */
import { inspectSourceMapDraft } from './source-map-values-core.js';
type MapValue = Extract<ReturnType<typeof inspectSourceMapDraft>, { ok: true }>['value'];
type SupplyReason = 'none' | 'supply_invalid' | 'binding_mismatch';
type LifecycleReason = 'none' | 'read_prepare_unavailable' | 'binding_mismatch' | 'duplicate_start';
type ReadReason = 'none' | 'binding' | 'read_prepare_unavailable' | 'supply_closed';
type ReplyReason = Exclude<SupplyReason | LifecycleReason | ReadReason, 'none'> | 'read_already_used';
type State = 'unused' | 'starting' | 'prepared' | 'unwinding' | 'terminal';
const CLOSED = Object.freeze({ model: 'wfb-snapshot-read-start-fake-C1-1', synthetic: true, authority: 'none', ready: false,
  formalIssuance: 'closed', wholeRunAdmission: 'disabled', hash: 'not_checked', mapping: 'shape_only', implementation: 'unknown',
  runtimeCoverage: 'unknown', nativeCost: 'unknown', entryRequirement: 'unknown', seedRequirement: 'unknown',
  snapshotConnection: 'identity_only', legacySupply: 'unchanged', readKernel: 'not_connected', rowAggregation: 'not_connected',
  coreInvocation: 'not_called', actualBudget: 'not_connected' } as const);
type Reply = typeof CLOSED & ({ readonly ok: true } | { readonly ok: false; readonly reason: ReplyReason });
const scenarios = ['normal', 'owner_failure', 'result_slot_failure', 'custody_failure', 'source_failure', 'map_rejected',
  'snapshot_failure', 'after_snapshot_failure', 'borrow_failure', 'after_borrow_failure', 'result_prepare_failure',
  'owner_mix', 'snapshot_mix', 'version_mix', 'map_wrapper', 'map_copy', 'files_copy', 'rows_copy', 'file_copy',
  'ordinal_mix', 'session_mix', 'budget_mix', 'borrow_copy', 'origin_input', 'reentrant_begin'] as const;
type Scenario = typeof scenarios[number];
class DiagnosticOwner {
  supplyFirst: SupplyReason = 'none'; lifecycleFirst: LifecycleReason = 'none'; readFirst: ReadReason = 'none';
  readStop: 'none' | 'supply_closed' = 'none';
}
interface Binding {
  readonly owner: object; readonly snapshot: Snapshot; readonly setId: string; readonly map: MapValue;
  readonly files: MapValue['files']; readonly rows: MapValue['rows']; readonly file: MapValue['files'][number];
  readonly ordinal: number; readonly session: object; readonly budget: object;
}
class Borrow {
  #binding: Binding | undefined;
  constructor(binding: Binding) { this.#binding = binding; Object.freeze(this); }
  matches(b: Binding): boolean {
    const a = this.#binding;
    return !!a && a.owner === b.owner && a.snapshot === b.snapshot && a.setId === b.setId && a.map === b.map
      && a.files === b.files && a.rows === b.rows && a.file === b.file && a.ordinal === b.ordinal
      && a.session === b.session && a.budget === b.budget;
  }
  retire(): void { this.#binding = undefined; }
}
class Snapshot {
  #map: MapValue | undefined;
  constructor(map: MapValue, readonly setId = 'synthetic-read-start-1') { this.#map = map; Object.freeze(this); }
  view() { return this.#map; }
  retire(): void { this.#map = undefined; }
}
function fixedData() {
  const abc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const file = (id: string, role: string) => ({ id, path: `synthetic-read-start/${id}.ts`, role, expectedSha256: abc, expectedBytes: 3 });
  return { model: 'wfb-source-map-draft-values-1', files: [file('F01', 'source'), file('F02', 'source'), file('O01', 'oracle'), file('T01', 'test')],
    rows: Array.from({ length: 12 }, (_, i) => ({ id: `SC${String(i + 1).padStart(2, '0')}`,
      status: 'unimplemented', bindings: [], missing: ['actual_producer'] })),
    ready: false, runtimeCoverage: 'unknown', nativeCost: 'unknown', entryRequirement: 'unknown', seedRequirement: 'unknown' };
}
class Assembly {
  #diagnostic: DiagnosticOwner | undefined;
  #fallbackSupply: SupplyReason = 'none';
  #custody: Readonly<{ state: 'empty' }> | undefined;
  #resultSlot: { terminal?: ReturnType<Assembly['endView']> } | undefined;
  #snapshot: Snapshot | undefined; #borrow: Borrow | undefined; #issuedBorrow: Borrow | undefined;
  #prepared: Readonly<{ borrow: Borrow; session: object; budget: object }> | undefined;
  #originInput: unknown;
  #session: object | undefined; #budget: object | undefined;
  #supplyState: 'open' | 'closing' | 'retired' = 'open'; #state: State = 'unused'; #closeRequested = false;
  #terminal: ReturnType<Assembly['endView']> | undefined;
  readonly #counts = { diagnosticOwners: 0, resultSlots: 0, custodySlots: 0, mapChecks: 0, snapshots: 0,
    startClaims: 0, sessions: 0, budgetOrigins: 0, borrows: 0, identityChecks: 0, preparationRecords: 0,
    borrowRetirements: 0, snapshotRetirements: 0, open: 0, read: 0, hash: 0, cleanup: 0 };
  constructor(private readonly scenario: Scenario, admitted: boolean) {
    try {
      if (scenario === 'owner_failure') throw Error('synthetic_owner');
      this.#diagnostic = new DiagnosticOwner(); this.#counts.diagnosticOwners++;
      if (!admitted) { this.supplyFailure('supply_invalid'); return; }
      if (scenario === 'result_slot_failure') throw Error('synthetic_result_slot');
      this.#resultSlot = {}; this.#counts.resultSlots++;
      if (scenario === 'custody_failure') throw Error('synthetic_custody');
      this.#custody = Object.freeze({ state: 'empty' }); this.#counts.custodySlots++;
      if (scenario === 'source_failure') throw Error('synthetic_source');
      const raw = fixedData(); if (scenario === 'origin_input') this.#originInput = raw;
      this.#counts.mapChecks++;
      const checked = inspectSourceMapDraft(scenario === 'map_rejected' ? { ...raw, ready: true } : raw);
      if (!checked.ok) throw Error('synthetic_map');
      if (scenario === 'snapshot_failure') throw Error('synthetic_snapshot');
      this.#snapshot = new Snapshot(checked.value); this.#counts.snapshots++;
      if (scenario === 'after_snapshot_failure') throw Error('synthetic_snapshot_post');
    } catch { this.supplyFailure('supply_invalid'); }
  }
  private supplyFirst(): SupplyReason { return this.#diagnostic?.supplyFirst ?? this.#fallbackSupply; }
  private reply(reason?: ReplyReason): Reply { return Object.freeze(reason ? { ...CLOSED, ok: false, reason } : { ...CLOSED, ok: true }); }
  private prior(): ReplyReason | undefined {
    const supply = this.supplyFirst(); if (supply !== 'none') return supply;
    const life = this.#diagnostic?.lifecycleFirst; return life && life !== 'none' ? life : undefined;
  }
  private supplyFailure(reason: Exclude<SupplyReason, 'none'>): void {
    if (this.#diagnostic) { if (this.#diagnostic.supplyFirst === 'none') this.#diagnostic.supplyFirst = reason; }
    else if (this.#fallbackSupply === 'none') this.#fallbackSupply = reason;
    // Supply failure precedes any read claim: the read side stays unused while the supply retires.
    this.#originInput = undefined; this.#supplyState = 'closing';
    if (!this.#borrow) this.retireSnapshot();
  }
  private fail(reason: Exclude<LifecycleReason, 'none'>): Reply {
    if (this.#diagnostic) {
      if (this.#diagnostic.lifecycleFirst === 'none') this.#diagnostic.lifecycleFirst = reason;
      if (this.#diagnostic.readFirst === 'none') this.#diagnostic.readFirst = reason === 'read_prepare_unavailable' ? reason : 'binding';
    }
    this.#state = 'unwinding';
    return this.reply(this.prior() ?? reason);
  }
  private retireSnapshot(): void {
    if (this.#snapshot) { this.#snapshot.retire(); this.#snapshot = undefined; this.#counts.snapshotRetirements++; }
    this.#supplyState = 'retired';
  }
  check(): Reply {
    const prior = this.prior(); if (prior) return this.reply(prior);
    if (this.#supplyState !== 'open') return this.reply('supply_closed');
    return this.#snapshot?.view() ? this.reply() : this.reply('supply_invalid');
  }
  begin(): Reply {
    if (this.#terminal) return this.reply('read_already_used');
    const prior = this.prior(); if (prior) return this.reply(prior);
    if (this.#supplyState !== 'open' || this.#closeRequested) return this.reply('supply_closed');
    if (this.#state !== 'unused') return this.fail('duplicate_start');
    this.#state = 'starting'; this.#counts.startClaims++;
    return this.reply();
  }
  rejectArguments(): Reply {
    if (this.#terminal) return this.reply('read_already_used');
    return this.prior() ? this.reply(this.prior()) : this.fail('binding_mismatch');
  }
  private binding(map: MapValue): Binding {
    return Object.freeze({ owner: this.#diagnostic!, snapshot: this.#snapshot!, setId: this.#snapshot!.setId,
      map, files: map.files, rows: map.rows, file: map.files[0], ordinal: 0, session: this.#session!, budget: this.#budget! });
  }
  private probe(original: Binding): Binding {
    const s = this.scenario;
    if (s === 'owner_mix') return { ...original, owner: Object.freeze({}) };
    if (s === 'snapshot_mix') return { ...original, snapshot: new Snapshot(original.map) };
    if (s === 'version_mix') return { ...original, setId: 'synthetic-read-start-2' };
    if (s === 'map_wrapper') return { ...original, map: Object.freeze({ ...original.map }) };
    if (s === 'origin_input') return { ...original, map: this.#originInput as MapValue };
    if (s === 'map_copy') {
      const checked = inspectSourceMapDraft(original.map);
      if (!checked.ok) throw Error('synthetic_control');
      return { ...original, map: checked.value };
    }
    if (s === 'files_copy') return { ...original, files: Object.freeze([...original.files]) };
    if (s === 'rows_copy') return { ...original, rows: Object.freeze([...original.rows]) };
    if (s === 'file_copy') return { ...original, file: Object.freeze({ ...original.file }) };
    if (s === 'ordinal_mix') return { ...original, ordinal: 1 };
    if (s === 'session_mix') return { ...original, session: Object.freeze({}) };
    if (s === 'budget_mix') return { ...original, budget: Object.freeze({}) };
    return original;
  }
  prepare(): Reply {
    if (this.#terminal) return this.reply('read_already_used');
    const prior = this.prior(); if (prior) return this.reply(prior);
    if (this.#closeRequested || this.#supplyState !== 'open') return this.reply('supply_closed');
    if (this.#state !== 'starting') return this.fail(this.#state === 'prepared' ? 'duplicate_start' : 'binding_mismatch');
    try {
      if (this.scenario === 'reentrant_begin') { this.begin(); return this.reply(this.prior()!); }
      if (!this.#diagnostic || !this.#resultSlot || !this.#custody || !this.#snapshot?.view()) return this.fail('read_prepare_unavailable');
      this.#session = Object.freeze({}); this.#counts.sessions++;
      this.#budget = Object.freeze({}); this.#counts.budgetOrigins++;
      if (this.scenario === 'borrow_failure') throw Error('synthetic_borrow');
      const canonical = this.binding(this.#snapshot.view()!);
      this.#borrow = new Borrow(this.probe(canonical)); this.#issuedBorrow = this.#borrow; this.#counts.borrows++;
      if (this.scenario === 'borrow_copy') this.#borrow = new Borrow(canonical);
      if (this.scenario === 'after_borrow_failure') throw Error('synthetic_borrow_post');
      this.#counts.identityChecks++;
      if (this.#borrow !== this.#issuedBorrow || !this.#borrow.matches(canonical)) return this.fail('binding_mismatch');
      if (this.scenario === 'result_prepare_failure') throw Error('synthetic_prepare_record');
      this.#prepared = Object.freeze({ borrow: this.#borrow, session: this.#session, budget: this.#budget });
      this.#counts.preparationRecords++; this.#state = 'prepared';
      return this.reply();
    } catch { return this.fail('read_prepare_unavailable'); }
  }
  close(): Reply {
    if (!this.#closeRequested) this.#closeRequested = true;
    if (this.#terminal || !this.#borrow) this.retireSnapshot();
    else this.#supplyState = 'closing';
    // A read stop is recorded only after this construction issued its one start claim.
    if (!this.#terminal && this.#counts.startClaims > 0) {
      if (this.#diagnostic) {
        if (this.#diagnostic.readStop === 'none') this.#diagnostic.readStop = 'supply_closed';
        if (this.#diagnostic.readFirst === 'none') this.#diagnostic.readFirst = 'supply_closed';
      }
      this.#state = 'unwinding';
    }
    return this.reply(this.prior());
  }
  private endView() {
    return Object.freeze({ ...CLOSED, disposition: this.prior() || this.#closeRequested ? 'rejected' : 'preparation_discarded',
      supplyFirst: this.supplyFirst(), lifecycleFirst: this.#diagnostic?.lifecycleFirst ?? 'none',
      readFirst: this.#diagnostic?.readFirst ?? 'none', readStop: this.#diagnostic?.readStop ?? 'none',
      preparationCounts: Object.freeze({ startClaims: this.#counts.startClaims, sessions: this.#counts.sessions,
        budgetOrigins: this.#counts.budgetOrigins, borrows: this.#counts.borrows, identityChecks: this.#counts.identityChecks,
        preparationRecords: this.#counts.preparationRecords }), cleanupDisposition: 'not_started' });
  }
  finish() {
    if (this.#terminal) return this.#terminal;
    // No resource exists at this stage: discard is not successful read/cleanup evidence.
    const end = this.endView();
    if (this.#resultSlot) this.#resultSlot.terminal = end;
    if (this.#issuedBorrow) { this.#issuedBorrow.retire(); this.#counts.borrowRetirements++; }
    if (this.#borrow && this.#borrow !== this.#issuedBorrow) this.#borrow.retire();
    this.#borrow = undefined; this.#issuedBorrow = undefined; this.#prepared = undefined;
    this.#session = undefined; this.#budget = undefined; this.#originInput = undefined;
    if (this.#closeRequested || this.supplyFirst() !== 'none') this.retireSnapshot();
    this.#state = 'terminal'; this.#terminal = end;
    return end;
  }
  inspect() {
    return Object.freeze({ ...CLOSED, supplyState: this.#supplyState, readState: this.#state, closeRequested: this.#closeRequested,
      supplyFirst: this.supplyFirst(), lifecycleFirst: this.#diagnostic?.lifecycleFirst ?? 'none',
      readFirst: this.#diagnostic?.readFirst ?? 'none', readStop: this.#diagnostic?.readStop ?? 'none',
      diagnosticOwnerReady: !!this.#diagnostic, resultSlotReady: !!this.#resultSlot, custodyReady: !!this.#custody,
      retainedSnapshot: !!this.#snapshot, retainedBorrow: !!this.#borrow, retainedIssuedBorrow: !!this.#issuedBorrow,
      retainedPreparation: !!this.#prepared,
      retainedOriginInput: this.#originInput !== undefined,
      retainedSession: !!this.#session, retainedBudgetOrigin: !!this.#budget,
      counts: Object.freeze({ ...this.#counts }), terminalRead: this.#terminal ?? null });
  }
}
export function createSnapshotReadStartFake(...args: readonly unknown[]) {
  const input = args.length === 0 ? 'normal' : args[0];
  const admitted = args.length <= 1 && typeof input === 'string' && (scenarios as readonly string[]).includes(input);
  const a = new Assembly(admitted ? input as Scenario : 'normal', admitted);
  return Object.freeze({ check: () => a.check(),
    begin: (...input: readonly unknown[]) => input.length ? a.rejectArguments() : a.begin(),
    prepare: (...input: readonly unknown[]) => input.length ? a.rejectArguments() : a.prepare(),
    close: () => a.close(), finish: () => a.finish(), inspect: () => a.inspect() });
}
