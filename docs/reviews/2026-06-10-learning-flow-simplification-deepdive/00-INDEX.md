# Learning-Flow Simplification Deep-Dive — Synthesis & Ranking

> **STATUS (2026-06-27):** Partial — W1 items #1/#5/#6/#8/#10 and W2 #13 done; remaining SHIP-NOW items open. See per-path files 01–10 for current status per cluster.

**Date:** 2026-06-10 · **Branch:** `new-llm` · **Method:** 10 parallel read-only Opus analysts, one per flow cluster; every claim re-verified in source with file:line (dossiers `01`–`10` in this directory carry the evidence). Inputs: `docs/flows/learning-path-flows.md` (trusted current-state map), the 2026-06-09 codebase atlas, and the ratified [mentor-is-the-app shell spec](../../specs/2026-06-09-mentor-is-the-app-shell-redesign.md).

**Why this exists.** The earlier `learning-path-flows-proposed.md` + `learning-path-flows-diff-analysis.md` were directionally interesting but unverified. This deep-dive re-derives the simplification question from code: per flow, what actually exists, what is load-bearing vs incidental, and which simplifications are REAL — classified as **SHIP-NOW** (shell-independent), **SPEC-ABSORBED** (already ruled by the mentor-is-the-app spec — sequence it, don't re-decide it), or **MIRAGE/CONFLICTS** (refuted by code or contradicts a ratified ruling).

---

## 1. The answer — which flows can we really make simpler?

| Rank | Flow | Potential | Verdict | Dossier |
|---|---|---|---|---|
| 1 | **Path 3 — Homework** | 4/5 | **YES, now.** The most coherent path with two self-inflicted wounds, both fixable mobile-only: the exit filing prompt suppresses its own payoff (Recall Bridge), and the OCR spinner has no escape. | [04](04-path3-homework.md) |
| 2 | **Path 7 — Quiz + Assessment** | 4/5 | **YES, now** — but not the way the proposal said. The "make it count" trio + `gap_fill` chrome are cheap and real; the headline Quiz↔Assessment retention unification is a **mirage** (see §4). | [06](06-path7-quiz-assessment.md) |
| 3 | **Path 1 — Freeform** | 4/5 | **YES** — one S-sized trap deletion now (the lying "Write note" button); the rest (silent classification) IS the spec's S1 job. | [02](02-path1-freeform.md) |
| 4 | **Notes / Bookmarks** | 4/5 | **YES** — the read-side merge already half-exists (`my-notes/[kind].tsx`); finishing it is M and re-homes cleanly into S2/S3. | [10](10-notes-supporter.md) |
| 5 | **Path 8 — Dictation** | 3.5/5 | **YES** — the single cheapest personalization win in the product: `generate.ts` fully supports interests/topics, `fetchGenerateContext` just never feeds them (M, server-only). | [05](05-paths68-recitation-dictation.md) |
| 6 | **Path 0 — Learn New** | 4/5* | **YES, but spec-absorbed.** Talk-first is ratified (§3.1) and is the biggest single win — but the crux (attach subject **and topic** to a live session) does not exist in code and is honestly XL. Ship-now bits are small (drop `/ready` for returning users). *Typical case is already fast (~5-8s with prewarm hit); the 40-90s gauntlet is the worst case, not the norm. | [01](01-path0-learn-new.md) |
| 7 | **Paths 2+4+5 — Guided/Review/Relearn** | 3/5 | **PARTLY.** Four real S-wins (cosmetic method picker, recall-test retirement, CTA intent copy, Challenge un-block). The marquee Review+Relearn merge **rests on a refuted premise** (see §4). | [03](03-paths245-guided-review-relearn.md) |
| 8 | **Path 6 — Recitation** | 2.5/5 | **MARGINAL.** One S latency fix (the 60s filing-wait). Keep, don't promote; voice-first needs a compliance-wording fix first (§6). | [05](05-paths68-recitation-dictation.md) |
| 9 | **Challenge Round + Overlays** | 2/5 user-facing | **Dark feature.** Flag-off everywhere; earns nothing today. Right move is the learner-initiated reshape shipped via the spec's §8.1 "challenge-readiness" `/now` card — at un-park time, not now. The finalize pipeline (anti-hallucination spine) is untouchable. | [07](07-challenge-verification.md) |
| 10 | **Session close → pipeline** | 2/5 | **NO — sophisticated, not bloated.** The 17-step pipeline's gates, idempotency, and conservative null-skips are load-bearing. Two S-sized latency fixes only. | [08](08-session-close-pipeline.md) |
| 11 | **Entry surfaces / nav / Practice hub** | 2/5 | **NO, pre-S1.** Real friction, but the ratified shell replaces the home surface (S1) and tab matrix (S4) — structural IA work here is dead work. Three surviving S-fixes only. | [09](09-entries-nav-modes.md) |
| 12 | **Supporter surfaces** | 2/5 | **NO, pre-S4.** The digest idea is the spec's identity-blocked Support hub (S4/S5). Nothing worth building twice. | [10](10-notes-supporter.md) |

**Bottom line:** the flows that can *really* be made simpler today are **Homework, Quiz, Freeform, Notes, and Dictation** — and almost everything worth doing is S/M-sized, mobile-or-single-function, and survives the shell redesign. The big merges the proposal centered on (Review+Relearn, Quiz↔Assessment, 7→3 modes, one-ambient-check, 4-tab shell, supporter digest) are all mirages, conflicts, or spec-absorbed.

---

## 2. The verified SHIP-NOW backlog

Ordered by value-for-size. Sizes verified by the analysts (S = hours, M = screen/service + tests). None touches the V0 5-tab guardian shell, the envelope contract, profileId scoping, or safeSend.

### Wave 1 — pure deletions & gates (all S; bundle into 1–2 PRs)

| # | Fix | Evidence | Dossier |
|---|---|---|---|
| 1 | **Freeform: gate "Write note" CTA on `topicId`, delete the cannot-save alert.** The button renders ungated (`SessionFooter.tsx:103-119`) and the alert copy lies ("try again" for a permanent condition, `en.json:684-685`). | VERIFIED live at HEAD | 02 |
| 2 | **Relearn: delete the cosmetic method picker.** `startRelearn` only echoes `preferredMethod`; nothing ever persists it (`retention-data.ts:1057-1178`). A choice that does nothing, in a product whose pitch is "it adapts to me". | VERIFIED | 03 |
| 3 | **Retire the recall-test screen** (keep `processRecallTest` — load-bearing for relearn). Zero inbound navigation. | VERIFIED | 03 |
| 4 | **Hide the locked Assessment row** in the practice hub (`practice/index.tsx:649-651` renders a padlock at `assessmentCount===0`). | VERIFIED | 09 |
| 5 | **Give `gap_fill` a `SESSION_MODE_CONFIGS` entry** — today an assessed learner is dumped into "Chat/Ask anything" chrome with no signpost. | VERIFIED | 06 |
| 6 | **Skip the 60s filing-wait for recitation** — topicless recitation always times the gate out (`session-completed.ts:399`): pure invisible latency + false Sentry on every completion. One-predicate fix. | VERIFIED | 05, 08 |
| 7 | **Drop `/ready` from the create path for returning learners** (keep first-ever; `four_strands` already skips it). | VERIFIED | 01 |
| 8 | **Repoint the home subject carousel** to the library shelf (today: `/progress/[subjectId]`, a report screen — same intent, two destinations). Pre-stages S2. | VERIFIED | 09 |
| 9 | **CTA intent copy** — "Practice again" silently routes `mode=learning`, "Review this topic" routes `mode=review` (`topic/[topicId].tsx:438-482`); one "why" subtitle each. i18n tax: 7 locales + orphan-key checker. | VERIFIED | 03, 09 |
| 10 | **Quiz: fire the celebration queue on completion** — `celebrationTier` is computed and returned but `queueCelebration` is never called (`complete-round.ts:510,837`). | VERIFIED | 06 |

### Wave 2 — behavior fixes (M; one PR each)

| # | Fix | Key verified fact | Dossier |
|---|---|---|---|
| 11 | **Homework: auto-file at exit + un-starve the Recall Bridge** (+ fire the bridge on the submit-reflection path too — today it is **skip-path-only**, `session-summary/[sessionId].tsx:776`). The diff doc's "async timing risk" is **refuted**: homework filing is fully synchronous (`POST /filing` commits `topicId` before returning, `filing.ts:228-311`); the async dispatcher is freeform-only. Mobile-only change; keep a quiet "Don't keep this" opt-out (`use-filing.ts:354-360`). This is the **highest-value single fix in the product** — it removes the worst-timed interruption AND un-starves the one feature turning homework rescue into learning. | VERIFIED | 04 |
| 12 | **Homework: zero-tap sub-mode + OCR escape hatch.** Server already handles `homeworkMode: undefined` (`exchange-prompts.ts:130-143`); add a mid-wait "type it instead" CTA on the server-OCR leg (up to ~35s stacked spinner today, no escape). | VERIFIED | 04 |
| 13 | **Dictation: populate `fetchGenerateContext`.** `buildInterestThemeBlock` (`generate.ts:72-108`) fully consumes `interests`+`libraryTopics`; the context fetcher returns only `{nativeLanguage, ageYears}` (`result.ts:166-179`). Load two fields → "Surprise me" stops being irrelevant-by-construction. No prompt/schema/migration change. | VERIFIED | 05 |
| 14 | **Quiz: XP → `xp_ledger` + surface missed-items.** Quiz XP lives only in `quizRounds.xpEarned`; `xp_ledger` is dedupe-keyed on `(profileId, topicId)` and quiz has no topic — needs a small topicless-XP design ruling first (§6). Missed items are re-injected silently (`generate-round.ts:484-490`); a "3 things to review" read surface is M. | VERIFIED | 06 |
| 15 | **Saved-stuff: finish the archive merge.** `my-notes/[kind].tsx:33-45,349-369` already renders notes+bookmarks+sessions in one `ArchiveItem` shape (read-only). Port delete + the parent-proxy delete-hide (`progress/saved.tsx:98`), retire the hub. Re-homes into §5/S2 (subject-scoped notes) + S3 Journal. **No schema merge** — the two stores diverge on 5 axes and the spec doesn't need them unified. | VERIFIED | 10 |
| 16 | **Summary screen: tune the recap poll.** 2s/15s poll opens before the pipeline can possibly produce a recap; show the win screen immediately, slot the card when it lands. (Full reward-first-close is a mirage — §4.) | VERIFIED | 08 |

### Hygiene (track formally, do at the right moment)

- **`validateNoteDraft` is UNWIRED** (`notes.ts:237-244` — no production caller, no guard test). Inert only because Challenge Round is flag-off; CLAUDE.md mandates it before any drafted note is shown. Wire it as part of the Challenge un-park, and track it now so the flag can never flip first. (07, 10)
- **`MATCHER_ENABLED` ship-or-delete** — dark flag, dead branch in `startFirstCurriculumSession`. (01)

---

## 3. SPEC-ABSORBED — already ruled; sequence, don't re-decide

| Item | Where it lands | Note |
|---|---|---|
| Talk-first "learn something new" | §3.1 / S1 | Crux verified: **no endpoint attaches a `topicId` to a live session** (`ask-silent-classify.ts` attaches `subjectId` only; `startSession` requires non-null subjectId, `session-crud.ts:192-202`). XL confirmed. Open gap for the S1 plan: §3.1 rules day-one cold start; later "add subject #5" entries are uncovered. |
| Silent, non-blocking first-turn classification | §3 / S1 | Load-bearing plumbing — `bookmarks.subject_id` NOT NULL, auto-file needs a subject. Background it, never skip it. Note: with exactly 1 enrolled subject, classify already short-circuits deterministically (`subject-classify.ts:172-187`). |
| Session exit-funnel rework | §7 / S6 | Gated on P3 park-and-return eval coverage. The homework auto-file primitive (Wave 2 #11) *feeds* this — not wasted work. |
| Challenge Round learner-initiated reshape | §8.1 `/now` "challenge-readiness" card | Ship at un-park; keeps the finalize pipeline (event-id validation + `learnerQuote` overwrite + conservative mastery — `evaluation.ts:82-126`) untouched. |
| Topic-bound quiz generation | post-S2→S3 evidence gate | Highest-value learner fix in the cluster but it's *addition*, not simplification (new activity type + LLM prompt + eval-harness + mastery keys; L). |
| Interleaved Retrieval | §8.1 | Disposition flips from "retire" to: retire the *path*, keep the engine — the `/now` feed gives it a natural "mixed review" card slot. |
| Supporter digest / Recaps fold | §6.3, §7 / S4-S5 | Identity-blocked. ParentHomeScreen's heir is the Support-hub feed; nothing pre-S4 is worth building twice. |
| Notes' final home | §5 (S2) + Journal (S3) | Wave 2 #15 is the stepping stone, verified compatible. |

---

## 4. The MIRAGE graveyard — refuted ideas (do not resurrect without new evidence)

1. **Review+Relearn merge ("one Go-over-again").** Premise refuted: review sessions **do** grade SM-2 live via `maybeDispatchReviewCalibration` (`session-exchange.ts:1045-1150`) → `review-calibration-grade.ts:96-159`, independent of the suppressed overlays. The merge would reconcile two *opposite* SM-2 semantics — review **advances** the card, relearn **resets it to baseline** (`session-completed.ts:636-678`) — plus two prompt regimes. It relocates four load-bearing branches; removes none. Any backend unification belongs to `applyRetentionUpdate()` on the S0-R track (§8.3).
2. **Quiz↔Assessment retention-universe unification (the proposal's XL).** `quiz_mastery_items` is keyed on country/person strings with **no topicId** — Capitals/Guess-Who have no curriculum topic to map onto `retention_cards`; unification fabricates fake topic rows. Two genuinely different pedagogical instruments. The *entry-surface* merge is real (M-L) and can wait for the evidence gate; the data merge is fake. `quiz_mastery_items` is a fully closed loop (one writer, one reader); `vocabulary_retention_cards` is the only quiz table read elsewhere (progress snapshot).
3. **7→3 mode collapse.** `mode` is already JSONB-only (no DB column); `session_type` is already 3-value. The ~80 branch sites gate real pedagogy — collapsing re-keys, deletes nothing. §7's exit-funnel death removes the standalone motive.
4. **One ambient "Mate checks you" merge** (evaluate + teach_back + Challenge). Distinct triggers, evidence schemas, SM-2 mappings; merging is XL, touches the envelope contract, deletes almost nothing.
5. **4th "Practice" learner tab + More-fold.** Directly contradicts the ratified 3-tab shell (§3); revives the Library tab §7 kills; edits the exact shared tab `Set`s the V0 hard constraint protects; thrown away at S1. The salvageable kernel — one canonical entry per verb — is delivered by `/now` + the closed route catalog.
6. **"Loose notes" bucket for topicless freeform saves.** Notes are topic-mandatory at three layers (client `use-notes.ts:237-239`, DB `topic_notes.topicId` NOT NULL, alert) and §5 rules subject-scoped notes. L/XL against the ruling. Wave 1 #1 cures the actual harm.
7. **Homework camera/entry refactor now.** §3/§3.1 relocate homework entry to an inline-camera mentor reply; refactoring today's 1,717-line `camera.tsx` is rebuild-twice risk. (The OCR cascade itself — including the raw photo riding as `inline_data`, WI-284 — is the must-keep core.)
8. **Dictation de-islanding into retention now.** Would add an 11th parallel writer to the exact set S0-R is collapsing, and dictation mistakes have no topic anchor. Route through the §8.2 activity ledger later.
9. **"Wire the existing dictation `ocrText` param" (diff doc: S/M).** The param **does not exist** — `text-preview.tsx` has no `useLocalSearchParams`/`ocrText` at HEAD. It's a new M-L build, not a wiring job.
10. **Reward-first close as an M.** Function-level idempotency is keyed on `sessionId` alone (`session-completed.ts:377`), so naive immediate dispatch means the later reflection's XP/quality **never reaches the pipeline**. Real version needs a pipeline split (L) and builds on the funnel §7 dissolves.

---

## 5. Corrections to `learning-path-flows.md` (the trusted doc) — patch list

Each verified with file:line in the named dossier; the doc's `[was: …]` convention applies.

1. **Path 4 recording caveat is stale** — review grades SM-2 live via the calibration path (per §4.1 above); the null-quality `update-retention` skip is the *fallback*, not the norm. (03)
2. **Challenge drafted-note guard presented as live** (`:503`) — `validateNoteDraft` is unwired (`notes.ts:237-244`). (07, 10)
3. **Recall Bridge is skip-path-only** — fires only on the Skip exit (`session-summary/[sessionId].tsx:776`), not on submit; doc implies filed⇒bridge. (04)
4. **Path 5 gap #2 over-pessimistic** — the relearn `needs_deepening` block **self-heals**: `updateNeedsDeepeningProgress` (`retention-data.ts:1432-1471`) resolves the row after `EXIT_CONSECUTIVE_SUCCESSES=3` good completions; "resolution path UNVERIFIED" → bounded ≤3 sessions. (03, 05)
5. **Path 8 "ocrText param exists"** (`:408-409`) — no such param at HEAD. (05)
6. **Bookmarks tighter than documented** — `bookmarks.subjectId` NOT NULL: a subjectless freeform turn cannot be bookmarked (same structural class as the note save-block). (10)
7. **`relearn-retention-reset` gate omission** — also gated on `effectiveQuality != null && exchangeCount > 0` (`session-completed.ts:641`); an overlay-less relearn skips the reset. (08)
8. **"Assessment XP UNVERIFIED" cell settled** — assessment **does** write `xp_ledger`, atomically with SM-2 on pass (`assessments.ts:230-237`). (06)
9. **Saved surfaces count** — four render sites, not three (add topic-detail inline notes, `topic/[topicId].tsx:414-422`). (10)
10. *Labeling nuance:* V1-off learners get `STUDY_TABS` via the contract's explicit-study fall-through, not the V0 helper's `LEARNER_TABS` (same shape, different engine). (09)

**Stale entries elsewhere:** atlas bug-register Critical #2 (challenge-round writes to non-existent `concepts`/`concept_mastery`) is **remediated at HEAD** — gated `CONCEPT_CAPTURE_ENABLED=false` (`session-exchange.ts:833`, `concept-capture.ts:19`); the `filing-timed-out-observe.ts` illegal step-nesting is **already fixed** (fix comment `:264-272`); CLAUDE.md's "rung-floor mechanism planned" note remains stale (`session-exchange.ts:263-278` is live).

---

## 6. Open product / compliance decisions surfaced (not ruled here)

1. **Devil's Advocate (`evaluate`) for minors.** Verified: the deliberately-flawed explanation is shown with **no upfront warning** — the only marker is a *post-pass* badge. Age-gate or opt-in would touch one selection site (`session-exchange.ts:1724-1736`). Highest-risk safety surface in the learning flows. Owner: product/safety.
2. **Embeddings consent asymmetry.** `generate-embeddings` (`session-completed.ts:1670-1683`) sends transcript content to Voyage **ungated**, while the generative-LLM memory step is consent-gated (`:1394`). Gate it or formally document the intent. Owner: compliance.
3. **Topicless XP design** — `xp_ledger` dedupe is `(profileId, topicId)`-keyed; quiz XP needs a ruling (synthetic topic? new key shape?) before Wave 2 #14 ships. Owner: eng (small).
4. **§3.1 talk-first scope** — day-one only, or every later "learn something new" entry? Feeds the S1 plan. Owner: product.
5. **Voice-first recitation** requires first tightening the voice-feedback prompt wording — "pace, **confidence, expression**" (`exchange-prompts.ts:771-774`) is affect-leaning against the transcription-only AI Act posture, and the LLM only sees STT text. Owner: product/compliance.

---

## 7. Coordination notes

- Wave 1 items are independent; bundle freely. Wave 2 #11 (homework) is the headline PR and should go first among the M items — it's also the one that feeds §7's exit-funnel work.
- #15 (archive merge) must port the parent-proxy delete-hide or it's a gating regression.
- Every rename/copy item pays the i18n tax: 7 locales, orphan-key checker, JSX-literal ratchet.
- Nothing in this backlog touches identity-foundation surfaces; all of it is compatible with the baseline-reset runway.
