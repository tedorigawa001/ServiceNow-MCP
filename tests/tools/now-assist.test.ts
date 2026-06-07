import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeNowAssistToolCall, getNowAssistToolDefinitions } from '../../src/tools/now-assist.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  callNowAssist: vi.fn(),
  queryRecords: vi.fn(),
} as unknown as ServiceNowClient;

describe('getNowAssistToolDefinitions', () => {
  it('returns definitions for all Now Assist tools', () => {
    expect(getNowAssistToolDefinitions().length).toBeGreaterThanOrEqual(8);
  });
});

describe('executeNowAssistToolCall – permission guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NOW_ASSIST_ENABLED;
  });

  it('throws for every tool when NOW_ASSIST_ENABLED is not set', async () => {
    await expect(
      executeNowAssistToolCall(mockClient, 'nlq_query', { question: 'How many P1 incidents?' })
    ).rejects.toThrow('Now Assist / AI features are disabled');
  });

  it('throws even for read tools when NOW_ASSIST_ENABLED=false', async () => {
    process.env.NOW_ASSIST_ENABLED = 'false';
    await expect(
      executeNowAssistToolCall(mockClient, 'get_virtual_agent_topics', {})
    ).rejects.toThrow();
  });
});

describe('executeNowAssistToolCall – nlq_query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NOW_ASSIST_ENABLED = 'true';
  });

  it('throws when question is missing', async () => {
    await expect(
      executeNowAssistToolCall(mockClient, 'nlq_query', {})
    ).rejects.toThrow('question is required');
  });

  it('calls NLQ API and returns result', async () => {
    (mockClient.callNowAssist as ReturnType<typeof vi.fn>).mockResolvedValue({ results: [{ count: 42 }] });
    const result = await executeNowAssistToolCall(mockClient, 'nlq_query', {
      question: 'How many P1 incidents were opened this week?',
    });
    expect(result.question).toBe('How many P1 incidents were opened this week?');
    expect(mockClient.callNowAssist).toHaveBeenCalledWith(
      '/api/sn_nl_text_to_value/text_query',
      expect.objectContaining({ question: 'How many P1 incidents were opened this week?' })
    );
  });
});

describe('executeNowAssistToolCall – ai_search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NOW_ASSIST_ENABLED = 'true';
  });

  it('throws when query is missing', async () => {
    await expect(
      executeNowAssistToolCall(mockClient, 'ai_search', {})
    ).rejects.toThrow('query is required');
  });

  it('calls AI Search API', async () => {
    (mockClient.callNowAssist as ReturnType<typeof vi.fn>).mockResolvedValue({ results: [] });
    const result = await executeNowAssistToolCall(mockClient, 'ai_search', { query: 'VPN issue' });
    expect(result.query).toBe('VPN issue');
    const apiPath = (mockClient.callNowAssist as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(apiPath).toContain('/api/now/ai_search/search');
    expect(apiPath).toContain('VPN');
  });
});

describe('executeNowAssistToolCall – generate_summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NOW_ASSIST_ENABLED = 'true';
  });

  it('throws when table or sys_id is missing', async () => {
    await expect(
      executeNowAssistToolCall(mockClient, 'generate_summary', { table: 'incident' })
    ).rejects.toThrow('table and sys_id are required');
  });

  it('invokes summarize skill', async () => {
    (mockClient.callNowAssist as ReturnType<typeof vi.fn>).mockResolvedValue({
      output: { summary: 'The incident involves a network outage.' },
    });
    const result = await executeNowAssistToolCall(mockClient, 'generate_summary', {
      table: 'incident',
      sys_id: 'inc001',
    });
    expect(result.summary).toBe('The incident involves a network outage.');
    expect(mockClient.callNowAssist).toHaveBeenCalledWith(
      '/api/sn_assist/skill/invoke',
      expect.objectContaining({ skill: 'summarize' })
    );
  });
});

describe('executeNowAssistToolCall – suggest_resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NOW_ASSIST_ENABLED = 'true';
  });

  it('throws when incident_sys_id is missing', async () => {
    await expect(
      executeNowAssistToolCall(mockClient, 'suggest_resolution', {})
    ).rejects.toThrow('incident_sys_id is required');
  });

  it('calls resolution_suggestion skill', async () => {
    (mockClient.callNowAssist as ReturnType<typeof vi.fn>).mockResolvedValue({ output: { suggestion: 'Restart the service' } });
    const result = await executeNowAssistToolCall(mockClient, 'suggest_resolution', { incident_sys_id: 'inc999' });
    expect(result.incident_sys_id).toBe('inc999');
    expect(mockClient.callNowAssist).toHaveBeenCalledWith(
      '/api/sn_assist/skill/invoke',
      expect.objectContaining({ skill: 'resolution_suggestion' })
    );
  });
});

describe('executeNowAssistToolCall – categorize_incident', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NOW_ASSIST_ENABLED = 'true';
  });

  it('throws when short_description is missing', async () => {
    await expect(
      executeNowAssistToolCall(mockClient, 'categorize_incident', {})
    ).rejects.toThrow('short_description is required');
  });

  it('returns no-model message when PI solution is not found', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    const result = await executeNowAssistToolCall(mockClient, 'categorize_incident', {
      short_description: 'Cannot connect to email',
    });
    expect(result.message).toContain('No active Predictive Intelligence solution');
  });

  it('calls PI predict API when solution exists', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{ sys_id: 'sol123' }] });
    (mockClient.callNowAssist as ReturnType<typeof vi.fn>).mockResolvedValue({ prediction: { category: 'Network' } });
    const result = await executeNowAssistToolCall(mockClient, 'categorize_incident', {
      short_description: 'VPN is down',
    });
    expect(result.short_description).toBe('VPN is down');
    expect(result.algorithm_note).toContain('LightGBM');
    expect(mockClient.callNowAssist).toHaveBeenCalledWith(
      '/api/sn_ml/solution/sol123/predict',
      expect.objectContaining({ short_description: 'VPN is down' })
    );
  });
});

describe('executeNowAssistToolCall – trigger_agentic_playbook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NOW_ASSIST_ENABLED = 'true';
  });

  it('throws when playbook_sys_id is missing', async () => {
    await expect(
      executeNowAssistToolCall(mockClient, 'trigger_agentic_playbook', {})
    ).rejects.toThrow('playbook_sys_id is required');
  });

  it('triggers playbook with context', async () => {
    (mockClient.callNowAssist as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'triggered' });
    const result = await executeNowAssistToolCall(mockClient, 'trigger_agentic_playbook', {
      playbook_sys_id: 'pb001',
      context: { incident_id: 'INC0001' },
    });
    expect(result).toBeTruthy();
    expect(mockClient.callNowAssist).toHaveBeenCalledWith(
      '/api/sn_assist/playbook/trigger',
      expect.objectContaining({ playbook_sys_id: 'pb001' })
    );
  });
});

describe('executeNowAssistToolCall – get_pi_models', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NOW_ASSIST_ENABLED = 'true';
  });

  it('queries ml_solution table', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2, records: [{}, {}] });
    const result = await executeNowAssistToolCall(mockClient, 'get_pi_models', {});
    expect(result.count).toBe(2);
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'ml_solution' }));
  });
});
