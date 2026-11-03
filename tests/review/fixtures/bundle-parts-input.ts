import {aggregate} from './bp5-results.js';
/** DATA fixture only; never an owner, live source or accepted receipt. */
export function bundlePartsInput(mixed=false){
  const a=aggregate(),id='4'.repeat(32),S='2026-10-17T04:59:00.000Z',O='2026-10-17T04:59:01.000Z',U='2026-10-17T04:59:03.000Z';
  const f={kind:'synthetic_omd_bound_root_v1',recovery:{point:'analyze_timer',active_input_sys_id:id,accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified'},
    finish:{time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},header:{schema_version:a.schema_version,target:a.target,versions:a.versions,started_at:S,instance_release:a.instance_release,release_match:a.release_match,principal:a.principal,
      collection:{...a.collection,metadata_seen:1,selected:1},coverage:{...a.coverage,analysis_complete:false},limits:a.limits,limitations:[...a.limitations,'zz','aa'],errors:[]},selected:[id],inputs:[{update_xml_sys_id:id,retrieved_at:U,state:'not_processed',expected_context:null}]},
    mixed:{model_id:'recovery-omission-v1',initial_prefix:{limitations:[...a.limitations,'zz','aa'],errors:[]},rows:[{producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id,reason:'deadline_exceeded'}}]}};
  if(!mixed)return f;
  const asset=(n:number,count:number)=>{const r=aggregate().assets[0];r.update_xml_sys_id=r.result.target.update_xml_sys_id=String(n).repeat(32);r.result.reviewed_at=r.result.target.retrieved_at=O;r.result.target.record_updated_at='2026-10-17T04:58:00Z';r.result.findings=Array.from({length:count},()=>({...structuredClone(r.result.findings[0]),issue:'PRIVATE_BODY'}));return r;};
  const x=asset(1,99),y=asset(2,2),r=x.result,context={record_updated_at:r.target.record_updated_at,instance_binding:r.instance_binding,instance_release:r.instance_release,requested_rule_ids:r.coverage.requested_rule_ids,release_limitations:r.limitations};
  return {...f,finish:{...f.finish,header:{...f.finish.header,collection:{...f.finish.header.collection,metadata_seen:4,selected:4}},selected:['1','2','3','4'].map(n=>n.repeat(32)),
    inputs:[...[x,y].map(a=>({update_xml_sys_id:a.update_xml_sys_id,retrieved_at:O,state:'completed',expected_context:context})),{update_xml_sys_id:'3'.repeat(32),retrieved_at:O,state:'completed',expected_context:context},...f.finish.inputs]},
    mixed:{...f.mixed,rows:[{producer:'analysis',outcome:x},{producer:'analysis',outcome:y},{producer:'analysis',outcome:{state:'result_omitted',update_xml_sys_id:'3'.repeat(32),reason:'response_limit'}},...f.mixed.rows]}};
}
