# Verified-Learning Loop — Loop Map & Slice Plan (WI-1657)

**Status:** Active slice map; partially shipped · last verified 2026-07-22
**Original citation baseline:** `main` @ `54501f7fb` (body file:line claims remain the 2026-07-06 snapshot)
**Current disposition:** The mastery-axis and artifact contracts are Accepted
(`MMT-ADR-0031` / `MMT-ADR-0032`, landed with this spec's follow-up in
`41eaf6c9b`, PR #2001). Challenge→SM-2 next-review scheduling is shipped in
`apps/api/src/services/session/session-exchange.ts`; `evidence_links` /
`LearnerSource` remain absent and are owned by
**WI-1704 (verified-artifact evidence links)**. The design-only **WI-1465
(low-stakes per-concept re-prove)** is Closed/Done after producing proposed
`MMT-ADR-0034`; its learner-facing implementation remains unbuilt, and the ADR's
API, mobile, and test follow-ups are not yet captured. Current remaining
second-wave scope includes **WI-1454 (concept-targeted review for weak concepts)**. Use
`docs/plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md` for launch disposition.
**Relates:**

- `docs/specs/2026-06-27-felt-knowing-loop.md` — owns the note-authoring / freeform-keep / citation glue (segments it owns are *sequenced*, not re-owned, here)
- `docs/_archive/specs/Done/2026-06-08-memory-task-review-continuity.md` — Tier 1 shipped (`retrieval_events`, review opener); slice 2a (`evidence_links` + `LearnerSource`) decided, not built
- `docs/specs/2026-06-03-review-relearn-findings-and-high-impact-todos.md` — RR-N register this spec maps onto WIs
- `docs/_archive/plans/done/2026-05-30-topic-mastery-three-states.md` — shipped Untouched → Learning → Mastered model
- `docs/plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md` — current launch disposition
- `docs/adr/MMT-ADR-0031-challenge-verification-and-sm2-are-complementary-mastery-axes.md` — Accepted axes ruling for S4 / WI-1469
- `docs/adr/MMT-ADR-0032-verified-learning-artifacts-require-source-and-verification-state.md` — Accepted artifact provenance contract for S5a / S7

## Purpose

WI-1657 AC1: *"A single spec maps the current Challenge Round, SM-2, note/Journal, Mentor/Now, and parent recap pieces and names which existing WIs close each slice."* This document is that map. It defines the loop as one user journey, states with file:line evidence what each segment already does, reconciles the two mastery axes, and assigns every remaining slice to a Work Item. It authorizes no build by itself; each slice executes under its own WI.

## The loop — five segments, one journey

```
(1) TUTORING            guided/freeform session; mentor teaches
      ↓
(2) EXPLAIN-BACK        Challenge Round: learner explains; server verifies per concept
      ↓                 (conservative, server-owned decideMasteryAndReview)
(3) VERIFIED ARTIFACT   the learner's own solid words become a kept, provenance-
      ↓                 stamped note in the Journal/Learning Book
(4) RETENTION / RETEST  SM-2 schedules decay + re-prove; due reviews visible in
      ↓                 Mentor/Now; stale verification triggers re-prove
(5) PARENT PROOF        recap surfaces consume the verified artifact (derived,
                        never raw transcript)
```

The core product claim ("the app proves learning, not just chats about it") requires all five to hand off to each other. Today every segment exists in some form; three of the four hand-offs are broken or dark.

## Surfaces affected (full enumeration)

Session paths (per `docs/flows/learning-path-flows.md` mode matrix, line 704):

- **Path 2 guided learning** — the only path where Challenge Round runs (flag-gated)
- **Path 1 freeform** — no Challenge Round; joins the loop only after close-path auto-file (≥5 exchanges, `config/filing.ts:2`)
- **Path 4 review** (`mode=review`) — consumes SM-2; verification overlays suppressed; live calibration grading writes SM-2
- **Path 5 relearn** — resets the SM-2 card; its `needs_deepening_topics` insert temporarily blocks Challenge eligibility
- **Path 3 homework, Paths 6–8 recitation/quiz/dictation** — outside the loop (no Challenge Round, no SM-2 write except assessments/quiz own tables); unaffected

Non-session surfaces:

- **Mentor/Now** (`apps/mobile/src/app/(app)/mentor.tsx`) — due-review visibility
- **Journal/notes** (`SubjectHub` notes section, `JournalTabView`) — the artifact's home
- **Progress** (`apps/api/src/services/progress.ts`) — the one place both mastery axes are read together today
- **Parent recaps** (`/(app)/recaps`, `apps/api/src/services/recaps.ts`) + child screens — segment 5. Caveat: the recaps tab is V1-family-shape only; current prod V0 family mode does not expose it, so S7 must pick a prod-visible parent target or explicitly depend on a nav/flag rollout.
- **Transcripts** — provenance source; subject to purge (`transcript-purge.ts`); `retrieval_events` deliberately survives purge (`packages/database/src/schema/retrieval-events.ts:69-76`)

## What exists today (per segment, with evidence)

Legend: **SHIPPED** (live in prod path) · **DARK** (built, flag-off or unwired) · **GAP** (nothing handles it).

### Segment 1 — Tutoring: SHIPPED

Live across all session paths. No changes needed for this loop.

### Segment 2 — Explain-back verification: DARK (built, flag-off)

- `CHALLENGE_ROUND_RUNTIME_ENABLED` defaults `'false'` (`apps/api/src/config.ts:162`). While false: no prompt block, envelope signals ignored, no SSE fields (`config.ts:156-160`).
- Evaluation is server-owned and conservative: `decideMasteryAndReview` (`apps/api/src/services/challenge-round/evaluation.ts:128`) returns `{outcome, markMasteryVerified, solidConcepts, solidAnswerQuotes, reviewTargets}`; verified only when every concept is `solid` (`:169`); any partial/missing/misconception routes weak concepts out (`:159`, `:179`).
- Persistence: `assessments.masteryChallengeVerifiedAt` set in `session-exchange.ts:679-690`; weak concepts written to `needs_deepening_topics` with `source='challenge_round'` (`session-exchange.ts:693-730`; table at `packages/database/src/schema/assessments.ts:163`).
- State machine + single-flight finalization: `session-exchange.ts:375`, `:395`, `:804` (FOR UPDATE claim), `:888`.
- **Stale-comment correction:** the flag comment (`config.ts:154`) names `resolveMasteryVerificationState` integration as a pending Phase-5 blocker — that function **is shipped** (`apps/api/src/services/challenge-round/verification.ts:56`, `'unverified'|'fresh'|'stale'`) and read in `progress.ts:473` and `:1406`. The remaining named blockers to re-verify at flip time: `pending_review` promotion + expiry cron (still a GAP — WI-1446) and the no-clinical-copy ratchet.

### Segment 3 — Verified artifact: PARTIAL

- **Challenge-drafted note path: DARK-with-the-flag.** Note drafts from a Challenge Round must use only `solidAnswerQuotes` and pass the lexical-overlap hallucination guard `validateNoteDraft` (`apps/api/src/services/challenge-round/note-draft.ts:143`, rejection `:173`, verified-DB-content check `:154`).
- **Learner-authored notes: API + topic-sheet write path SHIPPED, overview still read-only.** Full CRUD in `services/notes.ts` (`createNote:472`, `updateNote:506`, `deleteNoteById:529`; session-embedded `createNoteForSession:232`). The subject-hub route wires `handleAddNote` into `SubjectHub` (`subject-hub/[subjectId]/index.tsx:310`), and `TopicDetailSheet` binds that handler to a focused topic (`TopicDetailSheet.tsx:118`). But the top-level `SubjectHub.tsx:121` notes overview still omits `onAddNote`, so that overview section renders read-only (`SubjectHubNotesSection.tsx:78`, `canAddNote = canStudy && !!onAddNote`). Felt-knowing-loop Flow 1 owns any remaining overview/landing-surface write affordance.
- **Provenance/citation substrate: GAP.** `evidence_links` and `LearnerSource` have **zero code hits** — decided in review-continuity slice 2a, never built. The Journal browse component now exists as `JournalNotesArchive` inside `JournalTabView.tsx:587`; the missing piece is not the archive shell, but the provenance/citation substrate that lets a verified artifact point back to source evidence.
- **Correctness grading of learner notes: GAP.** The note-correctness plan (grade notes, marks UI, save-as-note) was captured as WI-1491, which is now Closed/Cancelled (2026-07-10) — no live grading pathway exists. See the "Artifact Provenance Contract" section below for the current promotion-pathway status (unavailable pending a future grading Work Item).
- **Artifact taxonomy: GAP.** Challenge-drafted notes, learner-authored notes, and freeform "keep this" artifacts must not collapse into one generic note type. Parent proof may only consume an artifact with explicit source + verification state, e.g. `source='challenge_solid_quote'` with `verificationState='verified'`. Ordinary learner notes remain learner-authored study material pending a future grading flow — see the "Artifact Provenance Contract" section below.

### Segment 4 — Retention / retest: SHIPPED core, broken hand-off from segment 2

- SM-2 core: `sm2()` (`apps/api/src/services/retention.ts:82`); three-state XP (`xpStatus: 'pending'|'verified'|'decayed'`, `:15`; verified `:97`, decayed `:122`); retention bands `:180-197`.
- Sticky mastery: `stampMasteryOnVerify` sets `retention_cards.masteredAt` once (`services/retention-mastery.ts:13`) — the shipped three-state Untouched/Learning/Mastered model.
- Due reviews: `getOverdueTopicsGrouped` (`services/overdue-topics.ts:65`, `lt(nextReviewAt, now)` `:94`) and the Now feed `retention_due` cards (`services/now-feed.ts:531-554`, card `:561`) rendered at `mentor.tsx:286` via `useNowFeed`.
- **The broken hand-off:** Challenge-Round verification does **not** write `retention_cards.nextReviewAt` — a Challenge-verified topic gets no scheduled re-prove. This is the loop's single most load-bearing missing edge (WI-1445).
- Relearn resets the card to baseline pre-advance (`relearn-retention-reset`, flows doc Path 5) and its `needs_deepening_topics` insert blocks Challenge eligibility until `EXIT_CONSECUTIVE_SUCCESSES = 3` — abandoned relearn sessions can leave the block standing (flows doc Path 5, known gap 2).

### Segment 5 — Parent proof: V1 surface shipped, no verified metadata

- Recaps derived, never raw transcript: `services/recaps.ts` (`listRecapsForParent:176`, `getRecapForParent:341`, `validateRecapItems:260`); mobile `/(app)/recaps` list+detail; `recaps` tab in `FAMILY_TABS` (`navigation-contract.ts:157-159`).
- **Prod-visibility caveat:** flow inventory PARENT-11 marks Family Recaps as V1-only; current prod V0 family mode has no recaps tab. S7 cannot be considered shipped for parents unless it either targets a current prod parent surface (for example parent home / child session detail) or explicitly ships with the approved V1/nav rollout.
- **GAP:** recaps carry **no** verified/mastery/provenance fields (grep of `recaps.ts` for `verified|provenance|mastery`: zero hits). A parent today sees narrative prose, not proof.

## The two mastery axes — actual reconciliation state

| | Axis A — Challenge-verified | Axis B — SM-2 retention |
|---|---|---|
| Store | `assessments.masteryChallengeVerifiedAt` (`schema/assessments.ts:77`) | `retention_cards` (`easeFactor/intervalDays/repetitions/nextReviewAt/masteredAt/xpStatus`, `schema/assessments.ts:124-134`) |
| Semantics | "explained it in their own words, every concept solid" | "recall held up over spaced intervals" |
| Reversible? | timestamp, never cleared; staleness *derived* | `verified → decayed` reversible; `masteredAt` sticky |

**Read side: already reconciled.** `progress.ts` reads both axes in one builder (retention cards `:229`/`:348`/`:573`; `masteryChallengeVerifiedAt` `:364`/`:1326`) and emits the derived `masteryVerificationState` (`:473`, `:1406`); the raw timestamp no longer goes over the wire (`:469`). `resolveMasteryVerificationState` marks a verification `stale` when a weak-spot row post-dates it (`verification.ts:66`).

**Write side: NOT reconciled.** Verification schedules nothing (no `nextReviewAt` write — WI-1445), decay triggers no re-prove prompt, and no ruling exists on what "mastered" means when the axes disagree (SM-2-verified but never Challenge-verified, and vice versa). That ruling is WI-1469 and is ADR-class (contested, hard to reverse — record as an `MMT-ADR` per the significance gate, in lockstep with the canon line it changes).

## Slice map — what closes each slice

| # | Slice | Closes | WI | Stage today |
|---|---|---|---|---|
| S1 | Calibrate the all-or-nothing mastery bar via the simulated-learner harness, add telemetry/rollback gates, then flip `CHALLENGE_ROUND_RUNTIME_ENABLED` on staging only | Segment 2 goes live in staging without a prod commitment | **WI-1464** (calibrate Challenge mastery bar, RR-6) + Doppler flip (op task, not a WI) | Captured |
| S2 | Write `retention_cards.nextReviewAt` on Challenge-Round mastery verification, after the axes preflight defines the write semantics | Segment 2→4 hand-off | **WI-1445** (correctness-chain #7) | Captured |
| S3a | Promote `needs_deepening_topics` `pending_review` → `active` (+ expiry) | weak-spot lifecycle; named flip blocker in `config.ts:154-155` | **WI-1446** (stranded promotion) | Captured |
| S3b | Low-stakes per-concept re-prove for recovering strugglers | recovery path out of a failed Challenge (RR-7 lockout) | **WI-1465** | Captured |
| S3c | Concept-targeted review: focus due-topic recall on open weak concepts | segment 4 uses segment 2's concept evidence | **WI-1454** | Captured |
| S4 | Rule the SM-2-verified vs Challenge-verified relationship (write-side); complete at least a preflight ruling before S2 writes schedules | the axes ruling (RR-11); ADR-class; proposed in MMT-ADR-0031 | **WI-1469** | Captured |
| S5a | Writable notes + freeform keep + evidence citation + explicit artifact source/verification taxonomy | Segment 3 learner-authored artifact + citation; proposed in MMT-ADR-0032 | **WI-1703** (Define verified-artifact provenance contract) + **WI-1704** (Build evidence-links substrate) + felt-knowing-loop spec Flows 1–3 | Captured blockers now exist; still refine before execution |
| S5b | Grade learner notes, marks UI, save-as-note | Segment 3 correctness | **WI-1491** (note-correctness T1–T13 umbrella) is Closed/Cancelled (2026-07-10) — no owning Work Item today; promotion pathway is unavailable pending a future grading WI, see the "Artifact Provenance Contract" section | Cancelled |
| S6 | Visible review-promise Mentor card ("we'll check this again on …") | Segment 4 visible in Now at promise time, not only when due | **WI-1502** | Captured |
| S7 | Parent proof consumes the verified artifact (recap/current-prod parent surface carries verified-topic + artifact reference + retention state, within retention rules) | Segment 5 | **WI-1705** (Choose production-visible parent proof surface) → **WI-1665** (captured 2026-07-06 as incidental item under WI-1657) | Captured; surface decision blocks implementation |
| S8 | One end-to-end loop test/eval pack, scaffolded before the staging flag flip and expanded slice-by-slice: verified, partial, misconception, decay→retest, parent-visible proof | AC6 | **WI-1666** (captured 2026-07-06 as incidental item under WI-1657) | Captured |

AC coverage: AC1 = this spec · AC2 = S1+S3b (explain-back gate; the never-lock rule bounds it — see walkthrough) · AC3 = S5a+S5b (+ the already-built Challenge note-draft path) · AC4 = S2+S3a+S3c+S6 · AC5 = S7 · AC6 = S8.

## Execution gates added after adversarial review

- **No prod Challenge flip from this plan.** S1 may flip staging only. Any prod flip needs explicit operator approval after S3a, S4 preflight, S8 baseline coverage, and staging telemetry show no lockout/regression.
- **No schedule write before the axes ruling.** S2 may implement the persistence mechanics only after S4 records the minimum rule for how Challenge verification, SM-2 decay, `masteredAt`, and `masteryVerificationState` interact.
- **No parent proof before artifact provenance.** S7 is blocked until S5a has concrete Work Items and an artifact contract that distinguishes challenge-verified quotes, learner-authored notes, and freeform kept material.
- **No parent proof counted if only V1 recaps can see it.** S7 must name the parent surface that is visible in the shipping target. If that target is V1 Family Recaps, S7 depends on the approved V1/nav rollout; otherwise it must also render on a current-prod parent surface.
- **No late test umbrella.** S8 starts as a scaffold before S1's staging flip. Each slice adds its scenario while the behavior is introduced, not after the whole loop is assembled.

## Artifact Provenance Contract (WI-1703)

**Decision authority:** `docs/adr/MMT-ADR-0032-verified-learning-artifacts-require-source-and-verification-state.md` (Accepted 2026-07-08). This section is that ADR's concrete elaboration — the exact values, tables, and degradation rules S5a's downstream Work Items (WI-1704, WI-1705, WI-1658, WI-1665) build against. It commits no schema and runs no migration; it is the vocabulary those WIs must not drift from.

### Three axes that must not collapse into one

The loop already has three different things that each use "source" or "verification state" vocabulary. Naming them side by side once here is the point of this contract — conflating any two of them is exactly the failure mode MMT-ADR-0032 exists to prevent.

| Axis | Grain | Values | Owner | Purpose |
|---|---|---|---|---|
| **Artifact source** (new, this contract) | one artifact | `challenge_solid_quote` / `challenge_drafted_note` / `learner_authored_note` / `freeform_keep` | WI-1704 | What kind of evidentiary claim this artifact carries — set once at creation, immutable |
| **Artifact verification state** (new, this contract — *proposed*, WI-1704 owns adding it) | one artifact | `unverified` / `verified` | WI-1704 | Whether *this artifact* may feed proof surfaces |
| `MasteryVerificationState` (existing, `verification.ts:25`) | one topic | `unverified` / `fresh` / `stale` | Segment 2 (shipped) | Whether a topic's Challenge-Round pass is still current given later weak-spot evidence — a retention-freshness signal, not an artifact property |
| `LearnerSource.kind` (existing, decided not built — review-continuity slice 2a) | one citation | `note` / `bookmark` / `transcript_excerpt` / `homework_ocr` | WI-1704 (shared substrate) | Which table a piece of content came from, for in-conversation "you learned this from your note" citation — orthogonal to whether that content is *verified* |
| `noteOrigin` (existing, `packages/schemas/src/notes.ts:7`) | one `topic_notes` row | `self` / `mentor` | Shipped | Who authored the note text — not whether it is evidentiary proof |

A `topic_notes` row can be `noteOrigin='self'`, `LearnerSource.kind='note'`, artifact source `learner_authored_note`, and verification state `unverified` — four independent facts about the same row. None of the four is derivable from another.

### Artifact source values (AC1)

Matches `docs/architecture.md` → Cross-Cutting Concerns → "Retention & spaced repetition" (verified-artifact clause) exactly; both name the same four sources. Proposed as a new `@eduagent/schemas` enum (`artifactSourceSchema`), mirroring the existing `noteOriginSchema` / `taskTypeSchema` pattern — WI-1704 owns adding it.

| Value | What it is | Storage today | Set by |
|---|---|---|---|
| `challenge_solid_quote` | A learner quote a Challenge Round evaluated `solid` for one concept | Not a stored row — a pointer (`answerEventId`) into `session_events`, produced transiently by `decideMasteryAndReview()` (`evaluation.ts:128`) as `solidAnswerQuotes` | Server, at Challenge Round finalization; immutable |
| `challenge_drafted_note` | A note drafted from `solidAnswerQuotes`, gated by the lexical-overlap hallucination guard | `DraftedChallengeNote` (`session-exchange.ts:342`) — the guard (`validateNoteDraft`, `note-draft.ts:143`, invoked via `buildValidatedDraft`) **does run in production**, unconditionally, at every Challenge Round finalization (`finalizeChallengeRoundIfReady`, `session-exchange.ts:1179-1190`); the gap is downstream, not in the guard: nothing ever calls `createNoteForSession` (`notes.ts:232`) with the validated draft, so it is returned to the client as a response payload and **never persisted** as a `topic_notes` row today | Server, only after `validateNoteDraft` passes; immutable |
| `learner_authored_note` | A note the learner wrote directly, no Challenge Round involved | `topic_notes` row via `createNote`/`createNoteForSession` | Learner, at write time; immutable |
| `freeform_keep` | Anything the learner chose to keep from a freeform (non-Challenge) exchange, no correctness claim | `bookmarks` row (`docs/specs/2026-06-27-felt-knowing-loop.md` Flow 2 — `topicId` nullable, `subjectId` required) — **not** a `topic_notes` row | Learner, at keep-tap time; immutable |

### Verification state + proof eligibility (AC2)

`ArtifactVerificationState = 'unverified' | 'verified'`. Two states only — there is no third "pending" state for artifacts (contrast `MasteryVerificationState`'s `stale`, which is a topic-grain retention concept, not an artifact one).

| Source | Initial state | How it becomes `verified` | Can it be promoted later? |
|---|---|---|---|
| `challenge_solid_quote` | `verified` | Verified by origin, at **concept grain**, not decision grain: it exists whenever `decideMasteryAndReview` (`evaluation.ts:128`) marks that one concept `result: 'solid'` — independent of the overall `MasteryOutcome` for the round. A round with `outcome: 'partial'` still produces `solidAnswerQuotes` (and downstream solid-quote artifacts) for its solid concepts; only the topic-level `assessments.masteryChallengeVerifiedAt` requires `outcome: 'verified'` (every concept solid) | No — verification is inherent to how the row is produced, not a separate step |
| `challenge_drafted_note` | `verified`, **conditional on concept-grain grounding** — see gap note below | Verified by origin only when the note's grounding evidence is concept-sliced (derived only from tokens belonging to `solid` concepts) **or** every evaluation item sharing its source answer event(s) is `result: 'solid'` (no event mixing a solid concept with a partial/misconception one on the same answer). A draft whose grounding cannot meet this bar must be treated as `unverified` and excluded from parent/progress proof — passing `validateNoteDraft`'s lexical-overlap check (`fetchVerifiedSolidContents`, `session-exchange.ts:726`) is a *content-drift* guard, not a concept-verification guard, and the two must not be conflated. A draft that fails the lexical-overlap guard outright is never shown at all; one that passes today is never currently persisted either (see AC1 table) | No |
| `learner_authored_note` | `unverified` | No live grading pathway exists today: WI-1491 (the note-correctness umbrella) is Closed/Cancelled (2026-07-10); WI-1455 is a nudge/UX item, not a grading replacement. Promotion is **unavailable** pending a future grading Work Item — never by default, age, or edit count (MMT-ADR-0032 §2) | Yes, once a future grading WI ships — out of scope here |
| `freeform_keep` | `unverified` | No path exists or is planned — "no correctness claim at all" is the source's defining property (MMT-ADR-0032 context) | No |

**Proof eligibility is not `verificationState === 'verified'` alone.** Per `docs/adr/MMT-ADR-0031-challenge-verification-and-sm2-are-complementary-mastery-axes.md` §5, "*a proof surface may claim a topic is verified only when it is Challenge-verified, and it must simultaneously expose the retention state*" — copy or badges implying permanent mastery from either axis alone are prohibited. So a parent/progress proof surface renders a verified artifact **together with** the topic's current `MasteryVerificationState` (`fresh`/`stale`) and retention band, never the artifact's verification alone as an unqualified checkmark.

A `learner_authored_note` or `freeform_keep` artifact **never** feeds parent/progress proof while `unverified` — it remains learner-only study material, visible in the learner's own Journal/Library, never surfaced as evidence to a parent or supporter.

**Known gap: today's `challenge_drafted_note` gate is event-grain, not concept-grain.** `buildValidatedDraft` (`session-exchange.ts:750-800`) gates a draft's source answer events on whether *any* evaluation item for that `answerEventId` was `result: 'solid'` (`solidEventIds`, built from `evaluations.filter(item => item.result === 'solid')`), and `validateEvaluationEventIds` (`evaluation.ts:82`) substitutes the *entire* `session_events.content` for that event as the "DB-verified" grounding text. If a single learner answer event was evaluated against two concepts — one `solid`, one `misconception` — the event still qualifies as a solid source, and the whole answer's content (including the misconception content) becomes the guard's grounding text. A drafted note built on this event-grain gate can therefore ground a `verified` claim in content that was never concept-verified. **This is a known implementation gap, not a contract gap**: the contract above requires concept-sliced grounding or all-solid-per-event exclusivity; WI-1704 (evidence-link substrate) must close this gap — by making evidence concept-sliced, or by rejecting any source answer event that carries a non-solid evaluation item — before any downstream WI (WI-1658, WI-1665, WI-1705) treats a persisted `challenge_drafted_note` as a `verified` artifact for parent/progress proof.

### Durability asymmetry (part of AC5's degradation rules)

The two verified sources do not have the same evidence lifetime, and a proof surface must degrade accordingly rather than treating "verified" as a single durable fact:

- The **verified fact** — `assessments.masteryChallengeVerifiedAt` — is a timestamp, never cleared (loop-map §"Two mastery axes"). This persists regardless of what happens to the underlying quote.
- A **`challenge_drafted_note` body** persists in `topic_notes` — a durable, learner-owned row. Nothing purges `topic_notes`. This is the **preferred durable proof artifact** once persistence is wired (the guard already validates every draft in production today; only the `createNoteForSession` write is missing — see AC1 table).
- A **`challenge_solid_quote`'s evidence** (`answerEventId` → `session_events.content`) is *not* separately preserved — `session_events` is the raw transcript and is subject to the same session-scoped transcript-purge window as the rest of the conversation (`transcript-purge-cron.ts:41`, cutoff `-30` days — the "day-37" figure elsewhere in that file is only a stuck-session alert threshold for sessions still missing a summary, not the purge cutoff; distinct from `retrieval_events`'s own independent 37-day TTL, which is a different table for the unrelated review/recall-log flow — do not conflate the two windows, 30 vs 37). Once that session's transcript purges, the quote pointer dangles.

**Degradation rule.** When a `challenge_solid_quote`'s evidence has purged (or a future `evidence_links` row otherwise dangles — raw-id, no-FK by design, mirroring the existing `bookmarks`/`evidence_links` precedent in `docs/_archive/specs/Done/2026-06-08-memory-task-review-continuity.md`), the proof surface:
- keeps showing the verified **fact** ("verified: `<topic>` on `<date>`") — the timestamp never lied and is never retracted;
- degrades the **quote** to "source no longer available" — never fabricates a substitute quote, never falls back to raw transcript to backfill it;
- keeps co-presenting the topic's current retention state (fresh/stale/due) per MMT-ADR-0031, independent of the quote's availability.

If a `challenge_drafted_note` exists for the same verification (the durable path), prefer rendering that over a solid-quote pointer — it does not degrade on the transcript clock.

**Addendum (2026-07-11, WI-1658 rework — read-side quote age-out).** The `challenge_drafted_note` durability stated above ("nothing purges `topic_notes`", "does not degrade on the transcript clock") is a *write-side* / row-existence statement — it predates AC4's separate obligation to align quote *retention* with WI-1194's clock, and the two must not be conflated. The split now implemented in `getLatestVerifiedProofForChild` (`apps/api/src/services/parent-proof.ts`):

- The **verified fact** — topic, `verifiedAt`, `MasteryVerificationState` — remains durable and is never suppressed; MMT-ADR-0031 §5 co-presentation is unaffected by anything below.
- The **verbatim quote** is retention-sensitive child content and is *read-suppressed* (never deleted here) once its `topic_notes` row is older than 30 days — the same cutoff `transcript-purge-cron.ts` already uses and the window WI-1194's own description names for verbatim quotes generally. Past that window the quote reads back as null and the existing degradation rule above renders "source no longer available", identical to the dangling-evidence case.
- This is **read-side suppression only**. The `topic_notes` row itself is not deleted by this WI — write-side purge of aged rows remains WI-1194's scope (tracked via the cross-cutting sweep comment on that WI's page, alongside `concept_mastery.learner_quote` and `session_summaries.learnerRecap`).
- "Does not degrade on the transcript clock" (above) refers to the row surviving `transcript-purge-cron.ts`'s *session*-transcript purge, which only targets `session_summaries`/`session_events`, never `topic_notes` — it was never a claim that the quote is exempt from its own retention window.

**Edge case: a verified artifact from a topic never Challenge-verified.** Because `challenge_solid_quote` artifacts exist at concept grain (see AC2 table above), a topic can hold a verified solid-quote artifact for one concept while its overall `MasteryVerificationState` is `unverified` (the round outcome was `partial` — other concepts were weak, so `assessments.masteryChallengeVerifiedAt` was never set). A proof surface must not present that single concept's solid quote as "topic verified" — it renders only per-concept ("verified: `<concept>`, part of `<topic>`") and never upgrades to a topic-level verified claim until the topic's own `MasteryVerificationState` transitions away from `unverified`.

### Transcript-safety prohibition (AC5)

Parent/supporter and progress proof surfaces **never** render: raw `session_events` transcript content, any `partial`/`misconception`/`missing` evaluation text, or an `unverified` `learner_authored_note`/`freeform_keep` artifact as if it were proof. This extends the derived-output posture of `docs/adr/MMT-ADR-0027-supporter-visibility-contract.md` (server-side allow-list, no path from raw chat to a supporter-visible fact) to the learning-proof surface specifically. The only learner-quote content a proof surface may show is the stored content of a `verified` artifact itself (a drafted-note body, or — before it purges — the solid-quote's own text) — never a live re-read of the surrounding transcript.

### Follow-up implementation Work Items (AC4)

All four should wait on this contract (per the "No parent proof before artifact provenance" execution gate above) rather than implement ahead of it and drift names — no Cosmo `Blocked by` edge is asserted here; this is a normative sequencing note, not a lifecycle gate:

- **WI-1704** (Build evidence-links substrate for verified learning artifacts) — schema/API: owns turning the artifact-source and verification-state enums above into actual storage (column, side table, or equivalent — this contract commits to the *names and values*, not the physical shape) plus the `evidence_links`/`LearnerSource` substrate from review-continuity slice 2a.
- **WI-1705** (Choose production-visible parent proof surface before rendering verified artifacts) — product/mobile: names which current-prod surface renders the proof block; consumes this contract's proof-eligibility rule but does not itself render anything.
- **WI-1658** (Build parent proof receipts from verified learner explanations) — API/mobile: a receipt-style consumer of this contract.
- **WI-1665** (Parent proof: recap consumes the verified-learning artifact — loop slice S7) — API/mobile: the Recaps-surface consumer of this contract, already tracked in this WI's Related Items.

## Walkthrough per entry path (behavior once all slices land)

- **Guided (Path 2):** learner finishes explaining; Challenge Round offered (envelope signal, server cap `MAX_INTERVIEW_EXCHANGES`-style bound); all-solid → topic shows `fresh` verification, a note in their own quoted words lands in the Journal, `nextReviewAt` is scheduled, Now shows the review promise. Any partial → not verified, weak concepts routed to `needs_deepening_topics`, low-stakes re-prove offered later. **Risk: low** — this is the designed happy path.
- **Freeform (Path 1):** no Challenge Round mid-chat; "keep this" bookmarks the reply (felt-knowing Flow 2); after auto-file (≥5 exchanges) the filed topic joins the guided loop on its next session. **Risk: low; explicitly not an explain-back surface.**
- **Review (Path 4):** opener names the prior ("last time you had X down"); calibration grading writes SM-2; a decayed Challenge-verified topic surfaces as due and can route to re-prove (S3c targets open weak concepts). **Risk: medium** — review is live-but-not-guaranteed on SM-2 writes (no-quality edges, flows doc Path 4 caveat); S8's decay/retest variant must cover it.
- **Relearn (Path 5):** card reset to baseline; Challenge blocked while `needs_deepening` active, released after 3 good completions. **Never hard-locks learning** — the learner can always study the topic (AC2's constraint; never-lock is a standing product rule). Abandoned-relearn block staleness is a known gap — S3a's expiry handling should sweep it.
- **Homework / recitation / quiz / dictation (Paths 3, 6–8):** out of loop, unchanged. Quiz/assessment keep their own retention tables.
- **Parent (recaps tab, child screens, or current-prod parent surface):** a parent-visible surface for a session containing a verified Challenge shows "verified: <topic>" with the learner's verified artifact (quote-grounded note), never raw transcript; retention metadata (e.g. "holds strong / due for re-check") within retention rules. **Risk: high until S7 chooses the surface** — Family Recaps are V1-only today, and copy must pass no-clinical-copy and positive-framing rules.

## Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Flag off (today's prod) | `CHALLENGE_ROUND_RUNTIME_ENABLED='false'` | no Challenge prompts at all | envelope signals ignored downstream by design (`config.ts:156-158`); loop dark, nothing breaks |
| LLM never emits `challenge_round_evaluation` | model drops signal (known on gpt-oss) | round appears to stall | server-side finalization cap + `challenge-round-finalize-failed` Inngest fn (`inngest/functions/challenge-round-finalize-failed.ts`); single-flight claim `session-exchange.ts:804` |
| Grader keeps failing in review | provider errors | review feels ungraded | EU-7 grader-failure cap (`review-calibration-grade.ts`); card left unchanged, no false SM-2 write |
| Partial / misconception evaluation | weak concepts detected | "not yet — here's what to firm up" (never "struggle" copy) | routed to `needs_deepening_topics` `source='challenge_round'`; re-prove via S3b |
| `pending_review` rows never promoted | promotion cron missing (today) | weak spots invisible; verification staleness under-reported | S3a (WI-1446) — this is a flip blocker, sequenced before S1's prod flip |
| Verified then decays | SM-2 lapse after verification | topic shows due/`stale`, not "mastered forever" | `resolveMasteryVerificationState` → `stale` (`verification.ts:66`); re-prove path S3b/S3c; `masteredAt` count stays honest (sticky, but XP status decays) |
| Note draft hallucinated | draft strays from solid quotes | draft never shown | `validateNoteDraft` lexical-overlap rejection (`note-draft.ts:173`); no artifact rather than a wrong artifact |
| Artifact source ambiguity | generic note rows mix Challenge drafts, learner-authored notes, and freeform keep artifacts | parent sees "verified" on material that was never verified | S5a artifact taxonomy blocks S7; only explicit verified artifact sources can feed parent proof |
| Relearn abandoned mid-block | `needs_deepening` row active, no completions | Challenge unavailable on that topic | S3a expiry; learning itself never locked |
| Artifact missing at recap time | Challenge failed or note rejected | recap degrades to today's narrative recap | S7 renders proof block only when a verified artifact exists — additive, no regression |
| Parent proof only lands in V1 Recaps | S7 targets `/(app)/recaps` but prod remains V0 family mode | proof works in preview, no current prod parent can see it | S7 must either depend on nav rollout approval or add the proof block to a current-prod parent surface |
| Transcript purged after citation | retention window passed | "source no longer available" on the citation | `retrieval_events` survives purge by design (`retrieval-events.ts:69-76`); `evidence_links` dangles harmlessly (raw-id, no-FK — felt-knowing spec Retention note) |

## Recommended sequencing (and why)

1. **S4 preflight (WI-1469)** — record the minimum axes rule before S2 writes schedules. The full ADR can continue after, but the schedule semantics cannot be implicit.
2. **S3a (WI-1446)** — named flip blocker; smallest; unblocks honest staleness.
3. **S8 scaffold (WI-1666)** — create the loop-level eval/test harness before any staging flag flip; initially cover the dark/current-state behavior and the Challenge happy/partial/misconception seams with fixtures where live UI is still gated.
4. **S1 (WI-1464 + staging flip only)** — calibration + telemetry + rollback gates; no prod flip in this plan.
5. **S2 (WI-1445)** — one write at an existing persistence site, now backed by the axes preflight; turns verification into a scheduled promise.
6. **S6 (WI-1502)**, **S3b/S3c (WI-1465/WI-1454)** — visible promise + recovery, in either order, with S8 cases added as they land.
7. **Promote S5a to WIs, then S5a/S5b** — artifact contract + writable/kept/cited notes + grading. S5a's Flow 3 (citation) still lands last inside that group, per felt-knowing spec, but S7 cannot begin until the artifact source/verification taxonomy exists.
8. **S7 (WI-1665)** — parent proof, once there is a verified artifact to show and the parent-visible surface is decided for the shipping target.
9. **S8 completion pass** — variants (a)-(d) (verified / partial / misconception / decay-retest) are delivered by WI-1666; the remaining variant (e) parent-proof completion pass is owned by WI-1793, blocked on WI-1658 and WI-1705.

## Out of scope

- Re-owning felt-knowing-loop, journal-redesign, or review-continuity segments — this spec sequences them.
- Concept-grain capture (`CONCEPT_CAPTURE_ENABLED`) — parked, separate product decision.
- The prod flag flip itself — operator-gated (S1 covers staging + calibration evidence only).
- Any migration. This spec is docs-only; slice-level schema changes (none currently identified beyond S5a's `evidence_links`, owned by review-continuity slice 2a) carry their own plans.

## Rollback

Docs-only change — revert the file. Each slice WI carries its own rollback note; S1's kill switch is the existing flag.
