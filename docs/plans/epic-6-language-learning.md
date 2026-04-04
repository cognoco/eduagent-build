# Epic 6: Language Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add language learning support using Nation's Four Strands methodology — language detection, direct instruction (not Socratic), vocabulary/chunk tracking with SM-2, CEFR micro-milestones, fluency drills, and voice integration.

**Architecture:** Extend the existing subject → curriculum → session → retention pipeline. A new `pedagogyMode` on subjects forks `buildSystemPrompt()` between Socratic and Four Strands. Vocabulary items get their own table and SM-2 retention cards (separate from topic-level cards). CEFR milestones map to `curriculumTopics` with extra language metadata. Voice uses existing Epic 8 infrastructure (`expo-speech-recognition`, `expo-speech`) with target-language STT/TTS locale configuration.

**Tech Stack:** Drizzle ORM (schema), Hono (API routes), Zod 4 (validation), packages/retention SM-2 (vocab spaced repetition), expo-speech-recognition (STT), expo-speech (TTS), TanStack Query (mobile data fetching), NativeWind (mobile UI)

**Spec:** `docs/superpowers/specs/2026-04-04-epic-6-language-learning-design.md`

---

## File Map

### New Files

| File | Purpose |
|------|---------|
| `apps/api/src/data/languages.ts` | Static language registry (names, aliases, FSI data, STT/TTS locales) |
| `apps/api/src/data/languages.test.ts` | Tests for language detection helper |
| `packages/database/src/schema/language.ts` | `vocabulary` + `vocabularyRetentionCards` tables, `pedagogyModeEnum`, `vocabTypeEnum` |
| `packages/schemas/src/language.ts` | Zod schemas for vocabulary, CEFR progress, language detection |
| `apps/api/src/services/language-detect.ts` | Language detection service (keyword match + LLM boolean) |
| `apps/api/src/services/language-detect.test.ts` | Tests for language detection |
| `apps/api/src/services/vocabulary.ts` | Vocabulary CRUD + SM-2 retention updates |
| `apps/api/src/services/vocabulary.test.ts` | Tests for vocabulary service |
| `apps/api/src/services/vocabulary-extract.ts` | Post-session LLM call to extract vocabulary from transcript |
| `apps/api/src/services/vocabulary-extract.test.ts` | Tests for vocabulary extraction |
| `apps/api/src/services/language-curriculum.ts` | CEFR-aligned curriculum generation for languages |
| `apps/api/src/services/language-curriculum.test.ts` | Tests for language curriculum |
| `apps/api/src/services/language-prompts.ts` | Four Strands system prompt sections |
| `apps/api/src/services/language-prompts.test.ts` | Tests for language prompt assembly |
| `apps/api/src/routes/vocabulary.ts` | Vocabulary API routes |
| `apps/api/src/routes/vocabulary.test.ts` | Tests for vocabulary routes |
| `apps/api/src/routes/language-progress.ts` | CEFR progress + milestone API routes |
| `apps/api/src/routes/language-progress.test.ts` | Tests for language progress routes |
| `apps/mobile/src/app/(learner)/onboarding/language-setup.tsx` | Language onboarding screen (native language, level picker) |
| `apps/mobile/src/app/(learner)/onboarding/language-setup.test.tsx` | Tests for language setup screen |
| `apps/mobile/src/components/language/MilestoneCard.tsx` | CEFR milestone progress card |
| `apps/mobile/src/components/language/MilestoneCard.test.tsx` | Tests for milestone card |
| `apps/mobile/src/components/language/FluentDrill.tsx` | Timed fluency drill component |
| `apps/mobile/src/components/language/FluentDrill.test.tsx` | Tests for fluency drill |
| `apps/mobile/src/components/language/VocabularyList.tsx` | Vocabulary review list |
| `apps/mobile/src/components/language/VocabularyList.test.tsx` | Tests for vocabulary list |
| `apps/mobile/src/hooks/use-vocabulary.ts` | TanStack Query hooks for vocabulary API |
| `apps/mobile/src/hooks/use-language-progress.ts` | TanStack Query hooks for CEFR progress API |

### Modified Files

| File | Changes |
|------|---------|
| `packages/database/src/schema/subjects.ts` | Add `pedagogyMode` + `languageCode` columns to `subjects`; add `cefrLevel`, `cefrSublevel`, `targetWordCount`, `targetChunkCount` to `curriculumTopics` |
| `packages/database/src/schema/assessments.ts` | Add `nativeLanguage` column to `teachingPreferences` |
| `packages/database/src/schema/index.ts` | Export new `language.ts` schema |
| `packages/schemas/src/subjects.ts` | Add `pedagogyMode` to `subjectSchema` + `subjectCreateSchema`; add CEFR fields to `curriculumTopicSchema` |
| `packages/schemas/src/index.ts` | Export new `language.ts` schemas |
| `apps/api/src/services/exchanges.ts` | Add `pedagogyMode`, `nativeLanguage`, `knownVocabulary` to `ExchangeContext`; fork `buildSystemPrompt()` for Four Strands |
| `apps/api/src/services/subject-resolve.ts` | Add `isLanguageLearning` + `detectedLanguageCode` to LLM resolve prompt |
| `apps/api/src/services/subject.ts` | Set `pedagogyMode` on create when language detected; wire language curriculum generation |
| `apps/api/src/services/curriculum.ts` | Dispatch to `language-curriculum.ts` when `pedagogyMode === 'four_strands'` |
| `apps/api/src/services/retention-data.ts` | Add `setNativeLanguage()` and `getNativeLanguage()` helpers on `teachingPreferences` |
| `apps/api/src/inngest/functions/session-completed.ts` | Add `update-vocabulary-retention` + `check-milestone-completion` steps |
| `apps/api/src/routes/subjects.ts` | Return `pedagogyMode` in subject responses |
| `apps/api/src/routes/settings.ts` | Add `nativeLanguage` to teaching preferences endpoints |
| `apps/mobile/src/hooks/use-speech-recognition.ts` | Accept `lang` parameter for target-language STT |
| `apps/mobile/src/hooks/use-text-to-speech.ts` | Accept `language` parameter for target-language TTS |
| `apps/mobile/src/app/(learner)/onboarding/_layout.tsx` | Add `language-setup` route to onboarding flow |
| `apps/mobile/src/components/session/ChatShell.tsx` | Pass target language to voice hooks for language sessions |

---

## Task 1: Language Registry — Static Data

**Files:**
- Create: `apps/api/src/data/languages.ts`
- Create: `apps/api/src/data/languages.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/data/languages.test.ts
import { detectLanguageHint, getLanguageByCode, SUPPORTED_LANGUAGES } from './languages';

describe('language registry', () => {
  it('detects Spanish from exact name', () => {
    const result = detectLanguageHint('Spanish');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('es');
  });

  it('detects Spanish from alias Español', () => {
    const result = detectLanguageHint('Español');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('es');
  });

  it('detects from "Learn French" prefix', () => {
    const result = detectLanguageHint('Learn French');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('fr');
  });

  it('returns null for non-language subjects', () => {
    expect(detectLanguageHint('Physics')).toBeNull();
    expect(detectLanguageHint('Mathematics')).toBeNull();
  });

  // Note: detectLanguageHint is a fast-path HINT only.
  // Ambiguous inputs like "French Revolution" or "Spanish for history class"
  // may return a match — the LLM's isLanguageLearning boolean + learner
  // confirmation card handle disambiguation. The hint's job is speed, not accuracy.

  it('is case-insensitive', () => {
    const result = detectLanguageHint('SPANISH');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('es');
  });

  it('lookups by code', () => {
    const lang = getLanguageByCode('fr');
    expect(lang).not.toBeNull();
    expect(lang!.names).toContain('french');
  });

  it('has all Category I and II languages', () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(13);
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(codes).toContain('es');
    expect(codes).toContain('fr');
    expect(codes).toContain('de');
    expect(codes).toContain('it');
    expect(codes).toContain('pt');
    expect(codes).toContain('nb'); // Norwegian Bokmål
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/data/languages.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the language registry**

```typescript
// apps/api/src/data/languages.ts

export interface LanguageEntry {
  code: string;         // ISO 639-1
  names: string[];      // all recognized names/aliases (lowercase matching)
  fsiCategory: 1 | 2;
  fsiHours: number;
  /** Default milestone count per CEFR level. These are PLACEHOLDER defaults —
   *  the LLM generates actual milestones in Task 7's `generateLanguageMilestones()`.
   *  Category II languages should produce more milestones per level in practice
   *  because the LLM prompt says "generate for requested level + next level". */
  cefrMilestones: { A1: number; A2: number; B1: number; B2: number; C1: number; C2: number };
  sttLocale: string;    // BCP 47 for expo-speech-recognition
  ttsVoice: string;     // BCP 47 for expo-speech
}

export const SUPPORTED_LANGUAGES: LanguageEntry[] = [
  // Category I (~600-750 hours)
  {
    code: 'es', names: ['spanish', 'español', 'castellano'],
    fsiCategory: 1, fsiHours: 600,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'es-ES', ttsVoice: 'es-ES',
  },
  {
    code: 'fr', names: ['french', 'français', 'francais'],
    fsiCategory: 1, fsiHours: 600,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'fr-FR', ttsVoice: 'fr-FR',
  },
  {
    code: 'it', names: ['italian', 'italiano'],
    fsiCategory: 1, fsiHours: 600,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'it-IT', ttsVoice: 'it-IT',
  },
  {
    code: 'pt', names: ['portuguese', 'português', 'portugues'],
    fsiCategory: 1, fsiHours: 600,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'pt-PT', ttsVoice: 'pt-PT',
  },
  {
    code: 'nl', names: ['dutch', 'nederlands'],
    fsiCategory: 1, fsiHours: 600,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'nl-NL', ttsVoice: 'nl-NL',
  },
  {
    code: 'nb', names: ['norwegian', 'norsk', 'bokmål', 'bokmal'],
    fsiCategory: 1, fsiHours: 600,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'nb-NO', ttsVoice: 'nb-NO',
  },
  {
    code: 'sv', names: ['swedish', 'svenska'],
    fsiCategory: 1, fsiHours: 600,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'sv-SE', ttsVoice: 'sv-SE',
  },
  {
    code: 'da', names: ['danish', 'dansk'],
    fsiCategory: 1, fsiHours: 750,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'da-DK', ttsVoice: 'da-DK',
  },
  {
    code: 'ro', names: ['romanian', 'română', 'romana'],
    fsiCategory: 1, fsiHours: 600,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'ro-RO', ttsVoice: 'ro-RO',
  },
  // Category II (~900 hours)
  {
    code: 'de', names: ['german', 'deutsch'],
    fsiCategory: 2, fsiHours: 900,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'de-DE', ttsVoice: 'de-DE',
  },
  {
    code: 'id', names: ['indonesian', 'bahasa indonesia', 'bahasa'],
    fsiCategory: 2, fsiHours: 900,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'id-ID', ttsVoice: 'id-ID',
  },
  {
    code: 'ms', names: ['malay', 'bahasa melayu', 'melayu'],
    fsiCategory: 2, fsiHours: 900,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'ms-MY', ttsVoice: 'ms-MY',
  },
  {
    code: 'sw', names: ['swahili', 'kiswahili'],
    fsiCategory: 2, fsiHours: 900,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'sw-TZ', ttsVoice: 'sw-TZ',
  },
];

/**
 * Fast-path hint: check if raw input contains a known language name.
 * Returns a candidate match or null.
 *
 * IMPORTANT: This is a HINT, not the source of truth. The LLM's
 * `isLanguageLearning` boolean from subject-resolve is authoritative.
 * This function exists to provide instant UI feedback (show the
 * language confirmation card before the LLM responds) and to supply
 * the languageCode when the LLM confirms.
 *
 * False positives ("Spanish for history class") are acceptable —
 * the learner confirms via the confirmation card.
 * False negatives are also acceptable — the LLM catch-all handles them.
 */
export function detectLanguageHint(rawInput: string): LanguageEntry | null {
  const normalized = rawInput.trim().toLowerCase();

  // Strip common prefixes: "learn", "study", "I want to learn", etc.
  const stripped = normalized
    .replace(/^(i want to |i'd like to |let me |help me )?(learn|study|practice|speak)\s+/i, '')
    .trim();

  for (const lang of SUPPORTED_LANGUAGES) {
    for (const name of lang.names) {
      if (normalized === name || stripped === name) return lang;
      if (stripped.startsWith(name + ' ') || stripped.endsWith(' ' + name)) return lang;
    }
  }

  return null;
}

/** Look up a language by its ISO 639-1 code */
export function getLanguageByCode(code: string): LanguageEntry | null {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/data/languages.test.ts --no-coverage`
Expected: PASS — all 8 tests green

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/data/languages.ts apps/api/src/data/languages.test.ts
git commit -m "feat(epic6): language registry with detection and FSI data"
```

---

## Task 2: Database Schema — Vocabulary Tables + Subject/Topic Columns

**Files:**
- Create: `packages/database/src/schema/language.ts`
- Modify: `packages/database/src/schema/subjects.ts` — add `pedagogyMode` to `subjects`, CEFR columns to `curriculumTopics`
- Modify: `packages/database/src/schema/assessments.ts` — add `nativeLanguage` to `teachingPreferences`
- Modify: `packages/database/src/schema/index.ts` — export new schema

- [ ] **Step 1: Create `language.ts` schema with vocabulary tables**

```typescript
// packages/database/src/schema/language.ts
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  unique,
  index,
  numeric,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';
import { subjects, curriculumTopics } from './subjects';
import { generateUUIDv7 } from '../utils/uuid';

export const vocabTypeEnum = pgEnum('vocab_type', ['word', 'chunk']);

export const vocabulary = pgTable(
  'vocabulary',
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
    term: text('term').notNull(),
    /** Lowercase + accent-stripped for dedup. Set on insert/upsert via normalizeVocabTerm(). */
    termNormalized: text('term_normalized').notNull(),
    translation: text('translation').notNull(),
    type: vocabTypeEnum('type').notNull().default('word'),
    cefrLevel: text('cefr_level'),
    milestoneId: uuid('milestone_id').references(() => curriculumTopics.id, {
      onDelete: 'set null',
    }),
    mastered: boolean('mastered').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Unique on normalized term — "Casa" and "casa" are the same word
    unique('vocabulary_profile_subject_term_unique').on(
      table.profileId,
      table.subjectId,
      table.termNormalized
    ),
    index('vocabulary_profile_subject_idx').on(table.profileId, table.subjectId),
  ]
);

export const vocabularyRetentionCards = pgTable(
  'vocabulary_retention_cards',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    vocabularyId: uuid('vocabulary_id')
      .notNull()
      .references(() => vocabulary.id, { onDelete: 'cascade' }),
    easeFactor: numeric('ease_factor', { precision: 4, scale: 2 })
      .notNull()
      .default('2.50'),
    intervalDays: integer('interval_days').notNull().default(0),
    repetitions: integer('repetitions').notNull().default(0),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }),
    failureCount: integer('failure_count').notNull().default(0),
    consecutiveSuccesses: integer('consecutive_successes').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('vocab_retention_cards_vocabulary_unique').on(table.vocabularyId),
    index('vocab_retention_cards_review_idx').on(
      table.profileId,
      table.nextReviewAt
    ),
  ]
);
```

- [ ] **Step 2: Add `pedagogyMode` to `subjects` table**

In `packages/database/src/schema/subjects.ts`, add the enum after `curriculumTopicSourceEnum`:

```typescript
export const pedagogyModeEnum = pgEnum('pedagogy_mode', [
  'socratic',
  'four_strands',
]);
```

Add columns to `subjects` table after `status`:

```typescript
    pedagogyMode: pedagogyModeEnum('pedagogy_mode').notNull().default('socratic'),
    /** ISO 639-1 code for language subjects (null for non-language). Used for STT/TTS locale and vocabulary isolation. */
    languageCode: text('language_code'),
```

- [ ] **Step 3: Add CEFR columns to `curriculumTopics`**

In `packages/database/src/schema/subjects.ts`, add after the `skipped` column in `curriculumTopics`:

```typescript
    // Epic 6: Language milestone metadata (null for non-language topics)
    cefrLevel: text('cefr_level'),
    cefrSublevel: text('cefr_sublevel'),
    targetWordCount: integer('target_word_count'),
    targetChunkCount: integer('target_chunk_count'),
```

- [ ] **Step 4: Add `nativeLanguage` to `teachingPreferences`**

In `packages/database/src/schema/assessments.ts`, add after the `analogyDomain` column in `teachingPreferences`:

```typescript
    nativeLanguage: text('native_language'),
```

- [ ] **Step 5: Export new schema from barrel**

In `packages/database/src/schema/index.ts`, add:

```typescript
export * from './language';
```

- [ ] **Step 6: Push schema to dev DB**

Run: `pnpm run db:push:dev`
Expected: Tables created, columns added. Verify no errors.

**PRE-LAUNCH TODO:** Before staging/production deploy, run `pnpm run db:generate` to create a proper migration SQL file and commit it. `db:push` is dev-only.

- [ ] **Step 7: Commit**

```bash
git add packages/database/src/schema/language.ts packages/database/src/schema/subjects.ts packages/database/src/schema/assessments.ts packages/database/src/schema/index.ts
git commit -m "feat(epic6): vocabulary tables, pedagogyMode on subjects, CEFR columns on topics"
```

---

## Task 3: Zod Schemas — Language Types

**Files:**
- Create: `packages/schemas/src/language.ts`
- Modify: `packages/schemas/src/subjects.ts` — add `pedagogyMode` and CEFR fields
- Modify: `packages/schemas/src/index.ts` — export new module

- [ ] **Step 1: Create language schemas**

```typescript
// packages/schemas/src/language.ts
import { z } from 'zod';

// --- Vocabulary ---

export const vocabTypeSchema = z.enum(['word', 'chunk']);
export type VocabType = z.infer<typeof vocabTypeSchema>;

export const vocabularyItemSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  subjectId: z.string().uuid(),
  term: z.string(),
  translation: z.string(),
  type: vocabTypeSchema,
  cefrLevel: z.string().nullable(),
  milestoneId: z.string().uuid().nullable(),
  mastered: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type VocabularyItem = z.infer<typeof vocabularyItemSchema>;

export const vocabularyCreateSchema = z.object({
  term: z.string().min(1).max(200),
  translation: z.string().min(1).max(500),
  type: vocabTypeSchema.default('word'),
  cefrLevel: z.string().max(5).optional(),
  milestoneId: z.string().uuid().optional(),
});
export type VocabularyCreateInput = z.infer<typeof vocabularyCreateSchema>;

export const vocabularyRetentionSchema = z.object({
  vocabularyId: z.string().uuid(),
  easeFactor: z.number(),
  intervalDays: z.number().int(),
  repetitions: z.number().int(),
  nextReviewAt: z.string().datetime().nullable(),
  lastReviewedAt: z.string().datetime().nullable(),
  failureCount: z.number().int(),
  consecutiveSuccesses: z.number().int(),
});
export type VocabularyRetention = z.infer<typeof vocabularyRetentionSchema>;

// --- CEFR Progress ---

export const cefrLevelSchema = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
export type CefrLevel = z.infer<typeof cefrLevelSchema>;

export const cefrProgressSchema = z.object({
  subjectId: z.string().uuid(),
  languageCode: z.string(),
  currentLevel: cefrLevelSchema,
  currentSublevel: z.string(),
  currentMilestoneTitle: z.string(),
  wordsTotal: z.number().int(),
  wordsMastered: z.number().int(),
  chunksTotal: z.number().int(),
  chunksMastered: z.number().int(),
  milestoneProgress: z.number().min(0).max(1), // 0.0 to 1.0
});
export type CefrProgress = z.infer<typeof cefrProgressSchema>;

// --- Structured vocabulary extraction from LLM ---

export const llmVocabularyExtractionSchema = z.object({
  newVocabulary: z.array(
    z.object({
      term: z.string(),
      translation: z.string(),
      type: vocabTypeSchema,
    })
  ),
  strand: z.enum(['input', 'output', 'grammar', 'fluency']),
  grammarPoint: z.string().nullable(),
});
export type LlmVocabularyExtraction = z.infer<typeof llmVocabularyExtractionSchema>;

// --- Language detection result ---

export const languageDetectionResultSchema = z.object({
  isLanguage: z.boolean(),
  languageCode: z.string().nullable(),
  languageName: z.string().nullable(),
  confidence: z.enum(['keyword_match', 'llm_confirmed', 'user_confirmed']),
});
export type LanguageDetectionResult = z.infer<typeof languageDetectionResultSchema>;

// --- Pedagogy mode ---

export const pedagogyModeSchema = z.enum(['socratic', 'four_strands']);
export type PedagogyMode = z.infer<typeof pedagogyModeSchema>;
```

- [ ] **Step 2: Add `pedagogyMode` to subject schemas**

In `packages/schemas/src/subjects.ts`, add to `subjectSchema` after `status`:

```typescript
  pedagogyMode: z.enum(['socratic', 'four_strands']).default('socratic'),
```

Add to `subjectCreateSchema` (optional):

```typescript
  pedagogyMode: z.enum(['socratic', 'four_strands']).optional(),
```

Add CEFR fields to `curriculumTopicSchema` after `skipped`:

```typescript
  cefrLevel: z.string().nullable().optional(),
  cefrSublevel: z.string().nullable().optional(),
  targetWordCount: z.number().int().nullable().optional(),
  targetChunkCount: z.number().int().nullable().optional(),
```

- [ ] **Step 3: Export from schemas barrel**

In `packages/schemas/src/index.ts`, add:

```typescript
export * from './language';
```

- [ ] **Step 4: Build schemas to verify types compile**

Run: `cd packages/schemas && pnpm exec tsc --noEmit`
Expected: PASS — no type errors

- [ ] **Step 5: Commit**

```bash
git add packages/schemas/src/language.ts packages/schemas/src/subjects.ts packages/schemas/src/index.ts
git commit -m "feat(epic6): Zod schemas for vocabulary, CEFR progress, pedagogy mode"
```

---

## Task 4: Language Detection Service + LLM Authority

**Files:**
- Create: `apps/api/src/services/language-detect.ts`
- Create: `apps/api/src/services/language-detect.test.ts`
- Modify: `apps/api/src/services/subject-resolve.ts` — add `isLanguageLearning` + `detectedLanguageCode` to LLM prompt and response
- Modify: `packages/schemas/src/subjects.ts` — add `isLanguageLearning` + `detectedLanguageCode` to `SubjectResolveResult`

**DESIGN NOTE:** Language detection uses a two-layer approach:
1. **Keyword hint (fast, instant):** `detectLanguageHint()` from the registry — used for immediate UI feedback
2. **LLM authority (accurate, async):** `isLanguageLearning` boolean from `resolveSubjectName()` — the **source of truth**

The keyword hint can produce false positives ("Spanish for history class" → Spanish detected) and false negatives (unusual phrasing). That's OK — it's only used for the instant confirmation card. The LLM handles disambiguation. `pedagogyMode` is set based on the LLM result, NOT the keyword hint alone.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/services/language-detect.test.ts
import { getLanguageHint } from './language-detect';

describe('getLanguageHint', () => {
  it('returns hint for Spanish', () => {
    const result = getLanguageHint('Spanish');
    expect(result).toEqual({
      isLanguageHint: true,
      languageCode: 'es',
      languageName: 'Spanish',
    });
  });

  it('returns hint from "Learn French" prefix', () => {
    const result = getLanguageHint('Learn French');
    expect(result).toEqual({
      isLanguageHint: true,
      languageCode: 'fr',
      languageName: 'French',
    });
  });

  it('returns no hint for non-language subjects', () => {
    const result = getLanguageHint('Quantum Physics');
    expect(result).toEqual({
      isLanguageHint: false,
      languageCode: null,
      languageName: null,
    });
  });

  // Ambiguous inputs like "French Revolution" MAY return a hint.
  // That's by design — the LLM is the authority, not this function.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/services/language-detect.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement language hint service**

```typescript
// apps/api/src/services/language-detect.ts
import { detectLanguageHint } from '../data/languages';

interface LanguageHint {
  isLanguageHint: boolean;
  languageCode: string | null;
  languageName: string | null;
}

/**
 * Fast-path language hint from keyword matching.
 * NOT the source of truth — the LLM's isLanguageLearning in subject-resolve is authoritative.
 * Used for instant UI feedback (show language confirmation card before LLM responds).
 */
export function getLanguageHint(rawInput: string): LanguageHint {
  const match = detectLanguageHint(rawInput);

  if (match) {
    const displayName = match.names[0]!;
    return {
      isLanguageHint: true,
      languageCode: match.code,
      languageName: displayName.charAt(0).toUpperCase() + displayName.slice(1),
    };
  }

  return {
    isLanguageHint: false,
    languageCode: null,
    languageName: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/services/language-detect.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Add `isLanguageLearning` + `detectedLanguageCode` to subject-resolve LLM prompt**

In `apps/api/src/services/subject-resolve.ts`, update the `RESOLVE_SYSTEM_PROMPT` JSON response structure to include:

```
  "isLanguageLearning": true | false,
  "detectedLanguageCode": "es" | null
```

Add to the instructions:
```
- If the input is a language name or a request to learn a language (e.g., "Spanish", "Learn French", "Bahasa Indonesia"), set isLanguageLearning to true and detectedLanguageCode to the ISO 639-1 code
- If the input contains a language name but in a non-language context (e.g., "French Revolution", "German History", "Spanish for history class"), set isLanguageLearning to false
- isLanguageLearning is the authoritative classification — be conservative. Only set true when the user clearly intends to LEARN the language itself.
```

Update `SubjectResolveResult` in `packages/schemas/src/subjects.ts` to include:
```typescript
  isLanguageLearning: z.boolean().default(false),
  detectedLanguageCode: z.string().nullable().default(null),
```

Update the response parsing in `subject-resolve.ts` to extract both fields.

- [ ] **Step 6: Run existing subject-resolve tests to verify no regressions**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/services/subject-resolve.test.ts --no-coverage`
Expected: PASS — existing tests still green (new fields default to false/null)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/language-detect.ts apps/api/src/services/language-detect.test.ts apps/api/src/services/subject-resolve.ts packages/schemas/src/subjects.ts
git commit -m "feat(epic6): language detection hint + LLM-authoritative isLanguageLearning in subject-resolve"
```

---

## Task 5: Four Strands Prompt Assembly

**Files:**
- Create: `apps/api/src/services/language-prompts.ts`
- Create: `apps/api/src/services/language-prompts.test.ts`
- Modify: `apps/api/src/services/exchanges.ts` — add `pedagogyMode` fork in `buildSystemPrompt()`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/services/language-prompts.test.ts
import { buildFourStrandsPromptSections } from './language-prompts';

describe('buildFourStrandsPromptSections', () => {
  it('returns role, strands, error correction, and vocabulary extraction sections', () => {
    const sections = buildFourStrandsPromptSections({
      subjectName: 'Spanish',
      nativeLanguage: 'en',
      knownVocabularyCount: 45,
      currentMilestone: 'A1.2: Numbers, Days & Time',
    });

    expect(sections.length).toBeGreaterThanOrEqual(4);
    const joined = sections.join('\n');
    expect(joined).toContain('language teacher');
    expect(joined).toContain('Four Strands');
    expect(joined).toContain('Correct errors immediately');
    expect(joined).toContain('English');
    expect(joined).toContain('A1.2');
    expect(joined).not.toContain('Socratic');
  });

  it('uses native language name in error correction instructions', () => {
    const sections = buildFourStrandsPromptSections({
      subjectName: 'French',
      nativeLanguage: 'de',
      knownVocabularyCount: 0,
      currentMilestone: 'A1.1: Greetings & Introductions',
    });

    const joined = sections.join('\n');
    expect(joined).toContain('German');
  });

  it('uses English as fallback when no native language set', () => {
    const sections = buildFourStrandsPromptSections({
      subjectName: 'Italian',
      nativeLanguage: null,
      knownVocabularyCount: 10,
      currentMilestone: 'A1.1: Greetings',
    });

    const joined = sections.join('\n');
    expect(joined).toContain('English');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/services/language-prompts.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Four Strands prompt builder**

```typescript
// apps/api/src/services/language-prompts.ts

const NATIVE_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', de: 'German', fr: 'French', es: 'Spanish',
  it: 'Italian', pt: 'Portuguese', nl: 'Dutch', cs: 'Czech',
  pl: 'Polish', sv: 'Swedish', da: 'Danish', no: 'Norwegian',
  ro: 'Romanian', id: 'Indonesian', ms: 'Malay', sw: 'Swahili',
};

interface FourStrandsContext {
  subjectName: string;
  nativeLanguage: string | null;
  knownVocabularyCount: number;
  currentMilestone: string;
}

/**
 * Build the system prompt sections for Four Strands language teaching.
 * Replaces the Socratic sections when pedagogyMode === 'four_strands'.
 */
export function buildFourStrandsPromptSections(
  context: FourStrandsContext
): string[] {
  const nativeName = NATIVE_LANGUAGE_NAMES[context.nativeLanguage ?? 'en'] ?? 'English';
  const sections: string[] = [];

  // Role — direct teacher, NOT Socratic
  sections.push(
    `You are MentoMate, a language teacher for ${context.subjectName}. ` +
    'You teach using the Four Strands methodology (Nation\'s framework). ' +
    'You are a DIRECT TEACHER — not a Socratic guide. ' +
    'Teach explicitly, correct errors directly, and explain grammar clearly. ' +
    'Do NOT ask the learner to "discover" grammar rules. Teach them.'
  );

  // Four Strands rotation
  sections.push(
    'SESSION STRUCTURE — Four Strands (rotate naturally within each session):\n' +
    '1. MEANING-FOCUSED INPUT: Read/listen to short passages using 95-98% known vocabulary + a few new words. Ask comprehension questions.\n' +
    '2. MEANING-FOCUSED OUTPUT: Prompt the learner to speak or write in the target language. Accept voice transcriptions.\n' +
    '3. LANGUAGE-FOCUSED LEARNING: Teach grammar points explicitly. Use examples. Explain rules clearly.\n' +
    '4. FLUENCY DEVELOPMENT: Run quick timed drills — translate phrases, fill blanks, rapid-fire recall.\n\n' +
    'Spend roughly equal time on each strand. Transition naturally between them.'
  );

  // Error correction
  sections.push(
    'ERROR CORRECTION — DIRECT, not Socratic:\n' +
    `- When the learner makes a mistake, correct it immediately and explain WHY in ${nativeName}.\n` +
    '- Example: "You wrote \'yo soy bueno\' — the correct form is \'yo estoy bien\' because \'estar\' is used for temporary states like how you feel."\n' +
    '- Never say "Can you think about what might be wrong?" — just tell them the correct form.\n' +
    '- Praise correct usage briefly: "Correct" or "Good use of the subjunctive."'
  );

  // Current milestone
  sections.push(
    `Current milestone: ${context.currentMilestone}\n` +
    `Known vocabulary: ~${context.knownVocabularyCount} items.\n` +
    'Stay focused on vocabulary and grammar relevant to this milestone. ' +
    'When generating passages for the Input strand, use mostly known words with 2-5% new words.'
  );

  // NO in-line vocabulary extraction in chat messages.
  // Vocabulary extraction happens as a separate lightweight LLM call in the
  // session-completed Inngest pipeline (see Task 11). This avoids:
  // 1. JSON leaking into what the child sees
  // 2. Brittle regex parsing of markdown code blocks
  // 3. LLM formatting inconsistency breaking extraction

  return sections;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/services/language-prompts.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Add `pedagogyMode` fork to `buildSystemPrompt()` in `exchanges.ts`**

In `apps/api/src/services/exchanges.ts`:

1. Add to `ExchangeContext` interface:

```typescript
  /** Epic 6: Pedagogy mode — 'socratic' (default) or 'four_strands' (language learning) */
  pedagogyMode?: 'socratic' | 'four_strands';
  /** Epic 6: Learner's native language ISO code for grammar explanations */
  nativeLanguage?: string | null;
  /** Epic 6: Count of known vocabulary items for comprehensible input calibration */
  knownVocabularyCount?: number;
  /** Epic 6: Current CEFR milestone name */
  currentMilestone?: string;
```

2. At the top of `buildSystemPrompt()`, after the initial `sections` array, add the pedagogy fork:

```typescript
  // Epic 6: Four Strands mode replaces Socratic sections for language subjects
  if (context.pedagogyMode === 'four_strands') {
    const languageSections = buildFourStrandsPromptSections({
      subjectName: context.subjectName,
      nativeLanguage: context.nativeLanguage ?? null,
      knownVocabularyCount: context.knownVocabularyCount ?? 0,
      currentMilestone: context.currentMilestone ?? 'A1.1',
    });
    sections.push(...languageSections);
    // Skip Socratic-specific sections (escalation, "Not Yet" framing, worked examples)
    // but keep: safety, age voice, retention awareness, cognitive load, prohibitions
  }
```

3. Wrap the Socratic-specific sections (role identity, escalation guidance, "Not Yet" framing, worked example guidance) in an `if (context.pedagogyMode !== 'four_strands')` guard so they're skipped for language subjects.

Import `buildFourStrandsPromptSections` from `'./language-prompts'`.

- [ ] **Step 6: Run existing exchanges tests + new prompts tests**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/exchanges.ts src/services/language-prompts.ts --no-coverage`
Expected: PASS — all existing tests still green

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/language-prompts.ts apps/api/src/services/language-prompts.test.ts apps/api/src/services/exchanges.ts
git commit -m "feat(epic6): Four Strands prompt assembly + pedagogyMode fork in buildSystemPrompt"
```

---

## Task 6: Vocabulary CRUD Service

**Files:**
- Create: `apps/api/src/services/vocabulary.ts`
- Create: `apps/api/src/services/vocabulary.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/services/vocabulary.test.ts
import {
  addVocabularyItem,
  listVocabulary,
  getVocabularyProgress,
  updateVocabularyRetention,
} from './vocabulary';
import { buildTestDb, seedProfile, seedSubject } from '@eduagent/test-utils';

describe('vocabulary service', () => {
  let db: ReturnType<typeof buildTestDb>;
  let profileId: string;
  let subjectId: string;

  beforeAll(async () => {
    db = buildTestDb();
    profileId = await seedProfile(db);
    subjectId = await seedSubject(db, profileId, { name: 'Spanish', pedagogyMode: 'four_strands' });
  });

  afterAll(() => db.end());

  it('adds a word to vocabulary', async () => {
    const item = await addVocabularyItem(db, profileId, subjectId, {
      term: 'casa',
      translation: 'house',
      type: 'word',
      cefrLevel: 'A1',
    });
    expect(item.term).toBe('casa');
    expect(item.type).toBe('word');
    expect(item.mastered).toBe(false);
  });

  it('adds a chunk to vocabulary', async () => {
    const item = await addVocabularyItem(db, profileId, subjectId, {
      term: 'buenos días',
      translation: 'good morning',
      type: 'chunk',
      cefrLevel: 'A1',
    });
    expect(item.type).toBe('chunk');
  });

  it('deduplicates on profileId + subjectId + term', async () => {
    const item = await addVocabularyItem(db, profileId, subjectId, {
      term: 'casa',
      translation: 'house (updated)',
      type: 'word',
    });
    // Should upsert, not create duplicate
    expect(item.term).toBe('casa');
  });

  it('lists vocabulary for a subject', async () => {
    const items = await listVocabulary(db, profileId, subjectId);
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it('returns vocabulary progress', async () => {
    const progress = await getVocabularyProgress(db, profileId, subjectId);
    expect(progress.totalWords).toBeGreaterThanOrEqual(1);
    expect(progress.totalChunks).toBeGreaterThanOrEqual(1);
    expect(progress.masteredWords).toBe(0);
    expect(progress.masteredChunks).toBe(0);
  });
});
```

Note: The exact test structure depends on the existing `@eduagent/test-utils` and `@eduagent/factory` patterns. Adapt the setup/teardown to match. If the project uses inline DB mocking rather than real test DBs, follow that pattern.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/services/vocabulary.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement vocabulary service**

```typescript
// apps/api/src/services/vocabulary.ts
import { eq, and, sql } from 'drizzle-orm';
import {
  vocabulary,
  vocabularyRetentionCards,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type { VocabularyItem, VocabularyCreateInput } from '@eduagent/schemas';
import { sm2 } from '@eduagent/retention';

// --- Mappers ---

function mapVocabRow(row: typeof vocabulary.$inferSelect): VocabularyItem {
  return {
    id: row.id,
    profileId: row.profileId,
    subjectId: row.subjectId,
    term: row.term,
    translation: row.translation,
    type: row.type,
    cefrLevel: row.cefrLevel,
    milestoneId: row.milestoneId,
    mastered: row.mastered,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// --- CRUD ---

/** Normalize a term for dedup: lowercase + strip diacritics.
 *  "Buenos Días" → "buenos dias", "Casa" → "casa" */
export function normalizeVocabTerm(term: string): string {
  return term.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export async function addVocabularyItem(
  db: Database,
  profileId: string,
  subjectId: string,
  input: VocabularyCreateInput
): Promise<VocabularyItem> {
  const termNormalized = normalizeVocabTerm(input.term);
  const [row] = await db
    .insert(vocabulary)
    .values({
      profileId,
      subjectId,
      term: input.term,
      termNormalized,
      translation: input.translation,
      type: input.type ?? 'word',
      cefrLevel: input.cefrLevel ?? null,
      milestoneId: input.milestoneId ?? null,
    })
    .onConflictDoUpdate({
      target: [vocabulary.profileId, vocabulary.subjectId, vocabulary.termNormalized],
      set: {
        translation: input.translation,
        updatedAt: new Date(),
      },
    })
    .returning();
  return mapVocabRow(row!);
}

export async function listVocabulary(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<VocabularyItem[]> {
  const rows = await db
    .select()
    .from(vocabulary)
    .where(
      and(
        eq(vocabulary.profileId, profileId),
        eq(vocabulary.subjectId, subjectId)
      )
    );
  return rows.map(mapVocabRow);
}

export async function getVocabularyProgress(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<{
  totalWords: number;
  totalChunks: number;
  masteredWords: number;
  masteredChunks: number;
}> {
  const [result] = await db
    .select({
      totalWords: sql<number>`count(*) filter (where ${vocabulary.type} = 'word')`,
      totalChunks: sql<number>`count(*) filter (where ${vocabulary.type} = 'chunk')`,
      masteredWords: sql<number>`count(*) filter (where ${vocabulary.type} = 'word' and ${vocabulary.mastered} = true)`,
      masteredChunks: sql<number>`count(*) filter (where ${vocabulary.type} = 'chunk' and ${vocabulary.mastered} = true)`,
    })
    .from(vocabulary)
    .where(
      and(
        eq(vocabulary.profileId, profileId),
        eq(vocabulary.subjectId, subjectId)
      )
    );

  return {
    totalWords: Number(result?.totalWords ?? 0),
    totalChunks: Number(result?.totalChunks ?? 0),
    masteredWords: Number(result?.masteredWords ?? 0),
    masteredChunks: Number(result?.masteredChunks ?? 0),
  };
}

/**
 * Update SM-2 retention for a vocabulary item after a practice session.
 * Creates the retention card if it doesn't exist.
 * Marks vocabulary as mastered when consecutiveSuccesses >= 3.
 */
export async function updateVocabularyRetention(
  db: Database,
  profileId: string,
  vocabularyId: string,
  quality: number
): Promise<void> {
  // Find or create retention card
  const [existing] = await db
    .select()
    .from(vocabularyRetentionCards)
    .where(eq(vocabularyRetentionCards.vocabularyId, vocabularyId))
    .limit(1);

  const sm2Input = {
    quality,
    card: existing
      ? {
          easeFactor: Number(existing.easeFactor),
          interval: existing.intervalDays,
          repetitions: existing.repetitions,
          lastReviewedAt: existing.lastReviewedAt?.toISOString() ?? new Date().toISOString(),
          nextReviewAt: existing.nextReviewAt?.toISOString() ?? new Date().toISOString(),
        }
      : undefined,
  };

  const result = sm2(sm2Input);
  const newConsecutive = result.wasSuccessful
    ? (existing?.consecutiveSuccesses ?? 0) + 1
    : 0;
  const newFailures = result.wasSuccessful
    ? (existing?.failureCount ?? 0)
    : (existing?.failureCount ?? 0) + 1;

  if (existing) {
    await db
      .update(vocabularyRetentionCards)
      .set({
        easeFactor: String(result.card.easeFactor),
        intervalDays: result.card.interval,
        repetitions: result.card.repetitions,
        lastReviewedAt: new Date(result.card.lastReviewedAt),
        nextReviewAt: new Date(result.card.nextReviewAt),
        failureCount: newFailures,
        consecutiveSuccesses: newConsecutive,
        updatedAt: new Date(),
      })
      .where(eq(vocabularyRetentionCards.id, existing.id));
  } else {
    await db.insert(vocabularyRetentionCards).values({
      profileId,
      vocabularyId,
      easeFactor: String(result.card.easeFactor),
      intervalDays: result.card.interval,
      repetitions: result.card.repetitions,
      lastReviewedAt: new Date(result.card.lastReviewedAt),
      nextReviewAt: new Date(result.card.nextReviewAt),
      failureCount: newFailures,
      consecutiveSuccesses: newConsecutive,
    });
  }

  // Mark mastered when 3+ consecutive successes
  if (newConsecutive >= 3) {
    await db
      .update(vocabulary)
      .set({ mastered: true, updatedAt: new Date() })
      .where(eq(vocabulary.id, vocabularyId));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/services/vocabulary.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/vocabulary.ts apps/api/src/services/vocabulary.test.ts
git commit -m "feat(epic6): vocabulary CRUD service with SM-2 retention"
```

---

## Task 7: CEFR-Aligned Language Curriculum Generation

**Files:**
- Create: `apps/api/src/services/language-curriculum.ts`
- Create: `apps/api/src/services/language-curriculum.test.ts`
- Modify: `apps/api/src/services/curriculum.ts` — dispatch to language curriculum when `pedagogyMode === 'four_strands'`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/services/language-curriculum.test.ts
import { generateLanguageMilestones } from './language-curriculum';

// Mock routeAndCall to return a predictable response
jest.mock('./llm', () => ({
  routeAndCall: jest.fn().mockResolvedValue({
    response: JSON.stringify([
      {
        title: 'Greetings & Introductions',
        description: 'Learn to greet people and introduce yourself',
        cefrLevel: 'A1',
        cefrSublevel: '1',
        targetWordCount: 50,
        targetChunkCount: 12,
        estimatedMinutes: 60,
      },
      {
        title: 'Numbers, Days & Time',
        description: 'Count, tell time, name days and months',
        cefrLevel: 'A1',
        cefrSublevel: '2',
        targetWordCount: 45,
        targetChunkCount: 8,
        estimatedMinutes: 45,
      },
    ]),
    provider: 'test',
    model: 'test',
    latencyMs: 100,
  }),
}));

describe('generateLanguageMilestones', () => {
  it('generates CEFR-aligned milestones for a language', async () => {
    const milestones = await generateLanguageMilestones({
      languageCode: 'es',
      languageName: 'Spanish',
      startLevel: 'A1',
      nativeLanguage: 'en',
    });

    expect(milestones.length).toBeGreaterThanOrEqual(2);
    expect(milestones[0]!.cefrLevel).toBe('A1');
    expect(milestones[0]!.cefrSublevel).toBe('1');
    expect(milestones[0]!.targetWordCount).toBe(50);
    expect(milestones[0]!.title).toBe('Greetings & Introductions');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/services/language-curriculum.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement language curriculum generation**

```typescript
// apps/api/src/services/language-curriculum.ts
import { routeAndCall, type ChatMessage } from './llm';

export interface LanguageMilestone {
  title: string;
  description: string;
  cefrLevel: string;
  cefrSublevel: string;
  targetWordCount: number;
  targetChunkCount: number;
  estimatedMinutes: number;
}

interface LanguageCurriculumInput {
  languageCode: string;
  languageName: string;
  startLevel: string; // 'A1', 'A2', etc.
  nativeLanguage: string;
}

const LANGUAGE_CURRICULUM_PROMPT = `You are MentoMate's language curriculum designer. Generate CEFR-aligned micro-milestones for a language learner.

Each milestone is a focused learning unit with target vocabulary. Return a JSON array:
[{
  "title": "Milestone Name",
  "description": "What the learner will learn in 1 sentence",
  "cefrLevel": "A1",
  "cefrSublevel": "1",
  "targetWordCount": 50,
  "targetChunkCount": 12,
  "estimatedMinutes": 60
}]

Rules:
- Generate milestones for the requested CEFR level and the next level up
- Each milestone covers one practical topic (greetings, food, travel, etc.)
- targetWordCount: 40-60 new words per milestone
- targetChunkCount: 8-20 useful phrases/collocations per milestone
- Order milestones pedagogically (easier → harder within each level)
- estimatedMinutes: realistic study time for the milestone (30-90 min)
- cefrSublevel: number them sequentially within each level (1, 2, 3, ...)
- Generate 5-8 milestones per CEFR level`;

export async function generateLanguageMilestones(
  input: LanguageCurriculumInput
): Promise<LanguageMilestone[]> {
  const messages: ChatMessage[] = [
    { role: 'system', content: LANGUAGE_CURRICULUM_PROMPT },
    {
      role: 'user',
      content: `Language: ${input.languageName} (${input.languageCode})
Starting CEFR level: ${input.startLevel}
Learner's native language: ${input.nativeLanguage}
Generate milestones for ${input.startLevel} and the next level.`,
    },
  ];

  const result = await routeAndCall(messages, 2);

  const jsonMatch = result.response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Failed to parse language milestones from LLM response');
  }

  const parsed = JSON.parse(jsonMatch[0]) as LanguageMilestone[];

  // Validate and normalize
  return parsed.map((m) => ({
    title: String(m.title),
    description: String(m.description),
    cefrLevel: String(m.cefrLevel),
    cefrSublevel: String(m.cefrSublevel),
    targetWordCount: Math.max(1, Math.round(Number(m.targetWordCount) || 50)),
    targetChunkCount: Math.max(0, Math.round(Number(m.targetChunkCount) || 10)),
    estimatedMinutes: Math.max(5, Math.round(Number(m.estimatedMinutes) || 60)),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/services/language-curriculum.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Wire language curriculum into `curriculum.ts`**

In `apps/api/src/services/curriculum.ts`, add a dispatch path in the curriculum generation flow. When the subject has `pedagogyMode === 'four_strands'`, call `generateLanguageMilestones()` instead of `generateCurriculum()`, and persist the milestones as `curriculumTopics` rows with the CEFR metadata columns populated.

Import `generateLanguageMilestones` from `'./language-curriculum'`.

- [ ] **Step 6: Run related tests**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/curriculum.ts --no-coverage`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/language-curriculum.ts apps/api/src/services/language-curriculum.test.ts apps/api/src/services/curriculum.ts
git commit -m "feat(epic6): CEFR-aligned language curriculum generation with milestones"
```

---

## Task 8: Subject Creation — Language Detection Integration

**Files:**
- Modify: `apps/api/src/services/subject.ts` — set `pedagogyMode` + `languageCode` using LLM authority
- Modify: `apps/api/src/routes/subjects.ts` — return `pedagogyMode` + `languageCode` in responses

**DESIGN NOTE:** `pedagogyMode` is set based on the **LLM's `isLanguageLearning` boolean** from `resolveSubjectName()`, NOT the keyword hint alone. The flow:
1. User types "Spanish for history class"
2. Keyword hint returns `{ isLanguageHint: true, languageCode: 'es' }` (false positive)
3. LLM's `resolveSubjectName()` returns `{ isLanguageLearning: false }` because it's history, not language learning
4. `pedagogyMode` is set to `'socratic'` — LLM wins

The keyword hint is only used for the **instant UI confirmation card** on the mobile client (before LLM responds). The actual DB write uses the LLM result.

- [ ] **Step 1: Wire LLM-authoritative language detection into subject creation**

In `apps/api/src/services/subject.ts`:

1. Import `getLanguageHint` from `'./language-detect'`
2. The `resolveSubjectName()` result (from Task 4) now includes `isLanguageLearning` + `detectedLanguageCode`
3. In the subject creation flow (after resolve), use the LLM result to set `pedagogyMode`:

```typescript
// LLM is the authority for language classification
const pedagogyMode = resolveResult.isLanguageLearning ? 'four_strands' as const : 'socratic' as const;
const languageCode = resolveResult.isLanguageLearning ? resolveResult.detectedLanguageCode : null;
```

4. Add `pedagogyMode` and `languageCode` to the `.values()` call
5. Update `mapSubjectRow()` to include both in the returned object

- [ ] **Step 2: Update subjects route to return `pedagogyMode` + `languageCode`**

In `apps/api/src/routes/subjects.ts`, ensure the response includes `pedagogyMode` and `languageCode`. The mobile client uses `languageCode` to:
- Route to the language-setup onboarding screen instead of normal onboarding
- Pass the language code to STT/TTS hooks in language sessions
- Fetch CEFR progress from the language-progress route

- [ ] **Step 3: Run existing subject tests to verify no regressions**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/subject.ts src/routes/subjects.ts --no-coverage`
Expected: PASS — existing tests green (new subjects default to `'socratic'`, `languageCode` null)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/subject.ts apps/api/src/routes/subjects.ts
git commit -m "feat(epic6): set pedagogyMode + languageCode on subject creation (LLM-authoritative)"
```

---

## Task 9: Vocabulary API Routes

**Files:**
- Create: `apps/api/src/routes/vocabulary.ts`
- Create: `apps/api/src/routes/vocabulary.test.ts`

- [ ] **Step 1: Write the failing route test**

```typescript
// apps/api/src/routes/vocabulary.test.ts
import { testClient } from '../test-helpers';

describe('vocabulary routes', () => {
  describe('GET /v1/subjects/:subjectId/vocabulary', () => {
    it('returns 200 with vocabulary list', async () => {
      const res = await testClient.subjects[':subjectId'].vocabulary.$get({
        param: { subjectId: 'test-subject-id' },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /v1/subjects/:subjectId/vocabulary/progress', () => {
    it('returns 200 with progress counts', async () => {
      const res = await testClient.subjects[':subjectId'].vocabulary.progress.$get({
        param: { subjectId: 'test-subject-id' },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('totalWords');
      expect(data).toHaveProperty('masteredWords');
    });
  });
});
```

Note: Adapt to the actual test client pattern used in the existing route tests (check `apps/api/src/routes/subjects.test.ts` for the pattern).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/routes/vocabulary.test.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement vocabulary routes**

```typescript
// apps/api/src/routes/vocabulary.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  addVocabularyItem,
  listVocabulary,
  getVocabularyProgress,
} from '../services/vocabulary';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();

// GET /v1/subjects/:subjectId/vocabulary
app.get('/:subjectId/vocabulary', async (c) => {
  const profileId = c.get('profileId');
  const { subjectId } = c.req.param();
  const db = c.get('db');
  const items = await listVocabulary(db, profileId, subjectId);
  return c.json(items);
});

// GET /v1/subjects/:subjectId/vocabulary/progress
app.get('/:subjectId/vocabulary/progress', async (c) => {
  const profileId = c.get('profileId');
  const { subjectId } = c.req.param();
  const db = c.get('db');
  const progress = await getVocabularyProgress(db, profileId, subjectId);
  return c.json(progress);
});

export { app as vocabularyRoutes };
```

Wire the routes into the main Hono app (follow the pattern in existing route registration).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/routes/vocabulary.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/vocabulary.ts apps/api/src/routes/vocabulary.test.ts
git commit -m "feat(epic6): vocabulary API routes (list + progress)"
```

---

## Task 10: CEFR Progress API Routes

**Files:**
- Create: `apps/api/src/routes/language-progress.ts`
- Create: `apps/api/src/routes/language-progress.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/routes/language-progress.test.ts
import { testClient } from '../test-helpers';

describe('language progress routes', () => {
  describe('GET /v1/subjects/:subjectId/cefr-progress', () => {
    it('returns 200 with CEFR progress data', async () => {
      const res = await testClient.subjects[':subjectId']['cefr-progress'].$get({
        param: { subjectId: 'test-subject-id' },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('currentLevel');
      expect(data).toHaveProperty('milestoneProgress');
      // Per-milestone counts (for progress bar)
      expect(data).toHaveProperty('milestoneWordsMastered');
      expect(data).toHaveProperty('milestoneTargetWords');
      // Overall counts (for stats display)
      expect(data).toHaveProperty('wordsTotal');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/routes/language-progress.test.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement CEFR progress route**

```typescript
// apps/api/src/routes/language-progress.ts
import { Hono } from 'hono';
import { eq, and, asc, sql } from 'drizzle-orm';
import { curriculumTopics, curricula, vocabulary } from '@eduagent/database';
import { getVocabularyProgress } from '../services/vocabulary';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();

// GET /v1/subjects/:subjectId/cefr-progress
app.get('/:subjectId/cefr-progress', async (c) => {
  const profileId = c.get('profileId');
  const { subjectId } = c.req.param();
  const db = c.get('db');

  // Get current curriculum
  const [curriculum] = await db
    .select()
    .from(curricula)
    .where(eq(curricula.subjectId, subjectId))
    .orderBy(curricula.version)
    .limit(1);

  if (!curriculum) {
    return c.json({ error: 'No curriculum found' }, 404);
  }

  // Find current milestone (first non-skipped CEFR topic, ordered by sortOrder)
  const [currentMilestone] = await db
    .select()
    .from(curriculumTopics)
    .where(
      and(
        eq(curriculumTopics.curriculumId, curriculum.id),
        eq(curriculumTopics.skipped, false)
      )
    )
    .orderBy(asc(curriculumTopics.sortOrder))
    .limit(1);

  // Per-milestone vocabulary counts — filtered by milestoneId, NOT aggregate
  let milestoneWordsMastered = 0;
  let milestoneChunksMastered = 0;
  let milestoneWordsTotal = 0;
  let milestoneChunksTotal = 0;

  if (currentMilestone) {
    const [counts] = await db
      .select({
        totalWords: sql<number>`count(*) filter (where ${vocabulary.type} = 'word')`,
        totalChunks: sql<number>`count(*) filter (where ${vocabulary.type} = 'chunk')`,
        masteredWords: sql<number>`count(*) filter (where ${vocabulary.type} = 'word' and ${vocabulary.mastered} = true)`,
        masteredChunks: sql<number>`count(*) filter (where ${vocabulary.type} = 'chunk' and ${vocabulary.mastered} = true)`,
      })
      .from(vocabulary)
      .where(
        and(
          eq(vocabulary.profileId, profileId),
          eq(vocabulary.subjectId, subjectId),
          eq(vocabulary.milestoneId, currentMilestone.id)
        )
      );

    milestoneWordsMastered = Number(counts?.masteredWords ?? 0);
    milestoneChunksMastered = Number(counts?.masteredChunks ?? 0);
    milestoneWordsTotal = Number(counts?.totalWords ?? 0);
    milestoneChunksTotal = Number(counts?.totalChunks ?? 0);
  }

  const targetWords = currentMilestone?.targetWordCount ?? 0;
  const targetChunks = currentMilestone?.targetChunkCount ?? 0;
  const targetTotal = Math.max(1, targetWords + targetChunks);
  const masteredTotal = milestoneWordsMastered + milestoneChunksMastered;

  // Also get aggregate totals for the overall stats display
  const overallProgress = await getVocabularyProgress(db, profileId, subjectId);

  return c.json({
    // Current milestone (what the learner is working toward)
    currentLevel: currentMilestone?.cefrLevel ?? 'A1',
    currentSublevel: currentMilestone?.cefrSublevel ?? '1',
    currentMilestoneTitle: currentMilestone?.title ?? 'Getting Started',
    // Per-milestone progress (for the progress bar — the "almost there" feeling)
    milestoneWordsMastered,
    milestoneChunksMastered,
    milestoneTargetWords: targetWords,
    milestoneTargetChunks: targetChunks,
    milestoneProgress: Math.min(1, masteredTotal / targetTotal),
    // Overall totals (for the stats display — "Spanish: 450 words | 85 chunks")
    wordsTotal: overallProgress.totalWords,
    wordsMastered: overallProgress.masteredWords,
    chunksTotal: overallProgress.totalChunks,
    chunksMastered: overallProgress.masteredChunks,
  });
});

export { app as languageProgressRoutes };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/routes/language-progress.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/language-progress.ts apps/api/src/routes/language-progress.test.ts
git commit -m "feat(epic6): CEFR progress API route"
```

---

## Task 11: Session Completion — Post-Session Vocab Extraction + Per-Milestone Completion

**Files:**
- Create: `apps/api/src/services/vocabulary-extract.ts` — lightweight LLM call to extract vocabulary from session transcript
- Create: `apps/api/src/services/vocabulary-extract.test.ts`
- Modify: `apps/api/src/inngest/functions/session-completed.ts` — add vocab extraction, retention, and milestone steps

**DESIGN NOTE — Vocabulary Extraction Strategy:**
We do NOT embed hidden JSON in LLM chat messages (risks leaking to the child, brittle regex parsing).
Instead, a **separate lightweight LLM call** runs in the session-completed pipeline, after all messages are available. It receives the full session transcript and extracts vocabulary in a clean JSON response. This is reliable (dedicated prompt, clean output) and invisible to the child.

**DESIGN NOTE — Per-Milestone Completion:**
Milestone completion uses the `milestoneId` FK on the `vocabulary` table. We count mastered words/chunks **per milestone**, not aggregate. This prevents early milestones falsely completing when later milestones' vocab accumulates.

- [ ] **Step 1: Write the failing test for vocabulary extraction**

```typescript
// apps/api/src/services/vocabulary-extract.test.ts
import { extractVocabularyFromTranscript } from './vocabulary-extract';

jest.mock('./llm', () => ({
  routeAndCall: jest.fn().mockResolvedValue({
    response: JSON.stringify({
      vocabulary: [
        { term: 'casa', translation: 'house', type: 'word' },
        { term: 'buenos días', translation: 'good morning', type: 'chunk' },
      ],
    }),
    provider: 'test',
    model: 'test',
    latencyMs: 50,
  }),
}));

describe('extractVocabularyFromTranscript', () => {
  it('extracts vocabulary from session transcript', async () => {
    const result = await extractVocabularyFromTranscript(
      'Spanish',
      'en',
      [
        { role: 'assistant', content: 'Hola! Hoy vamos a aprender sobre la casa.' },
        { role: 'user', content: 'What does casa mean?' },
        { role: 'assistant', content: 'Casa means house. Buenos días means good morning.' },
      ]
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ term: 'casa', translation: 'house', type: 'word' });
    expect(result[1]).toEqual({ term: 'buenos días', translation: 'good morning', type: 'chunk' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/services/vocabulary-extract.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement vocabulary extraction service**

```typescript
// apps/api/src/services/vocabulary-extract.ts
import { routeAndCall, type ChatMessage } from './llm';
import type { VocabType } from '@eduagent/schemas';

interface ExtractedVocab {
  term: string;
  translation: string;
  type: VocabType;
}

const EXTRACT_PROMPT = `You are a vocabulary extraction tool for a language learning app.
Given a tutoring session transcript in a target language, extract ALL new vocabulary items taught or used.

Return ONLY a JSON object:
{"vocabulary": [{"term": "word in target language", "translation": "meaning in native language", "type": "word|chunk"}]}

Rules:
- "word" = single word (e.g., "casa", "comer")
- "chunk" = phrase or collocation (e.g., "buenos días", "por favor", "me gustaría")
- Include ONLY vocabulary that was actively taught, practiced, or corrected — not every word used
- Translations should be in the learner's native language
- Deduplicate — each term appears once`;

export async function extractVocabularyFromTranscript(
  languageName: string,
  nativeLanguageCode: string,
  transcript: Array<{ role: string; content: string }>
): Promise<ExtractedVocab[]> {
  const transcriptText = transcript
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: EXTRACT_PROMPT },
    {
      role: 'user',
      content: `Target language: ${languageName}\nNative language code: ${nativeLanguageCode}\n\nSession transcript:\n${transcriptText}`,
    },
  ];

  // Rung 1 (cheap/fast) — this is a structured extraction, not creative
  const result = await routeAndCall(messages, 1);

  try {
    const jsonMatch = result.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as { vocabulary?: unknown[] };
    if (!Array.isArray(parsed.vocabulary)) return [];

    return parsed.vocabulary
      .filter(
        (v: unknown): v is { term: string; translation: string; type: string } =>
          typeof v === 'object' &&
          v !== null &&
          'term' in v &&
          'translation' in v &&
          typeof (v as Record<string, unknown>).term === 'string' &&
          typeof (v as Record<string, unknown>).translation === 'string'
      )
      .map((v) => ({
        term: v.term,
        translation: v.translation,
        type: v.type === 'chunk' ? ('chunk' as const) : ('word' as const),
      }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/services/vocabulary-extract.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Add `extract-and-store-vocabulary` step to session-completed pipeline**

In `apps/api/src/inngest/functions/session-completed.ts`:

1. Import `extractVocabularyFromTranscript` from `'../../services/vocabulary-extract'`
2. Import `addVocabularyItem`, `updateVocabularyRetention`, `getMilestoneVocabularyProgress` from `'../../services/vocabulary'`
3. Import `subjects` from `'@eduagent/database'`

After the existing `update-retention` step, add:

```typescript
    // Step 2b: Extract and store vocabulary (language subjects only)
    // Uses a dedicated lightweight LLM call on the full transcript — no brittle
    // in-chat JSON parsing, no risk of leaking structured data to the child.
    const vocabOutcome = await step.run(
      'extract-and-store-vocabulary',
      async () => {
        return runIsolated('extract-and-store-vocabulary', profileId, async () => {
          const db = getStepDatabase();

          // Check if this is a language subject
          const [subject] = await db
            .select({
              pedagogyMode: subjects.pedagogyMode,
              languageCode: subjects.languageCode,
              name: subjects.name,
            })
            .from(subjects)
            .where(eq(subjects.id, subjectId))
            .limit(1);

          if (subject?.pedagogyMode !== 'four_strands' || !subject.languageCode) return;

          // Get native language for translations
          const nativeLanguage = await getNativeLanguage(db, profileId, subjectId) ?? 'en';

          // Load session transcript
          const events = await db
            .select({ role: sessionEvents.role, content: sessionEvents.content })
            .from(sessionEvents)
            .where(eq(sessionEvents.sessionId, sessionId))
            .orderBy(asc(sessionEvents.createdAt));

          if (events.length === 0) return;

          // Get current milestone for milestoneId assignment
          const currentMilestoneId = await getCurrentMilestoneId(db, subjectId);

          // Extract vocabulary via dedicated LLM call
          const extracted = await extractVocabularyFromTranscript(
            subject.name,
            nativeLanguage,
            events.map((e) => ({ role: e.role, content: e.content }))
          );

          for (const v of extracted) {
            const item = await addVocabularyItem(db, profileId, subjectId, {
              term: v.term,
              translation: v.translation,
              type: v.type,
              milestoneId: currentMilestoneId ?? undefined,
            });
            // Quality 4 for new vocabulary (learner was exposed to it in session)
            await updateVocabularyRetention(db, profileId, item.id, 4);
          }
        });
      }
    );
    outcomes.push(vocabOutcome);
```

- [ ] **Step 6: Add `check-milestone-completion` step with per-milestone counting**

```typescript
    // Step 2c: Check milestone completion (language subjects only)
    // Uses per-milestone vocabulary counts via milestoneId FK — not aggregate totals.
    const milestoneOutcome = await step.run(
      'check-milestone-completion',
      async () => {
        return runIsolated('check-milestone-completion', profileId, async () => {
          const db = getStepDatabase();

          const [subject] = await db
            .select({ pedagogyMode: subjects.pedagogyMode })
            .from(subjects)
            .where(eq(subjects.id, subjectId))
            .limit(1);

          if (subject?.pedagogyMode !== 'four_strands') return;

          // Get current curriculum
          const [curriculum] = await db
            .select()
            .from(curricula)
            .where(eq(curricula.subjectId, subjectId))
            .limit(1);

          if (!curriculum) return;

          // Get all incomplete milestones in order
          const milestones = await db
            .select()
            .from(curriculumTopics)
            .where(
              and(
                eq(curriculumTopics.curriculumId, curriculum.id),
                eq(curriculumTopics.skipped, false)
              )
            )
            .orderBy(asc(curriculumTopics.sortOrder));

          // Check each milestone for completion using per-milestone vocabulary counts
          for (const milestone of milestones) {
            if (!milestone.targetWordCount && !milestone.targetChunkCount) continue;

            // Count mastered vocab for THIS specific milestone
            const [milestoneProgress] = await db
              .select({
                masteredWords: sql<number>`count(*) filter (where ${vocabulary.type} = 'word' and ${vocabulary.mastered} = true)`,
                masteredChunks: sql<number>`count(*) filter (where ${vocabulary.type} = 'chunk' and ${vocabulary.mastered} = true)`,
              })
              .from(vocabulary)
              .where(
                and(
                  eq(vocabulary.profileId, profileId),
                  eq(vocabulary.subjectId, subjectId),
                  eq(vocabulary.milestoneId, milestone.id)
                )
              );

            const masteredWords = Number(milestoneProgress?.masteredWords ?? 0);
            const masteredChunks = Number(milestoneProgress?.masteredChunks ?? 0);
            const targetWords = milestone.targetWordCount ?? 0;
            const targetChunks = milestone.targetChunkCount ?? 0;

            if (masteredWords >= targetWords && masteredChunks >= targetChunks) {
              // Mark milestone complete
              await db
                .update(curriculumTopics)
                .set({ skipped: true, updatedAt: new Date() })
                .where(eq(curriculumTopics.id, milestone.id));

              // Queue celebration
              await queueCelebration(db, {
                profileId,
                celebration: 'comet',
                reason: 'topic_mastered',
                context: `Completed milestone: ${milestone.title}`,
              });

              // Check if entire CEFR level is complete (all milestones in this level done)
              // → queue OrionsBelt for level-up
            } else {
              // Stop at first incomplete milestone — milestones are sequential
              break;
            }
          }
        });
      }
    );
    outcomes.push(milestoneOutcome);
```

- [ ] **Step 7: Add `getCurrentMilestoneId` helper**

In `apps/api/src/services/vocabulary.ts`, add:

```typescript
/** Get the current (first incomplete) milestone ID for a language subject */
export async function getCurrentMilestoneId(
  db: Database,
  subjectId: string
): Promise<string | null> {
  const [curriculum] = await db
    .select()
    .from(curricula)
    .where(eq(curricula.subjectId, subjectId))
    .limit(1);

  if (!curriculum) return null;

  const [milestone] = await db
    .select({ id: curriculumTopics.id })
    .from(curriculumTopics)
    .where(
      and(
        eq(curriculumTopics.curriculumId, curriculum.id),
        eq(curriculumTopics.skipped, false)
      )
    )
    .orderBy(asc(curriculumTopics.sortOrder))
    .limit(1);

  return milestone?.id ?? null;
}
```

- [ ] **Step 8: Run session-completed tests**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/inngest/functions/session-completed.ts --no-coverage`
Expected: PASS — existing tests still green (non-language sessions skip the new steps)

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services/vocabulary-extract.ts apps/api/src/services/vocabulary-extract.test.ts apps/api/src/inngest/functions/session-completed.ts apps/api/src/services/vocabulary.ts
git commit -m "feat(epic6): post-session LLM vocab extraction + per-milestone completion checks"
```

---

## Task 12: Teaching Preferences — Native Language

**Files:**
- Modify: `apps/api/src/services/retention-data.ts` — add `setNativeLanguage()`, `getNativeLanguage()`
- Modify: `apps/api/src/routes/settings.ts` — expose native language in preferences endpoint

- [ ] **Step 1: Add native language helpers to retention-data.ts**

```typescript
export async function getNativeLanguage(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<string | null> {
  const [row] = await db
    .select({ nativeLanguage: teachingPreferences.nativeLanguage })
    .from(teachingPreferences)
    .where(
      and(
        eq(teachingPreferences.profileId, profileId),
        eq(teachingPreferences.subjectId, subjectId)
      )
    )
    .limit(1);
  return row?.nativeLanguage ?? null;
}

export async function setNativeLanguage(
  db: Database,
  profileId: string,
  subjectId: string,
  nativeLanguage: string
): Promise<void> {
  await db
    .insert(teachingPreferences)
    .values({
      profileId,
      subjectId,
      method: 'step_by_step',
      nativeLanguage,
    })
    .onConflictDoUpdate({
      target: [teachingPreferences.profileId, teachingPreferences.subjectId],
      set: { nativeLanguage, updatedAt: new Date() },
    });
}
```

- [ ] **Step 2: Expose in settings route**

In `apps/api/src/routes/settings.ts`, add native language to the teaching preferences GET/PUT endpoints. Follow the existing pattern for `analogyDomain`.

- [ ] **Step 3: Run related tests**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/retention-data.ts src/routes/settings.ts --no-coverage`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/retention-data.ts apps/api/src/routes/settings.ts
git commit -m "feat(epic6): native language on teaching preferences"
```

---

## Task 13: Mobile — Language Onboarding Screen

**Files:**
- Create: `apps/mobile/src/app/(learner)/onboarding/language-setup.tsx`
- Create: `apps/mobile/src/app/(learner)/onboarding/language-setup.test.tsx`
- Modify: `apps/mobile/src/app/(learner)/onboarding/_layout.tsx` — add route

**DESIGN NOTE — How the mobile client knows it's a language subject:**
The `createSubject()` API response (from Task 8) now includes `pedagogyMode` and `languageCode` on the Subject object. After subject creation, the onboarding flow checks `subject.pedagogyMode === 'four_strands'`:
- If yes → navigate to `language-setup` screen (passing `languageCode`, `languageName`, `subjectId` as search params)
- If no → continue normal onboarding (interview → curriculum review)

This routing decision lives in the onboarding layout or the subject creation handler on the mobile side — NOT in this screen component.

- [ ] **Step 1: Create the language setup screen**

The screen shows when a language subject is being created. It has:
1. A confirmation card: "Looks like you're learning Spanish! We'll use a language-focused approach."
2. Native language picker (dropdown or list of common languages)
3. Self-assessed level: 4 cards — "Complete beginner", "I know some basics", "Conversational", "Advanced" → maps to CEFR A1, A2, B1, B2

Follow existing onboarding patterns (see `analogy-preference.tsx` for layout/styling). Use NativeWind semantic classes. No hardcoded hex colors.

- [ ] **Step 2: Write the test**

```typescript
// apps/mobile/src/app/(learner)/onboarding/language-setup.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import LanguageSetup from './language-setup';

// Mock router and API hooks
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ languageCode: 'es', languageName: 'Spanish', subjectId: 'test-id' }),
}));

describe('LanguageSetup', () => {
  it('renders language confirmation card', () => {
    render(<LanguageSetup />);
    expect(screen.getByText(/Spanish/)).toBeTruthy();
    expect(screen.getByText(/language-focused approach/i)).toBeTruthy();
  });

  it('renders level selection options', () => {
    render(<LanguageSetup />);
    expect(screen.getByText(/Complete beginner/i)).toBeTruthy();
    expect(screen.getByText(/I know some basics/i)).toBeTruthy();
    expect(screen.getByText(/Conversational/i)).toBeTruthy();
    expect(screen.getByText(/Advanced/i)).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/mobile && pnpm exec jest src/app/\\(learner\\)/onboarding/language-setup.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 4: Wire into onboarding layout**

In `apps/mobile/src/app/(learner)/onboarding/_layout.tsx`, add the `language-setup` route. The flow should be: subject resolve → language detected? → language-setup → curriculum review → home.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/\(learner\)/onboarding/language-setup.tsx apps/mobile/src/app/\(learner\)/onboarding/language-setup.test.tsx apps/mobile/src/app/\(learner\)/onboarding/_layout.tsx
git commit -m "feat(epic6): language onboarding screen (native language + level picker)"
```

---

## Task 14: Mobile — CEFR Milestone Card Component

**Files:**
- Create: `apps/mobile/src/components/language/MilestoneCard.tsx`
- Create: `apps/mobile/src/components/language/MilestoneCard.test.tsx`
- Create: `apps/mobile/src/hooks/use-language-progress.ts`

- [ ] **Step 1: Create the TanStack Query hook**

```typescript
// apps/mobile/src/hooks/use-language-progress.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export function useLanguageProgress(subjectId: string) {
  return useQuery({
    queryKey: ['language-progress', subjectId],
    queryFn: async () => {
      const res = await apiClient.subjects[':subjectId']['cefr-progress'].$get({
        param: { subjectId },
      });
      if (!res.ok) throw new Error('Failed to fetch CEFR progress');
      return res.json();
    },
    enabled: !!subjectId,
  });
}
```

- [ ] **Step 2: Create the MilestoneCard component**

```typescript
// apps/mobile/src/components/language/MilestoneCard.tsx
import { View, Text } from 'react-native';

interface MilestoneCardProps {
  currentLevel: string;
  currentSublevel: string;
  milestoneTitle: string;
  /** Per-milestone mastered counts (not aggregate) */
  wordsMastered: number;
  wordsTarget: number;
  chunksMastered: number;
  chunksTarget: number;
  milestoneProgress: number;
}

export function MilestoneCard(props: MilestoneCardProps) {
  const {
    currentLevel,
    currentSublevel,
    milestoneTitle,
    wordsMastered,
    wordsTarget,
    chunksMastered,
    chunksTarget,
    milestoneProgress,
  } = props;

  return (
    <View className="bg-surface rounded-2xl p-4">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-primary font-bold text-lg">
          {currentLevel}.{currentSublevel}
        </Text>
        <Text className="text-secondary text-sm">
          {Math.round(milestoneProgress * 100)}%
        </Text>
      </View>
      <Text className="text-on-surface font-semibold mb-2">{milestoneTitle}</Text>
      {/* Progress bar */}
      <View className="bg-surface-variant rounded-full h-2 mb-2">
        <View
          className="bg-primary rounded-full h-2"
          style={{ width: `${Math.min(100, milestoneProgress * 100)}%` }}
        />
      </View>
      <View className="flex-row justify-between">
        <Text className="text-on-surface-variant text-xs">
          {wordsMastered}/{wordsTarget} words
        </Text>
        <Text className="text-on-surface-variant text-xs">
          {chunksMastered}/{chunksTarget} chunks
        </Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 3: Write the test**

```typescript
// apps/mobile/src/components/language/MilestoneCard.test.tsx
import { render, screen } from '@testing-library/react-native';
import { MilestoneCard } from './MilestoneCard';

describe('MilestoneCard', () => {
  it('renders milestone progress', () => {
    render(
      <MilestoneCard
        currentLevel="A1"
        currentSublevel="3"
        milestoneTitle="Ordering Food & Drinks"
        wordsMastered={38}
        wordsTarget={55}
        chunksMastered={9}
        chunksTarget={15}
        milestoneProgress={0.67}
      />
    );

    expect(screen.getByText('A1.3')).toBeTruthy();
    expect(screen.getByText('Ordering Food & Drinks')).toBeTruthy();
    expect(screen.getByText('67%')).toBeTruthy();
    expect(screen.getByText('38/55 words')).toBeTruthy();
    expect(screen.getByText('9/15 chunks')).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd apps/mobile && pnpm exec jest src/components/language/MilestoneCard.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/language/MilestoneCard.tsx apps/mobile/src/components/language/MilestoneCard.test.tsx apps/mobile/src/hooks/use-language-progress.ts
git commit -m "feat(epic6): CEFR MilestoneCard component + useLanguageProgress hook"
```

---

## Task 15: Mobile — Fluency Drill Component

**Files:**
- Create: `apps/mobile/src/components/language/FluencyDrill.tsx`
- Create: `apps/mobile/src/components/language/FluencyDrill.test.tsx`

- [ ] **Step 1: Create the FluencyDrill component**

A timed drill UI with:
- A prompt (e.g., "Translate: good morning")
- A text input (or voice input via existing `VoiceRecordButton`)
- A countdown timer (configurable, default 15 seconds)
- Score display (correct/incorrect streak)
- Submit button

```typescript
// apps/mobile/src/components/language/FluencyDrill.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';

interface FluencyDrillProps {
  prompt: string;
  expectedAnswer: string;
  timeLimitSeconds?: number;
  onAnswer: (answer: string, timeMs: number, isCorrect: boolean) => void;
  onTimeout: () => void;
}

export function FluencyDrill(props: FluencyDrillProps) {
  const {
    prompt,
    expectedAnswer,
    timeLimitSeconds = 15,
    onAnswer,
    onTimeout,
  } = props;

  const [answer, setAnswer] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(timeLimitSeconds);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    startTimeRef.current = Date.now();
    setSecondsLeft(timeLimitSeconds);
    setAnswer('');

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [prompt, timeLimitSeconds, onTimeout]);

  const handleSubmit = useCallback(() => {
    const timeMs = Date.now() - startTimeRef.current;
    // Accent-insensitive comparison: "buenos dias" matches "buenos días"
    const normalize = (s: string) =>
      s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isCorrect = normalize(answer) === normalize(expectedAnswer);
    onAnswer(answer, timeMs, isCorrect);
  }, [answer, expectedAnswer, onAnswer]);

  return (
    <View className="bg-surface rounded-2xl p-4">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-primary font-bold text-lg">Fluency Drill</Text>
        <Text
          className={`font-mono text-lg ${
            secondsLeft <= 5 ? 'text-error' : 'text-on-surface-variant'
          }`}
        >
          {secondsLeft}s
        </Text>
      </View>
      <Text className="text-on-surface text-base mb-4">{prompt}</Text>
      <TextInput
        className="bg-surface-variant text-on-surface rounded-xl p-3 text-base mb-3"
        value={answer}
        onChangeText={setAnswer}
        placeholder="Type your answer..."
        placeholderTextColor="#888"
        autoFocus
        onSubmitEditing={handleSubmit}
        returnKeyType="done"
      />
      <Pressable
        className="bg-primary rounded-xl py-3 items-center"
        onPress={handleSubmit}
      >
        <Text className="text-on-primary font-semibold">Submit</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 2: Write the test**

```typescript
// apps/mobile/src/components/language/FluencyDrill.test.tsx
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { FluencyDrill } from './FluencyDrill';

describe('FluencyDrill', () => {
  it('renders prompt and timer', () => {
    render(
      <FluencyDrill
        prompt="Translate: good morning"
        expectedAnswer="buenos días"
        onAnswer={jest.fn()}
        onTimeout={jest.fn()}
      />
    );

    expect(screen.getByText('Translate: good morning')).toBeTruthy();
    expect(screen.getByText('15s')).toBeTruthy();
  });

  it('calls onAnswer with correct flag on submit', () => {
    const onAnswer = jest.fn();
    render(
      <FluencyDrill
        prompt="Translate: house"
        expectedAnswer="casa"
        onAnswer={onAnswer}
        onTimeout={jest.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Type your answer...');
    fireEvent.changeText(input, 'casa');
    fireEvent.press(screen.getByText('Submit'));

    expect(onAnswer).toHaveBeenCalledWith('casa', expect.any(Number), true);
  });

  it('marks incorrect answer', () => {
    const onAnswer = jest.fn();
    render(
      <FluencyDrill
        prompt="Translate: house"
        expectedAnswer="casa"
        onAnswer={onAnswer}
        onTimeout={jest.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Type your answer...');
    fireEvent.changeText(input, 'caza');
    fireEvent.press(screen.getByText('Submit'));

    expect(onAnswer).toHaveBeenCalledWith('caza', expect.any(Number), false);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/mobile && pnpm exec jest src/components/language/FluencyDrill.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/language/FluencyDrill.tsx apps/mobile/src/components/language/FluencyDrill.test.tsx
git commit -m "feat(epic6): FluencyDrill component with timer and scoring"
```

---

## Task 16: Voice — Target Language STT/TTS Configuration

**Files:**
- Modify: `apps/mobile/src/hooks/use-speech-recognition.ts` — make `lang` configurable
- Modify: `apps/mobile/src/hooks/use-text-to-speech.ts` — make `language` configurable
- Modify: `apps/mobile/src/components/session/ChatShell.tsx` — pass target language for language sessions

- [ ] **Step 1: Update `useSpeechRecognition` to accept `lang` parameter**

In `apps/mobile/src/hooks/use-speech-recognition.ts`, the hook already has a `lang` parameter in the `start()` call. Verify it's configurable from the hook's options/arguments. If it's hardcoded (e.g., to `'en-US'`), make it a parameter:

```typescript
export function useSpeechRecognition(
  options?: { lang?: string }
): UseSpeechRecognitionResult {
  // ... use options?.lang ?? 'en-US' in the start() call
```

- [ ] **Step 2: Update `useTextToSpeech` to accept `language` parameter**

In `apps/mobile/src/hooks/use-text-to-speech.ts`, ensure the `language` option is passed through to `expo-speech`:

```typescript
export function useTextToSpeech(options?: { language?: string }) {
  // ... use options?.language in Speech.speak({ language: options?.language })
```

- [ ] **Step 3: Update ChatShell to pass target language for language sessions**

In `apps/mobile/src/components/session/ChatShell.tsx`, when the session's subject has `pedagogyMode === 'four_strands'`, pass the target language's STT/TTS locale to the voice hooks. This requires the subject's language code to be available in the session context — pass it as a prop or fetch from the subject data.

- [ ] **Step 4: Run existing voice hook tests**

Run: `cd apps/mobile && pnpm exec jest src/hooks/use-speech-recognition.test.ts src/hooks/use-text-to-speech.test.ts --no-coverage`
Expected: PASS — existing tests still green

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-speech-recognition.ts apps/mobile/src/hooks/use-text-to-speech.ts apps/mobile/src/components/session/ChatShell.tsx
git commit -m "feat(epic6): target language STT/TTS configuration for language sessions"
```

---

## Task 17: Type Check + Integration Verification

- [ ] **Step 1: Run full type check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS — zero type errors

- [ ] **Step 2: Run API tests for all modified services**

Run: `cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/vocabulary.ts src/services/language-detect.ts src/services/language-prompts.ts src/services/language-curriculum.ts src/services/exchanges.ts src/services/subject.ts src/services/retention-data.ts --no-coverage`
Expected: PASS

- [ ] **Step 3: Run API integration tests**

Run: `pnpm exec nx test:integration api`
Expected: PASS

- [ ] **Step 4: Run mobile tests for all new components**

Run: `cd apps/mobile && pnpm exec jest src/components/language/ src/app/\\(learner\\)/onboarding/language-setup.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Lint**

Run: `pnpm exec nx lint api && pnpm exec nx lint mobile`
Expected: PASS

- [ ] **Step 6: Commit any lint/type fixes**

```bash
git add -A
git commit -m "fix(epic6): lint and type fixes"
```

---

## Summary

| Task | Story | Description |
|------|-------|-------------|
| 1 | 6.1 | Language registry (static data, detection) |
| 2 | 6.1 | Database schema (vocabulary tables, pedagogyMode, CEFR columns) |
| 3 | 6.1 | Zod schemas (vocabulary, CEFR, pedagogy types) |
| 4 | 6.1 | Language detection hint + LLM-authoritative `isLanguageLearning` |
| 5 | 6.2 | Four Strands prompt assembly |
| 6 | 6.3 | Vocabulary CRUD service with SM-2 + term normalization |
| 7 | 6.3/6.4 | CEFR-aligned curriculum generation |
| 8 | 6.1 | Subject creation — LLM-authoritative language detection wiring |
| 9 | 6.3 | Vocabulary API routes |
| 10 | 6.4 | CEFR progress API routes |
| 11 | 6.3/6.4 | Post-session LLM vocab extraction + per-milestone completion |
| 12 | 6.1 | Teaching preferences — native language |
| 13 | 6.1 | Mobile — language onboarding screen |
| 14 | 6.4 | Mobile — CEFR milestone card + progress hook |
| 15 | 6.5 | Mobile — fluency drill component |
| 16 | 6.6 | Voice — target language STT/TTS config |
| 17 | All | Type check + integration verification |
