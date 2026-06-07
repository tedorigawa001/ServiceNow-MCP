/**
 * Shared JSON Schema fragments for ServiceNow coded fields.
 * Import and spread these into inputSchema.properties to give AI clients
 * machine-readable enum values instead of free-text descriptions.
 *
 * Usage:
 *   import { URGENCY, PRIORITY } from './schema-helpers.js';
 *   ...
 *   urgency: URGENCY,
 *   priority: PRIORITY,
 */

// ─── Coded field schemas ──────────────────────────────────────────────────────

export const URGENCY = {
  type: 'integer',
  enum: [1, 2, 3],
  description: '1=High, 2=Medium, 3=Low',
} as const;

export const IMPACT = {
  type: 'integer',
  enum: [1, 2, 3],
  description: '1=High (enterprise-wide), 2=Medium (department), 3=Low (individual)',
} as const;

export const PRIORITY = {
  type: 'integer',
  enum: [1, 2, 3, 4],
  description: '1=Critical, 2=High, 3=Moderate, 4=Low',
} as const;

export const SEVERITY = {
  type: 'integer',
  enum: [1, 2, 3],
  description: '1=High, 2=Medium, 3=Low',
} as const;

/** Incident state (task.state on the incident table) */
export const INCIDENT_STATE = {
  type: 'integer',
  enum: [1, 2, 3, 4, 6, 7],
  description: '1=New, 2=In Progress, 3=On Hold, 4=Resolved, 6=Closed, 7=Cancelled',
} as const;

/** Problem state */
export const PROBLEM_STATE = {
  type: 'integer',
  enum: [1, 2, 3, 4, 107],
  description: '1=Open, 2=Known Error, 3=Pending Change, 4=Closed/Resolved, 107=Root Cause Known',
} as const;

/** Change request state (stored as strings in ServiceNow) */
export const CHANGE_STATE = {
  type: 'string',
  enum: ['-5', '-4', '-3', '-2', '-1', '0', '1', '3'],
  description: '-5=New, -4=Assess, -3=Authorize, -2=Scheduled, -1=Implement, 0=Review, 1=Closed, 3=Cancelled',
} as const;

/** sc_request state */
export const REQUEST_STATE = {
  type: 'string',
  enum: ['1', '2', '3', '4'],
  description: '1=Open, 2=Closed Complete, 3=Closed Incomplete, 4=Closed Cancelled',
} as const;

/** sc_req_item stage */
export const RITM_STAGE = {
  type: 'string',
  enum: ['request', 'approval', 'fulfillment', 'delivery', 'closed'],
  description: 'request | approval | fulfillment | delivery | closed',
} as const;

/** sc_req_item state */
export const RITM_STATE = {
  type: 'string',
  enum: ['1', '2', '3', '4'],
  description: '1=Open, 2=Work In Progress, 3=Closed Complete, 4=Closed Incomplete',
} as const;

/** sysapproval_approver state */
export const APPROVAL_STATE = {
  type: 'string',
  enum: ['requested', 'approved', 'rejected', 'cancelled'],
  description: 'requested | approved | rejected | cancelled',
} as const;

/** Knowledge article workflow_state */
export const KB_WORKFLOW_STATE = {
  type: 'string',
  enum: ['draft', 'review', 'published', 'retired'],
  description: 'draft | review | published | retired',
} as const;

/** CMDB operational_status */
export const OPERATIONAL_STATUS = {
  type: 'integer',
  enum: [1, 2, 3, 6, 7, 8],
  description: '1=Operational, 2=Non-Operational, 3=Repair in Progress, 6=End of Life, 7=Installed, 8=Decommissioned',
} as const;

/** Asset install_status */
export const ASSET_INSTALL_STATUS = {
  type: 'integer',
  enum: [1, 2, 3, 6, 7, 100, 101, 102, 103, 110],
  description: '1=Installed, 2=On Order, 3=In Maintenance, 6=Retired, 7=Stolen, 100=Missing, 101=In Stock, 102=In Transit, 103=Disposed, 110=Reserved',
} as const;

// ─── Annotation presets ───────────────────────────────────────────────────────

/** Tools that only read data — no side effects. */
export const ANNOTATIONS_READ = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Idempotent writes — calling with the same args produces the same result (updates, approvals). */
export const ANNOTATIONS_WRITE_IDEMPOTENT = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Non-idempotent writes — each call creates/triggers something new. */
export const ANNOTATIONS_WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

/** Destructive writes — deletes, state transitions that are hard to reverse. */
export const ANNOTATIONS_DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;
