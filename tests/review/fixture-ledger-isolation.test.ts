import { afterEach, expect, it } from 'vitest';
import { BoundedReadSession } from '../../src/servicenow/bounded-read.js';
import { createFakeSessionOwnerIssuer } from '../../src/review/abort-scope-evidence-session-fixture.js';
import { registerFixtureReviewSession } from '../../src/review/abort-scope-evidence-fixture-lifecycle.js';
import { FixtureAccountingSession } from '../../src/review/abort-scope-evidence-accounting-fixture.js';
import { createSessionBoundFakeTransport } from '../../src/review/abort-scope-evidence-transport-budget.js';
import { FixtureReadSession } from '../../src/review/abort-scope-evidence-read-fixture.js';
const sessions:{close():void}[]=[];let serial=0;
const facts={parent_ready:true,final_started:false,release_match:'matched'};
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string})=>{if(!r.ok)throw Error(r.code);return r.value;};
afterEach(()=>sessions.splice(0).forEach(s=>s.close()));
async function real(){const s=new BoundedReadSession({instanceUrl:'https://fixture.service-now.com',authMode:'per-user',perUserBearerToken:`DUMMY_${serial++}`,oauth:{clientId:'',clientSecret:''}},{fetch:async()=>new Response('{}')});sessions.push(s);await s.get('/api/now/table/sys_update_set?sysparm_limit=1');return s;}
it('does not auto-enrol an actual session in the fixture registry',async()=>{
  const s=await real(),f=createFakeSessionOwnerIssuer(),before=s.stats();expect(f.source(s,facts)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(()=>registerFixtureReviewSession(s,{},()=>{throw Error('must not run');})).toThrow('invalid_state');
  expect(f.source(s,facts)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(s.stats()).toEqual(before);
  await expect(s.get('/api/now/table/sys_update_set?sysparm_limit=1')).resolves.toEqual({});
});
it.each(['original','clone'] as const)('does not let a %s fixture owner claim, stop or charge a real session',async kind=>{
  const s=await real(),fake=new FixtureAccountingSession();sessions.push(fake);await fake.baseline('{}',()=>{});
  const f=createFakeSessionOwnerIssuer(),src=get(f.source(fake,facts)),owner=get(f.claim(fake,src.source,src.permit)),before=s.stats();
  const result=createSessionBoundFakeTransport(s,kind==='clone'?structuredClone(owner):owner,{dispatch:()=>{throw Error('no dispatch');}});
  expect(result.ok).toBe(false);expect(s.stats()).toEqual(before);await expect(s.get('/api/now/table/sys_update_set?sysparm_limit=1')).resolves.toEqual({});
  s.chargePayload('<a/>');expect(s.stats().payload_bytes).toBe(4);
});
it('keeps a real payload-budget failure in its disjoint fixture observer across close',async()=>{
  const s=new FixtureReadSession({instanceUrl:'https://fixture.service-now.com',authMode:'per-user',perUserBearerToken:`DUMMY_${serial++}`,oauth:{clientId:'',clientSecret:''}},
    {fetch:async()=>new Response('{}'),limits:{totalPayloadBytes:3}});sessions.push(s);
  await s.get('/api/now/table/sys_update_set?sysparm_limit=1');const f=createFakeSessionOwnerIssuer(),src=get(f.source(s,facts)),owner=get(f.claim(s,src.source,src.permit));
  expect(()=>s.chargePayload('<a/>')).toThrow('payload_budget_exceeded');
  expect(f.check(owner)).toEqual({ok:false,code:'payload_budget_exceeded'});s.close();expect(get(f.status(owner)).code).toBe('payload_budget_exceeded');
});
