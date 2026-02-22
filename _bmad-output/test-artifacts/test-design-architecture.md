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

# Test Design for Architecture: EduAgent

**Purpose:** Architectural concerns, testability gaps, and NFR requirements for review by Architecture/Dev teams. Serves as a contract between QA and Engineering on what must be addressed before test development begins.

**Date:** 2026-02-22
**Author:** Murat (TEA) for Zuzana
**Status:** Architecture Review Pending
**Project:** EduAgent
**PRD Reference:** `docs/prd.md`
**ADR Reference:** `docs/architecture.md`

---

## Executive Summary

**Scope:** System-level E2E and integration test design covering all 6 MVP epics (105 FRs) of the EduAgent AI tutoring platform. Fullstack: Expo React Native mobile + Hono API (Cloudflare Workers) + Neon PostgreSQL + multi-provider LLM orchestration.

**Business Context** (from PRD):

- **Revenue/Impact:** Premium AI tutoring platform. Trial-to-paid conversion target >15%. €18.99-€48.99/mo tiered subscriptions.
- **Problem:** No affordable AI tutor that teaches with memory, structure, verification, and personalization.
- **GA Launch:** Post-beta (target ~10-13 weeks after launch)

**Architecture** (from ADR):

- **Key Decision 1:** Expo SDK 54 + Hono on Cloudflare Workers (edge deployment, scale-to-zero)
- **Key Decision 2:** Multi-provider LLM routing by escalation rung (Claude/GPT-4/Gemini Flash)
- **Key Decision 3:** SM-2 spaced repetition as library, Inngest for durable background jobs

**Expected Scale** (from ADR):

- MVP: ~2K users, scaling to ~10K (LLM connection pooling inflection point)

**Risk Summary:**

- **Total risks**: 12
- **High-priority (score >=6)**: 4 risks requiring immediate mitigation
- **Test effort**: ~60-90 tests (~3-5 weeks for 1 QA)

---

## Quick Guide

### BLOCKERS - Team Must Decide (Can't Proceed Without)

**Pre-Implementation Critical Path** — These MUST be completed before QA can write E2E tests:

1. **R-002: Test data seeding endpoints** — Implement `POST /v1/__test/seed` and `POST /v1/__test/reset` (guarded by NODE_ENV=test). Without these, Maestro flows cannot seed scenarios or clean state between runs. (recommended owner: Backend Dev)
2. **R-012: EAS dev build APK** — Produce and cache a working Expo dev build APK for Maestro CI. Currently no runnable E2E flows exist. (recommended owner: Mobile Dev + DevOps)

**What we need from team:** Complete these 2 items pre-implementation or E2E test development is blocked.

---

### HIGH PRIORITY - Team Should Validate (We Provide Recommendation, You Approve)

1. **R-001: COPPA/GDPR consent flow completeness** — Verify age-gate logic handles all edge cases (EU 11-15, US 11-12, declined consent = immediate deletion). Critical legal risk. (recommended owner: Backend Dev + Legal)
2. **R-003: LLM response quality validation** — Establish baseline quality checks for multi-provider routing. A regression in tutoring quality is invisible without automated validation. (recommended owner: AI/ML Lead)
3. **R-004: SM-2 algorithm correctness** — Unit tests exist (in `@eduagent/retention`) but E2E validation of the full chain (recall test → score → SM-2 → next review date → coaching card update) is missing. (recommended owner: Backend Dev)

**What we need from team:** Review recommendations and approve (or suggest changes).

---

### INFO ONLY - Solutions Provided (Review, No Decisions Needed)

1. **Test strategy**: Maestro YAML flows (mobile E2E) + Hono `app.request()` (API integration) + Jest 30 (unit). No new frameworks.
2. **Tiered execution**: Tier 1 smoke on every PR (~10-15 min), Tier 2 full nightly (~30-45 min)
3. **Coverage**: ~60-90 test scenarios prioritized P0-P3 with risk-based classification
4. **Data isolation**: `@eduagent/factory` builders + DELETE cleanup (neon-http constraint: no transaction rollback)
5. **Quality gates**: P0 = 100% pass, P1 >= 95% pass, high-risk mitigations complete

**What we need from team:** Review and acknowledge.

---

## For Architects and Devs - Open Topics

### Risk Assessment

**Total risks identified**: 12 (4 high-priority score >=6, 4 medium, 4 low)

#### High-Priority Risks (Score >=6) - IMMEDIATE ATTENTION

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
|---------|----------|-------------|-------------|--------|-------|------------|-------|----------|
| **R-001** | **SEC** | COPPA/GDPR consent bypass — under-16 data processed without valid parental consent | 3 | 3 | **9** | Comprehensive E2E consent flow tests + edge case coverage (decline, timeout, re-request) | Backend + Legal | Pre-launch |
| **R-002** | **TECH** | No test data seeding infrastructure — `__test/seed` and `__test/reset` endpoints not implemented | 2 | 3 | **6** | Implement seed endpoint with 8 scenarios (from e2e-testing-strategy.md) | Backend Dev | Pre-E2E development |
| **R-003** | **BUS** | LLM response quality regression — multi-provider routing with no automated quality validation | 2 | 3 | **6** | Define quality assertions for Socratic method compliance (no direct answers in homework mode) | AI/ML Lead | Implementation phase |
| **R-004** | **DATA** | SM-2 spaced repetition correctness — incorrect intervals silently degrade core retention feature | 2 | 3 | **6** | E2E chain validation: recall answer → SM-2 calculation → next_review_date → coaching card | Backend Dev | Implementation phase |

#### Medium-Priority Risks (Score 3-5)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
|---------|----------|-------------|-------------|--------|-------|------------|-------|
| R-005 | SEC | Profile isolation leakage — cross-profile data access in family accounts | 2 | 2 | 4 | Integration tests for scoped repository boundaries | Backend Dev |
| R-006 | BUS | Stripe webhook reliability — missed webhooks = incorrect subscription state | 2 | 2 | 4 | Integration tests simulating webhook scenarios | Backend Dev |
| R-008 | TECH | Inngest event chain integrity — step failures should not cascade | 2 | 2 | 4 | Integration tests with step failure injection | Backend Dev |
| R-010 | BUS | OCR homework capture accuracy — ML Kit on-device, no server fallback | 2 | 2 | 4 | Manual testing with diverse input samples | Mobile Dev |

#### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
|---------|----------|-------------|-------------|--------|-------|--------|
| R-007 | PERF | SSE streaming reconnection — partial response handling on disconnect | 1 | 2 | 2 | Monitor |
| R-009 | OPS | CI E2E advisory mode — failures silently ignored with `continue-on-error: true` | 1 | 2 | 2 | Promote to blocking when flake rate <2% |
| R-011 | SEC | Account deletion completeness — GDPR orchestrator must purge all tables + external systems | 2 | 2 | 4 | Integration test for deletion chain |
| R-012 | TECH | Maestro infrastructure maturity — 4 skeleton flows, none runnable, no cached APK | 2 | 2 | 4 | Build and cache EAS dev build, expand flows |

#### Risk Category Legend

- **TECH**: Technical/Architecture (flaws, integration, scalability)
- **SEC**: Security (access controls, auth, data exposure)
- **PERF**: Performance (SLA violations, degradation, resource limits)
- **DATA**: Data Integrity (loss, corruption, inconsistency)
- **BUS**: Business Impact (UX harm, logic errors, revenue)
- **OPS**: Operations (deployment, config, monitoring)

---

### Testability Concerns and Architectural Gaps

**ACTIONABLE CONCERNS - Architecture Team Must Address**

#### 1. Blockers to Fast Feedback (WHAT WE NEED FROM ARCHITECTURE)

| Concern | Impact | What Architecture Must Provide | Owner | Timeline |
|---------|--------|-------------------------------|-------|----------|
| **No seeding API** | Cannot create test scenarios programmatically for Maestro flows | `POST /v1/__test/seed` with scenario parameter (onboarding-complete, learning-active, retention-due, etc.) | Backend Dev | Pre-E2E development |
| **No reset API** | Cannot clean state between E2E flows; tests pollute each other | `POST /v1/__test/reset` that truncates all tables (NODE_ENV=test guard) | Backend Dev | Pre-E2E development |
| **No EAS dev build** | Maestro CI job cannot execute — no APK to run against | Produce EAS dev build, cache in GitHub Actions (hash of package.json + app.json + eas.json) | Mobile Dev + DevOps | Pre-E2E development |

#### 2. Architectural Improvements Needed (WHAT SHOULD BE CHANGED)

1. **Neon-http driver limits test isolation**
   - **Current problem**: `@neondatabase/serverless` neon-http driver is stateless — no transaction support for test isolation via rollback
   - **Required change**: No code change needed. Use DELETE cleanup pattern (documented in e2e-testing-strategy.md). Accept this as a known constraint.
   - **Impact if not fixed**: N/A — mitigation already designed
   - **Owner**: Accepted trade-off

2. **Rate limiting not implemented**
   - **Current problem**: No rate limiting on API endpoints. Under load or abuse, system has no protection.
   - **Required change**: Implement per-user rate limiting (Cloudflare Workers rate limiting or custom middleware)
   - **Impact if not fixed**: Cannot run load tests or validate throttling behavior. DoS risk in production.
   - **Owner**: Backend Dev
   - **Timeline**: Post-MVP (not blocking E2E tests)

---

### Testability Assessment Summary

**CURRENT STATE - FYI**

#### What Works Well

- API-first design: all business logic accessible via REST routes — supports headless E2E testing via Hono `app.request()`
- `@eduagent/factory` builders provide synthetic test data generation with faker — no production data dependency
- `createScopedRepository(profileId)` enforces data isolation at the repository layer — multi-tenant safe
- 900+ unit tests already cover service logic. 3 API integration test suites validate middleware chain.
- Zod validation on every API input — contract testing built-in
- `testID` attributes on 200+ React Native components — Maestro selectors ready
- Inngest step isolation provides durable execution with automatic retries

#### Accepted Trade-offs (No Action Required)

- **No transaction-based test isolation** — neon-http driver constraint. DELETE cleanup is sufficient for current scale.
- **Android-only E2E at MVP** — iOS Maestro CI requires macOS runners (~10x cost). Add iOS when revenue justifies.
- **No load testing at MVP** — Performance targets defined (p95 <200ms, first token <2s) but no k6/load testing framework. Acceptable for <2K users.
- **E2E in advisory mode** — `continue-on-error: true` in CI. Acceptable while establishing flake baseline (<5% target).

---

### Risk Mitigation Plans (High-Priority Risks >=6)

#### R-001: COPPA/GDPR Consent Bypass (Score: 9) - CRITICAL

**Mitigation Strategy:**

1. Audit age-gate logic in auth middleware for all code paths (sign-up, profile creation, family invite)
2. Verify consent state machine transitions: PENDING -> PARENTAL_CONSENT_REQUESTED -> CONSENTED / declined -> immediate deletion
3. Validate that no data access occurs without CONSENTED status (repository layer enforcement)
4. Test edge cases: consent timeout, re-request after decline, multiple children under one parent

**Owner:** Backend Dev + Legal
**Timeline:** Pre-launch
**Status:** Planned
**Verification:** E2E consent flow tests (P0-001, P0-004) + integration test for repository-layer consent check

#### R-002: No Test Data Seeding Infrastructure (Score: 6) - HIGH

**Mitigation Strategy:**

1. Implement `POST /v1/__test/seed` accepting `{ scenario: string }` with at least 8 scenarios: `onboarding-complete`, `learning-active`, `retention-due`, `failed-recall-3x`, `parent-with-children`, `trial-active`, `trial-expired`, `multi-subject`
2. Implement `POST /v1/__test/reset` that truncates all tables
3. Guard both endpoints with `if (env.NODE_ENV !== 'test') return 403`
4. Wire into Maestro flows via GraalJS `http.post()` or CI pre-step via tsx

**Owner:** Backend Dev
**Timeline:** Pre-E2E development (blocks all Maestro flow work)
**Status:** Planned
**Verification:** Maestro `_setup/seed-test-user.yaml` flow calls seed endpoint successfully

#### R-003: LLM Response Quality Regression (Score: 6) - HIGH

**Mitigation Strategy:**

1. Define quality assertions for homework mode: AI must never provide direct answers (Socratic method compliance)
2. Add response-level checks in integration tests: verify `session.mode === 'guided'` marking for homework sessions
3. Monitor escalation rung distribution — anomalous patterns indicate routing issues

**Owner:** AI/ML Lead
**Timeline:** Implementation phase
**Status:** Planned
**Verification:** Integration test asserting homework session responses don't contain direct answers

#### R-004: SM-2 Spaced Repetition Correctness (Score: 6) - HIGH

**Mitigation Strategy:**

1. Validate full chain: recall test answer -> `processRecallTest()` -> SM-2 calculation -> `topic_schedules` update -> coaching card refresh
2. Verify edge cases: quality score 0 (complete failure, 3+ failures -> redirect to Learning Book), quality score 5 (perfect recall)
3. Confirm `failureAction: redirect_to_learning_book` triggers after 3+ failures

**Owner:** Backend Dev
**Timeline:** Implementation phase
**Status:** Planned
**Verification:** Integration test covering recall -> SM-2 -> schedule update chain

---

### Assumptions and Dependencies

#### Assumptions

1. Neon PostgreSQL will maintain managed backups and point-in-time recovery (no custom DR needed at MVP scale)
2. Cloudflare Workers provides zero-downtime rolling deployments (no blue/green setup needed)
3. Clerk handles auth security (token validation, session management) — we test integration, not Clerk internals
4. LLM providers maintain backward-compatible APIs — no version pinning beyond SDK versions

#### Dependencies

1. **EAS dev build APK** — Required before any Maestro flow can execute in CI
2. **`__test/seed` endpoint** — Required before Maestro flows can create meaningful test scenarios
3. **Sentry DSN configuration** — Required before error tracking can be validated (pre-launch config, not code)

#### Risks to Plan

- **Risk**: LLM API cost during E2E tests could be significant if tests hit real providers
  - **Impact**: Expensive CI runs, potential rate limiting during test execution
  - **Contingency**: Mock LLM responses in E2E tests using test-only middleware, or use lowest-cost model for test runs

---

**End of Architecture Document**

**Next Steps for Architecture Team:**

1. Review Quick Guide (BLOCKERS / HIGH PRIORITY / INFO ONLY) and prioritize blockers
2. Assign owners and timelines for high-priority risks (>=6)
3. Validate assumptions and dependencies
4. Provide feedback to QA on testability gaps

**Next Steps for QA Team:**

1. Wait for pre-implementation blockers to be resolved (R-002 seed endpoint, R-012 dev build)
2. Refer to companion QA doc (`test-design-qa.md`) for test scenarios
3. Begin test infrastructure setup (Maestro flow templates, seed scripts)
