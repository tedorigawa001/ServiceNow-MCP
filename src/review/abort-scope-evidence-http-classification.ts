/** Development-only descriptive model. No runtime adoption, I/O, status proof or approval authority. */
import {types} from 'node:util';
type Purpose='authentication'|'parent'|'release';
type Code='authentication_failed'|'access_denied'|'not_found_or_not_visible'|'upstream_unavailable'|'invalid_response';
type Approval='A01'|'A02'|'A03'|'A04'|'A05'|'A06'|'A07';
export interface HttpObservation {readonly purpose:Purpose;readonly status:number;readonly body_present:boolean;}
interface LegacyMeaning {
 readonly category:'json_candidate'|'terminal_error'|'retry_candidate'|'invalid_response';
 readonly code:Code|null;readonly body:'json'|'cancel_request'|'drain'|'none';readonly release:'none'|'candidate'|'after_retry_exhaustion';
}
interface ProposedMeaning {
 readonly category:'body_candidate'|'missing_body'|'hard_http_candidate'|'local_http_candidate'|'release_unavailable_candidate'|'retry_status_candidate'|'unsupported_status';
 readonly code:Code|null;readonly body:'json_candidate'|'cancel_candidate'|'drain_candidate'|'none';readonly approvals:readonly Approval[];
}
const permissions=Object.freeze({dispatch:false,read_body:false,retry:false,fallback:false,body_ack:false,release_permit:false,formal_issuance:false} as const);
const metadata=Object.freeze({kind:'classification_only',model_id:'br006-http-classification-v1',observation_source:'unverified_input',permissions} as const);
export type HttpClassification=Readonly<typeof metadata&(
 {ok:false;code:'invalid_input'}|{ok:true;observation:Readonly<HttpObservation>;legacy:Readonly<LegacyMeaning>;proposal:Readonly<ProposedMeaning>}
)>;
const invalid:HttpClassification=Object.freeze({...metadata,ok:false,code:'invalid_input'});
function observation(raw:unknown):HttpObservation|null{
 if(!raw||typeof raw!=='object'||types.isProxy(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return null;
 const fields=Object.getOwnPropertyDescriptors(raw),keys=Reflect.ownKeys(fields);
 if(keys.length!==3||keys.some(k=>!['purpose','status','body_present'].includes(k as string)||!Object.hasOwn(Reflect.get(fields,k)!,'value')))return null;
 const purpose=fields.purpose?.value,status=fields.status?.value,body_present=fields.body_present?.value;
 if(!['authentication','parent','release'].includes(purpose)||!Number.isInteger(status)||status<100||status>599||typeof body_present!=='boolean')return null;
 return Object.freeze({purpose,status,body_present}) as HttpObservation;
}
function legacyMeaning({purpose,status,body_present:body}:HttpObservation):LegacyMeaning{
 if(status>=200&&status<300)return body?{category:'json_candidate',code:null,body:'json',release:'none'}:{category:'invalid_response',code:'invalid_response',body:'none',release:'none'};
 if(status===429||status>=500)return body?{category:'retry_candidate',code:'upstream_unavailable',body:'drain',release:purpose==='release'?'after_retry_exhaustion':'none'}:{category:'invalid_response',code:'invalid_response',body:'none',release:'none'};
 const code=status===401?'authentication_failed':status===403?'access_denied':status===404?'not_found_or_not_visible':'invalid_response';
 return {category:code==='invalid_response'?'invalid_response':'terminal_error',code,body:body?'cancel_request':'none',release:purpose==='release'&&(status===403||status===404)?'candidate':'none'};
}
function proposedMeaning({purpose,status,body_present:body}:HttpObservation):ProposedMeaning{
 if(status===200)return body?{category:'body_candidate',code:null,body:'json_candidate',approvals:[]}:{category:'missing_body',code:'invalid_response',body:'none',approvals:[]};
 if(status===401)return {category:'hard_http_candidate',code:'authentication_failed',body:body?'cancel_candidate':'none',approvals:['A01']};
 if(status===403||status===404){
  const code=status===403?'access_denied':'not_found_or_not_visible';
  return purpose==='release'?{category:'release_unavailable_candidate',code,body:body?'cancel_candidate':'none',approvals:['A01','A02']}:{category:status===403?'hard_http_candidate':'local_http_candidate',code,body:body?'cancel_candidate':'none',approvals:['A01']};
 }
 if(status===429||status>=500)return {category:'retry_status_candidate',code:'upstream_unavailable',body:body?'drain_candidate':'none',approvals:['A01','A03','A04','A05']};
 return {category:'unsupported_status',code:'invalid_response',body:body?'cancel_candidate':'none',approvals:['A01','A06']};
}
/** Caller data is not an authentic Response or a permission to run the proposed action. */
export function classifyHttpObservation(raw:unknown):HttpClassification{
 const input=observation(raw);if(!input)return invalid;
 const legacy=legacyMeaning(input),proposal=proposedMeaning(input);
 return Object.freeze({...metadata,ok:true,observation:input,legacy:Object.freeze(legacy),proposal:Object.freeze({...proposal,approvals:Object.freeze([...proposal.approvals])})});
}
