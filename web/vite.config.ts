import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In dev the UI runs on Vite and talks to the backend on :3000.
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/i18n/en.ts', 'src/i18n/fr.ts'],
      reporter: ['text-summary', 'lcov'],
      thresholds: { lines: 14, functions: 10, statements: 14, branches: 9 },
    },
  },
});
