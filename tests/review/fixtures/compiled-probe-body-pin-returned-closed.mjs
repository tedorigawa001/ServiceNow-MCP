/** Synthetic scratch controls only; no start claim, source writer or terminal owner is connected. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'returned-closed-'));
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const anchor = '    this.recordBodyPinConfirmationFailure(reason, sourceReason, trusted ? source : undefined);\n    this.#finalTerminalDisposition';
const replace = (s,a,b) => { assert.equal(s.split(a).length, 2, a); return s.replace(a,b); };
const instrument = code => replace(source, anchor, code + '\n' + anchor) + '\nexport let captured: unknown;\n';
async function load(s,name) { const p=join(dir,name+'.js'); writeFileSync(p,emit(s)); return import(pathToFileURL(p).href); }
const run = m => { const a=m.createProbeBodyPinFinalPostFake(); const r=a.prepare(); return { a,r,v:m.captured }; };
try {
  writeFileSync(join(dir,'package.json'),'{"type":"module"}');
  for (const n of ['source-map-values-core','supply-construction-kernel'])
    writeFileSync(join(dir,n+'.js'),emit(readFileSync(new URL('./'+n+'.ts',import.meta.url),'utf8')));
  const m=await load(instrument('    captured = this.bodyPinReturnedOriginMatches(this, source, start);'),'normal');
  assert.equal(run(m).v,true,'canonical original source has readonly origin');
  const pure=await load(source+'\nexport const pair=bodyPinReturnedClosedDiagnosticValid, allowed=bodyPinReturnedFirstAllowed, reason=bodyPinReturnedRejectFirst;','values');
  const kinds=['none','binding_mismatch','stopped','prior_failure','invalid_state','observation_unconfirmed','continuation_unconnected'];
  const records=['not_attempted','written','prior_preserved','withheld','unconfirmed','private_secret']; let pairs=0,roles=0,reasons=0;
  for(const k of [...kinds,'private_secret',false])for(const r of records){
    assert.equal(pure.pair(k,r),kinds.includes(k)&&['not_attempted','withheld','unconfirmed'].includes(r)&&(k!=='none'||r==='not_attempted')); pairs++;
  }
  const sets={root:['none','input_rejected','binding_mismatch','construction_unconfirmed','closed','state_invalid','internal_unconfirmed'],
    source:['none','binding_mismatch','state_invalid','closed','construction_unconfirmed','receiver_unconfirmed','post_unconfirmed'],
    receiver:['none','binding_mismatch','state_invalid','closed','receiver_unconfirmed']};
  let hooks=0; const hostile=new Proxy({},{get(){hooks++;throw 'secret';},ownKeys(){hooks++;throw 'secret';},getPrototypeOf(){hooks++;throw 'secret';}});
  const firsts=[...new Set(Object.values(sets).flat()),'private_secret',true,hostile];
  for(const role of ['root','source','receiver','private_secret'])for(const first of firsts){assert.equal(pure.allowed(first,role),sets[role]?.includes(first)??false);roles++;}
  for(const kind of kinds)for(const first of firsts){
    const expected=kind==='binding_mismatch'?'binding_mismatch':kind==='stopped'?'closed':kind==='prior_failure'&&firsts.slice(0,9).includes(first)&&first!=='none'
      ?['receiver_unconfirmed','post_unconfirmed'].includes(first)?'construction_unconfirmed':first
      :['observation_unconfirmed','continuation_unconnected','prior_failure'].includes(kind)?'construction_unconfirmed':'state_invalid';
    assert.equal(pure.reason(kind,first),expected);reasons++;
  }assert.equal(hooks,0);
  const snapshots=`{ code, first: this.#failure.first, reject: this.#bodyPinReturnedRejectClass, record: this.#bodyPinReturnedSourceRecord,
    phase: this.#bodyPinReturnedPhase, post: this.#bodyPinReturnedPostChecked, point: this.#bodyPinReturnedPoint,
    failurePoint: this.#bodyPinReturnedFailurePoint, sealed: this.#finalTerminalSealed, attempted: this.#finalReplyAttempted,
    retained: this.#fixed !== undefined, diagnostic: this.#bodyPinConfirmationDiagnosticRecorded }`;
  const refusal=await load(instrument(`    const before = JSON.stringify(this.bodyPinSourceValues(source));
    const code = this.returnedClosedRefusal(this,source,start); captured = {...${snapshots},sourceUnchanged:before===JSON.stringify(this.bodyPinSourceValues(source))};`),'refusal');
  const normal=run(refusal);assert.deepEqual(normal.v,{code:'failure_pending',first:'construction_unconfirmed',reject:'continuation_unconnected',record:'not_attempted',
    phase:'not_started',post:false,point:'none',failurePoint:'none',sealed:false,attempted:false,retained:false,diagnostic:false,sourceUnchanged:true});
  assert.equal(normal.r.disposition,'pin_return_not_connected');
  const probes=[
    ['root-close','this.#closed=true;','closed','stopped'],['root-stop','this.#bodySourceStopRequested=true;','closed','stopped'],
    ['source-stop','source.stopRequested=true;','closed','stopped'],['root-prior',"this.#failure.first='input_rejected';",'input_rejected','prior_failure'],
    ['source-prior',"source.first='post_unconfirmed';",'construction_unconfirmed','prior_failure'],
    ['root-invalid',"this.#failure.first='private_secret';",'private_secret','invalid_state'],
    ['source-invalid',"source.first='private_secret' as never;",'state_invalid','invalid_state'],
  ];
  const code=probes.map(([name,pre])=>`case '${name}': { ${pre} const origin=this.bodyPinReturnedOriginMatches(this,source,start);
    const healthy=this.bodyPinReturnedSupplyMatches(this,source,start); const before=JSON.stringify(this.bodyPinSourceValues(source));
    const code=this.returnedClosedRefusal(this,source,start); captured={...${snapshots},origin,healthy,sourceUnchanged:before===JSON.stringify(this.bodyPinSourceValues(source))};break;}`).join('\n');
  const pm=await load(instrument(`    switch(fault){${code}}`)+ '\nexport let fault=""; export function select(v:string){fault=v;captured=undefined;}','probes');
  for(const [name,,first,reject]of probes){pm.select(name);const x=run(pm);assert.ok(x.v,name);assert.equal(x.v.first,first,name);assert.equal(x.v.reject,reject,name);
    assert.equal(x.v.origin,true,name);assert.equal(x.v.healthy,false,name);assert.equal(x.v.phase,'not_started');assert.equal(x.v.record,'not_attempted');
    assert.equal(x.v.sourceUnchanged,true,name);assert.ok(!JSON.stringify(x.a.inspect()).includes('private_secret'));}
  const changed=[['bodySourceCurrent','{} as never'],['bodySourceRejected','{} as never'],['bodySourceMetadataFixedCount','8'],
    ['bodySourceMetadataConfirmed','false'],['bodySourceStorageConfirmed','false'],['bodySourceBuildStage',"'captured'"],['bodySourceCreationAttempted','false'],
    ['bodySourceBuildPhase',"'BP00'"],['bodySourceBuildStep',"'checked'"],['bodySourceBuildBoundary',"'before'"],
    ['issuedFrameBinding','{} as never'],['bodySeedShell','{} as never'],['issuedRunLink','{} as never'],['issuedRunDuty','{} as never']];
  const changes=changed.map(([field,value])=>`case '${field}': {const old=this.#${field};this.#${field}=${value};
    try{captured=this.bodyPinReturnedOriginMatches(this,source,start);}finally{this.#${field}=old;}break;}`).join('\n');
  const cm=await load(instrument(`    switch(fault){${changes}}`)+ '\nexport let fault=""; export function select(v:string){fault=v;captured=undefined;}','origin-fields');
  for(const [field]of changed){cm.select(field);const x=run(cm);assert.equal(x.v,false,field);assert.deepEqual(x.r,normal.r,field);}
  const proxy='new Proxy({}, { get(){hooks++;throw "secret";},ownKeys(){hooks++;throw "secret";},getPrototypeOf(){hooks++;throw "secret";} })';
  const foreign=[`${proxy} as never,source,start`,`this,${proxy} as never,start`,`this,source,${proxy} as never`,`this,{...source},start`];
  const fm=await load(instrument(`    switch(fault){${foreign.map((args,i)=>`case '${i}': captured=this.bodyPinReturnedOriginMatches(${args});break;`).join('\n')}}`)
    +'\nexport let hooks=0;export let fault="";export function select(v:string){fault=v;captured=undefined;}','foreign');
  for(let i=0;i<foreign.length;i++){fm.select(String(i));const x=run(fm);assert.equal(x.v,false);assert.deepEqual(x.r,normal.r);}assert.equal(fm.hooks,0);
  const rejected=await load(instrument(`    switch(fault){${foreign.map((args,i)=>`case '${i}': {const before=JSON.stringify(this.bodyPinSourceValues(source));
    const code=this.returnedClosedRefusal(${args});captured={...${snapshots},sourceUnchanged:before===JSON.stringify(this.bodyPinSourceValues(source))};break;}`).join('\n')}}`)
    +'\nexport let hooks=0;export let fault="";export function select(v:string){fault=v;captured=undefined;}','foreign-refusal');
  for(let i=0;i<foreign.length;i++){rejected.select(String(i));const x=run(rejected);assert.equal(x.v.code,i===0?'owner_rejected':'failure_pending');
    assert.equal(x.v.reject,i===0?'none':'binding_mismatch');assert.equal(x.v.record,i===0?'not_attempted':'withheld');assert.equal(x.v.sourceUnchanged,true);}
  assert.equal(rejected.hooks,0);
  const malformed=[['bodyPinReturnedPostChecked','true'],['bodyPinReturnedPoint',"'post'"],['bodyPinReturnedFailurePoint',"'identity'"],
    ['bodyPinReturnedRejectClass',"'private_secret' as never"],['bodyPinReturnedSourceRecord',"'written'"]];
  const malformedCode=malformed.map(([field,value],i)=>`case '${i}':{const old=this.#${field};this.#${field}=${value};
    try{const code=this.returnedClosedRefusal(this,source,start);captured=${snapshots};}finally{this.#${field}=old;}break;}`).join('\n');
  const malformedModule=await load(instrument(`    switch(fault){${malformedCode}}`)
    +'\nexport let fault="";export function select(v:string){fault=v;captured=undefined;}','malformed');
  for(let i=0;i<malformed.length;i++){malformedModule.select(String(i));const x=run(malformedModule);assert.equal(x.v.first,'state_invalid');
    assert.equal(x.v.code,'failure_pending');assert.equal(x.v.phase,'not_started');assert.ok(!JSON.stringify(x.a.inspect()).includes('private_secret'));}
  const again=await load(instrument(`    const firstCode=this.returnedClosedRecord('binding_mismatch','withheld');
    const secondCode=this.returnedClosedRecord('stopped','unconfirmed');const code=secondCode;captured={...${snapshots},firstCode};`),'first');
  const kept=run(again).v;assert.equal(kept.first,'binding_mismatch');assert.equal(kept.reject,'binding_mismatch');assert.equal(kept.record,'withheld');
  const used=[['bodyPinReturnedPhase',"'checking'",'refused_in_progress'],['bodyPinReturnedPhase',"'failed'",'refused_used'],
    ['finalTerminalSealed','true','refused_used'],['finalReplyAttempted','true','refused_used'],['fixed','{} as never','refused_used'],
    ['frame','false','owner_rejected'],['finalPublicEntryBusy','false','owner_rejected']];
  const usedCode=used.map(([field,value],i)=>`case '${i}':{const old=this.#${field};this.#${field}=${value};
    try{const code=this.returnedClosedRefusal(this,source,start);captured=${snapshots};}finally{this.#${field}=old;}break;}`).join('\n');
  const um=await load(instrument(`    switch(fault){${usedCode}}`)+ '\nexport let fault="";export function select(v:string){fault=v;captured=undefined;}','used');
  for(const [i,[,,expected]]of used.entries()){um.select(String(i));const x=run(um);assert.equal(x.v.code,expected);assert.equal(x.v.first,'none');assert.equal(x.v.reject,'none');assert.equal(x.v.record,'not_attempted');}
  const thrown=replace(instrument(`    const code=this.returnedClosedRefusal(this,source,start);captured=${snapshots};`),
    '    // Fixed readonly metadata only: no shape/reflection, healthy-state test, receiver access or progress write.',
    '    throw "scratch_origin_read";\n    // Fixed readonly metadata only: no shape/reflection, healthy-state test, receiver access or progress write.');
  const tx=run(await load(thrown,'throw')).v;assert.equal(tx.first,'construction_unconfirmed');assert.equal(tx.reject,'observation_unconfirmed');assert.equal(tx.record,'unconfirmed');
  const ast=ts.createSourceFile('fixture.ts',source,ts.ScriptTarget.ES2022,true),root=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name.text==='CanonicalGateDraftRoot');
  for(const [name,value]of [['bodyPinReturnedRejectClass',"'none'"],['bodyPinReturnedSourceRecord',"'not_attempted'"]]){
    const f=root.members.find(n=>ts.isPropertyDeclaration(n)&&n.name.getText(ast)==='#'+name);assert.equal(f.initializer.getText(ast),value);
    assert.ok(f.end<root.members.find(ts.isConstructorDeclaration).getStart(ast));
  }
  const firstFields=root.members.filter(n=>ts.isPropertyDeclaration(n)&&!n.modifiers?.some(m=>m.kind===ts.SyntaxKind.StaticKeyword));
  assert.deepEqual(firstFields.slice(0,2).map(n=>n.name.getText(ast)),['#bodyPinReturnedRejectClass','#bodyPinReturnedSourceRecord']);
  const receiverAccess=[];
  function findAccess(n){if(ts.isPropertyAssignment(n)&&n.name.getText(ast)==='bodyPinReceiverFirst')receiverAccess.push(n);ts.forEachChild(n,findAccess);}
  findAccess(ast);assert.equal(receiverAccess.length,1);assert.equal(receiverAccess[0].initializer.body.getText(ast),'a.#bodyBindFirst');
  const helpers=new Set(['bodyPinReturnedRejectKnown','bodyPinReturnedRejectableKnown','bodyPinReturnedClosedRecordKnown',
    'bodyPinReturnedClosedDiagnosticValid','bodyPinReturnedFirstKnown','bodyPinReturnedFirstAllowed','bodyPinReturnedRejectFirst']);
  const calls=new Set([...helpers,'this.returnedClosedRecord','this.bodyPinReturnedOriginMatches','probeStartAccess.bodyPinReceiverFirst']);
  const methods=new Set(['bodyPinReturnedOriginMatches','returnedClosedRecord','returnedClosedRefusal']);
  let noAlloc=0,acceptanceWrites=0,refusalCallers=0;
  function audit(n,owner=''){
    if(ts.isMethodDeclaration(n)||ts.isFunctionDeclaration(n))owner=n.name.getText(ast);
    if(methods.has(owner)||helpers.has(owner)){
      assert.ok(!ts.isObjectLiteralExpression(n)&&!ts.isArrayLiteralExpression(n)&&!ts.isNewExpression(n)&&!ts.isAwaitExpression(n)
        &&!ts.isFunctionExpression(n)&&!ts.isArrowFunction(n)&&!ts.isTemplateExpression(n)&&!ts.isSpreadAssignment(n));
      if(ts.isCallExpression(n))assert.ok(calls.has(n.expression.getText(ast)),owner+'/'+n.expression.getText(ast));
      if(ts.isBinaryExpression(n)&&ts.isAssignmentOperator(n.operatorToken.kind)){
        assert.equal(owner,'returnedClosedRecord');assert.ok(['this.#failure.first','this.#bodyPinReturnedRejectClass','this.#bodyPinReturnedSourceRecord'].includes(n.left.getText(ast)));}
    }
    if(ts.isBinaryExpression(n)&&ts.isAssignmentOperator(n.operatorToken.kind)&&/^this\.#bodyPinReturned(?:Phase|PostChecked|Point|FailurePoint)$/.test(n.left.getText(ast)))acceptanceWrites++;
    if(ts.isCallExpression(n)&&n.expression.getText(ast)==='this.returnedClosedRefusal')refusalCallers++;
    ts.forEachChild(n,c=>audit(c,owner));
  }audit(ast);noAlloc=methods.size+helpers.size;assert.equal(acceptanceWrites,0);assert.equal(refusalCallers,0);
  const extra=`\ndeclare const r:CanonicalGateDraftRoot;declare const s:BodyBindSourceShell;declare const t:RetirementStartAssembly;
r.bodyPinReturnedOriginMatches(r,s,t);
r.returnedClosedRecord('stopped','withheld');
r.returnedClosedRefusal(r,s,t);
r.#bodyPinReturnedRejectClass='stopped';
const badCode:BodyPinReturnedClosedCode='claimed';
const badRecord:BodyPinReturnedClosedRecord='written';
const badDiag:BodyPinReturnedClosedDiagnostic={rejectClass:'none',sourceRecord:'withheld'};
const badReason:BodyPinReturnedRejectClass='private_secret';
const badFuture:BodyPinReturnedClosedDiagnostic={rejectClass:'stopped',sourceRecord:'prior_preserved'};
`;
  const file=fileURLToPath(new URL('./snapshot-read-composition-fake.ts',import.meta.url)),opts={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,strict:true,noEmit:true,skipLibCheck:true,types:['node']};
  const host=ts.createCompilerHost(opts),get=host.getSourceFile.bind(host);
  host.getSourceFile=(n,l,e,f)=>n===file?ts.createSourceFile(n,source+extra,l,true):get(n,l,e,f);
  const ds=ts.getPreEmitDiagnostics(ts.createProgram([file],opts,host));assert.ok(ds.every(d=>d.file?.fileName===file&&d.start>=source.length));
  assert.equal(new Set(ds.map(d=>d.file.getLineAndCharacterOfPosition(d.start).line)).size,9);
  assert.equal(ds.length,9);assert.equal(ds.filter(d=>d.code===2341).length,3);assert.equal(ds.filter(d=>d.code===18013).length,1);
  console.log(JSON.stringify({pairs,roles,reasons,originControls:changed.length,foreign:foreign.length,foreignRefusals:foreign.length,malformed:malformed.length,hooks:fm.hooks,
    refusalCases:probes.length,usedCases:used.length,firstPreserved:true,originThrow:true,noAllocationHelpers:noAlloc,semanticRejections:9,acceptanceWrites,refusalCallers}));
} finally { rmSync(dir,{recursive:true,force:true}); }
