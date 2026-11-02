import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'acorn';
import ts from 'typescript';
const root=fileURLToPath(new URL('../../',import.meta.url)),moduleNames=['abort-scope-evidence-http-classification','abort-scope-evidence-status-terminal','abort-scope-evidence-status-cleanup','abort-scope-evidence-status-context','abort-scope-evidence-status-bound-workflow','abort-scope-evidence-source-status-acceptance','abort-scope-evidence-source-status-probe','abort-scope-evidence-native-diagnostic','abort-scope-evidence-construction-shell'];
const output=execFileSync('npm',['pack','--dry-run','--ignore-scripts','--offline','--json'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,env:{...process.env,npm_config_cache:join(tmpdir(),'servicenow-mcp-owner-pack-cache')},stdio:['ignore','pipe','pipe']});
const [pack]=JSON.parse(output);
// WJ-A remains a separate synthetic issuer, not a distributed registration/claim entry point.
const noSyntheticJobIssuer=text=>assert(!['createSyntheticWorkerJobIssuer','synthetic-worker-job','createSyntheticWorkerTimeIssuer','synthetic-worker-time','synthetic_finish_terminal','createSyntheticSoftRecoveryIssuer','synthetic-soft-recovery','synthetic-worker-closure','synthetic_worker_closure_consumption','beginWorkerClosure','settleWorkerClosure','confirmWorkerUnstarted','consumeWorkerClosure'].some(x=>text.includes(x)),'synthetic issuer leaked into runtime');
assert.throws(()=>noSyntheticJobIssuer('export function createSyntheticWorkerJobIssuer() {}'));
assert.throws(()=>noSyntheticJobIssuer('export function createSyntheticWorkerTimeIssuer() {}'));
assert.throws(()=>noSyntheticJobIssuer('export const scope="synthetic_finish_terminal";'));
assert.throws(()=>noSyntheticJobIssuer('export function createSyntheticSoftRecoveryIssuer() {}'));
for(const marker of ['synthetic-worker-closure','synthetic_worker_closure_consumption','beginWorkerClosure','settleWorkerClosure','confirmWorkerUnstarted','consumeWorkerClosure'])assert.throws(()=>noSyntheticJobIssuer(marker));
assert(!pack.files.some(f=>/synthetic-worker-(?:job|time|finish|closure|recovery)|synthetic-soft-recovery/.test(f.path)));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noSyntheticJobIssuer(readFileSync(join(root,f.path),'utf8'));
// Names are denied as references, not as object keys or member property names; the same audit must reject seeded leaks.
const syntheticDenied=new Set(['globalThis','global','window','self','process','performance','fetch','setTimeout','setInterval','setImmediate','queueMicrotask','require','Worker','SharedArrayBuffer','Atomics','XMLHttpRequest','WebSocket','eval','Function']);
const auditSyntheticIssuer=(text,allowed=['node:util','zod'])=>{
  const nodes=[[parse(ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{ecmaVersion:'latest',sourceType:'module'}),null,null]];
  while(nodes.length){const [n,parent,field]=nodes.pop();
    if(n.type==='ImportDeclaration')assert(allowed.includes(n.source.value),'synthetic job issuer imports runtime or I/O');
    assert(n.type!=='ImportExpression'&&n.type!=='ExportAllDeclaration'&&!(n.type==='ExportNamedDeclaration'&&n.source),'synthetic job issuer dynamically imports/reexports a root');
    const name=n.type==='Identifier'&&!(parent?.type==='MemberExpression'&&field==='property'&&!parent.computed)&&!(parent?.type==='Property'&&field==='key'&&!parent.computed)?n.name:undefined;
    assert(!syntheticDenied.has(name),'synthetic job issuer references an I/O/timer/clock/worker global: '+name);
    assert(!(n.type==='MemberExpression'&&n.object?.type==='Identifier'&&n.object.name==='Date'&&(n.computed||n.property?.name==='now')),'synthetic job issuer reads a clock');
    assert(!((n.type==='NewExpression'||n.type==='CallExpression')&&n.callee?.type==='Identifier'&&n.callee.name==='Date'),'synthetic job issuer starts a clock');
    for(const [k,v] of Object.entries(n)){if(Array.isArray(v))nodes.push(...v.filter(x=>x&&typeof x.type==='string').map(x=>[x,n,k]));else if(v&&typeof v==='object'&&typeof v.type==='string')nodes.push([v,n,k]);}
  }
};
const syntheticText=readFileSync(join(root,'tests/support/review/synthetic-worker-job.ts'),'utf8');
auditSyntheticIssuer(syntheticText);
for(const leak of ['globalThis.setTimeout(()=>{},0);','queueMicrotask(()=>{});','const zzNow=Date.now;','performance.now.call(performance);',"Date['now']();",'new Date();','new Worker(\'x\');',"import('node:fs');","export * from 'node:fs';","import {readFileSync as zzRead} from 'node:fs';zzRead('x');"])
  assert.throws(()=>auditSyntheticIssuer(syntheticText+'\n'+leak),assert.AssertionError,'synthetic issuer audit missed seeded leak: '+leak);
console.log('WJ-A synthetic issuer excluded; leak and dependency-audit negative controls + no runtime/I/O/worker/clock references PASS');
const timeText=readFileSync(join(root,'tests/support/review/synthetic-worker-time.ts'),'utf8'),timeImports=['node:util','zod','./synthetic-worker-job.js','../../../src/review/result-schema-v2.js','../../../src/review/aggregate-schema.js'];
auditSyntheticIssuer(timeText,timeImports);
for(const leak of ['globalThis.setTimeout(()=>{},0);','queueMicrotask(()=>{});','const zzNow=Date.now;','performance.now.call(performance);',"Date['now']();",'new Date();',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(timeText+'\n'+leak,timeImports),assert.AssertionError,'WJ-B audit missed seeded leak: '+leak);
console.log('WJ-B/C time/finish owner excluded; fixed pure-data imports, no runtime/I/O/clock references + negative controls PASS');
const recoveryText=readFileSync(join(root,'tests/support/review/synthetic-soft-recovery.ts'),'utf8'),recoveryImports=['node:util','zod','./synthetic-phase-recovery.js','./synthetic-worker-recovery-input.js','./synthetic-worker-recovery-verify.js'];
auditSyntheticIssuer(recoveryText,recoveryImports);
for(const leak of ['globalThis.setTimeout(()=>{},0);','queueMicrotask(()=>{});','const zzNow=Date.now;','performance.now.call(performance);',"Date['now']();",'new Date();','new Worker(\'x\');',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(recoveryText+'\n'+leak,recoveryImports),assert.AssertionError,'SR-A audit missed seeded leak: '+leak);
console.log('SR-A/C1 separate synthetic issuer/closure contracts excluded; no runtime/I/O/clock/worker imports or references + negative controls PASS');
const phaseText=readFileSync(join(root,'tests/support/review/synthetic-phase-recovery.ts'),'utf8'),phaseImports=['node:util','zod','../../../src/review/aggregate-schema.js'];
auditSyntheticIssuer(phaseText,phaseImports);
const noPhaseIssuer=text=>assert(!['createSyntheticPhaseModel','synthetic-phase-recovery','synthetic_phase_recovery_plan'].some(x=>text.includes(x)),'synthetic phase model leaked into runtime');
for(const marker of ['createSyntheticPhaseModel','synthetic-phase-recovery','synthetic_phase_recovery_plan'])assert.throws(()=>noPhaseIssuer(marker));
assert(!pack.files.some(f=>f.path.includes('synthetic-phase-recovery')));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noPhaseIssuer(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['globalThis.setTimeout(()=>{},0);','queueMicrotask(()=>{});','const zzNow=Date.now;',"Date['now']();",'new Date();',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(phaseText+'\n'+leak,phaseImports),assert.AssertionError,'SR-B audit missed seeded leak: '+leak);
console.log('SR-B phase model excluded; pure-data dependencies and seeded runtime/I/O/clock leak controls PASS');
const preparationText=readFileSync(join(root,'tests/support/review/synthetic-worker-recovery-input.ts'),'utf8'),preparationImports=['node:util','zod','../../../src/review/aggregate-schema.js'];
auditSyntheticIssuer(preparationText,preparationImports);
const noWorkerPreparation=text=>assert(!['prepareSyntheticWorkerRecoveryInputs','synthetic-worker-recovery-input','synthetic_worker_recovery_preparation','prepareWorkerRecovery','discardWorkerRecoveryPreparation'].some(x=>text.includes(x)),'SC2-A preparation leaked into runtime');
for(const marker of ['prepareSyntheticWorkerRecoveryInputs','synthetic-worker-recovery-input','synthetic_worker_recovery_preparation','prepareWorkerRecovery','discardWorkerRecoveryPreparation'])assert.throws(()=>noWorkerPreparation(marker));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noWorkerPreparation(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['globalThis.setTimeout(()=>{},0);','queueMicrotask(()=>{});','const zzNow=Date.now;',"Date['now']();",'new Date();',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(preparationText+'\n'+leak,preparationImports),assert.AssertionError,'SC2-A audit missed seeded leak: '+leak);
console.log('SC2-A preparation excluded; pure-data imports, no I/O/clock/runtime references + seeded negative controls PASS');
const verifyText=readFileSync(join(root,'tests/support/review/synthetic-worker-recovery-verify.ts'),'utf8');
auditSyntheticIssuer(verifyText,['node:util']);
const verifyMarkers=['createSyntheticWorkerVerify','synthetic-worker-recovery-verify','beginWorkerVerify','workerVerifyAttempt','workerVerifyChunk','workerVerifyOutcome','workerVerifyRetry'];
const noWorkerVerify=text=>assert(!verifyMarkers.some(x=>text.includes(x)),'SC2-B verify leaked into runtime');
for(const marker of verifyMarkers)assert.throws(()=>noWorkerVerify(marker));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noWorkerVerify(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['globalThis.setTimeout(()=>{},0);','queueMicrotask(()=>{});','Date.now();',"Date['now']();",'new Date();',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(verifyText+'\n'+leak,['node:util']),assert.AssertionError,'SC2-B audit missed seeded leak: '+leak);
console.log('SC2-B verify excluded; no runtime/I/O/clock/worker references + seeded negative controls PASS');
const generationMarkers=['claimWorkerGeneration','startWorkerGeneration','issueWorkerGenerationReady','acceptWorkerGenerationReady','failWorkerGeneration','recordWorkerGenerationCleanup','discardWorkerGeneration','synthetic_generation_start','synthetic_generation_cleanup','synthetic_generation_lease','synthetic_generation_event','synthetic_generation_ready'];
const noWorkerGeneration=text=>assert(!generationMarkers.some(x=>text.includes(x)),'SC2-C generation leaked into runtime');
for(const marker of generationMarkers)assert.throws(()=>noWorkerGeneration(marker));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noWorkerGeneration(readFileSync(join(root,f.path),'utf8'));
console.log('SC2-C generation claims/ready/cleanup excluded; seeded symbol/function leak controls PASS');
const planMarkers=['sealWorkerRecoveryPlan','summarizeWorkerRecoveryPlan','transferWorkerRecoveryPlan','discardTransferredWorkerRecoveryPlan','synthetic_worker_recovery_plan_handle','synthetic_worker_recovery_plan_handoff','synthetic_worker_recovery_plan'];
const noWorkerPlan=text=>assert(!planMarkers.some(x=>text.includes(x)),'SC2-D plan leaked into runtime');
for(const marker of planMarkers)assert.throws(()=>noWorkerPlan(marker));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noWorkerPlan(readFileSync(join(root,f.path),'utf8'));
console.log('SC2-D sealed plan/summary/handoff excluded; seeded symbol/function/scope leak controls PASS');
const finishValuePath='tests/support/review/synthetic-finish-context-values.ts',finishValueText=readFileSync(join(root,finishValuePath),'utf8');
const finishValueImports=['node:util','zod','../../../src/review/aggregate-schema.js','../../../src/review/result-schema-v2.js','../../../src/review/target-selection.js'];
auditSyntheticIssuer(finishValueText,finishValueImports);
const valueMarkers=['synthetic-finish-context-values','projectSyntheticFinishValues','compareSyntheticFinishValues','synthetic_finish_values','synthetic_finish_comparison','synthetic_finish_value_only','evidence_not_issued_by_ra01'];
const noFinishValues=text=>assert(!valueMarkers.some(x=>text.includes(x)),'RA-01 values leaked into runtime');
for(const marker of valueMarkers)assert.throws(()=>noFinishValues(marker));
assert(!pack.files.some(f=>f.path.includes('synthetic-finish-context-values')));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noFinishValues(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['globalThis.setTimeout(()=>{},0);','Date.now();','new Date();',"import('node:fs');",'new Worker("x");',"export * from 'node:fs';"])
  assert.throws(()=>auditSyntheticIssuer(finishValueText+'\n'+leak,finishValueImports),assert.AssertionError,'RA-01 audit missed seeded leak: '+leak);
console.log('RA-01 value-only projections excluded; fixed pure-data imports + seeded I/O/clock/worker/leak controls PASS');
for(const suffix of ['.js','.js.map','.d.ts','.d.ts.map'])assert(pack.files.some(f=>f.path==='dist/servicenow/review-kernel/release-observation'+suffix),'required one-shot UTC value helper missing: '+suffix);
const sessionDeclarations=readFileSync(join(root,'dist/servicenow/bounded-read.d.ts'),'utf8');
const sessionAst=parse(readFileSync(join(root,'dist/servicenow/bounded-read.js'),'utf8'),{ecmaVersion:'latest',sourceType:'module'});
const sessionClass=sessionAst.body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.type==='ClassDeclaration'&&n.declaration.id?.name==='BoundedReadSession')?.declaration;
const stopBody=sessionClass?.body.body.find(n=>n.type==='MethodDefinition'&&n.key.name==='stop')?.value.body.body;
assert(stopBody?.some(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.type==='MemberExpression'&&n.expression.callee.property.type==='PrivateIdentifier'&&n.expression.callee.property.name==='clearReleaseComparison'),'run stop must directly revoke upper time after ordinary source hook removal');
for(const privateName of ['ReleaseInputProjection','ReleaseInputOrigin','captureReleaseInput','consumeReleaseInput','releaseComparisonProjection','clearReleaseComparison','finishCompositionTime','releaseTimeDiagnostic','createReleaseTimeHandoff'])
  assert(!sessionDeclarations.includes(privateName),'private release timing projection leaked into declarations: '+privateName);
const kernel='dist/servicenow/review-kernel/construction-state';
const sourceKernel='dist/servicenow/review-kernel/source-values';
for(const name of ['release-family','release-comparison','release-observation','release-comparison-receipt','release-time-owner','release-time-handoff']) {
  const path='dist/servicenow/review-kernel/'+name;
  for(const suffix of ['.js','.js.map','.d.ts','.d.ts.map'])assert(pack.files.some(f=>f.path===path+suffix),'required release value contract missing: '+name+suffix);
  const tree=parse(readFileSync(join(root,path+'.js'),'utf8'),{ecmaVersion:'latest',sourceType:'module'}),pending=[tree];
  // release-observation reads time only through its injected clock dependency.
  const allowed=name==='release-family'?[]:['release-observation','release-time-owner'].includes(name)?['zod']:name==='release-comparison-receipt'?['./release-comparison.js']:name==='release-time-handoff'?['./release-comparison-receipt.js','./release-time-owner.js']:['zod','node:util','./release-family.js'];
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
  assert(!s.includes('createDevelopmentReleaseConditionsRealm')&&!s.includes('ef03/release-conditions')&&!s.includes('release_value_comparison_only')&&!s.includes('armReleaseObservation')&&!s.includes('finishUnrequested'),'RC3-D01/D02/D03 private development conditions or adoption leaked into package: '+f.path);}
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
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-release-time-owner.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-release-time-handoff.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
console.log('HTTP classification/status terminal/cleanup/context excluded; formal/production adoption disabled; fixture/oracle excluded PASS ('+pack.files.length+' files)');
