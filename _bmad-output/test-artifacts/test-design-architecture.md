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

**Date:** 2026-02-23 (revised)
**Author:** Murat (TEA) for Zuzana
**Status:** Architecture Review Pending — URGENT (audit findings require immediate attention)
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
- **Key Decision 2:** Multi-provider LLM routing by escalation rung — currently Gemini only; Claude/GPT-4 planned
- **Key Decision 3:** SM-2 spaced repetition as library, Inngest for durable background jobs

**Expected Scale** (from ADR):

- MVP: ~2K users, scaling to ~10K (LLM connection pooling inflection point)

**Risk Summary:**

- **Total risks**: 18 (original 12 + 5 from code audit + 1 LLM cost strategy)
- **Critical (fix immediately)**: 4 findings from code audit
- **High-priority (score >=6)**: 4 original risks, now with deeper detail from audit
- **Test effort**: ~40 test scenarios (~4-6 weeks for 1 QA, increased from 33 due to new coverage)

**What Changed in v2:** A code audit (3 parallel agents, 46+ source files) uncovered 47 findings. The most significant: consent determination is entirely client-side (COPPA/GDPR bypass), no post-response LLM validation for homework mode, no content safety filtering for minors, and the SM-2 retention pipeline silently breaks for new topics because retention cards are never created during the learning flow.

---

## Quick Guide

### BLOCKERS - Team Must Decide (Can't Proceed Without)

**Pre-Implementation Critical Path** — These MUST be completed before QA can write E2E tests:

1. **R-002: Test data seeding endpoints** — Implement `POST /v1/__test/seed` and `POST /v1/__test/reset` (guarded by NODE_ENV=test). Without these, Maestro flows cannot seed scenarios or clean state between runs. (recommended owner: Backend Dev)
2. **R-012: EAS dev build APK** — Produce and cache a working Expo dev build APK for Maestro CI. Currently no runnable E2E flows exist. (recommended owner: Mobile Dev + DevOps)

**What we need from team:** Complete these 2 items pre-implementation or E2E test development is blocked.

---

### CRITICAL CODE FIXES - From Audit (Must Fix Before Any Testing)

**These are implementation defects found in the existing codebase. They must be fixed before the test plan can validate the intended behavior.**

1. **AUDIT-001: Consent determination is entirely client-side** — A child can select "OTHER" region or skip region selection to bypass COPPA/GDPR entirely. The server never verifies region or age. The ADR specifies server-side enforcement (line 348: "application middleware maps to profile and enforces access rules") but the implementation only checks client-side. **Fix:** Use Cloudflare's `cf.country` header, store location in profiles table, enforce consent check in `createProfile()` and as API middleware on all data-collecting endpoints. (owner: Backend Dev, timeline: immediate)

2. **AUDIT-002: No content safety filtering for minors** — Gemini `SafetySettings` are never configured. Raw LLM output goes directly to users aged 11-17 with no safety thresholds. **Fix:** Configure explicit `SafetySettings` in `services/llm/providers/gemini.ts` with thresholds appropriate for minors. (owner: Backend Dev, timeline: immediate)

3. **AUDIT-003: Mock provider silent fallback** — Missing `GEMINI_API_KEY` silently registers the mock provider. Students would see "Mock response to: ..." in production. This directly violates ADR enforcement rule #10 ("Missing var → fail immediately with clear error"). **Fix:** Throw at startup if `GEMINI_API_KEY` is missing when `NODE_ENV !== 'test'`. Add to health check endpoint. (owner: Backend Dev, timeline: immediate)

4. **AUDIT-004: Retention cards never created in learning flow** — The SM-2 pipeline assumes `topic_schedules` records exist, but no code path creates them when a topic is first learned. Tests pass because they seed data. In production, the entire spaced repetition feature silently does nothing for new topics. **Fix:** Upsert retention card in `updateRetentionFromSession` or create during session start when a topic is first assigned. (owner: Backend Dev, timeline: immediate)

**What we need from team:** Fix these 4 issues before QA begins writing tests. Tests written against the current code would validate broken behavior.

---

### HIGH PRIORITY - Team Should Validate (We Provide Recommendation, You Approve)

1. **R-001: COPPA/GDPR consent flow completeness** — Code audit confirmed: consent enforcement exists only client-side; consent tokens have no expiry; birthDate is mutable without consent re-evaluation; race condition between parent approval and day-30 auto-delete. See detailed audit findings in Risk Mitigation Plans. (recommended owner: Backend Dev + Legal)
2. **R-003: LLM response quality validation** — Code audit confirmed: homework Socratic enforcement is purely prompt-based with no post-response validation; single-provider dependency (Gemini only, no fallback/circuit breaker); no context window management; prompt injection risk from raw user input. (recommended owner: AI/ML Lead + Backend Dev)
3. **R-004: SM-2 algorithm correctness** — Code audit confirmed: double-counting between sync `processRecallTest()` and async `session.completed` Inngest job; `processRecallTest` hardcodes success for missing cards; `canRetestTopic()` anti-cramming function exists but is never called; needs-deepening quality defaults to 3 (always passes). (recommended owner: Backend Dev)

**What we need from team:** Review audit findings, approve mitigation plans, assign owners.

---

### INFO ONLY - Solutions Provided (Review, No Decisions Needed)

1. **Test strategy**: Maestro YAML flows (mobile E2E) + Hono `app.request()` (API integration) + Jest 30 (unit). No new frameworks.
2. **Tiered execution**: Tier 1 smoke on every PR (~10-15 min), Tier 2 full nightly (~30-45 min)
3. **Coverage**: ~40 test scenarios prioritized P0-P3 with risk-based classification (increased from 33)
4. **Data isolation**: `@eduagent/factory` builders + DELETE cleanup (neon-http constraint: no transaction rollback)
5. **Quality gates**: P0 = 100% pass, P1 >= 95% pass, critical audit fixes verified
6. **Assumptions**: 4 original assumptions validated and revised (see Assumptions section)

**What we need from team:** Review and acknowledge.

---

## For Architects and Devs - Open Topics

### Risk Assessment

**Total risks identified**: 18 (original 12 + 5 from code audit + 1 LLM cost strategy; R-009 upgraded from low to medium)

#### Code Audit Critical Findings (Fix Immediately)

These were discovered by a structured code audit (3 parallel agents, 46+ source files). They represent gaps between the ADR specification and the current implementation.

| Finding ID | Category | Description | Severity | Fix Complexity | Owner |
|------------|----------|-------------|----------|---------------|-------|
| **AUDIT-001** | **SEC** | Consent determination entirely client-side — trivially bypassable. ADR specifies server-side enforcement. | **CRITICAL** | Medium (add middleware + cf.country check) | Backend Dev |
| **AUDIT-002** | **SEC** | No Gemini SafetySettings — raw LLM output to minors with no safety thresholds | **CRITICAL** | Low (configure SafetySettings in gemini.ts) | Backend Dev |
| **AUDIT-003** | **OPS** | Mock provider silent fallback — missing API key = echo mode in production. Violates ADR rule #10. | **CRITICAL** | Low (throw at startup) | Backend Dev |
| **AUDIT-004** | **DATA** | No retention card creation in learning flow — SM-2 pipeline silently broken for all new topics | **CRITICAL** | Medium (add upsert in updateRetentionFromSession) | Backend Dev |
| **AUDIT-005** | **DATA** | processRecallTest hardcodes success for missing card — bypasses SM-2, awards free XP | **HIGH** | Low (return error instead of success) | Backend Dev |

#### High-Priority Risks (Score >=6) - IMMEDIATE ATTENTION

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
|---------|----------|-------------|-------------|--------|-------|------------|-------|----------|
| **R-001** | **SEC** | COPPA/GDPR consent bypass — under-16 data processed without valid parental consent. **Audit confirmed: 10 findings including client-side-only enforcement, no token expiry, mutable birthDate, approve/delete race condition.** | 3 | 3 | **9** | Server-side consent enforcement + token expiry + immutable birthDate + atomic delete guard. See detailed mitigation below. | Backend + Legal | Pre-launch |
| **R-002** | **TECH** | No test data seeding infrastructure — `__test/seed` and `__test/reset` endpoints not implemented | 2 | 3 | **6** | Implement seed endpoint with 8 scenarios (from e2e-testing-strategy.md) | Backend Dev | Pre-E2E development |
| **R-003** | **BUS** | LLM response quality regression — **Audit confirmed: prompt-only Socratic enforcement, no post-response validation, single Gemini dependency (no fallback/circuit breaker), no context window management, prompt injection risk.** | 3 | 3 | **9** (raised from 6) | Post-response validation + SafetySettings + circuit breaker + context truncation. See detailed mitigation below. | AI/ML Lead + Backend Dev | Implementation phase |
| **R-004** | **DATA** | SM-2 spaced repetition correctness — **Audit confirmed: double-counting between sync/async paths, missing retention cards, hardcoded success for missing cards, anti-cramming never enforced, needs-deepening always passes.** | 3 | 3 | **9** (raised from 6) | Fix double-counting + create cards in learning flow + wire canRetestTopic() + fix quality default. See detailed mitigation below. | Backend Dev | Implementation phase |

**Score changes:** R-003 and R-004 raised from 6 to 9. The code audit increased probability from 2→3 (confirmed, not theoretical) and revealed that impact extends beyond the originally assessed scope.

#### Medium-Priority Risks (Score 3-5)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
|---------|----------|-------------|-------------|--------|-------|------------|-------|
| R-005 | SEC | Profile isolation leakage — cross-profile data access in family accounts | 2 | 2 | 4 | Integration tests for scoped repository boundaries | Backend Dev |
| R-006 | BUS | Stripe webhook reliability — missed webhooks = incorrect subscription state | 2 | 2 | 4 | Integration tests simulating webhook scenarios | Backend Dev |
| R-008 | TECH | Inngest event chain integrity — step failures should not cascade | 2 | 2 | 4 | Integration tests with step failure injection | Backend Dev |
| R-010 | BUS | OCR homework capture accuracy — ML Kit on-device, no server fallback | 2 | 2 | 4 | Manual testing with diverse input samples | Mobile Dev |
| **R-013** | **SEC** | **No API-side consent enforcement — data-collecting endpoints have zero consent status check (from audit)** | 2 | 3 | **6** | Add consent middleware to all data endpoints | Backend Dev |
| **R-014** | **SEC** | **No minimum age (11) enforcement — 5-year-old can create an account (from audit)** | 2 | 2 | **4** | Add age validation in createProfile() | Backend Dev |
| R-009 | OPS | CI E2E advisory mode with no flake tracking — `continue-on-error: true` silently ignores failures including real regressions; no mechanism exists to measure flake rate for promotion to blocking | 2 | 2 | 4 | Track E2E pass/fail in GitHub Actions job summaries. Promotion criteria: 20 consecutive green nightly runs → remove `continue-on-error: true`. | DevOps + QA |
| **R-016** | **BUS** | **LLM API cost in E2E CI — no strategy for mock vs real Gemini in test pipelines. Real calls = non-deterministic + ~$0.01-0.05/test. No decision documented.** | 2 | 2 | **4** | Tiered: omit `GEMINI_API_KEY` in PR workflow (auto-fallback to mock), set it only in nightly (validates real integration). E2E assertions on response structure, not content. | QA + DevOps |

#### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
|---------|----------|-------------|-------------|--------|-------|--------|
| R-007 | PERF | SSE streaming reconnection — partial response handling on disconnect | 1 | 2 | 2 | Monitor |
| R-011 | SEC | Account deletion completeness — GDPR orchestrator must purge all tables + external systems | 2 | 2 | 4 | Integration test for deletion chain |
| R-012 | TECH | Maestro infrastructure maturity — 4 skeleton flows, none runnable, no cached APK | 2 | 2 | 4 | Build and cache EAS dev build, expand flows |
| R-015 | SEC | Consent token replay — already-responded tokens can flip consent status (from audit) | 1 | 2 | 2 | Add one-time-use guard on consent response endpoint |

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

#### 2. Critical Code Fixes Required Before Testing (NEW — from audit)

| Concern | Impact | What Must Be Fixed | Owner | Timeline |
|---------|--------|-------------------|-------|----------|
| **Client-side consent only** | Tests would validate broken consent flow — all consent E2E tests are invalid until server-side enforcement exists | Move consent determination to API: use `cf.country`, add consent middleware to data endpoints, make birthDate immutable | Backend Dev | Before any consent test |
| **No retention card creation** | SM-2 E2E chain tests will pass with seeded data but fail to catch that production has no card creation | Add retention card upsert in `updateRetentionFromSession` or session-start topic assignment | Backend Dev | Before SM-2 chain tests |
| **Mock provider fallback** | E2E tests could run against mock provider without anyone knowing | Throw at startup if API key missing in non-test environments | Backend Dev | Before any LLM integration test |
| **No SafetySettings** | Content safety tests cannot validate thresholds that don't exist | Configure explicit Gemini SafetySettings in `gemini.ts` | Backend Dev | Before LLM quality tests |

#### 3. Architectural Improvements Needed (WHAT SHOULD BE CHANGED)

1. **Neon-http driver limits test isolation**
   - **Current problem**: `@neondatabase/serverless` neon-http driver is stateless — no transaction support for test isolation via rollback
   - **Required change**: No code change needed. Use DELETE cleanup pattern (documented in e2e-testing-strategy.md). Accept this as a known constraint.
   - **Impact if not fixed**: N/A — mitigation already designed
   - **Owner**: Accepted trade-off

2. **Rate limiting not implemented**
   - **Current problem**: No rate limiting on API endpoints. Under load or abuse, system has no protection.
   - **Required change**: Implement per-user rate limiting (Cloudflare Workers rate limiting or custom middleware). ADR specifies this in `wrangler.toml` (line 350).
   - **Impact if not fixed**: Cannot run load tests or validate throttling behavior. DoS risk in production.
   - **Owner**: Backend Dev
   - **Timeline**: Post-MVP (not blocking E2E tests)

3. **No LLM circuit breaker** (NEW — from audit)
   - **Current problem**: Single Gemini provider with no fallback, retry, or circuit breaker. ADR specifies circuit breaker (line 134: "trip after 3 consecutive 5xx/timeouts within 30-second window").
   - **Required change**: Implement circuit breaker in `services/llm/router.ts` per ADR specification.
   - **Impact if not fixed**: Total learning outage if Gemini has any downtime. Cannot test resilience.
   - **Owner**: Backend Dev
   - **Timeline**: Implementation phase (before launch)

4. **No context window management** (NEW — from audit)
   - **Current problem**: Full exchange history sent to LLM with no truncation or token counting. Long sessions will exceed context limits.
   - **Required change**: Implement token counting and truncation strategy. ADR session state design (line 129) uses summary row + recent exchanges — verify implementation uses this pattern.
   - **Impact if not fixed**: LLM calls fail silently or produce degraded responses in long sessions.
   - **Owner**: Backend Dev
   - **Timeline**: Implementation phase

5. **LLM E2E testing strategy undecided**
   - **Current problem**: `middleware/llm.ts` lazy-registers real Gemini when `GEMINI_API_KEY` is present, mock when absent. Integration tests use mock (via `setup.ts`). But Maestro E2E flows hit the deployed API where the env var IS set — meaning every E2E test makes real Gemini calls with non-deterministic responses and real cost.
   - **Required change**: Tiered LLM strategy. Omit `GEMINI_API_KEY` from PR smoke workflow (auto-fallback to mock). Set it only in nightly workflow. No code change needed — the existing middleware fallback handles this via env var presence.
   - **Impact if not fixed**: Unpredictable CI costs, non-deterministic E2E assertions on AI responses, potential Gemini rate limiting during test execution.
   - **Owner**: QA + DevOps
   - **Timeline**: Pre-E2E development (must decide before writing Maestro flows that interact with LLM)

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
- `canRetestTopic()` anti-cramming function exists and is well-implemented — just needs to be wired into the request path (audit finding)

#### Accepted Trade-offs (No Action Required)

- **No transaction-based test isolation** — neon-http driver constraint. DELETE cleanup is sufficient for current scale.
- **Android-only E2E at MVP** — iOS Maestro CI requires macOS runners (~10x cost). Add iOS when revenue justifies.
- **No load testing at MVP** — Performance targets defined (p95 <200ms, first token <2s) but no k6/load testing framework. Acceptable for <2K users.
- **E2E in advisory mode** — `continue-on-error: true` in CI. Acceptable while establishing flake baseline. **Promotion path:** track pass/fail in GitHub Actions job summaries; promote to blocking after 20 consecutive green nightly runs. See R-009 for full mitigation.

---

### Risk Mitigation Plans (High-Priority Risks >=6)

#### R-001: COPPA/GDPR Consent Bypass (Score: 9) - CRITICAL

**Code Audit Findings (10 total):**

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | CRITICAL | Consent determination entirely client-side — child can select "OTHER" region or skip to bypass COPPA/GDPR | Use `cf.country` header, store in profiles, enforce in `createProfile()` |
| 2 | HIGH | No API-side consent enforcement — data-collecting endpoints have zero consent check | Add consent middleware to all data endpoints |
| 3 | HIGH | Consent token never expires — `expiresAt` column exists but is never set or checked | Set 30-day expiry on creation, check on response |
| 4 | HIGH | Race condition: approve vs day-30 auto-delete — parent approves at day 29.9 while Inngest fires delete. No transaction, TOCTOU bug. | Atomic delete with `WHERE consent_status != 'CONSENTED'` |
| 5 | HIGH | birthDate mutable via PATCH — age can change without consent re-evaluation | Make birthDate immutable after profile creation (or re-evaluate consent on change) |
| 6 | HIGH | Profile vanishes while child active — day-30 auto-delete has no graceful mobile UX | Add `consent_expiring_soon` event → mobile warning before deletion |
| 7 | MEDIUM | "OTHER" region skips all consent — legal risk in UK, Brazil, etc. | Default to strictest consent requirements for unmapped regions |
| 8 | MEDIUM | Re-request after decline gives opaque 500 error | Handle gracefully — allow new consent request with fresh token |
| 9 | MEDIUM | Email overwrite on re-request, no notification to old parent | Track parent email history, notify old email on change |
| 10 | LOW | `/consent/respond` unauthenticated (by design, UUID entropy mitigates) | Accept — monitor for brute-force patterns |

**Additional findings from second audit pass:**

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 11 | HIGH | No minimum age (11) enforcement — 5-year-old can create account | Add age >= 11 validation in createProfile() |
| 12 | HIGH | No resend limit — can resend consent email infinitely, resetting 30-day clock | Add max 3 resends per profile |
| 13 | HIGH | Consent token replay — already-responded tokens can flip status | Add one-time-use check (reject if status != PENDING) |

**Mitigation Strategy (revised):**

1. **Server-side consent enforcement (AUDIT-001):** Move region determination to API using Cloudflare `cf.country` header. Store `detected_region` in profiles table. Consent check runs in `createProfile()`, not client. Add consent status middleware to all data-collecting API endpoints — reject with 403 if consent status is not `CONSENTED`.
2. **Token lifecycle fixes:** Set `expiresAt` = creation + 30 days on token creation. Check expiry on `/consent/respond`. Reject already-responded tokens (status != PENDING). Limit resends to 3 per profile.
3. **Immutable birthDate:** Remove `birthDate` from PATCH `/profiles/:id` allowed fields. If birthDate must change, re-evaluate consent requirements.
4. **Atomic auto-delete:** Change day-30 Inngest delete to use `WHERE consent_status != 'CONSENTED'` as an atomic condition. Add `consent_expiring_soon` event at day 25 for mobile warning.
5. **Minimum age:** Add `age >= 11` validation in `createProfile()`. Default unmapped regions to strictest consent requirements.
6. **Audit age-gate logic** in auth middleware for all code paths (sign-up, profile creation, family invite)
7. **Test edge cases:** consent timeout, re-request after decline, multiple children under one parent, region change

**Owner:** Backend Dev + Legal
**Timeline:** Pre-launch (AUDIT-001 server-side fix = immediate)
**Status:** Critical — audit findings require code changes before test development
**Verification:** E2E consent flow tests (P0-001, P0-004) + integration test for repository-layer consent check + new integration test for API-side consent middleware

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

#### R-003: LLM Response Quality Regression (Score: 9, raised from 6) - CRITICAL

**Code Audit Findings (10 total):**

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | CRITICAL | No post-response validation — homework Socratic enforcement is purely prompt-based. LLM can return direct answers unchecked. | Add post-response filter for homework mode (start with logging, graduate to blocking) |
| 2 | CRITICAL | No content safety filtering — Gemini SafetySettings never configured | Configure SafetySettings in `gemini.ts` with minor-appropriate thresholds |
| 3 | CRITICAL | Mock provider silent fallback — missing API key = echo mode with no alerting | Throw at startup in non-test environments |
| 4 | HIGH | Single Gemini dependency — no fallback, retry, or circuit breaker | Implement circuit breaker per ADR spec (3 failures/30s, half-open at 60s) |
| 5 | HIGH | No quality regression testing — tests verify prompt assembly with mocks, never actual LLM behavior | Establish offline eval pipeline — weekly canary CI job |
| 6 | HIGH | Prompt injection risk — user messages passed raw to LLM. Teens could override Socratic constraints. | Add input sanitization layer + defense-in-depth system prompts |
| 7 | HIGH | No context window management — full exchange history sent with no truncation or token counting | Implement truncation using session summary row + recent N exchanges per ADR design |
| 8 | MEDIUM | Escalation rung never de-escalates — over-scaffolding risk | Add de-escalation logic when student demonstrates understanding |
| 9 | MEDIUM | Understanding check detection uses simple substring matching — false positives | Improve heuristic or move to LLM-based classification |
| 10 | LOW | Streaming parity is good (minor understanding-check delay) | Accept |

**Mitigation Strategy (revised):**

1. **Content safety (AUDIT-002, immediate):** Configure explicit Gemini `SafetySettings` in `services/llm/providers/gemini.ts` with thresholds appropriate for ages 11-17. This is a low-effort, high-impact fix.
2. **Fail-loud on missing API key (AUDIT-003, immediate):** Replace silent mock registration with a startup error when `GEMINI_API_KEY` is missing in non-test environments. Add API key presence to health check.
3. **Post-response validation (phased):**
   - Phase 1: Log all homework-mode responses with `homeworkMode: true` flag for offline review
   - Phase 2: Build heuristic filter checking for direct-answer patterns (regex + keyword matching)
   - Phase 3: Graduate to LLM-based classification if heuristic proves insufficient
4. **Circuit breaker:** Implement per ADR specification in `services/llm/router.ts` — trip after 3 consecutive 5xx/timeouts within 30-second window, half-open after 60s.
5. **Context window management:** Implement token counting and truncation. Use session summary row + last N exchanges (ADR hybrid model, line 129) instead of full history.
6. **Weekly canary CI job:** Scheduled job that sends fixed prompts to Gemini and validates response schema. Catches API changes before users do.
7. **Model version pinning:** Pin specific Gemini model versions in router config (e.g., `gemini-2.0-flash` not just `gemini-flash`). Extend to Claude/GPT-4 when providers are added.

**Owner:** AI/ML Lead + Backend Dev
**Timeline:** AUDIT-002 and AUDIT-003 = immediate. Circuit breaker and context management = implementation phase. Eval pipeline = ongoing.
**Status:** Critical — audit findings require code changes
**Verification:** Integration test for SafetySettings configuration + startup test for API key presence + weekly canary CI job

#### R-004: SM-2 Spaced Repetition Correctness (Score: 9, raised from 6) - CRITICAL

**Code Audit Findings (11 total from two audit passes):**

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | CRITICAL | No retention card creation in learning flow — SM-2 pipeline broken for all new topics | Upsert card in `updateRetentionFromSession` or on topic assignment |
| 2 | HIGH | processRecallTest hardcodes success for missing card — bypasses SM-2, awards free XP | Return error or create card on-demand |
| 3 | HIGH | Double-counting — sync `processRecallTest()` and async `session.completed` Inngest job both run SM-2 on same card | Skip `updateRetentionFromSession` when `sessionType === 'recall'` or add `lastUpdatedBySessionId` guard |
| 4 | HIGH | Anti-cramming (FR54) never enforced — `canRetestTopic()` exists but is never called in request path | Wire into recall-test route handler |
| 5 | MEDIUM | Needs-deepening quality defaults to 3 → always passes → premature topic resolution (FR63) | Use actual quality from recall test, not default |
| 6 | MEDIUM | Interleaved sessions apply same quality to all topics — misrepresents per-topic retention | Pass per-topic quality scores from assessment results |
| 7 | MEDIUM | No resend limit on consent emails resets 30-day deletion clock (cross-risk with R-001) | Limit resends to 3 |
| 8 | LOW | `nextReviewAt` uses local-time `setDate()` — safe on Workers (UTC), not in local tests | Document as known constraint for local dev |
| 9 | LOW | XP ledger entries may never transition `pending → verified` | Add verification check in recall-test completion path |
| 10 | LOW | SM-2 edge cases (quality 0, quality 5, ease factor floor) — all PASS | No action needed |
| 11 | LOW | Coaching card query, failureCount, startRelearn reset — all PASS | No action needed |

**Mitigation Strategy (revised):**

1. **Create retention cards (AUDIT-004, immediate):** Add upsert logic in `updateRetentionFromSession` — if no `topic_schedules` record exists for the topic, create one with initial SM-2 values before running the algorithm. This is the highest-priority fix because without it, the entire retention feature is non-functional for organically created topics.
2. **Fix processRecallTest for missing cards (AUDIT-005):** Return an error or create the card on-demand instead of hardcoding success. Currently awards XP and reports success for topics that have no retention tracking.
3. **Fix double-counting:** Add a guard in the `session.completed` Inngest handler: skip `updateRetentionFromSession` when `sessionType === 'recall'`, since `processRecallTest` already handled the SM-2 update synchronously.
4. **Wire anti-cramming:** Call `canRetestTopic()` in the recall-test route handler before allowing a re-test. The function already exists and is well-implemented — it just needs one import and one call.
5. **Fix needs-deepening quality:** Pass actual quality score from the recall test result instead of defaulting to 3. Current default means FR63 auto-promotion fires too easily.
6. **Validate full chain:** recall test answer → `processRecallTest()` → SM-2 calculation → `topic_schedules` update → coaching card refresh
7. **Test edge cases:** quality score 0 (complete failure, 3+ failures → redirect to Learning Book), quality score 5 (perfect recall), interleaved session quality per-topic

**Owner:** Backend Dev
**Timeline:** AUDIT-004 and AUDIT-005 = immediate. Double-counting and anti-cramming = implementation phase.
**Status:** Critical — audit findings require code changes before test development
**Verification:** Integration test covering: card creation → recall → SM-2 → schedule update → coaching card chain. Separate test for anti-cramming enforcement.

---

### Assumptions and Dependencies (Validated)

#### Assumptions (Revised after validation against source documents)

1. **Neon PostgreSQL backup and recovery** — Valid if on a paid plan with PITR enabled. The ADR targets 99.99% data durability (line 59) but does not specify the Neon plan tier. Neon's free tier has 24-hour branch history only, which is insufficient. **Action:** Confirm the Neon plan supports PITR. No custom DR needed at MVP scale (~2K users).

2. **Cloudflare Workers zero-downtime deployments** — Valid on Workers. Workers deployments are atomic per-request (zero-downtime). However, if the fallback to Railway is triggered (ADR line 109), the deployment model changes to Docker containers requiring explicit rollback and health check configuration. **Action:** No change for MVP on Workers. Document Railway deployment requirements in the fallback plan.

3. **Clerk handles JWT issuance and session management. All authorization logic is custom and must be tested.** (Revised — original wording was "Clerk handles auth security, we test integration not Clerk internals.") The ADR (line 348) explicitly states: "Clerk provides authenticated user identity; application middleware maps to profile and enforces access rules." Consent state, profile isolation, age-gating, and RBAC are all custom code in `middleware/auth.ts`, `middleware/profile-scope.ts`, and the consent service. The code audit confirmed that consent enforcement is entirely client-side — the server-side enforcement specified in the ADR is not implemented. **Action:** Test the full custom middleware chain (auth, profile scope, consent) as your own code, not as a third-party integration.

4. **LLM provider APIs may change. Model versions must be pinned. A canary CI job validates response schemas.** (Revised — original wording was "LLM providers maintain backward-compatible APIs, no version pinning beyond SDK versions.") The ADR states "Multi-provider (Claude, GPT-4, Gemini Flash)" but the implementation has only `gemini.ts` and `mock.ts` (ADR line 1245: "currently Gemini only; Claude, GPT-4 planned"). Single-provider dependency increases the impact of any Gemini API change. **Action:** Pin Gemini model versions in `router.ts` config. Add weekly canary CI job. Extend to Claude/GPT-4 when providers are added.

#### Dependencies

1. **EAS dev build APK** — Required before any Maestro flow can execute in CI
2. **`__test/seed` endpoint** — Required before Maestro flows can create meaningful test scenarios
3. **Sentry DSN configuration** — Required before error tracking can be validated (pre-launch config, not code)
4. **AUDIT critical fixes (AUDIT-001 through AUDIT-004)** — Required before QA can write tests that validate intended behavior (NEW)

#### Risks to Plan

- **Risk**: LLM API cost during E2E tests could be significant if tests hit real providers
  - **Impact**: Expensive CI runs (~$5-20/day for nightly suite with real Gemini), potential rate limiting, non-deterministic AI responses causing flaky assertions
  - **Decision**: Tiered strategy leveraging existing `middleware/llm.ts` fallback behavior:
    - **PR smoke** (`e2e-ci.yml`): Do NOT set `GEMINI_API_KEY` → middleware auto-registers mock → deterministic, free, fast
    - **Nightly full** (scheduled workflow): Set `GEMINI_API_KEY` with Gemini Flash → validates real LLM integration, catches API contract changes
    - **E2E assertions**: Assert on response *structure* (SSE events received, session state updated, exchange count incremented), never on AI response *content*
  - **No code change required**: The existing middleware pattern handles this entirely via CI environment configuration.

- **Risk**: Audit critical fixes may require schema changes that invalidate existing test infrastructure (NEW)
  - **Impact**: Seed scenarios and factory builders may need updates after consent middleware and retention card fixes
  - **Contingency**: Coordinate fix implementation with QA to update seed scenarios in parallel

---

### Code Audit Cross-Cutting Pattern

The code audit surfaced a consistent pattern across all three risk areas: **the codebase implements happy paths correctly but lacks defensive depth.** Consent checks exist but only client-side. Socratic enforcement exists but only in prompts. Anti-cramming logic exists but is never wired in. The business logic is sound, but the guardrails that prevent misuse or edge-case failures are declared but not enforced.

The fix pattern is also consistent: move trust boundaries server-side, add post-hoc validation, and wire up the defensive functions that already exist.

---

**End of Architecture Document**

**Next Steps for Architecture Team:**

1. **IMMEDIATE:** Fix AUDIT-001 through AUDIT-004 (4 critical code defects)
2. Review Quick Guide (BLOCKERS / CRITICAL FIXES / HIGH PRIORITY / INFO ONLY) and prioritize
3. Assign owners and timelines for high-priority risks (>=6), now including raised scores for R-003 and R-004
4. Validate revised assumptions — especially confirm Neon plan tier
5. Provide feedback to QA on testability gaps

**Next Steps for QA Team:**

1. Wait for AUDIT critical fixes before writing tests against affected subsystems
2. Wait for pre-implementation blockers to be resolved (R-002 seed endpoint, R-012 dev build)
3. Refer to companion QA doc (`test-design-qa.md`) for updated test scenarios
4. Begin test infrastructure setup (Maestro flow templates, seed scripts)