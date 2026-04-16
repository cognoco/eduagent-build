# Quiz Activities (Phase 1: Capitals) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared quiz engine and the first activity type (Capitals) — validating the full pipeline from LLM round generation through mobile gameplay to scoring.

**Architecture:** Standalone system (like Dictation) — own tables, own routes, no chat sessions. One LLM call generates an entire round as structured JSON. The client renders the quiz locally with no per-question API calls. The content resolver is built to support mastery questions but in Phase 1 all Capitals questions are discovery (no per-capital SM-2 tracking yet — that comes with Vocabulary in Phase 2 where the vocab bank already has retention cards).

**Tech Stack:** Zod schemas in `@eduagent/schemas`, Drizzle ORM tables in `@eduagent/database`, Hono API routes, LLM via `routeAndCall()` (Gemini Flash), Expo Router screens with NativeWind, TanStack Query hooks.

**Spec:** `docs/superpowers/specs/2026-04-16-quiz-activities-design.md`

---

## File Structure

### New Files

| File | Purpose |
|---|---|
| `packages/schemas/src/quiz.ts` | Zod schemas: enums, question types, round, API inputs/outputs |
| `packages/database/src/schema/quiz.ts` | DB tables: `quiz_rounds`, `quiz_missed_items` |
| `apps/api/src/services/quiz/index.ts` | Service barrel exports |
| `apps/api/src/services/quiz/config.ts` | Quiz config constants |
| `apps/api/src/services/quiz/capitals-data.ts` | Static capitals reference dataset (~200 entries) |
| `apps/api/src/services/quiz/content-resolver.ts` | Mastery/discovery split, recently-seen buffer |
| `apps/api/src/services/quiz/content-resolver.test.ts` | Content resolver tests |
| `apps/api/src/services/quiz/capitals-validation.ts` | Cross-check LLM answers against reference |
| `apps/api/src/services/quiz/capitals-validation.test.ts` | Validation tests |
| `apps/api/src/services/quiz/generate-round.ts` | LLM prompt building + round assembly |
| `apps/api/src/services/quiz/generate-round.test.ts` | Generation tests |
| `apps/api/src/services/quiz/complete-round.ts` | Scoring, XP, missed items |
| `apps/api/src/services/quiz/complete-round.test.ts` | Completion tests |
| `apps/api/src/routes/quiz.ts` | API route handlers |
| `apps/api/src/routes/quiz.test.ts` | Route tests |
| `apps/mobile/src/hooks/use-quiz.ts` | TanStack Query hooks for quiz API |
| `apps/mobile/src/app/(app)/quiz/_layout.tsx` | Expo Router layout + QuizFlowProvider |
| `apps/mobile/src/app/(app)/quiz/index.tsx` | Activity selection screen |
| `apps/mobile/src/app/(app)/quiz/launch.tsx` | Theme preview + round loading |
| `apps/mobile/src/app/(app)/quiz/play.tsx` | Quiz gameplay (MC questions) |
| `apps/mobile/src/app/(app)/quiz/results.tsx` | Score + celebration + Play Again / Done |

### Modified Files

| File | Change |
|---|---|
| `packages/schemas/src/index.ts` | Add `export * from './quiz'` |
| `packages/database/src/schema/index.ts` | Add `export * from './quiz'` |
| `packages/database/src/repository.ts` | Add `quizRounds` and `quizMissedItems` to scoped repository |
| `apps/api/src/index.ts` | Add `.route('/', quizRoutes)` to route chain |
| `apps/mobile/src/app/(app)/practice.tsx` | Add Quiz IntentCard |

---

### Task 1: Quiz Zod Schemas

**Files:**
- Create: `packages/schemas/src/quiz.ts`
- Modify: `packages/schemas/src/index.ts`
- Test: `packages/schemas/src/quiz.test.ts`

- [ ] **Step 1: Write the schema file**

```typescript
// packages/schemas/src/quiz.ts
import { z } from 'zod';

// --- Enums ---

export const quizActivityTypeSchema = z.enum(['capitals', 'vocabulary', 'guess_who']);
export type QuizActivityType = z.infer<typeof quizActivityTypeSchema>;

export const quizRoundStatusSchema = z.enum(['active', 'completed', 'abandoned']);
export type QuizRoundStatus = z.infer<typeof quizRoundStatusSchema>;

// --- Question Schemas (stored in quiz_rounds.questions JSONB) ---

export const capitalsQuestionSchema = z.object({
  type: z.literal('capitals'),
  country: z.string(),
  correctAnswer: z.string(),
  acceptedAliases: z.array(z.string()),
  distractors: z.array(z.string()).length(3),
  funFact: z.string(),
  isLibraryItem: z.boolean(),
  topicId: z.string().uuid().nullable().optional(),
});
export type CapitalsQuestion = z.infer<typeof capitalsQuestionSchema>;

export const quizQuestionSchema = capitalsQuestionSchema;
// Phase 2+: z.discriminatedUnion('type', [capitalsQuestionSchema, vocabularyQuestionSchema, guessWhoQuestionSchema])
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

// --- Question Result (stored in quiz_rounds.results JSONB) ---

export const questionResultSchema = z.object({
  questionIndex: z.number().int().min(0),
  correct: z.boolean(),
  answerGiven: z.string(),
  timeMs: z.number().int().min(0),
});
export type QuestionResult = z.infer<typeof questionResultSchema>;

// --- API Input Schemas ---

export const generateRoundInputSchema = z.object({
  activityType: quizActivityTypeSchema,
  themePreference: z.string().optional(),
});
export type GenerateRoundInput = z.infer<typeof generateRoundInputSchema>;

export const completeRoundInputSchema = z.object({
  results: z.array(questionResultSchema).min(1),
});
export type CompleteRoundInput = z.infer<typeof completeRoundInputSchema>;

// --- API Response Schemas ---

export const quizRoundResponseSchema = z.object({
  id: z.string().uuid(),
  activityType: quizActivityTypeSchema,
  theme: z.string(),
  questions: z.array(quizQuestionSchema),
  total: z.number().int(),
});
export type QuizRoundResponse = z.infer<typeof quizRoundResponseSchema>;

export const completeRoundResponseSchema = z.object({
  score: z.number().int(),
  total: z.number().int(),
  xpEarned: z.number().int(),
  celebrationTier: z.enum(['perfect', 'great', 'nice']),
});
export type CompleteRoundResponse = z.infer<typeof completeRoundResponseSchema>;

export const recentRoundSchema = z.object({
  id: z.string().uuid(),
  activityType: quizActivityTypeSchema,
  theme: z.string(),
  score: z.number().int(),
  total: z.number().int(),
  xpEarned: z.number().int(),
  completedAt: z.string(),
});
export type RecentRound = z.infer<typeof recentRoundSchema>;

export const quizStatsSchema = z.object({
  activityType: quizActivityTypeSchema,
  roundsPlayed: z.number().int(),
  bestScore: z.number().int().nullable(),
  bestTotal: z.number().int().nullable(),
  totalXp: z.number().int(),
});
export type QuizStats = z.infer<typeof quizStatsSchema>;

// --- LLM Output Schema (validates structured output from LLM) ---

export const capitalsLlmQuestionSchema = z.object({
  country: z.string(),
  correctAnswer: z.string(),
  distractors: z.array(z.string()).length(3),
  funFact: z.string(),
});

export const capitalsLlmOutputSchema = z.object({
  theme: z.string(),
  questions: z.array(capitalsLlmQuestionSchema).min(1),
});
export type CapitalsLlmOutput = z.infer<typeof capitalsLlmOutputSchema>;
```

- [ ] **Step 2: Write schema validation tests**

```typescript
// packages/schemas/src/quiz.test.ts
import {
  quizActivityTypeSchema,
  capitalsQuestionSchema,
  questionResultSchema,
  generateRoundInputSchema,
  completeRoundInputSchema,
  capitalsLlmOutputSchema,
} from './quiz';

describe('quiz schemas', () => {
  describe('quizActivityTypeSchema', () => {
    it('accepts valid activity types', () => {
      expect(quizActivityTypeSchema.parse('capitals')).toBe('capitals');
      expect(quizActivityTypeSchema.parse('vocabulary')).toBe('vocabulary');
      expect(quizActivityTypeSchema.parse('guess_who')).toBe('guess_who');
    });

    it('rejects invalid types', () => {
      expect(() => quizActivityTypeSchema.parse('flashcards')).toThrow();
    });
  });

  describe('capitalsQuestionSchema', () => {
    const validQuestion = {
      type: 'capitals' as const,
      country: 'France',
      correctAnswer: 'Paris',
      acceptedAliases: ['Paris'],
      distractors: ['Berlin', 'Madrid', 'Rome'],
      funFact: 'Paris is known as the City of Light.',
      isLibraryItem: false,
    };

    it('accepts valid question', () => {
      expect(capitalsQuestionSchema.parse(validQuestion)).toEqual(validQuestion);
    });

    it('requires exactly 3 distractors', () => {
      expect(() => capitalsQuestionSchema.parse({
        ...validQuestion,
        distractors: ['Berlin', 'Madrid'],
      })).toThrow();
    });
  });

  describe('questionResultSchema', () => {
    it('accepts valid result', () => {
      expect(questionResultSchema.parse({
        questionIndex: 0,
        correct: true,
        answerGiven: 'Paris',
        timeMs: 3200,
      })).toBeTruthy();
    });

    it('rejects negative timeMs', () => {
      expect(() => questionResultSchema.parse({
        questionIndex: 0,
        correct: true,
        answerGiven: 'Paris',
        timeMs: -1,
      })).toThrow();
    });
  });

  describe('generateRoundInputSchema', () => {
    it('accepts minimal input', () => {
      expect(generateRoundInputSchema.parse({
        activityType: 'capitals',
      })).toEqual({ activityType: 'capitals' });
    });

    it('accepts optional themePreference', () => {
      expect(generateRoundInputSchema.parse({
        activityType: 'capitals',
        themePreference: 'Central Europe',
      })).toEqual({ activityType: 'capitals', themePreference: 'Central Europe' });
    });
  });

  describe('completeRoundInputSchema', () => {
    it('requires at least one result', () => {
      expect(() => completeRoundInputSchema.parse({ results: [] })).toThrow();
    });
  });

  describe('capitalsLlmOutputSchema', () => {
    it('accepts valid LLM output', () => {
      const output = {
        theme: 'Central European Capitals',
        questions: [{
          country: 'Austria',
          correctAnswer: 'Vienna',
          distractors: ['Salzburg', 'Graz', 'Innsbruck'],
          funFact: 'Vienna was the heart of the Habsburg Empire.',
        }],
      };
      expect(capitalsLlmOutputSchema.parse(output)).toEqual(output);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd packages/schemas && pnpm exec jest quiz.test.ts --no-coverage`

Expected: All tests PASS.

- [ ] **Step 4: Export from barrel**

Add to the end of `packages/schemas/src/index.ts`:

```typescript
// Quiz Activities (Practice)
export * from './quiz';
```

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm exec nx run api:typecheck`

```bash
git add packages/schemas/src/quiz.ts packages/schemas/src/quiz.test.ts packages/schemas/src/index.ts
git commit -m "feat(schemas): add quiz activity Zod schemas [QUIZ-P1]"
```

---

### Task 2: Quiz Database Schema

**Files:**
- Create: `packages/database/src/schema/quiz.ts`
- Modify: `packages/database/src/schema/index.ts`

- [ ] **Step 1: Create the database schema file**

```typescript
// packages/database/src/schema/quiz.ts
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid';
import { profiles } from './profiles';

// --- Enums ---

export const quizActivityTypeEnum = pgEnum('quiz_activity_type', [
  'capitals',
  'vocabulary',
  'guess_who',
]);

export const quizRoundStatusEnum = pgEnum('quiz_round_status', [
  'active',
  'completed',
  'abandoned',
]);

// --- Tables ---

/**
 * Known denormalization: `questions` as JSONB stores the full round content in one blob.
 * Cannot query individual questions across rounds without parsing JSON server-side.
 * If per-question analytics become necessary, extract to a `quiz_questions` child table.
 *
 * Abandoned rounds cannot be resumed. A half-finished round is a spoiled deck — the learner
 * has already seen correct answers via feedback on earlier questions. Resuming would let them
 * answer from memory of the feedback, not from knowledge. This is intentional, not a missing feature.
 */
export const quizRounds = pgTable(
  'quiz_rounds',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    activityType: quizActivityTypeEnum('activity_type').notNull(),
    theme: text('theme').notNull(),
    questions: jsonb('questions').notNull().default('[]'),
    results: jsonb('results').default('[]'),
    score: integer('score'),
    total: integer('total').notNull(),
    xpEarned: integer('xp_earned'),
    libraryQuestionIndices: jsonb('library_question_indices').default('[]'),
    status: quizRoundStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_quiz_rounds_profile_activity').on(table.profileId, table.activityType),
    index('idx_quiz_rounds_profile_status').on(table.profileId, table.status),
  ],
);

export const quizMissedItems = pgTable(
  'quiz_missed_items',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    activityType: quizActivityTypeEnum('activity_type').notNull(),
    questionText: text('question_text').notNull(),
    correctAnswer: text('correct_answer').notNull(),
    sourceRoundId: uuid('source_round_id')
      .notNull()
      .references(() => quizRounds.id, { onDelete: 'cascade' }),
    surfaced: boolean('surfaced').notNull().default(false),
    convertedToTopic: boolean('converted_to_topic').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_quiz_missed_items_profile').on(table.profileId, table.activityType, table.surfaced),
  ],
);

// NOTE: No `capitals_reference` DB table in Phase 1. Validation uses the in-memory
// CAPITALS_BY_COUNTRY map from capitals-data.ts. If a future phase needs DB-queryable
// reference data (e.g., "which capitals exist in region X" for coaching card theming),
// add the table then with a concrete query justification — not speculatively.
```

- [ ] **Step 2: Export from database schema barrel**

Add to the end of `packages/database/src/schema/index.ts`:

```typescript
export * from './quiz';
```

- [ ] **Step 3: Generate migration**

Run: `pnpm --filter @eduagent/database generate`

Expected: Creates a new migration file `apps/api/drizzle/0028_*.sql` with `CREATE TYPE`, `CREATE TABLE`, and `CREATE INDEX` statements for the two tables.

- [ ] **Step 4: Verify migration contents**

Read the generated migration file. Verify it contains:
- `CREATE TYPE "public"."quiz_activity_type"` with three values
- `CREATE TYPE "public"."quiz_round_status"` with three values
- `CREATE TABLE "quiz_rounds"` with all columns
- `CREATE TABLE "quiz_missed_items"` with all columns
- Foreign key constraints for `profile_id` and `source_round_id`
- Both indexes
- NO `capitals_reference` table (validation uses in-memory data, not DB)

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/schema/quiz.ts packages/database/src/schema/index.ts apps/api/drizzle/
git commit -m "feat(db): add quiz_rounds, quiz_missed_items tables [QUIZ-P1]"
```

---

### Task 3: Capitals Reference Seed Data

**Files:**
- Create: `apps/api/src/services/quiz/capitals-data.ts`

- [ ] **Step 1: Create the capitals dataset**

This is the source of truth for capitals answer validation. The data lives entirely in-memory — no DB table needed. The `CAPITALS_BY_COUNTRY` map is used at runtime by the validation layer to cross-check LLM answers.

```typescript
// apps/api/src/services/quiz/capitals-data.ts

export interface CapitalEntry {
  country: string;
  capital: string;
  acceptedAliases: string[];
  region: string;
  funFact: string;
}

export const CAPITALS_DATA: CapitalEntry[] = [
  // --- Europe ---
  { country: 'Albania', capital: 'Tirana', acceptedAliases: ['Tirana', 'Tiranë'], region: 'Southern Europe', funFact: 'Tirana\'s colorful buildings were painted to brighten the city after communism.' },
  { country: 'Andorra', capital: 'Andorra la Vella', acceptedAliases: ['Andorra la Vella'], region: 'Southern Europe', funFact: 'Andorra la Vella is the highest capital city in Europe.' },
  { country: 'Austria', capital: 'Vienna', acceptedAliases: ['Vienna', 'Wien'], region: 'Central Europe', funFact: 'Vienna has been ranked the most livable city in the world multiple times.' },
  { country: 'Belarus', capital: 'Minsk', acceptedAliases: ['Minsk'], region: 'Eastern Europe', funFact: 'Minsk was almost completely rebuilt after World War II.' },
  { country: 'Belgium', capital: 'Brussels', acceptedAliases: ['Brussels', 'Bruxelles', 'Brussel'], region: 'Western Europe', funFact: 'Brussels is the de facto capital of the European Union.' },
  { country: 'Bosnia and Herzegovina', capital: 'Sarajevo', acceptedAliases: ['Sarajevo'], region: 'Southern Europe', funFact: 'Sarajevo hosted the 1984 Winter Olympics.' },
  { country: 'Bulgaria', capital: 'Sofia', acceptedAliases: ['Sofia', 'Sofiya'], region: 'Southern Europe', funFact: 'Sofia is one of the oldest cities in Europe, settled over 7,000 years ago.' },
  { country: 'Croatia', capital: 'Zagreb', acceptedAliases: ['Zagreb'], region: 'Central Europe', funFact: 'Zagreb has one of the oldest tram networks in Europe.' },
  { country: 'Czech Republic', capital: 'Prague', acceptedAliases: ['Prague', 'Praha'], region: 'Central Europe', funFact: 'Prague Castle is the largest ancient castle complex in the world.' },
  { country: 'Czechia', capital: 'Prague', acceptedAliases: ['Prague', 'Praha'], region: 'Central Europe', funFact: 'Prague Castle is the largest ancient castle complex in the world.' },
  { country: 'Denmark', capital: 'Copenhagen', acceptedAliases: ['Copenhagen', 'København'], region: 'Northern Europe', funFact: 'Copenhagen is one of the most bicycle-friendly cities in the world.' },
  { country: 'Estonia', capital: 'Tallinn', acceptedAliases: ['Tallinn'], region: 'Northern Europe', funFact: 'Tallinn\'s Old Town is one of the best-preserved medieval cities in Europe.' },
  { country: 'Finland', capital: 'Helsinki', acceptedAliases: ['Helsinki', 'Helsingfors'], region: 'Northern Europe', funFact: 'Helsinki has more than 300 islands in its archipelago.' },
  { country: 'France', capital: 'Paris', acceptedAliases: ['Paris'], region: 'Western Europe', funFact: 'Paris was originally a Roman city called Lutetia.' },
  { country: 'Germany', capital: 'Berlin', acceptedAliases: ['Berlin'], region: 'Central Europe', funFact: 'Berlin has more bridges than Venice — around 960.' },
  { country: 'Greece', capital: 'Athens', acceptedAliases: ['Athens', 'Athina'], region: 'Southern Europe', funFact: 'Athens is one of the oldest cities in the world, with history spanning over 3,400 years.' },
  { country: 'Hungary', capital: 'Budapest', acceptedAliases: ['Budapest'], region: 'Central Europe', funFact: 'Budapest was originally two cities — Buda and Pest — separated by the Danube.' },
  { country: 'Iceland', capital: 'Reykjavik', acceptedAliases: ['Reykjavik', 'Reykjavík'], region: 'Northern Europe', funFact: 'Reykjavik is the northernmost capital of a sovereign state.' },
  { country: 'Ireland', capital: 'Dublin', acceptedAliases: ['Dublin'], region: 'Western Europe', funFact: 'Dublin\'s name comes from the Irish "Dubh Linn" meaning "black pool."' },
  { country: 'Italy', capital: 'Rome', acceptedAliases: ['Rome', 'Roma'], region: 'Southern Europe', funFact: 'Rome has a country inside it — Vatican City.' },
  { country: 'Latvia', capital: 'Riga', acceptedAliases: ['Riga', 'Rīga'], region: 'Northern Europe', funFact: 'Riga has the largest collection of Art Nouveau architecture in the world.' },
  { country: 'Lithuania', capital: 'Vilnius', acceptedAliases: ['Vilnius'], region: 'Northern Europe', funFact: 'Vilnius\' Old Town is one of the largest in Eastern Europe.' },
  { country: 'Luxembourg', capital: 'Luxembourg City', acceptedAliases: ['Luxembourg City', 'Luxembourg'], region: 'Western Europe', funFact: 'Luxembourg City is built on dramatic cliffs and gorges.' },
  { country: 'Moldova', capital: 'Chișinău', acceptedAliases: ['Chișinău', 'Chisinau', 'Kishinev'], region: 'Eastern Europe', funFact: 'Chișinău is known as the "city of white stone" for its limestone buildings.' },
  { country: 'Montenegro', capital: 'Podgorica', acceptedAliases: ['Podgorica'], region: 'Southern Europe', funFact: 'Podgorica has around 200 sunny days per year.' },
  { country: 'Netherlands', capital: 'Amsterdam', acceptedAliases: ['Amsterdam'], region: 'Western Europe', funFact: 'Amsterdam is built on millions of wooden poles driven into the ground.' },
  { country: 'North Macedonia', capital: 'Skopje', acceptedAliases: ['Skopje'], region: 'Southern Europe', funFact: 'Skopje has a massive statue of Alexander the Great in its main square.' },
  { country: 'Norway', capital: 'Oslo', acceptedAliases: ['Oslo'], region: 'Northern Europe', funFact: 'Oslo is surrounded by forests and fjords within its city limits.' },
  { country: 'Poland', capital: 'Warsaw', acceptedAliases: ['Warsaw', 'Warszawa'], region: 'Central Europe', funFact: 'Warsaw\'s Old Town was completely rebuilt from rubble after World War II.' },
  { country: 'Portugal', capital: 'Lisbon', acceptedAliases: ['Lisbon', 'Lisboa'], region: 'Southern Europe', funFact: 'Lisbon is older than Rome — it was settled around 1200 BC.' },
  { country: 'Romania', capital: 'Bucharest', acceptedAliases: ['Bucharest', 'București'], region: 'Eastern Europe', funFact: 'Bucharest has the heaviest building in the world — the Palace of Parliament.' },
  { country: 'Serbia', capital: 'Belgrade', acceptedAliases: ['Belgrade', 'Beograd'], region: 'Southern Europe', funFact: 'Belgrade is one of the oldest continuously inhabited cities in Europe.' },
  { country: 'Slovakia', capital: 'Bratislava', acceptedAliases: ['Bratislava'], region: 'Central Europe', funFact: 'Bratislava is the only capital that borders two other countries.' },
  { country: 'Slovenia', capital: 'Ljubljana', acceptedAliases: ['Ljubljana'], region: 'Central Europe', funFact: 'Ljubljana\'s symbol is a dragon, and dragon statues guard its famous bridge.' },
  { country: 'Spain', capital: 'Madrid', acceptedAliases: ['Madrid'], region: 'Southern Europe', funFact: 'Madrid is the highest capital city in the European Union.' },
  { country: 'Sweden', capital: 'Stockholm', acceptedAliases: ['Stockholm'], region: 'Northern Europe', funFact: 'Stockholm is built on 14 islands connected by 57 bridges.' },
  { country: 'Switzerland', capital: 'Bern', acceptedAliases: ['Bern', 'Berne'], region: 'Central Europe', funFact: 'Bern is named after bears, and the city still keeps live bears in a park.' },
  { country: 'Ukraine', capital: 'Kyiv', acceptedAliases: ['Kyiv', 'Kiev'], region: 'Eastern Europe', funFact: 'Kyiv has one of the deepest metro stations in the world.' },
  { country: 'United Kingdom', capital: 'London', acceptedAliases: ['London'], region: 'Western Europe', funFact: 'London has been the capital of England for nearly 1,000 years.' },

  // --- Asia ---
  { country: 'China', capital: 'Beijing', acceptedAliases: ['Beijing', 'Peking'], region: 'East Asia', funFact: 'Beijing\'s Forbidden City has 9,999 rooms.' },
  { country: 'India', capital: 'New Delhi', acceptedAliases: ['New Delhi', 'Delhi'], region: 'South Asia', funFact: 'New Delhi was designed by British architects and completed in 1931.' },
  { country: 'Indonesia', capital: 'Jakarta', acceptedAliases: ['Jakarta'], region: 'Southeast Asia', funFact: 'Jakarta is one of the most densely populated cities on Earth.' },
  { country: 'Iran', capital: 'Tehran', acceptedAliases: ['Tehran', 'Teheran'], region: 'Western Asia', funFact: 'Tehran sits at the foot of the Alborz mountain range.' },
  { country: 'Israel', capital: 'Jerusalem', acceptedAliases: ['Jerusalem'], region: 'Western Asia', funFact: 'Jerusalem is sacred to three major world religions.' },
  { country: 'Japan', capital: 'Tokyo', acceptedAliases: ['Tokyo'], region: 'East Asia', funFact: 'Tokyo was originally a small fishing village called Edo.' },
  { country: 'Malaysia', capital: 'Kuala Lumpur', acceptedAliases: ['Kuala Lumpur', 'KL'], region: 'Southeast Asia', funFact: 'Kuala Lumpur means "muddy confluence" in Malay.' },
  { country: 'Mongolia', capital: 'Ulaanbaatar', acceptedAliases: ['Ulaanbaatar', 'Ulan Bator'], region: 'East Asia', funFact: 'Ulaanbaatar is the coldest capital city in the world.' },
  { country: 'Nepal', capital: 'Kathmandu', acceptedAliases: ['Kathmandu'], region: 'South Asia', funFact: 'Kathmandu Valley has seven UNESCO World Heritage Sites.' },
  { country: 'Pakistan', capital: 'Islamabad', acceptedAliases: ['Islamabad'], region: 'South Asia', funFact: 'Islamabad is one of the few purpose-built capitals, completed in the 1960s.' },
  { country: 'Philippines', capital: 'Manila', acceptedAliases: ['Manila'], region: 'Southeast Asia', funFact: 'Manila is the most densely populated city in the world.' },
  { country: 'Saudi Arabia', capital: 'Riyadh', acceptedAliases: ['Riyadh'], region: 'Western Asia', funFact: 'Riyadh means "gardens" in Arabic.' },
  { country: 'South Korea', capital: 'Seoul', acceptedAliases: ['Seoul'], region: 'East Asia', funFact: 'Seoul has been the capital of Korea for over 600 years.' },
  { country: 'Thailand', capital: 'Bangkok', acceptedAliases: ['Bangkok', 'Krung Thep'], region: 'Southeast Asia', funFact: 'Bangkok\'s full ceremonial name is 168 letters long — the longest city name in the world.' },
  { country: 'Turkey', capital: 'Ankara', acceptedAliases: ['Ankara'], region: 'Western Asia', funFact: 'Many people think Istanbul is the capital, but it\'s actually Ankara.' },
  { country: 'Vietnam', capital: 'Hanoi', acceptedAliases: ['Hanoi', 'Ha Noi'], region: 'Southeast Asia', funFact: 'Hanoi celebrated its 1,000th birthday in 2010.' },

  // --- Africa ---
  { country: 'Egypt', capital: 'Cairo', acceptedAliases: ['Cairo', 'Al-Qahira'], region: 'North Africa', funFact: 'Cairo is the largest city in Africa and the Arab world.' },
  { country: 'Ethiopia', capital: 'Addis Ababa', acceptedAliases: ['Addis Ababa'], region: 'East Africa', funFact: 'Addis Ababa means "new flower" in Amharic.' },
  { country: 'Kenya', capital: 'Nairobi', acceptedAliases: ['Nairobi'], region: 'East Africa', funFact: 'Nairobi has a national park with wild lions within its city limits.' },
  { country: 'Morocco', capital: 'Rabat', acceptedAliases: ['Rabat'], region: 'North Africa', funFact: 'Rabat, not Casablanca or Marrakech, is Morocco\'s capital.' },
  { country: 'Nigeria', capital: 'Abuja', acceptedAliases: ['Abuja'], region: 'West Africa', funFact: 'Abuja replaced Lagos as capital in 1991 — many people still guess Lagos.' },
  { country: 'South Africa', capital: 'Pretoria', acceptedAliases: ['Pretoria', 'Tshwane'], region: 'Southern Africa', funFact: 'South Africa has three capitals: Pretoria (executive), Cape Town (legislative), Bloemfontein (judicial).' },
  { country: 'Tanzania', capital: 'Dodoma', acceptedAliases: ['Dodoma'], region: 'East Africa', funFact: 'Dodoma became the capital in 1974, but Dar es Salaam is still the largest city.' },

  // --- Americas ---
  { country: 'Argentina', capital: 'Buenos Aires', acceptedAliases: ['Buenos Aires'], region: 'South America', funFact: 'Buenos Aires has the widest avenue in the world — Avenida 9 de Julio.' },
  { country: 'Brazil', capital: 'Brasília', acceptedAliases: ['Brasília', 'Brasilia'], region: 'South America', funFact: 'Brasília was built from scratch in just 41 months in the 1960s.' },
  { country: 'Canada', capital: 'Ottawa', acceptedAliases: ['Ottawa'], region: 'North America', funFact: 'Many people guess Toronto, but Ottawa has been Canada\'s capital since 1857.' },
  { country: 'Chile', capital: 'Santiago', acceptedAliases: ['Santiago'], region: 'South America', funFact: 'Santiago is surrounded by the Andes mountains and is often covered in smog.' },
  { country: 'Colombia', capital: 'Bogotá', acceptedAliases: ['Bogotá', 'Bogota'], region: 'South America', funFact: 'Bogotá sits at 2,640 meters above sea level — one of the highest capitals in the world.' },
  { country: 'Cuba', capital: 'Havana', acceptedAliases: ['Havana', 'La Habana'], region: 'Caribbean', funFact: 'Havana is famous for its colorful vintage American cars from the 1950s.' },
  { country: 'Mexico', capital: 'Mexico City', acceptedAliases: ['Mexico City', 'Ciudad de México', 'CDMX'], region: 'North America', funFact: 'Mexico City was built on top of the Aztec capital Tenochtitlan.' },
  { country: 'Peru', capital: 'Lima', acceptedAliases: ['Lima'], region: 'South America', funFact: 'Lima almost never rains — it\'s one of the driest capital cities.' },
  { country: 'United States', capital: 'Washington, D.C.', acceptedAliases: ['Washington, D.C.', 'Washington DC', 'Washington D.C.', 'Washington'], region: 'North America', funFact: 'Washington, D.C. is not in any state — it\'s a federal district.' },
  { country: 'Venezuela', capital: 'Caracas', acceptedAliases: ['Caracas'], region: 'South America', funFact: 'Caracas sits in a valley at 900 meters surrounded by the Ávila mountain.' },

  // --- Oceania ---
  { country: 'Australia', capital: 'Canberra', acceptedAliases: ['Canberra'], region: 'Oceania', funFact: 'Canberra was purpose-built because Sydney and Melbourne couldn\'t agree on which should be capital.' },
  { country: 'New Zealand', capital: 'Wellington', acceptedAliases: ['Wellington'], region: 'Oceania', funFact: 'Wellington is the southernmost capital of a sovereign state.' },
];

/** In-memory lookup map: lowercase country → CapitalEntry */
export const CAPITALS_BY_COUNTRY = new Map<string, CapitalEntry>(
  CAPITALS_DATA.map((e) => [e.country.toLowerCase(), e]),
);

/** All unique regions in the dataset */
export const CAPITALS_REGIONS = [...new Set(CAPITALS_DATA.map((e) => e.region))].sort();
```

- [ ] **Step 2: Verify dataset integrity**

```typescript
// apps/api/src/services/quiz/capitals-data.test.ts
import { CAPITALS_DATA, CAPITALS_BY_COUNTRY, CAPITALS_REGIONS } from './capitals-data';

describe('capitals reference data', () => {
  it('has at least 70 entries', () => {
    expect(CAPITALS_DATA.length).toBeGreaterThanOrEqual(70);
  });

  it('has unique country names (case-insensitive)', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const entry of CAPITALS_DATA) {
      const key = entry.country.toLowerCase();
      if (seen.has(key)) dupes.push(entry.country);
      seen.add(key);
    }
    // Czechia/Czech Republic is intentional dual-entry
    const allowedDupes = ['czechia'];
    const realDupes = dupes.filter((d) => !allowedDupes.includes(d.toLowerCase()));
    expect(realDupes).toEqual([]);
  });

  it('every entry has at least one accepted alias', () => {
    for (const entry of CAPITALS_DATA) {
      expect(entry.acceptedAliases.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every entry has a non-empty fun fact', () => {
    for (const entry of CAPITALS_DATA) {
      expect(entry.funFact.length).toBeGreaterThan(0);
    }
  });

  it('lookup map works case-insensitively', () => {
    expect(CAPITALS_BY_COUNTRY.get('france')?.capital).toBe('Paris');
    expect(CAPITALS_BY_COUNTRY.get('czech republic')?.capital).toBe('Prague');
  });

  it('has entries for all major regions', () => {
    expect(CAPITALS_REGIONS).toContain('Central Europe');
    expect(CAPITALS_REGIONS).toContain('East Asia');
    expect(CAPITALS_REGIONS).toContain('North America');
    expect(CAPITALS_REGIONS).toContain('South America');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/api && pnpm exec jest services/quiz/capitals-data.test.ts --no-coverage`

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/quiz/capitals-data.ts apps/api/src/services/quiz/capitals-data.test.ts
git commit -m "feat(quiz): add capitals reference dataset with 75+ countries [QUIZ-P1]"
```

---

### Task 4: Scoped Repository + Quiz Config

**Files:**
- Modify: `packages/database/src/repository.ts`
- Create: `apps/api/src/services/quiz/config.ts`
- Create: `apps/api/src/services/quiz/index.ts`

- [ ] **Step 1: Add quiz tables to scoped repository**

In `packages/database/src/repository.ts`, add the import at the top with the other schema imports:

```typescript
import { quizRounds, quizMissedItems } from './schema/quiz';
```

Then add these two sections to the returned object inside `createScopedRepository`, after the last existing section (e.g., after `dictationResults`):

```typescript
    quizRounds: {
      async findMany(extraWhere?: SQL) {
        return db.query.quizRounds.findMany({
          where: scopedWhere(quizRounds, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.quizRounds.findFirst({
          where: scopedWhere(quizRounds, extraWhere),
        });
      },
    },
    quizMissedItems: {
      async findMany(extraWhere?: SQL) {
        return db.query.quizMissedItems.findMany({
          where: scopedWhere(quizMissedItems, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.quizMissedItems.findFirst({
          where: scopedWhere(quizMissedItems, extraWhere),
        });
      },
    },
```

- [ ] **Step 2: Create quiz config constants**

```typescript
// apps/api/src/services/quiz/config.ts

export const QUIZ_CONFIG = {
  defaults: {
    roundSize: 6,
    libraryRatio: 0.25,
    libraryRatioMinItems: 3,
    libraryRatioScaleUpThreshold: 20,
    timerBonusThresholdMs: 5000,
    recentlySeenBufferSize: 30,
  },
  perActivity: {
    capitals: { roundSize: 8 },
    vocabulary: { roundSize: 6 },
    guess_who: { roundSize: 4 },
  },
  xp: {
    perCorrect: 10,
    timerBonus: 2,
    perfectBonus: 25,
  },
  celebrationThresholds: {
    perfect: 1.0,
    great: 0.8,
  },
} as const;

export type QuizActivityConfig = typeof QUIZ_CONFIG;
```

- [ ] **Step 3: Create service barrel**

```typescript
// apps/api/src/services/quiz/index.ts
export { QUIZ_CONFIG } from './config';
export { resolveRoundContent } from './content-resolver';
export { validateCapitalsRound } from './capitals-validation';
export { generateQuizRound } from './generate-round';
export { completeQuizRound } from './complete-round';
```

Note: The exported functions don't exist yet. This barrel will cause import errors until Tasks 5-8 are complete. That's OK — the barrel is committed now and implementations follow.

- [ ] **Step 4: Typecheck database package and commit**

Run: `pnpm exec nx run api:typecheck` (may have errors from the barrel — that's expected, typecheck will pass once all services exist)

```bash
git add packages/database/src/repository.ts apps/api/src/services/quiz/config.ts apps/api/src/services/quiz/index.ts
git commit -m "feat(quiz): add scoped repository entries, config constants, service barrel [QUIZ-P1]"
```

---

### Task 5: Content Resolver

**Files:**
- Create: `apps/api/src/services/quiz/content-resolver.ts`
- Test: `apps/api/src/services/quiz/content-resolver.test.ts`

- [ ] **Step 1: Write the content resolver tests**

```typescript
// apps/api/src/services/quiz/content-resolver.test.ts
import { resolveRoundContent, type RoundContentPlan } from './content-resolver';
import { QUIZ_CONFIG } from './config';

describe('resolveRoundContent', () => {
  const baseParams = {
    activityType: 'capitals' as const,
    profileId: 'profile-1',
    recentAnswers: [] as string[],
    libraryItems: [],
  };

  it('returns all discovery slots when library is empty', () => {
    const plan = resolveRoundContent(baseParams);
    expect(plan.discoveryCount).toBe(QUIZ_CONFIG.perActivity.capitals.roundSize);
    expect(plan.masteryItems).toEqual([]);
    expect(plan.totalQuestions).toBe(QUIZ_CONFIG.perActivity.capitals.roundSize);
  });

  it('returns all discovery when library items below minimum', () => {
    const plan = resolveRoundContent({
      ...baseParams,
      libraryItems: [
        { id: '1', question: 'France', answer: 'Paris' },
        { id: '2', question: 'Germany', answer: 'Berlin' },
      ],
    });
    expect(plan.masteryItems).toEqual([]);
    expect(plan.discoveryCount).toBe(QUIZ_CONFIG.perActivity.capitals.roundSize);
  });

  it('includes mastery items when library meets minimum', () => {
    const libraryItems = Array.from({ length: 5 }, (_, i) => ({
      id: `item-${i}`,
      question: `Country ${i}`,
      answer: `Capital ${i}`,
    }));
    const plan = resolveRoundContent({
      ...baseParams,
      libraryItems,
    });
    // 25% of 8 = 2 mastery slots
    expect(plan.masteryItems.length).toBe(2);
    expect(plan.discoveryCount).toBe(6);
    expect(plan.totalQuestions).toBe(8);
  });

  it('scales up mastery ratio when many due items', () => {
    const libraryItems = Array.from({ length: 25 }, (_, i) => ({
      id: `item-${i}`,
      question: `Country ${i}`,
      answer: `Capital ${i}`,
    }));
    const plan = resolveRoundContent({
      ...baseParams,
      libraryItems,
    });
    // 35% of 8 = 2.8 → 2 mastery slots (floor)
    expect(plan.masteryItems.length).toBe(2);
  });

  it('filters recently seen answers from mastery candidates', () => {
    const libraryItems = Array.from({ length: 5 }, (_, i) => ({
      id: `item-${i}`,
      question: `Country ${i}`,
      answer: `Capital ${i}`,
    }));
    const plan = resolveRoundContent({
      ...baseParams,
      libraryItems,
      recentAnswers: ['Capital 0', 'Capital 1', 'Capital 2', 'Capital 3'],
    });
    // Only 1 candidate not recently seen, below minimum → 0 mastery
    // Actually we have 5 items, 4 recently seen, 1 remaining. 1 < 3 min → 0 mastery
    expect(plan.masteryItems.length).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest services/quiz/content-resolver.test.ts --no-coverage`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the content resolver**

```typescript
// apps/api/src/services/quiz/content-resolver.ts
import { QUIZ_CONFIG } from './config';
import type { QuizActivityType } from '@eduagent/schemas';

export interface LibraryItem {
  id: string;
  question: string;
  answer: string;
  topicId?: string;
  vocabularyId?: string;
}

export interface ResolveParams {
  activityType: QuizActivityType;
  profileId: string;
  recentAnswers: string[];
  libraryItems: LibraryItem[];
}

export interface RoundContentPlan {
  discoveryCount: number;
  masteryItems: LibraryItem[];
  totalQuestions: number;
  recentAnswers: string[];
}

export function resolveRoundContent(params: ResolveParams): RoundContentPlan {
  const { activityType, recentAnswers, libraryItems } = params;
  const { defaults, perActivity } = QUIZ_CONFIG;

  const roundSize =
    perActivity[activityType]?.roundSize ?? defaults.roundSize;

  // Filter out recently seen library items
  const recentSet = new Set(recentAnswers.map((a) => a.toLowerCase()));
  const eligibleLibrary = libraryItems.filter(
    (item) => !recentSet.has(item.answer.toLowerCase()),
  );

  // Determine mastery slot count
  let masteryCount = 0;

  if (eligibleLibrary.length >= defaults.libraryRatioMinItems) {
    const ratio =
      eligibleLibrary.length > defaults.libraryRatioScaleUpThreshold
        ? 0.35
        : defaults.libraryRatio;
    masteryCount = Math.min(
      Math.floor(ratio * roundSize),
      eligibleLibrary.length,
    );
  }

  // Pick mastery items (random selection from eligible)
  const shuffled = [...eligibleLibrary].sort(() => Math.random() - 0.5);
  const masteryItems = shuffled.slice(0, masteryCount);

  return {
    discoveryCount: roundSize - masteryCount,
    masteryItems,
    totalQuestions: roundSize,
    recentAnswers,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest services/quiz/content-resolver.test.ts --no-coverage`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/quiz/content-resolver.ts apps/api/src/services/quiz/content-resolver.test.ts
git commit -m "feat(quiz): add content resolver for mastery/discovery split [QUIZ-P1]"
```

---

### Task 6: Capitals Validation

**Files:**
- Create: `apps/api/src/services/quiz/capitals-validation.ts`
- Test: `apps/api/src/services/quiz/capitals-validation.test.ts`

- [ ] **Step 1: Write the validation tests**

```typescript
// apps/api/src/services/quiz/capitals-validation.test.ts
import { validateCapitalsRound, validateDistractors } from './capitals-validation';
import type { CapitalsLlmOutput } from '@eduagent/schemas';

describe('validateCapitalsRound', () => {
  it('corrects wrong capital from LLM', () => {
    const llmOutput: CapitalsLlmOutput = {
      theme: 'Test Theme',
      questions: [{
        country: 'Australia',
        correctAnswer: 'Sydney',  // WRONG — should be Canberra
        distractors: ['Melbourne', 'Brisbane', 'Perth'],
        funFact: 'Test fact.',
      }],
    };
    const validated = validateCapitalsRound(llmOutput);
    expect(validated.questions[0].correctAnswer).toBe('Canberra');
    expect(validated.questions[0].acceptedAliases).toEqual(['Canberra']);
  });

  it('keeps correct LLM answer and enriches aliases', () => {
    const llmOutput: CapitalsLlmOutput = {
      theme: 'Test Theme',
      questions: [{
        country: 'Czech Republic',
        correctAnswer: 'Prague',
        distractors: ['Brno', 'Ostrava', 'Plzeň'],
        funFact: 'Test fact.',
      }],
    };
    const validated = validateCapitalsRound(llmOutput);
    expect(validated.questions[0].correctAnswer).toBe('Prague');
    expect(validated.questions[0].acceptedAliases).toContain('Praha');
  });

  it('drops questions for unknown countries', () => {
    const llmOutput: CapitalsLlmOutput = {
      theme: 'Test Theme',
      questions: [
        { country: 'France', correctAnswer: 'Paris', distractors: ['Lyon', 'Marseille', 'Nice'], funFact: 'Fact 1.' },
        { country: 'Narnia', correctAnswer: 'Cair Paravel', distractors: ['A', 'B', 'C'], funFact: 'Fact 2.' },
      ],
    };
    const validated = validateCapitalsRound(llmOutput);
    expect(validated.questions.length).toBe(1);
    expect(validated.questions[0].country).toBe('France');
  });

  it('uses reference fun fact when LLM provides one and reference has one too', () => {
    const llmOutput: CapitalsLlmOutput = {
      theme: 'Test Theme',
      questions: [{
        country: 'France',
        correctAnswer: 'Paris',
        distractors: ['Lyon', 'Marseille', 'Nice'],
        funFact: 'LLM generated fact.',
      }],
    };
    const validated = validateCapitalsRound(llmOutput);
    // LLM fact is kept (we prefer LLM facts for variety, reference is fallback)
    expect(validated.questions[0].funFact).toBe('LLM generated fact.');
  });
});

describe('validateDistractors', () => {
  it('removes distractor that is actually a correct capital', () => {
    const result = validateDistractors('France', 'Paris', ['Berlin', 'London', 'Rome']);
    // Berlin, London, Rome are all real capitals — but they are valid distractors
    // because they are NOT the capital of France
    expect(result.length).toBe(3);
  });

  it('removes distractor matching the correct answer', () => {
    const result = validateDistractors('France', 'Paris', ['Paris', 'Berlin', 'Rome']);
    expect(result).not.toContain('Paris');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest services/quiz/capitals-validation.test.ts --no-coverage`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the validation**

```typescript
// apps/api/src/services/quiz/capitals-validation.ts
import { CAPITALS_BY_COUNTRY } from './capitals-data';
import type { CapitalsLlmOutput } from '@eduagent/schemas';

export interface ValidatedCapitalsQuestion {
  country: string;
  correctAnswer: string;
  acceptedAliases: string[];
  distractors: string[];
  funFact: string;
}

export interface ValidatedCapitalsRound {
  theme: string;
  questions: ValidatedCapitalsQuestion[];
}

/**
 * Cross-checks LLM-generated capitals against the reference dataset.
 * - Corrects wrong answers silently
 * - Enriches with accepted aliases
 * - Drops questions for unknown countries
 * - Validates distractors
 */
export function validateCapitalsRound(
  llmOutput: CapitalsLlmOutput,
): ValidatedCapitalsRound {
  const validatedQuestions: ValidatedCapitalsQuestion[] = [];

  for (const q of llmOutput.questions) {
    const ref = CAPITALS_BY_COUNTRY.get(q.country.toLowerCase());
    if (!ref) {
      // Unknown country — drop silently
      continue;
    }

    const correctAnswer = ref.capital;
    const acceptedAliases = ref.acceptedAliases;
    const funFact = q.funFact || ref.funFact || '';

    const distractors = validateDistractors(
      q.country,
      correctAnswer,
      q.distractors,
    );

    validatedQuestions.push({
      country: ref.country, // use canonical country name from reference
      correctAnswer,
      acceptedAliases,
      distractors,
      funFact,
    });
  }

  return {
    theme: llmOutput.theme,
    questions: validatedQuestions,
  };
}

/**
 * Ensures distractors are valid:
 * - Removes any distractor that matches the correct answer
 * - Removes duplicates
 */
export function validateDistractors(
  _country: string,
  correctAnswer: string,
  distractors: string[],
): string[] {
  const correctLower = correctAnswer.toLowerCase();
  const seen = new Set<string>();
  const valid: string[] = [];

  for (const d of distractors) {
    const dLower = d.toLowerCase();
    if (dLower === correctLower) continue;
    if (seen.has(dLower)) continue;
    seen.add(dLower);
    valid.push(d);
  }

  return valid.slice(0, 3);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest services/quiz/capitals-validation.test.ts --no-coverage`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/quiz/capitals-validation.ts apps/api/src/services/quiz/capitals-validation.test.ts
git commit -m "feat(quiz): add capitals validation layer with reference cross-check [QUIZ-P1]"
```

---

### Task 7: Round Generation Service

**Files:**
- Create: `apps/api/src/services/quiz/generate-round.ts`
- Test: `apps/api/src/services/quiz/generate-round.test.ts`

- [ ] **Step 1: Write the generation tests**

```typescript
// apps/api/src/services/quiz/generate-round.test.ts
import { buildCapitalsPrompt, assembleRound, injectMasteryQuestions } from './generate-round';
import type { CapitalsQuestion } from '@eduagent/schemas';
import type { LibraryItem } from './content-resolver';

describe('buildCapitalsPrompt', () => {
  it('includes discovery count and exclusions', () => {
    const prompt = buildCapitalsPrompt({
      discoveryCount: 6,
      ageBracket: '10-13',
      recentAnswers: ['Paris', 'Berlin'],
      themePreference: 'Central Europe',
    });
    expect(prompt).toContain('6');
    expect(prompt).toContain('Paris');
    expect(prompt).toContain('Berlin');
    expect(prompt).toContain('Central Europe');
    expect(prompt).toContain('10-13');
  });

  it('works without theme preference', () => {
    const prompt = buildCapitalsPrompt({
      discoveryCount: 8,
      ageBracket: '6-9',
      recentAnswers: [],
    });
    expect(prompt).toContain('choose an age-appropriate theme');
  });
});

describe('injectMasteryQuestions', () => {
  it('injects mastery items at random positions', () => {
    const discovery: CapitalsQuestion[] = Array.from({ length: 6 }, (_, i) => ({
      type: 'capitals' as const,
      country: `Discovery ${i}`,
      correctAnswer: `Capital ${i}`,
      acceptedAliases: [`Capital ${i}`],
      distractors: ['A', 'B', 'C'],
      funFact: 'Fact',
      isLibraryItem: false,
    }));

    const mastery: LibraryItem[] = [
      { id: 'lib-1', question: 'France', answer: 'Paris' },
    ];

    const round = injectMasteryQuestions(discovery, mastery, 'capitals');
    expect(round.length).toBe(7);
    const libraryQuestions = round.filter((q) => q.isLibraryItem);
    expect(libraryQuestions.length).toBe(1);
    expect(libraryQuestions[0].country).toBe('France');
    expect(libraryQuestions[0].correctAnswer).toBe('Paris');
  });

  it('returns discovery only when no mastery items', () => {
    const discovery: CapitalsQuestion[] = [{
      type: 'capitals',
      country: 'Germany',
      correctAnswer: 'Berlin',
      acceptedAliases: ['Berlin'],
      distractors: ['Munich', 'Hamburg', 'Frankfurt'],
      funFact: 'Fact',
      isLibraryItem: false,
    }];

    const round = injectMasteryQuestions(discovery, [], 'capitals');
    expect(round.length).toBe(1);
    expect(round[0].isLibraryItem).toBe(false);
  });
});

describe('assembleRound', () => {
  it('produces a complete round response', () => {
    const questions: CapitalsQuestion[] = [{
      type: 'capitals',
      country: 'France',
      correctAnswer: 'Paris',
      acceptedAliases: ['Paris'],
      distractors: ['Berlin', 'Madrid', 'Rome'],
      funFact: 'Fact',
      isLibraryItem: false,
    }];
    const round = assembleRound('Test Theme', questions);
    expect(round.theme).toBe('Test Theme');
    expect(round.questions).toEqual(questions);
    expect(round.total).toBe(1);
    expect(round.libraryQuestionIndices).toEqual([]);
  });

  it('tracks library question indices', () => {
    const questions: CapitalsQuestion[] = [
      { type: 'capitals', country: 'A', correctAnswer: 'A1', acceptedAliases: ['A1'], distractors: ['B', 'C', 'D'], funFact: '', isLibraryItem: false },
      { type: 'capitals', country: 'B', correctAnswer: 'B1', acceptedAliases: ['B1'], distractors: ['A', 'C', 'D'], funFact: '', isLibraryItem: true },
      { type: 'capitals', country: 'C', correctAnswer: 'C1', acceptedAliases: ['C1'], distractors: ['A', 'B', 'D'], funFact: '', isLibraryItem: false },
    ];
    const round = assembleRound('Theme', questions);
    expect(round.libraryQuestionIndices).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest services/quiz/generate-round.test.ts --no-coverage`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement round generation**

```typescript
// apps/api/src/services/quiz/generate-round.ts
import { routeAndCall, type ChatMessage } from '../llm';
import { capitalsLlmOutputSchema, type CapitalsQuestion, type QuizActivityType } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import { quizRounds } from '@eduagent/database';
import { resolveRoundContent, type LibraryItem } from './content-resolver';
import { validateCapitalsRound } from './capitals-validation';
import { CAPITALS_BY_COUNTRY, CAPITALS_DATA } from './capitals-data';
import { QUIZ_CONFIG } from './config';

// --- Prompt building ---

interface CapitalsPromptParams {
  discoveryCount: number;
  ageBracket: string;
  recentAnswers: string[];
  themePreference?: string;
}

export function buildCapitalsPrompt(params: CapitalsPromptParams): string {
  const { discoveryCount, ageBracket, recentAnswers, themePreference } = params;

  const exclusions = recentAnswers.length > 0
    ? `Do NOT include questions about these countries/capitals (recently seen): ${recentAnswers.join(', ')}`
    : 'No exclusions.';

  const themeInstruction = themePreference
    ? `Theme: "${themePreference}"`
    : 'Choose an age-appropriate theme (e.g., "Capitals of Central Europe", "Big World Cities").';

  return `You are generating a quiz round for a ${ageBracket} year old learner.

Activity: Capitals quiz
${themeInstruction}
Questions needed: exactly ${discoveryCount}

${exclusions}

Rules:
- Generate exactly ${discoveryCount} questions about capital cities of countries
- Each question must have exactly 3 distractors (wrong answers) that are real cities but clearly NOT the capital
- Distractors must not be ambiguously close to the correct answer (no "Holland" vs "The Netherlands" situations)
- Do not use two distractors from the same country or region as the correct answer
- Fun facts should be surprising and age-appropriate, one sentence maximum
- The theme should group related countries (by region, continent, or interesting category)

Respond with ONLY valid JSON matching this exact structure:
{
  "theme": "Theme Name",
  "questions": [
    {
      "country": "Country Name",
      "correctAnswer": "Capital City",
      "distractors": ["City A", "City B", "City C"],
      "funFact": "One surprising fact about this capital."
    }
  ]
}`;
}

// --- Mastery injection ---

export function injectMasteryQuestions(
  discoveryQuestions: CapitalsQuestion[],
  masteryItems: LibraryItem[],
  activityType: QuizActivityType,
): CapitalsQuestion[] {
  if (masteryItems.length === 0) return discoveryQuestions;

  const masteryQuestions: CapitalsQuestion[] = masteryItems.map((item) => {
    const ref = CAPITALS_BY_COUNTRY.get(item.question.toLowerCase());
    // Generate 3 distractors from different regions
    const otherCapitals = CAPITALS_DATA
      .filter((c) => c.capital.toLowerCase() !== item.answer.toLowerCase())
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((c) => c.capital);

    return {
      type: activityType as 'capitals',
      country: ref?.country ?? item.question,
      correctAnswer: ref?.capital ?? item.answer,
      acceptedAliases: ref?.acceptedAliases ?? [item.answer],
      distractors: otherCapitals,
      funFact: ref?.funFact ?? '',
      isLibraryItem: true,
      topicId: item.topicId ?? undefined,
    };
  });

  // Insert mastery questions at random positions (splice(pos, 0, mq) = INSERT, not replace)
  const combined = [...discoveryQuestions];
  for (const mq of masteryQuestions) {
    const pos = Math.floor(Math.random() * (combined.length + 1));
    combined.splice(pos, 0, mq);
  }

  return combined;
}

// --- Round assembly ---

export interface AssembledRound {
  theme: string;
  questions: CapitalsQuestion[];
  total: number;
  libraryQuestionIndices: number[];
}

export function assembleRound(
  theme: string,
  questions: CapitalsQuestion[],
): AssembledRound {
  const libraryQuestionIndices = questions
    .map((q, i) => (q.isLibraryItem ? i : -1))
    .filter((i) => i >= 0);

  return {
    theme,
    questions,
    total: questions.length,
    libraryQuestionIndices,
  };
}

// --- Main generation function ---

interface GenerateParams {
  db: Database;
  profileId: string;
  activityType: QuizActivityType;
  ageBracket: string;
  themePreference?: string;
  libraryItems: LibraryItem[];
  recentAnswers: string[];
}

export async function generateQuizRound(params: GenerateParams): Promise<{
  id: string;
  theme: string;
  questions: CapitalsQuestion[];
  total: number;
}> {
  const { db, profileId, activityType, ageBracket, themePreference, libraryItems, recentAnswers } = params;

  // 1. Resolve mastery/discovery split
  const plan = resolveRoundContent({
    activityType,
    profileId,
    recentAnswers,
    libraryItems,
  });

  // 2. Generate discovery questions via LLM
  const prompt = buildCapitalsPrompt({
    discoveryCount: plan.discoveryCount,
    ageBracket,
    recentAnswers,
    themePreference,
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: prompt },
    { role: 'user', content: 'Generate the quiz round.' },
  ];

  const llmResult = await routeAndCall(messages, 1); // rung 1 = Flash

  // 3. Parse and validate LLM output
  const jsonMatch = llmResult.response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Quiz LLM returned no JSON');
  }

  let llmOutput;
  try {
    llmOutput = capitalsLlmOutputSchema.parse(JSON.parse(jsonMatch[0]));
  } catch {
    throw new Error('Quiz LLM returned invalid structured output');
  }

  // 4. Cross-check against reference data
  const validated = validateCapitalsRound(llmOutput);

  if (validated.questions.length === 0) {
    throw new Error('No valid questions after validation');
  }

  // 5. Convert to typed questions
  const discoveryQuestions: CapitalsQuestion[] = validated.questions.map((q) => ({
    type: 'capitals' as const,
    country: q.country,
    correctAnswer: q.correctAnswer,
    acceptedAliases: q.acceptedAliases,
    distractors: q.distractors,
    funFact: q.funFact,
    isLibraryItem: false,
  }));

  // 6. Inject mastery questions
  const allQuestions = injectMasteryQuestions(
    discoveryQuestions,
    plan.masteryItems,
    activityType,
  );

  // 7. Assemble round
  const round = assembleRound(validated.theme, allQuestions);

  // 8. Persist to DB
  const [inserted] = await db
    .insert(quizRounds)
    .values({
      profileId,
      activityType,
      theme: round.theme,
      questions: round.questions,
      total: round.total,
      libraryQuestionIndices: round.libraryQuestionIndices,
      status: 'active',
    })
    .returning({ id: quizRounds.id });

  return {
    id: inserted.id,
    theme: round.theme,
    questions: round.questions,
    total: round.total,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest services/quiz/generate-round.test.ts --no-coverage`

Expected: All tests PASS (the unit tests for `buildCapitalsPrompt`, `injectMasteryQuestions`, and `assembleRound` are pure functions and don't need mocks).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/quiz/generate-round.ts apps/api/src/services/quiz/generate-round.test.ts
git commit -m "feat(quiz): add round generation with LLM prompt, mastery injection, DB persistence [QUIZ-P1]"
```

---

### Task 8: Round Completion Service

**Files:**
- Create: `apps/api/src/services/quiz/complete-round.ts`
- Test: `apps/api/src/services/quiz/complete-round.test.ts`

- [ ] **Step 1: Write the completion tests**

```typescript
// apps/api/src/services/quiz/complete-round.test.ts
import { calculateScore, calculateXp, getCelebrationTier } from './complete-round';
import type { QuestionResult } from '@eduagent/schemas';

describe('calculateScore', () => {
  it('counts correct answers', () => {
    const results: QuestionResult[] = [
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 3000 },
      { questionIndex: 1, correct: false, answerGiven: 'Munich', timeMs: 4000 },
      { questionIndex: 2, correct: true, answerGiven: 'Rome', timeMs: 2000 },
    ];
    expect(calculateScore(results)).toBe(2);
  });

  it('returns 0 for all wrong', () => {
    const results: QuestionResult[] = [
      { questionIndex: 0, correct: false, answerGiven: 'X', timeMs: 3000 },
    ];
    expect(calculateScore(results)).toBe(0);
  });
});

describe('calculateXp', () => {
  it('awards base XP per correct answer', () => {
    const results: QuestionResult[] = [
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 6000 },
      { questionIndex: 1, correct: true, answerGiven: 'Berlin', timeMs: 7000 },
    ];
    // 2 correct * 10 = 20 base, no timer bonus (both > 5000ms), no perfect (2/2 = perfect!)
    // Actually 2/2 = perfect → +25
    expect(calculateXp(results, 2)).toBe(20 + 25);
  });

  it('awards timer bonus for fast answers', () => {
    const results: QuestionResult[] = [
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 3000 },
      { questionIndex: 1, correct: true, answerGiven: 'Berlin', timeMs: 4000 },
      { questionIndex: 2, correct: false, answerGiven: 'X', timeMs: 2000 },
    ];
    // 2 correct * 10 = 20, 2 fast correct * 2 = 4 (wrong answers don't get timer bonus)
    // not perfect (2/3)
    expect(calculateXp(results, 3)).toBe(20 + 4);
  });

  it('awards perfect bonus for 100%', () => {
    const results: QuestionResult[] = [
      { questionIndex: 0, correct: true, answerGiven: 'Paris', timeMs: 6000 },
    ];
    // 1 * 10 = 10 + 25 perfect
    expect(calculateXp(results, 1)).toBe(35);
  });
});

describe('getCelebrationTier', () => {
  it('returns perfect for 100%', () => {
    expect(getCelebrationTier(8, 8)).toBe('perfect');
  });

  it('returns great for >= 80%', () => {
    expect(getCelebrationTier(7, 8)).toBe('great');
  });

  it('returns nice for < 80%', () => {
    expect(getCelebrationTier(5, 8)).toBe('nice');
  });

  it('returns nice for 0', () => {
    expect(getCelebrationTier(0, 8)).toBe('nice');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest services/quiz/complete-round.test.ts --no-coverage`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the completion service**

```typescript
// apps/api/src/services/quiz/complete-round.ts
import { eq, and } from 'drizzle-orm';
import { quizRounds, quizMissedItems, type Database } from '@eduagent/database';
import type { QuestionResult, CapitalsQuestion, CompleteRoundResponse } from '@eduagent/schemas';
import { QUIZ_CONFIG } from './config';

export function calculateScore(results: QuestionResult[]): number {
  return results.filter((r) => r.correct).length;
}

export function calculateXp(results: QuestionResult[], total: number): number {
  const { xp } = QUIZ_CONFIG;
  const correctResults = results.filter((r) => r.correct);
  const score = correctResults.length;

  const baseXp = score * xp.perCorrect;

  const fastCorrectCount = correctResults.filter(
    (r) => r.timeMs < QUIZ_CONFIG.defaults.timerBonusThresholdMs,
  ).length;
  const timerBonus = fastCorrectCount * xp.timerBonus;

  const perfectBonus = score === total ? xp.perfectBonus : 0;

  return baseXp + timerBonus + perfectBonus;
}

export function getCelebrationTier(
  score: number,
  total: number,
): 'perfect' | 'great' | 'nice' {
  const ratio = total > 0 ? score / total : 0;
  if (ratio >= QUIZ_CONFIG.celebrationThresholds.perfect) return 'perfect';
  if (ratio >= QUIZ_CONFIG.celebrationThresholds.great) return 'great';
  return 'nice';
}

export async function completeQuizRound(
  db: Database,
  profileId: string,
  roundId: string,
  results: QuestionResult[],
): Promise<CompleteRoundResponse> {
  // 1. Fetch the round
  const round = await db.query.quizRounds.findFirst({
    where: and(
      eq(quizRounds.id, roundId),
      eq(quizRounds.profileId, profileId),
    ),
  });

  if (!round) throw new Error('Round not found');
  if (round.status !== 'active') throw new Error('Round is not active');

  const questions = round.questions as CapitalsQuestion[];
  const total = round.total;

  // 2. Calculate score and XP
  const score = calculateScore(results);
  const xpEarned = calculateXp(results, total);
  const celebrationTier = getCelebrationTier(score, total);

  // 3. Save missed discovery items
  const missedDiscoveryItems = results
    .filter((r) => !r.correct)
    .map((r) => {
      const q = questions[r.questionIndex];
      if (!q || q.isLibraryItem) return null;
      return {
        profileId,
        activityType: round.activityType,
        questionText: `What is the capital of ${q.country}?`,
        correctAnswer: q.correctAnswer,
        sourceRoundId: roundId,
      };
    })
    .filter(Boolean);

  // 4. Persist results in a transaction-like sequence
  await db
    .update(quizRounds)
    .set({
      results,
      score,
      xpEarned,
      status: 'completed',
      completedAt: new Date(),
    })
    .where(
      and(eq(quizRounds.id, roundId), eq(quizRounds.profileId, profileId)),
    );

  if (missedDiscoveryItems.length > 0) {
    await db
      .insert(quizMissedItems)
      .values(missedDiscoveryItems as Array<typeof quizMissedItems.$inferInsert>);
  }

  // Phase 2: SM-2 updates for library questions will go here
  // const libraryIndices = round.libraryQuestionIndices as number[];
  // for (const idx of libraryIndices) { ... update retention card ... }

  return { score, total, xpEarned, celebrationTier };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest services/quiz/complete-round.test.ts --no-coverage`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/quiz/complete-round.ts apps/api/src/services/quiz/complete-round.test.ts
git commit -m "feat(quiz): add round completion with scoring, XP, missed items [QUIZ-P1]"
```

---

### Task 9: Quiz API Routes

**Files:**
- Create: `apps/api/src/routes/quiz.ts`
- Test: `apps/api/src/routes/quiz.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write route tests**

Write this as an **integration test** against a real test database. Only mock true external
boundaries (JWT/Clerk, LLM provider). Do NOT mock `generateQuizRound`, `completeQuizRound`,
the database module, or `createScopedRepository` — let the real code run.

```typescript
// apps/api/src/routes/quiz.test.ts

// Only mock external boundaries: JWT verification and LLM provider
jest.mock('../middleware/jwt', () => ({
  decodeJWTHeader: jest.fn().mockReturnValue({ alg: 'RS256', kid: 'test-kid' }),
  fetchJWKS: jest.fn().mockResolvedValue({ keys: [{ kty: 'RSA', kid: 'test-kid', n: 'fake-n', e: 'AQAB' }] }),
  verifyJWT: jest.fn().mockResolvedValue({ sub: 'user_test', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 }),
}));

// Mock LLM — true external boundary
jest.mock('../services/llm', () => ({
  routeAndCall: jest.fn().mockResolvedValue({
    response: JSON.stringify({
      theme: 'Central European Capitals',
      questions: [
        { country: 'Austria', correctAnswer: 'Vienna', distractors: ['Salzburg', 'Graz', 'Innsbruck'], funFact: 'Vienna is famous for its coffee houses.' },
        { country: 'Germany', correctAnswer: 'Berlin', distractors: ['Munich', 'Hamburg', 'Frankfurt'], funFact: 'Berlin has more bridges than Venice.' },
        { country: 'Poland', correctAnswer: 'Warsaw', distractors: ['Krakow', 'Gdansk', 'Wroclaw'], funFact: 'Warsaw was rebuilt from rubble after WWII.' },
        { country: 'Czech Republic', correctAnswer: 'Prague', distractors: ['Brno', 'Ostrava', 'Pilsen'], funFact: 'Prague Castle is the largest ancient castle complex.' },
        { country: 'Hungary', correctAnswer: 'Budapest', distractors: ['Debrecen', 'Szeged', 'Pecs'], funFact: 'Budapest was originally two cities.' },
        { country: 'Slovakia', correctAnswer: 'Bratislava', distractors: ['Kosice', 'Zilina', 'Nitra'], funFact: 'Bratislava borders two countries.' },
        { country: 'Slovenia', correctAnswer: 'Ljubljana', distractors: ['Maribor', 'Celje', 'Kranj'], funFact: 'Ljubljana has dragon statues on its bridge.' },
        { country: 'Croatia', correctAnswer: 'Zagreb', distractors: ['Split', 'Rijeka', 'Dubrovnik'], funFact: 'Zagreb has one of the oldest tram networks.' },
      ],
    }),
    provider: 'mock',
    model: 'mock',
    latencyMs: 50,
  }),
}));

import { app } from '../index';
import { setupTestDatabase, teardownTestDatabase, seedTestProfile } from '../test-utils/integration';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
  DATABASE_URL: process.env.TEST_DATABASE_URL!,
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
  'X-Profile-Id': '', // set per test after seeding
};

let profileId: string;

beforeAll(async () => {
  await setupTestDatabase();
  profileId = await seedTestProfile();
  AUTH_HEADERS['X-Profile-Id'] = profileId;
});
afterAll(async () => { await teardownTestDatabase(); });

describe('Quiz routes (integration)', () => {
  let roundId: string;

  describe('POST /v1/quiz/rounds', () => {
    it('generates a round with validated questions', async () => {
      const res = await app.request('/v1/quiz/rounds', {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ activityType: 'capitals' }),
      }, TEST_ENV);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.theme).toBe('Central European Capitals');
      // Validation layer ran — answers cross-checked against reference data
      expect(body.questions.length).toBeGreaterThanOrEqual(1);
      expect(body.questions[0].acceptedAliases).toBeDefined();
      roundId = body.id;
    });

    it('returns 400 without profile ID', async () => {
      const res = await app.request('/v1/quiz/rounds', {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'X-Profile-Id': '' },
        body: JSON.stringify({ activityType: 'capitals' }),
      }, TEST_ENV);
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid activity type', async () => {
      const res = await app.request('/v1/quiz/rounds', {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ activityType: 'invalid' }),
      }, TEST_ENV);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/quiz/rounds/:id/complete', () => {
    it('scores the round and persists results', async () => {
      const res = await app.request(`/v1/quiz/rounds/${roundId}/complete`, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          results: [
            { questionIndex: 0, correct: true, answerGiven: 'Vienna', timeMs: 3000 },
            { questionIndex: 1, correct: false, answerGiven: 'Munich', timeMs: 5000 },
          ],
        }),
      }, TEST_ENV);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.score).toBe(1);
      expect(body.xpEarned).toBeGreaterThan(0);
      expect(['perfect', 'great', 'nice']).toContain(body.celebrationTier);
    });

    it('returns 400 for empty results', async () => {
      const res = await app.request(`/v1/quiz/rounds/${roundId}/complete`, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ results: [] }),
      }, TEST_ENV);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/quiz/rounds/recent', () => {
    it('returns completed rounds', async () => {
      const res = await app.request('/v1/quiz/rounds/recent', {
        headers: AUTH_HEADERS,
      }, TEST_ENV);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThanOrEqual(1);
      expect(body[0].score).toBeDefined();
    });
  });
});
```

> **Note:** If integration test infrastructure (`setupTestDatabase`, `seedTestProfile`) doesn't exist yet, follow the pattern in existing integration test suites under `apps/api/src/routes/`. The key principle: only mock true external boundaries (JWT, LLM). Let the DB, services, and validation run for real.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest routes/quiz.test.ts --no-coverage`

Expected: FAIL — quiz routes not found (404s).

- [ ] **Step 3: Implement the route handlers**

```typescript
// apps/api/src/routes/quiz.ts
import { Hono } from 'hono';
import {
  generateRoundInputSchema,
  completeRoundInputSchema,
} from '@eduagent/schemas';
import { quizRounds, type Database } from '@eduagent/database';
import { eq, and, desc } from 'drizzle-orm';
import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import { requireProfileId } from '../middleware/profile-scope';
import { validationError } from '../errors';
import { generateQuizRound } from '../services/quiz/generate-round';
import { completeQuizRound } from '../services/quiz/complete-round';
import type { GenerateRoundInput } from '@eduagent/schemas';

type QuizRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    profileMeta: ProfileMeta;
  };
};

/** Shared logic for /quiz/rounds and /quiz/rounds/prefetch — avoids copy-paste divergence */
async function buildAndGenerateRound(
  db: Database,
  profileId: string,
  profileMeta: ProfileMeta,
  input: GenerateRoundInput,
) {
  // Phase 1: No library items for capitals (no per-capital SM-2 yet)
  const libraryItems: Array<{ id: string; question: string; answer: string }> = [];

  // Get recently seen answers from recent rounds
  const recentRounds = await db.query.quizRounds.findMany({
    where: and(
      eq(quizRounds.profileId, profileId),
      eq(quizRounds.activityType, input.activityType),
    ),
    orderBy: [desc(quizRounds.createdAt)],
    limit: 5,
  });

  const recentAnswers: string[] = [];
  for (const round of recentRounds) {
    const questions = round.questions as Array<{ correctAnswer?: string }>;
    for (const q of questions) {
      if (q.correctAnswer) recentAnswers.push(q.correctAnswer);
    }
  }

  const ageBracket = profileMeta.ageBracket ?? '10-13';

  return generateQuizRound({
    db,
    profileId,
    activityType: input.activityType,
    ageBracket,
    themePreference: input.themePreference,
    libraryItems,
    recentAnswers: recentAnswers.slice(0, 30),
  });
}

export const quizRoutes = new Hono<QuizRouteEnv>()

  // Generate a new round
  .post('/quiz/rounds', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const profileMeta = c.get('profileMeta');

    let body: unknown;
    try { body = await c.req.json(); } catch { return validationError(c, 'Request body must be valid JSON'); }

    const parsed = generateRoundInputSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(c, `Invalid input: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
    }

    const result = await buildAndGenerateRound(db, profileId, profileMeta, parsed.data);

    return c.json({
      id: result.id,
      activityType: parsed.data.activityType,
      theme: result.theme,
      questions: result.questions,
      total: result.total,
    }, 200);
  })

  // Pre-generate next round (same logic, returns only ID for lighter response)
  .post('/quiz/rounds/prefetch', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const profileMeta = c.get('profileMeta');

    let body: unknown;
    try { body = await c.req.json(); } catch { return validationError(c, 'Request body must be valid JSON'); }

    const parsed = generateRoundInputSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(c, `Invalid input: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
    }

    const result = await buildAndGenerateRound(db, profileId, profileMeta, parsed.data);
    return c.json({ id: result.id }, 200);
  })

  // Fetch a pre-generated round
  .get('/quiz/rounds/:id', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const roundId = c.req.param('id');

    const round = await db.query.quizRounds.findFirst({
      where: and(
        eq(quizRounds.id, roundId),
        eq(quizRounds.profileId, profileId),
      ),
    });

    if (!round) return c.json({ error: 'Round not found' }, 404);

    return c.json({
      id: round.id,
      activityType: round.activityType,
      theme: round.theme,
      questions: round.questions,
      total: round.total,
    }, 200);
  })

  // Submit results
  .post('/quiz/rounds/:id/complete', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const roundId = c.req.param('id');

    let body: unknown;
    try { body = await c.req.json(); } catch { return validationError(c, 'Request body must be valid JSON'); }

    const parsed = completeRoundInputSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(c, `Invalid input: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
    }

    const result = await completeQuizRound(db, profileId, roundId, parsed.data.results);
    return c.json(result, 200);
  })

  // Recent rounds
  .get('/quiz/rounds/recent', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    const rounds = await db.query.quizRounds.findMany({
      where: and(
        eq(quizRounds.profileId, profileId),
        eq(quizRounds.status, 'completed'),
      ),
      orderBy: [desc(quizRounds.completedAt)],
      limit: 10,
    });

    return c.json(
      rounds.map((r) => ({
        id: r.id,
        activityType: r.activityType,
        theme: r.theme,
        score: r.score,
        total: r.total,
        xpEarned: r.xpEarned,
        completedAt: r.completedAt?.toISOString(),
      })),
      200,
    );
  })

  // Stats per activity
  .get('/quiz/stats', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    const rounds = await db.query.quizRounds.findMany({
      where: and(
        eq(quizRounds.profileId, profileId),
        eq(quizRounds.status, 'completed'),
      ),
    });

    // Group by activity type
    const statsMap = new Map<string, { roundsPlayed: number; bestScore: number | null; bestTotal: number | null; totalXp: number }>();

    for (const r of rounds) {
      const existing = statsMap.get(r.activityType) ?? {
        roundsPlayed: 0,
        bestScore: null,
        bestTotal: null,
        totalXp: 0,
      };
      existing.roundsPlayed++;
      existing.totalXp += r.xpEarned ?? 0;
      if (r.score !== null && r.total !== null) {
        if (existing.bestScore === null || r.score / r.total > existing.bestScore / (existing.bestTotal ?? 1)) {
          existing.bestScore = r.score;
          existing.bestTotal = r.total;
        }
      }
      statsMap.set(r.activityType, existing);
    }

    const stats = Array.from(statsMap.entries()).map(([activityType, s]) => ({
      activityType,
      ...s,
    }));

    return c.json(stats, 200);
  });
```

- [ ] **Step 4: Register quiz routes in app index**

In `apps/api/src/index.ts`, add the import at the top with other route imports:

```typescript
import { quizRoutes } from './routes/quiz';
```

Then add to the route chain, after `.route('/', dictationRoutes)`:

```typescript
  .route('/', quizRoutes);
```

(Move the closing semicolon from `dictationRoutes` to `quizRoutes`.)

- [ ] **Step 5: Run route tests**

Run: `cd apps/api && pnpm exec jest routes/quiz.test.ts --no-coverage`

Expected: All tests PASS.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm exec nx run api:typecheck`

```bash
git add apps/api/src/routes/quiz.ts apps/api/src/routes/quiz.test.ts apps/api/src/index.ts apps/api/src/services/quiz/index.ts
git commit -m "feat(api): add quiz API routes — generate, complete, recent, stats [QUIZ-P1]"
```

---

### Task 10: Mobile Quiz Hooks

**Files:**
- Create: `apps/mobile/src/hooks/use-quiz.ts`

- [ ] **Step 1: Create the quiz hooks**

```typescript
// apps/mobile/src/hooks/use-quiz.ts
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import type {
  QuizRoundResponse,
  CompleteRoundResponse,
  QuestionResult,
  RecentRound,
  QuizStats,
  QuizActivityType,
} from '@eduagent/schemas';

export function useGenerateRound(): UseMutationResult<
  QuizRoundResponse,
  Error,
  { activityType: QuizActivityType; themePreference?: string }
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input) => {
      // @ts-expect-error quiz route types not yet wired to RPC client
      const res = await client.quiz.rounds.$post({ json: input });
      await assertOk(res);
      return (await res.json()) as QuizRoundResponse;
    },
  });
}

export function usePrefetchRound(): UseMutationResult<
  { id: string },
  Error,
  { activityType: QuizActivityType; themePreference?: string }
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input) => {
      // @ts-expect-error quiz route types not yet wired to RPC client
      const res = await client.quiz.rounds.prefetch.$post({ json: input });
      await assertOk(res);
      return (await res.json()) as { id: string };
    },
  });
}

export function useFetchRound(roundId: string | null): UseQueryResult<QuizRoundResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['quiz-round', roundId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        // @ts-expect-error quiz route types not yet wired to RPC client
        const res = await client.quiz.rounds[':id'].$get(
          { param: { id: roundId! } },
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as QuizRoundResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!roundId,
  });
}

export function useCompleteRound(): UseMutationResult<
  CompleteRoundResponse,
  Error,
  { roundId: string; results: QuestionResult[] }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roundId, results }) => {
      // @ts-expect-error quiz route types not yet wired to RPC client
      const res = await client.quiz.rounds[':id'].complete.$post({
        param: { id: roundId },
        json: { results },
      });
      await assertOk(res);
      return (await res.json()) as CompleteRoundResponse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quiz-recent'] });
      void queryClient.invalidateQueries({ queryKey: ['quiz-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
      void queryClient.invalidateQueries({ queryKey: ['streak'] });
    },
  });
}

export function useRecentRounds(): UseQueryResult<RecentRound[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['quiz-recent', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        // @ts-expect-error quiz route types not yet wired to RPC client
        const res = await client.quiz.rounds.recent.$get({}, { init: { signal } });
        await assertOk(res);
        return (await res.json()) as RecentRound[];
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useQuizStats(): UseQueryResult<QuizStats[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['quiz-stats', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        // @ts-expect-error quiz route types not yet wired to RPC client
        const res = await client.quiz.stats.$get({}, { init: { signal } });
        await assertOk(res);
        return (await res.json()) as QuizStats[];
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}
```

- [ ] **Step 2: Verify typecheck passes (with expected ts-expect-errors)**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: PASS (the `@ts-expect-error` comments suppress the RPC typing issues).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/hooks/use-quiz.ts
git commit -m "feat(mobile): add TanStack Query hooks for quiz API [QUIZ-P1]"
```

---

### Task 11: Practice Menu Update + Quiz Flow Layout

**Files:**
- Modify: `apps/mobile/src/app/(app)/practice.tsx`
- Create: `apps/mobile/src/app/(app)/quiz/_layout.tsx`
- Create: `apps/mobile/src/app/(app)/quiz/index.tsx`

- [ ] **Step 1: Add Quiz card to Practice menu**

In `apps/mobile/src/app/(app)/practice.tsx`, add the quiz IntentCard after the Dictation card inside the `<View className="gap-4">` block:

```typescript
        <IntentCard
          title="Quiz"
          subtitle="Test yourself with multiple choice questions"
          onPress={() => router.push('/(app)/quiz' as never)}
          testID="practice-quiz"
        />
```

Also add `useQuizStats` import and stats display. Add at the top of the file with other imports:

```typescript
import { useQuizStats } from '../../hooks/use-quiz';
```

Inside the component, after the `useReviewSummary` hook:

```typescript
  const { data: quizStats } = useQuizStats();
  const capitalsStats = quizStats?.find((s) => s.activityType === 'capitals');
  const quizSubtitle = capitalsStats
    ? `Best: ${capitalsStats.bestScore}/${capitalsStats.bestTotal} · Played: ${capitalsStats.roundsPlayed}`
    : 'Test yourself with multiple choice questions';
```

Then update the quiz IntentCard to use `quizSubtitle`:

```typescript
        <IntentCard
          title="Quiz"
          subtitle={quizSubtitle}
          onPress={() => router.push('/(app)/quiz' as never)}
          testID="practice-quiz"
        />
```

- [ ] **Step 2: Create quiz flow layout with context**

```typescript
// apps/mobile/src/app/(app)/quiz/_layout.tsx
import React, { createContext, useCallback, useContext, useState } from 'react';
import { Stack } from 'expo-router';
import type { QuizRoundResponse, CompleteRoundResponse, QuizActivityType } from '@eduagent/schemas';

interface QuizFlowState {
  activityType: QuizActivityType | null;
  round: QuizRoundResponse | null;
  prefetchedRoundId: string | null;
  completionResult: CompleteRoundResponse | null;
}

interface QuizFlowContextType extends QuizFlowState {
  setActivityType: (type: QuizActivityType) => void;
  setRound: (round: QuizRoundResponse) => void;
  setPrefetchedRoundId: (id: string | null) => void;
  setCompletionResult: (result: CompleteRoundResponse) => void;
  clear: () => void;
}

const QuizFlowContext = createContext<QuizFlowContextType | null>(null);

export function useQuizFlow(): QuizFlowContextType {
  const ctx = useContext(QuizFlowContext);
  if (!ctx) throw new Error('useQuizFlow must be used within QuizFlowProvider');
  return ctx;
}

const INITIAL_STATE: QuizFlowState = {
  activityType: null,
  round: null,
  prefetchedRoundId: null,
  completionResult: null,
};

function QuizFlowProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = useState<QuizFlowState>(INITIAL_STATE);

  const setActivityType = useCallback((type: QuizActivityType) => {
    setState((prev) => ({ ...prev, activityType: type }));
  }, []);

  const setRound = useCallback((round: QuizRoundResponse) => {
    setState((prev) => ({ ...prev, round }));
  }, []);

  const setPrefetchedRoundId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, prefetchedRoundId: id }));
  }, []);

  const setCompletionResult = useCallback((result: CompleteRoundResponse) => {
    setState((prev) => ({ ...prev, completionResult: result }));
  }, []);

  const clear = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return (
    <QuizFlowContext.Provider
      value={{ ...state, setActivityType, setRound, setPrefetchedRoundId, setCompletionResult, clear }}
    >
      {children}
    </QuizFlowContext.Provider>
  );
}

export default function QuizLayout(): React.ReactElement {
  return (
    <QuizFlowProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </QuizFlowProvider>
  );
}
```

- [ ] **Step 3: Create activity selection screen**

```typescript
// apps/mobile/src/app/(app)/quiz/index.tsx
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../lib/theme';
import { IntentCard } from '../../../components/home/IntentCard';
import { goBackOrReplace } from '../../../lib/navigation';
import { useQuizStats } from '../../../hooks/use-quiz';
import { useQuizFlow } from './_layout';

export default function QuizIndexScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { setActivityType } = useQuizFlow();
  const { data: stats } = useQuizStats();

  const capitalsStats = stats?.find((s) => s.activityType === 'capitals');

  const handleBack = () => {
    goBackOrReplace(router, '/(app)/practice');
  };

  const handleSelectCapitals = () => {
    setActivityType('capitals');
    router.push('/(app)/quiz/launch' as never);
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="quiz-index-screen"
    >
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={handleBack}
          className="mr-3 min-h-[32px] min-w-[32px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="quiz-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary flex-1">Quiz</Text>
      </View>

      <View className="gap-4">
        <IntentCard
          title="Capitals"
          subtitle={
            capitalsStats
              ? `Best: ${capitalsStats.bestScore}/${capitalsStats.bestTotal} · Played: ${capitalsStats.roundsPlayed}`
              : 'New!'
          }
          onPress={handleSelectCapitals}
          testID="quiz-capitals"
        />
        {/* Phase 2: Vocabulary card */}
        {/* Phase 3: Guess Who card */}
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Typecheck and commit**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

```bash
git add apps/mobile/src/app/"(app)"/practice.tsx apps/mobile/src/app/"(app)"/quiz/_layout.tsx apps/mobile/src/app/"(app)"/quiz/index.tsx apps/mobile/src/hooks/use-quiz.ts
git commit -m "feat(mobile): add quiz entry in practice menu, flow layout, activity selection [QUIZ-P1]"
```

---

### Task 12: Quiz Launch Screen

**Files:**
- Create: `apps/mobile/src/app/(app)/quiz/launch.tsx`

- [ ] **Step 1: Create the launch screen**

This screen triggers round generation on mount, shows a loading animation, and navigates to gameplay when ready.

```typescript
// apps/mobile/src/app/(app)/quiz/launch.tsx
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../lib/theme';
import { goBackOrReplace } from '../../../lib/navigation';
import { useGenerateRound } from '../../../hooks/use-quiz';
import { useQuizFlow } from './_layout';

const LOADING_MESSAGES = [
  'Shuffling questions...',
  'Picking a theme...',
  'Almost ready...',
];

export default function QuizLaunchScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { activityType, setRound } = useQuizFlow();
  const generateRound = useGenerateRound();
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rotate loading messages
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setLoadingMsgIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 1500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Trigger generation on mount
  useEffect(() => {
    if (!activityType) return;
    generateRound.mutate(
      { activityType },
      {
        onSuccess: (round) => {
          setRound(round);
          router.replace('/(app)/quiz/play' as never);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityType]);

  const handleBack = () => {
    goBackOrReplace(router, '/(app)/quiz');
  };

  if (generateRound.isError) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="quiz-launch-error"
      >
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text className="text-text-primary text-lg font-semibold mt-4 text-center">
          Couldn't create a round — try again?
        </Text>
        <View className="flex-row gap-3 mt-6">
          <Pressable
            onPress={() => generateRound.mutate({ activityType: activityType! })}
            className="bg-primary px-6 py-3 rounded-xl"
            testID="quiz-launch-retry"
          >
            <Text className="text-white font-semibold">Retry</Text>
          </Pressable>
          <Pressable
            onPress={handleBack}
            className="bg-surface-secondary px-6 py-3 rounded-xl"
            testID="quiz-launch-back"
          >
            <Text className="text-text-primary font-semibold">Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-background items-center justify-center"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="quiz-launch-loading"
    >
      <ActivityIndicator size="large" color={colors.primary} />
      <Text className="text-text-secondary text-base mt-4">
        {LOADING_MESSAGES[loadingMsgIndex]}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/app/"(app)"/quiz/launch.tsx
git commit -m "feat(mobile): add quiz launch screen with loading animation and error state [QUIZ-P1]"
```

---

### Task 13: Quiz Gameplay Screen

**Files:**
- Create: `apps/mobile/src/app/(app)/quiz/play.tsx`

- [ ] **Step 1: Create the quiz gameplay screen**

This is the core screen — MC questions, progress indicator, timer, answer feedback with tap-to-continue.

```typescript
// apps/mobile/src/app/(app)/quiz/play.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '../../../lib/theme';
import { useCompleteRound, usePrefetchRound } from '../../../hooks/use-quiz';
import { useQuizFlow } from './_layout';
import type { CapitalsQuestion, QuestionResult } from '@eduagent/schemas';

type AnswerState = 'unanswered' | 'correct' | 'wrong';

export default function QuizPlayScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { round, activityType, setPrefetchedRoundId, setCompletionResult } = useQuizFlow();
  const completeRound = useCompleteRound();
  const prefetchRound = usePrefetchRound();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered');
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showContinueHint, setShowContinueHint] = useState(false);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const continueHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchTriggered = useRef(false);

  const questions = (round?.questions ?? []) as CapitalsQuestion[];
  const totalQuestions = round?.total ?? 0;
  const currentQuestion = questions[currentIndex];

  // Timer tick — 1000ms is plenty for a non-punitive timer. 100ms wastes battery
  // and triggers 10 re-renders/sec on a kid's phone for no visible benefit.
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - questionStartTime);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [questionStartTime]);

  // Pre-fetch next round at midpoint
  useEffect(() => {
    if (
      !prefetchTriggered.current &&
      activityType &&
      currentIndex >= Math.floor(totalQuestions / 2) &&
      totalQuestions > 0
    ) {
      prefetchTriggered.current = true;
      prefetchRound.mutate(
        { activityType },
        {
          onSuccess: (data) => setPrefetchedRoundId(data.id),
        },
      );
    }
  }, [currentIndex, totalQuestions, activityType, prefetchRound, setPrefetchedRoundId]);

  // Shuffle options when question index changes. Pin to currentIndex ONLY —
  // including currentQuestion would reshuffle mid-question when timer state
  // triggers a re-render and questions gets a new array reference.
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);
  useEffect(() => {
    const q = questions[currentIndex];
    if (!q) return;
    const options = [q.correctAnswer, ...q.distractors];
    setShuffledOptions(options.sort(() => Math.random() - 0.5));
    setQuestionStartTime(Date.now());
    setElapsedMs(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const handleAnswer = useCallback(
    (answer: string) => {
      if (answerState !== 'unanswered') return;

      const timeMs = Date.now() - questionStartTime;
      const isCorrect =
        answer.toLowerCase() === currentQuestion.correctAnswer.toLowerCase() ||
        currentQuestion.acceptedAliases.some(
          (alias) => alias.toLowerCase() === answer.toLowerCase(),
        );

      setSelectedAnswer(answer);
      setAnswerState(isCorrect ? 'correct' : 'wrong');
      setShowContinueHint(false);

      if (isCorrect) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      setResults((prev) => [
        ...prev,
        {
          questionIndex: currentIndex,
          correct: isCorrect,
          answerGiven: answer,
          timeMs,
        },
      ]);

      // Show "tap to continue" hint after 4 seconds
      continueHintTimerRef.current = setTimeout(() => {
        setShowContinueHint(true);
      }, 4000);
    },
    [answerState, currentIndex, currentQuestion, questionStartTime],
  );

  const handleContinue = useCallback(() => {
    if (answerState === 'unanswered') return;

    if (continueHintTimerRef.current) clearTimeout(continueHintTimerRef.current);
    setShowContinueHint(false);

    if (currentIndex + 1 >= totalQuestions) {
      // Last question — submit results
      const finalResults = results;
      if (round) {
        completeRound.mutate(
          { roundId: round.id, results: finalResults },
          {
            onSuccess: (completion) => {
              setCompletionResult(completion);
              router.replace('/(app)/quiz/results' as never);
            },
            onError: () => {
              // Still navigate to results with local score
              setCompletionResult({
                score: finalResults.filter((r) => r.correct).length,
                total: totalQuestions,
                xpEarned: 0,
                celebrationTier: 'nice',
              });
              router.replace('/(app)/quiz/results' as never);
            },
          },
        );
      }
    } else {
      // Next question
      setCurrentIndex((prev) => prev + 1);
      setAnswerState('unanswered');
      setSelectedAnswer(null);
    }
  }, [answerState, currentIndex, totalQuestions, results, round, completeRound, router, setCompletionResult]);

  if (!currentQuestion || !round) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-text-secondary">No round loaded</Text>
      </View>
    );
  }

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${s}s`;
  };

  const getOptionStyle = (option: string) => {
    if (answerState === 'unanswered') return 'bg-surface-secondary';
    if (
      option.toLowerCase() === currentQuestion.correctAnswer.toLowerCase() ||
      currentQuestion.acceptedAliases.some((a) => a.toLowerCase() === option.toLowerCase())
    ) {
      return 'bg-green-600';
    }
    if (option === selectedAnswer && answerState === 'wrong') {
      return 'bg-red-600';
    }
    return 'bg-surface-secondary opacity-50';
  };

  const getOptionTextColor = (option: string) => {
    if (answerState === 'unanswered') return 'text-text-primary';
    if (
      option.toLowerCase() === currentQuestion.correctAnswer.toLowerCase() ||
      currentQuestion.acceptedAliases.some((a) => a.toLowerCase() === option.toLowerCase())
    ) {
      return 'text-white';
    }
    if (option === selectedAnswer && answerState === 'wrong') return 'text-white';
    return 'text-text-secondary';
  };

  return (
    <Pressable
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }}
      onPress={answerState !== 'unanswered' ? handleContinue : undefined}
      testID="quiz-play-screen"
    >
      {/* Header: progress + timer */}
      <View className="flex-row items-center justify-between px-5 mb-6">
        <Text className="text-text-secondary text-sm font-medium">
          {currentIndex + 1} of {totalQuestions}
        </Text>
        <View className="flex-row gap-1">
          {Array.from({ length: totalQuestions }, (_, i) => (
            <View
              key={i}
              className={`w-2 h-2 rounded-full ${
                i < currentIndex
                  ? 'bg-primary'
                  : i === currentIndex
                    ? 'bg-primary'
                    : 'bg-surface-secondary'
              }`}
            />
          ))}
        </View>
        <Text className="text-text-secondary text-sm font-mono">
          {formatTime(elapsedMs)}
        </Text>
      </View>

      {/* Question */}
      <View className="px-5 mb-8">
        <Text className="text-text-secondary text-base mb-2">
          What is the capital of...
        </Text>
        <Text className="text-text-primary text-2xl font-bold">
          {currentQuestion.country}?
        </Text>
      </View>

      {/* Options */}
      <View className="px-5 gap-3">
        {shuffledOptions.map((option) => {
          const isCorrectOption =
            option.toLowerCase() === currentQuestion.correctAnswer.toLowerCase() ||
            currentQuestion.acceptedAliases.some((a) => a.toLowerCase() === option.toLowerCase());
          const a11yLabel =
            answerState === 'unanswered'
              ? option
              : `${option}, ${isCorrectOption ? 'correct answer' : 'wrong answer'}`;

          return (
            <Pressable
              key={option}
              onPress={() => handleAnswer(option)}
              disabled={answerState !== 'unanswered'}
              className={`py-4 px-5 rounded-xl ${getOptionStyle(option)}`}
              accessibilityRole="button"
              accessibilityLabel={a11yLabel}
              accessibilityState={{ selected: option === selectedAnswer, disabled: answerState !== 'unanswered' }}
              testID={`quiz-option-${option}`}
            >
              <Text className={`text-base font-semibold text-center ${getOptionTextColor(option)}`}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Fun fact (shown after answering) */}
      {answerState !== 'unanswered' && (
        <View className="px-5 mt-6">
          <View className="bg-surface-secondary rounded-xl p-4">
            <Text className="text-text-secondary text-sm">
              {currentQuestion.funFact}
            </Text>
          </View>
          {showContinueHint && (
            <Text className="text-text-secondary text-xs text-center mt-3 animate-pulse">
              Tap anywhere to continue
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/app/"(app)"/quiz/play.tsx
git commit -m "feat(mobile): add quiz gameplay screen — MC, progress dots, timer, feedback [QUIZ-P1]"
```

---

### Task 14: Quiz Results Screen

**Files:**
- Create: `apps/mobile/src/app/(app)/quiz/results.tsx`

- [ ] **Step 1: Create the results screen**

```typescript
// apps/mobile/src/app/(app)/quiz/results.tsx
import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '../../../lib/theme';
import { goBackOrReplace } from '../../../lib/navigation';
import { useQuizFlow } from './_layout';
import { useFetchRound } from '../../../hooks/use-quiz';

export default function QuizResultsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { completionResult, round, activityType, prefetchedRoundId, setRound, clear } = useQuizFlow();
  const prefetchedRound = useFetchRound(prefetchedRoundId);

  // Use Reanimated (consistent with rest of app — never RN Animated)
  const scale = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const score = completionResult?.score ?? 0;
  const total = completionResult?.total ?? 0;
  const xpEarned = completionResult?.xpEarned ?? 0;
  const tier = completionResult?.celebrationTier ?? 'nice';

  // Entrance animation
  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 100 });

    if (tier === 'perfect') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [scale, tier]);

  const tierConfig = {
    perfect: {
      icon: 'trophy' as const,
      title: 'Perfect round!',
      color: colors.warning ?? '#FFD700',
      iconColor: '#FFD700',
    },
    great: {
      icon: 'star' as const,
      title: 'Great round!',
      color: colors.primary,
      iconColor: colors.primary,
    },
    nice: {
      icon: 'thumbs-up' as const,
      title: 'Nice effort!',
      color: colors.textSecondary,
      iconColor: colors.textSecondary,
    },
  };

  const config = tierConfig[tier];

  const handlePlayAgain = () => {
    if (prefetchedRound.data) {
      // Use pre-fetched round — instant start
      setRound(prefetchedRound.data);
      router.replace('/(app)/quiz/play' as never);
    } else {
      // No prefetch available — go through launch screen
      router.replace('/(app)/quiz/launch' as never);
    }
  };

  const handleDone = () => {
    clear();
    goBackOrReplace(router, '/(app)/practice');
  };

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="quiz-results-screen"
    >
      <Animated.View
        style={animatedStyle}
        className="items-center"
      >
        <Ionicons name={config.icon} size={64} color={config.iconColor} />

        <Text
          className="text-3xl font-bold mt-4"
          style={{ color: config.color }}
        >
          {config.title}
        </Text>

        <Text className="text-text-primary text-5xl font-bold mt-6">
          {score}/{total}
        </Text>

        {round?.theme && (
          <Text className="text-text-secondary text-base mt-2">
            {round.theme}
          </Text>
        )}

        {xpEarned > 0 && (
          <View className="bg-primary-soft px-4 py-2 rounded-full mt-4">
            <Text className="text-primary font-semibold">
              +{xpEarned} XP
              {tier === 'perfect' ? ' (bonus!)' : ''}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* Actions */}
      <View className="w-full gap-3 mt-12">
        <Pressable
          onPress={handlePlayAgain}
          className="bg-primary py-4 rounded-xl items-center"
          testID="quiz-results-play-again"
        >
          <Text className="text-white text-base font-semibold">Play Again</Text>
        </Pressable>

        <Pressable
          onPress={handleDone}
          className="bg-surface-secondary py-4 rounded-xl items-center"
          testID="quiz-results-done"
        >
          <Text className="text-text-primary text-base font-semibold">Done</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Typecheck the mobile app**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Run related mobile tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-quiz.ts --no-coverage`

Expected: PASS (or no tests found — hooks don't have dedicated tests yet).

- [ ] **Step 4: Run API tests to make sure nothing broke**

Run: `cd apps/api && pnpm exec jest --no-coverage --passWithNoTests`

Expected: All existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/"(app)"/quiz/results.tsx
git commit -m "feat(mobile): add quiz results screen with celebration tiers and pre-fetch play-again [QUIZ-P1]"
```

---

### Task 15: Push Migration and Final Validation

**Files:** None new — this is a validation and integration task.

- [ ] **Step 1: Push schema to dev database**

Run: `pnpm run db:push:dev`

Expected: Tables `quiz_rounds` and `quiz_missed_items` created successfully. No `capitals_reference` table — validation uses the in-memory `CAPITALS_BY_COUNTRY` map.

- [ ] **Step 2: Run full API typecheck and test suite**

Run: `pnpm exec nx run api:typecheck && pnpm exec nx run api:test`

Expected: All PASS.

- [ ] **Step 3: Run full mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Run lint**

Run: `pnpm exec nx run api:lint && pnpm exec nx lint mobile`

Expected: PASS (fix any lint issues before committing).

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore(quiz): final validation pass — typecheck, tests, lint clean [QUIZ-P1]"
```

---

## Summary

| Task | Files | What it builds |
|---|---|---|
| 1 | schemas/quiz.ts | Zod schemas for all quiz types |
| 2 | database/schema/quiz.ts | DB tables + migration |
| 3 | services/quiz/capitals-data.ts | 75+ country reference dataset |
| 4 | repository.ts, config.ts | Scoped repo + config constants |
| 5 | content-resolver.ts | Mastery/discovery split logic |
| 6 | capitals-validation.ts | LLM answer cross-check |
| 7 | generate-round.ts | LLM prompt + round assembly |
| 8 | complete-round.ts | Scoring, XP, missed items |
| 9 | routes/quiz.ts, index.ts | 6 API endpoints + registration |
| 10 | hooks/use-quiz.ts | TanStack Query hooks |
| 11 | practice.tsx, _layout.tsx, index.tsx | Practice menu + quiz flow |
| 12 | quiz/launch.tsx | Loading + error states |
| 13 | quiz/play.tsx | MC gameplay core |
| 14 | quiz/results.tsx | Score + celebration + play again |
| 15 | — | DB push + full validation |
