import { expect, it, vi } from 'vitest';
import { bp5RuleIdSchema } from '../../src/review/result-schema-v2.js';
import { normalizeScopeToken, createScopeEvidenceContext, createPayloadScopeEvidence, createTableScopeObservation,
  compareScopeEvidence, SCOPE_EVIDENCE_LIMITATIONS, type ScopeEvidenceContext, type PayloadScopeEvidence,
  type TableScopeObservation } from '../../src/review/abort-scope-evidence.js';

const id='1'.repeat(32), a='a'.repeat(32), b='b'.repeat(32);
const binding=()=>({instance_binding:'c'.repeat(64),update_set_sys_id:'2'.repeat(32),update_xml_sys_id:'3'.repeat(32),
  asset_sys_id:id,payload_hash:'d'.repeat(64),code_hash:'e'.repeat(64),started_at:'2026-10-25T00:00:00Z',deadline_ms:60000});
function unwrap<T>(value:{ok:true;value:T}|{ok:false;reason:string}):T {
  expect(value.ok).toBe(true);if(!value.ok)throw Error(value.reason);return value.value;
}
const context=()=>unwrap(createScopeEvidenceContext(binding()));
const payloadRaw=(scope:unknown)=>({source:'sys_update_xml.payload',target_version:'update_set_payload',asset_table:'sys_script',
  asset_sys_id:id,payload_hash:'d'.repeat(64),code_hash:'e'.repeat(64),retrieved_at:'2026-10-25T00:00:01Z',collection:'incident',sys_scope:scope});
const row=(scope:unknown)=>({sys_id:'4'.repeat(32),name:'incident',sys_scope:scope,sys_updated_on:'2026-10-24 00:00:00',sys_mod_count:'0'});
const obsRaw=(scope:unknown,phase:'initial'|'final')=>({source:'sys_db_object.current',visibility_scope:'caller_acl',
  phase,observed_at:phase==='initial'?'2026-10-25T00:00:02Z':'2026-10-25T00:00:03Z',state:'rows',rows:[row(scope)]});
function setup(...scopes:unknown[]) {
  const scope=scopes.length?scopes[0]:'global',tableScope=scopes.length>1?scopes[1]:scope;
  const c=context(),p=unwrap(createPayloadScopeEvidence(c,payloadRaw(scope)));
  const initial=unwrap(createTableScopeObservation(c,obsRaw(tableScope,'initial')));
  const final=unwrap(createTableScopeObservation(c,obsRaw(tableScope,'final')));
  return {c,p,initial,final,run:()=>compareScopeEvidence(c,p,initial,final,'2026-10-25T00:00:04Z')};
}

it('does not normalize a display name or missing value into Global', () => {
  expect(normalizeScopeToken('global')).toEqual({kind:'global_literal'});
  for(const value of [undefined,null,'','Global',' global','global ',{}, {display_value:'Global',value:'global'}]) {
    expect(normalizeScopeToken(value).kind).toBe('unknown');
  }
});
it.each([[a,a,'same_reference'],[a,b,'different_reference'],['global','global','same_literal']])('compares identity only: %s / %s', (left,right,comparison) => {
  const x=setup(left,right),out=x.run();
  expect(out).toMatchObject({status:'compared',comparison,temporal_relation:'payload_vs_current_declared_table',reason:null});
  expect(out.limitations).toEqual(SCOPE_EVIDENCE_LIMITATIONS);
  expect(out.limitations).toContain('payload_time_scope_not_reconstructed');
  expect(out.limitations).toContain('abort_effect_not_verified');
  expect(x.run()).toEqual(out); // Pure: comparison is repeatable, not a consumption/authorization operation.
});
it.each([['global',a],[a,'global']])('does not infer a Global alias in either direction: %s / %s', (left,right) => {
  expect(setup(left,right).run()).toMatchObject({status:'insufficient',comparison:'unknown',reason:'global_alias_unproven'});
});
it.each([undefined,null,'','Global',' global','F'.repeat(32),'g'.repeat(32),{value:'global'},[]])('keeps absent/invalid scope evidence unknown: %j', scope => {
  for(const out of [setup(scope,'global').run(),setup('global',scope).run()])
    expect(out).toMatchObject({status:'insufficient',comparison:'unknown',reason:'scope_missing_or_invalid'});
});
it('does not interpret collection=global as a Global scope or a specific table', () => {
  const x=setup();const p=unwrap(createPayloadScopeEvidence(x.c,{...payloadRaw('global'),collection:'global'}));
  expect(compareScopeEvidence(x.c,p,x.initial,x.final,'2026-10-25T00:00:04Z')).toMatchObject({status:'insufficient',reason:'global_table_target_unknown'});
});
it.each([null,undefined,'','incident^ORactive=true','Incident',123])('does not infer a missing/invalid declared table: %j', collection => {
  const x=setup(),p=unwrap(createPayloadScopeEvidence(x.c,{...payloadRaw('global'),collection}));
  expect(compareScopeEvidence(x.c,p,x.initial,x.final,'2026-10-25T00:00:04Z')).toMatchObject({status:'insufficient',reason:'declared_table_unknown'});
});
it.each(['payload','initial','final'])('rejects another context even with identical scalar bindings: %s', which => {
  const x=setup(),y=setup();
  expect(compareScopeEvidence(x.c,which==='payload'?y.p:x.p,which==='initial'?y.initial:x.initial,which==='final'?y.final:x.final,
    '2026-10-25T00:00:04Z')).toMatchObject({status:'rejected',comparison:'unknown',reason:'evidence_binding_mismatch'});
});
it.each(['context','payload','observation'])('rejects copied/forged opaque handles: %s', kind => {
  const x=setup();
  expect(compareScopeEvidence(kind==='context'?structuredClone(x.c):x.c,kind==='payload'?structuredClone(x.p):x.p,
    kind==='observation'?structuredClone(x.initial):x.initial,x.final,'2026-10-25T00:00:04Z'))
    .toMatchObject({status:'rejected',reason:'invalid_evidence'});
});
it('does not accept arbitrary or extra context/issuer claims', () => {
  expect(createScopeEvidenceContext({...binding(),deadline_ms:60001})).toMatchObject({ok:false,reason:'invalid_context'});
  expect(createScopeEvidenceContext({...binding(),approved:true})).toMatchObject({ok:false,reason:'invalid_context'});
  expect(createScopeEvidenceContext({...binding(),instance_binding:'https://PRIVATE_INVALID'})).toMatchObject({ok:false,reason:'invalid_context'});
  expect(createPayloadScopeEvidence({} as ScopeEvidenceContext,payloadRaw('global'))).toMatchObject({ok:false,reason:'invalid_context'});
});
it.each(['asset_sys_id','payload_hash','code_hash'])('checks payload binding: %s', key => {
  expect(createPayloadScopeEvidence(context(),{...payloadRaw('global'),[key]:key==='asset_sys_id'?a:'f'.repeat(64)}))
    .toMatchObject({ok:false,reason:'evidence_binding_mismatch'});
});
it('rejects current-record/wrong-source evidence instead of replacing the payload', () => {
  const c=context();
  expect(createPayloadScopeEvidence(c,{...payloadRaw('global'),target_version:'current_record'})).toMatchObject({ok:false});
  expect(createPayloadScopeEvidence(c,{...payloadRaw('global'),source:'sys_script.current'})).toMatchObject({ok:false});
  expect(createTableScopeObservation(c,{...obsRaw('global','initial'),source:'sys_update_xml.payload'})).toMatchObject({ok:false});
});
it.each(['sys_id','sys_scope','sys_updated_on','sys_mod_count'])('detects changes even if other fields are stable: %s', key => {
  const x=setup(a,a),raw=obsRaw(a,'final');
  raw.rows[0]={...raw.rows[0],[key]:key==='sys_mod_count'?'1':key==='sys_updated_on'?'2026-10-24 00:00:01':b};
  const final=unwrap(createTableScopeObservation(x.c,raw));
  expect(compareScopeEvidence(x.c,x.p,x.initial,final,'2026-10-25T00:00:04Z')).toMatchObject({status:'changed',comparison:'unknown',reason:'table_changed'});
});
it.each(['initial','final'])('rejects the wrong table binding in either observation: %s', phase => {
  const x=setup();const raw=obsRaw('global',phase as 'initial'|'final');raw.rows[0].name='u_private_other_table';
  const obs=unwrap(createTableScopeObservation(x.c,raw));
  expect(compareScopeEvidence(x.c,x.p,phase==='initial'?obs:x.initial,phase==='final'?obs:x.final,'2026-10-25T00:00:04Z'))
    .toMatchObject({status:'rejected',comparison:'unknown',reason:'table_binding_mismatch'});
});
it.each([
  [[], 'not_found_or_not_visible'],[[row('global'),row('global')],'ambiguous_table'],
  [[{}],'field_unavailable'],[[42],'invalid_observation'],[Array(100000),'invalid_observation'],
])('keeps missing/ambiguous/bounded rows as unavailable', (rows,reason) => {
  const x=setup(),initial=unwrap(createTableScopeObservation(x.c,{...obsRaw('global','initial'),rows}));
  expect(compareScopeEvidence(x.c,x.p,initial,x.final,'2026-10-25T00:00:04Z'))
    .toMatchObject({status:'insufficient',comparison:'unknown',reason:'initial_evidence_unavailable',unavailable_reason:reason});
});
it('retains final recheck failure, not a comparison based on the first snapshot alone', () => {
  const x=setup(a,b),raw={...obsRaw(b,'final'),state:'unavailable',reason:'final_recheck_unavailable'};
  const unavailable:Record<string,unknown>={...raw};delete unavailable.rows;
  const final=unwrap(createTableScopeObservation(x.c,unavailable));
  expect(compareScopeEvidence(x.c,x.p,x.initial,final,'2026-10-25T00:00:04Z'))
    .toMatchObject({status:'insufficient',comparison:'unknown',reason:'final_evidence_unavailable',evidence_phase:'final',unavailable_reason:'final_recheck_unavailable'});
});
it('does not downgrade a terminal authentication/ACL error to unavailable evidence', () => {
  for(const reason of ['access_denied','authentication_failed','deadline_exceeded','cancelled']) {
    const raw:Record<string,unknown>={...obsRaw('global','initial')};delete raw.rows;
    expect(createTableScopeObservation(context(),{...raw,state:'unavailable',reason})).toMatchObject({ok:false,reason:'invalid_observation'});
  }
});
it('requires initial then final observations', () => {
  const x=setup();expect(compareScopeEvidence(x.c,x.p,x.final,x.initial,'2026-10-25T00:00:04Z'))
    .toMatchObject({status:'rejected',reason:'invalid_phase_order'});
});
it.each(['2026-10-24T23:59:59Z','2026-10-25T00:00:02Z','not-a-date'])('rejects comparison before observations/invalid time: %s', at => {
  expect(setup().run().status).toBe('compared');const x=setup();
  expect(compareScopeEvidence(x.c,x.p,x.initial,x.final,at)).toMatchObject({status:'rejected',reason:'invalid_observation_time'});
});
it('enforces the 60-second boundary in supplied timestamps without pretending to own a clock', () => {
  const x=setup();
  expect(compareScopeEvidence(x.c,x.p,x.initial,x.final,'2026-10-25T00:00:59.999Z').status).toBe('compared');
  for(const at of ['2026-10-25T00:01:00Z','2026-10-25T00:01:01Z'])
    expect(compareScopeEvidence(x.c,x.p,x.initial,x.final,at)).toMatchObject({status:'rejected',reason:'comparison_deadline_exceeded'});
});
it('honors a lower caller-owned deadline without extending the ceiling', () => {
  const c=unwrap(createScopeEvidenceContext({...binding(),deadline_ms:4000}));
  const p=unwrap(createPayloadScopeEvidence(c,payloadRaw('global')));
  const first=unwrap(createTableScopeObservation(c,obsRaw('global','initial'))),last=unwrap(createTableScopeObservation(c,obsRaw('global','final')));
  expect(compareScopeEvidence(c,p,first,last,'2026-10-25T00:00:03.999Z').status).toBe('compared');
  expect(compareScopeEvidence(c,p,first,last,'2026-10-25T00:00:04Z')).toMatchObject({status:'rejected',reason:'comparison_deadline_exceeded'});
});
it('does not call two missing field-ACL scope values equal', () => {
  const x=setup();const first=obsRaw('global','initial'),last=obsRaw('global','final');
  delete (first.rows[0] as Record<string,unknown>).sys_scope;delete (last.rows[0] as Record<string,unknown>).sys_scope;
  expect(compareScopeEvidence(x.c,x.p,unwrap(createTableScopeObservation(x.c,first)),unwrap(createTableScopeObservation(x.c,last)),
    '2026-10-25T00:00:04Z')).toMatchObject({status:'insufficient',comparison:'unknown',reason:'scope_missing_or_invalid'});
});
it('allows a same-run initial table observation before a later payload but requires final recheck after both', () => {
  const x=setup(),p=unwrap(createPayloadScopeEvidence(x.c,{...payloadRaw('global'),retrieved_at:'2026-10-25T00:00:02.500Z'}));
  expect(compareScopeEvidence(x.c,p,x.initial,x.final,'2026-10-25T00:00:04Z').status).toBe('compared');
  const late=unwrap(createPayloadScopeEvidence(x.c,{...payloadRaw('global'),retrieved_at:'2026-10-25T00:00:03.500Z'}));
  expect(compareScopeEvidence(x.c,late,x.initial,x.final,'2026-10-25T00:00:04Z')).toMatchObject({status:'rejected',reason:'invalid_observation_time'});
});
it('snapshots inputs, freezes output and never serializes table/extra scope/raw invalid values', () => {
  const c=context(),raw=payloadRaw(a),initialRaw=obsRaw(b,'initial'),finalRaw=obsRaw(b,'final');
  const p=unwrap(createPayloadScopeEvidence(c,raw)),initial=unwrap(createTableScopeObservation(c,initialRaw)),final=unwrap(createTableScopeObservation(c,finalRaw));
  raw.sys_scope=b;initialRaw.rows[0].sys_scope=a;
  const out=compareScopeEvidence(c,p,initial,final,'2026-10-25T00:00:04Z');
  expect(out.comparison).toBe('different_reference');expect(Object.isFrozen(out)).toBe(true);expect(Object.isFrozen(out.limitations)).toBe(true);
  expect(JSON.stringify([c,p,initial,final])).toBe('[{},{},{},{}]');
  expect(JSON.stringify(out)).not.toMatch(new RegExp(`incident|${a}|${b}`));
  expect(compareScopeEvidence(c,{} as PayloadScopeEvidence,initial,{} as TableScopeObservation,'PRIVATE_SECRET'))
    .toMatchObject({status:'rejected',reason:'invalid_evidence'});
});
it('does not register BR-006 or perform I/O/timers/clock reads', () => {
  const fetcher=vi.fn(()=>{throw Error('Unexpected network');});
  vi.stubGlobal('fetch',fetcher);
  const now=vi.spyOn(Date,'now').mockImplementation(()=>{throw Error('Unexpected clock');});
  const timer=vi.spyOn(globalThis,'setTimeout').mockImplementation(()=>{throw Error('Unexpected timer');});
  try {
    expect(setup(a,b).run().comparison).toBe('different_reference');
    expect(fetcher).not.toHaveBeenCalled();expect(now).not.toHaveBeenCalled();expect(timer).not.toHaveBeenCalled();
    expect(bp5RuleIdSchema.safeParse('AU-BR-006').success).toBe(false);expect(bp5RuleIdSchema.options).toHaveLength(14);
  } finally { vi.restoreAllMocks();vi.unstubAllGlobals(); }
});
