# LLM Personalization Audit — All Flows

**Date:** 2026-04-18
**Status:** Phase 1 — Discovery (no code changes)
**Owner:** Zuzana + Claude
**Follow-up:** Phase 2 (eval harness) + Phase 3 (iterative tuning) gated on review of this spec

## Purpose

Before tuning any LLM prompt, we need a complete map of:

1. **Every place the codebase calls an LLM** — the prompts are scattered across services, not centralized
2. **What user context each prompt currently uses** — to find flows that ignore personalization data we already have
3. **What personalization data exists but sits unused** — the biggest leverage for tuning
4. **A prioritized list of tuning opportunities** — so Phase 3 is driven by impact, not whichever prompt is most familiar

This audit is the input to a later eval-harness build and iterative tuning pass.

## How this codebase routes LLM calls

- Every call goes through `routeAndCall` or `routeAndStream` in [`services/llm/router.ts`](../../apps/api/src/services/llm/router.ts)
- No direct provider SDK imports exist outside `services/llm/providers/`
- Router selects provider/model by **rung** (1–5 escalation level) and **llmTier** (standard/premium/flash)
- Routing table:
  - Rung 1–2 standard → `gemini-2.5-flash` (primary), `gpt-4o-mini` (fallback)
  - Rung 3+ standard → `gemini-2.5-pro` (primary), `gpt-4o` (fallback)
  - Premium tier → `claude-sonnet-4-6` (Anthropic)
  - Flash tier → always cheapest
- Router prepends an **age-aware safety/identity preamble** before any service-supplied prompt
- Circuit breaker + retry + Gemini → OpenAI fallback are built in

This is good architecture — tuning happens at the **service-supplied prompt layer**, and the router stays stable.

## The LLM surfaces

Nine distinct prompt surfaces exist. Listed in rough order of user visibility/impact:

| # | Flow | File | Function | User-visible role |
|---|---|---|---|---|
| 1 | Live exchange (tutoring loop) | [`services/exchanges.ts`](../../apps/api/src/services/exchanges.ts) | `buildSystemPrompt(context)` at L218–572 | The tutor the learner talks to |
| 2 | Post-session profile analysis | [`services/learner-profile.ts`](../../apps/api/src/services/learner-profile.ts) | `SESSION_ANALYSIS_PROMPT` at L35 | Silent — updates the profile |
| 3 | Topic filing / categorization | [`services/filing.ts`](../../apps/api/src/services/filing.ts) | `buildPostSessionPrompt`, `buildPreSessionPrompt` at L270 | Library organization |
| 4 | Quiz — Capitals | [`services/quiz/generate-round.ts`](../../apps/api/src/services/quiz/generate-round.ts) | `buildCapitalsPrompt` at L47 | Multiple-choice capitals questions |
| 5 | Quiz — Vocabulary | [`services/quiz/vocabulary-provider.ts`](../../apps/api/src/services/quiz/vocabulary-provider.ts) | `buildVocabularyPrompt` at L161 | Language vocabulary MCQs |
| 6 | Quiz — Guess Who | [`services/quiz/guess-who-provider.ts`](../../apps/api/src/services/quiz/guess-who-provider.ts) | `buildGuessWhoPrompt` at L83 | Famous-person clue quiz |
| 7 | Dictation — Generate | [`services/dictation/generate.ts`](../../apps/api/src/services/dictation/generate.ts) | `buildGeneratePrompt` at L37 | Generated dictation passages |
| 8 | Dictation — Review (multimodal) | [`services/dictation/review.ts`](../../apps/api/src/services/dictation/review.ts) | `SYSTEM_PROMPT` at L19 | OCR + feedback on child's handwriting |
| 9 | Dictation — Prepare Homework | [`services/dictation/prepare-homework.ts`](../../apps/api/src/services/dictation/prepare-homework.ts) | `SYSTEM_PROMPT` at L17 | Splits homework text into sentences |

## Per-flow audit

For each surface: what context it uses, what response shape it expects, and **what personalization it misses**.

### 1. Live Exchange (the tutoring loop)

**Status:** Most personalization-wired surface. Moderate tuning opportunities.

**Context interpolated into prompt:**

- `ageBracket` → drives child/teen/adult voice register via `getAgeVoice()`
- `learningMode` (serious/casual) → adds pacing/tone guidance
- `learnerMemoryContext` — built by `buildMemoryBlock()` — includes **struggles**, **interests** (top 5), **learning style**, **communication notes**, recently resolved topics
- `accommodationContext` — built by `buildAccommodationBlock()` — prepended first if parent set short-burst / audio-first / predictable mode
- `priorLearningContext` — completed topics with mastery scores
- `crossSubjectContext` — recent activity from other subjects
- `embeddingMemoryContext` — pgvector similarity search over past session embeddings
- `teachingPreference` (per subject) — "learns best with step-by-step / diagrams / examples"
- `analogyDomain` — "use analogies from cooking / sports / gaming"
- `nativeLanguage` — for direct grammar explanation in language-learning subjects
- `knownVocabulary` — mastered vocabulary terms (up to 60) for language-learning subjects
- `retentionCard` SM-2 state — drives verification mode (evaluate vs teach-back)

**Missing or weakly-used personalization:**

- **`strengths`** (captured into `learning_profiles.strengths`) — NOT included in `buildMemoryBlock`. Only struggles/interests/style/comms are surfaced. Easy fix.
- **`urgency_boost_reason`** (the detected deadline e.g. "Maths exam next week") — written but not referenced in subsequent exchange prompts. The tutor doesn't know the kid has a test coming.
- **`parking_lot_items`** (questions the learner parked mid-session) — surfaced only in UI, not re-injected at next session start.
- **`session_summaries.content`** (what the learner *said* they learned) — not re-injected as prior context.

**Response shape:** Free-text streaming to client. Some branches return structured JSON (`structured_assessment` on EVALUATE / TEACH_BACK).

**Tuning opportunities:**

- A) Inject strengths alongside struggles — "The learner has mastered X and Y, reference that when building on"
- B) Inject active urgency signal — "The learner has a {subject} test in {days} days. Prioritize gaps that are likely to appear."
- C) Re-inject last session's summary + parking-lot questions at next session start
- D) Audit the age bracketing — check if the child/teen/adult split produces appropriate voice for the 7yo dinosaur kid vs the 12yo spacey kid

---

### 2. Post-session Profile Analysis

**Status:** Single prompt at [`services/learner-profile.ts:35`](../../apps/api/src/services/learner-profile.ts). Writes back to `learning_profiles`.

**Prompt outline:**

```
You are analyzing a tutoring session transcript between an AI mentor and a young learner.
Extract the following signals from the conversation. Be conservative and only include signals with real evidence.
Return valid JSON only using this shape: { explanationEffectiveness, interests, strengths, struggles, resolvedTopics, communicationNotes, engagementLevel, confidence, urgencyDeadline }
Subject: {subject}
Topic: {topic}
<learner_raw_input>{rawInput}</learner_raw_input>
```

**Context interpolated:** `subject`, `topic`, `rawInput`.

**Missing personalization — important:**

- **No age input** — a 7yo shouting "I'M DONE" and a 16yo saying "I'm done" are very different engagement signals; the model currently treats them the same.
- **No existing struggles/strengths list** — the extractor can emit duplicate-ish struggles because it doesn't know what's already recorded.
- **No `suppressed_inferences`** — prompt doesn't know which interests/topics the learner explicitly deleted and doesn't want re-inferred. The suppression is applied *after* extraction in `mergeInterests()`, but the LLM wastes tokens on things that will be dropped.

**Response shape:** Structured JSON → parsed → `applyAnalysis()` writes back.

**Tuning opportunities:**

- Inject `ageYears` so engagement/confidence is age-calibrated
- Inject existing struggles/interests lists as "already known, extract new only" — could reduce duplicates by 80%+
- Inject `suppressed_inferences` so the model won't re-surface them

---

### 3. Topic Filing

**Status:** Pure categorization, two branches (pre-session raw input vs post-session transcript). Prompt at [`services/filing.ts:270`](../../apps/api/src/services/filing.ts) (`buildPostSessionPrompt` / `buildPreSessionPrompt`).

**Context interpolated:** session transcript OR raw input, library index (shelves/books/chapters), `isSparse` flag.

**Missing personalization:**

- No `ageYears` or `ageBracket` — when it auto-creates new topic titles and descriptions, they aren't age-calibrated. "Photosynthesis" for a 6yo should probably be titled "How plants eat sunlight" instead.
- No `interests` — when choosing whether to create a new book or reuse one, doesn't know the learner's broader motivation.
- No `learning_style` — description copy isn't pace/style-aware.

**Response shape:** Structured JSON `{ extracted, shelf, book, chapter, topic }`.

**Tuning opportunities (lower priority — filing is behind-the-scenes):**

- Inject `ageYears` to calibrate new topic title/description wording
- Inject top 3 interests so the categorizer prefers reuse when semantically close to an existing library area

---

### 4. Quiz — Capitals

**Status:** Prompt at [`services/quiz/generate-round.ts:47`](../../apps/api/src/services/quiz/generate-round.ts).

**Full prompt signature:**

```
You are generating a multiple-choice capitals quiz for a {ageLabel} learner.
Activity: Capitals quiz
{themeInstruction}
Questions needed: exactly {discoveryCount}
{exclusions}  // recentAnswers
Rules: 3 distractors each, plausible city names, age-appropriate fun facts, coherent theme.
[+ optional DIFFICULTY BUMP appended if on a streak]
```

**Context interpolated:** `discoveryCount`, **coarse** `ageBracket` (child/teen/adult), `recentAnswers` (exclusions), `themePreference`, `difficultyBump` flag.

**Missing personalization — major gaps:**

- **Interests completely ignored.** A 9yo who loves dinosaurs, a 9yo who loves football, and a 9yo who loves space all get the same capital quiz. Capitals quiz should theme by interest — "Capitals of countries where you can still find dinosaur fossils", "Capitals of World Cup host nations", "Capitals with famous space observatories".
- **Library topics ignored.** Learner is studying Ancient Rome → quiz should prefer Italian/Mediterranean capitals.
- **Struggles ignored.** Learner keeps confusing Austria ↔ Australia → capitals round should surface both this session with distinct fun facts that help disambiguate.
- **`quiz_missed_items` exist in the DB but are only used in the mastery provider for SM-2 review — the LLM prompt itself doesn't reference past misses.**
- **No native language context.** Czech kid vs English kid should see capitals rendered in native-language variants where relevant.
- **Age bracket is coarse** (child/teen/adult) vs dictation which uses `ageYears` with 4 finer buckets (≤7/≤10/≤13/adult).

**Response shape:** Structured JSON → Zod `capitalsLlmOutputSchema`.

**Tuning priority: HIGH.** Low-hanging fruit because so little personalization is wired in. Adding interests + library topics would be a clear qualitative step up.

---

### 5. Quiz — Vocabulary

**Status:** Prompt at [`services/quiz/vocabulary-provider.ts:161`](../../apps/api/src/services/quiz/vocabulary-provider.ts).

**Context interpolated:** `discoveryCount`, `ageBracket`, `recentAnswers`, **`bankEntries`** (already-mastered vocab — excluded), **`languageCode`**, **`cefrCeiling`**, `themePreference`.

**Already strong on:**

- Mastered vocabulary exclusion (prevents repeats)
- CEFR ceiling enforcement
- Language code

**Missing personalization:**

- **Interests ignored.** A kid studying Spanish who loves horses should get "el caballo" / "la montura" / "el potro" themed rounds, not generic "Spanish Animals".
- **`struggles`** and `quiz_missed_items` ignored in prompt — the SRS picker promotes missed items but the LLM doesn't know *which* missed items to surface against.
- **Learning style ignored.** `preferredExplanations: 'stories'` → vocabulary round could offer words embedded in a mini-story; currently just a list.
- **Native language ignored.** A Czech native learning Spanish vs an English native learning Spanish benefit from different distractor strategies (false cognates differ by L1).

**Tuning priority: HIGH.** Biggest wins: interests-driven themes + native-language-aware distractors.

---

### 6. Quiz — Guess Who

**Status:** Prompt at [`services/quiz/guess-who-provider.ts:83`](../../apps/api/src/services/quiz/guess-who-provider.ts).

**Context interpolated:** `discoveryCount`, `ageBracket`, `recentAnswers`, **`topicTitles`** (from learner's curriculum — "at least 2 of N people MUST relate clearly to these"), `themePreference`.

**Already strong on:**

- Curriculum topic alignment — people chosen relate to what learner is studying
- Age bracket used for "broadly appropriate" famous people

**Missing personalization:**

- **Interests ignored.** Kid loves art → more artists. Kid loves basketball → more athletes. Currently blind to this.
- **Cultural context ignored.** Czech kid with Czech native language should more often see Czech-recognizable historical figures (Komenský, Masaryk, Havel) rather than defaulting to US-centric pantheon. Currently neither `location` nor `nativeLanguage` is passed.
- **Struggles ignored.** If they missed Marie Curie last time, good to reinforce her at a lower clue difficulty in this round.

**Tuning priority: MEDIUM.** Curriculum alignment is already there — the biggest missing piece is cultural/locale context.

---

### 7. Dictation — Generate

**Status:** Prompt at [`services/dictation/generate.ts:37`](../../apps/api/src/services/dictation/generate.ts). **This flow has the most sophisticated age handling** and uses fine-grained `ageYears` (≤7, ≤10, ≤13, adult) with distinct literary theme sets.

**Context interpolated:** `ageYears`, `nativeLanguage` (for punctuation names and content language).

**Age calibration is deep here:**

- ≤7 → fairy tales, fables, Brothers Grimm, Aesop, animal stories
- ≤10 → Narnia, Roald Dahl, Astrid Lindgren
- ≤13 → Harry Potter, Percy Jackson, Jules Verne
- adult → Hemingway, Kafka, Čapek

Sentence length, punctuation complexity, and chunking all scale with age. This is the model for how other flows *should* handle age.

**Missing personalization:**

- **Interests completely ignored.** A 9yo dinosaur fan and a 9yo horse fan get identical "Narnia-themed" dictation. Dictation topics should be themed by interest where possible, keeping the literary style age-appropriate.
- **Library topics ignored.** If the learner is actively studying WWII, a short narrative passage set in that period doubles as dictation + content reinforcement. Currently zero integration.
- **Struggles ignored.** Which spelling patterns does this kid keep missing? Prompt could explicitly target those — "include one sentence with a silent-letter pattern the learner finds tricky".
- **Learning style ignored** (though the hard-coded literary framing partly compensates).

**Tuning priority: HIGH.** Dictation is read aloud daily — personalization pays off every practice session.

---

### 8. Dictation — Review (multimodal OCR + feedback)

**Status:** Prompt at [`services/dictation/review.ts:19`](../../apps/api/src/services/dictation/review.ts). Handles handwritten image + original sentences, outputs structured error list.

**Context interpolated:** original sentences, image (base64), `language`.

**Missing personalization:**

- **No age.** Explanations of mistakes are written in the child's language but not calibrated to age. A 6yo and a 14yo get the same explanation complexity.
- **No learning style.** A kid who responds to humor could get gently funny explanations; a kid who prefers step-by-step could get a 1-2-3 breakdown. Currently a single register.
- **No struggle history.** The review doesn't know "this kid's recurring issue is capitalization after commas" — it just reports individual mistakes in isolation.

**Tuning priority: MEDIUM.** Lower audience (parent reads review more than child) but the explanation quality matters for self-correction.

---

### 9. Dictation — Prepare Homework

**Status:** Pure utility ([`services/dictation/prepare-homework.ts:17`](../../apps/api/src/services/dictation/prepare-homework.ts)). Splits a homework text into sentences with spoken-punctuation variants and chunks.

**Context interpolated:** just the raw text.

**Tuning priority: NONE.** Appropriately impersonal. Skip.

---

## Cross-flow patterns

### A. Age handling is inconsistent

- Dictation generate: fine-grained `ageYears` with 4 buckets and literary theme scaling
- Exchanges: coarse `ageBracket` (child/teen/adult) via `getAgeVoice()`
- Quizzes: same coarse `ageBracket`
- Session analysis + filing + dictation review: no age input at all

**Recommendation:** Standardize on `ageYears` as the input and let each prompt decide its own bucketing. `describeAgeBracket` is lossy.

### B. Interests data is collected but only used in exchanges

`learning_profiles.interests` (up to 20 labels with staleness timestamps) is written by session analysis and surfaced only in `buildMemoryBlock` → exchange prompts.

**All six quiz + dictation flows ignore interests entirely.** This is the single biggest personalization gap in the codebase. Fixing it across all flows is the most impactful Phase 3 change.

### C. Struggles data is collected but rarely surfaced beyond exchanges

- `learning_profiles.struggles` → only used in `buildMemoryBlock` for exchanges
- `quiz_missed_items` → used by mastery provider for SRS but not surfaced in the LLM prompt
- `needs_deepening_topics` → exists, sometimes written, but no consumer wires it into a prompt

**Recommendation:** Add a "recent struggles" string block that every generation prompt can optionally include.

### D. Library-topic integration is partial

- `guess-who-provider.ts`: uses topic titles (strong)
- `capitals`, `vocabulary`, `dictation`: ignore library topics (weak)
- `filing`: uses library index for categorization (correct by design)

### E. Native language handled only in language-adjacent flows

- `dictation/generate.ts`, `vocabulary-provider.ts`: use `nativeLanguage`
- `capitals`, `guess-who`, `dictation/review`, `exchanges`: could use it for cultural context + explanation language but currently don't (except exchanges where it's wired for language subjects only)

### F. Prompts are scattered — tuning is hard to A/B

- No centralized `prompts/` directory
- Prompts live co-located with business logic inside large services (700-line `exchanges.ts`, 1400-line `learner-profile.ts`)
- No typed PromptInput → string function signature convention — each flow invented its own

**Recommendation:** Phase 2 refactor: extract prompt builders into per-flow `prompts/` sub-modules with a consistent shape:

```ts
export type CapitalsPromptInput = { … };
export function buildCapitalsPrompt(input: CapitalsPromptInput): { system: string; user: string };
```

This makes each prompt unit-testable and eval-harness-addressable.

## Prioritized tuning backlog

Ordered by (user impact) × (ease of implementation), highest first.

### P0 — High impact, low effort

1. **Inject `interests` into all quiz generation prompts** (capitals, vocabulary, guess-who) and dictation generate.
   - Data exists in `learning_profiles.interests` already
   - Prompt change only; no schema work
   - Effect: every learner's daily quizzes become personalized

2. **Inject `ageYears` everywhere (not just dictation generate)** — replace coarse `ageBracket` in quiz prompts. Let each prompt decide its own buckets.

3. **Inject existing struggles + suppressed inferences into session analysis prompt** — reduces duplicate extractions.

### P1 — High impact, medium effort

4. **Wire `quiz_missed_items` into next-round generation prompts** — "You've recently missed: X, Y, Z. Include these at lower difficulty to reinforce."
   - Requires a new accessor function similar to `getRecentAnswers` but for misses

5. **Inject library topics into capitals and vocabulary quiz prompts** — so a kid studying Ancient Rome gets more Mediterranean-themed capitals and Latin-root vocabulary.

6. **Inject `strengths` into `buildMemoryBlock`** — currently only struggles surfaced. Adding strengths lets the tutor build on what the learner knows.

7. **Inject `urgency_boost_reason` into exchange prompts** — the tutor should know about the upcoming test.

### P2 — Medium impact, requires refactoring

8. **Extract prompts into per-flow `prompts/` modules** with typed input shapes and a shared `PromptBuilder<Input>` signature. Required before eval harness is sustainable.

9. **Build Phase 2 eval harness** — fixture-based profile matrix, side-by-side output comparison, commit to `scripts/eval-llm/`.

10. **Dictation review: inject age + struggle history** into the review prompt so explanations are age-calibrated and recurring-pattern-aware.

### P3 — Nice to have

11. Inject `location` + `nativeLanguage` into guess-who for cultural context.
12. Re-inject last session's summary + parking-lot questions at next session start.
13. Per-subject `teachingPreferences` into quiz/dictation (currently only exchanges).

## Phase 2 scope (proposed)

**Goal:** Build a repeatable eval harness so Phase 3 tuning is data-driven.

**Deliverables:**

1. `fixtures/profiles/` — 6–10 synthetic learner profiles covering the age × interest × level × locale matrix
2. `scripts/eval-llm/` — one script per flow that runs all profiles through the prompt and writes outputs to disk for diff review
3. Per-prompt `.md` snapshot files in `apps/api/src/services/**/prompts/__snapshots__/` — committed so prompt changes show in PRs as readable diffs
4. A single `pnpm eval:llm` command that runs all flows and regenerates snapshots

**Not in Phase 2:** No prompt changes. Phase 2 is the measurement layer. Changes happen in Phase 3 once we can see before/after side-by-side.

## Phase 3 scope (proposed)

**Goal:** Iterative tuning of each flow using the eval harness.

**Process per flow:**

1. Run eval harness with current prompt → capture baseline outputs
2. Apply one tuning change (e.g. "inject interests")
3. Re-run eval, diff outputs, Zuzana reviews
4. If improvement, commit + move to next change. If regression, revert + try different approach.
5. Move to next flow

**Order of flows:** P0 items first (interests in quizzes + dictation), then P1 items. Dictation review and filing last.

## Open questions for Zuzana

1. **Provider target for tuning** — do we optimize prompts against Gemini (your default primary) or Claude (premium tier)? Cross-provider tuning adds complexity; starting with one simplifies Phase 3.
2. **Age bucket standardization** — do you like dictation's 4-bucket approach (≤7, ≤10, ≤13, adult) as the canonical one, or do you want finer/coarser granularity?
3. **Interest injection ceiling** — top 3? top 5? currently exchanges use top 5. Wider surfaces (quizzes) may want fewer to avoid steering too hard.
4. **Do we want parents able to see/override personalization signals** before they hit LLM prompts? E.g. a parental "remove 'Roblox' from interests" UI — partially exists via `suppressed_inferences`.
5. **Eval harness: burn LLM credits, or snapshot once and only re-run on prompt changes?** Fully running 9 flows × 10 profiles × every push is expensive. Snapshot-on-change is cheaper.

---

**Next step:** Zuzana reviews this spec. If P0+P1 list looks right, we kick off Phase 2 (eval harness). If you'd rather skip the harness and tune one flow interactively first (e.g. pick capitals quiz as the pilot), that also works.
