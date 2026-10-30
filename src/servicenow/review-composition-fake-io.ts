/** Data-only CM-04-03 transcript. Never dispatches a URL, credentials or a caller callback. */
import {types} from 'node:util';
const NativeResponse=Response,NativeStream=ReadableStream;
export interface CompositionFakeIO {readonly responses:readonly {readonly purpose:'authentication'|'parent'|'release';readonly bytes:Uint8Array;readonly delay_ms?:number}[];}
const typed=Object.getPrototypeOf(Uint8Array.prototype),length=Object.getOwnPropertyDescriptor(typed,'byteLength')!.get!,buffer=Object.getOwnPropertyDescriptor(typed,'buffer')!.get!,set=Uint8Array.prototype.set;
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength')!.get!;
function data(raw:unknown,keys:string[]){
 if(!raw||typeof raw!=='object'||types.isProxy(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw Error('invalid_input');
 const fields=Object.getOwnPropertyDescriptors(raw),out:Record<string,unknown>={};
 for(const k of Reflect.ownKeys(fields)){const d=Reflect.get(fields,k) as PropertyDescriptor;if(typeof k!=='string'||!keys.includes(k)||!Object.hasOwn(d,'value'))throw Error('invalid_input');out[k]=d.value;}
 return out;
}
export function pinCompositionFakeIO(raw:unknown){
 const root=data(raw,['responses']),rows=root.responses;
 if(!Array.isArray(rows)||types.isProxy(rows)||rows.length<2||rows.length>3||Reflect.ownKeys(rows).length!==rows.length+1)throw Error('invalid_input');
 const records=Array.from({length:rows.length},(_,i)=>{
  const d=Object.getOwnPropertyDescriptor(rows,String(i));if(!d||!Object.hasOwn(d,'value'))throw Error('invalid_input');
  const r=data(d.value,['purpose','bytes','delay_ms']);
  if(!['authentication','parent','release'].includes(r.purpose as string)||!types.isUint8Array(r.bytes)||types.isProxy(r.bytes))throw Error('invalid_input');
  const n=Reflect.apply(length,r.bytes,[]) as number;Reflect.apply(bufferLength,Reflect.apply(buffer,r.bytes,[]),[]);
  if(n>4194304||r.delay_ms!==undefined&&(!Number.isSafeInteger(r.delay_ms)||(r.delay_ms as number)<0||(r.delay_ms as number)>10000))throw Error('invalid_input');
  const bytes=new Uint8Array(n);Reflect.apply(set,bytes,[r.bytes]);return {purpose:r.purpose as 'authentication'|'parent'|'release',bytes,delay:r.delay_ms as number??0};
 });
 if(!['parent,release','authentication,parent,release'].includes(records.map(r=>r.purpose).join(',')))throw Error('invalid_input');
 let next=0,closed=false;
 return Object.freeze({
  matches(exchange:boolean){return records.map(r=>r.purpose).join(',')===(exchange?'authentication,parent,release':'parent,release');},
  async dispatch(request:{purpose:string},signal:AbortSignal){
   const r=records[next++];if(closed||!r||r.purpose!==request.purpose||signal.aborted)throw Error('closed');
   if(r.delay)await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},r.delay);const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(Error('cancelled'));};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
   if(closed||signal.aborted)throw Error('closed');
   // A fresh native resource per delivery; caller-owned buffers were copied before any await.
   return new NativeResponse(new NativeStream<Uint8Array>({start(c){c.enqueue(r.bytes);c.close();}}),{status:200});
  },
  dispose(){if(closed)return;closed=true;for(const r of records)r.bytes.fill(0);records.length=0;},
 });
}
