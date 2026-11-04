/** Synthetic boundary only: no filesystem, process, transport, or runtime registration. */
import { createHash } from 'node:crypto';

export const RUN_FILES = Object.freeze([
  'conditions.json', 'runner.mjs', 'load-setup.ts', 'summary.mjs',
  ...Array.from({ length: 6 }, (_, i) => `report.partial.${String(i + 1).padStart(4, '0')}.json`),
  'report.final.json', 'termination.json', 'analysis.json', 'manifest.json',
]);
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
declare const receiptBrand: unique symbol;
export interface FakeSaveReceipt { readonly [receiptBrand]: true }
interface Saved { slot: string; size: number; digest: string }
const natural = (n: number) => Number.isSafeInteger(n) && n >= 0;
const positive = (n: number) => natural(n) && n > 0;
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
// Intrinsic accessor: a subclass or a Proxy cannot misreport the size of the bytes it holds.
const intrinsicByteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;
const realLength = (bytes: Uint8Array) => intrinsicByteLength.call(bytes) as number;

export class FakeEvidenceStore {
  #reason: StoreReason | undefined;
  #busy = false;
  #last = 0;
  #slots = new Set<string>();
  #receipts = new WeakMap<object, Saved>();
  #consumed = new WeakSet<object>();
  #charged = 0;
  #cleanup: 'not_started' | 'confirmed' | 'unconfirmed' = 'not_started';
  private constructor(private readonly ops: EvidenceOps, private readonly root: object,
    private readonly run: object, private readonly caps: Readonly<StoreCaps>, private readonly now: () => number) {}
  static create(ops: EvidenceOps, root: object, run: object, caps: StoreCaps, now: () => number) {
    // Structural ceilings for this small fake, not approved production limits.
    if (!root || typeof root !== 'object' || !run || typeof run !== 'object'
      || !positive(caps.fileBytes) || caps.fileBytes > 65_536 || !positive(caps.totalBytes)
      || caps.totalBytes > 1_048_576 || caps.totalBytes < caps.fileBytes
      || !positive(caps.attempts) || caps.attempts > 4096 || !natural(caps.retries) || caps.retries > 16
      || !positive(caps.deadline) || !positive(caps.cleanupDeadline) || caps.cleanupDeadline <= caps.deadline) return undefined;
    return new FakeEvidenceStore(ops, root, run, Object.freeze({ ...caps }), now);
  }
  #fail(reason: StoreReason) { this.#reason ??= reason; return false; }
  #clock(deadline: number) {
    let at: number;
    try { at = this.now(); } catch { return this.#fail('clock'); }
    if (!natural(at) || at < this.#last) return this.#fail('clock');
    this.#last = at;
    return at < deadline || this.#fail('deadline');
  }
  #guard() {
    if (this.#reason || !this.#clock(this.caps.deadline) || this.#reason) return false;
    try { if (this.ops.identity() !== this.root) return this.#fail('binding'); }
    catch { return this.#fail('binding'); }
    return !this.#reason && this.#clock(this.caps.deadline) && !this.#reason;
  }
  /** Confirmed only when the driver reports release before the finite cleanup reserve ends. */
  #closeAttempt(handle: object) {
    this.#cleanup = 'unconfirmed';
    const ok = this.ops.closeOnce(handle);
    if (ok && this.#clock(this.caps.cleanupDeadline)) this.#cleanup = 'confirmed';
    return ok;
  }
  #step(action: () => boolean, reason: StoreReason) {
    if (!this.#guard()) return false;
    try { if (!action()) return this.#fail(reason); }
    catch { return this.#fail(reason); }
    return this.#guard();
  }
  cancel() { this.#fail('cancelled'); }
  save(run: object, slot: string, bytes: Uint8Array): FakeSaveReceipt | undefined {
    if (this.#busy) { this.#fail('binding'); return undefined; }
    if (this.#reason) return undefined;
    this.#busy = true;
    let handle: object | undefined;
    let closed = false;
    this.#cleanup = 'not_started';
    try {
      if (run !== this.run || !RUN_FILES.includes(slot) || this.#slots.has(slot)) { this.#fail('binding'); return undefined; }
      this.#slots.add(slot); // spent even when validation or create fails
      if (!(bytes instanceof Uint8Array)) { this.#fail('limit'); return undefined; }
      const size = realLength(bytes);
      if (size > this.caps.fileBytes || size > this.caps.totalBytes - this.#charged) { this.#fail('limit'); return undefined; }
      this.#charged += size; // failed/partial writes never refund the reservation
      // No callback runs between the size check and this internal-slot copy.
      const owned = new Uint8Array(bytes);
      const digest = sha256(owned);
      if (!this.#step(() => { handle = this.ops.createExclusive(slot); return !!handle; }, 'create')) return undefined;
      let offset = 0, attempts = 0, retries = 0;
      while (offset < owned.byteLength) {
        if (attempts === this.caps.attempts) { this.#fail('limit'); return undefined; }
        attempts++;
        let outcome: WriteResult | undefined;
        if (!this.#step(() => { outcome = this.ops.writeOnce(handle!, offset, owned.slice(offset)); return true; }, 'write')) return undefined;
        if (outcome?.kind === 'eintr') {
          if (retries === this.caps.retries) { this.#fail('retry'); return undefined; }
          retries++;
        } else if (outcome?.kind === 'written' && positive(outcome.bytes) && outcome.bytes <= owned.byteLength - offset) {
          offset += outcome.bytes;
        } else { this.#fail('write'); return undefined; }
      }
      if (!this.#step(() => this.ops.flushOnce(handle!), 'flush')) return undefined;
      if (!this.#step(() => {
        closed = true; // one attempt even if it throws or cannot confirm release
        return this.#closeAttempt(handle!);
      }, 'close')) return undefined;
      let reread: Uint8Array | undefined;
      if (!this.#step(() => { reread = this.ops.readBack(handle!, slot, this.caps.fileBytes); return reread instanceof Uint8Array; }, 'reread')) return undefined;
      if (realLength(reread!) !== owned.byteLength) { this.#fail('reread'); return undefined; }
      if (sha256(reread!) !== digest) { this.#fail('digest'); return undefined; }
      if (!this.#guard()) return undefined;
      const receipt = Object.freeze({}) as FakeSaveReceipt;
      this.#receipts.set(receipt, Object.freeze({ slot, size: owned.byteLength, digest }));
      return receipt;
    } catch {
      this.#fail('binding'); // never reflect unexpected input/allocation exceptions
      return undefined;
    } finally {
      if (handle && !closed) {
        closed = true;
        this.#cleanup = 'unconfirmed';
        // Cleanup has a separate finite reserve and never resets the original failure.
        if (this.#clock(this.caps.cleanupDeadline)) {
          try { this.#closeAttempt(handle); } catch { /* fixed diagnostic only */ }
        }
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
      if (!this.#guard() || !this.#guard()) return undefined;
      return Object.freeze({ ...saved }); // DATA only, not another receipt
    } finally { this.#busy = false; }
  }
  snapshot() { return Object.freeze({ reason: this.#reason, claimed: this.#slots.size, charged: this.#charged, cleanup: this.#cleanup }); }
}
