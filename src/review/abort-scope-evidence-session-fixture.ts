/** Fake-source issuer ONLY. No live source/ReleasePermit acceptance or evidence issuance. */
import { z } from 'zod';
import { registerPreparedFixtureSource, claimPreparedFixtureOwner, preparedOwnerStatus, assertPreparedOwner,
  refusePreparedEvidenceIssuance, type PreparedEvidenceOwner } from './abort-scope-evidence-fixture-lifecycle.js';
import { createPreparedFixtureWindow,preparedWindowInfo,preparedWindowRow,beginPreparedPayload,settlePreparedPayload,
  claimPreparedTransfer,consumePreparedTransfer,type PreparedSelectionWindow,type PreparedSelectedRow,
  type PreparedPayloadStart,type PreparedPayloadReady,type PreparedTransferClaim } from './abort-scope-evidence-fixture-lifecycle.js';
const schema=z.strictObject({parent_ready:z.boolean(),final_started:z.boolean(),release_match:z.enum(['matched','mismatched','unknown'])});
export function createFakeSessionOwnerIssuer(){
  const known=new WeakSet<object>();
  const owned=new WeakSet<PreparedEvidenceOwner>();
  return Object.freeze({
    source(session:object,raw:unknown,authSession:object=session){
      try{
        const p=schema.safeParse(structuredClone(raw));if(!p.success)return {ok:false as const,code:'invalid_input'};
        const source=Object.freeze(Object.create(null)) as object;
        const permit=p.data.release_match==='matched'?Object.freeze(Object.create(null)) as object:null;
        const registered=registerPreparedFixtureSource(session,source,permit,{parentReady:p.data.parent_ready,
          finalStarted:p.data.final_started,matched:p.data.release_match==='matched'},authSession);
        if(!registered.ok)return registered;known.add(source);
        return {ok:true as const,value:Object.freeze({source,permit})};
      }catch{return {ok:false as const,code:'invalid_input'};}
    },
    claim(session:object,source:object,permit:object|null){
      if(!known.has(source))return {ok:false as const,code:'evidence_binding_mismatch'};
      const result=claimPreparedFixtureOwner(session,source,permit);if(result.ok)owned.add(result.value);return result;
    },
    status(owner:PreparedEvidenceOwner){return owned.has(owner)?preparedOwnerStatus(owner):{ok:false as const,code:'evidence_binding_mismatch'};},
    check(owner:PreparedEvidenceOwner){return owned.has(owner)?assertPreparedOwner(owner):{ok:false as const,code:'evidence_binding_mismatch'};},
    issue(owner:PreparedEvidenceOwner){return owned.has(owner)?refusePreparedEvidenceIssuance(owner):{ok:false as const,code:'evidence_binding_mismatch'};},
    window(owner:PreparedEvidenceOwner,session:object,raw:unknown){return owned.has(owner)?createPreparedFixtureWindow(owner,session,raw):{ok:false as const,code:'evidence_binding_mismatch'};},
    windowInfo(owner:PreparedEvidenceOwner,session:object,window:PreparedSelectionWindow){return owned.has(owner)?preparedWindowInfo(owner,session,window):{ok:false as const,code:'evidence_binding_mismatch'};},
    row(owner:PreparedEvidenceOwner,session:object,window:PreparedSelectionWindow,ordinal:number){return owned.has(owner)?preparedWindowRow(owner,session,window,ordinal):{ok:false as const,code:'evidence_binding_mismatch'};},
    begin(owner:PreparedEvidenceOwner,session:object,window:PreparedSelectionWindow,row:PreparedSelectedRow){return owned.has(owner)?beginPreparedPayload(owner,session,window,row):{ok:false as const,code:'evidence_binding_mismatch'};},
    settle(owner:PreparedEvidenceOwner,session:object,start:PreparedPayloadStart,outcome:'ready'|'unavailable'){return owned.has(owner)?settlePreparedPayload(owner,session,start,outcome):{ok:false as const,code:'evidence_binding_mismatch'};},
    transfer(owner:PreparedEvidenceOwner,session:object,row:PreparedSelectedRow,ready:PreparedPayloadReady){return owned.has(owner)?claimPreparedTransfer(owner,session,row,ready):{ok:false as const,code:'evidence_binding_mismatch'};},
    consumeTransfer(owner:PreparedEvidenceOwner,session:object,claim:PreparedTransferClaim){return owned.has(owner)?consumePreparedTransfer(owner,session,claim):{ok:false as const,code:'evidence_binding_mismatch'};},
  });
}
