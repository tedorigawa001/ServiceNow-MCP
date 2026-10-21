/**
 * Test-only: choose a directory under which trusted-config fixtures can be created.
 *
 * readTrustedConfigJson rejects a file when ANY ancestor directory is not owned by root or the
 * current user, is group/other-writable, or carries a granting extended ACL. Those properties
 * belong to the host, not to the test, so a fixed location (cwd on Linux, tmpdir on macOS) makes
 * the suite pass or fail depending on where the checkout lives (e.g. CI workspaces). This helper
 * applies the same rules to each candidate's full ancestor chain and returns the first that
 * qualifies. It never relaxes the product check; when no candidate qualifies it throws with the
 * offending path and reason instead of letting tests fail later as an opaque "untrusted" result.
 *
 * Hosts whose shared ancestors cannot qualify (GitHub-hosted runners put an extended ACL on /home
 * and /tmp is 1777) can provide a prepared directory via SN_MCP_TRUSTED_TEST_ROOT. It is tried
 * first and is checked by exactly the same rules; it is never trusted just because it is set.
 */
import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, parse } from 'node:path';
import { validateNoGrantingAcl } from '../../src/servicenow/trusted-config-file.js';

const aclOptions = {
  encoding: 'utf8' as const, timeout: 1000, maxBuffer: 65536,
  env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'],
};

function aclIssue(path: string): string | undefined {
  try {
    if (process.platform === 'linux') {
      const listing = execFileSync('/usr/bin/getfacl', ['-c', '-n', '-p', '--', path], aclOptions);
      return validateNoGrantingAcl('linux', listing) ? undefined : 'extended ACL';
    }
    if (process.platform === 'darwin') {
      const listing = execFileSync('/bin/ls', ['-blden', '--', path], aclOptions);
      return validateNoGrantingAcl('darwin', listing) ? undefined : 'extended ACL';
    }
    return 'unsupported platform';
  } catch {
    return 'ACL listing unavailable';
  }
}

/** Returns why `dir` (or one of its ancestors) would make a trusted file below it untrusted. */
export function trustedAncestorIssue(dir: string): string | undefined {
  const uid = process.getuid?.();
  if (uid === undefined) return 'no POSIX uid';
  for (let current = dir; ; current = dirname(current)) {
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return `${current}: not a plain directory`;
    if (![0, uid].includes(stat.uid)) return `${current}: owned by uid ${stat.uid}`;
    if ((stat.mode & 0o022) !== 0) return `${current}: mode ${(stat.mode & 0o7777).toString(8)} is group/other-writable`;
    const acl = aclIssue(current);
    if (acl) return `${current}: ${acl}`;
    if (current === parse(current).root) return undefined;
  }
}

/** First candidate whose whole ancestor chain satisfies the trusted-config rules. */
export function trustedTempRoot(): string {
  const preferred = process.platform === 'linux' ? process.cwd() : tmpdir();
  const provided = process.env.SN_MCP_TRUSTED_TEST_ROOT;
  const candidates = [...new Set([...(provided ? [provided] : []), preferred, homedir(), tmpdir()]
    .map(path => realpathSync(path)))];
  const problems: string[] = [];
  for (const candidate of candidates) {
    const issue = trustedAncestorIssue(candidate);
    if (!issue) return candidate;
    problems.push(issue);
  }
  throw new Error(`No trusted temp root for trusted-config tests: ${problems.join('; ')}`);
}
