# Sprint 8 — Learner Experience Routes & Screens

## Goal
Wire the core learning loop from home screen through session to progress display, using real API data. Zero remaining stubs for learner-facing routes.

## Current State (post-Sprint 7)
- 707 API tests + 7 integration tests passing
- All API route stubs wired for: sessions, interview, curriculum, assessment, consent
- Mobile onboarding flow works: subject creation → interview → curriculum
- SSE streaming works end-to-end

## Remaining Stubs
- `routes/progress.ts` — all endpoints return hardcoded mock data
- `routes/retention.ts` — returns empty arrays
- `routes/streaks.ts` — returns zeros
- `routes/settings.ts` — returns hardcoded defaults
- `routes/dashboard.ts` — returns empty arrays (out of scope — Sprint 10)
- `routes/parking-lot.ts` — returns empty (out of scope — Sprint 10)
- `routes/homework.ts` — placeholder session (out of scope — Sprint 10)

---

## Phase 1: Foundation — Progress Service + Wire Stub Routes + Mobile Hooks

**Goal:** Make progress, retention, and streak API routes return real data. Create mobile hooks.

### API Changes

1. **New: `apps/api/src/services/progress.ts`**
   - `getSubjectProgress(db, profileId, subjectId)` — count total/completed/verified topics, retention status
   - `getOverallProgress(db, profileId)` — aggregate across all subjects
   - `getContinueSuggestion(db, profileId)` — find next topic to learn

2. **Wire: `apps/api/src/routes/progress.ts`** — Replace all TODO stubs with calls to progress service
   - `GET /subjects/:subjectId/progress` → `getSubjectProgress()`
   - `GET /progress/overview` → `getOverallProgress()`
   - `GET /progress/continue` → `getContinueSuggestion()`

3. **Wire: `apps/api/src/routes/streaks.ts`** — Wire to existing `services/streaks.ts` (already has `getStreakState`, `calculateXpSummary`)

4. **Wire: `apps/api/src/routes/retention.ts`** — Wire `GET /subjects/:subjectId/retention` to query real `topic_schedules` data

### Mobile Hooks

5. **New: `apps/mobile/src/hooks/use-progress.ts`**
   - `useSubjectProgress(subjectId)`, `useOverallProgress()`, `useContinueSuggestion()`

6. **New: `apps/mobile/src/hooks/use-retention.ts`**
   - `useRetentionTopics(subjectId)`, `useTopicRetention(topicId)`

7. **New: `apps/mobile/src/hooks/use-assessments.ts`**
   - `useCreateAssessment(subjectId, topicId)`, `useSubmitAnswer(assessmentId)`, `useAssessment(assessmentId)`

### Tests
- Co-located service tests for `progress.ts` (mock DB, verify scoped repo usage)
- Co-located route tests for wired routes
- Co-located hook tests (mock `useApi`)

### Verification
- `pnpm exec nx run api:test` — all pass with new tests
- `pnpm exec nx run mobile:test` — all pass with new hook tests

---

## Phase 2: Home Screen with Real Data

**Goal:** Home screen shows real subject progress, coaching card, and streak/XP.

### Changes

1. **Modify: `apps/mobile/src/app/(learner)/home.tsx`**
   - Use `useSubjectProgress` for real retention status per subject
   - Use `useContinueSuggestion` for coaching card content
   - Use streaks hook for streak count and XP
   - Remove hardcoded coaching card text
   - Fix persona-check conditionals (violates "components are persona-unaware" rule)

2. **New: `apps/mobile/src/hooks/use-coaching-card.ts`**
   - Aggregates data from progress + retention hooks to build coaching card state

### Verification
- Home screen shows real subject names with per-subject retention indicators
- Coaching card content changes based on actual learning state
- Streak count visible in header

---

## Phase 3: Session Close Flow & Summary Screen

**Goal:** After learning session, show summary and "Your Words" prompt.

### Changes

1. **Modify: `apps/mobile/src/app/chat.tsx`**
   - Add session close logic (exchange count tracking, timer, close prompt)
   - Wire freeform/practice modes to real API (remove MOCK_RESPONSES)
   - On close: call `useCloseSession`, navigate to summary screen

2. **New: `apps/mobile/src/app/session-summary.tsx`**
   - Session stats display (exchanges, duration, escalation rung)
   - "Your Words" summary input (FR34) → `POST /sessions/:id/summary`
   - AI feedback on summary
   - "Continue" button → home

3. **Modify: `apps/mobile/src/hooks/use-sessions.ts`**
   - Add `useSessionSummary(sessionId)` query hook

### Verification
- Start session, exchange messages, tap "Done"
- Summary screen shows real stats
- Write summary, get AI feedback, return to home

---

## Phase 4: Learning Book with Real Data + Topic Detail

**Goal:** Learning Book shows real topics with retention status.

### Changes

1. **Modify: `apps/mobile/src/app/(learner)/learning-book.tsx`**
   - Wire to `useRetentionTopics(subjectId)`
   - Add subject filter tabs
   - Show topic completion/retention/struggle status
   - Tappable topic rows → topic detail

2. **New: `apps/mobile/src/app/(learner)/topic-detail.tsx`**
   - Topic name, description, key concepts
   - Retention score, next review date, mastery score
   - Actions: "Start Review Session", "Request Re-test", "Relearn Topic"

3. **Modify: `apps/mobile/src/app/(learner)/_layout.tsx`**
   - Register `topic-detail` as hidden tab route

### Verification
- Learning Book shows topics grouped by subject with real retention signals
- Tap topic → detail with real data

---

## Phase 5: Settings + Assessment Entry Points

**Goal:** Settings persist to API. Assessment entry points exist.

### Changes

1. **Modify: `apps/mobile/src/app/(learner)/more.tsx`**
   - Replace local `useState` toggles with API-backed mutations
   - Show real subscription status

2. **Modify: `apps/mobile/src/hooks/use-settings.ts`**
   - Add `useUpdateNotificationSettings()`, `useUpdateLearningMode()`

3. **New: `apps/api/src/services/settings.ts`** — Settings service
4. **Wire: `apps/api/src/routes/settings.ts`** — Wire to settings service

5. **Assessment entry:**
   - In `topic-detail.tsx`: "Take Assessment" button
   - In `chat.tsx`: Handle `mode=assessment`

### Verification
- Toggle settings, reload, settings persist
- Start topic assessment, complete it, see mastery score

---

## Phase Dependencies

```
Phase 1 ──→ Phase 2 (Home)
        ──→ Phase 3 (Session Close) [independent of Phase 2]
Phase 1 + Phase 2 ──→ Phase 4 (Learning Book)
Phase 1 ──→ Phase 5 (Settings) [independent of 2-4]
```

Phases 2 and 3 can run in parallel. Phase 5 is largely independent after Phase 1.

## Anti-Pattern Watchlist
- `home.tsx`: persona conditional for coaching card content
- `home.tsx`: hardcoded `RetentionSignal status="strong"`
- `(learner)/_layout.tsx`: hardcoded hex colors in tab bar
- `MessageBubble.tsx`: hardcoded hex colors + `isDark` prop
- `more.tsx`: local `useState` for notification toggles
- `chat.tsx`: `MOCK_RESPONSES` array for freeform/practice
