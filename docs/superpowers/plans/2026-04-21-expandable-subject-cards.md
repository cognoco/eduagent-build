# Expandable Subject Cards with Honest Mastery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the mastery definition to retention-verified only, unify card headlines, filter empty subjects in parent view, and add inline accordion topic lists on parent subject cards.

**Architecture:** Two-layer change. Backend: tighten `masteredTopicIds` in both `buildSubjectMetric` and `buildSubjectInventory` to require `xpStatus === 'verified'`, and gate `exploredTopicIds` on qualifying sessions. Frontend: unified headline, empty-subject filter in parent view, accordion expand/collapse with lazy-loaded topic list via existing `useChildSubjectTopics` hook.

**Tech Stack:** TypeScript, Drizzle ORM (read-only changes), React Native, NativeWind/Tailwind, React Query, LayoutAnimation, Jest + React Testing Library.

---

## File Map

| File | Responsibility | Change type |
|------|---------------|-------------|
| `apps/api/src/services/snapshot-aggregation.ts` | Mastery + exploration computation | Modify (lines 332–343, 490–525) |
| `apps/api/src/services/snapshot-aggregation.test.ts` | Backend tests for tightened logic | Modify (add new test cases) |
| `apps/mobile/src/components/progress/SubjectCard.tsx` | Card UI: headline unification, accordion shell | Modify (rewrite `getTopicHeadline`, add accordion mode with expand/collapse) |
| `apps/mobile/src/components/progress/AccordionTopicList.tsx` | Expanded topic list with lazy loading + navigation | **Create** (encapsulates `useChildSubjectTopics` + `useRouter`) |
| `apps/mobile/src/components/progress/AccordionTopicList.test.tsx` | Tests for topic loading, navigation, error states | **Create** |
| `apps/mobile/src/components/progress/SubjectCard.test.tsx` | Frontend tests for headline + accordion toggle | Modify (rewrite headline tests, add accordion tests) |
| `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` | Parent dashboard: filter + accordion wiring | Modify (lines 458–482) |
| `apps/mobile/src/app/_layout.tsx` or app init | LayoutAnimation Android enablement | Modify (one-liner) |

**Design note (H3):** `useRouter` and `useChildSubjectTopics` are extracted into `AccordionTopicList` — a child component rendered inside SubjectCard only when in accordion mode. This keeps SubjectCard a pure presentational component (no data-fetching hooks, no routing dependency), which makes it testable without mocking expo-router or React Query. It also respects the React rules of hooks — no conditional hook calls.

---

## Task 1: Tighten `masteredTopicIds` in `buildSubjectMetric` (backend)

**Files:**
- Modify: `apps/api/src/services/snapshot-aggregation.ts:332-343`
- Test: `apps/api/src/services/snapshot-aggregation.test.ts`

**Context:** `buildSubjectMetric` (line 286) is used by `computeProgressMetrics` (line 380) to produce `ProgressMetrics.subjects[].topicsMastered` and the global `topicsMastered` aggregate. Currently, lines 332–337 add any topic with `assessment.status === 'passed'` to `masteredTopicIds`. We need to remove that entire assessment loop so that only `xpStatus === 'verified'` retention cards count as mastered.

- [ ] **Step 1: Write the failing test**

`buildSubjectMetric` is a private function, so we export it with `/** @internal */` for direct unit testing with hand-built `ProgressState` objects. This avoids mocking the DB-dependent `loadProgressState`.

In `apps/api/src/services/snapshot-aggregation.ts`, at line 286, change `function buildSubjectMetric` to `/** @internal */ export function buildSubjectMetric`.

Then write the test:

```ts
// Add to apps/api/src/services/snapshot-aggregation.test.ts

import { buildSubjectMetric } from './snapshot-aggregation';

// --- Fixture helpers for ProgressState pieces ---

function makeSubjectRow(id: string, name: string) {
  return { id, name, pedagogyMode: 'socratic' as const } as any;
}

function makeSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    profileId: 'profile-1',
    subjectId: 'sub-1',
    topicId: 'topic-1',
    exchangeCount: 3,
    durationSeconds: 600,
    wallClockSeconds: 700,
    lastActivityAt: new Date('2026-04-20'),
    ...overrides,
  } as any;
}

function makeAssessmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assess-1',
    profileId: 'profile-1',
    subjectId: 'sub-1',
    topicId: 'topic-1',
    status: 'passed',
    ...overrides,
  } as any;
}

function makeRetentionCardRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rc-1',
    profileId: 'profile-1',
    topicId: 'topic-1',
    xpStatus: 'pending',
    ...overrides,
  } as any;
}

function makeTopicWithSubject(id: string, subjectId: string, filedFrom = 'session_filing') {
  return { id, subjectId, filedFrom, curriculumVersionId: 'cv-1' } as any;
}

function makeProgressState(overrides: Record<string, unknown> = {}) {
  const topic = makeTopicWithSubject('topic-1', 'sub-1');
  return {
    profileId: 'profile-1',
    subjects: [makeSubjectRow('sub-1', 'Math')],
    sessions: [makeSessionRow()],
    assessments: [],
    retentionCards: [],
    streak: null,
    vocabulary: [],
    vocabularyRetentionCards: [],
    topicsById: new Map([['topic-1', topic]]),
    allTopicsBySubject: new Map([['sub-1', [topic]]]),
    latestTopicsBySubject: new Map([['sub-1', [topic]]]),
    ...overrides,
  } as any;
}

describe('buildSubjectMetric mastery [1A]', () => {
  it('counts assessment-passed-only topic as inProgress, not mastered', () => {
    const state = makeProgressState({
      assessments: [makeAssessmentRow({ topicId: 'topic-1', status: 'passed' })],
      retentionCards: [], // no verified retention card
    });

    const result = buildSubjectMetric(makeSubjectRow('sub-1', 'Math'), state);

    expect(result.topicsMastered).toBe(0);
    expect(result.topicsAttempted).toBeGreaterThanOrEqual(1);
  });

  it('counts topic as mastered when xpStatus is verified', () => {
    const state = makeProgressState({
      assessments: [makeAssessmentRow({ topicId: 'topic-1', status: 'passed' })],
      retentionCards: [makeRetentionCardRow({ topicId: 'topic-1', xpStatus: 'verified' })],
    });

    const result = buildSubjectMetric(makeSubjectRow('sub-1', 'Math'), state);

    expect(result.topicsMastered).toBe(1);
  });

  it('does not count decayed retention card as mastered', () => {
    const state = makeProgressState({
      assessments: [makeAssessmentRow({ topicId: 'topic-1', status: 'passed' })],
      retentionCards: [makeRetentionCardRow({ topicId: 'topic-1', xpStatus: 'decayed' })],
    });

    const result = buildSubjectMetric(makeSubjectRow('sub-1', 'Math'), state);

    expect(result.topicsMastered).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — expect FAILURE on the first test**

Run: `cd apps/api && pnpm exec jest snapshot-aggregation.test.ts --no-coverage -t "counts assessment-passed-only topic as inProgress, not mastered"`

Expected: FAIL — `expected 0, received 1` (because assessment-passed still counts as mastered in current code)

- [ ] **Step 3: Export `buildSubjectMetric` for testing**

In `apps/api/src/services/snapshot-aggregation.ts`, change line 286:

```ts
// Before:
function buildSubjectMetric(

// After:
/** @internal — exported for testing only */
export function buildSubjectMetric(
```

- [ ] **Step 4: Remove assessment-passed loop from `buildSubjectMetric`**

In `apps/api/src/services/snapshot-aggregation.ts`, replace lines 332–343:

```ts
// Before (lines 332-343):
  const masteredTopicIds = new Set<string>();
  for (const assessment of subjectAssessments) {
    if (assessment.status === 'passed') {
      masteredTopicIds.add(assessment.topicId);
    }
  }

  for (const card of state.retentionCards) {
    if (card.xpStatus === 'verified' && allTopicIds.has(card.topicId)) {
      masteredTopicIds.add(card.topicId);
    }
  }

// After:
  const masteredTopicIds = new Set<string>();
  for (const card of state.retentionCards) {
    if (card.xpStatus === 'verified' && allTopicIds.has(card.topicId)) {
      masteredTopicIds.add(card.topicId);
    }
  }
```

The assessment loop is simply removed. Topics with `assessment.status === 'passed'` still count toward `attemptedTopicIds` (lines 320–324), so they remain in `topicsAttempted` — they just don't count as mastered.

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd apps/api && pnpm exec jest snapshot-aggregation.test.ts --no-coverage -t "mastery"`

Expected: All three `buildSubjectMetric mastery [1A]` tests pass.

- [ ] **Step 6: Commit**

```
feat(api): tighten masteredTopicIds in buildSubjectMetric to verified-only [1A]
```

---

## Task 2: Tighten `masteredTopicIds` in `buildSubjectInventory` (backend)

**Files:**
- Modify: `apps/api/src/services/snapshot-aggregation.ts:470-525`
- Test: `apps/api/src/services/snapshot-aggregation.test.ts`

**Context:** `buildSubjectInventory` (line 470) is used by `buildKnowledgeInventory` (line 630) to produce the `SubjectInventory` objects read by the mobile app's progress screens. Lines 505–517 add `assessment.status === 'passed'` topics to `masteredTopicIds`. Same fix as Task 1 but in a different function.

- [ ] **Step 1: Export `buildSubjectInventory` and write the failing test**

In `apps/api/src/services/snapshot-aggregation.ts`, change line 470:

```ts
// Before:
async function buildSubjectInventory(

// After:
/** @internal — exported for testing only */
export async function buildSubjectInventory(
```

Add test (note: this function is async and takes a `db` param — pass `null as any` since the `getCurrentLanguageProgress` DB call is only reached for `four_strands` pedagogy subjects; our fixtures use `pedagogyMode: 'socratic'` so the `db` param is never dereferenced. If a future fixture uses `four_strands`, this will crash — use a real DB or mock `getCurrentLanguageProgress` in that case):

```ts
import { buildSubjectInventory } from './snapshot-aggregation';

describe('buildSubjectInventory mastery [1A]', () => {
  it('counts assessment-passed-only topic as inProgress, not mastered', async () => {
    const state = makeProgressState({
      assessments: [makeAssessmentRow({ topicId: 'topic-1', subjectId: 'sub-1', status: 'passed' })],
      retentionCards: [],
    });
    const subjectMetric = {
      subjectId: 'sub-1',
      subjectName: 'Math',
      pedagogyMode: 'socratic' as const,
      topicsAttempted: 1,
      topicsMastered: 0,
      topicsTotal: 1,
      topicsExplored: 1,
      vocabularyTotal: 0,
      vocabularyMastered: 0,
      sessionsCount: 1,
      activeMinutes: 10,
      wallClockMinutes: 12,
      lastSessionAt: '2026-04-20T00:00:00.000Z',
    };

    const result = await buildSubjectInventory(null as any, state, subjectMetric);

    expect(result.topics.mastered).toBe(0);
    expect(result.topics.inProgress).toBeGreaterThanOrEqual(1);
  });

  it('counts topic as mastered when xpStatus is verified', async () => {
    const state = makeProgressState({
      assessments: [makeAssessmentRow({ topicId: 'topic-1', subjectId: 'sub-1', status: 'passed' })],
      retentionCards: [makeRetentionCardRow({ topicId: 'topic-1', xpStatus: 'verified' })],
    });
    const subjectMetric = {
      subjectId: 'sub-1',
      subjectName: 'Math',
      pedagogyMode: 'socratic' as const,
      topicsAttempted: 1,
      topicsMastered: 1,
      topicsTotal: 1,
      topicsExplored: 1,
      vocabularyTotal: 0,
      vocabularyMastered: 0,
      sessionsCount: 1,
      activeMinutes: 10,
      wallClockMinutes: 12,
      lastSessionAt: '2026-04-20T00:00:00.000Z',
    };

    const result = await buildSubjectInventory(null as any, state, subjectMetric);

    expect(result.topics.mastered).toBe(1);
  });
});

describe('buildSubjectMetric and buildSubjectInventory agree on masteredTopicIds', () => {
  it('both report same mastered count for assessment-passed-only topic', async () => {
    const state = makeProgressState({
      assessments: [makeAssessmentRow({ topicId: 'topic-1', subjectId: 'sub-1', status: 'passed' })],
      retentionCards: [],
    });
    const subject = makeSubjectRow('sub-1', 'Math');
    const metric = buildSubjectMetric(subject, state);
    const inventory = await buildSubjectInventory(null as any, state, metric);

    expect(metric.topicsMastered).toBe(inventory.topics.mastered);
    expect(metric.topicsMastered).toBe(0); // assessment-passed ≠ mastered
  });

  it('both report same mastered count for verified topic', async () => {
    const state = makeProgressState({
      assessments: [makeAssessmentRow({ topicId: 'topic-1', subjectId: 'sub-1', status: 'passed' })],
      retentionCards: [makeRetentionCardRow({ topicId: 'topic-1', xpStatus: 'verified' })],
    });
    const subject = makeSubjectRow('sub-1', 'Math');
    const metric = buildSubjectMetric(subject, state);
    const inventory = await buildSubjectInventory(null as any, state, metric);

    expect(metric.topicsMastered).toBe(inventory.topics.mastered);
    expect(metric.topicsMastered).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests — expect FAILURE on first test**

Run: `cd apps/api && pnpm exec jest snapshot-aggregation.test.ts --no-coverage -t "buildSubjectInventory mastery"`

Expected: FAIL — `expected 0, received 1`

- [ ] **Step 3: Remove assessment-passed from `masteredTopicIds` in `buildSubjectInventory`**

In `apps/api/src/services/snapshot-aggregation.ts`, replace lines 505–517:

```ts
// Before (lines 505-517):
  for (const assessment of state.assessments) {
    if (
      assessment.subjectId !== subject.id ||
      !allTopicIds.has(assessment.topicId)
    ) {
      continue;
    }

    attemptedTopicIds.add(assessment.topicId);
    if (assessment.status === 'passed') {
      masteredTopicIds.add(assessment.topicId);
    }
  }

// After:
  for (const assessment of state.assessments) {
    if (
      assessment.subjectId !== subject.id ||
      !allTopicIds.has(assessment.topicId)
    ) {
      continue;
    }

    attemptedTopicIds.add(assessment.topicId);
  }
```

Only the `if (assessment.status === 'passed') { masteredTopicIds.add(...) }` block is removed. The `attemptedTopicIds.add` stays — assessment-passed topics still count as "attempted" (in progress).

**IMPORTANT: Leave lines 519–525 (retention card loop) completely untouched.** That loop adds `xpStatus === 'verified'` topics to `masteredTopicIds` — it is the correct and now sole mastery source. Only the assessment loop at 514 is removed.

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd apps/api && pnpm exec jest snapshot-aggregation.test.ts --no-coverage`

Expected: ALL tests pass, including the cross-surface agreement tests.

- [ ] **Step 5: Commit**

```
feat(api): tighten masteredTopicIds in buildSubjectInventory to verified-only [1A]
```

---

## Task 3: Gate `exploredTopicIds` on qualifying sessions (backend)

**Files:**
- Modify: `apps/api/src/services/snapshot-aggregation.ts:307-311,490-494`
- Test: `apps/api/src/services/snapshot-aggregation.test.ts`

**Context:** Currently, `exploredTopicIds` includes any topic where `filedFrom !== 'pre_generated'` — even if no session with `exchangeCount >= 1` references that topic. This creates the "1 topic explored, 0 sessions" paradox. We need to add a session-existence check.

The `state.sessions` array already filters `exchangeCount >= 1` at the DB query level (line 251: `gte(learningSessions.exchangeCount, 1)`), so any session in `state.sessions` is qualifying. We just need to check that at least one session references the topic's subject and topicId.

- [ ] **Step 1: Write the failing test**

```ts
describe('exploredTopicIds session-gating [1B]', () => {
  it('excludes topic with zero exchanges from exploredTopicIds', () => {
    // Topic filed from session but no qualifying session references it
    const topic = makeTopicWithSubject('topic-orphan', 'sub-1', 'session_filing');
    const state = makeProgressState({
      sessions: [], // no sessions at all
      allTopicsBySubject: new Map([['sub-1', [topic]]]),
      latestTopicsBySubject: new Map([['sub-1', [topic]]]),
    });

    const result = buildSubjectMetric(makeSubjectRow('sub-1', 'Math'), state);

    expect(result.topicsExplored).toBe(0);
  });

  it('includes topic when a qualifying session references the subject', () => {
    const topic = makeTopicWithSubject('topic-1', 'sub-1', 'session_filing');
    const state = makeProgressState({
      sessions: [makeSessionRow({ subjectId: 'sub-1', topicId: 'topic-1', exchangeCount: 3 })],
      allTopicsBySubject: new Map([['sub-1', [topic]]]),
      latestTopicsBySubject: new Map([['sub-1', [topic]]]),
    });

    const result = buildSubjectMetric(makeSubjectRow('sub-1', 'Math'), state);

    expect(result.topicsExplored).toBe(1);
  });
});
```

- [ ] **Step 2: Run test — expect FAILURE on first test**

Run: `cd apps/api && pnpm exec jest snapshot-aggregation.test.ts --no-coverage -t "excludes topic with zero exchanges"`

Expected: FAIL — `expected 0, received 1` (orphaned topic still counted as explored)

- [ ] **Step 3: Gate `exploredTopicIds` in `buildSubjectMetric`**

In `apps/api/src/services/snapshot-aggregation.ts`, replace lines 307–311:

```ts
// Before (lines 307-311):
  const exploredTopicIds = new Set(
    allTopics
      .filter((topic) => topic.filedFrom !== 'pre_generated')
      .map((topic) => topic.id)
  );

// After:
  const subjectSessionTopicIds = new Set(
    subjectSessions
      .filter((s) => s.topicId != null)
      .map((s) => s.topicId as string)
  );
  const exploredTopicIds = new Set(
    allTopics
      .filter(
        (topic) =>
          topic.filedFrom !== 'pre_generated' &&
          subjectSessionTopicIds.has(topic.id)
      )
      .map((topic) => topic.id)
  );
```

`subjectSessions` is already defined at line 290 (`state.sessions.filter(s => s.subjectId === subject.id)`), and all sessions in `state.sessions` already have `exchangeCount >= 1` (filtered at query time, line 251).

- [ ] **Step 4: Gate `exploredTopicIds` in `buildSubjectInventory`**

In `apps/api/src/services/snapshot-aggregation.ts`, replace lines 490–494:

```ts
// Before (lines 490-494):
  const exploredTopicIds = new Set(
    allTopics
      .filter((topic) => topic.filedFrom !== 'pre_generated')
      .map((topic) => topic.id)
  );

// After:
  const subjectSessions = state.sessions.filter(
    (s) => s.subjectId === subject.id
  );
  const subjectSessionTopicIds = new Set(
    subjectSessions
      .filter((s) => s.topicId != null)
      .map((s) => s.topicId as string)
  );
  const exploredTopicIds = new Set(
    allTopics
      .filter(
        (topic) =>
          topic.filedFrom !== 'pre_generated' &&
          subjectSessionTopicIds.has(topic.id)
      )
      .map((topic) => topic.id)
  );
```

Note: `buildSubjectInventory` doesn't have a pre-existing `subjectSessions` variable at this point (it computes it later at line 571 as a separate local). We create it here since we need it before the existing usage. The later re-computation at line 571 can be removed to avoid duplication — but that's an optimization, not a correctness issue. For safety, keep both; the second one is just `state.sessions.filter(s => s.subjectId === subject.id)` which is cheap.

- [ ] **Step 5: Add matching test for `buildSubjectInventory`**

```ts
describe('exploredTopicIds session-gating in buildSubjectInventory [1B]', () => {
  it('excludes orphaned topic from exploredTopicIds', async () => {
    const topic = makeTopicWithSubject('topic-orphan', 'sub-1', 'session_filing');
    const state = makeProgressState({
      sessions: [],
      assessments: [],
      allTopicsBySubject: new Map([['sub-1', [topic]]]),
      latestTopicsBySubject: new Map([['sub-1', [topic]]]),
    });
    const subjectMetric = {
      subjectId: 'sub-1', subjectName: 'Math', pedagogyMode: 'socratic' as const,
      topicsAttempted: 0, topicsMastered: 0, topicsTotal: 0, topicsExplored: 0,
      vocabularyTotal: 0, vocabularyMastered: 0, sessionsCount: 0,
      activeMinutes: 0, wallClockMinutes: 0, lastSessionAt: null,
    };

    const result = await buildSubjectInventory(null as any, state, subjectMetric);

    expect(result.topics.explored).toBe(0);
  });
});
```

- [ ] **Step 6: Run all tests**

Run: `cd apps/api && pnpm exec jest snapshot-aggregation.test.ts --no-coverage`

Expected: ALL pass.

- [ ] **Step 7: Commit**

```
feat(api): gate exploredTopicIds on qualifying sessions [1B]
```

---

## Task 4: Unified card headline (frontend)

**Files:**
- Modify: `apps/mobile/src/components/progress/SubjectCard.tsx:20-95`
- Test: `apps/mobile/src/components/progress/SubjectCard.test.tsx`

**Context:** Replace the 4-branch `getTopicHeadline()` with the unified layout from the spec: always `"N topics studied · M mastered"` for subjects with topic activity, `"N sessions completed"` for the edge case of sessions-but-no-topics, and a bottom line with time + sessions + "See topics" hint.

The return type of `getTopicHeadline` changes — it now returns `headline`, `subline` (the time/sessions line), `progressValue`, `progressMax`, `hideBar`, and `showSeeTopics`. The `footnote` field is replaced by `subline`.

- [ ] **Step 1: Write the failing tests**

Replace the existing `describe('SubjectCard getTopicHeadline', ...)` block in `apps/mobile/src/components/progress/SubjectCard.test.tsx`:

```ts
describe('SubjectCard unified headline', () => {
  it('renders unified headline with studied and mastered counts', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: { total: 13, explored: 2, mastered: 1, inProgress: 3, notStarted: 9 },
          sessionsCount: 4,
          wallClockMinutes: 69,
        })}
        testID="card"
      />
    );

    // studiedCount = inProgress(3) + mastered(1) = 4 (unique attempted topics)
    // NOTE: explored overlaps with inProgress/mastered — never sum all three
    expect(screen.getByText(/4 topics studied/)).toBeTruthy();
    expect(screen.getByText(/1 mastered/)).toBeTruthy();
  });

  it('shows "0 mastered" when no topics are mastered', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: { total: 13, explored: 2, mastered: 0, inProgress: 2, notStarted: 11 },
          sessionsCount: 2,
          wallClockMinutes: 30,
        })}
        testID="card"
      />
    );

    // studiedCount = inProgress(2) + mastered(0) = 2
    expect(screen.getByText(/2 topics studied/)).toBeTruthy();
    expect(screen.getByText(/0 mastered/)).toBeTruthy();
  });

  it('shows singular "topic" for 1 studied', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: { total: 13, explored: 0, mastered: 1, inProgress: 0, notStarted: 12 },
          sessionsCount: 1,
          wallClockMinutes: 30,
        })}
        testID="card"
      />
    );

    // studiedCount = inProgress(0) + mastered(1) = 1
    expect(screen.getByText(/1 topic studied/)).toBeTruthy();
  });

  it('shows session count when sessions > 0 but topics = 0', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: { total: 13, explored: 0, mastered: 0, inProgress: 0, notStarted: 13 },
          sessionsCount: 2,
          wallClockMinutes: 69,
        })}
        testID="card"
      />
    );

    expect(screen.getByText(/2 sessions completed/)).toBeTruthy();
  });

  it('shows open-ended headline for subjects with no fixed goal', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: { total: null as unknown as number, explored: 5, mastered: 2, inProgress: 3, notStarted: 0 },
          sessionsCount: 8,
          wallClockMinutes: 200,
        })}
        testID="card"
      />
    );

    // studiedCount = inProgress(3) + mastered(2) = 5
    expect(screen.getByText(/5 topics studied/)).toBeTruthy();
    expect(screen.getByText(/2 mastered/)).toBeTruthy();
  });

  it('shows progress bar for curriculum subjects', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: { total: 13, explored: 2, mastered: 2, inProgress: 3, notStarted: 8 },
          sessionsCount: 5,
          wallClockMinutes: 100,
        })}
        testID="card"
      />
    );

    expect(screen.getByTestId('card-bar')).toBeTruthy();
  });

  it('hides progress bar for open-ended subjects', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: { total: null as unknown as number, explored: 5, mastered: 2, inProgress: 3, notStarted: 0 },
          sessionsCount: 8,
          wallClockMinutes: 200,
        })}
        testID="card"
      />
    );

    expect(screen.queryByTestId('card-bar')).toBeNull();
  });

  it('shows time and session count in bottom line', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: { total: 13, explored: 1, mastered: 1, inProgress: 1, notStarted: 11 },
          sessionsCount: 3,
          wallClockMinutes: 69,
        })}
        testID="card"
      />
    );

    expect(screen.getByText(/1h 9m/)).toBeTruthy();
    expect(screen.getByText(/3 sessions/)).toBeTruthy();
  });

  it('shows "0/N topics mastered" when no activity at all', () => {
    render(<SubjectCard subject={makeSubject()} testID="card" />);

    expect(screen.getByText('0/13 topics mastered')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests — expect FAILURES**

Run: `cd apps/mobile && pnpm exec jest SubjectCard.test.tsx --no-coverage`

Expected: Multiple failures — the new headline format doesn't match old output.

- [ ] **Step 3: Rewrite `getTopicHeadline` to unified format**

Replace the entire `getTopicHeadline` function (lines 20–95) in `apps/mobile/src/components/progress/SubjectCard.tsx`:

```ts
function getTopicHeadline(subject: SubjectInventory): {
  headline: string;
  progressValue: number;
  progressMax: number;
  hideBar: boolean;
  subline: string;
} {
  const hasFixedGoal = subject.topics.total != null && subject.topics.total > 0;
  // [M5] || is intentional: wallClockMinutes defaults to 0 for pre-F-045
  // snapshots, so falsy-fallback correctly shows activeMinutes instead of 0.
  const displayMinutes = formatMinutes(
    subject.wallClockMinutes || subject.activeMinutes
  );

  // studiedCount = unique topics the child has attempted.
  // inProgress = attemptedTopicIds.size - masteredTopicIds.size (backend).
  // So inProgress + mastered = attemptedTopicIds.size (no double-counting).
  // DO NOT use explored here — explored overlaps with inProgress/mastered
  // because exploredTopicIds seeds attemptedTopicIds in the backend.
  const studiedCount = subject.topics.inProgress + subject.topics.mastered;

  // Truly no activity — show the mastery target.
  if (studiedCount === 0 && subject.sessionsCount === 0) {
    if (hasFixedGoal) {
      return {
        headline: `0/${subject.topics.total} topics mastered`,
        progressValue: 0,
        progressMax: subject.topics.total ?? 0,
        hideBar: false,
        subline: displayMinutes,
      };
    }
    return {
      headline: '0 topics studied',
      progressValue: 0,
      progressMax: 0,
      hideBar: true,
      subline: displayMinutes,
    };
  }

  // Sessions exist but no topics classified (rare edge)
  if (studiedCount === 0 && subject.sessionsCount > 0) {
    return {
      headline: `${subject.sessionsCount} ${
        subject.sessionsCount === 1 ? 'session' : 'sessions'
      } completed`,
      progressValue: 0,
      progressMax: subject.topics.total ?? 0,
      hideBar: !hasFixedGoal,
      subline: displayMinutes,
    };
  }

  // Primary: unified "N topics studied · M mastered"
  const topicWord = studiedCount === 1 ? 'topic' : 'topics';
  return {
    headline: `${studiedCount} ${topicWord} studied · ${subject.topics.mastered} mastered`,
    progressValue: subject.topics.mastered,
    progressMax: subject.topics.total ?? 0,
    hideBar: !hasFixedGoal,
    subline: `${displayMinutes} · ${subject.sessionsCount} ${
      subject.sessionsCount === 1 ? 'session' : 'sessions'
    }`,
  };
}
```

- [ ] **Step 4: Update the card JSX to use `subline` instead of `footnote`**

In the `SubjectCard` component's JSX, replace the footer section (lines 142–171):

```tsx
      <View className="flex-row items-center justify-between mt-3">
        <Text className="text-caption text-text-secondary">
          {topicHeadline.subline}
        </Text>
        <View className="flex-row items-center gap-3">
          {onAction ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onAction(action);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${ACTION_LABEL[action]} ${subject.subjectName}`}
              testID={testID ? `${testID}-action` : `subject-card-action`}
            >
              <Text className="text-body-sm font-semibold text-primary">
                {ACTION_LABEL[action]}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
```

The vocabulary/session count text is removed — session count is now part of `subline`.

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd apps/mobile && pnpm exec jest SubjectCard.test.tsx --no-coverage`

Expected: ALL pass.

- [ ] **Step 6: Commit**

```
feat(mobile): unified SubjectCard headline with studied + mastered counts
```

---

## Task 5: Enable LayoutAnimation on Android

**Files:**
- Modify: `apps/mobile/src/app/_layout.tsx` (or the root layout)
- No test needed — platform API enablement.

**Context:** `LayoutAnimation` requires an explicit opt-in on Android via `UIManager.setLayoutAnimationEnabledExperimental`. This must be called once at app startup, guarded by `Platform.OS === 'android'`. On iOS it's a no-op.

- [ ] **Step 1: Find the root layout entry point**

Check `apps/mobile/src/app/_layout.tsx` for the root layout component.

- [ ] **Step 2: Add LayoutAnimation enablement**

At the top of `apps/mobile/src/app/_layout.tsx`, after existing imports:

```ts
import { Platform, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
```

If `Platform` and `UIManager` are already imported from `react-native`, just add `UIManager` to the existing import and the conditional below it.

- [ ] **Step 3: Commit**

```
chore(mobile): enable LayoutAnimation on Android for accordion cards
```

---

## Task 6: Create `AccordionTopicList` component (extracted child)

**Files:**
- Create: `apps/mobile/src/components/progress/AccordionTopicList.tsx`
- Create: `apps/mobile/src/components/progress/AccordionTopicList.test.tsx`

**Context (H3 fix):** Data-fetching hooks (`useChildSubjectTopics`) and navigation (`useRouter`) are extracted into a dedicated `AccordionTopicList` child component. This keeps `SubjectCard` as a pure presentational component — no React Query, no expo-router dependency. The parent `SubjectCard` passes `expanded`, `childProfileId`, `subjectId`, and `subjectName` as props; `AccordionTopicList` handles the rest. This also satisfies the React rules of hooks — no conditional hook calls.

**Note on mocking (H2):** The `AccordionTopicList.test.tsx` mocks `useChildSubjectTopics` (an internal hook) and `useRouter` (expo-router). Per CLAUDE.md, "No internal mocks" applies to **integration tests**. These are **component unit tests** using React Testing Library — mocking the data boundary at the hook level is standard practice for isolated component testing. The integration test for the full flow lives in the E2E suite.

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/components/progress/AccordionTopicList.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

// Mock external boundaries for this component
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../hooks/use-dashboard', () => ({
  useChildSubjectTopics: jest.fn(),
}));

import { AccordionTopicList } from './AccordionTopicList';
import { useChildSubjectTopics } from '../../hooks/use-dashboard';

const mockUseChildSubjectTopics = useChildSubjectTopics as jest.Mock;

function makeTopic(overrides: Record<string, unknown> = {}) {
  return {
    topicId: 't-1',
    title: 'Algebra basics',
    description: '',
    completionStatus: 'in_progress',
    retentionStatus: null,
    struggleStatus: 'normal',
    masteryScore: null,
    summaryExcerpt: null,
    xpStatus: null,
    totalSessions: 2,
    ...overrides,
  };
}

describe('AccordionTopicList', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseChildSubjectTopics.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('returns null when not expanded', () => {
    const { toJSON } = render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="sub-1"
        subjectName="Math"
        expanded={false}
      />
    );

    expect(toJSON()).toBeNull();
  });

  it('lazy-loads topics on first expand', () => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: [makeTopic()],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="sub-1"
        subjectName="Math"
        expanded={true}
      />
    );

    expect(screen.getByText('Algebra basics')).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
  });

  it('shows skeleton rows while loading topics', () => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    });

    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="sub-1"
        subjectName="Math"
        expanded={true}
      />
    );

    expect(screen.getAllByTestId(/topic-skeleton/)).toHaveLength(3);
  });

  it('shows error state with retry on topic fetch failure', () => {
    const refetchMock = jest.fn();
    mockUseChildSubjectTopics.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchMock,
    });

    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="sub-1"
        subjectName="Math"
        expanded={true}
      />
    );

    expect(screen.getByText(/Could not load topics/)).toBeTruthy();
    fireEvent.press(screen.getByText(/Tap to retry/));
    expect(refetchMock).toHaveBeenCalled();
  });

  it('navigates to topic detail on topic row press', () => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: [makeTopic({ retentionStatus: 'strong' })],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="sub-1"
        subjectName="Math"
        expanded={true}
      />
    );

    fireEvent.press(screen.getByText('Algebra basics'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/child/[profileId]/topic/[topicId]',
        params: expect.objectContaining({
          profileId: 'child-1',
          topicId: 't-1',
        }),
      })
    );
  });

  it('shows "Mastered" for xpStatus verified', () => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: [makeTopic({ completionStatus: 'verified', xpStatus: 'verified' })],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="sub-1"
        subjectName="Math"
        expanded={true}
      />
    );

    expect(screen.getByText('Mastered')).toBeTruthy();
  });

  it('shows "Needs review" for decayed xpStatus', () => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: [makeTopic({ completionStatus: 'verified', xpStatus: 'decayed' })],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="sub-1"
        subjectName="Math"
        expanded={true}
      />
    );

    expect(screen.getByText('Needs review')).toBeTruthy();
  });

  it('shows "Covered" for assessment-passed without verification', () => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: [makeTopic({ completionStatus: 'completed', xpStatus: 'pending' })],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="sub-1"
        subjectName="Math"
        expanded={true}
      />
    );

    expect(screen.getByText('Covered')).toBeTruthy();
  });

  it('sets accessibilityRole="link" on topic rows', () => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: [makeTopic()],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(
      <AccordionTopicList
        childProfileId="child-1"
        subjectId="sub-1"
        subjectName="Math"
        expanded={true}
      />
    );

    const row = screen.getByLabelText('View Algebra basics details');
    expect(row.props.accessibilityRole).toBe('link');
  });
});
```

- [ ] **Step 2: Run tests — expect FAILURES**

Run: `cd apps/mobile && pnpm exec jest AccordionTopicList.test.tsx --no-coverage`

Expected: FAIL — component doesn't exist yet.

- [ ] **Step 3: Create `AccordionTopicList` component**

Create `apps/mobile/src/components/progress/AccordionTopicList.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { TopicProgress } from '@eduagent/schemas';
import { useChildSubjectTopics } from '../../hooks/use-dashboard';
import { RetentionSignal, type RetentionStatus } from './RetentionSignal';

const TOPIC_STATUS_LABELS: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Covered',
  verified: 'Mastered',
  stable: 'Mastered',
};

function getTopicStatusLabel(topic: TopicProgress): string {
  if (topic.xpStatus === 'verified') return 'Mastered';
  if (topic.xpStatus === 'decayed') return 'Needs review';
  return TOPIC_STATUS_LABELS[topic.completionStatus] ?? topic.completionStatus;
}

function TopicSkeleton({ index }: { index: number }): React.ReactElement {
  return (
    <View
      className="flex-row items-center justify-between py-3"
      testID={`topic-skeleton-${index}`}
    >
      <View className="bg-border rounded h-4 w-2/5" />
      <View className="bg-border rounded h-3 w-1/5" />
    </View>
  );
}

interface AccordionTopicListProps {
  childProfileId: string;
  subjectId: string;
  subjectName: string;
  expanded: boolean;
}

export function AccordionTopicList({
  childProfileId,
  subjectId,
  subjectName,
  expanded,
}: AccordionTopicListProps): React.ReactElement | null {
  const router = useRouter();
  const { data: topics, isLoading, isError, refetch } = useChildSubjectTopics(
    childProfileId,
    expanded ? subjectId : undefined
  );

  if (!expanded) return null;

  return (
    <View className="mt-3 border-t border-border pt-3">
      {isLoading ? (
        <>
          <TopicSkeleton index={0} />
          <TopicSkeleton index={1} />
          <TopicSkeleton index={2} />
        </>
      ) : isError ? (
        <Pressable onPress={() => refetch()}>
          <Text className="text-caption text-text-secondary text-center py-2">
            Could not load topics. Tap to retry.
          </Text>
        </Pressable>
      ) : topics && topics.length > 0 ? (
        topics.map((topic) => (
          <Pressable
            key={topic.topicId}
            onPress={(e) => {
              e.stopPropagation?.();
              router.push({
                pathname: '/(app)/child/[profileId]/topic/[topicId]',
                params: {
                  profileId: childProfileId,
                  topicId: topic.topicId,
                  title: topic.title,
                  completionStatus: topic.completionStatus,
                  masteryScore:
                    topic.masteryScore != null
                      ? String(topic.masteryScore)
                      : '',
                  retentionStatus: topic.retentionStatus ?? '',
                  totalSessions: String(topic.totalSessions ?? 0),
                  subjectId,
                  subjectName,
                },
              } as never);
            }}
            className="flex-row items-center justify-between py-2"
            accessibilityRole="link"
            accessibilityLabel={`View ${topic.title} details`}
          >
            <Text className="text-body-sm text-text-primary flex-1 me-3">
              {topic.title}
            </Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-caption text-text-secondary">
                {getTopicStatusLabel(topic)}
              </Text>
              {topic.retentionStatus &&
              topic.totalSessions >= 1 &&
              topic.completionStatus !== 'not_started' ? (
                <RetentionSignal
                  status={topic.retentionStatus as RetentionStatus}
                  compact
                  parentFacing
                />
              ) : null}
            </View>
          </Pressable>
        ))
      ) : (
        <Text className="text-caption text-text-secondary text-center py-2">
          No topics yet
        </Text>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd apps/mobile && pnpm exec jest AccordionTopicList.test.tsx --no-coverage`

Expected: ALL pass.

- [ ] **Step 5: Commit**

```
feat(mobile): create AccordionTopicList component with lazy loading and navigation
```

---

## Task 7: Accordion mode on SubjectCard (shell only)

**Files:**
- Modify: `apps/mobile/src/components/progress/SubjectCard.tsx`
- Test: `apps/mobile/src/components/progress/SubjectCard.test.tsx`

**Context:** Add accordion expand/collapse to SubjectCard. The card manages `expanded` state and renders `AccordionTopicList` as a child. SubjectCard itself gains NO new hooks — it stays presentational. When `childProfileId` + `subjectId` are provided (and `onPress` is NOT), tapping toggles expand.

- [ ] **Step 1: Write failing tests for accordion shell behavior**

Add to `apps/mobile/src/components/progress/SubjectCard.test.tsx`:

```tsx
import { fireEvent } from '@testing-library/react-native';

// AccordionTopicList is the only thing we mock from SubjectCard's perspective.
// This is the component boundary — SubjectCard doesn't know about hooks/router.
jest.mock('./AccordionTopicList', () => ({
  AccordionTopicList: ({ expanded }: { expanded: boolean }) =>
    expanded ? <MockExpandedView /> : null,
}));

// Simple mock component to detect expanded state
function MockExpandedView() {
  const { Text } = require('react-native');
  return <Text testID="mock-topic-list">Topics visible</Text>;
}

describe('SubjectCard accordion mode', () => {
  it('toggles expanded state on tap', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: { total: 13, explored: 1, mastered: 0, inProgress: 1, notStarted: 11 },
          sessionsCount: 3,
          wallClockMinutes: 60,
        })}
        childProfileId="child-1"
        subjectId="sub-1"
        testID="card"
      />
    );

    expect(screen.getByText(/See topics/)).toBeTruthy();
    expect(screen.queryByTestId('mock-topic-list')).toBeNull();

    fireEvent.press(screen.getByTestId('card'));
    expect(screen.getByText(/Hide topics/)).toBeTruthy();
    expect(screen.getByTestId('mock-topic-list')).toBeTruthy();

    fireEvent.press(screen.getByTestId('card'));
    expect(screen.getByText(/See topics/)).toBeTruthy();
    expect(screen.queryByTestId('mock-topic-list')).toBeNull();
  });

  it('sets accessibilityRole and accessibilityState on accordion', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: { total: 13, explored: 0, mastered: 0, inProgress: 1, notStarted: 12 },
          sessionsCount: 1,
          wallClockMinutes: 10,
        })}
        childProfileId="child-1"
        subjectId="sub-1"
        testID="card"
      />
    );

    const card = screen.getByTestId('card');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityState).toEqual({ expanded: false });
  });

  it('does not show See topics hint when no topics studied and no sessions', () => {
    render(
      <SubjectCard
        subject={makeSubject()}
        childProfileId="child-1"
        subjectId="sub-1"
        testID="card"
      />
    );

    expect(screen.queryByText(/See topics/)).toBeNull();
  });

  it('keeps navigation mode when onPress is provided (child view)', () => {
    const onPress = jest.fn();
    render(
      <SubjectCard
        subject={makeSubject({ sessionsCount: 2, wallClockMinutes: 30 })}
        onPress={onPress}
        testID="card"
      />
    );

    fireEvent.press(screen.getByTestId('card'));
    expect(onPress).toHaveBeenCalled();
    // No accordion behavior
    expect(screen.queryByText(/See topics/)).toBeNull();
    expect(screen.queryByTestId('mock-topic-list')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAILURES**

Run: `cd apps/mobile && pnpm exec jest SubjectCard.test.tsx --no-coverage`

Expected: Multiple failures — accordion props don't exist yet.

- [ ] **Step 3: Add accordion props and wire AccordionTopicList**

Update the props interface in `SubjectCard.tsx`:

```ts
interface SubjectCardProps {
  subject: SubjectInventory;
  onPress?: () => void;
  onAction?: (action: SubjectCardAction) => void;
  /** Accordion mode: provide childProfileId + subjectId to enable expand/collapse with topic list */
  childProfileId?: string;
  subjectId?: string;
  testID?: string;
}
```

Add imports:

```ts
import { useState } from 'react';
import { LayoutAnimation, Pressable, Text, View } from 'react-native';
import type { SubjectInventory } from '@eduagent/schemas';
import { AccordionTopicList } from './AccordionTopicList';
import { ProgressBar } from './ProgressBar';
import { formatMinutes } from '../../lib/format-relative-date';
```

Note: NO `useRouter`, NO `useChildSubjectTopics`, NO `TopicProgress` import. SubjectCard stays hook-free (apart from `useState`).

- [ ] **Step 4: Implement accordion mode in the component body**

Replace the `SubjectCard` component function:

```tsx
export function SubjectCard({
  subject,
  onPress,
  onAction,
  childProfileId,
  subjectId,
  testID,
}: SubjectCardProps): React.ReactElement {
  const isAccordionMode = !!childProfileId && !!subjectId && !onPress;
  const [expanded, setExpanded] = useState(false);

  const hasExpandableTopics =
    subject.topics.inProgress + subject.topics.mastered > 0 ||
    subject.sessionsCount > 0;

  const topicHeadline = getTopicHeadline(subject);
  const action = getContextualAction(subject);

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  const content = (
    <View className="bg-surface rounded-card p-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 me-3">
          <Text className="text-body font-semibold text-text-primary">
            {subject.subjectName}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {topicHeadline.headline}
          </Text>
        </View>
        {subject.estimatedProficiencyLabel || subject.estimatedProficiency ? (
          <View className="bg-background rounded-full px-3 py-1">
            <Text className="text-caption font-semibold text-text-secondary">
              {subject.estimatedProficiencyLabel ?? subject.estimatedProficiency}
            </Text>
          </View>
        ) : null}
      </View>

      {!topicHeadline.hideBar ? (
        <View className="mt-3">
          <ProgressBar
            value={topicHeadline.progressValue}
            max={topicHeadline.progressMax}
            testID={testID ? `${testID}-bar` : undefined}
          />
        </View>
      ) : null}

      <View className="flex-row items-center justify-between mt-3">
        <Text className="text-caption text-text-secondary">
          {topicHeadline.subline}
        </Text>
        <View className="flex-row items-center gap-3">
          {onAction ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onAction(action);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${ACTION_LABEL[action]} ${subject.subjectName}`}
              testID={testID ? `${testID}-action` : `subject-card-action`}
            >
              <Text className="text-body-sm font-semibold text-primary">
                {ACTION_LABEL[action]}
              </Text>
            </Pressable>
          ) : null}
          {isAccordionMode && hasExpandableTopics ? (
            <Text className="text-caption text-primary">
              {expanded ? '▴ Hide topics' : '▾ See topics'}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Expanded topic list — data fetching + navigation live in AccordionTopicList */}
      {isAccordionMode ? (
        <AccordionTopicList
          childProfileId={childProfileId}
          subjectId={subjectId}
          subjectName={subject.subjectName}
          expanded={expanded}
        />
      ) : null}
    </View>
  );

  // Accordion mode — card is self-contained, tap toggles expand
  if (isAccordionMode) {
    return (
      <Pressable
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${subject.subjectName}, ${expanded ? 'expanded' : 'collapsed'}`}
        accessibilityHint="Tap to show topics"
        testID={testID}
      >
        {content}
      </Pressable>
    );
  }

  // Navigation mode — existing behavior
  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${subject.subjectName} progress`}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd apps/mobile && pnpm exec jest SubjectCard.test.tsx --no-coverage`

Expected: ALL pass (both headline and accordion describe blocks).

- [ ] **Step 6: Commit**

```
feat(mobile): accordion expand/collapse shell on SubjectCard using AccordionTopicList
```

---

## Task 8: Filter empty subjects + wire accordion in parent dashboard

**Files:**
- Modify: `apps/mobile/src/components/progress/SubjectCard.tsx` (add exported predicate)
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:458-482`
- Test: `apps/mobile/src/components/progress/SubjectCard.test.tsx`

**Context:** In the parent dashboard, replace the `onPress` navigation prop with `childProfileId` + `subjectId` for accordion mode, and filter out subjects with zero activity. The filter predicate is extracted as a named function in SubjectCard.tsx so both the dashboard and the test use the same logic (M4 fix).

- [ ] **Step 1: Add the filter predicate and write tests**

Add to `apps/mobile/src/components/progress/SubjectCard.tsx`, before the `SubjectCard` function:

```ts
/** Returns true when a subject has any activity — used to hide empty subjects in parent view */
export function hasSubjectActivity(s: SubjectInventory): boolean {
  return (
    s.sessionsCount > 0 ||
    s.topics.explored > 0 ||
    s.topics.inProgress > 0 ||
    s.topics.mastered > 0
  );
}
```

Add to `apps/mobile/src/components/progress/SubjectCard.test.tsx`:

```tsx
import { hasSubjectActivity } from './SubjectCard';

describe('hasSubjectActivity', () => {
  it('returns false for subjects with no sessions or topics', () => {
    const empty = makeSubject({
      sessionsCount: 0,
      topics: { total: 13, explored: 0, mastered: 0, inProgress: 0, notStarted: 13 },
    });
    expect(hasSubjectActivity(empty)).toBe(false);
  });

  it('returns true when sessionsCount > 0', () => {
    const active = makeSubject({ sessionsCount: 2 });
    expect(hasSubjectActivity(active)).toBe(true);
  });

  it('returns true for legacy data with assessments only (mastered > 0)', () => {
    const legacy = makeSubject({
      sessionsCount: 0,
      topics: { total: 13, explored: 0, mastered: 1, inProgress: 0, notStarted: 12 },
    });
    expect(hasSubjectActivity(legacy)).toBe(true);
  });

  it('returns true when inProgress > 0', () => {
    const inProgress = makeSubject({
      sessionsCount: 0,
      topics: { total: 13, explored: 0, mastered: 0, inProgress: 1, notStarted: 12 },
    });
    expect(hasSubjectActivity(inProgress)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect PASS**

Run: `cd apps/mobile && pnpm exec jest SubjectCard.test.tsx --no-coverage -t "hasSubjectActivity"`

- [ ] **Step 3: Update the parent dashboard rendering**

In `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`, replace lines 458–482:

```tsx
// Before:
        ) : inventory?.subjects && inventory.subjects.length > 0 ? (
          <>
            <Text className="text-h3 font-semibold text-text-primary mt-4 mb-2">
              Subjects
            </Text>
            {inventory.subjects.map((subject) => (
              <View key={subject.subjectId} className="mt-3">
                <SubjectCard
                  subject={subject}
                  onPress={() => {
                    if (!profileId) return;
                    router.push({
                      pathname: '/(app)/child/[profileId]/subjects/[subjectId]',
                      params: {
                        profileId,
                        subjectId: subject.subjectId,
                        subjectName: subject.subjectName,
                      },
                    } as never);
                  }}
                  testID={`subject-card-${subject.subjectId}`}
                />
              </View>
            ))}
          </>

Also add `hasSubjectActivity` to the barrel export in `apps/mobile/src/components/progress/index.ts`:

```ts
export { SubjectCard, hasSubjectActivity } from './SubjectCard';
```

Then update the import at top of `index.tsx` (it already imports `SubjectCard` from the barrel — add `hasSubjectActivity`):

```ts
import {
  SubjectCard,
  hasSubjectActivity,
} from '../../../../components/progress';
```

```tsx
// After:
        ) : inventory?.subjects && inventory.subjects.length > 0 ? (
          <>
            <Text className="text-h3 font-semibold text-text-primary mt-4 mb-2">
              Subjects
            </Text>
            {inventory.subjects
              .filter(hasSubjectActivity)
              .map((subject) => (
                <View key={subject.subjectId} className="mt-3">
                  <SubjectCard
                    subject={subject}
                    childProfileId={profileId}
                    subjectId={subject.subjectId}
                    testID={`subject-card-${subject.subjectId}`}
                  />
                </View>
              ))}
          </>
```

Key changes:
1. **Filter** with the extracted `hasSubjectActivity` predicate before `.map()`
2. Replace `onPress` navigation prop with `childProfileId={profileId}` and `subjectId={subject.subjectId}`
3. Remove the `router.push` navigation handler — topic-level navigation now happens from within `AccordionTopicList`
4. Note: `onAction` was never passed in parent view — no change needed (L1 acknowledged)

- [ ] **Step 4: Verify the child view is NOT affected**

Check `apps/mobile/src/app/(app)/progress/index.tsx` — the child's own progress screen should still use `onPress` and `onAction` props, NOT accordion props. No changes needed there. Verify this by reading the file.

- [ ] **Step 5: Run typecheck + lint**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Run: `pnpm exec nx lint mobile`

Expected: Both pass. The parent dashboard no longer needs `router` for subject navigation (it may still need it for other navigations on the page — leave the import).

- [ ] **Step 6: Commit**

```
feat(mobile): filter empty subjects + wire accordion mode in parent dashboard
```

---

## Task 9: Final validation

**Files:** All modified files.

- [ ] **Step 1: Run API tests**

Run: `cd apps/api && pnpm exec jest --no-coverage`

Expected: ALL pass.

- [ ] **Step 2: Run mobile tests**

Run: `cd apps/mobile && pnpm exec jest --no-coverage`

Expected: ALL pass.

- [ ] **Step 3: Run typecheck for both apps**

Run: `pnpm exec nx run api:typecheck && cd apps/mobile && pnpm exec tsc --noEmit`

Expected: Both pass.

- [ ] **Step 4: Run lint**

Run: `pnpm exec nx run api:lint && pnpm exec nx lint mobile`

Expected: Both pass.

- [ ] **Step 5: Manual smoke test**

Start the mobile dev server and verify on the parent dashboard:
1. Subject cards show unified `"N topics studied · M mastered"` headline
2. Empty subjects (0 sessions, 0 topics) are hidden
3. Tapping a card expands with smooth LayoutAnimation
4. Topics load with skeleton → real data
5. "See topics" / "Hide topics" toggles correctly
6. Topic rows navigate to detail screen
7. Error state shows "Could not load topics. Tap to retry." (simulate by disabling network)
8. Child's own progress screen is unchanged — still uses navigation mode

- [ ] **Step 6: Final commit if any adjustments were needed**

```
fix(mobile): polish expandable subject cards after smoke test
```

---

## Deployment Notes

**Tasks 1–3 must be deployed atomically.** Between Task 1 and Task 2 completion, `buildSubjectMetric` and `buildSubjectInventory` disagree on mastery counts — the global hero pill (from `buildSubjectMetric`) would show the tightened count while subject cards (from `buildSubjectInventory`) show the old (wider) count. During development this is fine (both are committed before any push), but never cherry-pick Task 1 without Task 2.

**Mastered counts will decrease** for existing users on deploy. This is intentional — see spec § Rollout & rollback. Snapshot-backed surfaces update on next snapshot generation (triggered by session end). Already-persisted monthly reports are frozen at the old counts permanently.

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Topic fetch fails on expand | Network error, API down | "Could not load topics. Tap to retry." inside card | Tap to retry, collapse card |
| All subjects inactive | New child, no sessions yet | "No subjects yet" empty state (existing) | — |
| Topic decays after expand | Retention card fails between renders | Count updates on next inventory refresh | Stale for current view, correct on re-render |
| LayoutAnimation unavailable | Old Android, missing experimental flag | Card expands instantly (no animation) | Functional, just not animated |
| Topic fetch slow (>10s) | Slow network | Skeleton rows persist, no hard timeout | Collapse + re-expand to retry; React Query retry handles transient failures |
| Stale topic data in cache | User navigates away and back | Outdated topic statuses shown briefly | React Query refetch on mount (staleTime = 0) |
