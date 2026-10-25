/** Synthetic composition only; no live session, transport, clock, worker or production seal. */
import { z } from 'zod';
import { createSyntheticFixedSourceIssuer, type FixedSourceNormalized } from './abort-scope-evidence-fixed-source.js';
import { type ScopeBudgetTable, type ScopeBudgetSlot } from './abort-scope-evidence-reservations.js';
import { createSyntheticScopeStreamHarness, type SyntheticScopeSource } from './abort-scope-evidence-stream.js';

type Request = Readonly<{ method: 'GET'; path: string }>;
export type SyntheticFixedGet = (request: Request, attempt: 1 | 2, signal: AbortSignal) => ReturnType<SyntheticScopeSource>;
declare const sealBrand: unique symbol;
export type SyntheticScopeFinalSeal = { readonly [sealBrand]: true };
const id = z.string().regex(/^[a-f0-9]{32}$/), version = z.string().min(1).max(40), count = z.string().regex(/^\d{1,20}$/);
const parentSchema = z.object({ result: z.array(z.object({sys_id:id,sys_updated_on:version,sys_mod_count:count})).length(1) });
const metadataSchema = z.object({ result: z.array(z.object({sys_id:id,update_set:id,name:z.string().min(1).max(160),
  sys_updated_on:version,sys_mod_count:count})).max(100) });
type Boundary = 'parent' | 'metadata';
type Stability = 'stable' | 'changed' | 'unverified';
type SealSummary = Readonly<{state:'stable';tables:number;synthetic:true}>;

export function createSyntheticScopeSourceStream(sessionFixture: unknown, sourceFixture: unknown, limits: unknown) {
  let sessionSnapshot: unknown, sourceSnapshot: unknown;
  try { sessionSnapshot=structuredClone(sessionFixture);sourceSnapshot=structuredClone(sourceFixture); }
  catch { return {ok:false as const,code:'invalid_input'}; }
  const source = createSyntheticFixedSourceIssuer(), session = source.issueSession(sessionSnapshot);
  if (!session.ok) return session;
  const issued = source.issueSource(session.value, sourceSnapshot);
  if (!issued.ok) { source.closeSession(session.value); return issued; }
  const issuer = source.createIssuer(session.value, issued.value.source, issued.value.permit);
  if (!issuer.ok) { source.closeSource(issued.value.source); source.closeSession(session.value); return issuer; }
  const created = createSyntheticScopeStreamHarness(limits);
  if (!created.ok) { source.closeIssuer(issuer.value); source.closeSource(issued.value.source); source.closeSession(session.value); return created; }
  const issuerHandle=issuer.value, sourceHandle=issued.value.source, sessionHandle=session.value, stream=created.value;
  // These snapshots passed the strict synthetic issuer schemas; no fixture getter is re-read.
  const updateSet=(sourceSnapshot as {update_set_sys_id:string}).update_set_sys_id;
  const time=sessionSnapshot as {started_at:string;deadline_ms:number};
  type Table = {handle:ScopeBudgetTable;slot:ScopeBudgetSlot;initial:FixedSourceNormalized};
  const tables=new Map<string,Table>(), baselines=new Map<Boundary,string|null>();
  const seals=new Map<SyntheticScopeFinalSeal,SealSummary>();
  const diagnostics: Readonly<{stage:string;code:string}>[]=[];
  let primary:string|undefined,busy=false,phase:'normal'|'finalizing'|'finished'='normal',prepared=false,rejected=false,lastAt=Date.parse(time.started_at);
  function note(stage:string,code:string) {
    if(!diagnostics.some(d=>d.stage===stage&&d.code===code))diagnostics.push(Object.freeze({stage,code}));
  }
  function close(code='closed') {
    primary??=code; seals.clear(); tables.clear(); baselines.clear();
    stream.close();source.closeIssuer(issuerHandle);source.closeSource(sourceHandle);source.closeSession(sessionHandle);
    return Object.freeze({ok:false as const,code:primary});
  }
  function checkpoint(at:unknown,signal?:AbortSignal) {
    if(primary)return close();
    if(signal?.aborted)return close('cancelled');
    const parsed=z.iso.datetime().safeParse(at),n=parsed.success?Date.parse(parsed.data):NaN;
    if(!Number.isFinite(n)||n<lastAt||n>=Date.parse(time.started_at)+time.deadline_ms)return close('invalid_observation_time');
    lastAt=n;return {ok:true as const};
  }
  function request(kind:Boundary):Request {
    const params=new URLSearchParams({sysparm_query:kind==='parent'?`sys_id=${updateSet}^ORDERBYsys_id`:`update_set=${updateSet}^ORDERBYsys_id`,
      sysparm_fields:kind==='parent'?'sys_id,sys_updated_on,sys_mod_count':'sys_id,update_set,name,sys_updated_on,sys_mod_count',
      sysparm_limit:kind==='parent'?'2':'101',sysparm_offset:'0',sysparm_no_count:'true',sysparm_display_value:'false',sysparm_exclude_reference_link:'true'});
    return Object.freeze({method:'GET',path:`/api/now/table/${kind==='parent'?'sys_update_set':'sys_update_xml'}?${params}`});
  }
  function fatal(result:{ok:false;code:string;terminal:boolean},stage:string) {
    note(stage,result.code);
    if(primary)return close();
    if(result.terminal)return close(result.code);
    if(stream.stats().cleanup==='unconfirmed')return close('internal_review_error');
    return null;
  }
  async function boundary(kind:Boundary,final:boolean,get:SyntheticFixedGet,signal?:AbortSignal) {
    const send=(attempt:1|2,abort:AbortSignal)=>get(request(kind),attempt,abort);
    const received=final?await stream.receiveFinal(stream[kind],kind,send,signal):await stream.receiveOrdinary(kind,send,signal);
    if(primary)return close();
    if(signal?.aborted)return close('cancelled');
    if(!received.ok){const stopped=fatal(received,`${final?'final':'prepare'}.${kind}`);return stopped??{ok:true as const,value:null};}
    const consumed=stream.consumeBody(received.value,kind,final?'final':'ordinary');
    if(!consumed.ok)return close(consumed.code);
    let raw:unknown;try{raw=JSON.parse(consumed.value);}catch{return close('internal_review_error');}
    if(kind==='parent'){
      const p=parentSchema.safeParse(raw);
      if(!p.success){note(`${final?'final':'prepare'}.${kind}`,'invalid_response');return {ok:true as const,value:null};}
      if(p.data.result[0].sys_id!==updateSet)return close('evidence_binding_mismatch');
      return {ok:true as const,value:JSON.stringify(p.data)};
    }
    const p=metadataSchema.safeParse(raw);
    if(!p.success){note(`${final?'final':'prepare'}.${kind}`,'invalid_response');return {ok:true as const,value:null};}
    if(p.data.result.some(r=>r.update_set!==updateSet))return close('evidence_binding_mismatch');
    if(p.data.result.some((r,n)=>n>0&&r.sys_id<=p.data.result[n-1].sys_id)){
      note(`${final?'final':'prepare'}.${kind}`,'invalid_response');return {ok:true as const,value:null};
    }
    return {ok:true as const,value:JSON.stringify(p.data)};
  }
  function localReason(code:string) {
    return code==='not_found_or_not_visible'?'not_found_or_not_visible' as const:code==='upstream_unavailable'?'upstream_unavailable' as const
      :code==='invalid_response'?'invalid_observation' as const:'not_collected' as const;
  }
  function normalized(receipt:ReturnType<typeof source.complete>) {
    if(!receipt.ok)return close(receipt.code);
    const result=source.view(issuerHandle,receipt.value);return result.ok?result:close(result.code);
  }
  return {ok:true as const,value:Object.freeze({
    async prepare(at:unknown,get:SyntheticFixedGet,signal?:AbortSignal) {
      const live=checkpoint(at,signal);if(!live.ok)return live;
      if(busy||prepared||phase!=='normal'||tables.size)return close('invalid_state');busy=true;prepared=true;
      try {
        for(const kind of ['parent','metadata'] as const){const r=await boundary(kind,false,get,signal);if(!r.ok)return r;baselines.set(kind,r.value);}
        return {ok:true as const,value:Object.freeze({state:'prepared' as const,parent:baselines.get('parent')!==null,metadata:baselines.get('metadata')!==null})};
      }catch{return close('internal_review_error');}finally{busy=false;}
    },
    async initial(name:unknown,observedAt:unknown,get:SyntheticFixedGet,signal?:AbortSignal) {
      const live=checkpoint(observedAt,signal);if(!live.ok)return live;
      if(busy||phase!=='normal')return close('invalid_state');busy=true;
      try {
        const table=stream.admitTable(name);
        if(!table.ok){const stopped=fatal(table,'initial.admission');rejected=true;return stopped??table;}
        const read=source.begin(issuerHandle,name,'initial');if(!read.ok)return close(read.code);
        const slot=stream.tableSlot(table.value);if(!slot.ok)return close(slot.code);
        const received=await stream.receiveInitial(table.value,(attempt,abort)=>get(read.value.request,attempt,abort),signal);
        if(primary)return close();
        if(signal?.aborted)return close('cancelled');
        let result;
        if(!received.ok){const stopped=fatal(received,'initial.table');if(stopped)return stopped;
          result=normalized(source.completeUnavailable(issuerHandle,read.value.ticket,localReason(received.code),observedAt));
        }else{
          const body=stream.consumeBody(received.value,table.value);if(!body.ok)return close(body.code);
          result=normalized(source.complete(issuerHandle,read.value.ticket,{status:200,body_json:body.value,observed_at:observedAt,cleanup:'confirmed'}));
          if(result.ok&&result.value.state==='unavailable'){
            const marked=stream.markInitialUnavailable(table.value);if(!marked.ok)return close(marked.code);
          }
        }
        if(result.ok)tables.set(name as string,{handle:table.value,slot:slot.value,initial:result.value});
        return result;
      }catch{return close('internal_review_error');}finally{busy=false;}
    },
    async finalize(at:unknown,get:SyntheticFixedGet,signal?:AbortSignal) {
      const live=checkpoint(at,signal);if(!live.ok)return live;
      if(busy||!prepared||phase!=='normal')return close('invalid_state');busy=true;phase='finalizing';
      try {
        const entered=stream.enterFinal();if(!entered.ok)return close(entered.code);
        const ready=source.enterFinal(issuerHandle);if(!ready.ok)return close(ready.code);
        const states:Stability[]=[];
        for(const kind of ['parent','metadata'] as const){
          const r=await boundary(kind,true,get,signal);if(!r.ok)return r;
          const before=baselines.get(kind);const state:Stability=before==null||r.value===null?'unverified':before===r.value?'stable':'changed';
          states.push(state);if(state!=='stable')note(`final.${kind}`,state);
        }
        const tableStates:Readonly<{name:string;state:Stability}>[]=[];
        for(const [name,t] of tables){
          const check=checkpoint(at,signal);if(!check.ok)return check;
          let result;
          if(t.initial.state==='unavailable'){
            const skipped=stream.skipFinal(t.handle,t.slot);if(!skipped.ok)return close(skipped.code);
            result=normalized(source.skipFinal(issuerHandle,name,at));note('final.table','not_collected');
          }else{
            const read=source.begin(issuerHandle,name,'final');if(!read.ok)return close(read.code);
            const received=await stream.receiveFinal(t.slot,t.handle,(attempt,abort)=>get(read.value.request,attempt,abort),signal);
            if(primary)return close();
            if(!received.ok){const stopped=fatal(received,'final.table');if(stopped)return stopped;
              result=normalized(source.completeUnavailable(issuerHandle,read.value.ticket,localReason(received.code),at));
            }else{
              const body=stream.consumeBody(received.value,t.handle,'final');if(!body.ok)return close(body.code);
              result=normalized(source.complete(issuerHandle,read.value.ticket,{status:200,body_json:body.value,observed_at:at,cleanup:'confirmed'}));
            }
          }
          if(!result.ok)return result;
          const state:Stability=t.initial.state!=='rows'||result.value.state!=='rows'||t.initial.rows[0].sys_scope===null||result.value.rows[0].sys_scope===null?'unverified'
            :JSON.stringify(t.initial.rows)===JSON.stringify(result.value.rows)?'stable':'changed';
          states.push(state);tableStates.push(Object.freeze({name,state}));if(state!=='stable')note('final.table',state);
        }
        const finished=source.finish(issuerHandle);if(!finished.ok)return close(finished.code);
        const end=checkpoint(at,signal);if(!end.ok)return end;
        if(stream.stats().reserved!==0||stream.stats().cleanup==='unconfirmed')return close('internal_review_error');
        const state:Stability=states.includes('changed')?'changed':rejected||states.includes('unverified')?'unverified':'stable';
        let seal:SyntheticScopeFinalSeal|null=null;
        if(state==='stable'){seal=Object.freeze(Object.create(null)) as SyntheticScopeFinalSeal;seals.set(seal,Object.freeze({state:'stable',tables:tables.size,synthetic:true}));}
        phase='finished';return {ok:true as const,value:Object.freeze({state,seal,tables:Object.freeze(tableStates)})};
      }catch{return close('internal_review_error');}finally{busy=false;}
    },
    consumeSeal(seal:SyntheticScopeFinalSeal) {
      if(primary)return close();
      const summary=seals.get(seal);if(phase!=='finished'||!summary)return close('evidence_binding_mismatch');
      seals.delete(seal);return {ok:true as const,value:summary};
    },
    stop(code:'cancelled'|'deadline_exceeded') {
      if(code!=='cancelled'&&code!=='deadline_exceeded')return close('invalid_input');
      stream.stop(code);return close(code);
    },
    close() { return close(); },
    stats() { return Object.freeze({...stream.stats(),composition_primary:primary??null,composition_phase:phase,diagnostics:Object.freeze([...diagnostics])}); },
  })};
}
