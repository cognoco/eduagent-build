# Tiered Conversation Retention

**Date:** 2026-05-05
**Status:** Design — pending review (revision 4 — phased: parent report deferred to Phase 2)
**Author:** brainstormed with @jjoerg via Claude

## Problem

`sessionEvents` (every user message + AI response, plaintext) accumulates forever today. There is no purge job; account-cascade deletion is the only path that removes transcript data. This creates:

- A privacy posture mismatch — we cannot honestly tell users "we don't keep your conversations."
- Linear storage growth in the hottest table of the schema.
- A vector store (`sessionEmbeddings`) that holds verbatim 8000-char snippets of every conversation in perpetuity.

## Goals

1. **Honest 30-day retention** for raw conversation data, with summary-only access thereafter.
2. **Resume UX preserved** — the learner experience of "pick up where I left off" must work identically before and after the boundary.
3. **Long-tail semantic memory preserved** — pgvector retrieval continues to work for sessions older than 30 days, but against summary-derived embeddings, not verbatim transcript.
4. **No data loss from summary-write failures** — the 30-day clock starts from successful summary write, not session-end. A chronic bug becomes a cost problem (oversized transcript table) and a visibility problem (alert), never a correctness problem (silent data loss).
5. **The LLM has a prose record of each session it can read about itself** post-purge, so when the learner returns months later it can recover what happened in this session even though the raw transcript is gone.
6. **(Phase 2) Parent-facing session report**, generated only when a `familyLinks` row exists for the learner, supporting solo learners as a first-class case (no LLM call when no parent is linked).

## Phasing

This spec ships in two phases. **Phase 1 is the full retention story and is independently shippable.** Phase 2 may ship later in this spec, OR be lifted wholesale into a separate parent-dashboard spec — the design is structured so that decision can be made later without reworking Phase 1.

| Phase | Includes | Decision needed before shipping |
|---|---|---|
| **Phase 1** (this spec, ships first) | Retention pipeline: `llmSummary`, `summaryGeneratedAt`, `purgedAt`; reconciliation cron; purge cron; archived-state mobile UI. +1 LLM call per session. | None — design is settled. |
| **Phase 2** (deferred, optional) | `parentReport` column + `generate-parent-report` step. Conditional LLM call: only when `familyLinks` row exists. | Whether to ship under retention or lift into a parent-dashboard spec. |

**Phase 2 lift-out is cheap by design.** The `parentReport` column is independent of retention's purge precondition (purge requires `llmSummary IS NOT NULL`, NOT `parentReport IS NOT NULL`), and the `generate-parent-report` step reads from the already-written `llmSummary` JSONB rather than from the transcript. So:

- If parent-dashboard spec wins: drop the column + step, no impact to Phase 1.
- If retention spec wins: enable the step in `session-completed.ts`, no schema or pipeline rework.

Phase 1 ACs and SLOs do NOT depend on Phase 2 being live. Phase 2 ACs are clearly marked.

## Non-Goals (Phase 1)

- **Memory extraction (struggles, strengths, interests, communication notes).** Already handled today by `analyzeSessionTranscript` in `apps/api/src/services/learner-profile.ts:1501`, which extracts deltas and persists into `learning_profiles` JSONB at session-end. Independent of transcript retention; not duplicated by this spec. See "Relationship to existing mentor memory" below.
- **Parent-facing session report (Phase 2).** Designed in this spec for forward-compatibility but NOT enabled in Phase 1. See Phasing above.
- **Memory architecture upgrade** (relational `memory_facts` table, semantic retrieval on facts, write-time dedup). Separate spec; this design is forward-compatible. When that ships, the re-embed step in component 3 may become redundant and can be dropped.
- **F8 sourceRef provenance population.** F8 fields exist on memory entries but are written as null today; this spec does nothing to change that. Real F8 tap-through fallback is deferred until F8 actually populates source refs.
- **Changes to the existing session-summary pipeline.** `generate-session-insights`, `generate-learner-recap`, and `analyze-learner-profile` continue to run as today. The columns they populate (`highlight`, `narrative` text column, `conversationPrompt`, `engagementSignal`, `learnerRecap`, `closingLine`, `nextTopicId`, `nextTopicReason`) are unchanged.
- F1.x marker-to-envelope migrations (separate Bucket A spec).
- Voice notes / STT for the learner's own end-of-session reflection.
- Account-deletion or consent-revocation flow changes except for additive coverage of new columns.
- Backfill of `llmSummary` for sessions completed before deploy.

## Relationship to existing mentor memory

The codebase already has a mentor memory layer in `learning_profiles`: `strengths`, `struggles`, `interests`, `communicationNotes`, `suppressedInferences`, plus consent gating (`memoryConsentStatus`, `memoryCollectionEnabled`, `memoryInjectionEnabled`). At session-end, `analyzeSessionTranscript` runs one LLM call against the transcript and extracts deltas (the prompt is fed already-tracked struggles and parent-suppressed topics so it emits new information only); `applyAnalysis` appends them. This is independent of transcript retention.

This spec deliberately does **not** duplicate that extraction. The new `llmSummary` is purpose-built for one job: produce prose the LLM will read about itself when it returns to this learner months later, after the raw transcript is gone. Mentor memory continues to handle "what we know about this learner across sessions"; `llmSummary.narrative` handles "what happened in this specific session, written for future self."

When the memory architecture upgrade lands later (relational facts table with embedding retrieval), `llmSummary.narrative` remains useful: it provides session-grain context that complements fact-grain retrieval. The two layers are designed to coexist.

## Architecture

Three-tier lifecycle for conversation data:

```
Live session
    ↓ (user starts session)
Tier 1: Active transcript
    sessionEvents rows append; full transcript in DB
    ↓ (session-completed Inngest fires; new generate-llm-summary step runs alongside existing steps)
Tier 2: Summarized + transcript-buffered (0-30 days post summary)
    sessionEvents kept verbatim; sessionSummaries.llmSummary written
    sessionEmbeddings written from transcript (today's behavior, unchanged)
    ↓ (purge cron, 30 days after successful summary write)
Tier 3: Summary-only (>30 days)
    sessionEvents purged; sessionEmbeddings re-embedded from llmSummary.narrative
    sessionSummaries persists indefinitely; learning_profiles JSONB unaffected
```

The boundary between Tier 2 and Tier 3 is gated on a precondition: a complete schema-valid `llmSummary` must exist. Sessions without one stay in Tier 2 indefinitely until the summary lands.

## Data Model Changes

### New columns on `sessionSummaries`

```ts
// Phase 1 (ships first):
llmSummary: jsonb               // structured envelope (Zod-validated), see schema below
summaryGeneratedAt: timestamp   // first successful write of llmSummary; 30-day clock starts here
purgedAt: timestamp | null      // set when sessionEvents for this session are deleted

// Phase 2 (deferred — may ship here or in parent-dashboard spec):
parentReport: text | null       // null unless familyLinks exists for this learner AND Phase 2 is enabled
```

The `parentReport` column is created in the Phase 1 migration so the column exists from day one (cheap), but is left null in Phase 1 and only populated when Phase 2 is enabled. This avoids a second migration when Phase 2 lands. If the eventual decision is to lift Phase 2 into the parent-dashboard spec, drop the column there — Phase 1 is unaffected.

The purge precondition does NOT require `parentReport IS NOT NULL`, so Phase 1 retention works for family-linked learners exactly as for solo learners.

### `llmSummarySchema` (in `@eduagent/schemas`)

```ts
const llmSummarySchema = z.object({
  /**
   * Self-contained prose, written by the LLM as a note to its future self.
   * Read post-purge: when the learner returns months later and this session's
   * raw transcript is gone, this is what the LLM sees about what happened here.
   * Topic anchors must appear by name (not just in topicsCovered) so semantic
   * search hits them after re-embedding.
   *
   * No floor below 40 chars: auto-closed thin sessions (1-3 exchanges) honestly
   * produce short narratives; padding to hit a higher floor would invite
   * hallucination and create reconciliation loops.
   */
  narrative: z.string().min(40).max(1500),
  /** Plain topic names, used for the archived-card chips. No mastery delta — that's mentor memory's job. */
  topicsCovered: z.array(z.string()).max(20),
  sessionState: z.enum(['completed', 'paused-mid-topic', 'auto-closed']),
  /** "Pick up where you left off" copy. Surfaced in the Tier 3 archived card. */
  reEntryRecommendation: z.string().min(20).max(400),
});
```

Notably absent and intentional: no `notes[]`, no `struggles`/`strengths`, no `engagementSignal`, no `oneLineHighlight`. All of those overlap pipelines that already run; introducing duplicate extraction would double LLM cost and create two sources of truth.

### No changes to existing tables or pipelines

`sessionEvents`, `learningSessions`, the existing `sessionSummaries` columns, `sessionEmbeddings.embedding` shape — all unchanged. `sessionEvents` rows are deleted by the purge cron, table structure unchanged. `sessionEmbeddings.embedding` is overwritten in place at purge; `sessionEmbeddings.content` is overwritten with the (shorter) `llmSummary.narrative`.

`learning_profiles` is untouched. Mentor memory continues to extract via `analyzeSessionTranscript` exactly as today.

## LLM Call Budget per `session-completed`

| Step | LLM completion call? | Status |
|---|---|---|
| `generate-session-insights` | ✅ 1 | UNCHANGED (existing) |
| `generate-learner-recap` | ✅ 1 | UNCHANGED (existing) |
| `analyze-learner-profile` | ✅ 1 | UNCHANGED (existing) |
| `generate-llm-summary` | ✅ 1 | NEW (Phase 1) |
| `generate-parent-report` | ✅ 1 (only when `familyLinks` row exists) | NEW (Phase 2, conditional) |
| `generate-embeddings` | (Voyage, not a completion) | UNCHANGED |

**Pre-spec:** 3 completion calls per session.
**Phase 1 (solo or family-linked):** 4 completion calls per session. **Net increase: +1.**
**Phase 2 (family-linked only):** 5 completion calls per session. **Phase 2 increment: +1, conditional.**

Earlier revisions tried to keep Phase 1 count flat by replacing `generate-session-insights`, but those steps populate columns (`highlight`, `engagementSignal`, etc.) that are read by other surfaces — folding them into the new summary couples retention to those surfaces and inflates blast radius. +1 is the honest minimum.

The implementation plan should explore folding the new step(s) into existing prompts as multi-section structured outputs:
- Phase 1: extend `generateSessionInsights` to also produce `narrative` + `topicsCovered` + `reEntryRecommendation` (drops count to 3).
- Phase 2: produce `parentReport` as an additional section of the same prompt when `familyLinks` exists (keeps count at 3 even with Phase 2 live).

Both are implementation-time optimizations, not design constraints.

## Components

### 1. `session-completed` Inngest function — extended

Add one new step in Phase 1, one more in Phase 2.

**Phase 1 — new step `generate-llm-summary`:**

1. New prompt builder `buildSessionSummaryPrompt(transcript, profile)` produces the structured `llmSummary`. The system prompt MUST frame the task as "write a note to your future self about this session" — narrative is self-contained, names topic anchors, and reads sensibly without the transcript.
2. Validate response against `expectedResponseSchema` (the `llmSummarySchema` exported from `@eduagent/schemas`, named per harness convention). On parse failure, send a single self-correction prompt to the same model with the validation error inlined. On second failure, throw — Inngest auto-retry handles the rest. Multi-model fallback within attempt via the existing LLM router.
3. Write `sessionSummaries.llmSummary` and set `summaryGeneratedAt = now()` in a single update. `summaryGeneratedAt` is the 30-day clock anchor.
4. Emit Inngest events with IDs only — never full text. `session.summary.generated` (sessionId, profileId, model, tokenCounts), `session.summary.failed` (sessionId, profileId, reason). The `narrative` text MUST NOT appear in event payloads to avoid persisting outside the FK-cascaded row.

Step ordering: place after `generate-learner-recap`. `analyze-learner-profile` (mentor memory) runs as today, independently. None of the existing steps are modified.

**Phase 2 — additional step `generate-parent-report` (gated, conditional):**

1. Gate: feature flag `RETENTION_PHASE_2_PARENT_REPORT` (off by default in Phase 1). If off, skip entirely — no DB read, no LLM call, `parentReport` stays null.
2. If on: read `familyLinks` for this learner. If 0 rows, skip (`parentReport` stays null). Solo learners never trigger this LLM call.
3. If ≥1 row, generate `parentReport` via `buildParentReportPrompt(llmSummary, profile, familyLinks[0])`. Reads from the already-written `llmSummary` JSONB, NOT the transcript — so this step works identically before and after the Tier 2 → Tier 3 boundary. Important: this property is what makes Phase 2 liftable into a parent-dashboard spec without touching retention. The parent-report generator can be moved to any future Inngest function or on-demand endpoint and still work.
4. Write `sessionSummaries.parentReport` only — `summaryGeneratedAt` is unaffected. The 30-day clock is anchored on Phase 1's summary, not on Phase 2's report.
5. On failure, emit `session.parent_report.failed` event; do NOT block the session-completed pipeline. The summary precondition for purge is `llmSummary IS NOT NULL` only.

Step ordering: place after `generate-llm-summary`, since it consumes its output.

### 2. `summary-reconciliation-cron` Inngest function — new

```
schedule: '0 4 * * *'  // 04:00 UTC daily
```

Two distinct queries handle two distinct failure modes:

**Query A — `sessionSummaries` row missing entirely (event delivery failed at first step):**

```sql
SELECT ls.id, ls.profile_id
FROM learning_sessions ls
LEFT JOIN session_summaries ss ON ss.session_id = ls.id
WHERE ls.status IN ('completed', 'auto_closed')
  AND ls.ended_at < now() - interval '6 hours'
  AND ss.id IS NULL
LIMIT 50;
```

For each: re-fire the `app/session.completed` Inngest event so the FULL pipeline re-runs. Do NOT cherry-pick the summary step alone — many other steps (retention, vocabulary, embeddings, streak/XP, mentor memory) also did not run.

**Query B — `sessionSummaries` row exists but summary step failed:**

```sql
SELECT ss.session_id, ss.profile_id
FROM session_summaries ss
JOIN learning_sessions ls ON ls.id = ss.session_id
WHERE ls.status IN ('completed', 'auto_closed')
  AND ls.ended_at < now() - interval '6 hours'
  AND ss.summary_generated_at IS NULL
LIMIT 50;
```

For each: re-trigger only the `generate-llm-summary` step in isolation (the rest of the pipeline already ran successfully). If Phase 2 is enabled and the learner has `familyLinks`, also re-trigger `generate-parent-report`. (When Phase 2 is off — Phase 1 launch state — only the summary step is re-run.)

Both queries respect a hard batch limit of 50 per run; surface counts via `summary.reconciliation.scanned` and `summary.reconciliation.requeued` metrics.

### 3. `transcript-purge-cron` Inngest function — new

```
schedule: '0 5 * * *'  // 05:00 UTC daily, after reconciliation
```

Query: `sessionSummaries` where `summaryGeneratedAt < now() - interval '30 days'` AND `purgedAt IS NULL` AND `llmSummary IS NOT NULL`.

Per-session execution order — **Voyage call is OUTSIDE the database transaction.** Holding a tx open across an external HTTP call exhausts the neon-serverless connection pool:

```
1. Read llmSummary.narrative for this session
2. Call Voyage embed API → newVector              // OUTSIDE tx
3. BEGIN tx
4.   UPDATE session_embeddings SET embedding = $newVector, content = $narrative
        WHERE session_id = $1 AND profile_id = $2;
5.   DELETE FROM session_events WHERE session_id = $1 AND profile_id = $2;
6.   UPDATE session_summaries SET purged_at = now()
        WHERE id = $sessionSummaryId AND profile_id = $2;
7. COMMIT
8. Emit session.transcript.purged event (IDs + counts only, no text)
```

`profile_id` clause on every write is defense-in-depth per CLAUDE.md non-negotiable rule (`Writes must include explicit profileId protection`). `sessionId` is already unique, so this is redundant correctness, not load-bearing — but the rule is non-negotiable and free to satisfy here.

If Voyage fails (step 2): tx never opens, events stay, retried next run. If tx fails (steps 3-7): atomic abort, retried next run.

Sessions parked >37 days awaiting purge (i.e., 7 days past their nominal purge date due to repeated failures) emit `session.purge.delayed` for ops attention.

### 4. `GET /sessions/:sessionId/transcript` — extended

Current behavior at `apps/api/src/routes/sessions.ts:225-235` returns `SessionTranscriptExchange[]`. New behavior:

```ts
// Pseudo
if (sessionSummary.purgedAt) {
  return { archived: true, archivedAt: sessionSummary.purgedAt, summary: { ... } };
}
return { archived: false, exchanges: [...] };
```

Response schema added to `@eduagent/schemas`.

### 5. `apps/mobile/src/app/session-transcript/[sessionId].tsx` — extended

Detect the `archived: true` shape and render an "archived" state:

> This conversation was archived on March 12, 2026.
>
> Here's what you covered:
> [renders existing `learnerRecap` + `topicsCovered` chips + `reEntryRecommendation`]
>
> [CTA: Continue this topic]

Reuse existing summary card components from `session-summary/[sessionId].tsx`.

## Failure Modes

| State | Trigger | User sees | Recovery | Verified by |
|---|---|---|---|---|
| Summary generation fails on first attempt | LLM API error / timeout | Nothing | Inngest auto-retry. Multi-model fallback within attempt | unit test: forced first-model failure → second-model success |
| Summary returns invalid Zod shape > 1 self-correction | LLM returns malformed JSON twice | Nothing | Reconciliation Query B re-triggers; metric `session.summary.failed` increments; alert if 24h rate > 0.5% | integration test: mock LLM to return bad JSON, verify reconciliation catches it next run |
| `app/session.completed` event never delivered | Inngest infra outage / DB unreachable at first step | Nothing immediately; entire post-session pipeline missing | Reconciliation Query A re-fires the event → full pipeline runs | integration test: simulate event drop, verify Query A picks up the gap and re-fires |
| Reconciliation cron disabled / broken | Operator error / cron config drift | Backlog grows; transcripts NOT purged at day 30 | Alert: "sessions awaiting summary > 7 days" count rises | metric monitor with alert threshold |
| Purge cron tries to delete events for session without summary | Should be impossible — precondition guards | N/A | Precondition is a hard SQL filter; defensive `assert summary IS NOT NULL` in code | break test: attempt purge with summary=null, expect abort + alert |
| Voyage API down at purge time | Voyage outage | Nothing | Step 2 fails before tx opens; events stay; retried next day | integration test: mock Voyage 500, verify events still present after purge run + no partial state |
| Past-30-day transcript view opened | User scrolls history > 30 days back | Friendly archived card with summary, learnerRecap, topicsCovered, "Continue this topic" CTA | N/A — designed UX | mobile test: archived response → archived card renders |
| Memory card tap when `sourceEventId` is null OR points to purged event | Today F8 always sets null; post-F8 + post-purge can dangle | Falls back to session-summary card; if `sourceSessionId` also missing, shows origin + observedAt only | N/A — designed UX | mobile test (a): synthetic memory entry with null `sourceEventId`, valid `sourceSessionId` → renders summary card. (b) [DEFERRED to F8 spec]: real F8 dangling `sourceEventId` after F8 ships |
| Re-embed produces vector that no longer hits relevant queries | Compression from transcript to narrative loses key term | Long-tail recall degrades for that session | Mitigation: `narrative` schema requires topic-name inclusion. Automated regression test asserts top-N pgvector overlap between transcript-derived and narrative-derived embeddings ≥ threshold for fixture queries; deploy-blocking | regression test: see Acceptance Criteria below |
| Account deletion during Tier 2 or Tier 3 | User deletes account | All cascade-deletes work; new columns deleted with row | N/A | extended account-deletion integration test: assert `sessionSummaries`, `sessionEmbeddings`, `sessionEvents` rows are gone post-cascade; explicitly assert no rows remain with the deleted profile's ID |
| Inngest event payload leak | Event carrying `narrative` text persists in Inngest event log past row deletion | Data exists outside row | Audit: events emit IDs + scalars only, no text fields | break test: capture Inngest events in test harness, assert no field contains `>120 chars` of narrative-style text |
| Sentry breadcrumb leak | Exception captured during summary generation includes summary text in context | Data exists in Sentry past row deletion | Audit: Sentry `extra` fields strip `narrative`, `learnerRecap` | unit test: throw inside summary generation, assert `Sentry.captureException` call's `extra` arg has no narrative-shaped fields |
| Short auto-closed session (1-3 exchanges) | `summaryStatus === 'auto_closed'` with thin transcript | Brief but valid summary | `narrative.min(40)` permits short prose; LLM does not need to pad | unit test: 2-exchange transcript produces valid summary |
| (Phase 2) Profile has no `familyLinks` row but `parentReport` is somehow populated | Bug | Parent dashboard would show report despite no link | Step 2 of `generate-parent-report` returns early when no `familyLinks` row exists. Validate at write site. | unit test: profile with no familyLinks, run step with Phase 2 on, verify parentReport stays null |
| (Phase 2) Parent linked AFTER summary generation | New `familyLinks` row added 60 days post-session | Parent sees no report for sessions summarized before link was added | Acceptable. `parentReport` is generated at session-completed; we don't backfill | N/A — by-design |
| (Phase 2) `generate-parent-report` fails | LLM error | No parent report for this session; Phase 1 retention unaffected | Step is non-blocking — emit `session.parent_report.failed`, retention pipeline continues. Reconciliation Query B re-triggers if Phase 2 is on | integration test: mock parent-report LLM failure, verify summary still writes and purge precondition is satisfied |

## Rollback

Migrations involved:

1. **Adding columns** (`llmSummary`, `summaryGeneratedAt`, `purgedAt`) — fully reversible. Drop columns to revert.
2. **New cron jobs** — disable by removing function registration in Inngest. Reversible.
3. **Code path changes in `session-completed`** — revert via `git revert`.
4. **`sessionEvents` rows deleted by purge** — **NOT REVERSIBLE.** Once a session's events are purged, the raw transcript is permanently destroyed. The `llmSummary.narrative` and re-embedded vector are the only remaining representations.

**Rollback procedure:**
- If a problem is discovered before any purge has run: full revert is clean (drop new columns, revert code, no data lost).
- If a problem is discovered after some purges have run: the structural changes can revert, but **purged transcripts are permanently destroyed and cannot be reconstructed**. The `llmSummary` JSONB persists as the only record.
- For high-risk launch posture: **gate the purge cron behind a feature flag for the first 30+ days** so the summary write + reconciliation pipeline can run in production with no destructive action. Enable the purge step only after metrics show success rate is solid AND the embedding-overlap regression test passes for production-shaped data.

This must be stated explicitly in the implementation plan: **for rows where `purgedAt IS NOT NULL`, rollback is impossible — data is permanently destroyed.**

## SLO / Alert Thresholds

| Metric | SLO | Warn alert | Page alert |
|---|---|---|---|
| `session.summary.generated` success rate | ≥99% rolling 7d | >0.5% failure rolling 24h | >3% failure rolling 24h |
| Sessions with `status=completed` AND no `sessionSummaries` row > 6h old | 0 | 1 row | 10 rows |
| Sessions parked >7 days awaiting summary | 0 | 1 row | 10 rows |
| `session.transcript.purged` job failure rate | ≥99% rolling 7d | >2% failure rolling 24h | >5% failure rolling 24h |
| Embedding-overlap regression test | top-3 overlap ≥0.6 across all fixture queries | <0.7 on any single query | <0.6 on any single query (deploy-blocking) |

The alert and SLO bands are deliberately separated to give hysteresis — paging only fires when the SLO is meaningfully breached, not at the SLO line itself.

## Acceptance Criteria

- [ ] New `llmSummary` JSONB column populated for every session that completes after deploy. 7-day rolling success rate ≥99%.
- [ ] `narrative` is self-contained — eval-llm fixture asserts narrative reads sensibly with the transcript hidden, naming topic anchors by name.
- [ ] No changes to `generate-session-insights`, `generate-learner-recap`, or `analyze-learner-profile` step outputs (verified by snapshot tests on those steps' existing fixtures).
- [ ] Reconciliation cron Query A re-fires `app/session.completed` for sessions missing a `sessionSummaries` row > 6h post-completion. Integration test verifies full pipeline runs after re-fire.
- [ ] Reconciliation cron Query B re-runs the summary step in isolation for sessions with row but no `summaryGeneratedAt` > 6h post-completion.
- [ ] Purge cron runs daily; only purges sessions where `llmSummary IS NOT NULL`. Voyage call happens BEFORE the database transaction; tx contains only UPDATE + DELETE + UPDATE.
- [ ] Purge writes include redundant `AND profile_id = $2` clause for defense-in-depth.
- [ ] `GET /transcript` returns `{archived: true, summary: ...}` shape for purged sessions; mobile screen renders the archived card.
- [ ] Mobile component handles `sourceEventId == null` and synthetic-dangling `sourceEventId` identically — both fall back to session-summary card. (Real F8 dangling tap-through is deferred to F8 spec.)
- [ ] Eval-llm harness has a `session-summary` flow with snapshots across all 5 fixture profiles (Tier 1) and a Tier 2 `--live` mode that validates against `expectedResponseSchema`.
- [ ] **Embedding-overlap regression test:** for ≥3 fixture sessions and ≥5 anchor queries each, top-3 pgvector results from the narrative-derived embedding overlap with top-3 from the transcript-derived embedding by ≥0.6 (Jaccard or rank-aware metric, decided in implementation plan). Deploy-blocking on test failure.
- [ ] No transcript is ever purged for a session whose `llmSummary` is null or schema-invalid (break test: insert a null-summary row past 30 days, run purge, verify events still present).
- [ ] **Inngest event payload audit:** test harness captures all events emitted during a sample session-completed run, asserts no event payload field contains free text >120 chars (i.e., no `narrative` text inline).
- [ ] **Sentry context audit:** simulate exception inside summary step, assert `Sentry.captureException` `extra` arg contains no narrative-shaped fields.
- [ ] **Account-deletion cascade explicit assertions:** integration test verifies post-cascade row counts are zero for `sessionSummaries`, `sessionEmbeddings`, `sessionEvents` for the deleted account. Test must explicitly query `WHERE profile_id = $deletedProfileId` against each table and assert zero rows.
- [ ] SLO + alert thresholds wired per the SLO/Alert table above.

### Phase 2 acceptance criteria (only when Phase 2 ships in this spec)

These do NOT block Phase 1 launch. If Phase 2 is lifted into a parent-dashboard spec, these move with it.

- [ ] `parentReport` populated for every session whose learner has at least one `familyLinks` row, ≥99% of the time, when feature flag is on.
- [ ] No `parentReport` is generated for a learner without a `familyLinks` row (break test).
- [ ] `generate-parent-report` failure does NOT prevent `summaryGeneratedAt` being set or the session being purged at day 30 (integration test).
- [ ] Reconciliation Query B re-triggers `generate-parent-report` for family-linked learners with null `parentReport` and non-null `summaryGeneratedAt`.

## Out of Scope (tracked as follow-ups)

- **Memory architecture upgrade** — moving `learning_profiles` JSONB arrays to a relational `memory_facts` table with embedding-based retrieval and write-time dedup. Separate spec. When it ships, the `sessionEmbeddings` re-embed step in component 3 may be removed because fact-grain retrieval covers the long-tail use case independently.
- F8 sourceRef population at write sites in `learner-profile.ts`. This design is forward-compatible.
- F8 `suppressedSourceEventIds` column and "forget and never re-infer" DELETE flow.
- F1.1 INTERVIEW_COMPLETE marker → envelope migration (Bucket A).
- Backfill of `llmSummary` for historical sessions completed before deploy.
- Privacy notice / Terms of Service update reflecting "30-day transcript retention." Product/legal task.
- **LLM-call optimization:** folding `generate-llm-summary` into one of the existing steps' prompts as multi-section structured output (would keep the count at 3 instead of 4). Implementation-time exploration.
- **Lifting Phase 2 (parent report) into a parent-dashboard spec.** Decision deferred. If chosen, `parentReport` column + `generate-parent-report` step move there; this spec's Phase 1 is unaffected. If retention spec wins, flip the feature flag and ship Phase 2 here.
- Audit of `aiFeedback` column consumers (separate cleanup; not blocking retention).

## Open Questions for Implementation Plan

1. Decide concrete batch sizes for reconciliation cron Query A, Query B, and purge cron based on expected daily volume.
2. Decide LLM router preference order specifically for summary generation (the narrative-quality bar is high since it's the only post-purge record).
3. Decide alert routing: where do `session.summary.failed`, `session.purge.delayed`, and embedding-overlap regression failures surface? (Doppler-injected webhook, Sentry, dedicated dashboard.)
4. Decide feature flag rollout plan: summary writes first (no destructive action), then purge cron after success rate is proven AND embedding-overlap regression test passes for production-shaped data.
5. Pick a concrete embedding-overlap metric (Jaccard top-3 vs rank-aware overlap vs per-query cosine) and a fixture-query construction protocol.
6. Cleanup-while-here: stale comment in `session-completed.ts:1070-1073` claims neon-http transactions are non-atomic; production migrated to neon-serverless per `packages/database/src/client.ts:55-72`. Update or remove.
7. Phase 2 routing decision: ship parent report under retention (flip flag), or lift into a parent-dashboard spec? Decision can be deferred until Phase 1 ships.
