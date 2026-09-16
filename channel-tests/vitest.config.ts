import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  test: {
    globals: true,
    globalSetup: ['./global-setup.ts'],
    setupFiles: ['./setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ['./**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
  },
});