/** Development-only accounting session. Synthetic baseline/events, no actual session or fetch. */
import { BOUNDED_LIMITS, BoundedReadError, type BoundedReadOptions, type ReadFailureCode } from '../servicenow/bounded-read.js';
import type { PreparedTransportBudget, PreparedTransportOutcome, PreparedFinalSkip, PreparedAttemptSettlement } from '../servicenow/review-transport-budget.js';
import { registerFixtureReviewSession,markFixtureAuthReady,revokeFixtureReviewSession } from './abort-scope-evidence-fixture-lifecycle.js';
export class FixtureAccountingSession{
  private readonly limits:Record<keyof typeof BOUNDED_LIMITS,number>;
  private readonly controller=new AbortController();
  private readonly started=performance.now();
  private readonly timer:ReturnType<typeof setTimeout>;
  private requests=0;private receivedBytes=0;private payloadBytes=0;private evidenceBytes=0;
  private transportOwned=false;private busy=false;private disposed=false;private reason?:ReadFailureCode;
  readonly authMode='per-user' as const;
  constructor(raw:BoundedReadOptions['limits']={}){
    this.limits={...BOUNDED_LIMITS};
    for(const [k,v] of Object.entries(raw)){
      if(!(k in BOUNDED_LIMITS)||!Number.isInteger(v)||v!<1||v!>BOUNDED_LIMITS[k as keyof typeof BOUNDED_LIMITS])throw Error('invalid_input');
      this.limits[k as keyof typeof BOUNDED_LIMITS]=v!;
    }
    registerFixtureReviewSession(this,{},()=>this.claimTransportBudget());
    this.timer=setTimeout(()=>this.stop('deadline_exceeded'),this.limits.deadlineMs);
  }
  /** A synthetic baseline event, not stats copied from any real session. */
  async baseline(body:string,event:()=>unknown){
    this.check();if(this.requests||this.transportOwned)throw Error('invalid_state');
    this.requests++;this.receivedBytes+=Buffer.byteLength(body);await event();this.check();JSON.parse(body);markFixtureAuthReady(this);
  }
  stats(){return {requests:this.requests,received_bytes:this.receivedBytes,payload_bytes:this.payloadBytes};}
  private stop(code:ReadFailureCode){this.reason??=code;revokeFixtureReviewSession(this,this.reason);this.controller.abort();}
  private check(){
    if(performance.now()-this.started>=this.limits.deadlineMs)this.stop('deadline_exceeded');
    if(this.reason)throw new BoundedReadError(this.reason);
    if(this.disposed)throw new BoundedReadError('closed');
  }
  close(){if(this.disposed)return;this.disposed=true;clearTimeout(this.timer);this.stop(this.reason??'closed');}
  async get(_path:string):Promise<never>{this.check();throw new BoundedReadError('invalid_input');}
  chargePayload(_body:string):never{this.check();throw new BoundedReadError('invalid_input');}
  setPhaseReserve(_n:number):never{this.check();throw new BoundedReadError('invalid_input');}
  private chargePayloadBytes(payload:string){
    const n=Buffer.byteLength(payload);this.payloadBytes+=n;
    if(this.payloadBytes>this.limits.totalPayloadBytes){this.stop('payload_budget_exceeded');this.check();}
    if(n>this.limits.payloadBytes)throw new BoundedReadError('payload_limit');
  }
  /** Fixture-private one-shot accounting. Never attached to a real session. */
  private claimTransportBudget():PreparedTransportBudget {
    this.check();
    if(this.transportOwned||this.busy)throw new BoundedReadError('invalid_input');
    this.transportOwned=true;
    let reserved=4,final=false,cursor=0,evidenceClosed=false,active:{purpose:string;key:string;size:number;ordinal:1|2}|undefined;
    // A successful payload attempt opens one payload charge at the source boundary; the next dispatch closes it.
    let payloadReady=false;
    const slots=new Map<string,number>([['parent_final',2],['metadata_final',2]]);
    type Table={state:'pending'|'retryable'|'available'|'unavailable'|'not_completed';outcome:PreparedTransportOutcome|null};
    const tables=new Map<string,Table>();
    const reads=new Map<string,{ordinal:number;retry:boolean}>();
    const fail=(code:ReadFailureCode):never=>{this.stop(code);throw new BoundedReadError(code);};
    const check=()=>this.check();
    return Object.freeze({deadlineMs:this.limits.deadlineMs,requestTimeoutMs:this.limits.requestTimeoutMs,responseBytes:this.limits.responseBytes,authMode:this.authMode,signal:this.controller.signal,
      now:()=>{check();return performance.now()-this.started;},check,
      observationNow:()=>performance.now()-this.started,
      dispatch:(purpose:string,target:string|undefined,ordinal:1|2)=>{
        check();if(active||final!==purpose.endsWith('_final'))return fail('invalid_input');
        if(this.receivedBytes>=this.limits.totalBytes)return fail('receive_budget_exceeded');
        if(purpose.startsWith('table_')&&evidenceClosed)throw Error('scope_evidence_limit');
        if(!['parent_initial','release_rows','metadata_initial','payload','table_initial','parent_final','metadata_final','table_final'].includes(purpose)
          ||!([1,2] as number[]).includes(ordinal)||purpose.startsWith('table_')&&(!target||!/^[a-z][a-z0-9_]{0,79}$/.test(target)||target==='global'))return fail('invalid_input');
        const key=`${purpose}:${target??''}`,previous=reads.get(key);
        if(previous?ordinal!==previous.ordinal+1||!previous.retry:ordinal!==1)return fail('invalid_input');
        if(purpose==='table_initial'&&!tables.has(target!)){
          if(tables.size>=8||this.requests+reserved+4>this.limits.requests)throw Error('scope_evidence_limit');
          tables.set(target!,{state:'pending',outcome:null});slots.set(`table_final:${target}`,2);reserved+=2;
        }
        const slot=purpose.startsWith('table_')?`table_final:${target}`:purpose;
        if(final){
          const keys=[...slots.keys()];if(keys[cursor]!==slot||(slots.get(slot)??0)<1)return fail('invalid_input');
          if(purpose==='table_final'&&tables.get(target!)?.state!=='available')return fail('invalid_input');
          slots.set(slot,slots.get(slot)!-1);reserved--;
        }else if(this.requests+1+reserved>this.limits.requests)throw new BoundedReadError('request_budget_exceeded');
        if(this.requests>=this.limits.requests)return fail('request_budget_exceeded');
        this.requests++;reads.set(key,{ordinal,retry:false});active={purpose,key,size:0,ordinal};payloadReady=false;
      },
      chunk:(n:number)=>{
        check();if(!active||!Number.isSafeInteger(n)||n<0)return fail('invalid_input');
        // Payload bytes are charged once on the decoded payload string (chargePayload), not on response chunks.
        const size=active.size+n,g=this.receivedBytes+n,e=this.evidenceBytes+(active.purpose.startsWith('table_')?n:0);
        if(![size,g,e].every(Number.isSafeInteger))return fail('receive_budget_exceeded');
        active.size=size;this.receivedBytes=g;this.evidenceBytes=e;
        if(e>=262144)evidenceClosed=true;
        if(g>this.limits.totalBytes||size>this.limits.responseBytes)return fail('receive_budget_exceeded');
        if(active.purpose.startsWith('table_')&&(size>16384||e>262144))throw Error('scope_evidence_limit');
      },
      settle:(result:PreparedAttemptSettlement)=>{
        if(!active)return;
        const retry=result.retryable&&active.ordinal===1&&result.cleanup==='confirmed';
        payloadReady=active.purpose==='payload'&&result.outcome==='body'&&result.cleanup==='confirmed';
        reads.get(active.key)!.retry=retry;
        if(active.purpose==='table_initial'){
          const table=tables.get(active.key.slice('table_initial:'.length))!;table.outcome=result.outcome;
          table.state=retry?'retryable':result.outcome==='body'&&result.cleanup==='confirmed'?'available':'unavailable';
        }
        if(final&&!retry){const key=active.purpose==='table_final'?`table_final:${active.key.slice('table_final:'.length)}`:active.purpose;
          reserved-=slots.get(key)??0;slots.set(key,0);cursor++;}
        active=undefined;
      },
      enterFinal:()=>{check();if(active||final)return fail('invalid_input');
        for(const table of tables.values())if(table.state==='pending'||table.state==='retryable')table.state='not_completed';
        final=true;},
      rejectInitialTable:(target:string)=>{
        check();const table=tables.get(target);
        if(active||final||table?.state!=='available'||table.outcome!=='body')return fail('invalid_input');
        table.state='unavailable';
      },
      skipFinal:(target:string):PreparedFinalSkip=>{
        check();const key=`table_final:${target}`,table=tables.get(target),left=slots.get(key);
        if(!final||active||!table||[...slots.keys()][cursor]!==key||!left)return fail('invalid_input');
        if(table.state!=='unavailable'&&table.state!=='not_completed'&&!evidenceClosed)return fail('invalid_input');
        const reason=evidenceClosed?'evidence_budget_exhausted':table.state==='not_completed'?'initial_not_completed':'initial_unavailable';
        reserved-=left;slots.set(key,0);cursor++;const read=reads.get(`${key}`);if(read)read.retry=false;
        return Object.freeze({state:'skipped',reason,initial_outcome:table.outcome,released_attempts:left,synthetic:true,evidence_issuance:'disabled'});
      },
      chargePayload:(payload:string)=>{
        check();if(typeof payload!=='string'||!payloadReady||active)return fail('invalid_input');
        payloadReady=false;this.chargePayloadBytes(payload);
      },
      stop:(code:string)=>this.stop(['cancelled','closed','deadline_exceeded','authentication_failed','access_denied','receive_budget_exceeded','payload_budget_exceeded'].includes(code)?code as ReadFailureCode:'invalid_input'),
      stats:()=>Object.freeze({...this.stats(),evidence_bytes:this.evidenceBytes,reserved}),
    });
  }

}
