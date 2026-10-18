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
import { instanceManager, type InstanceContext } from './servicenow/instances.js';
import { getTools, executeTool } from './tools/index.js';
import { getResources, readResource } from './resources/index.js';
import { getPrompts, resolvePrompt } from './prompts/index.js';
import { logger } from './utils/logging.js';
import { ServiceNowError } from './utils/errors.js';
import { REVIEW_TOOL_NAME, reviewToolArgumentsSchema, renderReviewToolOutcome } from './tools/best-practice.js';

// quiet: dotenv 17 prints "injected env (N) from .env" to stdout, and stdout is
// the MCP stdio transport — the banner arrives at the client as a non-JSON line.
dotenv.config({ quiet: true });

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

const defaultInstanceContext = instanceManager.createContext();

export async function handleCallTool(request: {
  params: { name: string; arguments?: Record<string, unknown> };
}, instanceContext: InstanceContext = defaultInstanceContext, context?: { signal?: AbortSignal }) {
  const { name, arguments: args } = request.params;

  logger.info(`Tool called: ${name}`);

  try {
    const known = getTools().some(t => t.name === name);
    if (!known) {
      throw new ServiceNowError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
    }

    if (name === REVIEW_TOOL_NAME) {
      const parsed = reviewToolArgumentsSchema.safeParse(args ?? {});
      if (!parsed.success) return renderReviewToolOutcome({ isError: true, error: { stage: 'input', code: 'invalid_input' } });
      const { instance, ...toolArgs } = parsed.data;
      let client;
      try { client = instanceContext.getClient(instance); }
      catch { return renderReviewToolOutcome({ isError: true, error: { stage: 'input', code: 'config_invalid' } }); }
      return renderReviewToolOutcome(await executeTool(client, name, toolArgs, instanceContext, { signal: context?.signal }));
    }

    // `instance` (docs/MULTI_INSTANCE.md: "pass `instance` to any tool") selects the
    // target instance and is consumed here. Tools never see it: strict tools reject
    // unknown keys, and tools that forward their arguments as record fields would
    // otherwise send it to ServiceNow.
    const { instance: instanceArg, ...toolArgs } = (args ?? {}) as Record<string, unknown>;
    const instanceName = typeof instanceArg === 'string' && instanceArg ? instanceArg : undefined;
    const instanceTools = new Set(['switch_instance', 'list_instances', 'get_current_instance']);
    const client = instanceTools.has(name) ? undefined : instanceContext.getClient(instanceName);
    const result = await executeTool(client, name, toolArgs, instanceContext);

    return {
      content: [
        {
          type: 'text' as const,
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    if (name === REVIEW_TOOL_NAME) {
      return renderReviewToolOutcome({ isError: true, error: { stage: 'input', code:
        error instanceof ServiceNowError && error.code === 'UNKNOWN_TOOL' ? 'invalid_input' : 'internal_review_error' } });
    }
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

export async function handleReadResource(request: { params: { uri: string } }, instanceContext: InstanceContext = defaultInstanceContext) {
  const { uri } = request.params;

  try {
    const client = instanceContext.getClient();
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
  const instanceContext = instanceManager.createContext();
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
  server.setRequestHandler(CallToolRequestSchema, (request, extra) => handleCallTool(request, instanceContext, { signal: extra.signal }));
  server.setRequestHandler(ListResourcesRequestSchema, handleListResources);
  server.setRequestHandler(ReadResourceRequestSchema, (request) => handleReadResource(request, instanceContext));
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
