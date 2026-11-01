import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'acorn';
const root=fileURLToPath(new URL('../../',import.meta.url)),moduleNames=['abort-scope-evidence-http-classification','abort-scope-evidence-status-terminal','abort-scope-evidence-status-cleanup','abort-scope-evidence-status-context','abort-scope-evidence-status-bound-workflow','abort-scope-evidence-source-status-acceptance','abort-scope-evidence-source-status-probe','abort-scope-evidence-native-diagnostic','abort-scope-evidence-construction-shell'];
const output=execFileSync('npm',['pack','--dry-run','--ignore-scripts','--offline','--json'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,env:{...process.env,npm_config_cache:join(tmpdir(),'servicenow-mcp-owner-pack-cache')},stdio:['ignore','pipe','pipe']});
const [pack]=JSON.parse(output);
const kernel='dist/servicenow/review-kernel/construction-state';
const sourceKernel='dist/servicenow/review-kernel/source-values';
for(const name of ['release-family','release-comparison']) {
  const path='dist/servicenow/review-kernel/'+name;
  for(const suffix of ['.js','.js.map','.d.ts','.d.ts.map'])assert(pack.files.some(f=>f.path===path+suffix),'required release value contract missing: '+name+suffix);
  const tree=parse(readFileSync(join(root,path+'.js'),'utf8'),{ecmaVersion:'latest',sourceType:'module'}),pending=[tree];
  const allowed=name==='release-family'?[]:['zod','node:util','./release-family.js'];
  while(pending.length){const n=pending.pop();
    if(n.type==='ImportDeclaration')assert(allowed.includes(n.source.value),'release value contract imports a root: '+n.source.value);
    assert(!(n.type==='NewExpression'&&n.callee?.name==='Date'),'release value contract reads wall clock');
    if(n.type==='CallExpression'){
      assert(!['fetch','setTimeout','setInterval'].includes(n.callee?.name),'release value contract performs I/O/timer');
      assert(!(n.callee?.type==='MemberExpression'&&n.callee.object?.name==='Date'&&n.callee.property?.name==='now'),'release value contract reads wall clock');
    }
    assert(n.type!=='ImportExpression'&&n.type!=='ExportAllDeclaration'&&!(n.type==='ExportNamedDeclaration'&&n.source),'release value contract reexports/imports a root');
    assert(!(n.type==='CallExpression'&&n.callee?.name==='require'),'release value contract requires a root');
    for(const v of Object.values(n)){if(Array.isArray(v))pending.push(...v.filter(x=>x&&typeof x.type==='string'));else if(v&&typeof v==='object'&&typeof v.type==='string')pending.push(v);}
  }
}
for(const suffix of ['.js','.js.map','.d.ts','.d.ts.map'])assert(pack.files.some(f=>f.path===sourceKernel+suffix),'required source value kernel missing: '+suffix);
const sourceAst=parse(readFileSync(join(root,sourceKernel+'.js'),'utf8'),{ecmaVersion:'latest',sourceType:'module'}),sourceNodes=[sourceAst];
while(sourceNodes.length){const n=sourceNodes.pop();
  if(n.type==='ImportDeclaration')assert.equal(n.source.value,'zod','source value kernel imports a root or registry');
  assert(n.type!=='ImportExpression'&&n.type!=='ExportAllDeclaration'&&!(n.type==='ExportNamedDeclaration'&&n.source),'source value kernel must not dynamically import or re-export a root');
  assert(!(n.type==='CallExpression'&&n.callee?.name==='require'),'source value kernel must not require a root');
  for(const v of Object.values(n)){if(Array.isArray(v))sourceNodes.push(...v.filter(x=>x&&typeof x.type==='string'));else if(v&&typeof v==='object'&&typeof v.type==='string')sourceNodes.push(v);}}
for(const suffix of ['.js','.js.map','.d.ts','.d.ts.map'])assert(pack.files.some(f=>f.path===kernel+suffix),'required construction kernel missing: '+suffix);
const ast=parse(readFileSync(join(root,kernel+'.js'),'utf8'),{ecmaVersion:'latest',sourceType:'module'}),nodes=[ast];
while(nodes.length){const n=nodes.pop();assert(!['ImportDeclaration','ImportExpression','ExportAllDeclaration'].includes(n.type),'pure kernel must not import roots or dependencies');
  assert(!(n.type==='ExportNamedDeclaration'&&n.source),'pure kernel must not re-export a root');
  assert(!(n.type==='CallExpression'&&n.callee?.name==='require'),'pure kernel must not require a dependency');
  for(const v of Object.values(n)){if(Array.isArray(v))nodes.push(...v.filter(x=>x&&typeof x.type==='string'));else if(v&&typeof v==='object'&&typeof v.type==='string')nodes.push(v);}}
for(const moduleName of moduleNames)for(const suffix of ['.js','.js.map','.d.ts','.d.ts.map'])assert(!pack.files.some(f=>f.path==='dist/review/'+moduleName+suffix));
assert(!pack.files.some(f=>f.path.startsWith('tests/')));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path))){const s=readFileSync(join(root,f.path),'utf8');
  assert(!s.includes('tests/support/review/ef03')&&!s.includes('ef03-development'),'development root leaked into package: '+f.path);}
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path))){const s=readFileSync(join(root,f.path),'utf8');
  assert(!s.includes('createDevelopmentReleaseConditionsRealm')&&!s.includes('ef03/release-conditions')&&!s.includes('release_value_comparison_only')&&!s.includes('armReleaseObservation'),'RC3-D01/D02 private development conditions or adoption leaked into package: '+f.path);}
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path))){const s=readFileSync(join(root,f.path),'utf8');
  assert(!s.includes('pinDevelopmentTranscript')&&!s.includes('bootstrap_transcript_only'),'development transcript leaked into package: '+f.path);
  assert(!s.includes('createDevelopmentResponseDelivery')&&!s.includes('native_cleanup_only')&&!s.includes('consumeSourceCleanupProof'),'development native lane leaked into package: '+f.path);}
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&f.path.endsWith('.js')))for(const moduleName of moduleNames)assert(!readFileSync(join(root,f.path),'utf8').includes(moduleName),'packaged runtime depends on development model: '+f.path);
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-http-classification.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-status-terminal.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-status-cleanup.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-status-context.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-status-workflow.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-status-bound-workflow.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-source-status-acceptance.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-source-status-binding.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-native-status-diagnostic.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-native-diagnostic-workflow.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-native-session-composition.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-construction-shell.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-construction-transaction.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-construction-kernel.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-source-values.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-release-comparison-contract.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
console.log('HTTP classification/status terminal/cleanup/context excluded; runtime unconnected; fixture/oracle excluded PASS ('+pack.files.length+' files)');
