# WI-78 Race Atomicity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate the WI-78 DeepSec race-condition work package so the affected API/mobile flows do not lose updates, accept stale work, or perform duplicate effects under concurrent/interleaved operations.

**Architecture:** Prefer database-enforced atomicity for server state: transactions, conditional `UPDATE`/`DELETE` predicates, `jsonb_set`, row locks, advisory locks, and idempotent upserts. Prefer synchronous refs/request tokens for mobile interaction races where React state updates are too late to stop double taps or stale async completions.

**Tech Stack:** TypeScript, Drizzle/Postgres, Hono services/routes, Inngest functions, React Native/Expo, Jest.

---

## Current-State Audit

Already remediated on `origin/main`; verify with existing tests and do not rewrite unless a regression appears:

- WI-191: `createSubscription` / checkout quota mutation has race-safe subscription creation and checkout activation transaction coverage in `apps/api/src/services/billing/subscription-core.ts`.
- WI-192: trial soft landing and downgrade quota are transactional in `apps/api/src/services/billing/trial.ts`.
- WI-197: denial status and profile delete are transactional in `apps/api/src/services/consent.ts`.
- WI-214: `queueCelebration` already calls pending-celebration writes inside the caller transaction and integration coverage asserts concurrent queue calls persist both celebrations.
- WI-248: `submitSummary` has a per-session advisory lock and idempotent existing-row path.
- WI-253: `recordSessionActivity` uses a transaction plus `SELECT ... FOR UPDATE`.

Residual work to implement:

- WI-111, WI-203: consent revocation/deletion final mutations need atomic guard predicates immediately on archive/delete.
- WI-126, WI-217, WI-245: whole-session metadata writes need transaction/row-lock or JSON path updates.
- WI-169, WI-188, WI-189, WI-190, WI-320: RevenueCat/Stripe event ordering and tier/quota writes need stronger write-time predicates/transactions.
- WI-176: Stripe same-second distinct events must not be dropped as duplicates solely because `created` seconds match.
- WI-187: top-up fallback must retry/atomically select the next eligible credit instead of returning exhausted after a selected row is consumed.
- WI-202: book topic generation must not leave `topicsGenerated=true` until topics are persisted.
- WI-235, WI-242, WI-243, WI-313: terminal sessions must reject message persistence/streaming and exchange counter/event persistence must be atomic.
- WI-257: focused-book sort order allocation needs retry or transactional allocation.
- WI-266, WI-267, WI-276, WI-286, WI-291, WI-305: mobile async/double-submit guards need synchronous refs/request tokens or disabled error states.

## Tasks

- [x] T1: Billing webhook ordering and tier/quota atomicity — done when RevenueCat and Stripe stale/duplicate events are rejected in the mutating write, same-second distinct Stripe events are not skipped as duplicates, RevenueCat activation create/update writes subscription + quota in one transaction, and targeted billing tests fail before/pass after.
- [x] T2: Metering top-up contention — done when the top-up fallback consumes the next eligible credit atomically or retries after a lost update, and a regression test proves a second pack is used when the first selected pack is concurrently consumed.
- [x] T3: Consent/deletion final guards — done when revocation archive/delete and generic profile/account deletes encode the still-valid consent/deletion predicate in the final mutation, and tests prove a late restore/cancel prevents the destructive update.
- [x] T4: Session metadata atomic patches — done when topic-probe, homework summary, and homework state sync no longer overwrite unrelated concurrent metadata and duplicate homework lifecycle events are prevented under overlapping calls.
- [x] T5: Session terminal-state and exchange persistence — done when completed/auto-closed sessions reject normal, stream, and orphan message paths before LLM/persistence, and exchange counter + user/AI event persistence is transactional or compensating enough to avoid counter-only commits.
- [x] T6: Curriculum and subject ordering — done when book topic generation only marks a book generated after successful topic persistence and focused-book creation retries/serializes sort-order allocation.
- [x] T7: Mobile stale async and double-submit guards — done when dictation generation/review ignores stale timed-out attempts, notifications cannot PUT defaults after failed load, top-up purchase and topic switch have synchronous in-flight guards, and recall “don’t remember” is disabled while pending/streaming.
- [x] T8: Validation, DeepSec traceability, and completion notes — done when all targeted tests, lint/typecheck/change-class validation pass; the plan lists each WI child as fixed or already fixed; and any unrelated discoveries are recorded separately.

## Tests

T1 billing tests:

- Add/extend `apps/api/src/services/billing/revenuecat.integration.test.ts`:
  - `it('rejects an older RevenueCat event in the update predicate when a newer event wins the race', ...)`
  - `it('creates RevenueCat subscription and quota pool in one transaction', ...)`
- Add/extend `apps/api/src/services/billing/subscription-core.integration.test.ts`:
  - `it('does not drop distinct Stripe events created in the same second', ...)`
  - `it('rejects an older Stripe event in the update predicate when a newer event wins the race', ...)`
- Add/extend `apps/api/src/routes/revenuecat-webhook.test.ts` and `apps/api/src/routes/stripe-webhook.test.ts` only for route-level event ID/timestamp threading if service tests cannot prove the route passes required fields.

T2 metering tests:

- Add/extend `apps/api/src/services/billing/metering.integration.test.ts` with:
  - `it('uses the next eligible top-up when the oldest selected credit is concurrently consumed', ...)`
  - Expected red failure: current implementation returns `success:false`/`source:'none'` after the selected row update returns no row.

T3 consent/deletion tests:

- Add/extend `apps/api/src/inngest/functions/consent-revocation.test.ts`:
  - `it('does not archive when consent is restored between final status check and archive update', ...)`
  - `it('does not hard-delete when consent is restored before final delete', ...)`
- Add/extend `apps/api/src/services/deletion.test.ts`:
  - `it('deleteProfileIfNoConsent returns skipped when consent was restored before delete', ...)`
  - Prefer replacing unconditional `deleteProfile` call sites with guarded helpers.

T4 metadata tests:

- Add/extend `apps/api/src/inngest/functions/topic-probe-extract.test.ts`:
  - `it('patches topic probe metadata without clobbering unrelated metadata keys', ...)`
  - `it('does not overwrite completed extraction status with failed on retry exhaustion', ...)`
- Add/extend `apps/api/src/services/homework-summary.test.ts`:
  - `it('stores homeworkSummary with jsonb_set without replacing concurrent metadata', ...)`
- Add/extend `apps/api/src/services/session/session-homework.test.ts`:
  - `it('serializes homework metadata/event logging so concurrent syncs do not duplicate lifecycle events', ...)`

T5 session tests:

- Add/extend `apps/api/src/services/session/persist-user-message-only.test.ts`:
  - `it('rejects orphan user-message persistence for completed sessions', ...)`
  - `it('rejects orphan user-message persistence for auto-closed sessions', ...)`
- Add/extend `apps/api/src/services/session/session-exchange.test.ts`:
  - `it('checkExchangeLimit rejects completed and auto_closed sessions', ...)`
  - `it('persistExchangeResult does not increment exchangeCount unless events persist', ...)`
- Add route tests only if service tests do not cover both `messages` and `stream` entrypoints.

T6 curriculum/subject tests:

- Add/extend `apps/api/src/services/curriculum.test.ts`:
  - `it('does not mark topicsGenerated true when topic generation persistence fails', ...)`
  - `it('marks topicsGenerated true only inside persistBookTopics after topics are inserted', ...)`
- Add/extend `apps/api/src/services/subject.test.ts`:
  - `it('retries focused-book sort order allocation after a unique sort-order conflict', ...)`

T7 mobile tests:

- Extend `apps/mobile/src/app/(app)/dictation/complete.test.tsx`:
  - `it('ignores a timed-out stale review result after retry starts', ...)`
- Extend `apps/mobile/src/app/(app)/dictation/index.test.tsx`:
  - `it('ignores a timed-out stale generation result after retry starts', ...)`
- Extend `apps/mobile/src/app/(app)/more/notifications.test.tsx`:
  - `it('does not submit default notification settings when settings failed to load', ...)`
- Extend `apps/mobile/src/app/(app)/subscription.test.tsx`:
  - `it('ignores rapid duplicate top-up presses before React disabled state renders', ...)`
  - `it('does not re-enable top-up purchase while confirmation polling is still active', ...)`
- Extend `apps/mobile/src/app/(app)/topic/recall-test.test.tsx`:
  - `it('does not submit dont_remember while a previous attempt is pending or response is streaming', ...)`
- Extend `apps/mobile/src/components/session/use-session-actions.test.ts`:
  - `it('does not close the same session twice during rapid topic switch taps', ...)`

## Scope

In scope:

- `apps/api/src/inngest/functions/consent-revocation.ts`
- `apps/api/src/inngest/functions/consent-revocation.test.ts`
- `apps/api/src/inngest/functions/topic-probe-extract.ts`
- `apps/api/src/inngest/functions/topic-probe-extract.test.ts`
- `apps/api/src/routes/revenuecat-webhook.ts`
- `apps/api/src/routes/revenuecat-webhook.test.ts`
- `apps/api/src/routes/stripe-webhook.ts`
- `apps/api/src/routes/stripe-webhook.test.ts`
- `apps/api/src/services/billing/metering.ts`
- `apps/api/src/services/billing/metering.integration.test.ts`
- `apps/api/src/services/billing/revenuecat.ts`
- `apps/api/src/services/billing/revenuecat.integration.test.ts`
- `apps/api/src/services/billing/subscription-core.ts`
- `apps/api/src/services/billing/subscription-core.integration.test.ts`
- `apps/api/src/services/consent.ts`
- `apps/api/src/services/consent.test.ts`
- `apps/api/src/services/curriculum.ts`
- `apps/api/src/services/curriculum.test.ts`
- `apps/api/src/services/deletion.ts`
- `apps/api/src/services/deletion.test.ts`
- `apps/api/src/services/homework-summary.ts`
- `apps/api/src/services/homework-summary.test.ts`
- `apps/api/src/services/session/persist-user-message-only.ts`
- `apps/api/src/services/session/persist-user-message-only.test.ts`
- `apps/api/src/services/session/session-exchange.ts`
- `apps/api/src/services/session/session-exchange.test.ts`
- `apps/api/src/services/session/session-homework.ts`
- `apps/api/src/services/session/session-homework.test.ts`
- `apps/api/src/services/subject.ts`
- `apps/api/src/services/subject.test.ts`
- `apps/mobile/src/app/(app)/dictation/complete.tsx`
- `apps/mobile/src/app/(app)/dictation/complete.test.tsx`
- `apps/mobile/src/app/(app)/dictation/index.tsx`
- `apps/mobile/src/app/(app)/dictation/index.test.tsx`
- `apps/mobile/src/app/(app)/more/notifications.tsx`
- `apps/mobile/src/app/(app)/more/notifications.test.tsx`
- `apps/mobile/src/app/(app)/subscription.tsx`
- `apps/mobile/src/app/(app)/subscription.test.tsx`
- `apps/mobile/src/app/(app)/topic/recall-test.tsx`
- `apps/mobile/src/app/(app)/topic/recall-test.test.tsx`
- `apps/mobile/src/components/session/use-session-actions.ts`
- `apps/mobile/src/components/session/use-session-actions.test.ts`
- `docs/superpowers/plans/2026-05-24-wi-78-race-atomicity.md`

Out of scope:

- New product behavior unrelated to the 30 WI-78 child findings.
- Broad schema redesign unless a specific residual child finding cannot be fixed without a migration.
- DeepSec scanner implementation changes.
- Closing the Cosmo item as Done before PR CI and review gates are green.
