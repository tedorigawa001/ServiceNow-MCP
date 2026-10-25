import { expect, it, vi } from 'vitest';
import { createSyntheticScopeSourceStream } from '../../src/review/abort-scope-evidence-source-stream.js';
import { createSyntheticScopeStreamHarness, type SyntheticScopeSource } from '../../src/review/abort-scope-evidence-stream.js';
function get<T>(r: {ok:true;value:T}|{ok:false;code:string}):T { if (!r.ok) throw Error(r.code); return r.value; }
const limits = () => ({ requests:210, consumed:0, responseBytes:4194304, totalBytes:16777216, evidenceResponseBytes:16384, evidenceBytes:262144 });
const at = '2026-10-26T00:00:01Z';
const row = () => ({sys_id:'c'.repeat(32),name:'incident',sys_scope:'global',sys_updated_on:'2026-10-25 00:00:00',sys_mod_count:'0'});
const body = () => JSON.stringify({result:[row()]});
function setup(override = {}) { return get(createSyntheticScopeSourceStream(
  {instance_binding:'a'.repeat(64),started_at:'2026-10-26T00:00:00Z',deadline_ms:60000},
  {update_set_sys_id:'b'.repeat(32),parent_ready:true,metadata_ready:true,final_started:false,release_match:'matched',release_origin:'observed'},
  {...limits(),...override})); }
function response(text = body(), status = 200, cancel = () => Promise.resolve()) {
  const bytes = new TextEncoder().encode(text); let n = 0;
  return { status, reader: { read: async () => n++ === 0 ? {done:false as const,value:bytes} : {done:true as const}, cancel } };
}
it('connects only the fixed GET and independently counts each received byte once', async () => {
  const x = setup(), payload = JSON.stringify({result:[{...row(),password:'HIDDEN'}]});
  const send = vi.fn(async (request: {method:string;path:string}) => {
    expect(request.method).toBe('GET');
    const u = new URL(request.path,'https://fixture.invalid');
    expect(u.pathname).toBe('/api/now/table/sys_db_object');
    expect(u.searchParams.get('sysparm_query')).toBe('name=incident^ORDERBYsys_id');
    expect(u.searchParams.get('sysparm_fields')).toBe('sys_id,name,sys_scope,sys_updated_on,sys_mod_count');
    expect(u.searchParams.get('sysparm_limit')).toBe('2');
    return response(payload);
  });
  const value = get(await x.initial('incident',at,send));
  expect(value).toMatchObject({state:'rows',phase:'initial',rows:[row()]});
  expect(JSON.stringify(value)).not.toContain('HIDDEN');
  expect(send).toHaveBeenCalledTimes(1);
  expect(x.stats()).toMatchObject({requests:1,reserved:6,tables:1,global_bytes:Buffer.byteLength(payload),evidence_bytes:Buffer.byteLength(payload),composition_primary:null});
});
it('counts failed retry bodies without refund or normalization re-charge', async () => {
  const x = setup(), sent:Uint8Array[] = [];
  const result = await x.initial('incident',at,async (_request,attempt) => {
    const text = attempt === 1 ? 'error' : body(); sent.push(new TextEncoder().encode(text));
    return response(text,attempt === 1 ? 503 : 200);
  });
  expect(result.ok).toBe(true);
  const oracle = sent.reduce((sum,chunk) => sum+chunk.byteLength,0);
  expect(x.stats()).toMatchObject({requests:2,reserved:6,tables:1,global_bytes:oracle,evidence_bytes:oracle});
});
it.each([
  {text:JSON.stringify({result:[{...row(),name:'problem'}]}),expected:'table_binding_mismatch'},
])('does not promote invalid accepted data: $expected', async ({text,expected}) => {
  const x=setup();expect(await x.initial('incident',at,async()=>response(text))).toEqual({ok:false,code:expected});
  const send=vi.fn(async()=>response());expect(await x.initial('problem',at,send)).toEqual({ok:false,code:expected});expect(send).not.toHaveBeenCalled();
});
it.each([401,403])('stops status %i without receiving its body',async status=>{
  const x=setup();expect(await x.initial('incident',at,async()=>response('SECRET',status))).toEqual({ok:false,code:status===401?'authentication_failed':'access_denied'});
  expect(x.stats().global_bytes).toBe(0);
});
it.each(['rejected','pending'] as const)('cleanup %s cannot mint observations',async kind=>{
  const x=setup();const cancel=kind==='rejected'?()=>Promise.reject(Error('SECRET')):()=>new Promise<void>(()=>{});
  expect(await x.initial('incident',at,async()=>response(body(),200,cancel))).toEqual({ok:false,code:'internal_review_error'});
  expect(x.stats().cleanup).toBe('unconfirmed');
});
it('charges an overshoot and preserves a local unknown without stopping the composition',async()=>{
  const x=setup({evidenceResponseBytes:1}),send=vi.fn(async()=>response());
  expect(get(await x.initial('incident',at,send))).toMatchObject({state:'unavailable',reason:'evidence_limit'});
  expect(x.stats().global_bytes).toBe(Buffer.byteLength(body()));
  await x.initial('problem',at,send);expect(send).toHaveBeenCalledTimes(2);
  expect(x.stats().composition_primary).toBeNull();
});
it('cancels a pending read, releases once and rejects late body completion',async()=>{
  const x=setup(),abort=new AbortController(),cancel=vi.fn(async()=>{});
  let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
  let finish!: (value:{done:true})=>void;
  const pending=x.initial('incident',at,async()=>({status:200,reader:{read:()=>{entered();return new Promise(resolve=>{finish=resolve;});},cancel}}),abort.signal);
  await started;abort.abort();expect(await pending).toEqual({ok:false,code:'cancelled'});
  finish({done:true});expect(cancel).toHaveBeenCalledTimes(1);expect(x.stats().global_bytes).toBe(0);
});
it('closure while a source is pending does not deliver an observation',async()=>{
  const x=setup();let release!:(value:ReturnType<typeof response>)=>void;
  const pending=x.initial('incident',at,()=>new Promise(resolve=>{release=resolve;}));
  x.close();expect(await pending).toEqual({ok:false,code:'closed'});release(response());
});
it('duplicate initial cannot trigger another GET',async()=>{
  const x=setup(),send=vi.fn(async()=>response());get(await x.initial('incident',at,send));
  expect(await x.initial('incident',at,send)).toEqual({ok:false,code:'invalid_state'});expect(send).toHaveBeenCalledTimes(1);
});
it('unavailable normalized rows stay unknown rather than becoming scope evidence',async()=>{
  const x=setup();expect(get(await x.initial('incident',at,async()=>response('{"result":[]}')))).toMatchObject({state:'unavailable',reason:'not_found_or_not_visible'});
});
it('rejects a supplied time outside the synthetic session interval before dispatch',async()=>{
  const x=setup();expect(await x.initial('incident','2026-10-26T00:01:00Z',async()=>response())).toEqual({ok:false,code:'invalid_observation_time'});
  expect(x.stats().evidence_bytes).toBe(0);
});
async function receipt() {
  const h=get(createSyntheticScopeStreamHarness(limits())),table=get(h.admitTable('incident'));
  return {h,table,receipt:get(await h.receiveInitial(table,async()=>response()))};
}
it('body receipt is opaque, one-shot, and cannot be replayed',async()=>{
  const x=await receipt();expect(JSON.stringify(x.receipt)).toBe('{}');expect(get(x.h.consumeBody(x.receipt,x.table))).toBe(body());
  expect(x.h.consumeBody(x.receipt,x.table)).toMatchObject({ok:false,code:'internal_review_error'});
});
it.each(['clone','foreign','closed','stopped'] as const)('rejects %s body receipts',async kind=>{
  const x=await receipt();
  if(kind==='closed')x.h.close();if(kind==='stopped')x.h.stop('cancelled');
  const target=kind==='foreign'?(await receipt()).h:x.h;
  expect(target.consumeBody(kind==='clone'?structuredClone(x.receipt):x.receipt,x.table)).toMatchObject({ok:false});
});
it('does not allow another receipt while the previous body is unconsumed',async()=>{
  const x=await receipt(),table=get(x.h.admitTable('problem')),send=vi.fn(async()=>response());
  expect(await x.h.receiveInitial(table,send)).toMatchObject({ok:false,code:'internal_review_error'});expect(send).not.toHaveBeenCalled();
  expect(x.h.consumeBody(x.receipt,x.table).ok).toBe(false);
});
it('a receipt cannot be consumed as another table read in the same harness',async()=>{
  const x=await receipt(),other=get(x.h.admitTable('problem'));
  expect(x.h.consumeBody(x.receipt,other)).toMatchObject({ok:false,code:'internal_review_error'});
  expect(x.h.consumeBody(x.receipt,x.table).ok).toBe(false);
});
it('a caller abort before dispatch consumes no response bytes',async()=>{
  const x=setup(),abort=new AbortController(),send=vi.fn(async()=>response());abort.abort();
  expect(await x.initial('incident',at,send,abort.signal)).toEqual({ok:false,code:'cancelled'});expect(send).not.toHaveBeenCalled();expect(x.stats().global_bytes).toBe(0);
});
it('body receipts are phase-bound even for the same table',async()=>{
  const x=await receipt();expect(x.h.consumeBody(x.receipt,x.table,'final')).toMatchObject({ok:false,code:'internal_review_error'});
});
it('final body receipts are issued only after reserved parent and metadata reads',async()=>{
  const x=await receipt();get(x.h.consumeBody(x.receipt,x.table));get(x.h.enterFinal());
  get(await x.h.runFinal(x.h.parent,'parent',async()=>response('{}')));
  get(await x.h.runFinal(x.h.metadata,'metadata',async()=>response('{}')));
  const slot=get(x.h.tableSlot(x.table)),final=get(await x.h.receiveFinal(slot,x.table,async()=>response()));
  expect(get(x.h.consumeBody(final,x.table,'final'))).toBe(body());
  expect(x.h.stats()).toMatchObject({requests:4,reserved:0});
});
// Keep this module typechecked against the same stream callback contract, without a transport adapter.
const _sourceType: SyntheticScopeSource = async()=>response();
void _sourceType;
