---
title: Service-layer granular consent gating — Implementation Plan
date: 2026-07-31
profile: code
work_items: [WI-2543]
status: in-progress
---

# Service-layer granular consent gating — Implementation Plan

**Goal:** Keep deterministic branches available after consent withdrawal while every request-time LLM dispatch on the five named routes remains consent-gated and fails closed.

**Approach:** Remove only the five unconditional route-entry checks and place `assertLlmConsent(db, profileId)` immediately before each corresponding service-owned LLM dispatch. Preserve route authorization and metering order. Extend the existing LLM call-site manifest guard with explicit granular-boundary records so the five mixed routes cannot drift back to route over-gating or lose their service gate.

## Scope

In scope:

- `apps/api/src/routes/{books,sessions,subjects,assessments,book-suggestions}.ts`
- `apps/api/src/routes/{books,sessions,subjects,assessments,book-suggestions}.test.ts`
- `apps/api/src/services/curriculum.ts` and `curriculum.test.ts`
- `apps/api/src/services/session/session-crud.ts`, `session-topic-matcher.ts`, and `session-crud.test.ts`
- `apps/api/src/services/subject.ts` and `subject.test.ts`
- `apps/api/src/services/assessments.ts` and `assessments-submit-answer.test.ts`
- `apps/api/src/services/suggestions.ts` and `suggestions.test.ts`
- `apps/api/src/middleware/metering.coverage.manifest.ts` and `metering.coverage.guard.test.ts`
- `.workitem-artifacts/WI-2543/red-green-revert.md`
- This plan

Out of scope:

- Schemas, migrations, database/environment/secret changes, deployments, prompt/model behavior, metering policy changes, and unrelated consent routes.
- Cleanup of pre-existing internal mocks in the five large route test harnesses; those files already carry GC6 deferrals, and this change will record their remaining counts in the commit body.

## Production shapes

The gate is a secure default; test seams may override it only through existing service dependency/options objects:

```ts
await (deps.assertLlmConsent ?? assertLlmConsent)(db, profileId);
return deps.generateLlmBackedResult(...);
```

For `first-curriculum`, two service-internal LLM boundaries exist on current main and both must be covered: `materializeFocusedBookTopics → generateBookTopics` when a focused book has no topic, and `matchTopicByIntent → runTopicIntentMatcher` after deterministic explicit-topic / flag-off / no-input / no-topics returns.

Consent errors must be raised outside any LLM-fallback `try/catch`; otherwise withdrawal could be swallowed and converted into a deterministic fallback.

## Tasks

- [x] T1: Add focused service and route-path tests for all five routes — done when each deterministic branch runs with an injected rejecting consent gate, each LLM branch refuses before its LLM spy, and unknown subject discriminants take the gated default; focused tests are observed RED before production edits.
- [x] T2: Add the forward guard — done when the manifest names exactly the five mixed route/service boundaries, the guard proves each route handler segment has no route-entry consent assertion, each service boundary contains the assertion before its LLM dispatch token, and a temporary missing-gate/route-over-gate mutation makes the guard RED.
- [x] T3: Move the five route checks to service dispatch boundaries — done when focused tests pass with authorization and metering code unchanged; `books` threads `db/profileId` into `generateBookTopicsWithFallback`, `first-curriculum` covers both materialization and matching, and assessment/suggestion fallback catches cannot swallow `ConsentWithdrawnError`.
- [x] T4: Produce red → green → production-revert → restored-green evidence — done when the same focused command fails on tests-before-code, passes on final code, fails after temporarily reverting the production gate movement, and passes again after restoring the exact final production diff; results are recorded in `.workitem-artifacts/WI-2543/red-green-revert.md`.
- [x] T5: Run routed validation and fresh-base reconciliation — done when focused suites, API typecheck/lint, `git diff --check`, and `bash scripts/check-change-class.sh --run --fast` pass; after a fresh `origin/main` fetch the branch is reconciled without losing the WI diff and required validation is rerun.
- [x] T6: Publish through the sanctioned flow — done when the commit skill creates and pushes the own-work commit on `WI-2543`, a non-draft PR references WI-2543, and `cosmo:execute pr-opened` records its URL without running `execute complete`, review, merge, or close.

## Self-review

- Spec coverage: T1/T3 cover all five refined paths plus the hidden same-route materialization dispatch; T2 covers the forward ratchet; T4 provides the requested mutation evidence; T5 preserves validation/base freshness; T6 matches the requested stopping point.
- Deferred-decision scan: no placeholders or unspecified error behavior remain. Deterministic exemptions are enumerated; all other/default paths gate.
- Name/type consistency: production and tests use the existing `assertLlmConsent`, `ConsentWithdrawnError`, and service function names; no schema or wire type is added.
