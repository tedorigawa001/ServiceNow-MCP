import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReviewInstanceBinding } from '../../src/servicenow/review-release-config.js';
import { withBoundedUpdateSetSource } from '../../src/review/bounded-source.js';
import { ServiceNowClient } from '../../src/servicenow/client.js';

let dir: string;
let saved: Record<string, string | undefined>;
const relevant = (key: string) => /^(SN_|SERVICENOW_)/.test(key) || ['HOME', 'USERPROFILE'].includes(key);
const url = 'https://example.service-now.com';
const supported = process.platform === 'darwin' || (process.platform === 'linux' && existsSync('/usr/bin/getfacl'));
const parent = 'a'.repeat(32);
const settings = () => ({ instance_id: 'dev', assertion: { family: 'Australia',
  instance_binding: createReviewInstanceBinding('dev', url), asserted_at: new Date(Date.now() - 60000).toISOString(),
  expires_at: new Date(Date.now() + 3600000).toISOString() } });
const manual = (review: unknown) => ({ default_instance: 'dev', instances: { dev: { instance_url: url, client_id: '', client_secret: '',
  auth_mode: 'per-user', review_release_config: review } } });
beforeEach(() => {
  dir = mkdtempSync(join(realpathSync(process.platform === 'linux' ? process.cwd() : tmpdir()), 'sn-policy-')); chmodSync(dir, 0o700);
  saved = Object.fromEntries(Object.entries(process.env).filter(([key]) => relevant(key)));
  for (const key of Object.keys(process.env)) if (relevant(key)) delete process.env[key];
  process.env.HOME = dir; process.env.USERPROFILE = dir;
  process.env.SERVICENOW_PER_USER_BEARER_TOKEN = 'synthetic-token';
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(process.env)) if (relevant(key)) delete process.env[key];
  for (const [key, value] of Object.entries(saved)) if (value !== undefined) process.env[key] = value;
  rmSync(dir, { recursive: true, force: true });
});
const manager = async () => {
  const { instanceManager } = await import('../../src/servicenow/instances.js');
  instanceManager.reload(); return instanceManager;
};
describe('file operator settings to bounded source', () => {
  it('keeps the slot binding stable for trusted files without an assertion', async () => {
    const path = join(dir, 'instances.json');
    writeFileSync(path, JSON.stringify({ default_instance: 'dev', instances: { dev: {
      instance_url: url, auth_mode: 'per-user' } } }), { mode: 0o600 });
    process.env.SN_INSTANCES_CONFIG = path;
    const selected = (await manager()).getClient('dev');
    if (!supported) { expect(() => selected.createBoundedReadSession()).toThrow('config_invalid'); return; }
    const session = selected.createBoundedReadSession();
    try {
      expect(session.releasePolicy.instanceBinding).toBe(createReviewInstanceBinding('dev', url));
      expect(session.releasePolicy.assertion).toBeUndefined();
    } finally { session.close(); }
  });
  it('charges initial provider verification time to the run budget and sends no HTTP after expiry', async () => {
    let elapsed = 0; vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const selected = new ServiceNowClient({ instanceUrl: url, authMode: 'per-user', perUserBearerToken: 'synthetic',
      oauth: { clientId: '', clientSecret: '' }, reviewReleaseConfigProvider: () => { elapsed = 60001; return undefined; } });
    const fetcher = vi.fn();
    await expect(withBoundedUpdateSetSource(selected, { update_set_sys_id: parent }, s => s.readParent(), { fetch: fetcher }))
      .rejects.toMatchObject({ code: 'deadline_exceeded' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['manual', 'wizard'])('loads %s settings through ownership checks and admits the asserted fallback', async format => {
    const path = format === 'manual' ? join(dir, 'instances.json') : join(dir, '.config', 'servicenow-mcp', 'instances.json');
    if (format === 'wizard') mkdirSync(join(dir, '.config', 'servicenow-mcp'), { recursive: true, mode: 0o700 });
    const document = format === 'manual' ? manual(settings()) : { defaultInstance: 'dev', instances: { dev: { instanceUrl: url,
      authMode: 'per-user', clientId: '', clientSecret: '', reviewReleaseConfig: settings() } } };
    writeFileSync(path, JSON.stringify(document), { mode: 0o600 });
    if (format === 'manual') process.env.SN_INSTANCES_CONFIG = path;
    const selected = (await manager()).getClient('dev');
    if (!supported) { expect(() => selected.createBoundedReadSession()).toThrow('config_invalid'); return; }
    let calls = 0;
    await withBoundedUpdateSetSource(selected, { update_set_sys_id: parent }, async source => {
      await source.readParent(); const decision = await source.resolveRelease();
      expect(decision.release_match).toBe('matched');
      expect(decision.instance_release).toMatchObject({ source: 'operator_config', family: 'Australia' });
    }, { fetch: async () => ++calls === 1 ? new Response(JSON.stringify({ result: { sys_id: parent,
      state: 'in progress', application: 'global', sys_updated_on: '2026-10-17', sys_mod_count: '0' } })) : new Response('', { status: 403 }) });
    expect(calls).toBe(2);
  });
  it('poisons BP-5 for an unsafe file instead of silently downgrading to observation-only', async () => {
    const path = join(dir, 'instances.json'); writeFileSync(path, JSON.stringify(manual(settings())), { mode: 0o600 }); chmodSync(path, 0o644);
    process.env.SN_INSTANCES_CONFIG = path;
    const selected = (await manager()).getClient('dev');
    expect(selected).toBeTruthy(); // Existing connection discovery is preserved.
    expect(() => selected.createBoundedReadSession()).toThrow('config_invalid');
  });
  it('does not bypass a rejected explicit file by falling back to environment connections for BP-5', async () => {
    process.env.SN_INSTANCES_CONFIG = join(dir, 'missing.json');
    process.env.SN_INSTANCE_DEV_URL = url;
    process.env.SERVICENOW_AUTH_MODE = 'per-user';
    const selected = (await manager()).getClient('dev');
    expect(() => selected.createBoundedReadSession()).toThrow('config_invalid');
  });
  it('rejects ambiguous keys and renamed slots, while reload recovers from a repaired file', async () => {
    const path = join(dir, 'instances.json'); process.env.SN_INSTANCES_CONFIG = path;
    const document = manual(settings());
    const renamed = settings(); renamed.instance_id = 'other'; document.instances.dev.review_release_config = renamed;
    writeFileSync(path, JSON.stringify(document), { mode: 0o600 });
    const m = await manager();
    expect(() => m.getClient('dev').createBoundedReadSession()).toThrow('config_invalid');
    writeFileSync(path, JSON.stringify({ ...manual(settings()), instances: { dev: {
      ...manual(settings()).instances.dev, reviewReleaseConfig: settings() } } }));
    m.reload(); expect(() => m.getClient('dev').createBoundedReadSession()).toThrow('config_invalid');
    writeFileSync(path, JSON.stringify(manual(settings())));
    m.reload();
    if (!supported) { expect(() => m.getClient('dev').createBoundedReadSession()).toThrow('config_invalid'); return; }
    const session = m.getClient('dev').createBoundedReadSession();
    try { expect(session.releasePolicy.assertion?.family).toBe('Australia'); } finally { session.close(); }
  });
});
