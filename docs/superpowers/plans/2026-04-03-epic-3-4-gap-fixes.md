# Epic 3 + Epic 4 Gap Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 issues (4 High, 2 Medium) from the Epic 3+4 gap analysis to align the retention lifecycle, streak tracking, XP ledger, mobile retention UI, and teaching preferences with their epic specifications.

**Architecture:** The fixes are scoped to the API service layer, one Inngest function, one schema file, and two mobile screens. All fixes are backward-compatible — no schema migrations that break existing data, no new tables, no new API routes. The teaching-preference unique constraint needs a `drizzle-kit push` to apply.

**Tech Stack:** Drizzle ORM, Inngest v3, SM-2 (pure), React Native / NativeWind, Jest 30

---

## File Map

| File | Change | Task |
|------|--------|------|
| `apps/api/src/services/verification-completion.ts` | Count consecutive EVALUATE failures from session events instead of hardcoding `1` | 1 |
| `apps/api/src/inngest/functions/session-completed.ts` | Gate streak on recall-pass + skip paused/archived subjects | 2 |
| `apps/api/src/services/retention-data.ts` | Sync `xp_ledger.status` when `processRecallTest()` changes xpStatus; convert `setTeachingPreference()` to atomic upsert | 3, 5 |
| `apps/api/src/services/xp.ts` | Export new `syncXpLedgerStatus()` helper | 3 |
| `apps/mobile/src/app/(learner)/book.tsx` | Use `nextReviewAt` for retention status derivation | 4 |
| `apps/mobile/src/app/(learner)/topic/[topicId].tsx` | Use `nextReviewAt` for retention status derivation | 4 |
| `packages/database/src/schema/assessments.ts` | Add unique constraint on `teaching_preferences(profile_id, subject_id)` | 5 |
| `apps/api/src/routes/assessments.ts` | Wire retention lifecycle into assessment answer submission | 6 |

---

### Task 1: Fix EVALUATE three-strike escalation (Issue #2 — High)

**Problem:** `processEvaluateCompletion()` always calls `handleEvaluateFailure(1, currentRung)` — the hardcoded `1` means 2nd/3rd-failure escalation paths never activate.

**Files:**
- Modify: `apps/api/src/services/verification-completion.ts:88-92`
- Test: `apps/api/src/services/verification-completion.test.ts`

- [ ] **Step 1: Write failing tests for consecutive-failure counting**

Add tests that verify the three-strike escalation. The function already fetches up to 5 recent `ai_response` events from the session — we need to count how many of those have `structuredAssessment.type === 'evaluate'` AND `challengePassed === false`.

```typescript
// In verification-completion.test.ts — add these test cases:

it('should call handleEvaluateFailure with actual consecutive failure count from session events', async () => {
  // Setup: insert 2 prior ai_response events with structuredAssessment showing failures
  // Then insert the current failed event
  // Assert: the retention card's evaluateDifficultyRung should be lowered (2nd failure behavior)
});

it('should exit to standard review on 3rd consecutive EVALUATE failure', async () => {
  // Setup: insert 3 prior failed events
  // Assert: evaluateDifficultyRung should be reset to 1
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/verification-completion.ts --no-coverage
```

Expected: Tests fail because the function always passes `1` regardless of prior failures.

- [ ] **Step 3: Count consecutive EVALUATE failures from session events**

Replace the hardcoded `1` in `processEvaluateCompletion()` at line 92:

```typescript
  // Handle three-strike escalation for failures
  let newRung = currentRung;
  if (!assessment.challengePassed) {
    // Count consecutive EVALUATE failures from prior events in this session.
    // Events with structuredAssessment.type === 'evaluate' and challengePassed === false
    // are failures that were already processed in earlier exchanges.
    let consecutiveFailures = 1; // Current failure counts as 1
    for (const evt of events) {
      // Skip the event we just parsed (the current one)
      if (evt === events[0]) continue;
      const sa = evt.structuredAssessment as Record<string, unknown> | null;
      if (
        sa &&
        sa.type === 'evaluate' &&
        sa.challengePassed === false
      ) {
        consecutiveFailures++;
      } else {
        // Stop counting at first non-failure (consecutive means unbroken)
        break;
      }
    }

    const failureAction = handleEvaluateFailure(consecutiveFailures, currentRung);

    if (
      failureAction.action === 'lower_difficulty' &&
      failureAction.newDifficultyRung
    ) {
      newRung = failureAction.newDifficultyRung;
    } else if (failureAction.action === 'exit_to_standard') {
      newRung = 1 as const;
    }
  } else {
```

The key insight: `events` is already fetched in descending `createdAt` order (line 53), and `events[0]` is the most recent one we just parsed. Earlier events in the array are older, so we walk backward through them counting consecutive failures.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/verification-completion.ts --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/verification-completion.ts apps/api/src/services/verification-completion.test.ts
git commit -m "fix: count consecutive EVALUATE failures for three-strike escalation (Epic 3.13)"
```

---

### Task 2: Gate Honest Streak on recall-pass + skip paused/archived subjects (Issue #3 — High)

**Problem:** `session-completed` Step 3 calls `recordSessionActivity()` unconditionally — any session type (learning, homework) increments the streak. Paused/archived subjects also flow through. FR86 requires streak to only count days with passing recall.

**Files:**
- Modify: `apps/api/src/inngest/functions/session-completed.ts:270-297`
- Test: `apps/api/src/inngest/functions/session-completed.test.ts`

- [ ] **Step 1: Write failing tests for streak gating**

```typescript
// In session-completed.test.ts — add/update:

it('should NOT increment streak when no quality rating is provided', async () => {
  // Dispatch app/session.completed with qualityRating: undefined
  // Assert: recordSessionActivity was NOT called
});

it('should NOT increment streak when quality rating < 3 (recall fail)', async () => {
  // Dispatch with qualityRating: 2
  // Assert: recordSessionActivity was NOT called
});

it('should NOT increment streak when subject is paused', async () => {
  // Create a paused subject, dispatch session.completed
  // Assert: recordSessionActivity was NOT called
});

it('should increment streak when quality rating >= 3 (recall pass)', async () => {
  // Dispatch with qualityRating: 3
  // Assert: recordSessionActivity WAS called
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/inngest/functions/session-completed.ts --no-coverage
```

- [ ] **Step 3: Add streak gate to session-completed Step 3**

In `session-completed.ts`, add `subjects` to the import from `@eduagent/database`:

```typescript
import {
  curriculumTopics,
  retentionCards,
  sessionEvents,
  subjects,
} from '@eduagent/database';
```

Then modify the Step 3 block (lines 270-297):

```typescript
    // Step 3: Update dashboard — streaks + XP
    // FR86: Only count toward Honest Streak when recall quality >= 3 (pass)
    // Story 4.4: Paused/archived subjects must not count toward streak
    let updatedStreak: { currentStreak: number; longestStreak: number } | null =
      null;
    outcomes.push(
      await step.run('update-dashboard', async () => {
        const result = await runIsolated(
          'update-dashboard',
          profileId,
          async () => {
            const db = getStepDatabase();
            const today = timestamp
              ? new Date(timestamp).toISOString().slice(0, 10)
              : new Date().toISOString().slice(0, 10);

            // Gate 1: Skip streak/XP for paused or archived subjects
            if (subjectId) {
              const [subject] = await db
                .select({ status: subjects.status })
                .from(subjects)
                .where(
                  and(
                    eq(subjects.id, subjectId),
                    eq(subjects.profileId, profileId)
                  )
                )
                .limit(1);
              if (subject && subject.status !== 'active') {
                return;
              }
            }

            // Gate 2: Only increment streak on recall-pass (quality >= 3)
            if (
              completionQualityRating != null &&
              completionQualityRating >= 3
            ) {
              updatedStreak = await recordSessionActivity(
                db,
                profileId,
                today
              );
            }

            // XP insertion is separate — still runs for any completed session
            // with a topic (insert is idempotent / duplicate-guarded)
            await insertSessionXpEntry(
              db,
              profileId,
              topicId ?? null,
              subjectId
            );
          }
        );
        return result;
      })
    );
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/inngest/functions/session-completed.ts --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/inngest/functions/session-completed.ts apps/api/src/inngest/functions/session-completed.test.ts
git commit -m "fix: gate Honest Streak on recall-pass quality + active subjects (FR86, Story 4.4)"
```

---

### Task 3: Sync XP ledger status on delayed recall (Issue #4 — High)

**Problem:** `processRecallTest()` updates `retention_cards.xp_status` when delayed recall succeeds/fails, but never updates `xp_ledger.status`. The dashboard reads from `xp_ledger`, so pending XP never becomes verified in the API response.

**Files:**
- Create: helper function in `apps/api/src/services/xp.ts`
- Modify: `apps/api/src/services/retention-data.ts:322-343` (after retention card update)
- Test: `apps/api/src/services/retention-data.test.ts`

- [ ] **Step 1: Write failing test for XP ledger sync**

```typescript
// In retention-data.test.ts — add:

it('should update xp_ledger status to verified when delayed recall passes', async () => {
  // Setup: insert xp_ledger row with status='pending' for a topic
  // Submit a passing recall test (quality >= 3, consecutiveSuccesses > 0)
  // Assert: xp_ledger.status === 'verified' and verifiedAt is set
});

it('should update xp_ledger status to decayed when recall fails repeatedly', async () => {
  // Setup: insert xp_ledger row with status='pending'
  // Submit failing recall (quality 0, failure count triggers decay)
  // Assert: xp_ledger.status === 'decayed'
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/retention-data.ts --no-coverage
```

- [ ] **Step 3: Add `syncXpLedgerStatus()` helper in `xp.ts`**

```typescript
/**
 * Syncs the xp_ledger row for a topic to match a retention-derived status change.
 * Called after processRecallTest() updates retention_cards.xpStatus.
 * No-ops if no xp_ledger entry exists for the topic.
 */
export async function syncXpLedgerStatus(
  db: Database,
  profileId: string,
  topicId: string,
  newStatus: 'verified' | 'decayed'
): Promise<void> {
  const now = new Date();
  const setFields: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'verified') {
    setFields.verifiedAt = now;
  }

  await db
    .update(xpLedger)
    .set(setFields)
    .where(
      and(eq(xpLedger.profileId, profileId), eq(xpLedger.topicId, topicId))
    );
}
```

- [ ] **Step 4: Call `syncXpLedgerStatus()` from `processRecallTest()`**

In `retention-data.ts`, add the import:

```typescript
import { syncXpLedgerStatus } from './xp';
```

After the retention card update (line 343), add:

```typescript
  // Sync xp_ledger to match the retention card's new xpStatus
  if (result.xpChange === 'verified' || result.xpChange === 'decayed') {
    await syncXpLedgerStatus(db, profileId, input.topicId, result.xpChange);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/retention-data.ts --no-coverage
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/xp.ts apps/api/src/services/retention-data.ts apps/api/src/services/retention-data.test.ts
git commit -m "fix: sync xp_ledger status on delayed-recall verification and decay (FR50, FR88)"
```

---

### Task 4: Fix mobile retention status to use `nextReviewAt` (Issue #5 — Medium)

**Problem:** `book.tsx` and `topic/[topicId].tsx` re-derive retention from `easeFactor`/`repetitions`/`xpStatus` locally, ignoring the `nextReviewAt` field the API already sends. The server uses `nextReviewAt` via `computeRetentionStatus()` — the mobile should match.

**Files:**
- Modify: `apps/mobile/src/app/(learner)/book.tsx:67-75`
- Modify: `apps/mobile/src/app/(learner)/topic/[topicId].tsx:18-32`
- Test: `apps/mobile/src/app/(learner)/book.test.tsx` (if exists)

- [ ] **Step 1: Update `getTopicRetention()` in `book.tsx`**

Replace lines 67-75:

```typescript
function getTopicRetention(topic: SubjectRetentionTopic): RetentionStatus {
  // Failure-count override: 3+ failures = forgotten regardless of schedule
  if (topic.failureCount >= 3 || topic.xpStatus === 'decayed') {
    return 'forgotten';
  }
  // No retention card yet
  if (topic.repetitions === 0) {
    return 'weak';
  }
  // Use server-computed SM-2 schedule (matches progress.ts computeRetentionStatus)
  if (!topic.nextReviewAt) return 'weak';
  const now = Date.now();
  const reviewAt = new Date(topic.nextReviewAt).getTime();
  const daysUntilReview = (reviewAt - now) / (1000 * 60 * 60 * 24);
  if (daysUntilReview > 3) return 'strong';
  if (daysUntilReview > 0) return 'fading';
  return 'weak';
}
```

- [ ] **Step 2: Update `deriveRetentionStatus()` in `topic/[topicId].tsx`**

Replace lines 18-32:

```typescript
function deriveRetentionStatus(
  card:
    | {
        easeFactor: number;
        repetitions: number;
        xpStatus: string;
        nextReviewAt?: string | null;
        failureCount?: number;
      }
    | null
    | undefined
): RetentionStatus {
  if (!card) return 'weak';
  if ((card.failureCount ?? 0) >= 3 || card.xpStatus === 'decayed')
    return 'forgotten';
  if (card.repetitions === 0) return 'weak';
  // Use SM-2 schedule date (matches server computeRetentionStatus)
  if (!card.nextReviewAt) return 'weak';
  const now = Date.now();
  const reviewAt = new Date(card.nextReviewAt).getTime();
  const daysUntilReview = (reviewAt - now) / (1000 * 60 * 60 * 24);
  if (daysUntilReview > 3) return 'strong';
  if (daysUntilReview > 0) return 'fading';
  return 'weak';
}
```

- [ ] **Step 3: Run related mobile tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(learner\)/book.tsx src/app/\(learner\)/topic/\[topicId\].tsx --no-coverage
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/\(learner\)/book.tsx apps/mobile/src/app/\(learner\)/topic/\[topicId\].tsx
git commit -m "fix: use nextReviewAt for mobile retention status (aligns with server SM-2 schedule)"
```

---

### Task 5: Add unique constraint + atomic upsert for teaching preferences (Issue #6 — Medium)

**Problem:** `teaching_preferences` has no uniqueness constraint on `(profile_id, subject_id)`, and the write path is a non-atomic read-then-insert that allows duplicate rows under concurrent requests.

**Files:**
- Modify: `packages/database/src/schema/assessments.ts:151-169`
- Modify: `apps/api/src/services/retention-data.ts:532-586`
- Test: `apps/api/src/services/retention-data.test.ts`

- [ ] **Step 1: Write failing test for duplicate prevention**

```typescript
// In retention-data.test.ts — add:

it('should not create duplicate teaching preference rows for same profile+subject', async () => {
  // Call setTeachingPreference twice for the same profile+subject
  // Assert: only one row exists in teaching_preferences for that pair
});
```

- [ ] **Step 2: Run test to verify it fails (or passes — the test itself may not catch the race, but the schema change prevents it)**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/retention-data.ts --no-coverage
```

- [ ] **Step 3: Add unique constraint to schema**

In `packages/database/src/schema/assessments.ts`, modify the `teachingPreferences` table to add a constraint:

```typescript
export const teachingPreferences = pgTable(
  'teaching_preferences',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    method: teachingMethodEnum('method').notNull(),
    analogyDomain: analogyDomainEnum('analogy_domain'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('teaching_preferences_profile_subject_unique').on(
      table.profileId,
      table.subjectId
    ),
  ]
);
```

- [ ] **Step 4: Convert `setTeachingPreference()` to atomic upsert**

Replace the read-then-update/insert pattern in `retention-data.ts:532-586`:

```typescript
export async function setTeachingPreference(
  db: Database,
  profileId: string,
  subjectId: string,
  method: string,
  analogyDomain?: string | null
): Promise<{
  subjectId: string;
  method: string;
  analogyDomain: string | null;
}> {
  const values: typeof teachingPreferences.$inferInsert = {
    profileId,
    subjectId,
    method: method as TeachingMethod,
    ...(analogyDomain !== undefined && {
      analogyDomain: (analogyDomain as AnalogyDomainColumn) ?? null,
    }),
  };

  const updateFields: Record<string, unknown> = {
    method: method as TeachingMethod,
    updatedAt: new Date(),
  };
  if (analogyDomain !== undefined) {
    updateFields.analogyDomain = (analogyDomain as AnalogyDomainColumn) ?? null;
  }

  await db
    .insert(teachingPreferences)
    .values(values)
    .onConflictDoUpdate({
      target: [teachingPreferences.profileId, teachingPreferences.subjectId],
      set: updateFields,
    });

  const effectiveDomain = analogyDomain !== undefined
    ? (analogyDomain ?? null)
    : null;

  // Return the effective state (for onConflictDoUpdate, re-read is needed
  // only when analogyDomain was not provided — fetch to get the existing value)
  if (analogyDomain === undefined) {
    const existing = await db.query.teachingPreferences.findFirst({
      where: and(
        eq(teachingPreferences.profileId, profileId),
        eq(teachingPreferences.subjectId, subjectId)
      ),
    });
    return {
      subjectId,
      method,
      analogyDomain: existing?.analogyDomain ?? null,
    };
  }

  return { subjectId, method, analogyDomain: effectiveDomain };
}
```

- [ ] **Step 5: Run tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/retention-data.ts --no-coverage
```

- [ ] **Step 6: Push schema to dev DB**

```bash
pnpm run db:push:dev
```

- [ ] **Step 7: Commit**

```bash
git add packages/database/src/schema/assessments.ts apps/api/src/services/retention-data.ts
git commit -m "fix: add unique constraint + atomic upsert for teaching preferences (Epic 3 prompt-context safety)"
```

---

### Task 6: Wire standalone assessments into the retention lifecycle (Issue #1 — High)

**Problem:** Standalone assessments create `assessments` rows but never create retention cards, award XP, or dispatch `app/session.completed`. A topic can be "passed" via assessment but have zero retention/XP tracking.

**Files:**
- Modify: `apps/api/src/routes/assessments.ts:61-106`
- Test: `apps/api/src/routes/assessments.test.ts`

- [ ] **Step 1: Write failing test for assessment → retention lifecycle**

```typescript
// In assessments.test.ts — add:

it('should create a retention card and insert XP entry when standalone assessment passes', async () => {
  // Create assessment, submit answer that passes
  // Assert: retention_cards row exists for the topic
  // Assert: xp_ledger row exists for the topic
});

it('should dispatch app/session.completed event when standalone assessment passes', async () => {
  // Create assessment, submit passing answer
  // Assert: inngest.send was called with app/session.completed event
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/routes/assessments.ts --no-coverage
```

- [ ] **Step 3: Add retention lifecycle integration after assessment passes**

In `apps/api/src/routes/assessments.ts`, add imports:

```typescript
import { updateRetentionFromSession } from '../services/retention-data';
import { insertSessionXpEntry } from '../services/xp';
```

Then, after the assessment update (after line 102), add the retention lifecycle trigger when the assessment passes:

```typescript
      // Wire passed standalone assessments into the retention lifecycle (Epic 3)
      if (newStatus === 'passed' && evaluation.qualityRating != null) {
        await updateRetentionFromSession(
          db,
          profileId,
          topicId,
          evaluation.qualityRating
        );
        await insertSessionXpEntry(db, profileId, topicId, subjectId);
      }
```

Note: We extract `topicId` and `subjectId` from the assessment lookup. The route already has `assessment.topicId`, but we need to also get `subjectId`. Let me check — the create route takes `subjectId` as param but the answer route doesn't have it directly. We need to pass it through the assessment record or look it up.

Update the answer route to load the assessment's subjectId:

```typescript
  .post(
    '/assessments/:assessmentId/answer',
    zValidator('json', assessmentAnswerSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const assessmentId = c.req.param('assessmentId');
      const { answer } = c.req.valid('json');

      const assessment = await getAssessment(db, profileId, assessmentId);
      if (!assessment) return notFound(c, 'Assessment not found');

      const evaluation = await evaluateAssessmentAnswer(
        {
          topicTitle: assessment.topicId,
          topicDescription: '',
          currentDepth: assessment.verificationDepth,
          exchangeHistory: assessment.exchangeHistory,
        },
        answer
      );

      const updatedHistory = [
        ...assessment.exchangeHistory,
        { role: 'user' as const, content: answer },
        { role: 'assistant' as const, content: evaluation.feedback },
      ];

      const newStatus = evaluation.passed
        ? evaluation.shouldEscalateDepth
          ? 'in_progress'
          : 'passed'
        : 'in_progress';

      await updateAssessment(db, profileId, assessmentId, {
        verificationDepth: evaluation.nextDepth ?? assessment.verificationDepth,
        status: newStatus as 'in_progress' | 'passed' | 'failed',
        masteryScore: evaluation.masteryScore,
        qualityRating: evaluation.qualityRating,
        exchangeHistory: updatedHistory,
      });

      // Wire passed standalone assessments into the retention lifecycle (Epic 3)
      // Ensures assessment-only topics get SM-2 retention cards + XP tracking.
      if (newStatus === 'passed' && evaluation.qualityRating != null) {
        const topicId = assessment.topicId;
        const subjectId = assessment.subjectId;
        if (topicId && subjectId) {
          await updateRetentionFromSession(
            db,
            profileId,
            topicId,
            evaluation.qualityRating
          );
          await insertSessionXpEntry(db, profileId, topicId, subjectId);
        }
      }

      return c.json({ evaluation });
    }
  )
```

**Important:** This requires `assessment.subjectId` to be available. Check whether `getAssessment()` returns `subjectId` — if the `assessments` table stores it. If not, look it up via the `curriculum_topics → curricula → subjects` chain or pass it through from the create route.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/routes/assessments.ts --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/assessments.ts apps/api/src/routes/assessments.test.ts
git commit -m "fix: wire standalone assessments into retention lifecycle (Epic 3 SM-2 seed + XP)"
```

---

## Post-Implementation Verification

After all tasks are complete:

- [ ] Run full API test suite: `pnpm exec nx test api --no-coverage`
- [ ] Run mobile tests for changed files: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(learner\)/book.tsx src/app/\(learner\)/topic/\[topicId\].tsx --no-coverage`
- [ ] Run type checker: `pnpm exec tsc --noEmit`
- [ ] Push schema if Task 5 constraint was applied: `pnpm run db:push:dev`

## Task Parallelization Guide

These tasks can be parallelized as follows:

- **Independent (can run in parallel):** Tasks 1, 2, 4, 6
- **Sequential with Task 3:** Task 5 also modifies `retention-data.ts`, so Tasks 3 and 5 must be sequential (or done by the same agent)
- **Task 5 schema push** depends on Task 5 code change completing first
