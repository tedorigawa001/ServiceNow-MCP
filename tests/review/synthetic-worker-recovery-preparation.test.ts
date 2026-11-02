import {expect,it} from 'vitest';
import {createSyntheticSoftRecoveryIssuer,type SyntheticSoftFacts} from '../support/review/synthetic-soft-recovery.js';
import {prepareSyntheticWorkerRecoveryInputs} from '../support/review/synthetic-worker-recovery-input.js';
const points=['request_check_unstarted','request_check_existing','ready_timer','ready_reply_check','send_check','analyze_timer','analyze_reply_check'] as const;
type Point=typeof points[number];
const O='2026-11-02T00:00:01.000Z',U='2026-11-02T00:00:02.000Z',id=(n:number)=>n.toString(16).padStart(32,'0');
function fixture(point:Point='analyze_timer'){
  const s={run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},started_at:'2026-11-02T00:00:00.000Z',deadline_ms:60000,observed_at:O,upper_utc:U};
  const base={kind:'worker_deadline',phase:'analysis',supervisor:{},request:{},input:{},point},refs={worker:{},generation:{}};
  const facts=(point==='request_check_unstarted'?{...base,worker_state:'none'}:point==='ready_timer'||point==='ready_reply_check'?{...base,...refs,worker_state:'starting'}:point==='request_check_existing'?{...base,...refs,worker_state:'ready'}:{...base,...refs,worker_state:'ready',id:7,...(point==='send_check'?{allocation:{}}:{job:{}})}) as Extract<SyntheticSoftFacts,{kind:'worker_deadline'}>;
  let check:()=>string|undefined=()=>undefined;const owner=createSyntheticSoftRecoveryIssuer(s,facts,()=>check()),b=owner.bind(s),r=owner.claimRecovery(b,owner.observe(b,facts)),lease=owner.beginWorkerClosure(b,r);
  const evidence=facts.worker_state==='none'?owner.confirmWorkerUnstarted(b,lease,facts):owner.settleWorkerClosure(b,lease,{context:facts,termination:'confirmed',cleanup:'complete'});
  const input={source:s.source,budget:s.budget,release:s.release,origin:s.origin,window:{},verify:{},accounting:{requests:10,received_bytes:20,payload_bytes:30},rows:[id(1)],completed:[] as unknown[],inputs:[{receipt:facts.input,update_xml_sys_id:id(1),retrieved_at:U,state:'retained'}] as unknown[],collection_status:'complete',consistency:'unverified'};
  return {s,facts,owner,b,evidence,input,arm:(fn:()=>string|undefined)=>{check=fn;},prepare:()=>owner.prepareWorkerRecovery(b,evidence,input)};
}
it('privately transfers the same-owner unconsumed closure without using it for a generation',()=>{
  const f=fixture(),p=f.prepare();expect(Object.keys(p)).toEqual([]);expect(f.owner.inspect()).toMatchObject({state:'worker_prepared',worker_closure:{evidence_pending:false},worker_preparation:{held:true,transfers:1,generation_uses:0,verify_attempts:0,new_generations:0}});
});
it('rejects a preparation that loses the already-accepted upper input time',()=>{
  const f=fixture();(f.input.inputs[0] as {retrieved_at:string}).retrieved_at=O;expect(f.prepare).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({state:'failed',worker_preparation:{held:false}});
});
it('does not hide an undiscarded HeldClosure behind normal close',()=>{const f=fixture();f.prepare();expect(()=>f.owner.close(f.b)).toThrow('internal_review_error');expect(f.owner.inspect().worker_preparation?.held).toBe(false);});
it('discards held preparation once without using the generation proof and permits normal close',()=>{
  const f=fixture(),p=f.prepare();f.owner.discardWorkerRecoveryPreparation(f.b,p);expect(f.owner.inspect()).toMatchObject({state:'consumed',worker_preparation:{held:false,handle_pending:false,transfers:1,generation_uses:0}});f.owner.close(f.b);expect(f.owner.inspect().time).toBeNull();
});
it.each(points)('keeps same-root time and prefix with no verify or generation use for %s',point=>{
  const f=fixture(point);let guards=0;f.arm(()=>{guards++;return undefined;});const p=f.prepare();expect(guards).toBe(2);
  expect(f.owner.inspect()).toMatchObject({time:{started_at:f.s.started_at,deadline_ms:60000,observed_at:O,upper_utc:U},worker_preparation:{selected:1,completed:0,not_processed:1,retained_inputs:1,accounting:{requests:10,received_bytes:20,payload_bytes:30},held:true,transfers:1,generation_uses:0,verify_attempts:0,new_generations:0}});
  f.owner.discardWorkerRecoveryPreparation(f.b,p);expect(guards).toBe(4);
});
it('pure value boundary preserves completed reasons and input times, including the active unprocessed receipt',()=>{
  const f=fixture();f.input.rows=[id(1),id(2),id(3),id(4)];f.input.completed=[{state:'reviewed',update_xml_sys_id:id(1)},{state:'result_omitted',update_xml_sys_id:id(2),reason:'response_limit'},{state:'rejected',update_xml_sys_id:id(3),reason:'invalid_xml'}];
  f.input.inputs=[{receipt:{},update_xml_sys_id:id(1),retrieved_at:O,state:'completed'},{receipt:{},update_xml_sys_id:id(2),retrieved_at:O,state:'completed'},{receipt:f.facts.input,update_xml_sys_id:id(4),retrieved_at:U,state:'retained'}];
  const v=prepareSyntheticWorkerRecoveryInputs(f.s,f.facts,f.input);expect(v.assets).toEqual([...f.input.completed,{state:'not_processed',update_xml_sys_id:id(4),reason:'deadline_exceeded'}]);expect(v.inputs.map(x=>[x.retrieved_at,x.state])).toEqual([[O,'completed'],[O,'completed'],[U,'not_processed']]);
  f.input.rows=[];f.input.completed=[];f.input.inputs=[];expect(v.assets).toHaveLength(4);expect(Object.isFrozen(v.assets)).toBe(true);expect(v.inputs[2].receipt).toBe(f.facts.input);
});
it.each(['requests','received_bytes','payload_bytes'] as const)('accepts the exact %s cap without charging or dispatching',key=>{
  const f=fixture();f.input.accounting[key]=key==='requests'?210:key==='received_bytes'?16777216:8388608;f.prepare();expect(f.owner.inspect().worker_preparation?.accounting).toEqual(f.input.accounting);
});
it.each(['source','budget','release','origin'] as const)('refuses a mixed %s in strict inputs',key=>{
  const f=fixture();f.input[key]={};expect(f.prepare).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({state:'failed',worker_closure:{evidence_pending:false},worker_preparation:{held:false,transfers:0}});
});
it.each(['duplicate_row','foreign_completed','duplicate_completed','duplicate_receipt','duplicate_input_id','no_active','completed_active','foreign_active','time_before_o','time_after_u','time_reversal','reviewed_without_input','omitted_without_input','extra_field','initial_worker','missing_field','invalid_state','no_rows','no_inputs'] as const)('fails closed on incoherent preparation %s',kind=>{
  const f=fixture(),p=f.input.inputs[0] as {receipt:object;update_xml_sys_id:string;retrieved_at:string;state:string};
  if(kind==='duplicate_row')f.input.rows=[id(1),id(1)];
  if(kind==='foreign_completed')f.input.completed=[{state:'rejected',update_xml_sys_id:id(2),reason:'invalid_xml'}];
  if(kind==='duplicate_completed')f.input.completed=[{state:'rejected',update_xml_sys_id:id(1),reason:'invalid_xml'},{state:'rejected',update_xml_sys_id:id(1),reason:'invalid_xml'}];
  if(kind==='duplicate_receipt'){f.input.rows.push(id(2));f.input.inputs.push({...p,update_xml_sys_id:id(2)});}
  if(kind==='duplicate_input_id')f.input.inputs.push({...p,receipt:{}});
  if(kind==='no_active'||kind==='foreign_active')p.receipt={};
  if(kind==='completed_active'){p.state='completed';f.input.completed=[{state:'reviewed',update_xml_sys_id:id(1)}];}
  if(kind==='time_before_o')p.retrieved_at='2026-11-02T00:00:00.000Z';if(kind==='time_after_u')p.retrieved_at='2026-11-02T00:00:03.000Z';
  if(kind==='time_reversal'){f.input.rows.push(id(2));f.input.inputs.push({...p,receipt:{},update_xml_sys_id:id(2),retrieved_at:O});}
  if(kind==='reviewed_without_input'||kind==='omitted_without_input'){f.input.rows.push(id(2));f.input.completed=[kind==='reviewed_without_input'?{state:'reviewed',update_xml_sys_id:id(2)}:{state:'result_omitted',update_xml_sys_id:id(2),reason:'response_limit'}];}
  if(kind==='extra_field')Object.assign(f.input,{authority:true});if(kind==='initial_worker')Object.assign(f.input,{initial_worker:{}});if(kind==='missing_field')Reflect.deleteProperty(f.input,'verify');
  if(kind==='invalid_state')p.state='reviewed';if(kind==='no_rows')f.input.rows=[];if(kind==='no_inputs')f.input.inputs=[];
  expect(f.prepare).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({state:'failed',worker_preparation:{held:false,handle_pending:false},diagnostics:{hard:{code:'internal_review_error'}}});expect(f.prepare).toThrow();
});
it.each(['requests','received_bytes','payload_bytes'] as const)('rejects an over-cap %s prefix',key=>{
  const f=fixture();f.input.accounting[key]=key==='requests'?211:key==='received_bytes'?16777217:8388609;expect(f.prepare).toThrow('internal_review_error');
});
it.each([NaN,Infinity,-1,1.5])('refuses malformed accounting %s',value=>{const f=fixture();f.input.accounting.requests=value;expect(f.prepare).toThrow('internal_review_error');});
it.each([1,100,101])('bounds the selected set at %i targets',n=>{
  const f=fixture();f.input.rows=Array.from({length:n},(_,i)=>id(i+1));if(n===101)expect(f.prepare).toThrow();else{f.prepare();expect(f.owner.inspect().worker_preparation?.selected).toBe(n);}
});
it.each(['binding','evidence','discard'] as const)('refuses foreign %s without spending another root',kind=>{
  const a=fixture(),b=fixture();if(kind==='binding')expect(()=>a.owner.prepareWorkerRecovery(b.b,a.evidence,a.input)).toThrow();
  else if(kind==='evidence')expect(()=>a.owner.prepareWorkerRecovery(a.b,b.evidence,a.input)).toThrow();
  else{a.prepare();const p=b.prepare();expect(()=>a.owner.discardWorkerRecoveryPreparation(a.b,p)).toThrow();b.owner.discardWorkerRecoveryPreparation(b.b,p);expect(b.owner.inspect().state).toBe('consumed');return;}
  const p=b.prepare();expect(b.owner.inspect().worker_preparation?.held).toBe(true);b.owner.discardWorkerRecoveryPreparation(b.b,p);
});
it.each(['copy','consumed','double_prepare','old_consumer_after_transfer','double_discard','copy_preparation'] as const)('refuses copied/public/spent capability %s',kind=>{
  const f=fixture();expect(()=>{
    if(kind==='copy'){f.owner.prepareWorkerRecovery(f.b,{...f.evidence},f.input);return;}
    if(kind==='consumed'){const data=f.owner.consumeWorkerClosure(f.b,f.evidence);f.owner.prepareWorkerRecovery(f.b,data,f.input);return;}
    const p=f.prepare();if(kind==='double_prepare')f.prepare();else if(kind==='old_consumer_after_transfer')f.owner.consumeWorkerClosure(f.b,f.evidence);else if(kind==='copy_preparation')f.owner.discardWorkerRecoveryPreparation(f.b,{...p});else{f.owner.discardWorkerRecoveryPreparation(f.b,p);f.owner.discardWorkerRecoveryPreparation(f.b,p);}
  }).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({state:'failed',worker_preparation:{held:false,handle_pending:false}});
});
it.each(points.flatMap(point=>[1,2,3,4].map(at=>[point,at] as const)))('guards %s at prepare/discard boundary %i without restoring proof',(point,at)=>{
  const f=fixture(point);let n=0;f.arm(()=>++n===at?'cancelled':undefined);expect(()=>f.owner.discardWorkerRecoveryPreparation(f.b,f.prepare())).toThrow('cancelled');
  expect(n).toBe(at);expect(f.owner.inspect()).toMatchObject({state:'failed',worker_closure:{evidence_pending:false},worker_preparation:{held:false,handle_pending:false,transfers:at>=2?1:0,generation_uses:0,verify_attempts:0,new_generations:0},diagnostics:{soft:{kind:'worker_deadline',point},hard:{code:'cancelled'}}});
});
it.each(['cancelled','deadline_exceeded','receive_budget_exceeded'] as const)('retains hard reason %s after transfer and permits only terminal discard',code=>{
  const f=fixture(),p=f.prepare();f.owner.revoke(code);expect(()=>f.owner.discardWorkerRecoveryPreparation(f.b,p)).toThrow(code);expect(f.prepare).toThrow(code);expect(f.owner.inspect().time?.upper_utc).toBe(U);f.owner.discardTerminalTime();expect(f.owner.inspect().time).toBeNull();
});
it.each(['run','session','source','key','origin','budget','release'] as const)('refuses original %s mutation after transferring closure',key=>{
  const f=fixture(),p=f.prepare();f.s[key]={};expect(()=>f.owner.discardWorkerRecoveryPreparation(f.b,p)).toThrow('internal_review_error');expect(f.owner.inspect().worker_preparation?.held).toBe(false);
});
it('spends the proof before either preparation guard and drops held references before discard guards',()=>{
  const f=fixture(),seen:unknown[]=[];f.arm(()=>{const s=f.owner.inspect();seen.push([s.worker_closure?.evidence_pending,s.worker_preparation?.held]);return undefined;});const p=f.prepare();f.owner.discardWorkerRecoveryPreparation(f.b,p);expect(seen).toEqual([[false,false],[false,true],[false,false],[false,false]]);
});
it.each(['prepare','discard'] as const)('rejects otherwise-valid cleanup lease reentry during %s',step=>{
  const f=fixture(),p=step==='discard'?f.prepare():undefined;let once=false;f.arm(()=>{if(!once){once=true;try{f.owner.cleanupLease(f.b);}catch{}}return undefined;});expect(()=>step==='prepare'?f.prepare():f.owner.discardWorkerRecoveryPreparation(f.b,p!)).toThrow('internal_review_error');expect(f.owner.inspect().cleanup_pending).toBe(false);
});
it.each(['outer','window','verify','receipt','rows','state_getter'] as const)('does not execute Proxy/getter payload %s',kind=>{
  const f=fixture();let n=0;const proxy=(value:object)=>new Proxy(value,{get(){n++;throw Error('SECRET');}});
  let raw:unknown=f.input;if(kind==='outer')raw=proxy(f.input);if(kind==='window')f.input.window=proxy({});if(kind==='verify')f.input.verify=proxy({});if(kind==='receipt')(f.input.inputs[0] as {receipt:object}).receipt=proxy(f.facts.input);if(kind==='rows')f.input.rows=proxy(f.input.rows) as string[];
  if(kind==='state_getter')Object.defineProperty(f.input.inputs[0],'state',{get(){n++;throw Error('SECRET');}});
  expect(()=>f.owner.prepareWorkerRecovery(f.b,f.evidence,raw)).toThrow('internal_review_error');expect(n).toBe(0);expect(JSON.stringify(f.owner.inspect())).not.toContain('SECRET');
});
it('pins immutable data while never invoking verify, budget or worker operations',()=>{
  const f=fixture();let n=0;for(const o of [f.s.budget,f.input.verify,f.facts.supervisor])Object.defineProperty(o,'dispatch',{get(){n++;throw Error('SECRET');}});const p=f.prepare();f.input.rows=[];f.input.accounting.requests=210;f.input.completed.push({});f.input.inputs=[];
  expect(f.owner.inspect()).toMatchObject({worker_preparation:{selected:1,not_processed:1,retained_inputs:1,accounting:{requests:10,received_bytes:20,payload_bytes:30}}});f.owner.discardWorkerRecoveryPreparation(f.b,p);expect(n).toBe(0);expect(JSON.stringify(f.owner.inspect().worker_preparation)).not.toContain(U);expect(f.owner.inspect().time?.upper_utc).toBe(U);f.owner.close(f.b);expect(f.owner.inspect().time).toBeNull();
});
it.each(['window','verify','receipt'] as const)('does not treat primitive %s as a reference identity',key=>{
  const f=fixture();if(key==='receipt')Object.assign(f.input.inputs[0] as object,{receipt:'same-text'});else Object.assign(f.input,{[key]:'same-text'});expect(f.prepare).toThrow('internal_review_error');
});
it.each(['fractional','wrong_precision','invalid','null'] as const)('refuses malformed retrieved UTC %s',kind=>{
  const f=fixture();Object.assign(f.input.inputs[0] as object,{retrieved_at:kind==='fractional'?'2026-11-02T00:00:02Z':kind==='wrong_precision'?'2026-11-02T00:00:02.00Z':kind==='null'?null:'not-a-date'});expect(f.prepare).toThrow('internal_review_error');
});
it('does not accept zero inputs even when observed UTC equals retained U',()=>{
  const f=fixture(),s={...f.s,upper_utc:O},owner=createSyntheticSoftRecoveryIssuer(s,f.facts),b=owner.bind(s),r=owner.claimRecovery(b,owner.observe(b,f.facts)),lease=owner.beginWorkerClosure(b,r),e=owner.settleWorkerClosure(b,lease,{context:f.facts,termination:'confirmed',cleanup:'complete'});
  expect(()=>owner.prepareWorkerRecovery(b,e,{...f.input,inputs:[]})).toThrow('internal_review_error');
});
it('bounds one hundred inputs while retaining their times and the unique active receipt',()=>{
  const f=fixture();f.input.rows=Array.from({length:100},(_,i)=>id(i+1));f.input.inputs=f.input.rows.map((rid,i)=>({receipt:i===99?f.facts.input:{},update_xml_sys_id:rid,retrieved_at:i===99?U:O,state:'retained'}));
  const v=prepareSyntheticWorkerRecoveryInputs(f.s,f.facts,f.input);expect(v.inputs).toHaveLength(100);expect(v.assets.every(a=>a.state==='not_processed'&&a.reason==='deadline_exceeded')).toBe(true);f.prepare();expect(f.owner.inspect().worker_preparation?.retained_inputs).toBe(100);
});
it.each(['failed','complete'] as const)('keeps original collection status %s without upgrading it',collection_status=>{
  const f=fixture();f.input.collection_status=collection_status;f.input.consistency='changed';f.prepare();expect(f.owner.inspect()).toMatchObject({worker_preparation:{collection_status,consistency:'changed'}});
});
it('retains prior hard and later cleanup diagnostics without restoring a held proof',()=>{
  const f=fixture(),sink=f.owner.cleanupLease(f.b);f.prepare();f.owner.revoke('cancelled');expect(()=>f.owner.recordCleanup(sink,'failed')).toThrow('cancelled');expect(f.owner.inspect()).toMatchObject({worker_preparation:{held:false},diagnostics:{hard:{code:'cancelled'},cleanup:{status:'failed'}}});
});
