/** Opt-in BL-B driver. The normal compiled-probe-body-live entry is deliberately unchanged. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const mode = process.argv.length === 2 ? 'js' : process.argv.length === 3 && process.argv[2] === '--reference' ? 'reference' : undefined;
if (!mode) throw Error('driver_mode');
const root = mkdtempSync(join(tmpdir(), 'body-live-b-'));
try {
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  for (const name of ['body-live-migration', 'body-live-migration-oracle', 'body-live-esm-loader', 'body-live-driver']) {
    const source = readFileSync(new URL('./' + name + '.ts', import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
    writeFileSync(join(root, name + '.js'), js.replace("from 'typescript'", 'from ' + JSON.stringify(import.meta.resolve('typescript'))));
  }
  const { buildBodyLiveDriver } = await import(pathToFileURL(join(root, 'body-live-driver.js')).href);
  const legacyURL = new URL('./compiled-probe-body-live.mjs', import.meta.url);
  let driver = buildBodyLiveDriver(readFileSync(legacyURL, 'utf8'), legacyURL.href,
    pathToFileURL(join(root, 'body-live-esm-loader.js')).href, root, mode);
  driver = driver.replace("from 'typescript'", 'from ' + JSON.stringify(import.meta.resolve('typescript')));
  const path = join(root, 'driver.mjs'); writeFileSync(path, driver);
  await import(pathToFileURL(path).href);
} finally { rmSync(root, { recursive: true, force: true }); }
