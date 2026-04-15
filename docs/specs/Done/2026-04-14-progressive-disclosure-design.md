# Progressive Disclosure of Progress Complexity

**Date:** 2026-04-14
**Status:** Draft
**Scope:** Mobile — progress screen, parent dashboard; API — dashboard response

## Problem

The app has 14+ progress-related screens with retention signals, CEFR labels, growth charts, milestones, and aggregated stats. A new user who has completed 0–3 sessions sees these features with thin or empty data, which creates a hollow experience rather than a motivating one. Progress complexity should be revealed only once there is meaningful data behind it.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Number of tiers | 2 (new vs established) | Simplicity — one threshold, one boolean |
| Threshold | 4 completed sessions | At 4 sessions, retention has had time to generate review items, stats tell a real story |
| Gating approach | Client-side, using `totalSessions` from existing APIs | Minimal API change; data is already cached by TanStack Query |
| Hidden features style | Invisible on home, teaser on progress + parent dashboard | Home stays focused; progress/parent show encouraging micro-goal message |
| Deep navigation | Lightweight "not enough data yet" states on detail screens | Prevents hollow experiences at every depth, not just top-level |

## Constant

```ts
export const PROGRESSIVE_DISCLOSURE_THRESHOLD = 4;
```

Defined once in a shared constants file (e.g., `apps/mobile/src/lib/constants.ts`). All gating references this constant — no magic numbers in components.

## Session Counting Definition

`totalSessions` counts sessions where `status !== 'active'` — this includes `completed`, `paused`, and `auto_closed`. This is the same definition used by `computeProgressMetrics()` in `snapshot-aggregation.ts`.

**Accepted trade-off:** Very short sessions (e.g., 2 minutes of random exploration) count toward the threshold. We accept this because:
- Adding a minimum quality bar (duration, exchange count) introduces a new concept that needs explaining to users
- A child who has opened the app 4 separate times is engaged enough to see their progress, even if individual sessions were brief
- The teaser copy uses a concrete count ("Complete N more sessions") which motivates completion regardless of quality

If post-launch data shows the threshold is too easily reached, adjust the constant — no structural changes needed.

## Data Source Consistency

The learner progress screen reads `totalSessions` from `GET /progress/inventory` (via `computeProgressMetrics()` in `snapshot-aggregation.ts`). The parent dashboard will read `totalSessions` from `GET /dashboard`.

**Both must use the same counting rule:** `status !== 'active'`. The dashboard service must call the same `computeProgressMetrics()` function (or read from `progress_snapshots.metrics.totalSessions`) rather than implementing a separate count. This ensures the two paths never drift.

Add a sync comment in both locations:
```ts
// SYNC: totalSessions must match the definition in snapshot-aggregation.ts
// (status !== 'active'). See progressive-disclosure-design.md.
```

## Tier Definitions

### New Learner: `totalSessions < 4`

**Progress screen (`progress.tsx`):**
- Hero card shows a concrete micro-goal message with the actual remaining count: e.g., "Complete 2 more sessions to see your full learning journey!"
- Hidden: stat pills (sessions, minutes, streak, vocabulary), subject cards, growth chart, milestones section
- Nothing else renders — clean and forward-looking

**Parent dashboard (`ParentDashboardSummary`):**
- Shown: child name, AI summary sentence, session count, total time
- Shown: concrete teaser text with remaining count: e.g., "After 3 more sessions, you'll see Alex's retention trends and detailed progress here"
- Hidden: retention trend badge, aggregate retention signal (On Track / Needs Attention / Falling Behind), per-subject `RetentionSignal` pills

**More screen — Mentor Memory link (`more.tsx`):**
- Hidden: "What My Mentor Knows" `SettingsRow` — the mentor hasn't accumulated meaningful inferences yet
- Note: the parent's view of a child's mentor memory (accessed from child detail screen) stays always visible — parents manage consent and may want to verify collection settings before sessions begin

**Detail screens (subject drill-down, child topic detail, vocabulary browser):**
- If the learner/child has < 4 sessions AND the screen would be nearly empty (no subjects, no topics, no vocabulary), show a lightweight "not enough data yet" inline message instead of the normal empty state
- If the screen has some data (e.g., 1 subject with 2 topics explored), render it normally — don't suppress real data

### Established Learner: `totalSessions >= 4`

Everything renders as it does today — full stat pills, subject cards, growth chart, milestones, retention signals, CEFR labels, parent dashboard with full retention/trend data.

### Mixed Children (Parent Dashboard)

A parent with multiple children may see different tiers per child. Each `ParentDashboardSummary` card gates independently on that child's `totalSessions`. This means one child's card may show full retention signals while the next shows teaser text. This is correct and expected — the parent can see that one child is further along than the other. The visual contrast is informative, not broken.

## What Is NOT Changing

- **Home screen intent cards** — existing logic stays exactly as-is. "Repeat & review" is already gated by `hasLibraryContent` and `reviewDueCount`. No session-count gating on home.
- **Session summary screen** — every session gets its full recap, milestones, recall bridge questions regardless of tier.
- **Recall test flow** — triggered by pedagogy, already progressive by nature.
- **Monthly reports** — self-gate by having insufficient data to report on.
- **CelebrationOverlay** — always rendered. Earned milestones are celebrated from session 1.

## Affected Files

| File | Change |
|------|--------|
| `apps/mobile/src/lib/constants.ts` (or equivalent) | Add `PROGRESSIVE_DISCLOSURE_THRESHOLD` constant |
| `apps/mobile/src/app/(app)/more.tsx` | Add `useProgressInventory()`; hide "What My Mentor Knows" row when `isNewLearner` |
| `apps/mobile/src/app/(app)/progress.tsx` | Gate stat pills, subject cards, growth chart, milestones behind threshold; show micro-goal teaser for new learners |
| `apps/mobile/src/app/(app)/progress/[subjectId].tsx` | Lightweight "not enough data" message when < 4 sessions and screen would be empty |
| `apps/mobile/src/app/(app)/progress/vocabulary.tsx` | Lightweight "not enough data" message when < 4 sessions and no vocabulary |
| `apps/mobile/src/components/coaching/ParentDashboardSummary.tsx` | Accept new `totalSessions` prop; gate retention trend, aggregate signal, per-subject signals behind threshold; show teaser with concrete count |
| `apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx` | Lightweight "not enough data" inline message when child has < 4 sessions and screen is empty |
| `packages/schemas/src/progress.ts` | Add `totalSessions: z.number().int()` to `dashboardChildSchema` |
| `apps/api/src/services/dashboard.ts` | Add `totalSessions` to `DashboardChild` response, sourced from `progress_snapshots.metrics.totalSessions` (same definition as inventory) |

## Data Flow

```
Learner progress screen:
  GET /progress/inventory (existing, cached)
    → inventory.global.totalSessions
    → isNewLearner = totalSessions < PROGRESSIVE_DISCLOSURE_THRESHOLD
    → remaining = PROGRESSIVE_DISCLOSURE_THRESHOLD - totalSessions

Parent dashboard:
  GET /dashboard (existing, cached — one field added)
    → child.totalSessions (NEW — from progress_snapshots.metrics.totalSessions)
    → isChildNew = child.totalSessions < PROGRESSIVE_DISCLOSURE_THRESHOLD
    → remaining = PROGRESSIVE_DISCLOSURE_THRESHOLD - child.totalSessions

Both paths use the same underlying count:
  progress_snapshots.metrics.totalSessions
    ← computeProgressMetrics() in snapshot-aggregation.ts
    ← sessions.filter(s => s.status !== 'active').length
```

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Inventory query fails | Network error | Progress screen shows existing error state with retry | Tap retry |
| Inventory loading slow | Cold cache | Existing loading spinner (timeout at 10s) | Spinner → timeout fallback |
| User regresses (data loss) | Theoretically impossible — server is source of truth | Would see teaser again | Complete more sessions |
| Threshold feels wrong | User feedback post-launch | Adjust `PROGRESSIVE_DISCLOSURE_THRESHOLD` constant | Single constant change, no structural changes |
| Dashboard missing totalSessions | Snapshot not yet generated for child | Fall back to 0 (new learner tier) | Safe default — shows teaser rather than empty stats |
| Mixed children visual contrast | One child established, one new | Different card layouts per child | Correct by design — informative, not broken |
| Short sessions inflate count | 4× 2-min sessions reach threshold | Stats may look thin but present | Accepted trade-off — see Session Counting Definition |

## Testing

- **Progress screen:** Verify sections hidden when `totalSessions < 4`, shown when `totalSessions >= 4`. Verify teaser renders with correct remaining count.
- **Parent dashboard:** Verify retention signals hidden for children with < 4 sessions, shown for >= 4. Verify teaser text renders with correct remaining count. Verify mixed-children state renders correctly (one established, one new).
- **Detail screens:** Verify lightweight "not enough data" message appears on nearly-empty detail screens for new learners, but real data renders normally.
- **Data consistency:** Verify dashboard `totalSessions` matches inventory `totalSessions` for the same profile.
- **Threshold constant:** Confirm it is exported from one location and used consistently — no hardcoded numbers in components.
- **No regressions:** Home screen intent card behavior unchanged. Session summary unchanged. Celebration overlay unchanged.
