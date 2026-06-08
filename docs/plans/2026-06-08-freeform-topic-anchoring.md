---
title: Freeform Notes Via Library Filing - Implementation Plan
date: 2026-06-08
profile: code
spec: docs/flows/learning-path-flows.md - Ask Anything note and filing flow
status: draft
reviewed: 2026-06-08 (supersedes hidden provisional-topic anchoring after product review)
---

# Freeform Notes Via Library Filing - Implementation Plan

**Goal:** Let Ask Anything sessions offer note capture without minting hidden mid-session topics. If the learner wants to record a topic-bound note from a freeform session, the app first asks them to accept Library filing for that session.

**Approach:** Keep Ask Anything lightweight during chat. Learners can bookmark mentor replies instantly because bookmarks are session-event based and do not need a topic. Topic-bound notes remain Library artifacts: at the end of a freeform session, the app may offer "Write a note"; if the session is not already filed to a topic, the note flow asks to add the session to Library first, then opens note entry after filing resolves.

## Product Boundary

- Ask Anything starts without a subject or topic choice.
- No hidden or provisional `curriculum_topics` rows are created mid-session.
- No mid-session `topicId` anchor is added to make notes or Challenge Round work.
- Challenge Round stays out of freeform. It remains a formal topic-bound learning-session feature.
- Bookmarks are available inside freeform sessions for instant saving of mentor replies.
- Learner-notes remain topic-bound. A freeform learner-note can be created only after the session has a real Library topic through filing.
- The note offer is the filing consent moment: if the learner wants to write a note from an unfiled freeform session, ask whether to add the session to Library first.
- Declining Library filing means no topic-bound note is saved. The session transcript/history and any bookmarks remain available.
- If the existing close-path filing has already resolved the session to a Library topic, the note flow can open directly against that topic.
- If filing is pending or failed, the note flow must show a recoverable state rather than hiding the note or saving it somewhere unexpected.

## Scope

In scope:
- `apps/mobile/src/app/session-summary/[sessionId].tsx` - freeform end-of-session note CTA, Library filing consent, filed/pending/failed states
- `apps/mobile/src/components/session/SessionFooter.tsx` - keep live freeform note entry blocked unless a real topic exists; ensure copy points learners to the end-of-session note flow
- `apps/mobile/src/hooks/use-filing.ts`, `use-retry-filing.ts`, `use-notes.ts` - reuse existing mutations for add/restore/retry and note creation
- `apps/api/src/routes/sessions.ts` and `apps/api/src/services/session/session-crud.ts` - verify existing `/library-filing/add`, `/library-filing/restore`, and `/retry-filing` endpoints cover note-triggered filing
- `apps/api/src/services/session/session-filing-dispatch.ts` - preserve close-path filing behavior unless tests show it conflicts with note consent copy
- `docs/flows/learning-path-flows.md` - document freeform bookmarks, note offer, and Library filing consent
- `.claude/memory/project_freeform_library_filing_decision.md` - update stale memory so future work does not resurrect hidden anchoring

Out of scope:
- Hidden provisional topics
- Mid-session freeform topic anchoring
- Challenge Round or challenge-like mode in freeform
- Letting learner-notes exist outside `topic_notes`
- Re-keying notes, retention, mastery, or Challenge Round away from topics
- Removing existing bookmarks

## Current Code Baseline

- Freeform sessions start as `sessionType: 'learning'` with `metadata.effectiveMode = 'freeform'`, usually without `topicId`.
- Bookmarks already work during the shared session UI because the bookmark action saves by assistant `eventId`.
- Live note input already requires `topicId`; without one it shows the "cannot save" fallback.
- Freeform close currently goes to session summary; close-path auto-file may dispatch in the background when the session is topicless, unfiled, and has enough exchanges.
- Summary already has Library filing endpoints for add, restore, retry, and keep-out. The plan should reuse that machinery instead of adding a new topic lifecycle.

## Tasks

### Phase 1 - Product State And Copy

- [x] **T1: Replace hidden-anchor docs with note-through-filing docs** - done when: `docs/flows/learning-path-flows.md` says Ask Anything has instant bookmarks, no freeform Challenge Round, no hidden topic anchoring, and a note can be recorded only after the learner accepts Library filing or the session is already filed.

- [x] **T2: Update stale freeform filing memory** - done when: `.claude/memory/project_freeform_library_filing_decision.md` states that bookmarks are the instant-save path, learner-notes require a filed Library topic, and hidden provisional topics are rejected.

### Phase 2 - Summary Note Offer

- [ ] **T3: Add a freeform summary note CTA** - done when: session summary shows a note CTA for freeform sessions that have enough transcript content to make a note useful, and the CTA does not appear for empty/quick one-off sessions. The CTA copy must make clear that a note is saved to Library, not merely to chat history.

- [ ] **T4: Route filed sessions directly to note input** - done when: if the freeform session already has `topicId`, pressing the note CTA opens `NoteInput` and saves via `useCreateNote({ topicId, sessionId, content })`; the saved note appears on normal note/Library surfaces.

- [ ] **T5: Ask for Library filing before unfiled note entry** - done when: if the freeform session has no `topicId`, pressing the note CTA shows a consent step: "Notes live in Library. Add this session to Library so you can save a note?" Accepting calls the existing Library filing add/restore/retry path as appropriate; declining closes the consent step and saves no note.

- [ ] **T6: Open note entry after filing resolves** - done when: after user-accepted filing succeeds and the refetched session has `topicId`, the UI opens note input against that real topic. If filing is still pending, the UI shows pending status and a retry/refetch path instead of a hidden note field.

- [ ] **T7: Make filing failure recoverable** - done when: filing failure from the note flow shows retry and keep-as-chat actions. Retry reuses existing retry/add/restore endpoints. Keep-as-chat leaves the session unfiled or kept out of Library and does not save a note.

### Phase 3 - Guardrails

- [ ] **T8: Keep freeform Challenge Round blocked** - done when: tests assert a topicless freeform session cannot receive or accept a Challenge Round, and no freeform-only challenge affordance is introduced in this plan.

- [ ] **T9: Keep live freeform notes blocked without topic** - done when: existing `SessionFooter` note behavior still refuses to save a learner-note without `topicId`, but the user-facing recovery points to the end-of-session Library filing note flow rather than implying the note disappeared.

- [ ] **T10: Preserve bookmarks as instant save** - done when: no bookmark code path requires `topicId`, and a regression test or existing test proves an assistant message in a freeform session can be bookmarked.

### Phase 4 - Validation

- [ ] **T11: Add mobile tests** - done when: tests cover filed freeform note save, unfiled freeform note CTA -> filing consent, consent decline -> no note, filing success -> note input opens, filing failure -> retry/keep-as-chat, and no Challenge Round affordance in freeform.

- [ ] **T12: Add API tests only if endpoint behavior changes** - done when: if implementation changes the filing endpoints or close-path filing dispatch, API tests cover profile scoping, state transitions, retry limits, and no hidden topic creation. If API behavior is reused unchanged, document that in the task notes and keep validation to existing endpoint coverage.

- [ ] **T13: Run focused validation** - done when these pass for touched files:
  - `pnpm exec nx run api:test` if API/session filing code changes
  - `pnpm exec nx test:integration api` if API filing persistence changes
  - `pnpm exec nx lint mobile`
  - `cd apps/mobile && pnpm exec tsc --noEmit`
  - related mobile Jest tests for session summary/session footer/bookmarks/notes

## Acceptance Criteria

- Freeform chat never creates a hidden topic mid-session.
- Freeform does not offer Challenge Round.
- Bookmarking mentor replies works in freeform without Library filing.
- The freeform note offer appears at the end/summary, not as a hidden mid-chat topic action.
- If the session is unfiled, note creation first asks the learner to add the session to Library.
- If the learner declines filing, no learner-note is saved and nothing vanishes.
- If filing succeeds, the note is saved as a normal topic note and appears where notes normally live.
- If filing fails, the learner sees retry/keep-as-chat recovery.

## Rejected Alternative

The previous hidden-anchor plan created provisional topics mid-session so topic-bound features could attach before Library filing. That approach is rejected because it made notes disappear from normal note surfaces until promotion, risked confusing delayed affordances, over-sold Challenge Round eligibility, and changed the mental model of Ask Anything from lightweight chat into hidden curriculum creation.
