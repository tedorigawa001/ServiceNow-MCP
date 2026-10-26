/** Bounded syntactic analysis, NOT an interpreter, call graph or general JavaScript dataflow engine. */
import type { FollowUpContext } from './follow-up-catalog.js';
import { constantValue, UNKNOWN_CONSTANT, type ConstantValue } from './constant-value.js';
import { analyzeAbortFlow, type AbortCall } from './abort-flow.js';
import { analyzeOnChangeFlow } from './onchange-flow.js';
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
const QUERY_RECORD = 256, QUERY_CTOR = 512;
const QUERY_METHOD = 4194304;
const FORM = 1024;
const FORM_SETTER = 2097152;
const CLIENT_RECORD = 2048, CLIENT_CTOR = 4096, LOOKUP_METHOD = 8192;
const LOADING = 16384;
const RUNTIME_INPUT = 32768;
const DOCUMENT = 65536, WINDOW = 131072, DOCUMENT_ELEMENT = 262144, CREATED_ELEMENT = 524288, DOM_METHOD = 1048576;
const domReceivers = DOCUMENT | WINDOW | DOCUMENT_ELEMENT | CREATED_ELEMENT;
const domQueries = new Set(['getElementById', 'querySelector', 'querySelectorAll']);
type InputTiming = 'static' | 'runtime' | 'unknown';
type Origin = { flags: number; properties?: Map<string, Origin>; unknownProperties?: boolean };
type Binding = { origin: Origin; functionId: number; entryFlags?: number; isConst?: boolean; constantWritten?: boolean; constant?: ConstantValue };
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
const formControls = new Map([['setMandatory', 'ui_policy_mandatory_control'], ['setVisible', 'ui_policy_visibility_control'],
  ['setDisplay', 'ui_policy_visibility_control'], ['setReadOnly', 'ui_policy_readonly_control']]);

export function analyzeScopedCandidates(ast: AstNode, when: string | null, emit: (entry: AstNode, rule: string, context?: FollowUpContext) => void,
  options: { allowDeclaredEntry: boolean; constants: boolean; query?: { unresolved: () => void };
    fullText?: { report: (entry: AstNode, kind: 'add_query' | 'encoded_query') => void; unresolved: () => void };
    bindings?: { declared: (entry: AstNode) => void; dynamic: () => void };
    abort?: { effect: (entry: AstNode, effect: string) => void; unresolved: () => void };
    abortScope?: { call: (entry: AstNode, call: AbortCall) => void; unresolved: () => void };
    display?: { write: (entry: AstNode, kind: string) => void; unresolved: () => void };
    uiPolicy?: { control: (entry: AstNode, kind: string, dynamic?: boolean) => void; unresolved: () => void };
    clientLookup?: { lookup: (entry: AstNode, kind: string) => void; unresolved: () => void };
    onChange?: { report: (entry: AstNode, kind: string, state: 'guarded' | 'possible' | 'unresolved') => void; unresolved: () => void };
    onLoad?: { report: (entry: AstNode, kind: string, timing: InputTiming) => void; unresolved: () => void };
    dom?: { report: (entry: AstNode, scope: 'document_scope' | 'created_subtree') => void; unresolved: () => void };
    setValue?: { report: (entry: AstNode) => void; unresolved: () => void } } = { allowDeclaredEntry: false, constants: false }): void {
  const root: Scope = { functionId: 0, functionScope: true, bindings: new Map() };
  const scopes = new WeakMap<AstNode, Scope>();
  const functionScopes = new WeakMap<AstNode, Scope>();
  let functionId = 0, visits = 0;
  const reboundNames = new Set<string>();
  const workflowSuppression = new Map<number, number>();
  const constantWrites: Array<{ pattern: unknown; scope: Scope }> = [];
  const unsafeConstantFunctions = new Set<number>();
  // Query evidence is deliberately stricter than the historical candidate rules.
  // Delay emission so later escapes/method replacement cannot certify a receiver.
  let queryUnsafe = false;
  const queryRebound = new Set<string>(), queryCandidates: AstNode[] = [];
  const fullTextCandidates: { entry: AstNode; kind: 'add_query' | 'encoded_query' }[] = [];
  const scriptBindings = new WeakSet<AstNode>();
  const abortCalls = new WeakMap<AstNode, AbortCall>();
  let abortUnsafe = false;
  const scopeAbortCalls: Array<{entry:AstNode;call:AbortCall}>=[];
  let displayUnsafe = false;
  let uiPolicyUnsafe = false;
  let lookupUnsafe = false;
  const lookupCandidates: { entry: AstNode; kind: string }[] = [];
  const onChangeCalls = new Map<AstNode, string>(), loadingRefs = new WeakSet<AstNode>();
  let onChangeUnsafe = false;
  let onLoadUnsafe = false;
  let domUnsafe = false;
  const domCandidates: { entry: AstNode; scope: 'document_scope' | 'created_subtree' }[] = [];
  let setValueUnsafe = false;
  const setValueCandidates: AstNode[] = [];
  const loadCalls = new Map<AstNode, { kind: string; timing: InputTiming }>();
  const requestInputs = new WeakMap<Origin, { timing: InputTiming; method: boolean }>();
  const loadTimings = new WeakMap<AstNode, InputTiming>();
  const mergeTiming = (a: InputTiming, b: InputTiming): InputTiming => a === 'unknown' || b === 'unknown' ? 'unknown'
    : a === 'runtime' || b === 'runtime' ? 'runtime' : 'static';
  function inputTiming(entry: AstNode, value: Origin): InputTiming {
    budget(0);
    return primitive(entry) !== UNKNOWN_CONSTANT ? 'static' : value.flags & UNKNOWN ? 'unknown'
      : value.flags & RUNTIME_INPUT ? 'runtime' : 'unknown';
  }
  const uiPolicyCandidates: { entry: AstNode; kind: string; dynamic: boolean }[] = [];
  function budget(depth: number) {
    if (++visits > 100000 || depth > 256) throw new AnalysisLimitError('analysis_limit');
  }
  function primitive(value: unknown) {
    return options.constants ? constantValue(value, entry => {
      const scope = scopes.get(entry)!;
      const b = find(scope, String(entry.name));
      return b?.isConst && !b.constantWritten && b.functionId === scope.functionId && !unsafeConstantFunctions.has(scope.functionId)
        ? b.constant ?? UNKNOWN_CONSTANT : UNKNOWN_CONSTANT;
    }, budget) : UNKNOWN_CONSTANT;
  }
  function memberKey(value: unknown): string | null {
    if (options.constants && isAstNode(value) && value.type === 'MemberExpression' && value.computed) {
      const key = primitive(value.property);
      if (typeof key === 'string') return key;
    }
    return staticMemberName(value);
  }
  function join(a: Origin, b: Origin, depth = 0, pairs = new WeakMap<Origin, WeakMap<Origin, Origin>>()): Origin {
    budget(depth);
    if (a === b) return a;
    const cached = pairs.get(a)?.get(b);
    if (cached) return cached;
    const result: Origin = { flags: a.flags | b.flags };
    if (a.unknownProperties || b.unknownProperties) result.unknownProperties = true;
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
    if (options.setValue) {
      const write = entry.type === 'AssignmentExpression' ? entry.left
        : entry.type === 'UpdateExpression' || entry.type === 'UnaryExpression' && entry.operator === 'delete' ? entry.argument
          : entry.type === 'ForInStatement' || entry.type === 'ForOfStatement' ? entry.left : null;
      if (entry.type === 'WithStatement' || entry.type === 'CallExpression' && identifier(entry.callee, 'eval')
        || isAstNode(write) && !['Identifier', 'MemberExpression', 'VariableDeclaration'].includes(write.type)
        || identifier(write, 'g_form') || isAstNode(write) && write.type === 'MemberExpression'
          && (staticMemberName(write) === null || staticMemberName(write) === 'setValue')) {
        setValueUnsafe = true; options.setValue.unresolved();
      }
    }
    if (options.dom) {
      const write = entry.type === 'AssignmentExpression' ? entry.left
        : entry.type === 'UpdateExpression' || entry.type === 'UnaryExpression' && entry.operator === 'delete' ? entry.argument : null;
      if (entry.type === 'WithStatement' || entry.type === 'CallExpression' && identifier(entry.callee, 'eval')
        || identifier(write) && ['document', 'window'].includes(String(write.name))
        || isAstNode(write) && write.type === 'MemberExpression'
          && (staticMemberName(write) === null || ['document', 'body', 'documentElement', 'createElement', ...domQueries].includes(staticMemberName(write)!))) {
        domUnsafe = true; options.dom.unresolved();
      }
    }
    if (options.onLoad) {
      const write = entry.type === 'AssignmentExpression' ? entry.left
        : entry.type === 'UpdateExpression' || entry.type === 'UnaryExpression' && entry.operator === 'delete' ? entry.argument : null;
      if (entry.type === 'WithStatement' || entry.type === 'CallExpression' && identifier(entry.callee, 'eval')
        || identifier(write, 'GlideAjax') || isAstNode(write) && write.type === 'MemberExpression') {
        onLoadUnsafe = true; options.onLoad.unresolved();
      }
    }
    if (options.onChange) {
      const write = entry.type === 'AssignmentExpression' ? entry.left
        : entry.type === 'UpdateExpression' || entry.type === 'UnaryExpression' && entry.operator === 'delete' ? entry.argument : null;
      if (entry.type === 'WithStatement' || entry.type === 'CallExpression' && identifier(entry.callee, 'eval')
        || identifier(write, 'GlideAjax') || isAstNode(write) && write.type === 'MemberExpression'
          && (staticMemberName(write) === null || ['getXML', 'getXMLAnswer', 'getXMLWait'].includes(staticMemberName(write)!))) {
        onChangeUnsafe = true; options.onChange.unresolved();
      }
    }
    if (options.clientLookup) {
      const write = entry.type === 'AssignmentExpression' ? entry.left
        : entry.type === 'UpdateExpression' || entry.type === 'UnaryExpression' && entry.operator === 'delete' ? entry.argument
          : entry.type === 'ForInStatement' || entry.type === 'ForOfStatement' ? entry.left : null;
      if (entry.type === 'WithStatement' || entry.type === 'CallExpression' && identifier(entry.callee, 'eval')
        || isAstNode(write) && write.type === 'MemberExpression' && (staticMemberName(write) === null || ['getReference', 'query', 'get'].includes(staticMemberName(write)!))
        || identifier(write) && ['g_form', 'GlideRecord'].includes(String(write.name))) {
        lookupUnsafe = true; options.clientLookup.unresolved();
      }
    }
    if (options.uiPolicy) {
      const write = entry.type === 'AssignmentExpression' ? entry.left
        : entry.type === 'UpdateExpression' || entry.type === 'UnaryExpression' && entry.operator === 'delete' ? entry.argument : null;
      if (entry.type === 'WithStatement' || entry.type === 'CallExpression' && identifier(entry.callee, 'eval')
        || isAstNode(write) && write.type === 'MemberExpression' && formControls.has(staticMemberName(write) ?? '')) {
        uiPolicyUnsafe = true; options.uiPolicy.unresolved();
      }
    }
    if (options.display) {
      const write = entry.type === 'AssignmentExpression' ? entry.left
        : entry.type === 'UpdateExpression' || entry.type === 'UnaryExpression' && entry.operator === 'delete' ? entry.argument : null;
      if (entry.type === 'WithStatement' || entry.type === 'CallExpression' && identifier(entry.callee, 'eval')
        || isAstNode(write) && write.type === 'MemberExpression' && ['setValue', 'setDisplayValue'].includes(staticMemberName(write) ?? '')) {
        displayUnsafe = true; options.display.unresolved();
      }
      if (isAstNode(write) && !['Identifier', 'MemberExpression'].includes(write.type)) options.display.unresolved();
      if (['ForInStatement', 'ForOfStatement'].includes(entry.type) && isAstNode(entry.left)
        && !['Identifier', 'VariableDeclaration'].includes(entry.left.type)) options.display.unresolved();
    }
    if (options.abort || options.abortScope) {
      const write = entry.type === 'AssignmentExpression' ? entry.left
        : entry.type === 'UpdateExpression' || entry.type === 'UnaryExpression' && entry.operator === 'delete' ? entry.argument : null;
      if (entry.type === 'WithStatement' || entry.type === 'CallExpression' && identifier(entry.callee, 'eval')
        || isAstNode(write) && write.type === 'MemberExpression' && staticMemberName(write) === 'setAbortAction') {
        abortUnsafe = true; options.abort?.unresolved(); options.abortScope?.unresolved();
      }
    }
    if (options.bindings) {
      if (entry.type === 'VariableDeclaration' && scope.functionId === 0 && (entry.kind === 'var' || scope === root))
        for (const declaration of entry.declarations as AstNode[]) scriptBindings.add(declaration);
      if (entry.type === 'WithStatement' || entry.type === 'CallExpression' && identifier(entry.callee, 'eval')) options.bindings.dynamic();
    }
    if (options.query || options.fullText) {
      if (entry.type === 'WithStatement' || entry.type === 'SpreadElement' || entry.type === 'TaggedTemplateExpression'
        || (entry.type === 'CallExpression' && identifier(entry.callee, 'eval'))) queryUnsafe = true;
      if (entry.type === 'CallExpression' && isAstNode(entry.callee) && entry.callee.type === 'MemberExpression'
        && ['defineProperty', 'defineProperties', 'setPrototypeOf', 'assign'].includes(staticMemberName(entry.callee) ?? '')) queryUnsafe = true;
      const write = entry.type === 'AssignmentExpression' ? entry.left
        : entry.type === 'UpdateExpression' || entry.type === 'UnaryExpression' && entry.operator === 'delete' ? entry.argument
          : entry.type === 'ForInStatement' || entry.type === 'ForOfStatement' ? entry.left : null;
      if (identifier(write)) {
        queryRebound.add(String(write.name));
        if (['GlideRecord', 'GlideRecordSecure'].includes(String(write.name))) queryUnsafe = true;
      } else if (isAstNode(write) && write.type === 'MemberExpression'
        && (staticMemberName(write) === null || ['addQuery', 'GlideRecord', 'GlideRecordSecure',
          ...(options.fullText ? ['addEncodedQuery', '__proto__', 'prototype'] : [])].includes(staticMemberName(write)!))) queryUnsafe = true;
      // Destructuring writes are not resolved by this bounded analysis.
      else if (isAstNode(write)) queryUnsafe = true;
    }
    if (options.constants) {
      if (entry.type === 'WithStatement' || (entry.type === 'CallExpression' && identifier(entry.callee, 'eval')))
        unsafeConstantFunctions.add(scope.functionId);
      if (entry.type === 'AssignmentExpression') constantWrites.push({ pattern: entry.left, scope });
      if (entry.type === 'UpdateExpression') constantWrites.push({ pattern: entry.argument, scope });
      if (entry.type === 'ForInStatement' || entry.type === 'ForOfStatement') constantWrites.push({ pattern: entry.left, scope });
    }
    if (entry.type === 'AssignmentExpression') noteWrite(entry.left);
    if (entry.type === 'UpdateExpression') noteWrite(entry.argument);
    if (entry.type === 'VariableDeclarator') noteWrite(entry.id);
    if (entry.type === 'ForInStatement' || entry.type === 'ForOfStatement') noteWrite(entry.left);
    if (entry.type === 'VariableDeclaration') for (const d of entry.declarations as AstNode[]) {
      declare(d.id, entry.kind === 'var' ? nearestFunction(scope) : scope);
      if (options.constants && entry.kind === 'const' && identifier(d.id)) scope.bindings.get(String(d.id.name))!.isConst = true;
    }
    for (const child of children(entry)) prepare(child, entry.type === 'SwitchStatement' && child === entry.discriminant ? parent : scope, depth + 1);
  }
  prepare(ast, root);
  function invalidateConstant(pattern: unknown, scope: Scope, depth = 0): void {
    if (!isAstNode(pattern)) return;
    budget(depth);
    if (pattern.type === 'Identifier') { const b = find(scope, String(pattern.name)); if (b) b.constantWritten = true; }
    else if (pattern.type === 'AssignmentPattern') invalidateConstant(pattern.left, scope, depth + 1);
    else if (pattern.type === 'RestElement') invalidateConstant(pattern.argument, scope, depth + 1);
    else if (pattern.type === 'ObjectPattern') for (const p of pattern.properties as AstNode[])
      invalidateConstant(p.type === 'RestElement' ? p.argument : p.value, scope, depth + 1);
    else if (pattern.type === 'ArrayPattern') for (const p of pattern.elements as unknown[]) invalidateConstant(p, scope, depth + 1);
  }
  for (const write of constantWrites) invalidateConstant(write.pattern, write.scope);
  // Syntactic ServiceNow entry binding only: a sole top-level (function(current, previous){...})(current, previous).
  // No general argument/return propagation or IIFE analysis.
  const statements = ast.body as AstNode[];
  const loadEntries = statements.filter(s => s.type === 'FunctionDeclaration' && identifier(s.id, 'onLoad'));
  const loadEntry = options.onLoad && loadEntries.length === 1 && !reboundNames.has('onLoad')
    && (loadEntries[0].params as AstNode[]).length === 0 ? loadEntries[0] : undefined;
  const changeEntries = statements.filter(s => s.type === 'FunctionDeclaration' && identifier(s.id, 'onChange'));
  const changeEntry = options.onChange && changeEntries.length === 1 && !reboundNames.has('onChange') ? changeEntries[0] : undefined;
  if (options.onChange) {
    const param = changeEntry && (changeEntry.params as AstNode[])[3];
    if (changeEntry && identifier(param) && !reboundNames.has(String(param.name))) {
      const binding = functionScopes.get(changeEntry)!.bindings.get(String(param.name))!;
      binding.origin = origin(LOADING); binding.entryFlags = LOADING;
    } else options.onChange.unresolved();
  }
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
    if (!binding) return origin(options.dom && name === 'document' ? DOCUMENT : options.dom && name === 'window' ? WINDOW
      : name === 'current' ? C : name === 'previous' ? P : name === 'GlideAjax' ? AJAX_CTOR
      : (options.uiPolicy || options.clientLookup || options.setValue) && name === 'g_form' ? FORM
        : options.clientLookup && name === 'GlideRecord' ? CLIENT_CTOR : options.display && name === 'g_scratchpad' ? LOCAL
        : (options.query || options.fullText || options.abort || options.abortScope || options.display || options.uiPolicy) && ['GlideRecord', 'GlideRecordSecure'].includes(name) ? QUERY_CTOR : UNKNOWN);
    if (binding.functionId !== scope.functionId) {
      // Direct lexical reference to the declared platform entry, not propagation of a user alias/call.
      if (binding.entryFlags) return origin(binding.entryFlags | UNKNOWN);
      // Lexical shadowing still applies across function boundaries, but aliases never cross them.
      return binding.origin.flags === LOCAL && !binding.origin.properties ? local() : unknown();
    }
    if (options.dom && binding.constantWritten && binding.origin.flags & (domReceivers | DOM_METHOD)) return unknown();
    if (options.setValue && binding.constantWritten && binding.origin.flags & (FORM | FORM_SETTER)) return unknown();
    if (options.onLoad && binding.constantWritten && binding.origin.flags & (RUNTIME_INPUT | AJAX | AJAX_CTOR | CLIENT_RECORD | CLIENT_CTOR)) return unknown();
    return (options.query || options.fullText) && queryRebound.has(name) && binding.origin.flags & (QUERY_RECORD | QUERY_CTOR | QUERY_METHOD) ? unknown() : binding.origin;
  }
  const receivers = new WeakMap<AstNode, Origin>();
  function uiPolicyWrite(target: unknown) {
    if (!options.uiPolicy || !isAstNode(target) || target.type !== 'MemberExpression') return;
    const receiver = receivers.get(target), key = memberKey(target);
    if (receiver && receiver.flags & FORM && (key === null || formControls.has(key))) {
      uiPolicyUnsafe = true; options.uiPolicy.unresolved();
    }
  }
  function displayWrite(target: unknown, site: AstNode, kind: string) {
    if (!options.display || !isAstNode(target) || target.type !== 'MemberExpression') return;
    const receiver = receivers.get(target) ?? unknown(), key = memberKey(target);
    if (receiver.flags === C && key !== null && !recordMethods.has(key) && !displayUnsafe) options.display.write(site, kind);
    else if (receiver.flags & (C | CF | UNKNOWN)) options.display.unresolved();
  }
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
      const key = memberKey(pattern);
      if (key === null) {
        if (options.constants) receiver.unknownProperties = true;
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
      case 'Identifier': {
        const value = read(scope, String(entry.name));
        if (options.onChange && value.flags === LOADING) {
          if (find(scope, String(entry.name))?.constantWritten) options.onChange.unresolved();
          else loadingRefs.add(entry);
        }
        return value;
      }
      case 'Literal': return local();
      case 'VariableDeclarator': {
        if (scriptBindings.has(entry)) options.bindings!.declared(entry);
        const value = isAstNode(entry.init) ? visit(entry.init) : unknown();
        if (entry.init) assign(entry.id, value, scope, conditional);
        if (options.constants && identifier(entry.id)) {
          const b = find(scope, String(entry.id.name));
          if (b?.isConst && !b.constantWritten) b.constant = primitive(entry.init);
        }
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
        let unknownProperties = false;
        for (const p of entry.properties as AstNode[]) {
          if (p.type === 'SpreadElement') { visit(p.argument); unknownProperties ||= options.constants; continue; }
          if (p.computed) visit(p.key);
          const evaluatedKey = p.computed ? primitive(p.key) : UNKNOWN_CONSTANT;
          const key = typeof evaluatedKey === 'string' ? evaluatedKey : !p.computed && identifier(p.key) ? String(p.key.name)
            : isAstNode(p.key) && p.key.type === 'Literal' && ['string', 'number'].includes(typeof p.key.value) ? String(p.key.value) : null;
          const value = visit(p.value);
          if (key !== null) properties.set(key, p.kind === 'init' ? value : unknown());
          else unknownProperties ||= options.constants;
        }
        return { flags: LOCAL, properties, ...(unknownProperties ? { unknownProperties: true } : {}) };
      }
      case 'ArrayExpression': {
        const properties = new Map<string, Origin>();
        (entry.elements as unknown[]).forEach((e, i) => { if (isAstNode(e)) properties.set(String(i), visit(e)); });
        return { flags: LOCAL, properties, ...(options.constants && (entry.elements as AstNode[]).some(e => e?.type === 'SpreadElement') ? { unknownProperties: true } : {}) };
      }
      case 'MemberExpression': {
        const receiver = visit(entry.object);
        if (entry.computed) visit(entry.property);
        receivers.set(entry, receiver);
        const key = memberKey(entry);
        if (options.fullText && receiver.flags === QUERY_RECORD && ['addQuery', 'addEncodedQuery'].includes(key ?? '')) return origin(QUERY_METHOD);
        if (options.setValue) {
          if (receiver.flags === FORM && key === 'setValue') return origin(FORM_SETTER);
          if (receiver.flags & FORM && key === null) options.setValue.unresolved();
        }
        if (options.dom) {
          if (receiver.flags === WINDOW && key === 'document') return origin(DOCUMENT);
          if (receiver.flags === DOCUMENT && ['body', 'documentElement'].includes(key ?? '')) return origin(DOCUMENT_ELEMENT);
          if (receiver.flags & domReceivers && (domQueries.has(key ?? '') || key === 'createElement')) return origin(DOM_METHOD);
          if (receiver.flags & domReceivers && key === null) options.dom.unresolved();
        }
        if (options.clientLookup && (receiver.flags === FORM && key === 'getReference'
          || receiver.flags === CLIENT_RECORD && ['query', 'get'].includes(key ?? ''))) return origin(LOOKUP_METHOD);
        if ((options.onChange || options.onLoad) && receiver.flags === AJAX && ['getXML', 'getXMLAnswer', 'getXMLWait'].includes(key ?? '')) return origin(LOOKUP_METHOD);
        if (when === 'async' && (receiver.flags & P)) emit(entry, 'AU-BR-002', { kind: 'async_dependency' });
        if (key === null) return unknown();
        const uncertain = receiver.unknownProperties ? UNKNOWN : 0;
        if (receiver.properties?.has(key)) return uncertain ? join(receiver.properties.get(key)!, unknown()) : receiver.properties.get(key)!;
        if (receiver.flags & C) return origin((recordMethods.has(key) ? LOCAL : CF) | uncertain);
        if (receiver.flags & P) return origin((recordMethods.has(key) ? LOCAL : PF) | uncertain);
        if (receiver.flags & (CF | PF)) return origin(LOCAL | uncertain);
        return origin(receiver.flags & UNKNOWN || uncertain ? UNKNOWN : LOCAL);
      }
      case 'CallExpression': case 'NewExpression': {
        const calleeValue = visit(entry.callee);
        let displayArgumentCurrent = false;
        let uiPolicyArgumentForm = false;
        const argValues: Origin[] = [];
        for (const argument of entry.arguments as unknown[]) {
          const value = visit(argument);
          if (options.setValue && containsLookupReceiver(value, new Set(), 0, FORM | FORM_SETTER)) {
            setValueUnsafe = true; options.setValue.unresolved();
          }
          if (options.dom && containsLookupReceiver(value, new Set(), 0, domReceivers | DOM_METHOD)) {
            domUnsafe = true; options.dom.unresolved();
          }
          if (options.onLoad) argValues.push(value);
          if ((options.query || options.fullText) && containsQueryRecord(value)) queryUnsafe = true;
          if (options.fullText && containsLookupReceiver(value, new Set(), 0, QUERY_METHOD)) queryUnsafe = true;
          if (options.display && value.flags & (C | CF)) displayArgumentCurrent = true;
          if (options.uiPolicy && value.flags & FORM) uiPolicyArgumentForm = true;
          if (options.clientLookup && containsLookupReceiver(value)) { lookupUnsafe = true; options.clientLookup.unresolved(); }
          if (options.onChange && containsLookupReceiver(value, new Set(), 0, AJAX | AJAX_CTOR)) {
            onChangeUnsafe = true; options.onChange.unresolved();
          }
          if (options.onChange && value.flags & LOOKUP_METHOD) options.onChange.unresolved();
          if (options.onLoad && containsLookupReceiver(value, new Set(), 0, AJAX | AJAX_CTOR | LOOKUP_METHOD)) {
            onLoadUnsafe = true; options.onLoad.unresolved();
          }
        }
        if (options.clientLookup && entry.type === 'NewExpression' && calleeValue.flags === CLIENT_CTOR) {
          const args = entry.arguments as AstNode[];
          const table = args.length === 1 ? primitive(args[0]) : UNKNOWN_CONSTANT;
          if (args.length === 1 && args[0].type !== 'SpreadElement'
            && !(args[0].type === 'Literal' && typeof args[0].value !== 'string')
            && (table === UNKNOWN_CONSTANT || typeof table === 'string' && table.length > 0)) {
            const record = origin(CLIENT_RECORD);
            if (options.onLoad) requestInputs.set(record, { timing: inputTiming(args[0], argValues[0]), method: false });
            return record;
          }
          options.clientLookup.unresolved(); return unknown();
        }
        if (options.clientLookup && entry.type === 'NewExpression' && calleeValue.flags & CLIENT_CTOR) {
          options.clientLookup.unresolved(); return unknown();
        }
        if ((options.onChange || options.onLoad) && entry.type === 'NewExpression' && calleeValue.flags & AJAX_CTOR) {
          const args = entry.arguments as AstNode[];
          if (calleeValue.flags !== AJAX_CTOR || args.length !== 1 || args[0].type === 'SpreadElement'
            || args[0].type === 'Literal' && (typeof args[0].value !== 'string' || !args[0].value)) {
            options.onChange?.unresolved(); options.onLoad?.unresolved(); return unknown();
          }
        }
        if (options.onLoad && entry.type === 'NewExpression' && calleeValue.flags === AJAX_CTOR) {
          const ajax = origin(AJAX), args = entry.arguments as AstNode[];
          requestInputs.set(ajax, { timing: inputTiming(args[0], argValues[0]), method: false }); return ajax;
        }
        if (options.fullText && entry.type === 'NewExpression' && calleeValue.flags & (QUERY_CTOR | QUERY_METHOD)) {
          const args = entry.arguments as AstNode[];
          if (calleeValue.flags !== QUERY_CTOR || args.length !== 1 || args[0].type === 'SpreadElement'
            || args[0].type === 'Literal' && (typeof args[0].value !== 'string' || !args[0].value)) {
            options.fullText.unresolved(); return unknown();
          }
        }
        if (options.setValue && entry.type === 'NewExpression' && calleeValue.flags & FORM_SETTER) options.setValue.unresolved();
        if (entry.type === 'NewExpression') return origin(calleeValue.flags & AJAX_CTOR ? AJAX
          : calleeValue.flags === QUERY_CTOR ? QUERY_RECORD : calleeValue.flags & UNKNOWN ? UNKNOWN : LOCAL);
        if (isAstNode(entry.callee) && entry.callee.type === 'MemberExpression') {
          const receiver = receivers.get(entry.callee) ?? unknown(), key = memberKey(entry.callee);
          if (options.fullText) {
            if (receiver.flags & QUERY_METHOD || key === null && receiver.flags & QUERY_RECORD) options.fullText.unresolved();
            if (key === 'addQuery' || key === 'addEncodedQuery') {
              const args = entry.arguments as AstNode[];
              if (receiver.flags === QUERY_RECORD && !queryUnsafe && !entry.optional && !entry.callee.optional
                && !args.some(a => a.type === 'SpreadElement')) {
                const value = args.length ? primitive(args[0]) : UNKNOWN_CONSTANT;
                if (key === 'addQuery') {
                  if (typeof value !== 'string' || (args.length !== 2 && !(args.length === 3 && value !== '123TEXTQUERY321'))) options.fullText.unresolved();
                  else if (value === '123TEXTQUERY321') fullTextCandidates.push({ entry, kind: 'add_query' });
                } else if (args.length !== 1 || typeof value !== 'string') options.fullText.unresolved();
                else {
                  const state = fullTextEncoded(value);
                  if (state === 'unknown') options.fullText.unresolved();
                  else if (state === 'matched') fullTextCandidates.push({ entry, kind: 'encoded_query' });
                }
              } else if (receiver.flags & (QUERY_RECORD | QUERY_CTOR | UNKNOWN | C | P)) options.fullText.unresolved();
            }
          }
          if (options.setValue) {
            if (receiver.flags & FORM_SETTER) options.setValue.unresolved();
            if (key === 'setValue') {
              const args = entry.arguments as AstNode[];
              const field = args.length ? primitive(args[0]) : UNKNOWN_CONSTANT;
              const shape = !entry.optional && !entry.callee.optional && !args.some(a => a.type === 'SpreadElement');
              const valid = shape && args.length === 2
                && !(args[0].type === 'Literal' && (typeof args[0].value !== 'string' || !args[0].value))
                && (field === UNKNOWN_CONSTANT || typeof field === 'string' && field.length > 0);
              if (receiver.flags === FORM && !setValueUnsafe && valid) setValueCandidates.push(entry);
              // Three explicit arguments are outside this rule, not proof of a valid display value.
              else if (receiver.flags & (FORM | UNKNOWN) && !(receiver.flags === FORM && !setValueUnsafe && shape && args.length === 3)) options.setValue.unresolved();
            }
          }
          if (options.dom && (domQueries.has(key ?? '') || key === 'createElement')) {
            const args = entry.arguments as AstNode[];
            const arg = args.length === 1 ? primitive(args[0]) : UNKNOWN_CONSTANT;
            const valid = args.length === 1 && args[0].type !== 'SpreadElement'
              && !(args[0].type === 'Literal' && (typeof args[0].value !== 'string' || !args[0].value))
              && (arg === UNKNOWN_CONSTANT || typeof arg === 'string' && arg.length > 0) && !entry.optional && !entry.callee.optional;
            const document = receiver.flags === DOCUMENT, subtree = receiver.flags === CREATED_ELEMENT;
            const known = document || subtree || receiver.flags === DOCUMENT_ELEMENT;
            if (!domUnsafe && valid && known && (key !== 'getElementById' || document)) {
              if (key === 'createElement') {
                if (document) return origin(CREATED_ELEMENT);
                options.dom.unresolved();
              } else {
                domCandidates.push({ entry, scope: subtree ? 'created_subtree' : 'document_scope' });
                // querySelectorAll returns a collection, not an Element.
                return key === 'querySelectorAll' ? unknown() : origin(subtree ? CREATED_ELEMENT : DOCUMENT_ELEMENT);
              }
            } else if (receiver.flags & (domReceivers | UNKNOWN)) options.dom.unresolved();
          }
          if (options.onChange || options.onLoad) {
            if (key === null && receiver.flags & AJAX) { options.onChange?.unresolved(); options.onLoad?.unresolved(); }
            if (['getXML', 'getXMLAnswer', 'getXMLWait'].includes(key ?? '')) {
              const args = entry.arguments as AstNode[];
              const valid = key === 'getXMLWait' ? args.length === 0
                : args.length === 1 && !['Literal', 'SpreadElement'].includes(args[0].type);
              if (receiver.flags === AJAX && valid) {
                if (options.onChange) onChangeCalls.set(entry, 'onchange_lookup_glide_ajax');
                if (options.onLoad) {
                  const state = requestInputs.get(receiver);
                  loadCalls.set(entry, { kind: 'onload_lookup_glide_ajax', timing: conditional || !state?.method ? 'unknown' : state.timing });
                  requestInputs.set(receiver, { timing: 'unknown', method: false });
                }
              } else if (receiver.flags & (AJAX | UNKNOWN)) { options.onChange?.unresolved(); options.onLoad?.unresolved(); }
            }
          }
          if (options.onLoad) {
            const args = entry.arguments as AstNode[], state = requestInputs.get(receiver);
            if (receiver.flags === FORM && ['getValue', 'getDisplayValue'].includes(key ?? '')) return origin(RUNTIME_INPUT);
            if (key === 'addParam' || key === 'addQuery') {
              if (state && (key === 'addParam' && receiver.flags === AJAX || key === 'addQuery' && receiver.flags === CLIENT_RECORD)) {
                let timing: InputTiming = conditional || args.some(a => a.type === 'SpreadElement')
                  || !(args.length === 2 || key === 'addQuery' && args.length === 3) ? 'unknown' : 'static';
                for (let i = 0; i < args.length; i++) timing = mergeTiming(timing, inputTiming(args[i], argValues[i]));
                state.timing = mergeTiming(state.timing, timing);
                if (key === 'addParam' && args.length === 2 && primitive(args[0]) === 'sysparm_name') state.method = true;
              } else if (receiver.flags & (AJAX | CLIENT_RECORD | UNKNOWN)) { onLoadUnsafe = true; options.onLoad.unresolved(); }
            } else if (state && !['get', 'query', 'getXML', 'getXMLAnswer', 'getXMLWait'].includes(key ?? '')) {
              state.timing = 'unknown';
            }
          }
          if (options.clientLookup) {
            if (receiver.flags & LOOKUP_METHOD) options.clientLookup.unresolved();
            if (key === null && receiver.flags & (FORM | CLIENT_RECORD)) options.clientLookup.unresolved();
            const reference = key === 'getReference', recordLookup = key === 'get' || key === 'query';
            if (reference || recordLookup) {
              const args = entry.arguments as AstNode[];
              const field = args.length ? primitive(args[0]) : UNKNOWN_CONSTANT;
              const stringArg = args.length > 0 && !(args[0].type === 'Literal' && typeof args[0].value !== 'string')
                && (field === UNKNOWN_CONSTANT || typeof field === 'string' && field.length > 0);
              const callback = (a: AstNode | undefined) => !a || a.type !== 'Literal';
              const valid = !args.some(a => a.type === 'SpreadElement') && (reference
                ? (args.length === 1 || args.length === 2 && callback(args[1])) && stringArg
                : key === 'get' ? args.length === 1 && stringArg : args.length === 0 || args.length === 1 && callback(args[0]));
              if (valid && (reference && receiver.flags === FORM || recordLookup && receiver.flags === CLIENT_RECORD)) {
                lookupCandidates.push({ entry, kind: reference ? 'client_lookup_get_reference' : key === 'get' ? 'client_lookup_record_get' : 'client_lookup_record_query' });
                if (options.onLoad) {
                  const state = requestInputs.get(receiver);
                  loadTimings.set(entry, conditional ? 'unknown' : reference ? 'runtime' : key === 'get'
                    ? mergeTiming(state?.timing ?? 'unknown', inputTiming(args[0], argValues[0])) : state?.timing ?? 'unknown');
                  if (state) state.timing = 'unknown';
                }
              } else if (receiver.flags & (FORM | CLIENT_RECORD | UNKNOWN)) options.clientLookup.unresolved();
            }
          }
          if (options.uiPolicy) {
            if (uiPolicyArgumentForm && ['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf'].includes(key ?? '')) {
              uiPolicyUnsafe = true; options.uiPolicy.unresolved();
            }
            if (key === null && receiver.flags & FORM) options.uiPolicy.unresolved();
            if (key !== null && formControls.has(key)) {
              const args = entry.arguments as AstNode[];
              const field = args.length === 2 ? primitive(args[0]) : UNKNOWN_CONSTANT;
              const flag = args.length === 2 ? primitive(args[1]) : UNKNOWN_CONSTANT;
              const valid = args.length === 2 && !args.some(a => a.type === 'SpreadElement')
                && !(args[0].type === 'Literal' && typeof args[0].value !== 'string')
                && !(args[1].type === 'Literal' && typeof args[1].value !== 'boolean')
                && (field === UNKNOWN_CONSTANT || typeof field === 'string' && field.length > 0)
                && (flag === UNKNOWN_CONSTANT || typeof flag === 'boolean');
              if (receiver.flags === FORM && valid) uiPolicyCandidates.push({ entry, kind: formControls.get(key)!,
                dynamic: field === UNKNOWN_CONSTANT || flag === UNKNOWN_CONSTANT });
              else if (receiver.flags & (FORM | UNKNOWN)) options.uiPolicy.unresolved();
            }
          }
          if (options.display && displayArgumentCurrent && ['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf'].includes(key ?? '')) options.display.unresolved();
          if (options.display && ['setValue', 'setDisplayValue'].includes(key ?? '')) {
            const args = entry.arguments as AstNode[];
            const field = args.length === 2 ? primitive(args[0]) : UNKNOWN_CONSTANT;
            const recordSetter = key === 'setValue' && receiver.flags === C && typeof field === 'string'
              && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field);
            const elementSetter = receiver.flags === CF && args.length === 1;
            if (!displayUnsafe && !args.some(a => a.type === 'SpreadElement') && (recordSetter || elementSetter)) options.display.write(entry, 'display_field_setter');
            else if (receiver.flags & (C | CF | UNKNOWN)) options.display.unresolved();
          }
          if (options.abort && key === null && receiver.flags & C) options.abort.unresolved();
          if (options.abort && key === 'setAbortAction') {
            const args = entry.arguments as AstNode[];
            const value = args.length === 1 ? primitive(args[0]) : UNKNOWN_CONSTANT;
            abortCalls.set(entry, { receiver: receiver.flags === C && !abortUnsafe ? 'current' : receiver.flags & (C | UNKNOWN) ? 'unknown' : 'other',
              enabled: typeof value === 'boolean' ? value : null });
          }
          if(options.abortScope){
            if(key===null&&receiver.flags&C)options.abortScope.unresolved();
            if(key==='setAbortAction'){
              const args=entry.arguments as AstNode[],value=args.length===1&&!entry.optional&&!entry.callee.optional?primitive(args[0]):UNKNOWN_CONSTANT;
              scopeAbortCalls.push({entry,call:{receiver:receiver.flags===C?'current':receiver.flags&(C|UNKNOWN)?'unknown':'other',enabled:typeof value==='boolean'?value:null}});
            }
          }
          if (options.query && key === null && receiver.flags & QUERY_RECORD) options.query.unresolved();
          if (options.query && key === 'addQuery' && (entry.arguments as AstNode[]).some(a => a.type === 'SpreadElement')) options.query.unresolved();
          if (options.query && key === 'addQuery' && (entry.arguments as AstNode[]).length === 3) {
            const args = entry.arguments as AstNode[];
            if (!args.some(a => a.type === 'SpreadElement') && args[1].type === 'Literal' && args[1].value === 'LIKE') {
              if (receiver.flags === QUERY_RECORD) queryCandidates.push(entry);
              // A receiver that is only partly a local record (e.g. a conditional join) is not certified.
              else if (receiver.flags & (UNKNOWN | C | P | QUERY_RECORD | QUERY_CTOR)) options.query.unresolved();
            } else if (args[1].type !== 'Literal' || args.some(a => a.type === 'SpreadElement')) options.query.unresolved();
          }
          if (key === 'setWorkflow' && (receiver.flags & C) && (entry.arguments as unknown[]).length === 1) {
            const argument = (entry.arguments as unknown[])[0];
            if ((isAstNode(argument) && argument.type === 'Literal' && argument.value === false) || primitive(argument) === false)
              workflowSuppression.set(scope.functionId, Math.min(workflowSuppression.get(scope.functionId) ?? Infinity, entry.end));
          }
          if (key === 'update' && (receiver.flags & C)) emit(entry, 'AU-BR-001',
            (workflowSuppression.get(scope.functionId) ?? Infinity) <= entry.start ? { kind: 'workflow_suppression' } : undefined);
          if (when === 'async' && ['changes', 'changesTo', 'changesFrom'].includes(key ?? '') && (receiver.flags & (CF | PF))) emit(entry, 'AU-BR-002', { kind: 'async_dependency' });
          if (key === 'getXMLWait' && (receiver.flags & (AJAX | UNKNOWN))) emit(entry, 'AU-CL-004',
            { kind: 'synchronous_ajax', receiver_unresolved: !!(receiver.flags & UNKNOWN) });
        }
        else if (options.fullText && calleeValue.flags & QUERY_METHOD) options.fullText.unresolved();
        else if (options.setValue && calleeValue.flags & FORM_SETTER) options.setValue.unresolved();
        else if (options.dom && calleeValue.flags & DOM_METHOD) options.dom.unresolved();
        else if (options.clientLookup && calleeValue.flags & LOOKUP_METHOD) options.clientLookup.unresolved();
        return unknown(); // No return-value or callable-alias propagation.
      }
      case 'AssignmentExpression': {
        visit(entry.left);
        const value = visit(entry.right);
        displayWrite(entry.left, entry, 'display_direct_assignment');
        uiPolicyWrite(entry.left);
        assign(entry.left, entry.operator === '=' ? value : unknown(), scope, conditional);
        return value;
      }
      case 'UpdateExpression':
        visit(entry.argument); displayWrite(entry.argument, entry, 'display_update_expression');
        uiPolicyWrite(entry.argument);
        assign(entry.argument, local(), scope, conditional); return local();
      case 'UnaryExpression':
        visit(entry.argument);
        if (entry.operator === 'delete') displayWrite(entry.argument, entry, 'display_delete_property');
        if (entry.operator === 'delete') uiPolicyWrite(entry.argument);
        return unknown();
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
  function containsQueryRecord(value: Origin, seen = new Set<Origin>(), depth = 0): boolean {
    budget(depth);
    if (seen.has(value)) return false;
    seen.add(value);
    if (value.flags & (QUERY_RECORD | QUERY_CTOR)) return true;
    return !!value.properties && [...value.properties.values()].some(v => containsQueryRecord(v, seen, depth + 1));
  }
  // Term-boundary recognizer only, never an encoded-query interpreter/validator.
  function fullTextEncoded(value: string): 'matched' | 'clear' | 'unknown' {
    budget(0);
    if (!value || /[\\\r\n\u0000]|javascript:/i.test(value) || value.includes('^^')) return 'unknown';
    const terms = value.split('^');
    let found = false;
    for (let i = 0; i < terms.length; i++) {
      budget(0);
      let term = terms[i];
      if (term === 'EQ' && i === terms.length - 1 && i > 0) continue;
      if (!term) return 'unknown';
      if (i > 0 && /^(OR|NQ)/.test(term)) term = term.slice(2);
      if (!term) return 'unknown';
      if (term.startsWith('123TEXTQUERY321')) {
        if (!term.startsWith('123TEXTQUERY321=') || term.length === '123TEXTQUERY321='.length) return 'unknown';
        found = true;
      }
    }
    return found ? 'matched' : 'clear';
  }
  function containsLookupReceiver(value: Origin, seen = new Set<Origin>(), depth = 0, mask = FORM | CLIENT_RECORD | CLIENT_CTOR): boolean {
    budget(depth);
    if (seen.has(value)) return false;
    seen.add(value);
    if (value.flags & mask) return true;
    return !!value.properties && [...value.properties.values()].some(v => containsLookupReceiver(v, seen, depth + 1, mask));
  }
  walk(ast);
  if (options.fullText) {
    if (queryUnsafe) options.fullText.unresolved();
    else for (const candidate of fullTextCandidates) { budget(0); options.fullText.report(candidate.entry, candidate.kind); }
  }
  for (const candidate of setValueCandidates) {
    budget(0);
    if (setValueUnsafe) options.setValue!.unresolved();
    else options.setValue!.report(candidate);
  }
  for (const candidate of domCandidates) {
    budget(0);
    if (domUnsafe) options.dom!.unresolved();
    else options.dom!.report(candidate.entry, candidate.scope);
  }
  for (const candidate of lookupCandidates) {
    budget(0);
    if (lookupUnsafe) options.clientLookup!.unresolved();
    else {
      options.clientLookup!.lookup(candidate.entry, candidate.kind);
      if (options.onChange) onChangeCalls.set(candidate.entry, 'onchange_lookup_client_record_or_reference');
      if (options.onLoad) loadCalls.set(candidate.entry, { kind: 'onload_lookup_client_record_or_reference', timing: loadTimings.get(candidate.entry) ?? 'unknown' });
    }
  }
  if (options.onChange) {
    if (!changeEntry || onChangeUnsafe || lookupUnsafe) options.onChange.unresolved();
    else analyzeOnChangeFlow(changeEntry.body as AstNode, onChangeCalls, loadingRefs, budget, options.onChange.report, options.onChange.unresolved);
  }
  if (options.onLoad) {
    if (!loadEntry || onLoadUnsafe || lookupUnsafe) options.onLoad.unresolved();
    else for (const [site, detail] of loadCalls) {
      budget(0);
      if (scopes.get(site)!.functionId !== functionScopes.get(loadEntry)!.functionId) options.onLoad.unresolved();
      else options.onLoad.report(site, detail.kind, detail.timing);
    }
  }
  if (options.abort) analyzeAbortFlow(ast, abortCalls, budget, options.abort.effect, options.abort.unresolved);
  if(options.abortScope){
    if(abortUnsafe)options.abortScope.unresolved();
    else for(const value of scopeAbortCalls){budget(0);options.abortScope.call(value.entry,value.call);}
  }
  for (const candidate of uiPolicyCandidates) {
    budget(0);
    if (uiPolicyUnsafe) options.uiPolicy!.unresolved();
    else options.uiPolicy!.control(candidate.entry, candidate.kind, candidate.dynamic);
  }
  for (const candidate of queryCandidates) {
    if (queryUnsafe) options.query!.unresolved();
    else emit(candidate, 'AU-QRY-001');
  }
}
