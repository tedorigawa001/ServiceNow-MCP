// Synthetic child only. Parent supplies a non-secret temporary manifest path, never credentials.
import { runR2ApprovalManifest } from '../../../src/review/r2-runner.ts';
const result = await runR2ApprovalManifest(process.argv[2], {
  fetch: async () => { throw Error('SYNTHETIC_NETWORK_FORBIDDEN'); },
  onReady: () => { process.send?.({ ready: true }); },
});
process.send?.({ done: true, result });
process.disconnect?.();
