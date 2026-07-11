# Role-Based Tool Packages

Set `MCP_TOOL_PACKAGE` in your environment to load a role-specific subset of tools instead of the full set. This keeps the tool list focused and relevant for each user role.

## Available Packages

| Package | Target Role | Tool Count |
|---------|-------------|------------|
| `full` | All roles (default) | 400+ |
| `service_desk` | IT help desk agent | 28 |
| `change_coordinator` | Change manager | 19 |
| `knowledge_author` | KB content creator | 13 |
| `catalog_builder` | Catalog administrator | 20 |
| `system_administrator` | SysAdmin | 72 |
| `platform_developer` | Platform developer | 43 |
| `itom_engineer` | ITOM/CMDB engineer | 29 |
| `secops_analyst` | Security Operations / Vulnerability Response analyst | 58 |
| `agile_manager` | Agile team lead | 13 |
| `ai_developer` | Now Assist/AI developer | 15 |
| `portal_developer` | Portal/UI Builder developer | 34 |
| `integration_engineer` | Integration specialist | 31 |
| `devops_engineer` | DevOps/pipeline engineer | 21 |
| `itam_analyst` | IT Asset Management analyst | 23 |

## Usage

```bash
# In .env file
MCP_TOOL_PACKAGE=service_desk

# Or as environment variable
MCP_TOOL_PACKAGE=service_desk node dist/server.js

# In Claude Desktop config
"env": {
  "MCP_TOOL_PACKAGE": "service_desk"
}
```

## Package Definitions

### full
All 400+ tools. Default when `MCP_TOOL_PACKAGE` is not set.

### service_desk
Tools for IT help desk agents handling incidents, requests, and approvals.

Includes:
- All incident tools (create, get, update, resolve, close, work notes, comments)
- All approval tools (list my approvals, approve, reject)
- Knowledge search and retrieval (read-only)
- Catalog browse and order
- SLA tracking
- Task management
- Natural-language search (`natural_language_search`, `smart_query`)
- Core read tools

### change_coordinator
Tools for change managers reviewing and coordinating change requests.

Includes:
- All change request tools
- Approval tools
- Problem management (read + create)
- CMDB CI read tools
- Core read tools

### knowledge_author
Tools for creating and publishing knowledge base content.

Includes:
- Full knowledge base tools (create, update, publish)
- Catalog read tools
- Core read tools

### catalog_builder
Tools for building and managing the service catalog.

Includes:
- Full catalog tools
- User and group read tools
- Core read tools

### system_administrator
Tools for system administrators managing users, groups, schedules, and security.

Includes:
- Full user and group management
- Reporting, analytics, and scheduled job management (create/update/trigger)
- Notifications and email log
- Attachment management (upload, list, delete)
- ACL management
- Performance Analytics and data quality checks
- Instance performance diagnostics (`get_instance_diagnostics`, `get_performance_history`)
- OAuth applications and credential aliases
- System log
- Core read tools

### platform_developer
Tools for platform developers managing scripts, automations, and security rules.

Includes:
- Full scripting tools (business rules, script includes, client scripts)
- UI Policies and UI Actions (create/update)
- ACL rule management
- Changeset management
- ATF testing tools
- Core read tools
- Requires: `SCRIPTING_ENABLED=true`, `ATF_ENABLED=true`

### portal_developer
Tools for Service Portal and UI Builder developers.

Includes:
- Full Service Portal tools (portals, pages, widgets CRUD)
- Next Experience / UI Builder apps and pages
- Portal themes
- UI Policies and UI Actions
- Client script management
- Changeset management
- Core read tools
- Requires: `SCRIPTING_ENABLED=true` (for write tools)

### integration_engineer
Tools for integration and middleware specialists.

Includes:
- REST Message configuration (create/list)
- Transform Map execution and field mapping
- Import Set management
- Event registry and event firing
- OAuth and credential alias read tools
- Changeset management
- Core read tools
- Requires: `WRITE_ENABLED=true`, `SCRIPTING_ENABLED=true` (for register_event)

### itom_engineer
Tools for IT operations and CMDB engineers.

Includes:
- Full CMDB tools (read + create/update with CMDB_WRITE_ENABLED)
- Discovery and MID server tools
- Discovery run results (run history, per-device results, logs, IP ranges, credential metadata)
- MID Server health (issues, health summary with queue backlog)
- ACC (Agent Client Collector) agents, policies, and checks — requires the ACC plugin
- Event management tools
- Service Mapping
- Instance performance diagnostics (`get_instance_diagnostics`, `get_performance_history`) — JVM memory, semaphores, per-node stats, transaction time series
- Core read tools

### secops_analyst
Tools for Security Operations and USEM/Vulnerability Response analysts.

Includes:
- Security Incident Response (create, get, update, list)
- Legacy Vulnerability Response and GRC risk read tools
- USEM core: Vulnerable Items, Remediation Tasks, Vulnerability Groups (read + create/update), NVD entries, posture dashboard (`get_usem_dashboard`)
- USEM/VR configuration rules (`list_usem_rules`, `create_usem_rule`, `update_usem_rule`, `set_usem_rule_active`) and risk-score explanation (`get_risk_calculator_details`)
- USEM/VR integrations (catalog, implementations, runs, logs, parameters with secret masking, enable/disable)
- Remediation SLA / TTR tracking (`list_remediation_sla`, `get_group_sla`, `set_remediation_commitment`) and VR notifications
- VR approvals and exception requests (`list_vr_approvals`, `list_vr_exception_requests`, `act_on_vr_approval`)
- Threat intelligence and integration health
- Core read tools

### agile_manager
Tools for agile team leads managing sprints and backlogs.

Includes:
- Full agile/scrum tools (stories, epics, tasks)
- User read tools
- Core read tools

### ai_developer
Tools for developers building Now Assist and AI integrations.

Includes:
- Full Now Assist tools (NLQ, AI Search, summaries, agentic playbooks)
- Predictive Intelligence tools
- Knowledge read tools
- Core read tools
- Requires: `NOW_ASSIST_ENABLED=true`

### devops_engineer
Tools for DevOps engineers managing CI/CD pipelines and deployment tracking.

Includes:
- DevOps pipeline and deployment tools (list, get, create, track, insights)
- Update Set management (create, switch, complete, preview, export)
- Change request tools (create, get, list)
- Core read tools

### itam_analyst
Tools for IT Asset Management analysts tracking hardware and software assets.

Includes:
- Asset lifecycle tools (list, get, create, update, retire)
- Software license compliance tools
- Asset contract management
- SAM Pro tools (software installs, product catalog, license-position compliance dashboard, software models, EOL/EOS lifecycle reports and master data)
- Core read tools

## Permission Requirements by Package

| Package | WRITE_ENABLED | Additional Flags |
|---------|--------------|-----------------|
| `full` | Depends on use | All flags apply |
| `service_desk` | true (for create/resolve) | — |
| `change_coordinator` | true (for updates) | — |
| `knowledge_author` | true (for create/publish) | — |
| `catalog_builder` | true | — |
| `system_administrator` | true | — |
| `platform_developer` | true | `SCRIPTING_ENABLED=true`, `ATF_ENABLED=true` |
| `itom_engineer` | true | `CMDB_WRITE_ENABLED=true` |
| `agile_manager` | true | — |
| `ai_developer` | false | `NOW_ASSIST_ENABLED=true` |
| `portal_developer` | true | `SCRIPTING_ENABLED=true` |
| `integration_engineer` | true | `SCRIPTING_ENABLED=true` (for register_event) |
| `secops_analyst` | true (for VR writes/approvals) | — |
| `devops_engineer` | true | — |
| `itam_analyst` | true | — |
