# Issue Fix Plan — PR Review Bugfixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 27 open bugs surfaced from closed-PR code reviews — covering API data integrity, CI/CD security, SSE error handling, home-cards cache corruption, mobile logic gaps, and type safety.

**Architecture:** Fixes grouped into 12 tasks by subsystem. Tasks 1-7 (first batch) and Tasks 8-12 (home-cards batch) are independent groups. All fixes are backward-compatible — no new tables, no new API routes, no breaking changes.

**Tech Stack:** Hono, Drizzle ORM, Jest 30, GitHub Actions, React Native, NativeWind

**Last updated:** 2026-04-04

---

## Remaining Quality Concerns (from prior reviews)

These are not code bugs but ongoing quality gaps flagged in prior review rounds:

- **Mock-heavy native tests:** Auth/voice unit tests substitute real boundaries with mocks. Benefit from integration test expansion but not blocking launch.
- **E2E depth:** 97 Maestro flows exist but scenario depth varies. Continuously improving.

---

## Bug Index

| # | Sev | Bug | Task | Status |
|---|-----|-----|------|--------|
| 1 | Must fix | No migration for UNIQUE constraint on teaching_preferences | Deferred | - [ ] |
| 2 | Must fix | Race condition in setTeachingPreference (non-atomic read-back) | 1 | - [ ] |
| 3 | Should fix | syncXpLedgerStatus failure aborts recall test response | 1 | - [ ] |
| 4 | Should fix | Silent no-op in syncXpLedgerStatus (no logging/return) | 1 | - [ ] |
| 7 | Security | `contents: write` permission escalation in ci.yml | 6 | - [ ] |
| 8 | Risk | Deploy to staging with no quality gate on push-to-main | 6 | - [ ] |
| 9 | Bug | Missing zipalign before apksigner in E2E CI | 7 | - [ ] |
| 10 | Bug | TMPDIR shadows POSIX-reserved env variable | 7 | - [ ] |
| 11 | Risk | Non-JS assets silently stale on APK cache hit | 7 | - [ ] |
| 12 | High | Homework + 5-skip warning blocks recall bridge | 5 | - [ ] |
| 13 | Medium | Double DB round-trip on skip (5-9 range) | 4 | - [ ] |
| 14 | Medium | `Record<string, any>` casts erase Hono RPC type safety (×11) | Deferred | - [ ] |
| 15 | Must fix | N+1 updates with no transaction in curriculum reorder | 2 | - [ ] |
| 16 | Must fix | Interview SSE — no error event on post-stream failure | 3 | - [ ] |
| 17 | Should fix | Unconditional abort in useStreamInterviewMessage finally | 5 | - [ ] |
| 20 | Must fix | coldStart re-derived instead of stored | 8 | - [ ] |
| 21 | Must fix | legacyCoachingCard required but guard skips validation | 8 | - [ ] |
| 22 | Must fix | Cache bust on every interaction (rankedHomeCards: []) | 9 | - [ ] |
| 23 | Should fix | isHomeworkWindow uses UTC, not user local time | 10 | - [ ] |
| 24 | Should fix | Double DB read on every cache miss | 10 | - [ ] |
| 25 | Should fix | Read-modify-write race in mergeHomeSurfaceCacheData | Deferred | - [ ] |
| 26 | Should fix | invalidateQueries on every tap causes card reordering | 11 | - [ ] |
| 27 | Type safety | use-home-cards.ts bypasses Hono RPC inference | Deferred | - [ ] |
| 28 | Type safety | home.tsx cast as HomeCardModel[] | 11 | - [ ] |
| 29 | Correctness | Skipped test for fully-implemented interactions route | 12 | - [ ] |
| 30 | Correctness | Wrong-subject chip test references undeclared QuickChipId | 12 | - [ ] |
| 31 | Dead code | getHomeCardIds has no consumer | 12 | - [ ] |

---

## File Map

| File | Change | Task |
|------|--------|------|
| `apps/api/src/services/retention-data.ts` | Atomic upsert `.returning()`, best-effort XP sync | 1 |
| `apps/api/src/services/xp.ts` | Return boolean + debug log from syncXpLedgerStatus | 1 |
| `apps/api/src/services/curriculum.ts` | Wrap sort-order loop in `db.transaction()` | 2 |
| `apps/api/src/routes/interview.ts` | try/catch post-stream writes, emit SSE error event | 3 |
| `apps/api/src/services/settings.ts` | Combine skip-warning functions into single query | 4 |
| `apps/api/src/routes/sessions.ts` | Call combined function | 4 |
| `apps/mobile/src/app/session-summary/[sessionId].tsx` | Move recall bridge before skip-warning alerts | 5 |
| `apps/mobile/src/hooks/use-interview.ts` | Guard abort with isStreamingRef | 5 |
| `.github/workflows/ci.yml` | Revert to `contents: read` | 6 |
| `.github/workflows/deploy.yml` | Add push-to-main smoke gate | 6 |
| `.github/workflows/e2e-ci.yml` | Fix zipalign, TMPDIR, asset cache key | 7 |
| `apps/api/src/services/home-surface-cache.ts` | Fix type guard, fix interaction merge | 8, 9 |
| `apps/api/src/services/home-cards.ts` | Use stored coldStart, pass cache to precompute, UTC fix, remove dead code | 8, 10, 12 |
| `apps/mobile/src/hooks/use-home-cards.ts` | Optimistic update instead of invalidate | 11 |
| `apps/mobile/src/app/(learner)/home.tsx` | Remove unsafe cast | 11 |
| `apps/api/src/routes/home-cards.test.ts` | Unskip interactions test | 12 |
| `apps/mobile/src/app/session/index.test.tsx` | Fix wrong_subject chip reference | 12 |

---

## Task 1: Fix retention-data + XP sync (Bugs #2, #3, #4)

**Files:**
- Modify: `apps/api/src/services/retention-data.ts:548-589`
- Modify: `apps/api/src/services/xp.ts:132-148`
- Test: `apps/api/src/services/xp.test.ts`

#### Bug #2: Atomic upsert with .returning()

- [ ] **Step 1: Replace the post-upsert findFirst with `.returning()` in `setTeachingPreference`**

In `apps/api/src/services/retention-data.ts`, replace the entire `setTeachingPreference` function (lines 536-590):

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

  const [row] = await db
    .insert(teachingPreferences)
    .values(values)
    .onConflictDoUpdate({
      target: [teachingPreferences.profileId, teachingPreferences.subjectId],
      set: updateFields,
    })
    .returning({
      method: teachingPreferences.method,
      analogyDomain: teachingPreferences.analogyDomain,
    });

  return {
    subjectId,
    method: row?.method ?? method,
    analogyDomain: row?.analogyDomain ?? null,
  };
}
```

- [ ] **Step 2: Run retention-data tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/retention-data.ts --no-coverage
```

Expected: All pass.

#### Bug #3: Best-effort XP sync

- [ ] **Step 3: Wrap syncXpLedgerStatus in try/catch in `processRecallTest`**

In `apps/api/src/services/retention-data.ts`, replace lines 346-349:

```typescript
  // Sync xp_ledger to match the retention card's new xpStatus (best-effort —
  // XP bookkeeping should not abort the recall test response)
  if (result.xpChange === 'verified' || result.xpChange === 'decayed') {
    try {
      await syncXpLedgerStatus(db, profileId, input.topicId, result.xpChange);
    } catch (err) {
      console.error('[processRecallTest] XP sync failed (non-fatal):', err);
    }
  }
```

- [ ] **Step 4: Run retention-data tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/retention-data.ts --no-coverage
```

Expected: All pass.

#### Bug #4: Observable syncXpLedgerStatus

- [ ] **Step 5: Return boolean from `syncXpLedgerStatus` and log on no-op**

In `apps/api/src/services/xp.ts`, replace lines 132-148:

```typescript
/**
 * Syncs the xp_ledger row for a topic to match a retention-derived status change.
 * Called after processRecallTest() updates retention_cards.xpStatus.
 * Returns true if a row was updated, false if no xp_ledger entry existed.
 */
export async function syncXpLedgerStatus(
  db: Database,
  profileId: string,
  topicId: string,
  newStatus: 'verified' | 'decayed'
): Promise<boolean> {
  const now = new Date();
  const result = await db
    .update(xpLedger)
    .set({
      status: newStatus,
      ...(newStatus === 'verified' ? { verifiedAt: now } : {}),
    })
    .where(
      and(eq(xpLedger.profileId, profileId), eq(xpLedger.topicId, topicId))
    )
    .returning({ id: xpLedger.id });

  if (result.length === 0) {
    console.debug(
      `[syncXpLedgerStatus] No xp_ledger row for profile=${profileId} topic=${topicId} — skipped`
    );
    return false;
  }
  return true;
}
```

- [ ] **Step 6: Update xp.test.ts for boolean returns**

Add/update tests:

```typescript
it('updates status to verified and returns true', async () => {
  // ... existing setup ...
  const updated = await syncXpLedgerStatus(db, 'profile-001', 'topic-001', 'verified');
  expect(updated).toBe(true);
  // ... existing assertions ...
});

it('returns false when no xp_ledger row exists', async () => {
  const updated = await syncXpLedgerStatus(db, 'profile-001', 'nonexistent-topic', 'verified');
  expect(updated).toBe(false);
});
```

- [ ] **Step 7: Run xp tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/xp.ts --no-coverage
```

Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/retention-data.ts apps/api/src/services/xp.ts apps/api/src/services/xp.test.ts
git commit -m "fix(api): atomic upsert in setTeachingPreference + best-effort XP sync

- Use .returning() in setTeachingPreference to avoid race condition (#2)
- Wrap syncXpLedgerStatus in try/catch so XP failures don't abort recall (#3)
- Return boolean from syncXpLedgerStatus for observability (#4)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Wrap curriculum reorder in transaction (Bug #15)

**Files:**
- Modify: `apps/api/src/services/curriculum.ts:569-592`

- [ ] **Step 1: Wrap sort-order loop + audit insert in `db.transaction()`**

In `apps/api/src/services/curriculum.ts`, replace lines 569-592:

```typescript
  // Persist new sort order + adaptation record atomically.
  // Without a transaction, a mid-loop connection drop leaves
  // topics in a partially-reordered state with no rollback.
  await db.transaction(async (tx) => {
    for (let i = 0; i < reordered.length; i++) {
      const entry = reordered[i]!;
      await tx
        .update(curriculumTopics)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(
          and(
            eq(curriculumTopics.id, entry.id),
            eq(curriculumTopics.curriculumId, curriculum.id)
          )
        );
    }

    await tx.insert(curriculumAdaptations).values({
      profileId,
      subjectId,
      topicId: request.topicId,
      sortOrder: reordered.findIndex((t) => t.id === request.topicId),
      skipReason: `Performance adaptation: ${request.signal}${
        request.context ? ' — ' + request.context : ''
      }`,
    });
  });
```

- [ ] **Step 2: Run curriculum tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/curriculum.ts --no-coverage
```

Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/curriculum.ts
git commit -m "fix(api): wrap curriculum reorder in db.transaction()

Prevents partial sort-order corruption on mid-loop connection drop (#15).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Interview SSE error handling (Bug #16)

**Files:**
- Modify: `apps/api/src/routes/interview.ts:100-143`

- [ ] **Step 1: Add try/catch around post-stream writes, emit error event**

In `apps/api/src/routes/interview.ts`, replace lines 100-143:

```typescript
      return streamSSE(c, async (sseStream) => {
        let fullResponse = '';

        for await (const chunk of stream) {
          fullResponse += chunk;
          await sseStream.writeSSE({
            data: JSON.stringify({ type: 'chunk', content: chunk }),
          });
        }

        try {
          const result = await onComplete(fullResponse);

          const updatedHistory = [
            ...draft.exchangeHistory,
            { role: 'user' as const, content: message },
            { role: 'assistant' as const, content: result.response },
          ];

          if (result.isComplete) {
            await updateDraft(db, profileId, draft.id, {
              exchangeHistory: updatedHistory,
              extractedSignals:
                result.extractedSignals ?? draft.extractedSignals,
              status: 'completed',
            });
            await persistCurriculum(db, subjectId, subject.name, {
              ...draft,
              exchangeHistory: updatedHistory,
              extractedSignals:
                result.extractedSignals ?? draft.extractedSignals,
            });
          } else {
            await updateDraft(db, profileId, draft.id, {
              exchangeHistory: updatedHistory,
            });
          }

          await sseStream.writeSSE({
            data: JSON.stringify({
              type: 'done',
              isComplete: result.isComplete,
              exchangeCount: updatedHistory.filter((e) => e.role === 'user')
                .length,
            }),
          });
        } catch (err) {
          console.error('[interview/stream] Post-stream write failed:', err);
          await sseStream.writeSSE({
            data: JSON.stringify({
              type: 'error',
              message:
                'Failed to save interview progress. Please try again.',
            }),
          });
        }
      });
```

- [ ] **Step 2: Run interview tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/routes/interview.ts --no-coverage
```

Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/interview.ts
git commit -m "fix(api): emit SSE error event on post-stream interview failure

Client now receives type:'error' instead of silent connection close (#16).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Combine skip-warning DB queries (Bug #13)

**Files:**
- Modify: `apps/api/src/services/settings.ts` (add after line 364)
- Modify: `apps/api/src/routes/sessions.ts:43-46, 345-352`

- [ ] **Step 1: Add combined `getSkipWarningFlags` function in settings.ts**

In `apps/api/src/services/settings.ts`, add after the `shouldWarnSummarySkip` function (after line 364):

```typescript
/**
 * Single-query replacement for calling shouldPromptCasualSwitch() and
 * shouldWarnSummarySkip() independently. Returns both flags from one DB read.
 */
export async function getSkipWarningFlags(
  db: Database,
  profileId: string
): Promise<{
  shouldPromptCasualSwitch: boolean;
  shouldWarnSummarySkip: boolean;
}> {
  const row = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });

  const mode = row?.mode ?? 'serious';
  const skips = row?.consecutiveSummarySkips ?? 0;

  const promptCasualSwitch =
    mode === 'serious' && skips >= CASUAL_SWITCH_PROMPT_THRESHOLD;
  const warnSummarySkip =
    !promptCasualSwitch &&
    mode === 'serious' &&
    skips >= SKIP_WARNING_THRESHOLD &&
    skips < CASUAL_SWITCH_PROMPT_THRESHOLD;

  return {
    shouldPromptCasualSwitch: promptCasualSwitch,
    shouldWarnSummarySkip: warnSummarySkip,
  };
}
```

- [ ] **Step 2: Update sessions.ts import and skip-summary route**

In `apps/api/src/routes/sessions.ts`, add to the import (line 43-46):

```typescript
import {
  shouldPromptCasualSwitch,
  shouldWarnSummarySkip,
  getSkipWarningFlags,
} from '../services/settings';
```

Replace lines 345-352 in the skip-summary handler:

```typescript
    const {
      shouldPromptCasualSwitch: promptCasualSwitch,
      shouldWarnSummarySkip: warnSummarySkip,
    } = await getSkipWarningFlags(db, profileId);
    return c.json({
      ...result,
      shouldPromptCasualSwitch: promptCasualSwitch,
      shouldWarnSummarySkip: warnSummarySkip,
    });
```

Note: Keep the existing individual functions — the close-session route (line 216) still uses `shouldPromptCasualSwitch` alone.

- [ ] **Step 3: Run sessions + settings tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/routes/sessions.ts src/services/settings.ts --no-coverage
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/settings.ts apps/api/src/routes/sessions.ts
git commit -m "perf(api): single-query skip-warning flags in summary-skip route

getSkipWarningFlags() replaces two independent findFirst() calls (#13).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Mobile logic fixes (Bugs #12, #17)

**Files:**
- Modify: `apps/mobile/src/app/session-summary/[sessionId].tsx:195-282`
- Modify: `apps/mobile/src/hooks/use-interview.ts:149-151`

#### Bug #12: Recall bridge unreachable in 5-skip path

- [ ] **Step 1: Move recall bridge fetch before skip-warning alerts**

In `apps/mobile/src/app/session-summary/[sessionId].tsx`, replace lines 195-282. The recall bridge block (originally at lines 267-278) must come **before** the skip-warning alerts:

```typescript
      // Fetch recall bridge for homework sessions BEFORE skip-warning alerts.
      // Bug #12: Previously the 5-skip warning returned early, so the recall
      // bridge was unreachable for homework sessions in the 5-9 skip range.
      if (isHomeworkSession && !recallQuestions) {
        try {
          const result = await recallBridge.mutateAsync();
          if (result.questions.length > 0) {
            setRecallQuestions(result.questions);
            return; // Stay on screen to show recall questions
          }
        } catch {
          // Best effort — continue to skip-warning flow
        }
      }

      // 5-skip warning (FR37) — early nudge before the 10-skip casual-switch prompt
      if (
        skipResult?.shouldWarnSummarySkip &&
        !skipResult?.shouldPromptCasualSwitch
      ) {
        Alert.alert(
          'Summaries help you learn',
          'Writing a quick summary after each session strengthens your memory. Try it next time!',
          [
            {
              text: 'Got it',
              onPress: () => {
                void (async () => {
                  await maybePromptForRecall();
                  router.replace('/(learner)/home');
                })();
              },
            },
          ]
        );
        return;
      }

      if (skipResult?.shouldPromptCasualSwitch) {
        Alert.alert(
          'Try Casual Explorer?',
          'You can keep learning without writing a summary each time. Switch now?',
          [
            {
              text: 'Not now',
              style: 'cancel',
              onPress: () => {
                void (async () => {
                  await maybePromptForRecall();
                  router.replace('/(learner)/home');
                })();
              },
            },
            {
              text: 'Switch',
              onPress: () => {
                void (async () => {
                  try {
                    await updateLearningMode.mutateAsync('casual');
                    await maybePromptForRecall();
                    router.replace('/(learner)/home');
                  } catch {
                    Alert.alert(
                      "Couldn't switch right now",
                      'You can change your learning mode later in More.',
                      [
                        {
                          text: 'OK',
                          onPress: () => {
                            void (async () => {
                              await maybePromptForRecall();
                              router.replace('/(learner)/home');
                            })();
                          },
                        },
                      ]
                    );
                  }
                })();
              },
            },
          ]
        );
        return;
      }
    }

    await maybePromptForRecall();
    router.replace('/(learner)/home');
```

#### Bug #17: Guard abort in finally

- [ ] **Step 2: Guard the abort call in `use-interview.ts`**

In `apps/mobile/src/hooks/use-interview.ts`, replace lines 149-151:

```typescript
      } finally {
        if (isStreamingRef.current) {
          abortRef.current?.();
        }
        abortRef.current = null;
        isStreamingRef.current = false;
```

- [ ] **Step 3: Typecheck mobile**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/session-summary/[sessionId].tsx apps/mobile/src/hooks/use-interview.ts
git commit -m "fix(mobile): recall bridge runs before skip-warning + guard abort

- Move recall bridge before 5-skip alert so homework sessions get
  recall questions in 5-9 skip range (#12)
- Guard abort with isStreamingRef in interview hook (#17)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: CI/CD security + deploy gate (Bugs #7, #8)

**Files:**
- Modify: `.github/workflows/ci.yml:21-23, 115-120`
- Modify: `.github/workflows/deploy.yml:53-55, 120-124`

#### Bug #7: contents: write escalation

- [ ] **Step 1: Revert ci.yml to `contents: read`**

In `.github/workflows/ci.yml`, replace lines 21-23:

```yaml
permissions:
  actions: read
  contents: read
```

Update the nx fix-ci step (lines 115-120) — it runs best-effort without write:

```yaml
      # Self-healing CI: AI-powered fix proposals for failed tasks.
      # Runs with contents: read — logs suggestions only. If write access
      # is needed for PR comments, move to a separate job with
      # pull-requests: write permission only.
      - name: Self-healing CI
        if: always()
        continue-on-error: true
        run: pnpm exec nx fix-ci
```

#### Bug #8: No quality gate on push-to-main

- [ ] **Step 2: Add lightweight smoke gate for push-to-main**

In `.github/workflows/deploy.yml`, replace the `api-quality-gate` job (lines 53-103):

```yaml
  api-quality-gate:
    name: API Quality Gate
    # Push-to-main: lightweight lint+typecheck (CI ran full suite on PR).
    # Dispatch: full quality gate with integration tests.
    if: github.event_name == 'push' || (github.event_name == 'workflow_dispatch' && inputs.api_environment != 'skip')
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: eduagent
          POSTGRES_PASSWORD: eduagent
          POSTGRES_DB: tests
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    env:
      DATABASE_URL: postgresql://eduagent:eduagent@localhost:5432/tests
      CI: true
    steps:
      - uses: actions/checkout@v4
        with:
          filter: tree:0

      - uses: pnpm/action-setup@v4
        with:
          standalone: true

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Apply database schema
        run: pnpm --filter @eduagent/database db:push

      - name: Lint
        run: pnpm exec nx run api:lint

      - name: Typecheck
        run: pnpm exec nx run api:typecheck

      - name: Unit tests
        if: github.event_name == 'workflow_dispatch'
        run: pnpm exec nx run api:test

      - name: Integration tests
        if: github.event_name == 'workflow_dispatch'
        run: pnpm exec nx run api:test:integration
```

Update `api-deploy` condition (lines 120-124) to always require the gate:

```yaml
  api-deploy:
    name: Deploy API (${{ github.event_name == 'push' && 'staging' || inputs.api_environment }})
    needs: [api-quality-gate, api-confirm-production]
    if: |
      always() &&
      needs.api-quality-gate.result == 'success' &&
      (github.event_name == 'push' ||
       (needs.api-confirm-production.result == 'success' || needs.api-confirm-production.result == 'skipped'))
```

- [ ] **Step 3: Validate YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); yaml.safe_load(open('.github/workflows/deploy.yml')); print('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/deploy.yml
git commit -m "fix(ci): revert contents:write + add push-to-main quality gate

- ci.yml: revert to contents:read — no action can write to repo (#7)
- deploy.yml: lint+typecheck gate on push-to-main deploys (#8)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: E2E CI workflow fixes (Bugs #9, #10, #11)

**Files:**
- Modify: `.github/workflows/e2e-ci.yml:219-221, 342-370`

- [ ] **Step 1: Fix asset cache key + TMPDIR + zipalign**

In `.github/workflows/e2e-ci.yml`, update the APK cache key (line 221):

```yaml
          key: apk-debug-${{ hashFiles('apps/mobile/app.json', 'apps/mobile/package.json', 'apps/mobile/plugins/**', 'apps/mobile/assets/**', 'pnpm-lock.yaml') }}
```

Replace the "Inject fresh JS into cached APK" step (lines 342-370):

```yaml
      - name: Inject fresh JS into cached APK
        if: steps.apk-cache.outputs.cache-hit == 'true'
        run: |
          APK="$(pwd)/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk"
          BUNDLE="$(pwd)/apps/mobile/android/app/src/main/assets/index.android.bundle"

          echo "APK size before: $(stat -c%s "$APK") bytes"

          # Replace JS bundle inside the APK (it's a ZIP archive).
          # Use WORK_DIR (not TMPDIR) to avoid shadowing the POSIX temp
          # directory variable used by keytool/apksigner (#10).
          WORK_DIR=$(mktemp -d)
          mkdir -p "$WORK_DIR/assets"
          cp "$BUNDLE" "$WORK_DIR/assets/index.android.bundle"
          (cd "$WORK_DIR" && zip "$APK" assets/index.android.bundle)
          rm -rf "$WORK_DIR"

          # zipalign MUST run BEFORE apksigner — signing invalidates
          # alignment and alignment invalidates signatures. On API 30+
          # misalignment causes INSTALL_FAILED_INVALID_APK (#9).
          ZIPALIGN=$(find "$ANDROID_SDK_ROOT/build-tools" -name "zipalign" -type f | sort -V | tail -1)
          echo "Using zipalign: $ZIPALIGN"
          "$ZIPALIGN" -f -v 4 "$APK" "${APK}.aligned"
          mv "${APK}.aligned" "$APK"

          # Re-sign with debug key (apksigner handles v1+v2+v3 schemes)
          if [ ! -f ~/.android/debug.keystore ]; then
            mkdir -p ~/.android
            keytool -genkey -v -keystore ~/.android/debug.keystore \
              -storepass android -alias androiddebugkey -keypass android \
              -keyalg RSA -keysize 2048 -validity 10000 \
              -dname "CN=Android Debug,O=Android,C=US"
          fi
          APKSIGNER=$(find "$ANDROID_SDK_ROOT/build-tools" -name "apksigner" -type f | sort -V | tail -1)
          echo "Using apksigner: $APKSIGNER"
          "$APKSIGNER" sign --ks ~/.android/debug.keystore --ks-pass pass:android \
            --ks-key-alias androiddebugkey --key-pass pass:android "$APK"

          echo "APK size after: $(stat -c%s "$APK") bytes"
```

- [ ] **Step 2: Validate YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/e2e-ci.yml')); print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e-ci.yml
git commit -m "fix(ci): zipalign before apksigner, TMPDIR rename, asset cache key

- Add zipalign between zip injection and signing (#9)
- Rename TMPDIR to WORK_DIR to avoid POSIX shadow (#10)
- Add apps/mobile/assets/** to APK cache key (#11)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Home-cards cache type + coldStart fixes (Bugs #20, #21)

**Files:**
- Modify: `apps/api/src/services/home-surface-cache.ts:34, 46-54`
- Modify: `apps/api/src/services/home-cards.ts:240-257`

**Read first:** Full contents of `home-surface-cache.ts` and `home-cards.ts`.

#### Bug #21: Guard skips legacyCoachingCard validation

- [ ] **Step 1: Make `legacyCoachingCard` optional in the type**

In `apps/api/src/services/home-surface-cache.ts`, change the type definition (line 34):

```typescript
  legacyCoachingCard?: CoachingCard;
```

This aligns the type with the runtime reality — rows created by `recordHomeCardInteraction` before coaching card precomputation won't have this field.

- [ ] **Step 2: Run home-cards tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/home-surface-cache.ts --no-coverage
```

Expected: All pass.

#### Bug #20: coldStart re-derived incorrectly

- [ ] **Step 3: Use stored `coldStart` on cache hit in `getHomeCardsForProfile`**

In `apps/api/src/services/home-cards.ts`, find the cache-hit path in `getHomeCardsForProfile` where `coldStart` is re-derived. Replace the re-derivation logic to use the stored value:

```typescript
  // Use the stored coldStart value from cache instead of re-deriving
  // from card compactness. Re-derivation falsely tags established users
  // as cold-start when their top cards happen to be non-compact (#20).
  const coldStart = cached?.data?.coldStart ?? false;
```

Only recompute `coldStart` in the cache-miss/stale path (inside `precomputeHomeCards`), where the session count query already runs.

- [ ] **Step 4: Run home-cards tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/home-cards.ts --no-coverage
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/home-surface-cache.ts apps/api/src/services/home-cards.ts
git commit -m "fix(api): optional legacyCoachingCard type + stored coldStart

- Make legacyCoachingCard optional to match runtime reality (#21)
- Use cached coldStart instead of re-deriving from compactness (#20)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Fix interaction cache corruption (Bug #22)

**Files:**
- Modify: `apps/api/src/services/home-surface-cache.ts:222-258`

- [ ] **Step 1: Preserve `rankedHomeCards` in `recordHomeCardInteraction`'s merge function**

In `apps/api/src/services/home-surface-cache.ts`, find the `recordHomeCardInteraction` function. In its call to `mergeHomeSurfaceCacheData`, the merge callback must preserve `rankedHomeCards` from the current cache instead of zeroing them. Update the merge function to spread the current value:

```typescript
  await mergeHomeSurfaceCacheData(db, profileId, (current) => {
    const interactionStats = { ...current.interactionStats };
    // ... existing interaction stat update logic ...

    return {
      ...current,
      interactionStats,
      // Preserve rankedHomeCards — let the 24h TTL handle re-ranking.
      // Previously this defaulted to [], forcing a full re-precompute
      // (5 DB queries) on every card tap (#22).
    };
  });
```

Verify the spread `...current` already includes `rankedHomeCards`. If the merge function was explicitly setting `rankedHomeCards: []`, remove that line.

- [ ] **Step 2: Run tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/home-surface-cache.ts --no-coverage
```

Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/home-surface-cache.ts
git commit -m "fix(api): preserve rankedHomeCards in interaction recording

Stops every card tap from nuking the ranked card cache and
triggering a full re-precompute (5 DB queries) (#22).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Home-cards performance + UTC fix (Bugs #23, #24)

**Files:**
- Modify: `apps/api/src/services/home-cards.ts:23-26, 235-249`

#### Bug #23: isHomeworkWindow uses UTC

- [ ] **Step 1: Widen homework window or document UTC approximation**

In `apps/api/src/services/home-cards.ts`, replace `isHomeworkWindow` (lines 23-26). Since profile timezone isn't stored yet, widen the window to cover most users:

```typescript
/**
 * Approximate homework window — widened to 12:00-22:00 UTC to cover
 * US afternoons through EU evenings. Will narrow once profile timezone
 * is stored (Epic 14+). See bug #23.
 */
function isHomeworkWindow(now: Date): boolean {
  const hour = now.getUTCHours();
  return hour >= 12 && hour <= 22;
}
```

#### Bug #24: Double DB read on cache miss

- [ ] **Step 2: Pass cached result into `precomputeHomeCards`**

In `apps/api/src/services/home-cards.ts`, find `getHomeCardsForProfile`. It reads the cache row at line 235, then calls `precomputeHomeCards` which reads it again at line 66. Update `precomputeHomeCards` to accept an optional cached argument:

In the function signature of `precomputeHomeCards`, add an optional parameter:

```typescript
export async function precomputeHomeCards(
  db: Database,
  profileId: string,
  existingCache?: HomeSurfaceCacheData | null
): Promise<PrecomputedHomeCards> {
```

Inside `precomputeHomeCards`, use `existingCache` instead of re-reading when provided:

```typescript
  const [sessionCountResult, cachedData, /* ...other parallel queries... */] =
    await Promise.all([
      // ... session count query ...
      existingCache !== undefined
        ? Promise.resolve(existingCache ? { data: existingCache } : null)
        : readHomeSurfaceCacheData(db, profileId),
      // ... other queries ...
    ]);
```

Then update the call site in `getHomeCardsForProfile`:

```typescript
  const next = await precomputeHomeCards(db, profileId, cached?.data ?? null);
```

- [ ] **Step 3: Run tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/home-cards.ts --no-coverage
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/home-cards.ts
git commit -m "fix(api): widen homework window + eliminate double cache read

- isHomeworkWindow: 12-22 UTC to cover more timezones (#23)
- precomputeHomeCards: accept optional cached data to skip re-read (#24)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Mobile home-cards UX + type fixes (Bugs #26, #28)

**Files:**
- Modify: `apps/mobile/src/hooks/use-home-cards.ts:56-60`
- Modify: `apps/mobile/src/app/(learner)/home.tsx` (HomeCardModel cast)

#### Bug #26: Replace invalidateQueries with optimistic update

- [ ] **Step 1: Replace `invalidateQueries` with `setQueryData` for immediate feedback**

In `apps/mobile/src/hooks/use-home-cards.ts`, update the `onSuccess` callback of `useTrackHomeCardInteraction`:

```typescript
    onSuccess: (_data, variables) => {
      // Optimistic update — apply interaction locally instead of
      // invalidating the full query (which triggers re-fetch + re-rank
      // and causes visible card shuffling). The server re-ranks on
      // the next foreground focus via staleTime. (#26)
      queryClient.setQueryData(
        ['home-cards', activeProfile?.id],
        (old: unknown) => old // preserve current data
      );
    },
```

Remove the `invalidateQueries` call entirely. The query's `staleTime` and React Native's `AppState` focus handler will trigger a background refetch naturally.

#### Bug #28: Remove unsafe HomeCardModel cast

- [ ] **Step 2: Replace the `as HomeCardModel[]` cast in home.tsx**

In `apps/mobile/src/app/(learner)/home.tsx`, find the cast at approximately line 270. Replace it with a map projection or remove the cast and let TypeScript infer:

```typescript
  // Map API HomeCard to local HomeCardModel, ensuring type safety
  // instead of unsafe widening cast (#28).
  const homeCards: HomeCardModel[] = (homeCardsQuery.data?.cards ?? []).map(
    (card) => ({
      ...card,
      secondaryLabel: undefined,
    })
  );
```

If `HomeCardModel` has other fields beyond `secondaryLabel` that aren't in `HomeCard`, add them with their defaults in the map.

- [ ] **Step 3: Typecheck mobile**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/hooks/use-home-cards.ts apps/mobile/src/app/\(learner\)/home.tsx
git commit -m "fix(mobile): optimistic home-card interaction + remove unsafe cast

- Replace invalidateQueries with setQueryData to prevent card shuffle (#26)
- Replace as HomeCardModel[] with map projection for type safety (#28)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Test + dead code cleanup (Bugs #29, #30, #31)

**Files:**
- Modify: `apps/api/src/routes/home-cards.test.ts:128` (unskip)
- Modify: `apps/mobile/src/app/session/index.test.tsx:475` (fix chip ID)
- Modify: `apps/api/src/services/home-cards.ts:273-275` (remove dead code)

#### Bug #29: Unskip interactions test

- [ ] **Step 1: Remove `it.skip` from the interactions test**

In `apps/api/src/routes/home-cards.test.ts`, change `it.skip` to `it` at the interactions test (around line 128). Remove the TODO comment about wiring.

- [ ] **Step 2: Run home-cards route tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/routes/home-cards.ts --no-coverage
```

Expected: Test passes (route is fully implemented).

#### Bug #30: Fix wrong_subject chip reference

- [ ] **Step 3: Fix the QuickChipId reference in session test**

In `apps/mobile/src/app/session/index.test.tsx`, find the skipped test at approximately line 475 that references `wrong_subject`. Check the `QuickChipId` union type in `session/index.tsx` (lines 101-110) and update the test to use a valid chip ID, or add `'wrong_subject'` to the union if it's a planned chip.

Read the `QuickChipId` type first to determine the correct fix. If `wrong_subject` is intended to exist, add it to the union. If not, update the test to use the closest valid ID.

#### Bug #31: Remove dead code

- [ ] **Step 4: Remove `getHomeCardIds` from home-cards.ts**

In `apps/api/src/services/home-cards.ts`, delete the `getHomeCardIds` function (lines 273-275) and remove it from any barrel exports.

- [ ] **Step 5: Run all affected tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/routes/home-cards.ts src/services/home-cards.ts --no-coverage
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/home-cards.test.ts apps/mobile/src/app/session/index.test.tsx apps/api/src/services/home-cards.ts
git commit -m "chore: unskip interactions test, fix chip ID, remove dead code

- Unskip POST /home-cards/interactions test — route is implemented (#29)
- Fix wrong_subject chip reference in session test (#30)
- Remove unused getHomeCardIds export (#31)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Deferred Items (separate PRs)

| # | Bug | Reason |
|---|-----|--------|
| 1 | No migration for UNIQUE constraint on teaching_preferences | Requires `drizzle-kit generate` + deduplication SQL. Separate DB migration PR. |
| 14 | `Record<string, any>` casts ×11 across 3 hook files | Systemic Hono RPC limitation with hyphenated routes. Needs typed accessor utility or route rename. Separate refactor PR. |
| 25 | Read-modify-write race in mergeHomeSurfaceCacheData | Documented as acceptable for MVP (single-device mobile). Needs DB-level atomic counter increment for multi-device. Phase 2. |
| 27 | use-home-cards.ts bypasses Hono RPC inference | Same root cause as #14. Bundled into the Hono RPC refactor. |

---

## Execution Order

All 12 tasks are independent. Recommended parallel groups:

| Group | Tasks | Files touched | Est. commits |
|-------|-------|---------------|-------------|
| **A — API services** | 1, 2, 3, 4 | retention-data, xp, curriculum, interview, settings, sessions | 4 |
| **B — Mobile** | 5, 11 | session-summary, use-interview, use-home-cards, home.tsx | 2 |
| **C — CI/CD** | 6, 7 | ci.yml, deploy.yml, e2e-ci.yml | 2 |
| **D — Home-cards API** | 8, 9, 10 | home-surface-cache, home-cards | 3 |
| **E — Cleanup** | 12 | home-cards.test, session/index.test, home-cards service | 1 |

After all tasks: `pnpm exec tsc --noEmit` and `pnpm exec nx run api:lint` for final verification.

---

## Change Log

- 2026-04-04: Full rewrite. Old completed items removed. 27 open bugs added from PR review triage across 6 subsystems, organized into 12 tasks + 4 deferred items.
