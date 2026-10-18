/** Dedicated terminal output only. No raw JSON fallback, file, browser or network activity. */
import type { Writable } from 'node:stream';
import { R2_START_URL } from './r2-loopback.js';
import { summarizeR2Report, type R2ExitSummary } from './r2-report-summary.js';
type DisplayResult = { ok: true; summary: R2ExitSummary } | { ok: false; code: 'display_failed' | 'report_unavailable' };
// Native writes can settle after our bounded observation ended. Keep exactly one non-formatting
// sink per output while any such write remains; no text, error, report or credential is retained here.
const nativeGuards = new WeakMap<Writable, { pending: number; sink: () => void }>();
function guardNativeWrite(output: Writable): () => void {
  let guard = nativeGuards.get(output);
  if (!guard) { guard = { pending: 0, sink: () => {} }; nativeGuards.set(output, guard); output.on('error', guard.sink); }
  guard.pending++;
  const owned = guard; let released = false;
  return () => {
    if (released) return; released = true;
    // Node emits write errors after invoking the write callback. Observe that turn before detaching.
    setImmediate(() => {
      if (--owned.pending === 0) { output.off('error', owned.sink); nativeGuards.delete(output); }
    });
  };
}
export class R2TerminalDisplay {
  #failed = false; #closed = false; #ready = false; #writing = false; #shown = false;
  #pending: Promise<boolean> = Promise.resolve(true);
  #stopWrite?: () => void;
  readonly #onError = () => { this.#fail(); this.#stopWrite?.(); };
  constructor(private readonly output: Writable & { isTTY?: boolean }, private readonly onFailure: () => void,
    private readonly timeoutMs = 1000) {
    output.on('error', this.#onError);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1000 || !output.isTTY || output.destroyed || output.writableEnded) this.#fail();
  }
  #fail() {
    if (this.#failed) return; this.#failed = true;
    try { this.onFailure(); } catch { /* Never format a consumer exception. */ }
  }
  #write(text: string): Promise<boolean> {
    if (this.#failed || this.#closed || this.#writing || !this.output.isTTY || this.output.destroyed || this.output.writableEnded
      || Buffer.byteLength(text) > 16384) { this.#fail(); return Promise.resolve(false); }
    this.#writing = true;
    const end = performance.now() + this.timeoutMs;
    this.#pending = new Promise<boolean>(resolve => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return; settled = true;
        clearTimeout(timer); this.#stopWrite = undefined; this.#writing = false;
        if (!ok) this.#fail(); resolve(ok);
      };
      const timer = setTimeout(() => finish(false), this.timeoutMs);
      this.#stopWrite = () => finish(false);
      const release = guardNativeWrite(this.output);
      try { this.output.write(text, error => { release(); finish(!error && !this.#failed && performance.now() < end); }); }
      catch { release(); finish(false); }
    });
    return this.#pending;
  }
  /** Supervisor callback must remain synchronous; failure asynchronously aborts the owning run. */
  ready(): void {
    if (this.#ready || this.#closed || this.#shown) { this.#fail(); return; }
    this.#ready = true; void this.#write(`${R2_START_URL}\n`);
  }
  async readySettled(): Promise<boolean> { return await this.#pending && !this.#failed; }
  async show(report: unknown): Promise<DisplayResult> {
    if (this.#shown) { this.#fail(); return { ok: false, code: 'display_failed' }; }
    this.#shown = true;
    if (!await this.readySettled()) return { ok: false, code: 'display_failed' };
    const summary = summarizeR2Report(report);
    if (!summary) {
      const written = await this.#write('report_unavailable\n');
      this.#fail();
      return { ok: false, code: written ? 'report_unavailable' : 'display_failed' };
    }
    return await this.#write(`${JSON.stringify(summary)}\n`) ? { ok: true, summary } : { ok: false, code: 'display_failed' };
  }
  close() {
    if (this.#closed) return;
    this.#closed = true; this.#stopWrite?.(); this.output.off('error', this.#onError);
  }
}
