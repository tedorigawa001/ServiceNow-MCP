import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeNotificationToolCall } from '../../src/tools/notification.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  updateRecord: vi.fn(),
} as unknown as ServiceNowClient;

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
