/** SA-02 development-only entry. Package-excluded; the runtime keeps only the one-shot private friend. */
import {types} from 'node:util';
import {BoundedReadError,takeStatusAcceptanceProbe,type BoundedReadOptions,type ReadSnapshot} from '../servicenow/bounded-read.js';

export interface StatusAcceptanceFakeIO {readonly parent_bytes:Uint8Array;readonly release_status:403|404;readonly cleanup:'cancelled'|'no_body'|'unconfirmed';readonly delay_ms?:number;}
const typed=Object.getPrototypeOf(Uint8Array.prototype),length=Object.getOwnPropertyDescriptor(typed,'byteLength')!.get!,buffer=Object.getOwnPropertyDescriptor(typed,'buffer')!.get!,set=Uint8Array.prototype.set;
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength')!.get!;
function data(raw:unknown,keys:string[]){
 if(!raw||typeof raw!=='object'||types.isProxy(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw Error('invalid_input');
 const fields=Object.getOwnPropertyDescriptors(raw),out:Record<string,unknown>={};
 for(const k of Reflect.ownKeys(fields)){const d=Reflect.get(fields,k) as PropertyDescriptor;if(typeof k!=='string'||!keys.includes(k)||!Object.hasOwn(d,'value'))throw Error('invalid_input');out[k]=d.value;}
 return out;
}

/** Separate closed-gate profile: synthetic cleanup facts, never a native terminal or runtime registration. */
function pinStatusAcceptanceFakeIO(raw:unknown){
 const r=data(raw,['parent_bytes','release_status','cleanup','delay_ms']);
 if(!types.isUint8Array(r.parent_bytes)||types.isProxy(r.parent_bytes)||![403,404].includes(r.release_status as number)||!['cancelled','no_body','unconfirmed'].includes(r.cleanup as string)||r.delay_ms!==undefined&&(!Number.isSafeInteger(r.delay_ms)||(r.delay_ms as number)<0||(r.delay_ms as number)>10000))throw Error('invalid_input');
 const n=Reflect.apply(length,r.parent_bytes,[]) as number;Reflect.apply(bufferLength,Reflect.apply(buffer,r.parent_bytes,[]),[]);
 if(n>4194304)throw Error('invalid_input');
 const bytes=new Uint8Array(n);Reflect.apply(set,bytes,[r.parent_bytes]);
 const status=r.release_status as 403|404,cleanup=r.cleanup as StatusAcceptanceFakeIO['cleanup'],delay=r.delay_ms as number??0;
 let closed=false,read=false,observed=false;
 return Object.freeze({
  parent(){if(closed||read)throw Error('invalid_state');read=true;return bytes;},
  async observe(signal:AbortSignal){
   if(closed||observed||!read||signal.aborted)throw Error('closed');observed=true;
   if(delay)await new Promise<void>((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(Error('cancelled'));};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},delay);
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
   });
   if(closed||signal.aborted)throw Error('closed');return Object.freeze({purpose:'release' as const,status,cleanup});
  },
  dispose(){if(closed)return;closed=true;bytes.fill(0);},
 });
}

const probe=takeStatusAcceptanceProbe();

/** Fresh fake-only probe. No existing-session adoption, transport injection or activation flag. */
export async function probeNewStatusAcceptance(snapshot:ReadSnapshot,input:unknown,options:Pick<BoundedReadOptions,'signal'|'limits'>&{synthetic_status:StatusAcceptanceFakeIO}){
 let fields:Record<string,unknown>,fake:ReturnType<typeof pinStatusAcceptanceFakeIO>;
 try{fields=data(options,['signal','limits','synthetic_status']);fake=pinStatusAcceptanceFakeIO(fields.synthetic_status);}
 catch{throw new BoundedReadError('invalid_input');}
 try{
  return await probe(snapshot,input,{...(Object.hasOwn(fields,'signal')?{signal:fields.signal as AbortSignal|undefined}:{}),...(Object.hasOwn(fields,'limits')?{limits:fields.limits as BoundedReadOptions['limits']}:{}),fake});
 }finally{fake.dispose();}
}
