# Expandable Subject Cards with Honest Mastery

**Date:** 2026-04-21
**Status:** Draft
**Scope:** Parent-facing subject cards on the child dashboard

## Problem

The parent dashboard's Subjects section has three UX issues:

1. **Inconsistent card headlines** — cards show different units of progress ("topics explored", "sessions completed", "topics mastered") depending on which code branch fires. Parents context-switch per card.
2. **"Mastered" is dishonest** — it conflates instant assessment passes (one LLM-graded answer) with spaced-repetition-verified retention (~7 days of recalls). Parents see a number that overstates what their child actually retained.
3. **Impossible states are visible** — "1 topic explored, 0 sessions" (topic row exists but session had insufficient exchanges), or fully empty cards (0 everything) for enrolled-but-untouched subjects.
4. **Topic detail is hidden** — tapping a card navigates to a separate screen, but there is no visual hint that this is possible. Parents don't discover the per-topic breakdown.

## Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| How to represent mastery? | Two-tier: "studied" + "mastered" | "Studied" = touched in a qualifying session (headline aggregate). "Mastered" = retention-verified only (xpStatus = 'verified'). Row-level label "Covered" = assessment passed but not yet retention-verified — deliberately a different word to avoid collision with the headline count. |
| What counts as mastered? | Only `xpStatus === 'verified'` (Path B) | Requires 2+ successful spaced-repetition recalls over days. Assessment-passed alone (Path A) counts as "covered", not "mastered". |
| Empty subjects? | Hide entirely in parent view | Subjects with zero activity across all dimensions are not shown. Predicate: `sessionsCount > 0 OR topics.explored > 0 OR topics.inProgress > 0 OR topics.mastered > 0`. Covers legacy data with assessments but no sessions. |
| Topic detail disclosure? | Accordion expand inline | Card expands on tap to show topics. Lazy-loads via existing `useChildSubjectTopics` hook. |
| Child view impact? | Accordion parent-only; mastery count drops for child too | SubjectCard keeps existing `onPress`/`onAction` behavior when those props are provided. Accordion mode is opt-in via new props. The tighter `masteredTopicIds` definition (1A) also lowers `topics.mastered` on the child's own progress screen — this is intentional and honest. |
| Child view mastery labels? | Keep "mastered" — no reframe needed | Children 11+ understand mastery means retention. The count drops but stays honest. No "still know" or "retained" reframe needed — simpler is clearer per `no_jargon_kid_language`. The progress hero pill copy (`heroCopy()`) already handles `topicsMastered === 0` gracefully. |

## Design

### 1. Data layer: tighten mastery and exploration thresholds

**File:** `apps/api/src/services/snapshot-aggregation.ts`

#### 1A. Mastered = retention-verified only

In both `buildSubjectMetric` (line ~332) and `buildSubjectInventory` (line ~505):

**Before:** `masteredTopicIds` includes topics with `assessment.status === 'passed'` OR `retentionCard.xpStatus === 'verified'`.

**After:** `masteredTopicIds` includes ONLY topics with `retentionCard.xpStatus === 'verified'`. Topics that passed an assessment but lack retention verification count as `inProgress` (covered but not mastered).

This must be applied to both functions so that:
- Per-subject `topics.mastered` (from `buildSubjectInventory`)
- Global `topicsMastered` (from `buildSubjectMetric` → `computeProgressMetrics` → `buildKnowledgeInventory` line 659)

...always agree. A parent will never see subject cards summing to 5 mastered while the global hero pill says 8.

#### 1B. Explored topics require a qualifying session

In `buildSubjectInventory`:

**Before:** `exploredTopicIds` includes any topic where `filedFrom !== 'pre_generated'`, regardless of whether a session exists.

**After:** Only include a topic in `exploredTopicIds` if at least one session for that subject references this `topicId` AND has `exchangeCount >= 1`. Topics that were picked but abandoned before any exchange are invisible.

This eliminates the "1 topic explored, 0 sessions" paradox.

#### 1C. Cross-surface mastery consistency audit

The `masteredTopicIds` tightening in 1A affects every surface that reads `topicsMastered` or `topics.mastered`. Both computation functions (`buildSubjectMetric` and `buildSubjectInventory`) are the sole source of truth — fixing them propagates the new definition to all downstream consumers. This table confirms each surface:

| # | Surface | File | Reads from | Auto-propagates? | Notes |
|---|---------|------|------------|-------------------|-------|
| 1 | Child progress hero pill | `progress/index.tsx` | `KnowledgeInventory.global.topicsMastered` (live) | YES | `heroCopy()` branches on count — handles 0 gracefully |
| 2 | Parent subject cards | `SubjectCard.tsx` | `SubjectInventory.topics.mastered` (live) | YES | This spec's primary target |
| 3 | Child subject detail | `progress/[subjectId].tsx` | `SubjectInventory.topics.mastered` (live) | YES | Shows `M/N planned topics mastered` |
| 4 | Parent dashboard summary pill | `ParentDashboardSummary.tsx` | `DashboardChildProgress.topicsMastered` (snapshot) | YES (new snapshots) | Old snapshot rows retain wide count until regenerated |
| 5 | Parent child detail screen | `child/[profileId]/index.tsx` | Snapshot metrics + history points | YES (new snapshots) | Growth chart shows historical points from old snapshots |
| 6 | Weekly progress push | `weekly-progress-push.ts` | Snapshot delta at send time | YES | Future pushes use new definition |
| 7 | Weekly report generator | `weekly-report.ts` | `ProgressMetrics.topicsMastered` from snapshot | YES | Future reports use new definition |
| 8 | Monthly report generator | `monthly-report.ts` | Snapshot metrics | YES (new reports) | Already-persisted reports are frozen |
| 9 | Monthly report screen | `report/[reportId].tsx` | Persisted `MonthlyReportData` | NO | Frozen at generation time — old reports show old counts permanently |
| 10 | Milestone detection | `milestone-detection.ts` | `ProgressMetrics.topicsMastered` | YES | **Re-trigger risk:** users whose count drops below a threshold may re-earn the badge. Acceptable — milestones are celebratory, not contractual. |
| 11 | Dashboard API | `dashboard.ts` | `currentMetrics.topicsMastered` from snapshot | YES | Passthrough |
| 12 | Progress history chart | `snapshot-aggregation.ts` L744 | Persisted snapshot rows | PARTIAL | Chart shows a one-time drop at deploy date — no backfill needed |

**Vocabulary mastered** (`vocabulary.mastered` in `progress/[subjectId].tsx`, `vocabulary.tsx`, `vocabulary/[subjectId].tsx`) is a separate per-word boolean flag unrelated to topic mastery. Unaffected.

**Key rollout implications from this audit:**
- Snapshot-backed surfaces (4, 5, 6, 7, 11) update on the next snapshot generation — no migration needed.
- Already-persisted monthly reports (9) are frozen and will show the old (higher) count permanently. This is acceptable — reports are point-in-time documents.
- Growth chart (12) will show a visible discontinuity at deploy. No backfill — the drop itself is the honest signal.
- Milestone re-trigger (10) is benign — a child re-earning "5 topics mastered" badge is a positive event.

### 2. Card headline unification

**File:** `apps/mobile/src/components/progress/SubjectCard.tsx`

Replace the current 4-branch `getTopicHeadline()` with one consistent layout:

#### Collapsed card layout

```
Subject Name                              [CEFR badge]
N topics studied · M mastered
[████████░░░░░░░░]                                     ← mastered / total
1h 9m · 2 sessions                        ▾ See topics
```

#### Headline rules

| Condition | Headline |
|-----------|----------|
| Curriculum subject (`topics.total > 0`) | `"N topics studied · M mastered"` |
| Open-ended subject (`topics.total` is null) | `"N topics studied · M mastered"` |
| Sessions > 0 but topics = 0 (rare edge) | `"N sessions completed"` |

- "studied" count = `explored + inProgress + mastered` (all topics the child has touched in any way, after the 1B filter). This is the N in the headline. The word "studied" is deliberately chosen to avoid collision with the row-level label "Covered" (assessment passed but not yet retention-verified).
- "mastered" count = `topics.mastered` (retention-verified only, after the 1A fix). This is the M in the headline.
- Both numbers always shown together. When mastered is 0: `"3 topics studied · 0 mastered"`

#### Progress bar

- Curriculum subjects: `mastered / total`
- Open-ended subjects: hidden (no denominator)
- Sessions-only edge case: hidden

#### Bottom line

- Left: `"{time} · {sessions} sessions"` — always present, always in this format
- Right: `"▾ See topics"` when collapsed (only if expandable topics exist), `"▴ Hide topics"` when expanded

### 3. Empty subject filtering (parent view only)

**File:** `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`

Filter subjects before rendering:

```ts
inventory.subjects.filter(s =>
  s.sessionsCount > 0 || s.topics.explored > 0 || s.topics.inProgress > 0 || s.topics.mastered > 0
)
```

The expanded predicate catches edge cases where a subject has assessments or retention cards but no sessions (possible from legacy data or imports). `sessionsCount > 0 || topics.explored > 0` alone would hide those subjects incorrectly.

**Parent-only:** The child's own progress screen (`progress/index.tsx`) continues to show all enrolled subjects, because the child can act on them via the Explore/Continue/Review buttons.

### 4. Accordion expand/collapse (parent view only)

**File:** `apps/mobile/src/components/progress/SubjectCard.tsx`

#### Mode switching via props

Two mutually exclusive modes:

- **Accordion mode (parent):** Enabled when `childProfileId` + `subjectId` props are provided. Tap toggles expand/collapse. No `onPress`/`onAction`.
- **Navigation mode (child):** Enabled when `onPress` is provided. Tap navigates. No accordion. Current behavior unchanged.

#### State and animation

- `const [expanded, setExpanded] = useState(false)` — local per card
- `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)` before state flip
- Requires `UIManager.setLayoutAnimationEnabledExperimental?.(true)` in app init (not currently set up). This call is **Android-only** — guard with `Platform.OS === 'android'`. On iOS, `LayoutAnimation` works natively without this call; invoking it is a harmless no-op but adds confusion for reviewers.

#### Accessibility

The accordion trigger (`Pressable` wrapping the card) must include:

- `accessibilityRole="button"`
- `accessibilityState={{ expanded }}`
- `` accessibilityLabel={`${subject.name}, ${expanded ? 'expanded' : 'collapsed'}`} ``
- `accessibilityHint="Tap to show topics"`

These ensure screen readers announce the card's interactive nature and current state. When expanded, the topic list rows should each have `accessibilityRole="link"` since they navigate to the topic detail screen.

#### Parent dashboard changes

**File:** `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`

- Remove the `onPress` navigation handler for SubjectCard
- Pass `childProfileId={profileId}` and `subjectId={subject.subjectId}` instead
- The card is now self-contained — no external navigation for the subject level

### 5. Lazy topic loading

**Hook:** `useChildSubjectTopics(childProfileId, subjectId)` — existing hook, cached by React Query.

**Fetch strategy:** `enabled: expanded` — no fetch until first expand, instant on subsequent toggles from cache.

**Loading state:** 2-3 skeleton rows inside the expanded card area (reuse `TopicSkeleton` pattern from `[subjectId].tsx`).

**Error state:** Single line inside expanded area: `"Could not load topics. Tap to retry."` with retry pressable. Follows UX Resilience Rules (error + retry + escape path).

### 6. Inline topic list (expanded area)

Rendered below the progress bar / bottom line when expanded and topics are loaded.

#### Topic row layout

```
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  Algebra basics              In progress  ●●○
  Fractions                   Covered      ●○○
  Geometry                    Mastered     ●●●
  Quadratic equations         Not started
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
```

Each row contains:
- **Topic title** — left-aligned
- **Status label** — right-aligned (see mapping below)
- **Retention signal dots** — compact, from existing `RetentionSignal` component (`compact parentFacing` props). Only shown when `totalSessions >= 1` and status is not `not_started`.

#### Status label mapping

| DB state | Parent sees |
|----------|-------------|
| `completionStatus === 'not_started'` | Not started |
| `completionStatus === 'in_progress'`, no assessment | In progress |
| Assessment `passed`, `xpStatus !== 'verified'` | Covered |
| `xpStatus === 'verified'` | Mastered |
| `xpStatus === 'decayed'` | Needs review |

"Needs review" is shown when a previously-mastered topic has decayed after a failed recall. This is honest and actionable.

#### Topic row tap

Tapping a topic row navigates to the existing `child/[profileId]/topic/[topicId]` detail screen. That view is already built and stays unchanged.

#### Separator

A `border-t border-border` divider between the summary area and the topic list.

### 7. What stays unchanged

- **API endpoints** — no new routes, no schema changes to `SubjectInventory` or `TopicProgress`
- **`[subjectId].tsx` screen** — stays, still reachable from topic row taps
- **`[topicId]` detail screen** — untouched
- **Child's own progress view** — unaffected, keeps `onPress`/`onAction` behavior
- **Retention/assessment backend logic** — no changes to how mastery is computed or stored
- **Vocabulary display** — not part of this change

## Files touched

| File | Change |
|------|--------|
| `apps/api/src/services/snapshot-aggregation.ts` | Tighten `masteredTopicIds` in both `buildSubjectMetric` and `buildSubjectInventory`. Filter `exploredTopicIds` by qualifying sessions. |
| `apps/mobile/src/components/progress/SubjectCard.tsx` | Add accordion mode (expand/collapse state, lazy topic list, hint text). Unified headline logic. New props `childProfileId` + `subjectId`. Keep `onPress`/`onAction` for navigation mode. |
| `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` | Filter out inactive subjects. Replace `onPress` navigation with accordion props. |
| `apps/mobile/src/components/progress/SubjectCard.test.tsx` | Update headline tests. Add accordion expand/collapse tests. Add empty-filter tests. |
| App init (e.g., `_layout.tsx` or `app.tsx`) | Add `UIManager.setLayoutAnimationEnabledExperimental?.(true)` guarded by `Platform.OS === 'android'`. |

## Rollout & rollback

Mastered counts will decrease for existing users on deploy. This is a **display-only re-interpretation** of existing data — no migration, no data mutation. The `masteredTopicIds` computation reads assessment and retention-card rows that already exist; it simply stops counting assessment-passed-only topics as "mastered."

**Rollback:** Revert the two `masteredTopicIds` blocks in `snapshot-aggregation.ts` (sections 1A). No data loss, no migration reversal needed. Counts return to the previous (wider) definition immediately on next snapshot generation.

**Snapshot cache lag:** Snapshot-backed surfaces (dashboard pills, weekly pushes, growth charts) will show the new counts only after the next snapshot is generated for each child. This happens on every session end — no manual trigger needed. There is no way to get an inconsistent mix of old and new counts within the same parent dashboard view, because the dashboard reads a single snapshot row.

**Frozen reports:** Already-generated monthly reports in the `monthlyReports` table retain the old counts permanently. This is intentional — reports are point-in-time documents.

## Failure modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Topic fetch fails on expand | Network error, API down | "Could not load topics. Tap to retry." inside card | Tap to retry, collapse card |
| All subjects inactive | New child, no sessions yet | "No subjects yet" empty state (existing) | — |
| Topic decays after expand | Retention card fails between renders | Count updates on next inventory refresh | Stale for current view, correct on re-render |
| LayoutAnimation unavailable | Old Android, missing experimental flag | Card expands instantly (no animation) | Functional, just not animated |
| Topic fetch slow (>10 s) | Slow network | Skeleton rows persist, no hard timeout | Collapse + re-expand to retry; React Query retry handles transient failures |

## Verified by

| Change | Verified by |
|--------|-------------|
| `masteredTopicIds` tightening (1A) | `test: snapshot-aggregation.test.ts:"counts assessment-passed-only topic as inProgress, not mastered"` |
| `exploredTopicIds` session-gating (1B) | `test: snapshot-aggregation.test.ts:"excludes topic with zero exchanges from exploredTopicIds"` |
| Cross-surface count agreement | `test: snapshot-aggregation.test.ts:"buildSubjectMetric and buildSubjectInventory agree on masteredTopicIds"` |
| Accordion expand/collapse | `test: SubjectCard.test.tsx:"lazy-loads topics on first expand"` + `"toggles expanded state on tap"` |
| Empty-subject filter | `test: SubjectCard.test.tsx:"filters subjects with no sessions or topics"` + `"child view still shows empty subjects"` |
| Headline unification | `test: SubjectCard.test.tsx:"renders unified headline with studied and mastered counts"` |
| Accessibility attributes | `test: SubjectCard.test.tsx:"sets accessibilityRole and accessibilityState on accordion"` |
| Milestone re-trigger safety | `manual: verify milestone-detection.test.ts covers count-decrease scenario — no reverse-fire` |
