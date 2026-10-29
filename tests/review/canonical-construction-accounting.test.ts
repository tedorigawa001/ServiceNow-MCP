import {expect,it,vi} from 'vitest';
import {createCanonicalReviewBudget} from '../../src/servicenow/review-canonical-budget.js';
import {createCanonicalBootstrapBudget} from '../../src/servicenow/review-canonical-bootstrap-budget.js';
const fresh=()=>createCanonicalReviewBudget({clock:{remainingMs:()=>60000}});
it('supplies accounting from the same core instead of constructing a second budget',()=>{
  const core=createCanonicalReviewBudget({clock:{remainingMs:()=>60000}}),port=core.construction.takeBootstrapAccounting();
  port.reserve();port.dispatch(50250);port.chunk(7);
  expect(core.view.stats()).toEqual({requests:1,received_bytes:7,payload_bytes:0});expect(core.view.lease.read()).toMatchObject({requests:1,received_bytes:7,payload_bytes:0});
  expect(port.reserved()).toBe(4);expect(core.construction.status()).toMatchObject({claim:'claimed',reservation:'reserved'});port.release();expect(port.reserved()).toBe(0);
});
it('consumes the acquisition once and preserves the first failure without affecting another core',()=>{
 const core=fresh(),other=fresh(),port=core.construction.takeBootstrapAccounting();port.reserve();
 expect(()=>core.construction.takeBootstrapAccounting()).toThrow('internal_review_error');
 expect(()=>port.dispatch()).toThrow('internal_review_error');
 expect(core.view.diagnostic().primary?.internal).toBe('invalid_state');
 other.writer.dispatch();expect(other.view.stats().requests).toBe(1);
});
it.each(['dispatch','dispatchAt','chunk','payload'] as const)('rejects acquisition after legacy %s starts',method=>{
 const core=fresh();
 if(method==='dispatch')core.writer.dispatch();else if(method==='dispatchAt')core.writer.dispatchAt(0);else if(method==='chunk')core.writer.chunk(0);else core.writer.payload('');
 expect(()=>core.construction.takeBootstrapAccounting()).toThrow('internal_review_error');
 expect(core.construction.status().claim).toBe('failed');
});
it('does not infer unused legacy mode from zero counters after a quota refusal',()=>{
 const core=createCanonicalReviewBudget({clock:{remainingMs:()=>60000},limits:{requests:4}});
 expect(()=>core.writer.dispatch()).toThrow('request_budget_exceeded');
 expect(core.view.stats().requests).toBe(0);expect(()=>core.construction.takeBootstrapAccounting()).toThrow('internal_review_error');
});
it.each(['stop','close'] as const)('never remints after %s',method=>{
 const core=fresh();if(method==='stop')core.writer.stop('cancelled');else core.writer.close();
 expect(()=>core.construction.takeBootstrapAccounting()).toThrow(method==='stop'?'cancelled':'closed');
 expect(()=>core.construction.takeBootstrapAccounting()).toThrow();expect(core.construction.status().claim).toBe('failed');
});
it('rejects a foreign argument rather than adopting its state',()=>{
 const core=fresh(),other=fresh();expect(()=>Reflect.apply(core.construction.takeBootstrapAccounting,null,[other])).toThrow('invalid_input');
 expect(other.view.failure()).toBeNull();expect(()=>core.construction.takeBootstrapAccounting()).toThrow('invalid_input');
});
it.each([NaN,0,60001])('fails closed on invalid or expired acquisition clock %s',remaining=>{
 const core=createCanonicalReviewBudget({clock:{remainingMs:()=>remaining}});
 expect(()=>core.construction.takeBootstrapAccounting()).toThrow();expect(core.construction.status().claim).toBe('failed');
});
it('consumes claim before a clock callback can reenter',()=>{
 let core:ReturnType<typeof fresh>;core=createCanonicalReviewBudget({clock:{remainingMs(){expect(()=>core.construction.takeBootstrapAccounting()).toThrow();return 60000;}}});
 expect(()=>core.construction.takeBootstrapAccounting()).toThrow('internal_review_error');expect(core.construction.status().claim).toBe('failed');
});
it('does not expose authority through frozen readonly observations',()=>{
 const core=fresh();expect(Object.keys(core.view).sort()).toEqual(['diagnostic','failure','lease','stats']);
 expect(Object.keys(core.view.lease)).toEqual(['read']);expect(Object.isFrozen(core.construction)).toBe(true);
 expect(Object.isFrozen(core.construction.status())).toBe(true);core.view.lease.read();core.construction.takeBootstrapAccounting().reserve();
});
it('rejects stale legacy writes after acquisition',()=>{
 const core=fresh();core.construction.takeBootstrapAccounting().reserve();expect(()=>core.writer.chunk(0)).toThrow('internal_review_error');expect(core.view.stats().received_bytes).toBe(0);
});
it('requires reserve, releases once, and cannot reopen',()=>{
 const core=fresh(),port=core.construction.takeBootstrapAccounting();port.reserve();port.dispatch();port.chunk(3);port.release();port.release();
 expect(port.reserved()).toBe(0);expect(core.view.stats()).toEqual({requests:1,received_bytes:3,payload_bytes:0});expect(()=>port.dispatch()).toThrow();expect(()=>port.reserve()).toThrow();
});
it('rejects accounting before reserve',()=>{const core=fresh(),port=core.construction.takeBootstrapAccounting();expect(()=>port.chunk(1)).toThrow();expect(core.view.stats().received_bytes).toBe(0);});
it('rejects constructor reservation greater than a reduced cap',()=>{const core=createCanonicalReviewBudget({clock:{remainingMs:()=>60000},limits:{requests:3}});expect(()=>core.construction.takeBootstrapAccounting()).toThrow('invalid_input');expect(core.construction.status().claim).toBe('failed');});
it('retains cancellation observed during reserve and permits only cleanup',()=>{
 let hook=()=>{};const core=createCanonicalReviewBudget({clock:{remainingMs(){hook();return 60000;}}}),port=core.construction.takeBootstrapAccounting();
 hook=()=>core.writer.stop('cancelled');expect(()=>port.reserve()).toThrow('cancelled');expect(core.construction.status().reservation).toBe('failed');port.release();expect(()=>port.dispatch()).toThrow('cancelled');
});
it('keeps the fresh factory lazy and delegates into one core',()=>{
 const clock={remainingMs:vi.fn(()=>60000)},factory=createCanonicalBootstrapBudget({clock});expect(clock.remainingMs).not.toHaveBeenCalled();
 factory.accounting.reserve();factory.accounting.dispatch(50250);factory.accounting.chunk(9);
 expect(factory.lease.read()).toMatchObject({requests:1,received_bytes:9,payload_bytes:0});factory.accounting.release();
});
