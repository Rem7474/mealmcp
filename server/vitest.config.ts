import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/db/schema/**'],
      reporter: ['text-summary', 'lcov'],
      // A floor, not a goal: raise it when coverage rises. A drop below it fails CI.
      thresholds: { lines: 92, functions: 75, statements: 88, branches: 84 },
    },
  },
});
