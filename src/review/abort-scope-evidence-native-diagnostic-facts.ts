/** VK01/02: values only. These predicates do not establish provenance or grant acceptance. */
import type {NativeCleanup,NativeFacts,NativeReason} from './abort-scope-evidence-native-diagnostic-state.js';

export type NativeOperations=Readonly<{get_reader:number;closed:number;cancel:number;release_lock:number;read:number}>;

/** The caller captures before releaseLock; release is the subsequent fixed-operation result. */
export function nativeCleanupReason(body:boolean,before:Omit<NativeFacts,'release'>,release:NativeFacts['release'],issue:NativeReason|null):NativeReason|null {
    return !body ? issue : !before.reader_owned || !before.closed_captured ? 'reader_owner_unknown' :
        before.cancel === 'pending' || before.cancel === 'not_requested' ? 'cancel_pending' : before.cancel === 'rejected' ? 'cancel_rejected' :
        before.closed !== 'fulfilled' ? before.closed === 'rejected' ? 'closed_rejected' : 'closed_pending' :
        release !== 'succeeded' ? 'lock_release_failed' : issue;
}

/** Trusted local values only: identity, status, reader retirement and claims stay with the caller. */
export function nativeCleanupFactsEligible(body:boolean,c:NativeCleanup,operations:NativeOperations):boolean {
    const f=c.facts;
    if (c.disposition !== 'confirmed' || c.reason || c.wait_issue || operations.read !== 0) return false;
    return body ? c.kind === 'cancelled' && f.reader_owned && f.closed_captured && f.cancel === 'fulfilled' && f.closed === 'fulfilled' &&
        f.release === 'succeeded' && operations.get_reader === 1 && operations.closed === 1 && operations.cancel === 1 && operations.release_lock === 1 :
        c.kind === 'no_body' && f.cancel === 'not_applicable' && f.closed === 'not_applicable' && f.release === 'not_applicable' && Object.values(operations).every(n => n === 0);
}
