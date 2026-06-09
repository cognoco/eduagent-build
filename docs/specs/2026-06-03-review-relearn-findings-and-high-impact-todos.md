---
title: Review & Re-learn — Findings + High-Impact Learning To-Dos
date: 2026-06-03
profile: code
spec: this document (findings capture from a verified code read, 2026-06-03)
status: findings — awaiting prioritization go-ahead (no build approved)
relates:
  - docs/_archive/plans/done/app evolution plan/2026-05-06-learning-product-evolution-audit.md (STALE — see Appendix B)
  - docs/plans/2026-05-30-topic-mastery-three-states.md (three-state model — SHIPPED)
  - memory: project_review_is_mentoring_backbone.md (ratified strategy)
  - memory: project_deadends_triage_and_subject_review.md (open per-subject-review fork)
---

# Review & Re-learn — Findings + High-Impact Learning To-Dos

## Purpose

Capture the full verified state of how **review** and **re-learn** work in EduAgent
today, and convert the gaps into a prioritized, evidence-backed list of high-impact
learning to-dos. Every claim below was read from code on 2026-06-03 (not from plan/spec
docs — the archived evolution audit is stale; see Appendix B). **No build is approved by
this document** — it is the "capture findings first" step. Sequencing and the strategic
fork are at the end.

**North star (ratified 2026-06-02, `project_review_is_mentoring_backbone.md`):** review is
the #2 most valuable feature after teaching. The learner must experience **one
relationship** — a tutor who *remembers them* ("last week you cracked X — has it stuck?"),
never "now we switch to review mode." "Feels like mentoring" = continuity + memory, warm
and low-stakes (a check-in, never a test you can fail). The deep per-subject conversation is
the backbone; the cross-subject tap-quiz Checkup is mere utility. Build order is firm:
**FEEL → CORRECT → LOAD-BEARING**, never the reverse.

---

## Part 1 — Verified current-state map

### The headline reframes

1. **The rigor layer is built end-to-end but DARK in production.** The entire Challenge
   Round (offer → state machine → grading → mastery stamp → learner-voice note → mobile
   cards) is gated behind `CHALLENGE_ROUND_RUNTIME_ENABLED`, which **defaults to `'false'`**
   (`apps/api/src/config.ts:140`). No production learner has ever seen it.
2. **"Review mode" no longer exists as an engine concept.** Effective modes are only
   `freeform | learning` (`packages/schemas/src/sessions.ts:263`; the resolver clamps to
   those two). `sessionType ∈ {learning, homework, interleaved}` (`session-enums.ts:23-27`;
   `'review'` is explicitly asserted invalid in `sessions.test.ts:187`). "review / practice /
   relearn" survive only as **UI vocabulary** that all funnels into a `learning` session.
3. **The SM-2 review clock IS live and load-bearing** (not shadowed) — fed by silent,
   in-session recall grading.
4. **Three-state mastery (Untouched → Learning → Mastered) is SHIPPED** — review now has a
   visible destination (`progress.ts:130-147`, three-segment bars in `ShelfRow`/`BookCard`/
   `library.tsx`).
5. **The deep mentoring review you ratified was never specced into the repo** — `docs/specs/`
   contains no subject-review or checkup-diagnostic file. It is strategy-stage only.

### "Is there logic for how hard it is?" — yes, on three unconnected axes (none review-specific)

| Axis | Controls | Source |
|---|---|---|
| **SM-2 urgency** | *Which* topic is due & *how overdue* — bands `strong/fading/weak/forgotten` by `daysElapsed ÷ interval` | `retention.ts:187-203` |
| **Escalation rung 1→5** | In-session difficulty climb (`teach-new → revisit → evaluate → teach-back → exit`); rung also picks a stronger LLM (Gemini-advanced floor at rung 4, OpenAI at 5) | `exchanges.ts:201,257-258`; `router.ts:324-328` |
| **Verification style** | Kind of rigor: `standard` / `evaluate` (Devil's-advocate) / `teach_back` (Feynman) | `exchanges.ts:227-228` |

A `mode:'review'` session has **no difficulty controller of its own** — it borrows the
teaching ladder.

### How "review" works

- **The clock.** Each topic gets a `retention_card` (ease 2.5, interval 1 day, `pending`;
  `retention.ts:42-54`). First correct recall stays `pending`; a *later* success →
  `verified`; a miss → `decayed`; **3 misses → `redirect_to_library`** (`retention.ts:138-139`).
  5 successes in a row = "Stable" (`STABILITY_THRESHOLD`, `retention.ts:35`). 24h anti-cram
  cooldown (`retention.ts:32`).
- **Grading (the thin part).** During a *normal* session, a substantive answer triggers a
  background job that grades that one answer 0–5 with an LLM seeing **only the topic title +
  one answer**, and **on LLM failure falls back to grading by character count**
  (`evaluateRecallQuality`, `retention-data.ts:148-181`, fallback at `:173,:179`). Dispatched
  once/session via `app/review.calibration.requested` (`session-exchange.ts:1113`), graded +
  persisted in `review-calibration-grade.ts:96-130`, which also stamps `mastered_at`
  (`stampMasteryOnVerify`, `:136-145`).
- **Cadence / triggers.** Spaced per-topic (interval grows on success). Two push crons:
  `recall-nudge.ts` (hourly cron, fires in a local 07:30–08:30 window, `pushEnabled` only,
  `:46-47,:96-98,:128-129`) **and** `review-due-scan.ts` (every 2h, requires `pushEnabled`
  **and** `reviewReminders=true`, `:46-47,:91-93`). Different dedup keys → **same-day
  double-push risk**. In-app: topic-screen CTA "Review this topic" / "Practice again"
  (`topic/[topicId].tsx:239-243`), which routes a `mode:'review'` session when overdue
  (`:446-458`); Practice-hub "Review topics"; the recall-test chat (`recall-test.tsx:22-30,
  108-124`); RetentionPill copy ("Still remembered" / "Getting fuzzy" / "Remembered after N
  days").
- **Result.** SM-2 clock advances, retention band updates, XP syncs, three-state progress
  recomputes (`progress.ts:130-147`).

### How "re-learn" works

- **Re-teaching, not re-assessment.** `relearn.tsx` lists **overdue** topics, asks the
  learner to "pick the topic that feels the shakiest" (`:82`), pick a teaching style, then
  starts a fresh teaching session (`:307-332`). It re-explains; it does not test.
- **Two weak-spot channels that don't meet.** SM-2 failure → `decayed` → overdue → Relearn
  picker. Challenge Round `partial`/`misconception` → `needs_deepening_topics`
  (`evaluation.ts:149-157`). The Relearn screen reads the *overdue* list, **not**
  needs-deepening — and the Challenge path is dark, so that channel produces nothing in prod.
- **Promotion ignores the signal:** `promotePendingDeepening` takes `_signal` (unused) and
  promotes every pending row regardless of which signal fired (`promotion.ts:27`).
- **Anomaly:** relearn sessions are inserted with a raw `db.insert`, bypassing `startSession`
  (`retention-data.ts:1115-1125`), so future session-start logic silently skips relearn.

### Mastery (Challenge Round) — dark but fully built

- Offered only when the learner is doing **well**: `struggleStatus==='normal'`, retention
  `strong` (or a high new-topic bar), correct-streak ≥ 2, ≥ 5 exchanges, quota gates
  (`trigger.ts:74-136`). **Strugglers can never trigger it** — and `struggleStatus` is
  derived from active `needs_deepening` rows + `failureCount`, so any pending weak spot locks
  the learner out.
- Server-graded per concept `solid|partial|missing|misconception`;
  `decideMasteryAndReview` stamps mastery **only when every concept is solid**
  (`evaluation.ts:169`); empty → `invalid` (`:131-139`); all-missing → `reteach`. A single
  `partial` blocks mastery entirely.
- On verify: `assessments` row (`verificationDepth:'transfer'`, `masteryChallengeVerifiedAt`,
  `session-exchange.ts:699-710`) + a learner-voice note drafted from the learner's own
  verified words (`validateEvaluationEventIds` replaces LLM quotes with real DB content,
  `evaluation.ts:82-126`).
- **Read-side demotion already exists** and is exactly the "good tutor re-checks" behavior:
  `resolveMasteryVerificationState` returns `fresh/stale/unverified`, where a weak spot
  created *after* the verification auto-stales the mastery (`verification.ts:56-71`, consumed
  at `progress.ts:461,1396`). This layer is **live** even while the write side is dark.
- Cooldown only fires after a **decline** (`lastOutcome===0`, `trigger.ts:128`) — **no
  cooldown after a completed round**, so a just-aced topic can be re-offered next session.
- Dead code: `challenge-round/persistence.ts` is a name-divergent duplicate, not imported in
  prod (live path uses private fns in `session-exchange.ts:680,713`).

### Recaps

- **Guardian-facing reporting, not learner review** (`recaps.ts:110` `listRecapsForParent` —
  child session summaries + a "conversation prompt" for the parent). The V1 "recaps" tab is
  guardian-only. Do not conflate with a learner review loop.

### Shipped-status at a glance

| State | What |
|---|---|
| **Live & triggered** | SM-2 engine; recall-test / relearn / topic-review surfaces; both push crons; three-state mastery (data + bars); RetentionPill proof copy; mastery read-side demotion |
| **Built but DARK** | Entire Challenge Round runtime (flag `CHALLENGE_ROUND_RUNTIME_ENABLED=false`) |
| **Data-only / planned** | Ordered path preview (`topicOrder` — API data exists, **zero mobile consumers**); second-session home teaser |
| **Absent (strategy only)** | Deep per-subject review diagnostic + cross-subject Checkup |
| **Dead code** | `challenge-round/persistence.ts` |

---

## Part 2 — High-impact learning to-dos

Each to-do: **impact** (why it matters / what it unlocks), **evidence** (current-state
anchor), **phase** (FEEL / CORRECT / LOAD-BEARING / CONTINUITY / CLEANUP / STRATEGY),
**lift** (S/M/L), **depends on**, **first concrete action**. Priority: **P0** =
unblocks the backbone or is a prerequisite; **P1** = high felt-quality win; **P2** =
correctness/cleanup that must precede load-bearing.

> **Failure-modes requirement (CH-MED).** Every RR here changes a learner-facing flow. When any
> RR graduates from a to-do to a spec, it MUST carry a State/Trigger/User-sees/Recovery row per
> the `CLAUDE.md` UX-resilience rule ("if the Recovery column can't be filled, the design isn't
> complete"). The `*Constraint (CH-…)*` notes below are the seed of those rows, not a substitute.

### Backbone — make review feel like one relationship (FEEL)

- **RR-1 — Replace "review mode" with a warm memory-callback opener. [P0 · FEEL · M]**
  - *Impact:* the single change that most directly kills the "now we switch to review mode"
    seam the north star forbids. Turns review into a continuation of the tutoring
    conversation.
  - *Evidence:* `topic/[topicId].tsx:446-458` hard-routes a separate `mode:'review'` session;
    continuity material (`learnerQuote` + validated event content) already captured at
    `evaluation.ts:82-126` but unused for openers.
  - *Depends on:* nothing (reuses existing session pipeline + SM-2 due read).
  - *First action:* spec a review-callback prompt block in `exchange-prompts.ts` fed by
    `retention` due-state + last `learnerQuote`; stop hard-routing `mode:'review'`; feature-flag
    and A/B against the current button.
  - *Constraint (CH-1 — outcome guard):* the opener MUST be conditioned on the learner's
    **actual last outcome**, not just the presence of a quote. `learnerQuote` is a *verified/solid*
    answer (`evaluation.ts:82-126`), so a naive "last week you cracked X" can confidently
    misremember a **miss** as a success — the one fatal failure for a "tutor who remembers you."
    Branch the copy: cracked-it / wobbled / first-time / long-gap, with a safe neutral default
    ("Want to circle back to X?") whenever the outcome or quote is missing or stale. A "remembers
    you" promise is only safe if it remembers *accurately*. Pairs with RR-13: a single last-quote
    callback without the cross-session thread (RR-13) feels canned within a few sessions — gate
    RR-1's richer copy on RR-13's minimal thread.

- **RR-2 — Enable + dogfood the dark Challenge Round in staging; read transcripts. [P0 · FEEL · S]**
  - *Impact:* the rigor layer is fully built but has never run, so we have **zero real
    transcripts** to judge whether it feels like a check-in or a test, and **nothing to
    calibrate against** (RR-6 depends on this). Prerequisite for ever going load-bearing.
  - *Evidence:* `config.ts:140` (`CHALLENGE_ROUND_RUNTIME_ENABLED` default `'false'`).
  - *First action:* flip the flag in **staging/Doppler stg only**, run real review sessions,
    read transcripts for feel. **Never flip prod here** (that is RR-12, the last step).

- **RR-3 — Consolidate the two push crons into one warm daily check-in. [P1 · FEEL · S]**
  - *Impact:* removes same-day double-push; replaces cold "topics fading" framing with a warm,
    low-stakes check-in tone.
  - *Evidence:* `recall-nudge.ts:46-47,96-98` and `review-due-scan.ts:46-47,91-93` scan the
    same overdue cards with different dedup keys.
  - *First action:* deregister one cron in `inngest/index.ts`; unify copy; respect
    `reviewReminders` consistently.
  - *Constraint (CH-2 — don't silently silence a cohort):* the two crons gate **differently**,
    verified in code — `recall-nudge.ts:96-97` requires `pushEnabled` **only**, while
    `review-due-scan.ts:91-93` requires `pushEnabled` **AND** `reviewReminders`. A learner with
    push on but `reviewReminders` off **currently receives the recall-nudge**. Adopting the
    stricter gate during consolidation would drop that whole cohort's review pushes with no
    notice — a behavioral regression dressed as cleanup. Treat this as a **product decision**, not
    a mechanical merge: if `reviewReminders` is the intended master switch for *all* review
    pushes, migrate the affected prefs (or surface the change); if not, keep the looser
    `pushEnabled`-only gate for the unified daily check-in. Decide explicitly before deregistering.

- **RR-4 — Re-teach in place on the 3rd failed recall instead of ejecting to the library. [P1 · FEEL/CORRECT · M]**
  - *Impact:* `redirect_to_library` reads as a punishment dead-end — the opposite of a warm
    check-in.
  - *Evidence:* `retention.ts:138-139` (`failureAction = '...redirect_to_library'`).
  - *First action:* route failure-3 into a guided re-teach within the same conversation;
    keep the SM-2 reset honest.
  - *Constraint (CH-3 — replace the dead-end with an off-ramp, not with no exit):*
    `redirect_to_library` reads as punishment, but it was also the **circuit-breaker**. In-place
    re-teach with no exit condition just swaps one dead-end for a worse one — a learner who
    genuinely isn't getting it hears the same concept re-explained on a loop. Define a **bounded
    escalation**: re-teach with a *different* style → if still failing, a warm "let's park this and
    come back" (honest SM-2 reset + graceful exit) → optionally loop the supporter. The goal is a
    *warm* off-ramp, never an unbounded loop.

- **RR-5 — System-suggested review ordering (stop making the learner self-diagnose). [P1 · FEEL · S]**
  - *Impact:* the relearn screen asks the person least able to self-assess to "pick the
    shakiest topic." Order by SM-2 urgency band + most-overdue instead.
  - *Evidence:* `relearn.tsx:82`; SM-2 bands already available (`retention.ts:187-203`).
  - *First action:* default the relearn list to a system-ranked order; keep manual pick as
    override (`feedback_human_override_everywhere`).
  - *Constraint (CH-LOW — preserve self-selection, don't disparage it):* knowing what you don't
    know *is* a learning skill, valuable for capable/older learners. Frame this as "default to
    system order, **preserve** self-selection," not "stop making the learner self-diagnose."
    The override already exists — keep it prominent, not buried.

### Correctness — make it true before it's load-bearing (CORRECT)

- **RR-6 — Calibrate the mastery bar + note-overlap threshold from real transcripts. [P1 · CORRECT · M · depends RR-2]**
  - *Impact:* the all-or-nothing mastery rule and the note-quality threshold are uncalibrated
    guesses; they cannot be tuned until the feature has produced rounds.
  - *Evidence:* one `partial` of 3 blocks mastery (`evaluation.ts:169`);
    `MIN_LEXICAL_OVERLAP_NOTE_DRAFT=0.4` is a TODO-flagged guess (`caps.ts`).
  - *First action:* histogram staging transcripts; decide whether "2 of 3 solid" warrants a
    softer outcome; run `pnpm eval:llm --live`.
  - *Constraint (CH-4 — staging calibration is provisional):* pre-launch there are no real
    learners (`project_pre_launch_no_users`); staging dogfooding yields **adult-team** transcripts,
    not 13–17-year-old phrasing or real forgetting curves. Thresholds tuned on engineers will
    mis-fire for the actual population. Label any staging-derived bar **provisional** and add a
    **post-launch recalibration gate** against real learner data before treating it as settled.

- **RR-7 — Fix the struggler lockout from re-verification. [P1 · CORRECT · M]**
  - *Impact:* the people who most need rigorous re-verification can never get a Challenge
    Round, because any pending weak spot flips `struggleStatus` off `normal`.
  - *Evidence:* `trigger.ts:80` (`struggleStatus !== 'normal'` → ineligible); struggle derived
    from active `needs_deepening` + `failureCount` (`session-exchange.ts` readiness call site
    `:2019-2046`).
  - *First action:* design an eligibility path that lets a recovering learner re-prove a
    previously-weak concept.
  - *Constraint (CH-5 — the re-prove path must stay low-stakes):* the lockout is not purely a
    bug — it also shields strugglers from an **all-or-nothing** test (one `partial` of three blocks
    mastery entirely, `evaluation.ts:169`). Routing a recovering learner into the same binary
    Challenge Round high performers get is exactly the "test you can fail" the north star forbids,
    aimed at the most fragile learners. The recovering-learner re-prove path must be **low-stakes
    and non-all-or-nothing** (e.g. per-concept re-verification that can partially succeed), not the
    standard Challenge Round. Reconcile with "a check-in, never a test you can fail" *in the
    design*, don't just remove the gate.

- **RR-8 — Add a completion cooldown for the Challenge Round. [P2 · CORRECT · S]**
  - *Impact:* a just-aced topic can be re-offered immediately in a new session — feels
    repetitive/nagging.
  - *Evidence:* cooldown written only on decline, `lastOutcome===0` (`trigger.ts:128`,
    `route-actions.ts:113-128`).
  - *First action:* write `challengeRoundCooldowns` on completion too.

- **RR-9 — Deepen recall-grading context. [P2 · CORRECT · M]**
  - *Impact:* grading from topic-title + one answer (with a character-count fallback) can't
    "feel like a mentor who knows what you said." Feed it curriculum context and prior answers.
  - *Evidence:* `evaluateRecallQuality` (`retention-data.ts:148-181`), fallback `:173,:179`.
  - *First action:* expand the grader prompt's context; replace the length-heuristic fallback
    with a safer default (e.g. "uncertain → re-ask," never a fabricated score).
  - *Constraint (CH-3b — re-ask must not reveal the machinery):* a visible re-ask of the *same*
    thing exposes the grading mechanism and breaks the smooth-mentor feel; the current char-count
    fallback at least doesn't interrupt. Specify the re-ask as **in-band and natural** (a mentor
    rephrases, never repeats verbatim), or silently defer the grade — not a conspicuous repeat.

- **RR-10 — Reconcile the two weak-spot channels in one re-learn surface. [P1 · CORRECT · M]**
  - *Impact:* SM-2 "overdue" and Challenge `needs_deepening` are separate lists; the Relearn
    screen only reads overdue. A learner's real weak spots are split across two places.
  - *Evidence:* `relearn.tsx` reads `useOverdueTopics`; needs-deepening from
    `evaluation.ts:149-157` + `promotion.ts`.
  - *First action:* merge needs-deepening topics into the relearn/review queue (note this only
    bears fruit once RR-2/RR-12 light the Challenge path).

- **RR-11 — Reconcile the two mastery axes. [P2 · CORRECT/DECISION · M]**
  - *Impact:* SM-2 `xpStatus:'verified'` (sustained recall) and `mastery_challenge_verified_at`
    (one-shot all-solid) are independent and never reconcile; per CLAUDE.md the challenge path
    deliberately does **not** write SM-2 verified. Decide the intended relationship before the
    flag flips, or the learner sees two unrelated "mastery" signals.
  - *First action:* design doc deciding whether a challenge-verify should feed the SM-2 clock
    (or remain a parallel "depth" axis surfaced distinctly).

### Continuity / memory — the backbone's missing tissue (CONTINUITY)

- **RR-13 — Build the cross-session memory thread + ordered path preview. [minimal thread P1 · full preview P2 · CONTINUITY · M→L]**
  - *Impact:* there is no "last week you cracked X — has it stuck?" anywhere, and after a
    session the learner sees only one next topic. The "here's how I'll build this with you"
    structure is unbuilt. **This is the north star's literal definition of the feature** ("feels
    like mentoring = continuity + memory") — so a *minimal* thread is not P2 filler; it's what
    makes RR-1's opener feel real instead of canned.
  - *Evidence:* `session-summary/[sessionId].tsx:1135` (single next topic); `topicOrder` has
    **zero mobile consumers**.
  - *Split (CH-MED — elevate the minimal thread):* **P1** — a minimal cross-session thread
    (last-outcome-aware callback material keyed off `nextReviewAt` + last `learnerQuote`) that
    RR-1's richer copy depends on; ship them together so the "remembers you" opener has substance.
    **P2** — the full `topicOrder` path-preview component and the multi-step "here's how I'll build
    this with you" structure.
  - *First action:* build the minimal thread alongside RR-1 (gate RR-1's branched copy on it);
    surface `topicOrder` as a path-preview component as the follow-on P2.

### Cleanup — drift to clear before load-bearing (CLEANUP)

- **RR-14 — Clear the mechanics drift. [P2 · CLEANUP · M]**
  - Delete/unify the dead `challenge-round/persistence.ts` duplicate (live path:
    `session-exchange.ts:713`). Collapse the dual 24h cooldown source of truth
    (`caps.ts CHALLENGE_OFFER_COOLDOWN_HOURS` vs `trigger.ts:22 CHALLENGE_OFFER_COOLDOWN_MS`).
    Route relearn through `startSession` (`retention-data.ts:1123`). Apply CLAUDE.md
    "sweep when you fix."

### Load-bearing — last, gated on all of the above (LOAD-BEARING)

- **RR-12 — Flip `CHALLENGE_ROUND_RUNTIME_ENABLED` in production. [P0-but-LAST · LOAD-BEARING · S · depends RR-2, RR-6, RR-7, RR-8, RR-14]**
  - *Impact:* turns on real mastery evidence and lets the counter-evidence demotion
    (`verification.ts:56-71`) drive the next-session callback. This **is** the un-shadowing.
  - *Guardrail:* do not reach this before FEEL + CORRECT are proven on staging transcripts.
    Add monitoring on `masteryChallengeVerifiedAt` write-rate + `needs_deepening`
    `source='challenge_round'` volume.

### Strategy — the unbuilt backbone (STRATEGY)

- **RR-15 — Spec the deep per-subject review diagnostic + cross-subject Checkup. [P0-strategy · depends user fork]**
  - *Impact:* the ratified backbone (`project_review_is_mentoring_backbone.md`) has no
    committed spec. This is the open design fork in
    `project_deadends_triage_and_subject_review.md`.
  - *Evidence:* `docs/specs/` confirmed to contain no subject-review/checkup file.
  - *First action:* await the user's fork decision (below), then write the spec.

---

## Part 3 — Sequencing & non-negotiables

**Order (FEEL → CORRECT → LOAD-BEARING):**
`RR-2, RR-1 (+ RR-13 minimal thread, shipped together), RR-3` (feel) → `RR-6, RR-7, RR-9, RR-10,
RR-11` (correct) → `RR-14` (cleanup) → `RR-12` (load-bearing, last). `RR-4, RR-5, RR-13 full path
preview (P2)` run in parallel as felt-quality wins. `RR-15` is gated on the user's strategic fork.

> **Note (CH-MED):** RR-1 and RR-13's *minimal* thread are no longer independent — RR-1's
> branched, outcome-aware opener depends on the minimal memory thread to avoid feeling canned, so
> they ship as one FEEL unit. Only RR-13's full path-preview component stays P2/parallel.

**Non-negotiables / out of scope:**
- Do **not** flip `CHALLENGE_ROUND_RUNTIME_ENABLED` in **production** before staging
  transcripts are read and calibrated (RR-12 is the last step).
- Do **not** regress the V0 5-tab nav (`MODE_NAV_V0_ENABLED=off`) — orthogonal hard
  constraint (`project_nav_contract_preserve_v0_off.md`).
- Do **not** change SM-2 scheduling semantics as a side effect (`reviewDueCount`, decay).
- LLM prompt changes are eval-gated: run `pnpm eval:llm` before commit.
- Keep the Checkup (utility) tiered below the deep subject conversation (backbone) — don't let
  the tap-quiz become what "review" means.

---

## Part 4 — Open strategic fork (for the owner)

The very next move is a FEEL step. Choose one (or redirect):

- **A — Spec the warm-review opener first (RR-1):** the single change that most directly turns
  review into one relationship; needs no flag flip.
- **B — Enable + dogfood the dark Challenge Round in staging first (RR-2):** gather real
  transcripts so the mastery bar and note threshold can be calibrated before anything goes
  load-bearing.

Either path → I write the spec and wait for go-ahead before touching code.

---

## Appendix A — Verified code anchors (load-bearing)

- SM-2 engine: `retention.ts:32,35,42-54,74-147,138-139,187-203`
- Recall grading: `retention-data.ts:148-181`; dispatch `session-exchange.ts:1113`; grade+persist+stamp `review-calibration-grade.ts:96-145`
- Effective mode / session type: `sessions.ts:198-200,263`; `session-enums.ts:23-27`; `sessions.test.ts:187`
- Difficulty axes: `exchanges.ts:201,227-228,257-258`; `router.ts:324-328`
- Challenge Round: `config.ts:140`; `trigger.ts:22-29,74-136,128`; `evaluation.ts:82-126,128-186,169`; `state.ts:45-171`; `caps.ts`; `session-exchange.ts:259-274,680,699-710,713-789,2019-2046`; `verification.ts:56-71`; `route-actions.ts:113-128`; dead `persistence.ts`
- Three-state mastery: `progress.ts:130-147,308-309,453,461,719-720,1135-1136,1396`; `ShelfRow.tsx`/`BookCard.tsx`/`library.tsx`
- Re-learn: `relearn.tsx:82,307-332`; `promotion.ts:23-75,27`; `retention-data.ts:1115-1125`; `recall-test.tsx:22-30,108-124`
- Triggers/cadence: `recall-nudge.ts:46-47,96-98,128-129`; `review-due-scan.ts:46-47,91-93`; `topic/[topicId].tsx:239-243,446-458`
- Recaps (guardian): `recaps.ts:110`
- Continuity gap: `session-summary/[sessionId].tsx:1135`; `topicOrder` (0 mobile consumers)

## Appendix B — Doc-drift flag

`docs/_archive/plans/done/app evolution plan/2026-05-06-learning-product-evolution-audit.md`
is correctly archived as done, but its **Section G claim that no "remembered after N days"
elapsed copy exists is FALSE** against current code (`RetentionPill.tsx:54-63`,
`en.json:1755-1757` ship it). It is a first-turn/onboarding audit, not a review-state
reference — do not read it as current review state.
