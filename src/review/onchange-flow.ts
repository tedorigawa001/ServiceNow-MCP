/** Bounded syntactic loading-path subset, not execution or business-intent proof. */
import type { AstNode } from './scope-analysis.js';
const node = (v: unknown): v is AstNode => !!v && typeof v === 'object' && 'type' in v;
const funcs = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const opaque = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement',
  'SwitchStatement', 'TryStatement', 'WithStatement', 'ClassDeclaration', 'ClassExpression', 'AwaitExpression',
  'YieldExpression', 'ChainExpression', 'TaggedTemplateExpression']);
const children = (n: AstNode) => Object.values(n).flatMap(v => node(v) ? [v] : Array.isArray(v) ? v.filter(node) : []);
export function analyzeOnChangeFlow(body: AstNode, calls: ReadonlyMap<AstNode, string>, loading: WeakSet<AstNode>,
  spend: (depth: number) => void, report: (site: AstNode, kind: string, state: 'guarded' | 'possible' | 'unresolved') => void,
  unresolved: () => void) {
  const owned = new WeakSet<AstNode>();
  // 1=false / 2=true; unknown can be either. Evaluate only boolean guard syntax.
  function truth(n: AstNode, load: boolean, depth: number): number {
    spend(depth);
    if (loading.has(n)) return load ? 2 : 1;
    if (n.type === 'Literal' && typeof n.value === 'boolean') return n.value ? 2 : 1;
    if (n.type === 'UnaryExpression' && n.operator === '!' && node(n.argument)) {
      const v = truth(n.argument, load, depth + 1); return (v & 1 ? 2 : 0) | (v & 2 ? 1 : 0);
    }
    if (n.type === 'LogicalExpression' && ['&&', '||'].includes(String(n.operator))) {
      const a = truth(n.left as AstNode, load, depth + 1), b = truth(n.right as AstNode, load, depth + 1);
      return n.operator === '&&' ? (a & 1 ? 1 : 0) | (a & 2 ? b : 0) : (a & 2 ? 2 : 0) | (a & 1 ? b : 0);
    }
    if (n.type === 'BinaryExpression' && ['===', '!=='].includes(String(n.operator))) {
      const a = truth(n.left as AstNode, load, depth + 1), b = truth(n.right as AstNode, load, depth + 1);
      if (a === 3 || b === 3) return 3;
      return (n.operator === '===' ? a === b : a !== b) ? 2 : 1;
    }
    return 3;
  }
  // mask: loading=1, normal=2. A path is removed only by this supported subset.
  function branch(n: AstNode, mask: number, yes: boolean, depth: number) {
    let out = 0;
    for (const mode of [1, 2]) if (mask & mode && truth(n, mode === 1, depth) & (yes ? 2 : 1)) out |= mode;
    return out;
  }
  function mark(n: AstNode, depth: number) {
    spend(depth);
    if (funcs.has(n.type)) return;
    if (calls.has(n)) owned.add(n);
    for (const c of children(n)) mark(c, depth + 1);
  }
  function reportOpaque(n: AstNode, mask: number, depth: number) {
    spend(depth);
    if (funcs.has(n.type)) return;
    const kind = calls.get(n);
    if (kind && mask) report(n, kind, mask & 1 ? 'unresolved' : 'guarded');
    for (const c of children(n)) reportOpaque(c, mask, depth + 1);
  }
  function walk(n: AstNode, mask: number, depth: number): number {
    spend(depth);
    if (!mask || funcs.has(n.type)) return mask;
    if (opaque.has(n.type)) { reportOpaque(n, mask, depth + 1); return mask; }
    if (n.type === 'BlockStatement') {
      for (const statement of n.body as AstNode[]) mask = walk(statement, mask, depth + 1);
      return mask;
    }
    if (n.type === 'IfStatement' || n.type === 'ConditionalExpression') {
      walk(n.test as AstNode, mask, depth + 1);
      const a = branch(n.test as AstNode, mask, true, depth + 1), b = branch(n.test as AstNode, mask, false, depth + 1);
      return (node(n.consequent) ? walk(n.consequent, a, depth + 1) : a)
        | (node(n.alternate) ? walk(n.alternate, b, depth + 1) : b);
    }
    if (n.type === 'LogicalExpression' && ['&&', '||'].includes(String(n.operator))) {
      walk(n.left as AstNode, mask, depth + 1);
      walk(n.right as AstNode, branch(n.left as AstNode, mask, n.operator === '&&', depth + 1), depth + 1);
      return mask;
    }
    for (const c of children(n)) walk(c, mask, depth + 1);
    const kind = calls.get(n);
    if (kind) report(n, kind, mask & 1 ? 'possible' : 'guarded');
    return n.type === 'ReturnStatement' || n.type === 'ThrowStatement' ? 0 : mask;
  }
  mark(body, 0); walk(body, 3, 0);
  for (const site of calls.keys()) { spend(0); if (!owned.has(site)) unresolved(); }
}
