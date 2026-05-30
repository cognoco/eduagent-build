import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { appBaseUrl, runId } from './helpers/runtime';

// Ad-hoc config for the parent-persona screenshot crawl. Runs `setup` (to seed
// owner-with-children + write its seed JSON / storage state) then the crawl in
// ONE process, with NO globalTeardown so .auth is not wiped mid-run. Reuses the
// already-running static web server on :19006 (reuseExistingServer).

const e2eWebDir = path.join(process.cwd(), 'apps', 'mobile', 'e2e-web');
const mobileDir = path.join(process.cwd(), 'apps', 'mobile');

export default defineConfig({
  testDir: e2eWebDir,
  outputDir: path.join(e2eWebDir, 'test-results'),
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  timeout: 300_000,
  expect: { timeout: 15_000 },
  metadata: { runId },
  globalSetup: path.join(e2eWebDir, 'helpers', 'global-setup.ts'),
  use: {
    actionTimeout: 15_000,
    baseURL: appBaseUrl,
    headless: true,
    navigationTimeout: 120_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 1080 },
  },
  webServer: [
    {
      command: 'node e2e-web/helpers/serve-exported-web.mjs',
      cwd: mobileDir,
      url: appBaseUrl,
      reuseExistingServer: true,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 240_000,
    },
  ],
  projects: [
    {
      name: 'setup',
      testMatch: /helpers[\\/]auth\.setup\.ts/,
      fullyParallel: false,
    },
    {
      name: 'parent-ux',
      dependencies: ['setup'],
      testMatch: /flows[\\/]parent-ux-pass\.spec\.ts/,
      use: {
        storageState: path.join(e2eWebDir, '.auth', 'owner-with-children.json'),
      },
    },
  ],
});
