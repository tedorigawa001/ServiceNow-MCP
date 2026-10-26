/** Development-only observer wrapper; its fixture claims never enter the actual session registry. */
import { BoundedReadSession, BOUNDED_LIMITS, BoundedReadError, type ReadSnapshot, type BoundedReadOptions } from '../servicenow/bounded-read.js';
import { registerFixtureReviewSession,markFixtureAuthReady,revokeFixtureReviewSession } from './abort-scope-evidence-fixture-lifecycle.js';
export class FixtureReadSession{
  readonly #real:BoundedReadSession;
  readonly #timer:ReturnType<typeof setTimeout>;
  readonly #remove:()=>void;
  #authenticated=false;
  constructor(snapshot:ReadSnapshot,options:BoundedReadOptions={}){
    registerFixtureReviewSession(this,{});
    const cancelled=()=>revokeFixtureReviewSession(this,'cancelled');
    options.signal?.addEventListener('abort',cancelled,{once:true});
    this.#remove=()=>options.signal?.removeEventListener('abort',cancelled);
    try{this.#real=new BoundedReadSession(snapshot,options);}catch(error){this.#remove();throw error;}
    this.#timer=setTimeout(()=>revokeFixtureReviewSession(this,'deadline_exceeded'),options.limits?.deadlineMs??BOUNDED_LIMITS.deadlineMs);
    if(options.signal?.aborted)cancelled();
  }
  async get(path:string,final=false){
    try{const result=await this.#real.get(path,final);this.#authenticated=true;markFixtureAuthReady(this);return result;}
    catch(error){
      const reason=error instanceof BoundedReadError?error.code:'internal_review_error';
      if(!this.#authenticated||['cancelled','closed','deadline_exceeded','authentication_failed','access_denied','receive_budget_exceeded','payload_budget_exceeded'].includes(reason))revokeFixtureReviewSession(this,reason);
      throw error;
    }
  }
  stats(){return this.#real.stats();}
  setPhaseReserve(ms:number){this.#real.setPhaseReserve(ms);}
  chargePayload(payload:string){
    try{return this.#real.chargePayload(payload);}catch(error){
      if(error instanceof BoundedReadError&&['cancelled','closed','deadline_exceeded','payload_budget_exceeded'].includes(error.code))revokeFixtureReviewSession(this,error.code);
      throw error;
    }
  }
  close(){revokeFixtureReviewSession(this,'closed');clearTimeout(this.#timer);this.#remove();this.#real.close();}
}
