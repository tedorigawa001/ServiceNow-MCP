import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.test.ts'],
    setupFiles: ['./tests/e2e/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Every E2E file talks to the same live instance. Running files in
    // parallel piles concurrent writes (and their async business rules) onto
    // one PDI and produced spurious 30 s timeouts; sequential is reliable.
    fileParallelism: false,
  }
});
