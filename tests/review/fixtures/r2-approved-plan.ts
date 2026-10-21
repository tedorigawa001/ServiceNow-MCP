import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createReviewInstanceBinding } from '../../../src/servicenow/review-release-config.js';
import { r2ApprovalManifestSchema } from '../../../src/review/r2-approval-manifest.js';
import { trustedTempRoot } from '../../fixtures/trusted-temp-root.js';
export function approvedPlanFixture() {
  const now = Date.now(), origin = 'https://approved-fixture.service-now.com', slot = 'approved-pdi';
  const binding = createReviewInstanceBinding(slot, origin);
  const document = { schema_version: 'bp5-r2-approval-0.1',
    approval: { reference: 'PRIVATE_APPROVAL', approved_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 3600000).toISOString() },
    instance_id: slot, instance_binding: binding, callback_uri: 'http://127.0.0.1:18765/bp5/oauth/callback',
    plan: { instanceUrl: origin, clientId: 'PRIVATE_CLIENT', scopes: ['review_read'], expectedUserSysId: '1'.repeat(32), updateSetSysId: 'a'.repeat(32),
      reviewReleaseConfig: { instance_id: slot, assertion: { family: 'Australia', instance_binding: binding,
        asserted_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 3600000).toISOString() } } },
    review: { update_set_sys_id: 'a'.repeat(32), selection_mode: 'review_targets', max_records: 10, requested_rule_ids: ['AU-BR-001'] } };
  const dir = mkdtempSync(join(trustedTempRoot(), 'r2-approved-'));
  chmodSync(dir, 0o700); const path = join(dir, 'manifest.json');
  writeFileSync(path, JSON.stringify(document), { mode: 0o600 });
  const digest = createHash('sha256').update(JSON.stringify(r2ApprovalManifestSchema.parse(document))).digest('hex');
  return { dir, path, document, digest };
}
