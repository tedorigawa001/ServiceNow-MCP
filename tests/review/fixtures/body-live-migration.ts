/** BL-A values only: no loader, filesystem, runtime binding or automatic fallback. */
import ts from 'typescript';
type Group = 'base' | 'field' | 'shape' | 'prior' | 'preflight' | 'observation' | 'prefix' | 'descriptor_projection';
export interface BodyLivePatch {
  readonly member: string;
  readonly branch?: number;
  readonly from: string;
  readonly to: string;
}
export interface BodyLiveMigrationCase {
  readonly id: string;
  readonly group: Group;
  readonly script: string;
  readonly patches: readonly BodyLivePatch[];
}
const member = (name: string, from: string, to: string, branch?: number): BodyLivePatch =>
  Object.freeze({ member: name, ...(branch === undefined ? {} : { branch }), from, to });
const slot = (n: number) => `this.#bodySeedShell!.slots![${n - 1}]!`;
const inject = (phase: string, boundary: string, code: string) => member('bodySeedPoint',
  'this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;',
  `this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;\nif (phase === '${phase}' && boundary === '${boundary}') { ${code} }`);

function ledger(): readonly BodyLiveMigrationCase[] {
  const out: BodyLiveMigrationCase[] = [];
  const add = (id: string, group: Group, patches: readonly BodyLivePatch[], script = 's_normal') =>
    out.push(Object.freeze({ id, group, script, patches: Object.freeze([...patches]) }));
  add('base', 'base', []);
  const fields = [
    ['pin', 'bodyCell', 'activationConfirmed', 'callReserved', 'entryObserved', 'returnCaptured', 'callPhase', 'outcome'],
    ['pin', 'progress', 'bodyEntryClosed', 'controlReturned', 'continuationState'],
    ['context', 'rootFailure', 'cellDiagnostic', 'probeFirst', 'exitFirst', 'deliveryFirst', 'failurePhase', 'failureBoundary', 'refusal'],
    ['pin', 'duty', 'control', 'kind', 'used', 'blocked', 'confirmed', 'target', 'blockedTarget', 'confirmedTarget'],
    ['pin', 'duty', 'progress', 'retirement', 'terminalAnchor', 'kind', 'prepared', 'committed', 'candidate', 'issued', 'accepted'],
    ['context', 'pin', 'progress', 'closure', 'diagnostic', 'retirement', 'terminal', 'state', 'routeUsed', 'inProgress', 'phase', 'boundary', 'fixedReply'],
  ];
  const refs: Readonly<Record<string, string>> = { pin: 'pin', bodyCell: 'ctx.cells.body', progress: 'slots[5]!.current',
    context: 'ctx', rootFailure: 'this.#failure', cellDiagnostic: 'ctx.cells.diagnostic', duty: 'ctx.duty', control: 'ctx.control',
    retirement: 'slots[8]!.current', terminalAnchor: 'ctx.exitBundle.terminal', closure: 'slots[6]!.current',
    diagnostic: 'slots[7]!.current', terminal: 'slots[9]!.current' };
  let field = 0;
  fields.forEach((keys, i) => keys.forEach(key => {
    const n = i + 6;
    const value = refs[key] ?? (['target', 'blockedTarget', 'confirmedTarget', 'candidate', 'issued', 'accepted', 'fixedReply'].includes(key) ? 'undefined'
      : key === 'kind' ? n === 9 ? "'not_attempted'" : "'none'"
        : key === 'state' ? "'idle'" : key === 'callPhase' ? "'body_not_called'"
          : ['outcome', 'continuationState', 'probeFirst', 'exitFirst', 'deliveryFirst', 'failurePhase', 'failureBoundary', 'refusal', 'phase', 'boundary'].includes(key)
            ? key === 'continuationState' ? "'unobserved'" : "'none'" : 'false');
    add(`field-${field++}`, 'field', [member('bodyLiveDataMatches', `v.${key} === ${value}`, 'true', n)], `s_live_mix_${n}_${key}`);
  }));
  const brands = ['BODY_PROGRESS', 'BODY_CLOSURE', 'BODY_DIAGNOSTIC', 'BODY_RETIREMENT', 'BODY_TERMINAL', 'BODY_UNWIND'];
  for (let n = 6; n <= 11; n++) {
    add(`copy-${n}`, 'shape', [member('bodyLiveDataMatches', 'value !== cell.issued || ', '')], `s_live_mix_${n}_copy`);
    add(`brand-${n}`, 'shape', [member('bodyLiveDataMatches', `v[${brands[n - 6]}] === true`, 'true', n)], `s_live_mix_${n}_brand`);
    add(`fixed-${n}`, 'shape', [member('bodyLiveDataMatches', '!this.bodyLiveDescriptors(value, n, true) || ', '')], `s_live_mix_${n}_mutable_ref`);
    add(`writable-${n}`, 'shape', [member('bodyLiveDataMatches', ' || !this.bodyLiveDescriptors(value, n, false)', '')], `s_live_mix_${n}_freeze`);
  }
  let prefix = 0;
  for (let n = 6; n <= 11; n++) for (let prior = 1; prior < n; prior++) {
    const phase = `BC${String(n).padStart(2, '0')}`;
    const stage = inject(phase, 'before', `${slot(prior)}.stage = 'provisional';`);
    add(`prior-stage-${prefix}`, 'prior', [stage]);
    add(`prior-stage-mutant-${prefix}`, 'prior', [stage, member('bodyLivePrefixMatches', "c.stage === 'confirmed' && ", '')]);
    const copy = inject(phase, 'before', `${slot(prior)}.current = Object.seal(Object.defineProperties({}, Object.getOwnPropertyDescriptors(${slot(prior)}.current!)));`);
    add(`prior-copy-${prefix}`, 'prior', [copy]);
    add(`prior-copy-mutant-${prefix++}`, 'prior', [copy, member('bodyLivePrefixMatches', '(i < 5 ? this.bodySeedDataMatches(i + 1) : this.bodyLiveDataMatches(i + 1))', 'true')]);
  }
  const preflights = [
    ['base', 6, 'before', "this.#issuedCells!.body.state = 'running';", 'bodyLiveMint', '!this.bodySeedBaseMatches() || ', ''],
    ['target-stage', 8, 'before', `${slot(8)}.stage = 'attempting';`, 'bodyLivePrefixMatches', "c.stage === 'not_started' && ", ''],
    ['target-reserved', 8, 'before', `${slot(8)}.attemptReserved = true;`, 'bodyLivePrefixMatches', 'c.attemptReserved === false && ', ''],
    ['target-call', 8, 'before', `${slot(8)}.callBoundaryReached = true;`, 'bodyLivePrefixMatches', 'c.callBoundaryReached === false', 'true'],
    ['suffix', 10, 'before', `${slot(13)}.attemptReserved = true;`, 'bodyLivePrefixMatches', 'c.attemptReserved === false && ', ''],
    ['final-base', 11, 'confirmed', "this.#issuedCells!.body.state = 'running';", 'prepareBodyLive', '!this.bodySeedBaseMatches() || ', ''],
    ['final-prefix', 11, 'confirmed', `${slot(6)}.current!.callReserved = true;`, 'prepareBodyLive', ' || !this.bodyLivePrefixMatches(11)', ''],
  ] as const;
  for (const [name, n, boundary, code, target, from, to] of preflights) {
    const fault = inject(`BC${String(n).padStart(2, '0')}`, boundary, code);
    add('preflight-' + name, 'preflight', [fault]);
    add(name + '-mutant', 'preflight', [fault, member(target, from, to)]);
  }
  add('missing-issued', 'observation', [member('bodyLiveMint', "cell.issued = raw; cell.stage = 'issued';", "cell.stage = 'issued';")], 's_fault_BC06_issued');
  add('readonly-ref', 'observation', [inject('BC07', 'before', `(${slot(6)}.current as any).pin = {};`)]);
  add('live-write', 'observation', [inject('BC07', 'before', `(${slot(6)}.current as any).callReserved = true;`)]);
  add('rejected', 'observation', [member('inspectBodySeed', 'rejectedRetained: c?.rejected !== undefined,',
    'rejectedRetained: c?.rejected !== undefined, rejectedSame: c?.rejected !== undefined && c.rejected === c.current,')], 's_live_mix_10_copy');
  add('diag-first', 'observation', [inject('BC09', 'before', "this.fail('state_invalid'); throw Error('after_diagnostic');")]);
  const livePrefix = [
    ['shell-failure', "Object.defineProperty(this.#bodySeedShell!, 'failure', { value: { ...this.#failure } });", 's.failure !== this.#failure', 'false'],
    ['shell-state', "this.#bodySeedShell!.state = 'held';", "s.state !== 'building'", 'false'],
    ['shell-shape', '(this.#bodySeedShell! as any).extra = true;', "!bodySeedShape(s, ['failure', 'slots', 'state', 'ready', 'execution', 'bindAttemptUsed', 'bindStage'])", 'false'],
    ['carrier-shape', `(${slot(12)} as any).extra = true;`, "!bodySeedShape(c, ['index', 'kind', 'stage', 'attemptReserved', 'callBoundaryReached', 'issued', 'current', 'rejected'])", 'false'],
    ['carrier-index', `(${slot(12)} as any).index = 99;`, 'c.index !== i + 1', 'false'],
    ['carrier-kind', `(${slot(12)} as any).kind = 'draft';`, 'c.kind !== kind', 'false'],
    ['suffix-issued', `${slot(13)}.issued = Object.freeze({});`, 'c.issued === undefined && ', ''],
    ['suffix-current', `${slot(13)}.current = Object.freeze({});`, 'c.current === undefined && ', ''],
    ['suffix-rejected', `${slot(13)}.rejected = Object.freeze({});`, ' && c.rejected === undefined;', ';'],
  ] as const;
  for (const [name, code, from, to] of livePrefix) {
    const fault = inject('BC08', 'before', code);
    add('live-prefix-' + name, 'prefix', [fault]);
    add('live-prefix-mutant-' + name, 'prefix', [fault, member('bodyLivePrefixMatches', from, to)]);
  }
  const hidden = inject('BC06', 'fix_2', `Object.defineProperty(${slot(6)}.issued!, 'callReserved', { enumerable: false });`);
  add('non-enumerable', 'descriptor_projection', [hidden]);
  add('non-enumerable-mutant', 'descriptor_projection', [hidden, member('bodyLiveDescriptors', 'd.enumerable === true && ', '')]);
  const extensible = member('bodyLiveMint', "if (fault !== 'unsealed') Object.seal(raw);",
    "if (n === 7) { for (const k of Reflect.ownKeys(raw)) Object.defineProperty(raw, k, { configurable: false }); } else if (fault !== 'unsealed') Object.seal(raw);");
  add('extensible', 'descriptor_projection', [extensible]);
  add('extensible-mutant', 'descriptor_projection', [extensible, member('bodyLiveDataMatches', ' || !Object.isSealed(value) || ', ' || ')]);
  const rogue = inject('BC11', 'confirmed', "this.#bodySeedPhase = 'rogue_phase';");
  add('rogue-phase', 'descriptor_projection', [rogue]);
  add('rogue-phase-echo', 'descriptor_projection', [rogue, member('inspectBodyLive',
    "phase: runEnum(this.#bodySeedPhase, BODY_LIVE_PHASES, 'unconfirmed'), boundary:", 'phase: this.#bodySeedPhase, boundary:')]);
  if (out.length !== 304 || new Set(out.map(c => c.id)).size !== 304) throw Error('migration_ledger_invalid');
  return Object.freeze(out);
}
const CASES = ledger();
export function bodyLiveMigrationCases(): readonly BodyLiveMigrationCase[] { return CASES; }

type DriftPoint = 'input' | 'syntax' | 'class' | 'member' | 'branch' | 'anchor' | 'case' | 'output';
export interface BodyLiveDrift { readonly ok: false; readonly reason: 'transform_drift'; readonly point: DriftPoint; readonly id?: string }
export type BodyLivePatchResult = BodyLiveDrift | Readonly<{ ok: true; id: string; js: string; members: readonly string[] }>;
export type BodyLivePatchBoundary = BodyLiveDrift | Readonly<{ ok: true; patch(id: unknown): BodyLivePatchResult }>;
const drift = (point: DriftPoint, id?: string): BodyLiveDrift => Object.freeze({ ok: false, reason: 'transform_drift', point, ...(id === undefined ? {} : { id }) });
interface Token { readonly kind: ts.SyntaxKind; readonly value: string; readonly start: number; readonly end: number }
function tokens(text: string): readonly Token[] {
  const scan = ts.createScanner(ts.ScriptTarget.ES2022, true, ts.LanguageVariant.Standard, text);
  const out: Token[] = [];
  const templates: number[] = [];
  for (let kind = scan.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scan.scan()) {
    if (kind === ts.SyntaxKind.CloseBraceToken && templates.length) {
      if (templates[templates.length - 1] === 0) {
        kind = scan.reScanTemplateToken(false);
        if (kind === ts.SyntaxKind.TemplateTail) templates.pop();
      } else templates[templates.length - 1]--;
    } else if (kind === ts.SyntaxKind.OpenBraceToken && templates.length) templates[templates.length - 1]++;
    if (kind === ts.SyntaxKind.TemplateHead) templates.push(0);
    out.push({ kind, value: kind === ts.SyntaxKind.StringLiteral ? scan.getTokenValue() : scan.getTokenText(),
      start: scan.getTokenPos(), end: scan.getTextPos() });
  }
  return out;
}
// Only fixed, internal recipe text passes here; never a source-wide type-erasure regex.
function jsRecipe(text: string): string { return text.replace(/ as any\b/g, '').replace(/!(?=[.\[\]),;])/g, ''); }
function syntax(text: string, kind: ts.ScriptKind): ts.SourceFile | undefined {
  try {
    const file = ts.createSourceFile(kind === ts.ScriptKind.TS ? 'baseline.ts' : 'candidate.js', text, ts.ScriptTarget.ES2022, true, kind);
    return (file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics.length ? undefined : file;
  } catch { return undefined; }
}
function root(file: ts.SourceFile): ts.ClassDeclaration | undefined {
  const roots = file.statements.filter((n): n is ts.ClassDeclaration => ts.isClassDeclaration(n) && n.name?.text === 'CanonicalGateDraftRoot');
  return roots.length === 1 ? roots[0] : undefined;
}
function body(file: ts.SourceFile, owner: ts.ClassDeclaration, patch: BodyLivePatch): readonly [number, number] | DriftPoint {
  const found = owner.members.filter((n): n is ts.MethodDeclaration => ts.isMethodDeclaration(n) && n.name.getText(file) === patch.member);
  if (found.length !== 1 || !found[0].body) return 'member';
  const block = found[0].body;
  if (patch.branch === undefined) return [block.getStart(file), block.end];
  const branch = patch.branch;
  if (branch >= 6 && branch <= 10) {
    const matches = block.statements.filter((n): n is ts.IfStatement => ts.isIfStatement(n)
      && tokens(n.expression.getText(file)).map(t => t.value).join(' ') === `n === ${branch}`);
    if (matches.length !== 1) return 'branch';
    return [matches[0].thenStatement.getStart(file), matches[0].thenStatement.end];
  }
  if (branch !== 11) return 'branch';
  const tail = block.statements.slice(-2);
  if (tail.length !== 2 || !ts.isVariableStatement(tail[0]) || !ts.isReturnStatement(tail[1])
    || tail[0].declarationList.declarations.length !== 1 || tail[0].declarationList.declarations[0].name.getText(file) !== 'v'
    || !tail[1].expression || !tail[1].expression.getText(file).startsWith('n === 11')) return 'branch';
  return [tail[0].getStart(file), tail[1].end];
}
function memberTokens(file: ts.SourceFile, owner: ts.ClassDeclaration): ReadonlyMap<string, readonly Token[]> {
  const out = new Map<string, readonly Token[]>();
  const needed = new Set(CASES.flatMap(c => c.patches.map(p => p.member)));
  for (const n of owner.members) {
    if (!ts.isMethodDeclaration(n) || !n.body || !needed.has(n.name.getText(file))) continue;
    const found: Token[] = [];
    const walk = (n: ts.Node) => {
      if (n.kind === ts.SyntaxKind.JSDocComment) return;
      if (n.kind >= ts.SyntaxKind.FirstToken && n.kind <= ts.SyntaxKind.LastToken) {
        const kind = ts.isIdentifier(n) ? ts.createScanner(ts.ScriptTarget.ES2022, true, ts.LanguageVariant.Standard, n.text).scan() : n.kind;
        found.push({ kind, value: ts.isStringLiteral(n) ? n.text : n.getText(file), start: n.getStart(file), end: n.end });
      } else for (const child of n.getChildren(file)) walk(child);
    };
    walk(n.body); out.set(n.name.getText(file), found);
  }
  return out;
}
function locate(pool: readonly Token[], range: readonly [number, number], needle: string): readonly [number, number] | undefined {
  const source = pool.filter(t => t.start >= range[0] && t.end <= range[1]), target = tokens(needle);
  if (!target.length) return undefined;
  const positions: number[] = [];
  for (let i = 0; i + target.length <= source.length; i++) {
    if (target.every((t, j) => source[i + j].kind === t.kind && source[i + j].value === t.value)) positions.push(i);
  }
  if (positions.length !== 1) return undefined;
  const i = positions[0];
  return [source[i].start, source[i + target.length - 1].end];
}

/** Generates values only. Does not import, write, evaluate or register the resulting JS. */
export function createBodyLivePatchBoundary(source: unknown): BodyLivePatchBoundary {
  if (typeof source !== 'string' || source.length === 0 || source.length > 1_048_576) return drift('input');
  const typed = syntax(source, ts.ScriptKind.TS);
  if (!typed) return drift('syntax');
  const typedRoot = root(typed);
  if (!typedRoot) return drift('class');
  const emitted = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const js = syntax(emitted, ts.ScriptKind.JS), jsRoot = js && root(js);
  if (!js || !jsRoot) return drift('syntax');
  const typedTokens = memberTokens(typed, typedRoot), emittedTokens = memberTokens(js, jsRoot);
  // Validate every fixed recipe against the same baseline, even if the caller asks only for base.
  const plans = new Map<string, readonly Readonly<{ start: number; end: number; replacement: string }>[] >();
  for (const c of CASES) {
    const edits: { start: number; end: number; replacement: string }[] = [];
    for (const p of c.patches) {
      const tr = body(typed, typedRoot, p), jr = body(js, jsRoot, p);
      if (typeof tr === 'string') return drift(tr);
      if (typeof jr === 'string') return drift(jr);
      const tsPosition = locate(typedTokens.get(p.member) ?? [], tr, p.from);
      const jsPosition = locate(emittedTokens.get(p.member) ?? [], jr, jsRecipe(p.from));
      if (!tsPosition || !jsPosition) return drift('anchor', c.id);
      const replacement = jsRecipe(p.to);
      if (tokens(jsRecipe(p.from)).map(t => t.value).join(' ') === tokens(replacement).map(t => t.value).join(' ')) return drift('anchor');
      edits.push({ start: jsPosition[0], end: jsPosition[1], replacement });
    }
    edits.sort((a, b) => b.start - a.start);
    if (edits.some((e, i) => i > 0 && e.end > edits[i - 1].start)) return drift('anchor');
    plans.set(c.id, Object.freeze(edits.map(e => Object.freeze(e))));
  }
  return Object.freeze({ ok: true, patch(id: unknown): BodyLivePatchResult {
    if (typeof id !== 'string') return drift('case');
    const edits = plans.get(id), c = CASES.find(c => c.id === id);
    if (!edits || !c) return drift('case');
    let text = emitted;
    for (const e of edits) text = text.slice(0, e.start) + e.replacement + text.slice(e.end);
    if (id !== 'base' && text === emitted) return drift('output');
    if (!syntax(text, ts.ScriptKind.JS)) return drift('output');
    return Object.freeze({ ok: true, id, js: text, members: Object.freeze([...new Set(c.patches.map(p => p.member))]) });
  } });
}
