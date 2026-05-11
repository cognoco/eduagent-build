import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { apiBaseUrl, appBaseUrl, runId } from './helpers/runtime';

const e2eWebDir = path.join(process.cwd(), 'apps', 'mobile', 'e2e-web');
const mobileDir = path.join(process.cwd(), 'apps', 'mobile');
const shouldStartLocalApi = process.env.PLAYWRIGHT_SKIP_LOCAL_API !== '1';

export default defineConfig({
  testDir: e2eWebDir,
  outputDir: path.join(e2eWebDir, 'test-results'),
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  timeout: 240_000,
  expect: {
    timeout: 15_000,
  },
  metadata: {
    runId,
  },
  globalSetup: path.join(e2eWebDir, 'helpers', 'global-setup.ts'),
  use: {
    actionTimeout: 15_000,
    baseURL: appBaseUrl,
    headless: process.env.PLAYWRIGHT_HEADED === '1' ? false : true,
    navigationTimeout: 120_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 390, height: 844 },
  },
  webServer: [
    ...(shouldStartLocalApi
      ? [
          {
            command: 'pnpm --dir ../api exec wrangler dev --port 8787',
            cwd: mobileDir,
            url: `${apiBaseUrl}/v1/health`,
            reuseExistingServer: !process.env.CI,
            stdout: 'pipe' as const,
            stderr: 'pipe' as const,
            timeout: 120_000,
          },
        ]
      : []),
    {
      command: 'node e2e-web/helpers/serve-exported-web.mjs',
      cwd: mobileDir,
      url: appBaseUrl,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 240_000,
    },
  ],
  projects: [
    {
      name: 'manual-learner-ux',
      testMatch: /flows[\\/]journeys[\\/]j01-ux-pass\.spec\.ts/,
    },
  ],
});
