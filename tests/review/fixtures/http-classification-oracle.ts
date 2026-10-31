/** Independent dense table oracle. No imports from the classifier, its enums or runtime code. */
type Frame={category:string;code:string|null;body:string;release:string};
type Proposal={category:string;code:string|null;body:string;approvals:string[]};
type Expected={legacy:Frame;proposal:Proposal};
const purposes=['authentication','parent','release'] as const;
const range=(a:number,b:number)=>Array.from({length:b-a+1},(_,i)=>a+i);
const errorFrame=(body:string,code='invalid_response',category='invalid_response',release='none'):Frame=>({category,code,body,release});
export function httpClassificationOracleCases(){
 const table=new Map<string,Expected>();
 const key=(p:string,s:number,b:boolean)=>[p,s,b].join('/');
 // Fill the whole finite domain first, then apply literal status/range table overrides.
 for(const p of purposes)for(const s of range(100,599))for(const b of [false,true])table.set(key(p,s,b),{
  legacy:errorFrame(b?'cancel_request':'none'),
  proposal:{category:'unsupported_status',code:'invalid_response',body:b?'cancel_candidate':'none',approvals:['A01','A06']},
 });
 for(const p of purposes)for(const s of range(200,299))for(const b of [false,true]){
  table.get(key(p,s,b))!.legacy=b?{category:'json_candidate',code:null,body:'json',release:'none'}:errorFrame('none');
 }
 for(const p of purposes){
  table.get(key(p,200,true))!.proposal={category:'body_candidate',code:null,body:'json_candidate',approvals:[]};
  table.get(key(p,200,false))!.proposal={category:'missing_body',code:'invalid_response',body:'none',approvals:[]};
 }
 const terminals=[
  ['authentication',401,'authentication_failed','hard_http_candidate','none',['A01']],
  ['parent',401,'authentication_failed','hard_http_candidate','none',['A01']],
  ['release',401,'authentication_failed','hard_http_candidate','none',['A01']],
  ['authentication',403,'access_denied','hard_http_candidate','none',['A01']],
  ['parent',403,'access_denied','hard_http_candidate','none',['A01']],
  ['release',403,'access_denied','release_unavailable_candidate','candidate',['A01','A02']],
  ['authentication',404,'not_found_or_not_visible','local_http_candidate','none',['A01']],
  ['parent',404,'not_found_or_not_visible','local_http_candidate','none',['A01']],
  ['release',404,'not_found_or_not_visible','release_unavailable_candidate','candidate',['A01','A02']],
 ] as const;
 for(const [p,s,code,category,recovery,approvals] of terminals)for(const b of [false,true])table.set(key(p,s,b),{
  legacy:errorFrame(b?'cancel_request':'none',code,'terminal_error',recovery),
  proposal:{category,code,body:b?'cancel_candidate':'none',approvals:[...approvals]},
 });
 const recovery={authentication:'none',parent:'none',release:'after_retry_exhaustion'};
 for(const p of purposes)for(const s of [429,...range(500,599)])for(const b of [false,true])table.set(key(p,s,b),{
  legacy:b?errorFrame('drain','upstream_unavailable','retry_candidate',recovery[p]):errorFrame('none'),
  proposal:{category:'retry_status_candidate',code:'upstream_unavailable',body:b?'drain_candidate':'none',approvals:['A01','A03','A04','A05']},
 });
 const rows=[];
 for(const p of purposes)for(const s of range(100,599))for(const b of [false,true])rows.push({purpose:p,status:s,body_present:b,expected:table.get(key(p,s,b))!});
 return rows;
}
