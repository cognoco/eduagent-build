# Epic 16 Phase D: Missing Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the two remaining Phase D features: (1) parent push notifications for struggle signals, and (2) fix the check-in prompt threshold to use `effectivenessSessionCount` per spec FR248.6.

**Architecture:** Feature 1 adds a new Inngest step after `analyze-learner-profile` that captures struggle notifications and sends push notifications to the parent via the existing `sendPushNotification` pipeline. Feature 2 is a small fix to `buildMemoryBlock` — add `effectivenessSessionCount` to the `MemoryBlockProfile` interface and gate the check-in instruction on it instead of `totalProfileSignalCount`.

**Tech Stack:** Inngest (background steps), Expo Push API (via `services/notifications.ts`), Drizzle ORM, Jest (unit + integration tests)

**Spec:** `docs/specs/Done/2026-04-07-epic-16-adaptive-memory-design.md` — FR247.6, FR247.7, FR248.6

**Note on FR250.8:** The spec says "two clearly labeled toggles, not a matrix" — the existing `memoryCollectionEnabled` + `memoryInjectionEnabled` toggles satisfy this requirement. No work needed.

---

## File Structure

### Modified Files

| File | Change |
|------|--------|
| `packages/database/src/schema/progress.ts` | Add 3 values to `notificationTypeEnum` |
| `apps/api/src/services/notifications.ts` | Add 3 types to `NotificationPayload.type` union, add `sendStruggleNotification()` helper |
| `apps/api/src/services/notifications.test.ts` | Tests for `sendStruggleNotification` |
| `apps/api/src/inngest/functions/session-completed.ts` | Capture `applyAnalysis()` return, add `notify-struggle` step |
| `apps/api/src/services/learner-profile.ts` | Add `effectivenessSessionCount` to `MemoryBlockProfile`, fix check-in threshold |
| `apps/api/src/services/learner-profile.test.ts` | Update `buildMemoryBlock` tests for new threshold |
| `apps/api/src/services/session/session-exchange.ts` | Pass `effectivenessSessionCount` through to `buildMemoryBlock` |

### New Files

| File | Responsibility |
|------|---------------|
| `apps/api/drizzle/0024_*.sql` | Migration adding 3 enum values to `notification_type` |

---

## Task 1: Add Struggle Notification Types to Database Enum + TypeScript (FR247.6)

**Files:**
- Modify: `packages/database/src/schema/progress.ts`
- Modify: `apps/api/src/services/notifications.ts`

- [ ] **Step 1: Add enum values to Drizzle schema**

In `packages/database/src/schema/progress.ts`, add 3 values to the `notificationTypeEnum` array:

```typescript
export const notificationTypeEnum = pgEnum('notification_type', [
  'review_reminder',
  'daily_reminder',
  'trial_expiry',
  'streak_warning',
  'consent_request',
  'consent_reminder',
  'consent_warning',
  'consent_expired',
  'subscribe_request',
  'recall_nudge',
  'weekly_progress',
  'monthly_report',
  'progress_refresh',
  'struggle_noticed',
  'struggle_flagged',
  'struggle_resolved',
]);
```

- [ ] **Step 2: Add types to NotificationPayload**

In `apps/api/src/services/notifications.ts`, update the `NotificationPayload` interface's `type` union to include the 3 new types:

```typescript
export interface NotificationPayload {
  profileId: string;
  title: string;
  body: string;
  type:
    | 'review_reminder'
    | 'daily_reminder'
    | 'trial_expiry'
    | 'streak_warning'
    | 'consent_request'
    | 'consent_reminder'
    | 'consent_warning'
    | 'consent_expired'
    | 'subscribe_request'
    | 'recall_nudge'
    | 'weekly_progress'
    | 'monthly_report'
    | 'progress_refresh'
    | 'struggle_noticed'
    | 'struggle_flagged'
    | 'struggle_resolved';
}
```

- [ ] **Step 3: Generate migration**

Run: `pnpm run db:generate`

Expected: A new migration file (e.g., `0024_*.sql`) with:

```sql
ALTER TYPE "notification_type" ADD VALUE 'struggle_noticed';
ALTER TYPE "notification_type" ADD VALUE 'struggle_flagged';
ALTER TYPE "notification_type" ADD VALUE 'struggle_resolved';
```

- [ ] **Step 4: Apply migration to dev**

Run: `pnpm run db:push:dev`

- [ ] **Step 5: Verify typecheck**

Run: `pnpm exec nx run api:typecheck`

Expected: No errors.

- [ ] **Step 6: Commit**

```
feat(db): add struggle notification types to notification_type enum [FR247.6]
```

---

## Task 2: sendStruggleNotification Helper (FR247.6, FR247.7)

**Files:**
- Modify: `apps/api/src/services/notifications.ts`
- Modify: `apps/api/src/services/notifications.test.ts` (create if not exists)

- [ ] **Step 1: Write failing tests for sendStruggleNotification**

Add tests (create `apps/api/src/services/notifications.test.ts` if it does not exist, or add to the existing file):

```typescript
import { sendStruggleNotification, formatStruggleNotificationCopy } from './notifications';

describe('formatStruggleNotificationCopy', () => {
  it('returns softer copy for struggle_noticed', () => {
    const copy = formatStruggleNotificationCopy('struggle_noticed', 'fractions', 'Alex');
    expect(copy.title).toBe('Learning update');
    expect(copy.body).toContain('Alex');
    expect(copy.body).toContain('fractions');
    expect(copy.body).toContain('challenging');
    expect(copy.body).not.toContain('extra support');
  });

  it('returns stronger copy for struggle_flagged', () => {
    const copy = formatStruggleNotificationCopy('struggle_flagged', 'fractions', 'Alex');
    expect(copy.title).toBe('Learning update');
    expect(copy.body).toContain('Alex');
    expect(copy.body).toContain('fractions');
    expect(copy.body).toContain('extra support');
  });

  it('returns celebration copy for struggle_resolved', () => {
    const copy = formatStruggleNotificationCopy('struggle_resolved', 'fractions', 'Alex');
    expect(copy.title).toContain('Great news');
    expect(copy.body).toContain('Alex');
    expect(copy.body).toContain('fractions');
    expect(copy.body).toContain('overcome');
  });

  it('uses fallback name when childName is not provided', () => {
    const copy = formatStruggleNotificationCopy('struggle_noticed', 'fractions', null);
    expect(copy.body).toContain('Your child');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest --testPathPattern notifications.test --no-coverage -t "formatStruggleNotificationCopy"`

Expected: FAIL — `formatStruggleNotificationCopy` is not exported.

- [ ] **Step 3: Implement formatStruggleNotificationCopy and sendStruggleNotification**

Add to `apps/api/src/services/notifications.ts`:

```typescript
import type { StruggleNotification } from './learner-profile';

/**
 * FR247.6/FR247.7: Format push notification copy for struggle signals.
 * Two-tier system: softer "noticed" at medium confidence, stronger "flagged" at high.
 */
export function formatStruggleNotificationCopy(
  type: 'struggle_noticed' | 'struggle_flagged' | 'struggle_resolved',
  topic: string,
  childName: string | null
): { title: string; body: string } {
  const name = childName ?? 'Your child';

  switch (type) {
    case 'struggle_noticed':
      return {
        title: 'Learning update',
        body: `It looks like ${name} is finding ${topic} challenging. Nothing to worry about — just keeping you in the loop.`,
      };
    case 'struggle_flagged':
      return {
        title: 'Learning update',
        body: `${name} has been working hard on ${topic} — they may need some extra support.`,
      };
    case 'struggle_resolved':
      return {
        title: 'Great news!',
        body: `${name} seems to have overcome their difficulty with ${topic}.`,
      };
  }
}

/**
 * FR247.6: Send struggle push notification to the parent of a child profile.
 * Looks up parent via familyLinks, resolves child display name, sends push.
 */
export async function sendStruggleNotification(
  db: Database,
  childProfileId: string,
  notification: StruggleNotification
): Promise<NotificationResult> {
  // 1. Find parent via familyLinks
  const link = await db.query.familyLinks.findFirst({
    where: eq(familyLinks.childProfileId, childProfileId),
  });
  if (!link) {
    return { sent: false, reason: 'no_parent_link' };
  }

  // 2. Get child display name
  const childProfile = await db.query.profiles.findFirst({
    where: eq(profiles.id, childProfileId),
    columns: { displayName: true },
  });
  const childName = childProfile?.displayName ?? null;

  // 3. Format and send
  const copy = formatStruggleNotificationCopy(
    notification.type,
    notification.topic,
    childName
  );

  return sendPushNotification(db, {
    profileId: link.parentProfileId,
    title: copy.title,
    body: copy.body,
    type: notification.type,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest --testPathPattern notifications.test --no-coverage -t "formatStruggleNotificationCopy"`

Expected: All 4 tests PASS.

- [ ] **Step 5: Run typecheck**

Run: `pnpm exec nx run api:typecheck`

Expected: No errors.

- [ ] **Step 6: Commit**

```
feat(api): add sendStruggleNotification helper for parent push alerts [FR247.6, FR247.7]
```

---

## Task 3: Wire Struggle Notifications in session-completed Inngest (FR247.6)

**Files:**
- Modify: `apps/api/src/inngest/functions/session-completed.ts`

- [ ] **Step 1: Import sendStruggleNotification**

Add to the imports at the top of `apps/api/src/inngest/functions/session-completed.ts`:

```typescript
import { sendStruggleNotification } from '../../services/notifications';
```

- [ ] **Step 2: Capture applyAnalysis return value**

Change lines 538–543 from:

```typescript
          await applyAnalysis(
            db,
            profileId,
            analysis,
            subjectRow?.name ?? null
          );
```

to:

```typescript
          const analysisResult = await applyAnalysis(
            db,
            profileId,
            analysis,
            subjectRow?.name ?? null
          );

          return analysisResult.notifications;
```

- [ ] **Step 3: Add notify-struggle step after analyze-learner-profile**

After the `analyze-learner-profile` step's closing (after the line that pushes to `outcomes`), add a new step:

```typescript
    // Step 3b: FR247.6 — Send struggle push notifications to parent
    const struggleNotifications =
      outcomes[outcomes.length - 1] as StruggleNotification[] | undefined;

    if (struggleNotifications && struggleNotifications.length > 0) {
      await step.run('notify-struggle', async () =>
        runIsolated('notify-struggle', profileId, async () => {
          const db = getStepDatabase();
          for (const notification of struggleNotifications) {
            await sendStruggleNotification(db, profileId, notification);
          }
        })
      );
    }
```

Also add the import for `StruggleNotification`:

```typescript
import type { StruggleNotification } from '../../services/learner-profile';
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm exec nx run api:typecheck`

Expected: No errors.

- [ ] **Step 5: Commit**

```
feat(api): wire struggle notifications to parent push in session-completed [FR247.6]
```

---

## Task 4: Fix Check-In Prompt Threshold (FR248.6)

**Files:**
- Modify: `apps/api/src/services/learner-profile.ts`
- Modify: `apps/api/src/services/learner-profile.test.ts`
- Modify: `apps/api/src/services/session/session-exchange.ts`

- [ ] **Step 1: Write failing test — check-in fires when effectivenessSessionCount is low despite many signals**

Add to the `buildMemoryBlock` describe block in `apps/api/src/services/learner-profile.test.ts`:

```typescript
  it('shows check-in prompt when effectivenessSessionCount < 5 even with many signals', () => {
    const profile: MemoryBlockProfile = {
      learningStyle: null,
      interests: ['space', 'dinosaurs', 'robots', 'trains', 'music', 'art'],
      strengths: [],
      struggles: [],
      communicationNotes: [],
      memoryEnabled: true,
      memoryInjectionEnabled: true,
      effectivenessSessionCount: 2,
    };
    const block = buildMemoryBlock(profile, null, null);
    expect(block).toContain('check-in');
  });

  it('omits check-in prompt when effectivenessSessionCount >= 5', () => {
    const profile: MemoryBlockProfile = {
      learningStyle: null,
      interests: ['space'],
      strengths: [],
      struggles: [],
      communicationNotes: [],
      memoryEnabled: true,
      memoryInjectionEnabled: true,
      effectivenessSessionCount: 5,
    };
    const block = buildMemoryBlock(profile, null, null);
    expect(block).not.toContain('check-in');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest --testPathPattern learner-profile.test --no-coverage -t "check-in prompt when effectivenessSessionCount"`

Expected: FAIL — first test fails because `effectivenessSessionCount` is not on `MemoryBlockProfile` yet, or the old condition uses `signalCount` which is 6 (>= 5) so the check-in would not fire.

- [ ] **Step 3: Add effectivenessSessionCount to MemoryBlockProfile**

In `apps/api/src/services/learner-profile.ts`, update the `MemoryBlockProfile` interface (around line 728):

```typescript
export interface MemoryBlockProfile {
  learningStyle: LearningStyle;
  interests: string[];
  strengths: StrengthEntry[];
  struggles: StruggleEntry[];
  communicationNotes: string[];
  memoryEnabled?: boolean;
  memoryInjectionEnabled?: boolean;
  effectivenessSessionCount?: number;
}
```

- [ ] **Step 4: Fix the check-in threshold in buildMemoryBlock**

In `apps/api/src/services/learner-profile.ts`, replace the check-in condition (around line 833):

From:
```typescript
  if (signalCount > 0 && signalCount < 5) {
    sections.push(
      "- This profile is still sparse. If it fits naturally, ask one gentle check-in question such as 'Did that help?' or 'Want another kind of example?'"
    );
  }
```

To:
```typescript
  const effectivenessCount = profile.effectivenessSessionCount ?? 0;
  if (effectivenessCount < 5 && signalCount > 0) {
    sections.push(
      "- If it fits naturally, ask one gentle check-in question such as 'Did that help?' or 'Want another kind of example?' — no more than once per session."
    );
  }
```

- [ ] **Step 5: Pass effectivenessSessionCount through in session-exchange.ts**

In `apps/api/src/services/session/session-exchange.ts`, update the `buildMemoryBlock` call (around line 512) to include `effectivenessSessionCount` in the profile object:

```typescript
  const learnerMemoryContext = learningProfile
    ? buildMemoryBlock(
        {
          learningStyle:
            (learningProfile.learningStyle as LearningStyle | null) ?? null,
          interests: Array.isArray(learningProfile.interests)
            ? learningProfile.interests
            : [],
          strengths: (Array.isArray(learningProfile.strengths)
            ? learningProfile.strengths
            : []) as StrengthEntry[],
          struggles: (Array.isArray(learningProfile.struggles)
            ? learningProfile.struggles
            : []) as StruggleEntry[],
          communicationNotes: Array.isArray(learningProfile.communicationNotes)
            ? learningProfile.communicationNotes
            : [],
          memoryEnabled: learningProfile.memoryEnabled,
          memoryInjectionEnabled: learningProfile.memoryInjectionEnabled,
          effectivenessSessionCount:
            learningProfile.effectivenessSessionCount ?? 0,
        },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest --testPathPattern learner-profile.test --no-coverage -t "buildMemoryBlock"`

Expected: All `buildMemoryBlock` tests pass, including the 2 new ones.

- [ ] **Step 7: Update existing test that relied on old threshold**

The existing test `'still sparse'` (around line 689) creates a profile with 1 interest and checks for `'still sparse'`. The message text has changed — update the assertion to match the new text. The new text contains `'check-in'` instead of `'still sparse'`:

Change:
```typescript
    expect(block).toContain('still sparse');
```
To:
```typescript
    expect(block).toContain('check-in');
```

- [ ] **Step 8: Run full test suite for affected files**

Run: `cd apps/api && pnpm exec jest --findRelatedTests src/services/learner-profile.ts src/services/session/session-exchange.ts --no-coverage`

Expected: All tests pass.

- [ ] **Step 9: Run typecheck**

Run: `pnpm exec nx run api:typecheck`

Expected: No errors.

- [ ] **Step 10: Commit**

```
fix(api): gate check-in prompt on effectivenessSessionCount per FR248.6
```

---

## Task 5: Final Validation

- [ ] **Step 1: Run full API test suite**

Run: `pnpm exec nx run api:test`

Expected: All tests pass.

- [ ] **Step 2: Run API typecheck + lint**

Run: `pnpm exec nx run api:typecheck && pnpm exec nx run api:lint`

Expected: No errors.

- [ ] **Step 3: Verify notification dispatch end-to-end**

Verify in `session-completed.ts` that the flow is:
1. `analyze-learner-profile` step calls `applyAnalysis()` and returns `notifications`
2. `notify-struggle` step reads those notifications and calls `sendStruggleNotification()` for each
3. `sendStruggleNotification` looks up parent via `familyLinks`, formats age-appropriate copy, sends push

- [ ] **Step 4: Verify check-in prompt fix**

Verify in `buildMemoryBlock` that:
1. `effectivenessSessionCount < 5` gates the check-in instruction (not `totalProfileSignalCount`)
2. A profile with many interests but 0 effectiveness sessions still gets the check-in
3. A profile with 5+ effectiveness sessions does NOT get the check-in regardless of other signal counts

---

## Spec Coverage Verification

| FR | Requirement | Task |
|----|------------|------|
| FR247.6 | Two-tier struggle notifications: `struggle_noticed` at medium, `struggle_flagged` at high | Tasks 1–3 |
| FR247.7 | `struggle_resolved` celebration coaching card to parent | Tasks 1–3 |
| FR248.6 | Check-in questions gate on explanation style data (< 5 data points), stop when sufficient | Task 4 |
| FR250.8 | Granular collection/injection toggles | Already implemented — no work needed |
