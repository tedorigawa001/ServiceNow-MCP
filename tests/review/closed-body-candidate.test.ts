import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {createFakeClosedBodyGate} from '../../src/review/abort-scope-evidence-closed-body-gate.js';
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
const clean={outcome:'success',eof:true,pending_read:false,cancel:'not_requested',closed:'fulfilled',lock:'released'};
const id='a'.repeat(32),text=JSON.stringify({result:[{sys_id:id}]});
function setup(limits:Record<string,number>={}){let now=0;const gate=createFakeClosedBodyGate({now:()=>now}),s=get(gate.construct({accounting:{...limits,body_mode:'bytes'}})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r));
  const port=get(gate.claimAccounting(s,r,t));return {gate,s,r,t,port,body:port.body!,time:(n:number)=>{now=n;}};}
it('charges and parses one private byte snapshot, returns only a fixed summary and keeps formal issuance closed',()=>{
  const {port,body,gate,s,r,t}=setup(),p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p));
  const bytes=new TextEncoder().encode(text);get(body.append(a,0,bytes));bytes.fill(0);
  const terminal=get(body.finish(a,clean));expect(terminal.candidate).not.toBeNull();
  expect(get(body.consume(terminal.candidate!))).toMatchObject({records:1,received_bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex'),synthetic:true,evidence_issuance:'disabled'});
  expect(port.stats().received_bytes).toBe(Buffer.byteLength(text));expect(gate.refuseBody(s,r,t)).toEqual({ok:false,code:'issuance_disabled'});
});
it.each([
  [{pending_read:true},'read_pending'],[{cancel:'pending'},'cancel_pending'],[{cancel:'rejected'},'cancel_rejected'],
  [{closed:'pending'},'closed_unconfirmed'],[{closed:'rejected'},'closed_rejected'],[{lock:'held'},'lock_release_failed'],
  [{lock:'failed'},'lock_release_failed'],[{lock:'unknown'},'lock_release_failed'],[{eof:false},'observation_invalid'],
])('rejects unconfirmed cleanup %j and retains its typed reason', (change,reason)=>{
  const {port,body,gate}=setup(),p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p));get(body.append(a,0,new TextEncoder().encode(text)));
  expect(body.finish(a,{...clean,...change})).toEqual({ok:false,code:'cleanup_unconfirmed'});
  const d=body.diagnostic();expect(d).toMatchObject({cleanup:{disposition:'unconfirmed',reason},retained_bytes:0,consumes:0});
  expect(body.finish(a,clean).ok).toBe(false);gate.close();expect(body.diagnostic()).toEqual(d);expect(port.dispatch(p).ok).toBe(false);
});
it.each(['consume','discard','finish'] as const)('rejects a second %s without decoding or charging again',kind=>{
  const {port,body}=setup(),p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p));get(body.append(a,0,new TextEncoder().encode(text)));
  const c=get(body.finish(a,clean)).candidate!;get(body.consume(c));const before=port.stats().received_bytes;
  expect((kind==='consume'?body.consume(c):kind==='discard'?body.discard(c):body.finish(a,clean)).ok).toBe(false);
  expect(body.diagnostic()).toMatchObject({retained_bytes:0,consumes:1});expect(port.stats().received_bytes).toBe(before);
});
it.each(['bad_json','bad_utf8','extra','too_many','empty'] as const)('consumes once and stops on %s without exposing body or parser errors',kind=>{
  const {port,body,gate}=setup(),p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p));
  const raw=kind==='bad_json'?'PRIVATE_SECRET {':kind==='extra'?JSON.stringify({result:[{sys_id:id,secret:'PRIVATE_SECRET'}]}):kind==='too_many'?JSON.stringify({result:Array(102).fill({sys_id:id})}):'';
  const bytes=kind==='bad_utf8'?new Uint8Array([0xc3,0x28]):new TextEncoder().encode(raw);get(body.append(a,0,bytes));const c=get(body.finish(a,clean)).candidate!;
  expect(body.consume(c)).toEqual({ok:false,code:'invalid_response'});expect(body.consume(c).ok).toBe(false);
  expect(body.diagnostic()).toMatchObject({consumes:1,retained_bytes:0,cleanup:{disposition:'confirmed',kind:'eof'}});
  expect(JSON.stringify(gate.diagnostic())).not.toContain('PRIVATE_SECRET');expect(port.stats().received_bytes).toBe(bytes.length);
});
it.each(['chunk','settle','payload','discard'] as const)('rejects scalar %s as a byte-lane bypass',kind=>{
  const {port}=setup(),p=get(port.openPurpose({kind:'payload'})),a=get(port.dispatch(p));
  const result=kind==='chunk'?port.chunk(a,0,2):kind==='settle'?port.settle(a,{outcome:'success',cleanup:'confirmed'}):kind==='payload'?port.chargePayload(a,2):port.discardPayload(a);
  expect(result).toEqual({ok:false,code:'invalid_state'});expect(port.stats()).toMatchObject({received_bytes:0,payload_bytes:0});
});
it('charges parsed payload UTF-8 once from the same captured JSON, not an asserted length or G again',()=>{
  const {port,body}=setup(),p=get(port.openPurpose({kind:'payload'})),a=get(port.dispatch(p)),value='日本語\n"x"',json=JSON.stringify({result:{payload:value}}),bytes=new TextEncoder().encode(json);
  get(body.append(a,0,bytes.subarray(0,4)));get(body.append(a,1,bytes.subarray(4)));const c=get(body.finish(a,clean)).candidate!;
  const result=get(body.consume(c));expect(result.payload_bytes).toBe(Buffer.byteLength(value));expect(port.stats()).toMatchObject({requests:1,received_bytes:bytes.length,payload_bytes:Buffer.byteLength(value)});
  expect(JSON.stringify(result)).not.toContain(value);
});
it('rejects oversized parsed payload locally, retains P, and destroys its one-shot candidate',()=>{
  const {port,body,gate}=setup({payload_bytes:2}),p=get(port.openPurpose({kind:'payload'})),a=get(port.dispatch(p));get(body.append(a,0,new TextEncoder().encode(JSON.stringify({result:{payload:'abc'}}))));
  const c=get(body.finish(a,clean)).candidate!;expect(body.consume(c)).toEqual({ok:false,code:'payload_limit'});expect(port.stats().payload_bytes).toBe(3);expect(gate.diagnostic().primary).toBeNull();expect(body.diagnostic().retained_bytes).toBe(0);
});
it.each(['cancel','deadline'] as const)('rejects retained candidates after %s and does not downgrade known cleanup',kind=>{
  const {port,body,gate,time}=setup(),p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p));get(body.append(a,0,new TextEncoder().encode(text)));const c=get(body.finish(a,clean)).candidate!;
  if(kind==='cancel')gate.stop('cancelled');else time(60000);
  expect(body.consume(c)).toEqual({ok:false,code:kind==='cancel'?'cancelled':'deadline_exceeded'});
  expect(body.diagnostic()).toMatchObject({retained_bytes:0,consumes:0,cleanup:{disposition:'confirmed',kind:'eof'}});
});
it('retains unknown cleanup on cancellation before EOF and never repairs it with a late finish',()=>{
  const {port,body,gate}=setup(),p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p));get(body.append(a,0,new TextEncoder().encode(text)));gate.stop('cancelled');
  const d=body.diagnostic();expect(d).toMatchObject({cleanup:{disposition:'unconfirmed',reason:'owner_stopped'},retained_bytes:0});
  expect(body.finish(a,clean)).toEqual({ok:false,code:'cancelled'});expect(body.diagnostic()).toEqual(d);
});
it('rechecks common cancellation after decode but before committing payload or exposing a summary',()=>{
  let hook=()=>{};const gate=createFakeClosedBodyGate({now(){hook();return 0;}}),s=get(gate.construct({accounting:{body_mode:'bytes'}})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r)),port=get(gate.claimAccounting(s,r,t)),body=port.body!;
  const p=get(port.openPurpose({kind:'payload'})),a=get(port.dispatch(p));get(body.append(a,0,new TextEncoder().encode(JSON.stringify({result:{payload:'PRIVATE_BODY'}}))));const c=get(body.finish(a,clean)).candidate!;
  hook=()=>{if(body.diagnostic().consumes>0)gate.stop('cancelled');};expect(body.consume(c)).toEqual({ok:false,code:'cancelled'});
  expect(port.stats().payload_bytes).toBe(0);expect(body.diagnostic()).toMatchObject({consumes:1,retained_bytes:0});
});
it.each(['attempt','candidate','terminal','clone'] as const)('rejects foreign or forged %s while leaving the original owner untouched',kind=>{
  const own=setup(),other=setup(),p=get(other.port.openPurpose({kind:'metadata_initial'})),a=get(other.port.dispatch(p));get(other.body.append(a,0,new TextEncoder().encode(text)));const f=get(other.body.finish(a,clean)),before=other.body.diagnostic();
  const result=kind==='attempt'?own.body.finish(a,clean):own.body.consume(kind==='candidate'?f.candidate!:kind==='terminal'?f.terminal as unknown as NonNullable<typeof f.candidate>:structuredClone(f.candidate!));
  expect(result.ok).toBe(false);expect(other.body.diagnostic()).toEqual(before);expect(other.gate.diagnostic().primary).toBeNull();get(other.body.consume(f.candidate!));
});
it('keeps S per retry but G cumulative, and prevents using body fragments from the first attempt',()=>{
  const {port,body}=setup(),p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p));get(body.append(a,0,new TextEncoder().encode('PRIVATE_PART')));
  expect(get(body.finish(a,{...clean,outcome:'retryable'})).candidate).toBeNull();expect(body.diagnostic().retained_bytes).toBe(0);
  const b=get(port.dispatch(p));get(body.append(b,0,new TextEncoder().encode(text)));const c=get(body.finish(b,clean)).candidate!;expect(get(body.consume(c)).records).toBe(1);
  expect(port.stats().received_bytes).toBe(Buffer.byteLength('PRIVATE_PART')+Buffer.byteLength(text));
});
it.each(['response','total'] as const)('charges %s overshoot but never keeps oversized bytes or produces a candidate',kind=>{
  const {port,body}=setup(kind==='response'?{response_bytes:2}:{total_bytes:2}),p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p));
  expect(body.append(a,0,new Uint8Array(3))).toEqual({ok:false,code:'receive_budget_exceeded'});expect(port.stats().received_bytes).toBe(3);expect(body.diagnostic().retained_bytes).toBe(0);expect(body.finish(a,clean).ok).toBe(false);
});
it('does not produce a candidate for confirmed cancellation or a successful OAuth body',()=>{
  for(const kind of ['metadata_initial','oauth'] as const){const {port,body}=setup(),p=get(port.openPurpose({kind})),a=get(port.dispatch(p));get(body.append(a,0,new TextEncoder().encode(text)));
    if(kind==='oauth')expect(body.finish(a,clean)).toEqual({ok:false,code:'invalid_state'});
    else expect(get(body.finish(a,{...clean,eof:false,cancel:'fulfilled'})).candidate).toBeNull();expect(body.diagnostic().retained_bytes).toBe(0);}
});
it('never invokes caller typed-array getters or species while taking the private snapshot',()=>{
  class HostileBytes extends Uint8Array{
    get byteLength():number{throw Error('PRIVATE_GETTER');}
    get buffer():ArrayBuffer{throw Error('PRIVATE_BUFFER');}
    static get [Symbol.species]():Uint8ArrayConstructor{throw Error('PRIVATE_SPECIES');}
  }
  const {port,body}=setup(),p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p));get(body.append(a,0,new HostileBytes(new TextEncoder().encode(text))));
  const c=get(body.finish(a,clean)).candidate!;expect(get(body.consume(c)).records).toBe(1);
});
it.each(['shared','proxy','detached'] as const)('rejects %s bytes rather than trusting a mutable or unknown memory source',kind=>{
  const {port,body}=setup(),p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p));let bytes:Uint8Array;
  if(kind==='shared')bytes=new Uint8Array(new SharedArrayBuffer(4));
  else if(kind==='proxy')bytes=new Proxy(new Uint8Array(4),{});
  else{const buffer=new ArrayBuffer(4);bytes=new Uint8Array(buffer);structuredClone(buffer,{transfer:[buffer]});}
  expect(body.append(a,0,bytes)).toEqual({ok:false,code:'invalid_input'});expect(port.stats().received_bytes).toBe(0);
});
it('uses the snapshot captured before an injected adoption-time clock mutates the caller bytes',()=>{
  let calls=0,armed=false;const input=new TextEncoder().encode(text),gate=createFakeClosedBodyGate({now(){if(armed&&++calls===3)input.fill(0);return 0;}}),s=get(gate.construct({accounting:{body_mode:'bytes'}})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r)),port=get(gate.claimAccounting(s,r,t)),body=port.body!;
  const p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p));armed=true;get(body.append(a,0,input));armed=false;
  expect(input.every(x=>x===0)).toBe(true);expect(get(body.consume(get(body.finish(a,clean)).candidate!)).records).toBe(1);
});
it('accepts empty chunks at the retained nonempty limit and still consumes the unchanged valid body',()=>{
  const {port,body,gate}=setup(),p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p));
  const input=new TextEncoder().encode(JSON.stringify({result:[]}).padEnd(4096,' '));
  for(let i=0;i<input.length;i++)get(body.append(a,i,input.subarray(i,i+1)));
  for(let i=4096;i<4099;i++)get(body.append(a,i,new Uint8Array()));
  expect(port.stats().received_bytes).toBe(4096);expect(body.diagnostic().retained_bytes).toBe(4096);expect(gate.diagnostic().primary).toBeNull();
  const summary=get(body.consume(get(body.finish(a,clean)).candidate!));
  expect(summary).toMatchObject({records:0,received_bytes:4096,sha256:createHash('sha256').update(input).digest('hex')});
});
it('caps retained nonempty chunks and preserves the final charged chunk when stopping on capture control cost',()=>{
  const {port,body}=setup(),p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p));
  for(let i=0;i<4096;i++)get(body.append(a,i,new Uint8Array([0x20])));
  expect(body.append(a,4096,new Uint8Array([0x20]))).toEqual({ok:false,code:'body_limit'});expect(port.stats().received_bytes).toBe(4097);expect(body.diagnostic().retained_bytes).toBe(0);
});
it('can discard a candidate once without parsing and then continue, but cannot convert its terminal into a new candidate',()=>{
  const {port,body}=setup(),p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p));get(body.append(a,0,new TextEncoder().encode('PRIVATE_INVALID_JSON')));
  const f=get(body.finish(a,clean));get(body.discard(f.candidate!));expect(body.diagnostic()).toMatchObject({retained_bytes:0,consumes:0});get(port.openPurpose({kind:'payload'}));
  expect(body.discard(f.candidate!).ok).toBe(false);expect(body.consume(f.terminal as unknown as NonNullable<typeof f.candidate>).ok).toBe(false);
});
it('rejects soft-expired non-payload candidates before decode/consume and drops retained bytes',()=>{
  const {port,body,time,gate}=setup(),p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p));get(body.append(a,0,new TextEncoder().encode(text)));const c=get(body.finish(a,clean)).candidate!;
  time(50000);expect(body.consume(c)).toEqual({ok:false,code:'phase_deadline_exceeded'});
  expect(body.diagnostic()).toMatchObject({retained_bytes:0,consumes:0});expect(gate.diagnostic().primary).toBeNull();
});
it('does not open the next final slot while a final body still awaits consume/discard',()=>{
  const {port,body}=setup();const p=get(port.openPurpose({kind:'parent_initial'})),a=get(port.dispatch(p));get(body.append(a,0,new TextEncoder().encode(JSON.stringify({result:{sys_id:id}}))));get(body.consume(get(body.finish(a,clean)).candidate!));
  get(port.enterFinal());const f=get(port.openFinal(port.parentFinal)),b=get(port.dispatch(f));get(body.append(b,0,new TextEncoder().encode(JSON.stringify({result:{sys_id:id}}))));get(body.finish(b,clean));
  expect(port.skipFinal(port.metadataFinal)).toEqual({ok:false,code:'invalid_state'});expect(body.diagnostic().retained_bytes).toBe(0);
});
it('keeps a confirmed cancel retryable without a candidate, while success after cancel stays unavailable',()=>{
  const {port,body,gate}=setup(),p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p));get(body.append(a,0,new TextEncoder().encode('PRIVATE_PART')));
  expect(get(body.finish(a,{...clean,outcome:'retryable',eof:false,cancel:'fulfilled'})).candidate).toBeNull();expect(body.diagnostic()).toMatchObject({retained_bytes:0,cleanup:{disposition:'confirmed',kind:'cancelled'}});
  const b=get(port.dispatch(p));get(body.append(b,0,new TextEncoder().encode(text)));expect(get(body.consume(get(body.finish(b,clean)).candidate!)).records).toBe(1);
  expect(gate.diagnostic().primary).toBeNull();expect(port.stats().requests).toBe(2);
  const other=setup(),q=get(other.port.openPurpose({kind:'metadata_initial'})),c=get(other.port.dispatch(q));
  expect(get(other.body.finish(c,{...clean,eof:false,cancel:'fulfilled'})).candidate).toBeNull();expect(other.port.dispatch(q).ok).toBe(false);
});
it.each(['Int16Array','Float64Array','Uint8ClampedArray'] as const)('rejects a %s with a forged Uint8Array prototype before charging',name=>{
  const {port,body}=setup(),p=get(port.openPurpose({kind:'metadata_initial'})),a=get(port.dispatch(p)),forged=new globalThis[name](4);
  Object.setPrototypeOf(forged,Uint8Array.prototype);
  expect(body.append(a,0,forged as unknown as Uint8Array)).toEqual({ok:false,code:'invalid_input'});expect(port.stats().received_bytes).toBe(0);expect(body.diagnostic().retained_bytes).toBe(0);
});
