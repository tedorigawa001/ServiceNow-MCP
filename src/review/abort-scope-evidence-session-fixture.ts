/** Fake-source issuer ONLY. No live source/ReleasePermit acceptance or evidence issuance. */
import { z } from 'zod';
import { registerPreparedFixtureSource, claimPreparedFixtureOwner, preparedOwnerStatus, assertPreparedOwner,
  refusePreparedEvidenceIssuance, type PreparedEvidenceOwner } from '../servicenow/review-evidence-lifecycle.js';
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
  });
}
