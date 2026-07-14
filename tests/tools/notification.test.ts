import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeNotificationToolCall, getNotificationToolDefinitions } from '../../src/tools/notification.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
  uploadAttachment: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const gr = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const cr = () => mockClient.createRecord as ReturnType<typeof vi.fn>;
const dr = () => mockClient.deleteRecord as ReturnType<typeof vi.fn>;
const ua = () => mockClient.uploadAttachment as ReturnType<typeof vi.fn>;

describe('getNotificationToolDefinitions', () => {
  it('returns exactly 14 notification tool definitions', () => {
    expect(getNotificationToolDefinitions().length).toBe(14);
  });

  it('all tools have name, description and inputSchema', () => {
    getNotificationToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeNotificationToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeNotificationToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('get_notification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires sys_id_or_name', async () => {
    await expect(executeNotificationToolCall(mockClient, 'get_notification', {})).rejects.toThrow('sys_id_or_name is required');
  });

  it('fetches directly by sys_id when hex', async () => {
    gr().mockResolvedValue({ sys_id: 'a'.repeat(32), name: 'Incident Assigned' });
    const result = await executeNotificationToolCall(mockClient, 'get_notification', { sys_id_or_name: 'a'.repeat(32) });
    expect(gr()).toHaveBeenCalledWith('sysevent_email_action', 'a'.repeat(32));
    expect(result.name).toBe('Incident Assigned');
  });

  it('resolves by name and throws NOT_FOUND when missing', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executeNotificationToolCall(mockClient, 'get_notification', { sys_id_or_name: 'Nope' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('create_notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeNotificationToolCall(mockClient, 'create_notification', { name: 'X', table: 'incident' }))
      .rejects.toThrow('Write operations are disabled');
  });

  it('requires name and table', async () => {
    await expect(executeNotificationToolCall(mockClient, 'create_notification', {})).rejects.toThrow('name and table are required');
  });

  it('creates the notification', async () => {
    cr().mockResolvedValue({ sys_id: 'n1' });
    const result = await executeNotificationToolCall(mockClient, 'create_notification', { name: 'Alert', table: 'incident', event: 'incident.commented' });
    expect(cr()).toHaveBeenCalledWith('sysevent_email_action', expect.objectContaining({ name: 'Alert', collection: 'incident', event_name: 'incident.commented' }));
    expect(result.summary).toContain('Alert');
  });
});

describe('get_email_log', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires sys_id', async () => {
    await expect(executeNotificationToolCall(mockClient, 'get_email_log', {})).rejects.toThrow('sys_id is required');
  });

  it('delegates to getRecord', async () => {
    gr().mockResolvedValue({ sys_id: 'e1', subject: 'Test' });
    const result = await executeNotificationToolCall(mockClient, 'get_email_log', { sys_id: 'e1' });
    expect(gr()).toHaveBeenCalledWith('sys_email', 'e1');
    expect(result.subject).toBe('Test');
  });
});

describe('Attachments', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('list_attachments', () => {
    it('requires table and record_sys_id', async () => {
      await expect(executeNotificationToolCall(mockClient, 'list_attachments', {})).rejects.toThrow('table and record_sys_id are required');
    });

    it('queries sys_attachment by table and record', async () => {
      qr().mockResolvedValue({ count: 0, records: [] });
      await executeNotificationToolCall(mockClient, 'list_attachments', { table: 'incident', record_sys_id: 'r1' });
      expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_attachment', query: 'table_name=incident^table_sys_id=r1' }));
    });
  });

  describe('get_attachment_metadata', () => {
    it('requires attachment_sys_id', async () => {
      await expect(executeNotificationToolCall(mockClient, 'get_attachment_metadata', {})).rejects.toThrow('attachment_sys_id is required');
    });

    it('delegates to getRecord', async () => {
      gr().mockResolvedValue({ sys_id: 'att1', file_name: 'screenshot.png' });
      const result = await executeNotificationToolCall(mockClient, 'get_attachment_metadata', { attachment_sys_id: 'att1' });
      expect(gr()).toHaveBeenCalledWith('sys_attachment', 'att1');
      expect(result.file_name).toBe('screenshot.png');
    });
  });

  describe('delete_attachment', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('is blocked without WRITE_ENABLED', async () => {
      delete process.env.WRITE_ENABLED;
      await expect(executeNotificationToolCall(mockClient, 'delete_attachment', { attachment_sys_id: 'att1' })).rejects.toThrow('Write operations are disabled');
    });

    it('requires attachment_sys_id', async () => {
      await expect(executeNotificationToolCall(mockClient, 'delete_attachment', {})).rejects.toThrow('attachment_sys_id is required');
    });

    it('deletes the attachment', async () => {
      dr().mockResolvedValue(undefined);
      const result = await executeNotificationToolCall(mockClient, 'delete_attachment', { attachment_sys_id: 'att1' });
      expect(dr()).toHaveBeenCalledWith('sys_attachment', 'att1');
      expect(result.success).toBe(true);
    });
  });

  describe('upload_attachment', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('is blocked without WRITE_ENABLED', async () => {
      delete process.env.WRITE_ENABLED;
      await expect(executeNotificationToolCall(mockClient, 'upload_attachment', {
        table: 'incident', record_sys_id: 'r1', file_name: 'x.png', content_type: 'image/png', content_base64: 'YQ==',
      })).rejects.toThrow('Write operations are disabled');
    });

    it('requires all fields', async () => {
      await expect(executeNotificationToolCall(mockClient, 'upload_attachment', {})).rejects.toThrow(
        'table, record_sys_id, file_name, content_type, and content_base64 are required'
      );
    });

    it('uploads the attachment', async () => {
      ua().mockResolvedValue({ sys_id: 'att1' });
      const result = await executeNotificationToolCall(mockClient, 'upload_attachment', {
        table: 'incident', record_sys_id: 'r1', file_name: 'screenshot.png', content_type: 'image/png', content_base64: 'YQ==',
      });
      expect(ua()).toHaveBeenCalledWith('incident', 'r1', 'screenshot.png', 'image/png', 'YQ==');
      expect(result.summary).toContain('screenshot.png');
    });
  });
});

describe('list_email_templates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('searches by name and strips ^ from the query', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeNotificationToolCall(mockClient, 'list_email_templates', { query: 'welcome^ORactive=false' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sysevent_email_template', query: 'nameCONTAINSwelcomeORactive=false' }));
  });
});

describe('list_notification_subscriptions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('combines user_sys_id and notification_sys_id filters', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeNotificationToolCall(mockClient, 'list_notification_subscriptions', { user_sys_id: 'u1', notification_sys_id: 'n1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_notif_subscription', query: 'user=u1^notification=n1' }));
  });
});

describe('send_emergency_broadcast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeNotificationToolCall(mockClient, 'send_emergency_broadcast', { subject: 'X', body: 'Y', recipients: 'u1' }))
      .rejects.toThrow('Write operations are disabled');
  });

  it('requires subject, body, and recipients', async () => {
    await expect(executeNotificationToolCall(mockClient, 'send_emergency_broadcast', {})).rejects.toThrow(
      'subject, body, and recipients are required'
    );
  });

  it('sends the broadcast at high importance', async () => {
    cr().mockResolvedValue({ sys_id: 'b1' });
    const result = await executeNotificationToolCall(mockClient, 'send_emergency_broadcast', { subject: 'Outage', body: 'Systems down', recipients: 'g1' });
    expect(cr()).toHaveBeenCalledWith('sys_email', expect.objectContaining({ subject: 'Outage', recipients: 'g1', importance: 'high' }));
    expect(result.summary).toContain('Outage');
  });
});

describe('schedule_notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeNotificationToolCall(mockClient, 'schedule_notification', { notification_id: 'n1', schedule: '0 9 * * *' }))
      .rejects.toThrow('Write operations are disabled');
  });

  it('requires notification_id and schedule', async () => {
    await expect(executeNotificationToolCall(mockClient, 'schedule_notification', {})).rejects.toThrow(
      'notification_id and schedule are required'
    );
  });

  it('schedules the notification', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'n1' });
    const result = await executeNotificationToolCall(mockClient, 'schedule_notification', { notification_id: 'n1', schedule: '0 9 * * *' });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sysevent_email_action', 'n1', { schedule: '0 9 * * *', active: 'true' });
    expect(result.summary).toContain('n1');
  });
});

describe('executeNotificationToolCall – scoped filters and updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('does not allow notification filters to append encoded-query clauses', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await executeNotificationToolCall(mockClient, 'list_notifications', {
      table: 'incident^ORactive=false', query: 'Alert^ORsys_idISNOTEMPTY',
    });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
      query: 'collection=incidentORactive=false^nameCONTAINSAlertORsys_idISNOTEMPTY',
    }));
  });

  it('does not allow email log filters to append encoded-query clauses', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await executeNotificationToolCall(mockClient, 'list_email_logs', { recipient: 'user@example.com^ORstate=sent' });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
      query: 'receiverCONTAINSuser@example.comORstate=sent',
    }));
  });

  it('allows documented notification fields', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'notif1' });
    await executeNotificationToolCall(mockClient, 'update_notification', {
      sys_id: 'notif1', fields: { subject: 'Maintenance', active: false },
    });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sysevent_email_action', 'notif1', {
      subject: 'Maintenance', active: false,
    });
  });

  it('rejects undeclared notification fields before they reach the Table API', async () => {
    await expect(executeNotificationToolCall(mockClient, 'update_notification', {
      sys_id: 'notif1', fields: { sys_domain: 'global', u_unlisted: 'yes' },
    })).rejects.toThrow('Notification fields cannot be updated: sys_domain, u_unlisted');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});
