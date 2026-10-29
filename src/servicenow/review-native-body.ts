/** NA-03 injected-only native proof consumer. No fixture registry or real-session adoption. */
import { createInjectedNativeReaderOwner } from './review-native-adapter.js';
import { createBootstrapBodyLane, BootstrapBodyFailure, type BootstrapBodyCode } from './review-bootstrap-body.js';
type Dependencies = Parameters<typeof createInjectedNativeReaderOwner>[0];
type Hooks = Parameters<typeof createBootstrapBodyLane>[0];
type Descriptor = Parameters<ReturnType<typeof createInjectedNativeReaderOwner>['acquire']>[0];
type NativeCode = Extract<Awaited<ReturnType<ReturnType<typeof createInjectedNativeReaderOwner>['acquire']>>, {
    ok: false;
}>['code'];
const mapped = (code: NativeCode): BootstrapBodyCode => code === 'attempt_deadline_exceeded' ? 'upstream_unavailable' : code;
function take<T>(result: Readonly<{
    ok: true;
    value: T;
} | {
    ok: false;
    code: NativeCode;
}>): T {
    if (!result.ok)
        throw new BootstrapBodyFailure(mapped(result.code));
    return result.value;
}
export function createInjectedNativeBodyLane(deps: Dependencies, input: Hooks) {
    const hooks = { ...input }, native = createInjectedNativeReaderOwner(deps), body = createBootstrapBodyLane(hooks);
    let busy = false, stopped: BootstrapBodyCode | undefined, proofs = 0;
    return Object.freeze({
        async read(descriptor: Descriptor) {
            if (stopped || busy) {
                stopped ??= 'invalid_state';
                native.stop('closed');
                body.revoke();
                hooks.stop(stopped);
                throw new BootstrapBodyFailure(stopped);
            }
            busy = true;
            // No resource or evidence supplied by a caller is accepted at this boundary.
            let owned: Extract<Awaited<ReturnType<typeof native.acquire>>, {
                ok: true;
            }>['value'] | undefined, finished = false;
            try {
                hooks.check();
                owned = take(await native.acquire(descriptor));
                hooks.check();
                const attempt = Object.freeze({});
                body.open(attempt, owned.status);
                for (;;) {
                    hooks.check();
                    const next = take(await native.read(owned.handle));
                    hooks.check();
                    if (next.done)
                        break;
                    body.append(attempt, next.value!);
                }
                const end = take(await native.finish(owned.handle));
                finished = true;
                const cleanup = take(native.consumeEnd(owned.handle, end.evidence));
                proofs++;
                hooks.check();
                if (cleanup.kind !== 'eof')
                    throw new BootstrapBodyFailure('invalid_response');
                const candidate = body.finish(attempt, { eof: true, pending_read: false, cancel: 'not_requested', closed: 'fulfilled', lock: 'released' });
                if (!candidate)
                    throw new BootstrapBodyFailure('invalid_response');
                const draft = body.consume(attempt, candidate);
                await Promise.resolve();
                return body.acknowledge(attempt, draft);
            }
            catch (error) {
                stopped ??= error instanceof BootstrapBodyFailure ? error.code : 'internal_review_error';
                native.stop(stopped === 'cancelled' ? 'cancelled' : 'closed');
                if (owned && !finished)
                    await native.finish(owned.handle);
                body.revoke();
                hooks.stop(stopped);
                throw new BootstrapBodyFailure(stopped);
            }
            finally {
                busy = false;
            }
        },
        revoke() { stopped ??= 'closed'; body.revoke(); native.stop('closed'); },
        diagnostic() { const status = native.status(); return Object.freeze({ ...body.diagnostic(), cleanup: status.cleanup, proofs_consumed: proofs, native: status.operations, native_primary: status.primary }); },
    });
}
