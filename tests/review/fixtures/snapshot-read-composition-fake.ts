/** Synthetic B and C preparation only. C execution, transfer and formal issuance remain closed. */
import { createHash, type Hash } from 'node:crypto';
import { inspectSourceMapDraft } from './source-map-values-core.js';


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

// C-start body: only three module-local identifiers renamed to avoid B collisions.
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
const cStartScenarios = ['normal', 'owner_failure', 'result_slot_failure', 'custody_failure', 'source_failure', 'map_rejected',
  'snapshot_failure', 'after_snapshot_failure', 'borrow_failure', 'after_borrow_failure', 'result_prepare_failure',
  'owner_mix', 'snapshot_mix', 'version_mix', 'map_wrapper', 'map_copy', 'files_copy', 'rows_copy', 'file_copy',
  'ordinal_mix', 'session_mix', 'budget_mix', 'borrow_copy', 'origin_input', 'reentrant_begin'] as const;
type CStartScenario = typeof cStartScenarios[number];
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
interface CPreparedContext extends Binding { readonly prepared: object; readonly borrow: Borrow }
// Module-private closure: no accessor/adopt method is exposed through a diagnostic facade.
let canonicalSupplyAccess: Readonly<{
  context(a: CStartAssembly): CPreparedContext | undefined;
  open(a: CStartAssembly): boolean;
  fail(a: CStartAssembly, reason: Exclude<LifecycleReason, 'none'>): void;
  retireFailed(a: CStartAssembly): void;
}>;
class CStartAssembly {
  static {
    canonicalSupplyAccess = Object.freeze({
      context(a: CStartAssembly): CPreparedContext | undefined {
        const map = a.#snapshot?.view(), prepared = a.#prepared;
        if (a.#terminal || a.#state !== 'prepared' || a.#closeRequested || a.#supplyState !== 'open'
          || !map || !prepared || !a.#borrow || a.#borrow !== a.#issuedBorrow) return undefined;
        const binding = a.binding(map);
        if (!a.#borrow.matches(binding)) return undefined;
        return Object.freeze({ ...binding, prepared, borrow: a.#borrow });
      },
      open: (a: CStartAssembly) => a.#supplyState === 'open' && !a.#closeRequested,
      fail(a: CStartAssembly, reason: Exclude<LifecycleReason, 'none'>): void { a.fail(reason); },
      retireFailed(a: CStartAssembly): void { if (a.#terminal && !a.#borrow) a.retireSnapshot(); },
    });
  }
  #diagnostic: DiagnosticOwner | undefined;
  #fallbackSupply: SupplyReason = 'none';
  #custody: Readonly<{ state: 'empty' }> | undefined;
  #resultSlot: { terminal?: ReturnType<CStartAssembly['endView']> } | undefined;
  #snapshot: Snapshot | undefined; #borrow: Borrow | undefined; #issuedBorrow: Borrow | undefined;
  #prepared: Readonly<{ borrow: Borrow; session: object; budget: object }> | undefined;
  #originInput: unknown;
  #session: object | undefined; #budget: object | undefined;
  #supplyState: 'open' | 'closing' | 'retired' = 'open'; #state: State = 'unused'; #closeRequested = false;
  #terminal: ReturnType<CStartAssembly['endView']> | undefined;
  readonly #counts = { diagnosticOwners: 0, resultSlots: 0, custodySlots: 0, mapChecks: 0, snapshots: 0,
    startClaims: 0, sessions: 0, budgetOrigins: 0, borrows: 0, identityChecks: 0, preparationRecords: 0,
    borrowRetirements: 0, snapshotRetirements: 0, open: 0, read: 0, hash: 0, cleanup: 0 };
  constructor(private readonly scenario: CStartScenario, admitted: boolean) {
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
  const admitted = args.length <= 1 && typeof input === 'string' && (cStartScenarios as readonly string[]).includes(input);
  const a = new CStartAssembly(admitted ? input as CStartScenario : 'normal', admitted);
  return Object.freeze({ check: () => a.check(),
    begin: (...input: readonly unknown[]) => input.length ? a.rejectArguments() : a.begin(),
    prepare: (...input: readonly unknown[]) => input.length ? a.rejectArguments() : a.prepare(),
    close: () => a.close(), finish: () => a.finish(), inspect: () => a.inspect() });
}

interface CanonicalRegistryEntry {
  readonly file: MapValue['files'][number]; readonly ordinal: number; readonly origin: object; readonly source: SourceRecord;
}
interface CanonicalPayloadBinding extends CanonicalRegistryEntry { readonly tableOrigin: object }
interface CanonicalPayloadTable {
  readonly envelope: CPreparedContext; readonly origin: object; readonly bindings: readonly CanonicalPayloadBinding[];
}
interface CanonicalDeclarationView {
  readonly file: MapValue['files'][number]; readonly ordinal: number; readonly binding: CanonicalPayloadBinding;
}
interface NonExecutingSupplyView {
  readonly envelope: CPreparedContext; readonly table: CanonicalPayloadTable; readonly declarations: readonly CanonicalDeclarationView[];
}
type CanonicalSupplyReason = 'none' | 'binding_mismatch' | 'supply_prepare_unavailable' | 'duplicate_preparation' | 'supply_closed';
const CANONICAL_CLOSED = Object.freeze({ ...CLOSED, model: 'wfb-canonical-supply-view-fake-C2-1',
  transferClaim: 'not_issued', viewAuthority: 'none' } as const);
const canonicalSupplyScenarios: readonly string[] = Object.freeze([...cStartScenarios, 'record_swap',
  'envelope_failure', 'origin_failure', 'table_failure', 'view_failure', 'post_failure', 'reentrant_preparation',
  'close_during_registry', 'close_before_post',
  'envelope_owner_mix', 'envelope_snapshot_mix', 'envelope_set_mix', 'envelope_map_copy', 'envelope_map_redecode',
  'envelope_raw_map', 'envelope_files_copy', 'envelope_rows_copy', 'envelope_file_copy', 'envelope_ordinal_mix',
  'envelope_session_mix', 'envelope_budget_mix', 'envelope_borrow_copy', 'envelope_prepared_copy',
  'binding_missing', 'binding_duplicate', 'binding_extra', 'binding_order', 'binding_ordinal', 'binding_file_copy',
  'binding_legacy', 'origin_swap', 'record_origin_swap', 'table_copy', 'view_copy', 'foreign_table', 'foreign_view',
  'source_zero', 'source_short', 'source_extra', 'source_abd', 'source_shrink', 'source_grow',
  ...Array.from({ length: 4 }, (_, i) => [`registry_${i}_failure`, `bindings_${i}_failure`, `declarations_${i}_failure`]).flat(),
  // Post-validation isolation: each re-issues a consistent set so exactly one clause fails.
  'post_reissue_control', 'post_registry_rebuild_control', 'post_table_unissued', 'post_table_envelope', 'post_view_envelope',
  'post_view_table', 'post_table_origin', 'post_declarations_unissued', 'post_registry_missing', 'post_table_bindings_short',
  'post_view_declarations_short', 'post_registry_file', 'post_registry_ordinal', 'post_registry_duplicate_origin',
  'post_source_origin', 'post_invalid_record', 'post_source_oversize', 'post_binding_file', 'post_binding_ordinal',
  'post_binding_table_origin', 'post_declaration_file', 'post_declaration_ordinal', 'post_declaration_binding']);
interface SupplyIssuanceAnchor {
  readonly transferOwner: object; readonly sourceOwner: CanonicalSupplyAssembly; readonly envelope: CPreparedContext;
  readonly registry: readonly CanonicalRegistryEntry[]; readonly table: CanonicalPayloadTable;
  readonly view: NonExecutingSupplyView; readonly declarations: readonly CanonicalDeclarationView[]; readonly tableOrigin: object;
}
interface PreparedSupplyPayload {
  readonly envelope: CPreparedContext; readonly registry: readonly CanonicalRegistryEntry[];
  readonly table: CanonicalPayloadTable; readonly view: NonExecutingSupplyView;
  readonly declarations: readonly CanonicalDeclarationView[]; readonly tableOrigin: object;
}
// No taking/consume/reset operation exists in this stage.
interface SupplyControlCore { readonly owner: object; readonly construction: object; readonly retention: object;
  readonly source: object; readonly claim: object }
interface SupplyControlLive { readonly source: CanonicalSupplyAssembly; readonly anchor: SupplyIssuanceAnchor;
  readonly claim: NonExecutingSupplyTransfer }
let sourceIdentity: (a: CanonicalSupplyAssembly) => object;
let sourceControlMatches: (a: CanonicalSupplyAssembly, control: SupplyUseControl) => boolean;
let sourceStopOwned: (a: CanonicalSupplyAssembly, origin: object, kind: 'close' | 'failure') => boolean;
let sourceRetention: (a: CanonicalSupplyAssembly) => Readonly<{ normal: number; issued: number; controlLive: boolean;
  borrow: boolean; snapshot: boolean; discardPasses: number }>;
class SupplyUseControl {
  #stop: 'none' | 'supply_closed' | 'binding_mismatch' = 'none';
  #live: SupplyControlLive | undefined;
  readonly identity: SupplyControlCore;
  constructor(readonly owner: object, source: CanonicalSupplyAssembly,
    anchor: SupplyIssuanceAnchor, claim: NonExecutingSupplyTransfer, core?: SupplyControlCore) {
    this.identity = core ?? Object.freeze({ owner, construction: owner, retention: Object.freeze({}), source: sourceIdentity(source), claim: Object.freeze({}) });
    this.#live = Object.freeze({ source, anchor, claim }); Object.freeze(this);
  }
  get state() { return !this.#live ? 'retired' as const : this.#stop === 'none' ? 'unused' as const : 'stopped' as const; }
  live() { return this.#live; }
  stop(reason: 'supply_closed' | 'binding_mismatch'): void { if (this.#stop === 'none') this.#stop = reason; }
  retireLiveBinding(): boolean {
    if (this.#stop === 'none' || !this.#live) return false;
    this.#live = undefined; return true;
  }
}
let boundarySourceAccess: Readonly<{
  bind(a: CanonicalSupplyAssembly, control: SupplyUseControl): boolean;
  normal(a: CanonicalSupplyAssembly, control: SupplyUseControl): boolean;
}>;
let boundaryStop: (a: CanonicalSupplyAssembly, control: SupplyUseControl, kind: 'close' | 'failure') => boolean;
// Lexical issuer only: no facade, summary, external callback or registration can supply an anchor.
let supplyTransferAccess: {
  capture(a: CanonicalSupplyAssembly, transferOwner: object): SupplyIssuanceAnchor | undefined;
  matches(a: CanonicalSupplyAssembly, anchor: SupplyIssuanceAnchor): boolean;
  fail(a: CanonicalSupplyAssembly, reason: 'binding_mismatch' | 'supply_prepare_unavailable'): void;
};
class CanonicalSupplyAssembly {
  readonly #root: CStartAssembly;
  readonly #sourceOrigin = Object.freeze({});
  #normalControl: SupplyUseControl | undefined;
  #state: 'unused' | 'preparing' | 'prepared' | 'discarded' = 'unused';
  #first: CanonicalSupplyReason = 'none';
  #envelope: CPreparedContext | undefined;
  #registry: readonly CanonicalRegistryEntry[] | undefined;
  #buildingRegistry: CanonicalRegistryEntry[] | undefined;
  #buildingBindings: CanonicalPayloadBinding[] | undefined;
  #buildingDeclarations: CanonicalDeclarationView[] | undefined;
  #table: CanonicalPayloadTable | undefined; #issuedTable: CanonicalPayloadTable | undefined;
  #view: NonExecutingSupplyView | undefined; #issuedView: NonExecutingSupplyView | undefined;
  #issuedDeclarations: readonly CanonicalDeclarationView[] | undefined;
  #tableOrigin: object | undefined;
  #terminal: ReturnType<CanonicalSupplyAssembly['snapshot']> | undefined;
  readonly #retirementOrder: string[] = [];
  readonly #counts = { preparationClaims: 0, registryRecords: 0, bindings: 0, declarations: 0, tables: 0, views: 0,
    validationPasses: 0, fileChecks: 0, discardPasses: 0 };
  static {
    sourceIdentity = a => a.#sourceOrigin;
    sourceControlMatches = (a, control) => a.#normalControl === control;
    sourceStopOwned = (a, origin, action) => {
      if (origin !== a.#sourceOrigin) return false;
      if (action === 'close') { a.#root.close(); }
      else { canonicalSupplyAccess.fail(a.#root, 'binding_mismatch'); }
      return true;
    };
    sourceRetention = a => {
      const root = a.#root.inspect();
      return Object.freeze({ normal: [a.#registry, a.#table, a.#view, a.#buildingRegistry, a.#buildingBindings, a.#buildingDeclarations].filter(Boolean).length,
        issued: [a.#envelope, a.#issuedTable, a.#issuedView, a.#issuedDeclarations, a.#tableOrigin].filter(Boolean).length,
        controlLive: !!a.#normalControl?.live(), borrow: root.retainedBorrow, snapshot: root.retainedSnapshot, discardPasses: a.#counts.discardPasses });
    };
    boundarySourceAccess = Object.freeze({
      bind(a: CanonicalSupplyAssembly, control: SupplyUseControl): boolean {
        const live = control.live();
        if (a.#normalControl || !live || live.source !== a || control.state !== 'unused'
          || control.identity.owner !== control.owner || control.identity.source !== a.#sourceOrigin
          || control.owner !== live.anchor.transferOwner || live.claim.owner !== control.owner
          || live.claim.source !== a || live.claim.anchor !== live.anchor
          || !supplyTransferAccess.matches(a, live.anchor)) return false;
        a.#normalControl = control; return true;
      },
      normal(a: CanonicalSupplyAssembly, control: SupplyUseControl): boolean {
        return a.#normalControl === control && control.state === 'unused' && a.check().ok;
      },
    });
    boundaryStop = (a, control, kind): boolean => {
      if (a.#normalControl !== control) return false;
      control.stop(kind === 'close' ? 'supply_closed' : 'binding_mismatch');
      // Stop only: never call the preparation owner's close/fail/clear/finish.
      if (kind === 'close') a.#root.close();
      else canonicalSupplyAccess.fail(a.#root, 'binding_mismatch');
      return true;
    };
    supplyTransferAccess = Object.freeze({
      capture(a: CanonicalSupplyAssembly, transferOwner: object): SupplyIssuanceAnchor | undefined {
        if (a.#normalControl && a.#normalControl.state !== 'unused') return undefined;
        if (a.#terminal || a.#first !== 'none' || a.#state !== 'prepared'
          || !canonicalSupplyAccess.context(a.#root) || !a.#envelope || !a.#registry || !a.#table || !a.#view
          || !a.#issuedDeclarations || !a.#tableOrigin) return undefined;
        return Object.freeze({ transferOwner, sourceOwner: a, envelope: a.#envelope, registry: a.#registry,
          table: a.#issuedTable!, view: a.#issuedView!, declarations: a.#issuedDeclarations, tableOrigin: a.#tableOrigin });
      },
      matches(a: CanonicalSupplyAssembly, anchor: SupplyIssuanceAnchor): boolean {
        if (a.#normalControl && a.#normalControl.state !== 'unused') return false;
        const live = canonicalSupplyAccess.context(a.#root), e = anchor.envelope;
        return !a.#terminal && a.#first === 'none' && a.#state === 'prepared' && !!live
          && anchor.sourceOwner === a && e === a.#envelope && anchor.registry === a.#registry
          && anchor.table === a.#table && anchor.table === a.#issuedTable
          && anchor.view === a.#view && anchor.view === a.#issuedView
          && anchor.declarations === a.#issuedDeclarations && anchor.tableOrigin === a.#tableOrigin
          && e.owner === live.owner && e.snapshot === live.snapshot && e.setId === live.setId
          && e.map === live.map && e.files === live.files && e.rows === live.rows && e.file === live.file
          && e.ordinal === live.ordinal && e.session === live.session && e.budget === live.budget
          && e.borrow === live.borrow && e.prepared === live.prepared && e.borrow.matches(e);
      },
      fail(a: CanonicalSupplyAssembly, reason: 'binding_mismatch' | 'supply_prepare_unavailable'): void { a.fail(reason); },
    });
  }
  constructor(private readonly scenario: string, admitted: boolean) {
    this.#root = new CStartAssembly((cStartScenarios as readonly string[]).includes(scenario) ? scenario as CStartScenario : 'normal', admitted);
  }
  private reply(reason?: Exclude<CanonicalSupplyReason, 'none'> | 'read_already_used') {
    return Object.freeze(reason ? { ...CANONICAL_CLOSED, ok: false, reason } : { ...CANONICAL_CLOSED, ok: true });
  }
  private clear(): void {
    if (this.#envelope || this.#registry || this.#table || this.#view || this.#buildingRegistry
      || this.#buildingBindings || this.#buildingDeclarations) {
      this.#counts.discardPasses++; this.#retirementOrder.push('supply_references_cleared');
    }
    this.#envelope = undefined; this.#registry = undefined; this.#table = undefined; this.#issuedTable = undefined;
    this.#view = undefined; this.#issuedView = undefined; this.#issuedDeclarations = undefined;
    this.#buildingRegistry = undefined; this.#buildingBindings = undefined; this.#buildingDeclarations = undefined;
    this.#tableOrigin = undefined; this.#state = 'discarded';
  }
  private fail(reason: Exclude<CanonicalSupplyReason, 'none'>) {
    if (this.#first === 'none') this.#first = reason;
    if (reason !== 'supply_closed' && this.#root.inspect().supplyFirst === 'none') canonicalSupplyAccess.fail(this.#root,
      reason === 'supply_prepare_unavailable' ? 'read_prepare_unavailable' : 'binding_mismatch');
    this.clear(); return this.reply(this.#first);
  }
  private baseOperation(kind: 'begin' | 'prepare') {
    if (this.#terminal) return this.reply('read_already_used');
    if (this.#first !== 'none') return this.reply(this.#first);
    if (this.#normalControl && this.#normalControl.state !== 'unused') return this.reply('supply_closed');
    const result = this.#root[kind]();
    if (result.ok) return this.reply();
    return this.fail(result.reason === 'supply_closed' ? 'supply_closed'
      : result.reason === 'supply_invalid' || result.reason === 'read_prepare_unavailable' ? 'supply_prepare_unavailable' : 'binding_mismatch');
  }
  begin() { return this.baseOperation('begin'); }
  prepare() { return this.baseOperation('prepare'); }
  check() {
    if (this.#first !== 'none') return this.reply(this.#first);
    const result = this.#root.check();
    if (result.ok && this.#normalControl && this.#normalControl.state !== 'unused') return this.reply('supply_closed');
    return result.ok ? this.reply() : this.reply(result.reason === 'supply_closed' ? 'supply_closed'
      : result.reason === 'supply_invalid' ? 'supply_prepare_unavailable' : 'binding_mismatch');
  }
  private fault(point: string): void { if (this.scenario === point + '_failure') throw Error('synthetic_preparation'); }
  private sourceRecord(origin: object, ordinal: number, normal: readonly number[]): SourceRecord {
    let bytes = normal, initialLength = 3;
    const events: SourceEvent[] = [];
    if (ordinal === 0) {
      if (this.scenario === 'source_zero') { bytes = Object.freeze([]); initialLength = 0; }
      if (this.scenario === 'source_short') { bytes = Object.freeze([97, 98]); initialLength = 2; }
      if (this.scenario === 'source_extra') { bytes = Object.freeze([97, 98, 99, 120]); initialLength = 4; }
      if (this.scenario === 'source_abd') bytes = Object.freeze([97, 98, 100]);
      if (this.scenario === 'source_shrink') events.push({ at: 'read', offset: 0, length: 2, stamp: 0, relative: false });
      if (this.scenario === 'source_grow') {
        bytes = Object.freeze([97, 98, 99, 120]); events.push({ at: 'read', offset: 3, length: 4, stamp: 0, relative: false });
      }
    }
    return Object.freeze({ origin, bytes, initialLength, maxReturn: 65_536, events: Object.freeze(events.map(e => Object.freeze(e))) });
  }
  private probeEnvelope(e: CPreparedContext): CPreparedContext {
    switch (this.scenario) {
      case 'envelope_owner_mix': return Object.freeze({ ...e, owner: Object.freeze({}) });
      case 'envelope_snapshot_mix': return Object.freeze({ ...e, snapshot: new Snapshot(e.map) });
      case 'envelope_set_mix': return Object.freeze({ ...e, setId: 'synthetic-foreign-set' });
      case 'envelope_map_copy': return Object.freeze({ ...e, map: Object.freeze({ ...e.map }) });
      case 'envelope_map_redecode': {
        const copy = inspectSourceMapDraft(e.map);
        if (!copy.ok) throw Error('synthetic_control');
        return Object.freeze({ ...e, map: copy.value });
      }
      case 'envelope_raw_map': return Object.freeze({ ...e, map: fixedData() as MapValue });
      case 'envelope_files_copy': return Object.freeze({ ...e, files: Object.freeze([...e.files]) });
      case 'envelope_rows_copy': return Object.freeze({ ...e, rows: Object.freeze([...e.rows]) });
      case 'envelope_file_copy': return Object.freeze({ ...e, file: Object.freeze({ ...e.file }) });
      case 'envelope_ordinal_mix': return Object.freeze({ ...e, ordinal: 1 });
      case 'envelope_session_mix': return Object.freeze({ ...e, session: Object.freeze({}) });
      case 'envelope_budget_mix': return Object.freeze({ ...e, budget: Object.freeze({}) });
      case 'envelope_borrow_copy': return Object.freeze({ ...e, borrow: new Borrow(e) });
      case 'envelope_prepared_copy': return Object.freeze({ ...e, prepared: Object.freeze({ ...e.prepared }) });
      default: return e;
    }
  }
  private probeBindings(items: readonly CanonicalPayloadBinding[]): readonly CanonicalPayloadBinding[] {
    const values = [...items];
    switch (this.scenario) {
      case 'binding_missing': values.pop(); break;
      case 'binding_extra': values.push(values[0]); break;
      case 'binding_duplicate': values[1] = values[0]; break;
      case 'binding_order': [values[0], values[1]] = [values[1], values[0]]; break;
      case 'binding_ordinal': values[0] = Object.freeze({ ...values[0], ordinal: 1 }); break;
      case 'binding_file_copy': values[0] = Object.freeze({ ...values[0], file: Object.freeze({ ...values[0].file }) }); break;
      case 'binding_legacy': {
        const legacy: File = Object.freeze({ id: 'F01', declaredBytes: 3, digest: ABC, origin: Object.freeze({}) });
        values[0] = Object.freeze({ ...values[0], file: legacy as unknown as MapValue['files'][number] }); break;
      }
    }
    return Object.freeze(values);
  }
  private probeIssued(): void {
    if (this.scenario === 'table_copy') this.#table = Object.freeze({ ...this.#table! });
    if (this.scenario === 'view_copy') this.#view = Object.freeze({ ...this.#view! });
    if (this.scenario === 'foreign_table' || this.scenario === 'foreign_view') {
      const other = new CanonicalSupplyAssembly('normal', true); other.begin(); other.prepare(); other.prepareSupply();
      if (this.scenario === 'foreign_table') this.#table = other.#table;
      else this.#view = other.#view;
      other.finish();
    }
    if (this.scenario.startsWith('post_')) this.probePost();
  }
  /** Synthetic control only: replaces current and issued references together, without counting a second table/view. */
  private reissue(bindings: readonly CanonicalPayloadBinding[], declarations?: readonly CanonicalDeclarationView[],
    envelopes: { table?: CPreparedContext; view?: CPreparedContext } = {}): void {
    const e = this.#envelope!;
    const table: CanonicalPayloadTable = Object.freeze({ envelope: envelopes.table ?? e, origin: this.#tableOrigin!, bindings: Object.freeze([...bindings]) });
    const decls = Object.freeze([...(declarations ?? bindings.map(binding =>
      Object.freeze({ file: binding.file, ordinal: binding.ordinal, binding })))]);
    this.#table = table; this.#issuedTable = table; this.#issuedDeclarations = decls;
    this.#view = Object.freeze({ envelope: envelopes.view ?? e, table, declarations: decls }); this.#issuedView = this.#view;
  }
  private rebuildBindings(registry: readonly CanonicalRegistryEntry[]): readonly CanonicalPayloadBinding[] {
    return registry.map(r => Object.freeze({ ...r, tableOrigin: this.#tableOrigin! }));
  }
  private probePost(): void {
    const e = this.#envelope!, t = this.#table!, v = this.#view!, r = this.#registry!;
    const b = t.bindings, d = v.declarations, file0 = Object.freeze({ ...b[0].file });
    const withEntry = <T>(items: readonly T[], i: number, value: T) => Object.freeze(items.map((x, j) => j === i ? value : x));
    const withSource = (i: number, patch: Partial<SourceRecord>, origin = r[i].origin) =>
      withEntry(r, i, Object.freeze({ ...r[i], origin, source: Object.freeze({ ...r[i].source, ...patch }) }));
    switch (this.scenario) {
      case 'post_reissue_control': this.reissue(b); break;
      case 'post_registry_rebuild_control': {
        this.#registry = Object.freeze(r.map(x => Object.freeze({ ...x, source: Object.freeze({ ...x.source }) })));
        this.reissue(this.rebuildBindings(this.#registry)); break;
      }
      case 'post_table_unissued': {
        this.#table = Object.freeze({ ...t }); this.#view = Object.freeze({ ...v, table: this.#table }); this.#issuedView = this.#view; break;
      }
      case 'post_table_envelope': this.reissue(b, undefined, { table: Object.freeze({ ...e }) }); break;
      case 'post_view_envelope': this.reissue(b, undefined, { view: Object.freeze({ ...e }) }); break;
      case 'post_view_table': this.#view = Object.freeze({ ...v, table: Object.freeze({ ...t }) }); this.#issuedView = this.#view; break;
      case 'post_table_origin': this.#tableOrigin = Object.freeze({}); break;
      case 'post_declarations_unissued': this.#issuedDeclarations = Object.freeze([...d]); break;
      case 'post_registry_missing': this.#registry = Object.freeze(r.slice(0, -1)); break;
      case 'post_table_bindings_short': this.reissue(b.slice(0, -1), d); break;
      case 'post_view_declarations_short': this.reissue(b, d.slice(0, -1)); break;
      case 'post_registry_file': this.#registry = withEntry(r, 0, Object.freeze({ ...r[0], file: file0 })); break;
      case 'post_registry_ordinal': this.#registry = withEntry(r, 0, Object.freeze({ ...r[0], ordinal: 1 })); break;
      case 'post_registry_duplicate_origin': this.#registry = withSource(1, { origin: r[0].origin }, r[0].origin); this.reissue(this.rebuildBindings(this.#registry)); break;
      case 'post_source_origin': this.#registry = withSource(0, { origin: Object.freeze({}) }); this.reissue(this.rebuildBindings(this.#registry)); break;
      case 'post_invalid_record': this.#registry = withSource(0, { maxReturn: 0 }); this.reissue(this.rebuildBindings(this.#registry)); break;
      case 'post_source_oversize': {
        this.#registry = withSource(0, { bytes: Object.freeze([97, 98, 99, 120, 121]), initialLength: 5 });
        this.reissue(this.rebuildBindings(this.#registry)); break;
      }
      case 'post_binding_file': case 'post_binding_ordinal': case 'post_binding_table_origin': {
        const patch = this.scenario === 'post_binding_file' ? { file: file0 }
          : this.scenario === 'post_binding_ordinal' ? { ordinal: 1 } : { tableOrigin: Object.freeze({}) };
        const binding = Object.freeze({ ...b[0], ...patch });
        this.reissue(withEntry(b, 0, binding), withEntry(d, 0, Object.freeze({ file: b[0].file, ordinal: 0, binding }))); break;
      }
      case 'post_declaration_file': this.reissue(b, withEntry(d, 0, Object.freeze({ ...d[0], file: file0 }))); break;
      case 'post_declaration_ordinal': this.reissue(b, withEntry(d, 0, Object.freeze({ ...d[0], ordinal: 1 }))); break;
      case 'post_declaration_binding': this.reissue(b, withEntry(d, 0, Object.freeze({ ...d[0], binding: Object.freeze({ ...b[0] }) }))); break;
    }
  }
  private validate(): boolean {
    this.#counts.validationPasses++;
    const e = this.#envelope, now = canonicalSupplyAccess.context(this.#root), t = this.#table, v = this.#view, r = this.#registry;
    if (!e || !now || !t || !v || !r || t !== this.#issuedTable || v !== this.#issuedView
      || t.envelope !== e || v.envelope !== e || v.table !== t || t.origin !== this.#tableOrigin
      || v.declarations !== this.#issuedDeclarations || e.owner !== now.owner || e.snapshot !== now.snapshot
      || e.setId !== now.setId || e.map !== now.map || e.files !== now.files || e.rows !== now.rows
      || e.file !== now.file || e.ordinal !== now.ordinal || e.session !== now.session || e.budget !== now.budget
      || e.borrow !== now.borrow || e.prepared !== now.prepared || !e.borrow.matches(e)
      || t.bindings.length !== e.files.length || r.length !== e.files.length || v.declarations.length !== e.files.length
      || r.length > 32 || e.rows.length !== 12) return false;
    const origins = new Set<object>();
    for (let i = 0; i < r.length; i++) {
      this.#counts.fileChecks++;
      const registry = r[i], binding = t.bindings[i], declaration = v.declarations[i], file = e.files[i];
      if (registry.file !== file || registry.ordinal !== i || origins.has(registry.origin)
        || registry.source.origin !== registry.origin || !validRecord(registry.source)
        || registry.source.bytes.length > file.expectedBytes + 1 || binding.file !== file || binding.ordinal !== i
        || binding.tableOrigin !== t.origin || binding.origin !== registry.origin || binding.source !== registry.source
        || declaration.file !== file || declaration.ordinal !== i || declaration.binding !== binding) return false;
      origins.add(registry.origin);
    }
    return true;
  }
  prepareSupply() {
    if (this.#terminal) return this.reply('read_already_used');
    if (this.#first !== 'none') return this.reply(this.#first);
    if (this.#normalControl && this.#normalControl.state !== 'unused') return this.reply('supply_closed');
    if (this.#root.inspect().supplyFirst !== 'none') return this.fail('supply_prepare_unavailable');
    if (!canonicalSupplyAccess.open(this.#root)) return this.fail('supply_closed');
    const canonical = canonicalSupplyAccess.context(this.#root);
    if (!canonical) return this.fail('binding_mismatch');
    if (this.#state !== 'unused') return this.fail('duplicate_preparation');
    this.#state = 'preparing'; this.#counts.preparationClaims++;
    try {
      const envelope = this.probeEnvelope(canonical);
      this.fault('envelope'); this.#envelope = envelope;
      this.fault('origin'); this.#tableOrigin = Object.freeze({});
      if (this.scenario === 'reentrant_preparation') { this.prepareSupply(); return this.reply(this.#first as Exclude<CanonicalSupplyReason, 'none'>); }
      const bytes = Object.freeze([97, 98, 99]);
      this.#buildingRegistry = [];
      for (let ordinal = 0; ordinal < envelope.files.length; ordinal++) {
        this.fault(`registry_${ordinal}`);
        const file = envelope.files[ordinal];
        const origin = Object.freeze({});
        const source = this.sourceRecord(origin, ordinal, bytes);
        this.#buildingRegistry.push(Object.freeze({ file, ordinal, origin, source })); this.#counts.registryRecords++;
        if (this.scenario === 'close_during_registry') { this.close(); return this.reply('supply_closed'); }
      }
      this.#registry = Object.freeze(this.#buildingRegistry); this.#buildingRegistry = undefined;
      this.#buildingBindings = [];
      for (let i = 0; i < this.#registry.length; i++) {
        this.fault(`bindings_${i}`); const r = this.#registry[i];
        const swapped = this.#registry[i < 2 ? 1 - i : i];
        this.#buildingBindings.push(Object.freeze({ ...r,
          source: (this.scenario === 'record_swap' || this.scenario === 'record_origin_swap') && i < 2 ? swapped.source : r.source,
          origin: (this.scenario === 'origin_swap' || this.scenario === 'record_origin_swap') && i < 2 ? swapped.origin : r.origin,
          tableOrigin: this.#tableOrigin! })); this.#counts.bindings++;
      }
      const bindings = this.probeBindings(Object.freeze(this.#buildingBindings)); this.#buildingBindings = undefined;
      this.fault('table');
      this.#table = Object.freeze({ envelope, origin: this.#tableOrigin, bindings }); this.#issuedTable = this.#table;
      this.#counts.tables++;
      this.#buildingDeclarations = [];
      for (let i = 0; i < bindings.length; i++) {
        this.fault(`declarations_${i}`); const binding = bindings[i];
        this.#buildingDeclarations.push(Object.freeze({ file: binding.file, ordinal: binding.ordinal, binding })); this.#counts.declarations++;
      }
      const declarations = Object.freeze(this.#buildingDeclarations); this.#buildingDeclarations = undefined;
      this.#issuedDeclarations = declarations;
      this.fault('view');
      this.#view = Object.freeze({ envelope, table: this.#table, declarations }); this.#issuedView = this.#view;
      this.#counts.views++;
      this.probeIssued();
      if (this.scenario === 'close_before_post') { this.close(); return this.reply('supply_closed'); }
      this.fault('post');
      if (!this.validate()) return this.fail('binding_mismatch');
      this.#state = 'prepared'; return this.reply();
    } catch { return this.fail('supply_prepare_unavailable'); }
  }
  close() {
    const reply = this.#root.close();
    if (!this.#terminal) { if (this.#counts.preparationClaims && this.#first === 'none') this.#first = 'supply_closed'; this.clear(); }
    return reply;
  }
  private snapshot() {
    const root = this.#root.inspect();
    return Object.freeze({ ...CANONICAL_CLOSED, firstReason: this.#first, preparationState: this.#state,
      retainedRegistry: !!this.#registry, retainedTable: !!this.#table, retainedView: !!this.#view,
      retainedEnvelope: !!this.#envelope, retainedIssuedTable: !!this.#issuedTable, retainedIssuedView: !!this.#issuedView,
      retainedIssuedDeclarations: !!this.#issuedDeclarations, retainedTableOrigin: !!this.#tableOrigin,
      retainedBuilding: !!this.#buildingRegistry || !!this.#buildingBindings || !!this.#buildingDeclarations,
      fileSlots: Object.freeze(this.#view?.declarations.map(d => Object.freeze({ id: d.file.id, ordinal: d.ordinal })) ?? []),
      rowStates: Object.freeze(this.#envelope?.rows.map(r => Object.freeze({ id: r.id, status: r.status, missingCount: r.missing.length })) ?? []),
      sourceShapes: Object.freeze(this.#registry?.map(r => Object.freeze({ id: r.file.id, declaredBytes: r.file.expectedBytes,
        actualBytes: r.source.initialLength, backingBytes: r.source.bytes.length, eventCount: r.source.events.length })) ?? []),
      counts: Object.freeze({ ...this.#counts }), retirementOrder: Object.freeze([...this.#retirementOrder]), root });
  }
  inspect() { return this.#terminal ?? this.snapshot(); }
  finish() {
    if (this.#terminal) return this.#terminal;
    this.clear();
    const before = this.#root.inspect(); this.#root.finish();
    if (this.#first !== 'none') canonicalSupplyAccess.retireFailed(this.#root);
    const after = this.#root.inspect();
    if (before.retainedBorrow && !after.retainedBorrow) this.#retirementOrder.push('borrow_retired');
    if (before.retainedSnapshot && !after.retainedSnapshot) this.#retirementOrder.push('snapshot_retired');
    this.#terminal = this.snapshot(); return this.#terminal;
  }
  rejectArguments() { return this.#terminal ? this.reply('read_already_used') : this.fail('binding_mismatch'); }
}
export function createCanonicalSupplyViewFake(...args: readonly unknown[]) {
  const input = args.length === 0 ? 'normal' : args[0];
  const admitted = args.length <= 1 && typeof input === 'string' && (canonicalSupplyScenarios as readonly string[]).includes(input);
  const a = new CanonicalSupplyAssembly(admitted ? input as string : 'normal', admitted);
  return Object.freeze({ check: () => a.check(),
    begin: (...input: readonly unknown[]) => input.length ? a.rejectArguments() : a.begin(),
    prepare: (...input: readonly unknown[]) => input.length ? a.rejectArguments() : a.prepare(),
    prepareSupply: (...input: readonly unknown[]) => input.length ? a.rejectArguments() : a.prepareSupply(),
    close: () => a.close(), finish: () => a.finish(), inspect: () => a.inspect() });
}

const TRANSFER_BRAND: unique symbol = Symbol('nonexecuting-transfer');
interface NonExecutingSupplyTransfer {
  readonly [TRANSFER_BRAND]: true; readonly owner: object; readonly source: CanonicalSupplyAssembly;
  readonly anchor: SupplyIssuanceAnchor; readonly receiver: object; readonly state: 'unused';
}
type ShellRole = 'pending' | 'holder' | 'failure';
interface EmptyTransferShell {
  readonly role: ShellRole; readonly owner: object; readonly source: CanonicalSupplyAssembly;
  readonly anchor: SupplyIssuanceAnchor; readonly claim: NonExecutingSupplyTransfer; readonly receiver: object;
  readonly payload: undefined;
}
type TransferReason = 'none' | 'binding_mismatch' | 'transfer_prepare_unavailable' | 'source_rejected'
  | 'duplicate_transfer_preparation' | 'supply_closed';
const TRANSFER_CLOSED = Object.freeze({ ...CLOSED, model: 'wfb-supply-transfer-preflight-fake-1',
  cExecution: 'not_connected', cleanupDisposition: 'not_started', normalSlotMovement: 'not_connected',
  holderPublication: 'not_connected', actualBudget: 'not_connected' } as const);
const transferScenarios = Object.freeze(['normal', 'source_failure', 'source_closed', 'close_before_pre',
  'anchor_failure', 'claim_failure', 'pending_failure', 'holder_failure', 'failure_failure', 'pre_failure',
  'anchor_copy', 'anchor_owner', 'anchor_source', 'anchor_envelope', 'anchor_registry', 'anchor_table',
  'anchor_view', 'anchor_declarations', 'anchor_origin', 'claim_copy', 'claim_owner', 'claim_source',
  'claim_anchor', 'claim_receiver', 'claim_brand', 'claim_state',
  ...(['pending', 'holder', 'failure'] as const).flatMap(role =>
    ['copy', 'role', 'owner', 'source', 'anchor', 'claim', 'receiver', 'payload'].map(field => `${role}_${field}`))]);

class SupplyTransferPreflight {
  readonly #owner = Object.freeze({}); readonly #receiver = Object.freeze({});
  readonly #source: CanonicalSupplyAssembly;
  #state: 'unused' | 'preparing' | 'prepared' | 'rejected' | 'closed' | 'terminal' = 'unused';
  #first: TransferReason = 'none'; #stop: 'none' | 'supply_closed' = 'none';
  #anchor: SupplyIssuanceAnchor | undefined; #issuedAnchor: SupplyIssuanceAnchor | undefined;
  #claim: NonExecutingSupplyTransfer | undefined; #issuedClaim: NonExecutingSupplyTransfer | undefined;
  #shells: Partial<Record<ShellRole, EmptyTransferShell>> = {};
  #issuedShells: Partial<Record<ShellRole, EmptyTransferShell>> = {};
  #anchorRetiredWithBorrowLive: boolean | undefined;
  #terminal: ReturnType<SupplyTransferPreflight['snapshot']> | undefined;
  readonly #counts = { preparationStarts: 0, anchors: 0, claimsIssued: 0, claimsConsumed: 0,
    pendingShells: 0, holderShells: 0, failureShells: 0, preChecks: 0, sourceDetaches: 0, holderPublications: 0,
    open: 0, read: 0, hash: 0, cleanup: 0 };
  constructor(private readonly scenario: string, admitted: boolean) {
    this.#source = new CanonicalSupplyAssembly(scenario === 'source_failure' ? 'table_failure' : 'normal', admitted);
  }
  private reply(reason?: Exclude<TransferReason, 'none'> | 'read_already_used') {
    return Object.freeze(reason ? { ...TRANSFER_CLOSED, ok: false, reason } : { ...TRANSFER_CLOSED, ok: true });
  }
  private clearPreparatory(): void {
    if (this.#anchor || this.#issuedAnchor) this.#anchorRetiredWithBorrowLive = this.#source.inspect().root.retainedBorrow;
    this.#shells = {}; this.#issuedShells = {}; this.#claim = undefined; this.#issuedClaim = undefined;
    this.#anchor = undefined; this.#issuedAnchor = undefined;
  }
  private reject(reason: Exclude<TransferReason, 'none'>) {
    if (this.#first === 'none') this.#first = reason;
    // Pre-consumption only: source still owns every normal payload reference.
    if (reason !== 'source_rejected' && reason !== 'supply_closed') supplyTransferAccess.fail(this.#source,
      reason === 'transfer_prepare_unavailable' ? 'supply_prepare_unavailable' : 'binding_mismatch');
    this.clearPreparatory(); this.#state = 'rejected'; return this.reply(this.#first);
  }
  private fault(point: string): void { if (this.scenario === `${point}_failure`) throw Error('synthetic_preflight'); }
  private probe(): void {
    const a = this.#anchor!, c = this.#claim!;
    const foreign = Object.freeze({});
    const anchorField = this.scenario.slice('anchor_'.length);
    if (this.scenario.startsWith('anchor_')) {
      const patch: Partial<SupplyIssuanceAnchor> = anchorField === 'owner' ? { transferOwner: foreign }
        : anchorField === 'source' ? { sourceOwner: foreign as CanonicalSupplyAssembly }
        : anchorField === 'envelope' ? { envelope: Object.freeze({ ...a.envelope }) }
        : anchorField === 'registry' ? { registry: Object.freeze([...a.registry]) }
        : anchorField === 'table' ? { table: Object.freeze({ ...a.table }) }
        : anchorField === 'view' ? { view: Object.freeze({ ...a.view }) }
        : anchorField === 'declarations' ? { declarations: Object.freeze([...a.declarations]) }
        : anchorField === 'origin' ? { tableOrigin: foreign } : {};
      this.#anchor = Object.freeze({ ...a, ...patch });
      // All other references remain consistent; only the targeted issuer fact differs.
      if (anchorField !== 'copy') this.#issuedAnchor = this.#anchor;
      this.#claim = Object.freeze({ ...c, anchor: this.#anchor }); this.#issuedClaim = this.#claim;
      for (const role of ['pending', 'holder', 'failure'] as const) {
        this.#shells[role] = Object.freeze({ ...this.#shells[role]!, anchor: this.#anchor, claim: this.#claim });
        this.#issuedShells[role] = this.#shells[role];
      }
    }
    if (this.scenario.startsWith('claim_')) {
      const field = this.scenario.slice(6);
      const patch = field === 'owner' ? { owner: foreign } : field === 'source' ? { source: foreign }
        : field === 'anchor' ? { anchor: Object.freeze({ ...a }) } : field === 'receiver' ? { receiver: foreign }
        : field === 'brand' ? { [TRANSFER_BRAND]: false } : field === 'state' ? { state: 'spent' } : {};
      this.#claim = Object.freeze({ ...c, ...patch }) as NonExecutingSupplyTransfer;
      if (field !== 'copy') this.#issuedClaim = this.#claim;
      for (const role of ['pending', 'holder', 'failure'] as const) {
        this.#shells[role] = Object.freeze({ ...this.#shells[role]!, claim: this.#claim });
        this.#issuedShells[role] = this.#shells[role];
      }
    }
    for (const role of ['pending', 'holder', 'failure'] as const) {
      if (!this.scenario.startsWith(`${role}_`)) continue;
      const field = this.scenario.slice(role.length + 1);
      const patch = field === 'role' ? { role: 'foreign' } : field === 'owner' ? { owner: foreign }
        : field === 'source' ? { source: foreign } : field === 'anchor' ? { anchor: Object.freeze({ ...a }) }
        : field === 'claim' ? { claim: Object.freeze({ ...c }) } : field === 'receiver' ? { receiver: foreign }
        : field === 'payload' ? { payload: a.table } : {};
      this.#shells[role] = Object.freeze({ ...this.#shells[role]!, ...patch }) as EmptyTransferShell;
      if (field !== 'copy') this.#issuedShells[role] = this.#shells[role];
    }
  }
  private valid(): boolean {
    this.#counts.preChecks++;
    const a = this.#anchor, c = this.#claim;
    if (!a || a !== this.#issuedAnchor || a.transferOwner !== this.#owner
      || !supplyTransferAccess.matches(this.#source, a) || !c || c !== this.#issuedClaim
      || c[TRANSFER_BRAND] !== true || c.owner !== this.#owner || c.source !== this.#source
      || c.anchor !== a || c.receiver !== this.#receiver || c.state !== 'unused') return false;
    for (const role of ['pending', 'holder', 'failure'] as const) {
      const shell = this.#shells[role];
      if (!shell || shell !== this.#issuedShells[role] || shell.role !== role || shell.owner !== this.#owner
        || shell.source !== this.#source || shell.anchor !== a || shell.claim !== c
        || shell.receiver !== this.#receiver || shell.payload !== undefined) return false;
    }
    return true;
  }
  prepare() {
    if (this.#terminal) return this.reply('read_already_used');
    if (this.#first !== 'none') return this.reply(this.#first);
    if (this.#stop !== 'none') return this.reject('supply_closed');
    if (this.#state !== 'unused') return this.reject('duplicate_transfer_preparation');
    this.#state = 'preparing'; this.#counts.preparationStarts++;
    if (!this.#source.begin().ok || !this.#source.prepare().ok || !this.#source.prepareSupply().ok) return this.reject('source_rejected');
    if (this.scenario === 'source_closed') { this.close(); return this.reply('supply_closed'); }
    try {
      // Shell storage is preallocated above; all payload slots stay empty in this stage.
      this.fault('anchor');
      this.#anchor = supplyTransferAccess.capture(this.#source, this.#owner); this.#issuedAnchor = this.#anchor;
      if (!this.#anchor) return this.reject('binding_mismatch');
      this.#counts.anchors++;
      this.fault('claim');
      this.#claim = Object.freeze<NonExecutingSupplyTransfer>({ [TRANSFER_BRAND]: true, owner: this.#owner, source: this.#source,
        anchor: this.#anchor, receiver: this.#receiver, state: 'unused' }); this.#issuedClaim = this.#claim;
      this.#counts.claimsIssued++;
      for (const role of ['pending', 'holder', 'failure'] as const) {
        this.fault(role);
        this.#shells[role] = Object.freeze({ role, owner: this.#owner, source: this.#source,
          anchor: this.#anchor, claim: this.#claim, receiver: this.#receiver, payload: undefined });
        this.#issuedShells[role] = this.#shells[role]; this.#counts[`${role}Shells`]++;
      }
      if (this.scenario === 'close_before_pre') { this.close(); return this.reply('supply_closed'); }
      this.fault('pre'); this.probe();
      if (!this.valid()) return this.reject('binding_mismatch');
      this.#state = 'prepared'; return this.reply();
    } catch { return this.reject('transfer_prepare_unavailable'); }
  }
  close() {
    if (this.#terminal) return this.reply('read_already_used');
    this.#stop = 'supply_closed'; this.#source.close();
    // Like the source owner, a close before any preparation start is a stop only, not a first diagnosis.
    if (this.#counts.preparationStarts && this.#first === 'none') this.#first = 'supply_closed';
    this.clearPreparatory(); this.#state = 'closed';
    return this.reply('supply_closed');
  }
  rejectArguments() { return this.#terminal ? this.reply('read_already_used') : this.reject('binding_mismatch'); }
  private snapshot() {
    return Object.freeze({ ...TRANSFER_CLOSED, state: this.#state, firstReason: this.#first, stopReason: this.#stop,
      claimState: this.#claim?.state ?? (this.#counts.claimsIssued ? 'retired_unused' : 'not_issued'),
      retainedAnchor: !!this.#anchor || !!this.#issuedAnchor, retainedClaim: !!this.#claim || !!this.#issuedClaim,
      retainedShells: (['pending', 'holder', 'failure'] as const).filter(role => this.#shells[role] || this.#issuedShells[role]).length,
      anchorRetiredWithBorrowLive: this.#anchorRetiredWithBorrowLive,
      emptyShells: Object.values(this.#shells).filter(s => s.payload === undefined).length,
      payloadSlots: Object.values(this.#shells).filter(s => s.payload !== undefined).length,
      counts: Object.freeze({ ...this.#counts }), source: this.#source.inspect() });
  }
  inspect() { return this.#terminal ?? this.snapshot(); }
  finish() {
    if (this.#terminal) return this.#terminal;
    this.clearPreparatory(); this.#source.finish(); this.#state = 'terminal';
    this.#terminal = this.snapshot(); return this.#terminal;
  }
}
export function createCanonicalSupplyTransferFake(...args: readonly unknown[]) {
  const input = args.length === 0 ? 'normal' : args[0];
  const admitted = args.length <= 1 && typeof input === 'string' && transferScenarios.includes(input);
  const a = new SupplyTransferPreflight(admitted ? input as string : 'normal', admitted);
  return Object.freeze({ prepare: (...input: readonly unknown[]) => input.length ? a.rejectArguments() : a.prepare(),
    close: () => a.close(), finish: () => a.finish(), inspect: () => a.inspect() });
}

/** Relation-only check: no source owner, live context, Borrow.matches, gate or clock read. */
function inspectPayloadRelation(anchor: SupplyIssuanceAnchor, p: PreparedSupplyPayload): boolean {
  if (p.envelope !== anchor.envelope || p.registry !== anchor.registry || p.table !== anchor.table
    || p.view !== anchor.view || p.declarations !== anchor.declarations || p.tableOrigin !== anchor.tableOrigin
    || p.table.envelope !== p.envelope || p.view.envelope !== p.envelope || p.view.table !== p.table
    || p.table.origin !== p.tableOrigin || p.view.declarations !== p.declarations) return false;
  const files = anchor.envelope.files;
  if (p.registry.length !== files.length || p.table.bindings.length !== files.length
    || p.declarations.length !== files.length || files.length > 32 || anchor.envelope.rows.length !== 12) return false;
  const origins = new Set<object>();
  for (let ordinal = 0; ordinal < files.length; ordinal++) {
    const entry = p.registry[ordinal], link = p.table.bindings[ordinal], decl = p.declarations[ordinal], canonical = files[ordinal];
    if (entry.file !== canonical || entry.ordinal !== ordinal || origins.has(entry.origin)
      || entry.source.origin !== entry.origin || !validRecord(entry.source)
      || entry.source.bytes.length > canonical.expectedBytes + 1 || link.file !== canonical || link.ordinal !== ordinal
      || link.tableOrigin !== p.tableOrigin || link.origin !== entry.origin || link.source !== entry.source
      || decl.file !== canonical || decl.ordinal !== ordinal || decl.binding !== link) return false;
    origins.add(entry.origin);
  }
  return true;
}
const relationValueCases = Object.freeze(['rebuild_control', 'table_envelope', 'view_envelope', 'view_table', 'table_origin',
  'view_declarations', 'registry_count', 'binding_count', 'declaration_count', 'registry_file', 'registry_ordinal',
  'duplicate_origin', 'record_origin', 'record_shape', 'record_size', 'link_file', 'link_ordinal', 'link_origin',
  'link_table_origin', 'link_source', 'declaration_file', 'declaration_ordinal', 'declaration_binding']);
/** Fixed value controls only: these reconstructed pairs are never installed as issuance/normal slots. */
function probeRelationValues(original: SupplyIssuanceAnchor, scenario: string): boolean {
  const field = scenario.slice('value_'.length), foreign = Object.freeze({});
  let entries = original.registry, links = original.table.bindings, decls = original.declarations;
  const replace = <T>(items: readonly T[], value: T, at = 0) => Object.freeze(items.map((x, i) => i === at ? value : x));
  if (field === 'rebuild_control') {
    entries = Object.freeze(entries.map(x => Object.freeze({ ...x, source: Object.freeze({ ...x.source }) })));
    links = Object.freeze(entries.map(x => Object.freeze({ ...x, tableOrigin: original.tableOrigin })));
    decls = Object.freeze(links.map(x => Object.freeze({ file: x.file, ordinal: x.ordinal, binding: x })));
  }
  if (field === 'registry_count') entries = Object.freeze(entries.slice(0, -1));
  if (field === 'binding_count') links = Object.freeze(links.slice(0, -1));
  if (field === 'declaration_count') decls = Object.freeze(decls.slice(0, -1));
  if (field === 'registry_file') entries = replace(entries, Object.freeze({ ...entries[0], file: Object.freeze({ ...entries[0].file }) }));
  if (field === 'registry_ordinal') entries = replace(entries, Object.freeze({ ...entries[0], ordinal: 1 }));
  if (['duplicate_origin', 'record_origin', 'record_shape', 'record_size'].includes(field)) {
    const at = field === 'duplicate_origin' ? 1 : 0;
    const entry = entries[at], origin = field === 'duplicate_origin' ? entries[0].origin : entry.origin;
    const patch = field === 'record_shape' ? { maxReturn: 0 }
      : field === 'record_size' ? { bytes: Object.freeze([97, 98, 99, 100, 101]), initialLength: 5 }
        : { origin: field === 'record_origin' ? foreign : origin };
    const source = Object.freeze({ ...entry.source, ...patch });
    entries = replace(entries, Object.freeze({ ...entry, origin, source }), at);
    const link = Object.freeze({ ...links[at], origin, source }); links = replace(links, link, at);
    decls = replace(decls, Object.freeze({ ...decls[at], binding: link }), at);
  }
  if (field.startsWith('link_')) {
    const patch = field === 'link_file' ? { file: Object.freeze({ ...links[0].file }) }
      : field === 'link_ordinal' ? { ordinal: 1 } : field === 'link_origin' ? { origin: foreign }
        : field === 'link_table_origin' ? { tableOrigin: foreign } : { source: Object.freeze({ ...links[0].source }) };
    const link = Object.freeze({ ...links[0], ...patch }); links = replace(links, link);
    decls = replace(decls, Object.freeze({ ...decls[0], binding: link }));
  }
  if (field.startsWith('declaration_') && field !== 'declaration_count') {
    const patch = field === 'declaration_file' ? { file: Object.freeze({ ...decls[0].file }) }
      : field === 'declaration_ordinal' ? { ordinal: 1 } : { binding: Object.freeze({ ...decls[0].binding }) };
    decls = replace(decls, Object.freeze({ ...decls[0], ...patch }));
  }
  const envelopeCopy = Object.freeze({ ...original.envelope });
  const table: CanonicalPayloadTable = Object.freeze({ envelope: field === 'table_envelope' ? envelopeCopy : original.envelope,
    origin: field === 'table_origin' ? foreign : original.tableOrigin, bindings: links });
  const view: NonExecutingSupplyView = Object.freeze({ envelope: field === 'view_envelope' ? envelopeCopy : original.envelope,
    table: field === 'view_table' ? Object.freeze({ ...table }) : table,
    declarations: field === 'view_declarations' ? Object.freeze([...decls]) : decls });
  const anchor = Object.freeze({ ...original, registry: entries, table, view, declarations: decls });
  const payload = Object.freeze({ envelope: original.envelope, registry: entries, table, view, declarations: decls, tableOrigin: original.tableOrigin });
  return inspectPayloadRelation(anchor, payload);
}
const BOUNDARY_SCENARIOS = Object.freeze(['normal', 'control_stop_only', 'control_copy', 'duplicate_bind',
  'close_before_relation', 'failure_before_relation', 'payload_copy', 'anchor_copy', 'envelope_copy',
  'registry_copy', 'table_copy', 'view_copy', 'declarations_copy', 'table_origin', 'source_short',
  'source_begin_stopped', 'source_prepare_stopped', 'source_supply_stopped',
  ...relationValueCases.map(field => `value_${field}`)]);
const BOUNDARY_CLOSED = Object.freeze({ ...CLOSED, model: 'wfb-unused-control-boundary-fake-1',
  claimsConsumed: 0, sourceDetaches: 0, holderPublications: 0, cExecution: 'not_connected',
  cleanupDisposition: 'not_started', retirement: 'not_started', actualBudget: 'not_connected' } as const);
class SupplyBoundaryAssembly {
  readonly #owner = Object.freeze({}); readonly #source: CanonicalSupplyAssembly;
  #anchor: SupplyIssuanceAnchor | undefined; #issuedAnchor: SupplyIssuanceAnchor | undefined;
  #payload: PreparedSupplyPayload | undefined; #issuedPayload: PreparedSupplyPayload | undefined;
  #control: SupplyUseControl | undefined; #issuedControl: SupplyUseControl | undefined;
  #prepared = false; #started = false; #closed = false;
  #first: 'none' | 'binding_mismatch' | 'source_rejected' | 'supply_closed' = 'none';
  #relationChecks = 0; #lastRelation: 'not_checked' | 'matched' | 'rejected' = 'not_checked';
  #sourceProbe: 'not_called' | 'blocked' | 'not_blocked' = 'not_called';
  constructor(private readonly scenario: string, admitted: boolean) {
    this.#source = new CanonicalSupplyAssembly(scenario === 'source_short' ? scenario : 'normal', admitted);
  }
  private reply(reason?: 'binding_mismatch' | 'source_rejected' | 'supply_closed') {
    return Object.freeze(reason ? { ...BOUNDARY_CLOSED, ok: false, reason } : { ...BOUNDARY_CLOSED, ok: true });
  }
  private failBinding() {
    if (this.#first === 'none') this.#first = 'binding_mismatch';
    // Before a bound control nothing was issued, so the existing pre-consumption fail+clear contract applies.
    if (this.#issuedControl) boundaryStop(this.#source, this.#issuedControl, 'failure');
    else supplyTransferAccess.fail(this.#source, 'binding_mismatch');
    return this.reply(this.#first);
  }
  prepare() {
    if (this.#first !== 'none') return this.reply(this.#first);
    if (this.#closed) return this.reply('supply_closed');
    if (this.#started) return this.failBinding();
    this.#started = true;
    if (!this.#source.begin().ok || !this.#source.prepare().ok || !this.#source.prepareSupply().ok) {
      this.#first = 'source_rejected'; return this.reply(this.#first);
    }
    this.#anchor = supplyTransferAccess.capture(this.#source, this.#owner); this.#issuedAnchor = this.#anchor;
    if (!this.#anchor) return this.failBinding();
    const a = this.#anchor;
    this.#payload = Object.freeze({ envelope: a.envelope, registry: a.registry, table: a.table,
      view: a.view, declarations: a.declarations, tableOrigin: a.tableOrigin }); this.#issuedPayload = this.#payload;
    const claim = Object.freeze<NonExecutingSupplyTransfer>({ [TRANSFER_BRAND]: true, owner: this.#owner,
      source: this.#source, anchor: a, receiver: Object.freeze({}), state: 'unused' });
    this.#control = new SupplyUseControl(this.#owner, this.#source, a, claim);
    if (!boundarySourceAccess.bind(this.#source, this.#control)) return this.failBinding();
    this.#issuedControl = this.#control;
    this.#prepared = true;
    if (this.scenario === 'control_stop_only') this.#control.stop('supply_closed');
    if (this.scenario.startsWith('source_') && this.scenario.endsWith('_stopped')) {
      this.#control.stop('supply_closed');
      const result = this.scenario === 'source_begin_stopped' ? this.#source.begin()
        : this.scenario === 'source_prepare_stopped' ? this.#source.prepare() : this.#source.prepareSupply();
      this.#sourceProbe = !result.ok && result.reason === 'supply_closed' ? 'blocked' : 'not_blocked';
    }
    if (this.scenario === 'control_copy') this.#control = new SupplyUseControl(this.#owner, this.#source, a, claim);
    if (this.scenario === 'duplicate_bind' && !boundarySourceAccess.bind(this.#source, this.#control)) return this.failBinding();
    if (this.scenario === 'close_before_relation') this.close();
    if (this.scenario === 'failure_before_relation') this.failBinding();
    this.probePayload();
    return this.#first !== 'none' ? this.reply(this.#first) : this.#closed ? this.reply('supply_closed') : this.reply();
  }
  private probePayload(): void {
    const p = this.#payload!;
    if (this.scenario === 'anchor_copy') this.#anchor = Object.freeze({ ...this.#anchor! });
    const patch = this.scenario === 'envelope_copy' ? { envelope: Object.freeze({ ...p.envelope }) }
      : this.scenario === 'registry_copy' ? { registry: Object.freeze([...p.registry]) }
      : this.scenario === 'table_copy' ? { table: Object.freeze({ ...p.table }) }
      : this.scenario === 'view_copy' ? { view: Object.freeze({ ...p.view }) }
      : this.scenario === 'declarations_copy' ? { declarations: Object.freeze([...p.declarations]) }
      : this.scenario === 'table_origin' ? { tableOrigin: Object.freeze({}) } : undefined;
    if (patch || this.scenario === 'payload_copy') {
      this.#payload = Object.freeze({ ...p, ...patch });
      if (patch) this.#issuedPayload = this.#payload;
    }
  }
  checkNormal() {
    if (this.#first !== 'none') return this.reply(this.#first);
    if (this.#closed || this.#control?.state === 'stopped') return this.reply('supply_closed');
    return this.#prepared && this.#control && boundarySourceAccess.normal(this.#source, this.#control)
      ? this.reply() : this.failBinding();
  }
  checkRelation() {
    // A stopped root still needs identity for eventual fixed discard; this is not normal admission.
    if (this.#lastRelation !== 'not_checked') return this.#lastRelation === 'matched' ? this.reply() : this.reply('binding_mismatch');
    const ok = !!this.#control && this.#control === this.#issuedControl
      && !!this.#anchor && this.#anchor === this.#issuedAnchor && !!this.#payload
      && this.#payload === this.#issuedPayload && (this.scenario.startsWith('value_')
        ? probeRelationValues(this.#anchor, this.scenario) : inspectPayloadRelation(this.#anchor, this.#payload));
    this.#relationChecks++; this.#lastRelation = ok ? 'matched' : 'rejected';
    return ok ? this.reply() : this.failBinding();
  }
  close() {
    this.#closed = true;
    if (this.#started && this.#first === 'none') this.#first = 'supply_closed';
    if (this.#issuedControl) boundaryStop(this.#source, this.#issuedControl, 'close');
    else this.#source.close();
    return this.reply(this.#first !== 'none' ? this.#first : 'supply_closed');
  }
  fail() { return this.failBinding(); }
  rejectArguments() { return this.failBinding(); }
  inspect() {
    return Object.freeze({ ...BOUNDARY_CLOSED, firstReason: this.#first, closeRequested: this.#closed,
      prepared: this.#prepared, controlState: this.#issuedControl?.state ?? 'not_bound',
      controlMatches: !!this.#control && this.#control === this.#issuedControl, valueOnlyProbe: this.scenario.startsWith('value_'),
      retainedAnchor: !!this.#anchor || !!this.#issuedAnchor, retainedPayload: !!this.#payload || !!this.#issuedPayload,
      sourceNormalAllowed: this.#prepared && this.#source.check().ok,
      sourceProbe: this.#sourceProbe,
      legacyMatches: !!this.#issuedAnchor && supplyTransferAccess.matches(this.#source, this.#issuedAnchor),
      relationChecks: this.#relationChecks, lastRelation: this.#lastRelation, source: this.#source.inspect() });
  }
}
export function createSupplyBoundaryFake(...args: readonly unknown[]) {
  const input = args.length === 0 ? 'normal' : args[0];
  const admitted = args.length <= 1 && typeof input === 'string' && BOUNDARY_SCENARIOS.includes(input);
  const a = new SupplyBoundaryAssembly(admitted ? input as string : 'normal', admitted);
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => xs.length ? a.rejectArguments() : a.prepare(),
    checkNormal: (...xs: readonly unknown[]) => xs.length ? a.rejectArguments() : a.checkNormal(),
    checkRelation: (...xs: readonly unknown[]) => xs.length ? a.rejectArguments() : a.checkRelation(),
    close: () => a.close(), fail: () => a.fail(), inspect: () => a.inspect() });
}

interface PendingScopeContext { readonly owner: PendingRetentionRoot; readonly construction: ConstructionOrigin;
  readonly retention: RetentionOrigin; readonly slots: readonly UnboundSlot[] }
let pendingConstructionAccess: (a: PendingRetentionRoot) => PendingScopeContext | undefined;
// BEGIN PENDING CONSTRUCTION CORE
/** Isolated synthetic construction only: no source, payload, binding, retirement or root operations. */
const CONSTRUCTION: unique symbol = Symbol('construction');
const RETENTION: unique symbol = Symbol('retention');
const SLOT: unique symbol = Symbol('unbound-slot');
type ConstructionOrigin = Readonly<{ [CONSTRUCTION]: true }>;
type RetentionOrigin = Readonly<{ [RETENTION]: true }>;
const PENDING_ROLES = Object.freeze(['pendingShell', 'pendingActive', 'failureShell', 'failureCustody'] as const);
type PendingRole = typeof PENDING_ROLES[number];
type PendingReason = 'none' | 'binding_mismatch' | 'duplicate_generation' | 'supply_closed' | 'generation_unavailable' | 'capture_unconfirmed';
interface UnboundSlot {
  readonly [SLOT]: true; readonly construction: ConstructionOrigin; readonly retention: RetentionOrigin;
  readonly origin: object; readonly role: PendingRole; readonly state: 'unbound';
  readonly parent: UnboundSlot | undefined; readonly payload: undefined;
}
type Capture = 'not_started' | 'not_created' | 'attempting' | 'provisional' | 'confirmed';
interface CaptureCell { stage: Capture; value: UnboundSlot | undefined }
class PendingGenerationClaim {
  #spent = false;
  constructor(readonly construction: ConstructionOrigin, readonly retention: RetentionOrigin) { Object.freeze(this); }
  get spent() { return this.#spent; }
  begin(): boolean { if (this.#spent) return false; this.#spent = true; return true; }
}
const PENDING_CLOSED = Object.freeze({ model: 'wfb-pending-construction-fake-1', authority: 'none', ready: false,
  formalIssuance: 'closed', wholeRunAdmission: 'disabled', implementation: 'unknown', nativeCost: 'unknown',
  entryRequirement: 'unknown', seedRequirement: 'unknown', investigations: 'on_hold',
  source: 'not_created', sourceBinding: 'not_connected', payloadMoves: 0, claimsConsumed: 0, sourceDetaches: 0,
  holderPublications: 0, proofIssuance: 'closed', rootFinish: 'not_called', retirement: 'not_started',
  resourceCleanup: 'not_started', actualBudget: 'not_connected' } as const);
type PendingState = 'unused' | 'generating' | 'prepared_unbound' | 'rejected' | 'closed' | 'sealed';
type PendingSnapshot = Readonly<typeof PENDING_CLOSED & { state: PendingState; firstReason: PendingReason; closeRequested: boolean;
  inputValid: boolean;
  generationClaim: 'spent' | 'unused'; diagnosticSlot: 'ready'; resultSlot: 'sealed' | 'empty';
  retainedSlots: number; confirmedSlots: number; generationStarts: number;
  parentLinks: Readonly<Record<PendingRole, 'none' | 'own_shell' | 'absent' | 'mismatch'>>;
  scopeOriginsDistinct: boolean; roleOriginsDistinct: boolean; sealedFrom?: PendingState;
  stages: readonly Readonly<{ role: PendingRole; stage: Capture; retained: boolean }>[] }>;
const MIX_FIELDS = ['construction', 'retention', 'origin', 'role', 'state', 'brand', 'parent', 'payload', 'copy'] as const;
const PENDING_SCENARIOS = Object.freeze(['normal', 'claim_copy', 'claim_construction', 'claim_retention',
  'diagnostic_construction', 'diagnostic_retention', 'result_construction', 'result_retention',
  ...PENDING_ROLES.flatMap(role => [`mint_${role}_failure`, `attempt_${role}_failure`, `capture_${role}_failure`,
    `close_after_${role}`, `reenter_after_${role}`,
  ...MIX_FIELDS.map(field => `mix_${role}_${field}`)])]);

class PendingRetentionRoot {
  readonly #construction = Object.freeze<ConstructionOrigin>({ [CONSTRUCTION]: true });
  readonly #origin = Object.freeze<RetentionOrigin>({ [RETENTION]: true });
  readonly #claim: PendingGenerationClaim;
  readonly #origins = Object.freeze({ pendingShell: Object.freeze({}), pendingActive: Object.freeze({}),
    failureShell: Object.freeze({}), failureCustody: Object.freeze({}) });
  readonly #cells: Record<PendingRole, CaptureCell> = {
    pendingShell: { stage: 'not_started', value: undefined }, pendingActive: { stage: 'not_started', value: undefined },
    failureShell: { stage: 'not_started', value: undefined }, failureCustody: { stage: 'not_started', value: undefined },
  };
  readonly #diagnostic = { construction: this.#construction, retention: this.#origin,
    first: 'none' as PendingReason, stop: false, state: 'unused' as PendingState };
  readonly #result = { construction: this.#construction, retention: this.#origin,
    value: undefined as PendingSnapshot | undefined };
  static {
    pendingConstructionAccess = a => {
      if (a.#result.value || a.#diagnostic.first !== 'none' || a.#diagnostic.stop
        || a.#diagnostic.state !== 'prepared_unbound' || !a.#claim.spent || !a.scopeMatches()) return undefined;
      const c = a.#cells;
      for (const role of PENDING_ROLES) if (c[role].stage !== 'confirmed' || !c[role].value || !a.matches(role, c[role].value!)) return undefined;
      if (c.pendingShell.value!.parent !== undefined || c.failureShell.value!.parent !== undefined
        || c.pendingActive.value!.parent !== c.pendingShell.value || c.failureCustody.value!.parent !== c.failureShell.value) return undefined;
      const slots = Object.freeze(PENDING_ROLES.map(role => c[role].value!));
      if (new Set(slots.map(s => s.origin)).size !== 4 || (a.#construction as object) === (a.#origin as object)) return undefined;
      return Object.freeze({ owner: a, construction: a.#construction, retention: a.#origin, slots });
    };
  }
  constructor(private readonly scenario: string, private readonly admitted: boolean) {
    this.#claim = new PendingGenerationClaim(scenario === 'claim_construction' ? Object.freeze({ ...this.#construction }) : this.#construction,
      scenario === 'claim_retention' ? Object.freeze({ ...this.#origin }) : this.#origin);
    if (scenario === 'diagnostic_construction') this.#diagnostic.construction = Object.freeze({ ...this.#construction });
    if (scenario === 'diagnostic_retention') this.#diagnostic.retention = Object.freeze({ ...this.#origin });
    if (scenario === 'result_construction') this.#result.construction = Object.freeze({ ...this.#construction });
    if (scenario === 'result_retention') this.#result.retention = Object.freeze({ ...this.#origin });
    if (!admitted) this.reject('binding_mismatch');
  }
  private scopeMatches(): boolean {
    return this.#diagnostic.construction === this.#construction && this.#diagnostic.retention === this.#origin
      && this.#result.construction === this.#construction && this.#result.retention === this.#origin;
  }
  private reply(reason?: Exclude<PendingReason, 'none'> | 'already_sealed') {
    return Object.freeze(reason ? { ...PENDING_CLOSED, ok: false, reason } : { ...PENDING_CLOSED, ok: true });
  }
  private reject(reason: Exclude<PendingReason, 'none'>) {
    if (this.#diagnostic.first === 'none') this.#diagnostic.first = reason;
    this.#diagnostic.state = 'rejected'; return this.reply(this.#diagnostic.first as Exclude<PendingReason, 'none'>);
  }
  private parent(role: PendingRole): UnboundSlot | undefined {
    return role === 'pendingActive' ? this.#cells.pendingShell.value
      : role === 'failureCustody' ? this.#cells.failureShell.value : undefined;
  }
  private mint(role: PendingRole): UnboundSlot {
    if (this.scenario === `attempt_${role}_failure`) throw new Error('synthetic_attempt_unconfirmed');
    const slot: UnboundSlot = Object.freeze({ [SLOT]: true as const, construction: this.#construction, retention: this.#origin,
      origin: this.#origins[role], role, state: 'unbound' as const, parent: this.parent(role), payload: undefined });
    if (!this.scenario.startsWith(`mix_${role}_`)) return slot;
    const field = this.scenario.slice(`mix_${role}_`.length), foreign = Object.freeze({});
    const patch = field === 'construction' ? { construction: Object.freeze({ ...slot.construction }) }
      : field === 'retention' ? { retention: Object.freeze({ ...slot.retention }) }
        : field === 'origin' ? { origin: foreign } : field === 'role' ? { role: 'foreign' }
          : field === 'state' ? { state: 'bound' } : field === 'brand' ? { [SLOT]: false }
            : field === 'parent' ? { parent: slot.parent ? Object.freeze({ ...slot.parent }) : foreign }
              : field === 'payload' ? { payload: foreign } : undefined;
    // Fixed malformed issuance controls only; no caller values or actual payload are accepted.
    return patch ? Object.freeze({ ...slot, ...patch }) as unknown as UnboundSlot : slot;
  }
  private matches(role: PendingRole, value: UnboundSlot): boolean {
    return value === this.#cells[role].value && value[SLOT] === true && value.construction === this.#construction
      && value.retention === this.#origin && value.origin === this.#origins[role] && value.role === role
      && value.state === 'unbound' && value.payload === undefined && value.parent === this.parent(role);
  }
  prepare() {
    if (this.#result.value) return this.reply('already_sealed');
    if (this.#diagnostic.first !== 'none') return this.reply(this.#diagnostic.first);
    if (this.#diagnostic.stop) return this.reply('supply_closed');
    if (!this.scopeMatches()) return this.reject('binding_mismatch');
    const claim = this.scenario === 'claim_copy' ? new PendingGenerationClaim(this.#construction, this.#origin) : this.#claim;
    if (claim !== this.#claim || claim.construction !== this.#construction || claim.retention !== this.#origin) return this.reject('binding_mismatch');
    if (!claim.begin()) return this.reject('duplicate_generation');
    this.#diagnostic.state = 'generating';
    for (const role of PENDING_ROLES) {
      const cell = this.#cells[role]; cell.stage = 'attempting';
      if (this.scenario === `mint_${role}_failure`) { cell.stage = 'not_created'; return this.reject('generation_unavailable'); }
      try { cell.value = this.mint(role); }
      catch { return this.reject('capture_unconfirmed'); }
      cell.stage = 'provisional';
      if (this.scenario === `capture_${role}_failure`) return this.reject('capture_unconfirmed');
      const candidate = this.scenario === `mix_${role}_copy` ? Object.freeze({ ...cell.value }) : cell.value;
      if (!this.matches(role, candidate)) return this.reject('binding_mismatch');
      cell.stage = 'confirmed';
      if (this.scenario === `close_after_${role}`) { this.close(); return this.reply('supply_closed'); }
      if (this.scenario === `reenter_after_${role}`) {
        this.prepare(); return this.reply(this.#diagnostic.first as Exclude<PendingReason, 'none'>);
      }
    }
    this.#diagnostic.state = 'prepared_unbound'; return this.reply();
  }
  close() {
    if (this.#result.value) return this.reply('already_sealed');
    this.#diagnostic.stop = true;
    if (this.#claim.spent && this.#diagnostic.first === 'none') this.#diagnostic.first = 'supply_closed';
    this.#diagnostic.state = 'closed';
    return this.reply(this.#diagnostic.first === 'none' ? 'supply_closed' : this.#diagnostic.first);
  }
  rejectArguments() { return this.#result.value ? this.reply('already_sealed') : this.reject('binding_mismatch'); }
  private snapshot(): PendingSnapshot {
    const stages = Object.freeze(PENDING_ROLES.map(role => Object.freeze({ role, stage: this.#cells[role].stage, retained: !!this.#cells[role].value })));
    // Read the captured cells directly (not parent()/#origins) so generation and checking cannot agree on a wrong link.
    const c = this.#cells;
    const link = (slot: UnboundSlot | undefined, shell: UnboundSlot | undefined) =>
      !slot ? 'absent' as const : shell && slot.parent === shell ? 'own_shell' as const : 'mismatch' as const;
    const unparented = (slot: UnboundSlot | undefined) => !slot ? 'absent' as const : slot.parent === undefined ? 'none' as const : 'mismatch' as const;
    const parentLinks = Object.freeze({ pendingShell: unparented(c.pendingShell.value), pendingActive: link(c.pendingActive.value, c.pendingShell.value),
      failureShell: unparented(c.failureShell.value), failureCustody: link(c.failureCustody.value, c.failureShell.value) });
    const held = PENDING_ROLES.map(role => c[role].value).filter((s): s is UnboundSlot => !!s);
    return Object.freeze({ ...PENDING_CLOSED, state: this.#diagnostic.state, firstReason: this.#diagnostic.first, inputValid: this.admitted,
      closeRequested: this.#diagnostic.stop, generationClaim: this.#claim.spent ? 'spent' as const : 'unused' as const,
      diagnosticSlot: 'ready' as const, resultSlot: this.#result.value ? 'sealed' as const : 'empty' as const,
      retainedSlots: stages.filter(s => s.retained).length, confirmedSlots: stages.filter(s => s.stage === 'confirmed').length,
      generationStarts: this.#claim.spent ? 1 : 0, stages, parentLinks,
      scopeOriginsDistinct: (this.#construction as object) !== (this.#origin as object),
      roleOriginsDistinct: new Set(held.map(s => s.origin)).size === held.length
        && new Set(Object.values(this.#origins)).size === PENDING_ROLES.length });
  }
  inspect() { return this.#result.value ?? this.snapshot(); }
  seal() {
    if (this.#result.value) return this.#result.value;
    if (!this.scopeMatches()) return this.reject('binding_mismatch');
    const sealedFrom = this.#diagnostic.state; this.#diagnostic.state = 'sealed';
    this.#result.value = Object.freeze({ ...this.snapshot(), resultSlot: 'sealed', sealedFrom }); return this.#result.value;
  }
}
export function createPendingConstructionFake(...args: readonly unknown[]) {
  const input = args.length === 0 ? 'normal' : args[0];
  const admitted = args.length <= 1 && typeof input === 'string' && PENDING_SCENARIOS.includes(input);
  const a = new PendingRetentionRoot(admitted ? input as string : 'normal', admitted);
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => xs.length ? a.rejectArguments() : a.prepare(),
    close: () => a.close(), seal: () => a.seal(), inspect: () => a.inspect() });
}
// END PENDING CONSTRUCTION CORE

interface PendingSourceSlot { readonly origin: object; stage: 'empty' | 'attempting' | 'captured' | 'unknown';
  value: CanonicalSupplyAssembly | undefined; identity: object | undefined }
interface PendingBindingReceipt { readonly construction: object; readonly retention: object;
  readonly sourceSlot: PendingSourceSlot; readonly control: SupplyUseControl; readonly core: SupplyControlCore;
  readonly slots: readonly UnboundSlot[] }
const PENDING_BINDING_CLOSED = Object.freeze({ ...CLOSED, model: 'wfb-pending-source-binding-fake-1',
  claimsConsumed: 0, payloadMoves: 0, sourceDetaches: 0, holderPublications: 0,
  proofIssuance: 'closed', rootFinish: 'not_called', retirement: 'not_started', resourceCleanup: 'not_started' } as const);
type PendingBindingReason = 'none' | 'binding_mismatch' | 'duplicate_binding' | 'source_rejected' | 'generation_unavailable' | 'supply_closed';
const PENDING_BINDING_SCENARIOS = Object.freeze(['normal', 'core_owner', 'core_construction', 'core_retention', 'core_source', 'core_claim', 'core_extra_payload',
  'receipt_copy', 'receipt_construction', 'receipt_retention', 'receipt_source_slot', 'receipt_control', 'receipt_core', 'receipt_slots',
  'anchor_copy', 'payload_copy', 'claim_copy', 'retire_binding', 'retire_binding_twice', 'retire_binding_with_claim_alias', 'retire_binding_with_control_alias', 'retire_binding_root_live',
  'source_failure', 'source_attempt_failure', 'before_source_failure', 'after_source_failure', 'before_bind_failure', 'after_bind_failure', 'close_before_bind', 'close_after_bind', 'reenter_before_bind']);
class PendingSourceBinding {
  readonly #retention: PendingRetentionRoot;
  readonly #sourceSlot: PendingSourceSlot = { origin: Object.freeze({}), stage: 'empty', value: undefined, identity: undefined };
  readonly #claimOrigin = Object.freeze({});
  #context: PendingScopeContext | undefined;
  #control: SupplyUseControl | undefined; #issuedControl: SupplyUseControl | undefined;
  #anchor: SupplyIssuanceAnchor | undefined; #issuedAnchor: SupplyIssuanceAnchor | undefined;
  #payload: PreparedSupplyPayload | undefined; #issuedPayload: PreparedSupplyPayload | undefined;
  #claim: NonExecutingSupplyTransfer | undefined; #issuedClaim: NonExecutingSupplyTransfer | undefined;
  #receipt: PendingBindingReceipt | undefined; #issuedReceipt: PendingBindingReceipt | undefined;
  #extraClaim: NonExecutingSupplyTransfer | undefined; #extraControl: SupplyUseControl | undefined;
  #bindingRetirements = 0;
  #retiredSourceAllowed: boolean | undefined;
  #attempts = 0; #bound = false; #closed = false;
  #first: PendingBindingReason = 'none';
  constructor(private readonly scenario: string, admitted: boolean) { this.#retention = new PendingRetentionRoot('normal', admitted); }
  private reply(reason?: Exclude<PendingBindingReason, 'none'>) {
    return Object.freeze(reason ? { ...PENDING_BINDING_CLOSED, ok: false, reason } : { ...PENDING_BINDING_CLOSED, ok: true });
  }
  private fail(reason: Exclude<PendingBindingReason, 'none'>) {
    if (this.#first === 'none') this.#first = reason;
    this.#issuedControl?.stop('binding_mismatch');
    if (this.#sourceSlot.value && this.#sourceSlot.identity) sourceStopOwned(this.#sourceSlot.value, this.#sourceSlot.identity, 'failure');
    return this.reply(this.#first);
  }
  private validReceipt(): boolean {
    const r = this.#receipt, scope = this.#context, control = this.#issuedControl, slot = this.#sourceSlot;
    if (!r || r !== this.#issuedReceipt || !scope || scope.owner !== this.#retention || !control || !slot.value || !slot.identity
      || r.construction !== scope.construction || r.retention !== scope.retention || r.sourceSlot !== slot
      || r.control !== control || r.core !== control.identity || r.slots !== scope.slots || r.slots.length !== 4) return false;
    const core = r.core, live = control.live();
    if (Object.keys(core).length !== 5 || core.owner !== scope.construction || core.construction !== scope.construction
      || core.retention !== scope.retention || core.source !== slot.identity || this.#claimOrigin !== core.claim
      || !live || live.source !== slot.value || live.anchor !== this.#issuedAnchor || live.claim !== this.#issuedClaim
      || this.#anchor !== this.#issuedAnchor || this.#payload !== this.#issuedPayload
      || this.#claim !== this.#issuedClaim || live.claim.receiver !== scope.slots[1].origin
      || !this.#anchor || !this.#payload || !inspectPayloadRelation(this.#anchor, this.#payload)) return false;
    return supplyTransferAccess.matches(slot.value, this.#anchor);
  }
  private probeCore(core: SupplyControlCore): SupplyControlCore {
    const foreign = Object.freeze({}), scope = this.#context!;
    switch (this.scenario) {
      case 'core_owner': return Object.freeze({ ...core, owner: foreign });
      case 'core_construction': return Object.freeze({ ...core, construction: Object.freeze({ ...scope.construction }) });
      case 'core_retention': return Object.freeze({ ...core, retention: Object.freeze({ ...scope.retention }) });
      case 'core_source': return Object.freeze({ ...core, source: this.#sourceSlot.value! });
      case 'core_claim': return Object.freeze({ ...core, claim: this.#claim! });
      case 'core_extra_payload': return Object.freeze({ ...core, payload: this.#payload });
      default: return core;
    }
  }
  private probeReceipt(): void {
    const r = this.#receipt!, foreign = Object.freeze({});
    const patch = this.scenario === 'receipt_construction' ? { construction: Object.freeze({ ...this.#context!.construction }) }
      : this.scenario === 'receipt_retention' ? { retention: foreign }
        : this.scenario === 'receipt_source_slot' ? { sourceSlot: { ...r.sourceSlot } }
          : this.scenario === 'receipt_control' ? { control: new SupplyUseControl(this.#context!.construction, this.#sourceSlot.value!, this.#anchor!, this.#claim!, r.core) }
            : this.scenario === 'receipt_core' ? { core: Object.freeze({ ...r.core }) }
              : this.scenario === 'receipt_slots' ? { slots: Object.freeze([...r.slots]) } : undefined;
    if (patch || this.scenario === 'receipt_copy') {
      this.#receipt = Object.freeze({ ...r, ...patch });
      if (patch) this.#issuedReceipt = this.#receipt;
    }
    if (this.scenario === 'anchor_copy') this.#anchor = Object.freeze({ ...this.#anchor! });
    if (this.scenario === 'payload_copy') this.#payload = Object.freeze({ ...this.#payload! });
    if (this.scenario === 'claim_copy') this.#claim = Object.freeze({ ...this.#claim! });
  }
  prepare() {
    if (this.#first !== 'none') return this.reply(this.#first);
    if (this.#closed) return this.reply('supply_closed');
    if (this.#attempts) return this.fail('duplicate_binding');
    if (!this.#retention.prepare().ok) return this.fail('binding_mismatch');
    this.#context = pendingConstructionAccess(this.#retention);
    if (!this.#context) return this.fail('binding_mismatch');
    this.#attempts = 1;
    try {
      if (this.scenario === 'before_source_failure') return this.fail('generation_unavailable');
      this.#sourceSlot.stage = 'attempting';
      if (this.scenario === 'source_attempt_failure') throw new Error('synthetic_source_unconfirmed');
      const source = new CanonicalSupplyAssembly(this.scenario === 'source_failure' ? 'source_failure' : 'normal', true);
      this.#sourceSlot.value = source; this.#sourceSlot.identity = sourceIdentity(source); this.#sourceSlot.stage = 'captured';
      if (this.scenario === 'after_source_failure') return this.fail('generation_unavailable');
      if (!source.begin().ok || !source.prepare().ok || !source.prepareSupply().ok) return this.fail('source_rejected');
      const scope = this.#context;
      this.#anchor = supplyTransferAccess.capture(source, scope.construction); this.#issuedAnchor = this.#anchor;
      if (!this.#anchor) return this.fail('binding_mismatch');
      const a = this.#anchor;
      this.#payload = Object.freeze({ envelope: a.envelope, registry: a.registry, table: a.table, view: a.view,
        declarations: a.declarations, tableOrigin: a.tableOrigin }); this.#issuedPayload = this.#payload;
      this.#claim = Object.freeze<NonExecutingSupplyTransfer>({ [TRANSFER_BRAND]: true, owner: scope.construction,
        source, anchor: a, receiver: scope.slots[1].origin, state: 'unused' }); this.#issuedClaim = this.#claim;
      const core = this.probeCore(Object.freeze({ owner: scope.construction, construction: scope.construction, retention: scope.retention,
        source: this.#sourceSlot.identity!, claim: this.#claimOrigin }));
      this.#control = new SupplyUseControl(scope.construction, source, a, this.#claim, core); this.#issuedControl = this.#control;
      this.#receipt = Object.freeze({ construction: scope.construction, retention: scope.retention, sourceSlot: this.#sourceSlot,
        control: this.#control, core, slots: scope.slots }); this.#issuedReceipt = this.#receipt;
      this.probeReceipt();
      if (this.scenario === 'before_bind_failure') return this.fail('generation_unavailable');
      if (this.scenario === 'close_before_bind') return this.close();
      if (this.scenario === 'reenter_before_bind') { this.prepare(); return this.reply(this.#first as Exclude<PendingBindingReason, 'none'>); }
      if (!this.validReceipt() || !boundarySourceAccess.bind(source, this.#control)) return this.fail('binding_mismatch');
      if (this.scenario === 'after_bind_failure') return this.fail('generation_unavailable');
      if (this.scenario === 'close_after_bind') return this.close();
      if (!this.validReceipt() || !sourceControlMatches(source, this.#control)) return this.fail('binding_mismatch');
      this.#bound = true;
      if (this.scenario.startsWith('retire_binding')) {
        if (this.scenario === 'retire_binding_with_claim_alias') this.#extraClaim = this.#claim;
        if (this.scenario === 'retire_binding_with_control_alias') this.#extraControl = this.#control;
        if (this.scenario === 'retire_binding_root_live') this.#control.stop('binding_mismatch');
        else this.fail('binding_mismatch');
        if (this.#control.retireLiveBinding()) this.#bindingRetirements++;
        if (this.scenario === 'retire_binding_twice' && this.#control.retireLiveBinding()) this.#bindingRetirements++;
        if (this.scenario === 'retire_binding_root_live') {
          this.#retiredSourceAllowed = source.check().ok;
          return this.reply('supply_closed');
        }
        return this.reply(this.#first as Exclude<PendingBindingReason, 'none'>);
      }
      return this.reply();
    } catch {
      if (!this.#sourceSlot.value) this.#sourceSlot.stage = 'unknown';
      return this.fail('generation_unavailable');
    }
  }
  check() {
    if (this.#first !== 'none') return this.reply(this.#first);
    if (this.#closed || (this.#issuedControl && this.#issuedControl.state !== 'unused')) return this.reply('supply_closed');
    return this.#bound && this.#sourceSlot.value && this.#issuedControl
      && boundarySourceAccess.normal(this.#sourceSlot.value, this.#issuedControl) ? this.reply() : this.fail('binding_mismatch');
  }
  close() {
    this.#closed = true; this.#retention.close();
    if (this.#attempts && this.#first === 'none') this.#first = 'supply_closed';
    this.#issuedControl?.stop('supply_closed');
    if (this.#sourceSlot.value && this.#sourceSlot.identity) sourceStopOwned(this.#sourceSlot.value, this.#sourceSlot.identity, 'close');
    return this.reply(this.#first === 'none' ? 'supply_closed' : this.#first);
  }
  rejectArguments() { return this.fail('binding_mismatch'); }
  inspect() {
    const source = this.#sourceSlot.value, c = this.#issuedControl, retained = source ? sourceRetention(source) : undefined;
    return Object.freeze({ ...PENDING_BINDING_CLOSED, state: this.#closed ? 'closed' : this.#first !== 'none' ? 'rejected' : this.#bound ? 'bound' : 'unused',
      firstReason: this.#first, bound: this.#bound, bindingStarts: this.#attempts, rootSlot: this.#sourceSlot.stage,
      sourceAttached: !!source && !!c && sourceControlMatches(source, c),
      controlState: c?.state ?? 'not_created', controlLiveBinding: !!c?.live(),
      controlBindingRetirements: this.#bindingRetirements,
      retiredSourceAllowed: this.#retiredSourceAllowed,
      corePayloadFree: !!c && !!this.#context && Object.values(c.identity).every(v =>
        v === this.#context!.construction || v === this.#context!.retention || v === this.#sourceSlot.identity || v === this.#claimOrigin),
      retainedSlots: this.#retention.inspect().retainedSlots, pendingPayload: false, failurePayload: false,
      retentionTable: Object.freeze({ R1: retained?.normal ?? 0, R2: retained?.issued ?? 0,
        R3: Number(!!this.#payload) + Number(!!this.#issuedPayload), R4: Number(!!this.#anchor) + Number(!!this.#issuedAnchor),
        R5: 0, R6: 0, R7: Object.freeze({ localControl: !!this.#control?.live(), issuedControl: !!c?.live(),
          sourceControl: retained?.controlLive ?? false, extraControl: !!this.#extraControl?.live(),
          controlAliases: Number(!!this.#control) + Number(!!c) + Number(!!this.#extraControl),
          claimAliases: Number(!!this.#claim) + Number(!!this.#issuedClaim) + Number(!!this.#extraClaim) }),
        R8: Object.freeze({ sourceRootSlot: !!source, boundReceipt: !!this.#receipt, issuedReceipt: !!this.#issuedReceipt }) }),
      source: source?.inspect() });
  }
}
export function createPendingBindingFake(...args: readonly unknown[]) {
  const input = args.length === 0 ? 'normal' : args[0];
  const admitted = args.length <= 1 && typeof input === 'string' && PENDING_BINDING_SCENARIOS.includes(input);
  const a = new PendingSourceBinding(admitted ? input as string : 'normal', admitted);
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => xs.length ? a.rejectArguments() : a.prepare(),
    check: (...xs: readonly unknown[]) => xs.length ? a.rejectArguments() : a.check(), close: () => a.close(), inspect: () => a.inspect() });
}
