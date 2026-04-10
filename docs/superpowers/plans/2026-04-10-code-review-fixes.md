# Code Review Fixes — Dead Code, Unwired Pipelines, Duplicate Solutions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all dead code, unwired pipeline halves, and duplicate solutions surfaced by the 2026-04-10 code review (CR-1 through CR-21).

**Architecture:** Pure cleanup — no new features. Every task is a deletion or a unification of existing code. Each task is independent and can run as a parallel subagent. After each task, run targeted tests + typecheck to verify no regressions.

**Tech Stack:** TypeScript, Hono, Zod, React Native / Expo Router, TanStack Query, Inngest, Drizzle ORM.

**Validation commands (run after every task):**
```bash
# API
pnpm exec nx run api:typecheck
pnpm exec nx run api:lint
pnpm exec nx run api:test

# Mobile
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile

# Targeted tests (when touching specific files)
pnpm exec jest --findRelatedTests <changed-files> --no-coverage
```

---

## Batch 1 — Independent Tasks (run in parallel)

---

### Task 1: Unify `RetentionStatus` type and fix 3-value schemas [CR-1 + CR-11]

**Problem:** `RetentionStatus` is defined as a 4-value union in `RetentionSignal.tsx` and `topicProgressSchema`, but only 3 values in `subjectProgressSchema` (line 100), `dashboardChildSchema` (line 154), and `computeRetentionStatus` (line 26). The `forgotten` state is silently dropped at the subject level. The type itself lives in a UI component file instead of `@eduagent/schemas`.

**Files:**
- Modify: `packages/schemas/src/progress.ts:93-103` — add `forgotten` to `subjectProgressSchema.retentionStatus`
- Modify: `packages/schemas/src/progress.ts:150-157` — add `forgotten` to `dashboardChildSchema.subjects[].retentionStatus`
- Create: `packages/schemas/src/retention-status.ts` — standalone exported type
- Modify: `packages/schemas/src/index.ts` — re-export new file
- Modify: `apps/api/src/services/progress.ts:26-47` — add `forgotten` return + handle in aggregate
- Modify: `apps/mobile/src/components/progress/RetentionSignal.tsx:5` — import from `@eduagent/schemas`
- Modify: `apps/mobile/src/components/progress/index.ts:1` — re-export from schemas
- Modify: `apps/mobile/src/app/(app)/library.tsx:60-72` — remove duplicate `getTopicRetention`, use `computeRetentionStatus` pattern consistently

**Note on `library.tsx`:** The mobile `getTopicRetention` function adds `forgotten` for `failureCount >= 3 || xpStatus === 'decayed'` — logic the server's `computeRetentionStatus` doesn't have. Keep this local function but import `RetentionStatus` from schemas and add a comment referencing the extended logic.

- [ ] **Step 1: Create `retention-status.ts` in schemas**

```typescript
// packages/schemas/src/retention-status.ts
import { z } from 'zod';

export const retentionStatusSchema = z.enum([
  'strong',
  'fading',
  'weak',
  'forgotten',
]);
export type RetentionStatus = z.infer<typeof retentionStatusSchema>;
```

- [ ] **Step 2: Export from schemas barrel**

In `packages/schemas/src/index.ts`, add after line 21 (`export * from './progress.ts';`):
```typescript
export * from './retention-status.ts';
```

- [ ] **Step 3: Update `subjectProgressSchema` to include `forgotten`**

In `packages/schemas/src/progress.ts`, change line 100:
```typescript
// Before
retentionStatus: z.enum(['strong', 'fading', 'weak']),
// After
retentionStatus: z.enum(['strong', 'fading', 'weak', 'forgotten']),
```

- [ ] **Step 4: Update `dashboardChildSchema.subjects` to include `forgotten`**

In `packages/schemas/src/progress.ts`, change line 154:
```typescript
// Before
retentionStatus: z.enum(['strong', 'fading', 'weak']),
// After
retentionStatus: z.enum(['strong', 'fading', 'weak', 'forgotten']),
```

- [ ] **Step 5: Update `computeRetentionStatus` to return 4 values**

In `apps/api/src/services/progress.ts`, replace lines 26-36:
```typescript
function computeRetentionStatus(
  nextReviewAt: Date | null
): 'strong' | 'fading' | 'weak' | 'forgotten' {
  if (!nextReviewAt) return 'forgotten';
  const now = new Date();
  const daysUntilReview =
    (nextReviewAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntilReview > 3) return 'strong';
  if (daysUntilReview > 0) return 'fading';
  if (daysUntilReview > -7) return 'weak';
  return 'forgotten';
}
```

- [ ] **Step 6: Update `computeAggregateRetentionStatus` to handle `forgotten`**

In `apps/api/src/services/progress.ts`, replace lines 38-47:
```typescript
function computeAggregateRetentionStatus(
  statuses: Array<'strong' | 'fading' | 'weak' | 'forgotten'>
): 'strong' | 'fading' | 'weak' | 'forgotten' {
  if (statuses.length === 0) return 'strong';
  const forgottenCount = statuses.filter((s) => s === 'forgotten').length;
  const weakCount = statuses.filter((s) => s === 'weak').length;
  const fadingCount = statuses.filter((s) => s === 'fading').length;
  if (forgottenCount > statuses.length * 0.3) return 'forgotten';
  if (weakCount + forgottenCount > statuses.length * 0.3) return 'weak';
  if (fadingCount + weakCount + forgottenCount > statuses.length * 0.3) return 'fading';
  return 'strong';
}
```

- [ ] **Step 7: Remove local `RetentionStatus` type from `RetentionSignal.tsx`**

In `apps/mobile/src/components/progress/RetentionSignal.tsx`, replace line 5:
```typescript
// Before
export type RetentionStatus = 'strong' | 'fading' | 'weak' | 'forgotten';
// After
import type { RetentionStatus } from '@eduagent/schemas';
export type { RetentionStatus };
```

This preserves the re-export so all 9 downstream consumers continue to work without import changes.

- [ ] **Step 8: Import `RetentionStatus` in `library.tsx`**

In `apps/mobile/src/app/(app)/library.tsx`, add import at top:
```typescript
import type { RetentionStatus } from '@eduagent/schemas';
```

And update `getTopicRetention` return type annotation (line 60):
```typescript
function getTopicRetention(topic: SubjectRetentionTopic): RetentionStatus {
```

Remove the local `RetentionStatus` import from `'../../components/progress'` if it exists.

- [ ] **Step 9: Run validation**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx run api:typecheck
pnpm exec jest --findRelatedTests apps/api/src/services/progress.ts apps/api/src/services/progress.test.ts --no-coverage
pnpm exec jest --findRelatedTests apps/mobile/src/components/progress/RetentionSignal.tsx --no-coverage
```

Expected: all pass. The `progress.test.ts` tests that assert `retentionStatus === 'strong'` etc. should still pass since the logic didn't change for those cases.

- [ ] **Step 10: Commit**

```bash
git add packages/schemas/src/retention-status.ts packages/schemas/src/index.ts packages/schemas/src/progress.ts apps/api/src/services/progress.ts apps/mobile/src/components/progress/RetentionSignal.tsx apps/mobile/src/components/progress/index.ts apps/mobile/src/app/\(app\)/library.tsx
git commit -m "fix(schemas): unify RetentionStatus type + add forgotten to subject-level schemas [CR-1, CR-11]"
```

---

### Task 2: Remove dead mobile components [CR-8]

**Problem:** 11 components are exported but never imported by any screen. They inflate the barrel and bundle.

**Files to delete:**
- `apps/mobile/src/components/language/FluencyDrill.tsx`
- `apps/mobile/src/components/language/FluencyDrill.test.tsx`
- `apps/mobile/src/components/language/MilestoneCard.tsx`
- `apps/mobile/src/components/language/MilestoneCard.test.tsx`
- `apps/mobile/src/components/language/VocabularyList.tsx`
- `apps/mobile/src/components/language/VocabularyList.test.tsx`
- `apps/mobile/src/components/progress/RemediationCard.tsx`
- `apps/mobile/src/components/progress/RemediationCard.test.tsx` (if exists)
- `apps/mobile/src/components/common/QueryGuard.tsx`
- `apps/mobile/src/components/common/QueryGuard.test.tsx` (if exists)
- `apps/mobile/src/components/common/ApiUnreachableBanner.tsx`
- `apps/mobile/src/components/common/ApiUnreachableBanner.test.tsx` (if exists)
- `apps/mobile/src/components/common/AnimatedEntry.tsx`
- `apps/mobile/src/components/common/AnimatedEntry.test.tsx` (if exists)
- `apps/mobile/src/components/common/AnimatedFade.tsx`
- `apps/mobile/src/components/common/AnimatedFade.test.tsx` (if exists)
- `apps/mobile/src/components/common/LoadingFallback.tsx`
- `apps/mobile/src/components/common/LoadingFallback.test.tsx` (if exists)
- `apps/mobile/src/components/common/AccentPicker.tsx`
- `apps/mobile/src/components/common/AccentPicker.test.tsx` (if exists)
- `apps/mobile/src/components/coaching/CoachingCard.tsx`
- `apps/mobile/src/components/coaching/CoachingCard.test.tsx` (if exists)
- `apps/mobile/src/components/coaching/AdaptiveEntryCard.tsx`
- `apps/mobile/src/components/coaching/AdaptiveEntryCard.test.tsx`
- `apps/mobile/src/components/coaching/SessionCloseSummary.tsx`
- `apps/mobile/src/components/coaching/SessionCloseSummary.test.tsx` (if exists)

**Barrels to update:**
- `apps/mobile/src/components/common/index.ts` — remove lines 1 (AccentPicker), 2 (ApiUnreachableBanner), 4 (AnimatedEntry), 5 (AnimatedFade), 14 (LoadingFallback)
- `apps/mobile/src/components/progress/index.ts` — remove line 2 (RemediationCard)
- `apps/mobile/src/components/coaching/index.ts` — remove lines 5 (CoachingCard), 6 (AdaptiveEntryCard), 8 (SessionCloseSummary)

- [ ] **Step 1: Delete the entire `language/` directory**

```bash
rm -rf apps/mobile/src/components/language/
```

- [ ] **Step 2: Delete dead common components and their tests**

```bash
rm -f apps/mobile/src/components/common/AccentPicker.tsx \
      apps/mobile/src/components/common/AccentPicker.test.tsx \
      apps/mobile/src/components/common/ApiUnreachableBanner.tsx \
      apps/mobile/src/components/common/ApiUnreachableBanner.test.tsx \
      apps/mobile/src/components/common/AnimatedEntry.tsx \
      apps/mobile/src/components/common/AnimatedEntry.test.tsx \
      apps/mobile/src/components/common/AnimatedFade.tsx \
      apps/mobile/src/components/common/AnimatedFade.test.tsx \
      apps/mobile/src/components/common/LoadingFallback.tsx \
      apps/mobile/src/components/common/LoadingFallback.test.tsx \
      apps/mobile/src/components/common/QueryGuard.tsx \
      apps/mobile/src/components/common/QueryGuard.test.tsx
```

- [ ] **Step 3: Delete dead progress component**

```bash
rm -f apps/mobile/src/components/progress/RemediationCard.tsx \
      apps/mobile/src/components/progress/RemediationCard.test.tsx
```

- [ ] **Step 4: Delete dead coaching components**

```bash
rm -f apps/mobile/src/components/coaching/CoachingCard.tsx \
      apps/mobile/src/components/coaching/CoachingCard.test.tsx \
      apps/mobile/src/components/coaching/AdaptiveEntryCard.tsx \
      apps/mobile/src/components/coaching/AdaptiveEntryCard.test.tsx \
      apps/mobile/src/components/coaching/SessionCloseSummary.tsx \
      apps/mobile/src/components/coaching/SessionCloseSummary.test.tsx
```

- [ ] **Step 5: Update `common/index.ts` barrel**

Remove these lines from `apps/mobile/src/components/common/index.ts`:
```typescript
export { AccentPicker } from './AccentPicker';
export { ApiUnreachableBanner } from './ApiUnreachableBanner';
export { AnimatedEntry } from './AnimatedEntry';
export { AnimatedFade } from './AnimatedFade';
export { LoadingFallback } from './LoadingFallback';
```

- [ ] **Step 6: Update `progress/index.ts` barrel**

Remove this line from `apps/mobile/src/components/progress/index.ts`:
```typescript
export { RemediationCard } from './RemediationCard';
```

- [ ] **Step 7: Update `coaching/index.ts` barrel**

Remove these lines from `apps/mobile/src/components/coaching/index.ts`:
```typescript
export { CoachingCard } from './CoachingCard';
export { AdaptiveEntryCard } from './AdaptiveEntryCard';
export { SessionCloseSummary } from './SessionCloseSummary';
```

- [ ] **Step 8: Verify no broken imports**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile
```

Expected: clean. If any screen imports a deleted component, fix the import (shouldn't happen — none had consumers).

- [ ] **Step 9: Remove the `_layout.tsx` comment referencing QueryGuard**

In `apps/mobile/src/app/_layout.tsx`, find and remove the comment that says "use QueryGuard" (approximately line 59). It references a component that no longer exists.

- [ ] **Step 10: Run mobile tests**

```bash
cd apps/mobile && pnpm exec jest --no-coverage 2>&1 | tail -20
```

Expected: all pass. Deleted test files should not affect the count — they tested dead components.

- [ ] **Step 11: Commit**

```bash
git add -A apps/mobile/src/components/
git add apps/mobile/src/app/_layout.tsx
git commit -m "chore(mobile): remove 11 dead components + language/ directory [CR-8]"
```

---

### Task 3: Remove unwired Inngest listeners + no-op payment retry [CR-4 + CR-5 + CR-15]

**Problem:**
- `reviewReminder` listens for `app/retention.review-due` — never dispatched
- `freeformFilingRetry` listens for `app/filing.retry` — never dispatched
- `paymentRetry` is a registered no-op that returns `{ status: 'skipped' }` on every invocation

**Files:**
- Delete: `apps/api/src/inngest/functions/review-reminder.ts`
- Delete: `apps/api/src/inngest/functions/review-reminder.test.ts` (if exists)
- Delete: `apps/api/src/inngest/functions/freeform-filing.ts`
- Delete: `apps/api/src/inngest/functions/freeform-filing.test.ts` (if exists)
- Delete: `apps/api/src/inngest/functions/payment-retry.ts`
- Delete: `apps/api/src/inngest/functions/payment-retry.test.ts`
- Modify: `apps/api/src/inngest/index.ts` — remove imports and array entries

- [ ] **Step 1: Delete the three function files + their tests**

```bash
rm -f apps/api/src/inngest/functions/review-reminder.ts \
      apps/api/src/inngest/functions/review-reminder.test.ts \
      apps/api/src/inngest/functions/freeform-filing.ts \
      apps/api/src/inngest/functions/freeform-filing.test.ts \
      apps/api/src/inngest/functions/payment-retry.ts \
      apps/api/src/inngest/functions/payment-retry.test.ts
```

- [ ] **Step 2: Update `inngest/index.ts` — remove imports**

Remove these lines from `apps/api/src/inngest/index.ts`:
```typescript
import { reviewReminder } from './functions/review-reminder';
import { paymentRetry } from './functions/payment-retry';
import { freeformFilingRetry } from './functions/freeform-filing';
```

- [ ] **Step 3: Update `inngest/index.ts` — remove from exports**

Remove from the named exports block:
```typescript
  reviewReminder,
  paymentRetry,
  freeformFilingRetry,
```

- [ ] **Step 4: Update `inngest/index.ts` — remove from functions array**

Remove from the `functions` array:
```typescript
  reviewReminder,
  paymentRetry,
  freeformFilingRetry,
```

- [ ] **Step 5: Check for any references to removed services**

```bash
# Verify no other file imports from the deleted modules
grep -r "review-reminder\|freeform-filing\|payment-retry" apps/api/src/ --include="*.ts" | grep -v "node_modules" | grep -v ".test.ts"
```

If the notifications service imports (`sendPushNotification`, `formatReviewReminderBody`, etc.) are only used by `review-reminder.ts`, they become dead exports too — note them but don't delete (they may be needed for Story 5.6+).

- [ ] **Step 6: Run validation**

```bash
pnpm exec nx run api:typecheck
pnpm exec nx run api:test
```

Expected: all pass with fewer test files.

- [ ] **Step 7: Commit**

```bash
git add -A apps/api/src/inngest/
git commit -m "chore(api): remove 3 unwired/no-op Inngest functions [CR-4, CR-5, CR-15]"
```

---

### Task 4: Clean dead packages, config, and test utils [CR-9 + CR-10 + CR-12 + CR-13 + CR-14 + CR-16]

**Problem:** `@eduagent/factory` has zero consumers. `@eduagent/test-utils` exports 4 utilities nobody uses. API config declares `CLERK_PUBLISHABLE_KEY` and `COACHING_KV` that are never read. `drizzle-zod` is a dependency with zero imports. Several schema exports have no consumers.

**Files:**
- Modify: `packages/test-utils/src/index.ts` — remove dead exports
- Delete: `packages/test-utils/src/lib/clerk-mock.ts`
- Delete: `packages/test-utils/src/lib/inngest-mock.ts`
- Modify: `apps/api/src/config.ts:7` — remove `CLERK_PUBLISHABLE_KEY`
- Modify: `apps/api/src/index.ts:67` — remove `CLERK_PUBLISHABLE_KEY` from Bindings
- Modify: `apps/api/src/index.ts:89` — remove `COACHING_KV` from Bindings
- Modify: `packages/database/package.json:30` — remove `drizzle-zod`

**Note on `@eduagent/factory`:** Do NOT delete the package yet. It was built for test fixtures and may be wired up when test coverage expands. Instead, add a `// @deprecated — not currently consumed; wire to test fixtures or remove` comment to its barrel. Revisit after Epic 17.

**Note on dead schema exports (CR-16):** `uuidSchema`, `timestampSchema`, `paginationSchema`, `locationSchema`, `birthYearSchema`, `subjectSuggestionSchema` — these are harmless internal sub-schemas used as building blocks. Leave them exported; removing them risks breaking consumers that rely on Zod composition. No action needed.

- [ ] **Step 1: Remove dead test-utils exports**

In `packages/test-utils/src/index.ts`, remove:
```typescript
// Clerk mocks for API testing
export { createMockClerkUser, createMockClerkJWT } from './lib/clerk-mock.js';
export type { MockClerkUser } from './lib/clerk-mock.js';

// Inngest step mock for background job testing
export { createInngestStepMock } from './lib/inngest-mock.js';
```

Delete the source files:
```bash
rm -f packages/test-utils/src/lib/clerk-mock.ts packages/test-utils/src/lib/inngest-mock.ts
```

- [ ] **Step 2: Remove `CLERK_PUBLISHABLE_KEY` from API config**

In `apps/api/src/config.ts`, remove line 7:
```typescript
CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
```

In `apps/api/src/index.ts`, remove from the `Bindings` type:
```typescript
CLERK_PUBLISHABLE_KEY?: string;
```

- [ ] **Step 3: Remove `COACHING_KV` from Bindings**

In `apps/api/src/index.ts`, remove line 89:
```typescript
COACHING_KV?: KVNamespace;
```

- [ ] **Step 4: Remove `drizzle-zod` dependency**

In `packages/database/package.json`, remove from `dependencies`:
```json
"drizzle-zod": "^0.7.0",
```

Then run:
```bash
pnpm install
```

- [ ] **Step 5: Add deprecation notice to factory package**

In `packages/factory/src/index.ts`, add at line 1:
```typescript
/**
 * @deprecated This package has zero consumers as of 2026-04-10.
 * Wire to test fixtures or remove after Epic 17.
 */
```

- [ ] **Step 6: Run validation**

```bash
pnpm exec nx run api:typecheck
pnpm exec nx run api:lint
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/test-utils/ packages/database/package.json packages/factory/src/index.ts apps/api/src/config.ts apps/api/src/index.ts pnpm-lock.yaml
git commit -m "chore: remove dead test utils, stale config, unused drizzle-zod dep [CR-9, CR-10, CR-12, CR-13, CR-14]"
```

---

## Batch 2 — Independent Tasks (run in parallel)

---

### Task 5: Remove unwired service functions [CR-6 + CR-7]

**Problem:** 5 exported functions with zero production callers: `recordHomeCardInteraction`, `getUncelebratedMilestone`, `markMilestoneCelebrated`, `shouldDowngradeOnExpiry`, `getTrialDaysRemaining`. Also `PARENT_VISIBLE_REASONS` is exported but only used internally.

**Files:**
- Modify: `apps/api/src/services/home-surface-cache.ts` — remove `recordHomeCardInteraction` export
- Modify: `apps/api/src/services/milestone-detection.ts` — remove 2 exports
- Modify: `apps/api/src/services/subscription.ts` — remove 2 exports
- Modify: `apps/api/src/services/celebrations.ts` — un-export `PARENT_VISIBLE_REASONS`

- [ ] **Step 1: Remove `recordHomeCardInteraction`**

In `apps/api/src/services/home-surface-cache.ts`, delete the entire `recordHomeCardInteraction` function (lines 238 to end of function, approximately line 270). Also remove any related types (`HomeCardInteractionType`) if they're only used by this function.

- [ ] **Step 2: Remove milestone dequeue functions**

In `apps/api/src/services/milestone-detection.ts`, delete `getUncelebratedMilestone` (lines 218-235) and `markMilestoneCelebrated` (lines 237-245).

- [ ] **Step 3: Remove subscription utilities**

In `apps/api/src/services/subscription.ts`, delete `shouldDowngradeOnExpiry` (lines 129-137) and `getTrialDaysRemaining` (lines 139-153), including their JSDoc comments.

- [ ] **Step 4: Un-export `PARENT_VISIBLE_REASONS`**

In `apps/api/src/services/celebrations.ts`, change line 16:
```typescript
// Before
export const PARENT_VISIBLE_REASONS: CelebrationReason[] = [
// After
const PARENT_VISIBLE_REASONS: CelebrationReason[] = [
```

- [ ] **Step 5: Delete related tests for removed functions**

Search for tests of the removed functions and delete them:
```bash
grep -rn "recordHomeCardInteraction\|getUncelebratedMilestone\|markMilestoneCelebrated\|shouldDowngradeOnExpiry\|getTrialDaysRemaining" apps/api/src/ --include="*.test.ts"
```

Remove the `describe` blocks or test cases that test the deleted functions.

- [ ] **Step 6: Run validation**

```bash
pnpm exec nx run api:typecheck
pnpm exec nx run api:test
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/home-surface-cache.ts apps/api/src/services/milestone-detection.ts apps/api/src/services/subscription.ts apps/api/src/services/celebrations.ts
git add apps/api/src/services/*.test.ts
git commit -m "chore(api): remove 5 unwired service functions + un-export PARENT_VISIBLE_REASONS [CR-6, CR-7]"
```

---

### Task 6: Retire client coaching hook + daily-plan chain [CR-18 + CR-19]

**Problem:** The learner home screen uses three intent cards (`LearnerScreen.tsx:77`), not the coaching card system. Two parallel coaching implementations exist:
- Client: `use-coaching-card.ts` → `use-daily-plan.ts` → server `/daily-plan` route
- Server: `/coaching-card` route → `coaching-cards.ts` service

Neither is used by the learner. The client hook has divergent mastery logic (no session/card count thresholds). The daily-plan service emits stale `/(learner)/...` routes.

**Decision:** Delete the entire client coaching chain (hook + daily-plan hook). Keep the server coaching card route + service — the parent dashboard may rely on the server coaching card service for parent-side features, and the coaching card background color token (`bg-coaching-card`) is a theme token used widely and unrelated to these components.

**Files:**
- Delete: `apps/mobile/src/hooks/use-coaching-card.ts`
- Delete: `apps/mobile/src/hooks/use-coaching-card.test.ts`
- Delete: `apps/mobile/src/hooks/use-daily-plan.ts`
- Delete: `apps/mobile/src/hooks/use-daily-plan.test.ts` (if exists)
- Delete: `apps/api/src/routes/daily-plan.ts`
- Delete: `apps/api/src/routes/daily-plan.test.ts` (if exists)
- Delete: `apps/api/src/services/daily-plan.ts`
- Delete: `apps/api/src/services/daily-plan.test.ts` (if exists)
- Modify: `apps/api/src/index.ts` — remove `dailyPlanRoutes` import and `.route()` mount

- [ ] **Step 1: Delete client-side coaching and daily-plan hooks**

```bash
rm -f apps/mobile/src/hooks/use-coaching-card.ts \
      apps/mobile/src/hooks/use-coaching-card.test.ts \
      apps/mobile/src/hooks/use-daily-plan.ts \
      apps/mobile/src/hooks/use-daily-plan.test.ts
```

- [ ] **Step 2: Delete the server daily-plan route and service**

```bash
rm -f apps/api/src/routes/daily-plan.ts \
      apps/api/src/routes/daily-plan.test.ts \
      apps/api/src/services/daily-plan.ts \
      apps/api/src/services/daily-plan.test.ts
```

- [ ] **Step 3: Remove daily-plan route mount from API index**

In `apps/api/src/index.ts`, remove the import:
```typescript
import { dailyPlanRoutes } from './routes/daily-plan';
```

And remove the route mount (approximately line 200):
```typescript
.route('/', dailyPlanRoutes)
```

- [ ] **Step 4: Check for any remaining references**

```bash
grep -rn "use-coaching-card\|use-daily-plan\|dailyPlanRoutes\|daily-plan" apps/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test."
```

If `DailyPlan` or `DailyPlanItem` types from `@eduagent/schemas` are now unused, note them but leave them — the schema types are cheap and may be reused.

- [ ] **Step 5: Run validation**

```bash
pnpm exec nx run api:typecheck
pnpm exec nx run api:test
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add -A apps/api/src/routes/daily-plan.ts apps/api/src/services/daily-plan.ts apps/api/src/index.ts
git add -A apps/mobile/src/hooks/use-coaching-card.ts apps/mobile/src/hooks/use-daily-plan.ts
git commit -m "chore: retire dead coaching hook + daily-plan chain [CR-18, CR-19]"
```

---

### Task 7: Fix BYOK email contract + hide family/remove route [CR-17 + CR-21]

**Problem:**
- BYOK: Mobile collects a user-typed email, API silently ignores it and uses `account.email`. The UI is misleading.
- family/remove: Route exists, is public, but unconditionally throws `ProfileRemovalNotImplementedError`. No mobile caller.

**Decision for BYOK:** The API comment says "never trust caller-supplied email" — this is the intentional design. Fix the mobile side to not collect an email. Pre-fill with account email (read-only display) and remove the text input.

**Decision for family/remove:** Comment out the route registration so it's not exposed. Keep the service code (it contains the not-implemented guard, useful when the invite/claim flow is built).

**Files:**
- Modify: `apps/mobile/src/app/(app)/subscription.tsx` — remove BYOK email input, show account email as confirmation
- Modify: `apps/api/src/routes/billing.ts` — comment out the `/subscription/family/remove` route registration
- Modify: `packages/schemas/src/billing.ts` — remove `email` field from `byokWaitlistSchema` (if it has one)

- [ ] **Step 1: Check the BYOK schema**

Read `packages/schemas/src/billing.ts` and find `byokWaitlistSchema` to see if it requires an `email` field.

- [ ] **Step 2: Remove email from BYOK schema (if present)**

If `byokWaitlistSchema` has an `email` field, remove it:
```typescript
// Before
export const byokWaitlistSchema = z.object({
  email: z.string().email(),
});
// After
export const byokWaitlistSchema = z.object({});
```

- [ ] **Step 3: Update BYOK API route**

In `apps/api/src/routes/billing.ts`, the route already uses `account.email`. If the schema no longer requires `email`, the `zValidator` will accept an empty body. Update the route to remove the `zValidator` call entirely if the schema is now empty, or keep it as a no-body endpoint:

```typescript
.post('/byok-waitlist', async (c) => {
  const db = c.get('db');
  const account = c.get('account');
  const email = account.email;
  await addToByokWaitlist(db, email);
  return c.json({ message: 'Added to BYOK waitlist', email }, 201);
})
```

- [ ] **Step 4: Simplify mobile BYOK UI**

In `apps/mobile/src/app/(app)/subscription.tsx`, replace the email input + submit handler with a simple confirmation button. Remove `byokEmail` state and `handleByokSubmit`. The new handler should submit directly without collecting email:

```typescript
const handleByokSubmit = useCallback(async () => {
  try {
    await byokWaitlist.mutateAsync({});
    Alert.alert('Waitlist', 'You have been added to the BYOK waitlist.');
  } catch {
    Alert.alert('Error', 'Could not join waitlist. Try again.');
  }
}, [byokWaitlist]);
```

Remove the `byokEmail` state variable and the `TextInput` component that collects it. Replace with a `Text` showing the account email (read-only) and a "Join Waitlist" button.

- [ ] **Step 5: Comment out family/remove route**

In `apps/api/src/routes/billing.ts`, comment out the entire `.post('/subscription/family/remove', ...)` chain (approximately lines 535-580):

```typescript
// ---------------------------------------------------------------------------
// Family profile removal — disabled until invite/claim flow exists (CR-21)
// ---------------------------------------------------------------------------
// .post(
//   '/subscription/family/remove',
//   zValidator('json', familyRemoveProfileSchema),
//   async (c) => { ... }
// )
```

- [ ] **Step 6: Run validation**

```bash
pnpm exec nx run api:typecheck
pnpm exec nx run api:test
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec jest --findRelatedTests apps/mobile/src/app/\(app\)/subscription.tsx --no-coverage
```

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/app/\(app\)/subscription.tsx apps/api/src/routes/billing.ts packages/schemas/src/billing.ts
git commit -m "fix(billing): remove misleading BYOK email input + hide unfinished family/remove route [CR-17, CR-21]"
```

---

### Task 8: Quarantine dormant Stripe hooks [CR-20]

**Problem:** `use-subscription.ts` exports 4 Stripe hooks (`useCreateCheckout`, `useCancelSubscription`, `useCreatePortalSession`, `usePurchaseTopUp`) that have zero non-test callers. They're intended for a future web client but live in the mobile module, inflating the mobile bundle and creating maintenance burden.

**Decision:** Move the 4 hooks and their types to a separate file `use-subscription-stripe.ts` with a clear header comment. Remove them from the main `use-subscription.ts` barrel. This keeps the code available for future web use without polluting the mobile module.

**Files:**
- Create: `apps/mobile/src/hooks/use-subscription-stripe.ts` — move the 4 hooks here
- Modify: `apps/mobile/src/hooks/use-subscription.ts` — remove the 4 hooks + their type imports
- Modify: `apps/mobile/src/hooks/use-subscription.test.ts` — update imports if tests reference the Stripe hooks

- [ ] **Step 1: Create `use-subscription-stripe.ts`**

Move the 4 Stripe hook functions and their required type imports from `use-subscription.ts` (lines 168-260+) into a new file `apps/mobile/src/hooks/use-subscription-stripe.ts`. Include the header comment:

```typescript
// ---------------------------------------------------------------------------
// Stripe mutation hooks — dormant for mobile, kept for future web client.
// Mobile billing uses RevenueCat IAP (see use-revenuecat.ts).
// These hooks call Stripe checkout/portal/cancel API routes.
// ---------------------------------------------------------------------------

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { assertOk } from '../lib/assert-ok';

// Import the types from the main subscription hooks file or define locally
// ... (copy the relevant type definitions)

export function useCreateCheckout() { ... }
export function useCancelSubscription() { ... }
export function useCreatePortalSession() { ... }
export function usePurchaseTopUp() { ... }
```

- [ ] **Step 2: Remove Stripe hooks from `use-subscription.ts`**

Delete lines 168-end (the entire Stripe hooks section) from `apps/mobile/src/hooks/use-subscription.ts`. Keep only the RevenueCat-facing hooks.

- [ ] **Step 3: Update test imports**

In `apps/mobile/src/hooks/use-subscription.test.ts`, update any imports of the 4 Stripe hooks to import from `./use-subscription-stripe` instead.

- [ ] **Step 4: Run validation**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec jest --findRelatedTests apps/mobile/src/hooks/use-subscription.ts apps/mobile/src/hooks/use-subscription-stripe.ts --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-subscription.ts apps/mobile/src/hooks/use-subscription-stripe.ts apps/mobile/src/hooks/use-subscription.test.ts
git commit -m "chore(mobile): quarantine dormant Stripe hooks into separate module [CR-20]"
```

---

## Batch 3 — Final Tasks (run in parallel)

---

### Task 9: Align ChatMessage role enum [CR-2]

**Problem:** `ChatShell.tsx` defines `role: 'ai' | 'user'` but schemas use `role: 'user' | 'assistant'`. The mismatch creates a fragile translation boundary.

**Decision:** Change the mobile `ChatMessage` interface to use `'assistant'` instead of `'ai'`. Update all references in the session UI code. This aligns with the schema contract.

**Files:**
- Modify: `apps/mobile/src/components/session/ChatShell.tsx:26` — change `'ai'` to `'assistant'`
- Search-and-replace: all files in `apps/mobile/src/` that compare `role === 'ai'` or set `role: 'ai'`

- [ ] **Step 1: Find all references to `role: 'ai'` or `=== 'ai'`**

```bash
grep -rn "'ai'" apps/mobile/src/components/session/ apps/mobile/src/hooks/use-sessions.ts --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: Update `ChatMessage` interface**

In `apps/mobile/src/components/session/ChatShell.tsx`, line 26:
```typescript
// Before
role: 'ai' | 'user';
// After
role: 'assistant' | 'user';
```

- [ ] **Step 3: Update all `'ai'` references to `'assistant'`**

In every file found in Step 1, replace:
- `role: 'ai'` → `role: 'assistant'`
- `role === 'ai'` → `role === 'assistant'`
- `role !== 'ai'` → `role !== 'assistant'`

- [ ] **Step 4: Update tests**

Search session test files for `'ai'` role references and update them:
```bash
grep -rn "'ai'" apps/mobile/src/components/session/*.test.* apps/mobile/src/hooks/use-sessions.test.* --include="*.ts" --include="*.tsx"
```

- [ ] **Step 5: Run validation**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec jest --findRelatedTests apps/mobile/src/components/session/ChatShell.tsx apps/mobile/src/hooks/use-sessions.ts --no-coverage
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/session/ apps/mobile/src/hooks/use-sessions.ts
git commit -m "fix(mobile): align ChatMessage role enum to schema ('assistant' not 'ai') [CR-2]"
```

---

### Task 10: Document age bracket naming divergence [CR-3]

**Problem:** `computeAgeBracket` (schemas) returns `'child' | 'adolescent' | 'adult'` while `personaFromBirthYear` (mobile) returns `'teen' | 'learner' | 'parent'`. Same thresholds, different labels. The mobile naming is also semantically misleading (age < 13 called `'teen'`).

**Decision:** These serve different purposes (consent gating vs UI theming) and have different consumers. Do NOT unify — add cross-reference JSDoc comments so developers understand the relationship. Fix the misleading JSDoc in `profile.ts` (age < 13 is `'teen'` for theme, not because they're teens).

**Files:**
- Modify: `packages/schemas/src/age.ts` — add cross-reference to `personaFromBirthYear`
- Modify: `apps/mobile/src/lib/profile.ts:35-48` — fix JSDoc, add cross-reference to `computeAgeBracket`

- [ ] **Step 1: Update `computeAgeBracket` JSDoc**

In `packages/schemas/src/age.ts`, add before line 10:
```typescript
/**
 * Computes an age bracket from birthYear for consent gating and voice tone.
 *
 * Uses `currentYear - birthYear`, which can overestimate by up to 11 months.
 * Callers that need conservative safety gating (consent, minimum-age checks)
 * should use `<=` thresholds to compensate.
 *
 * @see personaFromBirthYear in apps/mobile/src/lib/profile.ts — mobile-only
 *   UI theme variant with different labels ('teen' | 'learner' | 'parent').
 *   Same thresholds, different purpose. Do not unify.
 */
```

- [ ] **Step 2: Fix `personaFromBirthYear` JSDoc**

In `apps/mobile/src/lib/profile.ts`, replace the JSDoc (lines 35-38):
```typescript
/**
 * Derive a visual persona for UI theming from the profile's birthYear.
 * Under 13 → 'teen' (child-friendly theme), 13–17 → 'learner', 18+ → 'parent'.
 * Falls back to 'learner' when birthYear is null/undefined.
 *
 * The label names are theme keys, not age descriptions — a child under 13
 * gets the 'teen' theme because the learner/parent themes assume more maturity.
 *
 * @see computeAgeBracket in @eduagent/schemas — shared consent-gating variant
 *   with labels ('child' | 'adolescent' | 'adult'). Same thresholds, different purpose.
 */
```

- [ ] **Step 3: Run typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx run api:typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/schemas/src/age.ts apps/mobile/src/lib/profile.ts
git commit -m "docs: cross-reference age bracket and persona functions [CR-3]"
```

---

## Parallelism Guide for Subagent Dispatch

| Batch | Tasks | Can run in parallel? | Notes |
|-------|-------|---------------------|-------|
| 1 | 1, 2, 3, 4 | Yes — disjoint file sets | Task 1 touches schemas, Task 2 touches mobile components, Task 3 touches Inngest, Task 4 touches packages/config |
| 2 | 5, 6, 7, 8 | Yes — disjoint file sets | Task 5 touches API services, Task 6 touches hooks + daily-plan, Task 7 touches billing, Task 8 touches subscription hooks |
| 3 | 9, 10 | Yes — disjoint file sets | Task 9 touches session components, Task 10 is JSDoc-only |

After each batch completes, run the full validation suite before starting the next batch:
```bash
pnpm exec nx run api:typecheck && pnpm exec nx run api:lint && pnpm exec nx run api:test
cd apps/mobile && pnpm exec tsc --noEmit && pnpm exec nx lint mobile
```
