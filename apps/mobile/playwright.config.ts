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
const artifactLane = process.env.PLAYWRIGHT_ARTIFACT_LANE;
if (artifactLane && artifactLane !== 'legacy') {
  throw new Error(
    `PLAYWRIGHT_ARTIFACT_LANE must be "legacy" when set; received ${JSON.stringify(artifactLane)}`,
  );
}
const artifactSuffix = artifactLane === 'legacy' ? '-legacy' : '';

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
  outputDir: path.join(e2eWebDir, `test-results${artifactSuffix}`),
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
        outputFolder: path.join(
          e2eWebDir,
          `playwright-report${artifactSuffix}`,
        ),
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
      // WI-2228 V2 release gate: keep the stable J-01 learner-home baseline
      // and future batch flows isolated from legacy smoke projects.
      name: 'v2-release',
      dependencies: ['setup'],
      testMatch:
        /flows[\\/](?:v2[\\/].+|journeys[\\/]j01-learner-home)\.spec\.ts/,
      // Config F requires its own flag-built export; WI-2385 owns the final
      // expanded-lane/full-suite verification, so this isolated V2 project excludes it.
      testIgnore: [...quarantineIgnore(), /flows[\\/]config-f[\\/]/],
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
      name: 'smoke-accessibility',
      dependencies: ['setup'],
      testMatch: /flows[\\/]accessibility[\\/]quiz-results-exits\.spec\.ts/,
      fullyParallel: false,
      use: {
        storageState: path.join(e2eWebDir, '.auth', 'solo-learner.json'),
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
      // [WI-1317] child-subject route real e2e coverage
      // (apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx).
      // Asserts against the route's actual rendered testIDs
      // (subject-topics-scroll, topic-card-*) using the real
      // `parent-multi-child` seed (owner-with-children storage state).
      //
      // **Opt-in / non-gating.** Deliberately NOT matched by 'later-phases'
      // (that project's navigation testMatch is scoped to w0[1-5], not w06)
      // and NOT part of `test:e2e:web:smoke` in package.json, so it is not
      // exercised by the "Playwright web smoke" CI job at all — it only runs
      // when explicitly targeted. Run manually against staging via:
      //   doppler run -c stg -- pnpm exec playwright test \
      //     -c apps/mobile/playwright.config.ts --project=child-subject-detail
      name: 'child-subject-detail',
      dependencies: ['setup'],
      testMatch: /flows[\\/]navigation[\\/]w06-child-subject-detail\.spec\.ts/,
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
    {
      // [WI-1307 / M4-C7] Config F (V1-on/V2-off) nav-shell smoke.
      // docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md — proves the
      // `fallback` EAS Update channel's flag posture (apps/mobile/eas.json
      // build.fallback) renders the V1 shell (recaps tab) with no V2 tabs.
      //
      // **Opt-in.** Not in the default smoke run, and requires the web export
      // itself to be built with the Config F flags (this project does not
      // override them — `serve-exported-web.mjs` reads process.env at export
      // time). Invoke with:
      //   EXPO_PUBLIC_ENABLE_MODE_NAV=true \
      //   EXPO_PUBLIC_ENABLE_MODE_NAV_V1=true \
      //   EXPO_PUBLIC_ENABLE_MODE_NAV_V2=false \
      //   pnpm exec playwright test -c apps/mobile/playwright.config.ts --project=config-f-smoke
      name: 'config-f-smoke',
      dependencies: ['setup'],
      testMatch: /flows[\\/]config-f[\\/].+\.spec\.ts/,
      fullyParallel: false,
    },
  ],
});
