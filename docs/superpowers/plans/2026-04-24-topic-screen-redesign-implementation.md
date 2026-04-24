# Topic Screen Redesign — Status-First Orientation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `[bookId].tsx` from a flat chapter-list view into a 7-section status-first screen (Continue now → Started → Up next → Done → Later → Past conversations) that answers "done / doing / next" within the first half-screen on a 5.8" phone.

**Architecture:** A pure `computeUpNextTopic` function drives the "Up next" recommendation (same 4-rule precedence used by the backend default). A new `TopicStatusRow` component renders all status rows. `CollapsibleChapter` is trimmed to the Later section only. All new state is derived from the existing `topicStudiedIds` (retention) + `sessions` — no schema changes.

**Tech Stack:** React Native + NativeWind (className), `useThemeColors` for semantic tokens, TanStack React Query (existing hooks), TypeScript.

---

## Pre-Flight — Read Before Starting Task 1

These gates exist because a code review of this plan flagged risks that silently destroy work if skipped. Do them in order.

### Gate A — Branch

This plan is a ~700-line mobile redesign; do not execute it on top of unrelated fix branches. Confirm the branch with:

```bash
git status --short && git rev-parse --abbrev-ref HEAD
```

If the working tree has staged or modified files unrelated to this plan, or the branch name doesn't match the redesign scope (e.g., you're on `proxy-parent-fix`), stop and cut a fresh branch off `main` before Task 1.

### Gate B — Identifier Existence Check

The plan's Task 4 modifies `[bookId].tsx` surgically and assumes these identifiers exist with the names below. If any have been renamed since the plan was drafted, the task fails mid-edit with `ReferenceError` at runtime (per `feedback_adversarial_review_patterns.md`). Grep each before starting:

```bash
cd apps/mobile/src/app/\(app\)/shelf/\[subjectId\]/book
grep -nE "handleTopicPress|insets|CurriculumTopic|topicStudiedIds|completedTopicCount|generateMutation|hasCurriculum|isReadOnly|handleBuildLearningPath|sessionCount|subjectName|needsGeneration|autoStartTriggered|groupTopicsByChapter" \[bookId\].tsx
```

Every name above must resolve to at least one match. If any is missing: stop, reconcile the plan with current state, and amend Task 4 before proceeding.

### Gate C — Shape Verification for `topicStudiedIds`

Task 4 calls `topicStudiedIds.has(id)` repeatedly. If the retention hook returns an array (not a `Set`), every `.has` call throws. Confirm:

```bash
grep -n "topicStudiedIds" apps/mobile/src/app/\(app\)/shelf/\[subjectId\]/book/\[bookId\].tsx
grep -rn "topicStudiedIds" apps/mobile/src/hooks/
```

Expected: constructed as `new Set<string>(...)` or passed through as one.

### Gate D — Frontend/Backend Precedence Parity

`computeUpNextTopic` duplicates logic the backend already computes. **This plan proceeds with duplication as a known trade-off** to unblock the redesign, but the drift risk is real: first time the backend tweaks the rule (e.g., "skip `needsReview` topics"), the client disagrees silently.

Before merging, open a follow-up ticket to either:
- (a) Lift the rule into `@eduagent/schemas` or a shared package imported by both sides, or
- (b) Replace the client computation with a call to the existing backend recommendation endpoint.

Add the ticket URL here before checking this gate: `<TICKET-URL>`.

If you reach Task 8 without a ticket URL recorded above, **stop and file the ticket** — placeholders that survive merge become permanent debt. The ticket can be a one-line "follow-up: lift `computeUpNextTopic` rule into shared package or replace with backend endpoint" in your normal tracker.

### Gate E — Sentry Import + Cache Invalidation

Step 5.2 calls `Sentry.addBreadcrumb(...)` for the stale-topic-id failure mode. Confirm the import exists or add it before Task 5:

```bash
grep -n "@sentry/react-native\|from '@sentry" apps/mobile/src/app/\(app\)/shelf/\[subjectId\]/book/\[bookId\].tsx
```

If zero matches: add `import * as Sentry from '@sentry/react-native';` to the imports during Step 4.1 alongside the other new imports.

Cache invalidation: when a session completes, both `useBookSessions` and `useRetentionTopics` must invalidate so a topic transitions Continue now → Done without an app restart. Verify the session-completion mutation already does this:

```bash
grep -rn "invalidateQueries.*\(sessions\|retention\)" apps/mobile/src/hooks/ apps/mobile/src/app/
```

Expected: at least one match wiring both query keys to the session-completion mutation. If neither is wired, file a follow-up before merge — the redesign will look broken on first session completion (state is stale until refetch). This is a pre-existing concern, not introduced by this plan, but it's load-bearing for the redesign's perceived correctness.

---

## Failure Modes

Per global `~/.claude/CLAUDE.md` "Spec Failure Modes Before Coding," every screen state must have a visible action. This table covers the states that existed in the original plan only implicitly.

| State | Trigger | User sees | Recovery | Verified by |
|---|---|---|---|---|
| Sessions fetch fails | `useBookSessions` returns error | Inline banner: "Couldn't load your history. Retry." | Retry button + Later/Done still visible from retention data | Task 5b Step 5b.2 (`sessions-error-banner` JSX) + Task 8 Step 8.6b (`sessions-error-banner` test) |
| Retention fetch fails | `useRetentionTopics` returns error | Inline banner: "Couldn't load progress. Retry." | Retry button + Continue now/Started still visible from session data | Task 5b Step 5b.2 (`retention-error-banner` JSX) + Task 8 Step 8.6b (`retention-error-banner` test) |
| Topics array empty after filter | `topics.length === 0` but `topicsGenerated === true` | Empty state with CTA: "Build learning path" | `handleBuildLearningPath` | Task 5b Step 5b.3 (`topics-empty-state` JSX) + Task 8 Step 8.6b (`topics-empty-state` test) |
| All sections short-circuit | Every section's gate evaluates false (topics exist but no sessions, no retention, no upNext) | Fallback card: "Nothing to show yet. Start your first session." | Primary CTA starts session for first topic in book via `handleTopicStart` | Task 5b Step 5b.4 (`all-sections-fallback` JSX) + Task 8 Step 8.6b (`all-sections-fallback` test) |
| Stale `continueNowTopicId` | Topic referenced by session was deleted | Continue now section hidden, no error | Log to Sentry (not a user-facing fallback); user still sees Up next | Task 8 break test — session.topicId not in topics[], assert no crash + Sentry logged |
| Offline | `NetInfo.useNetInfo()` reports offline | Top banner: "You're offline — showing cached data" | Dismiss + retry on reconnect | Existing global offline banner (verify it's not masked by new sticky CTA) |
| Fully done, no Up next | All topics in `topicStudiedIds`, `upNextTopic === null` | "🎉 Book complete" card with "Start review" (primary) and "Back to shelf" (secondary); sticky CTA hidden so the card owns the action | "Start review" routes to spaced-repetition flow; "Back to shelf" routes to shelf screen (which handles next-book selection) | Task 4 `isBookComplete` memo + Task 6 Step 6.0 card + Task 7 `isBookComplete` CTA guard + Task 8 Step 8.8a break tests (card renders, card hides when incomplete, review-mode route) |

If you cannot satisfy a "Verified by" cell, the failure mode is unshipped — not "implicit."

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/mobile/src/lib/up-next-topic.ts` | **Create** | Pure function: 4-rule Up next precedence |
| `apps/mobile/src/lib/up-next-topic.test.ts` | **Create** | Tests for all 5 spec examples + edge cases |
| `apps/mobile/src/components/library/TopicStatusRow.tsx` | **Create** | Status row: dot + title + chapter + subtitle variants |
| `apps/mobile/src/components/library/TopicStatusRow.test.tsx` | **Create** | Row rendering tests for all 4 states + hero variant |
| `apps/mobile/src/components/library/CollapsibleChapter.tsx` | **Modify** | Strip to Later-only: new props, ○/◐ dots, "M / N not started" subtitle |
| `apps/mobile/src/components/library/CollapsibleChapter.test.tsx` | **Modify** | Updated tests for new prop signature |
| `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` | **Modify** | State derivation surgery + 7-section rendering |
| `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx` | **Modify** | New section-coverage tests |

---

## Task 1: `up-next-topic.ts` — Pure Up-Next Rule Function

**Files:**
- Create: `apps/mobile/src/lib/up-next-topic.ts`
- Create: `apps/mobile/src/lib/up-next-topic.test.ts`

- [ ] **Step 1.1: Write the failing tests**

```typescript
// apps/mobile/src/lib/up-next-topic.test.ts

import { computeUpNextTopic } from './up-next-topic';

type T = { id: string; chapter: string | null; sortOrder: number };
type S = { topicId: string | null; createdAt: string };

// Helper factories
const go = (n: number): T => ({ id: `go-${n}`, chapter: 'Grand Overview', sortOrder: n });
const gf = (n: number): T => ({ id: `gf-${n}`, chapter: 'Green Factories', sortOrder: 100 + n });
const sess = (topicId: string, ms = 0): S => ({ topicId, createdAt: new Date(ms).toISOString() });

describe('computeUpNextTopic', () => {
  describe('Rule 1 — momentum', () => {
    it('picks earliest unstarted in most-recent-session chapter', () => {
      const topics = [go(1), go(2), go(3), go(4), go(5), gf(1), gf(2), gf(3), gf(4)];
      const doneIds = new Set(['go-1', 'go-2', 'go-3']);
      const inProgressIds = new Set<string>();
      const sessions = [sess('go-3')];
      const result = computeUpNextTopic(topics, doneIds, inProgressIds, sessions);
      expect(result?.id).toBe('go-4');
    });

    it('overrides higher completion ratio — momentum wins', () => {
      // GO 2/5 (ratio 0.4), GF 2/4 (ratio 0.5), last session in GO → GO wins
      const topics = [go(1), go(2), go(3), go(4), go(5), gf(1), gf(2), gf(3), gf(4)];
      const doneIds = new Set(['go-1', 'go-2', 'gf-1', 'gf-2']);
      const inProgressIds = new Set<string>();
      const sessions = [sess('go-2', 2000), sess('gf-1', 1000)]; // GO most recent
      const result = computeUpNextTopic(topics, doneIds, inProgressIds, sessions);
      expect(result?.id).toBe('go-3');
    });

    it('last session in GF → GF wins over GO', () => {
      const topics = [go(1), go(2), go(3), go(4), go(5), gf(1), gf(2), gf(3), gf(4)];
      const doneIds = new Set(['go-1', 'go-2', 'gf-1', 'gf-2']);
      const inProgressIds = new Set<string>();
      const sessions = [sess('go-2', 1000), sess('gf-2', 2000)]; // GF most recent
      const result = computeUpNextTopic(topics, doneIds, inProgressIds, sessions);
      expect(result?.id).toBe('gf-3');
    });

    it('falls through to rule 2 when most-recent chapter is fully done', () => {
      // GO 5/5 (done), GF 1/4; last session in GO
      const topics = [go(1), go(2), go(3), go(4), go(5), gf(1), gf(2), gf(3), gf(4)];
      const doneIds = new Set(['go-1', 'go-2', 'go-3', 'go-4', 'go-5', 'gf-1']);
      const inProgressIds = new Set<string>();
      const sessions = [sess('go-5')];
      const result = computeUpNextTopic(topics, doneIds, inProgressIds, sessions);
      expect(result?.id).toBe('gf-2');
    });
  });

  describe('Rule 2 — highest partial completion', () => {
    it('picks chapter with highest completion ratio', () => {
      // GO 3/5 (0.6) vs GF 1/4 (0.25); no sessions
      const topics = [go(1), go(2), go(3), go(4), go(5), gf(1), gf(2), gf(3), gf(4)];
      const doneIds = new Set(['go-1', 'go-2', 'go-3', 'gf-1']);
      const inProgressIds = new Set<string>();
      const sessions: S[] = [];
      const result = computeUpNextTopic(topics, doneIds, inProgressIds, sessions);
      expect(result?.id).toBe('go-4');
    });
  });

  describe('Rule 3 — earliest uncompleted chapter', () => {
    it('returns first topic of earliest chapter when no sessions', () => {
      const topics = [go(1), go(2), gf(1), gf(2)]; // GO has lower sortOrder
      const doneIds = new Set<string>();
      const inProgressIds = new Set<string>();
      const sessions: S[] = [];
      const result = computeUpNextTopic(topics, doneIds, inProgressIds, sessions);
      expect(result?.id).toBe('go-1');
    });
  });

  describe('null-chapter edge cases', () => {
    it('does not conflate two null-chapter topics as momentum', () => {
      // Two unrelated uncategorized topics — session on one shouldn't
      // surface the other via Rule 1. Rule 3 (earliest uncompleted) wins.
      const topics: T[] = [
        { id: 'orphan-a', chapter: null, sortOrder: 1 },
        { id: 'orphan-b', chapter: null, sortOrder: 2 },
      ];
      const sessions = [sess('orphan-a')];
      // orphan-a is most-recent session topic. Since it has null chapter,
      // Rule 1 skips. Rule 2 skips (no partial chapters). Rule 3 returns
      // the earliest-sortOrder topic overall: orphan-a. But orphan-a is
      // not yet done/in-progress here so both are unstarted — Rule 3 picks
      // orphan-a by sortOrder.
      const result = computeUpNextTopic(topics, new Set(), new Set(), sessions);
      expect(result?.id).toBe('orphan-a');
    });
  });

  describe('edge cases', () => {
    it('returns null when all topics are done', () => {
      const topics = [go(1), go(2)];
      const doneIds = new Set(['go-1', 'go-2']);
      const result = computeUpNextTopic(topics, doneIds, new Set(), []);
      expect(result).toBeNull();
    });

    it('excludes in-progress topics from Up next candidates', () => {
      const topics = [go(1), go(2), go(3)];
      const doneIds = new Set<string>();
      const inProgressIds = new Set(['go-1']); // go-1 is in Continue now
      const sessions = [sess('go-1')];
      const result = computeUpNextTopic(topics, doneIds, inProgressIds, sessions);
      // go-1 is in-progress, go-2 is the next unstarted
      expect(result?.id).toBe('go-2');
    });

    it('returns null when all topics are done or in-progress', () => {
      const topics = [go(1), go(2)];
      const doneIds = new Set(['go-1']);
      const inProgressIds = new Set(['go-2']);
      const result = computeUpNextTopic(topics, doneIds, inProgressIds, []);
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="up-next-topic" --no-coverage
```

Expected: FAIL — `Cannot find module './up-next-topic'`

- [ ] **Step 1.3: Implement `computeUpNextTopic`**

```typescript
// apps/mobile/src/lib/up-next-topic.ts

type UpNextTopic = { id: string; chapter: string | null; sortOrder: number };
type UpNextSession = { topicId: string | null; createdAt: string };

// Null-chapter topics are bucketed per-topic so momentum doesn't conflate
// unrelated uncategorized topics. Non-null chapters share a bucket by name.
const chapterKey = <T extends UpNextTopic>(t: T): string =>
  t.chapter ?? `__no_chapter__::${t.id}`;

export function computeUpNextTopic<T extends UpNextTopic>(
  topics: T[],
  doneIds: Set<string>,
  inProgressIds: Set<string>,
  sessions: UpNextSession[]
): T | null {
  // Candidates: not done, not in-progress
  const unstarted = topics.filter(t => !doneIds.has(t.id) && !inProgressIds.has(t.id));
  if (unstarted.length === 0) return null;

  const byChapter = new Map<string, T[]>();
  for (const t of unstarted) {
    const key = chapterKey(t);
    const arr = byChapter.get(key) ?? [];
    arr.push(t);
    byChapter.set(key, arr);
  }

  const earliestIn = (arr: T[]): T =>
    arr.reduce((best, t) => (t.sortOrder < best.sortOrder ? t : best));

  // Rule 1: Momentum — most recent session's chapter
  const sorted = [...sessions]
    .filter(s => s.topicId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (sorted.length > 0) {
    const recentTopicId = sorted[0]!.topicId!;
    const recentTopic = topics.find(t => t.id === recentTopicId);
    if (recentTopic) {
      // Only do momentum matching when the recent topic has a real chapter.
      // Null-chapter recent topics don't have a shared group to fall back to.
      if (recentTopic.chapter !== null && recentTopic.chapter !== undefined) {
        const candidates = byChapter.get(recentTopic.chapter);
        if (candidates && candidates.length > 0) return earliestIn(candidates);
      }
    }
  }

  // Group ALL topics by chapter for completion ratio computation.
  // Completion ratio over null-chapter topics isn't meaningful, so skip them here.
  const allByChapter = new Map<string, T[]>();
  for (const t of topics) {
    if (t.chapter === null || t.chapter === undefined) continue;
    const key = t.chapter;
    const arr = allByChapter.get(key) ?? [];
    arr.push(t);
    allByChapter.set(key, arr);
  }

  // Rule 2: Highest partial completion (0 < ratio < 1) that still has unstarted topics
  let bestRatio = -1;
  let bestMinSort = Infinity;
  let rule2Key: string | null = null;
  for (const [key, chapterTopics] of allByChapter) {
    if (!byChapter.has(key)) continue;
    const doneCount = chapterTopics.filter(t => doneIds.has(t.id)).length;
    const total = chapterTopics.length;
    if (doneCount === 0 || doneCount === total) continue;
    const ratio = doneCount / total;
    const minSort = Math.min(...chapterTopics.map(t => t.sortOrder));
    if (ratio > bestRatio || (ratio === bestRatio && minSort < bestMinSort)) {
      bestRatio = ratio;
      bestMinSort = minSort;
      rule2Key = key;
    }
  }
  if (rule2Key !== null) return earliestIn(byChapter.get(rule2Key)!);

  // Rule 3: Earliest uncompleted chapter (by min sortOrder of its topics)
  let rule3MinSort = Infinity;
  let rule3Key: string | null = null;
  for (const [key, chapterTopics] of byChapter) {
    const minSort = Math.min(...chapterTopics.map(t => t.sortOrder));
    if (minSort < rule3MinSort) {
      rule3MinSort = minSort;
      rule3Key = key;
    }
  }
  if (rule3Key !== null) return earliestIn(byChapter.get(rule3Key)!);

  return null;
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="up-next-topic" --no-coverage
```

Expected: PASS — all 9 tests green

- [ ] **Step 1.5: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: no errors

- [ ] **Step 1.6: Commit**

```bash
git add apps/mobile/src/lib/up-next-topic.ts apps/mobile/src/lib/up-next-topic.test.ts
git commit -m "feat(mobile): up-next topic rule — 4-precedence pure function [TOPIC-REDESIGN]"
```

---

## Task 2: `TopicStatusRow` Component

**Files:**
- Create: `apps/mobile/src/components/library/TopicStatusRow.tsx`
- Create: `apps/mobile/src/components/library/TopicStatusRow.test.tsx`

- [ ] **Step 2.1: Write the failing tests**

```tsx
// apps/mobile/src/components/library/TopicStatusRow.test.tsx

import { render, fireEvent } from '@testing-library/react-native';
import { TopicStatusRow } from './TopicStatusRow';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#0088cc',
    success: '#22c55e',
    textSecondary: '#6b7280',
    border: '#e5e7eb',
  }),
}));

describe('TopicStatusRow', () => {
  const onPress = jest.fn();

  beforeEach(() => onPress.mockClear());

  it('renders continue-now state with correct testID and calls onPress', () => {
    const { getByTestId } = render(
      <TopicStatusRow
        state="continue-now"
        title="Linear Equations"
        chapterName="Grand Overview"
        onPress={onPress}
        testID="row-continue"
      />
    );
    const row = getByTestId('row-continue');
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders started state with session count subtitle', () => {
    const { getByText } = render(
      <TopicStatusRow
        state="started"
        title="Photosynthesis"
        chapterName="Green Factories"
        sessionCount={3}
        onPress={onPress}
      />
    );
    expect(getByText('Photosynthesis')).toBeTruthy();
    expect(getByText('3 sessions')).toBeTruthy();
    expect(getByText('Green Factories')).toBeTruthy();
  });

  it('renders up-next default state', () => {
    const { getByTestId } = render(
      <TopicStatusRow
        state="up-next"
        title="Cell Division"
        chapterName="Biology Basics"
        onPress={onPress}
        testID="row-up-next"
      />
    );
    expect(getByTestId('row-up-next')).toBeTruthy();
  });

  it('renders up-next hero variant with increased padding', () => {
    const { getByTestId } = render(
      <TopicStatusRow
        state="up-next"
        variant="hero"
        title="Cell Division"
        chapterName="Biology Basics"
        onPress={onPress}
        testID="row-up-next-hero"
      />
    );
    expect(getByTestId('row-up-next-hero')).toBeTruthy();
  });

  it('renders done state with chapter name as subtitle', () => {
    const { getByText } = render(
      <TopicStatusRow
        state="done"
        title="Algebra Basics"
        chapterName="Chapter 1"
        onPress={onPress}
      />
    );
    expect(getByText('Algebra Basics')).toBeTruthy();
    expect(getByText('Chapter 1')).toBeTruthy();
  });

  it('shows singular "1 session" text for sessionCount=1', () => {
    const { getByText } = render(
      <TopicStatusRow
        state="started"
        title="Topic"
        chapterName="Chapter"
        sessionCount={1}
        onPress={onPress}
      />
    );
    expect(getByText('1 session')).toBeTruthy();
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="TopicStatusRow" --no-coverage
```

Expected: FAIL — `Cannot find module './TopicStatusRow'`

- [ ] **Step 2.3: Implement `TopicStatusRow`**

State indicator mapping (using Text glyphs + semantic token backgrounds):
- `continue-now`: `●` in blue, pale teal row background, mint border
- `started`: `●` in slate/secondary, pale slate row background, slate border  
- `up-next`: `→` in gold/accent, pale gold row background, gold dashed border
- `done`: `✓` in success green, surface (white) background, no border

```tsx
// apps/mobile/src/components/library/TopicStatusRow.tsx

import { Pressable, Text, View } from 'react-native';
import { useThemeColors } from '../../lib/theme';

interface TopicStatusRowProps {
  state: 'continue-now' | 'started' | 'up-next' | 'done';
  variant?: 'hero';
  title: string;
  chapterName?: string;
  sessionCount?: number;
  onPress: () => void;
  testID?: string;
}

const DOT: Record<TopicStatusRowProps['state'], string> = {
  'continue-now': '●',
  started: '●',
  'up-next': '→',
  done: '✓',
};

const STATE_LABEL: Record<TopicStatusRowProps['state'], string> = {
  'continue-now': 'Continue now',
  started: 'Started',
  'up-next': 'Up next',
  done: 'Done',
};

export function TopicStatusRow({
  state,
  variant,
  title,
  chapterName,
  sessionCount,
  onPress,
  testID,
}: TopicStatusRowProps) {
  const colors = useThemeColors();
  const isHero = state === 'up-next' && variant === 'hero';

  const containerStyle = (() => {
    switch (state) {
      case 'continue-now':
        return {
          backgroundColor: `${colors.primary}10`,
          borderColor: `${colors.primary}40`,
          borderWidth: 1,
        };
      case 'started':
        return {
          backgroundColor: `${colors.textSecondary}10`,
          borderColor: `${colors.textSecondary}30`,
          borderWidth: 1,
        };
      case 'up-next':
        return {
          backgroundColor: `${colors.accent}10`,
          borderColor: colors.accent,
          borderWidth: isHero ? 2 : 1,
          borderStyle: 'dashed' as const,
        };
      case 'done':
        return {
          backgroundColor: colors.surfaceElevated ?? colors.surface,
          borderWidth: 0,
        };
    }
  })();

  const dotColor = (() => {
    switch (state) {
      case 'continue-now': return colors.primary;
      case 'started': return colors.textSecondary;
      case 'up-next': return colors.accent;
      case 'done': return colors.success;
    }
  })();

  const minHeight = isHero ? 72 : 44;
  const verticalPadding = isHero ? 16 : 12;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[
        containerStyle,
        { minHeight, paddingHorizontal: 16, paddingVertical: verticalPadding },
      ]}
      className="rounded-card mb-2"
      accessibilityRole="button"
      accessibilityLabel={`${STATE_LABEL[state]}: ${title}${chapterName ? ', ' + chapterName : ''}`}
    >
      <View className="flex-row items-start">
        {/* State dot — decorative, hidden from a11y tree (cross-platform) */}
        <Text
          style={{ color: dotColor, fontSize: 16, marginRight: 10, marginTop: 1 }}
          accessible={false}
          importantForAccessibility="no"
        >
          {DOT[state]}
        </Text>

        {/* Title + subtitle block */}
        <View className="flex-1">
          <View
            className={
              state === 'done' ? 'flex-row items-center justify-between' : undefined
            }
          >
            <Text
              className="text-body font-medium text-text-primary flex-1"
              numberOfLines={2}
            >
              {title}
            </Text>
            {/* Done: chapter name right-aligned inline */}
            {state === 'done' && chapterName && (
              <Text className="text-caption text-text-secondary ms-3 shrink-0">
                {chapterName}
              </Text>
            )}
          </View>

          {/* continue-now / up-next / started: chapter name as subtitle */}
          {state !== 'done' && chapterName && !isHero && (
            <Text className="text-caption text-text-secondary mt-0.5">
              {chapterName}
            </Text>
          )}

          {/* Hero: chapter name as larger subtitle */}
          {isHero && chapterName && (
            <Text className="text-body-sm text-text-secondary mt-1">
              {chapterName}
            </Text>
          )}

          {/* Started: session count */}
          {state === 'started' && sessionCount !== undefined && (
            <Text className="text-caption text-text-secondary mt-0.5">
              {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="TopicStatusRow" --no-coverage
```

Expected: PASS — all 6 tests green

- [ ] **Step 2.5: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 2.6: Commit**

```bash
git add apps/mobile/src/components/library/TopicStatusRow.tsx apps/mobile/src/components/library/TopicStatusRow.test.tsx
git commit -m "feat(mobile): TopicStatusRow — status-first row component [TOPIC-REDESIGN]"
```

---

## Task 3: Update `CollapsibleChapter` for Later-Only Role

**Files:**
- Modify: `apps/mobile/src/components/library/CollapsibleChapter.tsx`
- Modify: `apps/mobile/src/components/library/CollapsibleChapter.test.tsx`

The component's new role: render ONE collapsible Later chapter. Shows only unstarted topics (caller pre-filters). Chapter header now has ○/◐ dot + "M / N topics not started" subtitle.

Props removed: `completedCount`, `suggestedNextId`, `noteTopicIds`, `onNotePress`, `topicRetention`
Props added: `chapterState: 'untouched' | 'partial'`, `totalTopicCount: number`
Prop rename (internal): `topics` → received as `topics` but semantically "unstartedTopics"

- [ ] **Step 3.1: Update the tests first**

Open `apps/mobile/src/components/library/CollapsibleChapter.test.tsx` and replace its entire content:

```tsx
// apps/mobile/src/components/library/CollapsibleChapter.test.tsx

import { render, fireEvent } from '@testing-library/react-native';
import { CollapsibleChapter } from './CollapsibleChapter';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    success: '#22c55e',
    textSecondary: '#6b7280',
    primary: '#0088cc',
  }),
}));

const onTopicPress = jest.fn();

const topics = [
  { id: 't1', title: 'Cell Walls', sortOrder: 1, skipped: false },
  { id: 't2', title: 'Chloroplasts', sortOrder: 2, skipped: false },
];

describe('CollapsibleChapter (Later section)', () => {
  it('renders chapter name and "M / N topics not started" subtitle', () => {
    const { getByText } = render(
      <CollapsibleChapter
        title="Green Factories"
        topics={topics}
        totalTopicCount={5}
        chapterState="partial"
        initiallyExpanded={false}
        onTopicPress={onTopicPress}
      />
    );
    expect(getByText('Green Factories')).toBeTruthy();
    expect(getByText('2 / 5 not started')).toBeTruthy();
  });

  it('shows ○ dot for untouched chapter', () => {
    const { getByText } = render(
      <CollapsibleChapter
        title="Chapter A"
        topics={topics}
        totalTopicCount={2}
        chapterState="untouched"
        initiallyExpanded={false}
        onTopicPress={onTopicPress}
      />
    );
    expect(getByText('○')).toBeTruthy();
  });

  it('shows ◐ dot for partially-started chapter', () => {
    const { getByText } = render(
      <CollapsibleChapter
        title="Chapter B"
        topics={topics}
        totalTopicCount={4}
        chapterState="partial"
        initiallyExpanded={false}
        onTopicPress={onTopicPress}
      />
    );
    expect(getByText('◐')).toBeTruthy();
  });

  it('is collapsed by default when initiallyExpanded=false', () => {
    const { queryByText } = render(
      <CollapsibleChapter
        title="Chapter C"
        topics={topics}
        totalTopicCount={3}
        chapterState="untouched"
        initiallyExpanded={false}
        onTopicPress={onTopicPress}
      />
    );
    expect(queryByText('Cell Walls')).toBeNull();
  });

  it('expands when header is pressed and shows topic rows', () => {
    const { getByTestId, getByText } = render(
      <CollapsibleChapter
        title="Chapter D"
        topics={topics}
        totalTopicCount={2}
        chapterState="untouched"
        initiallyExpanded={false}
        onTopicPress={onTopicPress}
      />
    );
    fireEvent.press(getByTestId('chapter-header-Chapter D'));
    expect(getByText('Cell Walls')).toBeTruthy();
    expect(getByText('Chloroplasts')).toBeTruthy();
  });

  it('calls onTopicPress with topicId and title when a topic row is pressed', () => {
    onTopicPress.mockClear();
    const { getByTestId, getByText } = render(
      <CollapsibleChapter
        title="Chapter E"
        topics={topics}
        totalTopicCount={2}
        chapterState="untouched"
        initiallyExpanded={true}
        onTopicPress={onTopicPress}
      />
    );
    fireEvent.press(getByText('Cell Walls'));
    expect(onTopicPress).toHaveBeenCalledWith('t1', 'Cell Walls');
  });

  it('auto-expands when initiallyExpanded=true', () => {
    const { getByText } = render(
      <CollapsibleChapter
        title="Chapter F"
        topics={topics}
        totalTopicCount={2}
        chapterState="untouched"
        initiallyExpanded={true}
        onTopicPress={onTopicPress}
      />
    );
    expect(getByText('Cell Walls')).toBeTruthy();
  });
});
```

- [ ] **Step 3.2: Run tests to see current failures**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="CollapsibleChapter" --no-coverage
```

Expected: several FAIL — missing `totalTopicCount`, `chapterState` props; wrong subtitle text.

- [ ] **Step 3.3: Rewrite `CollapsibleChapter.tsx` with new prop signature**

```tsx
// apps/mobile/src/components/library/CollapsibleChapter.tsx

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

interface Topic {
  id: string;
  title: string;
  sortOrder: number;
  skipped: boolean;
}

interface CollapsibleChapterProps {
  title: string;
  topics: Topic[];         // Only the unstarted topics (caller pre-filters)
  totalTopicCount: number; // Total topics in chapter, for "M / N not started"
  chapterState: 'untouched' | 'partial';
  initiallyExpanded: boolean;
  onTopicPress: (topicId: string, topicName: string) => void;
}

export function CollapsibleChapter({
  title,
  topics,
  totalTopicCount,
  chapterState,
  initiallyExpanded,
  onTopicPress,
}: CollapsibleChapterProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const colors = useThemeColors();

  const sortedTopics = [...topics].sort((a, b) => a.sortOrder - b.sortOrder);
  const dot = chapterState === 'partial' ? '◐' : '○';

  return (
    <View className="mb-3">
      <Pressable
        testID={`chapter-header-${title}`}
        onPress={() => setExpanded((prev) => !prev)}
        className="flex-row items-center justify-between px-4 py-3 bg-surface-elevated rounded-card"
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${topics.length} of ${totalTopicCount} topics not started`}
        accessibilityState={{ expanded }}
      >
        <View className="flex-row items-center flex-1 me-2">
          <Text
            style={{ color: colors.textSecondary, marginRight: 8, fontSize: 14 }}
            accessible={false}
            importantForAccessibility="no"
          >
            {dot}
          </Text>
          <View className="flex-1">
            <Text className="text-body font-semibold text-text-primary">
              {title}
            </Text>
            <Text className="text-caption text-text-secondary">
              {topics.length} / {totalTopicCount} not started
            </Text>
          </View>
        </View>

        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={colors.textSecondary}
        />
      </Pressable>

      {expanded && (
        <View className="bg-surface-elevated rounded-card mt-1 overflow-hidden">
          {sortedTopics.map((topic) => (
            <Pressable
              key={topic.id}
              onPress={() => onTopicPress(topic.id, topic.title)}
              className="px-4 py-3 border-b border-border"
              accessibilityRole="button"
              accessibilityLabel={topic.title}
            >
              <Text className="text-body text-text-primary">{topic.title}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="CollapsibleChapter" --no-coverage
```

Expected: PASS — all 7 tests green

- [ ] **Step 3.5: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Note: `[bookId].tsx` will now have TypeScript errors because it passes the old `CollapsibleChapter` props. These are expected at this stage — fixed in Task 4.

- [ ] **Step 3.6: Commit**

```bash
git add apps/mobile/src/components/library/CollapsibleChapter.tsx apps/mobile/src/components/library/CollapsibleChapter.test.tsx
git commit -m "feat(mobile): CollapsibleChapter stripped to Later-only role — ○/◐ dots [TOPIC-REDESIGN]"
```

---

## Task 4: State Derivation Surgery in `[bookId].tsx`

**Files:**
- Modify: `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`

This task adds all new derived state, removes old state, and updates handlers. The render sections still reference old removed variables — they'll be replaced in Tasks 5–7. Do this in one surgical pass.

- [ ] **Step 4.1: Add new imports at the top of `[bookId].tsx`**

After the existing imports (after line 36), add:

```tsx
import { TopicStatusRow } from '../../../../../components/library/TopicStatusRow';
import { computeUpNextTopic } from '../../../../../lib/up-next-topic';
```

- [ ] **Step 4.2: Remove old state and replace with new derived state**

**Do not use line numbers to locate the block — they drift.** Find the region anchored by these two unique strings:

- **Start anchor** (inclusive): the line that contains `const completedTopicIds = useMemo`
- **End anchor** (inclusive): the closing `}, [...]);` of the `suggestedNextId` useMemo (search for `const suggestedNextId` and delete through the end of its `useMemo` call)

Verify with `grep -n "const completedTopicIds\|const suggestedNextId" apps/mobile/src/app/\(app\)/shelf/\[subjectId\]/book/\[bookId\].tsx` before editing — exactly one match per anchor. If either anchor is missing or duplicated, stop and reconcile with current file state.

Replace the entire anchored block with the following:

```tsx
  // --- New status-first state derivation ---

  // In-progress: has sessions but NOT yet done per retention
  const inProgressTopicIds = useMemo((): Set<string> => {
    return new Set<string>(
      sessions
        .filter((s) => s.topicId && !topicStudiedIds.has(s.topicId))
        .map((s) => s.topicId!)
    );
  }, [sessions, topicStudiedIds]);

  // Continue now: most-recent session's topic, if in-progress
  const continueNowTopicId = useMemo((): string | null => {
    const candidates = [...sessions]
      .filter((s) => s.topicId && inProgressTopicIds.has(s.topicId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return candidates[0]?.topicId ?? null;
  }, [sessions, inProgressTopicIds]);

  // Started: in-progress topics minus continueNow, sorted newest-session first
  const startedTopicIds = useMemo((): string[] => {
    const lastSession = new Map<string, string>();
    for (const s of sessions) {
      if (!s.topicId) continue;
      const existing = lastSession.get(s.topicId);
      if (!existing || s.createdAt > existing) lastSession.set(s.topicId, s.createdAt);
    }
    return [...inProgressTopicIds]
      .filter((id) => id !== continueNowTopicId)
      .sort((a, b) => (lastSession.get(b) ?? '').localeCompare(lastSession.get(a) ?? ''));
  }, [sessions, inProgressTopicIds, continueNowTopicId]);

  // Session count per topic — O(sessions) total
  const sessionCountByTopicId = useMemo((): Map<string, number> => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      if (!s.topicId) continue;
      map.set(s.topicId, (map.get(s.topicId) ?? 0) + 1);
    }
    return map;
  }, [sessions]);

  // Topic lookup map
  const topicById = useMemo((): Map<string, CurriculumTopic> => {
    const map = new Map<string, CurriculumTopic>();
    for (const t of topics) map.set(t.id, t);
    return map;
  }, [topics]);

  // Done: topics in topicStudiedIds, sorted by most-recent-session desc
  const doneTopics = useMemo((): CurriculumTopic[] => {
    const lastSession = new Map<string, string>();
    for (const s of sessions) {
      if (!s.topicId) continue;
      const existing = lastSession.get(s.topicId);
      if (!existing || s.createdAt > existing) lastSession.set(s.topicId, s.createdAt);
    }
    return topics
      .filter((t) => topicStudiedIds.has(t.id))
      .sort(
        (a, b) =>
          (lastSession.get(b.id) ?? '').localeCompare(lastSession.get(a.id) ?? '') ||
          a.sortOrder - b.sortOrder
      );
  }, [topics, topicStudiedIds, sessions]);

  // Up next: frontend computation (4-rule precedence from spec)
  const upNextTopic = useMemo(
    () => computeUpNextTopic(topics, topicStudiedIds, inProgressTopicIds, sessions),
    [topics, topicStudiedIds, inProgressTopicIds, sessions]
  );

  // Later: chapters with at least one unstarted topic
  const laterChapters = useMemo(() => {
    const allGrouped = groupTopicsByChapter(topics);
    return allGrouped
      .map((group) => {
        const unstartedTopics = group.topics.filter(
          (t) => !topicStudiedIds.has(t.id) && !inProgressTopicIds.has(t.id) && !t.skipped
        );
        if (unstartedTopics.length === 0) return null;
        const hasProgress = group.topics.some(
          (t) => topicStudiedIds.has(t.id) || inProgressTopicIds.has(t.id)
        );
        return {
          chapter: group.chapter,
          unstartedTopics,
          totalTopicCount: group.topics.length,
          chapterState: (hasProgress ? 'partial' : 'untouched') as 'partial' | 'untouched',
        };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null);
  }, [topics, topicStudiedIds, inProgressTopicIds]);

  const totalLaterTopics = laterChapters.reduce((sum, c) => sum + c.unstartedTopics.length, 0);
  const autoExpandLater = laterChapters.length <= 3 && totalLaterTopics <= 12;

  // Book-complete: every topic is in topicStudiedIds. Triggers the
  // completion card + review-flow CTA instead of re-teaching topic 1.
  // See Failure Modes row "Fully done, no Up next".
  const isBookComplete = useMemo(
    () => topics.length > 0 && topics.every((t) => topicStudiedIds.has(t.id)),
    [topics, topicStudiedIds]
  );

  // Expander state for Done (>8 collapse) and Started (>4 collapse)
  const [showAllDone, setShowAllDone] = useState(false);
  const [showAllStarted, setShowAllStarted] = useState(false);
```

> **Module-scope thresholds** — add these above the component, not inside it (they're constants, not state):
>
> ```tsx
> const DONE_COLLAPSE_THRESHOLD = 8;
> const STARTED_COLLAPSE_THRESHOLD = 4;
> ```

- [ ] **Step 4.3: Remove `groupedChapters` (replaced by `laterChapters`) and update handlers**

Remove this line (around current line 311):
```tsx
  const groupedChapters = useMemo(() => groupTopicsByChapter(topics), [topics]);
```

Also remove these three blocks (approximately lines 327–367):
- `suggestionCards` useMemo
- `suggestedNextId` useMemo

Update `handleStartLearning` (around line 458) to use the new state:

```tsx
  const handleStartLearning = useCallback(() => {
    // CTA priority order: continueNow → upNext → newest Started
    if (continueNowTopicId) {
      const topic = topicById.get(continueNowTopicId);
      if (topic) {
        router.push({
          pathname: '/(app)/topic/[topicId]',
          params: { topicId: topic.id, subjectId },
        } as never);
        return;
      }
    }
    if (upNextTopic) {
      router.push({
        pathname: '/(app)/session',
        params: {
          mode: 'learning',
          subjectId,
          topicId: upNextTopic.id,
          topicName: upNextTopic.title,
        },
      } as never);
      return;
    }
    if (startedTopicIds.length > 0) {
      const newestStartedId = startedTopicIds[0]!;
      const topic = topicById.get(newestStartedId);
      if (topic) {
        router.push({
          pathname: '/(app)/topic/[topicId]',
          params: { topicId: topic.id, subjectId },
        } as never);
      }
    }
  }, [continueNowTopicId, upNextTopic, startedTopicIds, topicById, router, subjectId]);
```

Add a new `handleTopicStart` for the Up next row tap (starts a session directly):

```tsx
  const handleTopicStart = useCallback(
    (topicId: string, topicTitle: string) => {
      router.push({
        pathname: '/(app)/session',
        params: { mode: 'learning', subjectId, topicId, topicName: topicTitle },
      } as never);
    },
    [router, subjectId]
  );
```

Add `handleStartReview` and `handleNextBook` for the completion card. The review entry point depends on the existing retention/review flow — verify the route before coding:

```bash
grep -rn "mode.*review\|/review/\|retention-review" apps/mobile/src/app/ | head -5
```

Expected: the project already has a review flow (per `project_language_pedagogy.md` — spaced repetition is live). Use the discovered route. If no dedicated review flow exists yet, gate the "Start review" button behind a feature flag and fall back to hiding it (per `feedback_never_force_add_child.md`-style optionality).

```tsx
  const handleStartReview = useCallback(() => {
    router.push({
      pathname: '/(app)/session',
      params: { mode: 'review', subjectId, bookId },
    } as never);
  }, [router, subjectId, bookId]);

  const handleNextBook = useCallback(() => {
    // Navigate back to the subject shelf — the shelf screen is responsible
    // for highlighting the next book. We don't compute "next book" here
    // because that's a shelf-level concern (ordering, completion state,
    // locked books) and would duplicate shelf logic.
    router.push({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId },
    } as never);
  }, [router, subjectId]);
```

Remove `handleSuggestionPress` (no longer needed — Study next cards are removed).

Update the `autoStart` effect to use `continueNowTopicId || upNextTopic` and fix its dep array (the current code references `needsGeneration` and `generateMutation.isPending` inside the effect but omits them from deps — a stale-closure bug that `react-hooks/exhaustive-deps` will flag under lint):

```tsx
  useEffect(() => {
    if (
      autoStart === 'true' &&
      !autoStartTriggered.current &&
      !needsGeneration &&
      !generateMutation.isPending &&
      topics.length > 0
    ) {
      autoStartTriggered.current = true;
      handleStartLearning();
    }
  }, [autoStart, topics, needsGeneration, generateMutation.isPending, handleStartLearning]);
```

- [ ] **Step 4.4: Typecheck (expect some render errors, state is fixed)**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | head -40
```

Expected: errors in the render JSX (references to `suggestionCards`, `groupedChapters`, `suggestedNextId`, old CollapsibleChapter props). State-layer errors should be zero. Render errors are fixed in Tasks 5–7.

- [ ] **Step 4.5: Do not commit yet — working tree is broken until Task 7**

Tasks 4–7 together rewrite `[bookId].tsx`. Between them the file does not typecheck. **Do not commit, push, or run unrelated git operations during this window.**

If you must pause work between Task 4 and Task 7, stash the broken file to a named stash so Husky pre-commit doesn't fail on unrelated commits:

```bash
# Stash the broken file only — per feedback_stash_untracked_protection.md, include -u
git stash push --keep-index -u -m "topic-redesign-task4-wip" \
  apps/mobile/src/app/\(app\)/shelf/\[subjectId\]/book/\[bookId\].tsx
```

Resume with `git stash pop`. The full `[bookId].tsx` rewrite commits at the end of Task 7.

---

## Task 5: Header + Continue now + Started + Up next Sections

**Files:**
- Modify: `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`

Replace the render sections inside the `<ScrollView>` starting from the "Book info" block down through the old CollapsibleChapter "Topics" block.

- [ ] **Step 5.1: Update the Header (book info) section**

Find the current "Book info" block (lines ~753–801) and replace it:

```tsx
        {/* Book info — compact header */}
        <View className="px-5 pb-3">
          <View className="flex-row items-center mb-1">
            {book?.emoji && <Text className="text-3xl me-3">{book.emoji}</Text>}
            <View className="flex-1">
              <Text className="text-h2 font-bold text-text-primary" numberOfLines={2}>
                {book?.title ?? 'Book'}
              </Text>
              {subjectName && (
                <Text className="text-body-sm text-text-secondary mt-0.5">
                  {subjectName}
                </Text>
              )}
            </View>
          </View>

          {/* Compact stats row */}
          <Text className="text-caption text-text-secondary mt-2">
            {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
          </Text>

          {/* Progress bar — derive from topicStudiedIds (single source of truth).
              Don't mix with completedTopicCount: they can desync while retention
              invalidates after a session completes. */}
          {topics.length > 0 && (() => {
            const doneCount = doneTopics.length;
            return (
              <View className="mt-2">
                <View className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                  <View
                    className="h-full bg-success rounded-full"
                    style={{ width: `${Math.min(100, (doneCount / topics.length) * 100)}%` }}
                  />
                </View>
                <Text className="text-caption text-text-secondary mt-1">
                  {doneCount} of {topics.length} topics done
                </Text>
              </View>
            );
          })()}
        </View>
```

- [ ] **Step 5.2: Replace the "Study next cards" block with the "Continue now" section**

Find and delete the old Study next block (lines ~804–821):
```tsx
        {/* Study next suggestions — max 2 cards */}
        {suggestionCards.length > 0 && ( ... )}
```

Replace with:

First, add a `continueNowTopic` memo near the other derived state (so we render without an IIFE and also log a Sentry breadcrumb if the session references a deleted topic — per the Failure Modes table):

```tsx
  const continueNowTopic = useMemo(() => {
    if (!continueNowTopicId) return null;
    const topic = topicById.get(continueNowTopicId) ?? null;
    if (!topic) {
      // Stale session reference — log but don't crash
      Sentry.addBreadcrumb({
        category: 'topic-screen',
        level: 'warning',
        message: 'continueNowTopicId references missing topic',
        data: { topicId: continueNowTopicId },
      });
    }
    return topic;
  }, [continueNowTopicId, topicById]);
```

Then the Continue now section is a plain conditional (no IIFE):

```tsx
        {/* ── Section 2: Continue now ── */}
        {continueNowTopic && (
          <View className="px-5 mb-1">
            <Text className="text-body-sm font-semibold text-text-secondary mb-2">
              Continue now
            </Text>
            <TopicStatusRow
              state="continue-now"
              title={continueNowTopic.title}
              chapterName={continueNowTopic.chapter ?? undefined}
              onPress={() => handleTopicPress(continueNowTopic.id)}
              testID="continue-now-row"
            />
          </View>
        )}

        {/* ── Section 3: Started ── */}
        {startedTopicIds.length > 0 && (
          <View className="px-5 mb-1">
            <Text className="text-body-sm font-semibold text-text-secondary mb-2">
              Started
            </Text>
            {(showAllStarted
              ? startedTopicIds
              : startedTopicIds.slice(0, STARTED_COLLAPSE_THRESHOLD)
            ).map((topicId) => {
              const topic = topicById.get(topicId);
              if (!topic) return null;
              return (
                <TopicStatusRow
                  key={topicId}
                  state="started"
                  title={topic.title}
                  chapterName={topic.chapter ?? undefined}
                  sessionCount={sessionCountByTopicId.get(topicId) ?? 0}
                  onPress={() => handleTopicPress(topicId)}
                  testID={`started-row-${topicId}`}
                />
              );
            })}
            {!showAllStarted && startedTopicIds.length > STARTED_COLLAPSE_THRESHOLD && (
              <Pressable
                onPress={() => setShowAllStarted(true)}
                className="py-2 items-center"
                testID="started-show-more"
                accessibilityRole="button"
              >
                <Text className="text-body-sm text-primary font-semibold">
                  Show {startedTopicIds.length - STARTED_COLLAPSE_THRESHOLD} more started
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ── Section 4: Up next ──
            Chapter subtitle is suppressed when the book has only one chapter
            (derived, not string-matched against book.title — whitespace/casing
            differences would otherwise leak the subtitle back in). */}
        {upNextTopic && (() => {
          const distinctChapters = new Set(
            topics.map((t) => t.chapter).filter((c): c is string => !!c)
          );
          const isSingleChapterBook = distinctChapters.size <= 1;
          return (
            <View className="px-5 mb-1">
              <Text className="text-body-sm font-semibold text-text-secondary mb-2">
                Up next
              </Text>
              <TopicStatusRow
                state="up-next"
                variant={sessionCount === 0 ? 'hero' : undefined}
                title={upNextTopic.title}
                chapterName={isSingleChapterBook ? undefined : (upNextTopic.chapter ?? undefined)}
                onPress={() => handleTopicStart(upNextTopic.id, upNextTopic.title)}
                testID="up-next-row"
              />
            </View>
          );
        })()}
```

- [ ] **Step 5.3: Delete the old "Topics section" CollapsibleChapter block**

Find and delete the old Topics section (approximately lines 823–846):
```tsx
        {/* Chapter / topic list — always visible once topics are loaded */}
        {groupedChapters.length > 0 && !needsGeneration && (
          <View className="px-5 mb-4">
            ...CollapsibleChapter for each group...
          </View>
        )}
```

Delete this entire block. It is replaced by the new sections added in Steps 5.2 and Task 6.

- [ ] **Step 5.4: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | head -30
```

Expected: fewer errors than before — `suggestionCards`, `groupedChapters`, `suggestedNextId` errors should be gone. Remaining errors: old CollapsibleChapter call sites in later render sections (fixed in Task 6).

---

## Task 5b: Error Banners + Empty/Fallback States

**Files:**
- Modify: `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`

This task implements the four failure-mode rows from the table that earlier drafts only listed without code: sessions error, retention error, empty topics, all-sections-short-circuit. Without these, the Self-Review's "Verified by" cells lie.

- [ ] **Step 5b.1: Expose `isError` + `refetch` from existing query objects**

The existing `sessionsQuery` and `retentionTopicsQuery` already carry these — they just aren't destructured. Find the lines that read sessions / retention data (around the existing `sessionsQuery.data` / `retentionTopicsQuery.data` usage) and add bindings near the top of the component, after the existing query declarations:

```tsx
  const sessionsError = sessionsQuery.isError;
  const retentionError = retentionTopicsQuery.isError;
  const refetchSessions = sessionsQuery.refetch;
  const refetchRetention = retentionTopicsQuery.refetch;
```

Verify with:
```bash
grep -n "sessionsQuery\.\|retentionTopicsQuery\." apps/mobile/src/app/\(app\)/shelf/\[subjectId\]/book/\[bookId\].tsx
```

- [ ] **Step 5b.2: Insert the two error banners**

Insert immediately after the header block (after Step 5.1's "Compact stats row" closes), **before** the Continue now section. Banners are sticky-positioned in scroll order, not at the top of the viewport — they stay attached to the data they describe so users see Later/Done first when sessions fail (and vice-versa).

```tsx
        {/* ── Error banners — surface fetch failures inline ── */}
        {sessionsError && (
          <View className="px-5 mb-3" testID="sessions-error-banner">
            <View
              className="rounded-card p-3 flex-row items-center justify-between"
              style={{
                backgroundColor: `${themeColors.error}10`,
                borderColor: themeColors.error,
                borderWidth: 1,
              }}
            >
              <Text className="text-body-sm text-text-primary flex-1 me-3">
                Couldn't load your history.
              </Text>
              <Pressable
                onPress={() => refetchSessions()}
                testID="sessions-error-retry"
                accessibilityRole="button"
                accessibilityLabel="Retry loading session history"
                className="px-3 py-1"
              >
                <Text className="text-body-sm font-semibold text-primary">Retry</Text>
              </Pressable>
            </View>
          </View>
        )}

        {retentionError && (
          <View className="px-5 mb-3" testID="retention-error-banner">
            <View
              className="rounded-card p-3 flex-row items-center justify-between"
              style={{
                backgroundColor: `${themeColors.error}10`,
                borderColor: themeColors.error,
                borderWidth: 1,
              }}
            >
              <Text className="text-body-sm text-text-primary flex-1 me-3">
                Couldn't load progress.
              </Text>
              <Pressable
                onPress={() => refetchRetention()}
                testID="retention-error-retry"
                accessibilityRole="button"
                accessibilityLabel="Retry loading progress"
                className="px-3 py-1"
              >
                <Text className="text-body-sm font-semibold text-primary">Retry</Text>
              </Pressable>
            </View>
          </View>
        )}
```

These banners render in addition to whatever sections still have data. Per the Failure Modes recovery column: when sessions fail, Later + Done still render from retention; when retention fails, Continue now + Started still render from sessions. **Do not** swap them for a full-screen error — degraded data is more useful than no data.

- [ ] **Step 5b.3: Insert the empty-topics state**

Insert after the error banners and **before** Continue now. This handles `topicsGenerated === true && topics.length === 0` — the path where generation succeeded but produced nothing usable (rare but possible after a curriculum reset).

```tsx
        {/* ── Empty state: topics generated but array is empty ── */}
        {topics.length === 0 && book?.topicsGenerated && !needsGeneration && (
          <View className="px-5 py-8" testID="topics-empty-state">
            <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
              No topics yet
            </Text>
            <Text className="text-body-sm text-text-secondary text-center mb-4">
              This book doesn't have any learning topics. Build a learning path to get started.
            </Text>
            <Pressable
              onPress={handleBuildLearningPath}
              className="bg-primary rounded-button px-5 py-3 self-center min-h-[48px] items-center justify-center"
              testID="topics-empty-build"
              accessibilityRole="button"
              accessibilityLabel="Build a learning path"
            >
              <Text className="text-body font-semibold text-text-inverse">
                Build learning path
              </Text>
            </Pressable>
          </View>
        )}
```

The existing `needsGeneration` branch (which prompts to generate from scratch) takes precedence — this empty state only fires when generation already ran but yielded zero topics.

- [ ] **Step 5b.4: Insert the all-sections-fallback card**

Insert after the Up next section (Step 5.2) and **before** the Done section (Task 6, Step 6.1). This catches the corner case where topics exist, none are done, none are in-progress, and `upNextTopic` somehow returned null (e.g., all topics filtered out by `skipped`).

```tsx
        {/* ── Fallback: every section short-circuited but topics exist ── */}
        {topics.length > 0 &&
          !isBookComplete &&
          !continueNowTopic &&
          startedTopicIds.length === 0 &&
          !upNextTopic &&
          doneTopics.length === 0 &&
          laterChapters.length === 0 && (
            <View className="px-5 mb-3" testID="all-sections-fallback">
              <View className="rounded-card p-5 bg-surface-elevated">
                <Text className="text-body font-semibold text-text-primary mb-2">
                  Nothing to show yet.
                </Text>
                <Text className="text-body-sm text-text-secondary mb-3">
                  Start your first session to see your progress here.
                </Text>
                <Pressable
                  onPress={() => {
                    const fallback = topics[0];
                    if (fallback) handleTopicStart(fallback.id, fallback.title);
                  }}
                  className="bg-primary rounded-button px-5 py-3 flex-row items-center justify-center min-h-[48px]"
                  testID="fallback-start"
                  accessibilityRole="button"
                  accessibilityLabel="Start first session"
                >
                  <Text className="text-body font-semibold text-text-inverse">
                    ▶ Start first session
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
```

This block guards against logic drift in `computeUpNextTopic` — if a future edit makes Up next return null in cases the spec didn't anticipate, the user still has a tap-target instead of a blank screen.

- [ ] **Step 5b.5: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | head -20
```

Expected: zero new errors from Task 5b. Pre-existing errors from old CollapsibleChapter call sites still present (fixed in Task 6).

- [ ] **Step 5b.6: Do not commit** — same constraint as Task 4 / 5: working tree commits at end of Task 7.

---

## Task 6: Book-Complete Card + Done + Later Sections

**Files:**
- Modify: `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`

Insert the Book-complete card, Done section, and Later section immediately before the existing "Session list error state" block. Locate the anchor with:

```bash
grep -n "Session list error state\|Past sessions\|Past conversations" apps/mobile/src/app/\(app\)/shelf/\[subjectId\]/book/\[bookId\].tsx
```

Insert the card FIRST (above Done) so a fully-completed book leads with celebration + next action rather than a sea of Done rows.

- [ ] **Step 6.0: Add the Book-complete card**

This renders only when `isBookComplete` is true. It takes the visual slot that Continue now / Started / Up next would occupy (sections 2–4) — those all short-circuit when everything is done, so there's no conflict.

```tsx
        {/* ── Book complete ── */}
        {isBookComplete && (
          <View className="px-5 mb-3" testID="book-complete-card">
            <View
              className="rounded-card p-5 bg-surface-elevated"
              style={{ borderColor: themeColors.success, borderWidth: 1 }}
              accessibilityRole="summary"
              accessibilityLabel={`${book?.title ?? 'Book'} complete. ${topics.length} topics studied.`}
            >
              <Text className="text-3xl mb-2" accessible={false} importantForAccessibility="no">
                🎉
              </Text>
              <Text className="text-h3 font-bold text-text-primary mb-1">
                Book complete
              </Text>
              <Text className="text-body-sm text-text-secondary mb-4">
                You've studied all {topics.length} topics in this book. Keep them fresh with review, or move on to the next book.
              </Text>

              <Pressable
                onPress={handleStartReview}
                className="bg-primary rounded-button px-5 py-3 flex-row items-center justify-center min-h-[48px] mb-2"
                testID="book-complete-review"
                accessibilityRole="button"
                accessibilityLabel="Start spaced-repetition review"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  ▶ Start review
                </Text>
              </Pressable>

              <Pressable
                onPress={handleNextBook}
                className="py-2 items-center"
                testID="book-complete-next"
                accessibilityRole="button"
                accessibilityLabel="Back to shelf to pick next book"
              >
                <Text className="text-body-sm text-primary font-semibold">
                  Back to shelf →
                </Text>
              </Pressable>
            </View>
          </View>
        )}
```

**Important — hide the sticky CTA when `isBookComplete` is true.** The Task 7 sticky CTA block must gain a guard: `if (isBookComplete) return null;` alongside the existing hidden-state check. Otherwise the card's "Start review" and the sticky "Continue learning" would double up. This is wired in the Step 7.1 update below — don't forget to apply it when you reach Task 7.

- [ ] **Step 6.1: Add Done section**

Insert after the Up next section (from Task 5) and before the sessions error block:

```tsx
        {/* ── Section 5: Done ── */}
        {doneTopics.length > 0 && (
          <View className="px-5 mb-1">
            <Text className="text-body-sm font-semibold text-text-secondary mb-2">
              Done
            </Text>
            {(doneTopics.length <= DONE_COLLAPSE_THRESHOLD || showAllDone
              ? doneTopics
              : doneTopics.slice(0, DONE_COLLAPSE_THRESHOLD)
            ).map((topic) => (
              <TopicStatusRow
                key={topic.id}
                state="done"
                title={topic.title}
                chapterName={topic.chapter ?? undefined}
                onPress={() => handleTopicPress(topic.id)}
                testID={`done-row-${topic.id}`}
              />
            ))}
            {doneTopics.length > DONE_COLLAPSE_THRESHOLD && !showAllDone && (
              <Pressable
                onPress={() => setShowAllDone(true)}
                className="py-2 items-center"
                testID="done-show-all"
                accessibilityRole="button"
              >
                <Text className="text-body-sm text-primary font-semibold">
                  Show all {doneTopics.length} done
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ── Section 6: Later ── */}
        {laterChapters.length > 0 && (
          <View className="px-5 mb-1">
            <Text className="text-body-sm font-semibold text-text-secondary mb-2">
              Later
            </Text>
            {laterChapters.map((group) => (
              <CollapsibleChapter
                key={group.chapter}
                title={group.chapter}
                topics={group.unstartedTopics}
                totalTopicCount={group.totalTopicCount}
                chapterState={group.chapterState}
                initiallyExpanded={autoExpandLater}
                onTopicPress={handleTopicPress}
              />
            ))}
          </View>
        )}
```

- [ ] **Step 6.2: Update "Past conversations" section heading** (section 7)

Find the current "Past sessions" heading (line ~873) and rename:
```tsx
            Past conversations
```
(No structural change — heading text only.)

- [ ] **Step 6.3: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: zero errors (all removed variables are now gone, new ones are in place, CollapsibleChapter new props are satisfied).

---

## Task 7: Sticky CTA Update

**Files:**
- Modify: `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`

- [ ] **Step 7.1: Replace the sticky CTA block**

Find the floating CTA block (lines ~1048–1095) and replace with:

```tsx
      {/* ── Sticky CTA — adapts to learner state ── */}
      {topics.length > 0 && !isReadOnly && (() => {
        // Determine CTA state
        const hasContinue = !!continueNowTopicId;
        const hasUpNext = !!upNextTopic;
        const hasStarted = startedTopicIds.length > 0;

        // Hidden when book is complete — the Book-complete card from Task 6
        // owns the primary action (review / next book) in that state.
        if (isBookComplete) return null;

        // Hidden when book fully done with no suggestion
        if (!hasContinue && !hasUpNext && !hasStarted) return null;

        let label: string;
        if (hasContinue) {
          label = '▶ Continue learning';
        } else if (hasUpNext) {
          const truncated =
            upNextTopic!.title.length > 25
              ? upNextTopic!.title.slice(0, 24) + '…'
              : upNextTopic!.title;
          label = `▶ Start: ${truncated}`;
        } else {
          const newestTopic = topicById.get(startedTopicIds[0]!);
          const name = newestTopic?.title ?? '';
          const truncated = name.length > 25 ? name.slice(0, 24) + '…' : name;
          label = `▶ Resume: ${truncated}`;
        }

        return (
          <View
            className="absolute bottom-0 left-0 right-0 px-5 bg-background border-t border-border"
            style={{ paddingBottom: Math.max(insets.bottom, 16), paddingTop: 12 }}
          >
            <Pressable
              onPress={handleStartLearning}
              className="bg-primary rounded-button px-5 py-4 flex-row items-center justify-center min-h-[48px]"
              testID="book-start-learning"
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Text className="text-body font-semibold text-text-inverse">
                {label}
              </Text>
            </Pressable>
            {!hasCurriculum && !isReadOnly && (
              <Pressable
                onPress={handleBuildLearningPath}
                className="mt-2 py-2 items-center"
                testID="book-build-path-link"
                accessibilityRole="button"
                accessibilityLabel="Build a learning path"
              >
                <Text className="text-body-sm text-text-secondary underline">
                  Build a learning path
                </Text>
              </Pressable>
            )}
          </View>
        );
      })()}
```

- [ ] **Step 7.2: Remove the `SuggestionCard` import AND delete the component if orphaned**

Delete the line:
```tsx
import { SuggestionCard } from '../../../../../components/library/SuggestionCard';
```

Then check whether `SuggestionCard` has any other callers:

```bash
grep -rn "SuggestionCard" apps/mobile/src/ --include="*.tsx" --include="*.ts"
```

- If zero matches remain (the common case — this screen was the only caller), **delete the component and its tests**:
  ```bash
  git rm apps/mobile/src/components/library/SuggestionCard.tsx
  git rm apps/mobile/src/components/library/SuggestionCard.test.tsx
  ```
  Leaving it orphaned violates `feedback_adversarial_review_patterns.md` ("Clean Up All Artifacts When Removing a Feature") — orphaned types inflate coverage and create false confidence.
- If matches remain elsewhere, keep the file but note the remaining callers in the commit message.

- [ ] **Step 7.3: Run the full related test suite**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests apps/mobile/src/app/\(app\)/shelf/\[subjectId\]/book/\[bookId\].tsx --no-coverage
```

Expected: tests may fail because mock data doesn't match new section expectations. That's expected — fixed in Task 8.

- [ ] **Step 7.4: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 7.5: Lint**

```bash
pnpm exec nx run mobile:lint
```

Expected: zero errors (no eslint-disable added).

- [ ] **Step 7.6: Commit the full `[bookId].tsx` rewrite**

```bash
git add apps/mobile/src/app/\(app\)/shelf/\[subjectId\]/book/\[bookId\].tsx
git commit -m "feat(mobile): topic screen status-first redesign — 7 sections + CTA [TOPIC-REDESIGN]"
```

---

## Task 8: Screen Tests — New Section Coverage

**Files:**
- Modify: `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx`

- [ ] **Step 8.1: Understand what needs updating**

The current test file sets up mocks for:
- `useBookWithTopics` → topics with no chapter field
- `useBookSessions` → empty sessions
- `useRetentionTopics` → empty topics (so topicStudiedIds = empty)

All new sections rely on session + retention data. Add new `describe` blocks for each section. Keep existing tests that cover loading/error/generation states (they don't need changes).

- [ ] **Step 8.2: Add new mock helpers at the top of the test file**

After the existing mock setup blocks (after the last `jest.mock(...)` block, before the first `describe`), add:

```typescript
// --- Test data helpers ---

function makeTopic(overrides: Partial<{
  id: string; title: string; chapter: string | null; sortOrder: number; skipped: boolean;
}> = {}) {
  return {
    id: 'topic-1',
    title: 'Linear Equations',
    chapter: 'Algebra Basics',
    sortOrder: 1,
    skipped: false,
    ...overrides,
  };
}

function makeSession(overrides: Partial<{
  id: string; topicId: string | null; topicTitle: string; chapter: string | null; createdAt: string;
}> = {}) {
  return {
    id: 'session-1',
    topicId: 'topic-1',
    topicTitle: 'Linear Equations',
    chapter: 'Algebra Basics',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
```

- [ ] **Step 8.3: Add tests for the Continue now section**

```typescript
describe('Continue now section', () => {
  it('renders when a topic has sessions but is not in topicStudiedIds', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: [makeTopic({ id: 'topic-1', title: 'Linear Equations' })],
        completedTopicCount: 0,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({
      data: [makeSession({ topicId: 'topic-1' })],
      isLoading: false,
    });
    // topicStudiedIds is empty (no retention data) → topic-1 is in-progress
    mockUseRetentionTopics.mockReturnValue({
      data: { topics: [], reviewDueCount: 0 }, isLoading: false,
    });

    const { getByTestId, getByText } = render(<BookScreen />);
    expect(getByTestId('continue-now-row')).toBeTruthy();
    expect(getByText('Continue now')).toBeTruthy();
    expect(getByText('Linear Equations')).toBeTruthy();
  });

  it('does not render when all session topics are in topicStudiedIds (Done)', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: [makeTopic({ id: 'topic-1' })],
        completedTopicCount: 1,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({
      data: [makeSession({ topicId: 'topic-1' })],
      isLoading: false,
    });
    mockUseRetentionTopics.mockReturnValue({
      data: { topics: [{ topicId: 'topic-1', repetitions: 1, easeFactor: 2.5, xpStatus: 'active', failureCount: 0 }], reviewDueCount: 0 },
      isLoading: false,
    });

    const { queryByTestId } = render(<BookScreen />);
    expect(queryByTestId('continue-now-row')).toBeNull();
  });
});
```

- [ ] **Step 8.4: Add tests for the Started section**

```typescript
describe('Started section', () => {
  it('shows session count subtitle per started topic', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: [
          makeTopic({ id: 't1', title: 'Topic One', sortOrder: 1 }),
          makeTopic({ id: 't2', title: 'Topic Two', sortOrder: 2 }),
        ],
        completedTopicCount: 0,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    // t1 is newest (continueNow), t2 is older (Started)
    mockUseBookSessions.mockReturnValue({
      data: [
        makeSession({ id: 's1', topicId: 't1', createdAt: new Date(2000).toISOString() }),
        makeSession({ id: 's2', topicId: 't2', createdAt: new Date(1000).toISOString() }),
        makeSession({ id: 's3', topicId: 't2', createdAt: new Date(500).toISOString() }),
      ],
      isLoading: false,
    });
    mockUseRetentionTopics.mockReturnValue({
      data: { topics: [], reviewDueCount: 0 }, isLoading: false,
    });

    const { getByText } = render(<BookScreen />);
    expect(getByText('Started')).toBeTruthy();
    expect(getByText('2 sessions')).toBeTruthy(); // t2 has 2 sessions
  });

  it('shows "Show N more started" when >4 started topics', () => {
    const manyTopics = Array.from({ length: 6 }, (_, i) =>
      makeTopic({ id: `t${i + 1}`, title: `Topic ${i + 1}`, sortOrder: i + 1 })
    );
    const sessions = manyTopics.map((t, i) =>
      makeSession({ id: `s${i}`, topicId: t.id, createdAt: new Date(i * 100).toISOString() })
    );
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: manyTopics,
        completedTopicCount: 0,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({ data: sessions, isLoading: false });
    mockUseRetentionTopics.mockReturnValue({
      data: { topics: [], reviewDueCount: 0 }, isLoading: false,
    });

    const { getByTestId } = render(<BookScreen />);
    // 6 in-progress, 1 is continueNow, 5 are Started, >4 threshold → show expander
    expect(getByTestId('started-show-more')).toBeTruthy();
  });
});
```

- [ ] **Step 8.5: Add tests for the Up next section**

```typescript
describe('Up next section', () => {
  it('renders hero variant when book has zero sessions', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: [makeTopic({ id: 'topic-1', title: 'Linear Equations' })],
        completedTopicCount: 0,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({ data: [], isLoading: false });
    mockUseRetentionTopics.mockReturnValue({
      data: { topics: [], reviewDueCount: 0 }, isLoading: false,
    });

    const { getByTestId, getByText } = render(<BookScreen />);
    expect(getByTestId('up-next-row')).toBeTruthy();
    expect(getByText('Up next')).toBeTruthy();
  });

  it('does not render Up next when all topics are done or in-progress', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: [makeTopic({ id: 'topic-1' })],
        completedTopicCount: 1,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({
      data: [makeSession({ topicId: 'topic-1' })],
      isLoading: false,
    });
    mockUseRetentionTopics.mockReturnValue({
      data: { topics: [{ topicId: 'topic-1', repetitions: 1, easeFactor: 2.5, xpStatus: 'active', failureCount: 0 }], reviewDueCount: 0 },
      isLoading: false,
    });

    const { queryByTestId } = render(<BookScreen />);
    expect(queryByTestId('up-next-row')).toBeNull();
  });
});
```

- [ ] **Step 8.6: Add tests for Done section**

```typescript
describe('Done section', () => {
  it('shows done topics when in topicStudiedIds', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: [makeTopic({ id: 'topic-1', title: 'Linear Equations' })],
        completedTopicCount: 1,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({
      data: [makeSession({ topicId: 'topic-1' })],
      isLoading: false,
    });
    mockUseRetentionTopics.mockReturnValue({
      data: { topics: [{ topicId: 'topic-1', repetitions: 1, easeFactor: 2.5, xpStatus: 'active', failureCount: 0 }], reviewDueCount: 0 },
      isLoading: false,
    });

    const { getByTestId, getByText } = render(<BookScreen />);
    expect(getByTestId('done-row-topic-1')).toBeTruthy();
    expect(getByText('Done')).toBeTruthy();
  });

  it('shows "Show all N done" when >8 topics done', async () => {
    const manyTopics = Array.from({ length: 10 }, (_, i) =>
      makeTopic({ id: `t${i + 1}`, title: `Topic ${i + 1}`, sortOrder: i + 1 })
    );
    const retentionData = manyTopics.map(t => ({
      topicId: t.id, repetitions: 2, easeFactor: 2.5, xpStatus: 'active', failureCount: 0,
    }));
    const sessions = manyTopics.map((t, i) =>
      makeSession({ id: `s${i}`, topicId: t.id })
    );
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: manyTopics,
        completedTopicCount: 10,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({ data: sessions, isLoading: false });
    mockUseRetentionTopics.mockReturnValue({
      data: { topics: retentionData, reviewDueCount: 0 }, isLoading: false,
    });

    const { getByTestId } = render(<BookScreen />);
    expect(getByTestId('done-show-all')).toBeTruthy();
  });
});
```

- [ ] **Step 8.7: Add tests for the Later section**

```typescript
describe('Later section', () => {
  it('renders chapters with unstarted topics', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: [makeTopic({ id: 'topic-1', title: 'Linear Equations', chapter: 'Chapter 1' })],
        completedTopicCount: 0,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({ data: [], isLoading: false });
    mockUseRetentionTopics.mockReturnValue({
      data: { topics: [], reviewDueCount: 0 }, isLoading: false,
    });

    const { getByText } = render(<BookScreen />);
    expect(getByText('Later')).toBeTruthy();
    expect(getByText('Chapter 1')).toBeTruthy();
  });
});
```

- [ ] **Step 8.7b: Add failure-mode tests (Task 5b coverage)**

These tests prove the four Failure Modes table rows that earlier drafts only listed. Without these, the Self-Review's "Verified by" cells are aspirational.

```typescript
describe('Failure modes (Task 5b)', () => {
  function baseTopics() {
    return [makeTopic({ id: 'topic-1', title: 'Linear Equations' })];
  }

  it('renders sessions error banner with retry when useBookSessions fails', () => {
    const refetchSpy = jest.fn();
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: baseTopics(),
        completedTopicCount: 0,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchSpy,
    });
    mockUseRetentionTopics.mockReturnValue({
      data: { topics: [], reviewDueCount: 0 }, isLoading: false, isError: false, refetch: jest.fn(),
    });

    const { getByTestId, getByText } = render(<BookScreen />);
    expect(getByTestId('sessions-error-banner')).toBeTruthy();
    expect(getByText("Couldn't load your history.")).toBeTruthy();
    fireEvent.press(getByTestId('sessions-error-retry'));
    expect(refetchSpy).toHaveBeenCalledTimes(1);
    // Degraded data still rendered: Up next computes from retention-only state
    expect(getByTestId('up-next-row')).toBeTruthy();
  });

  it('renders retention error banner with retry when useRetentionTopics fails', () => {
    const refetchSpy = jest.fn();
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: baseTopics(),
        completedTopicCount: 0,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({
      data: [makeSession({ topicId: 'topic-1' })],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseRetentionTopics.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchSpy,
    });

    const { getByTestId, getByText } = render(<BookScreen />);
    expect(getByTestId('retention-error-banner')).toBeTruthy();
    expect(getByText("Couldn't load progress.")).toBeTruthy();
    fireEvent.press(getByTestId('retention-error-retry'));
    expect(refetchSpy).toHaveBeenCalledTimes(1);
    // Degraded data: Continue now still renders from sessions-only state
    expect(getByTestId('continue-now-row')).toBeTruthy();
  });

  it('renders empty-topics state with build-path CTA when topicsGenerated but topics=[]', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: [],
        completedTopicCount: 0,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: jest.fn() });
    mockUseRetentionTopics.mockReturnValue({
      data: { topics: [], reviewDueCount: 0 }, isLoading: false, isError: false, refetch: jest.fn(),
    });

    const { getByTestId, getByText } = render(<BookScreen />);
    expect(getByTestId('topics-empty-state')).toBeTruthy();
    expect(getByText('No topics yet')).toBeTruthy();
    expect(getByTestId('topics-empty-build')).toBeTruthy();
  });

  it('renders all-sections-fallback when every section short-circuits but topics exist', () => {
    // Construct a state where:
    // - topics exist but all are skipped (so laterChapters and upNextTopic are empty)
    // - no sessions (no continueNow / Started)
    // - no retention (no Done)
    // This is an unlikely but possible state if someone skips every topic.
    const skippedTopics = [
      makeTopic({ id: 'topic-1', title: 'A', skipped: true }),
      makeTopic({ id: 'topic-2', title: 'B', skipped: true, sortOrder: 2 }),
    ];
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: skippedTopics,
        completedTopicCount: 0,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: jest.fn() });
    mockUseRetentionTopics.mockReturnValue({
      data: { topics: [], reviewDueCount: 0 }, isLoading: false, isError: false, refetch: jest.fn(),
    });

    const { getByTestId } = render(<BookScreen />);
    // NOTE: If `computeUpNextTopic` returns a topic even when all are skipped,
    // this test will fail because the fallback gate is exclusive. In that case,
    // either tighten `computeUpNextTopic` to filter `skipped`, or change this
    // test to inject a state where all 6 gates are genuinely false (e.g.,
    // monkey-patch via dependency injection — currently not exposed). The test
    // failing is itself information: it tells you the fallback is unreachable
    // through public APIs and should be deleted (per simpler-is-better).
    expect(getByTestId('all-sections-fallback')).toBeTruthy();
  });

  it('does not render error banners when both queries succeed', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: baseTopics(),
        completedTopicCount: 0,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: jest.fn() });
    mockUseRetentionTopics.mockReturnValue({
      data: { topics: [], reviewDueCount: 0 }, isLoading: false, isError: false, refetch: jest.fn(),
    });

    const { queryByTestId } = render(<BookScreen />);
    expect(queryByTestId('sessions-error-banner')).toBeNull();
    expect(queryByTestId('retention-error-banner')).toBeNull();
  });
});
```

> **Heads-up on the existing mocks:** every other test in this file currently returns `mockUseBookSessions.mockReturnValue({ data: [...], isLoading: false })` — without `isError` or `refetch`. These older tests still pass because the screen reads `sessionsQuery.isError` (undefined → falsy → banner hidden). But the new failure-mode tests above add `isError: true/false` explicitly. **Don't retrofit the older tests** — leaving them minimal is the documented convention. Just be aware the difference is intentional.



```typescript
describe('Book-complete card', () => {
  it('renders card with review + next-book actions when every topic is in topicStudiedIds', () => {
    const topicsData = [
      makeTopic({ id: 'topic-1', title: 'Linear Equations' }),
      makeTopic({ id: 'topic-2', title: 'Quadratics', sortOrder: 2 }),
    ];
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: topicsData,
        completedTopicCount: 2,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({ data: [], isLoading: false });
    mockUseRetentionTopics.mockReturnValue({
      data: {
        topics: topicsData.map((t) => ({
          topicId: t.id, repetitions: 1, easeFactor: 2.5, xpStatus: 'active', failureCount: 0,
        })),
        reviewDueCount: 0,
      },
      isLoading: false,
    });

    const { getByTestId, queryByTestId } = render(<BookScreen />);
    expect(getByTestId('book-complete-card')).toBeTruthy();
    expect(getByTestId('book-complete-review')).toBeTruthy();
    expect(getByTestId('book-complete-next')).toBeTruthy();
    // Sticky CTA hidden — card owns the primary action
    expect(queryByTestId('book-start-learning')).toBeNull();
  });

  it('does not render the card when one topic is still unstarted', () => {
    const topicsData = [
      makeTopic({ id: 'topic-1', title: 'Linear Equations' }),
      makeTopic({ id: 'topic-2', title: 'Quadratics', sortOrder: 2 }),
    ];
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: topicsData,
        completedTopicCount: 1,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({ data: [], isLoading: false });
    // Only topic-1 is in retention → topic-2 unstarted → not complete
    mockUseRetentionTopics.mockReturnValue({
      data: {
        topics: [{ topicId: 'topic-1', repetitions: 1, easeFactor: 2.5, xpStatus: 'active', failureCount: 0 }],
        reviewDueCount: 0,
      },
      isLoading: false,
    });

    const { queryByTestId } = render(<BookScreen />);
    expect(queryByTestId('book-complete-card')).toBeNull();
  });

  it('tapping "Start review" routes to review mode, not learning mode', () => {
    const pushSpy = jest.fn();
    // Wire the router mock — the actual mock variable name varies per test file.
    // BEFORE WRITING THIS TEST, run:
    //   grep -nE "mockRouter|router.push|jest.mock\(.*expo-router" \
    //     apps/mobile/src/app/\(app\)/shelf/\[subjectId\]/book/\[bookId\].test.tsx
    // and adapt the line below to whatever symbol is exposed (mockRouter,
    // mockRouterPush, mockedRouter, etc.). If the file mocks expo-router with
    // a hoisted factory (jest.mock('expo-router', ...)), you may need to
    // import the mocked module and reach into its `useRouter` return value.
    mockRouter.push = pushSpy;

    const topicsData = [makeTopic({ id: 'topic-1' })];
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: topicsData,
        completedTopicCount: 1,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({ data: [], isLoading: false });
    mockUseRetentionTopics.mockReturnValue({
      data: { topics: [{ topicId: 'topic-1', repetitions: 1, easeFactor: 2.5, xpStatus: 'active', failureCount: 0 }], reviewDueCount: 0 },
      isLoading: false,
    });

    const { getByTestId } = render(<BookScreen />);
    fireEvent.press(getByTestId('book-complete-review'));

    expect(pushSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ mode: 'review' }),
      })
    );
  });
});
```

- [ ] **Step 8.8: Add CTA state tests**

```typescript
describe('Sticky CTA states', () => {
  it('shows "Continue learning" when continueNow exists', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: [makeTopic({ id: 'topic-1' })],
        completedTopicCount: 0,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({ data: [makeSession({ topicId: 'topic-1' })], isLoading: false });
    mockUseRetentionTopics.mockReturnValue({ data: { topics: [], reviewDueCount: 0 }, isLoading: false });

    const { getByText } = render(<BookScreen />);
    expect(getByText('▶ Continue learning')).toBeTruthy();
  });

  it('shows "Start: [title]" when no continueNow but upNextTopic exists', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: [makeTopic({ id: 'topic-1', title: 'Linear Equations' })],
        completedTopicCount: 0,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({ data: [], isLoading: false });
    mockUseRetentionTopics.mockReturnValue({ data: { topics: [], reviewDueCount: 0 }, isLoading: false });

    const { getByText } = render(<BookScreen />);
    expect(getByText('▶ Start: Linear Equations')).toBeTruthy();
  });

  it('hides CTA when book is fully done and no up-next or started', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        topics: [makeTopic({ id: 'topic-1' })],
        completedTopicCount: 1,
      },
      isLoading: false, isError: false, error: null, refetch: jest.fn(),
    });
    mockUseBookSessions.mockReturnValue({ data: [makeSession({ topicId: 'topic-1' })], isLoading: false });
    mockUseRetentionTopics.mockReturnValue({
      data: { topics: [{ topicId: 'topic-1', repetitions: 1, easeFactor: 2.5, xpStatus: 'active', failureCount: 0 }], reviewDueCount: 0 },
      isLoading: false,
    });

    const { queryByTestId } = render(<BookScreen />);
    expect(queryByTestId('book-start-learning')).toBeNull();
  });
});
```

- [ ] **Step 8.9: Run all screen tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests "apps/mobile/src/app/\(app\)/shelf/\[subjectId\]/book/\[bookId\].test.tsx" --no-coverage
```

Expected: PASS — existing state tests pass; new section tests pass.

- [ ] **Step 8.10: Run the full CollapsibleChapter + TopicStatusRow test suites together**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="CollapsibleChapter|TopicStatusRow|up-next-topic|bookId" --no-coverage
```

Expected: all green.

- [ ] **Step 8.11: Lint + typecheck final pass**

```bash
pnpm exec nx run mobile:lint && cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: zero errors, zero warnings.

- [ ] **Step 8.12: Commit**

```bash
git add apps/mobile/src/app/\(app\)/shelf/\[subjectId\]/book/\[bookId\].test.tsx
git commit -m "test(mobile): topic screen 7-section coverage — Continue now, Started, Up next, Done, Later, CTA states [TOPIC-REDESIGN]"
```

---

## Task 9: Device / Emulator Verification

**Files:** none (manual verification)

Jest + tsc + lint do not verify the redesign's core claim: "answers done/doing/next within the first half-screen on a 5.8" phone." Per `user_device_small_phone.md` and global `CLAUDE.md` ("For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete"), this task is mandatory before marking the plan done.

- [ ] **Step 9.1: Boot the emulator (or web preview) and seed test data**

Use the `.claude/launch.json` `mobile` target (per `project_expo_web_preview.md`) or the Galaxy S10e emulator if native behavior matters (dashed border, safe-area insets).

Seed four scenarios on one profile:
1. **Zero sessions** — fresh book. Expect: no Continue now, no Started, hero Up next, Later expanded, CTA = "▶ Start: <title>".
2. **Mid-progress** — 1 continueNow, 2–3 Started, 1 Up next, 2 Done. Expect: all six sections visible, CTA = "▶ Continue learning".
3. **Fully done** — all topics in topicStudiedIds. Expect: Book-complete card at top with "Start review" + "Back to shelf" buttons; Done section populated; no Continue now/Started/Up next/Later; sticky CTA hidden. Tap "Start review" and confirm it routes to review mode (not learning mode).
4. **Sessions-fetch-fails** — force the sessions query into error state (devtools network throttle, airplane mode, or temporarily corrupt the auth token). Expect: `sessions-error-banner` visible with Retry button; Later + Done still render from retention data; Continue now + Started + Up next hidden. Tap Retry while still offline → still shows banner. Restore network → tap Retry → banner disappears, full screen renders.

5. **Retention-fetch-fails** — same forced-error approach for the retention query. Expect: `retention-error-banner` visible; Continue now + Started still render from sessions; Done + Later hidden. Retry behavior mirrors scenario 4.

6. **Empty-topics edge case** — seed a book where `topicsGenerated === true` but the topics array is empty (manually clear via test-seed endpoint). Expect: `topics-empty-state` with "Build learning path" CTA. Tap CTA → routes to learning-path builder.

- [ ] **Step 9.2: Small-screen screenshot audit**

On the Galaxy S10e (5.8" or web preview at 360×720), capture screenshots of scenarios 1 and 2. Visually confirm:

- Continue now + Started + Up next are visible within the top half (before scroll) in scenario 2.
- In scenario 1, the hero Up next row sits above the fold without scrolling.
- Dashed border on Up next renders as dashed on Android (not solid — Android has a historical bug with `borderStyle: 'dashed'` + `borderRadius`; if it renders solid, fall back to a solid border with a gold left indicator).

Attach the screenshots to the PR description.

- [ ] **Step 9.3: Accessibility smoke**

Turn on TalkBack (Android) or VoiceOver (iOS). Tab through the sections and verify each row announces its state + title + chapter (e.g., "Continue now: Linear Equations, Algebra Basics, button"). The decorative dot glyph must NOT be announced.

- [ ] **Step 9.4: Commit the verification evidence**

If Task 9 revealed code issues, fix them and commit. Otherwise, append the screenshot references to the PR description only — no code commit needed.

---

## Self-Review: Spec Coverage Check

| Spec requirement | Task that covers it |
|---|---|
| Continue now: 0 or 1 row, most-recent in-progress topic, solid blue dot, no chip | Task 5 + Task 8 |
| Started: sorted newest-session first, "N sessions" subtitle, "Show N more" at >4 | Task 4 + Task 5 + Task 8 |
| Up next: 4-rule precedence, hero on first-visit (0 sessions), dashed gold border | Task 1 + Task 5 + Task 8 |
| Up next hero: suppressed chapter subtitle when chapter == book title | Task 5 (chapterName={upNextTopic.chapter === book?.title ? undefined : ...}) |
| Done: sorted by completion timestamp, auto-expand ≤8, "Show all" >8 | Task 6 + Task 8 |
| Later: partially-started chapters included, ◐ vs ○ dot, "M / N not started" | Task 3 + Task 6 + Task 8 |
| Later auto-expand: ≤3 chapters AND ≤12 total unstarted topics | Task 4 + Task 6 |
| Sticky CTA: 3 states + hidden state, newest-Started for Resume | Task 7 + Task 8 |
| Section heading voice: descriptive labels only | Task 5 + Task 6 |
| Remove Study next cards, flame icons, "Next" chip, "Latest"/"Paused" chips | Task 5 (old blocks deleted) + Task 3 (CollapsibleChapter) |
| Compact header: progress bar + "N of M topics done" | Task 5 |
| Past conversations heading rename | Task 6 |
| Failure mode: sessions API fails → banner + retry, Later/Done still visible | Task 5b Step 5b.2 (JSX) + Task 8 Step 8.7b (test, including degraded-data assertion) |
| Failure mode: retention API fails → banner + retry, Continue/Started still visible | Task 5b Step 5b.2 (JSX) + Task 8 Step 8.7b (test, including degraded-data assertion) |
| Failure mode: topics empty but generated → empty-state CTA | Task 5b Step 5b.3 (JSX) + Task 8 Step 8.7b (test) |
| Failure mode: all sections short-circuit → fallback card | Task 5b Step 5b.4 (JSX) + Task 8 Step 8.7b (test, with documented unreachability caveat) |
| Failure mode: stale continueNowTopicId → hidden + Sentry breadcrumb | Failure Modes table + Task 8 break test + `continueNowTopic` memo breadcrumb |
| Failure mode: all done + no suggestion → Book-complete card + review CTA, sticky CTA hidden | Task 4 (`isBookComplete`) + Task 6 Step 6.0 + Task 7 guard + Task 8 Step 8.8a |
| Up next — null-chapter topics don't conflate in momentum | Task 1 (`chapterKey` sentinel) + new null-chapter test |
| Device verification: half-screen on 5.8" phone, dashed border on Android | Task 9 |
| Accessibility: state announced per row | Task 2 (`STATE_LABEL[state]` in accessibilityLabel) + Task 9 TalkBack smoke |
| Observability hook point | `testID` props on every row enable future analytics wiring — no action needed |
| 44px min-height for all rows | Task 2 (`minHeight = 44`) |
| 72px min-height for Up next hero | Task 2 (`minHeight = 72`) |
| Semantic tokens only, no hardcoded hex | Task 2 + Task 3 (uses `useThemeColors`) |

**Open question deferral note:** Row heights (44px/72px) and section-heading typography are implemented using the values specified in the spec. If a design-token pass produces different values during implementation, adjust `minHeight` in `TopicStatusRow.tsx` — no other file needs to change.
