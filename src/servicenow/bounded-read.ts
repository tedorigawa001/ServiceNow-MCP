/** Isolated, read-only transport. Never uses the legacy client's retries, logging or body readers. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import type { ServiceNowConfig } from './types.js';
import { pinReviewReleaseConfig } from './review-release-config.js';
import { registerReviewEvidenceSession, type ReviewRunBudgetLease, type ReviewSourceReleaseSnapshot } from './review-evidence-lifecycle.js';
import {BoundedUpdateSetSource,parseBoundedSourceInput,type CompositionSourceConstruction,type StatusAcceptanceDraft} from '../review/bounded-source.js';
import {createCanonicalReviewBudget,CanonicalBudgetError} from './review-canonical-budget.js';
import {createReviewBootstrapContract} from './review-bootstrap-contract.js';
import {pinCompositionFakeIO,type CompositionFakeIO} from './review-composition-fake-io.js';

export const BOUNDED_LIMITS = Object.freeze({ responseBytes: 4 * 1024 * 1024, totalBytes: 16 * 1024 * 1024,
  payloadBytes: 2 * 1024 * 1024, totalPayloadBytes: 8 * 1024 * 1024,
  deadlineMs: 60000, requestTimeoutMs: 10000, requests: 210, retryDelayMs: 250 });
export type ReadFailureCode = 'invalid_input' | 'authentication_failed' | 'access_denied' | 'not_found_or_not_visible'
  | 'upstream_unavailable' | 'deadline_exceeded' | 'receive_budget_exceeded' | 'request_budget_exceeded'
  | 'payload_budget_exceeded' | 'payload_limit' | 'invalid_response' | 'review_busy' | 'cancelled' | 'closed' | 'changed_during_review' | 'release_not_admitted' | 'config_invalid' | 'phase_deadline_exceeded' | 'candidate_filter_violation' | 'internal_review_error';
export class BoundedReadError extends Error {
  constructor(readonly code: ReadFailureCode) { super(code); this.name = 'BoundedReadError'; }
}
type ConstructionStage='input'|'clock'|'config'|'authentication'|'admission'|'core'|'owner'|'controllers'|'timer'|'listener'|'commit'|'source_binding'|'stop'|'close';
const constructionResources=['snapshot','core','registered_owner','admission','controller','phase_controller','deadline_timer','phase_timer','abort_listener','source_transport'] as const;
type ConstructionResource=typeof constructionResources[number];
type ConstructionInternalCode=ReadFailureCode|'invalid_state'|'invalid_observation_time'|'evidence_binding_mismatch';
const constructionCodes=new Set<ConstructionInternalCode>(['invalid_input','authentication_failed','access_denied','not_found_or_not_visible','upstream_unavailable','deadline_exceeded','receive_budget_exceeded','request_budget_exceeded','payload_budget_exceeded','payload_limit','invalid_response','review_busy','cancelled','closed','changed_during_review','release_not_admitted','config_invalid','phase_deadline_exceeded','candidate_filter_violation','internal_review_error','invalid_state','invalid_observation_time','evidence_binding_mismatch']);
const constructionCode=(value:unknown):ConstructionInternalCode=>typeof value==='string'&&constructionCodes.has(value as ConstructionInternalCode)?value as ConstructionInternalCode:'internal_review_error';
const constructionPublic=(code:ConstructionInternalCode):ReadFailureCode=>code==='invalid_state'||code==='invalid_observation_time'||code==='evidence_binding_mismatch'?'internal_review_error':code;
/** Pure first-field allocation. No dependencies, callbacks, clocks or live-resource registration. */
function createConstructionShell(){
  type Slot={state:'absent'|'pending'|'held'|'released'|'unconfirmed';release_claim:0|1;releases:0|1};
  const resources=Object.fromEntries(constructionResources.map(k=>[k,{state:'absent',release_claim:0,releases:0}])) as Record<ConstructionResource,Slot>;
  let state:'pending'|'ready'|'failed'|'closed'='pending',sealed=false,coreClaim=false,sourceClaim=false;
  let primary:Readonly<{stage:ConstructionStage;code:ConstructionInternalCode;public_code:ReadFailureCode}>|null=null;
  let core:Readonly<{session:object;snapshot:object;core:object;lease:object;owner:object}>|undefined;
  let source:object|undefined,coreBound=false,sourceBound=false;
  function fail(stage:ConstructionStage,reason:unknown){if(sealed)return;const code=constructionCode(reason);primary??=Object.freeze({stage,code,public_code:constructionPublic(code)});state='failed';}
  function copy(){return Object.freeze({scope:'construction_only' as const,state,sealed,primary,core_bound:coreBound,source_bound:sourceBound,
    purposes:Object.freeze({authentication:false,parent:false,release:false}),
    resources:Object.freeze(Object.fromEntries(constructionResources.map(k=>[k,Object.freeze({...resources[k]})])) as Record<ConstructionResource,Readonly<Slot>>),
    teardown:state!=='closed'?'not_started' as const:constructionResources.some(k=>!['absent','released'].includes(resources[k].state))?'unconfirmed' as const:'confirmed' as const});}
  return Object.freeze({
    attempt(k:ConstructionResource){if(!sealed&&resources[k].state==='absent')resources[k].state='pending';},
    held(k:ConstructionResource){if(!sealed&&resources[k].state==='pending')resources[k].state='held';},
    release(k:ConstructionResource,confirmed:boolean,attempted:boolean){const r=resources[k];if(sealed||r.state==='absent'||r.release_claim)return;r.release_claim=1;r.releases=attempted?1:0;r.state=confirmed?'released':'unconfirmed';},
    needed(k:ConstructionResource){return !['absent','released'].includes(resources[k].state);},
    bindCore(value:NonNullable<typeof core>){if(coreClaim||primary||sealed){fail('core','invalid_state');return false;}coreClaim=true;core=Object.freeze({...value});coreBound=true;return true;},
    bindSource(value:NonNullable<typeof core>,next:object){if(sourceClaim||!core||primary||sealed){fail('source_binding','invalid_state');return false;}sourceClaim=true;
      if(value.session!==core.session||value.snapshot!==core.snapshot||value.core!==core.core||value.lease!==core.lease||value.owner!==core.owner){fail('source_binding','evidence_binding_mismatch');return false;}
      source=next;sourceBound=source===next;return sourceBound;},
    commit(){if(primary||!core||sealed){fail('commit','invalid_state');return false;}state='ready';return true;},
    fail,failure:()=>primary,
    seal(){if(sealed)return;for(const k of constructionResources)if(['held','pending'].includes(resources[k].state))resources[k].state='unconfirmed';core=undefined;source=undefined;state='closed';sealed=true;},
    copy,
  });
}
export type ConstructionDiagnostic=ReturnType<ReturnType<typeof createConstructionShell>['copy']>;
const constructionFailures=new WeakMap<object,ConstructionDiagnostic>();
export interface ReadSnapshot {
  instanceUrl: string; authMode: ServiceNowConfig['authMode']; perUserBearerToken?: string;
  oauth: ServiceNowConfig['oauth']; accessToken?: string; tokenExpiry?: number;
  reviewReleaseConfig?: unknown;
  reviewReleaseConfigProvider?: () => unknown;
}
/** Trusted dependency injection only; callers may lower, never raise production ceilings. */
export interface BoundedReadOptions {
  fetch?: typeof fetch; signal?: AbortSignal; limits?: Partial<typeof BOUNDED_LIMITS>;
}
type CompositionOptions=Pick<BoundedReadOptions,'signal'|'limits'>;
type CompositionSummary=Readonly<{auth_ready:boolean;ready_generation:number;budget:Readonly<{requests:number;received_bytes:number;payload_bytes:number}>;phase_reserve_ms:number;dispatch:'unavailable';evidence_issuance:'disabled';reserved:0;cleanup:'closed'}>;
type ConstructorSummary=CompositionSummary&Readonly<{state:'constructor_bound';initial_source:'bound';transport_claim:'claimed'}>;
type PreparedSummary=CompositionSummary&ReviewSourceReleaseSnapshot&Readonly<{state:'prepared_only';fake_io:true}>;
let active = 0;
const principals = new Set<string>();
const snapshotKeys = new Set(['instanceUrl', 'authMode', 'perUserBearerToken', 'oauth', 'accessToken', 'tokenExpiry', 'reviewReleaseConfig', 'reviewReleaseConfigProvider']);
const oauthKeys = new Set(['clientId', 'clientSecret', 'username', 'password']);
/** Copy a caller-supplied object once from plain data properties: a getter or proxy could answer validation and storage differently. */
function pinDataObject(raw: unknown, keys: Set<string>): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) throw new BoundedReadError('invalid_input');
  const fields = Object.getOwnPropertyDescriptors(raw), pinned: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(fields)) {
    const field = Reflect.get(fields, key) as PropertyDescriptor;
    if (typeof key !== 'string' || !keys.has(key) || !Object.hasOwn(field, 'value')) throw new BoundedReadError('invalid_input');
    pinned[key] = field.value;
  }
  return pinned;
}
let sourceConstructionClaim:(session:unknown,key:object,source:BoundedUpdateSetSource)=>boolean=()=>false;
/** Immutable ESM friend function: boolean consumption only, never a registration or mutable-port getter. */
export function claimPrivateCompositionSource(session:unknown,key:object,source:BoundedUpdateSetSource){return sourceConstructionClaim(session,key,source);}
type StatusObservation=Readonly<{purpose:'release';status:403|404;cleanup:'cancelled'|'no_body'|'unconfirmed'}>;
type StatusProbeFake=Readonly<{parent():Uint8Array;observe(signal:AbortSignal):Promise<StatusObservation>;dispose():void}>;
/** Fresh closed-gate fake composition only. Identities below are opaque aliases, never raw session/core/source ports. */
export type NativeStatusProbeScope=Readonly<{binding:object;deadline_ms:number;budget:Readonly<{read():{remaining_ms:number}}>;
  check(binding:object):ReadFailureCode|null;accept(binding:object,value:unknown):ReadFailureCode|null;stop(code:ReadFailureCode):void}>;
type NativeStatusDriver=Readonly<{parent():Uint8Array;begin(scope:NativeStatusProbeScope):void;
  run(window:Readonly<{purpose:'release';ordinal:1;window_origin_ms:number;cleanup_floor_ms:number}>):Promise<void>;
  stop(code:ReadFailureCode):void;close():Promise<void>;dispose():void}>;
export type StatusAcceptanceSummary=StatusAcceptanceDraft&Readonly<{accepted_before_close:true;consumptions:1;ready_generation:1;
  budget:Readonly<{requests:number;received_bytes:number;payload_bytes:number}>;fake_io:true;cleanup:'closed';reserved:0}>;
export type StatusAcceptanceProbe=(snapshot:ReadSnapshot,input:unknown,options:CompositionOptions&{fake:unknown})=>Promise<StatusAcceptanceSummary>;
let statusProbe:StatusAcceptanceProbe|undefined;
export type NativeStatusCompositionResult=Readonly<{ok:boolean;code:ReadFailureCode|null;fake_io:true;draft:StatusAcceptanceDraft|null;consumptions:number;
  accepted_before_close:boolean;binding:Readonly<{same_core:boolean;same_source:boolean}>;run_diagnostic:Readonly<{internal:string|null;public:ReadFailureCode|null}>;constructor_diagnostic:ConstructionDiagnostic|null;budget:Readonly<{requests:number;received_bytes:number;payload_bytes:number}>;cleanup:'closed';reserved:0}>;
type NativeStatusProbe=(snapshot:ReadSnapshot,input:unknown,options:CompositionOptions&{driver:unknown})=>Promise<NativeStatusCompositionResult>;
let nativeStatusProbe:NativeStatusProbe|undefined;
/** One-shot development friend; it can only create a fresh fake run with network fixed to throw. */
export function takeNativeStatusCompositionProbe():NativeStatusProbe{
  const probe=nativeStatusProbe;nativeStatusProbe=undefined;if(!probe)throw new BoundedReadError('internal_review_error');return probe;
}
/** SA-02 friend for the package-excluded development module: handed out once, never re-registered or replaced. */
export function takeStatusAcceptanceProbe():StatusAcceptanceProbe{
  const probe=statusProbe;statusProbe=undefined;
  if(!probe)throw new BoundedReadError('internal_review_error');
  return probe;
}
const typedLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'byteLength')!.get!,typedSet=Uint8Array.prototype.set;
/** The friend is reachable from the package, so the fake object is pinned and every output is copied/validated here. */
function pinStatusProbeFake(raw:unknown):StatusProbeFake{
  const f=pinDataObject(raw,new Set(['parent','observe','dispose']));
  const parent=f.parent,observe=f.observe,dispose=f.dispose;
  if(typeof parent!=='function'||typeof observe!=='function'||typeof dispose!=='function')throw new BoundedReadError('invalid_input');
  return Object.freeze({
    parent(){
      const b=Reflect.apply(parent,raw,[]);
      if(!types.isUint8Array(b)||types.isProxy(b))throw new BoundedReadError('invalid_response');
      const copy=new Uint8Array(Reflect.apply(typedLength,b,[]) as number);Reflect.apply(typedSet,copy,[b]);return copy;
    },
    async observe(signal:AbortSignal){
      const v=pinDataObject(await Reflect.apply(observe,raw,[signal]),new Set(['purpose','status','cleanup']));
      if(v.purpose!=='release'||(v.status!==403&&v.status!==404)||!['cancelled','no_body','unconfirmed'].includes(v.cleanup as string))throw new BoundedReadError('invalid_response');
      return Object.freeze({purpose:'release' as const,status:v.status,cleanup:v.cleanup as StatusObservation['cleanup']});
    },
    dispose(){Reflect.apply(dispose,raw,[]);},
  });
}

export class BoundedReadSession {
  readonly #construction=createConstructionShell();
  #constructing=true;
  #constructionStopping=false;
  #constructionStage:ConstructionStage='input';
  #admitted=false;
  private controller!:AbortController;
  private phase!:AbortController;
  private phaseTimer?: ReturnType<typeof setTimeout>;
  private reserveMs = 0;
  private readonly limits!: Record<keyof typeof BOUNDED_LIMITS, number>;
  private readonly baseUrl!: string;
  private readonly principalKey!: string;
  private fetcher!: typeof fetch;
  private readonly timer?: ReturnType<typeof setTimeout>;
  private readonly started!:number;
  readonly startedAt!:string;
  readonly authMode!: 'per-user' | 'service-account';
  readonly #snapshot!: ReadSnapshot;
  readonly #runLease!: ReviewRunBudgetLease;
  readonly #runOwner!: ReturnType<typeof registerReviewEvidenceSession>;
  private token?: string;
  private readyPromise?: Promise<void>;
  readonly #budget!:ReturnType<typeof createCanonicalReviewBudget>;
  #stopPropagated=false;
  #compositionStarted=false;
  #compositionKey?:object;
  #compositionSource?:BoundedUpdateSetSource;
  #compositionRevoke?:()=>void;
  private get stopCode(){return this.#budget.view.failure()??undefined;}
  private disposed = false;
  private busy = false;
  private readonly removeExternal?: () => void;
  readonly releasePolicy!: ReturnType<typeof pinReviewReleaseConfig>;

  /** Fixed fresh construction and one-shot failure-copy recovery; no existing session/seed/owner input. */
  static create(snapshot:ReadSnapshot,options:BoundedReadOptions={}):Readonly<{ok:true;session:BoundedReadSession;construction:ConstructionDiagnostic}|{ok:false;code:ReadFailureCode;construction:ConstructionDiagnostic|null}>{
    let session:BoundedReadSession|undefined;
    try{session=new BoundedReadSession(snapshot,options);
      const stopped=session.#construction.failure();if(stopped){session.#close();return Object.freeze({ok:false,code:stopped.public_code,construction:session.#construction.copy()});}
      return Object.freeze({ok:true,session,construction:session.#construction.copy()});}
    catch(error){let copy=error&&typeof error==='object'?constructionFailures.get(error):undefined;
      if(error&&typeof error==='object')constructionFailures.delete(error);
      if(session){session.#construction.fail('commit','internal_review_error');session.#close();try{copy=session.#construction.copy();}catch{/* fixed fallback if a copy cannot be allocated */}}
      return Object.freeze({ok:false,code:copy?.primary?.public_code??'internal_review_error',construction:copy??null});}
  }
  constructionStatus(){return this.#construction.copy();}

  static async #runNativeStatusProbe(snapshot:ReadSnapshot,input:unknown,options:CompositionOptions&{driver:unknown}):Promise<NativeStatusCompositionResult>{
    let session:BoundedReadSession|undefined,driver:NativeStatusDriver|undefined,value:(StatusAcceptanceDraft&{consumptions:1})|undefined;
    let code:ReadFailureCode|null=null;
    let construction:ConstructionDiagnostic|null=null;
    const progress={bound:false,consumptions:0};let runDiagnostic:NativeStatusCompositionResult['run_diagnostic']=Object.freeze({internal:null,public:null});
    try{
      const fields=pinDataObject(options,new Set(['signal','limits','driver']));
      const methods=pinDataObject(fields.driver,new Set(['parent','begin','run','stop','close','dispose']));
      if(Object.keys(methods).length!==6||Object.values(methods).some(f=>typeof f!=='function'||types.isProxy(f)))throw new BoundedReadError('invalid_input');
      driver=Object.freeze(Object.fromEntries(Object.entries(methods).map(([k,f])=>[k,(...args:unknown[])=>Reflect.apply(f as (...a:unknown[])=>unknown,fields.driver,args)]))) as NativeStatusDriver;
      const signal=fields.signal as AbortSignal|undefined;
      if(signal!==undefined){if(types.isProxy(signal)||Object.getPrototypeOf(signal)!==AbortSignal.prototype||['aborted','addEventListener','removeEventListener'].some(k=>Object.hasOwn(signal,k)))throw new BoundedReadError('invalid_input');Reflect.apply(Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!,signal,[]);}
      const pinned=pinDataObject(snapshot,snapshotKeys),fixed=Object.freeze({...pinned,oauth:Object.freeze(pinDataObject(pinned.oauth,oauthKeys))}) as unknown as ReadSnapshot;
      if(fixed.authMode!=='per-user')throw new BoundedReadError('invalid_input');
      const parsed=parseBoundedSourceInput(input);
      const created=BoundedReadSession.create(fixed,{signal,limits:fields.limits as BoundedReadOptions['limits'],fetch:()=>{throw new BoundedReadError('internal_review_error');}});
      construction=created.construction;
      if(!created.ok){if(construction?.primary)runDiagnostic=Object.freeze({internal:construction.primary.code,public:created.code});throw new BoundedReadError(created.code);}
      session=created.session;
      value=await session.#probeStatusAcceptance(parsed,driver,progress);session.#checkComposition();
    }catch(error){code=error instanceof BoundedReadError?error.code:session?'internal_review_error':'invalid_input';session?.stop(code);driver?.stop(code);}
    finally{try{await driver?.close();}catch{code??='internal_review_error';session?.stop(code);}finally{try{driver?.dispose();}catch{code??='internal_review_error';}finally{if(session){runDiagnostic=Object.freeze({internal:session.#runOwner.failure()??null,public:session.#budget.view.failure()});session.#close();construction=session.#construction.copy();}}}}
    return Object.freeze({ok:code===null,code,fake_io:true,draft:code===null?value??null:null,consumptions:progress.consumptions,
      accepted_before_close:code===null&&value!==undefined,binding:Object.freeze({same_core:progress.bound,same_source:progress.bound}),run_diagnostic:runDiagnostic,constructor_diagnostic:construction,
      budget:Object.freeze(session?.stats()??{requests:0,received_bytes:0,payload_bytes:0}),cleanup:'closed',reserved:0});
  }

  /** Fresh fake-only SA-02 probe, reachable only through the one-shot friend. No existing-session adoption or activation flag. */
  static async #runStatusAcceptanceProbe(snapshot:ReadSnapshot,input:unknown,options:CompositionOptions&{fake:unknown}){
    let session:BoundedReadSession|undefined,fake:StatusProbeFake|undefined;
    try{
      const fields=pinDataObject(options,new Set(['signal','limits','fake']));
      fake=pinStatusProbeFake(fields.fake);
      const signal=fields.signal as AbortSignal|undefined;
      if(signal!==undefined){
        if(Object.getPrototypeOf(signal)!==AbortSignal.prototype||['addEventListener','removeEventListener','aborted'].some(k=>Object.hasOwn(signal,k)))throw new BoundedReadError('invalid_input');
        Reflect.apply(Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!,signal,[]);
      }
      const pinned=pinDataObject(snapshot,snapshotKeys);
      const fixed=Object.freeze({...pinned,oauth:Object.freeze(pinDataObject(pinned.oauth,oauthKeys))}) as unknown as ReadSnapshot;
      if(fixed.authMode!=='per-user')throw new BoundedReadError('invalid_input');
      const parsed=parseBoundedSourceInput(input);
      session=new BoundedReadSession(fixed,{signal,limits:fields.limits as BoundedReadOptions['limits'],fetch:()=>{throw new BoundedReadError('internal_review_error');}});
      const value=await session.#probeStatusAcceptance(parsed,fake);
      session.#checkComposition();
      session.#close();
      return Object.freeze({...value,fake_io:true as const,cleanup:'closed' as const,reserved:0 as const});
    }catch(error){
      const failure=error instanceof BoundedReadError?error:new BoundedReadError(session?'internal_review_error':'invalid_input');
      if(session)session.stop(failure.code);throw failure;
    }
    finally{fake?.dispose();if(session)session.#close();}
  }

  async #probeStatusAcceptance(input:ReturnType<typeof parseBoundedSourceInput>,fake:StatusProbeFake|NativeStatusDriver,progress?:{bound:boolean;consumptions:number}){
    const native='begin' in fake?fake:undefined;
    const key=Object.freeze({});this.#compositionKey=key;
    let consumer:Parameters<CompositionSourceConstruction['capture']>[0]|undefined,consumptions=0;
    const parents=new WeakMap<object,unknown>();
    type Receipt={source:BoundedUpdateSetSource;snapshot:ReadSnapshot;lease:ReviewRunBudgetLease;core:ReturnType<typeof createCanonicalReviewBudget>;attempt:object;window:Readonly<{floor:number}>;value:Readonly<{purpose:'release';status:403|404;cleanup:'cancelled'|'no_body'|'unconfirmed'}>};
    const terminals=new WeakMap<object,Receipt>();let terminal:object|undefined,activeFloor:number|undefined;
    const guard=()=>{
      if(this.#compositionKey!==key)throw new BoundedReadError(this.stopCode??'closed');this.#checkComposition();
      if(activeFloor!==undefined&&this.#runLease.read().remaining_ms<=activeFloor)throw new BoundedReadError('upstream_unavailable');
    };
    const rejectStatus=(code:'invalid_state'|'evidence_binding_mismatch'):never=>{
      this.#runOwner.revoke(code);this.#syncRunFailure();throw new BoundedReadError(this.stopCode??'internal_review_error');
    };
    const scope=this.#openComposition(input,{key,check:guard,
      take:(ack,purpose)=>{const value=parents.get(ack);parents.delete(ack);guard();if(purpose!=='parent'||value===undefined)throw new BoundedReadError('internal_review_error');return value;},
      takeStatus:t=>{
        const value=terminals.get(t);if(terminal)terminals.delete(terminal);const own=terminal;terminal=undefined;
        guard();
        if(!value||t!==own||value.source!==scope.source||value.snapshot!==this.#snapshot||value.lease!==this.#runLease||value.core!==this.#budget||value.attempt!==attempt)return rejectStatus('evidence_binding_mismatch');
        const checked=scope.statusBinding.inspect(scope.handle,this.#snapshot,this.#runLease,scope.source);guard();
        if(!checked.ok||checked.value.ready_generation!==1)throw new BoundedReadError('internal_review_error');
        if(this.#runLease.read().remaining_ms<=value.window.floor)throw new BoundedReadError('upstream_unavailable');
        consumptions++;if(progress)progress.consumptions=consumptions;return value.value;
      },rejectStatus,capture:c=>{if(consumer)throw new BoundedReadError('internal_review_error');consumer=c;}});
    const attempt=Object.freeze({});
    this.#compositionRevoke=()=>{this.#compositionKey=undefined;if(terminal)terminals.delete(terminal);terminal=undefined;consumer?.revoke();native?.stop(this.stopCode??'closed');};
    try{
      guard();if(!consumer||this.#compositionSource!==scope.source)throw new BoundedReadError('internal_review_error');
      if(progress)progress.bound=true;
      const nativeBinding=Object.freeze({});let nativeDraft:StatusAcceptanceDraft|undefined,nativeRunning=false;
      const checked=()=>{guard();if(this.#compositionSource!==scope.source)throw new BoundedReadError('internal_review_error');
        const r=scope.statusBinding.inspect(scope.handle,this.#snapshot,this.#runLease,scope.source);guard();if(!r.ok||r.value.ready_generation!==1)throw new BoundedReadError('internal_review_error');};
      const reject=(error:unknown):ReadFailureCode=>{const c=error instanceof BoundedReadError?error.code:'internal_review_error';this.stop(c);return this.stopCode??c;};
      native?.begin(Object.freeze({binding:nativeBinding,deadline_ms:this.limits.deadlineMs,budget:Object.freeze({read:()=>({remaining_ms:this.#runLease.read().remaining_ms})}),
        check:(binding:object)=>{try{if(binding!==nativeBinding)rejectStatus('evidence_binding_mismatch');checked();return null;}catch(e){return reject(e);}},
        accept:(binding:object,raw:unknown)=>{try{
          if(binding!==nativeBinding)rejectStatus('evidence_binding_mismatch');checked();if(!nativeRunning||nativeDraft)rejectStatus('invalid_state');
          const v=pinDataObject(raw,new Set(['purpose','status','cleanup']));
          if(v.purpose!=='release'||(v.status!==403&&v.status!==404)||!['cancelled','no_body'].includes(v.cleanup as string))throw new BoundedReadError('invalid_response');
          terminal=Object.freeze({});terminals.set(terminal,{source:scope.source,snapshot:this.#snapshot,lease:this.#runLease,core:this.#budget,attempt,window:{floor:activeFloor!},value:v as StatusObservation});
          nativeDraft=consumer!.status(terminal);checked();return null;
        }catch(e){return reject(e);}},
        // A native floor stop is the attempt window, not the run deadline: classify it like the SA-02 floor check.
        stop:(code:ReadFailureCode)=>this.stop(code==='deadline_exceeded'&&this.#runLease.read().remaining_ms>0?'upstream_unavailable':code)}));
      scope.accounting.reserve();guard();
      // Ready can only fail after a run stop or misuse; this probe performs no authentication to blame.
      if(!this.#runOwner.markReady(this.#snapshot,this.#runLease)){this.#syncRunFailure();throw new BoundedReadError(this.stopCode??'internal_review_error');}
      if(native)checked();
      scope.accounting.dispatch(this.reserveMs);const bytes=fake.parent();scope.accounting.chunk(bytes.byteLength);
      if(bytes.byteLength>this.limits.responseBytes)throw new BoundedReadError('receive_budget_exceeded');
      let parent:unknown;try{parent=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new BoundedReadError('invalid_response');}
      const parentAck=Object.freeze({});parents.set(parentAck,parent);consumer.parent(parentAck);guard();
      const window=Object.freeze({floor:Math.max(this.reserveMs,this.#runLease.read().remaining_ms-10000)});
      activeFloor=window.floor;
      scope.accounting.dispatch(window.floor);
      let value:StatusObservation|undefined;
      if(native){nativeRunning=true;try{await this.guarded(native.run(Object.freeze({purpose:'release',ordinal:1,window_origin_ms:this.#runLease.read().remaining_ms,cleanup_floor_ms:window.floor})),this.controller.signal);}finally{nativeRunning=false;}}
      else value=await this.guarded((fake as StatusProbeFake).observe(this.controller.signal),this.controller.signal);guard();
      if(this.#runLease.read().remaining_ms<=window.floor)throw new BoundedReadError('upstream_unavailable');
      let draft:StatusAcceptanceDraft;
      if(native){if(!nativeDraft)throw new BoundedReadError('internal_review_error');draft=nativeDraft;}
      else{if(!value||value.cleanup==='unconfirmed')throw new BoundedReadError('internal_review_error');
        terminal=Object.freeze({});terminals.set(terminal,{source:scope.source,snapshot:this.#snapshot,lease:this.#runLease,core:this.#budget,attempt,window,value});draft=consumer.status(terminal);}guard();
      if(consumptions!==1)throw new BoundedReadError('internal_review_error');
      const result=Object.freeze({...draft,accepted_before_close:true as const,consumptions:1 as const,ready_generation:1 as const,budget:this.#budget.view.stats()});
      guard();return result;
    }catch(error){
      const code=error instanceof BoundedReadError?error.code:'internal_review_error';this.stop(code);throw new BoundedReadError(this.stopCode??code);
    }finally{this.#compositionKey=undefined;if(terminal)terminals.delete(terminal);terminal=undefined;consumer?.revoke();scope.accounting.release();this.#compositionRevoke=undefined;}
  }

  /** Fixed new-run boundary. The opt-in lane accepts bounded fake bytes, never a fetch or source callback. */
  static prepareNewReviewComposition(snapshot:ReadSnapshot,input:unknown,options:CompositionOptions&{synthetic_io:CompositionFakeIO}):Promise<PreparedSummary>;
  static prepareNewReviewComposition(snapshot:ReadSnapshot,input:unknown,options?:CompositionOptions):ConstructorSummary;
  static prepareNewReviewComposition(snapshot:ReadSnapshot,input:unknown,options:CompositionOptions&{synthetic_io?:CompositionFakeIO}={}):ConstructorSummary|Promise<PreparedSummary>{
    let session:BoundedReadSession|undefined;
    let fake:ReturnType<typeof pinCompositionFakeIO>|undefined;
    try{
      if(!options||typeof options!=='object')throw new BoundedReadError('invalid_input');
      const fields=Object.getOwnPropertyDescriptors(options);
      if(Reflect.ownKeys(fields).some(k=>k!=='signal'&&k!=='limits'&&k!=='synthetic_io'||!Object.hasOwn(Reflect.get(fields,k)!,'value')))
        throw new BoundedReadError('invalid_input');
      const signal=fields.signal?.value as AbortSignal|undefined,limits=fields.limits?.value as BoundedReadOptions['limits'];
      if(signal!==undefined){
        try{
          // Reject signal-shaped callbacks before the ordinary constructor allocates admission/timers.
          if(Object.getPrototypeOf(signal)!==AbortSignal.prototype||['addEventListener','removeEventListener','aborted'].some(k=>Object.hasOwn(signal,k)))throw Error();
          Reflect.apply(Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!,signal,[]);
        }catch{throw new BoundedReadError('invalid_input');}
      }
      const pinned=pinDataObject(snapshot,snapshotKeys);
      const fixed=Object.freeze({...pinned,oauth:Object.freeze(pinDataObject(pinned.oauth,oauthKeys))}) as unknown as ReadSnapshot;
      const parsed=parseBoundedSourceInput(input);
      if(fields.synthetic_io){try{fake=pinCompositionFakeIO(fields.synthetic_io.value);}catch{throw new BoundedReadError('invalid_input');}}
      // The class and source are fixed, not caller-supplied factories. No later mode switch or registry lookup.
      session=new BoundedReadSession(fixed,{signal,limits,fetch:()=>{throw new BoundedReadError('internal_review_error');}});
      if(fake){
        const owned=session,io=fake;session=undefined;fake=undefined;
        return owned.#prepareCompositionIO(parsed,io).then(value=>{owned.#close();return Object.freeze({...value,reserved:0 as const,cleanup:'closed' as const});},error=>{throw error instanceof BoundedReadError?error:new BoundedReadError('internal_review_error');}).finally(()=>{io.dispose();owned.#close();});
      }
      const bound=session.#prepareComposition(parsed);
      session.#close();
      return Object.freeze({...bound,reserved:0 as const,cleanup:'closed' as const});
    }catch(error){
      throw error instanceof BoundedReadError?error:new BoundedReadError('internal_review_error');
    }finally{fake?.dispose();if(session)session.#close();}
  }

  static {
    nativeStatusProbe=(snapshot,input,options)=>BoundedReadSession.#runNativeStatusProbe(snapshot,input,options);
    statusProbe=(snapshot,input,options)=>BoundedReadSession.#runStatusAcceptanceProbe(snapshot,input,options);
    sourceConstructionClaim=(session:unknown,key:object,source:BoundedUpdateSetSource):boolean=>{
    if(!key||typeof key!=='object'||!session||typeof session!=='object'||types.isProxy(session)||!(#compositionKey in session)||!session.#compositionKey||session.#compositionKey!==key||session.#compositionSource||!session.#compositionStarted||session.disposed||session.#stopPropagated)return false;
    session.#compositionSource=source;return true;
    };
  }

  #prepareComposition(input:ReturnType<typeof parseBoundedSourceInput>){
    const scope=this.#openComposition(input);
    try{
      scope.accounting.reserve();this.#checkComposition();
      const status=this.#runOwner.inspect(this.#snapshot,this.#runLease);this.#checkComposition();
      if(status.transport_claim!=='claimed')throw new BoundedReadError('internal_review_error');
      return Object.freeze({...scope.bound,auth_ready:status.auth_ready,ready_generation:status.ready_generation,
        transport_claim:'claimed' as const,budget:this.#budget.view.stats(),phase_reserve_ms:this.reserveMs,dispatch:'unavailable' as const});
    }catch(error){throw this.#adopt(error);}finally{scope.accounting.release();}
  }
  #openComposition(input:ReturnType<typeof parseBoundedSourceInput>,creation?:CompositionSourceConstruction){
    if(this.#compositionStarted)throw new BoundedReadError('internal_review_error');
    this.#compositionStarted=true;
    let accounting:ReturnType<ReturnType<typeof createCanonicalReviewBudget>['construction']['takeBootstrapAccounting']>|undefined;
    try{
      this.#checkComposition();
      // One phase value, not a second bootstrap cutoff. No I/O phase timer is armed in this stage.
      this.reserveMs=Math.min(10000,this.limits.deadlineMs/6);
      const source=new BoundedUpdateSetSource(this,input,creation);
      const claim=this.#runOwner.transportConstructor.claim(this.#snapshot,this.#runLease);
      if(!claim.ok){this.#syncRunFailure();throw new BoundedReadError(this.stopCode??'internal_review_error');}
      const bound=this.#runOwner.transportConstructor.bindInitialSource(claim.value,this.#snapshot,this.#runLease,source);
      if(!bound.ok){this.#syncRunFailure();throw new BoundedReadError(this.stopCode??'internal_review_error');}
      const statusBinding=this.#runOwner.transportConstructor.claimStatusBinding(claim.value,this.#snapshot,this.#runLease,source);
      if(!statusBinding.ok){this.#syncRunFailure();throw new BoundedReadError(this.stopCode??'internal_review_error');}
      accounting=this.#budget.construction.takeBootstrapAccounting();
      const connected=statusBinding.value.connectAccounting(accounting);
      if(!connected.ok){this.#syncRunFailure();throw new BoundedReadError(this.stopCode??'internal_review_error');}
      accounting=connected.value;
      if(!this.#construction.bindSource({session:this,snapshot:this.#snapshot,core:this.#budget,lease:this.#runLease,owner:this.#runOwner},source)){
        this.stop('internal_review_error');throw new BoundedReadError('internal_review_error');
      }
      return {source,handle:claim.value,accounting,bound:bound.value,statusBinding:statusBinding.value};
    }catch(error){accounting?.release();throw this.#adopt(error);}
  }
  async #prepareCompositionIO(input:ReturnType<typeof parseBoundedSourceInput>,fake:ReturnType<typeof pinCompositionFakeIO>){
    const key=Object.freeze({});this.#compositionKey=key;
    const acks=new WeakMap<object,{purpose:'parent'|'release';value:unknown}>();let consumer:Parameters<CompositionSourceConstruction['capture']>[0]|undefined;
    const guard=()=>{if(this.#compositionKey!==key)throw new BoundedReadError(this.stopCode??'closed');this.#checkComposition();};
    const mint=(purpose:'parent'|'release',value:unknown)=>{guard();const ack=Object.freeze({});acks.set(ack,{purpose,value});return ack;};
    const scope=this.#openComposition(input,{key,check:guard,take:(ack,purpose)=>{guard();const value=acks.get(ack);acks.delete(ack);if(!value||value.purpose!==purpose)throw new BoundedReadError('internal_review_error');return value.value;},capture:c=>{if(consumer)throw new BoundedReadError('internal_review_error');consumer=c;}});
    let contract:ReturnType<typeof createReviewBootstrapContract<typeof scope.handle>>|undefined;
    try{
      guard();if(!consumer||this.#compositionSource!==scope.source)throw new BoundedReadError('internal_review_error');
      const statusContext=scope.statusBinding.inspect(scope.handle,this.#snapshot,this.#runLease,scope.source);
      if(!statusContext.ok){this.#syncRunFailure();throw new BoundedReadError(this.stopCode??'internal_review_error');}
      const auth=this.authMode==='per-user'?'per-user':this.#snapshot.accessToken&&(this.#snapshot.tokenExpiry??0)>Date.now()+this.limits.deadlineMs?'cached':'exchange';
      if(!fake.matches(auth==='exchange'))throw new BoundedReadError('invalid_input');
      const stop=(code:unknown)=>{this.#runOwner.revoke(code);this.#budget.writer.stop(code);this.stop(this.stopCode??'internal_review_error');};
      contract=createReviewBootstrapContract({lease:this.#runLease,phaseReserveMs:this.reserveMs,sample:()=>this.#runLease.read(),check:(h,s,l)=>this.#runOwner.transportConstructor.inspect(h,s,l),
        ready:()=>this.#runOwner.markReady(this.#snapshot,this.#runLease),acceptParent:r=>{guard();if(r.status!==200)throw new BoundedReadError('invalid_response');consumer!.parent(mint('parent',r.value));guard();},
        bind:(s,p,port)=>this.#runOwner.inspectSource(this.#snapshot,this.#runLease,s,p,port)!==null,
        prepared:(h,s,l,source,p,port)=>this.#runOwner.transportConstructor.inspectPrepared(h,s,l,source,p,port),stop,failure:()=>this.#runOwner.failure(),
      },{fake_io:true,typed_body:true,native_body:true,lease:this.#runLease,source:scope.source,target:input.update_set_sys_id,auth,
        limits:{requests:this.limits.requests,total_bytes:this.limits.totalBytes,response_bytes:this.limits.responseBytes,deadline_ms:this.limits.deadlineMs},accounting:scope.accounting,
        dispatch:(r,signal)=>fake.dispatch(r,signal),schedule:(ms,wake)=>{const timer=setTimeout(wake,ms);return ()=>clearTimeout(timer);},
        resolveRelease:async r=>{guard();
          // Only the fixed-200 transcript is adopted; a 403 must never reach the C-mode fallback through a missing body.
          if(r.status!==200)throw new BoundedReadError('invalid_response');const decision=await consumer!.release(mint('release',r.value));guard();if(decision.release_match!=='matched')return null;const port=BoundedUpdateSetSource.releasePortFor(scope.source,this,decision.permit);if(!port)throw new BoundedReadError('internal_review_error');return {source:scope.source,permit:decision.permit,port};},
      });
      this.#compositionRevoke=()=>{this.#compositionKey=undefined;consumer?.revoke();contract?.revoke();};
      const result=await contract.run(scope.handle,this.#snapshot,this.#runLease);
      if(!result.ok)throw new BoundedReadError(this.stopCode??(['invalid_state','invalid_observation_time','evidence_binding_mismatch'].includes(result.code)?'internal_review_error':result.code as ReadFailureCode));
      guard();const status=this.#runOwner.inspect(this.#snapshot,this.#runLease);guard();
      return Object.freeze({...result.value,fake_io:true as const,auth_ready:status.auth_ready,ready_generation:status.ready_generation,budget:this.#budget.view.stats(),phase_reserve_ms:this.reserveMs});
    }finally{this.#compositionKey=undefined;consumer?.revoke();contract?.revoke();scope.accounting.release();this.#compositionRevoke=undefined;}
  }
  #checkComposition(){
    this.#syncRunFailure();
    const sample=this.#runLease.read(),failure=this.#budget.view.failure();
    if(failure)throw this.#adopt(new CanonicalBudgetError(failure));
    if(this.disposed)throw new BoundedReadError('closed');
    if(sample.remaining_ms<=this.reserveMs)throw new BoundedReadError('phase_deadline_exceeded');
  }

  constructor(snapshot: ReadSnapshot, options: BoundedReadOptions = {}) {
   try{
    const pinned=pinDataObject(snapshot,snapshotKeys),fields=pinDataObject(options,new Set(['limits','fetch','signal']));
    this.#snapshot = { ...pinned, oauth: { ...pinDataObject(pinned.oauth,oauthKeys) } } as unknown as ReadSnapshot;
    this.#construction.attempt('snapshot');this.#construction.held('snapshot');
    const signal=fields.signal as AbortSignal|undefined;
    if(signal!==undefined){
      if(types.isProxy(signal)||Object.getPrototypeOf(signal)!==AbortSignal.prototype||['aborted','addEventListener','removeEventListener'].some(k=>Object.hasOwn(signal,k)))throw new BoundedReadError('invalid_input');
      Reflect.apply(Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!,signal,[]);
    }
    if(fields.fetch!==undefined&&(typeof fields.fetch!=='function'||types.isProxy(fields.fetch)))throw new BoundedReadError('invalid_input');
    this.limits = { ...BOUNDED_LIMITS };
    const reduced=fields.limits===undefined?{}:pinDataObject(fields.limits,new Set(Object.keys(BOUNDED_LIMITS)));
    for (const [key, value] of Object.entries(reduced)) {
      if (!(key in BOUNDED_LIMITS) || typeof value!=='number' || !Number.isInteger(value) || value < 1 || value > BOUNDED_LIMITS[key as keyof typeof BOUNDED_LIMITS]) {
        throw new BoundedReadError('invalid_input');
      }
      this.limits[key as keyof typeof BOUNDED_LIMITS] = value as number;
    }
    this.#constructionStage='clock';
    this.started=performance.now();
    if(!Number.isFinite(this.started)||this.started<0){this.#construction.fail('clock','invalid_observation_time');throw new BoundedReadError('internal_review_error');}
    this.startedAt=new Date().toISOString();
    this.#constructionStage='input';
    // Validate and key the stored copy, never the caller's object again.
    const copy = this.#snapshot;
    let url: URL;
    try { url = new URL(copy.instanceUrl); } catch { throw new BoundedReadError('invalid_input'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
      throw new BoundedReadError('invalid_input');
    }
    this.baseUrl = url.origin;
    this.#constructionStage='config';
    try { this.releasePolicy = pinReviewReleaseConfig(copy.reviewReleaseConfigProvider
      ? copy.reviewReleaseConfigProvider() : copy.reviewReleaseConfig, this.baseUrl, this.startedAt, this.limits.deadlineMs); }
    catch { throw new BoundedReadError('config_invalid'); }
    this.#constructionStage='authentication';
    if (copy.authMode === 'impersonation') throw new BoundedReadError('authentication_failed');
    this.authMode = copy.authMode === 'per-user' ? 'per-user' : 'service-account';
    if (this.authMode === 'per-user' && !copy.perUserBearerToken) throw new BoundedReadError('authentication_failed');
    // Credential-key admission, not a stable user ID: rotated per-user tokens count as distinct keys.
    this.principalKey = createHash('sha256').update(JSON.stringify([this.baseUrl, this.authMode,
      this.authMode === 'per-user' ? copy.perUserBearerToken : [copy.oauth.clientId, copy.oauth.username ?? '']])).digest('hex');
    this.#constructionStage='admission';
    if (active >= 2 || principals.has(this.principalKey)) throw new BoundedReadError('review_busy');
    // Keep the existing busy/authentication precedence; do not move admission ahead of validation.
    this.#constructionStage='core';this.#construction.attempt('core');
    this.#budget=createCanonicalReviewBudget({clock:{remainingMs:()=>Math.max(0,this.limits.deadlineMs-(performance.now()-this.started))},limits:{requests:this.limits.requests,totalBytes:this.limits.totalBytes,payloadBytes:this.limits.payloadBytes,totalPayloadBytes:this.limits.totalPayloadBytes,deadlineMs:this.limits.deadlineMs}});
    this.#construction.held('core');this.#checkConstruction();
    this.#constructionStage='admission';this.#construction.attempt('admission');
    active++; principals.add(this.principalKey);
    this.#admitted=true;this.#construction.held('admission');this.#checkConstruction();
    this.#runLease=Object.freeze({read:()=>{
      try{return this.#budget.view.lease.read();}catch(error){throw this.#adopt(error,'internal_review_error');}
    }});
    this.#constructionStage='owner';this.#construction.attempt('registered_owner');
    this.#runOwner=registerReviewEvidenceSession(this,this.#snapshot,this.#runLease,undefined,
      {core:this.#budget,stop:code=>this.stop(this.#budget.view.failure()??(code as ReadFailureCode))});
    this.#construction.held('registered_owner');this.#checkConstruction();
    if(!this.#construction.bindCore({session:this,snapshot:this.#snapshot,core:this.#budget,lease:this.#runLease,owner:this.#runOwner}))this.#checkConstruction();
    this.fetcher = fields.fetch as typeof fetch??((...args) => globalThis.fetch(...args));
    this.#constructionStage='controllers';this.#construction.attempt('controller');
    this.controller=new AbortController();this.#construction.held('controller');this.#checkConstruction();
    this.#construction.attempt('phase_controller');this.phase=new AbortController();this.#construction.held('phase_controller');this.#checkConstruction();
    this.#constructionStage='timer';this.#construction.attempt('deadline_timer');
    this.timer = setTimeout(() => this.stop('deadline_exceeded'), Math.max(0, this.limits.deadlineMs - (performance.now() - this.started)));
    if(this.timer===undefined||this.timer===null)throw new BoundedReadError('internal_review_error');
    this.#construction.held('deadline_timer');this.#checkConstruction();
    const cancel = () => this.stop('cancelled');
    if(signal){
      const add=signal.addEventListener,remove=signal.removeEventListener;
      this.removeExternal=()=>Reflect.apply(remove,signal,['abort',cancel]);
      this.#constructionStage='listener';this.#construction.attempt('abort_listener');
      Reflect.apply(add,signal,['abort',cancel,{once:true}]);this.#construction.held('abort_listener');
      this.#checkConstruction();
    }
    this.#constructionStage='commit';if(!this.#construction.commit())this.#checkConstruction();
    this.#constructing=false;
    // Preserve direct-new compatibility: a pre-aborted signal returns a stopped instance, never usable authority.
    // The pre-abort is the last construction fact; later stops belong to the session/owner layers only.
    if(signal?.aborted){this.#construction.fail('commit','cancelled');cancel();}
   }catch(error){
    const descriptor=error&&typeof error==='object'&&!types.isProxy(error)?Object.getOwnPropertyDescriptor(error,'code'):undefined;
    const reason=descriptor&&'value' in descriptor?constructionCode(descriptor.value):'internal_review_error';
    this.#construction.fail(this.#constructionStage,reason);this.#rollbackConstruction();
    const failure=new BoundedReadError(this.#construction.failure()!.public_code);constructionFailures.set(failure,this.#construction.copy());throw failure;
   }
  }

  #checkConstruction(){const failure=this.#construction.failure();if(failure)throw new BoundedReadError(failure.public_code);}
  /** Fixed slot order, not a stack of caller-provided callbacks. Safe for partial initialization. */
  #rollbackConstruction(){
    if(this.disposed)return;this.disposed=true;
    const release=(k:ConstructionResource,operation:(()=>void)|undefined)=>{
      if(!this.#construction.needed(k))return;
      let confirmed=false;try{if(operation){operation();confirmed=true;}}catch{/* retain fixed state; never exception text */}
      this.#construction.release(k,confirmed,operation!==undefined);
      if(!confirmed)this.#construction.fail('close','internal_review_error');
    };
    release('source_transport',this.#compositionRevoke);this.#compositionRevoke=undefined;this.#compositionKey=undefined;this.#compositionSource=undefined;
    release('registered_owner',this.#runOwner?()=>this.#runOwner.close(this.stopCode??this.#construction.failure()?.code??'closed'):undefined);
    release('core',this.#budget?()=>this.#budget.writer.close():undefined);
    release('abort_listener',this.removeExternal);
    release('deadline_timer',this.timer!==undefined?()=>clearTimeout(this.timer):undefined);
    release('phase_timer',this.phaseTimer!==undefined?()=>clearTimeout(this.phaseTimer):undefined);
    release('phase_controller',this.phase?()=>this.phase.abort():undefined);
    release('controller',this.controller?()=>this.controller.abort():undefined);
    release('admission',this.#admitted?()=>{this.#admitted=false;active--;principals.delete(this.principalKey);}:undefined);
    release('snapshot',this.#snapshot?()=>{this.token=undefined;this.#snapshot.perUserBearerToken=undefined;this.#snapshot.accessToken=undefined;this.#snapshot.oauth={clientId:'',clientSecret:''};this.#snapshot.reviewReleaseConfigProvider=undefined;}:undefined);
    this.fetcher=()=>{throw new BoundedReadError('closed');};
    this.#construction.seal();this.#constructing=false;
  }

  stats() { return {...this.#budget.view.stats()}; }
  #account(operation:()=>void){
    try{operation();}catch(error){throw this.#adopt(error);}
  }
  /** Core stops reach the owner with their internal reason first; only the session sees the public mapping. */
  #adopt(error:unknown,fallback?:ReadFailureCode){
    if(!(error instanceof CanonicalBudgetError))return error;
    const primary=this.#budget.view.diagnostic().primary;
    if(primary){if(this.#constructing)this.#construction.fail(this.#constructionStage,primary.internal);if(this.#runOwner)this.#runOwner.revoke(primary.internal);}
    const reason=this.#budget.view.failure()??fallback;
    if(reason)this.stop(reason);
    return new BoundedReadError(error.code);
  }
  /** Fixed readonly diagnostics only: no handles, credentials, lease or activation authority. */
  reviewRunStatus() {
    const status=this.#runOwner.inspect(this.#snapshot,this.#runLease);
    this.#syncRunFailure();return status;
  }
  /** Prepared release binding only; the concrete source verifies its own private permit/port. */
  bindReviewReleaseSource(source:BoundedUpdateSetSource,permit:object){
    this.check();const port=BoundedUpdateSetSource.releasePortFor(source,this,permit);
    if(!port){this.#runOwner.rejectSource();this.#syncRunFailure();throw new BoundedReadError(this.stopCode??'internal_review_error');}
    const bound=this.#runOwner.bindSource(this.#snapshot,this.#runLease,source,permit,port);
    this.#syncRunFailure();if(!bound)throw new BoundedReadError(this.stopCode??'internal_review_error');
  }
  reviewReleaseSourceStatus(source:BoundedUpdateSetSource,permit:object){
    const port=BoundedUpdateSetSource.releasePortFor(source,this,permit);
    if(!port)this.#runOwner.rejectSource();
    const result=port?this.#runOwner.inspectSource(this.#snapshot,this.#runLease,source,permit,port):null;
    this.#syncRunFailure();if(!result)throw new BoundedReadError(this.stopCode??(this.disposed?'closed':'internal_review_error'));return result;
  }
  #syncRunFailure(){
    const reason=this.#runOwner.failure();
    if(reason&&!this.#stopPropagated&&!this.disposed){this.#budget.writer.stop(reason);this.stop(this.stopCode!);}
  }
  /** Monotonic run budget, also usable for safe CPU finalization after an HTTP stop. */
  remainingMs() { return Math.max(0, this.limits.deadlineMs - (performance.now() - this.started)); }
  get deadlineMs() { return this.limits.deadlineMs; }
  phaseRemainingMs() { return Math.max(0, this.remainingMs() - this.reserveMs); }
  /** Internal phase boundary only. Never extends the original hard deadline. */
  setPhaseReserve(reserveMs: number) {
    if (!Number.isFinite(reserveMs) || reserveMs < 0 || reserveMs >= this.limits.deadlineMs || this.busy || this.disposed) {
      throw new BoundedReadError('invalid_input');
    }
    clearTimeout(this.phaseTimer);
    this.phase = new AbortController(); this.reserveMs = reserveMs;
    if (reserveMs > 0) this.phaseTimer = setTimeout(() => this.phase.abort(), this.phaseRemainingMs());
  }
  assertActive() { this.check(); }
  private stop(code: ReadFailureCode) {
    if(this.disposed)return;
    if(this.#constructing){
      this.#construction.fail(this.#constructionStage,code);
      if(this.#constructionStopping)return;this.#constructionStopping=true;
      try{if(this.#budget)this.#budget.writer.stop(code);if(this.#runOwner)this.#runOwner.revoke(code);}finally{this.#constructionStopping=false;}
      return;
    }
    this.#budget.writer.stop(code);
    if(this.#stopPropagated)return;
    this.#stopPropagated=true;
    this.#runOwner.revoke(this.stopCode!);
    this.#compositionRevoke?.();
    this.controller.abort();
  }
  private check() {
    if(this.#compositionKey){this.#checkComposition();return;}
    this.#syncRunFailure();
    if (performance.now() - this.started >= this.limits.deadlineMs) this.stop('deadline_exceeded');
    if (this.stopCode) throw new BoundedReadError(this.stopCode);
    if (this.disposed) throw new BoundedReadError('closed');
    if (this.phaseRemainingMs() <= 0 || this.phase.signal.aborted) throw new BoundedReadError('phase_deadline_exceeded');
  }
  /** Race even non-cooperative fetch/body implementations; late responses are cancelled by attempt(). */
  private async guarded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
    const failure = () => this.stopCode ?? (this.phase.signal.aborted || this.phaseRemainingMs() <= 0 ? 'phase_deadline_exceeded' : 'upstream_unavailable');
    if (signal.aborted) throw new BoundedReadError(failure());
    let abort!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(new BoundedReadError(failure()));
      signal.addEventListener('abort', abort, { once: true });
    });
    try { return await Promise.race([work, cancelled]); } finally { signal.removeEventListener('abort', abort); }
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    try {
      this.check();
      const result = await this.guarded(Promise.resolve().then(work), this.controller.signal);
      this.check();
      return result;
    }
    finally { this.close(); }
  }
  close() {
    this.#close();
  }
  #close() {
    if (this.disposed) return;
    if(this.#constructing){this.stop('closed');return;}
    if(this.#compositionRevoke){this.#construction.attempt('source_transport');this.#construction.held('source_transport');}
    if(this.phaseTimer!==undefined){this.#construction.attempt('phase_timer');this.#construction.held('phase_timer');}
    this.#rollbackConstruction();
  }
  private async attempt(path: string, init: RequestInit, final: boolean): Promise<{ status: number; value?: unknown }> {
    this.check();
    // Four attempts remain reserved for final parent + metadata verification (including retries).
    const prior=this.#budget.view.stats();
    if (prior.requests >= this.limits.requests - (final ? 0 : 4)) throw new BoundedReadError('request_budget_exceeded');
    if (prior.received_bytes >= this.limits.totalBytes) { this.stop('receive_budget_exceeded'); this.check(); }
    this.#account(()=>this.#budget.writer.dispatch(final));
    const controller = new AbortController();
    const onStop = () => controller.abort();
    this.controller.signal.addEventListener('abort', onStop, { once: true });
    const phaseSignal = this.phase.signal;
    phaseSignal.addEventListener('abort', onStop, { once: true });
    const timer = setTimeout(() => controller.abort(), Math.min(this.limits.requestTimeoutMs,
      this.phaseRemainingMs()));
    let response: Response | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const pending = this.fetcher(new URL(path, this.baseUrl), { ...init, signal: controller.signal, redirect: 'error' });
      void pending.then(late => { if (controller.signal.aborted) void late.body?.cancel().catch(() => {}); }, () => {});
      response = await this.guarded(pending, controller.signal);
      this.check();
      // Terminal statuses need no body. Cancel immediately: a stalled 401 body must never become a retryable timeout.
      if (!response.ok && response.status !== 429 && response.status < 500) return { status: response.status };
      if (!response.body) throw new BoundedReadError('invalid_response');
      reader = response.body.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const chunk = await this.guarded(reader.read(), controller.signal);
        this.check();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        this.#account(()=>this.#budget.writer.chunk(chunk.value.byteLength));
        if (size > this.limits.responseBytes) {
          this.stop('receive_budget_exceeded'); this.check();
        }
        if (response.ok) chunks.push(chunk.value);
      }
      if (!response.ok) return { status: response.status };
      let value: unknown;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { throw new BoundedReadError('invalid_response'); }
      this.check();
      return { status: response.status, value };
    } catch (error) {
      if (error instanceof BoundedReadError) throw error;
      throw new BoundedReadError(this.stopCode ?? (phaseSignal.aborted || this.phaseRemainingMs() <= 0 ? 'phase_deadline_exceeded' : 'upstream_unavailable'));
    } finally {
      clearTimeout(timer); this.controller.signal.removeEventListener('abort', onStop);
      phaseSignal.removeEventListener('abort', onStop);
      controller.abort();
      if (reader) void reader.cancel().catch(() => {});
      else if (response) void response.body?.cancel().catch(() => {});
    }
  }
  private async request(path: string, init: RequestInit, final = false): Promise<unknown> {
    for (let n = 0; n < 2; n++) {
      try {
        const r = await this.attempt(path, init, final);
        if (r.status === 403 && path.startsWith('/api/now/table/sys_cluster_state?')) {
          throw new BoundedReadError('access_denied');
        }
        if (r.status === 401 || r.status === 403) {
          this.stop(r.status === 401 ? 'authentication_failed' : 'access_denied'); this.check();
        }
        if (r.status === 404) throw new BoundedReadError('not_found_or_not_visible');
        if (r.status >= 200 && r.status < 300) return r.value;
        if (r.status !== 429 && r.status < 500) throw new BoundedReadError('invalid_response');
        throw new BoundedReadError('upstream_unavailable');
      } catch (error) {
        if (!(error instanceof BoundedReadError) || error.code !== 'upstream_unavailable' || n === 1) throw error;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const controller = new AbortController();
        const abort = () => controller.abort();
        this.controller.signal.addEventListener('abort', abort, { once: true });
        const phaseSignal = this.phase.signal;
        phaseSignal.addEventListener('abort', abort, { once: true });
        if (this.controller.signal.aborted || phaseSignal.aborted) controller.abort();
        try { await this.guarded(new Promise(resolve => { timer = setTimeout(resolve, this.limits.retryDelayMs); }), controller.signal); }
        finally { clearTimeout(timer); this.controller.signal.removeEventListener('abort', abort); phaseSignal.removeEventListener('abort', abort); }
      }
    }
    throw new BoundedReadError('upstream_unavailable');
  }
  private async authenticate() {
    if (this.authMode === 'per-user') { this.token = this.#snapshot.perUserBearerToken; return; }
    if (this.#snapshot.accessToken && (this.#snapshot.tokenExpiry ?? 0) > Date.now() + this.limits.deadlineMs) {
      this.token = this.#snapshot.accessToken; return;
    }
    const oauth = this.#snapshot.oauth;
    if (!oauth.clientId || !oauth.clientSecret) throw new BoundedReadError('authentication_failed');
    const body = new URLSearchParams({ client_id: oauth.clientId, client_secret: oauth.clientSecret,
      grant_type: oauth.username && oauth.password ? 'password' : 'client_credentials' });
    if (oauth.username && oauth.password) { body.set('username', oauth.username); body.set('password', oauth.password); }
    const value = await this.request('/oauth_token.do', { method: 'POST', body: body.toString(),
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' } });
    const data = value as { access_token?: unknown; expires_in?: unknown; token_type?: unknown } | null;
    if (!data || typeof data.access_token !== 'string' || !data.access_token || /[\r\n]/.test(data.access_token)
      || typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in * 1000 <= this.limits.deadlineMs
      || (data.token_type !== undefined && String(data.token_type).toLowerCase() !== 'bearer')) throw new BoundedReadError('authentication_failed');
    this.token = data.access_token;
  }
  async get(path: string, final = false): Promise<unknown> {
    this.check();
    if (!/^\/api\/now\/table\/(sys_update_set|sys_cluster_state|sys_update_xml)(\/[^/?]+)?\?/.test(path)) throw new BoundedReadError('invalid_input');
    if (this.busy) throw new BoundedReadError('review_busy');
    this.busy = true;
    try {
      this.readyPromise ??= this.authenticate().then(() => {
        if(!this.#runOwner.markReady(this.#snapshot,this.#runLease)){this.#syncRunFailure();this.check();throw new BoundedReadError('internal_review_error');}
      }, error => {
        this.#runOwner.revoke(error instanceof BoundedReadError ? error.code : 'internal_review_error','authentication');
        throw error;
      });
      await this.readyPromise; this.check();
      return await this.request(path, { method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${this.token}` } }, final);
    } finally { this.busy = false; }
  }
  chargePayload(payload: string) {
    this.check();
    this.chargePayloadBytes(payload);
  }
  /** One charge of a received payload string at the source boundary. */
  private chargePayloadBytes(payload: string) {
    this.#account(()=>this.#budget.writer.payload(payload));
  }
}
