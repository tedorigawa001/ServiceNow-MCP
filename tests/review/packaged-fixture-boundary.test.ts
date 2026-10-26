import { afterEach, expect, it, vi } from 'vitest';
import * as lifecycle from '../../src/servicenow/review-evidence-lifecycle.js';
import { BoundedReadSession } from '../../src/servicenow/bounded-read.js';
const sessions:BoundedReadSession[]=[];let n=0;
afterEach(()=>sessions.splice(0).forEach(s=>s.close()));
const removed=['registerPreparedFixtureSource','claimPreparedFixtureOwner','claimPreparedTransportBudget','createPreparedFixtureWindow','claimPreparedTransfer','consumePreparedTransfer'];
it.each(removed)('does not export fixture authority from the packaged lifecycle: %s',name=>{
  expect(Reflect.has(lifecycle,name)).toBe(false);
});
it('does not switch a real session through any previously exported fixture chain',async()=>{
  const fetcher=vi.fn(async()=>new Response('{}'));
  const session=new BoundedReadSession({instanceUrl:'https://fixture.service-now.com',authMode:'per-user',perUserBearerToken:`DUMMY_${n++}`,oauth:{clientId:'',clientSecret:''}},{fetch:fetcher});sessions.push(session);
  const path='/api/now/table/sys_update_set?sysparm_limit=1';await session.get(path);const before=session.stats();
  // This branch exercises the exact pre-fix path on the old revision, not an invented replacement.
  const api=lifecycle as unknown as Record<string,(...args:unknown[])=>{ok:boolean;value?:unknown}>;
  if(api.registerPreparedFixtureSource){
    const source={},permit={};api.registerPreparedFixtureSource(session,source,permit,{parentReady:true,matched:true,finalStarted:false});
    const owner=api.claimPreparedFixtureOwner(session,source,permit);
    if(owner.ok)expect(api.claimPreparedTransportBudget(owner.value,session).ok).toBe(false);
  }
  expect(session.stats()).toEqual(before);await session.get(path);session.chargePayload('<a/>');session.setPhaseReserve(0);
  expect(session.stats()).toEqual({requests:2,received_bytes:4,payload_bytes:4});expect(fetcher).toHaveBeenCalledTimes(2);
  expect(Reflect.has(session,'claimTransportBudget')).toBe(false);
});
