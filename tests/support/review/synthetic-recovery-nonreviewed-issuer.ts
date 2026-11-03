/** NR-B fresh synthetic issuers only. Never a runtime registration or manifest admission. */
import {types} from 'node:util';
import {z} from 'zod';
import {RULES} from '../../../src/review/catalog.js';
import {bp5RuleIdsSchema} from '../../../src/review/result-schema-v2.js';
import {projectSyntheticNonReviewedValue,type SyntheticNonReviewedValues} from './synthetic-recovery-nonreviewed-values.js';
import {validateRecoveryAnalysisJson,measureRecoveryFullJson} from './synthetic-recovery-full-json.js';

type Stop='cancelled'|'deadline_exceeded'|'request_budget_exceeded'|'receive_budget_exceeded'|'payload_budget_exceeded'|'authentication_failed'|'access_denied'|'upstream_unavailable';
type Reason='shape'|'binding'|'producer'|'duplicate'|'state'|'context'|'cleanup'|'reentrant'|'stopped'|'internal';
export class NonReviewedIssuerError extends Error{constructor(readonly code:Stop|'internal_review_error',readonly reason:Reason){super(code);}}
declare const rowBrand:unique symbol,classifiedBrand:unique symbol;
declare const inputBrand:unique symbol,attemptBrand:unique symbol,cleanupBrand:unique symbol,terminalBrand:unique symbol,retrievedBrand:unique symbol;
declare const jobBrand:unique symbol,deliveryBrand:unique symbol,analyzedBrand:unique symbol;
export type NonReviewedRow=Readonly<{[rowBrand]:'synthetic_nonreviewed_row'}>;
export type ClassifiedNonReviewed=Readonly<{[classifiedBrand]:'synthetic_classified_nonreviewed'}>;
export type NonReviewedInput=Readonly<{[inputBrand]:'synthetic_nonreviewed_input'}>;
export type NonReviewedAttempt=Readonly<{[attemptBrand]:'synthetic_nonreviewed_attempt'}>;
export type NonReviewedCleanup=Readonly<{[cleanupBrand]:'synthetic_nonreviewed_cleanup'}>;
export type RetrievedTerminal=Readonly<{[terminalBrand]:'synthetic_retrieved_terminal'}>;
export type RetrievedNonReviewed=Readonly<{[retrievedBrand]:'synthetic_retrieved_nonreviewed'}>;
export type NonReviewedJob=Readonly<{[jobBrand]:'synthetic_nonreviewed_job'}>;
export type NonReviewedDelivery=Readonly<{[deliveryBrand]:'synthetic_nonreviewed_delivery'}>;
export type AnalyzedNonReviewed=Readonly<{[analyzedBrand]:'synthetic_analyzed_nonreviewed'}>;
class Mismatch{constructor(readonly reason:Reason){}}
const mismatch=(reason:Reason):never=>{throw new Mismatch(reason);};
const opaque=<T>():T=>Object.freeze(Object.create(null)) as T;
function own(raw:unknown){
  if(!raw||typeof raw!=='object'||types.isProxy(raw)||Array.isArray(raw)||![null,Object.prototype].includes(Object.getPrototypeOf(raw)))throw Error();
  const keys=Reflect.ownKeys(raw);if(keys.length>8)throw Error();const out:Record<string,unknown>=Object.create(null);
  for(const key of keys){if(typeof key!=='string')throw Error();const d=Object.getOwnPropertyDescriptor(raw,key);if(!d||!Object.hasOwn(d,'value'))throw Error();out[key]=d.value;}return out;
}
function copy(raw:unknown){let nodes=0,characters=0;
  function visit(v:unknown,d:number):unknown{
    if(++nodes>2000||d>4)throw Error();if(typeof v==='string'){characters+=v.length*3;if(characters>262144)throw Error();return v;}
    if(Array.isArray(v)&&!types.isProxy(v)){if(Object.getPrototypeOf(v)!==Array.prototype||v.length>100||Reflect.ownKeys(v).length!==v.length+1)throw Error();return Array.from({length:v.length},(_,i)=>{const p=Object.getOwnPropertyDescriptor(v,String(i));if(!p||!Object.hasOwn(p,'value'))throw Error();return visit(p.value,d+1);});}
    const out=own(v);for(const k of Object.keys(out)){characters+=k.length*3;if(characters>262144)throw Error();out[k]=visit(out[k],d+1);}return out;
  }return visit(raw,0);
}
const base={sys_id:z.string().regex(/^[a-f0-9]{32}$/),name:z.string().min(1).max(200),action:z.string().max(40)};
const rowSchema=z.discriminatedUnion('producer',[
  z.strictObject({...base,producer:z.literal('metadata')}),z.strictObject({...base,producer:z.literal('retrieval')}),
  z.strictObject({...base,producer:z.literal('analysis'),retrieved_at:z.string().length(24).pipe(z.iso.datetime({precision:3}))}),
]);
const schema=z.strictObject({kind:z.literal('synthetic_nonreviewed_issuer_v1'),schema_version:z.enum(['bp-mcp-review-0.2','bp-mcp-review-0.3']),requested_rule_ids:bp5RuleIdsSchema,rows:z.array(rowSchema).min(1).max(100)});
type Row=z.infer<typeof rowSchema>;
function classify(row:Row,rules:readonly string[]){
  const common={update_xml_sys_id:row.sys_id};if(row.action==='DELETE')return {...common,state:'skipped_deleted',reason:'deleted_asset'};
  if(row.action!=='INSERT_OR_UPDATE')return {...common,state:'rejected',reason:'unsupported_action'};
  const table=/^([a-z][a-z0-9_]*)_[a-f0-9]{32}$/.exec(row.name)?.[1];
  if(!table&&(row.name.startsWith('sys_script_')||row.name.startsWith('sys_script_client_')))return {...common,state:'rejected',reason:'identity_mismatch'};
  const type=table==='sys_script'?'business_rule':table==='sys_script_client'?'client_script':'other';
  if(type==='other')return {...common,state:'not_applicable',asset_type:type,reason:'asset_type_unsupported'};
  if(!rules.some(id=>RULES.find(r=>r.rule_id===id)!.asset_types.includes(type)))return {...common,state:'not_applicable',asset_type:type,reason:'no_requested_rules'};
}
export function createSyntheticNonReviewedIssuer(raw:unknown,dependencies:Readonly<{guard:(operation:string,phase:'pre'|'post')=>Stop|void}>){
  let config:z.infer<typeof schema>,guardFn:typeof dependencies.guard;
  try{const deps=own(dependencies);if(Reflect.ownKeys(deps).length!==1||typeof deps.guard!=='function'||types.isProxy(deps.guard))throw Error();guardFn=deps.guard as typeof guardFn;
    config=schema.parse(copy(raw));if(new Set(config.requested_rule_ids).size!==config.requested_rule_ids.length||config.rows.some((r,i)=>i>0&&config.rows[i-1].sys_id>=r.sys_id))throw Error();
    for(const r of config.rows)if((r.producer==='metadata')!==!!classify(r,config.requested_rule_ids))throw Error();
  }catch{throw new NonReviewedIssuerError('internal_review_error','shape');}
  type Slot={row:Row;issue_started:boolean;begin_started?:boolean;settle_started?:boolean;delivery_started?:boolean;input?:NonReviewedInput;attempt?:NonReviewedAttempt;cleanup?:NonReviewedCleanup;job?:NonReviewedJob;id?:number};
  const slots=new Map<NonReviewedRow,Slot>(),evidence=new Map<ClassifiedNonReviewed|RetrievedNonReviewed|AnalyzedNonReviewed,{slot:Slot;value:SyntheticNonReviewedValues}>();
  const terminals=new Map<RetrievedTerminal,{slot:Slot;value:SyntheticNonReviewedValues}>(),cleanups=new Map<NonReviewedCleanup,'pending'|'confirmed'|'unconfirmed'>();
  const deliveries=new Map<NonReviewedDelivery,{slot:Slot;json:string}>();
  let state:'active'|'failed'|'discarded'='active',busy=false,first:Readonly<{code:Stop|'internal_review_error';reason:Reason}>|undefined;
  const issued={metadata:0,retrieval:0,analysis:0};let inputCount=0,jobCount=0;
  const outcomeStates={not_applicable:0,skipped_deleted:0,rejected:0,retrieval_failed:0,result_omitted:0};
  const outcomeReasons=new Map<string,number>();
  function published(value:SyntheticNonReviewedValues){const {state,reason}=value.value.outcome;if(state==='not_processed')mismatch('producer');outcomeStates[state as keyof typeof outcomeStates]++;outcomeReasons.set(reason,(outcomeReasons.get(reason)??0)+1);}
  const fail:(reason:Reason,code?:Stop|'internal_review_error')=>never=(reason,code='internal_review_error')=>{first??=Object.freeze({reason,code});state='failed';slots.clear();terminals.clear();deliveries.clear();evidence.clear();throw new NonReviewedIssuerError(first.code,first.reason);};
  function active(){if(first)throw new NonReviewedIssuerError(first.code,first.reason);if(busy)fail('reentrant');if(state!=='active')fail('state');}
  function guard(op:string,phase:'pre'|'post'){
    let stop:unknown;try{stop=guardFn(op,phase);}catch{fail('internal');}if(first)throw new NonReviewedIssuerError(first.code,first.reason);
    if(stop!==undefined){if(['cancelled','deadline_exceeded','request_budget_exceeded','receive_budget_exceeded','payload_budget_exceeded','authentication_failed','access_denied','upstream_unavailable'].includes(stop as string))fail('stopped',stop as Stop);fail('internal');}
  }
  function act<T>(op:string,claim:()=>void,work:()=>T,commit:(value:T)=>void=()=>{}):T{
    active();busy=true;try{claim();guard(op,'pre');let value:T|undefined,local:Reason|undefined;
      try{value=work();}catch(error){local=error instanceof Mismatch?error.reason:'shape';}
      guard(op,'post');if(local)fail(local);commit(value!);return value!;
    }catch{if(first)throw new NonReviewedIssuerError(first.code,first.reason);return fail('internal');}finally{busy=false;}
  }
  function take(row:NonReviewedRow,producer:Row['producer']){const slot=slots.get(row);if(!slot)fail('binding');if(slot.row.producer!==producer)fail('producer');return slot;}
  for(const row of config.rows)slots.set(opaque<NonReviewedRow>(),{row,issue_started:false});config.rows=[];raw=undefined;
  function issueClassified(row:NonReviewedRow):ClassifiedNonReviewed{
    let slot:Slot,value:SyntheticNonReviewedValues;return act('metadata_issue',()=>{slot=take(row,'metadata');if(slot.issue_started)fail('duplicate');slot.issue_started=true;},()=>{
      value=projectSyntheticNonReviewedValue({schema_version:config.schema_version,producer:'metadata',outcome:classify(slot.row,config.requested_rule_ids)});return opaque<ClassifiedNonReviewed>();
    },handle=>{published(value);evidence.set(handle,{slot,value});issued.metadata++;});
  }
  function beginRetrieval(row:NonReviewedRow){let slot:Slot;return act('retrieval_begin',()=>{slot=take(row,'retrieval');if(slot.begin_started)fail('duplicate');slot.begin_started=true;},()=>Object.freeze({input:opaque<NonReviewedInput>(),attempt:opaque<NonReviewedAttempt>(),cleanup:opaque<NonReviewedCleanup>()}),t=>{
    slot.input=t.input;slot.attempt=t.attempt;slot.cleanup=t.cleanup;cleanups.set(t.cleanup,'pending');inputCount++;
  });}
  function settleRetrieval(row:NonReviewedRow,input:NonReviewedInput,attempt:NonReviewedAttempt,event:unknown){let slot:Slot,value:SyntheticNonReviewedValues;return act('retrieval_settle',()=>{slot=take(row,'retrieval');if(slot.settle_started)fail('duplicate');slot.settle_started=true;},()=>{
    if(!slot.input||slot.input!==input||slot.attempt!==attempt||!slot.cleanup||cleanups.get(slot.cleanup)!=='pending')mismatch('binding');
    const parsed=z.discriminatedUnion('kind',[
      z.strictObject({kind:z.literal('error'),code:z.enum(['not_found_or_not_visible','invalid_response','changed_during_review','payload_limit']),cleanup:z.enum(['confirmed','unconfirmed'])}),
      z.strictObject({kind:z.literal('invalid_timestamp'),cleanup:z.enum(['confirmed','unconfirmed'])}),
    ]).parse(own(event));cleanups.set(slot.cleanup!,parsed.cleanup);if(parsed.cleanup!=='confirmed')mismatch('cleanup');
    const reason=parsed.kind==='invalid_timestamp'?'missing_required_field':({not_found_or_not_visible:'payload_unavailable',invalid_response:'missing_required_field',changed_during_review:'changed_during_review',payload_limit:'payload_limit'} as const)[parsed.code];
    value=projectSyntheticNonReviewedValue({schema_version:config.schema_version,producer:'retrieval',outcome:{state:reason==='payload_limit'?'rejected':'retrieval_failed',update_xml_sys_id:slot.row.sys_id,reason}});return opaque<RetrievedTerminal>();
  },handle=>terminals.set(handle,{slot,value}));}
  function issueRetrieved(row:NonReviewedRow,input:NonReviewedInput,attempt:NonReviewedAttempt,terminal:RetrievedTerminal){let slot:Slot,pending:ReturnType<typeof terminals.get>;return act('retrieval_issue',()=>{
    slot=take(row,'retrieval');if(slot.issue_started)fail('duplicate');slot.issue_started=true;pending=terminals.get(terminal);terminals.delete(terminal);
  },()=>{if(!pending||pending.slot!==slot||slot.input!==input||slot.attempt!==attempt||!slot.cleanup||cleanups.get(slot.cleanup)!=='confirmed')mismatch('binding');return opaque<RetrievedNonReviewed>();},handle=>{published(pending!.value);evidence.set(handle,pending!);issued.retrieval++;});}
  function beginAnalysis(row:NonReviewedRow){let slot:Slot;return act('analysis_begin',()=>{slot=take(row,'analysis');if(slot.begin_started)fail('duplicate');slot.begin_started=true;},()=>Object.freeze({input:opaque<NonReviewedInput>(),job:opaque<NonReviewedJob>(),id:jobCount+1}),t=>{
    slot.input=t.input;slot.job=t.job;slot.id=t.id;inputCount++;jobCount++;
  });}
  function deliverAnalysis(row:NonReviewedRow,input:NonReviewedInput,job:NonReviewedJob,envelope:unknown){let slot:Slot,json:string;return act('analysis_delivery',()=>{slot=take(row,'analysis');if(slot.delivery_started)fail('duplicate');slot.delivery_started=true;},()=>{
    if(!slot.input||slot.input!==input||slot.job!==job)mismatch('binding');
    const parsed=z.strictObject({id:z.number().int().min(1).max(100),ok:z.literal(true),json:z.string().max(262144)}).parse(own(envelope));
    if(parsed.id!==slot.id)mismatch('binding');measureRecoveryFullJson(parsed.json);json=parsed.json;return opaque<NonReviewedDelivery>();
  },handle=>deliveries.set(handle,{slot,json}));}
  function issueAnalyzed(row:NonReviewedRow,input:NonReviewedInput,job:NonReviewedJob,delivery:NonReviewedDelivery){let slot:Slot,pending:ReturnType<typeof deliveries.get>,value:SyntheticNonReviewedValues;return act('analysis_issue',()=>{
    slot=take(row,'analysis');if(slot.issue_started)fail('duplicate');slot.issue_started=true;pending=deliveries.get(delivery);deliveries.delete(delivery);
  },()=>{
    if(!pending||pending.slot!==slot||slot.input!==input||slot.job!==job)mismatch('binding');const asset=validateRecoveryAnalysisJson(pending!.json).value;
    if(asset.update_xml_sys_id!==slot.row.sys_id)mismatch('context');if(asset.state!=='rejected'&&asset.state!=='result_omitted')mismatch('producer');
    value=projectSyntheticNonReviewedValue({schema_version:config.schema_version,producer:'analysis',outcome:asset});return opaque<AnalyzedNonReviewed>();
  },handle=>{published(value);evidence.set(handle,{slot,value});issued.analysis++;});}
  function recordCleanup(sink:NonReviewedCleanup,status:'confirmed'|'unconfirmed'){
    if(busy)fail('reentrant');if(cleanups.get(sink)!=='pending'||!['confirmed','unconfirmed'].includes(status))fail('binding');cleanups.set(sink,status);
  }
  function discardEvidence(handle:ClassifiedNonReviewed|RetrievedNonReviewed|AnalyzedNonReviewed){active();if(!evidence.delete(handle))fail('binding');}
  function discard(){if(busy)fail('reentrant');slots.clear();terminals.clear();deliveries.clear();evidence.clear();if(!first)state='discarded';}
  return Object.freeze({rows:Object.freeze([...slots.keys()]),issueClassified,beginRetrieval,settleRetrieval,issueRetrieved,beginAnalysis,deliverAnalysis,issueAnalyzed,recordCleanup,discardEvidence,discard,
    revoke:(reason:Stop)=>fail('stopped',['cancelled','deadline_exceeded','request_budget_exceeded','receive_budget_exceeded','payload_budget_exceeded','authentication_failed','access_denied','upstream_unavailable'].includes(reason)?reason:'internal_review_error'),
    summary:()=>Object.freeze({scope:'synthetic_nonreviewed_issuer_only',authority:'none',state,first_failure:first??null,issued:Object.freeze({...issued}),outcome_states:Object.freeze({...outcomeStates}),outcome_reasons:Object.freeze(Object.fromEntries(outcomeReasons)),pending_evidence:evidence.size,pending_terminals:terminals.size,pending_deliveries:deliveries.size,inputs:inputCount,jobs:jobCount,
      cleanup_pending:[...cleanups.values()].filter(x=>x==='pending').length,cleanup_unconfirmed:[...cleanups.values()].filter(x=>x==='unconfirmed').length,unverified:Object.freeze(['runtime_origin','native_cleanup','manifest','whole_run_budget'])})});
}
