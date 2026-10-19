// Synthetic cooked TTY + bound host peer. No real host/auth/session, network, or token issuance.
import { PassThrough } from 'node:stream';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import cp from 'node:child_process';
import workers from 'node:worker_threads';
const [entry, mode, path] = process.argv.slice(2);
const url = pathToFileURL(entry), forbidden = () => { process.exit(97); };
net.Server.prototype.listen = forbidden; net.Socket.prototype.connect = forbidden;
http.request = forbidden; http.get = forbidden; https.request = forbidden; https.get = forbidden;
dns.lookup = forbidden; dns.resolve = forbidden; dns.promises.lookup = forbidden; dns.promises.resolve = forbidden;
globalThis.fetch = forbidden; workers.Worker = class { constructor() { forbidden(); } };
const spawn = cp.spawn, acl = cp.execFileSync;
let checkers = 0, hosts = 0, grants = 0, confirmedDigest;
const summarySignal = mode === 'signal-71' || mode === 'signal-73';
let peerEnded = false, summaryPending = false;
cp.spawn = (command, args, options) => {
  if (mode.startsWith('host') || command !== process.execPath || Object.keys(options.env).length
    || options.shell !== false || options.serialization !== 'json'
    || JSON.stringify(options.stdio) !== JSON.stringify(['ignore', 'ignore', 'ignore', 'ipc'])) return forbidden();
  if (args.length === 2 && args[0] === fileURLToPath(new URL('./r2-plan-check-entry.js', url))) {
    checkers++;
    return spawn(command, [fileURLToPath(new URL('./r2-launcher-offline.mjs', import.meta.url)), args[0], 'checker', args[1]], options);
  }
  if (args.length !== 3 || args[0] !== fileURLToPath(new URL('./r2-host-entry.js', url)) || args[2] !== '--approval-bound') return forbidden();
  hosts++;
  const peerMode = summarySignal ? `host-${mode}` : mode === 'bad-digest' ? 'host-bad-digest' : 'host';
  const child = spawn(command, [fileURLToPath(import.meta.url), entry, peerMode, args[1]], options);
  const emit = child.emit.bind(child);
  child.emit = (event, ...values) => {
    if (event === 'close') peerEnded = true;
    // Model exit-71 evidence without an earlier IPC-disconnect protocol failure.
    if (mode === 'signal-71' && event === 'disconnect') return true;
    // The real OS peer still exits; only its supervisor-facing exit/close evidence is withheld.
    if (mode === 'signal-73' && (event === 'exit' || event === 'close')) return true;
    return emit(event, ...values);
  };
  const send = child.send.bind(child);
  child.send = (value, ...rest) => {
    if (value.type === 'run_grant') return forbidden();
    if (value.type === 'run_grant_v2') { grants++; if (value.digest !== confirmedDigest) return forbidden(); }
    return send(value, ...rest);
  };
  return child;
};
cp.fork = forbidden; cp.exec = forbidden; cp.execSync = forbidden; cp.execFile = forbidden; cp.spawnSync = forbidden;
cp.execFileSync = (command, args, options) => {
  if (!['/bin/ls', '/usr/bin/getfacl'].includes(command)) return forbidden();
  return acl(command, args, options);
};
syncBuiltinESMExports();
if (mode.startsWith('host')) {
  const { loadR2ApprovalManifest } = await import(new URL('./r2-approval-manifest.js', url));
  let digest;
  try {
    const loaded = loadR2ApprovalManifest(path);
    try { const result = await loaded.consume((_context, value) => { digest = value; }); if (!result.ok) process.exit(10); }
    finally { loaded.close(); }
  } catch { process.exit(10); }
  process.on('message', value => {
    if (value.type === 'run_grant_v2' && value.digest === digest) {
      if (mode === 'host-signal-71') { process.disconnect(); process.exit(71); }
      if (mode === 'host-signal-73') { process.send({ type: 'invalid-synthetic-message' }); return; }
      process.send({ type: 'ready' }); process.send({ type: 'stopping' });
      process.send({ type: 'finished', receipt: { ok: false, code: 'authorization_denied', cleanup: 'complete',
        mcpListed: false, tokenMayHaveBeenIssued: false, otherAccountTokenPossible: false } });
    } else if (value.type === 'finished_ack') { process.disconnect(); process.exitCode = 10; }
    else forbidden();
  });
  process.send({ type: 'prepared_v2', digest: mode === 'host-bad-digest' ? '0'.repeat(64) : digest });
} else {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: mode === 'raw' });
  Object.defineProperty(process, 'stdin', { value: input });
  Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
  const write = process.stderr.write.bind(process.stderr);
  const change = kind => {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    if (kind === 'changed') value.review.max_records++;
    else value.approval.expires_at = new Date(Date.now() - 1).toISOString();
    writeFileSync(path, JSON.stringify(value));
  };
  if (mode === 'expire-before') change(mode);
  process.stderr.write = (text, callback) => {
    if (summarySignal && String(text).includes('bp5-r2-exit-summary-0.1')) {
      const summary = JSON.parse(String(text));
      if (summaryPending || !peerEnded || summary.terminal_reason !== (mode === 'signal-71' ? 'cleanup_incomplete' : 'termination_unconfirmed')) return forbidden();
      summaryPending = true;
      // Keep the native callback unresolved until the OS signal interrupts display.
      // A live handle avoids Node's unsettled-top-level-await exit before parent delivery.
      setInterval(() => {}, 1000);
      return write('R2_SUMMARY_PENDING\n');
    }
    const written = write(text, callback);
    if (String(text).includes('Type APPROVE')) {
      confirmedDigest = String(text).match(/Offline plan digest: ([a-f0-9]{64})/)?.[1];
      if (!confirmedDigest) return forbidden();
      setImmediate(() => { if (['changed', 'expire-after'].includes(mode)) change(mode); input.write(mode === 'deny' ? 'NO\n' : 'APPROVE\n'); });
    }
    return written;
  };
  process.on('exit', () => {
    const authorized = !['deny', 'expire-before', 'raw'].includes(mode);
    if (checkers !== (mode === 'raw' ? 0 : 1) || hosts !== (authorized ? 1 : 0) || grants !== (mode === 'approve' || summarySignal ? 1 : 0)
      || summarySignal && (!peerEnded || !summaryPending)) process.exitCode = 98;
  });
  process.argv = [process.execPath, entry, 'run', path];
  await import(url.href);
}
