import { afterEach, expect, it, vi } from 'vitest';
import { getTools, executeTool } from '../../src/tools/index.js';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { renderReviewToolOutcome } from '../../src/tools/best-practice.js';
import { aggregate } from '../review/fixtures/bp5-results.js';
import { aggregateReviewSchema } from '../../src/review/aggregate-schema.js';
import { bp5RuleIdSchema } from '../../src/review/result-schema-v2.js';
import { reviewUpdateSetInputSchema } from '../../src/review/update-set-adapter.js';

const name = 'review_update_set_best_practices';
it('accepts all fourteen explicit opt-ins while keeping the original default rules', () => {
  vi.stubEnv('MCP_TOOL_PACKAGE', 'full');
  const input = { update_set_sys_id: '1'.repeat(32), requested_rule_ids: [...bp5RuleIdSchema.options] };
  const validate = new AjvJsonSchemaValidator().getValidator(getTools().find(tool => tool.name === name)!.inputSchema);
  expect(validate(input).valid).toBe(true);
  expect(reviewUpdateSetInputSchema.safeParse(input).success).toBe(true);
  expect(reviewUpdateSetInputSchema.parse({ update_set_sys_id: '1'.repeat(32) }).requested_rule_ids)
    .toEqual(['AU-BR-001', 'AU-BR-002', 'AU-CL-004']);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('registers one read-only non-destructive bounded review tool in full and platform_developer only', () => {
  for (const pack of ['full', 'platform_developer']) {
    vi.stubEnv('MCP_TOOL_PACKAGE', pack);
    const matches = getTools().filter(tool => tool.name === name);
    expect(matches).toHaveLength(1);
    expect(matches[0].annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(matches[0].inputSchema).toMatchObject({ type: 'object', additionalProperties: false,
      required: ['update_set_sys_id'], properties: {
        update_set_sys_id: { type: 'string', pattern: '^[a-f0-9]{32}$' },
        max_records: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        requested_rule_ids: { type: 'array', minItems: 1, maxItems: 14, uniqueItems: true,
          items: { enum: ['AU-BR-001', 'AU-BR-002', 'AU-CL-004', 'AU-QRY-001', 'AU-BR-004', 'AU-BR-005', 'AU-BR-007', 'AU-CL-006', 'AU-CL-002', 'AU-CL-008', 'AU-CL-003', 'AU-CL-007', 'AU-CL-005', 'AU-QRY-002'] } }, instance: { type: 'string' },
      } });
  }
  vi.stubEnv('MCP_TOOL_PACKAGE', 'service_desk');
  expect(getTools().some(tool => tool.name === name)).toBe(false);
});
it('dispatches invalid input to the strict runtime guard without any network request', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const client = new ServiceNowClient({ instanceUrl: 'https://example.service-now.com', authMode: 'per-user',
    perUserBearerToken: 'synthetic-only', oauth: { clientId: '', clientSecret: '' } });
  expect(await executeTool(client, name, { update_set_sys_id: 'not-a-sys-id' }))
    .toEqual({ isError: true, error: { stage: 'input', code: 'invalid_input' } });
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  {}, { update_set_sys_id: 'Release name' }, { update_set_sys_id: 'A'.repeat(32) },
  { update_set_sys_id: '1'.repeat(32), max_records: 0 }, { update_set_sys_id: '1'.repeat(32), max_records: 101 },
  { update_set_sys_id: '1'.repeat(32), max_records: 1.5 }, { update_set_sys_id: '1'.repeat(32), max_records: '20' },
  { update_set_sys_id: '1'.repeat(32), requested_rule_ids: [] },
  { update_set_sys_id: '1'.repeat(32), requested_rule_ids: ['AU-SI-002'] },
  { update_set_sys_id: '1'.repeat(32), requested_rule_ids: ['AU-BR-001', 'AU-BR-001'] },
  ...['release', 'query', 'fields', 'payload', 'actor', 'workerFactory', 'limits', 'reviewReleaseConfig', 'code_return_mode']
    .map(key => ({ update_set_sys_id: '1'.repeat(32), [key]: 'forbidden' })),
])('rejects invalid input in both advertised JSON Schema and runtime: %j', async input => {
  vi.stubEnv('MCP_TOOL_PACKAGE', 'full');
  const definition = getTools().find(tool => tool.name === name)!;
  const validate = new AjvJsonSchemaValidator().getValidator(definition.inputSchema);
  expect(validate(input).valid).toBe(false);
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const client = new ServiceNowClient({ instanceUrl: 'https://example.service-now.com', authMode: 'per-user',
    perUserBearerToken: 'synthetic-only', oauth: { clientId: '', clientSecret: '' } });
  expect(await executeTool(client, name, input)).toEqual({ isError: true, error: { stage: 'input', code: 'invalid_input' } });
  expect(fetcher).not.toHaveBeenCalled();
});
it('advertises optional defaults and accepts the instance selector without treating it as adapter input', () => {
  vi.stubEnv('MCP_TOOL_PACKAGE', 'full');
  const validate = new AjvJsonSchemaValidator().getValidator(getTools().find(tool => tool.name === name)!.inputSchema);
  expect(validate({ update_set_sys_id: '1'.repeat(32) }).valid).toBe(true);
  expect(validate({ update_set_sys_id: '1'.repeat(32), requested_rule_ids: ['AU-QRY-001'], selection_mode: 'review_targets' }).valid).toBe(true);
  expect(validate({ update_set_sys_id: '1'.repeat(32), requested_rule_ids: ['AU-BR-004'], selection_mode: 'review_targets' }).valid).toBe(true);
  expect(validate({ update_set_sys_id: '1'.repeat(32), requested_rule_ids: ['AU-BR-005'], selection_mode: 'review_targets' }).valid).toBe(true);
  expect(validate({ update_set_sys_id: '1'.repeat(32), requested_rule_ids: ['AU-BR-007'], selection_mode: 'review_targets' }).valid).toBe(true);
  expect(validate({ update_set_sys_id: '1'.repeat(32), requested_rule_ids: ['AU-CL-006'], selection_mode: 'review_targets' }).valid).toBe(true);
  expect(validate({ update_set_sys_id: '1'.repeat(32), requested_rule_ids: ['AU-CL-002'], selection_mode: 'review_targets' }).valid).toBe(true);
  expect(validate({ update_set_sys_id: '1'.repeat(32), requested_rule_ids: ['AU-CL-008'], selection_mode: 'review_targets' }).valid).toBe(true);
  expect(validate({ update_set_sys_id: '1'.repeat(32), requested_rule_ids: ['AU-CL-003'], selection_mode: 'review_targets' }).valid).toBe(true);
  expect(validate({ update_set_sys_id: '1'.repeat(32), max_records: 100, requested_rule_ids: ['AU-CL-004'], instance: 'red' }).valid).toBe(true);
  expect(validate({ update_set_sys_id: '1'.repeat(32), instance: 42 }).valid).toBe(false);
});
it('bounds the complete MCP result including escaped JSON text, not just the raw aggregate', () => {
  const value = aggregate(); value.limitations = [...value.limitations, ...Array.from({ length: 40 }, () => '"'.repeat(1800))];
  const result = aggregateReviewSchema.parse(value);
  expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(262144);
  expect(Buffer.byteLength(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(result) }] }))).toBeGreaterThan(262144);
  const response = renderReviewToolOutcome({ isError: false, result });
  expect(response.isError).toBe(true);
  expect(JSON.parse(response.content[0].text)).toEqual({ status: 'failed', error: { stage: 'output', code: 'response_limit' } });
  expect(Buffer.byteLength(JSON.stringify(response))).toBeLessThan(262144);
});
it.each(['worker_unavailable', 'deadline_exceeded', 'cancelled', 'internal_review_error'] as const)
  ('preserves the MCP error flag and fixed code for %s', code => {
    const response = renderReviewToolOutcome({ isError: true, error: { stage: 'analysis', code } });
    expect(response.isError).toBe(true);
    expect(JSON.parse(response.content[0].text)).toEqual({ status: 'failed', error: { stage: 'analysis', code } });
  });
