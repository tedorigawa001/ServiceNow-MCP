// Synthetic OS boundary guards, not a replacement for checker/manifest implementation.
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import cp from 'node:child_process';
import workers from 'node:worker_threads';
import { syncBuiltinESMExports } from 'node:module';
let attempts = 0;
const forbidden = () => { attempts++; throw Error('PRIVATE_FORBIDDEN_EFFECT'); };
net.Server.prototype.listen = forbidden;
net.Socket.prototype.connect = forbidden;
http.request = forbidden; http.get = forbidden;
https.request = forbidden; https.get = forbidden;
dns.lookup = forbidden; dns.resolve = forbidden;
dns.promises.lookup = forbidden; dns.promises.resolve = forbidden;
globalThis.fetch = forbidden;
cp.spawn = forbidden; cp.fork = forbidden; cp.exec = forbidden; cp.execSync = forbidden; cp.execFile = forbidden;
const aclCommand = cp.execFileSync;
cp.execFileSync = (command, args, options) => {
  if (!['/bin/ls', '/usr/bin/getfacl'].includes(command)) return forbidden();
  return aclCommand(command, args, options);
};
workers.Worker = class { constructor() { forbidden(); } };
syncBuiltinESMExports();
try {
  const { checkR2PlanOffline, rejectedR2PlanCheck } = await import('../../../src/review/r2-plan-check.ts');
  const receipt = await checkR2PlanOffline(process.argv[2]);
  const result = attempts ? rejectedR2PlanCheck('checker_failed') : receipt;
  process.send(result, error => {
    if (error) process.exit(10);
    process.exitCode = result.status === 'offline_valid' ? 0 : 10;
    process.disconnect();
  });
} catch { process.exit(70); }
