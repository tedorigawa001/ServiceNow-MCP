/**
 * Config writers — each writer knows how to inject servicenow-mcp into a specific AI client.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import type { InstanceConfig } from '../config-store.js';
import type { DetectedClient } from '../detect-clients.js';

export interface WriteResult {
  success: boolean;
  message: string;
}

/** Build the env block that goes into any JSON-based MCP config. */
function buildEnvBlock(instance: InstanceConfig): Record<string, string> {
  const env: Record<string, string> = {
    SERVICENOW_INSTANCE_URL: instance.instanceUrl,
    SERVICENOW_OAUTH_CLIENT_ID: instance.clientId,
    SERVICENOW_OAUTH_CLIENT_SECRET: instance.clientSecret,
    WRITE_ENABLED: instance.writeEnabled ? 'true' : 'false',
    MCP_TOOL_PACKAGE: instance.toolPackage || 'full',
  };
  if (instance.oauthUsername) env['SERVICENOW_OAUTH_USERNAME'] = instance.oauthUsername;
  if (instance.oauthPassword) env['SERVICENOW_OAUTH_PASSWORD'] = instance.oauthPassword;
  if (instance.authMode && instance.authMode !== 'service-account') {
    env['SERVICENOW_AUTH_MODE'] = instance.authMode;
  }
  if (instance.nowAssistEnabled) {
    env['NOW_ASSIST_ENABLED'] = 'true';
  }
  if (instance.group) {
    env['SN_INSTANCE_GROUP'] = instance.group;
  }
  if (instance.environment) {
    env['SN_INSTANCE_ENVIRONMENT'] = instance.environment;
  }
  return env;
}

/** Absolute path to the compiled server entry point. */
function serverPath(): string {
  // dist/server.js relative to project root (where package.json lives)
  // Use fileURLToPath to handle Windows drive letters correctly (avoids /C:/... issue)
  const pkgDir = fileURLToPath(new URL('../../../', import.meta.url)).replace(/[\\/]$/, '');
  return join(pkgDir, 'dist', 'server.js');
}

/** Package name for npx-based entries. Read from package.json, with a hardcoded fallback. */
const FALLBACK_PACKAGE_NAME = '@tedorigawa001/servicenow-mcp';
function packageName(): string {
  try {
    const pkgDir = fileURLToPath(new URL('../../../', import.meta.url)).replace(/[\\/]$/, '');
    const parsed = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as { name?: string };
    return parsed.name || FALLBACK_PACKAGE_NAME;
  } catch {
    return FALLBACK_PACKAGE_NAME;
  }
}

/** Read + merge JSON config, creating it if needed. */
function mergeJsonConfig(path: string, key: string, entry: Record<string, unknown>): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let existing: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      existing = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }

  if (!existing[key] || typeof existing[key] !== 'object') {
    existing[key] = {};
  }
  (existing[key] as Record<string, unknown>)['servicenow-mcp'] = entry;
  writeFileSync(path, JSON.stringify(existing, null, 2), 'utf8');
}

/** Write to any client that uses `mcpServers` JSON key. */
function writeMcpServersJson(client: DetectedClient, instance: InstanceConfig): WriteResult {
  const entry = {
    command: 'node',
    args: [serverPath()],
    env: buildEnvBlock(instance),
  };
  try {
    mergeJsonConfig(client.configPath, 'mcpServers', entry);
    return { success: true, message: `Written to ${client.configPath}` };
  } catch (err) {
    return { success: false, message: `Failed to write ${client.configPath}: ${err}` };
  }
}

/**
 * Write to VS Code (.vscode/mcp.json) which uses `servers` key + `type: stdio`.
 *
 * Two deliberate differences from the other JSON writers:
 * - Secrets are NOT stored in the file. `.vscode/` is commonly committed, so the
 *   client secret (and OAuth password, if any) are replaced with VS Code
 *   `inputs` placeholders — VS Code prompts once and stores them encrypted.
 * - The server is launched via `npx <pkg> server` instead of an absolute
 *   dist/server.js path. When setup runs under npx, that path points into the
 *   npx cache and breaks as soon as the cache is pruned.
 */
function writeVsCodeJson(client: DetectedClient, instance: InstanceConfig): WriteResult {
  const env = buildEnvBlock(instance);
  const inputs: Array<{ type: string; id: string; description: string; password: boolean }> = [
    {
      type: 'promptString',
      id: 'servicenow-client-secret',
      description: `ServiceNow OAuth client secret (${instance.instanceUrl})`,
      password: true,
    },
  ];
  env['SERVICENOW_OAUTH_CLIENT_SECRET'] = '${input:servicenow-client-secret}';
  if (instance.oauthPassword) {
    inputs.push({
      type: 'promptString',
      id: 'servicenow-oauth-password',
      description: `ServiceNow OAuth password (${instance.oauthUsername || instance.instanceUrl})`,
      password: true,
    });
    env['SERVICENOW_OAUTH_PASSWORD'] = '${input:servicenow-oauth-password}';
  }

  const entry = {
    type: 'stdio',
    command: 'npx',
    args: ['-y', packageName(), 'server'],
    env,
  };

  try {
    const dir = dirname(client.configPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    let existing: Record<string, unknown> = {};
    if (existsSync(client.configPath)) {
      try {
        existing = JSON.parse(readFileSync(client.configPath, 'utf8')) as Record<string, unknown>;
      } catch {
        existing = {};
      }
    }

    if (!existing['servers'] || typeof existing['servers'] !== 'object') {
      existing['servers'] = {};
    }
    (existing['servers'] as Record<string, unknown>)['servicenow-mcp'] = entry;

    const existingInputs = Array.isArray(existing['inputs'])
      ? (existing['inputs'] as Array<Record<string, unknown>>)
      : [];
    for (const input of inputs) {
      if (!existingInputs.some((i) => i && i['id'] === input.id)) {
        existingInputs.push(input);
      }
    }
    existing['inputs'] = existingInputs;

    writeFileSync(client.configPath, JSON.stringify(existing, null, 2), 'utf8');
    return { success: true, message: `Written to ${client.configPath}` };
  } catch (err) {
    return { success: false, message: `Failed to write ${client.configPath}: ${err}` };
  }
}

/** Run `claude mcp add` for Claude Code. */
function writeClaudeCode(_client: DetectedClient, instance: InstanceConfig): WriteResult {
  const env = buildEnvBlock(instance);
  const args = [
    'mcp', 'add', 'servicenow-mcp', 'node', serverPath(),
    ...Object.entries(env).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
  ];
  try {
    const command = process.platform === 'win32' ? 'claude.cmd' : 'claude';
    execFileSync(command, args, { stdio: 'pipe' });
    return { success: true, message: 'Added via `claude mcp add servicenow-mcp`' };
  } catch (err) {
    return { success: false, message: `claude mcp add failed: ${err}` };
  }
}

/** Write a .env file. */
function writeDotEnv(client: DetectedClient, instance: InstanceConfig): WriteResult {
  const env = buildEnvBlock(instance);
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n');
  try {
    writeFileSync(client.configPath, lines + '\n', 'utf8');
    return { success: true, message: `Written to ${client.configPath}` };
  } catch (err) {
    return { success: false, message: `Failed to write .env: ${err}` };
  }
}

/** Write to the appropriate config based on client type. */
export function writeClientConfig(client: DetectedClient, instance: InstanceConfig): WriteResult {
  switch (client.writeMethod) {
    case 'json-mcpServers':
      return writeMcpServersJson(client, instance);
    case 'json-servers':
      return writeVsCodeJson(client, instance);
    case 'command':
      return writeClaudeCode(client, instance);
    case 'env':
      return writeDotEnv(client, instance);
    default:
      return { success: false, message: `Unknown write method: ${client.writeMethod}` };
  }
}
