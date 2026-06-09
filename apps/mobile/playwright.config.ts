import path from 'node:path';
import fs from 'node:fs';
import { defineConfig } from '@playwright/test';
import { apiBaseUrl, appBaseUrl, runId } from './e2e-web/helpers/runtime';

// WI-536 flaky-test quarantine: exclude registered flaky web-e2e specs from the
// PR gate. The single source of truth is tools/quarantine/quarantine.json. The
// canonical path->regex helper is tools/quarantine/registry.cjs (shared by the
// Jest configs); it is mirrored inline here because this config loads in ESM
// mode, where a CommonJS require of the helper would flip the module mode and
// break the CJS imports above. Returns [] under QUARANTINE_MODE=report so the
// non-gating report lane runs exactly the specs the gate skips.
function quarantineIgnore(): RegExp[] {
  if (process.env.QUARANTINE_MODE === 'report') return [];
  try {
    const file = path.join(
      process.cwd(),
      'tools',
      'quarantine',
      'quarantine.json',
    );
    const reg = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      entries?: Array<{ runner?: string; path?: string }>;
    };
    return (reg.entries ?? [])
      .filter((e) => e && e.runner === 'playwright' && e.path)
      .map(
        (e) =>
          new RegExp(
            String(e.path)
              .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              .replace(/\//g, '[/\\\\]') + '$',
          ),
      );
  } catch {
    return [];
  }
}

const e2eWebDir = path.join(process.cwd(), 'apps', 'mobile', 'e2e-web');
const mobileDir = path.join(process.cwd(), 'apps', 'mobile');
const shouldStartLocalApi = process.env.PLAYWRIGHT_SKIP_LOCAL_API !== '1';

// [BUG-325] Worker-count discriminator. We previously inferred "is this the
// shared *.workers.dev staging API?" by substring-matching the API URL —
// fragile because it false-negatives the moment staging moves behind a
// custom domain (e.g. api-stg.mentomate.com), at which point CI silently
// downshifts/upshifts worker count without any signal.
//
// The supported way to declare the test-target environment is now an
// explicit env var:
//   E2E_ENV=local       → full parallelism (4 workers)
//   E2E_ENV=staging-cf  → shared *.workers.dev API, rate-limited → 1 worker
//   E2E_ENV=staging     → custom-domain staging (no rate limit) → 4 workers
//   E2E_ENV=production  → never used in CI today; reserved
// When E2E_ENV is unset we fall back to the legacy URL-substring heuristic
// so existing local invocations keep working, but CI workflows must set
// E2E_ENV explicitly.
//
// [BUG-326] If you change CI's E2E_API_URL to point at a non-rate-limited
// backend (custom domain, dedicated test cluster), set E2E_ENV=staging on
// the same workflow so the 4-worker path is selected. Future contributors
// will revert this without context otherwise — keep this comment block
// alongside the workflow-level E2E_API_URL change.
type E2eEnv = 'local' | 'staging-cf' | 'staging' | 'production';
const rawE2eEnv = process.env.E2E_ENV;
const e2eEnv: E2eEnv | undefined =
  rawE2eEnv === 'local' ||
  rawE2eEnv === 'staging-cf' ||
  rawE2eEnv === 'staging' ||
  rawE2eEnv === 'production'
    ? rawE2eEnv
    : undefined;

// Whether the active target is a *rate-limited* shared API. Only
// E2E_ENV=staging-cf (the platform-throttled *.workers.dev hostname) is
// rate-limited today; everything else gets full parallelism.
const usesRateLimitedApi: boolean =
  e2eEnv === 'staging-cf' ||
  // Legacy fallback for invocations that haven't migrated to E2E_ENV yet.
  // Once all callers set E2E_ENV explicitly, this branch can be deleted.
  (e2eEnv === undefined &&
    process.env.PLAYWRIGHT_SKIP_LOCAL_API === '1' &&
    apiBaseUrl.includes('.workers.dev'));

export default defineConfig({
  testDir: e2eWebDir,
  // WI-536 flaky-test quarantine: exclude registered flaky specs from the gate.
  testIgnore: quarantineIgnore(),
  outputDir: path.join(e2eWebDir, 'test-results'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // [BUG-325/BUG-326] Worker count is driven by `usesRateLimitedApi` (set
  // above from the typed E2E_ENV discriminator), NOT a URL substring match.
  // Shared *.workers.dev throttles parallel bursts → 1 worker; everything
  // else (custom-domain staging, local API) gets the full 4 workers.
  workers: process.env.CI ? (usesRateLimitedApi ? 1 : 4) : undefined,
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
    launchOptions: {
      args: ['--disable-quic'],
    },
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
      // [BUG-327] `fullyParallel: false` is intentional and load-bearing.
      // The setup project seeds each storage-state file (solo-learner.json,
      // owner-with-children.json, …) by logging in as a fixed test user
      // through Clerk and writing the resulting session token. Running
      // those setups in parallel against the same Clerk identity races on
      // session creation (Clerk invalidates prior tokens on a second
      // setActive for the same user), which manifests as flaky 401s in the
      // downstream smoke projects that consume those storage states.
      // Keep this serial — the whole point of the setup project is that it
      // establishes state preconditions for everything else, and the cost
      // of one-shot serial runs is negligible compared to flaky auth.
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
      name: 'auth-access',
      dependencies: ['setup'],
      testMatch:
        /flows[\\/]auth[\\/](a02-signup-verification-ui|a03-forgot-password-ui|a05-mfa-verification-ui|a14-slow-auth-spinner)\.spec\.ts/,
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
      // Both branches now match j08–j99 so new inventory specs (j24+) are
      // included in the default run without requiring PLAYWRIGHT_INCLUDE_P1B.
      // The P1B branch is retained for forward-compat; the non-P1B branch has
      // been widened from j1[0-9] to j[1-9][0-9] to include j20-j99.
      testMatch:
        /flows[\\/](journeys[\\/](j0[89]|j[1-9][0-9])-.*|auth[\\/]w03-.*|navigation[\\/]w0[1-5]-.*)\.spec\.ts/,
    },
    {
      // [Mentor Chrome audit seed pack — Task 5]
      // docs/plans/2026-05-25-mentor-chrome-audit-seed-pack.md
      //
      // Iterates over `mentorAuditScenarios` in e2e-web/fixtures/scenarios.ts.
      // One test per registry entry. Each test seeds, signs in (or applies a
      // storage-state mutator for pre-shell entries), and asserts the
      // documented landing testID is visible.
      //
      // **Opt-in.** Not in the default smoke run. Invoke with:
      //   pnpm exec playwright test --project=mentor-audit-registry-smoke
      // CI invokes this twice (once per nav-contract flag position) — see
      // the MENTOR_AUDIT_NAV_V1 env var consumed by the spec.
      //
      // No `dependencies: ['setup']` because each test seeds its own state
      // — the smoke project is intentionally independent of the long-lived
      // `solo-learner` / `owner-with-children` storage states so a single
      // mentor-audit failure can't poison the rest of the suite.
      name: 'mentor-audit-registry-smoke',
      // Matches every spec under flows/mentor-audit/ — `registry-smoke.spec.ts`
      // (landing assertions) and `bridge-backstack.spec.ts` (BRIDGE-04 backstack
      // contract). New mentor-audit specs added here in future inherit the
      // same opt-in invocation rules.
      testMatch: /flows[\\/]mentor-audit[\\/].+\.spec\.ts/,
      fullyParallel: false,
    },
  ],
});
