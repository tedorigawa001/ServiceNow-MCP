/** Independent TS-text oracle, pinned to the unchanged legacy script. Never imports the patcher. */
import { createHash } from 'node:crypto';
import ts from 'typescript';

type Atom = string | number | readonly Atom[];
type Change = (text: string) => string;
export function legacyBodyLiveOracle(script: string) {
  if (createHash('sha256').update(script).digest('hex') !== 'd78c192b304fa73d7e5f70d467564f0dea1a5b3d9cbff3736fd4fab1c0075f07') throw Error('legacy_script_drift');
  const ast = ts.createSourceFile('legacy.mjs', script, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const slot = (i: number) => `this.#bodySeedShell!.slots![${i - 1}]!`;
  // Decode only the legacy literal tables; no eval, import, callback from the input or runner execution.
  function value(n: ts.Expression, env: Readonly<Record<string, Atom>> = {}): Atom {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
    if (ts.isNumericLiteral(n)) return Number(n.text);
    if (ts.isIdentifier(n) && Object.hasOwn(env, n.text)) return env[n.text];
    if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map(s => String(value(s.expression, env)) + s.literal.text).join('');
    if (ts.isArrayLiteralExpression(n)) return n.elements.flatMap(e => ts.isSpreadElement(e) ? value(e.expression, env) as readonly Atom[] : [value(e as ts.Expression, env)]);
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'slot' && n.arguments.length === 1) return slot(value(n.arguments[0], env) as number);
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'map'
      && n.arguments.length === 1 && ts.isArrowFunction(n.arguments[0])) {
      const fn = n.arguments[0], parameter = fn.parameters[0];
      if (fn.parameters.length !== 1 || !ts.isIdentifier(parameter.name) || ts.isBlock(fn.body)) throw Error('oracle_table_drift');
      const name = parameter.name.text, body = fn.body;
      return (value(n.expression.expression, env) as readonly Atom[]).map(v => value(body, { ...env, [name]: v }));
    }
    throw Error('oracle_table_drift');
  }
  function table(name: string): readonly Atom[] {
    const found: ts.VariableDeclaration[] = [];
    function walk(n: ts.Node) {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) found.push(n);
      ts.forEachChild(n, walk);
    }
    walk(ast);
    if (found.length !== 1 || !found[0].initializer) throw Error('oracle_table_drift');
    return value(found[0].initializer) as readonly Atom[];
  }
  const replace = (s: string, a: string, b: string) => {
    if (s.split(a).length !== 2) throw Error('oracle_anchor_drift');
    return s.replace(a, b);
  };
  const method = (name: string, a: string, b: string): Change => s => {
    const start = s.indexOf('  private ' + name + '('), end = s.indexOf('\n  }\n', start) + 5;
    if (start < 0 || end <= start) throw Error('oracle_member_drift');
    return s.slice(0, start) + replace(s.slice(start, end), a, b) + s.slice(end);
  };
  const relation = (n: number, a: string, b: string): Change => s => {
    const start = s.indexOf('  private bodyLiveDataMatches('), end = s.indexOf('\n  }\n', start) + 5, body = s.slice(start, end);
    const lo = body.indexOf(n === 11 ? '    const v = value as BodyUnwindInitial;' : `    if (n === ${n})`);
    const hi = n === 11 ? body.length : body.indexOf(n === 10 ? '    const v = value as BodyUnwindInitial;' : `    if (n === ${n + 1})`);
    if (lo < 0 || hi <= lo) throw Error('oracle_branch_drift');
    return s.slice(0, start) + body.slice(0, lo) + replace(body.slice(lo, hi), a, b) + body.slice(hi) + s.slice(end);
  };
  const inject = (phase: string, boundary: string, code: string) => method('bodySeedPoint',
    '    this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;',
    `    this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;\n    if (phase === '${phase}' && boundary === '${boundary}') { ${code} }`);
  const rows: Readonly<{ id: string; script: string; members: readonly string[]; reference(source: string): string }>[] = [];
  function add(id: string, members: readonly string[], changes: readonly Change[], scenario = 's_normal') {
    rows.push(Object.freeze({ id, script: scenario, members: Object.freeze([...new Set(members)]),
      reference: (source: string) => changes.reduce((s, apply) => apply(s), source) }));
  }
  add('base', [], []);
  let fields = 0;
  for (const [i, row] of table('rows').entries()) for (const raw of row as readonly (readonly string[])[]) {
    const [key, clause] = raw;
    add('field-' + fields++, ['bodyLiveDataMatches'], [relation(i + 6, clause, 'true')], `s_live_mix_${i + 6}_${key}`);
  }
  const brands = table('brands') as readonly string[];
  for (let n = 6; n <= 11; n++) {
    add('copy-' + n, ['bodyLiveDataMatches'], [method('bodyLiveDataMatches', 'value !== cell.issued || ', '')], `s_live_mix_${n}_copy`);
    add('brand-' + n, ['bodyLiveDataMatches'], [relation(n, `v[${brands[n - 6]}] === true`, 'true')], `s_live_mix_${n}_brand`);
    add('fixed-' + n, ['bodyLiveDataMatches'], [method('bodyLiveDataMatches', '!this.bodyLiveDescriptors(value, n, true) || ', '')], `s_live_mix_${n}_mutable_ref`);
    add('writable-' + n, ['bodyLiveDataMatches'], [method('bodyLiveDataMatches', ' || !this.bodyLiveDescriptors(value, n, false)', '')], `s_live_mix_${n}_freeze`);
  }
  let prefix = 0;
  for (let n = 6; n <= 11; n++) for (let prior = 1; prior < n; prior++) {
    const phase = 'BC' + String(n).padStart(2, '0');
    const stage = inject(phase, 'before', `${slot(prior)}.stage = 'provisional';`);
    add('prior-stage-' + prefix, ['bodySeedPoint'], [stage]);
    add('prior-stage-mutant-' + prefix, ['bodySeedPoint', 'bodyLivePrefixMatches'], [stage, method('bodyLivePrefixMatches', "c.stage === 'confirmed' && ", '')]);
    const copy = inject(phase, 'before', `${slot(prior)}.current = Object.seal(Object.defineProperties({}, Object.getOwnPropertyDescriptors(${slot(prior)}.current!)));`);
    add('prior-copy-' + prefix, ['bodySeedPoint'], [copy]);
    add('prior-copy-mutant-' + prefix++, ['bodySeedPoint', 'bodyLivePrefixMatches'], [copy,
      method('bodyLivePrefixMatches', '(i < 5 ? this.bodySeedDataMatches(i + 1) : this.bodyLiveDataMatches(i + 1))', 'true')]);
  }
  for (const row of table('preflights') as readonly (readonly (string | number)[])[]) {
    const [name, n, boundary, code, target, a, b] = row as readonly [string, number, string, string, string, string, string];
    const fault = inject('BC' + String(n).padStart(2, '0'), boundary, code);
    add('preflight-' + name, ['bodySeedPoint'], [fault]);
    add(name + '-mutant', ['bodySeedPoint', target], [fault, method(target, a, b)]);
  }
  add('missing-issued', ['bodyLiveMint'], [method('bodyLiveMint', "cell.issued = raw; cell.stage = 'issued';", "cell.stage = 'issued';")], 's_fault_BC06_issued');
  add('readonly-ref', ['bodySeedPoint'], [inject('BC07', 'before', `(${slot(6)}.current as any).pin = {};`)]);
  add('live-write', ['bodySeedPoint'], [inject('BC07', 'before', `(${slot(6)}.current as any).callReserved = true;`)]);
  add('rejected', ['inspectBodySeed'], [s => replace(s, 'rejectedRetained: c?.rejected !== undefined,',
    'rejectedRetained: c?.rejected !== undefined, rejectedSame: c?.rejected !== undefined && c.rejected === c.current,')], 's_live_mix_10_copy');
  add('diag-first', ['bodySeedPoint'], [inject('BC09', 'before', "this.fail('state_invalid'); throw Error('after_diagnostic');")]);
  for (const row of table('livePrefix') as readonly (readonly string[])[]) {
    const [name, code, a, b] = row, bad = inject('BC08', 'before', code);
    add('live-prefix-' + name, ['bodySeedPoint'], [bad]);
    add('live-prefix-mutant-' + name, ['bodySeedPoint', 'bodyLivePrefixMatches'], [bad, method('bodyLivePrefixMatches', a, b)]);
  }
  const hidden = inject('BC06', 'fix_2', `Object.defineProperty(${slot(6)}.issued!, 'callReserved', { enumerable: false });`);
  add('non-enumerable', ['bodySeedPoint'], [hidden]);
  add('non-enumerable-mutant', ['bodySeedPoint', 'bodyLiveDescriptors'], [hidden, method('bodyLiveDescriptors', 'd.enumerable === true && ', '')]);
  const extensible = method('bodyLiveMint', "    if (fault !== 'unsealed') Object.seal(raw);",
    "    if (n === 7) { for (const k of Reflect.ownKeys(raw)) Object.defineProperty(raw, k, { configurable: false }); } else if (fault !== 'unsealed') Object.seal(raw);");
  add('extensible', ['bodyLiveMint'], [extensible]);
  add('extensible-mutant', ['bodyLiveMint', 'bodyLiveDataMatches'], [extensible, method('bodyLiveDataMatches', '      || !Object.isSealed(value) || ', '      || ')]);
  const rogue = inject('BC11', 'confirmed', "this.#bodySeedPhase = 'rogue_phase';");
  add('rogue-phase', ['bodySeedPoint'], [rogue]);
  add('rogue-phase-echo', ['bodySeedPoint', 'inspectBodyLive'], [rogue, s => replace(s,
    "      phase: runEnum(this.#bodySeedPhase, BODY_LIVE_PHASES, 'unconfirmed'), boundary:", '      phase: this.#bodySeedPhase, boundary:')]);
  return Object.freeze(rows);
}
