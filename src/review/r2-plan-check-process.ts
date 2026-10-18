/** Owns exactly one fixed offline checker child, never an R-2 host. Internal API only. */
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isAbsolute, normalize } from 'node:path';
import { r2PlanCheckSchema, rejectedR2PlanCheck, type R2PlanCheck } from './r2-plan-check.js';

export interface R2PlanCheckProcessOptions {
  signal?: AbortSignal;
  /** Trusted OS test boundary. Not a manifest/argv/env/MCP input. */
  spawnChecker?: (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
  /** Lower-only synthetic deadlines. Never execution budget extensions. */
  timeoutMs?: number; observationMs?: number;
}
export async function runR2PlanCheck(path: string, options: R2PlanCheckProcessOptions = {}): Promise<R2PlanCheck> {
  options = { ...options };
  const timeout = options.timeoutMs ?? 5000, observation = options.observationMs ?? 1000;
  if (typeof path !== 'string' || !isAbsolute(path) || normalize(path) !== path || path.length > 4096 || path.includes('\0')
    || !Number.isInteger(timeout) || timeout < 1 || timeout > 5000
    || !Number.isInteger(observation) || observation < 1 || observation > 1000 || process.platform === 'win32') return rejectedR2PlanCheck('checker_failed');
  if (options.signal?.aborted) return rejectedR2PlanCheck('checker_cancelled');
  const end = performance.now() + timeout;
  let child: ChildProcess;
  try {
    const source = import.meta.url.endsWith('.ts');
    const entry = fileURLToPath(new URL(source ? './r2-plan-check-entry.ts' : './r2-plan-check-entry.js', import.meta.url));
    const args = [...(source ? ['--import', fileURLToPath(import.meta.resolve('tsx'))] : []), entry, path];
    child = (options.spawnChecker ?? spawn)(process.execPath, args,
      { env: {}, shell: false, detached: true, serialization: 'json', stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  } catch { return rejectedR2PlanCheck('checker_failed'); }
  return await new Promise<R2PlanCheck>(resolve => {
    let receipt: R2PlanCheck | undefined, exit = false, close = false, settled = false, stopping = false;
    let failure: R2PlanCheck | undefined, exitCode: number | null = null, exitSignal: NodeJS.Signals | null = null;
    let observationTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (settled) return; settled = true;
      clearTimeout(timer); clearTimeout(observationTimer);
      options.signal?.removeEventListener('abort', cancel);
      child.off('message', message); child.off('exit', exited); child.off('close', closed);
      if (!exit || !close) {
        try { if (child.connected) child.disconnect(); } catch { /* fixed failure only */ }
        child.unref(); resolve(rejectedR2PlanCheck('checker_termination_unconfirmed')); return;
      }
      if (!failure && performance.now() >= end) failure = rejectedR2PlanCheck('checker_timeout');
      const expected = receipt?.status === 'offline_valid' ? 0 : 10;
      resolve(failure ?? (receipt && exitSignal === null && exitCode === expected ? receipt : rejectedR2PlanCheck('checker_failed')));
    };
    const observe = () => { observationTimer ??= setTimeout(finish, observation); };
    const stop = (code: 'checker_failed' | 'checker_timeout' | 'checker_cancelled') => {
      if (settled || stopping) return; stopping = true;
      receipt = undefined; failure = rejectedR2PlanCheck(code);
      if (!exit && child.exitCode === null && child.signalCode === null) {
        try { child.kill('SIGKILL'); } catch { /* A kill request is not proof of exit. */ }
      }
      if (exit && close) finish(); else observe();
    };
    const cancel = () => stop('checker_cancelled');
    const message = (value: unknown, handle: unknown) => {
      if (settled || stopping) return;
      if (performance.now() >= end) { stop('checker_timeout'); return; }
      try {
        if (handle || receipt || Buffer.byteLength(JSON.stringify(value)) > 8192) throw 1;
        const parsed = r2PlanCheckSchema.safeParse(value);
        if (!parsed.success) throw 1;
        receipt = parsed.data;
      } catch { stop('checker_failed'); }
    };
    const exited = (code: number | null, signal: NodeJS.Signals | null) => {
      exit = true; exitCode = code; exitSignal = signal;
      if (close) finish(); else observe();
    };
    const closed = () => { close = true; if (exit) finish(); else stop('checker_failed'); };
    child.on('message', message); child.on('exit', exited); child.on('close', closed);
    child.on('error', () => { stop('checker_failed'); }); // No raw late OS error output.
    const timer = setTimeout(() => stop('checker_timeout'), Math.max(0, Math.ceil(end - performance.now())));
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
  });
}
