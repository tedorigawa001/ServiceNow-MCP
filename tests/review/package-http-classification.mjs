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
const timeText=readFileSync(join(root,'tests/support/review/synthetic-worker-time.ts'),'utf8'),timeImports=['node:util','zod','./synthetic-worker-job.js','./synthetic-finish-scalars.js','../../../src/review/result-schema-v2.js','../../../src/review/aggregate-schema.js'];
auditSyntheticIssuer(timeText,timeImports);
for(const leak of ['globalThis.setTimeout(()=>{},0);','queueMicrotask(()=>{});','const zzNow=Date.now;','performance.now.call(performance);',"Date['now']();",'new Date();',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(timeText+'\n'+leak,timeImports),assert.AssertionError,'WJ-B audit missed seeded leak: '+leak);
console.log('WJ-B/C time/finish owner excluded; fixed pure-data imports, no runtime/I/O/clock references + negative controls PASS');
const scalarText=readFileSync(join(root,'tests/support/review/synthetic-finish-scalars.ts'),'utf8');
auditSyntheticIssuer(scalarText,[]);
const scalarMarkers=['synthetic-finish-scalars','sameFinishRuleSet','sameFinishReleaseEncoding','finishEndOutsideBounds'];
const noFinishScalars=text=>assert(!scalarMarkers.some(x=>text.includes(x)),'RD-B02 scalar predicates leaked into runtime');
for(const marker of scalarMarkers)assert.throws(()=>noFinishScalars(marker));
assert(!pack.files.some(f=>f.path.includes('synthetic-finish-scalars')));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noFinishScalars(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['fetch("x");','Date.now();','new Date();','new Worker("x");',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(scalarText+'\n'+leak,[]),assert.AssertionError,'RD-B02 audit missed seeded leak: '+leak);
console.log('RD-B02 scalar predicates excluded; no imports/I/O/clock/worker references + seeded negative controls PASS');
const recoveryText=readFileSync(join(root,'tests/support/review/synthetic-soft-recovery.ts'),'utf8'),recoveryImports=['./synthetic-recovery-kernel.js'];
auditSyntheticIssuer(recoveryText,recoveryImports);
for(const leak of ['globalThis.setTimeout(()=>{},0);','queueMicrotask(()=>{});','const zzNow=Date.now;','performance.now.call(performance);',"Date['now']();",'new Date();','new Worker(\'x\');',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(recoveryText+'\n'+leak,recoveryImports),assert.AssertionError,'SR-A audit missed seeded leak: '+leak);
console.log('SR-A/C1 separate synthetic issuer/closure contracts excluded; no runtime/I/O/clock/worker imports or references + negative controls PASS');
const rootKernelText=readFileSync(join(root,'tests/support/review/synthetic-recovery-kernel.ts'),'utf8'),rootKernelImports=['node:util','zod','./synthetic-phase-recovery.js','./synthetic-worker-recovery-input.js','./synthetic-worker-recovery-verify.js','./synthetic-finish-plan-binding.js','./synthetic-finish-context-values.js','./synthetic-recovery-finish-values.js','./synthetic-finish-pins.js','./synthetic-parent-omission-values.js','./synthetic-pending-prefix-values.js','./synthetic-full-mixed-draft.js'];
const finishRootText=readFileSync(join(root,'tests/support/review/synthetic-finish-recovery-root.ts'),'utf8'),finishRootImports=['node:util','zod','./synthetic-recovery-kernel.js'];
auditSyntheticIssuer(rootKernelText,rootKernelImports);auditSyntheticIssuer(finishRootText,finishRootImports);
const rootMarkers=['synthetic-recovery-kernel','createSyntheticRecoveryKernel','createSyntheticLifecycleRecoveryKernel','createSyntheticFinishBindingKernel','synthetic-recovery-lifecycle','synthetic-finish-recovery-root','createSyntheticFinishRecoveryRoot','synthetic_finish_recovery_root','synthetic_finish_recovery_binding','synthetic_finish_recovery_observation','synthetic_finish_recovery_claim',
  'createSyntheticOwnedMixedSupply','OwnedMixedSupplyError','synthetic_owned_mixed_supply','synthetic_omd_bound_root_v1',
  'createSyntheticFailureBoundSupply','synthetic_failure_bound_supply','createSyntheticFailureBoundKernel','synthetic_failure_bound_kernel','createFailureKernelLink','KernelRoleBinding',
  'createSyntheticFailureCustodyRun','synthetic_failure_custody_run','createFailureRunSupply','fb03-fake-events-v1','FailureResourceSlot',
  'createSyntheticNormalOwnedSupply','synthetic_normal_owned_supply','createSyntheticNormalAdoptionRoot','CompletedMixedContent','BoundAdoption',
  'createSyntheticNormalTransferRoot','PendingBoundTransfer','PayloadClearedReceipt','synthetic_normal_transfer_custody',
  'projectionReceipt','normalHeaderConsumptions','clearNormalHeader','PendingPrefixCheck','prefixPostChecks','prefixCandidates',
  'OrderedPrefixRelation','consumePrefixRelation','relationConsumeStarted','prefixRelationMarker',
  'createSyntheticDestinationPreparationRoot','PendingContentCheck','ContentChecked','UnpublishedDestination','checkDestinationCandidate',
  'createSyntheticFullProjectionReceiptRoot','ReceivedAcceptedProjection','receivedProjection','pendingProjection','consumeProjection','checkProjection',
  'createSyntheticBundlePartsRoot','BundlePartsDraft','bundleParts','pendingExpectation','buildBundleParts','checkBundleParts',
  'createSyntheticPostProofRoot','PostAcceptedProofPair','postAcceptedProofPair','proofIssueMarkers','proofOrigins','issuePostProofPair','checkPostProofPair','checkBundleComposition',
  'createSyntheticUnpublishedBundleRoot','UnpublishedCompleteBundle','buildingBundle','unpublishedCompleteBundle','bundleOrigin','checkBoundBundleComposition','checkCompleteBundleBindings','buildUnpublishedBundle',
  'createSyntheticBundleConsumerRoot','consumingBundle','bundleConsumeStarted','bundleConsumeRejection','consumeUnpublishedBundle','checkConsumingBundle','retireConsumedBundle',
  'createSyntheticAtomicPreparationRoot','AtomicPreparationOwner','AtomicDestinationShell','AtomicPreparationPhase','atomicPreparingBundle','atomicPreparation','atomicOrigins','checkAtomicPreparation',
  'createSyntheticAtomicStagingRoot','NormalTerminalBinding','normalTerminalStarted','PreCommitBundle','AtomicCommitRecord','atomicRecordCandidate','stagedAtomicRecord','atomicRecordOrigin','buildAtomicStage','checkAtomicRecordBinding'];
const noRecoveryRoot=text=>assert(!rootMarkers.some(x=>text.includes(x)),'RB-A shared kernel/root leaked into runtime');
for(const marker of rootMarkers)assert.throws(()=>noRecoveryRoot(marker));
assert(!pack.files.some(f=>/synthetic-recovery-kernel|synthetic-recovery-lifecycle|synthetic-finish-recovery-root/.test(f.path)));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noRecoveryRoot(readFileSync(join(root,f.path),'utf8'));
for(const [text,imports] of [[rootKernelText,rootKernelImports],[finishRootText,finishRootImports]])
  for(const leak of ['globalThis.setTimeout(()=>{},0);','Date.now();','new Date();',"import('node:fs');",'new Worker("x");',"export * from 'node:fs';","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
    assert.throws(()=>auditSyntheticIssuer(text+'\n'+leak,imports),assert.AssertionError,'RB-A audit missed seeded leak: '+leak);
console.log('RB-A shared kernel/closed descriptor root excluded; fixed dependency graphs + seeded runtime/I/O/clock/worker/leak controls PASS');
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
const assemblyPath='tests/support/review/synthetic-finish-assembly.ts',assemblyText=readFileSync(join(root,assemblyPath),'utf8');
const assemblyImports=['./synthetic-finish-pins.js'];
auditSyntheticIssuer(assemblyText,assemblyImports);
const assemblyMarkers=['synthetic-finish-assembly','createSyntheticFinishAssembly','synthetic_finish_assembly','synthetic_finish_assembly_binding','synthetic_finish_seed_v1','synthetic_reviewed_pin','synthetic_original_outcome_pin'];
const noFinishAssembly=text=>assert(!assemblyMarkers.some(x=>text.includes(x)),'RA-02 preparation leaked into runtime');
for(const marker of assemblyMarkers)assert.throws(()=>noFinishAssembly(marker));
assert(!pack.files.some(f=>f.path.includes('synthetic-finish-assembly')));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noFinishAssembly(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['globalThis.setTimeout(()=>{},0);','Date.now();','new Date();',"import('node:fs');",'new Worker("x");',"export * from 'node:fs';","import {createSyntheticSoftRecoveryIssuer} from './synthetic-soft-recovery.js';const zzOldRoot=createSyntheticSoftRecoveryIssuer;"])
  assert.throws(()=>auditSyntheticIssuer(assemblyText+'\n'+leak,assemblyImports),assert.AssertionError,'RA-02 audit missed seeded leak: '+leak);
console.log('RA-02 preparation excluded; separate root/pure-value imports + seeded old-root/I/O/clock/worker/leak controls PASS');
const pinText=readFileSync(join(root,'tests/support/review/synthetic-finish-pins.ts'),'utf8'),pinImports=['node:util','./synthetic-finish-context-values.js'];
const pinnedRootText=readFileSync(join(root,'tests/support/review/synthetic-pinned-recovery-root.ts'),'utf8'),pinnedRootImports=['node:util','zod','./synthetic-finish-pins.js','./synthetic-recovery-kernel.js','./synthetic-recovery-capture.js','./synthetic-recovery-nonreviewed-issuer.js','./synthetic-recovery-nonreviewed-values.js'];
auditSyntheticIssuer(pinText,pinImports);auditSyntheticIssuer(pinnedRootText,pinnedRootImports);
const pinMarkers=['synthetic-finish-pins','createSyntheticFinishPins','SyntheticFinishPins','synthetic-pinned-recovery-root','createSyntheticPinnedRecoveryRoot','synthetic_pinned_recovery_root','synthetic_pinned_recovery_binding','synthetic_pinned_recovery_observation','synthetic_pinned_recovery_claim','synthetic_pinned_recovery_preparation','synthetic_pinned_generation_start','synthetic_pinned_generation_cleanup','synthetic_pinned_generation_lease','synthetic_pinned_generation_ready','synthetic_pinned_recovery_plan','synthetic_pinned_recovery_handoff','synthetic_unbound_recovery_summary'];
const noPinnedRoot=text=>assert(!pinMarkers.some(x=>text.includes(x)),'RB-B private pin/root leaked into runtime');
pinMarkers.push('createSyntheticCapturedRecoveryRoot','sealCapturedRecoveryFinishExpectation','synthetic_capture_plan_binding','synthetic_captured_finish_expectation');
pinMarkers.push('createSyntheticMixedRecoveryRoot','sealMixedRecoveryFinishExpectation','synthetic_mixed_manifest_binding','synthetic_mixed_finish_expectation');
for(const marker of pinMarkers)assert.throws(()=>noPinnedRoot(marker));
assert(!pack.files.some(f=>/synthetic-finish-pins|synthetic-pinned-recovery-root/.test(f.path)));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noPinnedRoot(readFileSync(join(root,f.path),'utf8'));
for(const [text,imports] of [[pinText,pinImports],[pinnedRootText,pinnedRootImports]])
  for(const leak of ['globalThis.setTimeout(()=>{},0);','Date.now();','new Date();',"import('node:fs');",'new Worker("x");',"export * from 'node:fs';","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
    assert.throws(()=>auditSyntheticIssuer(text+'\n'+leak,imports),assert.AssertionError,'RB-B audit missed seeded leak: '+leak);
console.log('RB-B private pin supplier/root excluded; pure dependency graphs + seeded runtime/I/O/clock/worker/leak controls PASS');
const bindingText=readFileSync(join(root,'tests/support/review/synthetic-finish-plan-binding.ts'),'utf8'),bindingImports=['./synthetic-finish-context-values.js'];
auditSyntheticIssuer(bindingText,bindingImports);
const bindingMarkers=['synthetic-finish-plan-binding','projectSyntheticFinishPlanBinding','SyntheticFinishPlanView','SyntheticFinishRouteView','synthetic_finish_plan_projection','synthetic-recovery-plan-binding','synthetic-finish-issue','SyntheticIssuedFinishContext','synthetic_issued_finish_context','issueFinishContext','synthetic-finish-accept','SyntheticAcceptedFinishContext','synthetic_accepted_finish_context','acceptRecoveryFinishContext','synthetic-finish-discard','discardAcceptedFinishContext','acceptedSourceClosed','acceptedCleanupConfirmed'];
const noFinishBinding=text=>assert(!bindingMarkers.some(x=>text.includes(x)),'RB-D binding projection leaked into runtime');
for(const marker of bindingMarkers)assert.throws(()=>noFinishBinding(marker));
assert(!pack.files.some(f=>/synthetic-finish-plan-binding|synthetic-recovery-plan-binding/.test(f.path)));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noFinishBinding(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['globalThis.setTimeout(()=>{},0);','Date.now();','new Date();',"import('node:fs');",'new Worker("x");',"export * from 'node:fs';","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(bindingText+'\n'+leak,bindingImports),assert.AssertionError,'RB-D audit missed seeded leak: '+leak);
console.log('RB-D private plan binding projection excluded; fixed pure-value graph + seeded runtime/I/O/clock/worker/type/scope leak controls PASS');
const recoveryValuesText=readFileSync(join(root,'tests/support/review/synthetic-recovery-finish-values.ts'),'utf8'),recoveryValueImports=['node:util','zod','../../../src/review/aggregate-schema.js','../../../src/review/result-schema-v2.js','../../../src/review/target-selection.js','./synthetic-finish-scalars.js'];
auditSyntheticIssuer(recoveryValuesText,recoveryValueImports);
const recoveryValueMarkers=['synthetic-recovery-finish-values','projectRecoveryFinishExpectation','projectRecoveryFinishReply','compareRecoveryFinishValues','synthetic_recovery_finish_comparison_value_only','SyntheticRecoveryFinishExpectationValues','SyntheticRecoveryFinishReplyValues','SyntheticRecoveryFinishValueCheck','synthetic_recovery_finish_expectation_values','synthetic_recovery_finish_reply_values','synthetic_recovery_finish_value_check','synthetic_recovery_finish_expectation_v1','synthetic_recovery_finish_reply_v1','sealRecoveryFinishExpectation','SealedRecoveryFinishExpectation','synthetic_sealed_recovery_finish_expectation'];
const noRecoveryFinishValues=text=>assert(!recoveryValueMarkers.some(x=>text.includes(x)),'RD-B01 pure recovery values leaked into runtime');
for(const marker of recoveryValueMarkers)assert.throws(()=>noRecoveryFinishValues(marker));
assert(!pack.files.some(f=>f.path.includes('synthetic-recovery-finish-values')));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noRecoveryFinishValues(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['globalThis.setTimeout(()=>{},0);','Date.now();','new Date();',"import('node:fs');",'new Worker("x");',"export * from 'node:fs';","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(recoveryValuesText+'\n'+leak,recoveryValueImports),assert.AssertionError,'RD-B01 audit missed seeded leak: '+leak);
console.log('RD-B01/03/04 values, comparison and private seal excluded; fixed pure imports + seeded runtime/I/O/clock/worker/type/scope leak controls PASS');
const fullJsonText=readFileSync(join(root,'tests/support/review/synthetic-recovery-full-json.ts'),'utf8');
const fullJsonImports=['zod','node:buffer','../../../src/review/aggregate-schema.js','../../../src/review/result-schema-v2.js'];
auditSyntheticIssuer(fullJsonText,fullJsonImports);
const fullJsonMarkers=['synthetic-recovery-full-json','RECOVERY_FULL_JSON_SHAPE','RecoveryFullJsonError','measureRecoveryFullJson','recoveryFullJsonBounds','validateRecoveryAnalysisJson','validateRecoveryAggregateJson','synthetic_recovery_full_json_values'];
const noFullJson=text=>assert(!fullJsonMarkers.some(x=>text.includes(x)),'CG-A full values leaked into runtime');
for(const marker of fullJsonMarkers)assert.throws(()=>noFullJson(marker));
assert(!pack.files.some(f=>f.path.includes('synthetic-recovery-full-json')));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noFullJson(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['fetch("x");','Date.now();','new Date();','new Worker("x");',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(fullJsonText+'\n'+leak,fullJsonImports),assert.AssertionError,'CG-A audit missed seeded leak: '+leak);
console.log('CG-A full schema values/shape/strict JSON excluded; fixed pure imports + seeded runtime/I/O/clock/worker/leak controls PASS');
const captureText=readFileSync(join(root,'tests/support/review/synthetic-recovery-capture.ts'),'utf8');
const captureImports=['node:util','zod','../../../src/review/result-schema-v2.js','./synthetic-recovery-full-json.js','./synthetic-parent-omission-values.js'];
auditSyntheticIssuer(captureText,captureImports);
const captureMarkers=['synthetic-recovery-capture','createSyntheticRecoveryCaptureAssembly','RecoveryCaptureError','synthetic_recovery_capture_only','synthetic_capture_manifest','synthetic_reviewed_capture','synthetic_capture_wire'];
const noCapture=text=>assert(!captureMarkers.some(x=>text.includes(x)),'CG-B synthetic capture leaked into runtime');
captureMarkers.push('projectSyntheticRecoveryCaptureContexts');
captureMarkers.push('createSyntheticParentOmissionAssembly','ParentCaptureInput','ParentCaptureWire','ParentReviewedCapture','ParentOmissionDecision','ParentOmissionCleanup','synthetic_parent_capture_input','synthetic_parent_capture_wire','synthetic_parent_reviewed_capture','synthetic_parent_omission_decision','synthetic_parent_omission_cleanup','synthetic_parent_omission_owner');
for(const marker of captureMarkers)assert.throws(()=>noCapture(marker));
assert(!pack.files.some(f=>f.path.includes('synthetic-recovery-capture')));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noCapture(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['fetch("x");','Date.now();','new Date();','new Worker("x");',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(captureText+'\n'+leak,captureImports),assert.AssertionError,'CG-B audit missed seeded leak: '+leak);
console.log('CG-B fresh synthetic capture/one-shot manifest excluded; fixed imports + seeded runtime/I/O/clock/worker/leak controls PASS');
console.log('OM-C fresh reviewed-only decision owner/brands excluded; same pure graph + seeded leak controls PASS');
const nonReviewedText=readFileSync(join(root,'tests/support/review/synthetic-recovery-nonreviewed-values.ts'),'utf8');
const nonReviewedImports=['node:util','zod','../../../src/review/aggregate-schema.js'];
auditSyntheticIssuer(nonReviewedText,nonReviewedImports);
const nonReviewedMarkers=['synthetic-recovery-nonreviewed-values','projectSyntheticNonReviewedValue','NonReviewedValueError','RECOVERY_NONREVIEWED_VALUE_LIMITS','SyntheticNonReviewedValues','synthetic_nonreviewed_values','synthetic_nonreviewed_value_only'];
const noNonReviewed=text=>assert(!nonReviewedMarkers.some(x=>text.includes(x)),'NR-A pure nonreviewed values leaked into runtime');
for(const marker of nonReviewedMarkers)assert.throws(()=>noNonReviewed(marker));
assert(!pack.files.some(f=>f.path.includes('synthetic-recovery-nonreviewed-values')));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noNonReviewed(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['fetch("x");','Date.now();','new Date();','new Worker("x");',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(nonReviewedText+'\n'+leak,nonReviewedImports),assert.AssertionError,'NR-A audit missed seeded leak: '+leak);
console.log('NR-A pure state/producer/omission values excluded; fixed imports + seeded runtime/I/O/clock/worker/leak controls PASS');
const nonReviewedIssuerText=readFileSync(join(root,'tests/support/review/synthetic-recovery-nonreviewed-issuer.ts'),'utf8');
const nonReviewedIssuerImports=['node:util','zod','../../../src/review/catalog.js','../../../src/review/result-schema-v2.js','./synthetic-recovery-nonreviewed-values.js','./synthetic-recovery-full-json.js'];
auditSyntheticIssuer(nonReviewedIssuerText,nonReviewedIssuerImports);
const nonReviewedIssuerMarkers=['synthetic-recovery-nonreviewed-issuer','createSyntheticNonReviewedIssuer','createSyntheticNonReviewedManifestSupplier','NonReviewedManifest','synthetic_nonreviewed_manifest','NonReviewedIssuerError','synthetic_nonreviewed_issuer_only','synthetic_nonreviewed_issuer_v1','synthetic_classified_nonreviewed','synthetic_retrieved_nonreviewed','synthetic_analyzed_nonreviewed'];
const noNonReviewedIssuer=text=>assert(!nonReviewedIssuerMarkers.some(x=>text.includes(x)),'NR-B synthetic issuer leaked into runtime');
for(const marker of nonReviewedIssuerMarkers)assert.throws(()=>noNonReviewedIssuer(marker));
assert(!pack.files.some(f=>f.path.includes('synthetic-recovery-nonreviewed-issuer')));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noNonReviewedIssuer(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['fetch("x");','Date.now();','new Date();','new Worker("x");',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(nonReviewedIssuerText+'\n'+leak,nonReviewedIssuerImports),assert.AssertionError,'NR-B audit missed seeded leak: '+leak);
console.log('NR-B fresh producer claims/synthetic issuer excluded; fixed imports + seeded runtime/I/O/clock/worker/leak controls PASS');
const parentOmissionText=readFileSync(join(root,'tests/support/review/synthetic-parent-omission-values.ts'),'utf8');
const parentOmissionImports=['node:util','node:buffer','zod','../../../src/review/aggregate-schema.js','../../../src/review/result-schema-v2.js','./synthetic-recovery-full-json.js','./synthetic-recovery-nonreviewed-values.js'];
auditSyntheticIssuer(parentOmissionText,parentOmissionImports);
const parentOmissionMarkers=['synthetic-parent-omission-values','modelSyntheticParentOmission','ParentOmissionValueError','PARENT_OMISSION_VALUE_LIMITS','synthetic_parent_omission_values','synthetic_parent_omission_value_only','non_executable_parent_model'];
const noParentOmission=text=>assert(!parentOmissionMarkers.some(x=>text.includes(x)),'OM-A pure parent omission model leaked into runtime');
for(const marker of parentOmissionMarkers)assert.throws(()=>noParentOmission(marker));
assert(!pack.files.some(f=>f.path.includes('synthetic-parent-omission-values')));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noParentOmission(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['fetch("x");','Date.now();','new Date();','new Worker("x");',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(parentOmissionText+'\n'+leak,parentOmissionImports),assert.AssertionError,'OM-A audit missed seeded leak: '+leak);
console.log('OM-A pure parent finding/prefix model excluded; fixed imports + seeded runtime/I/O/clock/worker/leak controls PASS');
const fullMixedDraftText=readFileSync(join(root,'tests/support/review/synthetic-full-mixed-draft.ts'),'utf8');
const fullMixedDraftImports=['node:util','node:buffer','../../../src/review/aggregate-schema.js','../../../src/review/result-schema-v2.js','./synthetic-parent-omission-values.js','./synthetic-recovery-full-json.js','./synthetic-recovery-nonreviewed-values.js'];
auditSyntheticIssuer(fullMixedDraftText,fullMixedDraftImports);
const fullMixedDraftMarkers=['synthetic-full-mixed-draft','projectSyntheticFullMixedDraft','FullMixedDraftError','FULL_MIXED_DRAFT_LIMITS','full-mixed-draft-v1','synthetic_full_mixed_draft_values'];
const noFullMixedDraft=text=>assert(!fullMixedDraftMarkers.some(x=>text.includes(x)),'D1 full mixed draft leaked into runtime');
for(const marker of fullMixedDraftMarkers)assert.throws(()=>noFullMixedDraft(marker));
assert(!pack.files.some(f=>f.path.includes('synthetic-full-mixed-draft')));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noFullMixedDraft(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['fetch("x");','Date.now();','new Date();','new Worker("x");',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(fullMixedDraftText+'\n'+leak,fullMixedDraftImports),assert.AssertionError,'D1 audit missed seeded leak: '+leak);
assert(rootKernelImports.includes('./synthetic-full-mixed-draft.js'),'D2 fixed D1 import must be audited');
console.log('D1 DATA values + D2 fresh preparation root excluded; fixed imports + seeded leak controls PASS');
const prefixDeltaText=readFileSync(join(root,'tests/support/review/synthetic-prefix-delta.ts'),'utf8');
const prefixDeltaImports=['node:util','zod','../../../src/review/aggregate-schema.js'];
auditSyntheticIssuer(prefixDeltaText,prefixDeltaImports);
const prefixDeltaMarkers=['synthetic-prefix-delta','projectSyntheticPrefixDelta','PrefixDeltaValueError','PREFIX_DELTA_VALUE_LIMITS','ordered-prefix-delta-v1','synthetic_prefix_delta_values','synthetic_prefix_delta_value_only','prefix_delta_values_only'];
const noPrefixDelta=text=>assert(!prefixDeltaMarkers.some(x=>text.includes(x)),'PD-A prefix-local values leaked into runtime');
for(const marker of prefixDeltaMarkers)assert.throws(()=>noPrefixDelta(marker));
assert(!pack.files.some(f=>f.path.includes('synthetic-prefix-delta')));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noPrefixDelta(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['fetch("x");','Date.now();','new Date();','new Worker("x");',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(prefixDeltaText+'\n'+leak,prefixDeltaImports),assert.AssertionError,'PD-A audit missed seeded leak: '+leak);
console.log('PD-A bounded prefix-local values excluded; fixed pure imports + seeded runtime/I/O/clock/worker/leak controls PASS');
const pendingPrefixText=readFileSync(join(root,'tests/support/review/synthetic-pending-prefix-values.ts'),'utf8');
const pendingPrefixImports=['node:util','./synthetic-prefix-delta.js'];
auditSyntheticIssuer(pendingPrefixText,pendingPrefixImports);
const pendingPrefixMarkers=['synthetic-pending-prefix-values','projectSyntheticPendingPrefixValues','PendingPrefixValueError','PENDING_PREFIX_VALUE_LIMITS','synthetic_pending_prefix_values_v1','synthetic_pending_prefix_values'];
const noPendingPrefix=text=>assert(!pendingPrefixMarkers.some(x=>text.includes(x)),'PD-B(A) DATA boundary leaked into runtime');
for(const marker of pendingPrefixMarkers)assert.throws(()=>noPendingPrefix(marker));
assert(!pack.files.some(f=>f.path.includes('synthetic-pending-prefix-values')));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noPendingPrefix(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['fetch("x");','Date.now();','new Date();','new Worker("x");',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(pendingPrefixText+'\n'+leak,pendingPrefixImports),assert.AssertionError,'PD-B(A) audit missed seeded leak: '+leak);
assert(rootKernelImports.includes('./synthetic-pending-prefix-values.js'),'PD-B(B) fixed DATA import must be audited');
console.log('PD-B(A/B) DATA selectors/comparison and pending connection excluded; fixed pure imports + seeded leak controls PASS');
const mixedSlotText=readFileSync(join(root,'tests/support/review/synthetic-omd-slots.ts'),'utf8');
const mixedSlotImports=['node:util','./synthetic-parent-omission-values.js'];
auditSyntheticIssuer(mixedSlotText,mixedSlotImports);
const mixedSlotMarkers=['synthetic-omd-slots','createSyntheticMixedSlotAssembly','MixedSlotError','synthetic_omd_slots','synthetic_omd_row','synthetic_omd_receipt','synthetic_omd_slot','synthetic_omd_initial','synthetic_omd_parent','synthetic_omd_complete','synthetic_omd_cleanup'];
const noMixedSlot=text=>assert(!mixedSlotMarkers.some(x=>text.includes(x)),'OD-A synthetic mixed slots leaked into runtime');
for(const marker of mixedSlotMarkers)assert.throws(()=>noMixedSlot(marker));
assert(!pack.files.some(f=>f.path.includes('synthetic-omd-slots')));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noMixedSlot(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['fetch("x");','Date.now();','new Date();','new Worker("x");',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(mixedSlotText+'\n'+leak,mixedSlotImports),assert.AssertionError,'OD-A audit missed seeded leak: '+leak);
console.log('OD-A fresh synthetic mixed slots excluded; fixed imports + seeded runtime/I/O/clock/worker/leak controls PASS');
const failureCustodyText=readFileSync(join(root,'tests/support/review/synthetic-failure-custody.ts'),'utf8'),failureCustodyImports=['./synthetic-recovery-kernel.js'];
auditSyntheticIssuer(failureCustodyText,failureCustodyImports);
const failureCustodyMarkers=['synthetic-failure-custody','createSyntheticFailureCustody','FailureCustodyError','synthetic_failure_custody_v1','synthetic_failure_owner','synthetic_upper_failure_owner','synthetic_failure_creation','synthetic_failure_fact','synthetic_failure_absence','synthetic_failure_report','synthetic_failure_commit'];
const noFailureCustody=text=>assert(!failureCustodyMarkers.some(x=>text.includes(x)),'synthetic failure custody leaked into runtime');
for(const marker of failureCustodyMarkers)assert.throws(()=>noFailureCustody(marker));
assert(!pack.files.some(f=>f.path.includes('synthetic-failure-custody')));
for(const f of pack.files.filter(f=>f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path)))noFailureCustody(readFileSync(join(root,f.path),'utf8'));
for(const leak of ['fetch("x");','Date.now();','new Date();','new Worker("x");',"import('node:fs');","import {BoundedReadSession} from '../../../src/servicenow/bounded-read.js';const zzRoot=BoundedReadSession;"])
  assert.throws(()=>auditSyntheticIssuer(failureCustodyText+'\n'+leak,failureCustodyImports),assert.AssertionError,'failure custody audit missed seeded leak: '+leak);
console.log('Synthetic failure/upper custody excluded; fixed imports + seeded runtime/I/O/clock/worker/leak controls PASS');
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
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-prefix-relation.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-destination-preparation.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
const compositionMarkers=['snapshot-read-composition-fake','shared-read-hash-kernel-fake','snapshot-read-start-fake','canonical-supply-view-fake','canonical-supply-transfer-fake','supply-boundary-fake','pending-construction-fake','pending-binding-fake','createReadHashFake','createSnapshotReadStartFake','createCanonicalSupplyViewFake','createCanonicalSupplyTransferFake','createSupplyBoundaryFake','createPendingConstructionFake','createPendingBindingFake'];
const noReadComposition=text=>assert(!compositionMarkers.some(marker=>text.includes(marker)),'WF-B composition/factory leaked into package');
for(const marker of compositionMarkers)assert.throws(()=>noReadComposition(marker),assert.AssertionError);
for(const f of pack.files){noReadComposition(f.path);if(f.path.startsWith('dist/')&&/\.(?:js|ts|map)$/.test(f.path))noReadComposition(readFileSync(join(root,f.path),'utf8'));}
console.log('WF-B composition/compatibility factories excluded; seeded package leak controls PASS');
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-declared-actual.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
const noPendingDependencies=text=>assert(!/\bimport\b|\brequire\s*\(|\bexport\s+(?:\*|\{)|\b(?:fetch|Worker|setTimeout|setInterval)\b|\b(?:process|globalThis|window)\s*\.|\b(?:CanonicalSupplyAssembly|createSupplyBoundaryFake|createReadHashFake|PayloadGoneEvidence)\b/.test(text),'unbound construction acquired a dependency/runtime/issuance entry');
const pendingComposition=readFileSync(new URL('fixtures/snapshot-read-composition-fake.ts',import.meta.url),'utf8');
assert.equal(pendingComposition.split('// BEGIN PENDING CONSTRUCTION CORE').length,2);
assert.equal(pendingComposition.split('// END PENDING CONSTRUCTION CORE').length,2);
noPendingDependencies(pendingComposition.split('// BEGIN PENDING CONSTRUCTION CORE')[1].split('// END PENDING CONSTRUCTION CORE')[0]);
assert.equal(readFileSync(new URL('fixtures/pending-construction-fake.ts',import.meta.url),'utf8'),'/** Compatible diagnostic entry; private construction stays in the composition boundary. */\nexport { createPendingConstructionFake } from "./snapshot-read-composition-fake.js";\n');
for(const seed of ['import x from "x"','require("x")','export * from "x"','fetch','Worker','setTimeout','setInterval','globalThis.x','process.x','window.x','CanonicalSupplyAssembly','createSupplyBoundaryFake','createReadHashFake','PayloadGoneEvidence'])assert.throws(()=>noPendingDependencies(seed),assert.AssertionError);
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-pending-construction.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-pending-binding.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
console.log('HTTP classification/status terminal/cleanup/context excluded; formal/production adoption disabled; fixture/oracle excluded PASS ('+pack.files.length+' files)');
