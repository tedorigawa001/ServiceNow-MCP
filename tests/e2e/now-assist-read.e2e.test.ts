import { it, expect } from 'vitest';
import { e2eDescribe, getE2EClient, skipUnlessTables } from './helpers.js';
import { executeNowAssistToolCall } from '../../src/tools/now-assist.js';

const raw = (v: unknown): string => String(v && typeof v === 'object' && 'value' in v ? v.value : v ?? '');

// Only table-backed reads. Do not invoke AI skills, generate content, or trigger playbooks.
e2eDescribe('E2E – Now Assist metadata only', () => {
  for (const [tool, table, key] of [
    ['get_virtual_agent_topics', 'sys_cs_topic', 'topics'],
    ['get_pi_models', 'ml_solution', 'models'],
  ]) {
    it(`${tool} returns active metadata without invoking AI`, async ctx => {
      ctx.skip(process.env.NOW_ASSIST_ENABLED !== 'true', 'NOW_ASSIST_ENABLED is not true');
      const client = getE2EClient();
      await skipUnlessTables(ctx, client, table);
      const result = await executeNowAssistToolCall(client, tool, { limit: 3 });
      expect(Array.isArray(result[key])).toBe(true);
      expect(result[key].length).toBeLessThanOrEqual(tool === 'get_pi_models' ? 20 : 3);
      expect(result.count).toBeGreaterThanOrEqual(result[key].length);
      expect(result[key].every((r: { active: unknown }) => raw(r.active) === 'true')).toBe(true);
      expect(result[key].every((r: { sys_id: unknown }) => /^[a-f0-9]{32}$/i.test(raw(r.sys_id)))).toBe(true);
    });
  }
});
