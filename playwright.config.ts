import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const PORT = 3100;
if (!process.env.PLAYWRIGHT_RUN_ID) process.env.PLAYWRIGHT_RUN_ID = `${process.pid}-${Date.now()}`;
const DB_PATH = join(tmpdir(), `mealmcp-e2e-${process.env.PLAYWRIGHT_RUN_ID}`, 'test.db');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node server/dist/index.js',
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      PUBLIC_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PATH: DB_PATH,
      LOG_LEVEL: 'warn',
    },
  },
});
