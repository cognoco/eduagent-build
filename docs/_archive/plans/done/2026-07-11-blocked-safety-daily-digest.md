---
title: Blocked-Safety Daily Operator Digest — Implementation Plan
date: 2026-07-11
profile: code
work_items: [WI-1691]
spec: docs/plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md
status: in-progress
---

# Blocked-Safety Daily Operator Digest — Implementation Plan

**Goal:** Persist the three blocked-safety signals into deduplicated UTC-day counters and email a metadata-only digest to the configured operator address after each day closes.

**Approach:** Each existing `safeSend` producer adds a random event ID. A multi-trigger Inngest consumer records that ID and atomically increments a first-party daily bucket; it deliberately discards profile/session identifiers and all learner/model content. A 00:15 UTC cron sends every undelivered closed bucket through the existing Resend operator-email path, marks it delivered only after success, and throws on delivery failure so Inngest retries with a deterministic email idempotency key. Buckets use the UTC date of first successful persistence rather than querying Inngest history or trusting the event timestamp.

## Scope

In scope:

- `docs/plans/2026-07-11-blocked-safety-daily-digest.md`
- `packages/schemas/src/inngest-events.ts`
- `packages/schemas/src/inngest-events.test.ts`
- `packages/database/src/schema/safety-digest.ts`
- `packages/database/src/schema/safety-digest.test.ts`
- `packages/database/src/schema/index.ts`
- `apps/api/drizzle/0138_tiny_union_jack.sql`
- `apps/api/drizzle/meta/_journal.json`
- `apps/api/drizzle/meta/0138_snapshot.json`
- `apps/api/src/services/exchanges.ts`
- `apps/api/src/services/exchanges.crisis-redirect.test.ts`
- `apps/api/src/services/blocked-safety-digest.ts`
- `apps/api/src/services/blocked-safety-digest.test.ts`
- `apps/api/src/services/notifications/email.ts`
- `apps/api/src/inngest/functions/blocked-safety-digest.ts`
- `apps/api/src/inngest/functions/blocked-safety-digest.test.ts`
- `apps/api/src/inngest/index.ts`

Out of scope:

- Guardian or learner notifications.
- A staffed review queue, case-management UI, or event-detail drill-down.
- Crisis-disclosure events, which retain their separately ruled operator-alarm path.
- Raw learner text, tutor replies, redacted PII values, profile IDs, or session IDs in digest tables or email.
- Reading or reconciling Inngest event history as application data.

## Tasks

- [x] T1: Define the three digest event contracts and producer event IDs — done when: schema tests reject missing/invalid event IDs, producer tests prove all three `safeSend` payloads carry UUID event IDs, and their closed metadata sets contain no learner/model content.
- [x] T2: Add the first-party receipt and daily-bucket schema plus additive migration — done when: schema tests prove the receipt primary key, UTC bucket primary key, non-negative counters, and absence of profile/session/content columns; immediately before publication, current `origin/main` is merged and the additive migration is regenerated against its landed journal so no concurrent sequence/snapshot is reused; migration checks and database typecheck pass.
- [x] T3: Implement atomic, deduplicated recording — done when: `blocked-safety-digest.test.ts` first fails and then proves a first event inserts one receipt and increments exactly one counter in one transaction, while replaying the same event ID returns duplicate without incrementing.
- [x] T4: Implement closed-bucket email delivery — done when: service tests first fail and then prove zero-count input returns no email, the body contains only date/count labels, successful delivery marks the bucket, failed delivery throws without marking, and retries reuse the same date-derived idempotency key.
- [x] T5: Register the three-event ingest function and 00:15 UTC delivery cron — done when: Inngest tests prove all three triggers, the cron schedule, payload validation without raw-data logging, durable step boundaries, and registry inclusion.
- [x] T6: Verify the full change and review it adversarially — done when: focused suites, schema/database/API typechecks, focused lint, Inngest orphan/registration guards, migration checks, change-class gates, and affected tests pass; a strict revert makes each new behavioral test fail for the intended reason.
- [ ] T7: Publish for review without landing — done when: own-work files are committed with hooks, pushed via explicit worktree refspec, a PR referencing WI-1691 is open, Cosmo `pr-opened` is recorded, and neither merge nor `execute complete` has run.

## Delivery and retry contract

- Empty closed days produce no email.
- The digest recipient is `SUPPORT_EMAIL` through `getStepSupportEmail()`; no address rides in an event.
- An email is considered delivered only when `sendEmail()` returns `sent: true` and the bucket is then marked delivered.
- Any `sent: false` result or DB marking failure throws so the Inngest step retries. The Resend key is deterministic from `blocked-safety-digest + UTC bucket date`, preventing duplicate delivery during the retry window.
- Invalid internal event payloads are captured to Sentry with event name and schema issues only, then skipped as permanently malformed; raw event data is never logged.

## Rollback

Roll back the worker code first so no consumer writes the digest tables, then
drop `blocked_safety_digest_receipts` followed by
`blocked_safety_daily_buckets`. This deletes only operator-facing event IDs and
daily counters; no learner/profile/session/content data is stored in either
table. The original blocked-safety `safeSend` events remain non-core, so rolling
back the digest consumer does not affect learner responses.
