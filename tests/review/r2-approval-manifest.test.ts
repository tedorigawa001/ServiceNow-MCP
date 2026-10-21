import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadR2ApprovalManifest, r2ApprovalManifestJsonSchema } from '../../src/review/r2-approval-manifest.js';
import { createReviewInstanceBinding } from '../../src/servicenow/review-release-config.js';
import { R2_CALLBACK } from '../../src/review/r2-pdi-oauth.js';
import { inspect } from 'node:util';
import { trustedTempRoot } from '../fixtures/trusted-temp-root.js';

const now = Date.parse('2026-10-18T00:00:00Z');
const origin = 'https://approval-fixture.service-now.com', slot = 'r2-pdi';
const user = '1'.repeat(32), parent = 'a'.repeat(32);
const supported = process.platform === 'darwin' || (process.platform === 'linux' && existsSync('/usr/bin/getfacl'));
let dir: string, file: string;
const document = () => ({ schema_version: 'bp5-r2-approval-0.1',
  approval: { reference: 'APPROVAL_PRIVATE_REF', approved_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 3600000).toISOString() },
  instance_id: slot, instance_binding: createReviewInstanceBinding(slot, origin), callback_uri: R2_CALLBACK,
  plan: { instanceUrl: origin, clientId: 'APPROVAL_PRIVATE_CLIENT', scopes: ['review_read'], expectedUserSysId: user, updateSetSysId: parent,
    reviewReleaseConfig: { instance_id: slot, assertion: { family: 'Australia', instance_binding: createReviewInstanceBinding(slot, origin),
      asserted_at: new Date(now - 2000).toISOString(), expires_at: new Date(now + 3600000).toISOString() } } },
  review: { update_set_sys_id: parent, selection_mode: 'review_targets', max_records: 20,
    requested_rule_ids: ['AU-BR-001', 'AU-BR-002', 'AU-CL-004'] } });
beforeEach(() => {
  dir = mkdtempSync(join(trustedTempRoot(), 'r2-approval-'));
  chmodSync(dir, 0o700); file = join(dir, 'approval.json');
});
afterEach(() => { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); });

it('exports a strict structural JSON contract without claiming file or human approval validation', () => {
  expect(r2ApprovalManifestJsonSchema.additionalProperties).toBe(false);
  expect(r2ApprovalManifestJsonSchema.required).toContain('instance_binding');
  expect(r2ApprovalManifestJsonSchema.$comment).toContain('Not proof of human approval');
  for (const key of ['approval', 'plan', 'review']) {
    expect(r2ApprovalManifestJsonSchema.properties?.[key]).toHaveProperty('additionalProperties', false);
  }
});

it('accepts observed-only release input without treating it as measured or matched evidence', async () => {
  const value = document();
  Reflect.deleteProperty(value.plan.reviewReleaseConfig, 'assertion');
  writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
  if (!supported) { expect(() => loadR2ApprovalManifest(file, { now: () => now })).toThrow('manifest_untrusted'); return; }
  const loaded = loadR2ApprovalManifest(file, { now: () => now });
  expect(await loaded.consume(context => {
    expect(context.plan.reviewReleaseConfig).toEqual({ instance_id: slot });
    expect(context).not.toHaveProperty('release_match');
  })).toEqual({ ok: true });
});

it('loads a trusted fixed plan offline and hands out an immutable snapshot once without returning it', async () => {
  writeFileSync(file, JSON.stringify(document()), { mode: 0o600 });
  if (!supported) { expect(() => loadR2ApprovalManifest(file, { now: () => now })).toThrow('manifest_untrusted'); return; }
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('NETWORK_FORBIDDEN'));
  const loaded = loadR2ApprovalManifest(file, { now: () => now });
  expect(loaded.status()).toEqual({ state: 'ready', hasSnapshot: true });
  let called = 0;
  expect(await loaded.consume(context => {
    called++; expect(context.plan.instanceUrl).toBe(origin); expect(context.plan.expectedUserSysId === user).toBe(true);
    expect(context.review.update_set_sys_id === parent).toBe(true); expect(Object.isFrozen(context.plan)).toBe(true);
    expect(Object.isFrozen(context.plan.scopes)).toBe(true);
  })).toEqual({ ok: true });
  expect(await loaded.consume(() => { called++; })).toEqual({ ok: false, code: 'manifest_unavailable' });
  expect(called).toBe(1); expect(fetcher).not.toHaveBeenCalled();
  expect(loaded.status()).toEqual({ state: 'consumed', hasSnapshot: false });
});

it.each([
  ['expired_approval', 'approval_expired'], ['approval_boundary', 'approval_validity_insufficient'],
  ['future_approval', 'manifest_invalid'], ['expired_release', 'release_config_expired'],
  ['release_boundary', 'release_config_validity_insufficient'], ['future_release', 'manifest_invalid'],
] as const)('rejects %s before a plan can be consumed', (kind, reason) => {
  const value = document();
  if (kind === 'expired_approval') value.approval.expires_at = new Date(now).toISOString();
  if (kind === 'approval_boundary') value.approval.expires_at = new Date(now + 385000).toISOString();
  if (kind === 'future_approval') value.approval.approved_at = new Date(now + 1).toISOString();
  if (kind === 'expired_release') value.plan.reviewReleaseConfig.assertion.expires_at = new Date(now).toISOString();
  if (kind === 'release_boundary') value.plan.reviewReleaseConfig.assertion.expires_at = new Date(now + 385000).toISOString();
  if (kind === 'future_release') value.plan.reviewReleaseConfig.assertion.asserted_at = new Date(now + 1).toISOString();
  writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
  expect(() => loadR2ApprovalManifest(file, { now: () => now })).toThrow(supported ? reason : 'manifest_untrusted');
});

it.each(['manifest_hash', 'slot', 'origin', 'release_slot', 'release_hash', 'review_target', 'noncanonical_origin'] as const)(
  'rejects a mismatched binding/target: %s', kind => {
    const value = document();
    if (kind === 'manifest_hash') value.instance_binding = 'f'.repeat(64);
    if (kind === 'slot') value.instance_id = 'other';
    if (kind === 'origin') value.plan.instanceUrl = 'https://other.service-now.com';
    if (kind === 'release_slot') value.plan.reviewReleaseConfig.instance_id = 'other';
    if (kind === 'release_hash') value.plan.reviewReleaseConfig.assertion.instance_binding = 'f'.repeat(64);
    if (kind === 'review_target') value.review.update_set_sys_id = 'b'.repeat(32);
    if (kind === 'noncanonical_origin') value.plan.instanceUrl += '/';
    writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
    const reason = ['review_target', 'noncanonical_origin'].includes(kind) ? 'manifest_invalid' : 'manifest_binding_mismatch';
    expect(() => loadR2ApprovalManifest(file, { now: () => now })).toThrow(supported ? reason : 'manifest_untrusted');
  });

it.each([0o644, 0o640, 0o620, 0o666, 0o700])('rejects mode %i without repairing the fixture', mode => {
  writeFileSync(file, JSON.stringify(document()), { mode: 0o600 }); chmodSync(file, mode);
  expect(() => loadR2ApprovalManifest(file, { now: () => now })).toThrow('manifest_untrusted');
  expect(statSync(file).mode & 0o777).toBe(mode);
});
it('rejects an owner mismatch using a synthetic process-UID boundary, without changing file ownership', () => {
  writeFileSync(file, JSON.stringify(document()), { mode: 0o600 });
  if (process.getuid) vi.spyOn(process, 'getuid').mockReturnValue(process.getuid() + 1);
  expect(() => loadR2ApprovalManifest(file, { now: () => now })).toThrow('manifest_untrusted');
});
it('rejects writable ancestors and symlinks at the file or directory level', () => {
  writeFileSync(file, JSON.stringify(document()), { mode: 0o600 });
  chmodSync(dir, 0o777);
  expect(() => loadR2ApprovalManifest(file, { now: () => now })).toThrow('manifest_untrusted'); chmodSync(dir, 0o700);
  if (process.platform === 'win32') return;
  const linked = join(dir, 'link.json'); symlinkSync(file, linked);
  expect(() => loadR2ApprovalManifest(linked, { now: () => now })).toThrow('manifest_untrusted');
  const parent = join(dir, 'real'); mkdirSync(parent, { mode: 0o700 });
  writeFileSync(join(parent, 'approval.json'), JSON.stringify(document()), { mode: 0o600 });
  const linkDir = join(dir, 'linked-dir'); symlinkSync(parent, linkDir);
  expect(() => loadR2ApprovalManifest(join(linkDir, 'approval.json'), { now: () => now })).toThrow('manifest_untrusted');
});
it('rejects hard-linked approvals', () => {
  writeFileSync(file, JSON.stringify(document()), { mode: 0o600 }); linkSync(file, join(dir, 'copy.json'));
  expect(() => loadR2ApprovalManifest(file, { now: () => now })).toThrow('manifest_untrusted');
});
it('bounds the file to 64KiB instead of the legacy 1MiB config ceiling', () => {
  const json = JSON.stringify(document());
  writeFileSync(file, json.padEnd(65537, ' '), { mode: 0o600 });
  expect(() => loadR2ApprovalManifest(file, { now: () => now })).toThrow('manifest_untrusted');
  writeFileSync(file, json.padEnd(65536, ' '));
  if (supported) { const loaded = loadR2ApprovalManifest(file, { now: () => now }); loaded.close(); }
  else expect(() => loadR2ApprovalManifest(file, { now: () => now })).toThrow('manifest_untrusted');
});
it.each(['top', 'nested', 'escaped'] as const)('rejects duplicate JSON keys (%s), even when the last value is valid', kind => {
  let json = JSON.stringify(document());
  if (kind === 'top') json = json.replace('"instance_id":"r2-pdi"', '"instance_id":"r2-pdi","instance_id":"r2-pdi"');
  if (kind === 'nested') json = json.replace('"max_records":20', '"max_records":20,"max_records":21');
  if (kind === 'escaped') json = json.replace('"max_records":20', '"max_records":20,"max_\\u0072ecords":21');
  writeFileSync(file, json, { mode: 0o600 });
  expect(() => loadR2ApprovalManifest(file, { now: () => now })).toThrow('manifest_untrusted');
});

it.each(['expired', 'approval_margin', 'release_margin', 'clock_backwards', 'clock_nan', 'changed', 'unsafe'] as const)(
  'revalidates the file and time before consumption (%s)', async kind => {
    const value = document();
    if (kind === 'approval_margin') value.approval.expires_at = new Date(now + 400000).toISOString();
    if (kind === 'release_margin') value.plan.reviewReleaseConfig.assertion.expires_at = new Date(now + 400000).toISOString();
    writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
    if (!supported) { expect(() => loadR2ApprovalManifest(file, { now: () => now })).toThrow('manifest_untrusted'); return; }
    let at = now; const loaded = loadR2ApprovalManifest(file, { now: () => at });
    if (kind === 'expired') at += 3600000;
    if (kind === 'approval_margin' || kind === 'release_margin') at += 15000;
    if (kind === 'clock_backwards') at--;
    if (kind === 'clock_nan') at = NaN;
    if (kind === 'changed') { value.approval.reference = 'CHANGED'; writeFileSync(file, JSON.stringify(value)); }
    if (kind === 'unsafe') chmodSync(file, 0o644);
    const consume = vi.fn();
    const code = { expired: 'approval_expired', approval_margin: 'approval_validity_insufficient', release_margin: 'release_config_validity_insufficient',
      clock_backwards: 'manifest_clock_invalid', clock_nan: 'manifest_clock_invalid', changed: 'manifest_changed', unsafe: 'manifest_untrusted' }[kind];
    expect(await loaded.consume(consume)).toEqual({ ok: false, code }); expect(consume).not.toHaveBeenCalled();
    expect(loaded.status().hasSnapshot).toBe(false);
  });

it.each([
  ['unknown', (v: Record<string, unknown>) => { v.unknown = 'APPROVAL_PRIVATE_SECRET'; }],
  ['bearer', (v: Record<string, unknown>) => { (v.plan as Record<string, unknown>).bearerToken = 'APPROVAL_PRIVATE_SECRET'; }],
  ['client_secret', (v: Record<string, unknown>) => { (v.plan as Record<string, unknown>).clientSecret = 'APPROVAL_PRIVATE_SECRET'; }],
  ['module', (v: Record<string, unknown>) => { v.module = './arbitrary.js'; }],
  ['callback', (v: Record<string, unknown>) => { v.callback_uri = 'http://localhost:18765/bp5/oauth/callback'; }],
  ['callback_port', (v: Record<string, unknown>) => { v.callback_uri = 'http://127.0.0.1:18766/bp5/oauth/callback'; }],
  ['user', (v: Record<string, unknown>) => { (v.plan as Record<string, unknown>).expectedUserSysId = 'admin'; }],
  ['client', (v: Record<string, unknown>) => { (v.plan as Record<string, unknown>).clientId = ''; }],
  ['scopes', (v: Record<string, unknown>) => { (v.plan as Record<string, unknown>).scopes = ['a', 'a']; }],
  ['scope_space', (v: Record<string, unknown>) => { (v.plan as Record<string, unknown>).scopes = ['a b']; }],
  ['records', (v: Record<string, unknown>) => { (v.review as Record<string, unknown>).max_records = 101; }],
  ['missing_limit', (v: Record<string, unknown>) => { delete (v.review as Record<string, unknown>).max_records; }],
  ['missing_rules', (v: Record<string, unknown>) => { delete (v.review as Record<string, unknown>).requested_rule_ids; }],
  ['missing_selection', (v: Record<string, unknown>) => { delete (v.review as Record<string, unknown>).selection_mode; }],
  ['rules', (v: Record<string, unknown>) => { (v.review as Record<string, unknown>).requested_rule_ids = ['AU-BR-001', 'AU-BR-001']; }],
  ['unimplemented_rule', (v: Record<string, unknown>) => { (v.review as Record<string, unknown>).requested_rule_ids = ['AU-SI-002']; }],
  ['query', (v: Record<string, unknown>) => { (v.review as Record<string, unknown>).query = 'active=true'; }],
  ['reference', (v: Record<string, unknown>) => { (v.approval as Record<string, unknown>).reference = ''; }],
] as const)('rejects strict schema violation: %s', (_name, change) => {
  const value: Record<string, unknown> = document(); change(value);
  writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
  expect(() => loadR2ApprovalManifest(file, { now: () => now })).toThrow(supported ? 'manifest_invalid' : 'manifest_untrusted');
});

it.each(['relative', 'dot_segments', 'missing', 'directory', 'invalid_utf8', 'malformed'] as const)('rejects unsafe input: %s', kind => {
  let path = file;
  writeFileSync(file, JSON.stringify(document()), { mode: 0o600 });
  if (kind === 'relative') path = 'approval.json';
  if (kind === 'dot_segments') path = dir + '/sub/../approval.json';
  if (kind === 'missing') path = join(dir, 'missing.json');
  if (kind === 'directory') path = dir;
  if (kind === 'invalid_utf8') writeFileSync(file, new Uint8Array([0xff]));
  if (kind === 'malformed') writeFileSync(file, 'APPROVAL_PRIVATE_MALFORMED');
  expect(() => loadR2ApprovalManifest(path, { now: () => now })).toThrow('manifest_untrusted');
});

it('keeps file contents unchanged and serializes no approval references, IDs, configuration or error detail', async () => {
  writeFileSync(file, JSON.stringify(document()), { mode: 0o600 }); const before = readFileSync(file);
  if (!supported) { expect(() => loadR2ApprovalManifest(file)).toThrow('manifest_untrusted'); return; }
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true), stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const loaded = loadR2ApprovalManifest(file, { now: () => now });
  let visible = JSON.stringify(loaded) + inspect(loaded);
  const result = await loaded.consume(() => { throw Error('APPROVAL_PRIVATE_CONSUMER'); });
  expect(result).toEqual({ ok: false, code: 'manifest_consumer_failed' });
  visible += JSON.stringify([result, loaded.status(), loaded]) + inspect(loaded);
  for (const secret of ['APPROVAL_PRIVATE', user, parent, origin, file]) expect(visible.includes(secret)).toBe(false);
  expect(stdout).not.toHaveBeenCalled(); expect(stderr).not.toHaveBeenCalled();
  expect(readFileSync(file).equals(before)).toBe(true); loaded.close();
});

it('sanitizes asynchronous consumer rejections instead of returning success or leaking rejected promises', async () => {
  writeFileSync(file, JSON.stringify(document()), { mode: 0o600 });
  if (!supported) { expect(() => loadR2ApprovalManifest(file)).toThrow('manifest_untrusted'); return; }
  const loaded = loadR2ApprovalManifest(file, { now: () => now });
  expect(await loaded.consume(async () => { throw Error('APPROVAL_PRIVATE_ASYNC'); }))
    .toEqual({ ok: false, code: 'manifest_consumer_failed' });
});
