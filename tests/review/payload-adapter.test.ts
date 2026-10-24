import { describe, expect, it } from 'vitest';
import { reviewUpdateSetPayloadV2 } from '../../src/review/payload-review.js';
import { reviewResultV2Schema } from '../../src/review/result-schema-v2.js';

const id = '1'.repeat(32);
const at = '2026-10-18T00:00:00Z';
const binding = 'b'.repeat(64);
export const payloadInput = () => ({ update_set_id: 'a'.repeat(32), update_xml_sys_id: '2'.repeat(32),
  name: `sys_script_${id}`, payload: `<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><sys_scope>global</sys_scope><when>async_always</when><script><![CDATA[/* SYNTHETIC_PRIVATE_BODY */ current.update();]]></script></sys_script></record_update>`,
  retrieved_at: at, record_updated_at: at, instance_binding: binding,
  instance_release: { source: 'operator_config', resolution_status: 'asserted', family: 'Australia',
    visibility_scope: 'operator_configured', instance_binding: binding, config_version: 'c'.repeat(64),
    asserted_at: '2026-10-17T00:00:00Z', expires_at: '2026-10-19T00:00:00Z' },
  release_limitations: ['release_operator_asserted', 'release_not_observed', 'release_config_may_be_stale', 'release_observation_unavailable'],
  requested_rule_ids: ['AU-BR-001', 'AU-BR-002'] });

describe('BP-5 single payload adapter', () => {
  it.each(['expired', 'wrong_binding', 'missing_warning', 'duplicate_rule', 'untrusted_warning', 'unsupported_rule'])('rejects %s contract input without echoing it', kind => {
    const input = payloadInput();
    if (kind === 'expired') input.instance_release.expires_at = '2026-10-17T00:00:00Z';
    if (kind === 'wrong_binding') input.instance_binding = 'f'.repeat(64);
    if (kind === 'missing_warning') input.release_limitations = [];
    if (kind === 'duplicate_rule') input.requested_rule_ids = ['AU-BR-001', 'AU-BR-001'];
    if (kind === 'untrusted_warning') input.release_limitations.push('SYNTHETIC_PRIVATE_BODY');
    if (kind === 'unsupported_rule') input.requested_rule_ids = ['AU-QRY-002'];
    expect(reviewUpdateSetPayloadV2(input)).toEqual({ poc_only: true, status: 'rejected', reason: 'invalid_input' });
  });
  it('keeps mismatched configured releases unevaluated without promoting their evidence', () => {
    const input = payloadInput(); input.instance_release.family = 'Zurich';
    const outcome = reviewUpdateSetPayloadV2(input);
    expect(outcome.status).toBe('reviewed');
    if (outcome.status === 'reviewed') {
      expect(outcome.result.release_match).toBe('mismatched');
      expect(outcome.result.findings).toEqual([]);
      expect(outcome.result.coverage.skipped_rules).toHaveLength(2);
      expect(reviewResultV2Schema.safeParse(outcome.result).success).toBe(true);
    }
  });
  it('runs the existing detector with asserted evidence without inventing an observation', () => {
    const input = payloadInput();
    const outcome = reviewUpdateSetPayloadV2(input);
    expect(outcome.status).toBe('reviewed');
    if (outcome.status !== 'reviewed') throw Error('Expected candidate');
    expect(reviewResultV2Schema.safeParse(outcome.result).success).toBe(true);
    expect(outcome.result.instance_release).toEqual(input.instance_release);
    expect(outcome.result.review_status).toBe('partial');
    expect(outcome.result.findings.map(f => f.rule_id)).toEqual(['AU-BR-001']);
    expect(JSON.stringify(outcome)).not.toContain('SYNTHETIC_PRIVATE_BODY');
    expect(outcome.result.limitations).not.toContain('release_evidence_caller_supplied');
  });
});
