/** A scratch-only derivation of the pinned legacy driver. No old file is edited. */
import ts from 'typescript';
import { legacyBodyLiveOracle } from './body-live-migration-oracle.js';

export function buildBodyLiveDriver(legacy: string, legacyURL: string, runtimeURL: string, scratchRoot: string,
  mode: 'js' | 'reference'): string {
  legacyBodyLiveOracle(legacy); // Pin the exact assertion and semantic-diagnostic source.
  const once = (s: string, from: string, to: string) => {
    if (s.split(from).length !== 2) throw Error('driver_drift');
    return s.replace(from, to);
  };
  let text = once(legacy, "const dir = mkdtempSync(join(tmpdir(), 'probe-body-live-'));",
    `const dir = mkdtempSync(join(${JSON.stringify(scratchRoot)}, 'probe-body-live-'));`);
  text = once(text, 'const emit = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;',
    'const emit = text => { __blbEmits++; return ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText; };');
  text = once(text, "  const f = join(dir, name + '.js'); writeFileSync(f, emit(text)); return import(pathToFileURL(f).href);",
    '  return __blb.load(text, name);');
  text = once(text, "const run = (m, script = 's_normal') => { const a = m.createProbeBodyLiveFake(script), r = a.prepare(); return { a, r, s: a.inspect() }; };",
    "const run = (m, script = 's_normal') => { const a = m.createProbeBodyLiveFake(script), r = a.prepare(), s = a.inspect(); __blb.record(m, script, r, s); return { a, r, s }; };");
  text = once(text, "  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));",
    "  const __isolation = await __blb.isolation();\n  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));");
  text = once(text, '} finally { rmSync(dir, { recursive: true, force: true }); }', `
  console.log(JSON.stringify({ blb: true, mode: __blbMode, payloadEmits: __blbEmits,
    execution: __blb.finish(), isolation: __isolation, loader: __blb.inspect() }));
} finally { __blb.stop(); rmSync(dir, { recursive: true, force: true }); }`);
  // Only URL infrastructure changes; all assertion expressions and their evaluation order stay verbatim.
  function asserts(s: string): string[] {
    const file = ts.createSourceFile('driver.mjs', s, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS), out: string[] = [];
    function walk(n: ts.Node) {
      if (ts.isCallExpression(n) && n.expression.getText(file).startsWith('assert.')) out.push(n.getText(file));
      ts.forEachChild(n, walk);
    }
    walk(file); return out;
  }
  if (JSON.stringify(asserts(text)) !== JSON.stringify(asserts(legacy))) throw Error('driver_assertion_drift');
  text = text.replaceAll('import.meta.url', JSON.stringify(legacyURL));
  // Insert the pinned literal last: infrastructure rewrites must never rewrite its contents.
  text = once(text, 'const emitted = new Set();', `
const __blbMode = ${JSON.stringify(mode)};
let __blbEmits = 0;
const __blb = createBodyLiveLoadSession(source, ${JSON.stringify(legacy)}, __blbMode, pathToFileURL(dir + '/').href, 60000, {
  now: () => performance.now(),
  write: (url, js) => writeFileSync(new URL(url), js, { flag: 'wx' }),
  load: url => import(url),
  emit: text => emit(text),
});
const emitted = new Set();`);
  return `import { createBodyLiveLoadSession } from ${JSON.stringify(runtimeURL)};\n` + text;
}
