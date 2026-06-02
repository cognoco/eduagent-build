# The Checkup — Diagnostic Review — Design Spec

- **Date:** 2026-06-02
- **Status:** Draft (awaiting review)
- **Author:** brainstorm session (Zuzana + Claude)

## Problem

The app already runs a real spaced-repetition schedule: every studied topic has a
retention card with its own "memory clock" (`nextReviewAt`), and the SM-2 maths
(`packages/retention/src/sm2.ts`) lengthens or shortens the gap based on a quality
grade. The scheduling side is genuine.

**The grade feeding it is not.** When a due topic gets "reviewed" today, the
completion pipeline applies one session-level quality to the topic regardless of
whether the learner actually remembered anything — `qualityRatingFromSummaryStatus`
maps `accepted → 4`, `submitted → 2`, and the `update-retention` step in
`apps/api/src/inngest/functions/session-completed.ts` grades **every**
`retentionTopicIds` entry with that **same** `effectiveQuality`. A per-topic
`derivedQualityRating` only exists for `evaluate`/`teach_back` verification, which a
plain review doesn't produce. So the clock is flying blind: a topic the learner keeps
fumbling can still drift *further out*, because the schedule never hears that it went
badly.

Separately, there is a fully built but **stranded** endpoint —
`POST /sessions/interleaved` (`apps/api/src/routes/sessions.ts`, service
`apps/api/src/services/interleaved.ts`) — that selects due topics across subjects and
starts a mixed session. It has no mobile entry point, and its completion path uses the
same uniform grading described above. It is wired-but-untriggered: exactly the
anti-pattern the repo warns against.

## What the Checkup is

A short, friendly **diagnostic**: a quick graded probe across a handful of due topics
that *measures* — rather than assumes from the calendar — which topics have actually
faded. It then retunes each topic's memory clock with that real evidence and offers a
one-tap path to refresh the weak ones. It is the **measurement step the schedule has
been missing**: the clock surfaces what's due → the Checkup measures how solid each
one really is → that measurement resets each clock → the clock decides when the next
Checkup is worth doing.

It deliberately reuses the existing interleaved **topic-selection** logic, but
**replaces** the interleaved session's uniform-grading completion with **per-topic
grading**.

## Goals

1. Measure real recall on up to 4 due topics, spread across different subjects.
2. Turn each measurement into an honest per-topic verdict: **solid / review / relearn**.
3. Retune each topic's memory clock from that verdict (not from a blanket assumption).
4. Give a warm, no-pressure result and a one-tap handoff into the existing relearn flow.
5. Reuse existing machinery (topic selection, recall grading, relearn handoff) — minimal
   new surface area.

## Non-goals

- Not a full study session. It probes; it does not teach. Teaching is the relearn handoff.
- Not a subject-level diagnosis. Everything is measured, pinned, and named at the
  **topic** level (topics are merely *drawn from* different subjects for variety).
- Not a replacement for the schedule. The schedule still decides who is due; the Checkup
  only supplies a better grade.
- No multiple-topic "guided march" through relearns (see Ending — option A rejected).

## How it works — the learner's journey

1. **Entry.** The Checkup is the Practice screen's review door — it **upgrades the existing
   "Review" button** (`practice/index.tsx:515`, which today routes straight into
   `topic/relearn` with no measurement step) rather than adding a *second* review card
   beside it (two review buttons on Practice would re-create the confusion the one-verb model
   avoids). The review-reminder notification routes here instead of home. Card hint: ~3
   minutes. (Cross-spec: this is the **cross-subject** door; the single-subject deep dive and
   single-topic check live on the subject/library surfaces — see the Subject Review spec's
   *Entry model & doors*.)
2. **Pull.** The app selects up to **4 due topics**, drawn from across subjects where the
   due set allows. (Caveat: the reused selector *randomises* rather than guaranteeing
   subject spread, and *pads with not-yet-due topics* when fewer than 4 are due — both are
   flagged in *Architecture & reuse* and *Open questions*; they are not free.)
3. **Per topic — the ladder** (see next section). One quick tap-question; on success, one
   explain-it-in-your-own-words question; on a miss, one more tap as a bad-luck net.
4. **Result.** A warm summary, e.g. *"Nice work — 3 down solid. Fractions and Spanish
   greetings could use a refresher."* Positive framing only; never "weak/struggle/failed".
5. **Ending (the menu).** Weak topics appear as a tappable list. Tap one to refresh it now
   via the existing relearn flow; leave the rest; or close the screen. Closing is a valid
   ending because every clock has already been retuned — skipped topics resurface
   naturally in the normal review pile.

## The grading ladder (per topic)

```
Quick tap-question #1 (multiple choice — recognition, objective grade)
├─ RIGHT → Explain-it question (recall, graded by the recall-test brain)
│         ├─ Explains it well      → SOLID
│         └─ Can't really explain  → REVIEW
└─ WRONG → Second quick tap-question (bad-luck safety net)
          ├─ Now right             → REVIEW   (one slip, one save — shaky)
          └─ Wrong again           → RELEARN  (both missed — genuinely lost)
```

Design rationale (agreed in brainstorm):

- The **tap-question** tests *recognition* (spotting the answer) — the weakest evidence,
  and it is objective/instant to grade. It is used as a cheap **screen**, never as the
  final verdict on its own.
- The **explain-it** question tests *recall* (reconstructing it unaided) — the strong
  evidence, and the thing the voice-first app is built around. It is what separates
  **solid** from **review**.
- The **second tap** exists only to guard against one unlucky question sending a topic all
  the way to a full relearn. It separates **review** from **relearn**.
- Every question earns its place; the final verdict leans on the strong evidence, not the
  weak. Cap of **two questions per topic** on every path.

## How outcomes retune the memory clock

Each verdict maps to a per-topic schedule update (the precise SM-2 quality values are an
implementation detail for the plan; the *behaviour* is fixed here):

| Verdict | Meaning | Clock effect |
|---|---|---|
| **solid** | recognised *and* could explain | push the gap **further out** — leave them alone longer |
| **review** | recognised but couldn't rebuild, or a one-slip recovery | reset to a **short** gap — comes back around soon |
| **relearn** | missed both taps — genuinely lost | reset to **near-zero** + flag for a proper re-teach |

This is the loop that fixes the Problem: a fumbled topic now actually pulls *itself* back
in, instead of drifting further out under a blanket "went fine" grade.

## The ending — menu (option B)

Three shapes were considered: **A** a guided march through every weak topic back-to-back;
**B** a tappable menu the learner chooses from; **C** silent (summary only, no action).
**B is chosen** — it fits the product's quiet-defaults / human-override / no-dead-ends
principles, and it is the cheapest to build:

- The results screen is a **pre-filtered list of topic IDs** (the ones that flunked).
- Each row, when tapped, does `router.push({ pathname: '/(app)/topic/relearn', params: {
  topicId, subjectId, returnTo: 'checkup' } })` — **exactly how the Practice "Review" card
  already opens relearn** (`practice/index.tsx:514-517`). The relearn *screen*
  (`topic/relearn.tsx`) then runs `useStartRelearn` after the learner picks a method.
  - Correction: the Review card does **not** "ride on `useStartRelearn`" directly, and the
    hook does **not** accept `{ topicId }` alone. `relearnTopicSchema` is `.strict()` and
    requires `method: 'same' | 'different'` (plus `preferredMethod` when `'different'`)
    (`packages/schemas/src/assessments.ts:213-231`); `useStartRelearn` signature is
    `{ topicId, method, preferredMethod? }` (`use-retention.ts:165-193`). Reuse is by
    **navigating to the relearn screen** — which owns the method-selection UI — not by
    calling the hook with a bare topic id. Still cheap, but it is a navigation handoff, not
    a one-arg hook call.
- Closing the screen is explicitly a valid ending. Nothing is mandatory.

Option A was rejected: chaining multiple relearn sessions is brand-new orchestration that
does not exist today, and it herds a tired learner. Option C was rejected: it discards the
diagnosis→action payoff.

## Architecture & reuse

**Reused as-is:**

- **Topic selection** — the interleaved selector (`selectInterleavedTopics` in
  `apps/api/src/services/interleaved.ts`): finds due retention cards and **randomises**
  them (`interleaved.ts:105-118`). Cap lowered from 5 to **4** for the Checkup. Two
  behaviours of the reused function break promises made elsewhere in this spec and are
  **not** free reuse:
  - ⚠️ **It does NOT spread across subjects.** It shuffles the due cards and slices; there
    is no per-subject grouping (the in-code comment is explicit: *"interleaving is the
    point — no grouping by subject"*, `interleaved.ts:54`). The "varied across subjects"
    promise (Goal 1, journey step 2) is **not** delivered by reuse. Either add subject-spread
    logic to a Checkup-specific selector or drop the promise. See Open questions Q6.
  - ⚠️ **It pads with not-yet-due topics when fewer than `topicCount` are due**
    (`interleaved.ts:110-118`). With the entry card gated at **≥2** due, a 2–3-due Checkup
    will probe not-yet-due topics — contradicting the "Not a replacement for the schedule …
    due" framing, the implicit due-only journey, and the "probing not-yet-due topics —
    deliberately deferred; v1 is due-only" out-of-scope item. Either cap `topicCount` to the
    actual due count, or pass a flag to disable padding for the Checkup. See Open questions Q7.
- **Recall grading** — `useSubmitRecallTest` (`apps/mobile/src/hooks/use-retention.ts:135`;
  there is no hook named `useRecallTest`): sends a topic + the learner's answer, returns a
  graded result, and already includes an *"I don't remember"* (`attemptMode: 'dont_remember'`)
  path. It *could* grade the explain-it question — **but the endpoint behind it is not safe
  to reuse as-is for the Checkup** (see the ⚠️ note below).
- **Relearn handoff** — `useStartRelearn` (`use-retention.ts:165`) → `topic/relearn.tsx`.
- **Due-topic counts for the entry card** — `useReviewSummary` / `reviewSummary.totalOverdue`
  (already powering the Practice "Review" card).

> ⚠️ **The recall-grading endpoint already owns the clock — reusing it as-is collides with
> the Checkup's own retune.** `processRecallTest`
> (`apps/api/src/services/retention-data.ts:762`) does three things this design does not
> account for:
> 1. **It writes SM-2 to the card itself** (`retention-data.ts:900-926` — easeFactor,
>    intervalDays, repetitions, nextReviewAt). Grading the explain-it question through this
>    endpoint **already retunes the clock**, so the spec's separate "per-topic verdict →
>    clock update" path becomes a **second, conflicting write** to the same card.
> 2. **It enforces a 24-hour anti-cramming cooldown (FR54)** (`retention-data.ts:814-833,
>    846-885`). A topic recall-tested within the last 24 h returns
>    `cooldownActive: true, passed: false` **without calling the grader**. The ladder has no
>    branch for "no grade returned" and would misread it as a miss (false REVIEW/RELEARN).
>    Two Checkups in a day — or one recent standalone recall test — corrupts the diagnostic.
> 3. **It fires XP / mastery side-effects per call** (`stampMasteryOnVerify`, xp_ledger sync,
>    practice-activity event, `retention-data.ts:946-983`), pre-empting Open question Q4.
>
> Resolution is a **Pass-1 design decision**, not an implementation detail: reuse the
> recall-grading *brain* (`evaluateRecallQuality`) rather than the full
> `POST /retention/recall-test` endpoint, **or** explicitly bypass the cooldown for the
> Checkup and make the verdict path the **sole** clock writer. See Open questions Q8.

**New (small surface):**

- **Tap-questions (multiple choice).** Generated per topic by the mentor (existing LLM
  routing); grading is **objective** (known correct option — no LLM judging needed for the
  tap step).
- **Checkup orchestration.** A client-side flow that walks the ladder per topic, collects
  the three-way verdicts, and shows the results menu.
- **Per-topic verdict → clock update.** A server path that applies the solid/review/relearn
  schedule effect per topic. This is the key departure from the interleaved session's
  uniform grading — see "Open questions for the plan".
- **Entry: upgrade the existing Practice "Review" button** (`practice/index.tsx:515`) to run
  the Checkup, gated to appear only when **≥ 2** due topics exist (when fewer, fall back to
  today's direct-to-relearn behaviour or hide). Do **not** add a second review card.
- **Notification retarget.** `apps/mobile/src/lib/notification-tap-navigation.ts:37` —
  `recall_nudge` / `review_reminder` / `nudge` / `daily_reminder` currently route to
  `/(app)/home`; point the review-intent ones at the Checkup entry instead.
  - ⚠️ **Gating mismatch — guard against a notification dead-end.** The Practice entry is
    gated to the ≥2-due rule (it lives on a screen that already knows the due-count), but
    notifications fire from **server-side schedules that do not evaluate that gate**. So the
    Checkup entry must resolve the **live** due-count when opened *from a notification* and
    fall back gracefully when fewer than 2 are due (direct-to-relearn at 1 due, "all caught
    up" at 0 due) — otherwise a "time to review" tap can land in an empty Checkup. See the
    *Notification opens Checkup with nothing to probe* row in Failure modes.

**Reused for selection only, NOT for completion:** the `POST /sessions/interleaved`
session/completion path (uniform grading) is the thing the Checkup is built to *replace*.
The plan decides whether to (a) repurpose the endpoint to emit per-topic grades or (b)
add a dedicated checkup endpoint and leave/retire the interleaved session route.

## Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Nothing due | fewer than 2 due topics | Checkup card hidden; Practice unaffected | normal study; card returns when topics fall due |
| Notification opens Checkup with nothing to probe | a review-intent push fires from a server-side schedule that does **not** evaluate the ≥2-due entry gate; learner taps it when 0–1 topics are due | should never see an empty Checkup | **must be designed**: the entry resolves the live due-count when opened *from a notification* and falls back — direct-to-relearn when exactly 1 is due, an "all caught up" state when 0 — rather than launching an empty Checkup. See the notification-retarget caveat in *Architecture & reuse*. |
| Mentor can't generate a tap-question | LLM/network failure mid-probe | that topic is skipped quietly, not failed | Checkup continues with remaining topics; skipped topic keeps its current clock |
| Learner taps "I don't remember" | explicit on explain-it step | treated as a genuine miss, warmly | routed to **review** (recognised) or **relearn** per ladder |
| Learner abandons mid-Checkup | closes app / navigates away | no penalty; topics answered so far keep their new clock | unanswered topics keep their existing clock; resurface when due |
| Topic in recall cooldown | recall-tested within last 24 h (FR54) | grader returns `cooldownActive`, no real grade | **ladder has no branch today** — must be designed: skip the topic, or grade via `evaluateRecallQuality` bypassing the cooldown (tied to ⚠️ recall-grading reuse / Q8) |
| Network error saving verdicts | connectivity drop at result time | result still shown from local state | verdicts retried on reconnect; worst case the clock simply isn't retuned (topic stays due) — never a wrong-direction update. **Holds only if the verdict path is the sole clock writer**; if grading goes through `recall-test`, the clock is already written at grade time (see ⚠️ / Q8) |
| Relearn handoff fails | relearn screen / `useStartRelearn` errors | standard relearn error fallback (existing) | retry / back to the menu; other weak topics still tappable |

## Open questions for the plan

1. **Verdict→quality mapping.** Exact SM-2 quality values (or direct interval/ease writes)
   for solid / review / relearn, and whether `relearn` also files into
   `needs_deepening_topics` (existing machinery) with `source = 'checkup'`.
2. **Endpoint shape.** Repurpose `POST /sessions/interleaved` for per-topic grades vs. a
   dedicated `POST /checkup` (+ per-topic result submission). Recommendation: a dedicated
   path so the uniform-grading session route is not overloaded.
3. **Tap-question generation.** Prompt + storage: generate on the fly per topic vs. cache;
   how distractor options are produced and validated as unambiguously wrong.
4. **Does a Checkup count as a completed session** for streak/XP? Default **yes**, like any
   finished session — confirm and decide which completion event it emits. Note: if the
   explain-it step reuses `POST /retention/recall-test`, that endpoint **already** grants/
   decays XP per topic (`stampMasteryOnVerify` + xp_ledger sync, `retention-data.ts:946-1009`)
   — decide whether that is the intended XP source or double-counts a session-level grant.
5. **Notification scope.** Which review-intent notification types retarget to the Checkup,
   and whether non-review notifications stay on `/(app)/home`. The home-routing set in
   `notification-tap-navigation.ts:31-37` is actually six types — `nudge`, `review_reminder`,
   `daily_reminder`, `recall_nudge`, `dictation_review`, `session_filing_failed` — not the
   four named earlier in this spec. `dictation_review` is arguably review-intent too;
   `session_filing_failed` is not. Name the exact set to retarget.
6. **Subject spread.** The reused `selectInterleavedTopics` does not group by subject (it
   randomises). Does the Checkup add a subject-spread pass (e.g. round-robin one card per
   subject before backfilling), or is randomised selection accepted and the "varied across
   subjects" copy softened? (Ties to HIGH finding on Goal 1 / journey step 2.)
7. **Due-only vs padding.** `selectInterleavedTopics` pads with not-yet-due topics when
   fewer than `topicCount` are due. To honour "v1 is due-only", the Checkup must either cap
   `topicCount` to the actual due count or pass a no-pad flag. Which?
8. **Recall-grading reuse boundary.** Reuse the recall-grading *brain*
   (`evaluateRecallQuality`) and let the new verdict path be the **sole** clock/XP writer,
   **or** reuse the full `recall-test` endpoint and (a) bypass its 24 h cooldown for the
   Checkup and (b) drop the redundant verdict→clock write? This is the load-bearing
   architecture decision behind the ⚠️ note in *Architecture & reuse*.

## Out of scope / future

- **Probing not-yet-due topics** to catch "I thought I still had this" before the clock
  would — deliberately deferred; v1 is due-only.
- **Subject-level rollups** in the result ("Maths is slipping") — only honest once enough
  topics per subject are probed; not v1.
- **A "guided march" mode** (ending A) — only if usage shows learners want back-to-back.
