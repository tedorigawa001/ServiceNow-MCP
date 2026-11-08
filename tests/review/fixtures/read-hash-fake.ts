/** B-only closed synthetic assembly. No filesystem, supply, runtime, or arbitrary dependency injection. */
import { createHash, type Hash } from 'node:crypto';

type Reason = 'none' | 'binding' | 'incomplete' | 'source_limit' | 'source_unavailable' | 'source_changed'
  | 'operation_invalid' | 'hash_unavailable' | 'content_mismatch' | 'cancelled' | 'deadline' | 'clock_unavailable';
type Phase = 'open' | 'before' | 'init' | 'read' | 'after' | 'final' | 'close' | 'accept' | 'done';
type Cleanup = 'not_attempted' | 'no_resource' | 'closed_confirmed' | 'close_unconfirmed';
interface File { readonly id: string; readonly bytes: readonly number[]; readonly digest: string }
interface Slot { readonly id: string; readonly hash: 'not_started' | 'pending' | 'hash_match' | 'incomplete' | 'content_mismatch'; readonly cleanup: Cleanup }
interface Scope { readonly file: File; readonly ordinal: number; readonly resource: object }
interface Candidate { readonly scope: Scope; readonly owner: object; readonly file: File; readonly ordinal: number }
const FIXED = Object.freeze({ model: 'wfb-read-hash-fake-B-1', synthetic: true, ready: false, authority: 'none',
  formalIssuance: 'closed', wholeRunAdmission: 'disabled', implementation: 'unknown', runtimeCoverage: 'unknown',
  nativeCost: 'unknown', entryRequirement: 'unknown', seedRequirement: 'unknown', coreInvocation: 'not_called',
  snapshotConnection: 'not_connected', rowAggregation: 'not_connected' } as const);
// 2 guards per admitted action, two for the first rejected action, two finish checkpoints.
const LIMIT = Object.freeze({ files: 32, maxFile: 1_048_576, expected: 8_388_608, received: 8_388_609,
  chunk: 65_536, read: 65_536, retry: 32, guards: 2 * (65_536 + 7 * 32) + 4, stop: 900, end: 1000 });
const scenarios = ['normal', 'one_byte', 'interrupt_once', 'interrupt_always', 'early_eof', 'extra_byte',
  'invalid_n', 'read_throw', 'read_failed', 'hash_init_throw', 'hash_update_throw', 'hash_partial_throw',
  'second_update_throw', 'hash_final_throw', 'digest_mismatch', 'cancel_during_read', 'deadline_during_read',
  'hash_throw_cancel', 'after_changed', 'before_size', 'close_failure', 'close_throw', 'close_late',
  'candidate_failure', 'record_failure', 'accept_cancel', 'accept_clock', 'foreign_scope', 'foreign_owner', 'file_copy',
  'candidate_copy', 'double_accept', 'update_cap', 'read_cap', 'received_cap', 'guard_cap',
  'open_none', 'open_owned_failure', 'clock_throw', 'capacity_files', 'long_short_reads', 'mismatch_close_failure',
  'capacity_8m_8', 'capacity_8m_32', 'capacity_8m_8_extra', 'capacity_8m_32_extra',
  'declared_total_over', 'declared_file_over', 'declared_files_over'] as const;
type Scenario = typeof scenarios[number];
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const HELLO = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
// Synthetic repeated-a vectors obtained independently; never calculated by the target hash adapter.
const MIB_A = '9bc1b2a288b26af7257a36277ae3816a7d4f16e89c1e7e77d0a5c48bad62b360';
const QUARTER_MIB_A = 'dd3dde87623d9a6b354c68c943d189c89c63652d945e7bbdf0986cae91a49521';
function files(scenario: Scenario): readonly File[] {
  if (['capacity_8m_8', 'capacity_8m_32', 'capacity_8m_8_extra', 'capacity_8m_32_extra',
    'declared_total_over', 'declared_file_over'].includes(scenario)) {
    const quarter = scenario === 'capacity_8m_32' || scenario === 'capacity_8m_32_extra';
    const payload = Object.freeze(Array<number>(quarter ? 262_144 : scenario === 'declared_file_over' ? 1_048_577 : 1_048_576).fill(97));
    const values: (readonly number[])[] = Array<readonly number[]>(scenario === 'declared_file_over' ? 1 : quarter ? 32 : 8).fill(payload);
    if (scenario === 'declared_total_over') values.push(Object.freeze([97]));
    return Object.freeze(values.map((bytes, i) => Object.freeze({ id: `F${String(i + 1).padStart(2, '0')}`,
      bytes, digest: quarter ? QUARTER_MIB_A : MIB_A })));
  }
  if (scenario === 'declared_files_over') return Object.freeze(Array.from({ length: 33 }, (_, i) =>
    Object.freeze({ id: `F${String(i + 1).padStart(2, '0')}`, bytes: Object.freeze([97, 98, 99]), digest: ABC })));
  const values = scenario === 'capacity_files' ? Array.from({ length: 32 }, () => [97, 98, 99])
    : scenario === 'long_short_reads' ? [Array<number>(1_048_576).fill(97)]
    // Mismatch controls change one payload byte; the pinned abc digest stays the independent expected value.
    : scenario === 'digest_mismatch' || scenario === 'mismatch_close_failure' ? [[97, 98, 100], [], [104, 101, 108, 108, 111]]
    : [[97, 98, 99], [], [104, 101, 108, 108, 111]];
  return Object.freeze(values.map((bytes, i) => Object.freeze({ id: `F${String(i + 1).padStart(2, '0')}`,
    bytes: Object.freeze(bytes), digest: bytes.length === 0 ? EMPTY : bytes.length === 5 ? HELLO : ABC })));
}
class Assembly {
  readonly #files: readonly File[];
  readonly #owner = Object.freeze({});
  readonly #scratch = new Uint8Array(LIMIT.chunk);
  readonly #slots: Slot[];
  readonly #counts = { open: 0, observe: 0, read: 0, retry: 0, received: 0, init: 0, update: 0,
    updateCompleted: 0, hashed: 0, final: 0, close: 0, cleanupReserved: 0, cleanupUnused: 0,
    updateReserved: 0, updateReservations: 0, updateReservationPeak: 0, updateReleased: 0,
    candidateCreated: 0, candidateDiscarded: 0, accepted: 0, guards: 0 };
  #scope: Scope | undefined;
  #candidate: Candidate | undefined;
  #issued: Candidate | undefined;
  #record: Slot | undefined;
  #hash: Hash | undefined;
  #hashState: 'not_started' | 'active' | 'finalized' | 'poisoned' | 'retired' = 'not_started';
  #phase: Phase = 'open'; #ordinal = 0; #position = 0; #prefix = 0;
  #retry = false; #interrupted = false; #receivedKnown = true; #readCompleted = 0;
  #first: Reason = 'none'; #stop: Reason = 'none'; #cleanup: 'none' | 'close_unconfirmed' = 'none';
  #cleanupTiming: 'not_checked' | 'within' | 'expired' | 'unknown' = 'not_checked';
  #now = 0; #last = 0; #clockBad = false; #cancelled = false; #inInterval = false; #intervalGuards = 0;
  #terminal: ReturnType<Assembly['snapshot']> | undefined;
  constructor(private readonly scenario: Scenario, admitted: boolean) {
    this.#files = files(scenario);
    this.#slots = this.#files.map(f => Object.freeze({ id: f.id, hash: 'not_started', cleanup: 'not_attempted' }));
    if (!admitted) this.fail('binding');
    if (this.#files.length > LIMIT.files || this.#files.some(f => f.bytes.length > LIMIT.maxFile)
      || this.#files.reduce((n, f) => n + f.bytes.length, 0) > LIMIT.expected) this.fail('source_limit');
  }
  private fail(reason: Exclude<Reason, 'none'>): void {
    const control = ['cancelled', 'deadline', 'clock_unavailable', 'source_limit'].includes(reason);
    if (this.#first === 'none' && !(control && this.#counts.accepted === this.#files.length)) this.#first = reason;
    if (control && this.#stop === 'none') this.#stop = reason;
  }
  private guard(cleanup = false): boolean {
    if (this.#inInterval) this.#intervalGuards++;
    const cap = this.scenario === 'guard_cap' ? 3 : LIMIT.guards;
    if (this.#counts.guards >= cap) { if (cleanup) this.#cleanupTiming = 'unknown'; this.fail('source_limit'); return false; }
    this.#counts.guards++;
    if (this.scenario === 'clock_throw') this.#clockBad = true;
    if (this.#clockBad || !Number.isSafeInteger(this.#now) || this.#now < this.#last) {
      this.#clockBad = true; if (cleanup) this.#cleanupTiming = 'unknown'; this.fail('clock_unavailable'); return false;
    }
    this.#last = this.#now;
    if (cleanup) {
      if (this.#cleanupTiming !== 'unknown') this.#cleanupTiming = this.#now >= LIMIT.end ? 'expired'
        : this.#cleanupTiming === 'expired' ? 'expired' : 'within';
      if (this.#now >= LIMIT.end) { this.fail('deadline'); return false; }
      return true;
    }
    if (this.#cancelled) { this.fail('cancelled'); return false; }
    if (this.#now >= LIMIT.stop) { this.fail('deadline'); return false; }
    return true;
  }
  cancel(): void { if (!this.#terminal) { this.#cancelled = true; this.fail('cancelled'); } }
  advanceTo(value: unknown): void {
    if (this.#terminal) return;
    if (typeof value !== 'number') this.#clockBad = true; else this.#now = value;
  }
  private mismatch(): void {
    const slot = this.#slots[this.#ordinal];
    this.#slots[this.#ordinal] = Object.freeze({ ...slot, hash: 'content_mismatch' }); this.fail('content_mismatch');
  }
  private open(): void {
    this.#counts.cleanupReserved++; this.#counts.open++;
    if (this.scenario === 'open_none') {
      this.#counts.cleanupUnused++; this.#slots[this.#ordinal] = Object.freeze({ ...this.#slots[this.#ordinal], hash: 'incomplete', cleanup: 'no_resource' });
      this.fail('source_unavailable'); return;
    }
    const file = this.#files[this.#ordinal];
    this.#scope = Object.freeze({ file, ordinal: this.#ordinal, resource: Object.freeze({}) });
    this.#position = 0; this.#prefix = 0; this.#hashState = 'not_started'; this.#retry = false;
    this.#slots[this.#ordinal] = Object.freeze({ ...this.#slots[this.#ordinal], hash: 'pending' });
    if (this.scenario === 'open_owned_failure') this.fail('source_unavailable'); else this.#phase = 'before';
  }
  private read(): void {
    const scope = this.#scope!;
    const remaining = scope.file.bytes.length - this.#position;
    const requested = remaining ? Math.min(remaining, LIMIT.chunk) : 1;
    const readCap = this.scenario === 'read_cap' ? 1 : LIMIT.read;
    const receivedCap = this.scenario === 'received_cap' ? 2 : LIMIT.received;
    const updateCap = this.scenario === 'update_cap' ? 0 : LIMIT.read;
    if (this.#counts.read >= readCap || (this.#retry && this.#counts.retry >= LIMIT.retry)
      || requested > receivedCap - this.#counts.received || (remaining > 0 && this.#counts.update >= updateCap)
      || (remaining > 0 && (!Number.isSafeInteger(this.#position + requested) || this.#position + requested > scope.file.bytes.length))) {
      this.fail('source_limit'); return;
    }
    if (remaining) { this.#counts.updateReserved++; this.#counts.updateReservations++;
      this.#counts.updateReservationPeak = Math.max(this.#counts.updateReservationPeak, this.#counts.updateReserved); }
    if (this.#retry) this.#counts.retry++;
    this.#counts.read++;
    this.#inInterval = true;
    let updated = false;
    try {
      if (this.scenario === 'read_throw') { this.#receivedKnown = false; throw Error('read'); }
      if (this.scenario === 'read_failed') { this.#receivedKnown = false; this.fail('source_unavailable'); return; }
      if (this.scenario === 'interrupt_always' || (this.scenario === 'interrupt_once' && !this.#interrupted)) {
        this.#interrupted = true; this.#retry = true; return;
      }
      this.#retry = false;
      if (this.scenario === 'early_eof') { this.mismatch(); return; }
      if (this.scenario === 'invalid_n') { this.#receivedKnown = false; this.fail('operation_invalid'); return; }
      if (!remaining) {
        if (this.scenario === 'extra_byte' || (['capacity_8m_8_extra', 'capacity_8m_32_extra'].includes(this.scenario)
          && this.#ordinal === this.#files.length - 1)) { this.#scratch[0] = 120; this.#counts.received++; this.mismatch(); }
        else this.#phase = 'after';
        return;
      }
      const n = ['one_byte', 'second_update_throw', 'long_short_reads'].includes(this.scenario) ? 1 : requested;
      // Fixed reader borrows the same owned scratch. Poison the unused tail to expose over-hashing.
      this.#scratch.fill(0xa5);
      for (let i = 0; i < n; i++) this.#scratch[i] = scope.file.bytes[this.#position + i];
      this.#counts.received += n;
      if (this.scenario === 'cancel_during_read' || this.scenario === 'hash_throw_cancel') this.#cancelled = true;
      if (this.scenario === 'deadline_during_read') this.#now = LIMIT.stop;
      this.#counts.update++;
      updated = true;
      try {
        if (this.scenario === 'hash_update_throw' || this.scenario === 'hash_throw_cancel'
          || (this.scenario === 'second_update_throw' && this.#counts.update === 2)) throw Error('hash');
        this.#hash!.update(this.#scratch.subarray(0, n));
        if (this.scenario === 'hash_partial_throw') throw Error('partial');
        this.#counts.updateCompleted++; this.#counts.hashed += n; this.#prefix += n; this.#position += n;
      } catch { this.#hashState = 'poisoned'; this.fail('hash_unavailable'); }
    } catch { this.fail('source_unavailable'); }
    finally {
      if (remaining) { this.#counts.updateReserved--; if (!updated) this.#counts.updateReleased++; }
      this.#inInterval = false;
    }
  }
  private close(): void {
    if (!this.#scope) return;
    this.guard(true); this.#counts.close++;
    let confirmed = false;
    try {
      if (this.scenario === 'close_late') this.#now = LIMIT.end;
      if (this.scenario === 'close_throw') throw Error('synthetic_close');
      confirmed = !['close_failure', 'mismatch_close_failure'].includes(this.scenario);
    } catch { /* the fixed one-attempt close remains unconfirmed */ }
    if (!confirmed) { this.#cleanup = 'close_unconfirmed'; this.fail('source_unavailable'); }
    this.guard(true);
    const slot = this.#slots[this.#ordinal];
    this.#slots[this.#ordinal] = Object.freeze({ ...slot, cleanup: confirmed ? 'closed_confirmed' : 'close_unconfirmed' });
    if (this.#phase === 'close' && confirmed && this.#first === 'none') this.#phase = 'accept';
    // Resource custody ends after exactly one close attempt; unconfirmed outcome remains diagnostic.
    this.#hash = undefined;
  }
  private candidateBound(): boolean {
    const candidate = this.#candidate, scope = this.#scope;
    return !!candidate && candidate === this.#issued && !!scope && candidate.scope === scope && candidate.owner === this.#owner
      && candidate.file === scope.file && candidate.ordinal === this.#ordinal
      && this.#slots[this.#ordinal].hash === 'pending' && this.#slots[this.#ordinal].cleanup === 'closed_confirmed';
  }
  private prepareAcceptance(): void {
    if (!this.candidateBound()) { this.fail('binding'); return; }
    if (this.scenario === 'record_failure') throw Error('synthetic_record');
    this.#record = Object.freeze({ id: this.#scope!.file.id, hash: 'hash_match', cleanup: 'closed_confirmed' });
    if (this.scenario === 'accept_cancel') this.#cancelled = true;
    if (this.scenario === 'accept_clock') this.#clockBad = true;
  }
  private discard(): void {
    if (this.#candidate) this.#counts.candidateDiscarded++;
    this.#candidate = undefined; this.#issued = undefined; this.#record = undefined; this.#hash = undefined; this.#scope = undefined;
    this.#scratch.fill(0); this.#hashState = this.#hashState === 'poisoned' ? 'poisoned' : 'retired';
    if (this.#ordinal < this.#slots.length) {
      const slot = this.#slots[this.#ordinal];
      if (slot.hash === 'pending') this.#slots[this.#ordinal] = Object.freeze({ ...slot, hash: 'incomplete' });
    }
  }
  step() {
    if (this.#terminal) return this.inspect();
    // Misuse after every commit stays a contract violation even when a late control stop was recorded.
    if (this.#phase === 'done') { this.fail('binding'); return this.inspect(); }
    if (this.#first !== 'none' || this.#stop !== 'none') return this.inspect();
    if (this.#phase === 'close') { this.close(); return this.inspect(); }
    if (!this.guard()) return this.inspect();
    const phase = this.#phase;
    try { switch (phase) {
      case 'open': this.open(); break;
      case 'before': this.#counts.observe++; if (this.scenario === 'before_size') this.mismatch(); else this.#phase = 'init'; break;
      case 'init':
        this.#counts.init++;
        if (this.scenario === 'hash_init_throw') throw Error('synthetic_init');
        this.#hash = createHash('sha256'); this.#hashState = 'active'; this.#phase = 'read';
        break;
      case 'read': this.read(); break;
      case 'after':
        this.#counts.observe++;
        if (this.scenario === 'after_changed') this.fail('source_changed');
        else { this.#readCompleted++; this.#phase = 'final'; }
        break;
      case 'final': {
        if (this.#prefix !== this.#scope!.file.bytes.length || this.#hashState !== 'active') { this.fail('binding'); break; }
        this.#counts.final++;
        if (this.scenario === 'hash_final_throw') throw Error('synthetic_final');
        const digest = this.#hash!.digest('hex'); this.#hashState = 'finalized';
        if (digest !== this.#scope!.file.digest) { this.mismatch(); break; }
        if (this.scenario === 'candidate_failure') throw Error('synthetic_candidate');
        const scope = this.#scope!;
        this.#candidate = Object.freeze({ scope: this.scenario === 'foreign_scope' ? Object.freeze({ ...scope }) : scope,
          owner: this.scenario === 'foreign_owner' ? Object.freeze({}) : this.#owner,
          file: this.scenario === 'file_copy' ? Object.freeze({ ...scope.file }) : scope.file, ordinal: this.#ordinal });
        this.#issued = this.#candidate;
        if (this.scenario === 'candidate_copy') this.#candidate = Object.freeze({ ...this.#candidate });
        this.#counts.candidateCreated++; this.#phase = 'close'; break;
      }
      case 'accept': this.prepareAcceptance(); break;
    } } catch {
      if ((phase === 'init' || phase === 'final') && this.#hashState !== 'finalized') { this.#hashState = 'poisoned'; this.fail('hash_unavailable'); }
      else this.fail('source_unavailable');
    }
    const post = this.guard();
    if (phase === 'accept' && post && this.#first === 'none' && this.#record && this.candidateBound()) {
      // One private slot replacement is the commit point. Everything fallible was prepared before post.
      this.#slots[this.#ordinal] = this.#record;
      this.#candidate = undefined; this.#issued = undefined; this.#record = undefined; this.#scope = undefined; this.#hash = undefined;
      this.#counts.accepted++; this.#ordinal++; this.#hashState = 'retired';
      this.#phase = this.#ordinal === this.#files.length ? 'done' : 'open';
      if (this.scenario === 'double_accept') this.prepareAcceptance();
    }
    return this.inspect();
  }
  run() {
    // Fixed finite scheduler; cannot spin after a sticky stop or exhaust the clock pool via repeated calls.
    for (let i = 0; i < LIMIT.read + 7 * LIMIT.files + 1; i++) {
      if (this.#phase === 'done' || this.#first !== 'none' || this.#stop !== 'none' || this.#terminal) break;
      this.step();
    }
    return this.finish();
  }
  private snapshot(terminal = false) {
    return Object.freeze({ ...FIXED, phase: this.#phase, firstReason: this.#first, stopReason: this.#stop,
      cleanupReason: this.#cleanup, cleanupTiming: this.#cleanupTiming, receivedState: this.#receivedKnown ? 'observed' : 'unavailable',
      position: this.#position, hashedPrefixBytes: this.#prefix, hashState: this.#hashState, readCompletedFiles: this.#readCompleted,
      terminalState: terminal ? 'closed' : 'open', terminalDisposition: terminal
        ? this.#first === 'none' && this.#stop === 'none' && this.#cleanup === 'none' ? 'observed' : 'stopped' : 'pending',
      intervalGuards: this.#intervalGuards,
      retainedScope: !!this.#scope, retainedCandidate: !!this.#candidate, retainedIssued: !!this.#issued, retainedRecord: !!this.#record,
      counts: Object.freeze({ ...this.#counts }), slots: Object.freeze([...this.#slots]),
      rows: Object.freeze(Array.from({ length: 12 }, (_, i) => Object.freeze({ id: `SC${i + 1}`, state: 'not_aggregated' }))),
      limits: LIMIT });
  }
  inspect() { return this.#terminal ?? this.snapshot(); }
  finish() {
    if (this.#terminal) return this.#terminal;
    this.guard();
    if (this.#counts.accepted < this.#files.length && this.#first === 'none') this.fail('incomplete');
    if (this.#scope && this.#counts.close < this.#counts.open - this.#counts.cleanupUnused) this.close();
    this.discard(); this.guard(true);
    this.#terminal = this.snapshot(true);
    return this.#terminal;
  }
}
/** Only fixed string selectors, never callbacks, files, buffers, snapshots or live resources. */
export function createReadHashFake(...args: readonly unknown[]) {
  const input = args.length === 0 ? 'normal' : args[0];
  const admitted = args.length <= 1 && typeof input === 'string' && (scenarios as readonly string[]).includes(input);
  const assembly = new Assembly(admitted ? input as Scenario : 'normal', admitted);
  return Object.freeze({ step: () => assembly.step(), run: () => assembly.run(), finish: () => assembly.finish(),
    inspect: () => assembly.inspect(), cancel: () => assembly.cancel(), advanceTo: (value: unknown) => assembly.advanceTo(value) });
}
