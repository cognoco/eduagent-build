# Freeform Chat Library Filing

**Status:** Draft
**Date:** 2026-05-23

**Related:**
- [`docs/flows/master-directory/home/HOME-01.md`](../flows/master-directory/home/HOME-01.md) - Study Home entry points.
- [`docs/flows/master-directory/learn/LEARN-07.md`](../flows/master-directory/learn/LEARN-07.md) - Session Summary and current filing/dismissal wording.
- [`docs/flows/master-directory/learn/LEARN-08.md`](../flows/master-directory/learn/LEARN-08.md) - Library as active-learner subjects/books/topics.
- [`docs/flows/flow-master-directory.md`](../flows/flow-master-directory.md) - `LEARN-01`, `SUBJECT-03`, and `SUBJECT-05` are currently not mapped.
- [`docs/specs/2026-05-21-navigation-contract.md`](./2026-05-21-navigation-contract.md) - Study/Family ownership contract.

---

## Decision

Ask Anything/freeform chat should be ask-first and low-friction. The learner should be able to type a question, get value, and leave cleanly without doing manual filing work up front or at session close.

The app must distinguish two durable things:

1. **Session history** - the conversation record, summary, transcript, and learner reflection. This is saved by default.
2. **Library filing** - turning a meaningful conversation into a Library topic under a subject/book/chapter. This is automatic when confident, ask-only-when-ambiguous, and reversible.

The user choice is not "save or lose this session." The user choice is:

- Let MentoMate add this meaningful learning session to Library.
- Keep this session out of Library.

If the user keeps a session out of Library, the session still exists in history/summary/transcript, but it does not create or attach a curriculum topic, does not appear as a Library topic, and must not drive topic progress or retention.

Any filed Library topic must belong to a subject. Sessions may exist outside Library; Library topics may not.

---

## Current State

The current app already separates the entry points:

- `home-action-study-new` opens `/create-subject` and creates a subject for the active learner.
- `home-ask-anything` opens `/(app)/session?mode=freeform`.

The current database shape requires every `learning_sessions` row to have a `subjectId`, while `topicId` is nullable. This means a freeform session can be attached to a subject for session ownership/classification but still have no Library topic.

Current filing behavior:

- Freeform/homework sessions show a post-close filing prompt.
- The current mobile footer prompt is rendered after `Done` through `SessionFooter` / `StandardFilingPrompt`.
- While that prompt is visible, the composer is disabled with copy like `Choose where to save this session`.
- The prompt asks `Add to library?` and offers `Yes, add it` / `No thanks`.
- When `filingTopicHint` is built from raw input, the prompt can show awkward copy such as `Would you like to add this session to what is general knowledge in your library?`
- Accepting the prompt calls `/filing`, which uses `fileToLibrary()` and `resolveFilingResult()` to create/reuse subject, book, chapter, and topic rows.
- Dismissing the prompt leaves the session unfiled.
- Existing retry infrastructure uses `learning_sessions.filingStatus` with `filing_pending`, `filing_failed`, and `filing_recovered`.

This spec replaces that manual post-close gate. It is not an additive prompt on top of the current flow.

Current documentation gap:

- `LEARN-01` Freeform chat is not mapped.
- `SUBJECT-03` Create subject from chat is not mapped.
- `SUBJECT-05` Subject resolution and clarification is not mapped.
- `LEARN-07` mentions "filing/dismissal/completion" but does not explain that dismissal means "session saved, not Library-filed."

---

## Product Contract

### 1. Ask First

The learner taps **Ask Anything** and types normally. The tutor reply must never be blocked by classification.

Because `learning_sessions.subjectId` is `.notNull()` today (`packages/database/src/schema/sessions.ts:133-135`), every session needs a `subjectId` at insert time. To keep the "ask first" promise without a schema migration in V1, sessions attach to a per-profile auto-subject **"Unsorted"** when classification is not confident on the first turn. The real subject is reconciled in the background and the session is rewritten to the correct `subjectId` once the classifier (or, at session close, `fileToLibrary()`) returns a confident match.

Resolution paths, in order of preference, run in parallel with the streaming reply:

- confident existing subject match: silently reattach the session to that subject; show a small subject chip;
- confident new subject suggestion: create the subject, reattach, show a small subject chip;
- ambiguous match: show compact chips near the composer (non-blocking — the learner can keep typing);
- no useful classification by session close: session remains on "Unsorted" until auto-filing resolves a subject (§5).

No full-screen filing, modal picker, or Library setup step appears before the learner gets value. The "Unsorted" auto-subject is excluded from Library tab listings to avoid leaking the staging bucket into the user-facing taxonomy.

> **UX decision flagged for review:** the alternative is to relax `learning_sessions.subjectId` to nullable, which is cleaner long-term but is a schema migration with backfill implications. V1 picks the auto-subject route for speed; revisit before V2.

### 2. Meaningful Freeform Sessions Auto-File

A freeform session becomes filing-eligible when all are true:

- `metadata.effectiveMode === 'freeform'`;
- `topicId IS NULL`;
- `filingStatus IS NULL`;
- the session has at least `MIN_FREEFORM_FILE_EXCHANGES` learner turns;
- the session is not marked keep-out-of-Library;
- the session transcript is available.

V1 threshold:

```ts
const MIN_FREEFORM_FILE_EXCHANGES = 3;
```

Rationale: 3 learner turns is the smallest count that reliably yields a multi-message topic worth retention scheduling — single Q&A exchanges tend to be lookups, not learning. The constant is tunable via the typed config object (no raw `process.env`) and any change must be snapshotted through the eval harness (`pnpm eval:llm`) so the filing classifier's signal-distribution baseline catches regressions.

`metadata.effectiveMode` is the filing-eligibility gate. The `metadata` column at `sessions.ts:155` is untyped `jsonb`, so introduce a typed accessor (`getSessionEffectiveMode(session)`) in `@eduagent/schemas` and require both the filing route and the Inngest handler to read through it — never index into `metadata` inline.

Filing should be triggered at session close in V1. In-session background filing can be added later, but it is not required for the first implementation.

### 3. No Blocking Prompt At Close

When a meaningful freeform session closes, the app should not ask "Do you want to save this?"

The current `Add to library?` footer prompt must be retired for freeform sessions. Pressing `Done` should mean the learner is done with the chat, not entering a second Library decision step.

Instead:

- close the session;
- navigate to Session Summary normally;
- enqueue durable Library filing in the background;
- show a small filing status area or toast.

Suggested copy:

- Pending: `Adding this to your Library...`
- Success: `Added to Biology > Photosynthesis`
- Existing topic: `Linked to Biology > Photosynthesis`
- Failure: `Could not add this to Library`
- Kept out: no persistent warning; optionally `Kept out of Library`

Actions:

- `Change`
- `Keep out of Library`
- `Retry` on failure

Do not use the learner's raw first question or raw transcript as the displayed topic label. The filing classifier must produce a human-readable topic title before success copy can say `Added to ...`; until then, show generic pending copy.

### 4. Keep Out Of Library

The user must have a clear way to keep the session out of Library.

This action:

- keeps the session, summary, transcript, and reflection;
- sets a durable terminal filing state;
- ensures `learning_sessions.topicId` is null;
- prevents stranded filing/backfill jobs from filing the session later;
- does not delete the session.

Recommended storage:

- Extend `filing_status` with `filing_kept_out`.
- `topicId = null`
- `filedAt = null`
- `filingStatus = 'filing_kept_out'`

If the user chooses keep-out after filing already completed:

- detach the session from the topic by setting `learning_sessions.topicId = null`;
- mark `filingStatus = 'filing_kept_out'`;
- if the topic is safe to delete per the rule below, delete it after detaching;
- otherwise leave the Library topic in place but remove this session's attachment.

**Safe-to-delete rule (all must be true):**

- `curriculum_topics.filedFrom = 'freeform_filing'` (the topic was created by this auto-filing path, not pre-generated or pre-existing);
- `curriculum_topics.sessionId = thisSessionId` (this session is the topic's original creator);
- no other `learning_sessions.topicId` row references this topic;
- no `curriculum_topic_progress` row references this topic;
- no `curriculum_topic_retention` row references this topic.

If any condition fails, detach-only; leave the topic in place.

Do not delete a topic while the session still references it. `learning_sessions.topicId` has cascade behavior through the topic foreign key (`packages/database/src/schema/sessions.ts:136-138`, `onDelete: 'cascade'`), so detachment must happen first.

**Keep-out is reversible.** A user who keeps a session out can later tap `Add to Library` from the session summary, which clears `filing_kept_out` and re-dispatches the auto-file event. Without this path, kept-out sessions become permanently orphaned from Library — bad UX given the action is one tap. Implementations must not write `filing_kept_out` as a terminal state at the DB-constraint level.

### 5. Filing Reuses The Existing Library Resolver

Auto-filing should reuse the existing filing service rather than introducing a second categorization path:

- build library index for the active learner profile;
- run `fileToLibrary()` using the session transcript;
- resolve the result through `resolveFilingResult()`;
- set `curriculum_topics.filedFrom = 'session_filing'`;
- set `curriculum_topics.sessionId = sessionId`;
- backfill `learning_sessions.topicId`;
- emit the existing filing completion event for observers.

The route/service boundary stays unchanged: routes validate and call services; business logic lives in `services/`.

### 6. Auto-Filing Must Be Durable

Auto-filing is durable async work and must go through Inngest.

No route handler should fire-and-forget a filing job. The session-close route dispatches the auto-file event via `safeSend()` (`apps/api/src/services/safe-non-core.ts`) — failure must surface in Sentry but must never throw or block session-close navigation. This is a **non-core** dispatch (the user has already been navigated to Summary by the time the job runs); a bare `inngest.send(...)` with a `// core-send:` comment is not appropriate here.

Candidate event:

```ts
app/session.auto_file_requested
```

Payload:

```ts
{
  sessionId: string;
  profileId: string;
  requestedAt: string;
  reason: 'freeform_session_closed';
}
```

Dispatch uses Inngest event dedupe (`id: \`auto-file-${sessionId}\``) so concurrent dispatches for the same session collapse to a single execution.

The handler must re-read the session and exit if:

- session is missing;
- profile ownership does not match;
- `filingStatus === 'filing_kept_out'`;
- `filingStatus === 'filing_pending'` (another handler is already in flight);
- `filingStatus === 'filing_failed'` and retry count `>= MAX_FILING_RETRIES` (terminal);
- `filedAt IS NOT NULL`;
- `topicId IS NOT NULL`;
- transcript is missing or too short;
- exchange threshold is not met.

**Eligibility-to-pending transition must be atomic.** Before doing any filing work, the handler claims the session with a guarded write:

```sql
UPDATE learning_sessions
SET filing_status = 'filing_pending'
WHERE id = $sessionId
  AND profile_id = $profileId
  AND filing_status IS NULL
  AND topic_id IS NULL
RETURNING id;
```

If 0 rows are returned, another handler claimed it or the user opted out — exit without dispatching `app/filing.completed`.

**Final write must also be guarded** to close the opt-out race:

```sql
UPDATE learning_sessions
SET topic_id = $topicId, filed_at = NOW(), filing_status = 'filing_recovered'
WHERE id = $sessionId
  AND filing_status = 'filing_pending'
RETURNING id;
```

If 0 rows are returned, the user tapped `Keep out of Library` between the eligibility claim and the write. The handler must then run the safe-to-delete check from §4 against the topic it just created and clean up if applicable.

**Retry cap:** `MAX_FILING_RETRIES = 3`. After exhaustion, the session transitions to `filing_failed` permanently; `Retry` in the UI re-dispatches a new auto-file event (which resets the count).

### 7. Change Filing

The first implementation uses simple correction paths:

- Before filing completes: `Keep out of Library` cancels filing by setting `filing_kept_out`.
- After filing completes: `Keep out of Library` detaches the session from the filed topic (per §4 rules).
- `Change` (V1): navigates to the filed topic/book in Library so the learner can see context. V1 does **not** open a picker. If the learner wants a different subject, the workflow is `Keep out of Library` → re-ask in a new session, or use the existing subject-resolution flow inside the topic detail view if present.

V1 scope deliberately excludes a post-hoc taxonomy editor. The product win is automatic filing with opt-out, not full Library organizing. A subject-picker variant of `Change` is V2+ and depends on confirming the subject-resolution UI exists as a reusable component (codebase audit on 2026-05-23 could not locate one).

---

## UX Rules

- Do not use "Don't save" for Library opt-out. It sounds like deleting history.
- Use "Keep out of Library."
- Do not show the current `Add to library?` / `Yes, add it` / `No thanks` decision gate after `Done` for freeform sessions.
- Do not disable the chat composer with `Choose where to save this session` while asking for Library filing. If the learner has pressed `Done`, navigate to Summary; if they are still chatting, keep filing status passive.
- Do not interrupt the tutor response with a modal unless subject classification is genuinely ambiguous and a session cannot safely start.
- Prefer chips, toasts, and compact status rows over blocking screens.
- Do not surface internal words like "filing", "taxonomy", "curriculum row", or "metadata" in user-facing copy.
- Do not turn raw learner input into Library destination copy. `what is general knowledge` is acceptable transcript text, not an acceptable topic label in `Add to Library` copy.
- For children and adults, copy should stay plain: `Added to Library`, `Change`, `Keep out of Library`.

---

## Data Contract

### Session History

A freeform session can be one of these Library states:

| State | DB representation | User meaning |
| --- | --- | --- |
| Not eligible | `topicId = null`, `filedAt = null`, `filingStatus = null`, exchange count below threshold | Tiny chat or not enough signal. |
| Pending | `filingStatus = 'filing_pending'` | App is adding it to Library. |
| Filed | `topicId != null`, `filedAt != null` | Session appears under a Library topic. |
| Failed | `filingStatus = 'filing_failed'` | User can retry. |
| Recovered | `filingStatus = 'filing_recovered'` | Retry succeeded. |
| Kept out | `topicId = null`, `filedAt = null`, `filingStatus = 'filing_kept_out'` | Session saved, not in Library. |

### Library Topic

A filed topic must always resolve through:

`profile -> subject -> curriculum -> book -> topic`

No Library topic may be created without a subject.

---

## Migration

Adds one enum value to `filing_status_enum` (current values at `packages/database/src/schema/sessions.ts:74-78` are `filing_pending`, `filing_failed`, `filing_recovered`):

```sql
ALTER TYPE filing_status_enum ADD VALUE 'filing_kept_out';
```

Apply via committed migration SQL + `drizzle-kit migrate` per CLAUDE.md schema-and-deploy rules. Do not use `drizzle-kit push` against staging or production.

No other schema changes are required: `learning_sessions.topicId` is already nullable, `filedAt` already exists, `curriculum_topics.filedFrom` already includes `'freeform_filing'` and `'session_filing'` (`packages/database/src/schema/subjects.ts:40-44`), and `curriculum_topics.sessionId` already exists (`:187`).

### Rollback

PostgreSQL does not support `DROP VALUE` from an enum without rebuilding the type. Rollback options, in order of safety:

1. **Forward fix (preferred):** leave `filing_kept_out` in the enum unused. No data loss.
2. **Code-only revert:** revert the application code that writes `filing_kept_out`; existing rows that contain the value remain (any non-null `filing_kept_out` row reverts to behaving as `null` filing status because the keep-out cleanup code path is also removed — this means previously kept-out sessions become filing-eligible again and the background retry may pick them up).
3. **Type rebuild (avoid):** create a replacement enum, migrate the column, drop the old type. Only justified if `filing_kept_out` must be physically removed; requires a maintenance window.

Recommended: option 1. Document any kept-out sessions in `_archive/` and leave the enum value in place.

## Failure Modes

| State | Trigger | User sees | Recovery |
| --- | --- | --- | --- |
| Ambiguous subject before first tutor answer | Classifier returns multiple plausible subjects | Compact subject chips; reply still streams | Session attaches to "Unsorted"; user pick reconciles `subjectId` in background. |
| No classifier suggestion | Classifier and resolver fail or time out (>2s) | No interruption | Session attaches to "Unsorted" auto-subject; auto-filing at session close resolves a real subject. |
| Classifier dispatch fails | `safeSend` reports the classifier event never reached Inngest | No interruption | Sentry captures; session stays on "Unsorted"; session-close auto-file path covers the gap. |
| Filing pending at summary | Background job started but not finished | `Adding this to your Library...` | Summary polls session status: refetch-on-focus + refetch every 3s, max 10 polls (~30s), then show failure copy with `Retry`. User can also tap `Keep out of Library` at any time. |
| Filing succeeds | Job resolves subject/book/topic | `Added to {subject} > {topic}` | User can open/change/keep out. |
| Filing fails (recoverable) | LLM/service error, retry count `< MAX_FILING_RETRIES` | `Adding this to your Library...` (still pending UI) | Inngest retries automatically. |
| Filing fails (terminal) | Retry count `>= MAX_FILING_RETRIES = 3` | `Could not add this to Library` | `Retry` re-dispatches a fresh `app/session.auto_file_requested` (resets count). |
| User opts out before filing | User taps `Keep out of Library` while pending | Session summary remains; no Library topic | Set `filing_kept_out`; pending job's guarded write returns 0 rows and cleans up any topic it created per §4. |
| User opts out after filing | User taps `Keep out of Library` after success | Session remains; Library attachment removed | Detach session topic; safe-to-delete rule (§4) decides whether to drop the topic row. |
| User reverses keep-out | User taps `Add to Library` on a kept-out session | `Adding this to your Library...` | Clear `filing_kept_out` and re-dispatch `app/session.auto_file_requested`. |
| Existing topic reused | Filing maps to an existing Library topic | `Linked to {subject} > {topic}` | Keep topic; keep-out only detaches this session. |
| Stale retry after opt-out | Retry/backfill sees old unfiled session | Nothing | Handler exit list (§6) skips `filing_kept_out`, `filing_pending`, and terminal `filing_failed`. |
| Concurrent dispatch for same session | Two close events fire (e.g., mobile retry + summary load) | Single result | Inngest event dedupe key `auto-file-${sessionId}` collapses to one execution; guarded UPDATE in §6 prevents double-claim. |
| Session-close fails to dispatch filing event | Network failure between mobile and API | No filing | `safeSend` captures in Sentry; session stays unfiled (no `filingStatus`); user can manually trigger filing from Summary `Add to Library`. |
| Unauthorized session mutation | Tampered session ID | Protected/not found | API verifies `profileId` ownership before status changes. |

---

## Analytics

Track Library filing without raw transcript or raw topic text:

- `freeform_library_filing.requested`
- `freeform_library_filing.completed`
- `freeform_library_filing.failed`
- `freeform_library_filing.kept_out`
- `freeform_library_filing.kept_out_reversed`
- `freeform_library_filing.changed`
- `freeform_library_filing.classifier_latency_ms` (histogram, captured at first turn) — required to verify the "ask first, low friction" promise actually held in production.

Properties should be enum/ID/hash only:

- profile hash
- session hash
- filing trigger: `session_close`, `retry`, `keep_out`, `keep_out_reverse`, `change`
- result: `filed`, `existing_topic`, `failed`, `kept_out`, `unsorted_fallback`
- exchange count bucket
- retry count bucket (for `failed` and `completed` events, so we can see how often retries succeed)

Do not log display names, child names, raw transcript, raw user input, or topic title.

---

## Documentation Contract

When this ships, update the scattered flow docs in the same PR series:

- `LEARN-01` - create the freeform chat detail page.
- `SUBJECT-03` - create subject from chat when classifier cannot match.
- `SUBJECT-05` - subject resolution and clarification suggestions.
- `HOME-01` - clarify Study New vs Ask Anything.
- `LEARN-07` - replace "filing/dismissal" ambiguity with auto-file/keep-out semantics.
- `LEARN-08` - state that Library contains filed learning topics, while sessions can exist outside Library.
- `docs/flows/flow-master-directory.md` - move the relevant rows out of "Not mapped."

The docs must consistently say:

**Sessions are saved by default. Library filing is separate. A session can be kept out of Library. A filed topic always belongs to a subject.**
