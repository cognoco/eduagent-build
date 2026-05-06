# Memory Architecture Upgrade

**Date:** 2026-05-05
**Status:** Design — pending review
**Author:** brainstormed with @jjoerg via Claude

## Problem (in product terms)

The mentor already remembers patterns about each learner — strengths, struggles, interests, communication preferences. Today these live as long lists inside a single database row per learner. Two consequences:

1. **Memory grows but doesn't get smarter.** New observations append to the lists; nothing dedupes them. After 50 sessions, "struggles with fractions" can appear five times in five slightly different wordings. The mentor reads recent items, not relevant ones, so old-but-relevant memory gets crowded out by noise.

2. **Retrieval is "the most recent N entries," not "the most relevant entries."** When a learner returns to fractions after three months, the mentor sees what was noted last week — which may be about something entirely different.

The result: memory works, but it doesn't compound. The mentor today knows roughly the same amount about a learner after 5 sessions as after 50. We want memory that gets meaningfully better the more the learner uses the app.

## Goals

1. **Memory compounds.** Over time, the mentor's understanding of a learner deepens — duplicates merge, related observations connect, contradictions resolve.
2. **Retrieval is by relevance.** When the session is about fractions, mentor memory injects facts about fractions — even if they were observed six months ago and there are 200 newer items.
3. **Privacy posture is preserved.** No verbatim conversation quotes stored. Facts are summaries, not transcripts. The retention spec's "we forget your conversations after 30 days" promise stays honest.
4. **User control surface is identical.** The existing memory export, deletion, suppression, and consent toggles continue to work exactly as today. No new UX surfaces required for Phase 1 and Phase 2.
5. **Fact volume stays controllable.** Dedup prevents unbounded growth even for heavy users.

## Phasing

This spec ships in three phases. Each phase is independently shippable and produces value (or de-risks the next).

| Phase | What ships | What the user / mentor sees | What it enables next |
|---|---|---|---|
| **Phase 1 — Foundation** | New `memory_facts` table; backfill from existing JSONB arrays; dual-write transition | Nothing. Mentor behaves identically | Phase 2 |
| **Phase 2 — Semantic retrieval** | Embeddings on every fact; relevance-based retrieval replaces recency-based | Mentor retrieves *relevant* memory for the current topic, not the most recent. Tutor / quiz prompts notably better-tailored | Phase 3 |
| **Phase 3 — Dedup & merge** | Write-time semantic dedup with small LLM call to merge / supersede / keep_both | Memory stops accumulating duplicates. Memory page (when viewed) is cleaner. Long-term mentor coherence improves | — |

Phase 1 has no user-visible benefit on its own; it exists to unlock Phase 2. Phases 2 and 3 each ship product value independently.

## Non-Goals

- **Multimodal memory** (images of worksheets, drawings). Tracked as separate spec if/when the product needs it.
- **Per-turn extraction.** Memory continues to be extracted at session-end via `analyzeSessionTranscript`, exactly as today. Per-turn extraction (writing facts to memory mid-conversation) is a follow-up that this design supports but doesn't require.
- **Source-quote denormalization.** Facts will reference the source session/event ID for provenance, but will NOT store a verbatim quote of the conversation alongside the fact. This preserves the retention spec's privacy promise — extracted patterns persist, but conversation snippets do not.
- **Memory editing UX changes.** The existing endpoints (`deleteMemoryItem`, `toggleMemoryEnabled`, `toggleMemoryCollection`, `toggleMemoryInjection`, `grantMemoryConsent`) continue to work. Behavior identical from the user's view.
- **Cross-learner memory** (group facts, parent-side aggregates). Out of scope.
- **Backfill of historical sessions.** Mentor memory derived from past sessions stays as-is in `learning_profiles` and is migrated forward; we don't re-extract memory from old transcripts.

## Relationship to other systems

**Existing mentor memory (`learning_profiles` JSONB).** Phase 1 migrates these arrays into `memory_facts` rows: each entry in `strengths[]`, `struggles[]`, `interests[]`, `communicationNotes[]`, plus `suppressedInferences[]` becomes one row. The source entry shapes (`strengthEntrySchema`, `struggleEntrySchema`, `interestEntrySchema`, free-string for notes/suppressed) are richer than a single "fact" string — see Data Model → Backfill mapping for how each field is preserved (subject, topics[], lastSeen, attempts, confidence, interest context). `learningStyle`, `accommodationMode`, `recentlyResolvedTopics` stay as JSONB columns (they're not list-of-facts shaped — they're config / transient state). After a soak period and confirmed parity, the migrated JSONB columns are dropped in a follow-up (see Rollback → Soak-period column drops).

**Tiered conversation retention spec (`docs/specs/2026-05-05-tiered-conversation-retention.md`).** The two specs are designed to coexist:
- Memory facts persist indefinitely; conversation transcripts purge at 30 days. This is the same pattern as today (struggles persist, transcripts don't). User-facing privacy story is unchanged.
- A fact's `sourceEventId` may dangle after the source session purges. The retention spec's mobile fallback (UI shows session summary card instead of jumping to a specific event) handles this. No additional wiring needed in this spec.
- When this spec ships, the retention spec's Component 3 step 1 (re-embed `llmSummary.narrative` at purge) becomes lower-leverage because long-tail retrieval is now fact-grain. The retention spec already lists this as a removable bridge. Decision deferred to Phase 2 of this spec — at that point we evaluate whether to drop the re-embed.

## Architecture

### Data flow at session-end (Phases 1-3)

```
Session ends → analyzeSessionTranscript runs (UNCHANGED)
            → applyAnalysis writes facts (CHANGED)
                ├─ Phase 1: writes to memory_facts table AND existing JSONB (dual-write)
                ├─ Phase 2: same as Phase 1, plus embeds each new fact (Voyage)
                └─ Phase 3: same as Phase 2, plus dedup pass:
                    for each new fact:
                        find similar facts via cosine similarity
                        if best match exceeds threshold:
                            small LLM call → {merge|supersede|keep_both}
                            apply action
                        else:
                            insert as new fact
```

### Data flow at prompt-injection time (Phase 2 onwards)

All reads go through `createScopedRepository(profileId)` (CLAUDE.md non-negotiable). The retrieval helper enforces consent gating (`memoryEnabled` AND `memoryInjectionEnabled`) at the top — both must be on or it returns `[]`.

```
Prompt builder needs memory for current session
   → if !profile.memoryEnabled || !profile.memoryInjectionEnabled: return []
   → scoped = createScopedRepository(profileId)
   → query memory_facts via scoped repo (profile_id filter is implicit + WHERE superseded_by IS NULL)
       Phase 1: ORDER BY created_at DESC LIMIT N (parity with today)
       Phase 2: two-stage —
                  (1) SQL: SELECT id, embedding <=> $queryEmbedding AS distance, observed_at
                           ORDER BY embedding <=> $queryEmbedding LIMIT K' (K' = 4·K)
                  (2) app-side blend: score = (1 - distance/2) * w_relevance
                                            + exp(-age_days / halflife_days) * w_recency
                       (distance is cosine distance ∈ [0, 2]; halflife default 90d;
                        weights tuneable, default w_relevance=0.7, w_recency=0.3)
                       sort by score desc, take top N
   → format as today
   → inject into prompt
```

K' over-fetch (4·K) is a safeguard against HNSW post-filter shortfall: cross-profile rows are filtered by the scoped repo, superseded rows by the partial index. Tuned in implementation.

## Data Model

### New table: `memory_facts`

```ts
const memoryFacts = pgTable('memory_facts', {
  id: uuid('id').primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),

  /** Open string with seeded values: 'struggle' | 'strength' | 'interest' | 'communication_note' | 'suppressed' | (free).
   *  `suppressed` is a reserved sentinel category — it is NOT in the user-facing
   *  deleteMemoryItem enum (`packages/schemas/src/learning-profiles.ts`); it is the
   *  storage representation of `suppressedInferences[]`. */
  category: text('category').notNull(),
  /** Render-safe text used by prompt formatters and surfaced to the user. Phase 1 cap (e.g. 500 chars) tuned in implementation. NOT a lossless representation — the structural fields below are authoritative. */
  text: text('text').notNull(),
  /** Normalized form of `text` (case + whitespace fold via `sameNormalized`). Used for the suppressed-fact pre-write check (Phase 3) and dedup exact-match shortcut. */
  textNormalized: text('text_normalized').notNull(),
  /**
   * Category-specific structured fields. The renderer (`buildHumanReadableMemoryExport` analogue) consumes these;
   * `text` is derived. Examples by category:
   *   strength:           { subject, topics: string[], confidence }
   *   struggle:           { subject, topic, lastSeen, attempts, confidence }
   *   interest:           { label, context: 'free_time' | 'school' | 'both' }
   *   communication_note: {}
   *   suppressed:         { originCategory: 'interests' | 'strengths' | 'struggles' | 'communicationNotes' | 'learningStyle' }
   */
  metadata: jsonb('metadata').notNull().default({}),

  /** Provenance — array because Phase 3 merges aggregate sources. */
  sourceSessionIds: uuid('source_session_ids').array().notNull().default([]),
  sourceEventIds: uuid('source_event_ids').array().notNull().default([]),
  /** When this fact was first observed. Distinct from createdAt: a merged fact's createdAt is the merge time, observedAt is the earliest source. */
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),

  /** Phase 3 fields (unused in Phase 1): tracks merge / supersede chain. */
  supersededBy: uuid('superseded_by').references(() => memoryFacts.id),
  supersededAt: timestamp('superseded_at', { withTimezone: true }),

  /** Phase 2 field — nullable (unset in Phase 1; written by Phase 2 embedding step or backfill cron).
   *  Use a nullable variant of the existing `vector` customType from
   *  `packages/database/src/schema/embeddings.ts` (extend it to drop the implicit notNull
   *  while keeping the 1024-dim shape — same Voyage `voyage-3.5` model). Do NOT introduce
   *  a second customType; share the dimension constant. */
  embedding: vectorNullable('embedding'),  // 1024-dim, same model as sessionEmbeddings (voyage-3.5)

  /** Confidence: high | medium | low. Per-fact, inherited from each entry's own
   *  `confidence` field on the source schema (`strengthEntrySchema.confidence`,
   *  `struggleEntrySchema.confidence`). NOT the analyzer-overall `confidence` field
   *  on `sessionAnalysisOutputSchema` (which is a single value gating the whole
   *  analysis at `applyAnalysis` line 1196). */
  confidence: text('confidence', { enum: ['low', 'medium', 'high'] }).notNull().default('medium'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('memory_facts_profile_category_idx').on(table.profileId, table.category),
  index('memory_facts_profile_created_idx').on(table.profileId, table.createdAt),
  // Phase 2: HNSW index on embedding for fast nearest-neighbor — PARTIAL on
  // `superseded_by IS NULL` so Phase 3 superseded rows do not pollute results
  // and the post-filter doesn't shrink the K-nearest candidate set.
  index('memory_facts_embedding_hnsw_idx')
    .using('hnsw', table.embedding.op('vector_cosine_ops'))
    .where(sql`${table.supersededBy} IS NULL`),
  // Active facts only (not superseded) — most relational queries filter on this.
  index('memory_facts_active_idx').on(table.profileId, table.category)
    .where(sql`${table.supersededBy} IS NULL`),
  // Suppression pre-write check uses (profileId, textNormalized).
  index('memory_facts_profile_text_normalized_idx').on(table.profileId, table.textNormalized),
]);
```

#### Backfill mapping (Phase 1)

The source-entry shapes are richer than `text` alone. The mapping below preserves all structural fields by routing them through `metadata`. `observedAt` resolution prefers entry-level timestamps (`struggles[].lastSeen`, `interestTimestamps[label]`) and falls back to `learning_profiles.createdAt`.

| Source | text | metadata | observedAt | confidence |
|---|---|---|---|---|
| `strengths[]: StrengthEntry` (1 entry can have N topics) | rendered as today: `"${subject}: ${topics.join(', ')} (${confidence})"` | `{ subject, topics, source }` | `learning_profiles.createdAt` (no per-entry timestamp exists today) | `entry.confidence` |
| `struggles[]: StruggleEntry` | rendered as today: `"${subject ? subject + ': ' : ''}${topic} (${confidence}, attempts ${attempts})"` | `{ subject, topic, attempts, source }` | `entry.lastSeen` | `entry.confidence` |
| `interests[]: InterestEntry` | `entry.label` | `{ context: 'free_time' \| 'school' \| 'both' }` (BKT-C.2) | `interestTimestamps[entry.label]` if present, else `learning_profiles.createdAt` | `'medium'` (no per-entry confidence on interests today) |
| `communicationNotes[]: string` | the string | `{}` | `learning_profiles.createdAt` | `'medium'` |
| `suppressedInferences[]: string` | the string | `{ originCategory: '<best-guess from existing matchers>' }` (or `'unknown'` when not derivable) | `learning_profiles.createdAt` | `'medium'` |

`textNormalized` is computed at write time using the same `sameNormalized` helper that the existing `unsuppressInference` filter at `apps/api/src/services/learner-profile.ts:1349` uses. This is what the Phase 3 suppression pre-write check matches against.

### Existing `learning_profiles` columns — disposition

| Column | Phase 1 | After soak |
|---|---|---|
| `strengths` (JSONB) | Backfilled into `memory_facts`. Dual-written for soak period | Dropped |
| `struggles` (JSONB) | Backfilled into `memory_facts`. Dual-written for soak period | Dropped |
| `interests` (JSONB) | Backfilled into `memory_facts`. Dual-written for soak period | Dropped |
| `communicationNotes` (JSONB) | Backfilled into `memory_facts`. Dual-written for soak period | Dropped |
| `suppressedInferences` (JSONB) | Backfilled into `memory_facts` with `category='suppressed'`. Dual-written | Dropped |
| `learningStyle` (JSONB) | Kept — config-shaped, not fact-list-shaped | Kept |
| `accommodationMode` (text) | Kept | Kept |
| `recentlyResolvedTopics` (JSONB) | Kept — transient surface state | Kept |
| `interestTimestamps` (JSONB) | Folded into `memory_facts.observedAt` and dropped | Dropped |
| `effectivenessSessionCount` (int) | Kept | Kept |
| `memoryEnabled`, `memoryConsentStatus`, `memoryCollectionEnabled`, `memoryInjectionEnabled` | Kept — consent gating | Kept |
| `consentPromptDismissedAt` | Kept | Kept |

The existing `deleteMemoryItem` API takes `{category, value, subject?, suppress?}` where `category ∈ {'interests', 'strengths', 'struggles', 'communicationNotes', 'learningStyle'}` (`packages/schemas/src/learning-profiles.ts:233-244`). The user-facing enum does NOT include `suppressed`; suppression is a side-effect of a delete-with-`suppress=true`, not a deletable category.

After Phase 1, this maps to a two-step write inside the dual-write transaction (mirroring the existing `buildDeleteMemoryItemUpdates` semantic at `learner-profile.ts:1312`):

1. Delete the matching row(s) from the origin category:
   `DELETE FROM memory_facts WHERE profile_id = $profileId AND category = $category AND text_normalized = sameNormalized($value)` (subject scoping when category is `strengths`/`struggles`).
2. If `suppress=true`, insert a row with `category='suppressed'`, `text=value`, `text_normalized=sameNormalized(value)`, `metadata.originCategory=$category`. This is the storage representation of `suppressedInferences[]` — the user-facing API and enum are unchanged.

`createScopedRepository(profileId)` wraps both writes; `verifyProfileOwnership` continues to gate the route handler as today (`learner-profile.ts:1308`). The API contract is unchanged.

## Components

### Phase 1 — Foundation

**1. Migration `00XX_memory_facts.sql`** — creates the table with all Phase 1 + Phase 2 + Phase 3 columns up front. Phase 2/3 columns are nullable so they cost nothing in Phase 1. Avoids three migrations.

**2. Backfill script** — runs once at deploy. For each `learning_profiles` row, expands every entry in `strengths[]`, `struggles[]`, `interests[]`, `communicationNotes[]`, `suppressedInferences[]` into a `memory_facts` row. `observedAt` derived from `interestTimestamps` where available, else `learning_profiles.createdAt`.

**3. `applyAnalysis` extended — concurrency model rewrite.** Today's flow at `apps/api/src/services/learner-profile.ts:1186-1297` uses optimistic version locking on `learning_profiles` (`updateWithRetry` with `WHERE version = $expectedVersion`, retry-with-fresh-read on stale-version). That pattern cannot wrap a second-table insert atomically — the retry re-reads the source row but the `memory_facts` writes from the first attempt's pre-retry diff would already be partially committed.

The dual-write replaces the optimistic loop with a transaction that locks the row first:

```
BEGIN
  SELECT * FROM learning_profiles WHERE profile_id = $1 FOR UPDATE
  -- compute updates + memory_facts insert set against the locked snapshot
  UPDATE learning_profiles SET ..., version = version + 1 WHERE profile_id = $1
  INSERT INTO memory_facts (...rows...)
COMMIT
```

`db.transaction` works on neon-serverless (`packages/database/src/client.ts:53-72`); the existing `applyAnalysis` retry loop is removed in favor of the `FOR UPDATE` lock. The version column stays for read-side cache invalidation but is no longer load-bearing for write contention. Inngest auto-retry handles transient connection failures (same as today).

No change to extraction (`analyzeSessionTranscript` is unchanged).

**4. Memory injection at prompt-build time** — wherever the existing code reads `learning_profiles.struggles` / `strengths` / etc., add a switch: read from `memory_facts` via `createScopedRepository(profileId)` (new path) or from JSONB (legacy fallback). Behind a feature flag `MEMORY_FACTS_READ_ENABLED`. Default off until parity is confirmed. The new path enforces consent gating (`memoryEnabled` AND `memoryInjectionEnabled`) at the helper boundary — if either is off, returns `[]`.

**5. Parity test suite (semantic, not byte-identical).** For each prompt builder that injects memory, run a fixture comparison: same learner, same session context. Byte-identical output is NOT achievable (the source schemas — `StrengthEntry` with `topics: string[]`, `StruggleEntry` with `attempts`/`lastSeen` — are richer than any single fact-row representation; backfill projects through metadata and re-renders, which is order-stable but not byte-stable across formatter changes). The gate is **rendered-prompt semantic equivalence**:
- Same set of memory items appears (set equality on rendered bullets).
- Same ordering rule applied (recency desc in Phase 1).
- Same character budget (truncation parity).

Deploy gate: 100% pass on the semantic parity suite before flipping `MEMORY_FACTS_READ_ENABLED`. The suite is enumerated per prompt-injection site, not per character.

**6. `deleteMemoryItem` endpoint** — extended to write to both stores during dual-write under a single transaction, then to `memory_facts` only after the soak period. `verifyProfileOwnership` continues to gate the route as today. Unchanged from the user / mobile client perspective.

### Phase 2 — Semantic retrieval

**1. Embedding on write** — `applyAnalysis` adds a step: for each newly-written fact, call Voyage with `text` → 1024-dim vector. Store on the row. Voyage failure does NOT block the write — fact persists with `embedding=null`, picked up by a retry cron. Voyage is already used by `sessionEmbeddings`; same API key path.

**2. Backfill cron `memory-facts-embed-backfill`** — runs hourly, finds rows with `embedding IS NULL`, embeds in batches of 100. Self-throttling (Voyage rate limits).

**3. Retrieval helper `getRelevantMemories(profileId, queryText, k, options?)`** — replaces the recency-only injection in tutor / quiz / coaching prompt builders. Implementation contract:

- Wrapped in `createScopedRepository(profileId)` — `WHERE profile_id = $profileId` is implicit on every read (CLAUDE.md non-negotiable).
- Consent gate at the top: if `!profile.memoryEnabled || !profile.memoryInjectionEnabled`, return `[]` immediately. No DB read, no embed call.
- Two-stage retrieval:
  - Stage 1 (SQL): fetch top-K' candidates via pgvector's `<=>` cosine-distance operator (lower-is-better). K' = 4·K to absorb post-filter shrinkage from cross-profile or superseded rows. The HNSW index is partial on `superseded_by IS NULL` so superseded rows never enter the candidate set.
  - Stage 2 (app-side): blend `score = (1 - distance/2) * w_relevance + exp(-age_days / halflife_days) * w_recency`. `distance` is the pgvector cosine distance ∈ [0, 2]; `(1 - distance/2)` normalizes to [0, 1]. Default halflife 90 days, default weights `w_relevance=0.7`, `w_recency=0.3`. Sort by score desc, take top N.
- Falls back to recency-only when the candidate set has any `embedding IS NULL` (transition state) or when stage-1 returns < K results.

**4. A/B comparison harness** — existing eval-llm harness adds a flow that takes the same fixture session and runs it through (a) recency-only injection and (b) relevance-based injection, snapshots both prompts. Reviewed manually before flipping the flag.

**5. Feature flag `MEMORY_FACTS_RELEVANCE_RETRIEVAL`** — gates the new retrieval. Default off in Phase 2 deploy; flipped after A/B review confirms quality.

### Phase 3 — Dedup & merge

**1. Dedup pass in `applyAnalysis`** — after writing a candidate fact, query top-K nearest neighbors via `createScopedRepository(profileId)` (profile_id implicit) AND `category = $category` AND `superseded_by IS NULL`. If best match by cosine distance is below threshold (default 0.15 cosine distance ≈ 0.85 cosine similarity), call a small LLM (Haiku-tier) with: existing fact, candidate fact → return one of:
- `merge` with merged_text — supersedes both, new row inserted with combined `sourceSessionIds[]` + `sourceEventIds[]`, both inputs marked `supersededBy=newRow.id`.
- `supersede` — new fact replaces old (old marked superseded), source IDs union from both.
- `keep_both` — distinct facts, both stay active.
- `discard_new` — new fact is redundant, drop it.

**Merge prompt constraint (privacy chain).** Merging is an LLM derivative of two prior LLM extractions. To prevent the merger from introducing facts not present in either input, the merge prompt MUST instruct: *"Output only semantic content present in at least one input. Do not add detail, infer cause, or rephrase into new claims. If the two inputs disagree, prefer the more recent and emit `supersede`, not `merge`."* The merged_text is run through the suppressed-fact pre-write check (component 5 below) before insert.

**2. Merge preserves all source refs** (CLAUDE.md retention coherence rule from the retention-spec discussion). The earliest source's session may purge in the future; that's handled by the retention spec's existing dangling-pointer fallback.

**3. Merge log** — every merge / supersede emits an Inngest event `memory.fact.merged` (sessionId, profileId, action, mergedFromIds, newFactId). For ops observability and for any future "show me what changed in my memory" UX. Events carry IDs only; the fact text is NOT included in the event payload (privacy — same rule as retention spec).

**4. Dedup runs only on Phase 3 deploy.** Pre-existing duplicates in the migrated data are NOT retroactively merged in Phase 3. They naturally consolidate the next time a similar fact is observed (the new fact triggers dedup against them). A backfill-merge pass is a separate decision, deferred — the natural rate of consolidation is likely sufficient and a backfill is risky.

**5. Suppressed-fact pre-write check (Phase 3 entry point).** Before inserting any new fact (or any merged_text from step 1), look up `memory_facts WHERE profile_id = $profileId AND category = 'suppressed' AND text_normalized = sameNormalized($candidate.text)` via the scoped repo. If a row exists, drop the candidate silently and emit `memory.fact.suppressed_skip` (IDs only). Uses the same `sameNormalized` helper as `unsuppressInference` (`learner-profile.ts:1349`) so the match key stays consistent across read/write paths.

**6. User-delete with merge ancestry — cascade rule.** When a user calls `deleteMemoryItem` and the matching row has descendants in the supersede chain (i.e., it's an active row produced by a merge), the delete cascades up the `supersededBy` ancestry: every ancestor row is hard-deleted in the same transaction. This prevents originals from persisting silently after the user's "forget this" gesture. Implementation: recursive CTE up the `supersededBy` ancestry, scoped by `profileId`. Memory export endpoint never reveals superseded rows; user-perceived delete = full removal of the lineage.

**7. Feature flag `MEMORY_FACTS_DEDUP_ENABLED`** — default off; ramp up by percentage of writes after live observation.

**8. Per-session dedup budget cap.** Hard cap of `MAX_DEDUP_LLM_CALLS_PER_SESSION = 10`. If a session generates >10 candidate facts that hit the similarity threshold, only the first 10 trigger LLM dedup; the remainder are inserted as new and consolidated naturally on a future write. Cap is a code-level constant, not a heuristic — required so a heavy-user session has a bounded LLM cost. Tracked via `memory.dedup.cap_hit` event (IDs only).

## User-facing behavior — what changes and what doesn't

| Surface | Today | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|---|
| Mentor responses | Use last-N memory by recency | Same (parity required) | **Better** — relevance-weighted memory injection | Same as Phase 2 + cleaner long-term memory |
| Memory export endpoint | Lists strengths / struggles / interests / notes | Same output | Same output (sorted by relevance to query if a query is provided, else by recency) | Same; fewer duplicates |
| Delete memory item | Removes entry; optional suppress | Same | Same | Same |
| Memory consent toggle | Off → no extraction, no injection | Same | Same | Same |
| Notifications when memory changes | None | None | None | **None** — merges are silent (per `feedback_quiet_defaults_over_friction.md`) |
| Volume of stored memory per learner | Grows unbounded | Same | Same | **Bounded** — dedup keeps it stable |

## LLM Call Cost per `session-completed`

| Phase | New LLM completion calls | New Voyage (embedding) calls |
|---|---|---|
| Today | 0 | 0 |
| Phase 1 | 0 | 0 |
| Phase 2 | 0 | Write-side: +N (one per new or text-changed fact written this session, typically 1-5). Query-side: +M per session, where M = number of user turns; the current user-message embedding is shared between similar-topic retrieval and `memory_facts` relevance retrieval so this is not 2M. |
| Phase 3 | +min(K, 10) Haiku-tier calls (K = facts that hit similarity threshold; capped per session by `MAX_DEDUP_LLM_CALLS_PER_SESSION = 10`) | same as Phase 2 |

Phase 3's per-fact dedup call is the cost-watch item. Mitigations: (a) Haiku-tier model, (b) only fires when a candidate fact has a near-duplicate in storage, (c) hard per-session cap of 10 LLM calls (component 8), (d) implementation-time exploration of folding the dedup decision into the existing `analyzeSessionTranscript` prompt as a multi-section structured output (would eliminate the per-fact call entirely). Tracked in Open Questions.

## Failure Modes

| State | Trigger | User sees | Recovery | Verified by |
|---|---|---|---|---|
| Phase 1 dual-write: `memory_facts` write fails, JSONB write succeeds | DB transient error | Nothing immediately; reconciliation gap | `applyAnalysis` opens a single transaction with `SELECT ... FOR UPDATE` on the `learning_profiles` row, then UPDATE + INSERT in that order; either both succeed or both fail. Inngest auto-retry | integration test: mock memory_facts INSERT failure, assert JSONB UPDATE also rolls back |
| Phase 1 dual-write: JSONB write fails, `memory_facts` write succeeds | DB transient error | Same as above — transactional | Same — atomic | same test |
| Phase 1 dual-write: concurrent writes race on the same profile | Two Inngest workers run `applyAnalysis` for the same profileId near-simultaneously | Without locking, second worker's read-modify-write loses the first's facts | `SELECT ... FOR UPDATE` on `learning_profiles` row serializes; second worker waits for first's COMMIT before computing its diff against the post-first snapshot | integration test: kick two parallel `applyAnalysis` calls for one profileId, assert both sets of facts persist |
| Phase 1 parity test fails before flag flip | Migration loses or reorders facts | Mentor response drift between code paths | Block flag flip until semantic parity is 100% (set equality on rendered bullets, ordering rule match, truncation parity). Investigate diff | semantic parity test suite |
| Cross-profile read leak | New `getRelevantMemories` helper bypasses `createScopedRepository` | Profile A retrieves Profile B's facts in injected memory | All reads must go through `createScopedRepository(profileId)`; route-level break test asserts profile A query returns zero rows from profile B's facts | break test: insert facts for two profileIds, query as profile A, assert no profile-B rows |
| Memory injected when learner has revoked consent | New retrieval path forgets to gate on `memoryEnabled`/`memoryInjectionEnabled` | Facts injected despite user toggling memory off | `getRelevantMemories` consent gate at top: returns `[]` when either flag is false. Same guard as today's `learner-profile.ts:820` | unit test: toggle `memoryInjectionEnabled=false`, call `getRelevantMemories`, assert `[]` |
| Backfill missed historical entries | JSONB array element with malformed shape | Lost memory entry for that learner | Backfill is idempotent and emits a per-row log; rerun with --resume | backfill audit log |
| Phase 2 Voyage embedding fails on write | Voyage API outage | Fact persists with `embedding=null`; not retrievable by relevance until backfill cron picks it up | Cron `memory-facts-embed-backfill` retries hourly; alert if backlog > 1000 rows | integration test: mock Voyage 500, assert fact written + cron retries |
| Phase 2 relevance retrieval returns empty when JSONB recency would have returned data | Embedding query mismatched / cold start | Fewer memories injected into prompt | Retrieval helper falls back to recency-only when relevance returns < N items | unit test: assert fallback fires |
| Phase 3 dedup LLM returns invalid action | LLM drift / network error | Candidate fact written without dedup (safe default) | Default behavior: insert as new fact, emit `memory.dedup.failed` event | integration test: mock dedup LLM 500, assert candidate written |
| Phase 3 merge keeps too aggressive — distinct facts collapsed | Threshold too low / LLM hallucinates similarity | Memory loses nuance; mentor sees collapsed view | Tuneable threshold; A/B harness reviewed before flag flip; user-visible delete cascades up the supersede ancestry (component 6) so a wrong merge plus delete fully removes both originals | review gate; ancestry-cascade delete test |
| Phase 3 merge introduces details not in either source | LLM hallucinates while merging | A fact persists that the user never said and was never extracted | Merge prompt forbids new content; merged_text run through suppression pre-write check; spot-check via merge log review | unit test: feed two facts to merge prompt, assert output token-set ⊆ union of inputs |
| Phase 3 dedup LLM budget cap hit | Heavy session generates > MAX_DEDUP_LLM_CALLS_PER_SESSION candidates with near-duplicates | First 10 deduped, rest inserted as new — natural consolidation on next session | By design; emit `memory.dedup.cap_hit`. Alert if a single session hits cap >2× (signal of broken extractor) | integration test: feed 15 near-dup candidates, assert exactly 10 dedup calls + 5 inserted as new |
| User deletes a merged fact, ancestor rows leak | Cascade-up the `supersededBy` chain not implemented | Original pre-merge texts persist after user "forgot" the fact | Recursive CTE deletes ancestors in the same transaction; export endpoint never reads superseded rows | break test: merge two distinctive-text facts, delete the merged row, assert ancestor rows gone for that profileId |
| Account deletion mid-Phase | User deletes account | All cascade-deletes work; memory_facts FK-cascades on `profileId` | N/A | extended account-deletion test asserts `memory_facts` rows gone |
| Consent revoked while memory_facts populated | User toggles `memoryEnabled=false` | Existing facts stay (per today's behavior — collection stops, stored data persists until explicit delete). Match existing semantics | N/A — by-design parity | unit test: toggle off, assert existing facts not deleted; new analyzeSessionTranscript runs no-op |
| Suppressed fact re-extracted | LLM emits a fact whose text matches a `suppressed` row (case/whitespace-insensitive) | New fact silently dropped at write | Pre-write check: `text_normalized` matches a `suppressed` row for same profileId → skip insert. Uses `sameNormalized` helper (`learner-profile.ts:1349`) so case/whitespace variants are caught | unit test: insert `suppressed` row, attempt re-write of `'Fractions '`, `'fractions'`, `'FRACTIONS'`, assert no duplicate insert in any case |

## Rollback

**Phase 1:**
- Disable `MEMORY_FACTS_READ_ENABLED` flag — reads return to JSONB. No data loss.
- If the issue is in the new table, drop it. JSONB arrays are still authoritative during dual-write.
- If the issue is in dual-write logic itself, revert the `applyAnalysis` extension. JSONB arrays continue as today.

**Phase 2:**
- Disable `MEMORY_FACTS_RELEVANCE_RETRIEVAL` flag — retrieval returns to recency-only. Embeddings remain in storage but are unused.
- Rollback is non-destructive.

**Phase 3:**
- Disable `MEMORY_FACTS_DEDUP_ENABLED` flag — new facts written without dedup.
- **Already-merged facts cannot be unmerged.** The `supersededBy` chain is preserved, so a forensic reconstruction is possible (re-insert pre-merge rows from `supersededBy` ancestry), but this is not a clean rollback. Treat Phase 3 as point-of-no-return for any session whose facts have undergone merge.
- Mitigation: ramp by percentage of writes; observe merge log for a week before going to 100%.

**Soak-period column drops (post-Phase 1):**
- The drop migration ships in a separate spec/PR that MUST include its own `## Rollback` section per CLAUDE.md ("Any migration that drops columns, tables, or types must include a `## Rollback` section…"). Required content for that section: (a) rollback after drop is impossible without DB backup restore; (b) data is permanently destroyed; (c) recovery procedure is point-in-time restore from Neon backup. State this explicitly: **once dropped, the JSONB arrays are unrecoverable except via PITR.**
- Plan to retain JSONB columns for at least 30 days after parity confirmation, ideally 90.
- The columns retained on `learning_profiles` after the drop are: `learningStyle`, `accommodationMode`, `recentlyResolvedTopics`, `effectivenessSessionCount`, `memoryEnabled`, `memoryConsentStatus`, `memoryCollectionEnabled`, `memoryInjectionEnabled`, `consentPromptDismissedAt`, `version`, `createdAt`, `updatedAt`. The drop migration only touches the five fact-list columns (`strengths`, `struggles`, `interests`, `communicationNotes`, `suppressedInferences`) plus `interestTimestamps`.

## SLO / Alert Thresholds

| Metric | SLO | Warn alert | Page alert |
|---|---|---|---|
| `applyAnalysis` dual-write success rate | ≥99.9% rolling 7d | <99.9% rolling 24h | <99% rolling 24h |
| Phase 1 parity test pass rate | 100% (gate) | any failure | any failure |
| Phase 2 embedding success rate | ≥99% rolling 7d | <99% rolling 24h | <95% rolling 24h |
| Memory facts with `embedding IS NULL` older than 24h | 0 | 100 rows | 1000 rows |
| Phase 3 dedup invalid-action rate | <1% rolling 7d | >1% rolling 24h | >5% rolling 24h |
| `memory.fact.merged` event volume | informational | spike >5x baseline | spike >10x baseline |

## Acceptance Criteria

### Phase 1
- [ ] `memory_facts` table migrated with Phase 1 + Phase 2 + Phase 3 columns up front, including `text_normalized`, partial HNSW index on `superseded_by IS NULL`, and `(profileId, textNormalized)` index.
- [ ] Backfill from existing JSONB arrays follows the per-category mapping table (Data Model → Backfill mapping): `struggles[].lastSeen` → `observedAt`; `interestTimestamps[label]` → `observedAt`; per-entry `confidence` preserved on `confidence` column; interest `context` preserved in `metadata`. Backfill audit log shows zero malformed-row drops or all drops are explicitly logged with reason.
- [ ] `applyAnalysis` writes to both `memory_facts` and JSONB arrays in a single transaction with `SELECT ... FOR UPDATE` on the `learning_profiles` row; integration test asserts both rollback together on failure AND a concurrent-write race test asserts no fact loss.
- [ ] **Semantic parity test suite:** for ≥3 fixture learners and ≥5 prompt-injection sites each, the JSONB-read and memory_facts-read paths produce semantically equivalent rendered prompts (set equality on rendered bullets, ordering rule match, truncation parity). Deploy-blocking.
- [ ] All reads of `memory_facts` go through `createScopedRepository(profileId)`. Route-level break test: profile A query returns zero rows from profile B's facts. Deploy-blocking.
- [ ] Memory injection helper enforces consent gate (`memoryEnabled` AND `memoryInjectionEnabled`) — break test: toggle either flag off, assert helper returns `[]`.
- [ ] `deleteMemoryItem` endpoint behavior unchanged from mobile client perspective. The user-facing category enum is unchanged (`'interests' | 'strengths' | 'struggles' | 'communicationNotes' | 'learningStyle'`). Suppressed-store category `'suppressed'` is internal-only and never appears in API request bodies.
- [ ] Account-deletion cascade test asserts `memory_facts` rows are removed (explicit `WHERE profile_id = $deletedProfileId` count = 0).
- [ ] Migrated `learning_profiles` columns NOT yet dropped (soak period). The post-soak drop migration is a separate spec/PR with its own `## Rollback` section per CLAUDE.md.

### Phase 2
- [ ] Embedding written within 30s of `applyAnalysis` for ≥99% of new facts.
- [ ] Backfill cron picks up `embedding IS NULL` rows hourly; backlog stays under 1000 rows.
- [ ] `getRelevantMemories(profileId, queryText, k)` returns top-k via two-stage retrieval: stage-1 SQL uses pgvector `<=>` cosine-distance operator with K' = 4·K over-fetch against the partial HNSW index; stage-2 app-side blends `(1 - distance/2) * w_relevance + exp(-age/halflife) * w_recency`. Falls back to recency-only when stage 1 returns <k items or any candidate has `embedding IS NULL`.
- [ ] `getRelevantMemories` is wrapped in `createScopedRepository(profileId)` and gates on consent flags. Both verified by break tests.
- [ ] A/B harness produces side-by-side prompt snapshots for fixture sessions; manual review gate passes before flag flip.
- [ ] Recency-only retrieval still works when `MEMORY_FACTS_RELEVANCE_RETRIEVAL` flag is off (rollback path).
- [ ] No additional LLM completion calls per session (embedding is a Voyage call, not a completion).

### Phase 3
- [ ] Dedup pass triggered on every new fact write when flag is on, capped at `MAX_DEDUP_LLM_CALLS_PER_SESSION = 10`. Cap-hit emits `memory.dedup.cap_hit`.
- [ ] Top-K nearest-neighbor query is profile-scoped (via `createScopedRepository`) AND `category = $category` AND `superseded_by IS NULL`.
- [ ] Merged facts retain ALL `sourceSessionIds[]` and `sourceEventIds[]` (no source loss).
- [ ] Merge prompt enforces "no new content" constraint; unit test asserts merged-text token-set ⊆ union of input token-sets on a fixture corpus.
- [ ] `supersededBy` chain queryable; can reconstruct pre-merge state from a row's ancestry.
- [ ] Suppressed facts are not re-inferred — pre-write check matches via `text_normalized` (case + whitespace fold) for same profileId. Break test covers `'Fractions '`, `'fractions'`, `'FRACTIONS'` variants.
- [ ] `memory.fact.merged`, `memory.dedup.failed`, `memory.dedup.cap_hit`, `memory.fact.suppressed_skip` events emit IDs only, no fact text.
- [ ] Dedup invalid-action rate <1% in rolling 7d.
- [ ] Manual delete on a merged fact cascades up the `supersededBy` ancestry — break test: merge two distinctive-text facts, delete the merged row, assert ancestor rows for that profileId are gone (full lineage removed). Re-observe of the original input produces a clean state.

## Out of Scope (tracked as follow-ups)

- **Backfill-merge pass.** Retroactively dedup pre-existing duplicates from the migrated data. Deferred — natural consolidation may be sufficient.
- **Per-turn memory extraction.** Writing facts mid-conversation via the LLM response envelope. This design supports it (the trigger model is the only thing that changes; the table and retrieval don't), but it's a separate scope.
- **Multimodal memory.** Image / drawing references on facts.
- **Memory diff UI** — "Here's what we learned this week." Useful, but not required for Phase 1-3 to ship value.
- **Cross-learner aggregates** for parents managing multiple children.
- **Memory expiration / aging-out** of low-confidence facts beyond what dedup naturally produces.
- **Phase 1 column drops.** Follow-up migration after 30+ days of soak with confirmed parity.

## Decision Points (user-shaping)

These are surfaced for explicit confirmation, not as blockers — the spec's defaults are listed.

1. **Memory diff UI deferral.** Phase 3 introduces silent merges. Some products show "we updated your memory" — we default to silent per `quiet_defaults_over_friction`. Confirmed reasonable, or do you want a memory-changes feed in Phase 3?
2. **Soak duration before dropping JSONB columns.** Default: 30 days minimum, target 90. Longer soak is safer; shorter saves a bit of storage.
3. **Whether Phase 3 ships with the spec or as a follow-up.** Phase 3 is the most product-novel and the most risky (irreversible merges). Defaults to "ships with this spec but flag-gated and ramped." Alternative: defer Phase 3 to a follow-up after Phase 2 has been live a quarter.

## Open Questions for Implementation Plan

1. Concrete recency decay half-life for Phase 2 retrieval (default 90 days; tune in implementation).
2. Concrete cosine similarity threshold for Phase 3 dedup (default 0.85; tune in A/B).
3. Choice of dedup LLM (default Haiku-tier; budget concern at high write volume).
4. Whether to fold the dedup LLM call into the existing `analyzeSessionTranscript` prompt as a multi-section structured output (would eliminate the per-fact extra call).
5. Backfill batch size and run cadence for the embedding backfill cron.
6. A/B harness fixture set construction protocol for Phase 2 quality review.
