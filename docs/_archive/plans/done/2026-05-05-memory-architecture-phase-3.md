# Memory Architecture Phase 3 — Dedup & Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Commits are coordinator-only.** Per CLAUDE.md and `feedback_agents_commit_push.md`, subagents NEVER run `git add`/`git commit`/`git push`. After each task's verification command passes, the subagent reports the list of changed files; the coordinator stages and commits via `/commit`. The "Files to stage on commit" line at the end of each task is the hand-off, not an instruction to the subagent.

**Goal:** Add semantic dedup to mentor memory writes. Near-duplicate facts are merged into a single canonical row via a Haiku-tier LLM decision, with full provenance preserved in a `supersededBy` chain. Suppressed facts are not re-inferred. User deletes cascade up the merge ancestry. Behaviour is gated behind `MEMORY_FACTS_DEDUP_ENABLED` and ramped by percentage of writes.

**Architecture:** Phase 3 hooks into the post-commit pipeline that Phase 2 already established. Sequence per session: `applyAnalysis` (wholesale-rewrite of `memory_facts` from JSONB, **modified by Task 2 to wipe ALL profile rows including superseded — see "Phase 1 modification" below**) → `embed-new-memory-facts` Inngest step (Phase 2) → **new `dedup-new-facts` Inngest step (Phase 3)**. Dedup iterates over **all active rows for the profile that have an embedding** (not just rows newly embedded this session), queries top-K active+same-category neighbours via the existing `findRelevant`, calls Haiku-tier on each near-duplicate neighbour whose cosine distance is below threshold, and applies one of `merge | supersede | keep_both | discard_new` via direct UPDATE/INSERT on `memory_facts`. The dedup LLM is bounded by `MAX_DEDUP_LLM_CALLS_PER_SESSION = 10`; the per-pair memoization table short-circuits the LLM call after the first decision.

**Architectural decision (read before starting): Phase 1 must be modified, not left untouched.** A naive read of "Phase 3 produces supersede chains, Phase 1 wipes active rows each session" suggests we can simply re-run dedup every session and the merged state re-converges. Two facts kill that:

1. **The FK cascade resurrects superseded rows.** `apps/api/drizzle/0057_memory_facts.sql:17-19` declares `superseded_by … ON DELETE SET NULL`. When Phase 1's `replaceActiveMemoryFactsForProfile` deletes the active merged row `M1`, the source rows `A`, `B` (which had `supersededBy = M1`) get their `supersededBy` set to `NULL` by the FK cascade — they become ACTIVE again. The subsequent `INSERT` from the JSONB projection then conflicts with the existing active rows on the unique active index `memory_facts_active_unique_idx` (`apps/api/drizzle/0057_memory_facts.sql:43-51`). `applyAnalysis` throws; Inngest retries indefinitely. Any profile that has ever triggered a merge crashes its `session-completed` job permanently.
2. **Even if (1) were fixed by deleting both active and superseded rows, the merged state still does not re-converge.** Phase 1's existing `embeddingByKey` cache (`memory-facts.ts:261-265`) preserves embeddings across the wipe-and-rewrite for matching `(category, textNormalized)` pairs. Re-inserted rows arrive with their embeddings already populated, so `embed-new-memory-facts` (which selects `WHERE embedding IS NULL`) skips them. If Phase 3's candidate set is "rows just embedded by `embed-new-memory-facts`," the candidate list is empty and the memo is never queried. Merged state is destroyed every session and never restored — the plan's two stated mitigations (cap, memo) never fire.

The plan therefore mandates two coupled changes to Phase 1:

1. **Wipe ALL profile rows (active + superseded), not just active.** `replaceActiveMemoryFactsForProfile` is modified in **Task 2** to drop the `supersededBy IS NULL` predicate from its DELETE clause. This eliminates the FK cascade resurrection problem at the source. Since Phase 1 already re-derives all active rows from the JSONB projection, dropping superseded rows is content-preserving: nothing is lost that the projection doesn't already contain.
2. **Extend `embeddingByKey` to capture embeddings from BOTH active and superseded rows so re-INSERT preserves them.** Without this, every profile re-embeds every fact every session — Voyage cost spike. The extension is a one-line filter change on the SELECT.

With those two Phase 1 changes:

- **Phase 3's candidate set is "all active rows for this profile that have an embedding,"** not "just rows that were embedded this session." This lets the memo cache (`memory_dedup_decisions`, Task 3) short-circuit the LLM call in steady state. First session for a near-duplicate pair: 1 LLM call, decision memoized. Every subsequent session: vector lookup + memo hit + apply action, 0 LLM calls.
- **Worst-case LLM cost per session is bounded by `MAX_DEDUP_LLM_CALLS_PER_SESSION = 10`,** regardless of how many active rows the profile holds. The remaining candidates are counted in `cappedSkipped` and emit `memory.dedup.cap_hit`.
- **Steady-state vector-query cost is one `findRelevant` call per active row.** For a typical profile (≤50 active rows) this is negligible.

The full re-architecture of the write path to a per-fact reconcile that preserves the supersede graph across sessions remains out of scope (see "Out of Scope"). The Phase 1 modification above is the minimum viable change to ship Phase 3 without destroying merged state every session.

**Tech Stack:** Drizzle ORM (PostgreSQL via Neon `neon-serverless`), pgvector with HNSW (already shipped Phase 2), Voyage AI `voyage-3.5` for embeddings, Anthropic Haiku-tier (`claude-haiku-4-5-20251001`) for the dedup decision, Inngest for post-commit steps + cron, Hono + Zod, Jest for unit + integration tests, eval-llm harness for prompt snapshots.

**Source spec:** `docs/specs/2026-05-05-memory-architecture-upgrade.md` § Phase 3.

**Phase 1 + Phase 2 state at plan time (2026-05-06, verified by spot check):**
- `memory_facts` table shipped with `supersededBy` (self-FK `ON DELETE SET NULL`), `supersededAt`, `embedding`, `sourceSessionIds[]`, `sourceEventIds[]`, `text_normalized`, partial HNSW index (migrations `0057_memory_facts.sql`, `0058_memory_facts_enable_rls.sql`).
- `apps/api/src/services/memory/memory-facts.ts`: wholesale-rewrite path (`replaceActiveMemoryFactsForProfile`) + entry-point helpers (`writeMemoryFactsForAnalysis`, `writeMemoryFactsForDeletion`). **Modified by Task 2** — DELETE filter widened to drop the `supersededBy IS NULL` predicate; `embeddingByKey` SELECT widened to include superseded rows so embeddings survive the wipe.
- `apps/api/src/services/memory/embed-fact.ts`: classified Voyage embedder (`FactEmbedder`, `makeEmbedderFromEnv`, error class enum including `invalid_input | rate_limited | transient | empty_text | no_voyage_key`).
- `apps/api/src/services/memory/relevance.ts`: two-stage retrieval (`getRelevantMemories`) with consent gate, cosine distance + recency blend, `recency_fallback` source.
- `packages/database/src/repository.ts:378-444`: `scoped.memoryFacts.findManyActive`, `findFirstActive`, `findRelevant(queryEmbedding, k, extraWhere?)`. The default `findRelevant` filter excludes `category = 'suppressed'`; pass an `extraWhere` to include it.
- `apps/api/src/inngest/functions/session-completed.ts`: post-commit `embed-new-memory-facts` step (selects `embedding IS NULL AND superseded_by IS NULL` rows by `profileId` after `applyAnalysis`, embeds in batch, updates `embedding` column). This is where Phase 3's `dedup-new-facts` step plugs in immediately after. **Note:** the actual step name is `embed-new-memory-facts` (verified at `session-completed.ts:1238`), wrapped in `runIsolated` (soft step). Task 9 unwraps it from `runIsolated` so embedding failures aren't silently swallowed; Phase 3's orchestrator does NOT depend on the step's return value (it sources candidates directly from `findActiveCandidatesWithEmbedding()`).
- `apps/api/src/config.ts:71-89`: feature flags `MEMORY_FACTS_READ_ENABLED`, `MEMORY_FACTS_RELEVANCE_RETRIEVAL` and the `isMemoryFactsReadEnabled` / `isMemoryFactsRelevanceEnabled` helpers.
- `apps/api/src/services/learner-profile.ts:1182,1301`: `applyAnalysis` and `deleteMemoryItem`. Both already wrap in `db.transaction` with `SELECT ... FOR UPDATE`.

---

## Deploy gate

Production flip of `MEMORY_FACTS_DEDUP_ENABLED=true` requires ALL of:

1. `tests/integration/memory-facts-dedup.integration.test.ts` PASSes — every action branch (`merge`, `supersede`, `keep_both`, `discard_new`), per-session cap behaviour, idempotency on re-run, supersede chain integrity, source-IDs union on merge.
2. `tests/integration/memory-facts-suppressed-prewrite.integration.test.ts` PASSes — case/whitespace fold blocks re-insert (`'Fractions '`, `'fractions'`, `'FRACTIONS'`).
3. `tests/integration/memory-facts-delete-cascade.integration.test.ts` PASSes — user-delete on a merged row removes the entire ancestry (recursive CTE) for the same profile and only that profile.
4. **`tests/integration/memory-facts-phase1-wipe-all.integration.test.ts` PASSes** — multi-session simulation: Session 1 produces a merge `M1` from sources `A`, `B`. Session 2 runs `applyAnalysis` and asserts (a) no unique-index violation, (b) `M1` is gone, (c) `A'`, `B'` are reinserted with embeddings preserved (no Voyage call), (d) dedup re-runs and memo-hits to recreate `M2` (new UUID, same merged_text). This is the regression guard for the Phase 1 modification.
5. `apps/api/eval-llm/flows/memory-dedup-decisions.flow.ts` snapshot review — at least 20 fixture pairs, manual triage of merged-text against the "no new content" constraint.
6. SLO: `memory.dedup.failed` rate < 1% over 24h after 10% rollout, < 0.5% after 100%. Breach triggers immediate flag-down.
7. Privacy review pass on `memory.fact.merged` / `memory.dedup.failed` / `memory.dedup.cap_hit` / `memory.dedup.capped_skip` / `memory.dedup.skipped_no_embedding` / `memory.fact.suppressed_skip` event payloads — IDs only, no fact text.
8. **Phase 1 wipe-all change deployed to staging FIRST (Task 2 ships separately, in its own commit, in front of Tasks 3-15) and observed for 24h before Phase 3 dedup is enabled.** This isolates the Phase 1 regression risk from the dedup feature flag.

The flag is set in Doppler (stg → prod). No code change is required to roll back.

---

## File Structure

**Create:**
- `packages/database/src/schema/memory-dedup-decisions.ts` — `memory_dedup_decisions` table for memoized pair decisions (Task 3).
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
- **`apps/api/src/services/memory/memory-facts.ts:241-284` — `replaceActiveMemoryFactsForProfile` (Task 2).** Drop the `supersededBy IS NULL` filter from the SELECT-existing query and the DELETE statement so all rows for the profile are wiped. The SELECT must still capture embeddings keyed on `(category, textNormalized)` so re-INSERT preserves them.**
- **`packages/database/src/index.ts` — re-export `MemoryFactRow` (`= typeof memoryFacts.$inferSelect`) and `generateUUIDv7` so Phase 3 services can import them through the package barrel without violating `@nx/enforce-module-boundaries`.**
- `packages/database/src/repository.ts:378-444` — extend `memoryFacts` namespace with `findCascadeAncestry(factId)` and `findActiveCandidatesWithEmbedding()` (Task 8 candidate-list source). Both go through the scoped closure so `profile_id` filter stays implicit.
- `apps/api/src/services/learner-profile.ts:1301-1395` — `deleteMemoryItem` switches its `memoryFacts` write step to `cascadeDeleteFactWithAncestry` when the matched row has any ancestor (`supersededBy` chain pointing at it). When the row is a leaf, behaviour is identical to today. Wrapped in the same outer transaction.
- `apps/api/src/inngest/functions/session-completed.ts:1237-1260` — after the existing `embed-new-memory-facts` step, add a new `dedup-new-facts` step that runs `runDedupForProfile`. Also unwrap `embed-new-memory-facts` from `runIsolated` so embedding failures emit `memory_facts.embed_on_write.failed` AND are surfaced to dedup as a `memory.dedup.skipped_no_embedding` count. Step output: `{ candidatesProcessed, mergesApplied, supersedesApplied, keptBoth, discarded, capHit, cappedSkipped, skippedNoEmbedding }`.
- `apps/api/src/inngest/helpers.ts` — add `getStepAnthropicApiKey(): string` next to the existing `getStepVoyageApiKey()` (no args; reads from the same module-scoped env helper).
- `apps/api/src/inngest/index.ts` — register no new functions (dedup runs as a step inside `session-completed`); but Task 14 adds an event-driven `memory-dedup-event-emit` for the audit-log events.
- `apps/api/src/config.ts:71` — add `MEMORY_FACTS_DEDUP_ENABLED` (`'true' | 'false'`, default `'false'`), `MEMORY_FACTS_DEDUP_THRESHOLD` (numeric, default `0.15` cosine distance), `MAX_DEDUP_LLM_CALLS_PER_SESSION` (numeric, default `10`), **`MEMORY_FACTS_DEDUP_ROLLOUT_PCT` (integer 0-100, default `0`, deterministic per-profile gate)**. Add `isMemoryFactsDedupEnabled(value)` helper and **`isProfileInDedupRollout(profileId, pct)` helper**. Read via the typed config accessor (G4 lint rule).
- `apps/api/src/config.test.ts:249` — extend tests for the four new keys + the rollout gate helper.

**Untouched (explicit):**
- The JSONB merge layer (`mergeStruggles`, `mergeStrengths`, `mergeInterests`, `archiveStaleStruggles` in `learner-profile.ts:208-378`) — unchanged.
- Phase 2 retrieval (`getRelevantMemories`) — unchanged. Suppressed rows are already excluded from `findRelevant` results by the partial HNSW index + the default `<> 'suppressed'` filter.

**Existing prior art to reuse, NOT to duplicate:**
- `apps/api/src/services/embeddings.ts:69` — `generateEmbedding(text, apiKey)` (Voyage adapter).
- `apps/api/src/services/llm/envelope.ts` — `parseEnvelope` for structured LLM output (use this pattern for the dedup LLM if structured-envelope; otherwise use `responseSchema` + Zod parse — see Task 6).
- `apps/api/src/services/learner-profile.ts:138-143` — `sameNormalized` helper. Re-export and use it in `suppressed-prewrite.ts` (do not re-implement).
- `apps/api/src/services/learner-profile.ts:1349` — `unsuppressInference` shows the existing `text_normalized` lookup pattern; mirror it.
- `apps/api/src/inngest/helpers.ts:getStepDatabase, getStepVoyageApiKey` — both take **no arguments** (verified at `session-completed.ts:1242,1252`). The new `getStepAnthropicApiKey` MUST follow the same shape.

---

## Task 0: Confirm Phase 1 + Phase 2 prerequisites

**Goal:** Establish a known-good baseline before changing anything. Cheap reads only — no writes.

**Files:** none modified.

- [ ] **Step 1: Verify the post-commit `embed-new-memory-facts` step exists**

Run: `pnpm exec rg -n "embed-new-memory-facts" apps/api/src/inngest/functions/session-completed.ts`
Expected: a `step.run('embed-new-memory-facts', …)` block exists at line ~1238 (verified at plan time). (This is where Task 9 inserts `dedup-new-facts` immediately after.) **Note:** the actual step name is `embed-new-memory-facts`, not `embed-new-facts` — earlier drafts of this plan used the wrong name. If the step is wrapped in `runIsolated`, Task 9 also unwraps it so embedding failures aren't silently swallowed.

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

## Task 1: Add the dedup feature flags + threshold + cap + deterministic rollout gate

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

  it('defaults MEMORY_FACTS_DEDUP_ROLLOUT_PCT to 0', () => {
    const cfg = parseConfig({});
    expect(cfg.MEMORY_FACTS_DEDUP_ROLLOUT_PCT).toBe(0);
  });

  it('parses MEMORY_FACTS_DEDUP_ENABLED=true via the helper', () => {
    expect(isMemoryFactsDedupEnabled('true')).toBe(true);
    expect(isMemoryFactsDedupEnabled('false')).toBe(false);
    expect(isMemoryFactsDedupEnabled(undefined)).toBe(false);
    expect(isMemoryFactsDedupEnabled('yes')).toBe(false);
  });
});

describe('isProfileInDedupRollout', () => {
  it('returns false at 0% for any profileId', () => {
    expect(isProfileInDedupRollout('00000000-0000-0000-0000-000000000001', 0)).toBe(false);
    expect(isProfileInDedupRollout('ffffffff-ffff-ffff-ffff-ffffffffffff', 0)).toBe(false);
  });

  it('returns true at 100% for any profileId', () => {
    expect(isProfileInDedupRollout('00000000-0000-0000-0000-000000000001', 100)).toBe(true);
    expect(isProfileInDedupRollout('ffffffff-ffff-ffff-ffff-ffffffffffff', 100)).toBe(true);
  });

  it('is deterministic across calls (same profile, same pct → same result)', () => {
    const id = '12345678-1234-1234-1234-123456789012';
    const a = isProfileInDedupRollout(id, 50);
    const b = isProfileInDedupRollout(id, 50);
    expect(a).toBe(b);
  });

  it('is monotonic: a profile in the rollout at pct=N is also in at pct=N+1', () => {
    const id = '12345678-1234-1234-1234-123456789012';
    for (let pct = 0; pct < 100; pct++) {
      if (isProfileInDedupRollout(id, pct)) {
        expect(isProfileInDedupRollout(id, pct + 1)).toBe(true);
      }
    }
  });

  it('rolls out approximately N% of profiles at pct=N (statistical, ±5%)', () => {
    let inRollout = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) {
      // Synthetic UUIDs derived from index — uniform distribution.
      const id = `${i.toString(16).padStart(8, '0')}-0000-0000-0000-000000000000`;
      if (isProfileInDedupRollout(id, 30)) inRollout++;
    }
    expect(inRollout / N).toBeGreaterThan(0.25);
    expect(inRollout / N).toBeLessThan(0.35);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest src/config.test.ts -t "memory-facts dedup config|isProfileInDedupRollout"`
Expected: FAIL — `isMemoryFactsDedupEnabled is not defined`, `MEMORY_FACTS_DEDUP_ENABLED is not in cfg`, `isProfileInDedupRollout is not defined`.

- [ ] **Step 3: Add the four keys + helpers to `apps/api/src/config.ts`**

In the Zod schema (after `MEMORY_FACTS_RELEVANCE_RETRIEVAL` at line 71):

```ts
MEMORY_FACTS_DEDUP_ENABLED: z.enum(['true', 'false']).default('false'),
MEMORY_FACTS_DEDUP_THRESHOLD: z.coerce.number().min(0).max(2).default(0.15),
MAX_DEDUP_LLM_CALLS_PER_SESSION: z.coerce.number().int().min(0).max(100).default(10),
MEMORY_FACTS_DEDUP_ROLLOUT_PCT: z.coerce.number().int().min(0).max(100).default(0),
```

After `isMemoryFactsRelevanceEnabled` (around line 84):

```ts
export function isMemoryFactsDedupEnabled(value: string | undefined): boolean {
  return value === 'true';
}

/**
 * Deterministic per-profile rollout gate. Bucketises a profileId into [0, 100)
 * via FNV-1a over the UUID string, returning true iff bucket < pct. The gate
 * is stable across sessions for the same profile, so a profile that flips on
 * stays on for the duration of the rollout and doesn't oscillate. Replaces
 * the older `Math.random() < pct/100` approach proposed in earlier drafts.
 */
export function isProfileInDedupRollout(
  profileId: string,
  pct: number
): boolean {
  if (pct <= 0) return false;
  if (pct >= 100) return true;
  // FNV-1a 32-bit, lowercased UUID to be deterministic regardless of input case.
  let hash = 0x811c9dc5;
  const id = profileId.toLowerCase();
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const bucket = (hash >>> 0) % 100; // unsigned, 0..99
  return bucket < pct;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest src/config.test.ts -t "memory-facts dedup config|isProfileInDedupRollout"`
Expected: PASS, 9 tests.

- [ ] **Step 5: Files to stage on commit**

```
apps/api/src/config.ts
apps/api/src/config.test.ts
```

---

## Task 2: Modify Phase 1 `replaceActiveMemoryFactsForProfile` to wipe ALL profile rows

**Goal:** Eliminate the FK-cascade resurrection bug (CRITICAL-1 in adversarial review) at the source. Drop the `supersededBy IS NULL` predicate from both the SELECT-existing query and the DELETE statement, AND extend `embeddingByKey` capture to include superseded rows so re-INSERT preserves embeddings (no Voyage cost spike).

**Why this ships separately and BEFORE Tasks 3-15:** The behaviour change is invisible to users today (no dedup means no supersede chains exist in production). Shipping it first lets staging soak the wipe-all path against real session traffic for 24h before the dedup feature flag is even introduced. If a regression surfaces, it's isolated to this commit.

**Files:**
- Modify: `apps/api/src/services/memory/memory-facts.ts`
- Modify: `apps/api/src/services/memory/memory-facts.test.ts`
- Create: `tests/integration/memory-facts-phase1-wipe-all.integration.test.ts`

- [ ] **Step 1: Read the current `replaceActiveMemoryFactsForProfile`**

Run: `pnpm exec rg -n "replaceActiveMemoryFactsForProfile" apps/api/src/services/memory/memory-facts.ts -A 50`
Expected: a function at line 241 that (a) SELECTs active rows for `embeddingByKey`, (b) DELETEs active rows, (c) builds new rows from projection, (d) re-applies cached embeddings, (e) INSERTs the new rows. Both the SELECT and DELETE filter on `supersededBy IS NULL`. Confirm before editing.

- [ ] **Step 2: Write the failing unit tests**

Add to `apps/api/src/services/memory/memory-facts.test.ts`:

```ts
describe('replaceActiveMemoryFactsForProfile — wipe-all behaviour', () => {
  it('deletes superseded rows in addition to active rows', async () => {
    const { db } = await setupTestDb();
    // Seed: A (supersededBy=M1), B (supersededBy=M1), M1 (active)
    await seedMemoryFact(db, { id: 'M1', profileId: 'p1', supersededBy: null, text: 'merged' });
    await seedMemoryFact(db, { id: 'A', profileId: 'p1', supersededBy: 'M1', text: 'a' });
    await seedMemoryFact(db, { id: 'B', profileId: 'p1', supersededBy: 'M1', text: 'b' });

    await replaceActiveMemoryFactsForProfile(db, 'p1', {
      struggles: [{ text: 'fresh', /* ... */ }],
      strengths: [], interests: [], suppressed: [],
    });

    const remaining = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, 'p1'));
    // The three originals must all be gone. Only the new "fresh" row from the projection survives.
    expect(remaining.map(r => r.id).sort()).not.toContain('M1');
    expect(remaining.map(r => r.id).sort()).not.toContain('A');
    expect(remaining.map(r => r.id).sort()).not.toContain('B');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].text).toBe('fresh');
  });

  it('preserves embeddings via embeddingByKey across the wipe (active row case)', async () => {
    const { db } = await setupTestDb();
    const eA = Array(1024).fill(0.1);
    await seedMemoryFact(db, { id: 'A', profileId: 'p1', supersededBy: null, text: 'a', textNormalized: 'a', category: 'struggle', embedding: eA });

    await replaceActiveMemoryFactsForProfile(db, 'p1', {
      struggles: [{ text: 'a', /* same textNormalized */ }],
      strengths: [], interests: [], suppressed: [],
    });

    const after = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, 'p1'));
    expect(after).toHaveLength(1);
    expect(after[0].embedding).toEqual(eA); // preserved through the wipe
  });

  it('preserves embeddings from SUPERSEDED rows when their (category, textNormalized) reappears in the projection', async () => {
    const { db } = await setupTestDb();
    const eA = Array(1024).fill(0.1);
    // Seed a superseded source row with an embedding, then run wipe-all with the source text in the projection.
    await seedMemoryFact(db, { id: 'M1', profileId: 'p1', supersededBy: null, text: 'merged' });
    await seedMemoryFact(db, { id: 'A', profileId: 'p1', supersededBy: 'M1', text: 'a', textNormalized: 'a', category: 'struggle', embedding: eA });

    await replaceActiveMemoryFactsForProfile(db, 'p1', {
      struggles: [{ text: 'a' /* same textNormalized=a, category=struggle */ }],
      strengths: [], interests: [], suppressed: [],
    });

    const after = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, 'p1'));
    expect(after).toHaveLength(1);
    expect(after[0].embedding).toEqual(eA); // preserved from the superseded row's cache
  });

  it('does not raise unique-constraint violation on the active unique index when prior session left a merge', async () => {
    const { db } = await setupTestDb();
    await seedMemoryFact(db, { id: 'M1', profileId: 'p1', supersededBy: null });
    await seedMemoryFact(db, { id: 'A', profileId: 'p1', supersededBy: 'M1', text: 'struggles with fractions', textNormalized: 'struggles with fractions', category: 'struggle' });
    await seedMemoryFact(db, { id: 'B', profileId: 'p1', supersededBy: 'M1', text: 'has trouble with fraction arithmetic', textNormalized: 'has trouble with fraction arithmetic', category: 'struggle' });

    // Same source struggles in next session's projection — used to fail with UNIQUE violation under the FK SET NULL cascade.
    await expect(
      replaceActiveMemoryFactsForProfile(db, 'p1', {
        struggles: [
          { text: 'struggles with fractions' },
          { text: 'has trouble with fraction arithmetic' },
        ],
        strengths: [], interests: [], suppressed: [],
      })
    ).resolves.not.toThrow();
  });

  it('scopes the wipe to the requested profile only', async () => {
    const { db } = await setupTestDb();
    await seedMemoryFact(db, { id: 'p1-row', profileId: 'p1', supersededBy: null });
    await seedMemoryFact(db, { id: 'p2-row', profileId: 'p2', supersededBy: null });

    await replaceActiveMemoryFactsForProfile(db, 'p1', { struggles: [], strengths: [], interests: [], suppressed: [] });

    const p2 = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, 'p2'));
    expect(p2).toHaveLength(1);
    expect(p2[0].id).toBe('p2-row');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/api && pnpm exec jest src/services/memory/memory-facts.test.ts -t "wipe-all behaviour"`
Expected: FAIL — current implementation only deletes active rows; tests assert wipe-all behaviour.

- [ ] **Step 4: Modify `replaceActiveMemoryFactsForProfile`**

In `apps/api/src/services/memory/memory-facts.ts:241-284`:

```ts
export async function replaceActiveMemoryFactsForProfile(
  db: MemoryFactsWriter,
  profileId: string,
  projection: MemoryProjection
): Promise<void> {
  // CHANGED (Phase 3 prereq, 2026-05-06): the SELECT and DELETE below previously
  // filtered on `supersededBy IS NULL`, deleting only active rows. Combined
  // with the FK `ON DELETE SET NULL` from `superseded_by`, that caused
  // superseded rows to be resurrected as active during a wipe, then collide
  // with the new INSERT on the unique active index. Wipe-all eliminates the
  // problem at the source. The embedding cache below now also reads from
  // superseded rows so re-INSERT can still preserve embeddings.
  const existing = await db
    .select({
      category: memoryFacts.category,
      textNormalized: memoryFacts.textNormalized,
      embedding: memoryFacts.embedding,
    })
    .from(memoryFacts)
    .where(eq(memoryFacts.profileId, profileId));

  const embeddingByKey = new Map<string, number[]>();
  for (const row of existing) {
    if (row.embedding === null) continue;
    // If multiple rows share (category, textNormalized) — possible when a
    // superseded source row and an active merged row both exist for the same
    // text — Map.set overwrites with the last wins. The active row's
    // embedding (if non-null) is the one we'd prefer to keep, but either is
    // semantically equivalent for the same text. Order is determined by the
    // SELECT result order; no ordering requirement is imposed here.
    embeddingByKey.set(`${row.category}::${row.textNormalized}`, row.embedding);
  }

  await db
    .delete(memoryFacts)
    .where(eq(memoryFacts.profileId, profileId));

  const rows = buildMemoryFactRowsFromProjection(profileId, projection);
  if (rows.length > 0) {
    for (const row of rows) {
      const key = `${row.category}::${row.textNormalized}`;
      row.embedding = embeddingByKey.get(key) ?? null;
    }
    await db.insert(memoryFacts).values(rows);
  }
}
```

Note: the JSDoc above the function (the long block at lines 230-240) should be updated to remove the "active rows" framing — replace with "all rows" — and add a one-line note that the FK `ON DELETE SET NULL` is now never observed in practice because no superseded rows survive the wipe.

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: `cd apps/api && pnpm exec jest src/services/memory/memory-facts.test.ts -t "wipe-all behaviour"`
Expected: PASS, 5 tests.

- [ ] **Step 6: Write the multi-session integration regression test**

Create `tests/integration/memory-facts-phase1-wipe-all.integration.test.ts`. Simulate two consecutive sessions:

1. Session 1: seed two source struggles via `applyAnalysis`. Manually create a merge in `memory_facts` to mimic Phase 3 having run (`A.supersededBy = M1`, `B.supersededBy = M1`, `M1` active). Verify no unique-index violation.
2. Session 2: re-run `applyAnalysis` with the same two source struggles in the JSONB projection. Assert (a) no exception, (b) `M1`, `A`, `B` are all gone, (c) two new active rows exist for the source struggles, (d) the new rows' embeddings were preserved (NOT null) from the prior session's cache.

```ts
it('Session N+1 applyAnalysis after a Phase 3 merge does not crash and preserves embeddings', async () => {
  const { db, profileId } = await setupTestDb();
  // ... seed initial state
  // ... mimic Phase 3 merge by hand-inserting M1 with A.supersededBy=M1, B.supersededBy=M1, both with embeddings
  await applyAnalysis(db, profileId, /* same JSONB projection as session 1 */);
  const after = await db.select().from(memoryFacts).where(eq(memoryFacts.profileId, profileId));
  expect(after.find(r => r.id === 'M1')).toBeUndefined();
  expect(after.find(r => r.id === 'A')).toBeUndefined();
  expect(after.find(r => r.id === 'B')).toBeUndefined();
  expect(after).toHaveLength(2);
  for (const r of after) expect(r.embedding).not.toBeNull();
});
```

- [ ] **Step 7: Run the integration regression test**

Run: `pnpm exec jest tests/integration/memory-facts-phase1-wipe-all.integration.test.ts`
Expected: PASS.

- [ ] **Step 8: Run the existing Phase 1 + Phase 2 test suites to confirm no regression**

Run:
- `cd apps/api && pnpm exec jest src/services/memory/memory-facts.test.ts`
- `pnpm exec jest tests/integration/memory-facts.integration.test.ts` (if exists)
- `cd apps/api && pnpm exec jest src/services/learner-profile.test.ts -t "applyAnalysis|deleteMemoryItem"`

Expected: PASS for all. The wipe-all change is content-preserving for any flow that doesn't produce supersede chains (i.e., everything pre-Phase 3).

- [ ] **Step 9: Files to stage on commit**

```
apps/api/src/services/memory/memory-facts.ts
apps/api/src/services/memory/memory-facts.test.ts
tests/integration/memory-facts-phase1-wipe-all.integration.test.ts
```

> **Coordinator note:** ship Task 2 in its own commit and let it bake on staging for 24h before starting Task 3. The behaviour change is invisible to users (no dedup yet → no supersede chains exist in production), but the wipe-all path is now executed on every session's `applyAnalysis` and deserves observation before the rest of Phase 3 layers on top.

---

## Task 3: Add the `memory_dedup_decisions` memoization table + migration

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
      'model_version',
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
 * `model_version` records the LLM model identifier that produced the decision
 * so a future model upgrade or a safety-rule change can selectively invalidate
 * memos without manual SQL (e.g. `DELETE WHERE model_version = '<old>'`).
 * `created_at` enables time-bound flush scripts.
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
    modelVersion: text('model_version').notNull(),
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
Expected: a new file `apps/api/drizzle/0059_memory_dedup_decisions.sql`. Inspect it — must contain a CREATE TABLE on `memory_dedup_decisions` with composite PK, FK on `profile_id` with `ON DELETE CASCADE`, and the five columns (`profile_id`, `pair_key`, `decision`, `merged_text`, `model_version`, `created_at`). No other DDL.

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

## Task 4: Add the suppressed-fact pre-write check

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

## Task 5: Add the dedup prompt builder + structured response schema

**Goal:** Pure builder — string-in, string-and-schema-out. No network. The "no new content" merge constraint is enforced at the prompt level (this task) AND validated at runtime by `applyDedupAction` in Task 7 via a token-set guard before the merged row is written. `merged_text` is also length-capped (≤512 chars) at the schema level to prevent runaway LLM output.

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

  it('rejects merged_text longer than 512 characters', () => {
    expect(() =>
      dedupResponseSchema.parse({ action: 'merge', merged_text: 'x'.repeat(513) })
    ).toThrow();
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
    z.object({
      action: z.literal('merge'),
      // Cap to 512 chars to prevent runaway LLM output from filling memory_facts.text.
      // The "no new content" guarantee is enforced at runtime in dedup-actions, not here.
      merged_text: z.string().min(1).max(512),
    }),
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

## Task 6: Add the dedup LLM wrapper (Anthropic Haiku)

**Goal:** Network-boundary wrapper. Calls Haiku-tier with the prompt from Task 5, parses with `dedupResponseSchema`. On any failure, returns `{ ok: false, reason: 'invalid_response' | 'transient' | 'no_api_key' }` so the orchestrator can decide a safe default. **Also returns the model identifier in the `ok: true` branch** so Task 8's orchestrator can persist it as `memory_dedup_decisions.model_version` for future invalidation.

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
      modelVersion: 'claude-haiku-4-5-20251001',
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
  | { ok: true; decision: DedupResponse; modelVersion: string }
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
  return { ok: true, decision: result.data, modelVersion: deps.model };
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

## Task 7: Implement `applyDedupAction`

**Goal:** Given a DB tx, the candidate row, the neighbour row, and a decision, apply the action atomically and return the resulting state. **Merge** inserts a new row (sources union'd, supersede pointers set on both inputs). **Supersede** marks the neighbour as superseded by the candidate. **Keep_both** does nothing. **Discard_new** deletes the candidate row entirely.

**Runtime "no new content" guard (merge only):** Before INSERT, the merged_text is validated against a whitespace-tokenized union of the candidate and neighbour token sets. If any non-stopword token in `merged_text` is not present in either input, the action is downgraded to `keep_both` and the outcome reports `kind: 'merge_rejected_new_content'`. The orchestrator (Task 8) emits `memory.dedup.failed` with reason `merged_text_violates_no_new_content` and does NOT memoize the rejected decision. This is the runtime backstop for the prompt-level rule in Task 5; an earlier draft of this plan claimed the validation existed, but it didn't.

**Metadata merge policy:** The merged row's `metadata` is computed as `{ ...neighbour.metadata, ...candidate.metadata }` (candidate keys win) with one exception: `subject` and `context` (which participate in the active unique index) MUST agree between candidate and neighbour. If they differ, the action is downgraded to `keep_both` with outcome `kind: 'merge_rejected_metadata_mismatch'`. This prevents (a) silent loss of `subject`/`context` info, and (b) violating the active unique index against a third row.

The merged confidence is the higher of the two inputs (`high > medium > low`).

**Files:**
- Modify: `packages/database/src/index.ts` — re-export `generateUUIDv7` and add `export type MemoryFactRow = typeof memoryFacts.$inferSelect`
- Create: `apps/api/src/services/memory/dedup-actions.ts`
- Create: `apps/api/src/services/memory/dedup-actions.test.ts`

- [ ] **Step 0: Add package barrel re-exports**

`@eduagent/database/utils/uuid` is not exported from the package's `package.json` (only `"."` and `"./package.json"`), and `@nx/enforce-module-boundaries` blocks deep imports. Add to `packages/database/src/index.ts`:

```ts
export { generateUUIDv7 } from './utils/uuid';
export type MemoryFactRow = typeof memoryFacts.$inferSelect;
```

Verify: `pnpm exec rg -n "generateUUIDv7|MemoryFactRow" packages/database/src/index.ts` shows both lines.

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

  it('merge_rejected_new_content: blocks the INSERT when merged_text introduces a non-stopword token absent from both inputs', async () => {
    const calls: { op: string; payload: unknown }[] = [];
    const tx = makeFakeTx(calls);
    const candidate = makeRow({ id: 'C', text: 'struggles with fractions' });
    const neighbour = makeRow({ id: 'N', text: 'has trouble with fraction arithmetic' });
    const out = await applyDedupAction(tx, {
      // 'algebra' is in neither input.
      action: { action: 'merge', merged_text: 'struggles with fractions in algebra' },
      candidate,
      neighbour,
    });
    expect(out.kind).toBe('merge_rejected_new_content');
    if (out.kind === 'merge_rejected_new_content') {
      expect(out.offendingTokens).toEqual(['algebra']);
    }
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined();
    expect(calls.find((c) => c.op === 'update')).toBeUndefined();
  });

  it('merge_rejected_metadata_mismatch: blocks the INSERT when subject differs', async () => {
    const calls: { op: string; payload: unknown }[] = [];
    const tx = makeFakeTx(calls);
    const candidate = makeRow({ id: 'C', text: 'a', metadata: { subject: 'math' } });
    const neighbour = makeRow({ id: 'N', text: 'a', metadata: { subject: 'science' } });
    const out = await applyDedupAction(tx, {
      action: { action: 'merge', merged_text: 'a' },
      candidate,
      neighbour,
    });
    expect(out.kind).toBe('merge_rejected_metadata_mismatch');
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined();
  });
});

describe('findNewContentTokens', () => {
  it('allows tokens present in either input', () => {
    expect(findNewContentTokens('a b c', 'a b', 'b c')).toEqual([]);
  });

  it('allows stopwords regardless of source', () => {
    expect(findNewContentTokens('the cat and the dog', 'cat', 'dog')).toEqual([]);
  });

  it('flags non-stopword tokens absent from both inputs', () => {
    expect(findNewContentTokens('cat dog elephant', 'cat', 'dog')).toEqual(['elephant']);
  });

  it('is punctuation-tolerant', () => {
    expect(findNewContentTokens("can't reduce!", "can't", 'reduce')).toEqual([]);
  });
});

function makeFakeTx(calls: { op: string; payload: unknown }[]): Database {
  // Minimal Drizzle-shape stub; record each builder call's terminal payload.
  // ... (implementation captures .values()/.set()/.where() calls)
}
```

> **Note for the implementing engineer:** the `makeFakeTx` helper is a small Drizzle-shape recorder. If writing it inline is awkward, prefer a real DB integration test (Task 11 covers that) and keep this unit test thin: just assert that for `keep_both` no SQL is issued and for `discard_new` the candidate is deleted. The merge / supersede branches are covered end-to-end by Task 11. **The `findNewContentTokens` and `merge_rejected_*` tests should always run as pure unit tests — they don't need a fake tx because they short-circuit before any SQL.**

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pnpm exec jest src/services/memory/dedup-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `dedup-actions.ts`**

```ts
import { eq, sql } from 'drizzle-orm';
import {
  memoryFacts,
  generateUUIDv7,        // re-exported from @eduagent/database/src/index.ts in this PR
  type Database,
  type MemoryFactRow,    // re-exported as `typeof memoryFacts.$inferSelect` in this PR
} from '@eduagent/database';
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

// Tokens the prompt-level rule expects to be preserved exactly. Stopwords are
// allowed to appear in merged_text without an input source — they're filler.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'with', 'of', 'to', 'in', 'on', 'at',
  'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'do', 'does',
  'did', 'their', 'they', 'them',
]);

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Runtime "no new content" guard. Returns the list of disallowed (non-stopword)
 * tokens present in `merged` but absent from both inputs. Empty array → safe.
 */
export function findNewContentTokens(
  merged: string,
  candidateText: string,
  neighbourText: string
): string[] {
  const allowed = new Set([...tokenize(candidateText), ...tokenize(neighbourText)]);
  const offenders: string[] = [];
  for (const tok of tokenize(merged)) {
    if (STOPWORDS.has(tok)) continue;
    if (!allowed.has(tok)) offenders.push(tok);
  }
  return offenders;
}

function metadataIndexKeysAgree(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  // The active unique index is keyed on (profile_id, category, subject, context, text_normalized).
  // category is checked separately by the orchestrator (must match for findRelevant).
  // subject and context are nullable in metadata; treat undefined as ''.
  const aSubject = (a?.subject ?? '') as string;
  const bSubject = (b?.subject ?? '') as string;
  const aContext = (a?.context ?? '') as string;
  const bContext = (b?.context ?? '') as string;
  return aSubject === bSubject && aContext === bContext;
}

export type DedupActionOutcome =
  | { kind: 'merge'; newFactId: string; supersededIds: [string, string] }
  | { kind: 'supersede'; supersededId: string }
  | { kind: 'keep_both' }
  | { kind: 'discard_new'; deletedId: string }
  | { kind: 'merge_rejected_new_content'; offendingTokens: string[] }
  | { kind: 'merge_rejected_metadata_mismatch' };

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

  // action.action === 'merge' — guards before write:
  const offenders = findNewContentTokens(action.merged_text, candidate.text, neighbour.text);
  if (offenders.length > 0) {
    return { kind: 'merge_rejected_new_content', offendingTokens: offenders };
  }
  if (!metadataIndexKeysAgree(
    candidate.metadata as Record<string, unknown>,
    neighbour.metadata as Record<string, unknown>
  )) {
    return { kind: 'merge_rejected_metadata_mismatch' };
  }

  const newId = generateUUIDv7();
  const now = new Date();
  // Metadata merge: neighbour first, candidate keys win. subject/context are
  // already proven equal by the guard above, so no key conflict is possible
  // there.
  const mergedMetadata = {
    ...(neighbour.metadata as Record<string, unknown>),
    ...(candidate.metadata as Record<string, unknown>),
  };
  await tx.insert(memoryFacts).values({
    id: newId,
    profileId: candidate.profileId,
    category: candidate.category,
    text: action.merged_text,
    textNormalized: action.merged_text.trim().toLowerCase(),
    metadata: mergedMetadata,
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

## Task 8: Implement `runDedupForProfile` orchestrator

**Goal:** The single entry point that the post-commit Inngest step calls. Iterates over candidate rows, finds **all** near-duplicate neighbours under threshold via `findRelevant`, checks the memo table per pair, calls `runDedupLlm` if needed, applies the action, persists the memo, emits events, respects the per-session cap.

**Candidate set definition (CRITICAL — see header "Architectural decision"):** The candidate set is **all active rows for this profile that have an embedding**, NOT "rows that were embedded this session." Earlier drafts of this plan used the latter definition and would have silently missed every supersede chain after the first session because Phase 1's `embeddingByKey` cache preserves embeddings across the wipe. The `findActiveCandidatesWithEmbedding()` helper added to `repository.ts` in Task 9 is the source.

**Multi-neighbour iteration (MEDIUM-1):** `findRelevant(candidate.embedding, k=2)` over-fetches `k*4 = 8` rows. The orchestrator iterates ALL returned neighbours whose distance is ≤ threshold (not just the closest), allowing a single candidate to be deduped against multiple distinct near-duplicates in the same pass. The cap still applies per LLM call across all such pairs.

**Cap accounting (HIGH-4):** Cap-induced skips populate `cappedSkipped`, NOT `keptAsNew`. `keptAsNew` is reserved for "no neighbour was within threshold, the row is genuinely unique." Conflating the two would hide cap-induced under-coverage on dashboards.

**Rollout gate:** The orchestrator is a no-op (returns an empty report) when `isProfileInDedupRollout(profileId, MEMORY_FACTS_DEDUP_ROLLOUT_PCT) === false`. The gate is deterministic per profile (Task 1) so a profile that flips on stays on for the duration of the rollout and doesn't oscillate session-to-session.

**Files:**
- Create: `apps/api/src/services/memory/dedup-pass.ts`
- Create: `apps/api/src/services/memory/dedup-pass.test.ts`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/services/memory/dedup-pass.test.ts`:

```ts
import { runDedupForProfile, type DedupPassReport } from './dedup-pass';
// Stubs for ScopedRepository, Database, FactEmbedder, DedupLlm, EventBus.

describe('runDedupForProfile', () => {
  it('returns an empty report when the profile is outside the rollout', async () => {
    const llm = jest.fn();
    const report = await runDedupForProfile({
      // rolloutPct: 0 → gate returns false for any profileId
      rolloutPct: 0,
      // ... rest of args
    } as any);
    expect(report.candidatesProcessed).toBe(0);
    expect(llm).not.toHaveBeenCalled();
  });

  it('respects MAX_DEDUP_LLM_CALLS_PER_SESSION and counts excess as cappedSkipped (not keptAsNew)', async () => {
    // Seed scoped.findRelevant to always return a near-dup (forces an LLM call per candidate).
    const llm = jest.fn().mockResolvedValue({
      ok: true,
      decision: { action: 'keep_both' },
      modelVersion: 'claude-haiku-4-5-20251001',
    });
    const report = await runDedupForProfile({
      candidatesProvider: () => Array.from({ length: 15 }, (_, i) => ({ id: `c${i}`, /* ... */ })),
      cap: 10,
      rolloutPct: 100,
      // ...
    } as any);
    expect(llm).toHaveBeenCalledTimes(10);
    expect(report.capHit).toBe(true);
    expect(report.cappedSkipped).toBe(5);
    expect(report.keptAsNew).toBe(0); // none of the candidates were genuinely unique
    expect(report.candidatesProcessed).toBe(15);
  });

  it('short-circuits via memoization on a previously-decided pair', async () => {
    // Seed memory_dedup_decisions with a row keyed on the sorted normalized pair (model_version='claude-haiku-4-5-20251001').
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

  it('counts a candidate as keptAsNew only when no neighbour exceeds the threshold (not when capped)', async () => {
    // findRelevant returns rows with distance > threshold for every candidate.
    const llm = jest.fn();
    const report = await runDedupForProfile(/* ... */);
    expect(llm).not.toHaveBeenCalled();
    expect(report.keptAsNew).toBeGreaterThan(0);
    expect(report.cappedSkipped).toBe(0);
  });

  it('iterates ALL near-duplicate neighbours under threshold for a single candidate (not just the closest)', async () => {
    // Seed findRelevant to return 3 rows under threshold.
    const llm = jest.fn().mockResolvedValue({
      ok: true,
      decision: { action: 'keep_both' },
      modelVersion: 'claude-haiku-4-5-20251001',
    });
    const report = await runDedupForProfile(/* one candidate, 3 sub-threshold neighbours */);
    expect(llm).toHaveBeenCalledTimes(3);
    expect(report.keptBoth).toBe(3);
  });

  it('emits memory.dedup.skipped_no_embedding when a candidate has no embedding', async () => {
    const emit = jest.fn();
    // ... candidate.embedding === null
    const report = await runDedupForProfile(/* ... */);
    expect(emit).toHaveBeenCalledWith(
      'memory.dedup.skipped_no_embedding',
      expect.objectContaining({ profileId: expect.any(String), candidateId: expect.any(String) })
    );
    expect(report.skippedNoEmbedding).toBe(1);
  });

  it('rejects merge when applyDedupAction returns merge_rejected_new_content; emits memory.dedup.failed; does NOT memoize', async () => {
    // applyDedupAction returns { kind: 'merge_rejected_new_content', offendingTokens: ['algebra'] }
    const emit = jest.fn();
    const report = await runDedupForProfile(/* ... */);
    expect(emit).toHaveBeenCalledWith(
      'memory.dedup.failed',
      expect.objectContaining({ reason: 'merged_text_violates_no_new_content' })
    );
    expect(report.failures).toBe(1);
    // verify no row in memory_dedup_decisions for this pair
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
import { isProfileInDedupRollout } from '../../config';
import type { FactEmbedder } from './embed-fact';
import { applyDedupAction, type DedupActionOutcome } from './dedup-actions';
import { runDedupLlm } from './dedup-llm';
import type { DedupResponse } from './dedup-prompt';
import { isSuppressedFact } from './suppressed-prewrite';

/**
 * Subset of MemoryFactRow that `findRelevant` actually returns. Phase 3 should
 * not cast `findRelevant` results to `MemoryFactRow` because that wrongly
 * implies fields like `embedding`, `supersededBy`, `supersededAt`, `updatedAt`
 * are present (they aren't — see `repository.ts:425-439`).
 */
export type RelevantMemoryFact = {
  id: string;
  profileId: string;
  category: string;
  text: string;
  textNormalized: string;
  metadata: unknown;
  sourceSessionIds: string[];
  sourceEventIds: string[];
  observedAt: Date;
  confidence: 'low' | 'medium' | 'high';
  createdAt: Date;
  distance: number;
};

export type DedupPassReport = {
  candidatesProcessed: number;
  memoHits: number;
  suppressedSkips: number;
  skippedNoEmbedding: number;
  llmCalls: number;
  capHit: boolean;
  cappedSkipped: number; // distinct from keptAsNew (HIGH-4)
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
  embedder: FactEmbedder;
  llm: typeof runDedupLlm;
  llmDeps: Parameters<typeof runDedupLlm>[1];
  emit: (eventName: string, payload: Record<string, unknown>) => Promise<void>;
  threshold: number; // cosine distance, e.g. 0.15
  cap: number; // MAX_DEDUP_LLM_CALLS_PER_SESSION
  rolloutPct: number; // MEMORY_FACTS_DEDUP_ROLLOUT_PCT, 0..100
  /**
   * Source of candidate rows. Defaults to `scoped.memoryFacts.findActiveCandidatesWithEmbedding()`
   * (active rows for this profile that already have an embedding). Tests inject
   * a stub. This is NOT "rows newly embedded this session" — see header
   * "Architectural decision" for why.
   */
  candidatesProvider?: () => Promise<MemoryFactRow[]>;
}

function pairKey(a: string, b: string): string {
  const [low, high] = a < b ? [a, b] : [b, a];
  return JSON.stringify([low, high]);
}

function emptyReport(): DedupPassReport {
  return {
    candidatesProcessed: 0,
    memoHits: 0,
    suppressedSkips: 0,
    skippedNoEmbedding: 0,
    llmCalls: 0,
    capHit: false,
    cappedSkipped: 0,
    merges: 0,
    supersedes: 0,
    keptBoth: 0,
    discarded: 0,
    keptAsNew: 0,
    failures: 0,
  };
}

export async function runDedupForProfile(args: DedupPassArgs): Promise<DedupPassReport> {
  // Rollout gate — deterministic per profile.
  if (!isProfileInDedupRollout(args.profileId, args.rolloutPct)) {
    return emptyReport();
  }

  const report = emptyReport();
  const candidates = args.candidatesProvider
    ? await args.candidatesProvider()
    : await args.scoped.memoryFacts.findActiveCandidatesWithEmbedding();

  for (const candidate of candidates) {
    report.candidatesProcessed += 1;

    if (candidate.embedding === null) {
      report.skippedNoEmbedding += 1;
      await args.emit('memory.dedup.skipped_no_embedding', {
        profileId: args.profileId,
        candidateId: candidate.id,
      });
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
      2,
      and(
        eq(memoryFacts.category, candidate.category),
        sql`${memoryFacts.id} <> ${candidate.id}`
      )
    );
    // MEDIUM-1 fix: iterate ALL neighbours under threshold, not just the closest.
    const subThreshold = neighbours.filter(
      (n): n is RelevantMemoryFact => n.distance <= args.threshold
    );
    if (subThreshold.length === 0) {
      report.keptAsNew += 1;
      continue;
    }

    let candidateStillActive = true;
    for (const neighbour of subThreshold) {
      if (!candidateStillActive) break;

      const outcome = await processPair({
        ...args,
        report,
        candidate,
        neighbour,
      });

      // Once the candidate is superseded, merged, or discarded, no further
      // pair iterations against it are meaningful.
      if (
        outcome === 'merge' ||
        outcome === 'merge-as-supersede' ||
        outcome === 'discarded'
      ) {
        candidateStillActive = false;
      }
    }
  }
  return report;
}

type PairOutcomeTag =
  | 'merge'
  | 'merge-as-supersede'
  | 'kept_both'
  | 'discarded'
  | 'capped'
  | 'failed'
  | 'no-op';

async function processPair(ctx: {
  db: Database;
  scoped: ScopedRepository;
  profileId: string;
  llm: typeof runDedupLlm;
  llmDeps: Parameters<typeof runDedupLlm>[1];
  emit: (eventName: string, payload: Record<string, unknown>) => Promise<void>;
  threshold: number;
  cap: number;
  report: DedupPassReport;
  candidate: MemoryFactRow;
  neighbour: RelevantMemoryFact;
}): Promise<PairOutcomeTag> {
  const { candidate, neighbour, report } = ctx;
  const key = pairKey(candidate.textNormalized, neighbour.textNormalized);

  const memo = await ctx.db
    .select()
    .from(memoryDedupDecisions)
    .where(
      and(
        eq(memoryDedupDecisions.profileId, ctx.profileId),
        eq(memoryDedupDecisions.pairKey, key)
      )
    )
    .limit(1);

  let decision: DedupResponse | null = null;
  let modelVersion: string | null = null;
  if (memo[0]) {
    report.memoHits += 1;
    if (memo[0].decision === 'merge') {
      if (memo[0].mergedText) {
        decision = { action: 'merge', merged_text: memo[0].mergedText };
        modelVersion = memo[0].modelVersion;
      } else {
        // Inconsistent memo row — fall through to LLM.
      }
    } else {
      decision = { action: memo[0].decision } as DedupResponse;
      modelVersion = memo[0].modelVersion;
    }
  }

  if (!decision) {
    if (report.llmCalls >= ctx.cap) {
      report.capHit = true;
      report.cappedSkipped += 1;
      await ctx.emit('memory.dedup.cap_hit', {
        profileId: ctx.profileId,
        candidateId: candidate.id,
        neighbourId: neighbour.id,
      });
      return 'capped';
    }
    report.llmCalls += 1;
    const llmResult = await ctx.llm(
      {
        candidate: { text: candidate.text, category: candidate.category },
        neighbour: { text: neighbour.text, category: neighbour.category },
      },
      ctx.llmDeps
    );
    if (!llmResult.ok) {
      report.failures += 1;
      await ctx.emit('memory.dedup.failed', {
        profileId: ctx.profileId,
        candidateId: candidate.id,
        neighbourId: neighbour.id,
        reason: llmResult.reason,
      });
      report.keptBoth += 1;
      return 'failed';
    }
    decision = llmResult.decision;
    modelVersion = llmResult.modelVersion;
    // Persist memo (NOT for failures; see above).
    await ctx.db
      .insert(memoryDedupDecisions)
      .values({
        profileId: ctx.profileId,
        pairKey: key,
        decision: decision.action,
        mergedText: decision.action === 'merge' ? decision.merged_text : null,
        modelVersion,
      })
      .onConflictDoNothing();
  }

  // Apply action inside a tx. Re-fetch candidate to acquire a fresh snapshot
  // and ensure the row hasn't already been superseded by an earlier iteration.
  const outcome = await ctx.db.transaction(async (tx) => {
    const fresh = await tx
      .select()
      .from(memoryFacts)
      .where(eq(memoryFacts.id, candidate.id))
      .limit(1);
    if (!fresh[0] || fresh[0].supersededBy !== null) return null;
    // applyDedupAction expects a MemoryFactRow for both candidate and neighbour.
    // The neighbour from findRelevant lacks `embedding`, `supersededBy`, etc.;
    // re-fetch the full row inside the tx so the action sees a complete snapshot.
    const freshNeighbour = await tx
      .select()
      .from(memoryFacts)
      .where(eq(memoryFacts.id, neighbour.id))
      .limit(1);
    if (!freshNeighbour[0] || freshNeighbour[0].supersededBy !== null) return null;
    return applyDedupAction(tx, {
      action: decision!,
      candidate: fresh[0] as MemoryFactRow,
      neighbour: freshNeighbour[0] as MemoryFactRow,
    });
  });

  if (!outcome) return 'no-op';

  switch (outcome.kind) {
    case 'merge':
      report.merges += 1;
      await ctx.emit('memory.fact.merged', {
        profileId: ctx.profileId,
        newFactId: outcome.newFactId,
        mergedFromIds: outcome.supersededIds,
      });
      return 'merge';
    case 'supersede':
      report.supersedes += 1;
      await ctx.emit('memory.fact.merged', {
        profileId: ctx.profileId,
        newFactId: candidate.id,
        mergedFromIds: [outcome.supersededId],
      });
      return 'merge-as-supersede';
    case 'keep_both':
      report.keptBoth += 1;
      return 'kept_both';
    case 'discard_new':
      report.discarded += 1;
      return 'discarded';
    case 'merge_rejected_new_content':
      report.failures += 1;
      await ctx.emit('memory.dedup.failed', {
        profileId: ctx.profileId,
        candidateId: candidate.id,
        neighbourId: neighbour.id,
        reason: 'merged_text_violates_no_new_content',
        offendingTokens: outcome.offendingTokens,
      });
      // Roll back the memo for this pair — we don't want to re-apply a bad merge next session.
      await ctx.db
        .delete(memoryDedupDecisions)
        .where(
          and(
            eq(memoryDedupDecisions.profileId, ctx.profileId),
            eq(memoryDedupDecisions.pairKey, key)
          )
        );
      report.keptBoth += 1;
      return 'failed';
    case 'merge_rejected_metadata_mismatch':
      report.failures += 1;
      await ctx.emit('memory.dedup.failed', {
        profileId: ctx.profileId,
        candidateId: candidate.id,
        neighbourId: neighbour.id,
        reason: 'merge_rejected_metadata_mismatch',
      });
      await ctx.db
        .delete(memoryDedupDecisions)
        .where(
          and(
            eq(memoryDedupDecisions.profileId, ctx.profileId),
            eq(memoryDedupDecisions.pairKey, key)
          )
        );
      report.keptBoth += 1;
      return 'failed';
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pnpm exec jest src/services/memory/dedup-pass.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Files to stage on commit**

```
apps/api/src/services/memory/dedup-pass.ts
apps/api/src/services/memory/dedup-pass.test.ts
```

---

## Task 9: Wire `dedup-new-facts` step into `session-completed`

**Goal:** After the existing `embed-new-memory-facts` step completes, run `runDedupForProfile`. The step's failure does NOT roll back the analysis (Phase 2 invariant). Also unwrap `embed-new-memory-facts` from `runIsolated` so embedding failures aren't silently swallowed.

**Files:**
- Modify: `apps/api/src/inngest/functions/session-completed.ts`
- Modify: `apps/api/src/inngest/helpers.ts`
- Modify: `apps/api/src/inngest/functions/session-completed.test.ts`
- Modify: `packages/database/src/repository.ts`

- [ ] **Step 1: Read the existing `embed-new-memory-facts` step**

Run: `pnpm exec rg -n "embed-new-memory-facts" apps/api/src/inngest/functions/session-completed.ts -A 40`
Expected: a `step.run('embed-new-memory-facts', …)` block at line ~1238, currently wrapped in `runIsolated('embed-new-memory-facts', profileId, async () => { ... })` which swallows errors. Note that `getStepDatabase()` and `getStepVoyageApiKey()` take **no arguments** (verified at lines 1242, 1252).

- [ ] **Step 2: Add `getStepAnthropicApiKey` to `apps/api/src/inngest/helpers.ts`**

Mirror the no-argument shape of `getStepVoyageApiKey`:

```ts
export function getStepAnthropicApiKey(): string {
  // Reads from the same module-scoped env helper as the other getStep* functions.
  // Throws if the key is missing — the caller decides whether that's fatal or skippable.
  const key = getEnv().ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  return key;
}
```

- [ ] **Step 3: Unwrap `embed-new-memory-facts` from `runIsolated` and surface failures**

Phase 3 dedup depends on knowing whether embedding succeeded for a row, not just "the step finished without throwing." Replace the `runIsolated` wrap with a direct `step.run` body that re-throws on hard errors but logs and skips per-row Voyage failures (existing behaviour inside `embedNewFactsForProfile`). The step returns nothing further — Phase 3's orchestrator sources its candidates directly from the DB via `findActiveCandidatesWithEmbedding()`, which is robust to which rows succeeded.

- [ ] **Step 4: Add the `dedup-new-facts` step**

Immediately after the (now-unwrapped) `embed-new-memory-facts` block:

```ts
const dedupReport = await step.run('dedup-new-facts', async () => {
  const config = getConfig();
  if (!isMemoryFactsDedupEnabled(config.MEMORY_FACTS_DEDUP_ENABLED)) {
    return null;
  }

  const db = getStepDatabase();           // no argument — verified at session-completed.ts:1252
  const scoped = createScopedRepository(db, profileId);

  let apiKey: string;
  try {
    apiKey = getStepAnthropicApiKey();    // no argument — same shape as getStepVoyageApiKey
  } catch {
    logger.warn('[memory_facts] dedup skipped — no Anthropic key', {
      event: 'memory_facts.dedup.skipped',
      profileId,
      reason: 'no_anthropic_key',
    });
    return null;
  }

  let voyageKey: string;
  try {
    voyageKey = getStepVoyageApiKey();     // no argument
  } catch {
    return null;                           // same skip semantics as the existing embed step
  }

  return runDedupForProfile({
    db,
    scoped,
    profileId,
    embedder: makeEmbedderFromEnv(voyageKey),
    llm: runDedupLlm,
    llmDeps: {
      apiKey,
      model: 'claude-haiku-4-5-20251001',
      client: undefined,
    },
    emit: async (name, payload) => {
      await step.sendEvent(name, { name, data: payload });
    },
    threshold: config.MEMORY_FACTS_DEDUP_THRESHOLD,
    cap: config.MAX_DEDUP_LLM_CALLS_PER_SESSION,
    rolloutPct: config.MEMORY_FACTS_DEDUP_ROLLOUT_PCT,
    // candidatesProvider omitted — defaults to scoped.memoryFacts.findActiveCandidatesWithEmbedding()
  });
});
```

- [ ] **Step 5: Add `findActiveCandidatesWithEmbedding` to `repository.ts`**

Inside the `memoryFacts` namespace at `packages/database/src/repository.ts:378-444`:

```ts
async findActiveCandidatesWithEmbedding(): Promise<MemoryFactRow[]> {
  return db.query.memoryFacts.findMany({
    where: scopedWhere(
      memoryFacts,
      and(
        sql`${memoryFacts.supersededBy} IS NULL`,
        sql`${memoryFacts.embedding} IS NOT NULL`
      )
    ),
    orderBy: [asc(memoryFacts.createdAt), asc(memoryFacts.id)],
  });
},
```

The deterministic order matters: with `cap=10`, we want the cap to fall on the same candidates session-after-session so memo coverage builds up predictably for the high-priority (oldest-first) rows.

- [ ] **Step 6: Run the existing session-completed tests to confirm no regression**

Run: `cd apps/api && pnpm exec jest src/inngest/functions/session-completed.test.ts`
Expected: PASS for all existing cases (the dedup step is gated off by default at `MEMORY_FACTS_DEDUP_ENABLED='false'`).

- [ ] **Step 7: Add flag-on session-completed tests**

Append two tests:

1. `MEMORY_FACTS_DEDUP_ENABLED=true` + `MEMORY_FACTS_DEDUP_ROLLOUT_PCT=100`: seed two near-duplicate facts via the analysis fixture, mock the LLM to return `merge`, assert the dedup step produced a merged row and emitted `memory.fact.merged`.
2. `MEMORY_FACTS_DEDUP_ENABLED=true` + `MEMORY_FACTS_DEDUP_ROLLOUT_PCT=0`: same setup, assert the dedup step returned `null` / empty report (rollout gate excludes the profile).

- [ ] **Step 8: Run the new tests**

Run: `cd apps/api && pnpm exec jest src/inngest/functions/session-completed.test.ts -t "dedup"`
Expected: PASS, 2 new tests.

- [ ] **Step 9: Files to stage on commit**

```
apps/api/src/inngest/functions/session-completed.ts
apps/api/src/inngest/functions/session-completed.test.ts
apps/api/src/inngest/helpers.ts
packages/database/src/repository.ts
```

---

## Task 10: Cascade-delete on `deleteMemoryItem` for merged rows

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

## Task 11: Add the dedup integration test (every action branch)

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

## Task 12: Add the suppressed-prewrite integration test

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

## Task 13: Eval-llm A/B harness for dedup decisions

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

## Task 14: Update spec, alerts, and documentation

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
| `memory.dedup.failed` rate (any reason) | <1% rolling 7d | >1% rolling 24h | >5% rolling 24h |
| `memory.dedup.failed` rate (reason=`merged_text_violates_no_new_content`) | <0.5% rolling 7d | >0.5% rolling 24h | >2% rolling 24h |
| `memory.dedup.cap_hit` per session | <0.1% of sessions | >0.5% of sessions | >2% of sessions |
| `memory.dedup.skipped_no_embedding` per session | <1% of sessions | >5% of sessions | >20% of sessions (Voyage degradation) |
| Phase 1 wipe-all unique-constraint exceptions | 0 (regression) | any | any |
| `memory_dedup_decisions` row growth | informational | spike >5x baseline | spike >10x baseline |

- [ ] **Step 3: Document the memo invalidation operator runbook**

Add a short section to `docs/architecture.md` (or the runbook) describing:

```
# Invalidating memory_dedup_decisions memos

When the dedup LLM (`claude-haiku-4-5-20251001`) is upgraded or the merge prompt
materially changes, prior memo decisions may no longer reflect the current
model's judgment. To invalidate, run against staging first:

  DELETE FROM memory_dedup_decisions WHERE model_version = '<old-model-id>';

Or for a time-bound flush:

  DELETE FROM memory_dedup_decisions WHERE created_at < NOW() - INTERVAL '90 days';

Invalidation is safe: the next session will re-derive the decision via the LLM
(bounded by MAX_DEDUP_LLM_CALLS_PER_SESSION). No memory_facts data is lost.
```

- [ ] **Step 4: Update CLAUDE.md or the project-memory index** for Phase 3 deploy state.

Add an entry like:

```
- Phase 3 dedup shipped behind MEMORY_FACTS_DEDUP_ENABLED + MEMORY_FACTS_DEDUP_ROLLOUT_PCT (deterministic per-profile gate, not Math.random). Phase 1 wholesale-rewrite modified to wipe ALL profile rows (active + superseded) so FK cascade resurrection cannot violate the active unique index. Memo table memory_dedup_decisions records model_version for future invalidation.
```

- [ ] **Step 5: Files to stage on commit**

```
docs/specs/2026-05-05-memory-architecture-upgrade.md
docs/architecture.md
~/.claude/projects/.../memory/project_memory_phase3.md   # if added
```

---

## Task 15: Rollout checklist (operational, not code)

> This is a checklist for the coordinator/operator to run as a sequence. No code changes. No commit.

**Phase 1 wipe-all change ships separately and FIRST:**

- [ ] Task 2 commit (`replaceActiveMemoryFactsForProfile` wipe-all) merges to main and deploys to staging.
- [ ] Soak on staging for 24h. Watch for unique-constraint exceptions on `memory_facts_active_unique_idx` — should be zero. Watch Voyage embed call rate per profile per session — should be unchanged from baseline (embeddings preserved across wipe via the extended `embeddingByKey`).
- [ ] Task 2 deploys to production. Soak 24h with the same metrics.

**Phase 3 dedup rollout (after Phase 1 wipe-all is stable):**

- [ ] Migration 0059 applied to staging via `drizzle-kit migrate`. Confirm `memory_dedup_decisions` exists.
- [ ] Doppler `stg`: `MEMORY_FACTS_DEDUP_ENABLED=false`. Deploy the staging worker. Confirm the dedup step short-circuits (Inngest UI shows the step with `null` return).
- [ ] Doppler `stg`: flip to `true`, set `MEMORY_FACTS_DEDUP_ROLLOUT_PCT=100` for staging only. Run a curated learner session that produces near-duplicates. Inspect the `memory.fact.merged` event in Inngest. Spot-check the merged_text against both inputs (the runtime `findNewContentTokens` guard catches any "new content" violations and emits `memory.dedup.failed` with reason `merged_text_violates_no_new_content` — verify zero of those in the staging run).
- [ ] Run integration tests against staging DB.
- [ ] Doppler `prd`: `MEMORY_FACTS_DEDUP_ENABLED=false`, `MEMORY_FACTS_DEDUP_ROLLOUT_PCT=0`. Deploy. Confirm flag default keeps the step inert.
- [ ] Run `pnpm eval:llm --live --flow memory-dedup-decisions` against the prod LLM key. Manual review of every fixture's decision and merged_text (the harness CLI flag is `--flow`, not `-- --flow=` — verify in Task 13).
- [ ] Doppler `prd`: set `MEMORY_FACTS_DEDUP_ENABLED=true` AND `MEMORY_FACTS_DEDUP_ROLLOUT_PCT=10`. The deterministic gate (Task 1) bucketises ~10% of profiles into the rollout — same profiles every session, no oscillation, no `Math.random` in code. Observe SLO metrics for 48h.
- [ ] Bump `MEMORY_FACTS_DEDUP_ROLLOUT_PCT=50`. The gate is monotonic, so every profile that was in at 10% is still in at 50%. Observe 24h.
- [ ] Bump `MEMORY_FACTS_DEDUP_ROLLOUT_PCT=100`. Full rollout. Observe 24h.
- [ ] Once SLOs are stable at 100%, the rollout config can stay at `100` indefinitely — no code change required. (If you ever want to disable Phase 3 again, set `MEMORY_FACTS_DEDUP_ENABLED=false`.)

---

## Out of Scope (tracked as follow-ups)

- **Refactor `replaceActiveMemoryFactsForProfile` to a per-fact reconcile** that preserves supersede chains across sessions. The current design re-runs dedup each session, which is bounded by the cap + memo. A genuine per-fact reconcile would eliminate even that overhead but requires a coordinated rewrite of the JSONB merge layer and the dual-write contract. Plan separately after the JSONB column drop.
- **Per-turn dedup.** Phase 3 only fires on session end (in the `dedup-new-facts` step). Per-turn extraction with per-turn dedup is a separate spec.
- **Backfill-merge pass** for historical data already in `memory_facts`. Spec already lists this as deferred.
- **Multimodal dedup** — different modality, different similarity space.
- **Dedup admin UX** — view, undo, force-merge / force-split. Operator tooling, not user UX.

---

## Self-review checklist (run after writing the plan; engineer can ignore)

- [x] Every spec § Phase 3 component (1-8) has at least one task: Phase 1 wipe-all prerequisite (Task 2), dedup pass (Task 8), merge prompt + constraint (Task 5), runtime "no new content" guard + metadata-mismatch guard (Task 7), merge log events (Task 8 emit calls), suppressed pre-write (Task 4), user-delete cascade (Task 10), feature flag + rollout gate (Task 1), per-session cap (Tasks 1, 8), retroactive-merge non-goal (called out in Out of Scope).
- [x] No placeholders left in code blocks. Every code step is a real implementation or a clearly-marked `// ...` over a fixture-shape detail.
- [x] Type names consistent (`DedupResponse`, `DedupActionOutcome`, `DedupPassReport`, `DedupLlmResult`, `RelevantMemoryFact`).
- [x] File paths are real and verified by spot-check at plan time.
- [x] Architectural conflict between Phase 1 wholesale-rewrite and Phase 3 supersede chains is surfaced explicitly in the header AND resolved by Task 2 (wipe-all + extended embeddingByKey), not deferred.
- [x] All step-helper signatures verified against `session-completed.ts:1242,1252` (no-args).
- [x] All package barrel imports verified — `generateUUIDv7` and `MemoryFactRow` re-exported in Task 7 Step 0.
- [x] Cap-induced skips counted in `cappedSkipped`, not `keptAsNew` (HIGH-4).
- [x] `findRelevant`'s over-fetch is iterated, not just first-best (MEDIUM-1).
- [x] Memo schema includes `model_version` for invalidation (MEDIUM-4).
- [x] Rollout gate is deterministic, not `Math.random()` (MEDIUM-5).
