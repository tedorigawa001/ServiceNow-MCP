/** Synthetic B and C preparation only. C execution, transfer and formal issuance remain closed. */
import { createHash, type Hash } from 'node:crypto';
import { inspectSourceMapDraft } from './source-map-values-core.js';
import { SUPPLY_FIELDS, supplyStageAllows, type SupplyConstructionStage } from './supply-construction-kernel.js';


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
let rootRetirementAccess: Readonly<{ origin(a: CStartAssembly): object; seal(a: CStartAssembly): void;
  sealed(a: CStartAssembly): boolean }>;
// Module-private closure: no accessor/adopt method is exposed through a diagnostic facade.
let canonicalSupplyAccess: Readonly<{
  context(a: CStartAssembly): CPreparedContext | undefined;
  open(a: CStartAssembly): boolean;
  fail(a: CStartAssembly, reason: Exclude<LifecycleReason, 'none'>): void;
  retireFailed(a: CStartAssembly): void;
}>;
class CStartAssembly {
  static {
    rootRetirementAccess = Object.freeze({ origin: (a: CStartAssembly) => a.#retirementOrigin,
      seal(a: CStartAssembly): void { a.#retirementSealed = true; }, sealed: (a: CStartAssembly) => a.#retirementSealed });
    canonicalSupplyAccess = Object.freeze({
      context(a: CStartAssembly): CPreparedContext | undefined {
        if (a.#retirementSealed) return undefined;
        const map = a.#snapshot?.view(), prepared = a.#prepared;
        if (a.#terminal || a.#state !== 'prepared' || a.#closeRequested || a.#supplyState !== 'open'
          || !map || !prepared || !a.#borrow || a.#borrow !== a.#issuedBorrow) return undefined;
        const binding = a.binding(map);
        if (!a.#borrow.matches(binding)) return undefined;
        return Object.freeze({ ...binding, prepared, borrow: a.#borrow });
      },
      open: (a: CStartAssembly) => !a.#retirementSealed && a.#supplyState === 'open' && !a.#closeRequested,
      fail(a: CStartAssembly, reason: Exclude<LifecycleReason, 'none'>): void { a.fail(reason); },
      retireFailed(a: CStartAssembly): void { if (a.#terminal && !a.#borrow) a.retireSnapshot(); },
    });
  }
  #diagnostic: DiagnosticOwner | undefined;
  readonly #retirementOrigin = Object.freeze({});
  #retirementSealed = false;
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
    if (this.#retirementSealed) return this.reply('supply_closed');
    if (this.#supplyState !== 'open') return this.reply('supply_closed');
    return this.#snapshot?.view() ? this.reply() : this.reply('supply_invalid');
  }
  begin(): Reply {
    if (this.#terminal) return this.reply('read_already_used');
    const prior = this.prior(); if (prior) return this.reply(prior);
    if (this.#retirementSealed) return this.reply('supply_closed');
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
    if (this.#retirementSealed) return this.reply('supply_closed');
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
      retirementSealed: this.#retirementSealed,
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
let controlRetirementOrigin: (a: SupplyUseControl) => object;
let sourceIdentity: (a: CanonicalSupplyAssembly) => object;
let sourceRootRetirement: Readonly<{ origin(a: CanonicalSupplyAssembly): object;
  seal(a: CanonicalSupplyAssembly): boolean; probe(a: CanonicalSupplyAssembly): Readonly<Record<string, boolean | string>> }>;
let sourceControlMatches: (a: CanonicalSupplyAssembly, control: SupplyUseControl) => boolean;
let sourceBoundControl: (a: CanonicalSupplyAssembly) => SupplyUseControl | undefined;
let sourceStopOwned: (a: CanonicalSupplyAssembly, origin: object, kind: 'close' | 'binding_mismatch' | 'read_prepare_unavailable') => boolean;
let sourceRetention: (a: CanonicalSupplyAssembly) => Readonly<{ normal: number; issued: number; controlLive: boolean;
  borrow: boolean; snapshot: boolean; discardPasses: number }>;
class SupplyUseControl {
  readonly #retirementOrigin = Object.freeze({});
  static { controlRetirementOrigin = a => a.#retirementOrigin; }
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
// Synthetic-only history. No payload references, public fact adoption, admission consumer or packet builder.
type JournalProducer = 'source' | 'binding';
type AbsenceKind = 'preparation_completed' | 'alias_never_assigned' | 'legacy_discard_executed' | 'not_minted';
type JournalStage = 'not_started' | 'writing' | 'present' | 'candidate' | 'released' | 'absent' | 'unconfirmed';
interface JournalScope { readonly producer: JournalProducer; readonly origin: object; readonly epoch: object }
type SlotProducer = 'source_supply' | 'payload_wrapper' | 'control' | 'transfer_claim' | 'anchor' | 'binding_receipt' | 'scope_context';
interface FactBase { readonly scope: JournalScope; readonly field: number; readonly stamp: number;
  readonly origin: object; readonly checkpoint: object }
type AbsenceFact = Readonly<FactBase & (
  { kind: 'preparation_completed'; producer: 'source_supply' }
  | { kind: 'alias_never_assigned'; producer: 'transfer_claim' | 'control' }
  | { kind: 'legacy_discard_executed'; producer: 'source_supply' }
  | { kind: 'not_minted'; producer: SlotProducer })>;
interface FieldHistoryCell { stage: JournalStage; stamp: number; fact: AbsenceFact | undefined }
class AbsenceJournal {
  readonly scope: JournalScope;
  readonly #cells: FieldHistoryCell[];
  readonly #checkpoint = Object.freeze({});
  #sealed = false;
  #first: 'none' | 'journal_unconfirmed' | 'journal_sealed' = 'none';
  #firstField = 0;
  #firstBoundary: 'none' | 'begin' | 'complete' | 'candidate' | 'commit' | 'seal' = 'none';
  #candidates = 0; #preparationCommits = 0;
  constructor(producer: JournalProducer, private readonly fault = '') {
    this.scope = Object.freeze({ producer, origin: Object.freeze({}), epoch: Object.freeze({}) });
    this.#cells = Array.from({ length: producer === 'source' ? 11 : 14 }, () => ({ stage: 'not_started', stamp: 0, fact: undefined }));
  }
  private cell(field: number): FieldHistoryCell { return this.#cells[field - (this.scope.producer === 'source' ? 1 : 12)]; }
  private fail(field: number, boundary: 'begin' | 'complete' | 'candidate' | 'commit' | 'seal') {
    if (this.#first === 'none') { this.#first = this.#sealed ? 'journal_sealed' : 'journal_unconfirmed'; this.#firstField = field; this.#firstBoundary = boundary; }
    const c = this.cell(field); if (c) { c.stage = 'unconfirmed'; c.fact = undefined; }
  }
  private accepts(field: number, boundary: 'begin' | 'complete' | 'candidate' | 'commit' | 'seal'): boolean {
    if (!Number.isInteger(field) || field < (this.scope.producer === 'source' ? 1 : 12)
      || field > (this.scope.producer === 'source' ? 11 : 25)) { this.fail(field, boundary); return false; }
    if (this.#sealed || this.#first !== 'none' || this.fault === `${boundary}_${field}`) { this.fail(field, boundary); return false; }
    return true;
  }
  begin(field: number): void {
    if (!this.accepts(field, 'begin')) return;
    const c = this.cell(field); c.fact = undefined;
    if (c.stamp >= 64) { this.fail(field, 'begin'); return; }
    c.stamp++; c.stage = 'writing';
  }
  complete(field: number): void {
    if (!this.accepts(field, 'complete')) return;
    const c = this.cell(field);
    if (c.stage !== 'writing') { this.fail(field, 'complete'); return; }
    c.stage = 'present';
  }
  nonpublication(field: 21 | 22 | 25): void {
    if (!this.accepts(field, 'complete')) return;
    if (this.cell(field).stage !== 'present') { this.fail(field, 'complete'); return; }
    this.fact(field, 'not_minted');
  }
  write(field: number, operation: () => void): void {
    this.begin(field); operation(); this.complete(field);
  }
  // A recorded write that empties the slot without an admissible absence kind (e.g. control live retirement).
  retire(field: 14, operation: () => void): void {
    this.begin(field); operation();
    if (!this.accepts(field, 'complete')) return;
    const c = this.cell(field);
    if (c.stage !== 'writing') { this.fail(field, 'complete'); return; }
    c.stage = 'released';
  }
  // A legacy writer reached the source after the root retirement seal; the write itself is refused upstream.
  refuseAfterRetirementSeal(): void {
    // Goes through the normal acceptance check: a sealed journal records journal_sealed, an unsealed one unconfirmed.
    this.begin(1); if (!this.#sealed) this.fail(1, 'begin');
  }
  release(field: number, operation: () => void): void {
    this.begin(field); operation();
    if (!this.accepts(field, 'candidate')) return;
    const c = this.cell(field);
    if (c.stage !== 'writing' || field < 4 || field > 6) { this.fail(field, 'candidate'); return; }
    c.stage = 'candidate'; this.#candidates++;
  }
  commitPreparation(): void {
    // Preflight all three before publishing any fact. Source prepared is already fixed by its writer.
    for (const field of [4, 5, 6]) {
      if (!this.accepts(field, 'commit')) return;
      if (this.cell(field).stage !== 'candidate') { this.fail(field, 'commit'); return; }
    }
    for (const field of [4, 5, 6]) this.fact(field, 'preparation_completed');
    this.#preparationCommits = 3;
  }
  private fact(field: number, kind: AbsenceKind): void {
    const c = this.cell(field);
    const base = { scope: this.scope, field, stamp: c.stamp, origin: Object.freeze({}), checkpoint: this.#checkpoint };
    const producer: SlotProducer = field <= 11 ? 'source_supply' : field <= 13 ? 'payload_wrapper'
      : field === 14 || field >= 18 && field <= 20 ? 'control' : field <= 17 ? 'transfer_claim'
        : field <= 22 ? 'anchor' : field <= 24 ? 'binding_receipt' : 'scope_context';
    if (kind === 'preparation_completed' || kind === 'legacy_discard_executed') c.fact = Object.freeze({ ...base, kind, producer: 'source_supply' });
    else if (kind === 'alias_never_assigned') c.fact = Object.freeze({ ...base, kind, producer: field === 17 ? 'transfer_claim' : 'control' });
    else c.fact = Object.freeze({ ...base, kind, producer });
    c.stage = 'absent';
  }
  legacyClear(operation: () => void, emptySlots: () => readonly boolean[]): void {
    // Repeated noop clear retains the same bounded facts and stamps, not fresh evidence.
    const repeat = this.#cells.slice(0, 11).every(c => c.fact?.kind === 'legacy_discard_executed');
    if (!repeat) for (let i = 1; i <= 11; i++) this.begin(i);
    operation();
    const empty = emptySlots();
    for (let i = 1; i <= 11; i++) if (empty.length !== 11 || empty[i - 1] !== true) { this.fail(i, 'complete'); return; }
    if (repeat) return;
    for (let i = 1; i <= 11; i++) if (!this.accepts(i, 'complete') || this.cell(i).stage !== 'writing') return;
    for (let i = 1; i <= 11; i++) this.fact(i, 'legacy_discard_executed');
  }
  seal(): boolean {
    if (this.#sealed) return this.#first === 'none';
    const lo = this.scope.producer === 'source' ? 1 : 12, hi = this.scope.producer === 'source' ? 11 : 25;
    for (let i = lo; i <= hi; i++) {
      if (!this.accepts(i, 'seal')) { this.#sealed = true; return false; }
      const c = this.cell(i);
      if (c.stage === 'writing' || c.stage === 'candidate' || c.stage === 'unconfirmed') { this.fail(i, 'seal'); this.#sealed = true; return false; }
    }
    for (let i = lo; i <= hi; i++) if (this.cell(i).stage === 'not_started')
      this.fact(i, i === 17 || i === 20 ? 'alias_never_assigned' : 'not_minted');
    this.#sealed = true; return true;
  }
  ready(scope: JournalScope): boolean {
    return scope === this.scope && this.#sealed && this.#first === 'none'
      && this.#cells.every((c, i) => c.stage === 'present' || c.stage === 'released' || (c.stage === 'absent' && !!c.fact && c.fact.scope === scope
        && c.fact.field === i + (this.scope.producer === 'source' ? 1 : 12)
        && c.fact.stamp === c.stamp && c.fact.checkpoint === this.#checkpoint));
  }
  inspect() {
    const lo = this.scope.producer === 'source' ? 0 : 11;
    return Object.freeze({ producer: this.scope.producer, sealed: this.#sealed, first: this.#first, firstField: this.#firstField,
      firstBoundary: this.#firstBoundary, candidates: this.#candidates, preparationCommits: this.#preparationCommits,
      cells: Object.freeze(this.#cells.map((c, i) => Object.freeze({
        field: i + lo + 1, stage: c.stage, stamp: c.stamp, fact: c.fact?.kind ?? 'none', producer: c.fact?.producer ?? 'none' }))) });
  }
}
let sourceJournalAccess: (a: CanonicalSupplyAssembly) => AbsenceJournal;
class CanonicalSupplyAssembly {
  readonly #journal: AbsenceJournal;
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
    sourceJournalAccess = a => a.#journal;
    sourceRootRetirement = Object.freeze({ origin: (a: CanonicalSupplyAssembly) => rootRetirementAccess.origin(a.#root),
      seal(a: CanonicalSupplyAssembly): boolean { rootRetirementAccess.seal(a.#root); return rootRetirementAccess.sealed(a.#root); },
      probe(a: CanonicalSupplyAssembly): Readonly<Record<string, boolean | string>> {
        const r = a.#root, reason = (v: Reply) => v.ok ? 'admitted' : v.reason ?? 'refused';
        return Object.freeze({ context: !!canonicalSupplyAccess.context(r), open: canonicalSupplyAccess.open(r),
          begin: reason(r.begin()), prepare: reason(r.prepare()), check: reason(r.check()) });
      } });
    sourceIdentity = a => a.#sourceOrigin;
    sourceControlMatches = (a, control) => a.#normalControl === control;
    sourceBoundControl = a => a.#normalControl;
    sourceStopOwned = (a, origin, action) => {
      if (origin !== a.#sourceOrigin) return false;
      if (action === 'close') { a.#root.close(); }
      else { canonicalSupplyAccess.fail(a.#root, action); }
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
  constructor(private readonly scenario: string, admitted: boolean, journalFault = '') {
    this.#journal = new AbsenceJournal('source', journalFault);
    this.#root = new CStartAssembly((cStartScenarios as readonly string[]).includes(scenario) ? scenario as CStartScenario : 'normal', admitted);
  }
  private reply(reason?: Exclude<CanonicalSupplyReason, 'none'> | 'read_already_used') {
    return Object.freeze(reason ? { ...CANONICAL_CLOSED, ok: false, reason } : { ...CANONICAL_CLOSED, ok: true });
  }
  private clear(): void {
    // Legacy clear is refused once the root is retirement-sealed; the journal records the refused writer.
    if (rootRetirementAccess.sealed(this.#root)) { this.#journal.refuseAfterRetirementSeal(); return; }
    this.#journal.legacyClear(() => {
    if (this.#envelope || this.#registry || this.#table || this.#view || this.#buildingRegistry
      || this.#buildingBindings || this.#buildingDeclarations) {
      this.#counts.discardPasses++; this.#retirementOrder.push('supply_references_cleared');
    }
    this.#envelope = undefined; this.#registry = undefined; this.#table = undefined; this.#issuedTable = undefined;
    this.#view = undefined; this.#issuedView = undefined; this.#issuedDeclarations = undefined;
    this.#buildingRegistry = undefined; this.#buildingBindings = undefined; this.#buildingDeclarations = undefined;
    this.#tableOrigin = undefined; this.#state = 'discarded';
    }, () => Object.freeze([this.#registry === undefined, this.#table === undefined, this.#view === undefined,
      this.#buildingRegistry === undefined, this.#buildingBindings === undefined, this.#buildingDeclarations === undefined,
      this.#envelope === undefined, this.#issuedTable === undefined, this.#issuedView === undefined,
      this.#issuedDeclarations === undefined, this.#tableOrigin === undefined]));
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
      this.#journal.write(7, () => { this.fault('envelope'); this.#envelope = envelope; });
      this.#journal.write(11, () => { this.fault('origin'); this.#tableOrigin = Object.freeze({}); });
      if (this.scenario === 'reentrant_preparation') { this.prepareSupply(); return this.reply(this.#first as Exclude<CanonicalSupplyReason, 'none'>); }
      const bytes = Object.freeze([97, 98, 99]);
      this.#journal.write(4, () => { this.#buildingRegistry = []; });
      for (let ordinal = 0; ordinal < envelope.files.length; ordinal++) {
        this.fault(`registry_${ordinal}`);
        const file = envelope.files[ordinal];
        const origin = Object.freeze({});
        const source = this.sourceRecord(origin, ordinal, bytes);
        this.#buildingRegistry!.push(Object.freeze({ file, ordinal, origin, source })); this.#counts.registryRecords++;
        if (this.scenario === 'close_during_registry') { this.close(); return this.reply('supply_closed'); }
      }
      this.#journal.write(1, () => { this.#registry = Object.freeze(this.#buildingRegistry!); });
      this.#journal.release(4, () => { this.#buildingRegistry = undefined; });
      this.#journal.write(5, () => { this.#buildingBindings = []; });
      for (let i = 0; i < this.#registry!.length; i++) {
        this.fault(`bindings_${i}`); const r = this.#registry![i];
        const swapped = this.#registry![i < 2 ? 1 - i : i];
        this.#buildingBindings!.push(Object.freeze({ ...r,
          source: (this.scenario === 'record_swap' || this.scenario === 'record_origin_swap') && i < 2 ? swapped.source : r.source,
          origin: (this.scenario === 'origin_swap' || this.scenario === 'record_origin_swap') && i < 2 ? swapped.origin : r.origin,
          tableOrigin: this.#tableOrigin! })); this.#counts.bindings++;
      }
      const bindings = this.probeBindings(Object.freeze(this.#buildingBindings!));
      this.#journal.release(5, () => { this.#buildingBindings = undefined; });
      this.#journal.write(2, () => { this.fault('table'); this.#table = Object.freeze({ envelope, origin: this.#tableOrigin!, bindings }); });
      this.#journal.write(8, () => { this.#issuedTable = this.#table; });
      this.#counts.tables++;
      this.#journal.write(6, () => { this.#buildingDeclarations = []; });
      for (let i = 0; i < bindings.length; i++) {
        this.fault(`declarations_${i}`); const binding = bindings[i];
        this.#buildingDeclarations!.push(Object.freeze({ file: binding.file, ordinal: binding.ordinal, binding })); this.#counts.declarations++;
      }
      const declarations = Object.freeze(this.#buildingDeclarations!);
      this.#journal.release(6, () => { this.#buildingDeclarations = undefined; });
      this.#journal.write(10, () => { this.#issuedDeclarations = declarations; });
      this.#journal.write(3, () => { this.fault('view'); this.#view = Object.freeze({ envelope, table: this.#table!, declarations }); });
      this.#journal.write(9, () => { this.#issuedView = this.#view; });
      this.#counts.views++;
      // Mutation probes only write present source fields, never the three release candidates.
      if (this.scenario.startsWith('post_')) for (const field of [1, 2, 3, 7, 8, 9, 10, 11]) this.#journal.begin(field);
      this.probeIssued();
      if (this.scenario.startsWith('post_')) for (const field of [1, 2, 3, 7, 8, 9, 10, 11]) this.#journal.complete(field);
      if (this.scenario === 'close_before_post') { this.close(); return this.reply('supply_closed'); }
      this.fault('post');
      if (!this.validate()) return this.fail('binding_mismatch');
      this.#state = 'prepared'; this.#journal.commitPreparation(); return this.reply();
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
let pendingRetentionOrigins: (a: PendingRetentionRoot) => Readonly<{ construction: object; retention: object }>;
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
    pendingRetentionOrigins = a => Object.freeze({ construction: a.#construction, retention: a.#origin });
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
  'claim_receiver', 'retire_binding_gate_probe',
  'source_failure', 'source_attempt_failure', 'before_source_failure', 'after_source_failure', 'before_bind_failure', 'after_bind_failure', 'close_before_bind', 'close_after_bind', 'reenter_before_bind']);
interface RetirementBindingPin { readonly construction: object; readonly retention: object; readonly sourceSlot: object }
type OwnedStopContext = Readonly<{ kind: 'root_captured'; source: object; root: object;
  control: Readonly<{ kind: 'minted'; origin: object } | { kind: 'not_minted'; checkpoint: object }> }>
  | Readonly<{ kind: 'root_not_created'; checkpoint: object; control: Readonly<{ kind: 'not_minted'; checkpoint: object }> }>
  | Readonly<{ kind: 'unconfirmed' }>;
let retirementBindingAccess: Readonly<{
  pin(a: PendingSourceBinding): RetirementBindingPin;
  matches(a: PendingSourceBinding, pin: RetirementBindingPin): boolean;
  stop(a: PendingSourceBinding): void;
  failFrame(a: PendingSourceBinding): void;
  first(a: PendingSourceBinding): PendingBindingReason;
  stopContext(a: PendingSourceBinding): OwnedStopContext;
  sealRoot(a: PendingSourceBinding): boolean;
  probeRoot(a: PendingSourceBinding): Readonly<Record<string, boolean | string>> | undefined;
}>;
let bindingJournalAccess: Readonly<{
  journal(a: PendingSourceBinding): AbsenceJournal;
  source(a: PendingSourceBinding): CanonicalSupplyAssembly | undefined;
}>;
let bindingGateSeedMatches: (a: PendingSourceBinding, seed: GateConstructionSeed) => boolean;
class PendingSourceBinding {
  readonly #gateSeed: GateConstructionSeed | undefined;
  readonly #journal: AbsenceJournal;
  readonly #retention: PendingRetentionRoot;
  readonly #sourceSlot: PendingSourceSlot = { origin: Object.freeze({}), stage: 'empty', value: undefined, identity: undefined };
  readonly #claimOrigin = Object.freeze({});
  readonly #mintCheckpoint = Object.freeze({});
  #controlMint: 'not_started' | 'attempting' | 'minted' = 'not_started';
  #controlMintOrigin: object | undefined;
  #context: PendingScopeContext | undefined;
  #control: SupplyUseControl | undefined; #issuedControl: SupplyUseControl | undefined;
  #anchor: SupplyIssuanceAnchor | undefined; #issuedAnchor: SupplyIssuanceAnchor | undefined;
  #payload: PreparedSupplyPayload | undefined; #issuedPayload: PreparedSupplyPayload | undefined;
  #claim: NonExecutingSupplyTransfer | undefined; #issuedClaim: NonExecutingSupplyTransfer | undefined;
  #receipt: PendingBindingReceipt | undefined; #issuedReceipt: PendingBindingReceipt | undefined;
  #extraClaim: NonExecutingSupplyTransfer | undefined; #extraControl: SupplyUseControl | undefined;
  #bindingRetirements = 0;
  #retiredSourceAllowed: boolean | undefined;
  #retiredGateProbe: Readonly<Record<'capture' | 'matches' | 'begin' | 'prepare' | 'prepareSupply', string>> | undefined;
  #attempts = 0; #bound = false; #closed = false;
  #first: PendingBindingReason = 'none';
  static {
    bindingGateSeedMatches = (a, seed) => a.#gateSeed === seed;
    bindingJournalAccess = Object.freeze({ journal: (a: PendingSourceBinding) => a.#journal,
      source: (a: PendingSourceBinding) => a.#sourceSlot.value });
    retirementBindingAccess = Object.freeze({
      pin(a: PendingSourceBinding): RetirementBindingPin {
        return Object.freeze({ ...pendingRetentionOrigins(a.#retention), sourceSlot: a.#sourceSlot.origin });
      },
      matches(a: PendingSourceBinding, pin: RetirementBindingPin): boolean {
        const own = pendingRetentionOrigins(a.#retention), s = a.#sourceSlot;
        return pin.construction === own.construction && pin.retention === own.retention && pin.sourceSlot === s.origin
          && (!s.value || s.identity === sourceIdentity(s.value));
      },
      stop(a: PendingSourceBinding): void { a.#issuedControl?.stop('supply_closed'); },
      failFrame(a: PendingSourceBinding): void { a.fail('generation_unavailable'); },
      first(a: PendingSourceBinding): PendingBindingReason { return a.#first; },
      stopContext(a: PendingSourceBinding): OwnedStopContext {
        const s = a.#sourceSlot;
        if (s.stage === 'unknown' || s.stage === 'attempting') return Object.freeze({ kind: 'unconfirmed' });
        if ((a.#controlMint === 'not_started' && !!a.#issuedControl) || a.#controlMint === 'attempting' || (a.#controlMint === 'minted' && (!a.#issuedControl
          || controlRetirementOrigin(a.#issuedControl) !== a.#controlMintOrigin))) return Object.freeze({ kind: 'unconfirmed' });
        const absent = Object.freeze({ kind: 'not_minted' as const, checkpoint: a.#mintCheckpoint });
        if (s.stage === 'empty' && !s.value) return Object.freeze({ kind: 'root_not_created', checkpoint: s.origin, control: absent });
        if (!s.value || s.identity !== sourceIdentity(s.value)) return Object.freeze({ kind: 'unconfirmed' });
        const bound = sourceBoundControl(s.value);
        if (bound && bound !== a.#issuedControl) return Object.freeze({ kind: 'unconfirmed' });
        return Object.freeze({ kind: 'root_captured', source: s.identity, root: sourceRootRetirement.origin(s.value),
          control: a.#issuedControl ? Object.freeze({ kind: 'minted', origin: controlRetirementOrigin(a.#issuedControl) }) : absent });
      },
      sealRoot(a: PendingSourceBinding): boolean {
        const s = a.#sourceSlot;
        if (!s.value || s.identity !== sourceIdentity(s.value)) return false;
        return sourceRootRetirement.seal(s.value);
      },
      probeRoot(a: PendingSourceBinding) { return a.#sourceSlot.value ? sourceRootRetirement.probe(a.#sourceSlot.value) : undefined; },
    });
  }
  constructor(private readonly scenario: string, admitted: boolean,
    private readonly journalScript: Readonly<{ bindingFault?: string; sourceFault?: string; sourceScenario?: string }> = {}, gateSeed?: GateConstructionSeed) {
    this.#gateSeed = gateSeed;
    this.#journal = new AbsenceJournal('binding', journalScript.bindingFault);
    this.#retention = new PendingRetentionRoot('normal', admitted);
  }
  private reply(reason?: Exclude<PendingBindingReason, 'none'>) {
    return Object.freeze(reason ? { ...PENDING_BINDING_CLOSED, ok: false, reason } : { ...PENDING_BINDING_CLOSED, ok: true });
  }
  private fail(reason: Exclude<PendingBindingReason, 'none'>) {
    if (this.#first === 'none') this.#first = reason;
    this.#issuedControl?.stop('binding_mismatch');
    // The source already recorded its own supply failure; adding a root binding diagnosis would misclassify it.
    if (reason !== 'source_rejected' && this.#sourceSlot.value && this.#sourceSlot.identity) {
      sourceStopOwned(this.#sourceSlot.value, this.#sourceSlot.identity,
        reason === 'generation_unavailable' ? 'read_prepare_unavailable' : 'binding_mismatch');
    }
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
    this.#journal.write(25, () => { this.#context = pendingConstructionAccess(this.#retention); });
    if (!this.#context) this.#journal.nonpublication(25);
    if (!this.#context) return this.fail('binding_mismatch');
    this.#attempts = 1;
    try {
      if (this.scenario === 'before_source_failure') return this.fail('generation_unavailable');
      this.#sourceSlot.stage = 'attempting';
      if (this.scenario === 'source_attempt_failure') throw new Error('synthetic_source_unconfirmed');
      const source = new CanonicalSupplyAssembly(this.journalScript.sourceScenario ?? (this.scenario === 'source_failure' ? 'source_failure' : 'normal'), true,
        this.journalScript.sourceFault);
      this.#sourceSlot.value = source; this.#sourceSlot.identity = sourceIdentity(source); this.#sourceSlot.stage = 'captured';
      if (this.scenario === 'after_source_failure') return this.fail('generation_unavailable');
      if (!source.begin().ok || !source.prepare().ok || !source.prepareSupply().ok) return this.fail('source_rejected');
      const scope = this.#context;
      this.#journal.write(21, () => { this.#anchor = supplyTransferAccess.capture(source, scope.construction); });
      this.#journal.write(22, () => { this.#issuedAnchor = this.#anchor; });
      if (!this.#anchor) { this.#journal.nonpublication(21); this.#journal.nonpublication(22); }
      if (!this.#anchor) return this.fail('binding_mismatch');
      const a = this.#anchor;
      this.#journal.write(12, () => { this.#payload = Object.freeze({ envelope: a.envelope, registry: a.registry, table: a.table, view: a.view,
        declarations: a.declarations, tableOrigin: a.tableOrigin }); });
      this.#journal.write(13, () => { this.#issuedPayload = this.#payload; });
      this.#journal.write(15, () => { this.#claim = Object.freeze<NonExecutingSupplyTransfer>({ [TRANSFER_BRAND]: true, owner: scope.construction,
        source, anchor: a, receiver: this.scenario === 'claim_receiver' ? Object.freeze({}) : scope.slots[1].origin, state: 'unused' }); });
      this.#journal.write(16, () => { this.#issuedClaim = this.#claim; });
      const core = this.probeCore(Object.freeze({ owner: scope.construction, construction: scope.construction, retention: scope.retention,
        source: this.#sourceSlot.identity!, claim: this.#claimOrigin }));
      this.#controlMint = 'attempting';
      this.#journal.begin(18); this.#journal.begin(14);
      if (this.scenario === 'control_mint_unconfirmed') throw new Error('private_control_mint');
      this.#control = new SupplyUseControl(scope.construction, source, a, this.#claim!, core);
      this.#journal.complete(18); this.#journal.complete(14);
      this.#journal.write(19, () => { this.#issuedControl = this.#control; });
      this.#controlMintOrigin = controlRetirementOrigin(this.#control); this.#controlMint = 'minted';
      this.#journal.write(23, () => { this.#receipt = Object.freeze({ construction: scope.construction, retention: scope.retention, sourceSlot: this.#sourceSlot,
        control: this.#control!, core, slots: scope.slots }); });
      this.#journal.write(24, () => { this.#issuedReceipt = this.#receipt; });
      if (['receipt_copy', 'receipt_construction', 'receipt_retention', 'receipt_source_slot', 'receipt_control', 'receipt_core', 'receipt_slots',
        'anchor_copy', 'payload_copy', 'claim_copy'].includes(this.scenario)) for (const field of [12, 15, 21, 23, 24]) this.#journal.begin(field);
      this.probeReceipt();
      if (['receipt_copy', 'receipt_construction', 'receipt_retention', 'receipt_source_slot', 'receipt_control', 'receipt_core', 'receipt_slots',
        'anchor_copy', 'payload_copy', 'claim_copy'].includes(this.scenario)) for (const field of [12, 15, 21, 23, 24]) this.#journal.complete(field);
      if (this.scenario === 'before_bind_failure') return this.fail('generation_unavailable');
      if (this.scenario === 'close_before_bind') return this.close();
      if (this.scenario === 'reenter_before_bind') { this.prepare(); return this.reply(this.#first as Exclude<PendingBindingReason, 'none'>); }
      if (!this.validReceipt() || !boundarySourceAccess.bind(source, this.#control)) return this.fail('binding_mismatch');
      if (this.scenario === 'after_bind_failure') return this.fail('generation_unavailable');
      if (this.scenario === 'close_after_bind') return this.close();
      if (!this.validReceipt() || !sourceControlMatches(source, this.#control)) return this.fail('binding_mismatch');
      this.#bound = true;
      if (this.scenario.startsWith('retire_binding')) {
        if (this.scenario === 'retire_binding_with_claim_alias') this.#journal.write(17, () => { this.#extraClaim = this.#claim; });
        if (this.scenario === 'retire_binding_with_control_alias') this.#journal.write(20, () => { this.#extraControl = this.#control; });
        const rootLive = this.scenario === 'retire_binding_root_live' || this.scenario === 'retire_binding_gate_probe';
        if (rootLive) this.#control.stop('binding_mismatch');
        else this.fail('binding_mismatch');
        const control = this.#control;
        if (control.live()) this.#journal.retire(14, () => { if (control.retireLiveBinding()) this.#bindingRetirements++; });
        if (this.scenario === 'retire_binding_twice' && this.#control.retireLiveBinding()) this.#bindingRetirements++;
        if (this.scenario === 'retire_binding_root_live') {
          this.#retiredSourceAllowed = source.check().ok;
          return this.reply('supply_closed');
        }
        if (this.scenario === 'retire_binding_gate_probe') {
          // Non-destructive probes first; each later gate must refuse before any legacy rejection/clear runs.
          const reason = (r: { ok: boolean; reason?: string }) => r.ok ? 'admitted' : r.reason ?? 'refused';
          const capture = supplyTransferAccess.capture(source, scope.construction) ? 'admitted' : 'refused';
          const matches = supplyTransferAccess.matches(source, a) ? 'admitted' : 'refused';
          this.#retiredGateProbe = Object.freeze({ capture, matches, begin: reason(source.begin()), prepare: reason(source.prepare()),
            prepareSupply: reason(source.prepareSupply()) });
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
      retiredSourceAllowed: this.#retiredSourceAllowed, retiredGateProbe: this.#retiredGateProbe,
      retentionCloseRequested: this.#retention.inspect().closeRequested,
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

// Synthetic start boundary only. No capture, field clear, proof or root termination continuation.
class RetirementStartClaim {
  readonly origin = Object.freeze({});
  #spent = false;
  constructor(readonly owner: object, readonly pin: RetirementBindingPin) { Object.freeze(this); }
  get spent() { return this.#spent; }
  begin(): boolean { if (this.#spent) return false; this.#spent = true; return true; }
}
const RETIREMENT_START_CLOSED = Object.freeze({ ...PENDING_BINDING_CLOSED, model: 'wfb-retirement-start-fake-1',
  fieldWrites: 0, payload: 'not_started', capture: 'not_connected', finalAudit: 'not_connected' } as const);
const RETIREMENT_START_SCENARIOS = Object.freeze(['normal', 'request_in_frame', 'close_in_frame', 'reenter_prepare', 'reenter_request',
  'throw_in_frame', 'prepare_failure', 'source_rejected', 'source_unknown', 'control_unconfirmed', 'owner_copy', 'pin_copy', 'pin_construction',
  'pin_retention', 'pin_source_slot', 'claim_copy', 'claim_owner', 'claim_pin', 'frame_exit_failure']);
type RetirementStartDisposition = 'prepared' | 'preparation_rejected' | 'preparation_in_progress' | 'deferred_frame'
  | 'frame_unconfirmed' | 'binding_rejected' | 'in_progress' | 'blocked_field_clear' | 'input_rejected' | 'blocked_frame_execution';
interface AdmissionScope { readonly owner: object; readonly construction: object; readonly retention: object;
  readonly sourceSlot: object; readonly claim: object }
let captureStartAccess: Readonly<{ scope(a: RetirementStartAssembly): AdmissionScope; ready(a: RetirementStartAssembly): boolean;
  seedMatches(a: RetirementStartAssembly, seed: GateConstructionSeed): boolean;
  constructionMatches(a: RetirementStartAssembly, scope: AdmissionScope): boolean;
  context(a: RetirementStartAssembly): OwnedStopContext; seal(a: RetirementStartAssembly): boolean;
  probe(a: RetirementStartAssembly): Readonly<Record<string, boolean | string>> | undefined }>;
let probeStartAccess: Readonly<{
  bind(a: RetirementStartAssembly, b: ProbeFrameBinding, issued: ProbeFrameBinding, script: string): boolean;
  matches(a: RetirementStartAssembly, b: ProbeFrameBinding): boolean;
  check(a: RetirementStartAssembly): ReturnType<RetirementStartAssembly['prepare']>;
  legacy(a: RetirementStartAssembly): ReturnType<RetirementStartAssembly['prepare']>;
  bindRun(a: RetirementStartAssembly, link: ProbeRunLink, duty: FixedExitDuty, script: string): boolean;
  matchesRun(a: RetirementStartAssembly, link: ProbeRunLink, duty: FixedExitDuty): boolean;
  runInspect(a: RetirementStartAssembly): Readonly<{ linkRetained: boolean; dutyRetained: boolean; bindAttempted: boolean }>;
  captureGrant(a: RetirementStartAssembly): Readonly<ProbeGrantCaptureReply>;
  stopCapture(a: RetirementStartAssembly): void;
  captureInspect(a: RetirementStartAssembly): Readonly<ProbeGrantCaptureSnapshot>;
  bindExit(a: RetirementStartAssembly, bundle: ProbeExitPreparationBundle, script: string): boolean;
  matchesExit(a: RetirementStartAssembly, bundle: ProbeExitPreparationBundle): boolean;
  bindGuard(a: RetirementStartAssembly, state: ProbeExitGuardState, script: string): boolean;
  runGuard(a: RetirementStartAssembly): Readonly<ProbeExitGuardReply>;
  guardInspect(a: RetirementStartAssembly): Readonly<ProbeExitGuardSnapshot> | undefined;
  bindLocal(a: RetirementStartAssembly, state: ProbeLocalExitState, script: string): boolean;
  localInspect(a: RetirementStartAssembly): Readonly<ProbeLocalExitSnapshot> | undefined;
  exitInspect(a: RetirementStartAssembly): Readonly<{ attempted: boolean; retained: boolean; sameDuty: boolean;
    knowledge: 'not_called' | 'known' | 'unknown'; callStarted: boolean; issuerRetained: boolean; receiverRetained: boolean }>;
  inspect(a: RetirementStartAssembly): Readonly<{ bindingRetained: boolean; bindingAttempted: boolean;
    wrapperCalls: number; generationBodyCalls: number; frameExits: number; frame: string; starts: number; claim: string }>;
}>;
class RetirementStartAssembly {
  readonly #gateSeed: GateConstructionSeed | undefined;
  #probeBinding: ProbeFrameBinding | undefined; #probeIssuedBinding: ProbeFrameBinding | undefined;
  #probeCells: ProbeCellBundle | undefined; #probeBindStarted = false;
  #runLink: ProbeRunLink | undefined; #runIssuedLink: ProbeRunLink | undefined;
  #runDuty: FixedExitDuty | undefined; #runIssuedDuty: FixedExitDuty | undefined; #runBindStarted = false;
  #wrapperCalls = 0; #generationBodyCalls = 0;
  #grantIssued: CanonicalProbeGrant | undefined;
  #grantAttempts = 0; #grantIssues = 0; #grantChecks = 0; #captureInProgress = false; #captureStop = false;
  #captureFirst: ProbeRunFirst = 'none'; #capturePhase = 'none'; #captureBoundary = 'none';
  #captureRefusal: 'none' | 'duplicate_enter' = 'none'; #captureReentry = 'none';
  #captureFixed: Readonly<ProbeGrantCaptureReply> | undefined;
  #captureScript = 'normal'; #grantCallStarted = false; #capturePrefix: ProbeCapturePrefix = 'none';
  #exitBundle: ProbeExitPreparationBundle | undefined; #exitIssuedBundle: ProbeExitPreparationBundle | undefined;
  #exitBindStarted = false;
  #guardState: ProbeExitGuardState | undefined; #guardIssued: ProbeExitGuardState | undefined; #guardBindStarted = false; #guardScript = 'g_normal';
  #localState: ProbeLocalExitState | undefined; #localIssued: ProbeLocalExitState | undefined; #localBindStarted = false; #localScript = 'c_normal';
  readonly #owner = Object.freeze({});
  readonly #binding: PendingSourceBinding;
  readonly #pin: RetirementBindingPin;
  readonly #claim: RetirementStartClaim;
  readonly #issuedPin: RetirementBindingPin; readonly #issuedClaim: RetirementStartClaim;
  readonly #claimOwner: object;
  readonly #fields = Object.freeze(Array.from({ length: 30 }, (_, i) => Object.freeze({
    field: `F${String(i + 1).padStart(2, '0')}`, presence: 'not_observed' as const, writeAttempted: false, emptyConfirmed: false })));
  readonly #groups = Object.freeze(Array.from({ length: 8 }, (_, i) => Object.freeze({ group: `R${i + 1}`, status: 'unverified' as const })));
  #frame = false; #prepared = false; #requested = false; #starts = 0;
  #frameExits = 0;
  #deferred: Readonly<{ disposition: string; starts: number; claim: string; frame: string }> | undefined;
  #prepareReentry: string | undefined; #requestReentry: string | undefined;
  #frameUnconfirmed = false;
  #retirementFirst: 'none' | 'ownership_mismatch' | 'frame_unconfirmed' | 'input_rejected' = 'none';
  #rejectedReply: ReturnType<RetirementStartAssembly['reply']> | undefined;
  #first: PendingBindingReason = 'none';
  #attempt: 'not_started' | 'running' | 'binding_rejected' = 'not_started';
  static {
    probeStartAccess = Object.freeze({
      bind(a: RetirementStartAssembly, b: ProbeFrameBinding, issued: ProbeFrameBinding, script: string): boolean {
        if (a.#probeBindStarted) return false;
        a.#probeBindStarted = true; a.#probeBinding = b; a.#probeIssuedBinding = issued;
        a.#probeCells = script === 'start_cells_copy' ? Object.freeze({ ...b.cells }) : b.cells;
        return a.probeMatches(b);
      },
      matches: (a: RetirementStartAssembly, b: ProbeFrameBinding) => a.probeMatches(b),
      check: (a: RetirementStartAssembly) => a.frameBoundary('probe_closed'),
      legacy: (a: RetirementStartAssembly) => a.prepare(),
      bindRun(a: RetirementStartAssembly, link: ProbeRunLink, duty: FixedExitDuty, script: string): boolean {
        if (a.#runBindStarted) return false;
        a.#runBindStarted = true; a.#runIssuedLink = link; a.#runIssuedDuty = duty;
        a.#captureScript = script;
        a.#runLink = script === 'start_run_link_copy' ? Object.freeze({ ...link }) : link;
        a.#runDuty = script === 'start_run_duty_copy' ? { ...duty } : duty;
        return a.runMatches(link, duty);
      },
      matchesRun: (a: RetirementStartAssembly, link: ProbeRunLink, duty: FixedExitDuty) => a.runMatches(link, duty),
      runInspect: (a: RetirementStartAssembly) => Object.freeze({ linkRetained: !!a.#runLink, dutyRetained: !!a.#runDuty, bindAttempted: a.#runBindStarted }),
      captureGrant: (a: RetirementStartAssembly) => a.frameBoundary('probe_capture'),
      stopCapture: (a: RetirementStartAssembly) => { a.#captureStop = true; },
      captureInspect: (a: RetirementStartAssembly) => Object.freeze({ first: a.#captureFirst, phase: a.#capturePhase, boundary: a.#captureBoundary,
        grantAttempts: a.#grantAttempts, grantIssues: a.#grantIssues, grantChecks: a.#grantChecks, inProgress: a.#captureInProgress,
        stopRequested: a.#captureStop, refusal: a.#captureRefusal, reentry: a.#captureReentry, prefix: a.#capturePrefix,
        issuerRetained: a.#grantIssued !== undefined, obligationOwed: a.#runLink?.cells.use.attemptUsed === true,
        sameDuty: !!a.#runDuty && a.#runDuty === a.#runIssuedDuty && a.#runDuty.link === a.#runLink && a.#runLink === a.#runIssuedLink }),
      bindExit(a: RetirementStartAssembly, bundle: ProbeExitPreparationBundle, script: string): boolean {
        if (a.#exitBindStarted) return false;
        a.#exitBindStarted = true; a.#exitIssuedBundle = bundle;
        a.#exitBundle = script === 'exit_receiver_copy' ? Object.freeze({ ...bundle }) : bundle;
        return a.exitPreparationMatches(bundle);
      },
      matchesExit: (a: RetirementStartAssembly, bundle: ProbeExitPreparationBundle) => a.exitPreparationMatches(bundle),
      bindGuard(a: RetirementStartAssembly, state: ProbeExitGuardState, script: string): boolean {
        if (a.#guardBindStarted) return false;
        a.#guardBindStarted = true; a.#guardState = state; a.#guardIssued = state; a.#guardScript = script;
        a.#captureScript = guardCaptureScript(script);
        return a.guardIdentityMatches(state);
      },
      runGuard: (a: RetirementStartAssembly) => a.frameBoundary('probe_guard'),
      guardInspect: (a: RetirementStartAssembly) => a.guardSnapshot(),
      bindLocal(a: RetirementStartAssembly, state: ProbeLocalExitState, script: string): boolean {
        if (a.#localBindStarted) return false;
        a.#localBindStarted = true; a.#localState = state; a.#localIssued = state; a.#localScript = script;
        return a.localContextMatches(state, state.guard);
      },
      localInspect: (a: RetirementStartAssembly) => a.localSnapshot(),
      exitInspect: (a: RetirementStartAssembly) => Object.freeze({ attempted: a.#exitBindStarted, retained: !!a.#exitBundle,
        sameDuty: !!a.#exitBundle && a.#exitBundle.duty === a.#runDuty && a.#runDuty === a.#runIssuedDuty,
        knowledge: a.#grantIssued ? 'known' as const : a.#grantCallStarted ? 'unknown' as const : 'not_called' as const,
        callStarted: a.#grantCallStarted, issuerRetained: a.#grantIssued !== undefined, receiverRetained: a.#probeCells?.grant.current !== undefined }),
      inspect: (a: RetirementStartAssembly) => Object.freeze({ bindingRetained: !!a.#probeBinding, bindingAttempted: a.#probeBindStarted,
        wrapperCalls: a.#wrapperCalls, generationBodyCalls: a.#generationBodyCalls, frameExits: a.#frameExits,
        frame: a.#frame ? 'active' : 'inactive', starts: a.#starts, claim: a.#claim.spent ? 'spent' : 'unused' }),
    });
    captureStartAccess = Object.freeze({
      seedMatches: (a: RetirementStartAssembly, seed: GateConstructionSeed) => a.#gateSeed === seed && bindingGateSeedMatches(a.#binding, seed),
      constructionMatches(a: RetirementStartAssembly, s: AdmissionScope): boolean {
        return Object.keys(s).length === 5 && s.owner === a.#owner && s.construction === a.#issuedPin.construction
          && s.retention === a.#issuedPin.retention && s.sourceSlot === a.#issuedPin.sourceSlot && s.claim === a.#issuedClaim.origin
          && a.#claimOwner === a.#owner && a.#claim === a.#issuedClaim && a.#pin === a.#issuedPin
          && a.#claim.owner === a.#owner && a.#claim.pin === a.#pin && !a.#claim.spent
          && retirementBindingAccess.matches(a.#binding, a.#pin);
      },
      scope(a: RetirementStartAssembly): AdmissionScope { return Object.freeze({ owner: a.#owner, ...a.#issuedPin, claim: a.#issuedClaim.origin }); },
      ready(a: RetirementStartAssembly): boolean { return a.#attempt === 'running' && !a.#frame && !a.#frameUnconfirmed && !a.#rejectedReply; },
      context(a: RetirementStartAssembly): OwnedStopContext { return retirementBindingAccess.stopContext(a.#binding); },
      seal(a: RetirementStartAssembly): boolean { return retirementBindingAccess.sealRoot(a.#binding); },
      probe(a: RetirementStartAssembly) { return retirementBindingAccess.probeRoot(a.#binding); },
    });
  }
  constructor(private readonly scenario: string, admitted: boolean, gateSeed?: GateConstructionSeed) {
    this.#gateSeed = scenario === 'start_seed_copy' && gateSeed ? Object.freeze({ ...gateSeed }) : gateSeed;
    this.#binding = new PendingSourceBinding(scenario === 'prepare_failure' ? 'after_bind_failure'
      : scenario === 'source_rejected' ? 'source_failure' : scenario === 'source_unknown' ? 'source_attempt_failure'
        : scenario === 'control_unconfirmed' ? 'control_mint_unconfirmed' : 'normal', admitted, {},
      scenario === 'binding_seed_copy' && gateSeed ? Object.freeze({ ...gateSeed }) : gateSeed);
    const base = retirementBindingAccess.pin(this.#binding), foreign = Object.freeze({});
    // Field controls install the malformed pin as the issued pin itself (shared by #pin and the claim),
    // so the identity checks pass and only the private matches() field comparison can reject it.
    this.#issuedPin = scenario === 'pin_construction' ? Object.freeze({ ...base, construction: foreign })
      : scenario === 'pin_retention' ? Object.freeze({ ...base, retention: foreign })
        : scenario === 'pin_source_slot' ? Object.freeze({ ...base, sourceSlot: foreign }) : base;
    const p = this.#issuedPin;
    this.#pin = scenario === 'pin_copy' ? Object.freeze({ ...p }) : p;
    this.#claimOwner = scenario === 'owner_copy' ? foreign : this.#owner;
    this.#issuedClaim = new RetirementStartClaim(scenario === 'claim_owner' ? foreign : this.#owner,
      scenario === 'claim_pin' ? Object.freeze({ ...p }) : scenario === 'pin_copy' ? this.#pin : p);
    this.#claim = scenario === 'claim_copy' ? new RetirementStartClaim(this.#owner, p) : this.#issuedClaim;
    // Fixed construction-binding control only: an already spent issued claim, without request/frame side effects.
    if (scenario === 'claim_spent') this.#issuedClaim.begin();
    if (!admitted) { this.#first = 'binding_mismatch'; this.rejectOwnership('input_rejected'); }
  }
  private reply(ok: boolean, disposition: RetirementStartDisposition) { return Object.freeze({ ...RETIREMENT_START_CLOSED, ok, disposition,
    firstReason: this.#first, retirement: this.#attempt === 'running' ? 'running' : 'not_started' }); }
  prepare() {
    if (this.#rejectedReply) return this.#rejectedReply;
    if (this.#frameUnconfirmed) return this.reply(false, 'frame_unconfirmed');
    if (this.#frame) return this.reply(false, 'preparation_in_progress');
    if (this.#prepared || this.#requested || this.#first !== 'none') return this.reply(false, 'preparation_rejected');
    return this.frameBoundary('legacy_generation');
  }
  private probeMatches(b: ProbeFrameBinding): boolean {
    return b === this.#probeBinding && b === this.#probeIssuedBinding && b.cells === this.#probeCells
      && b.target.start === this && b.seed === this.#gateSeed && b.seed.gate === b.gate
      && b.owner === this.#owner && b.scope === b.target.scope && b.epoch === b.target.epoch && b.packet === b.target.packet
      && b.pin.scope === b.scope && b.gate.matches(b.pin) && captureStartAccess.constructionMatches(this, b.scope)
      && b.draft.target === b.target && b.draft.pin === b.pin && b.entry === b.draft.entry && b.exit === b.draft.exit;
  }
  private frameBoundary(route: 'legacy_generation' | 'probe_closed'): ReturnType<RetirementStartAssembly['reply']>;
  private frameBoundary(route: 'probe_capture'): Readonly<ProbeGrantCaptureReply>;
  private frameBoundary(route: 'probe_guard'): Readonly<ProbeExitGuardReply>;
  private frameBoundary(route: 'legacy_generation' | 'probe_closed' | 'probe_capture' | 'probe_guard') {
    this.#wrapperCalls++;
    if (route === 'probe_guard') return this.guardFrame();
    if (route === 'probe_capture') return this.captureProbeGrant();
    // The same wrapper is reached, but neither a seeded start nor the probe route can start any body in stage A.
    if (this.#gateSeed || route === 'probe_closed') return this.reply(false, 'blocked_frame_execution');
    this.#frame = true;
    try { this.generationFrame(); }
    catch { retirementBindingAccess.failFrame(this.#binding); this.syncFirst(); this.request(); }
    finally {
      this.#frameExits++;
      if (this.scenario === 'frame_exit_failure') { this.#frameUnconfirmed = true; this.#retirementFirst = 'frame_unconfirmed'; }
      else this.#frame = false;
    }
    if (this.#frameUnconfirmed) { this.request(); return this.reply(false, 'frame_unconfirmed'); }
    if (this.#requested) this.request();
    return this.reply(this.#prepared && this.#first === 'none', this.#first === 'none' && this.#prepared ? 'prepared' : 'preparation_rejected');
  }
  private runMatches(link: ProbeRunLink, duty: FixedExitDuty): boolean {
    return link === this.#runLink && link === this.#runIssuedLink && duty === this.#runDuty && duty === this.#runIssuedDuty
      && link.binding === this.#probeBinding && link.cells === this.#probeCells && duty.link === link
      && this.probeMatches(link.binding);
  }
  private exitPreparationMatches(bundle: ProbeExitPreparationBundle): boolean {
    return bundle === this.#exitBundle && bundle === this.#exitIssuedBundle && bundle.start === this
      && this.#runLink === bundle.link && this.#runDuty === bundle.duty && this.runMatches(bundle.link, bundle.duty);
  }
  private guardIdentityMatches(s: ProbeExitGuardState): boolean {
    const b = this.#probeBinding, link = this.#runIssuedLink, duty = this.#runIssuedDuty, bundle = this.#exitIssuedBundle;
    return !!b && !!link && !!duty && !!bundle && s === this.#guardState && s === this.#guardIssued && s[PROBE_EXIT_GUARD] === true
      && s.bundle === bundle && this.#exitBundle === bundle && s.control === bundle.control
      && s.link === link && this.#runLink === link && s.duty === duty && this.#runDuty === duty && duty.link === link
      && s.binding === b && this.#probeIssuedBinding === b && link.binding === b && s.cells === this.#probeCells && this.#probeCells === b.cells
      && link.cells === b.cells
      && s.gate === b.gate && s.scope === b.scope && s.owner === this.#owner && s.pin === b.pin && s.epoch === b.epoch
      && s.packet === b.packet && s.frame === link.frame && s.entry === link.entry && s.exit === link.exit
      && this === b.target.start && this.#owner === b.owner && link.frame === b.cells.frame;
  }
  private guardReply(s: ProbeExitGuardState, disposition: string): Readonly<ProbeExitGuardReply> {
    return Object.freeze({ model: 'wfb-probe-exit-guard-1', ok: false, disposition,
      first: s.first, captureFirst: s.captureFirst, authority: 'none', execution: 'closed', formalIssuance: 'closed',
      wholeRunAdmission: 'disabled', implementation: 'unknown', investigations: 'on_hold' });
  }
  private guardFailure(s: ProbeExitGuardState, first: ProbeRunFirst): Readonly<ProbeExitGuardReply> {
    if (s.first === 'none') { s.first = first; s.failurePhase = s.phase; s.failureBoundary = s.boundary; }
    // Only the already validated same-duty claim may change canonical state on failure.
    if (s.exitUsed) { const c = this.#probeCells!, duty = this.#runIssuedDuty!;
      duty.state = 'unconfirmed'; c.use.state = 'unconfirmed'; c.exit.stage = 'unconfirmed';
    }
    s.state = 'failed';
    if (this.#localIssued && !this.#localIssued.terminal.committed) this.localFailure(this.#localIssued, s, first);
    return s.fixed ??= this.guardReply(s, 'exit_unconfirmed');
  }
  private guardPoint(s: ProbeExitGuardState, phase: GuardPhase, boundary: GuardBoundary): void {
    s.phase = phase; s.boundary = boundary;
    if (this.#guardScript === `g_stop_${phase}_${boundary}`) this.#captureStop = true;
    if (this.#guardScript === `g_fault_${phase}_${boundary}`) throw Error('private_exit_guard_fault');
    if (this.#guardScript === `g_reenter_${phase}_${boundary}`) s.reentry = this.guardFrame().disposition;
  }
  private guardMix(s: ProbeExitGuardState): void {
    const f = this.#guardScript.startsWith('g_mix_') ? this.#guardScript.slice(6) : '';
    if (GUARD_IDENTITY_FIELDS.includes(f)) {
      const original = (s as unknown as Readonly<Record<string, object>>)[f];
      Object.defineProperty(s, f, { value: Object.freeze({ ...original }), configurable: true });
    }
    if (f === 'copy') this.#guardState = { ...s };
    if (f === 'brand') Object.defineProperty(s, PROBE_EXIT_GUARD, { value: false });
    if (f === 'body') Object.defineProperty(this.#probeCells!.body, 'state', { value: 'running' });
    if (this.#guardScript === 'g_history_unreturned') s.returned = false;
  }
  private guardHistoryBoundary(s: ProbeExitGuardState): boolean {
    const c = this.#probeCells!, d = this.#runIssuedDuty!;
    const usePhase = !c.use.attemptUsed ? c.use.state === 'unused' && d.state === 'not_owed'
      : c.use.state === 'entering' && d.state === 'owed'
        || c.use.state === 'unconfirmed' && d.state === 'unconfirmed' && this.#grantCallStarted && this.#grantIssued === undefined;
    return s.returned && !this.#captureInProgress && c.body.state === 'not_started' && c.body.outcome === 'none' && !this.#claim.spent
      && !d.attemptUsed && d.phase === 'none' && d.boundary === 'none'
      && c.exit.candidate === undefined && c.exit.issued === undefined && c.exit.accepted === undefined && !c.exit.revoked
      && (c.exit.stage === 'empty' || c.exit.stage === 'unconfirmed') && usePhase;
  }
  private guardHistory(): GuardBranch {
    const c = this.#probeCells!, d = this.#runIssuedDuty!;
    if (!c.use.attemptUsed) return !this.#grantCallStarted && this.#grantIssued === undefined && c.grant.stage === 'empty'
      && d.state === 'not_owed' && !d.attemptUsed ? 'not_entered' : 'invalid';
    if (!this.#grantCallStarted) return this.#grantIssued === undefined && c.grant.stage === 'empty'
      && c.grant.current === undefined && c.grant.issued === undefined && c.grant.rejected === undefined && !c.grant.unresolved ? 'not_called' : 'invalid';
    if (this.#grantIssued === undefined) return c.grant.stage === 'unconfirmed' && c.grant.unresolved
      && c.grant.current === undefined && c.grant.issued === undefined && c.grant.rejected === undefined ? 'unknown' : 'invalid';
    return c.grant.stage === 'provisional' && !c.grant.unresolved && c.grant.rejected === undefined
      && this.capturedGrantMatches(this.#runIssuedLink!) ? 'known' : 'invalid';
  }
  private guardFrame(): Readonly<ProbeExitGuardReply> {
    const s = this.#guardState;
    if (!s) return Object.freeze({ ...PROBE_GUARD_CLOSED, first: 'binding_mismatch', captureFirst: 'none', disposition: 'not_ready' });
    if (s.inProgress) return this.guardReply(s, 'run_in_progress');
    if (s.fixed) return s.fixed;
    if (s.routeUsed) return this.guardReply(s, 'duplicate_run');
    s.routeUsed = true; s.inProgress = true; s.state = 'capturing';
    try {
      this.guardPoint(s, 'capture', 'before');
      const captured = this.captureProbeGrant(); s.captureFirst = captured.first; s.captureReply = captured;
      s.returned = true; s.state = 'checking';
      this.guardPoint(s, 'return', 'after'); this.guardMix(s);
      this.guardPoint(s, 'identity', 'before');
      if (!this.guardIdentityMatches(s)) return this.guardFailure(s, 'binding_mismatch');
      this.guardPoint(s, 'identity', 'after');
      this.guardPoint(s, 'history', 'before');
      if (!this.guardHistoryBoundary(s)) return this.guardFailure(s, 'state_invalid');
      s.branch = this.guardHistory();
      this.guardPoint(s, 'history', 'after');
      if (s.branch === 'not_entered') {
        s.state = 'not_entered'; if (this.#localIssued) this.#localIssued.state = 'not_entered';
        return s.fixed = this.guardReply(s, 'not_entered');
      }
      // A bad history without a use obligation must not consume an unrelated duty.
      if (!this.#probeCells!.use.attemptUsed) return this.guardFailure(s, 'state_invalid');
      this.guardPoint(s, 'claim', 'before');
      beginProbeSettling(s, this.#probeCells!, this.#runIssuedDuty!);
      this.guardPoint(s, 'claim', 'after');
      this.guardPoint(s, 'branch', 'before');
      if (s.branch === 'unknown' || s.branch === 'invalid') return this.guardFailure(s, 'state_invalid');
      this.guardPoint(s, 'branch', 'after');
      if (this.#localIssued) {
        this.localFinish(this.#localIssued, s);
        return s.fixed = this.guardReply(s, this.#localIssued.terminal.committed ? 'held_not_started' : 'exit_unconfirmed');
      }
      // B03-B deliberately stops at settling. No retirement operation or terminal success.
      return s.fixed = this.guardReply(s, 'settling_held');
    } catch {
      s.captureFirst = this.#captureFirst;
      if (this.#localIssued?.terminal.committed) {
        this.localFailure(this.#localIssued, s, 'construction_unconfirmed');
        return this.guardReply(s, 'held_not_started');
      }
      return this.guardFailure(s, 'construction_unconfirmed');
    }
    finally { s.inProgress = false; }
  }
  private guardSnapshot(): Readonly<ProbeExitGuardSnapshot> | undefined {
    const s = this.#guardIssued; if (!s) return undefined;
    return Object.freeze({ state: s.state, first: s.first, captureFirst: s.captureFirst, branch: s.branch,
      phase: s.phase, boundary: s.boundary, failurePhase: s.failurePhase, failureBoundary: s.failureBoundary,
      routeUsed: s.routeUsed, returned: s.returned, inProgress: s.inProgress, exitUsed: s.exitUsed, reentry: s.reentry,
      sameDuty: s.duty === this.#runIssuedDuty && s.control.duty === this.#runIssuedDuty,
      knowledge: this.#grantIssued ? 'known' : this.#grantCallStarted ? 'unknown' : 'not_called',
      issuerRetained: this.#grantIssued !== undefined, currentRetained: this.#probeCells?.grant.current !== undefined,
      issuedRetained: this.#probeCells?.grant.issued !== undefined, rejectedRetained: this.#probeCells?.grant.rejected !== undefined,
      captureReplyRetained: s.captureReply !== undefined, stopRequested: this.#captureStop });
  }
  private localContextMatches(p: ProbeLocalExitState, g: ProbeExitGuardState): boolean {
    return p === this.#localState && p === this.#localIssued && p[PROBE_LOCAL_EXIT] === true
      && g === this.#guardIssued && this.guardIdentityMatches(g) && p.guard === g && p.bundle === g.bundle
      && p.duty === this.#runIssuedDuty && p.control === g.control && p.retirement.duty === p.duty && p.retirement.control === p.control
      && p.absence.guard === g && p.absence.control === p.control && p.terminal.duty === p.duty && p.terminal.guard === g
      && p.terminal.absence === p.absence && p.terminal.retirement === p.retirement && p.terminal.anchor === g.bundle.terminal;
  }
  private localRouteAbsent(g: ProbeExitGuardState): boolean {
    const c = this.#probeCells!;
    return g.returned && g.routeUsed && g.inProgress && !this.#captureInProgress
      && c.body.state === 'not_started' && c.body.outcome === 'none' && g.binding.draft.executable === false && !this.#claim.spent;
  }
  private localUnsealedReady(p: ProbeLocalExitState, g: ProbeExitGuardState): boolean {
    const c = this.#probeCells!, d = this.#runIssuedDuty!;
    return this.localContextMatches(p, g) && this.localRouteAbsent(g) && g.state === 'settling' && g.exitUsed
      && d.state === 'settling' && d.attemptUsed && c.use.state === 'exiting' && c.use.attemptUsed
      && c.exit.stage === 'empty' && c.exit.candidate === undefined && c.exit.issued === undefined && c.exit.accepted === undefined
      && !c.exit.revoked && !p.terminal.committed;
  }
  private localHistoryMatches(g: ProbeExitGuardState): boolean {
    const c = this.#probeCells!;
    if (g.branch === 'not_called') return !this.#grantCallStarted && this.#grantIssued === undefined && c.grant.stage === 'empty'
      && c.grant.current === undefined && c.grant.issued === undefined && c.grant.rejected === undefined && !c.grant.unresolved;
    return g.branch === 'known' && this.#grantCallStarted && this.#grantIssued !== undefined && c.grant.stage === 'provisional'
      && !c.grant.unresolved && c.grant.rejected === undefined && this.capturedGrantMatches(this.#runIssuedLink!);
  }
  private localTargetOpen(target: CanonicalProbeGrant): boolean {
    // Owner-local qualification only; the immutable grant object and all custody references survive.
    const r = this.#localIssued?.retirement;
    return target === this.#grantIssued && !(r?.blocked === true && r.blockedTarget === target);
  }
  private localRetirementPost(p: ProbeLocalExitState): boolean {
    const r = p.retirement, c = this.#probeCells!;
    return r.used && r.blocked && r.target !== undefined && r.target === this.#grantIssued && r.blockedTarget === r.target
      && !this.localTargetOpen(r.target) && c.grant.stage === 'revoked' && !c.grant.unresolved && c.grant.rejected === undefined
      && this.capturedGrantMatches(this.#runIssuedLink!);
  }
  private localAllPost(p: ProbeLocalExitState, g: ProbeExitGuardState): boolean {
    const r = p.retirement;
    if (!this.localUnsealedReady(p, g) || p.absence.kind !== 'not_started' || !p.absence.returned || !p.absence.routeClosed
      || !p.terminal.prepared || p.terminal.kind !== 'none' || p.terminal.candidate !== undefined
      || p.terminal.issued !== undefined || p.terminal.accepted !== undefined) return false;
    if (g.branch === 'known') return r.kind === 'confirmed' && r.confirmed && r.confirmedTarget === this.#grantIssued && this.localRetirementPost(p);
    return g.branch === 'not_called' && r.kind === 'not_required' && r.confirmed && !r.used && !r.blocked
      && r.target === undefined && r.blockedTarget === undefined && r.confirmedTarget === undefined && this.localHistoryMatches(g);
  }
  private localFailure(p: ProbeLocalExitState, g: ProbeExitGuardState, reason: ProbeRunFirst): void {
    if (p.first === 'none') { p.first = reason; p.failurePhase = p.phase; p.failureBoundary = p.boundary; }
    if (p.terminal.committed) { p.deliveryUnconfirmed = true; return; }
    p.state = 'failed'; p.terminal.kind = 'exit_unconfirmed';
    if (!p.retirement.confirmed) p.retirement.kind = 'unconfirmed';
    if (g.first === 'none') g.first = reason;
    g.state = 'failed';
    if (g.exitUsed) { const d = this.#runIssuedDuty!, c = this.#probeCells!;
      d.state = 'unconfirmed'; c.use.state = 'unconfirmed'; c.exit.stage = 'unconfirmed';
    }
  }
  private localPoint(p: ProbeLocalExitState, phase: LocalPhase, boundary: Exclude<GuardBoundary, 'none'>): void {
    p.phase = phase; p.boundary = boundary;
    const d = this.#runIssuedDuty!;
    d.phase = ['prepare', 'history'].includes(phase) ? 'history' : ['attempt', 'block', 'revoke', 'confirm'].includes(phase) ? 'retire'
      : phase === 'project' ? 'project' : 'record'; d.boundary = boundary;
    const suffix = this.#localScript.replace(/^c_(?:empty_|known_first_)?/, '');
    if (suffix === `stop_${phase}_${boundary}`) this.#captureStop = true;
    if (suffix === `fault_${phase}_${boundary}`) throw Error('private_local_exit_fault');
    if (suffix === `reenter_${phase}_${boundary}`) p.reentry = this.guardFrame().disposition;
    if (phase === 'prepare' && boundary === 'before') {
      const f = this.#localScript.startsWith('c_context_') ? this.#localScript.slice(10) : '';
      if (['guard', 'bundle', 'duty', 'control'].includes(f)) Object.defineProperty(p, f, { value: Object.freeze({ ...(p as unknown as Record<string, object>)[f] }) });
      if (f === 'copy') this.#localState = { ...p };
      if (f === 'brand') Object.defineProperty(p, PROBE_LOCAL_EXIT, { value: false });
    }
    if (this.#localScript === 'c_mix_target' && phase === 'block' && boundary === 'before') p.retirement.target = Object.freeze({ ...p.retirement.target! });
    if (this.#localScript === 'c_mix_post_target' && phase === 'post' && boundary === 'before') p.retirement.target = Object.freeze({ ...p.retirement.target! });
    if (this.#localScript === 'c_mix_terminal_duty' && phase === 'post' && boundary === 'before') Object.defineProperty(p.terminal, 'duty', { value: { ...p.duty } });
  }
  private localFinish(p: ProbeLocalExitState, g: ProbeExitGuardState): void {
    p.state = 'running';
    try {
      this.localPoint(p, 'prepare', 'before');
      if (!this.localUnsealedReady(p, g)) { this.localFailure(p, g, 'binding_mismatch'); return; }
      this.localPoint(p, 'prepare', 'after');
      this.localPoint(p, 'history', 'before');
      if (!this.localHistoryMatches(g)) { this.localFailure(p, g, 'state_invalid'); return; }
      this.localPoint(p, 'history', 'after');
      const r = p.retirement;
      if (g.branch === 'known') {
        this.localPoint(p, 'attempt', 'before');
        if (!this.localUnsealedReady(p, g) || !this.localHistoryMatches(g) || r.used || !this.localTargetOpen(this.#grantIssued!)) {
          this.localFailure(p, g, 'state_invalid'); return;
        }
        r.target = this.#grantIssued!; r.used = true; r.kind = 'attempting';
        this.localPoint(p, 'attempt', 'after');
        this.localPoint(p, 'block', 'before');
        if (!this.localContextMatches(p, g) || r.target !== this.#grantIssued) { this.localFailure(p, g, 'binding_mismatch'); return; }
        r.blockedTarget = r.target; r.blocked = true;
        this.localPoint(p, 'block', 'after');
        this.localPoint(p, 'revoke', 'before'); this.#probeCells!.grant.stage = 'revoked';
        this.localPoint(p, 'revoke', 'after');
        this.localPoint(p, 'confirm', 'before');
        if (!this.localUnsealedReady(p, g) || !this.localRetirementPost(p)) { this.localFailure(p, g, 'state_invalid'); return; }
        r.confirmedTarget = r.target; r.confirmed = true; r.kind = 'confirmed';
        this.localPoint(p, 'confirm', 'after');
      } else {
        this.localPoint(p, 'not_required', 'before');
        if (!this.localUnsealedReady(p, g) || !this.localHistoryMatches(g)) { this.localFailure(p, g, 'state_invalid'); return; }
        r.kind = 'not_required'; r.confirmed = true;
        this.localPoint(p, 'not_required', 'after');
      }
      this.localPoint(p, 'absence', 'before');
      if (!this.localUnsealedReady(p, g)) { this.localFailure(p, g, 'state_invalid'); return; }
      p.absence.kind = 'not_started'; p.absence.returned = true; p.absence.routeClosed = true;
      this.localPoint(p, 'absence', 'after');
      this.localPoint(p, 'record', 'before'); p.terminal.prepared = true; this.localPoint(p, 'record', 'after');
      this.localPoint(p, 'post', 'before');
      if (!this.localAllPost(p, g)) { this.localFailure(p, g, 'state_invalid'); return; }
      this.localPoint(p, 'post', 'after');
      this.localPoint(p, 'commit', 'before');
      if (!this.localAllPost(p, g)) { this.localFailure(p, g, 'state_invalid'); return; }
      commitLocalNotStarted(p, this.#probeCells!, this.#runIssuedDuty!);
      this.localPoint(p, 'commit', 'after');
      this.localPoint(p, 'project', 'before'); this.localPoint(p, 'project', 'after');
    } catch { this.localFailure(p, g, 'construction_unconfirmed'); }
  }
  private localSnapshot(): Readonly<ProbeLocalExitSnapshot> | undefined {
    const p = this.#localIssued; if (!p) return undefined;
    const r = p.retirement, a = p.absence, t = p.terminal;
    return Object.freeze({ state: p.state, first: p.first, phase: p.phase, boundary: p.boundary,
      failurePhase: p.failurePhase, failureBoundary: p.failureBoundary, deliveryUnconfirmed: p.deliveryUnconfirmed, reentry: p.reentry,
      sameDuty: p.duty === this.#runIssuedDuty && t.duty === this.#runIssuedDuty,
      retirement: Object.freeze({ kind: r.kind, used: r.used, blocked: r.blocked, confirmed: r.confirmed, targetRetained: r.target !== undefined,
        blockedTargetRetained: r.blockedTarget !== undefined, confirmedTargetRetained: r.confirmedTarget !== undefined,
        sameTarget: r.target !== undefined && r.target === r.blockedTarget && r.target === r.confirmedTarget && r.target === this.#grantIssued,
        targetOpen: this.#grantIssued !== undefined && this.localTargetOpen(this.#grantIssued) }),
      absence: Object.freeze({ kind: a.kind, returned: a.returned, routeClosed: a.routeClosed }),
      terminal: Object.freeze({ kind: t.kind, prepared: t.prepared, committed: t.committed, sameDuty: t.duty === this.#runIssuedDuty,
        sameAbsence: t.absence === a, sameRetirement: t.retirement === r, candidateRetained: t.candidate !== undefined,
        issuedRetained: t.issued !== undefined, acceptedRetained: t.accepted !== undefined }) });
  }
  private captureReply(ok: boolean, disposition: string): Readonly<ProbeGrantCaptureReply> {
    return Object.freeze({ ok, disposition, first: this.#captureFirst });
  }
  private captureFailure(reason: ProbeRunFirst): Readonly<ProbeGrantCaptureReply> {
    if (this.#captureFirst === 'none') this.#captureFirst = reason;
    const cells = this.#runLink?.cells, duty = this.#runDuty;
    if (this.#capturePrefix === 'none' && cells && duty) this.#capturePrefix = cells.use.attemptUsed
      ? retainProbeCaptureFailure(cells, duty, this.#grantIssued, this.#grantCallStarted) : 'not_claimed';
    if (cells && cells.diagnostic.first === 'none') cells.diagnostic.first = this.#captureFirst;
    return this.#captureFixed ??= this.captureReply(false, this.#captureFirst);
  }
  private capturePoint(phase: string, boundary: string) {
    this.#capturePhase = phase; this.#captureBoundary = boundary;
    if (this.#captureScript === `stop_${phase}_${boundary}`) this.#captureStop = true;
    if (this.#captureStop) { this.#captureFirst = this.#captureFirst === 'none' ? 'closed' : this.#captureFirst; throw Error('probe_capture_stopped'); }
    if (this.#captureScript === `fault_${phase}_${boundary}`) throw Error('probe_capture_fault');
    if (this.#captureScript === `reenter_${phase}_${boundary}`) this.#captureReentry = this.frameBoundary('probe_capture').disposition;
  }
  private mintProbeGrant(link: ProbeRunLink): CanonicalProbeGrant {
    if (this.#captureScript === 'issue_throw') throw Error('probe_grant_constructor_unconfirmed');
    const b = link.binding;
    const raw: CanonicalProbeGrant = Object.freeze({ [PROBE_GRANT]: true as const, bindingOrigin: link.origin, gate: b.gate.origin,
      owner: b.owner, pin: b.pin, epoch: b.epoch, frame: link.frame, draft: b.draft, entry: link.entry, exit: link.exit, phase: 'probe_only' as const });
    const f = this.#captureScript.startsWith('grant_') ? this.#captureScript.slice(6) : '';
    const value = f === 'brand' ? Object.freeze({ ...raw, [PROBE_GRANT]: false }) as unknown as CanonicalProbeGrant
      : f === 'extra' ? Object.freeze({ ...raw, extra: true })
        : f === 'phase' ? Object.freeze({ ...raw, phase: 'foreign' }) as unknown as CanonicalProbeGrant
          : ['bindingOrigin', 'gate', 'owner', 'pin', 'epoch', 'frame', 'draft', 'entry', 'exit'].includes(f)
            ? Object.freeze({ ...raw, [f]: Object.freeze({}) }) as CanonicalProbeGrant : raw;
    // Issuer retention precedes return; a later capture fault must not lose this known reference.
    this.#grantIssued = value; this.#grantIssues++;
    return value;
  }
  private capturedGrantMatches(link: ProbeRunLink): boolean {
    const g = link.cells.grant.current, b = link.binding;
    return !!g && g === link.cells.grant.issued && g === this.#grantIssued && Reflect.ownKeys(g).length === 11 && g[PROBE_GRANT] === true
      && g.bindingOrigin === link.origin && g.gate === b.gate.origin && g.owner === b.owner && g.pin === b.pin && g.epoch === b.epoch
      && g.frame === link.frame && g.draft === b.draft && g.entry === link.entry && g.exit === link.exit && g.phase === 'probe_only';
  }
  private captureProbeGrant(): Readonly<ProbeGrantCaptureReply> {
    if (this.#captureFixed) return this.#captureFixed;
    if (this.#captureInProgress) return this.captureReply(false, 'enter_in_progress');
    const link = this.#runLink, duty = this.#runDuty;
    if (link?.cells.use.attemptUsed) { this.#captureRefusal = 'duplicate_enter'; return this.captureReply(false, 'duplicate_enter'); }
    if (this.#captureStop) return this.captureFailure('closed');
    this.#capturePhase = 'preflight'; this.#captureBoundary = 'check';
    if (this.#captureScript === 'preflight_link_copy' && link) this.#runLink = Object.freeze({ ...link });
    if (this.#captureScript === 'preflight_duty_copy' && duty) this.#runDuty = { ...duty };
    if (!link || !duty || !this.runMatches(link, duty) || duty.state !== 'not_owed' || duty.attemptUsed
      || link.cells.use.state !== 'unused' || link.cells.grant.stage !== 'empty' || link.cells.body.state !== 'not_started'
      || link.cells.exit.stage !== 'empty' || link.cells.exit.accepted !== undefined) return this.captureFailure('binding_mismatch');
    this.#captureInProgress = true;
    try {
      this.capturePoint('claim', 'before');
      beginProbeCapture(link.cells.use, duty);
      this.capturePoint('claim', 'after');
      this.capturePoint('issue', 'before');
      beginProbeGrantAttempt(link.cells.grant); this.#grantAttempts++;
      this.capturePoint('issue', 'attempt');
      this.#grantCallStarted = true; const issued = this.mintProbeGrant(link);
      this.capturePoint('issue', 'issued');
      this.capturePoint('capture', 'before');
      const current = this.#captureScript === 'grant_copy' ? Object.freeze({ ...issued }) : issued;
      const receiverIssued = this.#captureScript === 'grant_issued_copy' ? Object.freeze({ ...issued }) : current;
      captureProbeGrantReference(link.cells.grant, current, receiverIssued);
      this.capturePoint('capture', 'after');
      this.capturePoint('validate', 'before');
      if (!this.capturedGrantMatches(link)) { rejectProbeGrantReference(link.cells.grant, current); return this.captureFailure('binding_mismatch'); }
      this.#grantChecks++;
      this.capturePoint('validate', 'after');
      // No active qualification, body, grant revocation, exit record or request in B-02.
      return this.captureReply(true, 'grant_captured_body_closed');
    } catch { return this.captureFailure(this.#captureFirst === 'none' ? 'construction_unconfirmed' : this.#captureFirst); }
    finally { this.#captureInProgress = false; }
  }
  private syncFirst() {
    const first = retirementBindingAccess.first(this.#binding);
    if (this.#first === 'none' && first !== 'none') this.#first = first;
  }
  private generationFrame(): void {
    this.#generationBodyCalls++;
    if (this.scenario === 'reenter_prepare') this.#prepareReentry = this.prepare().disposition;
    const result = this.#binding.prepare(); this.#prepared = result.ok; this.syncFirst();
    if (this.scenario === 'throw_in_frame') throw new Error('synthetic_private_frame_exception');
    if (!result.ok || this.scenario === 'request_in_frame' || this.scenario === 'close_in_frame') {
      if (this.scenario === 'close_in_frame') this.close(); else this.request();
    }
  }
  request() {
    if (this.#rejectedReply) return this.#rejectedReply;
    this.#requested = true; retirementBindingAccess.stop(this.#binding);
    if (this.#attempt === 'running') return this.reply(false, 'in_progress');
    if (this.#attempt === 'binding_rejected') return this.reply(false, 'binding_rejected');
    if (this.#frameUnconfirmed) return this.reply(false, 'frame_unconfirmed');
    if (this.#frame) {
      this.#deferred = Object.freeze({ disposition: 'deferred_frame', starts: this.#starts,
        claim: this.#claim.spent ? 'spent' : 'unused', frame: 'active' });
      return this.reply(false, 'deferred_frame');
    }
    if (this.#claimOwner !== this.#owner || this.#claim !== this.#issuedClaim || this.#pin !== this.#issuedPin
      || this.#claim.owner !== this.#owner || this.#claim.pin !== this.#pin || !retirementBindingAccess.matches(this.#binding, this.#pin)) {
      return this.rejectOwnership('ownership_mismatch');
    }
    if (!this.#claim.begin()) return this.reply(false, 'in_progress');
    this.#starts++; this.#attempt = 'running';
    if (this.scenario === 'reenter_request') this.#requestReentry = this.request().disposition;
    return this.reply(true, 'blocked_field_clear');
  }
  private rejectOwnership(reason: 'ownership_mismatch' | 'input_rejected') {
    this.#attempt = 'binding_rejected'; this.#retirementFirst = reason;
    this.#rejectedReply = this.reply(false, 'binding_rejected'); return this.#rejectedReply;
  }
  rejectArguments() {
    if (this.#rejectedReply) return this.#rejectedReply;
    if (this.#first === 'none') this.#first = 'binding_mismatch';
    this.#requested = true; retirementBindingAccess.stop(this.#binding);
    return this.reply(false, 'input_rejected');
  }
  close() { if (this.#rejectedReply) return this.#rejectedReply; this.#binding.close(); this.syncFirst(); return this.request(); }
  inspect() {
    const binding = this.#binding.inspect();
    return Object.freeze({ ...RETIREMENT_START_CLOSED, firstReason: this.#first, attempt: this.#attempt, starts: this.#starts,
      claim: this.#claim.spent ? 'spent' : 'unused', frame: this.#frameUnconfirmed ? 'unconfirmed' : this.#frame ? 'active' : 'inactive', requested: this.#requested,
      frameExits: this.#frameExits, deferred: this.#deferred,
      retirementFirst: this.#retirementFirst, sourceCapture: binding.rootSlot,
      retirement: this.#attempt === 'running' ? 'running' : 'not_started',
      prepareReentry: this.#prepareReentry, requestReentry: this.#requestReentry,
      fields: this.#fields, groups: this.#groups, controlState: binding.controlState, retained: binding.retentionTable, source: binding.source });
  }
}
export function createRetirementStartFake(...args: readonly unknown[]) {
  const input = args.length === 0 ? 'normal' : args[0];
  const admitted = args.length <= 1 && typeof input === 'string' && RETIREMENT_START_SCENARIOS.includes(input);
  const a = new RetirementStartAssembly(admitted ? input as string : 'normal', admitted);
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => xs.length ? a.rejectArguments() : a.prepare(),
    request: (...xs: readonly unknown[]) => xs.length ? a.rejectArguments() : a.request(),
    close: (...xs: readonly unknown[]) => xs.length ? a.rejectArguments() : a.close(), inspect: () => a.inspect() });
}

interface StopScope { readonly scope: AdmissionScope; readonly epoch: object; readonly origin: object }
type RootStopAck = Readonly<StopScope & ({ kind: 'root_captured'; source: object; root: object }
  | { kind: 'root_not_created'; checkpoint: object })>;
type TrustedControlPin = Readonly<StopScope & ({ kind: 'minted'; control: object } | { kind: 'not_minted'; checkpoint: object })>;
type CaptureAdmission = Readonly<StopScope & { kind: 'source_backed' | 'local_only'; ack: object; pin: object; packet: object }>;
interface PreparedClearAuthorityDraft { readonly scope: AdmissionScope; readonly epoch: object; readonly admission: object;
  readonly kind: 'source_backed' | 'local_only'; readonly packet: object; readonly ready: false; readonly captureReady: 'not_connected' }
type AdmissionIssueReason = 'none' | 'binding_mismatch' | 'input_rejected' | 'not_ready' | 'stop_unconfirmed' | 'issue_unconfirmed';
type AdmissionIssueDisposition = Exclude<AdmissionIssueReason, 'none' | 'binding_mismatch'> | 'issued' | 'already_issued' | 'in_progress' | 'binding_rejected';
interface CanonicalConstructionTarget { readonly start: RetirementStartAssembly; readonly scope: AdmissionScope;
  readonly epoch: object; readonly packet: object }
let issuerConstructionAccess: Readonly<{
  target(a: CaptureAdmissionAssembly): CanonicalConstructionTarget;
  matches(a: CaptureAdmissionAssembly, t: CanonicalConstructionTarget): boolean;
  seedMatches(a: CaptureAdmissionAssembly, seed: GateConstructionSeed): boolean;
}>;
// Start-internal construction controls used only by the canonical supply construction root.
const START_MIX_SCENARIOS: readonly string[] = Object.freeze(['start_owner_copy', 'start_claim_copy', 'start_pin_copy', 'start_claim_owner',
  'start_claim_pin', 'start_claim_spent', 'start_pin_construction']);
const GATE_SEED_MIX_SCENARIOS: readonly string[] = Object.freeze(['issuer_seed_copy', 'start_seed_copy', 'binding_seed_copy']);
class CaptureAdmissionAssembly {
  readonly #gateSeed: GateConstructionSeed | undefined;
  readonly #start: RetirementStartAssembly;
  readonly #scope: AdmissionScope;
  readonly #epoch = Object.freeze({}); readonly #packetOrigin = Object.freeze({});
  readonly #ackOrigin = Object.freeze({}); readonly #pinOrigin = Object.freeze({}); readonly #admissionOrigin = Object.freeze({});
  #ack: RootStopAck | undefined; #pin: TrustedControlPin | undefined; #admission: CaptureAdmission | undefined;
  #issuedAck: RootStopAck | undefined; #issuedPin: TrustedControlPin | undefined; #issuedAdmission: CaptureAdmission | undefined;
  #authority: PreparedClearAuthorityDraft | undefined;
  #state: 'unused' | 'issuing' | 'issued' | 'unconfirmed' | 'rejected' = 'unused';
  #failure: ReturnType<CaptureAdmissionAssembly['reply']> | undefined;
  #phase: 'not_started' | 'entry' | 'seal' | 'ack' | 'pin' | 'admission' | 'authority' = 'not_started';
  #admissionFirst: AdmissionIssueReason = 'none';
  #seals = 0; #ackIssues = 0; #pinIssues = 0; #admissionIssues = 0;
  #rootGates: Readonly<Record<string, boolean | string>> | undefined;
  #reentry: string | undefined;
  static {
    issuerConstructionAccess = Object.freeze({
      seedMatches: (a: CaptureAdmissionAssembly, seed: GateConstructionSeed) => a.#gateSeed === seed && captureStartAccess.seedMatches(a.#start, seed),
      target: (a: CaptureAdmissionAssembly) => Object.freeze({ start: a.#start, scope: a.#scope, epoch: a.#epoch, packet: a.#packetOrigin }),
      matches: (a: CaptureAdmissionAssembly, t: CanonicalConstructionTarget) => t.start === a.#start && t.scope === a.#scope
        && t.epoch === a.#epoch && t.packet === a.#packetOrigin && a.#state === 'unused' && !a.#failure
        && a.scopeMatches(t.scope) && captureStartAccess.constructionMatches(a.#start, t.scope),
    });
  }
  constructor(private readonly scenario: string, admitted: boolean, gateSeed?: GateConstructionSeed) {
    this.#gateSeed = scenario === 'issuer_seed_copy' && gateSeed ? Object.freeze({ ...gateSeed }) : gateSeed;
    this.#start = new RetirementStartAssembly(GATE_SEED_MIX_SCENARIOS.includes(scenario) ? scenario : START_MIX_SCENARIOS.includes(scenario) ? scenario.slice('start_'.length) : ['source_unknown', 'frame_exit_failure', 'source_rejected', 'prepare_failure', 'control_unconfirmed'].includes(scenario) ? scenario : 'normal', admitted, gateSeed);
    const base = captureStartAccess.scope(this.#start);
    this.#scope = scenario.startsWith('scope_') ? Object.freeze({ ...base, [scenario.slice(6)]: Object.freeze({}) }) : base;
    if (!admitted) this.reject('input_rejected');
  }
  private reply(ok: boolean, disposition: AdmissionIssueDisposition) { return Object.freeze({ ...RETIREMENT_START_CLOSED, ok, disposition,
    firstReason: this.#start.inspect().firstReason, admissionFirst: this.#admissionFirst }); }
  private reject(reason: Exclude<AdmissionIssueReason, 'none'>) {
    if (this.#admissionFirst === 'none') this.#admissionFirst = reason;
    this.#state = reason === 'binding_mismatch' || reason === 'input_rejected' ? 'rejected' : 'unconfirmed';
    this.#failure = this.reply(false, reason === 'binding_mismatch' ? 'binding_rejected' : reason); return this.#failure;
  }
  private fault(at: string): void { if (this.scenario === at) throw new Error('private_capture_issue'); }
  private scopeMatches(s: AdmissionScope): boolean {
    const expected = captureStartAccess.scope(this.#start);
    return s === this.#scope && Object.keys(s).length === 5 && s.owner === expected.owner && s.construction === expected.construction
      && s.retention === expected.retention && s.sourceSlot === expected.sourceSlot && s.claim === expected.claim;
  }
  private probe<T extends StopScope>(value: T, label: string): T {
    if (this.scenario === label + '_copy') return Object.freeze({ ...value });
    if (!this.scenario.startsWith(label + '_')) return value;
    const key = this.scenario.slice(label.length + 1);
    const fields = label === 'ack' ? ['scope_copy', 'epoch', 'origin', 'source', 'root', 'checkpoint', 'variant', 'extra']
      : label === 'pin' ? ['scope_copy', 'epoch', 'origin', 'control', 'checkpoint', 'variant', 'extra']
        : ['scope_copy', 'epoch', 'origin', 'ack', 'pin', 'packet', 'variant', 'extra'];
    if (!fields.includes(key)) return value;
    return Object.freeze({ ...value, ...(key === 'scope_copy' ? { scope: Object.freeze({ ...value.scope }) }
      : key === 'variant' ? { kind: 'invalid' } : key === 'extra' ? { extra: Object.freeze({}) } : { [key]: Object.freeze({}) }) });
  }
  private ackMatches(c: Exclude<OwnedStopContext, Readonly<{ kind: 'unconfirmed' }>>): boolean {
    const a = this.#ack;
    if (!a || a !== this.#issuedAck || !this.scopeMatches(a.scope) || a.epoch !== this.#epoch || a.origin !== this.#ackOrigin || a.kind !== c.kind) return false;
    return a.kind === 'root_captured' && c.kind === 'root_captured'
      ? Object.keys(a).length === 6 && a.source === c.source && a.root === c.root
      : a.kind === 'root_not_created' && c.kind === 'root_not_created' && Object.keys(a).length === 5 && a.checkpoint === c.checkpoint;
  }
  private pinMatches(c: Exclude<OwnedStopContext, Readonly<{ kind: 'unconfirmed' }>>): boolean {
    const p = this.#pin;
    if (!p || p !== this.#issuedPin || !this.scopeMatches(p.scope) || p.epoch !== this.#epoch || p.origin !== this.#pinOrigin
      || Object.keys(p).length !== 5 || p.kind !== c.control.kind) return false;
    return p.kind === 'minted' && c.control.kind === 'minted' ? p.control === c.control.origin
      : p.kind === 'not_minted' && c.control.kind === 'not_minted' && p.checkpoint === c.control.checkpoint;
  }
  private admissionMatches(kind: 'source_backed' | 'local_only'): boolean {
    const a = this.#admission;
    return !!a && a === this.#issuedAdmission && Object.keys(a).length === 7 && this.scopeMatches(a.scope)
      && a.epoch === this.#epoch && a.origin === this.#admissionOrigin && a.kind === kind
      && a.ack === this.#ackOrigin && a.pin === this.#pinOrigin && a.packet === this.#packetOrigin;
  }
  prepare() { return this.#failure ?? this.#start.prepare(); }
  admit() {
    if (this.#failure) return this.#failure;
    if (this.#state !== 'unused') return this.reply(false, this.#state === 'issuing' ? 'in_progress' : 'already_issued');
    this.#phase = 'entry';
    try {
    this.#start.request();
    if (!captureStartAccess.ready(this.#start)) return this.reject('not_ready');
    if (!this.scopeMatches(this.#scope)) return this.reject('binding_mismatch');
    this.#state = 'issuing';
    if (this.scenario === 'reenter_issue') this.#reentry = this.admit().disposition;
    const context = captureStartAccess.context(this.#start);
    if (context.kind === 'unconfirmed') return this.reject('stop_unconfirmed');
    if (context.kind === 'root_captured') {
      this.#phase = 'seal';
      this.#seals++;
      this.fault('seal_before');
      if (!captureStartAccess.seal(this.#start)) return this.reject('stop_unconfirmed');
      this.fault('seal_after');
    }
    this.#phase = 'ack'; this.fault('ack_before');
    const ack: RootStopAck = context.kind === 'root_captured'
      ? Object.freeze({ scope: this.#scope, epoch: this.#epoch, origin: this.#ackOrigin, kind: 'root_captured', source: context.source, root: context.root })
      : Object.freeze({ scope: this.#scope, epoch: this.#epoch, origin: this.#ackOrigin, kind: 'root_not_created', checkpoint: context.checkpoint });
    this.#ack = this.probe(ack, 'ack'); this.#issuedAck = this.scenario === 'ack_copy' ? ack : this.#ack;
    if (!this.ackMatches(context)) return this.reject('binding_mismatch');
    this.#ackIssues++;
    this.fault('ack_after'); this.#phase = 'pin'; this.fault('pin_before');
    const pin: TrustedControlPin = context.control.kind === 'minted'
      ? Object.freeze({ scope: this.#scope, epoch: this.#epoch, origin: this.#pinOrigin, kind: 'minted', control: context.control.origin })
      : Object.freeze({ scope: this.#scope, epoch: this.#epoch, origin: this.#pinOrigin, kind: 'not_minted', checkpoint: context.control.checkpoint });
    this.#pin = this.probe(pin, 'pin'); this.#issuedPin = this.scenario === 'pin_copy' ? pin : this.#pin;
    if (!this.pinMatches(context)) return this.reject('binding_mismatch');
    this.#pinIssues++;
    this.fault('pin_after'); this.#phase = 'admission'; this.fault('admission_before');
    const kind = context.kind === 'root_captured' ? 'source_backed' : 'local_only';
    const admission: CaptureAdmission = Object.freeze({ scope: this.#scope, epoch: this.#epoch, origin: this.#admissionOrigin,
      kind, ack: this.#ack.origin, pin: this.#pin.origin, packet: this.#packetOrigin });
    this.#admission = this.probe(admission, 'admission'); this.#issuedAdmission = this.scenario === 'admission_copy' ? admission : this.#admission;
    if (!this.admissionMatches(kind)) return this.reject('binding_mismatch');
    this.#admissionIssues++;
    this.fault('admission_after'); this.#phase = 'authority'; this.fault('authority_failure');
    this.#authority = Object.freeze({ scope: this.#scope, epoch: this.#epoch, admission: this.#admission.origin,
      kind, packet: this.#packetOrigin, ready: false, captureReady: 'not_connected' });
    if (this.scenario === 'probe_gates') this.#rootGates = captureStartAccess.probe(this.#start);
    this.#state = 'issued'; return this.reply(true, 'issued');
    } catch { return this.reject(this.#phase === 'seal' ? 'stop_unconfirmed' : 'issue_unconfirmed'); }
  }
  rejectArguments() { if (this.#failure) return this.#failure; this.#start.request(); return this.reject('input_rejected'); }
  close() { return this.#failure ?? this.#start.close(); }
  inspect() { const start = this.#start.inspect(); return Object.freeze({ ...RETIREMENT_START_CLOSED, state: this.#state,
    stopAck: this.#ack?.kind ?? 'not_issued', controlPin: this.#pin?.kind ?? 'not_issued', admission: this.#admission?.kind ?? 'not_issued',
    clearAuthority: this.#authority?.captureReady ?? 'not_issued', clearAuthorityMode: this.#authority?.kind ?? 'not_issued',
    firstReason: start.firstReason, rootGates: this.#rootGates, controlState: start.controlState,
    admissionFirst: this.#admissionFirst, phase: this.#phase, reentry: this.#reentry,
    retainedProducts: Object.freeze({ ack: !!this.#issuedAck, pin: !!this.#issuedPin, admission: !!this.#issuedAdmission, authority: !!this.#authority }),
    sealAttempts: this.#seals, ackIssues: this.#ackIssues, pinIssues: this.#pinIssues, admissionIssues: this.#admissionIssues,
    retained: start.retained, source: start.source }); }
}
const CAPTURE_ADMISSION_SCENARIOS = Object.freeze(['normal', 'probe_gates', 'reenter_issue', 'source_unknown', 'frame_exit_failure', 'source_rejected', 'prepare_failure', 'control_unconfirmed',
  ...['owner', 'construction', 'retention', 'sourceSlot', 'claim', 'extra'].map(f => 'scope_' + f),
  ...['copy', 'scope_copy', 'epoch', 'origin', 'source', 'root', 'checkpoint', 'variant', 'extra'].map(f => 'ack_' + f),
  ...['copy', 'scope_copy', 'epoch', 'origin', 'control', 'checkpoint', 'variant', 'extra'].map(f => 'pin_' + f),
  ...['copy', 'scope_copy', 'epoch', 'origin', 'ack', 'pin', 'packet', 'variant', 'extra'].map(f => 'admission_' + f),
  'seal_before', 'seal_after', 'ack_before', 'ack_after', 'pin_before', 'pin_after', 'admission_before', 'admission_after', 'authority_failure']);
export function createCaptureAdmissionFake(...args: readonly unknown[]) {
  const input = args.length === 0 ? 'normal' : args[0];
  const admitted = args.length <= 1 && typeof input === 'string' && CAPTURE_ADMISSION_SCENARIOS.includes(input);
  const a = new CaptureAdmissionAssembly(admitted ? input as string : 'normal', admitted);
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => xs.length ? a.rejectArguments() : a.prepare(),
    admit: (...xs: readonly unknown[]) => xs.length ? a.rejectArguments() : a.admit(),
    close: (...xs: readonly unknown[]) => xs.length ? a.rejectArguments() : a.close(), inspect: () => a.inspect() });
}

const CONSTRUCTION_TARGET_BRAND: unique symbol = Symbol('canonical-supply-construction');
const CONSTRUCTION_CLAIM_BRAND: unique symbol = Symbol('canonical-supply-claim');
interface BoundConstruction extends CanonicalConstructionTarget { readonly [CONSTRUCTION_TARGET_BRAND]: true }
interface ConstructionClaim { readonly [CONSTRUCTION_CLAIM_BRAND]: true; readonly target: BoundConstruction; readonly state: 'unused' }
// The same real issuer/start, but no calls to prepare/request/admit/close or Journal readers.
class CanonicalSupplyConstruction {
  readonly #failure: { first: 'none' | 'input_rejected' | 'construction_unconfirmed' | 'binding_mismatch' | 'duplicate_preparation' | 'closed'; phase: number; boundary: string };
  readonly #slots: { stage: SupplyConstructionStage; value: object | undefined }[];
  #frame = false; #started = false; #closed = false; #bound = false;
  #reply: Readonly<{ ok: boolean; disposition: string; first: string }> | undefined;
  #reentry: string | undefined;
  constructor(private readonly script: string, admitted: boolean) {
    this.#failure = { first: admitted ? 'none' : 'input_rejected', phase: 0, boundary: 'none' };
    this.#slots = Array.from({ length: 35 }, () => ({ stage: 'not_started', value: undefined }));
  }
  private result(ok: boolean, disposition: string) { return Object.freeze({ ok, disposition, first: this.#failure.first }); }
  private reject(reason: 'input_rejected' | 'construction_unconfirmed' | 'binding_mismatch' | 'duplicate_preparation' | 'closed') {
    if (this.#failure.first === 'none') this.#failure.first = reason;
    return this.#reply ??= this.result(false, reason);
  }
  private fault(phase: number, boundary: string) {
    this.#failure.phase = phase; this.#failure.boundary = boundary;
    if (this.script === `${boundary}_${phase}`) throw Error('private_canonical_construction');
  }
  private mint<T extends object>(n: number, operation: () => T): T {
    this.fault(n, 'before'); const s = this.#slots[n - 1];
    if (!supplyStageAllows(s.stage, 'attempting')) throw Error('construction_stage');
    s.stage = 'attempting'; this.fault(n, 'attempt');
    const v = operation(); s.value = v; s.stage = 'provisional'; this.fault(n, 'after');
    s.stage = 'confirmed'; this.fault(n, 'done'); return v;
  }
  private probe(t: BoundConstruction): BoundConstruction {
    if (this.script === 'target_brand') return Object.freeze({ ...t, [CONSTRUCTION_TARGET_BRAND]: false }) as unknown as BoundConstruction;
    if (this.script === 'target_extra') return Object.freeze({ ...t, extra: true });
    if (this.script === 'start_copy') return Object.freeze({ ...t, start: Object.freeze({}) }) as unknown as BoundConstruction;
    if (this.script === 'scope_copy') return Object.freeze({ ...t, scope: Object.freeze({ ...t.scope }) });
    if (this.script === 'epoch' || this.script === 'packet') return Object.freeze({ ...t, [this.script]: Object.freeze({}) });
    return t;
  }
  private matches(): boolean {
    const issuer = this.#slots[31].value as CaptureAdmissionAssembly | undefined;
    const issued = this.#slots[32].value as BoundConstruction | undefined;
    const claim = this.#slots[33].value as ConstructionClaim | undefined;
    const t = this.#slots[34].value as BoundConstruction | undefined;
    return !!issuer && !!issued && !!claim && !!t && t === issued && Reflect.ownKeys(t).length === 5
      && t[CONSTRUCTION_TARGET_BRAND] === true && claim[CONSTRUCTION_CLAIM_BRAND] === true && claim.target === issued && claim.state === 'unused'
      && issuerConstructionAccess.matches(issuer, t)
      && this.#slots.slice(0, 31).every(s => s.stage === 'confirmed' && !!s.value);
  }
  prepare() {
    if (this.#reply) return this.#reply;
    if (this.#frame) return this.result(false, 'construction_in_progress');
    if (this.#failure.first !== 'none') return this.reject(this.#failure.first);
    if (this.#closed) return this.result(false, 'closed');
    if (this.#started) return this.reject('duplicate_preparation');
    this.#started = true; this.#frame = true;
    try {
      this.mint(1, () => Object.freeze({ kind: 'result_shell', value: undefined }));
      this.mint(2, () => ({ kind: 'supply_slot', state: 'unbound' }));
      this.mint(3, () => Object.freeze({ kind: 'packet_holder', reference: undefined }));
      this.mint(4, () => SUPPLY_FIELDS);
      for (let i = 0; i < 25; i++) this.mint(i + 5, () => Object.freeze({ cell: i + 1, field: SUPPLY_FIELDS[i], reference: undefined }));
      this.mint(30, () => Object.freeze({ kind: 'admission_use_slot', state: 'unused' }));
      this.mint(31, () => Object.freeze({ kind: 'writer_gate_holder', reference: undefined }));
      if (this.script === 'reenter') this.#reentry = this.prepare().disposition;
      if (this.script === 'close_in_frame') this.close();
      if (this.#closed) return this.reject('closed');
      const issuer = this.mint(32, () => new CaptureAdmissionAssembly((this.script.startsWith('scope_') && this.script !== 'scope_copy')
        || START_MIX_SCENARIOS.includes(this.script) ? this.script : 'normal', this.script !== 'issuer_rejected'));
      const issued = this.mint(33, () => {
        const t = Object.freeze({ ...issuerConstructionAccess.target(issuer), [CONSTRUCTION_TARGET_BRAND]: true as const });
        return this.probe(t);
      });
      this.mint(34, () => Object.freeze({ [CONSTRUCTION_CLAIM_BRAND]: this.script !== 'claim_brand',
        target: this.script === 'claim_target' ? Object.freeze({ ...issued }) : issued,
        state: this.script === 'claim_state' ? 'spent' : 'unused' }) as unknown as ConstructionClaim);
      this.mint(35, () => this.script === 'target_copy' ? Object.freeze({ ...issued }) : issued);
      this.#failure.phase = 35; this.#failure.boundary = 'binding';
      if (!this.matches()) return this.reject('binding_mismatch');
      (this.#slots[1].value as { state: string }).state = 'bound'; this.#bound = true;
      return this.result(true, 'bound_only');
    } catch { return this.reject('construction_unconfirmed'); }
    finally { this.#frame = false; }
  }
  check() {
    if (this.#reply) return this.#reply;
    if (this.#frame) return this.result(false, 'construction_in_progress');
    if (this.#failure.first !== 'none') return this.reject(this.#failure.first);
    if (!this.#started && this.#closed) return this.result(false, 'closed');
    if (!this.#bound) return this.result(false, 'not_ready');
    if (!this.matches()) return this.reject('binding_mismatch');
    return this.result(false, 'blocked_supply');
  }
  close() {
    if (this.#reply) return this.#reply;
    this.#closed = true; // Outer stop only. Do not invoke existing issuer.close()/request().
    if (this.#frame) return this.result(false, 'deferred_frame');
    return this.#started ? this.reject('closed') : this.result(false, 'closed');
  }
  rejectInput() { return this.reject('input_rejected'); }
  inspect() {
    const issuer = this.#slots[31].value as CaptureAdmissionAssembly | undefined;
    return Object.freeze({ model: 'wfb-canonical-supply-construction-1', bound: this.#bound, first: this.#failure.first,
      phase: this.#failure.phase, boundary: this.#failure.boundary, retained: this.#slots.filter(s => !!s.value).length,
      stages: Object.freeze(this.#slots.map(s => s.stage)), frame: this.#frame ? 'active' : 'inactive', reentry: this.#reentry,
      issuer: issuer?.inspect(), layout: this.#slots[3].value ? SUPPLY_FIELDS : undefined,
      issuerCaptures: Number(!!issuer), sourcePreparations: 0, writerStop: 'not_connected', journalSupply: 'not_connected',
      supplyConsumptions: 0, admissionConsumptions: 0, packetObjects: 0, cellObjects: 0, finalAnchor: 'not_issued', proofIssuance: 'closed' });
  }
}
export function createCanonicalSupplyConstructionFake(...args: readonly unknown[]) {
  const s = args.length ? args[0] : 'normal';
  const scripts = ['normal', 'reenter', 'close_in_frame', 'target_copy', 'target_brand', 'target_extra', 'start_copy', 'scope_copy', 'epoch', 'packet',
    'claim_brand', 'claim_target', 'claim_state', 'scope_owner', 'scope_construction', 'scope_retention', 'scope_sourceSlot', 'scope_claim', 'scope_extra',
    ...START_MIX_SCENARIOS, 'issuer_rejected'];
  const valid = args.length <= 1 && typeof s === 'string' && (scripts.includes(s) || /^(before|attempt|after|done)_([1-9]|[12][0-9]|3[0-5])$/.test(s));
  const a = new CanonicalSupplyConstruction(valid ? s as string : 'normal', valid);
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.prepare(),
    check: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.check(),
    close: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.close(), inspect: () => a.inspect() });
}

const CANONICAL_GATE_PIN: unique symbol = Symbol('canonical-gate-pin');
const CANONICAL_GATE_SEED: unique symbol = Symbol('canonical-gate-seed');
const CANONICAL_FRAME_DRAFT: unique symbol = Symbol('canonical-frame-draft');
interface GateConstructionSeed { readonly [CANONICAL_GATE_SEED]: true; readonly origin: object; readonly gate: CanonicalDraftGate }
interface CanonicalGatePin extends AdmissionScope { readonly [CANONICAL_GATE_PIN]: true;
  readonly gate: object; readonly scope: AdmissionScope; readonly epoch: object }
interface NonExecutingFrameDraft { readonly [CANONICAL_FRAME_DRAFT]: true; readonly kind: 'probe_only'; readonly executable: false;
  readonly gate: object; readonly pin: CanonicalGatePin; readonly target: CanonicalConstructionTarget; readonly entry: object; readonly exit: object }
const PROBE_CELLS: unique symbol = Symbol('probe-frame-cells');
const PROBE_BINDING: unique symbol = Symbol('probe-frame-binding');
type ProbeUseCell = { state: 'unused'; attemptUsed: false }
  | { state: 'entering' | 'active' | 'exiting' | 'unconfirmed'; attemptUsed: true };
const PROBE_GRANT: unique symbol = Symbol('private-probe-grant-type'); // Issuance is restricted to the separate synthetic B-02 entry.
interface CanonicalProbeGrant { readonly [PROBE_GRANT]: true; readonly bindingOrigin: object; readonly gate: object; readonly owner: object;
  readonly pin: CanonicalGatePin; readonly epoch: object; readonly frame: object; readonly draft: NonExecutingFrameDraft;
  readonly entry: object; readonly exit: object; readonly phase: 'probe_only' }
type ProbeGrantCell = { stage: 'empty'; current: undefined; issued: undefined; rejected: undefined; unresolved: false }
  | { stage: 'attempting'; current: undefined; issued: undefined; rejected: undefined; unresolved: true }
  | { stage: 'provisional' | 'active' | 'revoked'; current: CanonicalProbeGrant; issued: CanonicalProbeGrant; rejected: CanonicalProbeGrant | undefined; unresolved: false }
  | { stage: 'unconfirmed'; current: CanonicalProbeGrant | undefined; issued: CanonicalProbeGrant | undefined; rejected: CanonicalProbeGrant | undefined; unresolved: true };
type ProbeBodyCell = { state: 'not_started' | 'running'; outcome: 'none' }
  | { state: 'returned'; outcome: 'return' } | { state: 'threw'; outcome: 'throw' } | { state: 'cancelled'; outcome: 'cancel' }
  | { state: 'unconfirmed'; outcome: 'none' | 'return' | 'throw' | 'cancel' };
type ProbeExitCell = { stage: 'empty'; candidate: undefined; issued: undefined; accepted: undefined; revoked: false }
  | { stage: 'unsealed' | 'unconfirmed'; candidate: undefined; issued: undefined; accepted: undefined; revoked: boolean };
type ProbeRunFirst = 'none' | 'input_rejected' | 'binding_mismatch' | 'construction_unconfirmed' | 'closed' | 'state_invalid' | 'internal_unconfirmed';
interface ProbeDiagnosticCell { first: ProbeRunFirst; frameFirst: ProbeRunFirst; producerFirst: ProbeRunFirst; probeFirst: ProbeRunFirst }
interface ProbeCellBundle { readonly [PROBE_CELLS]: true; readonly owner: object; readonly use: ProbeUseCell; readonly frame: object;
  readonly grant: ProbeGrantCell; readonly body: ProbeBodyCell; readonly exit: ProbeExitCell; readonly diagnostic: ProbeDiagnosticCell }
interface ProbeFrameBinding { readonly [PROBE_BINDING]: true; readonly seed: GateConstructionSeed; readonly target: CanonicalConstructionTarget;
  readonly gate: CanonicalDraftGate; readonly pin: CanonicalGatePin; readonly scope: AdmissionScope; readonly owner: object;
  readonly epoch: object; readonly packet: object; readonly draft: NonExecutingFrameDraft; readonly entry: object; readonly exit: object; readonly cells: ProbeCellBundle }
const PROBE_RUN_LINK: unique symbol = Symbol('probe-run-link');
const PROBE_DUTY: unique symbol = Symbol('probe-exit-duty');
interface ProbeRunLink { readonly [PROBE_RUN_LINK]: true; readonly origin: object; readonly binding: ProbeFrameBinding;
  readonly cells: ProbeCellBundle; readonly frame: object; readonly entry: object; readonly exit: object }
type ExitDutyState = { state: 'not_owed'; attemptUsed: false } | { state: 'owed'; attemptUsed: false }
  | { state: 'settling' | 'settled_not_started' | 'settled_unsealed'; attemptUsed: true } | { state: 'unconfirmed'; attemptUsed: boolean };
type DutyExitPhase = 'none' | 'guard' | 'history' | 'retire' | 'record' | 'project';
type DutyExitBoundary = 'none' | 'before' | 'after';
type DutyExitProgress = { phase: 'none'; boundary: 'none' }
  | { phase: Exclude<DutyExitPhase, 'none'>; boundary: Exclude<DutyExitBoundary, 'none'> };
type FixedExitDuty = ExitDutyState & { readonly [PROBE_DUTY]: true; readonly link: ProbeRunLink } & DutyExitProgress;
interface ProbeRunSeal { readonly link: ProbeRunLink; readonly duty: FixedExitDuty; readonly executable: false }
// Value contracts are not proof constructors. B03-A live slots can only be idle/unobserved/none.
type ProbeExitKnowledgeValue = { kind: 'not_called'; callStarted: false; issuer: false; receiver: false; canonical: false }
  | { kind: 'known'; callStarted: true; issuer: true } & ({ receiver: boolean; canonical: false } | { receiver: true; canonical: true })
  | { kind: 'unknown'; callStarted: true; issuer: false; receiver: false; canonical: false };
type ProbeLocalRetirementValue = { kind: 'not_attempted'; used: false; blocked: false; target: false }
  | { kind: 'not_required'; used: false; blocked: boolean; target: false }
  | { kind: 'confirmed'; used: true; blocked: true; target: true }
  | { kind: 'unconfirmed'; used: boolean; blocked: boolean; target: boolean };
type ProbeBodyAbsenceValue = { kind: 'unobserved'; started: false; returned: false; outcome: 'none' }
  | { kind: 'not_started'; started: false; returned: true; outcome: 'none' }
  | { kind: 'completed'; started: true; returned: true; outcome: 'return' | 'throw' | 'cancel' }
  | { kind: 'unconfirmed'; started: boolean; returned: boolean; outcome: 'none' | 'return' | 'throw' | 'cancel' };
type ProbeExitTerminalValue = { kind: 'none'; accepted: false }
  | { kind: 'held_not_started'; accepted: false; body: 'not_started'; duty: 'settled_not_started'; exitUsed: true }
  | { kind: 'held_unsealed'; accepted: false; body: 'completed'; duty: 'settled_unsealed'; exitUsed: true }
  | { kind: 'exit_unconfirmed'; accepted: false; duty: 'unconfirmed'; exitUsed: boolean };
const PROBE_EXIT_CONTROL: unique symbol = Symbol('private-probe-exit-control');
const PROBE_EXIT_BUNDLE: unique symbol = Symbol('private-probe-exit-preparation');
type ProbeExitControlValue = { readonly state: 'idle'; readonly captureReturned: false }
  | { readonly state: 'checking' | 'settling' | 'terminal'; readonly captureReturned: true };
type ProbeExitControl = { readonly [PROBE_EXIT_CONTROL]: true; readonly link: ProbeRunLink; readonly duty: FixedExitDuty;
  readonly binding: ProbeFrameBinding; readonly cells: ProbeCellBundle; readonly start: RetirementStartAssembly;
} & Extract<ProbeExitControlValue, { state: 'idle' }>;
interface ProbeLocalRetirementSlot { readonly duty: FixedExitDuty; readonly control: ProbeExitControl;
  readonly kind: 'not_attempted'; readonly used: false; readonly blocked: false; readonly target: undefined }
interface ProbeBodyAbsenceSlot { readonly duty: FixedExitDuty; readonly control: ProbeExitControl;
  readonly kind: 'unobserved'; readonly started: false; readonly returned: false }
interface ProbeNotStartedTerminalSlot { readonly duty: FixedExitDuty; readonly control: ProbeExitControl; readonly absence: ProbeBodyAbsenceSlot;
  readonly kind: 'none'; readonly candidate: undefined; readonly issued: undefined; readonly accepted: undefined }
interface ProbeExitPreparationBundle { readonly [PROBE_EXIT_BUNDLE]: true; readonly link: ProbeRunLink; readonly duty: FixedExitDuty;
  readonly start: RetirementStartAssembly; readonly control: ProbeExitControl; readonly retirement: ProbeLocalRetirementSlot;
  readonly absence: ProbeBodyAbsenceSlot; readonly terminal: ProbeNotStartedTerminalSlot }
interface ProbeExitPreparationReply { readonly model: 'wfb-probe-exit-preparation-1'; readonly ok: boolean; readonly disposition: string;
  readonly first: ProbeRunFirst; readonly execution: 'closed'; readonly formalIssuance: 'closed'; readonly authority: 'none';
  readonly wholeRunAdmission: 'disabled'; readonly implementation: 'unknown'; readonly investigations: 'on_hold' }
const PROBE_EXIT_GUARD: unique symbol = Symbol('private-probe-exit-guard');
type GuardPhase = 'none' | 'capture' | 'return' | 'identity' | 'history' | 'claim' | 'branch';
type GuardBoundary = 'none' | 'before' | 'after';
type GuardBranch = 'none' | 'not_entered' | 'not_called' | 'known' | 'unknown' | 'invalid';
interface ProbeExitGuardState {
  readonly [PROBE_EXIT_GUARD]: true; readonly bundle: ProbeExitPreparationBundle; readonly link: ProbeRunLink; readonly duty: FixedExitDuty;
  readonly control: ProbeExitControl; readonly binding: ProbeFrameBinding; readonly cells: ProbeCellBundle;
  readonly gate: CanonicalDraftGate; readonly scope: AdmissionScope; readonly owner: object; readonly pin: CanonicalGatePin;
  readonly epoch: object; readonly packet: object; readonly frame: object; readonly entry: object; readonly exit: object;
  state: 'idle' | 'capturing' | 'checking' | 'settling' | 'not_entered' | 'failed';
  routeUsed: boolean; returned: boolean; inProgress: boolean; exitUsed: boolean;
  first: ProbeRunFirst; captureFirst: ProbeRunFirst; branch: GuardBranch; phase: GuardPhase; boundary: GuardBoundary;
  failurePhase: GuardPhase; failureBoundary: GuardBoundary; reentry: string;
  fixed: Readonly<ProbeExitGuardReply> | undefined; captureReply: Readonly<ProbeGrantCaptureReply> | undefined;
}
const PROBE_GUARD_CLOSED = Object.freeze({ model: 'wfb-probe-exit-guard-1' as const, ok: false as const, authority: 'none' as const,
  execution: 'closed' as const, formalIssuance: 'closed' as const, wholeRunAdmission: 'disabled' as const,
  implementation: 'unknown' as const, investigations: 'on_hold' as const });
interface ProbeExitGuardReply { readonly model: 'wfb-probe-exit-guard-1'; readonly ok: false; readonly disposition: string;
  readonly first: ProbeRunFirst; readonly captureFirst: ProbeRunFirst; readonly authority: 'none'; readonly execution: 'closed';
  readonly formalIssuance: 'closed'; readonly wholeRunAdmission: 'disabled'; readonly implementation: 'unknown'; readonly investigations: 'on_hold' }
interface ProbeExitGuardSnapshot { readonly state: string; readonly first: ProbeRunFirst; readonly captureFirst: ProbeRunFirst;
  readonly branch: GuardBranch; readonly phase: GuardPhase; readonly boundary: GuardBoundary; readonly failurePhase: GuardPhase;
  readonly failureBoundary: GuardBoundary; readonly routeUsed: boolean; readonly returned: boolean; readonly inProgress: boolean;
  readonly exitUsed: boolean; readonly reentry: string; readonly sameDuty: boolean; readonly knowledge: 'known' | 'unknown' | 'not_called';
  readonly issuerRetained: boolean; readonly currentRetained: boolean; readonly issuedRetained: boolean; readonly rejectedRetained: boolean;
  readonly captureReplyRetained: boolean; readonly stopRequested: boolean }
const GUARD_IDENTITY_FIELDS = Object.freeze(['bundle', 'control', 'link', 'duty', 'binding', 'cells', 'gate', 'scope', 'owner', 'pin',
  'epoch', 'packet', 'frame', 'entry', 'exit']);
const PROBE_LOCAL_EXIT: unique symbol = Symbol('private-probe-local-exit');
type LocalPhase = 'none' | 'prepare' | 'history' | 'attempt' | 'block' | 'revoke' | 'confirm' | 'not_required' | 'absence' | 'record' | 'post' | 'commit' | 'project';
interface LocalRetirementStorage {
  readonly duty: FixedExitDuty; readonly control: ProbeExitControl;
  kind: 'not_attempted' | 'attempting' | 'confirmed' | 'not_required' | 'unconfirmed'; used: boolean; blocked: boolean; confirmed: boolean;
  target: CanonicalProbeGrant | undefined; blockedTarget: CanonicalProbeGrant | undefined; confirmedTarget: CanonicalProbeGrant | undefined;
}
interface LocalAbsenceStorage { readonly guard: ProbeExitGuardState; readonly control: ProbeExitControl;
  kind: 'unobserved' | 'not_started'; returned: boolean; routeClosed: boolean }
interface LocalTerminalStorage { readonly duty: FixedExitDuty; readonly guard: ProbeExitGuardState; readonly absence: LocalAbsenceStorage;
  readonly retirement: LocalRetirementStorage; readonly anchor: ProbeNotStartedTerminalSlot;
  kind: 'none' | 'held_not_started' | 'exit_unconfirmed'; prepared: boolean; committed: boolean;
  readonly candidate: undefined; readonly issued: undefined; readonly accepted: undefined }
interface ProbeLocalExitState { readonly [PROBE_LOCAL_EXIT]: true; readonly guard: ProbeExitGuardState; readonly bundle: ProbeExitPreparationBundle;
  readonly duty: FixedExitDuty; readonly control: ProbeExitControl; readonly retirement: LocalRetirementStorage; readonly absence: LocalAbsenceStorage;
  readonly terminal: LocalTerminalStorage; state: 'idle' | 'running' | 'held_not_started' | 'failed' | 'not_entered';
  first: ProbeRunFirst; phase: LocalPhase; boundary: GuardBoundary; failurePhase: LocalPhase; failureBoundary: GuardBoundary;
  deliveryUnconfirmed: boolean; reentry: string }
interface ProbeLocalExitSnapshot { readonly state: string; readonly first: ProbeRunFirst; readonly phase: LocalPhase; readonly boundary: GuardBoundary;
  readonly failurePhase: LocalPhase; readonly failureBoundary: GuardBoundary; readonly deliveryUnconfirmed: boolean; readonly reentry: string;
  readonly sameDuty: boolean; readonly retirement: Readonly<{ kind: string; used: boolean; blocked: boolean; confirmed: boolean; targetRetained: boolean;
    blockedTargetRetained: boolean; confirmedTargetRetained: boolean; sameTarget: boolean; targetOpen: boolean }>;
  readonly absence: Readonly<{ kind: string; returned: boolean; routeClosed: boolean }>;
  readonly terminal: Readonly<{ kind: string; prepared: boolean; committed: boolean; sameDuty: boolean; sameAbsence: boolean; sameRetirement: boolean;
    candidateRetained: boolean; issuedRetained: boolean; acceptedRetained: boolean }> }
interface ProbeLocalExitReply { readonly model: 'wfb-probe-local-exit-1'; readonly ok: false; readonly authority: 'none'; readonly execution: 'closed';
  readonly formalIssuance: 'closed'; readonly wholeRunAdmission: 'disabled'; readonly implementation: 'unknown'; readonly investigations: 'on_hold';
  readonly first: ProbeRunFirst; readonly captureFirst: ProbeRunFirst; readonly disposition: string }
function commitLocalNotStarted(p: ProbeLocalExitState, cells: ProbeCellBundle, duty: FixedExitDuty): void {
  // Direct writes only: the last all-post guard precedes this private linearization point.
  duty.state = 'settled_not_started'; cells.use.state = 'exiting'; cells.exit.stage = 'unsealed'; cells.exit.revoked = p.retirement.kind === 'confirmed';
  p.terminal.kind = 'held_not_started'; p.terminal.committed = true; p.state = 'held_not_started';
}
const LOCAL_KNOWN_PHASES = Object.freeze(['prepare', 'history', 'attempt', 'block', 'revoke', 'confirm', 'absence', 'record', 'post', 'commit', 'project'] as const);
const LOCAL_EMPTY_PHASES = Object.freeze(['prepare', 'history', 'not_required', 'absence', 'record', 'post', 'commit', 'project'] as const);
function localGuardScript(script: string): string {
  if (script.startsWith('c_empty_')) return 'g_not_called';
  if (script.startsWith('c_known_first_')) return 'g_known_issuer';
  return ['c_not_called', 'c_reserved_not_called', 'c_known_issuer', 'c_unknown', 'c_not_entered', 'c_stop_capture_before', 'c_stop_capture_claim', 'c_stop_capture_known'].includes(script)
    || script.startsWith('c_invalid_') ? 'g_' + script.slice(2) : 'g_normal';
}
function guardCaptureScript(script: string): string {
  const plans: Readonly<Record<string, string>> = { g_not_called: 'fault_claim_after', g_reserved_not_called: 'fault_issue_attempt',
    g_known_issuer: 'fault_issue_issued', g_unknown: 'issue_throw', g_not_entered: 'fault_claim_before',
    g_stop_capture_before: 'stop_claim_before', g_stop_capture_claim: 'stop_claim_after', g_stop_capture_known: 'stop_capture_after' };
  return script.startsWith('g_invalid_') ? 'grant_' + script.slice(10) : plans[script] ?? 'normal';
}
function beginProbeSettling(s: ProbeExitGuardState, cells: ProbeCellBundle, duty: FixedExitDuty): void {
  duty.state = 'settling'; duty.attemptUsed = true; duty.phase = 'guard'; duty.boundary = 'after';
  cells.use.state = 'exiting'; s.exitUsed = true; s.state = 'settling';
}
interface ProbeExitAxisFacts { knowledge: ProbeExitKnowledgeValue['kind'] | 'foreign'; callStarted: boolean; issuer: boolean; receiver: boolean; canonical: boolean;
  retirement: ProbeLocalRetirementValue['kind'] | 'foreign'; retireUsed: boolean; blocked: boolean; target: boolean;
  body: ProbeBodyAbsenceValue['kind'] | 'foreign'; started: boolean; returned: boolean; outcome: string;
  terminal: ProbeExitTerminalValue['kind'] | 'foreign'; accepted: boolean; duty: string; exitUsed: boolean; phase: string; boundary: string }
function probeExitAxesValid(f: ProbeExitAxisFacts): boolean {
  if (f.accepted) return false;
  if (!['none', 'guard', 'history', 'retire', 'record', 'project'].includes(f.phase)
    || !['none', 'before', 'after'].includes(f.boundary) || (f.phase === 'none') !== (f.boundary === 'none')) return false;
  if (!['not_called', 'known', 'unknown'].includes(f.knowledge)
    || f.callStarted !== (f.knowledge !== 'not_called') || f.issuer !== (f.knowledge === 'known')
    || f.knowledge !== 'known' && (f.receiver || f.canonical) || f.canonical && !f.receiver) return false;
  if (!['not_attempted', 'not_required', 'confirmed', 'unconfirmed'].includes(f.retirement)
    || f.retirement === 'not_attempted' && (f.retireUsed || f.blocked || f.target)
    || f.retirement === 'not_required' && (f.retireUsed || f.target || f.knowledge !== 'not_called')
    || f.retirement === 'confirmed' && (!f.retireUsed || !f.blocked || !f.target || !f.canonical)) return false;
  if (!['unobserved', 'not_started', 'completed', 'unconfirmed'].includes(f.body)
    || !['none', 'return', 'throw', 'cancel'].includes(f.outcome)
    || f.body === 'unobserved' && (f.started || f.returned || f.outcome !== 'none')
    || f.body === 'not_started' && (f.started || !f.returned || f.outcome !== 'none')
    || f.body === 'completed' && (!f.started || !f.returned || f.outcome === 'none')) return false;
  if (!['not_owed', 'owed', 'settling', 'settled_not_started', 'settled_unsealed', 'unconfirmed'].includes(f.duty)
    || ['not_owed', 'owed'].includes(f.duty) && f.exitUsed
    || ['settling', 'settled_not_started', 'settled_unsealed'].includes(f.duty) && !f.exitUsed) return false;
  if (f.terminal === 'none') return !['settled_not_started', 'settled_unsealed'].includes(f.duty);
  if (f.terminal === 'exit_unconfirmed') return f.duty === 'unconfirmed';
  if (f.terminal === 'held_not_started') return f.body === 'not_started' && f.duty === 'settled_not_started'
    && ['confirmed', 'not_required'].includes(f.retirement);
  if (f.terminal === 'held_unsealed') return f.body === 'completed' && f.duty === 'settled_unsealed' && f.retirement === 'confirmed';
  return false;
}
function probeExitAxisShape(script: string): ProbeExitAxisFacts {
  const f: ProbeExitAxisFacts = { knowledge: 'not_called', callStarted: false, issuer: false, receiver: false, canonical: false,
    retirement: 'not_attempted', retireUsed: false, blocked: false, target: false, body: 'unobserved', started: false, returned: false,
    outcome: 'none', terminal: 'none', accepted: false, duty: 'not_owed', exitUsed: false, phase: 'none', boundary: 'none' };
  const s = script.startsWith('axis_') ? script.slice(5) : 'idle';
  if (['known', 'known_rejected', 'retirement_unknown', 'retired', 'held_known', 'held_body', 'confirmed_unspent', 'confirmed_unblocked',
    'confirmed_targetless', 'confirmed_uncanonical', 'held_wrong_body', 'held_wrong_duty', 'completed_none', 'completed_unreturned', 'completed_unstarted',
    'not_required_known', 'held_body_unretired'].includes(s)) {
    Object.assign(f, { knowledge: 'known', callStarted: true, issuer: true, receiver: true, canonical: true });
  }
  if (s === 'known_rejected') f.canonical = false;
  if (s === 'unknown' || s === 'unknown_issuer') { f.knowledge = 'unknown'; f.callStarted = true; }
  if (['retired', 'held_known', 'held_body', 'confirmed_unspent', 'confirmed_unblocked', 'confirmed_targetless', 'held_wrong_body',
    'held_wrong_duty', 'completed_none', 'completed_unreturned', 'completed_unstarted', 'confirmed_uncanonical'].includes(s)) Object.assign(f, { retirement: 'confirmed', retireUsed: true, blocked: true, target: true });
  if (s === 'retirement_unknown') f.retirement = 'unconfirmed';
  if (['held_empty', 'held_known', 'held_wrong_body', 'held_wrong_duty', 'held_unretired'].includes(s)) Object.assign(f, {
    body: 'not_started', returned: true, terminal: 'held_not_started', duty: 'settled_not_started', exitUsed: true });
  if (s === 'held_empty') f.retirement = 'not_required';
  if (['held_body', 'completed_none', 'completed_unreturned', 'completed_unstarted', 'held_body_unretired'].includes(s)) Object.assign(f, {
    body: 'completed', started: true, returned: true, outcome: 'return', terminal: 'held_unsealed', duty: 'settled_unsealed', exitUsed: true });
  const bad: Readonly<Record<string, Partial<ProbeExitAxisFacts>>> = {
    phase: { phase: 'foreign', boundary: 'before' }, boundary: { phase: 'guard', boundary: 'foreign' }, phase_pair: { phase: 'guard' }, accepted: { accepted: true },
    knowledge: { knowledge: 'foreign', callStarted: true }, not_called_started: { callStarted: true }, unknown_issuer: { issuer: true },
    receiver_without_issuer: { receiver: true }, canonical_without_receiver: { knowledge: 'known', callStarted: true, issuer: true, canonical: true },
    retirement: { retirement: 'foreign' }, unused_retirement_used: { retireUsed: true }, unused_retirement_blocked: { blocked: true },
    unused_retirement_target: { target: true }, confirmed_unspent: { retireUsed: false }, confirmed_unblocked: { blocked: false },
    not_required_used: { retirement: 'not_required', retireUsed: true }, not_required_target: { retirement: 'not_required', target: true },
    not_required_known: { retirement: 'not_required' },
    confirmed_targetless: { target: false }, confirmed_uncanonical: { canonical: false }, body: { body: 'foreign' }, unobserved_started: { started: true },
    unobserved_returned: { returned: true }, unobserved_outcome: { outcome: 'return' }, completed_none: { outcome: 'none' },
    completed_unreturned: { returned: false }, terminal: { terminal: 'foreign' }, duty: { duty: 'foreign' }, duty_unowed_spent: { exitUsed: true },
    not_started_started: { body: 'not_started', started: true, returned: true }, not_started_unreturned: { body: 'not_started' },
    not_started_outcome: { body: 'not_started', returned: true, outcome: 'throw' }, completed_unstarted: { started: false },
    outcome: { body: 'unconfirmed', outcome: 'foreign' }, settled_without_terminal: { duty: 'settled_not_started', exitUsed: true },
    unconfirmed_wrong_duty: { terminal: 'exit_unconfirmed' },
    duty_settling_unspent: { duty: 'settling' }, held_wrong_body: { body: 'unobserved', returned: false }, held_wrong_duty: { duty: 'settled_unsealed' },
  };
  Object.assign(f, bad[s]);
  const phase = /^phase_(guard|history|retire|record|project)_(before|after)$/.exec(s);
  if (phase) { f.phase = phase[1]; f.boundary = phase[2]; }
  return f;
}
const PROBE_EXIT_AXIS_SCRIPTS = Object.freeze(['idle', 'known', 'known_rejected', 'unknown', 'retirement_unknown', 'retired', 'held_empty', 'held_known',
  'held_body', 'phase', 'boundary', 'phase_pair', 'accepted', 'knowledge', 'not_called_started', 'unknown_issuer', 'receiver_without_issuer',
  'canonical_without_receiver', 'retirement', 'unused_retirement_used', 'unused_retirement_blocked', 'unused_retirement_target', 'confirmed_unspent',
  'confirmed_unblocked', 'confirmed_targetless', 'confirmed_uncanonical', 'body', 'unobserved_started', 'unobserved_returned', 'unobserved_outcome', 'completed_none',
  'completed_unreturned', 'terminal', 'duty', 'duty_unowed_spent', 'duty_settling_unspent', 'held_wrong_body', 'held_wrong_duty',
  'not_required_used', 'not_required_target', 'not_required_known', 'not_started_started', 'not_started_unreturned', 'not_started_outcome',
  'completed_unstarted', 'outcome', 'settled_without_terminal', 'unconfirmed_wrong_duty', 'held_unretired', 'held_body_unretired',
  ...['guard', 'history', 'retire', 'record', 'project'].flatMap(p => ['before', 'after'].map(b => `phase_${p}_${b}`))].map(s => 'axis_' + s));
interface ProbeStateFacts { use: string; attempt: boolean; grant: string; references: boolean; unresolved: boolean;
  body: string; outcome: string; exit: string; accepted: boolean; duty: string; dutyUsed: boolean }
interface ProbeGrantCaptureReply { readonly ok: boolean; readonly disposition: string; readonly first: ProbeRunFirst }
interface ProbeGrantCaptureSnapshot { readonly first: ProbeRunFirst; readonly phase: string; readonly boundary: string;
  readonly grantAttempts: number; readonly grantIssues: number; readonly grantChecks: number; readonly inProgress: boolean;
  readonly stopRequested: boolean; readonly refusal: string; readonly reentry: string; readonly prefix: string; readonly issuerRetained: boolean;
  readonly obligationOwed: boolean; readonly sameDuty: boolean }
// Fixed direct assignments on canonical private cells. No allocation, hook, callback or await in the claim section.
function beginProbeCapture(use: ProbeUseCell, duty: FixedExitDuty): void {
  use.state = 'entering'; use.attemptUsed = true; duty.state = 'owed';
}
function beginProbeGrantAttempt(grant: ProbeGrantCell): void { grant.stage = 'attempting'; grant.unresolved = true; }
function captureProbeGrantReference(grant: ProbeGrantCell, current: CanonicalProbeGrant, issued: CanonicalProbeGrant): void {
  grant.current = current; grant.issued = issued; grant.unresolved = false; grant.stage = 'provisional';
}
function rejectProbeGrantReference(grant: ProbeGrantCell, rejected: CanonicalProbeGrant): void { grant.rejected = rejected; }
type ProbeCapturePrefix = 'none' | 'not_claimed' | 'claimed_not_issued' | 'grant_known' | 'grant_unknown';
// Known prefixes keep use=entering and the owed duty for the later fixed exit; only an uncaptured constructor result is unknown.
function retainProbeCaptureFailure(cells: ProbeCellBundle, duty: FixedExitDuty, issued: CanonicalProbeGrant | undefined,
  callStarted: boolean): Exclude<ProbeCapturePrefix, 'none' | 'not_claimed'> {
  if (issued !== undefined) {
    if (cells.grant.current === undefined) cells.grant.current = issued;
    if (cells.grant.issued === undefined) cells.grant.issued = issued;
    cells.grant.stage = 'provisional'; cells.grant.unresolved = false;
    return 'grant_known';
  }
  if (callStarted) {
    cells.use.state = 'unconfirmed'; duty.state = 'unconfirmed'; cells.exit.stage = 'unconfirmed';
    cells.grant.stage = 'unconfirmed'; cells.grant.unresolved = true;
    return 'grant_unknown';
  }
  cells.grant.stage = 'empty'; cells.grant.unresolved = false;
  return 'claimed_not_issued';
}
function probeStateFactsValid(f: ProbeStateFacts): boolean {
  if (!['unused', 'entering', 'active', 'exiting', 'unconfirmed'].includes(f.use)
    || f.attempt !== (f.use !== 'unused') || f.accepted) return false;
  if (!['empty', 'attempting', 'provisional', 'active', 'revoked', 'unconfirmed'].includes(f.grant)
    || (f.grant === 'empty' || f.grant === 'attempting') && f.references
    || ['provisional', 'active', 'revoked'].includes(f.grant) && !f.references
    || f.unresolved !== (f.grant === 'attempting' || f.grant === 'unconfirmed')) return false;
  if (!['not_started', 'running', 'returned', 'threw', 'cancelled', 'unconfirmed'].includes(f.body)
    || (f.body === 'not_started' || f.body === 'running') && f.outcome !== 'none'
    || f.body === 'returned' && f.outcome !== 'return' || f.body === 'threw' && f.outcome !== 'throw'
    || f.body === 'cancelled' && f.outcome !== 'cancel' || !['none', 'return', 'throw', 'cancel'].includes(f.outcome)) return false;
  if (!['empty', 'unsealed', 'unconfirmed'].includes(f.exit)
    || !['not_owed', 'owed', 'settling', 'settled_unsealed', 'unconfirmed'].includes(f.duty)
    || ['not_owed', 'owed'].includes(f.duty) && f.dutyUsed
    || ['settling', 'settled_unsealed'].includes(f.duty) && !f.dutyUsed) return false;
  if (f.use === 'unused') return f.grant === 'empty' && f.body === 'not_started' && f.exit === 'empty' && f.duty === 'not_owed';
  if (f.duty === 'not_owed') return false;
  if (f.use === 'entering') return ['empty', 'attempting', 'provisional'].includes(f.grant) && f.body === 'not_started' && f.exit === 'empty' && f.duty === 'owed';
  if (f.use === 'active') return f.grant === 'active' && f.exit === 'empty' && f.duty === 'owed' && f.body !== 'unconfirmed';
  if (f.use === 'exiting') return ['not_started', 'returned', 'threw', 'cancelled'].includes(f.body)
    && !['attempting', 'unconfirmed'].includes(f.grant)
    && (f.body === 'not_started' || ['active', 'revoked'].includes(f.grant)) && ['settling', 'settled_unsealed'].includes(f.duty)
    && (f.duty !== 'settled_unsealed' || f.grant === 'revoked' && f.exit === 'unsealed' && ['returned', 'threw', 'cancelled'].includes(f.body));
  return f.duty === 'unconfirmed' && f.exit === 'unconfirmed';
}
const PROBE_SHAPE_SCRIPTS = Object.freeze(['unused', 'entering', 'active', 'exiting', 'unsealed', 'unconfirmed',
  'unused_spent', 'entering_unspent', 'active_empty', 'active_provisional', 'running_revoked', 'accepted', 'finished',
  'duty_unspent', 'unsealed_active', 'empty_reference', 'outcome_mismatch', 'unknown_variant', 'before_use_body',
  'exiting_empty', 'exiting_provisional_body', 'unconfirmed_finished', 'active_no_reference', 'active_unresolved', 'returned_cancel',
  'exiting_exit_unknown', 'active_duty_used', 'entering_active_grant', 'active_body_unconfirmed', 'active_unsealed', 'exiting_running',
  'exiting_attempting', 'exiting_owed', 'unconfirmed_settled'].map(s => 'shape_' + s));
// Valid baselines; each isolated shape changes one fact so exactly one relation clause rejects it.
const SHAPE_BASE: Readonly<Record<'entering' | 'active' | 'exiting' | 'unconfirmed', ProbeStateFacts>> = Object.freeze({
  entering: { use: 'entering', attempt: true, grant: 'empty', references: false, unresolved: false, body: 'not_started', outcome: 'none',
    exit: 'empty', accepted: false, duty: 'owed', dutyUsed: false },
  active: { use: 'active', attempt: true, grant: 'active', references: true, unresolved: false, body: 'running', outcome: 'none',
    exit: 'empty', accepted: false, duty: 'owed', dutyUsed: false },
  exiting: { use: 'exiting', attempt: true, grant: 'active', references: true, unresolved: false, body: 'returned', outcome: 'return',
    exit: 'empty', accepted: false, duty: 'settling', dutyUsed: true },
  unconfirmed: { use: 'unconfirmed', attempt: true, grant: 'unconfirmed', references: false, unresolved: true, body: 'unconfirmed', outcome: 'none',
    exit: 'unconfirmed', accepted: false, duty: 'unconfirmed', dutyUsed: true },
});
const ISOLATED_SHAPES: Readonly<Record<string, readonly [keyof typeof SHAPE_BASE, Partial<ProbeStateFacts>]>> = Object.freeze({
  unconfirmed_finished: ['unconfirmed', { use: 'finished' }], active_no_reference: ['active', { references: false }],
  active_unresolved: ['active', { unresolved: true }], returned_cancel: ['exiting', { outcome: 'cancel' }],
  exiting_exit_unknown: ['exiting', { exit: 'foreign' }], active_duty_used: ['active', { dutyUsed: true }],
  entering_active_grant: ['entering', { grant: 'active', references: true }], active_body_unconfirmed: ['active', { body: 'unconfirmed' }],
  active_unsealed: ['active', { exit: 'unsealed' }], exiting_running: ['exiting', { body: 'running', outcome: 'none' }],
  exiting_attempting: ['exiting', { body: 'not_started', outcome: 'none', grant: 'attempting', references: false, unresolved: true }],
  exiting_owed: ['exiting', { duty: 'owed', dutyUsed: false }], unconfirmed_settled: ['unconfirmed', { duty: 'settled_unsealed' }],
});
function probeShapeFacts(script: string): ProbeStateFacts {
  const f: ProbeStateFacts = { use: 'unused', attempt: false, grant: 'empty', references: false, unresolved: false,
    body: 'not_started', outcome: 'none', exit: 'empty', accepted: false, duty: 'not_owed', dutyUsed: false };
  const s = script.slice(6);
  const isolated = ISOLATED_SHAPES[s];
  if (isolated) return { ...SHAPE_BASE[isolated[0]], ...isolated[1] };
  if (['entering', 'entering_unspent'].includes(s)) Object.assign(f, { use: 'entering', attempt: s !== 'entering_unspent', duty: 'owed' });
  if (['active', 'active_empty', 'active_provisional', 'running_revoked'].includes(s)) Object.assign(f, { use: 'active', attempt: true,
    grant: s === 'active_empty' ? 'empty' : s === 'active_provisional' ? 'provisional' : s === 'running_revoked' ? 'revoked' : 'active',
    references: s !== 'active_empty', body: 'running', duty: 'owed' });
  if (['unsealed', 'duty_unspent', 'unsealed_active'].includes(s)) Object.assign(f, { use: 'exiting', attempt: true,
    grant: s === 'unsealed_active' ? 'active' : 'revoked', references: true, body: 'returned', outcome: 'return', exit: 'unsealed', duty: 'settled_unsealed', dutyUsed: s !== 'duty_unspent' });
  if (s === 'unconfirmed') Object.assign(f, { use: 'unconfirmed', attempt: true, grant: 'unconfirmed', unresolved: true,
    body: 'unconfirmed', exit: 'unconfirmed', duty: 'unconfirmed', dutyUsed: true });
  if (['exiting', 'exiting_empty', 'exiting_provisional_body'].includes(s)) Object.assign(f, { use: 'exiting', attempt: true,
    grant: s === 'exiting_empty' ? 'empty' : s === 'exiting_provisional_body' ? 'provisional' : 'active',
    references: s !== 'exiting_empty', body: 'returned', outcome: 'return', duty: 'settling', dutyUsed: true });
  if (s === 'unused_spent') f.attempt = true;
  if (s === 'accepted') f.accepted = true;
  if (s === 'finished') f.use = 'finished';
  if (s === 'empty_reference') f.references = true;
  if (s === 'outcome_mismatch') f.outcome = 'throw';
  if (s === 'unknown_variant') f.grant = 'foreign';
  if (s === 'before_use_body') { f.body = 'returned'; f.outcome = 'return'; }
  return f;
}
interface ProbeRunReply { readonly model: 'wfb-probe-run-preparation-1' | 'wfb-probe-grant-capture-1'; readonly ok: boolean; readonly disposition: string;
  readonly first: ProbeRunFirst; readonly authority: 'none'; readonly execution: 'closed'; readonly formalIssuance: 'closed';
  readonly wholeRunAdmission: 'disabled'; readonly implementation: 'unknown'; readonly investigations: 'on_hold' }
function runFirst(value: string): ProbeRunFirst {
  return ['none', 'input_rejected', 'binding_mismatch', 'construction_unconfirmed', 'closed', 'state_invalid'].includes(value)
    ? value as ProbeRunFirst : 'internal_unconfirmed';
}
function runEnum(value: unknown, allowed: readonly string[], fallback: string): string {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}
class CanonicalDraftGate {
  readonly origin = Object.freeze({});
  #scope: AdmissionScope | undefined; #epoch: object | undefined;
  #pin: CanonicalGatePin | undefined; #issued: CanonicalGatePin | undefined;
  #bound = false;
  issue(s: AdmissionScope, epoch: object, script: string): CanonicalGatePin {
    if (this.#scope) throw Error('duplicate_canonical_pin');
    this.#scope = s; this.#epoch = epoch;
    const raw = Object.freeze({ [CANONICAL_GATE_PIN]: true as const, gate: this.origin, scope: s, epoch, ...s });
    const field = script.startsWith('pin_') ? script.slice(4) : '';
    const candidate = ['gate', 'scope', 'owner', 'construction', 'retention', 'sourceSlot', 'claim', 'epoch'].includes(field)
      ? Object.freeze({ ...raw, [field]: Object.freeze({}) }) as CanonicalGatePin
      : field === 'brand' ? Object.freeze({ ...raw, [CANONICAL_GATE_PIN]: false }) as unknown as CanonicalGatePin
        : field === 'extra' ? Object.freeze({ ...raw, extra: true }) : raw;
    this.#issued = candidate; this.#pin = field === 'copy' ? Object.freeze({ ...candidate }) : candidate;
    return this.#pin;
  }
  matches(p: CanonicalGatePin): boolean {
    const s = this.#scope;
    return !!s && p === this.#pin && p === this.#issued && Reflect.ownKeys(p).length === 9 && p[CANONICAL_GATE_PIN] === true
      && p.gate === this.origin && p.scope === s && p.owner === s.owner && p.construction === s.construction
      && p.retention === s.retention && p.sourceSlot === s.sourceSlot && p.claim === s.claim && p.epoch === this.#epoch;
  }
  bind(p: CanonicalGatePin): boolean { if (this.#bound || !this.matches(p)) return false; this.#bound = true; return true; }
  inspect() { return Object.freeze({ state: this.#bound ? 'open' : 'unbound', pinRetained: !!this.#issued, bound: this.#bound }); }
}
const BODY_CONTEXT: unique symbol = Symbol('body-seed-context');
const BODY_ORIGIN: unique symbol = Symbol('body-seed-origin');
const BODY_SENTINEL: unique symbol = Symbol('body-seed-sentinel');
const BODY_ROUTE_PIN: unique symbol = Symbol('body-seed-route-pin');
interface BodyConstructionContext {
  readonly [BODY_CONTEXT]: true; readonly seed: GateConstructionSeed; readonly binding: ProbeFrameBinding;
  readonly cells: ProbeCellBundle; readonly link: ProbeRunLink; readonly duty: FixedExitDuty; readonly control: ProbeExitControl;
  readonly start: RetirementStartAssembly; readonly bindingOwner: object; readonly cellOwner: object; readonly scope: AdmissionScope;
  readonly pin: CanonicalGatePin; readonly epoch: object; readonly packet: object; readonly frame: object; readonly entry: object; readonly exit: object;
  readonly runSeal: ProbeRunSeal; readonly exitBundle: ProbeExitPreparationBundle;
}
interface FixedBodyOrigin { readonly [BODY_ORIGIN]: true; readonly context: BodyConstructionContext; readonly kind: 'fixed_probe_body' }
interface FixedBodySentinel<K extends 'throw' | 'cancel'> { readonly [BODY_SENTINEL]: true; readonly context: BodyConstructionContext;
  readonly bodyOrigin: FixedBodyOrigin; readonly kind: K }
interface FixedBodyRoutePin { readonly [BODY_ROUTE_PIN]: true; readonly context: BodyConstructionContext; readonly bodyOrigin: FixedBodyOrigin;
  readonly throwSentinel: FixedBodySentinel<'throw'>; readonly cancelSentinel: FixedBodySentinel<'cancel'>;
  readonly grantSlot: ProbeGrantCell; readonly kind: 'fixed_body'; readonly executable: false }
type BodyConstructionStage = 'not_started' | 'attempting' | 'issued' | 'provisional' | 'confirmed';
type BodyCarrierIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
const BODY_CARRIER_KINDS = Object.freeze(['context', 'origin', 'throw_sentinel', 'cancel_sentinel', 'route_pin', 'progress', 'closure',
  'diagnostic', 'retirement', 'terminal', 'unwind', 'bundle', 'draft'] as const);
interface BodyConstructionCell { readonly index: BodyCarrierIndex; readonly kind: typeof BODY_CARRIER_KINDS[number]; stage: BodyConstructionStage;
  attemptReserved: boolean; callBoundaryReached: boolean; issued: object | undefined; current: object | undefined; rejected: object | undefined }
interface BodyPreparationShell { readonly failure: { first: string; phase: number; boundary: string };
  slots: (BodyConstructionCell | undefined)[] | undefined; state: 'building' | 'held' | 'failed'; readonly ready: false;
  readonly execution: 'closed'; readonly bindAttemptUsed: false; readonly bindStage: 'not_attempted' }
interface BodySeedReply { readonly model: 'wfb-body-slot-seed-1'; readonly ok: false; readonly first: ProbeRunFirst; readonly disposition: string;
  readonly authority: 'none'; readonly execution: 'closed'; readonly formalIssuance: 'closed'; readonly wholeRunAdmission: 'disabled';
  readonly implementation: 'unknown'; readonly investigations: 'on_hold' }
const BODY_CONTEXT_FIELDS = Object.freeze(['seed', 'binding', 'cells', 'link', 'duty', 'control', 'start', 'bindingOwner', 'cellOwner',
  'scope', 'pin', 'epoch', 'packet', 'frame', 'entry', 'exit', 'runSeal', 'exitBundle']);
const BODY_DATA_FIELDS = Object.freeze([BODY_CONTEXT_FIELDS, ['context', 'kind'], ['context', 'bodyOrigin', 'kind'],
  ['context', 'bodyOrigin', 'kind'], ['context', 'bodyOrigin', 'throwSentinel', 'cancelSentinel', 'grantSlot', 'kind', 'executable']]);
const BODY_DATA_BRANDS = Object.freeze([BODY_CONTEXT, BODY_ORIGIN, BODY_SENTINEL, BODY_SENTINEL, BODY_ROUTE_PIN]);
const BODY_SEED_PHASES = Object.freeze(['none', ...Array.from({ length: 15 }, (_, i) => `BS${String(i).padStart(2, '0')}`),
  ...Array.from({ length: 6 }, (_, i) => `BC${String(i).padStart(2, '0')}`)]);
const BODY_SEED_BOUNDARIES = Object.freeze(['none', 'before', 'attempt', 'retained', 'done', 'after', 'issued', 'captured', 'checked', 'confirmed']);
function bodySeedShape(value: object, keys: readonly PropertyKey[]): boolean {
  return Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === keys.length
    && keys.every(key => { const d = Object.getOwnPropertyDescriptor(value, key); return !!d && 'value' in d; });
}
const BODY_PROGRESS: unique symbol = Symbol('body-initial-progress');
const BODY_CLOSURE: unique symbol = Symbol('body-initial-closure');
const BODY_DIAGNOSTIC: unique symbol = Symbol('body-initial-diagnostic');
const BODY_RETIREMENT: unique symbol = Symbol('body-initial-retirement');
const BODY_TERMINAL: unique symbol = Symbol('body-initial-terminal');
const BODY_UNWIND: unique symbol = Symbol('body-initial-unwind');
interface BodyProgressInitial {
  readonly [BODY_PROGRESS]: true; readonly pin: FixedBodyRoutePin; readonly bodyCell: ProbeBodyCell;
  activationConfirmed: false; callReserved: false; entryObserved: false; returnCaptured: false; callPhase: 'body_not_called'; outcome: 'none';
}
interface BodyRouteClosureInitial {
  readonly [BODY_CLOSURE]: true; readonly pin: FixedBodyRoutePin; readonly progress: BodyProgressInitial;
  bodyEntryClosed: false; controlReturned: false; continuationState: 'unobserved';
}
interface BodyDiagnosticInitial {
  readonly [BODY_DIAGNOSTIC]: true; readonly context: BodyConstructionContext;
  readonly rootFailure: { first: string; phase: number; boundary: string }; readonly cellDiagnostic: ProbeDiagnosticCell;
  probeFirst: 'none'; exitFirst: 'none'; deliveryFirst: 'none'; failurePhase: 'none'; failureBoundary: 'none'; refusal: 'none';
}
interface BodyRetirementInitial {
  readonly [BODY_RETIREMENT]: true; readonly pin: FixedBodyRoutePin; readonly duty: FixedExitDuty; readonly control: ProbeExitControl;
  kind: 'not_attempted'; used: false; blocked: false; confirmed: false;
  target: undefined; blockedTarget: undefined; confirmedTarget: undefined;
}
interface BodyTerminalInitial {
  readonly [BODY_TERMINAL]: true; readonly pin: FixedBodyRoutePin; readonly duty: FixedExitDuty; readonly progress: BodyProgressInitial;
  readonly retirement: BodyRetirementInitial; readonly terminalAnchor: ProbeNotStartedTerminalSlot;
  kind: 'none'; prepared: false; committed: false; readonly candidate: undefined; readonly issued: undefined; readonly accepted: undefined;
}
interface BodyUnwindInitial {
  readonly [BODY_UNWIND]: true; readonly context: BodyConstructionContext; readonly pin: FixedBodyRoutePin;
  readonly progress: BodyProgressInitial; readonly closure: BodyRouteClosureInitial; readonly diagnostic: BodyDiagnosticInitial;
  readonly retirement: BodyRetirementInitial; readonly terminal: BodyTerminalInitial;
  state: 'idle'; routeUsed: false; inProgress: false; phase: 'none'; boundary: 'none'; fixedReply: undefined;
}
interface BodyLiveReply extends Omit<BodySeedReply, 'model'> { readonly model: 'wfb-body-live-initial-1' }
const BODY_LIVE_BRANDS = Object.freeze([BODY_PROGRESS, BODY_CLOSURE, BODY_DIAGNOSTIC, BODY_RETIREMENT, BODY_TERMINAL, BODY_UNWIND]);
const BODY_LIVE_REFS = Object.freeze([
  ['pin', 'bodyCell'], ['pin', 'progress'], ['context', 'rootFailure', 'cellDiagnostic'], ['pin', 'duty', 'control'],
  ['pin', 'duty', 'progress', 'retirement', 'terminalAnchor', 'candidate', 'issued', 'accepted'],
  ['context', 'pin', 'progress', 'closure', 'diagnostic', 'retirement', 'terminal'],
]);
const BODY_LIVE_PROGRESS = Object.freeze([
  ['activationConfirmed', 'callReserved', 'entryObserved', 'returnCaptured', 'callPhase', 'outcome'],
  ['bodyEntryClosed', 'controlReturned', 'continuationState'], ['probeFirst', 'exitFirst', 'deliveryFirst', 'failurePhase', 'failureBoundary', 'refusal'],
  ['kind', 'used', 'blocked', 'confirmed', 'target', 'blockedTarget', 'confirmedTarget'], ['kind', 'prepared', 'committed'],
  ['state', 'routeUsed', 'inProgress', 'phase', 'boundary', 'fixedReply'],
]);
const BODY_LIVE_PHASES = Object.freeze([...BODY_SEED_PHASES, 'BC06', 'BC07', 'BC08', 'BC09', 'BC10', 'BC11']);
const BODY_LIVE_BOUNDARIES = Object.freeze([...BODY_SEED_BOUNDARIES, ...Array.from({ length: 9 }, (_, i) => `fix_${i}`), 'sealed']);
const BODY_PREPARATION_BUNDLE: unique symbol = Symbol('body-preparation-bundle');
const BODY_PREPARATION_DRAFT: unique symbol = Symbol('body-preparation-draft');
interface BodyPreparationBundle {
  readonly [BODY_PREPARATION_BUNDLE]: true; readonly context: BodyConstructionContext; readonly pin: FixedBodyRoutePin;
  readonly progress: BodyProgressInitial; readonly closure: BodyRouteClosureInitial; readonly diagnostic: BodyDiagnosticInitial;
  readonly retirement: BodyRetirementInitial; readonly terminal: BodyTerminalInitial; readonly unwind: BodyUnwindInitial;
}
interface BodyPreparationDraft {
  readonly [BODY_PREPARATION_DRAFT]: true; readonly bundle: BodyPreparationBundle; readonly runSeal: ProbeRunSeal;
  readonly kind: 'body_unwind_prepared'; readonly executable: false;
}
interface BodyBundleReply extends Omit<BodySeedReply, 'model'> { readonly model: 'wfb-body-bundle-draft-1' }
const BODY_BUNDLE_BRANDS = Object.freeze([BODY_PREPARATION_BUNDLE, BODY_PREPARATION_DRAFT]);
const BODY_BUNDLE_FIELDS = Object.freeze([
  ['context', 'pin', 'progress', 'closure', 'diagnostic', 'retirement', 'terminal', 'unwind'],
  ['bundle', 'runSeal', 'kind', 'executable'],
]);
const BODY_BUNDLE_PHASES = Object.freeze([...BODY_LIVE_PHASES, 'BC12', 'BC13']);
const BODY_BUNDLE_BOUNDARIES = Object.freeze([...BODY_LIVE_BOUNDARIES, 'frozen', 'post_before', 'post_after']);
class CanonicalGateDraftRoot {
  readonly #failure: { first: string; phase: number; boundary: string };
  readonly #slots: { stage: SupplyConstructionStage; value: object | undefined }[];
  readonly #seedOrigin = Object.freeze({}); readonly #entry = Object.freeze({}); readonly #exit = Object.freeze({});
  #issuedSeed: GateConstructionSeed | undefined; #issuedDraft: NonExecutingFrameDraft | undefined;
  #started = false; #frame = false; #closed = false; #ready = false;
  #fixed: Readonly<{ ok: boolean; disposition: string; first: string }> | undefined;
  #reentry: string | undefined; #closeInFrame: string | undefined;
  readonly #probeSlots: { stage: SupplyConstructionStage; value: object | undefined }[];
  readonly #probeOwner: object | undefined;
  #issuedCells: ProbeCellBundle | undefined; #issuedFrameBinding: ProbeFrameBinding | undefined;
  #probePhase = 0; #probeBoundary = 'none'; #bindRefusal: string | undefined;
  readonly #runSlots: { stage: SupplyConstructionStage; value: object | undefined }[];
  #issuedRunLink: ProbeRunLink | undefined; #issuedRunDuty: FixedExitDuty | undefined; #issuedRunSeal: ProbeRunSeal | undefined;
  #runPhase = 0; #runBoundary = 'none'; #runBindRefusal: 'none' | 'duplicate_binding' = 'none';
  #runFixedReply: Readonly<ProbeRunReply> | undefined;
  readonly #exitSlots: { stage: SupplyConstructionStage; value: object | undefined }[];
  readonly #exitIssued: (object | undefined)[];
  #exitPhase = 0; #exitBoundary = 'none'; #exitFirst: ProbeRunFirst = 'none';
  #exitBindRefusal = 'none'; #exitReentry = 'none'; #exitFixed: Readonly<ProbeExitPreparationReply> | undefined;
  #guardOwn: ProbeExitGuardState | undefined; #guardConstruction = 'not_started'; #guardRunReply: Readonly<ProbeExitGuardReply> | undefined;
  readonly #localSlots: { stage: SupplyConstructionStage; value: object | undefined }[];
  #localOwn: ProbeLocalExitState | undefined; #localPhase = 0; #localBoundary = 'none';
  #localReply: Readonly<ProbeLocalExitReply> | undefined;
  #bodySeedShell: BodyPreparationShell | undefined;
  #bodySeedPhase = 'none'; #bodySeedBoundary = 'none'; #bodySeedFailurePhase = 'none'; #bodySeedFailureBoundary = 'none';
  #bodySeedReentry = 'none'; #bodySeedHookCalls = 0; #bodySeedFixed: Readonly<BodySeedReply> | undefined;
  #bodyLiveFixed: Readonly<BodyLiveReply> | undefined;
  #bodyBundleFixed: Readonly<BodyBundleReply> | undefined;
  constructor(private readonly script: string, admitted: boolean, private readonly probePreparation = false, private readonly runPreparation = false,
    private readonly grantCapture = false, private readonly exitPreparation = false, private readonly exitGuard = false, private readonly localExit = false,
    private readonly bodySeed = false, private readonly bodyLive = false, private readonly bodyBundle = false) {
    this.#failure = { first: admitted ? 'none' : 'input_rejected', phase: 0, boundary: 'none' };
    this.#slots = Array.from({ length: 37 }, () => ({ stage: 'not_started', value: undefined }));
    this.#probeSlots = probePreparation ? Array.from({ length: 8 }, () => ({ stage: 'not_started', value: undefined })) : [];
    this.#probeOwner = probePreparation ? Object.freeze({}) : undefined;
    this.#runSlots = runPreparation ? Array.from({ length: 4 }, () => ({ stage: 'not_started', value: undefined })) : [];
    this.#exitSlots = exitPreparation ? Array.from({ length: 5 }, () => ({ stage: 'not_started', value: undefined })) : [];
    this.#exitIssued = exitPreparation ? Array(5).fill(undefined) : [];
    this.#localSlots = localExit ? Array.from({ length: 4 }, () => ({ stage: 'not_started', value: undefined })) : [];
  }
  private reply(ok: boolean, disposition: string) { return Object.freeze({ ok, disposition, first: this.#failure.first }); }
  private fail(reason: string) {
    if (this.#failure.first === 'none') this.#failure.first = reason;
    if (this.bodySeed) {
      if (this.#bodySeedFailurePhase === 'none') { this.#bodySeedFailurePhase = this.#bodySeedPhase; this.#bodySeedFailureBoundary = this.#bodySeedBoundary; }
      if (this.#bodySeedShell) this.#bodySeedShell.state = 'failed';
    }
    if (this.exitPreparation && this.#exitPhase > 0 && this.#exitFirst === 'none') this.#exitFirst = runFirst(reason);
    return this.#fixed ??= this.reply(false, reason);
  }
  private point(n: number, boundary: string) {
    this.#failure.phase = n; this.#failure.boundary = boundary;
    if (this.script === `${boundary}_${n}`) throw Error('private_gate_draft_construction');
  }
  private mint<T extends object>(n: number, operation: () => T): T {
    this.point(n, 'before'); const s = this.#slots[n - 1];
    if (!supplyStageAllows(s.stage, 'attempting')) throw Error('construction_stage');
    s.stage = 'attempting'; this.point(n, 'attempt');
    const v = operation(); s.value = v; s.stage = 'provisional'; this.point(n, 'after');
    s.stage = 'confirmed'; this.point(n, 'done'); return v;
  }
  private seedMatches(): boolean {
    const gate = this.#slots[30].value, seed = this.#slots[31].value as GateConstructionSeed | undefined;
    const issuer = this.#slots[32].value as CaptureAdmissionAssembly | undefined;
    return !!seed && !!issuer && seed === this.#issuedSeed && Reflect.ownKeys(seed).length === 3 && seed[CANONICAL_GATE_SEED] === true
      && seed.origin === this.#seedOrigin && seed.gate === gate && issuerConstructionAccess.seedMatches(issuer, seed);
  }
  private draftMatches(): boolean {
    const g = this.#slots[30].value as CanonicalDraftGate, t = this.#slots[33].value as CanonicalConstructionTarget;
    const pin = this.#slots[34].value as CanonicalGatePin, d = this.#slots[35].value as NonExecutingFrameDraft | undefined;
    return !!d && d === this.#issuedDraft && Reflect.ownKeys(d).length === 8 && d[CANONICAL_FRAME_DRAFT] === true
      && d.kind === 'probe_only' && d.executable === false && d.gate === g.origin && d.pin === pin
      && d.target === t && d.entry === this.#entry && d.exit === this.#exit && g.matches(pin);
  }
  private probeDraft(d: NonExecutingFrameDraft): NonExecutingFrameDraft {
    const f = this.script.startsWith('draft_') ? this.script.slice(6) : '';
    if (['gate', 'pin', 'target', 'entry', 'exit'].includes(f)) return Object.freeze({ ...d, [f]: Object.freeze({}) }) as NonExecutingFrameDraft;
    if (f === 'brand') return Object.freeze({ ...d, [CANONICAL_FRAME_DRAFT]: false }) as unknown as NonExecutingFrameDraft;
    if (f === 'kind') return Object.freeze({ ...d, kind: 'canonical_generation' }) as unknown as NonExecutingFrameDraft;
    if (f === 'executable') return Object.freeze({ ...d, executable: true }) as unknown as NonExecutingFrameDraft;
    if (f === 'extra') return Object.freeze({ ...d, extra: true });
    return d;
  }
  private probePoint(n: number, boundary: string) {
    this.#probePhase = n; this.#probeBoundary = boundary;
    if (this.script === `cell_${boundary}_${n}`) throw Error('private_probe_cell_fault');
  }
  private probeMint<T extends object>(n: number, operation: () => T): T {
    this.probePoint(n, 'before'); const cell = this.#probeSlots[n - 1];
    cell.stage = 'attempting'; this.probePoint(n, 'attempt');
    const value = operation(); cell.value = value; cell.stage = 'provisional'; this.probePoint(n, 'after');
    cell.stage = 'confirmed'; this.probePoint(n, 'done'); return value;
  }
  private prepareProbeCells() {
    const use = this.probeMint(1, (): ProbeUseCell => ({ state: 'unused', attemptUsed: false }));
    const frame = this.probeMint(2, () => Object.freeze({}));
    const grant = this.probeMint(3, (): ProbeGrantCell => ({ stage: 'empty', current: undefined, issued: undefined, rejected: undefined, unresolved: false }));
    const body = this.probeMint(4, (): ProbeBodyCell => ({ state: 'not_started', outcome: 'none' }));
    const exit = this.probeMint(5, (): ProbeExitCell => ({ stage: 'empty', candidate: undefined, issued: undefined, accepted: undefined, revoked: false }));
    const diagnostic = this.probeMint(6, (): ProbeDiagnosticCell => ({ first: 'none', frameFirst: 'none', producerFirst: 'none', probeFirst: 'none' }));
    this.probeMint(7, () => {
      const raw: ProbeCellBundle = Object.freeze({ [PROBE_CELLS]: true as const, owner: this.#probeOwner!, use, frame, grant, body, exit, diagnostic });
      const f = this.script.startsWith('cells_') ? this.script.slice(6) : '';
      const value = f === 'brand' ? Object.freeze({ ...raw, [PROBE_CELLS]: false }) as unknown as ProbeCellBundle
        : f === 'extra' ? Object.freeze({ ...raw, extra: true })
          : ['owner', 'use', 'frame', 'grant', 'body', 'exit', 'diagnostic'].includes(f)
            ? Object.freeze({ ...raw, [f]: Object.freeze({}) }) as ProbeCellBundle : raw;
      this.#issuedCells = value; return f === 'copy' ? Object.freeze({ ...value }) : value;
    });
    this.probePoint(7, 'check');
    return this.probeCellsMatch();
  }
  private probeCellsMatch(): boolean {
    const c = this.#probeSlots[6]?.value as ProbeCellBundle | undefined, s = this.#probeSlots;
    return !!c && c === this.#issuedCells && Reflect.ownKeys(c).length === 8 && c[PROBE_CELLS] === true && c.owner === this.#probeOwner
      && c.use === s[0].value && c.frame === s[1].value && c.grant === s[2].value && c.body === s[3].value && c.exit === s[4].value && c.diagnostic === s[5].value;
  }
  private prepareProbeBinding(seed: GateConstructionSeed, target: CanonicalConstructionTarget, pin: CanonicalGatePin, draft: NonExecutingFrameDraft) {
    const value = this.probeMint(8, () => {
      const raw: ProbeFrameBinding = Object.freeze({ [PROBE_BINDING]: true as const, seed, target, gate: seed.gate, pin, scope: target.scope,
        owner: target.scope.owner, epoch: target.epoch, packet: target.packet, draft, entry: draft.entry, exit: draft.exit, cells: this.#issuedCells! });
      const f = this.script.startsWith('frame_') ? this.script.slice(6) : '';
      const b = f === 'brand' ? Object.freeze({ ...raw, [PROBE_BINDING]: false }) as unknown as ProbeFrameBinding
        : f === 'extra' ? Object.freeze({ ...raw, extra: true })
          : ['seed', 'target', 'gate', 'pin', 'scope', 'owner', 'epoch', 'packet', 'draft', 'entry', 'exit', 'cells'].includes(f)
            ? Object.freeze({ ...raw, [f]: Object.freeze({}) }) as ProbeFrameBinding : raw;
      this.#issuedFrameBinding = b; return f === 'copy' ? Object.freeze({ ...b }) : b;
    });
    this.probePoint(8, 'check');
    if (!this.probeBindingMatch()) return false;
    if (!probeStartAccess.bind(target.start, value, this.#issuedFrameBinding!, this.script)) return false;
    if (this.script === 'duplicate_frame_binding') this.#bindRefusal = probeStartAccess.bind(target.start, value, this.#issuedFrameBinding!, this.script) ? 'not_refused' : 'duplicate_binding';
    if (this.script === 'reenter_frame_preparation') this.#reentry = this.prepare().disposition;
    this.probePoint(8, 'post');
    return probeStartAccess.matches(target.start, value);
  }
  private probeBindingMatch(): boolean {
    const b = this.#probeSlots[7]?.value as ProbeFrameBinding | undefined;
    const seed = this.#slots[31].value as GateConstructionSeed, target = this.#slots[33].value as CanonicalConstructionTarget;
    const pin = this.#slots[34].value, draft = this.#slots[35].value;
    return !!b && b === this.#issuedFrameBinding && Reflect.ownKeys(b).length === 13 && b[PROBE_BINDING] === true && this.probeCellsMatch()
      && b.seed === seed && b.target === target && b.gate === seed.gate && b.pin === pin && b.scope === target.scope
      && b.owner === target.scope.owner && b.epoch === target.epoch && b.packet === target.packet && b.draft === draft
      && b.entry === this.#entry && b.exit === this.#exit && b.cells === this.#issuedCells;
  }
  private runPoint(n: number, boundary: string) {
    this.#runPhase = n; this.#runBoundary = boundary;
    if (this.script === `run_${boundary}_${n}`) throw Error('private_run_preparation_fault');
  }
  private runMint<T extends object>(n: number, operation: () => T): T {
    this.runPoint(n, 'before'); const slot = this.#runSlots[n - 1]; slot.stage = 'attempting'; this.runPoint(n, 'attempt');
    const value = operation(); slot.value = value; slot.stage = 'provisional'; this.runPoint(n, 'after');
    slot.stage = 'confirmed'; this.runPoint(n, 'done'); return value;
  }
  private prepareRun() {
    const origin = this.runMint(1, () => Object.freeze({}));
    const b = this.#issuedFrameBinding!, c = this.#issuedCells!;
    const link = this.runMint(2, () => {
      const raw: ProbeRunLink = Object.freeze({ [PROBE_RUN_LINK]: true as const, origin, binding: b, cells: c, frame: c.frame, entry: b.entry, exit: b.exit });
      const f = this.script.startsWith('link_') ? this.script.slice(5) : '';
      const value = f === 'brand' ? Object.freeze({ ...raw, [PROBE_RUN_LINK]: false }) as unknown as ProbeRunLink
        : f === 'extra' ? Object.freeze({ ...raw, extra: true })
          : ['origin', 'binding', 'cells', 'frame', 'entry', 'exit'].includes(f) ? Object.freeze({ ...raw, [f]: Object.freeze({}) }) as ProbeRunLink : raw;
      this.#issuedRunLink = value; return f === 'copy' ? Object.freeze({ ...value }) : value;
    });
    this.runPoint(2, 'check'); if (!this.runLinkMatches()) return false;
    const duty = this.runMint(3, () => {
      const raw: FixedExitDuty = { [PROBE_DUTY]: true, link, state: 'not_owed', attemptUsed: false, phase: 'none', boundary: 'none' };
      const f = this.script.startsWith('duty_') ? this.script.slice(5) : '';
      const value = f === 'brand' ? { ...raw, [PROBE_DUTY]: false } as unknown as FixedExitDuty
        : f === 'extra' ? { ...raw, extra: true } : f === 'link' ? { ...raw, link: Object.freeze({ ...link }) }
            : f === 'state' ? { ...raw, state: 'owed' } as FixedExitDuty : f === 'attempt' ? { ...raw, attemptUsed: true } as unknown as FixedExitDuty
            : f === 'phase' || f === 'boundary' ? { ...raw, [f]: 'foreign' } as FixedExitDuty : raw;
      this.#issuedRunDuty = value; return f === 'copy' ? { ...value } : value;
    });
    this.runPoint(3, 'check'); if (!this.runDutyMatches()) return false;
    this.runMint(4, () => {
      const raw: ProbeRunSeal = Object.freeze({ link, duty, executable: false });
      const f = this.script.startsWith('seal_') ? this.script.slice(5) : '';
      const value = f === 'extra' ? Object.freeze({ ...raw, extra: true })
        : f === 'link' ? Object.freeze({ ...raw, link: Object.freeze({ ...link }) })
          : f === 'duty' ? Object.freeze({ ...raw, duty: { ...duty } })
            : f === 'executable' ? Object.freeze({ ...raw, executable: true }) as unknown as ProbeRunSeal : raw;
      this.#issuedRunSeal = value; return f === 'copy' ? Object.freeze({ ...value }) : value;
    });
    this.runPoint(4, 'check'); if (!this.runSealMatches()) return false;
    if (!probeStartAccess.bindRun(b.target.start, link, duty, this.script)) return false;
    if (this.script === 'duplicate_run_binding') this.#runBindRefusal = probeStartAccess.bindRun(b.target.start, link, duty, this.script) ? 'none' : 'duplicate_binding';
    if (this.script === 'reenter_run_preparation') this.#reentry = this.prepare().disposition;
    if (this.script === 'close_during_run_preparation') { this.close(); return this.fail('closed').ok; }
    this.runPoint(4, 'post');
    return this.runSealMatches() && probeStartAccess.matchesRun(b.target.start, link, duty) && probeStateFactsValid(this.liveRunFacts());
  }
  private runLinkMatches(): boolean {
    const link = this.#runSlots[1]?.value as ProbeRunLink | undefined, b = this.#issuedFrameBinding, cells = this.#issuedCells;
    return !!link && !!b && !!cells && link === this.#issuedRunLink && Reflect.ownKeys(link).length === 7 && link[PROBE_RUN_LINK] === true
      && link.origin === this.#runSlots[0].value && link.binding === b && link.cells === cells && link.frame === cells.frame
      && link.entry === b.entry && link.exit === b.exit;
  }
  private runDutyMatches(): boolean {
    const duty = this.#runSlots[2]?.value as FixedExitDuty | undefined;
    return !!duty && duty === this.#issuedRunDuty && Reflect.ownKeys(duty).length === 6 && duty[PROBE_DUTY] === true
      && duty.link === this.#issuedRunLink && duty.state === 'not_owed' && duty.attemptUsed === false && duty.phase === 'none' && duty.boundary === 'none';
  }
  private runSealMatches(): boolean {
    const seal = this.#runSlots[3]?.value as ProbeRunSeal | undefined;
    return !!seal && seal === this.#issuedRunSeal && Reflect.ownKeys(seal).length === 3 && seal.executable === false
      && seal.link === this.#issuedRunLink && seal.duty === this.#issuedRunDuty && this.runLinkMatches() && this.runDutyMatches();
  }
  private liveRunFacts(): ProbeStateFacts {
    const c = this.#issuedCells!, duty = this.#issuedRunDuty;
    return { use: c.use.state, attempt: c.use.attemptUsed, grant: c.grant.stage,
      references: c.grant.current !== undefined || c.grant.issued !== undefined || c.grant.rejected !== undefined,
      unresolved: c.grant.unresolved, body: c.body.state, outcome: c.body.outcome, exit: c.exit.stage,
      accepted: c.exit.accepted !== undefined, duty: duty?.state ?? 'not_owed', dutyUsed: duty?.attemptUsed ?? false };
  }
  private exitPreparationPoint(n: number, boundary: string): void {
    this.#exitPhase = n; this.#exitBoundary = boundary;
    if (this.script === `exit_${boundary}_${n}`) throw Error('private_exit_preparation_fault');
    if (this.script === `exit_stop_${boundary}_${n}`) { this.#closed = true; throw Error('private_exit_preparation_stopped'); }
    if (this.script === `exit_reenter_${boundary}_${n}`) this.#exitReentry = this.prepare().disposition;
  }
  private exitPreparationMint<T extends object>(n: number, operation: () => T): T {
    this.exitPreparationPoint(n, 'before'); const slot = this.#exitSlots[n - 1];
    slot.stage = 'attempting'; this.exitPreparationPoint(n, 'attempt');
    const raw = operation(), field = this.script.startsWith(`exit_slot_${n}_`) ? this.script.slice(`exit_slot_${n}_`.length) : '';
    const brand = n === 1 ? PROBE_EXIT_CONTROL : PROBE_EXIT_BUNDLE;
    const value = field === 'brand' ? Object.freeze({ ...raw, [brand]: false })
      : field === 'extra' ? Object.freeze({ ...raw, extra: true })
        : field && field !== 'copy' ? Object.freeze({ ...raw, [field]: typeof (raw as Record<string, unknown>)[field] === 'boolean'
          ? !(raw as Record<string, unknown>)[field] : typeof (raw as Record<string, unknown>)[field] === 'string' ? 'foreign' : Object.freeze({}) }) : raw;
    this.#exitIssued[n - 1] = value;
    slot.value = field === 'copy' ? Object.freeze({ ...value }) : value;
    slot.stage = 'provisional'; this.exitPreparationPoint(n, 'after');
    slot.stage = 'confirmed'; this.exitPreparationPoint(n, 'done'); return slot.value as T;
  }
  private exitPreparationSlotMatches(n: number): boolean {
    const value = this.#exitSlots[n - 1]?.value, link = this.#issuedRunLink!, duty = this.#issuedRunDuty!, b = this.#issuedFrameBinding!;
    if (!value || value !== this.#exitIssued[n - 1]) return false;
    const control = this.#exitSlots[0].value as ProbeExitControl;
    if (n === 1) { const v = value as ProbeExitControl;
      return Reflect.ownKeys(v).length === 8 && v[PROBE_EXIT_CONTROL] === true && v.link === link && v.duty === duty
        && v.binding === b && v.cells === this.#issuedCells && v.start === b.target.start && v.state === 'idle' && v.captureReturned === false;
    }
    if (n === 2) { const v = value as ProbeLocalRetirementSlot;
      return Reflect.ownKeys(v).length === 6 && v.duty === duty && v.control === control && v.kind === 'not_attempted'
        && v.used === false && v.blocked === false && v.target === undefined;
    }
    if (n === 3) { const v = value as ProbeBodyAbsenceSlot;
      return Reflect.ownKeys(v).length === 5 && v.duty === duty && v.control === control && v.kind === 'unobserved'
        && v.started === false && v.returned === false;
    }
    if (n === 4) { const v = value as ProbeNotStartedTerminalSlot;
      return Reflect.ownKeys(v).length === 7 && v.duty === duty && v.control === control && v.absence === this.#exitSlots[2].value
        && v.kind === 'none' && v.candidate === undefined && v.issued === undefined && v.accepted === undefined;
    }
    const v = value as ProbeExitPreparationBundle;
    return n === 5 && Reflect.ownKeys(v).length === 8 && v[PROBE_EXIT_BUNDLE] === true && v.link === link && v.duty === duty
      && v.start === b.target.start && v.control === control && v.retirement === this.#exitSlots[1].value
      && v.absence === this.#exitSlots[2].value && v.terminal === this.#exitSlots[3].value;
  }
  private prepareExitSlots(): boolean {
    const link = this.#issuedRunLink!, duty = this.#issuedRunDuty!, binding = this.#issuedFrameBinding!, start = binding.target.start;
    const control = this.exitPreparationMint(1, (): ProbeExitControl => Object.freeze({ [PROBE_EXIT_CONTROL]: true as const, link, duty,
      binding, cells: this.#issuedCells!, start, state: 'idle', captureReturned: false }));
    this.exitPreparationPoint(1, 'check'); if (!this.exitPreparationSlotMatches(1)) return false;
    const retirement = this.exitPreparationMint(2, (): ProbeLocalRetirementSlot => Object.freeze({ duty, control, kind: 'not_attempted',
      used: false, blocked: false, target: undefined }));
    this.exitPreparationPoint(2, 'check'); if (!this.exitPreparationSlotMatches(2)) return false;
    const absence = this.exitPreparationMint(3, (): ProbeBodyAbsenceSlot => Object.freeze({ duty, control, kind: 'unobserved', started: false, returned: false }));
    this.exitPreparationPoint(3, 'check'); if (!this.exitPreparationSlotMatches(3)) return false;
    const terminal = this.exitPreparationMint(4, (): ProbeNotStartedTerminalSlot => Object.freeze({ duty, control, absence,
      kind: 'none', candidate: undefined, issued: undefined, accepted: undefined }));
    this.exitPreparationPoint(4, 'check'); if (!this.exitPreparationSlotMatches(4)) return false;
    const bundle = this.exitPreparationMint(5, (): ProbeExitPreparationBundle => Object.freeze({ [PROBE_EXIT_BUNDLE]: true as const,
      link, duty, start, control, retirement, absence, terminal }));
    this.exitPreparationPoint(5, 'check'); if (!this.exitPreparationSlotMatches(5)) return false;
    this.exitPreparationPoint(5, 'bind');
    if (!probeStartAccess.bindExit(start, bundle, this.script)) return false;
    if (this.script === 'exit_duplicate_binding') this.#exitBindRefusal = probeStartAccess.bindExit(start, bundle, this.script) ? 'not_refused' : 'duplicate_binding';
    this.exitPreparationPoint(5, 'post');
    return probeStartAccess.matchesExit(start, bundle);
  }
  private prepareGuardState(): boolean {
    this.#guardConstruction = 'before';
    if (this.script === 'g_setup_before') throw Error('private_guard_setup');
    const link = this.#issuedRunLink!, duty = this.#issuedRunDuty!, b = this.#issuedFrameBinding!;
    const bundle = this.#exitSlots[4].value as ProbeExitPreparationBundle;
    const s: ProbeExitGuardState = { [PROBE_EXIT_GUARD]: true, bundle, link, duty, control: bundle.control, binding: b, cells: b.cells,
      gate: b.gate, scope: b.scope, owner: b.owner, pin: b.pin, epoch: b.epoch, packet: b.packet, frame: link.frame, entry: link.entry, exit: link.exit,
      state: 'idle', routeUsed: false, returned: false, inProgress: false, exitUsed: false, first: 'none', captureFirst: 'none', branch: 'none',
      phase: 'none', boundary: 'none', failurePhase: 'none', failureBoundary: 'none', reentry: 'none', fixed: undefined, captureReply: undefined };
    this.#guardOwn = s; this.#guardConstruction = 'retained';
    if (this.script === 'g_setup_after') throw Error('private_guard_setup');
    if (!probeStartAccess.bindGuard(b.target.start, s, this.localExit ? localGuardScript(this.script) : this.script)) return false;
    this.#guardConstruction = 'bound';
    if (this.script === 'g_setup_post') throw Error('private_guard_setup');
    this.#guardConstruction = 'confirmed'; return true;
  }
  private localConstructionPoint(n: number, boundary: string): void {
    this.#localPhase = n; this.#localBoundary = boundary;
    if (this.script === `c_setup_${boundary}_${n}`) throw Error('private_local_setup');
  }
  private localMint<T extends object>(n: number, operation: () => T): T {
    this.localConstructionPoint(n, 'before'); const slot = this.#localSlots[n - 1];
    slot.stage = 'attempting'; this.localConstructionPoint(n, 'attempt');
    const value = operation(); slot.value = value; slot.stage = 'provisional'; this.localConstructionPoint(n, 'after');
    slot.stage = 'confirmed'; this.localConstructionPoint(n, 'done'); return value;
  }
  private prepareLocalState(): boolean {
    // A's immutable slots remain anchors. These prior live views share their owner/control/duty.
    const guard = this.#guardOwn!, duty = this.#issuedRunDuty!, control = guard.control, bundle = guard.bundle;
    const retirement = this.localMint(1, (): LocalRetirementStorage => ({ duty, control, kind: 'not_attempted', used: false,
      blocked: false, confirmed: false, target: undefined, blockedTarget: undefined, confirmedTarget: undefined }));
    const absence = this.localMint(2, (): LocalAbsenceStorage => ({ guard, control, kind: 'unobserved', returned: false, routeClosed: false }));
    const terminal = this.localMint(3, (): LocalTerminalStorage => ({ duty, guard, absence, retirement, anchor: bundle.terminal, kind: 'none',
      prepared: false, committed: false, candidate: undefined, issued: undefined, accepted: undefined }));
    const p = this.localMint(4, (): ProbeLocalExitState => ({ [PROBE_LOCAL_EXIT]: true, guard, bundle, duty, control, retirement, absence, terminal,
      state: 'idle', first: 'none', phase: 'none', boundary: 'none', failurePhase: 'none', failureBoundary: 'none', deliveryUnconfirmed: false, reentry: 'none' }));
    this.#localOwn = p; this.localConstructionPoint(4, 'bind');
    if (!probeStartAccess.bindLocal(this.#issuedFrameBinding!.target.start, p, this.script)) return false;
    this.localConstructionPoint(4, 'post'); return true;
  }
  private bodySeedPoint(phase: string, boundary: string): void {
    this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;
    if (this.script === `s_reenter_${phase}_${boundary}`) this.#bodySeedReentry = this.prepare().disposition;
    if (this.script === `s_close_${phase}_${boundary}`) this.close();
    if (this.#closed) throw Error('private_body_seed_closed');
    if (this.script === `s_fault_${phase}_${boundary}`) throw Error('private_body_seed_fault');
  }
  private bodySeedBoot(phase: string, create: () => object, retain: (v: object) => void): void {
    this.bodySeedPoint(phase, 'before'); this.bodySeedPoint(phase, 'attempt');
    const v = create(); retain(v); this.bodySeedPoint(phase, 'retained');
    if (!this.bodySeedBootMatches(phase, v)) { this.fail('binding_mismatch'); throw Error('body_seed_bootstrap_mismatch'); }
    this.bodySeedPoint(phase, 'done');
  }
  private bodySeedBootMatches(phase: string, issued: object): boolean {
    const shell = this.#bodySeedShell;
    if (!shell || !bodySeedShape(shell, ['failure', 'slots', 'state', 'ready', 'execution', 'bindAttemptUsed', 'bindStage'])
      || shell.failure !== this.#failure || shell.state !== 'building' || shell.ready !== false
      || shell.execution !== 'closed' || shell.bindAttemptUsed !== false || shell.bindStage !== 'not_attempted') return false;
    if (phase === 'BS00') return shell === issued && shell.slots === undefined;
    if (!shell.slots || !Array.isArray(shell.slots) || shell.slots.length !== 13) return false;
    if (phase === 'BS01') return shell.slots === issued && Array.from({ length: 13 }, (_, i) => i).every(i => !Object.hasOwn(shell.slots!, i));
    const index = Number(phase.slice(2)) - 2;
    return shell.slots[index] === issued && Array.from({ length: index + 1 }, (_, i) => i).every(i => {
      const c = shell.slots![i];
      return !!c && bodySeedShape(c, ['index', 'kind', 'stage', 'attemptReserved', 'callBoundaryReached', 'issued', 'current', 'rejected'])
        && c.index === i + 1 && c.kind === BODY_CARRIER_KINDS[i] && c.stage === 'not_started' && c.attemptReserved === false
        && c.callBoundaryReached === false && c.issued === undefined && c.current === undefined && c.rejected === undefined;
    });
  }
  private bodySeedBaseMatches(): boolean {
    const c = this.#issuedCells!, b = this.#issuedFrameBinding!, d = this.#issuedRunDuty!;
    const capture = probeStartAccess.captureInspect(b.target.start);
    return this.seedMatches() && this.probeBindingMatch() && this.runSealMatches()
      && [1, 2, 3, 4, 5].every(n => this.exitPreparationSlotMatches(n))
      && probeStartAccess.matchesRun(b.target.start, this.#issuedRunLink!, d)
      && probeStartAccess.matchesExit(b.target.start, this.#exitSlots[4].value as ProbeExitPreparationBundle)
      && c.use.state === 'unused' && c.use.attemptUsed === false && c.grant.stage === 'empty'
      && c.grant.current === undefined && c.grant.issued === undefined && c.grant.rejected === undefined && !c.grant.unresolved
      && c.body.state === 'not_started' && c.body.outcome === 'none' && c.exit.stage === 'empty'
      && c.exit.candidate === undefined && c.exit.issued === undefined && c.exit.accepted === undefined && !c.exit.revoked
      && capture.grantAttempts === 0 && capture.issuerRetained === false;
  }
  private bodySeedCarriersMatch(): boolean {
    const s = this.#bodySeedShell, slots = s?.slots;
    return !!s && s.failure === this.#failure && s.state === 'building' && s.ready === false && s.execution === 'closed' && s.bindAttemptUsed === false
      && s.bindStage === 'not_attempted' && !!slots && slots.length === 13 && BODY_CARRIER_KINDS.every((kind, i) => {
        const c = slots[i]; return !!c && bodySeedShape(c, ['index', 'kind', 'stage', 'attemptReserved', 'callBoundaryReached', 'issued', 'current', 'rejected'])
          && c.index === i + 1 && c.kind === kind
          && (i < 5 || c.stage === 'not_started' && c.attemptReserved === false && c.callBoundaryReached === false
            && c.issued === undefined && c.current === undefined && c.rejected === undefined);
      });
  }
  private bodySeedDataMatches(n: number): boolean {
    const slots = this.#bodySeedShell!.slots!, cell = slots[n - 1]!, value = cell.current;
    if (!value || value !== cell.issued || cell.rejected !== undefined || !bodySeedShape(value, [BODY_DATA_BRANDS[n - 1], ...BODY_DATA_FIELDS[n - 1]])) return false;
    const ctx = slots[0]!.current as BodyConstructionContext, origin = slots[1]!.current as FixedBodyOrigin;
    if (n === 1) { const v = value as BodyConstructionContext, b = this.#issuedFrameBinding!, c = this.#issuedCells!;
      return v[BODY_CONTEXT] === true && this.#issuedSeed === v.seed && v.binding === b && v.cells === c
        && v.link === this.#issuedRunLink && v.duty === this.#issuedRunDuty && v.control === this.#exitSlots[0].value
        && v.start === b.target.start && v.bindingOwner === b.owner && v.cellOwner === this.#probeOwner
        && v.scope === b.scope && v.pin === b.pin && v.epoch === b.epoch && v.packet === b.packet
        && v.frame === c.frame && v.entry === b.entry && v.exit === b.exit && v.runSeal === this.#issuedRunSeal && v.exitBundle === this.#exitSlots[4].value;
    }
    if (n === 2) { const v = value as FixedBodyOrigin; return v[BODY_ORIGIN] === true && v.context === ctx && v.kind === 'fixed_probe_body'; }
    if (n === 3 || n === 4) { const v = value as FixedBodySentinel<'throw' | 'cancel'>;
      return v[BODY_SENTINEL] === true && v.context === ctx && v.bodyOrigin === origin && v.kind === (n === 3 ? 'throw' : 'cancel');
    }
    const v = value as FixedBodyRoutePin;
    return n === 5 && v[BODY_ROUTE_PIN] === true && v.context === ctx && v.bodyOrigin === origin
      && v.throwSentinel === slots[2]!.current && v.cancelSentinel === slots[3]!.current
      && v.grantSlot === this.#issuedCells!.grant && v.kind === 'fixed_body' && v.executable === false;
  }
  private bodySeedProduce(n: number, create: () => object, f: string): object {
    let raw = create();
    if (f && f !== 'copy') {
      const cp = { ...raw } as Record<PropertyKey, unknown>;
      if (f === 'brand') cp[BODY_DATA_BRANDS[n - 1]] = false;
      else if (f === 'extra') cp.extra = true;
      else if (f === 'getter') Object.defineProperty(cp, BODY_DATA_FIELDS[n - 1][0], { get: () => { this.#bodySeedHookCalls++; throw Error('private_hook'); } });
      else if (f !== 'copy') cp[f] = Object.freeze({});
      raw = cp; // Fixed malformed producer returns this candidate before the issuer boundary.
    }
    return raw;
  }
  private bodySeedMint(n: number, create: () => object): void {
    const phase = `BC${String(n).padStart(2, '0')}`, cell = this.#bodySeedShell!.slots![n - 1]!;
    this.bodySeedPoint(phase, 'before');
    if (!this.bodySeedCarriersMatch() || !this.bodySeedBaseMatches() || cell.stage !== 'not_started'
      || cell.attemptReserved || cell.callBoundaryReached || !Array.from({ length: n - 1 }, (_, i) => i + 1).every(i =>
        this.#bodySeedShell!.slots![i - 1]!.stage === 'confirmed' && this.bodySeedDataMatches(i))) {
      this.fail('binding_mismatch'); throw Error('body_seed_preflight');
    }
    cell.attemptReserved = true; cell.stage = 'attempting'; this.bodySeedPoint(phase, 'attempt');
    const f = this.script.startsWith(`s_mix_${n}_`) ? this.script.slice(`s_mix_${n}_`.length) : '';
    const producerThrows = this.script === `s_producer_throw_${n}`;
    cell.callBoundaryReached = true;
    if (producerThrows) throw Error('body_seed_producer');
    const raw = this.bodySeedProduce(n, create, f);
    cell.issued = raw; cell.stage = 'issued'; this.bodySeedPoint(phase, 'issued');
    Object.freeze(raw);
    const current = f === 'copy' ? Object.freeze({ ...raw }) : raw;
    cell.current = current; cell.stage = 'provisional'; this.bodySeedPoint(phase, 'captured');
    if (!this.bodySeedDataMatches(n)) { if (!cell.rejected) cell.rejected = current; this.fail('binding_mismatch'); throw Error('body_seed_mismatch'); }
    this.bodySeedPoint(phase, 'checked'); cell.stage = 'confirmed'; this.bodySeedPoint(phase, 'confirmed');
  }
  private prepareBodySeed(): Readonly<{ ok: boolean; disposition: string }> {
    this.bodySeedBoot('BS00', (): BodyPreparationShell => ({ failure: this.#failure, slots: undefined, state: 'building', ready: false,
      execution: 'closed', bindAttemptUsed: false, bindStage: 'not_attempted' }), v => { this.#bodySeedShell = v as BodyPreparationShell; });
    const shell = this.#bodySeedShell!;
    this.bodySeedBoot('BS01', () => Array(13), v => { shell.slots = v as (BodyConstructionCell | undefined)[]; });
    for (let i = 0; i < 13; i++) this.bodySeedBoot(`BS${String(i + 2).padStart(2, '0')}`, (): BodyConstructionCell => ({ index: (i + 1) as BodyCarrierIndex,
      kind: BODY_CARRIER_KINDS[i], stage: 'not_started', attemptReserved: false, callBoundaryReached: false,
      issued: undefined, current: undefined, rejected: undefined }), v => { shell.slots![i] = v as BodyConstructionCell; });
    this.bodySeedPoint('BC00', 'before');
    if (!this.bodySeedCarriersMatch() || !this.bodySeedBaseMatches()) return this.fail('binding_mismatch');
    this.bodySeedPoint('BC00', 'after');
    this.bodySeedMint(1, (): BodyConstructionContext => { const b = this.#issuedFrameBinding!, cells = this.#issuedCells!;
      return { [BODY_CONTEXT]: true, seed: this.#issuedSeed!, binding: b, cells, link: this.#issuedRunLink!, duty: this.#issuedRunDuty!,
        control: this.#exitSlots[0].value as ProbeExitControl, start: b.target.start, bindingOwner: b.owner, cellOwner: this.#probeOwner!,
        scope: b.scope, pin: b.pin, epoch: b.epoch, packet: b.packet, frame: cells.frame, entry: b.entry, exit: b.exit,
        runSeal: this.#issuedRunSeal!, exitBundle: this.#exitSlots[4].value as ProbeExitPreparationBundle };
    });
    const ctx = shell.slots![0]!.current as BodyConstructionContext;
    this.bodySeedMint(2, (): FixedBodyOrigin => ({ [BODY_ORIGIN]: true, context: ctx, kind: 'fixed_probe_body' }));
    const origin = shell.slots![1]!.current as FixedBodyOrigin;
    this.bodySeedMint(3, (): FixedBodySentinel<'throw'> => ({ [BODY_SENTINEL]: true, context: ctx, bodyOrigin: origin, kind: 'throw' }));
    this.bodySeedMint(4, (): FixedBodySentinel<'cancel'> => ({ [BODY_SENTINEL]: true, context: ctx, bodyOrigin: origin, kind: 'cancel' }));
    this.bodySeedMint(5, (): FixedBodyRoutePin => ({ [BODY_ROUTE_PIN]: true, context: ctx, bodyOrigin: origin,
      throwSentinel: shell.slots![2]!.current as FixedBodySentinel<'throw'>, cancelSentinel: shell.slots![3]!.current as FixedBodySentinel<'cancel'>,
      grantSlot: this.#issuedCells!.grant, kind: 'fixed_body', executable: false }));
    if (this.bodyLive) return this.prepareBodyLive();
    if (!this.bodySeedCarriersMatch() || !this.bodySeedBaseMatches() || ![1, 2, 3, 4, 5].every(n => this.bodySeedDataMatches(n))) return this.fail('binding_mismatch');
    shell.state = 'held'; return this.reply(false, 'seed_held'); // BC06+, bind, root ready and body remain unconnected.
  }
  private bodyLiveDescriptors(value: object, n: number, fixed: boolean): boolean {
    const i = n - 6, keys: readonly PropertyKey[] = fixed ? [BODY_LIVE_BRANDS[i], ...BODY_LIVE_REFS[i]] : BODY_LIVE_PROGRESS[i];
    return keys.every(key => { const d = Object.getOwnPropertyDescriptor(value, key);
      return !!d && 'value' in d && d.enumerable === true && d.configurable === false && d.writable === !fixed; });
  }
  private bodyLiveDataMatches(n: number): boolean {
    const slots = this.#bodySeedShell!.slots!, cell = slots[n - 1]!, value = cell.current, i = n - 6;
    if (!value || value !== cell.issued || cell.rejected !== undefined
      || !bodySeedShape(value, [BODY_LIVE_BRANDS[i], ...BODY_LIVE_REFS[i], ...BODY_LIVE_PROGRESS[i]])
      || !Object.isSealed(value) || !this.bodyLiveDescriptors(value, n, true) || !this.bodyLiveDescriptors(value, n, false)) return false;
    const ctx = slots[0]!.current as BodyConstructionContext, pin = slots[4]!.current as FixedBodyRoutePin;
    if (n === 6) { const v = value as BodyProgressInitial;
      return v[BODY_PROGRESS] === true && v.pin === pin && v.bodyCell === ctx.cells.body && v.activationConfirmed === false
        && v.callReserved === false && v.entryObserved === false && v.returnCaptured === false && v.callPhase === 'body_not_called' && v.outcome === 'none'; }
    if (n === 7) { const v = value as BodyRouteClosureInitial;
      return v[BODY_CLOSURE] === true && v.pin === pin && v.progress === slots[5]!.current
        && v.bodyEntryClosed === false && v.controlReturned === false && v.continuationState === 'unobserved'; }
    if (n === 8) { const v = value as BodyDiagnosticInitial;
      return v[BODY_DIAGNOSTIC] === true && v.context === ctx && v.rootFailure === this.#failure && v.cellDiagnostic === ctx.cells.diagnostic
        && v.probeFirst === 'none' && v.exitFirst === 'none' && v.deliveryFirst === 'none' && v.failurePhase === 'none'
        && v.failureBoundary === 'none' && v.refusal === 'none'; }
    if (n === 9) { const v = value as BodyRetirementInitial;
      return v[BODY_RETIREMENT] === true && v.pin === pin && v.duty === ctx.duty && v.control === ctx.control
        && v.kind === 'not_attempted' && v.used === false && v.blocked === false && v.confirmed === false
        && v.target === undefined && v.blockedTarget === undefined && v.confirmedTarget === undefined; }
    if (n === 10) { const v = value as BodyTerminalInitial;
      return v[BODY_TERMINAL] === true && v.pin === pin && v.duty === ctx.duty && v.progress === slots[5]!.current
        && v.retirement === slots[8]!.current && v.terminalAnchor === ctx.exitBundle.terminal
        && v.kind === 'none' && v.prepared === false && v.committed === false && v.candidate === undefined && v.issued === undefined && v.accepted === undefined; }
    const v = value as BodyUnwindInitial;
    return n === 11 && v[BODY_UNWIND] === true && v.context === ctx && v.pin === pin && v.progress === slots[5]!.current
      && v.closure === slots[6]!.current && v.diagnostic === slots[7]!.current && v.retirement === slots[8]!.current && v.terminal === slots[9]!.current
      && v.state === 'idle' && v.routeUsed === false && v.inProgress === false && v.phase === 'none' && v.boundary === 'none' && v.fixedReply === undefined;
  }
  private bodyLivePrefixMatches(count: number): boolean {
    const s = this.#bodySeedShell, slots = s?.slots;
    if (!s || !bodySeedShape(s, ['failure', 'slots', 'state', 'ready', 'execution', 'bindAttemptUsed', 'bindStage'])
      || s.failure !== this.#failure || s.state !== 'building' || s.ready !== false || s.execution !== 'closed'
      || s.bindAttemptUsed !== false || s.bindStage !== 'not_attempted' || !Array.isArray(slots) || slots.length !== 13) return false;
    return BODY_CARRIER_KINDS.every((kind, i) => {
      const c = slots[i];
      if (!c || !bodySeedShape(c, ['index', 'kind', 'stage', 'attemptReserved', 'callBoundaryReached', 'issued', 'current', 'rejected'])
        || c.index !== i + 1 || c.kind !== kind) return false;
      if (i >= count) return c.stage === 'not_started' && c.attemptReserved === false && c.callBoundaryReached === false
        && c.issued === undefined && c.current === undefined && c.rejected === undefined;
      return c.stage === 'confirmed' && c.attemptReserved === true && c.callBoundaryReached === true
        && (i >= 11 ? this.bodyBundleDataMatches(i + 1) : (i < 5 ? this.bodySeedDataMatches(i + 1) : this.bodyLiveDataMatches(i + 1)));
    });
  }
  private bodyLiveProduce(n: number, create: () => object, fault: string): object {
    const raw = create(), i = n - 6;
    if (['', 'copy', 'mutable_ref', 'unsealed'].includes(fault)) return raw;
    if (fault === 'freeze') return Object.freeze(raw);
    const candidate = { ...raw } as Record<PropertyKey, unknown>;
    if (fault === 'brand') candidate[BODY_LIVE_BRANDS[i]] = false;
    else if (fault === 'extra') candidate.extra = true;
    else if (fault === 'missing') delete candidate[BODY_LIVE_PROGRESS[i][0]];
    else if (fault === 'prototype') Object.setPrototypeOf(candidate, Object.create(null));
    else if (fault === 'getter') Object.defineProperty(candidate, BODY_LIVE_REFS[i][0], {
      get: () => { this.#bodySeedHookCalls++; throw Error('private_live_hook'); }, configurable: true, enumerable: true });
    else candidate[fault] = Object.freeze({});
    return candidate;
  }
  private bodyLiveMint(n: number, create: () => object): void {
    const phase = `BC${String(n).padStart(2, '0')}`, i = n - 6, cell = this.#bodySeedShell!.slots![n - 1]!;
    this.bodySeedPoint(phase, 'before');
    if (!this.bodySeedBaseMatches() || !this.bodyLivePrefixMatches(n - 1)) {
      this.fail('binding_mismatch'); throw Error('body_live_preflight');
    }
    cell.attemptReserved = true; cell.stage = 'attempting'; this.bodySeedPoint(phase, 'attempt');
    const fault = this.script.startsWith(`s_live_mix_${n}_`) ? this.script.slice(`s_live_mix_${n}_`.length) : '';
    const producerThrows = this.script === `s_live_producer_throw_${n}`;
    cell.callBoundaryReached = true;
    if (producerThrows) throw Error('body_live_producer');
    const raw = this.bodyLiveProduce(n, create, fault); cell.issued = raw; cell.stage = 'issued'; this.bodySeedPoint(phase, 'issued');
    const fixed: readonly PropertyKey[] = [BODY_LIVE_BRANDS[i], ...BODY_LIVE_REFS[i]];
    for (let j = 0; j < fixed.length; j++) {
      const d = Object.getOwnPropertyDescriptor(raw, fixed[j]);
      if (d && 'value' in d && !(fault === 'mutable_ref' && j === 1)) Object.defineProperty(raw, fixed[j], { writable: false, configurable: false });
      this.bodySeedPoint(phase, `fix_${j}`);
    }
    if (fault !== 'unsealed') Object.seal(raw);
    this.bodySeedPoint(phase, 'sealed');
    const current = fault === 'copy' ? Object.seal(Object.defineProperties({}, Object.getOwnPropertyDescriptors(raw))) : raw;
    cell.current = current; cell.stage = 'provisional'; this.bodySeedPoint(phase, 'captured');
    if (!this.bodyLiveDataMatches(n)) {
      if (!cell.rejected) cell.rejected = current;
      this.fail('binding_mismatch'); throw Error('body_live_mismatch');
    }
    this.bodySeedPoint(phase, 'checked'); cell.stage = 'confirmed'; this.bodySeedPoint(phase, 'confirmed');
  }
  private prepareBodyLive(): Readonly<{ ok: boolean; disposition: string }> {
    const slots = this.#bodySeedShell!.slots!, ctx = slots[0]!.current as BodyConstructionContext, pin = slots[4]!.current as FixedBodyRoutePin;
    this.bodyLiveMint(6, (): BodyProgressInitial => ({ [BODY_PROGRESS]: true, pin, bodyCell: ctx.cells.body,
      activationConfirmed: false, callReserved: false, entryObserved: false, returnCaptured: false, callPhase: 'body_not_called', outcome: 'none' }));
    const progress = slots[5]!.current as BodyProgressInitial;
    this.bodyLiveMint(7, (): BodyRouteClosureInitial => ({ [BODY_CLOSURE]: true, pin, progress,
      bodyEntryClosed: false, controlReturned: false, continuationState: 'unobserved' }));
    this.bodyLiveMint(8, (): BodyDiagnosticInitial => ({ [BODY_DIAGNOSTIC]: true, context: ctx, rootFailure: this.#failure,
      cellDiagnostic: ctx.cells.diagnostic, probeFirst: 'none', exitFirst: 'none', deliveryFirst: 'none', failurePhase: 'none', failureBoundary: 'none', refusal: 'none' }));
    this.bodyLiveMint(9, (): BodyRetirementInitial => ({ [BODY_RETIREMENT]: true, pin, duty: ctx.duty, control: ctx.control,
      kind: 'not_attempted', used: false, blocked: false, confirmed: false, target: undefined, blockedTarget: undefined, confirmedTarget: undefined }));
    const retirement = slots[8]!.current as BodyRetirementInitial;
    this.bodyLiveMint(10, (): BodyTerminalInitial => ({ [BODY_TERMINAL]: true, pin, duty: ctx.duty, progress, retirement,
      terminalAnchor: ctx.exitBundle.terminal, kind: 'none', prepared: false, committed: false, candidate: undefined, issued: undefined, accepted: undefined }));
    this.bodyLiveMint(11, (): BodyUnwindInitial => ({ [BODY_UNWIND]: true, context: ctx, pin, progress,
      closure: slots[6]!.current as BodyRouteClosureInitial, diagnostic: slots[7]!.current as BodyDiagnosticInitial,
      retirement, terminal: slots[9]!.current as BodyTerminalInitial, state: 'idle', routeUsed: false, inProgress: false, phase: 'none', boundary: 'none', fixedReply: undefined }));
    if (this.bodyBundle) return this.prepareBodyBundle();
    if (!this.bodySeedBaseMatches() || !this.bodyLivePrefixMatches(11)) return this.fail('binding_mismatch');
    this.#bodySeedShell!.state = 'held'; return this.reply(false, 'live_held');
  }
  private bodyBundleDataMatches(n: number): boolean {
    const slots = this.#bodySeedShell!.slots!, cell = slots[n - 1]!, value = cell.current, i = n - 12;
    if (!value || value !== cell.issued || cell.rejected !== undefined
      || !bodySeedShape(value, [BODY_BUNDLE_BRANDS[i], ...BODY_BUNDLE_FIELDS[i]]) || !Object.isFrozen(value)
      || ![BODY_BUNDLE_BRANDS[i], ...BODY_BUNDLE_FIELDS[i]].every(k => Object.getOwnPropertyDescriptor(value, k)?.enumerable === true)) return false;
    if (n === 12) { const v = value as BodyPreparationBundle;
      return v[BODY_PREPARATION_BUNDLE] === true && v.context === slots[0]!.current && v.pin === slots[4]!.current
        && v.progress === slots[5]!.current && v.closure === slots[6]!.current && v.diagnostic === slots[7]!.current
        && v.retirement === slots[8]!.current && v.terminal === slots[9]!.current && v.unwind === slots[10]!.current; }
    const v = value as BodyPreparationDraft;
    return n === 13 && v[BODY_PREPARATION_DRAFT] === true && v.bundle === slots[11]!.current
      && v.runSeal === (slots[0]!.current as BodyConstructionContext).runSeal && v.kind === 'body_unwind_prepared' && v.executable === false;
  }
  private bodyBundleProduce(n: 12 | 13, create: () => object, fault: string): object {
    const raw = create(), i = n - 12;
    if (['', 'copy', 'unfrozen'].includes(fault)) return raw;
    const candidate = { ...raw } as Record<PropertyKey, unknown>;
    if (fault === 'brand') candidate[BODY_BUNDLE_BRANDS[i]] = false;
    else if (fault === 'extra') candidate.extra = true;
    else if (fault === 'missing') delete candidate[BODY_BUNDLE_FIELDS[i][0]];
    else if (fault === 'prototype') Object.setPrototypeOf(candidate, Object.create(null));
    else if (fault === 'getter') Object.defineProperty(candidate, BODY_BUNDLE_FIELDS[i][0], {
      get: () => { this.#bodySeedHookCalls++; throw Error('private_bundle_hook'); }, enumerable: true });
    else if (fault === 'non_enumerable') Object.defineProperty(candidate, BODY_BUNDLE_FIELDS[i][0], { enumerable: false });
    else if (fault.startsWith('child_copy_')) { const key = fault.slice(11); candidate[key] = Object.freeze({ ...(candidate[key] as object) }); }
    else candidate[fault] = Object.freeze({});
    return candidate;
  }
  private bodyBundleMint(n: 12 | 13, create: () => object): void {
    const phase = `BC${n}`, cell = this.#bodySeedShell!.slots![n - 1]!;
    this.bodySeedPoint(phase, 'before');
    if (!this.bodySeedBaseMatches() || !this.bodyLivePrefixMatches(n - 1)) {
      this.fail('binding_mismatch'); throw Error('body_bundle_preflight');
    }
    cell.attemptReserved = true; cell.stage = 'attempting'; this.bodySeedPoint(phase, 'attempt');
    const fault = this.script.startsWith(`s_bundle_mix_${n}_`) ? this.script.slice(`s_bundle_mix_${n}_`.length) : '';
    const producerThrows = this.script === `s_bundle_producer_throw_${n}`, freezeThrows = this.script === `s_bundle_freeze_throw_${n}`;
    cell.callBoundaryReached = true;
    if (producerThrows) throw Error('body_bundle_producer');
    const raw = this.bodyBundleProduce(n, create, fault); cell.issued = raw; cell.stage = 'issued'; this.bodySeedPoint(phase, 'issued');
    if (freezeThrows) throw Error('body_bundle_freeze');
    if (fault === 'unfrozen') Object.seal(raw); else Object.freeze(raw);
    this.bodySeedPoint(phase, 'frozen');
    const current = fault === 'copy' ? Object.freeze({ ...raw }) : raw;
    cell.current = current; cell.stage = 'provisional'; this.bodySeedPoint(phase, 'captured');
    if (!this.bodyBundleDataMatches(n)) {
      if (!cell.rejected) cell.rejected = current;
      this.fail('binding_mismatch'); throw Error('body_bundle_mismatch');
    }
    this.bodySeedPoint(phase, 'checked'); cell.stage = 'confirmed'; this.bodySeedPoint(phase, 'confirmed');
  }
  private prepareBodyBundle(): Readonly<{ ok: boolean; disposition: string }> {
    const slots = this.#bodySeedShell!.slots!, ctx = slots[0]!.current as BodyConstructionContext;
    this.bodyBundleMint(12, (): BodyPreparationBundle => ({ [BODY_PREPARATION_BUNDLE]: true, context: ctx,
      pin: slots[4]!.current as FixedBodyRoutePin, progress: slots[5]!.current as BodyProgressInitial,
      closure: slots[6]!.current as BodyRouteClosureInitial, diagnostic: slots[7]!.current as BodyDiagnosticInitial,
      retirement: slots[8]!.current as BodyRetirementInitial, terminal: slots[9]!.current as BodyTerminalInitial,
      unwind: slots[10]!.current as BodyUnwindInitial }));
    this.bodyBundleMint(13, (): BodyPreparationDraft => ({ [BODY_PREPARATION_DRAFT]: true,
      bundle: slots[11]!.current as BodyPreparationBundle, runSeal: ctx.runSeal, kind: 'body_unwind_prepared', executable: false }));
    this.bodySeedPoint('BC13', 'post_before');
    if (!this.bodySeedBaseMatches() || !this.bodyLivePrefixMatches(13)) return this.fail('binding_mismatch');
    this.bodySeedPoint('BC13', 'post_after');
    this.#bodySeedShell!.state = 'held'; return this.reply(false, 'bundle_held');
  }
  bodyBundleReply(disposition: string): Readonly<BodyBundleReply> {
    if (this.#bodyBundleFixed) return this.#bodyBundleFixed;
    const prior = this.bodyLiveReply(disposition === 'bundle_held' ? 'live_held' : disposition);
    const r: Readonly<BodyBundleReply> = Object.freeze({ ...prior, model: 'wfb-body-bundle-draft-1', disposition: disposition === 'bundle_held' ? 'bundle_held' : prior.disposition });
    if (this.#fixed) this.#bodyBundleFixed = r; return r;
  }
  inspectBodyBundle() {
    const prior = this.inspectBodyLive(), slots = this.#bodySeedShell?.slots;
    return Object.freeze({ ...prior, model: 'wfb-body-bundle-draft-1', dataLimit: 13,
      phase: runEnum(this.#bodySeedPhase, BODY_BUNDLE_PHASES, 'unconfirmed'), boundary: runEnum(this.#bodySeedBoundary, BODY_BUNDLE_BOUNDARIES, 'unconfirmed'),
      failurePhase: runEnum(this.#bodySeedFailurePhase, BODY_BUNDLE_PHASES, 'unconfirmed'), failureBoundary: runEnum(this.#bodySeedFailureBoundary, BODY_BUNDLE_BOUNDARIES, 'unconfirmed'),
      aggregates: Object.freeze([12, 13].map(n => { const v = slots?.[n - 1]?.current;
        return Object.freeze({ index: n, valid: !!v && this.bodyBundleDataMatches(n), frozen: !!v && Object.isFrozen(v) }); })) });
  }
  bodyLiveReply(disposition: string): Readonly<BodyLiveReply> {
    if (this.#bodyLiveFixed) return this.#bodyLiveFixed;
    const prior = this.bodySeedReply(disposition === 'live_held' ? 'seed_held' : disposition);
    const r: Readonly<BodyLiveReply> = Object.freeze({ ...prior, model: 'wfb-body-live-initial-1', disposition: disposition === 'live_held' ? 'live_held' : prior.disposition });
    if (this.#fixed) this.#bodyLiveFixed = r; return r;
  }
  inspectBodyLive() {
    const prior = this.inspectBodySeed(), slots = this.#bodySeedShell?.slots;
    return Object.freeze({ ...prior, model: 'wfb-body-live-initial-1', dataLimit: 11,
      phase: runEnum(this.#bodySeedPhase, BODY_LIVE_PHASES, 'unconfirmed'), boundary: runEnum(this.#bodySeedBoundary, BODY_LIVE_BOUNDARIES, 'unconfirmed'),
      failurePhase: runEnum(this.#bodySeedFailurePhase, BODY_LIVE_PHASES, 'unconfirmed'), failureBoundary: runEnum(this.#bodySeedFailureBoundary, BODY_LIVE_BOUNDARIES, 'unconfirmed'),
      live: Object.freeze(Array.from({ length: 6 }, (_, i) => { const value = slots?.[i + 5]?.current;
        return Object.freeze({ index: i + 6, initial: !!value && this.bodyLiveDataMatches(i + 6), sealed: !!value && Object.isSealed(value),
          referencesFixed: !!value && this.bodyLiveDescriptors(value, i + 6, true), progressWritable: !!value && this.bodyLiveDescriptors(value, i + 6, false) }); })) });
  }
  bodySeedReply(disposition: string): Readonly<BodySeedReply> {
    if (this.#bodySeedFixed) return this.#bodySeedFixed;
    const r = Object.freeze({ model: 'wfb-body-slot-seed-1', ok: false, first: runFirst(this.#failure.first),
      disposition: runEnum(disposition, ['seed_held', 'duplicate_preparation', 'construction_in_progress', 'blocked_frame_execution',
        'closed', 'not_ready', 'input_rejected', 'binding_mismatch', 'state_invalid', 'construction_unconfirmed', 'deferred_frame'], 'internal_unconfirmed'),
      authority: 'none', execution: 'closed', formalIssuance: 'closed', wholeRunAdmission: 'disabled', implementation: 'unknown', investigations: 'on_hold' });
    if (this.#fixed) this.#bodySeedFixed = r; return r;
  }
  inspectBodySeed() {
    const s = this.#bodySeedShell, start = this.#issuedFrameBinding?.target.start, capture = start ? probeStartAccess.captureInspect(start) : undefined;
    return Object.freeze({ model: 'wfb-body-slot-seed-1', authority: 'none', execution: 'closed', formalIssuance: 'closed',
      wholeRunAdmission: 'disabled', implementation: 'unknown', investigations: 'on_hold', first: runFirst(this.#failure.first),
      state: s ? runEnum(s.state, ['building', 'held', 'failed'], 'unconfirmed') : 'not_created', ready: false, rootReady: this.#ready,
      phase: runEnum(this.#bodySeedPhase, BODY_SEED_PHASES, 'unconfirmed'),
      boundary: runEnum(this.#bodySeedBoundary, BODY_SEED_BOUNDARIES, 'unconfirmed'),
      failurePhase: runEnum(this.#bodySeedFailurePhase, BODY_SEED_PHASES, 'unconfirmed'), failureBoundary: runEnum(this.#bodySeedFailureBoundary, BODY_SEED_BOUNDARIES, 'unconfirmed'),
      reentry: runEnum(this.#bodySeedReentry, ['none', 'construction_in_progress'], 'unconfirmed'), hookCalls: this.#bodySeedHookCalls,
      shellRetained: s !== undefined, arrayRetained: s?.slots !== undefined,
      slots: Object.freeze(Array.from({ length: 13 }, (_, i) => { const c = s?.slots?.[i]; return Object.freeze({ index: i + 1, kind: BODY_CARRIER_KINDS[i],
        carrierRetained: c !== undefined, stage: c ? runEnum(c.stage, ['not_started', 'attempting', 'issued', 'provisional', 'confirmed'], 'unconfirmed') : 'not_created',
        attemptReserved: c?.attemptReserved === true, callBoundaryReached: c?.callBoundaryReached === true,
        issuedRetained: c?.issued !== undefined, currentRetained: c?.current !== undefined, rejectedRetained: c?.rejected !== undefined,
        sameReference: c?.current !== undefined && c.current === c.issued }); })),
      bindAttemptUsed: (s?.bindAttemptUsed as boolean | undefined) === true, bindStage: s ? runEnum(s.bindStage, ['not_attempted'], 'unconfirmed') : 'not_created',
      borrowRetained: false, dataLimit: 5, sameOwnerBindings: s?.slots?.[0]?.stage === 'confirmed' && this.bodySeedDataMatches(1),
      grantAttempts: capture?.grantAttempts ?? 0, grantIssues: capture?.grantIssues ?? 0, enterUsed: this.#issuedCells?.use.attemptUsed === true,
      dutyUsed: this.#issuedRunDuty?.attemptUsed === true, bodyStarts: 0, retirementAttempts: 0, terminalCommits: 0,
      journalSupply: 'not_connected', rootFinish: 'not_called' });
  }
  prepare() {
    if (this.#fixed) return this.#fixed;
    if (this.#frame) return this.reply(false, 'construction_in_progress');
    if (this.#failure.first !== 'none') return this.fail(this.#failure.first);
    if (this.#closed) return this.reply(false, 'closed');
    if (this.#started) return this.reply(false, 'duplicate_preparation');
    this.#started = true; this.#frame = true;
    try {
      this.mint(1, () => ({ result: undefined, grant: undefined, frameExit: undefined }));
      this.mint(2, () => ({ kind: 'supply_slot', state: 'unbound' }));
      this.mint(3, () => Object.freeze({ kind: 'packet_holder', reference: undefined }));
      this.mint(4, () => SUPPLY_FIELDS);
      for (let i = 0; i < 25; i++) this.mint(i + 5, () => Object.freeze({ cell: i + 1, field: SUPPLY_FIELDS[i], reference: undefined }));
      this.mint(30, () => Object.freeze({ kind: 'admission_use_slot', state: 'unused' }));
      if (this.probePreparation && !this.prepareProbeCells()) return this.fail('binding_mismatch');
      const gate = this.mint(31, () => new CanonicalDraftGate());
      const seed = this.mint(32, () => {
        const raw = Object.freeze({ [CANONICAL_GATE_SEED]: true as const, gate, origin: this.#seedOrigin });
        const f = this.script.startsWith('seed_') ? this.script.slice(5) : '';
        const s = f === 'gate' || f === 'origin' ? Object.freeze({ ...raw, [f]: Object.freeze({}) }) as GateConstructionSeed
          : f === 'brand' ? Object.freeze({ ...raw, [CANONICAL_GATE_SEED]: false }) as unknown as GateConstructionSeed
            : f === 'extra' ? Object.freeze({ ...raw, extra: true }) : raw;
        this.#issuedSeed = s; return f === 'copy' ? Object.freeze({ ...s }) : s;
      });
      if (this.script === 'reenter') this.#reentry = this.prepare().disposition;
      if (this.script === 'close_in_frame') this.#closeInFrame = this.close().disposition;
      if (this.#closed) return this.fail('closed');
      const issuer = this.mint(33, () => new CaptureAdmissionAssembly(START_MIX_SCENARIOS.includes(this.script) || GATE_SEED_MIX_SCENARIOS.includes(this.script) || this.script.startsWith('scope_') ? this.script : 'normal', this.script !== 'issuer_rejected', seed));
      this.point(33, 'seed_check');
      if (!this.seedMatches()) return this.fail('binding_mismatch');
      const target = this.mint(34, () => issuerConstructionAccess.target(issuer));
      this.point(34, 'target_check');
      if (!issuerConstructionAccess.matches(issuer, target)) return this.fail('binding_mismatch');
      const pin = this.mint(35, () => gate.issue(target.scope, target.epoch, this.script));
      this.point(35, 'pin_check');
      if (!gate.bind(pin)) return this.fail('binding_mismatch');
      const draft = this.mint(36, () => {
        const d = this.probeDraft(Object.freeze({ [CANONICAL_FRAME_DRAFT]: true as const, kind: 'probe_only' as const, executable: false as const,
          gate: gate.origin, pin, target, entry: this.#entry, exit: this.#exit }));
        this.#issuedDraft = d; return this.script === 'draft_copy' ? Object.freeze({ ...d }) : d;
      });
      this.point(36, 'draft_check');
      if (!this.draftMatches()) return this.fail('binding_mismatch');
      this.mint(37, () => Object.freeze({ state: 'unused', draft }));
      this.point(37, 'post');
      if (!this.seedMatches() || !issuerConstructionAccess.matches(issuer, target) || !this.draftMatches()) return this.fail('binding_mismatch');
      if (this.probePreparation && !this.prepareProbeBinding(seed, target, pin, draft)) return this.fail('binding_mismatch');
      if (this.runPreparation && !this.prepareRun()) return this.fail('binding_mismatch');
      if (this.exitPreparation && !this.prepareExitSlots()) return this.fail('binding_mismatch');
      if (this.exitGuard && !this.prepareGuardState()) return this.fail('binding_mismatch');
      if (this.localExit && !this.prepareLocalState()) return this.fail('binding_mismatch');
      if (this.bodySeed) return this.prepareBodySeed();
      (this.#slots[1].value as { state: string }).state = 'bound'; this.#ready = true; return this.reply(true, 'draft_held');
    } catch { return this.fail(this.exitPreparation && this.#closed ? 'closed' : 'construction_unconfirmed'); }
    finally { this.#frame = false; }
  }
  check() {
    if (this.#fixed) return this.#fixed;
    if (!this.#ready) return this.reply(false, this.#closed ? 'closed' : 'not_ready');
    if (!this.seedMatches() || !this.draftMatches()) return this.fail('binding_mismatch');
    return this.reply(false, 'blocked_frame_execution');
  }
  checkFramePreparation(legacy = false) {
    if (this.#fixed) return this.#fixed;
    if (!this.#ready || this.#closed) return this.reply(false, 'not_ready');
    const b = this.#probeSlots[7]?.value as ProbeFrameBinding;
    if (!this.probeBindingMatch() || !this.seedMatches() || !this.draftMatches() || !probeStartAccess.matches(b.target.start, b)) return this.fail('binding_mismatch');
    return legacy ? probeStartAccess.legacy(b.target.start) : probeStartAccess.check(b.target.start);
  }
  checkRunPreparation(legacy = false) {
    if (this.#fixed) return this.#fixed;
    if (!this.#ready || this.#closed) return this.reply(false, 'not_ready');
    const b = this.#issuedFrameBinding!;
    if (!this.runSealMatches() || !this.probeBindingMatch() || !probeStateFactsValid(this.liveRunFacts())
      || !probeStartAccess.matchesRun(b.target.start, this.#issuedRunLink!, this.#issuedRunDuty!)) return this.fail('binding_mismatch');
    return this.checkFramePreparation(legacy);
  }
  enterGrantCapture(): Readonly<{ ok: boolean; disposition: string }> {
    if (this.#fixed) return this.#fixed;
    if (!this.grantCapture) return this.reply(false, 'blocked_frame_execution');
    if (!this.#ready || this.#closed) return this.reply(false, 'not_ready');
    const b = this.#issuedFrameBinding!;
    if (!this.runLinkMatches() || !this.probeBindingMatch() || !this.seedMatches() || !this.draftMatches()) return this.fail('binding_mismatch');
    if (!probeStateFactsValid(this.liveRunFacts())) return this.fail('state_invalid');
    const r = probeStartAccess.captureGrant(b.target.start);
    return r.first !== 'none' ? this.fail(r.first) : r;
  }
  checkGrantBodyClosed(legacy = false): Readonly<{ ok: boolean; disposition: string }> {
    if (this.#fixed) return this.#fixed;
    if (!this.#ready || this.#closed) return this.reply(false, 'not_ready');
    const b = this.#issuedFrameBinding!;
    if (!this.runLinkMatches() || !this.probeBindingMatch()
      || !probeStartAccess.matchesRun(b.target.start, this.#issuedRunLink!, this.#issuedRunDuty!)) return this.fail('binding_mismatch');
    return legacy ? probeStartAccess.legacy(b.target.start) : probeStartAccess.check(b.target.start);
  }
  checkExitPreparation(legacy = false): Readonly<{ ok: boolean; disposition: string }> {
    if (this.#fixed) return this.#fixed;
    if (!this.exitPreparation || !this.#ready || this.#closed) return this.reply(false, 'not_ready');
    const bundle = this.#exitSlots[4].value as ProbeExitPreparationBundle;
    if (![1, 2, 3, 4, 5].every(n => this.exitPreparationSlotMatches(n))
      || !probeStartAccess.matchesExit(bundle.start, bundle)) return this.fail('binding_mismatch');
    return this.checkRunPreparation(legacy);
  }
  runExitGuard(): Readonly<ProbeExitGuardReply> {
    if (this.#guardRunReply) return this.#guardRunReply;
    if (this.#fixed || !this.exitGuard || !this.#ready || this.#closed) return Object.freeze({ ...PROBE_GUARD_CLOSED,
      first: runFirst(this.#failure.first), captureFirst: 'none', disposition: this.#fixed ? runFirst(this.#failure.first) : this.#closed ? 'closed' : 'not_ready' });
    return this.#guardRunReply = probeStartAccess.runGuard(this.#issuedFrameBinding!.target.start);
  }
  closeExitGuard(): Readonly<ProbeExitGuardReply> {
    this.#closed = true;
    if (this.#issuedFrameBinding) probeStartAccess.stopCapture(this.#issuedFrameBinding.target.start);
    return this.#guardRunReply ?? Object.freeze({ ...PROBE_GUARD_CLOSED, first: runFirst(this.#failure.first), captureFirst: 'none', disposition: 'closed' });
  }
  checkGuardBodyClosed(legacy = false): Readonly<{ ok: boolean; disposition: string }> {
    return this.checkFramePreparation(legacy);
  }
  inspectExitGuard() {
    const start = this.#issuedFrameBinding?.target.start, s = start ? probeStartAccess.guardInspect(start) : undefined;
    const anchor = this.inspectExitPreparation(), capture = start ? probeStartAccess.captureInspect(start) : undefined;
    return Object.freeze({ model: 'wfb-probe-exit-guard-1', authority: 'none', execution: 'closed', formalIssuance: 'closed',
      wholeRunAdmission: 'disabled', implementation: 'unknown', investigations: 'on_hold', constructionFirst: anchor.first,
      anchor: Object.freeze({ preparation: anchor.preparation, binding: anchor.binding, duty: anchor.duty, control: anchor.control,
        retirement: anchor.retirement, body: anchor.body, terminal: anchor.terminal, start: anchor.start }),
      construction: runEnum(this.#guardConstruction, ['not_started', 'before', 'retained', 'bound', 'confirmed'], 'unconfirmed'),
      retained: this.#guardOwn !== undefined,
      progress: Object.freeze({ state: s ? runEnum(s.state, ['idle', 'capturing', 'checking', 'settling', 'not_entered', 'failed'], 'unconfirmed') : 'not_created',
        first: s ? runFirst(s.first) : 'none', captureFirst: s ? runFirst(s.captureFirst) : 'none',
        branch: s ? runEnum(s.branch, ['none', 'not_entered', 'not_called', 'known', 'unknown', 'invalid'], 'unconfirmed') : 'not_created',
        phase: s ? runEnum(s.phase, ['none', 'capture', 'return', 'identity', 'history', 'claim', 'branch'], 'unconfirmed') : 'not_created',
        boundary: s ? runEnum(s.boundary, ['none', 'before', 'after'], 'unconfirmed') : 'not_created',
        failurePhase: s ? runEnum(s.failurePhase, ['none', 'capture', 'return', 'identity', 'history', 'claim', 'branch'], 'unconfirmed') : 'not_created',
        failureBoundary: s ? runEnum(s.failureBoundary, ['none', 'before', 'after'], 'unconfirmed') : 'not_created',
        routeUsed: s?.routeUsed === true, returned: s?.returned === true, inProgress: s?.inProgress === true, exitUsed: s?.exitUsed === true,
        reentry: runEnum(s?.reentry, ['none', 'run_in_progress'], 'unconfirmed'), sameDuty: s?.sameDuty === true,
        knowledge: s ? runEnum(s.knowledge, ['not_called', 'known', 'unknown'], 'unconfirmed') : 'not_created',
        issuerRetained: s?.issuerRetained === true, currentRetained: s?.currentRetained === true, issuedRetained: s?.issuedRetained === true,
        rejectedRetained: s?.rejectedRetained === true, captureReplyRetained: s?.captureReplyRetained === true, stopRequested: s?.stopRequested === true }),
      enterUsed: anchor.enterUsed, grantIssues: capture?.grantIssues ?? 0, grantAttempts: capture?.grantAttempts ?? 0,
      capturePrefix: capture ? runEnum(capture.prefix, ['none', 'not_claimed', 'claimed_not_issued', 'grant_known', 'grant_unknown'], 'unconfirmed') : 'not_created',
      exitAttempts: s?.exitUsed === true ? 1 : 0, retirementAttempts: 0, terminalCommits: 0, bodyStarts: 0, exitRecords: 0 });
  }
  localExitReply(disposition: string, captureFirst: ProbeRunFirst = 'none', priorFirst: ProbeRunFirst = 'none'): Readonly<ProbeLocalExitReply> {
    const start = this.#issuedFrameBinding?.target.start, p = start ? probeStartAccess.localInspect(start) : undefined;
    return Object.freeze({ model: 'wfb-probe-local-exit-1', ok: false, authority: 'none', execution: 'closed', formalIssuance: 'closed',
      wholeRunAdmission: 'disabled', implementation: 'unknown', investigations: 'on_hold',
      first: p?.first !== undefined && p.first !== 'none' ? runFirst(p.first) : priorFirst !== 'none' ? priorFirst : runFirst(this.#failure.first),
      captureFirst, disposition: runEnum(disposition, ['draft_held', 'duplicate_preparation', 'blocked_frame_execution', 'not_ready', 'closed',
        'input_rejected', 'binding_mismatch', 'construction_unconfirmed', 'held_not_started', 'exit_unconfirmed', 'not_entered'], 'internal_unconfirmed') });
  }
  runLocalExit(): Readonly<ProbeLocalExitReply> {
    if (this.#localReply) return this.#localReply;
    const r = this.runExitGuard(), value = this.localExitReply(r.disposition, r.captureFirst, r.first);
    if (this.#guardOwn?.routeUsed || this.#fixed) this.#localReply = value; return value;
  }
  closeLocalExit(): Readonly<ProbeLocalExitReply> {
    const r = this.closeExitGuard(); return this.#localReply ?? this.localExitReply(r.disposition, r.captureFirst, r.first);
  }
  inspectLocalExit() {
    const base = this.inspectExitGuard(), start = this.#issuedFrameBinding?.target.start;
    const p = start ? probeStartAccess.localInspect(start) : undefined;
    return Object.freeze({ model: 'wfb-probe-local-exit-1', authority: 'none', execution: 'closed', formalIssuance: 'closed',
      wholeRunAdmission: 'disabled', implementation: 'unknown', investigations: 'on_hold', constructionFirst: base.constructionFirst,
      construction: Object.freeze({ ready: this.#ready, phase: this.#localPhase,
        boundary: runEnum(this.#localBoundary, ['none', 'before', 'attempt', 'after', 'done', 'bind', 'post'], 'unconfirmed'),
        stages: Object.freeze(this.#localSlots.map(s => runEnum(s.stage, ['not_started', 'attempting', 'provisional', 'confirmed'], 'unconfirmed'))),
        retained: this.#localSlots.filter(s => s.value !== undefined).length }),
      anchors: Object.freeze({ preparation: base.anchor.preparation, binding: base.anchor.binding, control: base.anchor.control }),
      duty: base.anchor.duty, start: base.anchor.start, guard: base.progress,
      local: Object.freeze({ state: p ? runEnum(p.state, ['idle', 'running', 'held_not_started', 'failed', 'not_entered'], 'unconfirmed') : 'not_created',
        first: p ? runFirst(p.first) : 'none',
        phase: p ? runEnum(p.phase, ['none', ...LOCAL_KNOWN_PHASES, 'not_required'], 'unconfirmed') : 'not_created',
        boundary: p ? runEnum(p.boundary, ['none', 'before', 'after'], 'unconfirmed') : 'not_created',
        failurePhase: p ? runEnum(p.failurePhase, ['none', ...LOCAL_KNOWN_PHASES, 'not_required'], 'unconfirmed') : 'not_created',
        failureBoundary: p ? runEnum(p.failureBoundary, ['none', 'before', 'after'], 'unconfirmed') : 'not_created',
        deliveryUnconfirmed: p?.deliveryUnconfirmed === true, sameDuty: p?.sameDuty === true,
        reentry: runEnum(p?.reentry, ['none', 'run_in_progress'], 'unconfirmed') }),
      retirement: Object.freeze({ kind: p ? runEnum(p.retirement.kind, ['not_attempted', 'attempting', 'confirmed', 'not_required', 'unconfirmed'], 'unconfirmed') : 'not_created',
        attemptUsed: p?.retirement.used === true, blocked: p?.retirement.blocked === true, confirmed: p?.retirement.confirmed === true,
        targetRetained: p?.retirement.targetRetained === true, blockedTargetRetained: p?.retirement.blockedTargetRetained === true,
        confirmedTargetRetained: p?.retirement.confirmedTargetRetained === true, sameTarget: p?.retirement.sameTarget === true,
        targetOpen: p?.retirement.targetOpen === true }),
      absence: Object.freeze({ kind: p ? runEnum(p.absence.kind, ['unobserved', 'not_started'], 'unconfirmed') : 'not_created',
        returned: p?.absence.returned === true, routeClosed: p?.absence.routeClosed === true }),
      terminal: Object.freeze({ kind: p ? runEnum(p.terminal.kind, ['none', 'held_not_started', 'exit_unconfirmed'], 'unconfirmed') : 'not_created',
        prepared: p?.terminal.prepared === true, committed: p?.terminal.committed === true, sameDuty: p?.terminal.sameDuty === true,
        sameAbsence: p?.terminal.sameAbsence === true, sameRetirement: p?.terminal.sameRetirement === true,
        candidateRetained: p?.terminal.candidateRetained === true, issuedRetained: p?.terminal.issuedRetained === true,
        acceptedRetained: p?.terminal.acceptedRetained === true, exitAccepted: false }),
      enterUsed: base.enterUsed, grantIssues: base.grantIssues, grantAttempts: base.grantAttempts, exitAttempts: base.exitAttempts,
      grantState: this.#issuedCells ? runEnum(this.#issuedCells.grant.stage, ['empty', 'attempting', 'provisional', 'active', 'revoked', 'unconfirmed'], 'unconfirmed') : 'not_created',
      grantUnresolved: this.#issuedCells?.grant.unresolved === true,
      probeExit: Object.freeze({ stage: this.#issuedCells ? runEnum(this.#issuedCells.exit.stage, ['empty', 'unsealed', 'unconfirmed'], 'unconfirmed') : 'not_created',
        revoked: this.#issuedCells?.exit.revoked === true, acceptedRetained: this.#issuedCells?.exit.accepted !== undefined }),
      probeBody: Object.freeze({ state: this.#issuedCells ? runEnum(this.#issuedCells.body.state, ['not_started', 'running', 'returned', 'threw', 'cancelled', 'unconfirmed'], 'unconfirmed') : 'not_created',
        outcome: this.#issuedCells ? runEnum(this.#issuedCells.body.outcome, ['none', 'return', 'throw', 'cancel'], 'unconfirmed') : 'not_created' }),
      retirementAttempts: p?.retirement.used === true ? 1 : 0, terminalCommits: p?.terminal.committed === true ? 1 : 0,
      bodyStarts: 0, exitRecords: 0, journalSupply: 'not_connected', rootFinish: 'not_called' });
  }
  exitPreparationReply(ok: boolean, disposition: string): Readonly<ProbeExitPreparationReply> {
    if (this.#exitFixed) return this.#exitFixed;
    const value = Object.freeze({ model: 'wfb-probe-exit-preparation-1' as const, ok,
      disposition: runEnum(disposition, ['draft_held', 'duplicate_preparation', 'construction_in_progress', 'not_ready', 'closed',
        'blocked_frame_execution', 'input_rejected', 'binding_mismatch', 'construction_unconfirmed'], 'internal_unconfirmed'),
      first: runFirst(this.#failure.first), authority: 'none' as const, execution: 'closed' as const, formalIssuance: 'closed' as const,
      wholeRunAdmission: 'disabled' as const, implementation: 'unknown' as const, investigations: 'on_hold' as const });
    if (this.#fixed) this.#exitFixed = value; return value;
  }
  checkExitAxes() {
    return Object.freeze({ model: 'wfb-probe-exit-axes-value-1', kind: 'value_only', authority: 'none',
      valid: this.#failure.first === 'none' && probeExitAxesValid(probeExitAxisShape(this.script)) });
  }
  inspectExitPreparation() {
    const b = this.#issuedFrameBinding, start = b?.target.start, receiver = start ? probeStartAccess.exitInspect(start) : undefined;
    const si = start ? probeStartAccess.inspect(start) : undefined, duty = this.#issuedRunDuty;
    const control = this.#exitSlots[0]?.value as ProbeExitControl | undefined;
    const retirement = this.#exitSlots[1]?.value as ProbeLocalRetirementSlot | undefined;
    const absence = this.#exitSlots[2]?.value as ProbeBodyAbsenceSlot | undefined;
    const terminal = this.#exitSlots[3]?.value as ProbeNotStartedTerminalSlot | undefined;
    return Object.freeze({ model: 'wfb-probe-exit-preparation-1', schema: 1, authority: 'none', execution: 'closed', formalIssuance: 'closed',
      wholeRunAdmission: 'disabled', implementation: 'unknown', investigations: 'on_hold', first: runFirst(this.#failure.first),
      preparation: Object.freeze({ ready: this.#ready, phase: this.#exitPhase,
        boundary: runEnum(this.#exitBoundary, ['none', 'before', 'attempt', 'after', 'done', 'check', 'bind', 'post'], 'unconfirmed'),
        first: this.#exitFirst, retained: this.#exitSlots.filter(s => s.value !== undefined).length,
        stages: Object.freeze(this.#exitSlots.map(s => runEnum(s.stage, ['not_started', 'attempting', 'provisional', 'confirmed'], 'unconfirmed'))),
        issuedRetained: Object.freeze(this.#exitIssued.map(v => v !== undefined)), bindRefusal: runEnum(this.#exitBindRefusal, ['none', 'duplicate_binding'], 'unconfirmed'),
        reentry: runEnum(this.#exitReentry, ['none', 'construction_in_progress'], 'unconfirmed') }),
      binding: Object.freeze({ receiverAttempted: receiver?.attempted === true, receiverRetained: receiver?.retained === true,
        sameDuty: receiver?.sameDuty === true, controlRetained: control !== undefined, bundleRetained: this.#exitSlots[4]?.value !== undefined }),
      // Absent slots are not_created; present values outside the allowlist are unconfirmed, never a positive state.
      duty: Object.freeze({ state: duty ? runEnum(duty.state, ['not_owed', 'owed', 'settling', 'settled_not_started', 'settled_unsealed', 'unconfirmed'], 'unconfirmed') : 'not_created',
        attemptUsed: duty?.attemptUsed === true,
        phase: duty ? runEnum(duty.phase, ['none', 'guard', 'history', 'retire', 'record', 'project'], 'unconfirmed') : 'not_created',
        boundary: duty ? runEnum(duty.boundary, ['none', 'before', 'after'], 'unconfirmed') : 'not_created', linkRetained: Boolean(duty) }),
      control: Object.freeze({ state: control ? runEnum(control.state, ['idle'], 'unconfirmed') : 'not_created', captureReturned: Boolean(control?.captureReturned) }),
      knowledge: Object.freeze({ kind: receiver ? runEnum(receiver.knowledge, ['not_called', 'known', 'unknown'], 'unconfirmed') : 'not_created', callStarted: receiver?.callStarted === true,
        issuerRetained: receiver?.issuerRetained === true, receiverRetained: receiver?.receiverRetained === true }),
      retirement: Object.freeze({ kind: retirement ? runEnum(retirement.kind, ['not_attempted'], 'unconfirmed') : 'not_created', attemptUsed: Boolean(retirement?.used),
        blocked: Boolean(retirement?.blocked), targetRetained: retirement?.target !== undefined }),
      body: Object.freeze({ kind: absence ? runEnum(absence.kind, ['unobserved'], 'unconfirmed') : 'not_created', started: Boolean(absence?.started), returned: Boolean(absence?.returned) }),
      terminal: Object.freeze({ kind: terminal ? runEnum(terminal.kind, ['none'], 'unconfirmed') : 'not_created', candidateRetained: terminal?.candidate !== undefined,
        issuedRetained: terminal?.issued !== undefined, acceptedRetained: terminal?.accepted !== undefined, exitAccepted: false }),
      start: Object.freeze({ wrapperCalls: si?.wrapperCalls ?? 0, generationBodyCalls: si?.generationBodyCalls ?? 0, frameExits: si?.frameExits ?? 0,
        retirementStarts: si?.starts ?? 0, retirementClaimUnused: !si || si.claim === 'unused' }),
      enterUsed: this.#issuedCells?.use.attemptUsed === true, grantIssues: 0, exitAttempts: 0, retirementAttempts: 0, terminalCommits: 0,
      bodyStarts: 0, exitRecords: 0, journalSupply: 'not_connected', rootFinish: 'not_called' });
  }
  runReply(ok: boolean, disposition: string): Readonly<ProbeRunReply> {
    if (this.#runFixedReply) return this.#runFixedReply;
    const value = Object.freeze({ model: this.grantCapture ? 'wfb-probe-grant-capture-1' as const : 'wfb-probe-run-preparation-1' as const, ok,
      disposition: runEnum(disposition, ['draft_held', 'duplicate_preparation', 'construction_in_progress', 'blocked_frame_execution', 'closed', 'not_ready',
        'input_rejected', 'binding_mismatch', 'construction_unconfirmed', 'state_invalid', 'grant_captured_body_closed', 'duplicate_enter', 'enter_in_progress'], 'internal_unconfirmed'),
      first: runFirst(this.#failure.first), authority: 'none' as const, execution: 'closed' as const, formalIssuance: 'closed' as const,
      wholeRunAdmission: 'disabled' as const, implementation: 'unknown' as const, investigations: 'on_hold' as const });
    if (this.#fixed) this.#runFixedReply = value;
    return value;
  }
  checkRunShape() {
    const valid = this.#failure.first === 'none' && probeStateFactsValid(PROBE_SHAPE_SCRIPTS.includes(this.script)
      ? probeShapeFacts(this.script) : this.#issuedCells ? this.liveRunFacts() : probeShapeFacts('shape_unused'));
    return Object.freeze({ model: 'wfb-probe-state-value-1', authority: 'none', kind: 'value_only', valid });
  }
  inspectRun() {
    const cells = this.#issuedCells;
    const grant = cells?.grant, body = cells?.body, exit = cells?.exit, use = cells?.use, duty = this.#issuedRunDuty;
    const start = this.#issuedFrameBinding?.target.start;
    const si = start ? probeStartAccess.inspect(start) : undefined, ri = start ? probeStartAccess.runInspect(start) : undefined;
    const capture = this.grantCapture && start ? probeStartAccess.captureInspect(start) : undefined;
    return Object.freeze({ model: this.grantCapture ? 'wfb-probe-grant-capture-1' : 'wfb-probe-run-preparation-1', schema: 1, authority: 'none', execution: 'closed',
      formalIssuance: 'closed', wholeRunAdmission: 'disabled', implementation: 'unknown', investigations: 'on_hold', first: runFirst(this.#failure.first),
      construction: Object.freeze({ ready: this.#ready, phase: this.#runPhase,
        boundary: runEnum(this.#runBoundary, ['none', 'before', 'attempt', 'after', 'done', 'check', 'post'], 'unconfirmed'),
        retained: this.#runSlots.filter(s => s.value !== undefined).length, stages: Object.freeze(this.#runSlots.map(s => s.stage)),
        priorRetained: this.#slots.filter(s => s.value !== undefined).length, bindingRetained: this.#issuedFrameBinding !== undefined,
        linkRetained: this.#issuedRunLink !== undefined, dutyRetained: duty !== undefined, bindRefusal: this.#runBindRefusal,
        reentry: runEnum(this.#reentry, ['construction_in_progress'], 'none') }),
      use: Object.freeze({ phase: runEnum(use?.state, ['unused', 'entering', 'active', 'exiting', 'unconfirmed'], 'not_created'), attemptUsed: use?.attemptUsed === true }),
      grant: Object.freeze({ stage: runEnum(grant?.stage, ['empty', 'attempting', 'provisional', 'active', 'revoked', 'unconfirmed'], 'not_created'),
        currentRetained: grant?.current !== undefined, issuedRetained: grant?.issued !== undefined, rejectedRetained: grant?.rejected !== undefined,
        unknownObligation: grant?.unresolved === true, localRevocationConfirmed: grant?.stage === 'revoked' }),
      body: Object.freeze({ state: runEnum(body?.state, ['not_started', 'running', 'returned', 'threw', 'cancelled', 'unconfirmed'], 'not_created'),
        outcome: runEnum(body?.outcome, ['none', 'return', 'throw', 'cancel'], 'none') }),
      exit: Object.freeze({ stage: runEnum(exit?.stage, ['empty', 'unsealed', 'unconfirmed'], 'not_created'),
        candidateRetained: exit?.candidate !== undefined, localRevocationConfirmed: exit?.revoked === true, exitAccepted: false }),
      duty: Object.freeze({ state: runEnum(duty?.state, ['not_owed', 'owed', 'settling', 'settled_unsealed', 'unconfirmed'], 'not_created'),
        attemptUsed: duty?.attemptUsed === true, linkRetained: duty !== undefined }),
      start: Object.freeze({ linkRetained: ri?.linkRetained === true, dutyRetained: ri?.dutyRetained === true, bindAttempted: ri?.bindAttempted === true,
        wrapperCalls: si?.wrapperCalls ?? 0, generationBodyCalls: si?.generationBodyCalls ?? 0, frameExits: si?.frameExits ?? 0,
        retirementStarts: si?.starts ?? 0, retirementClaimUnused: !si || si.claim === 'unused' }),
      ...(this.grantCapture ? { capture: Object.freeze({ first: capture?.first ?? 'none',
        phase: runEnum(capture?.phase, ['none', 'preflight', 'claim', 'issue', 'capture', 'validate'], 'unconfirmed'),
        boundary: runEnum(capture?.boundary, ['none', 'check', 'before', 'after', 'attempt', 'issued'], 'unconfirmed'),
        grantAttempts: capture?.grantAttempts ?? 0, grantChecks: capture?.grantChecks ?? 0, inProgress: capture?.inProgress === true,
        issuerRetained: capture?.issuerRetained === true, obligationOwed: capture?.obligationOwed === true, sameDuty: capture?.sameDuty === true,
        stopRequested: capture?.stopRequested === true, refusal: runEnum(capture?.refusal, ['none', 'duplicate_enter'], 'none'),
        reentry: runEnum(capture?.reentry, ['none', 'enter_in_progress'], 'none'),
        prefix: runEnum(capture?.prefix, ['none', 'not_claimed', 'claimed_not_issued', 'grant_known', 'grant_unknown'], 'unconfirmed') }) } : {}),
      grantIssues: capture?.grantIssues ?? 0, bodyStarts: 0, exitRecords: 0, realWriterCalls: 0, journalSupply: 'not_connected', rootFinish: 'not_called' });
  }
  close() {
    if (this.#fixed) return this.#fixed;
    this.#closed = true;
    if (this.grantCapture && this.#issuedFrameBinding) probeStartAccess.stopCapture(this.#issuedFrameBinding.target.start);
    return this.#frame ? this.reply(false, 'deferred_frame') : this.#started ? this.fail('closed') : this.reply(false, 'closed');
  }
  rejectInput() { return this.fail('input_rejected'); }
  inspect() {
    if (this.runPreparation) throw Error('private_projection_required');
    const gate = this.#slots[30].value as CanonicalDraftGate | undefined, issuer = this.#slots[32].value as CaptureAdmissionAssembly | undefined;
    return Object.freeze({ model: 'wfb-canonical-gate-draft-1', first: this.#failure.first, phase: this.#failure.phase,
      boundary: this.#failure.boundary, ready: this.#ready, retained: this.#slots.filter(s => !!s.value).length,
      stages: Object.freeze(this.#slots.map(s => s.stage)), frame: this.#frame ? 'active' : 'inactive', reentry: this.#reentry,
      closeInFrame: this.#closeInFrame, gate: gate?.inspect(), issuer: issuer?.inspect(), seedRetained: !!this.#issuedSeed, draftRetained: !!this.#issuedDraft,
      continuationUse: this.#slots[36].value ? 'unused' : 'not_created', frameExecutions: 0, grantIssues: 0,
      ...(this.probePreparation ? { probe: Object.freeze({ phase: this.#probePhase, boundary: this.#probeBoundary,
        stages: Object.freeze(this.#probeSlots.map(s => s.stage)), retained: this.#probeSlots.filter(s => !!s.value).length,
        bindingRetained: !!this.#issuedFrameBinding, bindRefusal: this.#bindRefusal,
        use: this.#probeSlots[0].value ? Object.freeze({ ...this.#probeSlots[0].value }) : undefined,
        grant: this.#probeSlots[2].value ? Object.freeze({ ...this.#probeSlots[2].value }) : undefined,
        body: this.#probeSlots[3].value ? Object.freeze({ ...this.#probeSlots[3].value }) : undefined,
        exit: this.#probeSlots[4].value ? Object.freeze({ ...this.#probeSlots[4].value }) : undefined,
        start: issuer ? probeStartAccess.inspect(issuerConstructionAccess.target(issuer).start) : undefined }) } : {}),
      realWriterCalls: 0, journalSupply: 'not_connected', admissionConsumptions: 0, packetObjects: 0, closedEvidence: 'not_issued', proofIssuance: 'closed' });
  }
}
export function createCanonicalGateDraftFake(...args: readonly unknown[]) {
  const s = args.length ? args[0] : 'normal';
  const scripts = ['normal', 'reenter', 'close_in_frame', 'issuer_rejected', ...START_MIX_SCENARIOS, ...GATE_SEED_MIX_SCENARIOS,
    ...['owner', 'construction', 'retention', 'sourceSlot', 'claim', 'extra'].map(f => 'scope_' + f),
    ...['copy', 'brand', 'extra', 'gate', 'origin'].map(f => 'seed_' + f),
    ...['copy', 'brand', 'extra', 'gate', 'scope', 'owner', 'construction', 'retention', 'sourceSlot', 'claim', 'epoch'].map(f => 'pin_' + f),
    ...['copy', 'brand', 'extra', 'gate', 'pin', 'target', 'entry', 'exit', 'kind', 'executable'].map(f => 'draft_' + f)];
  const admitted = args.length <= 1 && typeof s === 'string' && (scripts.includes(s) || /^(before|attempt|after|done)_([1-9]|[12][0-9]|3[0-7])$/.test(s)
    || ['seed_check_33', 'target_check_34', 'pin_check_35', 'draft_check_36', 'post_37'].includes(s));
  const a = new CanonicalGateDraftRoot(admitted ? s as string : 'normal', admitted);
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.prepare(),
    check: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.check(),
    close: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.close(), inspect: () => a.inspect() });
}

export function createProbeFramePreparationFake(...args: readonly unknown[]) {
  const script = args.length ? args[0] : 'normal';
  const scripts = ['normal', 'duplicate_frame_binding', 'reenter_frame_preparation', 'start_cells_copy',
    ...['copy', 'brand', 'extra', 'owner', 'use', 'frame', 'grant', 'body', 'exit', 'diagnostic'].map(f => 'cells_' + f),
    ...['copy', 'brand', 'extra', 'seed', 'target', 'gate', 'pin', 'scope', 'owner', 'epoch', 'packet', 'draft', 'entry', 'exit', 'cells'].map(f => 'frame_' + f)];
  const admitted = args.length <= 1 && typeof script === 'string' && (scripts.includes(script)
    || /^cell_(before|attempt|after|done)_([1-8])$/.test(script) || ['cell_check_7', 'cell_check_8', 'cell_post_8'].includes(script));
  const a = new CanonicalGateDraftRoot(admitted ? script as string : 'normal', admitted, true);
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.prepare(),
    check: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.checkFramePreparation(),
    checkLegacy: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.checkFramePreparation(true),
    close: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.close(), inspect: () => a.inspect() });
}

export function createProbeRunPreparationFake(...args: readonly unknown[]) {
  const script = args.length ? args[0] : 'normal';
  const scripts = ['normal', 'duplicate_run_binding', 'reenter_run_preparation', 'close_during_run_preparation', 'start_run_link_copy', 'start_run_duty_copy',
    ...PROBE_SHAPE_SCRIPTS, ...['copy', 'brand', 'extra', 'origin', 'binding', 'cells', 'frame', 'entry', 'exit'].map(f => 'link_' + f),
    ...['copy', 'brand', 'extra', 'link', 'state', 'attempt', 'phase', 'boundary'].map(f => 'duty_' + f),
    ...['copy', 'extra', 'link', 'duty', 'executable'].map(f => 'seal_' + f)];
  const admitted = args.length <= 1 && typeof script === 'string' && (scripts.includes(script)
    || /^run_(before|attempt|after|done)_([1-4])$/.test(script) || ['run_check_2', 'run_check_3', 'run_check_4', 'run_post_4'].includes(script));
  const a = new CanonicalGateDraftRoot(admitted ? script as string : 'normal', admitted, true, true);
  const call = (xs: readonly unknown[], op: () => Readonly<{ ok: boolean; disposition: string }>) => {
    const r = xs.length ? a.rejectInput() : op(); return a.runReply(r.ok, r.disposition);
  };
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => call(xs, () => a.prepare()),
    check: (...xs: readonly unknown[]) => call(xs, () => a.checkRunPreparation()),
    checkLegacy: (...xs: readonly unknown[]) => call(xs, () => a.checkRunPreparation(true)),
    checkState: (...xs: readonly unknown[]) => { if (xs.length) a.rejectInput(); return a.checkRunShape(); },
    close: (...xs: readonly unknown[]) => call(xs, () => a.close()), inspect: () => a.inspectRun() });
}

export function createProbeGrantCaptureFake(...args: readonly unknown[]) {
  const script = args.length ? args[0] : 'normal';
  const points = ['claim_before', 'claim_after', 'issue_before', 'issue_attempt', 'issue_issued', 'capture_before', 'capture_after', 'validate_before', 'validate_after'];
  const scripts = ['normal', 'issue_throw', 'preflight_link_copy', 'preflight_duty_copy', ...points.flatMap(p => ['fault_' + p, 'stop_' + p, 'reenter_' + p]),
    ...['copy', 'issued_copy', 'brand', 'extra', 'bindingOrigin', 'gate', 'owner', 'pin', 'epoch', 'frame', 'draft', 'entry', 'exit', 'phase'].map(f => 'grant_' + f)];
  const admitted = args.length <= 1 && typeof script === 'string' && scripts.includes(script);
  const a = new CanonicalGateDraftRoot(admitted ? script as string : 'normal', admitted, true, true, true);
  const call = (xs: readonly unknown[], op: () => Readonly<{ ok: boolean; disposition: string }>) => {
    const r = xs.length ? a.rejectInput() : op(); return a.runReply(r.ok, r.disposition);
  };
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => call(xs, () => a.prepare()),
    enter: (...xs: readonly unknown[]) => call(xs, () => a.enterGrantCapture()),
    check: (...xs: readonly unknown[]) => call(xs, () => a.checkGrantBodyClosed()),
    checkLegacy: (...xs: readonly unknown[]) => call(xs, () => a.checkGrantBodyClosed(true)),
    checkState: (...xs: readonly unknown[]) => { if (xs.length) a.rejectInput(); return a.checkRunShape(); },
    close: (...xs: readonly unknown[]) => call(xs, () => a.close()), inspect: () => a.inspectRun() });
}

export function createProbeExitPreparationFake(...args: readonly unknown[]) {
  const script = args.length ? args[0] : 'normal';
  const fields = [['copy', 'brand', 'extra', 'link', 'duty', 'binding', 'cells', 'start', 'state', 'captureReturned'],
    ['copy', 'extra', 'duty', 'control', 'kind', 'used', 'blocked', 'target'],
    ['copy', 'extra', 'duty', 'control', 'kind', 'started', 'returned'],
    ['copy', 'extra', 'duty', 'control', 'absence', 'kind', 'candidate', 'issued', 'accepted'],
    ['copy', 'brand', 'extra', 'link', 'duty', 'start', 'control', 'retirement', 'absence', 'terminal']];
  const scripts = ['normal', 'exit_receiver_copy', 'exit_duplicate_binding', ...PROBE_EXIT_AXIS_SCRIPTS,
    ...fields.flatMap((fs, i) => fs.map(f => `exit_slot_${i + 1}_${f}`)),
    ...[1, 2, 3, 4, 5].flatMap(n => ['before', 'attempt', 'after', 'done', 'check', ...(n === 5 ? ['bind', 'post'] : [])]
      .flatMap(b => [`exit_${b}_${n}`, `exit_stop_${b}_${n}`, `exit_reenter_${b}_${n}`]))];
  const admitted = args.length <= 1 && typeof script === 'string' && scripts.includes(script);
  const a = new CanonicalGateDraftRoot(admitted ? script as string : 'normal', admitted, true, true, false, true);
  const call = (xs: readonly unknown[], op: () => Readonly<{ ok: boolean; disposition: string }>) => {
    const r = xs.length ? a.rejectInput() : op(); return a.exitPreparationReply(r.ok, r.disposition);
  };
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => call(xs, () => a.prepare()),
    check: (...xs: readonly unknown[]) => call(xs, () => a.checkExitPreparation()),
    checkLegacy: (...xs: readonly unknown[]) => call(xs, () => a.checkExitPreparation(true)),
    checkAxes: (...xs: readonly unknown[]) => { if (xs.length) a.rejectInput(); return a.checkExitAxes(); },
    close: (...xs: readonly unknown[]) => call(xs, () => a.close()),
    inspect: (...xs: readonly unknown[]) => { if (xs.length) a.rejectInput(); return a.inspectExitPreparation(); } });
}

export function createProbeExitGuardFake(...args: readonly unknown[]) {
  const script = args.length ? args[0] : 'g_normal';
  const points = ['capture_before', 'return_after', 'identity_before', 'identity_after', 'history_before', 'history_after', 'claim_before', 'claim_after', 'branch_before', 'branch_after'];
  const scripts = ['g_normal', 'g_not_called', 'g_reserved_not_called', 'g_known_issuer', 'g_unknown', 'g_not_entered',
    'g_stop_capture_before', 'g_stop_capture_claim', 'g_stop_capture_known', 'g_setup_before', 'g_setup_after', 'g_setup_post', 'g_history_unreturned',
    ...GUARD_IDENTITY_FIELDS.map(f => 'g_mix_' + f), 'g_mix_copy', 'g_mix_brand', 'g_mix_body',
    ...['copy', 'issued_copy', 'brand', 'extra', 'bindingOrigin', 'gate', 'owner', 'pin', 'epoch', 'frame', 'draft', 'entry', 'exit', 'phase'].map(f => 'g_invalid_' + f),
    ...points.flatMap(p => ['g_fault_' + p, 'g_stop_' + p, 'g_reenter_' + p])];
  const admitted = args.length <= 1 && typeof script === 'string' && scripts.includes(script);
  const a = new CanonicalGateDraftRoot(admitted ? script as string : 'g_normal', admitted, true, true, false, true, true);
  const call = (xs: readonly unknown[], op: () => Readonly<{ ok: boolean; disposition: string }>) => {
    const r = xs.length ? a.rejectInput() : op();
    return Object.freeze({ ...PROBE_GUARD_CLOSED, first: a.exitPreparationReply(r.ok, r.disposition).first,
      captureFirst: 'none', disposition: runEnum(r.disposition, ['draft_held', 'duplicate_preparation', 'blocked_frame_execution', 'not_ready', 'closed',
        'input_rejected', 'binding_mismatch', 'construction_unconfirmed'], 'internal_unconfirmed') });
  };
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => call(xs, () => a.prepare()),
    run: (...xs: readonly unknown[]) => { if (xs.length) return call(xs, () => a.prepare()); return a.runExitGuard(); },
    check: (...xs: readonly unknown[]) => call(xs, () => a.checkGuardBodyClosed()),
    checkLegacy: (...xs: readonly unknown[]) => call(xs, () => a.checkGuardBodyClosed(true)),
    close: (...xs: readonly unknown[]) => { if (xs.length) return call(xs, () => a.close()); return a.closeExitGuard(); },
    inspect: (...xs: readonly unknown[]) => { if (xs.length) a.rejectInput(); return a.inspectExitGuard(); } });
}

export function createProbeBodySeedFake(...args: readonly unknown[]) {
  const script = args.length ? args[0] : 's_normal';
  const bootstrap = Array.from({ length: 15 }, (_, i) => `BS${String(i).padStart(2, '0')}`);
  const data = Array.from({ length: 5 }, (_, i) => `BC${String(i + 1).padStart(2, '0')}`);
  const points = [...bootstrap.flatMap(p => ['before', 'attempt', 'retained', 'done'].map(b => `${p}_${b}`)),
    ...['before', 'after'].map(b => `BC00_${b}`), ...data.flatMap(p => ['before', 'attempt', 'issued', 'captured', 'checked', 'confirmed'].map(b => `${p}_${b}`))];
  const scripts = ['s_normal', ...points.flatMap(p => ['fault', 'close', 'reenter'].map(k => `s_${k}_${p}`)),
    ...[1, 2, 3, 4, 5].map(n => `s_producer_throw_${n}`),
    ...BODY_DATA_FIELDS.flatMap((fields, i) => [...fields, 'brand', 'extra', 'copy', 'getter'].map(f => `s_mix_${i + 1}_${f}`))];
  const admitted = args.length <= 1 && typeof script === 'string' && scripts.includes(script);
  const a = new CanonicalGateDraftRoot(admitted ? script as string : 's_normal', admitted, true, true, false, true, false, false, true);
  const call = (xs: readonly unknown[], op: () => Readonly<{ ok: boolean; disposition: string }>) => {
    const r = xs.length ? a.rejectInput() : op(); return a.bodySeedReply(r.disposition);
  };
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => call(xs, () => a.prepare()),
    check: (...xs: readonly unknown[]) => call(xs, () => ({ ok: false, disposition: 'blocked_frame_execution' })),
    checkLegacy: (...xs: readonly unknown[]) => call(xs, () => a.checkFramePreparation(true)),
    close: (...xs: readonly unknown[]) => call(xs, () => a.close()),
    inspect: (...xs: readonly unknown[]) => { if (xs.length) a.rejectInput(); return a.inspectBodySeed(); } });
}

export function createProbeBodyBundleFake(...args: readonly unknown[]) {
  const script = args.length ? args[0] : 's_normal';
  const points = ['BC12', 'BC13'].flatMap(p => ['before', 'attempt', 'issued', 'frozen', 'captured', 'checked', 'confirmed'].map(b => `${p}_${b}`));
  points.push('BC13_post_before', 'BC13_post_after');
  const scripts = ['s_normal', ...points.flatMap(p => ['fault', 'close', 'reenter'].map(k => `s_${k}_${p}`)),
    ...[12, 13].flatMap(n => [`s_bundle_producer_throw_${n}`, `s_bundle_freeze_throw_${n}`]),
    ...BODY_BUNDLE_FIELDS.flatMap((row, i) => [...row, 'brand', 'extra', 'copy', 'getter', 'missing', 'prototype', 'unfrozen', 'non_enumerable',
      ...(i === 0 ? row : ['bundle', 'runSeal']).map(f => `child_copy_${f}`)]
      .map(f => `s_bundle_mix_${i + 12}_${f}`))];
  const admitted = args.length <= 1 && typeof script === 'string' && scripts.includes(script);
  const a = new CanonicalGateDraftRoot(admitted ? script as string : 's_normal', admitted, true, true, false, true, false, false, true, true, true);
  const call = (xs: readonly unknown[], op: () => Readonly<{ ok: boolean; disposition: string }>) => {
    const r = xs.length ? a.rejectInput() : op(); return a.bodyBundleReply(r.disposition);
  };
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => call(xs, () => a.prepare()),
    check: (...xs: readonly unknown[]) => call(xs, () => ({ ok: false, disposition: 'blocked_frame_execution' })),
    checkLegacy: (...xs: readonly unknown[]) => call(xs, () => a.checkFramePreparation(true)),
    close: (...xs: readonly unknown[]) => call(xs, () => a.close()),
    inspect: (...xs: readonly unknown[]) => { if (xs.length) a.rejectInput(); return a.inspectBodyBundle(); } });
}

export function createProbeBodyLiveFake(...args: readonly unknown[]) {
  const script = args.length ? args[0] : 's_normal';
  const phases = ['BC06', 'BC07', 'BC08', 'BC09', 'BC10', 'BC11'];
  const points = phases.flatMap((p, i) => ['before', 'attempt', 'issued', 'captured', 'checked', 'confirmed',
    ...Array.from({ length: BODY_LIVE_REFS[i].length + 1 }, (_, j) => `fix_${j}`), 'sealed'].map(b => `${p}_${b}`));
  const scripts = ['s_normal', ...points.flatMap(p => ['fault', 'close', 'reenter'].map(k => `s_${k}_${p}`)),
    ...[6, 7, 8, 9, 10, 11].map(n => `s_live_producer_throw_${n}`),
    ...BODY_LIVE_REFS.flatMap((refs, i) => [...refs, ...BODY_LIVE_PROGRESS[i], 'brand', 'extra', 'copy', 'getter', 'missing', 'prototype',
      'freeze', 'mutable_ref', 'unsealed'].map(f => `s_live_mix_${i + 6}_${f}`))];
  const admitted = args.length <= 1 && typeof script === 'string' && scripts.includes(script);
  const a = new CanonicalGateDraftRoot(admitted ? script as string : 's_normal', admitted, true, true, false, true, false, false, true, true);
  const call = (xs: readonly unknown[], op: () => Readonly<{ ok: boolean; disposition: string }>) => {
    const r = xs.length ? a.rejectInput() : op(); return a.bodyLiveReply(r.disposition);
  };
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => call(xs, () => a.prepare()),
    check: (...xs: readonly unknown[]) => call(xs, () => ({ ok: false, disposition: 'blocked_frame_execution' })),
    checkLegacy: (...xs: readonly unknown[]) => call(xs, () => a.checkFramePreparation(true)),
    close: (...xs: readonly unknown[]) => call(xs, () => a.close()),
    inspect: (...xs: readonly unknown[]) => { if (xs.length) a.rejectInput(); return a.inspectBodyLive(); } });
}

export function createProbeLocalExitFake(...args: readonly unknown[]) {
  const script = args.length ? args[0] : 'c_normal';
  const scripts = ['c_normal', 'c_not_called', 'c_reserved_not_called', 'c_known_issuer', 'c_unknown', 'c_not_entered',
    'c_stop_capture_before', 'c_stop_capture_claim', 'c_stop_capture_known', 'c_mix_target', 'c_mix_post_target', 'c_mix_terminal_duty',
    ...['guard', 'bundle', 'duty', 'control', 'copy', 'brand'].map(f => 'c_context_' + f),
    ...['copy', 'issued_copy', 'brand', 'extra', 'bindingOrigin', 'gate', 'owner', 'pin', 'epoch', 'frame', 'draft', 'entry', 'exit', 'phase'].map(f => 'c_invalid_' + f),
    ...[1, 2, 3, 4].flatMap(n => ['before', 'attempt', 'after', 'done', ...(n === 4 ? ['bind', 'post'] : [])].map(b => `c_setup_${b}_${n}`)),
    ...[['', LOCAL_KNOWN_PHASES], ['empty_', LOCAL_EMPTY_PHASES], ['known_first_', LOCAL_KNOWN_PHASES]].flatMap(([prefix, phases]) =>
      (phases as readonly string[]).flatMap(p => ['before', 'after'].flatMap(b => ['fault', 'stop', 'reenter'].map(k => `c_${prefix}${k}_${p}_${b}`))))];
  const admitted = args.length <= 1 && typeof script === 'string' && scripts.includes(script);
  const a = new CanonicalGateDraftRoot(admitted ? script as string : 'c_normal', admitted, true, true, false, true, true, true);
  const call = (xs: readonly unknown[], op: () => Readonly<{ ok: boolean; disposition: string }>) => {
    const r = xs.length ? a.rejectInput() : op(); return a.localExitReply(r.disposition);
  };
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => call(xs, () => a.prepare()),
    run: (...xs: readonly unknown[]) => { if (xs.length) return call(xs, () => a.prepare()); return a.runLocalExit(); },
    check: (...xs: readonly unknown[]) => call(xs, () => a.checkGuardBodyClosed()),
    checkLegacy: (...xs: readonly unknown[]) => call(xs, () => a.checkGuardBodyClosed(true)),
    close: (...xs: readonly unknown[]) => { if (xs.length) return call(xs, () => a.close()); return a.closeLocalExit(); },
    inspect: (...xs: readonly unknown[]) => { if (xs.length) a.rejectInput(); return a.inspectLocalExit(); } });
}

// Diagnostics-only synthetic generation binding. No journal/fact/scope/producer references escape.
interface GenerationEpochBinding {
  readonly owner: object; readonly pin: RetirementBindingPin; readonly captureEpoch: object;
  readonly bindingScope: JournalScope;
  readonly source: Readonly<{ identity: object; scope: JournalScope }> | undefined;
}
const JOURNAL_SCRIPTS = Object.freeze(['normal', 'before_source_failure', 'source_attempt_failure', 'after_source_failure',
  'before_bind_failure', 'control_mint_unconfirmed', 'retire_binding_with_claim_alias', 'retire_binding_with_control_alias',
  'view_failure', 'post_failure', 'post_registry_missing', 'registry_0_failure', 'bindings_0_failure', 'declarations_0_failure',
  'metadata_and_source_failure', 'legacy_clear', 'legacy_clear_twice', 'legacy_clear_after_seal',
  'owner_copy', 'pin_copy', 'construction_copy', 'retention_copy', 'source_slot_copy', 'capture_epoch_copy',
  'binding_scope_copy', 'binding_epoch_copy', 'source_identity_copy', 'source_scope_copy', 'source_epoch_copy', 'source_missing',
  ...['begin', 'complete', 'candidate', 'commit', 'seal'].flatMap(boundary =>
    Array.from({ length: 25 }, (_, i) => `${boundary}_${i + 1}`))]);
class JournalAssembly {
  readonly #owner = Object.freeze({}); readonly #captureEpoch = Object.freeze({});
  readonly #binding: PendingSourceBinding; readonly #pin: RetirementBindingPin;
  #generation: GenerationEpochBinding | undefined;
  #started = false; #sealed = false;
  #first: 'none' | 'input_rejected' | 'duplicate_preparation' | 'binding_mismatch' | 'journal_unconfirmed' | 'source_unconfirmed' = 'none';
  #result: Readonly<{ ok: boolean; reason: string }> | undefined;
  constructor(private readonly script: string, admitted: boolean) {
    const fault = /^(begin|complete|candidate|commit|seal)_\d+$/.test(script) ? script : undefined;
    const field = fault ? Number(fault.split('_')[1]) : 0;
    this.#binding = new PendingSourceBinding(['before_source_failure', 'source_attempt_failure', 'after_source_failure', 'before_bind_failure',
      'control_mint_unconfirmed', 'retire_binding_with_claim_alias', 'retire_binding_with_control_alias'].includes(script) ? script : 'normal', admitted,
    { sourceFault: script === 'metadata_and_source_failure' ? 'complete_7' : field <= 11 ? fault : undefined, bindingFault: field > 11 ? fault : undefined,
      sourceScenario: script === 'metadata_and_source_failure' ? 'post_failure'
        : ['view_failure', 'post_failure', 'post_registry_missing', 'registry_0_failure', 'bindings_0_failure', 'declarations_0_failure'].includes(script) ? script : undefined });
    this.#pin = retirementBindingAccess.pin(this.#binding);
    if (!admitted) this.#first = 'input_rejected';
  }
  private result(ok: boolean, reason: string) {
    return Object.freeze({ ok, reason });
  }
  prepare() {
    if (this.#result) return this.#result;
    if (this.#first !== 'none') return this.#result = this.result(false, this.#first);
    if (this.#started) { this.#first = 'duplicate_preparation'; return this.#result = this.result(false, this.#first); }
    this.#started = true; return this.#binding.prepare();
  }
  private matches(value: GenerationEpochBinding): boolean {
    const source = bindingJournalAccess.source(this.#binding), b = bindingJournalAccess.journal(this.#binding);
    return value.owner === this.#owner && value.pin === this.#pin && retirementBindingAccess.matches(this.#binding, value.pin)
      && value.captureEpoch === this.#captureEpoch && value.bindingScope === b.scope && b.ready(value.bindingScope)
      && (source ? !!value.source && value.source.identity === sourceIdentity(source)
        && value.source.scope === sourceJournalAccess(source).scope && sourceJournalAccess(source).ready(value.source.scope) : value.source === undefined);
  }
  seal() {
    if (this.#result) return this.#result;
    // Close producer entry before sealing history; this is not a close diagnosis or legacy clear.
    this.#sealed = true;
    const source = bindingJournalAccess.source(this.#binding), bindingJournal = bindingJournalAccess.journal(this.#binding);
    if (this.script === 'legacy_clear' || this.script === 'legacy_clear_twice') {
      // Exercise only the existing legacy writer, and only before the retirement seal; never fill history from the new path.
      source?.close(); if (this.script === 'legacy_clear_twice') source?.close();
    }
    const context = retirementBindingAccess.stopContext(this.#binding);
    if (context.kind === 'unconfirmed') this.#first = 'source_unconfirmed';
    else if (context.kind === 'root_captured' && !retirementBindingAccess.sealRoot(this.#binding)) this.#first = 'source_unconfirmed';
    const sourceReady = source ? sourceJournalAccess(source).seal() : true;
    const bindingReady = bindingJournal.seal();
    if (this.#first === 'none' && (!sourceReady || !bindingReady)) this.#first = 'journal_unconfirmed';
    const own: GenerationEpochBinding = Object.freeze({ owner: this.#owner, pin: this.#pin, captureEpoch: this.#captureEpoch,
      bindingScope: bindingJournal.scope, source: source ? Object.freeze({ identity: sourceIdentity(source), scope: sourceJournalAccess(source).scope }) : undefined });
    const copy = (o: object) => Object.freeze({ ...o });
    const value: GenerationEpochBinding = this.script === 'owner_copy' ? { ...own, owner: copy(own.owner) }
      : this.script === 'pin_copy' ? { ...own, pin: { ...own.pin } }
        : ['construction_copy', 'retention_copy', 'source_slot_copy'].includes(this.script)
          ? { ...own, pin: { ...own.pin, [this.script === 'source_slot_copy' ? 'sourceSlot' : this.script.split('_')[0]]: Object.freeze({}) } }
          : this.script === 'capture_epoch_copy' ? { ...own, captureEpoch: copy(own.captureEpoch) }
            : this.script === 'binding_scope_copy' ? { ...own, bindingScope: { ...own.bindingScope } }
              : this.script === 'binding_epoch_copy' ? { ...own, bindingScope: { ...own.bindingScope, epoch: copy(own.bindingScope.epoch) } }
                : this.script === 'source_missing' ? { ...own, source: undefined }
                  : own.source && this.script.startsWith('source_') ? { ...own, source: {
                    identity: this.script === 'source_identity_copy' ? copy(own.source.identity) : own.source.identity,
                    scope: this.script === 'source_scope_copy' ? { ...own.source.scope }
                      : this.script === 'source_epoch_copy' ? { ...own.source.scope, epoch: copy(own.source.scope.epoch) } : own.source.scope } } : own;
    if (this.#first === 'none' && !this.matches(value)) this.#first = 'binding_mismatch';
    if (this.#first === 'none') this.#generation = own;
    this.#result = this.result(this.#first === 'none', this.#first);
    // A late legacy writer after both seals must be refused and detected, not recorded as absence evidence.
    if (this.script === 'legacy_clear_after_seal') source?.close();
    return this.#result;
  }
  reject() { if (!this.#result) { this.#first = 'input_rejected'; this.#sealed = true; this.#result = this.result(false, this.#first); } return this.#result; }
  inspect() {
    const source = bindingJournalAccess.source(this.#binding);
    return Object.freeze({ model: 'wfb-absence-journal-fake-1', first: this.#first, started: this.#started, sealed: this.#sealed,
      generationBound: !!this.#generation, admissionConsumption: 'closed', packetGeneration: 'closed', proofIssuance: 'closed',
      fieldClears: 0, rootFinish: 'not_called', binding: bindingJournalAccess.journal(this.#binding).inspect(),
      source: source ? sourceJournalAccess(source).inspect() : undefined, retained: this.#binding.inspect().retentionTable,
      producerFirst: this.#binding.inspect().firstReason, sourceFirst: this.#binding.inspect().source?.firstReason });
  }
}
export function createAbsenceJournalFake(...args: readonly unknown[]) {
  const script = args.length === 0 ? 'normal' : args[0];
  const admitted = args.length <= 1 && typeof script === 'string' && JOURNAL_SCRIPTS.includes(script);
  const a = new JournalAssembly(admitted ? script as string : 'normal', admitted);
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => xs.length ? a.reject() : a.prepare(),
    seal: (...xs: readonly unknown[]) => xs.length ? a.reject() : a.seal(), inspect: () => a.inspect() });
}
