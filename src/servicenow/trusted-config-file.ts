/** POSIX trust boundary for files containing BP-5 operator assertions. No writes or permission repair. */
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, type Stats } from 'node:fs';
import { dirname, parse, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

export const MAX_TRUSTED_CONFIG_BYTES = 1024 * 1024;
export class UntrustedConfigError extends Error {
  readonly code = 'config_untrusted';
  constructor() { super('config_untrusted'); this.name = 'UntrustedConfigError'; }
}
const identity = (s: Stats) => [s.dev, s.ino, s.uid, s.gid, s.mode, s.size, s.mtimeMs, s.ctimeMs].join(':');
const directoryIdentity = (s: Stats) => [s.dev, s.ino, s.uid, s.gid, s.mode].join(':');
export function validateNoGrantingAcl(platform: NodeJS.Platform, listing: string): boolean {
  const lines = listing.trimEnd().split('\n');
  if (platform === 'darwin') {
    let headers = 0; let needsEntry = false;
    for (const line of lines) {
      if (/^[-d][rwxstST-]{9}[@+ ]/.test(line)) {
        if (needsEntry) return false;
        headers++; needsEntry = line[10] === '+';
      } else {
        if (!headers || !/^\s*\d+: \S+(?: inherited)? deny [a-z_,]+$/.test(line)) return false;
        needsEntry = false;
      }
    }
    return headers > 0 && !needsEntry;
  }
  if (platform === 'linux') return lines.length === 3 && /^user::[rwx-]{3}$/.test(lines[0])
    && /^group::[rwx-]{3}$/.test(lines[1]) && /^other::[rwx-]{3}$/.test(lines[2]);
  return false;
}
/** No shell/PATH lookup. Reject granting extended ACLs rather than pretending mode bits cover them. */
function checkAcls(paths: string[]): void {
  const options = { encoding: 'utf8' as const, timeout: 1000, maxBuffer: 65536,
    env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'] };
  if (process.platform === 'darwin') {
    const listing = execFileSync('/bin/ls', ['-blden', '--', ...paths], options);
    if (!validateNoGrantingAcl('darwin', listing)
      || listing.split('\n').filter(line => /^[-d][rwxstST-]{9}[@+ ]/.test(line)).length !== paths.length) throw new UntrustedConfigError();
  } else if (process.platform === 'linux') {
    for (const path of paths) if (!validateNoGrantingAcl('linux', execFileSync('/usr/bin/getfacl', ['-c', '-n', '-p', '--', path], options))) throw new UntrustedConfigError();
  } else throw new UntrustedConfigError();
}
const readJson = (fd: number): unknown => {
  const buffer = Buffer.alloc(MAX_TRUSTED_CONFIG_BYTES + 1);
  let size = 0;
  while (size < buffer.length) {
    const n = readSync(fd, buffer, size, buffer.length - size, size);
    if (!n) break;
    size += n;
  }
  if (size > MAX_TRUSTED_CONFIG_BYTES) throw new UntrustedConfigError();
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size)));
};

/** Legacy connection discovery only: bounded data, explicitly NOT trusted as release evidence. */
export function readBoundedConfigJson(input: string): unknown {
  let fd: number | undefined;
  try {
    fd = openSync(input, constants.O_RDONLY | constants.O_NONBLOCK);
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > MAX_TRUSTED_CONFIG_BYTES) throw new UntrustedConfigError();
    const data = readJson(fd);
    if (identity(before) !== identity(fstatSync(fd))) throw new UntrustedConfigError();
    return data;
  } catch { throw new UntrustedConfigError(); }
  finally { if (fd !== undefined) closeSync(fd); }
}

export function readTrustedConfigJson(input: string): unknown {
  let fd: number | undefined;
  try {
    if (process.platform === 'win32' || !process.getuid || !constants.O_NOFOLLOW) throw new UntrustedConfigError();
    const uid = process.getuid();
    const path = resolve(input);
    const file = lstatSync(path);
    const validate = (s: Stats) => {
      if (!s.isFile() || s.isSymbolicLink() || s.uid !== uid || (s.mode & 0o777) !== 0o600
        || s.size > MAX_TRUSTED_CONFIG_BYTES) throw new UntrustedConfigError();
    };
    validate(file);
    const parents: Array<{ path: string; stat: Stats }> = [];
    for (let dir = dirname(path); ; dir = dirname(dir)) {
      const stat = lstatSync(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink() || ![0, uid].includes(stat.uid) || (stat.mode & 0o022) !== 0) throw new UntrustedConfigError();
      parents.push({ path: dir, stat });
      if (parents.length > 64) throw new UntrustedConfigError();
      if (dir === parse(dir).root) break;
    }
    const paths = [path, ...parents.map(p => p.path)];
    checkAcls(paths);
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = fstatSync(fd); validate(before);
    if (identity(file) !== identity(before)) throw new UntrustedConfigError();
    const data = readJson(fd);
    const after = fstatSync(fd); validate(after);
    if (identity(before) !== identity(after) || identity(after) !== identity(lstatSync(path))) throw new UntrustedConfigError();
    for (const p of parents) {
      if (directoryIdentity(p.stat) !== directoryIdentity(lstatSync(p.path))) throw new UntrustedConfigError();
    }
    checkAcls(paths);
    return data;
  } catch { throw new UntrustedConfigError(); }
  finally { if (fd !== undefined) closeSync(fd); }
}
