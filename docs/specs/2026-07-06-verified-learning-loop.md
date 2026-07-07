# Verified-Learning Loop — Loop Map & Slice Plan (WI-1657)

**Status:** Draft — AC1 deliverable of WI-1657 (Define and ship the full verified-learning loop) · 2026-07-06
**Branch baseline for citations:** `main` @ `54501f7fb` (all file:line read from code 2026-07-06, not from docs)
**Relates:**

- `docs/specs/2026-06-27-felt-knowing-loop.md` — owns the note-authoring / freeform-keep / citation glue (segments it owns are *sequenced*, not re-owned, here)
- `docs/_archive/specs/Done/2026-06-08-memory-task-review-continuity.md` — Tier 1 shipped (`retrieval_events`, review opener); slice 2a (`evidence_links` + `LearnerSource`) decided, not built
- `docs/specs/2026-06-03-review-relearn-findings-and-high-impact-todos.md` — RR-N register this spec maps onto WIs
- `docs/_archive/plans/done/2026-05-30-topic-mastery-three-states.md` — shipped Untouched → Learning → Mastered model
- `docs/plans/v2-plan/00-STATE-OF-PLAY.md` §5–§6 — the "knows-me" loop orientation
- `docs/adr/MMT-ADR-0031-challenge-verification-and-sm2-are-complementary-mastery-axes.md` — proposed axes ruling for S4 / WI-1469
- `docs/adr/MMT-ADR-0032-verified-learning-artifacts-require-source-and-verification-state.md` — proposed artifact provenance contract for S5a / S7

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
- **Correctness grading of learner notes: GAP.** The note-correctness plan (grade notes, marks UI, save-as-note) is captured as WI-1491; it was parked 2026-06-08 pending the identity baseline reset, which has since landed on staging + prod — re-verify unparking at execution.
- **Artifact taxonomy: GAP.** Challenge-drafted notes, learner-authored notes, and freeform "keep this" artifacts must not collapse into one generic note type. Parent proof may only consume an artifact with explicit source + verification state, e.g. `source='challenge_solid_quote'` with `verificationState='verified'`. Ordinary learner notes remain learner-authored study material until WI-1491 or a later grader marks them.

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
| S5b | Grade learner notes, marks UI, save-as-note | Segment 3 correctness | **WI-1491** (note-correctness T1–T13 umbrella; verify unparked post-baseline-reset) | Captured |
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
9. **S8 completion pass** — the umbrella remains open until verified / partial / misconception / decay-retest / parent-proof variants all assert the assembled loop.

## Out of scope

- Re-owning felt-knowing-loop, journal-redesign, or review-continuity segments — this spec sequences them.
- Concept-grain capture (`CONCEPT_CAPTURE_ENABLED`) — parked, separate product decision.
- The prod flag flip itself — operator-gated (S1 covers staging + calibration evidence only).
- Any migration. This spec is docs-only; slice-level schema changes (none currently identified beyond S5a's `evidence_links`, owned by review-continuity slice 2a) carry their own plans.

## Rollback

Docs-only change — revert the file. Each slice WI carries its own rollback note; S1's kill switch is the existing flag.
