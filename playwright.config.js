import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser', workers: 1,
  outputDir: '.scratch/test-results',
  use: { baseURL: 'http://127.0.0.1:4317', channel: 'msedge', headless: true },
  webServer: { command: 'node server.mjs', url: 'http://127.0.0.1:4317', reuseExistingServer: true }
});
