import { defineConfig } from 'vitest/config';

// These files start real tsx checker/host children that must report within the product's fixed
// 5 s preflight caps. Run them after the rest of the suite, on few workers, so the suite's own
// parallel load does not eat that margin.
const realHost = [
  'tests/review/r2-loopback.test.ts', 'tests/review/r2-launcher-run.test.ts', 'tests/review/r2-approved-launch.test.ts',
  'tests/review/r2-launcher-entry.test.ts', 'tests/review/r2-plan-check.test.ts', 'tests/review/r2-launcher-check-plan.test.ts',
  'tests/review/r2-supervisor.test.ts', 'tests/review/r2-bound-host.test.ts',
];

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Nested agent worktrees hold separate checkouts; never collect their tests into this run.
    exclude: ['node_modules/**', 'tests/e2e/**', 'tests/transport/**', '.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/', 'dist/']
    },
    projects: [
      { extends: true, test: { name: 'unit', exclude: realHost } },
      { extends: true, test: { name: 'real-host', include: realHost, sequence: { groupOrder: 1 }, maxWorkers: 3, testTimeout: 30_000 } },
    ],
  }
});
