/** Test-only independent event accounting; does not import product types/functions. */
export type ReservationEvent = { kind: 'admit' } | { kind: 'dispatch'; lane: 'oauth' | 'ordinary' | 'initial' | 'final'; slot?: number }
  | { kind: 'release'; slot: number } | { kind: 'final' } | { kind: 'stop' };
export function reservationOracle(consumed: number, limit: number, events: readonly ReservationEvent[]) {
  let requests = consumed, phase = 'normal', tables = 0;
  const slots = [{ remaining: 2, attempts: 0 }, { remaining: 2, attempts: 0 }];
  const sum = () => slots.map(s => s.remaining).reduce((a, b) => a + b, 0);
  for (const e of events) {
    if (e.kind === 'admit') {
      if (phase !== 'normal' || tables >= 8 || requests + sum() + 4 > limit) throw Error('oracle admission');
      slots.push({ remaining: 2, attempts: 0 }); tables++;
    } else if (e.kind === 'dispatch') {
      if (e.lane === 'final') {
        const s = e.slot === undefined ? undefined : slots[e.slot];
        if (phase !== 'final' || !s || s.remaining <= 0 || s.attempts >= 2) throw Error('oracle final');
        s.remaining--; s.attempts++;
      } else if (phase !== 'normal' || requests + sum() + 1 > limit) throw Error('oracle ordinary');
      requests++;
    } else if (e.kind === 'release') slots[e.slot].remaining = 0;
    else if (e.kind === 'final') phase = 'final';
    else { phase = 'stopped'; for (const s of slots) s.remaining = 0; }
    if (requests + sum() > limit || requests > limit || slots.some(s => s.remaining < 0 || s.remaining > 2))
      throw Error('oracle invariant');
  }
  return { requests, reserved: sum(), tables, phase, slots };
}
