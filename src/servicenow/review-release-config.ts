/** Server-owned BP-5 settings only. No file loading, request arguments or network I/O. */
import { createHash } from 'node:crypto';
import { z } from 'zod';

const instanceId = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const family = z.enum(['Australia', 'Brazil', 'Zurich', 'Yokohama', 'Xanadu']);
export const operatorReleaseConfigSchema = z.strictObject({ instance_id: instanceId,
  assertion: z.strictObject({ family, instance_binding: z.string().regex(/^[a-f0-9]{64}$/),
    asserted_at: z.iso.datetime(), expires_at: z.iso.datetime(),
    evidence_reference: z.string().min(1).max(2000).optional() }).optional(),
});
export interface OperatorReleaseAssertion {
  readonly source: 'operator_config'; readonly resolution_status: 'asserted';
  readonly visibility_scope: 'operator_configured'; readonly family: z.infer<typeof family>;
  readonly instance_binding: string; readonly config_version: string;
  readonly asserted_at: string; readonly expires_at: string;
}
export type ReleaseConfigIssue = 'config_expired' | 'config_validity_insufficient' | 'config_binding_mismatch';

/** v1 binding: stable server configuration slot + canonical HTTPS origin; no bearer/user/secret. */
export function createReviewInstanceBinding(id: string, instanceUrl: string): string {
  if (!instanceId.safeParse(id).success) throw Error('config_invalid');
  let url: URL;
  try { url = new URL(instanceUrl); } catch { throw Error('config_invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw Error('config_invalid');
  return createHash('sha256').update(JSON.stringify(['servicenow-mcp:bp5-binding:v1', id, url.origin])).digest('hex');
}

export function pinReviewReleaseConfig(raw: unknown, origin: string, startedAt: string, deadlineMs: number): {
  readonly instanceBinding: string; readonly assertion?: OperatorReleaseAssertion; readonly issue?: ReleaseConfigIssue;
} {
  const parsed = operatorReleaseConfigSchema.safeParse(raw === undefined ? { instance_id: 'default' } : raw);
  if (!parsed.success) throw Error('config_invalid');
  const binding = createReviewInstanceBinding(parsed.data.instance_id, origin);
  const a = parsed.data.assertion;
  if (!a) return Object.freeze({ instanceBinding: binding });
  const start = Date.parse(startedAt);
  if (Date.parse(a.asserted_at) > start || Date.parse(a.expires_at) <= Date.parse(a.asserted_at)) throw Error('config_invalid');
  const assertion: OperatorReleaseAssertion = Object.freeze({ source: 'operator_config', resolution_status: 'asserted',
    visibility_scope: 'operator_configured', family: a.family, instance_binding: a.instance_binding,
    config_version: createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex'),
    asserted_at: a.asserted_at, expires_at: a.expires_at });
  const issue = a.instance_binding !== binding ? 'config_binding_mismatch'
    : Date.parse(a.expires_at) <= start ? 'config_expired'
      : Date.parse(a.expires_at) <= start + deadlineMs ? 'config_validity_insufficient' : undefined;
  return Object.freeze({ instanceBinding: binding, assertion, issue });
}
