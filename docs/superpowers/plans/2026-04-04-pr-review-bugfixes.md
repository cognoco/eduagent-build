# PR Review Bugfixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 16 open bugs surfaced from closed PR code reviews — covering API data integrity, CI/CD security, SSE error handling, mobile logic gaps, and type safety.

**Architecture:** Fixes are grouped into 7 tasks by subsystem. Each task is independent (no cross-task dependencies) so they can be parallelized. All fixes are backward-compatible — no new tables, no new API routes, no breaking changes. The CI/CD fixes are YAML-only.

**Tech Stack:** Hono, Drizzle ORM, Jest 30, GitHub Actions, React Native

---

## File Map

| File | Change | Task |
|------|--------|------|
| `apps/api/src/services/retention-data.ts` | Atomic upsert with `.returning()`, best-effort XP sync | 1 |
| `apps/api/src/services/xp.ts` | Return boolean from `syncXpLedgerStatus` + debug log | 1 |
| `apps/api/src/services/curriculum.ts` | Wrap sort-order updates in `db.transaction()` | 2 |
| `apps/api/src/routes/interview.ts` | try/catch post-stream writes, emit SSE error event | 3 |
| `apps/api/src/services/settings.ts` | Combine `shouldPromptCasualSwitch` + `shouldWarnSummarySkip` into single query | 4 |
| `apps/api/src/routes/sessions.ts` | Call new combined function instead of two separate calls | 4 |
| `apps/mobile/src/app/session-summary/[sessionId].tsx` | Fix homework recall bridge unreachable in 5-skip warning path | 5 |
| `apps/mobile/src/hooks/use-interview.ts` | Guard abort call with `isStreamingRef.current` | 5 |
| `.github/workflows/ci.yml` | Revert to `contents: read`, isolate `nx fix-ci` | 6 |
| `.github/workflows/deploy.yml` | Add lightweight smoke gate on push-to-main | 6 |
| `.github/workflows/e2e-ci.yml` | Fix zipalign, TMPDIR, asset cache key | 7 |

---

### Task 1: Fix retention-data + XP sync bugs (Bugs #2, #3, #4)

**Files:**
- Modify: `apps/api/src/services/retention-data.ts:548-589`
- Modify: `apps/api/src/services/xp.ts:132-148`
- Test: `apps/api/src/services/retention-data.test.ts`
- Test: `apps/api/src/services/xp.test.ts`

#### Bug #2: Race condition — non-atomic read-back in setTeachingPreference

- [ ] **Step 1: Add `.returning()` to the upsert in `setTeachingPreference`**

In `apps/api/src/services/retention-data.ts`, replace lines 566-589:

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

- [ ] **Step 2: Run related tests to verify nothing broke**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/retention-data.ts --no-coverage
```

Expected: All existing tests pass. The behavior is identical — we just eliminated the second query.

#### Bug #3: syncXpLedgerStatus failure aborts recall test

- [ ] **Step 3: Wrap `syncXpLedgerStatus` call in try/catch in `processRecallTest`**

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

#### Bug #4: Silent no-op in syncXpLedgerStatus

- [ ] **Step 5: Return a boolean from `syncXpLedgerStatus` and log on no-op**

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

- [ ] **Step 6: Update xp.test.ts to expect boolean return values**

Update the existing `syncXpLedgerStatus` tests to assert the return value:

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

### Task 2: Wrap curriculum reorder in transaction (Bug #15)

**Files:**
- Modify: `apps/api/src/services/curriculum.ts:569-581`
- Test: `apps/api/src/services/curriculum.test.ts` (existing tests)

- [ ] **Step 1: Wrap the sort-order update loop in `db.transaction()`**

In `apps/api/src/services/curriculum.ts`, replace lines 569-592:

```typescript
  // Persist new sort order + adaptation record atomically.
  // Without a transaction, a mid-loop connection drop would leave
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

    // Record adaptation for audit
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
Adaptation audit record now also rolls back on failure.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Interview SSE error handling (Bug #16)

**Files:**
- Modify: `apps/api/src/routes/interview.ts:100-143`
- Test: `apps/api/src/routes/interview.test.ts`

- [ ] **Step 1: Add try/catch around post-stream writes and emit error event**

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
              message: 'Failed to save interview progress. Please try again.',
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

If onComplete/updateDraft/persistCurriculum throw after streaming,
the client now receives a type:'error' event instead of a silent
connection close (#16).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Combine skip-warning DB queries (Bug #13)

**Files:**
- Modify: `apps/api/src/services/settings.ts:326-364`
- Modify: `apps/api/src/routes/sessions.ts:345-352`
- Test: `apps/api/src/routes/sessions.test.ts`
- Test: `apps/api/src/services/settings.test.ts` (if exists)

- [ ] **Step 1: Add a combined function in settings.ts**

In `apps/api/src/services/settings.ts`, add after line 364 (after `shouldWarnSummarySkip`):

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

  return { shouldPromptCasualSwitch: promptCasualSwitch, shouldWarnSummarySkip: warnSummarySkip };
}
```

- [ ] **Step 2: Update the skip-summary route in sessions.ts to use the combined function**

In `apps/api/src/routes/sessions.ts`, update the import (line 43-46):

```typescript
import {
  shouldPromptCasualSwitch,
  shouldWarnSummarySkip,
  getSkipWarningFlags,
} from '../services/settings';
```

Then replace lines 345-352 (in the skip-summary handler):

```typescript
    const { shouldPromptCasualSwitch: promptCasualSwitch, shouldWarnSummarySkip: warnSummarySkip } =
      await getSkipWarningFlags(db, profileId);
    return c.json({
      ...result,
      shouldPromptCasualSwitch: promptCasualSwitch,
      shouldWarnSummarySkip: warnSummarySkip,
    });
```

Note: Keep the existing `shouldPromptCasualSwitch` and `shouldWarnSummarySkip` functions — they're still used individually in the close-session route (line 216). Do not remove them.

- [ ] **Step 3: Run sessions tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/routes/sessions.ts --no-coverage
```

Expected: All pass. Existing mock setup covers both flags.

- [ ] **Step 4: Run settings tests**

```bash
cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/settings.ts --no-coverage
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/settings.ts apps/api/src/routes/sessions.ts
git commit -m "perf(api): combine skip-warning DB queries into single read

getSkipWarningFlags() replaces two independent findFirst() calls
in the skip-summary route, eliminating the double round-trip in
the 5-9 skip range (#13).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Mobile logic fixes (Bugs #12, #17)

**Files:**
- Modify: `apps/mobile/src/app/session-summary/[sessionId].tsx:195-278`
- Modify: `apps/mobile/src/hooks/use-interview.ts:149-151`

#### Bug #12: Homework recall bridge unreachable in 5-skip warning

- [ ] **Step 1: Move recall bridge fetch before the skip-warning alerts**

In `apps/mobile/src/app/session-summary/[sessionId].tsx`, restructure the `handleSkip` function. The recall bridge fetch (lines 267-278) must execute **before** the skip-warning alerts (lines 195-264). Replace lines 195-282:

```typescript
      // Fetch recall bridge for homework sessions BEFORE skip-warning alerts.
      // Bug #12: The 5-skip warning returned early, so the recall bridge was
      // unreachable for homework sessions in the 5-9 skip range.
      if (isHomeworkSession && !recallQuestions) {
        try {
          const result = await recallBridge.mutateAsync();
          if (result.questions.length > 0) {
            setRecallQuestions(result.questions);
            return; // Stay on screen to show recall questions
          }
        } catch {
          // Best effort — continue to skip-warning flow if recall bridge fails
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

- [ ] **Step 2: Verify the component compiles**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: No errors.

#### Bug #17: Unconditional abort in finally

- [ ] **Step 3: Guard the abort call in `use-interview.ts`**

In `apps/mobile/src/hooks/use-interview.ts`, replace lines 149-151:

```typescript
      } finally {
        if (isStreamingRef.current) {
          abortRef.current?.();
        }
        abortRef.current = null;
        isStreamingRef.current = false;
```

- [ ] **Step 4: Verify the hook compiles**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/session-summary/[sessionId].tsx apps/mobile/src/hooks/use-interview.ts
git commit -m "fix(mobile): homework recall bridge now runs before skip-warning alerts

- Move recall bridge fetch before 5-skip warning so homework sessions
  in the 5-9 skip range still get recall questions (#12)
- Guard abort call in useStreamInterviewMessage with isStreamingRef (#17)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: CI/CD security + deploy gate fixes (Bugs #7, #8)

**Files:**
- Modify: `.github/workflows/ci.yml:21-23, 115-120`
- Modify: `.github/workflows/deploy.yml:53-55, 120-124`

#### Bug #7: contents: write permission escalation

- [ ] **Step 1: Revert `ci.yml` to `contents: read` and isolate `nx fix-ci` safely**

In `.github/workflows/ci.yml`, replace lines 21-23:

```yaml
permissions:
  actions: read
  contents: read
```

Then update the `nx fix-ci` step (lines 115-120) to run with `continue-on-error: true` since it may need write access for PR comments but should not have write access to repo contents:

```yaml
      # Self-healing CI: AI-powered fix proposals for failed tasks.
      # Runs with contents: read — cannot push commits, only logs suggestions.
      # If write access is needed for PR comments, move to a separate job
      # with pull-requests: write only.
      - name: Self-healing CI
        if: always()
        continue-on-error: true
        run: pnpm exec nx fix-ci
```

- [ ] **Step 2: Verify YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" 2>/dev/null || python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

Expected: No errors.

#### Bug #8: No quality gate on push-to-main deploy

- [ ] **Step 3: Add lightweight smoke gate for push-to-main deploys**

In `.github/workflows/deploy.yml`, update `api-quality-gate` (lines 53-55) to also run on push-to-main, but with a slimmer check set:

```yaml
  api-quality-gate:
    name: API Quality Gate
    # On push-to-main: lightweight lint+typecheck only (CI already ran full suite on PR).
    # On dispatch: full quality gate with integration tests.
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

Then update `api-deploy` (lines 120-124) to always require the quality gate:

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

- [ ] **Step 4: Verify YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))" 2>/dev/null || python -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))"
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/deploy.yml
git commit -m "fix(ci): revert contents:write escalation + add push-to-main quality gate

- ci.yml: revert to contents:read — nx fix-ci runs best-effort (#7)
- deploy.yml: api-quality-gate now runs lint+typecheck on push-to-main
  so direct pushes/bot merges can't deploy unchecked to staging (#8)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: E2E CI workflow fixes (Bugs #9, #10, #11)

**Files:**
- Modify: `.github/workflows/e2e-ci.yml:219-221, 340-370`

- [ ] **Step 1: Fix TMPDIR shadowing + add zipalign + add asset cache key**

In `.github/workflows/e2e-ci.yml`, update the APK cache key (lines 219-221):

```yaml
          key: apk-debug-${{ hashFiles('apps/mobile/app.json', 'apps/mobile/package.json', 'apps/mobile/plugins/**', 'apps/mobile/assets/**', 'pnpm-lock.yaml') }}
```

Then replace the "Inject fresh JS into cached APK" step (lines 342-370):

```yaml
      - name: Inject fresh JS into cached APK
        if: steps.apk-cache.outputs.cache-hit == 'true'
        run: |
          APK="$(pwd)/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk"
          BUNDLE="$(pwd)/apps/mobile/android/app/src/main/assets/index.android.bundle"

          echo "APK size before: $(stat -c%s "$APK") bytes"

          # Replace JS bundle inside the APK (it's a ZIP archive).
          # Use WORK_DIR instead of TMPDIR to avoid shadowing the POSIX
          # temp directory variable used by keytool/apksigner.
          WORK_DIR=$(mktemp -d)
          mkdir -p "$WORK_DIR/assets"
          cp "$BUNDLE" "$WORK_DIR/assets/index.android.bundle"
          (cd "$WORK_DIR" && zip "$APK" assets/index.android.bundle)
          rm -rf "$WORK_DIR"

          # zipalign MUST run before apksigner — signing after alignment
          # invalidates the signature, and alignment after signing invalidates
          # the alignment. On API 30+ misalignment causes INSTALL_FAILED_INVALID_APK.
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

- [ ] **Step 2: Verify YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/e2e-ci.yml'))" 2>/dev/null || python -c "import yaml; yaml.safe_load(open('.github/workflows/e2e-ci.yml'))"
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e-ci.yml
git commit -m "fix(ci): zipalign before apksigner, fix TMPDIR shadow, add asset cache key

- Add zipalign step between zip injection and apksigner (#9)
- Rename TMPDIR to WORK_DIR to avoid shadowing POSIX env (#10)
- Add apps/mobile/assets/** to APK cache key (#11)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Deferred (not in this plan)

| # | Bug | Reason |
|---|-----|--------|
| 1 | No migration for UNIQUE constraint | Requires `drizzle-kit generate` + deduplication SQL — separate DB migration PR |
| 14/18 | `Record<string, any>` casts (×11) | Systemic Hono RPC limitation — needs a typed accessor helper across all hooks. Separate refactor PR. |

---

## Execution Order (recommended)

Tasks 1-7 are independent. For maximum speed, tasks can be parallelized:
- **Group A (API):** Tasks 1, 2, 3, 4 — different service files, no overlap
- **Group B (Mobile):** Task 5 — mobile-only files
- **Group C (CI/CD):** Tasks 6, 7 — workflow files only

After all tasks: run `pnpm exec tsc --noEmit` and `pnpm exec nx run api:lint` for final verification.
