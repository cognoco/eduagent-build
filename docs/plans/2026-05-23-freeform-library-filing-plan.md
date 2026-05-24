# Freeform Chat Library Filing Implementation Plan

> **Status:** Draft
> **Date:** 2026-05-23
> **Source spec:** [`docs/specs/2026-05-23-freeform-library-filing.md`](../specs/2026-05-23-freeform-library-filing.md)

**Goal:** Replace the post-session "do you want to file this?" interruption with quiet auto-filing for meaningful freeform sessions, while preserving an explicit "Keep out of Library" choice. Sessions stay saved either way. Library topics always belong to subjects.

**Tech stack:** Expo / React Native, TanStack Query, Hono, Drizzle, Zod schemas, Inngest, Jest.

---

## In Scope / Out Of Scope

In scope (this plan):

- Auto-file meaningful freeform sessions at session close.
- Durable `filing_kept_out` terminal state plus a reversible `Add to Library` restore path.
- Race-safe interaction between auto-filing and user opt-out.
- Mobile UX: remove the blocking freeform prompt, show compact Library status, expose `Keep out of Library` and `Add to Library`.
- Flow-doc reconciliation for the freeform/Library story.

Out of scope — track in follow-up plans:

- Spec §1 "Ask First" / per-profile "Unsorted" auto-subject and live subject reconciliation during the streaming reply. [HIGH-2] This is a separate workstream and is not addressed here. Freeform sessions in this PR series continue to be created with a real `subjectId` via the existing entry paths.
- Homework session filing. [MEDIUM-4] The current homework filing prompt and behavior are unchanged. Only the freeform path's blocking prompt is removed in PR 3.
- Spec §7 `Change` subject-picker. V1 `Change` is "navigate to the filed topic" only.
- Analytics events from spec §Analytics. [MEDIUM-6] Deferred to a follow-up plan; PR 2 does not emit `freeform_library_filing.*`. The eval harness still re-snapshots filing prompts when the LLM call surface changes.

---

## Scope Split

### PR 1 - Backend Filing State And Keep-Out Contract

Create the durable state model and API operations:

- Add terminal `filing_kept_out` state.
- Add service helpers to mark a session kept out of Library.
- Ensure retry/backfill/observer jobs ignore kept-out sessions.
- Add tests for ownership, retry exclusion, and state transitions.

### PR 2 - Auto-File Freeform Sessions

Move meaningful freeform sessions to background filing by default:

- Enqueue auto-file on close for eligible freeform sessions.
- Reuse existing `fileToLibrary()` and `resolveFilingResult()`.
- Keep the existing retry/observer pattern.
- Add integration coverage for auto-file success, failure, and opt-out race.

### PR 3 - Mobile UX

Remove the blocking filing prompt:

- Navigate to summary immediately after close.
- Show compact Library filing status and actions.
- Add `Keep out of Library`.
- Preserve existing failed-filing retry affordance.

### PR 4 - Flow Docs Reconciliation

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

### Database

- `packages/database/src/schema/sessions.ts` - add `filing_kept_out` to the `filing_status` enum.
- `apps/api/drizzle/*` - migration adding the enum value.

Migration apply-time note: [MEDIUM-3] `ALTER TYPE filing_status_enum ADD VALUE 'filing_kept_out'` cannot run inside a transaction block in PostgreSQL. The drizzle migration file must declare `-- breakpoint` or be placed in a standalone file that drizzle-kit applies without `BEGIN/COMMIT` wrapping (current pattern in `apps/api/drizzle/`: each enum-value-add lives in its own SQL statement with no surrounding transaction). Verify the generated file by running `pnpm run db:migrate:dev` against a clean local DB before merging PR 1.

Rollback note: PostgreSQL enum value additions are not trivially reversible. Rollback requires a forward migration that rebuilds the enum type after all `filing_kept_out` rows have been remediated to null or another allowed state. No learning/session data is lost by the forward change.

### API Services And Routes

- `apps/api/src/services/session/session-crud.ts` - add service functions:
  - `markSessionKeptOutOfLibrary(db, profileId, sessionId)` — sets terminal `filing_kept_out`.
  - `restoreSessionForAutoFiling(db, profileId, sessionId)` — [HIGH-4] reverse of keep-out. Clears `filing_kept_out` (sets `filingStatus = null`) and is followed by a fresh `app/session.auto_file_requested` dispatch.
  - `claimSessionForAutoFiling(db, profileId, sessionId)` — CAS UPDATE from `(filing_status IS NULL AND topic_id IS NULL)` → `filing_pending`. [HIGH-5] Reuses the existing `filing_retry_count` column; auto-file and manual retry share the same 3-attempt cap so a user can't exhaust both ladders separately. [MEDIUM-2]
  - `detachSessionFromFiledTopic(db, profileId, sessionId)`.
- `apps/api/src/routes/sessions.ts` - add session filing endpoints:
  - `POST /sessions/:sessionId/library-filing/keep-out`
  - `POST /sessions/:sessionId/library-filing/restore` — [HIGH-4] re-enable filing on a kept-out session.
- `apps/api/src/routes/filing.ts` - reject/skip filing requests for kept-out sessions.
- `apps/api/src/services/filing.ts` - **[CRITICAL-2]** Split `resolveFilingResult()` so it stops touching `learning_sessions`. Today (`filing.ts:743-757`) it unconditionally writes `topicId` and `filedAt`. After this change:
  - `resolveFilingResult()` returns the resolved subject/book/topic IDs only — no side effect on `learning_sessions`.
  - The synchronous `/filing` POST handler issues its own simple UPDATE (matching today's behavior).
  - The auto-file Inngest handler issues a **guarded** UPDATE per spec §6 (`WHERE id = $sessionId AND filing_status = 'filing_pending' RETURNING id`) and runs cleanup when 0 rows return. [CRITICAL-3]
  - Existing `freeform-filing.ts` (manual retry) — keep its UPDATE behavior, but use the new split contract.
- `apps/api/src/services/session/session-book.ts` - keep `backfillSessionTopicId()` profile-scoped; add null-detach helper if not placed in `session-crud.ts`.

### Inngest

- `apps/api/src/inngest/functions/freeform-filing.ts` - skip `filing_kept_out`; consume the new `resolveFilingResult()` contract (no session UPDATE inside resolver).
- `apps/api/src/inngest/functions/auto-file-session.ts` - **new** handler for `app/session.auto_file_requested`. [HIGH-1] `filedFrom = 'session_filing'`. Owns the CAS claim, the LLM filing call, and the guarded final UPDATE.
- `apps/api/src/inngest/functions/filing-stranded-backfill.ts` - **[CRITICAL-1]** Add `(metadata->>'effectiveMode' <> 'freeform' OR exchange_count >= MIN_FREEFORM_FILE_EXCHANGES)` to the WHERE clause so below-threshold freeform sessions are not swept up. The `IS NULL filing_status` filter already excludes `filing_kept_out`; the threshold filter is the new gate. Also exclude kept-out sessions via explicit `filing_status IS DISTINCT FROM 'filing_kept_out'` for clarity even though `IS NULL` covers it.
- `apps/api/src/inngest/functions/filing-timed-out-observe.ts` - do not mark kept-out sessions failed.
- `apps/api/src/inngest/functions/filing-completed-observe.ts` - no-op for kept-out sessions.
- `apps/api/src/inngest/functions/filing-observe.ts` - [MEDIUM-1] audit for `filing_kept_out` handling. This file is part of the filing observer set and was missing from earlier drafts of this plan; review it alongside the other observers.
- `apps/api/src/inngest/index.ts` - register `auto-file-session` handler.

### Mobile

- `apps/mobile/src/hooks/use-sessions.ts` - add `filing_kept_out` type; polling should return `false`.
- `apps/mobile/src/hooks/use-filing.ts` - add keep-out mutation, restore mutation, and a fresh `useSessionLibraryFiling(sessionId)` hook that exposes the compact-status view used by Session Summary. Both mutations MUST call `queryClient.invalidateQueries({ queryKey: [...sessions...] })` on success so the session list/summary refresh; without that the kept-out → restore round-trip displays stale state. [MEDIUM-7]
- `apps/mobile/src/components/session/FilingFailedBanner.tsx` - avoid rendering failure UI for kept-out sessions; support pending/recovered copy if reused as filing status UI.
- `apps/mobile/src/components/session/SessionFooter.tsx` - remove the blocking filing prompt **for freeform sessions only**. Homework close path is unchanged. [MEDIUM-4] The freeform branch in the parent (`(app)/session/index.tsx`) should never set `showFilingPrompt = true`.
- `apps/mobile/src/components/session/use-session-actions.ts` - after freeform close, enqueue/trigger auto-file and navigate to summary without requiring a prompt decision.
- `apps/mobile/src/app/(app)/session/index.tsx` - wire status and keep-out action where needed.
- `apps/mobile/src/app/session-summary/[sessionId].tsx` - show Library filing status/actions for freeform sessions. Expose `Add to Library` action on kept-out summaries that calls the restore endpoint. [HIGH-4]
- `apps/mobile/src/i18n/locales/en.json` and generated locale files - add user-facing copy:
  - `Added to Library`
  - `Adding this to your Library...`
  - `Keep out of Library`
  - `Kept out of Library`
  - `Add to Library` (reverse action shown on kept-out summaries) [HIGH-4]
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
- [ ] Add `restoreSessionForAutoFiling(db, profileId, sessionId)` service. [HIGH-4] Requires `filingStatus = 'filing_kept_out'`; sets `filingStatus = null` and returns the session row so the route can dispatch a fresh `app/session.auto_file_requested`.
- [ ] **[CRITICAL-2]** Split `resolveFilingResult()` in `apps/api/src/services/filing.ts`: remove the `learning_sessions` UPDATE block (currently lines ~743-757). Update both existing callers — synchronous `/filing` route handler and `freeform-filing.ts` retry — to perform their own simple UPDATE on success. PR 2 will add the guarded UPDATE for the auto-file path.
- [ ] Add `POST /sessions/:sessionId/library-filing/keep-out`.
- [ ] Add `POST /sessions/:sessionId/library-filing/restore`. [HIGH-4] On success, dispatch `app/session.auto_file_requested` via `safeSend()`.
- [ ] Update retry endpoints to return 409 for `filing_kept_out`.
- [ ] Update `FilingFailedBanner` data contract tests if the component receives this status.

### PR 1 Acceptance Criteria

- Given a freeform session exists for profile A, when profile A marks it kept out, then the row remains and has `topicId = null`, `filedAt = null`, and `filingStatus = 'filing_kept_out'`.
- Given profile B calls keep-out for profile A's session, when the request is processed, then the API returns protected/not-found and does not mutate the row.
- Given a session is `filing_kept_out`, when retry filing is requested, then the API returns 409 and does not dispatch `app/filing.retry`.
- Given a session is already attached to an existing Library topic, when keep-out is requested, then the session detaches but the existing topic remains.
- [HIGH-4] Given a session is `filing_kept_out`, when the user calls `POST /sessions/:sessionId/library-filing/restore`, then `filingStatus` clears to `null` and `app/session.auto_file_requested` is dispatched. Profile B calling restore on profile A's session returns protected/not-found.
- [CRITICAL-2] Given the synchronous `/filing` POST is called (existing manual path), when it succeeds, then the session is still updated to set `topicId` and `filedAt` — the `resolveFilingResult` split must not regress this. Covered by existing `apps/api/src/routes/filing.test.ts`; add an integration test if not present.

---

## PR 2 Tasks - Auto-File Freeform Sessions

- [ ] Audit every `learning_sessions` insert path (Ask Anything, regular learning, homework, review) and confirm the freeform entry actually writes `metadata.effectiveMode = 'freeform'`. [HIGH-3] Today `session-crud.ts` defaults to `'learning'`; if any freeform creation path forgets to override, auto-file silently never fires for that path. Add a unit test per insert path that asserts the persisted `effectiveMode`. Read all access through the new `getSessionEffectiveMode` accessor.
- [ ] Add eligibility helper (reads through `getSessionEffectiveMode`):
  - effective mode is freeform;
  - `topicId` is null;
  - `filedAt` is null;
  - `filingStatus` is null;
  - learner exchange count >= `MIN_FREEFORM_FILE_EXCHANGES`;
  - transcript exists.
- [ ] On session close, enqueue auto-file for eligible sessions. **[HIGH-5]** Dispatch via `safeSend()` with Inngest event dedupe `id: \`auto-file-${sessionId}\`` so concurrent close + summary-load dispatches collapse to one execution.
- [ ] **[HIGH-1]** Implement a dedicated `app/session.auto_file_requested` handler in `apps/api/src/inngest/functions/auto-file-session.ts`. Do NOT reuse `freeform-filing.ts` (that handler is `app/filing.retry`, hard-codes `filedFrom = 'freeform_filing'`, and does not implement the spec §6 CAS pattern). Auto-file sets `filedFrom = 'session_filing'`.
- [ ] Claim the session with a CAS update to `filing_pending` before calling the LLM (`claimSessionForAutoFiling`). On 0 rows returned, exit without dispatching `app/filing.completed`.
- [ ] Re-read before writes; skip if `filing_kept_out`, already filed, missing, ownership mismatch, or no longer eligible (full spec §6 exit list, including terminal `filing_failed` once `filing_retry_count >= 3`).
- [ ] [MEDIUM-2] Auto-file shares the existing `filing_retry_count` column with manual retry — increment on each LLM attempt; both ladders cap at the same 3.
- [ ] Reuse `fileToLibrary()`. Call the new split `resolveFilingResult()` (PR 1) which no longer touches `learning_sessions`.
- [ ] Final write is a **guarded UPDATE**: `WHERE id = $sessionId AND filing_status = 'filing_pending' RETURNING id`. On 0 rows returned (user keep-out raced), run the spec §4 safe-to-delete check against the topic just created and clean up if applicable. **[CRITICAL-3]** Without this branch, a topic with `sessionId = X` is orphaned in Library while the session is kept-out.
- [ ] Emit existing `app/filing.completed` on success.
- [ ] Preserve existing timeout observer behavior for pending/failed states.
- [ ] **[CRITICAL-1]** Update `filing-stranded-backfill.ts` SELECT to add `(metadata->>'effectiveMode' IS DISTINCT FROM 'freeform' OR exchange_count >= MIN_FREEFORM_FILE_EXCHANGES)`. Without this, the 14-day backfill sweeps up below-threshold tiny freeform chats (which legitimately have `filingStatus = null`) and tries to file them. Add a regression integration test: create a 1-turn freeform session with `filingStatus = null`, run the backfill, assert no synthetic-timeout event was dispatched.
- [ ] Ensure stranded backfill excludes `filing_kept_out` (trivially covered by `filingStatus IS NULL` but add an explicit predicate for readability).
- [ ] Audit `filing-observe.ts` for `filing_kept_out` handling. [MEDIUM-1]

### PR 2 Acceptance Criteria

- Given a freeform session has 3 learner turns and no topic, when the learner ends the session, then the API marks filing pending and enqueues durable auto-filing.
- Given auto-filing succeeds, when the job completes, then a subject/book/topic exists, the session has `topicId`, and the topic has `filedFrom = 'session_filing'`.
- Given the user marks keep-out while filing is pending, when the job wakes up, then it exits without creating or attaching a topic.
- [CRITICAL-3] Given the user marks keep-out **between** `resolveFilingResult()` (topic created) and the final guarded UPDATE, when the UPDATE returns 0 rows, then the handler runs the spec §4 safe-to-delete check on the just-created topic and removes it if eligible. Integration test must simulate this race.
- Given filing fails, when observers run, then the session reaches `filing_failed` and the user can retry.
- Given a freeform session has fewer than 3 learner turns, when it closes, then no Library filing is attempted.
- [CRITICAL-1] Given a 1-turn freeform session ends with `filingStatus = null` (below threshold), when the 14-day stranded backfill runs, then no `app/session.filing_timed_out` event is dispatched for that session.
- [HIGH-5] Given two concurrent close+retry events fire for the same session, when both arrive at Inngest, then the `auto-file-${sessionId}` dedupe collapses them and only one CAS claim succeeds.

---

## PR 3 Tasks - Mobile UX

- [ ] Remove the normal post-close blocking filing prompt **for freeform sessions only**. [MEDIUM-4] Homework filing prompt is out of scope and unchanged in this PR series.
- [ ] After freeform close, navigate to Session Summary immediately.
- [ ] Show compact filing state on Session Summary:
  - initial / unknown (briefly, before the handler claims): `Adding this to your Library...` — [LOW-2] cover the `filingStatus = null → filing_pending` transition in a unit test.
  - pending;
  - success;
  - failed with retry;
  - kept out.
- [ ] Add `Keep out of Library` action while pending, failed, or filed.
- [ ] [HIGH-4] Add `Add to Library` action on kept-out summaries that calls `POST /sessions/:sessionId/library-filing/restore`. After success, the UI returns to the pending state and the user can see auto-file progress.
- [ ] [MEDIUM-7] Both keep-out and restore mutations must invalidate the relevant TanStack Query keys (`use-sessions`, `use-filing`, session summary detail) on success — without invalidation, the user sees stale filing status until the next refetch-on-focus.
- [ ] If filed and kept-out is tapped, call keep-out endpoint and update the UI optimistically only after success.
- [ ] Preserve `I'm Done` behavior and existing session close timeout handling.
- [ ] Ensure copy uses `Library`, not internal "filing."

### PR 3 Acceptance Criteria

- Given a meaningful freeform session closes, when the user confirms end session, then they are not asked whether to save; they land on Session Summary.
- Given filing is pending, when Session Summary renders, then it shows `Adding this to your Library...` and `Keep out of Library`.
- Given the user taps `Keep out of Library`, when the mutation succeeds, then the summary remains visible and the Library status changes to kept out.
- [HIGH-4] Given the session is kept out, when the user taps `Add to Library`, then the restore mutation runs and the status returns to pending.
- Given filing succeeds, when the summary refetches, then it shows an added/linked Library message and offers correction.
- Given filing fails, when the summary renders, then retry is available and no raw error text leaks into chat UI.
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
- Tap Keep out of Library.
- Verify session summary remains accessible.
- Verify topic does not appear in Library search/results for that session.

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
| **[CRITICAL-1]** Below-threshold freeform sessions (1-2 turns) get swept up by 14-day stranded backfill | Backfill SELECT adds `effectiveMode <> 'freeform' OR exchange_count >= MIN_FREEFORM_FILE_EXCHANGES`; regression integration test. |
| **[CRITICAL-2]** `resolveFilingResult` unconditionally writes session row, breaking the §6 opt-out race guard for every caller | Split the function so callers own the session UPDATE; auto-file handler uses the CAS WHERE clause. |
| **[CRITICAL-3]** User taps Keep Out between topic creation and final session UPDATE → orphan topic in Library | Auto-file handler runs the §4 safe-to-delete check whenever the guarded UPDATE returns 0 rows. |
| **[HIGH-5]** Two concurrent dispatches (close + retry, mobile retry + summary load) cause double execution | Inngest dedupe `id: auto-file-${sessionId}` + CAS UPDATE in the handler. |
| **[HIGH-4]** User accidentally taps Keep Out and is permanently locked out | `POST /library-filing/restore` endpoint + `Add to Library` button on kept-out summaries. |
| **[HIGH-3]** Freeform create paths forget to set `metadata.effectiveMode = 'freeform'` → eligibility helper rejects everything | Per-insert-path unit test; typed `getSessionEffectiveMode` accessor is the only allowed read site. |
| Keep-out deletes a session through topic cascade | Detach `learning_sessions.topicId` before any topic cleanup. |
| Existing Library topics are deleted when the user only meant this session | Delete only auto-created topic rows with matching `sessionId`, `filedFrom IN ('freeform_filing','session_filing')`, and no other session/progress/retention references. |
| Filing status banner renders weird unknown state | Update schema, hooks, and `FilingFailedBanner` together. |
| User thinks "keep out" deletes history | Copy must say Library, not save/delete. |
| Family/child scoping leaks into Study Library | All writes remain active-profile scoped; no Family context writes in this work. |
| LLM filing adds raw transcript to analytics | Analytics enums/hashes only. |

