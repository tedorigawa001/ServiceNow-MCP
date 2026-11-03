/** Compile the actual package-excluded graph into an isolated temporary ESM tree; never ship it. */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
const root=fileURLToPath(new URL('../../../',import.meta.url)),out=mkdtempSync(join(tmpdir(),'sn-destination-preparation-'));
const originalFetch=globalThis.fetch;
globalThis.fetch=()=>{throw Error('unexpected network');};
try{
  const program=ts.createProgram([join(root,'tests/support/review/synthetic-recovery-kernel.ts'),join(root,'tests/review/fixtures/bp5-results.ts'),join(root,'tests/review/fixtures/bundle-parts-input.ts')],{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,skipLibCheck:true,esModuleInterop:true,
    rootDir:root,outDir:out,noEmitOnError:true});
  const diagnostics=ts.getPreEmitDiagnostics(program);assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
  assert.equal(program.emit().emitSkipped,false);
  writeFileSync(join(out,'package.json'),JSON.stringify({type:'module'}));symlinkSync(join(root,'node_modules'),join(out,'node_modules'),'dir');
  symlinkSync(join(root,'examples'),join(out,'examples'),'dir'); // The existing DATA fixture reads its sample JSON relative to its emitted file.
  const {aggregate}=await import(pathToFileURL(join(out,'tests/review/fixtures/bp5-results.js')).href);
  const {bundlePartsInput}=await import(pathToFileURL(join(out,'tests/review/fixtures/bundle-parts-input.js')).href);
  const path=join(out,'tests/support/review/synthetic-recovery-kernel.js'),text=readFileSync(path,'utf8');
  const anchor='checkDestinationCandidate();';assert.equal(text.split(anchor).length,2,'fixed destination recheck must have exactly one call site');
  // The D2 clear is the only clear() that retires the destination slots; seeded leaks edit that function alone.
  const clearHead='function clear() { unpublishedDestination = undefined;',clearStart=text.indexOf(clearHead);assert(clearStart>=0&&text.indexOf(clearHead,clearStart+1)<0,'D2 clear must be unique');
  const clearEnd=text.indexOf('\n',clearStart);assert(clearEnd>clearStart);
  const withoutClear=slot=>t=>{const body=t.slice(clearStart,clearEnd),line=`${slot} = undefined;`;assert.equal(body.split(line).length,2,`clear must retire ${slot} once`);return t.slice(0,clearStart)+body.replace(line,`/* seeded retained ${slot} */`)+t.slice(clearEnd);};
  let serial=0;
  async function load(change,factory='createSyntheticDestinationPreparationRoot'){const file=join(out,`tests/support/review/destination-case-${serial++}.js`);writeFileSync(file,change?change(text):text);return (await import(pathToFileURL(file).href))[factory];}
  function setup(create,guard=()=>undefined,input){
    const a=aggregate(),id='1'.repeat(32),S='2026-10-17T04:59:00.000Z',O='2026-10-17T04:59:01.000Z',U='2026-10-17T04:59:03.000Z';
    const raw={kind:'synthetic_omd_bound_root_v1',recovery:{point:'analyze_timer',active_input_sys_id:id,accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified'},
      finish:{time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},header:{schema_version:a.schema_version,target:a.target,versions:a.versions,started_at:S,instance_release:a.instance_release,release_match:a.release_match,principal:a.principal,
        collection:{...a.collection,metadata_seen:1,selected:1},coverage:{...a.coverage,analysis_complete:false},limits:a.limits,limitations:[...a.limitations],errors:[]},selected:[id],inputs:[{update_xml_sys_id:id,retrieved_at:U,state:'not_processed',expected_context:null}]},
      mixed:{model_id:'recovery-omission-v1',initial_prefix:{limitations:[...a.limitations],errors:[]},rows:[{producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id,reason:'deadline_exceeded'}}]}};
    const r=create(input??raw,{guard});r.prepare();r.move();r.startKernel();r.beginClosure();r.settleOld({termination:'confirmed',cleanup:'complete'});r.prepareGeneration();const t=r.claimGeneration(),l=r.startGeneration(t.start);r.acceptReady(l,r.issueReady(l));r.adopt();return r;
  }
  function clean(r,reason,checks,relations){
    assert.throws(()=>r.prepareDestination());const s=r.inspect();assert.equal(s.first_failure,reason);
    assert.equal(s.destination.checks,checks);assert.equal(s.destination.preparations,checks);assert.equal(s.prefix_check.relations,relations);
    for(const key of ['owner_pending','candidate_pending','checked_pending','draft_pending'])assert.equal(s.destination[key],false);
    assert.equal(s.destination.published,0);assert.equal(s.destination.seals,0);assert.equal(s.transfer.successful_seals,0);
    r.finalDiscard(r.transferFailure());assert.equal(r.custody().payload_cleared,true);assert.throws(()=>r.prepareDestination());assert.equal(r.inspect().destination.preparations,checks);
  }
  const create=await load();clean(setup(create),'state',1,1);
  // Faults exist only in emitted temporary copies, never in runtime roots or their APIs; the prefix recheck has already passed here.
  for(const [name,replacement] of [
    ['epoch','invalidations++; checkDestinationCandidate();'],
    ['owner','destinationOwner = Object.freeze({ ...destinationOwner }); checkDestinationCandidate();'],
    ['pending','pendingContent = Object.freeze({ ...pendingContent, pending: Object.freeze({ ...pendingContent.pending }) }); checkDestinationCandidate();'],
    ['model','pendingContent = Object.freeze({ ...pendingContent, model: Object.freeze({ ...pendingContent.model }) }); checkDestinationCandidate();'],
    ['budget_serial','pendingContent = Object.freeze({ ...pendingContent, budgetSerial: 2 }); checkDestinationCandidate();'],
    ['missing','pendingContent = undefined; checkDestinationCandidate();'],
  ]){const make=await load(t=>t.replace(anchor,replacement));clean(setup(make),'binding',0,0);assert(name);}
  // Negative controls: each deliberately retained destination slot must block payload-clear custody.
  for(const [slot,guard] of [['unpublishedDestination',undefined],['contentChecked',undefined],['destinationOwner',undefined],['pendingContent',s=>s==='transfer_post'?'cancelled':undefined]]){
    const r=setup(await load(withoutClear(slot)),guard);assert.throws(()=>r.prepareDestination());
    assert.throws(()=>r.transferFailure());assert.equal(r.custody().payload_cleared,false);
  }
  console.log('Compiled destination preparation: post-only ContentChecked, epoch/owner/pending/model/budget/missing recheck rejection, full clear + 4 retained-slot negative controls PASS (no network/seal)');
  // FP-1: exercise private calls only in temporary emitted copies. No test friend or payload getter.
  const fullFactory='createSyntheticFullProjectionReceiptRoot';
  function fullClean(r,reason,receipts,checks){
    assert.throws(()=>r.receiveFullProjection());assert.equal(r.inspect().first_failure,reason);
    assert.deepEqual(r.inspect().full_projection,{receipts,post_checks:checks,pending:false,bundles:0,seals:0});
    assert.equal(r.inspect().kernel.accepted_projection.pending,false);
    r.finalDiscard(r.transferFailure());assert.equal(r.custody().payload_cleared,true);
  }
  fullClean(setup(await load(undefined,fullFactory)),'state',1,1);
  const receive='pendingProjection = acceptedChannel.consumeProjection(b, p.taken);';
  const recheck='acceptedChannel.checkProjection(b, pendingProjection);';
  for(const line of [receive,recheck])assert.equal(text.split(line).length,2,'FP-1 call site must be unique');
  for(const [replacement,kernelCount] of [
    ['try { acceptedChannel.consumeHeader(b, p.taken); } catch {} '+receive,0],
    [receive+' acceptedChannel.consumeHeader(b, p.taken);',1],
    [receive+' acceptedChannel.consumeProjection(b, p.taken);',1],
    ['pendingProjection = acceptedChannel.consumeProjection(b, Object.freeze({ ...p.taken }));',0],
  ]){const r=setup(await load(t=>t.replace(receive,replacement),fullFactory));fullClean(r,'binding',0,0);assert.equal(r.inspect().kernel.accepted_projection.consumptions,kernelCount);
    assert.equal(r.inspect().kernel.accepted_header.consumptions,0,'full mode must never complete a header consume');}
  for(const fault of [
    'pendingProjection = Object.freeze({ ...pendingProjection });',
    'pendingProjection = Object.freeze({ ...pendingProjection, receipt: Object.freeze({}) });',
    'pendingProjection = Object.freeze({ ...pendingProjection, accepted: Object.freeze({}) });',
    'acceptedChannel.invalidatePayload();',
  ])fullClean(setup(await load(t=>t.replace(recheck,fault+' '+recheck),fullFactory)),'internal',1,0);
  // Both owners must clear the same received payload before cleanup-only custody can be claimed.
  for(const [slot,make] of [
    ['pendingProjection',withoutClear('pendingProjection')],
    ['receivedProjection',t=>{const line='receivedProjection = undefined;';assert.equal(t.split(line).length,2);return t.replace(line,'/* seeded retained receivedProjection */');}],
  ]){
    const r=setup(await load(make,fullFactory));assert.throws(()=>r.receiveFullProjection());assert.throws(()=>r.transferFailure(),undefined,slot);assert.equal(r.custody().payload_cleared,false);
  }
  console.log('Compiled FP-1: same claim cross-path/replay rejection, copied take/receipt/accepted refusal, revoke and 2 retained-payload controls PASS (no network/bundle/seal)');
  const partsFactory='createSyntheticBundlePartsRoot',partsAnchor='checkBundleParts();\n                        partsChecks++;';assert.equal(text.split(partsAnchor).length,2);
  function partsClean(r,reason='binding',checks=0){
    assert.throws(()=>r.prepareBundleParts());const s=r.inspect();assert.equal(s.first_failure,reason);assert.equal(s.bundle_parts.post_checks,checks);
    for(const k of ['pending','owner_pending','expectation_pending','content_pending','prefix_pending'])assert.equal(s.bundle_parts[k],false);
    for(const k of ['completed_bundles','content_checks','relations','seals'])assert.equal(s.bundle_parts[k],0);
    assert.equal(s.kernel.accepted_header.consumptions,0);assert.equal(s.kernel.accepted_projection.consumptions,1);
    r.finalDiscard(r.transferFailure());assert.equal(r.custody().payload_cleared,true);assert.throws(()=>r.prepareBundleParts());
  }
  partsClean(setup(await load(undefined,partsFactory),undefined,bundlePartsInput(true)),'state',1);
  // Independently choose a wrong origin/slot/serial; no helper under test supplies the expected verdict.
  for(const fault of [
    'bundleParts = undefined;',
    'destinationOwner = Object.freeze({ ...destinationOwner });',
    'pendingTransfer = Object.freeze({ ...pendingTransfer });',
    'pendingProjection = Object.freeze({ ...pendingProjection });',
    'bundleParts = Object.freeze({ ...bundleParts, rows: [...bundleParts.rows] });',
    'bundleParts = Object.freeze({ ...bundleParts, model: Object.freeze({ ...bundleParts.model }) });',
    'bundleParts = Object.freeze({ ...bundleParts, budget: Object.freeze({}) });',
    'bundleParts = Object.freeze({ ...bundleParts, budgetSerial: 2 });',
    'invalidations++;',
    'pendingExpectation = undefined;',
    'pendingPrefix = undefined;',
    'pendingContent = undefined;',
    'pendingPrefix = Object.freeze({ ...pendingPrefix, values: Object.freeze({ ...pendingPrefix.values }) }); bundleParts = Object.freeze({ ...bundleParts, prefix: pendingPrefix });',
    'pendingContent = Object.freeze({ ...pendingContent, pending: Object.freeze({ ...pendingContent.pending }) }); bundleParts = Object.freeze({ ...bundleParts, content: pendingContent });',
  ])partsClean(setup(await load(t=>t.replace(partsAnchor,fault+' '+partsAnchor),partsFactory),undefined,bundlePartsInput(true)));
  // Rewrite the expectation and its slot together: identity-only checks must not hide full-field drift.
  for(const patch of [
    'binding: { ...e.binding, owner: Object.freeze({}) }',
    'binding: { ...e.binding, accepted_origin: Object.freeze({}) }',
    'binding: { ...e.binding, budget: Object.freeze({}) }',
    'binding: { ...e.binding, frame: { ...e.binding.frame, generation: Object.freeze({}) } }',
    'time: { ...e.time, deadline_ms: 59999 }',
    'time: { ...e.time, upper_utc: e.time.observed_at }',
    'header: { ...e.header, target: { ...e.header.target, instance_binding: "f".repeat(64) } }',
    'header: { ...e.header, versions: { ...e.header.versions, ruleset: "foreign" } }',
    'header: { ...e.header, coverage: { ...e.header.coverage, analysis_complete: true } }',
    'selected: [...e.selected].reverse()',
    'inputs: e.inputs.map((x,n) => n === 0 ? { ...x, receipt: Object.freeze({}) } : x)',
    'outcomes: e.outcomes.map((x,n) => n === 0 ? { ...x, accepted_outcome: Object.freeze({}) } : x)',
    'outcomes: e.outcomes.map((x,n) => n === 1 ? { ...x, reviewed_origin: { ...x.reviewed_origin, receipt: Object.freeze({}) } } : x)',
    'content_evidence: { ...e.content_evidence, wire: "verified" }',
    'extra: true',
    // Same-shape copies and appended rows: only identity and length checks can reject these.
    'run_status: e.run_status === "failed" ? "partial" : "failed"',
    'consistency: e.consistency === "changed" ? "stable_observation" : "changed"',
    'kind: "synthetic_recovery_finish_expectation_v2"',
    'binding: { ...e.binding, frame: { ...e.binding.frame, supervisor: Object.freeze({}) } }',
    'binding: { ...e.binding, frame: { ...e.binding.frame, worker: Object.freeze({}) } }',
    'inputs: [...e.inputs, e.inputs[0]]',
    'outcomes: [...e.outcomes, e.outcomes[0]]',
    'outcomes: e.outcomes.map((x,n) => n === 0 ? { ...x, receipt: { ...x.receipt } } : x)',
    'outcomes: e.outcomes.map((x,n) => n === 0 ? { ...x, accepted_outcome: { ...x.accepted_outcome } } : x)',
  ]){
    const fault=`const e = pendingExpectation.value; pendingExpectation = Object.freeze({ ...pendingExpectation, value: Object.freeze({ ...e, ${patch} }) }); bundleParts = Object.freeze({ ...bundleParts, expectation: pendingExpectation }); `;
    partsClean(setup(await load(t=>t.replace(partsAnchor,fault+partsAnchor),partsFactory),undefined,bundlePartsInput(true)),patch==='extra: true'?'shape':'binding');
  }
  // Whole body, original rows, trace and parent-prefix lanes must agree, not merely IDs or canonical header.
  for(const patch of [
    'original_rows: []',
    'manifest: { ...d.manifest, assets: d.manifest.assets.slice(1) }',
    'manifest: { ...d.manifest, prefix: { limitations: pendingExpectation.value.header.limitations, errors: pendingExpectation.value.header.errors } }',
    'manifest: { ...d.manifest, assets: d.manifest.assets.map((x,n) => n === 0 ? { ...x, result: { ...x.result, findings: x.result.findings.map((f,i) => i === 0 ? { ...f, recommendation: "wrong" } : f) } } : x) }',
    'manifest: { ...d.manifest, trace: [] }',
    'kept_findings: 0',
    'schema_version: d.schema_version === "bp-mcp-review-0.2" ? "bp-mcp-review-0.3" : "bp-mcp-review-0.2"',
    'ruleset_version: d.ruleset_version === "bp3-0.4" ? "bp3-0.5" : "bp3-0.4"',
    'selected: [...d.selected].reverse()',
    'initial_prefix: { ...d.initial_prefix, limitations: [...d.initial_prefix.limitations].reverse() }',
  ]){
    const fault=`const d = pendingContent.draft.value; pendingContent = Object.freeze({ ...pendingContent, draft: Object.freeze({ ...pendingContent.draft, value: Object.freeze({ ...d, ${patch} }) }) }); bundleParts = Object.freeze({ ...bundleParts, content: pendingContent }); `;
    partsClean(setup(await load(t=>t.replace(partsAnchor,fault+partsAnchor),partsFactory),undefined,bundlePartsInput(true)));
  }
  // Rewrite the prefix candidate, its values and the parts together so the value-identity check passes and each lane check must reject.
  for(const patch of [
    'schema_version: q.schema_version === "bp-mcp-review-0.2" ? "bp-mcp-review-0.3" : "bp-mcp-review-0.2"',
    'collection_status: q.collection_status === "failed" ? "complete" : "failed"',
    'value: { ...q.value, parent_prefix: q.value.canonical_prefix }',
    'value: { ...q.value, base_prefix: q.value.canonical_prefix }',
    'value: { ...q.value, canonical_prefix: q.value.base_prefix }',
  ]){
    const fault=`const pv = pendingPrefix.values, q = pv.projection, nv = Object.freeze({ ...pv, projection: Object.freeze({ ...q, ${patch} }) }); pendingPrefix = Object.freeze({ ...pendingPrefix, values: nv }); bundleParts = Object.freeze({ ...bundleParts, prefix: pendingPrefix, prefixValues: nv }); `;
    partsClean(setup(await load(t=>t.replace(partsAnchor,fault+partsAnchor),partsFactory),undefined,bundlePartsInput(true)));
  }
  // A diverging same-plan reprojection must be rejected by the comparison, never adopted as the expectation source.
  const reproject='const again = acceptedChannel.reproject(b, received);';assert.equal(text.split(reproject).length,2,'FP-2 reprojection must have exactly one site');
  for(const patch of ['owner: Object.freeze({})','header: Object.freeze({ ...again.snapshot.header, started_at: "2026-10-17T04:58:59.000Z" })']){
    const fault=`let again = acceptedChannel.reproject(b, received); again = Object.freeze({ ...again, snapshot: Object.freeze({ ...again.snapshot, ${patch} }) });`;
    partsClean(setup(await load(t=>t.replace(reproject,fault),partsFactory),undefined,bundlePartsInput(true)));
  }
  for(const slot of ['pendingExpectation','bundleParts','pendingContent','pendingPrefix','destinationOwner']){
    const r=setup(await load(withoutClear(slot),partsFactory),undefined,bundlePartsInput(true));assert.throws(()=>r.prepareBundleParts());assert.throws(()=>r.transferFailure(),undefined,slot);assert.equal(r.custody().payload_cleared,false);
  }
  console.log('Compiled FP-2: private parts/expectation/full-content binding, 55 field/origin/lane/reprojection faults and 5 retained-slot controls PASS (no complete bundle/seal)');
}finally{globalThis.fetch=originalFetch;rmSync(out,{recursive:true,force:true});}
