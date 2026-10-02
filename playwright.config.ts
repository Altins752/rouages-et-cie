import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'pc-clair', use: { browserName: 'chromium', colorScheme: 'light' } },
    { name: 'pc-sombre', use: { browserName: 'chromium', colorScheme: 'dark' } },
  ],
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
