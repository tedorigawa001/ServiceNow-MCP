import { defineConfig } from 'vitest/config';
import type { Reporter } from 'vitest/node';
import { writeFileSync } from 'node:fs';
let summaryPath: string;
const lifecycleReporter: Reporter = {
  onInit(context) {
    if (typeof context.config.outputFile !== 'string') throw Error('repro_output_file_required');
    summaryPath = context.config.outputFile + '.lifecycle.json';
  },
  onTestRunEnd(_modules, errors) {
    // The stock JSON reporter omits unhandled errors; record a count, never their content.
    writeFileSync(summaryPath, JSON.stringify({ unhandled_errors: errors.length }), { flag: 'wx' });
  },
};
// Isolated reproducer only: never loaded by npm test's normal configuration.
export default defineConfig({ test: { include: ['tests/review/fixtures/selection-timeout.cases.ts'],
  // Keep every reproducer thread inside the owned child process, including on watchdog termination.
  pool: 'threads', maxWorkers: 1, isolate: true, testTimeout: 5000, hookTimeout: 5000, reporters: ['json', lifecycleReporter] } });
