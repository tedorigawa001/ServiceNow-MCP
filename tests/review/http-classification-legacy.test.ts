import {afterEach,expect,it,vi} from 'vitest';
import {BoundedReadSession} from '../../src/servicenow/bounded-read.js';
import {classifyHttpObservation} from '../../src/review/abort-scope-evidence-http-classification.js';
// Differential check: the classifier's legacy column must match the real legacy session, not only a hand-written table.
// Authentication is a POST inside authenticate() whose 200 body is token-parsed, so it is outside this GET comparison.
const paths={parent:'/api/now/table/sys_update_set?sysparm_limit=1',release:'/api/now/table/sys_cluster_state?sysparm_limit=21'};
// Response cannot carry a body for null-body statuses, so those tuples have no native counterpart.
const nullBody=new Set([204,205,304]);
afterEach(()=>{vi.useRealTimers();});
it.each(['parent','release'] as const)('legacy %s GET matches the classifier code, body read and retry count for every status',async purpose=>{
 vi.useFakeTimers();
 const mismatches:unknown[]=[];let compared=0;
 for(let status=200;status<=599;status++)for(const body of [false,true]){
  if(body&&nullBody.has(status))continue;
  let calls=0,pulls=0;
  const s=new BoundedReadSession({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE_'+status+'_'+body,oauth:{clientId:'unused'}},{fetch:(async()=>{
   calls++;
   // highWaterMark 0 keeps the stream lazy, so a pull means legacy actually read the body.
   const stream=body?new ReadableStream<Uint8Array>({pull(c){pulls++;c.enqueue(new TextEncoder().encode('{}'));c.close();}},{highWaterMark:0}):null;
   return new Response(stream,{status});
  }) as typeof fetch});
  const pending=s.get(paths[purpose]).then(()=>null,(e:{code?:string})=>e.code??'unexpected');
  await vi.advanceTimersByTimeAsync(1000);
  const code=await pending;s.close();
  const c=classifyHttpObservation({purpose,status,body_present:body});if(!c.ok)throw Error('classification');
  const expected={code:c.legacy.code,read:c.legacy.body==='json'||c.legacy.body==='drain',calls:c.legacy.category==='retry_candidate'?2:1};
  const actual={code,read:pulls>0,calls};compared++;
  if(JSON.stringify(actual)!==JSON.stringify(expected))mismatches.push({status,body,actual,expected});
 }
 expect(mismatches).toEqual([]);
 expect(compared).toBe(797);
});
