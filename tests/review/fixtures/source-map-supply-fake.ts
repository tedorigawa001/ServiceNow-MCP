/** Isolated synthetic supply. No real source pins, file reads, hashing or runtime registration. */
import { inspectSourceMapDraft } from './source-map-values-core.js';

type MapValue = Extract<ReturnType<typeof inspectSourceMapDraft>, { ok: true }>['value'];
type SetId = 'synthetic-map-set-1' | 'synthetic-map-set-2';
type Reason = 'supply_invalid' | 'binding_mismatch' | 'supply_closed';
const scenarios = ['normal', 'other_snapshot', 'equal_snapshot_copy', 'map_copy', 'map_wrapper', 'files_copy', 'rows_copy',
  'pair_mix', 'version_mix', 'origin_input', 'partial_build_failure', 'map_rejected', 'after_snapshot_failure'] as const;
type Scenario = (typeof scenarios)[number];
interface Counts { readonly files: number; readonly rows: number; readonly partialRows: number;
  readonly unimplementedRows: number; readonly missingPoints: number }
const closed = Object.freeze({ kind: 'non_executable_map_supply', synthetic: true, realPins: 'not_supplied',
  authority: 'none', ready: false, hash: 'not_checked', mapping: 'shape_only', implementation: 'unknown',
  runtimeCoverage: 'unknown', nativeCost: 'unknown', entryRequirement: 'unknown', seedRequirement: 'unknown',
  coreInvocation: 'not_called' } as const);
type Result = typeof closed & ({ readonly ok: true } | { readonly ok: false; readonly reason: Reason });
function fixedData() {
  const file = (id: string, path: string, role: string) => ({ id, path, role, expectedSha256: 'a'.repeat(64), expectedBytes: 10 });
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: `SC${String(i + 1).padStart(2, '0')}`,
    status: 'unimplemented', bindings: [] as unknown[], missing: ['actual_producer'] }));
  rows[0] = { id: 'SC01', status: 'partial_reference', bindings: ['F01', 'F02'].map((fileId, i) => ({
    step: `step0${i + 1}`, fileId, symbol: i ? 'Synthetic.helper' : 'Synthetic.producer', site: i ? 'helper' : 'producer',
    role: 'reference_only', phase: 'entry_prepare', costOwner: 'entry_prepare', costStep: null,
    prefixes: ['normal', 'refused', 'partial'], tests: ['O01', 'T01'] })), missing: ['actual_producer'] };
  return { model: 'wfb-source-map-draft-values-1', files: [file('F01', 'synthetic/producer.ts', 'source'),
    file('F02', 'synthetic/helper.ts', 'source'), file('O01', 'synthetic/oracle.ts', 'oracle'), file('T01', 'synthetic/test.ts', 'test')],
  rows, ready: false, runtimeCoverage: 'unknown', nativeCost: 'unknown', entryRequirement: 'unknown', seedRequirement: 'unknown' };
}
/** A second set used only inside negative probes, never an alternate normal supplier. */
function controlData() {
  const raw = fixedData();
  raw.files[1] = { ...raw.files[1], path: 'synthetic/helper-next.ts', expectedBytes: 11 };
  return raw;
}
class MapSupplySnapshot {
  #map: MapValue | undefined;
  readonly #setId: SetId;
  constructor(setId: SetId, map: MapValue) { this.#setId = setId; this.#map = map; Object.freeze(this); }
  borrow() { return this.#map; }
  matches(setId: unknown, map: unknown, files: unknown, rows: unknown): boolean {
    return this.#map !== undefined && setId === this.#setId && map === this.#map
      && files === this.#map.files && rows === this.#map.rows;
  }
  retire(): void { this.#map = undefined; }
}
class Supply {
  #snapshot: MapSupplySnapshot | undefined;
  #state: 'active' | 'rejected' | 'closed' = 'active';
  #first: Reason | 'none' = 'none';
  #checks = 0; #retirements = 0;
  #snapshotsCreated = 0; #mapChecks = 0;
  #construction: 'not_started' | 'source_prepared' | 'checked' | 'snapshot_built' | 'ready' = 'not_started';
  #counts: Counts = Object.freeze({ files: 0, rows: 0, partialRows: 0, unimplementedRows: 0, missingPoints: 0 });
  readonly #setId: SetId = 'synthetic-map-set-1';
  #origin: ReturnType<typeof fixedData> | undefined;
  constructor(private readonly scenario: Scenario = 'normal', admitted = true) {
    if (!admitted) { this.reject('supply_invalid'); return; }
    try {
      const raw = fixedData(); this.#construction = 'source_prepared';
      if (scenario === 'partial_build_failure') throw new Error('synthetic_build_failure');
      this.#mapChecks++;
      const result = inspectSourceMapDraft(scenario === 'map_rejected' ? { ...raw, ready: true } : raw);
      if (!result.ok) { this.reject('supply_invalid'); return; }
      this.#construction = 'checked';
      if (scenario === 'origin_input') this.#origin = raw;
      this.#snapshot = new MapSupplySnapshot(this.#setId, result.value);
      this.#snapshotsCreated++; this.#construction = 'snapshot_built';
      if (scenario === 'after_snapshot_failure') throw new Error('synthetic_post_snapshot_failure');
      this.#counts = Object.freeze({ files: result.value.files.length, rows: result.value.rows.length,
        partialRows: result.value.rows.filter(r => r.status === 'partial_reference').length,
        unimplementedRows: result.value.rows.filter(r => r.status === 'unimplemented').length,
        missingPoints: result.value.rows.reduce((sum, r) => sum + r.missing.length, 0) });
      this.#construction = 'ready';
    } catch { this.reject('supply_invalid'); }
  }
  private retire(): void {
    this.#origin = undefined;
    if (this.#snapshot) { this.#snapshot.retire(); this.#snapshot = undefined; this.#retirements++; }
  }
  private result(reason?: Reason): Result {
    return Object.freeze(reason ? { ...closed, ok: false, reason } : { ...closed, ok: true });
  }
  private reject(reason: Reason): Result {
    if (this.#first === 'none') this.#first = reason;
    this.#state = 'rejected'; this.retire();
    return this.result(this.#first);
  }
  private accept(snapshot: unknown, setId: unknown, map: unknown, files: unknown, rows: unknown): Result {
    if (this.#first !== 'none') return this.result(this.#first);
    if (this.#state !== 'active') return this.result('supply_closed');
    this.#checks++;
    if (!this.#snapshot || snapshot !== this.#snapshot || !this.#snapshot.matches(setId, map, files, rows)) return this.reject('binding_mismatch');
    return this.result();
  }
  check(): Result {
    const map = this.#snapshot?.borrow();
    if (!map || this.scenario === 'normal') return this.accept(this.#snapshot, this.#setId, map, map?.files, map?.rows);
    if (this.scenario === 'origin_input') return this.accept(this.#snapshot, this.#setId, this.#origin, this.#origin?.files, this.#origin?.rows);
    if (this.scenario === 'version_mix') return this.accept(this.#snapshot, 'synthetic-map-set-2', map, map.files, map.rows);
    if (this.scenario === 'files_copy') return this.accept(this.#snapshot, this.#setId, map, Object.freeze([...map.files]), map.rows);
    if (this.scenario === 'rows_copy') return this.accept(this.#snapshot, this.#setId, map, map.files, Object.freeze([...map.rows]));
    if (this.scenario === 'map_wrapper') return this.accept(this.#snapshot, this.#setId, Object.freeze({ ...map }), map.files, map.rows);
    if (this.scenario === 'map_copy') {
      const copy = inspectSourceMapDraft(map);
      if (!copy.ok) return this.reject('supply_invalid');
      return this.accept(this.#snapshot, this.#setId, copy.value, copy.value.files, copy.value.rows);
    }
    const other = inspectSourceMapDraft(controlData());
    if (!other.ok) return this.reject('supply_invalid');
    const foreign = new MapSupplySnapshot(this.scenario === 'equal_snapshot_copy' ? this.#setId : 'synthetic-map-set-2',
      this.scenario === 'equal_snapshot_copy' ? map : other.value);
    try {
      if (this.scenario === 'pair_mix') return this.accept(this.#snapshot, this.#setId, map, other.value.files, map.rows);
      const candidate = foreign.borrow();
      return this.accept(foreign, this.#setId, candidate, candidate?.files, candidate?.rows);
    } finally { foreign.retire(); }
  }
  close(): Result {
    if (this.#first !== 'none') return this.result(this.#first);
    this.retire(); this.#state = 'closed'; return this.result();
  }
  inspect() { return Object.freeze({ ...closed, state: this.#state, reviewSetId: this.#setId, ...this.#counts,
    firstReason: this.#first, construction: this.#construction, mapChecks: this.#mapChecks, snapshotsCreated: this.#snapshotsCreated,
    checks: this.#checks, logicalRetirements: this.#retirements, retainedSnapshot: this.#snapshot !== undefined,
    retainedOrigin: this.#origin !== undefined }); }
}
function facade(supply: Supply) { return Object.freeze({ check: () => supply.check(), close: () => supply.close(), inspect: () => supply.inspect() }); }
export function createSyntheticMapSupply(...args: readonly unknown[]) { return facade(new Supply('normal', args.length === 0)); }
/** Canned probes share the same private accept path; no caller map, snapshot or callback is accepted. */
export function createFixedSyntheticMapSupply(scenario: unknown, ...args: readonly unknown[]) {
  const admitted = args.length === 0 && typeof scenario === 'string' && scenarios.includes(scenario as Scenario);
  return facade(new Supply(admitted ? scenario as Scenario : 'normal', admitted));
}
