---
title: Homework Notice Felt Moments — Implementation Plan
date: 2026-07-19
profile: code
spec: docs/specs/2026-07-19-homework-notice-felt-moments.md
status: historical-implemented-superseded
scope_decision: docs/adr/MMT-ADR-0036-mentor-notice-mvp-boundaries-and-server-authority.md
---

# Homework Notice Felt Moments — Implementation Plan

> **Historical L3 record — superseded 2026-07-21.** This plan was used to build PR #2293 before the feature had a ratified product and architecture boundary. It is preserved as implementation provenance, not decision authority. [`MMT-ADR-0036`](../../../adr/MMT-ADR-0036-mentor-notice-mvp-boundaries-and-server-authority.md) and the current [MVP specification](../../../specs/2026-07-19-homework-notice-felt-moments.md) govern forward work. In particular, notice push/nudges are outside the MVP and the eligible sources are homework plus ordinary learning, not every session type.

**Goal:** Let a learner feel that Mentor noticed one concrete homework slip, kept a quiet record of it, and offered a short evidence-based re-check on the next learning day or the next natural subject session without turning homework into an upfront diagnostic or a forced remediation flow.

**Approach:** Build one flag-gated `mentor_notices` lifecycle behind the existing structured LLM envelope. The server validates every proposed notice or verdict against the persisted learner message before changing state, then returns only server-accepted notice data in the post-stream done frame. The same row powers the session-summary receipt, the self-only Now card, an optional once-ever generic push, natural in-session resurfacing, and a read-time locked-in celebration. Keep all transitions conditional and idempotent so concurrent stream completions, taps, scans, and verdicts cannot create duplicate notices, sessions, notifications, or terminal outcomes.

## Decisions Applied

The spec's recommended rulings are adopted so this plan is executable without deferred design choices:

- **`D1` — persistence shape; first open ruling:** add a dedicated `mentor_notices` table. Do not overload `needs_deepening_topics`, `retrieval_events`, session metadata, or learning-ledger writes.
- **`D2` — nudge timing; second open ruling:** target 16:00 in the learner organization's timezone on the next shifted learning day, where a learning day is the local timestamp minus four hours. There is no per-user time setting in this slice.
- **`D3` — push destination; third open ruling:** every notice push opens `/(app)/home`; the promoted Now card performs the explicit re-check action.
- **`D4` — Recall Bridge interaction; fourth open ruling:** suppress Recall Bridge generation for any session that accepted a mentor notice.
- A re-check injects its focused prompt for at most three learner exchanges. A valid `locked_in`, `not_yet`, `deferred`, or explicit `dismissed` verdict ends the current attempt or offer; if no valid verdict arrives by the third exchange, the server conservatively records `not_yet` and stops injecting the block for that session.
- A `locked_in` celebration is a self-only, three-day read-time Now-feed projection with a `subject.hub` destination. It is not a learning-ledger row and does not expand the persisted ledger-kind enum.
- A conversational “not now” maps to a non-terminal `deferred` verdict: it ends the current offer, keeps the notice open, records `lastDeferredAt`, and transactionally suppresses any unsent nudge. The notice is ineligible for another card or natural offer until a later shifted learning day, and no replacement push is scheduled. Only an explicit “do not bring this up again” maps to terminal `dismissed`.
- The Now-card secondary action is labelled “Not now” and calls an idempotent server defer action before hiding the card; it is not mount-local dismissal. Repeating the action on the same shifted learning day returns the existing defer result without extending it.

## Invariants

- The feature is invisible when `MENTOR_NOTICE_ENABLED` is false: no prompt blocks, accepted signals, summary blocks, Recall Bridge suppression, Now cards, re-check route, natural resurfacing, jobs, pushes, or projected celebrations.
- The LLM may propose `noticed_gap` and `notice_recheck` signals, but only a server-accepted database transition can appear in an SSE done frame or learner UI. Streaming prose never promises a future check-in.
- `answerEventId` must identify a persisted `user_message` event owned by the same profile and session. The claimed `learnerQuote` must overlap the database message; downstream logic uses the database content transiently and never stores the quote.
- Clinical/diagnostic language is scrubbed before `concept` or `correctionHint` is persisted. A database unique constraint on `sourceSessionId` enforces at most one accepted notice per session.
- Terminal transitions update only `status = 'open'`. Duplicate or late verdicts are no-ops, and only validated `locked_in` evidence can produce mastery-flavored copy.
- Deferral is not a terminal transition or a completed re-check: it does not increment `recheckAttemptCount`, set `lastRecheckAt`, or enter the 48-hour numerator. It suppresses a pending nudge, ends notice injection for the current session, and excludes the notice from cards and natural offers for the rest of the current shifted learning day.
- A re-check start locks the notice and reuses an already-active `learning` session whose metadata carries the same `recheckNoticeId`; otherwise it creates exactly one new subject-scoped session and `session_start` event in that transaction.
- A notice may be pushed at most once. The send path reserves its notification-log slot before delivery; failed, disabled, capped, or deduplicated attempts become `skipped` and are never retried.
- The review-family dedup bucket is exactly `['review_reminder', 'recall_nudge', 'notice_recheck']` in all three senders, with a three-per-day global cap.
- Supporter/guardian surfaces never receive the notice, its concept, or its correction hint. All Now-feed notice cards and celebrations are `scope: 'self'`.

## File Map

### Shared contracts and persistence

- `packages/schemas/src/mentor-notices.ts` (new), `packages/schemas/src/index.ts` — notice status/view contracts plus typed re-check and defer responses.
- `packages/schemas/src/llm-envelope.ts`, `packages/schemas/src/llm-envelope.test.ts` — `noticed_gap` and `notice_recheck` proposal signals and normalized envelope output.
- `packages/schemas/src/stream-fallback.ts`, `packages/schemas/src/stream-fallback.test.ts` — accepted notice data in the canonical SSE done frame.
- `packages/schemas/src/sessions.ts`, `packages/schemas/src/sessions.test.ts` — persisted notice block on the session-summary response.
- `packages/schemas/src/now-feed.ts`, `packages/schemas/src/now-feed.test.ts` — `mentor_notice` card kind, `notice.recheck` action route, and UUID-validated `noticeId` params.
- `packages/schemas/src/notifications.ts`, `packages/schemas/src/notifications.test.ts` — typed `notice_recheck` push payload `{ noticeId, subjectId }`.
- `packages/schemas/src/inngest-events.ts`, `packages/schemas/src/inngest-events.test.ts` — ID-only nudge work events and the four supplementary lifecycle telemetry events.
- `packages/database/src/schema/mentor-notices.ts` (new), `packages/database/src/schema/index.ts`, `packages/database/src/schema/progress.ts`, `packages/database/src/repository.profile.ts` — enums, table/indexes, notification enum, and profile-scoped access.
- `apps/api/drizzle/0147_homework_mentor_notices.sql`, `apps/api/drizzle/meta/_journal.json`, `apps/api/drizzle/meta/0147_snapshot.json` — additive migration artifacts (the number advanced after syncing this worktree with `origin/main`).
- `apps/api/src/services/database-rls-coverage.ts`, `apps/api/src/services/database-rls-coverage.test.ts`, `apps/api/src/services/database-fk-indexes.integration.test.ts`, `tests/integration/account-deletion.integration.test.ts` — RLS, foreign-key indexing, and deletion coverage for the new table.

### API domain and exchange lifecycle

- `apps/api/src/config.ts`, `apps/api/src/config.test.ts`, `apps/api/src/index.ts`, `apps/api/src/inngest/helpers.ts`, `apps/api/src/inngest/helpers.test.ts` — parse, default, and thread `MENTOR_NOTICE_ENABLED` through HTTP and Inngest bindings.
- `apps/api/src/services/evidence-overlap.ts` (new), `apps/api/src/services/evidence-overlap.test.ts` (new), `apps/api/src/services/challenge-round/note-draft.ts`, `apps/api/src/services/challenge-round/note-draft.test.ts` — shared Unicode-aware lexical-overlap primitive while preserving Challenge Round behavior.
- `apps/api/src/services/mentor-notices/evidence.ts`, `state.ts`, `prompts.ts`, `index.ts` (new) and colocated tests — evidence validation, scrubbed creation, offer stamping, re-check session/start/outcome transitions, same-day-idempotent deferral, nudge suppression, and bounded prompt context.
- `apps/api/src/services/exchange-types.ts`, `apps/api/src/services/exchange-prompts.ts`, `apps/api/src/services/exchange-prompts.test.ts`, `apps/api/src/services/exchanges.ts`, `apps/api/src/services/exchanges.test.ts` — flag/context plumbing and signal mapping.
- `apps/api/src/services/session/session-exchange.ts`, `apps/api/src/services/session/session-exchange.test.ts`, `apps/api/src/services/session/session-stream-response.ts`, `apps/api/src/services/session/session-stream-response.test.ts` — accept signals only after durable turn persistence and expose accepted notice data in the done frame.
- `apps/api/src/services/session/session-crud.ts`, `apps/api/src/services/session/session-crud.test.ts` — transaction-aware internal session creation used by the idempotent re-check start.
- `apps/api/src/routes/mentor-notices.ts`, `apps/api/src/routes/mentor-notices.test.ts` (new), `apps/api/src/index.ts` — profile-scoped `POST /mentor-notices/:noticeId/recheck`, idempotent `POST /mentor-notices/:noticeId/defer`, and route registration.
- `apps/api/src/routes/sessions.ts`, relevant session route tests, `apps/api/src/services/session/session-summary.ts`, `apps/api/src/services/session/session-summary.test.ts` — summary composition and typed Recall Bridge suppression before any LLM work.

### Now feed, notifications, and lifecycle jobs

- `apps/api/src/services/now-feed.ts`, `apps/api/src/services/now-feed.test.ts`, `apps/api/src/routes/now.integration.test.ts` — open-notice card collection, rank, action deep link, self-only filtering, and three-day locked-in projection.
- `apps/api/src/services/settings.ts`, `apps/api/src/services/settings.test.ts`, `apps/api/src/services/settings.integration.test.ts`, `apps/api/src/services/notifications.ts`, `apps/api/src/services/notifications.test.ts` — one atomic notification-attempt reservation covering the shared 24-hour bucket and global daily cap.
- `apps/api/src/inngest/functions/mentor-notice-nudge-scan.ts`, `mentor-notice-nudge-send.ts`, `mentor-notice-fade.ts` and colocated tests (new) — next-learning-day selection, once-ever delivery, and 21-day fading.
- `apps/api/src/inngest/functions/review-due-send.ts`, `review-due-send.test.ts`, `recall-nudge-send.ts`, `recall-nudge-send.test.ts`, `recall-review-push-dedup.integration.test.ts` — use and prove the identical three-type review-family dedup set.
- `apps/api/src/inngest/index.ts`, `apps/api/src/inngest/index.test.ts` — register the scan, sender, and fade jobs.
- `tests/integration/mentor-notice-lifecycle.integration.test.ts` (new) — database-backed, `inngest/test`-mode coverage of notice creation through send/suppress/fade outcomes.

### Mobile felt moments

- `apps/mobile/src/lib/sse.ts`, `apps/mobile/src/lib/sse.test.ts`, `apps/mobile/src/hooks/use-stream-message.ts`, `apps/mobile/src/hooks/use-stream-message.test.ts` — parse and forward the accepted notice done-frame field.
- `apps/mobile/src/components/session/ChatShell.tsx`, `MessageBubble.tsx`, `MentorNoticeChip.tsx` (new), their tests, `apps/mobile/src/components/session/use-session-streaming.ts`, `use-session-streaming.test.ts` — attach the chip to the exact completed assistant reply only after the done frame.
- `apps/mobile/src/hooks/use-session-summary.ts`, `apps/mobile/src/app/session-summary/[sessionId].tsx`, `apps/mobile/src/app/session-summary/[sessionId].test.tsx`, `apps/mobile/src/hooks/use-post-session-notification-ask.ts`, `use-post-session-notification-ask.test.ts` — persisted “Noticed along the way” receipt and notice-specific notification primer.
- `apps/mobile/src/hooks/use-mentor-notices.ts`, `use-mentor-notices.test.ts` (new), `apps/mobile/src/app/(app)/mentor.tsx`, `apps/mobile/src/app/(app)/mentor.test.tsx` — call the re-check or defer endpoint, reconcile stale `409` cards, remove a successfully deferred card from the current feed, and enter/reuse the returned re-check session.
- `apps/mobile/src/components/mentor/NowCard.tsx`, `NowCard.test.tsx`, `LedgerMomentCard.tsx`, `LedgerMomentCard.test.tsx`, `NowCardStack.tsx`, `NowCardStack.test.tsx` — notice card and locked-in celebration presentation.
- `apps/mobile/src/lib/now-deep-link.ts`, `apps/mobile/src/lib/now-deep-link.test.ts` — distinguish the `notice.recheck` action from navigational deep links so generic routing cannot silently treat it as a URL.
- `apps/mobile/src/lib/notification-tap-navigation.ts`, `apps/mobile/src/lib/notification-tap-navigation.test.ts` — route every `notice_recheck` push to `/(app)/home`.
- `apps/mobile/src/components/journal/JournalMomentsStrip.tsx`, `JournalMomentsStrip.test.tsx` — render the new projected celebration copy consistently wherever Now-feed ledger moments appear.
- `apps/mobile/src/i18n/locales/en.json`, generated locale JSON files, `apps/mobile/src/i18n/source-baseline.json` — all notice, summary, primer, card, and celebration copy in the same change.

### Prompt evaluation and documentation

- `apps/api/eval-llm/flows/homework-notice.ts`, its focused test and snapshot (new), `apps/api/eval-llm/index.ts` — positive-slip, clean-homework, provenance, and no-promise scenarios.
- `docs/specs/2026-07-19-homework-notice-felt-moments.md` — reconcile its ambiguous “not now” wording with the approved non-terminal deferral ruling, and mark the four decisions resolved, only if the implementer is authorized to update the source spec; implementation does not depend on this documentation edit.
- This plan.

## Tasks

- [x] T1: Establish contracts and the additive persistence boundary test-first — done when failing schema/database tests first describe both envelope signals (including the non-terminal `deferred` re-check verdict), the accepted SSE/summary shapes, the Now action route, typed re-check/defer responses, the typed push/event payloads, one-notice-per-source-session, valid status/nudge/outcome values, nullable `lastDeferredAt`, profile scoping, and indexed foreign keys; then the shared schemas and `mentor_notices` Drizzle table make them pass, `rtk pnpm db:generate:dev` produces migration `0147`, and the generated SQL is manually checked for the table, indexes, RLS policy, foreign keys, notification enum extension, and no unrelated DDL.

- [x] T2: Build the evidence validator and concurrency-safe notice state machine — done when RED tests prove rejection of wrong-profile, wrong-session, non-user, missing, and lexically unsupported evidence; clinical text cannot survive persistence; concurrent accepts yield one row; duplicate/late outcomes cannot overwrite terminal state; and concurrent same-day deferrals preserve one `lastDeferredAt` value without incrementing re-check attempts. Extract the existing Unicode tokenization/overlap behavior into `evidence-overlap.ts` without changing Challenge Round semantics, validate the claimed quote against the authoritative event content, scrub only persisted `concept`/`correctionHint`, never store the quote, and implement conditional `open` transitions for `locked_in`, `not_yet`, explicit `dismissed`, non-terminal `deferred`, nudge suppression, offer stamping, attempt timestamps/counts, and the three-exchange conservative cap. A valid `not_yet` attempt, `deferred` interaction, or explicit `dismissed` verdict suppresses `nudgeStatus = 'pending'` in the same transaction; `not_yet` and `deferred` leave the notice open, while only `not_yet` counts as a completed re-check attempt.

- [x] T3: Wire Moment 1 through prompt, durable exchange, stream, and chip — done when RED API tests show that a homework slip proposal is ignored before the user/assistant events are durable and that disabled/invalid/second-in-session proposals never reach the done frame; RED mobile tests show that no chip renders during tokens, fallback, replay, or an unaccepted signal. Add the flag-gated homework detection instruction and envelope formats, ensure the current learner event ID is available whenever either Challenge Round or mentor notices need evidence, accept the signal only after persistence, and return `{ id, concept, correctionHint }` on the final SSE frame. The mobile stream then annotates only that completed assistant `ChatMessage`, and `MessageBubble` renders an understated translated chip directly beneath it.

- [x] T4: Persist the post-session receipt and suppress competing Recall Bridge work — done when RED route/service tests prove the accepted notice is returned after app restart and that the Recall Bridge endpoint exits with typed `409 RECALL_BRIDGE_SUPPRESSED` before calling its LLM generator. Extend the existing enriched session-summary schema with an optional notice block, compose it from `sourceSessionId`, render “Noticed along the way,” and select notice-specific notification-primer copy while preserving the existing eligibility/consent logic. Keep the current mobile best-effort Recall Bridge caller compatible with the typed suppression response.

- [x] T5: Implement the explicit re-check/defer actions and promoted Now card — done when RED concurrency tests issue parallel `POST /mentor-notices/:noticeId/recheck` calls and observe one active subject-scoped learning session plus one `session_start`; parallel same-day `POST /mentor-notices/:noticeId/defer` calls return the same defer result, suppress an unsent nudge once, and create no session; a missing, wrong-profile, or feature-disabled notice returns `404`; and a terminal notice returns `409` without mutation. Refactor only the minimum transaction-aware session-creation primitive needed to lock the notice, reuse an active session with `metadata.recheckNoticeId`, or create one atomically. Add an eligible open-notice Now candidate ranked after `unfinished_session` and before retention work, excluding notices deferred on the current shifted learning day; return `notice.recheck` with `{ noticeId, subjectId }`; and make the learner Mentor screen call the appropriate mutation before navigating or hiding. The secondary action is translated “Not now,” calls the defer endpoint, and invalidates/refetches the feed on success or stale `409`. Treat `notice.recheck` as an action route that `buildNowPath()` rejects; on a stale re-check `409`, invalidate/refetch the feed instead of entering a session.

- [x] T6: Inject and resolve the bounded re-check conversation — done when RED service/exchange tests prove that explicit re-check sessions and natural same-subject sessions receive a focused 2–3 exchange block without an unsolicited opener, only once per session; a valid `locked_in` verdict uses DB-backed learner evidence and closes the row; `not_yet` records an attempt but keeps it open; `deferred` ends the current offer, records `lastDeferredAt`, suppresses the pending nudge, and keeps the notice open without counting an attempt; only an explicit “do not bring this up again” maps to `dismissed` and closes it; invalid evidence keeps it open; and an absent valid verdict at exchange three records conservative `not_yet`. For natural resurfacing, choose the oldest eligible open notice for the subject, exclude notices deferred on the current shifted learning day, omit any notice whose `lastOfferedSessionId` is current, and transactionally stamp the offer before adding the prompt. A deferred verdict stops injection for the rest of the current session. Do not inject a new notice-detection prompt while a re-check block is active.

- [x] T7: Add deterministic next-learning-day reach with atomic reservation — done when RED unit/integration tests cover the four-hour learning-day shift from the source session's timestamp across midnight/DST, exactly 16:00–16:59 local eligibility on shifted local date + 1, consent and live push-preference gates, feature-off behavior, deferral-before-scan and deferral-before-send suppression, shared dedup, daily cap, concurrent scans/senders, disabled tokens, provider failure, and no retry. Introduce one `REVIEW_FAMILY_DEDUP_TYPES` constant with the exact three ordered values and use it in review, recall, and notice senders. Add a transaction/advisory-lock-backed reservation helper that checks the shared 24-hour bucket and three-per-day cap before inserting `notification_log`; after reservation call `sendPushNotification` with both rate-limit logging and daily-cap rechecking disabled. Send generic subject-level copy with `{ noticeId, subjectId }`, then conditionally set `sent` or `skipped` once, retaining the reservation even on delivery failure. Deferral never schedules a replacement push.

- [x] T8: Complete quiet lifecycle cleanup and instrumentation — done when the fade job conditionally changes only open notices whose most recent `createdAt`, `lastOfferedAt`, `lastDeferredAt`, or `lastRecheckAt` activity is older than 21 days to `faded`, suppresses a pending nudge, and never touches terminal/fresh rows. Emit `app/notice.created`, `app/notice.nudge_sent`, `app/notice.recheck_started`, and `app/notice.recheck_outcome` through `safeSend()` only after their durable state changes, with opaque IDs/statuses and no concept, hint, quote, or message content; `recheck_outcome` may report `deferred` but that outcome must not increment the durable attempt count or north-star numerator; emit `recheck_started` only for a newly created re-check session, not an idempotent reuse. Integration assertions treat `mentor_notices` as the funnel source and prove the north-star numerator (`lastRecheckedAt <= createdAt + 48 hours`) and locked-in-rate fields are derivable without relying on telemetry delivery. Telemetry failure must not change the user result.

- [x] T9: Project the locked-in receipt without ledger writes — done when RED Now-feed and mobile tests show a self-only `ledger_moment` with `templateKey: 'now.ledger_moment.notice_locked_in'` for three days after `resolvedAt`, no guardian/person/supporter projection, no inserted learning-ledger row, and no card after the recency window. Route the celebration to `subject.hub`, add explicit Mentor-home and Journal copy handling, and preserve the generic fallback for unknown future ledger moment kinds.

- [x] T10: Add evaluation and localization gates — done when the new homework-notice eval flow contains at least one genuine slip that emits a schema-valid, provable `noticed_gap`, one clean exchange that emits none, one fabricated/mismatched quote that the server rejects, and assertions that visible assistant prose does not promise a later check-in. Add English source keys for every new visible string, run `rtk pnpm translate`, review generated translations, and pass the staleness, orphan, keep-rot, hardcoded-JSX, and no-clinical-copy checks without baseline exemptions unless a non-translatable token is explicitly justified.

- [x] T11: Verify the three rollout slices and rollback behavior — done when the focused suites below pass, the full type/lint/format checks pass, and a database-backed `inngest/test` lifecycle proves create → defer or optional push reservation → re-check session → terminal/suppressed/faded outcomes, including that defer suppresses the push without counting a completed re-check and that the notice can reappear only on a later shifted learning day. Repeat the end-to-end API/mobile tests with `MENTOR_NOTICE_ENABLED=false` to prove complete invisibility. Operational rollback is flag-off first; the additive table/data remain intact. Do not drop the table or attempt to remove PostgreSQL enum values as an automated production rollback.

## Verification

Run focused RED commands before each production slice, then repeat them GREEN after the corresponding implementation. Use absolute Windows-safe paths where Jest path parsing needs them.

```powershell
# Shared contracts and API state machine
rtk pnpm exec jest --config jest.config.cjs --testMatch "**/*.test.ts" --runTestsByPath src/mentor-notices.test.ts --runInBand --no-coverage # cwd: packages/schemas
rtk pnpm exec jest --config apps/api/jest.config.cjs --runTestsByPath apps/api/src/config.test.ts apps/api/src/inngest/helpers.test.ts apps/api/src/services/database-rls-coverage.test.ts apps/api/src/services/evidence-overlap.test.ts apps/api/src/services/mentor-notices/evidence.test.ts apps/api/src/services/mentor-notices/state.test.ts apps/api/src/services/exchange-prompts.test.ts apps/api/src/services/exchanges.test.ts apps/api/src/services/session/session-exchange.test.ts apps/api/src/services/session/session-stream-response.test.ts apps/api/src/routes/mentor-notices.test.ts apps/api/src/routes/sessions.test.ts --runInBand --no-coverage

# Summary, Now feed, notification reservation, and Inngest lifecycle
rtk pnpm exec jest --config apps/api/jest.config.cjs --runTestsByPath apps/api/src/services/session/session-summary.test.ts apps/api/src/services/now-feed.test.ts apps/api/src/services/settings.test.ts apps/api/src/services/notifications.test.ts apps/api/src/inngest/functions/mentor-notice-nudge-scan.test.ts apps/api/src/inngest/functions/mentor-notice-nudge-send.test.ts apps/api/src/inngest/functions/mentor-notice-fade.test.ts apps/api/src/inngest/functions/review-due-send.test.ts apps/api/src/inngest/functions/recall-nudge-send.test.ts --runInBand --no-coverage
rtk pnpm test:integration -- --runTestsByPath tests/integration/mentor-notice-lifecycle.integration.test.ts tests/integration/account-deletion.integration.test.ts --runInBand --forceExit
rtk pnpm exec jest --config apps/api/jest.integration.config.cjs --runTestsByPath apps/api/src/inngest/functions/recall-review-push-dedup.integration.test.ts apps/api/src/routes/now.integration.test.ts apps/api/src/services/database-fk-indexes.integration.test.ts --runInBand --forceExit --no-coverage

# Mobile felt moments
rtk pnpm exec jest --config apps/mobile/jest.config.cjs --runTestsByPath apps/mobile/src/lib/sse.test.ts apps/mobile/src/components/session/use-session-streaming.test.ts apps/mobile/src/components/session/ChatShell.test.tsx apps/mobile/src/components/session/MessageBubble.test.tsx "apps/mobile/src/app/session-summary/[sessionId].test.tsx" apps/mobile/src/hooks/use-post-session-notification-ask.test.ts apps/mobile/src/hooks/use-now-feed.test.tsx "apps/mobile/src/app/(app)/mentor.test.tsx" apps/mobile/src/components/mentor/NowCard.test.tsx apps/mobile/src/components/mentor/LedgerMomentCard.test.tsx apps/mobile/src/lib/now-deep-link.test.ts apps/mobile/src/lib/notification-tap-navigation.test.ts apps/mobile/src/components/journal/JournalMomentsStrip.test.tsx --runInBand --forceExit --no-coverage

# Prompt evaluation and repository gates
rtk pnpm eval:llm -- --flow homework-notice
rtk pnpm eval:llm -- --flow homework-notice --live
rtk pnpm translate
rtk pnpm check:i18n
rtk pnpm check:i18n:orphans
rtk pnpm exec tsx scripts/check-i18n-keep-rot.ts
rtk pnpm check:i18n:jsx-literals
rtk pnpm check:no-clinical-copy
rtk pnpm prepush
rtk pnpm lint
rtk pnpm format:check
rtk git diff --check
```

## Slice Gates

- **Slice 1 — complete quiet loop:** T1–T6 and the non-live portion of T10 pass; an accepted homework notice survives restart, suppresses Recall Bridge, appears as a promoted card, can be deferred without becoming terminal or counting as a re-check, and can complete an evidence-backed re-check with the feature enabled while all surfaces disappear with it disabled.
- **Slice 2 — optional reach:** T7–T8 pass; next-learning-day scan/send is deterministic, deduplicated, capped, consent-aware, generic, once-ever, and no-retry, and stale open rows fade.
- **Slice 3 — natural resurfacing and receipt:** T9 plus the natural-session cases in T6 pass; the notice is offered at most once per session and locked-in evidence projects a three-day self-only celebration without a ledger write.

## Plan Self-Review

- Spec coverage: both felt moments, both return paths, summary/primer, Recall Bridge suppression, ownership/privacy, state transitions, nudge timing/dedup, fade, instrumentation, rollout flag, evals, localization, and all three vertical slices are mapped to tasks and tests.
- Deferred-decision scan: no placeholder marker, postponed choice, or alternative implementation branch remains; the four source-spec decisions are explicitly ruled above.
- Consistency: signal field names, statuses, notification type, event names, dedup set, action routes, feature flag, 48-hour product metric inputs, and no-quote/no-ledger constraints are internally consistent; the approved non-terminal `deferred` ruling deliberately resolves the source spec's conflicting “not now”/“stop bringing this up” language pending a corresponding spec edit.
- Scope control: supporter/guardian delivery, `needs_deepening_topics`, `retrieval_events`, persistent tutoring modes, diagnostic profiling, notification-time settings, PR creation, and unrelated cleanup remain out of scope.
