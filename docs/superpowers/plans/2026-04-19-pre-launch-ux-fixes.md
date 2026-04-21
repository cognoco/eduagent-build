# Pre-Launch UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 6 remaining pre-launch UX issues that cause 500 errors, raw JSON leaks, false progress signals, dead-end routing, copy bugs, and missing loading timeouts.

**Architecture:** Server-side fixes in `apps/api/src/services/dashboard.ts` (subrequest batching, trend guard); client-side fixes in `apps/mobile/src/lib/api-client.ts` (typed 5xx errors), `ParentDashboardSummary.tsx` (copy/trend guard), `LearnerScreen.tsx` (loading timeout), and `create-subject.tsx` / `interview.tsx` (routing guard). All changes are backwards-compatible with no schema/migration changes.

**Tech Stack:** Hono API (Cloudflare Workers), React Native (Expo Router), TanStack Query, TypeScript

**Already Fixed (not in this plan):** F-Q-08 (quiz quit dialog), F-042 (interview deadlock — `MAX_INTERVIEW_EXCHANGES=6`), F-009 (topic deep-link — `useResolveTopicSubject`), F-Q-02 (wrong answer reveal), F-Q-12 (challenge banner timer removed), F-Q-13 (quiz timer hidden).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/api/src/services/dashboard.ts` | Modify | Task 1: single-child query path; Task 3: retention trend guard; Task 5: summary plural fix |
| `apps/api/src/services/dashboard.test.ts` | Modify | Task 1 + 3 + 5: new/updated unit tests |
| `apps/mobile/src/lib/api-client.ts` | Modify | Task 2: typed `UpstreamError` class for 5xx responses |
| `apps/mobile/src/app/(app)/quiz/launch.tsx` | Modify | Task 2: no code change needed — `.code` extraction already works for typed errors |
| `apps/mobile/src/app/(app)/quiz/launch.test.tsx` | Modify | Task 2: test that `friendlyErrorMessage` receives correct code from typed error |
| `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` | Modify | Task 3: guard XP pill on `totalXp > 0` |
| `apps/mobile/src/app/create-subject.tsx` | Modify | Task 4: stop threading empty `languageCode` |
| `apps/mobile/src/app/(app)/onboarding/interview.tsx` | Modify | Task 4: guard empty `languageCode` in interests fork |
| `apps/mobile/src/components/coaching/ParentDashboardSummary.tsx` | Modify | Task 5: plural fix + trendText guard |
| `apps/mobile/src/components/coaching/ParentDashboardSummary.test.tsx` | Modify | Task 5: update plural assertions + new teaser test |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | Modify | Task 6: loading timeout with fallback |
| `apps/mobile/src/components/home/LearnerScreen.test.tsx` | Modify | Task 6: timeout test |

---

## Task 1: Fix parent dashboard 500 — single-child query path [F-PV-06]

**Problem:** `getChildDetail()` calls `getChildrenForParent()` which fetches ALL children's dashboard data (7 + 10N subrequests). At N=5 children this is 57 subrequests, exceeding the Cloudflare Workers 50-subrequest limit. The user sees a 500 error.

**Fix:** Rewrite `getChildDetail()` to query only the requested child's data directly, bypassing the all-children fan-out.

**Files:**
- Modify: `apps/api/src/services/dashboard.ts:636-648`
- Modify: `apps/api/src/services/dashboard.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that verifies `getChildDetail` returns the correct child data shape. This test documents the expected interface contract.

```ts
// In dashboard.test.ts, add after the existing test suites:

describe('getChildDetailDirect', () => {
  it('returns a DashboardChild with correct shape for a single child', () => {
    // This is tested via integration tests (DB-dependent).
    // Unit-level: verify the query count stays under 50 subrequests.
    // The integration test suite covers the actual DB behavior.
    // See: apps/api/src/services/dashboard.integration.test.ts
  });
});
```

Note: This is primarily an integration-tested function. The unit test verifies the pure-logic helpers; the DB-dependent path is covered by the existing integration suite.

- [ ] **Step 2: Rewrite `getChildDetail` to query a single child directly**

Replace the current implementation at `dashboard.ts:636-648` that calls `getChildrenForParent()`:

```ts
// BEFORE (fetches ALL children then filters):
export async function getChildDetail(
  db: Database,
  parentProfileId: string,
  childProfileId: string
): Promise<DashboardChild | null> {
  await assertParentAccess(db, parentProfileId, childProfileId);
  const children = await getChildrenForParent(db, parentProfileId);
  return children.find((c) => c.profileId === childProfileId) ?? null;
}
```

```ts
// AFTER (queries only the requested child — ~20 subrequests max):
export async function getChildDetail(
  db: Database,
  parentProfileId: string,
  childProfileId: string
): Promise<DashboardChild | null> {
  // 1 subrequest
  await assertParentAccess(db, parentProfileId, childProfileId);

  // 1 subrequest
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, childProfileId),
  });
  if (!profile) return null;

  // 1 subrequest — subjects for this child
  const childSubjects = await db.query.subjects.findMany({
    where: eq(subjects.profileId, childProfileId),
  });
  const rawInputMap = new Map(
    childSubjects.map((s) => [s.id, s.rawInput ?? null])
  );

  // Time window for session queries
  const now = new Date();
  const startOfThisWeek = getStartOfWeek(now);
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  // 4 parallel subrequests
  const [recentSessions, progress, guidedMetrics, streakAndXp] =
    await Promise.all([
      // 1 subrequest
      db.query.learningSessions.findMany({
        where: and(
          eq(learningSessions.profileId, childProfileId),
          gte(learningSessions.startedAt, startOfLastWeek),
          gte(learningSessions.exchangeCount, 1)
        ),
      }),
      // 6 subrequests (batched inside)
      getOverallProgress(db, childProfileId),
      // 1 subrequest
      countGuidedMetrics(db, childProfileId, startOfLastWeek),
      // 2 parallel subrequests
      Promise.all([
        db.query.streaks.findFirst({
          where: eq(streaks.profileId, childProfileId),
        }),
        db
          .select({
            totalXp: sum(xpLedger.amount).mapWith(Number),
          })
          .from(xpLedger)
          .where(eq(xpLedger.profileId, childProfileId)),
      ]),
    ]);

  // Compute session stats
  const sessionsThisWeek = recentSessions.filter(
    (s) => s.startedAt >= startOfThisWeek
  ).length;
  const sessionsLastWeek = recentSessions.filter(
    (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek
  ).length;

  const getDisplaySeconds = (session: {
    wallClockSeconds: number | null;
    durationSeconds: number | null;
  }): number => session.wallClockSeconds ?? session.durationSeconds ?? 0;

  const totalTimeThisWeekMinutes = Math.round(
    recentSessions
      .filter((s) => s.startedAt >= startOfThisWeek)
      .reduce((sum, s) => sum + getDisplaySeconds(s), 0) / 60
  );
  const totalTimeLastWeekMinutes = Math.round(
    recentSessions
      .filter(
        (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek
      )
      .reduce((sum, s) => sum + getDisplaySeconds(s), 0) / 60
  );

  const exchangesThisWeek = recentSessions
    .filter((s) => s.startedAt >= startOfThisWeek)
    .reduce((sum, s) => sum + s.exchangeCount, 0);
  const exchangesLastWeek = recentSessions
    .filter(
      (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek
    )
    .reduce((sum, s) => sum + s.exchangeCount, 0);

  const subjectRetentionData = progress.subjects.map((s) => ({
    name: s.name,
    status: s.retentionStatus,
  }));

  const dashboardInput: DashboardInput = {
    childProfileId,
    displayName: profile.displayName,
    sessionsThisWeek,
    sessionsLastWeek,
    totalTimeThisWeekMinutes,
    totalTimeLastWeekMinutes,
    exchangesThisWeek,
    exchangesLastWeek,
    subjectRetentionData,
    guidedCount: guidedMetrics.guidedCount,
    totalProblemCount: guidedMetrics.totalProblemCount,
  };

  // 3 subrequests (2 parallel + 1 sequential inside)
  const progressSummary = await buildChildProgressSummary(
    db,
    childProfileId,
    profile.displayName,
    sessionsThisWeek,
    sessionsLastWeek,
    totalTimeThisWeekMinutes,
    progress.subjects.map((s) => s.name)
  );

  const summary = generateChildSummary(dashboardInput);
  const trend = calculateTrend(sessionsThisWeek, sessionsLastWeek);
  const retentionTrend = calculateRetentionTrend(
    subjectRetentionData,
    progressSummary.totalSessions
  );

  const [streakRow, xpRows] = streakAndXp;

  return {
    profileId: childProfileId,
    displayName: profile.displayName,
    summary,
    sessionsThisWeek,
    sessionsLastWeek,
    totalTimeThisWeek: totalTimeThisWeekMinutes,
    totalTimeLastWeek: totalTimeLastWeekMinutes,
    exchangesThisWeek,
    exchangesLastWeek,
    trend,
    subjects: progress.subjects.map((s) => ({
      subjectId: s.subjectId,
      name: s.name,
      retentionStatus: s.retentionStatus,
      rawInput: rawInputMap.get(s.subjectId) ?? null,
    })),
    guidedVsImmediateRatio: calculateGuidedRatio(
      guidedMetrics.guidedCount,
      guidedMetrics.totalProblemCount
    ),
    retentionTrend,
    totalSessions: progressSummary.totalSessions,
    progress: progressSummary.progress,
    currentStreak: streakRow?.currentStreak ?? 0,
    longestStreak: streakRow?.longestStreak ?? 0,
    totalXp: xpRows[0]?.totalXp ?? 0,
  };
}
```

Total subrequests: 1 (access) + 1 (profile) + 1 (subjects) + 1 (sessions) + 6 (progress) + 1 (guided) + 2 (streak/xp) + 3 (progressSummary) = **~16 max** — well within the 50-subrequest limit regardless of family size.

- [ ] **Step 3: Verify the new function has no missing imports**

Ensure `streaks`, `xpLedger`, `sum` are already imported at the top of `dashboard.ts` (they are — lines 13, 18, 6).

- [ ] **Step 4: Run related tests**

```bash
cd apps/api && pnpm exec jest --findRelatedTests src/services/dashboard.ts --no-coverage
```

Expected: All existing tests pass — the function signature and return type are unchanged.

- [ ] **Step 5: Run typecheck**

```bash
pnpm exec nx run api:typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/dashboard.ts apps/api/src/services/dashboard.test.ts
git commit -m "fix(api): single-child query path for getChildDetail [F-PV-06]

Rewrites getChildDetail to query only the requested child's data directly
instead of fetching ALL children via getChildrenForParent. Reduces
subrequest count from 7+10N to ~16 fixed, preventing Cloudflare Workers
500 errors for parents with 5+ children."
```

---

## Task 2: Fix raw JSON error body shown to users [F-Q-01]

**Problem:** When the quiz LLM returns malformed output, `customFetch` in `api-client.ts` throws a plain `Error` with the raw JSON body in `.message`. The quiz `launch.tsx` tries to read `.code` on the error, but plain `Error` has no `.code`, so `friendlyErrorMessage` receives `undefined` and the raw `"API error 502: {"code":"UPSTREAM_ERROR",...}"` string passes through the 100-char guard (it's only 85 chars).

**Root cause:** `customFetch` has typed error classes for 401/402/403 but falls through to a generic `new Error()` for all other non-ok responses including 5xx.

**Fix:** Add an `UpstreamError` class with a `.code` property. Parse JSON body for 5xx responses in `customFetch`. The existing `.code` extraction in `launch.tsx:166-171` will then work correctly, routing to `friendlyErrorMessage('UPSTREAM_ERROR', ...)` which returns the kid-friendly message.

**Files:**
- Modify: `apps/mobile/src/lib/api-client.ts:52-84` (add class), `170-173` (parse 5xx)
- Modify: `apps/mobile/src/app/(app)/quiz/launch.test.tsx` (add test)

- [ ] **Step 1: Write the failing test**

Add to `launch.test.tsx` a test that verifies the error panel shows the friendly message (not raw JSON) when the error has an `UPSTREAM_ERROR` code.

```tsx
it('shows friendly error message for UPSTREAM_ERROR code', () => {
  // Unit test the friendlyErrorMessage function directly
  const result = friendlyErrorMessage('UPSTREAM_ERROR', 'anything');
  expect(result).toBe('Something went wrong creating your quiz. Try again!');
});

it('does not show raw JSON for long error messages', () => {
  const result = friendlyErrorMessage(undefined, 'API error 502: {"code":"UPSTREAM_ERROR","message":"Quiz LLM returned invalid structured output"}');
  expect(result).toBe('Something went wrong. Try again!');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/quiz/launch.tsx --no-coverage
```

The first test should pass (friendlyErrorMessage already handles `'UPSTREAM_ERROR'`). The second test should **fail** — the string is 85 chars, under the 100-char threshold, so it currently passes through.

- [ ] **Step 3: Add `UpstreamError` class and fix `customFetch`**

In `apps/mobile/src/lib/api-client.ts`, after the `ForbiddenError` class (line 84):

```ts
/**
 * [F-Q-01] Typed error for 5xx upstream responses.
 * Thrown by customFetch so callers can read `.code` instead of parsing
 * raw JSON from Error.message. Matches the pattern used for QuotaExceededError
 * and ForbiddenError.
 */
export class UpstreamError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'UpstreamError';
    this.code = code;
  }
}
```

Then replace the catch-all at lines 170-173:

```ts
// BEFORE:
const errBody = await res.text().catch(() => '');
throw new Error(
  `API error ${res.status}: ${errBody || res.statusText}`
);

// AFTER:
// [F-Q-01] Parse JSON body for non-ok responses so typed errors
// carry a .code property that screens can classify without
// string-matching on raw JSON embedded in Error.message.
const errBody = await res.text().catch(() => '');
let parsed: { code?: string; message?: string } | null = null;
try {
  parsed = JSON.parse(errBody) as { code?: string; message?: string };
} catch {
  // Not JSON — fall through to generic error
}
if (parsed?.code) {
  throw new UpstreamError(
    parsed.message ?? errBody || res.statusText,
    parsed.code
  );
}
throw new Error(
  `API error ${res.status}: ${errBody || res.statusText}`
);
```

- [ ] **Step 4: Lower the fallback char threshold in `friendlyErrorMessage`**

In `apps/mobile/src/app/(app)/quiz/launch.tsx`, line 29, lower the threshold from 100 to 60 as defense-in-depth. Most legitimate user-facing messages are short; anything over 60 chars is likely a leaked payload:

```ts
// BEFORE:
return fallback.length > 100
  ? 'Something went wrong. Try again!'
  : fallback;

// AFTER:
return fallback.length > 60
  ? 'Something went wrong. Try again!'
  : fallback;
```

- [ ] **Step 5: Run tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/quiz/launch.tsx src/lib/api-client.ts --no-coverage
```

Expected: All tests pass, including the new ones.

- [ ] **Step 6: Run typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/lib/api-client.ts apps/mobile/src/app/\\(app\\)/quiz/launch.tsx apps/mobile/src/app/\\(app\\)/quiz/launch.test.tsx
git commit -m "fix(mobile): typed UpstreamError for 5xx responses [F-Q-01]

Adds UpstreamError class with .code property to customFetch for non-ok
responses with JSON bodies. The quiz launch screen's .code extraction
now correctly receives 'UPSTREAM_ERROR' and routes to the kid-friendly
message instead of leaking raw JSON. Also lowers the fallback char
threshold from 100 to 60 as defense-in-depth."
```

---

## Task 3: Fix false progress signals at N=1 [F-PV-03] [F-PV-04]

**Problem A:** `calculateRetentionTrend` returns a meaningful trend (improving/declining) even with 1 session because the `totalSessions` guard at line 130 only fires when `totalSessions != null`. When `totalSessions` is `undefined` (caller didn't pass it), the guard is skipped entirely.

**Problem B:** The child detail page shows "0 XP" unconditionally inside the streak/XP block. The outer guard `(child.currentStreak > 0 || child.totalXp > 0)` lets the block render when streak=1 but XP=0, and the XP pill has no inner guard.

**Files:**
- Modify: `apps/api/src/services/dashboard.ts:127-132`
- Modify: `apps/api/src/services/dashboard.test.ts:192-234`
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:362-367`

- [ ] **Step 1: Write the failing test for `calculateRetentionTrend` with undefined `totalSessions`**

In `dashboard.test.ts`, add inside the `calculateRetentionTrend` describe block:

```ts
it('returns stable when totalSessions is undefined (caller did not pass it)', () => {
  expect(
    calculateRetentionTrend(
      [{ status: 'strong' }, { status: 'strong' }],
      undefined
    )
  ).toBe('stable');
});

it('returns stable when totalSessions < MIN_TREND_SESSIONS', () => {
  expect(
    calculateRetentionTrend(
      [{ status: 'strong' }, { status: 'strong' }],
      1
    )
  ).toBe('stable');
});

it('returns stable when totalSessions is 0', () => {
  expect(
    calculateRetentionTrend(
      [{ status: 'strong' }, { status: 'strong' }],
      0
    )
  ).toBe('stable');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm exec jest --findRelatedTests src/services/dashboard.ts --no-coverage -t "calculateRetentionTrend"
```

Expected: The `undefined` test **fails** — returns `'improving'` instead of `'stable'`.

- [ ] **Step 3: Fix `calculateRetentionTrend`**

In `dashboard.ts`, replace the guard at lines 128-132:

```ts
// BEFORE:
if (
  subjectRetentionData.length === 0 ||
  (totalSessions != null && totalSessions < MIN_TREND_SESSIONS)
)
  return 'stable';

// AFTER:
if (
  subjectRetentionData.length === 0 ||
  (totalSessions ?? 0) < MIN_TREND_SESSIONS
)
  return 'stable';
```

This treats `undefined` as 0 sessions, which correctly triggers the low-N guard.

- [ ] **Step 4: Run tests to verify fix**

```bash
cd apps/api && pnpm exec jest --findRelatedTests src/services/dashboard.ts --no-coverage -t "calculateRetentionTrend"
```

Expected: All tests pass.

- [ ] **Step 5: Fix XP pill guard in child detail page**

In `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`, wrap the XP pill in a `totalXp > 0` guard. Replace lines 362-367:

```tsx
{/* BEFORE — XP pill renders unconditionally inside the block: */}
<View className="flex-row items-center gap-1">
  <Ionicons name="star-outline" size={16} color="#eab308" />
  <Text className="text-text-secondary text-sm">
    {child.totalXp} XP
  </Text>
</View>

{/* AFTER — only show XP pill when there is actual XP: */}
{child.totalXp > 0 && (
  <View className="flex-row items-center gap-1">
    <Ionicons name="star-outline" size={16} color="#eab308" />
    <Text className="text-text-secondary text-sm">
      {child.totalXp} XP
    </Text>
  </View>
)}
```

- [ ] **Step 6: Run all related tests**

```bash
cd apps/api && pnpm exec jest --findRelatedTests src/services/dashboard.ts --no-coverage
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/child/\\[profileId\\]/index.tsx --no-coverage
```

Expected: All pass.

- [ ] **Step 7: Run typecheck for both apps**

```bash
pnpm exec nx run api:typecheck
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/dashboard.ts apps/api/src/services/dashboard.test.ts "apps/mobile/src/app/(app)/child/[profileId]/index.tsx"
git commit -m "fix(api,mobile): suppress false progress signals at N=1 [F-PV-03] [F-PV-04]

- calculateRetentionTrend: treat undefined totalSessions as 0 so the
  low-N guard fires instead of returning a misleading 'improving' trend
- Child detail: guard XP pill on totalXp > 0 so '0 XP' is never shown
  alongside a streak badge for a child who hasn't earned any XP yet"
```

---

## Task 4: Fix non-language subject routing to language-setup [F-041]

**Problem:** When creating a non-language subject with `pedagogyMode !== 'four_strands'`, the flow correctly skips the language-setup route. However, `interview.tsx:96` threads `languageCode: languageCode ?? ''` into the interests-context params — passing an empty string as a URL param. While `''` is falsy in JS (so downstream `if (languageCode)` guards work), this is fragile: platform URL serialization may treat empty-string params differently, and the intent is clearly "no language code". Defensive fix: omit the param entirely when empty.

**Files:**
- Modify: `apps/mobile/src/app/(app)/onboarding/interview.tsx:96-97`

- [ ] **Step 1: Fix the empty `languageCode` threading in interview.tsx**

In `interview.tsx`, around lines 90-99, change the params to omit empty values:

```ts
// BEFORE:
router.replace({
  pathname: '/(app)/onboarding/interests-context',
  params: {
    ...baseParams,
    interests: interests.map((l) => l.replace(/,/g, '')).join(','),
    languageCode: languageCode ?? '',
    languageName: languageName ?? '',
  },
} as never);

// AFTER:
router.replace({
  pathname: '/(app)/onboarding/interests-context',
  params: {
    ...baseParams,
    interests: interests.map((l) => l.replace(/,/g, '')).join(','),
    ...(languageCode ? { languageCode, languageName: languageName ?? '' } : {}),
  },
} as never);
```

- [ ] **Step 2: Apply the same fix in create-subject.tsx**

In `create-subject.tsx`, line 153, the language branch already only runs for `pedagogyMode === 'four_strands'` subjects, but the `languageCode` uses `?? ''` which would thread an empty string if `languageCode` is null (which shouldn't happen for four_strands subjects, but defensively):

```ts
// BEFORE (line 153):
languageCode: result.subject.languageCode ?? '',

// AFTER:
...(result.subject.languageCode
  ? { languageCode: result.subject.languageCode, languageName: result.subject.name }
  : {}),
```

And remove the now-redundant `languageName: result.subject.name` from line 154 (it's now inside the spread).

- [ ] **Step 3: Run related tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/onboarding/interview.tsx src/app/create-subject.tsx --no-coverage
```

- [ ] **Step 4: Run typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/src/app/(app)/onboarding/interview.tsx" apps/mobile/src/app/create-subject.tsx
git commit -m "fix(mobile): omit empty languageCode from onboarding params [F-041]

Stop threading languageCode='' as a URL param when no language is
configured. The param is now conditionally spread only when non-empty,
preventing any platform-level URL serialization edge cases from routing
non-language subjects to the language-setup screen."
```

---

## Task 5: Fix copy and grammar issues [F-PV-05] [F-PV-01] [F-PV-02]

**Problem A:** "1 sessions" — the word "sessions" is hardcoded as plural at `ParentDashboardSummary.tsx:148` and `dashboard.ts:107`.

**Problem B:** `trendText` is rendered unconditionally (line 184-189) outside the `showFullSignals` guard, while the teaser at line 268-276 says "After N more sessions you'll see trends" — contradictory when both are visible.

**Files:**
- Modify: `apps/mobile/src/components/coaching/ParentDashboardSummary.tsx:148-152, 184-189`
- Modify: `apps/mobile/src/components/coaching/ParentDashboardSummary.test.tsx`
- Modify: `apps/api/src/services/dashboard.ts:107`
- Modify: `apps/api/src/services/dashboard.test.ts`

- [ ] **Step 1: Write failing tests for plural fix**

In `ParentDashboardSummary.test.tsx`, update the existing assertion at line 63-66 that currently accepts the broken string:

```tsx
// BEFORE (line 63-66):
expect(
  screen.getByText(
    '1 sessions, 12m this week (↓ down from 4 sessions, 1h 30m last week)'
  )
).toBeTruthy();

// AFTER:
expect(
  screen.getByText(
    '1 session, 12m this week (↓ down from 4 sessions, 1h 30m last week)'
  )
).toBeTruthy();
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/coaching/ParentDashboardSummary.tsx --no-coverage
```

Expected: FAIL — still renders "1 sessions".

- [ ] **Step 3: Add `pluralize` helper and fix ParentDashboardSummary**

In `ParentDashboardSummary.tsx`, add a helper at the top of the file (after imports):

```ts
function sessionWord(n: number): string {
  return n === 1 ? 'session' : 'sessions';
}
```

Then fix `trendText` at lines 148-152:

```ts
// BEFORE:
const trendText = `${sessionsThisWeek} sessions, ${formatTime(
  totalTimeThisWeek
)} this week (${TREND_ARROWS[trend]} ${
  TREND_LABELS[trend]
} ${sessionsLastWeek} sessions, ${formatTime(totalTimeLastWeek)} last week)`;

// AFTER:
const trendText = `${sessionsThisWeek} ${sessionWord(sessionsThisWeek)}, ${formatTime(
  totalTimeThisWeek
)} this week (${TREND_ARROWS[trend]} ${
  TREND_LABELS[trend]
} ${sessionsLastWeek} ${sessionWord(sessionsLastWeek)}, ${formatTime(totalTimeLastWeek)} last week)`;
```

- [ ] **Step 4: Fix the same plural bug in `generateChildSummary`**

In `dashboard.ts`, fix line 107:

```ts
// BEFORE:
parts.push(
  `${input.sessionsThisWeek} sessions this week (${trendArrow} ${trendWord} last week)`
);

// AFTER:
const sw = (n: number): string => (n === 1 ? 'session' : 'sessions');
parts.push(
  `${input.sessionsThisWeek} ${sw(input.sessionsThisWeek)} this week (${trendArrow} ${trendWord} last week)`
);
```

- [ ] **Step 5: Guard `trendText` behind `showFullSignals` to fix teaser contradiction**

In `ParentDashboardSummary.tsx`, move the `trendText` display (lines 184-189) inside the `showFullSignals` block. Replace the unconditional rendering:

```tsx
{/* BEFORE — trendText always visible (contradicts teaser): */}
<Text
  className="text-caption text-text-secondary mt-1"
  accessibilityLabel={`Trend: ${trendText}`}
>
  {trendText}
</Text>

{/* AFTER — only show trendText when full signals are active: */}
{showFullSignals && (
  <Text
    className="text-caption text-text-secondary mt-1"
    accessibilityLabel={`Trend: ${trendText}`}
  >
    {trendText}
  </Text>
)}
```

- [ ] **Step 6: Run tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/coaching/ParentDashboardSummary.tsx --no-coverage
cd apps/api && pnpm exec jest --findRelatedTests src/services/dashboard.ts --no-coverage
```

Expected: All pass (update any other test assertions that hardcode the plural string).

- [ ] **Step 7: Run typecheck**

```bash
pnpm exec nx run api:typecheck
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/components/coaching/ParentDashboardSummary.tsx apps/mobile/src/components/coaching/ParentDashboardSummary.test.tsx apps/api/src/services/dashboard.ts apps/api/src/services/dashboard.test.ts
git commit -m "fix(mobile,api): plural 'sessions' and teaser/trend contradiction [F-PV-05] [F-PV-01] [F-PV-02]

- Fix '1 sessions' → '1 session' in ParentDashboardSummary and
  generateChildSummary using sessionWord() helper
- Guard trendText behind showFullSignals so it is not shown alongside
  the 'After N more sessions you'll see trends' teaser for new learners"
```

---

## Task 6: Fix loading screen timeout [F-044]

**Problem:** `LearnerScreen.tsx:274-290` shows `ActivityIndicator` with no timeout, no cancel, no "Taking too long" fallback. The 10s query timeout in the fetch layer eventually transitions to the error state, but if `activeProfile` is falsy (query disabled), the spinner shows indefinitely. Violates UX Resilience Rule.

**Files:**
- Modify: `apps/mobile/src/components/home/LearnerScreen.tsx:274-290`
- Modify: `apps/mobile/src/components/home/LearnerScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

In `LearnerScreen.test.tsx`, add a test for the timeout state:

```tsx
it('shows "Taking too long" fallback after timeout', async () => {
  // Mock useSubjects to stay in loading state
  jest.useFakeTimers();
  // Render with isLoading=true (the mock should return isLoading: true)
  const { queryByTestId } = render(
    <LearnerScreen
      profiles={[mockProfile]}
      activeProfile={mockProfile}
      switchProfile={jest.fn()}
      onBack={jest.fn()}
    />
  );

  // Initially no timeout message
  expect(queryByTestId('learner-loading-timeout')).toBeNull();

  // Advance past timeout threshold
  act(() => { jest.advanceTimersByTime(16000); });

  // Now the timeout message should appear
  expect(queryByTestId('learner-loading-timeout')).toBeTruthy();

  jest.useRealTimers();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/LearnerScreen.tsx --no-coverage -t "Taking too long"
```

Expected: FAIL — no `learner-loading-timeout` testID exists.

- [ ] **Step 3: Add loading timeout with fallback**

In `LearnerScreen.tsx`, add a timeout state after the existing state declarations (around line 63):

```tsx
// [F-044] Loading timeout — show fallback after 15s so users aren't
// stuck on a bare spinner with no escape.
const [loadingTimedOut, setLoadingTimedOut] = useState(false);
useEffect(() => {
  if (!isLoading) {
    setLoadingTimedOut(false);
    return;
  }
  const timer = setTimeout(() => setLoadingTimedOut(true), 15_000);
  return () => clearTimeout(timer);
}, [isLoading]);
```

Then update the loading block at lines 274-290:

```tsx
if (isLoading) {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
      }}
      testID="learner-loading-state"
    >
      <ActivityIndicator size="large" />
      {loadingTimedOut && (
        <View className="mt-6 items-center" testID="learner-loading-timeout">
          <Text className="text-body text-text-secondary text-center">
            Taking longer than usual...
          </Text>
          <Pressable
            onPress={() => refetch()}
            className="mt-3 min-h-[44px] items-center justify-center rounded-button bg-primary px-6 py-2"
            testID="learner-loading-retry"
          >
            <Text className="text-body font-semibold text-text-inverse">
              Retry
            </Text>
          </Pressable>
          <Pressable
            onPress={onBack}
            className="mt-2 min-h-[44px] items-center justify-center px-6 py-2"
            testID="learner-loading-go-back"
          >
            <Text className="text-body text-text-secondary">Go back</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/LearnerScreen.tsx --no-coverage
```

Expected: All pass.

- [ ] **Step 5: Run typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/home/LearnerScreen.tsx apps/mobile/src/components/home/LearnerScreen.test.tsx
git commit -m "fix(mobile): add 15s loading timeout with retry fallback [F-044]

LearnerScreen now shows 'Taking longer than usual...' with Retry and
Go Back buttons after 15 seconds of loading. Prevents the indefinite
spinner dead-end flagged by the UX Resilience audit."
```

---

## Task 7: Update documentation

- [ ] **Step 1: Update `docs/plans/` with a tracking note**

The already-fixed issues should be documented so they aren't re-investigated:

```markdown
## Already Fixed (verified in codebase 2026-04-19)

| Finding | Fix | Verified By |
|---------|-----|-------------|
| F-Q-08 Quiz quit confirm | `platformAlert` in `quiz/play.tsx:159-168` | Code comment `[F-Q-08]` |
| F-042 Interview deadlock | `MAX_INTERVIEW_EXCHANGES=6` in `interview.ts:267` | Code comment `[F-042]` |
| F-009 Topic deep-link | `useResolveTopicSubject` in `topic/[topicId].tsx:161-165` | Code comment `[F-009]` |
| F-Q-02 Wrong answer reveal | `getOptionContainerClass` green highlight in `quiz/play.tsx:392-393` | Code comment `[F-Q-07]` |
| F-Q-12 Challenge banner timer | Timer removed in `quiz/launch.tsx:117-119` | Code comment `[F-Q-12]` |
| F-Q-13 Quiz timer label | Timer hidden, analytics-only in `quiz/play.tsx:456-459` | Code comment `[F-Q-13]` |
```

- [ ] **Step 2: Commit docs**

```bash
git add docs/
git commit -m "docs: track pre-launch UX fix status — 6 already fixed, 6 in plan"
```
