import { expect, it, vi } from 'vitest';
import { createSyntheticScopeReservationLedger as create } from '../../src/review/abort-scope-evidence-reservations.js';
import { reservationOracle, type ReservationEvent } from './fixtures/scope-reservation-oracle.js';
function get<T>(r:{ok:true;value:T}|{ok:false;code:string}):T {if(!r.ok)throw Error(r.code);return r.value;}
const setup=(consumed=0,requests=210)=>get(create({consumed,requests}));
type Ledger=ReturnType<typeof setup>;
function ordinary(l:Ledger,lane:'oauth'|'ordinary'='ordinary',retry=false){
  const read=get(l.openOrdinary(lane)),first=get(l.startOrdinary(read));
  get(l.settle(first.attempt,retry?'retryable':'success'));
  if(retry)get(l.settle(get(l.startOrdinary(read)).attempt,'success'));
}
function finalBase(l:Ledger){get(l.enterFinal());get(l.settle(get(l.startFinal(l.parent,'parent')).attempt,'success'));
  get(l.settle(get(l.startFinal(l.metadata,'metadata')).attempt,'success'));}
it('initializes separate uncharged parent/metadata reservations',()=>{
  const l=setup();expect(l.stats()).toMatchObject({requests:0,reserved:4,tables:0,phase:'normal'});
  expect(l.stats().slots.map(s=>s.remaining)).toEqual([2,2]);expect(Object.isFrozen(l.stats().slots)).toBe(true);
});
it.each([{requests:3,consumed:0},{requests:211,consumed:0},{requests:210,consumed:207},
  {requests:4,consumed:1},{requests:'210',consumed:0},{requests:210,consumed:0,extra:true}])('rejects invalid/lowered admission: %j',raw=>{
  expect(create(raw)).toEqual({ok:false,code:'invalid_input',terminal:true});
});
it('counts OAuth and ordinary retries without precharging or refunding reservations',()=>{
  const l=setup();ordinary(l,'oauth',true);ordinary(l);expect(l.stats()).toMatchObject({requests:3,reserved:4});
});
it.each([202,203])('handles C+R+4 equality/one insufficient atomically: C=%i',consumed=>{
  const l=setup(consumed),before=l.stats(),r=l.admitTable('incident');
  if(consumed===202){const t=get(r);expect(l.stats()).toMatchObject({requests:202,reserved:6,tables:1});
    const a=get(l.startInitial(t));get(l.settle(a.attempt,'retryable'));get(l.settle(get(l.startInitial(t)).attempt,'success'));
    expect(l.stats()).toMatchObject({requests:204,reserved:6});}
  else{expect(r).toEqual({ok:false,code:'scope_evidence_limit',terminal:false});
    expect(l.stats()).toMatchObject({requests:before.requests,reserved:before.reserved,tables:before.tables});
    expect(l.admitTable('task')).toEqual(r);}
});
it.each(['ordinary_retry','initial_retry','opened_unstarted'] as const)('ends a waiting read at the normal phase end and keeps final reservations: %s',kind=>{
  const l=setup(),events:ReservationEvent[]=[];let table;
  if(kind==='ordinary_retry'){const r=get(l.openOrdinary('ordinary'));get(l.settle(get(l.startOrdinary(r)).attempt,'retryable'));events.push({kind:'dispatch',lane:'ordinary'});}
  if(kind==='initial_retry'){table=get(l.admitTable('incident'));events.push({kind:'admit'});
    get(l.settle(get(l.startInitial(table)).attempt,'retryable'));events.push({kind:'dispatch',lane:'initial'});}
  if(kind==='opened_unstarted')get(l.openOrdinary('ordinary'));
  get(l.enterFinal());events.push({kind:'final'});
  const o=reservationOracle(0,210,events);
  expect(l.stats()).toMatchObject({phase:'final',primary:null,requests:o.requests,reserved:o.reserved});
  get(l.settle(get(l.startFinal(l.parent,'parent')).attempt,'success'));
  get(l.settle(get(l.startFinal(l.metadata,'metadata')).attempt,'success'));
  if(table){get(l.skipTableFinal(table,get(l.tableSlot(table))));expect(l.stats().slots[2]).toMatchObject({attempts:0,state:'skipped'});}
  expect(l.stats().primary).toBe(null);
});
it('still requires an in-flight attempt to settle before the final phase',()=>{
  const l=setup(),r=get(l.openOrdinary('ordinary'));get(l.startOrdinary(r));
  expect(l.enterFinal()).toEqual({ok:false,code:'invalid_state',terminal:true});
});
it('preserves final reservations when ordinary capacity is exhausted',()=>{
  const l=setup(206),read=get(l.openOrdinary('ordinary'));
  expect(l.startOrdinary(read)).toEqual({ok:false,code:'request_budget_exceeded',terminal:false});
  expect(l.stats()).toMatchObject({requests:206,reserved:4});get(l.enterFinal());
  let a=get(l.startFinal(l.parent,'parent'));get(l.settle(a.attempt,'retryable'));
  a=get(l.startFinal(l.parent,'parent'));get(l.settle(a.attempt,'success'));
  a=get(l.startFinal(l.metadata,'metadata'));get(l.settle(a.attempt,'retryable'));
  a=get(l.startFinal(l.metadata,'metadata'));get(l.settle(a.attempt,'success'));
  expect(l.stats()).toMatchObject({requests:210,reserved:0});
});
it('finishes all six reserved attempts at the exact new-table admission boundary',()=>{
  const l=setup(202),t=get(l.admitTable('incident'));
  get(l.settle(get(l.startInitial(t)).attempt,'retryable'));get(l.settle(get(l.startInitial(t)).attempt,'success'));
  get(l.enterFinal());
  for(const [slot,target] of [[l.parent,'parent'],[l.metadata,'metadata'],[get(l.tableSlot(t)),t]] as const){
    get(l.settle(get(l.startFinal(slot,target)).attempt,'retryable'));get(l.settle(get(l.startFinal(slot,target)).attempt,'success'));}
  expect(l.stats()).toMatchObject({requests:210,reserved:0,tables:1});
});
it('preserves twenty final attempts after ordinary C=190 with eight tables',()=>{
  const l=setup(),ts=[];for(let n=0;n<8;n++){const t=get(l.admitTable(`u_max_${n}`));ts.push(t);get(l.settle(get(l.startInitial(t)).attempt,'success'));}
  for(let n=0;n<182;n++)ordinary(l);
  expect(l.stats()).toMatchObject({requests:190,reserved:20,tables:8});
  expect(l.startOrdinary(get(l.openOrdinary('ordinary')))).toMatchObject({ok:false,code:'request_budget_exceeded',terminal:false});
  get(l.enterFinal());
  const slots=[l.parent,l.metadata,...ts.map(t=>get(l.tableSlot(t)))];
  for(let n=0;n<slots.length;n++){const target=n===0?'parent':n===1?'metadata':ts[n-2];
    get(l.settle(get(l.startFinal(slots[n],target)).attempt,'retryable'));get(l.settle(get(l.startFinal(slots[n],target)).attempt,'success'));}
  expect(l.stats()).toMatchObject({requests:210,reserved:0});
});
it('rejects the legacy boolean as final authority',()=>{
  const l=setup();get(l.enterFinal());expect(l.startFinal(l.parent,true as never)).toEqual({ok:false,code:'evidence_binding_mismatch',terminal:true});
});
it('admits 8 tables, reuses cached identity, rejects a ninth without modifying T/R',()=>{
  const l=setup();let first;
  for(let n=0;n<8;n++){const t=get(l.admitTable(`u_table_${n}`));first??=t;
    expect(l.admitTable(`u_table_${n}`)).toEqual({ok:true,value:t});get(l.settle(get(l.startInitial(t)).attempt,'success'));}
  const before=l.stats();expect(before).toMatchObject({tables:8,reserved:20,requests:8});
  expect(l.admitTable('u_table_8')).toEqual({ok:false,code:'scope_evidence_limit',terminal:false});
  expect(l.stats()).toMatchObject({requests:8,tables:8,reserved:20});expect(get(l.admitTable('u_table_0'))).toBe(first);
});
it('holds the initial allowance exclusively until the logical read ends',()=>{
  const l=setup(),t=get(l.admitTable('incident'));
  expect(l.openOrdinary('ordinary')).toEqual({ok:false,code:'invalid_state',terminal:true});
  expect(l.startInitial(t)).toEqual({ok:false,code:'invalid_state',terminal:true});expect(l.stats().requests).toBe(0);
});
it.each(['slot_target','slot_order','other_ledger','clone'] as const)('rejects reservation diversion: %s',mode=>{
  const l=setup();get(l.enterFinal());
  const r=mode==='slot_target'?l.startFinal(l.parent,'metadata'):mode==='slot_order'?l.startFinal(l.metadata,'metadata'):
    mode==='other_ledger'?l.startFinal(setup().parent,'parent'):l.startFinal(structuredClone(l.parent),'parent');
  expect(r).toMatchObject({ok:false,terminal:true});expect(l.stats()).toMatchObject({phase:'stopped',requests:0,reserved:0});
  expect(l.startFinal(l.parent,'parent')).toEqual(r);
});
it('rejects table A using table B slot without dispatching',()=>{
  const l=setup(),a=get(l.admitTable('incident'));get(l.settle(get(l.startInitial(a)).attempt,'success'));
  const b=get(l.admitTable('task'));get(l.settle(get(l.startInitial(b)).attempt,'success'));finalBase(l);
  expect(l.startFinal(get(l.tableSlot(b)),a)).toEqual({ok:false,code:'evidence_binding_mismatch',terminal:true});
  expect(l.stats().requests).toBe(4);
});
it('does not permit a third final attempt or borrow another slot',()=>{
  const l=setup();get(l.enterFinal());let a=get(l.startFinal(l.parent,'parent'));get(l.settle(a.attempt,'retryable'));
  a=get(l.startFinal(l.parent,'parent'));get(l.settle(a.attempt,'retryable'));
  expect(l.stats()).toMatchObject({requests:2,reserved:2});
  expect(l.startFinal(l.parent,'parent')).toEqual({ok:false,code:'invalid_state',terminal:true});
  expect(l.stats().requests).toBe(2);
});
it('releases unused quota without increasing physical attempt counts',()=>{
  const l=setup(190);get(l.enterFinal());get(l.settle(get(l.startFinal(l.parent,'parent')).attempt,'success'));
  expect(l.stats()).toMatchObject({requests:191,reserved:2});expect(l.stats().slots[0]).toMatchObject({remaining:0,attempts:1,state:'done'});
  expect(l.openOrdinary('ordinary')).toEqual({ok:false,code:'invalid_state',terminal:true});
});
it('skips final only after initial unavailable, with zero final attempts',()=>{
  const l=setup(),t=get(l.admitTable('incident')),slot=get(l.tableSlot(t));
  get(l.settle(get(l.startInitial(t)).attempt,'unavailable'));expect(l.stats().reserved).toBe(6);
  finalBase(l);get(l.skipTableFinal(t,slot));expect(l.stats()).toMatchObject({requests:3,reserved:0});
  expect(l.stats().slots[2]).toMatchObject({attempts:0,state:'skipped',remaining:0});
  expect(l.skipTableFinal(t,slot)).toMatchObject({ok:false,terminal:true});
});
it('does not skip a final for available initial evidence',()=>{
  const l=setup(),t=get(l.admitTable('incident')),slot=get(l.tableSlot(t));get(l.settle(get(l.startInitial(t)).attempt,'success'));finalBase(l);
  expect(l.skipTableFinal(t,slot)).toEqual({ok:false,code:'invalid_state',terminal:true});
});
it.each(['initial','ordinary','final'] as const)('rejects a duplicate completion: %s',lane=>{
  const l=setup();let a;
  if(lane==='initial'){const t=get(l.admitTable('incident'));a=get(l.startInitial(t));}
  else if(lane==='final'){get(l.enterFinal());a=get(l.startFinal(l.parent,'parent'));}
  else a=get(l.startOrdinary(get(l.openOrdinary('ordinary'))));
  get(l.settle(a.attempt,'success'));const before=l.stats().requests;
  expect(l.settle(a.attempt,'success')).toEqual({ok:false,code:'invalid_state',terminal:true});expect(l.stats().requests).toBe(before);
});
it.each(['cancelled','deadline_exceeded','authentication_failed','access_denied'] as const)('invalidates all reservations and retains first %s',code=>{
  const l=setup(),t=get(l.admitTable('incident')),a=get(l.startInitial(t));const first=l.stop(code);
  expect(l.stats()).toMatchObject({requests:1,reserved:0,phase:'stopped',primary:code});
  expect(l.settle(a.attempt,'success')).toEqual(first);expect(l.close()).toEqual(first);expect(l.stop('cancelled')).toEqual(first);
  expect(l.admitTable('task')).toEqual(first);
});
it('refuses foreign/copied attempts and reads, keeping only a fixed reason',()=>{
  for(const copy of [false,true]){const l=setup(),r=get(l.openOrdinary('ordinary')),a=get(l.startOrdinary(r));
    const other=setup(),b=get(other.startOrdinary(get(other.openOrdinary('ordinary'))));
    expect(l.settle(copy?structuredClone(a.attempt):b.attempt,'success')).toEqual({ok:false,code:'evidence_binding_mismatch',terminal:true});}
  const l=setup(),other=setup();expect(l.startOrdinary(get(other.openOrdinary('ordinary')))).toMatchObject({ok:false,code:'evidence_binding_mismatch'});
});
it('keeps handles and returned cost dimensions opaque and immutable',()=>{
  const l=setup(),r=get(l.openOrdinary('oauth')),a=get(l.startOrdinary(r));
  expect(a.cost).toEqual({dimension:'http_attempt',lane:'oauth',attempt:1,slot:null});expect(Object.isFrozen(a.cost)).toBe(true);
  expect(JSON.stringify([l.parent,l.metadata,r,a.attempt])).toBe('[{},{},{},{}]');
});
it.each(['binding','cancel','duplicate','soft_admission','normal_full'] as const)('matches independent accounting on failure: %s',mode=>{
  const consumed=mode==='soft_admission'?203:mode==='normal_full'?206:0,l=setup(consumed),events:ReservationEvent[]=[];
  if(mode==='soft_admission')expect(l.admitTable('incident').ok).toBe(false);
  else if(mode==='normal_full')expect(l.startOrdinary(get(l.openOrdinary('ordinary'))).ok).toBe(false);
  else if(mode==='binding'){get(l.enterFinal());events.push({kind:'final'});l.startFinal(l.parent,'metadata');events.push({kind:'stop'});}
  else{const r=get(l.openOrdinary('oauth')),a=get(l.startOrdinary(r));events.push({kind:'dispatch',lane:'oauth'});
    if(mode==='cancel')l.stop('cancelled');else{get(l.settle(a.attempt,'success'));l.settle(a.attempt,'success');}events.push({kind:'stop'});}
  const o=reservationOracle(consumed,210,events),s=l.stats();
  expect({requests:s.requests,reserved:s.reserved,tables:s.tables,phase:s.phase}).toEqual({requests:o.requests,reserved:o.reserved,tables:o.tables,phase:o.phase});
});
it('does not call fetch, clocks, timers or logs',()=>{
  const f=vi.fn(()=>{throw Error('forbidden');});vi.stubGlobal('fetch',f);
  const clock=vi.spyOn(Date,'now').mockImplementation(f),timer=vi.spyOn(globalThis,'setTimeout').mockImplementation(f),log=vi.spyOn(console,'log').mockImplementation(f);
  try{const l=setup();ordinary(l);finalBase(l);expect(f).not.toHaveBeenCalled();}
  finally{clock.mockRestore();timer.mockRestore();log.mockRestore();vi.unstubAllGlobals();}
});
it.each(Array.from({length:32},(_,n)=>n))('matches the independent event oracle at every prefix: trace %i',seed=>{
  const l=setup(),events:ReservationEvent[]=[];
  function check(){const o=reservationOracle(0,210,events),s=l.stats();
    expect({requests:s.requests,reserved:s.reserved,tables:s.tables,phase:s.phase}).toEqual({requests:o.requests,reserved:o.reserved,tables:o.tables,phase:o.phase});
    expect(s.slots.map(x=>({remaining:x.remaining,attempts:x.attempts}))).toEqual(o.slots);}
  check();
  for(let n=0;n<seed%5;n++){const r=get(l.openOrdinary(n===0?'oauth':'ordinary'));
    const lane=n===0?'oauth':'ordinary';let a=get(l.startOrdinary(r));events.push({kind:'dispatch',lane});check();
    const retry=(n+seed)%2===0;get(l.settle(a.attempt,retry?'retryable':'success'));
    if(retry){a=get(l.startOrdinary(r));events.push({kind:'dispatch',lane});check();get(l.settle(a.attempt,'success'));}check();}
  const tableHandles=[];
  for(let n=0;n<seed%9;n++){const t=get(l.admitTable(`u_oracle_${n}`));tableHandles.push(t);events.push({kind:'admit'});check();
    let a=get(l.startInitial(t));events.push({kind:'dispatch',lane:'initial'});check();const retry=(n+seed)%3===0;
    get(l.settle(a.attempt,retry?'retryable':'success'));if(retry){a=get(l.startInitial(t));events.push({kind:'dispatch',lane:'initial'});check();get(l.settle(a.attempt,'unavailable'));}check();}
  get(l.enterFinal());events.push({kind:'final'});check();
  const slots=[l.parent,l.metadata,...tableHandles.map(t=>get(l.tableSlot(t)))];
  for(let n=0;n<slots.length;n++){
    const target=n===0?'parent' as const:n===1?'metadata' as const:tableHandles[n-2];
    if(n>=2 && (n-2+seed)%3===0){get(l.skipTableFinal(tableHandles[n-2],slots[n]));events.push({kind:'release',slot:n});check();continue;}
    let a=get(l.startFinal(slots[n],target));events.push({kind:'dispatch',lane:'final',slot:n});check();
    const retry=(n+seed)%2===0;get(l.settle(a.attempt,retry?'retryable':'success'));
    if(retry){a=get(l.startFinal(slots[n],target));events.push({kind:'dispatch',lane:'final',slot:n});check();get(l.settle(a.attempt,'unavailable'));}
    events.push({kind:'release',slot:n});check();}
  l.close();events.push({kind:'stop'});check();
});
