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
| `apps/mobile/src/components/progress/SubjectCard.tsx` | Card UI: headline, accordion, topic list | Modify (major rewrite of `getTopicHeadline`, new accordion mode) |
| `apps/mobile/src/components/progress/SubjectCard.test.tsx` | Frontend tests for card behavior | Modify (rewrite headline tests, add accordion tests) |
| `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` | Parent dashboard: filter + accordion wiring | Modify (lines 458–482) |
| `apps/mobile/src/app/_layout.tsx` or app init | LayoutAnimation Android enablement | Modify (one-liner) |

---

## Task 1: Tighten `masteredTopicIds` in `buildSubjectMetric` (backend)

**Files:**
- Modify: `apps/api/src/services/snapshot-aggregation.ts:332-343`
- Test: `apps/api/src/services/snapshot-aggregation.test.ts`

**Context:** `buildSubjectMetric` (line 286) is used by `computeProgressMetrics` (line 380) to produce `ProgressMetrics.subjects[].topicsMastered` and the global `topicsMastered` aggregate. Currently, lines 332–337 add any topic with `assessment.status === 'passed'` to `masteredTopicIds`. We need to remove that entire assessment loop so that only `xpStatus === 'verified'` retention cards count as mastered.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/services/snapshot-aggregation.test.ts`. This test requires calling `computeProgressMetrics` with a state where a topic has `assessment.status === 'passed'` but no retention card with `xpStatus === 'verified'`. Since the existing test file mocks at the DB level (using `jest.mock` for milestone-detection, celebrations, etc.) and tests `refreshProgressSnapshot`/`upsertProgressSnapshot`, we need a unit-level test for `buildSubjectMetric`.

However, `buildSubjectMetric` is not exported — it's a private function called by `computeProgressMetrics`, which IS exported. The test must go through `computeProgressMetrics`, which calls `loadProgressState` (DB access). The existing test pattern mocks the DB query layer.

**Alternative approach:** Since the existing tests mock at the snapshot level (`makeMetrics`) and don't test the inner aggregation functions, and `computeProgressMetrics` requires DB access, the best approach for this data-layer change is to add **integration tests** that exercise the real aggregation pipeline. Create a focused test file:

Add to `apps/api/src/services/snapshot-aggregation.test.ts` alongside existing tests. Since the existing file already mocks `milestone-detection`, `celebrations`, `language-curriculum`, and `sentry`, we can add a describe block that tests `computeProgressMetrics` by mocking `loadProgressState` directly.

First, we need to check if `loadProgressState` can be mocked. It's a private async function. The cleanest approach is to extract the pure computation into a testable helper. But that's a refactor beyond scope.

**Practical approach:** The `buildSubjectMetric` and `buildSubjectInventory` functions operate on `ProgressState` — a plain object. We can test them by extracting them or by testing through the integration test suite. Since the spec's "Verified by" section specifies test names like `"counts assessment-passed-only topic as inProgress, not mastered"`, we should create a targeted test file that directly tests the aggregation logic.

Create `apps/api/src/services/snapshot-mastery.test.ts` — a focused unit test that imports the functions we need to make testable.

**Actually — simplest path:** Export `buildSubjectMetric` and `buildSubjectInventory` for testing (add `/** @internal */` JSDoc). Then write direct unit tests.

```ts
// In snapshot-aggregation.test.ts, add this describe block at the end:

describe('masteredTopicIds tightening [1A]', () => {
  // We'll test via computeProgressMetrics by mocking loadProgressState.
  // Since loadProgressState is not exported, we test the observable behavior:
  // the ProgressMetrics.subjects[].topicsMastered output.
  //
  // For unit-level testing of the pure logic, we export the helpers.
});
```

Given the complexity of mocking `loadProgressState`, the most pragmatic path is to:
1. Export `buildSubjectMetric` as `/** @internal */` for testing
2. Write a direct unit test with a hand-built `ProgressState`

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

Add test (note: this function is async and takes a `db` param — pass `null as any` since we won't hit the language-progress DB path for `socratic` subjects):

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
          topics: { total: 13, explored: 2, mastered: 1, inProgress: 1, notStarted: 9 },
          sessionsCount: 4,
          wallClockMinutes: 69,
        })}
        testID="card"
      />
    );

    // 2 explored + 1 mastered + 1 inProgress = 4 studied
    expect(screen.getByText(/4 topics studied/)).toBeTruthy();
    expect(screen.getByText(/1 mastered/)).toBeTruthy();
  });

  it('shows "0 mastered" when no topics are mastered', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: { total: 13, explored: 2, mastered: 0, inProgress: 0, notStarted: 11 },
          sessionsCount: 2,
          wallClockMinutes: 30,
        })}
        testID="card"
      />
    );

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
          topics: { total: null as unknown as number, explored: 5, mastered: 2, inProgress: 1, notStarted: 0 },
          sessionsCount: 8,
          wallClockMinutes: 200,
        })}
        testID="card"
      />
    );

    expect(screen.getByText(/5 topics studied/)).toBeTruthy();
    expect(screen.getByText(/2 mastered/)).toBeTruthy();
  });

  it('shows progress bar for curriculum subjects', () => {
    render(
      <SubjectCard
        subject={makeSubject({
          topics: { total: 13, explored: 3, mastered: 2, inProgress: 1, notStarted: 7 },
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
          topics: { total: null as unknown as number, explored: 5, mastered: 2, inProgress: 1, notStarted: 0 },
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
          topics: { total: 13, explored: 2, mastered: 1, inProgress: 0, notStarted: 10 },
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

  const studiedCount =
    subject.topics.explored +
    subject.topics.mastered +
    subject.topics.inProgress;

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

## Task 6: Accordion mode — expand/collapse with lazy topic loading

**Files:**
- Modify: `apps/mobile/src/components/progress/SubjectCard.tsx`
- Test: `apps/mobile/src/components/progress/SubjectCard.test.tsx`

**Context:** Add accordion mode to SubjectCard. When `childProfileId` and `subjectId` props are provided (and `onPress` is NOT), tapping the card toggles an expanded state that lazy-loads and displays topics inline.

- [ ] **Step 1: Write failing tests for accordion behavior**

Add to `apps/mobile/src/components/progress/SubjectCard.test.tsx`:

```tsx
import { fireEvent, waitFor } from '@testing-library/react-native';

// Mock the hook at the top of the file
jest.mock('../../hooks/use-dashboard', () => ({
  useChildSubjectTopics: jest.fn(),
}));

import { useChildSubjectTopics } from '../../hooks/use-dashboard';

const mockUseChildSubjectTopics = useChildSubjectTopics as jest.Mock;

describe('SubjectCard accordion mode', () => {
  beforeEach(() => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('toggles expanded state on tap', () => {
    render(
      <SubjectCard
        subject={makeSubject({ sessionsCount: 3, wallClockMinutes: 60 })}
        childProfileId="child-1"
        subjectId="sub-1"
        testID="card"
      />
    );

    expect(screen.getByText(/See topics/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('card'));
    expect(screen.getByText(/Hide topics/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('card'));
    expect(screen.getByText(/See topics/)).toBeTruthy();
  });

  it('lazy-loads topics on first expand', () => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: [
        {
          topicId: 't-1', title: 'Algebra basics',
          completionStatus: 'in_progress', retentionStatus: null,
          struggleStatus: 'normal', masteryScore: null,
          summaryExcerpt: null, xpStatus: null, totalSessions: 2,
          description: '',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(
      <SubjectCard
        subject={makeSubject({
          topics: { total: 13, explored: 1, mastered: 0, inProgress: 1, notStarted: 11 },
          sessionsCount: 2,
          wallClockMinutes: 30,
        })}
        childProfileId="child-1"
        subjectId="sub-1"
        testID="card"
      />
    );

    // Initially hook should be called with enabled: false
    fireEvent.press(screen.getByTestId('card'));
    expect(screen.getByText('Algebra basics')).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
  });

  it('sets accessibilityRole and accessibilityState on accordion', () => {
    render(
      <SubjectCard
        subject={makeSubject({ sessionsCount: 1, wallClockMinutes: 10 })}
        childProfileId="child-1"
        subjectId="sub-1"
        testID="card"
      />
    );

    const card = screen.getByTestId('card');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityState).toEqual({ expanded: false });
  });

  it('shows skeleton rows while loading topics', () => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    });

    render(
      <SubjectCard
        subject={makeSubject({ sessionsCount: 2, wallClockMinutes: 30 })}
        childProfileId="child-1"
        subjectId="sub-1"
        testID="card"
      />
    );

    fireEvent.press(screen.getByTestId('card'));
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
      <SubjectCard
        subject={makeSubject({ sessionsCount: 2, wallClockMinutes: 30 })}
        childProfileId="child-1"
        subjectId="sub-1"
        testID="card"
      />
    );

    fireEvent.press(screen.getByTestId('card'));
    expect(screen.getByText(/Could not load topics/)).toBeTruthy();
    fireEvent.press(screen.getByText(/Tap to retry/));
    expect(refetchMock).toHaveBeenCalled();
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
});
```

- [ ] **Step 2: Run tests — expect FAILURES**

Run: `cd apps/mobile && pnpm exec jest SubjectCard.test.tsx --no-coverage`

Expected: Multiple failures — accordion props don't exist yet.

- [ ] **Step 3: Add accordion props and state to SubjectCard**

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

Add imports at the top:

```ts
import { useState } from 'react';
import { LayoutAnimation, Pressable, Text, View } from 'react-native';
import type { SubjectInventory, TopicProgress } from '@eduagent/schemas';
import { useChildSubjectTopics } from '../../hooks/use-dashboard';
import { RetentionSignal, type RetentionStatus } from './RetentionSignal';
import { ProgressBar } from './ProgressBar';
import { formatMinutes } from '../../lib/format-relative-date';
```

- [ ] **Step 4: Implement accordion mode in the component body**

Replace the `SubjectCard` component function:

```tsx
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
    subject.topics.explored + subject.topics.mastered + subject.topics.inProgress > 0 ||
    subject.sessionsCount > 0;

  const { data: topics, isLoading: topicsLoading, isError: topicsError, refetch } =
    useChildSubjectTopics(
      isAccordionMode ? childProfileId : undefined,
      isAccordionMode && expanded ? subjectId : undefined
    );

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

      {/* Expanded topic list */}
      {isAccordionMode && expanded ? (
        <View className="mt-3 border-t border-border pt-3">
          {topicsLoading ? (
            <>
              <TopicSkeleton index={0} />
              <TopicSkeleton index={1} />
              <TopicSkeleton index={2} />
            </>
          ) : topicsError ? (
            <Pressable onPress={() => refetch()}>
              <Text className="text-caption text-text-secondary text-center py-2">
                Could not load topics. Tap to retry.
              </Text>
            </Pressable>
          ) : topics && topics.length > 0 ? (
            topics.map((topic) => (
              <View
                key={topic.topicId}
                className="flex-row items-center justify-between py-2"
                accessibilityRole="text"
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
              </View>
            ))
          ) : (
            <Text className="text-caption text-text-secondary text-center py-2">
              No topics yet
            </Text>
          )}
        </View>
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
feat(mobile): accordion expand/collapse with lazy topic list on SubjectCard
```

---

## Task 7: Filter empty subjects + wire accordion in parent dashboard

**Files:**
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:458-482`
- Test: `apps/mobile/src/components/progress/SubjectCard.test.tsx` (already covered)

**Context:** In the parent dashboard, replace the `onPress` navigation prop with `childProfileId` + `subjectId` for accordion mode, and filter out subjects with zero activity.

- [ ] **Step 1: Write failing test for empty-subject filtering**

Add to `SubjectCard.test.tsx`:

```tsx
describe('SubjectCard empty-subject filter', () => {
  it('filters subjects with no sessions or topics', () => {
    // This tests the filtering logic that will live in the parent dashboard.
    // The SubjectCard itself doesn't filter — it's the parent's job.
    // We verify the predicate here for documentation.
    const emptySubject = makeSubject({
      sessionsCount: 0,
      topics: { total: 13, explored: 0, mastered: 0, inProgress: 0, notStarted: 13 },
    });
    const activeSubject = makeSubject({
      subjectId: 'sub-2',
      subjectName: 'Science',
      sessionsCount: 2,
      wallClockMinutes: 30,
      topics: { total: 10, explored: 1, mastered: 0, inProgress: 1, notStarted: 8 },
    });

    const subjects = [emptySubject, activeSubject];
    const filtered = subjects.filter(
      (s) => s.sessionsCount > 0 || s.topics.explored > 0 || s.topics.inProgress > 0 || s.topics.mastered > 0
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].subjectName).toBe('Science');
  });

  it('keeps subjects with only assessments (legacy data)', () => {
    const legacySubject = makeSubject({
      sessionsCount: 0,
      topics: { total: 13, explored: 0, mastered: 1, inProgress: 0, notStarted: 12 },
    });

    const filtered = [legacySubject].filter(
      (s) => s.sessionsCount > 0 || s.topics.explored > 0 || s.topics.inProgress > 0 || s.topics.mastered > 0
    );

    expect(filtered).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — expect PASS immediately** (pure filter logic test)

Run: `cd apps/mobile && pnpm exec jest SubjectCard.test.tsx --no-coverage -t "empty-subject filter"`

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

// After:
        ) : inventory?.subjects && inventory.subjects.length > 0 ? (
          <>
            <Text className="text-h3 font-semibold text-text-primary mt-4 mb-2">
              Subjects
            </Text>
            {inventory.subjects
              .filter(
                (s) =>
                  s.sessionsCount > 0 ||
                  s.topics.explored > 0 ||
                  s.topics.inProgress > 0 ||
                  s.topics.mastered > 0
              )
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
1. **Filter** with the expanded predicate before `.map()`
2. Replace `onPress` navigation prop with `childProfileId={profileId}` and `subjectId={subject.subjectId}`
3. Remove the `router.push` navigation handler — topic-level navigation now happens from within the accordion's topic rows

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

## Task 8: Add topic row navigation from accordion

**Files:**
- Modify: `apps/mobile/src/components/progress/SubjectCard.tsx`
- No new test file — existing accordion tests + manual verification.

**Context:** Tapping a topic row inside the expanded accordion should navigate to `child/[profileId]/topic/[topicId]`. This requires `useRouter` from expo-router inside SubjectCard, and passing navigation params.

- [ ] **Step 1: Write the failing test**

Add to the accordion tests in `SubjectCard.test.tsx`:

```tsx
// At top of file, mock expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// In the accordion describe block:
it('navigates to topic detail on topic row press', () => {
  mockPush.mockClear();
  mockUseChildSubjectTopics.mockReturnValue({
    data: [
      {
        topicId: 't-1', title: 'Algebra basics',
        completionStatus: 'in_progress', retentionStatus: 'strong',
        struggleStatus: 'normal', masteryScore: 0.5,
        summaryExcerpt: null, xpStatus: null, totalSessions: 2,
        description: 'Intro to algebra',
      },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });

  render(
    <SubjectCard
      subject={makeSubject({
        topics: { total: 13, explored: 1, mastered: 0, inProgress: 1, notStarted: 11 },
        sessionsCount: 2,
        wallClockMinutes: 30,
      })}
      childProfileId="child-1"
      subjectId="sub-1"
      testID="card"
    />
  );

  fireEvent.press(screen.getByTestId('card'));
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
```

- [ ] **Step 2: Run test — expect FAILURE**

Run: `cd apps/mobile && pnpm exec jest SubjectCard.test.tsx --no-coverage -t "navigates to topic detail"`

Expected: FAIL — topic rows aren't Pressable yet.

- [ ] **Step 3: Add router navigation to topic rows**

In `SubjectCard.tsx`, add `useRouter` import:

```ts
import { useRouter } from 'expo-router';
```

Inside the component, add:

```ts
const router = useRouter();
```

Replace the topic row `View` with a `Pressable`:

```tsx
topics.map((topic) => (
  <Pressable
    key={topic.topicId}
    onPress={(e) => {
      e.stopPropagation?.();
      router.push({
        pathname: '/(app)/child/[profileId]/topic/[topicId]',
        params: {
          profileId: childProfileId!,
          topicId: topic.topicId,
          title: topic.title,
          completionStatus: topic.completionStatus,
          masteryScore: topic.masteryScore != null ? String(topic.masteryScore) : '',
          retentionStatus: topic.retentionStatus ?? '',
          totalSessions: String(topic.totalSessions ?? 0),
          subjectId: subjectId!,
          subjectName: subject.subjectName,
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
```

The `e.stopPropagation?.()` prevents the topic row press from also toggling the accordion.

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd apps/mobile && pnpm exec jest SubjectCard.test.tsx --no-coverage`

Expected: ALL pass.

- [ ] **Step 5: Commit**

```
feat(mobile): topic row navigation from accordion to detail screen
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
