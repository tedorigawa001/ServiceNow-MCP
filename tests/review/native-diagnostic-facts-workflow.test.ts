import {afterEach,expect,it,vi} from 'vitest';
import {ReadableStream} from 'node:stream/web';
import {createInjectedNativeDiagnosticWorkflow as create,probeNativeStatusComposition as probe,runNativeDiagnosticFaultFixture} from '../../src/review/abort-scope-evidence-native-diagnostic.js';
import {nativeCleanupFactsEligible} from '../../src/review/abort-scope-evidence-native-diagnostic-facts.js';

afterEach(()=>vi.restoreAllMocks());
const id='a'.repeat(32),window={purpose:'release',ordinal:1,window_origin_ms:60000,cleanup_floor_ms:50000};
const parent=()=>new TextEncoder().encode(JSON.stringify({result:{sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-10-31',sys_mod_count:'0'}}));
const unit=()=>create({fake_io:true,deadline_ms:60000,budget:{read:()=>({remaining_ms:60000})},schedule:()=>()=>{}});
const composed=(response:Response)=>probe({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{}},{update_set_sys_id:id},{parent_bytes:parent(),response});

it.each([[true,false],[true,true],[false,false],[false,true]] as const)('retains old-realm Response reuse refusal unitFirst=%s body=%s',async(unitFirst,body)=>{
  const network=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('PRIVATE_NETWORK');});
  const stream=body?new ReadableStream():null,response=new Response(stream,{status:403});
  if(unitFirst){
    expect((await unit().execute(response,window)).counts.consumed).toBe(1);
    const r=await composed(response);expect(r.code).toBe('invalid_response');expect(r.consumptions).toBe(0);expect(r.native?.counts.issued).toBe(0);
  }else{
    expect((await composed(response)).ok).toBe(true);
    const r=await unit().execute(response,window);expect(r.upper.primary?.code).toBe('invalid_response');expect(r.counts.issued).toBe(0);
  }
  expect(network).not.toHaveBeenCalled();if(stream)expect(stream.locked).toBe(false);
});

it.each(['copy_terminal','foreign_terminal','copy_cleanup','foreign_anchor'])('keeps positive copied facts non-authoritative for %s',async scenario=>{
  const facts={reader_owned:false,closed_captured:false,read_started:false,read_pending:false,cancel:'not_applicable',closed:'not_applicable',release:'not_applicable'} as const;
  expect(nativeCleanupFactsEligible(false,{disposition:'confirmed',kind:'no_body',reason:null,wait_issue:null,facts:{...facts}},
    {get_reader:0,closed:0,cancel:0,release_lock:0,read:0})).toBe(true);
  const r=await runNativeDiagnosticFaultFixture({scenario});if(!r.ok)throw Error('fixture');
  const observed=r.diagnostic.upper.slots.release.cleanup.native;if(!observed)throw Error('cleanup fixture');
  expect(nativeCleanupFactsEligible(false,observed,r.diagnostic.operations)).toBe(true);
  expect(r.diagnostic.counts).toEqual({issued:1,consume_attempts:1,consumed:0});
  expect(r.diagnostic.upper.refusal?.code).toBe('evidence_binding_mismatch');expect(r.diagnostic.token_held).toBe(false);
});
