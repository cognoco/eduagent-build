# Universal Post-Session Reflection with XP Incentive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every session type (learn, freeform, homework) routes through the reflection step, with a 1.5x XP multiplier for students who write a reflection.

**Architecture:** New `reflectionMultiplierApplied` column on `xp_ledger`. Server-side `applyReflectionMultiplier()` runs on summary submit. Filing prompt's accept path now continues to session summary instead of routing directly to shelf. Skip-nudge thresholds move from server-computed booleans to raw count exposed in the skip response, with client-side threshold checks. Mode-adaptive sentence starters use i18n keys for EN/CS.

**Tech Stack:** Drizzle ORM (migration), Hono API routes, React Native (Expo Router), `@eduagent/schemas` (shared types), `@eduagent/database` (schema).

**Spec:** `docs/specs/2026-05-02-universal-post-session-reflection.md`

---

## File Map

### Database / Schema

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/database/src/schema/progress.ts` | Modify | Add `reflectionMultiplierApplied` boolean column to `xpLedger` |
| `packages/database/drizzle/` | Generate | Migration SQL for new column |

### API — Services

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/services/xp.ts` | Modify | Add `applyReflectionMultiplier()`, add `REFLECTION_XP_MULTIPLIER` constant, add `getSessionXpEntry()` |
| `apps/api/src/services/settings.ts` | Modify | Delete `shouldPromptCasualSwitch()`, `shouldWarnSummarySkip()`, `getSkipWarningFlags()`, `CASUAL_SWITCH_PROMPT_THRESHOLD`. Keep `incrementSummarySkips`, `resetSummarySkips`, `getConsecutiveSummarySkips`, `SKIP_WARNING_THRESHOLD` |
| `apps/api/src/services/session/session-summary.ts` | Modify | Wire XP multiplier into `submitSummary()`, wire note creation (behind feature check), extend `getSessionSummary()` return with XP fields and skip count |

### API — Routes

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/routes/sessions.ts` | Modify | Update GET summary response to include XP + skip count fields. Update skip endpoint to return `consecutiveSummarySkips` instead of boolean flags. Remove `getSkipWarningFlags` import. |

### Shared Schemas

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/schemas/src/sessions.ts` | Modify | Extend `sessionSummarySchema` with `baseXp`, `reflectionBonusXp`. Add `consecutiveSummarySkips` to skip response. Add `sessionTypeSchema` with `'learning' | 'freeform' | 'homework'`. |

### Mobile — Navigation & Filing

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/mobile/src/components/session/SessionFooter.tsx` | Modify | Filing accept now stores result in ref + calls `navigateToSessionSummary()` instead of `router.replace` to shelf. Pass `filedSubjectId`/`filedBookId` through navigation. |
| `apps/mobile/src/components/session/use-session-actions.ts` | Modify | `navigateToSessionSummary()` accepts optional `filedSubjectId`/`filedBookId` params. `sessionType` param extended to include `'freeform'`. |

### Mobile — Session Summary Screen

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/mobile/src/app/session-summary/[sessionId].tsx` | Modify | Mode-adaptive sentence starters, XP incentive banner, skip-nudge thresholds (client-side), "Done" button with 2-step shelf navigation, adapt placeholders/headers per session type. Delete casual-switch modal. |
| `apps/mobile/src/lib/reflection-starters.ts` | Create | Mode-keyed sentence starters with i18n support (EN + CS) |

### Mobile — Hooks

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/mobile/src/hooks/use-sessions.ts` | Modify | Update `SubmitSummaryResult` and `SkipSummaryResult` types. Add `baseXp`/`reflectionBonusXp` to summary result. Replace boolean skip flags with `consecutiveSummarySkips`. |

### Tests

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/services/xp.test.ts` | Modify | Tests for `applyReflectionMultiplier()` |
| `apps/api/src/services/session-summary.integration.test.ts` | Modify | Integration tests for XP multiplier on submit, no multiplier on skip, note creation |
| `apps/mobile/src/app/session-summary/[sessionId].test.tsx` | Modify (or create) | Mobile tests for XP banner, mode-adaptive starters, skip nudges, navigation |
| `apps/mobile/src/lib/reflection-starters.test.ts` | Create | Unit tests for starter selection by mode and language |

---

## Task 1: Database Migration — `reflectionMultiplierApplied` Column

**Files:**
- Modify: `packages/database/src/schema/progress.ts:44-73`
- Generate: `packages/database/drizzle/` (migration SQL)

- [ ] **Step 1: Add the column to the Drizzle schema**

In `packages/database/src/schema/progress.ts`, add a `reflectionMultiplierApplied` boolean column to the `xpLedger` table:

```typescript
// Inside the xpLedger pgTable definition, after the `createdAt` column:
reflectionMultiplierApplied: boolean('reflection_multiplier_applied')
  .notNull()
  .default(false),
```

The full columns block becomes:

```typescript
export const xpLedger = pgTable(
  'xp_ledger',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => curriculumTopics.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    status: xpStatusEnum('status').notNull().default('pending'),
    earnedAt: timestamp('earned_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    reflectionMultiplierApplied: boolean('reflection_multiplier_applied')
      .notNull()
      .default(false),
  },
  (table) => [
    index('xp_ledger_profile_id_idx').on(table.profileId),
    index('xp_ledger_topic_id_idx').on(table.topicId),
  ]
);
```

You'll need to add `boolean` to the import from `drizzle-orm/pg-core` at the top of the file.

- [ ] **Step 2: Re-export from database package barrel if needed**

Check that `xpLedger` is already exported from `packages/database/src/index.ts`. It should be — no change expected.

- [ ] **Step 3: Generate migration**

Run:
```bash
pnpm run db:generate
```

Expected: A new SQL migration file in `packages/database/drizzle/` containing:
```sql
ALTER TABLE "xp_ledger" ADD COLUMN "reflection_multiplier_applied" boolean NOT NULL DEFAULT false;
```

- [ ] **Step 4: Push to dev DB**

Run:
```bash
pnpm run db:push:dev
```

Expected: Column added to dev database without error.

- [ ] **Step 5: Verify the schema compiles**

Run:
```bash
pnpm exec nx run api:typecheck
```

Expected: No type errors.

- [ ] **Step 6: Commit**

```
feat(database): add reflectionMultiplierApplied column to xp_ledger
```

---

## Task 2: `applyReflectionMultiplier()` in XP Service (TDD)

**Files:**
- Modify: `apps/api/src/services/xp.ts`
- Test: `apps/api/src/services/xp.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/services/xp.test.ts`:

```typescript
import { applyReflectionMultiplier, REFLECTION_XP_MULTIPLIER } from './xp';

describe('REFLECTION_XP_MULTIPLIER', () => {
  it('equals 1.5', () => {
    expect(REFLECTION_XP_MULTIPLIER).toBe(1.5);
  });
});

describe('applyReflectionMultiplier', () => {
  it('multiplies base XP by 1.5 and rounds', async () => {
    // Seed an xp_ledger row with amount=100, reflectionMultiplierApplied=false
    // for a known profileId + topicId
    const result = await applyReflectionMultiplier(db, profileId, sessionId);
    expect(result).toEqual({ applied: true, newAmount: 150 });

    // Verify DB state
    const row = await db.query.xpLedger.findFirst({
      where: and(eq(xpLedger.profileId, profileId), eq(xpLedger.topicId, topicId)),
    });
    expect(row?.amount).toBe(150);
    expect(row?.reflectionMultiplierApplied).toBe(true);
  });

  it('rounds odd amounts correctly (e.g., 133 → 200)', async () => {
    // Seed xp_ledger with amount=133
    const result = await applyReflectionMultiplier(db, profileId, sessionId);
    expect(result).toEqual({ applied: true, newAmount: 200 }); // Math.round(133 * 1.5) = 200
  });

  it('is idempotent — no-ops when reflectionMultiplierApplied is already true', async () => {
    // Seed xp_ledger with amount=150, reflectionMultiplierApplied=true
    const result = await applyReflectionMultiplier(db, profileId, sessionId);
    expect(result).toEqual({ applied: false, newAmount: 150 });
  });

  it('returns { applied: false, newAmount: 0 } when session has no topicId', async () => {
    // Create a session with topicId = null
    const result = await applyReflectionMultiplier(db, profileId, noTopicSessionId);
    expect(result).toEqual({ applied: false, newAmount: 0 });
  });

  it('returns { applied: false, newAmount: 0 } when no xp_ledger row exists', async () => {
    // Session has topicId but no xp_ledger row (e.g. no passed assessment)
    const result = await applyReflectionMultiplier(db, profileId, noXpSessionId);
    expect(result).toEqual({ applied: false, newAmount: 0 });
  });
});
```

Note: Adapt test setup to whatever test harness pattern exists in the file (seeded DB, test profiles, etc.). The key assertions are what matter.

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd apps/api && pnpm exec jest --findRelatedTests src/services/xp.ts --no-coverage
```

Expected: FAIL — `applyReflectionMultiplier` and `REFLECTION_XP_MULTIPLIER` are not exported.

- [ ] **Step 3: Implement `applyReflectionMultiplier` and `getSessionXpEntry`**

In `apps/api/src/services/xp.ts`, add at the top with other imports:

```typescript
import {
  assessments,
  xpLedger,
  learningSessions,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
```

Then add the constant and functions:

```typescript
export const REFLECTION_XP_MULTIPLIER = 1.5;

export async function applyReflectionMultiplier(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<{ applied: boolean; newAmount: number }> {
  const session = await db.query.learningSessions.findFirst({
    where: and(
      eq(learningSessions.id, sessionId),
      eq(learningSessions.profileId, profileId)
    ),
  });
  if (!session?.topicId) return { applied: false, newAmount: 0 };

  const repo = createScopedRepository(db, profileId);
  const entry = await repo.xpLedger.findFirst(
    eq(xpLedger.topicId, session.topicId)
  );
  if (!entry) return { applied: false, newAmount: 0 };
  if (entry.reflectionMultiplierApplied) {
    return { applied: false, newAmount: entry.amount };
  }

  const newAmount = Math.round(entry.amount * REFLECTION_XP_MULTIPLIER);

  await db
    .update(xpLedger)
    .set({ amount: newAmount, reflectionMultiplierApplied: true })
    .where(
      and(eq(xpLedger.id, entry.id), eq(xpLedger.profileId, profileId))
    );

  return { applied: true, newAmount };
}

export async function getSessionXpEntry(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<{ baseXp: number; reflectionBonusXp: number } | null> {
  const session = await db.query.learningSessions.findFirst({
    where: and(
      eq(learningSessions.id, sessionId),
      eq(learningSessions.profileId, profileId)
    ),
  });
  if (!session?.topicId) return null;

  const repo = createScopedRepository(db, profileId);
  const entry = await repo.xpLedger.findFirst(
    eq(xpLedger.topicId, session.topicId)
  );
  if (!entry) return null;

  if (entry.reflectionMultiplierApplied) {
    const originalBase = Math.round(entry.amount / REFLECTION_XP_MULTIPLIER);
    return {
      baseXp: originalBase,
      reflectionBonusXp: entry.amount - originalBase,
    };
  }

  return {
    baseXp: entry.amount,
    reflectionBonusXp: Math.round(entry.amount * REFLECTION_XP_MULTIPLIER) - entry.amount,
  };
}
```

Add `learningSessions` to the import from `@eduagent/database`.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd apps/api && pnpm exec jest --findRelatedTests src/services/xp.ts --no-coverage
```

Expected: All new tests pass.

- [ ] **Step 5: Commit**

```
feat(api): add applyReflectionMultiplier with idempotency guard
```

---

## Task 3: Clean Up Skip Tracking in Settings Service

**Files:**
- Modify: `apps/api/src/services/settings.ts:302-442`

- [ ] **Step 1: Verify current callers of functions to delete**

Before deleting, confirm these are only called from `routes/sessions.ts` (the skip endpoint):

```bash
cd apps/api && rg "shouldPromptCasualSwitch|shouldWarnSummarySkip|getSkipWarningFlags|CASUAL_SWITCH_PROMPT_THRESHOLD" src/ --type ts
```

Expected: Only `services/settings.ts` (definition) and `routes/sessions.ts` (usage). If anything else imports them, wire in the replacement first.

- [ ] **Step 2: Delete the functions and constant**

In `apps/api/src/services/settings.ts`, delete:

1. `CASUAL_SWITCH_PROMPT_THRESHOLD` constant (line 310)
2. `shouldPromptCasualSwitch()` function (lines 376-388)
3. `shouldWarnSummarySkip()` function (lines 394-410)
4. `getSkipWarningFlags()` function (lines 416-442)

Keep:
- `SKIP_WARNING_THRESHOLD` (line 307) — still needed
- `getConsecutiveSummarySkips()` (lines 312-320) — still needed, will be exposed in summary response
- `incrementSummarySkips()` (lines 327-349) — still needed
- `resetSummarySkips()` (lines 356-370) — still needed

- [ ] **Step 3: Update the barrel export**

Check `apps/api/src/services/settings.ts` exports or `apps/api/src/services/index.ts` — remove exports for deleted functions. Add `getConsecutiveSummarySkips` to exports if not already exported.

- [ ] **Step 4: Typecheck**

Run:
```bash
pnpm exec nx run api:typecheck
```

Expected: Type errors in `routes/sessions.ts` where `getSkipWarningFlags` was imported. That's expected — we'll fix those in Task 5.

- [ ] **Step 5: Commit**

```
refactor(api): delete skip-tracking boolean helpers, keep raw count
```

---

## Task 4: Extend Shared Schemas

**Files:**
- Modify: `packages/schemas/src/sessions.ts`

- [ ] **Step 1: Add XP fields to session summary schema**

In `packages/schemas/src/sessions.ts`, extend the `sessionSummarySchema` to include optional XP fields:

```typescript
// Add to sessionSummarySchema definition (after existing fields):
baseXp: z.number().nullable().optional(),
reflectionBonusXp: z.number().nullable().optional(),
consecutiveSummarySkips: z.number().optional(),
```

- [ ] **Step 2: Extend session type values**

If there's a `sessionTypeSchema` or similar, ensure `'freeform'` is included alongside `'learning'` and `'homework'`. If the session type is passed as a plain string param, this step is a no-op on the schema side (it's just a URL param).

Check:
```bash
cd packages/schemas && rg "sessionType" src/ --type ts
```

- [ ] **Step 3: Typecheck**

Run:
```bash
pnpm exec nx run-many -t typecheck
```

Expected: May see errors in API routes (from Task 3 deletions). Mobile types should be fine.

- [ ] **Step 4: Commit**

```
feat(schemas): add XP + skip count fields to session summary
```

---

## Task 5: Wire XP + Skip Count into API Routes

**Files:**
- Modify: `apps/api/src/routes/sessions.ts:700-795`
- Modify: `apps/api/src/services/session/session-summary.ts`

- [ ] **Step 1: Update `getSessionSummary` to include XP and skip count**

In `apps/api/src/services/session/session-summary.ts`, modify `getSessionSummary()` to also return XP info and skip count:

```typescript
import { getSessionXpEntry } from '../xp';
import { getConsecutiveSummarySkips } from '../settings';

export async function getSessionSummary(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<(SessionSummary & { baseXp?: number | null; reflectionBonusXp?: number | null; consecutiveSummarySkips?: number }) | null> {
  const row = await findSessionSummaryRow(db, profileId, sessionId);
  if (!row) {
    return null;
  }

  const summary = mapSummaryRow(row);

  // Enrich with XP data
  const xpInfo = await getSessionXpEntry(db, profileId, sessionId);
  const skipCount = await getConsecutiveSummarySkips(db, profileId);

  let enrichedSummary = {
    ...summary,
    baseXp: xpInfo?.baseXp ?? null,
    reflectionBonusXp: xpInfo?.reflectionBonusXp ?? null,
    consecutiveSummarySkips: skipCount,
  };

  if (!row.nextTopicId) {
    return enrichedSummary;
  }

  const [topic] = await db
    .select({ title: curriculumTopics.title })
    .from(curriculumTopics)
    .where(eq(curriculumTopics.id, row.nextTopicId))
    .limit(1);

  return {
    ...enrichedSummary,
    nextTopicTitle: topic?.title ?? null,
  };
}
```

- [ ] **Step 2: Wire `applyReflectionMultiplier` into `submitSummary()`**

In `apps/api/src/services/session/session-summary.ts`, after the existing `resetSummarySkips` call in `submitSummary()`:

```typescript
import { applyReflectionMultiplier } from '../xp';

// ... inside submitSummary(), after resetSummarySkips(db, profileId):
const xpResult = await applyReflectionMultiplier(db, profileId, sessionId);
```

Extend the return value to include XP info:

```typescript
return {
  summary: {
    id: finalRow.id,
    sessionId: finalRow.sessionId,
    content: finalRow.content ?? input.content,
    aiFeedback: evaluation.feedback,
    status: finalStatus,
  },
  xpApplied: xpResult.applied,
  newXpAmount: xpResult.newAmount,
};
```

- [ ] **Step 3: Update the skip route in `routes/sessions.ts`**

Replace the `getSkipWarningFlags` call with `getConsecutiveSummarySkips`:

```typescript
// Old:
const {
  shouldPromptCasualSwitch: promptCasualSwitch,
  shouldWarnSummarySkip: warnSummarySkip,
} = await getSkipWarningFlags(db, profileId);
return c.json({
  ...result,
  shouldPromptCasualSwitch: promptCasualSwitch,
  shouldWarnSummarySkip: warnSummarySkip,
  pipelineQueued,
});

// New:
const consecutiveSummarySkips = await getConsecutiveSummarySkips(db, profileId);
return c.json({
  ...result,
  consecutiveSummarySkips,
  pipelineQueued,
});
```

Update the import at the top of `routes/sessions.ts`:
- Remove: `getSkipWarningFlags`
- Add: `getConsecutiveSummarySkips` (from `../services/settings`)

- [ ] **Step 4: Run typecheck**

Run:
```bash
pnpm exec nx run api:typecheck
```

Expected: Clean — all deleted function references replaced.

- [ ] **Step 5: Run existing tests**

Run:
```bash
cd apps/api && pnpm exec jest --findRelatedTests src/routes/sessions.ts src/services/session/session-summary.ts --no-coverage
```

Expected: Some tests may fail if they assert on `shouldPromptCasualSwitch` / `shouldWarnSummarySkip` in the skip response. Update those assertions to expect `consecutiveSummarySkips` instead.

- [ ] **Step 6: Commit**

```
feat(api): wire XP multiplier into summary submit, expose skip count
```

---

## Task 6: Integration Tests for XP Multiplier + Skip Count

**Files:**
- Modify: `apps/api/src/services/session-summary.integration.test.ts`

- [ ] **Step 1: Write integration tests**

Add these test cases to the existing integration test file:

```typescript
describe('reflection XP multiplier', () => {
  it('submit summary → xp_ledger.amount updated with 1.5x, reflectionMultiplierApplied = true', async () => {
    // 1. Create session with topicId
    // 2. Seed an xp_ledger row (amount=100, reflectionMultiplierApplied=false)
    // 3. POST /sessions/:sessionId/summary with valid content
    // 4. Assert xp_ledger row: amount=150, reflectionMultiplierApplied=true
  });

  it('skip summary → xp_ledger.amount unchanged, reflectionMultiplierApplied = false', async () => {
    // 1. Create session with topicId
    // 2. Seed an xp_ledger row (amount=100, reflectionMultiplierApplied=false)
    // 3. POST /sessions/:sessionId/summary/skip
    // 4. Assert xp_ledger row: amount=100, reflectionMultiplierApplied=false
  });

  it('submit summary without topicId → no xp change, no error', async () => {
    // 1. Create session with topicId=null
    // 2. POST /sessions/:sessionId/summary with valid content
    // 3. Assert no xp_ledger row exists, response still 200
  });
});

describe('skip response format', () => {
  it('returns consecutiveSummarySkips instead of boolean flags', async () => {
    // 1. Skip 3 times
    // 2. Assert response has consecutiveSummarySkips: 3
    // 3. Assert response does NOT have shouldWarnSummarySkip or shouldPromptCasualSwitch
  });
});

describe('GET summary includes XP fields', () => {
  it('returns baseXp and reflectionBonusXp when xp entry exists', async () => {
    // 1. Create session with topic + xp entry (amount=100)
    // 2. GET /sessions/:sessionId/summary
    // 3. Assert baseXp: 100, reflectionBonusXp: 50
  });

  it('returns null XP fields when no xp entry exists', async () => {
    // 1. Create session without topic
    // 2. GET /sessions/:sessionId/summary
    // 3. Assert baseXp: null, reflectionBonusXp: null
  });
});
```

Adapt the test setup to match the existing patterns in `session-summary.integration.test.ts` (DB seeding, auth context, app instance, etc.).

- [ ] **Step 2: Run integration tests**

Run:
```bash
cd apps/api && pnpm exec jest src/services/session-summary.integration.test.ts --no-coverage
```

Expected: All pass.

- [ ] **Step 3: Commit**

```
test(api): integration tests for reflection XP multiplier and skip count
```

---

## Task 7: Mode-Adaptive Sentence Starters with i18n (EN + CS)

**Files:**
- Create: `apps/mobile/src/lib/reflection-starters.ts`
- Create: `apps/mobile/src/lib/reflection-starters.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/lib/reflection-starters.test.ts`:

```typescript
import { getReflectionStarters } from './reflection-starters';

describe('getReflectionStarters', () => {
  it('returns learning-mode starters in English by default', () => {
    const starters = getReflectionStarters('learning', 'en');
    expect(starters).toEqual([
      'Today I learned that...',
      'The most interesting thing was...',
      'I want to learn more about...',
      'Something that surprised me was...',
    ]);
  });

  it('returns freeform starters in English', () => {
    const starters = getReflectionStarters('freeform', 'en');
    expect(starters).toEqual([
      'The answer I was looking for was...',
      'Now I understand that...',
      'I still have questions about...',
      'The most useful thing I found out was...',
    ]);
  });

  it('returns homework starters in English', () => {
    const starters = getReflectionStarters('homework', 'en');
    expect(starters).toEqual([
      'The key thing I practiced was...',
      'I got stuck on...',
      'Next time I would...',
      'I now know how to...',
    ]);
  });

  it('returns learning-mode starters in Czech', () => {
    const starters = getReflectionStarters('learning', 'cs');
    expect(starters).toEqual([
      'Dnes jsem se naučil/a, že...',
      'Nejzajímavější bylo...',
      'Chci se dozvědět víc o...',
      'Překvapilo mě, že...',
    ]);
  });

  it('returns freeform starters in Czech', () => {
    const starters = getReflectionStarters('freeform', 'cs');
    expect(starters).toEqual([
      'Hledal/a jsem odpověď na...',
      'Teď už rozumím tomu, že...',
      'Ještě bych se chtěl/a zeptat na...',
      'Nejužitečnější, co jsem zjistil/a, bylo...',
    ]);
  });

  it('returns homework starters in Czech', () => {
    const starters = getReflectionStarters('homework', 'cs');
    expect(starters).toEqual([
      'Hlavní věc, kterou jsem procvičil/a, byla...',
      'Zasekl/a jsem se na...',
      'Příště bych...',
      'Teď už vím, jak...',
    ]);
  });

  it('falls back to English for unsupported languages', () => {
    const starters = getReflectionStarters('learning', 'ja');
    expect(starters).toEqual(getReflectionStarters('learning', 'en'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/reflection-starters.ts --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `reflection-starters.ts`**

Create `apps/mobile/src/lib/reflection-starters.ts`:

```typescript
type SessionMode = 'learning' | 'freeform' | 'homework';

const STARTERS: Record<string, Record<SessionMode, string[]>> = {
  en: {
    learning: [
      'Today I learned that...',
      'The most interesting thing was...',
      'I want to learn more about...',
      'Something that surprised me was...',
    ],
    freeform: [
      'The answer I was looking for was...',
      'Now I understand that...',
      'I still have questions about...',
      'The most useful thing I found out was...',
    ],
    homework: [
      'The key thing I practiced was...',
      'I got stuck on...',
      'Next time I would...',
      'I now know how to...',
    ],
  },
  cs: {
    learning: [
      'Dnes jsem se naučil/a, že...',
      'Nejzajímavější bylo...',
      'Chci se dozvědět víc o...',
      'Překvapilo mě, že...',
    ],
    freeform: [
      'Hledal/a jsem odpověď na...',
      'Teď už rozumím tomu, že...',
      'Ještě bych se chtěl/a zeptat na...',
      'Nejužitečnější, co jsem zjistil/a, bylo...',
    ],
    homework: [
      'Hlavní věc, kterou jsem procvičil/a, byla...',
      'Zasekl/a jsem se na...',
      'Příště bych...',
      'Teď už vím, jak...',
    ],
  },
};

export function getReflectionStarters(
  mode: SessionMode,
  languageCode: string
): string[] {
  const lang = STARTERS[languageCode] ? languageCode : 'en';
  return STARTERS[lang][mode];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/reflection-starters.ts --no-coverage
```

Expected: All pass.

- [ ] **Step 5: Commit**

```
feat(mobile): mode-adaptive reflection starters with EN + CS i18n
```

---

## Task 8: Update Mobile Hooks — Types for XP + Skip Count

**Files:**
- Modify: `apps/mobile/src/hooks/use-sessions.ts:82-102`

- [ ] **Step 1: Update `SkipSummaryResult` type**

Replace the boolean skip flags with `consecutiveSummarySkips`:

```typescript
// Old:
interface SkipSummaryResult {
  summary: {
    id: string;
    sessionId: string;
    content: string;
    aiFeedback: string | null;
    status: 'skipped' | 'submitted' | 'accepted';
  };
  shouldWarnSummarySkip?: boolean;
  shouldPromptCasualSwitch?: boolean;
}

// New:
interface SkipSummaryResult {
  summary: {
    id: string;
    sessionId: string;
    content: string;
    aiFeedback: string | null;
    status: 'skipped' | 'submitted' | 'accepted';
  };
  consecutiveSummarySkips?: number;
}
```

- [ ] **Step 2: Update `SubmitSummaryResult` type**

Add the XP result fields:

```typescript
interface SubmitSummaryResult {
  summary: {
    id: string;
    sessionId: string;
    content: string;
    aiFeedback: string | null;
    status: 'accepted' | 'submitted';
  };
  xpApplied?: boolean;
  newXpAmount?: number;
}
```

- [ ] **Step 3: Update the `useSessionSummary` return type or the `SessionSummaryData` type**

Check how `useSessionSummary` is typed — it likely infers from the API response. If it uses a manual type, add:

```typescript
// Whatever type backs useSessionSummary result:
baseXp?: number | null;
reflectionBonusXp?: number | null;
consecutiveSummarySkips?: number;
```

Find the exact location by searching:
```bash
cd apps/mobile && rg "useSessionSummary" src/hooks/use-sessions.ts
```

- [ ] **Step 4: Typecheck**

Run:
```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: May have errors in `session-summary/[sessionId].tsx` where old skip flags are referenced. That's expected — we'll fix those in Task 10.

- [ ] **Step 5: Commit**

```
feat(mobile): update session hook types for XP + skip count
```

---

## Task 9: Navigation Changes — Filing Routes to Summary

**Files:**
- Modify: `apps/mobile/src/components/session/SessionFooter.tsx:161-255`
- Modify: `apps/mobile/src/components/session/use-session-actions.ts:239-267`

- [ ] **Step 1: Update `navigateToSessionSummary` to accept filing params**

In `apps/mobile/src/components/session/use-session-actions.ts`, modify `navigateToSessionSummary` (line 239) to accept optional filed IDs:

```typescript
const navigateToSessionSummary = useCallback(
  (filingResult?: { shelfId: string; bookId: string }) => {
    const saved = closedSessionRef.current;
    if (!activeSessionId || !saved) return;
    router.replace({
      pathname: `/session-summary/${activeSessionId}`,
      params: {
        subjectName: effectiveSubjectName ?? '',
        exchangeCount: String(exchangeCount),
        escalationRung: String(escalationRung),
        subjectId: effectiveSubjectId ?? '',
        topicId: topicId ?? '',
        wallClockSeconds: String(saved.wallClockSeconds),
        milestones: serializeMilestones(milestonesReached),
        fastCelebrations: serializeCelebrations(saved.fastCelebrations),
        sessionType:
          effectiveMode === 'homework'
            ? 'homework'
            : effectiveMode === 'freeform'
              ? 'freeform'
              : 'learning',
        ...(filingResult
          ? {
              filedSubjectId: filingResult.shelfId,
              filedBookId: filingResult.bookId,
            }
          : {}),
      },
    } as never);
  },
  [
    activeSessionId,
    router,
    effectiveSubjectName,
    effectiveSubjectId,
    topicId,
    exchangeCount,
    escalationRung,
    milestonesReached,
    effectiveMode,
    closedSessionRef,
  ]
);
```

Also update `navigateToSummary` (line 269) to include the `sessionType` change — currently it passes `effectiveMode` directly which can be `'freeform'`:

```typescript
// Line 287 in navigateToSummary — sessionType already passes effectiveMode directly.
// Check if effectiveMode can be 'freeform' here. If yes, it already works.
// If the caller only calls navigateToSummary for learning mode, this is fine.
```

- [ ] **Step 2: Update `StandardFilingPrompt` accept handler**

In `apps/mobile/src/components/session/SessionFooter.tsx`, change the accept handler (line 195-208) to navigate to summary instead of shelf:

```typescript
onPress={async () => {
  try {
    const result = await filing.mutateAsync({
      sessionId: activeSessionId ?? undefined,
      sessionMode: effectiveMode as 'freeform' | 'homework',
    });
    setShowFilingPrompt(false);
    navigateToSessionSummary({ shelfId: result.shelfId, bookId: result.bookId });
  } catch {
    platformAlert(
      "Couldn't add to library",
      'Your session is still saved.',
      [
        {
          text: 'OK',
          onPress: () => {
            setFilingDismissed(true);
            navigateToSessionSummary();
          },
        },
      ]
    );
  }
}}
```

- [ ] **Step 3: Update `StandardFilingPrompt` prop types**

The `navigateToSessionSummary` prop type changes from `() => void` to `(filingResult?: { shelfId: string; bookId: string }) => void`:

```typescript
function StandardFilingPrompt({
  // ...existing props
  navigateToSessionSummary,
}: {
  // ...existing types
  navigateToSessionSummary: (filingResult?: { shelfId: string; bookId: string }) => void;
  // Remove: router: Router  (no longer needed since we don't router.replace to shelf)
}) {
```

If `router` is no longer used in `StandardFilingPrompt` after removing the shelf navigation, remove it from props.

- [ ] **Step 4: Update the parent that renders `StandardFilingPrompt`**

Search for where `StandardFilingPrompt` is rendered and ensure the new `navigateToSessionSummary` signature is passed correctly. The parent is likely in `SessionFooter.tsx` itself or `use-session-actions.ts`.

- [ ] **Step 5: Typecheck**

Run:
```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: Should compile. May have new errors in session-summary screen for `filedSubjectId`/`filedBookId` params — that's fine, handled in Task 10.

- [ ] **Step 6: Commit**

```
feat(mobile): filing accept routes to summary with filed IDs
```

---

## Task 10: Session Summary Screen — XP Banner, Mode Starters, Skip Nudge, Done Navigation

This is the largest task. It modifies the session summary screen to add all the new UI behaviors.

**Files:**
- Modify: `apps/mobile/src/app/session-summary/[sessionId].tsx`

### Sub-step A: Add URL params for filing and parse session type

- [ ] **Step 1: Extend URL params**

Add `filedSubjectId`, `filedBookId` to `useLocalSearchParams`:

```typescript
const {
  sessionId,
  subjectName,
  exchangeCount,
  escalationRung,
  subjectId,
  topicId,
  wallClockSeconds,
  milestones,
  fastCelebrations,
  sessionType: sessionTypeParam,
  filedSubjectId,
  filedBookId,
} = useLocalSearchParams<{
  sessionId: string;
  subjectName?: string;
  exchangeCount?: string;
  escalationRung?: string;
  subjectId?: string;
  topicId?: string;
  wallClockSeconds?: string;
  milestones?: string;
  fastCelebrations?: string;
  sessionType?: string;
  filedSubjectId?: string;
  filedBookId?: string;
}>();
```

Derive the effective session type:

```typescript
const sessionType: 'learning' | 'freeform' | 'homework' =
  sessionTypeParam === 'freeform'
    ? 'freeform'
    : sessionTypeParam === 'homework'
      ? 'homework'
      : 'learning';
```

### Sub-step B: Replace hardcoded SUMMARY_PROMPTS with mode-adaptive starters

- [ ] **Step 2: Import and use `getReflectionStarters`**

Replace the `SUMMARY_PROMPTS` constant at the top of the file:

```typescript
// DELETE this block (lines 49-55):
// const SUMMARY_PROMPTS = [
//   'Today I learned that...',
//   ...
// ] as const;

// ADD import:
import { getReflectionStarters } from '../../lib/reflection-starters';
```

Inside the component, derive starters from the profile's language:

```typescript
const conversationLanguage = activeProfile?.conversationLanguage ?? 'en';
const summaryPrompts = getReflectionStarters(sessionType, conversationLanguage);
```

Then replace all references to `SUMMARY_PROMPTS` with `summaryPrompts` in the JSX (around line 1202):

```typescript
{summaryPrompts.map((prompt) => (
  // ... existing chip rendering, unchanged
))}
```

### Sub-step C: Mode-adaptive section headers and placeholder

- [ ] **Step 3: Adapt headers per session type**

Find the "What you explored" / AI recap section header. Replace with:

```typescript
const recapHeader =
  sessionType === 'homework'
    ? 'What you practiced'
    : sessionType === 'freeform'
      ? 'What you asked about'
      : 'What you explored';
```

Find the input placeholder (currently `"In my own words, I learned that..."` around line 1222). Replace with:

```typescript
const reflectionPlaceholder =
  sessionType === 'homework'
    ? 'What I practiced...'
    : sessionType === 'freeform'
      ? 'What I found out...'
      : 'In my own words...';
```

Use `reflectionPlaceholder` in the `TextInput` `placeholder` prop.

### Sub-step D: XP Incentive Banner

- [ ] **Step 4: Add the XP incentive banner above the reflection input**

The XP data comes from `persistedSummary.data` (which now includes `baseXp` and `reflectionBonusXp` from the API). Render the banner when XP data exists and the user hasn't submitted yet:

```typescript
const baseXp = persisted?.baseXp ?? null;
const reflectionBonusXp = persisted?.reflectionBonusXp ?? null;
const hasXpIncentive = baseXp != null && baseXp > 0;
```

In the JSX, above the "Your Words" section (before line 1127), add:

```typescript
{hasXpIncentive && !showSubmittedView && !isPersistedSkipped && (
  <View
    className="bg-surface-elevated rounded-card p-4 mb-4 flex-row items-center"
    testID="xp-incentive-banner"
  >
    <Text className="text-body-sm mr-2">✦</Text>
    <View className="flex-1">
      <Text className="text-body-sm font-semibold text-text-primary">
        Write a reflection to earn 1.5x XP
      </Text>
      <Text className="text-caption text-text-secondary">
        Base: {baseXp} XP → With reflection: {baseXp + (reflectionBonusXp ?? 0)} XP
      </Text>
    </View>
  </View>
)}

{/* After submission, show earned bonus */}
{hasXpIncentive && showSubmittedView && (
  <View
    className="bg-success/10 rounded-card p-4 mb-4 flex-row items-center"
    testID="xp-bonus-earned"
  >
    <Text className="text-body-sm mr-2">✦</Text>
    <Text className="text-body-sm font-semibold text-success">
      +{reflectionBonusXp} bonus XP earned!
    </Text>
  </View>
)}

{/* After skip, show missed XP */}
{hasXpIncentive && isPersistedSkipped && summaryText.length === 0 && (
  <View
    className="rounded-card p-4 mb-4"
    testID="xp-bonus-missed"
  >
    <Text className="text-body-sm text-text-secondary">
      You missed +{reflectionBonusXp} XP
    </Text>
  </View>
)}
```

### Sub-step E: Client-Side Skip Nudge Thresholds

- [ ] **Step 5: Replace server-computed skip flags with client-side threshold checks**

In `handleContinue()`, replace the skip-warning logic (lines 625-694). The skip result now returns `consecutiveSummarySkips` instead of boolean flags:

```typescript
// CONSTANTS — add at file top or import from a shared location:
const SKIP_NUDGE_THRESHOLD = 3;
const SKIP_WARNING_THRESHOLD = 5;

// Inside handleContinue(), replace the skip-warning block (lines 625-694):

// Nudge at 3 consecutive skips (new — replaces nothing)
if (skipResult?.consecutiveSummarySkips === SKIP_NUDGE_THRESHOLD) {
  platformAlert(
    'Give it a try?',
    'Reflecting helps you remember — give it a try next time?',
    [
      {
        text: 'OK',
        onPress: () => {
          void (async () => {
            await maybePromptForRecall();
            goBackOrReplace(router, '/(app)/home');
          })();
        },
      },
    ]
  );
  return;
}

// Warning at 5+ consecutive skips (all modes, not just serious)
if (
  skipResult?.consecutiveSummarySkips != null &&
  skipResult.consecutiveSummarySkips >= SKIP_WARNING_THRESHOLD
) {
  platformAlert(
    'Summaries help you learn',
    'Students who reflect remember 2x more. Try it next time!',
    [
      {
        text: 'Got it',
        onPress: () => {
          void (async () => {
            await maybePromptForRecall();
            goBackOrReplace(router, '/(app)/home');
          })();
        },
      },
    ]
  );
  return;
}

// DELETE the entire shouldPromptCasualSwitch block (lines 648-694).
// The 10-skip casual-switch prompt is removed entirely.
```

### Sub-step F: "Done" Button Navigation to Filed Book

- [ ] **Step 6: Update "Done" / "Continue" navigation for filed sessions**

In `handleContinue()`, update the final navigation (around line 700-710). After the skip-warning checks, before `goBackOrReplace`:

```typescript
// After the skip-warning blocks and maybePromptForRecall:
await maybePromptForRecall();

// Filed book navigation — push the full ancestor chain per CLAUDE.md cross-tab rule
if (filedSubjectId && filedBookId) {
  router.replace('/(app)/library' as never);
  // Small delay to let the replace settle before pushing onto the stack
  setTimeout(() => {
    router.push({
      pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
      params: { subjectId: filedSubjectId, bookId: filedBookId },
    } as never);
  }, 50);
  return;
}

// Past session view → navigate to topic to continue learning
const effectiveTopicId = topicId ?? fallbackSession?.topicId;
const effectiveSubjectId = subjectId ?? fallbackSession?.subjectId;
if (isAlreadyPersisted && effectiveTopicId && effectiveSubjectId) {
  router.replace({
    pathname: '/(app)/topic/[topicId]',
    params: { topicId: effectiveTopicId, subjectId: effectiveSubjectId },
  } as never);
  return;
}

goBackOrReplace(router, '/(app)/home');
```

- [ ] **Step 7: Remove `useUpdateLearningMode` import if no longer needed**

The casual-switch modal used `updateLearningMode`. If that's deleted and nothing else uses it, remove the import and hook call.

Check:
```bash
rg "updateLearningMode" apps/mobile/src/app/session-summary/
```

- [ ] **Step 8: Typecheck the mobile app**

Run:
```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: Clean.

- [ ] **Step 9: Commit**

```
feat(mobile): XP banner, mode starters, skip nudges, filed-book navigation
```

---

## Task 11: Delete Casual-Switch Modal / Dead Code

**Files:**
- Modify: `apps/mobile/src/app/session-summary/[sessionId].tsx` (if not already cleaned in Task 10)
- Possibly: other files that reference `shouldPromptCasualSwitch`

- [ ] **Step 1: Grep for remaining casual-switch references**

Run:
```bash
rg "shouldPromptCasualSwitch|casualSwitch|casual.switch|CASUAL_SWITCH" apps/mobile/src/ --type ts
```

- [ ] **Step 2: Remove any remaining dead code**

Delete any component, modal, or handler that only existed for the casual-switch prompt. This includes:
- The `shouldPromptCasualSwitch` property access on skip results
- Any modal component for "Try Casual Explorer?"
- The `useUpdateLearningMode` hook usage if it was only for this

- [ ] **Step 3: Grep for `shouldWarnSummarySkip` in mobile**

Run:
```bash
rg "shouldWarnSummarySkip" apps/mobile/src/ --type ts
```

Remove any remaining references.

- [ ] **Step 4: Typecheck**

Run:
```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: Clean.

- [ ] **Step 5: Commit**

```
refactor(mobile): delete casual-switch modal and dead skip-flag references
```

---

## Task 12: Note Creation on Summary Submit (Feature-Checked)

**Files:**
- Modify: `apps/api/src/services/session/session-summary.ts`

This task wires note creation into the summary submit flow. The spec says this is behind a feature check for Library v3 API availability. The current `topic_notes` table has a UNIQUE constraint on `(topicId, profileId)`, meaning one note per topic per profile. The Library v3 spec redesigns this to support multiple notes with optional `sessionId`. **If Library v3 has NOT shipped the notes API yet, this task is deferred.** Implement the feature check so the code path is ready but doesn't break.

- [ ] **Step 1: Check if the notes API exists**

Run:
```bash
rg "topic.?notes|topicNotes|POST.*notes" apps/api/src/routes/ --type ts
```

If no notes route exists: implement the note creation as a standalone DB insert behind a try/catch, using the existing `topicNotes` table. The unique constraint means it will upsert (update content) for the same topic.

If the Library v3 notes API exists with `sessionId` support: call it internally.

- [ ] **Step 2: Add note creation to `submitSummary()`**

In `apps/api/src/services/session/session-summary.ts`, after the XP multiplier application:

```typescript
import { topicNotes } from '@eduagent/database';

// Inside submitSummary(), after applyReflectionMultiplier:
if (session.topicId) {
  try {
    await db
      .insert(topicNotes)
      .values({
        topicId: session.topicId,
        profileId,
        content: input.content,
      })
      .onConflictDoUpdate({
        target: [topicNotes.topicId, topicNotes.profileId],
        set: { content: input.content, updatedAt: new Date() },
      });
  } catch (err) {
    console.error('[submitSummary] Note creation failed, non-blocking:', err);
  }
}
```

The try/catch ensures note creation failure never blocks XP or summary acceptance (per spec).

- [ ] **Step 3: Write integration test for note creation**

Add to `apps/api/src/services/session-summary.integration.test.ts`:

```typescript
describe('note creation on submit', () => {
  it('creates a topic_notes entry when session has topicId', async () => {
    // 1. Create session with topicId
    // 2. POST summary submit
    // 3. Assert topic_notes row exists with matching content
  });

  it('does not create a note when session has no topicId', async () => {
    // 1. Create session without topicId
    // 2. POST summary submit
    // 3. Assert no topic_notes row
  });

  it('note failure does not block summary acceptance', async () => {
    // This is hard to test without mocking — skip if the DB insert
    // is atomic. The try/catch is the contract.
  });
});
```

- [ ] **Step 4: Run tests**

Run:
```bash
cd apps/api && pnpm exec jest src/services/session-summary.integration.test.ts --no-coverage
```

Expected: All pass.

- [ ] **Step 5: Commit**

```
feat(api): create topic note on reflection submit (non-blocking)
```

---

## Task 13: Mobile Tests for Session Summary Screen

**Files:**
- Modify or create: `apps/mobile/src/app/session-summary/[sessionId].test.tsx`

- [ ] **Step 1: Check if test file exists**

```bash
ls apps/mobile/src/app/session-summary/
```

- [ ] **Step 2: Write or extend tests**

Key test cases:

```typescript
describe('SessionSummaryScreen', () => {
  describe('mode-adaptive starters', () => {
    it('renders learning starters for sessionType=learning', () => {
      // Render with sessionType='learning'
      // Assert SUMMARY_PROMPTS chips show learning starters
    });

    it('renders freeform starters for sessionType=freeform', () => {
      // Render with sessionType='freeform'
      // Assert chips show freeform starters
    });

    it('renders homework starters for sessionType=homework', () => {
      // Render with sessionType='homework'
      // Assert chips show homework starters
    });
  });

  describe('XP incentive banner', () => {
    it('shows banner with correct amounts when baseXp is available', () => {
      // Mock useSessionSummary to return baseXp: 100, reflectionBonusXp: 50
      // Assert testID="xp-incentive-banner" is visible
      // Assert text includes "100 XP" and "150 XP"
    });

    it('hides banner when no XP data (freeform with no topic)', () => {
      // Mock useSessionSummary to return baseXp: null
      // Assert testID="xp-incentive-banner" is NOT rendered
      // Assert reflection input IS still rendered
    });

    it('shows bonus earned after submission', () => {
      // Submit summary, assert testID="xp-bonus-earned" shows "+50 bonus XP earned!"
    });

    it('shows missed XP after skip', () => {
      // Skip summary, assert testID="xp-bonus-missed" shows "You missed +50 XP"
    });
  });

  describe('skip nudges', () => {
    it('shows nudge at 3 consecutive skips', () => {
      // Mock skip to return consecutiveSummarySkips: 3
      // Tap skip, assert alert with "Reflecting helps you remember"
    });

    it('shows warning at 5 consecutive skips', () => {
      // Mock skip to return consecutiveSummarySkips: 5
      // Tap skip, assert alert with "Students who reflect remember 2x more"
    });

    it('does NOT show casual-switch prompt at 10 skips', () => {
      // Mock skip to return consecutiveSummarySkips: 10
      // Tap skip, assert warning shows but NO casual-switch prompt
    });
  });

  describe('filed book navigation', () => {
    it('navigates to Library → Book when filedSubjectId and filedBookId present', () => {
      // Render with filedSubjectId + filedBookId params
      // Tap "Continue"
      // Assert router.replace called with '/(app)/library'
      // Assert router.push called with shelf/[subjectId]/book/[bookId]
    });

    it('navigates to home when no filing params', () => {
      // Render without filing params
      // Tap "Continue" (after submit)
      // Assert goBackOrReplace called with '/(app)/home'
    });
  });
});
```

Adapt to the existing test patterns in the mobile app (render utils, mock providers, etc.).

- [ ] **Step 3: Run tests**

Run:
```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/session-summary/[sessionId].tsx --no-coverage
```

Expected: All pass.

- [ ] **Step 4: Commit**

```
test(mobile): session summary tests for XP banner, starters, skip nudges, navigation
```

---

## Task 14: Final Validation

- [ ] **Step 1: Full API typecheck + lint**

Run:
```bash
pnpm exec nx run api:typecheck && pnpm exec nx run api:lint
```

- [ ] **Step 2: Full mobile typecheck + lint**

Run:
```bash
pnpm exec nx lint mobile && cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 3: Run all related tests**

Run:
```bash
cd apps/api && pnpm exec jest --findRelatedTests src/services/xp.ts src/services/settings.ts src/services/session/session-summary.ts src/routes/sessions.ts --no-coverage
```

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/session-summary/[sessionId].tsx src/lib/reflection-starters.ts src/hooks/use-sessions.ts src/components/session/SessionFooter.tsx src/components/session/use-session-actions.ts --no-coverage
```

- [ ] **Step 4: Run integration tests**

Run:
```bash
cd apps/api && pnpm exec jest src/services/session-summary.integration.test.ts --no-coverage
```

- [ ] **Step 5: Verify no regressions in skip tracking**

Manually verify that `incrementSummarySkips` and `resetSummarySkips` still work correctly for all modes by checking the integration test output.

- [ ] **Step 6: Commit any remaining fixes**

---

## Dependency Graph

```
Task 1 (migration)
  ↓
Task 2 (applyReflectionMultiplier)
  ↓
Task 3 (settings cleanup) ──→ Task 5 (wire into routes)
  ↓                              ↓
Task 4 (schemas)            Task 6 (integration tests)
  ↓                              ↓
Task 7 (starters i18n) ─────────┐
  ↓                              │
Task 8 (mobile hook types)       │
  ↓                              │
Task 9 (nav/filing) ────────────┐│
  ↓                              ↓↓
Task 10 (summary screen) ←──── all above
  ↓
Task 11 (dead code cleanup)
  ↓
Task 12 (note creation)
  ↓
Task 13 (mobile tests)
  ↓
Task 14 (final validation)
```

**Parallelizable groups:**
- Tasks 3 + 4 can run in parallel (both independent of each other, both depend on Task 2)
- Tasks 7 + 8 can run in parallel (both independent)
- Task 12 is independent of Tasks 10-11 (API-only)

---

## Notes for Implementer

1. **Library v3 contract:** The `topic_notes` table currently has a `UNIQUE(topicId, profileId)` constraint — one note per topic per profile. Task 12 uses `onConflictDoUpdate` to handle this. When Library v3 ships with multi-note support (dropping the unique constraint, adding `sessionId` column), Task 12's insert should be updated to include `sessionId` and remove the upsert.

2. **The `mandatorySummaries` flag** in `LearningModeRules` is set to `false` for casual and `true` for serious. The spec says to leave it as-is (effectively dead) and remove in a follow-up. Do NOT touch `LearningModeRules` in this implementation.

3. **`useUpdateLearningMode`** may still be imported/used elsewhere in the summary screen (e.g., for the settings gear). Only remove it if the casual-switch modal was its sole consumer. Grep first.

4. **Cross-tab navigation pattern:** The 2-step push (`router.replace` to Library, then `router.push` to Book) follows the CLAUDE.md cross-tab rule. The `setTimeout(50)` is a pragmatic workaround for Expo Router's navigation batching — if it causes issues, try `requestAnimationFrame` or `InteractionManager.runAfterInteractions` instead.

5. **Czech translations:** The Czech starters use `/a` gender suffixes (e.g., "naučil/a") which is the standard inclusive form. If the profile has gender information, a future enhancement could select the correct form — but that's out of scope here.
