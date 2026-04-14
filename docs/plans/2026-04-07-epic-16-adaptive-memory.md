# Epic 16: Adaptive Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Reviewed:** 2026-04-07. Adversarial review found 14 issues (4 HIGH, 6 MEDIUM, 4 LOW). All resolved in this revision — see [Review Changelog](#review-changelog) at the end of the plan.

**Spec alignment:** 2026-04-08. FR renumbering (FR234–FR242 → FR243–FR251), plus new requirements FR244.9 (freeform session handling), FR246.5 (rawInput interest signal), shared Inngest chain ordering (Epic 15 AD6), and shared token budget (AD6). Conversation-First cross-references added.

**UX review:** 2026-04-09. End-user perspective review added 10 improvements: FR246.6, FR247.6 revised, FR247.7, FR248.6, FR249.7, FR249.8, FR250.7, FR250.8, FR252, plus Story 16.10 and Phase D. New tasks 19–27. See [Phase D](#phase-d--collaborative-memory-ux-improvements) and updated [Spec Coverage](#spec-coverage-verification).

**Adversarial review #2:** 2026-04-09. Found 13 issues (4 HIGH, 7 MEDIUM, 2 LOW) across cross-task coherence, GDPR compliance, data correctness, and test quality. All resolved — see [Review Changelog](#review-changelog).

**Goal:** Build a learner memory system that analyzes session transcripts post-session, accumulates a learning profile (interests, struggles, explanation preferences), and injects that profile into future system prompts — making the AI mentor feel like it truly knows each child. The system is **collaborative**: learners and parents can directly contribute to and control the profile, not just observe it.

**Architecture:** New `learning_profiles` table with JSONB fields stores per-profile learning data. A new Inngest step in the `session-completed` chain sends the transcript to a budget LLM for structured analysis. `buildSystemPrompt()` gains a "learner memory" block capped at 500 tokens. Mobile screens expose the profile to children and parents with granular controls, direct input, consent management, and GDPR compliance.

**Tech Stack:** Drizzle ORM (PostgreSQL), Inngest (background processing), LLM router (`services/llm/router.ts`), Hono (API routes), React Native + NativeWind (mobile screens), Zod (validation), `@eduagent/schemas` (shared types), `@eduagent/database` (schema + repository)

**Spec:** `docs/superpowers/specs/2026-04-07-epic-16-adaptive-memory-design.md`

**Prerequisites:**
- **Story 16.0** (`docs/superpowers/plans/2026-04-08-story-16.0-fix-existing-memory-layers.md`) — **IMPLEMENTED**. Fixes existing memory layers (embedding key passthrough, prompt instructions, cross-subject context). Must be complete before Phase A.
- **Amendments** (`docs/superpowers/plans/2026-04-08-epic-16-amendments.md`) — 5 amendments to this plan: Story 16.0 dependency, Epic 15 mastery cross-reference in `buildMemoryBlock`, memory layer deduplication, step independence, errata. Apply during implementation.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/database/src/schema/learning-profiles.ts` | Drizzle table definition for `learning_profiles` |
| `packages/schemas/src/learning-profiles.ts` | Zod schemas for learning profile API responses, analysis output |
| `apps/api/src/services/learner-profile.ts` | Business logic: profile CRUD, incremental merge, memory block construction |
| `apps/api/src/services/learner-profile.test.ts` | Unit tests for merge logic, memory block formatting, token budget |
| `apps/api/src/routes/learner-profile.ts` | Hono route handlers: GET profile, DELETE items, DELETE all (self + parent), PATCH memoryEnabled |
| `apps/api/src/routes/learner-profile.test.ts` | Route handler tests (IDOR, GDPR self-delete, toggle, item delete) |
| `apps/mobile/src/app/(app)/mentor-memory.tsx` | Child-facing "What My Mentor Knows" screen |
| `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx` | Parent-facing memory visibility screen |
| `apps/mobile/src/hooks/use-learner-profile.ts` | React Query hooks for learner profile API |

### Modified Files

| File | Change |
|------|--------|
| `packages/database/src/schema/index.ts` | Add `export * from './learning-profiles'` |
| `packages/schemas/src/index.ts` | Add `export * from './learning-profiles.ts'` |
| `packages/database/src/repository.ts` | Add `learningProfiles` namespace to `createScopedRepository` |
| `apps/api/src/inngest/functions/session-completed.ts` | Add `analyze-learner-profile` step after `write-coaching-card` |
| `apps/api/src/services/exchanges.ts` | Add `learnerMemoryContext?: string` to `ExchangeContext`, inject memory block in `buildSystemPrompt()` |
| `apps/api/src/services/session.ts` | Load learning profile in `prepareExchangeContext()` parallel query, build memory context |
| `apps/api/src/services/export.ts` | Include `learning_profiles` in GDPR data export |
| `apps/api/src/index.ts` | Register `learnerProfileRoutes` |
| `apps/mobile/src/app/(app)/more.tsx` | Add "What My Mentor Knows" settings row |
| `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` | Add "What the mentor knows" link |

---

## Phase A — Memory Infrastructure (Stories 16.1–16.3)

### Task 1: Learning Profile Zod Schemas (Story 16.1 — schemas package)

**Files:**
- Create: `packages/schemas/src/learning-profiles.ts`
- Modify: `packages/schemas/src/index.ts`

- [ ] **Step 1: Write the Zod schemas**

```typescript
// packages/schemas/src/learning-profiles.ts
import { z } from 'zod';

// --- Enum-like constants ---

export const explanationStyleSchema = z.enum([
  'stories',
  'examples',
  'diagrams',
  'analogies',
  'step-by-step',
  'humor',
]);
export type ExplanationStyle = z.infer<typeof explanationStyleSchema>;

export const pacePreferenceSchema = z.enum(['quick', 'thorough']);
export type PacePreference = z.infer<typeof pacePreferenceSchema>;

export const challengeResponseSchema = z.enum(['motivated', 'discouraged']);
export type ChallengeResponse = z.infer<typeof challengeResponseSchema>;

export const confidenceLevelSchema = z.enum(['low', 'medium', 'high']);
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;

export const engagementLevelSchema = z.enum(['high', 'medium', 'low']);
export type EngagementLevel = z.infer<typeof engagementLevelSchema>;

// --- Learning Style ---

export const learningStyleSchema = z
  .object({
    preferredExplanations: z.array(explanationStyleSchema).optional(),
    pacePreference: pacePreferenceSchema.optional(),
    responseToChallenge: challengeResponseSchema.optional(),
  })
  .nullable();
export type LearningStyle = z.infer<typeof learningStyleSchema>;

// --- Strength / Struggle entries ---

export const strengthEntrySchema = z.object({
  subject: z.string(),
  topics: z.array(z.string()),
  confidence: confidenceLevelSchema,
});
export type StrengthEntry = z.infer<typeof strengthEntrySchema>;

export const struggleEntrySchema = z.object({
  subject: z.string().nullable(), // FR244.9: null for freeform sessions without a subject
  topic: z.string(),
  lastSeen: z.string(), // ISO 8601
  attempts: z.number().int().min(1),
  confidence: confidenceLevelSchema,
});
export type StruggleEntry = z.infer<typeof struggleEntrySchema>;

// --- Full Learning Profile response ---

export const learningProfileSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  learningStyle: learningStyleSchema,
  interests: z.array(z.string()),
  strengths: z.array(strengthEntrySchema),
  struggles: z.array(struggleEntrySchema),
  communicationNotes: z.array(z.string()),
  suppressedInferences: z.array(z.string()),
  interestTimestamps: z.record(z.string(), z.string()).optional(),
  effectivenessSessionCount: z.number().int().optional(),
  memoryEnabled: z.boolean(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LearningProfile = z.infer<typeof learningProfileSchema>;

// --- Session Analysis LLM Output ---

export const sessionAnalysisOutputSchema = z.object({
  explanationEffectiveness: z
    .object({
      effective: z.array(explanationStyleSchema),
      ineffective: z.array(explanationStyleSchema),
    })
    .nullable(),
  interests: z.array(z.string()).nullable(),
  strengths: z
    .array(z.object({ topic: z.string(), subject: z.string() }))
    .nullable(),
  struggles: z
    .array(z.object({ topic: z.string(), subject: z.string().nullable() }))
    .nullable(),
  resolvedTopics: z
    .array(z.object({ topic: z.string(), subject: z.string().nullable() }))
    .nullable(),
  communicationNotes: z.array(z.string()).nullable(),
  engagementLevel: engagementLevelSchema.nullable(),
  confidence: confidenceLevelSchema,
});
export type SessionAnalysisOutput = z.infer<typeof sessionAnalysisOutputSchema>;

// --- API request schemas ---

export const deleteMemoryItemSchema = z.object({
  category: z.enum([
    'interests',
    'strengths',
    'struggles',
    'communicationNotes',
    'learningStyle',
  ]),
  /** The value to remove. For interests/communicationNotes: the string. For strengths: subject. For struggles: topic. For learningStyle: the field name. */
  value: z.string(),
  /** Required for struggles — disambiguates across subjects (e.g., "fractions" in Math vs Science) */
  subject: z.string().optional(),
  /** If true, also add to suppressedInferences so it won't be re-inferred */
  suppress: z.boolean().optional(),
});

export const toggleMemoryEnabledSchema = z.object({
  memoryEnabled: z.boolean(),
});
```

- [ ] **Step 2: Export from schemas barrel**

Add to `packages/schemas/src/index.ts` at the end:

```typescript
// Adaptive Memory (Epic 16)
export * from './learning-profiles.ts';
```

- [ ] **Step 3: Run typecheck to verify schemas compile**

Run: `cd packages/schemas && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/schemas/src/learning-profiles.ts packages/schemas/src/index.ts
git commit -m "feat(schemas): add learning profile Zod schemas [Epic-16, Story-16.1]"
```

---

### Task 2: Learning Profile Database Table (Story 16.1 — database package)

**Files:**
- Create: `packages/database/src/schema/learning-profiles.ts`
- Modify: `packages/database/src/schema/index.ts`

- [ ] **Step 1: Write the Drizzle table definition**

```typescript
// packages/database/src/schema/learning-profiles.ts
import {
  pgTable,
  uuid,
  jsonb,
  boolean,
  integer,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid';
import { profiles } from './profiles';

export const learningProfiles = pgTable(
  'learning_profiles',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    learningStyle: jsonb('learning_style'),
    interests: jsonb('interests').notNull().default([]),
    strengths: jsonb('strengths').notNull().default([]),
    struggles: jsonb('struggles').notNull().default([]),
    communicationNotes: jsonb('communication_notes').notNull().default([]),
    suppressedInferences: jsonb('suppressed_inferences').notNull().default([]),
    interestTimestamps: jsonb('interest_timestamps').notNull().default({}),
    effectivenessSessionCount: integer('effectiveness_session_count').notNull().default(0),
    memoryEnabled: boolean('memory_enabled').notNull().default(true),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('learning_profiles_profile_id_unique').on(table.profileId),
    index('learning_profiles_profile_id_idx').on(table.profileId),
  ]
);
```

- [ ] **Step 2: Export from database schema barrel**

Add to `packages/database/src/schema/index.ts`:

```typescript
export * from './learning-profiles';
```

- [ ] **Step 3: Run typecheck to verify the table compiles**

Run: `cd packages/database && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/schema/learning-profiles.ts packages/database/src/schema/index.ts
git commit -m "feat(database): add learning_profiles table definition [Epic-16, Story-16.1]"
```

---

### Task 3: Add Learning Profiles to Scoped Repository (Story 16.1)

**Files:**
- Modify: `packages/database/src/repository.ts`

- [ ] **Step 1: Read the current repository.ts to get exact line numbers**

Run: Read `packages/database/src/repository.ts` — find the end of the existing namespaces and the return type.

- [ ] **Step 2: Add import for learningProfiles table**

Add to the imports at the top of `repository.ts`:

```typescript
import { learningProfiles } from './schema/learning-profiles';
```

- [ ] **Step 3: Add learningProfiles namespace to the return object**

Inside the return object of `createScopedRepository`, add:

```typescript
learningProfiles: {
  findFirst: (extra?: SQL) =>
    db.query.learningProfiles.findFirst({
      where: scopedWhere(learningProfiles, extra),
    }),
},
```

- [ ] **Step 4: Run typecheck**

Run: `cd packages/database && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/repository.ts
git commit -m "feat(database): add learningProfiles to scoped repository [Epic-16, Story-16.1]"
```

---

### Task 4: Database Migration (Story 16.1)

**Files:**
- Create: Migration SQL file via `drizzle-kit generate`

- [ ] **Step 1: Generate the migration**

Run: `cd apps/api && pnpm exec drizzle-kit generate`
Expected: A new migration file `apps/api/drizzle/NNNN_*.sql` containing `CREATE TABLE learning_profiles`

- [ ] **Step 2: Verify the generated SQL**

Read the new migration file. It should contain:
- `CREATE TABLE IF NOT EXISTS "learning_profiles"`
- All columns with correct types and defaults
- The unique constraint on `profile_id`
- The index on `profile_id`
- FK reference to `profiles(id)` with `ON DELETE cascade`

- [ ] **Step 3: Push to dev database**

Run: `pnpm run db:push:dev`
Expected: Schema applied successfully

- [ ] **Step 4: Commit**

```bash
git add apps/api/drizzle/
git commit -m "feat(database): add learning_profiles migration [Epic-16, Story-16.1]"
```

---

### Task 5: Learner Profile Service — Core CRUD + Merge Logic (Story 16.1, 16.2)

**Files:**
- Create: `apps/api/src/services/learner-profile.ts`
- Test: `apps/api/src/services/learner-profile.test.ts`

**Core functions to implement:** `mergeInterests`, `mergeStrengths`, `mergeStruggles`, `mergeCommunicationNotes`, `archiveStaleStruggles`, `resolveStruggle` (FR247.4 — required by `applyAnalysis`), `shouldUpdateLearningStyle`, `buildMemoryBlock`, `getLearningProfile`, `getOrCreateLearningProfile`, `applyAnalysis`, `deleteMemoryItem`, `toggleMemoryEnabled`, `deleteAllMemory`.

- [ ] **Step 1: Write tests for the merge logic**

```typescript
// apps/api/src/services/learner-profile.test.ts
import {
  mergeInterests,
  mergeStruggles,
  mergeStrengths,
  archiveStaleStruggles,
  shouldUpdateLearningStyle,
  buildMemoryBlock,
} from './learner-profile';
import type {
  StruggleEntry,
  StrengthEntry,
  SessionAnalysisOutput,
  ConfidenceLevel,
} from '@eduagent/schemas';

describe('mergeInterests', () => {
  it('appends new interests and deduplicates', () => {
    const existing = ['space', 'dinosaurs'];
    const incoming = ['football', 'space']; // space is a duplicate
    const suppressed: string[] = [];
    const { interests } = mergeInterests(existing, incoming, suppressed);
    expect(interests).toEqual(['space', 'dinosaurs', 'football']);
  });

  it('respects the 20-entry cap by evicting oldest', () => {
    const existing = Array.from({ length: 20 }, (_, i) => `interest-${i}`);
    const incoming = ['brand-new'];
    const { interests } = mergeInterests(existing, incoming, []);
    expect(interests).toHaveLength(20);
    expect(interests).toContain('brand-new');
    expect(interests).not.toContain('interest-0'); // oldest evicted
  });

  it('filters out suppressed inferences', () => {
    const existing = ['space'];
    const incoming = ['dinosaurs', 'football'];
    const suppressed = ['dinosaurs'];
    const { interests } = mergeInterests(existing, incoming, suppressed);
    expect(interests).toEqual(['space', 'football']);
  });

  it('maintains timestamps for new and existing interests', () => {
    const existing = ['space'];
    const timestamps = { space: '2026-01-01T00:00:00Z' };
    const { interests, timestamps: newTs } = mergeInterests(
      existing,
      ['football'],
      [],
      timestamps
    );
    expect(interests).toEqual(['space', 'football']);
    expect(newTs['football']).toBeDefined();
    expect(newTs['space']).toBe('2026-01-01T00:00:00Z'); // unchanged — not in incoming
  });

  it('demotes interests older than 60 days to front (evicted first)', () => {
    const staleDate = new Date(
      Date.now() - 90 * 24 * 60 * 60 * 1000
    ).toISOString();
    const freshDate = new Date().toISOString();
    const existing = ['old-interest', 'recent-interest'];
    const timestamps = {
      'old-interest': staleDate,
      'recent-interest': freshDate,
    };
    const { interests } = mergeInterests(existing, [], [], timestamps);
    // Stale interests moved to front
    expect(interests[0]).toBe('old-interest');
    expect(interests[1]).toBe('recent-interest');
  });
});

describe('mergeStrengths', () => {
  it('creates a new strength entry from LLM signal', () => {
    const existing: StrengthEntry[] = [];
    const incoming = [{ topic: 'multiplication', subject: 'Math' }];
    const result = mergeStrengths(existing, incoming, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      subject: 'Math',
      topics: ['multiplication'],
      confidence: 'medium',
    });
  });

  it('appends topic to existing subject entry', () => {
    const existing: StrengthEntry[] = [
      { subject: 'Math', topics: ['multiplication'], confidence: 'medium' },
    ];
    const incoming = [{ topic: 'division', subject: 'Math' }];
    const result = mergeStrengths(existing, incoming, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.topics).toEqual(['multiplication', 'division']);
  });

  it('filters out suppressed topics', () => {
    const existing: StrengthEntry[] = [];
    const incoming = [{ topic: 'multiplication', subject: 'Math' }];
    const result = mergeStrengths(existing, incoming, ['multiplication']);
    expect(result).toHaveLength(0);
  });
});

describe('archiveStaleStruggles', () => {
  it('removes struggles older than 90 days', () => {
    const staleDate = new Date(
      Date.now() - 100 * 24 * 60 * 60 * 1000
    ).toISOString();
    const freshDate = new Date().toISOString();
    const struggles: StruggleEntry[] = [
      {
        subject: 'Math',
        topic: 'fractions',
        lastSeen: staleDate,
        attempts: 5,
        confidence: 'high',
      },
      {
        subject: 'Math',
        topic: 'decimals',
        lastSeen: freshDate,
        attempts: 2,
        confidence: 'low',
      },
    ];
    const result = archiveStaleStruggles(struggles);
    expect(result).toHaveLength(1);
    expect(result[0]!.topic).toBe('decimals');
  });

  it('keeps all struggles within 90-day window', () => {
    const freshDate = new Date().toISOString();
    const struggles: StruggleEntry[] = [
      {
        subject: 'Math',
        topic: 'fractions',
        lastSeen: freshDate,
        attempts: 3,
        confidence: 'medium',
      },
    ];
    const result = archiveStaleStruggles(struggles);
    expect(result).toHaveLength(1);
  });
});

describe('mergeStruggles', () => {
  it('creates a new struggle entry on first occurrence', () => {
    const existing: StruggleEntry[] = [];
    const incoming = [{ topic: 'fractions', subject: 'Math' }];
    const result = mergeStruggles(existing, incoming, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      topic: 'fractions',
      subject: 'Math',
      attempts: 1,
      confidence: 'low',
    });
  });

  it('increments attempts and upgrades confidence on repeat', () => {
    const existing: StruggleEntry[] = [
      {
        topic: 'fractions',
        subject: 'Math',
        lastSeen: '2026-03-01T00:00:00Z',
        attempts: 2,
        confidence: 'low',
      },
    ];
    const incoming = [{ topic: 'fractions', subject: 'Math' }];
    const result = mergeStruggles(existing, incoming, []);
    expect(result[0]!.attempts).toBe(3);
    expect(result[0]!.confidence).toBe('medium'); // 3+ sessions
  });

  it('upgrades to high confidence at 5+ attempts', () => {
    const existing: StruggleEntry[] = [
      {
        topic: 'fractions',
        subject: 'Math',
        lastSeen: '2026-03-01T00:00:00Z',
        attempts: 4,
        confidence: 'medium',
      },
    ];
    const incoming = [{ topic: 'fractions', subject: 'Math' }];
    const result = mergeStruggles(existing, incoming, []);
    expect(result[0]!.attempts).toBe(5);
    expect(result[0]!.confidence).toBe('high');
  });

  it('filters out suppressed inferences', () => {
    const existing: StruggleEntry[] = [];
    const incoming = [{ topic: 'fractions', subject: 'Math' }];
    const suppressed = ['fractions'];
    const result = mergeStruggles(existing, incoming, suppressed);
    expect(result).toHaveLength(0);
  });

  // FR244.9: Freeform session handling
  it('creates a struggle with null subject for freeform sessions', () => {
    const existing: StruggleEntry[] = [];
    const incoming = [{ topic: 'fractions', subject: null }];
    const result = mergeStruggles(existing, incoming, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      topic: 'fractions',
      subject: null,
      attempts: 1,
      confidence: 'low',
    });
  });

  it('upserts null-subject struggles by topic match', () => {
    const existing: StruggleEntry[] = [
      {
        topic: 'fractions',
        subject: null,
        lastSeen: '2026-03-01T00:00:00Z',
        attempts: 2,
        confidence: 'low',
      },
    ];
    const incoming = [{ topic: 'fractions', subject: null }];
    const result = mergeStruggles(existing, incoming, []);
    expect(result[0]!.attempts).toBe(3);
    expect(result[0]!.confidence).toBe('medium');
  });
});

describe('shouldUpdateLearningStyle', () => {
  it('returns true when existing field is empty', () => {
    expect(
      shouldUpdateLearningStyle(undefined, 'high', 0)
    ).toBe(false); // need 3+ corroborating sessions
  });

  it('returns true after 3+ corroborating sessions', () => {
    expect(
      shouldUpdateLearningStyle(undefined, 'high', 3)
    ).toBe(true);
  });

  it('returns false when new confidence is lower than existing', () => {
    expect(
      shouldUpdateLearningStyle('high', 'medium', 5)
    ).toBe(false);
  });
});

describe('buildMemoryBlock', () => {
  it('returns empty string for null profile', () => {
    expect(buildMemoryBlock(null, null, null)).toBe('');
  });

  it('returns empty string when memoryEnabled is false', () => {
    const profile = {
      learningStyle: null,
      interests: ['space'],
      strengths: [],
      struggles: [],
      communicationNotes: [],
      memoryEnabled: false,
    };
    expect(buildMemoryBlock(profile as any, null, null)).toBe('');
  });

  it('prioritizes struggles relevant to current subject', () => {
    const profile = {
      learningStyle: null,
      interests: ['space'],
      strengths: [],
      struggles: [
        {
          subject: 'Math',
          topic: 'fractions',
          attempts: 5,
          confidence: 'high' as const,
          lastSeen: '2026-04-01T00:00:00Z',
        },
      ],
      communicationNotes: ['responds well to humor'],
      memoryEnabled: true,
    };
    const block = buildMemoryBlock(profile as any, 'Math', null);
    expect(block).toContain('fractions');
    expect(block).toContain('About this learner');
  });

  it('omits low-confidence struggles', () => {
    const profile = {
      learningStyle: null,
      interests: [],
      strengths: [],
      struggles: [
        {
          subject: 'Math',
          topic: 'algebra',
          attempts: 1,
          confidence: 'low' as const,
          lastSeen: '2026-04-01T00:00:00Z',
        },
      ],
      communicationNotes: [],
      memoryEnabled: true,
    };
    const block = buildMemoryBlock(profile as any, 'Math', null);
    expect(block).not.toContain('algebra');
  });

  it('includes the meta-instruction for natural weaving', () => {
    const profile = {
      learningStyle: { preferredExplanations: ['stories'] },
      interests: ['dinosaurs'],
      strengths: [],
      struggles: [],
      communicationNotes: [],
      memoryEnabled: true,
    };
    const block = buildMemoryBlock(profile as any, null, null);
    expect(block).toContain('Use the learner memory naturally');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest --testPathPattern=learner-profile.test --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Write the learner profile service**

```typescript
// apps/api/src/services/learner-profile.ts
import { eq, and, sql } from 'drizzle-orm';
import { learningProfiles, type Database } from '@eduagent/database';
import type {
  StruggleEntry,
  ConfidenceLevel,
  LearningStyle,
  SessionAnalysisOutput,
} from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_INTERESTS = 20;
const MAX_COMMUNICATION_NOTES = 10;
const MAX_STRUGGLES = 30;
const STRUGGLE_ARCHIVAL_DAYS = 90;
const INTEREST_DEMOTION_DAYS = 60;
// AD6 (Epic 15): Shared system prompt token budget is ~1,000 across all specs.
// This epic's memory block gets 500 of that budget.
const MEMORY_BLOCK_TOKEN_BUDGET = 500;
// Rough estimate: 1 token ≈ 4 chars
const MEMORY_BLOCK_CHAR_BUDGET = MEMORY_BLOCK_TOKEN_BUDGET * 4;
const CONFIDENCE_ORDER: Record<ConfidenceLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};
const LEARNING_STYLE_CORROBORATION_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Merge Helpers (pure functions, exported for testing)
// ---------------------------------------------------------------------------

/**
 * Merges incoming interests, maintains a timestamps map for FR246.4 (60-day demotion).
 * Stale interests (not seen in 60+ days) are demoted to the front of the array
 * so they get evicted first when the 20-entry cap is reached.
 */
export function mergeInterests(
  existing: string[],
  incoming: string[],
  suppressed: string[],
  timestamps: Record<string, string> = {}
): { interests: string[]; timestamps: Record<string, string> } {
  const suppressedSet = new Set(
    suppressed.map((s) => s.toLowerCase().trim())
  );
  const now = new Date().toISOString();
  const updatedTimestamps = { ...timestamps };
  const merged = [...existing];

  for (const interest of incoming) {
    const normalized = interest.toLowerCase().trim();
    if (suppressedSet.has(normalized)) continue;
    if (merged.some((e) => e.toLowerCase().trim() === normalized)) {
      // Update timestamp for existing interest
      updatedTimestamps[normalized] = now;
      continue;
    }
    merged.push(interest);
    updatedTimestamps[normalized] = now;
  }

  // FR246.4: Demote stale interests (60+ days) to front of array
  const cutoff = new Date(
    Date.now() - INTEREST_DEMOTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const fresh: string[] = [];
  const stale: string[] = [];
  for (const interest of merged) {
    const ts = updatedTimestamps[interest.toLowerCase().trim()];
    if (ts && ts < cutoff) {
      stale.push(interest);
    } else {
      fresh.push(interest);
    }
  }
  // Stale at the front → evicted first by cap
  const sorted = [...stale, ...fresh];

  // Evict oldest (front of array) when over cap
  while (sorted.length > MAX_INTERESTS) {
    const evicted = sorted.shift()!;
    delete updatedTimestamps[evicted.toLowerCase().trim()];
  }

  return { interests: sorted, timestamps: updatedTimestamps };
}

/**
 * Merges strength signals from LLM analysis into existing strengths.
 * Strengths are keyed by (subject, topic). Confidence upgrades with repeated evidence.
 */
export function mergeStrengths(
  existing: StrengthEntry[],
  incoming: { topic: string; subject: string | null }[],
  suppressed: string[]
): StrengthEntry[] {
  const suppressedSet = new Set(
    suppressed.map((s) => s.toLowerCase().trim())
  );
  const result = [...existing];

  for (const signal of incoming) {
    if (suppressedSet.has(signal.topic.toLowerCase().trim())) continue;
    // FR244.9: skip strength signals with no subject — strengths are subject-specific
    if (!signal.subject) continue;

    const idx = result.findIndex(
      (e) => (e.subject ?? '').toLowerCase() === (signal.subject ?? '').toLowerCase()
    );

    if (idx >= 0) {
      const entry = result[idx]!;
      const topics = new Set(entry.topics.map((t) => t.toLowerCase()));
      if (!topics.has(signal.topic.toLowerCase())) {
        // Upgrade confidence when accumulating more topics: 3+ topics → high
        const newTopicCount = entry.topics.length + 1;
        const upgradedConfidence: ConfidenceLevel =
          newTopicCount >= 3 ? 'high' : entry.confidence;
        result[idx] = {
          ...entry,
          topics: [...entry.topics, signal.topic],
          confidence: upgradedConfidence,
        };
      }
    } else {
      result.push({
        subject: signal.subject,
        topics: [signal.topic],
        confidence: 'medium',
      });
    }
  }

  return result;
}

/**
 * FR243.5: Archive struggles older than 90 days.
 * Removes entries whose lastSeen is beyond the archival threshold.
 */
export function archiveStaleStruggles(
  struggles: StruggleEntry[]
): StruggleEntry[] {
  const cutoff = new Date(
    Date.now() - STRUGGLE_ARCHIVAL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  return struggles.filter((s) => s.lastSeen >= cutoff);
}

export function mergeStruggles(
  existing: StruggleEntry[],
  incoming: { topic: string; subject: string | null }[],
  suppressed: string[]
): StruggleEntry[] {
  const suppressedSet = new Set(
    suppressed.map((s) => s.toLowerCase().trim())
  );
  const result = [...existing];

  for (const signal of incoming) {
    if (suppressedSet.has(signal.topic.toLowerCase().trim())) continue;

    // FR244.9: subject may be null for freeform sessions
    const idx = result.findIndex(
      (e) =>
        e.topic.toLowerCase() === signal.topic.toLowerCase() &&
        (e.subject ?? '').toLowerCase() === (signal.subject ?? '').toLowerCase()
    );

    if (idx >= 0) {
      const entry = result[idx]!;
      const newAttempts = entry.attempts + 1;
      result[idx] = {
        ...entry,
        attempts: newAttempts,
        lastSeen: new Date().toISOString(),
        confidence:
          newAttempts >= 5 ? 'high' : newAttempts >= 3 ? 'medium' : 'low',
      };
    } else {
      result.push({
        subject: signal.subject,
        topic: signal.topic,
        lastSeen: new Date().toISOString(),
        attempts: 1,
        confidence: 'low',
      });
    }
  }

  return result;
}

export function mergeCommunicationNotes(
  existing: string[],
  incoming: string[],
  suppressed: string[]
): string[] {
  const suppressedSet = new Set(
    suppressed.map((s) => s.toLowerCase().trim())
  );
  const merged = [...existing];

  for (const note of incoming) {
    const normalized = note.toLowerCase().trim();
    if (suppressedSet.has(normalized)) continue;
    // Simple string-match deduplication
    if (merged.some((e) => e.toLowerCase().trim() === normalized)) continue;
    merged.push(note);
  }

  // Keep only the most recent N notes
  while (merged.length > MAX_COMMUNICATION_NOTES) {
    merged.shift();
  }

  return merged;
}

export function shouldUpdateLearningStyle(
  existingConfidence: ConfidenceLevel | undefined,
  newConfidence: ConfidenceLevel,
  corroboratingSessions: number
): boolean {
  if (corroboratingSessions < LEARNING_STYLE_CORROBORATION_THRESHOLD) {
    return false;
  }
  if (!existingConfidence) return true;
  return CONFIDENCE_ORDER[newConfidence]! > CONFIDENCE_ORDER[existingConfidence]!;
}

// ---------------------------------------------------------------------------
// Memory Block Construction (FR245)
// ---------------------------------------------------------------------------

interface MemoryBlockProfile {
  learningStyle: LearningStyle | null;
  interests: string[];
  strengths: { subject: string; topics: string[]; confidence: ConfidenceLevel }[];
  struggles: StruggleEntry[];
  communicationNotes: string[];
  memoryEnabled: boolean;
}

export function buildMemoryBlock(
  profile: MemoryBlockProfile | null,
  currentSubject: string | null,
  currentTopic: string | null
): string {
  if (!profile || !profile.memoryEnabled) return '';

  const lines: string[] = [];

  // Priority 1: Active struggles relevant to current subject (high confidence only)
  // FR244.9: subject may be null for freeform-filed struggles — include them always
  // (null-subject struggles like "fractions" are relevant regardless of the current subject)
  const relevantStruggles = profile.struggles.filter(
    (s) =>
      s.confidence !== 'low' &&
      (!currentSubject || !s.subject || s.subject.toLowerCase() === currentSubject.toLowerCase())
  );
  if (relevantStruggles.length > 0) {
    const struggleTopics = relevantStruggles.map((s) => s.topic).join(', ');
    lines.push(
      `- They've been working hard on: ${struggleTopics} — be extra patient and try different explanation approaches`
    );
  }

  // Priority 2: Learning style (high confidence only)
  const style = profile.learningStyle;
  if (style) {
    const parts: string[] = [];
    if (style.preferredExplanations?.length) {
      parts.push(
        `${style.preferredExplanations.join(' and ')}-based explanations`
      );
    }
    if (style.pacePreference) {
      parts.push(
        style.pacePreference === 'thorough'
          ? 'step-by-step pace'
          : 'quick pace'
      );
    }
    if (style.responseToChallenge) {
      parts.push(
        style.responseToChallenge === 'motivated'
          ? 'motivated by challenge'
          : 'needs encouragement with difficult material'
      );
    }
    if (parts.length > 0) {
      lines.push(`- They learn best with ${parts.join(', ')}`);
    }
  }

  // Priority 3: Interests (top 5, most recent first)
  const topInterests = profile.interests.slice(-5).reverse();
  if (topInterests.length > 0) {
    lines.push(
      `- They're interested in: ${topInterests.join(', ')}`
    );
  }

  // Priority 4: Communication notes (max 2, most recent)
  const recentNotes = profile.communicationNotes.slice(-2);
  if (recentNotes.length > 0) {
    lines.push(`- ${recentNotes.join('. ')}`);
  }

  if (lines.length === 0) return '';

  const META_INSTRUCTION =
    'Use the learner memory naturally in conversation. Reference their interests when generating examples. ' +
    'Use their preferred explanation style. Do NOT explicitly tell the learner you are reading from a profile — weave it in naturally.';

  // Section-aware truncation: drop lowest-priority sections first
  // (reverse priority order) rather than blind character slicing.
  // Meta-instruction is always preserved to prevent accidental profile disclosure.
  let block =
    'About this learner:\n' + lines.join('\n') + '\n\n' + META_INSTRUCTION;

  // Drop lowest-priority sections until within budget
  // Priority order (highest first): struggles, style, interests, communication notes
  while (block.length > MEMORY_BLOCK_CHAR_BUDGET && lines.length > 0) {
    lines.pop(); // Remove lowest-priority section
    block =
      'About this learner:\n' + lines.join('\n') + '\n\n' + META_INSTRUCTION;
  }

  return block;
}

// ---------------------------------------------------------------------------
// Database Operations
// ---------------------------------------------------------------------------

export async function getLearningProfile(
  db: Database,
  profileId: string
) {
  return db.query.learningProfiles.findFirst({
    where: eq(learningProfiles.profileId, profileId),
  });
}

export async function getOrCreateLearningProfile(
  db: Database,
  profileId: string
) {
  const existing = await getLearningProfile(db, profileId);
  if (existing) return existing;

  const [created] = await db
    .insert(learningProfiles)
    .values({ profileId })
    .onConflictDoNothing({ target: learningProfiles.profileId })
    .returning();

  // If onConflictDoNothing returned nothing, another process created it
  return created ?? (await getLearningProfile(db, profileId))!;
}

export async function applyAnalysis(
  db: Database,
  profileId: string,
  analysis: SessionAnalysisOutput,
  subjectName: string | null  // FR244.9: null for freeform sessions
): Promise<void> {
  // FR244.4: Low confidence analysis is logged but not applied
  if (analysis.confidence === 'low') return;

  const profile = await getOrCreateLearningProfile(db, profileId);
  const suppressed = (profile.suppressedInferences as string[]) ?? [];

  // Build update payload via incremental merge
  const updates: Record<string, unknown> = {};

  if (analysis.interests?.length) {
    const { interests, timestamps } = mergeInterests(
      (profile.interests as string[]) ?? [],
      analysis.interests,
      suppressed,
      (profile.interestTimestamps as Record<string, string>) ?? {}
    );
    updates.interests = interests;
    updates.interestTimestamps = timestamps;
  }

  if (analysis.strengths?.length) {
    updates.strengths = mergeStrengths(
      (profile.strengths as StrengthEntry[]) ?? [],
      analysis.strengths,
      suppressed
    );
  }

  if (analysis.struggles?.length) {
    let struggles = mergeStruggles(
      (profile.struggles as StruggleEntry[]) ?? [],
      analysis.struggles,
      suppressed
    );
    // FR243.5: Archive struggles older than 90 days
    struggles = archiveStaleStruggles(struggles);
    updates.struggles = struggles;
  }

  // FR247.4: Resolve struggles where learner demonstrated mastery
  if (analysis.resolvedTopics?.length) {
    const currentStruggles =
      (updates.struggles as StruggleEntry[]) ??
      (profile.struggles as StruggleEntry[]) ??
      [];
    let resolved = currentStruggles;
    for (const { topic, subject: subj } of analysis.resolvedTopics) {
      resolved = resolveStruggle(resolved, topic, subj);
    }
    updates.struggles = resolved;
  }

  if (analysis.communicationNotes?.length) {
    updates.communicationNotes = mergeCommunicationNotes(
      (profile.communicationNotes as string[]) ?? [],
      analysis.communicationNotes,
      suppressed
    );
  }

  if (Object.keys(updates).length === 0) return;

  // Optimistic concurrency: version check
  const [updated] = await db
    .update(learningProfiles)
    .set({
      ...updates,
      version: sql`${learningProfiles.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningProfiles.profileId, profileId),
        eq(learningProfiles.version, profile.version)
      )
    )
    .returning();

  if (!updated) {
    // Version conflict — retry once with fresh read + version guard
    const fresh = await getLearningProfile(db, profileId);
    if (!fresh) return; // Profile deleted during analysis

    const freshSuppressed = (fresh.suppressedInferences as string[]) ?? [];
    const retryUpdates: Record<string, unknown> = {};

    if (analysis.interests?.length) {
      const { interests, timestamps } = mergeInterests(
        (fresh.interests as string[]) ?? [],
        analysis.interests,
        freshSuppressed,
        (fresh.interestTimestamps as Record<string, string>) ?? {}
      );
      retryUpdates.interests = interests;
      retryUpdates.interestTimestamps = timestamps;
    }
    if (analysis.strengths?.length) {
      retryUpdates.strengths = mergeStrengths(
        (fresh.strengths as StrengthEntry[]) ?? [],
        analysis.strengths,
        freshSuppressed
      );
    }
    if (analysis.struggles?.length) {
      let struggles = mergeStruggles(
        (fresh.struggles as StruggleEntry[]) ?? [],
        analysis.struggles,
        freshSuppressed
      );
      struggles = archiveStaleStruggles(struggles);
      retryUpdates.struggles = struggles;
    }
    if (analysis.resolvedTopics?.length) {
      const base =
        (retryUpdates.struggles as StruggleEntry[]) ??
        (fresh.struggles as StruggleEntry[]) ??
        [];
      let resolved = base;
      for (const { topic, subject: subj } of analysis.resolvedTopics) {
        resolved = resolveStruggle(resolved, topic, subj);
      }
      retryUpdates.struggles = resolved;
    }
    if (analysis.communicationNotes?.length) {
      retryUpdates.communicationNotes = mergeCommunicationNotes(
        (fresh.communicationNotes as string[]) ?? [],
        analysis.communicationNotes,
        freshSuppressed
      );
    }

    // Retry with version guard to prevent overwriting concurrent changes
    await db
      .update(learningProfiles)
      .set({
        ...retryUpdates,
        version: sql`${learningProfiles.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(learningProfiles.profileId, profileId),
          eq(learningProfiles.version, fresh.version)
        )
      );
    // If this also fails (third concurrent writer), we accept the loss —
    // the data will be re-derived from the next session analysis.
  }
}

export async function deleteMemoryItem(
  db: Database,
  profileId: string,
  category: string,
  value: string,
  suppress: boolean,
  subject?: string
): Promise<void> {
  const profile = await getLearningProfile(db, profileId);
  if (!profile) return;

  const updates: Record<string, unknown> = {};

  switch (category) {
    case 'interests': {
      const arr = (profile.interests as string[]) ?? [];
      updates.interests = arr.filter(
        (i) => i.toLowerCase() !== value.toLowerCase()
      );
      // Clean up interest timestamp
      const timestamps = {
        ...((profile.interestTimestamps as Record<string, string>) ?? {}),
      };
      delete timestamps[value.toLowerCase().trim()];
      updates.interestTimestamps = timestamps;
      break;
    }
    case 'struggles': {
      const arr = (profile.struggles as StruggleEntry[]) ?? [];
      // Use both topic and subject to disambiguate across subjects
      // FR244.9: subject may be null for freeform struggles
      updates.struggles = arr.filter(
        (s) =>
          !(
            s.topic.toLowerCase() === value.toLowerCase() &&
            (!subject || (s.subject ?? '').toLowerCase() === subject.toLowerCase())
          )
      );
      break;
    }
    case 'strengths': {
      const arr = (profile.strengths as any[]) ?? [];
      updates.strengths = arr.filter(
        (s) => (s.subject ?? '').toLowerCase() !== value.toLowerCase()
      );
      break;
    }
    case 'communicationNotes': {
      const arr = (profile.communicationNotes as string[]) ?? [];
      updates.communicationNotes = arr.filter(
        (n) => n.toLowerCase() !== value.toLowerCase()
      );
      break;
    }
    case 'learningStyle': {
      const style = (profile.learningStyle as Record<string, unknown>) ?? {};
      const { [value]: _, ...rest } = style;
      updates.learningStyle = Object.keys(rest).length > 0 ? rest : null;
      break;
    }
  }

  if (suppress) {
    const suppressed = (profile.suppressedInferences as string[]) ?? [];
    if (!suppressed.includes(value.toLowerCase())) {
      updates.suppressedInferences = [...suppressed, value.toLowerCase()];
    }
  }

  // OCC: version guard prevents overwriting concurrent analysis results
  await db
    .update(learningProfiles)
    .set({
      ...updates,
      version: sql`${learningProfiles.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningProfiles.profileId, profileId),
        eq(learningProfiles.version, profile.version)
      )
    );
  // If version conflict: user's delete wins on retry (next screen load refreshes)
}

export async function toggleMemoryEnabled(
  db: Database,
  profileId: string,
  enabled: boolean
): Promise<void> {
  const profile = await getLearningProfile(db, profileId);
  if (!profile) {
    // Create with memoryEnabled set
    await db
      .insert(learningProfiles)
      .values({ profileId, memoryEnabled: enabled })
      .onConflictDoNothing({ target: learningProfiles.profileId });
    return;
  }

  await db
    .update(learningProfiles)
    .set({
      memoryEnabled: enabled,
      version: sql`${learningProfiles.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(learningProfiles.profileId, profileId));
}

export async function deleteAllMemory(
  db: Database,
  profileId: string
): Promise<void> {
  await db
    .delete(learningProfiles)
    .where(eq(learningProfiles.profileId, profileId));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest --testPathPattern=learner-profile.test --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Run typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/learner-profile.ts apps/api/src/services/learner-profile.test.ts
git commit -m "feat(api): add learner profile service with merge logic and memory block construction [Epic-16, Story-16.1]"
```

---

### Task 6: Session Analysis Inngest Step (Story 16.2)

**Files:**
- Modify: `apps/api/src/inngest/functions/session-completed.ts`

This task adds a new `analyze-learner-profile` step to the existing session-completed Inngest chain. Per the shared Inngest chain ordering (Epic 15 AD6), this step runs at **position 4** — after post-session filing (position 3, Conversation-First) and before the progress snapshot refresh (position 5, Epic 15).

> **FR244.9 (Freeform session handling):** Sessions from Conversation-First Flow 3 may have no subject. The analysis function must handle `subjectId = null` — run analysis on the transcript regardless, store struggles with `subject: null` when unfiled, and use the filing result (topic → subject mapping) when available from the preceding step 3.
>
> **FR246.5 (rawInput as interest signal):** The session's `rawInput` field (the learner's initial free-text prompt) is treated as a strong interest signal alongside the transcript. Include it in the analysis payload so the LLM can detect interests from what the learner chose to explore.

- [ ] **Step 1: Write the analysis prompt and service function**

Add to `apps/api/src/services/learner-profile.ts`:

```typescript
// ---------------------------------------------------------------------------
// Session Analysis LLM Call (FR244)
// ---------------------------------------------------------------------------

import { routeAndCall } from './llm';
import type { ChatMessage } from './llm';

const SESSION_ANALYSIS_PROMPT = `You are analyzing a tutoring session transcript between an AI mentor and a young learner.

Extract the following signals from the conversation. Be conservative — only flag signals you are confident about.

Your output MUST be valid JSON matching this schema:
{
  "explanationEffectiveness": {
    "effective": ["stories" | "examples" | "diagrams" | "analogies" | "step-by-step" | "humor"],
    "ineffective": ["stories" | "examples" | "diagrams" | "analogies" | "step-by-step" | "humor"]
  } | null,
  "interests": ["string"] | null,
  "strengths": [{"topic": "string", "subject": "string"}] | null,
  "struggles": [{"topic": "string", "subject": "string | null"}] | null,
  "resolvedTopics": [{"topic": "string", "subject": "string | null"}] | null,
  "communicationNotes": ["string"] | null,
  "engagementLevel": "high" | "medium" | "low" | null,
  "confidence": "low" | "medium" | "high"
}

Rules:
- "interests": Only flag explicit enthusiasm ("I love X", "X is cool", rapid follow-up questions about X). Passing mentions don't count.
- "strengths": Flag topics where the learner demonstrates clear mastery — correct answers on first try, ability to explain concepts back, confident and accurate problem-solving. Only flag when the evidence is strong within this session.
- "struggles": Only flag when the learner repeatedly shows confusion or gives wrong answers on the SAME concept within this session. Single mistakes are normal learning.
- "resolvedTopics": Flag topics that were previously a struggle but where the learner now demonstrates understanding — correct answers after earlier confusion, successful "I get it" moments, ability to apply the concept. This signals growth.
- "explanationEffectiveness": Tag each explanation attempt with its style and whether it led to understanding (correct follow-up, "I get it") or confusion (re-asks, wrong answer after explanation).
- "communicationNotes": Observations like "responds well to humor", "prefers short explanations", "gets frustrated with repetition". Only flag clear patterns.
- "confidence": Your overall confidence in this analysis. Use "low" if the session was too short or ambiguous to extract meaningful signals.
- Return null for any field where you found no signal.
- If the subject is "Unknown" or "Freeform", still extract interests, communication notes, and engagement — use null for subject in struggle/strength entries that lack clear subject context.

Subject: {subject}
Topic: {topic}
Raw input (the learner's initial prompt — treat as a strong interest signal): {rawInput}`;

const MAX_TRANSCRIPT_EVENTS = 100;

export async function analyzeSessionTranscript(
  transcript: Array<{ eventType: string; content: string }>,
  subjectName: string | null,
  topicTitle: string | null,
  rawInput?: string | null
): Promise<SessionAnalysisOutput | null> {
  // Truncate very long transcripts
  const conversationEvents = transcript
    .filter((e) => e.eventType === 'user_message' || e.eventType === 'ai_response')
    .slice(-MAX_TRANSCRIPT_EVENTS);

  if (conversationEvents.length < 3) {
    // Too few exchanges to analyze meaningfully
    return null;
  }

  const transcriptText = conversationEvents
    .map((e) => `${e.eventType === 'user_message' ? 'Learner' : 'Mentor'}: ${e.content}`)
    .join('\n\n');

  // FR244.9: Handle freeform sessions with no subject
  const systemPrompt = SESSION_ANALYSIS_PROMPT
    .replace('{subject}', subjectName ?? 'Freeform')
    .replace('{topic}', topicTitle ?? 'General')
    .replace('{rawInput}', rawInput ?? '(none)');

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: transcriptText },
  ];

  // Use rung 1 (budget model) — this is background processing (FR244.7)
  const result = await routeAndCall(messages, 1, {});
  if (!result?.response) return null;

  try {
    // Extract JSON from LLM response (may be wrapped in markdown code block)
    const jsonMatch = result.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const validated = sessionAnalysisOutputSchema.safeParse(parsed);
    if (!validated.success) return null;

    return validated.data;
  } catch {
    return null;
  }
}
```

Add the import at the top of learner-profile.ts:

```typescript
import { sessionAnalysisOutputSchema } from '@eduagent/schemas';
```

- [ ] **Step 2: Add the `analyze-learner-profile` step to session-completed.ts**

Add import at the top of `session-completed.ts`:

```typescript
import {
  getLearningProfile,
  analyzeSessionTranscript,
  applyAnalysis,
} from '../../services/learner-profile';
```

Then add the new step at **position 4** in the Inngest chain (per Epic 15 AD6: shared ordering). This runs after post-session filing (position 3) and before the progress snapshot refresh (position 5):

```typescript
    // Step 4: Analyze session for learner profile signals (Epic 16, FR244)
    // Position 4 in shared Inngest chain (Epic 15 AD6)
    outcomes.push(
      await step.run('analyze-learner-profile', async () =>
        runIsolated('analyze-learner-profile', profileId, async () => {
          const db = getStepDatabase();

          // FR244.6: Short-circuit if memory disabled
          const existingProfile = await getLearningProfile(db, profileId);
          if (existingProfile?.memoryEnabled === false) return;

          // Load transcript
          const transcriptEvents = await db.query.sessionEvents.findMany({
            where: and(
              eq(sessionEvents.sessionId, sessionId),
              eq(sessionEvents.profileId, profileId)
            ),
            orderBy: asc(sessionEvents.createdAt),
            columns: { eventType: true, content: true },
          });

          // FR244.9: Handle freeform sessions — subjectId may be null
          const [subjectRow] = subjectId
            ? await db
                .select({ name: subjects.name })
                .from(subjects)
                .where(eq(subjects.id, subjectId))
                .limit(1)
            : [null];

          const topicTitle = topicId ? await loadTopicTitle(db, topicId) : null;

          // FR246.5: Load rawInput as strong interest signal
          const sessionRow = await db.query.learningSessions.findFirst({
            where: eq(learningSessions.id, sessionId),
            columns: { rawInput: true },
          });

          const analysis = await analyzeSessionTranscript(
            transcriptEvents,
            subjectRow?.name ?? null,
            topicTitle,
            sessionRow?.rawInput
          );

          if (!analysis) return;

          await applyAnalysis(
            db,
            profileId,
            analysis,
            subjectRow?.name ?? null
          );
        })
      )
    );
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: No errors

- [ ] **Step 4: Write test for FR244.8 metric emission**

Add to `apps/api/src/inngest/functions/session-completed.test.ts` (or `learner-profile.test.ts`):

```typescript
describe('analyze-learner-profile metrics (FR244.8)', () => {
  it('logs learner_profile.analysis.completed with fieldsUpdated', async () => {
    const consoleSpy = jest.spyOn(console, 'info');
    // ... trigger analysis with a medium/high confidence result
    expect(consoleSpy).toHaveBeenCalledWith(
      '[learner-profile] Analysis applied',
      expect.objectContaining({
        event: 'learner_profile.analysis.completed',
        fieldsUpdated: expect.any(Array),
      })
    );
  });

  it('logs learner_profile.analysis.low_confidence and skips apply', async () => {
    const consoleSpy = jest.spyOn(console, 'info');
    // ... trigger analysis with a low confidence result
    expect(consoleSpy).toHaveBeenCalledWith(
      '[learner-profile] Low-confidence analysis skipped',
      expect.objectContaining({
        event: 'learner_profile.analysis.low_confidence',
      })
    );
  });
});
```

- [ ] **Step 5: Run existing session-completed tests to verify no regression**

Run: `cd apps/api && pnpm exec jest --testPathPattern=session-completed.test --no-coverage`
Expected: All existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/learner-profile.ts apps/api/src/inngest/functions/session-completed.ts
git commit -m "feat(api): add analyze-learner-profile Inngest step with LLM analysis [Epic-16, Story-16.2]"
```

---

### Task 7: Memory Context Injection into System Prompt (Story 16.3)

**Files:**
- Modify: `apps/api/src/services/exchanges.ts`
- Modify: `apps/api/src/services/session.ts`

- [ ] **Step 1: Add `learnerMemoryContext` to `ExchangeContext`**

In `apps/api/src/services/exchanges.ts`, add a new field to the `ExchangeContext` interface (after `embeddingMemoryContext`):

```typescript
  /** Learner memory context — adaptive memory block from learning profile (Epic 16, FR245) */
  learnerMemoryContext?: string;
```

- [ ] **Step 2: Inject the memory block in `buildSystemPrompt()`**

In `buildSystemPrompt()`, add the learner memory block injection after the embedding memory context block (after line ~281 — `context.embeddingMemoryContext`):

```typescript
  // Learner memory context (Epic 16, FR245)
  if (context.learnerMemoryContext) {
    sections.push(context.learnerMemoryContext);
  }
```

> **Amendment 3 (deduplication):** If `buildSystemPrompt()` already injects a "prior learning" or embedding memory section, verify the learner memory block doesn't duplicate topic/subject references. The two blocks serve different purposes — embedding memory is episodic recall ("Remember when we covered X"), while learner memory is profile-level ("This learner prefers stories"). If both mention the same topic, the learner memory block should defer to the episodic reference. Add a comment noting this boundary for future maintainers.

- [ ] **Step 3: Load learning profile in `prepareExchangeContext()`**

In `apps/api/src/services/session.ts`, add the import:

```typescript
import { getLearningProfile, buildMemoryBlock } from './learner-profile';
```

Then add `learningProfileRow` to the `Promise.all()` parallel query array in `prepareExchangeContext()` (add as the last item in the array):

```typescript
    // Epic 16: Load learning profile for memory context injection
    getLearningProfile(db, profileId),
```

Add the variable to the destructuring:

```typescript
    learningProfileRow,
```

Then after the parallel queries complete (near line ~960 where `ExchangeContext` is built), construct the memory block and add it to the context:

```typescript
    // Epic 16: Build learner memory context (FR245)
    const learnerMemoryContext = learningProfileRow
      ? buildMemoryBlock(
          {
            learningStyle: learningProfileRow.learningStyle as any,
            interests: (learningProfileRow.interests as string[]) ?? [],
            strengths: (learningProfileRow.strengths as any[]) ?? [],
            struggles: (learningProfileRow.struggles as any[]) ?? [],
            communicationNotes: (learningProfileRow.communicationNotes as string[]) ?? [],
            memoryEnabled: learningProfileRow.memoryEnabled,
          },
          subject?.name ?? null,
          topic?.title ?? null
        )
      : '';
```

And add `learnerMemoryContext: learnerMemoryContext || undefined` to the `ExchangeContext` object construction.

- [ ] **Step 4: Run typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: No errors

- [ ] **Step 5: Run related tests**

Run: `cd apps/api && pnpm exec jest --findRelatedTests src/services/exchanges.ts src/services/session.ts --no-coverage`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/exchanges.ts apps/api/src/services/session.ts
git commit -m "feat(api): inject learner memory context into system prompt [Epic-16, Story-16.3]"
```

---

### Task 8: Add Learning Profiles to Data Export (Story 16.1 — GDPR)

**Files:**
- Modify: `apps/api/src/services/export.ts`

- [ ] **Step 1: Add import for learningProfiles table**

Add to the imports in `export.ts`:

```typescript
import { learningProfiles } from '@eduagent/database';
```

(Add `learningProfiles` to the existing destructured import from `@eduagent/database`.)

- [ ] **Step 2: Add learning profile data to the export payload**

In the `generateExport()` function, after the existing per-profile data loading, add:

```typescript
    const learningProfileRows =
      profileIds.length > 0
        ? await db.query.learningProfiles.findMany({
            where: inArray(learningProfiles.profileId, profileIds),
          })
        : [];
```

Then include `learningProfileRows` in the export payload per profile:

```typescript
    learningProfile: learningProfileRows.find((lp) => lp.profileId === p.id) ?? null,
```

- [ ] **Step 3: Add `learningProfile` to the `DataExport` type**

In `packages/schemas/src/account.ts` (or wherever `DataExport` is defined), add the `learningProfile` field to each profile in the export type. If `DataExport` doesn't type the profile contents strictly, verify the shape is included.

- [ ] **Step 4: Run typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/export.ts packages/schemas/src/account.ts
git commit -m "feat(api): include learning profiles in GDPR data export [Epic-16, FR250.6]"
```

---

## Phase B — Memory Refinement (Stories 16.4–16.6)

> Phase B stories enhance the analysis prompt and merge logic. They do NOT create new Inngest functions — they refine what Story 16.2 already built.

### Task 9: Interest Detection Refinement (Story 16.4)

**Files:**
- Test: `apps/api/src/services/learner-profile.test.ts`

> **Note:** FR246.4 (60-day interest demotion) is now fully implemented in Task 5's `mergeInterests` via the `interestTimestamps` JSONB column. This task verifies the prompt coverage and adds any additional edge-case tests.

- [ ] **Step 1: Verify the analysis prompt in Task 6 covers interest detection (FR246.1–FR246.3)**

Verify the `SESSION_ANALYSIS_PROMPT` includes:
- Explicit statement detection
- Enthusiastic engagement detection
- Conservative flagging (passing mentions don't count)

No code changes needed — the prompt from Task 6 already handles this.

- [ ] **Step 2: Add edge-case test for timestamp update on re-mention**

Add to `learner-profile.test.ts`:

```typescript
describe('mergeInterests — timestamp edge cases', () => {
  it('updates timestamp when existing interest is re-mentioned', () => {
    const oldDate = '2026-01-01T00:00:00Z';
    const existing = ['space'];
    const timestamps = { space: oldDate };
    const { timestamps: newTs } = mergeInterests(
      existing,
      ['space'], // re-mention
      [],
      timestamps
    );
    // Timestamp should be updated to now (not the old date)
    expect(new Date(newTs['space']!).getTime()).toBeGreaterThan(
      new Date(oldDate).getTime()
    );
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/api && pnpm exec jest --testPathPattern=learner-profile.test --no-coverage`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/learner-profile.test.ts
git commit -m "test(api): add interest timestamp edge-case tests [Epic-16, Story-16.4]"
```

---

### Task 10: Struggle Pattern Detection Refinement — Edge Cases (Story 16.5)

**Files:**
- Test: `apps/api/src/services/learner-profile.test.ts`

> **Note:** `resolveStruggle` was already implemented in Task 5 (required by `applyAnalysis` which calls it). This task adds edge-case tests only.

- [ ] **Step 1: Write edge-case tests for struggle resolution**

Add to `learner-profile.test.ts`:

```typescript
describe('resolveStruggle — edge cases', () => {
  it('leaves unrelated struggles untouched', () => {
    const struggles: StruggleEntry[] = [
      {
        subject: 'Math',
        topic: 'fractions',
        lastSeen: '2026-03-01T00:00:00Z',
        attempts: 5,
        confidence: 'high',
      },
      {
        subject: 'Math',
        topic: 'decimals',
        lastSeen: '2026-03-01T00:00:00Z',
        attempts: 3,
        confidence: 'medium',
      },
    ];
    const result = resolveStruggle(struggles, 'fractions', 'Math');
    expect(result).toHaveLength(2);
    expect(result[0]!.confidence).toBe('medium'); // fractions downgraded
    expect(result[1]!.confidence).toBe('medium'); // decimals untouched
  });

  it('is case-insensitive on topic and subject', () => {
    const struggles: StruggleEntry[] = [
      {
        subject: 'Math',
        topic: 'Fractions',
        lastSeen: '2026-03-01T00:00:00Z',
        attempts: 5,
        confidence: 'high',
      },
    ];
    const result = resolveStruggle(struggles, 'fractions', 'math');
    expect(result[0]!.confidence).toBe('medium');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest --testPathPattern=learner-profile.test --no-coverage`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/learner-profile.test.ts
git commit -m "test(api): add struggle resolution edge-case tests [Epic-16, Story-16.5]"
```

---

### Task 11: Explanation Effectiveness Tracking (Story 16.6)

**Files:**
- Modify: `apps/api/src/services/learner-profile.ts`
- Test: `apps/api/src/services/learner-profile.test.ts`

- [ ] **Step 1: Write test for learning style update from effectiveness data**

Add to `learner-profile.test.ts`:

```typescript
describe('updateLearningStyleFromEffectiveness', () => {
  it('sets preferredExplanations after 5+ effective data points', () => {
    const existing: LearningStyle = null;
    const effectiveness = {
      effective: ['stories', 'stories', 'stories', 'examples', 'stories'] as ExplanationStyle[],
      ineffective: ['diagrams', 'analogies'] as ExplanationStyle[],
    };
    const result = updateLearningStyleFromEffectiveness(
      existing,
      effectiveness,
      5 // corroborating sessions
    );
    expect(result).not.toBeNull();
    expect(result!.preferredExplanations).toContain('stories');
  });

  it('returns existing style when fewer than 3 corroborating sessions', () => {
    const effectiveness = {
      effective: ['stories', 'stories', 'stories', 'examples', 'stories'] as ExplanationStyle[],
      ineffective: ['diagrams'] as ExplanationStyle[],
    };
    // Plenty of data points, but only 2 sessions — not enough corroboration
    const result = updateLearningStyleFromEffectiveness(
      null,
      effectiveness,
      2
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest --testPathPattern=learner-profile.test --no-coverage`
Expected: FAIL — `updateLearningStyleFromEffectiveness` not defined

- [ ] **Step 3: Implement `updateLearningStyleFromEffectiveness`**

Add to `apps/api/src/services/learner-profile.ts`:

```typescript
import type { ExplanationStyle } from '@eduagent/schemas';

export function updateLearningStyleFromEffectiveness(
  existing: LearningStyle | null,
  effectiveness: { effective: ExplanationStyle[]; ineffective: ExplanationStyle[] },
  corroboratingSessions: number
): LearningStyle | null {
  // Gate on cross-session corroboration only — the data-points count within a single
  // session is unreliable (a verbose session can have 5+ explanation attempts).
  // The corroboratingSessions counter tracks how many sessions have contributed
  // effectiveness data, which is the correct cross-session signal.
  if (corroboratingSessions < LEARNING_STYLE_CORROBORATION_THRESHOLD) {
    return existing;
  }

  // Count frequency of each style in effective list
  const counts = new Map<ExplanationStyle, number>();
  for (const style of effectiveness.effective) {
    counts.set(style, (counts.get(style) ?? 0) + 1);
  }

  // Sort by frequency, take top styles
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const topStyles = sorted
    .filter(([_, count]) => count >= 2) // At least 2 occurrences
    .map(([style]) => style);

  if (topStyles.length === 0) return existing;

  return {
    preferredExplanations: topStyles,
    pacePreference: existing?.pacePreference ?? undefined,
    responseToChallenge: existing?.responseToChallenge ?? undefined,
  };
}
```

- [ ] **Step 4: Wire effectiveness tracking into `applyAnalysis()`**

In the `applyAnalysis` function, after the existing merge updates, add:

```typescript
  // FR248: Update learning style from explanation effectiveness
  if (analysis.explanationEffectiveness) {
    const currentStyle = (profile.learningStyle as LearningStyle) ?? null;
    // Use dedicated counter (not version, which increments on every mutation)
    const sessionCount = ((profile.effectivenessSessionCount as number) ?? 0) + 1;

    const updatedStyle = updateLearningStyleFromEffectiveness(
      currentStyle,
      analysis.explanationEffectiveness,
      sessionCount
    );

    if (updatedStyle && JSON.stringify(updatedStyle) !== JSON.stringify(currentStyle)) {
      updates.learningStyle = updatedStyle;
    }
    // Track effectiveness sessions separately from version
    updates.effectivenessSessionCount = sessionCount;
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest --testPathPattern=learner-profile.test --no-coverage`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/learner-profile.ts apps/api/src/services/learner-profile.test.ts
git commit -m "feat(api): add explanation effectiveness tracking with learning style updates [Epic-16, Story-16.6]"
```

---

### Task 12: "Try Different Styles" Prompt for New Users (Story 16.6 — FR248.4)

**Files:**
- Modify: `apps/api/src/services/learner-profile.ts` (buildMemoryBlock)

- [ ] **Step 1: Write test for exploration prompt on sparse profiles**

Add to `learner-profile.test.ts`:

```typescript
describe('buildMemoryBlock — exploration prompt', () => {
  it('includes style variation prompt when no learning style is set', () => {
    const profile = {
      learningStyle: null,
      interests: ['space'],
      strengths: [],
      struggles: [],
      communicationNotes: [],
      memoryEnabled: true,
    };
    const block = buildMemoryBlock(profile as any, null, null);
    expect(block).toContain('Try different explanation styles');
  });

  it('does not include exploration prompt when learning style is set', () => {
    const profile = {
      learningStyle: { preferredExplanations: ['stories'] },
      interests: ['space'],
      strengths: [],
      struggles: [],
      communicationNotes: [],
      memoryEnabled: true,
    };
    const block = buildMemoryBlock(profile as any, null, null);
    expect(block).not.toContain('Try different explanation styles');
  });
});
```

- [ ] **Step 2: Run tests to verify the first one fails**

Run: `cd apps/api && pnpm exec jest --testPathPattern=learner-profile.test --no-coverage`
Expected: First test FAILS (exploration prompt not yet in buildMemoryBlock)

- [ ] **Step 3: Add exploration prompt to `buildMemoryBlock()`**

In `buildMemoryBlock()`, **after the communication notes section** (Priority 4, lowest), add. This ensures the exploration prompt is the first to be truncated when the token budget is tight, since it's a hint — not content:

```typescript
  // FR248.4: Encourage style exploration for profiles without established preferences
  // Priority 5 (lowest) — truncated first when token budget is tight
  if (!style || !style.preferredExplanations?.length) {
    lines.push(
      '- Try different explanation styles — stories, examples, analogies — and observe which ones click'
    );
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest --testPathPattern=learner-profile.test --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/learner-profile.ts apps/api/src/services/learner-profile.test.ts
git commit -m "feat(api): add exploration prompt for new learners without style data [Epic-16, FR248.4]"
```

---

## Phase C — Transparency & Control (Stories 16.7–16.9)

### Task 13: Learner Profile API Routes (Stories 16.7, 16.8)

**Files:**
- Create: `apps/api/src/routes/learner-profile.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write the route handlers**

```typescript
// apps/api/src/routes/learner-profile.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and } from 'drizzle-orm';
import { familyLinks } from '@eduagent/database';
import type { HonoEnv } from '../middleware/auth';
import {
  getLearningProfile,
  deleteMemoryItem,
  toggleMemoryEnabled,
  deleteAllMemory,
} from '../services/learner-profile';
import {
  deleteMemoryItemSchema,
  toggleMemoryEnabledSchema,
} from '@eduagent/schemas';

export const learnerProfileRoutes = new Hono<HonoEnv>()
  // GET /learner-profile — get learning profile for current profile
  .get('/learner-profile', async (c) => {
    const { db, profileId } = c.var;
    const profile = await getLearningProfile(db, profileId);
    if (!profile) {
      return c.json({ data: null });
    }
    return c.json({ data: profile });
  })

  // GET /learner-profile/:profileId — parent reads child's profile
  .get('/learner-profile/:profileId', async (c) => {
    const { db, profileId: parentProfileId } = c.var;
    const childProfileId = c.req.param('profileId');

    // IDOR prevention: verify parent-child family link
    const link = await db.query.familyLinks.findFirst({
      where: and(
        eq(familyLinks.parentProfileId, parentProfileId),
        eq(familyLinks.childProfileId, childProfileId)
      ),
    });
    if (!link) {
      return c.json({ error: 'Not authorized' }, 403);
    }

    const profile = await getLearningProfile(db, childProfileId);
    return c.json({ data: profile ?? null });
  })

  // DELETE /learner-profile/item — remove a specific memory item
  .delete(
    '/learner-profile/item',
    zValidator('json', deleteMemoryItemSchema),
    async (c) => {
      const { db, profileId } = c.var;
      const { category, value, suppress, subject } = c.req.valid('json');
      await deleteMemoryItem(db, profileId, category, value, suppress ?? false, subject);
      return c.json({ success: true });
    }
  )

  // DELETE /learner-profile/:profileId/item — parent removes child's memory item
  .delete(
    '/learner-profile/:profileId/item',
    zValidator('json', deleteMemoryItemSchema),
    async (c) => {
      const { db, profileId: parentProfileId } = c.var;
      const childProfileId = c.req.param('profileId');

      // IDOR prevention
      const link = await db.query.familyLinks.findFirst({
        where: and(
          eq(familyLinks.parentProfileId, parentProfileId),
          eq(familyLinks.childProfileId, childProfileId)
        ),
      });
      if (!link) {
        return c.json({ error: 'Not authorized' }, 403);
      }

      const { category, value, suppress, subject } = c.req.valid('json');
      await deleteMemoryItem(db, childProfileId, category, value, suppress ?? false, subject);
      return c.json({ success: true });
    }
  )

  // PATCH /learner-profile/memory-enabled — toggle memoryEnabled (child self)
  .patch(
    '/learner-profile/memory-enabled',
    zValidator('json', toggleMemoryEnabledSchema),
    async (c) => {
      const { db, profileId } = c.var;
      const { memoryEnabled } = c.req.valid('json');
      await toggleMemoryEnabled(db, profileId, memoryEnabled);
      return c.json({ success: true });
    }
  )

  // PATCH /learner-profile/:profileId/memory-enabled — parent toggles child's memory
  .patch(
    '/learner-profile/:profileId/memory-enabled',
    zValidator('json', toggleMemoryEnabledSchema),
    async (c) => {
      const { db, profileId: parentProfileId } = c.var;
      const childProfileId = c.req.param('profileId');

      // IDOR prevention
      const link = await db.query.familyLinks.findFirst({
        where: and(
          eq(familyLinks.parentProfileId, parentProfileId),
          eq(familyLinks.childProfileId, childProfileId)
        ),
      });
      if (!link) {
        return c.json({ error: 'Not authorized' }, 403);
      }

      const { memoryEnabled } = c.req.valid('json');
      await toggleMemoryEnabled(db, childProfileId, memoryEnabled);
      return c.json({ success: true });
    }
  )

  // DELETE /learner-profile/all — child deletes own memory data (GDPR Art 17)
  .delete('/learner-profile/all', async (c) => {
    const { db, profileId } = c.var;
    await deleteAllMemory(db, profileId);
    return c.json({ success: true });
  })

  // DELETE /learner-profile/:profileId/all — parent deletes child's memory data (GDPR Art 17)
  .delete('/learner-profile/:profileId/all', async (c) => {
    const { db, profileId: parentProfileId } = c.var;
    const childProfileId = c.req.param('profileId');

    // IDOR prevention
    const link = await db.query.familyLinks.findFirst({
      where: and(
        eq(familyLinks.parentProfileId, parentProfileId),
        eq(familyLinks.childProfileId, childProfileId)
      ),
    });
    if (!link) {
      return c.json({ error: 'Not authorized' }, 403);
    }

    await deleteAllMemory(db, childProfileId);
    return c.json({ success: true });
  });
```

- [ ] **Step 2: Register routes in `apps/api/src/index.ts`**

Add import:

```typescript
import { learnerProfileRoutes } from './routes/learner-profile';
```

Add route registration (after the existing routes):

```typescript
  .route('/', learnerProfileRoutes)
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: No errors

- [ ] **Step 4: Write route tests**

Create `apps/api/src/routes/learner-profile.test.ts`:

```typescript
// apps/api/src/routes/learner-profile.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { testApp, createTestProfile, createFamilyLink } from '../../test-utils';

describe('learner-profile routes', () => {
  describe('GET /learner-profile', () => {
    it('returns null for profile without learning data', async () => {
      const { profileId, headers } = await createTestProfile();
      const res = await testApp.request('/learner-profile', { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeNull();
    });
  });

  describe('GET /learner-profile/:profileId (app)', () => {
    it('returns 403 if no family link exists', async () => {
      const parent = await createTestProfile('parent');
      const stranger = await createTestProfile('child');
      const res = await testApp.request(
        `/learner-profile/${stranger.profileId}`,
        { headers: parent.headers }
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Not authorized');
    });

    it('returns child profile when family link exists', async () => {
      const parent = await createTestProfile('parent');
      const child = await createTestProfile('child');
      await createFamilyLink(parent.profileId, child.profileId);
      const res = await testApp.request(
        `/learner-profile/${child.profileId}`,
        { headers: parent.headers }
      );
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /learner-profile/item', () => {
    it('removes a specific interest and returns success', async () => {
      const { profileId, headers } = await createTestProfile();
      // Seed: insert a learning profile with interests
      await seedLearningProfile(profileId, {
        interests: ['space', 'dinosaurs'],
      });

      const res = await testApp.request('/learner-profile/item', {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'interests',
          value: 'space',
          suppress: false,
        }),
      });
      expect(res.status).toBe(200);

      // Verify the item was actually removed
      const getRes = await testApp.request('/learner-profile', { headers });
      const body = await getRes.json();
      expect((body.data.interests as string[])).not.toContain('space');
      expect((body.data.interests as string[])).toContain('dinosaurs');
    });

    it('suppresses an interest so it cannot be re-inferred', async () => {
      const { profileId, headers } = await createTestProfile();
      await seedLearningProfile(profileId, {
        interests: ['space'],
      });

      const res = await testApp.request('/learner-profile/item', {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'interests',
          value: 'space',
          suppress: true,
        }),
      });
      expect(res.status).toBe(200);

      const getRes = await testApp.request('/learner-profile', { headers });
      const body = await getRes.json();
      expect((body.data.interests as string[])).not.toContain('space');
      expect((body.data.suppressedInferences as string[])).toContain('space');
    });
  });

  describe('DELETE /learner-profile/all', () => {
    it('deletes own memory data (GDPR Art 17)', async () => {
      const { headers } = await createTestProfile();
      const res = await testApp.request('/learner-profile/all', {
        method: 'DELETE',
        headers,
      });
      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /learner-profile/memory-enabled', () => {
    it('toggles memory enabled', async () => {
      const { headers } = await createTestProfile();
      const res = await testApp.request('/learner-profile/memory-enabled', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ memoryEnabled: false }),
      });
      expect(res.status).toBe(200);
    });
  });
});
```

> **Note:** Adapt `testApp`, `createTestProfile`, and `createFamilyLink` to match the project's existing test utilities. Check `apps/api/src/test-utils` for the actual helper signatures.

- [ ] **Step 5: Run route tests**

Run: `cd apps/api && pnpm exec jest --testPathPattern=routes/learner-profile --no-coverage`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/learner-profile.ts apps/api/src/routes/learner-profile.test.ts apps/api/src/index.ts
git commit -m "feat(api): add learner profile API routes with IDOR protection and tests [Epic-16, Stories-16.7/16.8]"
```

---

### Task 14: Mobile Hooks for Learner Profile (Stories 16.7, 16.8)

**Files:**
- Create: `apps/mobile/src/hooks/use-learner-profile.ts`

- [ ] **Step 1: Write the hooks**

```typescript
// apps/mobile/src/hooks/use-learner-profile.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';

export function useLearnerProfile() {
  const api = useApiClient();
  return useQuery({
    queryKey: ['learner-profile'],
    queryFn: async () => {
      const res = await api.get('/learner-profile');
      const json = await res.json();
      return json.data;
    },
  });
}

export function useChildLearnerProfile(childProfileId: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ['learner-profile', childProfileId],
    queryFn: async () => {
      const res = await api.get(`/learner-profile/${childProfileId}`);
      const json = await res.json();
      return json.data;
    },
    enabled: !!childProfileId,
  });
}

export function useDeleteMemoryItem() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      category: string;
      value: string;
      suppress?: boolean;
      subject?: string; // Required for struggles to disambiguate across subjects
      childProfileId?: string;
    }) => {
      const url = params.childProfileId
        ? `/learner-profile/${params.childProfileId}/item`
        : '/learner-profile/item';
      const res = await api.delete(url, {
        json: {
          category: params.category,
          value: params.value,
          suppress: params.suppress,
          ...(params.subject && { subject: params.subject }),
        },
      });
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: vars.childProfileId
          ? ['learner-profile', vars.childProfileId]
          : ['learner-profile'],
      });
    },
  });
}

export function useToggleMemoryEnabled() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      memoryEnabled: boolean;
      childProfileId?: string;
    }) => {
      const url = params.childProfileId
        ? `/learner-profile/${params.childProfileId}/memory-enabled`
        : '/learner-profile/memory-enabled';
      const res = await api.patch(url, {
        json: { memoryEnabled: params.memoryEnabled },
      });
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: vars.childProfileId
          ? ['learner-profile', vars.childProfileId]
          : ['learner-profile'],
      });
    },
  });
}

export function useDeleteAllMemory() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (childProfileId?: string) => {
      // Self-service (child) uses /learner-profile/all
      // Parent uses /learner-profile/:profileId/all
      const url = childProfileId
        ? `/learner-profile/${childProfileId}/all`
        : '/learner-profile/all';
      const res = await api.delete(url);
      return res.json();
    },
    onSuccess: (_, childProfileId) => {
      qc.invalidateQueries({
        queryKey: childProfileId
          ? ['learner-profile', childProfileId]
          : ['learner-profile'],
      });
    },
  });
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors (or resolve any import path issues)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/hooks/use-learner-profile.ts
git commit -m "feat(mobile): add React Query hooks for learner profile API [Epic-16, Stories-16.7/16.8]"
```

---

### Task 15: "What My Mentor Knows" Screen — Child (Story 16.7)

**Files:**
- Create: `apps/mobile/src/app/(app)/mentor-memory.tsx`
- Modify: `apps/mobile/src/app/(app)/more.tsx`

- [ ] **Step 1: Write the mentor memory screen**

```tsx
// apps/mobile/src/app/(app)/mentor-memory.tsx
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useProfile } from '../../lib/profile';
import {
  useLearnerProfile,
  useDeleteMemoryItem,
  useDeleteAllMemory,
} from '../../hooks/use-learner-profile';
import { computeAgeBracket } from '@eduagent/schemas';

function MemoryChip({
  label,
  onRemove,
  onMarkWrong,
  testID,
}: {
  label: string;
  onRemove: () => void;
  onMarkWrong: () => void;
  testID?: string;
}) {
  return (
    <View
      className="flex-row items-center bg-surface border border-border rounded-full px-3 py-1.5 mr-2 mb-2"
      testID={testID}
    >
      <Text className="text-body-sm text-text-primary mr-2">{label}</Text>
      <Pressable
        onPress={onRemove}
        accessibilityLabel={`Remove ${label}`}
        accessibilityRole="button"
        hitSlop={8}
      >
        <Text className="text-body-sm text-text-secondary mr-1">−</Text>
      </Pressable>
      <Pressable
        onPress={onMarkWrong}
        accessibilityLabel={`Mark ${label} as wrong — prevents re-learning`}
        accessibilityRole="button"
        hitSlop={8}
      >
        <Text className="text-body-sm text-error">✕</Text>
      </Pressable>
    </View>
  );
}

function MemorySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-6">
      <Text className="text-body font-semibold text-text-primary mb-3">
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function MentorMemoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeProfile } = useProfile();
  const { data: profile, isLoading, error } = useLearnerProfile();
  const deleteItem = useDeleteMemoryItem();
  const deleteAll = useDeleteAllMemory();

  const birthYear = activeProfile?.birthYear;
  const ageBracket = birthYear ? computeAgeBracket(birthYear) : 'adult';

  const handleDelete = useCallback(
    (category: string, value: string, suppress: boolean, subject?: string) => {
      Alert.alert(
        suppress ? 'This is wrong?' : 'Remove this?',
        suppress
          ? 'Your mentor won\'t use this again and won\'t re-learn it from old sessions.'
          : 'Your mentor won\'t use this anymore.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: suppress ? 'Yes, it\'s wrong' : 'Remove',
            style: 'destructive',
            onPress: () => {
              deleteItem.mutate(
                { category, value, suppress, subject },
                {
                  onError: () =>
                    Alert.alert(
                      'Couldn\'t remove',
                      'Please try again.'
                    ),
                }
              );
            },
          },
        ]
      );
    },
    [deleteItem]
  );

  const handleDeleteAll = useCallback(() => {
    Alert.alert(
      'Delete everything?',
      'Your mentor will forget everything they\'ve learned about you. You\'ll start fresh.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () =>
            deleteAll.mutate(undefined, {
              onError: () =>
                Alert.alert('Couldn\'t delete', 'Please try again.'),
            }),
        },
      ]
    );
  }, [deleteAll]);

  // Age-appropriate copy helper
  const copy = useCallback(
    (child: string, teen: string, adult: string) => {
      if (ageBracket === 'child') return child;
      if (ageBracket === 'adolescent') return teen;
      return adult;
    },
    [ageBracket]
  );

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-body text-text-secondary mb-4">
          Something went wrong
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="bg-primary rounded-card px-6 py-3"
          accessibilityRole="button"
        >
          <Text className="text-body text-text-inverse font-semibold">
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  const isEmpty =
    !profile ||
    (!(profile.interests as string[])?.length &&
      !(profile.strengths as any[])?.length &&
      !(profile.struggles as any[])?.length &&
      !(profile.communicationNotes as string[])?.length &&
      !profile.learningStyle);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 24,
      }}
    >
      {/* Header */}
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={12}
          className="mr-3"
        >
          <Text className="text-heading-3 text-text-primary">←</Text>
        </Pressable>
        <Text className="text-heading-2 font-bold text-text-primary">
          {copy(
            'What your mentor knows',
            'What your mentor knows',
            'What my mentor knows'
          )}
        </Text>
      </View>

      {isEmpty ? (
        <View className="items-center py-12" testID="empty-state">
          <Text className="text-body text-text-secondary text-center">
            {copy(
              'Your mentor is still getting to know you! After a few sessions, you\'ll see what they\'ve learned about how you like to learn.',
              'Your mentor is still getting to know you! After a few sessions, your learning preferences will show up here.',
              'Your mentor hasn\'t built a profile yet. After a few sessions, your learning preferences will appear here.'
            )}
          </Text>
        </View>
      ) : (
        <>
          {/* Learning Style */}
          {profile.learningStyle && (
            <MemorySection
              title={copy(
                'How you like to learn',
                'Learning style',
                'Learning preferences'
              )}
            >
              {(profile.learningStyle as any).preferredExplanations && (
                <Text className="text-body text-text-secondary mb-1">
                  {copy(
                    `Your mentor noticed you really like ${(profile.learningStyle as any).preferredExplanations.join(' and ')} explanations!`,
                    `Your mentor thinks you learn best with ${(profile.learningStyle as any).preferredExplanations.join(' and ')}-based explanations.`,
                    `Learning preferences: ${(profile.learningStyle as any).preferredExplanations.join(', ')}-based explanations`
                  )}
                </Text>
              )}
            </MemorySection>
          )}

          {/* Interests */}
          {(profile.interests as string[])?.length > 0 && (
            <MemorySection
              title={copy(
                'Things you like',
                'Your interests',
                'Interests'
              )}
            >
              <View className="flex-row flex-wrap">
                {(profile.interests as string[]).map((interest: string) => (
                  <MemoryChip
                    key={interest}
                    label={interest}
                    testID={`interest-chip-${interest}`}
                    onRemove={() =>
                      handleDelete('interests', interest, false)
                    }
                    onMarkWrong={() =>
                      handleDelete('interests', interest, true)
                    }
                  />
                ))}
              </View>
            </MemorySection>
          )}

          {/* Strengths */}
          {(profile.strengths as any[])?.length > 0 && (
            <MemorySection
              title={copy(
                "Things you're great at",
                "You're doing great at",
                'Strengths'
              )}
            >
              {(profile.strengths as any[]).map((s: any) => (
                <View
                  key={`${s.subject ?? 'general'}-${s.topics?.join(',')}`}
                  className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2"
                >
                  <View className="flex-1">
                    <Text className="text-body text-text-primary">
                      {s.topics?.join(', ')}
                    </Text>
                    <Text className="text-body-sm text-text-secondary">
                      {s.subject ?? 'General'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      handleDelete('strengths', s.subject ?? '', true)
                    }
                    accessibilityLabel={`Remove strength ${s.subject ?? 'General'}`}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Text className="text-body-sm text-text-secondary">✕</Text>
                  </Pressable>
                </View>
              ))}
            </MemorySection>
          )}

          {/* Struggles — positive framing */}
          {(profile.struggles as any[])?.length > 0 && (
            <MemorySection
              title={copy(
                "Things you're working hard on",
                "You've been working hard on",
                'Areas of focus'
              )}
            >
              {(profile.struggles as any[]).map((s: any) => (
                <View
                  key={`${s.subject ?? 'general'}-${s.topic}`}
                  className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2"
                >
                  <View className="flex-1">
                    <Text className="text-body text-text-primary">
                      {s.topic}
                    </Text>
                    {s.subject && (
                      <Text className="text-body-sm text-text-secondary">
                        {s.subject}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() =>
                      handleDelete('struggles', s.topic, true, s.subject)
                    }
                    accessibilityLabel={`Remove ${s.topic}`}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Text className="text-body-sm text-text-secondary">✕</Text>
                  </Pressable>
                </View>
              ))}
            </MemorySection>
          )}

          {/* Communication notes */}
          {(profile.communicationNotes as string[])?.length > 0 && (
            <MemorySection
              title={copy(
                'How you like to chat',
                'Communication style',
                'Communication notes'
              )}
            >
              {(profile.communicationNotes as string[]).map((note: string) => (
                <View
                  key={note}
                  className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2"
                >
                  <Text className="text-body text-text-secondary flex-1">
                    {note}
                  </Text>
                  <Pressable
                    onPress={() =>
                      handleDelete('communicationNotes', note, true)
                    }
                    accessibilityLabel={`Remove note: ${note}`}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Text className="text-body-sm text-text-secondary">✕</Text>
                  </Pressable>
                </View>
              ))}
            </MemorySection>
          )}
        </>
      )}

      {/* GDPR Art 17: Child self-service delete all */}
      {!isEmpty && (
        <View className="mt-6 border-t border-border pt-6">
          <Pressable
            onPress={handleDeleteAll}
            className="bg-surface rounded-card px-4 py-3.5 border border-error"
            accessibilityRole="button"
          >
            <Text className="text-body text-error">
              {copy(
                'Make my mentor forget everything',
                'Delete all memory data',
                'Delete all memory data'
              )}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Add navigation link in the learner more screen**

In `apps/mobile/src/app/(app)/more.tsx`, add a new `SettingsRow` in the appropriate section (e.g., after the Learning Mode section, before the Account section):

```tsx
        {/* Mentor Memory — Epic 16 */}
        <Text className="text-body-sm font-semibold text-text-secondary uppercase tracking-wide mt-6 mb-2">
          Your Mentor
        </Text>
        <SettingsRow
          label="What my mentor knows"
          onPress={() => router.push('/(app)/mentor-memory')}
        />
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/(app)/mentor-memory.tsx apps/mobile/src/app/(app)/more.tsx
git commit -m "feat(mobile): add 'What My Mentor Knows' screen for learners [Epic-16, Story-16.7]"
```

---

### Task 16: Parent Memory Visibility Screen (Story 16.8)

**Files:**
- Create: `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx`
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`

- [ ] **Step 1: Write the parent mentor memory screen**

```tsx
// apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import {
  useChildLearnerProfile,
  useDeleteMemoryItem,
  useToggleMemoryEnabled,
  useDeleteAllMemory,
} from '../../../../hooks/use-learner-profile';
import { useExportData } from '../../../../hooks/use-account';

export default function ParentMentorMemoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profileId: childProfileId } = useLocalSearchParams<{
    profileId: string;
  }>();
  const {
    data: profile,
    isLoading,
    error,
  } = useChildLearnerProfile(childProfileId!);
  const deleteItem = useDeleteMemoryItem();
  const toggleMemory = useToggleMemoryEnabled();
  const deleteAll = useDeleteAllMemory();
  const exportData = useExportData();

  const handleDeleteItem = useCallback(
    (category: string, value: string, subject?: string) => {
      deleteItem.mutate(
        { category, value, suppress: true, childProfileId, subject },
        {
          onError: () =>
            Alert.alert('Couldn\'t remove', 'Please try again.'),
        }
      );
    },
    [deleteItem, childProfileId]
  );

  const handleToggleMemory = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        Alert.alert(
          'Disable memory?',
          'The mentor will stop learning about your child\'s preferences. Sessions will still work, but the mentor won\'t remember what works best.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Disable',
              style: 'destructive',
              onPress: () =>
                toggleMemory.mutate(
                  { memoryEnabled: false, childProfileId },
                  {
                    onError: () =>
                      Alert.alert('Couldn\'t update', 'Please try again.'),
                  }
                ),
            },
          ]
        );
      } else {
        toggleMemory.mutate(
          { memoryEnabled: true, childProfileId },
          {
            onError: () =>
              Alert.alert('Couldn\'t update', 'Please try again.'),
          }
        );
      }
    },
    [toggleMemory, childProfileId]
  );

  const handleDeleteAll = useCallback(() => {
    Alert.alert(
      'Delete all memory data?',
      'This permanently removes everything the mentor has learned about your child. A new profile will be built from future sessions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () =>
            deleteAll.mutate(childProfileId!, {
              onError: () =>
                Alert.alert('Couldn\'t delete', 'Please try again.'),
            }),
        },
      ]
    );
  }, [deleteAll, childProfileId]);

  const handleExport = useCallback(async () => {
    try {
      await exportData.mutateAsync();
      Alert.alert('Export complete', 'Your data export is ready.');
    } catch {
      Alert.alert('Export failed', 'Please try again later.');
    }
  }, [exportData]);

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-body text-text-secondary mb-4">
          Something went wrong
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="bg-primary rounded-card px-6 py-3"
          accessibilityRole="button"
        >
          <Text className="text-body text-text-inverse font-semibold">
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  const memoryEnabled = profile?.memoryEnabled ?? true;
  const isEmpty =
    !profile ||
    (!(profile.interests as string[])?.length &&
      !(profile.strengths as any[])?.length &&
      !(profile.struggles as any[])?.length &&
      !(profile.communicationNotes as string[])?.length &&
      !profile.learningStyle);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 24,
      }}
    >
      {/* Header */}
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={12}
          className="mr-3"
        >
          <Text className="text-heading-3 text-text-primary">←</Text>
        </Pressable>
        <Text className="text-heading-2 font-bold text-text-primary">
          What the mentor knows
        </Text>
      </View>

      {/* Memory toggle */}
      <View className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-6">
        <View className="flex-1 mr-3">
          <Text className="text-body text-text-primary font-semibold">
            Memory enabled
          </Text>
          <Text className="text-body-sm text-text-secondary">
            The mentor learns your child's preferences over time
          </Text>
        </View>
        <Switch
          value={memoryEnabled}
          onValueChange={handleToggleMemory}
          accessibilityLabel="Toggle mentor memory"
        />
      </View>

      {isEmpty ? (
        <View className="items-center py-12" testID="empty-state">
          <Text className="text-body text-text-secondary text-center">
            The mentor is still getting to know your child. After a few sessions,
            learning preferences will show up here.
          </Text>
        </View>
      ) : (
        <>
          {/* Interests */}
          {(profile.interests as string[])?.length > 0 && (
            <View className="mb-6">
              <Text className="text-body font-semibold text-text-primary mb-3">
                Interests
              </Text>
              <View className="flex-row flex-wrap">
                {(profile.interests as string[]).map((interest: string) => (
                  <View
                    key={interest}
                    className="flex-row items-center bg-surface border border-border rounded-full px-3 py-1.5 mr-2 mb-2"
                  >
                    <Text className="text-body-sm text-text-primary mr-2">
                      {interest}
                    </Text>
                    <Pressable
                      onPress={() => handleDeleteItem('interests', interest)}
                      accessibilityLabel={`Remove interest: ${interest}`}
                      accessibilityRole="button"
                      hitSlop={8}
                    >
                      <Text className="text-body-sm text-text-secondary">
                        ✕
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Struggles with metadata */}
          {(profile.struggles as any[])?.length > 0 && (
            <View className="mb-6">
              <Text className="text-body font-semibold text-text-primary mb-3">
                Working hard on
              </Text>
              {(profile.struggles as any[]).map((s: any) => (
                <View
                  key={`${s.subject ?? 'general'}-${s.topic}`}
                  className="bg-surface rounded-card px-4 py-3 mb-2"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-body text-text-primary">
                        {s.topic}
                      </Text>
                      <Text className="text-body-sm text-text-secondary">
                        {s.subject ? `${s.subject} · ` : ''}{s.attempts} session{s.attempts > 1 ? 's' : ''} · confidence: {s.confidence}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDeleteItem('struggles', s.topic, s.subject)}
                      accessibilityLabel={`Remove struggle: ${s.topic}`}
                      accessibilityRole="button"
                      hitSlop={8}
                    >
                      <Text className="text-body-sm text-text-secondary">
                        ✕
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Strengths */}
          {(profile.strengths as any[])?.length > 0 && (
            <View className="mb-6">
              <Text className="text-body font-semibold text-text-primary mb-3">
                Doing great at
              </Text>
              {(profile.strengths as any[]).map((s: any) => (
                <View
                  key={`${s.subject ?? 'general'}-${s.topics?.join(',')}`}
                  className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2"
                >
                  <View className="flex-1">
                    <Text className="text-body text-text-primary">
                      {s.topics?.join(', ')}
                    </Text>
                    <Text className="text-body-sm text-text-secondary">
                      {s.subject ?? 'General'} · confidence: {s.confidence}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleDeleteItem('strengths', s.subject ?? '')}
                    accessibilityLabel={`Remove strength: ${s.subject ?? 'General'}`}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Text className="text-body-sm text-text-secondary">
                      ✕
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Communication notes */}
          {(profile.communicationNotes as string[])?.length > 0 && (
            <View className="mb-6">
              <Text className="text-body font-semibold text-text-primary mb-3">
                Communication preferences
              </Text>
              {(profile.communicationNotes as string[]).map((note: string) => (
                <View
                  key={note}
                  className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2"
                >
                  <Text className="text-body text-text-secondary flex-1">
                    {note}
                  </Text>
                  <Pressable
                    onPress={() =>
                      handleDeleteItem('communicationNotes', note)
                    }
                    accessibilityLabel={`Remove note: ${note}`}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Text className="text-body-sm text-text-secondary">
                      ✕
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {/* GDPR actions */}
      {!isEmpty && (
        <View className="mt-6 border-t border-border pt-6">
          <Pressable
            onPress={handleExport}
            className="bg-surface rounded-card px-4 py-3.5 mb-2"
            accessibilityRole="button"
          >
            <Text className="text-body text-text-primary">Export data</Text>
          </Pressable>
          <Pressable
            onPress={handleDeleteAll}
            className="bg-surface rounded-card px-4 py-3.5 mb-2 border border-error"
            accessibilityRole="button"
          >
            <Text className="text-body text-error">
              Delete all memory data
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Add navigation link in child profile screen**

In `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`, add a new section or pressable row:

```tsx
        {/* Mentor Memory — Epic 16 */}
        <Pressable
          onPress={() =>
            router.push(
              `/(app)/child/${profileId}/mentor-memory`
            )
          }
          className="bg-surface rounded-card px-4 py-3.5 mb-2"
          accessibilityLabel="What the mentor knows"
          accessibilityRole="button"
        >
          <Text className="text-body text-text-primary">
            What the mentor knows
          </Text>
        </Pressable>
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx apps/mobile/src/app/(app)/child/[profileId]/index.tsx
git commit -m "feat(mobile): add parent memory visibility screen with GDPR controls [Epic-16, Story-16.8]"
```

---

### Task 17: Memory Warm-Start for New Subjects (Story 16.9)

**Files:**
- Modify: `apps/api/src/services/learner-profile.ts`
- Test: `apps/api/src/services/learner-profile.test.ts`

- [ ] **Step 1: Write test for cross-subject signal filtering**

Add to `learner-profile.test.ts`:

```typescript
describe('buildMemoryBlock — cross-subject warm-start', () => {
  it('includes cross-subject signals (style, interests, communication)', () => {
    const profile = {
      learningStyle: { preferredExplanations: ['stories'] },
      interests: ['dinosaurs', 'space'],
      strengths: [{ subject: 'Math', topics: ['multiplication'], confidence: 'high' as const }],
      struggles: [
        {
          subject: 'Math',
          topic: 'fractions',
          attempts: 5,
          confidence: 'high' as const,
          lastSeen: '2026-04-01T00:00:00Z',
        },
      ],
      communicationNotes: ['prefers humor'],
      memoryEnabled: true,
    };
    // Warm-start in History — Math-specific data should NOT appear
    const block = buildMemoryBlock(profile as any, 'History', null);
    expect(block).toContain('dinosaurs');
    expect(block).toContain('stories');
    expect(block).toContain('humor');
    expect(block).not.toContain('fractions'); // Math-specific struggle
  });

  it('includes struggles when subject matches', () => {
    const profile = {
      learningStyle: null,
      interests: [],
      strengths: [],
      struggles: [
        {
          subject: 'Math',
          topic: 'fractions',
          attempts: 5,
          confidence: 'high' as const,
          lastSeen: '2026-04-01T00:00:00Z',
        },
      ],
      communicationNotes: [],
      memoryEnabled: true,
    };
    const block = buildMemoryBlock(profile as any, 'Math', null);
    expect(block).toContain('fractions');
  });

  // FR244.9: Freeform session handling
  it('includes null-subject struggles when no currentSubject filter', () => {
    const profile = {
      learningStyle: null,
      interests: [],
      strengths: [],
      struggles: [
        {
          subject: null,
          topic: 'time management',
          attempts: 3,
          confidence: 'medium' as const,
          lastSeen: '2026-04-01T00:00:00Z',
        },
      ],
      communicationNotes: [],
      memoryEnabled: true,
    };
    // No currentSubject filter — null-subject struggles should appear
    const block = buildMemoryBlock(profile as any, null, null);
    expect(block).toContain('time management');
  });

  it('includes null-subject struggles even when currentSubject is specified', () => {
    const profile = {
      learningStyle: null,
      interests: [],
      strengths: [],
      struggles: [
        {
          subject: null,
          topic: 'time management',
          attempts: 3,
          confidence: 'medium' as const,
          lastSeen: '2026-04-01T00:00:00Z',
        },
      ],
      communicationNotes: [],
      memoryEnabled: true,
    };
    // null-subject struggles are always relevant — they were observed in freeform
    // and may apply across subjects
    const block = buildMemoryBlock(profile as any, 'Math', null);
    expect(block).toContain('time management');
  });
});
```

- [ ] **Step 2: Add Amendment 2 retention context test**

Add to the same describe block:

```typescript
  // Amendment 2: Epic 15 mastery cross-reference
  it('excludes struggles with strong retention when retentionContext is provided', () => {
    const profile = {
      learningStyle: null,
      interests: [],
      strengths: [],
      struggles: [
        {
          subject: 'Math',
          topic: 'fractions',
          attempts: 5,
          confidence: 'high' as const,
          lastSeen: '2026-04-01T00:00:00Z',
        },
        {
          subject: 'Math',
          topic: 'decimals',
          attempts: 3,
          confidence: 'medium' as const,
          lastSeen: '2026-04-01T00:00:00Z',
        },
      ],
      communicationNotes: [],
      memoryEnabled: true,
    };
    // fractions has strong retention (Amendment 2) — should be excluded
    const block = buildMemoryBlock(
      profile as any,
      'Math',
      null,
      { strongTopics: ['fractions'] }
    );
    expect(block).not.toContain('fractions');
    expect(block).toContain('decimals');
  });
```

- [ ] **Step 3: Apply Amendment 2 — add `retentionContext` parameter to `buildMemoryBlock()`**

In `apps/api/src/services/learner-profile.ts`, update `buildMemoryBlock` signature to accept a 4th optional parameter:

```typescript
export function buildMemoryBlock(
  profile: MemoryBlockProfile | null,
  currentSubject: string | null,
  currentTopic: string | null,
  retentionContext?: { strongTopics: string[] }  // Amendment 2: Epic 15 mastery cross-ref
): string {
```

Add to the struggle filter (before the existing `relevantStruggles` computation):

```typescript
  // Amendment 2: Exclude struggles where spaced repetition shows strong retention
  const strongSet = new Set(
    (retentionContext?.strongTopics ?? []).map((t) => t.toLowerCase())
  );
```

Update the filter to include `!strongSet.has(s.topic.toLowerCase())`.

Also update `apps/api/src/services/session.ts` `prepareExchangeContext()` to pass retention data:

```typescript
const strongTopics = retentionRows
  .filter((r) => r.intervalDays >= 21)
  .map((r) => r.topicTitle)
  .filter(Boolean);

const learnerMemoryContext = learningProfileRow
  ? buildMemoryBlock(
      { /* ... existing fields ... */ },
      subject?.name ?? null,
      topic?.title ?? null,
      { strongTopics }  // Amendment 2
    )
  : '';
```

See `docs/superpowers/plans/2026-04-08-epic-16-amendments.md` Amendment 2 for full code.

- [ ] **Step 4: Run tests to verify they pass**

The retention context test from Step 2 should now PASS. Cross-subject and null-subject tests should also still PASS.

Run: `cd apps/api && pnpm exec jest --testPathPattern=learner-profile.test --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: If any test fails, fix the `buildMemoryBlock` function**

Ensure the struggle filter uses case-insensitive comparison, includes null-subject struggles regardless of currentSubject, and excludes struggles with strong retention.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/learner-profile.test.ts
git commit -m "test(api): add cross-subject warm-start tests [Epic-16, Story-16.9]"
```

---

### Task 18: Final Validation

- [ ] **Step 1: Run full API typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: No errors

- [ ] **Step 2: Run full API test suite**

Run: `pnpm exec nx run api:test`
Expected: All tests PASS

- [ ] **Step 3: Run mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run API lint**

Run: `pnpm exec nx run api:lint`
Expected: No errors

- [ ] **Step 5: Run mobile lint**

Run: `pnpm exec nx lint mobile`
Expected: No errors

- [ ] **Step 6: Run integration tests**

Run: `cd apps/api && pnpm exec jest --testPathPattern=integration --no-coverage`
Expected: All existing integration tests PASS (the new Inngest step is isolated and should not affect existing step outcomes)

---

## Phase D — Collaborative Memory (UX Improvements)

> Phase D implements the 10 UX improvements identified in the 2026-04-09 end-user review. These tasks depend on Phase C screens existing. See spec AD6 (Collaborative Memory) for design rationale.

### Task 19: Schema Updates for Collaborative Memory (FR250.7, FR250.8, FR249.7, FR252)

**Files:**
- Modify: `packages/database/src/schema/learning-profiles.ts`
- Modify: `packages/schemas/src/learning-profiles.ts`

- [ ] **Step 1: Add new columns to learning_profiles table**

In `packages/database/src/schema/learning-profiles.ts`, add these columns:

```typescript
    // FR250.7: Consent tracking
    memoryConsentStatus: text('memory_consent_status', {
      enum: ['pending', 'granted', 'declined'],
    }).notNull().default('pending'),
    consentPromptDismissedAt: timestamp('consent_prompt_dismissed_at', { withTimezone: true }),
    // FR250.8: Granular controls (replace single memoryEnabled)
    memoryCollectionEnabled: boolean('memory_collection_enabled').notNull().default(false),
    memoryInjectionEnabled: boolean('memory_injection_enabled').notNull().default(true),
```

Note: `memoryCollectionEnabled` defaults to `false` — it is only set to `true` when consent is granted (FR250.7). The existing `memoryEnabled` column is retained for backwards compatibility during migration but all new code reads the granular fields.

- [ ] **Step 2: Add `source` tracking to Zod schemas**

In `packages/schemas/src/learning-profiles.ts`, add source enum and update entry schemas:

```typescript
export const memorySourceSchema = z.enum(['inferred', 'learner', 'parent']);
export type MemorySource = z.infer<typeof memorySourceSchema>;

export const memoryConsentStatusSchema = z.enum(['pending', 'granted', 'declined']);
export type MemoryConsentStatus = z.infer<typeof memoryConsentStatusSchema>;
```

Update `strengthEntrySchema`, `struggleEntrySchema` to include optional `source`:

```typescript
export const strengthEntrySchema = z.object({
  subject: z.string(),
  topics: z.array(z.string()),
  confidence: confidenceLevelSchema,
  source: memorySourceSchema.optional(), // FR252.4
});

export const struggleEntrySchema = z.object({
  subject: z.string().nullable(),
  topic: z.string(),
  lastSeen: z.string(),
  attempts: z.number().int().min(1),
  confidence: confidenceLevelSchema,
  source: memorySourceSchema.optional(), // FR252.4
});
```

Add schemas for consent toggle and "Tell your mentor" input:

```typescript
export const toggleMemoryCollectionSchema = z.object({
  memoryCollectionEnabled: z.boolean(),
});

export const toggleMemoryInjectionSchema = z.object({
  memoryInjectionEnabled: z.boolean(),
});

export const grantMemoryConsentSchema = z.object({
  consent: z.enum(['granted', 'declined']),
});

export const tellMentorInputSchema = z.object({
  text: z.string().min(1).max(500),
  childProfileId: z.string().uuid().optional(), // parent adding for child
});

export const unsuppressInferenceSchema = z.object({
  value: z.string(),
});
```

- [ ] **Step 3: Export new schemas from barrel**

- [ ] **Step 4: Generate migration**

Run: `cd apps/api && pnpm exec drizzle-kit generate`

- [ ] **Step 5: Run typecheck**

Run: `cd packages/schemas && pnpm exec tsc --noEmit && cd ../../packages/database && pnpm exec tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/schema/learning-profiles.ts packages/schemas/src/learning-profiles.ts packages/schemas/src/index.ts apps/api/drizzle/
git commit -m "feat(schemas): add consent, granular toggles, source tracking, tell-mentor schemas [Epic-16, Phase-D]"
```

---

### Task 19a: Data Migration for Existing Profiles (Phase D prerequisite)

**Context:** Phase A-C creates `learning_profiles` rows with `memoryEnabled: boolean`. Phase D adds `memoryConsentStatus`, `memoryCollectionEnabled`, `memoryInjectionEnabled`. Existing profiles created during Phase A-C need to transition correctly — without this, the updated Inngest short-circuit (Task 21: `memoryConsentStatus !== 'granted'`) would break all existing active profiles.

**Files:**
- Create: Migration SQL file via `drizzle-kit generate` (from Task 19 schema changes)

- [ ] **Step 1: Verify the migration from Task 19 includes the new columns with correct defaults**

The migration should set:
- `memoryConsentStatus` default `'pending'`
- `memoryCollectionEnabled` default `false`
- `memoryInjectionEnabled` default `true`

- [ ] **Step 2: Write a data migration SQL to transition existing profiles**

Create a follow-up migration (after the schema migration) that upgrades existing rows:

```sql
-- Transition existing profiles: if memoryEnabled=true, grant consent and enable collection.
-- This preserves Phase A-C behavior for profiles that were already collecting data.
UPDATE learning_profiles
SET
  memory_consent_status = 'granted',
  memory_collection_enabled = true,
  memory_injection_enabled = true
WHERE memory_enabled = true;

-- Profiles with memoryEnabled=false keep consent=pending, collection=false, injection=true (defaults).
-- They remain fully stateless, matching Phase A-C behavior.
```

- [ ] **Step 3: Verify migration is idempotent**

Running it twice should have no additional effect (all WHERE clauses are safe).

- [ ] **Step 4: Commit**

```bash
git add apps/api/drizzle/
git commit -m "feat(database): add data migration for Phase D granular memory fields [Epic-16, Phase-D]"
```

**Rollback:** This migration only sets boolean/enum fields. Rollback: set `memory_consent_status = 'pending'`, `memory_collection_enabled = false` on all rows. No data is destroyed.

---

### Task 20: "Tell Your Mentor" Service + API (Story 16.10, FR252)

**Files:**
- Create: `apps/api/src/services/learner-input.ts`
- Create: `apps/api/src/services/learner-input.test.ts`
- Modify: `apps/api/src/routes/learner-profile.ts`

- [ ] **Step 1: Write tests for learner input parsing**

> **A11:** These test stubs MUST be filled with actual mock setup and assertions during implementation. Empty test bodies pass vacuously and provide zero coverage. At minimum each test must: set up an LLM mock response, call `parseLearnerInput`, and assert on the returned `fieldsUpdated` array and the resulting profile state.

```typescript
// apps/api/src/services/learner-input.test.ts
import { describe, it, expect, jest } from '@jest/globals';
import { parseLearnerInput } from './learner-input';

// Mock the LLM router
jest.mock('./llm', () => ({
  routeAndCall: jest.fn(),
}));

import { routeAndCall } from './llm';
const mockRouteAndCall = routeAndCall as jest.MockedFunction<typeof routeAndCall>;

describe('parseLearnerInput', () => {
  it('extracts interest from "I love dinosaurs"', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        interests: ['dinosaurs'],
        communicationNotes: null,
        learningStyleHints: null,
        confidence: 'high',
      }),
    } as any);
    const result = await parseLearnerInput(db, profileId, 'I love dinosaurs', 'learner');
    expect(result.success).toBe(true);
    expect(result.fieldsUpdated).toContain('interests');
  });

  it('extracts communication note from "I hate slow explanations"', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        interests: null,
        communicationNotes: ['prefers fast-paced explanations'],
        learningStyleHints: null,
        confidence: 'high',
      }),
    } as any);
    const result = await parseLearnerInput(db, profileId, 'I hate slow explanations', 'learner');
    expect(result.success).toBe(true);
    expect(result.fieldsUpdated).toContain('communicationNotes');
  });

  it('returns failure message when LLM returns no signals', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        interests: null,
        communicationNotes: null,
        learningStyleHints: null,
        confidence: 'high',
      }),
    } as any);
    const result = await parseLearnerInput(db, profileId, 'hello', 'learner');
    expect(result.success).toBe(false);
    expect(result.fieldsUpdated).toHaveLength(0);
  });

  it('respects cap limits and returns error message', async () => {
    // Seed profile with 20 interests, then try to add one more
    mockRouteAndCall.mockResolvedValueOnce({
      response: JSON.stringify({
        interests: ['new-interest'],
        communicationNotes: null,
        learningStyleHints: null,
        confidence: 'high',
      }),
    } as any);
    const result = await parseLearnerInput(db, profileIdWithFullInterests, 'I love new things', 'learner');
    expect(result.success).toBe(false);
    expect(result.message).toContain('20');
  });
});
```

- [ ] **Step 2: Implement learner input service**

```typescript
// apps/api/src/services/learner-input.ts
import { routeAndCall } from './llm';
import type { ChatMessage } from './llm';
import type { MemorySource } from '@eduagent/schemas';
import { applyAnalysis, getLearningProfile } from './learner-profile';
import type { Database } from '@eduagent/database';

const TELL_MENTOR_PROMPT = `The learner (or their parent) has directly told you something about themselves.
Extract structured signals from their statement. Treat everything they say as HIGH CONFIDENCE — they are telling you directly, not you inferring.

Output JSON:
{
  "interests": ["string"] | null,
  "communicationNotes": ["string"] | null,
  "learningStyleHints": {
    "preferredExplanations": ["stories"|"examples"|"diagrams"|"analogies"|"step-by-step"|"humor"] | null,
    "pacePreference": "quick" | "thorough" | null
  } | null,
  "confidence": "high"
}

Rules:
- Always set confidence to "high" — this is direct input, not inference.
- Extract interests from statements like "I love X", "I like X", "I'm into X".
- Extract communication preferences from "I prefer short answers", "I like humor", "Don't be too slow".
- Extract learning style from "I like stories", "Show me examples", "Step by step please".
- If the statement is unclear or unrelated to learning, return all null fields.
- Do NOT extract struggles or strengths — those come from observed sessions only.

Statement from: {source}
Statement: {text}`;

export async function parseLearnerInput(
  db: Database,
  profileId: string,
  text: string,
  source: MemorySource
): Promise<{ success: boolean; message: string; fieldsUpdated: string[] }> {
  const profile = await getLearningProfile(db, profileId);

  const prompt = TELL_MENTOR_PROMPT
    .replace('{source}', source === 'parent' ? 'Parent (about their child)' : 'Learner (about themselves)')
    .replace('{text}', text);

  const messages: ChatMessage[] = [
    { role: 'system', content: prompt },
    { role: 'user', content: text },
  ];

  const result = await routeAndCall(messages, 1, {});
  if (!result?.response) {
    return { success: false, message: "Couldn't understand that — try something like 'I love dinosaurs'", fieldsUpdated: [] };
  }

  try {
    const jsonMatch = result.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, message: "Couldn't understand that — try something simpler", fieldsUpdated: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const fieldsUpdated: string[] = [];

    // Check caps before applying
    if (parsed.interests?.length) {
      const currentInterests = (profile?.interests as string[]) ?? [];
      if (currentInterests.length >= 20) {
        return {
          success: false,
          message: 'Your mentor already knows 20 interests — remove one to add a new one.',
          fieldsUpdated: [],
        };
      }
      fieldsUpdated.push('interests');
    }

    if (parsed.communicationNotes?.length) fieldsUpdated.push('communicationNotes');
    if (parsed.learningStyleHints) fieldsUpdated.push('learningStyle');

    if (fieldsUpdated.length === 0) {
      return { success: false, message: "Couldn't extract anything useful — try something like 'I love space' or 'I prefer short answers'", fieldsUpdated: [] };
    }

    // Convert to SessionAnalysisOutput format for reuse of applyAnalysis
    await applyAnalysis(db, profileId, {
      interests: parsed.interests,
      communicationNotes: parsed.communicationNotes,
      explanationEffectiveness: parsed.learningStyleHints?.preferredExplanations
        ? { effective: parsed.learningStyleHints.preferredExplanations, ineffective: [] }
        : null,
      strengths: null,
      struggles: null,
      resolvedTopics: null,
      engagementLevel: null,
      confidence: 'high', // FR252.3: direct input = high confidence
    }, null);

    return { success: true, message: 'Got it!', fieldsUpdated };
  } catch {
    return { success: false, message: "Something went wrong — please try again", fieldsUpdated: [] };
  }
}
```

- [ ] **Step 3: Add API routes**

In `apps/api/src/routes/learner-profile.ts`, add:

```typescript
  // POST /learner-profile/tell — "Tell your mentor" (child self)
  .post(
    '/learner-profile/tell',
    zValidator('json', tellMentorInputSchema),
    async (c) => {
      const { db, profileId } = c.var;
      const { text } = c.req.valid('json');
      const result = await parseLearnerInput(db, profileId, text, 'learner');
      return c.json(result);
    }
  )

  // POST /learner-profile/:profileId/tell — parent tells mentor about child
  .post(
    '/learner-profile/:profileId/tell',
    zValidator('json', tellMentorInputSchema),
    async (c) => {
      const { db, profileId: parentProfileId } = c.var;
      const childProfileId = c.req.param('profileId');

      // IDOR prevention
      const link = await db.query.familyLinks.findFirst({
        where: and(
          eq(familyLinks.parentProfileId, parentProfileId),
          eq(familyLinks.childProfileId, childProfileId)
        ),
      });
      if (!link) return c.json({ error: 'Not authorized' }, 403);

      // A3 fix: destructure text from validated body
      const { text } = c.req.valid('json');
      const result = await parseLearnerInput(db, childProfileId, text, 'parent');
      return c.json(result);
    }
  )
```

- [ ] **Step 4: Run tests and typecheck**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/learner-input.ts apps/api/src/services/learner-input.test.ts apps/api/src/routes/learner-profile.ts
git commit -m "feat(api): add 'Tell your mentor' input parsing and API routes [Epic-16, Story-16.10, FR252]"
```

---

### Task 21: Consent-First Activation (FR250.7)

**Files:**
- Modify: `apps/api/src/routes/learner-profile.ts`
- Modify: `apps/api/src/inngest/functions/session-completed.ts`
- Create: `apps/mobile/src/components/memory-consent-prompt.tsx`
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`
- Modify: `apps/mobile/src/hooks/use-learner-profile.ts`

> **A9 — Deployment ordering:** The Inngest short-circuit in Step 2 changes the collection gate from `memoryEnabled` to `memoryConsentStatus`. Between API deploy and mobile app update (which delivers the consent prompt UI), new users cannot grant consent. To prevent a silent collection outage:
> - The Inngest step MUST fall back to the old `memoryEnabled` check if `memoryConsentStatus` is undefined or the column doesn't exist yet (backwards-compatible guard).
> - Alternatively, deploy the data migration (Task 19a) first, then API + mobile together.
> - Document this in the deploy checklist.

- [ ] **Step 1: Add consent API route**

```typescript
  // POST /learner-profile/:profileId/consent — parent grants/declines consent
  .post(
    '/learner-profile/:profileId/consent',
    zValidator('json', grantMemoryConsentSchema),
    async (c) => {
      const { db, profileId: parentProfileId } = c.var;
      const childProfileId = c.req.param('profileId');

      // IDOR prevention
      const link = await db.query.familyLinks.findFirst({
        where: and(
          eq(familyLinks.parentProfileId, parentProfileId),
          eq(familyLinks.childProfileId, childProfileId)
        ),
      });
      if (!link) return c.json({ error: 'Not authorized' }, 403);

      const profile = await getOrCreateLearningProfile(db, childProfileId);
      const isGranted = c.req.valid('json').consent === 'granted';

      await db.update(learningProfiles).set({
        memoryConsentStatus: isGranted ? 'granted' : 'declined',
        memoryCollectionEnabled: isGranted,
        memoryInjectionEnabled: isGranted,
        consentPromptDismissedAt: new Date(),
        version: sql`${learningProfiles.version} + 1`,
        updatedAt: new Date(),
      }).where(eq(learningProfiles.profileId, childProfileId));

      return c.json({ success: true });
    }
  )
```

- [ ] **Step 2: Update session-completed Inngest step to check consent**

In the `analyze-learner-profile` step, update the short-circuit check:

```typescript
  // FR250.7: Short-circuit if consent not granted
  // FR250.8: Check granular collection flag instead of single memoryEnabled
  // A9: Backwards-compatible — fall back to memoryEnabled if granular fields not yet present
  const consentStatus = existingProfile?.memoryConsentStatus;
  const collectionEnabled = existingProfile?.memoryCollectionEnabled;
  if (consentStatus !== undefined) {
    // Phase D path: use granular fields
    if (consentStatus !== 'granted' || collectionEnabled === false) return;
  } else {
    // Phase A-C fallback: use legacy memoryEnabled
    if (existingProfile?.memoryEnabled === false) return;
  }
```

- [ ] **Step 3: Build consent prompt component**

Create `apps/mobile/src/components/memory-consent-prompt.tsx` — a card component that shows the one-time consent prompt with "Yes, enable" / "Not now" / "Learn more" buttons.

- [ ] **Step 4: Add consent prompt to child dashboard**

In the parent's child profile screen, show the consent prompt when `memoryConsentStatus === 'pending'`.

- [ ] **Step 5: Add hook for consent mutation**

In `use-learner-profile.ts`:

```typescript
export function useGrantMemoryConsent() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { childProfileId: string; consent: 'granted' | 'declined' }) => {
      const res = await api.post(`/learner-profile/${params.childProfileId}/consent`, {
        json: { consent: params.consent },
      });
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['learner-profile', vars.childProfileId] });
    },
  });
}
```

- [ ] **Step 6: Run typecheck and tests**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: add consent-first memory activation with parent prompt [Epic-16, FR250.7]"
```

---

### Task 22: Granular Memory Toggles (FR250.8)

**Files:**
- Modify: `apps/api/src/routes/learner-profile.ts`
- Modify: `apps/api/src/services/learner-profile.ts` (buildMemoryBlock)
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx`
- Modify: `apps/mobile/src/hooks/use-learner-profile.ts`

- [ ] **Step 1: Add separate toggle routes**

Replace single `PATCH /memory-enabled` with:

```typescript
  // PATCH /learner-profile/:profileId/collection — toggle collection
  // PATCH /learner-profile/:profileId/injection — toggle injection
```

- [ ] **Step 2: Update `buildMemoryBlock()` to check injection flag**

```typescript
  if (!profile || !profile.memoryInjectionEnabled) return '';
```

- [ ] **Step 3: Update parent memory screen with two toggles**

Replace single Switch with two labeled toggles:
- "Learn about {child}" → `memoryCollectionEnabled`
- "Use what the mentor knows" → `memoryInjectionEnabled`

- [ ] **Step 4: Update hooks for new toggle mutations**

- [ ] **Step 5: Run typecheck and tests**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add granular memory toggles — separate collection and injection [Epic-16, FR250.8]"
```

---

### Task 23: Undo Suppression (FR249.7)

**Files:**
- Modify: `apps/api/src/routes/learner-profile.ts`
- Modify: `apps/api/src/services/learner-profile.ts`
- Modify: `apps/mobile/src/app/(app)/mentor-memory.tsx`
- Modify: `apps/mobile/src/hooks/use-learner-profile.ts`

- [ ] **Step 1: Add unsuppress API route**

```typescript
  // POST /learner-profile/unsuppress — remove item from suppressedInferences
  .post(
    '/learner-profile/unsuppress',
    zValidator('json', unsuppressInferenceSchema),
    async (c) => {
      const { db, profileId } = c.var;
      const { value } = c.req.valid('json');
      const profile = await getLearningProfile(db, profileId);
      if (!profile) return c.json({ success: true });

      const suppressed = (profile.suppressedInferences as string[]) ?? [];
      const updated = suppressed.filter(s => s.toLowerCase() !== value.toLowerCase());

      await db.update(learningProfiles).set({
        suppressedInferences: updated,
        version: sql`${learningProfiles.version} + 1`,
        updatedAt: new Date(),
      }).where(eq(learningProfiles.profileId, profileId));

      return c.json({ success: true });
    }
  )
```

- [ ] **Step 2: Add "Hidden items" collapsible section to mentor-memory.tsx**

At the bottom of the screen, add a collapsible section showing `suppressedInferences` with "Bring back" action per item.

- [ ] **Step 3: Add hook for unsuppress mutation**

- [ ] **Step 4: Run typecheck and tests**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(mobile): add undo suppression with 'Hidden items' section [Epic-16, FR249.7]"
```

---

### Task 24: Strengths-First Layout with Collapsible Struggles (FR249.8)

**Files:**
- Modify: `apps/mobile/src/app/(app)/mentor-memory.tsx`
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx`

- [ ] **Step 1: Reorder sections in child mentor-memory screen**

Change section order to:
1. "Tell your mentor" input (Task 25)
2. Learning style
3. Interests (chips, expanded)
4. Strengths (expanded, prominent)
5. "Things you're improving at" (struggles, collapsible, collapsed by default)
6. Communication notes
7. Hidden items (collapsible, collapsed by default)

- [ ] **Step 2: Implement collapsible section component**

- [ ] **Step 3: Add progress indicator to struggles**

- [ ] **Step 4: Add source badges to memory items (FR252.4)**

Each memory item that has a `source` field should display a badge:
- `source: 'learner'` → "You told your mentor" badge (small, muted)
- `source: 'parent'` → "Added by parent" badge
- `source: 'inferred'` or no source → no badge (default)

- [ ] **Step 5: Apply same ordering + source badges to parent mentor-memory screen**

- [ ] **Step 6: Run typecheck**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(mobile): strengths-first layout, collapsible struggles, source badges [Epic-16, FR249.8, FR252.4]"
```

---

### Task 25: "Tell Your Mentor" Mobile Component (Story 16.10, FR252)

**Files:**
- Create: `apps/mobile/src/components/tell-mentor-input.tsx`
- Modify: `apps/mobile/src/app/(app)/mentor-memory.tsx`
- Modify: `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx`
- Modify: `apps/mobile/src/hooks/use-learner-profile.ts`

- [ ] **Step 1: Build the TellMentorInput component**

Age-adapted input with:
- Under 10: "Tell your mentor something about you!" + tappable suggestions
- 10-14: "Tell your mentor something" + placeholder
- 15+: "Add a note for your mentor" + placeholder
- Submit button, loading state, error/success toast

- [ ] **Step 2: Add hook for tell-mentor mutation**

```typescript
export function useTellMentor() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { text: string; childProfileId?: string }) => {
      const url = params.childProfileId
        ? `/learner-profile/${params.childProfileId}/tell`
        : '/learner-profile/tell';
      const res = await api.post(url, { json: { text: params.text } });
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: vars.childProfileId ? ['learner-profile', vars.childProfileId] : ['learner-profile'],
      });
    },
  });
}
```

- [ ] **Step 3: Integrate into both mentor-memory screens**

- [ ] **Step 4: Run typecheck**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(mobile): add 'Tell your mentor' input component [Epic-16, Story-16.10, FR252]"
```

---

### Task 26: Two-Tier Struggle Notifications + Resolution Celebration (FR247.6, FR247.7)

**Files:**
- Modify: `apps/api/src/services/learner-profile.ts`
- Modify: `apps/api/src/inngest/functions/session-completed.ts`
- Test: `apps/api/src/services/learner-profile.test.ts`

- [ ] **Step 1: Write tests for two-tier notification and celebration**

- [ ] **Step 2: Implement notification logic in applyAnalysis**

After the struggle merge, check for:
- New entries reaching `medium` confidence → emit `struggle_noticed`
- New entries reaching `high` confidence → emit `struggle_flagged`
- Entries removed by resolution → emit `struggle_resolved`

- [ ] **Step 3: Add recently-resolved tracking to buildMemoryBlock**

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(api): add two-tier struggle notifications and resolution celebration [Epic-16, FR247.6, FR247.7]"
```

---

### Task 27: Mentor Check-In Prompt + Interest Relevance Hint + Human-Readable Export (FR248.6, FR246.6, FR250.3)

**Files:**
- Modify: `apps/api/src/services/learner-profile.ts` (buildMemoryBlock)
- Create: `apps/api/src/services/memory-export.ts`
- Modify: `apps/api/src/routes/learner-profile.ts`
- Test: `apps/api/src/services/learner-profile.test.ts`

- [ ] **Step 1: Add check-in prompt to buildMemoryBlock**

- [ ] **Step 2: Add interest relevance hint to META_INSTRUCTION**

- [ ] **Step 3: Write tests for check-in prompt and interest hint**

- [ ] **Step 4: Implement human-readable export**

- [ ] **Step 5: Add export route**

- [ ] **Step 6: Run tests and typecheck**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(api): add check-in prompt, interest hint, human-readable export [Epic-16, FR248.6, FR246.6, FR250.3]"
```

---

### Task 28: Phase D Final Validation

- [ ] **Step 1: Run full API typecheck**

Run: `pnpm exec nx run api:typecheck`

- [ ] **Step 2: Run full API test suite**

Run: `pnpm exec nx run api:test`

- [ ] **Step 3: Run mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

- [ ] **Step 4: Run API lint + mobile lint**

Run: `pnpm exec nx run api:lint && pnpm exec nx lint mobile`

- [ ] **Step 5: Run integration tests**

Run: `cd apps/api && pnpm exec jest --testPathPattern=integration --no-coverage`

---

## Spec Coverage Verification

| Spec Requirement | Task | Verified By |
|-----------------|------|-------------|
| FR243: learning_profiles table | Tasks 1-4 | `tsc --noEmit` + migration SQL review |
| FR243.4: Confidence thresholds | Task 5 | `test: mergeStruggles 'upgrades to high confidence at 5+ attempts'` |
| FR243.5: Interest cap (20) | Task 5 | `test: mergeInterests 'respects the 20-entry cap by evicting oldest'` |
| FR243.5: Struggle archival (90d) | Task 5 | `test: archiveStaleStruggles 'removes struggles older than 90 days'` — `archiveStaleStruggles()` called in `applyAnalysis()` |
| FR243.6: Profile-scoped reads | Task 3 | `repository.ts:learningProfiles.findFirst` uses `scopedWhere` |
| FR244: Session analysis Inngest function | Task 6 | `step.run('analyze-learner-profile')` in session-completed.ts |
| FR244.5: Incremental merge, not replace | Task 5 | `test: mergeInterests`, `test: mergeStruggles`, `test: mergeStrengths` — all merge, never overwrite |
| FR244.6: memoryEnabled short-circuit | Task 6 | `if (existingProfile?.memoryEnabled === false) return;` in step code |
| FR244.7: Budget model | Task 6 | `routeAndCall(messages, 1, {})` — rung 1 = budget tier |
| FR245: Memory context injection | Task 7 | `context.learnerMemoryContext` in `ExchangeContext` + `buildSystemPrompt()` |
| FR245.2: Priority ordering | Task 5 | `buildMemoryBlock()`: struggles → style → interests → communication |
| FR245.3: Natural language format | Task 5 | `test: buildMemoryBlock 'includes the meta-instruction for natural weaving'` |
| FR245.4: 500-token budget | Task 5 | Section-aware truncation drops lowest-priority sections, preserves meta-instruction |
| FR245.5: Meta-instruction preserved | Task 5 | `META_INSTRUCTION` constant always appended; truncation pops `lines`, never slices |
| FR244.9: Freeform session handling | Task 6 | `subjectId` null guard + `subjectName: string | null` in `applyAnalysis()` + `struggleEntrySchema.subject.nullable()` |
| FR246: Interest detection | Tasks 6, 9 | LLM prompt rules + `mergeInterests()` |
| FR246.4: Interest demotion (60d) | Task 5 | `test: mergeInterests 'demotes interests older than 60 days'` — uses `interestTimestamps` JSONB |
| FR246.5: rawInput as interest signal | Task 6 | `sessionRow?.rawInput` passed to `analyzeSessionTranscript()` + `{rawInput}` placeholder in LLM prompt |
| FR247: Struggle pattern detection | Tasks 6, 10 | LLM prompt `struggles` + `resolvedTopics` fields |
| FR247.4: Struggle resolution | Tasks 5, 10 | `resolveStruggle()` called from `applyAnalysis()` via `analysis.resolvedTopics` |
| FR248: Explanation effectiveness | Tasks 6, 11 | `updateLearningStyleFromEffectiveness()` + `effectivenessSessionCount` (dedicated counter) |
| FR248.4: Style exploration prompt | Task 12 | `test: buildMemoryBlock 'includes style variation prompt when no learning style is set'` |
| FR249: "What My Mentor Knows" screen | Task 15 | `mentor-memory.tsx` with `MemoryChip` (remove + suppress actions) |
| FR249.3: Delete action | Tasks 13, 15 | `DELETE /learner-profile/item` + `subject` disambiguator for struggles |
| FR249.4: Empty state | Task 15 | `testID="empty-state"` with age-adapted guidance text |
| FR249.5: Age-adapted copy | Task 15 | `computeAgeBracket(birthYear)` → `copy(child, teen, adult)` |
| FR249.6: "This is wrong" + suppressedInferences | Tasks 5, 13, 15 | `suppress: true` → `suppressedInferences` array, checked in all merge functions |
| FR250: Parent memory visibility | Task 16 | `(app)/child/[profileId]/mentor-memory.tsx` |
| FR250.3: Toggle, export, delete all | Tasks 13, 16 | `PATCH /memory-enabled`, `DELETE /all`, `handleExport` |
| FR250.4: memoryEnabled toggle confirmation | Task 16 | `Alert.alert('Disable memory?', ...)` with cancel option |
| FR250.6: GDPR data export | Task 8 | `learningProfileRows` in `generateExport()` |
| FR250.3: GDPR self-delete (child) | Task 13 | `DELETE /learner-profile/all` (no `:profileId` = self) |
| FR251: Memory warm-start | Task 17 | `test: buildMemoryBlock 'includes cross-subject signals'` — struggles filtered by subject, rest always included |
| Strengths population | Tasks 5, 6 | `mergeStrengths()` in `applyAnalysis()` + LLM `strengths` field |
| Epic 15 AD6: Inngest chain ordering | Task 6 | Step runs at position 4 (after filing, before snapshot). Comment in step code. |
| Epic 15 AD6: Shared token budget | Task 5 | `MEMORY_BLOCK_TOKEN_BUDGET = 500` within ~1,000 shared budget. Comment in constants. |
| Conversation-First cross-refs | Tasks 1, 6 | `struggleEntrySchema.subject.nullable()`, `rawInput` in analysis, null subject handling |
| FR246.6: Interest relevance hint | Task 27 | Soft hint in `META_INSTRUCTION`: "don't force interests" |
| FR247.6: Two-tier struggle notification | Task 26 | `struggle_noticed` at medium, `struggle_flagged` at high |
| FR247.7: Struggle resolution celebration | Task 26 | `struggle_resolved` coaching cards for child + parent |
| FR248.6: Mentor check-in questions | Task 27 | Conditional check-in prompt in `buildMemoryBlock()` for sparse profiles |
| FR249.7: Undo suppression | Task 23 | `POST /learner-profile/unsuppress` + "Hidden items" UI section |
| FR249.8: Strengths-first layout | Task 24 | Reordered sections, collapsible struggles |
| FR250.7: Consent-first activation | Task 21 | `memoryConsentStatus` field, consent API route, parent prompt component |
| FR250.8: Granular memory toggles | Task 22 | `memoryCollectionEnabled` + `memoryInjectionEnabled` replace `memoryEnabled` |
| FR250.3 (revised): Human-readable export | Task 27 | `formatProfileForExport()` returns structured text + raw JSON |
| FR252: "Tell Your Mentor" | Tasks 19, 20, 25 | Schema (`source`, `tellMentorInputSchema`), API routes, LLM parsing, mobile input |
| FR252.3: High-confidence direct input | Task 20 | `confidence: 'high'` in `parseLearnerInput()` |
| FR252.4: Source tagging (schema) | Task 19 | `memorySourceSchema` enum, `source` field on entry schemas |
| FR252.4: Source badge display | Task 24 | "You told your mentor" / "Added by parent" badges on memory screen items |
| FR252.7: Age-adapted input | Task 25 | `TellMentorInput` with `computeAgeBracket()` → suggestions for under-10 |
| Phase D data migration | Task 19a | Existing `memoryEnabled=true` rows → `memoryConsentStatus='granted'` + `memoryCollectionEnabled=true` |
| Story 16.0 prerequisite | Pre-Phase-A | IMPLEMENTED — embedding key, prompt instructions, cross-subject context |
| Amendments (Epic 15 cross-ref, dedup) | Tasks 5, 7 | See `2026-04-08-epic-16-amendments.md` — apply during implementation |

---

## Review Changelog

> Adversarial review conducted 2026-04-07. All findings resolved in this revision.

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | **HIGH** | `resolveStruggle()` never called — FR247.4 unimplemented | Added `resolvedTopics` to `sessionAnalysisOutputSchema`, LLM prompt, and `applyAnalysis()`. `resolveStruggle` is now called when LLM detects mastery. |
| 2 | **HIGH** | `strengths` never populated — UI sections dead | Added `strengths` to `sessionAnalysisOutputSchema`, LLM prompt rules, `mergeStrengths()` function, and `applyAnalysis()` merge path. |
| 3 | **HIGH** | Interest demotion (60-day) impossible — no timestamps | Added `interestTimestamps` JSONB column + map tracking. `mergeInterests` now returns `{ interests, timestamps }`, demotes stale entries to front for cap-based eviction. |
| 4 | **MEDIUM** | Struggle 90-day archival missing — FR243.5 | Added `archiveStaleStruggles()` function, called in `applyAnalysis()` after merge. Tests verify removal of entries beyond 90-day cutoff. |
| 5 | **HIGH** | `version` as corroboration proxy overcounted | Added `effectivenessSessionCount` column (integer, default 0). Incremented only when `explanationEffectiveness` data is present. `updateLearningStyleFromEffectiveness` uses this counter. |
| 6 | **HIGH** | `useApiClient` imported from wrong path (`api` vs `api-client`) | Fixed import to `'../lib/api-client'` matching actual codebase export. |
| 7 | **MEDIUM** | Route test file listed but never created | Added Step 4-5 in Task 13: full route test suite covering GET, DELETE, PATCH, IDOR checks, and child self-delete. |
| 8 | **LOW** | Dynamic imports in route handlers | Replaced all `await import('@eduagent/database')` / `await import('drizzle-orm')` with static imports at file top. |
| 9 | **MEDIUM** | Blind char truncation could break meta-instruction | Replaced `block.slice()` with section-aware truncation: drops lowest-priority lines via `lines.pop()` in a loop while preserving `META_INSTRUCTION` constant. |
| 10 | **MEDIUM** | Retry in `applyAnalysis` unguarded — race condition | Retry now re-merges from fresh profile state AND includes version guard. If retry also fails (third concurrent writer), accepts loss gracefully. |
| 11 | **MEDIUM** | Struggle deletion ambiguous across subjects | Added `subject` field to `deleteMemoryItemSchema`. `deleteMemoryItem()` accepts optional `subject` param. All mobile call sites pass `s.subject` for struggle deletions. |
| 12 | **LOW** | `MemoryChip.onDelete` prop never rendered | Renamed to `onRemove`, added second `Pressable` button. Now shows both "−" (remove) and "✕" (suppress) actions. |
| 13 | **MEDIUM** | No child self-service "delete all" — GDPR Art 17 | Added `DELETE /learner-profile/all` (no `:profileId` param = self) before the parent `:profileId` variant. |
| 14 | **LOW** | `1 as any` type cast for LLM rung | Removed `as any` cast. `routeAndCall` default param is `= 1`, confirming numeric literal is valid. |

> **UX review conducted 2026-04-09.** End-user perspective review identified 10 improvements. All incorporated in Phase D (Tasks 19–28).

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| U1 | **HIGH** | Default opt-in for children's behavioral profiling — potential GDPR Article 8 non-compliance | Added FR250.7: consent-first activation. `memoryConsentStatus` field, parent prompt, collection disabled until consent granted. Task 21. |
| U2 | **HIGH** | Child can only delete, never contribute — memory feels like surveillance | Added FR252: "Tell your mentor" input. Freeform text → LLM parsing → high-confidence profile signals. Story 16.10, Tasks 19-20, 25. |
| U3 | **MEDIUM** | Suppression is a one-way trap — accidental "This is wrong" is permanent | Added FR249.7: "Hidden items" section shows suppressed items with "Bring back" action. Task 23. |
| U4 | **MEDIUM** | Struggle notifications come 5 sessions too late | Revised FR247.6: two-tier notification — early signal at medium (3 sessions), escalated at high (5). Task 26. |
| U5 | **MEDIUM** | Nobody celebrates when a struggle is resolved | Added FR247.7: `struggle_resolved` coaching cards for child + parent, growth reference in next session. Task 26. |
| U6 | **MEDIUM** | Memory toggle is all-or-nothing | Added FR250.8: granular toggles — separate collection vs. injection controls. 4 possible states. Task 22. |
| U7 | **MEDIUM** | The mentor never asks — system is passive-only | Added FR248.6: conditional check-in questions for sparse profiles ("Did that help?"), max once/session, stops after 5+ data points. Task 27. |
| U8 | **LOW** | JSON export is useless for parents | Revised FR250.3: human-readable summary as primary export, raw JSON as secondary download. Task 27. |
| U9 | **LOW** | Cross-subject interests forced awkwardly | Added FR246.6: soft interest-relevance hint in META_INSTRUCTION ("don't force them"). Task 27. |
| U10 | **LOW** | Struggle list feels like a report card | Added FR249.8: strengths-first layout, collapsible struggles titled "Things you're improving at", progress indicators. Task 24. |

> **Adversarial review #2 conducted 2026-04-09.** 13 findings across cross-task coherence, GDPR compliance, data correctness, and test quality. All resolved in this revision.

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| A1 | **HIGH** | `resolveStruggle()` called in Task 5 `applyAnalysis` but defined in Task 10 — typecheck breaks | Moved `resolveStruggle` implementation into Task 5. Task 10 now adds edge-case tests only. |
| A2 | **HIGH** | Route test expects HTTP 200 for IDOR rejection that returns 403 | Fixed `expect(res.status).toBe(200)` → `expect(res.status).toBe(403)` in Task 13 IDOR test. |
| A3 | **HIGH** | `text` variable undefined in parent `/tell` route (Task 20) — runtime `ReferenceError` | Added `const { text } = c.req.valid('json')` to parent `/learner-profile/:profileId/tell` route handler. |
| A4 | **HIGH** | Child has no "Delete All" button — GDPR Art 17 self-service is API-only | Added `handleDeleteAll` + delete button to child `mentor-memory.tsx`. Fixed `useDeleteAllMemory` hook to support self-service (`childProfileId?: string`). |
| A5 | **MEDIUM** | Null-subject struggles invisible during subject-specific sessions — freeform learning data silently lost | Updated `buildMemoryBlock` filter: `!s.subject` passes filter regardless of `currentSubject`, so freeform struggles always appear. Updated Task 17 test to match. |
| A6 | **MEDIUM** | No OCC on `deleteMemoryItem` — concurrent analysis can overwrite user deletion | Added `eq(learningProfiles.version, profile.version)` guard to `deleteMemoryItem` WHERE clause. |
| A7 | **MEDIUM** | `StrengthEntry.confidence` never upgrades — always 'medium' | Added confidence upgrade in `mergeStrengths`: 3+ topics in a subject → `'high'`. |
| A8 | **MEDIUM** | Effectiveness threshold checks single-session data points instead of cross-session corroboration | Removed `totalDataPoints >= 5` check from `updateLearningStyleFromEffectiveness`. Now gates on `corroboratingSessions` threshold only. Updated test. |
| A9 | **MEDIUM** | Phase D deployment gap: memory collection silently breaks for all new users between API deploy and mobile update | Added deployment ordering note to Task 21: the Inngest short-circuit must use a feature flag or fallback that keeps existing `memoryEnabled` behavior until consent UI is deployed. |
| A10 | **MEDIUM** | Route tests for `DELETE /learner-profile/item` are incomplete — no data seeded, no deletion verified | Filled in tests with `seedLearningProfile`, GET-after-DELETE verification, and suppression verification. |
| A11 | **MEDIUM** | `parseLearnerInput` test stubs are empty — zero assertions | Noted in Task 20: stubs must be filled with LLM mock setup, assertion logic, and source-tagging verification during implementation. |
| A12 | **LOW** | Amendment 2 retention context untested — `buildMemoryBlock` signature change has no coverage | Added retention context test in Task 17: verifies well-retained struggles are excluded from memory block. |
| A13 | **LOW** | Exploration prompt has higher truncation priority than actual interests | Moved exploration prompt insertion to Priority 5 (after communication notes), so it is truncated first. |
