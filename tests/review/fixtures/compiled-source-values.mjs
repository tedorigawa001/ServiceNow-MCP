import assert from 'node:assert/strict';
import {parseSourceParent,projectSourceReleaseRows,SourceValueError} from '../../../dist/servicenow/review-kernel/source-values.js';
const target='a'.repeat(32),parent={sys_id:target,state:'complete',application:'global',sys_updated_on:'2026-11-01',sys_mod_count:'1'};
const copy=parseSourceParent({result:parent},target);
assert.deepEqual(copy,parent);assert.notEqual(copy,parent);
for(const result of [{...parent,sys_id:'b'.repeat(32)},{...parent,script:'PRIVATE'},{}]){
  assert.throws(()=>parseSourceParent({result},target),SourceValueError);
}
assert.deepEqual(projectSourceReleaseRows([{build_name:'Australia',address:'PRIVATE'},{}]),[{build_name:'Australia'},{build_name:null}]);
assert.throws(()=>projectSourceReleaseRows([{build_name:42}]),SourceValueError);
console.log('Compiled shared source value checks PASS (not a session/source identity proof)');
