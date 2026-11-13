import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createProbeBodyPinFinalPostFake, createProbeBodyPinReturnedPreparationFake } from './fixtures/snapshot-read-composition-fake.js';

describe('R-b private read preparation without returned admission', () => {
  it('retains the original C-c stop, same-cache replay and receiver custody', () => {
    const a = createProbeBodyPinFinalPostFake(), r = a.prepare();
    expect(r.disposition).toBe('pin_return_not_connected');
    expect(a.inspect()).toMatchObject({ contract: { pc08: 'not_connected', finalPost: true, bodyStarts: 0 },
      pipeline: { fixedCalls: 1, route: { phase: 'BP03', step: 'call', boundary: 'after', preparingConfirmed: false, postChecked: false },
        build: { source: { claim: 'unused' }, receiver: { first: 'none', pinStage: 'confirmed' } } } });
    for (const op of ['check', 'checkLegacy', 'prepare', 'close'] as const) expect(a[op]()).toBe(r);
  });
  it.each(['pc_fault_checked', 'pb_fault_checked', 'ec_fault_before_call', 'cc_fault_final_post_before', 'cc_prior_final_post_before'])(
    'retains the predecessor diagnosis and one-shot cache for %s', script => {
      const a = createProbeBodyPinFinalPostFake(script), r = a.prepare(), s = a.inspect();
      expect(s.contract.pc08).toBe('not_connected'); expect(s.contract.bodyStarts).toBe(0);
      expect(s.pipeline.route.preparingConfirmed).toBe(false); expect(s.pipeline.route.postChecked).toBe(false);
      expect(s.pipeline.build.source.claim).toBe('unused');
      expect(a.prepare()).toBe(r); expect(a.close()).toBe(r);
      expect(a.inspect().contract.first).toBe(s.contract.first);
    });
  it('does not add a registration/supply method or change R-a refusal into an executable continuation', () => {
    const a = createProbeBodyPinReturnedPreparationFake();
    expect(Object.keys(a)).toEqual(['prepare', 'check', 'close', 'inspect']);
    expect(a.prepare()).toBe('returned_not_connected');
    expect(a.inspect()).toMatchObject({ phase: 'not_started', postChecked: false, sourceGenerations: 0,
      gr: 'not_connected', ga: 'not_connected', acceptance: 'not_connected', sealed: false, cacheRetained: false });
  });
  it('has no operational input call or returned scalar writer', () => {
    const source = readFileSync(new URL('./fixtures/snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
    const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.ES2022, true);
    let calls = 0, writes = 0;
    function visit(n: ts.Node) {
      if (ts.isCallExpression(n) && n.expression.getText(ast).endsWith('.bodyPinReturnedInput')) calls++;
      if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        && /^this\.#bodyPinReturned(?:Phase|PostChecked|Point|FailurePoint)$/.test(n.left.getText(ast))) writes++;
      ts.forEachChild(n, visit);
    }
    visit(ast); expect(calls).toBe(0); expect(writes).toBe(0);
    const root = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'CanonicalGateDraftRoot') as ts.ClassDeclaration;
    const stable = root.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === 'bodyPinStableStorageMatches') as ts.MethodDeclaration;
    const callNames: string[] = [];
    function collect(n: ts.Node) { if (ts.isCallExpression(n)) callNames.push(n.expression.getText(ast)); ts.forEachChild(n, collect); }
    collect(stable);
    expect(callNames).toEqual(['this.bodySeedBaseMatches', 'this.bodySourceStorageMatches', 'probeStartAccess.bodyPinPayloadEmpty']);
  });
});
