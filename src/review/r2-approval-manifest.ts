/** Offline, repository-only approval input. No listener, network, configuration writes or execution grant. */
import { z } from 'zod';
import { inspect } from 'node:util';
import { createHash } from 'node:crypto';
import { isAbsolute, normalize } from 'node:path';
import { readTrustedConfigJson } from '../servicenow/trusted-config-file.js';
import { operatorReleaseConfigSchema, pinReviewReleaseConfig, createReviewInstanceBinding } from '../servicenow/review-release-config.js';
import { bp5RuleIdsSchema } from './result-schema-v2.js';
import { selectionModeSchema } from './target-selection.js';
import { R2_CALLBACK } from './r2-pdi-oauth.js';

export const R2_MANIFEST_MAX_BYTES = 65536;
export const R2_APPROVAL_RUN_MS = 385000;
const id = z.string().regex(/^[a-f0-9]{32}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const scope = z.string().regex(/^[\x21\x23-\x5b\x5d-\x7e]{1,256}$/);
export const r2ApprovalManifestSchema = z.strictObject({
  schema_version: z.literal('bp5-r2-approval-0.1'),
  approval: z.strictObject({ reference: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),
    approved_at: z.iso.datetime(), expires_at: z.iso.datetime() }),
  instance_id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), instance_binding: hash,
  callback_uri: z.literal(R2_CALLBACK),
  plan: z.strictObject({ instanceUrl: z.string().min(1).max(2048), clientId: z.string().regex(/^[\x21-\x7e]{1,256}$/),
    scopes: z.array(scope).min(1).max(16).refine(v => new Set(v).size === v.length && v.join(' ').length <= 1024),
    expectedUserSysId: id, updateSetSysId: id, reviewReleaseConfig: operatorReleaseConfigSchema }),
  review: z.strictObject({ update_set_sys_id: id, selection_mode: selectionModeSchema,
    max_records: z.number().int().min(1).max(100), requested_rule_ids: bp5RuleIdsSchema.refine(v => new Set(v).size === v.length) }),
});
export const r2ApprovalManifestJsonSchema = { ...z.toJSONSchema(r2ApprovalManifestSchema, { target: 'draft-7' }),
  $id: 'urn:servicenow-mcp:r2-approval-manifest:0.1',
  $comment: 'Structure only. Use the trusted loader for file policy, time and binding. Not proof of human approval or permission to execute.' };
type Document = z.infer<typeof r2ApprovalManifestSchema>;
export type R2ManifestFailure = 'manifest_untrusted' | 'manifest_invalid' | 'manifest_unavailable' | 'manifest_consumer_failed'
  | 'approval_expired' | 'approval_validity_insufficient' | 'release_config_expired' | 'release_config_validity_insufficient'
  | 'manifest_binding_mismatch' | 'manifest_clock_invalid' | 'manifest_changed';
export class R2ManifestError extends Error {
  constructor(readonly code: R2ManifestFailure) { super(code); this.name = 'R2ManifestError'; }
}
export interface R2ManifestOptions { /** Trusted test clock, never manifest/MCP input. */ now?: () => number }
type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type R2ApprovedContext = DeepReadonly<{ plan: Document['plan']; review: Document['review'];
  approval: Document['approval']; instance_binding: string }>;
function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
function readDocument(path: string): Document {
  let raw: unknown;
  try {
    if (typeof path !== 'string' || !isAbsolute(path) || normalize(path) !== path || path.length > 4096 || path.includes('\0')) throw Error();
    raw = readTrustedConfigJson(path, { maxBytes: R2_MANIFEST_MAX_BYTES, singleLink: true, uniqueKeys: true });
  } catch { throw new R2ManifestError('manifest_untrusted'); }
  const parsed = r2ApprovalManifestSchema.safeParse(raw);
  if (!parsed.success) throw new R2ManifestError('manifest_invalid');
  return parsed.data;
}
function readNow(now: () => number, minimum = -Infinity): number {
  let at: number;
  try { at = now(); } catch { throw new R2ManifestError('manifest_clock_invalid'); }
  if (!Number.isFinite(at) || !Number.isFinite(at + R2_APPROVAL_RUN_MS) || at < minimum
    || !Number.isFinite(new Date(at).getTime())) throw new R2ManifestError('manifest_clock_invalid');
  return at;
}
function validate(document: Document, at: number) {
  let origin: URL;
  try { origin = new URL(document.plan.instanceUrl); } catch { throw new R2ManifestError('manifest_invalid'); }
  if (origin.protocol !== 'https:' || origin.origin !== document.plan.instanceUrl
    || document.review.update_set_sys_id !== document.plan.updateSetSysId) throw new R2ManifestError('manifest_invalid');
  if (document.instance_id !== document.plan.reviewReleaseConfig.instance_id
    || createReviewInstanceBinding(document.instance_id, document.plan.instanceUrl) !== document.instance_binding) {
    throw new R2ManifestError('manifest_binding_mismatch');
  }
  const approved = Date.parse(document.approval.approved_at), expires = Date.parse(document.approval.expires_at);
  if (approved > at || expires <= approved) throw new R2ManifestError('manifest_invalid');
  if (expires <= at) throw new R2ManifestError('approval_expired');
  if (expires <= at + R2_APPROVAL_RUN_MS) throw new R2ManifestError('approval_validity_insufficient');
  let policy: ReturnType<typeof pinReviewReleaseConfig>;
  try { policy = pinReviewReleaseConfig(document.plan.reviewReleaseConfig, document.plan.instanceUrl,
    new Date(at).toISOString(), R2_APPROVAL_RUN_MS); }
  catch { throw new R2ManifestError('manifest_invalid'); }
  if (policy.issue) throw new R2ManifestError(policy.issue === 'config_binding_mismatch' ? 'manifest_binding_mismatch'
    : policy.issue === 'config_expired' ? 'release_config_expired' : 'release_config_validity_insufficient');
}
class LoadedR2ApprovalManifest {
  #document?: Document;
  #state: 'ready' | 'consumed' | 'closed' = 'ready';
  #path: string;
  #now: () => number;
  #loadedAt: number;
  #digest: string;
  constructor(document: Document, path: string, now: () => number, loadedAt: number) {
    this.#document = document; this.#path = path; this.#now = now; this.#loadedAt = loadedAt;
    this.#digest = createHash('sha256').update(JSON.stringify(document)).digest('hex');
  }
  status() { return { state: this.#state, hasSnapshot: this.#document !== undefined }; }
  toJSON() { return this.status(); }
  [inspect.custom]() { return this.status(); }
  /** One trusted offline consumer; normalized digest is metadata, not execution authorization.
   * No returned context or callback result. Existing one-argument consumers remain unchanged. */
  async consume(consumer: (context: R2ApprovedContext, digest: string) => void | Promise<void>): Promise<{ ok: true } | { ok: false; code: R2ManifestFailure }> {
    if (this.#state !== 'ready' || !this.#document) return { ok: false, code: 'manifest_unavailable' };
    const document = this.#document; this.#document = undefined; this.#state = 'consumed';
    try {
      const current = readDocument(this.#path);
      validate(current, readNow(this.#now, this.#loadedAt));
      if (createHash('sha256').update(JSON.stringify(current)).digest('hex') !== this.#digest) throw new R2ManifestError('manifest_changed');
    } catch (error) {
      this.close(); return { ok: false, code: error instanceof R2ManifestError ? error.code : 'manifest_invalid' };
    }
    const digest = this.#digest;
    this.#path = ''; this.#digest = '';
    try {
      await consumer(freeze({ plan: document.plan, review: document.review, approval: document.approval,
        instance_binding: document.instance_binding }), digest); return { ok: true };
    } catch { return { ok: false, code: 'manifest_consumer_failed' }; }
  }
  close() { this.#document = undefined; this.#path = ''; this.#digest = ''; this.#state = 'closed'; }
}
export function loadR2ApprovalManifest(path: string, options: R2ManifestOptions = {}) {
  const document = readDocument(path);
  const clock = options.now ?? Date.now, at = readNow(clock);
  validate(document, at);
  return new LoadedR2ApprovalManifest(document, path, clock, at);
}
