/** Independent test-only byte accounting. No product imports or returned cost/stat reuse. */
export type StreamEvent = { kind: 'dispatch'; evidence: boolean } | { kind: 'chunk'; bytes: number }
  | { kind: 'eof' } | { kind: 'cancel' } | { kind: 'reader_cancel' };
export function streamOracle(events: readonly StreamEvent[]) {
  let requests = 0, global = 0, evidence = 0, response = 0, evidenceLane = false, stopped = false, cancels = 0;
  for (const event of events) {
    if (event.kind === 'dispatch') { if (stopped) throw Error('oracle dispatch after cancel'); requests++; response = 0; evidenceLane = event.evidence; }
    else if (event.kind === 'chunk' && !stopped) { global += event.bytes; response += event.bytes; if (evidenceLane) evidence += event.bytes; }
    else if (event.kind === 'cancel') stopped = true;
    else if (event.kind === 'reader_cancel') cancels++;
  }
  return { requests, global_bytes: global, evidence_bytes: evidence, response_bytes: response, cancel_calls: cancels };
}
