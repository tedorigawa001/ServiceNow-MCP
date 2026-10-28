import {expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {createSyntheticParentProjectionLane} from '../../src/review/abort-scope-evidence-closed-body-candidate.js';
import type {ClosedAccountingResult,ClosedReadAttempt,ClosedStateCode} from '../../src/review/abort-scope-evidence-closed-read-state.js';
const id='a'.repeat(32),row=()=>({sys_id:id,state:'private-state',application:'global',sys_updated_on:'2026-10-29 00:00:00',sys_mod_count:'90071992547409921'});
const clean={outcome:'success',eof:true,pending_read:false,cancel:'not_requested',closed:'fulfilled',lock:'released'};
const get=<T>(r:ClosedAccountingResult<T>):T=>{if(!r.ok)throw Error(r.code);return r.value;};
function setup(){
  let now=0,primary:ClosedStateCode|undefined,received=0,chunks=0,settled=0,after=()=>{},clock=()=>{};
  let lane:ReturnType<typeof createSyntheticParentProjectionLane>|undefined,attempt:ClosedReadAttempt;
  const no=(code:ClosedStateCode):ClosedAccountingResult<never>=>{primary??=code;lane?.revoke();return {ok:false,code:primary};};
  const cp=():ClosedAccountingResult<number>=>{clock();return primary?{ok:false,code:primary}:now>=60000?no('deadline_exceeded'):{ok:true,value:now};};
  lane=createSyntheticParentProjectionLane({
    guard<T>(work:()=>ClosedAccountingResult<T>):ClosedAccountingResult<T>{const b=cp();if(!b.ok)return b;const r=work();after();const a=cp();return a.ok?r:a;},
    checkpoint:cp,stop:no,stopProjection:no,responseLimit:4096,
    chunk(a,_sequence,length){if(a!==attempt)return no('evidence_binding_mismatch');received+=length;chunks++;return {ok:true,value:true};},
    settle(a){if(a!==attempt)return no('evidence_binding_mismatch');settled++;return {ok:true,value:true};},
    payload:()=>no('invalid_state'),discardPayload:()=>no('invalid_state'),
  },id);
  const model=lane;
  function start(kind:'parent_initial'|'parent_final'='parent_initial'){attempt=Object.freeze({}) as ClosedReadAttempt;model.start(attempt,kind);return attempt;}
  function capture(value:unknown={result:row()},kind:'parent_initial'|'parent_final'='parent_initial',raw?:Uint8Array){
    start(kind);
    const bytes=raw??new TextEncoder().encode(JSON.stringify(value));
    get(model.port.append(attempt,0,bytes.subarray(0,9)));get(model.port.append(attempt,1,bytes.subarray(9)));
    return {candidate:get(model.port.finish(attempt,clean)).candidate!,bytes};
  }
  return {lane:model,capture,start,stop:no,time:(n:number)=>{now=n;},after:(fn:()=>void)=>{after=fn;},clock:(fn:()=>void)=>{clock=fn;},
    status:()=>get(model.port.diagnostic().parent!),stats:()=>({received,chunks,settled,primary})};
}
it('charges, hashes and privately projects exactly the same copied bytes in one JSON decode',()=>{
  const s=setup(),{candidate,bytes}=s.capture(),snapshot=bytes.slice(),parse=vi.spyOn(JSON,'parse');bytes.fill(0);
  const result=get(s.lane.port.consume(candidate));expect(parse).toHaveBeenCalledTimes(1);parse.mockRestore();
  expect(result).toEqual({records:1,received_bytes:snapshot.length,payload_bytes:0,sha256:createHash('sha256').update(snapshot).digest('hex'),synthetic:true,evidence_issuance:'disabled'});
  expect(s.stats()).toMatchObject({received:snapshot.length,chunks:2,settled:1});
  expect(s.status()).toMatchObject({state:'initial_observed',snapshots_accepted:1,retained_records:1});
  for(const secret of Object.values(row()))expect(JSON.stringify([result,s.status()])).not.toContain(secret);
});
it('accepts only after the body post-guard and prepares final comparison without publishing stable or changed',()=>{
  const s=setup(),first=s.capture();let saw=false;
  s.after(()=>{const d=s.status();if(d.drafts_issued===1&&d.snapshots_accepted===0){saw=true;expect(d.state).toBe('initial_pending');}});
  get(s.lane.port.consume(first.candidate));expect(saw).toBe(true);s.after(()=>{});
  const end=s.capture({result:{...row(),state:'different'}},'parent_final');get(s.lane.port.consume(end.candidate));
  expect(s.status()).toMatchObject({state:'comparison_pending',snapshots_accepted:1,retained_records:0,comparisons_prepared:1,comparisons_committed:0,changed_fields:[],field_comparisons:5});
  expect(s.stats()).toMatchObject({chunks:4,settled:2});
});
it.each(['cancelled','deadline_exceeded'] as const)('rejects initial acceptance after %s at the body post-guard and clears bytes and draft',code=>{
  const s=setup(),c=s.capture();s.after(()=>{if(s.status().drafts_issued===1){if(code==='cancelled')s.stop(code);else s.time(60000);}});
  expect(s.lane.port.consume(c.candidate)).toEqual({ok:false,code});
  expect(s.status()).toMatchObject({snapshots_accepted:0,retained_records:0});expect(s.lane.port.diagnostic().retained_bytes).toBe(0);
  expect(s.lane.port.consume(c.candidate)).toEqual({ok:false,code});expect(s.stats().settled).toBe(1);
});
it.each(['cancelled','deadline_exceeded'] as const)('rechecks the same clock at the snapshot accept post-guard: %s',code=>{
  const s=setup(),c=s.capture();let armed=false,ticks=0;
  s.after(()=>{if(s.status().drafts_issued===1&&!armed){armed=true;s.clock(()=>{if(++ticks===2){if(code==='cancelled')s.stop(code);else s.time(60000);}});}});
  expect(s.lane.port.consume(c.candidate)).toEqual({ok:false,code});expect(s.status()).toMatchObject({snapshots_accepted:0,retained_records:0});
});
it.each([
  {result:{...row(),extra:'PRIVATE_EXTRA'}},{result:{...row(),sys_id:'b'.repeat(32)}},{result:{sys_id:id}},
  {result:{...row(),sys_mod_count:3}},{result:[row()]},{result:row(),extra:true},
])('rejects malformed strict projection before accepting a snapshot',value=>{
  const s=setup(),c=s.capture(value);expect(s.lane.port.consume(c.candidate)).toEqual({ok:false,code:'invalid_response'});
  expect(s.status()).toMatchObject({snapshots_accepted:0,retained_records:0});expect(s.lane.port.diagnostic()).toMatchObject({consumes:1,retained_bytes:0});
});
it.each([new Uint8Array([0xc3,0x28]),new TextEncoder().encode('PRIVATE_INVALID_JSON')])('rejects invalid UTF8/JSON once without exposing bytes',raw=>{
  const s=setup(),c=s.capture(undefined,'parent_initial',raw);expect(s.lane.port.consume(c.candidate)).toEqual({ok:false,code:'invalid_response'});
  expect(JSON.stringify(s.lane.port.diagnostic())).not.toContain('PRIVATE_INVALID_JSON');expect(s.status().snapshots_accepted).toBe(0);
});
it('rejects foreign and copied candidates without touching the issuing lane',()=>{
  const a=setup(),c=a.capture(),before=a.lane.port.diagnostic(),b=setup();
  expect(b.lane.port.consume(c.candidate)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(a.lane.port.diagnostic()).toEqual(before);get(a.lane.port.consume(c.candidate));
  const d=setup(),own=d.capture();expect(d.lane.port.consume({...own.candidate})).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(d.status().snapshots_accepted).toBe(0);
});
it('rejects replay and final-before-initial without resetting the baseline or claims',()=>{
  const s=setup(),c=s.capture();get(s.lane.port.consume(c.candidate));expect(s.lane.port.consume(c.candidate)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(s.status()).toMatchObject({snapshots_accepted:1,retained_records:0});
  const f=setup(),end=f.capture({result:row()},'parent_final');expect(f.lane.port.consume(end.candidate)).toEqual({ok:false,code:'invalid_state'});expect(f.status().snapshots_accepted).toBe(0);
});
it('does not accept a snapshot from cleanup-unconfirmed data and revoke drops a retained baseline',()=>{
  const s=setup(),c=s.capture();get(s.lane.port.consume(c.candidate));s.lane.revoke();expect(s.status().retained_records).toBe(0);
  const f=setup(),a=Object.freeze({}) as ClosedReadAttempt;f.lane.start(a,'parent_initial');
  expect(f.lane.port.finish(a,{...clean,closed:'pending'})).toEqual({ok:false,code:'cleanup_unconfirmed'});expect(f.status().snapshots_accepted).toBe(0);
});
it.each(['cancelled','deadline_exceeded'] as const)('drops initial and final records when the final body post-guard reports %s',code=>{
  const s=setup();get(s.lane.port.consume(s.capture().candidate));const end=s.capture({result:{...row(),state:'different'}},'parent_final');
  s.after(()=>{if(s.status().drafts_issued===2){if(code==='cancelled')s.stop(code);else s.time(60000);}});
  expect(s.lane.port.consume(end.candidate)).toEqual({ok:false,code});expect(s.status()).toMatchObject({retained_records:0,snapshots_accepted:1,comparisons_prepared:0,comparisons_committed:0,changed_fields:[]});
});
it('does not assemble a snapshot from retry fragments and preserves cumulative copied-byte accounting',()=>{
  const s=setup(),a=s.start(),fragment=new TextEncoder().encode('PRIVATE_PARTIAL');
  get(s.lane.port.append(a,0,fragment));expect(get(s.lane.port.finish(a,{...clean,outcome:'retryable'})).candidate).toBeNull();
  const c=s.capture();get(s.lane.port.consume(c.candidate));expect(s.stats()).toMatchObject({chunks:3,settled:2,received:c.bytes.length+fragment.length});expect(s.status().snapshots_accepted).toBe(1);
});
it('rejects a caller target override rather than using it to reconstruct a private baseline',()=>{
  const s=setup(),c=s.capture();expect(s.lane.port.consume(c.candidate,'b'.repeat(32))).toEqual({ok:false,code:'invalid_response'});expect(s.status().snapshots_accepted).toBe(0);
});
