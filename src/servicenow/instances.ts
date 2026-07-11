/**
 * Multi-instance manager for servicenow-mcp.
 *
 * Supports connecting to multiple ServiceNow instances (e.g. dev, staging, prod,
 * or multiple customers) from a single MCP session.
 *
 * Configuration methods (in priority order):
 *   1. SN_INSTANCES_CONFIG — path to an instances.json file
 *   2. SN_INSTANCE_<NAME>_URL / SN_INSTANCE_<NAME>_AUTH env var groups
 *   3. Single-instance legacy env vars (SERVICENOW_INSTANCE_URL, etc.) → registered as "default"
 *
 * Usage:
 *   import { instanceManager } from './instances.js';
 *   const client = instanceManager.getClient();          // current instance
 *   const client = instanceManager.getClient('prod');    // specific instance
 *   instanceManager.switch('prod');                      // switch active instance
 */
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { ServiceNowClient } from './client.js';
import type { ServiceNowConfig } from './types.js';
import { logger } from '../utils/logging.js';

interface InstanceEntry {
  name: string;
  url: string;
  group: string;
  environment: string;
  client: ServiceNowClient;
}

class InstanceManager {
  private instances: Map<string, InstanceEntry> = new Map();
  private currentName: string = 'default';

  constructor() {
    this.loadInstances();
  }

  private loadInstances(): void {
    // 1. Try instances.json config file
    const configPath = process.env.SN_INSTANCES_CONFIG;
    if (configPath && existsSync(configPath)) {
      try {
        const raw = JSON.parse(readFileSync(configPath, 'utf8'));
        const defaultName: string = raw.default_instance || raw.default || 'default';
        for (const [name, cfg] of Object.entries(raw.instances || {})) {
          const c = cfg as any;
          this.register(name, this.buildConfig(
            c.instance_url || c.url,
            c
          ), c.group || 'Default', c.environment || '');
        }
        if (this.instances.has(defaultName)) this.currentName = defaultName;
        return;
      } catch (e) {
        logger.warn(`Failed to parse instances config at ${configPath}: ${e instanceof Error ? e.message : String(e)}`);
        // fall through to env vars
      }
    }

    // 2. Try the wizard config store (~/.config/servicenow-mcp/instances.json)
    //    Written by `servicenow-mcp setup` — allows the HTTP server and MCP server
    //    to work without a .env file after running the setup wizard.
    const wizardConfigPath = join(homedir(), '.config', 'servicenow-mcp', 'instances.json');
    if (existsSync(wizardConfigPath)) {
      try {
        const raw = JSON.parse(readFileSync(wizardConfigPath, 'utf8'));
        const defaultName: string = raw.defaultInstance || 'default';
        for (const [name, cfg] of Object.entries(raw.instances || {})) {
          const c = cfg as Record<string, unknown>;
          this.register(name, {
            instanceUrl: c['instanceUrl'] as string,
            oauth: {
              clientId: c['clientId'] as string,
              clientSecret: c['clientSecret'] as string,
              username: c['oauthUsername'] as string | undefined,
              password: c['oauthPassword'] as string | undefined,
            },
            authMode: c['authMode'] as ServiceNowConfig['authMode'],
            perUserBearerToken: process.env.SERVICENOW_PER_USER_BEARER_TOKEN,
          }, (c['group'] as string) || 'Default', (c['environment'] as string) || '');
        }
        if (this.instances.has(defaultName)) this.currentName = defaultName;
        return;
      } catch (e) {
        logger.warn(`Failed to parse wizard config at ${wizardConfigPath}: ${e instanceof Error ? e.message : String(e)}`);
        // fall through to env vars
      }
    }

    // 3. Try SN_INSTANCE_<NAME>_URL env var groups (manual multi-instance env config)
    const envNames = Object.keys(process.env)
      .filter(k => /^SN_INSTANCE_[A-Z0-9_]+_URL$/.test(k))
      .map(k => k.replace(/^SN_INSTANCE_/, '').replace(/_URL$/, '').toLowerCase());

    for (const name of envNames) {
      const upper = name.toUpperCase();
      const url = process.env[`SN_INSTANCE_${upper}_URL`];
      if (!url) continue;
      const clientId = process.env[`SN_INSTANCE_${upper}_CLIENT_ID`] || '';
      const clientSecret = process.env[`SN_INSTANCE_${upper}_CLIENT_SECRET`] || '';
      this.register(name, {
        instanceUrl: url,
        oauth: {
          clientId,
          clientSecret,
          username: process.env[`SN_INSTANCE_${upper}_USERNAME`],
          password: process.env[`SN_INSTANCE_${upper}_PASSWORD`],
        },
        authMode: process.env.SERVICENOW_AUTH_MODE as ServiceNowConfig['authMode'],
        perUserBearerToken: process.env.SERVICENOW_PER_USER_BEARER_TOKEN,
      });
    }

    const defaultEnvName = (process.env.SN_DEFAULT_INSTANCE || '').toLowerCase();
    if (defaultEnvName && this.instances.has(defaultEnvName)) {
      this.currentName = defaultEnvName;
    }

    // 4. Legacy single-instance env vars → register as "default" if no others loaded
    //    Supports both SERVICENOW_OAUTH_* (documented in .env.example) and the
    //    older unprefixed SERVICENOW_CLIENT_ID / SERVICENOW_USERNAME forms.
    const legacyUrl = process.env.SERVICENOW_INSTANCE_URL;
    if (legacyUrl && !this.instances.has('default')) {
      this.register('default', {
        instanceUrl: legacyUrl,
        oauth: {
          clientId: process.env.SERVICENOW_OAUTH_CLIENT_ID || process.env.SERVICENOW_CLIENT_ID || '',
          clientSecret: process.env.SERVICENOW_OAUTH_CLIENT_SECRET || process.env.SERVICENOW_CLIENT_SECRET || '',
          username: process.env.SERVICENOW_OAUTH_USERNAME || process.env.SERVICENOW_USERNAME,
          password: process.env.SERVICENOW_OAUTH_PASSWORD || process.env.SERVICENOW_PASSWORD,
        },
        authMode: process.env.SERVICENOW_AUTH_MODE as ServiceNowConfig['authMode'],
        perUserBearerToken: process.env.SERVICENOW_PER_USER_BEARER_TOKEN,
        maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
        retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
        requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10),
      });
      if (this.instances.size === 1) this.currentName = 'default';
    }
  }

  private buildConfig(url: string, c: any): ServiceNowConfig {
    return {
      instanceUrl: url,
      oauth: {
        clientId: c.client_id || '',
        clientSecret: c.client_secret || '',
        username: c.username,
        password: c.password,
      },
      authMode: c.auth_mode || c.authMode || process.env.SERVICENOW_AUTH_MODE,
      perUserBearerToken: c.per_user_bearer_token || c.perUserBearerToken || process.env.SERVICENOW_PER_USER_BEARER_TOKEN,
      maxRetries: c.max_retries || parseInt(process.env.MAX_RETRIES || '3', 10),
      retryDelayMs: c.retry_delay_ms || parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
      requestTimeoutMs: c.request_timeout_ms || parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10),
    };
  }

  private register(name: string, config: ServiceNowConfig, group = 'Default', environment = ''): void {
    this.instances.set(name, {
      name,
      url: config.instanceUrl,
      group,
      environment,
      client: new ServiceNowClient(config),
    });
  }

  /** Return client for named instance (or current instance if no name given). */
  getClient(name?: string): ServiceNowClient {
    const target = name ? name.toLowerCase() : this.currentName;
    const entry = this.instances.get(target);
    if (!entry) {
      throw new Error(`Unknown instance "${target}". Available: ${this.listNames().join(', ')}`);
    }
    return entry.client;
  }

  /** Reload instances from config files (call after config is updated). */
  reload(): void {
    this.instances.clear();
    this.currentName = 'default';
    this.loadInstances();
  }

  /** Switch the active instance for the session. */
  switch(name: string): void {
    const lower = name.toLowerCase();
    if (!this.instances.has(lower)) {
      throw new Error(`Unknown instance "${name}". Available: ${this.listNames().join(', ')}`);
    }
    this.currentName = lower;
  }

  getCurrentName(): string {
    return this.currentName;
  }

  getCurrentUrl(): string {
    return this.instances.get(this.currentName)?.url || '';
  }

  listNames(): string[] {
    return Array.from(this.instances.keys());
  }

  listAll(): Array<{ name: string; url: string; active: boolean; group: string; environment: string }> {
    return Array.from(this.instances.values()).map(e => ({
      name: e.name,
      url: e.url,
      active: e.name === this.currentName,
      group: e.group,
      environment: e.environment,
    }));
  }
}

export const instanceManager = new InstanceManager();
