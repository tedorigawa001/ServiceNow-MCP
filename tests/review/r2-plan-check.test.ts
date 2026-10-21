import { afterEach, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { checkR2PlanOffline, r2PlanCheckSchema } from '../../src/review/r2-plan-check.js';
import { createReviewInstanceBinding } from '../../src/servicenow/review-release-config.js';
import { r2ApprovalManifestSchema } from '../../src/review/r2-approval-manifest.js';
import { runR2PlanCheck } from '../../src/review/r2-plan-check-process.js';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import childProcess from 'node:child_process';
import workerThreads from 'node:worker_threads';
import { inspect } from 'node:util';
import { EventEmitter } from 'node:events';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import { trustedTempRoot } from '../fixtures/trusted-temp-root.js';

const at = Date.now(), origin = 'https://private-check-fixture.service-now.com';
const binding = createReviewInstanceBinding('r2-check', origin);
function document() {
  return { schema_version: 'bp5-r2-approval-0.1',
    approval: { reference: 'PRIVATE_APPROVAL', approved_at: new Date(at - 1000).toISOString(), expires_at: new Date(at + 3600000).toISOString() },
    instance_id: 'r2-check', instance_binding: binding, callback_uri: 'http://127.0.0.1:18765/bp5/oauth/callback',
    plan: { instanceUrl: origin, clientId: 'PRIVATE_CLIENT', scopes: ['PRIVATE_SCOPE'], expectedUserSysId: '1'.repeat(32), updateSetSysId: 'a'.repeat(32),
      reviewReleaseConfig: { instance_id: 'r2-check', assertion: { family: 'Australia', instance_binding: binding,
        asserted_at: new Date(at - 1000).toISOString(), expires_at: new Date(at + 3600000).toISOString() } } },
    review: { update_set_sys_id: 'a'.repeat(32), selection_mode: 'review_targets', max_records: 20, requested_rule_ids: ['AU-BR-001'] } };
}
const dirs: string[] = [];
function fixture(value: unknown = document()) {
  const dir = mkdtempSync(join(trustedTempRoot(), 'r2-check-'));
  dirs.push(dir); chmodSync(dir, 0o700);
  const path = join(dir, 'PRIVATE_PLAN.json'); writeFileSync(path, JSON.stringify(value), { mode: 0o600 }); return path;
}
afterEach(() => { vi.restoreAllMocks(); syncBuiltinESMExports(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it('returns only an offline confirmation and normalized digest, not authority to run', async () => {
  const value = document(), path = fixture(value);
  const result = await checkR2PlanOffline(path);
  expect(result).toEqual({ schema_version: 'bp5-r2-plan-check-0.1', mode: 'check-plan', status: 'offline_valid',
    checks: { structure: true, file_trust: true, binding: true, validity: true }, pdi: 'not_verified',
    selection_mode: 'review_targets', max_records: 20, requested_rule_ids: ['AU-BR-001'], has_release_assertion: true,
    digest: createHash('sha256').update(JSON.stringify(r2ApprovalManifestSchema.parse(value))).digest('hex') });
  expect(r2PlanCheckSchema.safeParse(result).success).toBe(true);
  for (const marker of [origin, 'PRIVATE_', '1'.repeat(32), 'a'.repeat(32), path, binding]) expect(JSON.stringify(result)).not.toContain(marker);
});

it('checks a trusted fixture in an isolated process and confirms its exit without returning private input', async () => {
  const path = fixture();
  const result = await runR2PlanCheck(path);
  expect(result).toMatchObject({ status: 'offline_valid', pdi: 'not_verified', max_records: 20 });
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|service-now|approval\.json/);
});

it('performs no listening, connection, DNS, fetch, host spawn or analysis worker creation on success and rejection', async () => {
  const traps = [vi.spyOn(net.Server.prototype, 'listen'), vi.spyOn(net.Socket.prototype, 'connect'),
    vi.spyOn(http, 'request'), vi.spyOn(https, 'request'), vi.spyOn(dns, 'lookup'), vi.spyOn(dns, 'resolve'),
    vi.spyOn(globalThis, 'fetch'), vi.spyOn(childProcess, 'spawn'), vi.spyOn(childProcess, 'fork'), vi.spyOn(workerThreads, 'Worker')];
  for (const trap of traps) trap.mockImplementation(() => { throw Error('PRIVATE_FORBIDDEN_EFFECT'); });
  syncBuiltinESMExports();
  const path = fixture(), before = readFileSync(path);
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true), stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const good = await checkR2PlanOffline(path);
  const bad = await checkR2PlanOffline(join(dirs[0], 'PRIVATE_MISSING'));
  expect(good.status).toBe('offline_valid'); expect(bad.status).toBe('rejected');
  for (const trap of traps) expect(trap).not.toHaveBeenCalled();
  expect(stdout).not.toHaveBeenCalled(); expect(stderr).not.toHaveBeenCalled();
  expect(readFileSync(path).equals(before)).toBe(true);
  expect(inspect([good, bad])).not.toMatch(/PRIVATE|service-now/);
});

it.each(['approval_expired', 'approval_boundary', 'release_expired', 'binding', 'owner', 'mode', 'symlink', 'json', 'secret', 'duplicate', 'oversize'] as const)(
  'fails closed with a fixed reason and no private data: %s', async kind => {
    const value = document();
    if (kind === 'approval_expired') value.approval.expires_at = new Date(at - 1).toISOString();
    if (kind === 'approval_boundary') value.approval.expires_at = new Date(at + 385000).toISOString();
    if (kind === 'release_expired') value.plan.reviewReleaseConfig.assertion.expires_at = new Date(at - 1).toISOString();
    if (kind === 'binding') value.instance_binding = 'f'.repeat(64);
    let path = fixture(value);
    if (kind === 'mode') chmodSync(path, 0o644);
    if (kind === 'owner' && process.getuid) vi.spyOn(process, 'getuid').mockReturnValue(process.getuid() + 1);
    if (kind === 'symlink') { const link = join(dirs.at(-1)!, 'link.json'); symlinkSync(path, link); path = link; }
    if (kind === 'json') writeFileSync(path, 'PRIVATE_INVALID_JSON');
    if (kind === 'secret') writeFileSync(path, JSON.stringify({ ...value, token: 'PRIVATE_TOKEN' }));
    if (kind === 'duplicate') writeFileSync(path, JSON.stringify(value).replace('"max_records":20', '"max_records":20,"max_records":21'));
    if (kind === 'oversize') writeFileSync(path, ' '.repeat(65537));
    const result = await checkR2PlanOffline(path, { now: () => at });
    const code = kind === 'approval_expired' ? 'approval_expired' : kind === 'approval_boundary' ? 'approval_validity_insufficient'
      : kind === 'release_expired' ? 'release_config_expired' : kind === 'binding' ? 'manifest_binding_mismatch'
        : kind === 'secret' ? 'manifest_invalid' : 'manifest_untrusted';
    expect(result).toEqual({ schema_version: 'bp5-r2-plan-check-0.1', mode: 'check-plan', status: 'rejected', pdi: 'not_verified', code });
    expect(JSON.stringify(result) + inspect(result)).not.toMatch(/PRIVATE|service-now/);
    if (kind === 'mode') expect(statSync(path).mode & 0o777).toBe(0o644);
  });

it('keeps observed-only input unverified, and uses a stable digest only for semantically identical normalized plans', async () => {
  const value = document(); Reflect.deleteProperty(value.plan.reviewReleaseConfig, 'assertion');
  const path = fixture(value), first = await checkR2PlanOffline(path);
  expect(first).toMatchObject({ status: 'offline_valid', has_release_assertion: false, pdi: 'not_verified' });
  writeFileSync(path, JSON.stringify(value, null, 2));
  expect(await checkR2PlanOffline(path)).toEqual(first);
  writeFileSync(path, JSON.stringify(Object.fromEntries(Object.entries(value).reverse())));
  expect(await checkR2PlanOffline(path)).toEqual(first);
  value.review.max_records++;
  writeFileSync(path, JSON.stringify(value));
  const changed = await checkR2PlanOffline(path);
  expect(changed.status).toBe('offline_valid');
  if (first.status === 'offline_valid' && changed.status === 'offline_valid') expect(changed.digest).not.toBe(first.digest);
});

it('revalidates before producing a receipt and never exposes clock exceptions', async () => {
  const path = fixture(); let reads = 0;
  const changed = await checkR2PlanOffline(path, { now: () => {
    if (++reads === 1) { const value = document(); value.approval.reference = 'PRIVATE_CHANGED'; writeFileSync(path, JSON.stringify(value)); }
    return at;
  } });
  expect(changed).toMatchObject({ status: 'rejected', code: 'manifest_changed' });
  const thrown = await checkR2PlanOffline(path, { now: () => { throw Error('PRIVATE_CLOCK_SECRET'); } });
  expect(thrown).toMatchObject({ status: 'rejected', code: 'manifest_clock_invalid' });
  expect(inspect([changed, thrown])).not.toContain('PRIVATE');
});

it('rejects extra properties and inconsistent confirmation fields in the receipt contract', async () => {
  const good = await checkR2PlanOffline(fixture());
  expect(r2PlanCheckSchema.safeParse({ ...good, raw: 'PRIVATE_TOKEN' }).success).toBe(false);
  expect(r2PlanCheckSchema.safeParse({ ...good, pdi: 'verified' }).success).toBe(false);
  expect(r2PlanCheckSchema.safeParse({ ...good, checks: { structure: true, file_trust: true, binding: false, validity: true } }).success).toBe(false);
  expect(r2PlanCheckSchema.safeParse({ schema_version: 'bp5-r2-plan-check-0.1', mode: 'check-plan', status: 'rejected', pdi: 'not_verified', code: 'PRIVATE_ERROR' }).success).toBe(false);
});

function peer() {
  const child = Object.assign(new EventEmitter(), { exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
    connected: true, kill: vi.fn(() => true), disconnect: vi.fn(), unref: vi.fn() });
  return { child, spawnChecker: vi.fn((_command: string, _args: readonly string[], _options: SpawnOptions) => child as unknown as ChildProcess),
    exit(code: number | null, signal: NodeJS.Signals | null = null) {
      child.exitCode = code; child.signalCode = signal; child.emit('exit', code, signal); child.emit('close', code, signal);
    } };
}

it('spawns only the fixed checker with empty env and ignored output, and adopts a receipt only after exit and close', async () => {
  const path = fixture(), receipt = await checkR2PlanOffline(path), p = peer();
  const task = runR2PlanCheck(path, { spawnChecker: p.spawnChecker });
  expect(p.spawnChecker).toHaveBeenCalledWith(process.execPath,
    expect.arrayContaining([expect.stringMatching(/r2-plan-check-entry\.ts$/), path]),
    { env: {}, shell: false, detached: true, serialization: 'json', stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const args = p.spawnChecker.mock.calls[0][1];
  expect(args.join(' ')).not.toMatch(/host-entry|PRIVATE_CLIENT|PRIVATE_SCOPE/);
  let done = false; void task.then(() => { done = true; });
  p.child.emit('message', receipt); await Promise.resolve(); expect(done).toBe(false);
  p.child.exitCode = 0; p.child.emit('exit', 0, null); await Promise.resolve(); expect(done).toBe(false);
  p.child.emit('close', 0, null); expect(await task).toEqual(receipt);
  expect(p.child.kill).not.toHaveBeenCalled();
});

it.each(['extra', 'oversize', 'duplicate', 'handle', 'wrong_exit', 'missing', 'error'] as const)(
  'discards invalid process output without copying raw data: %s', async kind => {
    const receipt = await checkR2PlanOffline(fixture()), p = peer();
    const task = runR2PlanCheck('/PRIVATE_PATH', { spawnChecker: p.spawnChecker });
    if (kind === 'extra') p.child.emit('message', { ...receipt, secret: 'PRIVATE_TOKEN' });
    if (kind === 'oversize') p.child.emit('message', { secret: 'PRIVATE'.repeat(2000) });
    if (kind === 'duplicate') { p.child.emit('message', receipt); p.child.emit('message', receipt); }
    if (kind === 'handle') p.child.emit('message', receipt, {});
    if (kind === 'error') p.child.emit('error', Error('PRIVATE_OS_ERROR'));
    if (kind === 'wrong_exit') p.child.emit('message', receipt);
    p.exit(kind === 'wrong_exit' ? 10 : 0);
    const result = await task;
    expect(result).toMatchObject({ status: 'rejected', code: 'checker_failed' });
    expect(inspect(result)).not.toContain('PRIVATE');
  });

it.each(['cancel', 'timeout', 'unconfirmed', 'kill_throw'] as const)('does not treat a kill request as termination: %s', async kind => {
  const p = peer(), root = new AbortController();
  const task = runR2PlanCheck('/PRIVATE_PATH', { spawnChecker: p.spawnChecker, signal: root.signal, timeoutMs: 20, observationMs: 40 });
  if (kind === 'kill_throw') p.child.kill.mockImplementation(() => { throw Error('PRIVATE_KILL_ERROR'); });
  if (kind !== 'timeout') root.abort();
  else await new Promise(resolve => setTimeout(resolve, 25));
  if (kind === 'cancel' || kind === 'timeout') p.exit(null, 'SIGKILL');
  const result = await task;
  expect(result).toMatchObject({ status: 'rejected', code: kind === 'cancel' ? 'checker_cancelled' : kind === 'timeout' ? 'checker_timeout' : 'checker_termination_unconfirmed' });
  expect(p.child.kill).toHaveBeenCalledTimes(1);
  expect(root.signal.onabort).toBe(null);
  expect(result).not.toHaveProperty('digest');
});

it('refuses invalid budgets and pre-cancelled inputs before spawning, without reading a plan', async () => {
  const p = peer(), root = new AbortController(); root.abort();
  for (const timeoutMs of [0, 5001, NaN, 1.5]) expect(await runR2PlanCheck('/PRIVATE_PATH', { spawnChecker: p.spawnChecker, timeoutMs }))
    .toMatchObject({ status: 'rejected', code: 'checker_failed' });
  expect(await runR2PlanCheck('/PRIVATE_PATH', { spawnChecker: p.spawnChecker, signal: root.signal })).toMatchObject({ code: 'checker_cancelled' });
  expect(p.spawnChecker).not.toHaveBeenCalled();
});

it('kills and observes a real fixed checker on a shortened startup deadline, and reports trusted rejection normally', async () => {
  expect(await runR2PlanCheck(fixture(), { timeoutMs: 1 })).toMatchObject({ status: 'rejected', code: 'checker_timeout' });
  expect(await runR2PlanCheck(join(dirs.at(-1)!, 'PRIVATE_MISSING'))).toMatchObject({ status: 'rejected', code: 'manifest_untrusted' });
});

it('still validates a plan inside a real child with network/listen/host/worker OS boundaries trapped and no raw output', async () => {
  let output = '';
  const run = (path: string) => runR2PlanCheck(path, { spawnChecker: (command, args, options) => {
    const fixtureArgs = [...args];
    fixtureArgs[fixtureArgs.length - 2] = fileURLToPath(new URL('./fixtures/r2-plan-check-offline.mjs', import.meta.url));
    const child = childProcess.spawn(command, fixtureArgs, { ...options, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.stdout!.on('data', bytes => { output += String(bytes); });
    child.stderr!.on('data', bytes => { output += String(bytes); });
    return child;
  } });
  expect(await run(fixture())).toMatchObject({ status: 'offline_valid' });
  expect(await run('/PRIVATE_MISSING')).toMatchObject({ status: 'rejected', code: 'manifest_untrusted' });
  expect(output).toBe('');
});

it('refuses unavailable ACL verification without repairing permissions or emitting its raw error', async () => {
  const path = fixture();
  vi.spyOn(childProcess, 'execFileSync').mockImplementation(() => { throw Error('PRIVATE_ACL_FAILURE'); });
  syncBuiltinESMExports();
  const result = await checkR2PlanOffline(path);
  expect(result).toMatchObject({ status: 'rejected', code: 'manifest_untrusted' });
  expect(inspect(result)).not.toContain('PRIVATE');
});

it('does not adopt a late success after cancellation or retry the checker', async () => {
  const path = fixture(), receipt = await checkR2PlanOffline(path), p = peer(), root = new AbortController();
  const task = runR2PlanCheck(path, { spawnChecker: p.spawnChecker, signal: root.signal });
  root.abort(); p.child.emit('message', receipt); p.exit(0);
  expect(await task).toMatchObject({ status: 'rejected', code: 'checker_cancelled' });
  expect(p.spawnChecker).toHaveBeenCalledTimes(1);
});

it.each(['approval', 'release'] as const)('requires strictly more than 450s for %s before a future human confirmation', async kind => {
  const value = document();
  if (kind === 'approval') value.approval.expires_at = new Date(at + 450000).toISOString();
  else value.plan.reviewReleaseConfig.assertion.expires_at = new Date(at + 450000).toISOString();
  expect(await checkR2PlanOffline(fixture(value), { now: () => at })).toMatchObject({ status: 'rejected', code: 'validity_insufficient_for_approval' });
  if (kind === 'approval') value.approval.expires_at = new Date(at + 450001).toISOString();
  else value.plan.reviewReleaseConfig.assertion.expires_at = new Date(at + 450001).toISOString();
  expect(await checkR2PlanOffline(fixture(value), { now: () => at })).toMatchObject({ status: 'offline_valid' });
});
