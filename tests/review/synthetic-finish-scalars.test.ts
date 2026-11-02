import {expect,it} from 'vitest';
import {sameFinishRuleSet,sameFinishReleaseEncoding,finishEndOutsideBounds} from '../support/review/synthetic-finish-scalars.js';
import {createSyntheticWorkerTimeIssuer} from '../support/review/synthetic-worker-time.js';

it('compares already validated unique rule sets without requiring order',()=>{
  expect(sameFinishRuleSet(['AU-BR-001','AU-BR-002'],['AU-BR-002','AU-BR-001'])).toBe(true);
  expect(sameFinishRuleSet(['AU-BR-001'],['AU-BR-002'])).toBe(false);
});

it('compares release encodings exactly, without key sorting or normalization',()=>{
  expect(sameFinishReleaseEncoding('{"a":1,"b":2}','{"a":1,"b":2}')).toBe(true);
  expect(sameFinishReleaseEncoding('{"a":1,"b":2}','{"b":2,"a":1}')).toBe(false);
});

it('keeps both finish E boundaries inclusive for validated UTC epochs and effective deadline',()=>{
  expect(finishEndOutsideBounds(1001,1001,1000,7)).toBe(false);
  expect(finishEndOutsideBounds(1007,1001,1000,7)).toBe(false);
  expect(finishEndOutsideBounds(1000,1001,1000,7)).toBe(true);
  expect(finishEndOutsideBounds(1008,1001,1000,7)).toBe(true);
});

const ruleUniverse=['AU-BR-001','AU-BR-002','AU-BR-003'];
const subsets=Array.from({length:8},(_,bits)=>ruleUniverse.filter((_,i)=>bits&(1<<i)));
it.each(subsets.map((a,i)=>({a,i})))('matches the independent rule membership oracle for subset $i',({a})=>{
  for(const b of subsets){
    const expected=ruleUniverse.every(x=>a.includes(x)===b.includes(x));
    expect(sameFinishRuleSet(a,[...b].reverse())).toBe(expected);
  }
});
it('leaves duplicate rejection to the existing strict rule parser, not this predicate',()=>{
  // Deliberately retain legacy behavior outside the validated-unique-list domain.
  expect(sameFinishRuleSet(['AU-BR-001','AU-BR-001'],['AU-BR-001','AU-BR-002'])).toBe(true);
});
it.each([1,7,60000])('matches an independent inclusive E interval oracle at deadline %i',deadline=>{
  const start=1793577600000;
  for(const upper of [start,start+1,start+deadline]){
    for(const end of [start-1,upper-1,upper,upper+1,start+deadline-1,start+deadline,start+deadline+1]){
      expect(finishEndOutsideBounds(end,upper,start,deadline)).toBe(!(end>=upper&&end<=start+deadline));
    }
  }
});
it.each(['','null','{"family":"Australia"}','{"family":"Australia","observed_at":"O"}'])('does not canonicalize release encoding %s',encoding=>{
  expect(sameFinishReleaseEncoding(encoding,encoding)).toBe(true);
  for(let i=0;i<encoding.length;i++)expect(sameFinishReleaseEncoding(encoding,encoding.slice(0,i)+'!'+encoding.slice(i+1))).toBe(false);
  expect(sameFinishReleaseEncoding(encoding,encoding+' ')).toBe(false);
});
it('cannot bypass an unresolved ordinary receipt with otherwise matching scalar values',()=>{
  const s={run:{},session:{},source:{},key:{},origin:{},budget:{},update_set_sys_id:'a'.repeat(32),started_at:'2026-11-02T00:00:00.000Z',deadline_ms:60000,observed_at:'2026-11-02T00:00:01.000Z'};
  const owner=createSyntheticWorkerTimeIssuer(s),binding=owner.bind(s),g=owner.startGeneration(binding,{},{});
  owner.ready(binding,g);owner.input(binding,{},'b'.repeat(32),'2026-11-02T00:00:02.000Z');
  expect(owner.inspect().inputs_retained).toBe(1);
  expect(sameFinishRuleSet([],[])).toBe(true);
  expect(finishEndOutsideBounds(2,1,0,60000)).toBe(false);
  expect(()=>owner.finish(binding,g,2,{})).toThrow('internal_review_error');
  const failed=owner.inspect();
  expect(failed).toMatchObject({candidate_retained:false,diagnostic:{phase:'finish',code:'internal_review_error'},inputs_retained:0});
  expect(()=>owner.finish(binding,g,3,{})).toThrow('internal_review_error');
  expect(owner.inspect().diagnostic).toEqual(failed.diagnostic);
});
it('keeps duplicate rule rejection in the ordinary owner before shared comparison',()=>{
  const start='2026-11-02T00:00:00.000Z',observed='2026-11-02T00:00:01.000Z';
  const s={run:{},session:{},source:{},key:{},origin:{},budget:{},update_set_sys_id:'a'.repeat(32),started_at:start,deadline_ms:60000,observed_at:observed};
  const owner=createSyntheticWorkerTimeIssuer(s),binding=owner.bind(s),g=owner.startGeneration(binding,{},{});owner.ready(binding,g);
  const value={schema_version:'bp-mcp-review-0.2',started_at:start,target:{update_set_sys_id:s.update_set_sys_id,target_version:'update_set_payload',instance_binding:'d'.repeat(64)},limits:{deadline_ms:60000},
    instance_release:{source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:observed,visibility_scope:'caller_acl'},coverage:{requested_rule_ids:['AU-BR-001','AU-BR-001']},limitations:['release_visible_nodes_only'],assets:[]};
  expect(()=>owner.finish(binding,g,2,value)).toThrow('internal_review_error');
  expect(owner.inspect()).toMatchObject({candidate_retained:false,diagnostic:{phase:'finish',code:'internal_review_error'}});
});
