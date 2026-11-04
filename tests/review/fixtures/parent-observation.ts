/** Test-only, observation is not worker protocol acceptance or runtime authority. */
export const OBSERVATION_LIMIT = 4096;
type Phase = 'none' | 'review' | 'ready' | 'analyze' | 'finish' | 'cleanup';
type Event = 'review_start' | 'review_end' | 'factory_start' | 'factory_return' | 'factory_throw'
  | 'ready_observed' | 'reply_observed' | 'post_try' | 'post_return' | 'post_throw'
  | 'terminate_try' | 'terminate_settle' | 'terminate_throw' | 'worker_exit' | 'close_start' | 'close_end';
type Detail = 'none' | 'matched' | 'duplicate' | 'unmatched' | 'fulfilled' | 'rejected';
const OUTCOME_CODES = ['invalid_input', 'access_denied', 'authentication_failed', 'cancelled', 'deadline_exceeded',
  'worker_unavailable', 'internal_review_error', 'review_busy', 'metadata_unavailable'] as const;
type Code = typeof OUTCOME_CODES[number] | 'none' | 'other_fixed_code';
export interface ObservationEvent {
  seq: number; at_ms: number; review: number; worker: number; request: number;
  event: Event; phase: Phase; detail: Detail; code: Code;
}
/** Never invokes accessors, reads a body, or retains a protocol message. */
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}
export class ParentObservation {
  private readonly entries = new Array<ObservationEvent | undefined>(OBSERVATION_LIMIT);
  private count = 0;
  private last = 0;
  private reason: 'none' | 'capacity' | 'clock' | 'observer' = 'none';
  private readonly ids = { review: 0, worker: 0, request: 0 };
  constructor(private readonly now: () => number) {}
  get active() { return this.reason === 'none'; }
  incomplete(reason: 'capacity' | 'clock' | 'observer') { if (this.active) this.reason = reason; }
  ordinal(kind: keyof typeof this.ids): number {
    if (!this.active) return 0;
    if (this.ids[kind] === OBSERVATION_LIMIT) { this.incomplete('capacity'); return 0; }
    return ++this.ids[kind];
  }
  record(event: Event, review = 0, worker = 0, request = 0, phase: Phase = 'none', detail: Detail = 'none', code: Code = 'none') {
    if (!this.active) return;
    if (this.count === OBSERVATION_LIMIT) { this.incomplete('capacity'); return; }
    let at: number;
    try { at = this.now(); } catch { this.incomplete('clock'); return; }
    if (!Number.isFinite(at) || at < this.last || at < 0) { this.incomplete('clock'); return; }
    this.last = at;
    this.entries[this.count] = { seq: this.count + 1, at_ms: at, review, worker, request, event, phase, detail, code };
    this.count++;
  }
  reviewEnd(review: number, value?: unknown, rejected = false) {
    if (!this.active) return;
    let code: Code = rejected ? 'other_fixed_code' : 'none';
    try {
      if (!rejected && field(value, 'isError') === true) {
        const raw = field(field(value, 'error'), 'code');
        code = OUTCOME_CODES.find(allowed => allowed === raw) ?? 'other_fixed_code';
      }
    } catch { this.incomplete('observer'); }
    this.record('review_end', review, 0, 0, 'review', rejected ? 'rejected' : 'fulfilled', code);
  }
  snapshot() {
    return { measurement_incomplete: !this.active, reason: this.reason, limit: OBSERVATION_LIMIT,
      events: this.entries.slice(0, this.count).map(e => ({ ...e! })) };
  }
}

export class WorkerObservation {
  // Numeric protocol IDs only; total insertions are bounded by the shared log's request ordinals.
  private readonly requests = new Map<number, { ordinal: number; phase: 'analyze' | 'finish'; replied: boolean }>();
  constructor(private readonly log: ParentObservation, private readonly review: number, private readonly worker: number) {}
  private record(event: Event, request = 0, phase: Phase = 'none', detail: Detail = 'none') {
    this.log.record(event, this.review, this.worker, request, phase, detail);
  }
  message(value: unknown) {
    if (!this.log.active) { this.requests.clear(); return; }
    try {
      if (field(value, 'type') === 'review_worker_ready') { this.record('ready_observed', 0, 'ready'); return; }
      const id = field(value, 'id'), match = typeof id === 'number' ? this.requests.get(id) : undefined;
      this.record('reply_observed', match?.ordinal ?? 0, match?.phase ?? 'none',
        match ? match.replied ? 'duplicate' : 'matched' : 'unmatched');
      if (match) match.replied = true;
    } catch { this.log.incomplete('observer'); this.requests.clear(); }
  }
  post<T>(value: unknown, operation: () => T): T {
    let request = 0, phase: Phase = 'none';
    if (this.log.active) {
      try {
        const kind = field(value, 'kind'), id = field(value, 'id');
        if (kind === 'analyze' || kind === 'finish') phase = kind;
        if ((phase === 'analyze' || phase === 'finish') && typeof id === 'number' && Number.isSafeInteger(id) && id > 0) {
          let match = this.requests.get(id);
          if (!match) {
            request = this.log.ordinal('request');
            if (request) { match = { ordinal: request, phase, replied: false }; this.requests.set(id, match); }
          }
          request = match?.ordinal ?? 0;
        }
        this.record('post_try', request, phase);
      } catch { this.log.incomplete('observer'); this.requests.clear(); }
    } else this.requests.clear();
    // The observer never replaces the return value or the original synchronous error.
    try { const result = operation(); this.record('post_return', request, phase); return result; }
    catch (error) { this.record('post_throw', request, phase); throw error; }
  }
  exit() { this.record('worker_exit', 0, 'cleanup'); this.requests.clear(); }
}
