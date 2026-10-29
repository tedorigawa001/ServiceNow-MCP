// Offline tarball inspection and in-memory native smoke; no fetch/session/worker.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=execFileSync('npm',['pack','--dry-run','--ignore-scripts','--offline','--json'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,env:{...process.env,npm_config_cache:join(tmpdir(),'servicenow-mcp-owner-pack-cache')},stdio:['ignore','pipe','pipe']});
const [pack]=JSON.parse(output),files=new Set(pack.files.map(file=>file.path));
for(const name of ['review-native-adapter','review-native-body'])for(const suffix of ['.js','.js.map','.d.ts','.d.ts.map'])assert.equal(files.has('dist/servicenow/'+name+suffix),true);
assert.equal([...files].some(file=>file.startsWith('dist/review/abort-scope-evidence')),false);
assert.equal([...files].some(file=>file.startsWith('tests/')),false);
const compiled=readFileSync(new URL('../../dist/servicenow/review-native-adapter.js',import.meta.url),'utf8');
for(const forbidden of ['abort-scope-evidence','bounded-read','review-native-contract'])assert.equal(compiled.includes(forbidden),false);
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-native-reader-adapter.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('fixtures/compiled-native-body.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
console.log('NA-02/03 offline pack: eight artifacts included; fixture modules excluded PASS ('+files.size+' files)');
