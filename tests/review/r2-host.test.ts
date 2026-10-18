import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';

describe('dedicated host bootstrap (synthetic subprocess)', () => {
  it('the fixed source entry refuses execution without IPC and prints nothing', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/review/r2-host-entry.ts', '/nonexistent/manifest'],
      { env: {}, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    try { expect(await new Promise(resolve => child.on('close', resolve))).toBe(10); expect(output).toBe(''); }
    finally { clearTimeout(timer); if (child.exitCode === null) child.kill('SIGKILL'); }
  });
  it.each(['exception', 'rejection', 'poison'])('suppresses fatal %s without inspecting the reason', async mode => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'tests/review/fixtures/r2-host.mjs', mode],
      { env: {}, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    try {
      const code = await new Promise<number | null>(resolve => child.on('close', resolve));
      expect(code).toBe(70); expect(output).toBe('');
    } finally { clearTimeout(timer); if (child.exitCode === null) child.kill('SIGKILL'); }
  });
  it('rejects an invalid manifest before prepared or network without diagnostics', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'tests/review/fixtures/r2-host.mjs', 'normal'],
      { env: {}, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let output = ''; const messages: unknown[] = [];
    child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
    child.on('message', (message: { type: string }) => {
      messages.push(message);
      if (message.type === 'prepared') child.send({ type: 'run_grant', remaining_ms: 4000 });
      if (message.type === 'finished') child.send({ type: 'finished_ack' });
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 6000);
    try {
      expect(await new Promise(resolve => child.on('close', resolve))).toBe(10);
      expect(messages).toEqual([]);
      expect(output).toBe('');
    } finally { clearTimeout(timer); if (child.exitCode === null) child.kill('SIGKILL'); }
  });
});
