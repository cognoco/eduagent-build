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
| How to represent mastery? | Two-tier: "covered" + "mastered" | "Covered" = appeared in a qualifying session. "Mastered" = retention-verified only (xpStatus = 'verified'). Both shown together. |
| What counts as mastered? | Only `xpStatus === 'verified'` (Path B) | Requires 2+ successful spaced-repetition recalls over days. Assessment-passed alone (Path A) counts as "covered", not "mastered". |
| Empty subjects? | Hide entirely in parent view | Subjects with `sessionsCount === 0 AND topics.explored === 0` are not shown. They appear on first real session. |
| Topic detail disclosure? | Accordion expand inline | Card expands on tap to show topics. Lazy-loads via existing `useChildSubjectTopics` hook. |
| Child view impact? | None — accordion is parent-only | SubjectCard keeps existing `onPress`/`onAction` behavior when those props are provided. Accordion mode is opt-in via new props. |

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

### 2. Card headline unification

**File:** `apps/mobile/src/components/progress/SubjectCard.tsx`

Replace the current 4-branch `getTopicHeadline()` with one consistent layout:

#### Collapsed card layout

```
Subject Name                              [CEFR badge]
N topics covered · M mastered
[████████░░░░░░░░]                                     ← mastered / total
1h 9m · 2 sessions                        ▾ See topics
```

#### Headline rules

| Condition | Headline |
|-----------|----------|
| Curriculum subject (`topics.total > 0`) | `"N topics covered · M mastered"` |
| Open-ended subject (`topics.total` is null) | `"N topics covered · M mastered"` |
| Sessions > 0 but topics = 0 (rare edge) | `"N sessions completed"` |

- "covered" count = `explored + inProgress + mastered` (all topics the child has touched in any way, after the 1B filter). This is the N in the headline.
- "mastered" count = `topics.mastered` (retention-verified only, after the 1A fix). This is the M in the headline.
- Both numbers always shown together. When mastered is 0: `"3 topics covered · 0 mastered"`

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
inventory.subjects.filter(s => s.sessionsCount > 0 || s.topics.explored > 0)
```

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
- Requires `UIManager.setLayoutAnimationEnabledExperimental?.(true)` in app init (not currently set up)

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
| App init (e.g., `_layout.tsx` or `app.tsx`) | Add `UIManager.setLayoutAnimationEnabledExperimental?.(true)` for Android animation support. |

## Failure modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Topic fetch fails on expand | Network error, API down | "Could not load topics. Tap to retry." inside card | Tap to retry, collapse card |
| All subjects inactive | New child, no sessions yet | "No subjects yet" empty state (existing) | — |
| Topic decays after expand | Retention card fails between renders | Count updates on next inventory refresh | Stale for current view, correct on re-render |
| LayoutAnimation unavailable | Old Android, missing experimental flag | Card expands instantly (no animation) | Functional, just not animated |
