/** SA-01 development-only synthetic contract. No runtime/session/native adoption. */
import {types} from 'node:util';

type Code='invalid_input'|'invalid_state'|'evidence_binding_mismatch'|'cancelled'|'closed'|
    'deadline_exceeded'|'invalid_observation_time'|'authentication_failed'|'access_denied'|'internal_review_error'|'upstream_unavailable';
type Stage='WaitingRelease'|'ConsumingStatus'|'AcceptedClosedGate'|'AcceptedBodyClosedGate'|'DiagnosticOnly'|'Rejected'|'Revoked';
type Claim='available'|'started'|'spent';
const permissions=Object.freeze({dispatch:false,read_body:false,retry:false,fallback:false,body_ack:false,release_permit:false,formal_issuance:false} as const);
const keys=['session','constructor_key','snapshot','lease','core','source','target','ready','generation','parent','transport','attempt','method','url','window'] as const;
type Frame=Readonly<Record<typeof keys[number],object>>;
type Kind='release_403_body'|'release_404_body'|'release_403_no_body'|'release_404_no_body'|'hard_401'|'parent_403'|'parent_404'|'unconfirmed'|'read_started'|'upstream_exhausted';
type Header=Readonly<{purpose:'release'|'parent';status:401|403|404|503;body:boolean}>;
type Cleanup=Readonly<{disposition:'confirmed'|'unconfirmed';kind:'cancelled'|'no_body'|null;read:0|1;reason:'cancel_rejected'|null}>;
type Terminal=Readonly<{frame:Frame;http:Header;cleanup:Cleanup}>;
type Draft=Readonly<{kind:'non_executable_status_acceptance';status:403|404;body_mode:'cancelled'|'no_body';permissions:typeof permissions}>;
const opaque=()=>Object.freeze(Object.create(null)) as object;

/** Only the finite fixture below can see the synthetic issuer and consumer. */
function construct(){
    const frame=Object.freeze(Object.fromEntries(keys.map(k=>[k,opaque()]))) as Frame;
    const fake={time:60000,throws:false,action:(_stage:string)=>{},ready:true,parent:true};
    const known=new WeakMap<object,Terminal>();
    let liveToken:object|undefined,issued:object|undefined,record:Terminal|undefined,draft:Draft|undefined,history:Draft|null=null;
    let phase:Stage='WaitingRelease',firstTerminal:Stage|null=null,claim:Claim='available',mintClaim:Claim='available';
    let primary:Code|null=null,refusal:Code|null=null,refusedAt:string|null=null,revoked=false,closed=false,sampling=false,last:number|undefined;
    const counts={minted:0,lookups:0,consumes:0,accepts:0,body_accepts:0,closed:0};
    const events:string[]=[];
    function discard(){if(liveToken)known.delete(liveToken);liveToken=undefined;draft=undefined;}
    function fail(code:Code,stage:string){
        primary??=code;refusal??=code;refusedAt??=stage;revoked=true;phase='Rejected';firstTerminal??=phase;
        if(claim==='available')claim='spent';discard();return false;
    }
    function stop(code:'cancelled'|'closed'='cancelled'){
        primary??=code;revoked=true;phase='Revoked';firstTerminal??=phase;
        if(claim==='available')claim='spent';if(mintClaim==='available')mintClaim='spent';discard();
    }
    function sample(stage:string){
        if(sampling)return fail('invalid_state',stage);
        sampling=true;
        try{
            fake.action(stage);if(fake.throws)throw Error('PRIVATE_CLOCK');
            const n=fake.time;
            if(!Number.isFinite(n)||n<0||n>60000||last!==undefined&&n>last)return fail('invalid_observation_time',stage);
            last=n;if(n<=50000)return fail('deadline_exceeded',stage);
            return !revoked&&!primary&&!refusal;
        }catch{return fail('internal_review_error',stage);}finally{sampling=false;}
    }
    const matches=(f:Frame)=>keys.every(k=>f[k]===frame[k]);
    function mint(kind:Kind='release_403_body'){
        if(mintClaim!=='available')return fail('invalid_state','mint');mintClaim='started';
        try{
            if(revoked||phase!=='WaitingRelease')return fail(primary??'invalid_state','mint');
            if(!fake.ready||!fake.parent)return fail('invalid_state','prerequisite');
            if(!sample('mint'))return false;
            const http:Header=Object.freeze({purpose:kind.startsWith('parent_')?'parent':'release',status:kind==='hard_401'?401:kind==='upstream_exhausted'?503:kind.includes('404')?404:403,body:!kind.endsWith('no_body')});
            const cleanup:Cleanup=Object.freeze({disposition:kind==='unconfirmed'?'unconfirmed':'confirmed',kind:kind==='unconfirmed'?null:http.body?'cancelled':'no_body',read:kind==='read_started'?1:0,reason:kind==='unconfirmed'?'cancel_rejected':null});
            record=Object.freeze({frame,http,cleanup});events.push('mint');
            if(http.status===401)return fail('authentication_failed','http');
            if(kind==='upstream_exhausted')return fail('upstream_unavailable','http');
            if(http.purpose==='parent'&&http.status===403)return fail('access_denied','http');
            if(cleanup.disposition==='unconfirmed')return fail('internal_review_error','cleanup');
            if(cleanup.read!==0)return fail('invalid_state','cleanup');
            if(http.purpose!=='release'){phase='DiagnosticOnly';firstTerminal??=phase;claim='spent';return false;}
            issued=liveToken=opaque();known.set(issued,record);counts.minted++;return true;
        }finally{mintClaim='spent';}
    }
    function consume(expected:Frame,token:unknown){
        if(claim!=='available')return fail('invalid_state','claim');
        claim='started';phase='ConsumingStatus';events.push('consume_start');
        // Spend our slot before lookup or clock callbacks; never touch a foreign issuer's map.
        const own=liveToken;liveToken=undefined;
        const held=token&&typeof token==='object'?known.get(token):undefined;counts.lookups++;
        if(own)known.delete(own);
        try{
            if(!held||token!==own||token!==issued||held!==record||!matches(expected)||!matches(held.frame))return fail('evidence_binding_mismatch','lookup');
            events.push('pre_guard');if(!sample('pre_guard')||phase!=='ConsumingStatus'||claim!=='started')return false;
            if(!fake.ready||!fake.parent||held.http.purpose!=='release'||![403,404].includes(held.http.status)||held.cleanup.disposition!=='confirmed'||held.cleanup.read!==0)return fail('invalid_state','pre_guard');
            counts.consumes++;
            draft=Object.freeze({kind:'non_executable_status_acceptance',status:held.http.status as 403|404,body_mode:held.cleanup.kind!,permissions});events.push('draft');
            try{fake.action('draft');}catch{return fail('internal_review_error','draft');}
            events.push('post_guard');if(!sample('post_guard')||phase!=='ConsumingStatus'||claim!=='started'||!draft)return false;
            if(!fake.ready||!fake.parent||!matches(expected)||!matches(held.frame))return fail('evidence_binding_mismatch','post_guard');
            history=draft;draft=undefined;counts.accepts++;phase='AcceptedClosedGate';firstTerminal??=phase;events.push('accept_closed_gate');return true;
        }finally{claim='spent';draft=undefined;}
    }
    function body(){
        if(revoked||claim!=='available'||phase!=='WaitingRelease')return fail('invalid_state','body_claim');
        claim='spent';discard();counts.body_accepts++;phase='AcceptedBodyClosedGate';firstTerminal??=phase;events.push('accept_body_closed_gate');return true;
    }
    function close(){if(closed)return;closed=true;counts.closed++;events.push('close');stop('closed');}
    function diagnostic(){return Object.freeze({scope:'synthetic_source_status_only' as const,phase,first_terminal:firstTerminal,claim,mint_claim:mintClaim,
        primary,refusal,refused_at:refusedAt,revoked,http:record?.http??null,cleanup:record?.cleanup??null,
        counts:Object.freeze({...counts}),events:Object.freeze([...events]),live_terminal:liveToken!==undefined,draft_held:draft!==undefined,history,
        permissions,budget:Object.freeze({requests:0,received_bytes:0,payload_bytes:0}),fallback:'disabled' as const,formal_issuance:'disabled' as const});}
    return {frame,fake,mint,consume,body,stop,close,diagnostic,token:()=>issued};
}

/** Case names only. No arbitrary records, callbacks, sessions or diagnostic adoption. */
export function runSyntheticSourceStatusAcceptanceFixture(raw:unknown){
    if(!raw||typeof raw!=='object'||types.isProxy(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return Object.freeze({ok:false as const,code:'invalid_input' as const,permissions});
    const fields=Object.getOwnPropertyDescriptors(raw);
    const interrupts=['pre_cancel','post_cancel','draft_cancel','pre_close','post_close','draft_close'];
    const faults=['pre_reentry','post_reentry','pre_expired','post_expired','pre_throw','post_throw','clock_rewind','post_ready_lost'];
    const controls=['token_copy','diagnostic_token','json_token','missing_ready','missing_parent','duplicate_mint','close_before_consume','stop_before_consume'];
    const kinds:Kind[]=['release_403_body','release_404_body','release_403_no_body','release_404_no_body','hard_401','parent_403','parent_404','unconfirmed','read_started','upstream_exhausted'];
    const allowed=[...kinds,'duplicate_consume','foreign_token_then_retry','body_then_status','status_then_body',...keys.map(k=>'foreign_'+k),...interrupts,...faults,...controls];
    if(Reflect.ownKeys(fields).length!==1||!Object.hasOwn(fields.scenario??{},'value')||!allowed.includes(fields.scenario.value))return Object.freeze({ok:false as const,code:'invalid_input' as const,permissions});
    const selected=fields.scenario.value as string,owner=construct(),other=selected.startsWith('foreign_')?construct():null;
    other?.mint();const foreignBefore=other?.diagnostic();
    if(selected==='missing_ready')owner.fake.ready=false;
    if(selected==='missing_parent')owner.fake.parent=false;
    const minted=owner.mint(kinds.includes(selected as Kind)?selected as Kind:'release_403_body');
    if(selected==='duplicate_mint')owner.mint();
    if(selected==='close_before_consume')owner.close();
    if(selected==='stop_before_consume')owner.stop();
    if(selected==='body_then_status')owner.body();
    if(interrupts.includes(selected))owner.fake.action=stage=>{
        if(stage===(selected.startsWith('pre_')?'pre_guard':selected.startsWith('post_')?'post_guard':'draft'))owner.stop(selected.endsWith('close')?'closed':'cancelled');
    };
    if(faults.includes(selected))owner.fake.action=stage=>{
        if(selected==='clock_rewind'){if(stage==='pre_guard')owner.fake.time=59000;if(stage==='post_guard')owner.fake.time=59500;return;}
        if(stage!==(selected.startsWith('pre_')?'pre_guard':'post_guard'))return;
        if(selected.endsWith('reentry'))owner.consume(owner.frame,owner.token());
        if(selected.endsWith('expired'))owner.fake.time=50000;
        if(selected.endsWith('throw'))owner.fake.throws=true;
        if(selected==='post_ready_lost')owner.fake.ready=false;
    };
    const expected=other&&selected!=='foreign_token_then_retry'?Object.freeze({...owner.frame,[selected.slice(8)]:other.frame[selected.slice(8) as keyof Frame]}):owner.frame;
    const token=selected==='foreign_token_then_retry'?other!.token():selected==='token_copy'?Object.freeze({...owner.token()}):
        selected==='diagnostic_token'?owner.diagnostic():selected==='json_token'?JSON.parse(JSON.stringify(owner.diagnostic())):owner.token();
    if(minted)owner.consume(expected,token);
    if(selected==='status_then_body')owner.body();
    if(fields.scenario.value==='duplicate_consume')owner.consume(owner.frame,owner.token());
    if(selected==='foreign_token_then_retry')owner.consume(owner.frame,owner.token());
    if(interrupts.includes(selected)){owner.fake.action=()=>{};owner.consume(owner.frame,owner.token());}
    if(faults.includes(selected)){
        owner.fake.action=()=>{};owner.fake.throws=false;owner.fake.time=60000;owner.fake.ready=true;owner.consume(owner.frame,owner.token());
    }
    owner.close();
    return Object.freeze({ok:true as const,diagnostic:owner.diagnostic(),foreign_unchanged:!other||JSON.stringify(other.diagnostic())===JSON.stringify(foreignBefore),permissions});
}
