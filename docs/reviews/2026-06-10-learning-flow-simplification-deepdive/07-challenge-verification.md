# Challenge Round + Verification Overlays: Deep-Dive
> Cluster scope: Challenge Round (flag-gated, `CHALLENGE_ROUND_RUNTIME_ENABLED=false`) + the two LIVE mid-session verification overlays — Devil's Advocate (`evaluate`) and Feynman (`teach_back`). The in-session checking mechanisms. · Analyst: checks · Date 2026-06-10 · Sources verified at HEAD of `new-llm` (read-only).

**Verification key:** VERIFIED = read in source at the cited file:line at HEAD. INFERRED = reasoned from verified facts, not directly observed.

**Headline correction vs shared context (re-grade of bug-register Critical #2):** the "live challenge-round writes to non-existent `concepts`/`concept_mastery`" finding is **REMEDIATED at HEAD**. The call site is now gated `if (CONCEPT_CAPTURE_ENABLED && session.subjectId)` (`session-exchange.ts:833`) with `CONCEPT_CAPTURE_ENABLED = false` (`concept-capture.ts:19`). The bug register's own recommended fix ("gate the call behind the same flag/condition") has been applied. The dead write **no longer fires** in any environment, so there is **no Sentry noise** from this path today. The code remains (function + integration tests intact, parked). Details in §2.2. (VERIFIED)

---

## 1. Feature inventory (verified)

| Feature / branch | What it does | Status | Load-bearing? (why) | Evidence |
|---|---|---|---|---|
| **`CHALLENGE_ROUND_RUNTIME_ENABLED` flag** | `z.enum(['true','false']).default('false')`; no override in any `.toml`/`.vars`/`.env`/CI file (grep clean) | flag-off **every** env | Load-bearing kill switch — gates all CR prompt blocks + downstream | `config.ts:145`; `config.test.ts:508-515`; route read `sessions.ts:527-529` |
| **8 eligibility gates** (`evaluateChallengeReadiness`) | Pure fn, server source-of-truth; LLM offer suppressed unless eligible | flag-gated | Load-bearing IF flag flips; inert today | `trigger.ts:74-136` (each gate cited §2.2) |
| **Topic-bound guard** | `challengeReadiness` only computed `if (topic && hasChallengeQuotaInputs)` → freeform (no topic) structurally excluded | flag-gated | Load-bearing (anti-freeform) | `session-exchange.ts:2043-2070` |
| **Offer/accept/decline/abort state machine** | `learning_sessions.metadata.challengeRound`; states offered→accepted→active→drafting→complete (+declined/aborted) | flag-gated | Load-bearing (drives prompt block + finalize) | `route-actions.ts`; `state.ts:33,74-83` |
| **Strict answer-event validation + learnerQuote overwrite** | Every `answerEventId` must be a `user_message` event in THIS session for THIS profile; `learnerQuote` is **overwritten** with real DB `content`; any miss → throw → whole eval rejected | flag-gated | Load-bearing **anti-hallucination** primitive — best engineered piece in cluster | `evaluation.ts:82-126` (#477) |
| **Mastery decision** (`decideMasteryAndReview`) | ALL `solid` → `verified`+`markMasteryVerified`; any `partial`/`misconception`→`partial`; all `missing`→`reteach`; empty→`invalid` (CRIT-9 `0===0` guard) | flag-gated | Load-bearing logic; pure, well-tested | `evaluation.ts:128-186` |
| **Mastery persistence (INSERT, not UPDATE)** | INSERTs an `assessments` row `{verificationDepth:'transfer', status:'passed', masteryScore:1, qualityRating:5, masteryChallengeVerifiedAt:now}` | flag-gated | Reuses the `assessments` table (shared with Assessment path) | `persistence.ts:135-163` |
| **needs_deepening routing** | `partial`/`misconception` → upsert `needs_deepening_topics` `source='challenge_round'`, status `pending_review`, 7-day TTL | flag-gated | Load-bearing — this is the only durable artifact a weak round produces | `persistence.ts:165-266`; TTL `:17` |
| **Unconditional 24h decline cooldown** | ANY decline writes/updates a `challenge_round_cooldowns` row `lastOutcome=0`; `dontAskAgain` only sets in-session `declinedDontAskAgain` flag (does NOT change cooldown) | flag-gated | Load-bearing politeness guard | `route-actions.ts:112-129`; flag `state.ts:74-83`; trigger reads `trigger.ts:128-133` |
| **LLM rung floor** (`resolveChallengeRoundLlmRoutingRung`) | Floors accepted/active/drafting turns to `GEMINI_ADVANCED_MODEL_MIN_RUNG` | flag-gated, **but in source** | Incidental quality lever; **CLAUDE.md "mechanism planned, not yet in source" is STALE** | `session-exchange.ts:263-278`, applied `:2071-2074` |
| **Drafted note + lexical-overlap guard** (`validateNoteDraft`) | Tokenizes draft vs verified learner text; rejects `<0.4` overlap (topic-drift guard) | **UNWIRED** | Dead — no production caller (see §4) | `note-draft.ts:141-175`; unwired note `notes.ts:237-244` |
| **Concept capture** (`captureConceptMastery` → `concepts`/`concept_mastery`) | Per-concept mastery ledger; writes 2 tables that exist in NO deployed env | **PARKED** (gated off) | Dead today; gated `CONCEPT_CAPTURE_ENABLED=false` | `concept-capture.ts:19,96-182`; gate `session-exchange.ts:833` |
| **Devil's Advocate overlay** (`evaluate`) | AI presents plausibly-flawed explanation; `signals.evaluate_assessment{challenge_passed, quality 0-5}` | **LIVE** (not flag-gated) | Load-bearing checking mechanism | `evaluate.ts:28-33` (gate), `:68-78` (SM-2 map) |
| **Feynman overlay** (`teach_back`) | AI plays "clueless student"; `signals.teach_back_assessment{completeness,accuracy,clarity}` | **LIVE** (not flag-gated) | Load-bearing checking mechanism | `teach-back.ts:29-34` (gate), `:50-59` (SM-2 map) |
| **Overlay auto-select** | From retention card: `shouldTriggerEvaluate` first, else `shouldTriggerTeachBack` (mutually exclusive per exchange); learning-only, non-interleaved | LIVE | Load-bearing | `session-exchange.ts:1717-1736` |
| **Verification badge** (mobile) | Post-pass green "✓ THINK-DEEPER CLEARED" / "TEACH-BACK CLEARED" on AI turns | LIVE component; population path thin (see §2.1) | Incidental UI; **no upfront warning** (safety §2.1) | `MessageBubble.tsx:21,170-173,271-277`; copy `en.json:635-638` |

---

## 2. Complexity map

### 2.1 User-felt complexity (incl. what is invisible/dark today)

- **Challenge Round is 100% invisible today.** Flag-off ⇒ no prompt block injected (`exchange-prompts.ts:1228`), `signals.challenge_round_offer` ignored, no SSE typed `challengeOffer`/`challengeRound`/`draftedNote`, so `ChallengeOfferCard.tsx` / `DraftedNoteReview.tsx` never mount. A learner sees **nothing**. (VERIFIED — flag + gate.) The atlas independently calls it "invisible-by-design … ~9 runtime conditions" (`atlas/quiz-challenge-mastery.md:183`).
- **Overlays ARE felt, but subtly.** The Devil's Advocate overlay silently swaps the AI's normal teaching turn for a *deliberately wrong* explanation the learner is meant to critique. There is **no upfront UI announcement** that "this explanation contains a planted flaw." The only surfaced artifact is a **post-pass** badge — green "✓ THINK-DEEPER CLEARED" — shown *after* the learner catches the flaw (`MessageBubble.tsx:271-277`, copy `en.json:636`). So from the learner's chair, the overlay is: an ordinary-looking AI turn that happens to be wrong, then (if they push back correctly) a small green checkmark. (VERIFIED.)
  - **Safety nuance for the product/safety decision (§6):** the badge is *reassurance after success*, not *warning before exposure*. A minor who does **not** catch the flaw receives a confidently-stated wrong explanation with no marker. The badge copy never contains the words "deliberately wrong" / "flaw" / "I was testing you." (VERIFIED — full badge copy is exactly "THINK-DEEPER CLEARED"/"TEACH-BACK CLEARED".)
  - Caveat (INFERRED): I could not locate the code that *populates* `msg.verificationBadge` from streaming data — `ChatShell.tsx:277` reads `msg.verificationBadge` but no producer assigns it in `use-session-streaming.ts` (grep clean). The badge may be partially unwired in practice, which would make even the post-pass reassurance absent. Either way it does **not** weaken the safety point (no upfront warning exists).
- **Recitation/review modes:** overlays are selected-then-suppressed (review) or never selected (recitation) — invisible to those learners by design.

### 2.2 Hidden complexity (gates, state machine, dead writes)

**The 8 eligibility gates** (all VERIFIED, `trigger.ts`), evaluated in order, first failure short-circuits:
1. `sessionType==='learning'` (`:77-79`)
2. `struggleStatus==='normal'` — any active needs-deepening row flips this (`:80-82`; struggle derived `session-exchange.ts:2049-2054`)
3. `exchangeCount >= 5` (`:83-85`)
4. `recentCorrectStreak >= 2` (`:86-88`)
5. Retention `strong` **OR** new-topic evidence (`exchanges>=7 && streak>=4 && solidAnswers>=4`) (`:90-98`)
6. `quotaRemainingTurns >= 3` (`:100-102`)
7. Free tier also `quotaFractionRemaining >= 0.05` (`:103-108`)
8. No blocking round state (offered/accepted/active/drafting/declined/dontAskAgain) AND no same-topic 24h decline cooldown (`:110-133`)

This is a **9-input pure function** (the "8 gates" + topic-bound caller guard at `session-exchange.ts:2043`). Maintaining it costs: the function, its unit tests, the prompt-block branch, the SSE typed fields, two mobile components, a dedicated `challenge_round_cooldowns` table (`schema/challenge-round-cooldowns.ts`, with unique constraint + check constraint + RLS), and the state machine (`state.ts`). All inert behind one flag.

**The dead `concepts`/`concept_mastery` writes — fully verified (re-grade of bug-register Critical #2):**
- The write path: `finalizeChallengeRoundIfReady` (`session-exchange.ts:795-847`) → at `:833` guards `if (CONCEPT_CAPTURE_ENABLED && session.subjectId)` → `safeWrite(() => captureConceptMastery(...))`.
- `captureConceptMastery` (`concept-capture.ts:96-182`) INSERTs `concepts` (`:115`) + `conceptMastery` (`:156`) and runs a raw-SQL supersede `UPDATE "concept_mastery" … FROM "concepts"` (`:72-83`). Those tables are created only by migration `0107` — **REFERENCE-ONLY, applied nowhere** (db-migration.md Critical #1; memory `project_stars_parked_until_baseline_reset.md`).
- **What actually happens at runtime at HEAD:** `CONCEPT_CAPTURE_ENABLED = false` (`concept-capture.ts:19`), so the `&&` short-circuits and `captureConceptMastery` is **never called**. No `relation "concepts" does not exist` is thrown, nothing reaches `safeWrite`. (VERIFIED.) The bug register (dated 2026-06-09) described the **pre-gate** state where the call fired and `safeWrite` swallowed→Sentry; the atlas (`quiz-challenge-mastery.md:86`) likewise says "called from session-exchange.ts:829" without the gate. **Both predate the `CONCEPT_CAPTURE_ENABLED` gate at HEAD.** `safeWrite` behavior is real and correct (`safe-non-core.ts:111-128`: try→captureException→logger.error→return, never throws) — it is simply not exercised by this path today.
- **Residual cost (not zero):** the schema package still exports `concepts`/`concept_mastery` (`schema/index.ts`), so RLS-coverage static tests may report them "covered" while absent at runtime (db-migration.md cross-lens). `concept-mastery.ts` READ helpers (`getConceptMasterySignalsForTopics`) and the `GET` route in `routes/notes.ts:168-179` still query these tables — those reads would also hit non-existent relations IF called, but they are downstream of the same parked feature. (VERIFIED reads exist; INFERRED they are unreached because the writer is gated off.)

**State machine + cooldown subtlety (VERIFIED):** decline ALWAYS writes the cooldown row (`route-actions.ts:112-129`), `dontAskAgain` is orthogonal (only sets in-session flag, `state.ts:83`). The doc's "ALWAYS writes a 24h topic cooldown" is correct; the old "[was: cooldown only for don't-ask-again]" was the bug.

### 2.3 Load-bearing vs incidental verdict

- **Load-bearing (keep if shipping CR):** the 8-gate evaluator, the strict event-id validation + learnerQuote overwrite (anti-hallucination — the genuinely valuable invariant), `decideMasteryAndReview`, the `assessments`-INSERT finalize, and `needs_deepening` routing. These form a clean "verify mastery → persist evidence or weak-spots" pipeline that is independent of the offer/UI surface.
- **Incidental / removable:** the offer/decline UI surface, the cooldown table (only exists to throttle a re-offer), the LLM rung floor, the drafted-note path (already unwired), and the entire concept-capture ledger (parked, double-gated, schema-absent).
- **Overlays:** both gates + SM-2 mappings are load-bearing and LIVE; the verification badge is incidental UI.

---

## 3. Hypothesis audit (claims from proposed/diff docs on this cluster)

| Claim | Verdict | Evidence |
|---|---|---|
| Challenge Round is flag-off in every environment | **CONFIRMED** | `config.ts:145` default `'false'`; no override in any toml/vars/env/CI (grep clean) |
| Live code writes to non-existent `concepts`/`concept_mastery`, swallowed by safeWrite → Sentry noise | **PARTIAL / now REFUTED at HEAD** | True in bug-register snapshot; at HEAD the write is gated off (`CONCEPT_CAPTURE_ENABLED=false`, `session-exchange.ts:833`) so it no longer fires — no noise today |
| Decline writes 24h cooldown only for "don't ask again" | **REFUTED** | `route-actions.ts:112-129` writes cooldown on ANY decline; `dontAskAgain` only sets in-session flag |
| Challenge drafted-note lexical-overlap guard (≥0.4) is part of the live flow | **REFUTED (unwired)** | `notes.ts:237-244` comment: no production caller of `validateNoteDraft`, no guard test |
| LLM rung floor is "planned, not in source" (CLAUDE.md) | **REFUTED (stale)** | `resolveChallengeRoundLlmRoutingRung` exists `session-exchange.ts:263-278`, applied `:2071-2074` |
| Overlays run live (not flag-gated) | **CONFIRMED** | `evaluate.ts:28-33` / `teach-back.ts:29-34` gates use only SM-2 ease/reps; no flag; auto-selected `session-exchange.ts:1724-1736` |
| `evaluate` and `teach_back` are mutually exclusive per exchange | **CONFIRMED** | `session-exchange.ts:1731-1735` (`else if`) |
| Overlays suppressed in review/recitation; run in learning+relearn | **CONFIRMED** | prompt suppression `exchange-prompts.ts:482-496,1205`; overlay auto-select learning-only `session-exchange.ts:1727` |
| Challenge offers are excluded from freeform (no topicId) | **CONFIRMED** | computed only `if (topic && …)` `session-exchange.ts:2043-2044` |
| "Merge all checks into one ambient check" deletes large surface | **MIRAGE (see §5)** | Counted: it reshuffles, doesn't delete much |

---

## 4. Current-doc corrections (`learning-path-flows.md`)

1. **The drafted-note lexical-overlap guard is UNWIRED — the doc presents it as live flow.** `learning-path-flows.md:503` ("solid evidence → DraftedNoteReview (lexical-overlap guard ≥0.4; fallback prompt if it fails)") and `:545` describe the guard as an active step. **Proof it is dead:** `notes.ts:237-244` states verbatim that "no production code path calls `validateNoteDraft` today, and no guard test exists." `validateNoteDraft` (`note-draft.ts:141`) and `buildValidatedDraft` exist, but `createNoteForSession` (the only session-note writer, `notes.ts:230-259`) does **not** call the guard. So the *guard* is unwired; whether a drafted note is even produced is moot because the whole CR surface is flag-off. The doc should tag this **[unwired — guard exists, no caller]**, consistent with the shared context's known-stale flag.
2. **Concept-capture is not mentioned in the Challenge Round section at all**, yet it is the cluster's most dangerous parked write. The doc's Challenge finalize box (`:498-504`) lists mastery INSERT + needs_deepening + reteach + drafted note, but omits the `captureConceptMastery` branch entirely. Suggest a one-line **[parked: concept-capture gated off, tables absent]** note so a reader doesn't reintroduce the dead write.
3. **(Confirm, not correct)** The doc's overlay path-gating matrix (`:523-534`) and "ALWAYS writes a 24h cooldown" (`:495`) and "rung floor IS in source" (`:506`) are all **correct** at HEAD — verified above. No change needed; flagging that these three were previously-corrected items and they hold.

---

## 5. Simplification candidates

### C1 — Delete the parked concept-capture ledger (`concepts`/`concept_mastery` writer + readers)
- **User gain:** none directly (feature is invisible); gain is **maintenance + risk reduction** — removes a double-gated dead write, schema-absent tables advertised by the barrel, and a false-positive RLS-coverage surface.
- **Deleted:** `concept-capture.ts` (writer), the `captureConceptMastery` call+gate (`session-exchange.ts:829-847`), `concept-mastery.ts` read helpers + the `GET` concept-mastery route (`routes/notes.ts:168-179`), schema exports, integration tests. **Kept:** the `assessments`-based mastery evidence (`persistence.ts`) — that table EXISTS and is shared.
- **Size:** **M.**
- **Classification:** **CONFLICTS** — memory `project_stars_parked_until_baseline_reset.md` explicitly **PARKED** both note-mark features "until the baseline reset; no demo … re-home into post-reset baseline." Deleting now contradicts a ruled decision to re-home, not delete. **Recommended:** keep parked, but ensure the gate stays (it does) so there is no noise; revisit at the identity baseline reset.
- **Risk:** low to delete (dead), but reverses a product decision.
- **Verdict:** **CONDITIONAL** — only a real win at the baseline reset; today the gate already neutralizes the harm, so the urgency the bug register implied is gone.

### C2 — Remove the unwired drafted-note guard OR wire it
- **User gain:** removes confusion (doc claims a guard that does nothing) / OR restores the anti-hallucination guard if CR ships.
- **Deleted (if remove):** `validateNoteDraft` + `note-draft.ts` tokenizer + the `notes.ts:237-244` TODO. **Kept (if wire):** add the `validateNoteDraft` call into the CR finalize→note path + the guard test.
- **Size:** **S.**
- **Classification:** **SPEC-ABSORBED** — only matters if CR ships (which the mentor-is-the-app spec treats as feed "challenge-readiness", §8.1/§2 P6); the wiring should land *with* a CR ship, not standalone.
- **Risk:** low.
- **Verdict:** **CONDITIONAL** — do it as part of any CR ship decision, not before.

### C3 — Reshape Challenge Round to learner-initiated, then ship (vs the dark auto-offer machine)
- **User gain:** turns an invisible, 8-gate auto-offer into a learner-pulled "test me on this" that the spec's `/now` feed can surface as a **challenge-readiness card** (§8.1) — actionable module, not announcement (§2 P6).
- **Deleted/kept:** **kept** the load-bearing finalize pipeline (event-id validation, `decideMasteryAndReview`, `assessments` INSERT, `needs_deepening` routing); **deleted/simplified** several of the 8 gates that exist only to time an *unsolicited* offer (cooldown table, the quota-fraction gate, the offer/decline state arms) — a learner-pull needs only "topic-bound + enough evidence."
- **Size:** **L.**
- **Classification:** **SPEC-ABSORBED** (§8.1 challenge-readiness feed input; §2 P6 "every module is an action").
- **Risk:** medium — re-pointing the trigger and SSE; must not regress the (already-correct) anti-hallucination invariant.
- **Verdict:** **REAL WIN (conditional on deciding to ship CR at all)** — this is the highest-value reshape: it converts dark machinery into a spec-aligned feed card and sheds the offer-timing complexity.

### C4 — Delete the offer/decline surface machinery, keep the finalize pipeline
- **User gain:** none today; reduces surface to maintain while keeping the valuable mastery-verification logic available for the Assessment path / future feed.
- **Deleted:** offer prompt block, `ChallengeOfferCard`/`DraftedNoteReview`, decline route + cooldown table, state machine arms. **Kept:** `evaluation.ts` + `persistence.ts` (mastery → `assessments`/`needs_deepening`).
- **Size:** **M.**
- **Classification:** **SPEC-ABSORBED** (the finalize pipeline is what a feed-driven check would reuse).
- **Verdict:** **CONDITIONAL** — sensible IF the team rules "no auto-offer CR ever"; otherwise C3 is better (reshape beats delete).

### C5 — Age-gate / opt-in the Devil's Advocate overlay (SAFETY, not simplification)
- **User gain:** removes the "confidently-wrong explanation to a minor with no warning" exposure for the youngest cohort.
- **Touched (INFERRED scope):** the overlay auto-select (`session-exchange.ts:1724-1736`) would gate on age bracket / a learner opt-in; optionally a one-line "I'm going to argue a wrong idea — catch me" pre-frame in the `evaluate` prompt block. No DB change needed (it's a selection gate). Note `teach_back` carries **no** flawed-content risk (learner explains, AI plays clueless) — only `evaluate` needs gating.
- **Size:** **S–M.**
- **Classification:** product/safety **DECISION** (not a clean spec absorption).
- **Verdict:** **not mine to rule** — present in §6.

### C6 — "Merge everything into one ambient check" — REAL WIN or MIRAGE?
- **Count of what actually deletes:** the three mechanisms have **genuinely different triggers, evidence shapes, and SM-2 mappings**: `evaluate` (ease≥2.5, `challenge_passed`+quality, map clamps pass→[3,5]/fail→[2,3]), `teach_back` (ease≥2.3, 3-axis rubric, weighted 0.5/0.3/0.2), Challenge Round (8 gates, per-concept `solid|partial|missing|misconception`, mastery INSERT + needs_deepening). Merging them into one "ambient check" would still need all three evidence schemas, all three SM-2 mappings, and all three trigger conditions — those are the **substance**, and none of them collapse. What you'd delete is thin: one extra prompt-block branch and maybe one envelope signal name. The rest is **reshuffled**, not removed.
- **Size:** would be **XL** (touches every SM-2 mapping + the envelope contract).
- **Verdict:** **MIRAGE** — the perceived duplication is surface (three "checks") over genuinely distinct pedagogy. The honest win is **C3** (reshape CR to learner-pull) + leaving the two live overlays alone, not a grand merge.

---

## 6. Bottom line

**Score: 2 / 5 for current user-facing value, but 4 / 5 for engineering hygiene of the LIVE parts.** Rationale: the entire Challenge Round — the headline "checking mechanism" — is dark in every environment and has been parked behind a flag with a second dead-feature (concept-capture) gated inside it; users get **zero** value from it today while it carries real maintenance weight (8-gate evaluator, state machine, dedicated table, two mobile components, schema-absent ledger). The two LIVE overlays are well-built and do run, but are subtle and one of them has an unaddressed safety question.

**Highest-value move:** **C3 — reshape Challenge Round to learner-initiated and ship it through the spec's `/now` "challenge-readiness" feed card (§8.1), keeping the finalize pipeline and shedding the auto-offer timing gates.** This is the only move that converts dark machinery into actual user value AND simplifies. If the team is not ready to ship CR at all, the fallback is "stay parked" — but then do **not** pretend (in docs) that the drafted-note guard or concept-capture are live (§4).

**The one thing that must NOT be simplified away:** the **strict answer-event validation + `learnerQuote` overwrite** (`evaluation.ts:82-126`) and the conservative `decideMasteryAndReview` ("any non-solid blocks mastery", empty→invalid). This is the anti-hallucination spine that makes a "you've mastered this" claim trustworthy; it is also a CLAUDE.md non-negotiable. Any reshape (C3/C4) must carry it forward verbatim.

**Open product/safety decisions (stated crisply, not ruled):**
1. **Devil's Advocate silent-flaw to minors (C5).** VERIFIED: the `evaluate` overlay presents a confidently-stated, deliberately-wrong explanation with **no upfront UI warning**; the only marker is a **post-pass** green "✓ THINK-DEEPER CLEARED" badge (and even that producer path looks thin). A learner who fails to catch the flaw receives unmarked misinformation. **Decision owed:** age-gate `evaluate` (e.g. younger bracket off), require opt-in, or add a pre-frame line — vs accept as-is. `teach_back` is unaffected (no flawed content). Touch point is one selection gate (`session-exchange.ts:1724-1736`); low build cost either way.
2. **Concept-capture disposition.** Keep parked-and-re-home at the identity baseline reset (current ruling, `project_stars_parked_until_baseline_reset.md`) vs delete now (C1). The HEAD gate already removes the runtime harm the bug register flagged, so this is no longer urgent — but the schema barrel still advertises absent tables and the read helpers/route are latent. **Decision owed:** confirm "parked, gate stays" or "delete and re-home post-reset."
3. **Ship CR at all, and in which shape.** Auto-offer (current, dark) vs learner-pull (C3) vs delete-surface-keep-pipeline (C4). The mentor-is-the-app spec leans toward feed-surfaced challenge-readiness (§8.1), which favors C3.

---
**[ BOTTOM LINE ]** Challenge Round is fully dark in every env behind `CHALLENGE_ROUND_RUNTIME_ENABLED=false`; the bug-register's "live writes to non-existent concepts tables → Sentry noise" is REMEDIATED at HEAD (now gated by `CONCEPT_CAPTURE_ENABLED=false`); the two verification overlays run live, and Devil's Advocate's silent-flaw-to-minors is a real, undecided safety question.

**[ FYI ]**
- Re-grade: bug-register Critical #2 and the atlas both predate the `session-exchange.ts:833` gate — no concept-table write fires today, no noise.
- CLAUDE.md's "rung floor mechanism planned, not in source" is stale — it IS in source (`session-exchange.ts:263-278`).
- The drafted-note lexical-overlap guard is unwired (no caller, no test) — `learning-path-flows.md:503` overstates it as live.
- Devil's Advocate badge copy is post-pass reassurance only ("THINK-DEEPER CLEARED"), never an upfront "this is deliberately wrong" warning.

**[ ACTIONS ]**
1. Correct `learning-path-flows.md:503` to tag the note guard `[unwired]` and add a `[parked: concept-capture]` note to the Challenge finalize box (§4).

**[ DECISIONS ]**
1. **Devil's Advocate safety:** age-gate / opt-in / pre-frame the `evaluate` overlay for minors, or accept the unmarked-flaw exposure as-is — recommended: gate `evaluate` off for the youngest bracket (small, one selection-site change; `teach_back` needs no change).
2. **Challenge Round future:** ship reshaped as learner-pull via `/now` challenge-readiness (§8.1) — recommended C3 — vs keep parked vs delete surface (C4). Highest-value simplification rides on this fork.
