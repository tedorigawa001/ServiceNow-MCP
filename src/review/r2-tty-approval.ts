/** Cooked-mode, one-line approval. Internal boundary, not a public command or approval proof. */
import type { Readable, Writable } from 'node:stream';
import { r2PlanCheckSchema, type R2PlanCheck } from './r2-plan-check.js';
export type R2TtyResult = { ok: true } | { ok: false; code: 'approval_denied' | 'approval_timeout' | 'approval_cancelled' | 'approval_unavailable' };
export interface R2TtyOptions {
  input?: Readable & { isTTY?: boolean; isRaw?: boolean };
  output?: Writable & { isTTY?: boolean };
  signal?: AbortSignal;
  signalOwner?: 'tty' | 'caller';
  timeoutMs?: number;
  checkedPlan?: R2PlanCheck;
}
export async function requestR2TtyApproval(digest: string, options: R2TtyOptions = {}): Promise<R2TtyResult> {
  options = { ...options };
  const input = options.input ?? process.stdin, output = options.output ?? process.stderr;
  const timeout = options.timeoutMs ?? 60000;
  const plan = options.checkedPlan === undefined ? undefined : r2PlanCheckSchema.safeParse(options.checkedPlan);
  if (plan && (!plan.success || plan.data.status !== 'offline_valid' || plan.data.digest !== digest)) return { ok: false, code: 'approval_unavailable' };
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest) || !Number.isInteger(timeout) || timeout < 1 || timeout > 60000
    || !input.isTTY || input.isRaw || !output.isTTY || input.destroyed || output.destroyed || input.readableEnded
    || input.readableLength || input.listenerCount('data') || input.listenerCount('readable')
    || ![undefined, 'tty', 'caller'].includes(options.signalOwner) || options.signalOwner === 'caller' && !options.signal) {
    return { ok: false, code: 'approval_unavailable' };
  }
  if (options.signal?.aborted) return { ok: false, code: 'approval_cancelled' };
  const end = performance.now() + timeout;
  return await new Promise<R2TtyResult>(resolve => {
    let settled = false, text = '', ready = false;
    const finish = (result: R2TtyResult) => {
      if (settled) return; settled = true;
      clearTimeout(timer); text = '';
      input.pause(); input.off('data', data); input.off('end', denied); input.off('close', denied); input.off('error', unavailable);
      output.off('error', unavailable); options.signal?.removeEventListener('abort', cancelled);
      if (options.signalOwner !== 'caller') { process.off('SIGINT', cancelled); process.off('SIGTERM', cancelled); }
      resolve(result);
    };
    const denied = () => finish({ ok: false, code: 'approval_denied' });
    const unavailable = () => finish({ ok: false, code: 'approval_unavailable' });
    const cancelled = () => finish({ ok: false, code: 'approval_cancelled' });
    const expired = () => finish({ ok: false, code: 'approval_timeout' });
    const data = (chunk: Buffer | string) => {
      if (performance.now() >= end) { expired(); return; }
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (!ready || bytes.length + text.length > 64 || bytes.some(value => value > 127 || value === 3 || value === 4)) { denied(); return; }
      text += bytes.toString('ascii');
      if (!/^[A-Z\r\n]*$/.test(text)) { denied(); return; }
      if (text.includes('\n')) finish(text === 'APPROVE\n' || text === 'APPROVE\r\n' ? { ok: true } : { ok: false, code: 'approval_denied' });
    };
    const timer = setTimeout(expired, timeout);
    input.on('data', data); input.on('end', denied); input.on('close', denied); input.on('error', unavailable);
    input.pause(); output.on('error', unavailable);
    options.signal?.addEventListener('abort', cancelled, { once: true });
    if (options.signalOwner !== 'caller') { process.on('SIGINT', cancelled); process.on('SIGTERM', cancelled); }
    if (options.signal?.aborted) { cancelled(); return; }
    try {
      const confirmation = plan?.success ? `${JSON.stringify(plan.data)}\n` : '';
      output.write(`${confirmation}Offline plan digest: ${digest}\nThis is not proof of G2/G4 approval. Verify the private plan and external approval.\nType APPROVE to authorize this single attempt, or anything else to stop:\n`, error => {
        if (settled) return;
        if (error || input.readableLength) { unavailable(); return; }
        if (performance.now() >= end) { expired(); return; }
        ready = true; input.resume();
      });
    } catch { unavailable(); }
  });
}
