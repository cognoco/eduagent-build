# The Subject Review — Deep Diagnostic — Design Spec

- **Date:** 2026-06-02
- **Status:** Draft (awaiting review) — adversarial review applied 2026-06-02 (findings folded in inline, tagged `[HIGH-n]` / `[MEDIUM-n]` / `[LOW-n]`).
- **Author:** brainstorm session (Zuzana + Claude)
- **Sibling spec:** [`2026-06-02-checkup-diagnostic-review-design.md`](./2026-06-02-checkup-diagnostic-review-design.md) — read it first. The Checkup and the Subject Review are **one system with two evidence front-ends**; this spec only describes the *thick* probe and the shared grading spine.

> **Adversarial review summary (2026-06-02).** Three Pass-1 (HIGH) issues must be
> resolved before the plan: **[HIGH-1]** the reused evaluation shape carries no topic
> attribution, so per-topic aggregation is undefined (see *The grading harness*);
> **[HIGH-2]** `useStartRelearn({ topicId })` is not a valid call — reuse is a navigation
> handoff to `topic/relearn.tsx` (see *Ending menu* and the screen table); **[HIGH-3]** the
> clock-*write* persistence path is unspecified and, if it routes through the `recall-test`
> endpoint, re-creates the Checkup's double-write/cooldown/XP collision (see *How outcomes
> retune the clock*). Pass-2 corrections (wrong hook name, a non-existent function in the
> open questions, missing reconciliation provenance, envelope array cap, `source` type) are
> tagged inline.

## Problem

The app runs a real spaced-repetition schedule — every studied topic has a retention
card with its own memory clock (`nextReviewAt`), and the SM-2 maths
(`packages/retention/src/sm2.ts`) lengthens or shortens the gap from a 0–5 quality
grade. **The scheduling side is genuine and already graded and bidirectional.** What is
missing is an *honest per-topic grade* feeding it: today a blanket session quality is
smeared across every reviewed topic (see the Checkup spec's Problem section), so a topic
the learner keeps fumbling can still drift further out.

The Checkup fixes this with a quick, **cross-subject** 2-question sweep. But the app is
**voice-first and conversation-first**, and a real teaching conversation is far richer
evidence than two questions: you watch the learner reconstruct an idea unaided, stumble,
and re-explain. That richness is the strongest retention signal available — *if* it is
harnessed. This spec defines the **learner-initiated, single-subject, deep
conversational review** that produces that signal and feeds the same clock the Checkup
feeds, weighted higher because the evidence is stronger.

## What the Subject Review is

A **learner-initiated sit-down**: "review my Biology." The mentor walks a handful of the
subject's faded topics in one conversation, leading with **cold recall** (reconstruct it
unaided) *before* any re-teaching, grades each topic from what the learner actually said
— via the Challenge-Round harness, not a vibe score — and retunes each topic's memory
clock from that evidence. Weak topics route into the existing relearn flow.

It is the **thick probe**. The Checkup is the thin probe. They share one spine:
select due topics → produce per-topic verdicts → map verdict→quality→SM-2→clock.

## Relationship to the Checkup (one system, two front-ends)

| | **Checkup** (thin) | **Subject Review** (thick) |
|---|---|---|
| Trigger | system-surfaced quick card | **learner chooses to start** |
| Scope | up to 4 due topics **across subjects** | the faded topics **within one subject** |
| Evidence | tap-question (recognition) + one explain-it | **harnessed conversation**: per-concept recall verdicts with quote anchors |
| Confidence | lower — weighted less | **higher — weighted more** |
| Clock write | per-topic quality → SM-2 | per-topic quality → SM-2 (same path) |
| Relearn handoff | navigate → `topic/relearn.tsx` → `useStartRelearn` | same (navigation handoff, **not** a bare `useStartRelearn({ topicId })` call — see [HIGH-2]) |

> **[HIGH-2] Relearn reuse is a navigation handoff, not a one-arg hook call.** Throughout
> this spec "→ `useStartRelearn({ topicId })`" is shorthand and is **not literally callable**.
> `useStartRelearn` (`apps/mobile/src/hooks/use-retention.ts:165-193`) takes `{ topicId,
> method, preferredMethod? }`, and `relearnTopicSchema` is `.strict()` requiring `method:
> 'same' | 'different'` (plus `preferredMethod` when `'different'`)
> (`packages/schemas/src/assessments.ts`). Reuse is by **`router.push` to `topic/relearn.tsx`**
> (which renders the method picker and then calls the hook) — identical to how the Checkup
> ending menu and the Practice "Review" card already open relearn. Cheap, but a route push,
> not a bare hook call. (The Checkup spec already carries this correction; it is repeated
> here because this spec restated the uncorrected form.)

"The failed subject review counts more and feeds the Checkup" is implemented as: both
write through the **same per-topic verdict→quality→`processRecallResult` path**, and the
Subject Review is permitted to emit stronger qualities (push intervals further out on
solid; relearn-flag on genuine loss) because its evidence is richer and harnessed.

## Goals

1. Let a learner deliberately sit down and review a single subject conversationally.
2. Produce an **honest per-topic verdict** from the conversation, anchored to real
   learner utterances (Challenge-Round harness), never a free-text 0.0–1.0.
3. Retune each topic's memory clock from that verdict, through the **existing** SM-2 path.
4. Make the conversation the **primary, highest-confidence** retention signal — weighted
   above the Checkup — while sharing one schedule, one grading spine.
5. Reuse existing machinery (topic selection, recall grading, the evaluation harness,
   relearn handoff, the orphaned urgency + daily-plan surfaces). Minimal new surface.
6. **Ship contamination-clean and zero-risk first** (shadow mode), then flip on the clock
   write once real transcripts exist to calibrate against.

## Non-goals

- Not a mentor-woven probe. This is a *chosen sit-down*, precisely so recall can be
  measured **before** teaching (see Contamination control). The ambient in-session
  continuation probe stays as-is and is out of scope here.
- Not a new grading engine. SM-2 (graded, bidirectional, per-topic) already exists and is
  reused unchanged. We only supply it an honest per-topic quality.
- Not a mastery gate. `decideMasteryAndReview`'s all-solid-or-block logic is **not**
  reused; retention movement is graded, not all-or-nothing.
- Not a subject-level clock. Everything is graded and written at the **topic** level;
  "subject" is only the selection scope and the framing.

## How it works — the learner's journey

1. **Entry (learner-initiated).** The learner opens a subject and taps **"Review what's
   stuck"** (exact copy TBD; positive-framing only — never "weak/struggle"). The
   invitation is also *surfaced* — see Surfacing — but starting is always the learner's
   choice.
2. **Pull.** The app selects the subject's most-faded topics (a single-subject variant of
   the interleaved selector). Cap small (e.g. 3–5) so the sit-down stays short.
3. **Per topic — cold recall first.** The mentor asks the learner to reconstruct the
   topic unaided ("what do you remember about photosynthesis?"). The learner's answer is
   captured as a `sessionEvents` `user_message` **before any re-teaching happens.**
4. **Grade from the conversation.** The LLM proposes per-concept verdicts
   (`solid | partial | missing | misconception`), each citing an `answerEventId` +
   `learnerQuote`. The server validates every id against real session events and
   aggregates the concept verdicts into one **per-topic quality** (see Grading harness).
5. **No teaching during the review (Model A).** The review only probes and grades — it
   never teaches mid-session. All re-teaching happens afterward via the relearn handoff
   (step 7). This is what makes the grade contamination-proof by construction.
6. **Result.** A warm summary ("Nice — 4 came back strong. Cell respiration could use
   another pass."). Positive framing only.
7. **Ending — menu (mirrors the Checkup).** Weak topics appear as a tappable list; tapping
   a row **navigates to the relearn screen** (`topic/relearn.tsx`), which owns
   method-selection and then calls `useStartRelearn`. Closing is a valid ending: every clock
   is already retuned. **[HIGH-2]** This is a navigation handoff, **not** `useStartRelearn({
   topicId })` — the hook requires `{ topicId, method, preferredMethod? }` and its schema is
   `.strict()` requiring `method` (see the correction under *Ending menu* and the screen
   table).

## Entry model & doors (one verb, two grains, smart default)

Decided in brainstorm 2026-06-02. **The end user never chooses between "Checkup" and
"Subject Review" as named features** — that choice has no basis for them and is the main
confusion risk. There is one idea — *"review what's stuck"* — expressed in **two grains the
learner already understands:**

- **Review this subject** — the thick conversational deep-dive (this spec).
- **Review this topic** — a thin single-topic check (revives the orphaned `recall-test.tsx`
  engine; see the dead-ends triage — screen was dead-endable, engine is load-bearing).

Grain is decided by **where the learner taps from**, and the high-confidence case is
**surfaced automatically**, so they usually don't choose at all.

| Tap from | Verb | Grain | Engine |
|---|---|---|---|
| Subject tile on **Home** → `progress/[subjectId]` (subject detail, `LearnerScreen.tsx:719-720`) | Review this subject | subject | this spec's deep-dive |
| **Home** smart card (auto-surfaced) | (auto) Review topic **or** subject | **picked by the router** | topic-check **or** deep-dive **or** spread-mix |
| **Practice** home → existing "Review due" button (`practice/index.tsx:515`) | Quick checkup | **across subjects** | the Checkup (sibling spec) — light graded sweep, feeds per-topic clocks |
| **Library** → book/topic (`shelf/[subjectId]/book/[bookId]`, existing `handleStartReview`) | Review this topic | topic | single-topic check |
| Bottom-nav **Progress** tab | — | — | **not** a review door (may not list subjects) |

- The "Review this subject" affordance lives on the **subject-detail screen**
  (`progress/[subjectId]/index.tsx`), reached primarily via the Home subject tile and the
  Home smart card. It deliberately does **not** depend on the bottom-nav Progress tab,
  which may not surface subjects at all.
- **Library = browse context → topic grain; subject detail = status context → subject
  grain.** The grain follows the surface's purpose, so the verb rarely needs conscious
  choosing.

### The smart default (gravity router)

The Home card auto-picks **both grain and scope** so the learner usually taps one obvious
thing. It reuses the orphaned `subject-urgency.ts` brain (`rankSubjectsByUrgency`, zero
*production* importers today — see [LOW-1]). The routing question is simply **"where is the gravity in the faded
pile?"**, and the answer chooses the *grain* — the card can surface a single topic, a whole
subject, or a mix:

- **One topic stands out** — a single overdue topic is the clear issue, its subject
  otherwise fine → surface **Review this topic** (the thin single-topic check), named:
  *"Photosynthesis is fading — quick look?"* Don't escalate one topic into a whole-subject
  sit-down.
- **One subject dominates** — several topics in the same subject have faded together (e.g. 6
  Biology topics stale, studied as a block ~10 days ago, untouched since) → surface **Review
  this subject** (the deep-dive), named: *"Biology's gone quiet — review it?"*
- **Spread** — faded topics scattered thin across many subjects, none dominant → surface the
  **cross-subject sweep** (the Checkup) as a light mix: *"Ready for a quick review?"* The
  sweep's *deliberate* home is the **Practice "Review due" button** (the Checkup, sibling
  spec); the Home card here is just the *auto-surfaced* version of that same sweep on a
  spread day.
- **No signal** — early user / nothing meaningfully faded → no review CTA; "keep learning."

So the card is one slot with three possible faces (topic / subject / mix) plus silence —
the learner always sees the *smallest sufficient* review for what's actually faded, never a
grain heavier than the situation warrants.

Discipline (so "smart" doesn't become "arbitrary"):

- **Ship the obvious-cases-only router**, not a tuned weighted score. One subject clearly
  dominates → dive; else sweep. Hold the full urgency weighting off until shadow-mode usage
  justifies the weights — pre-launch we cannot calibrate them (same calibration problem as
  the clock write).
- **Legible + overridable** ([[feedback_human_override_everywhere]],
  [[feedback_quiet_defaults_over_friction]]): the card names *what and why*; the auto-pick is
  a default, not a rail — the learner can pick a different subject, drill a single topic, or
  dismiss. Smart default + visible reason reads as "the app is paying attention," not "a slot
  machine."

This is what dissolves the "two confusing features" risk: the learner sees one verb at the
grain they tapped, plus a smart, explained suggestion they can always overrule. The build
cost of "smart" over "make the user pick" is marginal — the ranking brain
(`subject-urgency.ts`) and the surface (`dailyPlanSchema` + CoachBand) already exist; the
substantial work is the measurement engine behind the verb, which is built regardless.

## Surfacing (wiring the orphans)

The cost of "learner-initiated" is discoverability. Two **existing-but-orphaned** pieces
become the front door so the review is invited, not hidden:

- **`subject-urgency.ts`** (`calculateUrgencyScore` / `rankSubjectsByUrgency`,
  **[LOW-1]** zero *production* importers — only `subject-urgency.test.ts` imports it today)
  — ranks which subject is most faded
  (`overdueRecallCount*3 + weakForgottenCount*2 + daysSinceLastSession*0.5`). This selects
  *which subject* to surface a review invitation for. **Selection-authority note:** the
  Checkup's "≥2 due topics" gate and this urgency score must not disagree about what's
  urgent — the plan picks one ranking authority feeding both surfaces (see Open questions).
- **`dailyPlanSchema`** (`packages/schemas/src/progress.ts:604`, a complete
  `{ greeting, items: (review|continue|streak)[≤4], streakDays }` contract with **no route
  serving it**) — a `review`-type `dailyPlanItem` on the home plan becomes the surfaced
  invitation ("Biology: 4 topics fading — review?"). Tapping it starts the review; it
  never auto-starts.

Both are *surfacing* only. Neither grades anything; the schedule and verdicts remain the
single authority.

### Surfacing cadence (anti-nag — non-negotiable for the invite)

The invite must never feel repetitive. Three gates, all required:

1. **Grace before surfacing.** A subject's review is eligible to appear as a CTA only once
   it has been **pending > 3 days** (i.e. >3 days past the earliest due topic's
   `nextReviewAt`). Don't nag the moment something falls due. **[LOW-2]** Note this is a
   *new* computation — "days since the subject's earliest due topic fell due" is **not** one
   of `subject-urgency`'s inputs (`overdueRecallCount`, `weakForgottenCount`,
   `daysSinceLastSession`); the surfacing layer must derive earliest-`nextReviewAt`-age per
   subject separately.
2. **Re-surface cooldown.** Once shown, the **same** subject's review is **not surfaced
   again for ≥ 7 days**, regardless of staleness. (So eligibility window per subject: shown
   at >3 days pending, then silent for 7 days before it can reappear.)
3. **Rotation when several are due.** If multiple subjects qualify, pick one **not surfaced
   in the previous 3 sessions** — rotate rather than repeat. The LLM/selector chooses among
   the eligible, not-recently-surfaced set; `subject-urgency` breaks ties.

**Reuse:** the "mark surfaced / was-surfaced" tracking already exists for coaching cards —
`useMarkQuizDiscoverySurfaced` / `useQuizDiscoveryCard` (`hooks/use-coaching-card`,
consumed in `LearnerScreen.tsx`). The review-invite surfacing should reuse that
surfaced-tracking infra rather than invent a parallel one. (Infra confirmed present in
`LearnerScreen` imports; internals not personally read — verify before building.)

**Where it slots:** the home **CoachBand** is already a single-slot "Recommended" surface
with a priority order (recovery → resume → review-fade → quiz-discovery,
`LearnerScreen.tsx:383-479`). The subject-level review invite replaces/extends today's
single-topic `review-fade` branch (which currently routes to `topic/relearn`). It stays one
slot; the cadence gates above decide whether it shows at all.

> **Interpretation note (confirm):** the "> 3 days / ≥ 7 days" split is read as *grace
> before first surfacing* (3d) vs *re-surface cooldown* (7d). If the intent was a single
> 3–7 day window, adjust gates 1–2 accordingly.

## Screen-by-screen flow (v1, Model A)

Framing: today **"Review" everywhere means *relearn* (re-teach)** — both the home CoachBand
and the Practice "Review" card route straight to `topic/relearn` with no measurement step.
The subject review is the **missing measure-half**: it grades what's still remembered, then
hands the weak topics to the relearn flow that already exists.

| # | Screen | Status | What happens |
|---|---|---|---|
| 0 | Home — `LearnerScreen` (`components/home/LearnerScreen.tsx`) | **EXISTS** | Either the CoachBand surfaces a subject-level invite ("Biology — 4 topics fading, review?", gated by Surfacing cadence) **or** the learner taps a subject tile → `progress/[subjectId]`. Invite never auto-starts. |
| 1 | Subject screen — `progress/[subjectId]/index.tsx` | **EXISTS → ADD** | The existing **Retention card** (`progress-subject-retention-card`) becomes the entry: "Memory check — N topics could use a look · **Review what's stuck →**". One new affordance on a real screen. |
| 2 | Review intro + pull | **NEW** | Warm framing ("tell me what you remember, no studying first") while the single-subject selector pulls the faded topics. Sets the recall-before-anything contract. |
| 3 | Review conversation | **NEW** (built on the `recall-test.tsx` chat UI) | `ChatShell` with voice in/out + an "I don't remember" escape (already present in `recall-test.tsx`). Per topic: one open cold-recall question; answer captured as the gradeable `user_message`. **No teaching during the pass** (Model A). |
| 4 | Quiet progress | **NEW** (part of 3) | Light "2 of 4" pacing; never a score, never "failed". |
| 5 | Results | **NEW** | Warm summary, positive-framing only ("3 came back strong; 2 could use a pass"). In shadow mode looks identical but doesn't move clocks yet. |
| 6 | Ending menu | **NEW** (mirrors Checkup ending B) | Faded topics as a tappable list; tap to refresh now, or close (valid ending — clocks already retuned). |
| 7 | Relearn — `topic/relearn.tsx` | **EXISTS** | Each tapped topic does `router.push` to `topic/relearn.tsx` (`{ topicId, subjectId, returnTo: 'subject-review' }`); that screen owns method-selection and then calls `useStartRelearn({ topicId, method, preferredMethod? })`. **[HIGH-2]** Not a bare `useStartRelearn({ topicId })` call. Back → returns to the subject screen, whose retention card now reflects the fresh grade (Phase 1+). |

Net: **5 new screens, 2 reused, 1 new button on an existing screen.** Teaching reuses the
existing relearn flow entirely.

## The grading harness (the load-bearing part)

This is the "objective logic and harness around the conversation" requirement. It lifts
the proven Challenge-Round pattern and adapts the *decision* for retention.

**Reused from Challenge Round, unchanged:**

- **Evidence shape** — `ChallengeRoundEvaluationItem` (`@eduagent/schemas`): per-concept
  `result: solid | partial | missing | misconception`, each with `concept`,
  `answerEventId`, `learnerQuote`, `evidence` (required), optional `correction`. **[MEDIUM-4]**
  The envelope array `signals.challenge_round_evaluation` is capped at `.max(10)`
  (`llm-envelope.ts:256`), and the persisted `evaluations` array is also `.max(10)`
  (`schemas/src/sessions.ts:173`). A 5-topic review at ~2–3 concepts each can **exceed 10 in
  a single envelope** → silently truncated/rejected verdicts. Resolve by running **one
  evaluation turn per topic** (preferred — pairs with [HIGH-1] option b and keeps each
  envelope single-topic) or by raising the cap with a justified new bound.
- **The anchor / anti-hallucination guard** — `validateEvaluationEventIds`
  (`challenge-round/evaluation.ts:82`): re-fetches the real learner text from
  `sessionEvents` scoped by `profileId`, requires every `answerEventId` to be a genuine
  `user_message` in *this* session, and **rejects the whole evaluation if any id fails**.
  The LLM cannot grade on text it invented. This is non-negotiable. The *contract* is reused
  verbatim, but the **return shape must be extended** — see [HIGH-1] below: today the
  function returns only the validated items with `learnerQuote` swapped for real content
  (`evaluation.ts:113-125`); it does **not** surface `sessionEvents.topicId`, which the
  multi-topic aggregation requires. "Reused verbatim" was too strong; the guard logic is
  reused, the projection is widened.

> ⚠️ **[HIGH-1] The reused evidence shape carries no topic attribution — per-topic
> aggregation is currently undefined.** `ChallengeRoundEvaluationItem`
> (`packages/schemas/src/llm-envelope.ts:210-217`) is `{ concept, result, evidence,
> answerEventId, learnerQuote, correction? }` — **there is no `topicId`**. Challenge Round
> never needed one because a Challenge Round is about a *single* topic, so every concept
> implicitly belongs to it. The Subject Review walks **3–5 topics in one conversation** and
> must aggregate *a topic's* concept-verdicts into one per-topic quality — but nothing in the
> reused shape says which topic a `concept` belongs to. This is recoverable, but only by
> design, not by free reuse:
> - `sessionEvents.topicId` exists (`packages/database/src/schema/sessions.ts:196`) but is
>   **nullable**. The orchestration must **stamp each captured cold-recall `user_message`
>   with the currently-probed `topicId`** — a contract Model A makes tractable (one topic
>   active at a time) but which the spec must state explicitly, not assume.
> - `validateEvaluationEventIds` must be **extended to also return each event's `topicId`**
>   (it currently returns only content as `learnerQuote`). `decideRetentionFromEvaluation`
>   then groups concepts by that verified `topicId` before aggregating. Without this the
>   server literally cannot route a verdict to a topic clock.
> Resolution is a **Pass-1 design decision**: either (a) add `topicId` to the evaluation
> item and validate it against `sessionEvents.topicId`, or (b) run **one evaluation turn per
> topic** so each envelope is single-topic by construction (cleaner, mirrors Challenge
> Round, but more LLM round-trips). Pick one in the plan.

**New (small, retention-specific):**

- **`decideRetentionFromEvaluation`** — replaces `decideMasteryAndReview` for this flow.
  Concepts belong to a topic; this aggregates a topic's concept-verdicts into **one
  per-topic SM-2 quality (0–5)**, graded — *not* all-or-nothing:

  | Topic's concept mix | Per-topic quality (illustrative — exact values are a plan detail) | Clock effect |
  |---|---|---|
  | all `solid` | 5 | push the gap furthest out |
  | mostly `solid`, ≤1 `partial` | ~4 | push out, slightly less |
  | mixed `partial` | ~3 | short interval — comes back soon |
  | any `misconception`, or mostly `missing` | ≤2 | reset to near-zero + relearn-flag |
  | all `missing` (couldn't answer at all) | 0–1 | reset + relearn-flag |

  `partial` / `misconception` concepts also file into `needs_deepening_topics` with
  `source = 'subject_review'`. **[MEDIUM-5]** The DB column `needs_deepening_topics.source`
  is free `text()` defaulting to `'system_signal'` (`assessments.ts:182`), so a new value is
  fine at the schema layer — **but** the TypeScript carrier `ReviewTarget.source`
  (`challenge-round/evaluation.ts:45`) is a hard literal `'challenge_round'` and must be
  **widened to a union** before it can carry `'subject_review'`. And the Checkup's
  `'checkup'` source this says to "mirror" **does not exist yet** — both specs are drafts;
  this is a coordination dependency on the Checkup PR, not "existing machinery."

- The resulting per-topic quality is fed to `processRecallResult(state, quality)`
  (`retention.ts:74`) → `sm2()` → clock. No new scheduling math.

> ⚠️ **[HIGH-3] Name the sole clock writer — `processRecallResult` does not persist, and
> the obvious persister collides with the Checkup's flagged double-write.**
> `processRecallResult` (`retention.ts:74`) is a **pure** function: it returns `newState`
> and never touches the DB. The spec stops at "→ clock" without naming what writes
> `newState` to the retention card. The existing persister `processRecallTest`
> (`retention-data.ts`) is **not** a safe target — exactly as the Checkup spec's ⚠️ note
> documents, it (1) writes SM-2 to the card itself, (2) enforces the 24h FR54 cooldown, and
> (3) fires XP/mastery side-effects per call. Routing the Subject Review's grade through it
> would double-write the clock and burn the cooldown the reconciliation section is trying to
> share. **Decision for the plan:** the verdict path must be the **sole** clock writer for
> this flow — call `processRecallResult` (pure) and persist `newState` through a dedicated
> write that does *not* re-grade, *not* re-run the recall-test endpoint, and *not* re-fire
> XP. The `useSubmitRecallTest` hook (which posts to `recall-test`) must **not** be used as
> the grading path here — see [MEDIUM-1].

## How outcomes retune the clock — and multi-source reconciliation

Single source is solved by the table above (verdict → quality → existing SM-2). The
**genuinely new** problem — two sources grading the same topic — is resolved by these
rules (the only part with no existing precedent):

1. **Confidence ordering.** Subject-Review evidence > Checkup evidence > blanket session
   grade. A more-confident source's quality supersedes a less-confident one for the same
   topic within a window. **[MEDIUM-3]** "Supersede within a window" requires persisted
   **provenance** the retention card does not currently store: `RetentionState`
   (`retention.ts:8-18`) has no last-grading-`source` / confidence-tier / grade-timestamp
   field. The plan must add that provenance (a column on the retention card or a small
   grading-event ledger) — without it the server cannot tell *which* source last moved a
   clock, and "supersede" is unimplementable. (Provenance also makes the shadow-vs-live audit
   in Phase 0 queryable, and avoids a repeat of the untracked ledger-drift class of bug.)
2. **Cooldown sharing.** Reuse the existing 24h anti-cramming cooldown
   (`canRetestTopic`, `RETEST_COOLDOWN_MS`, `retention.ts:167`) **across** sources so a
   Checkup right after a Subject Review can't double-move the same clock. Exact policy
   (block vs feedback-only) is an Open question.
3. **No wrong-direction writes.** As in the Checkup, a failed save leaves the clock
   untouched (topic stays due) rather than guessing.

## Shadow-mode rollout (how we de-risk the unsolved parts)

The contamination, calibration, and "counts more" weighting concerns all only bite *when
we write the clock*. So v1 does not write it:

- **Phase 0 — shadow.** Ship the full review: learner-initiated, cold-recall-first,
  harnessed per-topic verdicts produced and **persisted**, results summary shown — but the
  verdict→quality→clock write is **disabled** (behind a flag). This validates the
  behaviour (does anyone sit down for a review?), stays 100% contamination-clean and
  risk-free, and **accumulates the exact transcripts + verdicts needed to calibrate** the
  verdict→quality table and the cross-source weighting before any real clock moves.
- **Phase 1 — live.** Once shadow data shows the verdicts are trustworthy and calibrated,
  flip the flag so verdicts move the clock (single-source first).
- **Phase 2 — reconcile.** Enable cross-source reconciliation (review supersedes Checkup)
  and Checkup-as-sweep-tier weighting.

## Contamination control (non-negotiable)

The richness of a conversation is also its risk: a learner can "recall" something the
mentor just nudged or taught 30 seconds earlier. The grade must count **only the first
unaided attempt, before any teaching/nudging on that concept** this session.

**Hard constraint discovered during verification:** the `session_event_type` enum
(`packages/database/src/schema/sessions.ts:31-51`) has no "the mentor taught concept C"
event — teaching is unstructured `ai_response` prose. The server therefore **cannot infer
"teaching happened" by reading events.** Ordering can only be policed against a
**structured boundary event the orchestration deliberately emits**, never against prose.
This is the load-bearing mechanism; it must be designed in, not assumed.

Two enforceable structures:

- **(A) Clean-pass — CHOSEN for v1.** The graded portion is a pure unaided-recall pass —
  ask, capture, move on; **no nudging/teaching during the review at all**. Teaching is
  entirely deferred to the relearn handoff at the end. Because no teaching happens during
  the review, contamination is impossible *by construction* and no boundary event is even
  needed — every `user_message` in the review session is eligible. Simplest, cleanest, and
  it keeps the review purely a *measurement* surface. Cost: during grading it reads more
  like a thoughtful spoken Checkup than a flowing teaching conversation. (Accepted.)
- **(B) Rich teach-as-you-go — deferred (future).** The natural teach-as-you-go
  conversation, but each concept's verdict is computed only from the learner's attempt
  **before that concept's first nudge/teach** — which requires a **per-concept boundary
  marker** (a new structured `session_event_type`). Preserves richness *and* a clean grade,
  at real harness cost. Revisit only if usage shows learners want teaching inside the
  review rather than via the relearn handoff.

Either way, the eligible-event filter runs **server-side alongside
`validateEvaluationEventIds`**: an `answerEventId` after its concept's boundary is
ineligible and the verdict for that concept is discarded (not guessed).

**Honest residual (not mechanically solvable):** a *leading* probe question ("what do you
remember about how chlorophyll absorbs light?") leaks the answer regardless of ordering.
Mitigated by probe-prompt design ("ask, never reveal"); cannot be enforced by the harness.
Name it as a known limitation, not a solved problem.

## Architecture & reuse

**Reused as-is:**

- **Recall/clock spine** — `processRecallResult`, `getRetentionStatus`, `isReviewDue`,
  `canRetestTopic`, `isTopicStable` (`apps/api/src/services/retention.ts`); `sm2`
  (`packages/retention/src/sm2.ts`).
- **Evaluation harness** — `validateEvaluationEventIds`, `ChallengeRoundEvaluationItem`,
  the envelope signal plumbing (`challenge-round/evaluation.ts`).
- **Topic selection** — a single-subject variant of `selectInterleavedTopics`
  (`apps/api/src/services/interleaved.ts`) — *per the Checkup spec; not personally
  re-read for this draft.*
- **Relearn handoff** — `useStartRelearn` (`apps/mobile/src/hooks/use-retention.ts:165`),
  reached by navigating to `topic/relearn.tsx` (see [HIGH-2]). **[MEDIUM-1]** There is **no
  hook named `useRecallTest`** — the recall-grading mutation is `useSubmitRecallTest`
  (`use-retention.ts:135`), and it posts to the `recall-test` endpoint that self-writes the
  clock + cooldown + XP. The Subject Review does **not** grade through it (grading is
  server-side via the envelope harness); it is listed here only to name what is deliberately
  *not* on the grading path (see [HIGH-3]).
- **Needs-deepening persistence** — `needs_deepening_topics` + the capacity helpers
  (`canExitNeedsDeepening`, `checkNeedsDeepeningCapacity`, `adaptive-teaching.ts`, already
  live via `retention-data.ts`).

**Reused for surfacing (orphans revived):**

- `subject-urgency.ts` — subject ranking for the invitation.
- `dailyPlanSchema` (`packages/schemas/src/progress.ts:604`) — the `review` card contract.

**New (small surface):**

- `decideRetentionFromEvaluation` — concept-verdicts → per-topic SM-2 quality (graded),
  **grouped by verified `topicId`** ([HIGH-1]).
- An **extension to `validateEvaluationEventIds`** to also return each event's `topicId`
  ([HIGH-1]) — and/or a `topicId` field on `ChallengeRoundEvaluationItem`.
- Subject-review orchestration — runs cold-recall-first per topic, **stamps each captured
  `user_message` with the active `topicId`** ([HIGH-1]), collects verdicts, shows the
  results menu.
- A **dedicated clock-write path** that persists `processRecallResult`'s `newState`
  **without** re-grading / re-running the recall-test endpoint / re-firing XP ([HIGH-3]).
- Cross-source reconciliation + shared-cooldown policy + **persisted grading provenance**
  on the retention card ([MEDIUM-3]).
- The shadow-mode flag and verdict-capture persistence.
- A single-subject topic-selector variant + the entry point on the subject screen.
- A `ReviewTarget.source` type widening to admit `'subject_review'` ([MEDIUM-5]).

**Explicitly NOT reused:** `decideMasteryAndReview` (mastery all-or-nothing logic) and the
blanket-session grading path the Checkup is built to replace.

## Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Nothing faded | subject has no due/faded topics | "Review what's stuck" hidden or disabled | normal study; returns when topics fade |
| LLM can't grade a topic | model/network failure mid-review | that topic skipped quietly, not failed | review continues; skipped topic keeps its clock |
| Evaluation fails the anchor check | any `answerEventId` not a real session event | the topic's verdict is discarded (treated invalid) | clock untouched for that topic; never a guessed write |
| Learner says "I don't remember" | explicit on cold-recall | treated as a genuine `missing`, warmly | routed per verdict; re-teach offered |
| Learner abandons mid-review | closes app / navigates away | no penalty; graded topics keep new clock (Phase 1+) | ungraded topics keep existing clock |
| Save fails at result time | connectivity drop | result shown from local state | retried on reconnect; worst case clock not retuned — topic stays due |
| Relearn handoff fails | `useStartRelearn` errors | existing relearn error fallback | retry / back to menu; other weak topics still tappable |

## Open questions for the plan

1. **Concept→topic quality mapping.** Exact SM-2 quality values per concept-mix, and how
   many concepts a topic is probed on per review.
2. **Selection authority.** Does `subject-urgency`'s formula become the single ranking
   feeding *both* the daily-plan card and the Checkup gate, or do they stay separate? They
   must not disagree about what's urgent.
2a. **Router grain detection.** The Home smart card picks grain (topic / subject / mix), so
   the router needs a **topic-level standout** pass *and* the subject-level
   `subject-urgency` ranking — define the dominance thresholds (when is one topic "the"
   issue vs one subject vs spread?). Ship obvious cases only; defer tuned weights to
   post-shadow data. **[MEDIUM-2]** Topic signal source: `getProfileRetentionSummary`
   **does not exist** (no such symbol anywhere in `apps/` or `packages/`). The real
   per-topic retention signal is `getRetentionStatus(state)` (`retention.ts:187`,
   strong/fading/weak/forgotten) server-side, and `useReviewSummary` /
   `reviewSummary.totalOverdue` client-side (already powering the Practice "Review" card).
   Name the actual source in the plan.
3. **Cross-source reconciliation policy.** Precise rule when Subject Review and Checkup
   grade the same topic inside the shared 24h cooldown (supersede? block? feedback-only?).
4. **Endpoint shape.** Dedicated `POST /subject-review` (recommended) vs overloading an
   existing route. Must emit per-topic grades, never blanket.
5. **Counts as a completed session?** Streak/XP treatment and which completion event it
   emits. Default yes.
6. **Shadow→live gate.** What signal from shadow data authorises turning on the clock
   write (sample size, agreement between shadow verdicts and subsequent real outcomes).
7. **Contamination structure — RESOLVED: Model A (clean-pass), no teaching in the
   review.** Because no teaching happens during the review, no boundary event is needed for
   v1. (Model B / teach-as-you-go is deferred; if revisited it needs a per-concept
   `session_event_type` boundary, since ordering is not enforceable from `ai_response`
   prose alone.)

## Out of scope / future

- **Mentor-woven (in-session) graded probing** — different product; contamination is
  baked in there. Not this spec.
- **Subject-level rollups** in the result ("Biology is slipping") — only honest once
  enough topics are probed.
- **Teach-as-you-go inside the review (Model B)** — deferred; v1 measures only, teaching
  is the relearn handoff. Revisit only if usage shows learners want it.
- **Auto-started reviews** — always learner-initiated; the invite only invites, never
  starts a review on its own.

## Verification status (for the implementer)

Personally read and confirmed for this draft: `retention.ts`, `sm2.ts`,
`challenge-round/evaluation.ts`, `subject-urgency.ts`, `dailyPlanSchema` in `progress.ts`,
`adaptive-teaching.ts`, and the Checkup spec. **Not personally re-read** (taken from the
Checkup spec, verify before building): `interleaved.ts` / `selectInterleavedTopics`,
`session-completed.ts` blanket-grading path, `qualityRatingFromSummaryStatus`.

**Adversarial-review pass (2026-06-02) additionally verified in code:**
`use-retention.ts:135,165` (real hooks are `useSubmitRecallTest` + `useStartRelearn`, the
latter requiring `{ topicId, method, preferredMethod? }`) — [HIGH-2]/[MEDIUM-1];
`llm-envelope.ts:210-217,256` (`ChallengeRoundEvaluationItem` has no `topicId`; array
`.max(10)`) — [HIGH-1]/[MEDIUM-4]; `sessions.ts:196` (`sessionEvents.topicId` exists,
nullable); `evaluation.ts:45` (`ReviewTarget.source` is literal `'challenge_round'`) and
`assessments.ts:182` (`needs_deepening_topics.source` is free `text()`) — [MEDIUM-5];
`retention.ts:8-18` (`RetentionState` has no grading-provenance field) — [MEDIUM-3];
`getProfileRetentionSummary` **does not exist** (grep of `apps/`+`packages/` empty) —
[MEDIUM-2]; `subject-urgency.ts` imported only by its test — [LOW-1].
