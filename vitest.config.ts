import { defineConfig } from 'vitest/config';

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
    }
  }
});
