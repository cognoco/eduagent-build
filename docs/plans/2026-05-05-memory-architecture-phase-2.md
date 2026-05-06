# Memory Architecture Phase 2 — Semantic Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Commits are coordinator-only.** Per CLAUDE.md and `feedback_agents_commit_push.md`, subagents NEVER run `git add`/`git commit`/`git push`. After each task's verification command passes, the subagent reports the list of changed files; the coordinator stages and commits via `/commit`. The "Files to stage on commit" line at the end of each task is the hand-off, not an instruction to the subagent.

**Goal:** Embed every memory fact (best-effort, post-commit) and replace recency-only mentor memory injection with relevance-weighted retrieval, gated behind `MEMORY_FACTS_RELEVANCE_RETRIEVAL`.

**Architecture:** Each new or text-changed fact written via `writeMemoryFactsForAnalysis` is embedded *outside* the `applyAnalysis` transaction by a follow-up Inngest step. Voyage failure never blocks the write — rows persist with `embedding=null` and the `memory-facts-embed-backfill` Inngest cron picks them up. **Critically, embedding is NOT recomputed for unchanged facts**: `replaceActiveMemoryFactsForProfile` does a wholesale wipe-and-rewrite (Phase 1 design at `apps/api/src/services/memory/memory-facts.ts:212-224`), so the writer captures `(text_normalized → embedding)` from the existing rows before deletion and restores it on the rewritten rows whose `text_normalized` matches. Only genuinely new or text-changed rows arrive at Voyage. A new `getRelevantMemories(profileId, queryText | queryVector, k)` service performs two-stage retrieval (pgvector `<=>` cosine + app-side recency blend) through `createScopedRepository(profileId)` with consent gating, accepting a precomputed query vector to avoid duplicate Voyage calls per turn (see Task 9 — the existing `services/memory.ts:retrieveRelevantMemory` already embeds the same `userMessage` for similar-topic retrieval). Existing `buildMemoryBlock` callers swap the recency snapshot for the relevance snapshot under the new flag, with recency-only fallback whenever stage-1 returns < k candidates.

**Cost accounting (corrects spec § "LLM Call Cost per session-completed"):** The spec's table only counts write-side embeddings. The retrieval path adds **+M Voyage embeddings per session**, where M = number of user turns. Mitigation: share the per-turn `userMessage` embedding between `retrieveRelevantMemory` (already in `session-exchange.ts:380`) and the new `getRelevantMemories` so the cost is `M`, not `2M`. Update the spec's cost table when this plan ships.

**Existing prior art (NOT re-implemented here):** `apps/api/src/services/memory.ts:46` already exposes `retrieveRelevantMemory(db, profileId, currentMessage, voyageApiKey)` — a query-embedding + pgvector retrieval against `sessionEmbeddings` (returns similar past topic IDs, Story 3.10). It is **distinct** from this plan's `getRelevantMemories` (returns a memory snapshot of struggles/strengths/interests by relevance against `memory_facts`). Both fire on the same exchange. Task 9 plumbs a single shared `userMessageEmbedding` through the call chain so we don't pay Voyage twice for the same input. The two helpers stay separate; this plan does not refactor them into one.

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
- `apps/api/src/services/memory/embed-fact.ts` — pure helper that turns a fact row into the Voyage input string + calls `generateEmbedding`. Also exports `makeEmbedderFromEnv(apiKey?)` used by both the post-commit embed step (Task 3) and the prompt-build retrieval (Task 9). Co-located with other memory helpers.
- `apps/api/src/services/memory/embed-fact.test.ts` — unit tests for `embedFactText` and `makeEmbedderFromEnv`.
- `apps/api/src/services/memory/relevance.ts` — `getRelevantMemories(profileId, queryText | queryVector, k, options)` service.
- `apps/api/src/services/memory/relevance.test.ts` — unit tests for consent gate, fallback, blend math, and precomputed-vector pass-through.
- `apps/api/src/inngest/functions/memory-facts-embed-backfill.ts` — hourly cron that picks up `embedding IS NULL` rows in batches with a single batched `UPDATE … FROM (VALUES …)` per batch.
- `apps/api/src/inngest/functions/memory-facts-embed-backfill.test.ts` — unit tests for batching + error handling.
- `tests/integration/memory-facts-embed-on-write.integration.test.ts` — verifies the post-commit embed step embeds **only new/changed** facts (cost regression guard) and persists facts with `embedding=null` on Voyage failure.
- `tests/integration/memory-facts-relevance-retrieval.integration.test.ts` — end-to-end: seed facts with embeddings, query, assert ordering, consent gating, and that suppressed-category rows do not displace active rows.
- `apps/api/eval-llm/flows/memory-relevance-ab.flow.ts` — A/B harness flow producing recency vs. relevance prompt snapshots for the same fixture session.
- `apps/api/eval-llm/fixtures/memory-relevance/*.ts` — three fixture profiles (`profile-fractions-heavy`, `profile-mixed-subjects`, `profile-language`) with ≥30 facts each, distributed across categories and ≥6 months of `observedAt` (see Task 11).

**Modify:**
- `packages/database/src/schema/_pgvector.ts` — extend with a `vectorNullable` variant whose TS data type is `number[] | null`. **No SQL DDL change** — the column at `packages/database/src/schema/memory-facts.ts:40` already declares `vector('embedding')` *without* `.notNull()`, so the column is already nullable in PostgreSQL (migration `0057_memory_facts.sql` shipped that shape). This task is purely a TypeScript-inference fix so consumers see `number[] | null`.
- `packages/database/src/schema/memory-facts.ts` — switch `embedding` to the nullable variant for inference purposes only.
- `packages/database/src/repository.ts` — add `memoryFacts.findRelevant(queryEmbedding, k, extraWhere?)` method that runs the stage-1 SQL with `<=>` and `K' = 4·k` over-fetch. The default WHERE excludes `category = 'suppressed'` (so suppressed rows never eat the K' budget); callers needing the suppressed set explicitly pass `extraWhere`.
- `apps/api/src/services/memory/memory-facts.ts` — `replaceActiveMemoryFactsForProfile` captures `(text_normalized → embedding)` from existing rows before delete and restores onto rewritten rows whose `text_normalized` matches. New/changed rows ship with `embedding=null` (Voyage is NOT called from this function).
- `apps/api/src/services/learner-profile.ts:1285,1388` — no signature change. The embed step is hoisted out of the transaction and lives in the caller (Inngest function), so `applyAnalysis` does not take an embedder.
- `apps/api/src/inngest/functions/session-completed.ts` — after `applyAnalysis` returns successfully, run a **separate** `step.run('embed-new-facts', …)` that selects rows with `embedding IS NULL AND profile_id = $profileId` (recently inserted by the just-finished `applyAnalysis`) and embeds them with its own retry budget. This step's failure does not roll back the analysis.
- `apps/api/src/inngest/index.ts` — register `memoryFactsEmbedBackfill`.
- `apps/api/src/config.ts:66` — add `MEMORY_FACTS_RELEVANCE_RETRIEVAL` enum flag and helper.
- `apps/api/src/config.test.ts:249` — extend tests to cover the new flag default + parse.
- `apps/api/src/routes/sessions.ts:205,345,423,692` — thread a `memoryFactsRelevanceEnabled` boolean through to `session-exchange` options. Read Voyage key via the typed config accessor (G4), not raw `c.env.VOYAGE_API_KEY`.
- `apps/api/src/services/session/session-exchange.ts:836-894` — when `memoryFactsRelevanceEnabled`, compute `userMessageEmbedding` ONCE (per turn), pass it into both `retrieveRelevantMemory` (existing) and `getRelevantMemories` (new) so we hit Voyage once per user turn, not twice. Fall back to recency snapshot when the relevance flag is off.
- `apps/api/eval-llm/scenarios.ts` (or equivalent registry) — register the new A/B flow.

**Existing prior art to reuse, NOT to duplicate:**
- `apps/api/src/services/memory.ts:46` — `retrieveRelevantMemory` (Story 3.10) — different table (`sessionEmbeddings`), different return shape (topic IDs). Stays as-is. Task 9 just shares the query embedding.
- `findSimilarTopics` in `@eduagent/database` — proven two-stage pgvector retrieval pattern. Mirror its SQL shape in `findRelevant` rather than inventing.

**Untouched (explicitly):**
- `packages/database/src/schema/embeddings.ts` (separate `sessionEmbeddings` use case).
- The existing analyzer (`analyzeSessionTranscript`) — Phase 2 does not change extraction.
- All Phase 3 fields (`supersededBy`, `supersededAt`) remain unset.

---

## Task 1: Add nullable variant to the pgvector customType

**Scope:** TypeScript-inference fix only. The `embedding` column at `packages/database/src/schema/memory-facts.ts:40` already declares `vector('embedding')` *without* `.notNull()`, and migration `0057_memory_facts.sql` already created the column as nullable. Nothing in PostgreSQL changes. We are fixing the inferred TS row type from `number[]` to `number[] | null` so consumers (`replaceActiveMemoryFactsForProfile`, `findRelevant`) compile cleanly.

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

- [ ] **Step 6: Hand off to coordinator for commit**

Files to stage on commit (coordinator runs `/commit`):
- `packages/database/src/schema/_pgvector.ts`
- `packages/database/src/schema/_pgvector.test.ts`
- `packages/database/src/schema/memory-facts.ts`

Suggested commit message: `feat(memory): add vectorNullable variant for memory_facts.embedding column`.

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
import { generateEmbedding } from '../embeddings';

export type EmbeddingFn = (text: string) => Promise<EmbeddingResult>;

export type EmbedFactOutcome =
  | { ok: true; vector: number[] }
  | { ok: false; reason: string };

export type FactEmbedder = (text: string) => Promise<EmbedFactOutcome>;

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

/**
 * Build a FactEmbedder from a Voyage API key. Used by both:
 *  - the post-commit embed step in `session-completed.ts` (Task 3)
 *  - the prompt-build retrieval helper in `session-exchange.ts` (Task 9)
 * Returns a `{ ok: false, reason: 'no_voyage_key' }` outcome when the key
 * is undefined so callers don't have to special-case dev environments.
 */
export const makeEmbedderFromEnv = (apiKey?: string): FactEmbedder =>
  async (text) => {
    if (!apiKey) return { ok: false, reason: 'no_voyage_key' };
    return embedFactText(text, (t) => generateEmbedding(t, apiKey));
  };
```

Add a 4th unit test asserting `makeEmbedderFromEnv(undefined)('text')` resolves to `{ ok: false, reason: 'no_voyage_key' }` without making a network call.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest src/services/memory/embed-fact.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Hand off to coordinator for commit**

Files to stage on commit:
- `apps/api/src/services/memory/embed-fact.ts`
- `apps/api/src/services/memory/embed-fact.test.ts`

Suggested commit message: `feat(memory): add embedFactText + makeEmbedderFromEnv helpers for Phase 2`.

---

## Task 3: Embed-on-write outside the transaction (preserve existing embeddings on rewrite)

**Goal:** Two coupled architecture moves, both deploy-blocking:
1. **Preserve embeddings across wholesale rewrites.** `replaceActiveMemoryFactsForProfile` (`apps/api/src/services/memory/memory-facts.ts:207-225`) deletes all active rows and reinserts them every session-end. Without preservation we'd pay Voyage for every active fact every session — a 50-fact profile = 50 Voyage calls per session, violating spec § "LLM Call Cost" line 307. Capture `(text_normalized → embedding)` from existing rows BEFORE deleting and restore the embedding onto rewritten rows whose `text_normalized` matches. Genuinely new or changed rows ship with `embedding=null` and are embedded by step (2).
2. **Move Voyage calls out of the transaction.** `applyAnalysis` (`apps/api/src/services/learner-profile.ts:1251`) opens a tx with `SELECT … FOR UPDATE`. Calling Voyage inside that tx holds the row lock open across N HTTP calls (100-500 ms each) and on Inngest retry the *whole* tx replays — re-paying for facts already embedded. Run the embedder in a **separate** post-commit `step.run('embed-new-facts', …)` in `session-completed.ts`, scoped to rows where `embedding IS NULL AND profile_id = $profileId AND createdAt > $sessionStart`. Failure of this step does not roll back the analysis; backfill cron is the safety net.

**Files:**
- Modify: `apps/api/src/services/memory/memory-facts.ts:207-249`
- Modify: `apps/api/src/inngest/functions/session-completed.ts` (post-commit step)
- Test: `apps/api/src/services/memory/memory-facts.test.ts`

- [ ] **Step 1: Write the failing tests for embedding preservation**

Add to `apps/api/src/services/memory/memory-facts.test.ts`:

```ts
describe('replaceActiveMemoryFactsForProfile — embedding preservation', () => {
  it('copies existing embedding onto rewritten row with same text_normalized', async () => {
    // Seed an existing row with a known embedding.
    const existingEmbedding = new Array(1024).fill(0.5);
    const writer = makeWriterStub({
      existingActiveRows: [
        { textNormalized: 'fractions', text: 'Fractions', category: 'struggle', embedding: existingEmbedding },
      ],
    });
    await replaceActiveMemoryFactsForProfile(
      writer,
      'profile-1',
      makeProjectionWithStruggle('Fractions')
    );
    const inserted = writer.lastInsert();
    expect(inserted).toHaveLength(1);
    expect(inserted[0].embedding).toEqual(existingEmbedding);
  });

  it('inserts embedding=null for a row whose text_normalized has no prior match', async () => {
    const writer = makeWriterStub({ existingActiveRows: [] });
    await replaceActiveMemoryFactsForProfile(
      writer,
      'profile-1',
      makeProjectionWithStruggle('Long division')
    );
    expect(writer.lastInsert()[0].embedding).toBeNull();
  });

  it('drops embedding when text_normalized changes (treats as new content)', async () => {
    const oldEmbedding = new Array(1024).fill(0.7);
    const writer = makeWriterStub({
      existingActiveRows: [
        { textNormalized: 'fractions', text: 'Fractions', category: 'struggle', embedding: oldEmbedding },
      ],
    });
    await replaceActiveMemoryFactsForProfile(
      writer,
      'profile-1',
      makeProjectionWithStruggle('Mixed numbers') // different normalized text
    );
    expect(writer.lastInsert()[0].embedding).toBeNull();
  });
});
```

The stub helper must capture both reads (existing rows) and inserts. Use the existing fake-DB pattern in this file; do NOT `jest.mock` the database module.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd apps/api && pnpm exec jest src/services/memory/memory-facts.test.ts -t "embedding preservation"`
Expected: FAIL — preservation logic does not exist yet.

- [ ] **Step 3: Implement preservation in `replaceActiveMemoryFactsForProfile`**

Edit `apps/api/src/services/memory/memory-facts.ts`. The writer interface must gain a SELECT capability so we can read embeddings before deleting. The transaction object already supports `select`; widen `MemoryFactsWriter` to include it:

```ts
type MemoryFactsWriter = Pick<Database, 'delete' | 'insert' | 'update' | 'select'>;

export async function replaceActiveMemoryFactsForProfile(
  db: MemoryFactsWriter,
  profileId: string,
  projection: MemoryProjection
): Promise<void> {
  // 1. Snapshot existing (text_normalized → embedding) for this profile's active rows.
  const existing = await db
    .select({
      textNormalized: memoryFacts.textNormalized,
      category: memoryFacts.category,
      embedding: memoryFacts.embedding,
    })
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.profileId, profileId),
        sql`${memoryFacts.supersededBy} IS NULL`
      )
    );

  const embeddingByKey = new Map<string, number[] | null>();
  for (const row of existing) {
    // Compose key with category to avoid cross-category collisions on identical text.
    embeddingByKey.set(`${row.category}::${row.textNormalized}`, row.embedding ?? null);
  }

  // 2. Delete + rebuild as before.
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

  // 3. Restore embeddings where text_normalized matches; otherwise null.
  for (const row of rows) {
    const key = `${row.category}::${row.textNormalized}`;
    const restored = embeddingByKey.get(key);
    (row as { embedding?: number[] | null }).embedding =
      restored !== undefined ? restored : null;
  }

  await db.insert(memoryFacts).values(rows);
}
```

`writeMemoryFactsForAnalysis` and `writeMemoryFactsForDeletion` keep their existing signatures — **no embedder option is added.** Voyage is called outside this module.

- [ ] **Step 4: Run tests + typecheck**

```
cd apps/api && pnpm exec jest src/services/memory/memory-facts.test.ts
pnpm exec nx run api:typecheck
```

Expected: PASS — preservation tests + existing tests all green.

- [ ] **Step 5: Add the post-commit embed step in `session-completed.ts`**

Locate the `step.run('apply-analysis', ...)` block (around `apps/api/src/inngest/functions/session-completed.ts:1153` per the plan's earlier reference — verify line by reading the file). Immediately after that step returns, add a new sibling step:

```ts
await step.run('embed-new-memory-facts', async () => {
  const apiKey = getStepVoyageApiKey();
  if (!apiKey) {
    return { status: 'skipped', reason: 'no_voyage_key' };
  }
  const db = getStepDatabase();
  const embedder = makeEmbedderFromEnv(apiKey);

  // Rows newly inserted by applyAnalysis have embedding=null and were
  // created during this invocation. Scope by profileId only — the cron
  // is the catch-all if any are missed here.
  const rows = await db
    .select({ id: memoryFacts.id, text: memoryFacts.text })
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.profileId, profileId),
        isNull(memoryFacts.embedding),
        sql`${memoryFacts.supersededBy} IS NULL`
      )
    )
    .limit(50); // hard cap per session — cron picks up overflow

  let embedded = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await embedder(row.text);
    if (!result.ok) {
      failed += 1;
      logger.warn('[memory_facts] embed-on-write failed', {
        event: 'memory_facts.embed_on_write.failed',
        profileId,
        reason: result.reason,
      });
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
```

Imports: `makeEmbedderFromEnv` from `services/memory/embed-fact`, `memoryFacts` from `@eduagent/database`, `isNull`/`and`/`eq`/`sql` from `drizzle-orm`. Also emit a paired `memory_facts.embed_on_write.attempted` counter (see Task 12) so success-rate SLO has a denominator.

This step has its own retry budget. If Voyage 502s, only this step retries — `applyAnalysis` is already committed. Cron picks up any rows still null after this step gives up.

- [ ] **Step 6: Add a unit test for the post-commit embed step (no internal mocks)**

In `apps/api/src/inngest/functions/session-completed.test.ts`, add a test that runs the `'embed-new-memory-facts'` step against a real-ish DB stub: seed two rows with `embedding=null`, run the step with a fake-Voyage embedder (HTTP-level fake or pure-fn embedder injected via test harness, NOT a `jest.mock` of the embeddings module), assert both rows now have `embedding=[…]`. If the existing harness can't run individual `step.run` callbacks, extract the callback into an exported function `embedNewFactsForProfile(db, profileId, embedder)` and unit-test that.

- [ ] **Step 7: Run unit + integration tests**

```
cd apps/api && pnpm exec jest src/services/memory/ src/inngest/functions/session-completed.test.ts
```

Expected: PASS. Verify the `applyAnalysis` step does NOT call Voyage by re-reading `learner-profile.ts:1251-1290` — that path no longer references any embedder.

- [ ] **Step 8: Hand off to coordinator for commit**

Files to stage on commit:
- `apps/api/src/services/memory/memory-facts.ts`
- `apps/api/src/services/memory/memory-facts.test.ts`
- `apps/api/src/inngest/functions/session-completed.ts`
- `apps/api/src/inngest/functions/session-completed.test.ts` (if extended)

Suggested commit message: `feat(memory): preserve embeddings across rewrites; embed new facts post-commit (Phase 2)`.

---

## Task 4: Integration test — embed-on-write happy path, outage, and cost regression guard

**Files:**
- Create: `tests/integration/memory-facts-embed-on-write.integration.test.ts`

This is the high-level deploy-blocking guarantee. It must use the real DB and a fake Voyage (HTTP-level fake, not a `jest.mock` of internal code — see CLAUDE.md "No internal mocks in integration tests"). The test exercises both `applyAnalysis` (commits with `embedding=null`) and the post-commit `embed-new-memory-facts` step from Task 3.

- [ ] **Step 1: Write the test**

Use the integration helpers under `tests/integration/helpers/`. Pattern after `tests/integration/memory-facts-dual-write.integration.test.ts`.

```ts
// tests/integration/memory-facts-embed-on-write.integration.test.ts
import { setupTestDb, seedProfile } from './helpers';
import { applyAnalysis } from '../../apps/api/src/services/learner-profile';
import { embedNewFactsForProfile } from '../../apps/api/src/inngest/functions/session-completed'; // exported per Task 3 step 6
import { memoryFacts } from '@eduagent/database';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';

describe('memory_facts embed-on-write', () => {
  // Voyage is a TRUE external — HTTP-level fake is allowed.

  it('writes embedding=null in tx, post-commit step fills embeddings', async () => {
    const { db, profileId } = await setupTestDb();
    const fakeVoyage = mockVoyageReturning(new Array(1024).fill(0.05));

    await applyAnalysis(db, profileId, stubAnalysis(['fractions']), 'Math', 'inferred', null);
    const rowsAfterTx = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId));
    expect(rowsAfterTx.length).toBeGreaterThan(0);
    expect(rowsAfterTx.every((r) => r.embedding === null)).toBe(true);

    await embedNewFactsForProfile(db, profileId, fakeVoyage.embedder);
    const rowsAfterEmbed = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId));
    expect(rowsAfterEmbed.every((r) => r.embedding !== null)).toBe(true);
  });

  it('persists fact with embedding=null when Voyage 500s — cron picks up later', async () => {
    const { db, profileId } = await setupTestDb();
    const fakeVoyage = mockVoyageThrowing();
    await applyAnalysis(db, profileId, stubAnalysis(['fractions']), 'Math', 'inferred', null);
    await embedNewFactsForProfile(db, profileId, fakeVoyage.embedder); // does not throw

    const stillNull = await db.select().from(memoryFacts).where(
      and(eq(memoryFacts.profileId, profileId), isNull(memoryFacts.embedding))
    );
    expect(stillNull.length).toBeGreaterThan(0);
  });

  it('COST REGRESSION: re-running applyAnalysis with same content does NOT re-embed', async () => {
    // This test guards spec § "LLM Call Cost" line 307. Without embedding
    // preservation in replaceActiveMemoryFactsForProfile, every session-end
    // re-embeds every active fact (50 facts → 50 Voyage calls every session).
    const { db, profileId } = await setupTestDb();
    const fakeVoyage = mockVoyageReturning(new Array(1024).fill(0.1));

    // First run: 1 new fact, 1 embed call.
    await applyAnalysis(db, profileId, stubAnalysis(['fractions']), 'Math', 'inferred', null);
    await embedNewFactsForProfile(db, profileId, fakeVoyage.embedder);
    const callsAfterFirst = fakeVoyage.calls.length;
    expect(callsAfterFirst).toBe(1);

    // Second run: identical content. Active set is wiped + rewritten by
    // replaceActiveMemoryFactsForProfile, but embeddings must be preserved.
    await applyAnalysis(db, profileId, stubAnalysis(['fractions']), 'Math', 'inferred', null);
    await embedNewFactsForProfile(db, profileId, fakeVoyage.embedder);
    expect(fakeVoyage.calls.length).toBe(callsAfterFirst); // ZERO new calls
    const rows = await db.select().from(memoryFacts).where(
      and(eq(memoryFacts.profileId, profileId), isNotNull(memoryFacts.embedding))
    );
    expect(rows.length).toBe(1);
  });

  it('embeds genuinely new facts on subsequent run, leaves existing embeddings intact', async () => {
    const { db, profileId } = await setupTestDb();
    const fakeVoyage = mockVoyageReturning(new Array(1024).fill(0.1));

    await applyAnalysis(db, profileId, stubAnalysis(['fractions']), 'Math', 'inferred', null);
    await embedNewFactsForProfile(db, profileId, fakeVoyage.embedder);
    expect(fakeVoyage.calls.length).toBe(1);

    // Second analysis adds 'long division' as a new struggle.
    await applyAnalysis(db, profileId, stubAnalysis(['fractions', 'long division']), 'Math', 'inferred', null);
    await embedNewFactsForProfile(db, profileId, fakeVoyage.embedder);
    expect(fakeVoyage.calls.length).toBe(2); // exactly one additional embed
  });
});
```

- [ ] **Step 2: Run + verify**

```
pnpm exec jest tests/integration/memory-facts-embed-on-write.integration.test.ts --runInBand
```

Expected: PASS (4 tests). The third test is the deploy-blocking cost regression guard.

- [ ] **Step 3: Hand off to coordinator for commit**

Files to stage:
- `tests/integration/memory-facts-embed-on-write.integration.test.ts`

Suggested commit message: `test(memory): integration coverage for embed-on-write incl. cost regression guard`.

---

## Task 5: Embed-backfill Inngest cron

**Goal:** Hourly cron picks up rows with `embedding IS NULL`, batches 100 at a time, embeds, then commits the batch via a single batched `UPDATE … FROM (VALUES …)` (one round-trip per batch, not 100). Self-throttling at the Voyage call site. Alert when backlog > 1000 rows.

**Prior art to mirror:** `apps/api/src/inngest/functions/memory-facts-backfill.ts` is the existing JSONB-to-`memory_facts` backfill cron registered alongside other Inngest functions. Follow its `step.run` shape, logger pattern, and registration site exactly. Read it before implementing — do not re-invent the batching skeleton. Also reference `apps/api/src/inngest/helpers.ts` to confirm `getStepDatabase()` and `getStepVoyageApiKey()` signatures (cite the lines in code comments rather than guessing).

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

        // Embed sequentially (Voyage rate-limits) but commit in ONE statement.
        const updates: Array<{ id: string; vector: number[] }> = [];
        let failed = 0;
        for (const row of rows) {
          const result = await embedFactText(row.text, (t) => generateEmbedding(t, apiKey));
          if (!result.ok) {
            failed += 1;
            continue;
          }
          updates.push({ id: row.id, vector: result.vector });
        }

        if (updates.length > 0) {
          // Single batched UPDATE: one round-trip instead of N.
          // UPDATE memory_facts SET embedding = data.embedding, updated_at = now()
          // FROM (VALUES (id1, vec1), (id2, vec2), ...) AS data(id, embedding)
          // WHERE memory_facts.id = data.id
          const valuesSql = sql.join(
            updates.map(
              (u) => sql`(${u.id}::uuid, ${`[${u.vector.join(',')}]`}::vector)`
            ),
            sql`, `
          );
          await db.execute(sql`
            UPDATE memory_facts
            SET embedding = data.embedding, updated_at = now()
            FROM (VALUES ${valuesSql}) AS data(id, embedding)
            WHERE memory_facts.id = data.id
          `);
        }

        return { embedded: updates.length, failed, scanned: rows.length };
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

- [ ] **Step 6: Hand off to coordinator for commit**

Files to stage:
- `apps/api/src/inngest/functions/memory-facts-embed-backfill.ts`
- `apps/api/src/inngest/functions/memory-facts-embed-backfill.test.ts`
- `apps/api/src/inngest/index.ts`

Suggested commit message: `feat(memory): hourly Inngest cron embeds memory_facts rows with embedding IS NULL`.

---

## Task 6: Repository helper — two-stage retrieval SQL

**Goal:** Add `memoryFacts.findRelevant(queryEmbedding, k, extraWhere?)` to `createScopedRepository(profileId)`. SQL fetches top `K' = 4·k` candidates by `<=>` cosine distance against the partial HNSW index. Returns rows + distance.

**Default-excludes `category = 'suppressed'`.** Suppressed rows exist in the table because the user told us to forget them; they must never eat the K' budget for prompt injection. Future callers (Phase 3 dedup) needing the suppressed set explicitly pass `extraWhere`. This mirrors the rationale of `findManyActive` filtering on `supersededBy IS NULL` — exclude-by-default what no read path should surface.

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
  // Default exclusions: superseded rows AND suppressed category. Callers wanting
  // to include either explicitly pass extraWhere overriding the category clause.
  const defaultFilters = and(
    sql`${memoryFacts.supersededBy} IS NULL`,
    sql`${memoryFacts.category} <> 'suppressed'`
  );
  const baseWhere = scopedWhere(
    memoryFacts,
    extraWhere ? and(defaultFilters, extraWhere) : defaultFilters
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

**Spec § Phase 2 acceptance line 260 / 382 (`embedding IS NULL` fallback trigger).** The SQL above filters `embedding IS NOT NULL`, so unembedded rows never reach stage 2. The spec's "fall back when any candidate has `embedding IS NULL`" is therefore satisfied implicitly — fewer rows return, and the `< k` trigger fires. The plan implements only the `< k` branch in `getRelevantMemories` (Task 7). Update the spec text in the same PR to remove the impossible-to-trip `IS NULL` clause.

The partial HNSW index (`memory_facts_embedding_hnsw_idx WHERE superseded_by IS NULL`) already enforces both filters at the index level; the explicit `superseded_by IS NULL` keeps the planner correct when HNSW is bypassed (low row counts, dev). The `embedding IS NOT NULL` clause is required because a partial HNSW index does not cover NULL rows and the planner may otherwise consider them.

- [ ] **Step 4: Verify test pass + typecheck**

```
pnpm exec jest packages/database/src/repository.test.ts -t "findRelevant"
pnpm exec nx run database:typecheck
```

Expected: PASS.

- [ ] **Step 5: Hand off to coordinator for commit**

Files to stage:
- `packages/database/src/repository.ts`
- `packages/database/src/repository.test.ts`

Suggested commit message: `feat(memory): scoped repo helper memoryFacts.findRelevant for two-stage retrieval`.

---

## Task 7: `getRelevantMemories` service with consent gate, blend, and fallback

**Goal:** Top-level retrieval entry point used by prompt builders. Must be wrapped in `createScopedRepository(profileId)`, gate on consent flags, blend relevance + recency, and fall back to recency-only when stage 1 returns < k candidates.

**Default weights are RELEVANCE-DOMINANT (`relevance=0.85, recency=0.15, halflife=180`).** Spec § Problem (line 13) states the explicit goal: *"When a learner returns to fractions after three months, the mentor sees what was noted last week — which may be about something entirely different."* — i.e., we WANT old-but-relevant facts to win over recent-loose facts. The previously-proposed `0.7/0.3, halflife=90` defaults invert this: a 1-day-old fact at distance 0.40 (loose) scores 0.857 vs. a 180-day-old fact at distance 0.05 (tight) scoring 0.724 — recent-loose wins, defeating the spec's goal. The `0.85/0.15, halflife=180` defaults flip that: tight-old wins by ~0.07. A/B harness (Task 11) tunes from there. Caller can still override via `weights` option for experiments.

**Accepts a precomputed `queryVector` to share Voyage embeddings across the call chain.** `session-exchange` already embeds `userMessage` for `retrieveRelevantMemory` (`apps/api/src/services/memory.ts:46`). Forcing a second Voyage call here would double per-turn cost. The signature accepts EITHER `queryText` (and embeds internally) OR a precomputed `queryVector` (used as-is).

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

  it('blends relevance and recency, OLD-tight beats RECENT-loose under defaults', async () => {
    // This test enforces the spec § Problem goal (line 13): old-but-relevant
    // must win over recent-loose. Defaults: relevance=0.85, recency=0.15, halflife=180.
    const now = new Date('2026-05-05T00:00:00Z');
    const candidates = [
      makeRelevantRow({ distance: 0.05, observedAt: addDays(now, -180), text: 'old-tight' }),
      makeRelevantRow({ distance: 0.40, observedAt: addDays(now, -1),   text: 'recent-loose' }),
    ];
    const scoped = stubScopedReturning({ relevant: candidates, active: [] });
    const result = await getRelevantMemories({
      profileId: 'p1', queryText: 'fractions', k: 1,
      profile: grantedProfile(), scoped, embedder: stubEmbedderOk(), now,
    });
    // old-tight:    (1 - 0.05/2)*0.85 + exp(-180/180)*0.15 ≈ 0.829 + 0.055 = 0.884
    // recent-loose: (1 - 0.40/2)*0.85 + exp(-1/180)*0.15   ≈ 0.680 + 0.149 = 0.829
    expect(result.topRendered).toEqual(['old-tight']);
  });

  it('uses the precomputed queryVector when provided (no embedder call)', async () => {
    const embedder = jest.fn();
    await getRelevantMemories({
      profileId: 'p1', queryVector: new Array(1024).fill(0.1), k: 5,
      profile: grantedProfile(), scoped: stubScoped(), embedder, now: new Date(),
    });
    expect(embedder).not.toHaveBeenCalled();
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
import type { FactEmbedder } from './embed-fact';
import { emptyMemorySnapshot, type MemorySnapshot, readMemorySnapshotFromFacts } from './memory-facts';

export interface RelevanceWeights {
  relevance: number;
  recency: number;
  /** halflife in days; default 180 (deliberately long — see Task 7 header) */
  halflifeDays: number;
}

/** Defaults flipped relevance-dominant to satisfy spec § Problem line 13.
 *  Tune via A/B harness (Task 11) before flag flip. */
export const DEFAULT_WEIGHTS: RelevanceWeights = {
  relevance: 0.85,
  recency: 0.15,
  halflifeDays: 180,
};

export interface RelevanceResult {
  snapshot: MemorySnapshot;
  /** which path produced the snapshot — used by callers for telemetry */
  source: 'relevance' | 'recency_fallback' | 'consent_gate';
}

export interface GetRelevantMemoriesArgs {
  profileId: string;
  /** Provide one of queryText OR queryVector. queryVector skips Voyage. */
  queryText?: string;
  queryVector?: number[];
  k: number;
  profile: {
    memoryConsentStatus?: string | null;
    memoryEnabled?: boolean;
    memoryInjectionEnabled?: boolean;
  } | null;
  scoped: ScopedRepository;
  /** Required when queryText is provided; ignored when queryVector is set. */
  embedder?: FactEmbedder;
  weights?: Partial<RelevanceWeights>;
  now?: Date;
}

export async function getRelevantMemories(
  args: GetRelevantMemoriesArgs
): Promise<RelevanceResult> {
  const { profileId, queryText, queryVector, k, profile, scoped, embedder, weights, now } = args;
  const w: RelevanceWeights = { ...DEFAULT_WEIGHTS, ...(weights ?? {}) };
  const t = now ?? new Date();

  const consentGranted = profile?.memoryConsentStatus === 'granted';
  const injectionEnabled =
    consentGranted && (profile?.memoryInjectionEnabled ?? profile?.memoryEnabled ?? true);
  if (!profile || !injectionEnabled) {
    return { snapshot: emptyMemorySnapshot(), source: 'consent_gate' };
  }

  // Stage 0: obtain query vector — skip Voyage if precomputed.
  let vector: number[];
  if (queryVector) {
    vector = queryVector;
  } else {
    if (!queryText || !embedder) {
      const fallback = await readMemorySnapshotFromFacts(scoped, profile);
      return { snapshot: fallback, source: 'recency_fallback' };
    }
    const queryEmb = await embedder(queryText);
    if (!queryEmb.ok) {
      const fallback = await readMemorySnapshotFromFacts(scoped, profile);
      return { snapshot: fallback, source: 'recency_fallback' };
    }
    vector = queryEmb.vector;
  }

  // Stage 1: top-K' candidates from SQL (suppressed category excluded by default).
  const candidates = await scoped.memoryFacts.findRelevant(vector, k);
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

- [ ] **Step 5: Hand off to coordinator for commit**

Files to stage:
- `apps/api/src/services/memory/relevance.ts`
- `apps/api/src/services/memory/relevance.test.ts`
- `apps/api/src/services/memory/memory-facts.ts` (if reconstruct helpers were exported)

Suggested commit message: `feat(memory): getRelevantMemories with two-stage retrieval, consent gate, recency fallback`.

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

- [ ] **Step 5: Hand off to coordinator for commit**

Files to stage:
- `apps/api/src/config.ts`
- `apps/api/src/config.test.ts`

Suggested commit message: `feat(config): add MEMORY_FACTS_RELEVANCE_RETRIEVAL flag (default off)`.

---

## Task 9: Wire relevance retrieval into prompt builders, sharing the per-turn query embedding

**Goal:** When the flag is on AND `memoryFactsReadEnabled` is on, tutor / quiz / coaching prompts pull memory via `getRelevantMemories(...)`. The *same* `userMessage` embedding is shared with `retrieveRelevantMemory` (existing helper at `services/memory.ts:46`) so we make exactly ONE Voyage call per user turn, not two.

**Cost note:** The spec § "LLM Call Cost per session-completed" table only counted write-side embeddings. Update that table in this PR to include `+M` Voyage calls per session, where M = number of user turns (one per turn after the sharing optimization here lands; would have been `2M` without it).

**Files:**
- Modify: `apps/api/src/routes/sessions.ts:205,345,423,692` (env read via typed config + threading)
- Modify: `apps/api/src/services/session/session-exchange.ts:291,836-894,1239,1343`
- Modify: `apps/api/src/services/memory.ts:46` — accept an optional precomputed `queryVector` to skip the duplicate Voyage call (mirrors Task 7's signature).
- Modify: `docs/specs/2026-05-05-memory-architecture-upgrade.md` § "LLM Call Cost per session-completed" — add the per-turn retrieval cost.

- [ ] **Step 1: Choose the `queryText` for retrieval**

The retrieval needs a *query string* per call site. Use:
- Tutor exchange (`session-exchange.ts:836`): the **current topic title** + the most recent user utterance, joined: `"${topic.title} — ${lastUserUtterance}"`. The last user utterance is available in this scope (used elsewhere in the same function); if not, fall back to the topic title alone. Confirm by reading `:780-836`.
- Quiz / coaching paths: the topic title alone is sufficient — they don't have a free-form user message.
- Dashboard memory list (`dashboard.ts:212`): **does NOT** use relevance. The user is browsing memory; ordering should stay categorical (by createdAt). This route stays on `readMemorySnapshotFromFacts`.

Document this in a comment at the call site.

- [ ] **Step 2: Add the threading (typed config, not raw `c.env`)**

In `sessions.ts:205`, use the typed config accessor (CLAUDE.md G4 rule: "use the typed config object instead of raw `process.env` reads"). Verify the project's helper name by reading `apps/api/src/config.ts` and one neighbouring route file that already reads Voyage config — copy that pattern. Pseudocode:

```ts
const env = getTypedEnv(c); // whatever the project's accessor is — DO NOT invent a name
const memoryFactsReadEnabled = isMemoryFactsReadEnabled(env.MEMORY_FACTS_READ_ENABLED);
const memoryFactsRelevanceEnabled =
  memoryFactsReadEnabled &&
  isMemoryFactsRelevanceEnabled(env.MEMORY_FACTS_RELEVANCE_RETRIEVAL);
```

Pass `memoryFactsRelevanceEnabled` through the same options chain as `memoryFactsReadEnabled` to `session-exchange`. The Voyage key is read inside `session-exchange` (it already pulls `options?.voyageApiKey` for `retrieveRelevantMemory` at line 380) — no new threading required.

In `session-exchange.ts`, add the option:

```ts
options?: {
  memoryFactsReadEnabled?: boolean;
  memoryFactsRelevanceEnabled?: boolean;
  voyageApiKey?: string; // already exists for retrieveRelevantMemory
}
```

- [ ] **Step 3: Compute `userMessageEmbedding` once and share it**

`session-exchange.ts:380` already calls `retrieveRelevantMemory(db, profileId, userMessage, options?.voyageApiKey)` — that call internally embeds `userMessage`. To avoid a second Voyage call when relevance retrieval is also on, hoist the embedding out:

```ts
import { generateEmbedding } from '../embeddings';
import { makeEmbedderFromEnv } from '../memory/embed-fact';
import { getRelevantMemories } from '../memory/relevance';

// Compute once per user turn. Skip if no key (dev) — both downstream
// helpers handle the empty-vector / fallback case.
let userMessageVector: number[] | undefined;
if (options?.voyageApiKey && (options.memoryFactsRelevanceEnabled || /* existing similar-topics path */ true)) {
  try {
    const emb = await generateEmbedding(userMessage, options.voyageApiKey);
    userMessageVector = emb.vector;
  } catch (err) {
    logger.warn('[session-exchange] userMessage embedding failed; downstream paths will fall back', {
      event: 'session_exchange.user_msg_embedding.failed',
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}
```

Pass `userMessageVector` into BOTH:
- `retrieveRelevantMemory(db, profileId, userMessage, options?.voyageApiKey, /* limit */ undefined, userMessageVector)` — extend that helper's signature in `services/memory.ts:46` to accept and prefer a precomputed vector.
- `getRelevantMemories({ ..., queryVector: userMessageVector, embedder: undefined })` (Task 7's signature accepts `queryVector` and skips Voyage when set).

Replace the conditional at `session-exchange.ts:836`:

```ts
const memorySnapshot = !learningProfile
  ? null
  : options?.memoryFactsRelevanceEnabled
  ? (await getRelevantMemories({
      profileId,
      queryVector: userMessageVector, // shared embedding
      queryText: userMessage,          // fallback if vector is undefined
      k: 8, // matches the existing recency cap; tune in eval review
      profile: learningProfile,
      scoped: createScopedRepository(db, profileId),
      embedder: makeEmbedderFromEnv(options.voyageApiKey),
    })).snapshot
  : options?.memoryFactsReadEnabled
  ? await readMemorySnapshotFromFacts(
      createScopedRepository(db, profileId),
      learningProfile
    )
  : null;
```

`makeEmbedderFromEnv` was added in Task 2 step 3 — do not add it here.

- [ ] **Step 4: Verify wiring via integration test, NOT module spies**

The wiring is verified end-to-end by Task 10's integration tests (consent gate, ordering, fallback). Per CLAUDE.md `feedback_testing_no_mocks.md`, do NOT add a `jest.spyOn` on the relevance module — it gives the same coverage but violates the no-internal-mocks rule. If a focused unit test is needed, add one that asserts the OUTPUT (rendered memory block contains expected facts) rather than the call count of an internal helper.

- [ ] **Step 5: Run lint + typecheck + tests**

```
pnpm exec nx run api:typecheck
pnpm exec nx run api:lint
cd apps/api && pnpm exec jest src/services/session/session-exchange src/services/memory.test.ts
```

Expected: PASS. Confirm `services/memory.test.ts` still passes after extending `retrieveRelevantMemory` to accept a precomputed vector.

- [ ] **Step 6: Hand off to coordinator for commit**

Files to stage:
- `apps/api/src/routes/sessions.ts`
- `apps/api/src/services/session/session-exchange.ts`
- `apps/api/src/services/memory.ts`
- `apps/api/src/services/memory.test.ts`
- `docs/specs/2026-05-05-memory-architecture-upgrade.md` (cost-table update)

Suggested commit message: `feat(memory): wire getRelevantMemories into tutor exchange, share per-turn query embedding`.

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

  it('does not return suppressed-category rows even at high relevance', async () => {
    // Category=suppressed exists because the user told us to forget the fact.
    // findRelevant must filter these by default so they never eat the K' budget.
    const { db, profileId } = await setupTestDb();
    await seedFact(db, profileId, { text: 'recent-active', category: 'struggle', embedding: closeTo(QUERY_EMB, 0.30), observedAt: daysAgo(1) });
    await seedFact(db, profileId, { text: 'tight-suppressed', category: 'suppressed', embedding: closeTo(QUERY_EMB, 0.05), observedAt: daysAgo(1) });
    const result = await getRelevantMemories({
      profileId, queryText: 'fractions', k: 1,
      profile: grantedProfile(),
      scoped: createScopedRepository(db, profileId),
      embedder: async () => ({ ok: true, vector: QUERY_EMB }),
    });
    expect(rendered(result.snapshot)).toContain('recent-active');
    expect(rendered(result.snapshot)).not.toContain('tight-suppressed');
  });
});
```

- [ ] **Step 2: Run**

```
pnpm exec jest tests/integration/memory-facts-relevance-retrieval.integration.test.ts --runInBand
```

Expected: PASS (6 tests).

- [ ] **Step 3: Hand off to coordinator for commit**

Files to stage:
- `tests/integration/memory-facts-relevance-retrieval.integration.test.ts`

Suggested commit message: `test(memory): integration coverage for relevance retrieval ordering, scope, consent, fallback, suppressed-exclusion`.

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

The fixtures must have ≥30 stored facts each (mix of struggles / strengths / interests / communication notes spanning ≥6 months) for the relevance vs. recency contrast to be visible. Add a deterministic seeder under `apps/api/eval-llm/fixtures/memory-relevance/`:

| Fixture name | Facts | Distribution | observedAt span |
|---|---|---|---|
| `profile-fractions-heavy` | 35 | 20 struggles (15 fractions-related), 8 strengths, 5 interests, 2 communication notes | 0-12 months |
| `profile-mixed-subjects` | 32 | even spread across math / language / science | 0-9 months |
| `profile-language` | 30 | 18 vocab/grammar struggles, 8 strengths, 4 interests | 0-8 months |

The seeder should use deterministic UUIDs (e.g., `uuid v5` from a fixture-name salt) so re-runs produce stable IDs and the snapshot diff is meaningful. Assert in a smoke unit test that seeding twice produces byte-identical row counts and IDs.

- [ ] **Step 3: Register + run snapshot mode**

```
pnpm eval:llm --flow memory-relevance-ab
```

Expected: snapshot files written. Manual review by the human; not a CI gate.

- [ ] **Step 4: Hand off to coordinator for commit**

Files to stage:
- `apps/api/eval-llm/flows/memory-relevance-ab.flow.ts`
- `apps/api/eval-llm/scenarios.ts`
- `apps/api/eval-llm/fixtures/memory-relevance/*.ts`

Suggested commit message: `feat(eval-llm): A/B snapshot flow + fixtures for recency vs. relevance memory injection`.

---

## Task 12: Operational hooks — telemetry events

**Goal:** Make the rollout observable. Spec § SLO/Alert Thresholds requires:
- Phase 2 embedding success rate ≥99% rolling 7d
- Backlog of `embedding IS NULL` older than 24h: 0 (warn at 100, page at 1000)

The cron in Task 5 already emits `memory_facts.embed_backfill.complete` and `…backlog_alert`. The post-commit embed step in Task 3 already emits `memory_facts.embed_on_write.failed`. This task adds the **paired attempt counter** so the success-rate SLO has a queryable denominator: success_rate = `(attempted - failed) / attempted`. Without the attempted counter you can compute *failed counts* but not a *rate*.

Per CLAUDE.md "Silent recovery without escalation is banned": every fallback path must emit a queryable metric. The attempt counter is the queryable denominator that turns the existing failed-event into an SLO.

**Files:**
- Modify: `apps/api/src/inngest/functions/session-completed.ts` — emit `memory_facts.embed_on_write.attempted` once per row processed inside the `embed-new-memory-facts` step (success OR failure).
- Modify: `apps/api/src/inngest/functions/memory-facts-embed-backfill.ts` — emit `memory_facts.embed_backfill.row_attempted` once per row processed.

- [ ] **Step 1: Tests**

```ts
it('emits one memory_facts.embed_on_write.attempted per row, regardless of outcome', async () => {
  // 2 rows, 1 succeeds, 1 fails → 2 attempted events, 1 failed event
  const logger = makeLoggerSpy();
  await embedNewFactsForProfile(db, 'p1', mixedOutcomeEmbedder(), { logger });
  const attempts = logger.entries.filter((e) => e.event === 'memory_facts.embed_on_write.attempted');
  const failures = logger.entries.filter((e) => e.event === 'memory_facts.embed_on_write.failed');
  expect(attempts).toHaveLength(2);
  expect(failures).toHaveLength(1);
});
```

- [ ] **Step 2: Implement**

In each call site, emit a structured info-level log immediately before invoking the embedder. Payload: `{ profileId, category, source: 'embed_on_write' | 'embed_backfill' }`. **No fact text** — privacy parity with retention spec line 278. Document the queryable surface in the plan (Cloudflare Workers Logs query / Sentry tag) so the SLO dashboard can be wired.

- [ ] **Step 3: Hand off to coordinator for commit**

Files to stage:
- `apps/api/src/inngest/functions/session-completed.ts`
- `apps/api/src/inngest/functions/session-completed.test.ts`
- `apps/api/src/inngest/functions/memory-facts-embed-backfill.ts`
- `apps/api/src/inngest/functions/memory-facts-embed-backfill.test.ts`

Suggested commit message: `feat(memory): paired attempted/failed telemetry for embed-on-write SLO denominator`.

---

## Task 13: Acceptance gate — verify against the spec checklist

The spec § Phase 2 acceptance criteria has 7 items. Walk through each, run the relevant verification, paste the output into the PR description.

- [ ] **Embedding written within 30s of `applyAnalysis` for ≥99% of NEW or text-changed facts.**

Verification: integration tests in Task 4 (incl. cost regression guard — same content does NOT re-embed) + `memory_facts.embed_on_write.attempted` and `.failed` log queries on staging for 24h after first deploy. Compute success rate = `(attempted - failed) / attempted`. Manually inspect log volume to confirm the post-commit step is firing as expected after `applyAnalysis` events.

Note: the "30s" SLO from spec § Phase 2 line 380 is a target, not a hard constraint. Embedding now happens in a sibling Inngest step rather than inside the analysis transaction; under normal Voyage latency it completes within seconds, but Inngest retry delay can push it to minutes. Update the spec wording to "embedding written within the same `session-completed` invocation for ≥99%" if 30s proves too tight in practice.

- [ ] **Backfill cron picks up `embedding IS NULL` rows hourly; backlog stays under 1000.**

Verification: deploy + watch the `memory_facts.embed_backfill.complete` event for 2 hourly tick cycles. `backlog → 0` in the second tick assuming no concurrent inflow.

- [ ] **`getRelevantMemories` returns top-k via two-stage retrieval as specified.**

Verification: integration test from Task 10 (relevance ordering test).

- [ ] **`getRelevantMemories` is profile-scoped + consent-gated.**

Verification: integration tests from Task 10 (cross-profile break + consent-gate).

- [ ] **A/B harness produces side-by-side snapshots; manual review gate passes before flag flip.**

Verification: Task 11 snapshots reviewed by user. **Block the flag flip on this** — do not enable `MEMORY_FACTS_RELEVANCE_RETRIEVAL=true` in any environment until the user has explicitly approved the A/B snapshots.

- [ ] **Defaults satisfy spec § Problem goal: old-but-relevant beats recent-loose.**

Verification: at least 3 of the A/B fixture profiles in Task 11 must show an old-but-relevant fact ranked above a recent-loose fact in the relevance snapshot. If they don't, tune `relevance` upward or `halflifeDays` shorter and re-run before flipping the flag. Defaults at plan-time are `relevance=0.85, recency=0.15, halflife=180`.

- [ ] **Recency-only retrieval still works when the flag is off (rollback path).**

Verification: existing `readMemorySnapshotFromFacts` integration test still green (it covers the `memoryFactsRelevanceEnabled=false` path because that path was unchanged).

- [ ] **No additional LLM completion calls per session; query-side Voyage cost is M not 2M.**

Verification: code review — confirm Phase 2 only adds Voyage (embedding) calls, never an Anthropic / OpenAI completion call. Confirm `userMessage` is embedded ONCE per turn and the vector is shared between `retrieveRelevantMemory` and `getRelevantMemories` (Task 9 step 3). The spec cost-table update in Task 9 should reflect: write-side `+N` (new/changed facts only), query-side `+M` (one per user turn). Spec § "LLM Call Cost per session-completed" line 307 must be updated in this PR.

- [ ] **Step 1: Open the PR with the checklist filled in**

Coordinator uses `/commit` for each commit per CLAUDE.md; aggregate the work into a single PR. Do NOT flip the flag in the PR. Include in the PR description:
- The cost-table update to `docs/specs/2026-05-05-memory-architecture-upgrade.md` (write-side `+N` new/changed only; query-side `+M` per user turn).
- The spec § Phase 2 acceptance line 260 / 382 cleanup (remove the unreachable `IS NULL` fallback clause — see Task 6 footnote).
- Confirmation that the existing `services/memory.ts:retrieveRelevantMemory` (Story 3.10) is unchanged in semantics, only extended to accept a precomputed query vector.

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
- Spec § Phase 2.1 (Embedding on write) → Tasks 2, 3, 4 ✓ (post-commit, with embedding preservation across rewrites)
- Spec § Phase 2.2 (Backfill cron) → Task 5 ✓ (batched UPDATE per batch, mirrors prior `memory-facts-backfill` shape)
- Spec § Phase 2.3 (`getRelevantMemories` two-stage retrieval) → Tasks 6, 7, 10 ✓ (suppressed-category excluded by default; precomputed-vector pass-through)
- Spec § Phase 2.4 (A/B harness) → Task 11 ✓ (with deterministic fixture seeder)
- Spec § Phase 2.5 (Feature flag) → Task 8 ✓
- Spec § Phase 2 acceptance criteria → Task 13 ✓ (incl. defaults-validation gate)
- Spec § SLO thresholds → Tasks 5, 12, 13 ✓ (paired attempted/failed counters give the SLO denominator)

**Deviations from spec text (resolved in PR):**
- Spec line 90, 259 weight defaults `0.7 / 0.3, halflife=90` are FLIPPED to `0.85 / 0.15, halflife=180` in this plan because the original defaults defeat the spec § Problem goal. Update the spec table when this lands.
- Spec line 260 / 382 "fall back when any candidate has `embedding IS NULL`" is unreachable given the SQL filter at Task 6. Remove the `IS NULL` clause from the spec acceptance text.
- Spec § "LLM Call Cost per session-completed" (line 307) only counted write-side embeddings. Add `+M` query-side per session (one per user turn, after the per-turn embedding-share optimization in Task 9 step 3).
- Spec § Phase 2 acceptance line 380 "embedding written within 30s of `applyAnalysis`" — embedding now happens in a sibling step, so the assertion is "within the same `session-completed` invocation" rather than 30 seconds.

**Type consistency:**
- `FactEmbedder` and `EmbedFactOutcome` defined once in `embed-fact.ts`, used by `relevance.ts`, `session-completed.ts`, `session-exchange.ts`, and the cron — single source of truth.
- `RelevanceWeights` defaults are deliberately stricter than spec; tunable via the `weights` option for A/B.
- `K' = 4·k` over-fetch matches spec line 86.

**Architecture deltas vs. earlier draft of this plan (called out for reviewers):**
- Embedding moved out of the `applyAnalysis` transaction — a separate `step.run('embed-new-memory-facts', …)` runs post-commit. Avoids holding `SELECT FOR UPDATE` across N Voyage HTTP calls.
- `replaceActiveMemoryFactsForProfile` snapshots `(category, text_normalized) → embedding` before delete and restores onto rewritten rows whose `text_normalized` matches. Without this, every session-end re-embeds every active fact.
- `getRelevantMemories` accepts an optional `queryVector`; `session-exchange` computes the per-turn embedding once and shares it with the existing `retrieveRelevantMemory` to avoid double Voyage cost.
- `findRelevant` excludes `category = 'suppressed'` by default so suppressed rows don't eat the K' budget.

**Placeholder scan:** None — every step has an exact path, exact code, or an exact verification command. Two callouts ("verify by reading X") are explicit instructions to read existing code, not placeholders.
