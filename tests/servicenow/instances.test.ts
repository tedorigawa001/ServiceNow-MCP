import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { instanceManager } from '../../src/servicenow/instances.js';

// instanceManager is a process-wide singleton; reload() re-reads config so we can
// drive it deterministically. SN_INSTANCES_CONFIG (priority #1) bypasses the
// machine's wizard config, keeping these tests hermetic.

// Any env key the InstanceManager reads. Cleared dynamically (not via a static
// snapshot) so keys set mid-test never leak into later tests.
const SN_ENV_RE = /^(SN_|SERVICENOW_)/;
// Redirect HOME so os.homedir() points at an empty temp dir — otherwise the
// machine's wizard config (~/.config/servicenow-mcp/instances.json, priority #2)
// would shadow the env-var code paths under test.
const HOME_KEYS = ['HOME', 'USERPROFILE'];

let savedEnv: Record<string, string | undefined> = {};
let tmpDir: string;

function clearSnEnv(): void {
  for (const k of Object.keys(process.env)) {
    if (SN_ENV_RE.test(k)) delete process.env[k];
  }
}

function writeConfig(obj: unknown): string {
  const p = join(tmpDir, `instances-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, JSON.stringify(obj));
  return p;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'sn-inst-'));
  // Snapshot every SN_/SERVICENOW_ and HOME key so afterEach can fully restore.
  savedEnv = {};
  for (const k of Object.keys(process.env)) {
    if (SN_ENV_RE.test(k)) savedEnv[k] = process.env[k];
  }
  for (const k of HOME_KEYS) savedEnv[k] = process.env[k];

  clearSnEnv();
  for (const k of HOME_KEYS) process.env[k] = tmpDir;
});

afterEach(() => {
  clearSnEnv();
  for (const k of HOME_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('InstanceManager — config file loading', () => {
  it('loads multiple instances and honors default_instance', () => {
    process.env.SN_INSTANCES_CONFIG = writeConfig({
      default_instance: 'prod',
      instances: {
        dev: { instance_url: 'https://dev.service-now.com', client_id: 'c', client_secret: 's', group: 'A', environment: 'dev' },
        prod: { url: 'https://prod.service-now.com', client_id: 'c', client_secret: 's' },
      },
    });
    instanceManager.reload();

    expect(instanceManager.listNames().sort()).toEqual(['dev', 'prod']);
    expect(instanceManager.getCurrentName()).toBe('prod');
    expect(instanceManager.getCurrentUrl()).toBe('https://prod.service-now.com');
  });

  it('exposes group/environment metadata and active flag via listAll', () => {
    process.env.SN_INSTANCES_CONFIG = writeConfig({
      default_instance: 'dev',
      instances: {
        dev: { instance_url: 'https://dev.service-now.com', client_id: 'c', client_secret: 's', group: 'TeamA', environment: 'sandbox' },
      },
    });
    instanceManager.reload();

    const all = instanceManager.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ name: 'dev', group: 'TeamA', environment: 'sandbox', active: true });
  });

  it('falls back to env vars when the config path is invalid', () => {
    process.env.SN_INSTANCES_CONFIG = join(tmpDir, 'does-not-exist.json');
    process.env.SN_INSTANCE_QA_URL = 'https://qa.service-now.com';
    process.env.SN_INSTANCE_QA_CLIENT_ID = 'cid';
    process.env.SN_INSTANCE_QA_CLIENT_SECRET = 'sec';
    instanceManager.reload();

    expect(instanceManager.listNames()).toContain('qa');
  });
});

describe('InstanceManager — env var groups', () => {
  beforeEach(() => {
    process.env.SN_INSTANCE_DEV_URL = 'https://dev.service-now.com';
    process.env.SN_INSTANCE_DEV_CLIENT_ID = 'c';
    process.env.SN_INSTANCE_DEV_CLIENT_SECRET = 's';
    process.env.SN_INSTANCE_PROD_URL = 'https://prod.service-now.com';
    process.env.SN_INSTANCE_PROD_CLIENT_ID = 'c';
    process.env.SN_INSTANCE_PROD_CLIENT_SECRET = 's';
  });

  it('registers each SN_INSTANCE_<NAME>_URL group (lowercased)', () => {
    instanceManager.reload();
    expect(instanceManager.listNames().sort()).toEqual(['dev', 'prod']);
  });

  it('honors SN_DEFAULT_INSTANCE', () => {
    process.env.SN_DEFAULT_INSTANCE = 'prod';
    instanceManager.reload();
    expect(instanceManager.getCurrentName()).toBe('prod');
  });
});

describe('InstanceManager — legacy single-instance env', () => {
  it('registers SERVICENOW_INSTANCE_URL as "default"', () => {
    process.env.SERVICENOW_INSTANCE_URL = 'https://legacy.service-now.com';
    process.env.SERVICENOW_CLIENT_ID = 'c';
    process.env.SERVICENOW_CLIENT_SECRET = 's';
    instanceManager.reload();

    expect(instanceManager.listNames()).toContain('default');
    expect(instanceManager.getCurrentName()).toBe('default');
  });

  it('loads a per-user instance without a token so use-time validation can identify it', () => {
    process.env.SERVICENOW_INSTANCE_URL = 'https://legacy.service-now.com';
    process.env.SERVICENOW_CLIENT_ID = 'c';
    process.env.SERVICENOW_CLIENT_SECRET = 's';
    process.env.SERVICENOW_AUTH_MODE = 'per-user';
    instanceManager.reload();
    expect(instanceManager.listNames()).toContain('default');
  });
});

describe('InstanceManager — getClient / switch', () => {
  beforeEach(() => {
    process.env.SN_INSTANCES_CONFIG = writeConfig({
      default_instance: 'dev',
      instances: {
        dev: { instance_url: 'https://dev.service-now.com', client_id: 'c', client_secret: 's' },
        prod: { instance_url: 'https://prod.service-now.com', client_id: 'c', client_secret: 's' },
      },
    });
    instanceManager.reload();
  });

  it('returns the current client by default and a named client when asked', () => {
    expect(instanceManager.getClient()).toBeTruthy();
    expect(instanceManager.getClient('prod')).toBeTruthy();
  });

  it('resolves names case-insensitively', () => {
    expect(instanceManager.getClient('PROD')).toBe(instanceManager.getClient('prod'));
  });

  it('throws for an unknown instance name', () => {
    expect(() => instanceManager.getClient('nope')).toThrowError(/Unknown instance "nope"/);
  });

  it('switch() changes the active instance', () => {
    instanceManager.switch('prod');
    expect(instanceManager.getCurrentName()).toBe('prod');
    expect(instanceManager.getCurrentUrl()).toBe('https://prod.service-now.com');
  });

  it('switch() throws for an unknown instance', () => {
    expect(() => instanceManager.switch('ghost')).toThrowError(/Unknown instance "ghost"/);
  });
});
