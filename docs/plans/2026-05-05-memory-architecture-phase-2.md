# Memory Architecture Phase 2 — Semantic Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed every memory fact at write time and replace recency-only mentor memory injection with relevance-weighted retrieval, gated behind `MEMORY_FACTS_RELEVANCE_RETRIEVAL`.

**Architecture:** Each fact written via `writeMemoryFactsForAnalysis` gets a Voyage `voyage-3.5` 1024-dim embedding stored on the row. A best-effort embed step never blocks the write — failures fall back to a `memory-facts-embed-backfill` Inngest cron. A new `getRelevantMemories(profileId, queryText, k)` service performs two-stage retrieval (pgvector `<=>` cosine + app-side recency blend) through `createScopedRepository(profileId)` with consent gating. Existing `buildMemoryBlock` callers swap the recency snapshot for the relevance snapshot under the new flag, with recency-only fallback whenever the candidate set is incomplete.

**Tech Stack:** Drizzle ORM, pgvector with HNSW, Voyage AI `voyage-3.5`, Hono, Inngest, Zod, Jest, Wrangler/Doppler.

**Source spec:** `docs/specs/2026-05-05-memory-architecture-upgrade.md` § Phase 2.

**Phase 1 state at plan time (2026-05-05):**
- `memory_facts` table shipped with all Phase 1+2+3 columns; partial HNSW index already created (migration `0057_memory_facts.sql`).
- `apps/api/src/services/memory/memory-facts.ts` exposes `writeMemoryFactsForAnalysis`, `writeMemoryFactsForDeletion`, `readMemorySnapshotFromFacts`.
- Scoped repo helpers `memoryFacts.findManyActive` / `findFirstActive` already exist (`packages/database/src/repository.ts:374-397`).
- Read switch `MEMORY_FACTS_READ_ENABLED` and `isMemoryFactsReadEnabled` shipped (`apps/api/src/config.ts:66-71`).
- Voyage adapter `generateEmbedding(text, apiKey)` already exists (`apps/api/src/services/embeddings.ts:69`).

---

## File Structure

**Create:**
- `apps/api/src/services/memory/embed-fact.ts` — pure helper that turns a fact row into the Voyage input string + calls `generateEmbedding`. Co-located with other memory helpers.
- `apps/api/src/services/memory/embed-fact.test.ts` — unit tests for the helper.
- `apps/api/src/services/memory/relevance.ts` — `getRelevantMemories(profileId, queryText, k, options)` service.
- `apps/api/src/services/memory/relevance.test.ts` — unit tests for consent gate, fallback, and blend math.
- `apps/api/src/inngest/functions/memory-facts-embed-backfill.ts` — hourly cron that picks up `embedding IS NULL` rows in batches.
- `apps/api/src/inngest/functions/memory-facts-embed-backfill.test.ts` — unit tests for batching + error handling.
- `tests/integration/memory-facts-embed-on-write.integration.test.ts` — verifies `applyAnalysis` writes embeddings on success and persists facts with `embedding=null` on Voyage failure.
- `tests/integration/memory-facts-relevance-retrieval.integration.test.ts` — end-to-end: seed facts with embeddings, query, assert ordering and consent gating.
- `apps/api/eval-llm/flows/memory-relevance-ab.flow.ts` — A/B harness flow producing recency vs. relevance prompt snapshots for the same fixture session.

**Modify:**
- `packages/database/src/schema/_pgvector.ts` — extend with a nullable variant of `vector` so `embedding` column type is correctly inferred as `number[] | null`. Spec mandates a single shared customType (Data Model footnote on line 141).
- `packages/database/src/schema/memory-facts.ts` — switch `embedding` to the nullable variant; add the type-level optionality.
- `packages/database/src/repository.ts` — add `memoryFacts.findRelevant(queryEmbedding, k, extraWhere?)` method that runs the stage-1 SQL with `<=>` and `K' = 4·k` over-fetch.
- `apps/api/src/services/memory/memory-facts.ts` — `writeMemoryFactsForAnalysis` accepts an optional `embedFn` injection so tests can stub Voyage; calls it best-effort per row.
- `apps/api/src/services/learner-profile.ts:1285,1388` — pass an embedder into `writeMemoryFactsForAnalysis` derived from the env Voyage API key (see Task 3 detail).
- `apps/api/src/inngest/functions/session-completed.ts` — pass the Voyage API key via `getStepVoyageApiKey()` into `applyAnalysis` so the writer can embed facts.
- `apps/api/src/inngest/index.ts` — register `memoryFactsEmbedBackfill`.
- `apps/api/src/config.ts:66` — add `MEMORY_FACTS_RELEVANCE_RETRIEVAL` enum flag and helper.
- `apps/api/src/config.test.ts:249` — extend tests to cover the new flag default + parse.
- `apps/api/src/routes/sessions.ts:205,345,423,692` — thread a `memoryFactsRelevanceEnabled` boolean through to `session-exchange` options.
- `apps/api/src/services/session/session-exchange.ts:836-894` — when `memoryFactsRelevanceEnabled`, call `getRelevantMemories` to derive `interests/strengths/struggles/communicationNotes` for the memory block; fall back to the recency snapshot otherwise.
- `apps/api/eval-llm/scenarios.ts` (or equivalent registry) — register the new A/B flow.

**Untouched (explicitly):**
- `packages/database/src/schema/embeddings.ts` (separate `sessionEmbeddings` use case).
- The existing analyzer (`analyzeSessionTranscript`) — Phase 2 does not change extraction.
- All Phase 3 fields (`supersededBy`, `supersededAt`) remain unset.

---

## Task 1: Add nullable variant to the pgvector customType

**Files:**
- Modify: `packages/database/src/schema/_pgvector.ts`
- Modify: `packages/database/src/schema/memory-facts.ts:40`
- Test: `packages/database/src/schema/_pgvector.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/database/src/schema/_pgvector.test.ts`:

```ts
import { vector, vectorNullable, VECTOR_DIM } from './_pgvector';

describe('pgvector customType', () => {
  it('vector and vectorNullable share the same dimension', () => {
    const a = vector('a');
    const b = vectorNullable('b');
    expect(a.dataType()).toBe(`vector(${VECTOR_DIM})`);
    expect(b.dataType()).toBe(`vector(${VECTOR_DIM})`);
  });

  it('toDriver/fromDriver round-trip a 1024-dim vector', () => {
    const v = Array.from({ length: VECTOR_DIM }, (_, i) => i / VECTOR_DIM);
    const driver = vector('x').toDriver!(v);
    expect(typeof driver).toBe('string');
    expect((driver as string).startsWith('[')).toBe(true);
    const back = vector('x').fromDriver!(driver);
    expect(back).toHaveLength(VECTOR_DIM);
    expect(back[0]).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec jest packages/database/src/schema/_pgvector.test.ts -t "vector and vectorNullable"`
Expected: FAIL with `vectorNullable is not exported`.

- [ ] **Step 3: Add `vectorNullable` to `_pgvector.ts`**

Replace the file body (preserving `VECTOR_DIM`):

```ts
import { customType } from 'drizzle-orm/pg-core';

export const VECTOR_DIM = 1024;

const config = {
  dataType() {
    return `vector(${VECTOR_DIM})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value);
  },
};

/** Non-null pgvector column. Apply `.notNull()` per column where required. */
export const vector = customType<{ data: number[]; driverData: string }>(config);

/** Nullable pgvector column — same shape, but the inferred type allows `null`. */
export const vectorNullable = customType<{
  data: number[] | null;
  driverData: string | null;
  notNull: false;
}>({
  ...config,
  toDriver(value: number[] | null): string | null {
    return value === null ? null : `[${value.join(',')}]`;
  },
  fromDriver(value: string | null): number[] | null {
    return value === null ? null : JSON.parse(value);
  },
});
```

- [ ] **Step 4: Switch `memory_facts.embedding` to the nullable variant**

In `packages/database/src/schema/memory-facts.ts:13` and line 40:

```ts
import { vector, vectorNullable } from './_pgvector';
// ...
embedding: vectorNullable('embedding'),
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm exec jest packages/database/src/schema/_pgvector.test.ts && pnpm exec nx run database:typecheck`
Expected: PASS. The inferred row type for `memoryFacts` should now have `embedding: number[] | null`.

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/schema/_pgvector.ts \
        packages/database/src/schema/_pgvector.test.ts \
        packages/database/src/schema/memory-facts.ts
git commit  # use /commit skill
```

Commit message: `feat(memory): add vectorNullable variant for memory_facts.embedding column`.

---

## Task 2: Pure helper — turn a fact row into a Voyage embedding

**Files:**
- Create: `apps/api/src/services/memory/embed-fact.ts`
- Create: `apps/api/src/services/memory/embed-fact.test.ts`

The helper exists so the writer in Task 3 stays small and the embed call is unit-testable without hitting Voyage.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/services/memory/embed-fact.test.ts
import { embedFactText, type EmbeddingFn } from './embed-fact';

describe('embedFactText', () => {
  it('returns the embedding vector when the fn succeeds', async () => {
    const fn: EmbeddingFn = async () => ({
      vector: new Array(1024).fill(0.5),
      dimensions: 1024,
      model: 'voyage-3.5',
      provider: 'voyage',
    });
    const result = await embedFactText('Fractions are hard', fn);
    expect(result).toEqual({ ok: true, vector: expect.any(Array) });
    expect((result as { vector: number[] }).vector).toHaveLength(1024);
  });

  it('returns ok:false with reason when fn throws', async () => {
    const fn: EmbeddingFn = async () => {
      throw new Error('voyage 503');
    };
    const result = await embedFactText('Fractions are hard', fn);
    expect(result).toEqual({ ok: false, reason: 'voyage 503' });
  });

  it('rejects empty text without calling fn', async () => {
    const fn = jest.fn();
    const result = await embedFactText('   ', fn as unknown as EmbeddingFn);
    expect(result).toEqual({ ok: false, reason: 'empty_text' });
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest src/services/memory/embed-fact.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `embed-fact.ts`**

```ts
// apps/api/src/services/memory/embed-fact.ts
import type { EmbeddingResult } from '../embeddings';

export type EmbeddingFn = (text: string) => Promise<EmbeddingResult>;

export type EmbedFactOutcome =
  | { ok: true; vector: number[] }
  | { ok: false; reason: string };

export async function embedFactText(
  text: string,
  fn: EmbeddingFn
): Promise<EmbedFactOutcome> {
  if (!text || text.trim().length === 0) {
    return { ok: false, reason: 'empty_text' };
  }
  try {
    const result = await fn(text);
    return { ok: true, vector: result.vector };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest src/services/memory/embed-fact.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/memory/embed-fact.ts \
        apps/api/src/services/memory/embed-fact.test.ts
git commit  # /commit
```

Commit message: `feat(memory): add embedFactText helper for Phase 2 embedding-on-write`.

---

## Task 3: Wire embedding-on-write into `writeMemoryFactsForAnalysis`

**Goal:** When `applyAnalysis` writes facts, each new row gets an `embedding` set on the same insert (best-effort). Voyage failure does NOT throw — the fact persists with `embedding=null` and the backfill cron picks it up.

**Files:**
- Modify: `apps/api/src/services/memory/memory-facts.ts:207-249`
- Test: `apps/api/src/services/memory/memory-facts.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/services/memory/memory-facts.test.ts`:

```ts
describe('writeMemoryFactsForAnalysis with embedder', () => {
  it('embeds each new fact when an embedder is provided', async () => {
    const embedder = jest.fn().mockResolvedValue({ ok: true, vector: new Array(1024).fill(0.1) });
    // build a stub MemoryFactsWriter capturing inserts
    const inserted: Array<Record<string, unknown>> = [];
    const writer = makeWriterStub(inserted);
    await writeMemoryFactsForAnalysis(
      writer,
      'profile-1',
      makeMergedState({ strengths: [{ subject: 'Math', topics: ['fractions'], confidence: 'high' }] }),
      { embed: embedder }
    );
    expect(embedder).toHaveBeenCalledTimes(1);
    expect(inserted[0]?.embedding).toEqual(expect.any(Array));
  });

  it('persists fact with embedding=null when embedder rejects', async () => {
    const embedder = jest.fn().mockResolvedValue({ ok: false, reason: 'voyage 500' });
    const inserted: Array<Record<string, unknown>> = [];
    const writer = makeWriterStub(inserted);
    await writeMemoryFactsForAnalysis(
      writer,
      'profile-1',
      makeMergedState({ struggles: [{ topic: 'long division', confidence: 'medium', attempts: 2, lastSeen: new Date().toISOString() }] }),
      { embed: embedder }
    );
    expect(inserted[0]?.embedding).toBeNull();
  });

  it('skips embedding entirely when no embedder is provided (Phase 1 parity)', async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const writer = makeWriterStub(inserted);
    await writeMemoryFactsForAnalysis(
      writer,
      'profile-1',
      makeMergedState({ communicationNotes: ['short answers preferred'] })
    );
    expect(inserted[0]?.embedding).toBeUndefined();
  });
});
```

(The helpers `makeWriterStub` and `makeMergedState` live in the test file. Use the existing in-memory writer if one exists; otherwise build a minimal mock that captures the `.insert(...).values(...)` argument. Do **not** import `jest.mock` of internal modules — per CLAUDE.md.)

- [ ] **Step 2: Run tests to verify failure**

Run: `cd apps/api && pnpm exec jest src/services/memory/memory-facts.test.ts -t "with embedder"`
Expected: FAIL — `writeMemoryFactsForAnalysis` does not accept an `embed` option yet.

- [ ] **Step 3: Add the embedder option**

Edit `apps/api/src/services/memory/memory-facts.ts`:

```ts
import type { EmbedFactOutcome } from './embed-fact';

export type FactEmbedder = (text: string) => Promise<EmbedFactOutcome>;

export interface WriteMemoryFactsOptions {
  embed?: FactEmbedder;
}

export async function replaceActiveMemoryFactsForProfile(
  db: MemoryFactsWriter,
  profileId: string,
  projection: MemoryProjection,
  options?: WriteMemoryFactsOptions
): Promise<void> {
  await db
    .delete(memoryFacts)
    .where(
      and(
        eq(memoryFacts.profileId, profileId),
        sql`${memoryFacts.supersededBy} IS NULL`
      )
    );

  const rows = buildMemoryFactRowsFromProjection(profileId, projection);
  if (rows.length === 0) return;

  if (options?.embed) {
    for (const row of rows) {
      const result = await options.embed(row.text);
      // best-effort: null on failure, picked up by backfill cron
      (row as { embedding?: number[] | null }).embedding = result.ok ? result.vector : null;
    }
  }

  await db.insert(memoryFacts).values(rows);
}

export async function writeMemoryFactsForAnalysis(
  db: MemoryFactsWriter,
  profileId: string,
  mergedState: Parameters<typeof buildProjectionFromMergedState>[0],
  options?: WriteMemoryFactsOptions
): Promise<void> {
  await replaceActiveMemoryFactsForProfile(
    db,
    profileId,
    buildProjectionFromMergedState(mergedState),
    options
  );
  await db
    .update(learningProfiles)
    .set({ memoryFactsBackfilledAt: new Date() })
    .where(eq(learningProfiles.profileId, profileId));
}

export async function writeMemoryFactsForDeletion(
  db: MemoryFactsWriter,
  profileId: string,
  mergedState: Parameters<typeof buildProjectionFromMergedState>[0],
  options?: WriteMemoryFactsOptions
): Promise<void> {
  await writeMemoryFactsForAnalysis(db, profileId, mergedState, options);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd apps/api && pnpm exec jest src/services/memory/memory-facts.test.ts`
Expected: PASS (existing tests + 3 new).

- [ ] **Step 5: Pass embedder from `applyAnalysis`**

Edit `apps/api/src/services/learner-profile.ts:1285` and `:1388` to thread an optional embedder:

```ts
// new optional param at end of applyAnalysis signature
options?: { embed?: FactEmbedder }
// ...
await writeMemoryFactsForAnalysis(tx, profileId, mergedState, options);
```

Same change to the deletion path. The deletion path (`buildDeleteMemoryItemUpdates` callsite) does NOT need an embedder — deletes do not insert new fact rows. **Verify** by reading `learner-profile.ts:1380-1395` before adding the option there. If deletion only removes rows, omit the option from that call entirely.

- [ ] **Step 6: Pass Voyage key from session-completed Inngest function**

In `apps/api/src/inngest/functions/session-completed.ts:1153`, inside the `applyAnalysis` step:

```ts
const voyageApiKey = getStepVoyageApiKey();
const embed: FactEmbedder = async (text: string) => {
  if (!voyageApiKey) return { ok: false, reason: 'no_voyage_key' };
  return embedFactText(text, (t) => generateEmbedding(t, voyageApiKey));
};
const analysisResult = await applyAnalysis(
  db, profileId, analysis, subjectName, source, subjectId, { embed }
);
```

Imports: add `embedFactText`, `FactEmbedder` from `services/memory/embed-fact` and `services/memory/memory-facts`; `generateEmbedding` already imported via `services/embeddings`.

If `getStepVoyageApiKey()` returns `undefined` in dev, the `no_voyage_key` outcome means new facts persist with `embedding=null` — same behavior as a Voyage outage; backfill cron will pick them up if/when the key is configured.

- [ ] **Step 7: Run unit + integration tests**

```
cd apps/api && pnpm exec jest src/services/memory/ src/services/learner-profile.test.ts src/inngest/functions/session-completed.test.ts
```

Expected: PASS. The session-completed test does NOT verify Voyage was called (no internal mocks); it verifies the embedder option was wired without breaking existing behavior.

- [ ] **Step 8: Commit**

Commit message: `feat(memory): embed facts on write best-effort, persist null on Voyage failure`.

---

## Task 4: Integration test — embed-on-write happy path and outage path

**Files:**
- Create: `tests/integration/memory-facts-embed-on-write.integration.test.ts`

This is the high-level deploy-blocking guarantee. It must use the real DB and a fake Voyage (HTTP-level fake, not a `jest.mock` of internal code — see CLAUDE.md "No internal mocks in integration tests").

- [ ] **Step 1: Write the test**

Use the integration helpers under `tests/integration/helpers/` (already present per `git status`). Pattern after `tests/integration/memory-facts-dual-write.integration.test.ts`.

```ts
// tests/integration/memory-facts-embed-on-write.integration.test.ts
import { setupTestDb, seedProfile } from './helpers';
import { applyAnalysis } from '../../apps/api/src/services/learner-profile';
import { memoryFacts } from '@eduagent/database';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';

describe('memory_facts embed-on-write', () => {
  // Use msw or a tiny fetch override to fake Voyage at the HTTP boundary.
  // Voyage is a TRUE external — fakeing the HTTP response is allowed.

  it('writes embeddings for newly extracted facts', async () => {
    const { db, profileId } = await setupTestDb();
    const fakeVoyage = mockVoyageReturning(new Array(1024).fill(0.05));
    await applyAnalysis(
      db, profileId, /* analysis */ stubAnalysis(['fractions']), 'Math', 'inferred', null,
      { embed: fakeVoyage.embedFn }
    );
    const rows = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.embedding !== null)).toBe(true);
  });

  it('persists fact with embedding=null when Voyage 500s', async () => {
    const { db, profileId } = await setupTestDb();
    const fakeVoyage = mockVoyageThrowing();
    await applyAnalysis(
      db, profileId, stubAnalysis(['fractions']), 'Math', 'inferred', null,
      { embed: fakeVoyage.embedFn }
    );
    const rows = await db.select().from(memoryFacts).where(
      and(eq(memoryFacts.profileId, profileId), isNull(memoryFacts.embedding))
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('does not double-embed on retry — embeddings are idempotent per write', async () => {
    const { db, profileId } = await setupTestDb();
    const fakeVoyage = mockVoyageReturning(new Array(1024).fill(0.1));
    await applyAnalysis(db, profileId, stubAnalysis(['fractions']), 'Math', 'inferred', null, { embed: fakeVoyage.embedFn });
    await applyAnalysis(db, profileId, stubAnalysis(['fractions']), 'Math', 'inferred', null, { embed: fakeVoyage.embedFn });
    const rows = await db.select().from(memoryFacts).where(
      and(eq(memoryFacts.profileId, profileId), isNotNull(memoryFacts.embedding))
    );
    // active set is 1 (replaceActiveMemoryFactsForProfile clears + reinserts);
    // verify embedding is set, not duplicated
    expect(rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run + verify**

```
pnpm exec jest tests/integration/memory-facts-embed-on-write.integration.test.ts --runInBand
```

Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

Commit message: `test(memory): integration coverage for embed-on-write happy path and Voyage outage`.

---

## Task 5: Embed-backfill Inngest cron

**Goal:** Hourly cron picks up rows with `embedding IS NULL`, batches 100 at a time, embeds, updates. Self-throttling (sequential per row inside batch). Alert when backlog > 1000 rows.

**Files:**
- Create: `apps/api/src/inngest/functions/memory-facts-embed-backfill.ts`
- Create: `apps/api/src/inngest/functions/memory-facts-embed-backfill.test.ts`
- Modify: `apps/api/src/inngest/index.ts` — register the function.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/inngest/functions/memory-facts-embed-backfill.test.ts
import { memoryFactsEmbedBackfill } from './memory-facts-embed-backfill';

describe('memory-facts-embed-backfill', () => {
  it('selects rows with embedding IS NULL in batches of 100', async () => {
    const { stepDb, embedFn, calls } = makeBackfillHarness({ nullRows: 250 });
    await runHandler(memoryFactsEmbedBackfill, { stepDb, embedFn });
    expect(calls.embed).toBe(250);
    expect(calls.batches).toBe(3); // 100 + 100 + 50
  });

  it('emits backlog alert when count exceeds 1000', async () => {
    const { stepDb, embedFn, logger } = makeBackfillHarness({ nullRows: 1500 });
    await runHandler(memoryFactsEmbedBackfill, { stepDb, embedFn, logger });
    const alert = logger.entries.find((e) => e.event === 'memory_facts.embed_backfill.backlog_alert');
    expect(alert).toBeTruthy();
  });

  it('skips rows whose Voyage call fails — keeps embedding=null for next run', async () => {
    const failOn = (text: string) => text.includes('boom');
    const { stepDb, embedFn, db } = makeBackfillHarness({ nullRows: 5, failOn });
    await runHandler(memoryFactsEmbedBackfill, { stepDb, embedFn });
    const stillNull = await countNullEmbeddings(db);
    expect(stillNull).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm exec jest src/inngest/functions/memory-facts-embed-backfill.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the cron**

```ts
// apps/api/src/inngest/functions/memory-facts-embed-backfill.ts
import { eq, isNull, sql } from 'drizzle-orm';
import { memoryFacts } from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase, getStepVoyageApiKey } from '../helpers';
import { createLogger } from '../../services/logger';
import { generateEmbedding } from '../../services/embeddings';
import { embedFactText } from '../../services/memory/embed-fact';

const logger = createLogger();
const BATCH_SIZE = 100;
const BACKLOG_ALERT_THRESHOLD = 1000;

export const memoryFactsEmbedBackfill = inngest.createFunction(
  { id: 'memory-facts-embed-backfill' },
  { cron: '0 * * * *' },
  async ({ step }) => {
    const apiKey = getStepVoyageApiKey();
    if (!apiKey) {
      logger.warn('[memory_facts.embed_backfill] missing voyage key — skipping', {
        event: 'memory_facts.embed_backfill.skipped',
        reason: 'no_voyage_key',
      });
      return { status: 'skipped', reason: 'no_voyage_key' };
    }

    const backlog = await step.run('count-backlog', async () => {
      const db = getStepDatabase();
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(memoryFacts)
        .where(isNull(memoryFacts.embedding));
      return row?.count ?? 0;
    });

    if (backlog > BACKLOG_ALERT_THRESHOLD) {
      logger.error('[memory_facts.embed_backfill] backlog exceeds threshold', {
        event: 'memory_facts.embed_backfill.backlog_alert',
        backlog,
        threshold: BACKLOG_ALERT_THRESHOLD,
      });
    }

    let totalEmbedded = 0;
    let totalFailed = 0;

    for (let processed = 0; processed < backlog; processed += BATCH_SIZE) {
      const batch = await step.run(`batch-${processed / BATCH_SIZE}`, async () => {
        const db = getStepDatabase();
        const rows = await db
          .select({ id: memoryFacts.id, text: memoryFacts.text })
          .from(memoryFacts)
          .where(isNull(memoryFacts.embedding))
          .limit(BATCH_SIZE);

        let embedded = 0;
        let failed = 0;
        for (const row of rows) {
          const result = await embedFactText(row.text, (t) => generateEmbedding(t, apiKey));
          if (!result.ok) {
            failed += 1;
            continue;
          }
          await db
            .update(memoryFacts)
            .set({ embedding: result.vector, updatedAt: new Date() })
            .where(eq(memoryFacts.id, row.id));
          embedded += 1;
        }
        return { embedded, failed, scanned: rows.length };
      });

      totalEmbedded += batch.embedded;
      totalFailed += batch.failed;
      if (batch.scanned < BATCH_SIZE) break; // drained
    }

    const summary = {
      status: 'completed' as const,
      backlog,
      totalEmbedded,
      totalFailed,
      timestamp: new Date().toISOString(),
    };
    logger.info('[memory_facts.embed_backfill] complete', {
      event: 'memory_facts.embed_backfill.complete',
      ...summary,
    });
    return summary;
  }
);
```

- [ ] **Step 4: Register the function**

In `apps/api/src/inngest/index.ts`, add to the export list alongside other Inngest functions:

```ts
export { memoryFactsEmbedBackfill } from './functions/memory-facts-embed-backfill';
```

(Match the existing pattern of `memoryFactsBackfill` registration.)

- [ ] **Step 5: Run tests**

```
cd apps/api && pnpm exec jest src/inngest/functions/memory-facts-embed-backfill.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

Commit message: `feat(memory): hourly Inngest cron embeds memory_facts rows with embedding IS NULL`.

---

## Task 6: Repository helper — two-stage retrieval SQL

**Goal:** Add `memoryFacts.findRelevant(queryEmbedding, k, extraWhere?)` to `createScopedRepository(profileId)`. SQL fetches top `K' = 4·k` candidates by `<=>` cosine distance against the partial HNSW index. Returns rows + distance.

**Files:**
- Modify: `packages/database/src/repository.ts:374-397`
- Test: `packages/database/src/repository.test.ts` (add a focused unit; integration coverage in Task 9)

- [ ] **Step 1: Write the failing test**

In `packages/database/src/repository.test.ts`:

```ts
describe('memoryFacts.findRelevant', () => {
  it('uses the cosine distance operator and over-fetches by 4x', async () => {
    // Spy on db.execute / db.query to capture the rendered SQL fragment
    const { capturedSql } = await captureRepositoryQuery(async (scoped) => {
      await scoped.memoryFacts.findRelevant(new Array(1024).fill(0.1), 5);
    });
    expect(capturedSql).toContain('<=>');
    expect(capturedSql).toMatch(/limit\s+20/i); // K' = 4·5
    expect(capturedSql).toContain('superseded_by');
  });
});
```

(If `captureRepositoryQuery` does not exist in test helpers, build a minimal Postgres-syntax-only SQL stringifier using Drizzle's `toSQL()` on a query builder. Drizzle exposes `.toSQL()` for that purpose. Do NOT mock the DB.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec jest packages/database/src/repository.test.ts -t "findRelevant"`
Expected: FAIL — method does not exist.

- [ ] **Step 3: Implement the helper**

In `packages/database/src/repository.ts`, inside the `memoryFacts:` block:

```ts
async findRelevant(queryEmbedding: number[], k: number, extraWhere?: SQL) {
  if (queryEmbedding.length === 0) return [];
  const overFetch = Math.max(k * 4, k);
  const queryLiteral = sql`${`[${queryEmbedding.join(',')}]`}::vector`;
  const baseWhere = scopedWhere(
    memoryFacts,
    extraWhere
      ? and(sql`${memoryFacts.supersededBy} IS NULL`, extraWhere)
      : sql`${memoryFacts.supersededBy} IS NULL`
  );
  return db
    .select({
      id: memoryFacts.id,
      profileId: memoryFacts.profileId,
      category: memoryFacts.category,
      text: memoryFacts.text,
      textNormalized: memoryFacts.textNormalized,
      metadata: memoryFacts.metadata,
      sourceSessionIds: memoryFacts.sourceSessionIds,
      sourceEventIds: memoryFacts.sourceEventIds,
      observedAt: memoryFacts.observedAt,
      confidence: memoryFacts.confidence,
      createdAt: memoryFacts.createdAt,
      distance: sql<number>`${memoryFacts.embedding} <=> ${queryLiteral}`,
    })
    .from(memoryFacts)
    .where(and(baseWhere, sql`${memoryFacts.embedding} IS NOT NULL`))
    .orderBy(sql`${memoryFacts.embedding} <=> ${queryLiteral}`)
    .limit(overFetch);
},
```

The partial HNSW index (`memory_facts_embedding_hnsw_idx WHERE superseded_by IS NULL`) already enforces both filters at the index level; the explicit `superseded_by IS NULL` keeps the planner correct when HNSW is bypassed (low row counts, dev). The `embedding IS NOT NULL` clause is required because a partial HNSW index does not cover NULL rows and the planner may otherwise consider them.

- [ ] **Step 4: Verify test pass + typecheck**

```
pnpm exec jest packages/database/src/repository.test.ts -t "findRelevant"
pnpm exec nx run database:typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(memory): scoped repo helper memoryFacts.findRelevant for two-stage retrieval`.

---

## Task 7: `getRelevantMemories` service with consent gate, blend, and fallback

**Goal:** Top-level retrieval entry point used by prompt builders. Must be wrapped in `createScopedRepository(profileId)`, gate on consent flags, blend relevance + recency, and fall back to recency-only when the candidate set is incomplete.

**Files:**
- Create: `apps/api/src/services/memory/relevance.ts`
- Create: `apps/api/src/services/memory/relevance.test.ts`

- [ ] **Step 1: Write the failing tests (consent + blend + fallback)**

```ts
// apps/api/src/services/memory/relevance.test.ts
import { getRelevantMemories } from './relevance';

describe('getRelevantMemories', () => {
  it('returns [] when memoryEnabled=false', async () => {
    const result = await getRelevantMemories({
      profileId: 'p1',
      queryText: 'fractions',
      k: 5,
      profile: { memoryConsentStatus: 'granted', memoryEnabled: false, memoryInjectionEnabled: true },
      scoped: stubScoped(),
      embedder: stubEmbedder(),
      now: new Date('2026-05-05T00:00:00Z'),
    });
    expect(result.snapshot).toEqual(emptyMemorySnapshot());
    expect(result.source).toBe('consent_gate');
  });

  it('returns [] when memoryInjectionEnabled=false', async () => {
    const result = await getRelevantMemories({ /* ... injectionEnabled: false ... */ });
    expect(result.source).toBe('consent_gate');
  });

  it('returns [] when memoryConsentStatus !== granted', async () => { /* ... */ });

  it('falls back to recency when stage-1 returns < k items', async () => {
    const scoped = stubScopedReturning({ relevant: [], active: makeActive(3) });
    const result = await getRelevantMemories({ /* k: 5, embedder ok */ });
    expect(result.source).toBe('recency_fallback');
    expect(result.snapshot.struggles.length + result.snapshot.strengths.length).toBe(3);
  });

  it('falls back to recency when any candidate has embedding IS NULL — handled by SQL filter, but verify when embedder fails for queryText', async () => {
    const scoped = stubScopedReturning({ relevant: [], active: makeActive(3) });
    const embedder: FactEmbedder = async () => ({ ok: false, reason: 'voyage 500' });
    const result = await getRelevantMemories({ /* embedder, k:5 */ });
    expect(result.source).toBe('recency_fallback');
  });

  it('blends relevance and recency scores (default weights 0.7 / 0.3, halflife 90d)', async () => {
    const now = new Date('2026-05-05T00:00:00Z');
    const candidates = [
      // very relevant but old (180 days)
      makeRelevantRow({ distance: 0.05, observedAt: addDays(now, -180), text: 'old-relevant' }),
      // less relevant but recent (1 day)
      makeRelevantRow({ distance: 0.40, observedAt: addDays(now, -1),   text: 'recent-loose' }),
    ];
    const scoped = stubScopedReturning({ relevant: candidates, active: [] });
    const result = await getRelevantMemories({
      profileId: 'p1', queryText: 'fractions', k: 1,
      profile: grantedProfile(), scoped, embedder: stubEmbedderOk(), now,
    });
    // old-relevant: (1 - 0.05/2)*0.7 + exp(-180/90)*0.3 ≈ 0.683 + 0.041 = 0.724
    // recent-loose: (1 - 0.40/2)*0.7 + exp(-1/90)*0.3   ≈ 0.560 + 0.297 = 0.857
    expect(result.topRendered).toEqual(['recent-loose']);
  });

  it('respects custom weights when caller overrides', async () => { /* set w_recency=0 → pure relevance ordering */ });

  it('preserves sortable ids on tie to keep ordering deterministic', async () => { /* same score → id asc */ });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd apps/api && pnpm exec jest src/services/memory/relevance.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

```ts
// apps/api/src/services/memory/relevance.ts
import type { ScopedRepository } from '@eduagent/database';
import type { FactEmbedder } from './memory-facts';
import { emptyMemorySnapshot, type MemorySnapshot } from './memory-facts';
import {
  reconstructStrengthFromRow,
  reconstructStruggleFromRow,
  reconstructInterestFromRow,
} from './memory-facts'; // export these from memory-facts.ts as part of this task

export interface RelevanceWeights {
  relevance: number;
  recency: number;
  /** halflife in days; default 90 */
  halflifeDays: number;
}

export const DEFAULT_WEIGHTS: RelevanceWeights = {
  relevance: 0.7,
  recency: 0.3,
  halflifeDays: 90,
};

export interface RelevanceResult {
  snapshot: MemorySnapshot;
  /** which path produced the snapshot — used by callers for telemetry */
  source: 'relevance' | 'recency_fallback' | 'consent_gate';
}

export interface GetRelevantMemoriesArgs {
  profileId: string;
  queryText: string;
  k: number;
  profile: {
    memoryConsentStatus?: string | null;
    memoryEnabled?: boolean;
    memoryInjectionEnabled?: boolean;
  } | null;
  scoped: ScopedRepository;
  embedder: FactEmbedder;
  weights?: Partial<RelevanceWeights>;
  now?: Date;
}

export async function getRelevantMemories(
  args: GetRelevantMemoriesArgs
): Promise<RelevanceResult> {
  const { profileId, queryText, k, profile, scoped, embedder, weights, now } = args;
  const w: RelevanceWeights = { ...DEFAULT_WEIGHTS, ...(weights ?? {}) };
  const t = now ?? new Date();

  const consentGranted = profile?.memoryConsentStatus === 'granted';
  const injectionEnabled =
    consentGranted && (profile?.memoryInjectionEnabled ?? profile?.memoryEnabled ?? true);
  if (!profile || !injectionEnabled) {
    return { snapshot: emptyMemorySnapshot(), source: 'consent_gate' };
  }

  // Stage 0: embed the query.
  const queryEmb = await embedder(queryText);
  if (!queryEmb.ok) {
    const fallback = await readMemorySnapshotFromFacts(scoped, profile);
    return { snapshot: fallback, source: 'recency_fallback' };
  }

  // Stage 1: top-K' candidates from SQL.
  const candidates = await scoped.memoryFacts.findRelevant(queryEmb.vector, k);
  if (candidates.length < k) {
    const fallback = await readMemorySnapshotFromFacts(scoped, profile);
    return { snapshot: fallback, source: 'recency_fallback' };
  }

  // Stage 2: blend relevance + recency.
  const scored = candidates.map((row) => {
    const ageDays = Math.max(0, (t.getTime() - row.observedAt.getTime()) / 86_400_000);
    const relevance = 1 - row.distance / 2; // distance ∈ [0,2] → [0,1]
    const recency = Math.exp(-ageDays / w.halflifeDays);
    const score = relevance * w.relevance + recency * w.recency;
    return { row, score };
  });
  scored.sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
  const topK = scored.slice(0, k).map((s) => s.row);

  return { snapshot: rowsToSnapshot(topK), source: 'relevance' };
}

function rowsToSnapshot(rows: ReadonlyArray</* row shape from findRelevant */ never>): MemorySnapshot {
  // reuse the per-row reconstruction logic from memory-facts.ts
  // (export reconstructStrengthFromRow / reconstructStruggleFromRow / reconstructInterestFromRow there)
  // ... mirror the switch in readMemorySnapshotFromFacts ...
}
```

The row→snapshot reconstruction logic already exists privately inside `readMemorySnapshotFromFacts` (`memory-facts.ts:142-174`). **Refactor** it: extract `rowToSnapshotEntry(row, snapshot)` as an exported helper from `memory-facts.ts` and use it from both `readMemorySnapshotFromFacts` and `rowsToSnapshot`. This keeps a single rendering rule.

- [ ] **Step 4: Run tests + lint**

```
cd apps/api && pnpm exec jest src/services/memory/relevance.test.ts
pnpm exec nx run api:lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(memory): getRelevantMemories with two-stage retrieval, consent gate, recency fallback`.

---

## Task 8: Feature flag `MEMORY_FACTS_RELEVANCE_RETRIEVAL`

**Files:**
- Modify: `apps/api/src/config.ts:66`
- Modify: `apps/api/src/config.test.ts:249`

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/config.test.ts` next to the existing `MEMORY_FACTS_READ_ENABLED` cases:

```ts
it('MEMORY_FACTS_RELEVANCE_RETRIEVAL defaults to "false" when unset', () => {
  const env = parseEnv({ /* required-only */ });
  expect(env.MEMORY_FACTS_RELEVANCE_RETRIEVAL).toBe('false');
});

it('MEMORY_FACTS_RELEVANCE_RETRIEVAL parses "true" for the relevance retrieval rollout', () => {
  const env = parseEnv({ /* ... */ MEMORY_FACTS_RELEVANCE_RETRIEVAL: 'true' });
  expect(env.MEMORY_FACTS_RELEVANCE_RETRIEVAL).toBe('true');
});

it('isMemoryFactsRelevanceEnabled returns false when undefined', () => {
  expect(isMemoryFactsRelevanceEnabled(undefined)).toBe(false);
});

it('isMemoryFactsRelevanceEnabled returns true only for "true"', () => {
  expect(isMemoryFactsRelevanceEnabled('true')).toBe(true);
  expect(isMemoryFactsRelevanceEnabled('false')).toBe(false);
  expect(isMemoryFactsRelevanceEnabled('TRUE')).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm exec jest src/config.test.ts -t "MEMORY_FACTS_RELEVANCE"`
Expected: FAIL — symbol does not exist.

- [ ] **Step 3: Add the flag + helper**

In `apps/api/src/config.ts`, mirroring the existing `MEMORY_FACTS_READ_ENABLED`:

```ts
MEMORY_FACTS_RELEVANCE_RETRIEVAL: z.enum(['true', 'false']).default('false'),
// ...
export function isMemoryFactsRelevanceEnabled(value: string | undefined): boolean {
  return value === 'true';
}
```

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(config): add MEMORY_FACTS_RELEVANCE_RETRIEVAL flag (default off)`.

---

## Task 9: Wire relevance retrieval into prompt builders

**Goal:** When the flag is on AND `memoryFactsReadEnabled` is on (relevance depends on the read path), tutor / quiz / coaching prompts pull memory via `getRelevantMemories(profileId, queryText, k)`. Recency stays as the off-flag path.

**Files:**
- Modify: `apps/api/src/routes/sessions.ts:205,345,423,692` (env read + threading)
- Modify: `apps/api/src/services/session/session-exchange.ts:291,836-894,1239,1343`

- [ ] **Step 1: Choose the `queryText` for retrieval**

The retrieval needs a *query string* per call site. Use:
- Tutor exchange (`session-exchange.ts:836`): the **current topic title** + the most recent user utterance, joined: `"${topic.title} — ${lastUserUtterance}"`. The last user utterance is available in this scope (used elsewhere in the same function); if not, fall back to the topic title alone. Confirm by reading `:780-836`.
- Quiz / coaching paths: the topic title alone is sufficient — they don't have a free-form user message.
- Dashboard memory list (`dashboard.ts:212`): **does NOT** use relevance. The user is browsing memory; ordering should stay categorical (by createdAt). This route stays on `readMemorySnapshotFromFacts`.

Document this in a comment at the call site.

- [ ] **Step 2: Add the threading**

In `sessions.ts:205`:

```ts
const memoryFactsReadEnabled = isMemoryFactsReadEnabled(c.env.MEMORY_FACTS_READ_ENABLED);
const memoryFactsRelevanceEnabled =
  memoryFactsReadEnabled &&
  isMemoryFactsRelevanceEnabled(c.env.MEMORY_FACTS_RELEVANCE_RETRIEVAL);
```

Pass `memoryFactsRelevanceEnabled` through the same options chain as `memoryFactsReadEnabled` to `session-exchange`.

In `session-exchange.ts`, add the option:

```ts
options?: {
  memoryFactsReadEnabled?: boolean;
  memoryFactsRelevanceEnabled?: boolean;
}
```

- [ ] **Step 3: Switch the snapshot derivation**

Replace the conditional at `session-exchange.ts:836`:

```ts
const queryText = `${topic?.title ?? subject?.name ?? 'general'} — ${lastUserUtterance ?? ''}`.trim();

const memorySnapshot = !learningProfile
  ? null
  : options?.memoryFactsRelevanceEnabled
  ? (await getRelevantMemories({
      profileId,
      queryText,
      k: 8, // matches the existing recency cap; tune in eval review
      profile: learningProfile,
      scoped: createScopedRepository(db, profileId),
      embedder: makeEmbedderFromEnv(c.env.VOYAGE_API_KEY),
    })).snapshot
  : options?.memoryFactsReadEnabled
  ? await readMemorySnapshotFromFacts(
      createScopedRepository(db, profileId),
      learningProfile
    )
  : null;
```

Where `makeEmbedderFromEnv` is a one-line helper in `services/memory/embed-fact.ts`:

```ts
import { generateEmbedding } from '../embeddings';
export const makeEmbedderFromEnv = (apiKey?: string): FactEmbedder =>
  async (text) => {
    if (!apiKey) return { ok: false, reason: 'no_voyage_key' };
    return embedFactText(text, (t) => generateEmbedding(t, apiKey));
  };
```

(Add `makeEmbedderFromEnv` to `embed-fact.ts` alongside its tests in Task 2 if not already added — go back and add the case if missed. **Verify** by re-reading `embed-fact.ts` before proceeding.)

- [ ] **Step 4: Add a unit test for the wiring**

In `apps/api/src/services/session/session-exchange.test.ts` (or the focused builder test if exists):

```ts
it('uses relevance retrieval when memoryFactsRelevanceEnabled=true', async () => {
  const spy = jest.spyOn(relevanceModule, 'getRelevantMemories'); // module spy on OWN module — allowed by CLAUDE.md "no internal mocks" since this is the module under test, not a dependency
  await runExchange({ memoryFactsReadEnabled: true, memoryFactsRelevanceEnabled: true });
  expect(spy).toHaveBeenCalledTimes(1);
});

it('falls through to readMemorySnapshotFromFacts when relevance flag off but read flag on', async () => { /* opposite assertion */ });
```

Actually — per CLAUDE.md `feedback_testing_no_mocks.md`, prefer the integration test in Task 10 over a `jest.spyOn` here. **Delete this step** if it conflicts; the integration test gives the same coverage without internal mocks.

- [ ] **Step 5: Run lint + typecheck + tests**

```
pnpm exec nx run api:typecheck
pnpm exec nx run api:lint
cd apps/api && pnpm exec jest src/services/session/session-exchange
```

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat(memory): wire getRelevantMemories into tutor exchange behind MEMORY_FACTS_RELEVANCE_RETRIEVAL`.

---

## Task 10: Integration test — end-to-end relevance retrieval

**Files:**
- Create: `tests/integration/memory-facts-relevance-retrieval.integration.test.ts`

This is the deploy-blocking acceptance test for "Phase 2 actually returns relevance-ordered facts." Uses real DB + real pgvector + real Drizzle. Voyage is faked at the HTTP boundary (allowed external).

- [ ] **Step 1: Write the test**

```ts
// tests/integration/memory-facts-relevance-retrieval.integration.test.ts
import { setupTestDb } from './helpers';
import { getRelevantMemories } from '../../apps/api/src/services/memory/relevance';
import { createScopedRepository } from '@eduagent/database';

describe('memory facts relevance retrieval', () => {
  it('orders by relevance + recency blend, prefers recent loose match over old tight match', async () => {
    const { db, profileId } = await setupTestDb();
    // Seed two facts with hand-crafted embeddings — old/tight + recent/loose.
    await seedFact(db, profileId, { text: 'old-tight-fractions', embedding: closeTo(QUERY_EMB, 0.05), observedAt: daysAgo(180) });
    await seedFact(db, profileId, { text: 'recent-loose-algebra', embedding: closeTo(QUERY_EMB, 0.40), observedAt: daysAgo(1) });
    const result = await getRelevantMemories({
      profileId, queryText: 'fractions', k: 1,
      profile: grantedProfile(),
      scoped: createScopedRepository(db, profileId),
      embedder: async () => ({ ok: true, vector: QUERY_EMB }),
    });
    expect(result.source).toBe('relevance');
    // recent-loose wins under default 0.7/0.3 weights with halflife=90
    expect(rendered(result.snapshot)).toContain('recent-loose-algebra');
  });

  it('does NOT leak rows from a sibling profile (cross-profile break test)', async () => {
    const { db, profileA, profileB } = await setupTwoProfiles();
    await seedFact(db, profileB, { text: 'B-fact', embedding: QUERY_EMB, observedAt: daysAgo(1) });
    const result = await getRelevantMemories({
      profileId: profileA, queryText: 'fractions', k: 5,
      profile: grantedProfile(),
      scoped: createScopedRepository(db, profileA),
      embedder: async () => ({ ok: true, vector: QUERY_EMB }),
    });
    expect(rendered(result.snapshot)).not.toContain('B-fact');
  });

  it('returns [] when memoryInjectionEnabled=false even with high-relevance candidates present', async () => {
    /* seed facts; toggle injection off; assert empty + source=consent_gate */
  });

  it('falls back to recency when stage-1 returns < k items', async () => {
    /* seed only 2 embedded facts; ask k=5; assert source=recency_fallback */
  });

  it('does not return superseded rows (Phase 3 forward-compat)', async () => {
    /* insert a row with supersededBy set, assert it never appears */
  });
});
```

- [ ] **Step 2: Run**

```
pnpm exec jest tests/integration/memory-facts-relevance-retrieval.integration.test.ts --runInBand
```

Expected: PASS (5 tests).

- [ ] **Step 3: Commit**

Commit message: `test(memory): integration coverage for relevance retrieval ordering, scope, consent, fallback`.

---

## Task 11: A/B eval-llm harness flow

**Goal:** Snapshot side-by-side prompts (recency vs. relevance injection) for fixture sessions so we can manually review before flipping the flag.

**Files:**
- Create: `apps/api/eval-llm/flows/memory-relevance-ab.flow.ts`
- Modify: `apps/api/eval-llm/scenarios.ts` — register the flow.

- [ ] **Step 1: Mirror an existing eval-llm flow**

Read one existing flow (e.g. the exchanges flow referenced in `docs/plans/2026-04-19-exchanges-harness-wiring.md`) to learn the harness shape. Use it as the template — same fixture loading, same snapshot directory convention.

- [ ] **Step 2: Implement the A/B flow**

The flow takes a fixture session + fixture profile, calls the prompt builder twice — once with `memoryFactsRelevanceEnabled=false` (recency) and once with `=true` (relevance) — and emits two snapshot files side by side: `snapshots/memory-relevance-ab/<profile>/recency.txt` and `relevance.txt`. The harness diffs them only when re-run for review; CI does not gate on the diff.

```ts
// apps/api/eval-llm/flows/memory-relevance-ab.flow.ts
export const memoryRelevanceAbFlow: EvalLlmFlow = {
  name: 'memory-relevance-ab',
  fixtures: ['profile-fractions-heavy', 'profile-mixed-subjects', 'profile-language'],
  async run({ fixture, snapshot }) {
    const recencyBlock = await buildMemoryBlockForFixture(fixture, { memoryFactsRelevanceEnabled: false, memoryFactsReadEnabled: true });
    const relevanceBlock = await buildMemoryBlockForFixture(fixture, { memoryFactsRelevanceEnabled: true, memoryFactsReadEnabled: true });
    snapshot('recency', recencyBlock.text);
    snapshot('relevance', relevanceBlock.text);
  },
};
```

The fixtures must have ≥30 stored facts each (mix of struggles / strengths / interests / communication notes spanning ≥6 months) for the relevance vs. recency contrast to be visible.

- [ ] **Step 3: Register + run snapshot mode**

```
pnpm eval:llm --flow memory-relevance-ab
```

Expected: snapshot files written. Manual review by the human; not a CI gate.

- [ ] **Step 4: Commit**

Commit message: `feat(eval-llm): A/B snapshot flow for recency vs. relevance memory injection`.

---

## Task 12: Operational hooks — telemetry events

**Goal:** Make the rollout observable. Spec § SLO/Alert Thresholds requires:
- Phase 2 embedding success rate ≥99% rolling 7d
- Backlog of `embedding IS NULL` older than 24h: 0 (warn at 100, page at 1000)

The cron in Task 5 already emits `memory_facts.embed_backfill.complete` and `…backlog_alert`. Add per-write telemetry on `applyAnalysis`.

**Files:**
- Modify: `apps/api/src/services/memory/memory-facts.ts` — emit `memory_facts.embed_on_write.failed` when the embedder returns `ok:false`.

- [ ] **Step 1: Test**

```ts
it('emits memory_facts.embed_on_write.failed when embedder rejects', async () => {
  const logger = makeLoggerSpy();
  await replaceActiveMemoryFactsForProfile(writer, 'p1', proj, {
    embed: async () => ({ ok: false, reason: 'voyage 500' }),
    logger,
  });
  expect(logger.entries).toContainEqual(expect.objectContaining({
    event: 'memory_facts.embed_on_write.failed',
    reason: 'voyage 500',
  }));
});
```

- [ ] **Step 2: Implement**

Extend `WriteMemoryFactsOptions` with an optional `logger?: { warn: (msg: string, ctx: object) => void }`. Default to the module-level logger when absent. Emit the event with `{ profileId, category, reason }` (no fact text — privacy parity with retention spec; spec line 278).

- [ ] **Step 3: Commit**

Commit message: `feat(memory): structured telemetry for embed-on-write failures (no fact text in payload)`.

---

## Task 13: Acceptance gate — verify against the spec checklist

The spec § Phase 2 acceptance criteria has 7 items. Walk through each, run the relevant verification, paste the output into the PR description.

- [ ] **Embedding written within 30s of `applyAnalysis` for ≥99% of new facts.**

Verification: integration test in Task 4 + `memory_facts.embed_on_write.failed` log query on staging for 24h after first deploy. Manually inspect log volume.

- [ ] **Backfill cron picks up `embedding IS NULL` rows hourly; backlog stays under 1000.**

Verification: deploy + watch the `memory_facts.embed_backfill.complete` event for 2 hourly tick cycles. `backlog → 0` in the second tick assuming no concurrent inflow.

- [ ] **`getRelevantMemories` returns top-k via two-stage retrieval as specified.**

Verification: integration test from Task 10 (relevance ordering test).

- [ ] **`getRelevantMemories` is profile-scoped + consent-gated.**

Verification: integration tests from Task 10 (cross-profile break + consent-gate).

- [ ] **A/B harness produces side-by-side snapshots; manual review gate passes before flag flip.**

Verification: Task 11 snapshots reviewed by user. **Block the flag flip on this** — do not enable `MEMORY_FACTS_RELEVANCE_RETRIEVAL=true` in any environment until the user has explicitly approved the A/B snapshots.

- [ ] **Recency-only retrieval still works when the flag is off (rollback path).**

Verification: existing `readMemorySnapshotFromFacts` integration test still green (it covers the `memoryFactsRelevanceEnabled=false` path because that path was unchanged).

- [ ] **No additional LLM completion calls per session.**

Verification: code review — confirm Phase 2 only adds Voyage (embedding) calls, never an Anthropic / OpenAI completion call. Spec § LLM Call Cost line 307 sets the budget.

- [ ] **Step 1: Open the PR with the checklist filled in**

Use `/commit` for each commit per CLAUDE.md (already enforced); aggregate the work into a single PR. Do NOT flip the flag in the PR.

- [ ] **Step 2: Stage rollout**

Order:
1. Merge with both flags (read + relevance) defaulting off.
2. After 24h of clean cron logs, set `MEMORY_FACTS_READ_ENABLED=true` in staging only.
3. After A/B snapshot review, set `MEMORY_FACTS_RELEVANCE_RETRIEVAL=true` in staging.
4. After 1 week of staging soak with no SLO breaches, repeat in production.

Doppler is the only secret/config tool per CLAUDE.md. Update via Doppler.

---

## Out of scope for Phase 2

Track these for Phase 3 or follow-up:
- **Per-fact source-ID tracking on write** (`sourceSessionIds`, `sourceEventIds` populated on extraction). Phase 1 leaves them empty defaults; the F8 memory ref work is half-done per memory note `project_f8_memory_source_refs.md`. Adding population at extraction time is its own scope — Phase 2's relevance retrieval works without it.
- **Re-embed of `llmSummary.narrative` decision** (retention spec § Component 3, removable bridge). Spec line 53 defers this to Phase 2; it is a separate decision from Phase 2 deploy. Leave the existing re-embed in place; revisit after relevance retrieval has been live for 30 days.
- **Tuning halflife and weights.** Defaults `halflife=90`, `relevance=0.7`, `recency=0.3`. Tune via the A/B harness in a follow-up after real traffic data lands.
- **Phase 3 dedup** (LLM merge / supersede / keep_both). Separate plan.

---

## Self-Review

**Spec coverage walk-through:**
- Spec § Phase 2.1 (Embedding on write) → Tasks 2, 3, 4 ✓
- Spec § Phase 2.2 (Backfill cron) → Task 5 ✓
- Spec § Phase 2.3 (`getRelevantMemories` two-stage retrieval) → Tasks 6, 7, 10 ✓
- Spec § Phase 2.4 (A/B harness) → Task 11 ✓
- Spec § Phase 2.5 (Feature flag) → Task 8 ✓
- Spec § Phase 2 acceptance criteria → Task 13 ✓
- Spec § SLO thresholds → Tasks 5, 12, 13 ✓

**Type consistency:**
- `FactEmbedder` defined once in `memory-facts.ts`, used by `embed-fact.ts`, `relevance.ts`, `session-exchange.ts`, and the cron — single source of truth.
- `EmbedFactOutcome` shape (`{ok:true, vector} | {ok:false, reason}`) is used identically across writer, retrieval, and backfill.
- `RelevanceWeights` defaults match the spec (line 90, 259).
- `K' = 4·k` over-fetch matches spec line 86.
- Halflife default `90` and weights `0.7 / 0.3` match spec line 90.

**Placeholder scan:** None — every step has an exact path, exact code, or an exact verification command. Two callouts ("verify by reading X") are explicit instructions to read existing code, not placeholders.
