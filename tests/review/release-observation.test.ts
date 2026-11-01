import {expect,it} from 'vitest';
import {createReleaseObservation} from '../../src/servicenow/review-kernel/release-observation.js';
it('samples after the pre-guard once and never samples again after failure',()=>{
  let reads=0;const steps:string[]=[];
  const observation=createReleaseObservation({startedAt:'2026-11-01T00:00:00.000Z',deadlineMs:60000},{
    clock:()=>{reads++;steps.push('clock');throw Error('PRIVATE_CLOCK');},
    check:()=>{steps.push('guard');},reject:()=>{throw Error('internal_review_error');},
  });
  expect(()=>observation.sample()).toThrow('internal_review_error');
  expect(()=>observation.sample()).toThrow('internal_review_error');
  expect(reads).toBe(1);expect(steps).toEqual(['guard','clock']);
});
const start='2026-11-01T00:00:00.000Z',epoch=Date.parse(start);
it.each([0,60000])('uses one date and guards in order at UTC offset %i',offset=>{
  const steps:string[]=[];let reads=0;
  const owner=createReleaseObservation({startedAt:start,deadlineMs:60000},{clock:()=>{steps.push('clock');reads++;return new Date(epoch+offset);},check:()=>{steps.push('guard');},reject:()=>{throw Error('internal_review_error');}});
  expect(owner.sample()).toBe(new Date(epoch+offset).toISOString());expect(steps).toEqual(['guard','clock','guard']);
  expect(()=>owner.sample()).toThrow('internal_review_error');expect(reads).toBe(1);
});
it.each([-1,60001,NaN])('rejects reversed/out-of-horizon/nonfinite UTC %s with no retry',offset=>{
  let reads=0;const owner=createReleaseObservation({startedAt:start,deadlineMs:60000},{clock:()=>{reads++;return new Date(epoch+offset);},check:()=>{},reject:()=>{throw Error('internal_review_error');}});
  expect(()=>owner.sample()).toThrow('internal_review_error');expect(()=>owner.sample()).toThrow('internal_review_error');expect(reads).toBe(1);
});
it.each([1,2])('does not resample after guard %i rejects',at=>{
  let checks=0,reads=0;const owner=createReleaseObservation({startedAt:start,deadlineMs:60000},{clock:()=>{reads++;return new Date(epoch);},check:()=>{if(++checks===at)throw Error('PRIVATE_GUARD');},reject:()=>{throw Error('cancelled');}});
  expect(()=>owner.sample()).toThrow('cancelled');expect(()=>owner.sample()).toThrow('cancelled');expect(reads).toBe(at===1?0:1);
});
it('cannot revive a failed sample through caught clock reentry',()=>{
  let reads=0;const owner=createReleaseObservation({startedAt:start,deadlineMs:60000},{clock:()=>{reads++;try{owner.sample();}catch{}return new Date(epoch);},check:()=>{},reject:()=>{throw Error('internal_review_error');}});
  expect(()=>owner.sample()).toThrow('internal_review_error');expect(()=>owner.sample()).toThrow('internal_review_error');expect(reads).toBe(1);
});
it('refuses sampling after close and never reopens',()=>{
  let reads=0;const owner=createReleaseObservation({startedAt:start,deadlineMs:60000},{clock:()=>{reads++;return new Date(epoch);},check:()=>{},reject:()=>{throw Error('closed');}});
  owner.close();expect(()=>owner.sample()).toThrow('closed');expect(reads).toBe(0);
});
it('pins the original timing and trusted clock dependencies before sampling',()=>{
  const timing={startedAt:start,deadlineMs:60000},dependencies={clock:()=>new Date(epoch),check:()=>{},reject:():never=>{throw Error('internal_review_error');}};
  const owner=createReleaseObservation(timing,dependencies);timing.startedAt='2026-10-01T00:00:00.000Z';timing.deadlineMs=1;
  dependencies.clock=()=>{throw Error('PRIVATE_REPLACEMENT');};
  expect(owner.sample()).toBe(start);
});
