/** Internal bounded, intra-body order analysis. Never executes scripts or proves business intent. */
import type { AstNode } from './scope-analysis.js';
const isAstNode = (v: unknown): v is AstNode => !!v && typeof v === 'object' && 'type' in v;
export type AbortCall = { receiver: 'current' | 'other' | 'unknown'; enabled: boolean | null };
export function analyzeAbortFlow(ast: AstNode, calls: WeakMap<AstNode, AbortCall>, spend: (depth: number) => void,
  report: (abort: AstNode, effect: string) => void, unresolved: () => void) {
  const hasAbort = new WeakSet<AstNode>(), bodies: AstNode[] = [];
  const functions = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
  const unsupported = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement',
    'SwitchStatement', 'TryStatement', 'WithStatement', 'ClassDeclaration', 'ClassExpression', 'AwaitExpression',
    'YieldExpression', 'ChainExpression', 'TaggedTemplateExpression']);
  function children(n: AstNode): AstNode[] {
    return Object.values(n).flatMap(v => isAstNode(v) ? [v] : Array.isArray(v) ? v.filter(isAstNode) : []);
  }
  function mark(n: AstNode, depth: number): boolean {
    spend(depth);
    let found = calls.has(n);
    for (const child of children(n)) found = mark(child, depth + 1) || found;
    if (functions.has(n.type)) {
      if (isAstNode(n.body)) bodies.push(n.body);
      return false; // A function body does not run as part of its defining expression.
    }
    if (found) hasAbort.add(n);
    return found;
  }
  function copy(state: Set<AstNode>, depth: number) {
    const out = new Set<AstNode>();
    for (const entry of state) { spend(depth); out.add(entry); }
    return out;
  }
  function walk(n: AstNode, pending: Set<AstNode>, depth: number): Set<AstNode> | null {
    spend(depth);
    if (functions.has(n.type)) return pending;
    if (unsupported.has(n.type)) {
      if (pending.size || hasAbort.has(n)) unresolved();
      return new Set(); // Do not infer order or termination across unsupported control flow.
    }
    if (n.type === 'IfStatement' || n.type === 'ConditionalExpression') {
      const tested = walk(n.test as AstNode, pending, depth + 1)!;
      if (isAstNode(n.test) && n.test.type === 'Literal' && typeof n.test.value === 'boolean') {
        const selected = n.test.value ? n.consequent : n.alternate;
        return isAstNode(selected) ? walk(selected, tested, depth + 1) : tested;
      }
      const a = isAstNode(n.consequent) ? walk(n.consequent, copy(tested, depth), depth + 1) : copy(tested, depth);
      const b = isAstNode(n.alternate) ? walk(n.alternate, copy(tested, depth), depth + 1) : copy(tested, depth);
      if (a === null) return b;
      if (b !== null) for (const entry of b) { spend(depth); a.add(entry); }
      return a;
    }
    if (n.type === 'LogicalExpression') {
      const left = walk(n.left as AstNode, pending, depth + 1)!;
      if (isAstNode(n.left) && n.left.type === 'Literal' && typeof n.left.value === 'boolean' && n.operator !== '??') {
        return (n.operator === '&&' ? n.left.value : !n.left.value) ? walk(n.right as AstNode, left, depth + 1) : left;
      }
      const right = walk(n.right as AstNode, copy(left, depth), depth + 1)!;
      for (const entry of right) { spend(depth); left.add(entry); }
      return left;
    }
    for (const value of Object.values(n)) {
      if (isAstNode(value)) { const next = walk(value, pending, depth + 1); if (next === null) return null; pending = next; }
      else if (Array.isArray(value)) for (const child of value) if (isAstNode(child)) {
        const next = walk(child, pending, depth + 1); if (next === null) return null; pending = next;
      }
    }
    if (n.type === 'ReturnStatement' || n.type === 'ThrowStatement') return null;
    const call = calls.get(n);
    if (call && call.receiver !== 'other') {
      if (call.receiver === 'unknown' || call.enabled === null) { unresolved(); return new Set(); }
      if (call.enabled) pending.add(n);
      else { if (pending.size) unresolved(); return new Set(); } // Reversal semantics are not certified.
    } else if (n.type === 'CallExpression' || n.type === 'NewExpression')
      for (const abort of pending) { spend(depth); report(abort, 'abort_following_call_effect_unverified'); }
    if ((n.type === 'AssignmentExpression' && isAstNode(n.left) && n.left.type === 'MemberExpression')
      || ((n.type === 'UpdateExpression' || n.type === 'UnaryExpression' && n.operator === 'delete')
        && isAstNode(n.argument) && n.argument.type === 'MemberExpression'))
      for (const abort of pending) { spend(depth); report(abort, 'abort_following_property_write'); }
    return pending;
  }
  mark(ast, 0);
  walk(ast, new Set(), 0);
  for (const body of bodies) walk(body, new Set(), 0);
}
