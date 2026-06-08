# Memory Task — Review Continuity, Retrieval Log & Unified Relearn Queue

**Status:** Draft · 2026-06-08 · **Branch:** `conceptgrain`
**Parent vision:** [The Forever Notebook](./2026-06-08-forever-notebook-north-star.md) (this is a **topic-grain sibling** of [concept-capture slice 1](./2026-06-08-concept-capture-layer-design.md))
**Grain decision inherited:** [MMT-ADR-0017](../adr/MMT-ADR-0017-concept-capture-additive-layer.md) — topic-grained spine stays topic-keyed; this slice is **additive** and reuses `retention_cards.topicId`. No new ADR required (every item below is additive and reversible; see Open Items).
**Findings source:** [Review & Re-learn findings](./2026-06-03-review-relearn-findings-and-high-impact-todos.md) — this spec commits RR-1, RR-9, RR-10 and the RR-5 ordering rule; RR-13 is partially served by the opener.
**Ratified strategy:** `project_review_is_mentoring_backbone.md` — review must *feel* like one mentoring relationship (continuity + memory), built FEEL → CORRECT → LOAD-BEARING.

---

## Context

Review and re-learn are live and load-bearing, but three gaps keep review from feeling like a mentor who remembers you, and keep the system from learning from its own grading. Every fact below was read from code on 2026-06-08 (not from prior docs).

**Gap 1 — review opens cold, not as a continuation.** A "Review this topic" tap hard-routes a fresh `mode:'review'` session (`apps/mobile/src/app/(app)/topic/[topicId].tsx:446-458`) whose first-turn prompt block (`apps/api/src/services/exchange-prompts.ts:798-813`) opens with a generic calibration question keyed only off the topic title. The continuity material the opener wants *already exists* but is not assembled for it:
- `session_summaries.learnerRecap` — 2-4 second-person takeaway bullets per completed session (`packages/database/src/schema/sessions.ts:259`, written by `apps/api/src/inngest/functions/session-completed.ts` step "generate-learner-recap"). Durable, but injected into a prompt **only on resume of the same session** via `buildResumeContext` (`session-context-builders.ts:504-511`) — never on a fresh review session.
- `memory_facts` — per-profile strengths/struggles/interests, already injected every exchange as `learnerMemoryContext` (`memory-facts.ts`; read at `session-exchange.ts:2208-2236`; consent-gated).
- `session_embeddings` + `findSimilarTopics()` — cosine retrieval injected every exchange as `embeddingMemoryContext` with a prompt instruction to "reference prior learning naturally" (`packages/database/src/queries/embeddings.ts:49-82`; `services/memory.ts:133-138`). This is a generic, **message-triggered** callback — not a deliberate first-turn recap.
- `learnerQuote` — the learner's own verified words during a Challenge Round (`challenge-round/evaluation.ts:82-126`). Reconstructable from `session_events` by `answerEventId` until the day-37 transcript purge, but **has no durable column** and is surfaced by no cross-session read.

**Gap 2 — recall grading is thin and discards its own reasoning.** `evaluateRecallQuality(answer, topicTitle)` (`apps/api/src/services/retention-data.ts:148-181`) gives a rung-1 LLM only the topic title + one answer, returns a bare 0-5, and on any LLM failure **falls back to grading by character count** (`return answer.length > 100 ? 4 : answer.length > 20 ? 3 : 2`, `:171-179`). Downstream, only the SM-2 effects land on `retention_cards`; the raw 0-5 lands in `practice_activity_events.score` (`retention-data.ts:960-983`). **The prompt, the answer text, the grader's rationale, the misconception, and the chosen next action are persisted nowhere.** No `retrieval_events` / `recall_events` table exists anywhere in the schema or migrations. The eval harness (`apps/api/eval-llm/`, `pnpm eval:llm`) therefore has no real graded-recall corpus to calibrate against, and a mentor that "knows what you said last time" is impossible to build.

**Gap 3 — a learner's weak spots are split across two lists that never meet.** The overdue/relearn queue (`services/overdue-topics.ts:28-84`, surfaced by `topic/relearn.tsx` via `useOverdueTopics`) is built **only** from `retention_cards.nextReviewAt < now`. The concept-weakness list `needs_deepening_topics` (`packages/database/src/schema/assessments.ts:163-207`) is never read there. `needs_deepening_topics` has **two** writers: the Challenge Round (`source='challenge_round'`, `status='pending_review'`; flag-gated behind `CHALLENGE_ROUND_RUNTIME_ENABLED`, default off, `config.ts:140`) and `startRelearn` (`retention-data.ts:1104`, `source='system_signal'`, `status='active'`, always on). The promotion helper that should reconcile signals takes a `_signal` param it ignores and promotes every pending row regardless (`needs-deepening/promotion.ts:23-75`).

---

## Scope

### Committed tier — "DO IT" (this spec's build)

1. **Continuity-framed review opener** (RR-1 / partial RR-13) — assemble durable continuity material and feed the review first-turn prompt so review opens as a remembered continuation ("Last week you worked out X from your notes — has it stuck?"), not "now we switch to review mode". Prompt + context-assembly change behind a flag.
2. **`retrieval_events` structured recall log** (RR-9) — a new additive, topic-grain table capturing every recall grade: prompt, answer, rubric verdict + rationale, misconception, next action, evidence the grader saw, and whether the score came from the LLM or the char-count fallback. Feeds the eval harness and the opener.
3. **Unified relearn queue** (RR-10 + RR-5 ordering) — the overdue queue becomes `overdue ∪ active/pending_review needs_deepening`, deduped by `topicId`, system-ranked by SM-2 urgency band, each row tagged with why it surfaced. Includes fixing the ignored `_signal` in promotion so the merge is honest.

### Probably-worth-it tier — specced here as the next slices (decided, not built in tier 1)

4. **Unified source + `evidence_links` over existing content** — a thin abstraction over the learner content that already exists (`topic_notes`, `bookmarks`, OCR homework text, `session_events` transcripts) so a recall/opener can cite "you learned this from your own note on X". Plus folding in the **already-specced-but-unbuilt** bookmark results in Library search ([chat-notes-bookmarks Step 5](./2026-05-12-chat-notes-bookmarks.md)).
5. **Memory-task type catalog (ship the 2-3 that exist)** — introduce a `taskType` enum mapping `recall` (the recall-test screen) and `teach_back` (existing `verificationType`) to current mechanisms, and add **`explain`** as the one lightweight new format. Defer `compare / apply / synthesis / use_it`.

### Out of scope (deferred to other slices / specs)

- **Concept-grain anything.** This slice is topic-grain by `retention_cards.topicId`. `retrieval_events` gains a nullable `conceptId` only when Concept lands (see §"Forward seam").
- **The deferred concept-capture slice-4 trajectory log** (`concept_evaluations`, append-only per-*concept* verdict). `retrieval_events` logs *recall attempts* at *topic* grain; it is a different table for a different event and must not be conflated (see §"Relationship to concept-capture").
- Re-teach-in-place on 3rd failure (RR-4), push-cron consolidation (RR-3), Challenge Round enablement/calibration (RR-2/RR-6/RR-7/RR-8), the mastery-axis reconciliation (RR-11), and flipping `CHALLENGE_ROUND_RUNTIME_ENABLED` in production (RR-12). Tracked in the findings doc; not touched here.
- No change to SM-2 scheduling semantics (`nextReviewAt`, decay, bands). The opener and the log are read-/capture-only with respect to the clock.

---

## Requirements → traceability

| # | Requirement | Findings anchor | Tier |
|---|---|---|---|
| R1 | Review first-turn prompt is assembled from durable continuity material, not topic title alone | RR-1, RR-13 | 1 |
| R2 | Every recall grade writes a `retrieval_events` row (prompt, answer, verdict, rationale, misconception, next action, evidence, grader source) | RR-9 | 1 |
| R3 | The char-count fallback is recorded as such (`gradedBy='fallback_heuristic'`) so the eval harness can exclude it | RR-9 | 1 |
| R4 | Relearn/overdue queue = `overdue ∪ active/pending_review needs_deepening`, deduped by `topicId`, ranked by SM-2 band, reason-tagged | RR-10, RR-5 | 1 |
| R5 | `promotePendingDeepening` honors its `signal` argument | RR-10 | 1 |
| R6 | A `source`/`evidence_links` abstraction lets a recall cite the learner's own prior content; bookmarks searchable in Library | chat-notes-bookmarks Step 5 | 2 |
| R7 | A `taskType` catalog ships `recall` + `teach_back` (existing) + `explain` (new) | — | 2 |

---

## Data Model

### `retrieval_events` — append-only recall-attempt log (tier 1, R2/R3)

Per-profile, topic-namespaced, **append-only** (never updated; a re-attempt is a new row). Modeled on the existing `practice_activity_events` write precedent and the `needs_deepening_topics` scoping shape.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | `generateUUIDv7()` |
| `profileId` | uuid not null | FK `profiles.id` on delete cascade |
| `subjectId` | uuid not null | FK `subjects.id` on delete cascade — denormalized for scoped reads (mirrors `needs_deepening_topics`/`concepts`) |
| `topicId` | uuid not null | FK `curriculum_topics.id` on delete cascade — topic grain, reuses the spine key |
| `sessionId` | uuid null | FK `learning_sessions.id` on delete **set null** — survives session deletion |
| `answerEventId` | uuid null | raw id of the graded `session_events` row; **no FK** (so it survives the day-37 event purge, mirroring `bookmarks.eventId`) |
| `promptText` | text not null | the recall question / topic framing shown to the grader |
| `learnerAnswer` | text not null | the answer text that was graded |
| `quality` | smallint not null | SM-2 grade 0-5 |
| `verdict` | `retrieval_verdict` enum not null | `'solid' \| 'partial' \| 'missing' \| 'misconception'` — coarse rubric result, derived from `quality` for fallback rows (see capture flow) |
| `rubricRationale` | text null | grader's one-line reasoning (net-new output of the deepened grader; null on fallback) |
| `misconception` | text null | the weakness the grader identified, if any |
| `nextAction` | `retrieval_next_action` enum not null | `'advance' \| 'reschedule_soon' \| 'relearn' \| 'redirect_to_library'` — the SM-2 decision actually taken |
| `evidenceUsed` | jsonb not null default `'[]'` | array of `{ kind, ref }` describing the sources the grader saw (kinds mirror `ExchangeSourceEvidenceKind`, `exchanges.ts:189-224`) — empty today, populated as the grader context deepens |
| `gradedBy` | `retrieval_grader` enum not null | `'llm' \| 'fallback_heuristic'` — fallback rows are the char-count path (`retention-data.ts:171-179`); R3 |
| `llmRoutingRung` | smallint null | rung used (null on fallback) |
| `createdAt` | timestamptz not null | `defaultNow()` |

New enums: `retrieval_verdict` `('solid','partial','missing','misconception')`; `retrieval_next_action` `('advance','reschedule_soon','relearn','redirect_to_library')`; `retrieval_grader` `('llm','fallback_heuristic')`.

Constraints / indexes:
- `index('retrieval_events_profile_topic_idx')` on `(profileId, topicId)` — per-topic history for the opener.
- `index('retrieval_events_profile_created_idx')` on `(profileId, createdAt)` — time-ordered reads for the eval harness corpus.
- `index('retrieval_events_profile_id_idx')` on `(profileId)` — standalone FK index (house pattern, BUG-393/migration 0086).

**Why append-only and separate from `retention_cards`.** `retention_cards` holds *current* SM-2 state (one row per topic, rewritten each grade); `retrieval_events` holds the *history of attempts* (many rows per topic). This mirrors the `assessments`/`retention_cards` and the concept-capture `concepts`/`concept_mastery` identity-vs-state split, and is the data the eval harness and the opener both need.

### No new table for tiers 1's other two items

- **R1 (opener)** reads existing tables only — no schema change.
- **R4/R5 (union)** read existing tables only — no schema change.

---

## Flow 1 — Continuity-framed review opener (R1)

**Trigger.** Unchanged entry: the "Review this topic" CTA (`topic/[topicId].tsx:446-458`) still starts a session for an overdue, completed topic. The change is server-side opener assembly, behind a new flag `REVIEW_CONTINUITY_OPENER_ENABLED` (config object per eslint G4; default off until eval-validated).

**Assembly (server, at first learner-visible review turn).** Replace the generic calibration block (`exchange-prompts.ts:798-813`) with a `buildReviewContinuityOpener(context)` that injects, when present:
1. **Most-recent `learnerRecap` for this topic** — reuse the existing read already used for the relearn UI (`retention-data.ts:1139-1155`), which returns the most-recent non-null `learnerRecap` for a topic. This is the durable "what you said last time" anchor.
2. **Most-recent `retrieval_events` row for `(profileId, topicId)`** — its `learnerAnswer` (the learner's own prior words) + `verdict` + `misconception`. Available once the log (Flow 2) is capturing. Until then this is null and the opener degrades to recap-only.
3. **`memory_facts` and `embeddingMemoryContext`** — already injected on every exchange; the opener references them but adds nothing new here.

The block instructs the tutor to open by **naming the specific prior understanding and asking whether it held**, warmly and low-stakes (never "test", never "you failed"; obeys `feedback_positive_framing_no_struggle`). It removes the "now switch to review mode" framing.

**Honest degradation.** If neither recap nor a prior retrieval event exists (first-ever review of a topic), the opener falls back to today's calibration question — never fabricates a memory it doesn't have (invariant 6: confident-but-wrong is the one fatal failure).

**Eval-gated.** This is an LLM-prompt change: `pnpm eval:llm` (Tier 1 snapshot) before commit, `pnpm eval:llm --live` (Tier 2 schema validation) to confirm the opener still produces a valid envelope. A/B against the current opener via the flag (RR-1's "feature-flag and A/B").

---

## Flow 2 — `retrieval_events` capture (R2/R3)

**Where.** At the two existing grade sites, immediately after `evaluateRecallQuality` returns and the SM-2 decision is computed:
- `processRecallTest` (`retention-data.ts:888-927`)
- `handleReviewCalibrationGrade` (`inngest/functions/review-calibration-grade.ts:96-129`)

**Write (additive, non-blocking).** One `retrieval_events` insert per grade, wrapped in the existing `safeWrite(...)` guard (same pattern that already wraps `recordPracticeActivityEvent`, `retention-data.ts:960`). A capture failure is logged to Sentry but never breaks grading or SM-2 progression.

Field population:
- `promptText`, `learnerAnswer`, `answerEventId`, `sessionId`, `topicId`, `subjectId`, `profileId` — from the grade call site.
- `quality` — the returned 0-5.
- `gradedBy` — `'llm'` on the normal path; **`'fallback_heuristic'`** when the char-count fallback fired (`retention-data.ts:171-179`). This requires `evaluateRecallQuality` to return a small result object `{ quality, gradedBy, rationale?, verdict?, misconception?, rung? }` instead of a bare number — a mechanical signature change; all callers updated in the same change-set.
- `verdict`, `rubricRationale`, `misconception`, `llmRoutingRung` — populated from the deepened grader output (see below). On a fallback row, `rubricRationale`/`misconception`/`rung` are null and `verdict` is derived from `quality` (`>=4 → solid`, `3 → partial`, `else → missing`).
- `nextAction` — the SM-2 decision actually taken (`advance` on success; `reschedule_soon` when `nextReviewAt` shortens; `relearn`/`redirect_to_library` on the 3-failure path, `retention.ts:138-139`).
- `evidenceUsed` — `'[]'` until the grader context is deepened, then the list of sources passed.

**Deepen the grader (the RR-9 half).** `evaluateRecallQuality` is extended to (a) ask for a short rationale + a coarse verdict + any misconception in its structured output, and (b) accept richer context (curriculum topic description + the most-recent prior `learnerAnswer` from `retrieval_events`) instead of topic-title-only. The **fallback is changed from a fabricated char-count score to an explicit uncertain outcome**: on LLM failure, return `gradedBy='fallback_heuristic'` with a conservative `quality` and `nextAction='reschedule_soon'` (re-ask soon) — never a fabricated high score that advances the clock. This is itself eval-gated.

**Eval-harness wiring.** The harness gains a reader over `retrieval_events` filtered to `gradedBy='llm'` to build a real graded-recall corpus (`apps/api/eval-llm/`). No per-PR CI gate (consistent with `project_eval_llm_signal_metrics`); seeding is a launch-checklist item.

---

## Flow 3 — Unified relearn queue (R4/R5)

**Read change.** Extend `getOverdueTopicsGrouped(db, profileId)` (`services/overdue-topics.ts`) — or add a sibling `getRelearnQueue` it delegates to — to merge two sources via the sanctioned parent-chain join (enforcing `subjects.profileId = profileId`, per CLAUDE.md and the existing pattern in this same file):
1. **Overdue** — `retention_cards.nextReviewAt < now` (today's query).
2. **Flagged-weak** — `needs_deepening_topics` rows with `status IN ('active','pending_review')`.

**Merge + dedup by `topicId`.** A topic present in both collapses to one entry. Each entry carries a `reason` tag: `'overdue'`, `'flagged_weak'`, or `'both'`, plus the `concept`/`misconception`/`correction` from `needs_deepening_topics` when present (lets the relearn screen focus the session, aligning with concept-capture's "concept-targeted review").

**Ranking (RR-5).** Default order by SM-2 urgency band (`retention.ts:187-203`: `forgotten > weak > fading > strong`) then most-overdue; `flagged_weak`-only rows (no overdue card) sort by `needs_deepening` recency. The mobile relearn screen (`relearn.tsx:82`) **stops asking the learner to "pick the shakiest topic"** and presents the ranked list, keeping manual pick as an override (`feedback_human_override_everywhere`).

**Honest yield note (must ship in the spec, not hidden).** In production today `needs_deepening_topics` rows come almost entirely from `startRelearn` (`source='system_signal'`), which writes a row for a topic the learner is *already* relearning — so it usually dedups against an overdue card. The genuinely net-new rows (a flagged-weak topic whose card is no longer overdue, and the `source='challenge_round'` rows) stay small **until `CHALLENGE_ROUND_RUNTIME_ENABLED` is flipped (RR-12)**. The union is still correct, cheap, and forward-ready — it is wiring that pays off the moment the Challenge path lights up — but tier-1 yield is modest and we say so.

**Fix the promotion signal (R5).** `promotePendingDeepening(db, profileId, topicId, signal)` (`needs-deepening/promotion.ts:23-75`) currently ignores `_signal`. Rename to `signal` and gate promotion on it so a `pending_review` row promotes to `active` only for the signal that should promote it (`answer_struggle | retention_again | struggle_status`), instead of blanket-promoting. This makes the `flagged_weak` half of the union mean what it says. Break test required (red-green): a `pending_review` row not matching the firing signal must **not** promote.

---

## Read side

- **Relearn screen** (`relearn.tsx`) renders the ranked, reason-tagged union; manual pick preserved.
- **Review opener** reads `learnerRecap` + latest `retrieval_events` row as in Flow 1.
- **Eval harness** reads `retrieval_events` (`gradedBy='llm'`) as a corpus.
- No new mobile screen; no change to SM-2 read surfaces (`progress.ts` three-state bars untouched).

---

## Tier 2 — next slices (decided, not built in tier 1)

### Slice 2a — Unified source + `evidence_links` (R6)

All four learner-content types already exist; none is unified and none is citable:
- `topic_notes.content` (`notes.ts:8`), `bookmarks.content` (`bookmarks.ts:13`), `session_events.content` transcripts (`sessions.ts:181`), and OCR homework text — which lives **inside `learning_sessions.metadata->homework->ocrText`** (`session-homework.ts:169-183`), not a column.

**Decision.** Do **not** migrate the content into a new table. Introduce a read-time `LearnerSource` view-model union (`kind ∈ {note, bookmark, transcript_excerpt, homework_ocr}` + `{id, profileId, topicId?, subjectId, sessionId?, excerpt, createdAt}`) assembled in a `services/learner-source.ts`, and a thin **`evidence_links`** table (`id, profileId, fromKind, fromId, toKind, toId, createdAt`) recording "this recall/opener cited that note". The OCR-text wrinkle (it is buried in jsonb) is handled in the source assembler by reading the metadata path; making it first-class is deferred. Library-search bookmark results are **not re-specced** — they are [chat-notes-bookmarks Step 5](./2026-05-12-chat-notes-bookmarks.md), already designed, never built; this slice simply executes that step (`library-search.ts` + `packages/schemas/src/library-search.ts`).

### Slice 2b — Memory-task type catalog (R7)

Today: `verificationType ∈ {standard, evaluate, teach_back}` (`packages/schemas/src/assessments.ts:120`), the standalone recall-test screen (no enum), and no `taskType` catalog; **`explain` has no code representation.**

**Decision.** Add `taskTypeSchema = z.enum(['recall','teach_back','explain'])` in `@eduagent/schemas`, mapping `recall` → the recall-test mechanism, `teach_back` → existing `verificationType='teach_back'`, and `explain` → a new lightweight prompt variant (learner explains the idea plainly; graded with the same `retrieval_events` rubric). **Ship exactly these three.** `compare / apply / synthesis / use_it` are named in the enum's doc comment as future values but not added — adding them without a real mechanism would be a deferred-decision placeholder, which this repo forbids.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Opener has no continuity material | First-ever review of a topic; no recap, no prior retrieval event | Today's generic calibration opener (no fabricated memory) | Correct degradation — invariant 6 |
| Opener flag off | `REVIEW_CONTINUITY_OPENER_ENABLED=false` | Unchanged current review opener | A/B control arm; no regression |
| `retrieval_events` write fails | DB error on the additive insert | Nothing — grade + SM-2 still complete | `safeWrite` guard logs to Sentry; capture is non-core |
| Grader LLM fails | Timeout / unparseable response | Review proceeds; topic re-scheduled soon | Row written `gradedBy='fallback_heuristic'`, `nextAction='reschedule_soon'`; **never a fabricated advancing score** |
| Union double-counts a topic | Topic both overdue and flagged-weak | One entry tagged `both` | Dedup by `topicId` |
| Flagged-weak list empty in prod | Challenge path dark, no surviving system_signal rows | Queue == today's overdue list | Expected pre-RR-12; union is forward-ready |
| Promotion over-promotes | Wrong signal fires | (Tier-1 fix) only matching-signal rows promote | R5 break test guards it |
| Cited source purged | `evidence_links` points to a day-37-purged transcript (tier 2) | Citation resolves to "source no longer available" | Raw-id, no-FK design (mirrors bookmarks); link row harmlessly dangles |

---

## Migration & Rollback

- **Forward (tier 1):** one migration adding enums `retrieval_verdict`, `retrieval_next_action`, `retrieval_grader` and the `retrieval_events` table. **Purely additive** — no drops, no changes to shipped tables. Committed SQL + `drizzle-kit migrate` (dev may `db:push:dev`). Per Schema-And-Deploy-Safety: apply the migration before shipping code that reads the new table.
- **Rollback (tier 1):** drop `retrieval_events`, then the three enums. **Safe** — pre-launch the data is test-only; the opener degrades to recap-only and the union ignores the absent log. No production data loss. The `promotePendingDeepening` and union read-path changes are pure code (revert by deploy).
- Flow 1 and Flow 3 add **no** migration.

---

## Relationship to concept-capture (avoid the collision)

| | `retrieval_events` (this spec, tier 1) | `concept_evaluations` (concept-capture **deferred** slice 4) |
|---|---|---|
| Grain | **Topic** (`topicId`) | **Concept** (`conceptId`) |
| Event | Every **recall attempt** (recall-test, review calibration) | Every **Challenge-Round per-concept verdict** |
| Status | Built in tier 1 | Roadmap only (slice-1 table split leaves the seam) |
| Forward seam | Gains nullable `conceptId` when Concept lands → upgrades to concept-grain | Already concept-grain |

They are distinct tables for distinct events at distinct grains. Tier 1 does not touch `concepts`/`concept_mastery` and does not pre-empt slice 4.

---

## Test Plan

- **Schema/migration:** migration applies and round-trips on `generate`/`migrate`; the three enums and the three indexes exist.
- **Capture (integration, real DB — no internal mocks, GC1/GC6):** a graded recall writes exactly one `retrieval_events` row with correct `quality`, `verdict`, `nextAction`, `gradedBy='llm'`; an injected grader failure writes one row `gradedBy='fallback_heuristic'`, null rationale, `nextAction='reschedule_soon'`, and **does not advance** the SM-2 clock with a fabricated score (regression of the old char-count fallback). Capture-write failure does not throw out of grading (break test).
- **Scoped read:** a second profile never reads another profile's `retrieval_events` (scoped-read break test).
- **Opener (eval-gated):** `pnpm eval:llm` snapshot diff for the new opener block; `pnpm eval:llm --live` confirms a valid envelope; with material present the opener references the prior `learnerAnswer`/recap, with none present it degrades to the calibration question (no fabricated memory).
- **Union:** a topic both overdue and flagged-weak appears once tagged `both`; a flagged-weak-only topic appears tagged `flagged_weak`; ordering follows SM-2 band; `needs_deepening` not previously read is now read (assert against `overdue-topics` query).
- **Promotion (break test, R5):** a `pending_review` row whose signal does not match the firing signal is **not** promoted; the matching signal promotes it. Watch it fail with the old ignored-`_signal` code, pass with the fix.
- **Integration suite:** `pnpm exec nx test:integration api` before any commit touching `apps/api/` (hooks skip `.integration.test.`).

---

## Open Items

- **No ADR required.** All tier-1 items are additive and reversible and sit below the MMT-ADR-0000 significance gate; the grain decision they rest on is already MMT-ADR-0017. If review concludes the `retrieval_events` substrate is contested enough to record, raise an `MMT-ADR` in lockstep with the `architecture.md` "Knowledge Retention" line — but the default is no new ADR.
- Confirm the exact `safeWrite` import path and signature used by `recordPracticeActivityEvent` when wiring the capture (it is the precedent; reuse it verbatim).
- Confirm `evaluateRecallQuality`'s deepened structured-output schema against the envelope conventions (`llmResponseEnvelopeSchema`) during implementation — the grader output must parse through `parseEnvelope()` if it drives the `nextAction` decision.
- Tier-2 `evidence_links` cardinality and whether OCR homework text is ever promoted to a first-class column — decide when slice 2a is scheduled, not now.

---

## Sequencing

Tier 1, FEEL → CORRECT order: **Flow 2 (log) → Flow 1 (opener)** (the opener's richest input is the log) → **Flow 3 (union)** in parallel. Tier 2 (2a, 2b) follows tier 1 and is independent of it. Nothing here flips a production flag; RR-12 remains gated by the findings doc.
