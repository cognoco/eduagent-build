---
title: Inngest fleet failure alerting - Implementation Plan
date: 2026-07-12
profile: code
work_items:
  - WI-1907
status: in-progress
---

# Inngest fleet failure alerting - Implementation Plan

**Goal:** Make every terminal Inngest function failure visible in Sentry under a stable fleet tag, make launch-health bucket signals filterable as real Sentry tags, and make the runbook queries match the emitted telemetry without exposing learner or payer data.

**Approach:** Add one lean catch-all `inngest/function.failed` observer that skips only its own function ID and records bounded operational metadata. Extend the existing bucket observers at their current capture points rather than creating parallel pipelines. Lock both behavior and privacy down with focused tests, then update the operator runbook to use the exact `surface:<value> signal:<value>` tag syntax.

## Scope

- `apps/api/src/inngest/functions/inngest-function-failed-observe.ts` (new fleet observer)
- `apps/api/src/inngest/functions/inngest-function-failed-observe.test.ts` (new behavior/privacy contract)
- `apps/api/src/inngest/index.ts` (register the observer)
- Existing launch-health observers and their focused tests: challenge-round finalization, transcript purge, notification suppression, email bounce/complaint, feedback delivery, Ask classification, and filing timeout/resolution
- `docs/runbooks/launch-health-alerts.md` (real Sentry tag filters and fleet fallback)

## Out of scope

- Creating or changing Sentry alert rules; the operator owns this in OPQ-27 Phase 2 after production evidence exists.
- Sending a synthetic production failure before the code is deployed.
- Adding learner content, event payloads, email addresses, payer identifiers, or provider error messages to Sentry.

## Tasks

- [x] **T1 — Red tests for the fleet observer.** Prove the function triggers on `inngest/function.failed`, is registered, captures every non-self terminal failure with `surface=inngest-fleet`, `signal=function-failed`, and `functionId`, skips only its own ID, and does not forward nested event payloads or error messages.
- [x] **T2 — Implement the fleet observer.** Capture a generic terminal-failure exception with safe tags plus bounded `runId`/`errorName` extras; never copy the failed event payload.
- [x] **T3 — Red tests for bucket tags.** Extend focused observer tests to require stable `surface` and `signal` tags at each existing Sentry escalation while preserving its diagnostic extras.
- [x] **T4 — Promote bucket telemetry.** Add matching tags to the existing capture calls and add countable Sentry messages only where a successful observer currently emits a launch-health signal solely to logs.
- [x] **T5 — Correct the runbook.** Replace pseudo-filter strings and stale event names with the exact Sentry `surface:<value> signal:<value>` filters emitted by T2/T4; document the fleet catch-all as the backstop.
- [ ] **T6 — Verify and ship.** Run focused tests, API typecheck/lint, relevant broader suites and privacy guards; commit with the repo workflow, open a PR, resolve CI/review, merge, and finalize the work item only after the landed commit. Record production proof/operator alert-rule sitting as the remaining external gate if deployment is not part of the autonomous path.

## Verification

- Focused Jest suites for every changed observer and `registration-sync.guard.test.ts`
- API typecheck and lint
- Sentry/privacy guard tests
- PR CI green before merge
- Post-deploy evidence: a natural or deliberately safe synthetic failure in `mentomate-api` filterable by `surface:inngest-fleet` (human-gated production step)
