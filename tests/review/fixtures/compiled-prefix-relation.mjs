/** Compile the actual package-excluded graph into an isolated temporary ESM tree; never ship it. */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
const root=fileURLToPath(new URL('../../../',import.meta.url)),out=mkdtempSync(join(tmpdir(),'sn-prefix-relation-'));
const originalFetch=globalThis.fetch;
globalThis.fetch=()=>{throw Error('unexpected network');};
try{
  const program=ts.createProgram([join(root,'tests/support/review/synthetic-recovery-kernel.ts'),join(root,'tests/review/fixtures/bp5-results.ts')],{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,skipLibCheck:true,esModuleInterop:true,
    rootDir:root,outDir:out,noEmitOnError:true});
  const diagnostics=ts.getPreEmitDiagnostics(program);assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
  assert.equal(program.emit().emitSkipped,false);
  writeFileSync(join(out,'package.json'),JSON.stringify({type:'module'}));symlinkSync(join(root,'node_modules'),join(out,'node_modules'),'dir');
  symlinkSync(join(root,'examples'),join(out,'examples'),'dir'); // The existing DATA fixture reads its sample JSON relative to its emitted file.
  const {aggregate}=await import(pathToFileURL(join(out,'tests/review/fixtures/bp5-results.js')).href);
  const path=join(out,'tests/support/review/synthetic-recovery-kernel.js'),text=readFileSync(path,'utf8');
  const anchor='consumePrefixRelation();';assert.equal(text.split(anchor).length,2,'fixed consumer call must have exactly one site');
  let serial=0;
  async function load(change){const file=join(out,`tests/support/review/relation-case-${serial++}.js`);writeFileSync(file,change?change(text):text);return (await import(pathToFileURL(file).href)).createSyntheticNormalTransferRoot;}
  function setup(create,guard=()=>undefined){
    const a=aggregate(),id='1'.repeat(32),S='2026-10-17T04:59:00.000Z',O='2026-10-17T04:59:01.000Z',U='2026-10-17T04:59:03.000Z';
    const raw={kind:'synthetic_omd_bound_root_v1',recovery:{point:'analyze_timer',active_input_sys_id:id,accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified'},
      finish:{time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},header:{schema_version:a.schema_version,target:a.target,versions:a.versions,started_at:S,instance_release:a.instance_release,release_match:a.release_match,principal:a.principal,
        collection:{...a.collection,metadata_seen:1,selected:1},coverage:{...a.coverage,analysis_complete:false},limits:a.limits,limitations:[...a.limitations],errors:[]},selected:[id],inputs:[{update_xml_sys_id:id,retrieved_at:U,state:'not_processed',expected_context:null}]},
      mixed:{model_id:'recovery-omission-v1',initial_prefix:{limitations:[...a.limitations],errors:[]},rows:[{producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id,reason:'deadline_exceeded'}}]}};
    const r=create(raw,{guard});r.prepare();r.move();r.startKernel();r.beginClosure();r.settleOld({termination:'confirmed',cleanup:'complete'});r.prepareGeneration();const t=r.claimGeneration(),l=r.startGeneration(t.start);r.acceptReady(l,r.issueReady(l));r.adopt();return r;
  }
  function clean(r,reason,relations,consumptions){
    assert.throws(()=>r.abortBoundTransfer());const s=r.inspect();assert.equal(s.first_failure,reason);assert.equal(s.prefix_check.relations,relations);assert.equal(s.prefix_check.consumptions,consumptions);
    for(const key of ['pending','relation_pending','relation_marker_pending'])assert.equal(s.prefix_check[key],false);
    assert.equal(s.transfer.successful_seals,0);assert.equal(s.transfer.header_pending,false);
    r.finalDiscard(r.transferFailure());assert.equal(r.custody().payload_cleared,true);assert.throws(()=>r.abortBoundTransfer());assert.equal(r.inspect().prefix_check.consumptions,consumptions);
    assert(!JSON.stringify(r.custody()).includes('canonical_prefix'));
  }
  const create=await load();clean(setup(create),'state',1,1);
  for(const stage of ['transfer_pre','transfer_post'])for(const stop of ['cancelled','deadline_exceeded'])clean(setup(create,s=>s===stage?stop:undefined),stop,0,0);
  // Faults exist only in emitted temporary copies, never in runtime roots or their APIs.
  for(const [name,replacement,reason,consumed] of [
    ['replay','const retryRelation=prefixRelation, retryMarker=prefixRelationMarker; consumePrefixRelation(); prefixRelation=retryRelation; prefixRelationMarker=retryMarker; consumePrefixRelation();','binding',1],
    ['marker','prefixRelationMarker={}; consumePrefixRelation();','binding',0],
    ['epoch','invalidations++; consumePrefixRelation();','binding',0],
    ['cancel_after_accept',"fail('cancelled'); consumePrefixRelation();",'cancelled',0],
  ]){const make=await load(t=>t.replace(anchor,replacement));clean(setup(make),reason,1,consumed);assert(name);}
  // Negative control: a deliberately retained relation must block payload-clear custody.
  const clearAnchor='prefixRelation = undefined;';assert(text.includes(clearAnchor));
  const leaking=await load(t=>t.replaceAll(clearAnchor,'/* seeded retained relation */').replace(anchor,"fail('cancelled'); consumePrefixRelation();"));
  const r=setup(leaking);assert.throws(()=>r.abortBoundTransfer());assert.equal(r.inspect().prefix_check.relation_pending,true);assert.throws(()=>r.transferFailure());assert.equal(r.custody().payload_cleared,false);
  console.log('Compiled prefix relation: post-only acceptance, one-shot replay/marker/epoch rejection, full clear + retained-reference negative control PASS (no network/seal)');
}finally{globalThis.fetch=originalFetch;rmSync(out,{recursive:true,force:true});}
