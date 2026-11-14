/** Opt-in ABBA comparison, fixed 60 s per synthetic child including its startup. No normal-route switch. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, loadavg, availableParallelism, freemem } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { classifyChildRun } from './body-live-compare-verdict.mjs';

const root = mkdtempSync(join(tmpdir(), 'body-live-compare-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const environment = () => ({ load: loadavg(), cpus: availableParallelism(), freeMiB: Math.round(freemem() / 1048576) });
let cleanupSafe = true;
async function run(mode, ordinal) {
  const work = mkdtempSync(join(root, 'run-')), start = performance.now(), before = environment();
  const child = spawn(process.execPath, [fileURLToPath(new URL('./compiled-body-live-b.mjs', import.meta.url)), ...(mode === 'reference' ? ['--reference'] : [])],
    { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TMPDIR: work } });
  const out = [], err = [];
  let outBytes = 0, errBytes = 0, closed, exited, spawnError, timedOut = false, killTimer;
  const signals = [];
  const absent = () => { if (!child.pid) return false; try { process.kill(-child.pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; } };
  // Each signal is sent at most once per child: the ceiling never repeats an earlier SIGKILL.
  const signal = name => { if (child.pid > 1 && !signals.some(s => s.name === name)) { try { process.kill(-child.pid, name); signals.push({ name, ms: Math.round(performance.now() - start) }); } catch (e) { if (e.code !== 'ESRCH') spawnError = e.code; } } };
  // Keep at most 64 KiB per stream in bytes; the rest is still drained (counted, not stored).
  const keep = (chunks, total, data) => { if (total < 65536) chunks.push(data.subarray(0, 65536 - total)); };
  child.stdout.on('data', data => { keep(out, outBytes, data); outBytes += data.length; });
  child.stderr.on('data', data => { keep(err, errBytes, data); errBytes += data.length; });
  let deadlineTimer, ceilingTimer;
  const done = new Promise(resolve => {
    child.once('error', e => { spawnError = e.code; });
    child.once('exit', (code, signal) => { exited = { code, signal, ms: Math.round(performance.now() - start) }; });
    child.once('close', (code, signal) => { closed = { code, signal, ms: Math.round(performance.now() - start) }; resolve(); });
    deadlineTimer = setTimeout(() => { timedOut = true; signal('SIGTERM'); killTimer = setTimeout(() => { if (!absent()) signal('SIGKILL'); }, 1000); }, Math.max(0, 60000 - (performance.now() - start)));
    ceilingTimer = setTimeout(() => { if (!absent()) signal('SIGKILL'); resolve(); }, Math.max(0, 63000 - (performance.now() - start)));
  });
  console.log(JSON.stringify({ phase: 'started', ordinal, mode, budgetMs: 60000 }));
  await done; clearTimeout(deadlineTimer); clearTimeout(ceilingTimer); clearTimeout(killTimer);
  let empty = 0;
  while (empty < 2 && performance.now() - start < 63000) {
    empty = absent() ? empty + 1 : 0;
    if (empty < 2) await sleep(100);
  }
  const cleanupConfirmed = Boolean(closed && empty === 2);
  if (!cleanupConfirmed || spawnError) cleanupSafe = false;
  const report = { ordinal, mode, timedOut, exited, closed, signals, cleanupConfirmed, spawnError, outBytes, errBytes,
    truncated: outBytes > 65536 || errBytes > 65536, before, after: environment() };
  const verdict = classifyChildRun(report);
  console.log(JSON.stringify({ phase: 'ended', ...report, verdict }));
  const stdout = Buffer.concat(out).toString('utf8'), stderr = Buffer.concat(err).toString('utf8');
  // The legacy-cost control arm cannot be compared once it misses its own unchanged deadline. That is an
  // inconclusive comparison, never a pass and never a regression verdict for the JS path; any concurrent
  // supervision, output or cleanup anomaly has already been classified as a failure by classifyChildRun.
  if (verdict.verdict === 'inconclusive') throw Object.assign(Error('control_deadline'), { inconclusive: { ordinal, mode, closedMs: closed?.ms, load: before.load } });
  assert.equal(verdict.verdict, 'ok', verdict.reason + ': ' + stderr.slice(-512));
  const lines = stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(lines.length, 2);
  const [legacy, result] = lines;
  assert.deepEqual(legacy, { compiled: true, fields: 56, brands: 6, copies: 6, fixedReferenceControls: 6, writableControls: 6,
    priorStageControls: 45, priorIdentityControls: 45, preflightControls: 7, issuedRetention: true, readonlyRuntime: true,
    liveInitialRecheck: true, rejectedIdentity: true, priorDiagnosis: true, typeRejections: 19, livePrefixControls: 9,
    enumerableControl: true, sealedControl: true, phaseAllowlist: true });
  assert.equal(result.blb, true); assert.equal(result.mode, mode);
  assert.equal(result.payloadEmits, mode === 'js' ? 2 : 306);
  assert.equal(result.execution.modules, 304); assert.equal(result.execution.observations, 385);
  assert.equal(result.execution.caseDigests.length, 304);
  assert.ok(result.execution.caseDigests.every(s => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s)));
  assert.deepEqual(result.isolation, { freshFactories: true, freshBrands: true, closeIndependent: true, foreignRefusals: 2, copyRefusals: 1, proxyRefusals: 1, hooks: 0 });
  assert.equal(result.loader.phase, 'sealed'); assert.equal(result.loader.first, 'none');
  assert.equal(result.loader.imports, 304); assert.equal(result.loader.isolationImports, 2);
  return { report, legacy, execution: result.execution, isolation: result.isolation };
}
let inconclusive;
try {
  const results = [];
  for (const mode of ['reference', 'js', 'js', 'reference']) results.push(await run(mode, results.length + 1));
  for (const r of results.slice(1)) {
    assert.deepEqual(r.execution, results[0].execution, 'runtime_observation_mismatch');
    assert.deepEqual(r.legacy, results[0].legacy);
    assert.deepEqual(r.isolation, results[0].isolation);
  }
  console.log(JSON.stringify({ comparison: 'passed', childBudgetMs: 60000, comparedCases: 304, observations: 385,
    semanticRejections: 19, digest: results[0].execution.digest, cleanupConfirmed: true,
    runs: results.map(r => ({ mode: r.report.mode, elapsedMs: r.report.closed.ms })) }));
} catch (e) {
  if (!e?.inconclusive) throw e;
  inconclusive = e.inconclusive;
  console.log(JSON.stringify({ comparison: 'inconclusive', reason: 'control_deadline', childBudgetMs: 60000, ...inconclusive }));
  process.exitCode = 2;
} finally { if (cleanupSafe) rmSync(root, { recursive: true, force: true }); }
