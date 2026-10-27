/** Test-only outer owner. Synthetic Responses/payload, real Worker IPC; no production binding or issuer. */
import {Worker,type WorkerOptions} from 'node:worker_threads';
import {FixtureAccountingSession} from '../../../src/review/abort-scope-evidence-accounting-fixture.js';
import {createFixtureOAuthSourceTransport,type FixtureHandoffRequest} from '../../../src/review/abort-scope-evidence-oauth-handoff.js';
import {FixtureScopeWorkerReview} from '../../../src/review/abort-scope-evidence-worker-review.js';
import {scopeDiagnosticCodeSchema,type ScopeDiagnostic,type ScopeRequest} from '../../../src/review/abort-scope-evidence-protocol.js';
type Prepare=Extract<ScopeRequest,{kind:'prepare'}>['body'];
type Source=(request:FixtureHandoffRequest,signal:AbortSignal)=>Response|Promise<Response>;
export class ChainStop extends Error{
  constructor(readonly stage:ScopeDiagnostic['stage'],readonly code:ScopeDiagnostic['code']){super(code);}
}
export function createOAuthScopeRun(options:{session:FixtureAccountingSession;started:number;source:Source;input:Prepare;
  afterCompare?:()=>void;workerFactory?:(url:URL,options:WorkerOptions)=>Worker}){
  const started=options.started,controller=new AbortController();
  const elapsed=()=>performance.now()-started,remaining=()=>60000-elapsed();
  const made=createFixtureOAuthSourceTransport(options.session,options.input.target.update_set_sys_id,options.source);
  if(!made.ok)throw new ChainStop('owner','internal_review_error');
  const transport=made.value,workers:Worker[]=[],workerLogs:string[]=[],budgets:number[]=[];
  const worker=new FixtureScopeWorkerReview({signal:controller.signal,remainingMs:()=>{const left=remaining();budgets.push(left);return left;},
    factory(url,settings){const native=options.workerFactory?.(url,settings)??new Worker(url,settings);workers.push(native);
      native.stdout.on('data',chunk=>workerLogs.push(String(chunk)));native.stderr.on('data',chunk=>workerLogs.push(String(chunk)));return native;}});
  let source:Extract<ReturnType<typeof transport.root.adoptSource>,{ok:true}>['value']|undefined,used=false;
  let beforeFinish:ReturnType<typeof transport.stats>|undefined,afterFinish:ReturnType<typeof transport.stats>|undefined;
  const cancel=()=>{transport.root.cancel();options.session.close();};controller.signal.addEventListener('abort',cancel,{once:true});
  function take<T>(result:{ok:true;value:T}|{ok:false;code:string},stage:ScopeDiagnostic['stage']):T{
    if(result.ok)return result.value;
    const parsed=scopeDiagnosticCodeSchema.safeParse(result.code);throw new ChainStop(stage,parsed.success?parsed.data:'internal_review_error');
  }
  return Object.freeze({
    cancel:()=>controller.abort(),
    async run(){
      if(used)throw new ChainStop('owner','invalid_state');used=true;
      try{
        take(await transport.bootstrap.run(),'owner');source=take(transport.root.adoptSource(take(transport.root.offer(),'owner')),'owner');
        const prepared=take(await source.prepare(),'initial');if(prepared.state!=='prepared')throw new ChainStop('initial','evidence_missing');
        const plan=await worker.prepare({...options.input,started_at:new Date(0).toISOString(),retrieved_at:new Date(elapsed()).toISOString(),deadline_ms:60000});
        if(plan.state==='needs_observation'){
          take(await source.initial(plan.collection!),'initial');
          const final=take(await source.finalize(),'final');if(final.state!=='stable')throw new ChainStop('final','evidence_missing');
          const pair=take(source.consumeObservations(plan.collection!),'final');
          await worker.observe(plan.job_id,'initial',pair.initial);await worker.observe(plan.job_id,'final',pair.final);
          await worker.compare(plan.job_id,new Date(elapsed()).toISOString());options.afterCompare?.();
        }else take(await source.finalize(),'final');
      }catch(error){
        const code=error instanceof ChainStop?error.code:scopeDiagnosticCodeSchema.safeParse(error&&typeof error==='object'&&'code'in error?error.code:undefined);
        worker.stop(error instanceof ChainStop?error.stage:'owner',typeof code==='string'?code:code.success?code.data:'internal_review_error');
      }
      beforeFinish=transport.stats();const result=await worker.finish();afterFinish=transport.stats();return result;
    },
    stats:()=>transport.stats(),
    observations:()=>({beforeFinish,afterFinish,budgets:[...budgets],workerLogs:[...workerLogs],threadIds:workers.map(w=>w.threadId)}),
    async close(){controller.signal.removeEventListener('abort',cancel);transport.root.close();options.session.close();await worker.close();},
  });
}
