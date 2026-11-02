/** CG-A value-only model. Never a delivery/capture issuer or production admission. */
import {z} from 'zod';
import {Buffer} from 'node:buffer';
import {aggregateReviewJsonSchema,aggregateReviewV3JsonSchema,assetOutcomeStructure,anyAggregateReviewSchema} from '../../../src/review/aggregate-schema.js';
import {reviewResultV2Schema} from '../../../src/review/result-schema-v2.js';

export class RecoveryFullJsonError extends Error{
  readonly code='internal_review_error';
  constructor(readonly reason:'shape'|'limit'|'syntax'|'schema'|'model'){super('internal_review_error');}
}
function bad(reason:RecoveryFullJsonError['reason']):never{throw new RecoveryFullJsonError(reason);}
const MODEL='recovery-full-json-shape-v1';
const BYTES=262144;
type Shape=Readonly<{depth:number;array:number;object_keys:number}>;
function derive(schema:unknown):Shape{
  let visits=0,depth=0,array=0,object_keys=0;
  function walk(raw:unknown,d:number){
    if(++visits>100000||d>32)bad('model');
    if(!raw||typeof raw!=='object'||Array.isArray(raw))bad('model');
    const s=raw as Record<string,unknown>;if('$ref' in s||'$defs' in s||'allOf' in s)bad('model');
    const branches=s.oneOf??s.anyOf;
    if(branches!==undefined){if(!Array.isArray(branches)||!branches.length)bad('model');for(const b of branches)walk(b,d);return;}
    depth=Math.max(depth,d);
    if(s.type==='object'){
      if(s.additionalProperties!==false||!s.properties||typeof s.properties!=='object')bad('model');
      const props=Object.values(s.properties);object_keys=Math.max(object_keys,props.length);for(const p of props)walk(p,d+1);
    }else if(s.type==='array'){
      if(!Number.isSafeInteger(s.maxItems)||(s.maxItems as number)<0)bad('model');array=Math.max(array,s.maxItems as number);
      if(s.maxItems!==0)walk(s.items,d+1);
    }else if(!['string','number','integer','boolean','null'].includes(s.type as string))bad('model');
  }
  walk(schema,0);if(array>100||object_keys>30)bad('model');return Object.freeze({depth,array,object_keys});
}
export const RECOVERY_FULL_JSON_SHAPE=Object.freeze({model_id:MODEL,wire_bytes:BYTES,
  analyze:derive(z.toJSONSchema(assetOutcomeStructure,{target:'draft-7'})),aggregate_02:derive(aggregateReviewJsonSchema),aggregate_03:derive(aggregateReviewV3JsonSchema)});
const aggregateShape=Object.freeze({depth:Math.max(RECOVERY_FULL_JSON_SHAPE.aggregate_02.depth,RECOVERY_FULL_JSON_SHAPE.aggregate_03.depth),
  array:Math.max(RECOVERY_FULL_JSON_SHAPE.aggregate_02.array,RECOVERY_FULL_JSON_SHAPE.aggregate_03.array),object_keys:Math.max(RECOVERY_FULL_JSON_SHAPE.aggregate_02.object_keys,RECOVERY_FULL_JSON_SHAPE.aggregate_03.object_keys)});
export function recoveryFullJsonBounds(bytes:unknown,model:unknown=MODEL){
  if(model!==MODEL)bad('model');
  if(typeof bytes!=='number'||!Number.isSafeInteger(bytes)||bytes<0)bad('shape');
  if(bytes>BYTES)bad('limit');
  return Object.freeze({model_id:MODEL,max_nodes:bytes,max_character_units:3*bytes,max_lexical_work:16*bytes+128});
}
export function measureRecoveryFullJson(raw:unknown){
  if(typeof raw!=='string')bad('shape');if(raw.length>BYTES)bad('limit');
  const size=Buffer.byteLength(raw,'utf8');if(size>BYTES)bad('limit');
  return Object.freeze({utf16_units:raw.length,utf8_bytes:size});
}
function decode(raw:unknown,shape:Shape){
  const measured=measureRecoveryFullJson(raw),bounds=recoveryFullJsonBounds(measured.utf8_bytes);
  // The buffer never escapes; both decoding and subsequent schema checks use this source.
  const bytes=Buffer.from(raw as string,'utf8'),text=bytes.toString('utf8');if(text!==raw)bad('syntax');
  let p=0,nodes=0,characters=0,work=0,depth=0,array=0,keys=0;
  function charge(n=1){if(work+n>bounds.max_lexical_work)bad('limit');work+=n;}
  function advance(n=1){charge(n);p+=n;}
  function space(){while(p<text.length&&[' ','\t','\r','\n'].includes(text[p]))advance();}
  function expect(c:string){if(text[p]!==c)bad('syntax');advance();}
  function string():string{
    expect('"');const parts:string[]=[];let length=0,start=p;
    function append(end:number,escaped?:string){
      const size=escaped===undefined?end-start:escaped.length;
      if(characters+size*3>bounds.max_character_units)bad('limit');characters+=size*3;length+=size;charge(size);
      if(size)parts.push(escaped===undefined?text.slice(start,end):escaped);
    }
    while(p<text.length){
      const c=text[p];
      if(c==='"'){append(p);advance();charge(length);return parts.join('');}
      if(c==='\\'){
        append(p);advance();const escape=text[p];if(escape===undefined)bad('syntax');advance();
        if(escape==='u'){
          const h=text.slice(p,p+4);if(h.length!==4||!/^[a-fA-F0-9]{4}$/.test(h))bad('syntax');advance(4);append(p,String.fromCharCode(Number.parseInt(h,16)));
        }else{
          const escapes:Record<string,string>={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};
          if(!Object.hasOwn(escapes,escape))bad('syntax');append(p,escapes[escape]);
        }
        start=p;
      }else{if(text.charCodeAt(p)<32)bad('syntax');advance();}
    }
    return bad('syntax');
  }
  const digit=()=>p<text.length&&text.charCodeAt(p)>=48&&text.charCodeAt(p)<=57;
  function number():number{
    const start=p;if(text[p]==='-')advance();
    if(text[p]==='0')advance();else{if(!digit()||text[p]==='0')bad('syntax');while(digit())advance();}
    if(text[p]==='.') {advance();if(!digit())bad('syntax');while(digit())advance();}
    if(text[p]==='e'||text[p]==='E'){advance();if(text[p]==='+'||text[p]==='-')advance();if(!digit())bad('syntax');while(digit())advance();}
    const token=text.slice(start,p),value=Number(token);charge(token.length*3);
    if(!Number.isSafeInteger(value))bad('shape');
    // Require the literal's exact mathematical value to be this safe integer, not a rounded decimal/underflow.
    const unsigned=token[0]==='-'?token.slice(1):token,[mantissa,exponent='0']=unsigned.toLowerCase().split('e'),[whole,fraction='']=mantissa.split('.');
    const digits=(whole+fraction).replace(/^0+/, '');if(!digits)return value;
    if(exponent.replace(/^[+-]/,'').replace(/^0+/,'').length>6)bad('shape');
    const scale=Number(exponent)-fraction.length;let exact:string;
    if(scale>=0){if(digits.length+scale>16)bad('shape');exact=digits+'0'.repeat(scale);}
    else{const cut=digits.length+scale;if(cut<=0||/[^0]/.test(digits.slice(cut)))bad('shape');exact=digits.slice(0,cut);}
    if(exact!==String(Math.abs(value)))bad('shape');return value;
  }
  function value(d:number):unknown{
    space();if(p===text.length)bad('syntax');if(d>shape.depth||nodes+1>bounds.max_nodes)bad('limit');nodes++;charge();depth=Math.max(depth,d);
    const c=text[p];if(c==='"')return string();
    if(c==='{'){
      advance();space();const out:Record<string,unknown>=Object.create(null);let n=0;
      if(text[p]==='}'){advance();return out;}
      while(true){
        if(n>=shape.object_keys)bad('limit');space();const key=string();if(Object.hasOwn(out,key))bad('syntax');space();expect(':');out[key]=value(d+1);n++;keys=Math.max(keys,n);space();
        if(text[p]==='}'){advance();return out;}expect(',');
      }
    }
    if(c==='['){
      advance();space();const out:unknown[]=[];if(text[p]===']'){advance();return out;}
      while(true){if(out.length>=shape.array)bad('limit');out.push(value(d+1));array=Math.max(array,out.length);space();if(text[p]===']'){advance();return out;}expect(',');}
    }
    for(const [literal,result] of [['true',true],['false',false],['null',null]] as const){if(text.startsWith(literal,p)){advance(literal.length);return result;}}
    if(c==='-'||digit())return number();return bad('syntax');
  }
  const decoded=value(0);space();if(p!==text.length)bad('syntax');
  return {decoded,usage:Object.freeze({...measured,nodes,character_units:characters,lexical_work:work,maximum_depth:depth,max_array_length:array,max_object_keys:keys})};
}
type Deep<T>=T extends readonly(infer E)[]?readonly Deep<E>[]:T extends object?{readonly[K in keyof T]:Deep<T[K]>}:T;
const valueBrand=Symbol('synthetic_recovery_full_json_values');
const unverified=Object.freeze(['delivery_origin','original_body','context_binding','runtime_transport'] as const);
function freeze(v:unknown):unknown{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
function validated<T>(raw:unknown,shape:Shape,parse:(v:unknown)=>T,kind:'analysis_asset'|'aggregate'){
  try{
    const source=decode(raw,shape);let data:T;try{data=parse(source.decoded);}catch{return bad('schema');}
    return Object.freeze({scope:'synthetic_recovery_full_json_values' as const,authority:'none' as const,checked_scope:'full_schema_value_only' as const,kind,model_id:MODEL,unverified,
      value:freeze(data) as Deep<T>,usage:source.usage,[valueBrand]:'full_json_value_only' as const});
  }catch(error){if(error instanceof RecoveryFullJsonError)throw error;return bad('shape');}
}
export function validateRecoveryAnalysisJson(raw:unknown){return validated(raw,RECOVERY_FULL_JSON_SHAPE.analyze,v=>{
  const asset=assetOutcomeStructure.parse(v);if(asset.state==='reviewed')asset.result=reviewResultV2Schema.parse(asset.result);return asset;
},'analysis_asset');}
export function validateRecoveryAggregateJson(raw:unknown){return validated(raw,aggregateShape,v=>anyAggregateReviewSchema.parse(v),'aggregate');}
