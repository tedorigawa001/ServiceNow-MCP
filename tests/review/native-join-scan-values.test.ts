import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {createNativeDiagnosticState} from '../../src/review/abort-scope-evidence-native-diagnostic-state.js';
import {verifyScanInitial,verifyScanIds,verifyScanSchema,verifyScanCounters,verifyScanControlCodes,verifyScanGuards,verifyScanNoHooks,
  auditScanValues,verifyScanAuditNegatives,fieldMutations,verifyScanFieldMutant,scanMutants,verifyScanMutant,verifyScanTotals,verifyScanInitialBoundaries,end} from './fixtures/native-join-scan-values-model.mjs';
const source=()=>readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic.ts',import.meta.url),'utf8');
let js:string|undefined;
const emitted=()=>js??=ts.transpileModule(source(),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
it('retains only six initial scan scalars in the same creator and never lets the old refusal start a scan',()=>{
  expect(verifyScanInitial(emitted(),createNativeDiagnosticState)).toEqual({cases:2,scalars:6});
});
it('rejects each changed initial scalar and recovery reference without restoring or rewriting it',()=>{
  expect(verifyScanInitialBoundaries(emitted(),createNativeDiagnosticState)).toEqual({refused:8});
});
it('keeps counter ranges role-specific and completed prefixes no greater than attempted effects',()=>{
  expect(verifyScanCounters(emitted(),createNativeDiagnosticState)).toEqual({accepted:16,refused:25});
});
it('maps only the nine fixed control reasons and does not infer a field failure cause from its ID',()=>{
  expect(verifyScanControlCodes(emitted(),createNativeDiagnosticState)).toEqual({ids:192,fixed:9});
});
it('inspects the same creator scalars and entry facts without claim, interruption, counter or diagnostic writes',()=>{
  expect(verifyScanGuards(emitted(),createNativeDiagnosticState)).toEqual({accepted:6,refused:42,hooks:0});
});
it('returns the fixed 19-node schema and 131 ordered keys without looking at an owner object or executing a scan',()=>{
  expect(verifyScanSchema(emitted(),createNativeDiagnosticState)).toEqual({columns:133,fields:131,refusals:181});
});
it('matches the role-specific reservation arithmetic without charging or claiming actual probe execution',()=>{
  expect(verifyScanTotals(emitted(),createNativeDiagnosticState)).toEqual({roles:2});
});
it('accepts only the 192 fixed failure IDs and refuses malformed slots, variants and raw hooks',()=>{
  expect(verifyScanIds(emitted(),createNativeDiagnosticState)).toEqual({valid:192,invalid:77,hooks:0});
});
it('never coerces raw references or numeric boxes and does not expose a schema read as owner qualification',()=>{
  expect(verifyScanNoHooks(emitted(),createNativeDiagnosticState)).toEqual({inputs:2,hooks:0});
});
it('has only fixed primitive selectors and readonly guards without native operations, state writers or operational callers',()=>{
  expect(auditScanValues(emitted())).toEqual({scalars:6,ids:192,internalCalls:3,operationalCallers:0});
  expect(verifyScanAuditNegatives(emitted())).toBe(8);
});
it.each(fieldMutations.map((m:unknown[],i:number)=>[m[0]+'/'+m[1],i]))('detects field mapping drift at %s',(_name,i)=>{
  verifyScanFieldMutant(emitted(),createNativeDiagnosticState,i as number);
});
it.each(scanMutants.map((m:unknown[],i:number)=>[m[0],i]))('detects %s mutation while scan remains closed',(_name,i)=>{
  verifyScanMutant(emitted(),createNativeDiagnosticState,i as number);
});
it('keeps field positions, role literals and the initial readonly projection finite at the semantic boundary',()=>{
  const text=source(),name=fileURLToPath(new URL('../../src/review/__scan_value_types.ts',import.meta.url));
  const positive="const a:JoinScanFailureId='N01.D65',b:JoinScanFields['N01'][0]='recovery';const c:JoinScanInitialValue={owner:'none',interrupted:false,runEffects:0,runCompleted:0,cleanupEffects:0,cleanupCompleted:0};const recordKeys:readonly (keyof Record)[]=['anchor','cleanupWork'];const anchorKey:keyof Anchor='binding';void a;void b;void c;void recordKeys;void anchorKey;";
  const bad=["const bad:JoinScanFailureId='N16.D01';","const bad:JoinScanFailureId='N03.keys';","const bad:JoinScanFailureId='N17.frozen';",
    "const bad:JoinScanFailureId='N14.proto';","const bad:JoinScanFailureId='A08';","const bad:JoinScanNode='N20';",
    "const bad:JoinScanFields['N01'][0]='root';","const bad:JoinScanSchemaColumn='accepted';","const bad:JoinScanOwner='accepted';",
    "function bad(s:JoinScanInitialValue){s.runEffects=1;}"];
  const input=text.replace(end,'{'+positive+'}\n'+bad.map(v=>'{'+v+'}').join('\n')+'\n'+end),options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,skipLibCheck:true};
  const host=ts.createCompilerHost(options),get=host.getSourceFile;host.getSourceFile=(file,language,...rest)=>file===name?ts.createSourceFile(file,input,language,true):get(file,language,...rest);
  const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram([name],options,host));
  expect(diagnostics,diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n')).toHaveLength(bad.length);
  expect(diagnostics.map(d=>d.code)).toEqual([2820,2820,2820,2820,2322,2322,2322,2322,2322,2540]);
  expect(diagnostics.every(d=>d.file?.fileName===name)).toBe(true);
  for(const code of bad){const start=input.indexOf('{'+code+'}');expect(diagnostics.filter(d=>d.start!==undefined&&d.start>=start&&d.start<start+code.length+2)).toHaveLength(1);}
});
