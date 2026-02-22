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

Hono provides `app.request(url, init)` which exercises the full middleware chain (auth, validation, error handling) without starting an HTTP server. This is the recommended approach for API integration tests.

```typescript
// tests/integration/onboarding.integration.test.ts
import { app } from '../../apps/api/src/index.js';
import { buildRegisterInput } from '@eduagent/factory';

test('register -> create profile -> consent flow', async () => {
  const input = buildRegisterInput();
  const res = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.profileId).toBeDefined();
});
```

### Test Database Strategy

The CI pipeline already uses a PostgreSQL 16 service container (see `.github/workflows/ci.yml`). Integration tests use this same approach:

| Environment | Database | Notes |
|------------|----------|-------|
| **CI** | GitHub Actions PostgreSQL service container | Already configured. Schema applied via `pnpm --filter @eduagent/database db:push`. |
| **Local dev** | Docker Compose PostgreSQL | `docker compose up -d postgres` for local integration test runs. |
| **Neon branching** | Reserved for staging/preview deploys | Not used for CI — local PostgreSQL is faster and free. |

### Seeding and Teardown

Use `@eduagent/factory` builders for seeding. Wrap each test in a transaction that rolls back:

```typescript
import { db } from '@eduagent/database';

let tx: Transaction;

beforeEach(async () => {
  tx = await db.transaction();
});

afterEach(async () => {
  await tx.rollback();
});
```

For tests requiring committed data (e.g., Inngest event triggers), use per-test schema isolation via `CREATE SCHEMA` or truncate tables between tests.

### Inngest Integration Tests

Use `inngest/test` mode to test event-driven chains without a running Inngest server:

```typescript
import { inngest } from '../../apps/api/src/inngest/client.js';

test('session.completed triggers SM-2 + coaching card + dashboard', async () => {
  const { events, result } = await inngest.test(
    'app/session.completed',
    { sessionId: 'test-session-id', profileId: 'test-profile-id' }
  );
  expect(result.steps).toContain('update-sm2-schedule');
  expect(result.steps).toContain('write-coaching-card');
  expect(result.steps).toContain('update-dashboard');
});
```

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
  |     lint -> typecheck -> test -> build
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

For Maestro flows, seed data via API calls in a `beforeAll`-equivalent setup flow:

```yaml
# e2e/flows/_setup/seed-test-user.yaml
appId: com.eduagent.mobile
---
- runScript:
    file: ../scripts/seed.js
    env:
      API_URL: ${API_URL}
```

Or use a dedicated seeding endpoint (test-only, guarded by environment flag):

```
POST /v1/__test/seed   # Only available when NODE_ENV=test
POST /v1/__test/reset   # Truncate all tables
```

### Isolation Between Parallel CI Runs

- **API integration tests:** Transaction rollback per test (zero cleanup needed).
- **Mobile E2E:** Each CI run gets a fresh PostgreSQL database via the service container. No shared state between runs.
- **Nightly full suite:** Dedicated Neon branch created at run start, destroyed at run end (if using Neon for nightly).

### Cleanup

| Layer | Strategy |
|-------|----------|
| Unit tests | In-memory mocks — no cleanup needed |
| API integration | Transaction rollback per test |
| Mobile E2E (CI) | Fresh database per workflow run |
| Mobile E2E (local) | `__test/reset` endpoint or Docker Compose `down -v` |

---

## 6. File Structure

```
apps/
  api/
    project.json                    # Add test:integration target
  mobile/
    e2e/
      flows/
        _setup/                     # Seed/teardown flows
        onboarding/                 # Epic 0 flows
        learning/                   # Epic 1-2 flows
        retention/                  # Epic 3 flows
        parent/                     # Epic 4 flows
        billing/                    # Epic 5 flows
      scripts/                      # JS helpers for Maestro runScript
      config.yaml
tests/
  integration/                      # API integration tests (per project_context.md rule)
    onboarding.integration.test.ts
    learning.integration.test.ts
    retention.integration.test.ts
    billing.integration.test.ts
    inngest-chains.integration.test.ts
.github/
  workflows/
    e2e-ci.yml                      # New workflow for E2E
```

This follows the project convention: co-located unit tests in `*.test.ts`, integration/E2E tests in top-level `tests/` directory (per `docs/project_context.md`).

---

## 7. Implementation Sequence

Progress as of 2026-02-22:

1. **API integration test harness** — **DONE.** `tests/integration/` with 3 suites (auth-chain, health-cors, onboarding), `setup.ts`, and `jest.config.cjs`. Uses Hono `app.request()` against PostgreSQL service container.
2. **Inngest chain integration tests** — TODO. Test `session.completed` chain end-to-end using `inngest/test`. Validates the most complex async flow.
3. **Maestro setup** — **PARTIAL.** `apps/mobile/e2e/` created with `config.yaml`, 3 skeleton YAML flows (app-launch, start-session, create-subject/view-curriculum). Not yet runnable — requires EAS dev build APK and `testID` props on mobile components.
4. **CI wiring** — **DONE.** `.github/workflows/e2e-ci.yml` with PostgreSQL service container for API integration tests + Maestro + Android emulator job. Advisory mode (`continue-on-error: true`).
5. **Smoke suite buildout** — TODO. Write Tier 1 flows as features are wired to real APIs. Add `testID` props to mobile components for Maestro element targeting.
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
- **EAS dev build dependency:** Maestro smoke tests require a pre-built Expo dev client APK. EAS build must be triggered before or cached from a prior successful build.
