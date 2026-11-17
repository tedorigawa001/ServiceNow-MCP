import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createNativeDiagnosticState} from '../../src/review/abort-scope-evidence-native-diagnostic-state.js';
import {verifyUnusedValues,verifyValueStages,verifyOriginLeaf,verifyValueBoundaries,auditExecutionValues,verifyValueAuditNegatives,
  valueMutants,verifyValueMutant,verifyValuesHaveNoAuthority,begin} from './fixtures/native-join-execution-values-model.mjs';
import {fileURLToPath} from 'node:url';

const source=()=>readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic.ts',import.meta.url),'utf8');
let js:string|undefined;
const emitted=()=>js??=ts.transpileModule(source(),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
it('keeps unused values distinct from a consumed constructor claim without changing the values',()=>{
  expect(verifyUnusedValues(emitted(),createNativeDiagnosticState)).toEqual({roles:2});
});
it('validates role-specific acquisition stages and retained failures without adopting or calling their references',()=>{
  expect(verifyValueStages(emitted(),createNativeDiagnosticState)).toEqual({valid:44,refusals:938});
});
it('rejects foreign raw origins first but keeps the same retained origin independent of healthy/live state',()=>{
  expect(verifyOriginLeaf(emitted(),createNativeDiagnosticState)).toEqual({own:6,refusals:41,hooks:0});
});
it('keeps falsey returned references, partial observation custody and fault sites distinct from success',()=>{
  expect(verifyValueBoundaries(emitted(),createNativeDiagnosticState)).toEqual({valid:20,refusals:92});
});
it('has no operational writer, invocation, reflection or raw-origin field access',()=>{
  expect(auditExecutionValues(emitted())).toEqual({calls:2,originCalls:0,writes:0});expect(verifyValueAuditNegatives(emitted())).toBe(6);
});
it.each(valueMutants.map((m:unknown[],i:number)=>[m[0],i]))('detects value/origin %s drift',(_name,index)=>{
  verifyValueMutant(emitted(),createNativeDiagnosticState,index as number);
});
it('has no product callers and keeps all requests/closures closed',()=>{
  const tree=ts.createSourceFile('root.ts',source(),ts.ScriptTarget.Latest,true),calls:string[]=[];
  function visit(n:ts.Node){if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&['joinExecutionOriginLeaf','joinExecutionValuePost'].includes(n.expression.text))calls.push(n.expression.text);ts.forEachChild(n,visit);}
  visit(tree);expect(calls).toEqual([]);
});
it('cannot turn a valid checked value projection into a live request or retained closure capability',()=>{
  expect(verifyValuesHaveNoAuthority(emitted(),createNativeDiagnosticState)).toEqual({requests:2,closures:6});
});
it('separates readonly role/variant values from the unchanged literal-closed live shell',()=>{
  const name=fileURLToPath(new URL('../../src/review/__execution_value_types.ts',import.meta.url));
  const positive=`function valueTypes(v:JoinExecutionValue<'cleanup'>, s:JoinRuntimeShell<'run'>){const r:null=v.reject; const off:false=s.constructorClaim;void r;void off;}\n`;
  const bad=["const bad:JoinExecutionVariant='published';", "function bad(v:JoinExecutionValue<'run'>){v.constructorClaim=true;}",
    "function bad(v:Extract<JoinExecutionValue<'run'>,{variant:'unused'}>){const r:true=v.constructorClaim;void r;}",
    "function bad(v:Extract<JoinExecutionValue<'run'>,{variant:'claimed_pre_call'}>){const r:false=v.constructorClaim;void r;}",
    "function bad(v:Extract<JoinExecutionValue<'cleanup'>,{variant:'capturing'}>){const r:'reject'=v.position;void r;}",
    "function bad(v:JoinRuntimeShell<'run'>){v.constructorState='calling';}",
    "function bad(v:JoinExecutionValue<'cleanup'>){const r:JoinExecutionValue<'run'>=v;void r;}"];
  const input=source().replace(begin,positive+bad.map(v=>'{'+v+'}').join('\n')+'\n'+begin),options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,skipLibCheck:true};
  const host=ts.createCompilerHost(options),get=host.getSourceFile;host.getSourceFile=(file,language,...rest)=>file===name?ts.createSourceFile(file,input,language,true):get(file,language,...rest);
  const errors=ts.getPreEmitDiagnostics(ts.createProgram([name],options,host));expect(errors).toHaveLength(bad.length);
  expect(errors.every(d=>d.file?.fileName===name&&[2322,2540].includes(d.code))).toBe(true);
  for(const code of bad){const start=input.indexOf('{'+code+'}');expect(start).toBeGreaterThan(0);
    expect(errors.filter(d=>d.start!==undefined&&d.start>=start&&d.start<start+code.length+2)).toHaveLength(1);}
});
