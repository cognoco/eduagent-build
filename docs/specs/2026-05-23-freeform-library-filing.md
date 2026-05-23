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

Ask Anything/freeform chat should be ask-first and low-friction. The learner should be able to type a question and get value without doing manual filing work up front.

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
- Accepting the prompt calls `/filing`, which uses `fileToLibrary()` and `resolveFilingResult()` to create/reuse subject, book, chapter, and topic rows.
- Dismissing the prompt leaves the session unfiled.
- Existing retry infrastructure uses `learning_sessions.filingStatus` with `filing_pending`, `filing_failed`, and `filing_recovered`.

Current documentation gap:

- `LEARN-01` Freeform chat is not mapped.
- `SUBJECT-03` Create subject from chat is not mapped.
- `SUBJECT-05` Subject resolution and clarification is not mapped.
- `LEARN-07` mentions "filing/dismissal/completion" but does not explain that dismissal means "session saved, not Library-filed."

---

## Product Contract

### 1. Ask First

The learner taps **Ask Anything** and types normally.

The app may classify the first substantive message before starting the first streamed tutor reply because `learning_sessions.subjectId` is currently required. That classification must feel lightweight:

- confident existing subject match: auto-attach and show a small subject chip;
- confident new subject suggestion: create the subject and show a small subject chip;
- ambiguous match: ask with compact chips near the composer;
- no useful classification: ask for the subject before continuing, using the existing subject-resolution UI.

No full-screen filing or Library setup step should appear before the learner gets value.

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

Filing should be triggered at session close in V1. In-session background filing can be added later, but it is not required for the first implementation.

### 3. No Blocking Prompt At Close

When a meaningful freeform session closes, the app should not ask "Do you want to save this?"

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
- if the topic was created only for this filing and is safe to delete, delete the topic after detaching the session;
- if the topic already existed or is referenced elsewhere, leave the Library topic in place but remove this session's attachment to it.

Do not delete a topic while the session still references it. `learning_sessions.topicId` has cascade behavior through the topic foreign key, so detachment must happen first.

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

No route handler should fire-and-forget a filing job. A session close route or mobile action may dispatch a core event only if dispatch failure is surfaced correctly. Otherwise use the existing durable retry pattern.

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

The handler must re-read the session and exit if:

- session is missing;
- profile ownership does not match;
- `filingStatus === 'filing_kept_out'`;
- `filedAt IS NOT NULL`;
- `topicId IS NOT NULL`;
- transcript is missing or too short;
- exchange threshold is not met.

### 7. Change Filing

The first implementation may use simple correction paths:

- Before filing completes: `Keep out of Library` cancels filing by setting `filing_kept_out`.
- After filing completes: `Keep out of Library` detaches the session from the filed topic.
- `Change` may route to the filed topic/book or open the existing subject-resolution picker if it can be reused cheaply.

Do not build a large Library organizer UI in this work. The product win is automatic filing with opt-out, not full post-hoc taxonomy editing.

---

## UX Rules

- Do not use "Don't save" for Library opt-out. It sounds like deleting history.
- Use "Keep out of Library."
- Do not interrupt the tutor response with a modal unless subject classification is genuinely ambiguous and a session cannot safely start.
- Prefer chips, toasts, and compact status rows over blocking screens.
- Do not surface internal words like "filing", "taxonomy", "curriculum row", or "metadata" in user-facing copy.
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

## Failure Modes

| State | Trigger | User sees | Recovery |
| --- | --- | --- | --- |
| Ambiguous subject before first tutor answer | Classifier returns multiple plausible subjects | Compact subject chips | User picks one or creates a subject; then chat continues. |
| No classifier suggestion | Classifier and resolver fail | Compact "Pick a subject" UI | User selects or creates subject; no fake topic is filed. |
| Filing pending at summary | Background job started but not finished | `Adding this to your Library...` | Poll session status; user can keep out of Library. |
| Filing succeeds | Job resolves subject/book/topic | `Added to {subject} > {topic}` | User can open/change/keep out. |
| Filing fails | LLM/service error or resolver error | `Could not add this to Library` | Retry action dispatches existing retry path. |
| User opts out before filing | User taps `Keep out of Library` while pending | Session summary remains; no Library topic | Set `filing_kept_out`; pending job exits on re-read. |
| User opts out after filing | User taps `Keep out of Library` after success | Session remains; Library attachment removed | Detach session topic; delete only safe auto-created topic rows. |
| Existing topic reused | Filing maps to an existing Library topic | `Linked to {subject} > {topic}` | Keep topic; keep-out only detaches this session. |
| Stale retry after opt-out | Retry/backfill sees old unfiled session | Nothing | Job must skip `filing_kept_out`. |
| Unauthorized session mutation | Tampered session ID | Protected/not found | API verifies `profileId` ownership before status changes. |

---

## Analytics

Track Library filing without raw transcript or raw topic text:

- `freeform_library_filing.requested`
- `freeform_library_filing.completed`
- `freeform_library_filing.failed`
- `freeform_library_filing.kept_out`
- `freeform_library_filing.changed`

Properties should be enum/ID/hash only:

- profile hash
- session hash
- filing trigger: `session_close`, `retry`, `keep_out`, `change`
- result: `filed`, `existing_topic`, `failed`, `kept_out`
- exchange count bucket

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

