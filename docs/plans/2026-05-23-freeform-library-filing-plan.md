# Freeform Chat Library Filing Implementation Plan

> **Status:** Draft
> **Date:** 2026-05-23
> **Source spec:** [`docs/specs/2026-05-23-freeform-library-filing.md`](../specs/2026-05-23-freeform-library-filing.md)

**Goal:** Replace the post-session "do you want to file this?" interruption with quiet auto-filing for meaningful freeform sessions, while preserving an explicit "Keep out of Library" choice. Sessions stay saved either way. Library topics always belong to subjects.

**Tech stack:** Expo / React Native, TanStack Query, Hono, Drizzle, Zod schemas, Inngest, Jest.

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

- `packages/schemas/src/sessions.ts` - add `filing_kept_out` to `filingStatusSchema`; expose any response shape needed for filing controls.
- `packages/schemas/src/sessions.test.ts` - update enum tests and session response fixtures.
- `packages/schemas/src/inngest-events.ts` - add `app/session.auto_file_requested` event schema if a new event is used.

### Database

- `packages/database/src/schema/sessions.ts` - add `filing_kept_out` to the `filing_status` enum.
- `apps/api/drizzle/*` - migration adding the enum value.

Rollback note: PostgreSQL enum value additions are not trivially reversible. Rollback requires a forward migration that rebuilds the enum type after all `filing_kept_out` rows have been remediated to null or another allowed state. No learning/session data is lost by the forward change.

### API Services And Routes

- `apps/api/src/services/session/session-crud.ts` - add service functions:
  - `markSessionKeptOutOfLibrary(db, profileId, sessionId)`
  - `claimSessionForAutoFiling(db, profileId, sessionId)`
  - `detachSessionFromFiledTopic(db, profileId, sessionId)`
- `apps/api/src/routes/sessions.ts` - add or extend session filing endpoints:
  - `POST /sessions/:sessionId/library-filing/keep-out`
  - optional `POST /sessions/:sessionId/library-filing/retry` if existing retry UX needs a clearer alias.
- `apps/api/src/routes/filing.ts` - reject/skip filing requests for kept-out sessions.
- `apps/api/src/services/filing.ts` - ensure `resolveFilingResult()` does not overwrite `filing_kept_out`; keep session update profile-scoped.
- `apps/api/src/services/session/session-book.ts` - keep `backfillSessionTopicId()` profile-scoped; add null-detach helper if not placed in `session-crud.ts`.

### Inngest

- `apps/api/src/inngest/functions/freeform-filing.ts` - skip `filing_kept_out`; reuse for auto-file if appropriate.
- `apps/api/src/inngest/functions/filing-stranded-backfill.ts` - exclude kept-out sessions.
- `apps/api/src/inngest/functions/filing-timed-out-observe.ts` - do not mark kept-out sessions failed.
- `apps/api/src/inngest/functions/filing-completed-observe.ts` - no-op for kept-out sessions.
- `apps/api/src/inngest/index.ts` - register new handler if PR 2 adds one.

### Mobile

- `apps/mobile/src/hooks/use-sessions.ts` - add `filing_kept_out` type; polling should return `false`.
- `apps/mobile/src/hooks/use-filing.ts` - add keep-out mutation hook or create a new `use-session-library-filing.ts`.
- `apps/mobile/src/components/session/FilingFailedBanner.tsx` - avoid rendering failure UI for kept-out sessions; support pending/recovered copy if reused as filing status UI.
- `apps/mobile/src/components/session/SessionFooter.tsx` - remove the blocking filing prompt from normal freeform close, or convert it to compact status/actions.
- `apps/mobile/src/components/session/use-session-actions.ts` - after freeform close, enqueue/trigger auto-file and navigate to summary without requiring a prompt decision.
- `apps/mobile/src/app/(app)/session/index.tsx` - wire status and keep-out action where needed.
- `apps/mobile/src/app/session-summary/[sessionId].tsx` - show Library filing status/actions for freeform sessions.
- `apps/mobile/src/i18n/locales/en.json` and generated locale files - add user-facing copy:
  - `Added to Library`
  - `Adding this to your Library...`
  - `Keep out of Library`
  - `Kept out of Library`
  - `Could not add this to Library`

### Flow Docs

- `docs/flows/master-directory/learn/LEARN-01.md` - create.
- `docs/flows/master-directory/home/SUBJECT-03.md` or `docs/flows/master-directory/learn/SUBJECT-03.md` - create after choosing final folder.
- `docs/flows/master-directory/home/SUBJECT-05.md` or `docs/flows/master-directory/learn/SUBJECT-05.md` - create after choosing final folder.
- `docs/flows/master-directory/home/HOME-01.md` - update Ask Anything and Study New rows.
- `docs/flows/master-directory/learn/LEARN-07.md` - replace filing/dismissal ambiguity.
- `docs/flows/master-directory/learn/LEARN-08.md` - add session-history vs Library-filing rule.
- `docs/flows/flow-master-directory.md` - link new pages and mark mapped.

---

## PR 1 Tasks - Backend Filing State And Keep-Out

- [ ] Add `filing_kept_out` to shared `filingStatusSchema`.
- [ ] Add DB migration for `filing_status` enum value.
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
  - delete topic only when `curriculum_topics.sessionId === sessionId` and no other session references it;
  - leave existing/reused topics intact.
- [ ] Add `POST /sessions/:sessionId/library-filing/keep-out`.
- [ ] Update retry endpoints to return 409 for `filing_kept_out`.
- [ ] Update `FilingFailedBanner` data contract tests if the component receives this status.

### PR 1 Acceptance Criteria

- Given a freeform session exists for profile A, when profile A marks it kept out, then the row remains and has `topicId = null`, `filedAt = null`, and `filingStatus = 'filing_kept_out'`.
- Given profile B calls keep-out for profile A's session, when the request is processed, then the API returns protected/not-found and does not mutate the row.
- Given a session is `filing_kept_out`, when retry filing is requested, then the API returns 409 and does not dispatch `app/filing.retry`.
- Given a session is already attached to an existing Library topic, when keep-out is requested, then the session detaches but the existing topic remains.

---

## PR 2 Tasks - Auto-File Freeform Sessions

- [ ] Add eligibility helper:
  - effective mode is freeform;
  - `topicId` is null;
  - `filedAt` is null;
  - `filingStatus` is null;
  - learner exchange count >= `MIN_FREEFORM_FILE_EXCHANGES`;
  - transcript exists.
- [ ] On session close, enqueue auto-file for eligible sessions.
- [ ] Implement `app/session.auto_file_requested` handler, or route the close path through the existing freeform filing retry handler if it can be reused cleanly.
- [ ] Claim the session with a CAS update to `filing_pending` before calling the LLM.
- [ ] Re-read before writes; skip if `filing_kept_out`, already filed, missing, or no longer eligible.
- [ ] Reuse `fileToLibrary()` and `resolveFilingResult()`.
- [ ] Emit existing `app/filing.completed` on success.
- [ ] Preserve existing timeout observer behavior for pending/failed states.
- [ ] Ensure stranded backfill excludes `filing_kept_out`.

### PR 2 Acceptance Criteria

- Given a freeform session has 3 learner turns and no topic, when the learner ends the session, then the API marks filing pending and enqueues durable auto-filing.
- Given auto-filing succeeds, when the job completes, then a subject/book/topic exists, the session has `topicId`, and the topic has `filedFrom = 'session_filing'`.
- Given the user marks keep-out while filing is pending, when the job wakes up, then it exits without creating or attaching a topic.
- Given filing fails, when observers run, then the session reaches `filing_failed` and the user can retry.
- Given a freeform session has fewer than 3 learner turns, when it closes, then no Library filing is attempted.

---

## PR 3 Tasks - Mobile UX

- [ ] Remove the normal post-close blocking filing prompt for freeform sessions.
- [ ] Keep the prompt only where product still requires it, or remove it entirely if homework is brought into the same model.
- [ ] After freeform close, navigate to Session Summary immediately.
- [ ] Show compact filing state on Session Summary:
  - pending;
  - success;
  - failed with retry;
  - kept out.
- [ ] Add `Keep out of Library` action while pending, failed, or filed.
- [ ] If filed and kept-out is tapped, call keep-out endpoint and update the UI optimistically only after success.
- [ ] Preserve `I'm Done` behavior and existing session close timeout handling.
- [ ] Ensure copy uses `Library`, not internal "filing."

### PR 3 Acceptance Criteria

- Given a meaningful freeform session closes, when the user confirms end session, then they are not asked whether to save; they land on Session Summary.
- Given filing is pending, when Session Summary renders, then it shows `Adding this to your Library...` and `Keep out of Library`.
- Given the user taps `Keep out of Library`, when the mutation succeeds, then the summary remains visible and the Library status changes to kept out.
- Given filing succeeds, when the summary refetches, then it shows an added/linked Library message and offers correction.
- Given filing fails, when the summary renders, then retry is available and no raw error text leaks into chat UI.

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
| Keep-out deletes a session through topic cascade | Detach `learning_sessions.topicId` before any topic cleanup. |
| Existing Library topics are deleted when the user only meant this session | Delete only auto-created topic rows with matching `sessionId` and no other session references. |
| Filing status banner renders weird unknown state | Update schema, hooks, and `FilingFailedBanner` together. |
| User thinks "keep out" deletes history | Copy must say Library, not save/delete. |
| Family/child scoping leaks into Study Library | All writes remain active-profile scoped; no Family context writes in this work. |
| LLM filing adds raw transcript to analytics | Analytics enums/hashes only. |

