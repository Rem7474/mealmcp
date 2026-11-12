import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/db/schema/**'],
      reporter: ['text-summary', 'lcov'],
      // A floor, not a goal: raise it when coverage rises. A drop below it fails CI.
      thresholds: { lines: 85, functions: 70, statements: 80, branches: 75 },
    },
  },
});
