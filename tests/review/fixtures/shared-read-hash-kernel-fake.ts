/** Synthetic B declaration/source separation; C execution and private supply remain closed. */
import { createHash, type Hash } from 'node:crypto';

type Reason = 'none' | 'binding' | 'incomplete' | 'source_limit' | 'source_unavailable' | 'source_changed'
  | 'operation_invalid' | 'hash_unavailable' | 'content_mismatch' | 'cancelled' | 'deadline' | 'clock_unavailable';
type Phase = 'open' | 'before' | 'init' | 'read' | 'after' | 'final' | 'close' | 'accept' | 'done';
type Cleanup = 'not_attempted' | 'no_resource' | 'closed_confirmed' | 'close_unconfirmed';
interface SeedFile { readonly id: string; readonly bytes: readonly number[]; readonly digest: string }
interface File { readonly id: string; readonly declaredBytes: number; readonly digest: string; readonly origin: object }
interface Slot { readonly id: string; readonly hash: 'not_started' | 'pending' | 'hash_match' | 'incomplete' | 'content_mismatch'; readonly cleanup: Cleanup }
interface Scope { readonly file: File; readonly ordinal: number; readonly resource: object }
interface Candidate { readonly scope: Scope; readonly owner: object; readonly file: File; readonly ordinal: number }
interface Metadata { readonly identity: object; readonly kind: 'regular'; readonly size: number; readonly stamp: number }
type StopSignal = 'none' | 'cancel' | 'advance_to_stop' | 'advance_to_end';
type ReadFault = 'none' | 'throw' | 'failed' | 'interrupt_once' | 'interrupt_always' | 'bad_n' | 'zero_n' | 'fraction_n' | 'bad_variant';
interface ReadResult { readonly kind: 'bytes' | 'eof' | 'interrupted' | 'failed' | 'invalid'; readonly n?: number;
  readonly stopSignal: StopSignal }
interface SourceRecord { readonly origin: object; readonly bytes: readonly number[]; readonly initialLength: number;
  readonly events: readonly SourceEvent[]; readonly maxReturn: number }
interface SourceEvent { readonly at: 'before' | 'read' | 'after'; readonly offset: number; readonly length: number;
  readonly stamp: number; readonly relative: boolean }
interface SourceFaults { readonly read: ReadFault; readonly readSignal: StopSignal;
  readonly open: 'normal' | 'none' | 'owned_failure'; readonly close: 'normal' | 'failed' | 'throw'; readonly closeSignal: StopSignal }
interface LiveSource { readonly record: SourceRecord; visible: number; stamp: number; consumed: number; closed: boolean }
function validRecord(record: SourceRecord): boolean {
  return Number.isSafeInteger(record.initialLength) && record.initialLength >= 0 && record.initialLength <= record.bytes.length
    && record.bytes.length <= 1_048_577 && Number.isSafeInteger(record.maxReturn) && record.maxReturn >= 1 && record.maxReturn <= 65_536
    && record.events.length <= 4 && record.events.every(e => Object.keys(e).sort().join(',') === 'at,length,offset,relative,stamp'
      && ['before', 'read', 'after'].includes(e.at) && Number.isSafeInteger(e.offset) && e.offset >= 0 && e.offset <= record.bytes.length
      && (e.at === 'read' || e.offset === 0) && typeof e.relative === 'boolean' && Number.isSafeInteger(e.length)
      && (e.relative ? e.length >= -1 && e.length <= 1 : e.length >= 0 && e.length <= record.bytes.length)
      && Number.isSafeInteger(e.stamp) && e.stamp >= 0 && e.stamp <= 1);
}

// No declaration, expected digest, budget, hash or clock reference is retained by this producer.
class SourceOps {
  readonly #records: ReadonlyMap<object, SourceRecord>;
  readonly #handles = new WeakMap<object, LiveSource>();
  readonly #opened = new WeakSet<object>();
  #interrupted = false;
  constructor(records: ReadonlyMap<object, SourceRecord>, private readonly faults: SourceFaults) { this.#records = records; }
  openOnce(origin: object) {
    const record = this.#records.get(origin);
    if (!record || record.origin !== origin || this.#opened.has(origin) || !validRecord(record)) {
      return { kind: 'none' as const, reason: 'binding' as const };
    }
    this.#opened.add(origin);
    if (this.faults.open === 'none') return { kind: 'none' as const, reason: 'source_unavailable' as const };
    const handle = Object.freeze({});
    this.#handles.set(handle, { record, visible: record.initialLength, stamp: 0, consumed: 0, closed: false });
    return { kind: 'owned' as const, handle, ok: this.faults.open !== 'owned_failure' };
  }
  private live(handle: object): LiveSource {
    const live = this.#handles.get(handle);
    if (!live || live.closed) throw Error('source_binding');
    return live;
  }
  private apply(live: LiveSource, at: SourceEvent['at'], offset = 0): void {
    for (let i = 0; i < live.record.events.length; i++) {
      const event = live.record.events[i];
      if (event.at === at && event.offset === offset && !(live.consumed & (1 << i))) {
        live.consumed |= 1 << i;
        const next = event.relative ? live.visible + event.length : event.length;
        if (next < 0 || next > live.record.bytes.length) throw Error('source_event');
        live.visible = next; live.stamp = event.stamp;
      }
    }
  }
  observeOnce(handle: object, at: 'before' | 'after'): Metadata {
    const live = this.live(handle); this.apply(live, at);
    return Object.freeze({ identity: live.record.origin, kind: 'regular', size: live.visible, stamp: live.stamp });
  }
  readOnce(handle: object, offset: number, requested: number, scratch: Uint8Array): ReadResult {
    const live = this.live(handle);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(requested)
      || requested < 1 || requested > scratch.length || requested > 65_536) throw Error('source_request');
    this.apply(live, 'read', offset);
    const stopSignal = this.faults.readSignal;
    switch (this.faults.read) {
      case 'throw': throw Error('read');
      case 'failed': return { kind: 'failed', stopSignal };
      case 'interrupt_always': return { kind: 'interrupted', stopSignal };
      case 'interrupt_once':
        if (!this.#interrupted) { this.#interrupted = true; return { kind: 'interrupted', stopSignal }; } break;
      case 'bad_n': return { kind: 'bytes', n: requested + 1, stopSignal };
      case 'zero_n': return { kind: 'bytes', n: 0, stopSignal };
      case 'fraction_n': return { kind: 'bytes', n: 0.5, stopSignal };
      case 'bad_variant': return { kind: 'invalid', stopSignal };
    }
    if (offset >= live.visible) return { kind: 'eof', stopSignal };
    const n = Math.min(requested, live.visible - offset, live.record.maxReturn);
    scratch.fill(0xa5);
    for (let i = 0; i < n; i++) scratch[i] = live.record.bytes[offset + i];
    return { kind: 'bytes', n, stopSignal };
  }
  closeOnce(handle: object) {
    this.live(handle).closed = true;
    if (this.faults.close === 'throw') throw Error('close');
    return { confirmed: this.faults.close !== 'failed', stopSignal: this.faults.closeSignal };
  }
}
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
  'declared_total_over', 'declared_file_over', 'declared_files_over', 'da_shrink_two', 'da_grow_probe', 'da_interrupt_shrink',
  'da_declared_two', 'da_declared_four', 'da_actual_two', 'da_actual_four', 'da_empty', 'da_empty_grow',
  'da_zero_n', 'da_fraction_n', 'da_bad_variant', 'da_source_probe', 'da_failed_cancel', 'da_bad_n_deadline',
  'da_skip_offset_event', 'da_after_size'] as const;
type Scenario = typeof scenarios[number];
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const HELLO = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
// Synthetic repeated-a vectors obtained independently; never calculated by the target hash adapter.
const MIB_A = '9bc1b2a288b26af7257a36277ae3816a7d4f16e89c1e7e77d0a5c48bad62b360';
const QUARTER_MIB_A = 'dd3dde87623d9a6b354c68c943d189c89c63652d945e7bbdf0986cae91a49521';
function files(scenario: Scenario): readonly SeedFile[] {
  if (scenario === 'da_empty' || scenario === 'da_empty_grow') return Object.freeze([
    Object.freeze({ id: 'F01', bytes: Object.freeze([]), digest: EMPTY })]);
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
function sourceRecipe(scenario: Scenario, file: File, seed: SeedFile, ordinal: number, last: number): SourceRecord {
  const length = seed.bytes.length;
  const grow = scenario === 'extra_byte' || scenario === 'da_grow_probe' || scenario === 'da_empty_grow'
    || (['capacity_8m_8_extra', 'capacity_8m_32_extra'].includes(scenario) && ordinal === last);
  const beforeExtra = scenario === 'before_size' || (scenario === 'da_actual_four' && ordinal === 0);
  const events: SourceEvent[] = [];
  if (grow) events.push({ at: 'read', offset: length, length: length + 1, stamp: 0, relative: false });
  if (scenario === 'early_eof' || (scenario === 'da_shrink_two' && ordinal === 0)) {
    events.push({ at: 'read', offset: 0, length: scenario === 'early_eof' ? 0 : 2, stamp: 0, relative: false });
  }
  if (scenario === 'da_interrupt_shrink' && ordinal === 0) events.push({ at: 'read', offset: 0, length: -1, stamp: 0, relative: true });
  if (scenario === 'after_changed') events.push({ at: 'after', offset: 0, length, stamp: 1, relative: false });
  // A read event at an offset the declared chunk skips must never fire.
  if (scenario === 'da_skip_offset_event' && ordinal === 0) events.push({ at: 'read', offset: 2, length: 1, stamp: 0, relative: false });
  if (scenario === 'da_after_size' && ordinal === 0) events.push({ at: 'after', offset: 0, length: length - 1, stamp: 0, relative: false });
  return Object.freeze({ origin: file.origin, bytes: grow || beforeExtra ? Object.freeze([...seed.bytes, 120]) : seed.bytes,
    initialLength: scenario === 'da_actual_two' && ordinal === 0 ? 2 : length + Number(beforeExtra), events: Object.freeze(events.map(e => Object.freeze(e))),
    maxReturn: ['one_byte', 'second_update_throw', 'long_short_reads'].includes(scenario) ? 1 : LIMIT.chunk });
}
function sourceFaults(scenario: Scenario): SourceFaults {
  const read: ReadFault = scenario === 'read_throw' ? 'throw' : scenario === 'read_failed' || scenario === 'da_failed_cancel' ? 'failed'
    : scenario === 'invalid_n' || scenario === 'da_bad_n_deadline' ? 'bad_n' : scenario === 'da_zero_n' ? 'zero_n' : scenario === 'da_fraction_n' ? 'fraction_n'
    : scenario === 'da_bad_variant' ? 'bad_variant' : scenario === 'da_interrupt_shrink' ? 'interrupt_once'
    : scenario === 'interrupt_once' || scenario === 'interrupt_always' ? scenario : 'none';
  return Object.freeze({ read, readSignal: ['cancel_during_read', 'hash_throw_cancel', 'da_failed_cancel'].includes(scenario) ? 'cancel'
    : scenario === 'deadline_during_read' || scenario === 'da_bad_n_deadline' ? 'advance_to_stop' : 'none',
  open: scenario === 'open_none' ? 'none' : scenario === 'open_owned_failure' ? 'owned_failure' : 'normal',
  close: scenario === 'close_throw' ? 'throw' : ['close_failure', 'mismatch_close_failure'].includes(scenario) ? 'failed' : 'normal',
  closeSignal: scenario === 'close_late' ? 'advance_to_end' : 'none' });
}
// Fixed diagnostic selector only. It returns finite counts/booleans, never a handle, bytes or registration authority.
function sourceProbe() {
  const grid: { actual: number; offset: number; requested: number; kind: ReadResult['kind']; n: number }[] = [];
  for (let actual = 0; actual <= 4; actual++) for (let offset = 0; offset <= 4; offset++) {
    for (let requested = 1; requested <= 3; requested++) {
      const file: File = Object.freeze({ id: 'probe', origin: Object.freeze({}), declaredBytes: 99, digest: '' });
      const record: SourceRecord = Object.freeze({ origin: file.origin, bytes: Object.freeze([97, 97, 97, 97]),
        initialLength: actual, events: Object.freeze([]), maxReturn: 3 });
      const source = new SourceOps(new Map([[file.origin, record]]), sourceFaults('normal'));
      const opened = source.openOnce(file.origin);
      if (opened.kind !== 'owned') throw Error('probe_open');
      const result = source.readOnce(opened.handle, offset, requested, new Uint8Array(4));
      grid.push(Object.freeze({ actual, offset, requested, kind: result.kind, n: result.n ?? 0 }));
      source.closeOnce(opened.handle);
    }
  }
  const file: File = Object.freeze({ id: 'probe', origin: Object.freeze({}), declaredBytes: 3, digest: '' });
  const record: SourceRecord = Object.freeze({ origin: file.origin, bytes: Object.freeze([97, 98, 99]),
    initialLength: 3, events: Object.freeze([]), maxReturn: 3 });
  const source = new SourceOps(new Map([[file.origin, record]]), sourceFaults('normal'));
  function rejected(action: () => unknown): boolean { try { action(); return false; } catch { return true; } }
  const copiedOriginRejected = source.openOnce(Object.freeze({ ...file.origin })).kind === 'none';
  const foreignHandleRejected = rejected(() => source.observeOnce(Object.freeze({}), 'before'));
  const opened = source.openOnce(file.origin);
  if (opened.kind !== 'owned') throw Error('probe_open');
  const duplicateOpenRejected = source.openOnce(file.origin).kind === 'none';
  source.closeOnce(opened.handle);
  const duplicateCloseRejected = rejected(() => source.closeOnce(opened.handle));
  const closedReadRejected = rejected(() => source.readOnce(opened.handle, 0, 1, new Uint8Array(4)));
  const base = Object.freeze({ at: 'read' as const, offset: 0, length: 2, stamp: 0, relative: false });
  const invalid = [{ ...base, at: 'unknown' }, { ...base, offset: -1 }, { ...base, length: 4 },
    { ...base, length: 0.5 }, { ...base, stamp: 2 }, { ...base, extra: 1 }, { ...base, relative: 'false' }];
  const invalidEvents = invalid.map(e => !validRecord({ ...record, events: [e as SourceEvent] }));
  invalidEvents.push(!validRecord({ ...record, events: Array<SourceEvent>(5).fill(base) }));
  // Each isolated control differs from the valid base in exactly one field.
  const validBaseAccepted = validRecord({ ...record, events: [base] });
  const event = (patch: object) => !validRecord({ ...record, events: [{ ...base, ...patch } as SourceEvent] });
  const isolatedInvalid = Object.freeze({ relativeNotBoolean: event({ length: 0, relative: 'false' }),
    relativeOutOfRange: event({ length: 2, relative: true }), offsetPastBytes: event({ offset: 4 }),
    metadataEventOffset: event({ at: 'before', offset: 1 }), maxReturnZero: !validRecord({ ...record, maxReturn: 0 }),
    maxReturnOverChunk: !validRecord({ ...record, maxReturn: 65_537 }), initialPastBytes: !validRecord({ ...record, initialLength: 4 }),
    initialNegative: !validRecord({ ...record, initialLength: -1 }) });
  const badOrigin = Object.freeze({});
  const badSource = new SourceOps(new Map([[badOrigin, Object.freeze({ ...record, origin: badOrigin, maxReturn: 0 })]]), sourceFaults('normal'));
  const invalidRecordOpenRejected = badSource.openOnce(badOrigin).kind === 'none';
  return Object.freeze({ grid: Object.freeze(grid), copiedOriginRejected, foreignHandleRejected, duplicateOpenRejected,
    duplicateCloseRejected, closedReadRejected, invalidEvents: Object.freeze(invalidEvents), validBaseAccepted, isolatedInvalid,
    invalidRecordOpenRejected });
}
class Assembly {
  readonly #files: readonly File[];
  readonly #source: SourceOps;
  readonly #sourceProbe: ReturnType<typeof sourceProbe> | undefined;
  #before: Metadata | undefined;
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
  #retry = false; #receivedKnown = true; #readCompleted = 0;
  #first: Reason = 'none'; #stop: Reason = 'none'; #cleanup: 'none' | 'close_unconfirmed' = 'none';
  #cleanupTiming: 'not_checked' | 'within' | 'expired' | 'unknown' = 'not_checked';
  #now = 0; #last = 0; #clockBad = false; #cancelled = false; #inInterval = false; #intervalGuards = 0;
  #terminal: ReturnType<Assembly['snapshot']> | undefined;
  constructor(private readonly scenario: Scenario, admitted: boolean) {
    const seeds = files(scenario);
    this.#files = Object.freeze(seeds.map((seed, i) => Object.freeze({ id: seed.id,
      declaredBytes: scenario === 'da_declared_two' && i === 0 ? 2 : scenario === 'da_declared_four' && i === 0 ? 4 : seed.bytes.length,
      digest: seed.digest, origin: Object.freeze({}) })));
    this.#source = new SourceOps(new Map(this.#files.map((file, i) =>
      [file.origin, sourceRecipe(scenario, file, seeds[i], i, seeds.length - 1)])), sourceFaults(scenario));
    this.#sourceProbe = scenario === 'da_source_probe' ? sourceProbe() : undefined;
    this.#slots = this.#files.map(f => Object.freeze({ id: f.id, hash: 'not_started', cleanup: 'not_attempted' }));
    if (!admitted) this.fail('binding');
    if (this.#files.length > LIMIT.files || this.#files.some(f => f.declaredBytes > LIMIT.maxFile)
      || this.#files.reduce((n, f) => n + f.declaredBytes, 0) > LIMIT.expected) this.fail('source_limit');
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
    const file = this.#files[this.#ordinal];
    const result = this.#source.openOnce(file.origin);
    if (result.kind === 'none') {
      this.#counts.cleanupUnused++; this.#slots[this.#ordinal] = Object.freeze({ ...this.#slots[this.#ordinal], hash: 'incomplete', cleanup: 'no_resource' });
      this.fail(result.reason); return;
    }
    this.#scope = Object.freeze({ file, ordinal: this.#ordinal, resource: result.handle }); this.#before = undefined;
    this.#position = 0; this.#prefix = 0; this.#hashState = 'not_started'; this.#retry = false;
    this.#slots[this.#ordinal] = Object.freeze({ ...this.#slots[this.#ordinal], hash: 'pending' });
    if (!result.ok) this.fail('source_unavailable'); else this.#phase = 'before';
  }
  private applySignal(signal: StopSignal): void {
    if (signal === 'cancel') this.#cancelled = true;
    else if (signal === 'advance_to_stop') this.#now = LIMIT.stop;
    else if (signal === 'advance_to_end') this.#now = LIMIT.end;
  }
  private read(): void {
    const scope = this.#scope!;
    const remaining = scope.file.declaredBytes - this.#position;
    const requested = remaining ? Math.min(remaining, LIMIT.chunk) : 1;
    const readCap = this.scenario === 'read_cap' ? 1 : LIMIT.read;
    const receivedCap = this.scenario === 'received_cap' ? 2 : LIMIT.received;
    const updateCap = this.scenario === 'update_cap' ? 0 : LIMIT.read;
    if (this.#counts.read >= readCap || (this.#retry && this.#counts.retry >= LIMIT.retry)
      || requested > receivedCap - this.#counts.received || (remaining > 0 && this.#counts.update >= updateCap)
      || (remaining > 0 && (!Number.isSafeInteger(this.#position + requested) || this.#position + requested > scope.file.declaredBytes))) {
      this.fail('source_limit'); return;
    }
    if (remaining) { this.#counts.updateReserved++; this.#counts.updateReservations++;
      this.#counts.updateReservationPeak = Math.max(this.#counts.updateReservationPeak, this.#counts.updateReserved); }
    if (this.#retry) this.#counts.retry++;
    this.#counts.read++;
    this.#inInterval = true;
    let updated = false;
    try {
      const result = this.#source.readOnce(scope.resource, this.#position, requested, this.#scratch);
      if (result.kind !== 'bytes') {
        this.applySignal(result.stopSignal);
        if (result.kind === 'interrupted') { this.#retry = true; return; }
        this.#retry = false;
        if (result.kind === 'eof') { if (remaining) this.mismatch(); else this.#phase = 'after'; return; }
        this.#receivedKnown = false; this.fail(result.kind === 'failed' ? 'source_unavailable' : 'operation_invalid'); return;
      }
      this.#retry = false;
      const n = result.n;
      if (n === undefined || !Number.isSafeInteger(n) || n < 1 || n > requested || n > this.#scratch.length) {
        this.applySignal(result.stopSignal); this.#receivedKnown = false; this.fail('operation_invalid'); return;
      }
      this.#counts.received += n;
      this.applySignal(result.stopSignal);
      if (!remaining) { this.mismatch(); return; }
      this.#counts.update++;
      updated = true;
      try {
        if (this.scenario === 'hash_update_throw' || this.scenario === 'hash_throw_cancel'
          || (this.scenario === 'second_update_throw' && this.#counts.update === 2)) throw Error('hash');
        this.#hash!.update(this.#scratch.subarray(0, n));
        if (this.scenario === 'hash_partial_throw') throw Error('partial');
        this.#counts.updateCompleted++; this.#counts.hashed += n; this.#prefix += n; this.#position += n;
      } catch { this.#hashState = 'poisoned'; this.fail('hash_unavailable'); }
    } catch { this.#receivedKnown = false; this.fail('source_unavailable'); }
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
      const result = this.#source.closeOnce(this.#scope.resource);
      this.applySignal(result.stopSignal); confirmed = result.confirmed;
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
    this.#before = undefined;
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
      case 'before':
        this.#counts.observe++; this.#before = this.#source.observeOnce(this.#scope!.resource, 'before');
        if (this.#before.kind !== 'regular' || this.#before.identity !== this.#scope!.file.origin
          || this.#before.size !== this.#scope!.file.declaredBytes) this.mismatch();
        else this.#phase = 'init'; break;
      case 'init':
        this.#counts.init++;
        if (this.scenario === 'hash_init_throw') throw Error('synthetic_init');
        this.#hash = createHash('sha256'); this.#hashState = 'active'; this.#phase = 'read';
        break;
      case 'read': this.read(); break;
      case 'after': {
        this.#counts.observe++;
        const after = this.#source.observeOnce(this.#scope!.resource, 'after');
        if (after.kind !== this.#before!.kind || after.identity !== this.#before!.identity
          || after.size !== this.#before!.size || after.stamp !== this.#before!.stamp) this.fail('source_changed');
        else { this.#readCompleted++; this.#phase = 'final'; }
        break;
      }
      case 'final': {
        if (this.#prefix !== this.#scope!.file.declaredBytes || this.#hashState !== 'active') { this.fail('binding'); break; }
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
    return Object.freeze({ ...FIXED, ...(this.#sourceProbe ? { sourceProbe: this.#sourceProbe } : {}),
      phase: this.#phase, firstReason: this.#first, stopReason: this.#stop,
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
