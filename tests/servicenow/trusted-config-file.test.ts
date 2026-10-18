import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTrustedConfigJson, validateNoGrantingAcl } from '../../src/servicenow/trusted-config-file.js';

let dir: string;
const supported = process.platform === 'darwin' || (process.platform === 'linux' && existsSync('/usr/bin/getfacl'));
beforeEach(() => { dir = mkdtempSync(join(realpathSync(process.platform === 'linux' ? process.cwd() : tmpdir()), 'sn-trust-')); chmodSync(dir, 0o700); });
afterEach(() => { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); });
describe('trusted operator configuration read', () => {
  it('keeps the legacy size/duplicate policy unless stricter options are selected', () => {
    const path = join(dir, 'instances.json');
    writeFileSync(path, '{"value":1,"value":2}' + ' '.repeat(65536), { mode: 0o600 });
    if (!supported) { expect(() => readTrustedConfigJson(path)).toThrow('config_untrusted'); return; }
    expect(readTrustedConfigJson(path)).toEqual({ value: 2 });
    expect(() => readTrustedConfigJson(path, { maxBytes: 65536 })).toThrow('config_untrusted');
    expect(() => readTrustedConfigJson(path, { uniqueKeys: true })).toThrow('config_untrusted');
  });
  it('does not interpret JSON punctuation in string values as duplicate keys', () => {
    const path = join(dir, 'instances.json');
    const value = { text: '{"x":1,"x":2}', nested: [{ x: 1 }, { x: 2 }], escaped: '\\"[,]}' };
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    if (supported) expect(readTrustedConfigJson(path, { uniqueKeys: true })).toEqual(value);
    else expect(() => readTrustedConfigJson(path, { uniqueKeys: true })).toThrow('config_untrusted');
  });
  it('reads an owner-only regular JSON file without modifying it', () => {
    const path = join(dir, 'instances.json');
    writeFileSync(path, '{"instances":{}}', { mode: 0o600 });
    if (supported) expect(readTrustedConfigJson(path)).toEqual({ instances: {} });
    else expect(() => readTrustedConfigJson(path)).toThrow('config_untrusted');
  });
  it.each([0o644, 0o620, 0o666])('refuses file mode %i without repairing it', mode => {
    const path = join(dir, 'instances.json'); writeFileSync(path, '{}', { mode: 0o600 }); chmodSync(path, mode);
    expect(() => readTrustedConfigJson(path)).toThrow('config_untrusted');
  });
  it('rejects a writable parent and symlinks at either file or directory level', () => {
    if (process.platform === 'win32') {
      expect(() => readTrustedConfigJson(join(dir, 'not-supported'))).toThrow('config_untrusted'); return;
    }
    const parent = join(dir, 'parent'); mkdirSync(parent, { mode: 0o700 });
    const path = join(parent, 'instances.json'); writeFileSync(path, '{}', { mode: 0o600 });
    chmodSync(parent, 0o777);
    expect(() => readTrustedConfigJson(path)).toThrow('config_untrusted');
    chmodSync(parent, 0o700);
    symlinkSync(path, join(dir, 'linked.json'));
    expect(() => readTrustedConfigJson(join(dir, 'linked.json'))).toThrow('config_untrusted');
    symlinkSync(parent, join(dir, 'linked-dir'));
    expect(() => readTrustedConfigJson(join(dir, 'linked-dir', 'instances.json'))).toThrow('config_untrusted');
  });
  it('rejects owner mismatch, oversized content and malformed JSON using a fixed error', () => {
    const path = join(dir, 'instances.json'); writeFileSync(path, '{}', { mode: 0o600 });
    if (process.getuid) {
      const uid = process.getuid(); vi.spyOn(process, 'getuid').mockReturnValue(uid + 1);
      expect(() => readTrustedConfigJson(path)).toThrow('config_untrusted'); vi.restoreAllMocks();
    }
    writeFileSync(path, 'private-invalid-json');
    expect(() => readTrustedConfigJson(path)).toThrow(/^config_untrusted$/);
    writeFileSync(path, 'x'.repeat(1024 * 1024 + 1));
    expect(() => readTrustedConfigJson(path)).toThrow('config_untrusted');
  });
  it('allows only verifiable base ACLs or restrictive macOS deny entries', () => {
    expect(validateNoGrantingAcl('darwin', '-rw------- 1 501 20 2 Jan 1 00:00 config\n')).toBe(true);
    expect(validateNoGrantingAcl('darwin', 'drwx------+ 1 501 20 2 Jan 1 00:00 dir\n 0: group:everyone deny delete\n')).toBe(true);
    expect(validateNoGrantingAcl('darwin', '-rw-------+ 1 501 20 2 Jan 1 00:00 config\n 0: user:other allow write\n')).toBe(false);
    expect(validateNoGrantingAcl('darwin', '-rw-------+ 1 501 20 2 Jan 1 00:00 config\n')).toBe(false);
    expect(validateNoGrantingAcl('darwin', '-rw-------+ 1 501 20 2 Jan 1 00:00 config\n 0: user:evil deny word allow write\n')).toBe(false);
    expect(validateNoGrantingAcl('linux', 'user::rw-\ngroup::---\nother::---\n\n')).toBe(true);
    expect(validateNoGrantingAcl('linux', 'user::rw-\nuser:1001:rw-\ngroup::---\nmask::rw-\nother::---\n')).toBe(false);
    expect(validateNoGrantingAcl('win32', '')).toBe(false);
  });
});
