import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyNativeFacts,verifyOracleNegatives} from './native-diagnostic-facts-oracle.mjs';
import {auditFactsJS,verifyFactsAuditNegatives} from './native-diagnostic-facts-audit.mjs';

const url=new URL('../../../dist/review/abort-scope-evidence-native-diagnostic-facts.js',import.meta.url);
const text=readFileSync(url,'utf8');auditFactsJS(text);assert.equal(verifyFactsAuditNegatives(text),9);
const saved=[],forbidden=()=>{throw Error('PRIVATE_CAPABILITY');};
function block(target,key){saved.push([target,key,Object.getOwnPropertyDescriptor(target,key)]);Object.defineProperty(target,key,{value:forbidden,configurable:true,writable:true});}
try{
  for(const key of ['Response','ReadableStream','fetch','Worker'])block(globalThis,key);
  block(Date,'now');block(performance,'now');
  const k=await import(url.href);assert.deepEqual(Object.keys(k),['nativeCleanupFactsEligible','nativeCleanupReason']);
  assert.deepEqual(verifyNativeFacts(k.nativeCleanupReason,k.nativeCleanupFactsEligible),{reasonCases:5760,eligibilityCases:752});
  assert.deepEqual(verifyOracleNegatives(k.nativeCleanupReason,k.nativeCleanupFactsEligible),{rejected:7,equivalent:1});
  // Actual emitted-JS mutation: fixed dist text only, with a drift check before using a fresh ESM URL.
  const anchor="'reader_owner_unknown'";assert.equal(text.split(anchor).length-1,1);
  const mutant=await import('data:text/javascript;base64,'+Buffer.from(text.replace(anchor,"'cancel_pending'")).toString('base64'));
  assert.throws(()=>verifyNativeFacts(mutant.nativeCleanupReason,mutant.nativeCleanupFactsEligible),assert.AssertionError);
}finally{
  for(const [target,key,descriptor] of saved.reverse()){if(descriptor)Object.defineProperty(target,key,descriptor);else delete target[key];}
}
console.log('VK01/02 compiled values: 5760 reasons + 752 eligibility cases; 7 rejected/1 equivalent oracle controls; emitted-JS and 9 dependency negatives PASS');
