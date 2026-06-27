# Paths 2+4+5 — Guided / Review / Relearn: Deep-Dive

> **STATUS (2026-06-27):** Partial — no SHIP-NOW items done; C1 (relearn method-picker cosmetic removal), C3 (orphaned recall-test screen deletion), and C4 (CTA intent copy) still open.

> Cluster scope: the "study this topic again" complex — Path 2 (Guided Learning), Path 4 (Practice/Review), Path 5 (Retention Relearn), plus the orphaned recall-test screen and the merge question at their centre. · Analyst: paths245 · Date 2026-06-10 · Sources verified at HEAD of `new-llm`.

**Verification key:** `[V]` = read the source line(s) myself this session; `[I]` = inferred from verified facts (reasoning stated).

**Headline correction up front:** the trusted doc's Path-4 caveat ("a plain review session may leave the retention card unchanged") is **STALE/REFUTED**. Review sessions grade live via `maybeDispatchReviewCalibration` → `review-calibration-grade.ts`, on a path that is **independent** of the verification-overlay `effectiveQuality` that the doc (and both hypothesis docs) reason from. Proof in §4. This changes the merge calculus materially.

---

## 1. Feature inventory (verified)

| Feature / branch | What it does | Status | Load-bearing? (why) | Evidence |
|---|---|---|---|---|
| **CTA label derivation** (`deriveStudyCTA`) | Picks label from `completionStatus` × `retentionStatus`: not_started→"Start studying", completed/verified/stable + strong→"Practice again", else→"Review this topic". | prod-active | Yes — the only learner-facing entry copy for a known topic. | `topic/[topicId].tsx:228-245` `[V]` |
| **CTA route-mode derivation** (`handleStudyPress`) | Picks route `mode` from `isOverdue` (`nextReviewAt < now`), **NOT** from label/retentionStatus: not_started→`learning`; overdue+completed/verified/stable→`review`; else→`learning` (or resume). | prod-active | Yes — label and mode are independent; "Practice again" (strong, non-overdue) routes `learning`, never `review`. | `topic/[topicId].tsx:438-482` `[V]` |
| **Active-session resume** | If an active/paused session exists, CTA resumes it (`resumeTarget` / `activeSession.sessionId`) instead of starting fresh. | prod-active | Yes — prevents orphaned half-sessions. | `topic/[topicId].tsx:465-481` `[V]` |
| **Review prompt override** (`REVIEW OVERRIDE`) | In review/practice mode, system prompt told to prefer source wording; analogies/outside examples gated at 0.88 factual-confidence. Not a hard block — a confidence gate. | prod-active | Yes — distinct pedagogy regime vs learning/relearn. | `exchange-prompts.ts:483-484,549-553,809,1111-1113` `[V]` |
| **Review calibration opener (client)** | review opener = "Let's review X. What do you remember in your own words?"; `showTimer: true`. | prod-active | Yes — distinct retention-probe opener + timer affordance. | `sessionModeConfig.ts:40-48,224-226` `[V]` |
| **Review calibration server prompt** | First learner-visible turn in review injects a TRANSITION PHRASE + CALIBRATION QUESTION block; FIRST TURN RULE suppressed. | prod-active | Yes — the server half of the review opener. | `exchange-prompts.ts:798-814` `[V]` |
| **Review live grading** (`maybeDispatchReviewCalibration`) | On a **substantive** calibration answer in review/practice mode, dispatches `app/review.calibration.requested`; Inngest grades via `evaluateRecallQuality` + `processRecallResult` and writes SM-2 to `retention_cards` (24h cooldown, mastery stamp, XP sync). | prod-active | **Yes — load-bearing; this is what makes review re-measure retention.** Independent of `effectiveQuality`. | `session-exchange.ts:1045-1150,2850`; `review-calibration-grade.ts:58-159` `[V]` |
| **Retention-aware starting rung** | First exchange uses `getRetentionAwareStartingRung`: forgotten→3, weak→2, else 1. | prod-active | Yes — but **shared**, not review-specific (any topic-bound session w/ a card). | `escalation.ts:112-120`; `session-exchange.ts:1995-1997` `[V]` |
| **Relearn recap anchor** | `startRelearn` returns most-recent populated `learnerRecap`; opener = "Last time you learned about X, we covered: [recap]… Want a quick quiz?" | prod-active | Yes — relearn's distinguishing opener. | `retention-data.ts:1136-1155`; `sessionModeConfig.ts:200-210` `[V]` |
| **Relearn SM-2 baseline reset** | Post-session `relearn-retention-reset` step resets card to baseline (ease 2.5, interval 1, reps 0, failures 0) **before** `update-retention` SM-2 advance. Gated: `mode==='relearn' && exchangeCount>0 && effectiveQuality!=null && topicId`. | prod-active | Yes — semantically the OPPOSITE of review (reset-to-zero vs advance). | `session-completed.ts:636-678` `[V]` |
| **Relearn method picker** (visual/step/real-world/practice) | UI picks a teaching method → sends `method:'same'\|'different'` + `preferredMethod` to `startRelearn`. | prod-active | **NO — cosmetic. `startRelearn` only echoes `preferredMethod` back in the response; it is NEVER written to `teaching_preferences`.** | `relearn.tsx:35-79,274-363`; `retention-data.ts:1057-1178` (no `setTeachingPreference` call) `[V]` |
| **Relearn `needs_deepening` insert** | `startRelearn` conditionally inserts a `needs_deepening_topics` row (`status:'active'`, no `source` → schema default `'system_signal'`) if none active. | prod-active | Yes — but it BLOCKS Challenge Round for the topic (see §1 next row). | `retention-data.ts:1069-1110`; schema default `assessments.ts:182` `[V]` |
| **Challenge-Round block from relearn** | Any active `needs_deepening_topics` row → `struggleStatus !== 'normal'` → Challenge ineligible. Resolves via `updateNeedsDeepeningProgress` after **3** consecutive quality≥3 completions (source-agnostic — resolves the `system_signal` row too). | prod-active | Yes — block is real but **self-healing** through the normal pipeline (doc says "UNVERIFIED/persists" — partly refuted). | `trigger.ts:80-81`; `session-exchange.ts:2049-2054`; `retention-data.ts:1432-1471`; `adaptive-teaching.ts:140-141` (EXIT=3) `[V]` |
| **recall-test screen** | Chat recall check; pass→library, 3 fails→RemediationCard→relearn. Engine `processRecallTest` live. | **orphaned** | Screen NO; **engine YES** (load-bearing for the recall-test flow + relearn CTA). | `recall-test.tsx` (whole); zero in-app `router.push`/`href` to it (grep `[V]`) |

---

## 2. Complexity map

### 2.1 User-felt complexity (three near-synonym surfaces)

A learner who has studied a topic and comes back to it can land in **three** different sessions that all feel like "go over this again," chosen by hidden state they never see:

- **"Review this topic"** (Path 4): appears on the topic-detail sticky CTA *only when the topic is overdue* (`nextReviewAt < now`). Header says "Review", shows a **timer**, opener asks "what do you remember?". `[V]`
- **"Practice again"** (Path 2): appears on the *same* CTA when the topic is `strong` and **not** overdue — but routes `mode=learning`, i.e. an ordinary teaching session with a generic opener. Same button position, different word, completely different session. `[V]`
- **Relearn** (Path 5): reached from Practice hub "Review Topics", the overdue home/library banner, book "Start Review", or a recall-test failure. Opens a **method picker** (4 tiles) the learner reads as a meaningful choice — then opens a recap-anchored session. `[V]`

The learner cannot predict which of these they'll get, and two of the three labels ("Review", "Practice again") sit on the *same pixel* on the topic screen. The method picker presents a fourth fake decision on top.

### 2.2 Hidden complexity (prompt regimes, SM-2 writers, pipeline steps)

- **Two prompt regimes**, not three: `learning` and `relearn` share the standard learning prompt (general knowledge permitted); `review`/`practice` get the REVIEW OVERRIDE + calibration server block (source-discipline, FIRST TURN RULE suppressed). `[V exchange-prompts.ts:483-484,549-553,798-814]`
- **Two opposite SM-2 semantics on the same table**: review **advances** the card (via calibration live-grade, and/or `update-retention` if quality present); relearn **resets** the card to baseline first, then advances. A merged surface must pick one — they are contradictory. `[V review-calibration-grade.ts:102-130 vs session-completed.ts:636-678]`
- **Three independent SM-2 write paths touch this cluster's cards**: (a) review calibration live-grade (`review-calibration-grade.ts`), (b) post-session `update-retention` (verification-overlay `effectiveQuality`), (c) relearn reset. These are the cluster's slice of the ~9-10 writers the spec §8.3 retention gate targets. `[V]`
- **One self-healing block**: the relearn `needs_deepening` insert blocks Challenge Round, but the standard `update-needs-deepening` pipeline step resolves it (source-agnostic) after 3 good completions. `[V]`
- **Pipeline divergence**: relearn adds the `relearn-retention-reset` step (omitted from the old doc); everything downstream is shared. `[V session-completed.ts:636]`

### 2.3 Load-bearing vs incidental verdict

| Element | Verdict |
|---|---|
| Review calibration live-grade | **Load-bearing** — it is the mechanism that makes "Review" re-measure retention. Removing/merging carelessly regresses SM-2 correctness. |
| Relearn baseline reset | **Load-bearing** — "I forgot this, start me over" is a distinct, intentional SM-2 semantic. |
| Review timer + REVIEW OVERRIDE prompt | **Load-bearing** — genuinely distinct affordance + pedagogy. |
| Retention-aware starting rung | **Load-bearing but shared** — not a review/relearn differentiator; keep, but don't count it as merge cost. |
| CTA label↔mode independence | **Incidental complexity** — defensible behavior, confusing presentation. Exposing intent costs nothing pedagogically. |
| Relearn method picker | **Incidental — pure illusion.** Never persisted. Safe to delete. |
| `needs_deepening` block on relearn | **Incidental friction** — self-heals, but blocks ambient checks for up to 3 sessions for no user benefit. |
| recall-test screen | **Incidental (orphaned)** — engine load-bearing, screen unreachable. |

---

## 3. Hypothesis audit (claims from proposed/diff docs on this cluster)

| Claim (source line) | Verdict | Evidence |
|---|---|---|
| "A **review session frequently records no SM-2 update** (`effectiveQuality` null → step skips)" (proposed §5 L19, L135; diff L301, L385) | **REFUTED** | The overlay path *is* suppressed in review (`!isReviewMode`), so `update-retention` often skips — but review has an **independent** live-grade path (`maybeDispatchReviewCalibration` → `review-calibration-grade.ts`) that writes SM-2 from the calibration answer regardless of `effectiveQuality`. Both hypothesis docs inherit the stale flows-doc premise. `[V session-exchange.ts:1045-1150,2850; review-calibration-grade.ts:96-159]` |
| "Make review **always produce a non-null `effectiveQuality`** … derive quality from the calibration opener" (proposed L141-142; diff Q6 L385) | **PARTIAL / already largely done** | The calibration opener *already* produces a graded SM-2 write — just not via `effectiveQuality`. The remaining gap is narrower: a **non-substantive** calibration answer (e.g. "idk") does NOT grade (skip at `:1094`), and a review with no calibration answer at all writes nothing. So "always writes" is not yet true, but "frequently writes nothing" is false. |
| "Relearn **method-picker is never written back** (cosmetic)" (proposed L19; diff L373) | **CONFIRMED** | `startRelearn` reads prior pref on `method:'same'` and echoes `preferredMethod` into the response, but never calls `setTeachingPreference`/`PUT teaching-preference`. `[V retention-data.ts:1057-1178]` |
| "Fix the Challenge-Round block — resolve `needs_deepening` on relearn completion" (proposed L156) | **PARTIAL** | The block is real, but the existing `update-needs-deepening` step is source-agnostic and resolves the relearn row after 3 quality≥3 completions. It is not "permanently blocked" — it is "blocked for up to 3 sessions." A targeted fix can shorten this; it is not the open correctness hole the docs imply. `[V retention-data.ts:1432-1471; adaptive-teaching.ts:141]` |
| "recall-test screen — **RETIRE the screen, KEEP the engine** (load-bearing for relearn)" (proposed/diff L226,L370) | **CONFIRMED** | Zero in-app navigation reaches the screen (grep over `apps/mobile/src` finds only the file, its tests, a `_layout` comment, and the API hook). `processRecallTest` engine is live and used by the recall-test API + remediation flow. `[V]` |
| "Collapse Path 4 Review **MERGE into Relearn** → one 'Go over again' that does record SM-2" (proposed L51,L221; diff L317-319) | **PARTIAL / contested** — see §5. The merge reconciles two *opposite* SM-2 semantics (advance vs reset) and two opener regimes; it is not a clean collapse. The diff doc itself wobbles (L319 says "review KEEP — the one mode with a distinct affordance"). | `[V]` |
| "overdue→review is the right SM-2 behavior; the fix exposes intent, not removes the branch" (proposed L114) | **CONFIRMED** | The label↔mode independence is defensible; the issue is presentation, not logic. `[V topic/[topicId].tsx:438-482]` |

---

## 4. Current-doc corrections (`learning-path-flows.md`)

1. **Path 4 "Recording caveat" (lines 294) is the cluster's central staleness.** It states: *"`effectiveQuality` is often `null`, and the post-session `update-retention` SM-2 step skips … a plain review session may leave the retention card unchanged."* **REFUTED.** Review grades live via a separate path:
   - `maybeDispatchReviewCalibration` fires for `effectiveMode === 'review' \|\| 'practice'` with a topicId+topicTitle (`session-exchange.ts:1057-1059`), on a **substantive** calibration answer (`:1061,1094`), once per session (`reviewCalibrationFiredAt` guard `:1082`), with a `MAX_REVIEW_CALIBRATION_ATTEMPTS` cap for non-substantive answers (`:1095`). It `safeSend`s `app/review.calibration.requested` (`:1137`).
   - It is actually called in the live exchange path: `session-exchange.ts:2850` (inside `processMessage`/`streamMessage`).
   - The handler grades quality (`evaluateRecallQuality`, `review-calibration-grade.ts:96-98`), runs `processRecallResult`, and **writes `retention_cards`** (ease/interval/reps/failureCount/nextReviewAt/xpStatus) at `:102-130`, with a 24h retest cooldown (`RETEST_COOLDOWN_MS`, `:22,92-94`), then stamps mastery (`:136-145`) and syncs XP (`:147-150`).
   So the doc's claim that review's SM-2 is gated only on the (suppressed) overlay path is wrong. The accurate statement: *review's overlay-based `effectiveQuality` is suppressed, but review has its own calibration live-grade SM-2 writer that is the primary review→retention path.* The spec `docs/specs/2026-06-03-review-relearn-findings-and-high-impact-todos.md` documents this accurately and supersedes the flows-doc caveat.

2. **Path 5 gap #1 (line 329) is correct but should be promoted to a confirmed defect, not a "verify before relying."** Verified: `startRelearn` never writes the method back (`retention-data.ts:1057-1178`). The method picker is unambiguously cosmetic.

3. **Path 5 gap #2 / open-question #4 (lines 330, 763) — "resolution path UNVERIFIED … block persists" — is too pessimistic.** Verified: `updateNeedsDeepeningProgress` (`retention-data.ts:1432-1471`) is source-agnostic (filters only `topicId` + `status==='active'`) and resolves the relearn `system_signal` row after `EXIT_CONSECUTIVE_SUCCESSES = 3` good completions (`adaptive-teaching.ts:141`). The block is bounded (≤3 sessions), not permanent. Correction: change "resolution path UNVERIFIED" → "resolves via the standard `update-needs-deepening` pipeline step after 3 quality≥3 completions; blocked for up to 3 sessions, not permanently."

4. **"general-knowledge source BLOCKED in review" (line 286) overstates.** The prompt *gates* general knowledge behind the 0.88 factual-confidence floor in review and prefers source wording (`exchange-prompts.ts:809,812,1111-1113`); it is a confidence gate, not a categorical block. Minor.

5. **Retention-aware starting rung is mis-scoped as a Path-4 feature (line 286).** It applies to any topic-bound session's first exchange when a retention card exists (`session-exchange.ts:1995-1997`), shared across learning/relearn/review — not review-specific. The values (forgotten→3, weak→2, else 1) are correct (`escalation.ts:112-120`).

---

## 5. Simplification candidates

### C1 — Delete the relearn method picker (or wire it)
- **User gain:** removes a fake choice that does nothing — trust defect cured. The session opener already adapts; the picker's only honest effect today is a 1-tap delay.
- **Deleted / kept:** delete the 4-tile picker UI + `method`/`preferredMethod` plumbing on the relearn entry; keep `startRelearn` (drop the unused `preferredMethod` echo). Relearn becomes a direct launch.
- **Size:** **S** (one screen phase + a few params; `startRelearn` already ignores it for persistence).
- **Classification:** **SHIP-NOW.** Independent of any merge or the spec. (Alternative: wire `setTeachingPreference` — but the mentor-is-the-app direction is fewer fake levers, so delete is the cleaner call. UX decision for the user.)
- **Risk:** Low. No SM-2 / persistence touched. Verify the `phase==='method'` removal doesn't strand `relearn.tsx`'s 3-phase wizard back-nav (`relearn.tsx` `handleBack`).
- **Verdict:** **REAL WIN.**

### C2 — Resolve the Challenge-Round block faster on relearn completion
- **User gain:** ambient Challenge checks un-block sooner; a relearned topic isn't stuck "struggling" for up to 3 sessions when the learner is clearly back on track.
- **Deleted / kept:** keep the `needs_deepening` insert (it correctly signals "this topic needs work"); add resolution on a strong relearn completion. **Reuse the existing `effectiveQuality != null && exchangeCount > 0` predicate** already gating `relearn-retention-reset` (`session-completed.ts:638-648`) to also fast-resolve the row when the relearn graded well.
- **Size:** **S/M** (one guarded branch in the pipeline + a break-test; must not double-resolve with `update-needs-deepening`).
- **Classification:** **SHIP-NOW** for the narrow fix; conceptually adjacent to spec §8.3 but does not require it.
- **Risk:** Medium — touches Challenge eligibility correctness. Needs a break-test (relearn well → row resolved → Challenge eligible next session) and a guard against resolving a row that should stay active. Note: today's behavior is **not broken**, just slow — so this is a refinement, not a bug fix.
- **Verdict:** **CONDITIONAL** (real but lower urgency than the docs imply, since the block self-heals).

### C3 — Retire the recall-test *screen* (keep the engine)
- **User gain:** none directly (it's unreachable) — removes dead UI surface, dead-code coverage inflation, and a maintenance trap (`_layout` BUG-797 deep-link comment still references it).
- **Deleted / kept:** delete `recall-test.tsx` + its route + test; **keep** `processRecallTest`, the `/retention/recall-test` endpoint, and `RemediationCard` (used by the engine/other flows). Confirm no notification deep-link targets it (flows doc says `recall_nudge` routes to `/home` — verify before deletion).
- **Size:** **S** (one screen + route + co-located test; engine untouched).
- **Classification:** **SHIP-NOW**, but **coordinate** — recall-test is also in other analysts' scope and the spec's self-test consolidation (proposed L370). Safe to delete the screen independently of the merge.
- **Risk:** Low-Medium — must confirm zero inbound nav (verified: grep finds none) and that retiring the screen doesn't break the recall-test→relearn handoff for any future re-wiring. Keep the engine.
- **Verdict:** **REAL WIN** (with a coordination caveat).

### C4 — Expose CTA intent (label tells the truth about the mode)
- **User gain:** "Practice again" silently routing `learning` and "Review this topic" routing `review` is invisible; aligning copy to behavior removes the near-synonym confusion at the source.
- **Deleted / kept:** keep both branches (the SM-2 logic is correct — overdue→review re-measures, strong→learning extends). Change only the copy/affordance so the user can tell a re-measure ("Review") from an extension ("Keep going").
- **Size:** **S** (copy + maybe a subtitle); pure presentation.
- **Classification:** **SHIP-NOW** standalone; also **SPEC-ABSORBED** — the mentor-is-the-app subject hub (§5) and `GET /now` feed (§8.1) will re-surface these as feed cards, so don't over-invest if the hub is imminent.
- **Risk:** Low.
- **Verdict:** **REAL WIN** (small).

### C5 — Merge Review + Relearn into one "Go over again" surface
- **User gain:** collapses two of the three near-synonym surfaces into one button; fewer hidden modes.
- **Deleted / kept — count the branches honestly:**
  - **Before:** `review` (timer + REVIEW OVERRIDE prompt + calibration server block + live-grade-advance SM-2) and `relearn` (recap opener + standard prompt + baseline-**reset** SM-2 + `needs_deepening` insert).
  - **After a naive merge:** you still need, *inside* one surface: (a) timer on/off, (b) review-override-vs-standard prompt, (c) calibration-vs-recap opener, (d) **advance-vs-reset SM-2** — the load-bearing contradiction. A "forgot it, reset me" relearn and a "still got it? re-measure" review are *opposite* SM-2 operations. Merging the button does **not** merge these four branches — it moves them from the entry point into a runtime conditional inside the merged session.
- **Size:** **L/XL** (touches opener config, prompt builder, the SM-2 reset/advance decision, and the `needs_deepening` insert; plus break-tests for both SM-2 semantics).
- **Classification:** **SPEC-ABSORBED / CONFLICTS** — the mentor-is-the-app spec collapses entry surfaces via `GET /now` (§8.1) and the subject hub (§5), but **explicitly preserves the backend loop** ("the hard part… does not simplify when the UI does", atlas) and sequences the SM-2 unification as its own S0-R track (§8.3). A Review/Relearn *backend* merge is exactly the kind of SRS-core change S0-R governs — it must go through `applyRetentionUpdate()`, own plan, break-tests, rollback.
- **Risk:** High — SM-2 correctness (advance vs reset), mastery stamping, XP. The premise the docs used to justify it ("review doesn't record SM-2") is **false** (§4), which removes the strongest stated reason for the merge.
- **Verdict:** **MIRAGE at the UI layer / CONDITIONAL at most.** A single *entry* surface ("Go over again") is reasonable and is what `GET /now` will deliver — but it must still branch internally to reset-vs-advance. The merge does not delete the branches; it relocates them. Do **not** sell it as a simplification of the engine.

### How S0-R changes the calculus
The spec's S0-R retention gate (`applyRetentionUpdate()` chokepoint over ~9-10 writers incl. `review-calibration-grade.ts`, §8.3) is **orthogonal to the Review/Relearn UI merge** but **prerequisite to a safe *backend* merge.** Today the three SM-2 write paths in this cluster (calibration live-grade, post-session advance, relearn reset) are independent — there is no single function where "advance vs reset" could be expressed cleanly. Unifying the writers first (S0-R) is what would make a later Review/Relearn semantic merge *cheaper and safe*; attempting the merge before S0-R means hand-reconciling three writers under one button, which is the high-risk path. **Recommendation: ship-now wins (C1-C4) are independent of S0-R; defer C5's backend half until S0-R lands.**

---

## 6. Bottom line

**Simplification score for this cluster: 3 / 5.** Real, shippable wins exist (kill the fake picker, retire the dead screen, expose CTA intent, speed the Challenge un-block), but the headline "merge Review+Relearn into one thing that finally records SM-2" is built on a **stale premise** — review already records SM-2 via live calibration grading — and the merge relocates rather than removes its four load-bearing branches.

**Highest-value move:** **C1 — delete the cosmetic relearn method picker** (S, zero risk, cures a trust defect the user *feels*), paired with **C4 — expose CTA intent**. Together they remove the two most-felt "the app is lying to me / which button is which?" frictions at near-zero risk. C3 (retire recall-test screen) is the cleanest pure-deletion win, pending the coordination check.

**The one thing that must NOT be simplified away:** the **review calibration live-grade path** (`maybeDispatchReviewCalibration` → `review-calibration-grade.ts`) and the **relearn baseline-reset** step. They look like duplication ("two ways to update retention after re-studying") but they are *opposite, intentional* SM-2 semantics — advance-on-recall vs reset-to-baseline. Any "Go over again" merge that flattens them into one update regresses spaced-repetition correctness, mastery stamping, and XP — and it would do so quietly, since the failure mode (a topic that never re-measures, or one that resets when it shouldn't) is invisible until retention drifts. This is precisely what spec §8.3's S0-R gate exists to protect; route any backend merge through `applyRetentionUpdate()`, not around it.

---
**[ BOTTOM LINE ]** Score 3/5: the cluster's three near-synonym surfaces (Guided "Practice again" / Review / Relearn) carry real ship-now cleanup wins, but the marquee "merge Review+Relearn" rests on a refuted premise — review already grades SM-2 live — and only relocates its branches.

**[ FYI ]**
- The trusted flows-doc's Path-4 "no SM-2 update" caveat is STALE; `review-calibration-grade.ts` writes SM-2 from the calibration answer, independent of the suppressed overlay `effectiveQuality`. Both hypothesis docs inherit the error.
- Relearn method picker is verified cosmetic; the relearn `needs_deepening` Challenge-block self-heals in ≤3 good completions (source-agnostic resolver), so it's bounded friction, not a permanent bug.
- recall-test screen has zero in-app inbound navigation (grep-verified); engine is load-bearing.

**[ ACTIONS ]**
1. Ship-now, merge-independent: C1 delete the cosmetic method picker (S), C3 retire the recall-test screen keep engine (S, coordinate w/ self-test cluster), C4 expose CTA intent copy (S).
2. Correct `learning-path-flows.md` lines 286, 294, 329-330, 763 per §4 (review live-grade, gated reset, bounded Challenge block, gen-knowledge gate-not-block).

**[ DECISIONS ]**
1. C5 Review/Relearn merge: recommend treating it as an **entry-surface** consolidation only (absorbed by `GET /now` §8.1), and **deferring any backend SM-2 merge to spec §8.3 S0-R** behind `applyRetentionUpdate()` — do not hand-reconcile advance-vs-reset under one button pre-S0-R.
