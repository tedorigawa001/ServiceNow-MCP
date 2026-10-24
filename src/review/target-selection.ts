/** Fixed candidate policy, never a caller-provided query. */
import { z } from 'zod';
export const selectionModeSchema = z.enum(['bounded_all', 'review_targets']);
export const TARGET_FILTER_VERSION = 'target-prefix-0.1' as const;
export const TARGET_LIMITATIONS = ['target_candidate_filter_only', 'non_candidate_counts_not_collected',
  'acl_pre_limit_inventory_unknown', 'whole_update_set_not_reviewed'] as const;
export function requestedAssetTypes(rules: readonly string[]): ('business_rule' | 'client_script')[] {
  return [...(rules.some(r => r === 'AU-BR-001' || r === 'AU-BR-002' || r === 'AU-QRY-001') ? ['business_rule' as const] : []),
    ...(rules.includes('AU-CL-004') ? ['client_script' as const] : [])];
}
export function targetSelection(rules: readonly string[]) {
  return { mode: 'review_targets' as const, filter_version: TARGET_FILTER_VERSION,
    requested_asset_types: requestedAssetTypes(rules), action_scope: 'insert_or_update_only' as const,
    order: 'sys_id_asc' as const, excluded_counts: { unsupported_assets: null, deleted_assets: null, other_actions: null } };
}
export function candidatePolicy(rules: readonly string[]) {
  const types = requestedAssetTypes(rules);
  const prefix = types.includes('business_rule') ? 'sys_script_' : 'sys_script_client_';
  const excludes = types.includes('business_rule')
    ? [...(!types.includes('client_script') ? ['sys_script_client_'] : []), 'sys_script_include_'] : [];
  return { query: `^action=INSERT_OR_UPDATE^nameSTARTSWITH${prefix}${excludes.map(s => `^nameNOT LIKE${s}`).join('')}`,
    accepts: (row: { name: string; action: string }) => row.action === 'INSERT_OR_UPDATE'
      && row.name.startsWith(prefix) && excludes.every(s => !row.name.includes(s)) };
}
