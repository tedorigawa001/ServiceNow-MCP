import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {createNativeDiagnosticState} from '../../src/review/abort-scope-evidence-native-diagnostic-state.js';
import {verifyExecutionSeed,seedFields,verifySeedField,verifySeedIdentity,verifySeedStop,auditExecutionSeed,seedMutants,verifySeedMutant,
  verifySeedFieldMutant,seedBoundaryMutants,verifySeedBoundaryMutant,verifySeedAuditNegatives,verifySeedDescriptorPrototype,end} from './fixtures/native-join-execution-seed-model.mjs';

const source=()=>readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic.ts',import.meta.url),'utf8');
let js:string|undefined;
const emitted=()=>js??=ts.transpileModule(source(),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
it('holds all unused execution seed fields before handler preparation and refuses execution without invoking any closure',()=>{
  expect(verifyExecutionSeed(emitted(),createNativeDiagnosticState)).toEqual({roles:2,fields:25,constructorCalls:0,closureCalls:0,dispatch:0});
});
it.each(Object.keys(seedFields))('rejects changed/missing/accessor/read-only seed field %s without invoking hooks',key=>{
  expect(verifySeedField(emitted(),createNativeDiagnosticState,key)).toEqual({refusals:24,hooks:0});
});
it('rejects foreign/copy/Proxy origins without touching foreign state',()=>{
  expect(verifySeedIdentity(emitted(),createNativeDiagnosticState)).toEqual({refusals:24,hooks:0});
});
it('distinguishes stopped read-only cleanup and retains prior preparation diagnoses',()=>{
  expect(verifySeedStop(emitted(),createNativeDiagnosticState)).toEqual({cases:11,constructorCalls:0,hooks:0});
});
it('keeps 14 null aliases and the whole seed continuation free of operational calls',()=>{
  expect(auditExecutionSeed(emitted())).toEqual({aliases:14,constructorCalls:0,closureCalls:0,dispatch:0});
  expect(verifySeedAuditNegatives(emitted())).toBe(7);
});
it('rejects seed accessors even when a descriptor inherits a hostile value getter',()=>{
  expect(verifySeedDescriptorPrototype(emitted(),createNativeDiagnosticState)).toEqual({cases:2,hooks:0});
});
it.each(Object.keys(seedFields))('detects removal of the %s initial-field check',key=>{
  verifySeedFieldMutant(emitted(),createNativeDiagnosticState,key);
});
it.each(seedMutants.map((m:unknown[],i:number)=>[m[0],i]))('detects seed %s mutation',(_name,index)=>{
  verifySeedMutant(emitted(),createNativeDiagnosticState,index as number);
});
it.each(seedBoundaryMutants.map((m:unknown[],i:number)=>[m[0],i]))('detects boundary %s mutation',(_name,index)=>{
  verifySeedBoundaryMutant(emitted(),createNativeDiagnosticState,index as number);
});
it('keeps the request and seed qualifier disconnected from legacy callers',()=>{
  const tree=ts.createSourceFile('root.ts',source(),ts.ScriptTarget.Latest,true),calls:string[][]=[];
  function visit(n:ts.Node){if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&['executionSeedUnused','requestJoinExecution'].includes(n.expression.text)){
    let p:ts.Node|undefined=n.parent;while(p&&!ts.isFunctionDeclaration(p))p=p.parent;
    calls.push([n.expression.text,p&&ts.isFunctionDeclaration(p)?p.name?.text??'':'']);
  }ts.forEachChild(n,visit);}visit(tree);expect(calls).toEqual([['executionSeedUnused','requestJoinExecution']]);
});
it('defines finite future vocabulary but keeps live seed operations literal-closed and role-bound',()=>{
  const text=source(),name=fileURLToPath(new URL('../../src/review/__execution_seed_types.ts',import.meta.url));
  const positive=`const future:JoinConstructorState='returned';const position:JoinExecutionPosition='candidate';const site:JoinFaultSite='settle_call';void future;void position;void site;\nfunction positive(s:JoinRuntimeShell<'run'>){const off:false=s.constructorClaim;const candidate:null=s.candidate;void off;void candidate;}\n`;
  const bad=["const bad:JoinConstructorState='pending';","const bad:JoinCandidateSafety='safe';","const bad:JoinRegistrationState='ready';",
    "const bad:JoinAckState='confirmed';","const bad:JoinCallbackState='retired';","const bad:JoinDrainKind='success';",
    "const bad:JoinFaultSite='arbitrary';","function bad(s:JoinRuntimeShell<'run'>){s.constructorClaim=true;}",
    "function bad(s:JoinRuntimeShell<'run'>){s.constructorState='calling';}","function bad(s:JoinRuntimeShell<'run'>){s.registrationWork=Promise.resolve();}",
    "function bad(s:JoinRuntimeShell<'run'>){s.failureDrainClaim=true;}","function bad(s:JoinRuntimeShell<'run'>){s.settleClaim=true;}",
    "function bad(s:JoinRuntimeShell<'run'>){s.retention='released';}","function bad(s:JoinRuntimeShell<'cleanup'>){const run:JoinRuntimeShell<'run'>=s;}",
    "runCandidateExpected={};"];
  const extra=positive+bad.map(code=>'{'+code+'}').join('\n'),input=text.replace(end,extra+'\n'+end),options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,skipLibCheck:true};
  const host=ts.createCompilerHost(options),get=host.getSourceFile;host.getSourceFile=(file,language,...rest)=>file===name?ts.createSourceFile(file,input,language,true):get(file,language,...rest);
  const errors=ts.getPreEmitDiagnostics(ts.createProgram([name],options,host));expect(errors).toHaveLength(bad.length);
  expect(errors.every(d=>d.file?.fileName===name&&[2322,2540,2588].includes(d.code))).toBe(true);
  let start=text.indexOf(end)+positive.length;for(const code of bad){const finish=start+code.length+2;expect(errors.filter(d=>d.start!==undefined&&d.start>=start&&d.start<finish)).toHaveLength(1);start=finish+1;}
});
