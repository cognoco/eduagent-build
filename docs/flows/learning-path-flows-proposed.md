# Learning Path Flows — PROPOSED (Challenger Edition)

A redesign companion to [`learning-path-flows.md`](learning-path-flows.md). Same structure, same path-by-path walk — but each section presents the **proposed simpler flow** instead of the current one, and is **grounded in code** so every proposal is anchored to what exists today, not to wishful thinking.

> **How to read this.** Each section gives **Today** (the current code-true behavior, with `file:line` from the source doc / source) → **Friction** (what an end user actually feels) → **Proposed** (the simpler flow) → **What we'd lose** (honest cost). Where the current flow is already good, it says **KEEP** and explains why — no manufactured change.
>
> **Method note (2026-06-09).** Built from a 20-agent end-user critique pass over the code-true [`learning-path-flows.md`](learning-path-flows.md), each agent walking one path/mechanism as a real learner (or parent) and asked: *what would frustrate me, what's overcomplicated, what major simplification gives 80–90% of the value more elegantly, and what would I miss?* The current-state citations are inherited from that doc and are current as of this date; re-verify after any nav-contract / session-exchange / post-session-pipeline change before acting on a proposal.
>
> **Implementation note (2026-06-11).** The first small slice from this proposal has shipped in source: topicless note CTAs are suppressed, `gap_fill` has Gap Check chrome, home subject cards open the shelf, locked Assessment is non-pressable, recitation skips the filing wait, and quiz completion queues a persistent celebration. Remaining proposal text keeps the broader direction, but "Today" statements below are patched where those shipped changes changed the current state.

---

## The five themes (read these first)

Every per-path proposal below is an instance of one of these. If you only change five things, change these.

1. **Answer first, resolve in the background.** The product makes a brand-new, thin-patience learner absorb **30–90s of cold-start latency and 3–6 forced decisions before a single word of teaching** (subject-resolve 30s timeout → curriculum poll 25s + 409 retries → `/ready` → maybe a book-picker). The infra to do it the other way already exists (freeform Path 1, classify-after-first-message). Reorder, don't rebuild.
2. **Never offer an action you'll then refuse.** First slice fixed the two confirmed traps: topicless freeform no longer renders the "Write note" CTA/alert path, and `gap_fill` no longer renders generic freeform chrome. Keep applying the same rule to future entry points: never show a button the app must refuse.
3. **Collapse the ten "test me" mechanisms to three.** Quiz, Assessment, Challenge Round, Devil's-Advocate, Feynman, Review, Relearn, Interleaved, recall-test, plus invisible SM-2 — **only 4 are reachable today**, they overlap into indistinguishability, and the most game-like one (Quiz) doesn't even feed topic mastery. Target: **one self-test surface + one study-again surface + one ambient in-session check.**
4. **Collapse seven session modes to three.** `tutor` / `review` / `homework`. The other four (`freeform`, `learning`, `relearn`, `gap_fill`) are runtime branches — opener flavor, `topicId == null`, `gaps[]`, pedagogy flag — dressed up as top-level modes. Preserve funnel analytics with a decoupled `entryPoint` field.
5. **No fake choices, no silent no-ops.** The relearn **method-picker is never written back** (cosmetic), and review is **live-but-not-guaranteed** for SM-2: calibration grading exists, but no-quality/cooldown edges can still leave the card unchanged. Both are trust defects when presented as user-visible levers. Either wire the lever fully or cut it.

---

## Status legend (unchanged)

`prod-active` · `flag-gated` · `server-built / mobile-dormant` · `orphaned` · `prompt-only` · `data-only`. Proposals add two more verbs: **CONSOLIDATE** (fold into another surface) and **RETIRE** (kill the dormant path, keep the engine if load-bearing).

---

## 1. Audience model — who reaches what

**KEEP the model, SIMPLIFY the supporter surface.** The learner / supporter / parent-proxy split (`use-parent-proxy.ts:15-18`, `gates.showLearningActions = !isParentProxy`) is sound and well-enforced — leave it. The change is the **navigation shell**:

### Proposed tab shape — four learner verbs

**Today:** learner shell is `home, library, progress, more` (`STUDY_TABS`; the legacy learner shape is equivalent). The busiest verb-cluster — *practice / test myself* (Quiz, Dictation, Recite, Assessment, Relearn — 5 activities) — has **no tab**; it hides behind a `home-action-practice` button on `LearnerScreen`. The home subject-carousel now routes to the same `/(app)/shelf/[subjectId]` tree as Library [was: progress report], so that specific duplicate-destination trap is fixed.

**Proposed:** tabs become the four things a learner actually does — **Learn (home) · Practice · Library · Progress** (More folds into a header/avatar menu). The Practice hub already exists fully built at `practice/index.tsx` — this is a *promotion*, not a build. Every contextual entry (overdue banner, CoachBand, book "Start Review") becomes a **deep-link into the Practice tab**, not a parallel destination — so back-navigation and re-discovery always resolve to one canonical place.

**What we'd lose:** nothing structural — V0/V1 tab-shape complexity (`navigation-contract.ts`, the `LEGACY_GUARDIAN_TABS` hard constraint) is purely internal and untouched. This is IA, not features.

---

## 2. Path inventory — proposed end-state

| Current path | Proposed disposition |
|---|---|
| 0 — Learn Something New | **REWORK entry** → talk-first; resolve/curriculum/book-pick to background |
| 1 — Freeform Chat | **KEEP spine, SIMPLIFY** → silent classification, suppress topic-bound CTAs |
| 2 — Guided Learning | **KEEP, add resume** → Home "Continue" card; legible CTA |
| 3 — Homework Help | **KEEP, SIMPLIFY exit** → auto-file + undo; universal Recall Bridge |
| 4 — Practice / Review | **CONSOLIDATE → "Go over again"** (merge with Relearn); must record SM-2 |
| 5 — Retention Relearn | **KEEP as the one study-again surface**; kill cosmetic method-picker |
| 6 — Recitation | **REWORK** → voice-first, subject-less, drop Beta + 60s wait |
| 7 — Quiz | **REWORK content** → quiz my actual subjects; unify XP/celebration; **absorbs Assessment as a depth tier** |
| 8 — Dictation | **SIMPLIFY** → one personalized entry + camera-first own-text; feed retention |
| Assessment ladder | **CONSOLIDATE → Quiz** as its serious depth tier; rename away from "Assessment" |
| Interleaved Retrieval | **RETIRE** the path (zero callers); keep engine, revive only as a Quiz option |
| `gap_fill` | **PARTLY FIXED** → now has real Gap Check chrome; broader mode-collapse can still fold it into `tutor` with `gaps[]` |
| Challenge Round | **REWORK → learner-initiated "Challenge me"**; fold into the ambient check |
| Verification Overlays | **SIMPLIFY → one announced/opt-in teach-back**; demote deliberate-lie mode |
| Notes (4 routes) + Bookmarks | **CONSOLIDATE → one "Saved" shelf** |

---

## 3. Per-path entry-point map — proposed

The principle: **one canonical entry per verb, plus contextual deep-links that land *inside* it.** Today Relearn has 4 entries, Quiz has 3, Path 0 has 3 tiles — helpful intent, but un-anchored, so it reads as scatter and breaks back-navigation. Keep the timely nudges (overdue banner, CoachBand "fading" — this is spaced-repetition-as-mentoring, the product's soul); just point them at the canonical surface instead of duplicating it.

Add a **Home "Continue where you left off" card** (top of `LearnerScreen`) that reuses `deriveStudyCTA` to collapse the current **5-tap resume** (Library → shelf → book → topic row → Topic Detail → CTA) into **one tap** straight to `/(app)/session`.

---

## Path 0: Learn Something New — talk-first

**Today (`create-subject.tsx`, `subject.ts:317`, `startFirstCurriculumSession`):** type subject → `POST /subjects/resolve` (LLM, **30s timeout** spinner "Checking name…", `:662`) → triage 4 branches (direct / resolved-1 "Accept/Edit" / resolved-n chips / no-match) → `POST /subjects` branches into focused_book / four_strands / broad / narrow → maybe `/pick-book/[subjectId]` detour → `first-curriculum` **server poll 25s** + `materializeFocusedBookTopics` 5s + **409 → 3 retries @2s** → `/ready` → Session. Worst case ≈ **60–90s of spinners and 2–4 forced taps before any teaching.**

**Friction:** a motivated kid who typed "black holes" is made to confirm their own unambiguous input, possibly adjudicate a taxonomy chip they don't care about, possibly shop for a textbook, and wait through two long spinners — at the exact moment they have zero sunk cost and maximum bounce propensity.

**Proposed — fire and talk:**
- On submit, **open the teaching session instantly** with the raw topic in `tutor` mode (the same engine Path 1/freeform already uses with no subject). The mentor's first turn lands on "black holes" in ~2s.
- Run `resolve` + `createSubjectWithStructure` + `prewarm` **asynchronously** — the `safeSend app/subject.curriculum-prewarm-requested` dispatch already exists. When structure lands, silently attach the session to the resolved subject/topic.
- **Drop from the critical path:** the synchronous Accept/Edit confirmation, the book-picker gate, and the `/ready` screen. The `four_strands` branch *already* skips `/ready` (`:150`) — proof the gate is non-essential and droppable elsewhere.
- Ambiguity ("Spanish" = grammar vs travel vs literature) becomes a **mentor question in the first turn** ("want the physics angle or the general-science angle?") — a teaching moment, not a form.

**What we'd lose:** the disambiguation chips have real value for genuinely vague single-word inputs — preserve them inside the conversation. The book-picker matters for whole-textbook courses — keep it as an *optional later* affordance in Library, not a gate. `/ready` is a nice one-time first-run delight — keep it *only* for the very first session ever, never on the create path. The whole resolve→structure→prewarm apparatus stays alive server-side; it just becomes eventually-consistent enrichment instead of a blocking gauntlet.

---

## Path 1: Freeform Chat — actually freeform

**Today (`LearnerScreen.tsx:80-85`, `use-session-actions.ts:375-376`, `SessionFooter.tsx:128-133`):** `home-ask-anything` → `{mode:'freeform'}`. First substantive message triggers `POST /subjects/classify` with "Looks like X" / disambiguation chips / create-subject fallback. The KNOWLEDGE-CAPTURE block is **not** freeform-excluded, so the LLM emits `note_prompt.show`, a **"Write a note"** button renders — and tapping it fires a native alert **"Notes cannot be saved right now. Please try again"** (`en.json:635`) because there's no `topicId`. Silent ≥5-exchange background auto-file.

**Friction:** the *lightest* entry in the app makes a curriculum-filing decision on the user's very first sentence (the opposite of "just ask"), and then offers a save button whose copy *lies* — it says "try again" for a permanent structural condition, so the kid taps again, fails again, and concludes the app is broken.

**Proposed — SIMPLIFY (spine is right):**
- **Already done in the first slice:** gate the "Write note" CTA/editor on `topicId != null` and remove the topicless cannot-save alert path. Future optional improvement: if product wants deliberate topicless saves, add a **"Loose notes"** bucket instead of keeping the affordance hidden.
- Make first-turn classification **silent and non-blocking**: answer the question first; resolve subject in the background only to satisfy bookmark/auto-file machinery. No "Looks like X" chips, no create-subject screen on an "ask anything" session.
- Keep the ≥5-exchange auto-file (it rescues a deep accidental session into the library) but surface it with a gentle **"Saved this to your library"** toast at summary instead of total silence.

**What we'd lose:** bookmarks still need a `subjectId`, so keep classification — just hide it. The LLM structured recap remains the right durable artifact for freeform; no learner note needed.

---

## Path 2: Guided Learning — KEEP the logic, fix resume ergonomics

**Today (`topic/[topicId].tsx:443-481`, `deriveStudyCTA`):** Library v3 → subject shelf → book card → topic row → Topic Detail → single sticky CTA whose label/behavior changes by state: `not_started`→"Start studying" (`learning`), strong→"Practice again" (secretly `learning`), overdue→"Review this topic" (secretly `review`).

**Friction:** **5 taps and 5 screens to resume yesterday's topic.** And the CTA silently relabels itself between days with no explanation — "Practice again" vs "Review this topic" read as synonyms to a 13-year-old, who can't tell which one tests vs reteaches, or why the button changed since yesterday (reads as "did I do something wrong?").

**Proposed — SIMPLIFY (no state-machine change):**
- **Home "Continue where you left off" card** reusing `deriveStudyCTA` → routes straight into `/(app)/session {mode, subjectId, topicId}`. 5 taps → 1. Library stays for browsing.
- Pair the CTA verb with a one-line **"why" subtitle**: "Review this topic" → *"It's been a while — let's check it stuck."* / "Practice again" → *"You've got this — want a harder go?"* The button routes; the subtitle teaches.

**What we'd lose:** nothing — the state-aware CTA is pedagogically correct (overdue→review is right SM-2 behavior); the fix exposes intent, not removes the branch. Reflection auto-note and immediate retention attach (`:228`) are quietly excellent — leave them.

---

## Path 3: Homework Help — KEEP, fix the exit

**Today (`homework/camera.tsx:509`, `use-homework-ocr.ts`, `exchange-prompts.ts:130`):** camera → OCR cascade (ML Kit → server `POST /v1/ocr` → retry → manual, single `processing` spinner) → subject auto-classify → `{mode:'homework'}` with optional "Help Me Solve It / Check My Answer" chips → **End → Filing Prompt ("Yes, add it / No thanks")** → Summary. Recall Bridge is currently a **Skip-only** summary branch (max 2 Qs, **requires `topicId`**, so empty unless filed); submitting "Your Words" only dispatches completion.

**Friction:** at 9pm a stuck kid who just got unstuck wants to be *done* — and homework is the **only** path that interrupts the exit with a save decision. Worse, the Recall Bridge (the one feature that turns a one-off rescue into learning) is gated behind that prompt most kids reflexively dismiss with "No thanks." **The interruption suppresses its own payoff.** Secondary: the mode chips default to `undefined` with a generic server fallback (`:130`), so they're optional — but the UI over-signals them as a required gate, making a stuck kid pause to "pick right."

**Proposed — SIMPLIFY:**
- **Kill the binary filing prompt. Auto-file silently** under the auto-classified subject, show Summary immediately, and **run the Recall Bridge for everyone.** One quiet "Don't keep this" link in the summary footer for the rare opt-out. This removes the worst-timed interruption *and* un-starves the Recall Bridge in one move.
- Demote the mode chips to a single inline toggle ("I want to check my answer", off by default) so the urgent default — get unstuck — needs zero taps.
- Add a mid-wait "still reading… type it instead" affordance to the OCR spinner for slow cellular server-OCR hops.

**What we'd lose:** keep the manual-type escape hatch (handwritten-maths OCR fails often) and the "Help Me Solve It" don't-reveal-the-answer posture (`exchange-prompts.ts:108,125`) — that's the spine that stops homework help being an answer key. We keep the *capability*, just stop forcing the choice.

---

## Path 4: Practice / Review — CONSOLIDATE into "Go over again", and make it count

**Today (`relearn.tsx:280-285`, `review-calibration-grade.ts`, `session-completed.ts` update-retention):** `mode=review` on completed+overdue topics. Verification-overlay prompt blocks are **suppressed** (`!isReviewMode`), but review has a live calibration-grading path that can write SM-2. It is still **not guaranteed**: non-substantive answers, cooldowns, or no-quality edges can leave the retention card unchanged. The non-overdue "Practice again" routes `mode=learning`.

**Friction:** the user does the review the app *asked* for, and the app still has paths where its model of "do they still remember it" doesn't update. Even a rare no-op is trust-eroding when the button's whole promise is review. The mode whose purpose is to re-measure retention should not rely on a best-effort quality source.

**Proposed — MERGE Review into Relearn as one "Go over this again" session that always records SM-2:**
- Collapse "Review this topic" (overdue) and "Revisit … fading" (Path 5) into a single study-again session. One concept, one button.
- **Make it always produce a non-null `effectiveQuality`** — either let one lightweight teach-back probe through near the end, or **derive quality from the existing "what do you remember?" calibration opener** (it's already a retention probe). Never silently no-op the thing the user was told to do.
- Keep the light, refresh-y tone (calibration opener, "Refresh what you know") — don't turn it into a graded gauntlet.

**What we'd lose:** the visible review timer is a genuine distinct affordance — keep it on this merged surface. Retention-aware escalation rung (forgotten→3, weak→2) is smart — keep.

---

## Path 5: Retention Relearn — the one study-again surface; kill the fake choice

**Today (`startRelearn`, `retention/relearn`):** method picker (visual_diagrams / step_by_step / real_world_examples / practice_problems) with "Usual method" highlighted → recap-anchored session. **The picker is never written back** — no code calls `setTeachingPreference` / `PUT /subjects/:id/teaching-preference` from this flow (source doc "known gaps" #1). The `needs_deepening_topics` insert sets `struggleStatus='needs_deepening'`, which temporarily blocks Challenge Round; quality-bearing completions can self-heal through `updateNeedsDeepeningProgress()` after 3 good completions. `relearn-retention-reset` resets the SM-2 card to baseline before the advance step when quality exists.

**Friction:** the user picks "real-world examples," starts, and gets taught exactly as always — they *feel* "I picked diagrams but got the same thing." A choice that does nothing is worse than no choice: it teaches a learner that their preferences don't matter, in a product whose pitch is "it adapts to me." That's a deceptive pattern.

**Proposed:**
- **Kill the cosmetic picker.** Open straight into the recap-anchored session ("Last time we covered X — want a quick quiz first, or shall I re-explain?"). The mentor already adapts mid-conversation; let the *conversation* surface method. One fewer screen, zero deception, faster to value. (If product truly wants the choice, it must call `PUT /subjects/:id/teaching-preference` on submit so the next session reflects it — but that's more code for a rarely-changed setting. **Recommend: kill it.**)
- **Fix the remaining Challenge-Round block edges** — the quality-bearing path self-heals, but no-quality or abandoned relearn sessions can leave the block active. This is a correctness bug, not a taste call.

**What we'd lose:** only the *feeling* of control, which is currently fake. The recap opening and the SM-2 baseline reset are the load-bearing value — they stay.

---

## Path 6: Recitation — voice-first, subject-less

**Today (`use-subject-classification.ts:507-518`):** Practice hub "Recite (Beta)" → `{mode:'recitation'}`. Subject **silently auto-assigned to `availableSubjects[0]`**; input mode **text by default** (voice opt-in). The former 60s topicless filing wait is fixed: recitation now skips the generic filing wait.

**Friction:** a *recitation* feature that defaults to a keyboard quietly downgrades to a spelling test — a first-timer never discovers voice exists. The silent `subjects[0]` pick files an English poem under (alphabetically/recently first) "Biology", polluting that subject's progress with off-topic `practice_activity_events`. "Beta" reads as "might not work" to a nervous kid practicing for a graded recital. The 60s post-finish wait *feels* broken even if "transparent."

**Proposed — REWORK toward radical simplicity:**
- **Voice-first** (text as an explicit accessibility fallback). The name promises this; voice feedback covers pace/expression — the one real gem here.
- **Drop the subject entirely** — file under a synthetic "Recitation/Practice" bucket or no subject, never `subjects[0]`. The filing-wait part is already fixed; the remaining issue is subject pollution.
- Replace "Beta" with a plain "Practice reciting" once voice-default works.

**What we'd lose:** very little — the voice pace/expression feedback is what no flashcard app gives; keep it, throw away the scaffolding around it.

---

## Path 7: Quiz — quiz my actual subjects, and make it count

**Today (`computeRoundStats`, `quiz_rounds.xpEarned`):** Quiz Index = Capitals (always) · Vocabulary:<Language> (locked if no four_strands subject) · Guess Who (always). 30s hard timeout → error panel (no Retry on quota/forbidden/consent). Wrong answers feed `quiz_missed_items` + SM-2 on `vocabulary_retention_cards` / `quiz_mastery_items` — a **parallel retention universe** from the topic-level `retention_cards`. **Quiz XP is NOT in `xp_ledger`**; persistent completion celebrations are now queued; mid-round prefetch is dead code.

**Friction:** a kid studying biology opens Quiz and is offered Capitals and Guess Who — generic trivia with nothing to do with their subjects — while the one subject-linked card (Vocabulary) is the one most often shown *locked*. The personalization is inverted. And their effort vanishes into invisible systems: XP that doesn't move the "real" progress bar, a retention loop they never see, no celebration. It feels like a disconnected trivia arcade, not their learning.

**Proposed — REWORK content, keep the engine:**
- **Generate quizzes from the learner's active topics** (biology → biology quiz; recently studied floats to top). Keep one LLM round generator; drop Capitals' deterministic special-case and the Guess Who engine from the *default*.
- **Write quiz XP into the main `xp_ledger`** and fire the celebration queue on completion, so a good round visibly moves real progress + streak.
- **Surface the retention loop** — "3 things to review from last quiz" — instead of a hidden SM-2.
- **Absorb the Assessment ladder as Quiz's serious depth tier** (recall→explain→transfer), so there's one self-test surface, not two undifferentiated ones. Rename the umbrella to something like **"Check what you know"** (drop the exam-coded word "Assessment").

**What we'd lose:** Guess Who's progressive-clue mechanic is the best game-feel here — keep it as one *optional* mode, not the default. Server-checked answers (options stripped of the correct answer) — keep, it's correct and invisible. Vocabulary SM-2 for language learners is real pedagogy — keep, just not as the only subject-linked card.

---

## Path 8: Dictation — one personalized entry, end the island

**Today (`POST /dictation/generate`, `/prepare-homework`, `/review`):** "I have a text" → **blank editable TextInput** (no camera/OCR; no dictation text-preview `ocrText` route param/producer) → `prepare-homework`. "Surprise me" → LLM 6–10 sentences **age-appropriate by AGE ONLY** (ignores learning history/interests). 3.5s silent countdown. "Check my writing" → camera → `/review` (reads `learningProfiles.struggles` best-effort, **does not write back**). Feeds **no** retention/memory/curriculum — reporting only.

**Friction:** "I have a text" is a trap — the user expects to *give* the app a text (snap a worksheet) and instead must hand-type a whole passage into a phone keyboard before they can start, while the OCR fix is wired-but-unreachable. "Surprise me" content is irrelevant by construction. And the whole activity is an island — even when it works, none of the effort compounds.

**Proposed — SIMPLIFY (leaning rework on entry + feedback):**
- Collapse the two-choice entry into **one "Start dictation"** defaulting to **interest/curriculum-aware** generation (pass recent topics + interests into `/generate`, not just age).
- Add **"Use my own text"** as a secondary, **camera-first** path (reuse homework OCR output or add an explicit dictation OCR param), with manual typing as the fallback — not the default.
- **Route `/review` mistakes into the shared retention/struggles store** so dictation stops being an island.
- Make the 3.5s countdown spoken ("Ready… start writing") instead of a silent label.

**What we'd lose:** keep the "Check my writing" camera → per-mistake remediation loop (the magic) and the offline client-side TTS (instant, real strength).

---

## The testing/checking surfaces — CONSOLIDATE ten to three

This is the single highest-leverage simplification in the whole doc.

**Today there are ten "prove you know it" surfaces** — Quiz, Assessment, Challenge Round, Devil's-Advocate (`evaluate`), Feynman (`teach_back`), Review, Relearn, Interleaved, recall-test, plus invisible SM-2 — **and only four are learner-reachable** (Quiz, Assessment, Review, Relearn). Challenge Round is flag-off in every env (`config.ts:145`); the two overlays auto-fire with no learner-chosen entry; Interleaved has zero mobile callers; recall-test is orphaned. They overlap so heavily a 14-year-old experiences maybe two real concepts behind ten mechanisms — and the most test-like one (Quiz) feeds a *parallel* retention universe that never touches topic mastery.

**Proposed minimal model — learner sees two buttons + one ambient behavior:**

| Mechanism | Disposition |
|---|---|
| **Assessment ladder** | **KEEP as the one self-test surface** ("Check what you know"); already has the right shape (recall→explain→transfer, server-validated, pass/borderline/fail routing) |
| **Quiz** | **MERGE into it** as the playful recall tier (vocab/capitals/Guess-Who as a game mode); unify onto topic-level `retention_cards` |
| **Review (Path 4)** | **MERGE into Relearn** → one "Go over this again" that **does** record SM-2 |
| **Relearn** | **KEEP as the one study-again surface**; drop the cosmetic method-picker |
| **Devil's-Advocate + Feynman** | **MERGE into one ambient "Mate checks you" beat**; pick one SM-2 gate (the 2.5-vs-2.3 split is invisible plumbing) |
| **Challenge Round** | **MERGE into the ambient check** (or retire) — it's a third dark in-session check |
| **Interleaved** | **RETIRE the path** (keep engine); revive only as a "mixed review" *option* inside the self-test |
| **recall-test screen** | **RETIRE the screen, KEEP the engine** (load-bearing for relearn) |
| **SM-2** | **KEEP invisible, surface ONE signal** (card status "fading/strong") that drives both surfaces |

**What we'd lose & how to preserve it:** interleaving (cross-topic discrimination, FR92-93) is real pedagogy — preserve as a self-test *option*, not a separate path. The two complementary check formats (spot-the-flaw vs teach-back) — keep both as variants the ambient engine rotates between, just stop modeling them as distinct user-facing things. Quiz's game motivation — preserve the celebration/streak loop as the self-test's low-stakes tier.

---

## Challenge Round — learner-initiated, not a surprise ambush

**Today (`challenge-round/trigger.ts:22-136`):** flag-off in all envs. **8+ eligibility gates** (exchangeCount≥5, recentCorrectStreak≥2, retention strong-or-evidence, quota≥3, free-tier 5% fraction, struggleStatus normal, no cooldown) → LLM emits a surprise offer card → accept (≤3 Qs) / decline (**always writes a 24h cooldown**) / don't-ask-again.

**Friction:** surprise quizzes are the single most-disliked classroom dynamic; reproducing the pop-quiz ambush *unpredictably* (no one can model 8 gates) imports the worst of school. And "no thanks" once silently locks the feature out for 24h on that topic — a polite decline gets punished, invisibly.

**Proposed — REWORK to opt-in, then ship:**
- Replace the surprise offer + accept/decline/cooldown machinery with a persistent low-key **"Challenge me / Test me on this"** affordance the learner taps when *they* feel ready. This deletes the offer card, the decline state, the dontAskAgain flag, the 24h cooldown table, and **5 of the 8 gates** (they only ever existed to manage *unwanted* interruption — moot once opt-in).
- Keep one server check ("enough evidence for a meaningful transfer check?"); if not, grey the button with "a bit more practice first."
- **Fold this entry point into the ambient "Mate checks you" beat** — one "challenge me" routing into the strongest available check beats three parallel surprise mechanisms.

**What we'd lose:** automatic nudging of kids who'd never tap the button — recoverable with a once-per-session gentle inline prompt, not a modal + cooldown. The finalize pipeline's quote validation, mastery INSERT, and needs-deepening routing are the genuinely good parts and should run unchanged. The drafted-note guard is intended but currently not wired into the save route, so that needs fixing before calling the note path guarded.

---

## Verification Overlays — one announced teach-back

**Today (`evaluate.ts:28-33`, `teach_back` gate 2.3):** mid-session, SM-2-gated, mutually exclusive. Devil's-Advocate presents a **deliberately flawed explanation** with no announcement; Feynman has the AI play a "clueless student." The path-gating matrix was historically *inverted* in the docs.

**Friction:** a 13-year-old whose trusted mentor suddenly says something wrong doesn't think "clever test" — they think "the AI glitched," or worse, **quietly absorb the flawed explanation as fact** (the SM-2 floor protects their *score*, not their *understanding*). This whiplash is already a documented failure mode ("the mentor became someone else"). The two-overlay / two-threshold / 5-row-gating design is too subtle for anyone to hold — the doc-inversion history proves it.

**Proposed — SIMPLIFY to one announced/opt-in beat:**
- Collapse to **one overlay — Feynman teach-back — gated by one threshold**, and make it **announced/opt-in**: *"Want to try teaching this back to me? I'll play the curious student."* The learner taps in. Kills the whiplash and the "AI is broken" reading; keeps the strongest pedagogy.
- Demote **Devil's-Advocate (deliberate-falsehood) to opt-in "spot-the-flaw" with an upfront banner** — never silent, never default — **or cut it for under-15s**, where absorbing-the-lie risk is highest.

**What we'd lose:** Feynman is elite pedagogy (explaining-to-teach = highest retention); keep it and its rich `teach_back_assessment` signal. Devil's-Advocate as default loses little — it's Bloom-5/6 enrichment for the strongest learners, exactly the cohort who'd happily opt in.

---

## Notes + Bookmarks — one "Saved" shelf

**Today:** four note-creation routes (manual chip, LLM `note_prompt`, reflection auto-note, Challenge draft) all converge on `topic_notes` (cap 50). **Bookmarks** are a *separate* system — save AI messages to `progress/saved`. Notes are topic-bound; bookmarks have nullable `topicId` but require non-null `subjectId`, so fully subjectless freeform messages cannot be bookmarked.

**Friction:** a kid has one instinct — *"save this"* — and the app makes them pick a lane they don't know exists, split by **authorship** (did the mate say it = bookmark, did I write it = note). Nobody files memories by who said them. Later, finding "that thing about mitosis" means remembering which system it went to. (The four note *routes* are fine invisible plumbing — they all become "a note on this topic"; the problem is the *second system*.)

**Proposed — SIMPLIFY (plumbing is sound):**
- Collapse to **one "Saved" shelf with two item *types*, not two systems.** Make "bookmark this message" simply create a note **seeded with the AI's text** (quote pre-filled, editable, still one-tap, no forced editing). Same store, same shelf, tiny ✍️ (I wrote it) / 💬 (mate said it) icon.
- Extend the first-slice Freeform fix: topicless CTAs are now suppressed, but a future "Loose notes" bucket could allow deliberate no-topic saves instead of hiding the affordance.

**What we'd lose:** keep one-tap quote capture (don't force typing to keep something the mate said) and per-topic organization (the auto-notes building a topic record are valuable — don't flatten into one pile).

---

## First-Turn Opener & Next-Topic Recap — KEEP

The fun-fact opener is already removed; the **FIRST TURN RULE** (teach one idea + one action) is the antidote to AI-tutor waffle — **KEEP, it's the payoff the cold-start should rush toward.** The Next-Topic Recap Card (`generate-learner-recap`, polls 2s/15s) is good content; its only problem is *placement at session end* — see below.

---

## Session close → Summary — reward first, reflection optional

**Today (`session-completed.ts:576`, recap poll `:558`):** End → "Your Words" reflection (≥10 chars → LLM "Mate feedback") OR Skip. A normal *pending* close **does not dispatch the pipeline until submit/skip**, yet the summary screen **polls every 2s up to 15s** for the next-topic card — so after tapping Skip the user stares at a spinner.

**Friction:** the sequence is backwards. The reward (celebration + recap) is gated behind a chore (graded reflection) *plus* a visible up-to-15s dead-wait. A 14-year-old who just wants to be done hits Skip every time — so the reflection's pedagogical value is already mostly lost — and then a 15s spinner reads as "frozen" and they force-close, killing the recap too.

**Proposed — SIMPLIFY (reorder, don't rebuild):**
- On close, **dispatch a lightweight pipeline immediately** (ungate from reflection) so the recap generates *while* the "Nice — 15 minutes, 2 topics" win screen shows. By the time the win is absorbed, the card is ready — no visible spinner.
- Render reflection as a **soft optional card *below* the recap** ("Add a note in your own words? +XP"), never a blocking gate. Most kids skip; the keen ones still get the Mate-feedback auto-note.
- If the recap isn't ready in ~3s, show the win anyway and slot the card in when it lands (or defer to next-session open) — never a dead spinner.

**What we'd lose:** nothing — the reflection auto-note + Mate feedback is real self-explanation pedagogy; demoting it from gate to optional-second-beat keeps 100% of the upside for kids who engage and stops punishing the 80% who'd Skip anyway.

---

## Session lifecycle & Post-Session Pipeline — KEEP (with two riders)

The pipeline (`session-completed.ts`, concurrency 25/profile, idempotent) is sophisticated and mostly invisible in the right way — **KEEP.** Two riders fall out of the proposals above:
1. **Ungate dispatch from reflection** for the reward-first close (above).
2. **The review→SM-2 edge skips** must be fixed so "Go over again" always records. Calibration grading exists, but no-quality/cooldown cases still need a guaranteed quality source or explicit UX.

`stripEnvelopeJson` on every bubble (BUG-941) is load-bearing — **KEEP.** Server-validated answers (quiz/assessment strip the correct answer client-side) — **KEEP.** Crons (`session-stale-cleanup` 10-min cadence / 30-min threshold; daily reconciliation) — **KEEP.**

---

## Mode taxonomy — collapse seven to three

**Today:** seven `mode` strings ship (`freeform, learning, review, homework, relearn, recitation, gap_fill`). The user never picks one — it's inferred from the button. `learning`/`relearn`/`review` are **all `sessionType=learning`**, differing only in opener copy + one timer + one Challenge policy. `gap_fill` now has a dedicated Gap Check config/chrome, but it is still a runtime branch rather than a learner-selected top-level mode.

**Proposed minimal set — 3 modes + runtime modifiers:**

| Current | Disposition |
|---|---|
| **learning** | **KEEP** → rename `tutor` (the canonical teaching session) |
| freeform | **MERGE → tutor**; "subject unknown at start" = `topicId == null` runtime branch (drives classification + auto-file) |
| relearn | **MERGE → tutor**; recap opener derived from "topic has prior summary" |
| gap_fill | **MERGE → tutor** eventually; carry `gaps[]` as session params. Chrome is already fixed with Gap Check copy. |
| **review** | **KEEP** → the one mode with a distinct affordance (the visible timer) + overlay-suppression |
| **homework** | **KEEP** → camera entry, direct (non-Socratic) answers, filing flow, no overlays |
| recitation | **DERIVE-AT-RUNTIME** under `tutor` as `pedagogy=verbatim` |

**What we'd lose & how to preserve it:** opener variety → compute from session context (overdue? prior summary? gaps?) inside `tutor`. Challenge-Round gating → already a server rule on `needs_deepening_topics`, not really mode-driven. **Funnel analytics** → add a decoupled `entryPoint` telemetry field (`learn_new`, `continue`, `practice_revisit`, `gap_fill`) so reporting fidelity survives the collapse. Practice activities (quiz/dictation/assessment) stay separate — they're not tutoring sessions.

---

## §11 Supporter surfaces — one per-child "This Week" digest

**Today (`ParentHomeScreen`, Recaps tab, `child/[profileId]/{index,session,topic,subjects,reports,report,weekly-report,curriculum,mentor-memory}`):** a parent gets **9+ child screens plus a separate Recaps tab** that overlaps heavily (narrative/highlight/conversationPrompt appear in recaps *and* child/session *and* reports *and* weekly-report). The **only** way a parent enters a learning flow is clone-from-child → a session **for themselves** — never alongside the child's live session, and nothing tells them this.

**Friction:** a time-poor parent arrives with one question ("is my kid learning, and how do I help?") and two needs (reassurance + engagement), and is handed an engineer-shaped filing cabinet — one screen per data table — where reassurance is scattered across four overlapping surfaces and "engagement" means re-studying quadratics yourself. They'll hunt for a "help with this session" button that doesn't exist.

**Proposed — SIMPLIFY (strong; don't touch the rich data layer):**
- Collapse to **one per-child "This Week" digest**: top = one-line reassurance + trend; middle = 1–3 recap highlights each with the **`conversationPrompt`** ("Ask them about…") — *this is the crown jewel, surface it harder*; bottom = a "More" expander revealing the deeper screens (curriculum, mentor-memory, full reports) for the rare parent who wants them.
- **Fold the Recaps tab into the digest** (same content, different door today).
- Reframe the clone CTA from "Learn together" to a secondary **"Try this topic yourself."**
- Add one honest framing line: *"You see recaps; sessions are your child's space."*

**What we'd lose:** keep mentor-memory editing (genuinely valuable — correct what the AI remembers) one level down, and on-demand full transcript for the anxious moment. The backend data is rich and correct — this is a re-skin, not a rebuild.

---

## Practice Hub — lead with one action

**Today (`practice/index.tsx:498-1000`):** four co-equal sections — `bestNextStep` (a "Review" card → relearn + a usually-**locked** Assessment row), `quiz` (card + Capitals "?"/Guess-Who "W" tiles), `otherPractice` (Vocab/Dictation "D"/Recite "R" slider), `recentProgress` (History "H").

**Friction:** ~8–9 tappable things across four sections; cryptic single-letter icons; "Assessment" vs "Quiz" undifferentiated (both = "a test" to a kid); the recommendation doesn't dominate because three equal-weight sections follow it. First slice made the locked Assessment state non-pressable, but the locked hint can still be many kids' first impression ("this app is full of stuff I can't use").

**Proposed — SIMPLIFY (leaning rework of layout):**
- **One dominant recommended action as hero** (the Best-next-step card, verb-first: "Review 3 topics"), one button.
- **Collapse Quiz / Assessment / Dictation / Recite / Vocab into one secondary "More ways to practice" group** — uniform rows, real icons, one-line "what it's for" subtitles. Move Capitals/Guess-Who *inside* the Quiz screen, off the hub.
- **Kid-legible names:** "Assessment" → "Check what you've mastered"; "Quiz" → "Quick games"; drop "Best next step" jargon.
- **Hide locked items** instead of showing a dead row.

**What we'd lose:** keep the spaced-repetition due-count + "memory boost" framing as the hero (the most valuable thing here), XP/streak feedback attached to the action, and per-language Vocabulary reachable (just demoted).

---

## Cross-cutting dimensions — KEEP

Pedagogy mode, input mode, celebration level, conversation language, pronouns, interests, UI locale, profile lens — these are genuine per-profile/per-session dimensions and the consent-gating asymmetries are deliberate. **KEEP.** The removed `serious/casual` toggle stays removed.

---

## Removed / orphaned / dormant — proposed dispositions

| Item | Today | Proposed |
|---|---|---|
| Interleaved session | server-built / mobile-dormant | **RETIRE the path**; keep engine; revive only as a self-test "mixed review" option |
| recall-test screen | orphaned (push-deep-link only) | **RETIRE the screen**; keep the engine (load-bearing for relearn) |
| Quiz mid-round prefetch | dead code | **DELETE** (or wire it — Play Again currently re-generates) |
| `gap_fill` chrome | fixed: Gap Check chrome exists | **DONE for chrome** — broader mode collapse may still fold it into `tutor` with `gaps[]` |
| relearn method-picker | cosmetic (never persisted) | **DELETE** (or wire `setTeachingPreference`) |
| freeform "Write note" alert | fixed: topicless CTA/editor suppressed | **DONE for alert**; "Loose notes" remains optional future work |

---

## Open questions (proposal-specific)

1. **Quiz↔Assessment merge** — accept "one self-test surface (recall→explain→transfer with a playful recall tier)" and retire the standalone "Assessment" label? (Recommended.)
2. **Challenge Round** — ship the learner-initiated "Challenge me" reshape, or keep parked? It earns nothing flag-off today.
3. **Devil's-Advocate for under-15s** — opt-in banner, or cut entirely for the younger cohort? (The silent-lie-to-a-13-year-old path is the highest-risk surface in the doc.)
4. **Mode collapse to 3** — confirm `tutor`/`review`/`homework` + `entryPoint` telemetry, vs a softer 5-mode trim.
5. **Talk-first Path 0** — confirm the product is willing to attach a session to a subject *after* the first turn (eventually-consistent), which is the crux of removing the cold-start gauntlet.
6. **Review→SM-2 hardening** — calibration grading exists, but derive/force a quality source for no-quality/cooldown edges, or make those edges visible. Either way, a review must not appear to count while silently doing nothing.
7. **Supporter digest** — willing to fold the Recaps tab into a per-child digest and demote the 7 deeper child screens behind progressive disclosure?

---

*Companion to [`learning-path-flows.md`](learning-path-flows.md) — that doc is the code-true CURRENT state; this doc is the proposed end state. Where they disagree, the current doc wins on facts and this doc wins on direction.*
