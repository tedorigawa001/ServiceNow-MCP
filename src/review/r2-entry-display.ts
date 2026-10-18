/** Offline entry notices only. Independent of host/loopback/ready display and never a fallback sink. */
import type { Writable } from 'node:stream';
export type R2EntryOutput = Writable & { isTTY?: boolean };
export function canWriteR2EntryNotice(output: R2EntryOutput, timeoutMs: number): boolean {
  return output.isTTY === true && !output.destroyed && !output.writableEnded && output.writable
    && Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 1000;
}
const guards = new WeakMap<Writable, { pending: number; sink: () => void }>();
function nativeGuard(output: Writable): () => void {
  let value = guards.get(output);
  if (!value) { value = { pending: 0, sink: () => {} }; guards.set(output, value); output.on('error', value.sink); }
  const owned = value; owned.pending++; let released = false;
  return () => {
    if (released) return; released = true;
    setImmediate(() => { if (--owned.pending === 0) { output.off('error', owned.sink); guards.delete(output); } });
  };
}
export async function writeR2EntryNotice(output: R2EntryOutput, text: string, signal: AbortSignal, timeoutMs: number): Promise<boolean> {
  if (!canWriteR2EntryNotice(output, timeoutMs) || signal.aborted || Buffer.byteLength(text) > 16384) return false;
  const end = performance.now() + timeoutMs;
  let notificationFailed = false;
  let detach = () => {};
  const result = await new Promise<boolean>(resolve => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return; settled = true; clearTimeout(timer);
      signal.removeEventListener('abort', failed);
      if (!ok) detach();
      resolve(ok);
    };
    const failed = () => { notificationFailed = true; finish(false); };
    detach = () => { output.off('error', failed); output.off('close', failed); };
    const timer = setTimeout(failed, timeoutMs);
    output.on('error', failed); output.on('close', failed); signal.addEventListener('abort', failed, { once: true });
    const release = nativeGuard(output);
    try { output.write(text, error => { release(); finish(!error && !signal.aborted && performance.now() < end); }); }
    catch { release(); finish(false); }
  });
  // Let a successful native write's error-notification turn and guard release finish before exit 0.
  if (result) await new Promise<void>(resolve => setImmediate(resolve));
  detach();
  return result && !notificationFailed && !signal.aborted && performance.now() < end;
}
