---
title: WI-2514 Sessions Route Internal Mock Cleanup — Implementation Plan
date: 2026-07-31
profile: change
work_items: [WI-2514]
status: in-progress
---

# WI-2514 Sessions Route Internal Mock Cleanup — Implementation Plan

**Goal:** Remove the six deferred internal module mocks from the sessions route unit harness while preserving its real JWT/middleware path, route behavior, and privacy/security regressions.
**Approach:** Keep the existing external/database and explicitly out-of-scope identity-v2 seams. Delete the dead legacy account/profile mocks, then observe the real Sentry, billing, session, and Inngest module exports with narrowly targeted `jest.spyOn` fixtures. Prove the structural cleanup directly and run the focused suite, companion privacy guards, GC1, and the full API surface before review.

## Scope

In scope:
- `apps/api/src/routes/sessions.test.ts` — remove exactly the six deferred mocks and preserve all existing route assertions.
- `docs/plans/2026-07-31-wi-2514-sessions-route-internal-mock-cleanup.md` — execution plan and verification contract.

Out of scope:
- Production route, service, middleware, database, or schema behavior.
- Existing database, identity-v2, ownership/consent, billing-v2, session-crud, interleaved, recall-bridge, mentor-notice, or third-party Inngest Hono test seams.
- Native/mobile behavior, deployment, EAS Update, and production credentials.

## Tasks

- [x] T1: Establish the before-state — done when: the focused sessions route suite is green on untouched `origin/main`, and an exact structural check fails because all six named relative-path mocks are present.
- [x] T2: Remove dead legacy account/profile seams — done when: both module mocks and the redundant `services/profile` `jest.requireMock` mutations are gone, the existing identity-v2 scope fixtures drive retry-filing requests, and the focused sessions route suite remains green.
- [x] T3: Replace the Sentry, billing, session, and Inngest module mocks with targeted spies over their real module exports — done when: no one of the six exact `jest.mock` specifiers remains; the persistent Inngest send spy cannot be restored mid-suite; all pre-existing behavior, error, refund, dispatch, redaction, consent, and ownership assertions pass unchanged.
- [x] T4: Verify the cleanup and regression surface — done when: the exact six-specifier structural check passes, GC1 detector tests and CI-shape GC1 pass, Sentry/Inngest/PII companion tests pass, API typecheck/lint pass, the full API unit suite passes, and the relevant real-database integration manifests pass.
- [ ] T5: Deliver through the BID-33 lifecycle — done when: an independent pre-PR adversarial review has no unresolved findings; the branch is committed/pushed via the repo commit skill; the PR has every automated review thread dispositioned; `cosmo:merge` lands it; `complete --validate` and `complete` succeed at the landed SHA; independent QA/review closes the item; and BID-33 receives the run-log comment.

## Verification Notes

- Structural red/green targets only these exact specifiers: `../services/sentry`, `../services/account`, `../services/profile`, `../services/billing`, `../services/session`, and `../inngest/client`. It must not count retained submodule seams such as `billing/billing-v2` or `session/session-crud`.
- The suite must continue to prove private recitation-setup metadata and `sourceAudit` do not escape, event metadata rejects extra/prototype-pollution input, consent fails closed before LLM work, and cross-profile reads remain guarded.
- The real Inngest object remains loaded so its middleware/configuration stays in the module graph; only `send` is observed and stubbed against network egress.
- Fresh verification passed the normal focused suite and randomized seeds 1, 867, 2514, and 20260731 at 128/128 tests each; independent adversarial reruns also passed seeds 867, 2193, and 2514.
- The full API unit manifest passed 506/506 suites (10,056 passed, 9 skipped), and the full API integration manifest passed 152/152 executed suites (1,142 passed, 51 skipped).
