/** Synthetic issuer ONLY. No body/parser/transport/session adoption or formal evidence authority. */
import {z} from 'zod';
import {types} from 'node:util';
declare const brand:unique symbol;
type Handle<K extends string>={readonly [brand]:K};
export type SyntheticParentSession=Handle<'parent_session'>;
export type SyntheticParentOwner=Handle<'parent_owner'>;
export type SyntheticParentUse=Handle<'parent_use'>;
export type SyntheticParentDraft=Handle<'parent_draft'>;
export type SyntheticParentComparison=Handle<'parent_comparison'>;
type Code='invalid_input'|'invalid_response'|'invalid_state'|'evidence_binding_mismatch'|'cancelled'|'closed'|'deadline_exceeded'|'invalid_observation_time'|'internal_review_error'|'changed_during_review';
type Result<T>=Readonly<{ok:true;value:T}|{ok:false;code:Code}>;
type State='new'|'initial_pending'|'initial_observed'|'final_pending'|'comparison_pending'|'stable_observation'|'changed'|'not_verified'|'revoked';
const fields=['sys_id','state','application','sys_updated_on','sys_mod_count'] as const;
type Field=typeof fields[number];
const id=z.string().regex(/^[a-f0-9]{32}$/);
const recordSchema=z.strictObject({sys_id:id,state:z.string().max(100),application:z.string().max(32),sys_updated_on:z.string().min(1).max(40),sys_mod_count:z.string().regex(/^\d{1,20}$/)});
type ParentRecord=Readonly<z.infer<typeof recordSchema>>;
const sessionSchema=z.strictObject({update_set_sys_id:id,deadline_ms:z.number().int().min(1).max(60000).default(60000)});
const opaque=<T>()=>Object.freeze(Object.create(null)) as T;
const ok=<T>(value:T):Result<T>=>Object.freeze({ok:true,value});
const no=(code:Code):Result<never>=>Object.freeze({ok:false,code});
function ownData(raw:unknown,allowed:readonly string[]):Record<string,unknown>|null{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||types.isProxy(raw))return null;
  const keys=Reflect.ownKeys(raw);if(keys.length>allowed.length)return null;
  const copy:Record<string,unknown>=Object.create(null);
  for(const key of keys){if(typeof key!=='string'||!allowed.includes(key))return null;const d=Object.getOwnPropertyDescriptor(raw,key);if(!d||!('value' in d))return null;copy[key]=d.value;}
  return copy;
}
/** Both records are already private, strict, target-bound primitive projections. Always checks all five fields. */
function differences(initial:ParentRecord,final:ParentRecord):readonly Field[]{return Object.freeze(fields.filter(key=>initial[key]!==final[key]));}

export function createSyntheticParentStabilityIssuer(clock:{now():number}){
  type Context=Readonly<{core:object;budget:object;auth:object;generation:object;target:string}>;
  type Session={context:Context;started:number;last:number;deadline:number;live:boolean;reason?:Code;claim:'unclaimed'|'claiming'|'claimed'|'failed';observing:boolean;owner?:Owner};
  type Use={owner:Owner;context:Context;role:'initial'|'final';slot:object;request:object;attempt:object;issued:boolean};
  type Draft={owner:Owner;context:Context;use:Use;used:boolean;record?:ParentRecord};
  type Snapshot=Readonly<{context:Context;use:Use;record:ParentRecord}>;
  type Comparison={owner:Owner;context:Context;used:boolean;changed:readonly Field[]};
  type Owner={session:Session;context:Context;state:State;primary?:Code;busy:boolean;initialClaim:boolean;finalClaim:boolean;initialSlot:object;finalSlot:object;
    use?:Use;initial?:Snapshot;drafts:Set<Draft>;comparison?:Comparison;changed:readonly Field[];
    draftsIssued:number;draftsConsumed:number;snapshotsAccepted:number;comparisonsPrepared:number;comparisonsCommitted:number;fieldComparisons:number};
  const sessions=new WeakMap<SyntheticParentSession,Session>(),owners=new WeakMap<SyntheticParentOwner,Owner>();
  const uses=new WeakMap<SyntheticParentUse,Use>(),drafts=new WeakMap<SyntheticParentDraft,Draft>(),comparisons=new WeakMap<SyntheticParentComparison,Comparison>();
  function drop(o:Owner){for(const d of o.drafts){d.record=undefined;d.used=true;}o.drafts.clear();o.initial=undefined;o.use=undefined;if(o.comparison)o.comparison.used=true;o.comparison=undefined;}
  function stop(s:Session,code:Code):Result<never>{s.reason??=s.owner?.primary??code;s.live=false;s.claim='failed';
    if(s.owner){const o=s.owner;o.primary??=s.reason;if(o.state!=='stable_observation'&&o.state!=='changed')o.state=o.primary==='cancelled'||o.primary==='closed'?'revoked':'not_verified';drop(o);}return no(s.reason);}
  function observe(s:Session):Result<true>{
    if(s.reason||!s.live)return stop(s,s.reason??'closed');if(s.observing)return stop(s,'invalid_state');
    s.observing=true;let now:number;try{now=clock.now();}catch{return stop(s,'internal_review_error');}finally{s.observing=false;}
    if(s.reason||!s.live)return stop(s,s.reason??'closed');
    if(!Number.isFinite(now)||now<s.last||now<0||now>Number.MAX_SAFE_INTEGER-60000)return stop(s,'invalid_observation_time');s.last=now;
    return now>=s.deadline?stop(s,'deadline_exceeded'):ok(true);
  }
  function operation<T>(handle:SyntheticParentOwner,prepare:(o:Owner)=>Result<()=>Result<T>>):Result<T>{
    const o=owners.get(handle);if(!o)return no('evidence_binding_mismatch');if(o.busy)return stop(o.session,'invalid_state');o.busy=true;
    try{const before=observe(o.session);if(!before.ok)return before;const work=prepare(o);if(!work.ok)return work;
      const after=observe(o.session);if(!after.ok)return after;return work.value();
    }catch{return stop(o.session,'internal_review_error');}finally{o.busy=false;}
  }
  function begin(handle:SyntheticParentOwner,role:'initial'|'final'):Result<SyntheticParentUse>{return operation(handle,o=>{
    if(role==='initial'?o.state!=='new'||o.initialClaim:o.state!=='initial_observed'||o.finalClaim||!o.initial)return stop(o.session,'invalid_state');
    if(role==='initial')o.initialClaim=true;else o.finalClaim=true;
    return ok(()=>{const key=opaque<SyntheticParentUse>(),use:Use={owner:o,context:o.context,role,slot:role==='initial'?o.initialSlot:o.finalSlot,request:opaque<object>(),attempt:opaque<object>(),issued:false};
      uses.set(key,use);o.use=use;o.state=role==='initial'?'initial_pending':'final_pending';return ok(key);});
  });}
  function validDraft(o:Owner,key:SyntheticParentDraft,role:Use['role']):Draft|undefined{
    const d=drafts.get(key);return d&&d.owner===o&&d.context===o.context&&d.use===o.use&&d.use.context===o.context&&d.use.role===role&&d.use.slot===(role==='initial'?o.initialSlot:o.finalSlot)?d:undefined;
  }
  return Object.freeze({
    issueSession(raw:unknown):Result<SyntheticParentSession>{try{
      const copy=ownData(raw,['update_set_sys_id','deadline_ms']),p=sessionSchema.safeParse(copy);if(!p.success)return no('invalid_input');
      let now:number;try{now=clock.now();}catch{return no('internal_review_error');}if(!Number.isFinite(now)||now<0||now>Number.MAX_SAFE_INTEGER-60000)return no('invalid_observation_time');
      const key=opaque<SyntheticParentSession>(),context:Context=Object.freeze({core:opaque<object>(),budget:opaque<object>(),auth:opaque<object>(),generation:opaque<object>(),target:p.data.update_set_sys_id});
      sessions.set(key,{context,started:now,last:now,deadline:now+p.data.deadline_ms,live:true,claim:'unclaimed',observing:false});return ok(key);
    }catch{return no('invalid_input');}},
    claimOwner(session:SyntheticParentSession):Result<SyntheticParentOwner>{const s=sessions.get(session);if(!s)return no('evidence_binding_mismatch');
      if(s.claim!=='unclaimed')return stop(s,'invalid_state');s.claim='claiming';const checked=observe(s);if(!checked.ok)return checked;
      const key=opaque<SyntheticParentOwner>(),owner:Owner={session:s,context:s.context,state:'new',busy:false,initialClaim:false,finalClaim:false,initialSlot:opaque<object>(),finalSlot:opaque<object>(),drafts:new Set(),changed:Object.freeze([]),draftsIssued:0,draftsConsumed:0,snapshotsAccepted:0,comparisonsPrepared:0,comparisonsCommitted:0,fieldComparisons:0};
      s.owner=owner;s.claim='claimed';owners.set(key,owner);return ok(key);
    },
    beginInitial:(owner:SyntheticParentOwner)=>begin(owner,'initial'),beginFinal:(owner:SyntheticParentOwner)=>begin(owner,'final'),
    issueDraft(owner:SyntheticParentOwner,useKey:SyntheticParentUse,raw:unknown):Result<SyntheticParentDraft>{return operation(owner,o=>{
      const use=uses.get(useKey);if(!use||use.owner!==o||use.context!==o.context||use!==o.use)return stop(o.session,'evidence_binding_mismatch');
      if(use.issued||o.state!==(use.role==='initial'?'initial_pending':'final_pending'))return stop(o.session,'invalid_state');use.issued=true;
      const p=recordSchema.safeParse(ownData(raw,fields));if(!p.success||p.data.sys_id!==o.context.target)return stop(o.session,'invalid_response');
      const record:ParentRecord=Object.freeze(p.data);
      return ok(()=>{const key=opaque<SyntheticParentDraft>(),draft:Draft={owner:o,context:o.context,use,used:false,record};drafts.set(key,draft);o.drafts.add(draft);o.draftsIssued++;return ok(key);});
    });},
    acceptInitial(owner:SyntheticParentOwner,key:SyntheticParentDraft):Result<true>{return operation(owner,o=>{
      const known=drafts.get(key);if(known?.owner===o&&known.used)return stop(o.session,'invalid_state');
      const d=validDraft(o,key,'initial');if(!d)return stop(o.session,'evidence_binding_mismatch');if(o.state!=='initial_pending'||d.used||!d.record)return stop(o.session,'invalid_state');
      d.used=true;o.draftsConsumed++;return ok(()=>{o.initial=Object.freeze({context:o.context,use:d.use,record:d.record!});d.record=undefined;o.drafts.delete(d);o.use=undefined;o.state='initial_observed';o.snapshotsAccepted++;return ok(true);});
    });},
    prepareComparison(owner:SyntheticParentOwner,key:SyntheticParentDraft):Result<SyntheticParentComparison>{return operation(owner,o=>{
      const known=drafts.get(key);if(known?.owner===o&&known.used)return stop(o.session,'invalid_state');
      const d=validDraft(o,key,'final');if(!d)return stop(o.session,'evidence_binding_mismatch');if(o.state!=='final_pending'||d.used||!d.record||!o.initial)return stop(o.session,'invalid_state');
      if(o.initial.context!==o.context||o.initial.use.owner!==o||o.initial.use.role!=='initial'||o.initial.use.request===d.use.request||o.initial.use.attempt===d.use.attempt)return stop(o.session,'evidence_binding_mismatch');
      d.used=true;o.draftsConsumed++;const changed=differences(o.initial.record,d.record);o.fieldComparisons+=5;o.comparisonsPrepared++;
      d.record=undefined;o.drafts.delete(d);o.initial=undefined;o.use=undefined;
      return ok(()=>{const h=opaque<SyntheticParentComparison>(),comparison:Comparison={owner:o,context:o.context,used:false,changed};comparisons.set(h,comparison);o.comparison=comparison;o.state='comparison_pending';return ok(h);});
    });},
    commitComparison(owner:SyntheticParentOwner,key:SyntheticParentComparison):Result<Readonly<{consistency:'stable_observation';synthetic:true;evidence_issuance:'disabled'}>>{return operation(owner,o=>{
      const c=comparisons.get(key);if(c?.owner===o&&c.used)return stop(o.session,'invalid_state');if(!c||c.owner!==o||c.context!==o.context||o.comparison!==c)return stop(o.session,'evidence_binding_mismatch');
      if(c.used||o.state!=='comparison_pending')return stop(o.session,'invalid_state');c.used=true;
      return ok(()=>{o.changed=c.changed;o.comparisonsCommitted++;o.state=c.changed.length?'changed':'stable_observation';drop(o);
        return c.changed.length?stop(o.session,'changed_during_review'):ok(Object.freeze({consistency:'stable_observation' as const,synthetic:true as const,evidence_issuance:'disabled' as const}));});
    });},
    cancel(session:SyntheticParentSession){const s=sessions.get(session);return s?stop(s,'cancelled'):no('evidence_binding_mismatch');},
    close(session:SyntheticParentSession){const s=sessions.get(session);return s?stop(s,'closed'):no('evidence_binding_mismatch');},
    status(owner:SyntheticParentOwner){const o=owners.get(owner);if(!o)return no('evidence_binding_mismatch');return ok(Object.freeze({state:o.state,live:o.session.live,primary:o.primary??o.session.reason??null,
      changed_fields:o.changed,retained_records:(o.initial?1:0)+[...o.drafts].filter(d=>d.record!==undefined).length,
      drafts_issued:o.draftsIssued,drafts_consumed:o.draftsConsumed,snapshots_accepted:o.snapshotsAccepted,comparisons_prepared:o.comparisonsPrepared,comparisons_committed:o.comparisonsCommitted,field_comparisons:o.fieldComparisons,
      synthetic:true as const,formal_issuance:'disabled' as const}));},
  });
}
