# Quiz Gaps Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three remaining gaps in the quiz system: missed-item surfacing (so coaching cards stop repeating), spaced-repetition mastery for capitals and Guess Who, and Phase 5 enhancements (difficulty adaptation, round history, free-text unlock, personal bests).

**Architecture:** Two parallel SM-2 storage systems — the existing `vocabularyRetentionCards` for vocabulary, and a new `quiz_mastery_items` table for capitals and Guess Who. Mastery items enter on first correct discovery answer and are reviewed via SM-2. The missed-item surfacing mechanism marks items as "surfaced" on user action (card tap/dismiss), not on precomputation. Phase 5 features build on the mastery foundation: difficulty bumps query recent round perfects, free-text unlock tracks MC success counts, round history exposes answers only for completed rounds.

**Tech Stack:** Drizzle ORM (Postgres), Hono (API routes), TanStack Query (React Native hooks), `@eduagent/retention` SM-2 package (verified: exports `sm2(input: SM2Input): SM2Result` from `packages/retention/src/sm2.ts`), `@eduagent/schemas` Zod types, Jest (testing).

**Pre-flight verification (run before starting):**
- [ ] `ls packages/retention/src/` — confirms `sm2.ts` present (if missing, SM-2 logic must be implemented locally before Task 7)
- [ ] `git grep -n "^export" packages/retention/src/sm2.ts` — confirms the expected function signature matches what Task 7 and Task 9 call

**Spec:** `docs/superpowers/specs/2026-04-18-quiz-gaps-completion-design.md`

---

## Test File Strategy

Before writing tests, prefer extending an existing test file over creating a new one. The following existing files are the natural homes for most of the test assertions in this plan:

| Task | Preferred test file | Rationale |
|---|---|---|
| Task 5 (mark-surfaced endpoint) | `apps/api/src/routes/quiz.test.ts` | Existing home for quiz route tests |
| Task 8 (content resolver mastery) | `apps/api/src/services/quiz/content-resolver.test.ts` | Existing content-resolver test file |
| Task 9 (complete-round SM-2 wiring) | `apps/api/src/services/quiz/complete-round.test.ts` | Existing complete-round test file |
| Task 12 (LLM prompt difficulty hints) | `apps/api/src/services/quiz/generate-round.test.ts` | Existing generate-round tests |
| Task 14 (round detail endpoint + break test) | `apps/api/src/routes/quiz.test.ts` | Same route file as other quiz tests |

**Genuinely new files are OK for genuinely new modules:**

| New module | New test file justified? |
|---|---|
| `mastery-keys.ts` | ✓ Pure new service, no existing sibling to extend |
| `mastery-provider.ts` | ✓ New module |
| `difficulty-bump.ts` | ✓ New module |
| `history.tsx`, `[roundId].tsx` | ✓ New screens |

**Rule of thumb:** If you're modifying an existing module (`.ts` file), extend that module's test file. If you're creating a new module, create a matching new test file.

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `packages/database/src/schema/quiz-mastery.ts` | Drizzle table definition for `quiz_mastery_items` |
| `apps/api/src/services/quiz/mastery-keys.ts` | Pure functions: name normalization, era bucketing, deterministic hash for Guess Who keys, capitals key computation |
| `apps/api/src/services/quiz/mastery-keys.test.ts` | Tests for key generation |
| `apps/api/src/services/quiz/mastery-provider.ts` | Capitals/Guess Who mastery question builders, mastery item upsert, SM-2 update wiring |
| `apps/api/src/services/quiz/mastery-provider.test.ts` | Tests for mastery builders and SM-2 |
| `apps/api/src/services/quiz/difficulty-bump.ts` | Check last 3 rounds for consecutive perfects within 14 days |
| `apps/api/src/services/quiz/difficulty-bump.test.ts` | Tests for bump logic |
| `apps/mobile/src/app/(app)/quiz/history.tsx` | Round history screen — scrollable list grouped by date |
| `apps/mobile/src/app/(app)/quiz/history.test.tsx` | Tests for history screen |
| `apps/mobile/src/app/(app)/quiz/[roundId].tsx` | Round detail view — read-only question/answer review |
| `apps/mobile/src/app/(app)/quiz/[roundId].test.tsx` | Tests for detail view |

### Modified Files

| File | Changes |
|---|---|
| `packages/database/src/schema/index.ts` | Add `export * from './quiz-mastery'` |
| `packages/database/src/repository.ts` | Add `quizMasteryItems` namespace (findDueByActivity, upsertFromCorrectAnswer, updateSm2); add `markSurfaced` to `quizMissedItems` namespace |
| `packages/schemas/src/quiz.ts` | Add `era` field to `guessWhoQuestionSchema` + LLM person schema; add `freeTextEligible` to client question schemas; add `difficultyBump` to round response; add `markSurfacedInputSchema`; add `bestConsecutive` to stats |
| `apps/api/src/routes/quiz.ts` | Add `POST /quiz/missed-items/mark-surfaced`; surface `difficultyBump` in round response; expose `correctAnswer` for completed rounds in `GET /rounds/:id` |
| `apps/api/src/services/quiz/complete-round.ts` | Add `getCapitalsSm2Quality`; wire SM-2 updates for capitals/guess_who mastery questions alongside existing vocabulary path |
| `apps/api/src/services/quiz/generate-round.ts` | Integrate mastery items for capitals + guess_who (currently only vocabulary has mastery injection); add difficulty bump context to prompts |
| `apps/api/src/services/quiz/queries.ts` | Add `getDueMasteryItems`, `getRecentPerfectRounds`; add mastery answers to the recent-answers exclude list |
| `apps/api/src/services/quiz/guess-who-provider.ts` | Add `era` to LLM prompt JSON shape; add `buildGuessWhoMasteryQuestion` function |
| `apps/api/src/services/quiz/config.ts` | Add `freeTextXpBonus`, `difficultyBump` settings, `freeTextUnlockThreshold` |
| `apps/api/src/services/quiz/index.ts` | Re-export new functions from mastery-keys, mastery-provider, difficulty-bump |
| `apps/mobile/src/hooks/use-coaching-card.ts` | Add `useMarkQuizDiscoverySurfaced` mutation hook |
| `apps/mobile/src/hooks/use-quiz.ts` | Add `useRoundDetail` query hook |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | Wire mark-surfaced mutation on quiz discovery card tap and dismiss |
| `apps/mobile/src/app/(app)/quiz/play.tsx` | Render text input for `freeTextEligible` questions |
| `apps/mobile/src/app/(app)/quiz/launch.tsx` | Show challenge banner when `difficultyBump === true` |
| `apps/mobile/src/app/(app)/quiz/results.tsx` | Add "View history" secondary action |
| `apps/mobile/src/app/(app)/practice.tsx` | Add "History" link; show personal best with `bestConsecutive` |

---

## Phase 4B: Surfacing + Mastery Foundation

### Task 1: Mastery Item Key Generation

Pure functions for computing deterministic mastery keys. No DB, no side effects.

**Files:**
- Create: `apps/api/src/services/quiz/mastery-keys.ts`
- Test: `apps/api/src/services/quiz/mastery-keys.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/services/quiz/mastery-keys.test.ts
import {
  computeCapitalsItemKey,
  computeGuessWhoItemKey,
  bucketEra,
  normalizeName,
  stripDiacritics,
} from './mastery-keys';

describe('mastery-keys', () => {
  describe('stripDiacritics', () => {
    it('removes diacritical marks', () => {
      expect(stripDiacritics('René')).toBe('Rene');
      expect(stripDiacritics('Dvořák')).toBe('Dvorak');
    });

    it('leaves ASCII unchanged', () => {
      expect(stripDiacritics('Newton')).toBe('Newton');
    });
  });

  describe('normalizeName', () => {
    it('lowercases, trims, and strips diacritics', () => {
      expect(normalizeName(' René Descartes ')).toBe('rene descartes');
    });
  });

  describe('bucketEra', () => {
    it('maps century strings', () => {
      expect(bucketEra('17th century')).toBe('17c');
      expect(bucketEra('1st century')).toBe('1c');
    });

    it('maps decade-style strings', () => {
      expect(bucketEra('1600s')).toBe('17c');
      expect(bucketEra('1900s')).toBe('20c');
    });

    it('maps range-style strings', () => {
      expect(bucketEra('1600-1699')).toBe('17c');
    });

    it('maps BCE century strings', () => {
      expect(bucketEra('5th century bce')).toBe('bce-5c');
    });

    it('returns unknown for null/undefined/unparseable', () => {
      expect(bucketEra(null)).toBe('unknown');
      expect(bucketEra(undefined)).toBe('unknown');
      expect(bucketEra('long ago')).toBe('unknown');
    });
  });

  describe('computeCapitalsItemKey', () => {
    it('lowercases and trims', () => {
      expect(computeCapitalsItemKey(' Slovakia ')).toBe('slovakia');
      expect(computeCapitalsItemKey('GERMANY')).toBe('germany');
    });
  });

  describe('computeGuessWhoItemKey', () => {
    it('produces 16-char hex hash', () => {
      const key = computeGuessWhoItemKey('Isaac Newton', '17th century');
      expect(key).toHaveLength(16);
      expect(key).toMatch(/^[0-9a-f]{16}$/);
    });

    it('17th century / 1600s / 1600-1699 all hash to same key', () => {
      const a = computeGuessWhoItemKey('Isaac Newton', '17th century');
      const b = computeGuessWhoItemKey('Isaac Newton', '1600s');
      const c = computeGuessWhoItemKey('Isaac Newton', '1600-1699');
      expect(a).toBe(b);
      expect(b).toBe(c);
    });

    it('diacritics do not affect hash', () => {
      const a = computeGuessWhoItemKey('René Descartes', '17th century');
      const b = computeGuessWhoItemKey('Rene Descartes', '17th century');
      expect(a).toBe(b);
    });

    it('different eras produce different keys', () => {
      const a = computeGuessWhoItemKey('Plato', '5th century bce');
      const b = computeGuessWhoItemKey('Plato', '4th century bce');
      expect(a).not.toBe(b);
    });

    it('missing era maps to unknown bucket', () => {
      const a = computeGuessWhoItemKey('Someone', null);
      const b = computeGuessWhoItemKey('Someone', undefined);
      expect(a).toBe(b);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest mastery-keys.test --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement mastery-keys.ts**

```typescript
// apps/api/src/services/quiz/mastery-keys.ts
import { createHash } from 'crypto';

/**
 * Era bucket lookup — normalizes various era string formats to a stable
 * century token for deterministic hashing. The LLM may return "17th century",
 * "1600s", or "1600-1699" — all must produce the same key.
 */
const ERA_BUCKETS: Record<string, string> = {
  '1st century': '1c',
  '2nd century': '2c',
  '3rd century': '3c',
  '4th century': '4c',
  '5th century': '5c',
  '6th century': '6c',
  '7th century': '7c',
  '8th century': '8c',
  '9th century': '9c',
  '10th century': '10c',
  '11th century': '11c',
  '12th century': '12c',
  '13th century': '13c',
  '14th century': '14c',
  '15th century': '15c',
  '16th century': '16c',
  '17th century': '17c',
  '18th century': '18c',
  '19th century': '19c',
  '20th century': '20c',
  '21st century': '21c',
  '1600s': '17c',
  '1700s': '18c',
  '1800s': '19c',
  '1900s': '20c',
  '2000s': '21c',
  '1600-1699': '17c',
  '1700-1799': '18c',
  '1800-1899': '19c',
  '1900-1999': '20c',
  '1st century bce': 'bce-1c',
  '2nd century bce': 'bce-2c',
  '3rd century bce': 'bce-3c',
  '4th century bce': 'bce-4c',
  '5th century bce': 'bce-5c',
};

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeName(name: string): string {
  return stripDiacritics(name).toLowerCase().trim();
}

export function bucketEra(era: string | null | undefined): string {
  if (!era) return 'unknown';
  const normalized = era.toLowerCase().trim();
  return ERA_BUCKETS[normalized] ?? 'unknown';
}

export function computeGuessWhoItemKey(
  name: string,
  era: string | null | undefined
): string {
  const normalized = normalizeName(name);
  const bucket = bucketEra(era);
  const hash = createHash('sha1')
    .update(`${normalized}|${bucket}`)
    .digest('hex');
  return hash.slice(0, 16);
}

export function computeCapitalsItemKey(country: string): string {
  return country.toLowerCase().trim();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest mastery-keys.test --no-coverage`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```
feat(api): add deterministic mastery item key generation [4B.10]
```

---

### Task 2: Schema — `quiz_mastery_items` Table

Drizzle table definition for the new mastery storage. Follows the existing `quizRounds`/`quizMissedItems` pattern in `packages/database/src/schema/quiz.ts`.

**Files:**
- Create: `packages/database/src/schema/quiz-mastery.ts`
- Modify: `packages/database/src/schema/index.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// packages/database/src/schema/quiz-mastery.ts
import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid';
import { profiles } from './profiles';
import { quizActivityTypeEnum } from './quiz';

export const quizMasteryItems = pgTable(
  'quiz_mastery_items',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    activityType: quizActivityTypeEnum('activity_type').notNull(),
    itemKey: text('item_key').notNull(),
    itemAnswer: text('item_answer').notNull(),
    easeFactor: numeric('ease_factor', { precision: 4, scale: 2 })
      .notNull()
      .default('2.5'),
    interval: integer('interval').notNull().default(1),
    repetitions: integer('repetitions').notNull().default(0),
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }).notNull(),
    mcSuccessCount: integer('mc_success_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('uq_quiz_mastery_profile_activity_key').on(
      table.profileId,
      table.activityType,
      table.itemKey
    ),
    index('idx_quiz_mastery_due').on(
      table.profileId,
      table.activityType,
      table.nextReviewAt
    ),
  ]
);
```

> **Note:** `mcSuccessCount` is included now (Phase 5C column) to avoid a second migration later. The column defaults to 0 and is ignored until Phase 5C wiring.

- [ ] **Step 2: Export from schema barrel**

Add to `packages/database/src/schema/index.ts`:

```typescript
export * from './quiz-mastery';
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm run db:generate`

Verify the generated SQL creates the `quiz_mastery_items` table with the unique constraint and index.

- [ ] **Step 4: Apply migration to dev DB**

Run: `pnpm run db:push:dev`

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm exec nx run api:typecheck`
Expected: PASS

- [ ] **Step 6: Document rollback procedure**

If the migration must be rolled back (e.g., fails on staging with a downstream error that cannot be fixed forward):

```sql
-- Forward: the migration generated by Step 3
-- Rollback: drop the table entirely, cascading to any FK references
DROP TABLE IF EXISTS quiz_mastery_items CASCADE;
```

**Data loss on rollback:** All learner SM-2 state for capitals and Guess Who mastery items. Discovery quizzes continue to work unaffected; learners simply lose spaced-repetition scheduling for these activities. No cross-feature impact.

**Rollback decision owner:** Whoever owns the deploy. Record the decision (timestamp, reason) in the deploy log before executing the DROP.

If rollback happens on production and is later reversed (migration re-applied), learners start with empty mastery libraries — their previous progress is unrecoverable without a restored snapshot. For this reason, take a Neon branch snapshot before applying to production.

- [ ] **Step 7: Commit**

```
feat(database): add quiz_mastery_items table with SM-2 columns [4B.4]
```

---

### Task 3: Repository — `quizMasteryItems` Namespace + Mark-Surfaced

Add DB access methods to `createScopedRepository` for mastery items and the mark-surfaced mutation.

**Files:**
- Modify: `packages/database/src/repository.ts`

- [ ] **Step 1: Add imports for new table and operators**

In `packages/database/src/repository.ts`, add `quizMasteryItems` to the import from `./schema/index` and add `lte` to the drizzle-orm import:

```typescript
import { eq, and, desc, sql, lte, type SQL, type Column } from 'drizzle-orm';
// ... in the schema import:
  quizMasteryItems,
```

- [ ] **Step 2: Add `quizMasteryItems` namespace after `quizMissedItems`**

Insert after the `quizMissedItems` namespace (after line 507):

```typescript
    quizMasteryItems: {
      async findDueByActivity(
        activityType: 'capitals' | 'guess_who',
        limit: number
      ) {
        return db.query.quizMasteryItems.findMany({
          where: scopedWhere(
            quizMasteryItems,
            and(
              eq(quizMasteryItems.activityType, activityType),
              lte(quizMasteryItems.nextReviewAt, new Date())
            )
          ),
          orderBy: [quizMasteryItems.nextReviewAt],
          limit,
        });
      },

      async upsertFromCorrectAnswer(values: {
        activityType: 'capitals' | 'guess_who';
        itemKey: string;
        itemAnswer: string;
      }) {
        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + 1);

        const [row] = await db
          .insert(quizMasteryItems)
          .values({
            profileId,
            activityType: values.activityType,
            itemKey: values.itemKey,
            itemAnswer: values.itemAnswer,
            easeFactor: '2.5',
            interval: 1,
            repetitions: 0,
            nextReviewAt: nextReview,
          })
          .onConflictDoNothing({
            target: [
              quizMasteryItems.profileId,
              quizMasteryItems.activityType,
              quizMasteryItems.itemKey,
            ],
          })
          .returning({ id: quizMasteryItems.id });
        return row ?? null;
      },

      async updateSm2(
        itemKey: string,
        activityType: 'capitals' | 'guess_who',
        values: {
          easeFactor: string;
          interval: number;
          repetitions: number;
          nextReviewAt: Date;
        }
      ) {
        return db
          .update(quizMasteryItems)
          .set({
            easeFactor: values.easeFactor,
            interval: values.interval,
            repetitions: values.repetitions,
            nextReviewAt: values.nextReviewAt,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(quizMasteryItems.profileId, profileId),
              eq(quizMasteryItems.activityType, activityType),
              eq(quizMasteryItems.itemKey, itemKey)
            )
          )
          .returning({ id: quizMasteryItems.id });
      },

      async findByKey(
        activityType: 'capitals' | 'guess_who',
        itemKey: string
      ) {
        return db.query.quizMasteryItems.findFirst({
          where: scopedWhere(
            quizMasteryItems,
            and(
              eq(quizMasteryItems.activityType, activityType),
              eq(quizMasteryItems.itemKey, itemKey)
            )
          ),
        });
      },

      async incrementMcSuccessCount(
        itemKey: string,
        activityType: 'capitals' | 'guess_who'
      ) {
        return db
          .update(quizMasteryItems)
          .set({
            mcSuccessCount: sql`${quizMasteryItems.mcSuccessCount} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(quizMasteryItems.profileId, profileId),
              eq(quizMasteryItems.activityType, activityType),
              eq(quizMasteryItems.itemKey, itemKey)
            )
          )
          .returning({ id: quizMasteryItems.id, mcSuccessCount: quizMasteryItems.mcSuccessCount });
      },

      async resetMcSuccessCount(
        itemKey: string,
        activityType: 'capitals' | 'guess_who',
        resetTo: number
      ) {
        return db
          .update(quizMasteryItems)
          .set({
            mcSuccessCount: resetTo,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(quizMasteryItems.profileId, profileId),
              eq(quizMasteryItems.activityType, activityType),
              eq(quizMasteryItems.itemKey, itemKey)
            )
          )
          .returning({ id: quizMasteryItems.id });
      },
    },
```

- [ ] **Step 3: Add `markSurfaced` to `quizMissedItems` namespace**

Add inside the existing `quizMissedItems` block, after `insertMany`:

```typescript
      async markSurfaced(
        activityType: typeof quizMissedItems.$inferSelect['activityType']
      ) {
        const rows = await db
          .update(quizMissedItems)
          .set({ surfaced: true })
          .where(
            and(
              eq(quizMissedItems.profileId, profileId),
              eq(quizMissedItems.activityType, activityType),
              eq(quizMissedItems.surfaced, false)
            )
          )
          .returning({ id: quizMissedItems.id });
        return rows.length;
      },
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm exec nx run api:typecheck && cd packages/database && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat(database): add quizMasteryItems repo namespace + markSurfaced [4B.5, 4B.1]
```

---

### Task 4: Schema Types — Era, Mark-Surfaced Input, Free-Text Eligible

Add Zod schemas and types needed by multiple phases.

**Files:**
- Modify: `packages/schemas/src/quiz.ts`

- [ ] **Step 1: Add `era` to Guess Who LLM and internal schemas**

In `packages/schemas/src/quiz.ts`, add `era` to `guessWhoLlmPersonSchema`:

```typescript
export const guessWhoLlmPersonSchema = z.object({
  canonicalName: z.string(),
  acceptedAliases: z.array(z.string()).min(1),
  era: z.string().optional(),
  clues: z.array(z.string().max(200)).length(5),
  mcFallbackOptions: z.array(z.string()).length(4),
  funFact: z.string().max(200),
});
```

Add `era` to `guessWhoQuestionSchema` (before the `.refine` call):

```typescript
export const guessWhoQuestionSchema = z
  .object({
    type: z.literal('guess_who'),
    canonicalName: z.string(),
    correctAnswer: z.string(),
    acceptedAliases: z.array(z.string()).min(1),
    era: z.string().optional(),
    clues: z.array(z.string().max(200)).length(5),
    mcFallbackOptions: z.array(z.string()).length(4),
    funFact: z.string().max(200),
    isLibraryItem: z.boolean(),
    topicId: z.string().uuid().nullable().optional(),
  })
  .refine((question) => question.correctAnswer === question.canonicalName, {
    message: 'correctAnswer must match canonicalName',
    path: ['correctAnswer'],
  });
```

- [ ] **Step 2: Add `markSurfacedInputSchema`**

Append to `packages/schemas/src/quiz.ts`:

```typescript
export const markSurfacedInputSchema = z.object({
  activityType: quizActivityTypeSchema,
});
export type MarkSurfacedInput = z.infer<typeof markSurfacedInputSchema>;
```

- [ ] **Step 3: Add `freeTextEligible` to client question schemas**

Add to `clientCapitalsQuestionSchema`:

```typescript
  freeTextEligible: z.boolean().optional(),
```

Add to `clientVocabularyQuestionSchema`:

```typescript
  freeTextEligible: z.boolean().optional(),
```

- [ ] **Step 4: Add `difficultyBump` to round response and `bestConsecutive` to stats**

In `quizRoundResponseSchema`, add:

```typescript
  difficultyBump: z.boolean().optional(),
```

In `quizStatsSchema`, add:

```typescript
  bestConsecutive: z.number().int().nonnegative().nullable(),
```

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm exec nx run-many -t typecheck`
Expected: May fail due to downstream consumers of changed types — fix any type errors from the `era` field addition in `guess-who-provider.ts` by adding `era: question.era ?? undefined` to `buildGuessWhoDiscoveryQuestions`.

- [ ] **Step 6: Commit**

```
feat(schemas): add era field, markSurfaced input, freeTextEligible, difficultyBump, bestConsecutive [4B]
```

---

### Task 5: Mark-Surfaced API Endpoint

New endpoint that marks unsurfaced missed items as surfaced for a given profile + activity type.

**Files:**
- Modify: `apps/api/src/routes/quiz.ts`
- Modify: `apps/api/src/services/quiz/index.ts`
- Test: `apps/api/src/services/quiz/complete-round.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test for the service layer**

Add to `apps/api/src/services/quiz/complete-round.test.ts`:

```typescript
describe('getCapitalsSm2Quality', () => {
  // This is tested in Task 7 — placeholder to prove test file works
});
```

> **Note:** The mark-surfaced endpoint is thin — it delegates to `repo.quizMissedItems.markSurfaced`. Route-level testing is deferred to integration tests. The unit test focus is on the pure functions in this task group.

- [ ] **Step 2: Add the endpoint to quiz routes**

In `apps/api/src/routes/quiz.ts`, add the import:

```typescript
import { markSurfacedInputSchema } from '@eduagent/schemas';
```

Add the endpoint before the `.get('/quiz/stats', ...)` chain:

```typescript
  .post('/quiz/missed-items/mark-surfaced', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return validationError(c, 'Request body must be valid JSON');
    }

    const parsed = markSurfacedInputSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(
        c,
        `Invalid input: ${parsed.error.issues[0]?.message ?? 'unknown'}`
      );
    }

    const { createScopedRepository } = await import('@eduagent/database');
    const repo = createScopedRepository(db, profileId);
    const markedCount = await repo.quizMissedItems.markSurfaced(
      parsed.data.activityType
    );

    return c.json({ markedCount }, 200);
  })
```

> **Wait** — the routes file must not import `createScopedRepository` directly (per CLAUDE.md rule). Instead, add a service function.

Actually, looking at the route file again — it already imports functions from `../services/quiz`. Let me add a service function instead.

- [ ] **Step 2 (revised): Add mark-surfaced service function**

Create in `apps/api/src/services/quiz/queries.ts`:

```typescript
export async function markMissedItemsSurfaced(
  db: Database,
  profileId: string,
  activityType: QuizActivityType
): Promise<number> {
  const repo = createScopedRepository(db, profileId);
  return repo.quizMissedItems.markSurfaced(activityType);
}
```

Export from `apps/api/src/services/quiz/index.ts`:

```typescript
export { markMissedItemsSurfaced } from './queries';
```

- [ ] **Step 3: Add the route handler**

In `apps/api/src/routes/quiz.ts`, import:

```typescript
import { markSurfacedInputSchema } from '@eduagent/schemas';
import { markMissedItemsSurfaced } from '../services/quiz';
```

Add the endpoint:

```typescript
  .post('/quiz/missed-items/mark-surfaced', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return validationError(c, 'Request body must be valid JSON');
    }

    const parsed = markSurfacedInputSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(
        c,
        `Invalid input: ${parsed.error.issues[0]?.message ?? 'unknown'}`
      );
    }

    const markedCount = await markMissedItemsSurfaced(
      db,
      profileId,
      parsed.data.activityType
    );

    return c.json({ markedCount }, 200);
  })
```

- [ ] **Step 4: Verify typecheck + lint**

Run: `pnpm exec nx run api:typecheck && pnpm exec nx run api:lint`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat(api): add POST /quiz/missed-items/mark-surfaced endpoint [4B.1]
```

---

### Task 6: Mark-Surfaced Client Hook + Home Screen Wiring

Mobile hook for the mark-surfaced mutation, wired to the home screen quiz discovery card.

**Files:**
- Modify: `apps/mobile/src/hooks/use-coaching-card.ts`
- Modify: `apps/mobile/src/components/home/LearnerScreen.tsx`
- Test: `apps/mobile/src/hooks/use-coaching-card.test.ts` (extend existing or create)
- Test: `apps/mobile/src/components/home/LearnerScreen.test.tsx` (extend existing)

- [ ] **Step 1: Add `useMarkQuizDiscoverySurfaced` mutation hook**

In `apps/mobile/src/hooks/use-coaching-card.ts`, add the import and hook:

```typescript
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

// ... existing code ...

export function useMarkQuizDiscoverySurfaced() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (activityType: string) => {
      const res = await client.quiz['missed-items']['mark-surfaced'].$post({
        json: { activityType },
      });
      await assertOk(res);
      return (await res.json()) as { markedCount: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coaching-card'] });
    },
  });
}
```

- [ ] **Step 2: Wire the mutation on LearnerScreen quiz discovery card tap**

In `apps/mobile/src/components/home/LearnerScreen.tsx`:

1. Import the hook:
```typescript
import { useQuizDiscoveryCard, useMarkQuizDiscoverySurfaced } from '../../hooks/use-coaching-card';
```

2. In the component body, add:
```typescript
const markSurfaced = useMarkQuizDiscoverySurfaced();
```

3. In the quiz discovery card's `onPress`, fire the mutation before navigating:
```typescript
onPress: () => {
  markSurfaced.mutate(quizDiscovery.activityType);
  router.push({ pathname: '/(app)/quiz', params: { activityType: quizDiscovery.activityType } });
},
```

> **Design note:** The mutation is fire-and-forget — navigation proceeds immediately. If the mutation fails, the card reappears next session (correct fallback per spec §6).

- [ ] **Step 3: Add a test for mark-surfaced firing on card tap**

In `apps/mobile/src/components/home/LearnerScreen.test.tsx`, find or add a test:

```typescript
it('fires mark-surfaced when quiz_discovery card is tapped', async () => {
  // Setup: mock coaching card response with quiz_discovery type
  // Assert: after pressing the card, the mutation was called with the activity type
});
```

> **Implementer note:** Follow the existing mock pattern in `LearnerScreen.test.tsx`. The exact mock setup depends on how `useCoachingCard` is already mocked in the test file. Search for `quiz_discovery` in the test file to find existing fixtures.

- [ ] **Step 4: Verify tests + typecheck**

Run: `cd apps/mobile && pnpm exec jest LearnerScreen.test --no-coverage && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat(mobile): wire mark-surfaced mutation to quiz discovery card [4B.2, 4B.3]
```

---

### Task 7: SM-2 Quality Functions + Mastery Provider

Add `getCapitalsSm2Quality`, extract a shared `applyQuizSm2` helper, and build mastery question constructors for capitals and Guess Who.

**Files:**
- Create: `apps/api/src/services/quiz/mastery-provider.ts`
- Create: `apps/api/src/services/quiz/mastery-provider.test.ts`
- Modify: `apps/api/src/services/quiz/complete-round.ts` (add `getCapitalsSm2Quality`)
- Modify: `apps/api/src/services/quiz/complete-round.test.ts` (test it)

- [ ] **Step 1: Add `getCapitalsSm2Quality` to complete-round.ts**

In `apps/api/src/services/quiz/complete-round.ts`, after `getVocabSm2Quality`:

```typescript
export function getCapitalsSm2Quality(correct: boolean): number {
  return correct ? 4 : 1;
}
```

- [ ] **Step 2: Test `getCapitalsSm2Quality`**

In `apps/api/src/services/quiz/complete-round.test.ts`:

```typescript
import { getCapitalsSm2Quality } from './complete-round';

describe('getCapitalsSm2Quality', () => {
  it('returns 4 for correct', () => {
    expect(getCapitalsSm2Quality(true)).toBe(4);
  });

  it('returns 1 for incorrect', () => {
    expect(getCapitalsSm2Quality(false)).toBe(1);
  });
});
```

- [ ] **Step 3: Write mastery-provider tests**

```typescript
// apps/api/src/services/quiz/mastery-provider.test.ts
import {
  buildCapitalsMasteryLibraryItem,
  buildGuessWhoMasteryLibraryItem,
  applyQuizSm2,
} from './mastery-provider';
import type { LibraryItem } from './content-resolver';

describe('mastery-provider', () => {
  describe('buildCapitalsMasteryLibraryItem', () => {
    it('builds a LibraryItem from mastery row data', () => {
      const item = buildCapitalsMasteryLibraryItem({
        itemKey: 'slovakia',
        itemAnswer: 'Bratislava',
      });
      expect(item.question).toBe('slovakia');
      expect(item.answer).toBe('Bratislava');
    });
  });

  describe('buildGuessWhoMasteryLibraryItem', () => {
    it('builds a LibraryItem from mastery row data', () => {
      const item = buildGuessWhoMasteryLibraryItem({
        itemKey: 'abc123def456ab78',
        itemAnswer: 'Isaac Newton',
      });
      expect(item.id).toBe('abc123def456ab78');
      expect(item.answer).toBe('Isaac Newton');
    });
  });

  describe('applyQuizSm2', () => {
    it('applies SM-2 for a new card with quality 3', () => {
      const result = applyQuizSm2(
        { easeFactor: '2.5', interval: 1, repetitions: 0 },
        3
      );
      expect(result.interval).toBe(1);
      expect(result.repetitions).toBe(1);
      expect(Number(result.easeFactor)).toBeCloseTo(2.36, 1);
    });

    it('resets on quality < 3', () => {
      const result = applyQuizSm2(
        { easeFactor: '2.5', interval: 6, repetitions: 3 },
        1
      );
      expect(result.repetitions).toBe(0);
      expect(result.interval).toBe(1);
    });
  });
});
```

- [ ] **Step 4: Implement mastery-provider.ts**

```typescript
// apps/api/src/services/quiz/mastery-provider.ts
import { sm2 } from '@eduagent/retention';
import type { LibraryItem } from './content-resolver';

export interface MasteryRowData {
  itemKey: string;
  itemAnswer: string;
}

export interface MasterySm2Input {
  easeFactor: string;
  interval: number;
  repetitions: number;
}

export interface MasterySm2Result {
  easeFactor: string;
  interval: number;
  repetitions: number;
  nextReviewAt: Date;
}

export function buildCapitalsMasteryLibraryItem(row: MasteryRowData): LibraryItem {
  return {
    id: row.itemKey,
    question: row.itemKey,
    answer: row.itemAnswer,
  };
}

export function buildGuessWhoMasteryLibraryItem(row: MasteryRowData): LibraryItem {
  return {
    id: row.itemKey,
    question: row.itemKey,
    answer: row.itemAnswer,
  };
}

export function applyQuizSm2(
  current: MasterySm2Input,
  quality: number
): MasterySm2Result {
  const result = sm2({
    quality,
    card: {
      easeFactor: Number(current.easeFactor),
      interval: Math.max(1, current.interval),
      repetitions: current.repetitions,
      lastReviewedAt: new Date().toISOString(),
      nextReviewAt: new Date().toISOString(),
    },
  });

  return {
    easeFactor: String(result.card.easeFactor),
    interval: result.card.interval,
    repetitions: result.card.repetitions,
    nextReviewAt: new Date(result.card.nextReviewAt),
  };
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/api && pnpm exec jest mastery-provider.test --no-coverage && pnpm exec jest complete-round.test --no-coverage`
Expected: PASS

- [ ] **Step 6: Export from barrel**

In `apps/api/src/services/quiz/index.ts`, add:

```typescript
export {
  applyQuizSm2,
  buildCapitalsMasteryLibraryItem,
  buildGuessWhoMasteryLibraryItem,
} from './mastery-provider';
export {
  computeCapitalsItemKey,
  computeGuessWhoItemKey,
} from './mastery-keys';
```

- [ ] **Step 7: Commit**

```
feat(api): add SM-2 quality functions and mastery provider [4B.5, 4B.7, 4B.8]
```

---

### Task 8: Content Resolver — Query Due Mastery Items for Capitals + Guess Who

Wire the round generation pipeline to query `quiz_mastery_items` and feed them into the content resolver as library items. Currently only vocabulary has mastery injection.

**Files:**
- Modify: `apps/api/src/services/quiz/queries.ts` (add `getCapitalsMasteryContext`, `getGuessWhoMasteryItems`)
- Modify: `apps/api/src/routes/quiz.ts` (fetch mastery items for capitals/guess_who in `buildAndGenerateRound`)
- Modify: `apps/api/src/services/quiz/generate-round.ts` (inject mastery for guess_who)

- [ ] **Step 1: Add mastery item query in queries.ts**

In `apps/api/src/services/quiz/queries.ts`, add:

```typescript
import { quizMasteryItems } from '@eduagent/database';

export async function getDueMasteryItems(
  db: Database,
  profileId: string,
  activityType: 'capitals' | 'guess_who'
): Promise<LibraryItem[]> {
  const repo = createScopedRepository(db, profileId);
  const rows = await repo.quizMasteryItems.findDueByActivity(activityType, 20);

  return rows.map((row) => ({
    id: row.itemKey,
    question: row.itemKey,
    answer: row.itemAnswer,
  }));
}
```

Add to the exports in `index.ts`:
```typescript
export { getDueMasteryItems } from './queries';
```

- [ ] **Step 2: Wire capitals/guess_who mastery items in buildAndGenerateRound**

In `apps/api/src/routes/quiz.ts`, import `getDueMasteryItems`:

```typescript
import {
  // ... existing imports ...
  getDueMasteryItems,
} from '../services/quiz';
```

In `buildAndGenerateRound`, add mastery item fetching for capitals and guess_who:

```typescript
  if (input.activityType === 'vocabulary') {
    // ... existing vocabulary context fetch ...
  } else if (input.activityType === 'guess_who') {
    const context = await getGuessWhoRoundContext(db, profileId);
    topicTitles = context.topicTitles;
    libraryItems = await getDueMasteryItems(db, profileId, 'guess_who');
  } else if (input.activityType === 'capitals') {
    libraryItems = await getDueMasteryItems(db, profileId, 'capitals');
  }
```

> **Note:** The `else if (input.activityType === 'capitals')` branch currently has no explicit block — it falls through to the `generateQuizRound` call with empty `libraryItems`. Adding this branch fills it.

- [ ] **Step 3: Handle Guess Who mastery question injection in generate-round.ts**

In `apps/api/src/services/quiz/generate-round.ts`, in the `guess_who` branch (around line 437), after building discovery questions, inject mastery:

```typescript
    // After: questions = buildGuessWhoDiscoveryQuestions({ ... });
    // Insert mastery items. Guess Who mastery questions need fresh clues
    // from the LLM — for now, mastery items are injected as-is using a
    // separate LLM call per item (Phase 4B.8 spec: Option B).
    // For v1, mastery items appear as MC-only questions with clues from
    // the original LLM prompt context. Full per-item LLM calls deferred.

    if (plan.masteryItems.length > 0) {
      const masteryQuestions: GuessWhoQuestion[] = plan.masteryItems.map(
        (item) => ({
          type: 'guess_who',
          canonicalName: item.answer,
          correctAnswer: item.answer,
          acceptedAliases: [item.answer],
          clues: [], // Will be populated by mastery LLM call below
          mcFallbackOptions: [item.answer], // Will be populated below
          funFact: '',
          isLibraryItem: true,
        })
      );

      // Generate fresh clues for mastery items via LLM
      for (const mq of masteryQuestions) {
        const cluePrompt = buildGuessWhoMasteryCluePrompt(
          mq.canonicalName,
          ageBracket
        );
        const clueMessages: ChatMessage[] = [
          { role: 'system', content: cluePrompt },
          { role: 'user', content: 'Generate clues for this person.' },
        ];

        try {
          const clueResult = await routeAndCall(clueMessages, 1, {
            ageBracket,
          });
          const clueRaw = clueResult.response.slice(0, 16 * 1024);
          const parsed = guessWhoMasteryClueSchema.parse(
            JSON.parse(extractJsonObject(clueRaw))
          );
          mq.clues = parsed.clues;
          mq.acceptedAliases = parsed.acceptedAliases ?? [mq.canonicalName];
          mq.mcFallbackOptions = parsed.mcFallbackOptions ?? [mq.canonicalName];
        } catch {
          // If LLM fails for this mastery item, skip it — don't block the round
          continue;
        }
      }

      const validMastery = masteryQuestions.filter(
        (mq) => mq.clues.length === 5 && mq.mcFallbackOptions.length === 4
      );
      questions = injectAtRandomPositions(questions, validMastery);
    }
```

> **Implementer note:** `buildGuessWhoMasteryCluePrompt` and `guessWhoMasteryClueSchema` need to be defined. Add them to `guess-who-provider.ts`. The prompt asks the LLM: "Generate 5 progressive clues for [name], plus accepted aliases and 3 distractor names." The schema validates 5 clues + 4 mcFallbackOptions. This is the "Option B" approach from the spec — fresh clues per encounter.

- [ ] **Step 4: Add `buildGuessWhoMasteryCluePrompt` to guess-who-provider.ts**

```typescript
// In apps/api/src/services/quiz/guess-who-provider.ts

import { z } from 'zod';

export const guessWhoMasteryClueSchema = z.object({
  clues: z.array(z.string().max(200)).length(5),
  acceptedAliases: z.array(z.string()).min(1),
  mcFallbackOptions: z.array(z.string()).length(4),
});

export function buildGuessWhoMasteryCluePrompt(
  canonicalName: string,
  ageBracket: AgeBracket
): string {
  const ageLabel = describeAgeBracket(ageBracket);
  return `Generate 5 progressive clues for a Guess Who quiz about "${canonicalName}" for a ${ageLabel} learner.

Rules:
- Clue 1 = hardest (broad context), clue 5 = near-giveaway
- NEVER mention "${canonicalName}" or any common variant in any clue
- Also provide accepted aliases (common names/titles the learner might type)
- Provide exactly 4 mcFallbackOptions: "${canonicalName}" plus 3 plausible distractors from a related domain/era

Respond with ONLY valid JSON:
{
  "clues": ["Clue 1", "Clue 2", "Clue 3", "Clue 4", "Clue 5"],
  "acceptedAliases": ["${canonicalName}", "Alias1"],
  "mcFallbackOptions": ["${canonicalName}", "Distractor1", "Distractor2", "Distractor3"]
}`;
}
```

- [ ] **Step 5: Add era to Guess Who discovery question builder**

In `apps/api/src/services/quiz/guess-who-provider.ts`, update `buildGuessWhoDiscoveryQuestions` to pass through era:

```typescript
export function buildGuessWhoDiscoveryQuestions(validated: {
  questions: ValidatedGuessWhoQuestion[];
}): GuessWhoQuestion[] {
  return validated.questions.map((question) => ({
    type: 'guess_who',
    canonicalName: question.canonicalName,
    correctAnswer: question.canonicalName,
    acceptedAliases: question.acceptedAliases,
    era: question.era,
    clues: question.clues,
    mcFallbackOptions: question.mcFallbackOptions,
    funFact: question.funFact,
    isLibraryItem: false,
  }));
}
```

Update `ValidatedGuessWhoQuestion` to include `era?: string`.

Also update the LLM prompt to request the `era` field in the JSON shape and add `era` to the validation function.

- [ ] **Step 6: Update Guess Who LLM prompt to request era**

In `buildGuessWhoPrompt`, add `era` to the JSON shape example:

```json
{
  "theme": "Theme Name",
  "questions": [
    {
      "canonicalName": "Isaac Newton",
      "era": "17th century",
      "acceptedAliases": ["Newton", "Sir Isaac Newton"],
      "clues": ["Clue 1", "Clue 2", "Clue 3", "Clue 4", "Clue 5"],
      "mcFallbackOptions": ["Isaac Newton", "Albert Einstein", "Galileo Galilei", "Nikola Tesla"],
      "funFact": "One short fact."
    }
  ]
}
```

And add to the rules: `- Include the person's era or century (e.g. "17th century", "19th century", "5th century BCE").`

- [ ] **Step 7: Add mastery item answers to the exclude list**

In `apps/api/src/routes/quiz.ts`, within `buildAndGenerateRound`, after fetching mastery items, add their answers to `recentAnswers`:

```typescript
  // After fetching libraryItems for any activity type:
  const masteryAnswers = libraryItems.map((item) => item.answer);
  const combinedRecentAnswers = [...recentAnswers, ...masteryAnswers];
```

Pass `combinedRecentAnswers` instead of `recentAnswers` to `generateQuizRound`.

- [ ] **Step 8: Verify typecheck + related tests**

Run: `pnpm exec nx run api:typecheck && cd apps/api && pnpm exec jest --findRelatedTests src/services/quiz/generate-round.ts src/services/quiz/queries.ts src/routes/quiz.ts --no-coverage`
Expected: PASS

- [ ] **Step 9: Commit**

```
feat(api): wire mastery items into round generation for capitals + guess_who [4B.6, 4B.7, 4B.8, 4B.11]
```

---

### Task 9: Complete Round — SM-2 Updates for Mastery Questions

Wire the round completion path to update `quiz_mastery_items` with SM-2 results and to upsert new items from correct discovery answers.

**Files:**
- Modify: `apps/api/src/services/quiz/complete-round.ts`
- Test: `apps/api/src/services/quiz/complete-round.test.ts`

- [ ] **Step 1: Write test for mastery upsert on correct discovery answer**

In `complete-round.test.ts`, this is a pure-function test for the quality mappers. The actual upsert/SM-2 update involves DB — covered by integration tests. Focus on the quality functions here:

```typescript
import { getGuessWhoSm2Quality, getCapitalsSm2Quality } from './complete-round';

describe('SM-2 quality mappers', () => {
  describe('getCapitalsSm2Quality', () => {
    it('returns 4 for correct', () => {
      expect(getCapitalsSm2Quality(true)).toBe(4);
    });
    it('returns 1 for incorrect', () => {
      expect(getCapitalsSm2Quality(false)).toBe(1);
    });
  });

  describe('getGuessWhoSm2Quality', () => {
    it('returns 5 for free-text correct with 1-2 clues', () => {
      expect(getGuessWhoSm2Quality(true, 1, 'free_text')).toBe(5);
      expect(getGuessWhoSm2Quality(true, 2, 'free_text')).toBe(5);
    });
    it('returns 3 for free-text correct with 3-4 clues', () => {
      expect(getGuessWhoSm2Quality(true, 3, 'free_text')).toBe(3);
      expect(getGuessWhoSm2Quality(true, 4, 'free_text')).toBe(3);
    });
    it('returns 2 for MC correct', () => {
      expect(getGuessWhoSm2Quality(true, 5, 'multiple_choice')).toBe(2);
    });
    it('returns 1 for wrong', () => {
      expect(getGuessWhoSm2Quality(false, 1, 'free_text')).toBe(1);
    });
  });
});
```

- [ ] **Step 2: Add mastery wiring to `completeQuizRound`**

In `apps/api/src/services/quiz/complete-round.ts`, add imports:

```typescript
import { applyQuizSm2 } from './mastery-provider';
import { computeCapitalsItemKey, computeGuessWhoItemKey } from './mastery-keys';
import type { GuessWhoQuestion, CapitalsQuestion } from '@eduagent/schemas';
```

After the vocabulary SM-2 block (line ~276) and before the missed-items insert, add the mastery wiring:

```typescript
    // --- Mastery: capitals + guess_who ---
    if (round.activityType === 'capitals' || round.activityType === 'guess_who') {
      const libraryIndices = Array.isArray(round.libraryQuestionIndices)
        ? (round.libraryQuestionIndices as number[])
        : [];

      // 1. SM-2 update for mastery questions (isLibraryItem: true)
      for (const index of libraryIndices) {
        const question = questions[index];
        if (!question) continue;

        const result = validatedResults.find(
          (entry) => entry.questionIndex === index
        );
        if (!result) continue;

        let quality: number;
        let itemKey: string;

        if (question.type === 'capitals') {
          quality = getCapitalsSm2Quality(result.correct);
          itemKey = computeCapitalsItemKey(question.country);
        } else if (question.type === 'guess_who') {
          quality = getGuessWhoSm2Quality(
            result.correct,
            result.cluesUsed ?? 5,
            result.answerMode ?? 'multiple_choice'
          );
          itemKey = computeGuessWhoItemKey(
            question.canonicalName,
            (question as GuessWhoQuestion).era
          );
        } else {
          continue;
        }

        const existing = await txRepo.quizMasteryItems.findByKey(
          round.activityType as 'capitals' | 'guess_who',
          itemKey
        );
        if (existing) {
          const sm2Result = applyQuizSm2(
            {
              easeFactor: String(existing.easeFactor),
              interval: existing.interval,
              repetitions: existing.repetitions,
            },
            quality
          );
          await txRepo.quizMasteryItems.updateSm2(
            itemKey,
            round.activityType as 'capitals' | 'guess_who',
            sm2Result
          );
        }
      }

      // 2. Upsert new mastery items from correct discovery answers
      for (const result of validatedResults) {
        if (!result.correct) continue;
        const question = questions[result.questionIndex];
        if (!question || question.isLibraryItem) continue;

        let itemKey: string;
        let itemAnswer: string;

        if (question.type === 'capitals') {
          itemKey = computeCapitalsItemKey(question.country);
          itemAnswer = question.correctAnswer;
        } else if (question.type === 'guess_who') {
          itemKey = computeGuessWhoItemKey(
            question.canonicalName,
            (question as GuessWhoQuestion).era
          );
          itemAnswer = question.canonicalName;
        } else {
          continue;
        }

        try {
          await txRepo.quizMasteryItems.upsertFromCorrectAnswer({
            activityType: round.activityType as 'capitals' | 'guess_who',
            itemKey,
            itemAnswer,
          });
        } catch (err) {
          // Emit metric but don't block round completion
          logger.error('quiz_mastery_item.upsert.failure', {
            profileId,
            roundId,
            itemKey,
            error: err instanceof Error ? err.message : 'unknown',
          });
        }
      }
    }
```

- [ ] **Step 3: Add logger import**

At the top of `complete-round.ts`:

```typescript
import { createLogger } from '../logger';

const logger = createLogger();
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd apps/api && pnpm exec jest complete-round.test --no-coverage && pnpm exec nx run api:typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat(api): wire SM-2 mastery updates + discovery upsert in completeQuizRound [4B.9]
```

---

### Task 10: Backfill Migration for Existing Missed Items

Mark all pre-existing `quiz_missed_items` as surfaced to prevent the first card tap from sweeping hundreds of historical items.

**Files:**
- Migration SQL (generated by drizzle-kit or hand-written)

- [ ] **Step 1: Record the pre-backfill baseline**

Before running the backfill, capture the count of rows that will be affected. This baseline is what you verify against in Step 4.

For dev:
```bash
doppler run -- psql $DATABASE_URL -c "SELECT COUNT(*) FROM quiz_missed_items WHERE surfaced = false;"
```

Record the number. If it is 0, either the dev DB has no missed-item data (skip — there's nothing to backfill) or the column was already populated somehow (investigate before proceeding).

- [ ] **Step 2: Create the backfill migration**

This is a data migration, not a schema migration. Create a new SQL file in `apps/api/drizzle/`:

```sql
-- Backfill: mark all existing quiz_missed_items as surfaced.
-- New items created after this deploy participate in the new surfacing mechanic.
UPDATE quiz_missed_items
SET surfaced = true
WHERE surfaced = false;
```

> **Implementer note:** If using drizzle-kit's migration system, this may need to be added as a custom SQL migration. Check how the project handles data migrations (some projects add them as separate files alongside schema migrations). The specific file name will be auto-generated or follow the project's naming convention.

- [ ] **Step 3: Apply to dev**

Run: `pnpm run db:push:dev`

- [ ] **Step 4: Verify the backfill worked**

Run the post-backfill query:
```bash
doppler run -- psql $DATABASE_URL -c "SELECT COUNT(*) FROM quiz_missed_items WHERE surfaced = false;"
```

**Expected:** 0. Any other value means the backfill did not run to completion — do not proceed to staging.

Also run a sanity count to confirm nothing was deleted:
```bash
doppler run -- psql $DATABASE_URL -c "SELECT COUNT(*) FROM quiz_missed_items;"
```

Record this count. It should equal (pre-backfill total rows), unchanged. The backfill only flips a flag; it does not remove rows.

- [ ] **Step 5: Write an integration test**

Add to `apps/api/src/services/quiz/mark-surfaced.integration.test.ts` (or wherever quiz integration tests live):

```typescript
describe('quiz_missed_items backfill', () => {
  it('leaves no unsurfaced rows after backfill has been applied', async () => {
    const unsurfacedCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(quizMissedItems)
      .where(eq(quizMissedItems.surfaced, false));

    expect(unsurfacedCount[0].count).toBe(0);
  });
});
```

Note: this test only makes sense if the backfill has been applied to the test DB. If the test DB is created fresh from migrations, this test will pass trivially. It is primarily a guard for staging/production.

- [ ] **Step 6: Rollback procedure (document — do not execute)**

If the backfill needs to be undone for any reason, the inverse is:

```sql
-- DESTRUCTIVE — only run if you have a way to know which rows to flip back.
-- Without a backup snapshot, you cannot distinguish "backfilled" from "legitimately surfaced via user action post-deploy."
-- Best rollback: restore from pre-backfill snapshot, not an UPDATE statement.
```

Practical rollback plan: take a Neon branch snapshot of `mentomate-api-stg` (and prod) immediately before running the backfill on each environment. If rollback is needed, restore the branch. Do not attempt an UPDATE-based rollback — by the time you roll back, some rows will have been legitimately surfaced by user action and you cannot tell them apart.

- [ ] **Step 7: Commit**

```
chore(api): backfill existing quiz_missed_items as surfaced [4B.0]
```

---

## Phase 5A: Difficulty Adaptation

### Task 11: Difficulty Bump Check

Pure query-based check: 3 consecutive perfect rounds within 14 days triggers a bump.

**Files:**
- Create: `apps/api/src/services/quiz/difficulty-bump.ts`
- Create: `apps/api/src/services/quiz/difficulty-bump.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/services/quiz/difficulty-bump.test.ts
import { shouldApplyDifficultyBump } from './difficulty-bump';
import type { QuizRoundStatus } from '@eduagent/schemas';

interface MockRound {
  score: number | null;
  total: number;
  status: QuizRoundStatus;
  completedAt: Date | null;
}

describe('shouldApplyDifficultyBump', () => {
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

  function perfect(daysBack: number): MockRound {
    return {
      score: 8,
      total: 8,
      status: 'completed',
      completedAt: daysAgo(daysBack),
    };
  }

  function imperfect(daysBack: number): MockRound {
    return {
      score: 6,
      total: 8,
      status: 'completed',
      completedAt: daysAgo(daysBack),
    };
  }

  it('returns true for 3 consecutive perfect rounds within 14 days', () => {
    expect(shouldApplyDifficultyBump([perfect(1), perfect(3), perfect(5)])).toBe(true);
  });

  it('returns false when fewer than 3 rounds exist', () => {
    expect(shouldApplyDifficultyBump([perfect(1), perfect(3)])).toBe(false);
    expect(shouldApplyDifficultyBump([perfect(1)])).toBe(false);
    expect(shouldApplyDifficultyBump([])).toBe(false);
  });

  it('returns false when any of the last 3 is non-perfect', () => {
    expect(
      shouldApplyDifficultyBump([perfect(1), imperfect(3), perfect(5)])
    ).toBe(false);
  });

  it('returns false when rounds are older than 14 days', () => {
    expect(
      shouldApplyDifficultyBump([perfect(1), perfect(3), perfect(20)])
    ).toBe(false);
  });

  it('only checks the last 3 rounds, not all rounds', () => {
    expect(
      shouldApplyDifficultyBump([
        perfect(1),
        perfect(2),
        perfect(3),
        imperfect(10),
      ])
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest difficulty-bump.test --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement difficulty-bump.ts**

```typescript
// apps/api/src/services/quiz/difficulty-bump.ts

const REQUIRED_PERFECT_STREAK = 3;
const MAX_AGE_DAYS = 14;

interface CompletedRound {
  score: number | null;
  total: number;
  completedAt: Date | null;
}

export function shouldApplyDifficultyBump(
  recentRounds: CompletedRound[]
): boolean {
  if (recentRounds.length < REQUIRED_PERFECT_STREAK) return false;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);

  const last3 = recentRounds.slice(0, REQUIRED_PERFECT_STREAK);

  return last3.every((round) => {
    if (round.score == null || round.completedAt == null) return false;
    if (round.completedAt < cutoff) return false;
    return round.score === round.total;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest difficulty-bump.test --no-coverage`
Expected: PASS

- [ ] **Step 5: Export from barrel + commit**

Add to `apps/api/src/services/quiz/index.ts`:

```typescript
export { shouldApplyDifficultyBump } from './difficulty-bump';
```

```
feat(api): add difficulty bump check — 3 perfect rounds within 14 days [5A.12]
```

---

### Task 12: LLM Prompt Difficulty Hints + Round Response Flag

Wire the bump check into round generation and surface it in the API response.

**Files:**
- Modify: `apps/api/src/services/quiz/queries.ts` (add `getRecentCompletedByActivity`)
- Modify: `apps/api/src/services/quiz/generate-round.ts` (pass bump to prompts)
- Modify: `apps/api/src/routes/quiz.ts` (query recent rounds, surface `difficultyBump`)

- [ ] **Step 1: Add recent-rounds query for bump check**

In `apps/api/src/services/quiz/queries.ts`:

```typescript
export async function getRecentCompletedByActivity(
  db: Database,
  profileId: string,
  activityType: QuizActivityType,
  limit: number
) {
  const repo = createScopedRepository(db, profileId);
  return repo.quizRounds.findRecentByActivity(activityType, limit);
}
```

- [ ] **Step 2: Wire bump check in buildAndGenerateRound**

In `apps/api/src/routes/quiz.ts`:

```typescript
import { shouldApplyDifficultyBump, getRecentCompletedByActivity } from '../services/quiz';
```

In `buildAndGenerateRound`, before `return generateQuizRound(...)`:

```typescript
  const recentForBump = await getRecentCompletedByActivity(
    db,
    profileId,
    input.activityType,
    3
  );
  const completedForBump = recentForBump
    .filter((r) => r.status === 'completed')
    .map((r) => ({
      score: r.score,
      total: r.total,
      completedAt: r.completedAt,
    }));
  const difficultyBump = shouldApplyDifficultyBump(completedForBump);
```

Pass `difficultyBump` to `generateQuizRound` params and include in the response.

- [ ] **Step 3: Add difficulty hints to LLM prompts**

In `generate-round.ts`, add bump-specific suffix to prompts when `difficultyBump` is true:

```typescript
const bumpSuffix = difficultyBump
  ? '\n\nDIFFICULTY BUMP: The learner is on a streak. Make questions harder.'
  : '';
```

Per activity:
- Capitals: append `"Choose lesser-known countries. Distractors should be from the same region as the correct answer."`
- Vocabulary: bump `cefrCeiling` by +1 level using `nextCefrLevel`
- Guess Who: append `"Choose less famous historical figures. Make clue 1 and 2 significantly harder."`

- [ ] **Step 4: Surface `difficultyBump` in round response**

In `apps/api/src/routes/quiz.ts`, in the `POST /quiz/rounds` handler:

```typescript
    return c.json(
      {
        id: result.round.id,
        activityType: result.input.activityType,
        theme: result.round.theme,
        questions: toClientSafeQuestions(result.round.questions as QuizQuestion[]),
        total: result.round.total,
        difficultyBump: result.difficultyBump,
      },
      200
    );
```

- [ ] **Step 5: Verify typecheck + tests**

Run: `pnpm exec nx run api:typecheck && cd apps/api && pnpm exec jest --findRelatedTests src/routes/quiz.ts --no-coverage`
Expected: PASS

- [ ] **Step 6: Commit**

```
feat(api): wire difficulty bump to LLM prompts and round response [5A.13, 5A.14a]
```

---

### Task 13: Client Challenge Banner

Show a pre-round banner when `difficultyBump` is true.

**Banner requirements (all four MUST be implemented — matches spec § 4a):**

- [x] Appears when `round.difficultyBump === true`, before the first question
- [x] Non-dismissible (no dismiss button, no tap-to-close handler)
- [x] Auto-hides after 3 seconds OR when the learner answers/advances past the first question, whichever comes first
- [x] Uses semantic color tokens only (`bg-primary-soft`, `text-on-surface`) — never hardcoded hex
- [x] Accessible: `accessibilityRole="alert"` + screen-reader label

**Files:**
- Modify: `apps/mobile/src/app/(app)/quiz/play.tsx`
- Test: `apps/mobile/src/app/(app)/quiz/play.test.tsx` (extend or create)

- [ ] **Step 1: Add banner to the play screen**

The banner appears on the `play.tsx` screen, rendered above the first question. In `apps/mobile/src/app/(app)/quiz/play.tsx`:

```typescript
const [showBanner, setShowBanner] = useState(
  () => round?.difficultyBump === true
);

// Auto-hide after 3 seconds
useEffect(() => {
  if (!showBanner) return;
  const timer = setTimeout(() => setShowBanner(false), 3000);
  return () => clearTimeout(timer);
}, [showBanner]);

// Also hide once the learner advances past the first question
useEffect(() => {
  if (questionIndex > 0 && showBanner) {
    setShowBanner(false);
  }
}, [questionIndex, showBanner]);
```

Render the banner above the question when `showBanner` is true:

```tsx
{showBanner && (
  <View
    testID="quiz-challenge-banner"
    className="bg-primary-soft mx-4 mb-4 rounded-xl p-4"
    accessibilityRole="alert"
    accessibilityLiveRegion="polite"
    accessibilityLabel="Challenge round. This round is harder than usual."
  >
    <Text className="text-on-surface text-center text-lg font-semibold">
      🔥 Challenge round — you're on a streak! This one is harder.
    </Text>
  </View>
)}
```

**Notes:**
- The emoji is intentional and matches the spec's banner copy. If the design system forbids emojis in alert banners, replace with a themed icon component and update the accessibilityLabel to describe the icon.
- `accessibilityLiveRegion="polite"` ensures screen readers announce the banner without interrupting other speech.

- [ ] **Step 2: Write tests**

```typescript
it('shows challenge banner when difficultyBump is true', () => {
  // Render with a round that has difficultyBump: true
  // Assert: testID="quiz-challenge-banner" is present
  // Assert: accessibilityRole === "alert"
  // Assert: accessibilityLabel matches the spec copy
});

it('does NOT show banner when difficultyBump is false', () => {
  // Render with difficultyBump: false
  // Assert: testID="quiz-challenge-banner" is not present
});

it('hides challenge banner after 3 seconds', async () => {
  jest.useFakeTimers();
  // Render with bump
  // Advance timers by 3000ms
  // Assert: banner no longer visible
});

it('hides banner when learner advances past first question', async () => {
  // Render with bump at questionIndex=0
  // Rerender at questionIndex=1
  // Assert: banner no longer visible
});

it('banner has no dismiss button (non-dismissible by design)', () => {
  // Render with bump
  // Assert: no testID="quiz-challenge-banner-dismiss" or similar
  // Assert: banner View has no onPress handler
});
```

- [ ] **Step 3: Run tests + typecheck**

Run: `cd apps/mobile && pnpm exec jest play.test --no-coverage && pnpm exec tsc --noEmit`

- [ ] **Step 4: Commit**

```
feat(mobile): show challenge round banner on difficulty bump [5A.14b]
```

---

## Phase 5B: Round History

### Task 14: Round Detail Endpoint — Expose Answers for Completed Rounds

Modify `GET /quiz/rounds/:id` to include `correctAnswer` when the round is completed.

**Files:**
- Modify: `apps/api/src/routes/quiz.ts`

- [ ] **Step 1: Write the break test (integration)**

> **Implementer note:** This break test requires a real DB (integration test). Add to the relevant quiz integration test file. The test must:
> 1. Create an active round
> 2. `GET /quiz/rounds/:id` → assert `correctAnswer` is ABSENT from every question
> 3. Complete the round
> 4. `GET /quiz/rounds/:id` → assert `correctAnswer` is PRESENT on every question

- [ ] **Step 2: Modify the `GET /quiz/rounds/:id` handler**

In `apps/api/src/routes/quiz.ts`, update the handler:

```typescript
  .get('/quiz/rounds/:id', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const roundId = c.req.param('id');

    const round = await getRoundByIdOrThrow(db, profileId, roundId);
    const questions = round.questions as QuizQuestion[];

    if (round.status === 'completed') {
      // Completed round: include correctAnswer per question (answers already
      // revealed during play). Safe because the round is finished.
      return c.json(
        {
          id: round.id,
          activityType: round.activityType,
          theme: round.theme,
          status: round.status,
          score: round.score,
          total: round.total,
          xpEarned: round.xpEarned,
          completedAt: round.completedAt?.toISOString(),
          questions: questions.map((q) => ({
            ...toClientSafeQuestions([q])[0],
            correctAnswer: q.correctAnswer,
          })),
          results: round.results,
        },
        200
      );
    }

    // Active/abandoned round: strip answers as before
    return c.json(
      {
        id: round.id,
        activityType: round.activityType,
        theme: round.theme,
        questions: toClientSafeQuestions(questions),
        total: round.total,
      },
      200
    );
  })
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm exec nx run api:typecheck`

- [ ] **Step 4: Commit**

```
feat(api): expose correctAnswer in completed round detail response [5B.17]
```

---

### Task 15: Round History Screen

New mobile screen showing recent completed rounds grouped by date.

**Files:**
- Create: `apps/mobile/src/app/(app)/quiz/history.tsx`
- Create: `apps/mobile/src/app/(app)/quiz/history.test.tsx`
- Modify: `apps/mobile/src/hooks/use-quiz.ts` (already has `useRecentRounds`)

- [ ] **Step 1: Write the test**

```typescript
// apps/mobile/src/app/(app)/quiz/history.test.tsx
import { render, screen } from '@testing-library/react-native';

// Mock dependencies following the pattern in existing quiz screen tests

describe('QuizHistoryScreen', () => {
  it('renders empty state when no rounds', () => {
    // Mock useRecentRounds to return empty array
    // Assert: text "No rounds played yet" visible
    // Assert: CTA to try a quiz visible
  });

  it('renders rounds grouped by date', () => {
    // Mock useRecentRounds with rounds from different dates
    // Assert: date headers visible
    // Assert: score bars visible (e.g. "7/8")
  });
});
```

- [ ] **Step 2: Implement history screen**

```typescript
// apps/mobile/src/app/(app)/quiz/history.tsx
import { View, Text, Pressable, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useRecentRounds } from '../../../hooks/use-quiz';
import { goBackOrReplace } from '../../../lib/navigation';

export default function QuizHistoryScreen() {
  const router = useRouter();
  const { data: rounds, isLoading } = useRecentRounds();

  if (isLoading) {
    return (
      <View testID="quiz-history-loading" className="flex-1 items-center justify-center">
        <Text className="text-on-surface-muted">Loading history...</Text>
      </View>
    );
  }

  if (!rounds || rounds.length === 0) {
    return (
      <View testID="quiz-history-empty" className="flex-1 items-center justify-center p-6">
        <Text className="text-on-surface text-lg font-semibold">
          No rounds played yet
        </Text>
        <Text className="text-on-surface-muted mt-2 text-center">
          Try a quiz to see your history here!
        </Text>
        <Pressable
          testID="quiz-history-try-quiz"
          className="bg-primary mt-4 rounded-xl px-6 py-3"
          onPress={() => router.push('/(app)/quiz')}
        >
          <Text className="text-on-primary font-semibold">Try a Quiz</Text>
        </Pressable>
      </View>
    );
  }

  // Group by date
  const grouped = new Map<string, typeof rounds>();
  for (const round of rounds) {
    const dateKey = round.completedAt.slice(0, 10);
    const group = grouped.get(dateKey) ?? [];
    group.push(round);
    grouped.set(dateKey, group);
  }

  const sections = Array.from(grouped.entries()).map(([date, items]) => ({
    date,
    items,
  }));

  return (
    <View testID="quiz-history-screen" className="flex-1">
      <View className="flex-row items-center p-4">
        <Pressable
          testID="quiz-history-back"
          onPress={() => goBackOrReplace(router, '/(app)/practice')}
        >
          <Text className="text-primary">Back</Text>
        </Pressable>
        <Text className="text-on-surface ml-4 text-xl font-bold">
          Quiz History
        </Text>
      </View>
      <FlatList
        data={sections}
        keyExtractor={(section) => section.date}
        renderItem={({ item: section }) => (
          <View className="mb-4">
            <Text className="text-on-surface-muted px-4 py-2 text-sm font-medium">
              {section.date}
            </Text>
            {section.items.map((round) => (
              <Pressable
                key={round.id}
                testID={`quiz-history-row-${round.id}`}
                className="bg-surface-elevated mx-4 mb-2 rounded-xl p-4"
                onPress={() =>
                  router.push(`/(app)/quiz/${round.id}`)
                }
              >
                <Text className="text-on-surface font-semibold capitalize">
                  {round.activityType.replace('_', ' ')}
                </Text>
                <Text className="text-on-surface-muted text-sm">
                  {round.theme}
                </Text>
                <Text className="text-on-surface mt-1">
                  {round.score}/{round.total} · {round.xpEarned} XP
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      />
    </View>
  );
}
```

- [ ] **Step 3: Run tests + typecheck**

Run: `cd apps/mobile && pnpm exec jest history.test --no-coverage && pnpm exec tsc --noEmit`

- [ ] **Step 4: Commit**

```
feat(mobile): add quiz round history screen [5B.15]
```

---

### Task 16: Round Detail View + Navigation Wiring

Read-only detail view for a completed round showing each question and answer.

**Files:**
- Create: `apps/mobile/src/app/(app)/quiz/[roundId].tsx`
- Create: `apps/mobile/src/app/(app)/quiz/[roundId].test.tsx`
- Modify: `apps/mobile/src/hooks/use-quiz.ts` (add `useRoundDetail`)
- Modify: `apps/mobile/src/app/(app)/quiz/results.tsx` (add "View history" link)
- Modify: `apps/mobile/src/app/(app)/practice.tsx` (add "History" link)

- [ ] **Step 1: Add `useRoundDetail` hook**

In `apps/mobile/src/hooks/use-quiz.ts`:

```typescript
export function useRoundDetail(roundId: string | undefined) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['quiz-round-detail', roundId],
    queryFn: async ({ signal: querySignal }) => {
      if (!roundId) throw new Error('No round ID');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.quiz.rounds[':id'].$get(
          { param: { id: roundId } },
          { init: { signal } }
        );
        await assertOk(res);
        return await res.json();
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!roundId,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Create round detail screen**

```typescript
// apps/mobile/src/app/(app)/quiz/[roundId].tsx
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRoundDetail } from '../../../hooks/use-quiz';
import { goBackOrReplace } from '../../../lib/navigation';

export default function QuizRoundDetailScreen() {
  const { roundId } = useLocalSearchParams<{ roundId: string }>();
  const router = useRouter();
  const { data: round, isLoading, isError } = useRoundDetail(roundId);

  if (isLoading) {
    return (
      <View testID="round-detail-loading" className="flex-1 items-center justify-center">
        <Text className="text-on-surface-muted">Loading...</Text>
      </View>
    );
  }

  if (isError || !round) {
    return (
      <View testID="round-detail-error" className="flex-1 items-center justify-center p-6">
        <Text className="text-on-surface">Couldn't load round details</Text>
        <Pressable
          testID="round-detail-back"
          className="mt-4"
          onPress={() => goBackOrReplace(router, '/(app)/quiz/history')}
        >
          <Text className="text-primary">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const questions = round.questions ?? [];
  const results = (round.results ?? []) as Array<{
    questionIndex: number;
    correct: boolean;
    answerGiven: string;
  }>;

  return (
    <ScrollView testID="round-detail-screen" className="flex-1">
      <View className="p-4">
        <Pressable
          testID="round-detail-back-btn"
          onPress={() => goBackOrReplace(router, '/(app)/quiz/history')}
        >
          <Text className="text-primary">Back</Text>
        </Pressable>

        <Text className="text-on-surface mt-4 text-xl font-bold">
          {round.theme}
        </Text>
        <Text className="text-on-surface-muted capitalize">
          {round.activityType?.replace('_', ' ')} · {round.score}/{round.total}
        </Text>
      </View>

      {questions.map((q: any, i: number) => {
        const result = results.find((r) => r.questionIndex === i);
        return (
          <View
            key={i}
            testID={`round-detail-question-${i}`}
            className="bg-surface-elevated mx-4 mb-3 rounded-xl p-4"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-on-surface font-semibold">
                Q{i + 1}
              </Text>
              <Text
                className={
                  result?.correct ? 'text-success' : 'text-error'
                }
              >
                {result?.correct ? 'Correct' : 'Wrong'}
              </Text>
            </View>

            {q.type === 'capitals' && (
              <Text className="text-on-surface mt-1">
                Capital of {q.country}
              </Text>
            )}
            {q.type === 'vocabulary' && (
              <Text className="text-on-surface mt-1">
                Translate: {q.term}
              </Text>
            )}
            {q.type === 'guess_who' && (
              <Text className="text-on-surface mt-1">
                Guess Who
              </Text>
            )}

            {result && (
              <Text className="text-on-surface-muted mt-1 text-sm">
                Your answer: {result.answerGiven}
              </Text>
            )}
            {q.correctAnswer && (
              <Text className="text-success mt-1 text-sm">
                Correct answer: {q.correctAnswer}
              </Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
```

- [ ] **Step 3: Add "View history" to results screen**

In `apps/mobile/src/app/(app)/quiz/results.tsx`, add a secondary action:

```tsx
<Pressable
  testID="quiz-results-history"
  onPress={() => router.push('/(app)/quiz/history')}
>
  <Text className="text-primary mt-2">View History</Text>
</Pressable>
```

- [ ] **Step 4: Add "History" link to practice menu**

In `apps/mobile/src/app/(app)/practice.tsx`, add below the quiz entry:

```tsx
<Pressable
  testID="practice-quiz-history"
  onPress={() => router.push('/(app)/quiz/history')}
>
  <Text className="text-primary text-sm">History</Text>
</Pressable>
```

- [ ] **Step 5: Write tests**

```typescript
// apps/mobile/src/app/(app)/quiz/[roundId].test.tsx
describe('QuizRoundDetailScreen', () => {
  it('shows correct/incorrect indicators per question', () => {
    // Mock useRoundDetail with completed round data
    // Assert: each question shows correct/wrong badge
  });

  it('shows correct answer for completed rounds', () => {
    // Assert: correctAnswer text is visible
  });
});
```

- [ ] **Step 6: Run tests + typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit && pnpm exec jest --findRelatedTests src/app/\\(app\\)/quiz/\\[roundId\\].tsx --no-coverage`

- [ ] **Step 7: Commit**

```
feat(mobile): add round detail view, history navigation, practice menu link [5B.15, 5B.16, 5B.18]
```

---

## Phase 5C: Free-Text Unlock

### Task 17: Content Resolver Free-Text Eligibility

Mark mastery questions as `freeTextEligible` when `mc_success_count >= 3`.

**Files:**
- Modify: `apps/api/src/services/quiz/content-resolver.ts` (extend `LibraryItem` with `mcSuccessCount`)
- Modify: `apps/api/src/services/quiz/queries.ts` (include `mcSuccessCount` in mastery item query results)
- Modify: `apps/api/src/services/quiz/generate-round.ts` (set `freeTextEligible` on questions)

- [ ] **Step 1: Extend `LibraryItem` interface**

In `apps/api/src/services/quiz/content-resolver.ts`:

```typescript
export interface LibraryItem {
  id: string;
  question: string;
  answer: string;
  topicId?: string;
  vocabularyId?: string;
  cefrLevel?: string | null;
  mcSuccessCount?: number;
}
```

- [ ] **Step 2: Include `mcSuccessCount` in mastery item query**

In `apps/api/src/services/quiz/queries.ts`, update `getDueMasteryItems`:

```typescript
export async function getDueMasteryItems(
  db: Database,
  profileId: string,
  activityType: 'capitals' | 'guess_who'
): Promise<LibraryItem[]> {
  const repo = createScopedRepository(db, profileId);
  const rows = await repo.quizMasteryItems.findDueByActivity(activityType, 20);

  return rows.map((row) => ({
    id: row.itemKey,
    question: row.itemKey,
    answer: row.itemAnswer,
    mcSuccessCount: row.mcSuccessCount,
  }));
}
```

- [ ] **Step 3: Set `freeTextEligible` in mastery question injection**

When building mastery questions in `generate-round.ts`, check:

```typescript
const FREE_TEXT_UNLOCK_THRESHOLD = 3;

// On each mastery question:
const freeTextEligible = (item.mcSuccessCount ?? 0) >= FREE_TEXT_UNLOCK_THRESHOLD;
```

Add `freeTextEligible` to the question object so it flows through `toClientSafeQuestions`.

- [ ] **Step 4: Pass through `freeTextEligible` in `toClientSafeQuestions`**

In `apps/api/src/routes/quiz.ts`, update `toClientSafeQuestions` to preserve `freeTextEligible`:

```typescript
function toClientSafeQuestions(questions: QuizQuestion[]): ClientQuizQuestion[] {
  return questions.map((q): ClientQuizQuestion => {
    if (q.type === 'capitals') {
      return {
        type: 'capitals',
        country: q.country,
        options: shuffle([q.correctAnswer, ...q.distractors]),
        funFact: q.funFact,
        isLibraryItem: q.isLibraryItem,
        topicId: q.topicId,
        freeTextEligible: (q as any).freeTextEligible,
      };
    }
    // ... similar for vocabulary
    // guess_who already supports free text via clue progression
  });
}
```

> **Implementer note:** This requires adding `freeTextEligible` to the internal `CapitalsQuestion` type in `packages/schemas/src/quiz.ts`. Add it as `freeTextEligible?: boolean`.

- [ ] **Step 5: Verify typecheck**

Run: `pnpm exec nx run api:typecheck`

- [ ] **Step 6: Commit**

```
feat(api): mark mastery questions as freeTextEligible when mc_success_count >= 3 [5C.20]
```

---

### Task 18: Client Free-Text Rendering

Render a text input instead of MC options when `freeTextEligible` is true.

**Files:**
- Modify: `apps/mobile/src/app/(app)/quiz/play.tsx`
- Test: `apps/mobile/src/app/(app)/quiz/play.test.tsx` (extend or create)

- [ ] **Step 1: Add free-text input mode to play screen**

In `apps/mobile/src/app/(app)/quiz/play.tsx`, when rendering a capitals or vocabulary question, check `freeTextEligible`:

```tsx
{question.freeTextEligible ? (
  <View testID="quiz-free-text-input">
    <Text className="text-on-surface-muted mb-2 text-sm">Type your answer</Text>
    <TextInput
      testID="quiz-free-text-field"
      className="bg-surface-elevated text-on-surface rounded-xl p-4"
      placeholder="Type your answer..."
      value={freeTextAnswer}
      onChangeText={setFreeTextAnswer}
      autoFocus
      returnKeyType="done"
      onSubmitEditing={() => handleFreeTextSubmit()}
    />
    <Pressable
      testID="quiz-free-text-submit"
      className="bg-primary mt-3 rounded-xl px-6 py-3"
      onPress={() => handleFreeTextSubmit()}
      disabled={!freeTextAnswer.trim()}
    >
      <Text className="text-on-primary text-center font-semibold">Submit</Text>
    </Pressable>
  </View>
) : (
  // Existing MC options rendering
)}
```

- [ ] **Step 2: Add state and handler**

```typescript
const [freeTextAnswer, setFreeTextAnswer] = useState('');

function handleFreeTextSubmit() {
  if (!freeTextAnswer.trim()) return;
  // Call checkAnswer with the free-text answer
  handleAnswer(freeTextAnswer.trim(), 'free_text');
  setFreeTextAnswer('');
}
```

> **Implementer note:** Integrate with the existing `handleAnswer` flow. The `answerMode` should be `'free_text'` so the server can distinguish it for XP bonus and `mc_success_count` tracking.

- [ ] **Step 3: Write test**

```typescript
it('renders TextInput when freeTextEligible is true', () => {
  // Render play screen with a question that has freeTextEligible: true
  // Assert: testID="quiz-free-text-input" is present
  // Assert: MC options are NOT present
});
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd apps/mobile && pnpm exec jest play.test --no-coverage && pnpm exec tsc --noEmit`

- [ ] **Step 5: Commit**

```
feat(mobile): render free-text input for freeTextEligible questions [5C.21]
```

---

### Task 19: Free-Text XP Bonus + MC Success Count Tracking

Award bonus XP for correct free-text answers and track/reset `mc_success_count`.

**Files:**
- Modify: `apps/api/src/services/quiz/complete-round.ts`
- Modify: `apps/api/src/services/quiz/config.ts`
- Test: `apps/api/src/services/quiz/complete-round.test.ts`

- [ ] **Step 1: Add `freeTextXpBonus` to config**

In `apps/api/src/services/quiz/config.ts`, add to the `xp` section:

```typescript
  xp: {
    perCorrect: 10,
    timerBonus: 2,
    perfectBonus: 25,
    guessWhoClueBonus: 3,
    freeTextBonus: 5,
  },
```

- [ ] **Step 2: Add free-text XP bonus to `calculateXp`**

In `complete-round.ts`, update `calculateXp`:

```typescript
  let freeTextBonus = 0;
  if (activityType === 'capitals' || activityType === 'vocabulary') {
    freeTextBonus = correctResults
      .filter((r) => r.answerMode === 'free_text')
      .length * QUIZ_CONFIG.xp.freeTextBonus;
  }

  return baseXp + timerBonus + perfectBonus + guessWhoClueBonus + freeTextBonus;
```

- [ ] **Step 3: Track `mc_success_count` in completeQuizRound**

In the mastery wiring section of `completeQuizRound`, after SM-2 updates:

```typescript
        // Track MC success for free-text unlock progression
        if (result.correct && question.isLibraryItem) {
          if (result.answerMode === 'multiple_choice' || !result.answerMode) {
            await txRepo.quizMasteryItems.incrementMcSuccessCount(
              itemKey,
              round.activityType as 'capitals' | 'guess_who'
            );
          } else if (result.answerMode === 'free_text' && !result.correct) {
            // Wrong free-text resets mc_success_count to 2
            await txRepo.quizMasteryItems.resetMcSuccessCount(
              itemKey,
              round.activityType as 'capitals' | 'guess_who',
              2
            );
          }
        }
```

> **Wait — correction:** The `!result.correct` check above is inside a `result.correct` guard, which is contradictory. Split the logic:

```typescript
        if (question.isLibraryItem) {
          if (result.correct && (result.answerMode === 'multiple_choice' || !result.answerMode)) {
            // MC correct → increment toward free-text unlock
            await txRepo.quizMasteryItems.incrementMcSuccessCount(
              itemKey,
              round.activityType as 'capitals' | 'guess_who'
            );
          } else if (!result.correct && result.answerMode === 'free_text') {
            // Free-text wrong → reset to 2 (one MC success away from re-unlock)
            await txRepo.quizMasteryItems.resetMcSuccessCount(
              itemKey,
              round.activityType as 'capitals' | 'guess_who',
              2
            );
          }
        }
```

- [ ] **Step 4: Write tests**

```typescript
describe('free-text XP bonus', () => {
  it('awards freeTextBonus for free_text correct answers', () => {
    const results = [
      { questionIndex: 0, correct: true, answerGiven: 'Bratislava', timeMs: 3000, answerMode: 'free_text' as const },
    ];
    const xp = calculateXp(results, 1, 'capitals');
    expect(xp).toBe(10 + 2 + 25 + 5); // perCorrect + timerBonus + perfectBonus + freeTextBonus
  });
});
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd apps/api && pnpm exec jest complete-round.test --no-coverage && pnpm exec nx run api:typecheck`

- [ ] **Step 6: Commit**

```
feat(api): free-text XP bonus + mc_success_count tracking [5C.22, 5C.23]
```

---

## Phase 5D: Personal Bests

### Task 20: `bestConsecutive` Stat + Practice Menu Display

Add within-round consecutive correct streak to stats and display on practice menu.

**Files:**
- Modify: `packages/database/src/repository.ts` (extend `aggregateCompletedStats`)
- Modify: `apps/api/src/services/quiz/queries.ts` (compute `bestConsecutive`)
- Modify: `apps/api/src/routes/quiz.ts` (include in response)
- Modify: `apps/mobile/src/app/(app)/practice.tsx` (display)

- [ ] **Step 1: Add `bestConsecutive` computation**

`bestConsecutive` requires iterating the `results` JSONB array per round — this can't be done in a single SQL aggregate. Add a service-level computation.

In `apps/api/src/services/quiz/queries.ts`, update `computeRoundStats`:

```typescript
export async function computeRoundStats(
  db: Database,
  profileId: string
) {
  const repo = createScopedRepository(db, profileId);
  const baseStats = await repo.quizRounds.aggregateCompletedStats();

  // Compute bestConsecutive per activity type by scanning results arrays
  const allRounds = await repo.quizRounds.findMany(
    eq(quizRounds.status, 'completed')
  );

  const consecutiveByActivity = new Map<string, number>();
  for (const round of allRounds) {
    const results = (round.results ?? []) as Array<{ correct: boolean }>;
    let maxStreak = 0;
    let current = 0;
    for (const r of results) {
      current = r.correct ? current + 1 : 0;
      if (current > maxStreak) maxStreak = current;
    }
    const prev = consecutiveByActivity.get(round.activityType) ?? 0;
    if (maxStreak > prev) consecutiveByActivity.set(round.activityType, maxStreak);
  }

  return baseStats.map((stat) => ({
    ...stat,
    bestConsecutive: consecutiveByActivity.get(stat.activityType) ?? null,
  }));
}
```

> **Performance note:** This scans all completed rounds for the profile. For v1 this is fine — a learner won't have more than a few hundred rounds. If this becomes slow, add a materialized `best_consecutive` column to `quiz_rounds` computed at completion time.

- [ ] **Step 2: Update stats route to include `bestConsecutive`**

The route in `quiz.ts` already returns `stats` directly — `bestConsecutive` will flow through.

- [ ] **Step 3: Display on practice menu**

In `apps/mobile/src/app/(app)/practice.tsx`, update the quiz entry rendering:

```tsx
{stats && (
  <Text className="text-on-surface-muted text-sm">
    Best: {stats.bestScore}/{stats.bestTotal}
    {stats.bestConsecutive != null && ` · ${stats.bestConsecutive} streak`}
    {' · '}{stats.roundsPlayed} rounds
  </Text>
)}
```

- [ ] **Step 4: Write test for `bestConsecutive` computation**

```typescript
describe('bestConsecutive in computeRoundStats', () => {
  it('computes within-round only streak', () => {
    // Results: [true, true, true, false, true] → bestConsecutive = 3
  });
});
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm exec nx run api:typecheck && cd apps/mobile && pnpm exec tsc --noEmit`

- [ ] **Step 6: Commit**

```
feat(api,mobile): add bestConsecutive stat to quiz stats + practice menu [5D.24, 5D.25]
```

---

## Phase 5E: Telemetry

Per the project rule *Silent Recovery Without Escalation is Banned* and spec § 9: every fallback and state-changing event emits a structured log so its frequency is queryable in production.

**Implementer note:** Before starting this phase, verify the project's current structured logging pipeline. The tasks below assume a shared logger helper (e.g., `logger.event(name, fields)`). If the project uses a different convention, adapt the call sites to match.

### Task 21: Wire Telemetry Events

**Files:**
- Modify: `apps/api/src/services/quiz/mastery-provider.ts` — upsert success/failure + per-round injection count
- Modify: `apps/api/src/services/quiz/complete-round.ts` — SM-2 update success/failure
- Modify: `apps/api/src/routes/quiz.ts` — mark-surfaced failure
- Modify: `apps/api/src/services/quiz/generate-round.ts` — difficulty_bump.applied
- Modify: `apps/mobile/src/app/(app)/quiz/play.tsx` — free_text.attempted

- [ ] **Step 1: Identify the structured logger**

Grep for existing structured log calls to find the project's convention:
```bash
git grep -n "logger\.\(event\|info\|warn\|error\)" apps/api/src
```

Adopt the dominant pattern. If none exists, use `console.log(JSON.stringify({event, ...fields}))` as a stopgap and add a TODO to migrate once a shared helper lands.

- [ ] **Step 2: Emit mastery upsert events**

In `mastery-provider.ts`, after calling `upsertFromCorrectAnswer`:

```typescript
try {
  const row = await repo.quizMasteryItems.upsertFromCorrectAnswer({...});
  logger.event('quiz_mastery_item.upsert.success', {
    profileId, activityType, itemKey, wasInserted: row !== null,
  });
} catch (err) {
  logger.event('quiz_mastery_item.upsert.failure', {
    profileId, activityType, itemKey, error: err.message,
  });
  throw err;
}
```

- [ ] **Step 3: Emit per-round injection count**

In the content resolver where mastery items are injected into the round, after assembling the question list:

```typescript
logger.event('quiz_mastery_item.injected_per_round', {
  profileId, activityType, roundId,
  injectedCount: masteryQuestions.length,
  totalQuestions: allQuestions.length,
});
```

- [ ] **Step 4: Emit mark-surfaced failure**

In the `POST /quiz/missed-items/mark-surfaced` handler, wrap the mutation:

```typescript
try {
  const result = await repo.quizMissedItems.markSurfaced(activityType);
  return c.json({ markedCount: result.length });
} catch (err) {
  logger.event('quiz_missed_item.mark_surfaced.failure', {
    profileId, activityType, error: err.message,
  });
  throw err; // let the route handler's error middleware return the HTTP status
}
```

- [ ] **Step 5: Emit difficulty bump applied**

In `generate-round.ts`, where `difficultyBump` is passed into the LLM prompt:

```typescript
if (difficultyBump) {
  logger.event('quiz_round.difficulty_bump.applied', {
    profileId, activityType, roundId,
  });
}
```

- [ ] **Step 6: Emit free-text attempted**

In `play.tsx`, when the learner submits a free-text answer:

```typescript
analytics.track('quiz_item.free_text.attempted', {
  activityType, itemKey, correct: isCorrect,
});
```

(Use whatever client-side analytics shim the mobile app already uses — this is distinct from server logger.)

- [ ] **Step 7: Add tests asserting events fire**

For each emit site, add a unit test that mocks the logger and asserts `.event` was called with the expected fields:

```typescript
it('emits quiz_mastery_item.upsert.success on first correct', async () => {
  const spy = jest.spyOn(logger, 'event');
  await handleMasteryUpsert(...);
  expect(spy).toHaveBeenCalledWith(
    'quiz_mastery_item.upsert.success',
    expect.objectContaining({ profileId: 'test-profile', wasInserted: true })
  );
});
```

- [ ] **Step 8: Run tests + lint**

Run: `pnpm exec nx run api:test && pnpm exec nx run api:lint`

- [ ] **Step 9: Commit**

```
feat(api,mobile): emit structured telemetry for quiz mastery + difficulty events [telemetry]
```

> **Note on `quiz_mastery_item.false_positive_rate`:** This metric is *derived* at query time, not emitted. The analysis query is: items where `upsert.success` (`wasInserted: true`) fired AND the first subsequent SM-2 update used a low quality score (≤2). No new code needed — it's a post-hoc query against the existing events.

---

## Verification Checklist

Before declaring any phase complete:

- [ ] `pnpm exec nx run api:typecheck` — PASS
- [ ] `pnpm exec nx run api:lint` — PASS
- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` — PASS
- [ ] `pnpm exec nx lint mobile` — PASS
- [ ] `cd apps/api && pnpm exec jest --no-coverage` — PASS (all quiz tests)
- [ ] `cd apps/mobile && pnpm exec jest --no-coverage` — PASS (all quiz tests)
- [ ] Integration tests for mastery upsert, mark-surfaced, and answer-leak break test — PASS
- [ ] Migration applied to dev DB successfully
- [ ] Backfill Task 10 Step 4 verification query returns 0 unsurfaced rows on dev
- [ ] Telemetry events fire in unit tests (Phase 5E)

### End-to-end journey tests (at least one per phase)

- [ ] **Surfacing:** Tap quiz discovery card → confirm card disappears on next refresh; re-tap path does not recreate the same card for previously-missed items
- [ ] **Mastery:** Answer a discovery capitals question correctly → on next round after 1 day (or with time mocked forward), confirm the same item appears as a library question
- [ ] **Difficulty bump:** Play 3 consecutive perfect capitals rounds → on round 4, confirm the challenge banner renders with correct copy + a11y label
- [ ] **History:** Complete a round → navigate to `/quiz/history` → confirm the just-completed round appears with correct score
- [ ] **Round detail security:** Attempt to fetch an in-progress round via `/quiz/rounds/:id` → confirm `correctAnswer` is absent from response
- [ ] **Free-text unlock:** Manually set `mc_success_count = 3` for a test item → play a round that surfaces that item → confirm text input renders instead of MC options

## Deployment Order

Per `CLAUDE.md` schema safety rules:

1. **Phase 4B migration** (`quiz_mastery_items` table + backfill) → deploy to Neon FIRST
2. **Phase 4B code** → deploy worker after migration lands
3. **Phase 5C migration** (`mc_success_count` already included in Task 2) → no separate migration needed
4. **Phase 5A-5D code** → can deploy in any order after 4B is live

Never use `drizzle-kit push` for staging/production. Use committed SQL + `drizzle-kit migrate`.
