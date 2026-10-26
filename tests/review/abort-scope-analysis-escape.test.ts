import { expect, it } from 'vitest';
import { parse } from 'acorn';
import { analyzeScopedCandidates, type AstNode } from '../../src/review/scope-analysis.js';
// Indirect use of current.setAbortAction must never read as "no abort call" for AU-BR-005 or BR-006.
const wrap=(body:string)=>`(function executeRule(current, previous){ ${body} })(current, previous);`;
function analyze(option:'abort'|'abortScope',body:string){
  const ast=parse(wrap(body),{ecmaVersion:'latest',sourceType:'script',locations:true}) as unknown as AstNode;
  let unresolved=0;const found:unknown[]=[];
  const handler={unresolved(){unresolved++;},call(_e:AstNode,c:unknown){found.push(c);},effect(_e:AstNode,c:unknown){found.push(c);}};
  analyzeScopedCandidates(ast,'before',()=>{},{allowDeclaredEntry:true,constants:true,[option]:handler});
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
it.each(Object.entries(indirect))('marks indirect setAbortAction use unresolved for AU-BR-005 and BR-006: %s',(_name,body)=>{
  expect(analyze('abort',body).unresolved).toBeGreaterThan(0);
  const scope=analyze('abortScope',body);expect(scope.unresolved).toBeGreaterThan(0);
  expect(scope.found).not.toContainEqual(expect.objectContaining({receiver:'current'}));
});
it('keeps a direct call resolved for BR-006, and an optional call argument-unresolved',()=>{
  expect(analyze('abortScope','current.setAbortAction(true);')).toEqual({unresolved:0,found:[{receiver:'current',enabled:true}]});
  expect(analyze('abortScope','current?.setAbortAction(true);')).toEqual({unresolved:0,found:[{receiver:'current',enabled:null}]});
});
it('treats current handed to outside code as unresolved for BR-006 only',()=>{
  expect(analyze('abortScope','helper(current);').unresolved).toBeGreaterThan(0);
  expect(analyze('abortScope','new Util().run({record:current});').unresolved).toBeGreaterThan(0);
  expect(analyze('abort','helper(current);').unresolved).toBe(0);
});
it('does not flag ordinary field reads or the executeRule wrapper',()=>{
  expect(analyze('abortScope','gs.info(current.number); current.setValue("x", current.getValue("y"));')).toEqual({unresolved:0,found:[]});
  expect(analyze('abort','gs.info(current.number);')).toEqual({unresolved:0,found:[]});
});
