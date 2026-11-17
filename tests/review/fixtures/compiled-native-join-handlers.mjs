import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeDiagnosticState} from '../../../dist/review/abort-scope-evidence-native-diagnostic-state.js';
import {verifyHandlers,auditHandlers,verifyHandlerIdentity,verifyHandlerPrefixes,verifyHandlerPosts,verifyHandlerStops,verifyHandlerTuples,
  handlerMutants,verifyHandlerMutant,verifyHandlerAuditNegatives} from './native-join-handlers-model.mjs';

// Fixed dist only: no source fallback, product friend, native resource or closure invocation.
const js=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.js',import.meta.url),'utf8');
assert.deepEqual(verifyHandlers(js,createNativeDiagnosticState),{roles:2,functionsPerRole:3,tuplesPerRole:1,closureCalls:0,work:0,publication:0,dispatch:0});
assert.deepEqual(auditHandlers(js),{work:0,closureCalls:0,publication:0,dispatch:0});
assert.equal(verifyHandlerAuditNegatives(js),6);
assert.deepEqual(verifyHandlerIdentity(js,createNativeDiagnosticState),{entries:24,posts:48,reused:0,hooks:0});
assert.deepEqual(verifyHandlerPrefixes(js,createNativeDiagnosticState),{prefixes:24,regenerated:0,closureCalls:0});
assert.deepEqual(verifyHandlerPosts(js,createNativeDiagnosticState),{posts:62,entries:10,drifts:7,hooks:0});
assert.deepEqual(verifyHandlerStops(js,createNativeDiagnosticState),{stops:24,reentries:2,closureCalls:0});
assert.deepEqual(verifyHandlerTuples(js,createNativeDiagnosticState),{refusals:12,hooks:0});
for(let i=0;i<handlerMutants.length;i++)verifyHandlerMutant(js,createNativeDiagnosticState,i);
const declarations=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.d.ts',import.meta.url),'utf8');
for(const name of ['JoinObserverArgs','JoinHandlersDetail','prepareJoinHandlers','preparedHandlersMatched','handlerOriginMatched'])assert(!declarations.includes(name),'private handler contract escaped');
console.log('JR-B handlers compiled: 2 roles; 24 identity refusals, 48 post bindings, 24 partial prefixes, 62 field posts, 10 entry fields, 7 drifts, 24 stops, 2 reentries, 12 tuple refusals; '+handlerMutants.length+' mutants; closure/Promise/observation/publication/dispatch 0 PASS');
