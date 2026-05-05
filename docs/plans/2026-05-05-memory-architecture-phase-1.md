# Memory Architecture Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate mentor memory from JSONB arrays on `learning_profiles` to a `memory_facts` table that mirrors the merged JSONB state row-by-row. Dual-write during a soak period with deploy-blocking semantic parity verification. No user-visible change.

**Architecture:** New `memory_facts` table holds Phase 1 + Phase 2 + Phase 3 columns up front (Phase 2/3 columns nullable, unused). `applyAnalysis` keeps `buildAnalysisUpdates` as the single source of merge logic (existing `mergeStruggles` increments attempts, `mergeStrengths` accumulates topics, `mergeInterests` dedupes by label, `archiveStaleStruggles` prunes by lastSeen). The rewrite wraps it in `db.transaction()` with `SELECT ... FOR UPDATE`, replaces the optimistic-version-locking retry loop with row-level locking, and projects the **already-merged** JSONB state onto `memory_facts` via a delete-active-then-insert step inside the same transaction. Parity is structural: `memory_facts` rows are a normalized 1:1 projection of the JSONB arrays — never a separate merge path.

Reads gate on a `MEMORY_FACTS_READ_ENABLED` feature flag (default off); when on, `readMemorySnapshotFromFacts` reconstructs the JSONB-shaped snapshot directly from the rows (no aggregation, because rows are already merged).

A partial UNIQUE index on `(profile_id, category, COALESCE(metadata->>'subject',''), text_normalized) WHERE superseded_by IS NULL` guarantees no duplicate active rows after backfill or a re-run of `applyAnalysis`.

**Tech Stack:** Drizzle ORM (PostgreSQL via Neon — `neon-serverless` WebSocket driver in production, `node-postgres` in CI; see `packages/database/src/client.ts:64-89` — both support genuine interactive transactions and `SELECT ... FOR UPDATE`), pgvector (column shape only — no embeddings written in Phase 1), Inngest (durable background work for backfill), Hono (API), Jest (unit + integration), eval-llm harness (parity snapshots).

**Spec:** `docs/specs/2026-05-05-memory-architecture-upgrade.md` (Phase 1 sections only).

---

## Deploy gate

Production flip of `MEMORY_FACTS_READ_ENABLED=true` requires ALL of:
1. `pnpm eval:llm` parity check (`scripts/check-eval-llm-parity.ts`) reports ZERO divergences across all 13 flow snapshot pairs (per-section bullet sets, normalized whitespace, hard char-delta ≤ 50 per file).
2. `tests/integration/memory-facts-parity.integration.test.ts` PASSes — set-equality on `readMemorySnapshotFromFacts` vs. JSONB on the fixture profiles.
3. `tests/integration/memory-facts-dual-write.integration.test.ts` PASSes — atomicity (real failure inside tx, not mocked db.insert), concurrency (SELECT FOR UPDATE serialization), cascade-on-profile-delete.
4. Backfill has run on the target environment with `totalMalformed=0` and `totalProfilesMissedMarker=0`. (Marker = `learning_profiles.memory_facts_backfilled_at IS NOT NULL` for every profile that existed before the dual-write code shipped.)
5. Post-flip SLO: `applyAnalysis` p95 latency ≤ baseline + 50 ms, dual-write success rate ≥ 99.95% over 24h. SLO breach triggers immediate rollback (set flag `false`).

The flag is set in Doppler (stg → prod). No code change is required to roll back reads.

---

## Verified code references (read at plan time)

- `apps/api/src/services/learner-profile.ts` — `applyAnalysis` (1186-1297), `updateWithRetry` (1157-1179), `buildAnalysisUpdates` (561+, calls `mergeStruggles`/`mergeStrengths`/`mergeInterests`/`archiveStaleStruggles`/`resolveStruggle`), `mergeStruggles` (333-378, increments `attempts` on existing `(subject, topic)`), `mergeStrengths` (263-322, groups by subject and accumulates `topics[]`), `mergeInterests` (208-, dedupes by label and updates `interestTimestamps`), `archiveStaleStruggles` (324-331, prunes by `STRUGGLE_ARCHIVAL_DAYS` cutoff), `resolveStruggle` (404-, decrements attempts; removes when ≤ 0), `confidenceFromAttempts` (170-174, `>=5 high / >=3 medium / else low`), `buildDeleteMemoryItemUpdates` (685-751), `deleteMemoryItem` (1299- — **positional signature** `(db, profileId, accountId, category, value, suppress=false, subject?)`, NOT object-shaped), `sameNormalized` (138-143), `normalizeMemoryValue` (function used by `sameNormalized`), `verifyProfileOwnership` (1107-1120), `buildMemoryBlock` (808-, **synchronous**; consent gate 815-821; takes `MemoryBlockProfile` not `Database`), `analyzeSessionTranscript` (1501-1622).
- `packages/database/src/schema/learning-profiles.ts:14-66` — current JSONB columns: `strengths`, `struggles`, `interests`, `communicationNotes`, `suppressedInferences`, `interestTimestamps` (all `default([])` or `default({})`), plus `version: integer` (line 57).
- `packages/database/src/schema/embeddings.ts:8-19` — `vector` customType is **module-private**. Phase 1 extracts it.
- `packages/database/src/repository.ts:59-` — `createScopedRepository` returns a closure with namespaces (`sessions`, `subjects`, `assessments`, `retentionCards`, `xpLedger`). Phase 1 adds `memoryFacts`.
- `packages/schemas/src/learning-profiles.ts` — `deleteMemoryItemSchema` (233-244), `strengthEntrySchema` (84-89), `struggleEntrySchema` (92-99), `interestEntrySchema` (36-39), `sessionAnalysisOutputSchema` (186-230).
- `apps/api/drizzle/` — last migration `0054_session_summary_retention.sql`. Next is `0055_*.sql`. Migrations are **generated** by `drizzle-kit generate`, not hand-written; rollback notes live in `*.rollback.md` companion files (e.g. `0053_topic_notes_session_idx.rollback.md`).
- `apps/api/src/inngest/functions/session-completed.ts:150-` — calls `applyAnalysis` after `analyzeSessionTranscript`.
- Memory-injection prompt sites the parity gate must cover (eval-llm flows): `exchanges`, `session-recap`, `session-analysis`, `quiz-vocabulary`, `quiz-guess-who`, `quiz-capitals`, `probes`, `interview`, `interview-orphan`, `filing-pre-session`, `dictation-generate`, `dictation-prepare-homework`, `dictation-review` (13 flows in `apps/api/eval-llm/flows/`). The corresponding runtime call sites all funnel through `buildMemoryBlock` in `apps/api/src/services/session/session-exchange.ts:835-857` and the parent-facing `apps/api/src/services/curated-memory.ts:44-`.
- Break-test pattern: `apps/api/src/routes/learner-profile.test.ts` cross-family IDOR test (PARENT_PROFILE_ID / OWN_CHILD_PROFILE_ID / OTHER_FAMILY_CHILD_ID).
- Integration tests live in `tests/integration/*.integration.test.ts`. **Pre-commit hook does NOT run them**; run manually for any DB / auth / Inngest change.
- **Existing integration harness:** `tests/integration/api-setup.ts` plus `tests/integration/helpers.ts`. Helper modules `setupTestDb` and `seedLearningProfile` **do not exist today** — Task 0 below adds them under `tests/integration/helpers/memory-facts.ts` so every later task can import them. Match the existing connection-bootstrap pattern used in `tests/integration/inngest-quota-reset.integration.test.ts`.
- **Schema fields verified** (`packages/database/src/schema/learning-profiles.ts:14-66`): `memoryConsentStatus` defaults to `'pending'` (not `'granted'`), so a freshly seeded profile renders an empty memory snapshot until consent is set in fixtures. `memoryCollectionEnabled` defaults to `false` — write-side gate (see Task 9 step 3 below). `memoryEnabled` and `memoryInjectionEnabled` default `true`.
- **Schema contract** (`packages/schemas/src/learning-profiles.ts`): `interestsArraySchema` (47-55) carries the legacy `string[]` → `InterestEntry[]` preprocessor. Backfill MUST parse interests via this preprocessor, not via `interestEntrySchema` directly, or every legacy string row is dropped as malformed. `sessionAnalysisOutputSchema.strengths[i]` is `{ topic, subject, source }` — NO `confidence` field; `mergeStrengths` assigns `'medium'` for new entries.

## File Structure

**New files**
- `packages/database/src/schema/_pgvector.ts` — extract `vector` customType + `VECTOR_DIM = 1024` constant. Exports `vector` and `VECTOR_DIM`.
- `packages/database/src/schema/memory-facts.ts` — `memoryFacts` table. Self-FK on `supersededBy` declared via Drizzle's table-level `foreignKey()` builder (NOT raw SQL).
- `apps/api/src/services/memory/memory-facts.ts` — service: `readMemorySnapshotFromFacts(scoped, profile)`, `replaceActiveMemoryFactsForProfile(tx, profileId, projection)` (delete-active + insert), `writeMemoryFactsForAnalysis(tx, profileId, mergedState)`, `writeMemoryFactsForDeletion(tx, profileId, mergedState)`. **Single source of truth for memory-fact reads/writes** — no other module touches `memory_facts` directly. The write helpers consume the **already-merged** JSONB-shaped state produced by `buildAnalysisUpdates` / `buildDeleteMemoryItemUpdates`, so `memory_facts` cannot diverge from JSONB by construction.
- `apps/api/src/services/memory/memory-facts.test.ts` — unit tests.
- `apps/api/src/services/memory/backfill-mapping.ts` — pure functions that take the **stored entry shape** (`StrengthEntry`, `StruggleEntry`, `InterestEntry`, comm-note string, suppressed string) and return a `MemoryFactInsert`. Used both by the backfill function and by `replaceActiveMemoryFactsForProfile`. `MemoryFactInsert` type also lives here.
- `apps/api/src/services/memory/backfill-mapping.test.ts`
- `apps/api/src/inngest/functions/memory-facts-backfill.ts` — one-shot Inngest function `memory-facts-backfill`. Idempotency: skips profiles where `learning_profiles.memory_facts_backfilled_at IS NOT NULL` (marker column added in 0055).
- `apps/api/src/inngest/functions/memory-facts-backfill.test.ts`
- `tests/integration/helpers/memory-facts.ts` — `setupTestDb()`, `seedLearningProfile(db, fixture)`, `runInngestFunction(fn, event)` matching the existing harness shape (see `tests/integration/inngest-quota-reset.integration.test.ts`). Created in Task 0 so subsequent tasks can import it.
- `tests/integration/memory-facts-dual-write.integration.test.ts` — transaction atomicity (real failure injection via module-level spy on `writeMemoryFactsForAnalysis`), concurrent-write race, account-deletion cascade, write-consent gate, write-side `memory_facts_backfilled_at` marker after first dual-write.
- `tests/integration/memory-facts-backfill.integration.test.ts` — backfill against fixture profile.
- `tests/integration/memory-facts-parity.integration.test.ts` — set-equality + ordering for `readMemorySnapshotFromFacts` vs JSONB.
- `scripts/check-eval-llm-parity.ts` — per-section bullet-set parity script (Task 14). Replaces the looser ±2% length tolerance with hard char-delta and per-section normalization.
- `apps/api/drizzle/0055_memory_facts.sql` (generated; tag = `memory_facts` via `db:generate --name`)
- `apps/api/drizzle/0055_memory_facts.rollback.md`

**Modified files**
- `packages/database/src/schema/embeddings.ts` — import `vector` and `VECTOR_DIM` from `./_pgvector`.
- `packages/database/src/schema/index.ts` — export `memoryFacts`.
- `packages/database/src/schema/learning-profiles.ts` — add `memoryFactsBackfilledAt: timestamp('memory_facts_backfilled_at', { withTimezone: true })` (nullable). Phase-1 marker: backfill stamps this once per profile; dual-write stamps it lazily on first analysis after the dual-write code ships. Lets the backfill skip already-migrated profiles deterministically.
- `packages/database/src/repository.ts` — add `memoryFacts` namespace to `createScopedRepository`.
- `apps/api/src/config.ts` + `apps/api/src/config.test.ts` — add `MEMORY_FACTS_READ_ENABLED: boolean` (default `false`).
- `apps/api/src/services/learner-profile.ts` — `applyAnalysis` rewritten to `db.transaction(...)` with `SELECT ... FOR UPDATE`; the existing `buildAnalysisUpdates` keeps producing the merged JSONB shape; the new `writeMemoryFactsForAnalysis` consumes that merged shape and replays it onto `memory_facts` (delete-active + insert). `deleteMemoryItem` (positional signature unchanged) wraps in `db.transaction` and calls `writeMemoryFactsForDeletion` with the merged result of `buildDeleteMemoryItemUpdates`. Adds `getOrCreateLearningProfileTx(tx, profileId)` for the no-profile-yet path. `updateWithRetry` and the retry block (1219-1240) deleted (verify no other callers via `pnpm exec rg "updateWithRetry" apps/ packages/` first). `buildMemoryBlock` stays synchronous; the flag branch lives in callers (see Task 13).
- `apps/api/src/services/session/session-exchange.ts`, `apps/api/src/services/curated-memory.ts` — at the call site that loads the profile for `buildMemoryBlock`, branch on the flag: if `MEMORY_FACTS_READ_ENABLED`, await `readMemorySnapshotFromFacts(scoped, profile)` and pass the resulting snapshot fields onto the `MemoryBlockProfile` argument (overriding `profile.strengths`/`struggles`/etc.). If off, pass `profile` as today.
- `apps/api/src/inngest/index.ts` — register `memoryFactsBackfill`.

**Branch policy:** continue on the current `retention` branch unless the user creates a new branch. Per memory `feedback_never_switch_branch.md`, do NOT switch branches without an explicit ask. Commit early and push after every commit (`feedback` rule). Use `/commit` for every commit (CLAUDE.md non-negotiable).

---

## Task 0: Pre-flight — integration test helpers

**Why:** Subsequent tasks reference `setupTestDb`, `seedLearningProfile`, and `runInngestFunction` as if they exist. They don't (`tests/integration/helpers.ts` has neither). Add them now so every later task compiles. Match the bootstrap pattern used by `tests/integration/inngest-quota-reset.integration.test.ts` and the connection setup in `tests/integration/api-setup.ts`.

**Files:**
- Create: `tests/integration/helpers/memory-facts.ts`

- [ ] **Step 1: Read the existing harness**

Read `tests/integration/api-setup.ts` and `tests/integration/inngest-quota-reset.integration.test.ts`. Identify (a) how the test DB connection is constructed, (b) how a profile + learning_profile pair is seeded today (look for raw `db.insert(profiles)` + `db.insert(learningProfiles)` in any existing test), (c) how Inngest functions are invoked synchronously in tests. Keep notes — the helpers must use **the same** pattern, not a parallel one.

- [ ] **Step 2: Write the helper module**

```ts
// tests/integration/helpers/memory-facts.ts
import { createDatabase, type Database } from '@eduagent/database';
import { profiles, learningProfiles } from '@eduagent/database/schema';
import { generateUUIDv7 } from '@eduagent/database';

export async function setupTestDb(): Promise<{ db: Database; cleanup: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL must be set for integration tests');
  const db = createDatabase(url);
  // Match the existing harness's truncate / wipe strategy here.
  return {
    db,
    cleanup: async () => {
      // truncate or close as the existing harness does
    },
  };
}

export type LearningProfileFixture = {
  strengths?: unknown[];
  struggles?: unknown[];
  interests?: unknown[];
  communicationNotes?: unknown[];
  suppressedInferences?: unknown[];
  interestTimestamps?: Record<string, string>;
  /** Default 'granted' so consent-gated reads don't return empty by accident. */
  memoryConsentStatus?: 'pending' | 'granted' | 'declined';
  /** Default true. */
  memoryCollectionEnabled?: boolean;
};

export async function seedLearningProfile(
  db: Database,
  fixture: LearningProfileFixture = {}
): Promise<{ profileId: string; accountId: string }> {
  const profileId = generateUUIDv7();
  const accountId = generateUUIDv7();
  // 1. parent profile + account row (whatever shape the existing harness uses).
  await db.insert(profiles).values({ id: profileId, accountId, /* ...fill required fields */ });
  // 2. learning_profiles with overrides.
  await db.insert(learningProfiles).values({
    profileId,
    interests: fixture.interests ?? [],
    strengths: fixture.strengths ?? [],
    struggles: fixture.struggles ?? [],
    communicationNotes: fixture.communicationNotes ?? [],
    suppressedInferences: fixture.suppressedInferences ?? [],
    interestTimestamps: fixture.interestTimestamps ?? {},
    memoryConsentStatus: fixture.memoryConsentStatus ?? 'granted',
    memoryCollectionEnabled: fixture.memoryCollectionEnabled ?? true,
  });
  return { profileId, accountId };
}

/** Backfill a single profile in-test (used by the parity test). Mirrors the
 *  Inngest function's per-profile path without spinning up the full runner. */
export async function runBackfillForOneProfile(db: Database, profileId: string): Promise<void> {
  // implement against buildBackfillRowsForProfile + db.transaction, same as
  // the body of memoryFactsBackfill's inner loop.
  throw new Error('Implement against buildBackfillRowsForProfile');
}

/** Invoke an Inngest function in-process for tests. Match the pattern used by
 *  the existing inngest-quota-reset / inngest-trial-expiry tests. */
export async function runInngestFunction<T>(fn: T, event: { name: string; data: unknown }): Promise<unknown> {
  // Implementation here mirrors the existing helper used in
  // tests/integration/inngest-quota-reset.integration.test.ts. Do NOT reinvent.
  throw new Error('Implement against the existing inngest test invocation pattern');
}
```

The actual implementation must mirror existing patterns — not invent new ones. Treat this skeleton as the contract; the body is filled in from existing code.

- [ ] **Step 3: Verify by writing a smoke test that uses each helper**

Add a tiny `tests/integration/helpers/memory-facts.smoke.integration.test.ts` that calls `setupTestDb`, `seedLearningProfile`, then queries the row back. Run: `pnpm exec jest tests/integration/helpers/memory-facts.smoke.integration.test.ts`. Expected: PASS.

- [ ] **Step 4: Commit via `/commit`**

---

## Task 1: Extract `vector` customType to a shared module

**Why:** Phase 1 needs to declare a nullable `embedding` column on `memory_facts`. The spec forbids a second customType — it must share the dimension constant with `sessionEmbeddings`.

**Files:**
- Create: `packages/database/src/schema/_pgvector.ts`
- Modify: `packages/database/src/schema/embeddings.ts` (lines 1-19)

- [ ] **Step 1: Create the shared module**

```ts
// packages/database/src/schema/_pgvector.ts
import { customType } from 'drizzle-orm/pg-core';

/** Voyage AI voyage-3.5 embeddings: 1024 dimensions. Single source of truth for the dimension constant. */
export const VECTOR_DIM = 1024;

/** Custom pgvector type for Drizzle ORM. Apply `.notNull()` per-column when required. */
export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return `vector(${VECTOR_DIM})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value);
  },
});
```

- [ ] **Step 2: Switch `embeddings.ts` to import from the shared module**

Replace lines 1-19 of `packages/database/src/schema/embeddings.ts` with:

```ts
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';
import { learningSessions } from './sessions';
import { curriculumTopics } from './subjects';
import { generateUUIDv7 } from '../utils/uuid';
import { vector } from './_pgvector';
```

(Keep the `sessionEmbeddings` table definition below unchanged. The `.notNull()` on the embedding column stays.)

- [ ] **Step 3: Run typecheck + existing tests**

Run: `pnpm exec nx run database:typecheck && pnpm exec nx run database:test`
Expected: PASS — refactor preserves behavior.

- [ ] **Step 4: Commit via `/commit`**

Use the `/commit` skill. Suggested message: `refactor(db): extract pgvector customType to shared module`.

---

## Task 2: Define the `memory_facts` schema

**Why:** Single migration up front avoids three migrations. Phase 2/3 columns are nullable so they cost nothing in Phase 1.

**Files:**
- Create: `packages/database/src/schema/memory-facts.ts`
- Create: `packages/database/src/schema/memory-facts.test.ts`
- Modify: `packages/database/src/schema/index.ts`

- [ ] **Step 1: Write the failing schema-shape test**

```ts
// packages/database/src/schema/memory-facts.test.ts
import { describe, it, expect } from '@jest/globals';
import { memoryFacts } from './memory-facts';
import { learningProfiles } from './learning-profiles';

describe('memoryFacts schema', () => {
  it('declares all Phase 1 + Phase 2 + Phase 3 columns', () => {
    const cols = Object.keys((memoryFacts as unknown as { _: { columns: Record<string, unknown> } })._.columns);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'profileId',
        'category',
        'text',
        'textNormalized',
        'metadata',
        'sourceSessionIds',
        'sourceEventIds',
        'observedAt',
        'supersededBy',
        'supersededAt',
        'embedding',
        'confidence',
        'createdAt',
        'updatedAt',
      ])
    );
  });

  it('declares memoryFactsBackfilledAt on learning_profiles', () => {
    const cols = Object.keys((learningProfiles as unknown as { _: { columns: Record<string, unknown> } })._.columns);
    expect(cols).toContain('memoryFactsBackfilledAt');
  });
});
```

- [ ] **Step 2: Run the test, expect it to fail**

Run: `pnpm exec jest packages/database/src/schema/memory-facts.test.ts`
Expected: FAIL — `memory-facts.ts` does not exist.

- [ ] **Step 3: Write `memory-facts.ts`**

```ts
// packages/database/src/schema/memory-facts.ts
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';
import { vector } from './_pgvector';
import { generateUUIDv7 } from '../utils/uuid';

export const MEMORY_FACT_CATEGORIES = [
  'strength',
  'struggle',
  'interest',
  'communication_note',
  'suppressed',
] as const;

export type MemoryFactCategory = (typeof MEMORY_FACT_CATEGORIES)[number] | string;

export type MemoryFactConfidence = 'low' | 'medium' | 'high';

export const memoryFacts = pgTable(
  'memory_facts',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    text: text('text').notNull(),
    textNormalized: text('text_normalized').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    sourceSessionIds: uuid('source_session_ids').array().notNull().default(sql`ARRAY[]::uuid[]`),
    sourceEventIds: uuid('source_event_ids').array().notNull().default(sql`ARRAY[]::uuid[]`),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    supersededBy: uuid('superseded_by'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    embedding: vector('embedding'),
    confidence: text('confidence', { enum: ['low', 'medium', 'high'] })
      .notNull()
      .default('medium'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Self-FK on supersededBy via Drizzle's table-level builder. This is
    // explicitly supported for self-references and avoids the forward-decl
    // cycle that the column-level `.references()` form runs into. drizzle-kit
    // emits the constraint into the generated migration; future regenerations
    // will not silently DROP it (which a hand-added SQL constraint would).
    foreignKey({
      name: 'memory_facts_superseded_by_fkey',
      columns: [table.supersededBy],
      foreignColumns: [table.id],
    }),
    index('memory_facts_profile_category_idx').on(table.profileId, table.category),
    index('memory_facts_profile_created_idx').on(table.profileId, table.createdAt),
    index('memory_facts_embedding_hnsw_idx')
      .using('hnsw', table.embedding.op('vector_cosine_ops'))
      .where(sql`${table.supersededBy} IS NULL`),
    index('memory_facts_active_idx')
      .on(table.profileId, table.category)
      .where(sql`${table.supersededBy} IS NULL`),
    index('memory_facts_profile_text_normalized_idx').on(
      table.profileId,
      table.textNormalized
    ),
    // Partial UNIQUE — guarantees no duplicate active rows for the same
    // (profile, category, subject, normalized text). Backfill replays and
    // re-runs of applyAnalysis become idempotent at the DB layer.
    // Strengths use category='strength' + metadata.subject; struggles use
    // category='struggle' + metadata.subject + metadata.topic (text_normalized
    // captures the topic). Notes/interests/suppressed use empty subject.
    uniqueIndex('memory_facts_active_unique')
      .on(
        table.profileId,
        table.category,
        sql`COALESCE(${table.metadata}->>'subject', '')`,
        table.textNormalized
      )
      .where(sql`${table.supersededBy} IS NULL`),
  ]
);
```

Also add to `packages/database/src/schema/learning-profiles.ts` (after `version`, before `createdAt`):

```ts
    memoryFactsBackfilledAt: timestamp('memory_facts_backfilled_at', {
      withTimezone: true,
    }),
```

This nullable column is the deterministic idempotency marker for the backfill function (Task 7) and the dual-write code (Task 9). Once stamped, the backfill skips the profile; until stamped, the dual-write code triggers a one-shot fill of the profile's prior JSONB state into `memory_facts` before applying the new analysis.

- [ ] **Step 4: Export from index, verify test passes**

Add to `packages/database/src/schema/index.ts`:

```ts
export * from './memory-facts';
```

Run: `pnpm exec jest packages/database/src/schema/memory-facts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit via `/commit`**

---

## Task 3: Generate migration `0055_memory_facts.sql` and write rollback notes

**Files:**
- Create (generated): `apps/api/drizzle/0055_memory_facts.sql`
- Create: `apps/api/drizzle/0055_memory_facts.rollback.md`

- [ ] **Step 1: Generate the migration with a stable tag**

Run: `pnpm run db:generate -- --name memory_facts`
Expected: `apps/api/drizzle/0055_memory_facts.sql` appears with the matching journal entry. The `--name` flag avoids drizzle-kit's `*_sticky_genesis.sql` autogen suffix and removes the need to hand-edit `_journal.json`. If your `db:generate` pnpm script does not forward extra args, run `pnpm exec drizzle-kit generate --name memory_facts --config apps/api/drizzle.config.ts` directly.

- [ ] **Step 2: Inspect the generated SQL**

Open `0055_memory_facts.sql`. Confirm:
- `CREATE TABLE "memory_facts" (...)` includes all columns from Task 2 step 3.
- `ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_superseded_by_fkey" FOREIGN KEY ("superseded_by") REFERENCES "memory_facts"("id")` is present (emitted from the `foreignKey()` builder).
- Three partial indexes with `WHERE "superseded_by" IS NULL`:
  - `memory_facts_embedding_hnsw_idx` (HNSW on `embedding`)
  - `memory_facts_active_idx` (B-tree on `(profile_id, category)`)
  - `memory_facts_active_unique` (UNIQUE on the partial expression `(profile_id, category, COALESCE(metadata->>'subject',''), text_normalized)`)
- An `ALTER TABLE "learning_profiles" ADD COLUMN "memory_facts_backfilled_at" timestamp with time zone` (nullable, no default) for the marker added in Task 2.

If any of these are missing, **fix the schema source**, not the SQL — drizzle-kit must regenerate the same SQL on a clean re-run, or future migrations drift. Common cause of a missing partial-index predicate: drizzle-orm version. If the version in `package.json` does not emit `.where(...)` predicates on indexes, upgrade `drizzle-orm` and `drizzle-kit` together to a version that does, and document the version bump in the commit.

- [ ] **Step 3: Apply migration to dev DB**

Run: `pnpm run db:push:dev`
Expected: success. Verify the table, indexes, and the new column via `psql` or `drizzle-kit studio`:
```
\d memory_facts
\di memory_facts*
\d+ learning_profiles | grep memory_facts_backfilled_at
```

- [ ] **Step 4: Write rollback notes**

```markdown
<!-- apps/api/drizzle/0055_memory_facts.rollback.md -->
# 0055 Rollback — memory_facts table + learning_profiles.memory_facts_backfilled_at

## Rollback

Rollback is possible during Phase 1 (dual-write soak): JSONB arrays on `learning_profiles` remain authoritative.

```sql
ALTER TABLE "learning_profiles" DROP COLUMN IF EXISTS "memory_facts_backfilled_at";
DROP TABLE IF EXISTS "memory_facts" CASCADE;
```

What is lost on rollback: every `memory_facts` row inserted since the migration, and every `memory_facts_backfilled_at` marker. JSONB arrays still hold the same data (dual-write invariant); rollback is non-destructive of user-visible mentor memory.

What is NOT rolled back: the `MEMORY_FACTS_READ_ENABLED` flag. Set it to `false` (or delete the env var) before dropping the table, otherwise reads will throw.

Order of operations on rollback:
1. Set `MEMORY_FACTS_READ_ENABLED=false` in Doppler (`stg`/`prod`).
2. Deploy.
3. Confirm no traffic hits the new helper (logs).
4. Run the DROPs above.
```

- [ ] **Step 5: Commit via `/commit`**

---

## Task 4: Add `memoryFacts` namespace to `createScopedRepository`

**Why:** All `memory_facts` reads must go through `createScopedRepository(profileId)` (CLAUDE.md non-negotiable). Adding a namespace concentrates the access pattern.

**Files:**
- Modify: `packages/database/src/repository.ts`
- Test: `packages/database/src/repository.memory-facts.test.ts`

- [ ] **Step 1: Write the failing scope-leak break test**

```ts
// packages/database/src/repository.memory-facts.test.ts
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createScopedRepository } from './repository';
import { memoryFacts } from './schema';
import { getTestDb, seedProfile, cleanupTestDb } from '../test-helpers';
// (test-helpers should already exist — re-use whatever pattern other repository tests use)

describe('createScopedRepository: memoryFacts', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let profileA: string;
  let profileB: string;

  beforeAll(async () => {
    db = await getTestDb();
    profileA = await seedProfile(db);
    profileB = await seedProfile(db);
    await db.insert(memoryFacts).values([
      {
        profileId: profileA,
        category: 'struggle',
        text: 'A-fact',
        textNormalized: 'a-fact',
        observedAt: new Date(),
      },
      {
        profileId: profileB,
        category: 'struggle',
        text: 'B-fact',
        textNormalized: 'b-fact',
        observedAt: new Date(),
      },
    ]);
  });

  afterAll(() => cleanupTestDb(db));

  it('findManyActive returns only the scoped profile rows', async () => {
    const scoped = createScopedRepository(db, profileA);
    const rows = await scoped.memoryFacts.findManyActive();
    expect(rows.map((r) => r.text)).toEqual(['A-fact']);
  });

  it('findManyActive cannot see other profile rows even with a hostile extraWhere', async () => {
    const { eq } = await import('drizzle-orm');
    const scoped = createScopedRepository(db, profileA);
    const rows = await scoped.memoryFacts.findManyActive(
      eq(memoryFacts.profileId, profileB) // hostile filter
    );
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm exec jest packages/database/src/repository.memory-facts.test.ts`
Expected: FAIL — `scoped.memoryFacts` is undefined.

- [ ] **Step 3: Add the namespace**

In `packages/database/src/repository.ts`, after the `xpLedger` namespace (or wherever the closure block ends), add:

```ts
import { memoryFacts } from './schema';
// ... inside the createScopedRepository return:
    memoryFacts: {
      async findManyActive(extraWhere?: SQL) {
        return db.query.memoryFacts.findMany({
          where: scopedWhere(
            memoryFacts,
            extraWhere ? and(extraWhere, sql`${memoryFacts.supersededBy} IS NULL`) : sql`${memoryFacts.supersededBy} IS NULL`
          ),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.memoryFacts.findFirst({
          where: scopedWhere(memoryFacts, extraWhere),
        });
      },
      async findManyByCategory(category: string, extraWhere?: SQL) {
        return db.query.memoryFacts.findMany({
          where: scopedWhere(
            memoryFacts,
            and(eq(memoryFacts.category, category), sql`${memoryFacts.supersededBy} IS NULL`, extraWhere)
          ),
        });
      },
    },
```

(Add `sql` to the existing `drizzle-orm` import if it's not already present.)

- [ ] **Step 4: Run tests, expect PASS**

Run: `pnpm exec jest packages/database/src/repository.memory-facts.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full repository test suite for regressions**

Run: `pnpm exec nx run database:test`
Expected: PASS.

- [ ] **Step 6: Commit via `/commit`**

---

## Task 5: Add `MEMORY_FACTS_READ_ENABLED` config flag

**Files:**
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/config.test.ts`

- [ ] **Step 1: Write the failing config test**

In `apps/api/src/config.test.ts`, add:

```ts
describe('MEMORY_FACTS_READ_ENABLED flag', () => {
  it('defaults to false when env var unset', () => {
    delete process.env.MEMORY_FACTS_READ_ENABLED;
    const cfg = loadConfig(); // or whatever the existing test pattern uses
    expect(cfg.MEMORY_FACTS_READ_ENABLED).toBe(false);
  });

  it('parses "true" / "1" as true', () => {
    process.env.MEMORY_FACTS_READ_ENABLED = 'true';
    expect(loadConfig().MEMORY_FACTS_READ_ENABLED).toBe(true);
    process.env.MEMORY_FACTS_READ_ENABLED = '1';
    expect(loadConfig().MEMORY_FACTS_READ_ENABLED).toBe(true);
  });
});
```

(Match the test's existing reset/setup style in this file. Re-use the existing boolean-coercion pattern used by other flags in `config.ts`.)

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm exec jest apps/api/src/config.test.ts`
Expected: FAIL — `MEMORY_FACTS_READ_ENABLED` is not on `Config`.

- [ ] **Step 3: Add the flag to `config.ts`**

Add to the schema (next to other boolean feature flags) using the same coercion helper. Default `false`. Type: `boolean`.

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm exec jest apps/api/src/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit via `/commit`**

---

## Task 6: Mapping pure functions (stored entries → memory_facts rows)

**Why:** Pure functions trivially testable. Used by both backfill (existing JSONB → memory_facts) AND by the dual-write path at runtime (the **already-merged** JSONB shape produced by `buildAnalysisUpdates` → memory_facts). `memory_facts` is therefore a structural projection of the JSONB state — there is no second merge path that could drift. Phase 1 contract: 1 active row per JSONB list element.

**Files:**
- Create: `apps/api/src/services/memory/backfill-mapping.ts`
- Create: `apps/api/src/services/memory/backfill-mapping.test.ts`

- [ ] **Step 1: Write failing tests for each category**

```ts
// apps/api/src/services/memory/backfill-mapping.test.ts
import { describe, it, expect } from '@jest/globals';
import {
  mapStrengthEntry,
  mapStruggleEntry,
  mapInterestEntry,
  mapCommunicationNote,
  mapSuppressedInference,
} from './backfill-mapping';

const PROFILE = 'p1';
const FALLBACK_AT = new Date('2026-01-01T00:00:00Z');

describe('backfill-mapping', () => {
  it('mapStrengthEntry: renders text, preserves metadata, uses fallback observedAt', () => {
    const out = mapStrengthEntry(
      { subject: 'Math', topics: ['fractions', 'decimals'], confidence: 'high', source: 'inferred' },
      PROFILE,
      FALLBACK_AT
    );
    expect(out).toEqual({
      profileId: PROFILE,
      category: 'strength',
      text: 'Math: fractions, decimals (high)',
      textNormalized: 'math: fractions, decimals (high)',
      metadata: { subject: 'Math', topics: ['fractions', 'decimals'], source: 'inferred' },
      observedAt: FALLBACK_AT,
      confidence: 'high',
    });
  });

  it('mapStruggleEntry: uses entry.lastSeen as observedAt', () => {
    const lastSeen = new Date('2026-04-15T10:00:00Z');
    const out = mapStruggleEntry(
      { subject: 'Math', topic: 'fractions', lastSeen: lastSeen.toISOString(), attempts: 3, confidence: 'medium', source: 'inferred' },
      PROFILE,
      FALLBACK_AT
    );
    expect(out).toMatchObject({
      category: 'struggle',
      text: 'Math: fractions (medium, attempts 3)',
      textNormalized: 'math: fractions (medium, attempts 3)',
      observedAt: lastSeen,
      confidence: 'medium',
    });
    expect(out.metadata).toEqual({ subject: 'Math', topic: 'fractions', attempts: 3, source: 'inferred' });
  });

  it('mapStruggleEntry: omits subject prefix when subject is null', () => {
    const out = mapStruggleEntry(
      { subject: null, topic: 'fractions', lastSeen: new Date().toISOString(), attempts: 1, confidence: 'low' },
      PROFILE,
      FALLBACK_AT
    );
    expect(out.text).toBe('fractions (low, attempts 1)');
  });

  it('mapInterestEntry: uses interestTimestamps[label] when present', () => {
    const ts = new Date('2026-03-01T00:00:00Z');
    const out = mapInterestEntry(
      { label: 'soccer', context: 'free_time' },
      PROFILE,
      FALLBACK_AT,
      { soccer: ts.toISOString() }
    );
    expect(out).toEqual({
      profileId: PROFILE,
      category: 'interest',
      text: 'soccer',
      textNormalized: 'soccer',
      metadata: { context: 'free_time' },
      observedAt: ts,
      confidence: 'medium',
    });
  });

  it('mapInterestEntry: falls back to fallbackAt when label not in timestamps', () => {
    const out = mapInterestEntry(
      { label: 'soccer', context: 'free_time' },
      PROFILE,
      FALLBACK_AT,
      {}
    );
    expect(out.observedAt).toEqual(FALLBACK_AT);
  });

  it('mapCommunicationNote: simple string passthrough', () => {
    const out = mapCommunicationNote('prefers analogies', PROFILE, FALLBACK_AT);
    expect(out).toEqual({
      profileId: PROFILE,
      category: 'communication_note',
      text: 'prefers analogies',
      textNormalized: 'prefers analogies',
      metadata: {},
      observedAt: FALLBACK_AT,
      confidence: 'medium',
    });
  });

  it('mapSuppressedInference: tags with originCategory unknown by default', () => {
    const out = mapSuppressedInference('hates cats', PROFILE, FALLBACK_AT);
    expect(out).toEqual({
      profileId: PROFILE,
      category: 'suppressed',
      text: 'hates cats',
      textNormalized: 'hates cats',
      metadata: { originCategory: 'unknown' },
      observedAt: FALLBACK_AT,
      confidence: 'medium',
    });
  });

  it('textNormalized lowercases and collapses whitespace identically to sameNormalized', () => {
    const out = mapCommunicationNote('  Likes   Maps ', PROFILE, FALLBACK_AT);
    expect(out.textNormalized).toBe('likes maps');
  });
});
```

- [ ] **Step 2: Run, expect FAIL (file doesn't exist)**

Run: `pnpm exec jest apps/api/src/services/memory/backfill-mapping.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the mappers**

```ts
// apps/api/src/services/memory/backfill-mapping.ts
import type {
  StrengthEntry,
  StruggleEntry,
  InterestEntry,
} from '@eduagent/schemas';

export type MemoryFactInsert = {
  profileId: string;
  category: string;
  text: string;
  textNormalized: string;
  metadata: Record<string, unknown>;
  observedAt: Date;
  confidence: 'low' | 'medium' | 'high';
  sourceSessionIds?: string[];
  sourceEventIds?: string[];
  // Phase 2/3 columns — included as optional from day 1 so future code can
  // widen without changing the type.
  supersededBy?: string | null;
  supersededAt?: Date | null;
  embedding?: number[] | null;
};

/** Same fold as `sameNormalized` in `learner-profile.ts:138-143`.
 *  Lowercase + collapse whitespace runs to single space + trim. */
export function normalizeMemoryText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function mapStrengthEntry(
  entry: StrengthEntry,
  profileId: string,
  fallbackObservedAt: Date
): MemoryFactInsert {
  const text = `${entry.subject}: ${entry.topics.join(', ')} (${entry.confidence})`;
  return {
    profileId,
    category: 'strength',
    text,
    textNormalized: normalizeMemoryText(text),
    metadata: {
      subject: entry.subject,
      topics: entry.topics,
      ...(entry.source ? { source: entry.source } : {}),
    },
    observedAt: fallbackObservedAt,
    confidence: entry.confidence,
  };
}

export function mapStruggleEntry(
  entry: StruggleEntry,
  profileId: string,
  fallbackObservedAt: Date
): MemoryFactInsert {
  const text = `${entry.subject ? `${entry.subject}: ` : ''}${entry.topic} (${entry.confidence}, attempts ${entry.attempts})`;
  return {
    profileId,
    category: 'struggle',
    text,
    textNormalized: normalizeMemoryText(text),
    metadata: {
      subject: entry.subject,
      topic: entry.topic,
      attempts: entry.attempts,
      ...(entry.source ? { source: entry.source } : {}),
    },
    observedAt: entry.lastSeen ? new Date(entry.lastSeen) : fallbackObservedAt,
    confidence: entry.confidence,
  };
}

export function mapInterestEntry(
  entry: InterestEntry,
  profileId: string,
  fallbackObservedAt: Date,
  interestTimestamps: Record<string, string> | null | undefined
): MemoryFactInsert {
  const ts = interestTimestamps?.[entry.label];
  return {
    profileId,
    category: 'interest',
    text: entry.label,
    textNormalized: normalizeMemoryText(entry.label),
    metadata: { context: entry.context },
    observedAt: ts ? new Date(ts) : fallbackObservedAt,
    confidence: 'medium',
  };
}

export function mapCommunicationNote(
  note: string,
  profileId: string,
  fallbackObservedAt: Date
): MemoryFactInsert {
  return {
    profileId,
    category: 'communication_note',
    text: note,
    textNormalized: normalizeMemoryText(note),
    metadata: {},
    observedAt: fallbackObservedAt,
    confidence: 'medium',
  };
}

export function mapSuppressedInference(
  value: string,
  profileId: string,
  fallbackObservedAt: Date,
  originCategory: string = 'unknown'
): MemoryFactInsert {
  return {
    profileId,
    category: 'suppressed',
    text: value,
    textNormalized: normalizeMemoryText(value),
    metadata: { originCategory },
    observedAt: fallbackObservedAt,
    confidence: 'medium',
  };
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm exec jest apps/api/src/services/memory/backfill-mapping.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify `normalizeMemoryText` matches `sameNormalized`**

Open `apps/api/src/services/learner-profile.ts:138-143` and confirm `normalizeMemoryValue` does the same thing. If the existing helper is `lowercase + .trim() + .replace(/\s+/g, ' ')`, the two functions are equivalent. If they differ (e.g. existing one uses NFC normalization), align `normalizeMemoryText` to match exactly. Add a one-line comment in `backfill-mapping.ts` referencing `learner-profile.ts:138`.

- [ ] **Step 6: Commit via `/commit`**

---

## Task 7: Backfill Inngest one-shot function

**Why:** A long-running iteration over every `learning_profiles` row needs durable retries — Inngest gives us those for free. Idempotency uses the `learning_profiles.memory_facts_backfilled_at` marker (added in 0055), NOT a row-count probe — counts diverge once dual-write ships, the marker doesn't. Per-batch `step.run` (one step per 100 profiles), NOT per-profile dynamic step IDs which blow up Inngest's step memo.

**Files:**
- Create: `apps/api/src/inngest/functions/memory-facts-backfill.ts`
- Create: `apps/api/src/inngest/functions/memory-facts-backfill.test.ts`
- Modify: `apps/api/src/inngest/index.ts`

- [ ] **Step 1: Write the failing unit test for the per-profile mapper**

```ts
// apps/api/src/inngest/functions/memory-facts-backfill.test.ts
import { describe, it, expect } from '@jest/globals';
import { buildBackfillRowsForProfile } from './memory-facts-backfill';

describe('buildBackfillRowsForProfile', () => {
  it('expands every JSONB array entry into one row, with correct categories', () => {
    const profile = {
      profileId: 'p1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      strengths: [{ subject: 'Math', topics: ['fractions'], confidence: 'high' }],
      struggles: [{
        subject: 'Math',
        topic: 'long division',
        lastSeen: '2026-03-15T10:00:00Z',
        attempts: 2,
        confidence: 'medium',
      }],
      interests: [{ label: 'soccer', context: 'free_time' }],
      communicationNotes: ['prefers analogies'],
      suppressedInferences: ['ignored fact'],
      interestTimestamps: { soccer: '2026-02-10T00:00:00Z' },
    };
    const rows = buildBackfillRowsForProfile(profile);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.category).sort()).toEqual([
      'communication_note',
      'interest',
      'strength',
      'struggle',
      'suppressed',
    ]);
    const struggle = rows.find((r) => r.category === 'struggle')!;
    expect(struggle.observedAt).toEqual(new Date('2026-03-15T10:00:00Z'));
    const interest = rows.find((r) => r.category === 'interest')!;
    expect(interest.observedAt).toEqual(new Date('2026-02-10T00:00:00Z'));
  });

  it('drops entries with malformed shapes and emits a count, never throws', () => {
    const profile = {
      profileId: 'p1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      strengths: [{ subject: 'Math' /* missing topics, confidence */ } as unknown],
      struggles: [],
      interests: [],
      communicationNotes: [],
      suppressedInferences: [],
      interestTimestamps: {},
    };
    const result = buildBackfillRowsForProfile(profile, { collectMalformed: true });
    expect(result.rows).toEqual([]);
    expect(result.malformedCount).toBe(1);
  });

  it('accepts legacy interests as bare strings via interestsArraySchema preprocessor', () => {
    // Pre-BKT-C.2 rows store interests as ['soccer', 'space']; preprocessor
    // coerces to [{label, context: 'both'}]. Direct interestEntrySchema would
    // drop them — guard against regressing to that.
    const profile = {
      profileId: 'p1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      strengths: [],
      struggles: [],
      interests: ['soccer', 'space'] as unknown,
      communicationNotes: [],
      suppressedInferences: [],
      interestTimestamps: {},
    };
    const result = buildBackfillRowsForProfile(profile, { collectMalformed: true });
    expect(result.malformedCount).toBe(0);
    expect(result.rows.filter((r) => r.category === 'interest').map((r) => r.text).sort())
      .toEqual(['soccer', 'space']);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm exec jest apps/api/src/inngest/functions/memory-facts-backfill.test.ts`

- [ ] **Step 3: Implement `buildBackfillRowsForProfile` and the Inngest function**

```ts
// apps/api/src/inngest/functions/memory-facts-backfill.ts
import { inngest } from '../client';
import { logger } from '../../logger'; // match existing import path
import { learningProfiles, memoryFacts } from '@eduagent/database/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@eduagent/database';
import {
  mapStrengthEntry,
  mapStruggleEntry,
  mapInterestEntry,
  mapCommunicationNote,
  mapSuppressedInference,
  type MemoryFactInsert,
} from '../../services/memory/backfill-mapping';
import {
  strengthEntrySchema,
  struggleEntrySchema,
  interestsArraySchema, // NOT interestEntrySchema — preprocessor handles legacy string[] rows
} from '@eduagent/schemas';

type BackfillSource = {
  profileId: string;
  createdAt: Date;
  strengths: unknown[];
  struggles: unknown[];
  interests: unknown; // raw JSONB — interestsArraySchema preprocesses
  communicationNotes: unknown[];
  suppressedInferences: unknown[];
  interestTimestamps: Record<string, string>;
};

export function buildBackfillRowsForProfile(
  source: BackfillSource,
  options?: { collectMalformed?: boolean }
): MemoryFactInsert[] | { rows: MemoryFactInsert[]; malformedCount: number } {
  const rows: MemoryFactInsert[] = [];
  let malformed = 0;

  for (const raw of source.strengths) {
    const parsed = strengthEntrySchema.safeParse(raw);
    if (!parsed.success) { malformed++; continue; }
    rows.push(mapStrengthEntry(parsed.data, source.profileId, source.createdAt));
  }
  for (const raw of source.struggles) {
    const parsed = struggleEntrySchema.safeParse(raw);
    if (!parsed.success) { malformed++; continue; }
    rows.push(mapStruggleEntry(parsed.data, source.profileId, source.createdAt));
  }
  // BKT-C.2: interestsArraySchema preprocessor coerces legacy string[] rows
  // (`['soccer']` → `[{label:'soccer', context:'both'}]`) before validation.
  // Using interestEntrySchema directly here drops every legacy string row as
  // malformed — verified at packages/schemas/src/learning-profiles.ts:47-55.
  const interestsParsed = interestsArraySchema.safeParse(source.interests ?? []);
  if (!interestsParsed.success) {
    malformed++;
  } else {
    for (const entry of interestsParsed.data) {
      rows.push(mapInterestEntry(entry, source.profileId, source.createdAt, source.interestTimestamps));
    }
  }
  for (const raw of source.communicationNotes) {
    if (typeof raw !== 'string' || raw.trim() === '') { malformed++; continue; }
    rows.push(mapCommunicationNote(raw, source.profileId, source.createdAt));
  }
  for (const raw of source.suppressedInferences) {
    if (typeof raw !== 'string' || raw.trim() === '') { malformed++; continue; }
    rows.push(mapSuppressedInference(raw, source.profileId, source.createdAt));
  }

  return options?.collectMalformed ? { rows, malformedCount: malformed } : rows;
}

const BATCH_SIZE = 100;

export const memoryFactsBackfill = inngest.createFunction(
  { id: 'memory-facts-backfill', name: 'Backfill memory_facts from learning_profiles JSONB' },
  { event: 'admin/memory-facts-backfill.requested' },
  async ({ step }) => {
    const db = getDb();
    let totals = {
      totalProfiles: 0,
      totalFacts: 0,
      totalSkippedAlreadyMigrated: 0,
      totalMalformed: 0,
    };
    let batchIndex = 0;
    let lastProfileId: string | null = null;

    // One step per BATCH (not per profile). Avoids creating thousands of
    // dynamic step IDs per run, which Inngest memoizes by name and which
    // explodes the step memo and per-run state for any non-trivial profile
    // count. The whole batch — read, filter, project, insert, mark — is a
    // single atomic-from-Inngest's-perspective unit; Postgres-level atomicity
    // is per-profile (each tx writes its rows + sets the marker).
    while (true) {
      const stepResult = await step.run(`process-batch-${batchIndex}`, async () => {
        const batch = await db.query.learningProfiles.findMany({
          // Skip already-marked profiles deterministically (the marker, not
          // a row-count probe — counts diverge once dual-write ships).
          where: lastProfileId
            ? and(
                isNull(learningProfiles.memoryFactsBackfilledAt),
                sql`${learningProfiles.profileId} > ${lastProfileId}`
              )
            : isNull(learningProfiles.memoryFactsBackfilledAt),
          orderBy: (t, { asc }) => [asc(t.profileId)],
          limit: BATCH_SIZE,
        });
        if (batch.length === 0) {
          return { batch: [] as typeof batch, deltas: { profiles: 0, facts: 0, skipped: 0, malformed: 0 }, lastProfileId: null as string | null };
        }

        let profiles = 0;
        let facts = 0;
        let skipped = 0;
        let malformed = 0;

        // Per-profile atomic: insert facts + stamp marker in one tx.
        for (const profile of batch) {
          const result = buildBackfillRowsForProfile(
            {
              profileId: profile.profileId,
              createdAt: profile.createdAt ?? new Date(),
              strengths: (profile.strengths as unknown[]) ?? [],
              struggles: (profile.struggles as unknown[]) ?? [],
              interests: profile.interests, // pass raw — preprocessor handles
              communicationNotes: (profile.communicationNotes as unknown[]) ?? [],
              suppressedInferences: (profile.suppressedInferences as unknown[]) ?? [],
              interestTimestamps: (profile.interestTimestamps as Record<string, string>) ?? {},
            },
            { collectMalformed: true }
          ) as { rows: MemoryFactInsert[]; malformedCount: number };

          await db.transaction(async (tx) => {
            if (result.rows.length > 0) {
              // Partial UNIQUE index on (profile, category, subject, text_normalized)
              // makes ON CONFLICT DO NOTHING the right concurrency choice — if
              // dual-write raced ahead and inserted a row, we don't duplicate.
              await tx.insert(memoryFacts).values(result.rows).onConflictDoNothing();
            }
            await tx
              .update(learningProfiles)
              .set({ memoryFactsBackfilledAt: new Date() })
              .where(eq(learningProfiles.profileId, profile.profileId));
          });

          facts += result.rows.length;
          malformed += result.malformedCount;
          profiles++;
        }

        return {
          batch,
          deltas: { profiles, facts, skipped, malformed },
          lastProfileId: batch[batch.length - 1].profileId,
        };
      });

      if (stepResult.batch.length === 0) break;
      totals.totalProfiles += stepResult.deltas.profiles;
      totals.totalFacts += stepResult.deltas.facts;
      totals.totalSkippedAlreadyMigrated += stepResult.deltas.skipped;
      totals.totalMalformed += stepResult.deltas.malformed;
      lastProfileId = stepResult.lastProfileId;
      batchIndex++;
    }

    logger.info('[memory-facts-backfill] complete', {
      event: 'memory_facts.backfill.complete',
      ...totals,
      batches: batchIndex,
    });
    return { ...totals, batches: batchIndex };
  }
);
```

(If the Inngest setup uses a different DB-handle pattern in this repo — e.g. passing `db` via `event.data` or via context — match the established convention rather than `getDb()`.)

- [ ] **Step 4: Register the function**

In `apps/api/src/inngest/index.ts`, add:

```ts
import { memoryFactsBackfill } from './functions/memory-facts-backfill';
// ... add to the exported function array:
export const functions = [..., memoryFactsBackfill];
```

- [ ] **Step 5: Run unit tests, expect PASS**

Run: `pnpm exec jest apps/api/src/inngest/functions/memory-facts-backfill.test.ts`

- [ ] **Step 6: Write integration test for end-to-end backfill**

```ts
// tests/integration/memory-facts-backfill.integration.test.ts
import { describe, it, expect } from '@jest/globals';
import { setupTestDb, seedLearningProfile, runInngestFunction } from './helpers/memory-facts';
import { memoryFacts, learningProfiles } from '@eduagent/database/schema';
import { eq } from 'drizzle-orm';
import { memoryFactsBackfill } from '../../apps/api/src/inngest/functions/memory-facts-backfill';

describe('memory-facts-backfill (integration)', () => {
  it('expands every JSONB entry to one row, stamps the marker, and is idempotent via the marker', async () => {
    const { db } = await setupTestDb();
    const { profileId } = await seedLearningProfile(db, {
      strengths: [{ subject: 'Math', topics: ['fractions'], confidence: 'high' }],
      struggles: [{ subject: 'Math', topic: 'long div', lastSeen: '2026-03-15T10:00:00Z', attempts: 2, confidence: 'medium' }],
      interests: [{ label: 'soccer', context: 'free_time' }],
      communicationNotes: ['prefers analogies'],
      suppressedInferences: ['ignored'],
      interestTimestamps: { soccer: '2026-02-10T00:00:00Z' },
    });

    // Marker is null before the run.
    const before = await db.query.learningProfiles.findFirst({ where: eq(learningProfiles.profileId, profileId) });
    expect(before?.memoryFactsBackfilledAt).toBeNull();

    await runInngestFunction(memoryFactsBackfill, { name: 'admin/memory-facts-backfill.requested', data: {} });

    const rows = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId));
    expect(rows).toHaveLength(5);
    const after = await db.query.learningProfiles.findFirst({ where: eq(learningProfiles.profileId, profileId) });
    expect(after?.memoryFactsBackfilledAt).toBeInstanceOf(Date);
    const stampedAt = after!.memoryFactsBackfilledAt!.getTime();

    // Idempotency: second run does NOT duplicate AND does NOT bump the marker.
    await runInngestFunction(memoryFactsBackfill, { name: 'admin/memory-facts-backfill.requested', data: {} });
    const rowsAfter = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId));
    expect(rowsAfter).toHaveLength(5);
    const reread = await db.query.learningProfiles.findFirst({ where: eq(learningProfiles.profileId, profileId) });
    expect(reread!.memoryFactsBackfilledAt!.getTime()).toBe(stampedAt);
  });

  it('skips a profile that the dual-write code already marked', async () => {
    const { db } = await setupTestDb();
    const { profileId } = await seedLearningProfile(db, {
      strengths: [{ subject: 'Math', topics: ['fractions'], confidence: 'high' }],
    });
    // Simulate dual-write having written a row + marker before backfill ran.
    const preStamp = new Date('2026-04-01T00:00:00Z');
    await db.update(learningProfiles)
      .set({ memoryFactsBackfilledAt: preStamp })
      .where(eq(learningProfiles.profileId, profileId));
    await db.insert(memoryFacts).values({
      profileId,
      category: 'strength',
      text: 'Math: fractions (high)',
      textNormalized: 'math: fractions (high)',
      metadata: { subject: 'Math', topics: ['fractions'] },
      observedAt: preStamp,
      confidence: 'high',
    });

    await runInngestFunction(memoryFactsBackfill, { name: 'admin/memory-facts-backfill.requested', data: {} });

    // Backfill must skip — only the dual-write row remains, marker not bumped.
    const rows = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId));
    expect(rows).toHaveLength(1);
    const reread = await db.query.learningProfiles.findFirst({ where: eq(learningProfiles.profileId, profileId) });
    expect(reread!.memoryFactsBackfilledAt!.getTime()).toBe(preStamp.getTime());
  });
});
```

- [ ] **Step 7: Run integration test, expect PASS**

Run: `pnpm exec jest tests/integration/memory-facts-backfill.integration.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit via `/commit`**

---

## Task 8: Single-source-of-truth memory service module

**Why:** Every read and dual-write of `memory_facts` goes through this module. No other file imports `memoryFacts` directly (except the schema/repository scaffolding). This makes the consent gate, the scoped-repo enforcement, and the dual-write transaction discipline auditable.

**Phase 1 contract (load-bearing):** `memory_facts` is a **structural projection of the merged JSONB state**, not a parallel merge path. Writes consume the merged JSONB shape produced by the existing `buildAnalysisUpdates` / `buildDeleteMemoryItemUpdates` (after `mergeStruggles` / `mergeStrengths` / `mergeInterests` / `archiveStaleStruggles` / `resolveStruggle` have run) and replay it as `memory_facts` rows via DELETE-active-then-INSERT inside the caller's transaction. This guarantees parity by construction: the only way `memory_facts` can be wrong is if the projection itself is wrong, which is unit-tested.

**Files:**
- Create: `apps/api/src/services/memory/memory-facts.ts`
- Create: `apps/api/src/services/memory/memory-facts.test.ts`

- [ ] **Step 1: Write failing tests for `readMemorySnapshot`**

```ts
// apps/api/src/services/memory/memory-facts.test.ts
import { describe, it, expect } from '@jest/globals';
import { readMemorySnapshotFromFacts, projectAnalysisToInserts } from './memory-facts';
import type { LearningProfileRow } from '@eduagent/database';

describe('readMemorySnapshotFromFacts', () => {
  function profile(overrides: Partial<LearningProfileRow> = {}): LearningProfileRow {
    return {
      profileId: 'p1',
      memoryEnabled: true,
      memoryConsentStatus: 'granted',
      memoryInjectionEnabled: true,
      // ... other fields zero-valued
      ...overrides,
    } as LearningProfileRow;
  }

  it('returns empty arrays when memoryEnabled=false', async () => {
    const scoped = makeFakeScopedRepo([{ category: 'struggle', text: 'x', textNormalized: 'x', metadata: {}, observedAt: new Date(), confidence: 'medium' }]);
    const out = await readMemorySnapshotFromFacts(scoped, profile({ memoryEnabled: false }));
    expect(out.strengths).toEqual([]);
    expect(out.struggles).toEqual([]);
    expect(out.interests).toEqual([]);
    expect(out.communicationNotes).toEqual([]);
    expect(out.suppressedInferences).toEqual([]);
  });

  it('returns empty arrays when memoryInjectionEnabled=false', async () => {
    const scoped = makeFakeScopedRepo([{ category: 'struggle', text: 'x', textNormalized: 'x', metadata: {}, observedAt: new Date(), confidence: 'medium' }]);
    const out = await readMemorySnapshotFromFacts(scoped, profile({ memoryInjectionEnabled: false }));
    expect(out.struggles).toEqual([]);
  });

  it('partitions rows by category and reconstructs JSONB-shaped output', async () => {
    const rows = [
      { category: 'strength', text: 'Math: fractions (high)', textNormalized: '...', metadata: { subject: 'Math', topics: ['fractions'] }, observedAt: new Date('2026-04-01'), confidence: 'high' },
      { category: 'struggle', text: 'Math: long div', textNormalized: '...', metadata: { subject: 'Math', topic: 'long div', attempts: 2 }, observedAt: new Date('2026-03-01'), confidence: 'medium' },
      { category: 'interest', text: 'soccer', textNormalized: 'soccer', metadata: { context: 'free_time' }, observedAt: new Date('2026-02-01'), confidence: 'medium' },
      { category: 'communication_note', text: 'prefers analogies', textNormalized: '...', metadata: {}, observedAt: new Date('2026-01-01'), confidence: 'medium' },
      { category: 'suppressed', text: 'ignored', textNormalized: 'ignored', metadata: { originCategory: 'unknown' }, observedAt: new Date('2026-01-01'), confidence: 'medium' },
    ];
    const scoped = makeFakeScopedRepo(rows);
    const out = await readMemorySnapshotFromFacts(scoped, profile());
    expect(out.strengths).toEqual([{ subject: 'Math', topics: ['fractions'], confidence: 'high' }]);
    expect(out.struggles).toMatchObject([{ subject: 'Math', topic: 'long div', confidence: 'medium', attempts: 2 }]);
    expect(out.interests).toEqual([{ label: 'soccer', context: 'free_time' }]);
    expect(out.communicationNotes).toEqual(['prefers analogies']);
    expect(out.suppressedInferences).toEqual(['ignored']);
  });

  it('orders each category list by observedAt descending (recency parity)', async () => {
    const rows = [
      { category: 'communication_note', text: 'older', textNormalized: 'older', metadata: {}, observedAt: new Date('2026-01-01'), confidence: 'medium' },
      { category: 'communication_note', text: 'newer', textNormalized: 'newer', metadata: {}, observedAt: new Date('2026-04-01'), confidence: 'medium' },
    ];
    const scoped = makeFakeScopedRepo(rows);
    const out = await readMemorySnapshotFromFacts(scoped, profile());
    expect(out.communicationNotes).toEqual(['newer', 'older']);
  });
});

function makeFakeScopedRepo(rows: unknown[]) {
  return {
    profileId: 'p1',
    memoryFacts: { findManyActive: async () => rows },
  } as unknown as Parameters<typeof readMemorySnapshotFromFacts>[0];
}
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm exec jest apps/api/src/services/memory/memory-facts.test.ts`

- [ ] **Step 3: Implement the read helper, the projector, and the dual-write helpers**

```ts
// apps/api/src/services/memory/memory-facts.ts
import type { createScopedRepository } from '@eduagent/database';
import type { LearningProfileRow, Database } from '@eduagent/database';
import type {
  StrengthEntry,
  StruggleEntry,
  InterestEntry,
} from '@eduagent/schemas';
import { memoryFacts } from '@eduagent/database/schema';
import { eq, and, isNull } from 'drizzle-orm';
import {
  mapStrengthEntry,
  mapStruggleEntry,
  mapInterestEntry,
  mapCommunicationNote,
  mapSuppressedInference,
  type MemoryFactInsert,
} from './backfill-mapping';

type ScopedRepo = ReturnType<typeof createScopedRepository>;

/** Phase 1 read shape — identical to the JSONB-shaped fields on
 *  `learning_profiles`. Each list is reconstructed 1:1 from active
 *  `memory_facts` rows (no aggregation; rows are pre-merged by the write side). */
export type MemorySnapshot = {
  strengths: StrengthEntry[];
  struggles: StruggleEntry[];
  interests: InterestEntry[];
  communicationNotes: string[];
  suppressedInferences: string[];
  interestTimestamps: Record<string, string>;
};

/** The merged JSONB-shaped state that the existing `buildAnalysisUpdates` and
 *  `buildDeleteMemoryItemUpdates` produce. Phase 1 dual-write replays this
 *  shape onto `memory_facts` so the table is always a structural projection
 *  of JSONB — no parallel merge path that could drift. */
export type MergedMemoryState = {
  strengths: StrengthEntry[];
  struggles: StruggleEntry[];
  interests: InterestEntry[];
  communicationNotes: string[];
  suppressedInferences: string[];
  interestTimestamps: Record<string, string>;
};

const EMPTY_SNAPSHOT: MemorySnapshot = {
  strengths: [],
  struggles: [],
  interests: [],
  communicationNotes: [],
  suppressedInferences: [],
  interestTimestamps: {},
};

function consentAllows(profile: Pick<LearningProfileRow, 'memoryEnabled' | 'memoryConsentStatus' | 'memoryInjectionEnabled'>): boolean {
  if (profile.memoryEnabled === false) return false;
  if (profile.memoryConsentStatus !== 'granted') return false;
  if (profile.memoryInjectionEnabled === false) return false;
  return true;
}

/** Read mentor memory in JSONB shape, sourced from `memory_facts`. Used behind
 *  `MEMORY_FACTS_READ_ENABLED`. No aggregation: rows are already merged at
 *  write time, so this is a partition-by-category projection. */
export async function readMemorySnapshotFromFacts(
  scoped: ScopedRepo,
  profile: Pick<LearningProfileRow, 'memoryEnabled' | 'memoryConsentStatus' | 'memoryInjectionEnabled'>
): Promise<MemorySnapshot> {
  if (!consentAllows(profile)) return EMPTY_SNAPSHOT;

  const rows = await scoped.memoryFacts.findManyActive();

  // JSONB array order is append-order. Rows arrive append-order from
  // `findManyActive` if the repo orders by createdAt asc (idiomatic). The
  // parity test asserts set-equality, not order-equality — but the read keeps
  // a deterministic order for stable LLM prompts.
  const out: MemorySnapshot = {
    strengths: [],
    struggles: [],
    interests: [],
    communicationNotes: [],
    suppressedInferences: [],
    interestTimestamps: {},
  };

  for (const r of rows) {
    switch (r.category) {
      case 'strength':
        out.strengths.push({
          subject: r.metadata.subject as string,
          topics: r.metadata.topics as string[],
          confidence: r.confidence,
          ...((r.metadata.source ? { source: r.metadata.source } : {}) as { source?: 'parent' | 'inferred' }),
        });
        break;
      case 'struggle':
        out.struggles.push({
          subject: (r.metadata.subject as string | null) ?? null,
          topic: r.metadata.topic as string,
          // lastSeen is stored on the entry itself in metadata; the row's
          // observedAt is informational only. The write side persists the
          // already-merged StruggleEntry.lastSeen — we project it back.
          lastSeen: (r.metadata.lastSeen as string | undefined) ?? r.observedAt.toISOString(),
          attempts: (r.metadata.attempts as number) ?? 1,
          confidence: r.confidence,
          ...((r.metadata.source ? { source: r.metadata.source } : {}) as { source?: 'parent' | 'inferred' }),
        });
        break;
      case 'interest':
        out.interests.push({ label: r.text, context: r.metadata.context as 'free_time' | 'school' | 'both' });
        // interestTimestamps mirrors the JSONB record exactly.
        if (r.metadata.timestamp) {
          out.interestTimestamps[r.text] = r.metadata.timestamp as string;
        } else {
          out.interestTimestamps[r.text] = r.observedAt.toISOString();
        }
        break;
      case 'communication_note':
        out.communicationNotes.push(r.text);
        break;
      case 'suppressed':
        out.suppressedInferences.push(r.text);
        break;
      default:
        break;
    }
  }
  return out;
}

/** Project the merged JSONB state onto the row set that should exist in
 *  memory_facts after the write commits. Used by both the dual-write path
 *  (Task 9 / Task 11) and the parity test (Task 14). Pure function. */
export function projectMergedStateToRows(
  state: MergedMemoryState,
  profileId: string,
  observedAt: Date
): MemoryFactInsert[] {
  const rows: MemoryFactInsert[] = [];
  for (const s of state.strengths) {
    rows.push(mapStrengthEntry(s, profileId, observedAt));
  }
  for (const st of state.struggles) {
    rows.push(mapStruggleEntry(st, profileId, observedAt));
  }
  for (const i of state.interests) {
    rows.push(mapInterestEntry(i, profileId, observedAt, state.interestTimestamps));
  }
  for (const c of state.communicationNotes) {
    rows.push(mapCommunicationNote(c, profileId, observedAt));
  }
  for (const v of state.suppressedInferences) {
    rows.push(mapSuppressedInference(v, profileId, observedAt));
  }
  return rows;
}

/** Replace all active memory_facts rows for a profile with the projected set.
 *  Caller must be inside a transaction holding the `learning_profiles` row
 *  lock (`SELECT ... FOR UPDATE`). The DELETE+INSERT pair is atomic relative
 *  to readers because the partial UNIQUE index covers active rows only. */
export async function replaceActiveMemoryFactsForProfile(
  tx: Database,
  profileId: string,
  rows: MemoryFactInsert[]
): Promise<void> {
  // 1. Soft-delete or hard-delete active rows? Phase 1: hard-delete (simpler).
  //    Phase 3 may switch to supersededAt soft-marks for audit; out of scope.
  await tx
    .delete(memoryFacts)
    .where(and(eq(memoryFacts.profileId, profileId), isNull(memoryFacts.supersededBy)));
  // 2. Insert the projected set.
  if (rows.length > 0) {
    await tx.insert(memoryFacts).values(rows);
  }
}

/** Dual-write entry point invoked by `applyAnalysis` after `buildAnalysisUpdates`
 *  has produced the merged JSONB shape. The merged state is projected onto
 *  rows and the active set is replaced atomically inside the caller's tx. */
export async function writeMemoryFactsForAnalysis(
  tx: Database,
  profileId: string,
  mergedState: MergedMemoryState,
  observedAt: Date
): Promise<void> {
  const rows = projectMergedStateToRows(mergedState, profileId, observedAt);
  await replaceActiveMemoryFactsForProfile(tx, profileId, rows);
}

/** Dual-write deletion: same projection-from-merged-state pattern. The caller
 *  has already run `buildDeleteMemoryItemUpdates`; we replay the result. */
export async function writeMemoryFactsForDeletion(
  tx: Database,
  profileId: string,
  mergedState: MergedMemoryState,
  observedAt: Date
): Promise<void> {
  const rows = projectMergedStateToRows(mergedState, profileId, observedAt);
  await replaceActiveMemoryFactsForProfile(tx, profileId, rows);
}
```

**Why DELETE-then-INSERT instead of UPSERT?** UPSERT requires picking a conflict target and applying per-column merge logic in SQL (e.g. `metadata = memory_facts.metadata || EXCLUDED.metadata` with custom paths for `attempts`, `topics[]`, `lastSeen`, etc.). That replicates the merge logic in two places (TypeScript and SQL) and creates the exact drift risk this redesign is meant to eliminate. DELETE-then-INSERT keeps merge logic in one place (the existing JSONB merge functions) and the partial UNIQUE index ensures concurrent writes can't introduce duplicates.

**Step 1 test re-statement.** Update the unit tests in this file to set `r.metadata.lastSeen`, `r.metadata.timestamp`, and `r.metadata.attempts` on the fake rows. The original test assumed the read derives those from `observedAt`; the new contract reads them from metadata (the write side stores the already-merged values there). The test continues to assert: empty on consent off, partition-by-category, ordering preserved.

Then add a test for `projectMergedStateToRows`:

```ts
describe('projectMergedStateToRows', () => {
  it('emits exactly one row per JSONB list element across all categories', () => {
    const state: MergedMemoryState = {
      strengths: [{ subject: 'Math', topics: ['fractions', 'decimals'], confidence: 'high' }],
      struggles: [{ subject: 'Math', topic: 'long div', lastSeen: '2026-04-01T00:00:00Z', attempts: 3, confidence: 'medium' }],
      interests: [{ label: 'soccer', context: 'free_time' }],
      communicationNotes: ['prefers analogies'],
      suppressedInferences: ['ignored'],
      interestTimestamps: { soccer: '2026-02-10T00:00:00Z' },
    };
    const rows = projectMergedStateToRows(state, 'p1', new Date('2026-05-01T00:00:00Z'));
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.category).sort()).toEqual([
      'communication_note', 'interest', 'strength', 'struggle', 'suppressed',
    ]);
  });
});
```

- [ ] **Step 4: Run unit tests, expect PASS**

Run: `pnpm exec jest apps/api/src/services/memory/memory-facts.test.ts`

- [ ] **Step 5: Commit via `/commit`**

---

## Task 9: Rewrite `applyAnalysis` to use `db.transaction` with `SELECT ... FOR UPDATE`

**Why:** The existing optimistic-version-locking loop (`updateWithRetry` retries on stale `version`) cannot wrap a second-table insert atomically. The dual-write requires a real transaction with row-level locking. The merge logic stays in `buildAnalysisUpdates`; we add a lock + a structural projection of the merged JSONB state onto `memory_facts` inside the same tx.

**Files:**
- Modify: `apps/api/src/services/learner-profile.ts` (lines 1157-1297, plus call sites of `updateWithRetry`)
- Create: `tests/integration/memory-facts-dual-write.integration.test.ts`

- [ ] **Step 1: Verify no external callers of `updateWithRetry`**

Run: `pnpm exec rg "updateWithRetry" apps/ packages/`
Expected: matches inside `apps/api/src/services/learner-profile.ts` only (the function definition and the two internal call sites in `applyAnalysis`). If any other file references it, stop and reassess — the function may need an exported async-tx variant or a different rewrite.

- [ ] **Step 2: Write the failing atomicity integration test (real failure injection, not `db.insert` mock)**

```ts
// tests/integration/memory-facts-dual-write.integration.test.ts
import { describe, it, expect, jest } from '@jest/globals';
import { setupTestDb, seedLearningProfile } from './helpers/memory-facts';
import { applyAnalysis } from '../../apps/api/src/services/learner-profile';
import { memoryFacts, learningProfiles } from '@eduagent/database/schema';
import { eq } from 'drizzle-orm';
// IMPORTANT: import the module so we can spy on its export. spying on `db.insert`
// does NOT intercept tx.insert (the tx callback receives a PgTransaction with
// its own bound methods — see packages/database/src/client.ts:78-84).
import * as memoryFactsModule from '../../apps/api/src/services/memory/memory-facts';

describe('applyAnalysis dual-write atomicity', () => {
  it('rolls back JSONB UPDATE when memory_facts write fails', async () => {
    const { db } = await setupTestDb();
    const { profileId } = await seedLearningProfile(db, { strengths: [], struggles: [] });

    // Force the dual-write path to throw by spying on the helper that runs
    // inside the transaction. This propagates through the tx callback and
    // triggers Postgres ROLLBACK — the only way to verify real atomicity.
    const spy = jest
      .spyOn(memoryFactsModule, 'writeMemoryFactsForAnalysis')
      .mockImplementationOnce(async () => {
        throw new Error('simulated memory_facts write failure');
      });

    await expect(
      applyAnalysis(db, profileId, {
        strengths: [{ subject: 'Math', topic: 'fractions' }],
        struggles: null,
        interests: null,
        communicationNotes: null,
        engagementLevel: null,
        confidence: 'high',
        explanationEffectiveness: null,
        resolvedTopics: null,
        urgencyDeadline: null,
      } as never, 'Math')
    ).rejects.toThrow('simulated memory_facts write failure');

    // Read via the same db (post-rollback) — JSONB must be unchanged.
    const profile = await db.query.learningProfiles.findFirst({ where: eq(learningProfiles.profileId, profileId) });
    expect(profile?.strengths).toEqual([]);
    const facts = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId));
    expect(facts).toEqual([]);

    spy.mockRestore();
  });

  it('persists both writes on success', async () => {
    const { db } = await setupTestDb();
    const { profileId } = await seedLearningProfile(db, { strengths: [], struggles: [] });

    await applyAnalysis(db, profileId, {
      strengths: [{ subject: 'Math', topic: 'fractions' }],
      struggles: null, interests: null, communicationNotes: null,
      engagementLevel: null, confidence: 'high',
      explanationEffectiveness: null, resolvedTopics: null, urgencyDeadline: null,
    } as never, 'Math');

    const profile = await db.query.learningProfiles.findFirst({ where: eq(learningProfiles.profileId, profileId) });
    expect((profile?.strengths as unknown[]).length).toBeGreaterThan(0);
    const facts = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId));
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.find((f) => f.category === 'strength')).toBeDefined();
  });

  it('respects write-side consent (memoryCollectionEnabled=false → no facts written)', async () => {
    const { db } = await setupTestDb();
    const { profileId } = await seedLearningProfile(db, {
      strengths: [], struggles: [], memoryCollectionEnabled: false,
    });

    await applyAnalysis(db, profileId, {
      strengths: [{ subject: 'Math', topic: 'fractions' }],
      struggles: null, interests: null, communicationNotes: null,
      engagementLevel: null, confidence: 'high',
      explanationEffectiveness: null, resolvedTopics: null, urgencyDeadline: null,
    } as never, 'Math');

    const facts = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId));
    expect(facts).toEqual([]);
    // Verify the legacy upstream consent gate is also honored (whichever code
    // path enforces collection — confirm the gate exists somewhere upstream
    // of this call, or add it inside applyAnalysis. See Step 3 below.)
  });
});
```

- [ ] **Step 3: Verify or add the write-side consent gate**

Read `apps/api/src/inngest/functions/session-completed.ts:150+` (where `applyAnalysis` is called from). Confirm whether `learningProfile.memoryCollectionEnabled` is checked **before** `applyAnalysis` runs. If yes: document the upstream gate in the rewritten function's docstring. If no: add the gate as the first guard inside `applyAnalysis` (after the low-confidence return), reading `profile.memoryCollectionEnabled` from the locked row. The third test above PASSes only when the gate exists somewhere reachable from this entry point.

- [ ] **Step 4: Run, expect FAIL (atomicity not yet implemented)**

Run: `pnpm exec jest tests/integration/memory-facts-dual-write.integration.test.ts -t 'rolls back'`

- [ ] **Step 5: Add `getOrCreateLearningProfileTx` (transaction-aware variant)**

Add to `apps/api/src/services/learner-profile.ts`:

```ts
/** Tx-aware variant of getOrCreateLearningProfile. INSERT … ON CONFLICT DO
 *  NOTHING then SELECT … FOR UPDATE so the resulting row is locked when the
 *  caller proceeds. Avoids the TOCTOU race where the no-profile branch reads
 *  via tx, the row gets created by another tx, and the lock acquisition then
 *  sees a stale snapshot. */
async function getOrCreateLearningProfileTx(
  tx: PgTransaction<typeof db>,
  profileId: string
): Promise<LearningProfileRow> {
  await tx
    .insert(learningProfiles)
    .values({ profileId })
    .onConflictDoNothing({ target: learningProfiles.profileId });
  const [row] = await tx
    .select()
    .from(learningProfiles)
    .where(eq(learningProfiles.profileId, profileId))
    .for('update');
  if (!row) throw new Error(`Unable to lock learning profile for ${profileId}`);
  return row;
}
```

(Adjust the `PgTransaction` generic to match the project's type conventions — drizzle-orm's `PgTransaction<...>` or use `Parameters<Parameters<Database['transaction']>[0]>[0]`.)

- [ ] **Step 6: Rewrite `applyAnalysis`**

In `apps/api/src/services/learner-profile.ts`, replace lines 1186-1297 with:

```ts
export async function applyAnalysis(
  db: Database,
  profileId: string,
  analysis: SessionAnalysisOutput,
  subjectName: string | null,
  source: MemorySource = 'inferred',
  subjectId?: string | null
): Promise<ApplyAnalysisResult> {
  if (analysis.confidence === 'low') {
    logger.info('[learner-profile] Low-confidence analysis skipped', {
      event: 'learner_profile.analysis.low_confidence',
      profileId,
    });
    return { fieldsUpdated: [], notifications: [] };
  }

  const result = await db.transaction(async (tx) => {
    // Lock the row so concurrent applyAnalysis calls serialize. If the
    // profile doesn't exist yet, create it inside the same tx and re-lock.
    let [profile] = await tx
      .select()
      .from(learningProfiles)
      .where(eq(learningProfiles.profileId, profileId))
      .for('update');
    if (!profile) {
      profile = await getOrCreateLearningProfileTx(tx, profileId);
    }

    // Write-side consent gate. If upstream (session-completed) already gates
    // this, the check is redundant but harmless — keep it as defense-in-depth.
    if (profile.memoryCollectionEnabled === false) {
      return { fieldsUpdated: [] as string[], notifications: [] as StruggleNotification[], mergedProfile: null };
    }

    const { updates, fieldsUpdated, notifications } = buildAnalysisUpdates(profile, analysis, source, subjectName);

    if (Object.keys(updates).length === 0) {
      return { fieldsUpdated: [], notifications, mergedProfile: null };
    }

    // 1. JSONB UPDATE on learning_profiles (existing behavior, no version
    //    check needed under the lock — version still bumped for back-compat
    //    with anyone reading via the old optimistic path during the soak).
    await tx
      .update(learningProfiles)
      .set({ ...updates, version: sql`${learningProfiles.version} + 1`, updatedAt: new Date() })
      .where(eq(learningProfiles.profileId, profileId));

    // 2. Project the MERGED JSONB state onto memory_facts. The merged shape
    //    is { ...profile, ...updates } where updates has already had
    //    mergeStruggles/mergeStrengths/etc applied. Phase 1's parity guarantee
    //    is that memory_facts is a structural projection of this — no second
    //    merge path. See docs/plans/.../memory-facts.ts:projectMergedStateToRows.
    const mergedState = projectProfileToMergedState({ ...profile, ...updates });
    await writeMemoryFactsForAnalysis(
      tx as unknown as Database,
      profileId,
      mergedState,
      new Date()
    );

    // 3. Stamp the backfill marker if not already set, so the backfill
    //    function skips this profile (its memory_facts is now authoritative).
    if (!profile.memoryFactsBackfilledAt) {
      await tx
        .update(learningProfiles)
        .set({ memoryFactsBackfilledAt: new Date() })
        .where(eq(learningProfiles.profileId, profileId));
    }

    return { fieldsUpdated, notifications, mergedProfile: { ...profile, ...updates } };
  });

  // Urgency boost — outside the transaction (best-effort, identical to today's
  // lines 1262-1284).
  const subjectFilter = subjectId
    ? eq(subjects.id, subjectId)
    : subjectName
    ? eq(subjects.name, subjectName)
    : null;
  const finalFieldsUpdated = [...result.fieldsUpdated];
  if (analysis.urgencyDeadline && subjectFilter) {
    try {
      const boostUntil = new Date(Date.now() + analysis.urgencyDeadline.daysFromNow * 24 * 60 * 60 * 1000);
      await db
        .update(subjects)
        .set({ urgencyBoostUntil: boostUntil, urgencyBoostReason: analysis.urgencyDeadline.reason, updatedAt: new Date() })
        .where(and(eq(subjects.profileId, profileId), subjectFilter));
      finalFieldsUpdated.push('urgencyBoostUntil');
    } catch (err) {
      logger.warn('Failed to write urgency boost', {
        event: 'learner_profile.urgency_boost.failed', profileId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (result.notifications.length > 0) {
    logger.info('[learner-profile] Struggle notifications emitted', {
      event: 'learner_profile.struggle.notifications', profileId,
      notifications: result.notifications.map((n) => ({ type: n.type, topic: n.topic })),
    });
  }
  logger.info('[learner-profile] Analysis applied', {
    event: 'learner_profile.analysis.completed', profileId,
    fieldsUpdated: finalFieldsUpdated,
  });

  return { fieldsUpdated: finalFieldsUpdated, notifications: result.notifications };
}

/** Pull the JSONB-shaped memory state off a learning_profiles row. Used to
 *  feed `writeMemoryFactsForAnalysis` / `writeMemoryFactsForDeletion`. */
function projectProfileToMergedState(profile: LearningProfileRow): MergedMemoryState {
  return {
    strengths: (profile.strengths as StrengthEntry[]) ?? [],
    struggles: (profile.struggles as StruggleEntry[]) ?? [],
    interests: (profile.interests as InterestEntry[]) ?? [],
    communicationNotes: (profile.communicationNotes as string[]) ?? [],
    suppressedInferences: (profile.suppressedInferences as string[]) ?? [],
    interestTimestamps: (profile.interestTimestamps as Record<string, string>) ?? {},
  };
}
```

Imports added at top of file:
```ts
import {
  writeMemoryFactsForAnalysis,
  type MergedMemoryState,
} from './memory/memory-facts';
```

- [ ] **Step 7: Delete the now-unused `updateWithRetry` (lines 1157-1179)**

Step 1's grep already confirmed no external callers. Delete the function and the two retry blocks (1219-1240) inside the old `applyAnalysis`. The integration tests in step 8 catch any regression.

- [ ] **Step 8: Run integration tests, expect PASS**

Run: `pnpm exec jest tests/integration/memory-facts-dual-write.integration.test.ts`
Expected: PASS on all three atomicity tests.

- [ ] **Step 9: Run the full learner-profile unit suite for regressions**

Run: `pnpm exec jest apps/api/src/services/learner-profile.test.ts`
Expected: PASS. Some tests may need fixture tweaks if they relied on `updateWithRetry`'s exact signature. Update test fixtures to match current behavior — **never weaken assertions** (CLAUDE.md `feedback_never_loosen_tests_to_pass`).

- [ ] **Step 10: Commit via `/commit`**

---

## Task 10: Concurrent-write race test

**Why:** The `SELECT ... FOR UPDATE` lock is the load-bearing change. A direct test asserts no fact loss under contention.

**Files:**
- Modify: `tests/integration/memory-facts-dual-write.integration.test.ts`

- [ ] **Step 1: Add the failing concurrency test**

```ts
it('two concurrent applyAnalysis calls on the same profile both persist their facts', async () => {
  const { db } = await setupTestDb();
  const { profileId } = await seedLearningProfile(db, { strengths: [], struggles: [] });

  await Promise.all([
    applyAnalysis(db, profileId, { strengths: [{ subject: 'Math', topic: 'fractions' }], struggles: null, interests: null, communicationNotes: null, engagementLevel: null, confidence: 'high', explanationEffectiveness: null, resolvedTopics: null, urgencyDeadline: null } as never, 'Math'),
    applyAnalysis(db, profileId, { strengths: [{ subject: 'Math', topic: 'decimals' }], struggles: null, interests: null, communicationNotes: null, engagementLevel: null, confidence: 'high', explanationEffectiveness: null, resolvedTopics: null, urgencyDeadline: null } as never, 'Math'),
  ]);

  const profile = await db.query.learningProfiles.findFirst({ where: eq(learningProfiles.profileId, profileId) });
  const strengthsJsonb = profile?.strengths as Array<{ subject: string; topics: string[] }>;
  const allTopics = strengthsJsonb.flatMap((s) => s.topics).sort();
  expect(allTopics).toEqual(['decimals', 'fractions']);

  const facts = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId));
  const factTopics = facts.map((f) => (f.metadata as { topics?: string[] }).topics?.[0] ?? '').filter(Boolean).sort();
  expect(factTopics).toEqual(['decimals', 'fractions']);
});
```

- [ ] **Step 2: Run, expect PASS**

Run: `pnpm exec jest tests/integration/memory-facts-dual-write.integration.test.ts -t 'concurrent'`
Expected: PASS — `SELECT ... FOR UPDATE` serializes the writes. If FAIL: debug the lock logic; do **not** weaken the test (CLAUDE.md non-negotiable).

- [ ] **Step 3: Commit via `/commit`**

---

## Task 11: Extend `deleteMemoryItem` to dual-write under transaction

**Why:** Same dual-write contract as `applyAnalysis` — atomic JSONB update + structural projection onto `memory_facts` inside one tx.

**Critical:** Keep the **existing positional signature** `(db, profileId, accountId, category, value, suppress=false, subject?)` from `apps/api/src/services/learner-profile.ts:1299-1307`. Do NOT introduce an object-shaped `request` param — that would break every route handler caller (e.g. `apps/api/src/routes/learner-profile.ts`). The route layer already passes positionally.

**Files:**
- Modify: `apps/api/src/services/learner-profile.ts` (around `deleteMemoryItem` at line 1299)

- [ ] **Step 1: Write failing integration test (positional signature)**

```ts
// extend tests/integration/memory-facts-dual-write.integration.test.ts
import { deleteMemoryItem } from '../../apps/api/src/services/learner-profile';

it('deleteMemoryItem deletes from both stores atomically', async () => {
  const { db } = await setupTestDb();
  const { profileId, accountId } = await seedLearningProfile(db, {
    interests: [{ label: 'soccer', context: 'free_time' }],
  });
  // Pre-seed the corresponding memory_facts row (mirrors backfilled state).
  await db.insert(memoryFacts).values({
    profileId, category: 'interest', text: 'soccer', textNormalized: 'soccer',
    metadata: { context: 'free_time' }, observedAt: new Date(), confidence: 'medium',
  });

  await deleteMemoryItem(db, profileId, accountId, 'interests', 'soccer');

  const profile = await db.query.learningProfiles.findFirst({ where: eq(learningProfiles.profileId, profileId) });
  expect((profile?.interests as unknown[])).toEqual([]);
  const facts = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId));
  expect(facts).toEqual([]);
});

it('deleteMemoryItem with suppress=true creates a suppressed-category row', async () => {
  const { db } = await setupTestDb();
  const { profileId, accountId } = await seedLearningProfile(db, {
    interests: [{ label: 'soccer', context: 'free_time' }],
  });
  await db.insert(memoryFacts).values({
    profileId, category: 'interest', text: 'soccer', textNormalized: 'soccer',
    metadata: { context: 'free_time' }, observedAt: new Date(), confidence: 'medium',
  });

  await deleteMemoryItem(db, profileId, accountId, 'interests', 'soccer', true);

  const facts = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId));
  expect(facts).toHaveLength(1);
  expect(facts[0].category).toBe('suppressed');
  expect(facts[0].text).toBe('soccer');
});
```

(Note: `seedLearningProfile` should return `{ profileId, accountId }` per Task 0 helper contract. Update the helper signature in Task 0 if it currently returns just the profileId string.)

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Modify `deleteMemoryItem` — keep positional signature**

In `apps/api/src/services/learner-profile.ts` around line 1299, wrap the existing UPDATE in a `db.transaction` (signature unchanged):

```ts
export async function deleteMemoryItem(
  db: Database,
  profileId: string,
  accountId: string | undefined,
  category: string,
  value: string,
  suppress = false,
  subject?: string
): Promise<void> {
  await verifyProfileOwnership(db, profileId, accountId);

  await db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(learningProfiles)
      .where(eq(learningProfiles.profileId, profileId))
      .for('update');
    if (!profile) return;

    const updates = buildDeleteMemoryItemUpdates(profile, category, value, suppress, subject);
    if (!updates) return;

    await tx
      .update(learningProfiles)
      .set({ ...updates, version: sql`${learningProfiles.version} + 1`, updatedAt: new Date() })
      .where(eq(learningProfiles.profileId, profileId));

    // Project the merged result (post-delete, post-suppress) onto memory_facts
    // via the same delete-active-then-insert pattern as applyAnalysis. The
    // merged state lives in `{ ...profile, ...updates }`.
    const mergedState = projectProfileToMergedState({ ...profile, ...updates });
    await writeMemoryFactsForDeletion(
      tx as unknown as Database,
      profileId,
      mergedState,
      new Date()
    );

    if (!profile.memoryFactsBackfilledAt) {
      await tx
        .update(learningProfiles)
        .set({ memoryFactsBackfilledAt: new Date() })
        .where(eq(learningProfiles.profileId, profileId));
    }
  });
}
```

Imports added at top of file:
```ts
import { writeMemoryFactsForDeletion } from './memory/memory-facts';
```

(`projectProfileToMergedState` is the helper added in Task 9 step 6.)

- [ ] **Step 4: Run tests, expect PASS**

- [ ] **Step 5: Run the existing deleteMemoryItem unit tests**

Run: `pnpm exec jest apps/api/src/services/learner-profile.test.ts -t deleteMemoryItem`
Expected: PASS. If any test mocks `db.update` directly, update it to mock `db.transaction` — never weaken the assertion.

Also re-run the route-level tests to confirm the positional signature still satisfies callers:
Run: `pnpm exec jest apps/api/src/routes/learner-profile.test.ts`

- [ ] **Step 6: Commit via `/commit`**

---

## Task 12: Account-deletion cascade test

**Why:** The schema declares `onDelete: 'cascade'` on the `profileId` FK. Verify the cascade actually fires.

**Files:**
- Modify: `tests/integration/memory-facts-dual-write.integration.test.ts`

- [ ] **Step 1: Write failing test**

```ts
it('deleting a profile cascades to memory_facts', async () => {
  const { db } = await setupTestDb();
  const { profileId } = await seedLearningProfile(db, {});
  await db.insert(memoryFacts).values({
    profileId, category: 'interest', text: 'soccer', textNormalized: 'soccer',
    metadata: { context: 'free_time' }, observedAt: new Date(), confidence: 'medium',
  });
  expect((await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId))).length).toBe(1);

  await db.delete(profiles).where(eq(profiles.id, profileId));

  const facts = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId));
  expect(facts).toEqual([]);
});
```

- [ ] **Step 2: Run, expect PASS** (cascade is FK-defined; should already work)

- [ ] **Step 3: Commit via `/commit`**

---

## Task 13: Wire memory injection sites to the new helper behind the flag

**Why:** Phase 1 component 4 — flipping `MEMORY_FACTS_READ_ENABLED` swaps the read source atomically across the app.

**Critical constraint:** `buildMemoryBlock` (`apps/api/src/services/learner-profile.ts:808+`) is **synchronous** today and is called synchronously from `session-exchange.ts:835`, `curated-memory.ts:44`, and several unit tests. **Do NOT make it async** — that ripples through every call site. Instead, do the async memory load **upstream in each caller**, then construct a synthetic `MemoryBlockProfile` (the existing input shape) with the snapshot fields swapped in.

**Files:**
- Modify: `apps/api/src/services/session/session-exchange.ts` (around line 835 — caller of `buildMemoryBlock`)
- Modify: `apps/api/src/services/curated-memory.ts` (around line 44)
- Modify: `apps/api/src/services/learner-profile.ts` (`buildHumanReadableMemoryExport` if it reads any of the same fields)

- [ ] **Step 1: Add the async loader helper next to the memory service**

In `apps/api/src/services/memory/memory-facts.ts`, export:

```ts
import { config } from '../../config';
import { createScopedRepository, type Database } from '@eduagent/database';
import type { LearningProfileRow } from '@eduagent/database';

/** Resolves the memory snapshot for the caller. When the flag is OFF, returns
 *  the JSONB fields off the already-loaded profile (zero round trips). When ON,
 *  reads from memory_facts via the scoped repository.
 *
 *  Callers stay synchronous downstream by spreading the snapshot onto the
 *  MemoryBlockProfile they already build. */
export async function loadMemorySnapshot(
  db: Database,
  profile: LearningProfileRow
): Promise<MemorySnapshot> {
  if (config.MEMORY_FACTS_READ_ENABLED) {
    const scoped = createScopedRepository(db, profile.profileId);
    return readMemorySnapshotFromFacts(scoped, profile);
  }
  if (!profile.memoryEnabled || profile.memoryConsentStatus !== 'granted' || profile.memoryInjectionEnabled === false) {
    return {
      strengths: [], struggles: [], interests: [],
      communicationNotes: [], suppressedInferences: [],
      interestTimestamps: {},
    };
  }
  return {
    strengths: (profile.strengths as MemorySnapshot['strengths']) ?? [],
    struggles: (profile.struggles as MemorySnapshot['struggles']) ?? [],
    interests: (profile.interests as MemorySnapshot['interests']) ?? [],
    communicationNotes: (profile.communicationNotes as string[]) ?? [],
    suppressedInferences: (profile.suppressedInferences as string[]) ?? [],
    interestTimestamps: (profile.interestTimestamps as Record<string, string>) ?? {},
  };
}
```

- [ ] **Step 2: Write a failing test in `session-exchange.test.ts` that asserts the loader is called when flag is on**

```ts
import * as memoryFactsModule from '../memory/memory-facts';

it('reads via memory_facts loader when MEMORY_FACTS_READ_ENABLED=true', async () => {
  process.env.MEMORY_FACTS_READ_ENABLED = 'true';
  const loadSpy = jest.spyOn(memoryFactsModule, 'loadMemorySnapshot');
  // build minimal profile + db, drive the call site that wraps buildMemoryBlock
  expect(loadSpy).toHaveBeenCalledTimes(1);
});
```

The key assertion is "the new loader is invoked" — fixture-level parity is Task 14's job.

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Update each caller to load upstream**

In `apps/api/src/services/session/session-exchange.ts` at the line where `buildMemoryBlock(...)` is invoked:

```ts
import { loadMemorySnapshot } from '../memory/memory-facts';

// ... before the buildMemoryBlock(...) call:
const snapshot = await loadMemorySnapshot(db, learningProfile);
const memoryBlockInput: MemoryBlockProfile = {
  ...learningProfile,
  strengths: snapshot.strengths,
  struggles: snapshot.struggles,
  interests: snapshot.interests,
  communicationNotes: snapshot.communicationNotes,
  suppressedInferences: snapshot.suppressedInferences,
  interestTimestamps: snapshot.interestTimestamps,
};
const memoryBlock = buildMemoryBlock(memoryBlockInput, currentSubject, currentTopic, retentionContext, recentlyResolved);
```

Repeat at `curated-memory.ts:44` and `buildHumanReadableMemoryExport` if it reads the same fields. `buildMemoryBlock` itself remains synchronous and unmodified.

- [ ] **Step 5: Run all unit + integration tests touching these files**

Run: `pnpm exec jest apps/api/src/services/session/session-exchange.test.ts apps/api/src/services/curated-memory.test.ts`
Expected: PASS with flag off (legacy path), PASS with flag on (memory_facts path).

- [ ] **Step 6: Commit via `/commit`**

---

## Task 14: Semantic parity gate via `pnpm eval:llm` snapshots

**Why:** Phase 1 deploy gate. The same fixture session must produce semantically equivalent prompts on the JSONB and `memory_facts` read paths before the flag is flipped in production.

**Files:**
- Create: `tests/integration/memory-facts-parity.integration.test.ts`
- Modify: `apps/api/eval-llm/runner/snapshot.ts` (or wherever the snapshot harness lives — to add a "compare two flag states" mode if it doesn't already exist)

- [ ] **Step 1: Write the parity test for `readMemorySnapshotFromFacts`**

Tests the **shape parity** at the helper level (set equality, ordering, truncation). The eval-llm snapshots cover prompt-level parity in step 4.

```ts
// tests/integration/memory-facts-parity.integration.test.ts
import { describe, it, expect } from '@jest/globals';
import { setupTestDb, seedLearningProfile, runBackfillForOneProfile } from './helpers/memory-facts';
import { createScopedRepository } from '@eduagent/database';
import { readMemorySnapshotFromFacts } from '../../apps/api/src/services/memory/memory-facts';
import { learningProfiles } from '@eduagent/database/schema';
import { eq } from 'drizzle-orm';

const FIXTURE_PROFILES = [
  // Profile 1: light memory
  { strengths: [{ subject: 'Math', topics: ['fractions'], confidence: 'high' }], struggles: [], interests: [], communicationNotes: [], suppressedInferences: [] },
  // Profile 2: dense memory across all categories
  {
    strengths: [
      { subject: 'Math', topics: ['fractions', 'decimals'], confidence: 'high' },
      { subject: 'English', topics: ['comprehension'], confidence: 'medium' },
    ],
    struggles: [
      { subject: 'Math', topic: 'long division', lastSeen: '2026-04-15T10:00:00Z', attempts: 3, confidence: 'medium' },
      { subject: 'English', topic: 'spelling', lastSeen: '2026-03-01T00:00:00Z', attempts: 2, confidence: 'low' },
    ],
    interests: [{ label: 'soccer', context: 'free_time' }, { label: 'space', context: 'school' }],
    communicationNotes: ['prefers analogies', 'short bursts'],
    suppressedInferences: ['ignored fact'],
  },
  // Profile 3: only interests
  { strengths: [], struggles: [], interests: [{ label: 'cats', context: 'free_time' }], communicationNotes: [], suppressedInferences: [] },
];

describe('memory_facts parity vs JSONB', () => {
  it.each(FIXTURE_PROFILES.map((p, i) => [i, p]))(
    'fixture %i: helper output set-equal to JSONB',
    async (_, fixture) => {
      const { db } = await setupTestDb();
      const { profileId } = await seedLearningProfile(db, fixture);
      // Backfill memory_facts for this profile (use the function's pure builder, then insert).
      // ... (call the same buildBackfillRowsForProfile + insert as the real backfill does)
      await runBackfillForOneProfile(db, profileId);

      const profile = await db.query.learningProfiles.findFirst({ where: eq(learningProfiles.profileId, profileId) });
      const scoped = createScopedRepository(db, profileId);
      const fromFacts = await readMemorySnapshotFromFacts(scoped, profile!);

      // Set equality: every JSONB strength.topic appears in fromFacts.strengths (regardless of order).
      const jsonbStrengthTopics = new Set((profile!.strengths as Array<{ topics: string[] }>).flatMap((s) => s.topics));
      const factStrengthTopics = new Set(fromFacts.strengths.flatMap((s) => s.topics));
      expect(factStrengthTopics).toEqual(jsonbStrengthTopics);

      // Same for struggles, interests, communicationNotes, suppressedInferences.
      expect(new Set(fromFacts.communicationNotes)).toEqual(new Set(profile!.communicationNotes as string[]));
      expect(new Set(fromFacts.suppressedInferences)).toEqual(new Set(profile!.suppressedInferences as string[]));
      expect(new Set(fromFacts.interests.map((i) => i.label))).toEqual(new Set((profile!.interests as Array<{ label: string }>).map((i) => i.label)));

      // Per-entry parity for struggles: each (subject, topic, attempts) tuple
      // must appear in both. Order is append-order (createdAt asc), not
      // lastSeen-desc — the JSONB array preserves insertion order, and the
      // memory_facts read mirrors that via the scoped repo's createdAt
      // ordering.
      const jsonbStruggles = profile!.struggles as Array<{ subject: string|null; topic: string; attempts: number }>;
      const factStruggles = fromFacts.struggles.map((s) => ({ subject: s.subject, topic: s.topic, attempts: s.attempts }));
      expect(new Set(factStruggles.map((s) => JSON.stringify(s)))).toEqual(
        new Set(jsonbStruggles.map((s) => JSON.stringify({ subject: s.subject, topic: s.topic, attempts: s.attempts })))
      );

      // interestTimestamps round-trip exactly.
      expect(fromFacts.interestTimestamps).toEqual(profile!.interestTimestamps);
    }
  );
});
```

- [ ] **Step 2: Run, expect PASS**

Run: `pnpm exec jest tests/integration/memory-facts-parity.integration.test.ts`

- [ ] **Step 3: Add eval-llm snapshot parity for the 13 flows**

Each flow file in `apps/api/eval-llm/flows/` builds a prompt fixture. The snapshot harness already snapshots them. To gate parity:

1. Run `pnpm eval:llm` once with `MEMORY_FACTS_READ_ENABLED=false` — record the baseline snapshots.
2. Run `pnpm eval:llm` with `MEMORY_FACTS_READ_ENABLED=true` — write to a parallel directory (e.g. `apps/api/eval-llm/snapshots-facts/`).
3. Add a CI script `scripts/check-eval-llm-parity.ts` that:
   - Reads each pair of `<flow>/<scenario>.md` files from `snapshots/` and `snapshots-facts/`.
   - Asserts: the **set of bullet lines under "Mentor memory" sections** is equal (order may differ within section).
   - Asserts: total prompt character length within ±2% (truncation parity).
   - Fails the build if any pair diverges semantically.

Implementation skeleton:

```ts
// scripts/check-eval-llm-parity.ts
//
// Tighter parity than a percentage tolerance. We:
//   - find ALL memory-injection sections per file (multiple per snapshot are
//     real — exchanges/probes/interview each render their own block);
//   - extract bullet lines per section, normalize whitespace,
//     compare as sets per (file, section);
//   - additionally enforce a hard char-delta of <= 50 across the whole file
//     (catches truncation drift without permitting silent loss of an entry).
//
// Exits 1 on any divergence; never soften the assertion to ship — fix the
// data-level cause (see triage notes below).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'apps/api/eval-llm/snapshots';
const FACTS = 'apps/api/eval-llm/snapshots-facts';
const MAX_CHAR_DELTA = 50;

const SECTION_HEADERS = [
  'mentor memory',
  'memory:',
  'recent struggles',
  'strengths',
  'interests',
  'communication notes',
];

/** Find every section starting with one of SECTION_HEADERS and return a map
 *  from section header (lowercased) to the set of bullet lines within. */
function extractSections(md: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  // Split by markdown headings (lines starting with one or more #) OR by
  // blank-line-separated paragraphs that look like prefix labels.
  const headerRe = new RegExp(`(^|\\n)(##?#?\\s*)?(${SECTION_HEADERS.map(escape).join('|')})\\b[^\\n]*`, 'gi');
  function escape(s: string) { return s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'); }
  let match: RegExpExecArray | null;
  const positions: { header: string; start: number }[] = [];
  while ((match = headerRe.exec(md)) !== null) {
    positions.push({ header: match[3].toLowerCase(), start: match.index + (match[1] === '\n' ? 1 : 0) });
  }
  for (let i = 0; i < positions.length; i++) {
    const { header, start } = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].start : md.length;
    const block = md.slice(start, end);
    const bullets = block
      .split('\n')
      .filter((l) => /^\s*[-*]\s/.test(l))
      .map((l) => l.trim().replace(/\s+/g, ' '));
    const existing = out.get(header) ?? new Set<string>();
    for (const b of bullets) existing.add(b);
    out.set(header, existing);
  }
  return out;
}

function compareSets(a: Set<string>, b: Set<string>): { onlyA: string[]; onlyB: string[] } {
  return {
    onlyA: [...a].filter((x) => !b.has(x)),
    onlyB: [...b].filter((x) => !a.has(x)),
  };
}

let failed = 0;
function walk(rel = ''): string[] {
  const dir = join(BASE, rel);
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(join(rel, entry)));
    } else if (entry.endsWith('.md')) {
      out.push(join(rel, entry));
    }
  }
  return out;
}

for (const relPath of walk()) {
  const aPath = join(BASE, relPath);
  const bPath = join(FACTS, relPath);
  let a: string;
  let b: string;
  try {
    a = readFileSync(aPath, 'utf8');
    b = readFileSync(bPath, 'utf8');
  } catch {
    console.error(`MISSING PAIR: ${relPath}`);
    failed++;
    continue;
  }

  const sectionsA = extractSections(a);
  const sectionsB = extractSections(b);
  const allHeaders = new Set([...sectionsA.keys(), ...sectionsB.keys()]);
  for (const h of allHeaders) {
    const setA = sectionsA.get(h) ?? new Set();
    const setB = sectionsB.get(h) ?? new Set();
    const { onlyA, onlyB } = compareSets(setA, setB);
    if (onlyA.length || onlyB.length) {
      console.error(`PARITY FAIL: ${relPath} [${h}]`);
      onlyA.forEach((x) => console.error(`  - JSONB only: ${x}`));
      onlyB.forEach((x) => console.error(`  - facts only: ${x}`));
      failed++;
    }
  }

  const charDelta = Math.abs(a.length - b.length);
  if (charDelta > MAX_CHAR_DELTA) {
    console.error(`LENGTH PARITY FAIL: ${relPath} (delta=${charDelta} chars)`);
    failed++;
  }
}
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 4: Run the parity check**

Run:
```
MEMORY_FACTS_READ_ENABLED=false pnpm eval:llm
mv apps/api/eval-llm/snapshots apps/api/eval-llm/snapshots-baseline
MEMORY_FACTS_READ_ENABLED=true pnpm eval:llm
mv apps/api/eval-llm/snapshots apps/api/eval-llm/snapshots-facts
mv apps/api/eval-llm/snapshots-baseline apps/api/eval-llm/snapshots
pnpm exec ts-node scripts/check-eval-llm-parity.ts
```
Expected: zero divergences. If divergences appear, **investigate the difference at the data level** — do not soften the parity check (`feedback_never_loosen_tests_to_pass`). Likely root causes:
- Mapper lost a metadata field → fix `backfill-mapping.ts`.
- `readMemorySnapshotFromFacts` order differs from append order → ensure repository's `findManyActive` orders by `createdAt asc, id asc`.
- `interestTimestamps` not surfaced → mapper persists timestamp; reader picks it up from `metadata.timestamp`.

- [ ] **Step 5: Commit via `/commit`**

(The "Deploy gate" section was added at the top of this plan — Task 14's old "step 5" was self-modifying and is removed.)

---

## Task 15: Cross-profile read-leak break test

**Why:** Spec acceptance criterion — deploy-blocking.

**Files:**
- Modify: `tests/integration/memory-facts-dual-write.integration.test.ts` (or a new file)

- [ ] **Step 1: Write failing break test**

```ts
it('Profile A cannot read Profile B memory_facts via createScopedRepository', async () => {
  const { db } = await setupTestDb();
  const { profileId: profileA } = await seedLearningProfile(db, {});
  const { profileId: profileB } = await seedLearningProfile(db, {});
  await db.insert(memoryFacts).values([
    { profileId: profileA, category: 'interest', text: 'A', textNormalized: 'a', metadata: {}, observedAt: new Date(), confidence: 'medium' },
    { profileId: profileB, category: 'interest', text: 'B', textNormalized: 'b', metadata: {}, observedAt: new Date(), confidence: 'medium' },
  ]);

  const scopedA = createScopedRepository(db, profileA);
  const rowsA = await scopedA.memoryFacts.findManyActive();
  expect(rowsA.map((r) => r.text)).toEqual(['A']);
  expect(rowsA.find((r) => r.text === 'B')).toBeUndefined();
});
```

- [ ] **Step 2: Run, expect PASS** (the scoped repo enforces this by construction; this is a regression guard)

- [ ] **Step 3: Commit via `/commit`**

---

## Task 16: Final verification + readiness checklist

- [ ] **Step 1: Run the full validation suite**

Run, in order:
```
pnpm exec nx run-many -t lint
pnpm exec nx run-many -t typecheck
pnpm exec nx run-many -t test
pnpm exec jest tests/integration/memory-facts-dual-write.integration.test.ts
pnpm exec jest tests/integration/memory-facts-backfill.integration.test.ts
pnpm exec jest tests/integration/memory-facts-parity.integration.test.ts
pnpm exec ts-node scripts/check-eval-llm-parity.ts
```
Expected: ALL PASS.

- [ ] **Step 2: Confirm Spec Phase 1 acceptance criteria are met**

Cross-check against the spec's Phase 1 list (lines 369-378 of `docs/specs/2026-05-05-memory-architecture-upgrade.md`):

- `memory_facts` table migrated with all phase columns + indexes ✓ (Tasks 2, 3)
- Backfill follows the per-category mapping table; audit log on malformed entries ✓ (Tasks 6, 7)
- `applyAnalysis` writes to both stores in one transaction with `SELECT ... FOR UPDATE` ✓ (Task 9)
- Concurrent-write race test ✓ (Task 10)
- Semantic parity test suite is deploy-blocking ✓ (Task 14)
- All `memory_facts` reads via `createScopedRepository` ✓ (Tasks 4, 8)
- Consent gate in injection helper ✓ (Task 8)
- `deleteMemoryItem` user-facing contract unchanged ✓ (Task 11)
- Account-deletion cascade ✓ (Task 12)
- JSONB columns NOT yet dropped (soak period) ✓ (out of scope of this plan)

- [ ] **Step 3: Trigger backfill once on dev**

Send the `admin/memory-facts-backfill.requested` event to the dev Inngest endpoint:
```
curl -X POST $INNGEST_DEV_URL/e/dev/admin/memory-facts-backfill.requested \
  -H 'content-type: application/json' \
  -d '{"name":"admin/memory-facts-backfill.requested","data":{}}'
```
Tail logs for `memory_facts.backfill.complete`. Confirm `totalProfiles` matches the dev DB row count and `totalMalformed=0` (or all malformed entries have a logged reason).

- [ ] **Step 4: Document the deploy plan**

Add a brief note to the PR description (when the user asks for one — per `feedback_no_pr_unless_asked.md` do NOT open one preemptively):

```
## Deploy plan (Phase 1)
1. Merge with `MEMORY_FACTS_READ_ENABLED=false` everywhere. Migration 0055 lands with the marker column.
2. Deploy. Dual-write is now active (Tasks 9 + 11), but reads are still JSONB. The marker column lets backfill skip every profile that the dual-write has already filled.
3. Within 24h of merge, trigger `memory-facts-backfill` on staging, then production. The function processes only profiles with `memory_facts_backfilled_at IS NULL`. Verify `totalMalformed=0` and `totalProfilesMissedMarker=0` afterwards.
4. Watch SLO 24h: applyAnalysis p95 ≤ baseline + 50 ms, dual-write success rate ≥ 99.95%.
5. Run `pnpm eval:llm` parity check on staging fixtures (`scripts/check-eval-llm-parity.ts`). Must be 0 divergences.
6. Set `MEMORY_FACTS_READ_ENABLED=true` in Doppler stg. Smoke-test mentor flows. Watch the same SLO for 24h.
7. Set `MEMORY_FACTS_READ_ENABLED=true` in Doppler prod. Watch SLO. Rollback = set flag false in Doppler (no code change needed).
8. Soak 30+ days before opening the column-drop spec/PR (separate spec, separate ## Rollback per CLAUDE.md).
```

- [ ] **Step 5: Commit via `/commit`** (final commit closes Phase 1)

---

## Out of scope of this plan (explicitly)

- Phase 2 (embeddings + semantic retrieval): plan written separately after Phase 1 ships.
- Phase 3 (dedup + merge): plan written separately after Phase 2 ships.
- Soak-period column drops: separate spec/PR with its own `## Rollback` section per CLAUDE.md.
- Backfill-merge pass on pre-existing duplicates: deferred (spec out-of-scope).
- Per-turn memory extraction: deferred (spec out-of-scope).

## Decisions baked in (engineering tuning, not user-facing)

- **Phase 1 contract:** `memory_facts` is a structural projection of the merged JSONB state. The merge logic (in `mergeStruggles` / `mergeStrengths` / `mergeInterests` / `archiveStaleStruggles` / `resolveStruggle`) lives in ONE place. Writes always run JSONB merge first, then DELETE-active + INSERT into `memory_facts`. No second merge path exists.
- `normalizeMemoryText` is implemented to match `sameNormalized` exactly — verified at Task 6 step 5.
- **Self-FK on `supersededBy` declared via Drizzle's table-level `foreignKey()` builder** so drizzle-kit emits the constraint into the migration and won't drop it on the next regen. (Earlier draft of this plan said "raw SQL post-create"; that was wrong — see HIGH-4 in the adversarial review.)
- **Partial UNIQUE on `(profile_id, category, COALESCE(metadata->>'subject', ''), text_normalized) WHERE superseded_by IS NULL`** — guarantees no duplicate active rows after concurrent writes.
- **Read order = append order** (`createdAt asc, id asc`) to mirror the JSONB array's append semantics — so the rendered prompt sees entries in the same order on both flag states.
- **Backfill idempotency = `learning_profiles.memory_facts_backfilled_at` marker** (not row-count probe). Counts diverge once dual-write ships; the marker doesn't. Dual-write code stamps it lazily on first analysis.
- **Backfill step granularity = 1 step per 100-profile batch** (`process-batch-${index}`). Per-profile dynamic step IDs would blow up Inngest's step memo at any non-trivial scale.
- **Atomicity test injects failure inside the tx via `jest.spyOn(memoryFactsModule, 'writeMemoryFactsForAnalysis').mockImplementationOnce(throw)`** — NOT via `jest.spyOn(db, 'insert')`, which doesn't intercept `tx.insert` (different bound method on a `PgTransaction`).
- **`buildMemoryBlock` stays synchronous.** The flag branch lives in callers (Task 13). `loadMemorySnapshot(db, profile)` does the async load upstream; the result is spread onto `MemoryBlockProfile` before `buildMemoryBlock` is invoked.
- **`deleteMemoryItem` keeps its positional signature** `(db, profileId, accountId, category, value, suppress=false, subject?)` — must not break route handler callers.
- **Production driver is `neon-serverless` (WebSocket Pool).** `db.transaction()` is real, interactive, and ACID with `SELECT ... FOR UPDATE`. The earlier-cited "neon-http no transactions" memory was outdated (see updated `project_neon_transaction_facts.md`).
- **Parity script: per-section bullet sets, normalized whitespace, hard char-delta ≤ 50.** No percentage tolerance.
- All commits go through `/commit`. Subagents do not commit (CLAUDE.md non-negotiable).

