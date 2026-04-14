# LEARN-16: Retention Review Home Surfacing

**Date:** 2026-04-10
**Status:** Approved
**Finding:** `flow-improvements.md` LEARN-16

## Problem

The spaced-repetition system works well but is invisible. `reviewDueCount` is returned by the API and already fetched on the Library screen — then discarded without display. The backend coaching card system computes `review_due` as the highest-priority card (priority 7-10), but no learner-facing screen renders it. The only active urgency signal is a daily push notification at ~8 AM.

Users who don't happen to open the Library won't know they have reviews due, and the "Repeat & review" home card gives no indication of urgency.

## Current State

- **API available:** `GET /subjects/:id/retention` returns `reviewDueCount` per subject
- **Service available:** `getProfileOverdueCount(db, profileId)` returns cross-subject total
- **Coaching card backend:** `precomputeCoachingCard()` generates `review_due` cards with priority 7-10 — never rendered in mobile
- **Push notification:** Recall nudge cron sends one push per day for overdue profiles
- **Library screen:** Fetches retention data, computes per-topic status, but never displays `reviewDueCount` as a number

## Solution

### 1. Review badge on home "Repeat & review" card

Already specified in the HOME-01+06 spec. The review card shows `"{N} topics ready for review"` subtitle when `totalOverdue > 0`. This spec covers the additional surfaces.

### 2. Review count badge in Library tabs

On the Library screen's "Topics" tab header, add a small badge pill showing the total overdue count across all subjects:

- `totalOverdue > 0`: Tab label becomes "Topics" with a badge circle showing the count
- `totalOverdue === 0`: No badge, just "Topics"

Fetch the total from the already-loaded per-subject retention data (sum `reviewDueCount` across all `SubjectRetentionResponse` results — this data is already being fetched on the Library screen).

### 3. Per-subject review indicator on Library shelves

On each shelf card in the Library's "Shelves" tab, show a subtle indicator when that subject has reviews due:

- `subject.reviewDueCount > 0`: Small text below the shelf title: "{N} to review"
- `subject.reviewDueCount === 0`: No indicator

This uses the already-fetched `SubjectRetentionResponse.reviewDueCount` — no new API call.

### 4. Review entry point from Topic detail

The topic detail screen already shows `RetentionSignal` and has a "Start recall check" button. No changes needed here — it's already well-connected.

### 5. Do NOT render the backend coaching card

The coaching card system (`precomputeCoachingCard`) was designed for a different UI paradigm (coaching card surface on the dashboard). For the learner home screen, the intent card badge approach is simpler and more consistent. Don't add a separate coaching card renderer — the badge handles the urgency signal.

## New API endpoint

`GET /progress/review-summary` — returns `{ totalOverdue: number }` for the active profile. Uses `getProfileOverdueCount()` which already exists. This is shared with the HOME-01+06 spec (single endpoint, two consumers).

## Scope Exclusions

- **Rendering coaching cards in the UI** — the coaching card system is backend-only infrastructure. Surfacing it would require a new component system. The badge approach is simpler.
- **Review scheduling nudges** — beyond push notifications (already implemented), no in-app nudge modals or interstitials. The badge is a passive signal.
- **Changing the push notification schedule** — the daily 8 AM nudge is sufficient. Not adding more notification frequency.

## Files Touched

- `apps/mobile/src/components/home/LearnerScreen.tsx` — review summary fetch (shared with HOME-01+06 spec)
- `apps/mobile/src/app/(app)/library.tsx` — badge on Topics tab, per-subject review indicator on Shelves
- `apps/api/src/routes/progress.ts` — `GET /progress/review-summary` endpoint (shared with HOME-01+06 spec)

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Review summary API fails | Network error | No badge shown (graceful degradation) | Cards still navigable without count |
| Zero reviews due | All caught up | No badge, subtitle says "Keep your knowledge fresh" | Normal state, no action needed |
| Very high overdue count | User hasn't reviewed in weeks | Badge shows actual count (e.g., "47 to review") | No cap — honest count motivates action |
| Retention data slow to load on Library | Large subject list | Tab badge appears after data loads (no flash) | Skeleton/loading state for shelf cards |
