import assert from 'node:assert/strict';

// Contract tables, not generated from product expressions or legacy output.
const cancels=['not_requested','pending','fulfilled','rejected','not_applicable'];
const closeds=['pending','fulfilled','rejected','not_applicable'];
const releases=['not_started','succeeded','failed','not_applicable'];
const issues=[null,'reader_owner_unknown','cancel_pending','cancel_rejected','closed_pending','closed_rejected','lock_release_failed','cleanup_deadline','observation_invalid'];
const opKeys=['get_reader','closed','cancel','release_lock','read'];
export function obligations(body,before,release,issue){
  if(!body)return [issue];
  return [
    before.reader_owned&&before.closed_captured?null:'reader_owner_unknown',
    ['not_requested','pending'].includes(before.cancel)?'cancel_pending':null,
    before.cancel==='rejected'?'cancel_rejected':null,
    {pending:'closed_pending',fulfilled:null,rejected:'closed_rejected',not_applicable:'closed_pending'}[before.closed],
    release==='succeeded'?null:'lock_release_failed',
    issue,
  ];
}
export function rankedReason(body,before,release,issue,order=[0,1,2,3,4,5]){
  const values=obligations(body,before,release,issue);
  return (body?order.map(i=>values[i]):values).find(x=>x!==null)??null;
}
function expectedEligible(body,c,ops){
  if(c.disposition!=='confirmed'||c.reason!==null||c.wait_issue!==null)return false;
  const fields=body?['reader_owned','closed_captured','cancel','closed','release']:['cancel','closed','release'];
  const expected=body?[true,true,'fulfilled','fulfilled','succeeded']:['not_applicable','not_applicable','not_applicable'];
  const needed=body?[1,1,1,1,0]:[0,0,0,0,0];
  return c.kind===(body?'cancelled':'no_body')&&fields.every((k,i)=>c.facts[k]===expected[i])&&opKeys.every((k,i)=>ops[k]===needed[i]);
}
export function verifyNativeFacts(reason,eligible){
  let reasonCases=0,eligibilityCases=0;
  for(const body of [false,true])for(const reader_owned of [false,true])for(const closed_captured of [false,true])
    for(const cancel of cancels)for(const closed of closeds)for(const release of releases){
      const before=Object.freeze({reader_owned,closed_captured,read_started:false,read_pending:false,cancel,closed});
      for(const issue of issues){assert.equal(reason(body,before,release,issue),rankedReason(body,before,release,issue));reasonCases++;}
      const c=Object.freeze({disposition:'confirmed',kind:body?'cancelled':'no_body',reason:null,wait_issue:null,facts:Object.freeze({...before,release})});
      const ops=Object.freeze(Object.fromEntries(opKeys.map(k=>[k,body&&k!=='read'?1:0])));
      assert.equal(eligible(body,c,ops),expectedEligible(body,c,ops));eligibilityCases++;
    }
  for(const body of [false,true]){
    const c=Object.freeze({disposition:'confirmed',kind:body?'cancelled':'no_body',reason:null,wait_issue:null,
      facts:Object.freeze({reader_owned:body,closed_captured:body,read_started:false,read_pending:false,
        cancel:body?'fulfilled':'not_applicable',closed:body?'fulfilled':'not_applicable',release:body?'succeeded':'not_applicable'})});
    const ops=Object.freeze(Object.fromEntries(opKeys.map(k=>[k,body&&k!=='read'?1:0])));
    for(const patch of [{disposition:'unconfirmed'},...['reason','wait_issue'].flatMap(key=>issues.slice(1).map(value=>({[key]:value}))),
      ...[null,'cancelled','no_body'].map(kind=>({kind}))]){
      const changed=Object.freeze({...c,...patch});assert.equal(eligible(body,changed,ops),expectedEligible(body,changed,ops));eligibilityCases++;
    }
    for(const key of opKeys)for(const value of [-1,0,1,2,0.5,NaN,Infinity]){
      const changed=Object.freeze({...ops,[key]:value});assert.equal(eligible(body,c,changed),expectedEligible(body,c,changed));eligibilityCases++;
    }
    assert.equal(eligible(body,c,ops),true);eligibilityCases++;
  }
  return Object.freeze({reasonCases,eligibilityCases});
}

export function verifyOracleNegatives(reason,eligible){
  // Adjacent priority exchanges are reference mutants, not substituted legacy results.
  for(let i=0;i<5;i++){
    const order=[0,1,2,3,4,5];[order[i],order[i+1]]=[order[i+1],order[i]];
    const check=()=>verifyNativeFacts((...args)=>rankedReason(...args,order),eligible);
    // pending/not_requested and rejected are disjoint values of the same cancel field.
    if(i===1)assert.deepEqual(check(),{reasonCases:5760,eligibilityCases:752});
    else assert.throws(check,assert.AssertionError);
  }
  assert.throws(()=>verifyNativeFacts(reason,()=>true),assert.AssertionError);
  assert.throws(()=>verifyNativeFacts(reason,()=>false),assert.AssertionError);
  assert.throws(()=>verifyNativeFacts(reason,(body,c,ops)=>eligible(!body,c,ops)),assert.AssertionError);
  return Object.freeze({rejected:7,equivalent:1});
}
