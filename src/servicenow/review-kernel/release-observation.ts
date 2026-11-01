/** Internal value-only one-shot clock state. No session/source adoption or authority. */
import {z} from 'zod';

export function createReleaseObservation(origin:Readonly<{startedAt:string;deadlineMs:number}>,
  dependencies:Readonly<{clock():Date;check():void;reject():never}>){
  const start=Date.parse(origin.startedAt),duration=origin.deadlineMs;
  const clock=dependencies.clock,check=dependencies.check,reject=dependencies.reject;
  const valid=z.iso.datetime().max(40).safeParse(origin.startedAt).success&&Number.isFinite(start)&&
    Number.isInteger(duration)&&duration>=1&&duration<=60000&&Number.isSafeInteger(start+duration);
  let state:'fresh'|'sampling'|'sampled'|'failed'|'closed'='fresh';
  const fail=():never=>{if(state!=='closed')state='failed';return reject();};
  return Object.freeze({
    sample():string{
      if(state!=='fresh'||!valid)return fail();
      state='sampling';
      try{
        check();
        const date=clock(),epoch=Date.prototype.getTime.call(date);
        const iso=Date.prototype.toISOString.call(date);
        if(!Number.isFinite(epoch)||epoch<start||epoch>start+duration||Date.parse(iso)!==epoch||!z.iso.datetime().max(40).safeParse(iso).success)throw Error('invalid_observation');
        check();if(state!=='sampling')throw Error('invalid_observation');
        state='sampled';return iso;
      }catch{return fail();}
    },
    close(){state='closed';},
  });
}
