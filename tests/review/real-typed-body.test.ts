import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {createBootstrapBodyLane} from '../../src/servicenow/review-bootstrap-body.js';
const terminal={eof:true,pending_read:false,cancel:'not_requested',closed:'fulfilled',lock:'released'} as const;
const encode=(x:unknown)=>new TextEncoder().encode(JSON.stringify(x));
function setup(limit=4194304){let bytes=0,stopped:string|undefined,onCheck=()=>{},onCharge=()=>{};const lane=createBootstrapBodyLane({check(){onCheck();if(stopped)throw Error(stopped);},charge(n){bytes+=n;onCharge();},stop(code){stopped??=code;},responseLimit:limit});return {lane,bytes:()=>bytes,onCheck:(fn:()=>void)=>{onCheck=fn;},onCharge:(fn:()=>void)=>{onCharge=fn;},stop:(code:string)=>{stopped=code;lane.revoke();}};}
it('charges, decodes and hashes the same private bytes and acknowledges only once after confirmed EOF cleanup',()=>{
  const s=setup(),attempt={},raw=encode({result:{sys_id:'a'.repeat(32)}});s.lane.open(attempt,200);s.lane.append(attempt,raw);raw.fill(0);
  const candidate=s.lane.finish(attempt,terminal)!;expect(Object.keys(candidate)).toEqual([]);const draft=s.lane.consume(attempt,candidate);
  expect(s.lane.acknowledge(attempt,draft)).toEqual({status:200,value:{result:{sys_id:'a'.repeat(32)}},sha256:createHash('sha256').update(encode({result:{sys_id:'a'.repeat(32)}})).digest('hex'),received_bytes:s.bytes()});
  expect(()=>s.lane.acknowledge(attempt,draft)).toThrow('invalid_state');expect(s.lane.diagnostic()).toMatchObject({cleanup:{disposition:'confirmed',kind:'eof'},retained_bytes:0,acknowledgements:1});
});
it('charges an overshoot once then drops the candidate without retaining oversized bytes',()=>{
  const s=setup(3),a={};s.lane.open(a,200);expect(()=>s.lane.append(a,new Uint8Array(4))).toThrow('receive_budget_exceeded');expect(s.bytes()).toBe(4);expect(s.lane.diagnostic()).toMatchObject({retained_bytes:0,consumes:0});
});
it('drops a consumed draft if the final acknowledgement guard fails',()=>{
  const s=setup(),a={};s.lane.open(a,200);s.lane.append(a,encode({result:'PRIVATE'}));const c=s.lane.finish(a,terminal)!,d=s.lane.consume(a,c);let checks=0;s.onCheck(()=>{if(++checks===2)throw Error('cancelled');});
  expect(()=>s.lane.acknowledge(a,d)).toThrow('cancelled');expect(s.lane.diagnostic()).toMatchObject({retained_bytes:0,acknowledgements:0});s.onCheck(()=>{});expect(()=>s.lane.acknowledge(a,d)).toThrow('cancelled');
});
it.each(['empty','retained'] as const)('bounds %s chunk accumulation before parsing',kind=>{
  const s=setup(),a={};s.lane.open(a,200);const accepted=kind==='empty'?16:4096,chunk=new Uint8Array(kind==='empty'?0:1);for(let i=0;i<accepted;i++)s.lane.append(a,chunk);
  expect(()=>s.lane.append(a,chunk)).toThrow('invalid_response');expect(s.bytes()).toBe(kind==='empty'?0:4097);expect(s.lane.diagnostic().retained_bytes).toBe(0);
});
it.each([
  [{...terminal,pending_read:true},'read_pending'],[{...terminal,cancel:'pending'},'cancel_pending'],[{...terminal,cancel:'rejected'},'cancel_rejected'],
  [{...terminal,closed:'pending'},'closed_pending'],[{...terminal,closed:'rejected'},'closed_rejected'],[{...terminal,lock:'failed'},'lock_release_failed'],
  [{...terminal,extra:true},'observation_invalid'],[{...terminal,eof:false},'observation_invalid'],
])('retains an unconfirmed typed terminal and never issues a candidate (%j)',(raw,reason)=>{
  const s=setup(),a={};s.lane.open(a,200);s.lane.append(a,encode({result:'PRIVATE'}));expect(()=>s.lane.finish(a,raw)).toThrow('internal_review_error');expect(s.lane.diagnostic()).toMatchObject({cleanup:{disposition:'unconfirmed',reason},retained_bytes:0,consumes:0,acknowledgements:0});expect(JSON.stringify(s.lane.diagnostic())).not.toContain('PRIVATE');
});
it('does not create a body from a confirmed cancel',()=>{
  const s=setup(),a={};s.lane.open(a,200);s.lane.append(a,encode({result:1}));expect(s.lane.finish(a,{...terminal,eof:false,cancel:'fulfilled'})).toBeNull();expect(s.lane.diagnostic()).toMatchObject({cleanup:{disposition:'confirmed',kind:'cancelled'},retained_bytes:0,consumes:0});
});
it.each(['candidate','attempt','draft'] as const)('rejects a foreign %s without consuming the foreign owner',kind=>{
  const s=setup(),other=setup(),a={},b={};for(const [realm,attempt] of [[s,a],[other,b]] as const){realm.lane.open(attempt,200);realm.lane.append(attempt,encode({result:1}));}
  const c=s.lane.finish(a,terminal)!,foreign=other.lane.finish(b,terminal)!,d=other.lane.consume(b,foreign);
  expect(()=>kind==='draft'?s.lane.acknowledge(a,d):s.lane.consume(kind==='attempt'?b:a,kind==='candidate'?foreign:c)).toThrow('evidence_binding_mismatch');expect(other.lane.acknowledge(b,d).value).toEqual({result:1});expect(s.lane.diagnostic().retained_bytes).toBe(0);
});
it('refuses double consume and cannot restart after the failed claim',()=>{
  const s=setup(),a={};s.lane.open(a,200);s.lane.append(a,encode({result:1}));const c=s.lane.finish(a,terminal)!;s.lane.consume(a,c);expect(()=>s.lane.consume(a,c)).toThrow('invalid_state');expect(()=>s.lane.open({},200)).toThrow('invalid_state');expect(s.lane.diagnostic()).toMatchObject({retained_bytes:0,consumes:1,acknowledgements:0});
});
it.each(['cancelled','deadline_exceeded','closed'])('refuses ack after %s without reviving a consumed draft',code=>{
  const s=setup(),a={};s.lane.open(a,200);s.lane.append(a,encode({result:1}));const c=s.lane.finish(a,terminal)!,d=s.lane.consume(a,c);s.stop(code);expect(()=>s.lane.acknowledge(a,d)).toThrow(code);expect(s.lane.diagnostic()).toMatchObject({retained_bytes:0,acknowledgements:0});
});
it('privately copies before the charge callback can alter the input bytes',()=>{
  const s=setup(),a={},bytes=encode({result:1});s.onCharge(()=>bytes.fill(0));s.lane.open(a,200);s.lane.append(a,bytes);const c=s.lane.finish(a,terminal)!,d=s.lane.consume(a,c);expect(s.lane.acknowledge(a,d).value).toEqual({result:1});
});
it('rejects shared memory without charging or invoking a spoofed species',()=>{
  const s=setup(),a={};s.lane.open(a,200);expect(()=>s.lane.append(a,new Uint8Array(new SharedArrayBuffer(8)))).toThrow('invalid_response');expect(s.bytes()).toBe(0);
});
it('rejects invalid UTF8 or JSON once without returning the private body',()=>{
  const s=setup(),a={};s.lane.open(a,200);s.lane.append(a,new Uint8Array([0xc3,0x28]));const c=s.lane.finish(a,terminal)!;expect(()=>s.lane.consume(a,c)).toThrow('invalid_response');expect(s.lane.diagnostic()).toMatchObject({retained_bytes:0,consumes:1,acknowledgements:0});
});
it('decodes split UTF8 chunks and hashes exactly the byte sequence independently counted by the test',()=>{
  const s=setup(),a={},bytes=encode({result:'検証'}),parts=[bytes.subarray(0,12),bytes.subarray(12,13),bytes.subarray(13)];s.lane.open(a,200);for(const p of parts)s.lane.append(a,p);const c=s.lane.finish(a,terminal)!,d=s.lane.consume(a,c),accepted=s.lane.acknowledge(a,d);expect(accepted).toEqual({status:200,value:{result:'検証'},sha256:createHash('sha256').update(bytes).digest('hex'),received_bytes:parts.reduce((n,p)=>n+p.length,0)});expect(s.bytes()).toBe(bytes.length);
});
