import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {createNativeDiagnosticState} from '../../src/review/abort-scope-evidence-native-diagnostic-state.js';
import {verifyLiveUnused,verifyLiveStages,verifyLiveFailure,verifyLiveBoundaries,verifyLiveMetadata,verifyLiveIdentity,verifyLiveClosedCalls,verifyLiveGuards,
  auditLiveState,verifyLiveAuditNegatives,liveMutants,verifyLiveMutant,verifyLiveRelations,verifyLiveStageLabels,verifyLivePostGuards,end} from './fixtures/native-join-live-state-model.mjs';

const source=()=>readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic.ts',import.meta.url),'utf8');
let js:string|undefined;
const emitted=()=>js??=ts.transpileModule(source(),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
it('inspects the actual same-shell unused fields without adopting a copy or changing the shell',()=>{
  expect(verifyLiveUnused(emitted(),createNativeDiagnosticState)).toEqual({roles:2,refusals:2});
});
it('rejects changed acquisition/registration/tail fields and expected-alias drift rather than re-pinning holders',()=>{
  expect(verifyLiveBoundaries(emitted(),createNativeDiagnosticState)).toEqual({refusals:2236});
});
it('refuses each preparation, slot, failure and acquisition/observation guard drift from an otherwise accepted row',()=>{
  expect(verifyLivePostGuards(emitted(),createNativeDiagnosticState)).toEqual({accepted:661,refusals:610});
});
it('keeps same-reference aliases and role pairs distinct even when another local relationship still matches',()=>{
  expect(verifyLiveRelations(emitted(),createNativeDiagnosticState)).toEqual({refusals:12});
});
it('does not borrow another stage label from the same shell or turn a primitive failure into normal progress',()=>{
  expect(verifyLiveStageLabels(emitted(),createNativeDiagnosticState)).toEqual({accepted:79,refusals:701});
});
it('keeps primitive failure custody even when optional metadata is readonly, hooked, missing, frozen or absent',()=>{
  expect(verifyLiveMetadata(emitted(),createNativeDiagnosticState)).toEqual({cases:22,hooks:0});
});
it('keeps cold metadata holds gated by the already-landed primitive failure, site, primary and revocation',()=>{
  expect(verifyLiveGuards(emitted(),createNativeDiagnosticState)).toEqual({refusals:10});
});
it('keeps the existing request and all three retained closures fixed-refusal despite valid same-shell posts',()=>{
  expect(verifyLiveClosedCalls(emitted(),createNativeDiagnosticState)).toEqual({requests:2,closures:6});
});
it('has only primitive failure writes and bounded cold reflection, without an acquisition writer or invocation',()=>{
  expect(auditLiveState(emitted())).toEqual({writes:7,primitiveCalls:0,coldCalls:4});expect(verifyLiveAuditNegatives(emitted())).toBe(7);
});
it.each(liveMutants.map((m:unknown[],i:number)=>[m[0],i]))('detects %s mutation with independent same-field controls',(_name,i)=>{
  verifyLiveMutant(emitted(),createNativeDiagnosticState,i as number);
});
it('rejects mixed/copied/Proxy origins without foreign reads or diagnostic mutation',()=>{
  expect(verifyLiveIdentity(emitted(),createNativeDiagnosticState)).toEqual({refusals:32});
});
it('checks real slot/shell acquisition and intermediate ack fields without a projection or operation',()=>{
  expect(verifyLiveStages(emitted(),createNativeDiagnosticState)).toEqual({valid:52,refusals:260});
});
it('records the first primitive failure before optional unconfirmed metadata and preserves real references/diagnoses',()=>{
  expect(verifyLiveFailure(emitted(),createNativeDiagnosticState)).toEqual({cases:6});
});
it('has no operational caller and only shares primitive read predicates inside the closed field post',()=>{
  const tree=ts.createSourceFile('root.ts',source(),ts.ScriptTarget.Latest,true),calls:string[]=[];
  function visit(n:ts.Node,owner=''){if(ts.isFunctionDeclaration(n))owner=n.name?.text??'';
    if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&['joinLiveFieldPost','recordJoinExecutionFailure','holdJoinExecutionUnconfirmed',
      'joinLiveTailUnused','joinLiveAcquisitionPost','joinLiveObservationPost'].includes(n.expression.text))calls.push(n.expression.text+':'+owner);
    ts.forEachChild(n,c=>visit(c,owner));}visit(tree);
  expect(calls).toEqual(['joinLiveTailUnused:joinLiveFieldPost','joinLiveAcquisitionPost:joinLiveFieldPost','joinLiveObservationPost:joinLiveFieldPost',
    'recordJoinExecutionFailure:reflectJoinPrecallFailure','holdJoinExecutionUnconfirmed:reflectJoinPrecallFailure']);
});
it('widens only the internal same-shell view and executable slot positions while retaining role and literal-closed seed contracts',()=>{
  const text=source(),name=fileURLToPath(new URL('../../src/review/__live_state_types.ts',import.meta.url));
  const positive=`function operationalTypes(seed:JoinRuntimeShell<'run'>,active:JoinOperationalShell<'run'>&{constructorClaim:true}){
    const same:JoinOperationalShell<'run'>=seed; same.resolve=(_value:WorkflowSnapshot)=>{};
    const half:RoleGenerationSlot<'run'>={role:'run',claimed:true,phase:'building',position:'reject',pending:active,published:null,fault:null,faultAt:null};
    const checked:RoleGenerationSlot<'run'>={role:'run',claimed:true,phase:'checked',position:'checked',pending:active,published:null,fault:null,faultAt:null};
    const off:false=seed.constructorClaim;void same;void half;void checked;void off;}\n`;
  const bad=["function bad(s:JoinOperationalShell<'cleanup'>){s.reject=()=>{};}","function bad(s:JoinOperationalShell<'cleanup'>){s.terminalCopy={};}",
    "function bad(s:JoinOperationalShell<'cleanup'>){s.rejectPayload={};}","function bad(s:JoinOperationalShell<'run'>){s.dispatchStarted=true;}",
    "function bad(s:JoinOperationalShell<'run'>){s.root={};}","function bad(s:JoinRuntimeShell<'run'>){s.constructorClaim=true;}",
    "const bad:JoinLivePostStage='capturing';","const bad:JoinLivePostStage='published';",
    "function bad(s:JoinOperationalShell<'cleanup'>){const x:JoinOperationalShell<'run'>=s;void x;}",
    "function bad(active:JoinOperationalShell<'cleanup'>&{constructorClaim:true}){const x:RoleGenerationSlot<'cleanup'>={role:'cleanup',claimed:true,phase:'building',position:'reject',pending:active,published:null,fault:null,faultAt:null};void x;}"];
  const input=text.replace(end,positive+bad.map(v=>'{'+v+'}').join('\n')+'\n'+end),options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,skipLibCheck:true};
  const host=ts.createCompilerHost(options),get=host.getSourceFile;host.getSourceFile=(file,language,...rest)=>file===name?ts.createSourceFile(file,input,language,true):get(file,language,...rest);
  const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram([name],options,host));expect(diagnostics).toHaveLength(bad.length);
  expect(diagnostics.every(d=>d.file?.fileName===name&&[2322,2540].includes(d.code))).toBe(true);
  for(const code of bad){const start=input.indexOf('{'+code+'}');expect(start).toBeGreaterThan(0);expect(diagnostics.filter(d=>d.start!==undefined&&d.start>=start&&d.start<start+code.length+2)).toHaveLength(1);}
});
