// Static packaging plus pure compiled contract only; deliberately does not run existing native worker smoke.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=execFileSync('bdo',['proxy','npm','pack','--dry-run','--ignore-scripts','--offline','--json'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,env:{...process.env,npm_config_cache:'/private/tmp/servicenow-mcp-owner-pack-cache'},stdio:['ignore','pipe','pipe']});
const [pack]=JSON.parse(output),files=new Set(pack.files.map(file=>file.path));
for(const suffix of ['.js','.js.map','.d.ts','.d.ts.map'])assert.equal(files.has('dist/servicenow/review-native-contract'+suffix),true);
assert.equal([...files].some(file=>file.startsWith('dist/review/abort-scope-evidence')),false);
assert.equal([...files].some(file=>file.startsWith('tests/')),false);
const compiled=readFileSync(new URL('../../dist/servicenow/review-native-contract.js',import.meta.url),'utf8');assert.equal(compiled.includes('abort-scope-evidence'),false);assert.equal(compiled.includes('bounded-read'),false);
execFileSync('bdo',['proxy',process.execPath,fileURLToPath(new URL('fixtures/compiled-native-ownership-contract.mjs',import.meta.url))],{cwd:root,stdio:'inherit'});
console.log('NA-01 static pack: four internal module artifacts included; fixture modules excluded PASS ('+files.size+' files)');
