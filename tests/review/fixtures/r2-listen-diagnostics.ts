/** Synthetic-test observer only. Never records HTTP, OAuth material, paths or error messages. */
import { Server } from 'node:http';
import { vi } from 'vitest';

type Stage = 'stage_entered' | 'root_abort' | 'host_spawn' | 'host_exit';
type Event = { at_ms: number; kind: string; listener?: number; code?: string; cleanup_complete?: boolean };
const osCodes = new Set(['EADDRINUSE', 'EPERM', 'EACCES', 'EINVAL', 'ABORT_ERR']);
const runnerCodes = new Set(['callback_unavailable', 'cancelled', 'exchange_outcome_unknown', 'secret_output_detected',
  'deadline_exceeded', 'cleanup_incomplete']);
export function observeR2Listen() {
  const started = process.hrtime.bigint(), events: Event[] = [];
  const watched: { server: Server; listening: () => void; error: (e: unknown) => void; close: () => void }[] = [];
  let dropped = 0;
  const add = (value: Omit<Event, 'at_ms'>) => {
    if (events.length === 128) { dropped++; return; }
    events.push({ at_ms: Number((process.hrtime.bigint() - started) / 1000000n), ...value });
  };
  const original = Server.prototype.listen;
  const spy = vi.spyOn(Server.prototype, 'listen').mockImplementation(function(this: Server, ...args: unknown[]) {
    const option = args[0];
    if (option && typeof option === 'object' && Object.getOwnPropertyDescriptor(option, 'port')?.value === 18765
      && Object.getOwnPropertyDescriptor(option, 'host')?.value === '127.0.0.1') {
      const listener = watched.length + 1;
      const listening = () => add({ kind: 'listening', listener });
      const close = () => add({ kind: 'close', listener });
      const error = (e: unknown) => {
        const code: unknown = e && typeof e === 'object' ? Object.getOwnPropertyDescriptor(e, 'code')?.value : undefined;
        add({ kind: 'listen_error', listener, code: typeof code === 'string' && osCodes.has(code) ? code : 'other' });
      };
      watched.push({ server: this, listening, error, close });
      this.on('listening', listening); this.on('error', error); this.on('close', close);
      add({ kind: 'listen_attempt', listener });
    }
    return Reflect.apply(original, this, args) as Server;
  });
  return {
    mark: (kind: Stage) => add({ kind }),
    runner: (result: { ok: boolean; code?: string; cleanup: string }) => add({ kind: 'runner_result',
      code: result.ok ? 'ok' : runnerCodes.has(result.code ?? '') ? result.code : 'other', cleanup_complete: result.cleanup === 'complete' }),
    snapshot: () => ({ events: events.map(e => ({ ...e })), dropped, listening: watched.filter(w => w.server.listening).length }),
    close: () => {
      spy.mockRestore();
      for (const w of watched) {
        w.server.removeListener('listening', w.listening); w.server.removeListener('error', w.error); w.server.removeListener('close', w.close);
      }
    },
  };
}
