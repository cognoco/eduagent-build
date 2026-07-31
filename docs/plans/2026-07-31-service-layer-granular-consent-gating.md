---
title: Service-layer granular consent gating — Implementation Plan
date: 2026-07-31
profile: code
work_items: [WI-2543]
status: complete
---

# Service-layer granular consent gating — Implementation Plan

**Goal:** Keep deterministic branches available after consent withdrawal while every request-time LLM dispatch on the original five mixed routes and the three sibling session routes remains consent-gated and fails closed.

**Approach:** The original implementation moved five unconditional route-entry checks to their service-owned LLM boundaries. Rework 2 preserves those boundaries, moves summary submission, summary feedback retry, and Recall Bridge checks to their final service dispatches, and makes the request-time route assertion inventory exhaustive. Preserve route authorization and metering order throughout.

## Scope

In scope:

- The original five service boundaries already landed by PR #2774; regression verification only, with no weakening or redesign.
- `apps/api/src/routes/{books,sessions,subjects,assessments,book-suggestions}.ts`
- `apps/api/src/routes/{books,sessions,subjects,assessments,book-suggestions}.test.ts`
- `apps/api/src/services/curriculum.ts` and `curriculum.test.ts`
- `apps/api/src/services/session/session-crud.ts`, `session-topic-matcher.ts`, and `session-crud.test.ts`
- `apps/api/src/services/subject.ts` and `subject.test.ts`
- `apps/api/src/services/assessments.ts` and `assessments-submit-answer.test.ts`
- `apps/api/src/services/suggestions.ts` and `suggestions.test.ts`
- `apps/api/src/middleware/metering.coverage.manifest.ts` and `metering.coverage.guard.test.ts`
- `.workitem-artifacts/WI-2543/red-green-revert.md`
- `apps/api/src/services/session/session-summary.ts` and `session-summary.test.ts`
- `apps/api/src/services/recall-bridge.ts` and `recall-bridge.test.ts`
- `.workitem-artifacts/WI-2543-r2/{red-green-revert.md,completion-summary.md,evidence.json}`
- This plan

Out of scope:

- Schemas, migrations, database/environment/secret changes, deployments, prompt/model behavior, metering policy changes, and unrelated consent routes.
- Cleanup of pre-existing internal mocks in the five large route test harnesses; those files already carry GC6 deferrals, and this change will record their remaining counts in the commit body.
- Four independently deliverable mixed-route findings discovered by the Rework 2 sweep: dictation review rate-limit/payload returns, homework OCR request validation, standard retention cooldown/claim returns, and quick-check missing-session handling. They are classified explicitly in the manifest rather than being silently treated as uniformly LLM-backed.

## Production shapes

The gate is a secure default; test seams may override it only through existing service dependency/options objects:

```ts
await (deps.assertLlmConsent ?? assertLlmConsent)(db, profileId);
return deps.generateLlmBackedResult(...);
```

For `first-curriculum`, two service-internal LLM boundaries exist on current main and both must be covered: `materializeFocusedBookTopics → generateBookTopics` when a focused book has no topic, and `matchTopicByIntent → runTopicIntentMatcher` after deterministic explicit-topic / flag-off / no-input / no-topics returns.

Consent errors must be raised outside any LLM-fallback `try/catch`; otherwise withdrawal could be swallowed and converted into a deterministic fallback.

## Tasks

### Original implementation — landed in PR #2774

- [x] T1: Add focused service and route-path tests for all five routes — done when each deterministic branch runs with an injected rejecting consent gate, each LLM branch refuses before its LLM spy, and unknown subject discriminants take the gated default; focused tests are observed RED before production edits.
- [x] T2: Add the forward guard — done when the manifest names exactly the five mixed route/service boundaries, the guard proves each route handler segment has no route-entry consent assertion, each service boundary contains the assertion before its LLM dispatch token, and a temporary missing-gate/route-over-gate mutation makes the guard RED.
- [x] T3: Move the five route checks to service dispatch boundaries — done when focused tests pass with authorization and metering code unchanged; `books` threads `db/profileId` into `generateBookTopicsWithFallback`, `first-curriculum` covers both materialization and matching, and assessment/suggestion fallback catches cannot swallow `ConsentWithdrawnError`.
- [x] T4: Produce red → green → production-revert → restored-green evidence — done when the same focused command fails on tests-before-code, passes on final code, fails after temporarily reverting the production gate movement, and passes again after restoring the exact final production diff; results are recorded in `.workitem-artifacts/WI-2543/red-green-revert.md`.
- [x] T5: Run routed validation and fresh-base reconciliation — done when focused suites, API typecheck/lint, `git diff --check`, and `bash scripts/check-change-class.sh --run --fast` pass; after a fresh `origin/main` fetch the branch is reconciled without losing the WI diff and required validation is rerun.
- [x] T6: Publish through the sanctioned flow — done when the commit skill creates and pushes the own-work commit on `WI-2543`, a non-draft PR references WI-2543, and `cosmo:execute pr-opened` records its URL without running `execute complete`, review, merge, or close.

### Rework 2 — adversarial bounce repair

- [x] R1: Add service and route controls for all three sibling session paths — saved summary, available feedback, lost retry claim, missing session/topic, and mentor-notice suppression remain deterministic after withdrawal; each LLM-ready service path refuses before its provider dependency.
- [x] R2: Move the three route checks to the final service-owned boundaries — summary submission gates outside the evaluation fallback, retry feedback releases its exact coordination claim when consent refusal occurs, and Recall Bridge gates immediately before `routeAndCall`.
- [x] R3: Make route assertion coverage exhaustive — every production route-entry `assertLlmConsent` belongs to exactly one classified manifest segment, every service-owned mixed route has no route gate, and every service gate precedes its named dispatch token.
- [x] R4: Preserve fail-closed discriminants — the original focused suites retain explicit unknown/future-discriminant coverage; none of the three sibling service contracts introduces a discriminant.
- [x] R5: Produce a fresh production-revert-red → exact restore-green record and a broader 15-suite, 595-case focused green run in `.workitem-artifacts/WI-2543/rework-2-red-green-revert.md`.
- [x] R6: Re-run the focused set, structural guards, routed fast change-class validation, full diff inspection, and secret scan; publish exact file pointers in the Rework 2 lifecycle artifacts.

## Self-review

- Spec coverage: T1–T6 record the landed original five-boundary implementation. R1/R2 cover the three bounced siblings; R3 prevents silent assertion drift; R4 preserves the discriminant default; R5 supplies fresh mutation evidence; R6 supplies attributable standard verification and exact lifecycle pointers.
- Deferred-decision scan: no placeholders or unspecified error behavior remain. Deterministic exemptions are enumerated; all other/default paths gate.
- Name/type consistency: production and tests use the existing `assertLlmConsent`, `ConsentWithdrawnError`, and service function names; dependency options are internal test seams, and no schema or wire type is added.
