import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser', workers: 1,
  outputDir: '.scratch/test-results',
  use: { baseURL: 'http://127.0.0.1:4318', channel: 'msedge', headless: true },
  webServer: { command: 'npm start', env: { PORT: '4318' }, url: 'http://127.0.0.1:4318', reuseExistingServer: false }
});
