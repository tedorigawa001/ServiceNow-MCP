/** Excluded development worker engine. Parses as data; never evaluates reviewed JavaScript. */
import {parse} from 'acorn';
import {extractReviewXml,ExtractionError} from './update-xml.js';
import {analyzeScopedCandidates,AnalysisLimitError,type AstNode} from './scope-analysis.js';
import {createSyntheticScopeChannel} from './abort-scope-evidence-channel.js';
import {scopeRequestSchema,scopeResponseSchema,scopeAssetRejectionSchema,scopeWireLimit,SCOPE_WIRE_LIMITS,type ScopeRequest,type ScopeResponse} from './abort-scope-evidence-protocol.js';
import {createSyntheticScopeOwnerIssuer} from './abort-scope-evidence-owner.js';
type Prepare=Extract<ScopeRequest,{kind:'prepare'}>;
type Plan=Extract<ScopeResponse,{kind:'prepare_ok'}>['body'];
export function createFixtureScopeWorkerEngine(){
  const issuer=createSyntheticScopeOwnerIssuer(),session=issuer.issueSession(),worker=issuer.issueWorker(session);
  if(!worker.ok)throw Error('internal_review_error');const owner=issuer.createOwner(session,worker.value);if(!owner.ok)throw Error('internal_review_error');
  const workerHandle=worker.value,ownerHandle=owner.value;
  let channel:ReturnType<typeof createSyntheticScopeChannel>|undefined,stopped=false;
  type Job={use:Parameters<typeof issuer.beginPrepare>[1];job:Parameters<typeof issuer.beginPrepare>[2]};
  const jobs=new Map<number,Job>();
  function prepare(request:Prepare):Plan{
    const b=request.body,asset=extractReviewXml(b.payload,b.metadata.name);
    if(asset.table!=='sys_script'||asset.sys_id!==b.target.asset_sys_id)throw new ExtractionError('identity_mismatch');
    const base={target:b.target,payload_hash:asset.payload_hash,code_hash:asset.code_hash};
    const no=(reason:Extract<Plan,{state:'not_needed'}>['reason']):Plan=>({...base,state:'not_needed',reason});
    let ast:AstNode;try{ast=parse(asset.code,{ecmaVersion:'latest',sourceType:'script',locations:true}) as unknown as AstNode;}
    catch{throw new ExtractionError('javascript_parse_failed');}
    if(asset.when!=='before')return no('unsupported_when');
    const sites:Extract<Plan,{state:'needs_observation'}>['sites']=[];
    let receiver=false,argument=false;
    analyzeScopedCandidates(ast,'before',()=>{},{allowDeclaredEntry:true,constants:true,abortScope:{
      unresolved(){receiver=true;},call(entry,call){
        if(call.receiver==='other')return;if(call.receiver==='unknown'){receiver=true;return;}
        if(call.enabled===null){argument=true;return;}if(!call.enabled)return;
        if(sites.length>=100)throw new ExtractionError('finding_limit');
        const loc=entry.loc as unknown as {start:{line:number;column:number};end:{line:number;column:number}};
        sites.push({site_id:sites.length+1,start:{...loc.start},end:{...loc.end}});
      }}});
    if(receiver)return no('receiver_unresolved');if(argument)return no('argument_unresolved');if(!sites.length)return no('no_target_call');
    if(!asset.collection||asset.collection==='global')return no('declared_table_unknown');
    const job=issuer.issueJob(session,workerHandle,b.target.asset_sys_id);if(!job.ok)throw Error('internal_review_error');
    const use=issuer.reserve(ownerHandle,job.value);if(!use.ok)throw Error('internal_review_error');
    const phase=issuer.beginPrepare(ownerHandle,use.value,job.value);if(!phase.ok)throw Error('internal_review_error');
    const context={instance_binding:b.instance_binding,...b.target,payload_hash:asset.payload_hash,code_hash:asset.code_hash,started_at:b.started_at,deadline_ms:b.deadline_ms};
    const prepared=issuer.finishPrepareEvidence(ownerHandle,phase.value,job.value,context,{source:'sys_update_xml.payload',target_version:'update_set_payload',asset_table:'sys_script',
      asset_sys_id:asset.sys_id,payload_hash:asset.payload_hash,code_hash:asset.code_hash,retrieved_at:b.retrieved_at,collection:asset.collection,sys_scope:asset.sys_scope});
    if(!prepared.ok)throw Error('evidence_invalid');jobs.set(request.job_id,{job:job.value,use:use.value});
    return {...base,state:'needs_observation',plan_id:1,collection:asset.collection,sites};
  }
  function close(){stopped=true;jobs.clear();issuer.closeOwner(ownerHandle);issuer.closeSession(session);}
  return Object.freeze({close,handle(wire:unknown):string|null{
    if(stopped)return null;let req:ScopeRequest|undefined;
    try{
      if(typeof wire!=='string'||wire.length>SCOPE_WIRE_LIMITS.prepareRequest||Buffer.byteLength(wire)>SCOPE_WIRE_LIMITS.prepareRequest)throw Error();
      const parsed=scopeRequestSchema.safeParse(JSON.parse(wire));if(!parsed.success)throw Error();req=parsed.data;
      if(Buffer.byteLength(wire)>scopeWireLimit(req.kind))throw Error();
      channel??=createSyntheticScopeChannel({run_nonce:req.run_nonce,worker_generation:req.worker_generation});
      const begun=channel.begin(req.kind,req.job_id,req.body);if(!begun.ok)throw Error();
      const expected=JSON.parse(begun.value) as ScopeRequest;
      if(expected.request_id!==req.request_id||expected.run_nonce!==req.run_nonce||expected.worker_generation!==req.worker_generation)throw Error();
      const envelope={protocol:req.protocol,run_nonce:req.run_nonce,worker_generation:req.worker_generation,request_id:req.request_id,job_id:req.job_id};
      let response:unknown;
      if(req.kind==='hello')response={...envelope,kind:'hello_ok',body:{accepted:true}};
      else if(req.kind==='prepare'){
        try{response={...envelope,kind:'prepare_ok',body:prepare(req)};}
        catch(error){
          if(!(error instanceof ExtractionError)&&!(error instanceof AnalysisLimitError))throw error;
          const reason=error instanceof ExtractionError?error.reason:error instanceof AnalysisLimitError?'analysis_limit':'analysis_failed';
          const allowed=scopeAssetRejectionSchema.safeParse(reason);response={...envelope,kind:'error',body:{stage:'prepare',code:allowed.success?allowed.data:'analysis_failed'}};
        }
      }else{
        const j=jobs.get(req.job_id);if(!j)throw Error();
        if(req.kind==='compare'){
          const result=issuer.compareAndConsume(ownerHandle,j.use,j.job,req.body.compared_at);
          if(!result.ok){response={...envelope,kind:'error',body:{stage:'compare',code:result.reason}};}
          else{const accepted=issuer.acceptComparison(ownerHandle,result.value);if(!accepted.ok)throw Error();
            response={...envelope,kind:'compare_ok',body:{plan_id:1,payload_hash:req.body.payload_hash,code_hash:req.body.code_hash,result:accepted.value}};}
          jobs.delete(req.job_id);
        }else{
          const initial=req.kind==='observe_initial',phase=initial?issuer.beginInitial(ownerHandle,j.use,j.job):issuer.beginFinal(ownerHandle,j.use,j.job);
          if(!phase.ok)throw Error();const done=initial?issuer.finishInitialEvidence(ownerHandle,phase.value,j.job,req.body.observation):issuer.finishFinalEvidence(ownerHandle,phase.value,j.job,req.body.observation);
          if(!done.ok)throw Error();response={...envelope,kind:initial?'observe_initial_ok':'observe_final_ok',body:{plan_id:1,phase:initial?'initial':'final',accepted:true}};
        }
      }
      const valid=scopeResponseSchema.parse(response),json=JSON.stringify(valid);
      if(Buffer.byteLength(json)>scopeWireLimit(valid.kind))throw Error();
      if(!channel.receive(channel.peer,json).ok)close();
      return json;
    }catch{
      close();if(!req)return null;
      return JSON.stringify({protocol:req.protocol,run_nonce:req.run_nonce,worker_generation:req.worker_generation,request_id:req.request_id,job_id:req.job_id,
        kind:'error',body:{stage:req.kind==='hello'?'protocol':req.kind==='observe_initial'?'initial':req.kind==='observe_final'?'final':req.kind,code:'internal_review_error'}});
    }
  }});
}
