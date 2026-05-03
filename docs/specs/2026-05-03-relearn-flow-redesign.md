# Relearn Flow Redesign

**Date:** 2026-05-03
**Branch:** library-redesign
**Status:** Draft

## Problem

The current relearn flow has three issues:

1. **No visibility:** The Practice screen shows "N topics ready for review" as a number badge but never reveals which topics or subjects they belong to. The student taps blind.
2. **No choice:** Tapping "Review topics" auto-selects the single most-overdue topic (`nextReviewTopic`) and sends the student directly into the relearn screen. No subject or topic selection.
3. **Premature retention reset (bug):** `startRelearn` resets the retention card (`nextReviewAt: null`, `failureCount: 0`, etc.) the moment a method is selected. If the student backs out without completing any learning, the topic silently disappears from the overdue count. The review is "completed" with zero learning.

Additionally, the relearn session opens with a generic greeting ("Let's approach this one differently. What felt unclear last time?") with no context about what was previously covered.

## Design

### Adaptive Topic Selection

Entry point is unchanged: Practice screen → "Review topics" card.

The flow adapts based on overdue topic count:

**Single subject with overdue topics → topic list only:**
- Skip subject picker entirely.
- Show a flat topic list for that subject.

**≤10 overdue topics across multiple subjects → grouped flat list:**
- Single scrollable screen titled "Review Topics" with total-due badge.
- Topics grouped under subject section headers (uppercase, muted color).
- Each topic row shows: topic name, "Overdue X days" (or "Due today").
- Sorted most-overdue first within each subject group.
- Tapping a topic → method picker.

**>10 overdue topics → subject picker → topic list:**
- Step 1: Subject picker screen. Each row shows: subject name, "N topics to review" subtitle, chevron.
- Step 2: Tapping a subject → dedicated topic list for that subject (same layout as the flat list, single-subject).
- Back arrow returns to subject picker.

### Method Picker

Reached after tapping a topic from either flow above. Largely unchanged from current, with refinements:

- Same 4 methods: visual_diagrams, step_by_step, real_world_examples, practice_problems.
- The student's previous method (from `teachingPreferences`) is highlighted at top: "Same way as before — [method name]".
- The other 3 methods listed below it.
- Footer text: "No commitment yet — your review progress is safe" — addresses the premature-reset bug visually.
- Tapping a method creates the session and navigates to it.

### Session Opening with Recap

When a relearn session starts, the API fetches the most recent `sessionSummary` for the topic (specifically the `learnerRecap` field) and includes it in the session context.

The AI opens with:
1. A recap: "Last time you learned about [topic], we covered:" followed by bullet points from `learnerRecap`.
2. A quiz offer: "Let's see what you remember! Want to do a quick quiz on these before we dive in?"
3. Two tappable response buttons: "Yes, quiz me!" / "Just teach me".

**"Quiz me" path:** The AI asks 2-3 inline recall questions in the chat based on the recap points. After the quiz, transitions into re-teaching with the chosen method, focusing on gaps revealed by the quiz.

**"Just teach me" path:** Skips the quiz and starts re-teaching immediately with the chosen method.

**No recap available (first-time relearn or missing summary):** The AI falls back to the current generic opening: "Let's approach this topic from a fresh angle. What do you remember about [topic]?"

### Bug Fix: Deferred Retention Reset

**Current behavior:** `startRelearn` in `retention-data.ts` (lines 793-812) resets the retention card immediately: `easeFactor: 2.5`, `intervalDays: 1`, `repetitions: 0`, `failureCount: 0`, `consecutiveSuccesses: 0`, `xpStatus: 'pending'`, `nextReviewAt: null`, `lastReviewedAt: null`.

**New behavior:** `startRelearn` creates the session and marks the topic as `needs_deepening` (as before) but does NOT reset the retention card. The retention card reset moves to the `session-completed` Inngest function, conditional on:
- The session is a relearn session (sessionType check or mode flag).
- At least 1 exchange was completed (exchangeCount > 0).

If the student backs out with zero exchanges, no reset occurs. The topic remains in the overdue list. The abandoned session is cleaned up as `auto_closed` by the existing session timeout logic.

This also means the `needsDeepening` insert in `startRelearn` should be idempotent — re-tapping the same topic after backing out should not create duplicate rows (the existing `active` check already handles this).

## API Changes

### New endpoint: `GET /progress/overdue-topics`

Returns all overdue topics grouped by subject. Used by the new topic selection screens.

```typescript
// Response shape
{
  totalOverdue: number;
  subjects: Array<{
    subjectId: string;
    subjectName: string;
    overdueCount: number;
    topics: Array<{
      topicId: string;
      topicTitle: string;
      overdueDays: number;
      failureCount: number;
    }>;
  }>;
}
```

Topics within each subject sorted by overdue duration descending (most overdue first). Subjects sorted by highest overdue count descending.

The existing `GET /progress/review-summary` endpoint remains for the Practice screen badge count and Home screen CoachBand — it continues to return `totalOverdue` and `nextReviewTopic`.

### Modified: `POST /retention/relearn`

Remove the retention card reset from this handler. Everything else unchanged: ownership check, `needsDeepening` insert, session creation, `preferredMethod` resolution.

Add to the response: `recap: string | null` — the `learnerRecap` from the most recent `sessionSummary` for the topic. The client passes this to the session screen so the AI can open with the recap.

### Modified: `session-completed` Inngest function

Add a step after the existing SM-2 update logic: if the completed session is a relearn session AND exchangeCount > 0, perform the retention card reset that was previously in `startRelearn`. If exchangeCount === 0, skip the reset entirely.

## Data Flow

```
Practice screen
  ↓ tap "Review topics"
  ↓ GET /progress/overdue-topics
  ↓
[≤10 topics?] ──yes──→ Flat topic list (grouped by subject)
  │                        ↓ tap topic
  no                       ↓
  ↓                     Method picker
Subject picker              ↓ tap method
  ↓ tap subject            ↓
Topic list for subject   POST /retention/relearn
  ↓ tap topic               (no card reset, returns recap)
  ↓                        ↓
Method picker            Session screen
  ↓ tap method              (opens with recap + quiz offer)
  ↓                        ↓
POST /retention/relearn  [student completes session]
                           ↓
                         session-completed Inngest
                           (resets retention card if exchangeCount > 0)
```

## Existing Entry Points

The relearn flow is also reachable from:
- **Topic detail screen** (`/(app)/topic/[topicId]`): "Relearn" primary action button. This already has a specific topic selected — goes directly to method picker. Unchanged.
- **Recall test screen** (`/(app)/topic/recall-test`): RemediationCard "Relearn Topic" button. Already has a specific topic. Goes directly to method picker. Unchanged.
- **Home screen CoachBand**: Navigates to relearn with `nextReviewTopic`. This should be updated to navigate to the new topic selection screen instead, so the student has a choice.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Zero overdue topics | Student taps "Review topics" | Empty state: "All caught up" with next review time | Browse topics link (existing) |
| API error fetching overdue topics | Network failure | Error state with retry button | Tap retry or go back |
| No recap available for topic | First relearn or summary missing | Fallback AI opening (generic) | None needed — graceful degradation |
| Student backs out after method selection | Back nav before any exchange | Topic stays in overdue list (no reset) | Return to topic list, pick again |
| Session created but abandoned (0 exchanges) | App kill, timeout, manual close | Session auto-closed, no retention reset | Topic remains overdue, student can retry |
| `needsDeepening` already active for topic | Student re-enters relearn for same topic | Existing active row reused (idempotent) | None needed |

## Files Affected

**Mobile (new/modified):**
- `apps/mobile/src/app/(app)/topic/relearn.tsx` — major rewrite: topic selection + subject picker
- `apps/mobile/src/hooks/use-progress.ts` — new `useOverdueTopics` hook
- `apps/mobile/src/hooks/use-retention.ts` — update `useStartRelearn` response type (add `recap`)
- `apps/mobile/src/app/(app)/practice.tsx` — update "Review topics" onPress to navigate to new screen
- `apps/mobile/src/components/home/LearnerScreen.tsx` — update CoachBand navigation
- `apps/mobile/src/components/session/sessionModeConfig.ts` — update relearn mode opening to use recap

**API (modified):**
- `apps/api/src/routes/progress.ts` — new `GET /progress/overdue-topics` endpoint
- `apps/api/src/services/retention-data.ts` — remove retention card reset from `startRelearn`, add recap fetch
- `apps/api/src/inngest/functions/session-completed.ts` — add deferred retention reset for relearn sessions

**Tests:**
- `apps/mobile/src/app/(app)/topic/relearn.test.tsx` — rewrite for new flow
- `apps/api/src/services/retention-data.test.ts` — update `startRelearn` tests (no reset assertion)
- `apps/api/src/inngest/functions/session-completed.test.ts` — add relearn deferred reset tests
- New: overdue-topics endpoint tests
- E2E flows: update `relearn-flow.yaml`, `failed-recall.yaml`, `relearn-child-friendly.yaml`
