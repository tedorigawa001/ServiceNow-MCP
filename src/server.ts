#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { instanceManager } from './servicenow/instances.js';
import { getTools, executeTool } from './tools/index.js';
import { getResources, readResource } from './resources/index.js';
import { getPrompts, resolvePrompt } from './prompts/index.js';
import { logger } from './utils/logging.js';
import { ServiceNowError } from './utils/errors.js';

dotenv.config();

export const SERVER_NAME = 'servicenow-mcp';
// Version comes from package.json (one level up from dist/server.js)
export const SERVER_VERSION = (JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { version: string }).version;

/** True if at least one ServiceNow instance is configured via any supported method. */
export function isInstanceConfigured(): boolean {
  // InstanceManager owns all supported configuration sources, including the
  // setup wizard's ~/.config/servicenow-mcp/instances.json store. Keeping the
  // startup check on that same source of truth prevents valid wizard setups
  // from being rejected when no environment variables are present.
  return instanceManager.listNames().length > 0;
}

// ─── Request handlers (exported for unit testing) ─────────────────────────────

export async function handleListTools() {
  return { tools: getTools() };
}

export async function handleCallTool(request: {
  params: { name: string; arguments?: Record<string, unknown> };
}) {
  const { name, arguments: args } = request.params;

  logger.info(`Tool called: ${name}`);

  try {
    const known = getTools().some(t => t.name === name);
    if (!known) {
      throw new ServiceNowError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
    }

    const instanceName = (args as Record<string, unknown>)?.['instance'] as string | undefined;
    const client = instanceManager.getClient(instanceName);

    const result = await executeTool(client, name, args || {});

    return {
      content: [
        {
          type: 'text' as const,
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error(`Tool execution error: ${name}`, error);

    if (error instanceof ServiceNowError) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${error.message} (Code: ${error.code})`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `Error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
      isError: true,
    };
  }
}

export async function handleListResources() {
  return { resources: getResources() };
}

export async function handleReadResource(request: { params: { uri: string } }) {
  const { uri } = request.params;

  try {
    const client = instanceManager.getClient();
    const content = await readResource(client, uri);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(content, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error(`Resource read error: ${uri}`, error);
    throw error;
  }
}

export async function handleListPrompts() {
  return { prompts: getPrompts() };
}

export async function handleGetPrompt(request: {
  params: { name: string; arguments?: Record<string, string> };
}): Promise<any> {
  const { name, arguments: args } = request.params;

  const result = resolvePrompt(name, args);
  if (!result) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  return result;
}

// ─── Server wiring ────────────────────────────────────────────────────────────

/** Build the MCP server with all request handlers registered. */
export function createServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, handleListTools);
  server.setRequestHandler(CallToolRequestSchema, handleCallTool);
  server.setRequestHandler(ListResourcesRequestSchema, handleListResources);
  server.setRequestHandler(ReadResourceRequestSchema, handleReadResource);
  server.setRequestHandler(ListPromptsRequestSchema, handleListPrompts);
  server.setRequestHandler(GetPromptRequestSchema, handleGetPrompt);

  return server;
}

export async function main() {
  // MCP_TRANSPORT=http switches to the Streamable HTTP transport (see server-http.ts).
  if ((process.env.MCP_TRANSPORT || 'stdio').toLowerCase() === 'http') {
    const { startHttpServer } = await import('./server-http.js');
    await startHttpServer();
    return;
  }

  if (!isInstanceConfigured()) {
    logger.error('No ServiceNow instance configured. Set SERVICENOW_INSTANCE_URL or SN_INSTANCES_CONFIG.');
    process.exit(1);
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(`${SERVER_NAME} server running on stdio [${getTools().length} tools]`);
}

// Run only when executed directly (not when imported by tests).
const isDirectRun = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main().catch((error) => {
    logger.error('Server startup failed', error);
    process.exit(1);
  });
}
