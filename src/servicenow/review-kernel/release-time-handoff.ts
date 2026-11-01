/** Fixed, non-authoritative value assembly. Runtime construction remains private to its session. */
import {createReleaseComparisonReceiptOwner,type ReleaseComparisonProjection} from './release-comparison-receipt.js';
import {createReleaseTimeScope,type ReleaseTimeBinding,type ReleaseTimeStop} from './release-time-owner.js';
export function createReleaseTimeHandoff(projection:ReleaseComparisonProjection,ack:object,
  context:Readonly<{run:object;budget:object;origin:object}>,
  dependencies:Readonly<{checkSource():void;checkRun():void;reject(error:unknown):never}>){
  let sourceCheck:typeof dependencies.checkSource|undefined=dependencies.checkSource;
  const runCheck=dependencies.checkRun,reject=dependencies.reject;
  let sourceProjection:ReleaseComparisonProjection|undefined=projection;
  let contextRef:typeof context|undefined=context,pinned:typeof context|undefined={...context};
  let binding:ReleaseTimeBinding|undefined=Object.freeze({...context,session:projection.session,source:projection.source,key:projection.key,started_at:projection.timing.started_at,deadline_ms:projection.timing.deadline_ms});
  let stage:'source'|'transferring'|'transferred'|'closing_source'|'source_closed'|'discarding'|'discarded'|'failed'='source';
  let sourceReleased=false,pendingError:unknown;
  const code=(error:unknown):ReleaseTimeStop=>{
    try{
      const value=typeof error==='string'?error:error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,'code')?.value:undefined;
      return value==='cancelled'||value==='deadline_exceeded'?value:'internal_review_error';
    }catch{return 'internal_review_error';}
  };
  const check=()=>{
    try{
      if(!pinned||!contextRef||contextRef.run!==pinned.run||contextRef.budget!==pinned.budget||contextRef.origin!==pinned.origin)throw Error('binding');
      if(sourceReleased)runCheck();else{if(!sourceCheck)throw Error('source');sourceCheck();}
    }catch(error){pendingError??=error;throw error;}
  };
  const time=createReleaseTimeScope(binding,()=>{try{check();return undefined;}catch(error){return code(error);}});
  let receipt:ReturnType<typeof createReleaseComparisonReceiptOwner>|undefined;
  const clear=()=>{receipt?.close();receipt=undefined;sourceProjection=undefined;sourceCheck=undefined;binding=undefined;contextRef=pinned=undefined;};
  const fail=(error?:unknown):never=>{
    const cause=pendingError??error;pendingError=undefined;
    if(stage!=='discarded'){stage='failed';time.revoke(code(cause));clear();}
    return reject(cause);
  };
  const requireStage=(expected:typeof stage)=>{if(stage!==expected)return fail();};
  receipt=createReleaseComparisonReceiptOwner(projection,ack,{check,reject:()=>fail()});
  try{time.allocate(binding);}catch(error){return fail(error);}
  return Object.freeze({
    issue(value:ReleaseComparisonProjection,claim:object,rows:unknown,observed:string){requireStage('source');return receipt!.issue(value,claim,rows,observed);},
    compare(value:ReleaseComparisonProjection,handle:object){requireStage('source');return receipt!.compare(value,handle);},
    accept(value:ReleaseComparisonProjection,handle:object){requireStage('source');receipt!.accept(value,handle);},
    handoff(value:ReleaseComparisonProjection){
      requireStage('source');stage='transferring';
      try{
        check();if(value!==sourceProjection)throw Error('projection');
        const observed=receipt!.takeAcceptedTime(value);
        time.observe(binding!,observed);time.accept(binding!,time.issue(binding!));
        check();if(stage!=='transferring')throw Error('state');stage='transferred';
      }catch(error){return fail(error);}
    },
    sourceClosed(){
      requireStage('transferred');stage='closing_source';
      try{
        check();receipt?.close();receipt=undefined;sourceProjection=undefined;sourceCheck=undefined;sourceReleased=true;
        check();if(stage!=='closing_source')throw Error('state');stage='source_closed';
      }catch(error){return fail(error);}
    },
    discard(){
      requireStage('source_closed');stage='discarding';
      try{time.discard(binding!);if(stage!=='discarding')throw Error('state');clear();stage='discarded';}catch(error){return fail(error);}
    },
    revoke(reason:unknown){if(stage!=='discarded'){stage='failed';time.revoke(code(reason));clear();pendingError=undefined;}},
    inspect(){return Object.freeze({stage,upper:time.inspect(),comparison:receipt?.inspect()??null});},
  });
}
