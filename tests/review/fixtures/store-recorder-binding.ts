/** SB-A: test-only admission/claim model. No save, receipt issuance, acknowledgement or I/O. */
import { FakeFixedRecorder, planTime, type Checkpoint, type Timing } from './fixed-recorder.js';
import { FakeEvidenceStore, type EvidenceOps, type StoreCaps } from './fixed-evidence-store.js';

declare const runBrand: unique symbol;
declare const recorderBrand: unique symbol;
declare const storeBrand: unique symbol;
declare const checkpointBrand: unique symbol;
declare const claimBrand: unique symbol;
export interface BoundRun { readonly [runBrand]: true }
export interface BoundRecorder { readonly [recorderBrand]: true }
export interface BoundStore { readonly [storeBrand]: true }
export interface BoundCheckpoint { readonly [checkpointBrand]: true }
export interface PreparationClaim { readonly [claimBrand]: true }
// Reserved for the private post-save continuation in SB-B; SB-A has no issuer.
interface StoredCheckpointEvidence { readonly checkpoint: Checkpoint; readonly receiptOrigin: object }
type Failure = 'binding' | 'state' | 'clock' | 'deadline' | 'construction' | 'discarded';
type Phase = 'Idle' | 'InFlight' | 'Stopped' | 'Closed';
type Slot = { status: 'empty' | 'bound' | 'claimed' | 'retired'; checkpoint?: Checkpoint; binding?: BoundCheckpoint; claim?: PreparationClaim };
export interface BindingInput {
  timing: Timing; root: object; ops: EvidenceOps; now: () => number;
  limits: Pick<StoreCaps, 'fileBytes' | 'totalBytes' | 'attempts' | 'retries'>;
  cleanupMs: number;
  /** Fixed fault labels only, not injectable construction/ack continuations. */
  failAt?: 'owner' | 'recorder' | 'store';
}
const runClaims = new WeakSet<object>(); // Synthetic module only; never a runtime/session ledger.
const objectToken = (v: unknown): v is object => v !== null && typeof v === 'object';
const token = <T>() => Object.freeze({}) as T;

export class SyntheticStoreRecorderBinding {
  readonly run = token<BoundRun>();
  readonly recorder = token<BoundRecorder>();
  readonly store = token<BoundStore>();
  #runOrigin = Object.freeze({});
  #phase: Phase = 'Idle';
  #reason: Failure | undefined;
  #stage: 'owner' | 'recorder' | 'store' | 'ready' = 'owner';
  #epoch = 0;
  #busy = false;
  #reading = false;
  #last = 0;
  #claims = 0;
  #slots: Slot[] = Array.from({ length: 6 }, () => ({ status: 'empty' }));
  #record: FakeFixedRecorder | undefined;
  #storage: FakeEvidenceStore | undefined;
  #storedEvidence: StoredCheckpointEvidence | undefined;
  #plan: NonNullable<ReturnType<typeof planTime>> | undefined;
  #saveDeadline = 0;
  #now: (() => number) | undefined;

  private constructor() {}
  static create(runKey: object, input: BindingInput) {
    if (!objectToken(runKey) || runClaims.has(runKey)) return { ok: false as const, diagnostic: 'run_claim' as const };
    runClaims.add(runKey); // Never refunded, including a failed construction.
    const owner = new SyntheticStoreRecorderBinding(); // diagnostic slots precede children and input inspection
    try {
      if (input.failAt === 'owner') throw Error();
      const t = input.timing;
      const pinned: Timing = { startedAt: t.startedAt, outerMs: t.outerMs, sessionDeadline: t.sessionDeadline,
        marginMs: t.marginMs, reservations: { ...t.reservations } };
      const plan = planTime(pinned);
      if (!plan || !Number.isSafeInteger(input.cleanupMs) || input.cleanupMs <= 0
        || plan.stages[3] - input.cleanupMs <= plan.stages[2]) throw Error();
      owner.#plan = plan;
      owner.#saveDeadline = plan.stages[3] - input.cleanupMs;
      owner.#last = plan.startedAt;
      owner.#now = input.now;
      const sharedClock = () => owner.#readClock();
      owner.#stage = 'recorder';
      if (input.failAt === 'recorder') throw Error();
      owner.#record = FakeFixedRecorder.create(pinned, sharedClock);
      if (!owner.#record) throw Error();
      owner.#stage = 'store';
      if (input.failAt === 'store') throw Error();
      owner.#storage = FakeEvidenceStore.create(input.ops, input.root, owner.#runOrigin,
        { ...input.limits, deadline: owner.#saveDeadline, cleanupDeadline: plan.stages[3] }, sharedClock);
      if (!owner.#storage) throw Error();
      owner.#stage = 'ready';
      // Freeze the public surface, not the private state; no child instance is exposed.
      Object.freeze(owner);
      return { ok: true as const, root: owner };
    } catch {
      owner.#fatal('construction');
      return { ok: false as const, diagnostic: owner.snapshot() };
    }
  }
  #retire() {
    for (const slot of this.#slots) {
      if (slot.status !== 'empty') slot.status = 'retired';
      slot.checkpoint = undefined;
      slot.binding = undefined;
      slot.claim = undefined;
    }
    this.#storedEvidence = undefined;
  }
  #fatal(reason: Failure) {
    if (this.#phase === 'Stopped' || this.#phase === 'Closed') return false;
    this.#reason ??= reason;
    this.#phase = 'Stopped';
    this.#epoch++;
    this.#retire();
    this.#storage?.cancel();
    this.#record?.recorderFailure();
    return false;
  }
  #terminal() { return this.#phase === 'Stopped' || this.#phase === 'Closed'; }
  #readClock() {
    if (this.#reading || this.#phase === 'Stopped' || this.#phase === 'Closed') {
      this.#fatal('clock'); throw Error('binding_clock');
    }
    this.#reading = true;
    let at: number;
    try { at = this.#now!(); }
    catch { this.#fatal('clock'); throw Error('binding_clock'); }
    finally { this.#reading = false; }
    if (!Number.isSafeInteger(at) || at < this.#last || at < 0) {
      this.#fatal('clock'); throw Error('binding_clock');
    }
    if (this.#terminal()) throw Error('binding_stopped');
    this.#last = at;
    return at;
  }
  #enter(required: Phase) {
    if (this.#busy) return this.#fatal('binding');
    if (this.#phase !== required) return this.#fatal('state');
    this.#busy = true;
    return true;
  }
  #guard() {
    const epoch = this.#epoch;
    let at: number;
    try { at = this.#readClock(); } catch { return false; }
    if (epoch !== this.#epoch || this.#phase === 'Stopped' || this.#phase === 'Closed') return false;
    if (at >= this.#saveDeadline) {
      this.#phase = 'Closed'; // observation/save cutoff is not fatal Store.cancel
      this.#retire();
      return false;
    }
    return true;
  }
  #command(action: (recorder: FakeFixedRecorder) => boolean) {
    if (!this.#enter('Idle')) return false;
    try {
      const ok = action(this.#record!);
      if (this.#phase === 'Stopped' || this.#phase === 'Closed') return false;
      const result = this.#record!.snapshot();
      if (result.state === 'Closed') { this.#phase = 'Closed'; this.#retire(); }
      // Cancellation / D_stop is observation-only; a recorder clock failure is fatal.
      else if (result.reason === 'clock') return this.#fatal('clock');
      return ok;
    } finally { this.#busy = false; }
  }
  reserve(gates: boolean) { return this.#command(r => r.reserve(gates)); }
  start() { return this.#command(r => r.start()); }
  poll() { return this.#command(r => r.poll()); }
  testAnomaly() { return this.#command(r => r.testAnomaly()); }
  endTest(result: 'passed' | 'failed' | 'incomplete', complete: boolean) { return this.#command(r => r.endTest(result, complete)); }
  observeStop() {
    if (this.#terminal()) return false;
    // Observation cancellation is not a new bridge operation, even during a clock callback.
    // In SB-A the conditions checkpoint cannot yet be acked, so Reserved closes directly.
    this.#record?.cancel();
    if (this.#record?.snapshot().state === 'Closed') { this.#phase = 'Closed'; this.#retire(); }
    return false;
  }

  checkpoint(): BoundCheckpoint | undefined {
    if (!this.#enter('Idle')) return undefined;
    try {
      if (!this.#guard()) return undefined;
      const head = this.#record!.snapshot().checkpoints[0];
      if (!head) return undefined;
      const slot = this.#slots[head.sequence - 1];
      if (!slot || (slot.checkpoint && slot.checkpoint !== head) || slot.status === 'retired') {
        this.#fatal('binding'); return undefined;
      }
      if (!slot.binding) {
        slot.checkpoint = head;
        slot.binding = token<BoundCheckpoint>();
        slot.status = 'bound';
      }
      return slot.binding;
    } finally { this.#busy = false; }
  }
  prepare(run: BoundRun, recorder: BoundRecorder, store: BoundStore, binding: BoundCheckpoint): PreparationClaim | undefined {
    if (!this.#enter('Idle')) return undefined;
    try {
      if (run !== this.run || recorder !== this.recorder || store !== this.store) {
        this.#fatal('binding'); return undefined;
      }
      const slot = this.#slots.find(s => s.binding === binding);
      if (!slot || slot.status !== 'bound' || slot.checkpoint !== this.#record!.snapshot().checkpoints[0]) {
        this.#fatal('binding'); return undefined;
      }
      slot.status = 'claimed';
      this.#claims++;
      this.#phase = 'InFlight';
      if (!this.#guard()) return undefined;
      const claim = token<PreparationClaim>();
      slot.claim = claim;
      return claim;
    } finally { this.#busy = false; }
  }
  /** SB-A has only a fixed discard continuation, never a proof issuer or successful ack. */
  discard(claim: PreparationClaim) {
    if (!this.#enter('InFlight')) return false;
    try {
      const slot = this.#slots.find(s => s.claim === claim && s.status === 'claimed');
      if (!slot) return this.#fatal('binding');
      this.#fatal('discarded');
      return true;
    } finally { this.#busy = false; }
  }
  snapshot() {
    const recorder = this.#record?.snapshot();
    return Object.freeze({ phase: this.#phase, reason: this.#reason, stage: this.#stage, epoch: this.#epoch,
      claims: this.#claims, evidenceIssued: this.#storedEvidence !== undefined,
      slots: Object.freeze(this.#slots.map(s => s.status)),
      recorder, store: this.#storage?.snapshot(), unacknowledged: recorder?.checkpoints.length ?? 0,
      deadlines: this.#plan ? Object.freeze({ save: this.#saveDeadline, cleanup: this.#plan.stages[3], all: this.#plan.all }) : undefined });
  }
}
