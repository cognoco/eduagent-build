# Unified Learning Resume Plan

**Date:** 2026-04-27
**Status:** Implemented
**Goal:** Make every learner-facing "Continue" or "Continue learning" path resume the best learning context for the active profile, whether the learner starts from Home, Library, or Progress.

---

## Problem

The app already has several resume-ish paths, but they do not share one source of truth:

- Home uses `useContinueSuggestion()` and `GET /v1/progress/continue`, which currently picks the next incomplete curriculum topic inside the most recently active subject.
- Topic detail can resume an active or paused session for that exact topic through `useActiveSessionForTopic()`.
- Progress subject cards start a new subject-level session with no topic context.
- Progress subject detail starts `mode=freeform&subjectId=...`, so the tutor knows the subject but not the specific last topic or conversation.
- Library generally routes to shelf/book/topic screens; book/topic screens then apply their own local "continue" rules.

That means "Continue" can mean different things depending on where the learner taps it. The desired behavior is stronger: the app should know the learner's best resume point and carry enough context for the tutor to say, naturally, "we were working on X; want to pick up there?"

---

## Target Behavior

1. If the learner has an active or paused session with real activity, resume that exact chat transcript.
2. If there is no active/paused session, continue from the most recent meaningful topic conversation in the relevant scope.
3. If the learner is scoped to a subject, pick the most recent meaningful topic in that subject.
4. If the learner is scoped to a book, pick the most recent meaningful topic in that book.
5. If the learner is scoped to a topic, use that topic and resume its active/paused session when available.
6. If there are multiple Biology chats across different topics, a Biology-scoped Continue picks the most recent meaningful Biology topic, not the first incomplete curriculum topic.
7. If the learner studied Biology, Biography, and Maths, global Continue picks the most recent meaningful learning thread across active subjects, while the tutor still receives broader prior-learning context.
8. Ghost sessions with `exchangeCount = 0` never influence resume decisions.
9. Paused or archived subjects are not selected by global Continue unless the learner is already viewing that subject and we choose to show an explicit "resume subject first" state.

---

## Architecture

Create one backend service as the single source of truth:

```ts
getLearningResumeTarget(db, profileId, scope?)
```

Suggested scope:

```ts
type LearningResumeScope = {
  subjectId?: string;
  bookId?: string;
  topicId?: string;
};
```

Suggested response:

```ts
type LearningResumeTarget = {
  subjectId: string;
  subjectName: string;
  topicId: string | null;
  topicTitle: string | null;
  sessionId: string | null;
  resumeFromSessionId: string | null;
  resumeKind:
    | 'active_session'
    | 'paused_session'
    | 'recent_topic'
    | 'next_topic'
    | 'subject_freeform';
  lastActivityAt: string | null;
  reason: string;
};
```

Add a route:

```http
GET /v1/progress/resume-target?subjectId=&bookId=&topicId=
```

Keep `GET /v1/progress/continue` temporarily as a compatibility wrapper around the new service, or migrate callers directly.

---

## Selection Rules

Rank candidates in this order:

1. Active or paused learning sessions with `exchangeCount >= 1`, newest `lastActivityAt` first.
2. Completed or auto-closed learning sessions with `exchangeCount >= 1`, newest `lastActivityAt` first.
3. If a recent completed session has `session_summaries.nextTopicId`, use that as a next-topic target only when it still belongs to the same active subject/book scope.
4. Otherwise, use the next incomplete curriculum topic in scope.
5. Otherwise, fall back to subject-level learning only when no topic exists.

All queries must be profile-scoped and active-subject gated.

---

## Tutor Context

Exact active/paused resume already hydrates the transcript by passing `sessionId`.

For completed-session continuation, start a new session but store:

```ts
metadata: {
  effectiveMode: 'learning',
  resumeFromSessionId: '<previous-session-id>'
}
```

Then add a backend prompt context builder:

```ts
buildResumeContext(db, profileId, resumeFromSessionId)
```

It should include a compact handoff from existing data:

- subject and topic
- session summary, learner recap, highlight, or closing line
- last 1-2 learner/assistant exchanges if summary is thin
- optional `nextTopicId` and reason

Add this to `ExchangeContext` and the system prompt with guidance:

> The learner tapped Continue. Briefly connect to the prior conversation and ask if they want to take it from there. If they clearly wants a different direction, adapt within the current subject/topic.

This makes "take it from there" a tutor behavior, not just a navigation behavior.

---

## Client Wiring

Add:

- `useLearningResumeTarget(scope?)` in `apps/mobile/src/hooks/use-progress.ts`
- `navigateToResumeTarget(router, target, returnTo)` in a small navigation helper

Replace local continue logic in:

- `apps/mobile/src/components/home/LearnerScreen.tsx`
- `apps/mobile/src/app/(app)/progress/index.tsx`
- `apps/mobile/src/components/progress/SubjectCard.tsx` caller wiring
- `apps/mobile/src/app/(app)/progress/[subjectId].tsx`
- `apps/mobile/src/app/(app)/library.tsx` if adding a Library-level Continue affordance
- `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` for sticky Continue, using `bookId` scope
- `apps/mobile/src/app/(app)/topic/[topicId].tsx` can keep topic-specific lookup, or call the new route with `topicId`

Route params should be built consistently:

```ts
{
  pathname: '/(app)/session',
  params: {
    mode: 'learning',
    subjectId,
    subjectName,
    topicId,
    topicName,
    sessionId, // only for active/paused exact resume
    resumeFromSessionId, // only for completed-session handoff
    returnTo
  }
}
```

If `resumeFromSessionId` is used, `SessionScreen` should pass it into session creation metadata.

---

## Tests

Backend unit tests for `getLearningResumeTarget`:

- returns null for no subjects
- ignores ghost sessions with `exchangeCount = 0`
- active session outranks completed session
- paused session is resumable
- global scope picks newest meaningful thread across Biology, Biography, and Maths
- subject scope with five Biology topics picks the newest Biology topic
- book scope only considers topics in that book
- topic scope only considers that topic
- ignores sessions from another profile
- ignores paused/archived subjects for global scope
- falls back to next incomplete topic when no meaningful sessions exist

Integration route tests:

- `GET /v1/progress/resume-target`
- `GET /v1/progress/resume-target?subjectId=...`
- `GET /v1/progress/resume-target?bookId=...`
- `GET /v1/progress/resume-target?topicId=...`

Mobile tests:

- Home Continue navigates with the shared resume target
- Progress empty/new-learner Start learning uses resume target when present
- Progress subject card Continue uses subject-scoped target
- Progress subject detail Keep learning uses subject-scoped target
- Library-level Continue, if added, uses global or current-tab scope
- Book sticky Continue uses book-scoped target
- Topic Continue includes `sessionId` when target is active/paused

Prompt/session tests:

- session creation stores `metadata.resumeFromSessionId`
- prompt includes compact resume context for completed-session continuation
- prompt does not include another profile's session data

---

## Implementation Phases

### Phase 1: Unified Target

- Add schema/types.
- Add `getLearningResumeTarget`.
- Add route and tests.
- Migrate Home and Progress to use it.

### Phase 2: Completed-Session Handoff

- Add `resumeFromSessionId` route param and session metadata.
- Add `buildResumeContext`.
- Inject prompt guidance.
- Add tests around prompt content and profile isolation.

### Phase 3: Library Consistency

- Add or adjust Library-level Continue affordance.
- Move Book sticky Continue to the shared target.
- Keep Topic detail as the exact-topic entry point but use the same route.

### Phase 4: Cleanup

- Deprecate or wrap `getContinueSuggestion`.
- Remove duplicated "continue" heuristics from mobile screens.
- Consider DB indexes if query plans need it:
  - `learning_sessions(profile_id, last_activity_at desc)`
  - `learning_sessions(profile_id, subject_id, last_activity_at desc)`
  - `learning_sessions(profile_id, topic_id, last_activity_at desc)`

No schema migration is required for Phase 1 or Phase 2 if `resumeFromSessionId` lives in session metadata.

---

## Acceptance Criteria

- The same learner profile gets the same resume target from Home, Progress, and Library when the scope is global.
- Subject-scoped Continue never jumps to another subject.
- Topic-scoped Continue never resumes a different topic's session.
- Active/paused sessions load previous transcript.
- Completed-session continuations start a new session but the tutor mentions the previous session naturally.
- Prior studied subjects/topics remain available to the tutor through existing memory and prior-learning context, strengthened by the new resume context.
- The learner never lands in a blank subject-only chat when a meaningful topic/session exists.
