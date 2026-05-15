import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { apiBaseUrl, appBaseUrl, runId } from './e2e-web/helpers/runtime';

const e2eWebDir = path.join(process.cwd(), 'apps', 'mobile', 'e2e-web');
const shouldStartLocalApi = process.env.PLAYWRIGHT_SKIP_LOCAL_API !== '1';
// *.workers.dev URLs are platform-rate-limited → 1 worker.
// Custom domains (api-test.mentomate.com) are not → full parallelism.
// Switching CI to a custom domain intentionally enables 4 workers —
// that is the desired behavior, not a bug. See p5-execution-status.md.
const usesSharedStagingApi =
  process.env.PLAYWRIGHT_SKIP_LOCAL_API === '1' &&
  apiBaseUrl.includes('.workers.dev');

export default defineConfig({
  testDir: e2eWebDir,
  outputDir: path.join(e2eWebDir, 'test-results'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Shared *.workers.dev rate-limits parallel bursts; custom domains and local
  // API are not rate-limited, so they can use full parallelism.
  workers: process.env.CI ? (usesSharedStagingApi ? 1 : 4) : undefined,
  reporter: [
    ['line'],
    [
      'html',
      {
        open: 'never',
        outputFolder: path.join(e2eWebDir, 'playwright-report'),
      },
    ],
  ],
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  metadata: {
    runId,
  },
  use: {
    actionTimeout: 15_000,
    baseURL: appBaseUrl,
    headless: process.env.PLAYWRIGHT_HEADED === '1' ? false : true,
    navigationTimeout: 120_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 1080 },
  },
  globalSetup: path.join(e2eWebDir, 'helpers', 'global-setup.ts'),
  globalTeardown: path.join(e2eWebDir, 'helpers', 'global-teardown.ts'),
  webServer: [
    ...(shouldStartLocalApi
      ? [
          {
            command: 'pnpm --dir ../api exec wrangler dev --port 8787',
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
      url: appBaseUrl,
      // CI (false): always export a fresh bundle — prevents stale API URL
      // from a prior run being silently reused. Safe at 1 worker (CI smoke).
      // Local (true): allows external server startup for multi-worker runs
      // where Playwright's pipe management would otherwise kill the server.
      reuseExistingServer: !process.env.CI,
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
      name: 'smoke-auth',
      // [BUG-754] Sign-up form smoke joins the auth-navigation spec under the
      // same anonymous (no setup dependency) project. Both target /sign-in or
      // /sign-up and don't require a seeded session.
      testMatch: /flows[\\/]auth[\\/](auth-navigation|sign-up-flow)\.spec\.ts/,
    },
    {
      name: 'smoke-learner',
      dependencies: ['setup'],
      testMatch: /flows[\\/]journeys[\\/]j01-.*\.spec\.ts/,
      use: {
        storageState: path.join(e2eWebDir, '.auth', 'solo-learner.json'),
      },
    },
    {
      name: 'smoke-parent',
      dependencies: ['setup'],
      testMatch: /flows[\\/]journeys[\\/]j03-.*\.spec\.ts/,
      use: {
        storageState: path.join(e2eWebDir, '.auth', 'owner-with-children.json'),
      },
    },
    {
      name: 'role-transitions',
      dependencies: ['setup'],
      testMatch: /flows[\\/]journeys[\\/]j0[4-7]-.*\.spec\.ts/,
      use: {
        storageState: path.join(e2eWebDir, '.auth', 'owner-with-children.json'),
      },
    },
    {
      name: 'later-phases',
      dependencies: ['setup'],
      testMatch:
        /flows[\\/](journeys[\\/](j0[89]|j1[0-9]|j2[0-9])-.*|auth[\\/]w03-.*|navigation[\\/]w0[1-5]-.*)\.spec\.ts/,
    },
  ],
});
