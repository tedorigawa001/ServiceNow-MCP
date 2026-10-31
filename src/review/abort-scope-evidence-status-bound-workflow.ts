/** Development-only fresh fake composition. Never adopts an existing session, binding or terminal. */
import {types} from 'node:util';
import {z} from 'zod';
import {createCanonicalReviewBudget} from '../servicenow/review-canonical-budget.js';
import {registerReviewEvidenceSession,type ReviewRunBudgetLease} from '../servicenow/review-evidence-lifecycle.js';
import {createInjectedStatusWorkflowOwner} from './abort-scope-evidence-status-cleanup.js';

const descriptor=z.strictObject({purpose:z.enum(['authentication','parent','release']),ordinal:z.literal(1),
    window_origin_ms:z.number().finite().positive().max(60000),cleanup_floor_ms:z.number().finite().nonnegative()});
// Same fixed window as the injected ST-03C owner; its descriptor limits are checked again before simulated dispatch.
const deadlineMs=60000,maxCleanupGapMs=10000,minCleanupFloorMs=Math.min(10000,deadlineMs/6);
type Input={fake_io:true;clock:{remainingMs():number};schedule(delay:number,wake:()=>void):()=>void};
function data(raw:unknown,keys:readonly string[]){
    if(!raw||typeof raw!=='object'||types.isProxy(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw Error('invalid_input');
    const fields=Object.getOwnPropertyDescriptors(raw);
    if(Reflect.ownKeys(fields).length!==keys.length||Reflect.ownKeys(fields).some(k=>typeof k!=='string'||!keys.includes(k)||!Object.hasOwn(Reflect.get(fields,k)!,'value')))throw Error('invalid_input');
    return Object.fromEntries(keys.map(k=>[k,fields[k].value])) as Record<string,unknown>;
}

/** Fake-only root; the caller cannot supply any real owner/registry/claim or inject cleanup diagnostics. */
export function createSyntheticBoundStatusWorkflow(raw:Input){
    const input=data(raw,['fake_io','clock','schedule']),clock=data(input.clock,['remainingMs']);
    if(input.fake_io!==true||typeof clock.remainingMs!=='function'||typeof input.schedule!=='function')throw Error('invalid_input');
    const remaining=clock.remainingMs.bind(input.clock) as ()=>number,schedule=input.schedule as Input['schedule'];
    const core=createCanonicalReviewBudget({clock:{remainingMs:remaining}}),snapshot=Object.freeze({}),source=Object.freeze({});
    const lease:ReviewRunBudgetLease=Object.freeze({read:()=>core.view.lease.read()});
    let native:ReturnType<typeof createInjectedStatusWorkflowOwner>|undefined;
    const owner=registerReviewEvidenceSession({},snapshot,lease,undefined,{core,stop:code=>native?.stop(code==='closed'?'closed':'cancelled')});
    const claimed=owner.transportConstructor.claim(snapshot,lease);if(!claimed.ok)throw Error(claimed.code);
    const handle=claimed.value,initial=owner.transportConstructor.bindInitialSource(handle,snapshot,lease,source);
    if(!initial.ok)throw Error(initial.code);
    const binding=owner.transportConstructor.claimStatusBinding(handle,snapshot,lease,source);if(!binding.ok)throw Error(binding.code);
    const attached=binding.value.connectAccounting(core.construction.takeBootstrapAccounting());if(!attached.ok)throw Error(attached.code);
    const accounting=attached.value;
    let started=false,closed=false,outcome:'not_started'|'running'|'consumed'|'diagnostic_only'|'failed'='not_started';
    let runRefusal:'invalid_state'|null=null;
    let work:Promise<unknown>|undefined,closeWork:Promise<unknown>|undefined;
    const guard=()=>{
        const checked=binding.value.inspect(handle,snapshot,lease,source);
        if(!checked.ok)throw Error(checked.code);
    };
    native=createInjectedStatusWorkflowOwner({fake_io:true,deadline_ms:deadlineMs,
        // Observation remains available for cleanup after stop; native claims are already revoked synchronously.
        budget:{read:()=>lease.read()},schedule});
    const readerOwner=native;
    const diagnostics=()=>Object.freeze({scope:'synthetic_bound_status_only' as const,outcome,run_refusal:runRefusal,
        binding:binding.value.diagnostic(),http:readerOwner.diagnostics().http,cleanup:readerOwner.diagnostics().cleanup,
        native:readerOwner.diagnostics(),budget:core.view.stats(),reservation:accounting.reserved(),
        permissions:readerOwner.diagnostics().permissions,formal_issuance:'disabled' as const,fallback:'disabled' as const});
    const stop=()=>{owner.revoke('cancelled');};
    const close=()=>{
        // Install a join point before any native/clock callback can reenter teardown.
        if(!closeWork){
            closed=true;
            closeWork=Promise.resolve().then(async()=>{await readerOwner.close();accounting.release();});
            owner.close('closed');
        }
        return closeWork;
    };
    async function execute(response:unknown,rawDescriptor:unknown){
        try{
            const d=data(rawDescriptor,['purpose','ordinal','window_origin_ms','cleanup_floor_ms']);
            const parsed=descriptor.safeParse(d);
            if(!parsed.success||parsed.data.cleanup_floor_ms>=parsed.data.window_origin_ms)throw Error('invalid_input');
            guard();
            // Reject every descriptor the ST-03C owner would refuse before C is charged.
            const gap=parsed.data.window_origin_ms-parsed.data.cleanup_floor_ms;
            if(gap>maxCleanupGapMs||parsed.data.cleanup_floor_ms<minCleanupFloorMs||lease.read().remaining_ms>parsed.data.window_origin_ms)throw Error('invalid_input');
            accounting.reserve();guard();
            if(parsed.data.purpose!=='authentication'&&!owner.markReady(snapshot,lease))throw Error('internal_review_error');
            // A simulated dispatch only: one C, no fetch, no URL/auth/ReleasePermit assertion.
            accounting.dispatch(parsed.data.cleanup_floor_ms);
            const acquired=await readerOwner.acquire(response,parsed.data);
            if(!acquired.ok){owner.revoke(acquired.code);outcome='failed';return;}
            const hard=readerOwner.diagnostics().primary;
            if(hard)owner.revoke(hard);
            const finished=await readerOwner.finish(acquired.value.handle);
            const facts=readerOwner.diagnostics();
            if(!finished.ok||facts.primary||facts.refusal){owner.revoke(facts.primary??facts.refusal??(finished.ok?'internal_review_error':finished.code));outcome='failed';return;}
            guard();
            outcome=facts.workflow?.consumption?'consumed':'diagnostic_only';
            // No fallback or source consumer is called, even after eligible release403/404 consumption.
        }catch(error){
            const code=error instanceof Error&&error.message==='invalid_input'?'invalid_input':core.view.diagnostic().primary?.internal??owner.failure()??'internal_review_error';
            owner.revoke(code);outcome='failed';
        }finally{await close();}
    }
    function run(response:unknown,rawDescriptor:unknown){
        if(started||closed){runRefusal??='invalid_state';owner.revoke('invalid_state');return Promise.resolve(diagnostics());}
        started=true;outcome='running';
        work=Promise.resolve().then(()=>execute(response,rawDescriptor));
        return work.then(()=>diagnostics());
    }
    return Object.freeze({run,stop,close,diagnostics});
}
