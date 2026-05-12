# MentoMate — E2E Testing Strategy

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
| `{feature}-{state}` | `library-loading`, `library-empty` | Loading/empty states |
| `{element-type}` | `chat-input`, `send-button`, `camera-view` | Inline elements |

**Rules:**
- All interactive elements (buttons, inputs, toggleable) **must** have a `testID`.
- Use `accessibilityLabel` when the same string serves both a11y and E2E targeting (preferred for text-bearing elements).
- Prefer `testID` for non-text elements (containers, loading indicators) where an accessibility label would be meaningless.
- In Maestro YAML, reference via `id:` (maps to `testID`) or `tapOn:` (matches visible text / `accessibilityLabel` / `contentDescription`).
- **Tab bar navigation:** Use `tabBarAccessibilityLabel` on `Tabs.Screen` options (maps to Android `contentDescription`). Maestro matches these via `tapOn: "Library Tab"`. This is the ONLY reliable tab navigation method in dev-client builds — point-tap and text matching both break due to BUG-10 (extra hidden tabs). See `e2e-test-bugs.md` BUG-10/BUG-30.
- **Directory vs file routes:** Expo Router directory routes (`library/index.tsx`) expose raw path segments (`library/index`) in the tab bar, ignoring configured `title` and `tabBarAccessibilityLabel`. Always use file routes (`library.tsx`) for tab screens.

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

Critical user flows, prioritized by risk and user impact.

### Tag Tiers & Graduation Path

| Tag | Blocking? | When it runs | Purpose |
|-----|-----------|-------------|---------|
| `smoke` | Eventually yes (once stabilized) | Every PR + nightly | Core flows work end-to-end |
| `nightly` | Advisory | Nightly 3AM UTC + manual | Edge cases, full coverage |

**Graduation plan:** Once smoke flows achieve >95% pass rate across 2 weeks of nightly runs, remove `continue-on-error: true` from the CI job to make them blocking.

### Embedded Visual Audit (screenshot trail)

Every functional flow also serves as a visual regression check. Instead of separate "visual test" flows, screenshots are embedded at meaningful screen states within existing flows. This answers two questions from one flow:
1. **Functional:** Does the flow work? (assertions)
2. **Visual/UX:** Does the screen look correct at each moment? (screenshots)

CI always uploads screenshots as artifacts (`if: always()`), not just on failure. After a CI run, someone glances at the screenshots and spots anything obviously wrong — no pixel diffing, no new tools.

**Where screenshots are embedded (auth + onboarding priority — 100% of users see these):**

| Flow | Screenshots | What they catch |
|------|-------------|-----------------|
| `seed-and-sign-in.yaml` | `signin-01-screen-loaded`, `signin-02-email-keyboard-open`, `signin-03-password-keyboard-open`, `signin-04-home-reached` | KAV regressions (BUG-24), layout shifts, broken auth UI |
| `sign-in-navigation.yaml` | `auth-nav-sign-in`, `auth-nav-sign-in-keyboard`, `auth-nav-sign-up`, `auth-nav-forgot-password`, `auth-nav-back-to-sign-in` | Auth screen rendering, navigation link visibility, keyboard overlay |
| `sign-up-flow.yaml` | `onboarding-01` through `onboarding-07` | Each onboarding step: sign-up form, profile creation, empty home, subject creation, interview |
| `create-subject.yaml` | `subject-01` through `subject-04` | Home with subjects, create modal with keyboard, name entry, interview chat |

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
| **Failed Recall** | 3x failed recall -> Library redirect -> "Relearn Topic" -> different method -> re-test after 24h | `full, remediation` |
| **Homework Help** | Camera capture -> OCR -> homework chat -> Socratic guidance (no direct answers) -> session marked "guided" | `full, homework` |
| **Parent Dashboard** | Switch to parent persona -> view child progress -> see retention bars -> update notification prefs | `full, parent` |
| **Multi-Subject** | Add second subject -> switch subjects -> pause first -> auto-archive check -> restore | `full, subjects` |
| **Library Navigation** | Start freeform session -> verify in-session Library link -> end session -> verify summary Library link -> navigate to Library (Stories 4.12, 4.13) | `nightly, learning` |
| **Topic Detail Adaptive Buttons** | Navigate to topic detail -> verify adaptive buttons match completionStatus (not_started/in_progress/completed) (Story 4.14) | `nightly, retention` |
| **Practice Subject Picker** | Tap "Practice for a test" with 2+ active subjects -> picker appears -> select subject -> practice session starts (Story 10.23) | `nightly, subjects` |
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
| Epic 4 | — | Parent Dashboard, Multi-Subject, Library Navigation, Topic Detail Buttons | 4 |
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

For Maestro flows, seed data via the test-only API endpoints:

```
POST /__test/seed          # Create a pre-configured test scenario
POST /__test/reset         # Delete seed-created data (clerk_seed_* accounts only)
GET  /__test/scenarios     # List valid scenario names
GET  /__test/debug/:email  # Trace account → profiles → subjects chain
GET  /__test/debug-subjects/:clerkUserId  # Simulate exact subjects query path
```

> **Note:** The original design used Maestro's GraalJS `runScript` to call the seed API. This was blocked by Issue 13 (`__maestro` undefined in sub-flows). The current approach uses `seed-and-run.sh` — a shell wrapper that seeds via `curl` on the host machine, then passes credentials to Maestro via `-e` CLI env vars.

```bash
# Usage: seed-and-run.sh <scenario> <flow-file> [maestro-args...]
cd apps/mobile/e2e
./scripts/seed-and-run.sh onboarding-complete flows/account/settings-toggles.yaml
./scripts/seed-and-run.sh learning-active flows/learning/core-learning.yaml
```

The shell wrapper handles the full lifecycle: ADB app clear/launch → dev-client launcher navigation → bundle loading → overlay dismissal → API seeding → Maestro invocation. See Section 7 for the detailed architecture.

### Shell Script Pitfall: `set -euo pipefail` with grep

**Lesson from Session 9:** `set -euo pipefail` is dangerous in shell scripts that use `grep` in pipelines. When `grep` finds no matches it exits with code 1, and `pipefail` propagates that as a script failure — even when "no matches" is a valid/expected outcome (e.g., checking if a UI element is absent). The fix: use `grep ... || true` for pipelines where zero matches is acceptable, or avoid `set -o pipefail` in favor of explicit error checks on critical commands only.

### Profile Scope Middleware (BUG-25 — Critical)

Fixed: `profileScopeMiddleware` auto-resolves to the owner profile when `X-Profile-Id` header is absent. See `e2e-test-bugs.md` BUG-25 for full details.

### Maestro Text Matching on Android (BUG-49 — Critical Pattern)

Maestro's `text:` selector has three known failure patterns on Android (discovered Session 15):

1. **Nested `<Text>` in `<Pressable testID>`** — inner text invisible to `text:` selector. Fix: use testID or tap by unique text content.
2. **Long wrapping text** — single `<Text>` with wrapped content not matched. Fix: use testID-based assertions instead.
3. **Unescaped regex characters** — `text:` values are regex; `(`, `)`, etc. must be escaped with `\\`. Fix: escape all special chars.

**Rule of thumb:** Prefer `id:` selectors over `text:` selectors wherever possible. Fall back to `text:` only for elements without testIDs and with short, non-special-character content.

See `e2e-test-bugs.md` BUG-49 and `e2e-emulator-issues.md` Issue 21 for full details.

### Sign-In Setup Flow Variants

| Flow | When to Use |
|------|-------------|
| `seed-and-sign-in.yaml` | Standard flows — signs in and waits for `home-scroll-view` or `dashboard-scroll-view` |
| `sign-in-only.yaml` | Edge-case flows where post-auth screen is NOT home/dashboard (e.g., 0-subjects redirect to create-subject, consent-withdrawn gate). Does NOT attempt post-auth navigation recovery. |
| `switch-to-child.yaml` | Multi-profile flows where the seed creates a parent-owned account but the test needs the child's perspective. Navigates More → Profile → taps child by name → waits for learner home. Accepts `${CHILD_NAME}` env var. |

See `e2e-test-bugs.md` BUG-51 for why `sign-in-only.yaml` was needed.

### Pre-Auth Flow Launcher

| Script | When to Use |
|--------|-------------|
| `seed-and-run.sh <scenario> <flow>` | Standard flows — seeds test data, then runs Maestro with credentials as env vars |
| `run-without-seed.sh <flow>` | Pre-auth flows that sign up a new user (no seed needed). Wrapper for `seed-and-run.sh --no-seed`. |

Pre-auth flows (coppa-flow, profile-creation-consent, consent-pending-gate, sign-up-flow) need a fresh app state with no existing user. They use `run-without-seed.sh` which does the full ADB automation (pm clear → launch → Metro → bundle → dismiss overlays) but skips the seed API call. The Maestro flow starts from the sign-in screen and taps "Sign up" to begin the registration flow.

### TanStack Query Auth Guard (BUG-31 — Critical)

**Rule:** Any TanStack Query hook used inside a provider that mounts before auth (`ProfileProvider` is in root `_layout.tsx`) **MUST** have an `enabled: !!isSignedIn` guard. Without it, the query fires unauthenticated before sign-in, enters TanStack Query error state (401, retries exhausted), and **never recovers** — even after sign-in succeeds. This is because TanStack Query does not auto-retry errored queries when the existing observer re-renders.

**Pattern:**
```typescript
import { useAuth } from '@clerk/clerk-expo';
export function useProfiles() {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: ['profiles'],
    queryFn: ...,
    enabled: !!isSignedIn,  // REQUIRED — prevents pre-auth 401 error lock
  });
}
```

See `e2e-test-bugs.md` BUG-31 for full root cause analysis.

### KeyboardAvoidingView + adjustResize Conflict (BUG-35 — Known Blocker)

On Android with Fabric (New Architecture), combining `KeyboardAvoidingView behavior="height"` with `android:windowSoftInputMode="adjustResize"` causes the keyboard to cover the send button in `ChatShell`. The `adjustResize` already resizes the layout, and `behavior="height"` applies a second offset — but because Fabric reports layout changes differently, the combined effect is insufficient, leaving the input/send area hidden behind the keyboard. This blocks all ~15 flows that require typing in a chat session. See `e2e-test-bugs.md` BUG-35.

### react-native-svg + Fabric Crash (BUG-33 — FIXED)

`react-native-svg` 15.12.1 with `newArchEnabled=true` (Fabric) previously crashed with `ClassCastException` in `RNSVGGroupManagerDelegate` when SVG components (particularly `G`) received animated props from `react-native-reanimated`. Fixed 2026-03-11 by replacing animated SVG `<G>` transform with pure Reanimated `<Animated.View>` scaleX. Library tab flows should now work. See `e2e-test-bugs.md` BUG-33.

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
    src/
      routes/test-seed.ts            # POST /__test/seed (14 scenarios), debug endpoints
      services/test-seed.ts           # Seeding logic + Clerk Backend API integration
      middleware/profile-scope.ts     # Auto-resolves owner profile when X-Profile-Id absent
    project.json                      # Has test:integration target (DONE)
  mobile/
    e2e/
      flows/
        _setup/                       # 20 setup helpers (seed-and-sign-in, sign-in-only, interview-followup, dismiss-*, etc.)
        account/                      # Account management flows
        billing/                      # Subscription/trial flows
        consent/                      # GDPR consent flows
        learning/                     # Session, homework, adaptive flows
        onboarding/                   # Sign-up, subject creation, consent
        parent/                       # Parent dashboard, child detail
        retention/                    # Recall review, failed recall, relearn
        subjects/                     # Multi-subject management
        standalone/                   # Pre-auth flows (no seed required)
      scripts/
        seed-and-run.sh               # Entry point: ADB automation + seed + Maestro (supports --no-seed)
        run-without-seed.sh           # Wrapper: ADB automation without seeding (pre-auth flows)
        run-all-untested.sh           # Batch runner for all untested flows
        rerun-failed.sh               # Retry runner for failed flows
        seed.js                       # (legacy, unused — GraalJS blocked by Issue 13)
      config.yaml
tests/
  integration/                        # API integration tests (15 suites, all passing)
    jest.config.cjs
    setup.ts
    mocks.ts
    auth-chain.integration.test.ts
    health-cors.integration.test.ts
    onboarding.integration.test.ts
    learning-session.integration.test.ts
    retention-lifecycle.integration.test.ts
    session-completed-chain.integration.test.ts
    stripe-webhook.integration.test.ts
    account-deletion.integration.test.ts
    profile-isolation.integration.test.ts
    test-seed.integration.test.ts
.github/
  workflows/
    ci.yml                            # Main CI: lint, typecheck, test, build + integration
    e2e-ci.yml                        # E2E workflow (Maestro + Android emulator)
```

**Flow inventory:** 64 unique test flows + 20 setup helpers = 84 YAML files total (updated Session 22: +6 flows — 3 consent age-gated, 1 consent placeholder, 2 parent audit).

This follows the project convention: co-located unit tests in `*.test.ts`, integration/E2E tests in top-level `tests/` directory (per `docs/project_context.md` rule 146). The `jest.config.cjs` maps `@eduagent/*` and `@eduagent/api` to source paths for Hono `app.request()` testing.

> **Nx `affected` note:** The `api` project's `test:integration` target (`pnpm exec jest --config tests/integration/jest.config.cjs --maxWorkers=2`) runs integration tests explicitly. The main CI pipeline (`ci.yml`) invokes this target as a final step after all unit tests pass, so changes to `apps/api/` or `packages/` trigger integration tests automatically.

---

## 7. Implementation Sequence

Progress as of 2026-03-12:

1. **API integration test harness** — **DONE.** `tests/integration/` with 10 suites (auth-chain, health-cors, onboarding, account-deletion, profile-isolation, session-completed-chain, stripe-webhook, test-seed, learning-session, retention-lifecycle), `setup.ts`, `mocks.ts`, and `jest.config.cjs`. Uses Hono `app.request()` against PostgreSQL service container.
2. **Inngest chain integration tests** — **DONE.** `session-completed-chain.integration.test.ts` validates all 6 steps, error isolation, skip logic, and FR92 interleaved topics.
3. **Maestro setup** — **DONE.** `apps/mobile/e2e/` with `config.yaml`, `scripts/seed-and-run.sh` (ADB automation + seed + Maestro), `_setup/seed-and-sign-in.yaml`, `_setup/sign-in-only.yaml` (edge-case flows), `_setup/sign-out.yaml`, `_setup/interview-followup.yaml` (LLM multi-exchange helper), Nx `e2e` target with smoke configuration, and 54 total test flows + 20 setup helpers.
4. **CI wiring** — **DONE.** `.github/workflows/e2e-ci.yml` with PostgreSQL service container for both jobs, API server background startup + health check for mobile-maestro job. Advisory mode (`continue-on-error: true`).
5. **Smoke suite buildout** — **DONE.** All planned smoke and nightly flows written. 51 flows confirmed passing on Android emulator (as of Session 18). 1 pre-auth flow PARTIAL (sign-up-flow, BUG-55 — intentionally tests sign-up UI). 1 skipped (ExpoGo-only).
6. **Seed infrastructure** — **DONE.** `seed-and-run.sh` (shell wrapper: curl + node JSON parsing + ADB automation + Maestro `-e` flags). `test-seed.ts` service with 16 scenarios (onboarding-complete, onboarding-no-subject, learning-active, retention-due, failed-recall-3x, parent-with-children, trial-active, trial-expired, multi-subject, homework-ready, trial-expired-child, consent-withdrawn, consent-withdrawn-solo, parent-solo, pre-profile, consent-pending). Bypasses Maestro's broken GraalJS `runScript` (Issue 13).
7. **BUG-25 fix: profileScope middleware** — **DONE** (commit `35ef433`). `profileScopeMiddleware` now auto-resolves to owner profile when `X-Profile-Id` header is absent. This was the root cause of seeded subjects/streaks/coaching-cards being invisible on the home screen — blocked ~30 E2E flows.
8. **BUG-10/BUG-30 fix: tab navigation** — **DONE**. Flattened `library/index.tsx` → `library.tsx` (directory routes break tab bar labels in dev-client). Added `tabBarAccessibilityLabel` to all 3 visible tabs in both learner and parent layouts. Updated 7 E2E flow YAML files to use `tapOn: "Library Tab"`. Also fixed BUG-24 (KeyboardAvoidingView), BUG-29 (dashboard loading), BUG-32 (More tab scroll).
9. **Nightly full suite** — **NEAR COMPLETE.** All 54 flows written. **51 flows passing (94%)** (Session 18). 1 pre-auth flow PARTIAL (sign-up-flow — tests sign-up UI, Clerk verification inherent). 1 deferred (recall-review). 1 skipped (ExpoGo-only). Session 18: BUG-55 bypassed via `pre-profile` + `consent-pending` seed scenarios (3 flows promoted from PARTIAL to PASS).
10. **Session 9 findings** — `seed-and-run.sh` fixed (3 bugs: pipefail crash, dev-tools Close button tap, grep pipeline). BUG-31 verified fixed via Maestro. BUG-34 fixed (PR #72: subjects added to `onboarding-complete`, `trial-active`, `trial-expired` seed scenarios). BUG-35 workaround applied (PR #72: all ChatShell flows use `pressKey: Enter` instead of tapping obscured `send-button`). BUG-33 fixed (Session 11). BUG-48 fixed (Session 14: parent-redirect timing race).
11. **Session 14 sweep (2026-03-12)** — 26 flows run: 18 PASS, 1 PARTIAL, 11 FAIL. BUG-48 discovered and fixed (parent-redirect timing in `seed-and-sign-in.yaml`). All parent flows now stable.
12. **Session 15 fix sweep (2026-03-12)** — All 10 failing flows from Session 14 re-run after fixes. 7 PASS, 2 FAIL (LLM), 1 SKIP (emulator). Fixes: BUG-49 (Maestro text matching — 3 patterns: nested `<Text>`, long wrapping text, unescaped regex), BUG-50 (consent-withdrawn multi-profile → new `consent-withdrawn-solo` seed), BUG-51 (empty-first-user → new `sign-in-only.yaml` setup flow). New seed scenarios: `onboarding-no-subject`, `consent-withdrawn-solo`. Cumulative: **43/53 flows passing (81%)**. See `e2e-test-results.md` for full breakdown.
13. **Session 16 — SSE streaming fix (2026-03-12)** — Root cause of ALL LLM-dependent E2E failures identified and fixed: React Native Hermes `fetch` returns `response.body = null` (no `ReadableStream` support). Fix: new `streamSSEViaXHR()` in `apps/mobile/src/lib/sse.ts` uses `XMLHttpRequest.onprogress` for true streaming. `useStreamMessage` hook updated to use XHR instead of Hono RPC client. Session-summary flow now passes all 25 steps end-to-end. BUG-53 discovered (tab bar icons missing — Ionicons font not loading on emulator, visual only). BUG-54 fixed (Inngest `send()` crash on session close — wrapped in try-catch). Cumulative: **44/53 flows passing (83%)**.
14. **Session 17 — Fix all remaining non-passing flows (2026-03-12)** — Addressed all 7 non-passing flows (excluding ExpoGo SKIP). Results: 3 upgraded to PASS (settings-toggles, analogy-preference-flow, curriculum-review-flow), 4 pre-auth flows tested as PARTIAL (Clerk email verification blocker, BUG-55). Fixes: `scrollUntilVisible` for BUG-18 (switch-to-teen below fold), detailed interview messages + `interview-followup.yaml` helper for LLM multi-exchange, testID-based assertions replacing em-dash text matches, `pressKey: Back` keyboard dismiss in challenge modal, `optional: true` with VERIFICATION BOUNDARY for unreachable Clerk-blocked steps. New setup helper: `_setup/interview-followup.yaml`. Cumulative: **48/53 flows passing (91%), 4 partial, 1 skipped**.
15. **Session 18 — Clerk verification bypass (2026-03-12)** — BUG-55 fix: added `pre-profile` and `consent-pending` seed scenarios to bypass Clerk email verification. `pre-profile` creates Clerk user + DB account (no profile); flows sign in and navigate to create-profile via More → Profiles → "Create first profile". `consent-pending` creates Clerk user + account + TEEN profile with `PARENTAL_CONSENT_REQUESTED` — learner layout renders ConsentPendingGate directly. Rewrote 3 consent flows: `consent-pending-gate.yaml` (all assertions now mandatory), `coppa-flow.yaml` (US profile creation verified), `profile-creation-consent.yaml` (EU profile creation verified). `sign-up-flow.yaml` stays PARTIAL by design (tests sign-up UI). Cumulative: **51/54 flows passing (94%), 1 partial, 1 deferred, 1 skipped**.

### Architecture Evolution (Sessions 1-5)

The Maestro E2E architecture evolved significantly through practical testing on WHPX:

| Phase | Approach | Status |
|-------|----------|--------|
| **Original design** (Section 5) | Maestro `runScript` with GraalJS seed.js | **Blocked** — Issue 13: `__maestro` undefined in sub-flows |
| **v1** (Session 3-4) | `seed-and-run.sh` + Maestro `launchApp` | **Unstable** — BUG-19: `launchApp` fails on WHPX |
| **v2** (Session 5) | `seed-and-run.sh` + Maestro `extendedWaitUntil` for launcher | **Unstable** — gRPC driver crashes during bundle loading |
| **v3** (Session 5, final) | Full ADB automation in `seed-and-run.sh`, Maestro only does sign-in | **Stable** — avoids Maestro during resource-intensive phases |

**v3 data flow:**
```
seed-and-run.sh (bash)
  ├── ADB: pm clear → pm grant → am start
  ├── ADB: uiautomator dump polling for "DEVELOPMENT" (120s)
  ├── ADB: parse 8081 bounds from dump, input tap at center
  ├── ADB: escalating sleep (15/30/60/90/120s) + KEYCODE_BACK + verify
  │         (dump unreliable during Continue overlay — OOM kills it)
  ├── ADB: if "Welcome back" → break; if "DEVELOPMENT" → re-tap Metro
  ├── ADB: KEYCODE_BACK if "Reload" visible (dismiss dev tools)
  ├── API: curl POST /v1/__test/seed → node JSON parse
  └── exec: maestro test -e EMAIL=... -e PASSWORD=... flow.yaml
        └── seed-and-sign-in.yaml (Maestro)
              ├── extendedWaitUntil "Welcome back" (120s)
              ├── tapOn sign-in-email → inputText
              ├── tapOn "Welcome back" (dismiss keyboard)
              ├── tapOn sign-in-password → inputText
              ├── tapOn "Welcome back" (dismiss keyboard)
              ├── extendedWaitUntil sign-in-button → tapOn
              ├── extendedWaitUntil home-scroll-view
              └── dismiss notification permission (safety net)
```

**Key insight:** WHPX emulators are too slow/unstable for Maestro to handle the entire app launch lifecycle. Splitting the work between ADB (stable but dumb) and Maestro (smart but fragile under load) gives the best reliability.

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
