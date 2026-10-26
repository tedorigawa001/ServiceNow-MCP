/** Development-only worker/result owner. No production source receipt, seal or public result authority. */
import {Worker,type WorkerOptions} from 'node:worker_threads';
import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {createSyntheticScopeChannel} from './abort-scope-evidence-channel.js';
import {scopeRequestSchema,scopeResponseSchema,scopeDiagnosticSchema,type ScopeRequest,type ScopeResponse,type ScopeDiagnostic,scopeAssetRejectionSchema} from './abort-scope-evidence-protocol.js';
const resultSchema=scopeResponseSchema.options[4].shape.body.shape.result;
const rowSchema=z.strictObject({job_id:z.number().int().min(1).max(100),update_xml_sys_id:z.string().regex(/^[a-f0-9]{32}$/),
  state:z.enum(['not_needed','rejected','comparison_only','not_completed']),reason:z.enum(['no_target_call','unsupported_when','receiver_unresolved','argument_unresolved','declared_table_unknown',...scopeAssetRejectionSchema.options]).nullable(),
  site_count:z.number().int().min(0).max(100),scope_difference_candidate_count:z.number().int().min(0).max(100),comparison:resultSchema.nullable()}).refine(row=>{
    if(row.state==='comparison_only')return row.reason===null&&row.site_count>0&&row.comparison!==null&&row.scope_difference_candidate_count===
      (row.comparison.status==='compared'&&row.comparison.comparison==='different_reference'?row.site_count:0);
    if(row.comparison!==null||row.scope_difference_candidate_count!==0)return false;
    if(row.state==='not_completed')return row.reason===null;
    return row.site_count===0&&(row.state==='rejected'?scopeAssetRejectionSchema.safeParse(row.reason).success:
      ['no_target_call','unsupported_when','receiver_unresolved','argument_unresolved','declared_table_unknown'].includes(row.reason??''));
  });
export const fixtureScopeReviewSchema=z.strictObject({schema_version:z.literal('br006-fixture-result-0.1'),synthetic:z.literal(true),
  provenance:z.literal('fixture_input'),evidence_issuance:z.literal('disabled'),code_return_mode:z.literal('none'),review_status:z.literal('partial'),analysis_complete:z.literal(false),
  diagnostic:scopeDiagnosticSchema.nullable(),
  limitations:z.tuple([z.literal('source_receipt_binding_not_connected'),z.literal('public_review_integration_not_enabled')]),assets:z.array(rowSchema).max(100)}).refine(result=>
    result.assets.every((row,i)=>row.job_id===i+1)&&new Set(result.assets.map(row=>row.update_xml_sys_id)).size===result.assets.length
    &&result.assets.reduce((n,row)=>n+row.site_count,0)<=100&&(!result.diagnostic||result.assets.every(row=>row.state!=='comparison_only')));
type Row=z.infer<typeof rowSchema>;
type Plan=Extract<ScopeResponse,{kind:'prepare_ok'}>['body'];
type Options={remainingMs:()=>number;signal?:AbortSignal;factory?:(url:URL,options:WorkerOptions)=>Worker};
class FixtureWorkerError extends Error{constructor(readonly code:string){super(code);}}
export class FixtureScopeWorkerReview{
  private readonly channel=createSyntheticScopeChannel({run_nonce:randomBytes(32).toString('hex'),worker_generation:randomBytes(32).toString('hex')});
  private worker?:Worker;private started=false;private busy=false;private closing=false;private finished=false;
  private lastRemaining=60000;private cleanup:'not_started'|'confirmed'|'unconfirmed'='not_started';
  private closeWork?:Promise<void>;private pending?:{ready:boolean;complete:(error?:FixtureWorkerError,value?:string)=>void};
  private readonly jobs=new Map<number,{plan?:Plan;row:Row}>();
  constructor(private readonly options:Options){}
  private fail(stage:ScopeDiagnostic['stage'],code:ScopeDiagnostic['code']){
    this.channel.invalidate({stage,code});const error=new FixtureWorkerError(this.channel.diagnostic()!.code);
    if(!this.closing&&this.worker)void this.close();return error;
  }
  private remaining(){
    let n:number;try{n=this.options.remainingMs();}catch{throw this.fail('owner','internal_review_error');}
    if(!Number.isFinite(n)||n>this.lastRemaining||n>60000)throw this.fail('owner','invalid_observation_time');
    this.lastRemaining=n;return n;
  }
  private check(){
    if(this.remaining()<=0)throw this.fail('owner','deadline_exceeded');if(this.options.signal?.aborted)throw this.fail('owner','cancelled');
    const diagnostic=this.channel.diagnostic();if(diagnostic)throw new FixtureWorkerError(diagnostic.code);
    if(this.finished||this.closing)throw this.fail('owner','invalid_state');
  }
  private onMessage=(value:unknown)=>{
    const p=this.pending;if(!p){if(!this.closing){this.fail('protocol','protocol_invalid');void this.close();}return;}
    try{
      this.check();
      if(p.ready){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!('type'in value)||value.type!=='review_worker_ready')throw this.fail('protocol','worker_unavailable');p.complete(undefined,'');}
      else{const accepted=this.channel.receive(this.channel.peer,value);if(!accepted.ok)throw new FixtureWorkerError(accepted.diagnostic.code);p.complete(undefined,value as string);}
    }catch(error){p.complete(error instanceof FixtureWorkerError?error:this.fail('protocol','protocol_invalid'));}
  };
  private onError=()=>{if(this.closing)return;const error=this.fail('protocol',this.pending?.ready?'worker_unavailable':'worker_exited');this.pending?.complete(error);void this.close();};
  private exchange(wire?:string):Promise<string>{
    return new Promise((resolve,reject)=>{
      let done=false;let timer:ReturnType<typeof setTimeout>|undefined;
      const abort=()=>complete(this.fail('owner','cancelled'));
      const complete=(error?:FixtureWorkerError,value?:string)=>{
        if(done)return;done=true;if(timer)clearTimeout(timer);this.options.signal?.removeEventListener('abort',abort);this.pending=undefined;
        if(error)reject(error);else resolve(value!);
      };
      this.pending={ready:wire===undefined,complete};
      try{this.check();timer=setTimeout(()=>complete(this.fail('owner','deadline_exceeded')),Math.max(0,Math.ceil(this.remaining())));
        this.options.signal?.addEventListener('abort',abort,{once:true});if(wire!==undefined)this.worker!.postMessage(wire);
      }catch(error){complete(error instanceof FixtureWorkerError?error:this.fail('protocol','internal_review_error'));}
    });
  }
  private async send(kind:ScopeRequest['kind'],job:number|null,body:unknown):Promise<ScopeResponse>{
    const request=this.channel.begin(kind,job,body);if(!request.ok)throw new FixtureWorkerError(request.diagnostic.code);
    return scopeResponseSchema.parse(JSON.parse(await this.exchange(request.value)));
  }
  private async request(kind:ScopeRequest['kind'],job:number|null,body:unknown){
    if(this.busy)throw this.fail('protocol','invalid_state');this.busy=true;
    try{
      this.check();if(!this.started){this.started=true;
        try{this.worker=(this.options.factory??((url,options)=>new Worker(url,options)))(new URL(import.meta.url.endsWith('.ts')?'./abort-scope-evidence-worker-bootstrap.mjs':'./abort-scope-evidence-worker-entry.js',import.meta.url),
          {env:{},argv:[],execArgv:[],stdout:true,stderr:true,resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16,stackSizeMb:4}});
        }catch{throw this.fail('protocol','worker_unavailable');}
        this.worker.on('message',this.onMessage);this.worker.on('messageerror',this.onError);this.worker.on('error',this.onError);this.worker.on('exit',this.onError);
        this.worker.stdout.resume();this.worker.stderr.resume();await this.exchange();await this.send('hello',null,{});
      }
      return await this.send(kind,job,body);
    }catch(error){if(!this.channel.diagnostic())this.fail('protocol','internal_review_error');await this.close();throw error instanceof FixtureWorkerError?error:new FixtureWorkerError('internal_review_error');}
    finally{this.busy=false;}
  }
  async prepare(body:Extract<ScopeRequest,{kind:'prepare'}>['body']){
    this.check();if(this.busy)throw this.fail('protocol','invalid_state');
    try{body=scopeRequestSchema.options[1].shape.body.parse(structuredClone(body));}catch{throw this.fail('prepare','protocol_invalid');}
    if(this.jobs.size>=100)throw this.fail('prepare','scope_evidence_limit');
    const job=this.jobs.size+1;
    this.jobs.set(job,{row:{job_id:job,update_xml_sys_id:body.target.update_xml_sys_id,state:'not_completed',reason:null,site_count:0,scope_difference_candidate_count:0,comparison:null}});
    const response=await this.request('prepare',job,body),entry=this.jobs.get(job)!;
    if(response.kind==='error'){entry.row={...entry.row,state:'rejected',reason:scopeAssetRejectionSchema.parse(response.body.code)};return Object.freeze({job_id:job,state:'rejected' as const});}
    if(response.kind!=='prepare_ok')throw this.fail('prepare','protocol_invalid');entry.plan=response.body;
    if(response.body.state==='not_needed')entry.row={...entry.row,state:'not_needed',reason:response.body.reason};
    else entry.row.site_count=response.body.sites.length;
    return Object.freeze({job_id:job,state:response.body.state,collection:response.body.state==='needs_observation'?response.body.collection:null});
  }
  private binding(job:number){const plan=this.jobs.get(job)?.plan;if(plan?.state!=='needs_observation')throw this.fail('owner','evidence_binding_mismatch');return {plan_id:1 as const,payload_hash:plan.payload_hash,code_hash:plan.code_hash};}
  async observe(job:number,phase:'initial'|'final',observation:unknown){await this.request(phase==='initial'?'observe_initial':'observe_final',job,{...this.binding(job),observation});}
  async compare(job:number,comparedAt:string){
    const response=await this.request('compare',job,{...this.binding(job),compared_at:comparedAt});if(response.kind!=='compare_ok')throw this.fail('compare','protocol_invalid');
    const row=this.jobs.get(job)!.row,result=response.body.result;
    this.jobs.get(job)!.row={...row,state:'comparison_only',comparison:result,scope_difference_candidate_count:result.status==='compared'&&result.comparison==='different_reference'?row.site_count:0};
  }
  stop(stage:ScopeDiagnostic['stage'],code:ScopeDiagnostic['code']){this.fail(stage,code);this.pending?.complete(new FixtureWorkerError(this.channel.diagnostic()!.code));void this.close();}
  close():Promise<void>{
    if(this.closeWork)return this.closeWork;this.closing=true;
    this.pending?.complete(new FixtureWorkerError(this.channel.diagnostic()?.code??'internal_review_error'));
    this.closeWork=(async()=>{
      const worker=this.worker;if(!worker){this.cleanup='not_started';return;}
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{
        const terminated=worker.terminate();let left=0;try{left=Math.max(0,this.remaining());}catch{/* no fresh cleanup budget */}
        const confirmed=await Promise.race([terminated.then(()=>true,()=>false),new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),left);})]);
        this.cleanup=confirmed?'confirmed':'unconfirmed';
      }catch{this.cleanup='unconfirmed';}finally{if(timer)clearTimeout(timer);worker.off('message',this.onMessage);worker.off('messageerror',this.onError);
        worker.off('error',this.onError);worker.off('exit',this.onError);worker.on('error',()=>{});worker.stdout.destroy();worker.stderr.destroy();this.worker=undefined;}
      if(this.cleanup==='unconfirmed'){this.channel.invalidate({stage:'output',code:'internal_review_error'});this.channel.finishCleanup('unconfirmed');}
    })();return this.closeWork;
  }
  async finish(){
    if(this.finished)throw new FixtureWorkerError('invalid_state');this.finished=true;
    if(this.busy||[...this.jobs.values()].some(j=>j.row.state==='not_completed'))this.fail('output','evidence_missing');
    await this.close();const original=this.channel.diagnostic();
    try{if(this.remaining()<=0)this.fail('owner','deadline_exceeded');if(this.options.signal?.aborted)this.fail('owner','cancelled');}catch{this.fail('owner','invalid_observation_time');}
    const diagnostic=this.channel.diagnostic()??original;
    const assets=[...this.jobs.values()].map(j=>diagnostic&&j.row.state==='comparison_only'?{...j.row,state:'not_completed' as const,comparison:null,scope_difference_candidate_count:0}:j.row);
    const value=fixtureScopeReviewSchema.parse({schema_version:'br006-fixture-result-0.1',synthetic:true,provenance:'fixture_input',evidence_issuance:'disabled',code_return_mode:'none',
      review_status:'partial',analysis_complete:false,diagnostic:diagnostic?{...diagnostic,cleanup:this.cleanup}:null,
      limitations:['source_receipt_binding_not_connected','public_review_integration_not_enabled'],assets});
    if(Buffer.byteLength(JSON.stringify(value))>262144)throw new FixtureWorkerError('scope_evidence_limit');
    return Object.freeze({...value,assets:Object.freeze(value.assets.map(row=>Object.freeze(row)))});
  }
}
