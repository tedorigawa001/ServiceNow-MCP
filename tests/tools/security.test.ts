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
    it('queries PAD definitions in the sn_si_aw scope, active by default', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 0, records: [] });
      await executeSecurityToolCall(mockClient, 'list_security_playbooks', {});
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
        table: 'sys_pd_process_definition', query: 'sys_scope.scope=sn_si_aw^active=true',
      }));
    });

    it('adds a sanitized label/name search and honours active=false', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 0, records: [] });
      await executeSecurityToolCall(mockClient, 'list_security_playbooks', { active: false, query: 'Phish^ORactive=true' });
      const call = mockClient.queryRecords.mock.calls[0][0];
      expect(call.table).toBe('sys_pd_process_definition');
      // The ^ in the input is stripped, so the injected clause becomes inert
      // text inside the LIKE value instead of a separate active=true clause.
      expect(call.query).toBe('sys_scope.scope=sn_si_aw^labelLIKEPhishORactive=true^ORnameLIKEPhishORactive=true');
      expect(call.query.split('^')).not.toContain('active=true');
    });
  });

  describe('run_security_playbook', () => {
    const INC = 'a'.repeat(32);
    const PB = 'b'.repeat(32);
    const definition = { sys_id: PB, name: 'security_incident_malware_manual_template_v1', label: 'Manual Malware Playbook Template V1', active: 'true', status: 'published', 'sys_package.source': 'sn_si_aw' };
    const QUALIFIED = 'sn_si_aw.security_incident_malware_manual_template_v1';
    const scriptingOn = () => { process.env.WRITE_ENABLED = 'true'; process.env.SCRIPTING_ENABLED = 'true'; };

    it('is blocked without WRITE_ENABLED', async () => {
      await expect(executeSecurityToolCall(mockClient, 'run_security_playbook', { playbook: PB, incident_sys_id: INC }))
        .rejects.toThrow('Write operations are disabled');
    });

    it('is blocked without SCRIPTING_ENABLED because it schedules a server script', async () => {
      process.env.WRITE_ENABLED = 'true';
      delete process.env.SCRIPTING_ENABLED;
      await expect(executeSecurityToolCall(mockClient, 'run_security_playbook', { playbook: PB, incident_sys_id: INC }))
        .rejects.toThrow('Scripting operations are disabled');
    });

    it('requires a playbook reference and a 32-char hex incident sys_id', async () => {
      scriptingOn();
      await expect(executeSecurityToolCall(mockClient, 'run_security_playbook', { incident_sys_id: INC })).rejects.toThrow('playbook (sys_id or scoped name) is required');
      await expect(executeSecurityToolCall(mockClient, 'run_security_playbook', { playbook: PB, incident_sys_id: 'nope' })).rejects.toThrow('32-char hex sys_id');
      await expect(executeSecurityToolCall(mockClient, 'run_security_playbook', { playbook: PB, incident_sys_id: INC, wait_seconds: 999 })).rejects.toThrow('wait_seconds must be between 0 and 180');
      expect(mockClient.createRecord).not.toHaveBeenCalled();
    });

    it('resolves the playbook only within the sn_si_aw scope and rejects unknown ones', async () => {
      scriptingOn();
      mockClient.queryRecords.mockResolvedValueOnce({ count: 0, records: [] });
      await expect(executeSecurityToolCall(mockClient, 'run_security_playbook', { playbook: 'not_a_sir_playbook', incident_sys_id: INC }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
        table: 'sys_pd_process_definition', query: 'name=not_a_sir_playbook^sys_scope.scope=sn_si_aw',
      }));
      expect(mockClient.createRecord).not.toHaveBeenCalled();
    });

    it('rejects a playbook that is still a draft', async () => {
      scriptingOn();
      mockClient.queryRecords.mockResolvedValueOnce({ count: 1, records: [{ ...definition, status: 'draft' }] });
      await expect(executeSecurityToolCall(mockClient, 'run_security_playbook', { playbook: PB, incident_sys_id: INC }))
        .rejects.toMatchObject({ code: 'CONFLICT' });
      expect(mockClient.createRecord).not.toHaveBeenCalled();
    });

    it('does not start a second execution when one is already queued or in progress', async () => {
      scriptingOn();
      mockClient.queryRecords
        .mockResolvedValueOnce({ count: 1, records: [definition] })
        .mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'ctx1', state: 'IN_PROGRESS', name: QUALIFIED }] });
      mockClient.getRecord.mockResolvedValue({ sys_id: INC });
      const result = await executeSecurityToolCall(mockClient, 'run_security_playbook', { playbook: PB, incident_sys_id: INC });
      expect(result.action).toBe('already_running');
      expect(result.execution.sys_id).toBe('ctx1');
      expect(mockClient.queryRecords).toHaveBeenNthCalledWith(2, expect.objectContaining({
        table: 'sys_pd_context',
        query: `input_table=sn_si_incident^input_record=${INC}^name=${QUALIFIED}^stateNOT INCANCELLED,COMPLETE,ERROR`,
      }));
      expect(mockClient.createRecord).not.toHaveBeenCalled();
    });

    it('returns already_scheduled when a pending job exists for the same incident and playbook', async () => {
      scriptingOn();
      mockClient.queryRecords
        .mockResolvedValueOnce({ count: 1, records: [definition] })
        .mockResolvedValueOnce({ count: 0, records: [] })
        .mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'job0', run_start: '2026-09-21 10:00:00' }] });
      mockClient.getRecord.mockResolvedValue({ sys_id: INC });
      const result = await executeSecurityToolCall(mockClient, 'run_security_playbook', { playbook: PB, incident_sys_id: INC });
      expect(result.action).toBe('already_scheduled');
      expect(result.scheduled_job.sys_id).toBe('job0');
      expect(mockClient.queryRecords).toHaveBeenNthCalledWith(3, expect.objectContaining({
        table: 'sysauto_script', query: `name=[MCP playbook ${PB}:${INC}]`,
      }));
      expect(mockClient.createRecord).not.toHaveBeenCalled();
    });

    it('schedules a one-time script that calls sn_playbook.PlaybookExperience.triggerPlaybook', async () => {
      scriptingOn();
      mockClient.queryRecords
        .mockResolvedValueOnce({ count: 1, records: [definition] })
        .mockResolvedValueOnce({ count: 0, records: [] })
        .mockResolvedValueOnce({ count: 0, records: [] });
      mockClient.getRecord.mockResolvedValue({ sys_id: INC });
      mockClient.createRecord.mockResolvedValue({ sys_id: 'job1' });
      const result = await executeSecurityToolCall(mockClient, 'run_security_playbook', { playbook: definition.name, incident_sys_id: INC });
      expect(mockClient.getRecord).toHaveBeenCalledWith('sn_si_incident', INC);
      expect(mockClient.createRecord).toHaveBeenCalledWith('sysauto_script', expect.objectContaining({
        run_type: 'once',
        active: true,
        script: `var parent = new GlideRecord('sn_si_incident');\nif (parent.get('${INC}')) { sn_playbook.PlaybookExperience.triggerPlaybook('${QUALIFIED}', parent); }`,
      }));
      expect(result.action).toBe('playbook_scheduled');
      expect(result.playbook).toEqual({ sys_id: PB, name: QUALIFIED, label: definition.label });
      expect(result.scheduled_job.sys_id).toBe('job1');
      expect(result.execution).toBeNull();
    });

    it('polls sys_pd_context and reports playbook_started when wait_seconds is set', async () => {
      scriptingOn();
      vi.useFakeTimers();
      try {
        mockClient.queryRecords
          .mockResolvedValueOnce({ count: 1, records: [definition] })
          .mockResolvedValueOnce({ count: 0, records: [] })
          .mockResolvedValueOnce({ count: 0, records: [] })
          .mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'ctx2', state: 'QUEUED', name: QUALIFIED }] });
        mockClient.getRecord.mockResolvedValue({ sys_id: INC });
        mockClient.createRecord.mockResolvedValue({ sys_id: 'job2' });
        mockClient.deleteRecord = vi.fn().mockResolvedValue(undefined);
        const result = await executeSecurityToolCall(mockClient, 'run_security_playbook', { playbook: PB, incident_sys_id: INC, wait_seconds: 30 });
        expect(result.action).toBe('playbook_started');
        expect(result.execution.sys_id).toBe('ctx2');
        expect(mockClient.deleteRecord).toHaveBeenCalledWith('sysauto_script', 'job2');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('scan_vulnerabilities', () => {
    const CI1 = 'c'.repeat(32);
    const CI2 = 'd'.repeat(32);
    const VI1 = 'e'.repeat(32);
    const SCANNER = 'f'.repeat(32);
    const SCAN = '1'.repeat(32);
    const scanner = { sys_id: SCANNER, name: 'Qualys', active: 'true', default: 'true', integration: 'int1', 'integration.name': 'Qualys Vulnerability Integration' };
    const scriptingOn = () => { process.env.WRITE_ENABLED = 'true'; process.env.SCRIPTING_ENABLED = 'true'; };
    /** Queue answers in call order: scanner lookup, target existence, running guard, then syslog polls. */
    const queue = (...responses: Array<Record<string, unknown>[]>) => {
      for (const records of responses) mockClient.queryRecords.mockResolvedValueOnce({ count: records.length, records });
    };
    const jobResult = (out: Record<string, unknown>) => [{ message: `mcp-scan-x RESULT:${JSON.stringify(out)}` }];

    it('is blocked without WRITE_ENABLED', async () => {
      await expect(executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: [CI1] })).rejects.toThrow('Write operations are disabled');
    });

    it('is blocked without SCRIPTING_ENABLED because the scan is created by a server script', async () => {
      process.env.WRITE_ENABLED = 'true';
      delete process.env.SCRIPTING_ENABLED;
      await expect(executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: [CI1] })).rejects.toThrow('Scripting operations are disabled');
    });

    it('validates the target lists and wait budget before touching the instance', async () => {
      scriptingOn();
      await expect(executeSecurityToolCall(mockClient, 'scan_vulnerabilities', {})).rejects.toThrow('ci_sys_ids or vulnerable_item_sys_ids is required');
      await expect(executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: [CI1], vulnerable_item_sys_ids: [VI1] })).rejects.toThrow('not both');
      await expect(executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: ['nope'] })).rejects.toThrow('32-char hex sys_ids');
      await expect(executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: 'not-an-array' })).rejects.toThrow('must be an array');
      await expect(executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: Array.from({ length: 201 }, (_, i) => i.toString(16).padStart(32, '0')) })).rejects.toThrow('limited to 200');
      await expect(executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: [CI1], wait_seconds: 500 })).rejects.toThrow('wait_seconds must be between 0 and 120');
      expect(mockClient.queryRecords).not.toHaveBeenCalled();
      expect(mockClient.createRecord).not.toHaveBeenCalled();
    });

    it('refuses to initiate when no active default scanner exists, but allows a draft', async () => {
      scriptingOn();
      queue([]);
      await expect(executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: [CI1] })).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('No active default scanner') });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'sn_vul_scanner', query: 'active=true^default=true' }));
      expect(mockClient.createRecord).not.toHaveBeenCalled();

      vi.clearAllMocks();
      queue([], [{ sys_id: CI1 }], [], jobResult({ scan_sys_id: SCAN, number: 'VSCAN0001003', state: 'draft', linked: 1 }));
      mockClient.createRecord.mockResolvedValue({ sys_id: 'job1' });
      mockClient.deleteRecord = vi.fn().mockResolvedValue(undefined);
      mockClient.getRecord.mockResolvedValue({ sys_id: SCAN, number: 'VSCAN0001003', state: 'draft', status_message: '' });
      const result = await executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: [CI1], initiate: false, wait_seconds: 5 });
      expect(result.action).toBe('scan_drafted');
      expect(result.scanner).toBeNull();
      const script = mockClient.createRecord.mock.calls[0][1].script as string;
      expect(script).toContain("scan.setValue('state', 'draft')");
      expect(script).not.toContain("'processing'");
      expect(script).not.toContain("setValue('scanner'");
    });

    it('validates an explicit scanner_sys_id and rejects inactive scanners', async () => {
      scriptingOn();
      await expect(executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: [CI1], scanner_sys_id: 'bad' })).rejects.toThrow('scanner_sys_id must be a 32-char hex sys_id');
      queue([]);
      await expect(executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: [CI1], scanner_sys_id: SCANNER })).rejects.toMatchObject({ code: 'NOT_FOUND' });
      queue([{ ...scanner, active: 'false' }]);
      await expect(executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: [CI1], scanner_sys_id: SCANNER })).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('inactive') });
      expect(mockClient.createRecord).not.toHaveBeenCalled();
    });

    it('rejects target sys_ids that do not exist instead of scanning fewer than asked', async () => {
      scriptingOn();
      queue([scanner], [{ sys_id: CI1 }]);
      await expect(executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: [CI1, CI2] })).rejects.toMatchObject({ code: 'NOT_FOUND', message: expect.stringContaining(CI2) });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'cmdb_ci', query: `sys_idIN${CI1},${CI2}` }));
      expect(mockClient.createRecord).not.toHaveBeenCalled();
    });

    it('reports already_running when a target is in a queued/processing/scanning scan (product guard)', async () => {
      scriptingOn();
      queue([scanner], [{ sys_id: VI1 }], [{ sn_vul_scan: { value: SCAN }, 'sn_vul_scan.number': 'VSCAN0001004', 'sn_vul_scan.state': 'scanning', source: VI1 }]);
      const result = await executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { vulnerable_item_sys_ids: [VI1] });
      expect(result.action).toBe('already_running');
      expect(result.scan).toEqual({ sys_id: SCAN, number: 'VSCAN0001004', state: 'scanning' });
      // Vulnerable Items link through sn_vul_m2m_scan_source.source, not the CI table.
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'sn_vul_m2m_scan_source', query: `sourceIN${VI1}^sn_vul_scan.stateINprocessing,scanning,queued` }));
      expect(mockClient.createRecord).not.toHaveBeenCalled();
    });

    it('creates the scan through a run-once server script, reads the syslog result and removes the job', async () => {
      scriptingOn();
      queue([scanner], [{ sys_id: CI1 }, { sys_id: CI2 }], [], [], jobResult({ scan_sys_id: SCAN, number: 'VSCAN0001004', state: 'processing', linked: 2 }));
      mockClient.createRecord.mockResolvedValue({ sys_id: 'job1' });
      mockClient.deleteRecord = vi.fn().mockResolvedValue(undefined);
      mockClient.getRecord.mockResolvedValue({ sys_id: SCAN, number: 'VSCAN0001004', state: 'scanning', status_message: 'accepted' });
      const result = await executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: [CI1, CI2], wait_seconds: 10 });

      expect(result.action).toBe('scan_initiated');
      expect(result.linked_targets).toBe(2);
      expect(result.scan.state).toBe('scanning');
      expect(result.scanner).toEqual({ sys_id: SCANNER, name: 'Qualys', integration: 'Qualys Vulnerability Integration' });

      const [table, job] = mockClient.createRecord.mock.calls[0];
      expect(table).toBe('sysauto_script');
      expect(job.run_type).toBe('once');
      expect(job.name).toMatch(/^\[MCP scan mcp-scan-[0-9a-f]{32}\]$/);
      expect(job.name.length).toBeLessThanOrEqual(100);
      expect(job).not.toHaveProperty('description'); // sysauto_script has no such column
      const script = job.script as string;
      expect(script).toContain("new GlideRecord('sn_vul_scan')");
      expect(script).toContain("scan.setValue('source_table', 'cmdb_ci')");
      expect(script).toContain(`scan.setValue('scanner', '${SCANNER}')`);
      expect(script).toContain(`var ids = '${CI1},${CI2}'.split(',')`);
      expect(script).toContain("new GlideRecord('sn_vul_m2m_scan_configuration_item')");
      expect(script).toContain("link.setValue('cmdb_ci', ids[i])");
      expect(script).toContain("scan.setValue('state', 'processing')");
      expect(script).toContain("gs.info(token + ' RESULT:' + JSON.stringify(out))");

      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'syslog', query: expect.stringMatching(/^messageSTARTSWITHmcp-scan-[0-9a-f]{32} RESULT:$/) }));
      expect(mockClient.deleteRecord).toHaveBeenCalledWith('sysauto_script', 'job1');
    });

    it('returns scan_scheduled with the job when the scheduler has not run it within wait_seconds', async () => {
      scriptingOn();
      queue([scanner], [{ sys_id: CI1 }], []);
      mockClient.queryRecords.mockResolvedValue({ count: 0, records: [] }); // every syslog poll: nothing yet
      mockClient.createRecord.mockResolvedValue({ sys_id: 'job1' });
      mockClient.deleteRecord = vi.fn();
      const result = await executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: [CI1], wait_seconds: 0 });
      expect(result.action).toBe('scan_scheduled');
      expect(result.scheduled_job.sys_id).toBe('job1');
      expect(result.scan).toBeNull();
      expect(mockClient.deleteRecord).not.toHaveBeenCalled();
    });

    it('surfaces a failure reported by the script as an API error and still removes the job', async () => {
      scriptingOn();
      queue([scanner], [{ sys_id: CI1 }], [], jobResult({ error: 'sn_vul_scan insert was rejected' }));
      mockClient.createRecord.mockResolvedValue({ sys_id: 'job1' });
      mockClient.deleteRecord = vi.fn().mockResolvedValue(undefined);
      await expect(executeSecurityToolCall(mockClient, 'scan_vulnerabilities', { ci_sys_ids: [CI1], wait_seconds: 5 })).rejects.toMatchObject({ code: 'API_ERROR', message: expect.stringContaining('insert was rejected') });
      expect(mockClient.deleteRecord).toHaveBeenCalledWith('sysauto_script', 'job1');
    });
  });
});
