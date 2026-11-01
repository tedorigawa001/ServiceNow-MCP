/** Internal non-executable values only. A fixture-created owner is not session/source evidence. */
import {compareRelease,parseReleaseComparisonInput,RELEASE_COMPARISON_MODEL,type ReleaseComparisonInput,type ReleaseComparisonDraft} from './release-comparison.js';

export type ReleaseComparisonProjection=Readonly<{session:object;source:object;key:object;
  timing:Readonly<{started_at:string;deadline_ms:number}>;policy:ReleaseComparisonInput['policy']}>;
export function createReleaseComparisonReceiptOwner(projection:ReleaseComparisonProjection,ack:object,
  dependencies:Readonly<{check():void;reject():never}>){
  const {session,source,key,timing,policy}=projection,started=timing.started_at,duration=timing.deadline_ms;
  const check=dependencies.check,reject=dependencies.reject;
  let state:'bound'|'issuing'|'issued'|'comparing'|'compared'|'accepting'|'accepted'|'transferring'|'transferred'|'failed'|'closed'='bound';
  const receipts=new Map<object,ReleaseComparisonInput>(),candidates=new Map<object,{draft:ReleaseComparisonDraft;observed:string}>();
  let accepted:{draft:ReleaseComparisonDraft;observed:string}|undefined;
  const fail=():never=>{receipts.clear();candidates.clear();accepted=undefined;if(state!=='closed')state='failed';return reject();};
  const binding=(value:ReleaseComparisonProjection)=>{
    if(value!==projection||projection.session!==session||projection.source!==source||projection.key!==key||projection.timing!==timing||
      timing.started_at!==started||timing.deadline_ms!==duration||projection.policy!==policy)throw Error('binding');
  };
  return Object.freeze({
    issue(value:ReleaseComparisonProjection,claim:object,rows:unknown,observed:string):object{
      if(state!=='bound')return fail();state='issuing';
      try{
        check();binding(value);if(claim!==ack)throw Error('binding');
        // pinReviewReleaseConfig retains an own issue:undefined on a valid assertion.
        // Omit unset optionals in the value projection, never mutate/re-pin policy.
        const policyValue:Record<string,unknown>={...policy};
        if(policyValue.assertion===undefined)delete policyValue.assertion;
        if(policyValue.issue===undefined)delete policyValue.issue;
        const parsed=parseReleaseComparisonInput({model_id:RELEASE_COMPARISON_MODEL,timing:{started_at:started,deadline_ms:duration,observed_at:observed},policy:policyValue,observation:{kind:'complete_200',rows}});
        if(!parsed.ok||Date.parse(observed)<Date.parse(started)||Date.parse(observed)>Date.parse(started)+duration)throw Error('input');
        check();binding(value);if(state!=='issuing')throw Error('state');
        const receipt=Object.freeze(Object.create(null));receipts.set(receipt,parsed.input);state='issued';return receipt;
      }catch{return fail();}
    },
    compare(value:ReleaseComparisonProjection,receipt:object):object{
      const input=receipts.get(receipt);receipts.delete(receipt);
      if(state!=='issued')return fail();state='comparing';
      try{
        check();binding(value);if(!input)throw Error('receipt');
        const result=compareRelease(input);check();binding(value);
        if(!result.ok||state!=='comparing')throw Error('comparison');
        const candidate=Object.freeze(Object.create(null));candidates.set(candidate,{draft:result,observed:input.timing.observed_at!});state='compared';return candidate;
      }catch{return fail();}
    },
    accept(value:ReleaseComparisonProjection,candidate:object){
      const result=candidates.get(candidate);candidates.delete(candidate);
      if(state!=='compared')return fail();state='accepting';
      try{
        check();binding(value);if(!result)throw Error('candidate');
        check();binding(value);if(state!=='accepting')throw Error('state');
        accepted=result;state='accepted';
      }catch{return fail();}
    },
    takeAcceptedTime(value:ReleaseComparisonProjection):string{
      const result=accepted;accepted=undefined;
      if(state!=='accepted')return fail();state='transferring';
      try{
        check();binding(value);if(!result)throw Error('accepted');
        check();binding(value);if(state!=='transferring')throw Error('state');
        state='transferred';return result.observed;
      }catch{return fail();}
    },
    close(){receipts.clear();candidates.clear();accepted=undefined;state='closed';},
    inspect(){return Object.freeze({state,observed_at:accepted?.observed??null,comparison:accepted?.draft??null});},
  });
}
