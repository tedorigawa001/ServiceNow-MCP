/** Private same-process PoC bridge. Not registered by server.ts or exposed over HTTP/stdio. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getBestPracticeToolDefinitions, renderReviewToolOutcome, REVIEW_TOOL_NAME } from '../tools/best-practice.js';
import { reviewUpdateSetInputSchema } from './update-set-adapter.js';
import { type R2Permit, R2ReviewSession, type R2Failure } from './r2-session.js';

const failure = (code: R2Failure) => ({ isError: true,
  content: [{ type: 'text' as const, text: JSON.stringify({ status: 'failed', error: { stage: 'identity', code } }) }] });

export async function createR2ReviewBridge(session: R2ReviewSession, permit: R2Permit) {
  const server = new Server({ name: 'bp5-r2-private-bridge', version: '0.0.0' }, { capabilities: { tools: {} } });
  const client = new Client({ name: 'bp5-r2-private-client', version: '0.0.0' });
  const [upstream, downstream] = InMemoryTransport.createLinkedPair();
  let closed: Promise<void> | undefined;
  const close = () => closed ??= (async () => {
    try { await session.close(); }
    finally { await client.close(); await server.close(); }
  })();
  // No generic error logger or caller-controlled tool name/diagnostics are emitted.
  const transportFailed = () => { void close().catch(() => {}); };
  server.onerror = transportFailed; client.onerror = transportFailed;
  server.onclose = () => { void session.close().catch(() => {}); };
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: getBestPracticeToolDefinitions().map(tool => ({ ...tool,
    inputSchema: z.toJSONSchema(reviewUpdateSetInputSchema, { target: 'draft-7', io: 'input' }) as typeof tool.inputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false } })) }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      if (request.params.name !== REVIEW_TOOL_NAME) { await session.close(); return failure('invalid_session'); }
      const outcome = await session.review(permit, request.params.arguments ?? {}, extra.signal);
      return outcome.ok ? renderReviewToolOutcome(outcome.outcome) : failure(outcome.code);
    } catch { await session.close(); return failure('review_failed'); }
  });
  try { await server.connect(downstream); await client.connect(upstream); }
  catch { await close(); throw Error('r2_bridge_unavailable'); }
  return { client, close };
}
