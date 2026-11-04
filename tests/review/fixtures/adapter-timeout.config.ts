import { defineConfig } from 'vitest/config';
import base from './selection-timeout.config.js';

// Keep the adapter cases separate from the existing selection reproducer's name filters.
export default defineConfig({ ...base, test: { ...base.test, include: ['tests/review/fixtures/adapter-timeout.cases.ts'] } });
