/** Development-only worker. Not imported or shipped by the production review worker. */
import {parentPort} from 'node:worker_threads';
import {createFixtureScopeWorkerEngine} from './abort-scope-evidence-worker-core.js';
if(!parentPort)throw Error('worker_unavailable');
const engine=createFixtureScopeWorkerEngine();
parentPort.on('message',wire=>{const reply=engine.handle(wire);if(reply===null){engine.close();parentPort!.close();}else parentPort!.postMessage(reply);});
parentPort.postMessage({type:'review_worker_ready'});
