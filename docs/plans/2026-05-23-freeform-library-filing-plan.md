# Freeform Chat Library Filing Implementation Plan

> **Status:** Partially implemented / not fully delivered
> **Date:** 2026-05-23
> **Current status audit:** 2026-05-25 static repo check on branch `freeform`
> **Source spec:** [`docs/specs/2026-05-23-freeform-library-filing.md`](../specs/2026-05-23-freeform-library-filing.md)

**Goal:** Replace the post-session "do you want to file this?" interruption with quiet auto-filing for meaningful freeform sessions, while preserving an explicit "Keep out of Library" choice. Sessions stay saved either way. Library topics always belong to subjects.

**Tech stack:** Expo / React Native, TanStack Query, Hono, Drizzle, Zod schemas, Inngest, Jest.

---

## Current Implementation Status — 2026-05-25

This plan is **not fully delivered** in the current checkout. Some backend scaffolding has landed, but the core auto-filing lifecycle, race-safe resolver split, mobile Library filing UX, and flow-doc reconciliation remain open.

Static audit evidence:

- **Delivered / present**
  - `filing_kept_out` exists in shared schema, database schema, and migration:
    - `packages/schemas/src/sessions.ts`
    - `packages/database/src/schema/sessions.ts`
    - `apps/api/drizzle/0098_filing_kept_out.sql`
  - `app/session.auto_file_requested` schema exists in `packages/schemas/src/inngest-events.ts`.
  - User-action API scaffolding exists in `apps/api/src/routes/sessions.ts`:
    - `POST /sessions/:sessionId/library-filing/keep-out`
    - `POST /sessions/:sessionId/library-filing/add`
    - `POST /sessions/:sessionId/library-filing/restore`
    - freeform-aware `POST /sessions/:sessionId/retry-filing`
  - Session service helpers exist for kept-out/add/restore/retry reset in `apps/api/src/services/session/session-crud.ts`.
  - `markSessionFiled()` exists and writes `topicId`, `filedAt`, and `updatedAt` in `apps/api/src/services/session/session-book.ts`.

- **Partially delivered / needs correction**
  - `apps/api/src/inngest/functions/freeform-filing.ts` listens for `app/session.auto_file_requested`, but it reuses `runFreeformFiling()` rather than the planned race-safe `auto-file-session` lifecycle. It does not claim `filing_pending`, enforce the new max-retry lifecycle, or perform the guarded final session update described below.
  - User-initiated Add/Restore/Retry dispatches use awaited `inngest.send(...)`, which matches the CORE dispatch requirement, but close-path automatic dispatch was not found in the static audit.
  - `FILING_CONFIG` exists in `apps/api/src/config/filing.ts`, but the static audit found only limited usage. The auto-file eligibility and backfill threshold still need a focused verification pass.
  - Mobile has `filing_kept_out` in existing status types, but the only visible Summary status found was the old `FilingFailedBanner`, not the planned compact Library filing control.

- **Not delivered / open**
  - Close-time enqueue for eligible meaningful freeform sessions was not found. The plan still needs implementation of the opportunistic close-path `app/session.auto_file_requested` dispatch with the `auto-file-${sessionId}-initial` dedupe key.
  - `resolveFilingResult()` still mutates `learning_sessions` directly in `apps/api/src/services/filing.ts`. The planned split is not complete.
  - `claimSessionForAutoFiling()` was not found.
  - `deleteTopicIfSafe()` was not found. `markSessionKeptOutOfLibrary()` currently detaches the session but does not perform the shared safe topic cleanup described below.
  - The auto-file opt-out race guard is not implemented as planned because the resolver still updates the session row directly and the auto-file handler does not perform the guarded final update.
  - `useSessionLibraryFiling(sessionId)` was not found. Existing session polling still uses `computeFilingRefetchInterval()` with `15_000` ms for `filing_pending`, not the planned 3s cadence / 10-poll timeout behavior.
  - Session Summary does not yet show the planned Library status/action surface: pending `Don't add to Library`, filed destination/tap-through, filed-topic rename, below-threshold `Add to Library`, or `Remove from Library`.
  - The Library tab failed-filing attention surface was not found.
  - Flow docs are not reconciled: `docs/flows/flow-master-directory.md` still lists `LEARN-01`, `SUBJECT-03`, and `SUBJECT-05` as `Not created`.

Do not treat PR 1-4 below as complete until these open items are implemented and verified with the validation commands at the end of this plan.

---

## Amendments — 2026-05-25 (adversarial review)

Twenty-six findings from the 2026-05-25 challenge pass are folded into this plan. Audit trail (each ID is cited inline at the change site):

- **[CRITICAL-A]** `backfillSessionTopicId` (now `markSessionFiled`) extended to set `topicId + filedAt + updatedAt`. The old helper only wrote `topicId`. Splitting `resolveFilingResult` without this fix leaves every freshly-filed session with `filedAt = null`, and `freeform-filing.ts:56` keys "already filed" off `row.filedAt != null` → the next retry re-fires the LLM and double-creates the topic.
- **[CRITICAL-B]** Spec §6 line 254 ("Retry resets the count") is the source of truth. Earlier wording in this plan ("share the 3-attempt cap, no reset") is replaced. Retry now goes through `resetFilingForRetry` (clears `filing_status` AND `filing_retry_count`).
- **[HIGH-C]** Terminal `filing_failed` sessions had no path out under the original plan (`claimSessionForAutoFiling` CAS requires `filing_status IS NULL`). Fixed by routing the Retry button through `resetFilingForRetry`, not through the existing `claimSessionForFilingRetry`.
- **[HIGH-D]** `restoreSessionForAutoFiling` now ALSO resets `filing_retry_count` to 0 via `resetFilingForRetry`. Without this, a user who exhausted retries → kept out → restored re-enters with `retry_count = 3` and dies on the first LLM error.
- **[HIGH-E]** Safe-to-delete logic factored out as a shared exported helper `deleteTopicIfSafe(db, profileId, sessionId, topicId)`. Used by both the keep-out service AND the auto-file handler's 0-row branch — no rule duplication.
- **[HIGH-F]** "Update retry endpoints to return 409 for `filing_kept_out`" reworded — the existing `claimSessionForFilingRetry` CAS at `session-crud.ts:1463-1486` already returns 409 for any non-failed status. Task is now a verification + integration test, not a code change.
- **[MEDIUM-G]** Spec §4 line 165 contradicts §5: §4 requires `filedFrom = 'freeform_filing'` for safe-to-delete, §5 sets auto-file topics to `'session_filing'`. Spec §4 as written would never fire for auto-filed sessions. The plan correctly broadens to `IN (...)` and this amendments block flags the matching spec edit.
- **[MEDIUM-H]** `MIN_FREEFORM_FILE_EXCHANGES` and `MAX_FILING_RETRIES` live in `apps/api/src/config/filing.ts` (new), per CLAUDE.md G4 (no raw `process.env` in API code).
- **[MEDIUM-I]** Inngest dedupe key formula made explicit: `auto-file-${sessionId}-initial` for close-path dispatch; user-initiated Retry / Add / Restore use generated dispatch ids. Reusing one key would let Inngest collapse a real retry as a duplicate.
- **[MEDIUM-J]** PR 3 polling cadence locked: TanStack Query `refetchInterval: 3000`, stop on terminal state or after 10 polls (~30s). [MEDIUM-W] changes the post-timeout UI: local timeout is not terminal failure.
- **[MEDIUM-K]** Spec §1 "Ask First" / Unsorted auto-subject is explicitly NOT shipping in this PR series. The "no friction before first turn" promise the spec opens with is unshipped after PR 3 merges.
- **[MEDIUM-L]** PR 2 freeform-effective-mode audit task names the actual insert paths.
- **[LOW-M]** CRITICAL-1 framing corrected: stranded backfill is operator-fired (`filing-stranded-backfill.ts:16-23` "No automatic trigger by design"), not a cron. Guard still required; risk window is "manual recovery after an incident."
- **[CRITICAL-N]** User-initiated Retry / Add to Library / Restore dispatches are CORE, not `safeSend()`. If these dispatches fail, the API must fail so the UI does not show pending work that was never queued. Close-path auto-file stays non-core because it is opportunistic after session close.
- **[CRITICAL-O]** `filingStatus = null` must not be a dead end. Below-threshold chats and close-path dispatch failures need an explicit `Add to Library` route from Session Summary.
- **[HIGH-P]** Retry dedupe keys cannot be derived from `filing_retry_count` after `resetFilingForRetry()` because the reset makes every manual retry `retry-0`. Add a per-dispatch UUID/idempotency token to `app/session.auto_file_requested`.
- **[HIGH-Q]** The new `auto-file-session` handler must define its own failure lifecycle. A claim to `filing_pending` followed by an LLM/DB failure cannot rely on the old `app/filing.retry` observer path unless that observer is explicitly retargeted to the new event.
- **[HIGH-R]** Splitting `resolveFilingResult()` creates an orphan-topic risk in synchronous `/filing` and manual retry paths if topic resolution succeeds but `markSessionFiled()` fails. These callers need transactional ownership or cleanup/idempotency coverage, not just the auto-file guarded-update branch.
- **[HIGH-S]** Do not ship PR 3 as the end-user "Ask Anything is frictionless" release while the upstream subject-picker friction remains. It may merge behind an internal flag or ship as a narrow post-close prompt removal only if release notes/product copy avoid the ask-first claim.
- **[HIGH-T]** Short but useful freeform chats (<3 learner turns) still need a visible `Add to Library` action from Summary. The automatic threshold controls background filing only; it must not prevent user-initiated filing.
- **[MEDIUM-U]** Filed status must show the resolved destination (topic title and parent subject/book when available) with a tap-through. V1 also needs a minimal rename affordance for auto-created topics so a bad LLM title is correctable without a full taxonomy picker. Rename is topic-level, not session-local.
- **[MEDIUM-V]** Quiet auto-filing needs non-quiet failure surfacing. Failed freeform filing appears in the Library tab's existing scan path as a small "needs attention" row/count, not on Home and not only when the user revisits the exact Summary.
- **[MEDIUM-W]** The 30s polling limit must not convert an in-flight job into a fake failure. After the local poll budget expires, show "Still adding..." / refresh; enable Retry only after the server reports terminal `filing_failed`.
- **[MEDIUM-X]** Freeform and homework close UX remain inconsistent in this PR series. This is accepted only as a transitional state and must be documented in flow docs; a follow-up should decide whether homework keeps a prompt long-term.
- **[MEDIUM-Y]** "Keep out of Library" is too generic for all states. Pending copy should read like cancel/prevent Library filing; filed copy should read like remove/detach from Library; kept-out copy should read like re-add.
- **[MEDIUM-Z]** Library bloat from repeated freeform chats must be tested. `fileToLibrary()`/`resolveFilingResult()` already have topic dedupe behavior, but this plan now requires an acceptance test proving repeated chats on the same concept link to the existing topic instead of creating noisy duplicates.

---

## In Scope / Out Of Scope

In scope (this plan):

- Auto-file meaningful freeform sessions at session close.
- Add an explicit user-initiated `Add to Library` path from every freeform Session Summary that is not already filed, including below-threshold chats and sessions whose close-time dispatch failed.
- Durable `filing_kept_out` terminal state plus a reversible `Add to Library` restore path.
- Race-safe interaction between auto-filing and user opt-out.
- Mobile UX: remove the blocking freeform prompt, show compact Library status with destination/tap-through when filed, expose state-specific Library actions.
- Flow-doc reconciliation for the freeform/Library story.

Out of scope — track in follow-up plans:

- Spec §1 "Ask First" / per-profile "Unsorted" auto-subject and live subject reconciliation during the streaming reply. [HIGH-2 / MEDIUM-K / HIGH-S] This is a separate workstream and is not addressed here. Freeform sessions in this PR series continue to be created with a real `subjectId` via the existing entry paths — **so the spec's "no friction before first turn" promise (spec lines 22-29) does NOT ship in this PR series.** PR 3's UX still relies on the existing subject-up-front entry path; the auto-file/keep-out behavior shipped here applies AFTER a session already has a `subjectId`. Do not claim "ask-first is done" after PR 3 merges. **Release gate:** do not ship PR 3 as the visible Ask Anything win unless the upstream ask-first/Unsorted work ships in the same release; otherwise describe it narrowly as "freeform close no longer asks a second Library question."
- Homework session filing. [MEDIUM-4] The current homework filing prompt and behavior are unchanged. Only the freeform path's blocking prompt is removed in PR 3.
- Spec §7 `Change` subject-picker. V1 `Change` is "navigate to the filed topic" only. [MEDIUM-U] However, V1 must still show the resolved topic title and destination, and must provide a minimal rename action for auto-created topics. Full subject/book reclassification remains V2+.
- Analytics events from spec §Analytics. [MEDIUM-6] Deferred to a follow-up plan; PR 2 does not emit `freeform_library_filing.*`. The eval harness still re-snapshots filing prompts when the LLM call surface changes.
- Push notifications for filing failure. [MEDIUM-V] Deferred; PR 3 uses an in-app attention surface instead.

---

## Scope Split

### PR 1 - Backend Filing State And Keep-Out Contract

**Current status (2026-05-25): Partial.** Schema/migration/API scaffolding exists, but shared safe topic cleanup and full kept-out exclusion verification remain open.

Create the durable state model and API operations:

- Add terminal `filing_kept_out` state.
- Add service helpers to mark a session kept out of Library.
- Ensure retry/backfill/observer jobs ignore kept-out sessions.
- Add tests for ownership, retry exclusion, and state transitions.

### PR 2 - Auto-File Freeform Sessions

**Current status (2026-05-25): Not delivered.** The new event schema and listener exist, but close-path enqueue, CAS claim, guarded final update, resolver split, and terminal failure lifecycle are not implemented as planned.

Move meaningful freeform sessions to background filing by default:

- Enqueue auto-file on close for eligible freeform sessions.
- Reuse existing `fileToLibrary()` and `resolveFilingResult()`.
- Keep the existing retry/observer pattern.
- Add integration coverage for auto-file success, failure, and opt-out race.

### PR 3 - Mobile UX

**Current status (2026-05-25): Not delivered.** The existing failed-filing banner remains, but the planned Session Summary Library status/actions, 3s polling hook, filed destination/tap-through, rename affordance, and Library attention surface were not found.

Remove the blocking filing prompt:

- Navigate to summary immediately after close.
- Show compact Library filing status and actions.
- Add state-specific Library actions (`Don't add to Library`, `Remove from Library`, `Add to Library`).
- Show resolved Library destination and a minimal rename affordance for auto-created filed topics.
- Surface failed Library additions outside the exact Summary screen.
- Preserve existing failed-filing retry affordance.

### PR 4 - Flow Docs Reconciliation

**Current status (2026-05-25): Not delivered.** `LEARN-01`, `SUBJECT-03`, and `SUBJECT-05` are still marked `Not created` in the flow master directory.

Collect the scattered documentation:

- Create missing flow pages for `LEARN-01`, `SUBJECT-03`, and `SUBJECT-05`.
- Update `HOME-01`, `LEARN-07`, `LEARN-08`, and the master register.
- Add acceptance language around session history vs Library filing.

---

## Files To Modify

### Shared Schemas

- `packages/schemas/src/sessions.ts` - add `filing_kept_out` to `filingStatusSchema`; expose response shapes needed for filing controls; add typed `getSessionEffectiveMode(session)` accessor that reads `metadata.effectiveMode` safely. [HIGH-3 / MEDIUM-5] Eligibility logic and the Inngest handler MUST read effective mode through this accessor — no inline `metadata as any` indexing.
- `packages/schemas/src/sessions.test.ts` - update enum tests, response fixtures, and add accessor coverage (returns `'freeform'`, `'learning'`, `undefined` for missing metadata).
- `packages/schemas/src/inngest-events.ts` - add `app/session.auto_file_requested` event schema. [HIGH-1] PR 2 introduces a dedicated event, not reuse of `app/filing.retry`.

### Configuration

- `apps/api/src/config/filing.ts` (new) - **[MEDIUM-H]** Typed config object exporting:
  - `FILING_CONFIG.minFreeformExchanges = 3` (was inline `MIN_FREEFORM_FILE_EXCHANGES`).
  - `FILING_CONFIG.maxRetries = 3` (was inline `MAX_FILING_RETRIES`).
  All API-side reads import from here; never index `process.env` directly (CLAUDE.md G4). Mobile does NOT need these values — eligibility runs server-side. If a future PR adds mobile-visible thresholds, expose via `@eduagent/schemas`, not duplicated mobile constants.

### Database

- `packages/database/src/schema/sessions.ts` - add `filing_kept_out` to the `filing_status` enum.
- `apps/api/drizzle/*` - migration adding the enum value.

Migration apply-time note: [MEDIUM-3] `ALTER TYPE filing_status_enum ADD VALUE 'filing_kept_out'` cannot run inside a transaction block in PostgreSQL. The drizzle migration file must declare `-- breakpoint` or be placed in a standalone file that drizzle-kit applies without `BEGIN/COMMIT` wrapping (current pattern in `apps/api/drizzle/`: each enum-value-add lives in its own SQL statement with no surrounding transaction). Verify the generated file by running `pnpm run db:migrate:dev` against a clean local DB before merging PR 1.

Rollback note: PostgreSQL enum value additions are not trivially reversible. Rollback requires a forward migration that rebuilds the enum type after all `filing_kept_out` rows have been remediated to null or another allowed state. No learning/session data is lost by the forward change.

### API Services And Routes

- `apps/api/src/services/session/session-crud.ts` - add service functions:
  - `markSessionKeptOutOfLibrary(db, profileId, sessionId)` — sets terminal `filing_kept_out`.
  - `restoreSessionForAutoFiling(db, profileId, sessionId)` — [HIGH-4 / HIGH-D] reverse of keep-out. Requires `filingStatus = 'filing_kept_out'`. Internally calls `resetFilingForRetry` so BOTH `filing_status` AND `filing_retry_count` are cleared. Returns the session row (including the fresh `filing_retry_count`) so the route can dispatch a fresh `app/session.auto_file_requested` with the correct dedupe key.
  - `requestSessionLibraryFiling(db, profileId, sessionId)` — **[CRITICAL-O / HIGH-T]** user-initiated Add to Library from Summary. Allows freeform sessions with `filing_status IS NULL`, `filing_failed`, or `filing_kept_out`, as long as `topic_id IS NULL` and `filed_at IS NULL`. Clears `filing_status`, resets `filing_retry_count = 0`, updates `updated_at`, and returns `{ session, dispatchId }`. This endpoint bypasses the automatic 3-turn threshold because explicit user intent is enough signal to try filing. It still requires transcript availability.
  - `resetFilingForRetry(db, profileId, sessionId)` — **[HIGH-C / HIGH-D]** CAS UPDATE: `WHERE id = $sessionId AND profile_id = $profileId AND filing_status IN ('filing_failed', 'filing_kept_out') → filing_status = NULL, filing_retry_count = 0, updated_at = NOW() RETURNING id, filing_retry_count`. Predicate excludes `filing_pending` (would race with an in-flight handler) and `filing_recovered` (no recovery needed). Used by the terminal Retry path and by `restoreSessionForAutoFiling`. This is the single mechanism that satisfies spec §6 line 254 ("Retry re-dispatches a new auto-file event (which resets the count)"). **[HIGH-P]** Do not use the returned retry count as the dispatch dedupe key after reset; generate a separate dispatch id.
  - `claimSessionForAutoFiling(db, profileId, sessionId)` — CAS UPDATE: `WHERE id = $sessionId AND profile_id = $profileId AND filing_status IS NULL AND topic_id IS NULL → filing_status = 'filing_pending', filing_retry_count = filing_retry_count + 1, updated_at = NOW() RETURNING id, filing_retry_count`. **[CRITICAL-B]** Reset on retry lives in `resetFilingForRetry`, NOT in this CAS. The 3-attempt cap is enforced inside the auto-file handler: after the claim, check `filing_retry_count > FILING_CONFIG.maxRetries` and exit via spec §6's terminal branch (set `filing_status = 'filing_failed'`, do not retry).
  - `detachSessionFromFiledTopic(db, profileId, sessionId)`.
- `apps/api/src/services/curriculum/curriculum-topic.ts` - **[HIGH-E]** Add `deleteTopicIfSafe(db, profileId, sessionId, topicId)` implementing spec §4 fully: `filedFrom IN ('freeform_filing', 'session_filing')` **[MEDIUM-G]** (spec §4 line 165 says `'freeform_filing'` only, contradicting §5 which sets auto-file topics to `'session_filing'` — broaden here AND submit a spec PR fixing §4), `curriculum_topics.sessionId === sessionId`, no other `learning_sessions.topicId` references, no `curriculum_topic_progress` references, no `curriculum_topic_retention` references. Returns `{ deleted: boolean, reason?: string }`. Exported from the service barrel; called by BOTH `markSessionKeptOutOfLibrary` (keep-out-after-filing path) AND the auto-file handler's 0-row branch (PR 2). No duplicate inline checks anywhere.
- `apps/api/src/routes/sessions.ts` - add session filing endpoints:
  - `POST /sessions/:sessionId/library-filing/keep-out`
  - `POST /sessions/:sessionId/library-filing/add` — **[CRITICAL-O / HIGH-T]** explicit Add to Library from Summary for any unfiled freeform session, including below-threshold sessions and `filingStatus = null` sessions where the close-path non-core dispatch never landed. Calls `requestSessionLibraryFiling`, then dispatches `app/session.auto_file_requested` with a generated dispatch id. **[CRITICAL-N]** This is a CORE user action: use awaited `inngest.send(...)`, not `safeSend()`, so dispatch failure returns an API error and the UI does not show fake pending work.
  - `POST /sessions/:sessionId/library-filing/restore` — [HIGH-4 / HIGH-D] re-enable filing on a kept-out session. Implement as an alias/wrapper around `library-filing/add` for backwards compatibility with the plan language. It dispatches `app/session.auto_file_requested` as a CORE send with a generated dispatch id. **[CRITICAL-N / HIGH-P]**
  - `POST /sessions/:sessionId/retry-filing` — **[HIGH-C]** existing endpoint reworked for the auto-file ladder. When `session.metadata.effectiveMode === 'freeform'`: call `resetFilingForRetry` instead of `claimSessionForFilingRetry`, then dispatch `app/session.auto_file_requested` as a CORE send with a generated dispatch id. Homework sessions (`session.sessionType === 'homework'`) keep the existing `app/filing.retry` ladder unchanged.
- `apps/api/src/routes/filing.ts` - reject/skip filing requests for kept-out sessions. **[HIGH-F]** Verification + test only — no code change. The existing `claimSessionForFilingRetry` CAS (`session-crud.ts:1463-1486`) already returns 409 for any non-`filing_failed` status, including `filing_kept_out`. Add an integration test in `routes/filing.test.ts` that POSTs `/filing/request-retry` against a kept-out session and asserts 409 + the kept-out status in the error message.
- `apps/api/src/services/filing.ts` - **[CRITICAL-2]** Split `resolveFilingResult()` so it stops touching `learning_sessions`. Today (`filing.ts:813-826`, inside the topic-creation transaction) it unconditionally writes `topicId` and `filedAt`. After this change:
  - `resolveFilingResult()` returns the resolved subject/book/topic IDs only — no side effect on `learning_sessions`.
  - The synchronous `/filing` POST handler (`routes/filing.ts:225` + `:273`) calls the extended `markSessionFiled()` helper (see `session-book.ts` below). **[CRITICAL-A]** `markSessionFiled` must set `topicId` AND `filedAt` AND `updatedAt`. The old `backfillSessionTopicId` only wrote `topicId`; shipping the split without extending it leaves `filedAt = null` on every newly-filed session, and `freeform-filing.ts:56` keys "already filed" off `row.filedAt != null` — so the retry handler would re-fire `fileToLibrary` and double-create the topic.
  - **[HIGH-R]** Existing synchronous callers must handle the new split as one logical operation. Preferred implementation: expose a service wrapper such as `fileSessionToLibraryAndMarkFiled(db, args)` that runs `resolveFilingResult()` and `markSessionFiled()` in the same transaction when the caller owns both steps. If a transaction is not practical with current helper boundaries, add cleanup/idempotency coverage proving that a failure after topic creation but before `markSessionFiled()` does not leave a visible duplicate/orphan topic on retry.
  - The auto-file Inngest handler issues a **guarded** UPDATE per spec §6: `WHERE id = $sessionId AND filing_status = 'filing_pending'` SETTING `{ topic_id, filed_at, filing_status = 'filing_recovered', updated_at }` RETURNING id. On 0 rows returned, call `deleteTopicIfSafe()` against the just-created topic. **[CRITICAL-3 / HIGH-E]**
  - Existing `freeform-filing.ts` (manual retry) — calls `markSessionFiled()` after the new split `resolveFilingResult()`.
- `apps/api/src/services/session/session-book.ts` - **[CRITICAL-A]** Rename `backfillSessionTopicId(db, profileId, sessionId, topicId)` → `markSessionFiled(db, profileId, sessionId, topicId)`. New body: `UPDATE learning_sessions SET topic_id = $topicId, filed_at = NOW(), updated_at = NOW() WHERE id = $sessionId AND profile_id = $profileId`. Add a JSDoc warning: "Canonical write for 'session is now filed.' After 2026-05-25 callers own this UPDATE because `resolveFilingResult` no longer touches `learning_sessions`. Do NOT add ad-hoc UPDATEs that set only `topicId` — `freeform-filing.ts:56` keys 'already filed' off `filedAt != null` and a partial update will cause re-filing." Update the call site at `routes/filing.ts:274` and the test mock at `routes/filing.test.ts:155`.

### Inngest

- `apps/api/src/inngest/functions/freeform-filing.ts` - skip `filing_kept_out`; consume the new `resolveFilingResult()` contract (no session UPDATE inside resolver).
- `apps/api/src/inngest/functions/auto-file-session.ts` - **new** handler for `app/session.auto_file_requested`. [HIGH-1] `filedFrom = 'session_filing'`. Owns the CAS claim, the LLM filing call, the guarded final UPDATE, and the failure transition to `filing_failed` when the handler exhausts its own Inngest retries. **[HIGH-Q]**
- `apps/api/src/inngest/functions/filing-stranded-backfill.ts` - **[CRITICAL-1 / LOW-M]** Add `(metadata->>'effectiveMode' IS DISTINCT FROM 'freeform' OR exchange_count >= FILING_CONFIG.minFreeformExchanges)` to the WHERE clause so below-threshold freeform sessions are not swept up. **Risk framing:** this backfill is operator-fired only (see file header `:16-23` "No automatic trigger by design"), not a cron — the failure mode is "operator manually fires the recovery event after an incident, and the recovery sweeps up 1-2-turn freeform chats that legitimately should stay unfiled." Still a real bug; just not auto-firing in production. The `IS NULL filing_status` filter already excludes `filing_kept_out`; the threshold filter is the new gate. Also exclude kept-out sessions via explicit `filing_status IS DISTINCT FROM 'filing_kept_out'` for clarity even though `IS NULL` covers it.
- `apps/api/src/inngest/functions/filing-timed-out-observe.ts` - do not mark kept-out sessions failed.
- `apps/api/src/inngest/functions/filing-timed-out-observe.ts` - **[HIGH-Q]** update or explicitly bypass the legacy `app/filing.retry` auto-retry branch for freeform sessions claimed by `app/session.auto_file_requested`. If it observes a pending freeform session, it must dispatch the new `app/session.auto_file_requested` event with a fresh dispatch id, or leave retry ownership entirely to `auto-file-session` and only mark terminal failure after the handler's retry policy is exhausted. Do not silently route new auto-file sessions through old `filedFrom = 'freeform_filing'` retry behavior.
- `apps/api/src/inngest/functions/filing-completed-observe.ts` - no-op for kept-out sessions.
- `apps/api/src/inngest/functions/filing-observe.ts` - [MEDIUM-1] audit for `filing_kept_out` handling. This file is part of the filing observer set and was missing from earlier drafts of this plan; review it alongside the other observers.
- `apps/api/src/inngest/index.ts` - register `auto-file-session` handler.

### Mobile

- `apps/mobile/src/hooks/use-sessions.ts` - add `filing_kept_out` type; polling should return `false`.
- `apps/mobile/src/hooks/use-filing.ts` - add keep-out mutation, add-to-library mutation, restore mutation alias, rename mutation for auto-created filed topics, and a fresh `useSessionLibraryFiling(sessionId)` hook that exposes the compact-status view used by Session Summary. All mutations MUST call `queryClient.invalidateQueries({ queryKey: [...sessions...] })` on success so the session list/summary refresh; without that the kept-out/add/restore round-trip displays stale state. [MEDIUM-7 / HIGH-T / MEDIUM-U]
- `apps/mobile/src/components/session/FilingFailedBanner.tsx` - avoid rendering failure UI for kept-out sessions; support pending/recovered copy if reused as filing status UI.
- `apps/mobile/src/components/session/SessionFooter.tsx` - remove the blocking filing prompt **for freeform sessions only**. Homework close path is unchanged. [MEDIUM-4] The freeform branch in the parent (`(app)/session/index.tsx`) should never set `showFilingPrompt = true`.
- `apps/mobile/src/components/session/use-session-actions.ts` - after freeform close, enqueue/trigger auto-file and navigate to summary without requiring a prompt decision.
- `apps/mobile/src/app/(app)/session/index.tsx` - wire status and keep-out action where needed.
- `apps/mobile/src/app/session-summary/[sessionId].tsx` - show Library filing status/actions for freeform sessions. Expose `Add to Library` for every unfiled freeform summary (`filingStatus = null`, `filing_failed`, or `filing_kept_out`), not only kept-out summaries. [HIGH-4 / CRITICAL-O / HIGH-T] When filed, show the resolved destination (topic title and parent subject/book if available), tap-through to the topic, and a minimal rename action for auto-created topics. [MEDIUM-U] Rename edits the shared Library topic row; if more than one session is attached, the confirmation copy must say this renames the topic for all linked chats.
- `apps/mobile/src/app/(app)/library.tsx` (or the Library tab's current list/search entry screen) - add a compact "Library additions need attention" row/count for failed freeform filing in the Library tab's existing scan path. Do not place the primary attention surface on Home, and do not add push notifications in this PR. [MEDIUM-V]
- `apps/mobile/src/i18n/locales/en.json` and generated locale files - add user-facing copy:
  - `Added to Library`
  - `Adding this to your Library...`
  - `Don't add to Library` (pending/null)
  - `Remove from Library` (filed)
  - `Keep out of Library` (generic fallback only)
  - `Kept out of Library`
  - `Add to Library` (shown on kept-out, failed, and below-threshold/unfiled summaries) [HIGH-4 / HIGH-T]
  - `Still adding this to your Library...`
  - `Could not add this to Library`

### Flow Docs

- `docs/flows/master-directory/learn/LEARN-01.md` - create.
- `docs/flows/master-directory/learn/SUBJECT-03.md` - create. [LOW-1] Subject-creation-from-chat is a chat-session sub-flow, so it lives under `learn/`.
- `docs/flows/master-directory/learn/SUBJECT-05.md` - create. [LOW-1] Same reasoning — subject resolution from chat is a learn-flow concern.
- `docs/flows/master-directory/home/HOME-01.md` - update Ask Anything and Study New rows.
- `docs/flows/master-directory/learn/LEARN-07.md` - replace filing/dismissal ambiguity.
- `docs/flows/master-directory/learn/LEARN-08.md` - add session-history vs Library-filing rule.
- `docs/flows/flow-master-directory.md` - link new pages and mark mapped.

---

## PR 1 Tasks - Backend Filing State And Keep-Out

- [ ] Add `filing_kept_out` to shared `filingStatusSchema`.
- [ ] Add typed `getSessionEffectiveMode(session)` accessor to `@eduagent/schemas`. [HIGH-3] All effective-mode reads in PR 2 must route through this.
- [ ] Add DB migration for `filing_status` enum value. [MEDIUM-3] Verify the SQL file does NOT wrap `ALTER TYPE ADD VALUE` in a transaction block; run `pnpm run db:migrate:dev` locally before merge.
- [ ] Update API/mobile types that narrow filing status unions.
- [ ] Add `markSessionKeptOutOfLibrary(db, profileId, sessionId)`.
- [ ] The keep-out service must:
  - verify session ownership by `profileId`;
  - set `topicId = null`;
  - set `filedAt = null`;
  - set `filingStatus = 'filing_kept_out'`;
  - update `updatedAt`;
  - never delete the session.
- [ ] If the session had an auto-created topic, add a guarded cleanup helper:
  - detach session first;
  - delete topic only when `curriculum_topics.sessionId === sessionId`, `filedFrom IN ('freeform_filing', 'session_filing')`, no other session references it, and no `curriculum_topic_progress` / `curriculum_topic_retention` rows reference it (full spec §4 safe-to-delete rule);
  - leave existing/reused topics intact.
- [ ] **[MEDIUM-H]** Create `apps/api/src/config/filing.ts` exporting `FILING_CONFIG.minFreeformExchanges = 3` and `FILING_CONFIG.maxRetries = 3`. Migrate every site that referenced inline `MIN_FREEFORM_FILE_EXCHANGES` / `MAX_FILING_RETRIES` (in this plan's text — none in code yet) to import from here.
- [ ] **[CRITICAL-A]** Rename `backfillSessionTopicId` → `markSessionFiled(db, profileId, sessionId, topicId)` in `apps/api/src/services/session/session-book.ts`. New body sets `{ topicId, filedAt: new Date(), updatedAt: new Date() }`. Update the single call site at `apps/api/src/routes/filing.ts:274` and the test mock at `apps/api/src/routes/filing.test.ts:155`. Add the JSDoc warning quoted in the Files To Modify section so future contributors don't reintroduce a partial UPDATE.
- [ ] **[HIGH-C / HIGH-D]** Add `resetFilingForRetry(db, profileId, sessionId)` service. CAS UPDATE: `WHERE id = $sessionId AND profile_id = $profileId AND filing_status IN ('filing_failed', 'filing_kept_out') → filing_status = NULL, filing_retry_count = 0, updated_at = NOW() RETURNING id, filing_retry_count`. Excludes `filing_pending` (in-flight) and `filing_recovered` (no reset needed). Returns the row.
- [ ] **[CRITICAL-O / HIGH-T]** Add `requestSessionLibraryFiling(db, profileId, sessionId)` service for explicit user Add to Library from Summary. It accepts unfiled freeform sessions in `filingStatus = null`, `filing_failed`, or `filing_kept_out`, resets status/count to a claimable state, requires transcript availability, and returns a generated dispatch id. It does NOT enforce the automatic 3-turn threshold.
- [ ] **[HIGH-E]** Add `deleteTopicIfSafe(db, profileId, sessionId, topicId)` in `apps/api/src/services/curriculum/curriculum-topic.ts` (or appropriate service location). Implements the full spec §4 safe-to-delete rule with the broadened `filedFrom IN ('freeform_filing', 'session_filing')` check. Export from barrel. Used by keep-out service AND auto-file handler (PR 2).
- [ ] Add `restoreSessionForAutoFiling(db, profileId, sessionId)` service. [HIGH-4 / HIGH-D] Requires `filingStatus = 'filing_kept_out'`; internally calls `resetFilingForRetry` so BOTH `filingStatus` and `filingRetryCount` are cleared. Returns the session row.
- [ ] **[CRITICAL-2 / HIGH-R]** Split `resolveFilingResult()` in `apps/api/src/services/filing.ts`: remove the `learning_sessions` UPDATE block at lines 813-826 (inside the topic-creation transaction). Update both existing callers — synchronous `/filing` route handler (`routes/filing.ts:225` + `:273`) and `freeform-filing.ts` retry (`:161-175`) — to call `markSessionFiled()` on success through a transactional wrapper or add cleanup/idempotency coverage for failure between topic creation and session marking. PR 2 will add the guarded UPDATE for the auto-file handler.
- [ ] Add `POST /sessions/:sessionId/library-filing/keep-out`.
- [ ] Add `POST /sessions/:sessionId/library-filing/add`. [CRITICAL-O / HIGH-T] On success, dispatch `app/session.auto_file_requested` via awaited `inngest.send(...)` as a CORE user action with a generated dispatch id. A dispatch failure must return an error to the client.
- [ ] Add `POST /sessions/:sessionId/library-filing/restore`. [HIGH-4 / MEDIUM-I] Implement as a kept-out compatible wrapper around `library-filing/add`, also using CORE dispatch.
- [ ] **[HIGH-C / MEDIUM-I / CRITICAL-N / HIGH-P]** Rework `POST /sessions/:sessionId/retry-filing` for freeform sessions. When `session.metadata.effectiveMode === 'freeform'` (read via `getSessionEffectiveMode`): call `resetFilingForRetry` (not `claimSessionForFilingRetry`), then dispatch `app/session.auto_file_requested` via awaited `inngest.send(...)` with a generated dispatch id, not `filing_retry_count`. Homework path (`sessionType === 'homework'`) is unchanged. Test: a session at terminal `filing_failed` with `filing_retry_count = 3` can be retried (resets count, re-dispatches), and a simulated dispatch failure does not leave the UI believing a retry is pending.
- [ ] **[HIGH-F]** Verification + test only (no endpoint code change): the existing `claimSessionForFilingRetry` CAS at `session-crud.ts:1463-1486` already returns 409 for any `filing_status ≠ 'filing_failed'`, including `filing_kept_out`. Add an integration test in `apps/api/src/routes/filing.test.ts` that POSTs `/filing/request-retry` against a kept-out session and asserts 409 with the kept-out status in the message.
- [ ] Update `FilingFailedBanner` data contract tests if the component receives this status.

### PR 1 Acceptance Criteria

- Given a freeform session exists for profile A, when profile A marks it kept out, then the row remains and has `topicId = null`, `filedAt = null`, and `filingStatus = 'filing_kept_out'`.
- Given profile B calls keep-out for profile A's session, when the request is processed, then the API returns protected/not-found and does not mutate the row.
- Given a session is `filing_kept_out`, when retry filing is requested, then the API returns 409 and does not dispatch `app/filing.retry`.
- Given a session is already attached to an existing Library topic, when keep-out is requested, then the session detaches but the existing topic remains.
- [HIGH-4 / HIGH-D / HIGH-P] Given a session is `filing_kept_out` AND `filing_retry_count = 3`, when the user calls `POST /sessions/:sessionId/library-filing/restore`, then `filingStatus` clears to `null` AND `filing_retry_count` resets to `0` AND `app/session.auto_file_requested` is dispatched with a unique generated dispatch id. Profile B calling restore on profile A's session returns protected/not-found.
- [CRITICAL-O / HIGH-T] Given a freeform session has only 1-2 useful learner turns and `filingStatus = null`, when the user taps `Add to Library` on Summary, then the API dispatches `app/session.auto_file_requested` even though the automatic background threshold was not met.
- [HIGH-C / CRITICAL-N] Given a freeform session at `filing_failed` with `filing_retry_count = 3`, when the user calls `POST /sessions/:sessionId/retry-filing`, then `resetFilingForRetry` clears both fields AND a fresh `app/session.auto_file_requested` is dispatched via CORE send. Without HIGH-C, this endpoint returns 429 ("Retry limit reached") forever. If the dispatch fails, the endpoint returns an error instead of silently swallowing it.
- [CRITICAL-A / CRITICAL-2] Given the synchronous `/filing` POST is called (existing manual path), when it succeeds, then the session row has BOTH `topicId` set AND `filedAt` set (`markSessionFiled` writes both). Add a positive assertion in `apps/api/src/routes/filing.test.ts` that explicitly reads back `filedAt != null` after a successful POST — without this, the resolver split could silently regress `filedAt` and the next retry would re-file.

---

## PR 2 Tasks - Auto-File Freeform Sessions

- [ ] Audit every `learning_sessions` insert path and confirm the freeform entry actually writes `metadata.effectiveMode = 'freeform'`. **[HIGH-3 / MEDIUM-L]** Today `session-crud.ts:906` defaults to `effectiveMode: 'learning'`; if any freeform creation path forgets to override, auto-file silently never fires for that path. Target files to audit:
  - `apps/api/src/services/session/session-crud.ts` — `startSession`, onboarding fast-path, curriculum-first session creation (the `'learning'` default lives here).
  - `apps/api/src/inngest/functions/*.ts` — any handler that calls `startSession` or inserts into `learning_sessions` directly.
  - `tests/integration/test-factory/sessions.ts` and any mobile/API test factories that seed sessions — failure here means the integration tests pass on a non-freeform fixture and the regression escapes.
  - Mobile entry points that hit `POST /sessions` with `mode: 'freeform'` (`apps/mobile/src/app/(app)/_layout.tsx:1024`, `apps/mobile/src/app/create-subject.tsx:266`, `apps/mobile/src/components/home/LearnerScreen.tsx:404`) — verify the API route maps the request body `mode: 'freeform'` to `metadata.effectiveMode: 'freeform'` before insert.
  Add a unit test per insert path asserting the persisted `metadata.effectiveMode`. Read all access through the new `getSessionEffectiveMode` accessor — never index `metadata` inline.
- [ ] Add eligibility helper (reads through `getSessionEffectiveMode`):
  - effective mode is freeform;
  - `topicId` is null;
  - `filedAt` is null;
  - `filingStatus` is null;
  - learner exchange count >= `MIN_FREEFORM_FILE_EXCHANGES`;
  - transcript exists.
- [ ] On session close, enqueue auto-file for eligible sessions. **[HIGH-5 / MEDIUM-I]** Dispatch via `safeSend()` with Inngest event dedupe key `id: \`auto-file-${sessionId}-initial\`` so duplicate close-path dispatches are idempotent. Retry / Add / Restore use generated dispatch ids so a fresh user-initiated request is NEVER collapsed against the initial close dispatch. [HIGH-P]
- [ ] **[HIGH-1]** Implement a dedicated `app/session.auto_file_requested` handler in `apps/api/src/inngest/functions/auto-file-session.ts`. Do NOT reuse `freeform-filing.ts` (that handler is `app/filing.retry`, hard-codes `filedFrom = 'freeform_filing'`, and does not implement the spec §6 CAS pattern). Auto-file sets `filedFrom = 'session_filing'`.
- [ ] Claim the session with a CAS update to `filing_pending` before calling the LLM (`claimSessionForAutoFiling`). On 0 rows returned, exit without dispatching `app/filing.completed`.
- [ ] Re-read before writes; skip if `filing_kept_out`, already filed, missing, ownership mismatch, or no longer eligible (full spec §6 exit list).
- [ ] **[CRITICAL-B]** Cap enforcement: after `claimSessionForAutoFiling` succeeds, if `filing_retry_count > FILING_CONFIG.maxRetries`, set `filing_status = 'filing_failed'` and exit — do not call the LLM. **Retry resets the count** (spec §6 line 254) — that reset is owned by `resetFilingForRetry` invoked from the Retry button / restore path; the auto-file handler itself never resets. This replaces the earlier "share the cap, no reset" wording.
- [ ] Reuse `fileToLibrary()`. Call the new split `resolveFilingResult()` (PR 1) which no longer touches `learning_sessions`.
- [ ] Final write is a **guarded UPDATE** SETTING `{ topic_id, filed_at, filing_status = 'filing_recovered', updated_at }` WHERE `id = $sessionId AND filing_status = 'filing_pending' RETURNING id`. On 0 rows returned (user keep-out raced), call `deleteTopicIfSafe(db, profileId, sessionId, topicId)` from the shared service (PR 1 / HIGH-E) against the topic just created. **[CRITICAL-3 / HIGH-E]** Without this branch, a topic with `sessionId = X` is orphaned in Library while the session is kept-out.
- [ ] **[HIGH-Q]** Define auto-file handler failure behavior explicitly. If `fileToLibrary()`/`resolveFilingResult()` fails after claim and Inngest has exhausted handler retries, set `filing_status = 'filing_failed'`, leave `topic_id`/`filed_at` null, and emit an observable failure event/counter. Do not leave sessions indefinitely `filing_pending`.
- [ ] **[MEDIUM-Z / MEDIUM-U]** Add integration coverage for repeated related freeform chats: three sessions with substantially the same concept should resolve/link to the existing topic when the resolver is confident, not create three duplicate Library topics. Rename semantics are topic-level: if session A renames an auto-created topic and session B later links to that topic, session B sees the renamed topic title. If current resolver behavior cannot guarantee dedupe, document the limitation and add Library-bloat follow-up before GA.
- [ ] Emit existing `app/filing.completed` on success.
- [ ] Preserve existing timeout observer behavior for pending/failed states, but update it for the new auto-file event boundary. [HIGH-Q] A pending freeform auto-file session must not be retried through legacy `app/filing.retry` unless that path has been updated to the new `filedFrom = 'session_filing'` and guarded-update contract.
- [ ] **[CRITICAL-1 / LOW-M]** Update `filing-stranded-backfill.ts` SELECT to add `(metadata->>'effectiveMode' IS DISTINCT FROM 'freeform' OR exchange_count >= FILING_CONFIG.minFreeformExchanges)`. Without this, when an operator manually fires the backfill (file header `:16-23` "Ops-only: fire manually from Inngest dashboard. No automatic trigger by design"), it sweeps up below-threshold freeform chats with `filingStatus = null` and tries to file them. Add a regression integration test: create a 1-turn freeform session with `filingStatus = null`, run the backfill, assert no synthetic-timeout event was dispatched.
- [ ] Ensure stranded backfill excludes `filing_kept_out` (trivially covered by `filingStatus IS NULL` but add an explicit predicate for readability).
- [ ] Audit `filing-observe.ts` for `filing_kept_out` handling. [MEDIUM-1]

### PR 2 Acceptance Criteria

- Given a freeform session has 3 learner turns and no topic, when the learner ends the session, then the API marks filing pending and enqueues durable auto-filing.
- Given auto-filing succeeds, when the job completes, then a subject/book/topic exists, the session has `topicId`, and the topic has `filedFrom = 'session_filing'`.
- Given the user marks keep-out while filing is pending, when the job wakes up, then it exits without creating or attaching a topic.
- [CRITICAL-3] Given the user marks keep-out **between** `resolveFilingResult()` (topic created) and the final guarded UPDATE, when the UPDATE returns 0 rows, then the handler runs the spec §4 safe-to-delete check on the just-created topic and removes it if eligible. Integration test must simulate this race.
- Given filing fails, when observers run, then the session reaches `filing_failed` and the user can retry.
- Given a freeform session has fewer than 3 learner turns, when it closes, then no Library filing is attempted.
- [HIGH-T] Given a freeform session has fewer than 3 learner turns, when the user explicitly taps `Add to Library` from Summary, then Library filing is attempted.
- [CRITICAL-1 / LOW-M] Given a 1-turn freeform session ends with `filingStatus = null` (below threshold), when an operator manually fires the stranded backfill, then no `app/session.filing_timed_out` event is dispatched for that session.
- [HIGH-5 / MEDIUM-I / HIGH-P] Given two concurrent close-path dispatches fire for the same session, when both arrive at Inngest, then the `auto-file-${sessionId}-initial` dedupe collapses them and only one CAS claim succeeds. Given a Retry/Add click follows a failed close-path dispatch, the generated dispatch id is distinct from the initial key and from prior manual attempts, so the user-initiated attempt is NOT collapsed as a duplicate.
- [CRITICAL-B] Given a freeform session reached terminal `filing_failed` with `filing_retry_count = 3`, when the user calls Retry, then `resetFilingForRetry` clears both fields, a fresh `app/session.auto_file_requested` fires, and the auto-file handler runs the LLM call exactly once before the cap kicks in again. Confirms spec §6 line 254 ("Retry resets the count") is shipped, not the older "share the cap" wording.
- [HIGH-Q] Given the auto-file handler claims a session and the LLM/resolver keeps failing through handler retries, when retries are exhausted, then the row becomes `filing_failed` and no pending spinner remains forever.
- [MEDIUM-Z / MEDIUM-U] Given three meaningful freeform chats about the same concept are filed, when the resolver is confident they refer to the same Library topic, then all three sessions link to that existing topic rather than creating topic duplicates; if the topic was renamed after the first session, later linked sessions display the renamed topic title.

---

## PR 3 Tasks - Mobile UX

- [ ] Remove the normal post-close blocking filing prompt **for freeform sessions only**. [MEDIUM-4 / MEDIUM-X] Homework filing prompt is out of scope and unchanged in this PR series; document the temporary inconsistency in flow docs and do not present it as the final cross-mode close pattern.
- [ ] **[HIGH-S]** Release gate: PR 3 must either ship together with the upstream Ask First / Unsorted auto-subject work, or be released/communicated only as "freeform close no longer asks a second Library question." Do not market it as "Ask Anything has no upfront friction" while the subject picker still appears.
- [ ] After freeform close, navigate to Session Summary immediately.
- [ ] Show compact filing state on Session Summary:
  - initial / unknown (briefly, before the handler claims): `Adding this to your Library...` — [LOW-2] cover the `filingStatus = null → filing_pending` transition in a unit test.
  - pending;
  - success with topic title, parent subject/book when available, and tap-through to the topic; [MEDIUM-U]
  - failed with retry;
  - not in Library / below automatic threshold with Add to Library; [HIGH-T]
  - kept out.
- [ ] **[MEDIUM-J / MEDIUM-W]** Polling cadence in `useSessionLibraryFiling(sessionId)`: TanStack Query `refetchInterval: 3000`, `refetchIntervalInBackground: false`, `refetchOnWindowFocus: true`. Stop polling when `filingStatus` reaches a terminal value (`filing_recovered`, `filing_failed`, `filing_kept_out`) or after 10 polls (~30s elapsed). On timeout without terminal state, render non-terminal copy (`Still adding this to your Library...`) with refresh and keep-out actions. Do NOT render failure copy or enable Retry until the server reports terminal `filing_failed`. Add a unit test that fires 10 ticks and asserts polling stops without exposing Retry.
- [ ] **[MEDIUM-Y]** Use state-specific action copy:
  - pending/null auto-file: `Don't add to Library`;
  - filed: `Remove from Library`;
  - kept out / below-threshold / unfiled: `Add to Library`.
- [ ] **[HIGH-T]** Add `Add to Library` action on every unfiled freeform summary, not only kept-out summaries. For `filingStatus = null` below the automatic threshold, call `POST /sessions/:sessionId/library-filing/add`.
- [ ] [HIGH-4] Keep `Add to Library` action on kept-out summaries; it calls the same add/restore API. After success, the UI returns to pending and the user can see auto-file progress.
- [ ] **[MEDIUM-U]** For auto-created filed topics, provide a minimal inline rename affordance from Summary. Full subject/book picker remains out of scope, but the user must not be stuck with an obviously wrong LLM-generated topic title. Rename updates the shared Library topic, not a per-session alias. If more than one session is already attached to the topic, confirmation copy must say the new title applies to all linked chats.
- [ ] **[MEDIUM-V]** Add the failed-Library-addition attention surface to the Library tab's existing list/search entry screen. It should list/count freeform sessions with `filingStatus = 'filing_failed'` so users scanning their Library can find and retry failed additions. Do not put the primary recovery path on Home in this PR.
- [ ] [MEDIUM-7] Keep-out, add, restore, retry, and rename mutations must invalidate the relevant TanStack Query keys (`use-sessions`, `use-filing`, session summary detail, Library topic/detail keys) on success — without invalidation, the user sees stale filing status until the next refetch-on-focus.
- [ ] If filed and remove-from-Library is tapped, call keep-out endpoint and update the UI optimistically only after success.
- [ ] Preserve `I'm Done` behavior and existing session close timeout handling.
- [ ] Ensure copy uses `Library`, not internal "filing."

### PR 3 Acceptance Criteria

- Given a meaningful freeform session closes, when the user confirms end session, then they are not asked whether to save; they land on Session Summary.
- [HIGH-S] Given the upstream subject-picker still appears before a freeform session, when PR 3 is released, then product/release copy does not claim Ask Anything is frictionless before the first turn.
- Given filing is pending, when Session Summary renders, then it shows `Adding this to your Library...` and `Don't add to Library`.
- Given the user taps `Don't add to Library` while pending or `Remove from Library` after filing, when the mutation succeeds, then the summary remains visible and the Library status changes to kept out.
- [HIGH-4 / HIGH-T] Given the session is kept out OR was below the auto-file threshold with `filingStatus = null`, when the user taps `Add to Library`, then the add/restore mutation runs and the status returns to pending.
- Given filing succeeds, when the summary refetches, then it shows an added/linked Library message with topic title, destination, tap-through, and rename for auto-created topics.
- [MEDIUM-U / MEDIUM-Z] Given a filed topic has multiple linked sessions, when the learner renames it from one Summary, then the topic title changes everywhere that shared topic is shown and the confirmation copy makes the shared effect explicit.
- Given filing fails, when the summary renders, then retry is available and no raw error text leaks into chat UI.
- [MEDIUM-W] Given local polling reaches 10 ticks while the server is still pending/null, when Summary renders, then it says the Library add is still in progress and does not show Retry until the server reports `filing_failed`.
- [MEDIUM-V] Given filing fails after the user leaves Summary, when the user later opens the Library tab, then a small attention item/count in the Library scan path lets them find and retry the failed Library addition.
- [MEDIUM-4] Given a homework session closes, when the user confirms end session, then the homework filing prompt behavior is unchanged (this PR does not touch homework UX).

---

## PR 4 Tasks - Documentation Reconciliation

- [ ] Create `LEARN-01` for Freeform chat / Ask Anything.
- [ ] Create `SUBJECT-03` for subject creation/resolution from chat.
- [ ] Create `SUBJECT-05` for subject resolution and clarification suggestions.
- [ ] Update `HOME-01`:
  - Study New creates subject up front;
  - Ask Anything starts freeform chat;
  - freeform chat can later file into Library.
- [ ] Update `LEARN-07`:
  - remove ambiguous "filing/dismissal" language;
  - explain auto-file, failed-file, and keep-out states.
  - document the temporary freeform-vs-homework close behavior difference without implying it is final product doctrine. [MEDIUM-X]
- [ ] Update `LEARN-08`:
  - Library contains filed topics;
  - session history can exist outside Library;
  - filed topics always belong to subjects.
- [ ] Update `docs/flows/flow-master-directory.md` mapped rows.
- [ ] Link this spec from relevant new pages.

### PR 4 Acceptance Criteria

- Given a fresh agent reads the flow docs, when they compare `Ask Anything`, subject creation, Session Summary, and Library, then they see one consistent model.
- Given the user keeps a freeform session out of Library, when docs describe the result, then they say the session remains saved but is not a Library topic.
- Given a Library topic is mentioned, when docs describe ownership, then they state it belongs to the active learner and sits under a subject.
- [MEDIUM-X] Given freeform and homework close behavior differ in this PR series, when docs describe the flows, then they explicitly scope the no-prompt behavior to freeform sessions and avoid teaching users/agents a false universal close pattern.

---

## Test Plan

### API Unit/Integration

- `packages/schemas/src/sessions.test.ts`
- `apps/api/src/routes/sessions.test.ts`
- `apps/api/src/routes/filing.test.ts`
- `apps/api/src/services/filing.integration.test.ts`
- `apps/api/src/inngest/functions/freeform-filing.test.ts`
- `apps/api/src/inngest/functions/filing-stranded-backfill.test.ts`
- `apps/api/src/inngest/functions/filing-timed-out-observe.test.ts`
- `apps/api/src/inngest/functions/filing-completed-observe.test.ts`

### Mobile Unit

- `apps/mobile/src/components/session/FilingFailedBanner.test.tsx`
- `apps/mobile/src/components/session/SessionFooter.test.tsx`
- `apps/mobile/src/components/session/use-session-actions.test.ts`
- `apps/mobile/src/app/session-summary/[sessionId].test.tsx`
- `apps/mobile/src/hooks/use-sessions.test.ts`

### E2E

Add or update a Maestro flow after PR 3:

- Start Ask Anything.
- Send 3 meaningful learner turns.
- End session.
- Verify no blocking filing prompt.
- Verify Session Summary appears.
- Verify Library status appears.
- Tap `Don't add to Library` while pending.
- Verify session summary remains accessible.
- Verify topic does not appear in Library search/results for that session.
- Start a short 1-2 turn Ask Anything session.
- End session and verify Summary shows `Add to Library`.
- Tap `Add to Library` and verify pending/success state.
- Reopen the Library tab with a seeded failed filing session and verify the attention item appears in the Library scan path.

---

## Validation Commands

Targeted while iterating:

```bash
pnpm exec nx run api:test -- --runTestsByPath apps/api/src/routes/sessions.test.ts apps/api/src/routes/filing.test.ts
pnpm exec nx run api:test -- --runTestsByPath apps/api/src/services/filing.integration.test.ts
cd apps/mobile && pnpm exec jest src/app/session-summary/[sessionId].test.tsx src/components/session/SessionFooter.test.tsx src/hooks/use-sessions.test.ts --no-coverage
```

Before calling implementation complete:

```bash
pnpm exec nx run api:typecheck
pnpm exec nx run api:test
cd apps/mobile && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec jest --no-coverage
```

Run integration tests because this touches DB behavior, profile-scoped session writes, Inngest retry flows, and cross-package contracts.

---

## Risks And Guardrails

| Risk | Guardrail |
| --- | --- |
| Kept-out sessions get filed later by stranded backfill | Terminal `filing_kept_out` state; all filing jobs skip it. |
| **[CRITICAL-A]** Splitting `resolveFilingResult` regresses `filedAt` because `backfillSessionTopicId` only wrote `topicId` — `freeform-filing.ts:56` then re-fires the LLM and double-creates the topic | Rename to `markSessionFiled`; new body writes `{ topicId, filedAt, updatedAt }`; JSDoc warning; positive `filedAt != null` assertion in `routes/filing.test.ts`. |
| **[CRITICAL-B]** Earlier plan wording ("share the 3-attempt cap, no reset") contradicted spec §6 line 254 ("Retry resets the count") → Retry button would die at the cap | Single `resetFilingForRetry` service owns the reset; Retry button and restore both route through it. |
| **[CRITICAL-1 / LOW-M]** Below-threshold freeform sessions (1-2 turns) get swept up when an operator manually fires the stranded backfill | Backfill SELECT adds `effectiveMode <> 'freeform' OR exchange_count >= FILING_CONFIG.minFreeformExchanges`; regression integration test. |
| **[CRITICAL-2]** `resolveFilingResult` unconditionally writes session row, breaking the §6 opt-out race guard for every caller | Split the function so callers own the session UPDATE; auto-file handler uses the CAS WHERE clause; sync route uses `markSessionFiled`. |
| **[CRITICAL-3 / HIGH-E]** User taps Keep Out between topic creation and final session UPDATE → orphan topic in Library | Auto-file handler calls the shared `deleteTopicIfSafe()` helper whenever the guarded UPDATE returns 0 rows. Same helper is used by the keep-out service so the §4 rule lives in exactly one place. |
| **[CRITICAL-N]** User taps Retry/Add/Restore, dispatch fails, but `safeSend()` swallows the failure and UI shows pending work that was never queued | User-initiated filing actions use awaited CORE `inngest.send(...)`; dispatch failure returns an API error. Only invisible close-path auto-file uses `safeSend()`. |
| **[CRITICAL-O / HIGH-T]** Useful 1-2 turn chats never enter Library because they are below the automatic filing threshold and have `filingStatus = null` | Add explicit `POST /library-filing/add` and Summary `Add to Library` for every unfiled freeform session; explicit user intent bypasses the automatic 3-turn threshold. |
| **[HIGH-C]** Terminal `filing_failed` sessions had no path out (`claimSessionForAutoFiling` CAS rejects non-NULL filing_status) → Retry button is dead UI after the 3rd failure | Retry endpoint routes through `resetFilingForRetry` (clears `filing_status` AND `filing_retry_count`); homework retry path unchanged. |
| **[HIGH-D]** Restoring a kept-out session that previously exhausted retries leaves `filing_retry_count = 3` → next LLM error pushes it straight back to terminal failed | `restoreSessionForAutoFiling` calls `resetFilingForRetry` so both fields clear together. |
| **[HIGH-5 / MEDIUM-I / HIGH-P]** Two concurrent dispatches (close + summary load) cause double execution; a user retry collapses against the original initial dispatch, or repeated retries all collapse because retry count resets to 0 | Initial close dispatch uses dedupe key `auto-file-${sessionId}-initial`; Retry/Add/Restore dispatches use generated dispatch ids unrelated to reset retry count. CAS claim still prevents double attachment. |
| **[HIGH-4]** User accidentally taps Keep Out and is permanently locked out | `POST /library-filing/restore` endpoint + `Add to Library` button on kept-out summaries; restore clears both `filing_status` and `filing_retry_count`. |
| **[HIGH-Q]** Auto-file handler claims `filing_pending`, then LLM/resolver fails and leaves the session pending forever | `auto-file-session` owns terminal failure after handler retries, and observers are updated so new auto-file sessions are not retried through legacy `app/filing.retry` semantics. |
| **[HIGH-R]** Synchronous `/filing` or manual retry creates a topic after `resolveFilingResult()` split, then fails before `markSessionFiled()` | Existing callers use a transactional wrapper for resolve+mark or ship cleanup/idempotency tests proving retry does not leave visible orphan/duplicate topics. |
| **[HIGH-3 / MEDIUM-L]** Freeform create paths forget to set `metadata.effectiveMode = 'freeform'` → eligibility helper rejects everything | Per-insert-path unit test against the enumerated list of insert sites (PR 2 audit task); typed `getSessionEffectiveMode` accessor is the only allowed read site. |
| **[MEDIUM-G]** Spec §4 safe-to-delete rule (line 165) requires `filedFrom = 'freeform_filing'` but spec §5 sets auto-file topics to `'session_filing'` → as-written §4 never fires for auto-filed topics | Plan's `deleteTopicIfSafe` broadens to `IN ('freeform_filing', 'session_filing')`; matching spec edit recorded in Amendments block. |
| **[MEDIUM-H]** Inline `MIN_FREEFORM_FILE_EXCHANGES` constant duplicated across multiple files would drift, and CLAUDE.md G4 forbids raw `process.env` reads | Single typed config object `apps/api/src/config/filing.ts` exports `FILING_CONFIG`; all sites import. |
| **[MEDIUM-J / MEDIUM-W]** Async auto-file with no polling spec leaves Summary stuck forever; a 30s local timeout lies by showing failure while the server may still be working | `useSessionLibraryFiling` polls every 3s and stops after 10 polls, but timeout copy is non-terminal (`Still adding...`) and Retry appears only after server-confirmed `filing_failed`. |
| **[MEDIUM-K / HIGH-S]** Spec opens with "ask-first, low-friction" promise but the Unsorted auto-subject that delivers it is deferred → users still hit upfront subject creation after PR 3 ships | Plan In Scope/Out Of Scope block now explicitly says the §1 promise is unshipped after PR 3; PR 3 should not GA/market as the Ask Anything win unless ask-first work ships in the same release. |
| **[MEDIUM-U]** User cannot tell where the chat went, or is stuck with a bad LLM-generated topic title | Summary shows resolved topic title + parent destination + tap-through, and exposes a minimal rename action for auto-created topics. Rename is topic-level; if multiple sessions are attached, copy says the title changes for all linked chats. |
| **[MEDIUM-V]** Filing fails quietly after the user leaves Summary | The Library tab's existing list/search entry screen shows a small failed-Library-addition attention item/count for `filing_failed` freeform sessions. |
| **[MEDIUM-X]** Freeform and homework have different close behavior | Accepted as transitional only; docs explicitly scope no-prompt behavior to freeform and a follow-up decides homework's long-term close UX. |
| **[MEDIUM-Y]** Generic "Keep out of Library" copy is ambiguous across pending/filed states | Use state-specific copy: `Don't add to Library`, `Remove from Library`, and `Add to Library`. |
| **[MEDIUM-Z]** Repeated freeform chats on the same topic bloat Library with duplicate topics; topic rename semantics become confusing after dedupe | Add integration acceptance proving confident repeated chats link to an existing topic. Rename applies to the shared topic row, so later linked sessions inherit the renamed title; confirmation copy makes that shared scope explicit. |
| Keep-out deletes a session through topic cascade | Detach `learning_sessions.topicId` before any topic cleanup. |
| Existing Library topics are deleted when the user only meant this session | Delete only auto-created topic rows with matching `sessionId`, `filedFrom IN ('freeform_filing','session_filing')`, and no other session/progress/retention references. |
| Filing status banner renders weird unknown state | Update schema, hooks, and `FilingFailedBanner` together. |
| User thinks "keep out" deletes history | Copy must say Library, not save/delete. |
| Family/child scoping leaks into Study Library | All writes remain active-profile scoped; no Family context writes in this work. |
| LLM filing adds raw transcript to analytics | Analytics enums/hashes only. |
