import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeSecurityToolCall } from '../../src/tools/security.js';

const mockClient: any = {
  createRecord: vi.fn(),
  getRecord: vi.fn(),
  updateRecord: vi.fn(),
  queryRecords: vi.fn(),
  runAggregateQuery: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WRITE_ENABLED;
});

describe('Security Operations tools', () => {
  describe('create_security_incident', () => {
    it('throws when write is disabled', async () => {
      await expect(
        executeSecurityToolCall(mockClient, 'create_security_incident', {
          short_description: 'Ransomware detected',
          category: 'Malware',
        })
      ).rejects.toThrow('Write operations are disabled');
    });

    it('creates security incident when write enabled', async () => {
      process.env.WRITE_ENABLED = 'true';
      mockClient.createRecord.mockResolvedValue({ sys_id: 'sec001', number: 'SIR0001' });
      const result = await executeSecurityToolCall(mockClient, 'create_security_incident', {
        short_description: 'Ransomware detected on server',
        category: 'Malware',
        severity: 1,
      });
      expect(result.number).toBe('SIR0001');
      expect(mockClient.createRecord).toHaveBeenCalledWith('sn_si_incident', expect.objectContaining({
        category: 'Malware',
      }));
    });

    it('rejects undeclared fields before they reach the Table API', async () => {
      process.env.WRITE_ENABLED = 'true';
      await expect(executeSecurityToolCall(mockClient, 'create_security_incident', {
        short_description: 'Ransomware detected', category: 'Malware', sys_domain: 'global', u_unlisted: 'yes',
      })).rejects.toThrow('Security incident fields cannot be set: sys_domain, u_unlisted');
      expect(mockClient.createRecord).not.toHaveBeenCalled();
    });
  });

  describe('update_security_incident', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });

    it('allows documented incident lifecycle fields', async () => {
      mockClient.updateRecord.mockResolvedValue({ sys_id: 'sec001' });
      await executeSecurityToolCall(mockClient, 'update_security_incident', {
        sys_id: 'sec001', fields: { state: 'contain', containment_status: 'isolated', severity: 1 },
      });
      expect(mockClient.updateRecord).toHaveBeenCalledWith('sn_si_incident', 'sec001', {
        state: 'contain', containment_status: 'isolated', severity: 1,
      });
    });

    it('rejects undeclared update fields before they reach the Table API', async () => {
      await expect(executeSecurityToolCall(mockClient, 'update_security_incident', {
        sys_id: 'sec001', fields: { sys_domain: 'global', u_unlisted: 'yes' },
      })).rejects.toThrow('Security incident fields cannot be updated: sys_domain, u_unlisted');
      expect(mockClient.updateRecord).not.toHaveBeenCalled();
    });
  });

  describe('list_security_incidents', () => {
    it('lists all with no filter', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 3, records: [] });
      await executeSecurityToolCall(mockClient, 'list_security_incidents', {});
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
        table: 'sn_si_incident',
      }));
    });

    it('applies severity filter', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 1, records: [] });
      await executeSecurityToolCall(mockClient, 'list_security_incidents', { severity: 1 });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
        query: 'severity=1',
      }));
    });
  });

  describe('list_vulnerabilities', () => {
    it('lists vulnerabilities with state filter', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 5, records: [] });
      await executeSecurityToolCall(mockClient, 'list_vulnerabilities', { state: 'open', severity: 'critical' });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
        table: 'sn_vul_entry',
        query: 'state=open^severity=critical',
      }));
    });

    it('does not allow filter values to append encoded-query clauses', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 0, records: [] });
      await executeSecurityToolCall(mockClient, 'list_vulnerabilities', {
        state: 'open^ORseverity=critical', ci_sysid: 'ci1^ORsys_idISNOTEMPTY',
      });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
        query: 'state=openORseverity=critical^cmdb_ci=ci1ORsys_idISNOTEMPTY',
      }));
    });
  });

  describe('update_vulnerability', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });

    it('allows documented vulnerability remediation fields', async () => {
      mockClient.updateRecord.mockResolvedValue({ sys_id: 'vuln001' });
      await executeSecurityToolCall(mockClient, 'update_vulnerability', {
        sys_id: 'vuln001',
        fields: { state: 'risk_accepted', risk_acceptance_notes: 'Approved by CISO', remediation_date: '2026-08-01' },
      });
      expect(mockClient.updateRecord).toHaveBeenCalledWith('sn_vul_entry', 'vuln001', {
        state: 'risk_accepted', risk_acceptance_notes: 'Approved by CISO', remediation_date: '2026-08-01',
      });
    });

    it('rejects undeclared vulnerability fields before they reach the Table API', async () => {
      await expect(executeSecurityToolCall(mockClient, 'update_vulnerability', {
        sys_id: 'vuln001', fields: { sys_domain: 'global', u_unlisted: 'yes' },
      })).rejects.toThrow('Vulnerability fields cannot be updated: sys_domain, u_unlisted');
      expect(mockClient.updateRecord).not.toHaveBeenCalled();
    });
  });

  describe('get_threat_intelligence', () => {
    it('throws when query is missing', async () => {
      await expect(
        executeSecurityToolCall(mockClient, 'get_threat_intelligence', {})
      ).rejects.toThrow('query is required');
    });

    it('searches threat intel by value', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 1, records: [{ value: '192.168.1.1' }] });
      await executeSecurityToolCall(mockClient, 'get_threat_intelligence', { query: '192.168.1.1' });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
        table: 'sn_ti_observable',
        query: 'valueCONTAINS192.168.1.1',
      }));
    });

    it('applies type filter when provided', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 0, records: [] });
      await executeSecurityToolCall(mockClient, 'get_threat_intelligence', { query: '1.2.3.4', type: 'ip_address' });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
        query: 'type=ip_address^valueCONTAINS1.2.3.4',
      }));
    });

    it('does not allow IOC terms or types to append encoded-query clauses', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 0, records: [] });
      await executeSecurityToolCall(mockClient, 'get_threat_intelligence', {
        type: 'ip_address^ORtype=domain', query: '1.2.3.4^ORsys_idISNOTEMPTY',
      });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
        query: 'type=ip_addressORtype=domain^valueCONTAINS1.2.3.4ORsys_idISNOTEMPTY',
      }));
    });
  });

  describe('get_security_dashboard', () => {
    // Regression test: this previously queried each metric with
    // queryRecords(limit:1) and reported .count -- always 0 or 1 regardless of the
    // real number of open incidents/vulnerabilities, making every field in this
    // dashboard meaningless. Fixed to use ungrouped aggregate queries.
    it('reports real counts from aggregate queries, not a limit:1 page length', async () => {
      mockClient.runAggregateQuery
        .mockResolvedValueOnce({ stats: { count: '7' } })   // open high
        .mockResolvedValueOnce({ stats: { count: '23' } })  // open medium
        .mockResolvedValueOnce({ stats: { count: '5' } })   // open low
        .mockResolvedValueOnce({ stats: { count: '41' } })  // open vulns
        .mockResolvedValueOnce({ stats: { count: '12' } }); // resolved

      const result = await executeSecurityToolCall(mockClient, 'get_security_dashboard', { days: 30 });

      expect(mockClient.queryRecords).not.toHaveBeenCalled();
      expect(mockClient.runAggregateQuery).toHaveBeenNthCalledWith(1, 'sn_si_incident', undefined, 'COUNT', 'state!=closed^severity=1');
      expect(mockClient.runAggregateQuery).toHaveBeenNthCalledWith(4, 'sn_vul_entry', undefined, 'COUNT', 'state=open');
      expect(result.open_incidents).toEqual({ high: 7, medium: 23, low: 5 });
      expect(result.open_vulnerabilities).toBe(41);
      expect(result.resolved_incidents_period).toBe(12);
    });
  });

  describe('unknown tool', () => {
    it('returns null for unrecognised tool', async () => {
      const result = await executeSecurityToolCall(mockClient, 'not_a_real_tool', {});
      expect(result).toBeNull();
    });
  });

  describe('get_security_incident', () => {
    it('requires number_or_sysid', async () => {
      await expect(executeSecurityToolCall(mockClient, 'get_security_incident', {})).rejects.toThrow('number_or_sysid is required');
    });

    it('fetches directly by sys_id when hex', async () => {
      mockClient.getRecord.mockResolvedValue({ sys_id: 'a'.repeat(32), number: 'SIR0001' });
      const result = await executeSecurityToolCall(mockClient, 'get_security_incident', { number_or_sysid: 'a'.repeat(32) });
      expect(mockClient.getRecord).toHaveBeenCalledWith('sn_si_incident', 'a'.repeat(32));
      expect(result.number).toBe('SIR0001');
    });

    it('resolves by number and throws NOT_FOUND when missing', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 0, records: [] });
      await expect(executeSecurityToolCall(mockClient, 'get_security_incident', { number_or_sysid: 'SIR0001' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('strips ^ from the number so it cannot inject extra encoded-query clauses', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 1, records: [{ sys_id: 's1', number: 'SIR0001' }] });
      await executeSecurityToolCall(mockClient, 'get_security_incident', { number_or_sysid: 'SIR0001^ORstate=closed' });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ query: 'number=SIR0001ORstate=closed' }));
    });
  });

  describe('get_vulnerability', () => {
    it('requires number_or_sysid', async () => {
      await expect(executeSecurityToolCall(mockClient, 'get_vulnerability', {})).rejects.toThrow('number_or_sysid is required');
    });

    it('fetches directly by sys_id when hex', async () => {
      mockClient.getRecord.mockResolvedValue({ sys_id: 'a'.repeat(32), number: 'VUL0001' });
      const result = await executeSecurityToolCall(mockClient, 'get_vulnerability', { number_or_sysid: 'a'.repeat(32) });
      expect(mockClient.getRecord).toHaveBeenCalledWith('sn_vul_entry', 'a'.repeat(32));
      expect(result.number).toBe('VUL0001');
    });

    it('throws NOT_FOUND when name lookup misses', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 0, records: [] });
      await expect(executeSecurityToolCall(mockClient, 'get_vulnerability', { number_or_sysid: 'VUL9999' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('list_security_playbooks', () => {
    it('defaults to active=true and filters by category', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 0, records: [] });
      await executeSecurityToolCall(mockClient, 'list_security_playbooks', { category: 'phishing' });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'sn_si_playbook', query: 'active=true^category=phishing' }));
    });
  });

  describe('run_security_playbook', () => {
    it('is blocked without WRITE_ENABLED', async () => {
      await expect(executeSecurityToolCall(mockClient, 'run_security_playbook', { playbook_sys_id: 'p1', incident_sys_id: 'i1' }))
        .rejects.toThrow('Write operations are disabled');
    });

    it('requires playbook_sys_id and incident_sys_id', async () => {
      process.env.WRITE_ENABLED = 'true';
      await expect(executeSecurityToolCall(mockClient, 'run_security_playbook', {})).rejects.toThrow(
        'playbook_sys_id and incident_sys_id are required'
      );
    });

    it('executes the playbook with extra parameters', async () => {
      process.env.WRITE_ENABLED = 'true';
      mockClient.createRecord.mockResolvedValue({ sys_id: 'exec1' });
      const result = await executeSecurityToolCall(mockClient, 'run_security_playbook', {
        playbook_sys_id: 'p1', incident_sys_id: 'i1', parameters: { notify: 'true' },
      });
      expect(mockClient.createRecord).toHaveBeenCalledWith('sn_si_playbook_execution', { playbook: 'p1', incident: 'i1', notify: 'true' });
      expect(result.action).toBe('executed');
    });
  });

  describe('scan_vulnerabilities', () => {
    it('is blocked without WRITE_ENABLED', async () => {
      await expect(executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { group: 'g1' })).rejects.toThrow('Write operations are disabled');
    });

    it('requires ci_sys_ids or group', async () => {
      process.env.WRITE_ENABLED = 'true';
      await expect(executeSecurityToolCall(mockClient, 'scan_vulnerabilities', {})).rejects.toThrow('ci_sys_ids or group is required');
    });

    it('requests a full scan by default', async () => {
      process.env.WRITE_ENABLED = 'true';
      mockClient.createRecord.mockResolvedValue({ sys_id: 'scan1' });
      const result = await executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: ['ci1', 'ci2'] });
      expect(mockClient.createRecord).toHaveBeenCalledWith('sn_vul_scan_request', { ci_list: 'ci1,ci2', group: '', scan_type: 'full' });
      expect(result.action).toBe('scan_requested');
    });
  });
});
