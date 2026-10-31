import {expect,it} from 'vitest';
// No development module is imported here, so this file holds the runtime friend itself.
import {takeStatusAcceptanceProbe,type ReadSnapshot} from '../../src/servicenow/bounded-read.js';

const id='a'.repeat(32),parent={sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-10-31',sys_mod_count:'0'};
const snapshot=():ReadSnapshot=>({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{clientId:'unused'}});
const probe=takeStatusAcceptanceProbe();
const fake=(change:Record<string,unknown>={})=>Object.freeze({parent:()=>new TextEncoder().encode(JSON.stringify({result:parent})),
 observe:async()=>Object.freeze({purpose:'release',status:403,cleanup:'cancelled'}),dispose:()=>{},...change});

it('accepts a pinned fake through the one-shot friend and refuses a second take',async()=>{
 expect(await probe(snapshot(),{update_set_sys_id:id},{fake:fake()})).toMatchObject({state:'status_accepted_closed_gate',consumptions:1,cleanup:'closed'});
 expect(()=>takeStatusAcceptanceProbe()).toThrow('internal_review_error');
});
it.each([
 ['missing method',{dispose:undefined}],
 ['non-byte parent',{parent:()=>'{}'}],
 ['extra observation key',{observe:async()=>({purpose:'release',status:403,cleanup:'cancelled',fallback:true})}],
 ['non-candidate status',{observe:async()=>({purpose:'release',status:200,cleanup:'cancelled'})}],
 ['accessor observation',{observe:async()=>Object.defineProperty({purpose:'release',status:403},'cleanup',{get:()=>'cancelled',enumerable:true})}],
])('rejects a %s from a caller-built fake without accepting',async(_name,change)=>{
 await expect(probe(snapshot(),{update_set_sys_id:id},{fake:fake(change)})).rejects.toMatchObject({code:expect.stringMatching(/^(invalid_input|invalid_response)$/)});
});
