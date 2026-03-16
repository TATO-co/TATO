import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_WEB_PORT ?? 4173);

export default defineConfig({
  testDir: './tests/web',
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/web/static-export-server.mjs',
    url: `http://127.0.0.1:${port}/sign-in`,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 240_000,
  },
});
