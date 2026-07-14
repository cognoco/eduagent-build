# Concept-Capture Layer — Additive Concept-Grain Mastery

> **STATUS UPDATE (2026-07-14): PARTIALLY SHIPPED.** Concept capture is enabled; the schema, Challenge write path, API read side, and topic/book note signals are live. The older parked/rename narrative below is historical. Concept-targeted review and note-correctness notification remain open.

> **STATUS (2026-06-27):** PARKED — migration 0107 is reference-only; the profiles→person rename (MMT-ADR-0012 one-time reset) has not yet executed (profiles table still exists), so the tables aren't live. Write side gated `CONCEPT_CAPTURE_ENABLED=false`. Read side (API /notes/concept-mastery + mobile NoteDisplay star/additions) is wired and works once tables exist. Scope items 5 (concept-targeted review) + 6 (note-correctness notification) not built. NEXT: re-home concepts/concept_mastery into the post-reset baseline (FKs→person), regenerate the migration, flip the flag.

> **⚠️ MECHANISM CORRECTION (2026-06-27).** The STATUS line above and the "Dependency
> — build on the post-baseline `person` schema" note below describe the rename as the
> `MMT-ADR-0012` one-time *baseline reset* (chain collapse; tables "born on `person`";
> "regenerate the migration"; §5.3 "API surface broken in the baseline commit and
> re-built"). **That mechanism did not ship.** The chain was never collapsed (it is
> append-only, now at `0123`); the identity model was added **additively** (`0108` /
> `0109`) with readers behind `IDENTITY_V2_ENABLED`, and the `profiles`→`person`
> rename is the **WI-586 convergence cutover** (`MMT-ADR-0020`) via the catalog-driven
> `m-repoint` (re-points every live `profiles`-FK → `person`) + `m-drop`. The rename
> is **still pending** (verified 2026-06-27: `m-repoint` / `m-drop` inert in
> `apps/api/drizzle/_freeze-only/`; `meta/_journal.json` ends at `0123`;
> `schema/profiles.ts` is still the live FK target), so **parking stands** and this is
> the **same gate** that parks note-correctness
> (`docs/plans/2026-06-08-note-correctness-and-challenge-draft.md`). At un-park: author
> a normal **append-only** migration (not a "regenerated baseline"); `m-repoint` being
> catalog-driven means a `profiles`-FK'd `concepts`/`concept_mastery` built before the
> freeze is repointed to `person` automatically. **Resolve the open `person.id`
> uuid-vs-bigint question (below) against the shipped `0108`/`0109` identity baseline,
> not the `MMT-ADR-0012` §2A amendment text**, before authoring the FK column types.

**Status:** Draft · 2026-06-08 · **Branch:** `conceptgrain` · **Decision record:** [MMT-ADR-0017](../adr/MMT-ADR-0017-concept-capture-additive-layer.md)

> **Rev. 2026-06-08 (post-review):** capture reads the enriched evaluation list (not the `MasteryDecision`, which drops `missing`); `concept_mastery.supersededAt` added so a stale near-duplicate concept can't permanently suppress a note's star; correction surfacing scoped to neutral topic-level framing pending note↔concept attribution; the note-correctness nudge is deduped against the review-due nudge; the note star resolves to **three** states (not-yet-assessed / verified / tutor-has-additions), never a two-way present/absent split, so an un-assessed note is never visually identical to one with a weak concept (legibility, north-star Invariant 6).

> **Dependency — build on the post-baseline `person` schema, not legacy `profiles`.** The identity-foundation reset (`MMT-ADR-0012` — one-time pre-launch clean-cut baseline; `docs/canon/identity/data-model.md`) renames `profiles` → `person`, `profile_id` → `person_id`, dissolves `is_owner` into an `admin` role, and is an **explicit no-backwards-compatibility cut** ("the API surface is broken in the baseline commit and re-built", §5.3). This spec's *design* is portable — the per-learner scope key survives conceptually — but its *tables and capture/read code* must target the new schema. **Build order: identity baseline reset → this layer on `person`/`person_id` → both in the launch bundle.** Building now against `profiles`/`profileId` guarantees rework inside the cut. **Open (blocks the FK types):** confirm `person.id`'s type — legacy `profiles.id` is `uuid`, but the data-model §2A amendment FKs are typed `BIGINT`; this decides whether `concepts.person_id` and `sourceSessionId` are uuid or bigint and affects every learning-data FK, not just this layer.

## Context

EduAgent tracks learning at **topic grain** everywhere except one place. The shipped surfaces are all topic-keyed:

- `retention_cards` — one SM-2 spaced-review timer row **per topic** (`packages/database/src/schema/assessments.ts:112`).
- `assessments.masteryChallengeVerifiedAt` — set only when **every** concept in a topic's Challenge Round evaluates `solid` (`assessments.ts:77`).
- `topic_notes` — the learner's own-words note, **per topic**, learner-content-only, never graded or mutated (`schema/notes.ts:8`).

The single concept-grain exception is `needs_deepening_topics` (`assessments.ts:163`), which stores one row **per weak concept** with `concept`, `misconception`, and `correction` text. It captures only the **failures**.

**The signal loss.** When a Challenge Round grades a topic and `decideMasteryAndReview()` (`services/challenge-round/evaluation.ts:128`) returns every concept `solid`, those individual solid verdicts — and their `solidAnswerQuotes` — are discarded the moment the topic flips to verified. The system durably remembers what a learner got *wrong* at concept grain and forgets what they got *right*. There is no per-concept record of mastery, so no concept-grain star, no concept-grain trajectory, and no evidence about how multi-concept topics actually are.

**The decision (see MMT-ADR-0017).** Add an **additive** concept-grain mastery layer that captures **every** per-concept verdict (solid and weak alike). Do **not** re-key the topic-grained spine: `retention_cards`, `assessments`, and progress stay topic-keyed. Re-keying is revisited only when captured usage shows topics are genuinely multi-concept. The capture-now timing was chosen deliberately over the cheaper "ship topic-grain star + a cardinality probe first" alternative; the trade-off and its rejection are recorded in the ADR.

## Scope

**In (v1 slice):**

1. Two additive tables: `concepts` (identity, topic-namespaced, per-profile) and `concept_mastery` (current verdict per concept).
2. Capture write at Challenge-Round evaluation — upsert a concept + its mastery for **every** evaluated concept, not just failures.
3. **Star on a note** — derived at read time from `concept_mastery`, presence-only (no column added to `topic_notes`).
4. **Tutor correction beside the note on recall** — surface the existing `needs_deepening_topics.correction` next to the learner's note, opened by choice.
5. **Concept-targeted review** — keep the topic-grained timer, but focus a due topic's recall on its open weak concepts.
6. **Note-correctness notification + sooner review** — when a note's topic has a non-`solid` concept, invite the learner to compare with the tutor's version (neutral framing, never "your note is wrong") and ensure the topic's review is due soon.

**Out (deferred, separate slices):**

- Relevance/connection nudge ("pull-goes-blind" fix) — separate surface, slice 2.
- Consented cross-subject connection graph.
- Two-axis confidence display (staleness × source-agreement).
- Per-concept **trajectory** (append-only evaluation log + "March-you vs now-you" UI). `concept_mastery` holds **latest state only** in v1; the identity/state table split below leaves a clean seam to insert the log later without reshaping.
- Note-**text** grading (judging the learner's exact sentence vs. reusing the verdict) — the star reuses the existing verdict; literal text-grading is a later option.
- Return-as-promotion / archive tier (no archive tier exists yet).

## Data Model

Both tables are **per-profile** and topic-namespaced. Concept labels come from per-session LLM evaluation of one learner's answers; making concepts shared/curriculum-global would force cross-profile label resolution, which is explicitly deferred. The topic (`curriculum_topics`, shared) is the namespace that contains label proliferation — a fuzzy label only needs to be unique within `(profileId, topicId)`.

### `concepts` — concept identity

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | `generateUUIDv7()` |
| `profileId` | uuid not null | FK `profiles.id` on delete cascade |
| `subjectId` | uuid not null | FK `subjects.id` on delete cascade — denormalized for scoped reads, mirrors `assessments`/`needs_deepening_topics` |
| `topicId` | uuid not null | FK `curriculum_topics.id` on delete cascade |
| `label` | text not null | raw LLM concept string (≤200 chars, matching the envelope `concept` max) |
| `normalizedLabel` | text not null | lowercased + whitespace-collapsed `label`, for within-namespace dedup |
| `createdAt` / `updatedAt` | timestamptz not null | `defaultNow()` |

Constraints / indexes:
- `unique('concepts_profile_topic_label_unique')` on `(profileId, topicId, normalizedLabel)` — dedup within the profile+topic namespace.
- `index('concepts_profile_topic_idx')` on `(profileId, topicId)`.
- `index('concepts_profile_id_idx')` on `(profileId)` — standalone FK index (house pattern, per BUG-393/migration 0086).

### `concept_mastery` — current verdict per concept

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | `generateUUIDv7()` |
| `conceptId` | uuid not null | FK `concepts.id` on delete cascade |
| `profileId` | uuid not null | FK `profiles.id` on delete cascade — denormalized so reads are profile-scoped without a join |
| `status` | `concept_mastery_status` enum not null | `'solid' \| 'partial' \| 'missing' \| 'misconception'` — mirrors `challenge_round_evaluation` verdicts |
| `verifiedAt` | timestamptz null | set to the evaluation time when `status` most recently became `solid` — **provenance/history only; the star gate reads `status`, not this** |
| `lastEvaluatedAt` | timestamptz not null | when the latest verdict was written; the future staleness axis of two-axis confidence reads this |
| `supersededAt` | timestamptz null | set when a **later** Challenge Round for the same topic no longer evaluates this concept (its decomposition replaced the label). Non-null rows are excluded from the star gate, so a stale near-duplicate weak concept can't permanently suppress the star — see Capture Flow step 3 and Read Side |
| `sourceSessionId` | uuid null | FK `learning_sessions.id` on delete set null — which session produced the latest verdict |
| `learnerQuote` | text null | the learner's own answer text backing the latest verdict, taken from the enriched evaluation item (`ChallengeRoundEvaluationItem.learnerQuote`, populated for **every** verdict at `evaluation.ts:113-125`) — provenance |
| `createdAt` / `updatedAt` | timestamptz not null | `defaultNow()` |

Constraints / indexes:
- `unique('concept_mastery_concept_unique')` on `(conceptId)` — 1:1 with `concepts`.
- `index('concept_mastery_profile_id_idx')` on `(profileId)`.

New enum: `concept_mastery_status` = `('solid', 'partial', 'missing', 'misconception')`.

**Why two tables and not one.** Identity (`concepts`, stable) is separated from mutable state (`concept_mastery`, rewritten each Challenge Round) to mirror the existing `assessments`/`retention_cards` separation and, critically, to leave a seam: the deferred trajectory feature inserts an append-only `concept_evaluations` log *between* the two without touching either.

## Capture Flow

Capture happens where verdicts are already produced — the Challenge-Round completion path that calls `decideMasteryAndReview()` and `persistChallengeRoundReviewTargets()` (`services/session/session-exchange.ts:713`). The capture is **additive and side-by-side** with the existing `needs_deepening_topics` write; that write is unchanged.

**Capture from the enriched evaluation list, not the `MasteryDecision`.** `decideMasteryAndReview()` returns `solidConcepts` + `reviewTargets`, and `reviewTargets` filters to `partial`/`misconception` only (`evaluation.ts:149-150`) — **`missing` concepts appear in neither bucket**. Reading the returned `MasteryDecision` would silently drop every `missing` verdict, defeating this layer's headline goal of recording what the learner got wrong *and* right. Iterate the enriched `evals: ChallengeRoundEvaluationItem[]` instead — the same array passed *into* `decideMasteryAndReview()`. Each item carries `concept`, `result`, `answerEventId`, and a `learnerQuote` populated for **all four** statuses by the enrichment at `evaluation.ts:113-125`.

For **every** item in that list (solid *and* weak, including `missing`):

1. Upsert a `concepts` row by `(profileId, topicId, normalizedLabel)`; return its `id`.
2. Upsert its `concept_mastery` row (`conflict on conceptId`):
   - `status` = the item's `result`.
   - `verifiedAt` = evaluation time **iff** `result` is `solid`, else leave the prior value untouched.
   - `lastEvaluatedAt` = evaluation time (always).
   - `supersededAt` = `NULL` (always — re-evaluating a concept un-supersedes it).
   - `sourceSessionId` = the session id.
   - `learnerQuote` = the item's `learnerQuote` (already the verified answer text for every verdict; do **not** pull from `reviewTargets`).
3. **Supersede replaced concepts.** After upserting this round's concepts, set `supersededAt` = evaluation time on every `concept_mastery` row under `(profileId, topicId)` whose `conceptId` was **not** in this round's evaluated set and whose `supersededAt` is currently `NULL`. A label the latest round no longer uses (a rename like "ATP" → "ATP synthesis") thus stops counting against the star, while genuinely re-tested concepts keep their fresh verdict. This is safe only because a Challenge Round re-decomposes the topic's full current concept set each time — an assumption flagged in Open Items to confirm before build.

Weak concepts continue to write `needs_deepening_topics` with `correction` exactly as today. No existing behavior changes; the new tables are pure capture. Writes follow the parent-chain ownership rule (`profileId` enforced on every insert/upsert).

## Read Side

### Star on a note (derived, presence-only)

The star is **computed at read time**, never stored — `topic_notes` is not touched. When rendering a note for topic `T`, profile `P`, load `concept_mastery` for the concepts under `(P, T)` **whose `supersededAt` is `NULL`** (the latest round's authoritative set; stale replaced labels are excluded), then resolve to **one of three states** — *not* the two-way present/absent split, which would make an un-assessed note visually identical to a note that has a weak concept:

- **No live concepts captured** (none ever recorded — the note predates this layer, or its topic has never had a Challenge Round) → **not-yet-assessed**. Render *no* star **and** *no* tutor-additions affordance. Neutral and distinct from the additions state; nothing has been assessed, so nothing is implied.
- **All** live concepts `solid` → render the **star** ("verified — your words held up").
- **Any** live concept non-`solid` → **no** star, **and** surface a neutral topic-level "tutor has additions" affordance (see the attribution caveat below).

Presence-of-*signal* by rule, not presence-of-*star*: each of the three states is its own affordance, so the learner can always tell "not reviewed yet" from "reviewed — the tutor has more." A blank note (no star, no affordance) means **un-assessed**, never **failed** — this is the legibility the vision's Invariant 6 demands ("confident-but-wrong is the one fatal failure; legibility is the defense") and it honors the no-struggle copy rule. Today the all-solid state is *approximately* equivalent to reading `assessments.masteryChallengeVerifiedAt` (also all-solid-gated), but the `supersededAt` filter additionally stops a stale prior-round concept from suppressing a star the latest round earned, **and** the three-state resolution distinguishes un-assessed from assessed-with-additions — a distinction the single `masteryChallengeVerifiedAt` boolean cannot express. v1 derives from `concept_mastery` so the signal is concept-aware and ready for finer per-concept note attribution later.

### Tutor correction on recall

The "tutor's note" is the already-stored `needs_deepening_topics.correction`, currently surfaced nowhere useful.

**Attribution caveat (v1).** Notes are per-topic with no concept link in v1, so a correction cannot be attributed to the specific thing the note claimed. If a topic has four concepts and the note is about a `solid` one while a *different* concept is weak, attaching the correction *to the note* would read as "your note is wrong" about a claim the note never made — violating the no-struggle copy rule. Until note↔concept attribution exists (deferred alongside note-text grading), v1 scopes the affordance to a **neutral, topic-level** prompt — "the tutor has more on this topic" — that opens the correction **layered, never merged**, and is **never** framed as a correction *of* the note. The learner's words stay theirs; the tutor material sits beside them and is opened by choice.

### Concept-targeted review

The timer stays topic-grained (`retention_cards`). When a topic comes due and has `needs_deepening_topics` rows with status `active`/`pending_review`, the recall **focuses on those concepts** rather than the whole topic. This leans on existing `needs_deepening_topics` data; `concept_mastery` is not required for it.

### Note-correctness notification + sooner review

When a learner note is finalized (the session-summary save path, `services/notes.ts`), check the topic's **live** (`supersededAt IS NULL`) `concept_mastery`:

- **Any live concept non-`solid`** → enqueue a notification inviting the learner to compare their note with the tutor's version, **and** confirm the topic's review is scheduled soon.
  - The notification is **non-core**: dispatched through the existing `safeSend()` path (`services/safe-non-core.ts`) reusing the review-notification infrastructure (`inngest/functions/review-due-send.ts`), so a dispatch failure is captured in Sentry but never breaks the note save. Copy stays within the no-struggle rule and the neutral framing above — "compare with the tutor's note," never "you got it wrong."
  - **Dedup with the review-due nudge.** Because this reuses the review-notification path *and* shortens the topic's review to ~1 day (below), a learner could otherwise get both a "compare your note" nudge and a "review due" nudge for the same topic within hours. Suppress the note-correctness nudge if a review-due notification for the same `(profileId, topicId)` was sent — or is scheduled — within a 24h window; the review-due nudge already carries the learner back to the topic.
  - **"Review due soon" reuses existing mechanics, adds no new timer.** A non-`solid` Challenge-Round verdict already drives a low SM-2 quality, which shortens the topic's `retention_cards.nextReviewAt` to ~1 day (`packages/retention/src/sm2.ts`). This item only makes that guarantee explicit and surfaces it to the learner; it does not introduce a second scheduler.
- **All live concepts `solid`** → no notification; the note earns its star.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Near-duplicate concept labels | LLM emits "ATP" then "ATP synthesis" for the same topic | Two concept rows under one topic; the older one is superseded once the latest round drops its label | Dedup is `normalizedLabel`-only (trajectory/merge deferred), **but** the `supersededAt` sweep (Capture Flow step 3) excludes the dropped label from the star gate, so a near-duplicate can't permanently suppress the star. |
| Stale weak concept suppresses star | A prior round's weak concept is never re-tested under the same label | Without supersession the star would never return even after mastery | `supersededAt` sweep retires concepts the latest round no longer evaluates; the star gates on live (`supersededAt IS NULL`) concepts only. |
| `missing` verdict dropped at capture | Implementer captures from `MasteryDecision` instead of the enriched evals | A whole class of weak concepts silently never recorded | Prevented by design — capture iterates the enriched `evals` list, which includes `missing` (Capture Flow). Covered by a capture test asserting a `missing` round writes a `concept_mastery` row. |
| Correction misattributed to a note | Topic has a weak concept the note never addressed | Neutral "tutor has more on this topic" — **not** "your note is wrong" | v1 scopes correction surfacing to topic-level neutral framing; per-concept note attribution deferred with note-text grading. |
| Capture write fails | DB error during the additive upsert | No user-visible change (note, mastery, review all still work topic-grained) | Capture is non-core: wrap in `safeSend`-style guard so a capture failure is logged to Sentry but never breaks Challenge-Round completion. |
| Verdict flips solid→weak on re-eval | Learner regresses on a later Challenge Round | Star disappears on that note; correction reappears | Correct behavior — `verifiedAt` retained for history, `status` reflects latest. |
| Note exists, no concepts captured | Note from a session predating this layer, or a topic that never had a Challenge Round | **Not-yet-assessed** state — no star **and** no tutor-additions affordance, visually distinct from the "tutor has additions" state | Acceptable and explicit — the three-state star (Read Side) renders un-assessed distinctly from assessed-with-additions, so a blank note never reads as "you failed." This is the common case, not an edge case. |
| Notification dispatch fails | Push/Inngest error when sending the note-correctness nudge | Note still saves; no nudge delivered | Non-core `safeSend()` — failure logged to Sentry, note save never blocked. |

## Migration & Rollback

- **Forward:** one migration adding the `concept_mastery_status` enum and the `concepts` + `concept_mastery` tables. **Purely additive** — no column/table drops, no changes to shipped tables. Generated via committed migration SQL + `drizzle-kit migrate` (dev iteration may use `db:push:dev`).
- **Rollback:** drop `concept_mastery`, then `concepts`, then the enum. **Safe** — pre-launch the captured data is test-only and no shipped surface depends on these tables (star/correction degrade to neutral, review is unaffected). No production data loss.

## Lockstep / Canon

Per MMT-ADR-0000, the ADR and the canon line it changes move in one change-set. MMT-ADR-0017 amends the retention/mastery-grain description in `docs/architecture.md` (the "Knowledge Retention" section) to record that mastery is now captured at concept grain additively while the scheduled spine stays topic-keyed. That architecture.md amendment ships with this spec's implementation.

## Test Plan

- **Schema/migration:** migration applies cleanly; round-trips on `drizzle-kit generate`/`migrate`; the two unique constraints and the enum exist.
- **Capture (integration, real DB):** a Challenge Round with mixed verdicts writes one `concepts` + one `concept_mastery` per evaluated concept; solid verdicts set `verifiedAt`; weak verdicts also write `needs_deepening_topics` (unchanged). Use the real evaluation path — no internal mocks (GC1/GC6).
- **`missing`-verdict capture:** a round whose evaluated set includes a `missing` concept writes a `concept_mastery` row with `status='missing'` for it — guards against capturing from `MasteryDecision` (which omits `missing`).
- **Dedup:** two evaluations emitting the same `normalizedLabel` under one `(profileId, topicId)` upsert to a single concept row.
- **Supersession / star recovery:** round 1 emits a weak concept "X"; round 2 re-decomposes the topic without "X" and all-solid → the round-1 row gets `supersededAt` set, and the note's star returns (the stale weak concept no longer suppresses it).
- **Star derivation (three states):** all-solid topic → star; mixed (any non-`solid` live concept) → no star + neutral correction affordance surfaced; a topic with **no live concepts** → **not-yet-assessed** (no star **and** no additions affordance), asserted visually distinct from the mixed state so an un-assessed note is never indistinguishable from one with a weak concept; a stale superseded weak concept does **not** block the star. Negative path: a non-owner/other-profile read never sees another profile's concept mastery (scoped-read break test).
- **Capture resilience:** simulated capture-write failure does not throw out of Challenge-Round completion.
- **Note-correctness notification:** finalizing a note whose topic has a non-`solid` **live** concept enqueues exactly one nudge and the topic's `nextReviewAt` is within ~1 day; an all-`solid` topic enqueues none; if a review-due nudge for the same topic was sent within 24h, the note-correctness nudge is suppressed. A simulated dispatch failure does not block the note save (non-core break test).

## Open Items

- `architecture.md` "Knowledge Retention" amendment text (lockstep, ships with implementation).
- **Confirm the supersession assumption (build blocker for the sweep):** verify a Challenge Round re-decomposes a topic's *full* current concept set each time, not an arbitrary subset. The `supersededAt`-by-absence sweep (Capture Flow step 3) is safe only under that assumption — if a round can evaluate a partial subset, switch from absence-based supersession to an explicit per-round marker so an un-retested-but-valid concept isn't wrongly retired. Check the challenge-round prompt + the evaluation construction in `session-exchange.ts`.
- ~~Exact `learnerQuote` source field for misconception verdicts~~ — **resolved:** the enriched `ChallengeRoundEvaluationItem.learnerQuote` (`evaluation.ts:113-125`) carries the verified answer text for every verdict; capture reads it directly, never from `reviewTargets`.
