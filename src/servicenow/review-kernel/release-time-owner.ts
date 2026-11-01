/** Non-authoritative value scope. No runtime issuer or session registration. */
import {z} from 'zod';
export type ReleaseTimeBinding = Readonly<{
  run: object; session: object; source: object; key: object; origin: object; budget: object;
  started_at: string; deadline_ms: number;
}>;
export type ReleaseTimeStop = 'cancelled' | 'deadline_exceeded' | 'internal_review_error';
type TimeValues = Readonly<{started_at: string; deadline_ms: number; observed_at: string; last_utc: string}>;
type Phase = 'allocate' | 'observe' | 'issue' | 'accept' | 'discard' | 'revoke';
type State = 'fresh' | 'allocating' | 'allocated' | 'observing' | 'observed' | 'issuing' | 'issued' | 'receiving' | 'held' | 'discarding' | 'discarded' | 'failed';
const utc = z.iso.datetime({precision: 3});
const keys = ['run', 'session', 'source', 'key', 'origin', 'budget', 'started_at', 'deadline_ms'] as const;
function copyBinding(value: ReleaseTimeBinding): ReleaseTimeBinding | undefined {
  const copy = Object.create(null) as Record<string, unknown>;
  try {
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) return;
      copy[key] = descriptor.value;
    }
    return Object.freeze(copy) as ReleaseTimeBinding;
  } catch { return; }
}
export function createReleaseTimeScope(binding: ReleaseTimeBinding, check: () => ReleaseTimeStop | undefined) {
  let bound: ReleaseTimeBinding | undefined = binding, pinned = copyBinding(binding);
  let state: State = 'fresh';
  let donor: TimeValues | undefined, pending: TimeValues | undefined, upper: TimeValues | undefined;
  let transfer: object | undefined;
  let diagnostic: Readonly<{code: ReleaseTimeStop; phase: Phase}> | undefined;
  const clear = () => { donor = pending = upper = undefined; transfer = undefined; bound = pinned = undefined; };
  const stop = (phase: Phase, code: ReleaseTimeStop = 'internal_review_error') => {
    diagnostic ??= Object.freeze({code, phase}); state = 'failed'; clear();
  };
  const fail = (phase: Phase, code?: ReleaseTimeStop): never => {
    // A completed discard is terminal: a stray later call is refused without rewriting it as a failure.
    if (state === 'discarded') throw Error('internal_review_error');
    stop(phase, code); throw Error(diagnostic!.code);
  };
  const requireState = (expected: State, phase: Phase) => { if (state !== expected) fail(phase); };
  const guard = (phase: Phase, value: ReleaseTimeBinding, expected: State) => {
    let code: ReleaseTimeStop | undefined;
    try { code = check(); } catch { return fail(phase); }
    if (code !== undefined) return fail(phase, code === 'cancelled' || code === 'deadline_exceeded' ? code : 'internal_review_error');
    requireState(expected, phase);
    const pin = pinned, current = copyBinding(value);
    if (!pin || !current || value !== bound) return fail(phase);
    for (const key of keys) if (current[key] !== pin[key]) return fail(phase);
    requireState(expected, phase);
  };
  return Object.freeze({
    allocate(value: ReleaseTimeBinding) {
      requireState('fresh', 'allocate'); state = 'allocating';
      guard('allocate', value, 'allocating');
      for (const key of keys.slice(0, 6)) {
        const identity = pinned![key];
        if (!identity || (typeof identity !== 'object' && typeof identity !== 'function')) return fail('allocate');
      }
      if (!utc.safeParse(pinned!.started_at).success || !Number.isSafeInteger(pinned!.deadline_ms) || pinned!.deadline_ms <= 0 || pinned!.deadline_ms > 60000) return fail('allocate');
      guard('allocate', value, 'allocating'); state = 'allocated';
    },
    observe(value: ReleaseTimeBinding, observed: string) {
      requireState('allocated', 'observe'); state = 'observing'; guard('observe', value, 'observing');
      if (!utc.safeParse(observed).success || Date.parse(observed) < Date.parse(pinned!.started_at) ||
        Date.parse(observed) > Date.parse(pinned!.started_at) + pinned!.deadline_ms) return fail('observe');
      donor = Object.freeze({started_at: pinned!.started_at, deadline_ms: pinned!.deadline_ms, observed_at: observed, last_utc: observed});
      guard('observe', value, 'observing');
      state = 'observed';
    },
    issue(value: ReleaseTimeBinding): object {
      requireState('observed', 'issue'); state = 'issuing'; pending = donor; donor = undefined;
      guard('issue', value, 'issuing'); guard('issue', value, 'issuing');
      const handle: object = Object.freeze(Object.create(null)); transfer = handle; state = 'issued'; return handle;
    },
    accept(value: ReleaseTimeBinding, handle: object) {
      const original = transfer, time = pending; transfer = undefined; pending = undefined;
      requireState('issued', 'accept'); state = 'receiving'; guard('accept', value, 'receiving');
      if (!original || handle !== original || !time) return fail('accept');
      guard('accept', value, 'receiving'); upper = time; state = 'held';
    },
    discard(value: ReleaseTimeBinding) {
      requireState('held', 'discard'); state = 'discarding';
      guard('discard', value, 'discarding'); guard('discard', value, 'discarding'); clear(); state = 'discarded';
    },
    revoke(code: ReleaseTimeStop) {
      if (state !== 'discarded') stop('revoke', code === 'cancelled' || code === 'deadline_exceeded' ? code : 'internal_review_error');
    },
    inspect() { return Object.freeze({state, time: upper ?? null, diagnostic: diagnostic ?? null}); },
  });
}
