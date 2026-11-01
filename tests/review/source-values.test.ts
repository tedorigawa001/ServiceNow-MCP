import {expect,it} from 'vitest';
import {parseSourceParent,projectSourceReleaseRows} from '../../src/servicenow/review-kernel/source-values.js';

const target='a'.repeat(32);
const parent={sys_id:target,state:'complete',application:'global',sys_updated_on:'2026-11-01',sys_mod_count:'2'};
it('validates exactly the five parent columns without retaining caller storage',()=>{
  const value=parseSourceParent({result:parent},target);
  expect(value).toEqual(parent);expect(value).not.toBe(parent);
});
it.each([null,{}, {result:{...parent,sys_id:'b'.repeat(32)}},{result:{...parent,script:'PRIVATE'}},
  {result:{...parent,sys_mod_count:'-1'}},{result:{...parent,sys_updated_on:''}}])('rejects invalid or foreign parent values %#',value=>{
  expect(()=>parseSourceParent(value,target)).toThrow('invalid_response');
});
it('projects only build_name and preserves missing/null behavior without retaining node data',()=>{
  expect(projectSourceReleaseRows([{build_name:'Australia',address:'PRIVATE'}, {},{build_name:null}]))
    .toEqual([{build_name:'Australia'},{build_name:null},{build_name:null}]);
});
it.each([null,[],{build_name:1},{build_name:'x'.repeat(41)}])('rejects invalid release row %#',row=>{
  expect(()=>projectSourceReleaseRows([row])).toThrow('invalid_response');
});
