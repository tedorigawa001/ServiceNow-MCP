/** Real session lifecycle only. No fixture registration, owner claims or transport activation API. */
const sessions=new WeakMap<object,{live:boolean;ready:boolean;snapshot?:object;reason?:unknown}>();
export function registerReviewEvidenceSession(session:object,snapshot:object):void{
  if(sessions.has(session))throw new Error('invalid_state');
  sessions.set(session,{live:true,ready:false,snapshot});
}
export function markReviewEvidenceAuthReady(session:object):void{
  const state=sessions.get(session);if(state?.live)state.ready=true;
}
export function revokeReviewEvidenceSession(session:object,reason:unknown):void{
  const state=sessions.get(session);if(!state)return;
  state.reason??=reason;state.live=false;state.ready=false;state.snapshot=undefined;
}
