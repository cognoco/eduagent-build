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

**Date:** 2026-02-22
**Author:** Murat (TEA) for Zuzana
**Status:** Draft
**Project:** EduAgent

**Related:** See Architecture doc (`test-design-architecture.md`) for testability concerns and architectural blockers.

---

## Executive Summary

**Scope:** System-level E2E and integration testing for all 6 MVP epics (105 FRs). Covers mobile E2E (Maestro), API integration (Hono `app.request()`), and background job chains (Inngest).

**Risk Summary:**

- Total Risks: 12 (4 high-priority score >=6, 4 medium, 4 low)
- Critical Categories: SEC (consent/deletion), DATA (SM-2 correctness), BUS (LLM quality, billing)

**Coverage Summary:**

- P0 tests: ~8 (critical paths, security, data integrity)
- P1 tests: ~10 (important features, integration flows)
- P2 tests: ~10 (edge cases, secondary features)
- P3 tests: ~5 (exploratory, visual, resilience)
- **Total**: ~33 test scenarios (~3-5 weeks with 1 QA)

---

## Not in Scope

| Item | Reasoning | Mitigation |
|------|-----------|------------|
| **Language Learning (Epic 6)** | Deferred to v1.1 per PRD | Architecture designed for extensibility; test when implemented |
| **iOS E2E** | macOS CI runners ~10x cost; Android-only at MVP | Manual iOS testing pre-launch; add iOS CI when revenue justifies |
| **Load/performance testing** | <2K users at MVP; no k6 infrastructure yet | Monitor latency metrics in production; add when approaching 5K users |
| **LLM response content quality** | Requires human evaluation baseline and rubrics | Log escalation rung distribution for anomaly detection |
| **Offline mode** | Deferred to v2.0 | N/A |

---

## Dependencies & Test Blockers

**CRITICAL:** QA cannot proceed without these items from other teams.

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
   - Expand from 4 skeleton flows to full Tier 1 suite (4 smoke flows)
   - Add `_setup/` seed flows using GraalJS http module
   - Tag flows with `smoke` (Tier 1) and `full` (Tier 2)

2. **API Integration Test Expansion** — QA
   - Extend existing 3 integration test suites to cover all critical chains
   - Add Inngest chain integration tests using `createInngestStepMock()`
   - Add Stripe webhook simulation tests

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

### High-Priority Risks (Score >=6)

| Risk ID | Category | Description | Score | QA Test Coverage |
|---------|----------|-------------|-------|-----------------|
| **R-001** | SEC | COPPA/GDPR consent bypass | **9** | P0-001: Full consent flow E2E; P0-004: Deletion after consent decline |
| **R-002** | TECH | No seeding infrastructure | **6** | BLOCKER — must be resolved before QA can write E2E tests |
| **R-003** | BUS | LLM response quality regression | **6** | P1-006: SSE streaming test validates response structure; integration test for homework mode |
| **R-004** | DATA | SM-2 correctness | **6** | P0-003: Recall + SM-2 chain E2E; P1-002: Failed recall remediation flow |

### Medium/Low-Priority Risks

| Risk ID | Category | Description | Score | QA Test Coverage |
|---------|----------|-------------|-------|-----------------|
| R-005 | SEC | Profile isolation leakage | 4 | P0-006: Profile isolation integration test |
| R-006 | BUS | Stripe webhook reliability | 4 | P0-007: Webhook → subscription state integration test |
| R-008 | TECH | Inngest chain integrity | 4 | P0-008: Session-completed chain integration test |
| R-010 | BUS | OCR accuracy | 4 | P1-001: Camera capture E2E (basic flow only) |
| R-011 | SEC | Deletion completeness | 4 | P0-004: Account deletion chain test |
| R-007 | PERF | SSE reconnection | 2 | P1-006: Streaming flow (happy path) |
| R-009 | OPS | CI advisory mode | 2 | Monitor flake rate; promote when <2% |
| R-012 | TECH | Maestro infrastructure | 4 | BLOCKER — dev build required |

---

## Entry Criteria

**QA testing cannot begin until ALL of the following are met:**

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

---

## Test Coverage Plan

**IMPORTANT:** P0/P1/P2/P3 = **priority and risk level** (what to focus on if time-constrained), NOT execution timing. See "Execution Strategy" for when tests run.

### P0 (Critical)

**Criteria:** Blocks core functionality + High risk (>=6) + No workaround + Affects majority of users

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---------|------------|------------|-----------|-------|
| **P0-001** | FR7-FR10: Consent flow (sign-up -> age gate -> consent request -> parent approval) | E2E (Maestro) | R-001 | Includes EU 11-15 and declined consent paths |
| **P0-002** | FR13-FR16: First learning session (create subject -> interview -> curriculum -> first exchange) | E2E (Maestro) | R-003 | Validates onboarding-to-learning critical path |
| **P0-003** | FR43-FR49: Recall test + SM-2 scheduling (answer -> score -> next review date) | E2E (Maestro) | R-004 | Validates core retention loop |
| **P0-004** | FR10-FR11: Account deletion (request -> grace period -> data purge) | Integration (API) | R-001, R-011 | Verify consent decline = immediate deletion |
| **P0-005** | FR1: Auth token validation (expired token rejected, unauth -> 401) | Integration (API) | R-005 | Already partially covered by auth-chain integration test |
| **P0-006** | FR4-FR6: Profile isolation (parent views child, child cannot view sibling) | Integration (API) | R-005 | Scoped repository boundary validation |
| **P0-007** | FR108-FR117: Stripe webhook -> subscription state sync | Integration (API) | R-006 | Simulate webhook events, verify DB state |
| **P0-008** | Session-completed chain (SM-2 -> coaching card -> activity -> XP) | Integration (API) | R-008 | Inngest step chain with `createInngestStepMock()` |

**Total P0:** ~8 tests

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
| **P1-009** | FR92: Interleaved retrieval (mixed topics, randomized questions) | Integration (API) | — | API-level validation of topic mixing logic |
| **P1-010** | Coaching card display (cached path <1s, fresh with skeleton) | E2E (Maestro) | — | Validates home screen entry point |

**Total P1:** ~10 tests

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
| **P2-009** | FR63: Needs Deepening auto-promotion (3+ successful recalls -> normal) | Integration (API) | — | |
| **P2-010** | Error boundary recovery (graceful degradation) | E2E (Maestro) | — | Force error state, verify recovery UI |

**Total P2:** ~10 tests

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

**Total P3:** ~5 tests

---

## Execution Strategy

**Philosophy:** Run everything in PRs unless there's significant infrastructure overhead. Maestro with 4 smoke flows takes ~5-8 min. API integration tests take ~2-3 min.

**Organized by TOOL TYPE:**

### Every PR: Maestro Smoke + API Integration (~10-15 min)

**All Tier 1 functional tests** (from any priority level):

- 4 Maestro smoke flows: Onboarding (P0-001), First Session (P0-002), Core Learning (P0-003), Retention recall
- API integration tests: all existing suites + new P0 integration tests
- Parallelized: Maestro and API integration run as separate CI jobs

**Why run in PRs:** Fast feedback. Maestro smoke ~5-8 min, API integration ~2-3 min. Both run parallel with main CI.

### Nightly: Full Maestro Suite + Extended Integration (~30-45 min)

**All Tier 1 + Tier 2 flows** (from any priority level):

- Full Maestro suite: All 12 flows (4 smoke + 8 extended)
- Extended API integration: Inngest chains, Stripe webhooks, deletion chain
- Total: ~30-45 min

**Why defer to nightly:** Tier 2 flows require more complex seeding and longer execution.

### Manual / Ad-Hoc

**Tests that cannot be automated:**

- OCR accuracy validation with diverse handwriting samples
- LLM response quality evaluation (requires human judgment)
- Push notification delivery confirmation (real device)
- Stripe live-mode webhook testing (sandbox-only in CI)

---

## QA Effort Estimate

**QA test development effort only** (excludes Backend seeding endpoint work):

| Priority | Count | Effort Range | Notes |
|----------|-------|-------------|-------|
| P0 | ~8 | ~2-3 weeks | Complex: consent flow, SM-2 chain, Inngest chain, Stripe webhooks |
| P1 | ~10 | ~1-2 weeks | Standard: Maestro flows with seeded data |
| P2 | ~10 | ~3-5 days | Edge cases, simple API validation |
| P3 | ~5 | ~1-2 days | Exploratory, visual checks |
| **Total** | ~33 | **~3-5 weeks** | **1 QA engineer, full-time** |

**Assumptions:**

- Includes flow design, YAML/test authoring, debugging, CI integration
- Excludes ongoing maintenance (~10% effort)
- Assumes seed endpoint (R-002) and dev build (R-012) are ready before QA starts
- P0 tests take longer due to complex setup and multi-step flows

---

## Implementation Planning Handoff

| Work Item | Owner | Dependencies/Notes |
|-----------|-------|--------------------|
| Implement `__test/seed` endpoint (8 scenarios) | Backend Dev | Blocks all Maestro flows |
| Implement `__test/reset` endpoint | Backend Dev | Blocks E2E teardown |
| Produce + cache EAS dev build APK | Mobile Dev + DevOps | Blocks Maestro CI |
| Expand Maestro Tier 1 smoke flows (4 flows) | QA | Depends on seed endpoint + APK |
| Write Inngest chain integration tests | QA | Depends on seed endpoint |
| Write Stripe webhook integration tests | QA | Can start independently |
| Write consent flow E2E (P0-001) | QA | Depends on seed endpoint + APK |
| Write SM-2 chain E2E (P0-003) | QA | Depends on seed endpoint + APK |
| Build Tier 2 nightly flows (8 flows) | QA | After Tier 1 stable |
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

---

## Appendix B: Knowledge Base References

- **Risk Governance**: `_bmad/tea/testarch/knowledge/risk-governance.md` — Risk scoring methodology (P x I, 1-9 scale)
- **Test Levels Framework**: `_bmad/tea/testarch/knowledge/test-levels-framework.md` — E2E vs API vs Unit selection
- **Test Quality**: `_bmad/tea/testarch/knowledge/test-quality.md` — Definition of Done (no hard waits, <300 lines, <1.5 min)
- **ADR Quality Readiness**: `_bmad/tea/testarch/knowledge/adr-quality-readiness-checklist.md` — 8-category, 29-criteria NFR evaluation
- **E2E Testing Strategy**: `docs/e2e-testing-strategy.md` — Existing strategy document (Maestro choice, tier system, CI design)

---

**Generated by:** BMad TEA Agent (Murat)
**Workflow:** `_bmad/tea/workflows/testarch/test-design`
**Version:** 4.0 (BMad v6)
