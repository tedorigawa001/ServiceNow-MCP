import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createProbeBodyPinFinalPostFake, createProbeBodyPinReturnedPreparationFake } from './fixtures/snapshot-read-composition-fake.js';

describe('R-b closed rejection contracts with start consumption disconnected', () => {
  it('keeps the existing C-c terminal and same-cache replay without new public methods', () => {
    const a = createProbeBodyPinFinalPostFake(), r = a.prepare();
    expect(Object.keys(a)).toEqual(['prepare', 'check', 'checkLegacy', 'close', 'inspect']);
    expect(r.disposition).toBe('pin_return_not_connected');
    expect(a.inspect()).toMatchObject({ contract: { pc08: 'not_connected', bodyStarts: 0, attempts: 1 },
      pipeline: { fixedCalls: 1, build: { source: { claim: 'unused' }, receiver: { first: 'none' } } } });
    expect(a.prepare()).toBe(r); expect(a.close()).toBe(r);
  });
  it('does not turn the old R-a shell into a claim or failure-handoff entry', () => {
    const a = createProbeBodyPinReturnedPreparationFake();
    expect(a.prepare()).toBe('returned_not_connected');
    expect(a.inspect()).toMatchObject({ phase: 'not_started', point: 'none', postChecked: false, sourceGenerations: 0,
      gr: 'not_connected', ga: 'not_connected', acceptance: 'not_connected', sealed: false, attempts: 0, cacheRetained: false });
  });
  it.each(['cc_close_final_post_before', 'cc_fault_final_post_before', 'cc_prior_final_post_before'])(
    'preserves earlier diagnostic custody for %s', script => {
      const a = createProbeBodyPinFinalPostFake(script), r = a.prepare(), first = a.inspect().contract.first;
      a.close(); expect(a.prepare()).toBe(r); expect(a.inspect().contract.first).toBe(first);
      expect(a.inspect().contract).toMatchObject({ pc08: 'not_connected', bodyStarts: 0 });
    });
  it('precedes construction with two literal diagnostic slots and has no start/handoff writer', () => {
    const text = readFileSync(new URL('./fixtures/snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
    const ast = ts.createSourceFile('fixture.ts', text, ts.ScriptTarget.ES2022, true);
    const root = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'CanonicalGateDraftRoot') as ts.ClassDeclaration;
    const constructor = root.members.find(ts.isConstructorDeclaration)!;
    for (const [field, initial] of [['bodyPinReturnedRejectClass', "'none'"], ['bodyPinReturnedSourceRecord', "'not_attempted'"]]) {
      const n = root.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#' + field) as ts.PropertyDeclaration;
      expect(n.initializer?.getText(ast)).toBe(initial); expect(n.end).toBeLessThan(constructor.getStart(ast));
    }
    let startWrites = 0, callers = 0;
    function walk(n: ts.Node) {
      if (ts.isCallExpression(n) && n.expression.getText(ast) === 'this.returnedClosedRefusal') callers++;
      if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        && /^this\.#bodyPinReturned(?:Phase|PostChecked|Point|FailurePoint)$/.test(n.left.getText(ast))) startWrites++;
      ts.forEachChild(n, walk);
    }
    walk(ast); expect(startWrites).toBe(0); expect(callers).toBe(0);
    const origin = root.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === 'bodyPinReturnedOriginMatches') as ts.MethodDeclaration;
    const calls: string[] = [];
    function collect(n: ts.Node) { if (ts.isCallExpression(n)) calls.push(n.expression.getText(ast)); ts.forEachChild(n, collect); }
    collect(origin); expect(calls).toEqual([]);
  });
});
