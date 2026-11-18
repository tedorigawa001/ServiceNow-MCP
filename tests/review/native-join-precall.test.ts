import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {createNativeDiagnosticState} from '../../src/review/abort-scope-evidence-native-diagnostic-state.js';
import {verifyPrecallInitial,verifyPrecallOnce,verifyPrecallSlots,verifyPrecallOrigins,verifyPrecallReentry,verifyPrecallMetadata,
  auditPrecall,precallMutants,verifyPrecallMutant,verifyPrecallCustody,verifyPrecallAuditNegatives,end} from './fixtures/native-join-precall-model.mjs';

const source=()=>readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic.ts',import.meta.url),'utf8');
let js:string|undefined;
const emitted=()=>js??=ts.transpileModule(source(),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
it('retains prior one-shot refusal diagnostics before safe same-owner slot and cold metadata failure writes',()=>{
  expect(verifyPrecallInitial(emitted(),createNativeDiagnosticState)).toEqual({roles:2});
});
it('never retries reflection or changes another role after a refused attempt, even if conditions recover',()=>{
  expect(verifyPrecallOnce(emitted(),createNativeDiagnosticState)).toEqual({cases:2,descriptors:10});
});
it('retains lexical refusal and canonical references without unsafe writes when slot data is malformed or reflection throws',()=>{
  expect(verifyPrecallSlots(emitted(),createNativeDiagnosticState)).toEqual({cases:36,hooks:0});
});
it('compares raw references without foreign hooks and never borrows another owner or same-value copy',()=>{
  expect(verifyPrecallOrigins(emitted(),createNativeDiagnosticState)).toEqual({cases:34,hooks:0});
});
it('keeps only the outer frame busy and preserves the first refusal through reentry at every reflection boundary',()=>{
  expect(verifyPrecallReentry(emitted(),createNativeDiagnosticState)).toEqual({cases:2,reentries:10});
});
it('keeps optional metadata failures separate from the primitive slot fault without hooks or replacement custody',()=>{
  expect(verifyPrecallMetadata(emitted(),createNativeDiagnosticState)).toEqual({cases:20,hooks:0});
});
it('has eight prior primitive scalars, three minimal descriptor probes, no operational writer and no entry caller',()=>{
  expect(auditPrecall(emitted())).toEqual({scalars:8,descriptors:3,writableGuards:3,entryCallers:0});
  expect(verifyPrecallAuditNegatives(emitted())).toBe(6);
});
it('preserves prior faults and sealed upper custody while all field acquisition and operational claims remain disconnected',()=>{
  expect(verifyPrecallCustody(emitted(),createNativeDiagnosticState)).toEqual({cases:135,hooks:0});
});
it.each(precallMutants.map((m:unknown[],i:number)=>[m[0],i]))('detects %s mutation without enabling constructor or alias supply',(_name,i)=>{
  verifyPrecallMutant(emitted(),createNativeDiagnosticState,i as number);
});
it('keeps checks finite and the private request literal-false without adding an acceptance variant',()=>{
  const text=source(),name=fileURLToPath(new URL('../../src/review/__precall_types.ts',import.meta.url));
  const positive="const closedPrecall:false=requestJoinPrecall(null,null,null,null,'run');void closedPrecall;";
  const bad=["const bad:JoinPrecallCheck='accepted';","const bad:JoinGenerationFault='cancelled';",
    "const bad:true=requestJoinPrecall(null,null,null,null,'cleanup');"];
  const input=text.replace(end,positive+'\n'+bad.map(v=>'{'+v+'}').join('\n')+'\n'+end);
  const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,skipLibCheck:true};
  const host=ts.createCompilerHost(options),get=host.getSourceFile;host.getSourceFile=(file,language,...rest)=>file===name?ts.createSourceFile(file,input,language,true):get(file,language,...rest);
  const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram([name],options,host));expect(diagnostics).toHaveLength(bad.length);
  expect(diagnostics.every(d=>d.file?.fileName===name&&d.code===2322)).toBe(true);
  for(const code of bad){const start=input.indexOf('{'+code+'}');expect(diagnostics.filter(d=>d.start!==undefined&&d.start>=start&&d.start<start+code.length+2)).toHaveLength(1);}
});
