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
  const program=ts.createProgram([join(root,'tests/support/review/synthetic-recovery-kernel.ts'),join(root,'tests/review/fixtures/bp5-results.ts')],{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,skipLibCheck:true,esModuleInterop:true,
    rootDir:root,outDir:out,noEmitOnError:true});
  const diagnostics=ts.getPreEmitDiagnostics(program);assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
  assert.equal(program.emit().emitSkipped,false);
  writeFileSync(join(out,'package.json'),JSON.stringify({type:'module'}));symlinkSync(join(root,'node_modules'),join(out,'node_modules'),'dir');
  symlinkSync(join(root,'examples'),join(out,'examples'),'dir'); // The existing DATA fixture reads its sample JSON relative to its emitted file.
  const {aggregate}=await import(pathToFileURL(join(out,'tests/review/fixtures/bp5-results.js')).href);
  const path=join(out,'tests/support/review/synthetic-recovery-kernel.js'),text=readFileSync(path,'utf8');
  const anchor='checkDestinationCandidate();';assert.equal(text.split(anchor).length,2,'fixed destination recheck must have exactly one call site');
  // The D2 clear is the only clear() that retires the destination slots; seeded leaks edit that function alone.
  const clearHead='function clear() { unpublishedDestination = undefined;',clearStart=text.indexOf(clearHead);assert(clearStart>=0&&text.indexOf(clearHead,clearStart+1)<0,'D2 clear must be unique');
  const clearEnd=text.indexOf('\n',clearStart);assert(clearEnd>clearStart);
  const withoutClear=slot=>t=>{const body=t.slice(clearStart,clearEnd),line=`${slot} = undefined;`;assert.equal(body.split(line).length,2,`clear must retire ${slot} once`);return t.slice(0,clearStart)+body.replace(line,`/* seeded retained ${slot} */`)+t.slice(clearEnd);};
  let serial=0;
  async function load(change){const file=join(out,`tests/support/review/destination-case-${serial++}.js`);writeFileSync(file,change?change(text):text);return (await import(pathToFileURL(file).href)).createSyntheticDestinationPreparationRoot;}
  function setup(create,guard=()=>undefined){
    const a=aggregate(),id='1'.repeat(32),S='2026-10-17T04:59:00.000Z',O='2026-10-17T04:59:01.000Z',U='2026-10-17T04:59:03.000Z';
    const raw={kind:'synthetic_omd_bound_root_v1',recovery:{point:'analyze_timer',active_input_sys_id:id,accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified'},
      finish:{time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},header:{schema_version:a.schema_version,target:a.target,versions:a.versions,started_at:S,instance_release:a.instance_release,release_match:a.release_match,principal:a.principal,
        collection:{...a.collection,metadata_seen:1,selected:1},coverage:{...a.coverage,analysis_complete:false},limits:a.limits,limitations:[...a.limitations],errors:[]},selected:[id],inputs:[{update_xml_sys_id:id,retrieved_at:U,state:'not_processed',expected_context:null}]},
      mixed:{model_id:'recovery-omission-v1',initial_prefix:{limitations:[...a.limitations],errors:[]},rows:[{producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id,reason:'deadline_exceeded'}}]}};
    const r=create(raw,{guard});r.prepare();r.move();r.startKernel();r.beginClosure();r.settleOld({termination:'confirmed',cleanup:'complete'});r.prepareGeneration();const t=r.claimGeneration(),l=r.startGeneration(t.start);r.acceptReady(l,r.issueReady(l));r.adopt();return r;
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
}finally{globalThis.fetch=originalFetch;rmSync(out,{recursive:true,force:true});}
