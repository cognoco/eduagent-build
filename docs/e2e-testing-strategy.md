# EduAgent — E2E Testing Strategy

**Type:** Spike (planning deliverable)
**Date:** 2026-02-17
**Status:** Active

---

## Context

The project has 1,631 unit/service tests (1,300 API + 331 mobile; Jest 30, co-located) plus 3 API integration test suites covering Epics 0-5. No E2E or integration test framework exists yet. The architecture doc explicitly removed Playwright (web E2E) from the fork and noted "Detox or Maestro for mobile E2E later." This document defines the strategy.

---

## 1. Mobile E2E: Maestro

### Why Maestro

| Consideration | Maestro | Detox |
|--------------|---------|-------|
| Expo compatibility | Works with Expo Go, dev builds, and EAS builds | Requires ejected or dev build (no Expo Go) |
| Test authoring | YAML-based, no JavaScript runtime needed | JavaScript/TypeScript, needs Jest |
| Learning curve | Minimal — declarative flows | Moderate — async/await patterns, element matchers |
| CI integration | Maestro Cloud or self-hosted CLI | Self-hosted only |
| Flakiness | Built-in wait/retry, tolerance for animations | Manual waits, explicit animation disabling |
| Platform support | iOS + Android from same YAML | iOS + Android from same JS (but platform quirks) |

**Recommendation:** Maestro. The YAML-based approach keeps E2E tests readable without adding JS test complexity. It runs against Expo Go during development and against EAS dev builds in CI.

### Example Flow: Sign-Up to Consent

```yaml
# e2e/flows/onboarding/sign-up-consent.yaml
appId: com.eduagent.mobile
---
- launchApp
- tapOn: "Get Started"
- inputText:
    id: "email-input"
    text: "test-e2e@example.com"
- inputText:
    id: "password-input"
    text: "SecurePass123!"
- tapOn: "Create Account"
- assertVisible: "We need your parent's consent"
- inputText:
    id: "parent-email-input"
    text: "parent-e2e@example.com"
- tapOn: "Send Consent Request"
- assertVisible: "Waiting for parent approval"
```

### `testID` Convention for Maestro Selectors

Maestro locates elements via `testID` props (React Native) or accessibility labels. The mobile codebase already has **200+ `testID` attributes** following a consistent `kebab-case` pattern. Formalize this:

**Naming convention:** `{context}-{element}` in kebab-case.

| Pattern | Example | Component |
|---------|---------|-----------|
| `{screen}-{action}` | `sign-in-button`, `sign-out-button` | Auth screens |
| `{screen}-{element}` | `create-subject-cancel`, `delete-account-confirm` | Action screens |
| `{component}-{part}` | `profile-switcher-chip`, `profile-switcher-menu` | Shared components |
| `{feature}-{state}` | `learning-book-loading`, `learning-book-empty` | Loading/empty states |
| `{element-type}` | `chat-input`, `send-button`, `camera-view` | Inline elements |

**Rules:**
- All interactive elements (buttons, inputs, toggleable) **must** have a `testID`.
- Use `accessibilityLabel` when the same string serves both a11y and E2E targeting (preferred for text-bearing elements).
- Prefer `testID` for non-text elements (containers, loading indicators) where an accessibility label would be meaningless.
- In Maestro YAML, reference via `id:` (maps to `testID`) or `tapOn:` (matches visible text / `accessibilityLabel`).

### Nx Integration

Add a custom `e2e` target using `nx:run-commands`. Maestro flows live in `apps/mobile/e2e/`.

```
apps/mobile/
  e2e/
    flows/
      onboarding/
        sign-up-consent.yaml
        interview-curriculum.yaml
      learning/
        start-session.yaml
        homework-help.yaml
      retention/
        recall-review.yaml
      parent/
        dashboard-progress.yaml
    config.yaml          # Maestro config (app ID, timeouts)
```

Nx target (add to mobile's inferred targets via `nx.json` `targetDefaults` or a `project.json`):

```json
{
  "e2e": {
    "executor": "nx:run-commands",
    "options": {
      "command": "maestro test e2e/flows/",
      "cwd": "apps/mobile"
    },
    "configurations": {
      "smoke": {
        "command": "maestro test e2e/flows/ --include-tags=smoke"
      }
    }
  }
}
```

---

## 2. API Integration Tests

### Approach: Hono `app.request()`

Hono provides `app.request(url, init, env)` which exercises the full middleware chain (auth, validation, error handling) without starting an HTTP server. This is the recommended approach for API integration tests.

```typescript
// tests/integration/onboarding.integration.test.ts
import { app } from '../../apps/api/src/index.js';
import { buildRegisterInput } from '@eduagent/factory';

// Mock JWT verification — avoids real Clerk JWKS fetch
jest.mock('../../apps/api/src/middleware/jwt', () => ({
  decodeJWTHeader: jest.fn().mockReturnValue({ alg: 'RS256', kid: 'test-kid' }),
  fetchJWKS: jest.fn().mockResolvedValue({
    keys: [{ kty: 'RSA', kid: 'test-kid', n: 'fake-n', e: 'AQAB' }],
  }),
  verifyJWT: jest.fn().mockResolvedValue({
    sub: 'user_integration_test',
    email: 'integration@test.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }),
}));

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
};

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

test('register -> create profile -> consent flow', async () => {
  const input = buildRegisterInput();
  const res = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify(input),
  }, TEST_ENV);
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.profileId).toBeDefined();
});
```

> **Auth mocking pattern:** Integration tests mock `middleware/jwt.ts` to bypass Clerk JWKS verification. The `verifyJWT` mock returns a valid payload so the auth middleware sets `c.set('user', { userId, email })`. Pass `TEST_ENV` as the third argument to `app.request()` to provide Cloudflare Workers-style env bindings. See `tests/integration/onboarding.integration.test.ts` for the full working example.

### Test Database Strategy

The CI pipeline already uses a PostgreSQL 16 service container (see `.github/workflows/ci.yml`). Integration tests use this same approach:

| Environment | Database | Notes |
|------------|----------|-------|
| **CI** | GitHub Actions PostgreSQL service container | Already configured. Schema applied via `pnpm --filter @eduagent/database db:push`. |
| **Local dev** | Docker Compose PostgreSQL | `docker compose up -d postgres` for local integration test runs. |
| **Neon branching** | Reserved for staging/preview deploys | Not used for CI — local PostgreSQL is faster and free. |

### Seeding and Teardown

Use `@eduagent/factory` builders for seeding.

> **Driver constraint:** The project uses `@neondatabase/serverless` with the **neon-http** driver (`drizzle-orm/neon-http`), which is stateless and **does not support transactions**. Each query is an independent HTTP request — there is no persistent connection to hold a transaction open. The codebase intentionally avoids transactions, relying on `profileId` scoping for isolation and Inngest steps for durable multi-step operations.

**Recommended isolation strategies:**

| Strategy | When to use |
|----------|-------------|
| **DELETE cleanup in `afterEach`** | Default for most integration tests. Insert via factory, delete by known IDs after test. Simple and works with neon-http. |
| **Fresh database per CI run** | Already configured — GitHub Actions PostgreSQL service container provides a clean database each workflow run. |
| **`__test/reset` endpoint** | For Maestro E2E flows that need a clean slate between scenarios. Truncates all tables (test-only, guarded by `NODE_ENV=test`). |
| **Per-test schema isolation** | For tests that must avoid cross-test interference within the same run. `CREATE SCHEMA test_<uuid>`, run queries against it, `DROP SCHEMA CASCADE` in teardown. |

```typescript
// Example: DELETE cleanup pattern (works with neon-http)
import { createDatabase } from '@eduagent/database';
import { profiles } from '@eduagent/database';
import { eq } from 'drizzle-orm';

const TEST_DB_URL = process.env['DATABASE_URL']!;
const db = createDatabase(TEST_DB_URL);

const createdIds: string[] = [];

afterEach(async () => {
  for (const id of createdIds) {
    await db.delete(profiles).where(eq(profiles.id, id));
  }
  createdIds.length = 0;
});
```

If transaction support becomes necessary in the future, migration to the **neon-serverless WebSocket driver** (`drizzle-orm/neon-serverless`) would be required — but current architecture avoids this need.

### Inngest Integration Tests

Test Inngest functions by **extracting the handler** via `(fn as any).fn` and passing a mock step object from `@eduagent/test-utils`. This is the established pattern used by all 9 existing Inngest test suites in the project:

```typescript
import { sessionCompleted } from '../../apps/api/src/inngest/functions/session-completed.js';
import { createInngestStepMock } from '@eduagent/test-utils';

// Mock service dependencies (not the Inngest framework)
jest.mock('../../apps/api/src/services/retention', () => ({
  updateRetentionFromSession: jest.fn().mockResolvedValue(undefined),
}));

function createEventData(overrides = {}) {
  return {
    data: {
      sessionId: 'session-001',
      profileId: 'profile-001',
      ...overrides,
    },
  };
}

async function executeSteps(eventData = createEventData()) {
  const step = createInngestStepMock();
  const handler = (sessionCompleted as any).fn;
  const result = await handler({ event: eventData, step });
  return { result, step };
}

test('session.completed triggers SM-2 + coaching card + dashboard', async () => {
  const { result, step } = await executeSteps();

  expect(result.status).toBe('completed');
  expect(step.run).toHaveBeenCalledWith('update-retention', expect.any(Function));
  expect(step.run).toHaveBeenCalledWith('write-coaching-card', expect.any(Function));
  expect(step.run).toHaveBeenCalledWith('record-activity', expect.any(Function));
});

test('continues chain when one step fails (error isolation)', async () => {
  const mockRetention = require('../../apps/api/src/services/retention');
  mockRetention.updateRetentionFromSession.mockRejectedValueOnce(
    new Error('DB timeout')
  );

  const { result } = await executeSteps();
  // Other steps ran despite retention failure
  expect(result.status).toBe('completed-with-errors');
});
```

> **Why not `inngest.test()`?** Inngest v3 does not provide a built-in `inngest.test()` method. The project's pattern — direct handler invocation with `createInngestStepMock()` — is simpler, faster, and fully deterministic. The mock step's `run` method executes callbacks immediately, matching Inngest's step-at-a-time behavior. See `apps/api/src/inngest/functions/session-completed.test.ts` for the full 250+ line example.

---

## 3. Smoke Test Matrix

Critical user flows, prioritized by risk and user impact. Tag flows as `smoke` (PR-level) or `full` (nightly).

### Tier 1: Smoke (run on every PR)

| Flow | Steps | Tags |
|------|-------|------|
| **Onboarding** | Sign-up -> age gate -> consent request -> parent approval -> profile creation | `smoke, onboarding` |
| **First Session** | Create subject -> interview -> curriculum generated -> first coaching card visible | `smoke, learning` |
| **Core Learning** | Start session -> exchange 3 messages -> understanding check -> session close -> summary displayed | `smoke, learning` |
| **Retention** | Recall prompt -> answer -> SM-2 score -> next review date scheduled -> streak incremented | `smoke, retention` |

### Tier 2: Full (nightly)

| Flow | Steps | Tags |
|------|-------|------|
| **Assessment Cycle** | Recall test -> explain reasoning -> transfer question -> XP awarded (pending) -> delayed recall -> XP verified | `full, assessment` |
| **Failed Recall** | 3x failed recall -> Learning Book redirect -> "Relearn Topic" -> different method -> re-test after 24h | `full, remediation` |
| **Homework Help** | Camera capture -> OCR -> homework chat -> Socratic guidance (no direct answers) -> session marked "guided" | `full, homework` |
| **Parent Dashboard** | Switch to parent persona -> view child progress -> see retention bars -> update notification prefs | `full, parent` |
| **Multi-Subject** | Add second subject -> switch subjects -> pause first -> auto-archive check -> restore | `full, subjects` |
| **Subscription** | Start trial -> trial expiry warning -> upgrade to Plus -> quota visible -> top-up purchase | `full, billing` |
| **Account Lifecycle** | Request deletion -> 7-day grace period -> cancel deletion -> re-request -> deletion executes -> data purged | `full, gdpr` |
| **Adaptive Teaching** | 3 wrong answers -> direct instruction triggered -> "Needs Deepening" scheduled -> 3x success -> normal status | `full, adaptive` |

### Coverage Mapping

| Epic | Smoke Flows | Full Flows | Total |
|------|------------|------------|-------|
| Epic 0 | Onboarding | Account Lifecycle | 2 |
| Epic 1 | First Session | — | 1 |
| Epic 2 | Core Learning | Homework Help | 2 |
| Epic 3 | Retention | Assessment, Failed Recall, Adaptive | 4 |
| Epic 4 | — | Parent Dashboard, Multi-Subject | 2 |
| Epic 5 | — | Subscription | 1 |

---

## 4. CI Integration

### Pipeline Design

```
PR push
  |
  +--> ci.yml (existing)
  |     lint -> typecheck -> test -> build -> integration
  |
  +--> e2e-ci.yml (new)
        |
        +-- API integration tests (Hono app.request + PostgreSQL container)
        |     Target: pnpm exec nx run api:test:integration
        |     Trigger: affected files in apps/api/ or packages/
        |
        +-- Mobile smoke E2E (Maestro, Tier 1 only)
              Target: pnpm exec nx run mobile:e2e --configuration=smoke
              Trigger: affected files in apps/mobile/ or packages/schemas/
              Runs on: EAS dev build (pre-built, cached)

Nightly (scheduled)
  |
  +-- Full E2E suite (all Tier 1 + Tier 2 flows)
  |     Target: pnpm exec nx run mobile:e2e
  |
  +-- Full API integration suite
        Target: pnpm exec nx run api:test:integration --configuration=full
```

### Nx Affected for E2E

Use `nx affected` to skip E2E when changes don't touch relevant code:

```bash
# Only run mobile E2E if mobile or schemas changed
pnpm exec nx affected -t e2e --base=origin/main
```

### Maestro in CI

**Option A: Maestro Cloud** — Managed device farm. Upload flows + app binary, results in dashboard. Simpler setup, paid service.

**Option B: Self-hosted** — Run Maestro CLI on GitHub Actions with Android emulator. Free, but slower and requires emulator setup.

**Recommendation:** Start with self-hosted (cost-effective at MVP scale). Evaluate Maestro Cloud when nightly runs exceed 30 minutes or when iOS CI testing is needed (macOS runners are expensive).

GitHub Actions emulator setup:

```yaml
- name: Setup Android Emulator
  uses: reactivecircus/android-emulator-runner@v2
  with:
    api-level: 34
    arch: x86_64
    script: |
      maestro test apps/mobile/e2e/flows/ --include-tags=smoke
```

---

## 5. Environment Management

### Test Data

Use `@eduagent/factory` for all test data. Never hardcode IDs or values in E2E flows.

For Maestro flows, seed data via the test-only API endpoint. Maestro's `runScript` uses **GraalJS** (not Node.js), so it **cannot** `require()` or `import` npm packages like `@eduagent/factory`. Use Maestro's built-in HTTP module instead:

```
POST /v1/__test/seed   # Only available when NODE_ENV=test
POST /v1/__test/reset   # Truncate all tables
```

```yaml
# e2e/flows/_setup/seed-test-user.yaml
appId: com.eduagent.mobile
---
- runScript:
    file: ../scripts/seed.js
    env:
      API_URL: ${API_URL}
```

```javascript
// e2e/scripts/seed.js — runs in GraalJS (Maestro's embedded JS engine)
// No require() or import — use Maestro's built-in http module only
var response = http.post(API_URL + '/v1/__test/seed', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    scenario: 'onboarding-complete',
    email: 'test-e2e@example.com',
  }),
});
output.result = response.body;
```

Alternatively, run a **Node.js seed script as a CI step before Maestro starts** — this allows full access to `@eduagent/factory` builders:

```bash
# In e2e-ci.yml, before the Maestro step:
- name: Seed test data
  run: npx tsx apps/mobile/e2e/scripts/seed-ci.ts
  env:
    API_URL: http://localhost:8787
    DATABASE_URL: ${{ env.DATABASE_URL }}
```

### Isolation Between Parallel CI Runs

- **API integration tests:** DELETE cleanup per test or fresh database per CI run (neon-http driver does not support transaction rollback — see Section 2).
- **Mobile E2E:** Each CI run gets a fresh PostgreSQL database via the service container. No shared state between runs.
- **Nightly full suite:** Dedicated Neon branch created at run start, destroyed at run end (if using Neon for nightly).

### Cleanup

| Layer | Strategy |
|-------|----------|
| Unit tests | In-memory mocks — no cleanup needed |
| API integration | DELETE by known IDs in `afterEach`, or fresh DB per CI run |
| Mobile E2E (CI) | Fresh database per workflow run |
| Mobile E2E (local) | `__test/reset` endpoint or Docker Compose `down -v` |

---

## 6. File Structure

```
apps/
  api/
    project.json                    # Has test:integration target (DONE)
  mobile/
    e2e/
      flows/
        _setup/                     # Seed/teardown flows
        onboarding/                 # Epic 0 flows
        learning/                   # Epic 1-2 flows
        retention/                  # Epic 3 flows
        parent/                     # Epic 4 flows
        billing/                    # Epic 5 flows
      scripts/                      # GraalJS helpers for Maestro runScript (no Node.js APIs)
      config.yaml
tests/
  integration/                      # API integration tests (DONE — 3 suites exist)
    jest.config.cjs                 # ts-jest, maps @eduagent/* to source paths
    setup.ts                        # Mock LLM provider, 30s timeout
    auth-chain.integration.test.ts  # Auth middleware chain validation
    health-cors.integration.test.ts # Health check + CORS
    onboarding.integration.test.ts  # Register -> profile -> subject -> session
    learning.integration.test.ts    # (planned)
    retention.integration.test.ts   # (planned)
    billing.integration.test.ts     # (planned)
    inngest-chains.integration.test.ts  # (planned)
.github/
  workflows/
    ci.yml                          # Main CI: lint, typecheck, test, build + integration
    e2e-ci.yml                      # E2E workflow (DONE — Maestro + Android emulator)
```

This follows the project convention: co-located unit tests in `*.test.ts`, integration/E2E tests in top-level `tests/` directory (per `docs/project_context.md` rule 146). The `jest.config.cjs` maps `@eduagent/*` and `@eduagent/api` to source paths for Hono `app.request()` testing.

> **Nx `affected` note:** The `api` project's `test:integration` target (`pnpm exec jest --config tests/integration/jest.config.cjs --maxWorkers=2`) runs integration tests explicitly. The main CI pipeline (`ci.yml`) invokes this target as a final step after all unit tests pass, so changes to `apps/api/` or `packages/` trigger integration tests automatically.

---

## 7. Implementation Sequence

Progress as of 2026-02-26:

1. **API integration test harness** — **DONE.** `tests/integration/` with 10 suites (auth-chain, health-cors, onboarding, account-deletion, profile-isolation, session-completed-chain, stripe-webhook, test-seed, learning-session, retention-lifecycle), `setup.ts`, `mocks.ts`, and `jest.config.cjs`. Uses Hono `app.request()` against PostgreSQL service container.
2. **Inngest chain integration tests** — **DONE.** `session-completed-chain.integration.test.ts` validates all 6 steps, error isolation, skip logic, and FR92 interleaved topics.
3. **Maestro setup** — **DONE.** `apps/mobile/e2e/` with `config.yaml`, `scripts/seed.js` (GraalJS), `_setup/seed-and-sign-in.yaml`, `_setup/sign-out.yaml`, Nx `e2e` target with smoke configuration, and 10 total YAML flows (4 existing + 2 setup + 4 Tier 1 smoke).
4. **CI wiring** — **DONE.** `.github/workflows/e2e-ci.yml` with PostgreSQL service container for both jobs, API server background startup + health check for mobile-maestro job. Advisory mode (`continue-on-error: true`).
5. **Smoke suite buildout** — **DONE.** 4 Tier 1 smoke flows written: `onboarding/sign-up-flow.yaml` (S1), `learning/first-session.yaml` (S2), `learning/core-learning.yaml` (S3), `retention/recall-review.yaml` (S4). Blocker: Clerk test user creation not yet in seed service; recall testIDs (`recall-question`, `recall-answer-input`, `recall-submit`) not yet added to mobile screens.
6. **Nightly full suite** — TODO. Add scheduled workflow, Tier 2 flows, reporting.

---

## 8. Flakiness Baseline & Reliability Expectations

### Expected Flake Rate

Target: **<5%** for Maestro smoke flows on GitHub Actions Android emulator. API integration tests (Hono `app.request()` against PostgreSQL) should be **0% flake** — deterministic by design.

### Retry Strategy

- **Maestro:** Built-in retry per flow step (configurable in `config.yaml` via `retryCount`). Default: 1 retry per failed step.
- **API integration tests:** No retry — tests are deterministic. Failures indicate real regressions.

### Merge Policy

- **PR level:** Advisory only (`continue-on-error: true` in `e2e-ci.yml`). E2E failures appear as warnings, not blockers.
- **Nightly failures:** Create GitHub issues automatically. Track flake rate over time. Promote to PR-blocking when flake rate is stable below 2%.

### CI Time Impact

| Suite | Estimated Duration | Notes |
|-------|--------------------|-------|
| API integration | ~2-3 min | PostgreSQL service container boot + schema push + test execution |
| Maestro smoke (4 flows) | ~5-8 min | Emulator boot (~2 min) + 4 flows (~1.5 min each) |
| **Total E2E job** | ~8-11 min | Runs in parallel with main CI; does not increase overall PR gate time |

### Known Limitations

- **Emulator-only:** No real device testing in CI at MVP. Real device quirks (touch latency, screen size) are not covered.
- **Android-only at MVP:** iOS Maestro CI requires macOS runners (~10x cost). Add iOS when revenue justifies.
- **No network condition simulation:** Slow/offline network behavior is not tested. Add Maestro network condition commands post-MVP.
- **EAS dev build dependency:** Maestro smoke tests require a pre-built Expo dev client APK. Caching strategy:
  - **Cache key:** Hash of `apps/mobile/package.json` + `apps/mobile/app.json` + `eas.json`. Any native dependency or config change invalidates the cache.
  - **Storage:** GitHub Actions cache (`actions/cache`) storing the APK artifact. Alternatively, download the latest successful build from EAS via `eas build:list --json`.
  - **Cache miss impact:** An EAS dev build takes ~10-20 minutes. On cache miss, the Maestro job should either skip gracefully (advisory mode) or use a pre-uploaded APK from a nightly build.
  - **Fallback:** If no cached APK is available, skip Maestro E2E with a warning annotation. This prevents PR gate times from exploding on native dependency changes.
