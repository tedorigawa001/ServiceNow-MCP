# GRC Tooling — Design Document

Status: **Phase 1 (Audit + Compliance + Risk) implemented and live-verified,
2026-07-12** — see `src/tools/grc-audit.ts`, `grc-compliance.ts`, `grc-risk.ts`.
Investigated against dev400464. This document records what was actually found on
a live instance before committing to a tool design, following the same practice
used for the USEM buildout (see `ROADMAP.md` #11).

---

## 1. What is actually installed

GRC is split across three separately-licensed ServiceNow apps. All three turned out to
be installed on dev400464, but this was **not** knowable from documentation alone —
an earlier pass wrongly assumed Risk Management and Audit Management were absent
because their tables didn't resolve on a stale token/cache; a second check after
re-authenticating found all three families present.

| App | Table prefix | Status on dev400464 |
|---|---|---|
| Policy and Compliance Management | `sn_compliance_*`, `sn_grc_*` (shared platform) | **Demo data imported 2026-07-12** — now well-seeded: `sn_grc_profile` (Entity): 171, `sn_compliance_policy`: 8, `sn_compliance_control`: **1111**, `sn_compliance_policy_statement` (Control Objective): **1203**, `sn_compliance_policy_exception`: 29, `sn_grc_issue`: 122, `sn_grc_task`: 12, `sn_compliance_authority_document`: 8, `sn_compliance_citation`: 2888. Still empty: `sn_grc_issue_source` (0 — but see note below, the field it backs is *not* actually blocked), `sn_grc_indicator` (0, Indicator/KRI module not seeded). |
| Risk Management | `sn_risk_*` | **Demo data confirmed 2026-07-12** — `sn_risk_risk`: **419** records (number prefix `RK`), `sn_risk_definition`: **63** records (broader than the CIA-triad sample first seen — includes e.g. Change Management, Vendor Quality). `state` is a workflow-state string (`Assess`, `Monitor`, …, confirming the "not a flat integer choice" hypothesis below); `score` is a pre-formatted display string (`"4 - High"`); `short_description` is unused (null on sampled records) — `statement` (ref to `sn_risk_definition`) is the effective title. |
| Audit Management | `sn_audit_*` | Installed **with substantial demo data** (counts re-verified 2026-07-12, higher than first checked — see §2 Audit table for the current per-table breakdown and subclass note) |

Vendor Risk Management (`com.snc.grc_vrm_dep`) dependency plugin is active but no
`sn_vendor_*`/VRM-specific tables were found — likely not in scope unless a
separate VRM app subscription is added later. **Out of scope for this design.**

### Existing broken tools (`src/tools/security.ts`)

Six pre-existing GRC tools were built without live verification and are wrong in
several ways now confirmed against the real schema:

| Tool | Table used | Verdict |
|---|---|---|
| `list_grc_risks` / `get_grc_risk` | `sn_risk_risk` | Table name correct; needs no `number` field assumption fix (task-derived, uses standard task numbering — verify prefix) |
| `list_grc_controls` | `sn_compliance_control` | Table name correct |
| `list_compliance_policies` | `sn_compliance_policy` | Table name correct |
| `create_grc_risk` | `sn_risk_risk` | **Wrong fields** — writes `name`, `category`, `owner` as plain strings; the real table has no `category`/`owner`/`name` columns of that shape. `impact`/`likelihood` are `reference` fields (point at a scale table, likely `sn_risk_criteria`), not free strings. No write-field allowlist at all (same mass-assignment gap fixed elsewhere in 1.4.0). |
| `get_compliance_assessment` | `sn_compliance_assessment` | **Table does not exist.** Dead code. |
| `list_audit_results` | `sn_audit_result` | **Table does not exist.** The real equivalent is `sn_audit_control_test` (a control test executed within an engagement) or `sn_audit_task`. Dead code. |

**Decision needed:** retire `get_compliance_assessment` and `list_audit_results`
outright (no valid table to point them at), and rewrite `create_grc_risk` with a
correct field set once the Risk phase is scoped.

---

## 2. Real schema, by module

**Not all core GRC tables extend `task`** — inheritance was checked per-table via
`sys_db_object.super_class` and turns out to vary:

| Table | `super_class` | Task-derived? |
|---|---|---|
| `sn_grc_task` | `planned_task` → `task` | Yes, via `planned_task` |
| `sn_compliance_control` | `sn_grc_item` (base, no parent) | No |
| `sn_compliance_policy` | `sn_grc_document` (base, no parent) | No |
| `sn_compliance_policy_statement` | `sn_grc_content` (base, no parent) | No |
| `sn_risk_definition` | `sn_grc_content` (base, no parent) | No |
| `sn_grc_profile` | none (base table) | No |
| `sn_risk_criteria` | none (base table) | No |

Several of these non-task tables still carry task-*like* columns (`short_description`,
`assignment_group`, `priority`, `close_notes`, `sys_class_name`, etc.) — but that's
because `sn_grc_item`/`sn_grc_document`/`sn_grc_content` independently define similar
fields, not because they inherit from `task`. Do not assume `task`-family helpers
(e.g. any shared "close a task" utility) apply across GRC tables without checking the
specific table's own hierarchy. Fields listed below are the fields actually present
on each table via `sys_dictionary`, regardless of where they come from.

### Policy and Compliance Management

| Table | Label | Key fields | Notes |
|---|---|---|---|
| `sn_grc_profile` | Entity | `profile_class` (required ref → **`sn_grc_profile_class`**, not `sn_grc_profile_type`), `owned_by` (required ref), `name` (required) | The "thing being assessed" — business unit, vendor, application, process. 171 seeded records. `sn_grc_profile_class` has **18** rows and is the correct class-resolution table for a `create_entity`/`update_entity` tool; `sn_grc_profile_type` (6 rows) is a *different*, unrelated table and must not be used for class-name lookups. |
| `sn_compliance_policy` | Policy | `approval_method` (required choice), `kb_knowledge_base` (required ref), `policy_category`, `audience` | |
| `sn_compliance_policy_statement` | Control Objective | `authority_section`, `compliance_score`, `owning_groups` | Sits between Policy and Control |
| `sn_compliance_control` | Control | `key_control` (bool), `frequency`, `assessment_method`, `enforcement`, `failed_indicators`/`passed_indicators` | |
| `sn_compliance_policy_exception` | Policy Exception | `policy_statement` (ref), `issue` (ref), `risk_rating`, `override_risk_rating`, `requested_valid_to` | Ties into both compliance and the Issue/Risk side |
| `sn_grc_issue` | Issue | `profile` (ref to Entity), `issue_type`, `issue_source` (glide_list → **`sn_grc_choice`**), `classification`, `action_plan` (html), `recommendation` | Generic finding/gap record — NOT the same thing as `sn_risk_risk`; used for compliance gaps and audit findings, not quantified risk. **Correction**: `issue_source` does not reference the empty `sn_grc_issue_source` table — it's a `glide_list` against `sn_grc_choice`, which is populated (e.g. `control_test`/`control_objective`/`control` category rows, and issue-source values such as "Control Test Failure" confirmed present). `sn_grc_issue_source` being 0 rows does **not** mean Issue Source data is missing. |
| `sn_grc_task` | Remediation Task | Standard task; links out via `parent` | Remediation actions against Issues/Controls/Exceptions |
| `sn_grc_indicator` | Indicator (KRI/KPI) | `entity` (required ref), `category` | Periodic metric tied to an Entity |
| `sn_compliance_authority_document` / `sn_compliance_citation` | Regulatory content library | — | Maps external regulations to Controls; read-heavy, lower priority |

### Risk Management

| Table | Label | Key fields | Notes |
|---|---|---|---|
| `sn_risk_risk` | Risk | `statement` (ref → `sn_risk_definition`), `impact`/`likelihood` (ref, inherent), `residual_impact`/`residual_likelihood`, `score`/`residual_score` (ref, calculated), `inherent_ale`/`sle`/`aro`, `residual_ale`/`sle`/`aro` (currency/decimal — quantitative FAIR-style risk), `source_record`+`table` (polymorphic `document_id` — what the risk is *about*), `response`, `acceptance_state` | Quantitative risk model (Annualized Loss Expectancy / Single Loss Expectancy / Annual Rate of Occurrence), not a simple 1–5 severity score |
| `sn_risk_definition` | Risk Statement (library) | `impact`/`likelihood` (default refs), `default_inherent_sle`/`aro` | Reusable risk statement catalog — **63 seeded rows** (not just the CIA-triad 3 first sampled; also includes e.g. Change Management, Vendor Quality). Super_class `sn_grc_content` (see §3 inheritance table) — not task-derived. |
| `sn_risk_criteria` | Risk Criteria (scale) | — | 15 seeded rows — almost certainly the Impact/Likelihood scale that `sn_risk_risk.impact` etc. reference |
| `sn_risk_mitigation_task` / `sn_risk_response_task` / `sn_risk_acceptance_task` / `sn_risk_avoidance_task` / `sn_risk_transfer_task` | Risk response task family | — | One table per response strategy (mitigate/accept/avoid/transfer) — mirrors the standard 4 risk-treatment strategies |
| `sn_risk_risk_triage` | Triage | — | Pre-risk intake step |

### Audit Management

Counts re-verified 2026-07-12 (higher than the first pass — instance data grew between checks):

| Table | Label | Count | Key fields | Notes |
|---|---|---|---|---|
| `sn_audit_engagement` | Engagement (audit project) | 23 | `engagement_type` (required choice), `auditors`/`approvers` (glide_list), `audit_period_start`/`end` (required dates), `opinion`, `result` | Top-level audit unit |
| `sn_audit_task` | Audit task (base/parent class) | **0 direct** | `sn_audit_engagement` (ref) | **Correction**: `sn_audit_task` itself has 0 *direct* records — it's a base class. The `sn_audit_task` table API count (99) reflects records that actually live in its **subclasses**: `sn_audit_control_test` (85) + `sn_audit_activity` (7) + `sn_audit_interview` (3) + `sn_audit_walkthrough` (4) = 99. Query the subclass tables directly for real data, not `sn_audit_task` alone. |
| `sn_audit_control_test` | Control test | 85 | `control` (ref), `test_plan` (ref), `issue` (ref), `design_effectiveness`/`operation_effectiveness`, `actual_results`, `opinion` | Subclass of `sn_audit_task`. This is the real "audit result" concept. |
| `sn_audit_test_plan` | Test plan | 353 | — | Largest dataset in GRC |
| `sn_audit_interview` / `sn_audit_walkthrough` / `sn_audit_activity` | Engagement sub-artifacts (subclasses of `sn_audit_task`) | 3 / 4 / 7 | — | Small seeded sets |

---

## 3. Architectural notes carried over from the finding

- **State model confirmed to differ from USEM.** USEM used a flat integer `state`
  choice (`VUL_STATE_LABELS`). Sampled `sn_risk_risk` records show `state` as a
  workflow-state string (`Assess`, `Monitor`, …) driven by `sn_grc_workspace_state_model`
  / `workflow_state`, not a fixed integer choice list. **Do not port the
  `VUL_STATE_LABELS`/`stateClause` pattern as-is** — enumerate the real state values
  per table (via `sysparm_display_value=all` sampling, as done here) before writing
  any state-filter helper. `score` fields are similarly pre-formatted display strings
  (`"4 - High"`), not raw numbers — filtering/sorting by risk score will need the
  underlying numeric field, not the display value.
- **Master-data gap mostly resolved.** After the 2026-07-12 Compliance demo-data
  import, `sn_grc_profile_class` (the real Entity-class reference target — 18 rows;
  **not** `sn_grc_profile_type`, which is a separate, unrelated 6-row table) is
  populated and Entity/Policy/Control/Control Objective/Issue/Policy Exception all
  have real records — Compliance is no longer blocked and can be verified end-to-end
  today. `sn_grc_indicator` remains empty; Indicator (KRI) work still needs seed data
  or synthetic test records. `sn_grc_issue_source` (the table) is also empty, but
  `sn_grc_issue.issue_source` doesn't reference it — see the Issue row in §2, the
  actual backing table (`sn_grc_choice`) has real data.
- **`sn_risk_risk` is a quantitative model**, not a simple severity score — `impact`/
  `likelihood` are references into a criteria/scale table, and there are parallel
  inherent/residual/original variants for ALE/SLE/ARO.
- **CONFIRMED (2026-07-12, live create/PATCH round trips on dev400464): most
  `sn_risk_risk` fields cannot be set via the REST Table API at all.**
  `impact`/`likelihood`/`residual_impact`/`residual_likelihood`/`score`/
  `residual_score` are unconditionally overwritten by a business rule on every
  insert *and* update — explicitly POSTing/PATCHing a specific `sn_risk_criteria`
  sys_id was silently reset to the lowest-order value on the next read, both with
  and without a `statement` set. Separately, `justification`, `response`, and
  `classification` return HTTP 200 on write but the value never persists (re-read
  shows the old/empty value). `owner` is auto-synced from the related Entity's
  owner (see the `sync_with_entity_owner` field) rather than settable directly.
  Only `statement`, `profile`, `category` (auto-resolves a plain string into a
  `sn_grc_choice` reference), and `owning_group` were confirmed to actually
  persist. `grc-risk.ts`'s `RISK_FIELDS` allowlist reflects only the confirmed-safe
  set — see the file's header comment for the full test log. This is a materially
  bigger platform-enforced read-only surface than USEM's VI/vulnerability-clearing
  quirk; a future phase would need to find the platform's actual risk-assessment
  workflow (likely via `calculated_risk_factor`/`indicator_failure_factor`/
  `control_failure_factor`) rather than assume direct field writes work.
- **Audit has the most real data already** (Engagement → Task → Control Test →
  Test Plan chain, all populated). This is the best-understood, most testable module
  and a reasonable Phase 1 candidate specifically *because* it's verifiable end-to-end
  today without seeding master data.

---

## 4. Proposed scope and phasing (draft — pending approval)

Following the USEM precedent (`usem.ts` + `usem-config.ts` + `usem-approval.ts` +
`usem-sla.ts`), split by module rather than one large file:

- `grc-risk.ts` — Risk, Risk Statement library, response tasks (mitigate/accept/
  avoid/transfer)
- `grc-audit.ts` — Engagement, Audit Task, Control Test, Test Plan
- `grc-compliance.ts` — Policy, Control, Control Objective, Policy Exception, Issue,
  Entity (Profile), Indicator, Remediation Task

| Phase | Scope | Why this order |
|---|---|---|
| 1 | **Audit**: `list/get_audit_engagement`, `list/get_control_test` (+ activity/interview/walkthrough subclasses), dashboard | Richest seeded chain (353 test plans / 85 control tests / 23 engagements) — testable today, no master-data dependency. Note: query the `sn_audit_task` subclasses directly (`sn_audit_control_test` etc.), not the 0-record base table. |
| 1 | **Compliance**: `list/get/create/update` for Policy, Control, Control Objective (Policy Statement), Policy Exception, Entity (Profile), Issue | Promoted from Phase 3 — the 2026-07-12 demo-data import removed the `sn_grc_profile_class` blocker and seeded 171 Entities / 1111 Controls / 1203 Control Objectives / 122 Issues / 29 Exceptions. Equally verifiable now, and the more commonly requested "GRC" surface. |
| 1 | **Risk**: `list/get/create/update_risk`, `list_risk_statements` (read the library) | Promoted from Phase 2 — `sn_risk_risk` confirmed to have 419 real records (number prefix `RK`) as of 2026-07-12, so full round-trip verification is possible immediately. Needs the workflow-state and display-vs-raw-score handling noted above (different from USEM's `VUL_STATE_LABELS` pattern). Response-task tools (mitigate/accept/avoid/transfer) can follow once the core Risk CRUD is verified. |
| 2 | **Indicator (KRI)**: `sn_grc_indicator` + results | Still 0 records — lowest priority until seeded or synthetic test data is created |
| — | Retire `get_compliance_assessment`, `list_audit_results` from `security.ts`; rewrite `create_grc_risk` with a correct allowlist as part of the Risk phase | Cleanup, not new scope |

Each phase to include: write-field allowlists + `additionalProperties: false` schema
(per the now-standard pattern), `sanitizeLikeValue` on filter values, `requireWrite()`
gates, live PDI verification of at least one create→read round trip per table family,
tests, and `docs/TOOLS.md`/`TOOL_PACKAGES.md` updates.

---

## 5. Open questions for approval

1. ~~Does the phase order match priority?~~ **Resolved by the 2026-07-12 Compliance
   demo-data import** — Compliance is now promoted to Phase 1 alongside Audit (see
   updated phase table above).
2. ~~Should Entity classification master data be seeded now?~~ **Resolved** —
   `sn_grc_profile_class` (the correct reference target, not `sn_grc_profile_type`)
   now has 18 rows; Entity work is unblocked.

All remaining open questions are deferred — see Backlog below.

---

## 6. Backlog (deferred, not blocking Phase 1/2)

| Item | Question | Notes |
|---|---|---|
| Vendor Risk Management scope | Is VRM explicitly out of scope, or a later phase if that app gets subscribed? | `com.snc.grc_vrm_dep` dependency plugin is active but no VRM feature tables exist yet. Revisit if/when a VRM app subscription is added. |
| Tool package for GRC | New `grc_analyst` package, or fold GRC tools into `secops_analyst`? | Defer until Phase 1 tool set is implemented and its size is known. |
| `sn_grc_indicator` seeding | Seed before Indicator (Phase 2) work starts, or treat as blocked until real data exists? | Does not block Phase 1 (Audit/Compliance/Risk). Revisit when the Indicator phase is scheduled. (`sn_grc_issue_source` is a non-issue — `sn_grc_issue.issue_source` references the already-populated `sn_grc_choice` table instead, per the correction in §2/§3.) |
