import {expect,it} from 'vitest';
import {createReleaseComparisonReceiptOwner,type ReleaseComparisonProjection} from '../../src/servicenow/review-kernel/release-comparison-receipt.js';
import {createReleaseTimeHandoff} from '../../src/servicenow/review-kernel/release-time-handoff.js';
const S='2026-11-01T00:00:00.000Z',O='2026-11-01T00:00:01.000Z';
const projection=():ReleaseComparisonProjection=>Object.freeze({session:{},source:{},key:{},timing:Object.freeze({started_at:S,deadline_ms:60000}),policy:Object.freeze({instanceBinding:'a'.repeat(64)})});
it('consumes the CT-A accepted UTC once instead of reading inspect data',()=>{
  const p=projection(),ack={},owner=createReleaseComparisonReceiptOwner(p,ack,{check:()=>{},reject:()=>{throw Error('internal_review_error');}});
  owner.accept(p,owner.compare(p,owner.issue(p,ack,[],O)));
  expect(owner.takeAcceptedTime(p)).toBe(O);
  expect(owner.inspect()).toMatchObject({state:'transferred',observed_at:null,comparison:null});
  expect(()=>owner.takeAcceptedTime(p)).toThrow('internal_review_error');
});
it('retains accepted empty-200 O across normal source cleanup, then discards at the fixed upper endpoint',()=>{
  const p=projection(),ack={},bridge=createReleaseTimeHandoff(p,ack,{run:{},budget:{},origin:{}},{checkSource:()=>{},checkRun:()=>{},reject:()=>{throw Error('internal_review_error');}});
  bridge.accept(p,bridge.compare(p,bridge.issue(p,ack,[],O)));bridge.handoff(p);bridge.sourceClosed();
  expect(bridge.inspect()).toMatchObject({stage:'source_closed',upper:{state:'held',time:{started_at:S,deadline_ms:60000,observed_at:O,last_utc:O}},comparison:null});
  bridge.discard();expect(bridge.inspect()).toMatchObject({stage:'discarded',upper:{state:'discarded',time:null},comparison:null});
});
function fixture(){
  const p=projection(),ack={},context={run:{},budget:{},origin:{}};
  let action=()=>{},reason:string|undefined,sourceGone=false;
  const error=(value:string)=>Object.assign(Error('PRIVATE_EXCEPTION'),{code:value});
  const checkRun=()=>{action();if(reason)throw error(reason);};
  const bridge=createReleaseTimeHandoff(p,ack,context,{checkSource:()=>{checkRun();if(sourceGone)throw error('closed');},checkRun,
    reject:err=>{reason??=(err as {code?:string}|undefined)?.code??'internal_review_error';throw Object.assign(Error(reason),{code:reason});}});
  const complete=(rows:unknown=[])=>bridge.accept(p,bridge.compare(p,bridge.issue(p,ack,rows,O)));
  return {p,ack,context,bridge,complete,arm:(next:()=>void)=>{action=next;},stop:(code:string)=>{reason??=code;throw error(reason);},sourceGone:()=>{sourceGone=true;}};
}
it('normal source release stops using source guard, while a stopped run cannot retain upper UTC',()=>{
  const f=fixture();f.complete();f.bridge.handoff(f.p);f.bridge.sourceClosed();f.sourceGone();
  expect(f.bridge.inspect().upper.time?.observed_at).toBe(O);f.bridge.discard();expect(f.bridge.inspect().stage).toBe('discarded');
  const g=fixture();g.complete();g.bridge.handoff(g.p);g.bridge.sourceClosed();g.bridge.revoke('cancelled');
  expect(g.bridge.inspect()).toMatchObject({stage:'failed',upper:{time:null,diagnostic:{code:'cancelled'}}});
});
it.each(Array.from({length:10},(_,i)=>i+1))('stops both sides and preserves the original failure at transfer guard %i',at=>{
  const f=fixture();f.complete();let n=0;f.arm(()=>{if(++n===at)f.stop(at%2?'cancelled':'deadline_exceeded');});
  expect(()=>f.bridge.handoff(f.p)).toThrow(at%2?'cancelled':'deadline_exceeded');
  expect(f.bridge.inspect()).toMatchObject({stage:'failed',upper:{time:null},comparison:null});expect(()=>f.bridge.handoff(f.p)).toThrow(at%2?'cancelled':'deadline_exceeded');
});
it.each(['handoff','sourceClosed','discard'] as const)('refuses a repeated %s without reviving any donor',method=>{
  const f=fixture();f.complete();f.bridge.handoff(f.p);
  if(method==='handoff')expect(()=>f.bridge.handoff(f.p)).toThrow('internal_review_error');
  else{f.bridge.sourceClosed();if(method==='sourceClosed')expect(()=>f.bridge.sourceClosed()).toThrow('internal_review_error');else{f.bridge.discard();expect(()=>f.bridge.discard()).toThrow('internal_review_error');}}
  expect(f.bridge.inspect().upper.time).toBeNull();
});
it.each(['not_accepted','foreign_projection','source_close_early','copied_draft'] as const)('does not issue from %s',mode=>{
  const f=fixture();if(mode!=='not_accepted')f.complete();
  if(mode==='source_close_early')expect(()=>f.bridge.sourceClosed()).toThrow('internal_review_error');
  else expect(()=>f.bridge.handoff(mode==='foreign_projection'?projection():mode==='copied_draft'?f.bridge.inspect() as never:f.p)).toThrow('internal_review_error');
  expect(f.bridge.inspect()).toMatchObject({stage:'failed',upper:{time:null},comparison:null});
});
it('does not accept guessed receipt data or affect a separate owner',()=>{
  const f=fixture(),g=fixture();f.complete();g.complete();
  expect(()=>f.bridge.accept(f.p,g.bridge.inspect() as never)).toThrow('internal_review_error');
  g.bridge.handoff(g.p);g.bridge.sourceClosed();expect(g.bridge.inspect().upper.time?.observed_at).toBe(O);
});
it.each(['run','budget','origin'] as const)('refuses a changed %s context at handoff',field=>{
  const f=fixture();f.complete();f.context[field]={};expect(()=>f.bridge.handoff(f.p)).toThrow('internal_review_error');expect(f.bridge.inspect().upper.time).toBeNull();
});
it.each([1,2])('fails closed when upper guard %i stops during source close',at=>{
  const f=fixture();f.complete();f.bridge.handoff(f.p);let n=0;f.arm(()=>{if(++n===at)f.stop('cancelled');});
  expect(()=>f.bridge.sourceClosed()).toThrow('cancelled');expect(f.bridge.inspect()).toMatchObject({stage:'failed',upper:{time:null},comparison:null});
});
it.each([1,2])('fails closed when discard guard %i stops after normal source cleanup',at=>{
  const f=fixture();f.complete();f.bridge.handoff(f.p);f.bridge.sourceClosed();f.sourceGone();let n=0;f.arm(()=>{if(++n===at)f.stop('deadline_exceeded');});
  expect(()=>f.bridge.discard()).toThrow('deadline_exceeded');expect(f.bridge.inspect().upper.time).toBeNull();
});
it('refuses caught reentry while a transfer is in flight',()=>{
  const f=fixture();f.complete();let first=true;f.arm(()=>{if(first){first=false;try{f.bridge.handoff(f.p);}catch{}}});
  expect(()=>f.bridge.handoff(f.p)).toThrow('internal_review_error');expect(f.bridge.inspect()).toMatchObject({stage:'failed',upper:{time:null},comparison:null});
});
it('clears both sides even if an injected guard throws an unreadable error object',()=>{
  const p=projection(),ack={};let armed=false;
  const opaque=new Proxy({}, {getOwnPropertyDescriptor(){throw Error('PRIVATE_TRAP');}});
  const bridge=createReleaseTimeHandoff(p,ack,{run:{},budget:{},origin:{}},{checkSource:()=>{if(armed)throw opaque;},checkRun:()=>{},reject:()=>{throw Error('internal_review_error');}});
  bridge.accept(p,bridge.compare(p,bridge.issue(p,ack,[],O)));armed=true;
  expect(()=>bridge.handoff(p)).toThrow('internal_review_error');expect(bridge.inspect()).toMatchObject({stage:'failed',upper:{time:null},comparison:null});
});
it.each([1,2])('clears the accepted donor at its consume guard %i and preserves cancellation',at=>{
  const p=projection(),ack={};let armed=false,n=0,reason='internal_review_error';
  const owner=createReleaseComparisonReceiptOwner(p,ack,{check:()=>{if(armed&&++n===at){reason='cancelled';throw Error('PRIVATE_CANCEL');}},reject:()=>{throw Error(reason);}});
  owner.accept(p,owner.compare(p,owner.issue(p,ack,[],O)));armed=true;
  expect(()=>owner.takeAcceptedTime(p)).toThrow('cancelled');expect(owner.inspect()).toMatchObject({state:'failed',observed_at:null,comparison:null});
});
it.each(['access_denied','phase_deadline_exceeded'])('preserves the upper original %s reason independently of normalized time diagnostics',reason=>{
  const f=fixture();f.complete();f.bridge.handoff(f.p);f.bridge.sourceClosed();f.arm(()=>f.stop(reason));
  expect(()=>f.bridge.discard()).toThrow(reason);
  expect(f.bridge.inspect()).toMatchObject({stage:'failed',upper:{time:null,diagnostic:{code:'internal_review_error'}}});
});
