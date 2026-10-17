/** Bounded syntactic analysis, NOT an interpreter, call graph or general JavaScript dataflow engine. */
import type { FollowUpContext } from './follow-up-catalog.js';
export type AstNode = { type: string; start: number; end: number; loc: { start: { line: number }; end: { line: number } }; [key: string]: unknown };
export const isAstNode = (v: unknown): v is AstNode => !!v && typeof v === 'object' && 'type' in v;
export function staticMemberName(value: unknown): string | null {
  if (!isAstNode(value) || value.type !== 'MemberExpression' || !isAstNode(value.property)) return null;
  const p = value.property;
  return !value.computed && p.type === 'Identifier' ? String(p.name)
    : value.computed && p.type === 'Literal' && (typeof p.value === 'string' || typeof p.value === 'number') ? String(p.value) : null;
}
export class AnalysisLimitError extends Error {}
const C = 1, P = 2, CF = 4, PF = 8, AJAX = 16, LOCAL = 32, UNKNOWN = 64, AJAX_CTOR = 128;
type Origin = { flags: number; properties?: Map<string, Origin> };
type Binding = { origin: Origin; functionId: number; entryFlags?: number };
type Scope = { parent?: Scope; functionId: number; functionScope: boolean; bindings: Map<string, Binding> };
const origin = (flags: number): Origin => ({ flags });
const local = () => origin(LOCAL);
const unknown = () => origin(UNKNOWN);
const children = (entry: AstNode): AstNode[] => Object.values(entry).flatMap(value => isAstNode(value) ? [value]
  : Array.isArray(value) ? value.filter(isAstNode) : []);
const identifier = (value: unknown, name?: string): value is AstNode => isAstNode(value) && value.type === 'Identifier' && (!name || value.name === name);
const functions = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const blocks = new Set(['BlockStatement', 'CatchClause', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'SwitchStatement']);
const recordMethods = new Set(['update', 'getValue', 'getDisplayValue', 'setValue', 'setWorkflow', 'getUniqueValue', 'isValidRecord']);

export function analyzeScopedCandidates(ast: AstNode, when: string | null, emit: (entry: AstNode, rule: string, context?: FollowUpContext) => void,
  options = { allowDeclaredEntry: false }): void {
  const root: Scope = { functionId: 0, functionScope: true, bindings: new Map() };
  const scopes = new WeakMap<AstNode, Scope>();
  const functionScopes = new WeakMap<AstNode, Scope>();
  let functionId = 0, visits = 0;
  const reboundNames = new Set<string>();
  const workflowSuppression = new Map<number, number>();
  function budget(depth: number) {
    if (++visits > 100000 || depth > 256) throw new AnalysisLimitError('analysis_limit');
  }
  function join(a: Origin, b: Origin, depth = 0, pairs = new WeakMap<Origin, WeakMap<Origin, Origin>>()): Origin {
    budget(depth);
    if (a === b) return a;
    const cached = pairs.get(a)?.get(b);
    if (cached) return cached;
    const result: Origin = { flags: a.flags | b.flags };
    let inner = pairs.get(a);
    if (!inner) { inner = new WeakMap(); pairs.set(a, inner); }
    inner.set(b, result); // Memoize before traversing possibly cyclic local containers.
    if (a.properties || b.properties) {
      result.properties = new Map();
      const keys = new Set([...(a.properties?.keys() ?? []), ...(b.properties?.keys() ?? [])]);
      for (const key of keys) result.properties.set(key, join(a.properties?.get(key) ?? unknown(), b.properties?.get(key) ?? unknown(), depth + 1, pairs));
    }
    return result;
  }
  function declare(pattern: unknown, scope: Scope, depth = 0): void {
    if (!isAstNode(pattern)) return;
    budget(depth);
    if (pattern.type === 'Identifier') { if (!scope.bindings.has(String(pattern.name))) scope.bindings.set(String(pattern.name), { origin: unknown(), functionId: scope.functionId }); }
    else if (pattern.type === 'AssignmentPattern') declare(pattern.left, scope, depth + 1);
    else if (pattern.type === 'RestElement') declare(pattern.argument, scope, depth + 1);
    else if (pattern.type === 'ObjectPattern') {
      for (const prop of (pattern.properties as AstNode[])) declare(prop.type === 'RestElement' ? prop.argument : prop.value, scope, depth + 1);
    } else if (pattern.type === 'ArrayPattern') for (const element of pattern.elements as unknown[]) declare(element, scope, depth + 1);
  }
  function nearestFunction(scope: Scope) { while (!scope.functionScope && scope.parent) scope = scope.parent; return scope; }
  function noteWrite(pattern: unknown, depth = 0): void {
    if (!isAstNode(pattern)) return;
    budget(depth);
    if (pattern.type === 'Identifier') reboundNames.add(String(pattern.name));
    else if (pattern.type === 'AssignmentPattern') noteWrite(pattern.left, depth + 1);
    else if (pattern.type === 'RestElement') noteWrite(pattern.argument, depth + 1);
    else if (pattern.type === 'ObjectPattern') for (const p of pattern.properties as AstNode[])
      noteWrite(p.type === 'RestElement' ? p.argument : p.value, depth + 1);
    else if (pattern.type === 'ArrayPattern') for (const p of pattern.elements as unknown[]) noteWrite(p, depth + 1);
  }
  function prepare(entry: AstNode, parent: Scope, depth = 0): void {
    budget(depth);
    let scope = parent;
    if (entry.type === 'FunctionDeclaration' || entry.type === 'ClassDeclaration') {
      declare(entry.id, parent);
      if (identifier(entry.id)) parent.bindings.get(String(entry.id.name))!.origin = entry.type === 'ClassDeclaration' && entry.superClass ? unknown() : local();
    }
    if (functions.has(entry.type)) {
      scope = { parent, functionId: ++functionId, functionScope: true, bindings: new Map() };
      functionScopes.set(entry, scope);
      declare(entry.id, scope);
      for (const parameter of entry.params as unknown[]) declare(parameter, scope);
    } else if (entry.type === 'StaticBlock') {
      scope = { parent, functionId: ++functionId, functionScope: true, bindings: new Map() };
    } else if (blocks.has(entry.type) || entry.type === 'ClassExpression' || entry.type === 'ClassDeclaration') {
      scope = { parent, functionId: parent.functionId, functionScope: false, bindings: new Map() };
      if (entry.type === 'CatchClause') declare(entry.param, scope);
      if (entry.type === 'ClassExpression' || entry.type === 'ClassDeclaration') declare(entry.id, scope);
    }
    scopes.set(entry, scope);
    if (entry.type === 'AssignmentExpression') noteWrite(entry.left);
    if (entry.type === 'UpdateExpression') noteWrite(entry.argument);
    if (entry.type === 'VariableDeclarator') noteWrite(entry.id);
    if (entry.type === 'ForInStatement' || entry.type === 'ForOfStatement') noteWrite(entry.left);
    if (entry.type === 'VariableDeclaration') for (const d of entry.declarations as AstNode[])
      declare(d.id, entry.kind === 'var' ? nearestFunction(scope) : scope);
    for (const child of children(entry)) prepare(child, entry.type === 'SwitchStatement' && child === entry.discriminant ? parent : scope, depth + 1);
  }
  prepare(ast, root);
  // Syntactic ServiceNow entry binding only: a sole top-level (function(current, previous){...})(current, previous).
  // No general argument/return propagation or IIFE analysis.
  const statements = ast.body as AstNode[];
  function bindEntry(fn: AstNode, args: AstNode[]): void {
    const params = fn.params as AstNode[];
    if (params.length !== 2 || args.length !== 2 || !identifier(params[0], 'current') || !identifier(params[1], 'previous')
      || !identifier(args[0], 'current') || !identifier(args[1], 'previous') || root.bindings.has('current') || root.bindings.has('previous')) return;
    const scope = functionScopes.get(fn)!;
    scope.bindings.get('current')!.origin = origin(C);
    scope.bindings.get('current')!.entryFlags = C;
    scope.bindings.get('previous')!.origin = origin(P);
    scope.bindings.get('previous')!.entryFlags = P;
  }
  if (statements.length === 1 && statements[0].type === 'ExpressionStatement') {
    const call = statements[0].expression;
    if (isAstNode(call) && call.type === 'CallExpression' && isAstNode(call.callee) && call.callee.type === 'FunctionExpression') {
      bindEntry(call.callee, call.arguments as AstNode[]);
    }
  }
  if (options.allowDeclaredEntry && !reboundNames.has('current') && !reboundNames.has('previous')) {
    // Old BR template only: top-level X(current, previous) + one top-level declaration X.
    // Conservatively reject any same-name write/declarator, even in a nested scope.
    const declarations = new Map<string, AstNode | null>();
    for (const statement of statements) if (statement.type === 'FunctionDeclaration' && identifier(statement.id)) {
      const name = String(statement.id.name);
      declarations.set(name, declarations.has(name) ? null : statement);
    }
    for (const statement of statements) {
      const call = statement.type === 'ExpressionStatement' ? statement.expression : null;
      if (!isAstNode(call) || call.type !== 'CallExpression' || call.optional || !identifier(call.callee)) continue;
      const name = String(call.callee.name), declaration = declarations.get(name);
      if (declaration && !declaration.async && !declaration.generator && !reboundNames.has(name))
        bindEntry(declaration, call.arguments as AstNode[]);
    }
  }
  function find(scope: Scope, name: string): Binding | undefined {
    for (let s: Scope | undefined = scope; s; s = s.parent) { const b = s.bindings.get(name); if (b) return b; }
    return undefined;
  }
  function read(scope: Scope, name: string): Origin {
    const binding = find(scope, name);
    if (!binding) return origin(name === 'current' ? C : name === 'previous' ? P : name === 'GlideAjax' ? AJAX_CTOR : UNKNOWN);
    if (binding.functionId !== scope.functionId) {
      // Direct lexical reference to the declared platform entry, not propagation of a user alias/call.
      if (binding.entryFlags) return origin(binding.entryFlags | UNKNOWN);
      // Lexical shadowing still applies across function boundaries, but aliases never cross them.
      return binding.origin.flags === LOCAL && !binding.origin.properties ? local() : unknown();
    }
    return binding.origin;
  }
  const receivers = new WeakMap<AstNode, Origin>();
  function assign(pattern: unknown, value: Origin, scope: Scope, conditional: boolean): void {
    if (!isAstNode(pattern)) return;
    if (pattern.type === 'Identifier') {
      let b = find(scope, String(pattern.name));
      if (!b) {
        // Keep writes within this function's abstract state; never propagate them into other bodies.
        const target = nearestFunction(scope);
        b = { origin: read(scope, String(pattern.name)), functionId: scope.functionId };
        target.bindings.set(String(pattern.name), b);
      }
      if (b && b.functionId === scope.functionId) b.origin = conditional ? join(b.origin, value) : value;
    } else if (pattern.type === 'MemberExpression') {
      const receiver = receivers.get(pattern);
      if (!receiver?.properties) return;
      const key = staticMemberName(pattern);
      if (key === null) {
        for (const [k, v] of receiver.properties) receiver.properties.set(k, join(v, unknown()));
      } else receiver.properties.set(key, conditional ? join(receiver.properties.get(key) ?? unknown(), value) : value);
    }
    // Destructuring bindings are declared, but their dataflow is deliberately not tracked.
  }
  function walk(entry: AstNode, depth = 0, conditional = false): Origin {
    budget(depth);
    const scope = scopes.get(entry)!;
    const visit = (v: unknown, cond = conditional) => isAstNode(v) ? walk(v, depth + 1, cond) : unknown();
    switch (entry.type) {
      case 'Identifier': return read(scope, String(entry.name));
      case 'Literal': return local();
      case 'VariableDeclarator': {
        const value = isAstNode(entry.init) ? visit(entry.init) : unknown();
        if (entry.init) assign(entry.id, value, scope, conditional);
        return value;
      }
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': {
        if (entry.type === 'FunctionDeclaration' && identifier(entry.id)) {
          const own = functionScopes.get(entry)!;
          const b = own.parent && find(own.parent, String(entry.id.name));
          if (b && b.functionId === own.parent!.functionId) b.origin = local();
        }
        // Analyze each body once, independently of whether it is invoked. No reachability claim.
        for (const p of entry.params as AstNode[]) visit(p);
        visit(entry.body, false);
        return local();
      }
      case 'ClassDeclaration': case 'ClassExpression': {
        if (identifier(entry.id)) { const b = find(scope, String(entry.id.name)); if (b) b.origin = entry.superClass ? unknown() : local(); }
        for (const child of children(entry)) walk(child, depth + 1, conditional);
        return local();
      }
      case 'ObjectExpression': {
        const properties = new Map<string, Origin>();
        for (const p of entry.properties as AstNode[]) {
          if (p.type === 'SpreadElement') { visit(p.argument); continue; }
          if (p.computed) visit(p.key);
          const key = !p.computed && identifier(p.key) ? String(p.key.name)
            : isAstNode(p.key) && p.key.type === 'Literal' && ['string', 'number'].includes(typeof p.key.value) ? String(p.key.value) : null;
          const value = visit(p.value);
          if (key !== null) properties.set(key, p.kind === 'init' ? value : unknown());
        }
        return { flags: LOCAL, properties };
      }
      case 'ArrayExpression': {
        const properties = new Map<string, Origin>();
        (entry.elements as unknown[]).forEach((e, i) => { if (isAstNode(e)) properties.set(String(i), visit(e)); });
        return { flags: LOCAL, properties };
      }
      case 'MemberExpression': {
        const receiver = visit(entry.object);
        if (entry.computed) visit(entry.property);
        receivers.set(entry, receiver);
        const key = staticMemberName(entry);
        if (when === 'async' && (receiver.flags & P)) emit(entry, 'AU-BR-002', { kind: 'async_dependency' });
        if (key === null) return unknown();
        if (receiver.properties?.has(key)) return receiver.properties.get(key)!;
        if (receiver.flags & C) return origin(recordMethods.has(key) ? LOCAL : CF);
        if (receiver.flags & P) return origin(recordMethods.has(key) ? LOCAL : PF);
        if (receiver.flags & (CF | PF)) return local();
        return origin(receiver.flags & UNKNOWN ? UNKNOWN : LOCAL);
      }
      case 'CallExpression': case 'NewExpression': {
        const calleeValue = visit(entry.callee);
        for (const argument of entry.arguments as unknown[]) visit(argument);
        if (entry.type === 'NewExpression') return origin(calleeValue.flags & AJAX_CTOR ? AJAX : calleeValue.flags & UNKNOWN ? UNKNOWN : LOCAL);
        if (isAstNode(entry.callee) && entry.callee.type === 'MemberExpression') {
          const receiver = receivers.get(entry.callee) ?? unknown(), key = staticMemberName(entry.callee);
          if (key === 'setWorkflow' && (receiver.flags & C) && (entry.arguments as unknown[]).length === 1) {
            const argument = (entry.arguments as unknown[])[0];
            if (isAstNode(argument) && argument.type === 'Literal' && argument.value === false)
              workflowSuppression.set(scope.functionId, Math.min(workflowSuppression.get(scope.functionId) ?? Infinity, entry.end));
          }
          if (key === 'update' && (receiver.flags & C)) emit(entry, 'AU-BR-001',
            (workflowSuppression.get(scope.functionId) ?? Infinity) <= entry.start ? { kind: 'workflow_suppression' } : undefined);
          if (when === 'async' && ['changes', 'changesTo', 'changesFrom'].includes(key ?? '') && (receiver.flags & (CF | PF))) emit(entry, 'AU-BR-002', { kind: 'async_dependency' });
          if (key === 'getXMLWait' && (receiver.flags & (AJAX | UNKNOWN))) emit(entry, 'AU-CL-004',
            { kind: 'synchronous_ajax', receiver_unresolved: !!(receiver.flags & UNKNOWN) });
        }
        return unknown(); // No return-value or callable-alias propagation.
      }
      case 'AssignmentExpression': {
        visit(entry.left);
        const value = visit(entry.right);
        assign(entry.left, entry.operator === '=' ? value : unknown(), scope, conditional);
        return value;
      }
      case 'UpdateExpression': visit(entry.argument); assign(entry.argument, local(), scope, conditional); return local();
      case 'IfStatement': visit(entry.test); visit(entry.consequent, true); visit(entry.alternate, true); return unknown();
      case 'ConditionalExpression': visit(entry.test); return join(visit(entry.consequent, true), visit(entry.alternate, true));
      case 'LogicalExpression': return join(visit(entry.left), visit(entry.right, true));
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': case 'WhileStatement': case 'DoWhileStatement':
      case 'SwitchStatement': case 'TryStatement':
        for (const child of children(entry)) walk(child, depth + 1, true);
        return unknown();
      default:
        for (const child of children(entry)) walk(child, depth + 1, conditional);
        return unknown();
    }
  }
  walk(ast);
}
