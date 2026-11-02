import {expect,it} from 'vitest';
import {RECOVERY_FULL_JSON_SHAPE,recoveryFullJsonBounds,measureRecoveryFullJson,RecoveryFullJsonError,validateRecoveryAnalysisJson,validateRecoveryAggregateJson} from '../support/review/synthetic-recovery-full-json.js';
import {aggregate} from './fixtures/bp5-results.js';
import {z} from 'zod';
import {assetOutcomeStructure,aggregateReviewJsonSchema,aggregateReviewV3JsonSchema} from '../../src/review/aggregate-schema.js';
import {TARGET_FILTER_VERSION,TARGET_LIMITATIONS} from '../../src/review/target-selection.js';

it('derives full analyze and 0.2/0.3 aggregate depth from all structural schema branches',()=>{
  expect(RECOVERY_FULL_JSON_SHAPE.analyze.depth).toBe(6);
  expect(RECOVERY_FULL_JSON_SHAPE.aggregate_02.depth).toBe(8);
  expect(RECOVERY_FULL_JSON_SHAPE.aggregate_03.depth).toBe(8);
  for(const s of [RECOVERY_FULL_JSON_SHAPE.analyze,RECOVERY_FULL_JSON_SHAPE.aggregate_02,RECOVERY_FULL_JSON_SHAPE.aggregate_03]){
    expect(s.array).toBeLessThanOrEqual(100);expect(s.object_keys).toBeLessThanOrEqual(30);
  }
});
it('rejects duplicate decoded member names before a last-wins parse can hide them',()=>{
  expect(()=>validateRecoveryAnalysisJson('{"state":"reviewed","sta\\u0074e":"rejected"}')).toThrow(RecoveryFullJsonError);
});
it('measures logical UTF-8 bytes from the same primitive string, separately from UTF-16 and decoded character fees',()=>{
  expect(measureRecoveryFullJson('"😀あ"')).toEqual({utf16_units:5,utf8_bytes:9});
  expect(recoveryFullJsonBounds(9)).toMatchObject({max_nodes:9,max_character_units:27,model_id:RECOVERY_FULL_JSON_SHAPE.model_id});
  expect(()=>measureRecoveryFullJson('x'.repeat(262145))).toThrow(RecoveryFullJsonError);
});
it('validates full reviewed bodies and both aggregate/schema refinements, without issuing capture evidence',()=>{
  const run=aggregate(),asset=validateRecoveryAnalysisJson(JSON.stringify(run.assets[0])),full=validateRecoveryAggregateJson(JSON.stringify(run));
  expect(asset.value).toEqual(run.assets[0]);expect(full.value).toEqual(run);expect(Object.isFrozen(full.value.assets[0])).toBe(true);
  expect(full).toMatchObject({authority:'none',checked_scope:'full_schema_value_only'});expect(full.unverified).toContain('original_body');
  expect(full).not.toHaveProperty('capture');expect(full).not.toHaveProperty('json');
});
function fails(raw:unknown,reason:RecoveryFullJsonError['reason'],analyze=false){
  let error:unknown;try{(analyze?validateRecoveryAnalysisJson:validateRecoveryAggregateJson)(raw);}catch(e){error=e;}
  expect(error).toBeInstanceOf(RecoveryFullJsonError);expect(error).toMatchObject({code:'internal_review_error',message:'internal_review_error',reason});expect(error).not.toHaveProperty('cause');expect(error).not.toHaveProperty('issues');
}
function set(raw:unknown,path:string,value:unknown){const parts=path.split('.');let o=raw as Record<string,unknown>;for(const k of parts.slice(0,-1))o=o[k] as Record<string,unknown>;o[parts.at(-1)!]=value;}
function shapeOracle(schema:unknown){
  const queue:[[unknown,number]]|[unknown,number][]=[[schema,0]];let depth=0,array=0,object_keys=0;
  while(queue.length){const [raw,d]=queue.shift()!,s=raw as Record<string,unknown>;
    if(s.oneOf||s.anyOf){for(const x of (s.oneOf??s.anyOf) as unknown[])queue.push([x,d]);continue;}
    depth=Math.max(depth,d);
    if(s.properties){const values=Object.values(s.properties);object_keys=Math.max(object_keys,values.length);for(const x of values)queue.push([x,d+1]);}
    if(s.type==='array'){array=Math.max(array,s.maxItems as number);if((s.maxItems as number)>0)queue.push([s.items,d+1]);}
  }
  return {depth,array,object_keys};
}
it('agrees with an independent breadth-first oracle over every JSON schema variant',()=>{
  const schemas=[z.toJSONSchema(assetOutcomeStructure,{target:'draft-7'}),aggregateReviewJsonSchema,aggregateReviewV3JsonSchema];
  [RECOVERY_FULL_JSON_SHAPE.analyze,RECOVERY_FULL_JSON_SHAPE.aggregate_02,RECOVERY_FULL_JSON_SHAPE.aggregate_03].forEach((profile,i)=>expect(profile).toEqual(shapeOracle(schemas[i])));
  expect(Object.isFrozen(RECOVERY_FULL_JSON_SHAPE)).toBe(true);
});
function valueOracle(root:unknown){
  const queue:[[unknown,number]]|[unknown,number][]=[[root,0]];let nodes=0,character_units=0,maximum_depth=0,max_array_length=0,max_object_keys=0;
  while(queue.length){const [v,d]=queue.shift()!;nodes++;maximum_depth=Math.max(maximum_depth,d);
    if(typeof v==='string')character_units+=v.length*3;
    else if(v&&typeof v==='object'){
      if(Array.isArray(v)){max_array_length=Math.max(max_array_length,v.length);for(const x of v)queue.push([x,d+1]);}
      else{const rows=Object.entries(v);max_object_keys=Math.max(max_object_keys,rows.length);for(const [key,x]of rows){character_units+=key.length*3;queue.push([x,d+1]);}}
    }
  }return {nodes,character_units,maximum_depth,max_array_length,max_object_keys};
}
it('matches an independent decoded tree oracle even when keys and values use escape spellings',()=>{
  const run=aggregate(),json=JSON.stringify(run).replaceAll('"rule_id"','"rule\\u005fid"'),result=validateRecoveryAggregateJson(json);
  expect(result.usage).toMatchObject({...valueOracle(run),utf16_units:json.length,utf8_bytes:new TextEncoder().encode(json).length});expect(result.value).toEqual(run);
  expect(result.usage.lexical_work).toBeLessThanOrEqual(recoveryFullJsonBounds(result.usage.utf8_bytes).max_lexical_work);
});
it.each([0,1,9,262143,262144])('computes conservative finite bounds independently at %i bytes',n=>{
  expect(recoveryFullJsonBounds(n)).toEqual({model_id:'recovery-full-json-shape-v1',max_nodes:n,max_character_units:n+n+n,max_lexical_work:16*n+128});
});
it.each([NaN,Infinity,-1,0.5,'1',null,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1,262145])('rejects invalid/out-of-cap budget %s',n=>{
  expect(()=>recoveryFullJsonBounds(n)).toThrow(RecoveryFullJsonError);
});
it('rejects a model mismatch without increasing any admission limit',()=>{
  expect(()=>recoveryFullJsonBounds(100,'future-model')).toThrow(RecoveryFullJsonError);
});
it.each([-1,0,1])('checks original logical wire B%+i independently from reserialization',delta=>{
  const json=JSON.stringify(aggregate()),pad=262144-new TextEncoder().encode(json).length+delta,wire=json+' '.repeat(pad);
  if(delta<=0)expect(validateRecoveryAggregateJson(wire).usage.utf8_bytes).toBe(262144+delta);else fails(wire,'limit');
});
it('rejects multi-byte overflow while UTF-16 length remains under B',()=>{
  const json='"'+'あ'.repeat(90000)+'"';expect(json.length).toBeLessThan(262144);fails(json,'limit');
});
it.each(['',' ','[1,]','{"a":1,}','{"a":}','{"a" 1}','{"a":true}null','{"a":undefined}','NaN','+1','01','1.','1e','[','{"a":"\\x41"}','{"a":"\\u0xx0"}','{"a":"unclosed}','{"a":"line\nfeed"}'])('rejects invalid JSON syntax %j',json=>fails(json,'syntax'));
it.each(['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{"a":{"x":1,"x":2}}','{"__proto__":1,"__proto__":2}'])('rejects duplicate decoded keys %s',json=>fails(json,'syntax'));
it('uses a safe object destination and does not pollute prototypes through unknown keys',()=>{
  fails('{"__proto__":{"polluted":true}}','schema');expect(({} as Record<string,unknown>).polluted).toBeUndefined();
});
it.each(['not a string',null,1,{},new String('{}')])('rejects malformed full schema or nonprimitive input %s',raw=>fails(raw,typeof raw==='string'?'syntax':'shape'));
it('never invokes object accessors/proxy traps or emits raw text in failures',()=>{
  let touched=0;const poison=Object.defineProperty({},'json',{get(){touched++;throw Error('SECRET');}});fails(poison,'shape');
  fails(new Proxy({},{get(){touched++;throw Error('SECRET');}}),'shape');expect(touched).toBe(0);
  let error:unknown;try{validateRecoveryAggregateJson('{"SECRET":"RAW"}');}catch(e){error=e;}expect(String(error)).toBe('Error: internal_review_error');expect(JSON.stringify(error)).not.toContain('SECRET');
});
it('rejects raw surrogate replacement but preserves an escaped surrogate as the exact string value',()=>{
  fails('{"a":"\ud800"}','syntax');const run=aggregate();run.assets[0].result.findings[0].issue='\ud800';
  expect(validateRecoveryAggregateJson(JSON.stringify(run)).value.assets[0]).toEqual(run.assets[0]);
});
it.each([['1e0',1],['1.0',1],['10e-1',1],['1e+000000000',1],['0.001e3',1],['9007199254740991',9007199254740991]])('decodes exact safe integer literal %s', (literal,n)=>{
  const raw=aggregate();raw.assets[0].result.findings[0].line_end=9007199254740991;
  const json=JSON.stringify(raw).replace(/"line_start":\d+/,`"line_start":${literal}`),p=validateRecoveryAggregateJson(json);
  expect(p.value.assets[0].state).toBe('reviewed');if(p.value.assets[0].state==='reviewed')expect(p.value.assets[0].result.findings[0].line_start).toBe(n);
});
it.each(['9007199254740992','9007199254740990.1','1.0000000000000000000001','1e-400','1e400','0.5'])('rejects unsafe, fractional or rounded number %s',literal=>{
  const json=JSON.stringify(aggregate()).replace(/"line_start":\d+/,`"line_start":${literal}`);fails(json,'shape');
});
it('preserves negative zero as data rather than silently normalizing the decoded number',()=>{
  const run=aggregate();const json=JSON.stringify(run).replace('"not_applicable":0','"not_applicable":-0');expect(Object.is(validateRecoveryAggregateJson(json).value.counts.not_applicable,-0)).toBe(true);
});
it.each(['analyze','aggregate'] as const)('enforces depth, array and key bounds for %s before schema validation',kind=>{
  const analyze=kind==='analyze',profile=analyze?RECOVERY_FULL_JSON_SHAPE.analyze:RECOVERY_FULL_JSON_SHAPE.aggregate_03;
  for(const extra of [0,1]){
    const depth=profile.depth+extra,json='{"x":'.repeat(depth)+'null'+'}'.repeat(depth);fails(json,extra?'limit':'schema',analyze);
    fails(JSON.stringify({x:Array(100+extra).fill(null)}),extra?'limit':'schema',analyze);
    fails(JSON.stringify(Object.fromEntries(Array.from({length:profile.object_keys+extra},(_,n)=>['x'+n,null]))),extra?'limit':'schema',analyze);
  }
});
it.each([
  ['counts.findings',0],['collection.selected',0],['coverage.analysis_complete',true],['versions.ruleset','bp3-0.5'],['status','completed'],
  ['assets.0.result.target.update_set_id','f'.repeat(32)],['assets.0.result.findings.0.severity','high'],['assets.0.result.findings.0.verification_status','runtime_confirmed'],
  ['assets.0.result.findings.0.sources.0.url','https://example.invalid/changed'],['assets.0.result.coverage.evaluated_rule_ids',[]],['assets.0.result.instance_release.expires_at','2026-10-17T04:59:30Z'],
])('executes full refinements for independent %s mutation',(path,value)=>{
  const run=aggregate();if(path==='coverage.analysis_complete')run.consistency='changed';set(run,path,value);fails(JSON.stringify(run),'schema');
});
it('runs nested analyze refinements, not merely the asset structural parse',()=>{
  const asset=aggregate().assets[0];asset.result.findings[0].sources[0].url='https://example.invalid/changed';fails(JSON.stringify(asset),'schema',true);
});
it('supports 0.3 while retaining mandatory inventory limitations',()=>{
  const r=aggregate();r.schema_version='bp-mcp-review-0.3';r.limitations.push(...TARGET_LIMITATIONS);set(r,'selection',{mode:'review_targets',filter_version:TARGET_FILTER_VERSION,requested_asset_types:['business_rule'],action_scope:'insert_or_update_only',order:'sys_id_asc',excluded_counts:{unsupported_assets:null,deleted_assets:null,other_actions:null}});
  set(r,'coverage.analysis_scope','selected_candidate_window');set(r,'coverage.candidate_inventory_complete',false);set(r,'coverage.update_set_inventory_complete',false);
  expect(validateRecoveryAggregateJson(JSON.stringify(r)).value.schema_version).toBe('bp-mcp-review-0.3');r.limitations.pop();fails(JSON.stringify(r),'schema');
});
it('allows full-schema strings beyond the old local character budget without truncating them',()=>{
  const r=aggregate();r.assets[0].result.limitations=[...r.assets[0].result.limitations,...Array.from({length:90},(_,n)=>String(n).padEnd(2000,'x'))];
  const p=validateRecoveryAggregateJson(JSON.stringify(r));expect(p.usage.character_units).toBeGreaterThan(262144);expect(p.value).toEqual(r);
});
it.each([
  {state:'not_applicable',asset_type:'other',reason:'asset_type_unsupported'}, {state:'skipped_deleted',reason:'deleted_asset'},
  {state:'rejected',reason:'invalid_xml'}, {state:'retrieval_failed',reason:'payload_unavailable'}, {state:'not_processed',reason:'deadline_exceeded'}, {state:'result_omitted',reason:'response_limit'},
])('retains a full non-reviewed $state variant without creating a reviewed capture',row=>{
  const asset={...row,update_xml_sys_id:'a'.repeat(32)},p=validateRecoveryAnalysisJson(JSON.stringify(asset));expect(p.value).toEqual(asset);expect(p.unverified).toContain('original_body');
});
it('accepts a full-schema window over 10000 decoded nodes when its original wire still fits',()=>{
  const r=aggregate(),first=r.assets[0];
  first.result.limitations=[...first.result.limitations,...Array.from({length:20},(_,n)=>'s'+n)];
  for(const f of first.result.findings){for(const k of ['issue','impact','applicability','recommendation'])f[k]='x';f.sources[0].summary='s';}
  r.assets=Array.from({length:100},(_,n)=>{const a=structuredClone(first),id=n.toString(16).padStart(32,'0');a.update_xml_sys_id=a.result.target.update_xml_sys_id=id;return a;});
  r.collection.metadata_seen=r.collection.selected=100;r.limits.max_records=100;r.counts.reviewed=r.counts.findings=100;
  const json=JSON.stringify(r);expect(new TextEncoder().encode(json).length).toBeLessThanOrEqual(262144);
  const p=validateRecoveryAggregateJson(json);expect(p.usage.nodes).toBeGreaterThan(10000);expect(p.usage).toMatchObject(valueOracle(r));
});
it('round-trips a deterministic corpus of JSON.stringify output with controls, Unicode and member order changes',()=>{
  const alphabet=['a','あ','😀','\\','"','\t','\n','\u0000','\ud800'];
  for(let n=0;n<45;n++){
    const r=aggregate();r.assets[0].result.findings[0].issue=Array.from({length:n+1},(_,i)=>alphabet[(n*7+i*3)%alphabet.length]).join('');
    const json=JSON.stringify(r),reordered=JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(json)).reverse()));
    for(const wire of [json,reordered]){const p=validateRecoveryAggregateJson(wire);expect(p.value).toEqual(r);expect(p.usage).toMatchObject(valueOracle(r));}
  }
});
it('exposes only pure values/calculators, with no capture, origin registration, job or candidate entry',async()=>{
  const api=await import('../support/review/synthetic-recovery-full-json.js');
  expect(Object.keys(api).sort()).toEqual(['RECOVERY_FULL_JSON_SHAPE','RecoveryFullJsonError','measureRecoveryFullJson','recoveryFullJsonBounds','validateRecoveryAnalysisJson','validateRecoveryAggregateJson'].sort());
  const a=validateRecoveryAnalysisJson(JSON.stringify(aggregate().assets[0])),b=validateRecoveryAggregateJson(JSON.stringify(aggregate()));
  type A=typeof a;type B=typeof b;type R=ReturnType<typeof import('../support/review/synthetic-pinned-recovery-root.js')['createSyntheticPinnedRecoveryRoot']>;type C=ReturnType<R['sealRecoveryFinishExpectation']>;
  const check:A extends C?true:false=false,other:B extends C?true:false=false;expect([check,other]).toEqual([false,false]);
  for(const p of [a,b])expect(p.unverified).toEqual(['delivery_origin','original_body','context_binding','runtime_transport']);
});
