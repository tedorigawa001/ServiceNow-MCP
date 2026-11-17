import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {createNativeDiagnosticState} from '../../src/review/abort-scope-evidence-native-diagnostic-state.js';
import {deriveRuntimePin,faultRuntimePin,verifyRuntimePins,verifyRuntimeIdentity,verifyRuntimePrefixes,verifyRuntimeDrifts,
  auditRuntimePreparation,runtimePinMutants,verifyRuntimeMutant,end} from './fixtures/native-join-runtime-pin-model.mjs';

const source=()=>readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic.ts',import.meta.url),'utf8');
let js:string|undefined;
const emitted=()=>js??=ts.transpileModule(source(),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;

it('retains one same-owner run shell and ready pin without generating work or starting observation',()=>{
  const a=deriveRuntimePin(emitted(),createNativeDiagnosticState)();expect(a.run()).toBe(true);
  const shell=a.runSlot.pending;expect(shell).not.toBeNull();expect(shell.kind).toBe('run');
  expect(shell.readiness).toBe('pin_ready');expect(shell.pinState).toBe('ready');expect(a.runSlot.position).toBe('pin');
  expect(shell.identity.context).toBeNull();expect(shell.pin.runtime).toBe(shell);expect(shell.pin.identity).toBe(shell.identity);
  expect(shell.work).toBeNull();expect(shell.candidate).toBeNull();expect(shell.executor).toBe('not_entered');
  expect(shell.observerState).toBe('unstarted');expect(shell.observerClaim).toBe(false);expect(shell.observerAck).toBeNull();
  expect(shell.dispatchStarted).toBe(false);expect(a.runSlot.published).toBeNull();
});

it('keeps preparation free of constructors, observation, dispatch and other operational capabilities',()=>{
  expect(auditRuntimePreparation(emitted())).toEqual({constructorCalls:0,observerCalls:0,dispatches:0});
  const tree=ts.createSourceFile('root.ts',source(),ts.ScriptTarget.Latest,true),calls:string[]=[];
  function visit(n:ts.Node){if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&['prepareRunShell','prepareCleanupShell'].includes(n.expression.text))calls.push(n.expression.text);ts.forEachChild(n,visit);}visit(tree);
  expect(calls).toEqual([]);
});
it.each(runtimePinMutants.map((m:unknown[],i:number)=>[m[0],i]))('rejects the syntactically valid %s mutation',(_name,index)=>{
  verifyRuntimeMutant(emitted(),createNativeDiagnosticState,index as number);
});
it('keeps role identity, readonly pins and literal closed fields strict at the semantic boundary',()=>{
  const text=source(),name=fileURLToPath(new URL('../../src/review/__runtime_pin_types.ts',import.meta.url));
  const positive=`function positive(s:JoinRuntimeShell<'run'>){const work:null=s.work;const off:false=s.observerClaim;void work;void off;}\n`;
  const bad=["function bad(s:JoinRuntimeShell<'cleanup'>){const r:JoinRuntimeShell<'run'>=s;}",
    "function bad(s:JoinRuntimeShell<'run'>){s.work=Promise.resolve();}",
    "function bad(s:JoinRuntimeShell<'run'>){s.executorHandler=()=>{};}",
    "function bad(s:JoinRuntimeShell<'run'>){s.observerClaim=true;}",
    "function bad(s:JoinRuntimeShell<'run'>){s.dispatchStarted=true;}",
    "function bad(p:OwnerPromisePin<'run'>){p.runtime=null!;}",
    "const identity:JoinShellIdentity<'run'>={recovery:joinRecovery,root:controlRoot,seed:controlRun,kind:'run',context:{record:{},anchor:{}}};",
    "runGeneration.published={};"];
  const extra=positive+bad.map(code=>'{'+code+'}').join('\n'),input=text.replace(end,extra+'\n'+end),
    options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,skipLibCheck:true};
  const host=ts.createCompilerHost(options),get=host.getSourceFile;
  host.getSourceFile=(file,language,...rest)=>file===name?ts.createSourceFile(file,input,language,true):get(file,language,...rest);
  const errors=ts.getPreEmitDiagnostics(ts.createProgram([name],options,host));expect(errors).toHaveLength(bad.length);
  expect(errors.every(d=>d.file?.fileName===name&&[2322,2540].includes(d.code))).toBe(true);
  let start=text.indexOf(end)+positive.length;for(const code of bad){const finish=start+code.length+2;
    expect(errors.filter(d=>d.start!==undefined&&d.start>=start&&d.start<finish)).toHaveLength(1);start=finish+1;}
});

it('keeps both roles and all execution/observation fields closed, including cleanup under an earlier HTTP stop',()=>{
  expect(verifyRuntimePins(emitted(),createNativeDiagnosticState)).toEqual({roles:2,closedFields:23,work:0,observation:0,publication:0,dispatch:0});
});
it('rejects entry and post-binding copies/foreign owners/revoked Proxies without hooks or foreign writes',()=>{
  expect(verifyRuntimeIdentity(emitted(),createNativeDiagnosticState)).toEqual({entries:32,post:30,hooks:0});
});
it('retains every allocation/freeze prefix, first failure and the stopped run/cleanup distinction',()=>{
  expect(verifyRuntimePrefixes(emitted(),createNativeDiagnosticState)).toEqual({prefixes:14,stops:2});
});
it('rejects all live descriptor/prototype changes without invoking getter hooks or re-pinning',()=>{
  expect(verifyRuntimeDrifts(emitted(),createNativeDiagnosticState)).toEqual({refusals:16,hooks:0});
});

it('stops at the retained identity on synchronous cancellation without allocating the pin or losing the prefix',()=>{
  const a=deriveRuntimePin(faultRuntimePin(emitted(),'run','stop_identity'),createNativeDiagnosticState)();expect(a.run()).toBe(false);
  expect(a.runSlot.position).toBe('identity');expect(a.runSlot.pending.identity).not.toBeNull();expect(a.runSlot.pending.pin).toBeNull();
  expect(a.runSlot.faultAt).toBe('identity');expect(a.flags().primary).toBe('cancelled');expect(a.flags().revoked).toBe(true);
});

it('retains the original shell and revokes its preparation on a duplicate request without regeneration',()=>{
  const a=deriveRuntimePin(emitted(),createNativeDiagnosticState)();expect(a.run()).toBe(true);
  const shell=a.runSlot.pending,pin=shell.pin;expect(a.run()).toBe(false);
  expect(a.runSlot.pending).toBe(shell);expect(shell.pin).toBe(pin);expect(shell.readiness).toBe('failed_retained');
  expect(a.runSlot.claimed).toBe(true);expect(a.flags().revoked).toBe(true);
});
