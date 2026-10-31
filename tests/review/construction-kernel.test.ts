import {afterEach,expect,it,vi} from 'vitest';
import {createConstructionState} from '../../src/servicenow/review-kernel/construction-state.js';
import {BoundedReadSession} from '../../src/servicenow/bounded-read.js';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('creates isolated pending diagnostics without clocks, controllers, timers or I/O',()=>{
  const forbidden=vi.fn(()=>{throw Error('PRIVATE_SIDE_EFFECT');});
  vi.spyOn(performance,'now').mockImplementation(forbidden);
  vi.spyOn(Date.prototype,'toISOString').mockImplementation(forbidden);
  vi.stubGlobal('AbortController',forbidden);vi.stubGlobal('setTimeout',forbidden);vi.stubGlobal('fetch',forbidden);
  const first=createConstructionState(),second=createConstructionState();
  first.fail('clock','invalid_observation_time');first.seal();
  expect(first.copy()).toMatchObject({state:'closed',sealed:true,primary:{stage:'clock',code:'invalid_observation_time',public_code:'internal_review_error'},teardown:'confirmed'});
  expect(second.copy()).toMatchObject({state:'pending',primary:null,core_bound:false,source_bound:false});
  expect(Object.keys(second.copy().resources)).toHaveLength(10);
  expect(forbidden).not.toHaveBeenCalled();
});

const publicReasons=['invalid_input','authentication_failed','access_denied','not_found_or_not_visible','upstream_unavailable',
  'deadline_exceeded','receive_budget_exceeded','request_budget_exceeded','payload_budget_exceeded','payload_limit','invalid_response',
  'review_busy','cancelled','closed','changed_during_review','release_not_admitted','config_invalid','phase_deadline_exceeded',
  'candidate_filter_violation','internal_review_error'];
it.each(publicReasons)('preserves the fixed public construction reason %s',reason=>{
  const state=createConstructionState();state.fail('input',reason);state.fail('close','cancelled');
  expect(state.failure()).toEqual({stage:'input',code:reason,public_code:reason});
});
it.each(['invalid_state','invalid_observation_time','evidence_binding_mismatch'])('keeps internal %s distinct from its public mapping',reason=>{
  const state=createConstructionState();state.fail('core',reason);
  expect(state.failure()).toEqual({stage:'core',code:reason,public_code:'internal_review_error'});
});
it('normalizes unknown reasons without reading, stringifying or retaining supplied objects',()=>{
  let calls=0;const unknown={get code(){calls++;throw Error('PRIVATE_GETTER');},toString(){calls++;throw Error('PRIVATE_STRING');}};
  for(const value of [unknown,new Proxy({},{get(){calls++;throw Error('PRIVATE_PROXY');}}),'PRIVATE_UNKNOWN',null,1]){
    const state=createConstructionState();state.fail('input',value);
    expect(state.failure()).toEqual({stage:'input',code:'internal_review_error',public_code:'internal_review_error'});
    expect(JSON.stringify(state.copy())).not.toContain('PRIVATE');
  }
  expect(calls).toBe(0);
});
it('keeps resource facts one-shot and unresolved cleanup sticky through seal',()=>{
  const state=createConstructionState();
  state.release('admission',true,true); // Never acquired: no refund.
  state.attempt('deadline_timer'); // No handle was returned.
  state.release('deadline_timer',false,false);state.release('deadline_timer',true,true);
  state.attempt('controller');state.held('controller');state.release('controller',true,true);state.release('controller',true,true);
  state.attempt('abort_listener');state.held('abort_listener');
  state.seal();const sealed=state.copy();
  expect(sealed.resources.admission).toEqual({state:'absent',release_claim:0,releases:0});
  expect(sealed.resources.deadline_timer).toEqual({state:'unconfirmed',release_claim:1,releases:0});
  expect(sealed.resources.controller).toEqual({state:'released',release_claim:1,releases:1});
  expect(sealed.resources.abort_listener.state).toBe('unconfirmed');expect(sealed.teardown).toBe('unconfirmed');
  state.fail('close','cancelled');state.release('abort_listener',true,true);state.attempt('core');state.recordBinding('core');state.seal();
  expect(state.commit()).toBe(false);expect(state.copy()).toEqual(sealed);
});
it('returns detached immutable construction-only labels rather than binding authority',()=>{
  const state=createConstructionState(),before=state.copy();state.recordBinding('core');expect(state.commit()).toBe(true);
  state.recordBinding('source');const ready=state.copy();state.seal();
  expect(before).toMatchObject({state:'pending',core_bound:false,source_bound:false});
  expect(ready).toMatchObject({state:'ready',primary:null,core_bound:true,source_bound:true,purposes:{authentication:false,parent:false,release:false}});
  expect(state.copy()).toMatchObject({state:'closed',core_bound:true,source_bound:true});
  const frozen=(v:unknown)=>{if(v&&typeof v==='object'){expect(Object.isFrozen(v)).toBe(true);for(const child of Object.values(v))frozen(child);}};
  frozen(ready);expect(ready).not.toHaveProperty('session');expect(ready).not.toHaveProperty('writer');
  const unbound=createConstructionState();expect(unbound.commit()).toBe(false);expect(unbound.failure()?.code).toBe('invalid_state');
});
it('cannot mutate a real session or its admission by allocating and sealing local kernel states',()=>{
  const session=new BoundedReadSession({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE',oauth:{}});
  try{
    const before=session.constructionStatus(),local=createConstructionState();
    local.recordBinding('core');local.recordBinding('source');local.commit();local.fail('close','cancelled');local.seal();
    expect(session.constructionStatus()).toEqual(before);expect(session.reviewRunStatus().primary).toBeNull();
    expect(()=>new BoundedReadSession({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE',oauth:{}})).toThrow('review_busy');
  }finally{session.close();}
});
