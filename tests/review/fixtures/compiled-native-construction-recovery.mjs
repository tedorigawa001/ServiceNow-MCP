import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeDiagnosticState,permissions} from '../../../dist/review/abort-scope-evidence-native-diagnostic-state.js';
import {BoundedReadError} from '../../../dist/servicenow/bounded-read.js';
import {createInjectedNativeDiagnosticWorkflow,probeNativeStatusComposition} from '../../../dist/review/abort-scope-evidence-native-diagnostic.js';
import {verifyRecovery,verifyRecoveryMutants} from './native-construction-recovery-model.mjs';
const js=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.js',import.meta.url),'utf8');
assert.deepEqual(await verifyRecovery(js,createNativeDiagnosticState,BoundedReadError,permissions),{scenarios:24,bootstrap:5,partial:6,read:0,schedule:0,activeJoins:0,dispatches:0});
assert.equal(await verifyRecoveryMutants(js,createNativeDiagnosticState,BoundedReadError,permissions),6);
const freeze=Object.freeze;let origins=0;
Object.freeze=value=>{
  if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===null&&Reflect.ownKeys(value).length===0&&++origins===9)throw Error('PRIVATE_COMPILED_FAULT');
  return freeze(value);
};
let owner;
try{owner=createInjectedNativeDiagnosticWorkflow({fake_io:true,deadline_ms:60000,budget:{read(){throw Error('NO_BUDGET');}},schedule(){throw Error('NO_SCHEDULE');}});}
finally{Object.freeze=freeze;}
const copy=owner.diagnostics();assert.equal(copy.upper.primary.code,'internal_review_error');assert.equal(await owner.close(),copy);assert.equal(await owner.execute(),copy);
const id='a'.repeat(32),bytes=new TextEncoder().encode(JSON.stringify({result:{sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-11-16',sys_mod_count:'0'}}));
const response=new Response(null,{status:403});
Object.freeze=value=>{
  if(value&&typeof value==='object'&&Object.hasOwn(value,'root')&&Object.hasOwn(value,'work')&&value.kind==='run')throw Error('PRIVATE_COMPILED_DRIVER');
  return freeze(value);
};
try{
  const result=await probeNativeStatusComposition({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{}},{update_set_sys_id:id},{parent_bytes:bytes,response});
  assert.equal(result.code,'internal_review_error');assert.equal(result.budget.requests,0);assert.equal(result.reserved,0);
  assert.equal(result.native.upper.primary.code,'internal_review_error');assert.equal(result.native.upper.teardown,'not_started');assert(!JSON.stringify(result).includes('PRIVATE'));
}finally{Object.freeze=freeze;}
const declarations=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.d.ts',import.meta.url),'utf8');
for(const privateName of ['RecoveryAnchor','allocateNativeDiagnosticConstruction','initializeLegacyWorkflow','failConstruction'])assert(!declarations.includes(privateName));
console.log('CP00-05 compiled: 24 construction/strict cases, notification/final-owner controls, 6 valid mutants, actual constructor and real-class fake begin failure; joins disconnected PASS');
