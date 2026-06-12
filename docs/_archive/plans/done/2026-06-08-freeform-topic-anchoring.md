---
title: Freeform Library Filing Threshold - Implementation Plan
date: 2026-06-08
profile: code
spec: docs/flows/learning-path-flows.md - Ask Anything filing flow
adr: docs/adr/MMT-ADR-0021-freeform-library-filing-threshold.md
status: implemented
reviewed: 2026-06-08 (supersedes hidden provisional-topic anchoring and freeform note CTA plans)
---

# Freeform Library Filing Threshold - Implementation Plan

**Goal:** Keep Ask Anything low-friction for quick questions, and only make Library filing available once a freeform session has enough substance to deserve a durable curriculum topic.

**Decision:** [`MMT-ADR-0021`](../../../adr/MMT-ADR-0021-freeform-library-filing-threshold.md) records the durable decision: Freeform Ask Anything sessions do not get Challenge Round and do not get a separate learner-note flow. Subject-backed bookmarks remain the instant-save path during chat and do not require a topic. Library filing becomes available only after **5 exchanges**. If the learner allows Library saving, the app relies on the LLM-generated learner recap / structured session summary as the saved session artifact, not a learner-authored note.

## Product Boundary

- Ask Anything starts without a subject or topic choice.
- No hidden or provisional `curriculum_topics` rows are created mid-session.
- No mid-session `topicId` anchor is added to unlock topic-bound features.
- Challenge Round stays out of freeform.
- Freeform learner-notes stay out of scope; notes remain topic-bound for normal topic sessions.
- Bookmarks remain available for subject-backed mentor replies; they do not require a topic.
- Freeform Library filing is unavailable for 1-4 exchange sessions.
- Freeform Library filing is available for 5+ exchange sessions when the filing classifier has enough signal.
- If the learner keeps the session out of Library, the chat history and bookmarks remain; no Library topic is created.

## Scope

In scope:
- `apps/api/src/config/filing.ts` - raise `minFreeformExchanges` from 3 to 5.
- `apps/api/src/services/session/session-filing-dispatch.ts` - keep close-path auto-filing behind the shared threshold.
- `apps/api/src/services/session/session-crud.ts` - block user-triggered add/restore/retry filing for below-threshold freeform sessions.
- `apps/mobile/src/components/session-summary/SessionSummaryLibraryFilingControls.tsx` - hide Library filing controls for unfiled below-threshold freeform sessions.
- `apps/api/src/routes/sessions.test.ts` - prove close-path auto-filing waits until 5 exchanges.
- `apps/api/src/services/session/session-crud.integration.test.ts` - prove API filing services reject 4-exchange freeform sessions and allow 5-exchange sessions.
- `apps/mobile/src/app/session-summary/[sessionId].test.tsx` - prove the summary UI does not offer Library filing at 4 exchanges.
- `docs/flows/learning-path-flows.md` and project memory - record the product boundary.

Out of scope:
- Hidden provisional topics.
- Mid-session freeform topic anchoring.
- Challenge Round or challenge-like mode in freeform.
- New freeform learner-note CTAs.
- Re-keying notes, retention, mastery, or Challenge Round away from topics.
- Removing existing bookmarks.

## Current Code Baseline

- Freeform sessions are `sessionType: 'learning'` with `metadata.effectiveMode = 'freeform'`, usually without `topicId`.
- Bookmarks already work during the shared session UI because the bookmark action saves by assistant `eventId`; the current API requires `subjectId` but allows `topicId = null`.
- Topic-bound notes already require `topicId`.
- Close-path filing already uses `FILING_CONFIG.minFreeformExchanges`.
- Summary already has Library filing endpoints for add, restore, retry, and keep-out.
- The post-session pipeline already generates learner recap and structured LLM session-summary fields after the session is resolved.

## Tasks

- [x] **T1: Raise the freeform filing threshold** - `FILING_CONFIG.minFreeformExchanges` is 5, so close-path auto-filing and stranded backfill use the new threshold.

- [x] **T2: Apply the threshold to manual filing actions** - add/restore/retry filing services return `null` for below-threshold freeform sessions, including kept-out and failed states.

- [x] **T3: Hide below-threshold summary controls** - the Session Summary Library filing card does not appear for unfiled 1-4 exchange freeform sessions.

- [x] **T4: Keep freeform Challenge Round and notes out of scope** - docs and memory state that freeform has bookmarks and optional Library filing, not Challenge Round or learner-note entry.

- [x] **T5: Validate with focused tests** - API route tests, API integration tests, and mobile session summary tests cover the 4-vs-5 exchange boundary.

## Acceptance Criteria

- Freeform chat never creates a hidden topic mid-session.
- Freeform does not offer Challenge Round.
- Freeform does not offer a separate learner-note flow.
- Bookmarking mentor replies works in freeform without Library filing.
- A 1-4 exchange unfiled freeform session stays as chat history/bookmarks and has no Library filing affordance.
- A 5+ exchange freeform session may be filed to Library by the close-path or user-triggered filing paths.
- If the learner declines or removes Library filing, no topic-bound artifact is saved beyond the chat history, bookmarks, and normal session summary data.
- If filing succeeds, the filed session keeps the LLM-generated learner recap / structured session summary as the saved review artifact.

## Rejected Alternatives

The previous hidden-anchor plan created provisional topics mid-session so topic-bound features could attach before Library filing. That approach is rejected because it made Ask Anything feel like hidden curriculum creation and complicated privacy/visibility.

The later freeform-note plan asked the learner to accept Library filing so they could write a topic note. That approach is rejected for now because it adds a lot of UI/state work for a small benefit. Five exchanges is a cleaner signal: if the session is meaningful enough, file it and let the LLM produce the summary; if it is short, keep it as chat history plus bookmarks.
