/** Independent synthetic construction. Only the values kernel is shared; no issuer/source/Journal/I/O. */
import { SUPPLY_FIELDS as FIELDS, supplyStageAllows, type SupplyConstructionStage as Stage } from './supply-construction-kernel.js';
const TARGET_BRAND: unique symbol = Symbol('synthetic-journal-target');
const CLAIM_BRAND: unique symbol = Symbol('synthetic-supply-claim');
type Reason = 'none' | 'input_rejected' | 'construction_unconfirmed' | 'binding_mismatch' | 'duplicate_preparation' | 'closed';
interface Scope { readonly owner: object; readonly construction: object; readonly retention: object;
  readonly sourceSlot: object; readonly claim: object }
interface SyntheticStart { readonly scope: Scope; readonly epoch: object; readonly packet: object }
interface TargetDescriptor { readonly [TARGET_BRAND]: true; readonly kind: 'synthetic_target';
  readonly start: SyntheticStart; readonly scope: Scope; readonly epoch: object; readonly packet: object }
interface SupplyClaim { readonly [CLAIM_BRAND]: true; readonly target: TargetDescriptor; readonly state: 'unused' }
interface EmptyHolder { readonly kind: 'empty_holder'; readonly reference: undefined }
interface CellHolder extends EmptyHolder { readonly cell: number; readonly field: number }
interface JournalSupplySlot { readonly kind: 'supply_slot'; state: 'unbound' | 'bound' }
interface FailureShell { first: Reason; phase: number; boundary: 'none' | 'before' | 'attempt' | 'after' | 'done' | 'binding'; }
interface ProductSlot { stage: Stage; value: object | undefined }
// 1 result shell, 2 supply slot, 3 packet holder, 4 layout, 5..29 cell holders,
// 30 admission use slot, 31 synthetic start, 32 target descriptor, 33 supply claim, 34 bound descriptor.
class SupplyShellAssembly {
  readonly #failure: FailureShell;
  readonly #products: ProductSlot[];
  #frame = false; #started = false; #closeRequested = false; #bindings = 0;
  #state: 'unused' | 'constructing' | 'bound' | 'rejected' = 'unused';
  #fixed: Readonly<{ ok: boolean; disposition: string; first: Reason }> | undefined;
  #reentry: string | undefined; #closeInFrame: string | undefined;
  constructor(private readonly script: string, admitted: boolean) {
    // B00: failure owner exists before any start/descriptor/empty-holder generation below.
    // Failure of this shell or fixed slot-array allocation itself remains real-OOM Unknown.
    this.#failure = { first: admitted ? 'none' : 'input_rejected', phase: 0, boundary: 'none' };
    this.#products = Array.from({ length: 34 }, () => ({ stage: 'not_started', value: undefined }));
  }
  private reply(ok: boolean, disposition: string) { return Object.freeze({ ok, disposition, first: this.#failure.first }); }
  private reject(reason: Exclude<Reason, 'none'>) {
    if (this.#failure.first === 'none') this.#failure.first = reason;
    this.#state = 'rejected'; return this.#fixed ??= this.reply(false, reason);
  }
  private fault(n: number, boundary: 'before' | 'attempt' | 'after' | 'done') {
    this.#failure.phase = n; this.#failure.boundary = boundary;
    if (this.script === `${boundary}_${n}`) throw Error('private_synthetic_construction');
  }
  private mint<T extends object>(n: number, operation: () => T): T {
    this.fault(n, 'before');
    const slot = this.#products[n - 1];
    if (!supplyStageAllows(slot.stage, 'attempting')) throw Error('construction_stage');
    slot.stage = 'attempting'; this.fault(n, 'attempt');
    const value = operation(); slot.value = value; slot.stage = 'provisional'; this.fault(n, 'after');
    slot.stage = 'confirmed'; this.fault(n, 'done'); return value;
  }
  private start(): SyntheticStart {
    return Object.freeze({ scope: Object.freeze({ owner: Object.freeze({}), construction: Object.freeze({}),
      retention: Object.freeze({}), sourceSlot: Object.freeze({}), claim: Object.freeze({}) }), epoch: Object.freeze({}), packet: Object.freeze({}) });
  }
  private probe(d: TargetDescriptor): TargetDescriptor {
    if (this.script === 'descriptor_copy') return Object.freeze({ ...d });
    if (this.script === 'descriptor_extra') return Object.freeze({ ...d, extra: true });
    if (this.script === 'descriptor_variant') return Object.freeze({ ...d, kind: 'wrong' }) as unknown as TargetDescriptor;
    if (this.script === 'foreign_start') return Object.freeze({ ...d, start: this.start() });
    if (this.script === 'scope_copy') return Object.freeze({ ...d, scope: Object.freeze({ ...d.scope }) });
    if (['owner', 'construction', 'retention', 'sourceSlot', 'claim'].includes(this.script))
      return Object.freeze({ ...d, scope: Object.freeze({ ...d.scope, [this.script]: Object.freeze({}) }) });
    if (this.script === 'epoch' || this.script === 'packet') return Object.freeze({ ...d, [this.script]: Object.freeze({}) });
    if (this.script === 'descriptor_brand') return Object.freeze({ ...d, [TARGET_BRAND]: false }) as unknown as TargetDescriptor;
    return d;
  }
  private matches(): boolean {
    const start = this.#products[30].value as SyntheticStart | undefined;
    const issued = this.#products[31].value as TargetDescriptor | undefined;
    const claim = this.#products[32].value as SupplyClaim | undefined;
    const d = this.#products[33].value as TargetDescriptor | undefined;
    if (!start || !issued || !claim || !d || d !== issued || Reflect.ownKeys(d).length !== 6 || d[TARGET_BRAND] !== true
      || d.kind !== 'synthetic_target' || d.start !== start || d.scope !== start.scope || d.epoch !== start.epoch || d.packet !== start.packet
      || claim[CLAIM_BRAND] !== true || claim.target !== issued || claim.state !== 'unused') return false;
    return this.#products.slice(0, 30).every(s => s.stage === 'confirmed' && !!s.value)
      && (this.#products[2].value as EmptyHolder).reference === undefined
      && this.#products.slice(4, 29).every((s, i) => {
        const h = s.value as CellHolder; return h.kind === 'empty_holder' && h.reference === undefined && h.cell === i + 1 && h.field === FIELDS[i];
      });
  }
  prepare() {
    if (this.#fixed) return this.#fixed;
    if (this.#frame) return this.reply(false, 'construction_in_progress');
    if (this.#failure.first !== 'none') return this.reject(this.#failure.first);
    // A close before construction is a stop only: no first diagnosis, and no later construction.
    if (!this.#started && this.#closeRequested) return this.reply(false, 'closed');
    if (this.#started) return this.reject('duplicate_preparation');
    this.#started = true; this.#frame = true; this.#state = 'constructing';
    try {
      this.mint(1, () => Object.freeze({ kind: 'result_shell', value: undefined }));
      this.mint(2, () => ({ kind: 'supply_slot', state: 'unbound' } satisfies JournalSupplySlot));
      this.mint(3, () => Object.freeze({ kind: 'empty_holder', reference: undefined }));
      this.mint(4, () => FIELDS);
      for (let i = 0; i < 25; i++) this.mint(i + 5, () => Object.freeze({ kind: 'empty_holder', reference: undefined, cell: i + 1, field: FIELDS[i] }));
      this.mint(30, () => Object.freeze({ kind: 'admission_use_slot', state: 'unused' }));
      if (this.script === 'reenter') this.#reentry = this.prepare().disposition;
      if (this.script === 'close_in_frame') this.#closeInFrame = this.close().disposition;
      if (this.#closeRequested) return this.reject('closed');
      const start = this.mint(31, () => this.start());
      const issued = this.mint(32, () => {
        const d = Object.freeze<TargetDescriptor>({ [TARGET_BRAND]: true, kind: 'synthetic_target',
          start, scope: start.scope, epoch: start.epoch, packet: start.packet });
        return this.script === 'descriptor_copy' ? d : this.probe(d);
      });
      // Claim controls install the malformed claim as the only issued claim, so only its own field check can reject it.
      this.mint(33, () => Object.freeze({ [CLAIM_BRAND]: this.script !== 'claim_brand',
        target: this.script === 'claim_target' ? Object.freeze({ ...issued }) : issued,
        state: this.script === 'claim_state' ? 'spent' : 'unused' }) as unknown as SupplyClaim);
      this.mint(34, () => this.script === 'descriptor_copy' ? this.probe(issued) : issued);
      this.#failure.phase = 34; this.#failure.boundary = 'binding';
      if (!this.matches()) return this.reject('binding_mismatch');
      (this.#products[1].value as JournalSupplySlot).state = 'bound';
      this.#bindings = 1; this.#state = 'bound'; return this.reply(true, 'bound_only');
    } catch { return this.reject('construction_unconfirmed'); }
    finally { this.#frame = false; }
  }
  check() {
    if (this.#fixed) return this.#fixed;
    if (this.#frame) return this.reply(false, 'construction_in_progress');
    if (this.#failure.first !== 'none') return this.reject(this.#failure.first);
    if (!this.#started && this.#closeRequested) return this.reply(false, 'closed');
    if (this.#state !== 'bound') return this.reply(false, 'not_ready');
    if (!this.matches()) return this.reject('binding_mismatch');
    return this.reply(false, 'blocked_supply'); // No bound→preparing/claim consumption in this stage.
  }
  close() {
    if (this.#fixed) return this.#fixed;
    this.#closeRequested = true;
    if (this.#frame) return this.reply(false, 'deferred_frame');
    if (!this.#started) return this.reply(false, 'closed');
    return this.reject('closed');
  }
  rejectInput() { return this.reject('input_rejected'); }
  inspect() {
    return Object.freeze({ model: 'wfb-journal-supply-shell-fake-1', state: this.#state, first: this.#failure.first,
      phase: this.#failure.phase, boundary: this.#failure.boundary, frame: this.#frame ? 'active' : 'inactive',
      closeRequested: this.#closeRequested, bindings: this.#bindings, reentry: this.#reentry, closeInFrame: this.#closeInFrame,
      stages: Object.freeze(this.#products.map(s => s.stage)), retained: this.#products.filter(s => !!s.value).length,
      cellHolders: this.#products.slice(4, 29).filter(s => !!s.value).length,
      layout: this.#products[3].value ? FIELDS : undefined,
      supplyClaim: this.#products[32].value ? 'unused' : 'not_created', supplyConsumptions: 0,
      issuerConnection: 'closed', finalAnchor: 'not_issued', admissionConsumptions: 0, packetObjects: 0, cellObjects: 0,
      sourceGenerations: 0, journalReads: 0, fieldClears: 0, proofIssuance: 'closed', rootFinish: 'not_called' });
  }
}
const SCRIPTS = Object.freeze(['normal', 'reenter', 'close_in_frame', 'descriptor_copy', 'descriptor_extra', 'descriptor_variant',
  'foreign_start', 'scope_copy', 'owner', 'construction', 'retention', 'sourceSlot', 'claim', 'epoch', 'packet',
  'descriptor_brand', 'claim_brand', 'claim_target', 'claim_state']);
export function createJournalSupplyShellFake(...args: readonly unknown[]) {
  const script = args.length ? args[0] : 'normal';
  const fault = typeof script === 'string' ? /^(before|attempt|after|done)_([1-9]|[12][0-9]|3[0-4])$/.test(script) : false;
  const admitted = args.length <= 1 && typeof script === 'string' && (SCRIPTS.includes(script) || fault);
  const a = new SupplyShellAssembly(admitted ? script as string : 'normal', admitted);
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.prepare(),
    check: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.check(),
    close: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.close(), inspect: () => a.inspect() });
}
