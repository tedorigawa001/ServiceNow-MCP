import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {cases,checkCase} from './native-diagnostic-pure-oracle.mjs';

// Fixed dist-only inputs: no TS, loader, source or neighboring test-build fallback.
const stateURL=new URL('../../../dist/review/abort-scope-evidence-native-diagnostic-state.js',import.meta.url);
const fixtureURL=new URL('../../../dist/review/abort-scope-evidence-native-diagnostic-pure-fixture.js',import.meta.url);
function audit(text,allowed){
  const ast=parse(text,{ecmaVersion:'latest',sourceType:'module'}),nodes=[[ast,null,null]];
  const denied=new Set(['globalThis','global','self','process','require','Date','performance','fetch','Response','ReadableStream','Worker','AbortController','setTimeout','setInterval','setImmediate','queueMicrotask','eval','Function']);
  while(nodes.length){
    const [n,parent,key]=nodes.pop();
    if(n.type==='ImportDeclaration')assert(allowed.includes(n.source.value),'unexpected dependency');
    assert(n.type!=='ImportExpression'&&n.type!=='ExportAllDeclaration'&&!(n.type==='ExportNamedDeclaration'&&n.source),'indirect dependency');
    const property=parent?.type==='MemberExpression'&&key==='property'&&!parent.computed||parent?.type==='Property'&&key==='key'&&!parent.computed;
    if(n.type==='Identifier'&&!property)assert(!denied.has(n.name),'forbidden capability');
    for(const [k,v] of Object.entries(n)){
      if(Array.isArray(v))nodes.push(...v.filter(x=>x&&typeof x.type==='string').map(x=>[x,n,k]));
      else if(v&&typeof v==='object'&&typeof v.type==='string')nodes.push([v,n,k]);
    }
  }
}
const stateText=readFileSync(stateURL,'utf8'),fixtureText=readFileSync(fixtureURL,'utf8');
const allowed=['node:util','./abort-scope-evidence-native-diagnostic-state.js'];
audit(stateText,[]);audit(fixtureText,allowed);
for(const leak of ["import '../servicenow/bounded-read.js';","export * from '../servicenow/bounded-read.js';","import('node:fs');",'globalThis.fetch("x");','Date.now();','new Response();','setTimeout(()=>{},0);'])
  assert.throws(()=>audit(fixtureText+'\n'+leak,allowed),assert.AssertionError);

let calls=0;
const forbidden=()=>{calls++;throw Error('PRIVATE_SIDE_EFFECT');};
const saved=[];
function block(target,key){saved.push([target,key,Object.getOwnPropertyDescriptor(target,key)]);Object.defineProperty(target,key,{value:forbidden,configurable:true,writable:true});}
try{
  for(const key of ['Response','ReadableStream','AbortController','fetch','Worker'])block(globalThis,key);
  block(Date,'now');block(Date.prototype,'toISOString');block(performance,'now');
  const fixture=await import(fixtureURL.href),state=await import(stateURL.href);
  assert.deepEqual(Object.keys(fixture),['runSyntheticNativeDiagnosticFixture']);
  assert.deepEqual(Object.keys(state),['createNativeDiagnosticState','permissions']);
  assert.equal(cases.length,43);assert.equal(new Set(cases.map(x=>x.scenario)).size,43);
  for(const row of cases)checkCase(fixture.runSyntheticNativeDiagnosticFixture,row);
  let hooks=0;const revoked=Proxy.revocable({},{});revoked.revoke();
  for(const raw of [null,[],{}, {scenario:'unknown'}, {scenario:'unobserved',owner:{}},
    {get scenario(){hooks++;throw Error('PRIVATE_GETTER');}},new Proxy({},{ownKeys(){hooks++;throw Error('PRIVATE_PROXY');}}),revoked.proxy])
    assert.equal(fixture.runSyntheticNativeDiagnosticFixture(raw).ok,false);
  assert.equal(hooks,0);
  const a=state.createNativeDiagnosticState(),b=state.createNativeDiagnosticState();
  assert.notEqual(a.binding,b.binding);assert.notEqual(a.binding.session,b.binding.session);
  assert.equal(a.owner.bind(b.binding),'rejected');assert.equal(a.owner.bind(a.binding),'rejected');
  a.owner.seal();const copy=a.owner.snapshot();
  assert.equal(copy.refusal.code,'evidence_binding_mismatch');assert.equal(a.owner.stop('cancelled','stop'),'late_ignored');
  assert.equal(a.owner.snapshot(),copy);assert.equal(b.owner.bind(b.binding),'bound');b.owner.seal();
  assert.equal(b.owner.snapshot().refusal,null);assert.equal(calls,0);
}finally{
  for(const [target,key,descriptor] of saved.reverse()){
    if(descriptor)Object.defineProperty(target,key,descriptor);else delete target[key];
  }
}
console.log('BG01 compiled pure diagnostic: 43 independent cases, strict inputs, fresh ownership, capability/import negative controls PASS');
