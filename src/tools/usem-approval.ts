/**
 * USEM / Vulnerability Response approval actions — the workflow-sanctioned way
 * to advance the state of VR records.
 *
 * Why this exists: VR record state (sn_vul_vulnerability groups, vulnerable
 * items, exception requests) is driven by the platform workflow engine, not by
 * direct field writes. Verified on a live PDI (dev400464):
 *   - PATCH of `state` on sn_vul_vulnerability → INSUFFICIENT_PRIVILEGES (ACL)
 *   - PATCH of VI `ignore_reason`/`ignore_date` → accepted but reverted by a
 *     business rule (no effect)
 * The reliable Table-API surface that DOES move workflow state is the approval
 * record (sysapproval_approver): approving/rejecting it advances the attached
 * workflow (e.g. an exception / risk-acceptance / false-positive request),
 * which in turn transitions the underlying VR record.
 *
 * Linkage (verified live): VR exception approvals do NOT populate `sysapproval`.
 * They are linked via `source_table` (e.g. sn_sec_exception_change_approval) and
 * `document_id` (the Change Approval record), with `approval_source` naming the
 * ultimate VR record class (e.g. sn_vul_vulnerability). Filtering is therefore
 * done on `source_table`.
 *
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

const SYS_ID_RE = /^[0-9a-f]{32}$/i;

/**
 * Approval `source_table` values that represent VR state transitions. Exception
 * approvals come through sn_sec_exception_change_approval; group/item approvals
 * may come directly from the VR record classes.
 */
const VR_APPROVAL_CLASSES = [
  'sn_sec_exception_change_approval',
  'sn_vul_vulnerability',
  'sn_vul_vulnerable_item',
  'sn_vul_remediation_task',
  'sn_vul_app_vulnerability',
  'sn_vul_app_vulnerable_item',
];

export function getUsemApprovalToolDefinitions() {
  return [
    {
      name: 'list_vr_approvals',
      description:
        'List approval records (sysapproval_approver) for Vulnerability Response items — exception, ' +
        'risk-acceptance and false-positive requests whose approval drives a VR state transition. ' +
        'Defaults to pending (state=requested). Each row shows the source record class and number.',
      inputSchema: {
        type: 'object',
        properties: {
          state: {
            type: 'string',
            description: 'Approval state filter (default "requested"); e.g. requested, approved, rejected. Use "any" for all.',
          },
          source_table: {
            type: 'string',
            description: 'Restrict to one source_table (e.g. "sn_sec_exception_change_approval"); default = all VR classes',
          },
          limit: { type: 'number', description: 'Max records (default: 25, max: 1000)' },
        },
      },
    },
    {
      name: 'act_on_vr_approval',
      description:
        'Approve or reject a Vulnerability Response approval (sysapproval_approver) by sys_id, which ' +
        'advances the attached workflow and transitions the underlying VR record. Rejection requires ' +
        'a comment. **[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: '32-char sys_id of the sysapproval_approver record' },
          action: { type: 'string', enum: ['approve', 'reject'], description: 'approve or reject' },
          comments: { type: 'string', description: 'Comment/justification (required when action=reject)' },
        },
        required: ['sys_id', 'action'],
      },
    },
  ];
}

export async function executeUsemApprovalToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_vr_approvals': {
      const parts: string[] = [];
      const source = typeof args.source_table === 'string' ? args.source_table.trim() : '';
      if (source) {
        if (!VR_APPROVAL_CLASSES.includes(source)) {
          throw new ServiceNowError(
            `source_table must be one of: ${VR_APPROVAL_CLASSES.join(', ')}`,
            'INVALID_REQUEST'
          );
        }
        parts.push(`source_table=${source}`);
      } else {
        parts.push(`source_tableIN${VR_APPROVAL_CLASSES.join(',')}`);
      }
      const state = typeof args.state === 'string' && args.state.trim() ? args.state.trim() : 'requested';
      if (state !== 'any') parts.push(`state=${state}`);

      const resp = await client.queryRecords({
        table: 'sysapproval_approver',
        query: parts.join('^'),
        fields: 'state,approver,document_id,source_table,approval_source,group,due_date,sys_created_on,sys_id',
        orderBy: '-sys_created_on',
        limit: args.limit ?? 25,
        display_value: 'all',
      });
      return {
        count: resp.count,
        records: resp.records,
        summary: `Found ${resp.count} VR approval(s)${state !== 'any' ? ` in state "${state}"` : ''}`,
      };
    }

    case 'act_on_vr_approval': {
      requireWrite();
      if (!args.sys_id || !SYS_ID_RE.test(args.sys_id)) {
        throw new ServiceNowError('sys_id must be a 32-character hex string', 'INVALID_REQUEST');
      }
      if (args.action !== 'approve' && args.action !== 'reject') {
        throw new ServiceNowError('action must be "approve" or "reject"', 'INVALID_REQUEST');
      }
      if (args.action === 'reject' && !args.comments) {
        throw new ServiceNowError('comments are required when rejecting', 'INVALID_REQUEST');
      }
      const data: Record<string, string> = { state: args.action === 'approve' ? 'approved' : 'rejected' };
      if (args.comments) data.comments = args.comments;
      const result = await client.updateRecord('sysapproval_approver', args.sys_id, data);
      return {
        ...result,
        summary: `${args.action === 'approve' ? 'Approved' : 'Rejected'} VR approval ${args.sys_id}`,
      };
    }

    default:
      return null;
  }
}
