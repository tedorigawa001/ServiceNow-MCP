// Synthetic outer launch/TTY only. Every network/listen/host/analysis attempt is fatal to this test.
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import cp from 'node:child_process';
import workers from 'node:worker_threads';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const [entry, mode, ...args] = process.argv.slice(2);
const forbidden = () => { process.exit(97); };
net.Server.prototype.listen = forbidden; net.Socket.prototype.connect = forbidden;
http.request = forbidden; http.get = forbidden; https.request = forbidden; https.get = forbidden;
dns.lookup = forbidden; dns.resolve = forbidden; dns.promises.lookup = forbidden; dns.promises.resolve = forbidden;
globalThis.fetch = forbidden;
const rawSpawn = cp.spawn, acl = cp.execFileSync;
let count = 0;
const checker = fileURLToPath(new URL('./r2-plan-check-entry.js', pathToFileURL(entry)));
cp.spawn = (command, childArgs, options) => {
  if (mode === 'checker' || command !== process.execPath || childArgs.length !== 2 || childArgs[0] !== checker
    || Object.keys(options.env).length || options.shell !== false || options.serialization !== 'json'
    || JSON.stringify(options.stdio) !== JSON.stringify(['ignore', 'ignore', 'ignore', 'ipc'])) {
    process.stdout.write(JSON.stringify({ diagnostic: 'spawn-policy', correctExecutable: command === process.execPath,
      argCount: childArgs.length, fixedChecker: childArgs[0] === checker, emptyEnv: !Object.keys(options.env).length }));
    return forbidden();
  }
  count++;
  return rawSpawn(command, [fileURLToPath(import.meta.url), checker, 'checker', childArgs[1]], options);
};
cp.fork = forbidden; cp.exec = forbidden; cp.execSync = forbidden; cp.execFile = forbidden; cp.spawnSync = forbidden;
cp.execFileSync = (command, commandArgs, options) => {
  if (!['/bin/ls', '/usr/bin/getfacl'].includes(command)) return forbidden();
  return acl(command, commandArgs, options);
};
workers.Worker = class { constructor() { forbidden(); } };
syncBuiltinESMExports();
const expected = ['usage', 'non-tty'].includes(mode) || mode.startsWith('guard-') ? 0 : 1;
process.on('exit', () => { if (mode !== 'checker' && count !== expected) {
  process.stdout.write(JSON.stringify({ diagnostic: 'fixture-count', count, code: process.exitCode,
    envCount: Object.keys(process.env).length, execArgCount: process.execArgv.length }));
  process.exitCode = 98;
} });
const poison = Object.create(null);
for (const key of ['message', 'stack', 'cause', 'toString', 'toJSON']) Object.defineProperty(poison, key, {
  get() { process.stdout.write('PRIVATE_GETTER'); throw 1; },
});
if (mode.startsWith('guard-')) {
  const { installR2LauncherFatalGuards } = await import(new URL('./r2-launcher-bootstrap.js', pathToFileURL(entry)));
  const guard = installR2LauncherFatalGuards();
  if (mode === 'guard-priority') { guard.remember(73); process.exit(guard.priority() ?? 70); }
  if (mode === 'guard-73') { guard.remember(73); guard.remember(71); }
  if (mode === 'guard-71') guard.remember(71);
  if (mode === 'guard-unknown') guard.remember('PRIVATE_TOKEN');
  // Node itself can coerce an uncaught non-Error object before our handler. Test poisoned getters via rejection.
  if (mode === 'guard-throw') queueMicrotask(() => { throw Error('PRIVATE_FATAL_ERROR'); });
  else void Promise.reject(poison);
} else {
  Object.defineProperty(process.stderr, 'isTTY', { value: mode !== 'non-tty', configurable: true });
  if (mode === 'throw') process.stderr.write = () => { throw poison; };
  if (mode === 'blocked') process.stderr.write = () => true;
  if (mode === 'fatal') process.stderr.write = () => { void Promise.reject(poison); return true; };
  process.argv = [process.execPath, entry, ...args];
  await import(pathToFileURL(entry).href);
}
