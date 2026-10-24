import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// A real tsx child: startup alone can take several seconds while the suite runs in parallel.
it('keeps the real HTTP listener alive after unauthenticated malformed Host requests', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--unhandled-rejections=strict', '--import', 'tsx',
    fileURLToPath(new URL('./fixtures/http-host-survival.mjs', import.meta.url)),
  ], { timeout: 60_000, maxBuffer: 64 * 1024 });
  expect(stdout).toContain('host-survival-ok');
}, 90_000);
