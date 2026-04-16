# Dictation Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dictation practice to EduAgent — the app reads text aloud at a configurable pace while the child writes on paper, with optional photo-based review and sentence-level remediation.

**Architecture:** Two API endpoints prepare dictation content (one splits homework text, one generates content). The mobile client receives structured JSON and drives TTS playback locally — no server calls during dictation. Review uses the existing session exchange flow with multimodal image input. A new "Practice" menu replaces the conditional "Repeat & review" card on the learn-new screen.

**Tech Stack:** Hono (API routes), Zod (schemas), drizzle-orm (dictation_results table), expo-speech (TTS), expo-image-picker (camera), React Native (playback UI), existing LLM router (`routeAndCall`), existing OCR pipeline (`use-homework-ocr`).

**Spec:** `docs/superpowers/specs/2026-04-16-dictation-mode-design.md`

**Parallelism:** Tasks 1-4 (schemas + API) and Tasks 5-8 (mobile screens + hooks) can run in parallel with two agents once Task 1 (schemas) is complete. Task 9 (review) depends on the image pass-through feature (separate plan). Task 10 (streaks) is independent of all others.

---

## File Map

### Schemas
| File | Action | Responsibility |
|------|--------|----------------|
| `packages/schemas/src/dictation.ts` | Create | Zod schemas for dictation request/response types |
| `packages/schemas/src/index.ts` | Modify | Add `export * from './dictation.ts'` |

### Database
| File | Action | Responsibility |
|------|--------|----------------|
| `packages/database/src/schema/dictation.ts` | Create | `dictation_results` table definition |
| `packages/database/src/schema/index.ts` | Modify | Add `export * from './dictation'` |

### API — Services
| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/services/dictation/prepare-homework.ts` | Create | LLM-based sentence splitting + punctuation annotation |
| `apps/api/src/services/dictation/prepare-homework.test.ts` | Create | Tests for homework preparation service |
| `apps/api/src/services/dictation/generate.ts` | Create | LLM-based dictation content generation |
| `apps/api/src/services/dictation/generate.test.ts` | Create | Tests for generation service |
| `apps/api/src/services/dictation/index.ts` | Create | Barrel re-export |

### API — Routes
| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/routes/dictation.ts` | Create | `POST /dictation/prepare-homework` and `POST /dictation/generate` |
| `apps/api/src/routes/dictation.test.ts` | Create | Route-level integration tests |
| `apps/api/src/index.ts` | Modify | Register dictation routes |

### Mobile — Navigation
| File | Action | Responsibility |
|------|--------|----------------|
| `apps/mobile/src/app/(app)/learn-new.tsx` | Modify | Replace conditional "Repeat & review" with always-visible "Practice" card |
| `apps/mobile/src/app/(app)/practice.tsx` | Create | Practice menu screen (Review topics, Dictation) |
| `apps/mobile/src/app/(app)/dictation/_layout.tsx` | Create | Stack navigator for dictation flow |
| `apps/mobile/src/app/(app)/dictation/index.tsx` | Create | Choice screen: "I have a text" / "Surprise me" |
| `apps/mobile/src/app/(app)/dictation/text-preview.tsx` | Create | OCR text preview + edit before starting |
| `apps/mobile/src/app/(app)/dictation/playback.tsx` | Create | Main dictation playback screen |
| `apps/mobile/src/app/(app)/dictation/complete.tsx` | Create | Post-dictation prompt: check work or done |
| `apps/mobile/src/app/(app)/dictation/review.tsx` | Create | Review results + remediation (gated on image pass-through) |

### Mobile — Hooks
| File | Action | Responsibility |
|------|--------|----------------|
| `apps/mobile/src/hooks/use-dictation-api.ts` | Create | API hooks: `usePrepareHomework`, `useGenerateDictation` |
| `apps/mobile/src/hooks/use-dictation-api.test.ts` | Create | Tests for API hooks |
| `apps/mobile/src/hooks/use-dictation-playback.ts` | Create | TTS playback engine: state machine, pacing, repeat |
| `apps/mobile/src/hooks/use-dictation-playback.test.ts` | Create | Tests for playback state machine |
| `apps/mobile/src/hooks/use-dictation-preferences.ts` | Create | SecureStore read/write for pace + punctuation prefs |
| `apps/mobile/src/hooks/use-dictation-preferences.test.ts` | Create | Tests for preferences hook |

---

## Task 1: Shared Schemas

**Files:**
- Create: `packages/schemas/src/dictation.ts`
- Modify: `packages/schemas/src/index.ts`

- [ ] **Step 1: Create dictation schema file with request/response types**

```ts
// packages/schemas/src/dictation.ts
import { z } from 'zod';

// --- Shared types ---

export const dictationSentenceSchema = z.object({
  text: z.string().describe('Original sentence text with punctuation'),
  withPunctuation: z.string().describe('Sentence with punctuation spoken as words'),
  wordCount: z.number().int().positive(),
});
export type DictationSentence = z.infer<typeof dictationSentenceSchema>;

export const dictationPaceSchema = z.enum(['slow', 'normal', 'fast']);
export type DictationPace = z.infer<typeof dictationPaceSchema>;

export const dictationModeSchema = z.enum(['homework', 'surprise']);
export type DictationMode = z.infer<typeof dictationModeSchema>;

// --- prepare-homework ---

export const prepareHomeworkInputSchema = z.object({
  text: z.string().min(1).max(10000),
});
export type PrepareHomeworkInput = z.infer<typeof prepareHomeworkInputSchema>;

export const prepareHomeworkOutputSchema = z.object({
  sentences: z.array(dictationSentenceSchema).min(1),
  language: z.string().min(2).max(10),
});
export type PrepareHomeworkOutput = z.infer<typeof prepareHomeworkOutputSchema>;

// --- generate ---

export const generateDictationOutputSchema = z.object({
  sentences: z.array(dictationSentenceSchema).min(1),
  title: z.string(),
  topic: z.string(),
  language: z.string().min(2).max(10),
});
export type GenerateDictationOutput = z.infer<typeof generateDictationOutputSchema>;

// --- dictation result (for streak tracking) ---

export const dictationResultSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  date: z.string().date(),
  sentenceCount: z.number().int().positive(),
  mistakeCount: z.number().int().nonnegative().nullable(),
  mode: dictationModeSchema,
  reviewed: z.boolean(),
});
export type DictationResult = z.infer<typeof dictationResultSchema>;
```

- [ ] **Step 2: Export from schemas barrel**

Add to `packages/schemas/src/index.ts`:

```ts
// Dictation (Practice)
export * from './dictation.ts';
```

- [ ] **Step 3: Verify schemas compile**

Run: `cd packages/schemas && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/schemas/src/dictation.ts packages/schemas/src/index.ts
git commit -m "feat(schemas): add dictation request/response schemas"
```

---

## Task 2: Database Table

**Files:**
- Create: `packages/database/src/schema/dictation.ts`
- Modify: `packages/database/src/schema/index.ts`

**Depends on:** Task 1 (schemas exist for reference, but no runtime dependency)

- [ ] **Step 1: Create dictation_results table**

```ts
// packages/database/src/schema/dictation.ts
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid';
import { profiles } from './profiles';

export const dictationModeEnum = pgEnum('dictation_mode', [
  'homework',
  'surprise',
]);

export const dictationResults = pgTable(
  'dictation_results',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    sentenceCount: integer('sentence_count').notNull(),
    mistakeCount: integer('mistake_count'),
    mode: dictationModeEnum('mode').notNull(),
    reviewed: boolean('reviewed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_dictation_results_profile_date').on(
      table.profileId,
      table.date
    ),
  ]
);
```

- [ ] **Step 2: Export from database schema barrel**

Add to `packages/database/src/schema/index.ts`:

```ts
export * from './dictation';
```

- [ ] **Step 3: Generate migration**

Run: `pnpm run db:generate`
Expected: A new migration SQL file appears in `apps/api/drizzle/`. Verify it contains `CREATE TABLE dictation_results` and the `dictation_mode` enum.

- [ ] **Step 4: Push to dev database**

Run: `pnpm run db:push:dev`
Expected: Table created successfully in dev database.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/schema/dictation.ts packages/database/src/schema/index.ts apps/api/drizzle/
git commit -m "feat(db): add dictation_results table and migration"
```

---

## Task 3: Prepare-Homework Service

**Files:**
- Create: `apps/api/src/services/dictation/prepare-homework.ts`
- Create: `apps/api/src/services/dictation/prepare-homework.test.ts`
- Create: `apps/api/src/services/dictation/index.ts`

**Depends on:** Task 1 (schemas)

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/services/dictation/prepare-homework.test.ts
import { describe, expect, it, vi } from 'vitest';
import { prepareHomework } from './prepare-homework';

// Mock the LLM router — true external boundary
vi.mock('../llm', () => ({
  routeAndCall: vi.fn(),
}));

import { routeAndCall } from '../llm';
const mockRouteAndCall = vi.mocked(routeAndCall);

describe('prepareHomework', () => {
  it('splits text into sentences with punctuation variants', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'The dog, who was tired, lay down.',
            withPunctuation:
              'The dog comma who was tired comma lay down period',
            wordCount: 7,
          },
          {
            text: 'It slept all night.',
            withPunctuation: 'It slept all night period',
            wordCount: 4,
          },
        ],
        language: 'en',
      }),
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      rung: 1,
    });

    const result = await prepareHomework(
      'The dog, who was tired, lay down. It slept all night.'
    );

    expect(result.sentences).toHaveLength(2);
    expect(result.sentences[0]!.text).toBe(
      'The dog, who was tired, lay down.'
    );
    expect(result.sentences[0]!.withPunctuation).toContain('comma');
    expect(result.language).toBe('en');
  });

  it('throws on empty LLM response', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: '',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      rung: 1,
    });

    await expect(prepareHomework('Some text here.')).rejects.toThrow();
  });

  it('throws on malformed JSON from LLM', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: 'not json at all',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      rung: 1,
    });

    await expect(prepareHomework('Some text here.')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest --findRelatedTests src/services/dictation/prepare-homework.test.ts --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

```ts
// apps/api/src/services/dictation/prepare-homework.ts
import { prepareHomeworkOutputSchema } from '@eduagent/schemas';
import type { PrepareHomeworkOutput } from '@eduagent/schemas';
import { routeAndCall } from '../llm';
import type { ChatMessage } from '../llm';

const SYSTEM_PROMPT = `You are a dictation preparation assistant. Your job is to take a text and prepare it for dictation practice.

TASK:
1. Split the input text into individual sentences. Handle abbreviations (Mr., Dr., etc.), dialogue quotes, and numbers correctly — do not split mid-sentence.
2. For each sentence, create a "withPunctuation" variant where punctuation marks are replaced with spoken words:
   - , → "comma"
   - . → "period"  
   - ? → "question mark"
   - ! → "exclamation mark"
   - : → "colon"
   - ; → "semicolon"
   - " (opening) → "open quote"
   - " (closing) → "close quote"
   - — → "dash"
   Remove the punctuation character itself and insert the word.
3. Count the words in each sentence (original text, not the punctuation variant).
4. Detect the language of the text.

RESPOND WITH ONLY valid JSON in this exact format:
{
  "sentences": [
    { "text": "original sentence.", "withPunctuation": "original sentence period", "wordCount": 2 }
  ],
  "language": "ISO 639-1 code (e.g. cs, en, de, sk)"
}`;

export async function prepareHomework(
  text: string
): Promise<PrepareHomeworkOutput> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: text },
  ];

  const result = await routeAndCall(messages, 1);

  const jsonMatch = result.response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('LLM returned no JSON in prepare-homework response');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return prepareHomeworkOutputSchema.parse(parsed);
}
```

- [ ] **Step 4: Create barrel file**

```ts
// apps/api/src/services/dictation/index.ts
export { prepareHomework } from './prepare-homework';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest --findRelatedTests src/services/dictation/prepare-homework.test.ts --no-coverage`
Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/dictation/
git commit -m "feat(api): add prepare-homework dictation service"
```

---

## Task 4: Generate Dictation Service

**Files:**
- Create: `apps/api/src/services/dictation/generate.ts`
- Create: `apps/api/src/services/dictation/generate.test.ts`
- Modify: `apps/api/src/services/dictation/index.ts`

**Depends on:** Task 1 (schemas), Task 3 (barrel exists)

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/services/dictation/generate.test.ts
import { describe, expect, it, vi } from 'vitest';
import { generateDictation } from './generate';

vi.mock('../llm', () => ({
  routeAndCall: vi.fn(),
}));

import { routeAndCall } from '../llm';
const mockRouteAndCall = vi.mocked(routeAndCall);

describe('generateDictation', () => {
  it('generates dictation content from profile context', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'Sopka chrlí lávu.',
            withPunctuation: 'Sopka chrlí lávu tečka',
            wordCount: 3,
          },
          {
            text: 'Popel padá na zem.',
            withPunctuation: 'Popel padá na zem tečka',
            wordCount: 4,
          },
        ],
        title: 'Sopky',
        topic: 'Přírodní jevy',
        language: 'cs',
      }),
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      rung: 1,
    });

    const result = await generateDictation({
      recentTopics: ['volcanoes', 'earth science'],
      nativeLanguage: 'cs',
      ageYears: 10,
    });

    expect(result.sentences.length).toBeGreaterThanOrEqual(1);
    expect(result.title).toBe('Sopky');
    expect(result.language).toBe('cs');
  });

  it('throws on empty LLM response', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: '',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      rung: 1,
    });

    await expect(
      generateDictation({
        recentTopics: ['math'],
        nativeLanguage: 'en',
        ageYears: 8,
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest --findRelatedTests src/services/dictation/generate.test.ts --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

```ts
// apps/api/src/services/dictation/generate.ts
import { generateDictationOutputSchema } from '@eduagent/schemas';
import type { GenerateDictationOutput } from '@eduagent/schemas';
import { routeAndCall } from '../llm';
import type { ChatMessage } from '../llm';

interface GenerateContext {
  recentTopics: string[];
  nativeLanguage: string;
  ageYears: number;
}

function buildGeneratePrompt(ctx: GenerateContext): string {
  const topicList = ctx.recentTopics.slice(0, 3).join(', ') || 'general knowledge';

  return `You are a dictation content generator for a ${ctx.ageYears}-year-old child.

LANGUAGE: Write the dictation in ${ctx.nativeLanguage} (ISO 639-1 code).

THEME: Base the dictation on one of these recent study topics: ${topicList}. Choose the most interesting one. The topic provides flavor — the linguistic quality of the sentences matters more than the factual content.

CONSTRAINTS:
- 6-12 sentences total (aim for ~3 minutes of writing time at a slow pace)
- Sentence length: ${ctx.ageYears <= 8 ? '6-10 words' : ctx.ageYears <= 12 ? '8-15 words' : '10-20 words'}
- Target age-appropriate spelling patterns and vocabulary
- Punctuation: commas and periods always. Question marks occasionally.${ctx.ageYears >= 12 ? ' Colons and semicolons sparingly.' : ''}
- Sentences must sound natural when read aloud — good rhythm, no awkward constructions
- Include 1-2 sentences that are slightly challenging (unusual spelling, tricky grammar)

For each sentence, also create a "withPunctuation" variant where punctuation marks are replaced with spoken words in the dictation language:
- In Czech: , → "čárka", . → "tečka", ? → "otazník", ! → "vykřičník"
- In English: , → "comma", . → "period", ? → "question mark", ! → "exclamation mark"
- In German: , → "Komma", . → "Punkt", ? → "Fragezeichen", ! → "Ausrufezeichen"
- In Slovak: , → "čiarka", . → "bodka", ? → "otáznik", ! → "výkričník"
- For other languages, use the standard spoken name for each punctuation mark in that language.

Count the words in each sentence (original text, not the punctuation variant).

RESPOND WITH ONLY valid JSON:
{
  "sentences": [
    { "text": "original sentence.", "withPunctuation": "original sentence tečka", "wordCount": 2 }
  ],
  "title": "Short title for this dictation",
  "topic": "The topic you chose",
  "language": "${ctx.nativeLanguage}"
}`;
}

export async function generateDictation(
  ctx: GenerateContext
): Promise<GenerateDictationOutput> {
  const messages: ChatMessage[] = [
    { role: 'system', content: buildGeneratePrompt(ctx) },
    { role: 'user', content: 'Generate a dictation for me.' },
  ];

  const result = await routeAndCall(messages, 1);

  const jsonMatch = result.response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('LLM returned no JSON in generate-dictation response');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return generateDictationOutputSchema.parse(parsed);
}
```

- [ ] **Step 4: Add to barrel**

Add to `apps/api/src/services/dictation/index.ts`:

```ts
export { generateDictation } from './generate';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest --findRelatedTests src/services/dictation/generate.test.ts --no-coverage`
Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/dictation/
git commit -m "feat(api): add generate-dictation service with linguistic constraints"
```

---

## Task 5: API Routes

**Files:**
- Create: `apps/api/src/routes/dictation.ts`
- Create: `apps/api/src/routes/dictation.test.ts`
- Modify: `apps/api/src/index.ts`

**Depends on:** Tasks 1, 3, 4

- [ ] **Step 1: Write route integration tests**

These are integration tests — they call the real service code. Only the LLM router is mocked (true external boundary). Check existing route tests (e.g., `apps/api/src/routes/homework.test.ts`) for the test harness pattern used in this project and match it exactly.

```ts
// apps/api/src/routes/dictation.test.ts
import { describe, expect, it, vi } from 'vitest';

// Mock ONLY the LLM boundary — not internal services
vi.mock('../services/llm', () => ({
  routeAndCall: vi.fn(),
}));

import { routeAndCall } from '../services/llm';
const mockRouteAndCall = vi.mocked(routeAndCall);

// Use the test app factory from the project (adjust import if different)
import { createTestApp } from '../test-utils';

describe('POST /dictation/prepare-homework', () => {
  it('returns 200 with prepared sentences', async () => {
    // The LLM returns structured JSON — the real prepareHomework service parses it
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'Hello world.',
            withPunctuation: 'Hello world period',
            wordCount: 2,
          },
        ],
        language: 'en',
      }),
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      rung: 1,
    });

    const app = createTestApp();
    const res = await app.request('/v1/dictation/prepare-homework', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello world.' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sentences).toHaveLength(1);
    expect(body.language).toBe('en');
  });

  it('returns 422 on empty text', async () => {
    const app = createTestApp();
    const res = await app.request('/v1/dictation/prepare-homework', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    });

    expect(res.status).toBe(422);
  });
});

describe('POST /dictation/generate', () => {
  it('returns 200 with generated dictation', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        sentences: [
          {
            text: 'Sopka chrlí lávu.',
            withPunctuation: 'Sopka chrlí lávu tečka',
            wordCount: 3,
          },
        ],
        title: 'Sopky',
        topic: 'Přírodní jevy',
        language: 'cs',
      }),
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      rung: 1,
    });

    const app = createTestApp();
    const res = await app.request('/v1/dictation/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('Sopky');
    expect(body.sentences.length).toBeGreaterThanOrEqual(1);
  });
});
```

> **Note:** The test utility `createTestApp` may differ in this project. Check `apps/api/src/test-utils.ts` or existing route tests like `apps/api/src/routes/homework.test.ts` for the actual test harness pattern. Adjust imports accordingly. The key rule: mock only the LLM boundary (`routeAndCall`), never internal services.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest --findRelatedTests src/routes/dictation.test.ts --no-coverage`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the routes**

```ts
// apps/api/src/routes/dictation.ts
import { Hono } from 'hono';
import { prepareHomeworkInputSchema } from '@eduagent/schemas';
import { requireProfileId } from '../middleware/profile-scope';
import { apiError } from '../errors';
import { prepareHomework, generateDictation } from '../services/dictation';
import type { AuthUser } from '../middleware/auth';
import type { Database } from '@eduagent/database';

type DictationRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const dictationRoutes = new Hono<DictationRouteEnv>()
  .post('/dictation/prepare-homework', async (c) => {
    requireProfileId(c.get('profileId'));

    const body = await c.req.json();
    const parsed = prepareHomeworkInputSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(c, 422, 'VALIDATION_ERROR', 'Invalid input: text is required and must be non-empty');
    }

    const result = await prepareHomework(parsed.data.text);
    return c.json(result, 200);
  })
  .post('/dictation/generate', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    // Pull recent topics from the child's session history for thematic context
    // Pull profile age and language context
    // These queries use the existing scoped repository pattern
    const { createScopedRepository } = await import(
      '../services/scoped-repository'
    );
    const repo = createScopedRepository(profileId);
    const recentTopics = await repo.getRecentTopicNames(db, 3);
    const profile = await repo.getProfile(db);

    const ageYears = profile?.birthYear
      ? new Date().getFullYear() - profile.birthYear
      : 10; // sensible default

    const nativeLanguage = profile?.nativeLanguage ?? 'en';

    const result = await generateDictation({
      recentTopics,
      nativeLanguage,
      ageYears,
    });

    return c.json(result, 200);
  });
```

> **Note:** The `createScopedRepository` import and methods (`getRecentTopicNames`, `getProfile`) may need adjustment based on the actual repository API. Check `apps/api/src/services/scoped-repository.ts` for available methods. The `profile.birthYear` and `profile.nativeLanguage` fields should be verified — `nativeLanguage` may be on `teachingPreferences` rather than the profile itself. Adjust the query accordingly.

- [ ] **Step 4: Register routes in index.ts**

In `apps/api/src/index.ts`, add the import and mount:

```ts
import { dictationRoutes } from './routes/dictation';
```

Add `.route('/', dictationRoutes)` to the routes chain alongside the other routes.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest --findRelatedTests src/routes/dictation.test.ts --no-coverage`
Expected: All tests PASS.

- [ ] **Step 6: Run API typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/dictation.ts apps/api/src/routes/dictation.test.ts apps/api/src/index.ts
git commit -m "feat(api): add /dictation/prepare-homework and /dictation/generate routes"
```

---

## Task 6: Dictation Preferences Hook

**Files:**
- Create: `apps/mobile/src/hooks/use-dictation-preferences.ts`
- Create: `apps/mobile/src/hooks/use-dictation-preferences.test.ts`

**Depends on:** Task 1 (schemas — uses `DictationPace` type)

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/hooks/use-dictation-preferences.test.ts
import { renderHook, act } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { useDictationPreferences } from './use-dictation-preferences';

jest.mock('expo-secure-store');
const mockGet = jest.mocked(SecureStore.getItemAsync);
const mockSet = jest.mocked(SecureStore.setItemAsync);

describe('useDictationPreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
  });

  it('returns default pace "slow" when nothing stored', async () => {
    const { result } = renderHook(() =>
      useDictationPreferences('profile-123')
    );

    // Wait for async load
    await act(async () => {});

    expect(result.current.pace).toBe('slow');
  });

  it('loads stored pace from SecureStore', async () => {
    mockGet.mockImplementation(async (key) => {
      if (key === 'dictation-pace-profile-123') return 'fast';
      if (key === 'dictation-punctuation-profile-123') return 'false';
      return null;
    });

    const { result } = renderHook(() =>
      useDictationPreferences('profile-123')
    );

    await act(async () => {});

    expect(result.current.pace).toBe('fast');
    expect(result.current.punctuationReadAloud).toBe(false);
  });

  it('setPace writes to SecureStore and updates state', async () => {
    const { result } = renderHook(() =>
      useDictationPreferences('profile-123')
    );

    await act(async () => {});
    await act(async () => {
      result.current.setPace('normal');
    });

    expect(mockSet).toHaveBeenCalledWith(
      'dictation-pace-profile-123',
      'normal'
    );
    expect(result.current.pace).toBe('normal');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-dictation-preferences.test.ts --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```ts
// apps/mobile/src/hooks/use-dictation-preferences.ts
import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { DictationPace } from '@eduagent/schemas';

const getPaceKey = (profileId: string) => `dictation-pace-${profileId}`;
const getPunctKey = (profileId: string) =>
  `dictation-punctuation-${profileId}`;

interface DictationPreferences {
  pace: DictationPace;
  punctuationReadAloud: boolean;
  setPace: (pace: DictationPace) => void;
  togglePunctuation: () => void;
  cyclePace: () => void;
}

const PACE_CYCLE: DictationPace[] = ['slow', 'normal', 'fast'];

export function useDictationPreferences(
  profileId: string | undefined
): DictationPreferences {
  const [pace, setPaceState] = useState<DictationPace>('slow');
  const [punctuationReadAloud, setPunctState] = useState(true);

  useEffect(() => {
    if (!profileId) return;

    void SecureStore.getItemAsync(getPaceKey(profileId)).then((stored) => {
      if (stored === 'slow' || stored === 'normal' || stored === 'fast') {
        setPaceState(stored);
      }
    });

    void SecureStore.getItemAsync(getPunctKey(profileId)).then((stored) => {
      if (stored === 'true' || stored === 'false') {
        setPunctState(stored === 'true');
      }
    });
  }, [profileId]);

  const setPace = useCallback(
    (next: DictationPace) => {
      setPaceState(next);
      if (profileId) {
        void SecureStore.setItemAsync(getPaceKey(profileId), next).catch(
          (err) =>
            console.warn('[Dictation] Failed to persist pace:', err)
        );
      }
    },
    [profileId]
  );

  const togglePunctuation = useCallback(() => {
    setPunctState((prev) => {
      const next = !prev;
      if (profileId) {
        void SecureStore.setItemAsync(
          getPunctKey(profileId),
          String(next)
        ).catch((err) =>
          console.warn('[Dictation] Failed to persist punctuation:', err)
        );
      }
      return next;
    });
  }, [profileId]);

  const cyclePace = useCallback(() => {
    setPaceState((prev) => {
      const idx = PACE_CYCLE.indexOf(prev);
      const next = PACE_CYCLE[(idx + 1) % PACE_CYCLE.length]!;
      if (profileId) {
        void SecureStore.setItemAsync(getPaceKey(profileId), next).catch(
          (err) =>
            console.warn('[Dictation] Failed to persist pace:', err)
        );
      }
      return next;
    });
  }, [profileId]);

  return { pace, punctuationReadAloud, setPace, togglePunctuation, cyclePace };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-dictation-preferences.test.ts --no-coverage`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-dictation-preferences.ts apps/mobile/src/hooks/use-dictation-preferences.test.ts
git commit -m "feat(mobile): add dictation preferences hook (pace + punctuation)"
```

---

## Task 7: Dictation Playback Hook

**Files:**
- Create: `apps/mobile/src/hooks/use-dictation-playback.ts`
- Create: `apps/mobile/src/hooks/use-dictation-playback.test.ts`

**Depends on:** Task 1 (schemas — uses `DictationSentence`, `DictationPace`)

This is the core playback engine. It manages the state machine: countdown → speaking → waiting → speaking → ... → complete.

- [ ] **Step 1: Write the failing test for the state machine**

```ts
// apps/mobile/src/hooks/use-dictation-playback.test.ts
import { renderHook, act } from '@testing-library/react-native';
import * as Speech from 'expo-speech';
import { useDictationPlayback } from './use-dictation-playback';
import type { DictationSentence } from '@eduagent/schemas';

jest.mock('expo-speech');
const mockSpeak = jest.mocked(Speech.speak);
const mockStop = jest.mocked(Speech.stop);

const TEST_SENTENCES: DictationSentence[] = [
  { text: 'First sentence.', withPunctuation: 'First sentence period', wordCount: 2 },
  { text: 'Second sentence.', withPunctuation: 'Second sentence period', wordCount: 2 },
  { text: 'Third sentence.', withPunctuation: 'Third sentence period', wordCount: 2 },
];

describe('useDictationPlayback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Simulate immediate speech completion
    mockSpeak.mockImplementation((_text, options) => {
      options?.onDone?.();
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      })
    );

    expect(result.current.state).toBe('idle');
    expect(result.current.currentIndex).toBe(0);
  });

  it('transitions to countdown on start', () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      })
    );

    act(() => {
      result.current.start();
    });

    expect(result.current.state).toBe('countdown');
  });

  it('pauses and resumes', () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      })
    );

    act(() => {
      result.current.start();
    });
    // Advance past countdown
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    act(() => {
      result.current.pause();
    });

    expect(result.current.state).toBe('paused');

    act(() => {
      result.current.resume();
    });

    expect(result.current.state).not.toBe('paused');
  });

  it('uses withPunctuation text when punctuationReadAloud is true', () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: true,
        language: 'en',
      })
    );

    act(() => {
      result.current.start();
    });
    // Advance past countdown
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(mockSpeak).toHaveBeenCalledWith(
      'First sentence period',
      expect.objectContaining({ language: 'en' })
    );
  });

  it('repeat replays current sentence', () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      })
    );

    act(() => {
      result.current.start();
    });
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    mockSpeak.mockClear();

    act(() => {
      result.current.repeat();
    });

    expect(mockSpeak).toHaveBeenCalledWith(
      'First sentence.',
      expect.objectContaining({ language: 'en' })
    );
  });

  it('skip advances to next sentence', () => {
    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: TEST_SENTENCES,
        pace: 'slow',
        punctuationReadAloud: false,
        language: 'en',
      })
    );

    act(() => {
      result.current.start();
    });
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    act(() => {
      result.current.skip();
    });

    expect(result.current.currentIndex).toBe(1);
  });

  it('transitions to complete after last sentence', () => {
    const singleSentence: DictationSentence[] = [
      { text: 'Only one.', withPunctuation: 'Only one period', wordCount: 2 },
    ];

    const { result } = renderHook(() =>
      useDictationPlayback({
        sentences: singleSentence,
        pace: 'fast',
        punctuationReadAloud: false,
        language: 'en',
      })
    );

    act(() => {
      result.current.start();
    });
    // Advance past countdown
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    // Advance past the pause after the sentence
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(result.current.state).toBe('complete');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-dictation-playback.test.ts --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the playback hook**

```ts
// apps/mobile/src/hooks/use-dictation-playback.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import type { DictationPace, DictationSentence } from '@eduagent/schemas';

type PlaybackState =
  | 'idle'
  | 'countdown'
  | 'speaking'
  | 'waiting'
  | 'paused'
  | 'complete';

interface PlaybackConfig {
  sentences: DictationSentence[];
  pace: DictationPace;
  punctuationReadAloud: boolean;
  language: string;
}

interface PlaybackControls {
  state: PlaybackState;
  currentIndex: number;
  totalSentences: number;
  start: () => void;
  pause: () => void;
  resume: () => void;
  repeat: () => void;
  skip: () => void;
}

const PACE_CONFIG: Record<
  DictationPace,
  { rate: number; basePause: number; perWordPause: number }
> = {
  slow: { rate: 0.5, basePause: 2000, perWordPause: 1500 },
  normal: { rate: 0.6, basePause: 1500, perWordPause: 1000 },
  fast: { rate: 0.75, basePause: 1000, perWordPause: 700 },
};

// Countdown spoken via TTS in the dictation language, then first sentence begins.
// The countdown word (e.g., "Ready" / "Pripravit") is passed from the LLM-prepared
// data or a simple locale lookup. For v1, we use a numeric "3... 2... 1..." which
// is language-neutral.
const COUNTDOWN_MS = 3500;

export function useDictationPlayback(config: PlaybackConfig): PlaybackControls {
  const [state, setState] = useState<PlaybackState>('idle');
  const [currentIndex, setCurrentIndex] = useState(0);

  const stateRef = useRef(state);
  stateRef.current = state;

  const indexRef = useRef(currentIndex);
  indexRef.current = currentIndex;

  const configRef = useRef(config);
  configRef.current = config;

  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preStateRef = useRef<PlaybackState>('idle');

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  const getSentenceText = useCallback(
    (index: number): string => {
      const sentence = config.sentences[index];
      if (!sentence) return '';
      return config.punctuationReadAloud ? sentence.withPunctuation : sentence.text;
    },
    [config.sentences, config.punctuationReadAloud]
  );

  const getPauseDuration = useCallback(
    (index: number): number => {
      const sentence = config.sentences[index];
      if (!sentence) return 0;
      const paceConfig = PACE_CONFIG[config.pace];
      return paceConfig.basePause + sentence.wordCount * paceConfig.perWordPause;
    },
    [config.sentences, config.pace]
  );

  const speakSentence = useCallback(
    (index: number) => {
      const text = getSentenceText(index);
      if (!text) {
        setState('complete');
        return;
      }

      setState('speaking');
      const paceConfig = PACE_CONFIG[configRef.current.pace];

      Speech.speak(text, {
        language: configRef.current.language,
        rate: paceConfig.rate,
        onDone: () => {
          if (stateRef.current === 'paused') return;

          const isLast = indexRef.current >= configRef.current.sentences.length - 1;
          if (isLast) {
            setState('complete');
            return;
          }

          setState('waiting');
          const pauseMs = getPauseDuration(indexRef.current);
          pauseTimerRef.current = setTimeout(() => {
            const nextIndex = indexRef.current + 1;
            setCurrentIndex(nextIndex);
            speakSentence(nextIndex);
          }, pauseMs);
        },
      });
    },
    [getSentenceText, getPauseDuration]
  );

  const start = useCallback(() => {
    setState('countdown');
    setCurrentIndex(0);
    pauseTimerRef.current = setTimeout(() => {
      speakSentence(0);
    }, COUNTDOWN_MS);
  }, [speakSentence]);

  const pause = useCallback(() => {
    preStateRef.current = stateRef.current;
    setState('paused');
    clearPauseTimer();
    Speech.stop();
  }, [clearPauseTimer]);

  const resume = useCallback(() => {
    const prev = preStateRef.current;
    if (prev === 'speaking') {
      speakSentence(indexRef.current);
    } else if (prev === 'waiting') {
      // Resume with remaining pause — simplified to full pause on resume
      setState('waiting');
      const pauseMs = getPauseDuration(indexRef.current);
      pauseTimerRef.current = setTimeout(() => {
        const nextIndex = indexRef.current + 1;
        setCurrentIndex(nextIndex);
        speakSentence(nextIndex);
      }, pauseMs);
    } else if (prev === 'countdown') {
      speakSentence(indexRef.current);
    } else {
      setState(prev);
    }
  }, [speakSentence, getPauseDuration]);

  const repeat = useCallback(() => {
    clearPauseTimer();
    Speech.stop();
    speakSentence(indexRef.current);
  }, [speakSentence, clearPauseTimer]);

  const skip = useCallback(() => {
    clearPauseTimer();
    Speech.stop();
    const isLast = indexRef.current >= configRef.current.sentences.length - 1;
    if (isLast) {
      setState('complete');
      return;
    }
    const nextIndex = indexRef.current + 1;
    setCurrentIndex(nextIndex);
    speakSentence(nextIndex);
  }, [speakSentence, clearPauseTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearPauseTimer();
      Speech.stop();
    };
  }, [clearPauseTimer]);

  return {
    state,
    currentIndex,
    totalSentences: config.sentences.length,
    start,
    pause,
    resume,
    repeat,
    skip,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-dictation-playback.test.ts --no-coverage`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-dictation-playback.ts apps/mobile/src/hooks/use-dictation-playback.test.ts
git commit -m "feat(mobile): add dictation playback hook with TTS state machine"
```

---

## Task 8: Dictation API Hooks

**Files:**
- Create: `apps/mobile/src/hooks/use-dictation-api.ts`
- Create: `apps/mobile/src/hooks/use-dictation-api.test.ts`

**Depends on:** Task 1 (schemas)

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/hooks/use-dictation-api.test.ts
import { renderHook, waitFor } from '@testing-library/react-native';
import { usePrepareHomework, useGenerateDictation } from './use-dictation-api';

// Mock the API client
jest.mock('../lib/api-client', () => ({
  useApiClient: () => ({
    dictation: {
      'prepare-homework': {
        $post: jest.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              sentences: [
                {
                  text: 'Test.',
                  withPunctuation: 'Test period',
                  wordCount: 1,
                },
              ],
              language: 'en',
            }),
        }),
      },
      generate: {
        $post: jest.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              sentences: [
                {
                  text: 'Generated.',
                  withPunctuation: 'Generated period',
                  wordCount: 1,
                },
              ],
              title: 'Test',
              topic: 'Test',
              language: 'en',
            }),
        }),
      },
    },
  }),
}));

jest.mock('../lib/assert-ok', () => ({
  assertOk: jest.fn(),
}));

describe('usePrepareHomework', () => {
  it('returns a mutation that calls prepare-homework endpoint', async () => {
    const { result } = renderHook(() => usePrepareHomework());

    result.current.mutate({ text: 'Hello world.' });

    await waitFor(() => {
      expect(result.current.data?.sentences).toHaveLength(1);
      expect(result.current.data?.language).toBe('en');
    });
  });
});

describe('useGenerateDictation', () => {
  it('returns a mutation that calls generate endpoint', async () => {
    const { result } = renderHook(() => useGenerateDictation());

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.data?.title).toBe('Test');
    });
  });
});
```

> **Note:** The API client mock structure depends on how the Hono RPC client exposes dictation routes. Check the actual `AppType` export after Task 5 is complete. The mock may need adjustment to match `client.dictation['prepare-homework'].$post()` vs `client['dictation']['prepare-homework'].$post()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-dictation-api.test.ts --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hooks**

```ts
// apps/mobile/src/hooks/use-dictation-api.ts
import { useMutation } from '@tanstack/react-query';
import type {
  PrepareHomeworkInput,
  PrepareHomeworkOutput,
  GenerateDictationOutput,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';

export function usePrepareHomework() {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (
      input: PrepareHomeworkInput
    ): Promise<PrepareHomeworkOutput> => {
      const res = await client.dictation['prepare-homework'].$post({
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as PrepareHomeworkOutput;
    },
  });
}

export function useGenerateDictation() {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (): Promise<GenerateDictationOutput> => {
      const res = await client.dictation.generate.$post({});
      await assertOk(res);
      return (await res.json()) as GenerateDictationOutput;
    },
  });
}
```

> **Note:** The `assertOk` import path may be `'../lib/api-client'` (re-exported) rather than a separate file. Check existing hooks like `use-subjects.ts` for the actual import path.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-dictation-api.test.ts --no-coverage`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-dictation-api.ts apps/mobile/src/hooks/use-dictation-api.test.ts
git commit -m "feat(mobile): add dictation API hooks (prepare-homework + generate)"
```

---

## Task 9: Practice Menu Screen + learn-new.tsx Update

**Files:**
- Create: `apps/mobile/src/app/(app)/practice.tsx`
- Modify: `apps/mobile/src/app/(app)/learn-new.tsx`

**Depends on:** None (pure navigation, no API calls)

- [ ] **Step 1: Create the Practice menu screen**

```tsx
// apps/mobile/src/app/(app)/practice.tsx
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IntentCard } from '../../components/home/IntentCard';
import { goBackOrReplace } from '../../lib/navigation';
import { useReviewSummary } from '../../hooks/use-progress';
import { useThemeColors } from '../../lib/theme';

export default function PracticeScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { data: reviewSummary } = useReviewSummary();

  const reviewDueCount = reviewSummary?.totalOverdue ?? 0;
  const reviewSubtitle =
    reviewDueCount > 0
      ? `${reviewDueCount} ${reviewDueCount === 1 ? 'topic' : 'topics'} ready for review`
      : 'Keep your knowledge fresh';

  const handleBack = () => {
    goBackOrReplace(router, '/(app)/learn-new');
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="practice-screen"
    >
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={handleBack}
          className="mr-3 min-h-[32px] min-w-[32px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="practice-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary flex-1">
          Practice
        </Text>
      </View>

      <View className="gap-4">
        <IntentCard
          title="Review topics"
          subtitle={reviewSubtitle}
          badge={reviewDueCount > 0 ? reviewDueCount : undefined}
          onPress={() => {
            const nextReviewTopic = reviewSummary?.nextReviewTopic ?? null;
            if (nextReviewTopic) {
              router.push({
                pathname: '/(app)/topic/relearn',
                params: {
                  topicId: nextReviewTopic.topicId,
                  subjectId: nextReviewTopic.subjectId,
                  topicName: nextReviewTopic.topicTitle,
                },
              } as never);
            } else {
              router.push('/(app)/library' as never);
            }
          }}
          testID="practice-review"
        />
        <IntentCard
          title="Dictation"
          subtitle="Practice writing what you hear"
          onPress={() => router.push('/(app)/dictation' as never)}
          testID="practice-dictation"
        />
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Update learn-new.tsx — replace conditional "Repeat & review" with always-visible "Practice"**

In `apps/mobile/src/app/(app)/learn-new.tsx`, replace the conditional `IntentCard` for "Repeat & review" (lines 118-140):

```tsx
// REMOVE this block:
{continueSuggestion ? (
  <IntentCard
    title="Repeat & review"
    ...
  />
) : null}

// REPLACE with:
<IntentCard
  title="Practice"
  subtitle="Review, dictation, and more"
  onPress={() => router.push('/(app)/practice' as never)}
  testID="intent-practice"
/>
```

This card is always visible — no conditional. The `continueSuggestion` import can remain for the "Continue with" card below, or be removed if it's no longer used elsewhere.

Also remove the `useReviewSummary` import and `reviewDueCount`/`reviewSubtitle` variables from learn-new.tsx since the review logic now lives in practice.tsx.

- [ ] **Step 3: Verify typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/(app)/practice.tsx apps/mobile/src/app/(app)/learn-new.tsx
git commit -m "feat(mobile): add Practice menu, replace conditional Repeat & review"
```

---

## Task 10: Dictation Flow Screens

**Files:**
- Create: `apps/mobile/src/app/(app)/dictation/_layout.tsx`
- Create: `apps/mobile/src/app/(app)/dictation/index.tsx`
- Create: `apps/mobile/src/app/(app)/dictation/text-preview.tsx`
- Create: `apps/mobile/src/app/(app)/dictation/playback.tsx`
- Create: `apps/mobile/src/app/(app)/dictation/complete.tsx`

**Depends on:** Tasks 6, 7, 8 (hooks), Task 9 (practice screen navigates here)

- [ ] **Step 1: Create dictation layout**

```tsx
// apps/mobile/src/app/(app)/dictation/_layout.tsx
import { Stack } from 'expo-router';

export default function DictationLayout(): React.ReactElement {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
```

- [ ] **Step 2: Create choice screen (index.tsx)**

```tsx
// apps/mobile/src/app/(app)/dictation/index.tsx
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IntentCard } from '../../../components/home/IntentCard';
import { goBackOrReplace } from '../../../lib/navigation';
import { useGenerateDictation } from '../../../hooks/use-dictation-api';
import { useThemeColors } from '../../../lib/theme';

export default function DictationChoiceScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const generateMutation = useGenerateDictation();

  const handleSurpriseMe = async () => {
    try {
      const data = await generateMutation.mutateAsync();
      router.push({
        pathname: '/(app)/dictation/playback',
        params: { data: JSON.stringify(data) },
      } as never);
    } catch {
      Alert.alert(
        "Couldn't create a dictation right now",
        'Would you like to try again?',
        [
          { text: 'Try again', onPress: () => void handleSurpriseMe() },
          { text: 'Go back', style: 'cancel' },
        ]
      );
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="dictation-choice-screen"
    >
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/practice')}
          className="mr-3 min-h-[32px] min-w-[32px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="dictation-choice-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary flex-1">
          Dictation
        </Text>
      </View>

      {generateMutation.isPending ? (
        <View className="items-center justify-center py-16" testID="dictation-loading">
          <Text className="text-lg text-text-primary mb-2">
            {generateMutation.variables
              ? 'Writing your dictation...'
              : 'Picking a topic...'}
          </Text>
          <Text className="text-sm text-text-secondary">
            This takes a few seconds
          </Text>
        </View>
      ) : (
        <View className="gap-4">
          <IntentCard
            title="I have a text"
            subtitle="Take a photo of your dictation"
            onPress={() => router.push('/(app)/dictation/text-preview' as never)}
            testID="dictation-homework"
          />
          <IntentCard
            title="Surprise me"
            subtitle="Practice with a new dictation"
            onPress={() => void handleSurpriseMe()}
            testID="dictation-surprise"
          />
        </View>
      )}
    </ScrollView>
  );
}
```

> **Note:** The "I have a text" path needs the camera/OCR flow. For v1, this navigates to the homework camera screen (reusing existing component) then to text-preview. The exact navigation may need to pass the OCR result as a param. See the homework camera flow for the pattern.

- [ ] **Step 3: Create text-preview screen**

```tsx
// apps/mobile/src/app/(app)/dictation/text-preview.tsx
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { goBackOrReplace } from '../../../lib/navigation';
import { usePrepareHomework } from '../../../hooks/use-dictation-api';
import { useThemeColors } from '../../../lib/theme';

export default function TextPreviewScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { ocrText } = useLocalSearchParams<{ ocrText: string }>();
  const [text, setText] = useState(ocrText ?? '');
  const prepareMutation = usePrepareHomework();

  const handleStartDictation = async () => {
    if (!text.trim()) {
      Alert.alert('No text', 'Please enter or photograph some text first.');
      return;
    }

    try {
      const data = await prepareMutation.mutateAsync({ text: text.trim() });
      router.push({
        pathname: '/(app)/dictation/playback',
        params: { data: JSON.stringify(data) },
      } as never);
    } catch {
      Alert.alert(
        'Something went wrong',
        'Could not prepare your dictation. Try again?',
        [
          { text: 'Try again', onPress: () => void handleStartDictation() },
          { text: 'Go back', style: 'cancel' },
        ]
      );
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="dictation-text-preview-screen"
    >
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/dictation')}
          className="mr-3 min-h-[32px] min-w-[32px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="text-preview-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary flex-1">
          Check the text
        </Text>
      </View>

      <Text className="text-sm text-text-secondary mb-3">
        Edit any mistakes from the photo, then start your dictation.
      </Text>

      <TextInput
        className="bg-surface-elevated border border-border rounded-xl p-4 text-text-primary text-base min-h-[200px]"
        value={text}
        onChangeText={setText}
        multiline
        textAlignVertical="top"
        autoCorrect={false}
        testID="text-preview-input"
      />

      <Pressable
        onPress={() => void handleStartDictation()}
        disabled={prepareMutation.isPending || !text.trim()}
        className={`mt-6 rounded-xl py-4 items-center ${
          prepareMutation.isPending || !text.trim()
            ? 'bg-primary/50'
            : 'bg-primary'
        }`}
        testID="text-preview-start"
      >
        <Text className="text-white font-semibold text-base">
          {prepareMutation.isPending ? 'Preparing...' : 'Start dictation'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Create the playback screen**

```tsx
// apps/mobile/src/app/(app)/dictation/playback.tsx
import { useCallback, useEffect } from 'react';
import { Alert, BackHandler, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDictationPlayback } from '../../../hooks/use-dictation-playback';
import { useDictationPreferences } from '../../../hooks/use-dictation-preferences';
import { useProfile } from '../../../lib/profile';
import { useThemeColors } from '../../../lib/theme';
import type { PrepareHomeworkOutput, GenerateDictationOutput } from '@eduagent/schemas';

const PACE_LABELS = { slow: '\u{1F422}', normal: '\u{1F6B6}', fast: '\u{1F3C3}' } as const;

export default function PlaybackScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { activeProfile } = useProfile();
  const { data: dataParam } = useLocalSearchParams<{ data: string }>();

  const parsed: PrepareHomeworkOutput | GenerateDictationOutput = JSON.parse(
    dataParam ?? '{}'
  );

  const prefs = useDictationPreferences(activeProfile?.id);

  const playback = useDictationPlayback({
    sentences: parsed.sentences ?? [],
    pace: prefs.pace,
    punctuationReadAloud: prefs.punctuationReadAloud,
    language: parsed.language ?? 'en',
  });

  // Start playback on mount
  useEffect(() => {
    if (playback.state === 'idle' && parsed.sentences?.length) {
      playback.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate to complete screen when done
  useEffect(() => {
    if (playback.state === 'complete') {
      router.replace({
        pathname: '/(app)/dictation/complete',
        params: { data: dataParam },
      } as never);
    }
  }, [playback.state, router, dataParam]);

  // Back press confirmation
  const handleExit = useCallback(() => {
    Alert.alert(
      'Are you sure?',
      "Your dictation progress won't be saved.",
      [
        { text: 'Keep going', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => router.replace('/(app)/practice' as never),
        },
      ]
    );
  }, [router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleExit();
      return true;
    });
    return () => sub.remove();
  }, [handleExit]);

  const isPaused = playback.state === 'paused';
  const isCountdown = playback.state === 'countdown';

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="dictation-playback-screen"
    >
      {/* Top control strip */}
      <View className="flex-row items-center px-4 py-2 border-b border-border">
        <Pressable
          onPress={prefs.cyclePace}
          className="px-3 py-2 rounded-lg bg-surface-elevated mr-2"
          testID="playback-pace"
        >
          <Text className="text-base">
            {PACE_LABELS[prefs.pace]}
          </Text>
        </Pressable>

        <Pressable
          onPress={prefs.togglePunctuation}
          className="px-3 py-2 rounded-lg bg-surface-elevated mr-2"
          testID="playback-punctuation"
        >
          <Ionicons
            name={prefs.punctuationReadAloud ? 'text' : 'text-outline'}
            size={18}
            color={colors.textPrimary}
          />
        </Pressable>

        <Pressable
          onPress={playback.skip}
          className="px-3 py-2 rounded-lg bg-surface-elevated mr-2"
          testID="playback-skip"
        >
          <Ionicons name="play-skip-forward" size={18} color={colors.textPrimary} />
        </Pressable>

        <View className="flex-1" />

        <Text className="text-sm text-text-secondary" testID="playback-progress">
          {playback.currentIndex + 1} / {playback.totalSentences}
        </Text>
      </View>

      {/* Main tap area — pause/resume */}
      <Pressable
        className="flex-1 items-center justify-center px-8"
        onPress={() => {
          if (isPaused) {
            playback.resume();
          } else {
            playback.pause();
          }
        }}
        testID="playback-tap-area"
      >
        {isCountdown ? (
          <Text className="text-4xl font-bold text-text-primary">
            Ready...
          </Text>
        ) : isPaused ? (
          <View className="items-center">
            <Ionicons name="pause" size={48} color={colors.textSecondary} />
            <Text className="text-lg text-text-secondary mt-4">
              Tap to continue
            </Text>
          </View>
        ) : (
          <Text className="text-2xl text-text-secondary tracking-widest">
            * * *
          </Text>
        )}
      </Pressable>

      {/* Repeat button */}
      <View
        className="px-4 pb-4"
        style={{ paddingBottom: insets.bottom + 16 }}
      >
        <Pressable
          onPress={playback.repeat}
          className="bg-surface-elevated rounded-xl py-4 items-center"
          testID="playback-repeat"
        >
          <View className="flex-row items-center">
            <Ionicons name="refresh" size={20} color={colors.textPrimary} />
            <Text className="text-base text-text-primary ml-2">Repeat</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 5: Create the complete screen**

```tsx
// apps/mobile/src/app/(app)/dictation/complete.tsx
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../lib/theme';

export default function DictationCompleteScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { data: dataParam } = useLocalSearchParams<{ data: string }>();

  // TODO: "Check my writing" button is hidden until image pass-through is complete.
  // When available, it will open the camera, send the photo + original text to the
  // review session, and navigate to the review screen.
  const imagePassThroughAvailable = false;

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-8"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
      testID="dictation-complete-screen"
    >
      <Ionicons name="checkmark-circle" size={64} color={colors.primary} />
      <Text className="text-h2 font-bold text-text-primary mt-4 text-center">
        Well done!
      </Text>
      <Text className="text-base text-text-secondary mt-2 text-center">
        Want to check your work?
      </Text>

      <View className="w-full gap-3 mt-8">
        {imagePassThroughAvailable && (
          <Pressable
            onPress={() => {
              // Navigate to camera for photo review
              // router.push({ pathname: '/(app)/dictation/review', params: { data: dataParam } })
            }}
            className="bg-primary rounded-xl py-4 items-center"
            testID="complete-check-writing"
          >
            <View className="flex-row items-center">
              <Ionicons name="camera" size={20} color="white" />
              <Text className="text-white font-semibold text-base ml-2">
                Check my writing
              </Text>
            </View>
          </Pressable>
        )}

        <Pressable
          onPress={() => router.replace('/(app)/practice' as never)}
          className={`rounded-xl py-4 items-center ${
            imagePassThroughAvailable ? 'bg-surface-elevated' : 'bg-primary'
          }`}
          testID="complete-done"
        >
          <Text
            className={`font-semibold text-base ${
              imagePassThroughAvailable ? 'text-text-primary' : 'text-white'
            }`}
          >
            I'm done
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 6: Verify typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/app/(app)/dictation/
git commit -m "feat(mobile): add dictation flow screens (choice, text-preview, playback, complete)"
```

---

## Task 11: Review and Remediation Screen

**Files:**
- Create: `apps/mobile/src/app/(app)/dictation/review.tsx`

**Depends on:** Task 10, and the **image pass-through feature** (separate plan) being complete.

> **BLOCKED:** This task cannot be implemented until the image pass-through feature is live. The `imagePassThroughAvailable` flag in `complete.tsx` gates this functionality. When unblocked:

- [ ] **Step 1: Create the review screen**

```tsx
// apps/mobile/src/app/(app)/dictation/review.tsx
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../lib/theme';

interface Mistake {
  sentenceIndex: number;
  sentence: string;
  error: string;
  correction: string;
  explanation: string;
}

interface ReviewData {
  totalSentences: number;
  mistakes: Mistake[];
}

export default function DictationReviewScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { reviewData: reviewParam } = useLocalSearchParams<{
    reviewData: string;
  }>();

  const review: ReviewData = JSON.parse(reviewParam ?? '{}');
  const [currentMistakeIndex, setCurrentMistakeIndex] = useState(0);
  const [typedSentence, setTypedSentence] = useState('');
  const [completedCount, setCompletedCount] = useState(0);

  const isPerfect = review.mistakes?.length === 0;
  const currentMistake = review.mistakes?.[currentMistakeIndex];
  const allCorrected = completedCount >= (review.mistakes?.length ?? 0);

  const handleSubmitCorrection = () => {
    // Accept whatever they type — the value is in the rewriting act
    setCompletedCount((prev) => prev + 1);
    setTypedSentence('');

    if (currentMistakeIndex < (review.mistakes?.length ?? 0) - 1) {
      setCurrentMistakeIndex((prev) => prev + 1);
    }
  };

  if (isPerfect || allCorrected) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
        testID="review-celebration"
      >
        <Ionicons
          name={isPerfect ? 'trophy' : 'checkmark-done-circle'}
          size={64}
          color={colors.primary}
        />
        <Text className="text-h2 font-bold text-text-primary mt-4 text-center">
          {isPerfect ? 'Perfect!' : `You fixed all ${review.mistakes.length} mistakes!`}
        </Text>
        <Pressable
          onPress={() => router.replace('/(app)/practice' as never)}
          className="bg-primary rounded-xl py-4 px-8 mt-8"
          testID="review-done"
        >
          <Text className="text-white font-semibold text-base">Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="review-remediation-screen"
    >
      <Text className="text-h3 font-bold text-text-primary mb-2">
        {review.mistakes.length} {review.mistakes.length === 1 ? 'mistake' : 'mistakes'} in{' '}
        {review.totalSentences} sentences
      </Text>
      <Text className="text-sm text-text-secondary mb-6">
        Correction {completedCount + 1} of {review.mistakes.length}
      </Text>

      {currentMistake && (
        <View className="bg-surface-elevated rounded-xl p-4 mb-4">
          <Text className="text-base text-text-primary mb-2">
            {currentMistake.sentence}
          </Text>
          <Text className="text-sm text-red-500 mb-1">
            Error: {currentMistake.error}
          </Text>
          <Text className="text-sm text-green-600 mb-1">
            Correct: {currentMistake.correction}
          </Text>
          <Text className="text-sm text-text-secondary">
            {currentMistake.explanation}
          </Text>
        </View>
      )}

      <Text className="text-sm text-text-secondary mb-2">
        Type the correct sentence:
      </Text>
      <TextInput
        className="bg-surface-elevated border border-border rounded-xl p-4 text-text-primary text-base min-h-[80px]"
        value={typedSentence}
        onChangeText={setTypedSentence}
        multiline
        textAlignVertical="top"
        autoCorrect={false}
        autoCapitalize="none"
        testID="review-correction-input"
      />

      <Pressable
        onPress={handleSubmitCorrection}
        disabled={!typedSentence.trim()}
        className={`mt-4 rounded-xl py-4 items-center ${
          !typedSentence.trim() ? 'bg-primary/50' : 'bg-primary'
        }`}
        testID="review-submit-correction"
      >
        <Text className="text-white font-semibold text-base">
          {currentMistakeIndex < (review.mistakes?.length ?? 0) - 1
            ? 'Next'
            : 'Finish'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Update complete.tsx to enable the "Check my writing" button**

Set `imagePassThroughAvailable = true` and wire the camera → LLM review → navigate to review screen flow. This requires:
1. Opening camera (reuse homework camera component)
2. Converting photo to base64
3. Sending to a session exchange with the original dictation text
4. Parsing structured review feedback from LLM response
5. Navigating to review.tsx with the review data

> **Note:** The exact implementation depends on how the image pass-through feature exposes its API. The session exchange pattern from the image-vision plan should be followed.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/app/(app)/dictation/review.tsx apps/mobile/src/app/(app)/dictation/complete.tsx
git commit -m "feat(mobile): add dictation review + remediation screen"
```

---

## Task 12: Streak Tracking

**Files:**
- Modify: `apps/api/src/routes/dictation.ts` — add `POST /dictation/result` and `GET /dictation/streak`
- Modify: `apps/api/src/routes/dictation.test.ts` — add streak tests
- Modify: `apps/mobile/src/app/(app)/dictation/complete.tsx` — record result on completion

**Depends on:** Task 2 (database table), Task 5 (routes exist)

- [ ] **Step 1: Add streak routes to the API**

Add to `apps/api/src/routes/dictation.ts`:

```ts
  .post('/dictation/result', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const body = await c.req.json();

    const { dictationResults } = await import('@eduagent/database');
    const today = new Date().toISOString().split('T')[0]!;

    await db.insert(dictationResults).values({
      profileId,
      date: today,
      sentenceCount: body.sentenceCount,
      mistakeCount: body.mistakeCount ?? null,
      mode: body.mode,
      reviewed: body.reviewed ?? false,
    });

    return c.json({ ok: true }, 201);
  })
  .get('/dictation/streak', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    const { dictationResults } = await import('@eduagent/database');
    const { desc, eq, sql } = await import('drizzle-orm');

    // Get distinct dates of practice, ordered descending
    const rows = await db
      .selectDistinct({ date: dictationResults.date })
      .from(dictationResults)
      .where(eq(dictationResults.profileId, profileId))
      .orderBy(desc(dictationResults.date))
      .limit(365);

    // Count consecutive days from today backwards
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < rows.length; i++) {
      const expected = new Date(today);
      expected.setDate(expected.getDate() - i);
      const expectedStr = expected.toISOString().split('T')[0];

      if (rows[i]!.date === expectedStr) {
        streak++;
      } else {
        break;
      }
    }

    return c.json({ streak, totalSessions: rows.length }, 200);
  })
```

- [ ] **Step 2: Write streak tests**

Add to `apps/api/src/routes/dictation.test.ts`:

```ts
describe('POST /dictation/result', () => {
  it('returns 201 when recording a dictation result', async () => {
    const app = createTestApp();
    const res = await app.request('/v1/dictation/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sentenceCount: 10,
        mode: 'homework',
        reviewed: false,
      }),
    });

    expect(res.status).toBe(201);
  });
});

describe('GET /dictation/streak', () => {
  it('returns streak count', async () => {
    const app = createTestApp();
    const res = await app.request('/v1/dictation/streak');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.streak).toBe('number');
    expect(typeof body.totalSessions).toBe('number');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/api && pnpm exec jest --findRelatedTests src/routes/dictation.test.ts --no-coverage`
Expected: All tests PASS.

- [ ] **Step 4: Wire up result recording in complete.tsx**

In `apps/mobile/src/app/(app)/dictation/complete.tsx`, add a `useEffect` that records the dictation result on mount:

```tsx
import { useApiClient } from '../../../lib/api-client';
import { assertOk } from '../../../lib/assert-ok';

// Inside the component:
const client = useApiClient();

useEffect(() => {
  const sentences = parsed.sentences ?? [];
  if (sentences.length === 0) return;

  void (async () => {
    try {
      const res = await client.dictation.result.$post({
        json: {
          sentenceCount: sentences.length,
          mode: 'title' in parsed ? 'surprise' : 'homework',
          reviewed: false,
        },
      });
      await assertOk(res);
    } catch (err) {
      console.warn('[Dictation] Failed to record result:', err);
    }
  })();
}, []);
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/dictation.ts apps/api/src/routes/dictation.test.ts apps/mobile/src/app/(app)/dictation/complete.tsx
git commit -m "feat: add dictation streak tracking (API + mobile)"
```

---

## Task 13: Final Integration Verification

**Depends on:** All previous tasks.

- [ ] **Step 1: Run full API test suite**

Run: `pnpm exec nx run api:test`
Expected: All tests pass including new dictation tests.

- [ ] **Step 2: Run API typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: No errors.

- [ ] **Step 3: Run API lint**

Run: `pnpm exec nx run api:lint`
Expected: No errors.

- [ ] **Step 4: Run mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Run mobile lint**

Run: `pnpm exec nx lint mobile`
Expected: No errors.

- [ ] **Step 6: Run mobile tests for all new files**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-dictation-preferences.ts src/hooks/use-dictation-playback.ts src/hooks/use-dictation-api.ts --no-coverage`
Expected: All tests pass.

- [ ] **Step 7: Verify navigation flow manually**

Start the dev server and walk through:
1. Home → Start learning → Practice (card always visible)
2. Practice → Dictation
3. Dictation → "Surprise me" → loading → playback → complete
4. Dictation → "I have a text" → camera → text preview → playback → complete

- [ ] **Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes from dictation mode verification"
```
