/** Test-only shared kernel. Closed continuations are module-private; no filesystem or network adapter. */
import { createHash } from 'node:crypto';

// Installed by class static blocks; deliberately never exported as friend/registration APIs.
let boundAckReady: (recorder: FakeFixedRecorder, checkpoint: Checkpoint) => boolean;
let boundAckCommit: (recorder: FakeFixedRecorder, checkpoint: Checkpoint) => void;
let boundConsume: (store: FakeEvidenceStore, run: object, receipt: FakeSaveReceipt, expected: SavedFacts) => boolean;
const shiftQueue = Function.prototype.call.bind(Array.prototype.shift) as (queue: Checkpoint[]) => Checkpoint | undefined;

/** Legacy recorder state model; its bound ack continuation remains private to this module. */
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
  static {
    boundAckReady = (r, checkpoint) => r.#state !== 'Closed' && r.#state !== 'Published' && r.#queue[0] === checkpoint;
    boundAckCommit = (r, checkpoint) => {
      shiftQueue(r.#queue);
      if (checkpoint.trigger === 'conditions_ready') r.#conditionsWritten = true;
    };
  }
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
      // Unacknowledged is not proof of absent bytes: a bound save can succeed before ack fails.
      unsaved: this.#state === 'Closed' ? this.#queue.length : 0 });
  }
}

/** Synthetic boundary only: no filesystem, process, transport, or runtime registration. */

export const RUN_FILES = Object.freeze([
  'conditions.json', 'runner.mjs', 'load-setup.ts', 'summary.mjs',
  ...Array.from({ length: 6 }, (_, i) => `report.partial.${String(i + 1).padStart(4, '0')}.json`),
  'report.final.json', 'termination.json', 'analysis.json', 'manifest.json',
]);
export type SlotCategory = 'evidence' | 'manifest';
interface DeadlineRow { readonly category: SlotCategory | 'legacy'; readonly deadline: number; readonly cleanupDeadline: number }
export interface SlotDeadlinePlan {
  readonly version: 'wfb-slot-deadlines-1';
  readonly startedAt: number; readonly stop: number; readonly confirm: number; readonly all: number;
  readonly evidence: Readonly<DeadlineRow & { category: 'evidence' }>;
  readonly manifest: Readonly<DeadlineRow & { category: 'manifest' }>;
}
declare const deadlineTableBrand: unique symbol;
export interface FakeDeadlineTable { readonly [deadlineTableBrand]: true }
const deadlineTables = new WeakMap<object, { run: object; budget: object; plan: SlotDeadlinePlan }>();
/** Strict own DATA only: no getter, unknown key, symbol or caller-defined row mapping. */
function fixedData(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  try {
    if (!value || typeof value !== 'object') return undefined;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return undefined;
    const names = Reflect.ownKeys(value);
    if (names.length !== keys.length || names.some(k => typeof k !== 'string' || !keys.includes(k))) return undefined;
    const result: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (!d || !('value' in d) || !d.enumerable) return undefined;
      result[key] = d.value;
    }
    return result;
  } catch { return undefined; }
}
export function planSlotDeadlines(value: unknown): SlotDeadlinePlan | undefined {
  const input = fixedData(value, ['timing', 'cleanupMs', 'manifestCleanupMs']);
  const t = fixedData(input?.timing, ['startedAt', 'outerMs', 'sessionDeadline', 'marginMs', 'reservations']);
  const r = fixedData(t?.reservations, ['stop', 'force', 'confirm', 'flush', 'manifest', 'final']);
  if (!input || !t || !r) return undefined;
  const plan = planTime({ startedAt: t.startedAt as number, outerMs: t.outerMs as number,
    sessionDeadline: t.sessionDeadline as number, marginMs: t.marginMs as number,
    reservations: { stop: r.stop as number, force: r.force as number, confirm: r.confirm as number,
      flush: r.flush as number, manifest: r.manifest as number, final: r.final as number } });
  const cleanup = input.cleanupMs as number, manifestCleanup = input.manifestCleanupMs as number;
  if (!plan || !positive(cleanup) || !positive(manifestCleanup)) return undefined;
  const evidence = plan.stages[3] - cleanup, manifest = plan.stages[4] - manifestCleanup;
  if (!natural(evidence) || !natural(manifest) || !(plan.stages[2] < evidence && evidence < plan.stages[3]
    && plan.stages[3] < manifest && manifest < plan.stages[4] && plan.stages[4] < plan.all)) return undefined;
  return Object.freeze({ version: 'wfb-slot-deadlines-1', startedAt: plan.startedAt, stop: plan.stop, confirm: plan.stages[2], all: plan.all,
    evidence: Object.freeze({ category: 'evidence', deadline: evidence, cleanupDeadline: plan.stages[3] }),
    manifest: Object.freeze({ category: 'manifest', deadline: manifest, cleanupDeadline: plan.stages[4] }) });
}
/** Standalone synthetic table issuer only; cannot authenticate a production budget or run. */
export function createFakeDeadlineTable(run: object, budget: object, input: unknown) {
  if (!run || typeof run !== 'object' || !budget || typeof budget !== 'object') return undefined;
  const plan = planSlotDeadlines(input);
  if (!plan) return undefined;
  const table = Object.freeze({}) as FakeDeadlineTable;
  deadlineTables.set(table, { run, budget, plan });
  return Object.freeze({ table, plan });
}
export type StoreReason = 'binding' | 'limit' | 'clock' | 'deadline' | 'cancelled' | 'create'
  | 'write' | 'retry' | 'flush' | 'close' | 'reread' | 'digest';
export type WriteResult = { kind: 'written'; bytes: number } | { kind: 'eintr' };
/** Each method is one synchronous fake attempt. identity includes fake permission/path checks. */
export interface EvidenceOps {
  identity(): object | undefined;
  createExclusive(slot: string): object | undefined;
  writeOnce(handle: object, offset: number, bytes: Uint8Array): WriteResult;
  flushOnce(handle: object): boolean;
  closeOnce(handle: object): boolean;
  readBack(handle: object, slot: string, limit: number): Uint8Array | undefined;
}
export interface StoreCaps {
  fileBytes: number; totalBytes: number; attempts: number; retries: number;
  deadline: number; cleanupDeadline: number;
}
export interface TableStoreCaps extends Pick<StoreCaps, 'fileBytes' | 'totalBytes' | 'attempts' | 'retries'> {
  deadlineTable: FakeDeadlineTable; budget: object;
}
declare const receiptBrand: unique symbol;
export interface FakeSaveReceipt { readonly [receiptBrand]: true }
export interface SaveAttempt {
  readonly disposition: 'not_started' | 'create_failed' | 'partial_unverified' | 'saved';
  readonly createAttempted: boolean;
  readonly handleAcquired: boolean;
  readonly closeAttempted: boolean;
  readonly cleanup: 'not_started' | 'confirmed' | 'late' | 'unconfirmed';
  readonly cleanupReason?: 'close' | 'clock' | 'deadline';
  readonly reason?: StoreReason | 'store_stopped';
  readonly rejection?: 'busy' | 'sticky';
  readonly reservedBytes: number;
  readonly deadlineClass?: SlotCategory;
  readonly deadlineVersion?: 'wfb-slot-deadlines-1';
}
export interface SaveAttemptResult { readonly receipt?: FakeSaveReceipt; readonly attempt: Readonly<SaveAttempt> }
type MutableAttempt = { -readonly [K in keyof SaveAttempt]: SaveAttempt[K] };
interface SavedFacts { slot: string; size: number; digest: string }
interface Saved extends SavedFacts { row: DeadlineRow; tableOrigin: object }
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
// Intrinsic accessor: a subclass or a Proxy cannot misreport the size of the bytes it holds.
const intrinsicByteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;
const realLength = (bytes: Uint8Array) => intrinsicByteLength.call(bytes) as number;

export class FakeEvidenceStore {
  static {
    boundConsume = (s, run, receipt, expected) => {
      if (s.#busy) return s.#fail('binding');
      if (s.#reason) return false;
      s.#busy = true;
      try {
        const saved = s.#receipts.get(receipt);
        if (!saved || s.#consumed.has(receipt)) return s.#fail('binding');
        s.#consumed.add(receipt);
        if (run !== s.run || saved.slot !== expected.slot || saved.size !== expected.size || saved.digest !== expected.digest)
          return s.#fail('binding');
        if (saved.tableOrigin !== s.#tableOrigin || saved.row !== s.#row(saved.slot)) return s.#fail('binding');
        return s.#guard(saved.row) && s.#guard(saved.row);
      } finally { s.#busy = false; }
    };
  }
  #reason: StoreReason | undefined;
  #busy = false;
  #last = 0;
  #slots = new Set<string>();
  #receipts = new WeakMap<object, Saved>();
  #consumed = new WeakSet<object>();
  #charged = 0;
  #cleanup: 'not_started' | 'confirmed' | 'late' | 'unconfirmed' = 'not_started';
  #tableOrigin: object;
  #legacyRow: DeadlineRow | undefined;
  #tablePlan: SlotDeadlinePlan | undefined;
  private constructor(private readonly ops: EvidenceOps, private readonly root: object,
    private readonly run: object, private readonly caps: Readonly<Pick<StoreCaps, 'fileBytes' | 'totalBytes' | 'attempts' | 'retries'>>,
    private readonly now: () => number, tableOrigin: object, legacy?: DeadlineRow, plan?: SlotDeadlinePlan) {
    this.#tableOrigin = tableOrigin; this.#legacyRow = legacy; this.#tablePlan = plan;
    this.#last = plan?.startedAt ?? 0;
  }
  static create(ops: EvidenceOps, root: object, run: object, input: StoreCaps | TableStoreCaps, now: () => number) {
    let caps: StoreCaps | TableStoreCaps, binding: { run: object; budget: object; plan: SlotDeadlinePlan } | undefined;
    let table: object | undefined;
    try {
      if ('deadlineTable' in input) {
        const data = fixedData(input, ['fileBytes', 'totalBytes', 'attempts', 'retries', 'deadlineTable', 'budget']);
        if (!data) return undefined;
        caps = data as unknown as TableStoreCaps;
        table = caps.deadlineTable;
        binding = deadlineTables.get(table);
        if (!binding || binding.run !== run || binding.budget !== caps.budget) return undefined;
      } else caps = { ...input };
    } catch { return undefined; }
    // Structural ceilings for this small fake, not approved production limits.
    if (!root || typeof root !== 'object' || !run || typeof run !== 'object'
      || !positive(caps.fileBytes) || caps.fileBytes > 65_536 || !positive(caps.totalBytes)
      || caps.totalBytes > 1_048_576 || caps.totalBytes < caps.fileBytes
      || !positive(caps.attempts) || caps.attempts > 4096 || !natural(caps.retries) || caps.retries > 16) return undefined;
    const limits = Object.freeze({ fileBytes: caps.fileBytes, totalBytes: caps.totalBytes, attempts: caps.attempts, retries: caps.retries });
    if (binding && table) return new FakeEvidenceStore(ops, root, run, limits, now, table, undefined, binding.plan);
    if (!('deadline' in caps) || !positive(caps.deadline) || !positive(caps.cleanupDeadline) || caps.cleanupDeadline <= caps.deadline) return undefined;
    const row = Object.freeze({ category: 'legacy' as const, deadline: caps.deadline, cleanupDeadline: caps.cleanupDeadline });
    return new FakeEvidenceStore(ops, root, run, limits, now, Object.freeze({}), row);
  }
  #row(slot: string): DeadlineRow | undefined {
    if (!RUN_FILES.includes(slot)) return undefined;
    return this.#legacyRow ?? (slot === 'manifest.json' ? this.#tablePlan?.manifest : this.#tablePlan?.evidence);
  }
  #fail(reason: StoreReason) { this.#reason ??= reason; return false; }
  #read(): number | undefined {
    let at: number;
    try { at = this.now(); } catch { this.#fail('clock'); return undefined; }
    if (!natural(at) || at < this.#last) { this.#fail('clock'); return undefined; }
    this.#last = at;
    return at;
  }
  #clock(deadline: number) {
    const at = this.#read();
    return at !== undefined && (at < deadline || this.#fail('deadline'));
  }
  #guard(row: DeadlineRow) {
    if (this.#reason || !this.#clock(row.deadline) || this.#reason) return false;
    try { if (this.ops.identity() !== this.root) return this.#fail('binding'); }
    catch { return this.#fail('binding'); }
    return !this.#reason && this.#clock(row.deadline) && !this.#reason;
  }
  /** A reported release is confirmed before the cleanup reserve ends and late from then on; no readable time stays unconfirmed. */
  #closeAttempt(handle: object, attempt: MutableAttempt, row: DeadlineRow) {
    this.#cleanup = 'unconfirmed';
    attempt.closeAttempted = true;
    attempt.cleanup = 'unconfirmed';
    let ok: boolean;
    try { ok = this.ops.closeOnce(handle); }
    catch { attempt.cleanupReason = 'close'; throw Error('store_close'); }
    if (!ok) { attempt.cleanupReason = 'close'; return false; }
    const at = this.#read();
    if (at !== undefined) {
      this.#cleanup = at < row.cleanupDeadline ? 'confirmed' : 'late';
      attempt.cleanup = this.#cleanup;
      if (this.#cleanup === 'late') attempt.cleanupReason = 'deadline';
    } else attempt.cleanupReason = 'clock';
    return true;
  }
  #step(action: () => boolean, reason: StoreReason, row: DeadlineRow) {
    if (!this.#guard(row)) return false;
    try { if (!action()) return this.#fail(reason); }
    catch { return this.#fail(reason); }
    return this.#guard(row);
  }
  cancel() { this.#fail('cancelled'); }
  save(run: object, slot: string, bytes: Uint8Array): FakeSaveReceipt | undefined {
    return this.saveAttempt(run, slot, bytes).receipt;
  }
  saveAttempt(run: object, slot: string, bytes: Uint8Array): SaveAttemptResult {
    // Per-invocation storage, including reentry and sticky refusal; never a shared last-result slot.
    const attempt: MutableAttempt = { disposition: 'not_started', createAttempted: false, handleAcquired: false,
      closeAttempted: false, cleanup: 'not_started', reservedBytes: 0 };
    const receipt = this.#save(run, slot, bytes, attempt);
    return Object.freeze({ receipt, attempt: Object.freeze(attempt) });
  }
  #save(run: object, slot: string, bytes: Uint8Array, attempt: MutableAttempt): FakeSaveReceipt | undefined {
    if (this.#busy) {
      attempt.reason = 'binding'; attempt.rejection = 'busy';
      this.#fail('binding'); return undefined;
    }
    if (this.#reason) { attempt.reason = 'store_stopped'; attempt.rejection = 'sticky'; return undefined; }
    this.#busy = true;
    let handle: object | undefined;
    let row: DeadlineRow | undefined;
    let closed = false;
    this.#cleanup = 'not_started';
    try {
      if (run !== this.run || !RUN_FILES.includes(slot) || this.#slots.has(slot)) { this.#fail('binding'); return undefined; }
      this.#slots.add(slot); // spent even when validation or create fails
      row = this.#row(slot);
      if (!row) { this.#fail('binding'); return undefined; }
      if (row.category !== 'legacy') {
        attempt.deadlineClass = row.category; attempt.deadlineVersion = 'wfb-slot-deadlines-1';
      }
      if (!(bytes instanceof Uint8Array)) { this.#fail('limit'); return undefined; }
      const size = realLength(bytes);
      if (size > this.caps.fileBytes || size > this.caps.totalBytes - this.#charged) { this.#fail('limit'); return undefined; }
      this.#charged += size; // failed/partial writes never refund the reservation
      attempt.reservedBytes = size;
      // No callback runs between the size check and this internal-slot copy.
      const owned = new Uint8Array(bytes);
      const digest = sha256(owned);
      if (!this.#step(() => {
        attempt.createAttempted = true;
        handle = this.ops.createExclusive(slot);
        attempt.handleAcquired = !!handle;
        return !!handle;
      }, 'create', row)) return undefined;
      let offset = 0, attempts = 0, retries = 0;
      while (offset < owned.byteLength) {
        if (attempts === this.caps.attempts) { this.#fail('limit'); return undefined; }
        attempts++;
        let outcome: WriteResult | undefined;
        if (!this.#step(() => { outcome = this.ops.writeOnce(handle!, offset, owned.slice(offset)); return true; }, 'write', row)) return undefined;
        if (outcome?.kind === 'eintr') {
          if (retries === this.caps.retries) { this.#fail('retry'); return undefined; }
          retries++;
        } else if (outcome?.kind === 'written' && positive(outcome.bytes) && outcome.bytes <= owned.byteLength - offset) {
          offset += outcome.bytes;
        } else { this.#fail('write'); return undefined; }
      }
      if (!this.#step(() => this.ops.flushOnce(handle!), 'flush', row)) return undefined;
      if (!this.#step(() => {
        closed = true; // one attempt even if it throws or cannot confirm release
        return this.#closeAttempt(handle!, attempt, row!);
      }, 'close', row)) return undefined;
      let reread: Uint8Array | undefined;
      if (!this.#step(() => { reread = this.ops.readBack(handle!, slot, this.caps.fileBytes); return reread instanceof Uint8Array; }, 'reread', row)) return undefined;
      if (realLength(reread!) !== owned.byteLength) { this.#fail('reread'); return undefined; }
      if (sha256(reread!) !== digest) { this.#fail('digest'); return undefined; }
      if (!this.#guard(row)) return undefined;
      const receipt = Object.freeze({}) as FakeSaveReceipt;
      this.#receipts.set(receipt, Object.freeze({ slot, size: owned.byteLength, digest, row, tableOrigin: this.#tableOrigin }));
      attempt.disposition = 'saved';
      return receipt;
    } catch {
      this.#fail('binding'); // never reflect unexpected input/allocation exceptions
      return undefined;
    } finally {
      if (handle && !closed) {
        closed = true;
        this.#cleanup = 'unconfirmed';
        attempt.cleanup = 'unconfirmed';
        // Cleanup has a separate finite reserve and never resets the original failure.
        const at = this.#read();
        if (at === undefined) attempt.cleanupReason = 'clock';
        else if (at >= row!.cleanupDeadline) { attempt.cleanupReason = 'deadline'; this.#fail('deadline'); }
        else { try { this.#closeAttempt(handle, attempt, row!); } catch { /* first operation reason retained */ } }
      }
      if (attempt.disposition !== 'saved') {
        attempt.disposition = attempt.handleAcquired ? 'partial_unverified' : attempt.createAttempted ? 'create_failed' : 'not_started';
        attempt.reason = this.#reason ?? 'binding';
      }
      this.#busy = false;
    }
  }
  consume(run: object, receipt: FakeSaveReceipt) {
    if (this.#busy) { this.#fail('binding'); return undefined; }
    if (this.#reason) return undefined;
    this.#busy = true;
    try {
      const saved = this.#receipts.get(receipt);
      if (!saved || this.#consumed.has(receipt)) { this.#fail('binding'); return undefined; }
      this.#consumed.add(receipt); // pre-spend, including wrong-run or failed pre/post guard
      if (run !== this.run) { this.#fail('binding'); return undefined; }
      if (saved.tableOrigin !== this.#tableOrigin || saved.row !== this.#row(saved.slot)) { this.#fail('binding'); return undefined; }
      if (!this.#guard(saved.row) || !this.#guard(saved.row)) return undefined;
      return Object.freeze({ slot: saved.slot, size: saved.size, digest: saved.digest }); // DATA only; private row/origin stays hidden
    } finally { this.#busy = false; }
  }
  snapshot() { return Object.freeze({ reason: this.#reason, claimed: this.#slots.size, charged: this.#charged, cleanup: this.#cleanup }); }
}

/** SB-A/B: closed synthetic binding and memory-store continuation; no real I/O or runtime authority. */

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
interface StoredCheckpointEvidence { readonly checkpoint: Checkpoint; readonly receiptOrigin: object; readonly epoch: number }
type Failure = 'binding' | 'state' | 'clock' | 'construction' | 'discarded' | 'encoding' | 'store';
type Phase = 'Idle' | 'InFlight' | 'Stopped' | 'Closed';
type Slot = {
  status: 'empty' | 'bound' | 'claimed' | 'saved' | 'consumed' | 'acknowledged' | 'retired';
  checkpoint?: Checkpoint; binding?: BoundCheckpoint; claim?: PreparationClaim;
  disposition: 'not_started' | 'attempted_unverified' | 'saved_unacknowledged' | 'acknowledged';
  size: number; digest: string; file: string;
  cleanup?: ReturnType<FakeEvidenceStore['snapshot']>['cleanup'];
  storeReason?: StoreReason;
  consumeReason?: StoreReason;
  attempt?: Readonly<SaveAttempt>;
};
export interface BindingInput {
  timing: Timing; root: object; ops: EvidenceOps; now: () => number;
  limits: Pick<StoreCaps, 'fileBytes' | 'totalBytes' | 'attempts' | 'retries'>;
  cleanupMs: number;
  manifestCleanupMs: number;
  /** Fixed fault labels only, not injectable construction/ack continuations. */
  failAt?: 'owner' | 'recorder' | 'store';
}
const runClaims = new WeakSet<object>(); // Synthetic module only; never a runtime/session ledger.
// One owner per root: a fresh run key must not buy a fresh Store over the same run files.
const rootClaims = new WeakSet<object>();
const objectToken = (v: unknown): v is object => v !== null && typeof v === 'object';
const token = <T>() => Object.freeze({}) as T;

export class SyntheticStoreRecorderBinding {
  readonly run = token<BoundRun>();
  readonly recorder = token<BoundRecorder>();
  readonly store = token<BoundStore>();
  #runOrigin = Object.freeze({});
  #budgetOrigin = Object.freeze({});
  #phase: Phase = 'Idle';
  #reason: Failure | undefined;
  #stage: 'owner' | 'recorder' | 'store' | 'ready' = 'owner';
  #epoch = 0;
  #busy = false;
  #reading = false;
  #last = 0;
  #claims = 0;
  #slots: Slot[] = Array.from({ length: 6 }, () => ({ status: 'empty', disposition: 'not_started', size: 0, digest: '', file: '' }));
  #acks = 0;
  #fileLimit = 0;
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
      const root = input.root;
      if (rootClaims.has(root)) throw Error();
      rootClaims.add(root); // Never refunded; a non-object root throws here and is a construction failure.
      const t = input.timing;
      const pinned: Timing = { startedAt: t.startedAt, outerMs: t.outerMs, sessionDeadline: t.sessionDeadline,
        marginMs: t.marginMs, reservations: { ...t.reservations } };
      const plan = planTime(pinned);
      const cleanupMs = input.cleanupMs;
      const manifestCleanupMs = input.manifestCleanupMs;
      const deadlines = createFakeDeadlineTable(owner.#runOrigin, owner.#budgetOrigin,
        { timing: pinned, cleanupMs, manifestCleanupMs });
      if (!plan || !deadlines) throw Error();
      owner.#plan = plan;
      owner.#saveDeadline = deadlines.plan.evidence.deadline;
      owner.#last = plan.startedAt;
      owner.#now = input.now;
      const sharedClock = () => owner.#readClock();
      owner.#stage = 'recorder';
      if (input.failAt === 'recorder') throw Error();
      owner.#record = FakeFixedRecorder.create(pinned, sharedClock);
      if (!owner.#record) throw Error();
      owner.#stage = 'store';
      if (input.failAt === 'store') throw Error();
      const limits = { ...input.limits };
      owner.#fileLimit = limits.fileBytes;
      owner.#storage = FakeEvidenceStore.create(input.ops, root, owner.#runOrigin,
        { ...limits, deadlineTable: deadlines.table, budget: owner.#budgetOrigin }, sharedClock);
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
      if (slot.status !== 'empty' && slot.status !== 'acknowledged') slot.status = 'retired';
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
  /** Reads and validates only, also after a stop: a Store still owns its cleanup. Admission is #guard's. */
  #readClock() {
    if (this.#reading) { this.#fatal('clock'); throw Error('binding_clock'); }
    this.#reading = true;
    let at: number;
    try { at = this.#now!(); }
    catch { this.#fatal('clock'); throw Error('binding_clock'); }
    finally { this.#reading = false; }
    if (!Number.isSafeInteger(at) || at < this.#last || at < 0) {
      this.#fatal('clock'); throw Error('binding_clock');
    }
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
      const before = this.#record!.snapshot().state;
      const ok = action(this.#record!);
      if (this.#phase === 'Stopped' || this.#phase === 'Closed') return false;
      const result = this.#record!.snapshot();
      // A stray call after the test terminal is only a recorder diagnostic: queued evidence keeps its save path.
      if (result.reason === 'state' && (before === 'Draining' || before === 'Verifying')) return ok;
      // Misuse, a refused gate and a clock failure are fatal; cancellation, D_stop and window are observation-only.
      if (result.reason === 'clock' || result.reason === 'state' || result.reason === 'binding') return this.#fatal(result.reason);
      if (result.state === 'Closed') { this.#phase = 'Closed'; this.#retire(); }
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
    // Reserved closes directly; Observing becomes Draining while a healthy save may continue.
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
  /** The original SB-A fixed discard remains available instead of the SB-B persist continuation. */
  discard(claim: PreparationClaim) {
    if (!this.#enter('InFlight')) return false;
    try {
      const slot = this.#slots.find(s => s.claim === claim && s.status === 'claimed');
      if (!slot) return this.#fatal('binding');
      if (!this.#guard()) return false; // D_save closes without Store.cancel, as for any other operation
      this.#fatal('discarded');
      return true;
    } finally { this.#busy = false; }
  }
  /** Fixed bound continuation; no caller bytes, receipt, consumer callback or ack authority. */
  persist(claim: PreparationClaim) {
    if (!this.#enter('InFlight')) return false;
    let owned: Uint8Array | undefined;
    let receipt: FakeSaveReceipt | undefined;
    try {
      const slot = this.#slots.find(s => s.claim === claim && s.status === 'claimed');
      if (!slot) return this.#fatal('binding');
      slot.claim = undefined; // irreversible, including an expired guard or failed save
      if (!this.#guard()) return false;
      const checkpoint = slot.checkpoint!;
      if (!boundAckReady(this.#record!, checkpoint)) return this.#fatal('binding');
      // Frozen internally-issued scalar fields only; no user getter/JSON replacer can run.
      const text = `{"version":"wfb-checkpoint-1","sequence":${checkpoint.sequence},"trigger":"${checkpoint.trigger}","at":${checkpoint.at}}\n`;
      if (text.length > 160 || text.length > this.#fileLimit) return this.#fatal('encoding');
      owned = new TextEncoder().encode(text); // ASCII schema; bytes == characters, bounded before allocation
      slot.file = `report.partial.${String(checkpoint.sequence).padStart(4, '0')}.json`;
      slot.size = owned.byteLength;
      slot.digest = sha256(owned);
      const expected = { slot: slot.file, size: slot.size, digest: slot.digest };
      if (!this.#guard()) return false;
      slot.disposition = 'attempted_unverified';
      const outcome = this.#storage!.saveAttempt(this.#runOrigin, slot.file, owned);
      receipt = outcome.receipt;
      slot.attempt = outcome.attempt;
      slot.cleanup = outcome.attempt.cleanup;
      slot.storeReason = this.#storage!.snapshot().reason;
      if (!receipt) return this.#fatal('store');
      slot.disposition = 'saved_unacknowledged';
      if (!this.#terminal()) slot.status = 'saved';
      if (!this.#guard()) return false;
      if (!boundConsume(this.#storage!, this.#runOrigin, receipt, expected)) {
        slot.consumeReason = this.#storage!.snapshot().reason;
        return this.#fatal('store');
      }
      if (!this.#guard()) return false;
      const proof: StoredCheckpointEvidence = { checkpoint, receiptOrigin: receipt, epoch: this.#epoch };
      this.#storedEvidence = proof;
      slot.status = 'consumed';
      if (!this.#guard()) return false;
      if (this.#storedEvidence !== proof || proof.epoch !== this.#epoch || !boundAckReady(this.#record!, checkpoint))
        return this.#fatal('binding');
      // Linearization: private scalar/reference updates only. No clock, I/O, hook or public ack.
      boundAckCommit(this.#record!, checkpoint);
      this.#storedEvidence = undefined;
      slot.status = 'acknowledged';
      slot.disposition = 'acknowledged';
      slot.checkpoint = undefined;
      slot.binding = undefined;
      this.#acks++;
      this.#phase = 'Idle';
      return true;
    } catch { return this.#fatal('binding'); }
    finally {
      owned = undefined;
      receipt = undefined;
      this.#storedEvidence = undefined;
      this.#busy = false;
    }
  }
  snapshot() {
    const recorder = this.#record?.snapshot();
    return Object.freeze({ phase: this.#phase, reason: this.#reason, stage: this.#stage, epoch: this.#epoch,
      claims: this.#claims, evidenceIssued: this.#storedEvidence !== undefined,
      slots: Object.freeze(this.#slots.map(s => s.status)),
      recorder, store: this.#storage?.snapshot(), unacknowledged: recorder?.checkpoints.length ?? 0, acknowledgements: this.#acks,
      saves: Object.freeze(this.#slots.map(s => Object.freeze({ disposition: s.disposition,
        file: s.file, size: s.size, digest: s.digest, cleanup: s.cleanup, reason: s.storeReason, consumeReason: s.consumeReason,
        attempt: s.attempt }))),
      deadlines: this.#plan ? Object.freeze({ save: this.#saveDeadline, cleanup: this.#plan.stages[3], all: this.#plan.all }) : undefined });
  }
}
