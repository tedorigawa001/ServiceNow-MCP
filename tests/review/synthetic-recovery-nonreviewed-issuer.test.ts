import {expect,it} from 'vitest';
import {createSyntheticNonReviewedIssuer,NonReviewedIssuerError,type NonReviewedJob,type NonReviewedAttempt,type RetrievedTerminal} from '../support/review/synthetic-recovery-nonreviewed-issuer.js';
const id=(n:number)=>n.toString(16).padStart(32,'0');
function row(producer='metadata',n=1){return {producer,sys_id:id(n),name:producer==='metadata'?'sys_dictionary_task_name':`sys_script_${id(n)}`,action:'INSERT_OR_UPDATE',...(producer==='analysis'?{retrieved_at:'2026-11-03T00:00:01.000Z'}:{})};}
function config(rows=[row()]){return {kind:'synthetic_nonreviewed_issuer_v1',schema_version:'bp-mcp-review-0.2',requested_rule_ids:['AU-BR-001'],rows};}
it('issues metadata only from its fixed row classification, without creating an input or job',()=>{
  const root=createSyntheticNonReviewedIssuer(config(),{guard:()=>undefined}),handle=root.issueClassified(root.rows[0]);
  expect(Reflect.ownKeys(handle)).toEqual([]);expect(root.summary()).toMatchObject({authority:'none',issued:{metadata:1,retrieval:0,analysis:0},pending_evidence:1,inputs:0,jobs:0});
  root.discardEvidence(handle);expect(root.summary().pending_evidence).toBe(0);
});
it('requires the same retrieval input/attempt and confirmed synthetic cleanup before issuing once',()=>{
  const root=createSyntheticNonReviewedIssuer(config([row('retrieval')]),{guard:()=>undefined}),r=root.rows[0],t=root.beginRetrieval(r);
  const terminal=root.settleRetrieval(r,t.input,t.attempt,{kind:'error',code:'not_found_or_not_visible',cleanup:'confirmed'});
  const evidence=root.issueRetrieved(r,t.input,t.attempt,terminal);
  expect(Reflect.ownKeys(evidence)).toEqual([]);expect(root.summary()).toMatchObject({issued:{retrieval:1},inputs:1,jobs:0,cleanup_pending:0});
});
it('issues an original omitted result only from the same analysis job and bounded response',()=>{
  const root=createSyntheticNonReviewedIssuer(config([row('analysis')]),{guard:()=>undefined}),r=root.rows[0],t=root.beginAnalysis(r);
  const wire=root.deliverAnalysis(r,t.input,t.job,{id:t.id,ok:true,json:JSON.stringify({state:'result_omitted',update_xml_sys_id:id(1),reason:'response_limit'})});
  const handle=root.issueAnalyzed(r,t.input,t.job,wire);
  expect(Reflect.ownKeys(handle)).toEqual([]);expect(root.summary()).toMatchObject({issued:{analysis:1},inputs:1,jobs:1,pending_deliveries:0});
});
it('reports only fixed scalar outcome counts, not private state/row data',()=>{
  const root=createSyntheticNonReviewedIssuer(config(),{guard:()=>undefined});root.issueClassified(root.rows[0]);
  expect(root.summary()).toMatchObject({outcome_states:{not_applicable:1,rejected:0}});expect(JSON.stringify(root.summary())).not.toContain(id(1));
});
type Root=ReturnType<typeof createSyntheticNonReviewedIssuer>;
function fail(fn:()=>unknown,reason?:string,code='internal_review_error'){
  let e:unknown;try{fn();}catch(error){e=error;}expect(e).toBeInstanceOf(NonReviewedIssuerError);expect(e).toMatchObject({code,message:code,...(reason?{reason}:{})});expect(e).not.toHaveProperty('cause');
}
function analysis(n=1){const root=createSyntheticNonReviewedIssuer(config([row('analysis',n)]),{guard:()=>{}}),r=root.rows[0],t=root.beginAnalysis(r);return {root,r,t};}
function envelope(n=1,idValue=1){return {id:idValue,ok:true,json:JSON.stringify({state:'rejected',update_xml_sys_id:id(n),reason:'invalid_xml'})};}
function retrieval(){const root=createSyntheticNonReviewedIssuer(config([row('retrieval')]),{guard:()=>{}}),r=root.rows[0],t=root.beginRetrieval(r);return {root,r,t};}
it.each([
  ['DELETE','sys_script_'+id(1),'skipped_deleted','deleted_asset'],['UNKNOWN','sys_dictionary_task_name','rejected','unsupported_action'],
  ['INSERT_OR_UPDATE','sys_script_bad','rejected','identity_mismatch'],['INSERT_OR_UPDATE','sys_choice_task_state','not_applicable','asset_type_unsupported'],
  ['INSERT_OR_UPDATE','sys_script_include_'+id(1),'not_applicable','asset_type_unsupported'],['INSERT_OR_UPDATE','sys_script_client_'+id(1),'not_applicable','no_requested_rules'],
])('classifies %s/%s as %s without accepting caller-supplied outcomes',(action,name,state,reason)=>{
  const root=createSyntheticNonReviewedIssuer(config([{...row(),action,name}]),{guard:()=>{}});root.issueClassified(root.rows[0]);expect(root.summary().outcome_states[state as keyof ReturnType<Root['summary']>['outcome_states']]).toBe(1);expect(root.summary().outcome_reasons[reason]).toBe(1);
});
it.each(['not_found_or_not_visible','invalid_response','changed_during_review','payload_limit'])('issues the fixed retrieval mapping for %s',code=>{
  const f=retrieval(),terminal=f.root.settleRetrieval(f.r,f.t.input,f.t.attempt,{kind:'error',code,cleanup:'confirmed'});f.root.issueRetrieved(f.r,f.t.input,f.t.attempt,terminal);
  expect(f.root.summary().outcome_states[code==='payload_limit'?'rejected':'retrieval_failed']).toBe(1);
});
it('supports invalid timestamp only as a fixed retrieval validation event',()=>{
  const f=retrieval(),terminal=f.root.settleRetrieval(f.r,f.t.input,f.t.attempt,{kind:'invalid_timestamp',cleanup:'confirmed'});f.root.issueRetrieved(f.r,f.t.input,f.t.attempt,terminal);expect(f.root.summary().issued.retrieval).toBe(1);
});
it.each(['row','input','attempt','terminal'] as const)('rejects retrieval %s mixing without mutating the other owner',field=>{
  const a=retrieval(),b=retrieval(),ta=a.root.settleRetrieval(a.r,a.t.input,a.t.attempt,{kind:'error',code:'payload_limit',cleanup:'confirmed'}),tb=b.root.settleRetrieval(b.r,b.t.input,b.t.attempt,{kind:'error',code:'payload_limit',cleanup:'confirmed'}),before=b.root.summary();
  fail(()=>a.root.issueRetrieved(field==='row'?b.r:a.r,field==='input'?b.t.input:a.t.input,field==='attempt'?b.t.attempt:a.t.attempt,field==='terminal'?tb:ta),'binding');expect(b.root.summary()).toEqual(before);expect(a.root.summary().pending_evidence).toBe(0);
});
it.each(['row','input','job','delivery'] as const)('rejects analysis %s mixing without mutating the other owner',field=>{
  const a=analysis(),b=analysis(),wa=a.root.deliverAnalysis(a.r,a.t.input,a.t.job,envelope()),wb=b.root.deliverAnalysis(b.r,b.t.input,b.t.job,envelope()),before=b.root.summary();
  fail(()=>a.root.issueAnalyzed(field==='row'?b.r:a.r,field==='input'?b.t.input:a.t.input,field==='job'?b.t.job:a.t.job,field==='delivery'?wb:wa),'binding');expect(b.root.summary()).toEqual(before);
});
it('does not accept copies of an empty row, ticket or delivery as the same identity',()=>{
  const f=analysis(),wire=f.root.deliverAnalysis(f.r,f.t.input,f.t.job,envelope());fail(()=>f.root.issueAnalyzed(f.r,f.t.input,f.t.job,{...wire}),'binding');
  const g=analysis();fail(()=>g.root.deliverAnalysis(g.r,{...g.t.input},g.t.job,envelope()),'binding');
});
it('distinguishes jobs in the same root and correlates their IDs before storing a delivery',()=>{
  const root=createSyntheticNonReviewedIssuer(config([row('analysis',1),row('analysis',2)]),{guard:()=>{}}),a=root.beginAnalysis(root.rows[0]),b=root.beginAnalysis(root.rows[1]);
  expect([a.id,b.id]).toEqual([1,2]);fail(()=>root.deliverAnalysis(root.rows[1],b.input,a.job,envelope(2,2)),'binding');
  const f=analysis();fail(()=>f.root.deliverAnalysis(f.r,f.t.input,f.t.job,envelope(1,2)),'binding');
});
it.each(['metadata','retrieval','analysis'])('has a separate producer claim for %s',producer=>{
  const root=createSyntheticNonReviewedIssuer(config([row(producer)]),{guard:()=>{}}),r=root.rows[0];
  if(producer==='metadata')fail(()=>root.beginAnalysis(r),'producer');else fail(()=>root.issueClassified(r),'producer');
  expect(root.summary().pending_evidence).toBe(0);
});
it.each(['metadata_issue','retrieval_begin','retrieval_settle','retrieval_issue','analysis_begin','analysis_delivery','analysis_issue'])('stops at both guards for %s, consumes its claim, and keeps no unpublished evidence',op=>{
  for(const phase of ['pre','post'] as const){
    let armed=false;const producer=op.startsWith('metadata')?'metadata':op.startsWith('retrieval')?'retrieval':'analysis';
    const root=createSyntheticNonReviewedIssuer(config([row(producer)]),{guard:(operation,p)=>armed&&operation===op&&p===phase?'cancelled':undefined}),r=root.rows[0];let operation:()=>unknown;
    if(op==='metadata_issue')operation=()=>root.issueClassified(r);
    else if(op==='retrieval_begin')operation=()=>root.beginRetrieval(r);
    else if(op==='analysis_begin')operation=()=>root.beginAnalysis(r);
    else if(producer==='retrieval'){
      const t=root.beginRetrieval(r);if(op==='retrieval_settle')operation=()=>root.settleRetrieval(r,t.input,t.attempt,{kind:'error',code:'payload_limit',cleanup:'confirmed'});
      else{const terminal=root.settleRetrieval(r,t.input,t.attempt,{kind:'error',code:'payload_limit',cleanup:'confirmed'});operation=()=>root.issueRetrieved(r,t.input,t.attempt,terminal);}
    }else{const t=root.beginAnalysis(r);if(op==='analysis_delivery')operation=()=>root.deliverAnalysis(r,t.input,t.job,envelope());else{const w=root.deliverAnalysis(r,t.input,t.job,envelope());operation=()=>root.issueAnalyzed(r,t.input,t.job,w);}}
    armed=true;fail(operation,undefined,'cancelled');fail(operation,undefined,'cancelled');expect(root.summary()).toMatchObject({state:'failed',pending_evidence:0,pending_terminals:0,pending_deliveries:0});
  }
});
it('keeps post-guard deadline priority over a bad same-row job and permits only diagnostic late cleanup',()=>{
  let armed=false,n=0;const root=createSyntheticNonReviewedIssuer(config([row('retrieval')]),{guard:(op)=>armed&&op==='retrieval_settle'&&++n===2?'deadline_exceeded':undefined}),r=root.rows[0],t=root.beginRetrieval(r);
  armed=true;fail(()=>root.settleRetrieval(r,t.input,{} as NonReviewedAttempt,{kind:'error',code:'payload_limit',cleanup:'confirmed'}),undefined,'deadline_exceeded');
  root.recordCleanup(t.cleanup,'confirmed');expect(root.summary()).toMatchObject({state:'failed',cleanup_pending:0,pending_evidence:0});fail(()=>root.issueRetrieved(r,t.input,t.attempt,{} as RetrievedTerminal),'stopped','deadline_exceeded');
});
it.each(['pre','post'] as const)('does not publish a response or outcome before the %s issue guard',phase=>{
  let root:Root;root=createSyntheticNonReviewedIssuer(config([row('analysis')]),{guard:(op,p)=>{if(op==='analysis_issue'&&p===phase)expect(root.summary()).toMatchObject({pending_evidence:0,pending_deliveries:0});}});
  const r=root.rows[0],t=root.beginAnalysis(r),w=root.deliverAnalysis(r,t.input,t.job,envelope());root.issueAnalyzed(r,t.input,t.job,w);
});
it.each(['pre','post'] as const)('keeps swallowed reentry at %s sticky',phase=>{
  let root:Root;root=createSyntheticNonReviewedIssuer(config(),{guard:(_op,p)=>{if(p===phase)try{root.issueClassified(root.rows[0]);}catch{/* must not restore healthy state */}}});
  fail(()=>root.issueClassified(root.rows[0]),'reentrant');expect(root.summary().pending_evidence).toBe(0);
});
it('does not issue on cleanup unconfirmed and cannot revive the attempt through a later confirmed event',()=>{
  const f=retrieval();fail(()=>f.root.settleRetrieval(f.r,f.t.input,f.t.attempt,{kind:'error',code:'payload_limit',cleanup:'unconfirmed'}),'cleanup');
  fail(()=>f.root.recordCleanup(f.t.cleanup,'confirmed'),'cleanup');expect(f.root.summary()).toMatchObject({cleanup_unconfirmed:1,pending_evidence:0});
});
it('does not use a cleanup-only diagnostic as a retrieval terminal',()=>{
  const f=retrieval();f.root.recordCleanup(f.t.cleanup,'confirmed');fail(()=>f.root.issueRetrieved(f.r,f.t.input,f.t.attempt,f.t.cleanup as unknown as RetrievedTerminal),'binding');
});
it.each(['begin','settle','issue','discard'] as const)('refuses duplicate retrieval %s',op=>{
  const f=retrieval();if(op==='begin')fail(()=>f.root.beginRetrieval(f.r),'duplicate');else{
    const e={kind:'error',code:'payload_limit',cleanup:'confirmed'},terminal=f.root.settleRetrieval(f.r,f.t.input,f.t.attempt,e);
    if(op==='settle')fail(()=>f.root.settleRetrieval(f.r,f.t.input,f.t.attempt,e),'duplicate');else{const h=f.root.issueRetrieved(f.r,f.t.input,f.t.attempt,terminal);if(op==='issue')fail(()=>f.root.issueRetrieved(f.r,f.t.input,f.t.attempt,terminal),'duplicate');else{f.root.discardEvidence(h);fail(()=>f.root.discardEvidence(h),'binding');}}
  }expect(f.root.summary().pending_evidence).toBe(0);
});
it.each(['begin','delivery','issue'] as const)('refuses duplicate analysis %s',op=>{
  const f=analysis();if(op==='begin')fail(()=>f.root.beginAnalysis(f.r),'duplicate');else{const w=f.root.deliverAnalysis(f.r,f.t.input,f.t.job,envelope());if(op==='delivery')fail(()=>f.root.deliverAnalysis(f.r,f.t.input,f.t.job,envelope()),'duplicate');else{f.root.issueAnalyzed(f.r,f.t.input,f.t.job,w);fail(()=>f.root.issueAnalyzed(f.r,f.t.input,f.t.job,w),'duplicate');}}
});
it('refuses metadata reissue even after its evidence was discarded',()=>{
  const root=createSyntheticNonReviewedIssuer(config(),{guard:()=>{}}),h=root.issueClassified(root.rows[0]);root.discardEvidence(h);fail(()=>root.issueClassified(root.rows[0]),'duplicate');
});
it.each(['not_applicable','retrieval_failed','not_processed','reviewed'])('does not promote a worker %s into analyzed nonreviewed evidence',state=>{
  const f=analysis();let outcome:object={state,update_xml_sys_id:id(1),reason:state==='not_processed'?'deadline_exceeded':'payload_unavailable'};
  if(state==='not_applicable')outcome={state,update_xml_sys_id:id(1),reason:'asset_type_unsupported',asset_type:'other'};
  const w=f.root.deliverAnalysis(f.r,f.t.input,f.t.job,{id:f.t.id,ok:true,json:JSON.stringify(outcome)});fail(()=>f.root.issueAnalyzed(f.r,f.t.input,f.t.job,w));
});
it.each(['unauthorized','upstream_unavailable','authentication_failed','new_code'])('rejects unmapped retrieval event %s rather than accepting a caller state',code=>{
  const f=retrieval();fail(()=>f.root.settleRetrieval(f.r,f.t.input,f.t.attempt,{kind:'error',code,cleanup:'confirmed'}),'shape');
});
it('rejects envelope extensions, duplicate JSON keys, ID changes, and multibyte/wire overflow',()=>{
  for(const json of ['{"state":"rejected","state":"result_omitted"}','x'.repeat(262145),'あ'.repeat(90000),JSON.stringify({state:'rejected',update_xml_sys_id:id(9),reason:'invalid_xml'})]){
    const f=analysis();fail(()=>{const w=f.root.deliverAnalysis(f.r,f.t.input,f.t.job,{id:1,ok:true,json});f.root.issueAnalyzed(f.r,f.t.input,f.t.job,w);});
  }
  const f=analysis();fail(()=>f.root.deliverAnalysis(f.r,f.t.input,f.t.job,{...envelope(),producer:'metadata'}),'shape');
});
it('pins constructor data and guard function without freezing the caller or creating a real lifecycle',()=>{
  const raw=config(),deps={guard:()=>undefined},root=createSyntheticNonReviewedIssuer(raw,deps);raw.rows[0].name='changed secret';deps.guard=()=>{throw Error('secret');};
  expect(Object.isFrozen(raw.rows[0])).toBe(false);root.issueClassified(root.rows[0]);const text=JSON.stringify(root.summary());for(const marker of ['changed secret',id(1),'retrieved_at','receipt'])expect(text).not.toContain(marker);
  expect(root).not.toHaveProperty('transfer');expect(root).not.toHaveProperty('issueParentOmission');
});
it('rejects getter/Proxy config, dependencies and event fields without executing traps',()=>{
  let calls=0;const poison=()=>{calls++;throw Error('secret');};
  for(const raw of [new Proxy({},{get:poison,ownKeys:poison}),Object.defineProperty({},'rows',{get:poison,enumerable:true})])fail(()=>createSyntheticNonReviewedIssuer(raw,{guard:()=>{}}),'shape');
  fail(()=>createSyntheticNonReviewedIssuer(config(),Object.defineProperty({},'guard',{get:poison}) as never),'shape');
  const f=analysis();fail(()=>f.root.deliverAnalysis(f.r,f.t.input,f.t.job,Object.defineProperty({id:1,ok:true},'json',{get:poison,enumerable:true})),'shape');expect(calls).toBe(0);
});
it.each(['duplicates','reversed','zero','over','unknown_producer','metadata_target','analysis_other','extra_job','bad_time'])('rejects constructor %s',kind=>{
  const raw=config();if(kind==='duplicates')raw.rows.push(raw.rows[0]);if(kind==='reversed')raw.rows=[row('metadata',2),row()];if(kind==='zero')raw.rows=[];if(kind==='over')raw.rows=Array.from({length:101},(_,i)=>row('metadata',i+1));
  if(kind==='unknown_producer')raw.rows[0].producer='parent_omission';if(kind==='metadata_target')raw.rows[0].name='sys_script_'+id(1);if(kind==='analysis_other')raw.rows[0].producer='analysis';if(kind==='extra_job')Object.assign(raw.rows[0],{job:{}});if(kind==='bad_time')raw.rows=[{...row('analysis'),retrieved_at:'not-utc'}];
  fail(()=>createSyntheticNonReviewedIssuer(raw,{guard:()=>{}}),'shape');
});
it('handles 100 fixed rows with one producer claim each and no runtime state',()=>{
  const root=createSyntheticNonReviewedIssuer(config(Array.from({length:100},(_,i)=>row('metadata',i+1))),{guard:()=>{}});
  for(const r of root.rows)root.issueClassified(r);expect(root.summary()).toMatchObject({issued:{metadata:100},pending_evidence:100,inputs:0,jobs:0});root.discard();expect(root.summary()).toMatchObject({state:'discarded',pending_evidence:0});
});
it('keeps first hard stop after late cleanup and refuses all healthy reuse',()=>{
  const f=retrieval();fail(()=>f.root.revoke('cancelled'),'stopped','cancelled');f.root.recordCleanup(f.t.cleanup,'confirmed');f.root.discard();fail(()=>f.root.beginRetrieval(f.r),'stopped','cancelled');expect(f.root.summary().cleanup_pending).toBe(0);
});
it('does not confuse nominal attempt/job types',()=>{
  function wrong(a:NonReviewedAttempt){
    // @ts-expect-error Retrieval attempts are not analysis jobs.
    const job:NonReviewedJob=a;return job;
  }void wrong;
});
it('rejects 0.3 deleted classification but preserves post-guard cancellation priority',()=>{
  for(const cancel of [false,true]){
    const raw=config([{...row(),action:'DELETE'}]);raw.schema_version='bp-mcp-review-0.3';
    const root=createSyntheticNonReviewedIssuer(raw,{guard:(op,p)=>cancel&&op==='metadata_issue'&&p==='post'?'cancelled':undefined});
    fail(()=>root.issueClassified(root.rows[0]),undefined,cancel?'cancelled':'internal_review_error');expect(root.summary().pending_evidence).toBe(0);
  }
});
it('keeps fixed budget stop reasons and sanitizes unknown guard exceptions',()=>{
  for(const code of ['receive_budget_exceeded','access_denied','upstream_unavailable'] as const){
    const root=createSyntheticNonReviewedIssuer(config(),{guard:()=>code});fail(()=>root.issueClassified(root.rows[0]),'stopped',code);
  }
  const root=createSyntheticNonReviewedIssuer(config(),{guard:()=>{throw Error('SECRET EXCEPTION');}});fail(()=>root.issueClassified(root.rows[0]),'internal');expect(JSON.stringify(root.summary())).not.toContain('SECRET');
});
it('does not revive after normal discard and late synthetic cleanup completion',()=>{
  const f=retrieval();f.root.discard();f.root.recordCleanup(f.t.cleanup,'confirmed');expect(f.root.summary()).toMatchObject({state:'discarded',cleanup_pending:0,pending_evidence:0});fail(()=>f.root.beginRetrieval(f.r),'state');
});
it('matches a fixed oracle for retrieval reason mapping without exposing evidence values',()=>{
  const oracle={not_found_or_not_visible:'payload_unavailable',invalid_response:'missing_required_field',changed_during_review:'changed_during_review',payload_limit:'payload_limit'};
  for(const [code,reason] of Object.entries(oracle)){
    const f=retrieval(),terminal=f.root.settleRetrieval(f.r,f.t.input,f.t.attempt,{kind:'error',code,cleanup:'confirmed'});f.root.issueRetrieved(f.r,f.t.input,f.t.attempt,terminal);
    expect(f.root.summary()).toMatchObject({outcome_reasons:{[reason]:1}});
  }
});
