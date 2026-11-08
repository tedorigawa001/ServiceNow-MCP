/** Independent semantic trace; does not import kernel limits, source operations or counters. */
export function declaredActualOracle(events: readonly string[], declared: number) {
  const c = { open: 0, observe: 0, read: 0, retry: 0, received: 0, init: 0, update: 0, hashed: 0,
    final: 0, close: 0, accepted: 0, updateReservations: 0, updateReleased: 0, updateReserved: 0, guards: 2 };
  let position = 0, interrupted = false;
  for (const event of events) {
    c.guards += 2;
    if (event === 'open') c.open++;
    else if (event === 'before' || event === 'after') c.observe++;
    else if (event === 'init') c.init++;
    else if (event === 'final') c.final++;
    else if (event === 'close') c.close++;
    else if (event === 'accept') c.accepted++;
    else {
      c.read++;
      if (interrupted) c.retry++;
      interrupted = event === 'interrupt';
      if (position < declared) {
        c.updateReservations++;
        if (!event.startsWith('bytes:')) c.updateReleased++;
      }
      if (event.startsWith('bytes:') || event.startsWith('extra:')) {
        const n = Number(event.split(':')[1]); c.received += n;
        if (event.startsWith('bytes:')) { c.update++; c.hashed += n; position += n; }
      }
    }
  }
  if (c.open && !c.close) { c.close++; c.guards += 2; }
  return Object.freeze({ counts: Object.freeze(c), position, hashedPrefixBytes: position });
}
