---
stepsCompleted: ['step-01-preflight', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests']
lastStep: 'step-04-generate-tests'
lastSaved: '2026-02-23'
workflowType: 'testarch-atdd'
inputDocuments:
  - '_bmad-output/test-artifacts/test-design-qa.md'
  - '_bmad-output/test-artifacts/test-design-architecture.md'
  - 'docs/prd.md'
  - 'docs/architecture.md'
---

# ATDD Checklist — P0 Critical Tests

**Date:** 2026-02-22
**Author:** Murat (TEA) for Zuzana
**Primary Test Level:** Integration (API) + E2E (Maestro)
**Stack:** Fullstack (Hono API + Expo React Native)
**Test Framework:** Jest 30 (API), Maestro (Mobile E2E)

---

## Scope Summary

All 8 P0 tests from the Test Design QA document. These cover the critical paths, security boundaries, and data integrity requirements that block launch.

**As a** QA engineer
**I want** P0 acceptance tests for all critical paths
**So that** we can verify security, data integrity, and billing correctness before launch

---

## Acceptance Criteria (P0 Scenarios)

1. **P0-001:** Consent flow (sign-up → age gate → consent request → parent approval)
2. **P0-002:** First learning session (create subject → interview → curriculum → first exchange)
3. **P0-003:** Recall test + SM-2 scheduling (answer → score → next review date)
4. **P0-004:** Account deletion (request → grace period → data purge)
5. **P0-005:** Auth token validation (expired token rejected, unauth → 401)
6. **P0-006:** Profile isolation (parent views child, child cannot view sibling)
7. **P0-007:** Stripe webhook → subscription state sync
8. **P0-008:** Session-completed chain (SM-2 → coaching card → activity → XP)

---

## Test Strategy — Level Assignment

| Test ID | Test Level | Rationale |
|---------|-----------|-----------|
| P0-001 | E2E (Maestro) | Multi-screen user journey requiring mobile interaction |
| P0-002 | E2E (Maestro) | End-to-end onboarding flow with LLM interaction |
| P0-003 | E2E (Maestro) | Core retention loop spanning UI + spaced repetition engine |
| P0-004 | Integration (API) | Background job chain; no mobile UI for deletion |
| P0-005 | Integration (API) | Middleware behavior; already partially covered |
| P0-006 | Integration (API) | Middleware + service boundary; testable via `app.request()` |
| P0-007 | Integration (API) | External webhook; testable with mock signature |
| P0-008 | Integration (API) | Inngest step chain; testable with mock services |

---

## Tests Created (GREEN Phase)

### API Integration Tests (4 suites, 33 tests — ALL PASSING)

#### 1. Test Seed Endpoint (P0 Foundation)

**File:** `tests/integration/test-seed.integration.test.ts` (377 lines)
**Status:** GREEN — 18/18 passing

- **Test:** `POST /__test/seed returns 201 with seeded scenario data`
  - **Status:** GREEN
  - **Verifies:** Seed endpoint creates test data and returns correct shape

- **Test:** `POST /__test/seed uses default email when not provided`
  - **Status:** GREEN
  - **Verifies:** Default email fallback works correctly

- **Test:** `POST /__test/seed rejects invalid scenario name with 400`
  - **Status:** GREEN
  - **Verifies:** Zod validation rejects unknown scenarios

- **Test:** `POST /__test/seed returns 403 in production environment`
  - **Status:** GREEN
  - **Verifies:** Production guard blocks test endpoints

- **Test:** `POST /__test/seed skips authentication (public path)`
  - **Status:** GREEN
  - **Verifies:** Test endpoints don't require Bearer token

- **Test:** `accepts scenario: [8 scenarios via it.each]`
  - **Status:** GREEN (8 tests)
  - **Verifies:** All 8 seed scenarios accepted by Zod validation

- **Test:** `POST /__test/reset returns 200 with success message`
  - **Status:** GREEN
  - **Verifies:** Database reset endpoint works

- **Test:** `POST /__test/reset returns 403 in production`
  - **Status:** GREEN
  - **Verifies:** Production guard on reset

- **Test:** `GET /__test/scenarios returns all valid scenario names`
  - **Status:** GREEN
  - **Verifies:** Scenario listing endpoint returns all 8 names

---

#### 2. Profile Isolation (P0-006)

**File:** `tests/integration/profile-isolation.integration.test.ts` (340 lines)
**Status:** GREEN — 5/5 passing

- **Test:** `returns 200 with subjects when X-Profile-Id belongs to the account`
  - **Status:** GREEN
  - **Verifies:** Owned profile can access its data through middleware

- **Test:** `returns 403 FORBIDDEN when X-Profile-Id does NOT belong to the account`
  - **Status:** GREEN
  - **Verifies:** Cross-account profile access blocked at middleware layer

- **Test:** `falls back to account-level access when X-Profile-Id is absent`
  - **Status:** GREEN
  - **Verifies:** Account-level fallback works when no header sent

- **Test:** `correctly propagates profileId to downstream services`
  - **Status:** GREEN
  - **Verifies:** Middleware sets correct profileId for service consumption

- **Test:** `prevents access with a fabricated profile ID`
  - **Status:** GREEN
  - **Verifies:** Random/fabricated UUIDs correctly rejected

---

#### 3. Stripe Webhook (P0-007)

**File:** `tests/integration/stripe-webhook.integration.test.ts` (370 lines)
**Status:** GREEN — 10/10 passing

- **Test:** `returns 400 when stripe-signature header is missing`
  - **Status:** GREEN
  - **Verifies:** Missing signature rejected before processing

- **Test:** `returns 500 when STRIPE_WEBHOOK_SECRET is not configured`
  - **Status:** GREEN
  - **Verifies:** Missing config detected gracefully

- **Test:** `returns 400 when webhook signature is invalid`
  - **Status:** GREEN
  - **Verifies:** Invalid signature rejected

- **Test:** `rejects stale events older than 48 hours`
  - **Status:** GREEN
  - **Verifies:** Replay protection works

- **Test:** `checkout.session.completed → activates subscription`
  - **Status:** GREEN
  - **Verifies:** Checkout event creates active subscription

- **Test:** `customer.subscription.updated → updates subscription state`
  - **Status:** GREEN
  - **Verifies:** Subscription state changes propagate

- **Test:** `customer.subscription.deleted → marks subscription expired`
  - **Status:** GREEN
  - **Verifies:** Deletion sets expired status

- **Test:** `invoice.payment_failed → sets past_due and emits Inngest event`
  - **Status:** GREEN
  - **Verifies:** Failed payment triggers retry flow

- **Test:** `invoice.payment_succeeded → sets active`
  - **Status:** GREEN
  - **Verifies:** Successful payment restores active status

- **Test:** `skips auth (public path via /v1/stripe/)`
  - **Status:** GREEN
  - **Verifies:** Webhook doesn't require Bearer token

---

#### 4. Auth Chain (P0-005) — Pre-existing

**File:** `tests/integration/auth-chain.integration.test.ts`
**Status:** GREEN — already passing (pre-existing)

- Covers: public path skip, missing header → 401, non-Bearer → 401, invalid JWT → 401, valid JWT passes, missing JWKS_URL → 401, CORS preflight
- **P0-005 coverage: Complete**

---

### E2E Tests (Maestro) — STUB Phase

**Status:** Stubs only — require EAS dev build APK (R-012) and Maestro CI setup

| Test ID | Maestro Flow File | Seed Scenario | Status |
|---------|------------------|---------------|--------|
| P0-001 | `e2e/flows/consent-flow.yaml` | `onboarding-complete` | Not yet created — needs APK |
| P0-002 | `e2e/flows/first-session.yaml` | `onboarding-complete` | Not yet created — needs APK |
| P0-003 | `e2e/flows/recall-sm2.yaml` | `retention-due` | Not yet created — needs APK |

**Blocker:** EAS dev build APK not yet produced (R-012). Maestro flows cannot run without it.

---

### Session-Completed Chain (P0-008) — Architecture Note

**Test Level:** Inngest function chain (not HTTP route)
**Approach:** Direct function invocation with mocked services

The session-completed chain (6 steps: retention → needs-deepening → coaching-card → streaks+XP → embeddings → summary-skips) is an Inngest function, not an HTTP endpoint. Testing it requires:

1. Importing the function directly from `apps/api/src/inngest/functions/session-completed.ts`
2. Mocking all 6 service dependencies (`retention-data`, `summaries`, `coaching-cards`, `streaks`, `xp`, `embeddings`, `settings`)
3. Invoking the function with a synthetic event payload
4. Verifying each step's service calls

**Status:** Documented but not yet implemented. Requires `createInngestStepMock()` helper pattern. Estimated: 4-6 hours.

---

## Data Factories

EduAgent uses `@eduagent/factory` package with builder pattern for test data:

**Package:** `packages/factory/`
**Pattern:** `buildEntity(overrides?)` — returns Drizzle-compatible row objects

**Available Builders (used by seed scenarios):**
- `buildAccount({ email?, clerkUserId? })`
- `buildProfile({ accountId, personaType?, displayName? })`
- `buildSubject({ profileId, name?, status? })`
- `buildRetentionCard({ profileId, topicId, easeFactor?, failureCount? })`
- `buildAssessment({ profileId, subjectId, topicId, status? })`
- `buildSubscription({ accountId, tier?, status? })`

**Example:**
```typescript
import { buildProfile } from '@eduagent/factory';

const profile = buildProfile({
  accountId: 'acc-123',
  personaType: 'LEARNER',
  displayName: 'Test User',
});
```

---

## Mock Requirements

### JWT / Clerk Auth Mock

**Module:** `apps/api/src/middleware/jwt`
**Pattern:** Module-level `jest.mock()` with controllable functions

```typescript
const mockDecodeJWTHeader = jest.fn();
const mockFetchJWKS = jest.fn();
const mockVerifyJWT = jest.fn();

jest.mock('../../apps/api/src/middleware/jwt', () => ({
  decodeJWTHeader: mockDecodeJWTHeader,
  fetchJWKS: mockFetchJWKS,
  verifyJWT: mockVerifyJWT,
}));

function configureValidJWT(): void {
  mockDecodeJWTHeader.mockReturnValue({ alg: 'RS256', kid: 'test-kid' });
  mockFetchJWKS.mockResolvedValue({
    keys: [{ kty: 'RSA', kid: 'test-kid', n: 'fake-n', e: 'AQAB' }],
  });
  mockVerifyJWT.mockResolvedValue({
    sub: 'user_test', email: 'test@test.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}
```

### Stripe Webhook Signature Mock

**Module:** `apps/api/src/services/stripe`
**Pattern:** Return constructed Stripe.Event objects

```typescript
jest.mock('../../apps/api/src/services/stripe', () => ({
  verifyWebhookSignature: mockVerifyWebhookSignature,
}));

// Usage: return a Stripe event
mockVerifyWebhookSignature.mockResolvedValue({
  type: 'checkout.session.completed',
  created: Math.floor(Date.now() / 1000),
  data: { object: { id: 'cs_123', subscription: 'sub_456', metadata: { accountId: 'acc', tier: 'plus' } } },
});
```

### Database Mock

**Module:** `@eduagent/database`
**Pattern:** Returns empty object (middleware sets `c.set('db', db)`)

```typescript
jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn().mockReturnValue({}),
}));
```

**IMPORTANT:** `TEST_ENV` must include `DATABASE_URL` for the database middleware to set `db`:
```typescript
const TEST_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  // ... other bindings
};
```

---

## Required testID Attributes (Maestro E2E)

### Consent Flow (P0-001)

- `age-gate-screen` — Age gate screen container
- `age-input` — Birthday/age input field
- `consent-request-sent` — Confirmation that consent email was sent
- `consent-status-badge` — Shows PENDING/CONSENTED/DECLINED

### First Session (P0-002)

- `subject-create-input` — Subject name input
- `subject-create-button` — Submit new subject
- `interview-chat-input` — Interview message input
- `interview-next-button` — Next/continue interview
- `session-message-input` — Learning session chat input

### Recall Test (P0-003)

- `recall-card` — Retention card display
- `recall-answer-input` — Answer input field
- `recall-submit-button` — Submit recall answer
- `recall-score-badge` — Mastery score display
- `next-review-date` — Next review date display

---

## Running Tests

```bash
# Run ALL integration tests (6 suites, 66 tests)
pnpm exec jest --config tests/integration/jest.config.cjs

# Run specific P0 test suite
pnpm exec jest --config tests/integration/jest.config.cjs --testPathPatterns profile-isolation
pnpm exec jest --config tests/integration/jest.config.cjs --testPathPatterns stripe-webhook
pnpm exec jest --config tests/integration/jest.config.cjs --testPathPatterns test-seed
pnpm exec jest --config tests/integration/jest.config.cjs --testPathPatterns auth-chain

# Run all integration tests with coverage
pnpm exec jest --config tests/integration/jest.config.cjs --coverage
```

---

## Implementation Checklist

### Completed (GREEN Phase)

- [x] **P0-004:** Account deletion — `account-deletion.integration.test.ts` (7 tests)
- [x] **P0-005:** Auth token validation — `auth-chain.integration.test.ts` (pre-existing, 11 tests)
- [x] **P0-006:** Profile isolation — `profile-isolation.integration.test.ts` (5 tests)
- [x] **P0-007:** Stripe webhook — `stripe-webhook.integration.test.ts` (10 tests)
- [x] **P0-008:** Session-completed chain — `session-completed-chain.integration.test.ts` (13 tests)
- [x] **Test seed endpoint** — `test-seed.integration.test.ts` (18 tests, R-002 resolved)

### Remaining (Blocked by R-012)

- [ ] **P0-001:** Consent flow — Maestro E2E
  - Blocked by: EAS dev build APK (R-012)
  - Seed: `onboarding-complete`
  - Estimated: 6-8 hours

- [ ] **P0-002:** First learning session — Maestro E2E
  - Blocked by: EAS dev build APK (R-012)
  - Seed: `onboarding-complete`
  - Estimated: 6-8 hours

- [ ] **P0-003:** Recall + SM-2 — Maestro E2E
  - Blocked by: EAS dev build APK (R-012)
  - Seed: `retention-due`
  - Estimated: 4-6 hours

---

## Test Execution Evidence

### Full Integration Suite Run (GREEN Phase Verification)

**Command:** `pnpm exec jest --config tests/integration/jest.config.cjs`

**Results:**

```
Test Suites: 6 passed, 6 total
Tests:       66 passed, 66 total
Snapshots:   0 total
Time:        19.146 s
```

**Summary:**

- Total tests: 66
- Passing: 66
- Failing: 0
- Status: GREEN — all API integration tests verified

---

## Knowledge Base References Applied

- **api-testing-patterns.md** — Pure API tests via `app.request()`, service mocking pattern
- **data-factories.md** — Builder pattern with `@eduagent/factory`
- **test-quality.md** — <300 lines, deterministic, isolated, no hard waits

See `_bmad/tea/testarch/tea-index.csv` for complete knowledge fragment mapping.

---

## Next Steps

1. **P0-004 + P0-008** — Write remaining API integration tests (account deletion, session-completed chain)
2. **R-012** — Produce EAS dev build APK to unblock Maestro E2E tests
3. **Maestro setup** — Expand from 4 skeleton flows to P0 smoke flows
4. **CI integration** — Add integration tests to PR pipeline (parallel with unit tests)

---

**Generated by BMad TEA Agent** — 2026-02-22
