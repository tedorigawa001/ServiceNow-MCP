import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// stdout is the MCP stdio transport: every line the server writes there must
// be a JSON-RPC message. dotenv prints an "injected env (N) from .env" banner
// to stdout unless it is told to be quiet, which a client sees as a corrupt
// frame. Run the real entry point from a directory that has a .env.
describe('stdio transport', () => {
  it('writes only JSON-RPC to stdout when a .env file is loaded', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sn-mcp-stdio-'));
    writeFileSync(join(dir, '.env'), [
      'SERVICENOW_INSTANCE_URL=https://example.service-now.com',
      'SERVICENOW_AUTH_MODE=basic',
      'SERVICENOW_BASIC_USERNAME=x',
      'SERVICENOW_BASIC_PASSWORD=y',
    ].join('\n'));
    const tsx = resolve('node_modules/.bin/tsx');
    const child = spawn(tsx, [resolve('src/server.ts')], { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
    try {
      const firstLine = await new Promise<string>((resolveLine, reject) => {
        let buf = '';
        const timer = setTimeout(() => reject(new Error(`no stdout within 20 s; got: ${buf}`)), 20_000);
        child.stdout.on('data', (chunk: Buffer) => {
          buf += chunk.toString();
          const nl = buf.indexOf('\n');
          if (nl >= 0) { clearTimeout(timer); resolveLine(buf.slice(0, nl)); }
        });
        child.on('error', reject);
        child.stdin.write(`${JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
        })}\n`);
      });
      const message = JSON.parse(firstLine);
      expect(message).toMatchObject({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'servicenow-mcp' } } });
    } finally {
      child.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
