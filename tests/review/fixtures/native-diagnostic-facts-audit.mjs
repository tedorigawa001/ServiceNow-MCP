import assert from 'node:assert/strict';
import {parse} from 'acorn';

export function auditFactsJS(text){
  const ast=parse(text,{ecmaVersion:'latest',sourceType:'module'}),nodes=[[ast,null,null]];
  const denied=new Set(['globalThis','global','self','process','require','Date','performance','Promise','fetch','Response','ReadableStream','Worker','AbortController','WeakMap','WeakSet','Map','Set','setTimeout','setInterval','setImmediate','queueMicrotask','eval','Function']);
  while(nodes.length){
    const [n,parent,key]=nodes.pop();
    assert(!['ImportDeclaration','ImportExpression','ExportAllDeclaration'].includes(n.type)&&!(n.type==='ExportNamedDeclaration'&&n.source),'facts runtime dependency');
    const property=parent?.type==='MemberExpression'&&key==='property'&&!parent.computed||parent?.type==='Property'&&key==='key'&&!parent.computed;
    if(n.type==='Identifier'&&!property)assert(!denied.has(n.name),'facts capability');
    for(const [k,v] of Object.entries(n)){
      if(Array.isArray(v))nodes.push(...v.filter(x=>x&&typeof x.type==='string').map(x=>[x,n,k]));
      else if(v&&typeof v==='object'&&typeof v.type==='string')nodes.push([v,n,k]);
    }
  }
}
export function verifyFactsAuditNegatives(text){
  const leaks=["import '../servicenow/bounded-read.js';","export * from '../servicenow/bounded-read.js';","import('node:fs');",'globalThis.fetch("x");','Date.now();','new Response();','new WeakMap();','Promise.resolve();','setTimeout(()=>{},0);'];
  for(const leak of leaks)assert.throws(()=>auditFactsJS(text+'\n'+leak),assert.AssertionError);
  return leaks.length;
}
