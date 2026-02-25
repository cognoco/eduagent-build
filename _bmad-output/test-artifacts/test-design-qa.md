---
stepsCompleted: [1, 2, 3, 4, 5]
lastStep: '5'
lastSaved: '2026-02-22'
workflowType: 'testarch-test-design'
inputDocuments:
  - 'docs/prd.md'
  - 'docs/architecture.md'
  - 'docs/epics.md'
  - 'docs/ux-design-specification.md'
  - 'docs/e2e-testing-strategy.md'
---


# Test Design for QA: EduAgent

**Purpose:** Test execution recipe for QA team. Defines what to test, how to test it, and what QA needs from other teams.

**Date:** 2026-02-23 (revised)
**Author:** Murat (TEA) for Zuzana
**Status:** Draft — updated with code audit findings
**Project:** EduAgent

**Related:** See Architecture doc (`test-design-architecture-v2.md`) for testability concerns, audit findings, and architectural blockers.

---

## Executive Summary

**Scope:** System-level E2E and integration testing for all 6 MVP epics (105 FRs). Covers mobile E2E (Maestro), API integration (Hono `app.request()`), and background job chains (Inngest).

**Risk Summary:**

- Total Risks: 18 (original 12 + 5 from code audit + 1 LLM cost strategy; R-009 upgraded)
- Critical Code Fixes Required: 4 (must be fixed before QA can write valid tests)
- Critical Categories: SEC (consent enforcement client-side only), DATA (retention cards never created), BUS (LLM quality, billing)

**Coverage Summary:**

- P0 tests: ~12 (increased from 8 — audit findings added 4 new critical scenarios)
- P1 tests: ~11 (increased from 10 — audit finding added 1 scenario)
- P2 tests: ~11 (increased from 10 — audit finding added 1 scenario)
- P3 tests: ~6 (increased from 5 — audit finding added 1 scenario)
- **Total**: ~40 test scenarios (~4-6 weeks with 1 QA)

**What Changed in v2:** A code audit uncovered that several subsystems have implementation gaps between the ADR specification and the actual code. The most significant: the consent flow can be bypassed entirely from the client, the SM-2 retention pipeline doesn't create cards for new topics, and LLM output goes to minors with no safety filtering. These findings add 7 new test scenarios and change the entry criteria (QA cannot start on affected subsystems until critical fixes land).

---

## Not in Scope

| Item | Reasoning | Mitigation |
|------|-----------|------------|
| **Language Learning (Epic 6)** | Deferred to v1.1 per PRD | Architecture designed for extensibility; test when implemented |
| **iOS E2E** | macOS CI runners ~10x cost; Android-only at MVP | Manual iOS testing pre-launch; add iOS CI when revenue justifies |
| **Load/performance testing** | <2K users at MVP; no k6 infrastructure yet | Monitor latency metrics in production; add when approaching 5K users |
| **LLM response content quality (deep)** | Requires human evaluation baseline and rubrics | Log homework responses for offline review; build eval pipeline over time |
| **Offline mode** | Deferred to v2.0 | N/A |

---

## Dependencies & Test Blockers

**CRITICAL:** QA cannot proceed without these items from other teams.

### Critical Code Fixes (NEW — from audit, must land before QA starts)

These are implementation defects that must be fixed before QA can write valid tests. Testing against the current code would validate broken behavior.

| Fix | What's Wrong | Impact on QA | Owner |
|-----|-------------|-------------|-------|
| **AUDIT-001: Server-side consent** | Consent determination is client-side only — trivially bypassable | All consent E2E tests (P0-001, P0-004, P0-009, P0-010) are invalid until server-side enforcement exists | Backend Dev |
| **AUDIT-002: Gemini SafetySettings** | No content safety filtering for minors | Cannot test content safety thresholds that don't exist (P0-011) | Backend Dev |
| **AUDIT-003: Fail-loud API key** | Missing API key silently uses mock provider | LLM integration tests could unknowingly run against mock (P0-012) | Backend Dev |
| **AUDIT-004: Retention card creation** | Cards never created in learning flow — SM-2 pipeline broken for new topics | SM-2 chain tests (P0-003) would pass with seeded data but miss the real bug | Backend Dev |

### Backend/Architecture Dependencies (Pre-Implementation)

**Source:** See Architecture doc "Quick Guide" for detailed mitigation plans

1. **Test data seeding API (R-002)** — Backend Dev — Pre-E2E development
   - QA needs `POST /v1/__test/seed` with scenario-based seeding (8 scenarios minimum)
   - QA needs `POST /v1/__test/reset` for state cleanup between flows
   - Without these, Maestro flows cannot create test users, sessions, or edge-case states

2. **EAS dev build APK (R-012)** — Mobile Dev + DevOps — Pre-E2E development
   - QA needs a cached dev build APK for Maestro CI execution
   - Without this, no mobile E2E flows can run in CI

### QA Infrastructure Setup (Pre-Implementation)

1. **Maestro Flow Templates** — QA
   - Expand from 4 skeleton flows to full Tier 1 suite (5 smoke flows, increased from 4)
   - Add `_setup/` seed flows using GraalJS http module
   - Tag flows with `smoke` (Tier 1) and `full` (Tier 2)

2. **API Integration Test Expansion** — QA
   - Extend existing 3 integration test suites to cover all critical chains
   - Add Inngest chain integration tests using `createInngestStepMock()`
   - Add Stripe webhook simulation tests
   - Add consent middleware integration tests (NEW — validates AUDIT-001 fix)
   - Add retention card lifecycle integration test (NEW — validates AUDIT-004 fix)

**Seed endpoint usage pattern:**

```javascript
// e2e/scripts/seed.js — runs in GraalJS (Maestro's embedded JS engine)
// No require() or import — use Maestro's built-in http module
var response = http.post(API_URL + '/v1/__test/seed', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    scenario: 'onboarding-complete',
    email: 'test-e2e@example.com',
  }),
});
output.result = response.body;
```

**API integration test pattern (existing, from `tests/integration/`):**

```typescript
import { app } from '../../apps/api/src/index.js';

test('authenticated request succeeds', async () => {
  const res = await app.request('/v1/profiles', {
    method: 'GET',
    headers: AUTH_HEADERS,
  }, TEST_ENV);

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.profiles).toBeDefined();
});
```

---

## Risk Assessment

**Note:** Full risk details in Architecture doc. This section summarizes risks relevant to QA test planning.

### Critical Code Audit Findings (Must Fix Before Testing)

| Finding ID | Category | Description | QA Impact |
|------------|----------|-------------|-----------|
| **AUDIT-001** | SEC | ~~Consent determination entirely client-side~~ **RESOLVED** — `consentMiddleware` in `middleware/consent.ts` enforces server-side consent gating on all data-collecting routes. 11 unit tests in `consent.test.ts`. | P0-001, P0-004, P0-009, P0-010 unblocked |
| **AUDIT-002** | SEC | ~~No Gemini SafetySettings for minors~~ **RESOLVED** — `SAFETY_SETTINGS_FOR_MINORS` (5 categories) added to `gemini.ts`. `BLOCK_LOW_AND_ABOVE` for sexually explicit, `BLOCK_MEDIUM_AND_ABOVE` for all others. Safety block detection in both sync and streaming paths. 5 new tests. | P0-011 unblocked |
| **AUDIT-003** | OPS | ~~Mock provider silent fallback~~ **RESOLVED** — `llmMiddleware` throws on missing `GEMINI_API_KEY` when `ENVIRONMENT !== 'test'`. Health endpoint reports LLM status. | P0-012 unblocked |
| **AUDIT-004** | DATA | ~~No retention card creation in learning flow~~ **RESOLVED** — `ensureRetentionCard()` at `retention-data.ts:132-169` uses `INSERT ... ON CONFLICT DO NOTHING`. Called by `updateRetentionFromSession()` (Inngest session-completed step 1) and `processRecallTest()`. Tests at `retention-data.test.ts` lines 241-287, 910-919, 992-1013. | P0-003 unblocked |
| **AUDIT-005** | DATA | ~~processRecallTest hardcodes success for missing card~~ **RESOLVED** — `processRecallTest()` at `retention-data.ts:254-329` auto-creates card via `ensureRetentionCard()`, then evaluates answer quality via LLM and runs SM-2 normally. Does NOT hardcode success. Tested at lines 241-287. | P0-003 chain validation complete |

### High-Priority Risks (Score >=6)

| Risk ID | Category | Description | Score | QA Test Coverage |
|---------|----------|-------------|-------|-----------------|
| **R-001** | SEC | COPPA/GDPR consent bypass — **10+ audit findings including client-side-only enforcement** | **9** | P0-001: Full consent flow E2E; P0-004: Deletion after consent decline; P0-009: Server-side consent enforcement (NEW); P0-010: Consent token lifecycle (NEW) |
| **R-002** | TECH | No seeding infrastructure | **6** | BLOCKER — must be resolved before QA can write E2E tests |
| **R-003** | BUS | LLM response quality regression — **10 audit findings including no safety filtering, no post-response validation** | **9** | P0-011: Content safety filtering (NEW); P0-012: API key presence / no mock fallback (NEW); P1-006: SSE streaming + response structure |
| **R-004** | DATA | SM-2 correctness — **11 audit findings including no card creation, double-counting, anti-cramming not wired** | **9** | P0-003: Recall + SM-2 chain (updated to include card creation); P1-002: Failed recall remediation; P1-011: Anti-cramming enforcement (NEW) |

### Medium/Low-Priority Risks

| Risk ID | Category | Description | Score | QA Test Coverage |
|---------|----------|-------------|-------|-----------------|
| R-005 | SEC | Profile isolation leakage | 4 | P0-006: Profile isolation integration test |
| R-006 | BUS | Stripe webhook reliability | 4 | P0-007: Webhook → subscription state integration test |
| R-008 | TECH | Inngest chain integrity | 4 | P0-008: Session-completed chain integration test |
| R-010 | BUS | OCR accuracy | 4 | P1-001: Camera capture E2E (basic flow only) |
| R-013 | SEC | No API-side consent enforcement (audit) | 6 | P0-009: Covered by new consent middleware test |
| R-014 | SEC | No minimum age enforcement (audit) | 4 | P0-009: Covered by consent enforcement test |
| R-011 | SEC | Deletion completeness | 4 | P0-004: Account deletion chain test |
| R-007 | PERF | SSE reconnection | 2 | P1-006: Streaming flow (happy path) |
| R-009 | OPS | CI advisory mode + no flake tracking — silent regression risk, no promotion mechanism | 4 | Track pass/fail in job summaries. Promote to blocking after 20 consecutive green nightly runs. |
| R-012 | TECH | Maestro infrastructure | 4 | BLOCKER — dev build required |
| R-015 | SEC | Consent token replay (audit) | 2 | P0-010: Token lifecycle test |
| **R-016** | **BUS** | **LLM API cost in E2E — no mock/real strategy documented** | **4** | **Tiered: mock in PR (omit API key), real Gemini in nightly (set API key). See Execution Strategy.** |

---

## Entry Criteria

**QA testing cannot begin until ALL of the following are met:**

- [x] **AUDIT-001 fixed:** Server-side consent enforcement implemented — `consentMiddleware` in `middleware/consent.ts` (11 tests)
- [x] **AUDIT-002 fixed:** Gemini SafetySettings configured in `gemini.ts` — 5 safety categories, sync + stream detection (5 tests)
- [x] **AUDIT-003 fixed:** Startup failure on missing API key in non-test environments — `llmMiddleware` throws, health endpoint reports
- [x] **AUDIT-004 fixed:** Retention card creation added to learning flow — `ensureRetentionCard()` upsert in `retention-data.ts`
- [ ] `POST /v1/__test/seed` endpoint implemented and deployed to test environment
- [ ] `POST /v1/__test/reset` endpoint implemented and deployed to test environment
- [ ] EAS dev build APK produced and cached in GitHub Actions
- [ ] Maestro CLI installed in CI (GitHub Actions Android emulator setup verified)
- [ ] PostgreSQL service container confirmed working in CI (already done)
- [ ] All existing 900+ unit tests passing

## Exit Criteria

**Testing phase is complete when ALL of the following are met:**

- [ ] All P0 tests passing (100%)
- [ ] All P1 tests passing (>=95%, failures triaged and accepted)
- [ ] No open high-priority bugs (P0/P1 severity)
- [ ] Maestro smoke suite (Tier 1) runs on every PR without manual intervention
- [ ] CI flake rate <5% for Maestro flows
- [ ] All 4 AUDIT critical fixes verified by integration tests

---

## Test Coverage Plan

**IMPORTANT:** P0/P1/P2/P3 = **priority and risk level** (what to focus on if time-constrained), NOT execution timing. See "Execution Strategy" for when tests run.

### P0 (Critical)

**Criteria:** Blocks core functionality + High risk (>=6) + No workaround + Affects majority of users

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---------|------------|------------|-----------|-------|
| **P0-001** | FR7-FR10: Consent flow (sign-up -> age gate -> consent request -> parent approval) | E2E (Maestro) | R-001 | Includes EU 11-15 and declined consent paths |
| **P0-002** | FR13-FR16: First learning session (create subject -> interview -> curriculum -> first exchange) | E2E (Maestro) | R-003 | Validates onboarding-to-learning critical path |
| **P0-003** | FR43-FR49: Recall test + SM-2 scheduling (answer -> score -> next review date) | E2E (Maestro) | R-004, AUDIT-004 | **Updated:** Must verify retention card is created during learning (not just seeded). Validates core retention loop including card creation -> recall -> SM-2 -> schedule update. |
| **P0-004** | FR10-FR11: Account deletion (request -> grace period -> data purge) | Integration (API) | R-001, R-011 | Verify consent decline = immediate deletion |
| **P0-005** | FR1: Auth token validation (expired token rejected, unauth -> 401) | Integration (API) | R-005 | Already partially covered by auth-chain integration test |
| **P0-006** | FR4-FR6: Profile isolation (parent views child, child cannot view sibling) | Integration (API) | R-005 | Scoped repository boundary validation |
| **P0-007** | FR108-FR117: Stripe webhook -> subscription state sync | Integration (API) | R-006 | Simulate webhook events, verify DB state |
| **P0-008** | Session-completed chain (SM-2 -> coaching card -> activity -> XP) | Integration (API) | R-008 | Inngest step chain with `createInngestStepMock()` |
| **P0-009** | **AUDIT-001: Server-side consent enforcement** | Integration (API) | R-001, R-013, R-014, AUDIT-001 | **NEW.** Verify: (a) API rejects data-collecting requests when consent status != CONSENTED, (b) region determination uses server-side cf.country not client input, (c) minimum age (11) enforced, (d) birthDate immutable after creation. |
| **P0-010** | **AUDIT: Consent token lifecycle** | Integration (API) | R-001, R-015 | **NEW.** Verify: (a) token has expiresAt set on creation, (b) expired tokens are rejected, (c) already-responded tokens cannot flip status, (d) resend limit (max 3) enforced, (e) auto-delete uses atomic WHERE consent_status != CONSENTED condition. |
| **P0-011** | **AUDIT-002: LLM content safety for minors** | Integration (API) | R-003, AUDIT-002 | **NEW.** Verify: (a) Gemini SafetySettings are configured with minor-appropriate thresholds, (b) API startup fails if GEMINI_API_KEY missing in production/staging. |
| **P0-012** | **AUDIT-003: No mock provider in production** | Integration (API) | R-003, AUDIT-003 | **NEW.** Verify: (a) startup throws error when GEMINI_API_KEY is missing and NODE_ENV != test, (b) health check endpoint reports LLM provider status. |

**Total P0:** ~12 tests (increased from 8)

---

### P1 (High)

**Criteria:** Important features + Medium risk (3-4) + Common workflows + Workaround exists but difficult

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---------|------------|------------|-----------|-------|
| **P1-001** | FR30-FR32: Homework camera capture -> OCR -> chat | E2E (Maestro) | R-010 | Basic flow; OCR accuracy validated manually |
| **P1-002** | FR52-FR58: Failed recall remediation (3x fail -> relearn -> different method) | E2E (Maestro) | R-004 | Requires seed: `failed-recall-3x` scenario |
| **P1-003** | FR67-FR76: Parent dashboard (view children, session counts, retention signals) | E2E (Maestro) | R-005 | Requires seed: `parent-with-children` scenario |
| **P1-004** | FR77-FR85: Multi-subject management (add, switch, pause, auto-archive) | E2E (Maestro) | — | Requires seed: `multi-subject` scenario |
| **P1-005** | FR108-FR117: Subscription trial -> expiry -> upgrade -> quota | E2E (Maestro) | R-006 | Requires seed: `trial-active` and `trial-expired` |
| **P1-006** | FR23-FR24: SSE streaming (start session -> stream AI response) | E2E (Maestro) | R-007 | Happy path only; disconnect handling is P3 |
| **P1-007** | FR59-FR63: Adaptive teaching (three-strike -> direct instruction -> Needs Deepening) | E2E (Maestro) | — | Requires seed: `learning-active` with struggle state |
| **P1-008** | FR67-FR70: Learning Book (browse topics, retention scores, "Your Words") | E2E (Maestro) | — | Read-only flow; validates data display |
| **P1-009** | FR92: Interleaved retrieval (mixed topics, randomized questions) | Integration (API) | R-004 | API-level validation of topic mixing logic |
| **P1-010** | Coaching card display (cached path <1s, fresh with skeleton) | E2E (Maestro) | — | Validates home screen entry point |
| **P1-011** | **FR54: Anti-cramming enforcement** | Integration (API) | R-004, AUDIT | **NEW.** Verify `canRetestTopic()` is called in recall-test route — retest rejected within 24h. Function exists but is not wired in per audit. |

**Total P1:** ~11 tests (increased from 10)

---

### P2 (Medium)

**Criteria:** Secondary features + Low risk (1-2) + Edge cases + Regression prevention

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---------|------------|------------|-----------|-------|
| **P2-001** | FR5: Profile switcher (switch profiles without re-auth) | E2E (Maestro) | — | |
| **P2-002** | FR10: Consent decline -> immediate account deletion | Integration (API) | R-001 | Edge case of P0-004 |
| **P2-003** | FR64-FR66: Teaching method preference persistence per subject | Integration (API) | — | |
| **P2-004** | FR88-FR89: XP ledger (pending -> verified after delayed recall) | Integration (API) | — | |
| **P2-005** | Session close summary screen | E2E (Maestro) | — | Validates SessionCloseSummary display |
| **P2-006** | FR69-FR70: Knowledge decay visualization | E2E (Maestro) | — | Visual validation of retention bars |
| **P2-007** | FR42, FR91: Review reminder push notification | Integration (API) | — | Verify Expo Push API called correctly |
| **P2-008** | Recall bridge after homework session | Integration (API) | — | `POST /v1/sessions/:id/recall-bridge` |
| **P2-009** | FR63: Needs Deepening auto-promotion (3+ successful recalls -> normal) | Integration (API) | R-004 | **Updated:** Audit found quality defaults to 3 (always passes). Verify actual quality is used after fix. |
| **P2-010** | Error boundary recovery (graceful degradation) | E2E (Maestro) | — | Force error state, verify recovery UI |
| **P2-011** | **SM-2 double-counting guard** | Integration (API) | R-004, AUDIT | **NEW.** Verify: recall-test session does not trigger duplicate SM-2 update via session.completed Inngest job. Run processRecallTest, then fire session.completed, assert card updated only once. |

**Total P2:** ~11 tests (increased from 10)

---

### P3 (Low)

**Criteria:** Nice-to-have + Exploratory + Performance benchmarks + Documentation validation

| Test ID | Requirement | Test Level | Notes |
|---------|------------|------------|-------|
| **P3-001** | Three-persona theming (teen dark, learner calm, parent light) | E2E (Maestro) | Visual regression |
| **P3-002** | Math rendering in chat messages | E2E (Maestro) | Verify LaTeX/KaTeX rendering |
| **P3-003** | FR95: Daily push notification | Integration (API) | Verify notification scheduling |
| **P3-004** | FR12: Data export (GDPR) | Integration (API) | Verify export contains all user data |
| **P3-005** | Network resilience (slow/offline handling, SSE reconnection) | E2E (Maestro) | Exploratory |
| **P3-006** | **Consent expiry graceful UX** | E2E (Maestro) | **NEW.** Verify child sees warning before day-30 auto-delete (not just a vanished profile). Exploratory — depends on consent_expiring_soon event being implemented. |

**Total P3:** ~6 tests (increased from 5)

---

## Execution Strategy

**Philosophy:** Run everything in PRs unless there's significant infrastructure overhead. Maestro with 5 smoke flows takes ~6-10 min. API integration tests take ~3-4 min.

**Organized by TOOL TYPE:**

### LLM Provider Strategy (R-016)

**The existing `middleware/llm.ts` fallback behavior makes this zero-code-change:**

| Execution Tier | `GEMINI_API_KEY` in env? | LLM Provider Used | Behavior |
|----------------|--------------------------|-------------------|----------|
| **PR smoke** | No (omit from `e2e-ci.yml`) | Mock provider (auto-fallback) | Deterministic, free, fast. Assertions on response *structure* only. |
| **Nightly full** | Yes (set in scheduled workflow) | Real Gemini Flash | Validates real LLM integration, catches API contract changes. ~$0.01-0.05/test. |
| **Weekly canary** | Yes | Real Gemini Flash | Fixed prompts, schema validation. Catches deprecation/breaking changes. |

**E2E assertion rule:** Never assert on AI response *content* — assert on response *structure* (SSE events received, session state updated, exchange count incremented, response non-empty). Content quality is a manual/ad-hoc concern (see Manual section below).

### Every PR: Maestro Smoke + API Integration (~12-18 min)

**All Tier 1 functional tests** (from any priority level):

- 5 Maestro smoke flows: Onboarding (P0-001), First Session (P0-002), Core Learning (P0-003), Retention recall, Consent enforcement (P0-009 — smoke subset)
- API integration tests: all existing suites + new P0 integration tests (consent middleware, token lifecycle, safety config, mock provider check)
- Parallelized: Maestro and API integration run as separate CI jobs

**Why run in PRs:** Fast feedback. Maestro smoke ~6-10 min, API integration ~3-4 min. Both run parallel with main CI.

### Nightly: Full Maestro Suite + Extended Integration (~35-50 min)

**All Tier 1 + Tier 2 flows** (from any priority level):

- Full Maestro suite: All 14 flows (5 smoke + 9 extended)
- Extended API integration: Inngest chains, Stripe webhooks, deletion chain, anti-cramming, SM-2 double-counting guard
- Total: ~35-50 min

**Why defer to nightly:** Tier 2 flows require more complex seeding and longer execution.

### Weekly: LLM Canary (NEW)

**Scheduled CI job (Saturday night):**

- Send fixed prompts to Gemini API and validate response schema
- Check for model deprecation warnings in response headers
- Alert on failure (Slack/email)
- Purpose: catch Gemini API changes before users do

**Why weekly:** Not daily — LLM APIs don't change that frequently. Weekly catches issues before the next work week.

### Manual / Ad-Hoc

**Tests that cannot be automated:**

- OCR accuracy validation with diverse handwriting samples
- LLM response quality evaluation (requires human judgment — log homework responses for offline review)
- Push notification delivery confirmation (real device)
- Stripe live-mode webhook testing (sandbox-only in CI)

---

## QA Effort Estimate

**QA test development effort only** (excludes Backend fix work for AUDIT findings):

| Priority | Count | Effort Range | Notes |
|----------|-------|-------------|-------|
| P0 | ~12 | ~3-4 weeks | Complex: consent enforcement chain, SM-2 lifecycle, safety config, token lifecycle. 4 new tests from audit. |
| P1 | ~11 | ~1-2 weeks | Standard: Maestro flows with seeded data + anti-cramming test |
| P2 | ~11 | ~3-5 days | Edge cases, simple API validation + double-counting guard |
| P3 | ~6 | ~1-2 days | Exploratory, visual checks |
| **Total** | **~40** | **~4-6 weeks** | **1 QA engineer, full-time** |

**Assumptions:**

- Includes flow design, YAML/test authoring, debugging, CI integration
- Excludes ongoing maintenance (~10% effort)
- Assumes AUDIT critical fixes (AUDIT-001 through AUDIT-004) are complete before QA starts
- Assumes seed endpoint (R-002) and dev build (R-012) are ready before QA starts
- P0 tests take longer due to complex setup and multi-step flows
- Effort increased from 3-5 weeks due to 7 new test scenarios from audit

---

## Implementation Planning Handoff

| Work Item | Owner | Dependencies/Notes |
|-----------|-------|--------------------|
| **Fix AUDIT-001: Server-side consent** | Backend Dev | **Blocks P0-001, P0-004, P0-009, P0-010** |
| **Fix AUDIT-002: Gemini SafetySettings** | Backend Dev | **Blocks P0-011** |
| **Fix AUDIT-003: Fail-loud API key** | Backend Dev | **Blocks P0-012**, validates all LLM tests |
| **Fix AUDIT-004: Retention card creation** | Backend Dev | **Blocks P0-003 validity** |
| Fix AUDIT-005: processRecallTest missing card | Backend Dev | Blocks P0-003 chain accuracy |
| Wire canRetestTopic() into recall-test route | Backend Dev | Blocks P1-011 |
| Fix SM-2 double-counting | Backend Dev | Blocks P2-011 |
| Implement `__test/seed` endpoint (8 scenarios) | Backend Dev | Blocks all Maestro flows |
| Implement `__test/reset` endpoint | Backend Dev | Blocks E2E teardown |
| Produce + cache EAS dev build APK | Mobile Dev + DevOps | Blocks Maestro CI |
| Expand Maestro Tier 1 smoke flows (5 flows) | QA | Depends on seed endpoint + APK + AUDIT fixes |
| Write consent middleware integration tests (P0-009, P0-010) | QA | Depends on AUDIT-001 fix |
| Write safety config integration test (P0-011, P0-012) | QA | Depends on AUDIT-002, AUDIT-003 fixes |
| Write SM-2 lifecycle integration test (P0-003 updated) | QA | Depends on AUDIT-004 fix |
| Write Inngest chain integration tests | QA | Depends on seed endpoint |
| Write Stripe webhook integration tests | QA | Can start independently |
| Write anti-cramming integration test (P1-011) | QA | Depends on canRetestTopic() being wired |
| Build Tier 2 nightly flows (9 flows) | QA | After Tier 1 stable |
| Set up weekly LLM canary CI job | DevOps + QA | After LLM integration tests stable |
| Add nightly CI schedule | DevOps | After Tier 2 flows written |

---

## Interworking & Regression

**Services and components impacted by E2E test development:**

| Service/Component | Impact | Regression Scope | Validation Steps |
|-------------------|--------|-----------------|------------------|
| **API routes (20 groups)** | Integration tests exercise middleware chain | Existing 900+ unit tests must continue passing | Run `pnpm exec nx run-many -t test` before E2E changes |
| **`@eduagent/factory`** | Seed endpoint will use factory builders | Factory builder tests must pass | Run `pnpm exec nx run factory:test` |
| **`@eduagent/database`** | Seed/reset endpoints modify DB directly | Schema migrations must be compatible | Run `pnpm run db:push:dev` before integration tests |
| **Mobile components** | New `testID` attributes may be added | Existing component tests must pass | Run `pnpm exec nx run mobile:test` |
| **Consent middleware (NEW)** | AUDIT-001 fix adds new middleware to all data endpoints | Must not break existing authenticated requests | Run full integration suite after consent middleware lands |
| **LLM provider config (NEW)** | AUDIT-002/003 fixes change startup behavior | Must not break test environment (mock should still work when NODE_ENV=test) | Run LLM unit tests + verify mock provider in test env |
| **Retention service (NEW)** | AUDIT-004 fix changes card creation flow | Must not double-create cards for existing topics | Run retention unit tests + verify upsert behavior |

---

## Appendix A: Code Examples & Tagging

**Maestro Tags for Selective Execution:**

```yaml
# e2e/flows/onboarding/consent-flow.yaml
appId: com.zwizzly.eduagent
tags:
  - smoke
  - onboarding
  - p0
---
- runFlow:
    file: ../_setup/seed-onboarding.yaml
- launchApp:
    clearState: true
- tapOn:
    id: "get-started-button"
- inputText:
    id: "email-input"
    text: "test-consent@example.com"
# ... flow continues
```

**Run specific tags:**

```bash
# Run only smoke tests (Tier 1, PR-level)
maestro test apps/mobile/e2e/flows/ --include-tags=smoke

# Run all P0 tests
maestro test apps/mobile/e2e/flows/ --include-tags=p0

# Run full suite (Tier 1 + Tier 2, nightly)
maestro test apps/mobile/e2e/flows/

# API integration tests
pnpm exec jest --config tests/integration/jest.config.cjs --maxWorkers=2
```

**Maestro seed flow pattern:**

```yaml
# e2e/flows/_setup/seed-onboarding.yaml
appId: com.zwizzly.eduagent
---
- runScript:
    file: ../../scripts/seed.js
    env:
      API_URL: ${API_URL}
      SCENARIO: "onboarding-complete"
```

**NEW: Consent middleware integration test pattern:**

```typescript
import { app } from '../../apps/api/src/index.js';

describe('Consent Middleware (AUDIT-001)', () => {
  test('rejects data request when consent status is PENDING', async () => {
    // Seed a profile with PENDING consent
    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'X-Profile-Id': PENDING_PROFILE_ID },
      body: JSON.stringify({ subjectId: 'test-subject' }),
    }, TEST_ENV);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('CONSENT_REQUIRED');
  });

  test('allows data request when consent status is CONSENTED', async () => {
    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'X-Profile-Id': CONSENTED_PROFILE_ID },
      body: JSON.stringify({ subjectId: 'test-subject' }),
    }, TEST_ENV);

    expect(res.status).toBe(201);
  });
});
```

**NEW: Retention card lifecycle integration test pattern:**

```typescript
describe('Retention Card Lifecycle (AUDIT-004)', () => {
  test('creates retention card during first learning session', async () => {
    // Start a learning session with a new topic (no existing retention card)
    const sessionRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: AUTH_HEADERS_CONSENTED,
      body: JSON.stringify({ subjectId: 'test-subject', topicId: 'new-topic' }),
    }, TEST_ENV);
    expect(sessionRes.status).toBe(201);

    // Complete the session
    // ... (exchange + close)

    // Verify retention card was created
    const retentionRes = await app.request(
      `/v1/retention/topics/new-topic/schedule`,
      { headers: AUTH_HEADERS_CONSENTED },
      TEST_ENV,
    );
    expect(retentionRes.status).toBe(200);
    const schedule = await retentionRes.json();
    expect(schedule.nextReviewAt).toBeDefined();
    expect(schedule.easeFactor).toBeGreaterThanOrEqual(1.3);
  });
});
```

---

## Appendix B: Knowledge Base References

- **Risk Governance**: `_bmad/tea/testarch/knowledge/risk-governance.md` — Risk scoring methodology (P x I, 1-9 scale)
- **Test Levels Framework**: `_bmad/tea/testarch/knowledge/test-levels-framework.md` — E2E vs API vs Unit selection
- **Test Quality**: `_bmad/tea/testarch/knowledge/test-quality.md` — Definition of Done (no hard waits, <300 lines, <1.5 min)
- **ADR Quality Readiness**: `_bmad/tea/testarch/knowledge/adr-quality-readiness-checklist.md` — 8-category, 29-criteria NFR evaluation
- **E2E Testing Strategy**: `docs/e2e-testing-strategy.md` — Existing strategy document (Maestro choice, tier system, CI design)

---

## Appendix C: Audit Finding to Test Mapping

This maps every critical and high audit finding to a specific test scenario, ensuring full coverage.

| Audit Finding | Severity | Test ID(s) | Verification |
|--------------|----------|-----------|-------------|
| AUDIT-001: Client-side consent | CRITICAL | P0-009 | **RESOLVED** — `consentMiddleware` returns 403 `CONSENT_REQUIRED` for pending profiles. 11 unit tests in `consent.test.ts`. |
| AUDIT-002: No SafetySettings | CRITICAL | P0-011 | **RESOLVED** — `SAFETY_SETTINGS_FOR_MINORS` in `gemini.ts`. 5 new tests verify categories, prompt/candidate/stream safety blocks. |
| AUDIT-003: Mock fallback | CRITICAL | P0-012 | **RESOLVED** — `llmMiddleware` throws on missing key. Health endpoint reports LLM status. |
| AUDIT-004: No card creation | CRITICAL | P0-003 (updated) | **RESOLVED** — `ensureRetentionCard()` upsert in `retention-data.ts`. Tests at lines 241-287, 910-919, 992-1013. |
| AUDIT-005: Hardcoded success | HIGH | P0-003 (updated) | **RESOLVED** — `processRecallTest()` auto-creates card + evaluates via LLM. Does not hardcode success. Tested at lines 241-287. |
| R-001 #3: No token expiry | HIGH | P0-010 | Expired token rejected |
| R-001 #4: Approve/delete race | HIGH | P0-010 | Atomic delete condition verified |
| R-001 #5: Mutable birthDate | HIGH | P0-009 | PATCH rejects birthDate change |
| R-001 #11: No min age | HIGH | P0-009 | Age < 11 rejected |
| R-001 #12: No resend limit | HIGH | P0-010 | 4th resend rejected |
| R-001 #13: Token replay | HIGH | P0-010 | Already-responded token rejected |
| R-003 #4: No circuit breaker | HIGH | P1-006 (extended) | Monitor — circuit breaker tested when built |
| R-003 #5: Prompt injection | HIGH | Manual | Exploratory testing with adversarial inputs |
| R-003 #7: No context mgmt | HIGH | Manual | Monitor session length vs response quality |
| R-004 #3: Double-counting | HIGH | P2-011 | Single SM-2 update after recall + session.completed |
| R-004 #4: Anti-cramming | HIGH | P1-011 | Retest within 24h rejected |
| R-004 #5: Needs-deepening | MEDIUM | P2-009 (updated) | Actual quality used, not default 3 |

---

**Generated by:** BMad TEA Agent (Murat), revised with code audit findings
**Workflow:** `_bmad/tea/workflows/testarch/test-design`
**Version:** 4.0-rev2 (BMad v6)