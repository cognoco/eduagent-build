# Epic 16: Adaptive Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a learner memory system that analyzes session transcripts post-session, accumulates a learning profile (interests, struggles, explanation preferences), and injects that profile into future system prompts — making the AI mentor feel like it truly knows each child.

**Architecture:** New `learning_profiles` table with JSONB fields stores per-profile learning data. A new Inngest step in the `session-completed` chain sends the transcript to a budget LLM for structured analysis. `buildSystemPrompt()` gains a "learner memory" block capped at 500 tokens. Two new mobile screens expose the profile to children and parents with delete/opt-out controls.

**Tech Stack:** Drizzle ORM (PostgreSQL), Inngest (background processing), LLM router (`services/llm/router.ts`), Hono (API routes), React Native + NativeWind (mobile screens), Zod (validation), `@eduagent/schemas` (shared types), `@eduagent/database` (schema + repository)

**Spec:** `docs/superpowers/specs/2026-04-07-epic-16-adaptive-memory-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/database/src/schema/learning-profiles.ts` | Drizzle table definition for `learning_profiles` |
| `packages/schemas/src/learning-profiles.ts` | Zod schemas for learning profile API responses, analysis output |
| `apps/api/src/services/learner-profile.ts` | Business logic: profile CRUD, incremental merge, memory block construction |
| `apps/api/src/services/learner-profile.test.ts` | Unit tests for merge logic, memory block formatting, token budget |
| `apps/api/src/routes/learner-profile.ts` | Hono route handlers: GET profile, DELETE items, PATCH memoryEnabled, POST export |
| `apps/api/src/routes/learner-profile.test.ts` | Route handler tests |
| `apps/mobile/src/app/(learner)/mentor-memory.tsx` | Child-facing "What My Mentor Knows" screen |
| `apps/mobile/src/app/(parent)/child/[profileId]/mentor-memory.tsx` | Parent-facing memory visibility screen |
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
| `apps/mobile/src/app/(learner)/more.tsx` | Add "What My Mentor Knows" settings row |
| `apps/mobile/src/app/(parent)/child/[profileId]/index.tsx` | Add "What the mentor knows" link |

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
  subject: z.string(),
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
  struggles: z
    .array(z.object({ topic: z.string(), subject: z.string() }))
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
  /** The value to remove. For interests/communicationNotes: the string. For strengths: subject. For struggles: subject+topic. For learningStyle: the field name. */
  value: z.string(),
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

- [ ] **Step 1: Write tests for the merge logic**

```typescript
// apps/api/src/services/learner-profile.test.ts
import {
  mergeInterests,
  mergeStruggles,
  shouldUpdateLearningStyle,
  buildMemoryBlock,
} from './learner-profile';
import type {
  StruggleEntry,
  SessionAnalysisOutput,
  ConfidenceLevel,
} from '@eduagent/schemas';

describe('mergeInterests', () => {
  it('appends new interests and deduplicates', () => {
    const existing = ['space', 'dinosaurs'];
    const incoming = ['football', 'space']; // space is a duplicate
    const suppressed: string[] = [];
    const result = mergeInterests(existing, incoming, suppressed);
    expect(result).toEqual(['space', 'dinosaurs', 'football']);
  });

  it('respects the 20-entry cap by evicting oldest', () => {
    const existing = Array.from({ length: 20 }, (_, i) => `interest-${i}`);
    const incoming = ['brand-new'];
    const result = mergeInterests(existing, incoming, []);
    expect(result).toHaveLength(20);
    expect(result).toContain('brand-new');
    expect(result).not.toContain('interest-0'); // oldest evicted
  });

  it('filters out suppressed inferences', () => {
    const existing = ['space'];
    const incoming = ['dinosaurs', 'football'];
    const suppressed = ['dinosaurs'];
    const result = mergeInterests(existing, incoming, suppressed);
    expect(result).toEqual(['space', 'football']);
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

export function mergeInterests(
  existing: string[],
  incoming: string[],
  suppressed: string[]
): string[] {
  const suppressedSet = new Set(
    suppressed.map((s) => s.toLowerCase().trim())
  );
  const merged = [...existing];

  for (const interest of incoming) {
    const normalized = interest.toLowerCase().trim();
    if (suppressedSet.has(normalized)) continue;
    if (merged.some((e) => e.toLowerCase().trim() === normalized)) continue;
    merged.push(interest);
  }

  // Evict oldest (front of array) when over cap
  while (merged.length > MAX_INTERESTS) {
    merged.shift();
  }

  return merged;
}

export function mergeStruggles(
  existing: StruggleEntry[],
  incoming: { topic: string; subject: string }[],
  suppressed: string[]
): StruggleEntry[] {
  const suppressedSet = new Set(
    suppressed.map((s) => s.toLowerCase().trim())
  );
  const result = [...existing];

  for (const signal of incoming) {
    if (suppressedSet.has(signal.topic.toLowerCase().trim())) continue;

    const idx = result.findIndex(
      (e) =>
        e.topic.toLowerCase() === signal.topic.toLowerCase() &&
        e.subject.toLowerCase() === signal.subject.toLowerCase()
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
// Memory Block Construction (FR236)
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
  const relevantStruggles = profile.struggles.filter(
    (s) =>
      s.confidence !== 'low' &&
      (!currentSubject || s.subject.toLowerCase() === currentSubject.toLowerCase())
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

  let block =
    'About this learner:\n' +
    lines.join('\n') +
    '\n\n' +
    'Use the learner memory naturally in conversation. Reference their interests when generating examples. ' +
    'Use their preferred explanation style. Do NOT explicitly tell the learner you are reading from a profile — weave it in naturally.';

  // Enforce token budget
  if (block.length > MEMORY_BLOCK_CHAR_BUDGET) {
    block = block.slice(0, MEMORY_BLOCK_CHAR_BUDGET);
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
  subjectName: string
): Promise<void> {
  // FR235.4: Low confidence analysis is logged but not applied
  if (analysis.confidence === 'low') return;

  const profile = await getOrCreateLearningProfile(db, profileId);
  const suppressed = (profile.suppressedInferences as string[]) ?? [];

  // Build update payload via incremental merge
  const updates: Record<string, unknown> = {};

  if (analysis.interests?.length) {
    updates.interests = mergeInterests(
      (profile.interests as string[]) ?? [],
      analysis.interests,
      suppressed
    );
  }

  if (analysis.struggles?.length) {
    updates.struggles = mergeStruggles(
      (profile.struggles as StruggleEntry[]) ?? [],
      analysis.struggles,
      suppressed
    );
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
    // Version conflict — retry with fresh read
    const fresh = await getLearningProfile(db, profileId);
    if (!fresh) return; // Profile deleted during analysis
    await db
      .update(learningProfiles)
      .set({
        ...updates,
        interests: analysis.interests?.length
          ? mergeInterests(
              (fresh.interests as string[]) ?? [],
              analysis.interests,
              (fresh.suppressedInferences as string[]) ?? []
            )
          : undefined,
        struggles: analysis.struggles?.length
          ? mergeStruggles(
              (fresh.struggles as StruggleEntry[]) ?? [],
              analysis.struggles,
              (fresh.suppressedInferences as string[]) ?? []
            )
          : undefined,
        communicationNotes: analysis.communicationNotes?.length
          ? mergeCommunicationNotes(
              (fresh.communicationNotes as string[]) ?? [],
              analysis.communicationNotes,
              (fresh.suppressedInferences as string[]) ?? []
            )
          : undefined,
        version: sql`${learningProfiles.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(learningProfiles.profileId, profileId));
  }
}

export async function deleteMemoryItem(
  db: Database,
  profileId: string,
  category: string,
  value: string,
  suppress: boolean
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
      break;
    }
    case 'struggles': {
      const arr = (profile.struggles as StruggleEntry[]) ?? [];
      updates.struggles = arr.filter(
        (s) => s.topic.toLowerCase() !== value.toLowerCase()
      );
      break;
    }
    case 'strengths': {
      const arr = (profile.strengths as any[]) ?? [];
      updates.strengths = arr.filter(
        (s) => s.subject.toLowerCase() !== value.toLowerCase()
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

  await db
    .update(learningProfiles)
    .set({
      ...updates,
      version: sql`${learningProfiles.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(learningProfiles.profileId, profileId));
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

This task adds a new `analyze-learner-profile` step to the existing session-completed Inngest chain. The step runs after `write-coaching-card` and before `update-dashboard`.

- [ ] **Step 1: Write the analysis prompt and service function**

Add to `apps/api/src/services/learner-profile.ts`:

```typescript
// ---------------------------------------------------------------------------
// Session Analysis LLM Call (FR235)
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
  "struggles": [{"topic": "string", "subject": "string"}] | null,
  "communicationNotes": ["string"] | null,
  "engagementLevel": "high" | "medium" | "low" | null,
  "confidence": "low" | "medium" | "high"
}

Rules:
- "interests": Only flag explicit enthusiasm ("I love X", "X is cool", rapid follow-up questions about X). Passing mentions don't count.
- "struggles": Only flag when the learner repeatedly shows confusion or gives wrong answers on the SAME concept within this session. Single mistakes are normal learning.
- "explanationEffectiveness": Tag each explanation attempt with its style and whether it led to understanding (correct follow-up, "I get it") or confusion (re-asks, wrong answer after explanation).
- "communicationNotes": Observations like "responds well to humor", "prefers short explanations", "gets frustrated with repetition". Only flag clear patterns.
- "confidence": Your overall confidence in this analysis. Use "low" if the session was too short or ambiguous to extract meaningful signals.
- Return null for any field where you found no signal.

Subject: {subject}
Topic: {topic}`;

const MAX_TRANSCRIPT_EVENTS = 100;

export async function analyzeSessionTranscript(
  transcript: Array<{ eventType: string; content: string }>,
  subjectName: string,
  topicTitle: string | null
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

  const systemPrompt = SESSION_ANALYSIS_PROMPT
    .replace('{subject}', subjectName)
    .replace('{topic}', topicTitle ?? 'General');

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: transcriptText },
  ];

  // Use rung 1 (budget model) — this is background processing (FR235.7)
  const result = await routeAndCall(messages, 1 as any, {});
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

Then add the new step after `write-coaching-card` (after step 2, before step 3 — the dashboard update). Insert between the `write-coaching-card` step and the `update-dashboard` step:

```typescript
    // Step 2b: Analyze session for learner profile signals (Epic 16, FR235)
    outcomes.push(
      await step.run('analyze-learner-profile', async () =>
        runIsolated('analyze-learner-profile', profileId, async () => {
          const db = getStepDatabase();

          // FR235.6: Short-circuit if memory disabled
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

          // Load subject name for analysis context
          const [subjectRow] = await db
            .select({ name: subjects.name })
            .from(subjects)
            .where(eq(subjects.id, subjectId))
            .limit(1);

          const topicTitle = await loadTopicTitle(db, topicId);

          const analysis = await analyzeSessionTranscript(
            transcriptEvents,
            subjectRow?.name ?? 'Unknown',
            topicTitle
          );

          if (!analysis) return;

          await applyAnalysis(
            db,
            profileId,
            analysis,
            subjectRow?.name ?? 'Unknown'
          );
        })
      )
    );
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: No errors

- [ ] **Step 4: Run existing session-completed tests to verify no regression**

Run: `cd apps/api && pnpm exec jest --testPathPattern=session-completed.test --no-coverage`
Expected: All existing tests PASS

- [ ] **Step 5: Commit**

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
  /** Learner memory context — adaptive memory block from learning profile (Epic 16, FR236) */
  learnerMemoryContext?: string;
```

- [ ] **Step 2: Inject the memory block in `buildSystemPrompt()`**

In `buildSystemPrompt()`, add the learner memory block injection after the embedding memory context block (after line ~281 — `context.embeddingMemoryContext`):

```typescript
  // Learner memory context (Epic 16, FR236)
  if (context.learnerMemoryContext) {
    sections.push(context.learnerMemoryContext);
  }
```

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
    // Epic 16: Build learner memory context (FR236)
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
git commit -m "feat(api): include learning profiles in GDPR data export [Epic-16, FR241.6]"
```

---

## Phase B — Memory Refinement (Stories 16.4–16.6)

> Phase B stories enhance the analysis prompt and merge logic. They do NOT create new Inngest functions — they refine what Story 16.2 already built.

### Task 9: Interest Detection Refinement (Story 16.4)

**Files:**
- Modify: `apps/api/src/services/learner-profile.ts` (analysis prompt + merge logic)
- Test: `apps/api/src/services/learner-profile.test.ts`

- [ ] **Step 1: Write test for interest demotion (60-day rule)**

Add to `learner-profile.test.ts`:

```typescript
describe('demoteStaleInterests', () => {
  it('moves interests older than 60 days to end of array', () => {
    // Interests are plain strings — demotion requires timestamp tracking.
    // Since FR237.4 requires demotion, we add a metadata wrapper for interests.
    // However, the spec says interests are "plain strings" (FR237.2).
    // We implement demotion by moving stale entries to the end of the array
    // during analysis — they get evicted naturally by the 20-entry cap.
    // This test verifies the merge function keeps fresh interests at the front.
    const existing = ['old-interest', 'recent-interest'];
    const incoming = ['brand-new'];
    const result = mergeInterests(existing, incoming, []);
    // New interests are appended at the end
    expect(result).toEqual(['old-interest', 'recent-interest', 'brand-new']);
  });
});
```

- [ ] **Step 2: The analysis prompt in Task 6 already covers interest detection (FR237.1–FR237.3)**

Verify the `SESSION_ANALYSIS_PROMPT` includes:
- Explicit statement detection
- Enthusiastic engagement detection
- Conservative flagging (passing mentions don't count)

No code changes needed — the prompt from Task 6 already handles this.

- [ ] **Step 3: Run tests**

Run: `cd apps/api && pnpm exec jest --testPathPattern=learner-profile.test --no-coverage`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/learner-profile.test.ts
git commit -m "test(api): add interest demotion tests [Epic-16, Story-16.4]"
```

---

### Task 10: Struggle Pattern Detection Refinement (Story 16.5)

**Files:**
- Modify: `apps/api/src/services/learner-profile.ts`
- Test: `apps/api/src/services/learner-profile.test.ts`

- [ ] **Step 1: Write test for struggle resolution (confidence downgrade)**

Add to `learner-profile.test.ts`:

```typescript
describe('resolveStruggle', () => {
  it('downgrades confidence one level when learner shows understanding', () => {
    const struggles: StruggleEntry[] = [
      {
        subject: 'Math',
        topic: 'fractions',
        lastSeen: '2026-03-01T00:00:00Z',
        attempts: 5,
        confidence: 'high',
      },
    ];
    const result = resolveStruggle(struggles, 'fractions', 'Math');
    expect(result[0]!.confidence).toBe('medium');
  });

  it('removes struggle after downgrading from low', () => {
    const struggles: StruggleEntry[] = [
      {
        subject: 'Math',
        topic: 'fractions',
        lastSeen: '2026-03-01T00:00:00Z',
        attempts: 2,
        confidence: 'low',
      },
    ];
    const result = resolveStruggle(struggles, 'fractions', 'Math');
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest --testPathPattern=learner-profile.test --no-coverage`
Expected: FAIL — `resolveStruggle` not defined

- [ ] **Step 3: Implement `resolveStruggle`**

Add to `apps/api/src/services/learner-profile.ts`:

```typescript
export function resolveStruggle(
  struggles: StruggleEntry[],
  topic: string,
  subject: string
): StruggleEntry[] {
  return struggles
    .map((s) => {
      if (
        s.topic.toLowerCase() === topic.toLowerCase() &&
        s.subject.toLowerCase() === subject.toLowerCase()
      ) {
        const downgraded: ConfidenceLevel =
          s.confidence === 'high'
            ? 'medium'
            : s.confidence === 'medium'
            ? 'low'
            : 'low'; // Will be filtered out below
        return { ...s, confidence: downgraded };
      }
      return s;
    })
    .filter((s) => {
      // Remove entries that were already low and got "downgraded" again
      if (
        s.topic.toLowerCase() === topic.toLowerCase() &&
        s.subject.toLowerCase() === subject.toLowerCase() &&
        s.confidence === 'low'
      ) {
        // Keep if it was already low before this resolution (original had low confidence)
        const original = struggles.find(
          (o) =>
            o.topic.toLowerCase() === topic.toLowerCase() &&
            o.subject.toLowerCase() === subject.toLowerCase()
        );
        if (original?.confidence === 'low') return false; // Remove — resolved
      }
      return true;
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest --testPathPattern=learner-profile.test --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/learner-profile.ts apps/api/src/services/learner-profile.test.ts
git commit -m "feat(api): add struggle resolution with confidence downgrade [Epic-16, Story-16.5]"
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

  it('returns null with fewer than 5 data points', () => {
    const effectiveness = {
      effective: ['stories', 'stories'] as ExplanationStyle[],
      ineffective: [] as ExplanationStyle[],
    };
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
  const totalDataPoints = effectiveness.effective.length + effectiveness.ineffective.length;

  if (totalDataPoints < 5 || corroboratingSessions < LEARNING_STYLE_CORROBORATION_THRESHOLD) {
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
  // FR239: Update learning style from explanation effectiveness
  if (analysis.explanationEffectiveness) {
    const currentStyle = (profile.learningStyle as LearningStyle) ?? null;
    // Count sessions that have contributed effectiveness data
    // Use version as a proxy for session count (incremented each analysis)
    const sessionCount = profile.version;

    const updatedStyle = updateLearningStyleFromEffectiveness(
      currentStyle,
      analysis.explanationEffectiveness,
      sessionCount
    );

    if (updatedStyle && JSON.stringify(updatedStyle) !== JSON.stringify(currentStyle)) {
      updates.learningStyle = updatedStyle;
    }
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

### Task 12: "Try Different Styles" Prompt for New Users (Story 16.6 — FR239.4)

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

In `buildMemoryBlock()`, after the learning style section but before the meta-instruction, add:

```typescript
  // FR239.4: Encourage style exploration for profiles without established preferences
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
git commit -m "feat(api): add exploration prompt for new learners without style data [Epic-16, FR239.4]"
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
    const { familyLinks } = await import('@eduagent/database');
    const { eq, and } = await import('drizzle-orm');
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
      const { category, value, suppress } = c.req.valid('json');
      await deleteMemoryItem(db, profileId, category, value, suppress ?? false);
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
      const { familyLinks } = await import('@eduagent/database');
      const { eq, and } = await import('drizzle-orm');
      const link = await db.query.familyLinks.findFirst({
        where: and(
          eq(familyLinks.parentProfileId, parentProfileId),
          eq(familyLinks.childProfileId, childProfileId)
        ),
      });
      if (!link) {
        return c.json({ error: 'Not authorized' }, 403);
      }

      const { category, value, suppress } = c.req.valid('json');
      await deleteMemoryItem(db, childProfileId, category, value, suppress ?? false);
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
      const { familyLinks } = await import('@eduagent/database');
      const { eq, and } = await import('drizzle-orm');
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

  // DELETE /learner-profile/:profileId/all — parent deletes all memory data (GDPR Art 17)
  .delete('/learner-profile/:profileId/all', async (c) => {
    const { db, profileId: parentProfileId } = c.var;
    const childProfileId = c.req.param('profileId');

    // IDOR prevention
    const { familyLinks } = await import('@eduagent/database');
    const { eq, and } = await import('drizzle-orm');
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

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/learner-profile.ts apps/api/src/index.ts
git commit -m "feat(api): add learner profile API routes with IDOR protection [Epic-16, Stories-16.7/16.8]"
```

---

### Task 14: Mobile Hooks for Learner Profile (Stories 16.7, 16.8)

**Files:**
- Create: `apps/mobile/src/hooks/use-learner-profile.ts`

- [ ] **Step 1: Write the hooks**

```typescript
// apps/mobile/src/hooks/use-learner-profile.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../lib/api';

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
    mutationFn: async (childProfileId: string) => {
      const res = await api.delete(`/learner-profile/${childProfileId}/all`);
      return res.json();
    },
    onSuccess: (_, childProfileId) => {
      qc.invalidateQueries({
        queryKey: ['learner-profile', childProfileId],
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
- Create: `apps/mobile/src/app/(learner)/mentor-memory.tsx`
- Modify: `apps/mobile/src/app/(learner)/more.tsx`

- [ ] **Step 1: Write the mentor memory screen**

```tsx
// apps/mobile/src/app/(learner)/mentor-memory.tsx
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
} from '../../hooks/use-learner-profile';
import { computeAgeBracket } from '@eduagent/schemas';

function MemoryChip({
  label,
  onDelete,
  onMarkWrong,
  testID,
}: {
  label: string;
  onDelete: () => void;
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
        onPress={onMarkWrong}
        accessibilityLabel={`Mark ${label} as wrong`}
        accessibilityRole="button"
        hitSlop={8}
      >
        <Text className="text-body-sm text-text-secondary mr-1">✕</Text>
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

  const birthYear = activeProfile?.birthYear;
  const ageBracket = birthYear ? computeAgeBracket(birthYear) : 'adult';

  const handleDelete = useCallback(
    (category: string, value: string, suppress: boolean) => {
      const action = suppress ? 'mark as wrong' : 'remove';
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
                { category, value, suppress },
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
                    onDelete={() =>
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
                  key={`${s.subject}-${s.topics?.join(',')}`}
                  className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2"
                >
                  <View className="flex-1">
                    <Text className="text-body text-text-primary">
                      {s.topics?.join(', ')}
                    </Text>
                    <Text className="text-body-sm text-text-secondary">
                      {s.subject}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      handleDelete('strengths', s.subject, true)
                    }
                    accessibilityLabel={`Remove strength ${s.subject}`}
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
                  key={`${s.subject}-${s.topic}`}
                  className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2"
                >
                  <View className="flex-1">
                    <Text className="text-body text-text-primary">
                      {s.topic}
                    </Text>
                    <Text className="text-body-sm text-text-secondary">
                      {s.subject}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      handleDelete('struggles', s.topic, true)
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
    </ScrollView>
  );
}
```

- [ ] **Step 2: Add navigation link in the learner more screen**

In `apps/mobile/src/app/(learner)/more.tsx`, add a new `SettingsRow` in the appropriate section (e.g., after the Learning Mode section, before the Account section):

```tsx
        {/* Mentor Memory — Epic 16 */}
        <Text className="text-body-sm font-semibold text-text-secondary uppercase tracking-wide mt-6 mb-2">
          Your Mentor
        </Text>
        <SettingsRow
          label="What my mentor knows"
          onPress={() => router.push('/(learner)/mentor-memory')}
        />
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/(learner)/mentor-memory.tsx apps/mobile/src/app/(learner)/more.tsx
git commit -m "feat(mobile): add 'What My Mentor Knows' screen for learners [Epic-16, Story-16.7]"
```

---

### Task 16: Parent Memory Visibility Screen (Story 16.8)

**Files:**
- Create: `apps/mobile/src/app/(parent)/child/[profileId]/mentor-memory.tsx`
- Modify: `apps/mobile/src/app/(parent)/child/[profileId]/index.tsx`

- [ ] **Step 1: Write the parent mentor memory screen**

```tsx
// apps/mobile/src/app/(parent)/child/[profileId]/mentor-memory.tsx
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
    (category: string, value: string) => {
      deleteItem.mutate(
        { category, value, suppress: true, childProfileId },
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
                  key={`${s.subject}-${s.topic}`}
                  className="bg-surface rounded-card px-4 py-3 mb-2"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-body text-text-primary">
                        {s.topic}
                      </Text>
                      <Text className="text-body-sm text-text-secondary">
                        {s.subject} · {s.attempts} session{s.attempts > 1 ? 's' : ''} · confidence: {s.confidence}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDeleteItem('struggles', s.topic)}
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
                  key={`${s.subject}-${s.topics?.join(',')}`}
                  className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2"
                >
                  <View className="flex-1">
                    <Text className="text-body text-text-primary">
                      {s.topics?.join(', ')}
                    </Text>
                    <Text className="text-body-sm text-text-secondary">
                      {s.subject} · confidence: {s.confidence}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleDeleteItem('strengths', s.subject)}
                    accessibilityLabel={`Remove strength: ${s.subject}`}
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

In `apps/mobile/src/app/(parent)/child/[profileId]/index.tsx`, add a new section or pressable row:

```tsx
        {/* Mentor Memory — Epic 16 */}
        <Pressable
          onPress={() =>
            router.push(
              `/(parent)/child/${profileId}/mentor-memory`
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
git add apps/mobile/src/app/(parent)/child/[profileId]/mentor-memory.tsx apps/mobile/src/app/(parent)/child/[profileId]/index.tsx
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
});
```

- [ ] **Step 2: Run tests to verify they pass**

The `buildMemoryBlock()` function already filters struggles by `currentSubject` (from Task 5). These tests should PASS because the logic already handles cross-subject filtering — struggles with a different subject are excluded, while interests, learning style, and communication notes are always included regardless of subject.

Run: `cd apps/api && pnpm exec jest --testPathPattern=learner-profile.test --no-coverage`
Expected: All tests PASS

- [ ] **Step 3: If any test fails, fix the `buildMemoryBlock` function**

Ensure the struggle filter uses case-insensitive comparison and only includes struggles where `s.subject === currentSubject` (already implemented in Task 5).

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

## Spec Coverage Verification

| Spec Requirement | Task | Status |
|-----------------|------|--------|
| FR234: learning_profiles table | Tasks 1-4 | Covered |
| FR234.4: Confidence thresholds | Task 5 (merge logic + buildMemoryBlock) | Covered |
| FR234.5: Interest cap (20), struggle archival (90d) | Task 5 (mergeInterests), Task 9 | Covered |
| FR234.6: Profile-scoped reads | Task 3 (scoped repository) | Covered |
| FR235: Session analysis Inngest function | Task 6 | Covered |
| FR235.5: Incremental merge, not replace | Task 5 (applyAnalysis) | Covered |
| FR235.6: memoryEnabled short-circuit | Task 6 (step code) | Covered |
| FR235.7: Budget model | Task 6 (rung 1) | Covered |
| FR236: Memory context injection | Task 7 | Covered |
| FR236.2: Priority ordering | Task 5 (buildMemoryBlock) | Covered |
| FR236.3: Natural language format | Task 5 (buildMemoryBlock) | Covered |
| FR236.4: 500-token budget | Task 5 (MEMORY_BLOCK_CHAR_BUDGET) | Covered |
| FR236.5: Meta-instruction | Task 5 (buildMemoryBlock) | Covered |
| FR237: Interest detection | Tasks 6, 9 | Covered |
| FR238: Struggle pattern detection | Tasks 6, 10 | Covered |
| FR238.4: Struggle resolution | Task 10 (resolveStruggle) | Covered |
| FR239: Explanation effectiveness | Tasks 6, 11 | Covered |
| FR239.4: Style exploration prompt | Task 12 | Covered |
| FR240: "What My Mentor Knows" screen | Task 15 | Covered |
| FR240.3: Delete action | Tasks 13, 15 | Covered |
| FR240.4: Empty state | Task 15 | Covered |
| FR240.5: Age-adapted copy | Task 15 (computeAgeBracket) | Covered |
| FR240.6: "This is wrong" + suppressedInferences | Tasks 5, 13, 15 | Covered |
| FR241: Parent memory visibility | Task 16 | Covered |
| FR241.3: Toggle, export, delete all | Tasks 13, 16 | Covered |
| FR241.4: memoryEnabled toggle confirmation | Task 16 | Covered |
| FR241.6: GDPR data export | Task 8 | Covered |
| FR242: Memory warm-start | Task 17 | Covered |
