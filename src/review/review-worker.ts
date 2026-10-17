/** Trusted worker entry: parses text as data; never executes reviewed JavaScript. */
import { parentPort } from 'node:worker_threads';
import { reviewUpdateSetPayloadV2 } from './payload-review.js';
import { assetOutcomeStructure } from './aggregate-schema.js';
import { finalizeAggregate } from './aggregate-finalize.js';
import type { AggregateReview } from './aggregate-schema.js';

if (!parentPort) throw new Error('internal_review_error');
parentPort.on('message', (message: { id: number; kind: string; input: unknown }) => {
  try {
    let value: unknown;
    if (message.kind === 'analyze') {
      const outcome = reviewUpdateSetPayloadV2(message.input);
      const input = message.input as { update_xml_sys_id: string; requested_rule_ids: string[] };
      const asset = assetOutcomeStructure.parse(outcome.status === 'reviewed'
        ? { state: 'reviewed', update_xml_sys_id: input.update_xml_sys_id, applicable_rule_ids: input.requested_rule_ids, result: outcome.result }
        : { state: 'rejected', update_xml_sys_id: input.update_xml_sys_id, reason: outcome.reason });
      value = Buffer.byteLength(JSON.stringify(asset)) > 262144 - 256
        ? { state: 'result_omitted', update_xml_sys_id: input.update_xml_sys_id, reason: 'response_limit' } : asset;
    } else if (message.kind === 'finish') value = finalizeAggregate(message.input as AggregateReview);
    else throw new Error('internal_review_error');
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json) > 262144) throw new Error('internal_review_error');
    parentPort!.postMessage({ id: message.id, ok: true, json });
  } catch {
    // Never transmit raw exceptions, source text, stack traces or parser diagnostics.
    parentPort!.postMessage({ id: message.id, ok: false });
  }
});
