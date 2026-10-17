import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createReviewInstanceBinding } from '../../src/servicenow/review-release-config.js';
describe('operator binding CLI', () => {
  it('prints just the binding from the canonical helper without contacting the instance', () => {
    const output = execFileSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../../src/cli/index.ts', import.meta.url)),
      'review', 'binding', '--instance-id', 'dev', '--url', 'https://EXAMPLE.service-now.com:443/'], { encoding: 'utf8' });
    expect(output).toBe(createReviewInstanceBinding('dev', 'https://example.service-now.com') + '\n');
  });
  it('refuses a credential-bearing URL without echoing it or producing a binding', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../../src/cli/index.ts', import.meta.url)),
      'review', 'binding', '--instance-id', 'dev', '--url', 'https://user:synthetic-secret@example.service-now.com'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('config_invalid');
    expect(result.stderr).not.toContain('synthetic-secret');
  });
});
