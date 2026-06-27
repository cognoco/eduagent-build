---
title: Challenge Round Simulated-Learner Harness — Implementation Plan
date: 2026-06-26
profile: code
spec: docs/specs/2026-06-03-review-relearn-findings-and-high-impact-todos.md (RR-2 / RR-6)
status: implemented
---

# Challenge Round Simulated-Learner Harness — Implementation Plan

**Goal:** A dual-agent simulator that generates non-scripted, multi-turn Challenge
Round transcripts at scale (topic × persona × N runs) and measures the mastery
gate against a known ground truth — to **complement** RR-2 with a synthetic
pre-screen (it does **not** discharge RR-2's real-staging-transcript dependency —
see "Synthetic ⇒ provisional" below) and feed the **mastery-bar half** of RR-6
calibration, while de-risking the gpt-oss signal-drop blocker on RR-12 across the
whole topic space. **Note-overlap (`MIN_LEXICAL_OVERLAP_NOTE_DRAFT`) calibration is
explicitly out of scope here** — see the DB-free bullet for why.

**Approach:** A standalone CLI under `apps/api/eval-llm/` (not a single-turn
`FlowDefinition` — those can't represent a 6-turn conversation). One LLM plays the
**learner** (a pinned OpenRouter model, given a hidden competence brief); the **real
mentor pipeline** responds (`buildSystemPrompt` → `runHarnessLlm`); the pure state
machine (`transitionChallengeState`) and the pure mastery gate
(`decideMasteryAndReview`) run in-memory, DB-free. The driver compares the gate's
outcome to each scenario's ground truth to compute over-credit / under-credit rates.

## Why standalone, and what it deliberately does NOT do

- **Not a `FlowDefinition`.** The flow contract is single-turn (`buildPrompt` →
  `runLive` → one string). A multi-turn loop reusing the runner's LLM client +
  bootstrap is cleaner than shoehorning a serialized transcript through `runLive`.
- **DB-free by design.** `decideMasteryAndReview` is pure and is used for real. The
  production path also calls `validateEvaluationEventIds` (DB lookup that swaps
  `learnerQuote` for the real `session_events.content`) — the harness does **not**,
  because there is no seeded DB. The simulator therefore measures the *LLM contract +
  mastery decision*, not the DB-anchoring step (that stays covered by
  `evaluation.test.ts` + integration tests). This is a stated limitation, not a gap to
  fix here.
- **Note-overlap calibration is NOT in scope (consequence of the two points above).**
  `MIN_LEXICAL_OVERLAP_NOTE_DRAFT = 0.4` (`caps.ts`) is consumed *only* by
  `validateNoteDraft(draft, solidLearnerQuotes, verifiedEventContents)`
  (`challenge-round/note-draft.ts`), which measures overlap between a **drafted note**
  and the **verified DB learner-event content**. This harness produces neither — it
  stops at `decideMasteryAndReview` (no drafting step) and is DB-free (no
  `verifiedEventContents`). The only overlap it *could* compute is `learnerQuote`
  (the mentor's paraphrase) vs the learner-LLM answer, which is the degenerate
  paraphrase-self-overlap case BUG-483/WI-1056 hardened the guard against — not the
  quantity 0.4 thresholds. `note-draft.ts` itself states the calibration histogram
  must come from the *drafting* scenarios. RR-6's note-overlap half therefore stays
  blocked on a drafting-path harness or real transcripts; this plan feeds only the
  mastery-bar half.
- **Synthetic ⇒ provisional; does NOT discharge RR-2.** A model playing a 14-year-old
  emits model-shaped, not teen-shaped, answers. Per spec constraint **CH-4**, any bar
  tuned on this corpus is **provisional** and the post-launch recalibration gate against
  real learner data still stands. Critically, RR-2 is explicitly "dogfood the dark
  Challenge Round **in staging**; read **real** transcripts … the corpus to calibrate
  against" — and RR-6 *depends RR-2*, RR-12 *depends RR-2, RR-6*. A synthetic corpus is a
  **complement / pre-screen**, not a substitute: it must **not** be read as "RR-2 done"
  and must **not** unblock the RR-12 production flip. The dependency chain still requires
  real staging dogfood transcripts. The README and metrics output must say so.
- **Scope is active→complete.** v1 starts each round in `active` state (mirroring
  `flows/challenge-round-mastery.ts`) and drives to `complete`. The offer / accept /
  decline FEEL path is a documented extension, not v1.

## The one guardrail that makes the data valid

The learner model and the mentor/grader model **must differ**. If the same model
plays the learner and grades the evaluation, correlated errors inflate the `solid`
rate and produce a falsely lenient bar. The guard must hold in **both** mentor modes,
including the **default** one:

1. **Explicit candidate** (`--mentor-model X`): refuse when `X === learnerModel`.
2. **Production routing** (`--mentor-model` omitted, `mentorModel === null` — the
   default): resolving "is the mentor the same model as the learner?" cannot be skipped
   just because the model is implicit. The driver resolves the concrete slug the
   production router would use for the mentor's rung and applies the same equality check.
3. **Slug equality is necessary but not sufficient** — the same underlying model can be
   served under a different slug/provider (learner via OpenRouter, mentor via the native
   provider). So the guard *also* compares the vendor/base-model token (the part before
   `/` and the base family, e.g. `gpt-oss`, `claude-3.5-sonnet`) and refuses on a family
   match. It emits a warning that this check is heuristic; to run a deliberately
   same-family A/B you must pass an explicit override flag.

Each persona also carries a **hidden ground-truth competence** (holds misconception X /
half-understands / nails it) so the gate's over-credit rate is *measurable*, not assumed.

## Scope

In scope (all new files unless noted):
- `apps/api/eval-llm/fixtures/challenge-personas.ts`
- `apps/api/eval-llm/runner/learner-agent.ts`
- `apps/api/eval-llm/runner/simulated-conversation.ts`
- `apps/api/eval-llm/runner/simulation-metrics.ts`
- `apps/api/eval-llm/simulate.ts` (CLI entry)
- `apps/api/package.json` (add `eval:llm:sim` script — edit)
- `apps/api/.gitignore` or root `.gitignore` (ignore `eval-llm/corpus/` — edit)
- `apps/api/eval-llm/README.md` (new section — edit)
- co-located `*.test.ts` for the three `runner/` modules

Out of scope (must not change):
- `apps/api/src/services/challenge-round/**` (production code — reused, never edited)
- `apps/api/src/config.ts` (`CHALLENGE_ROUND_RUNTIME_ENABLED` is NOT flipped here)
- `apps/api/eval-llm/baseline.json` and the existing single-turn flows
- `apps/api/eval-llm/index.ts` (the simulator has its own entry; do not register a
  fake flow)

## Reused production/harness primitives (verified signatures)

- `transitionChallengeState(prev, event)` — `challenge-round/state.ts`; events
  `start{totalQuestions}` → `active`, `answer_complete{evaluation}` → `active|drafting`,
  `complete` → `complete`. `MAX_CHALLENGE_QUESTIONS = 3` (`caps.ts`).
- `decideMasteryAndReview(evals): MasteryDecision` — `challenge-round/evaluation.ts`;
  `outcome ∈ verified|partial|reteach|invalid`, `markMasteryVerified`, `reviewTargets`.
- `buildSystemPrompt(ctx)` + `buildExchangeSourceEvidence(ctx, answer)` —
  `src/services/exchanges.ts` (same calls `flows/challenge-round-mastery.ts` makes).
- `runHarnessLlm(messages, rung, opts)` — `runner/llm-client.ts` (mentor turn;
  production routing, or candidate via the existing `--openrouter-model` override).
- `callOpenRouterModel(messages, slug, opts)` — `runner/llm-bootstrap.ts` (learner turn;
  `opts = { maxTokens, responseFormat, reasoningEffort }` — **no per-call `provider`
  field**; host pinning is the module-global `setOpenRouterProviderPin(order)`, see T2/T5).
- `parseEnvelope(response, surface)` — `src/services/llm/envelope.ts`. This is the
  **production** extraction path (`extractFirstJsonObject` → `JSON.parse` w/ bare-quote
  repair → `llmResponseEnvelopeSchema.safeParse`); `exchanges.ts` reads
  `signals.challenge_round_evaluation` only on its `ok:true` branch. The harness MUST use
  this — **not** `parseFirstJsonObject` — so the measured signal-emission rate reflects
  what production actually accepts (a schema-violating envelope is a drop in prod), and so
  the items fed to `decideMasteryAndReview` are Zod-validated. (The standalone simulator
  has no runner, so `parseEnvelope` is its only schema-validation step.) Mandated by the
  CLAUDE.md non-negotiable: state-machine signals are parsed with `parseEnvelope()`.

## Tasks

- [x] **T1: Persona + ground-truth competence fixtures.**
  Create `fixtures/challenge-personas.ts` exporting `CHALLENGE_SIM_SCENARIOS:
  ChallengeSimScenario[]`. Each scenario references an existing `EvalProfile.id`
  (from `fixtures/profiles.ts`), and adds: `subjectName`, `topicTitle`,
  `topicDescription`, `seedQuestion` (the mentor's first "explain why" question),
  `concepts: string[]`, a hidden `competenceBrief` (instruction to the learner LLM,
  e.g. *"You confidently hold this WRONG reasoning: …; never correct yourself"*),
  and `expectedOutcome: 'verified' | 'partial' | 'reteach'`. Seed ≥6 scenarios
  spanning all three expected outcomes and ≥4 of the 5 profiles, reusing the
  existing CRM fixtures' topics (fossilization=verified, dividing-fractions
  misconception=partial, ser-vs-estar vague=partial/reteach) plus new ones.
  *Done when:* `challenge-personas.test.ts` asserts every scenario has a resolvable
  profile id, ≥1 concept, a non-empty `competenceBrief`, and a valid `expectedOutcome`;
  `pnpm exec nx run api:typecheck` clean.

- [x] **T2: Learner agent.**
  Create `runner/learner-agent.ts` exporting `runLearnerTurn(args): Promise<string>`
  where `args = { scenario, profile, mentorQuestion, history, learnerModel }`. It builds
  a learner system prompt embedding the persona (age/interests/level from the profile) +
  the hidden `competenceBrief` + an instruction to answer **in character, one short
  reply, never break character or self-correct**, then calls
  `callOpenRouterModel(messages, learnerModel, {…})` and returns the raw reply text
  (plain text, not JSON). **No per-call provider pin** — `callOpenRouterModel`'s `opts`
  has no `provider` field; host pinning is module-global (`setOpenRouterProviderPin`,
  wired from `--provider` in T5) and applies to *every* OpenRouter call this run,
  including a mentor candidate. So `--provider` is only safe when the mentor is
  production-routed (native providers), or when both learner and mentor candidate are
  intended to share the pinned host — document this in the README (T6).
  *Done when:* `learner-agent.test.ts` mocks **only** `callOpenRouterModel` (external
  provider boundary — allowed) and asserts (a) the system prompt contains the
  competence brief and the mentor question, (b) the function returns the model's text
  verbatim. No internal mocks.

- [x] **T3: Conversation loop driver.** *(see `## Driver interface` for the exact shape)*
  Create `runner/simulated-conversation.ts` exporting `runSimulatedRound(args):
  Promise<SimulatedRoundResult>`. **Seed the state machine via the real transitions, not
  by hand-constructing `active`.** `transitionChallengeState`'s `answer_complete` requires
  *both* `questionIndex` and `totalQuestions` to be set (`state.ts`: a state missing
  `totalQuestions` is treated as corrupt and routed straight to `drafting`, terminating
  the loop after one turn). Only the `start` transition writes `totalQuestions`. So drive
  `undefined → offer{topicId} → accept → start{ totalQuestions: MAX_CHALLENGE_QUESTIONS }`
  to obtain a consistent `active` seed, then mirror `(state, questionIndex)` into the
  per-turn `ExchangeContext` (which also carries `challengeRuntimeEnabled: true` and a
  per-question directed `currentUserMessageEventId`). Loop up to
  `MAX_CHALLENGE_QUESTIONS`: learner answers (T2) → mentor turn (`buildSystemPrompt` +
  `buildExchangeSourceEvidence` + `runHarnessLlm`) → **`parseEnvelope(response,
  'exchange.session')`** (production path; an `ok:false` result counts as a dropped
  signal, exactly as production would treat it) → pull `signals.challenge_round_evaluation`
  → `transitionChallengeState(prev, {type:'answer_complete', evaluation})`; stop when state
  becomes `drafting`; then `transitionChallengeState(…, {type:'complete'})` and
  `decideMasteryAndReview(allEvals)`. **Enforce the two-model guard up front** (see "The
  one guardrail …"): throw on slug equality, *and* — when `mentorModel === null`
  (production routing) — resolve the router's concrete mentor slug and apply the same
  check plus the vendor/base-family heuristic. Captures the full transcript, all evals,
  the `MasteryDecision`, and `signalEmitted` (false if any active turn's `parseEnvelope`
  failed or returned zero eval items — the gpt-oss guard).
  *Done when:* `simulated-conversation.test.ts` mocks **only** the two LLM boundaries
  (`runHarnessLlm`, `callOpenRouterModel`) and, using a scripted misconception
  envelope, asserts: (1) the loop terminates at `complete` after exactly
  `MAX_CHALLENGE_QUESTIONS` answered turns (proving the `start`-seeded `totalQuestions`
  drives the terminal condition — a seed missing `totalQuestions` would terminate after
  one), (2) evals accumulate across turns, (3) `decideMasteryAndReview` outcome equals the
  scenario's `expectedOutcome`, (4) a same-slug mentor/learner config throws, **and a
  same-base-family config throws** (5) a schema-violating or zero-eval mentor turn sets
  `signalEmitted=false`. Real `transitionChallengeState` + `decideMasteryAndReview` +
  `parseEnvelope`.

- [x] **T4: Corpus + calibration metrics.**
  Create `runner/simulation-metrics.ts` exporting `aggregate(results:
  SimulatedRoundResult[]): SimMetrics` and `writeCorpus(dir, results, metrics)`.
  `SimMetrics` includes: outcome distribution (`verified/partial/reteach/invalid`
  counts + rates), per-result-value concept histogram
  (`solid/partial/missing/misconception`), `masteryVerifiedRate`, **`overCreditRate`**
  (gate said `verified` but scenario `expectedOutcome !== 'verified'`),
  `underCreditRate` (gate `partial`/`reteach` but expected `verified`), and
  `signalEmissionRate` (share of rounds with `signalEmitted=true`, per mentor model).
  **No note-overlap histogram** — that metric needs a drafting step + verified DB
  content this harness deliberately does not produce (see the DB-free / note-overlap
  bullets above); RR-6's note-overlap half is not fed here. `writeCorpus` writes one
  transcript JSON per round to `eval-llm/corpus/<timestamp>/` plus a `metrics.json`
  summary.
  *Done when:* `simulation-metrics.test.ts` feeds synthetic `SimulatedRoundResult[]`
  (including one over-credited and one signal-dropped round) and asserts
  `overCreditRate`, `underCreditRate`, and `signalEmissionRate` compute correctly.

- [x] **T5: CLI entry + npm script.**
  Create `simulate.ts` with flags: `--learner-model <slug>` (**required**),
  `--mentor-model <slug>` (optional candidate; default = production routing),
  `--provider <slug>` (optional learner host pin — **module-global**, applied via
  `setOpenRouterProviderPin` *before* bootstrap; see T2 for the contamination caveat),
  `--topics <csv|all>`, `--runs <n>` (default 1), `--max-live-calls <n>` (default 30),
  `--list`, `--allow-same-family` (override for a deliberate same-base-family A/B).
  **`--list` and the same-model/same-family guard validation must run BEFORE
  `bootstrapLlmProviders`** — bootstrap throws if no provider keys are present
  (`llm-bootstrap.ts`), so `--list` and an obviously-invalid config must fail/print
  without touching Doppler. For a live run it then bootstraps providers, runs the grid,
  writes the corpus (T4), and prints the metrics summary. **Prerequisite for any live
  run: `OPENROUTER_API_KEY` must be in the resolved Doppler config (`-c stg`)** — the
  learner *always* calls `callOpenRouterModel`, which throws without it (bootstrap treats
  the key as optional and will not surface the gap until call time). Add
  `"eval:llm:sim": "tsx eval-llm/simulate.ts"` to `apps/api/package.json` scripts.
  *Done when:* `pnpm --filter @eduagent/api eval:llm:sim -- --list` prints the
  scenario grid with **no** LLM call and **no** Doppler (no `bootstrapLlmProviders`
  call); invoking with `--mentor-model X --learner-model X` exits non-zero with the
  same-model error before any provider bootstrap.

- [x] **T6: Gitignore + README.**
  Ignore `apps/api/eval-llm/corpus/` (transcripts are bulky, per-run, not source of
  truth). Add an `eval-llm/README.md` section: the command, the **two-model guardrail**
  rationale (incl. the production-routing default case and the slug-vs-family heuristic),
  the `OPENROUTER_API_KEY`-in-Doppler prerequisite, the **`--provider` is a global pin
  that also affects an OpenRouter mentor candidate** caveat, the **DB-free / no
  `validateEvaluationEventIds`** limitation, the **note-overlap calibration is NOT in
  scope (mastery-bar half only)** scoping note, and the **CH-4 "synthetic ⇒ provisional;
  does not discharge RR-2; post-launch recalibration required"** caveat. Cross-link RR-2
  and RR-6 in `docs/specs/2026-06-03-…`, stating the synthetic corpus complements rather
  than satisfies RR-2.
  *Done when:* `git status` shows `corpus/` ignored; README renders the section with
  the exact `eval:llm:sim` command and all caveats above.

- [ ] **T7: First live grid run (validation).** *(execution gate — needs Doppler + keys + spend)*
  **Prerequisite:** confirm `OPENROUTER_API_KEY` is present in `-c stg` Doppler (the
  learner turn requires it); the example uses an explicit gpt-oss candidate vs an
  `anthropic/*` learner, so the two-model guard passes on disjoint vendor families.
  Run a small live grid against the **production-candidate mentor model** and a
  distinct learner model, e.g.:
  `doppler run -c stg -- pnpm --filter @eduagent/api eval:llm:sim -- --mentor-model <gpt-oss-slug> --learner-model anthropic/claude-3.5-sonnet --runs 2 --max-live-calls 30`
  *Done when:* the run completes, `corpus/<ts>/metrics.json` exists, and
  `signalEmissionRate` for the candidate mentor is reported — i.e. the gpt-oss
  signal-drop question is answered with data, not memory. Record the number in the
  RR-6 section of the spec.

## Driver interface (T3 — the shape is the decision)

```ts
// runner/simulated-conversation.ts
export interface SimulatedRoundResult {
  scenarioId: string;
  profileId: string;
  mentorModel: string;            // 'production-routing' or candidate slug
  learnerModel: string;
  transcript: Array<{ role: 'assistant' | 'user'; content: string }>;
  evaluations: ChallengeRoundEvaluationItem[];   // accumulated across turns
  decision: MasteryDecision;      // from decideMasteryAndReview (pure, DB-free)
  expectedOutcome: 'verified' | 'partial' | 'reteach';
  signalEmitted: boolean;         // false if any active turn failed parseEnvelope OR returned 0 eval items
}

export async function runSimulatedRound(args: {
  scenario: ChallengeSimScenario;
  profile: EvalProfile;
  learnerModel: string;           // via callOpenRouterModel
  mentorModel: string | null;     // null = production routing via runHarnessLlm
  allowSameFamily?: boolean;      // explicit override for a deliberate same-base-family A/B
}): Promise<SimulatedRoundResult>;
// Two-model guard (throws unless allowSameFamily):
//  - mentorModel != null: throw if mentorModel === learnerModel OR same vendor/base-family token.
//  - mentorModel === null (production routing): resolve the router's concrete mentor slug,
//    then apply the same equality + family check against learnerModel.
// No `providerPin` arg — host pinning is the module-global setOpenRouterProviderPin (T2/T5).
```

## Self-review notes

- **Spec coverage:** RR-2 → T1–T5 produce a *complementary synthetic pre-screen*, NOT
  the real-staging corpus RR-2 requires (RR-2's dependency on real transcripts is not
  discharged here); RR-6 **mastery-bar** calibration inputs → T4 (outcome distribution +
  over/under-credit rates) + T7 (live numbers) — RR-6's **note-overlap** half is out of
  scope (needs a drafting + DB-anchored harness); RR-12 gpt-oss de-risk →
  `signalEmissionRate` (T3/T4, measured via the production `parseEnvelope` path) + T7.
- **No internal mocks:** only `runHarnessLlm` and `callOpenRouterModel` (external LLM
  boundary) are mocked in T2/T3 tests; `transitionChallengeState`,
  `decideMasteryAndReview`, and `parseEnvelope` run for real — compliant with GC1/GC6.
- **Name consistency:** `runSimulatedRound`, `SimulatedRoundResult`, `SimMetrics`,
  `overCreditRate`, `signalEmittedRate`→`signalEmissionRate`, `CHALLENGE_SIM_SCENARIOS`,
  `allowSameFamily` (no `providerPin` arg — global pin only) used identically across
  T1–T7; envelope parsing is `parseEnvelope` everywhere (never `parseFirstJsonObject`).
- **Determinism:** the directed `currentUserMessageEventId` per question is derived
  from `(scenarioId, questionIndex)` (fixed UUID namespace), not random — so transcripts
  are addressable and re-runnable.

## Post-adversarial-review corrections (2026-06-27)

Two adversarial reviews (end-user + architecture) ran against the as-built harness
before merge. The high-value findings below were applied; the implementation differs
from the design sketch above in these specific ways, and the sketch is retained only
for historical context.

- **B1 — measure the production JUDGE, not the tutor inline signal (the load-bearing
  fix).** The sketch scraped the tutor's inline `challenge_round_evaluation` envelope
  signal. But production grades Challenge Rounds via a **separate rung-1 judge**
  (`runChallengeRoundGrader`, `capability:'judge'`) whenever
  `CHALLENGE_ROUND_GRADER_ENABLED` is on — its **default**. The original harness
  therefore measured a path production disables by default. Fixed: grading now routes
  through `buildChallengeRoundGraderPrompt` + `challengeRoundGraderVerdictSchema`
  (mirroring `grader.ts`), and the tutor is reduced to a production-routed
  next-question producer that never grades. `SimulatedRoundResult.mentorModel` →
  `graderModel`; metrics' `signalEmissionRateByMentor` → `…ByGrader`.
- **Guard targets the JUDGE.** The two-model guard now compares the learner against
  the **judge** slug (resolved via `getModelConfigForTest(1, { capability:'judge',
  ageBracket })` for the production-routing default), not the tutor. Added a **soft**
  same-vendor-root warning axis (`vendorRoot`, e.g. `deepseek-chat`/`deepseek-r1`)
  that warns without throwing.
- **Tutor can't contaminate the measurement.** The question-asking tutor is always
  production-routed (never the candidate slug), so only the grader is the variable
  under test — the earlier "mentor contaminates its own grading" caveat is gone.
- **M4 — budget auto-fit, no silent truncation.** `--max-live-calls` is now an
  optional **hard cap**; when omitted the budget auto-fits to
  `grid × 3 × MAX_CHALLENGE_QUESTIONS`, so a run can never quietly grade only part of
  the grid. `CALLS_PER_ROUND` accounts for learner+tutor+grader per question.
- **M3/M6 — N-sufficiency + Wilson CIs.** `MIN_ROUNDS_FOR_CALIBRATION = 30`; corpora
  below it are flagged `sufficientForCalibration:false`. Every headline rate ships a
  Wilson 95% CI + denominator, and `metrics.json` is **stamped** (`n`,
  `runsPerScenario`, `gradingPath`, `provisional:true`, INSUFFICIENT-N note) so a
  low-N number can't be misread as calibrated.
- **DB-free is an UPPER BOUND.** Skipping `validateEvaluationEventIds` can only *drop*
  `solid` items, never add them — so `verified`/over-credit here is an upper bound on
  production, not an unbiased estimate. Stamped into `metrics.json`.
- **Flag/CLI rename:** `--mentor-model` → `--grader-model` throughout (CLI, README,
  tests).
- **Determinism wording corrected:** the per-question event id is a deterministic
  **v4-*shaped*** UUID derived from `(scenarioId, questionIndex)` — it is NOT an
  RFC-4122 v5 (SHA-1 namespace) UUID; the comment in `simulated-conversation.ts` was
  corrected to say so.

**Status:** implemented; harness suites green
(`simulated-conversation.test.ts` 19 + `simulation-metrics.test.ts` 8 = 27 tests),
`api:typecheck` clean. Re-challenged by a 3-reviewer adversarial pass (correctness
/ test-quality / maintainability) on 2026-06-27 — consensus APPROVE-with-nits, no
P0/P1; the surfaced README accuracy nits + a `parseGraderResponse` drift-guard seam
(+6 tests) were applied in the same PR.
