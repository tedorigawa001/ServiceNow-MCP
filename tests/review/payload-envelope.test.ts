import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluateBestPracticeV2 } from '../../src/review/evaluation-v2.js';
import { reviewUpdateSetPayload } from '../../src/review/payload-review.js';
import { sha256 } from '../../src/review/update-xml.js';

type Input = { name: string; payload: string } & Record<string, unknown>;
function wrap(input: Input, before: boolean): Input {
  const table = input.name.startsWith('sys_script_client_') ? 'sys_script_client' : 'sys_script';
  const condition = table === 'sys_script' ? '<filter_condition table="incident"><item field="active" operator="=" value="true"/><item field="state" operator="IN" value="1,2"/></filter_condition>' : '';
  let xml = input.payload.replace(`</${table}>`, `${condition}</${table}>`);
  const auxiliaries = '<sys_translated_text action="delete_multiple"><item><sys_id>not_the_target</sys_id><script>ignored_SENTINEL</script></item></sys_translated_text>'
    + '<sys_es_latest_script action="INSERT_OR_UPDATE"><sys_id>not_the_target</sys_id><script><![CDATA[current.update(); previous.state; fake.getXMLWait();]]></script><when>async</when></sys_es_latest_script>';
  xml = before ? xml.replace(`<${table} action=`, `${auxiliaries}<${table} action=`)
    : xml.replace('</record_update>', `${auxiliaries}</record_update>`);
  return { ...input, payload: xml };
}
function withoutEnvelopeHash(output: ReturnType<typeof reviewUpdateSetPayload>) {
  if (output.status === 'rejected') return output;
  const cloned = structuredClone(output);
  if (cloned.result.target.target_version === 'update_set_payload') cloned.result.target.payload_hash = 'envelope_hash_compared_separately';
  return cloned;
}

describe('synthetic real-shape envelope regression, separate from the frozen v0.2 benchmark', () => {
  it.each([false, true])('preserves all 72 outcomes with auxiliary records before=%s and BR condition items', before => {
    const fixture = JSON.parse(readFileSync(new URL('./evaluation/bp4-v2-cases.json', import.meta.url), 'utf8'));
    let compared = 0;
    const report = evaluateBestPracticeV2(fixture, raw => {
      const input = raw as Input;
      const original = reviewUpdateSetPayload(input);
      const wrapped = wrap(input, before);
      const actual = reviewUpdateSetPayload(wrapped);
      expect(withoutEnvelopeHash(actual)).toEqual(withoutEnvelopeHash(original));
      if (actual.status === 'reviewed' && original.status === 'reviewed'
        && actual.result.target.target_version === 'update_set_payload' && original.result.target.target_version === 'update_set_payload') {
        expect(actual.result.target.payload_hash).toBe(sha256(wrapped.payload));
        expect(actual.result.target.payload_hash).not.toBe(original.result.target.payload_hash);
        expect(actual.result.target.code_hash).toBe(original.result.target.code_hash);
      }
      expect(JSON.stringify(actual)).not.toContain('ignored_SENTINEL');
      compared++;
      // The benchmark still sees the original envelope/output; these variants are NOT rescored as v0.2.
      return original;
    });
    expect(compared).toBe(72);
    expect(report.safety.invalid_outputs).toBe(0);
  });
});
