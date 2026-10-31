import {expect,it,vi} from 'vitest';
import {runSyntheticSourceStatusAcceptanceFixture as run} from '../../src/review/abort-scope-evidence-source-status-acceptance.js';

it('consumes once before close and retains only a non-executable closed-gate history',()=>{
 expect(run({scenario:'release_403_body'})).toMatchObject({ok:true,diagnostic:{
  first_terminal:'AcceptedClosedGate',claim:'spent',counts:{consumes:1,accepts:1,closed:1},
  live_terminal:false,draft_held:false,history:{kind:'non_executable_status_acceptance',status:403},
  events:['mint','consume_start','pre_guard','draft','post_guard','accept_closed_gate','close'],
 }});
});
it('refuses duplicate consumption without changing the first accepted history',()=>{
 expect(run({scenario:'duplicate_consume'})).toMatchObject({ok:true,diagnostic:{first_terminal:'AcceptedClosedGate',refusal:'invalid_state',counts:{accepts:1,consumes:1},claim:'spent',history:{status:403}}});
});
it('spends the local claim on a foreign token, prevents retry and leaves the foreign issuer unchanged',()=>{
 expect(run({scenario:'foreign_token_then_retry'})).toMatchObject({ok:true,foreign_unchanged:true,diagnostic:{primary:'evidence_binding_mismatch',claim:'spent',live_terminal:false,history:null,counts:{lookups:1,consumes:0,accepts:0}}});
});
it.each(['session','constructor_key','snapshot','lease','core','source','target','ready','parent','transport','attempt','url','window'])('rejects foreign %s binding without affecting its issuer',key=>{
 expect(run({scenario:'foreign_'+key})).toMatchObject({ok:true,foreign_unchanged:true,diagnostic:{primary:'evidence_binding_mismatch',claim:'spent',counts:{accepts:0},history:null}});
});
it.each(['pre_cancel','post_cancel','draft_cancel','pre_close','post_close','draft_close'])('discards the draft on %s and never resumes after close',scenario=>{
 expect(run({scenario})).toMatchObject({ok:true,diagnostic:{claim:'spent',history:null,draft_held:false,live_terminal:false,counts:{accepts:0},primary:scenario.endsWith('close')?'closed':'cancelled'}});
});
it.each([['body_then_status',0,1,'AcceptedBodyClosedGate'],['status_then_body',1,0,'AcceptedClosedGate']] as const)('shares one release-use claim: %s', (scenario,accepts,bodyAccepts,first)=>{
 expect(run({scenario})).toMatchObject({ok:true,diagnostic:{first_terminal:first,claim:'spent',refusal:'invalid_state',counts:{accepts,body_accepts:bodyAccepts}}});
});
it.each([['release_404_body',404,'cancelled'],['release_403_no_body',403,'no_body'],['release_404_no_body',404,'no_body']] as const)('accepts only synthetic status evidence: %s', (scenario,status,bodyMode)=>{
 expect(run({scenario})).toMatchObject({ok:true,diagnostic:{history:{status,body_mode:bodyMode},counts:{accepts:1,consumes:1}}});
});
it.each([['hard_401','authentication_failed'],['parent_403','access_denied'],['parent_404','closed'],['unconfirmed','internal_review_error'],['read_started','invalid_state']] as const)('does not mint a candidate for %s', (scenario,primary)=>{
 expect(run({scenario})).toMatchObject({ok:true,diagnostic:{primary,counts:{minted:0,consumes:0,accepts:0},history:null}});
});
it.each([['pre_reentry','invalid_state'],['post_reentry','invalid_state'],['pre_expired','deadline_exceeded'],['post_expired','deadline_exceeded'],['pre_throw','internal_review_error'],['post_throw','internal_review_error'],['clock_rewind','invalid_observation_time'],['post_ready_lost','evidence_binding_mismatch']] as const)('fails closed at %s without accepting a draft', (scenario,primary)=>{
 expect(run({scenario})).toMatchObject({ok:true,diagnostic:{primary,claim:'spent',counts:{accepts:0},draft_held:false,live_terminal:false,history:null}});
});
it.each(['token_copy','diagnostic_token','json_token'])('does not adopt %s as evidence',scenario=>{
 expect(run({scenario})).toMatchObject({ok:true,diagnostic:{primary:'evidence_binding_mismatch',counts:{lookups:1,accepts:0},claim:'spent',history:null}});
});
it.each(['missing_ready','missing_parent','duplicate_mint','close_before_consume','stop_before_consume'])('does not revive a failed or closed source: %s',scenario=>{
 expect(run({scenario})).toMatchObject({ok:true,diagnostic:{claim:'spent',counts:{accepts:0},history:null,live_terminal:false}});
});
it.each(['method','generation'])('rejects a foreign %s identity',key=>{
 expect(run({scenario:'foreign_'+key})).toMatchObject({ok:true,foreign_unchanged:true,diagnostic:{primary:'evidence_binding_mismatch',history:null,counts:{accepts:0}}});
});
it('keeps retry exhaustion outside the status acceptance candidates',()=>{
 expect(run({scenario:'upstream_exhausted'})).toMatchObject({ok:true,diagnostic:{primary:'upstream_unavailable',history:null,counts:{minted:0,accepts:0}}});
});
it.each([null,{},'release_403_body',{scenario:'unknown'},{scenario:'release_403_body',session:{}},{scenario:'release_403_body',allow_fallback:true}])('rejects anything except a fixed case name',raw=>{
 expect(run(raw)).toMatchObject({ok:false,code:'invalid_input'});
});
it('never invokes input getters/proxies or any native I/O',()=>{
 const getter=vi.fn(()=>{throw Error('PRIVATE_GET');}),fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('NETWORK_FORBIDDEN');});
 const timer=vi.spyOn(globalThis,'setTimeout').mockImplementation(()=>{throw Error('TIMER_FORBIDDEN');});
 try{
  expect(run(Object.defineProperty({},'scenario',{get:getter}))).toMatchObject({ok:false});
  expect(run(new Proxy({scenario:'release_403_body'},{ownKeys:getter}))).toMatchObject({ok:false});
  expect(run({scenario:'release_403_body'})).toMatchObject({ok:true});
  expect(getter).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(timer).not.toHaveBeenCalled();
 }finally{vi.restoreAllMocks();}
});
it('returns frozen history with all permissions false, no terminal/frame and no promotion path',()=>{
 const r=run({scenario:'release_403_body'});if(!r.ok)throw Error(r.code);const d=r.diagnostic;
 expect(Object.values(r.permissions)).toEqual(Array(7).fill(false));expect(d.budget).toEqual({requests:0,received_bytes:0,payload_bytes:0});
 for(const key of ['token','frame','context','issuer','consumer','permit'])expect(d).not.toHaveProperty(key);
 for(const value of [r,d,d.counts,d.events,d.history,d.history?.permissions,d.http,d.cleanup,d.budget])expect(Object.isFrozen(value)).toBe(true);
 expect(JSON.stringify(r)).not.toContain('PRIVATE');expect(run({scenario:'release_403_body',history:d.history})).toMatchObject({ok:false});
});
