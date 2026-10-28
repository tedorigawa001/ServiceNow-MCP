import {expect,it} from 'vitest';
import {createFakeClosedBodyGate} from '../../src/review/abort-scope-evidence-closed-body-gate.js';
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
function setup(accounting:Record<string,number>={},io={dispatch(){}}){
  let now=0;const gate=createFakeClosedBodyGate({now:()=>now},io),s=get(gate.construct({accounting})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r));
  const port=get(gate.claimAccounting(s,r,t));return {gate,s,r,t,port,time:(n:number)=>{now=n;}};
}
it('uses one fake ReadState for ordinary attempts and reserved final attempts while the formal body gate stays closed',()=>{
  let calls=0;const gate=createFakeClosedBodyGate({now:()=>0},{dispatch(){calls++;}});
  const s=get(gate.construct({accounting:{requests:7}})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r));
  const port=get(gate.claimAccounting(s,r,t));
  const p=get(port.openPurpose({kind:'parent_initial'})),a=get(port.dispatch(p));
  get(port.chunk(a,0,3));get(port.settle(a,{outcome:'success',cleanup:'confirmed'}));
  get(port.enterFinal());const f=get(port.openFinal(port.parentFinal)),b=get(port.dispatch(f));
  get(port.chunk(b,0,2));get(port.settle(b,{outcome:'success',cleanup:'confirmed'}));
  get(port.skipFinal(port.metadataFinal));
  expect(port.stats()).toMatchObject({requests:2,received_bytes:5,reserved:0,phase:'final'});
  expect(gate.diagnostic().accounting).toEqual(port.stats());expect(calls).toBe(2);
  expect(gate.refuseBody(s,r,t)).toEqual({ok:false,code:'issuance_disabled'});
});
it('charges both retries to the same C/G, resets only S, and releases unused final retry capacity once',()=>{
  const {port}=setup({requests:6,response_bytes:3,total_bytes:7});
  const p=get(port.openPurpose({kind:'parent_initial'})),a=get(port.dispatch(p));
  get(port.chunk(a,0,3));get(port.settle(a,{outcome:'retryable',cleanup:'confirmed'}));
  const b=get(port.dispatch(p));get(port.chunk(b,0,3));get(port.settle(b,{outcome:'success',cleanup:'confirmed'}));
  get(port.enterFinal());const f=get(port.openFinal(port.parentFinal)),c=get(port.dispatch(f));
  get(port.chunk(c,0,1));get(port.settle(c,{outcome:'success',cleanup:'confirmed'}));get(port.skipFinal(port.metadataFinal));
  expect(port.stats()).toMatchObject({requests:3,received_bytes:7,reserved:0});
});
it('reserves table finals atomically without precharging initial attempts and counts E inside G only once',()=>{
  const {port}=setup({requests:9});const table=get(port.admitTable('incident'));
  expect(port.stats()).toMatchObject({requests:0,reserved:6,tables:1});
  const a=get(port.dispatch(table.initial));get(port.chunk(a,0,13));get(port.settle(a,{outcome:'success',cleanup:'confirmed'}));
  get(port.enterFinal());get(port.skipFinal(port.parentFinal));get(port.skipFinal(port.metadataFinal));
  const f=get(port.openFinal(table.final)),b=get(port.dispatch(f));get(port.chunk(b,0,7));get(port.settle(b,{outcome:'success',cleanup:'confirmed'}));
  expect(port.stats()).toMatchObject({requests:2,received_bytes:20,evidence_bytes:20,reserved:0,tables:1});
});
it('charges payload acceptance once, retaining rejected bytes without charging them again to G',()=>{
  const {port,gate}=setup({payload_bytes:3,total_payload_bytes:5});
  const p=get(port.openPurpose({kind:'payload'})),a=get(port.dispatch(p));get(port.chunk(a,0,4));get(port.settle(a,{outcome:'success',cleanup:'confirmed'}));
  expect(port.chargePayload(a,4)).toEqual({ok:false,code:'payload_limit'});expect(gate.diagnostic().primary).toBeNull();
  const q=get(port.openPurpose({kind:'payload'})),b=get(port.dispatch(q));get(port.chunk(b,0,2));get(port.settle(b,{outcome:'success',cleanup:'confirmed'}));
  expect(port.chargePayload(b,2)).toEqual({ok:false,code:'payload_budget_exceeded'});
  expect(port.stats()).toMatchObject({requests:2,received_bytes:6,payload_bytes:6,phase:'stopped'});
  expect(port.chargePayload(b,2).ok).toBe(false);expect(port.stats().payload_bytes).toBe(6);
});
it('keeps reserved final capacity usable after ordinary capacity is exhausted and never reopens ordinary work',()=>{
  const {port,gate}=setup({requests:5});const p=get(port.openPurpose({kind:'parent_initial'})),a=get(port.dispatch(p));
  get(port.settle(a,{outcome:'success',cleanup:'confirmed'}));const q=get(port.openPurpose({kind:'metadata_initial'}));
  expect(port.dispatch(q)).toEqual({ok:false,code:'request_budget_exceeded'});expect(gate.diagnostic().primary).toBeNull();
  expect(port.stats()).toMatchObject({requests:1,reserved:4,ordinary_closed:true});get(port.enterFinal());
  const f=get(port.openFinal(port.parentFinal)),b=get(port.dispatch(f));get(port.settle(b,{outcome:'retryable',cleanup:'confirmed'}));
  const c=get(port.dispatch(f));get(port.settle(c,{outcome:'success',cleanup:'confirmed'}));get(port.skipFinal(port.metadataFinal));
  expect(port.stats()).toMatchObject({requests:3,reserved:0,ordinary_closed:true});expect(port.openPurpose({kind:'release_rows'}).ok).toBe(false);
});
it('does not create a fresh logical purpose to bypass an exhausted two-attempt singleton',()=>{
  const {port}=setup();const p=get(port.openPurpose({kind:'oauth'}));
  for(let i=0;i<2;i++){const a=get(port.dispatch(p));get(port.settle(a,{outcome:'retryable',cleanup:'confirmed'}));}
  expect(port.openPurpose({kind:'oauth'})).toEqual({ok:false,code:'invalid_state'});expect(port.stats().requests).toBe(2);
});
it('uses the constructor clock for the 50/55 second cutoffs without restarting time at accounting claim or final entry',()=>{
  const {port,time,gate}=setup();const p=get(port.openPurpose({kind:'parent_initial'}));time(50000);
  expect(port.dispatch(p)).toEqual({ok:false,code:'phase_deadline_exceeded'});expect(port.stats().requests).toBe(0);expect(gate.diagnostic().primary).toBeNull();
  get(port.enterFinal());time(54999);get(port.skipFinal(port.parentFinal));time(55000);
  expect(port.skipFinal(port.metadataFinal)).toEqual({ok:false,code:'phase_deadline_exceeded'});expect(gate.diagnostic().primary?.code).toBe('phase_deadline_exceeded');
});
it('rejects a final read without a collected initial result rather than manufacturing an observation',()=>{
  const {port}=setup();get(port.enterFinal());expect(port.openFinal(port.parentFinal)).toEqual({ok:false,code:'invalid_state'});expect(port.stats().requests).toBe(0);
});
it('matches an independent event/token oracle across OAuth, table retry, local failure and ordered finals',()=>{
  const {port,gate}=setup({requests:12});
  type Event={kind:'dispatch';slot?:string}|{kind:'chunk';size:number;table?:true}|{kind:'payload';size:number}|{kind:'table';id:string}|{kind:'release';slot:string};
  const events:Event[]=[];
  function record(event:Event){events.push(event);
    const tokens=new Set(['parent:0','parent:1','metadata:0','metadata:1']);let c=0,g=0,e=0,t=0,p=0;
    for(const event of events){
      if(event.kind==='table'){t++;tokens.add(event.id+':0');tokens.add(event.id+':1');}
      if(event.kind==='dispatch'){c++;if(event.slot){const token=[...tokens].find(x=>x.startsWith(event.slot+':'));expect(token).toBeDefined();tokens.delete(token!);}}
      if(event.kind==='chunk'){g+=event.size;if(event.table)e+=event.size;}
      if(event.kind==='payload')p+=event.size;
      if(event.kind==='release')for(const token of tokens)if(token.startsWith(event.slot+':'))tokens.delete(token);
    }
    expect(port.stats()).toMatchObject({requests:c,received_bytes:g,payload_bytes:p,evidence_bytes:e,tables:t,reserved:tokens.size});
    expect(gate.diagnostic().accounting).toEqual(port.stats());expect(c+tokens.size).toBeLessThanOrEqual(12);
  }
  const oauth=get(port.openPurpose({kind:'oauth'})),o=get(port.dispatch(oauth));record({kind:'dispatch'});
  get(port.chunk(o,0,5));record({kind:'chunk',size:5});get(port.settle(o,{outcome:'success',cleanup:'confirmed'}));
  const p=get(port.openPurpose({kind:'parent_initial'})),a=get(port.dispatch(p));record({kind:'dispatch'});get(port.settle(a,{outcome:'success',cleanup:'confirmed'}));
  const table=get(port.admitTable('incident'));record({kind:'table',id:'table'});
  const b=get(port.dispatch(table.initial));record({kind:'dispatch'});get(port.chunk(b,0,4));record({kind:'chunk',size:4,table:true});get(port.settle(b,{outcome:'retryable',cleanup:'confirmed'}));
  const c=get(port.dispatch(table.initial));record({kind:'dispatch'});get(port.chunk(c,0,3));record({kind:'chunk',size:3,table:true});get(port.settle(c,{outcome:'unavailable',cleanup:'confirmed'}));
  const payload=get(port.openPurpose({kind:'payload'})),pa=get(port.dispatch(payload));record({kind:'dispatch'});
  get(port.chunk(pa,0,3));record({kind:'chunk',size:3});get(port.settle(pa,{outcome:'success',cleanup:'confirmed'}));get(port.chargePayload(pa,3));record({kind:'payload',size:3});
  get(port.enterFinal());const f=get(port.openFinal(port.parentFinal)),d=get(port.dispatch(f));record({kind:'dispatch',slot:'parent'});
  get(port.chunk(d,0,2));record({kind:'chunk',size:2});get(port.settle(d,{outcome:'success',cleanup:'confirmed'}));record({kind:'release',slot:'parent'});
  get(port.skipFinal(port.metadataFinal));record({kind:'release',slot:'metadata'});get(port.skipFinal(table.final));record({kind:'release',slot:'table'});
  expect(port.stats()).toMatchObject({requests:6,received_bytes:17,payload_bytes:3,evidence_bytes:7,reserved:0});
});
it.each([4,5,6,7,8,210])('retains C+R<=Q for synthetic request cap %i without changing the production Q policy',q=>{
  const {port,gate}=setup({requests:q});const p=get(port.openPurpose({kind:'oauth'}));const a=port.dispatch(p);
  expect(a.ok).toBe(q>4);expect(port.stats().requests+port.stats().reserved).toBeLessThanOrEqual(q);
  expect(gate.diagnostic().body_gate).toBe('closed');
});
it.each([{requests:3},{requests:211},{total_bytes:16777217},{response_bytes:4194305},{payload_bytes:2097153},{total_payload_bytes:8388609},{total_bytes:0}])('rejects raised or invalid synthetic bounds %j before dispatch',accounting=>{
  let calls=0;const gate=createFakeClosedBodyGate({now:()=>0},{dispatch(){calls++;}});expect(gate.construct({accounting}).ok).toBe(false);expect(calls).toBe(0);
});
it.each(['response','total'] as const)('retains an overshooting %s chunk exactly once and stops both gate and retained port',kind=>{
  const {port,gate,s,r,t}=setup(kind==='response'?{response_bytes:3}:{total_bytes:3});const p=get(port.openPurpose({kind:'oauth'})),a=get(port.dispatch(p));
  get(port.chunk(a,0,3));expect(port.chunk(a,1,1)).toEqual({ok:false,code:'receive_budget_exceeded'});
  const before=port.stats();expect(before.received_bytes).toBe(4);expect(port.chunk(a,2,9).ok).toBe(false);expect(port.stats()).toEqual(before);
  expect(gate.checkBinding(s,r,t)).toEqual({ok:false,code:'receive_budget_exceeded'});expect(gate.diagnostic().primary?.code).toBe('receive_budget_exceeded');
});
it('counts dispatch even on a synchronous fake I/O failure and retains the first diagnosis through close',()=>{
  const {port,gate}=setup({},{dispatch(){throw Error('PRIVATE_CREDENTIAL');}});const p=get(port.openPurpose({kind:'oauth'}));
  expect(port.dispatch(p)).toEqual({ok:false,code:'upstream_unavailable'});gate.stop('cancelled');gate.close();
  expect(port.stats()).toMatchObject({requests:1,received_bytes:0,phase:'stopped'});expect(JSON.stringify(gate.diagnostic())).not.toContain('PRIVATE');
  expect(gate.diagnostic().primary?.code).toBe('upstream_unavailable');
});
it('revokes before a reentrant fake dispatch can publish another attempt',()=>{
  let nested:unknown,hook=()=>{};const {port,gate}=setup({},{dispatch(){hook();}});const p=get(port.openPurpose({kind:'oauth'}));
  hook=()=>{nested=port.dispatch(p);};expect(port.dispatch(p)).toEqual({ok:false,code:'invalid_state'});
  expect(nested).toEqual({ok:false,code:'invalid_state'});expect(port.stats().requests).toBe(1);expect(gate.diagnostic().primary?.code).toBe('invalid_state');
});
it('retains a committed dispatch but not subsequent chunks when its callback cancels the shared owner',()=>{
  let hook=()=>{};const {port,gate}=setup({},{dispatch(){hook();}});hook=()=>{gate.stop('cancelled');};const p=get(port.openPurpose({kind:'oauth'}));
  expect(port.dispatch(p)).toEqual({ok:false,code:'cancelled'});expect(port.stats()).toMatchObject({requests:1,received_bytes:0,reserved:0});expect(port.openPurpose({kind:'payload'}).ok).toBe(false);
});
it('does not publish an attempt when fake dispatch advances the original clock to its phase deadline',()=>{
  let now=0;const gate=createFakeClosedBodyGate({now:()=>now},{dispatch(){now=50000;}}),s=get(gate.construct({accounting:{}})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r)),port=get(gate.claimAccounting(s,r,t));
  const p=get(port.openPurpose({kind:'oauth'}));expect(port.dispatch(p)).toEqual({ok:false,code:'phase_deadline_exceeded'});
  expect(port.stats()).toMatchObject({requests:1,phase:'stopped'});expect(gate.diagnostic().primary?.code).toBe('phase_deadline_exceeded');
});
it.each(['unconfirmed','invalid'] as const)('does not retry or refund an attempt with %s cleanup',cleanup=>{
  const {port,gate}=setup();const p=get(port.openPurpose({kind:'oauth'})),a=get(port.dispatch(p));get(port.chunk(a,0,2));
  expect(port.settle(a,{outcome:'retryable',cleanup}).ok).toBe(false);expect(port.dispatch(p).ok).toBe(false);
  expect(port.stats()).toMatchObject({requests:1,received_bytes:2,reserved:0,phase:'stopped'});expect(gate.diagnostic().primary?.code).toBe(cleanup==='unconfirmed'?'cleanup_unconfirmed':'invalid_input');
});
it.each(['purpose','attempt','slot'] as const)('rejects a foreign %s without changing its original owner',kind=>{
  const own=setup(),foreign=setup();const p=get(own.port.openPurpose({kind:'oauth'})),q=get(foreign.port.openPurpose({kind:'oauth'}));
  const b=get(foreign.port.dispatch(q)),before=foreign.port.stats();
  if(kind==='purpose')expect(own.port.dispatch(q).ok).toBe(false);
  else if(kind==='attempt')expect(own.port.chunk(b,0,2).ok).toBe(false);
  else{get(own.port.enterFinal());expect(own.port.skipFinal(foreign.port.parentFinal).ok).toBe(false);}
  expect(foreign.port.stats()).toEqual(before);expect(foreign.gate.diagnostic().primary).toBeNull();expect(own.port.dispatch(p).ok).toBe(false);
});
it.each(['settle','chunk','dispatch','skip'] as const)('rejects duplicate %s without double charging or restoring reservations',kind=>{
  const {port}=setup();const p=get(port.openPurpose({kind:'oauth'})),a=get(port.dispatch(p));
  if(kind==='dispatch'){expect(port.dispatch(p).ok).toBe(false);expect(port.stats().requests).toBe(1);return;}
  if(kind==='chunk'){get(port.chunk(a,0,2));expect(port.chunk(a,0,2).ok).toBe(false);expect(port.stats().received_bytes).toBe(2);return;}
  get(port.settle(a,{outcome:'success',cleanup:'confirmed'}));
  if(kind==='settle')expect(port.settle(a,{outcome:'success',cleanup:'confirmed'}).ok).toBe(false);
  else{get(port.enterFinal());get(port.skipFinal(port.parentFinal));expect(port.skipFinal(port.parentFinal).ok).toBe(false);}
  expect(port.stats().requests).toBe(1);
});
it('does not release a successful initial slot or read finals out of order',()=>{
  for(const bad of ['skip','order']){const {port}=setup();const p=get(port.openPurpose({kind:'parent_initial'})),a=get(port.dispatch(p));get(port.settle(a,{outcome:'success',cleanup:'confirmed'}));get(port.enterFinal());
    expect((bad==='skip'?port.skipFinal(port.parentFinal):port.openFinal(port.metadataFinal)).ok).toBe(false);expect(port.stats().requests).toBe(1);}
});
it('retains the reservations but charges no attempts when table admission has insufficient room',()=>{
  const {port,gate}=setup({requests:7});expect(port.admitTable('incident')).toEqual({ok:false,code:'scope_evidence_limit'});
  expect(port.stats()).toMatchObject({requests:0,reserved:4,tables:0,evidence_closed:true});expect(gate.diagnostic().primary).toBeNull();
});
it('retains the first local refusal separately from a later global stop',()=>{
  const {port,gate}=setup({requests:7});expect(port.admitTable('incident').ok).toBe(false);
  expect(gate.diagnostic()).toMatchObject({primary:null,refusal:{stage:'accounting',code:'scope_evidence_limit'}});
  gate.stop('cancelled');gate.close();expect(gate.diagnostic()).toMatchObject({primary:{code:'cancelled'},refusal:{code:'scope_evidence_limit'}});
});
it('bounds tables at eight and keeps their final slots distinct and ordered',()=>{
  const {port,gate}=setup();const slots=[];
  for(let i=0;i<8;i++){const t=get(port.admitTable('u_table_'+i));slots.push(t.final);const a=get(port.dispatch(t.initial));get(port.settle(a,{outcome:'unavailable',cleanup:'confirmed'}));}
  expect(port.admitTable('u_ninth')).toEqual({ok:false,code:'scope_evidence_limit'});expect(gate.diagnostic().primary).toBeNull();
  expect(port.stats()).toMatchObject({requests:8,reserved:20,tables:8});get(port.enterFinal());get(port.skipFinal(port.parentFinal));get(port.skipFinal(port.metadataFinal));
  for(const slot of slots)get(port.skipFinal(slot));expect(port.stats()).toMatchObject({requests:8,reserved:0});
});
it('charges table overshoot to E and G, then requires confirmed cleanup before a reasoned final skip',()=>{
  const {port,gate}=setup();const t=get(port.admitTable('incident')),a=get(port.dispatch(t.initial));
  expect(port.chunk(a,0,16385)).toEqual({ok:false,code:'scope_evidence_limit'});
  get(port.settle(a,{outcome:'success',cleanup:'confirmed'}));get(port.enterFinal());get(port.skipFinal(port.parentFinal));get(port.skipFinal(port.metadataFinal));get(port.skipFinal(t.final));
  expect(port.stats()).toMatchObject({requests:1,received_bytes:16385,evidence_bytes:16385,reserved:0});expect(gate.diagnostic().primary).toBeNull();
  expect(port.stats().slots.map(s=>s.skip_reason)).toEqual(['not_collected','not_collected','initial_unavailable']);
});
it('does not adopt more chunks from a table attempt already rejected by the evidence cap',()=>{
  const {port}=setup();const t=get(port.admitTable('incident')),a=get(port.dispatch(t.initial));
  expect(port.chunk(a,0,16385).ok).toBe(false);expect(port.chunk(a,1,2)).toEqual({ok:false,code:'scope_evidence_limit'});
  expect(port.stats()).toMatchObject({received_bytes:16385,evidence_bytes:16385});
  get(port.settle(a,{outcome:'retryable',cleanup:'confirmed'}));expect(port.dispatch(t.initial).ok).toBe(false);expect(port.stats().requests).toBe(1);
});
it('shares cumulative E across initial/retry/final and skips later available tables after its one-byte overshoot',()=>{
  const {port,gate}=setup();const finals=[];
  for(let i=0;i<8;i++){const t=get(port.admitTable('u_table_'+i));finals.push(t.final);
    for(let n=0;n<2;n++){const a=get(port.dispatch(t.initial));get(port.chunk(a,0,16384));get(port.settle(a,{outcome:n===0?'retryable':'success',cleanup:'confirmed'}));}}
  expect(port.stats().evidence_bytes).toBe(262144);get(port.enterFinal());get(port.skipFinal(port.parentFinal));get(port.skipFinal(port.metadataFinal));
  const f=get(port.openFinal(finals[0]!)),a=get(port.dispatch(f));expect(port.chunk(a,0,1)).toEqual({ok:false,code:'scope_evidence_limit'});get(port.settle(a,{outcome:'success',cleanup:'confirmed'}));
  expect(port.openFinal(finals[1]!)).toEqual({ok:false,code:'scope_evidence_limit'});
  for(const slot of finals.slice(1))get(port.skipFinal(slot));
  expect(port.stats()).toMatchObject({requests:17,received_bytes:262145,evidence_bytes:262145,reserved:0});expect(gate.diagnostic().primary).toBeNull();
  expect(port.stats().slots.at(-1)?.skip_reason).toBe('evidence_disabled');
});
it('bounds payload logical reads at 100 without creating a second counter or owner',()=>{
  const {port}=setup();for(let i=0;i<100;i++){const p=get(port.openPurpose({kind:'payload'})),a=get(port.dispatch(p));get(port.settle(a,{outcome:'success',cleanup:'confirmed'}));get(port.discardPayload(a));}
  expect(port.openPurpose({kind:'payload'})).toEqual({ok:false,code:'request_budget_exceeded'});expect(port.stats().requests).toBe(100);
});
it.each(['new_read','final','double_charge'] as const)('requires one payload disposition before %s',kind=>{
  const {port}=setup();const p=get(port.openPurpose({kind:'payload'})),a=get(port.dispatch(p));get(port.settle(a,{outcome:'success',cleanup:'confirmed'}));
  if(kind==='new_read')expect(port.openPurpose({kind:'oauth'}).ok).toBe(false);
  else if(kind==='final')expect(port.enterFinal().ok).toBe(false);
  else{get(port.chargePayload(a,2));expect(port.chargePayload(a,2).ok).toBe(false);expect(port.stats().payload_bytes).toBe(2);}
});
it('discards pending modeled payload at the soft cutoff without charging P or blocking final transition',()=>{
  const {port,time,gate}=setup();const p=get(port.openPurpose({kind:'payload'})),a=get(port.dispatch(p));get(port.settle(a,{outcome:'success',cleanup:'confirmed'}));time(50000);
  expect(port.chargePayload(a,4)).toEqual({ok:false,code:'phase_deadline_exceeded'});expect(port.stats().payload_bytes).toBe(0);expect(gate.diagnostic().primary).toBeNull();
  get(port.enterFinal());get(port.skipFinal(port.parentFinal));get(port.skipFinal(port.metadataFinal));expect(port.stats().reserved).toBe(0);
});
it('retains one accounting claim and rejects its stale port after common close',()=>{
  const {port,gate,s,r,t}=setup();expect(gate.claimAccounting(s,r,t)).toEqual({ok:false,code:'invalid_state'});
  const p=get(port.openPurpose({kind:'oauth'}));gate.close();const d=gate.diagnostic();expect(port.dispatch(p)).toEqual({ok:false,code:'closed'});expect(gate.diagnostic()).toEqual(d);
  expect(Object.isFrozen(port.stats())).toBe(true);expect(Object.isFrozen(port.stats().slots)).toBe(true);expect(Reflect.has(port,'issueBody')).toBe(false);
});
