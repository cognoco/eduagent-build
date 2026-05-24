# WI-80 Cross-Profile Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close WI-80 DeepSec cross-tenant/cross-profile data-isolation gaps by making every topic-derived read/write prove ownership through the profile-owned parent chain and by removing mobile profile-switch races.

**Architecture:** Add a small API service helper for profile-owned curriculum-topic resolution, then replace repeated unscoped topic lookups in retention, progress, coaching, interleaved retrieval, and recall nudges. Preserve existing route/service boundaries: route handlers remain thin, service logic owns authorization, and joined reads enforce both topic parent chains: `curriculumTopics.bookId -> curriculumBooks.subjectId -> subjects.id` and `curriculumTopics.curriculumId -> curricula.subjectId -> same subjects.id -> subjects.profileId`. Mobile push-token registration will bind the async token fetch to the profile that was active when it began and skip mutation if the active profile/proxy state changes.

**Tech Stack:** TypeScript, Drizzle ORM, Hono services, Jest integration/unit tests, React Native hooks with React Query.

---

## Current Finding Map

Already fixed on `origin/main`; keep regression coverage:
- WI-135 / WI-183 assessment subject-topic ownership: `apps/api/src/services/assessments.ts` already joins `curriculumTopics -> curricula -> subjects.profileId`.
- WI-140 / WI-199 topic move theft: `apps/api/src/services/curriculum.ts` already validates source and target books against the scoped subject; integration break test exists in `apps/api/src/services/curriculum-topics.integration.test.ts`.
- WI-148 / WI-200 topic-order explanation leak: `explainTopicOrdering()` already constrains topic by subject curriculum; integration break test exists.
- WI-151 dictation subject pollution: `recordDictationResult()` already checks subject ownership; integration break test exists.
- WI-208 evaluate eligibility title leak: `checkEvaluateEligibility()` already joins through `subjects.profileId`; integration break test exists.
- WI-280 round detail cache: `useRoundDetail()` query key already includes `activeProfile.id`; break test exists.

Live gaps to close in this branch:
- WI-119 recall nudge topic title lookup uses unscoped topic IDs from event payload.
- WI-162 progress topic detail loads `curriculumTopics` by ID alone.
- WI-166/WI-167/WI-233/WI-319 retention card creation can pair a profile with any topic if a caller reaches `ensureRetentionCard()`.
- WI-196 coaching-card overdue enrichment reads topic/book titles without profile ownership.
- WI-218 interleaved topic selection enriches card topic IDs without proving those topics still belong to the profile.
- WI-311 mobile push-token registration can mutate after an async profile/proxy switch.
- WI-322 database shape still permits independent `bookId` / `curriculumId` references; this plan defends service boundaries by requiring both parent chains to resolve to the same profile-owned subject and adds a scanner/guard instead of a migration, because the current schema intentionally lacks profile columns on topic-adjacent tables and there is already documented deferred migration complexity.

## Files

- Create: `apps/api/src/services/curriculum-topic-ownership.ts`
- Create: `apps/api/src/services/curriculum-topic-ownership.test.ts`
- Modify: `apps/api/src/services/retention-data.ts`
- Modify: `apps/api/src/services/retention-data.test.ts`
- Modify: `apps/api/src/services/progress.ts`
- Modify: `apps/api/src/services/progress.test.ts`
- Modify: `apps/api/src/services/coaching-cards.ts`
- Modify: `apps/api/src/services/coaching-cards.test.ts`
- Modify: `apps/api/src/services/interleaved.ts`
- Modify: `apps/api/src/services/interleaved.test.ts`
- Modify: `apps/api/src/inngest/functions/recall-nudge-send.ts`
- Modify: `apps/api/src/inngest/functions/recall-nudge-send.test.ts`
- Modify: `apps/mobile/src/hooks/use-push-token-registration.ts`
- Modify: `apps/mobile/src/hooks/use-push-token-registration.test.ts`
- Modify after implementation: `docs/superpowers/plans/2026-05-24-wi-80-cross-profile-isolation.md` for exact verification notes under `## Verification Log`.

---

### Task 1: Shared Owned Topic Resolver

**Files:**
- Create: `apps/api/src/services/curriculum-topic-ownership.ts`
- Create: `apps/api/src/services/curriculum-topic-ownership.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Add tests that assert the helper builds a parent-chain query and returns `null` when no owned row is found:

```ts
import {
  findOwnedCurriculumTopic,
  assertOwnedCurriculumTopic,
} from './curriculum-topic-ownership';
import { NotFoundError } from '../errors';

describe('curriculum-topic-ownership', () => {
  it('returns owned topic metadata from the joined parent-chain query', async () => {
    const limit = jest.fn().mockResolvedValue([
      {
        topicId: 'topic-owned',
        topicTitle: 'Owned Topic',
        topicDescription: 'desc',
        bookId: 'book-owned',
        bookTitle: 'Book',
        curriculumId: 'curriculum-owned',
        subjectId: 'subject-owned',
      },
    ]);
    const where = jest.fn(() => ({ limit }));
    const db = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              innerJoin: jest.fn(() => ({ where })),
            })),
          })),
        })),
      })),
    } as never;

    await expect(
      findOwnedCurriculumTopic(db, {
        profileId: 'profile-owned',
        topicId: 'topic-owned',
      }),
    ).resolves.toMatchObject({
      topicId: 'topic-owned',
      topicTitle: 'Owned Topic',
      subjectId: 'subject-owned',
    });
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('throws NotFoundError from assertOwnedCurriculumTopic when topic is not owned', async () => {
    const limit = jest.fn().mockResolvedValue([]);
    const where = jest.fn(() => ({ limit }));
    const db = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              innerJoin: jest.fn(() => ({ where })),
            })),
          })),
        })),
      })),
    } as never;

    await expect(
      assertOwnedCurriculumTopic(db, {
        profileId: 'profile-a',
        topicId: 'topic-b',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

- [ ] **Step 2: Run the new tests red**

Run: `pnpm exec jest apps/api/src/services/curriculum-topic-ownership.test.ts --runInBand --no-coverage`

Expected: FAIL because `curriculum-topic-ownership.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `apps/api/src/services/curriculum-topic-ownership.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import {
  curriculumBooks,
  curricula,
  curriculumTopics,
  subjects,
  type Database,
} from '@eduagent/database';
import { NotFoundError } from '../errors';

export interface OwnedCurriculumTopic {
  topicId: string;
  topicTitle: string;
  topicDescription: string | null;
  bookId: string;
  bookTitle: string;
  curriculumId: string;
  subjectId: string;
}

export async function findOwnedCurriculumTopic(
  db: Database,
  params: { profileId: string; topicId: string; subjectId?: string },
): Promise<OwnedCurriculumTopic | null> {
  const conditions = [
    eq(curriculumTopics.id, params.topicId),
    eq(subjects.profileId, params.profileId),
  ];
  if (params.subjectId) conditions.push(eq(subjects.id, params.subjectId));

  const [row] = await db
    .select({
      topicId: curriculumTopics.id,
      topicTitle: curriculumTopics.title,
      topicDescription: curriculumTopics.description,
      bookId: curriculumBooks.id,
      bookTitle: curriculumBooks.title,
      curriculumId: curriculumTopics.curriculumId,
      subjectId: subjects.id,
    })
    .from(curriculumTopics)
    .innerJoin(curriculumBooks, eq(curriculumBooks.id, curriculumTopics.bookId))
    .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
    .innerJoin(
      subjects,
      and(
        eq(subjects.id, curriculumBooks.subjectId),
        eq(subjects.id, curricula.subjectId),
      ),
    )
    .where(and(...conditions))
    .limit(1);

  return row ?? null;
}

export async function assertOwnedCurriculumTopic(
  db: Database,
  params: { profileId: string; topicId: string; subjectId?: string },
): Promise<OwnedCurriculumTopic> {
  const row = await findOwnedCurriculumTopic(db, params);
  if (!row) throw new NotFoundError('Topic');
  return row;
}
```

- [ ] **Step 4: Run green**

Run: `pnpm exec jest apps/api/src/services/curriculum-topic-ownership.test.ts --runInBand --no-coverage`

Expected: PASS.

---

### Task 2: Retention Card Ownership Invariant

**Files:**
- Modify: `apps/api/src/services/retention-data.test.ts`
- Modify: `apps/api/src/services/retention-data.ts`

- [ ] **Step 1: Write failing tests**

Add a unit test proving `ensureRetentionCard()` rejects a foreign topic before insert:

```ts
it('[WI-80] rejects foreign topic before creating a retention card', async () => {
  const db = createMockDb({ retentionCardFindFirstQuery: undefined });
  db.select = jest.fn(() => ({
    from: jest.fn(() => ({
      innerJoin: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            where: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([]) })),
          })),
        })),
      })),
    })),
  })) as never;

  await expect(ensureRetentionCard(db, profileId, topicId)).rejects.toThrow(
    'Topic',
  );
  expect(db.insert).not.toHaveBeenCalled();
});
```

Adjust existing `ensureRetentionCard()` tests so their mock DB returns one owned-topic row from `db.select().from().innerJoin().innerJoin().innerJoin().where().limit()`.

- [ ] **Step 2: Run red**

Run: `pnpm exec jest apps/api/src/services/retention-data.test.ts --runInBand --no-coverage`

Expected: FAIL because `ensureRetentionCard()` still inserts without topic ownership.

- [ ] **Step 3: Implement minimal fix**

In `apps/api/src/services/retention-data.ts`, import `assertOwnedCurriculumTopic` and call it after the existing-card check and before insert:

```ts
import { assertOwnedCurriculumTopic } from './curriculum-topic-ownership';
```

```ts
  if (existingCard) return { card: existingCard, isNew: false };

  await assertOwnedCurriculumTopic(db, { profileId, topicId });

  await db
    .insert(retentionCards)
```

- [ ] **Step 4: Run green**

Run: `pnpm exec jest apps/api/src/services/retention-data.test.ts apps/api/src/services/curriculum-topic-ownership.test.ts --runInBand --no-coverage`

Expected: PASS.

---

### Task 3: Profile-Scoped Topic Progress

**Files:**
- Modify: `apps/api/src/services/progress.test.ts`
- Modify: `apps/api/src/services/progress.ts`

- [ ] **Step 1: Write failing test**

Add under `describe('getTopicProgress')`:

```ts
it('[WI-80] returns null when topicId is not owned by the scoped subject/profile', async () => {
  setupScopedRepo({ subjectFindFirst: mockSubjectRow() });
  const db = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              where: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([]) })),
            })),
          })),
        })),
      })),
    })),
  } as unknown as Database;

  const result = await getTopicProgress(db, profileId, subjectId, 'foreign-topic');

  expect(result).toBeNull();
});
```

Update success-path test DB mocks to return an owned-topic row from the same joined query.

- [ ] **Step 2: Run red**

Run: `pnpm exec jest apps/api/src/services/progress.test.ts --runInBand --no-coverage`

Expected: FAIL until `getTopicProgress()` stops using `db.query.curriculumTopics.findFirst({ id })`.

- [ ] **Step 3: Implement**

Replace the topic lookup in `getTopicProgress()`:

```ts
const ownedTopic = await findOwnedCurriculumTopic(db, {
  profileId,
  subjectId,
  topicId,
});
if (!ownedTopic) return null;
const topic = {
  id: ownedTopic.topicId,
  title: ownedTopic.topicTitle,
  description: ownedTopic.topicDescription,
};
```

Use `topic.title` and `topic.description` in the returned `TopicProgress` as before.

- [ ] **Step 4: Run green**

Run: `pnpm exec jest apps/api/src/services/progress.test.ts --runInBand --no-coverage`

Expected: PASS.

---

### Task 4: Scoped Metadata Enrichment

**Files:**
- Modify: `apps/api/src/services/coaching-cards.test.ts`
- Modify: `apps/api/src/services/coaching-cards.ts`
- Modify: `apps/api/src/services/interleaved.test.ts`
- Modify: `apps/api/src/services/interleaved.ts`
- Modify: `apps/api/src/inngest/functions/recall-nudge-send.test.ts`
- Modify: `apps/api/src/inngest/functions/recall-nudge-send.ts`

- [ ] **Step 1: Add failing coaching-card test**

Add a test where the overdue retention card belongs to `PROFILE_ID` but the joined owned-topic query returns no row. Assert generated copy does not contain the foreign topic title and falls back to generic review copy.

Run: `pnpm exec jest apps/api/src/services/coaching-cards.test.ts --runInBand --no-coverage`

Expected: FAIL because enrichment currently reads topic/book by topic ID alone.

- [ ] **Step 2: Fix coaching-card enrichment**

Replace the direct `curriculumTopics.leftJoin(curriculumBooks)` enrichment with:

```ts
const topic = await findOwnedCurriculumTopic(db, {
  profileId,
  topicId: mostOverdue.topicId,
});
topicTitle = topic?.topicTitle ?? null;
bookTitle = topic?.bookTitle ?? null;
```

- [ ] **Step 3: Add failing interleaved test**

Add a unit test with two retention cards, one owned topic and one foreign topic. Mock the joined topic lookup to return only the owned topic. Assert `selectInterleavedTopics()` returns only the owned topic and never returns `"Unknown topic"` for the foreign card.

Run: `pnpm exec jest apps/api/src/services/interleaved.test.ts --runInBand --no-coverage`

Expected: FAIL because selected cards are mapped even when topic ownership is not proven.

- [ ] **Step 4: Fix interleaved selection**

Replace unscoped `curriculumTopics.findMany()` plus `curricula.findMany()` enrichment with one joined query that requires both parent chains to agree:

```ts
const topicOwnershipConditions = [
  inArray(curriculumTopics.id, topicIds),
  eq(subjects.profileId, profileId),
];
if (subjectId) topicOwnershipConditions.push(eq(subjects.id, subjectId));

const topicRows =
  topicIds.length > 0
    ? await db
        .select({
          topicId: curriculumTopics.id,
          topicTitle: curriculumTopics.title,
          curriculumId: curriculumTopics.curriculumId,
          subjectId: subjects.id,
        })
        .from(curriculumTopics)
        .innerJoin(curriculumBooks, eq(curriculumBooks.id, curriculumTopics.bookId))
        .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
        .innerJoin(
          subjects,
          and(
            eq(subjects.id, curriculumBooks.subjectId),
            eq(subjects.id, curricula.subjectId),
          ),
        )
        .where(and(...topicOwnershipConditions))
    : [];
```

Filter `selected` to rows present in `topicMap` before returning.

- [ ] **Step 5: Add failing recall-nudge-send test**

Add a test where event `profileId='profile-a'` and `topTopicIds=['topic-b']`, and the owned-topic query returns no rows. Assert `formatRecallNudge()` receives `'your fading topic'`, not the foreign title.

Run: `pnpm exec jest apps/api/src/inngest/functions/recall-nudge-send.test.ts --runInBand --no-coverage`

Expected: FAIL because the function currently uses `db.query.curriculumTopics.findMany()`.

- [ ] **Step 6: Fix recall nudge title lookup**

Replace the unscoped lookup with a joined query through both `curriculumBooks -> subjects` and `curricula -> same subjects`, with `subjects.profileId = profileId`; preserve the existing fallback `'your fading topic'`.

- [ ] **Step 7: Run scoped metadata suite green**

Run:

```bash
pnpm exec jest \
  apps/api/src/services/coaching-cards.test.ts \
  apps/api/src/services/interleaved.test.ts \
  apps/api/src/inngest/functions/recall-nudge-send.test.ts \
  --runInBand --no-coverage
```

Expected: PASS.

---

### Task 5: Mobile Push Token Profile-Switch Race

**Files:**
- Modify: `apps/mobile/src/hooks/use-push-token-registration.test.ts`
- Modify: `apps/mobile/src/hooks/use-push-token-registration.ts`

- [ ] **Step 1: Write failing race test**

Add a deferred token promise test:

```ts
it('[WI-80] skips API registration if active profile changes while token lookup is in flight', async () => {
  let resolveToken!: (value: { data: string }) => void;
  (Notifications.getExpoPushTokenAsync as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      resolveToken = resolve;
    }),
  );

  const { rerender } = renderHook(() => usePushTokenRegistration(), {
    wrapper: createProfileWrapper(),
  });

  await waitFor(() => {
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalled();
  });

  mockActiveProfile = createTestProfile({ id: 'profile-2' });
  rerender({});

  await act(async () => {
    resolveToken({ data: 'ExponentPushToken[stale-profile]' });
  });

  expect(mockMutateAsync).not.toHaveBeenCalledWith(
    'ExponentPushToken[stale-profile]',
  );
});
```

- [ ] **Step 2: Run red**

Run: `cd apps/mobile && pnpm exec jest src/hooks/use-push-token-registration.test.ts --runInBand --no-coverage`

Expected: FAIL because the stale async path still calls `mutateAsync()`.

- [ ] **Step 3: Implement**

Add refs for the latest profile and proxy mode, update them each render, and re-check after token retrieval and immediately before mutation:

```ts
const activeProfileIdRef = useRef<string | null>(null);
const isParentProxyRef = useRef(false);
activeProfileIdRef.current = activeProfile?.id ?? null;
isParentProxyRef.current = isParentProxy;
```

After `getExpoPushTokenAsync()`:

```ts
if (
  activeProfileIdRef.current !== activeProfileId ||
  isParentProxyRef.current
) {
  pendingProfileToken.current = null;
  return;
}
```

Keep the existing duplicate-registration guards keyed by `{ profileId, token }`.

- [ ] **Step 4: Run green**

Run: `cd apps/mobile && pnpm exec jest src/hooks/use-push-token-registration.test.ts --runInBand --no-coverage`

Expected: PASS.

---

### Task 6: Sweep, Integration Verification, and DeepSec Guard

**Files:**
- Modify only if sweep finds remaining unsafe occurrences.

- [ ] **Step 1: Static sweep for unscoped topic lookups**

Run:

```bash
rg -n "curriculumTopics\\.findFirst|curriculumTopics\\.findMany|eq\\(curriculumTopics\\.id, topicId\\)|inArray\\(curriculumTopics\\.id" apps/api/src
```

Classify each hit:
- Safe: inside an already profile-scoped parent-chain path, or constrained by subject-owned curriculum.
- Fix: direct topic-ID lookup that returns titles, metadata, writes, or state transitions without `subjects.profileId`.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm exec jest \
  apps/api/src/services/curriculum-topic-ownership.test.ts \
  apps/api/src/services/retention-data.test.ts \
  apps/api/src/services/progress.test.ts \
  apps/api/src/services/coaching-cards.test.ts \
  apps/api/src/services/interleaved.test.ts \
  apps/api/src/inngest/functions/recall-nudge-send.test.ts \
  --runInBand --no-coverage
cd apps/mobile && pnpm exec jest src/hooks/use-push-token-registration.test.ts --runInBand --no-coverage
```

- [ ] **Step 3: Run affected integration tests**

Run:

```bash
pnpm exec jest \
  apps/api/src/services/curriculum-topics.integration.test.ts \
  apps/api/src/services/dictation/result.integration.test.ts \
  apps/api/src/services/evaluate-data-cross-profile.integration.test.ts \
  tests/integration/retention-lifecycle.integration.test.ts \
  tests/integration/session-completed-pipeline.integration.test.ts \
  --runInBand --no-coverage
```

- [ ] **Step 4: Run API integration suite required by project memory**

Run: `pnpm exec nx test:integration api`

Expected: PASS.

- [ ] **Step 5: Run lint/type checks**

Run:

```bash
pnpm exec nx run api:lint
pnpm exec nx run api:typecheck
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit via commit skill**

Load `.agents/skills/commit/SKILL.md`, follow its staging and message rules, and commit only WI-80 files.

---

## Verification Log

During implementation, append exact command outputs and any deviations from the plan here before committing.

### 2026-05-24 Implementation Verification

- Worktree/setup:
  - `git worktree add /Users/vetinari/.config/superpowers/worktrees/eduagent-build/WI-80 -b WI-80 origin/main`
  - `pnpm install` passed; Node engine warning only (`wanted node 22.x`, current `v24.15.0`).
  - `pnpm run env:sync` failed without Cloudflare token; after `doppler setup --project mentomate --config stg --no-interactive --scope .`, `doppler run -c stg -- pnpm run env:sync` passed.
- Focused API unit tests:
  - `cd apps/api && pnpm exec jest src/services/curriculum-topic-ownership.test.ts --runInBand --no-coverage`: passed.
  - `cd apps/api && pnpm exec jest src/services/retention-data.test.ts --runInBand --no-coverage`: passed, 77 tests.
  - `cd apps/api && pnpm exec jest src/services/progress.test.ts --runInBand --no-coverage`: passed.
  - `cd apps/api && pnpm exec jest src/services/coaching-cards.test.ts --runInBand --no-coverage`: passed.
  - `cd apps/api && pnpm exec jest src/services/interleaved.test.ts --runInBand --no-coverage`: passed.
  - `cd apps/api && pnpm exec jest src/inngest/functions/recall-nudge-send.test.ts --runInBand --no-coverage`: passed.
  - `cd apps/api && pnpm exec jest src/inngest/functions/review-due-send.test.ts --runInBand --no-coverage`: passed.
  - Combined focused API command after formatting: `cd apps/api && pnpm exec jest src/services/curriculum-topic-ownership.test.ts src/services/retention-data.test.ts src/services/progress.test.ts src/services/coaching-cards.test.ts src/services/interleaved.test.ts src/inngest/functions/recall-nudge-send.test.ts src/inngest/functions/review-due-send.test.ts --runInBand --no-coverage`: passed, 7 suites, 191 tests.
- Focused mobile unit test:
  - `cd apps/mobile && pnpm exec jest src/hooks/use-push-token-registration.test.ts --runInBand --no-coverage`: passed, 11 tests. Existing Expo/native-module and React `act(...)` warnings were emitted.
- Static sweep:
  - `rg -n "curriculumTopics\\.findFirst|curriculumTopics\\.findMany|eq\\(curriculumTopics\\.id, topicId\\)|inArray\\(curriculumTopics\\.id" apps/api/src`
  - Fixed two additional WI-80 sibling risks found by the sweep: `review-due-send.ts` subject-name lookup and `getStableTopics()` subject-filter path.
- Lint/typecheck:
  - `pnpm exec nx run api:typecheck`: passed.
  - `pnpm exec nx run api:lint`: passed with 8 pre-existing warnings outside this diff.
  - `cd apps/mobile && pnpm exec tsc --noEmit`: passed.
  - `pnpm exec tsc --build`: passed.
  - `pnpm exec nx lint mobile`: passed with 66 pre-existing warnings outside this diff.
- Integration:
  - `doppler run -c stg -- pnpm exec nx run api:test:integration`: failed because the shared test/staging database schema is not current. Representative failures: missing `memory_facts`, missing `quiz_mastery_items.last_reviewed_at`, and a missing unique/exclusion constraint used by dictation upserts. WI-80-adjacent suites that completed green inside this full target included `retention-lifecycle.integration.test.ts`, `progress-routes.integration.test.ts`, and `curriculum-routes.integration.test.ts`.
  - `doppler run -c stg -- pnpm exec jest --config apps/api/jest.integration.config.cjs apps/api/src/services/curriculum-topics.integration.test.ts apps/api/src/services/dictation/result.integration.test.ts apps/api/src/services/evaluate-data-cross-profile.integration.test.ts --runInBand --no-coverage`: `curriculum-topics` and `evaluate-data-cross-profile` passed; `dictation/result` failed on the same missing unique/exclusion constraint drift.
  - `doppler run -c stg -- pnpm exec jest --config tests/integration/jest.config.cjs retention-lifecycle.integration.test.ts session-completed-pipeline.integration.test.ts session-completed-chain.integration.test.ts --runInBand --no-coverage`: `retention-lifecycle` passed; both session-completed suites failed on missing `memory_facts`.
