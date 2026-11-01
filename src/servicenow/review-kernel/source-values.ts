/** Pure source value checks. No session, registration, source consumer or capability issuance. */
import {z} from 'zod';

const parentSchema=z.strictObject({
  sys_id:z.string().regex(/^[a-f0-9]{32}$/),state:z.string().max(100),application:z.string().max(32),
  sys_updated_on:z.string().min(1).max(40),sys_mod_count:z.string().regex(/^\d{1,20}$/),
});
export class SourceValueError extends Error {
  readonly code='invalid_response' as const;
  constructor(){super('invalid_response');}
}
/** Same strict parent shape and target check as the existing bounded source. */
export function parseSourceParent(value:unknown,target:string){
  const parsed=parentSchema.safeParse(value&&typeof value==='object'&&'result' in value?value.result:null);
  if(!parsed.success||parsed.data.sys_id!==target)throw new SourceValueError();
  return parsed.data;
}
/** Deliberately drops unrelated node columns; the caller owns the envelope/count bound. */
export function projectSourceReleaseRows(rows:unknown[]){
  return rows.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row))throw new SourceValueError();
    const value='build_name' in row?row.build_name:null;
    if(value!==null&&(typeof value!=='string'||value.length>40))throw new SourceValueError();
    return {build_name:value};
  });
}
