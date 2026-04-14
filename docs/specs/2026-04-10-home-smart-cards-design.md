# HOME-01 + HOME-06: Smart Home Intent Cards

**Date:** 2026-04-10
**Status:** Approved
**Finding:** `flow-improvements.md` HOME-01, HOME-06

## Problem

The learner home screen has three static intent cards in a fixed order ("Start learning," "Help with assignment," "Repeat & review") with no dynamic prioritization. Two key signals are available but not surfaced:

1. **Interrupted sessions** — the recovery marker exists in SecureStore but is only shown on `learn-new` (one tap deeper). Users don't know they have unfinished work from the home screen.
2. **Review-due count** — `reviewDueCount` is returned by the retention API and `getProfileOverdueCount()` exists server-side, but neither is displayed on the home screen. The "Repeat & review" card has no badge or subtitle.

Additionally, `useContinueSuggestion` (hitting `GET /progress/continue`) exists but is never wired to any home screen component.

## Solution

### 1. Surface interrupted session on home screen

Read the session recovery marker from SecureStore on `LearnerScreen` mount (same logic as `learn-new.tsx`). If a fresh marker exists (< 30 min), show a **priority intent card** at the top:

- Title: "Continue where you left off"
- Subtitle: "{subjectName}" (from marker)
- Navigates to `/(app)/session` with the stored `sessionId`
- Visually distinct: uses `bg-primary-soft` background to stand out from regular cards

If the marker is stale (> 30 min), don't show it — same expiry behavior as `learn-new`.

### 2. Add review-due count to "Repeat & review" card

Fetch a lightweight review summary on the home screen. Two options:

**Option A (chosen): Aggregate overdue count via a new API endpoint.**
Add `GET /progress/review-summary` that returns `{ totalOverdue: number }` using the existing `getProfileOverdueCount()` service function. This avoids fetching full retention data for every subject on the home screen.

**Subtitle on the review card:**
- `totalOverdue > 0`: "**{N} topics** ready for review" 
- `totalOverdue === 0`: "Keep your knowledge fresh"

### 3. Dynamic card ordering

Reorder the cards based on priority signals:

| Priority | Condition | Card shown first |
|----------|-----------|-----------------|
| 1 (highest) | Fresh recovery marker exists | "Continue where you left off" |
| 2 | `totalOverdue >= 5` | "Repeat & review ({N} due)" |
| 3 | Default | "Start learning" / "Help with assignment" in original order |

The ordering is computed client-side from the recovery marker + review summary data. No complex ranking algorithm — just two simple priority bumps.

### 4. Wire `useContinueSuggestion` into the primary learning card

When no recovery marker exists, enhance the "Start learning" card subtitle with the continue suggestion:

- Has suggestion: "Continue with {topicTitle} in {subjectName}"
- No suggestion: "Start a fresh session" (current behavior)

This makes the primary card feel personalized without changing its navigation target.

## IntentCard component changes

Add optional `badge` and `variant` props to `IntentCard`:

- `badge?: number` — renders a small count pill (for review-due count)
- `variant?: 'default' | 'highlight'` — `highlight` uses `bg-primary-soft` border/background

## Scope Exclusions

- **Push notifications for review** — already implemented (recall nudge cron). Not duplicating here.
- **Coaching card rendering** — the backend computes `review_due` coaching cards but rendering them is a larger feature. The badge approach is simpler and covers the home screen need.
- **ParentGateway changes** — parent home cards are a separate concern (HOME-02). Not included.

## Files Touched

- `apps/mobile/src/components/home/LearnerScreen.tsx` — recovery marker read, review summary fetch, card ordering logic, continue suggestion
- `apps/mobile/src/components/home/IntentCard.tsx` — add `badge` and `variant` props
- `apps/mobile/src/components/home/LearnerScreen.test.tsx` — tests for each card priority scenario
- `apps/api/src/routes/progress.ts` — add `GET /progress/review-summary` endpoint
- `apps/api/src/services/retention-data.ts` — expose `getProfileOverdueCount` (may already be exported)

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Recovery marker read fails | SecureStore error | No resume card shown (graceful degradation) | Normal static cards |
| Review summary API slow/fails | Network issue | "Repeat & review" card without badge | Card still navigable, just no count |
| Recovery marker points to deleted session | Session was cleaned up | Navigation to session screen, which handles missing sessions | Session screen shows appropriate error + back |
| Zero active subjects | New user, no library content | Only "Start learning" + "Help with assignment" (no review card) | Same as current behavior |
