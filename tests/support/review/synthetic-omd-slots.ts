/** OD-A: fresh synthetic DATA assembly only. Not an origin issuer, manifest or accepted-plan adapter. */
import {types,isDeepStrictEqual} from 'node:util';
import {modelSyntheticParentOmission} from './synthetic-parent-omission-values.js';

type Reason='shape'|'binding'|'order'|'duplicate'|'state'|'internal'|'reentrant'|'cancelled'|'deadline_exceeded';
export class MixedSlotError extends Error{readonly code='internal_review_error';constructor(readonly reason:Reason){super('internal_review_error');}}
declare const rowBrand:unique symbol,receiptBrand:unique symbol,slotBrand:unique symbol,initialBrand:unique symbol,parentBrand:unique symbol,completeBrand:unique symbol,cleanupBrand:unique symbol;
export type MixedRow=Readonly<{[rowBrand]:'synthetic_omd_row'}>;
export type MixedReceipt=Readonly<{[receiptBrand]:'synthetic_omd_receipt'}>;
export type MixedSlot=Readonly<{[slotBrand]:'synthetic_omd_slot'}>;
export type InitialMixedPrefix=Readonly<{[initialBrand]:'synthetic_omd_initial'}>;
export type ParentMixedPrefix=Readonly<{[parentBrand]:'synthetic_omd_parent'}>;
export type CompletedMixedPrefix=Readonly<{[completeBrand]:'synthetic_omd_complete'}>;
export type MixedCleanup=Readonly<{[cleanupBrand]:'synthetic_omd_cleanup'}>;
type Progress=Readonly<{stage:'initial';prefix:InitialMixedPrefix}|{stage:'parent';prefix:ParentMixedPrefix}|{stage:'complete';prefix:CompletedMixedPrefix}>;
type Model=ReturnType<typeof modelSyntheticParentOmission>['value'];
type Original=Model['original_rows'][number];
type Variant='kept_reviewed'|'parent_omitted'|'original_worker_omitted'|'metadata'|'retrieval'|'analysis_rejected'|'retained';
type Pin={ordinal:number;receipt:MixedReceipt;original:Original;generated:boolean;consumed:boolean};
type CommonSlot={row:MixedRow;pin:Pin;receipt:MixedReceipt;original:Original};
// Parent omission always retains the original reviewed value; worker omissions never acquire one.
type StoredSlot=CommonSlot&(
  {kind:'kept_reviewed'|'parent_omitted';capture:Extract<Original['outcome'],{state:'reviewed'}>}|
  {kind:'original_worker_omitted';omitted:Extract<Original['outcome'],{state:'result_omitted'}>}|
  {kind:'metadata'|'retrieval'|'analysis_rejected'|'retained'});
type PrefixState={ordinal:number;stage:Progress['stage'];value:Model['initial_prefix']};
type Guard=(phase:'pre'|'post',operation:'begin'|'generate'|'consume')=>'cancelled'|'deadline_exceeded'|void;
const handle=<T>():T=>Object.freeze(Object.create(null)) as T;
function own(raw:unknown,keys:readonly string[]){
  if(!raw||typeof raw!=='object'||types.isProxy(raw)||Array.isArray(raw)||![null,Object.prototype].includes(Object.getPrototypeOf(raw)))throw new MixedSlotError('shape');
  const names=Reflect.ownKeys(raw);if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))throw new MixedSlotError('shape');
  const out:Record<string,unknown>=Object.create(null);
  for(const k of keys){const d=Object.getOwnPropertyDescriptor(raw,k);if(!d||!Object.hasOwn(d,'value'))throw new MixedSlotError('shape');out[k]=d.value;}return out;
}

export function createSyntheticMixedSlotAssembly(raw:unknown,dependencies:unknown,...extra:unknown[]){
  if(extra.length)throw new MixedSlotError('shape');
  const config=own(raw,['kind','model_id','schema_version','selected','prefix','rows']),deps=own(dependencies,['guard']);
  if(config.kind!=='synthetic_omd_slots_v1'||typeof deps.guard!=='function'||types.isProxy(deps.guard))throw new MixedSlotError('shape');
  const fixedGuard=deps.guard as Guard;
  let model:Model|undefined;
  try{
    model=modelSyntheticParentOmission({...config,kind:'synthetic_parent_omission_values_v1',limits:{max_findings:100}}).value;
    if(model.selected.length===0)throw 0;
    let firstReviewed:Extract<Original['outcome'],{state:'reviewed'}>|undefined;
    for(const {outcome} of model.original_rows)if(outcome.state==='reviewed'){
      if(firstReviewed&&(outcome.result.instance_binding!==firstReviewed.result.instance_binding||outcome.result.target.update_set_id!==firstReviewed.result.target.update_set_id
        ||!isDeepStrictEqual(outcome.result.instance_release,firstReviewed.result.instance_release)))throw 0;
      firstReviewed??=outcome;
    }
  }catch{throw new MixedSlotError('shape');}
  // Constructor-generated row + receipt references are never imported from another assembly/runtime.
  const pins=new Map<MixedRow,Pin>(),prefixes=new Map<object,PrefixState>(),slots=new Map<MixedSlot,StoredSlot>();
  const nextPrefixes=new Map<MixedSlot,Model['initial_prefix']>();
  const rows=Object.freeze(model.original_rows.map((original,ordinal)=>{
    const row=handle<MixedRow>(),receipt=handle<MixedReceipt>();pins.set(row,{ordinal,receipt,original,generated:false,consumed:false});return Object.freeze({row,receipt});
  }));
  const selected=rows.length;
  let first:Reason|undefined,state:'fresh'|'active'|'complete'|'invalidated'|'failed'|'discarded'='fresh',busy=false,started=false,cursor=0;
  let generated=0,consumed=0,captures=0,keptFindings=0,warnings=model.initial_prefix.limitations.length,errors=model.initial_prefix.errors.length;
  let sourceStarted=false,cleanup:'not_started'|'pending'|'confirmed'|'unconfirmed'='not_started',cleanupSink:MixedCleanup|undefined;
  const variants:Record<Variant,number>={kept_reviewed:0,parent_omitted:0,original_worker_omitted:0,metadata:0,retrieval:0,analysis_rejected:0,retained:0};
  function clear(){pins.clear();prefixes.clear();slots.clear();nextPrefixes.clear();model=undefined;}
  const fail=(reason:Reason):never=>{first??=reason;state='failed';clear();throw new MixedSlotError(first);};
  function live(){if(first)throw new MixedSlotError(first);if(busy)fail('reentrant');if(state==='invalidated'||state==='discarded')fail('state');}
  function guard(phase:'pre'|'post',operation:Parameters<Guard>[1]){
    let stop:unknown;try{stop=fixedGuard(phase,operation);}catch{if(first)throw new MixedSlotError(first);fail('internal');}
    if(first)throw new MixedSlotError(first);
    if(stop!==undefined)fail(stop==='cancelled'||stop==='deadline_exceeded'?stop:'internal');
  }
  function guarded<T>(operation:Parameters<Guard>[1],work:()=>T,commit:(value:T)=>void):T{
    busy=true;try{
      guard('pre',operation);let value:T|undefined,mismatch:Reason|undefined;
      try{value=work();}catch(e){mismatch=e instanceof MixedSlotError?e.reason:'internal';}
      guard('post',operation);if(mismatch)fail(mismatch);commit(value!);return value!;
    }catch{if(first)throw new MixedSlotError(first);return fail('internal');}finally{busy=false;}
  }
  const reject=(reason:Reason):never=>{throw new MixedSlotError(reason);};
  return Object.freeze({
    rows,
    begin(...args:unknown[]):Progress{
      live();if(started)fail('duplicate');started=true;
      return guarded('begin',()=>{
        if(args.length||!model)reject('shape');
        return Object.freeze({stage:'initial' as const,prefix:handle<InitialMixedPrefix>()});
      },value=>{prefixes.set(value.prefix,{ordinal:0,stage:'initial',value:model!.initial_prefix});state='active';});
    },
    generate(row:MixedRow,receipt:MixedReceipt,prefix:InitialMixedPrefix|ParentMixedPrefix,...args:unknown[]):MixedSlot{
      live();const pin=pins.get(row),prior=prefixes.get(prefix);prefixes.delete(prefix);
      const already=pin?.generated;if(pin)pin.generated=true;
      const issued=guarded('generate',()=>{
        if(args.length)reject('shape');if(!pin||pin.receipt!==receipt||!prior)reject('binding');
        if(already)reject('duplicate');
        if(state!=='active'||!model||slots.size||prior!.stage==='complete'||prior!.ordinal!==cursor||pin!.ordinal!==cursor)reject('order');
        const original=pin!.original,trace=model!.trace[cursor],outcome=original.outcome;
        let stored:StoredSlot;const common={row,pin:pin!,receipt,original};
        if(outcome.state==='reviewed')stored={...common,kind:trace.action==='parent_omit'?'parent_omitted':'kept_reviewed',capture:outcome};
        else if(outcome.state==='result_omitted')stored={...common,kind:'original_worker_omitted',omitted:outcome};
        else stored={...common,kind:original.producer==='analysis'?'analysis_rejected':original.producer};
        // Keep only a private next-prefix snapshot; it is not returned before slot consumption.
        const nextValue=Object.freeze({limitations:Object.freeze([...prior!.value.limitations,...trace.limitations_added]),
          errors:Object.freeze([...prior!.value.errors,...model!.prefix.errors.slice(prior!.value.errors.length,prior!.value.errors.length+trace.errors_added)])});
        return {slot:handle<MixedSlot>(),stored,nextValue};
      },value=>{
        slots.set(value.slot,value.stored);nextPrefixes.set(value.slot,value.nextValue);generated++;
      });
      return issued.slot;
    },
    consume(row:MixedRow,receipt:MixedReceipt,slot:MixedSlot,...args:unknown[]):Progress{
      live();const pending=slots.get(slot),next=nextPrefixes.get(slot);slots.delete(slot);nextPrefixes.delete(slot);
      return guarded('consume',()=>{
        if(args.length)reject('shape');const pin=pins.get(row);
        if(!pending||!pin||pending.row!==row||pending.pin!==pin||pending.receipt!==receipt||pin.receipt!==receipt||pending.original!==pin.original||!next)reject('binding');
        if(!model||state!=='active'||pin!.consumed||!pin!.generated||pin!.ordinal!==cursor)reject('order');
        const stage=cursor+1===selected?'complete' as const:'parent' as const;
        return stage==='complete'?Object.freeze({stage,prefix:handle<CompletedMixedPrefix>()}):Object.freeze({stage,prefix:handle<ParentMixedPrefix>()});
      },value=>{
        pending!.pin.consumed=true;consumed++;variants[pending!.kind]++;
        if(pending!.kind==='kept_reviewed'||pending!.kind==='parent_omitted')captures++;
        keptFindings=model!.trace[cursor].after;cursor++;warnings=next!.limitations.length;errors=next!.errors.length;
        prefixes.set(value.prefix,{ordinal:cursor,stage:value.stage,value:next!});if(value.stage==='complete')state='complete';
      });
    },
    beginSourceClose(...args:unknown[]){if(busy)fail('reentrant');if(args.length||sourceStarted)fail('state');sourceStarted=true;clear();if(!first)state='invalidated';},
    beginCleanup(...args:unknown[]):MixedCleanup{if(busy)fail('reentrant');if(args.length||cleanup!=='not_started')fail('state');cleanupSink=handle<MixedCleanup>();cleanup='pending';clear();if(!first)state='invalidated';return cleanupSink;},
    recordCleanup(sink:MixedCleanup,status:'confirmed'|'unconfirmed',...args:unknown[]){if(busy)fail('reentrant');if(args.length||sink!==cleanupSink||cleanup!=='pending'||status!=='confirmed'&&status!=='unconfirmed')fail('binding');cleanup=status;},
    stop(reason:'cancelled'|'deadline_exceeded',...args:unknown[]){if(args.length||reason!=='cancelled'&&reason!=='deadline_exceeded')fail('internal');return fail(reason);},
    discard(...args:unknown[]){if(busy)fail('reentrant');if(args.length)fail('shape');clear();if(!first)state='discarded';},
    summary:()=>Object.freeze({scope:'synthetic_omd_slots' as const,authority:'none' as const,state,first_failure:first??null,selected,generated,consumed,pending_slots:slots.size,pending_prefixes:prefixes.size,
      variants:Object.freeze({...variants}),captures,retained_originals:pins.size,kept_findings:keptFindings,warnings,errors,cleanup,
      permissions:Object.freeze({accepted_adoption:false,comparison:false,candidate:false,formal_issuance:false}),
      unverified:Object.freeze(['runtime_origin','existing_row_receipt','accepted_plan','finish_job','finalize_model','whole_run_budget'])}),
  });
}
