import { expect, it } from 'vitest';
import { parse } from 'acorn';
import { analyzeScopedCandidates, type AstNode } from '../../src/review/scope-analysis.js';
// Indirect use of current.setAbortAction must never read as "no abort call" for AU-BR-005.
const wrap=(body:string)=>`(function executeRule(current, previous){ ${body} })(current, previous);`;
function analyze(body:string){
  const ast=parse(wrap(body),{ecmaVersion:'latest',sourceType:'script',locations:true}) as unknown as AstNode;
  let unresolved=0;const found:unknown[]=[];
  const handler={unresolved(){unresolved++;},effect(_e:AstNode,c:unknown){found.push(c);}};
  analyzeScopedCandidates(ast,'before',()=>{},{allowDeclaredEntry:true,constants:true,abort:handler});
  return {unresolved,found};
}
const indirect={
  extracted:'var f=current.setAbortAction; f(true);',
  call:'current.setAbortAction.call(current,true);',
  apply:'current.setAbortAction.apply(current,[true]);',
  bind:'current.setAbortAction.bind(current)(true);',
  comma:'(0,current.setAbortAction)(true);',
  destructure:'var {setAbortAction}=current; setAbortAction(true);',
  rest:'var {...rest}=current; rest.setAbortAction(true);',
};
it.each(Object.entries(indirect))('marks indirect setAbortAction use unresolved for AU-BR-005: %s',(_name,body)=>{
  expect(analyze(body).unresolved).toBeGreaterThan(0);
});
it('leaves current handed to outside code unchanged for AU-BR-005',()=>{
  expect(analyze('helper(current);').unresolved).toBe(0);
});
it('does not flag ordinary field reads or the executeRule wrapper',()=>{
  expect(analyze('gs.info(current.number);')).toEqual({unresolved:0,found:[]});
});
