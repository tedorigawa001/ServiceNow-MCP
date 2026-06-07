/**
 * `servicenow-mcp auth` subcommands — per-user OAuth / login management.
 *
 * login  — opens browser to ServiceNow OAuth consent, stores token
 * logout — removes stored token
 * whoami — show which ServiceNow user is currently authenticated
 */
import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { listInstances } from './config-store.js';

interface UserToken {
  instanceUrl: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  snUser: string;
  snUserSysId: string;
}

interface TokenStore {
  tokens: Record<string, UserToken>;
}

function tokenPath(): string {
  const dir = join(homedir(), '.config', 'servicenow-mcp');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  return join(dir, 'tokens.json');
}

function loadTokens(): TokenStore {
  const p = tokenPath();
  if (!existsSync(p)) return { tokens: {} };
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as TokenStore;
  } catch {
    return { tokens: {} };
  }
}

function saveTokens(store: TokenStore): void {
  const p = tokenPath();
  writeFileSync(p, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
  chmodSync(p, 0o600);
}

function tokenKey(instanceUrl: string): string {
  return instanceUrl.replace(/https?:\/\//, '').replace(/[^a-z0-9]/gi, '_');
}

export async function authLogin(): Promise<void> {
  const instances = listInstances();
  if (instances.length === 0) {
    console.log(chalk.yellow('No instances configured. Run `servicenow-mcp setup` first.'));
    return;
  }

  const instanceUrl = instances.length === 1
    ? instances[0]!.instanceUrl
    : await select<string>({
        message: 'Choose instance to authenticate against:',
        choices: instances.map(i => ({ name: `${i.name} (${i.instanceUrl})`, value: i.instanceUrl })),
      });

  const instance = instances.find(i => i.instanceUrl === instanceUrl);
  if (!instance) return;

  console.log('');
  console.log(chalk.bold('Per-user OAuth login'));
  console.log(chalk.dim('Your queries will run in your own ServiceNow permission context.'));
  console.log('');

  if (!instance.clientId) {
    console.log(chalk.yellow('This instance has no OAuth client ID configured. Run `servicenow-mcp setup` to reconfigure.'));
    return;
  }

  // OAuth Authorization Code flow — open browser
  const authUrl =
    `${instanceUrl}/oauth_auth.do` +
    `?response_type=code&client_id=${instance.clientId}` +
    `&redirect_uri=http://localhost:8765/callback`;

  console.log(chalk.cyan('Open this URL in your browser to authenticate:'));
  console.log(chalk.underline(authUrl));
  console.log('');

  const code = await input({
    message: 'Paste the authorization code from the redirect URL:',
  });

  const spinner = ora('Exchanging authorization code for token…').start();
  try {
    const resp = await fetch(`${instanceUrl}/oauth_token.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: instance.clientId,
        client_secret: instance.clientSecret,
        code,
        redirect_uri: 'http://localhost:8765/callback',
      }).toString(),
    });

    if (!resp.ok) {
      spinner.fail(chalk.red(`Token exchange failed: ${resp.status} ${resp.statusText}`));
      return;
    }

    const data = await resp.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const meResp = await fetch(`${instanceUrl}/api/now/table/sys_user?sysparm_query=sys_idINSTANCEOF&sysparm_limit=1`, {
      headers: { Authorization: `Bearer ${data.access_token}`, Accept: 'application/json' },
    });
    const meData = await meResp.json() as { result?: Array<{ sys_id?: { value: string }; user_name?: { value: string } }> };
    const snUserSysId = meData.result?.[0]?.sys_id?.value || '';
    const snUser = meData.result?.[0]?.user_name?.value || 'unknown';

    const store = loadTokens();
    store.tokens[tokenKey(instanceUrl)] = {
      instanceUrl,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000 * 0.9,
      snUser,
      snUserSysId,
    };
    saveTokens(store);

    spinner.succeed(chalk.green(`Authenticated as ${snUser} on ${instanceUrl}`));
  } catch (err) {
    spinner.fail(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
  }
}

export function authLogout(instanceUrl?: string): void {
  const store = loadTokens();
  if (instanceUrl) {
    const key = tokenKey(instanceUrl);
    if (store.tokens[key]) {
      delete store.tokens[key];
      saveTokens(store);
      console.log(chalk.green(`Logged out from ${instanceUrl}`));
    } else {
      console.log(chalk.yellow(`No token found for ${instanceUrl}`));
    }
  } else {
    store.tokens = {};
    saveTokens(store);
    console.log(chalk.green('Logged out from all instances'));
  }
}

export function authWhoami(): void {
  const store = loadTokens();
  const tokens = Object.values(store.tokens);
  if (tokens.length === 0) {
    console.log(chalk.dim('Not authenticated. Run `servicenow-mcp auth login`'));
    return;
  }
  for (const t of tokens) {
    const expired = Date.now() > t.expiresAt;
    const status = expired ? chalk.red('(expired)') : chalk.green('(active)');
    console.log(`  ${t.instanceUrl} → ${chalk.bold(t.snUser)} ${status}`);
  }
}

export function getStoredToken(instanceUrl: string): UserToken | undefined {
  const store = loadTokens();
  return store.tokens[tokenKey(instanceUrl)];
}

export async function authTest(instanceName?: string): Promise<void> {
  const instances = listInstances();
  if (instances.length === 0) {
    console.log(chalk.yellow('No instances configured. Run `servicenow-mcp setup` first.'));
    return;
  }

  let instance = instances.find(i => i.name === instanceName) ?? (instances.length === 1 ? instances[0] : undefined);
  if (!instance && instances.length > 1) {
    const chosen = await select<string>({
      message: 'Choose instance to test:',
      choices: instances.map(i => ({ name: `${i.name} (${i.instanceUrl})`, value: i.instanceUrl })),
    });
    instance = instances.find(i => i.instanceUrl === chosen);
  }
  if (!instance) {
    console.log(chalk.red(`Instance "${instanceName}" not found.`));
    return;
  }

  const spinner = ora(`Testing connection to ${instance.instanceUrl}…`).start();
  try {
    const { ServiceNowClient } = await import('../servicenow/client.js');
    const client = new ServiceNowClient({
      instanceUrl: instance.instanceUrl,
      oauth: {
        clientId: instance.clientId,
        clientSecret: instance.clientSecret,
        username: instance.oauthUsername,
        password: instance.oauthPassword,
      },
    });

    const resp = await client.queryRecords({
      table: 'sys_user',
      query: 'active=true',
      limit: 1,
      fields: 'sys_id,user_name,name',
    });

    const grantType = (instance.oauthUsername && instance.oauthPassword) ? 'password' : 'client_credentials';
    spinner.succeed(chalk.green(`Connected  ${instance.instanceUrl}`));
    console.log(`  ${chalk.dim('instance :')} ${instance.name}`);
    console.log(`  ${chalk.dim('grant    :')} ${grantType}`);
    if (resp.records.length > 0) {
      const u = resp.records[0] as Record<string, any>;
      const userName = u['user_name']?.value ?? u['user_name'] ?? '—';
      console.log(`  ${chalk.dim('api user :')} ${userName}`);
    }
  } catch (e) {
    spinner.fail(chalk.red(`Connection failed: ${e instanceof Error ? e.message : String(e)}`));
    process.exit(1);
  }
}
