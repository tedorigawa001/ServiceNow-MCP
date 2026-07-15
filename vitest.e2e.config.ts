import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.test.ts'],
    setupFiles: ['./tests/e2e/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  }
});
