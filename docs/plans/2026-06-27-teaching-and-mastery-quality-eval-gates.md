---
title: Teaching-Quality Flow + Mastery-Simulation Gate — Implementation Plan
date: 2026-06-27
profile: code
spec: docs/specs/2026-06-27-teaching-and-mastery-quality-eval-gates.md
status: draft
---

# Teaching-Quality Flow + Mastery-Simulation Gate — Implementation Plan

**Goal:** Ship two off-required-path additions to the `apps/api/eval-llm` harness — (1) a multi-turn `teaching-session` flow that judges whether the mentor teaches well enough for unaided transfer, and (2) promote the existing Challenge-Round mastery simulator to a tracked gate with a committed baseline, a hard over-credit ceiling, and a production-faithful gpt-oss-tutor + Sonnet-grader pipeline.

**Approach:** Feature 1 clones the proven `misconception-repair.ts` flow shape (inline simulated learner, real mentor via `runHarnessLlm`, override-immune judge via `callLlm`) with a longer loop + a transfer probe. The simulated learner is constrained to *stay stuck unless genuinely taught* across the whole loop (not only at the probe), so a too-capable model can't mask bad teaching. Feature 2 rewires `runSimulatedRound` to call the real `runChallengeRoundGrader` through a **new `graderTurn` DI seam**, re-points the two-model guard to learner-vs-grader, and adds pure baseline-compare machinery + three CLI verbs to `simulate.ts`. All verification lives in pure no-LLM unit tests; the LLM boundary is exercised only in the weekly live gate. Both hard gates (Feature 1 `transfer:'no'`, Feature 2 over-credit) pin judge/grader **temperature to 0** and **auto-reproduce a breach N× in the same job** before failing CI, so a single LLM slip never files a red.

> **Audience-scope honesty (MAJOR — F1/M7):** the scenario set is pre-teen/teen-skewed (11–17yo). It says **nothing** about teaching quality for under-10s (on a parent's account) or adults — the two bands with no `EvalProfile` yet. Every artifact (README, snapshot header, weekly issue body) is hard-labelled **"PRE-TEEN/TEEN-BAND PRE-SCREEN ONLY"** so a green gate is never misread by a non-coder reader as all-ages teaching quality. Authoring under-10 + adult `EvalProfile`s and scenarios is a tracked follow-up (T13), not silently in-scope.

> **Proof depends on T12 (MAJOR — M6):** every per-PR-runnable artifact (T1–T11) is a pure function or a structural JSON check that runs **no LLM**. The over-credit ceiling and the transfer probe are only ever exercised against a real model in T12's stg grid + the weekly cron. Until T12 lands a real, provenance-stamped baseline, **the feature is inert** — the per-PR `--validate-baseline` step is gated on that real baseline (T10), and the "shipped" claim is not made until T12 completes. T12 has a named owner + date (see Rollout).

## Scope

In scope:
- `apps/api/eval-llm/fixtures/teaching-scenarios.ts` (new — 5 scenarios incl. `11yo-czech-animals`; teen-band labels)
- `apps/api/eval-llm/flows/teaching-session.ts` (new — stuck-unless-taught learner, transfer probe, temp-0 judge)
- `apps/api/eval-llm/flows/teaching-session.test.ts` (new)
- `apps/api/eval-llm/index.ts` (register flow in `FLOWS`)
- `apps/api/eval-llm/runner/simulated-conversation.ts` (add `graderTurn` DI seam; wire real grader; re-point guard; **delete orphaned `resolveProductionMentorModel`**; add `runChallengeRoundGrader` + `type ConversationLanguage` imports)
- `apps/api/eval-llm/runner/simulation-metrics.ts` (baseline compare + over-credit ids; `graderModel` slug + `signalEmissionByMentor` in compare)
- `apps/api/eval-llm/runner/simulation-metrics.test.ts` (new)
- `apps/api/eval-llm/simulate.ts` (3 baseline CLI verbs; remove pre-bootstrap mentor guard; **bump `CALLS_PER_ROUND` to `3 × MAX_CHALLENGE_QUESTIONS`**; `--validate-baseline` short-circuits before the `learnerModel` throw; judge-slug drift check; cross-baseline shape guard; auto-reproduce on over-credit)
- `apps/api/eval-llm/simulation-baseline.json` (new, committed — provenance-stamped, seeded in T12)
- `apps/api/eval-llm/README.md` (document both; teen-band label; weekly-issue owner)
- `.github/workflows/api-quality-gate.yml` (new `--validate-baseline` step, gated on a provenance-stamped real baseline)
- `.github/workflows/eval-live.yml` (new weekly sim step; re-derived `--max-live-calls`; sim-specific failure remediation text)

Out of scope (must NOT change):
- `apps/api/src/services/challenge-round/**` — `decideMasteryAndReview` / `transitionChallengeState` / `runChallengeRoundGrader` are exercised as-is.
- `apps/api/src/services/session/session-exchange.ts` — production grader call site is the reference (`:1110-1131`, `challengeRoundGraderEnabled`-gated; empty-path stall handling at `:1140-1162`), not edited.
- `apps/api/src/services/exchanges.ts` (`buildSystemPrompt`) — real mentor prompt, unchanged.
- The existing main-harness `baseline.json` (envelope-signal infra) — the simulator gets a **separate** `simulation-baseline.json`; never merged.
- Any required PR check. Neither feature becomes a blocking check.

## Surface map (responsibilities)

| File | One responsibility |
|---|---|
| `fixtures/teaching-scenarios.ts` | `TeachingScenario` interface + **5** fixtures (pinned `EvalProfile.id`s incl. `11yo-czech-animals` for non-English tutor-prose) + `getTeachingScenario(id)` + `assertScenarioProfilesResolve()` startup guard |
| `flows/teaching-session.ts` | `teachingSessionFlow` (inline **stuck-unless-taught** learner, 8-turn loop, transfer probe, **temp-0** judge) + exported pure `evaluateTeachingVerdict()` |
| `flows/teaching-session.test.ts` | verdict→issue severity assertions (no LLM) |
| `index.ts` | one import + one `FLOWS` array entry |
| `runner/simulated-conversation.ts` | add `graderTurn?` to `SimulatedRoundOverrides`; call real grader (via seam) for evals; `resolveProductionGraderModel`; re-point `assertTwoModelGuard` call to learner-vs-grader; **delete orphaned `resolveProductionMentorModel`**; add grader + `ConversationLanguage` imports |
| `runner/simulation-metrics.ts` | `overCreditScenarioIds` on `SimMetrics`; `SimulationBaseline` (incl. `graderModel`) / `SimulationGateResult` types; pure `compareSimulationBaseline()` (diffs `signalEmissionByMentor` too), `toBaseline()`, `validateBaselineStructure()` (sim-shape + provenance + `graderModel` present) |
| `runner/simulation-metrics.test.ts` | compare/ceiling/structural-validate/judge-drift/cross-baseline assertions (no LLM) |
| `simulate.ts` | `--validate-baseline` / `--check-baseline` / `--update-baseline`; drop pre-bootstrap mentor guard; `CALLS_PER_ROUND = 3 × MAX_CHALLENGE_QUESTIONS`; over-credit auto-reproduce before exit 1 |
| `simulation-baseline.json` | committed, provenance-stamped seed (T12) |
| `README.md` | usage for both; teen-band label; named weekly-issue owner |
| `api-quality-gate.yml` | key-free `--validate-baseline` step (requires a real provenance-stamped baseline) |
| `eval-live.yml` | weekly `--check-baseline` step + sim-specific failure remediation |

---

## Tasks

- [ ] **T1** — Create `fixtures/teaching-scenarios.ts`: `TeachingScenario` interface (exact shape in spec §"Concrete shapes"), **5** scenarios with **pinned** `profileId`s (`12yo-dinosaurs`, `15yo-football-gaming`, `13yo-spanish-beginner`, `17yo-french-advanced`, **`11yo-czech-animals`** — the last gives non-English tutor-prose coverage, F5; profile confirmed present at `fixtures/profiles.ts:100`), a `getTeachingScenario(id)` lookup, and an exported `assertScenarioProfilesResolve(profiles)` that **throws** if any scenario's `profileId` has no matching `EvalProfile` (MEDIUM-2). At least one scenario instructs the learner to **resist** — misunderstand the concept twice before any explanation can land — so scaffolding/coherence dimensions are actually exercised (F2). Add a file-level `SCENARIO_BAND_LABEL = 'PRE-TEEN/TEEN-BAND PRE-SCREEN ONLY (11–17yo) — says nothing about under-10 or adult teaching'` exported constant, surfaced in the flow snapshot header + README + weekly issue (F1/M7). — done when: `tsc --noEmit` clean and the assert throws on a deliberately-mistyped id in a scratch check (folded into T3's suite as `assertScenarioProfilesResolve` test).
- [ ] **T2** — Create `flows/teaching-session.ts` cloning `misconception-repair.ts`: copy its **inline** simulated learner (`learnerSystemPrompt` / `simulateLearnerTurn`, `misconception-repair.ts:156-192`) — do NOT import `learner-agent.ts` (MEDIUM-1); `MAX_MENTOR_TURNS = 8`. Constrain the learner brief so it **stays at its `startingGap` competence across the whole loop** — it only advances on a concept the mentor actually taught, never via the model's own pretraining (F2/HIGH-4), so a too-capable learner cannot mask bad teaching. Add the transfer-probe step (mentor does not answer it; learner answers "using only what was taught" AND stays at its `startingGap` competence — HIGH-4); pin the **judge `temperature: 0`** (M8/F3); judge returns the 4-field `TeachingVerdict`; export pure `evaluateTeachingVerdict()`. `enumerateScenarios` **hard-errors** (not silent `continue`) when a scenario's `profileId` resolves to no profile (MEDIUM-2). — done when: `teaching-session.test.ts` (Tests §T2/T3) passes and `tsc --noEmit` is clean.
- [ ] **T3** — Create `flows/teaching-session.test.ts`: pure `evaluateTeachingVerdict()` severity assertions + the `assertScenarioProfilesResolve` throw test. — done when: `pnpm exec jest --findRelatedTests apps/api/eval-llm/flows/teaching-session.test.ts --no-coverage` is green; every assertion in Tests §T3 present.
- [ ] **T4** — Register the flow in `index.ts`: add `import { teachingSessionFlow } from './flows/teaching-session';` (next to the `misconceptionRepairFlow` import at `:71`) and `teachingSessionFlow as FlowDefinition,` in the `FLOWS` array (next to `:146`). — done when: `pnpm eval:llm -- --list` lists `teaching-session` and Tier-1 `pnpm eval:llm` renders its opening-turn snapshot without error.
- [ ] **T5** — Extend `runner/simulation-metrics.ts`: add `overCreditScenarioIds: string[]` to `SimMetrics` (populated in `aggregate` alongside the existing `overCredit` counter at `:72`); add `SimulationBaseline` (incl. **`graderModel: string`** — the resolved `capability:'judge'` slug at seed time, M5/F7) + `SimulationGateResult` interfaces (exact shapes in spec §"Concrete shapes"); add pure `compareSimulationBaseline(current, baseline, tolerancePp)` (diffs `masteryVerified`, `underCredit`, `outcome.*`, **and `signalEmissionByMentor`** — no longer a dead stored field, spec-M7), `toBaseline(metrics, {learnerModel, mentorModel, graderModel, updatedAt, provenance})`, and `validateBaselineStructure(raw): {ok, reason?}`. `validateBaselineStructure` rejects: empty/`null`, `scenarioCount:0`, **a payload missing `graderModel`**, **a payload missing the `provenance: 'update-baseline'` stamp** (so a hand-written structurally-valid stub fails the per-PR gate, M6), and **a payload shaped like the main-harness baseline** (lacks the over-credit fields — cross-baseline guard, F10). Baseline stores drift metrics only — **never** over-credit (the ceiling is a hard `=== 0`, not a drift band). — done when: `simulation-metrics.test.ts` (Tests §T6) passes; `tsc --noEmit` clean.
- [ ] **T6** — Create `runner/simulation-metrics.test.ts`: pure tests for `compareSimulationBaseline` (over-credit ids → `pass:false`; within/beyond tolerance; small-N widening; `signalEmissionByMentor` drift surfaced) and `validateBaselineStructure` (rejects empty/`scenarioCount:0`/missing-`graderModel`/missing-`provenance`/main-harness-shaped). — done when: `pnpm exec jest --findRelatedTests apps/api/eval-llm/runner/simulation-metrics.test.ts --no-coverage` is green.
- [ ] **T7** — Rewire `runner/simulated-conversation.ts` to the production-faithful grader path (HIGH-2, LOW-2). **Prerequisite edits (required, were unscoped):**
  - **Add a grader DI seam:** `graderTurn?: (input: RunChallengeRoundGraderInput) => Promise<ChallengeRoundEvaluationItem[]>` to `SimulatedRoundOverrides` (`:86-90`), defaulting to the real `runChallengeRoundGrader`. The §T7 grader-stub test routes through this seam — **without it the test can only `jest.mock` the internal grader, which GC1 forbids** (BLOCKER-1). Route the in-round grader call through the seam.
  - **Delete `resolveProductionMentorModel` (`:166-171`):** the re-point orphans it, and `noUnusedLocals` then fails every `tsc` `done when` (MAJOR-M4). (`MENTOR_RUNG`/`MENTOR_LLM_TIER` stay — still used by `defaultMentorTurn`/`buildMentorContext`.)
  - **Add imports:** `runChallengeRoundGrader` (+ `RunChallengeRoundGraderInput` type) from `../../src/services/challenge-round/grader`, and `type { ConversationLanguage } from '@eduagent/schemas'` for the cast.

  After the mentor turn, call the grader **via the seam** for the evaluation. Correct production mirror (LOW-2 verified): the production call (`session/session-exchange.ts:1110-1131`) is **`challengeRoundGraderEnabled`-gated, not unconditional** — assert `challengeRoundGraderEnabled === true` (the V2 production state the sim targets) rather than claiming the call is unconditional. On empty grader output, production does **not** fire `answer_complete` (it bumps `questionsAsked` + runs `resolveGraderStallTermination`, `:1140-1162`); the sim instead falls open on `[]` to the legacy inline-state path — **this is a deliberate, disclosed divergence** that only affects the soft outcome/termination distribution (the hard over-credit gate is unaffected: empty → no `solid` → no `verified`). Document the divergence in T9; do not call the empty branch "production-faithful". Feed the grader's evals to `transitionChallengeState` + `allEvals`, and set `signalEmitted` from the **grader's** emission. Add `resolveProductionGraderModel(profile)` (via `getModelConfigForTest(GRADER_RUNG, { capability:'judge', ageBracket })`) and **re-point the in-round `assertTwoModelGuard` (`:238`) to learner-vs-grader**. — done when: existing `simulated-conversation.test.ts` still green (rewrite **all** envelope-driven outcome tests + the guard tests per §Test-update note), and a DI-override unit test (Tests §T7) proves grader evals drive the decision; `tsc --noEmit` clean.
- [ ] **T8** — Add the three baseline verbs to `simulate.ts` and **remove** the pre-bootstrap learner-vs-mentor guard (`:172-178`) — learner sharing the *tutor* family is now explicitly allowed; the authoritative learner-vs-grader guard runs in-round (T7). **Also bump `CALLS_PER_ROUND` from `2 × MAX_CHALLENGE_QUESTIONS` to `3 × MAX_CHALLENGE_QUESTIONS`** (`:50`) — T7 adds a real grader LLM call per turn, so the old `=6` under-counts by 50% and `maxRounds = floor(maxLiveCalls / CALLS_PER_ROUND)` would silently overspend the `--max-live-calls` cap (~135 vs 90) (MAJOR-M1/M4). Wire:
  - `--validate-baseline` — **short-circuit before the `if (!args.learnerModel) throw` at `:162`** (mirror the `--list` precedent at `:157`), no bootstrap, structural check via `validateBaselineStructure` (incl. `graderModel` + provenance + cross-baseline-shape, T5), exit 1 on fail. **Plus a judge-slug drift check** when a real baseline is present: resolve the live `capability:'judge'` slug and exit 1 if it ≠ `baseline.graderModel` (closes HIGH-3 silent-staleness, M5/F7) — this resolution is a pure matrix read, no bootstrap needed (verified: `getModelConfigForTest` `router.ts:997-1015`).
  - `--update-baseline` — run grid, `writeFile` `simulation-baseline.json` via `toBaseline` (stamps `graderModel` + `provenance: 'update-baseline'`).
  - `--check-baseline` — run grid, `compareSimulationBaseline`. **On `overCreditCount > 0`, auto-reproduce the offending scenario(s) N× (N=3) in the same run before failing** — exit 1 + name the scenarios only if the breach reproduces; a non-reproducing breach prints a `[slip]` warning and passes (M8/F6, kills the "file-then-ask-human-to-rerun" rot path). Print drift + named over-credit scenario ids.
  — done when: `pnpm --filter @eduagent/api eval:llm:sim -- --validate-baseline` exits 1 against a missing/empty/hand-stub (no-provenance) file and 0 against a provenance-stamped valid stub; `--list` still works with no Doppler.
- [ ] **T9** — Document both features in `apps/api/eval-llm/README.md`: the `teaching-session` flow (**5** scenarios incl. the `11yo-czech-animals` non-English-prose band, transfer probe, CI-free) **with the `SCENARIO_BAND_LABEL` teen-band caveat prominent** (F1/M7); the simulator's three verbs + the pinned-set table + the "re-seed on T10 judge reselection" note + the **judge-slug drift check** that now enforces it; the reinterpretation of `signalEmissionByMentor`/`signalEmitted` to mean "**grader** emitted evals" post-T7 (its fail-open rate, the gpt-oss/grader health indicator); the **disclosed empty-grader divergence** from production's stall handling (T7); and a **named owner for the weekly `ci` issue triage** (so the gate has an accountable human, F11). — done when: README sections render, reference the correct flags/paths, and name the weekly-issue owner.
- [ ] **T10** — Add the per-PR step to `.github/workflows/api-quality-gate.yml` under the existing `eval` change-class gate: `pnpm --filter @eduagent/api eval:llm:sim -- --validate-baseline` (key-free, distinct from the existing main-harness baseline step at `:82-84`). **This step is meaningful only against a real, provenance-stamped baseline** — the `validateBaselineStructure` provenance check (T5) makes a hand-written stub fail, so the step cannot pass until T12 has seeded a real baseline. Until then the step legitimately reds, signalling "feature inert" (M6). — done when: the step is present, gated on the same change-class condition, needs no secrets, and fails against a non-provenance baseline.
- [ ] **T11** — Add the weekly + label step to `.github/workflows/eval-live.yml` after the existing live step (exact YAML in spec §"CI wiring"): `--mentor-model openai/gpt-oss-120b --learner-model openai/gpt-4o --runs 3 --max-live-calls 135 --check-baseline` — **`--max-live-calls` re-derived for the 3-call/round cost (5 scenarios × 3 runs = 15 rounds × 9 calls = 135; with `CALLS_PER_ROUND=9`, `floor(135/9)=15` rounds all run)** (MAJOR-M1/M4); env `DOPPLER_TOKEN_STG`. **Do not blindly reuse the existing `Notify on scheduled failure` step** — its hardcoded remediation points at the *main-harness* `--update-baseline`; add a sim-specific failure note (or branch the notify body) so a sim over-credit breach tells the engineer to run `eval:llm:sim … --update-baseline`, not the main harness (MINOR, eval-live notify). — done when: `yq`/yaml-lint parses the workflow, the step references `eval:llm:sim` + the stg Doppler token, and the failure note names the sim re-seed command.
- [ ] **T12** (operational, gated on stg + cost approval — **owner: <product/eng lead>, target: 2026-07-11**) — Seed both baselines and validate the gates per Rollout. **Pin judge + grader `temperature: 0` for all T12 runs** (M8/F3). Run the **judge-resolution probe** (confirm `capability:'judge'` resolves to the production judge-of-record under stg Doppler, not a fallback — HIGH-3 dependency; record the resolved slug as `graderModel`); run the over-credit grid **≥5×** confirming `overCreditCount === 0` every run (HIGH-1); run the Feature-1 hard-gate validation to the **same ≥5× seed-stability bar** — a known-good control scores `transfer:'yes'/'partial'` and a known-bad **not-taught control** scores `transfer:'no'` on every run (F8 parity — Feature 1's error gate must be calibrated as rigorously as Feature 2's); then `--update-baseline` (stamps `graderModel` + provenance) and commit `simulation-baseline.json` with the run's metrics in the message. — done when: all validations pass ≥5× and the committed baseline reproduces on a fresh `workflow_dispatch` run; T10's per-PR step then goes green.
- [ ] **T13** (follow-up, tracked — audience-band completion) — Author under-10 and adult `EvalProfile`s in `fixtures/profiles.ts` and add corresponding `teaching-session` scenarios, then widen `SCENARIO_BAND_LABEL`. Closes the all-ages coverage gap (F1/M7) that the teen-band label discloses but does not fix. — done when: ≥1 under-10 + ≥1 adult scenario resolve via `assertScenarioProfilesResolve` and the label no longer says "PRE-SCREEN ONLY".

## Open product decision (surface, don't silently encode)

- **`told_not_taught` severity (F4):** the spec makes "mentor handed the answer instead of reasoning it out" a **warning**, not an error. Given the founder's explain-then-verify / homework-helper philosophy ([[feedback_homework_not_socratic]]), whether "just gave the answer" should *block* (error) is a genuine product call, not an implementation detail. The plan implements the spec's warning default but flags this for an explicit founder ruling before T12 seeds — promoting it to an error later only requires changing the `evaluateTeachingVerdict` severity mapping + one §T3 assertion. **Do not treat the current warning as settled.**

## Key code shapes (the decisions)

### T7 — grader-path loop (replaces the inline-envelope read in `runSimulatedRound`)

The current loop reads evals from the mentor envelope (`parsed.envelope.signals?.challenge_round_evaluation`, `:300`). With the pinned `gpt-oss-120b` tutor that array is always `[]`. Replace the eval source with the real grader; keep using the envelope's `reply` to drive the next question:

```ts
// after: const parsed = parseEnvelope(rawMentor, 'exchange.session'); if (!parsed.ok) { signalEmitted = false; break; }
transcript.push({ role: 'assistant', content: parsed.envelope.reply });

// The grader supplies the evaluation (gpt-oss drops the inline signal). The
// PRODUCTION call (session/session-exchange.ts:1110-1131) is challengeRoundGraderEnabled-
// GATED, not unconditional — the sim targets the V2 grader-ON state, so assert that.
// `askedQuestion` is the question the learner just answered.
// `runGrader` is the new DI seam on SimulatedRoundOverrides (defaults to the real
// runChallengeRoundGrader) — keeps the T7 test GC1-clean (no internal jest.mock).
const graderEvals = await runGrader({
  askedQuestion: mentorQuestion,
  learnerAnswer,
  answerEventId: deterministicUuid(`${scenario.id}:a${turnIndex}`),
  conversationLanguage: profile.conversationLanguage as ConversationLanguage,
  ageBracket: resolveAgeBracket(profile.birthYear),
  sessionId: ctx.sessionId,
});
if (graderEvals.length === 0) signalEmitted = false;
allEvals.push(...graderEvals);

// DISCLOSED DIVERGENCE: production does NOT fire answer_complete on empty grader
// output (it bumps questionsAsked + runs resolveGraderStallTermination, :1140-1162).
// The sim falls open on [] to the legacy inline-state path — affects only the soft
// outcome/termination distribution; the hard over-credit gate is unaffected
// (empty → no `solid` → no `verified`). Replicating the stall guard is out of scope.
state = transitionChallengeState(state, {
  type: 'answer_complete',
  evaluation: graderEvals,
});
mentorQuestion = parsed.envelope.reply;
turnIndex += 1;
```

> Note: `signalEmitted` now means "the **grader** emitted evals" (its fail-open rate), not "the tutor emitted the inline signal". `signalEmissionRateByMentor` is reinterpreted accordingly — document this in T9; it remains the gpt-oss/grader health indicator, and is now also surfaced as a drift metric in `compareSimulationBaseline` (T5).

### T7 — grader model resolution + re-pointed guard

```ts
const GRADER_RUNG = 1 as const; // matches production GRADER_RUNG (cheap judge call)

function resolveProductionGraderModel(profile: EvalProfile): string {
  return getModelConfigForTest(GRADER_RUNG, {
    capability: 'judge',
    ageBracket: resolveAgeBracket(profile.birthYear),
  }).model;
}

// in runSimulatedRound, replacing the mentor-slug guard at :235-238:
const graderGuardSlug = resolveProductionGraderModel(profile);
assertTwoModelGuard(learnerModel, graderGuardSlug, allowSameFamily);
```

`assertTwoModelGuard` itself is unchanged — only its second argument moves from the mentor slug to the grader slug. Learner `openai/gpt-4o` vs grader `claude-sonnet-4-6` are different families → guard passes; learner sharing the *tutor's* family is no longer checked, which is correct (the tutor does not produce the mastery judgment).

> **Correction to the HIGH-2 narrative (MAJOR-M2):** the spec/earlier draft claimed learner `openai/gpt-4o` and tutor `openai/gpt-oss-120b` are "the same `openai/` family, so a learner-vs-mentor guard hard-errors before any LLM call." **This is false.** `modelFamily()` (`simulated-conversation.ts:114-125`) *strips the provider prefix* and keys on the model name: `modelFamily('openai/gpt-4o')` → `'gpt-4o'`, `modelFamily('openai/gpt-oss-120b')` → `'gpt-oss'`. They don't collide, so the old guard would **not** throw — the weekly command runs fine today. The re-point is therefore a **deliberate correctness change** (the grader, not the tutor, produces the mastery judgment), **not** a fix for a crash. Removing the pre-bootstrap `:172-178` guard (T8) is likewise a design choice, not a workaround. An implementer must not expect the old guard to crash.

> **Guard-test volatility (MAJOR-M-guard):** `resolveProductionGraderModel` resolves through the real router matrix, which is flag-dependent and "T10 bake-off pending" (HIGH-3) — a hardcoded `anthropic/claude-*` learner in a guard test could silently stop colliding when the judge model changes. The §T7 re-pointed-guard test must inject the grader slug through the **`graderTurn`/resolution seam** (or a fixed slug param) rather than relying on the live-resolved model, so the test asserts guard *behavior*, not a model that may move.

### T8 — CLI mode dispatch (in `main`, after `parseArgs`)

```ts
// --validate-baseline: NO bootstrap, NO Doppler — structural only.
// MUST be placed BEFORE the `if (!args.learnerModel) throw` at :162 (mirror --list at :157),
// since validation runs with no learner model.
if (args.validateBaseline) {
  const raw = JSON.parse(await readFile(BASELINE_PATH, 'utf8').catch(() => 'null'));
  const v = validateBaselineStructure(raw); // rejects no-provenance hand-stubs + main-harness shape (T5)
  if (!v.ok) { console.error(`[eval:llm:sim] invalid baseline: ${v.reason}`); process.exit(1); }
  // Judge-slug drift (HIGH-3 staleness, M5/F7): pure matrix read, no bootstrap.
  const liveJudge = getModelConfigForTest(GRADER_RUNG, { capability: 'judge', ageBracket: 'teen' }).model;
  if (raw.graderModel !== liveJudge) {
    console.error(`[eval:llm:sim] baseline judge stale: ${raw.graderModel} ≠ live ${liveJudge} — re-seed (T12)`);
    process.exit(1);
  }
  console.log('[eval:llm:sim] baseline structurally valid + judge current.'); return;
}
// ...existing guard removal, bootstrap, grid run, aggregate...
if (args.updateBaseline) {
  const baseline = toBaseline(metrics, {
    learnerModel: args.learnerModel!, mentorModel: args.mentorModel ?? 'production-routing',
    graderModel: resolveProductionGraderModel(/* representative profile */ gridProfiles[0]!),
    updatedAt: new Date().toISOString(), // Date is available — tsx entry, not a Workflow script (NIT-1)
    provenance: 'update-baseline', // provenance stamp — hand-stubs lack this and fail --validate-baseline (M6)
  });
  await writeFile(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
  console.log(`[eval:llm:sim] wrote ${BASELINE_PATH}`); return;
}
if (args.checkBaseline) {
  const baseline = JSON.parse(await readFile(BASELINE_PATH, 'utf8')) as SimulationBaseline;
  const gate = compareSimulationBaseline(metrics, baseline, DRIFT_TOLERANCE_PP);
  for (const d of gate.drift) console.warn(`[drift] ${d.metric}: ${d.baseline} → ${d.current} (Δ${d.delta})`);
  if (gate.overCreditCount > 0) {
    // Auto-reproduce before failing (M8/F6): re-run only the offending scenarios N×.
    // Only a REPRODUCING breach reds CI; a one-off LLM slip prints [slip] and passes.
    const reproduced = await reproduceOverCredit(gate.overCreditScenarioIds, /* N */ 3);
    if (reproduced.length > 0) {
      console.error(`[eval:llm:sim] OVER-CREDIT CEILING BREACH (reproduced): ${reproduced.join(', ')}`);
      process.exit(1);
    }
    console.warn(`[eval:llm:sim] [slip] over-credit did not reproduce on ${gate.overCreditScenarioIds.join(', ')} — passing`);
  }
  console.log('[eval:llm:sim] over-credit ceiling held (0).'); return;
}
```

`BASELINE_PATH = path.resolve(__dirname, 'simulation-baseline.json')`. Add `validateBaseline` / `checkBaseline` / `updateBaseline` booleans to `SimCliArgs` + their `case` branches in `parseArgs`. `DRIFT_TOLERANCE_PP` constant (start `0.15`; tune in T12 Rollout step 6). `reproduceOverCredit(ids, n)` re-runs just the named scenarios through the same grid path and returns the ids that breach again. The `'teen'` ageBracket in the drift check is a representative probe — the judge route is age-blind (`router.ts:477`), so the resolved slug is bracket-independent.

### T5 — compare signature (over-credit surfaced as count + ids)

```ts
export function compareSimulationBaseline(
  current: SimMetrics,
  baseline: SimulationBaseline,
  tolerancePp: number,
): SimulationGateResult {
  const widened = current.totalRounds < 10 ? tolerancePp * 2 : tolerancePp; // small-N widening
  const drift: SimulationGateResult['drift'] = [];
  const cmp = (metric: string, base: number, cur: number) => {
    const delta = +(cur - base).toFixed(3);
    if (Math.abs(delta) > widened) drift.push({ metric, baseline: base, current: cur, delta });
  };
  cmp('masteryVerified', baseline.rates.masteryVerified, current.masteryVerifiedRate);
  cmp('underCredit', baseline.rates.underCredit, current.underCreditRate);
  cmp('signalEmissionByMentor', baseline.rates.signalEmissionByMentor, current.signalEmissionRateByMentor); // grader fail-open health (spec-M7)
  for (const o of Object.keys(baseline.rates.outcome)) cmp(`outcome.${o}`, baseline.rates.outcome[o], current.outcomeRates[o]);
  return {
    overCreditCount: current.overCreditScenarioIds.length,
    overCreditScenarioIds: current.overCreditScenarioIds,
    drift,
    pass: current.overCreditScenarioIds.length === 0,
  };
}
```

## Tests

### §T3 — `flows/teaching-session.test.ts`
`evaluateTeachingVerdict(input, liveResponse)` over hand-built JSON `liveResponse` strings (`{ scenarioId, transcript, transferAnswer, verdict }`):
- `transfer:'no'` → exactly one **error** (`.transfer-failed`).
- `transfer:'partial'` → one **warning**, zero errors.
- `transfer:'yes'` → zero transfer issues.
- `transfer` unrecognized value → one warning.
- `scaffolding_appropriate:false` → one warning.
- `looped_or_incoherent:true` → one warning.
- `told_not_taught:true` → one warning.
- missing `verdict` → one `no-verdict` warning, zero errors.
- judge `{ error }` → one `judge-unavailable` warning, zero errors.
- combined (`transfer:'no'` + `told_not_taught:true`) → one error + one warning.
- `assertScenarioProfilesResolve` throws on a mistyped `profileId`, passes on the real **5**.

### §T6 — `runner/simulation-metrics.test.ts`
- `aggregate` populates `overCreditScenarioIds` with exactly the ids whose `decision.outcome==='verified'` while `expectedOutcome!=='verified'`.
- `compareSimulationBaseline`: over-credit ids present → `pass:false` + ids echoed; identical metrics → `drift:[]`, `pass:true`; one rate beyond tolerance → one drift entry named correctly; a `signalEmissionByMentor` delta beyond tolerance → one drift entry named `signalEmissionByMentor`; `totalRounds<10` widens tolerance (a delta passing at `2×` but failing at `1×` produces no drift).
- `validateBaselineStructure`: `null` / `{}` / `{scenarioCount:0}` → `{ok:false}`; a structurally-full object **missing `graderModel`** → `{ok:false}`; missing the `provenance:'update-baseline'` stamp → `{ok:false}`; a main-harness-shaped payload (no over-credit fields) → `{ok:false}`; a full valid provenance-stamped object → `{ok:true}`.

### §T7 — `runner/simulated-conversation.test.ts` (extend existing)
- Using `SimulatedRoundOverrides` (DI seam, GC1-clean): a `mentorTurn` returning an envelope with **empty** inline signal + a stubbed **`graderTurn`** returning `solid` evals → `decision` reflects the **grader's** evals (proves the inline path no longer drives the decision). *(Grader stub via the new `graderTurn` override; do not `jest.mock` the internal grader.)*
- Re-pointed guard, injected slug (not live-resolved — see "Guard-test volatility"): learner sharing the **grader's** family throws `two-model guard`; learner sharing the **tutor's** family does **not** throw.

## §Test-update note (Reality rule) — FULL scope, not just the guard

The T7 rewire deletes the mentor-envelope eval source (`:300`), so **every existing test that drives the decision through `scriptedEnvelope(reply, 'solid'|'partial'|'missing')` breaks** — the six outcome tests at `simulated-conversation.test.ts:73-198`, not only the two guard tests. Updating just the guard (the earlier draft's scope) would leave an implementer to green the six outcome tests "the cheapest way" — the exact disguised-loosening AGENTS.md "Tests Must Reflect Reality" forbids. Required, explicit:

1. **Outcome tests (`:73-198`)** — re-express each to drive the decision through the new **`graderTurn` override** (now possible — BLOCKER-1 seam), asserting the **current real behavior**: the grader's evals (not the mentor envelope) determine `decision.outcome`. Same outcomes asserted, new (correct) source. This is case (b) restructure, not loosening.
2. **The line-187 `signalEmitted=false`-on-empty-inline-signal test** — post-T7 `signalEmitted` means "**grader** emitted evals" (plan note above). Re-point its semantics: empty **grader** output → `signalEmitted=false`; a non-empty mentor inline signal is now irrelevant to it. Do not silently keep the old assertion — it would assert inverted meaning.
3. **Guard tests (`:136/:147/:158`)** — the guard now compares learner-vs-**grader** (`assertTwoModelGuard` itself unchanged). Rewrite "learner==mentor family throws" → "learner==**grader** family throws", and add a positive "learner==**tutor** family is allowed". Inject the grader slug through the seam/param (Guard-test volatility note) so the test doesn't depend on the live-resolved, T10-pending judge model. The `mentorModel:'gpt-oss-120b'` anchors at `:147` no longer trigger anything — they must be rewritten around the grader entity, not left testing a dead path.

This is case (b) of the test-update rule throughout (behavior restructured: the eval *source* and the guarded *entity* genuinely moved); no assertion is weakened — the grader path is asserted just as strictly as the envelope path was.

## Verification per profile (code)

Every code task's `done when:` names a pure jest check or a deterministic CLI exit code. The LLM boundary (mentor/learner/judge/grader live calls) is **never** mocked into jest — it is exercised only in T12's gated stg run and the weekly `eval-live.yml` cron. No internal `jest.mock` is added (GC1/GC6); the `SimulatedRoundOverrides` DI seam — **`learnerTurn` + `mentorTurn` + the new `graderTurn`** — covers all three boundaries T7 touches.

> **Honest limit of the per-PR gate:** `--validate-baseline` runs **no LLM** — it proves only that a real, provenance-stamped, judge-current baseline is committed. The over-credit ceiling and transfer probe are *proven* only by T12's ≥5× stg grid + the weekly cron. The feature is therefore inert until T12 lands; T10 is wired so its per-PR step cannot go green on a hand-stub (provenance check), making "inert" visible rather than silently green. This is disclosed, not theater.

## Out-of-band confirmations (verified during review)

- `eval:llm:sim` package script **confirmed present** at `apps/api/package.json:16` — the earlier "add if absent" is moot.
- `getModelConfigForTest` **confirmed** to accept `{ capability:'judge', ageBracket }` and resolve as a **pure matrix read with no bootstrap** (`router.ts:997-1015`) — so both `resolveProductionGraderModel` and the `--validate-baseline` judge-slug drift check work key-free. Caveat: the resolved judge is `setLlmRoutingV2Enabled`-flag-dependent; the in-round grader's real `routeAndCall` and the guard-slug resolution honor the same flag, so they agree **only if** the harness bootstrap sets a consistent flag state — assert this in T12's judge-resolution probe.
- `GRADER_RUNG = 1` + `{capability:'judge', ageBracket}` **confirmed** to resolve the *same* model the production grader uses (`grader.ts:40,111`) — the guard checks the right entity.

## Rollout (mirrors spec)

1. Land T1–T11 + T13-stub (code + unit tests; off required-check path). **The feature is inert until step 5** — T10's per-PR step legitimately reds (no provenance-stamped baseline yet); do not claim "shipped".
2. Validate the hard gate (T12, temp-0): over-credit grid ≥5× on stg → every run `overCreditCount === 0`; any non-zero on a fixture believed correct = borderline → fix or demote. Confirm the auto-reproduce path: an induced one-off slip prints `[slip]` and passes; a genuine breach reds.
3. Validate **both** hard gates' teeth to the **same ≥5× bar** (T12, F8 parity): Feature 1 not-taught control scores `transfer:'no'` on every run; a known-good control scores `transfer:'yes'/'partial'`. Feature 1's error gate is calibrated as rigorously as Feature 2's over-credit gate — they share the weekly `ci` issue stream.
4. Judge-resolution probe (T12, HIGH-3): confirm `capability:'judge'` resolves to the production judge-of-record under stg (consistent flag state) before seeding; record the slug as `graderModel`.
5. Seed both baselines from one live stg run; `--update-baseline` stamps `graderModel` + provenance; commit with metrics in the message.
6. Confirm per-PR `--validate-baseline` now green (real baseline present, judge current); run the weekly workflow once via `workflow_dispatch`.
7. Watch one weekly cycle. **`DRIFT_TOLERANCE_PP` starts deliberately wide (0.15, doubled under small-N) because at 15 rounds the soft-drift channel is near-uninformative** — treat `[drift]` lines as advisory only until N is large enough to calibrate against observed seed variance; do not gate on them. Tune down only once real variance is measured.
8. Re-seed on judge reselection (HIGH-3) is **now enforced, not remembered**: the `--validate-baseline` judge-slug drift check reds the per-PR gate when the T10 bake-off changes `capability:'judge'`, forcing a re-run of steps 2 + 5.
9. T13 (follow-up): author under-10 + adult profiles/scenarios to close the all-ages gap the teen-band label discloses.
