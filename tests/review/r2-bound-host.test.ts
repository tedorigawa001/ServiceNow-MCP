import { afterEach, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { approvedPlanFixture } from './fixtures/r2-approved-plan.js';
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
it.each(['changed', 'expired', 'legacy-grant', 'wrong-digest'] as const)(
  'bound host refuses %s after prepared without bind, issuer traffic or raw output', async kind => {
    const f = approvedPlanFixture(); dirs.push(f.dir);
    const child = spawn(process.execPath, ['--import', 'tsx', 'tests/review/fixtures/r2-bound-host.mjs', f.path,
      kind === 'expired' ? 'expire-after-prepared' : 'normal'], { env: {}, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let output = ''; const messages: Array<{type: string; digest?: string; receipt?: unknown}> = [];
    child.stdout!.on('data', value => { output += value; }); child.stderr!.on('data', value => { output += value; });
    child.on('message', (value: {type: string; digest?: string; receipt?: unknown}) => {
      messages.push(value);
      if (value.type === 'prepared_v2') {
        if (kind === 'changed') { f.document.review.max_records++; writeFileSync(f.path, JSON.stringify(f.document)); }
        child.send(kind === 'legacy-grant' ? { type: 'run_grant', remaining_ms: 4000 }
          : { type: 'run_grant_v2', digest: kind === 'wrong-digest' ? 'f'.repeat(64) : f.digest, remaining_ms: 4000 });
      }
      if (value.type === 'finished') child.send({ type: 'finished_ack' });
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 8000);
    try {
      expect(await new Promise(resolve => child.on('close', resolve))).toBe(10);
      expect(messages[0]).toEqual({ type: 'prepared_v2', digest: f.digest });
      expect(messages.some(value => value.type === 'ready')).toBe(false);
      if (kind === 'changed' || kind === 'expired') expect(messages.find(value => value.type === 'finished')?.receipt)
        .toMatchObject({ ok: false, code: kind === 'changed' ? 'manifest_changed' : 'approval_expired', cleanup: 'complete', tokenMayHaveBeenIssued: false });
      else expect(messages.some(value => value.type === 'finished')).toBe(false);
      expect(output).toBe('');
    } finally { clearTimeout(timer); if (child.exitCode === null) child.kill('SIGKILL'); }
  });
