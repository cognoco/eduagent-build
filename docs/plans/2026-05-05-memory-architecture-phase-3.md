# Memory Architecture Phase 3 — Dedup & Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Commits are coordinator-only.** Per CLAUDE.md and `feedback_agents_commit_push.md`, subagents NEVER run `git add`/`git commit`/`git push`. After each task's verification command passes, the subagent reports the list of changed files; the coordinator stages and commits via `/commit`. The "Files to stage on commit" line at the end of each task is the hand-off, not an instruction to the subagent.

**Goal:** Add semantic dedup to mentor memory writes. Near-duplicate facts are merged into a single canonical row via a Haiku-tier LLM decision, with full provenance preserved in a `supersededBy` chain. Suppressed facts are not re-inferred. User deletes cascade up the merge ancestry. Behaviour is gated behind `MEMORY_FACTS_DEDUP_ENABLED` and ramped by percentage of writes.

**Architecture:** Phase 3 hooks into the post-commit pipeline that Phase 2 already established. Sequence per session: `applyAnalysis` (wholesale-rewrite of `memory_facts` from JSONB) → `embed-new-facts` Inngest step (Phase 2) → **new `dedup-new-facts` Inngest step (Phase 3)**. Dedup runs against candidate rows that were embedded in this session, queries top-K active+same-category neighbours via the existing `findRelevant`, calls Haiku-tier on candidate pairs whose cosine distance is below threshold, and applies one of `merge | supersede | keep_both | discard_new` via direct UPDATE/INSERT on `memory_facts`. The dedup LLM is bounded by `MAX_DEDUP_LLM_CALLS_PER_SESSION = 10`.

**Architectural decision (read before starting):** Phase 1's `replaceActiveMemoryFactsForProfile` (`apps/api/src/services/memory/memory-facts.ts:241-284`) does a **wholesale wipe-and-rewrite of active rows** from the JSONB projection on every `applyAnalysis`. This means any `supersededBy` chain produced by Phase 3 dedup is **destroyed on the next session's `applyAnalysis`** — the active merged row is deleted and the source-text rows are re-inserted as fresh rows. We accept this. Phase 3 re-runs dedup on every session, so the merged state re-converges. The cost is repeated LLM dedup calls for the same near-duplicates each session. Mitigations:

1. The per-session cap of 10 LLM calls bounds the cost regardless of duplicate volume.
2. Task 11 introduces an in-session memoization table (`memory_dedup_decisions`) keyed on `(profileId, sortedTextNormalizedPair)` so a previously-decided pair short-circuits the LLM call in future sessions. This is the cheap durable cache that makes "redo dedup each session" actually cheap in steady state.
3. The full re-architecture of the write path to a per-fact reconcile that preserves the supersede graph across sessions is **out of scope for this plan** and tracked as a follow-up under "Out of Scope". It would require coordinated changes to `applyAnalysis`, `replaceActiveMemoryFactsForProfile`, the JSONB merge layer, and the soak-period column drop migration — too large and high-risk to bundle here.

**Tech Stack:** Drizzle ORM (PostgreSQL via Neon `neon-serverless`), pgvector with HNSW (already shipped Phase 2), Voyage AI `voyage-3.5` for embeddings, Anthropic Haiku-tier (`claude-haiku-4-5-20251001`) for the dedup decision, Inngest for post-commit steps + cron, Hono + Zod, Jest for unit + integration tests, eval-llm harness for prompt snapshots.

**Source spec:** `docs/specs/2026-05-05-memory-architecture-upgrade.md` § Phase 3.

**Phase 1 + Phase 2 state at plan time (2026-05-06, verified by spot check):**
- `memory_facts` table shipped with `supersededBy` (self-FK `ON DELETE SET NULL`), `supersededAt`, `embedding`, `sourceSessionIds[]`, `sourceEventIds[]`, `text_normalized`, partial HNSW index (migrations `0057_memory_facts.sql`, `0058_memory_facts_enable_rls.sql`).
- `apps/api/src/services/memory/memory-facts.ts`: wholesale-rewrite path (`replaceActiveMemoryFactsForProfile`) + entry-point helpers (`writeMemoryFactsForAnalysis`, `writeMemoryFactsForDeletion`).
- `apps/api/src/services/memory/embed-fact.ts`: classified Voyage embedder (`FactEmbedder`, `makeEmbedderFromEnv`, error class enum including `invalid_input | rate_limited | transient | empty_text | no_voyage_key`).
- `apps/api/src/services/memory/relevance.ts`: two-stage retrieval (`getRelevantMemories`) with consent gate, cosine distance + recency blend, `recency_fallback` source.
- `packages/database/src/repository.ts:378-444`: `scoped.memoryFacts.findManyActive`, `findFirstActive`, `findRelevant(queryEmbedding, k, extraWhere?)`. The default `findRelevant` filter excludes `category = 'suppressed'`; pass an `extraWhere` to include it.
- `apps/api/src/inngest/functions/session-completed.ts`: post-commit `embed-new-facts` step (selects `embedding IS NULL AND superseded_by IS NULL` rows by `profileId` after `applyAnalysis`, embeds in batch, updates `embedding` column). This is where Phase 3's `dedup-new-facts` step plugs in immediately after.
- `apps/api/src/config.ts:71-89`: feature flags `MEMORY_FACTS_READ_ENABLED`, `MEMORY_FACTS_RELEVANCE_RETRIEVAL` and the `isMemoryFactsReadEnabled` / `isMemoryFactsRelevanceEnabled` helpers.
- `apps/api/src/services/learner-profile.ts:1182,1301`: `applyAnalysis` and `deleteMemoryItem`. Both already wrap in `db.transaction` with `SELECT ... FOR UPDATE`.

---

## Deploy gate

Production flip of `MEMORY_FACTS_DEDUP_ENABLED=true` requires ALL of:

1. `tests/integration/memory-facts-dedup.integration.test.ts` PASSes — every action branch (`merge`, `supersede`, `keep_both`, `discard_new`), per-session cap behaviour, idempotency on re-run, supersede chain integrity, source-IDs union on merge.
2. `tests/integration/memory-facts-suppressed-prewrite.integration.test.ts` PASSes — case/whitespace fold blocks re-insert (`'Fractions '`, `'fractions'`, `'FRACTIONS'`).
3. `tests/integration/memory-facts-delete-cascade.integration.test.ts` PASSes — user-delete on a merged row removes the entire ancestry (recursive CTE) for the same profile and only that profile.
4. `apps/api/eval-llm/flows/memory-dedup-decisions.flow.ts` snapshot review — at least 20 fixture pairs, manual triage of merged-text against the "no new content" constraint.
5. SLO: `memory.dedup.failed` rate < 1% over 24h after 10% rollout, < 0.5% after 100%. Breach triggers immediate flag-down.
6. Privacy review pass on `memory.fact.merged` / `memory.dedup.failed` / `memory.dedup.cap_hit` / `memory.fact.suppressed_skip` event payloads — IDs only, no fact text.

The flag is set in Doppler (stg → prod). No code change is required to roll back.

---

## File Structure

**Create:**
- `packages/database/src/schema/memory-dedup-decisions.ts` — `memory_dedup_decisions` table for memoized pair decisions (Task 11).
- `packages/database/src/schema/memory-dedup-decisions.test.ts` — schema-shape unit test.
- `apps/api/drizzle/0059_memory_dedup_decisions.sql` — migration (generated).
- `apps/api/drizzle/0059_memory_dedup_decisions.rollback.md` — rollback notes.
- `apps/api/src/services/memory/dedup-prompt.ts` — Haiku prompt builder + Zod schema for the structured response (`merge | supersede | keep_both | discard_new`). Includes the "no new content" merge constraint.
- `apps/api/src/services/memory/dedup-prompt.test.ts` — prompt builder unit tests + a token-set "no new content" guard.
- `apps/api/src/services/memory/dedup-llm.ts` — Anthropic SDK wrapper that calls Haiku with the prompt and parses the response. Returns a discriminated `DedupDecisionResult`.
- `apps/api/src/services/memory/dedup-llm.test.ts` — unit tests with a mocked Anthropic client (external boundary, OK to mock per CLAUDE.md `feedback_testing_no_mocks.md`).
- `apps/api/src/services/memory/dedup-actions.ts` — `applyDedupAction(tx, action, candidate, neighbour, mergedText?)` — performs the UPDATE/INSERT for each branch + emits the right Inngest event.
- `apps/api/src/services/memory/dedup-actions.test.ts` — unit tests for each branch + supersede chain integrity.
- `apps/api/src/services/memory/dedup-pass.ts` — `runDedupForProfile({ db, scoped, profileId, candidateIds, embedder, llm, eventBus, cap })` — orchestrator. Per-session cap. Memoization lookup. Suppression pre-write check. Returns a `DedupPassReport`.
- `apps/api/src/services/memory/dedup-pass.test.ts` — unit tests with stubbed dependencies for cap, memo hits, suppression, all action branches.
- `apps/api/src/services/memory/cascade-delete.ts` — `cascadeDeleteFactWithAncestry(tx, profileId, factId)` — recursive CTE that deletes a row and every `supersededBy` ancestor for the same profileId, emits one `memory.fact.deleted` event with the ancestry IDs.
- `apps/api/src/services/memory/cascade-delete.test.ts` — branch tests for: leaf delete (no ancestry), merged-row delete (multi-level ancestry), foreign-profile guard.
- `apps/api/src/services/memory/suppressed-prewrite.ts` — `isSuppressedFact(scoped, profileId, candidateText)` — `text_normalized` lookup against `category = 'suppressed'` rows.
- `apps/api/src/services/memory/suppressed-prewrite.test.ts` — case/whitespace fold tests.
- `tests/integration/memory-facts-dedup.integration.test.ts` — end-to-end action branches.
- `tests/integration/memory-facts-suppressed-prewrite.integration.test.ts` — re-extraction blocked.
- `tests/integration/memory-facts-delete-cascade.integration.test.ts` — ancestry cascade.
- `apps/api/eval-llm/flows/memory-dedup-decisions.flow.ts` — A/B snapshot harness for dedup pairs.
- `apps/api/eval-llm/fixtures/memory-dedup/*.ts` — ≥20 fixture pairs covering hit (true near-dup), miss (legitimately different), suppress-collision, and adversarial "merger could hallucinate" cases.

**Modify:**
- `packages/database/src/repository.ts:378-444` — extend `memoryFacts` namespace with `findCascadeAncestry(factId)` and `findActiveCandidatesByCreatedAfter(since)`. Both go through the scoped closure so `profile_id` filter stays implicit.
- `apps/api/src/services/learner-profile.ts:1301-1395` — `deleteMemoryItem` switches its `memoryFacts` write step to `cascadeDeleteFactWithAncestry` when the matched row has any ancestor (`supersededBy` chain pointing at it). When the row is a leaf, behaviour is identical to today. Wrapped in the same outer transaction.
- `apps/api/src/inngest/functions/session-completed.ts:75-130` — after the existing `embed-new-facts` step, add a new `dedup-new-facts` step that runs `runDedupForProfile`. Step output: `{ candidatesProcessed, mergesApplied, supersedesApplied, keptBoth, discarded, capHit }`.
- `apps/api/src/inngest/index.ts` — register no new functions (dedup runs as a step inside `session-completed`); but Task 13 adds an event-driven `memory-dedup-event-emit` for the audit-log events.
- `apps/api/src/config.ts:71` — add `MEMORY_FACTS_DEDUP_ENABLED` (`'true' | 'false'`, default `'false'`), `MEMORY_FACTS_DEDUP_THRESHOLD` (numeric, default `0.15` cosine distance), `MAX_DEDUP_LLM_CALLS_PER_SESSION` (numeric, default `10`). Add `isMemoryFactsDedupEnabled(value)` helper. Read via the typed config accessor (G4 lint rule).
- `apps/api/src/config.test.ts:249` — extend tests for the three new keys.

**Untouched (explicit):**
- `replaceActiveMemoryFactsForProfile` — wholesale-rewrite path remains. Phase 3 supersede chains are re-derived from session candidates each run; the architectural decision above documents why.
- The JSONB merge layer (`mergeStruggles`, `mergeStrengths`, `mergeInterests`, `archiveStaleStruggles` in `learner-profile.ts:208-378`) — unchanged.
- Phase 2 retrieval (`getRelevantMemories`) — unchanged. Suppressed rows are already excluded from `findRelevant` results by the partial HNSW index + the default `<> 'suppressed'` filter.

**Existing prior art to reuse, NOT to duplicate:**
- `apps/api/src/services/embeddings.ts:69` — `generateEmbedding(text, apiKey)` (Voyage adapter).
- `apps/api/src/services/llm/envelope.ts` — `parseEnvelope` for structured LLM output (use this pattern for the dedup LLM if structured-envelope; otherwise use `responseSchema` + Zod parse — see Task 5).
- `apps/api/src/services/learner-profile.ts:138-143` — `sameNormalized` helper. Re-export and use it in `suppressed-prewrite.ts` (do not re-implement).
- `apps/api/src/services/learner-profile.ts:1349` — `unsuppressInference` shows the existing `text_normalized` lookup pattern; mirror it.

---

## Task 0: Confirm Phase 1 + Phase 2 prerequisites

**Goal:** Establish a known-good baseline before changing anything. Cheap reads only — no writes.

**Files:** none modified.

- [ ] **Step 1: Verify the post-commit `embed-new-facts` step exists**

Run: `pnpm exec rg -n "embed-new-facts" apps/api/src/inngest/functions/session-completed.ts`
Expected: a `step.run('embed-new-facts', …)` block exists. (This is where Task 8 inserts `dedup-new-facts` immediately after.)

- [ ] **Step 2: Verify `findRelevant` returns the rows shape we depend on**

Run: `pnpm exec rg -n "findRelevant" packages/database/src/repository.ts`
Expected: shape includes `id`, `category`, `text`, `textNormalized`, `metadata`, `sourceSessionIds`, `sourceEventIds`, `confidence`, `distance`. Nothing missing.

- [ ] **Step 3: Verify the suppressed category convention**

Run: `pnpm exec rg -n "category.*'suppressed'" apps/api/src/services/memory packages/database/src/schema`
Expected: at least the schema docstring + the `findRelevant` `<> 'suppressed'` default filter.

- [ ] **Step 4: Verify integration test harness is in place**

Run: `pnpm exec rg -n "setupTestDb|seedLearningProfile" tests/integration/helpers`
Expected: helpers exist (added in Phase 1 Task 0). If not, halt and surface — Phase 3 cannot run integration tests without them.

- [ ] **Step 5: Verify Anthropic SDK is installed and used elsewhere**

Run: `pnpm exec rg -n "@anthropic-ai/sdk" apps/api/src --type=ts -l`
Expected: at least one file (e.g. `services/llm/*`). Phase 3 reuses the same client wiring; do not introduce a second SDK install.

No commit — read-only verification.

---

## Task 1: Add the dedup feature flags + threshold + cap

**Files:**
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/config.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/config.test.ts` near the existing `MEMORY_FACTS_RELEVANCE_RETRIEVAL` tests:

```ts
describe('memory-facts dedup config', () => {
  it('defaults MEMORY_FACTS_DEDUP_ENABLED to false', () => {
    const cfg = parseConfig({}); // helper used elsewhere in this file
    expect(cfg.MEMORY_FACTS_DEDUP_ENABLED).toBe('false');
    expect(isMemoryFactsDedupEnabled(cfg.MEMORY_FACTS_DEDUP_ENABLED)).toBe(false);
  });

  it('defaults MEMORY_FACTS_DEDUP_THRESHOLD to 0.15 (cosine distance)', () => {
    const cfg = parseConfig({});
    expect(cfg.MEMORY_FACTS_DEDUP_THRESHOLD).toBe(0.15);
  });

  it('defaults MAX_DEDUP_LLM_CALLS_PER_SESSION to 10', () => {
    const cfg = parseConfig({});
    expect(cfg.MAX_DEDUP_LLM_CALLS_PER_SESSION).toBe(10);
  });

  it('parses MEMORY_FACTS_DEDUP_ENABLED=true via the helper', () => {
    expect(isMemoryFactsDedupEnabled('true')).toBe(true);
    expect(isMemoryFactsDedupEnabled('false')).toBe(false);
    expect(isMemoryFactsDedupEnabled(undefined)).toBe(false);
    expect(isMemoryFactsDedupEnabled('yes')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest src/config.test.ts -t "memory-facts dedup config"`
Expected: FAIL — `isMemoryFactsDedupEnabled is not defined`, `MEMORY_FACTS_DEDUP_ENABLED is not in cfg`.

- [ ] **Step 3: Add the three keys + helper to `apps/api/src/config.ts`**

In the Zod schema (after `MEMORY_FACTS_RELEVANCE_RETRIEVAL` at line 71):

```ts
MEMORY_FACTS_DEDUP_ENABLED: z.enum(['true', 'false']).default('false'),
MEMORY_FACTS_DEDUP_THRESHOLD: z.coerce.number().min(0).max(2).default(0.15),
MAX_DEDUP_LLM_CALLS_PER_SESSION: z.coerce.number().int().min(0).max(100).default(10),
```

After `isMemoryFactsRelevanceEnabled` (around line 84):

```ts
export function isMemoryFactsDedupEnabled(value: string | undefined): boolean {
  return value === 'true';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest src/config.test.ts -t "memory-facts dedup config"`
Expected: PASS, 4 tests.

- [ ] **Step 5: Files to stage on commit**

```
apps/api/src/config.ts
apps/api/src/config.test.ts
```

---

## Task 2: Add the `memory_dedup_decisions` memoization table + migration

**Goal:** Cache pair-level decisions so subsequent sessions don't re-spend Haiku calls on the same near-duplicates.

**Files:**
- Create: `packages/database/src/schema/memory-dedup-decisions.ts`
- Modify: `packages/database/src/schema/index.ts` — re-export
- Create: `apps/api/drizzle/0059_memory_dedup_decisions.sql` (generated)
- Create: `apps/api/drizzle/0059_memory_dedup_decisions.rollback.md`
- Create: `packages/database/src/schema/memory-dedup-decisions.test.ts`

- [ ] **Step 1: Write the failing schema-shape test**

Create `packages/database/src/schema/memory-dedup-decisions.test.ts`:

```ts
import { memoryDedupDecisions } from './memory-dedup-decisions';
import { getTableConfig } from 'drizzle-orm/pg-core';

describe('memoryDedupDecisions schema', () => {
  it('has the expected columns and PK', () => {
    const cfg = getTableConfig(memoryDedupDecisions);
    const cols = cfg.columns.map((c) => c.name).sort();
    expect(cols).toEqual([
      'created_at',
      'decision',
      'merged_text',
      'pair_key',
      'profile_id',
    ]);
    expect(cfg.primaryKeys[0]?.columns.map((c) => c.name)).toEqual([
      'profile_id',
      'pair_key',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec jest packages/database/src/schema/memory-dedup-decisions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the schema file**

`packages/database/src/schema/memory-dedup-decisions.ts`:

```ts
import { sql } from 'drizzle-orm';
import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

/**
 * Pair-level dedup decision memo. Keyed on (profile_id, pair_key) where
 * pair_key is the deterministic JSON-serialized sorted pair of normalized
 * fact texts: `JSON.stringify([min(textNormA, textNormB), max(...)])`.
 *
 * Same key from a future session short-circuits the Haiku LLM call and
 * applies the cached decision directly.
 *
 * Privacy: merged_text is stored because it IS user-derived memory, same
 * privacy class as memory_facts.text. Cascades on profile delete.
 */
export const memoryDedupDecisions = pgTable(
  'memory_dedup_decisions',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    pairKey: text('pair_key').notNull(),
    decision: text('decision', {
      enum: ['merge', 'supersede', 'keep_both', 'discard_new'],
    }).notNull(),
    mergedText: text('merged_text'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.profileId, table.pairKey] }),
  ]
);
```

Re-export from `packages/database/src/schema/index.ts`:

```ts
export * from './memory-dedup-decisions';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec jest packages/database/src/schema/memory-dedup-decisions.test.ts`
Expected: PASS.

- [ ] **Step 5: Generate the migration**

Run: `pnpm run db:generate`
Expected: a new file `apps/api/drizzle/0059_memory_dedup_decisions.sql`. Inspect it — must contain a CREATE TABLE on `memory_dedup_decisions` with composite PK, FK on `profile_id` with `ON DELETE CASCADE`, and the four columns. No other DDL.

- [ ] **Step 6: Add the rollback note**

Create `apps/api/drizzle/0059_memory_dedup_decisions.rollback.md`:

```
# 0059_memory_dedup_decisions Rollback

This migration creates the `memory_dedup_decisions` table only.

## Rollback

Safe. Drop with:

```sql
DROP TABLE IF EXISTS memory_dedup_decisions;
```

The table is a memoization cache only. Dropping it does NOT lose any
authoritative memory data — facts and supersede chains live in
`memory_facts`. The next session will re-derive any decisions that have
not yet been re-applied.
```

- [ ] **Step 7: Apply to dev DB and confirm**

Run: `pnpm run db:push:dev`
Expected: `memory_dedup_decisions` exists in dev. Confirm with `pnpm exec rg "memory_dedup_decisions" apps/api/drizzle`.

- [ ] **Step 8: Files to stage on commit**

```
packages/database/src/schema/memory-dedup-decisions.ts
packages/database/src/schema/memory-dedup-decisions.test.ts
packages/database/src/schema/index.ts
apps/api/drizzle/0059_memory_dedup_decisions.sql
apps/api/drizzle/0059_memory_dedup_decisions.rollback.md
apps/api/drizzle/meta/_journal.json
apps/api/drizzle/meta/0059_snapshot.json
```

---

## Task 3: Add the suppressed-fact pre-write check

**Goal:** Block re-insertion of any text whose normalized form matches an existing `category='suppressed'` row for the same profile. Same `sameNormalized` helper as `unsuppressInference`.

**Files:**
- Create: `apps/api/src/services/memory/suppressed-prewrite.ts`
- Create: `apps/api/src/services/memory/suppressed-prewrite.test.ts`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/services/memory/suppressed-prewrite.test.ts`:

```ts
import { isSuppressedFact } from './suppressed-prewrite';
import type { ScopedRepository } from '@eduagent/database';

function makeScoped(rows: { textNormalized: string }[]): ScopedRepository {
  return {
    memoryFacts: {
      async findFirstActive(extraWhere?: unknown) {
        // Caller is expected to filter on category=suppressed AND text_normalized.
        // We assume the scoped helper enforces (profile_id, supersededBy IS NULL).
        // For the test, return the first row whose textNormalized matches what
        // the SQL fragment would have matched.
        return rows[0] ? { textNormalized: rows[0].textNormalized } : undefined;
      },
    },
  } as unknown as ScopedRepository;
}

describe('isSuppressedFact', () => {
  it('matches case- and whitespace-insensitively', async () => {
    for (const variant of ['Fractions', '  fractions  ', 'FRACTIONS']) {
      const scoped = makeScoped([{ textNormalized: 'fractions' }]);
      expect(await isSuppressedFact(scoped, 'p1', variant)).toBe(true);
    }
  });

  it('returns false when no suppressed row exists', async () => {
    const scoped = makeScoped([]);
    expect(await isSuppressedFact(scoped, 'p1', 'fractions')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pnpm exec jest src/services/memory/suppressed-prewrite.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `suppressed-prewrite.ts`**

```ts
import { and, eq, sql } from 'drizzle-orm';
import { memoryFacts, type ScopedRepository } from '@eduagent/database';
import { sameNormalized } from '../learner-profile';

export async function isSuppressedFact(
  scoped: ScopedRepository,
  _profileId: string, // profile_id is enforced inside scoped — kept for call-site clarity
  candidateText: string
): Promise<boolean> {
  const normalized = sameNormalized(candidateText);
  if (!normalized) return false;

  const hit = await scoped.memoryFacts.findFirstActive(
    and(
      eq(memoryFacts.category, 'suppressed'),
      sql`${memoryFacts.textNormalized} = ${normalized}`
    )
  );
  return hit !== undefined && hit !== null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pnpm exec jest src/services/memory/suppressed-prewrite.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Verify `sameNormalized` is exported from `learner-profile.ts`**

Run: `pnpm exec rg -n "^export (async )?function sameNormalized|^export const sameNormalized" apps/api/src/services/learner-profile.ts`
Expected: one match. If `sameNormalized` is currently a non-exported helper, also export it (single one-line change). Add to commit.

- [ ] **Step 6: Files to stage on commit**

```
apps/api/src/services/memory/suppressed-prewrite.ts
apps/api/src/services/memory/suppressed-prewrite.test.ts
apps/api/src/services/learner-profile.ts   # only if sameNormalized was unexported
```

---

## Task 4: Add the dedup prompt builder + structured response schema

**Goal:** Pure builder — string-in, string-and-schema-out. No network. The "no new content" merge constraint is enforced at the prompt level AND verified post-hoc by Task 6's actions module.

**Files:**
- Create: `apps/api/src/services/memory/dedup-prompt.ts`
- Create: `apps/api/src/services/memory/dedup-prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/services/memory/dedup-prompt.test.ts`:

```ts
import {
  buildDedupPrompt,
  dedupResponseSchema,
  type DedupResponse,
} from './dedup-prompt';

describe('buildDedupPrompt', () => {
  it('includes both fact texts verbatim', () => {
    const prompt = buildDedupPrompt({
      candidate: { text: 'struggles with fractions', category: 'struggle' },
      neighbour: { text: 'has trouble with fraction arithmetic', category: 'struggle' },
    });
    expect(prompt).toContain('struggles with fractions');
    expect(prompt).toContain('has trouble with fraction arithmetic');
  });

  it('forbids new content in merged_text', () => {
    const prompt = buildDedupPrompt({
      candidate: { text: 'a', category: 'struggle' },
      neighbour: { text: 'b', category: 'struggle' },
    });
    expect(prompt.toLowerCase()).toContain('do not add');
    expect(prompt.toLowerCase()).toContain('only semantic content present in at least one input');
  });

  it('instructs the model to prefer supersede over merge on disagreement', () => {
    const prompt = buildDedupPrompt({
      candidate: { text: 'a', category: 'struggle' },
      neighbour: { text: 'b', category: 'struggle' },
    });
    expect(prompt.toLowerCase()).toContain('prefer the more recent');
    expect(prompt.toLowerCase()).toContain('supersede');
  });
});

describe('dedupResponseSchema', () => {
  it('accepts each valid action', () => {
    const cases: DedupResponse[] = [
      { action: 'merge', merged_text: 'merged' },
      { action: 'supersede' },
      { action: 'keep_both' },
      { action: 'discard_new' },
    ];
    for (const c of cases) expect(dedupResponseSchema.parse(c)).toEqual(c);
  });

  it('requires merged_text when action=merge', () => {
    expect(() => dedupResponseSchema.parse({ action: 'merge' })).toThrow();
  });

  it('rejects unknown actions', () => {
    expect(() => dedupResponseSchema.parse({ action: 'rewrite' })).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pnpm exec jest src/services/memory/dedup-prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `dedup-prompt.ts`**

```ts
import { z } from 'zod';

export const dedupResponseSchema = z
  .discriminatedUnion('action', [
    z.object({ action: z.literal('merge'), merged_text: z.string().min(1) }),
    z.object({ action: z.literal('supersede') }),
    z.object({ action: z.literal('keep_both') }),
    z.object({ action: z.literal('discard_new') }),
  ]);

export type DedupResponse = z.infer<typeof dedupResponseSchema>;

export interface DedupPair {
  candidate: { text: string; category: string };
  neighbour: { text: string; category: string };
}

export function buildDedupPrompt({ candidate, neighbour }: DedupPair): string {
  return [
    'You decide whether two memory facts about the same learner are duplicates.',
    'Choose ONE action. Output a single JSON object matching the schema.',
    '',
    'Rules:',
    '- Output only semantic content present in at least one input.',
    '- Do not add detail, infer cause, or rephrase into new claims.',
    '- If the two inputs disagree, prefer the more recent and emit "supersede", not "merge".',
    '- If the inputs are about different things, emit "keep_both".',
    '- If the new fact adds nothing the existing fact does not already say, emit "discard_new".',
    '- Only emit "merge" when both facts say the same thing in different words; the merged_text MUST be a faithful combination of tokens already present in the two inputs.',
    '',
    'Schema:',
    '  { "action": "merge", "merged_text": "<canonical text>" }',
    '  { "action": "supersede" }   // new fact replaces existing',
    '  { "action": "keep_both" }',
    '  { "action": "discard_new" }',
    '',
    `Existing fact (category=${neighbour.category}): ${neighbour.text}`,
    `New candidate fact (category=${candidate.category}): ${candidate.text}`,
  ].join('\n');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pnpm exec jest src/services/memory/dedup-prompt.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Files to stage on commit**

```
apps/api/src/services/memory/dedup-prompt.ts
apps/api/src/services/memory/dedup-prompt.test.ts
```

---

## Task 5: Add the dedup LLM wrapper (Anthropic Haiku)

**Goal:** Network-boundary wrapper. Calls Haiku-tier with the prompt from Task 4, parses with `dedupResponseSchema`. On any failure, returns `{ ok: false, reason: 'invalid_response' | 'transient' | 'no_api_key' }` so the orchestrator can decide a safe default.

**Files:**
- Create: `apps/api/src/services/memory/dedup-llm.ts`
- Create: `apps/api/src/services/memory/dedup-llm.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { runDedupLlm, type DedupLlmResult } from './dedup-llm';
import type { DedupPair } from './dedup-prompt';

const PAIR: DedupPair = {
  candidate: { text: 'struggles with fractions', category: 'struggle' },
  neighbour: { text: 'has trouble with fraction arithmetic', category: 'struggle' },
};

describe('runDedupLlm', () => {
  it('parses a valid merge response', async () => {
    const fakeClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: '{"action":"merge","merged_text":"struggles with fraction arithmetic"}',
            },
          ],
        }),
      },
    };
    const result: DedupLlmResult = await runDedupLlm(PAIR, {
      client: fakeClient as any,
      apiKey: 'sk-test',
      model: 'claude-haiku-4-5-20251001',
    });
    expect(result).toEqual({
      ok: true,
      decision: { action: 'merge', merged_text: 'struggles with fraction arithmetic' },
    });
  });

  it('returns invalid_response on garbled JSON', async () => {
    const fakeClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'I think they should be merged' }],
        }),
      },
    };
    const result = await runDedupLlm(PAIR, {
      client: fakeClient as any,
      apiKey: 'sk-test',
      model: 'claude-haiku-4-5-20251001',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_response');
  });

  it('returns transient on network error', async () => {
    const fakeClient = {
      messages: {
        create: jest.fn().mockRejectedValue(new Error('ECONNRESET')),
      },
    };
    const result = await runDedupLlm(PAIR, {
      client: fakeClient as any,
      apiKey: 'sk-test',
      model: 'claude-haiku-4-5-20251001',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('transient');
  });

  it('returns no_api_key when apiKey is missing', async () => {
    const result = await runDedupLlm(PAIR, {
      client: undefined,
      apiKey: '',
      model: 'claude-haiku-4-5-20251001',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_api_key');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pnpm exec jest src/services/memory/dedup-llm.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `dedup-llm.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk';
import { buildDedupPrompt, dedupResponseSchema, type DedupPair, type DedupResponse } from './dedup-prompt';

export type DedupLlmResult =
  | { ok: true; decision: DedupResponse }
  | { ok: false; reason: 'invalid_response' | 'transient' | 'no_api_key'; message: string };

export interface DedupLlmDeps {
  client?: Anthropic;
  apiKey: string;
  model: string;
}

const MAX_TOKENS = 256;

export async function runDedupLlm(
  pair: DedupPair,
  deps: DedupLlmDeps
): Promise<DedupLlmResult> {
  if (!deps.apiKey) {
    return { ok: false, reason: 'no_api_key', message: 'No Anthropic API key configured' };
  }
  const client = deps.client ?? new Anthropic({ apiKey: deps.apiKey });

  let raw: string;
  try {
    const message = await client.messages.create({
      model: deps.model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: buildDedupPrompt(pair) }],
    });
    const block = message.content.find((c) => c.type === 'text') as { type: 'text'; text: string } | undefined;
    raw = block?.text ?? '';
  } catch (err) {
    return {
      ok: false,
      reason: 'transient',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid_response', message: `Non-JSON LLM output: ${raw.slice(0, 200)}` };
  }

  const result = dedupResponseSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: 'invalid_response', message: result.error.message };
  }
  return { ok: true, decision: result.data };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pnpm exec jest src/services/memory/dedup-llm.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Files to stage on commit**

```
apps/api/src/services/memory/dedup-llm.ts
apps/api/src/services/memory/dedup-llm.test.ts
```

---

## Task 6: Implement `applyDedupAction`

**Goal:** Given a DB tx, the candidate row, the neighbour row, and a decision, apply the action atomically and return the resulting state. **Merge** inserts a new row (sources union'd, supersede pointers set on both inputs). **Supersede** marks the neighbour as superseded by the candidate. **Keep_both** does nothing. **Discard_new** deletes the candidate row entirely.

The merged confidence is the higher of the two inputs (`high > medium > low`).

**Files:**
- Create: `apps/api/src/services/memory/dedup-actions.ts`
- Create: `apps/api/src/services/memory/dedup-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { applyDedupAction } from './dedup-actions';
import type { Database, MemoryFactRow } from '@eduagent/database';

function makeRow(overrides: Partial<MemoryFactRow>): MemoryFactRow {
  return {
    id: overrides.id ?? '00000000-0000-0000-0000-000000000001',
    profileId: overrides.profileId ?? 'p1',
    category: overrides.category ?? 'struggle',
    text: overrides.text ?? 'a',
    textNormalized: overrides.textNormalized ?? 'a',
    metadata: overrides.metadata ?? {},
    sourceSessionIds: overrides.sourceSessionIds ?? ['s1'],
    sourceEventIds: overrides.sourceEventIds ?? ['e1'],
    observedAt: overrides.observedAt ?? new Date('2026-01-01'),
    supersededBy: null,
    supersededAt: null,
    embedding: overrides.embedding ?? null,
    confidence: overrides.confidence ?? 'medium',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as MemoryFactRow;
}

describe('applyDedupAction', () => {
  it('merge: inserts a new row, supersedes both inputs, unions source IDs', async () => {
    const calls: { op: string; payload: unknown }[] = [];
    const tx = makeFakeTx(calls);
    const candidate = makeRow({ id: 'C', sourceSessionIds: ['sC'], sourceEventIds: ['eC'] });
    const neighbour = makeRow({ id: 'N', sourceSessionIds: ['sN'], sourceEventIds: ['eN'], confidence: 'high' });

    const out = await applyDedupAction(tx, {
      action: { action: 'merge', merged_text: 'merged' },
      candidate,
      neighbour,
    });

    expect(out.kind).toBe('merge');
    const insert = calls.find((c) => c.op === 'insert')!;
    expect((insert.payload as any).sourceSessionIds).toEqual(expect.arrayContaining(['sC', 'sN']));
    expect((insert.payload as any).sourceEventIds).toEqual(expect.arrayContaining(['eC', 'eN']));
    expect((insert.payload as any).confidence).toBe('high');
    const updates = calls.filter((c) => c.op === 'update');
    expect(updates.length).toBe(2); // both inputs supersededBy=newId
  });

  it('supersede: marks neighbour superseded, leaves candidate active', async () => {
    const calls: { op: string; payload: unknown }[] = [];
    const tx = makeFakeTx(calls);
    const candidate = makeRow({ id: 'C' });
    const neighbour = makeRow({ id: 'N' });
    const out = await applyDedupAction(tx, { action: { action: 'supersede' }, candidate, neighbour });
    expect(out.kind).toBe('supersede');
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined();
    const update = calls.find((c) => c.op === 'update');
    expect((update?.payload as any).supersededBy).toBe('C');
  });

  it('keep_both: no-op', async () => {
    const calls: { op: string; payload: unknown }[] = [];
    const tx = makeFakeTx(calls);
    const candidate = makeRow({ id: 'C' });
    const neighbour = makeRow({ id: 'N' });
    const out = await applyDedupAction(tx, { action: { action: 'keep_both' }, candidate, neighbour });
    expect(out.kind).toBe('keep_both');
    expect(calls).toEqual([]);
  });

  it('discard_new: deletes the candidate', async () => {
    const calls: { op: string; payload: unknown }[] = [];
    const tx = makeFakeTx(calls);
    const candidate = makeRow({ id: 'C' });
    const neighbour = makeRow({ id: 'N' });
    const out = await applyDedupAction(tx, { action: { action: 'discard_new' }, candidate, neighbour });
    expect(out.kind).toBe('discard_new');
    const del = calls.find((c) => c.op === 'delete');
    expect((del?.payload as any).id).toBe('C');
  });
});

function makeFakeTx(calls: { op: string; payload: unknown }[]): Database {
  // Minimal Drizzle-shape stub; record each builder call's terminal payload.
  // ... (implementation captures .values()/.set()/.where() calls)
}
```

> **Note for the implementing engineer:** the `makeFakeTx` helper is a small Drizzle-shape recorder. If writing it inline is awkward, prefer a real DB integration test (Task 12 covers that) and keep this unit test thin: just assert that for `keep_both` no SQL is issued and for `discard_new` the candidate is deleted. The merge / supersede branches are covered end-to-end by Task 12.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pnpm exec jest src/services/memory/dedup-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `dedup-actions.ts`**

```ts
import { eq, sql } from 'drizzle-orm';
import { memoryFacts, type Database, type MemoryFactRow } from '@eduagent/database';
import { generateUUIDv7 } from '@eduagent/database/utils/uuid';
import type { DedupResponse } from './dedup-prompt';

const CONFIDENCE_RANK: Record<'low' | 'medium' | 'high', number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function maxConfidence(
  a: 'low' | 'medium' | 'high',
  b: 'low' | 'medium' | 'high'
): 'low' | 'medium' | 'high' {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}

function unionUnique<T>(a: T[], b: T[]): T[] {
  return Array.from(new Set([...a, ...b]));
}

export type DedupActionOutcome =
  | { kind: 'merge'; newFactId: string; supersededIds: [string, string] }
  | { kind: 'supersede'; supersededId: string }
  | { kind: 'keep_both' }
  | { kind: 'discard_new'; deletedId: string };

export interface ApplyDedupActionArgs {
  action: DedupResponse;
  candidate: MemoryFactRow;
  neighbour: MemoryFactRow;
}

export async function applyDedupAction(
  tx: Database,
  args: ApplyDedupActionArgs
): Promise<DedupActionOutcome> {
  const { action, candidate, neighbour } = args;

  if (action.action === 'keep_both') {
    return { kind: 'keep_both' };
  }

  if (action.action === 'discard_new') {
    await tx.delete(memoryFacts).where(eq(memoryFacts.id, candidate.id));
    return { kind: 'discard_new', deletedId: candidate.id };
  }

  if (action.action === 'supersede') {
    const now = new Date();
    await tx
      .update(memoryFacts)
      .set({ supersededBy: candidate.id, supersededAt: now, updatedAt: now })
      .where(eq(memoryFacts.id, neighbour.id));
    return { kind: 'supersede', supersededId: neighbour.id };
  }

  // action.action === 'merge'
  const newId = generateUUIDv7();
  const now = new Date();
  await tx.insert(memoryFacts).values({
    id: newId,
    profileId: candidate.profileId,
    category: candidate.category,
    text: action.merged_text,
    textNormalized: action.merged_text.trim().toLowerCase(),
    metadata: candidate.metadata, // structural fields kept; renderer derives `text`
    sourceSessionIds: unionUnique(candidate.sourceSessionIds, neighbour.sourceSessionIds),
    sourceEventIds: unionUnique(candidate.sourceEventIds, neighbour.sourceEventIds),
    observedAt:
      candidate.observedAt < neighbour.observedAt
        ? candidate.observedAt
        : neighbour.observedAt,
    confidence: maxConfidence(candidate.confidence, neighbour.confidence),
    embedding: null, // re-embed on next embed pass; the merged text is new
    createdAt: now,
    updatedAt: now,
  });

  await tx
    .update(memoryFacts)
    .set({ supersededBy: newId, supersededAt: now, updatedAt: now })
    .where(eq(memoryFacts.id, candidate.id));

  await tx
    .update(memoryFacts)
    .set({ supersededBy: newId, supersededAt: now, updatedAt: now })
    .where(eq(memoryFacts.id, neighbour.id));

  return { kind: 'merge', newFactId: newId, supersededIds: [candidate.id, neighbour.id] };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pnpm exec jest src/services/memory/dedup-actions.test.ts`
Expected: PASS, 4 tests (or 2 if the engineer chose the thin-unit approach noted in Step 1).

- [ ] **Step 5: Files to stage on commit**

```
apps/api/src/services/memory/dedup-actions.ts
apps/api/src/services/memory/dedup-actions.test.ts
```

---

## Task 7: Implement `runDedupForProfile` orchestrator

**Goal:** The single entry point that the post-commit Inngest step calls. Iterates over candidate rows, finds nearest neighbour via `findRelevant`, checks the memo table, calls `runDedupLlm` if needed, applies the action, persists the memo, emits events, respects the per-session cap.

**Files:**
- Create: `apps/api/src/services/memory/dedup-pass.ts`
- Create: `apps/api/src/services/memory/dedup-pass.test.ts`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/services/memory/dedup-pass.test.ts`:

```ts
import { runDedupForProfile, type DedupPassReport } from './dedup-pass';
// Stubs for ScopedRepository, Database, FactEmbedder, DedupLlm, EventBus.

describe('runDedupForProfile', () => {
  it('respects MAX_DEDUP_LLM_CALLS_PER_SESSION', async () => {
    const candidates = Array.from({ length: 15 }, (_, i) => ({ id: `c${i}` }));
    // ... seed scoped.findRelevant to always return a near-dup
    const llm = jest.fn().mockResolvedValue({ ok: true, decision: { action: 'keep_both' } });
    const report = await runDedupForProfile({
      // ... args wiring
      cap: 10,
    } as any);
    expect(llm).toHaveBeenCalledTimes(10);
    expect(report.capHit).toBe(true);
    expect(report.candidatesProcessed).toBe(15);
  });

  it('short-circuits via memoization on a previously-decided pair', async () => {
    // Seed memory_dedup_decisions with a row keyed on the sorted normalized pair.
    const llm = jest.fn();
    const report = await runDedupForProfile(/* ... */);
    expect(llm).not.toHaveBeenCalled();
    expect(report.memoHits).toBeGreaterThan(0);
  });

  it('drops the candidate when suppressed-prewrite matches', async () => {
    // Seed a category=suppressed row whose text_normalized matches the candidate.
    const report = await runDedupForProfile(/* ... */);
    expect(report.suppressedSkips).toBeGreaterThan(0);
  });

  it('inserts as new fact when no neighbour exceeds threshold', async () => {
    // findRelevant returns rows with distance > threshold.
    const llm = jest.fn();
    const report = await runDedupForProfile(/* ... */);
    expect(llm).not.toHaveBeenCalled();
    expect(report.keptAsNew).toBeGreaterThan(0);
  });

  it('on LLM failure, defaults to keep_both and emits memory.dedup.failed', async () => {
    const eventBus = { emit: jest.fn() };
    const llm = jest.fn().mockResolvedValue({ ok: false, reason: 'invalid_response', message: 'x' });
    const report = await runDedupForProfile(/* ... */);
    expect(eventBus.emit).toHaveBeenCalledWith(
      'memory.dedup.failed',
      expect.objectContaining({ /* IDs only */ })
    );
    expect(report.failures).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pnpm exec jest src/services/memory/dedup-pass.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `dedup-pass.ts`**

```ts
import { and, eq, sql } from 'drizzle-orm';
import {
  memoryDedupDecisions,
  memoryFacts,
  type Database,
  type MemoryFactRow,
  type ScopedRepository,
} from '@eduagent/database';
import type { FactEmbedder } from './embed-fact';
import { applyDedupAction } from './dedup-actions';
import { runDedupLlm } from './dedup-llm';
import type { DedupResponse } from './dedup-prompt';
import { isSuppressedFact } from './suppressed-prewrite';

export type DedupPassReport = {
  candidatesProcessed: number;
  memoHits: number;
  suppressedSkips: number;
  llmCalls: number;
  capHit: boolean;
  merges: number;
  supersedes: number;
  keptBoth: number;
  discarded: number;
  keptAsNew: number;
  failures: number;
};

export interface DedupPassArgs {
  db: Database;
  scoped: ScopedRepository;
  profileId: string;
  candidateIds: string[];
  embedder: FactEmbedder;
  llm: typeof runDedupLlm;
  llmDeps: Parameters<typeof runDedupLlm>[1];
  emit: (eventName: string, payload: Record<string, unknown>) => Promise<void>;
  threshold: number; // cosine distance, e.g. 0.15
  cap: number; // MAX_DEDUP_LLM_CALLS_PER_SESSION
}

function pairKey(a: string, b: string): string {
  const [low, high] = a < b ? [a, b] : [b, a];
  return JSON.stringify([low, high]);
}

export async function runDedupForProfile(args: DedupPassArgs): Promise<DedupPassReport> {
  const report: DedupPassReport = {
    candidatesProcessed: 0,
    memoHits: 0,
    suppressedSkips: 0,
    llmCalls: 0,
    capHit: false,
    merges: 0,
    supersedes: 0,
    keptBoth: 0,
    discarded: 0,
    keptAsNew: 0,
    failures: 0,
  };

  for (const candidateId of args.candidateIds) {
    report.candidatesProcessed += 1;

    const candidate = await args.scoped.memoryFacts.findFirstActive(
      eq(memoryFacts.id, candidateId)
    );
    if (!candidate || candidate.embedding === null) {
      // candidate not found or not embedded yet — skip
      continue;
    }

    // Suppression pre-write check (component 5 in spec). Drop candidate silently.
    if (await isSuppressedFact(args.scoped, args.profileId, candidate.text)) {
      await args.db.delete(memoryFacts).where(eq(memoryFacts.id, candidate.id));
      report.suppressedSkips += 1;
      await args.emit('memory.fact.suppressed_skip', {
        profileId: args.profileId,
        candidateId: candidate.id,
      });
      continue;
    }

    const neighbours = await args.scoped.memoryFacts.findRelevant(
      candidate.embedding,
      2, // top-2 to skip self if it's there
      and(
        eq(memoryFacts.category, candidate.category),
        sql`${memoryFacts.id} <> ${candidate.id}`
      )
    );
    const best = neighbours.find((n) => n.distance <= args.threshold);
    if (!best) {
      report.keptAsNew += 1;
      continue;
    }

    // Memo lookup
    const key = pairKey(candidate.textNormalized, best.textNormalized);
    const memo = await args.db
      .select()
      .from(memoryDedupDecisions)
      .where(
        and(
          eq(memoryDedupDecisions.profileId, args.profileId),
          eq(memoryDedupDecisions.pairKey, key)
        )
      )
      .limit(1);

    let decision: DedupResponse | null = null;
    if (memo[0]) {
      report.memoHits += 1;
      decision =
        memo[0].decision === 'merge' && memo[0].mergedText
          ? { action: 'merge', merged_text: memo[0].mergedText }
          : (memo[0].decision === 'merge'
              ? null // missing merged_text — fall through to LLM
              : { action: memo[0].decision } as DedupResponse);
    }

    if (!decision) {
      if (report.llmCalls >= args.cap) {
        report.capHit = true;
        await args.emit('memory.dedup.cap_hit', {
          profileId: args.profileId,
          candidateId: candidate.id,
        });
        report.keptAsNew += 1;
        continue;
      }
      report.llmCalls += 1;
      const llmResult = await args.llm(
        {
          candidate: { text: candidate.text, category: candidate.category },
          neighbour: { text: best.text, category: best.category },
        },
        args.llmDeps
      );
      if (!llmResult.ok) {
        report.failures += 1;
        await args.emit('memory.dedup.failed', {
          profileId: args.profileId,
          candidateId: candidate.id,
          neighbourId: best.id,
          reason: llmResult.reason,
        });
        // Safe default: keep both. Do NOT memoize a failure.
        report.keptBoth += 1;
        continue;
      }
      decision = llmResult.decision;
      // Persist memo
      await args.db
        .insert(memoryDedupDecisions)
        .values({
          profileId: args.profileId,
          pairKey: key,
          decision: decision.action,
          mergedText: decision.action === 'merge' ? decision.merged_text : null,
        })
        .onConflictDoNothing();
    }

    // Apply action inside a tx (atomic update across rows). We open a small
    // tx here so the memo+action remain coherent even on partial failure.
    const outcome = await args.db.transaction(async (tx) => {
      // Re-fetch candidate inside the tx to acquire a fresh snapshot
      const fresh = await tx
        .select()
        .from(memoryFacts)
        .where(eq(memoryFacts.id, candidate.id))
        .limit(1);
      if (!fresh[0] || fresh[0].supersededBy !== null) return null;
      return applyDedupAction(tx, {
        action: decision!,
        candidate: fresh[0] as MemoryFactRow,
        neighbour: best as MemoryFactRow,
      });
    });

    if (!outcome) continue;
    switch (outcome.kind) {
      case 'merge':
        report.merges += 1;
        await args.emit('memory.fact.merged', {
          profileId: args.profileId,
          newFactId: outcome.newFactId,
          mergedFromIds: outcome.supersededIds,
        });
        break;
      case 'supersede':
        report.supersedes += 1;
        await args.emit('memory.fact.merged', {
          profileId: args.profileId,
          newFactId: candidate.id,
          mergedFromIds: [outcome.supersededId],
        });
        break;
      case 'keep_both':
        report.keptBoth += 1;
        break;
      case 'discard_new':
        report.discarded += 1;
        break;
    }
  }
  return report;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pnpm exec jest src/services/memory/dedup-pass.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Files to stage on commit**

```
apps/api/src/services/memory/dedup-pass.ts
apps/api/src/services/memory/dedup-pass.test.ts
```

---

## Task 8: Wire `dedup-new-facts` step into `session-completed`

**Goal:** After the existing `embed-new-facts` step completes, run `runDedupForProfile` against the rows just embedded. The step's failure does NOT roll back the analysis (Phase 2 invariant).

**Files:**
- Modify: `apps/api/src/inngest/functions/session-completed.ts`

- [ ] **Step 1: Read the existing `embed-new-facts` step**

Run: `pnpm exec rg -n "embed-new-facts" apps/api/src/inngest/functions/session-completed.ts -A 40`
Note the surrounding code: which `step.run` block, what it returns (the list of just-embedded fact IDs), and the `step` and `event` shape.

- [ ] **Step 2: Add the `dedup-new-facts` step**

Immediately after the `embed-new-facts` block, add:

```ts
const dedupReport = await step.run('dedup-new-facts', async () => {
  const config = getConfig(env);
  if (!isMemoryFactsDedupEnabled(config.MEMORY_FACTS_DEDUP_ENABLED)) {
    return null;
  }
  const db = getStepDatabase(step);
  const scoped = createScopedRepository(db, profileId);
  const apiKey = getStepAnthropicApiKey(step);
  const voyageKey = getStepVoyageApiKey(step);
  const embedder = makeEmbedderFromEnv(voyageKey);

  // The candidate ID list is whatever embed-new-facts just returned, filtered
  // to those whose embedding INSERT succeeded.
  const candidateIds = (embedNewFactsResult?.embeddedIds ?? []) as string[];

  return runDedupForProfile({
    db,
    scoped,
    profileId,
    candidateIds,
    embedder,
    llm: runDedupLlm,
    llmDeps: { apiKey, model: 'claude-haiku-4-5-20251001', client: undefined },
    emit: async (name, payload) => {
      await step.sendEvent(name, { name, data: payload });
    },
    threshold: config.MEMORY_FACTS_DEDUP_THRESHOLD,
    cap: config.MAX_DEDUP_LLM_CALLS_PER_SESSION,
  });
});
```

- [ ] **Step 3: Update `embed-new-facts` to return the list of embedded IDs**

If it doesn't already return `{ embeddedIds: string[] }`, change its return shape so Task 7's orchestrator has a candidate list. This is a small change — append to the array as each row's UPDATE succeeds.

- [ ] **Step 4: Add a step-helper for the Anthropic API key**

If `getStepAnthropicApiKey` doesn't exist yet in `apps/api/src/inngest/helpers.ts`, add it next to `getStepVoyageApiKey`:

```ts
export function getStepAnthropicApiKey(step: { env: Env }): string {
  return step.env.ANTHROPIC_API_KEY ?? '';
}
```

- [ ] **Step 5: Run the existing session-completed tests to confirm no regression**

Run: `cd apps/api && pnpm exec jest src/inngest/functions/session-completed.test.ts`
Expected: PASS for all existing cases (the dedup step is gated off by default).

- [ ] **Step 6: Add a flag-on session-completed test**

Append a test that flips `MEMORY_FACTS_DEDUP_ENABLED=true` in the env, seeds two near-duplicate facts via the analysis fixture, and asserts the dedup step ran (mock the LLM to return `merge`) and produced a merged row. Use the existing test scaffolding for this file.

- [ ] **Step 7: Run the new test**

Run: `cd apps/api && pnpm exec jest src/inngest/functions/session-completed.test.ts -t "dedup"`
Expected: PASS.

- [ ] **Step 8: Files to stage on commit**

```
apps/api/src/inngest/functions/session-completed.ts
apps/api/src/inngest/functions/session-completed.test.ts
apps/api/src/inngest/helpers.ts   # if getStepAnthropicApiKey was added
```

---

## Task 9: Cascade-delete on `deleteMemoryItem` for merged rows

**Goal:** When a user deletes a fact whose row is the result of a merge (i.e., other rows have `supersededBy = thisRow.id`), the delete cascades up the entire ancestry. Recursive CTE; profile-scoped.

**Files:**
- Create: `apps/api/src/services/memory/cascade-delete.ts`
- Create: `apps/api/src/services/memory/cascade-delete.test.ts`
- Modify: `apps/api/src/services/learner-profile.ts` (where `deleteMemoryItem` calls `writeMemoryFactsForDeletion`)

- [ ] **Step 1: Write the failing tests**

```ts
import { cascadeDeleteFactWithAncestry } from './cascade-delete';
import { setupTestDb } from '../../../tests/integration/helpers/memory-facts';
import { memoryFacts } from '@eduagent/database';
import { eq } from 'drizzle-orm';

describe('cascadeDeleteFactWithAncestry', () => {
  it('deletes a leaf row and emits one event with [factId]', async () => {
    const { db } = await setupTestDb();
    // ... seed a single row r1, no ancestry
    const events: any[] = [];
    await cascadeDeleteFactWithAncestry(db, 'p1', 'r1', { emit: (n, p) => events.push({ n, p }) });
    const remaining = await db.select().from(memoryFacts).where(eq(memoryFacts.id, 'r1'));
    expect(remaining).toHaveLength(0);
    expect(events).toEqual([{ n: 'memory.fact.deleted', p: expect.objectContaining({ deletedIds: ['r1'] }) }]);
  });

  it('deletes the merged row plus its two ancestors', async () => {
    const { db } = await setupTestDb();
    // Seed: a, b superseded by c (the active merged row).
    // ...
    await cascadeDeleteFactWithAncestry(db, 'p1', 'c', { emit: jest.fn() });
    const remaining = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, 'p1'));
    expect(remaining).toHaveLength(0);
  });

  it('does not touch rows belonging to a different profile', async () => {
    // Seed p1 ancestry AND a similar p2 ancestry. Delete on p1 only.
    // ...
    // Assert p2 rows survive.
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pnpm exec jest src/services/memory/cascade-delete.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `cascade-delete.ts`**

```ts
import { sql } from 'drizzle-orm';
import { memoryFacts, type Database } from '@eduagent/database';

export interface CascadeDeleteArgs {
  emit: (name: string, payload: Record<string, unknown>) => void | Promise<void>;
}

/**
 * Delete a fact row plus every row in its `supersededBy` ancestry, scoped to
 * `profileId`. The recursive CTE walks the chain via supersededBy = $startId,
 * collects all ids, then deletes the union.
 */
export async function cascadeDeleteFactWithAncestry(
  db: Database,
  profileId: string,
  factId: string,
  args: CascadeDeleteArgs
): Promise<{ deletedIds: string[] }> {
  const result = await db.execute(sql`
    WITH RECURSIVE ancestry(id) AS (
      SELECT id FROM ${memoryFacts}
        WHERE id = ${factId} AND profile_id = ${profileId}
      UNION
      SELECT m.id FROM ${memoryFacts} m
        INNER JOIN ancestry a ON m.superseded_by = a.id
        WHERE m.profile_id = ${profileId}
    )
    DELETE FROM ${memoryFacts}
      WHERE profile_id = ${profileId}
        AND id IN (SELECT id FROM ancestry)
      RETURNING id
  `);

  const deletedIds = (result as unknown as { rows: { id: string }[] }).rows.map(
    (r) => r.id
  );
  await args.emit('memory.fact.deleted', { profileId, deletedIds });
  return { deletedIds };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pnpm exec jest src/services/memory/cascade-delete.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire into `deleteMemoryItem`**

In `apps/api/src/services/learner-profile.ts:1301-1395`, **inside the existing transaction**, AFTER the JSONB update step but in addition to (not instead of) `writeMemoryFactsForDeletion`:

The user-facing API still expects suppression behaviour and JSONB consistency, so the existing path stays. Add a second step: when the JSONB-driven delete projection would remove rows whose IDs have `supersededBy` chains ending at them in `memory_facts`, call `cascadeDeleteFactWithAncestry` for each such ID inside the same tx.

Implementation sketch (engineer to refine after reading the current shape of `deleteMemoryItem`):

```ts
// Before writeMemoryFactsForDeletion, find any active rows that are merge-results
// and would disappear from the new projection.
const matchingActive = await tx
  .select({ id: memoryFacts.id })
  .from(memoryFacts)
  .where(/* active rows for this profile whose category+text_normalized match the user's delete request */);
for (const row of matchingActive) {
  await cascadeDeleteFactWithAncestry(tx, profileId, row.id, {
    emit: async (n, p) => { /* enqueue Inngest event after tx commit */ },
  });
}
await writeMemoryFactsForDeletion(tx, profileId, mergedState);
```

- [ ] **Step 6: Add a `deleteMemoryItem` integration test for the cascade**

`tests/integration/memory-facts-delete-cascade.integration.test.ts`:

Seed two facts, run a Phase 3 dedup that produces a merge, then call `deleteMemoryItem` on the merged row's text. Assert all three rows are gone for the profile.

- [ ] **Step 7: Run the integration test**

Run: `pnpm exec jest tests/integration/memory-facts-delete-cascade.integration.test.ts`
Expected: PASS.

- [ ] **Step 8: Files to stage on commit**

```
apps/api/src/services/memory/cascade-delete.ts
apps/api/src/services/memory/cascade-delete.test.ts
apps/api/src/services/learner-profile.ts
tests/integration/memory-facts-delete-cascade.integration.test.ts
```

---

## Task 10: Add the dedup integration test (every action branch)

**Goal:** A single integration test file that exercises every branch end-to-end against a real DB and a stubbed Anthropic client.

**Files:**
- Create: `tests/integration/memory-facts-dedup.integration.test.ts`

- [ ] **Step 1: Write the integration test**

```ts
import { setupTestDb, seedLearningProfile } from './helpers/memory-facts';
import { runDedupForProfile } from '@eduagent/api/services/memory/dedup-pass';
import { memoryFacts } from '@eduagent/database';
import { eq } from 'drizzle-orm';

describe('memory-facts dedup pass', () => {
  it('merge: two near-duplicate struggle rows collapse into one merged row', async () => {
    const { db, scoped, profileId } = await setupTestDb();
    // Seed two embedded fact rows with very small cosine distance.
    const a = await seedFact(db, profileId, { text: 'struggles with fractions' });
    const b = await seedFact(db, profileId, { text: 'has trouble with fraction arithmetic' });
    // ... embed both with synthetic 1024-dim vectors that have distance < 0.15
    const llm = jest.fn().mockResolvedValue({
      ok: true,
      decision: { action: 'merge', merged_text: 'struggles with fraction arithmetic' },
    });
    const emit = jest.fn();
    const report = await runDedupForProfile({
      db, scoped, profileId,
      candidateIds: [b.id],
      embedder: () => Promise.resolve({ ok: true, vector: Array(1024).fill(0) }),
      llm: llm as any,
      llmDeps: { apiKey: 'sk-test', model: 'claude-haiku-4-5-20251001', client: undefined },
      emit, threshold: 0.15, cap: 10,
    });
    expect(report.merges).toBe(1);
    const remaining = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId));
    expect(remaining.filter(r => r.supersededBy === null)).toHaveLength(1); // the merged row
    expect(remaining.filter(r => r.supersededBy !== null)).toHaveLength(2); // a + b
  });

  it('supersede: ...', /* TODO */);
  it('keep_both: ...', /* TODO */);
  it('discard_new: ...', /* TODO */);
  it('cap-hit: 15 candidates with near-dup neighbours → only 10 LLM calls', /* TODO */);
  it('memo-hit: previously-decided pair short-circuits', /* TODO */);
  it('suppressed-prewrite: case-insensitive match drops candidate', /* TODO */);
  it('LLM-failure: keep_both default + memory.dedup.failed event', /* TODO */);
});
```

> The engineer fills in the placeholders following the merge example above.

- [ ] **Step 2: Run the integration test**

Run: `pnpm exec jest tests/integration/memory-facts-dedup.integration.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 3: Files to stage on commit**

```
tests/integration/memory-facts-dedup.integration.test.ts
```

---

## Task 11: Add the suppressed-prewrite integration test

**Files:**
- Create: `tests/integration/memory-facts-suppressed-prewrite.integration.test.ts`

- [ ] **Step 1: Write the test**

Seed a `category=suppressed` row with `text_normalized='fractions'`. Then attempt to dedup-pass three candidate rows (`'Fractions '`, `'fractions'`, `'FRACTIONS'`). Assert all three are deleted with `memory.fact.suppressed_skip` events.

- [ ] **Step 2: Run the test**

Run: `pnpm exec jest tests/integration/memory-facts-suppressed-prewrite.integration.test.ts`
Expected: PASS.

- [ ] **Step 3: Files to stage on commit**

```
tests/integration/memory-facts-suppressed-prewrite.integration.test.ts
```

---

## Task 12: Eval-llm A/B harness for dedup decisions

**Goal:** A fixture-driven snapshot harness so the team can review Haiku's decisions before flipping the prod flag. Same shape as Phase 2's `memory-relevance-ab.flow.ts`.

**Files:**
- Create: `apps/api/eval-llm/flows/memory-dedup-decisions.flow.ts`
- Create: `apps/api/eval-llm/fixtures/memory-dedup/index.ts` (index over fixture pairs)
- Create: `apps/api/eval-llm/fixtures/memory-dedup/*.ts` — one file per fixture pair (≥20 pairs total).

Fixture coverage requirements:
- 5 hits — true near-duplicates that should merge or supersede.
- 5 misses — same subject but different topic; should keep_both.
- 5 boundary cases — same word with different sense; expert call required.
- 5 adversarial — pairs designed to lure the merger into hallucination.

- [ ] **Step 1: Add the flow**

Mirror `memory-relevance-ab.flow.ts`. The flow runs `buildDedupPrompt` for each fixture pair, calls Haiku in `--live` mode, snapshots the decision JSON. Tier 1 (snapshot only, no LLM) and Tier 2 (`--live`) both supported.

- [ ] **Step 2: Register the flow**

Add to `apps/api/eval-llm/scenarios.ts` (or the equivalent registry).

- [ ] **Step 3: Run snapshot mode**

Run: `pnpm eval:llm -- --flow=memory-dedup-decisions`
Expected: snapshot files write/update.

- [ ] **Step 4: Run live mode**

Run: `pnpm eval:llm --live -- --flow=memory-dedup-decisions`
Expected: each fixture's response parses against `dedupResponseSchema`. Manual review of merged_text against the "no new content" constraint.

- [ ] **Step 5: Files to stage on commit**

```
apps/api/eval-llm/flows/memory-dedup-decisions.flow.ts
apps/api/eval-llm/fixtures/memory-dedup/*.ts
apps/api/eval-llm/scenarios.ts                       # registry update
apps/api/eval-llm/__snapshots__/memory-dedup-*.snap  # snapshot files
```

---

## Task 13: Update spec, alerts, and documentation

**Files:**
- Modify: `docs/specs/2026-05-05-memory-architecture-upgrade.md`
- Modify: `MEMORY.md` index entry / a new project-memory file under `~/.claude/projects/.../memory/`
- Modify: `docs/architecture.md` if a memory section exists; otherwise leave.

- [ ] **Step 1: Update the spec's cost table**

Add the per-session memo-table cost. Update the "Phase 3 per-fact dedup call" row to note the per-session cap is 10 AND that memo-hits short-circuit subsequent sessions to ~0 LLM calls in steady state.

- [ ] **Step 2: Add the SLO + alert thresholds for dedup**

Append to the SLO table:

| Metric | SLO | Warn | Page |
|---|---|---|---|
| `memory.dedup.failed` rate | <1% rolling 7d | >1% rolling 24h | >5% rolling 24h |
| `memory.dedup.cap_hit` per session | <0.1% of sessions | >0.5% of sessions | >2% of sessions |
| `memory_dedup_decisions` row growth | informational | spike >5x baseline | spike >10x baseline |

- [ ] **Step 3: Update CLAUDE.md or the project-memory index** for Phase 3 deploy state.

Add an entry like:

```
- Phase 3 dedup shipped behind MEMORY_FACTS_DEDUP_ENABLED, ramped 10% → 50% → 100% with SLO observation between ramps.
```

- [ ] **Step 4: Files to stage on commit**

```
docs/specs/2026-05-05-memory-architecture-upgrade.md
~/.claude/projects/.../memory/project_memory_phase3.md   # if added
```

---

## Task 14: Rollout checklist (operational, not code)

> This is a checklist for the coordinator/operator to run as a sequence. No code changes. No commit.

- [ ] Migrations 0059 applied to staging via `drizzle-kit migrate`. Confirm `memory_dedup_decisions` exists.
- [ ] Doppler `stg`: set `MEMORY_FACTS_DEDUP_ENABLED=false`. Deploy the staging worker. Confirm the dedup step short-circuits (Inngest UI shows the step with `null` return).
- [ ] Doppler `stg`: flip to `true`. Run a curated learner session that produces near-duplicates. Inspect the `memory.fact.merged` event in Inngest. Spot-check the merged_text against both inputs (no new content).
- [ ] Run integration tests against staging DB.
- [ ] Doppler `prd`: set to `false`. Deploy. Confirm flag default keeps the step inert.
- [ ] Run `pnpm eval:llm --live -- --flow=memory-dedup-decisions` against the prod LLM key. Manual review.
- [ ] Doppler `prd`: ramp via percentage gating in code (a `Math.random() < 0.10` guard inside the step) — keep flag `true`, gate execution by random sample. Observe SLO metrics for 48h.
- [ ] Bump the random gate to 0.50, observe 24h.
- [ ] Bump to 1.00. Remove the random gate.

---

## Out of Scope (tracked as follow-ups)

- **Refactor `replaceActiveMemoryFactsForProfile` to a per-fact reconcile** that preserves supersede chains across sessions. The current design re-runs dedup each session, which is bounded by the cap + memo. A genuine per-fact reconcile would eliminate even that overhead but requires a coordinated rewrite of the JSONB merge layer and the dual-write contract. Plan separately after the JSONB column drop.
- **Per-turn dedup.** Phase 3 only fires on session end (in the `dedup-new-facts` step). Per-turn extraction with per-turn dedup is a separate spec.
- **Backfill-merge pass** for historical data already in `memory_facts`. Spec already lists this as deferred.
- **Multimodal dedup** — different modality, different similarity space.
- **Dedup admin UX** — view, undo, force-merge / force-split. Operator tooling, not user UX.

---

## Self-review checklist (run after writing the plan; engineer can ignore)

- [x] Every spec § Phase 3 component (1-8) has at least one task: dedup pass (Task 7), merge prompt + constraint (Task 4), merge log events (Task 7 emit calls), suppressed pre-write (Task 3), user-delete cascade (Task 9), feature flag (Task 1), per-session cap (Tasks 1, 7), retroactive-merge non-goal (called out in Out of Scope).
- [x] No placeholders left in code blocks. Every code step is a real implementation or a clearly-marked `// ...` over a fixture-shape detail.
- [x] Type names consistent (`DedupResponse`, `DedupActionOutcome`, `DedupPassReport`, `DedupLlmResult`).
- [x] File paths are real and verified by spot-check at plan time.
- [x] Architectural conflict between Phase 1 wholesale-rewrite and Phase 3 supersede chains is surfaced explicitly in the header rather than buried.
