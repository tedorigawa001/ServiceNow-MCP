import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createInjectedNativeDiagnosticWorkflow as create,probeNativeStatusComposition} from '../../src/review/abort-scope-evidence-native-diagnostic.js';
import {BoundedReadError} from '../../src/servicenow/bounded-read.js';
import {createNativeDiagnosticState,permissions} from '../../src/review/abort-scope-evidence-native-diagnostic-state.js';
import {verifyRecovery,verifyRecoveryMutants} from './fixtures/native-construction-recovery-model.mjs';

afterEach(()=>vi.restoreAllMocks());

it('returns a stopped failure-only owner when a retained origin cannot be frozen',async()=>{
  const freeze=Object.freeze,read=vi.fn(()=>({remaining_ms:60000})),schedule=vi.fn(()=>()=>{});
  let origins=0;
  const spy=vi.spyOn(Object,'freeze').mockImplementation((value:unknown)=>{
    // State owns eight origin leaves; the ninth is the legacy control-preparation origin.
    if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===null&&Reflect.ownKeys(value).length===0&&++origins===9)
      throw Error('PRIVATE_CONSTRUCTION_SECRET');
    return freeze(value);
  });
  let owner:ReturnType<typeof create>;
  try { owner=create({fake_io:true,deadline_ms:60000,budget:{read},schedule}); }
  finally { spy.mockRestore(); }
  const copy=owner!.diagnostics();expect(copy.upper.primary?.code).toBe('internal_review_error');
  expect(copy.phase).toBe('closed');expect(copy.upper.teardown).toBe('not_started');
  expect(copy.upper.slots.release.http).toBeNull();expect(copy.upper.slots.release.cleanup.phase).toBe('not_started');
  expect(await owner!.close()).toBe(copy);expect(await owner!.execute(undefined,undefined)).toBe(copy);
  expect(owner!.diagnostics()).toBe(copy);expect(read).not.toHaveBeenCalled();expect(schedule).not.toHaveBeenCalled();
  expect(JSON.stringify(copy)).not.toContain('PRIVATE_CONSTRUCTION_SECRET');
});

it('retains fixed construction prefixes, refuses copy failure and never generates or dispatches a JoinCell',async()=>{
  const source=readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic.ts',import.meta.url),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  expect(await verifyRecovery(js,createNativeDiagnosticState,BoundedReadError,permissions)).toEqual({scenarios:24,bootstrap:5,partial:6,read:0,schedule:0,activeJoins:0,dispatches:0});
});

it('rejects six independently wrong recovery implementations rather than syntax failures',async()=>{
  const source=readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic.ts',import.meta.url),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  expect(await verifyRecoveryMutants(js,createNativeDiagnosticState,BoundedReadError,permissions)).toBe(6);
});

it('rejects failed failure-copy creation without retrying after the fault is removed',async()=>{
  const freeze=Object.freeze;let origins=0,copies=0;
  const spy=vi.spyOn(Object,'freeze').mockImplementation((value:unknown)=>{
    if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===null&&Reflect.ownKeys(value).length===0&&++origins===9)
      throw Error('PRIVATE_ORIGIN');
    if(value&&typeof value==='object'&&(value as {kind?:string}).kind==='injected_native_diagnostic_workflow') { copies++;throw Error('PRIVATE_COPY'); }
    return freeze(value);
  });
  let owner:ReturnType<typeof create>;
  try {owner=create({fake_io:true,deadline_ms:60000,budget:{read:()=>{throw Error('NO_BUDGET');}},schedule:()=>{throw Error('NO_SCHEDULER');}});}
  finally {spy.mockRestore();}
  expect(copies).toBe(1);expect(()=>owner!.diagnostics()).toThrow('internal_review_error');
  await expect(owner!.close()).rejects.toThrow('internal_review_error');await expect(owner!.execute(undefined,undefined)).rejects.toThrow('internal_review_error');
  owner!.stop();await expect(owner!.close()).rejects.toThrow('internal_review_error');expect(copies).toBe(1);
});

it('retains the native failure before the real-class fake driver can reserve or dispatch',async()=>{
  const freeze=Object.freeze,response=new Response(null,{status:403}),id='a'.repeat(32);
  const bytes=new TextEncoder().encode(JSON.stringify({result:{sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-11-16',sys_mod_count:'0'}}));
  const spy=vi.spyOn(Object,'freeze').mockImplementation((value:unknown)=>{
    if(value&&typeof value==='object'&&Object.hasOwn(value,'root')&&Object.hasOwn(value,'work')&&(value as {kind?:string}).kind==='run')
      throw Error('PRIVATE_DRIVER_CONSTRUCTION');
    return freeze(value);
  });
  const result=await probeNativeStatusComposition({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{}},
    {update_set_sys_id:id},{parent_bytes:bytes,response});
  spy.mockRestore();
  expect(result.code).toBe('internal_review_error');expect(result.budget.requests).toBe(0);expect(result.reserved).toBe(0);
  expect(result.native?.upper.primary?.code).toBe('internal_review_error');expect(result.native?.upper.teardown).toBe('not_started');
  expect(result.native?.counts.issued).toBe(0);expect(result.native?.upper.slots.release.http).toBeNull();
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});

it('disposes the same parent bytes once even when inner and outer close both reject',async()=>{
  const freeze=Object.freeze,fill=Uint8Array.prototype.fill,id='a'.repeat(32),response=new Response(null,{status:403});
  const bytes=new TextEncoder().encode(JSON.stringify({result:{sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-11-16',sys_mod_count:'0'}}));
  let fills=0;const owned:Uint8Array[]=[];
  vi.spyOn(Uint8Array.prototype,'fill').mockImplementation(function(this:Uint8Array,value:number,start?:number,end?:number){
    if(this.byteLength===bytes.byteLength&&value===0){fills++;owned.push(this);}return fill.call(this,value,start,end);
  });
  vi.spyOn(Object,'freeze').mockImplementation((value:unknown)=>{
    if(value&&typeof value==='object'&&Object.hasOwn(value,'work')&&(value as {kind?:string}).kind==='run')throw Error('PRIVATE_ORIGIN');
    if(value&&typeof value==='object'&&(value as {kind?:string}).kind==='injected_native_diagnostic_workflow')throw Error('PRIVATE_COPY');
    return freeze(value);
  });
  await expect(probeNativeStatusComposition({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{}},
    {update_set_sys_id:id},{parent_bytes:bytes,response})).rejects.toThrow('internal_review_error');
  vi.restoreAllMocks();expect(fills).toBe(1);expect(owned).toHaveLength(1);expect(owned[0].every(n=>n===0)).toBe(true);
});

it('does not retry failed disposal or overwrite an earlier HTTP failure',async()=>{
  const id='a'.repeat(32),bytes=new TextEncoder().encode(JSON.stringify({result:{sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-11-16',sys_mod_count:'0'}}));
  const fill=Uint8Array.prototype.fill;let fills=0;
  vi.spyOn(Uint8Array.prototype,'fill').mockImplementation(function(this:Uint8Array,value:number,start?:number,end?:number){
    if(this.byteLength===bytes.byteLength&&value===0){fills++;throw Error('PRIVATE_DISPOSE');}return fill.call(this,value,start,end);
  });
  await expect(probeNativeStatusComposition({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{}},
    {update_set_sys_id:id},{parent_bytes:bytes,response:new Response(null,{status:401})})).rejects.toThrow('authentication_failed');
  vi.restoreAllMocks();expect(fills).toBe(1);
  const next=await probeNativeStatusComposition({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{}},
    {update_set_sys_id:id},{parent_bytes:bytes,response:new Response(null,{status:403})});expect(next.ok).toBe(true);
});
