/**
 * Tool Router — aggregates all domain tool modules and implements the
 * MCP_TOOL_PACKAGE role-based packaging system.
 *
 * Tool packages (set via MCP_TOOL_PACKAGE env var):
 *   full (default), service_desk, change_coordinator, knowledge_author,
 *   catalog_builder, system_administrator, platform_developer, itom_engineer,
 *   agile_manager, ai_developer, portal_developer, integration_engineer
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { InstanceContext } from '../servicenow/instances.js';
import { ServiceNowError } from '../utils/errors.js';
import {
  ANNOTATIONS_READ,
  ANNOTATIONS_WRITE,
  ANNOTATIONS_WRITE_IDEMPOTENT,
  ANNOTATIONS_DESTRUCTIVE,
} from './schema-helpers.js';

// Core (existing 15 tools)
import { getCoreToolDefinitions, executeCoreToolCall } from './core.js';
// ITSM
import { getIncidentToolDefinitions, executeIncidentToolCall } from './incident.js';
import { getProblemToolDefinitions, executeProblemToolCall } from './problem.js';
import { getChangeToolDefinitions, executeChangeToolCall } from './change.js';
import { getTaskToolDefinitions, executeTaskToolCall } from './task.js';
// Service Management
import { getKnowledgeToolDefinitions, executeKnowledgeToolCall } from './knowledge.js';
import { getCatalogToolDefinitions, executeCatalogToolCall } from './catalog.js';
// User / Group
import { getUserToolDefinitions, executeUserToolCall } from './user.js';
// Reporting & Analytics
import { getReportingToolDefinitions, executeReportingToolCall } from './reporting.js';
// ATF
import { getAtfToolDefinitions, executeAtfToolCall } from './atf.js';
// Now Assist / AI
import { getNowAssistToolDefinitions, executeNowAssistToolCall } from './now-assist.js';
// Scripting
import { getScriptToolDefinitions, executeScriptToolCall } from './script.js';
// Agile
import { getAgileToolDefinitions, executeAgileToolCall } from './agile.js';
// HR Service Delivery
import { getHrsdToolDefinitions, executeHrsdToolCall } from './hrsd.js';
// Customer Service Management
import { getCsmToolDefinitions, executeCsmToolCall } from './csm.js';
// Security Operations & GRC
import { getSecurityToolDefinitions, executeSecurityToolCall } from './security.js';
// Flow Designer & Process Automation
import { getFlowToolDefinitions, executeFlowToolCall } from './flow.js';
// Service Portal & UI Builder
import { getPortalToolDefinitions, executePortalToolCall } from './portal.js';
// Integration (REST Messages, Transform Maps, Events)
import { getIntegrationToolDefinitions, executeIntegrationToolCall } from './integration.js';
// Notifications, Email, Attachments
import { getNotificationToolDefinitions, executeNotificationToolCall } from './notification.js';
// Performance Analytics & Data Quality
import { getPerformanceToolDefinitions, executePerformanceToolCall } from './performance.js';
// System Properties
import { getSysPropertiesToolDefinitions, executeSysPropertiesToolCall } from './sys-properties.js';
// Update Set management
import { getUpdateSetToolDefinitions, executeUpdateSetToolCall } from './updateset.js';
// Virtual Agent authoring
import { getVaToolDefinitions, executeVaToolCall } from './va.js';
// IT Asset Management
import { getItamToolDefinitions, executeItamToolCall } from './itam.js';
// Software Asset Management (SAM Pro)
import { getSamToolDefinitions, executeSamToolCall } from './sam.js';
// Discovery & ACC (Agent Client Collector)
import { getDiscoveryToolDefinitions, executeDiscoveryToolCall } from './discovery.js';
// DevOps & pipeline tracking
import { getDevopsToolDefinitions, executeDevopsToolCall } from './devops.js';
// Scoped Application (App Studio)
import { getAppStudioToolDefinitions, executeAppStudioToolCall } from './app-studio.js';
// Machine Learning & Predictive Intelligence
import { getMlToolDefinitions, executeMlToolCall } from './ml.js';
// Workspace & UI Builder
import { getWorkspaceToolDefinitions, executeWorkspaceToolCall } from './workspace.js';
// Mobile
import { getMobileToolDefinitions, executeMobileToolCall } from './mobile.js';
// Deployment & Artifacts
import { getDeploymentToolDefinitions, executeDeploymentToolCall } from './deployment.js';
// USEM (Unified Security Exposure Management)
import { getUsemToolDefinitions, executeUsemToolCall } from './usem.js';
// USEM / VR configuration rules
import { getUsemConfigToolDefinitions, executeUsemConfigToolCall } from './usem-config.js';
// USEM / VR integration operations
import { getUsemIntegrationToolDefinitions, executeUsemIntegrationToolCall } from './usem-integration.js';
// USEM / VR SLA (TTR) + notifications
import { getUsemSlaToolDefinitions, executeUsemSlaToolCall } from './usem-sla.js';
// USEM / VR approval (workflow state transitions)
import { getUsemApprovalToolDefinitions, executeUsemApprovalToolCall } from './usem-approval.js';
// GRC — Audit Management
import { getGrcAuditToolDefinitions, executeGrcAuditToolCall } from './grc-audit.js';
// GRC — Policy and Compliance Management
import { getGrcComplianceToolDefinitions, executeGrcComplianceToolCall } from './grc-compliance.js';
// GRC — Risk Management
import { getGrcRiskToolDefinitions, executeGrcRiskToolCall } from './grc-risk.js';
// GRC — Indicator (KRI/KPI)
import { getGrcIndicatorToolDefinitions, executeGrcIndicatorToolCall } from './grc-indicator.js';
// Natural-language query resolver
import { getSmartQueryToolDefinitions, executeSmartQueryToolCall } from './smart-query.js';

// ServiceNow Store (public catalog — release notes, version history)
import { getStoreToolDefinitions, executeStoreToolCall } from './store.js';

// ─── Package Definitions ──────────────────────────────────────────────────────

const PACKAGE_TOOL_NAMES: Record<string, string[]> = {
  devops_engineer: [
    'query_records', 'get_record', 'get_table_schema',
    'list_devops_pipelines', 'get_devops_pipeline', 'list_deployments', 'get_deployment',
    'create_devops_change', 'track_deployment', 'get_devops_insights',
    'create_update_set', 'switch_update_set', 'get_current_update_set', 'list_update_sets',
    'complete_update_set', 'preview_update_set', 'export_update_set', 'ensure_active_update_set',
    'get_change_request', 'create_change_request', 'list_change_requests',
  ],
  itam_analyst: [
    'query_records', 'get_record',
    'list_assets', 'get_asset', 'create_asset', 'update_asset', 'retire_asset',
    'list_software_licenses', 'get_license_compliance', 'list_asset_contracts',
    'track_asset_lifecycle', 'get_license_optimization',
    // Software Asset Management (SAM Pro)
    'list_software_installs', 'get_software_install', 'list_software_products',
    'list_license_positions', 'get_license_position_summary', 'list_software_discovery_models',
    'list_software_models', 'get_software_model',
    'list_software_lifecycle_reports', 'get_software_lifecycle_report', 'list_software_lifecycle_entries',
  ],
  secops_analyst: [
    'query_records', 'get_record', 'get_table_schema', 'describe_table', 'check_table_access',
    // Security Operations & GRC
    'list_security_incidents', 'get_security_incident', 'create_security_incident', 'update_security_incident',
    'list_vulnerabilities', 'get_vulnerability', 'update_vulnerability', 'get_security_dashboard',
    'get_threat_intelligence',
    // GRC — Audit Management
    'list_audit_engagements', 'get_audit_engagement', 'list_audit_control_tests', 'get_audit_control_test',
    'get_grc_audit_dashboard',
    // GRC — Policy and Compliance Management
    'list_grc_entities', 'get_grc_entity', 'create_grc_entity', 'update_grc_entity',
    'list_compliance_policies', 'get_compliance_policy', 'create_compliance_policy', 'update_compliance_policy',
    'list_compliance_controls', 'get_compliance_control', 'create_compliance_control', 'update_compliance_control',
    'list_control_objectives', 'get_control_objective',
    'list_policy_exceptions', 'get_policy_exception',
    'list_grc_issues', 'get_grc_issue', 'create_grc_issue', 'update_grc_issue',
    'get_grc_compliance_dashboard',
    // GRC — Risk Management
    'list_risks', 'get_risk', 'create_risk', 'update_risk',
    'list_risk_statements', 'get_risk_statement', 'list_risk_criteria', 'get_grc_risk_dashboard',
    // GRC — Indicator (KRI/KPI)
    'list_grc_indicators', 'get_grc_indicator', 'create_grc_indicator', 'update_grc_indicator',
    'list_indicator_results', 'get_indicator_result', 'get_grc_indicator_dashboard',
    // USEM
    'list_vulnerable_items', 'get_vulnerable_item', 'list_remediation_tasks', 'get_remediation_task',
    'list_nvd_entries', 'get_nvd_entry_by_cve', 'get_usem_dashboard',
    'list_vulnerability_groups', 'get_vulnerability_group',
    'create_vulnerability_group', 'update_vulnerability_group',
    'create_remediation_task', 'update_remediation_task', 'add_vi_to_remediation_task',
    'create_vulnerable_item', 'list_remediation_task_findings', 'get_finding_grouping_status',
    // USEM / VR configuration rules
    'list_usem_rules', 'get_usem_rule', 'create_usem_rule', 'update_usem_rule', 'set_usem_rule_active',
    'get_risk_calculator_details',
    // USEM / VR integration operations
    'list_integrations', 'list_integration_implementations', 'list_integration_runs',
    'get_integration_run', 'list_integration_logs', 'set_integration_active',
    'list_integration_parameters',
    // USEM / VR SLA (TTR) + notifications
    'list_remediation_sla', 'get_remediation_sla', 'get_group_sla', 'set_remediation_commitment', 'list_vr_notifications',
    'list_notifications', 'get_notification', 'update_notification',
    // USEM / VR approval (workflow state transitions)
    'list_vr_approvals', 'list_vr_exception_requests', 'act_on_vr_approval',
    'get_my_approvals', 'approve_request', 'reject_request',
    // Integration health
    'get_integration_health',
    // Store release notes (upgrade planning)
    'search_store_apps', 'get_store_app_versions',
  ],
  portal_developer: [
    'query_records', 'get_record', 'get_table_schema',
    'list_portals', 'get_portal', 'create_portal', 'list_portal_pages', 'get_portal_page', 'create_portal_page',
    'list_portal_widgets', 'get_portal_widget', 'create_portal_widget', 'update_portal_widget',
    'list_widget_instances',
    'list_ux_apps', 'get_ux_app', 'list_ux_pages',
    'list_portal_themes', 'get_portal_theme',
    'list_ui_policies', 'get_ui_policy', 'create_ui_policy',
    'list_ui_actions', 'get_ui_action', 'create_ui_action', 'update_ui_action',
    'list_client_scripts', 'get_client_script', 'create_client_script', 'update_client_script',
    'list_changesets', 'get_changeset', 'commit_changeset', 'publish_changeset',
  ],
  integration_engineer: [
    'query_records', 'get_record', 'get_table_schema',
    'list_rest_messages', 'get_rest_message', 'list_rest_message_functions', 'create_rest_message',
    'list_soap_messages', 'get_soap_message', 'list_soap_message_functions', 'create_soap_message', 'create_soap_message_function',
    'list_transform_maps', 'get_transform_map', 'run_transform_map', 'list_transform_field_maps',
    'list_import_sets', 'get_import_set', 'create_import_set_row', 'list_data_sources',
    'list_event_registry', 'get_event_registry_entry', 'register_event', 'fire_event', 'list_event_log',
    'list_oauth_applications', 'list_credential_aliases',
    'list_changesets', 'get_changeset', 'commit_changeset', 'publish_changeset',
  ],
  service_desk: [
    // Core read
    'query_records', 'get_record', 'get_user', 'get_group',
    // Incident full lifecycle
    'create_incident', 'get_incident', 'update_incident', 'resolve_incident', 'close_incident', 'add_work_note', 'add_comment',
    // Approvals
    'get_my_approvals', 'approve_request', 'reject_request',
    // Catalog requests
    'list_requests', 'get_request', 'list_request_items', 'get_request_item',
    // Knowledge read
    'search_knowledge', 'get_knowledge_article', 'list_knowledge_bases',
    // SLA
    'get_sla_details', 'list_active_slas',
    // Tasks
    'get_task', 'list_my_tasks', 'complete_task',
    // Natural language
    'natural_language_search', 'smart_query',
  ],
  change_coordinator: [
    'query_records', 'get_record', 'get_user', 'get_group',
    'create_change_request', 'get_change_request', 'update_change_request', 'list_change_requests', 'submit_change_for_approval', 'close_change_request',
    'get_my_approvals', 'approve_request', 'reject_request',
    'get_problem', 'update_problem',
    'search_cmdb_ci', 'get_cmdb_ci', 'list_relationships',
    'schedule_cab_meeting',
  ],
  knowledge_author: [
    'query_records', 'get_record', 'get_user',
    'list_knowledge_bases', 'search_knowledge', 'get_knowledge_article', 'create_knowledge_article', 'update_knowledge_article', 'publish_knowledge_article',
    'list_catalog_items', 'search_catalog', 'get_catalog_item',
    'retire_knowledge_article',
  ],
  catalog_builder: [
    'query_records', 'get_record', 'get_user',
    'list_catalog_items', 'search_catalog', 'get_catalog_item', 'create_catalog_item', 'update_catalog_item', 'order_catalog_item',
    'list_requests', 'get_request', 'list_request_items', 'get_request_item', 'cancel_request', 'update_request_item',
    'create_approval_rule',
    'list_users', 'list_groups',
    'create_catalog_variable', 'create_catalog_ui_policy',
  ],
  system_administrator: [
    'query_records', 'get_record', 'get_user', 'get_group', 'get_table_schema',
    'list_users', 'create_user', 'update_user', 'list_groups', 'create_group', 'update_group', 'add_user_to_group', 'remove_user_from_group',
    'list_reports', 'get_report', 'create_report', 'update_report', 'run_aggregate_query', 'trend_query', 'export_report_data', 'get_sys_log',
    'list_scheduled_jobs', 'get_scheduled_job', 'create_scheduled_job', 'update_scheduled_job', 'trigger_scheduled_job', 'list_job_run_history',
    'list_acls', 'get_acl', 'create_acl', 'update_acl',
    'list_notifications', 'get_notification', 'create_notification', 'update_notification',
    'list_email_logs', 'get_email_log',
    'list_attachments', 'get_attachment_metadata', 'upload_attachment', 'delete_attachment',
    'check_table_completeness', 'get_table_record_count', 'compare_record_counts',
    'list_pa_indicators', 'get_pa_indicator', 'get_pa_scorecard', 'get_pa_time_series',
    'list_pa_dashboards', 'get_pa_dashboard', 'create_dashboard', 'update_dashboard',
    'list_oauth_applications', 'list_credential_aliases',
    'get_system_property', 'set_system_property', 'list_system_properties', 'search_system_properties',
    'bulk_get_properties', 'bulk_set_properties', 'list_property_categories',
    'get_current_update_set', 'list_update_sets',
    'create_update_set', 'switch_update_set', 'complete_update_set', 'preview_update_set', 'ensure_active_update_set',
    'create_scheduled_report', 'create_kpi',
    // Instance performance diagnostics
    'get_instance_diagnostics', 'get_performance_history',
  ],
  platform_developer: [
    'query_records', 'get_record', 'get_table_schema',
    'list_scoped_apps', 'get_scoped_app', 'create_scoped_app', 'update_scoped_app',
    'list_business_rules', 'get_business_rule', 'create_business_rule', 'update_business_rule',
    'list_script_includes', 'get_script_include', 'create_script_include', 'update_script_include',
    'list_client_scripts', 'get_client_script', 'create_client_script', 'update_client_script',
    'list_ui_policies', 'get_ui_policy', 'create_ui_policy',
    'list_ui_actions', 'get_ui_action', 'create_ui_action', 'update_ui_action',
    'list_acls', 'get_acl', 'create_acl', 'update_acl',
    'list_changesets', 'get_changeset', 'commit_changeset', 'publish_changeset',
    'list_atf_suites', 'get_atf_suite', 'run_atf_suite', 'list_atf_tests', 'get_atf_test', 'run_atf_test', 'get_atf_suite_result', 'list_atf_test_results', 'get_atf_failure_insight',
  ],
  itom_engineer: [
    'query_records', 'get_record', 'get_table_schema',
    'search_cmdb_ci', 'get_cmdb_ci', 'list_relationships', 'cmdb_health_dashboard', 'service_mapping_summary',
    'list_discovery_schedules', 'list_mid_servers', 'list_active_events',
    'run_aggregate_query', 'trend_query',
    'create_ci_relationship', 'cmdb_impact_analysis', 'run_discovery_scan',
    // Discovery run results & infrastructure health
    'list_discovery_runs', 'get_discovery_run', 'list_discovered_devices', 'list_discovery_logs',
    'list_discovery_ranges', 'list_discovery_credentials',
    'list_mid_server_issues', 'list_mid_extension_contexts', 'get_mid_server_health',
    // ACC (Agent Client Collector)
    'list_acc_agents', 'list_acc_policies', 'list_acc_checks',
    // Instance performance diagnostics
    'get_instance_diagnostics', 'get_performance_history',
  ],
  agile_manager: [
    'query_records', 'get_record', 'get_user',
    'create_story', 'update_story', 'list_stories',
    'create_epic', 'update_epic', 'list_epics',
    'create_scrum_task', 'update_scrum_task', 'list_scrum_tasks',
    'list_users',
  ],
  ai_developer: [
    'query_records', 'get_record', 'natural_language_search',
    'nlq_query', 'ai_search', 'generate_summary', 'suggest_resolution', 'categorize_incident',
    'get_virtual_agent_topics', 'trigger_agentic_playbook', 'get_ms_copilot_topics', 'generate_work_notes', 'get_pi_models',
    'search_knowledge', 'get_knowledge_article',
  ],
};

// ─── Annotation classifier ────────────────────────────────────────────────────

/**
 * Tools that only read data — no side effects.
 * Identified by name prefix or exact match.
 */
const READ_ONLY_PREFIXES = [
  'get_', 'list_', 'search_', 'export_', 'preview_', 'query_',
  'check_', 'find_', 'compare_', 'analyze_', 'describe_',
];
const READ_ONLY_EXACT = new Set([
  'nlq_query', 'natural_language_search', 'smart_query', 'trend_query', 'run_aggregate_query',
  'ai_search', 'generate_summary', 'suggest_resolution', 'categorize_incident',
  'cmdb_health_dashboard', 'service_mapping_summary', 'get_devops_insights',
  'ml_detect_anomalies', 'ml_evaluate_model', 'ml_forecast_incidents',
  'ml_model_training_history', 'ml_predict_change_risk', 'ml_process_optimization',
  'ml_virtual_agent_nlu',
]);

/**
 * Destructive tools — deletes, irreversible state transitions.
 */
const DESTRUCTIVE_EXACT = new Set([
  // Deletes
  'delete_attachment', 'delete_system_property', 'delete_uib_page',
  // Irreversible state changes
  'close_incident', 'close_change_request', 'close_csm_case', 'close_hr_case',
  'cancel_request',
  'resolve_incident', 'resolve_problem',
  'retire_asset', 'retire_knowledge_article',
  'rollback_deployment',
  'remove_user_from_group',
  // Code deployment / execution
  'execute_background_script',
  'commit_changeset', 'publish_changeset',
]);

/**
 * Idempotent writes — same call produces the same result.
 */
const WRITE_IDEMPOTENT_PREFIXES = ['update_', 'set_', 'configure_', 'complete_'];
const WRITE_IDEMPOTENT_EXACT = new Set([
  'submit_change_for_approval', 'approve_request', 'reject_request',
  'publish_flow', 'publish_knowledge_article',
  'ensure_active_update_set', 'switch_instance', 'switch_update_set',
  'natural_language_update', 'bulk_set_properties',
  'validate_deployment', 'validate_property', 'validate_artifact',
]);

function annotate(tool: Record<string, any>): Record<string, any> {
  const n: string = tool.name;

  if (DESTRUCTIVE_EXACT.has(n)) {
    return { ...tool, annotations: ANNOTATIONS_DESTRUCTIVE };
  }
  if (READ_ONLY_EXACT.has(n) || READ_ONLY_PREFIXES.some(p => n.startsWith(p))) {
    return { ...tool, annotations: ANNOTATIONS_READ };
  }
  if (WRITE_IDEMPOTENT_EXACT.has(n) || WRITE_IDEMPOTENT_PREFIXES.some(p => n.startsWith(p))) {
    return { ...tool, annotations: ANNOTATIONS_WRITE_IDEMPOTENT };
  }
  return { ...tool, annotations: ANNOTATIONS_WRITE };
}

// ─── All Tool Definitions ─────────────────────────────────────────────────────

/**
 * Single source of truth for every domain module. Each entry pairs the module's
 * tool-definition getter with its execute handler, so {@link ALL_TOOLS} and the
 * name→executor map below can never drift out of sync.
 */
type ToolExecutor = (
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
) => Promise<any>;

interface ToolModule {
  defs: () => Record<string, any>[];
  exec: ToolExecutor;
}

const MODULES: ToolModule[] = [
  { defs: getCoreToolDefinitions, exec: executeCoreToolCall },
  { defs: getIncidentToolDefinitions, exec: executeIncidentToolCall },
  { defs: getProblemToolDefinitions, exec: executeProblemToolCall },
  { defs: getChangeToolDefinitions, exec: executeChangeToolCall },
  { defs: getTaskToolDefinitions, exec: executeTaskToolCall },
  { defs: getKnowledgeToolDefinitions, exec: executeKnowledgeToolCall },
  { defs: getCatalogToolDefinitions, exec: executeCatalogToolCall },
  { defs: getUserToolDefinitions, exec: executeUserToolCall },
  { defs: getReportingToolDefinitions, exec: executeReportingToolCall },
  { defs: getAtfToolDefinitions, exec: executeAtfToolCall },
  { defs: getNowAssistToolDefinitions, exec: executeNowAssistToolCall },
  { defs: getScriptToolDefinitions, exec: executeScriptToolCall },
  { defs: getAgileToolDefinitions, exec: executeAgileToolCall },
  { defs: getHrsdToolDefinitions, exec: executeHrsdToolCall },
  { defs: getCsmToolDefinitions, exec: executeCsmToolCall },
  { defs: getSecurityToolDefinitions, exec: executeSecurityToolCall },
  { defs: getFlowToolDefinitions, exec: executeFlowToolCall },
  { defs: getPortalToolDefinitions, exec: executePortalToolCall },
  { defs: getIntegrationToolDefinitions, exec: executeIntegrationToolCall },
  { defs: getNotificationToolDefinitions, exec: executeNotificationToolCall },
  { defs: getPerformanceToolDefinitions, exec: executePerformanceToolCall },
  { defs: getSysPropertiesToolDefinitions, exec: executeSysPropertiesToolCall },
  { defs: getUpdateSetToolDefinitions, exec: executeUpdateSetToolCall },
  { defs: getVaToolDefinitions, exec: executeVaToolCall },
  { defs: getItamToolDefinitions, exec: executeItamToolCall },
  { defs: getSamToolDefinitions, exec: executeSamToolCall },
  { defs: getDiscoveryToolDefinitions, exec: executeDiscoveryToolCall },
  { defs: getDevopsToolDefinitions, exec: executeDevopsToolCall },
  { defs: getAppStudioToolDefinitions, exec: executeAppStudioToolCall },
  { defs: getMlToolDefinitions, exec: executeMlToolCall },
  { defs: getWorkspaceToolDefinitions, exec: executeWorkspaceToolCall },
  { defs: getMobileToolDefinitions, exec: executeMobileToolCall },
  { defs: getDeploymentToolDefinitions, exec: executeDeploymentToolCall },
  { defs: getUsemToolDefinitions, exec: executeUsemToolCall },
  { defs: getUsemConfigToolDefinitions, exec: executeUsemConfigToolCall },
  { defs: getUsemIntegrationToolDefinitions, exec: executeUsemIntegrationToolCall },
  { defs: getUsemSlaToolDefinitions, exec: executeUsemSlaToolCall },
  { defs: getUsemApprovalToolDefinitions, exec: executeUsemApprovalToolCall },
  { defs: getGrcAuditToolDefinitions, exec: executeGrcAuditToolCall },
  { defs: getGrcComplianceToolDefinitions, exec: executeGrcComplianceToolCall },
  { defs: getGrcRiskToolDefinitions, exec: executeGrcRiskToolCall },
  { defs: getGrcIndicatorToolDefinitions, exec: executeGrcIndicatorToolCall },
  { defs: getSmartQueryToolDefinitions, exec: executeSmartQueryToolCall },
  { defs: getStoreToolDefinitions, exec: executeStoreToolCall },
];

// Name → executor map, built once at module load. Detects duplicate tool names
// across modules (which would otherwise be silently shadowed by the old
// first-non-null-wins linear scan).
const TOOL_EXECUTORS = new Map<string, ToolExecutor>();
const ALL_TOOLS = MODULES.flatMap(module => {
  const defs = module.defs();
  for (const def of defs) {
    if (TOOL_EXECUTORS.has(def.name)) {
      console.error(`[WARN] Duplicate tool name "${def.name}" — later definition ignored.`);
      continue;
    }
    TOOL_EXECUTORS.set(def.name, module.exec);
  }
  return defs;
}).map(annotate);

// ─── Public API ───────────────────────────────────────────────────────────────

export function getTools() {
  const packageName = (process.env.MCP_TOOL_PACKAGE || 'full').toLowerCase();

  if (packageName === 'full') {
    return ALL_TOOLS;
  }

  const allowed = PACKAGE_TOOL_NAMES[packageName];
  if (!allowed) {
    console.error(`[WARN] Unknown MCP_TOOL_PACKAGE "${packageName}". Using "full".`);
    return ALL_TOOLS;
  }

  const allowedSet = new Set(allowed);
  return ALL_TOOLS.filter(t => allowedSet.has(t.name));
}

export async function executeTool(
  client: ServiceNowClient | undefined,
  name: string,
  args: Record<string, any>,
  instanceContext?: InstanceContext,
): Promise<any> {
  // Instance selection belongs to the MCP connection, not the process-wide
  // InstanceManager. These tools therefore bypass domain-module dispatch.
  if (name === 'switch_instance' || name === 'list_instances' || name === 'get_current_instance') {
    if (!instanceContext) {
      throw new ServiceNowError('Instance selection requires an MCP session context.', 'INVALID_REQUEST');
    }
    if (name === 'switch_instance') {
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      instanceContext.switch(args.name);
      return { action: 'switched', active_instance: instanceContext.getCurrentName(), url: instanceContext.getCurrentUrl() };
    }
    if (name === 'list_instances') {
      return { current: instanceContext.getCurrentName(), instances: instanceContext.listAll(), total: instanceContext.listNames().length };
    }
    return { name: instanceContext.getCurrentName(), url: instanceContext.getCurrentUrl(), all_instances: instanceContext.listNames() };
  }

  // O(1) dispatch: look up the owning module's executor by tool name.
  const exec = TOOL_EXECUTORS.get(name);
  if (!exec) {
    throw new ServiceNowError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
  }
  if (!client) {
    throw new ServiceNowError(`Tool ${name} requires a ServiceNow client.`, 'INVALID_REQUEST');
  }

  const result = await exec(client, name, args);
  if (result === null) {
    // The owning module returned null — name is registered but unhandled.
    throw new ServiceNowError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
  }
  return result;
}
