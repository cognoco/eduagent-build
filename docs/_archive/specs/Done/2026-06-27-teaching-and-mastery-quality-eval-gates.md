---
title: Teaching-Quality Flow + Mastery-Simulation Gate — Spec
date: 2026-06-27
profile: code
status: draft
spec_supersedes: none
related:
  - docs/specs/2026-06-03-review-relearn-findings-and-high-impact-todos.md   # RR-2 / RR-6
  - apps/api/eval-llm/flows/misconception-repair.ts                          # pattern for Feature 1
  - apps/api/eval-llm/simulate.ts                                            # machinery for Feature 2
---

# Teaching-Quality Flow + Mastery-Simulation Gate

**Goal:** Close the two largest gaps in how we assess the app's *teaching* and
*testing* (review) capabilities: (1) we have no full-session teaching-quality
judge, and (2) the multi-turn Challenge-Round simulator we already built is
manual-only and untracked, so a regression in mastery-grading leniency would go
unnoticed.

**Approach:** Two complementary additions to the existing `apps/api/eval-llm`
harness, both living **off the required-PR path** (non-deterministic by nature):

- **Feature 1 — `teaching-session` flow.** A new multi-turn `FlowDefinition`
  extending the proven `misconception-repair` pattern: a simulated learner with
  a hidden knowledge gap, the real production mentor prompt teaching across
  ~8 turns, then an *unaided transfer probe* and an LLM judge scoring whether
  the learner can now apply the concept — plus scaffolding/pace and
  coherence dimensions.
- **Feature 2 — promote the Challenge-Round simulator to a tracked gate.** Add a
  committed `simulation-baseline.json`, a `--check-baseline` compare, a **hard
  over-credit ceiling**, and an `eval-live.yml` step so mastery-grading leniency
  is trended weekly and alerts on regression.

> **Honesty framing (carries from RR-2 / `challenge-personas.ts`).** Both
> features are **SYNTHETIC pre-screens**, not proof of real-learner outcomes. A
> frontier model role-playing a 14-year-old emits model-shaped, not teen-shaped,
> answers. These gates catch *regressions against a known-good baseline* and
> *gross teaching failures*; they do **not** discharge RR-2's dependency on real
> staging transcripts. Every artifact must say so.

## Scope

In scope:
- `apps/api/eval-llm/flows/teaching-session.ts` (new flow)
- `apps/api/eval-llm/flows/teaching-session.test.ts` (pure verdict→issue unit tests)
- `apps/api/eval-llm/index.ts` (register the flow in `FLOWS`)
- `apps/api/eval-llm/fixtures/teaching-scenarios.ts` (new scenario fixtures)
- `apps/api/eval-llm/runner/simulation-metrics.ts` (add baseline compare + ceiling)
- `apps/api/eval-llm/runner/simulation-metrics.test.ts` (pure compare/ceiling tests)
- `apps/api/eval-llm/runner/simulated-conversation.ts` (wire the real `runChallengeRoundGrader` so the sim measures the production **gpt-oss tutor + Sonnet grader** pipeline, not the legacy inline path; **re-point the two-model family guard from learner-vs-mentor to learner-vs-grader** — see Feature 2 §3, finding HIGH-2)
- `apps/api/eval-llm/simulate.ts` (add `--check-baseline` / `--validate-baseline` / `--update-baseline`; today `simulate.ts:63-130` accepts none of these — they are NEW here, distinct from the same-named flags the main harness already has in `index.ts`)
- `apps/api/eval-llm/simulation-baseline.json` (new, **committed** — NOT under the gitignored `corpus/`)
- `.github/workflows/eval-live.yml` (add a simulator step)
- `.github/workflows/api-quality-gate.yml` (add a **new, separate** deterministic `--validate-baseline` step for the *simulator* baseline — distinct from the existing `:82-84` step that validates the main-harness `baseline.json`; LOW-1)
- `apps/api/eval-llm/README.md` (document both)

Out of scope (must NOT change):
- `apps/api/src/services/challenge-round/**` — the simulator measures the real
  `decideMasteryAndReview` / `transitionChallengeState`; they stay byte-identical.
- `apps/api/src/services/exchanges.ts` (`buildSystemPrompt`) — the flow exercises
  the real mentor prompt unchanged.
- The existing `baseline.json` envelope-signal infra — Feature 2 uses a
  **separate** `simulation-baseline.json`; the two baselines are not merged.
- Any required PR check. Neither feature may become a blocking check.

## Non-Goals

- Real-learner calibration (RR-2) — explicitly deferred, post-launch.
- A note-overlap histogram for the simulator (needs a DB-verified drafting step
  the DB-free harness doesn't produce — already documented in
  `simulation-metrics.ts`).
- Latency/cost dashboards, accessibility, bias probes (separate gaps from the
  2026-06-27 review; not this spec).

---

## Feature 1 — `teaching-session` flow

### What it measures (and why it's different from `misconception-repair`)

`misconception-repair` answers "can the mentor *correct a wrong belief* in 3
turns?" `teaching-session` answers the harder, more representative question:
**"across a realistic session, does the mentor actually teach a concept well
enough that the learner can use it afterward — without looping, losing context,
or just handing over the answer?"**

Four judged dimensions, each mapped to an error or warning:

| Dimension | Signal | Severity |
|---|---|---|
| **Transfer / retention** | Learner answers an *unaided novel probe* correctly at the end | `no` → **error**; `partial` → warning |
| **Scaffolding / pace** | Mentor matched the learner's age + starting gap (not too fast/slow) | clearly wrong → warning |
| **Coherence** | Mentor did NOT loop the same explanation or contradict an earlier turn | looped/contradicted → warning |
| **Told-not-taught** | Mentor reasoned, not just asserted the fact | true → warning |

Transfer is the only **error**-class dimension because it is the one that maps
to a real product failure (a learner who can't apply what was "taught"). The
softer three are warnings — surfaced for review, never block the run — mirroring
`misconception-repair`'s severity split.

### Mechanism (per scenario, `runLive`)

Mirrors `misconception-repair.ts` exactly, with a longer loop and a final probe:

1. Simulated learner opens with a **hidden competence brief** that pins a
   *starting gap* — e.g. "you do not yet understand why the moon has phases; you
   think it's Earth's shadow." (Same anti-confound device as
   `challenge-personas.ts`: the learner only updates if genuinely taught.)
   **Citation correction (MEDIUM-1):** because this flow "mirrors
   `misconception-repair.ts` exactly," it must copy that flow's **inline**
   simulated learner (`misconception-repair.ts:156-192`), NOT the separate
   `learner-agent.ts` machinery (`buildLearnerSystemPrompt` / `runLearnerTurn`),
   which belongs to the *challenge-grader* sim. Pick one and name it correctly in
   the implementation; do not blend the two.
2. For up to `MAX_MENTOR_TURNS = 8` rounds: real mentor (`buildSystemPrompt` →
   `runHarnessLlm`, candidate-override-able) responds; simulated learner replies
   in character (`callLlm` / production routing, override-immune).
3. **Transfer probe:** after the teaching loop, the learner is asked a
   pre-authored *novel but related* question, instructed to answer **using only
   what was just taught in the conversation** (the mentor does NOT answer it).
   **Confound guard (HIGH-4):** "use only what was taught" is a soft instruction
   a frontier learner can leak past — it may answer the probe correctly from
   pretraining, not from the session, which silently inflates `transfer: yes` and
   neuters the gate (transfer is the *only* error-class signal → the one that
   files the weekly issue). Two required mitigations: (a) the hidden
   competence-brief constraint from step 1 MUST carry into the probe answer (the
   learner answers the probe at its *taught* competence, not its latent
   knowledge); and (b) the seed run MUST include a **not-taught control** — a run
   where the mentor teaches nothing — and confirm that control yields
   `transfer: no`. If the control still scores `yes`, the probe is measuring
   pretraining, not teaching, and the scenario is invalid until reworked.
4. **Judge** (`callLlm`, production routing, override-immune) reads the full
   transcript + the transfer answer and returns the four-field verdict.

Model separation is identical to `misconception-repair`: mentor through
`runHarnessLlm` (so a `--openrouter-model` candidate can be A/B'd), learner +
judge through `callLlm` so a candidate can never play its own student or grade
its own teaching. Judge/learner failures are **warnings**, never errors.

### Concrete shapes (no placeholders)

```ts
// fixtures/teaching-scenarios.ts
export interface TeachingScenario {
  id: string;                 // 'TS01-moon-phases'
  profileId: string;          // MUST exactly equal an existing EvalProfile.id (see MEDIUM-2)
  subjectName: string;
  topicTitle: string;
  topicDescription: string;   // correct source material (mentor source-grounding)
  startingGap: string;        // hidden brief: what the learner does NOT yet grasp
  learnerOpening: string;     // first in-character line
  transferProbe: string;      // novel question answered unaided at the end
  transferRubric: string;     // what a correct transfer answer must contain
}
```

```ts
// flows/teaching-session.ts
export interface TeachingVerdict {
  transfer?: 'yes' | 'partial' | 'no' | unknown;
  scaffolding_appropriate?: unknown;     // bool
  looped_or_incoherent?: unknown;        // bool
  told_not_taught?: unknown;             // bool
  evidence?: unknown;                    // one-sentence quote
}

// Pure, exported, unit-tested exactly like evaluateMisconceptionVerdict():
export function evaluateTeachingVerdict(
  input: TeachingSessionInput,
  liveResponse: string,
): QualityIssue[];
```

The `runLive` return is the same JSON envelope shape `misconception-repair`
uses (`{ scenarioId, transcript, transferAnswer, verdict }`) so the snapshot is
human-readable and `evaluateQuality` re-parses it.

### Scenarios (initial set: 4)

One per subject family, each on a concept with a well-documented *starting gap*
(so the learner has somewhere to travel) and a clean transfer target. **Each
`profileId` is pinned to an exact existing `EvalProfile.id`** (the five fixtures
in `fixtures/profiles.ts`); the age in parentheses is that profile's `ageYears`:

- `TS01-moon-phases` (Science, `12yo-dinosaurs`, 12yo) — gap: phases = Earth's
  shadow; transfer: predict what a waxing crescent looks like.
- `TS02-fractions-of-fractions` (Math, `15yo-football-gaming`, 15yo) — gap: "of"
  always means multiply bigger; transfer: ½ of ⅓.
- `TS03-past-tense-trigger` (Languages, `13yo-spanish-beginner`, 13yo) — gap:
  picks tense by vibe; transfer: choose tense for a new sentence.
- `TS04-supply-demand` (Humanities, `17yo-french-advanced`, 17yo) — gap: price =
  cost only; transfer: predict price under a supply shock.

**Silent-skip guard (MEDIUM-2).** The misconception-repair runner skips any
scenario whose `profileId` doesn't match (`misconception-repair.ts:361`,
`if (spec.profileId !== profile.id) continue;`) — a mistyped id produces **no
error and no snapshot**, i.e. a *false green* where the scenario never ran. The
`teaching-session` flow MUST instead **hard-error at startup** if any scenario's
`profileId` resolves to no `EvalProfile` (assert against `getProfile(id)` /
`fixtures/profiles.ts`), so a typo fails loud rather than silently dropping
coverage.

4 scenarios keeps the weekly cost bounded: 4 × (8 mentor + 7 learner + 1 probe +
1 judge) ≈ 68 internal calls, but only **4** `runLive` invocations against the
runner's `--max-live-calls` budget (the cap counts invocations, not internal
calls — see `misconception-repair.ts` cost note).

### CI integration — **free**

Registering `teachingSessionFlow` in `index.ts` `FLOWS` means the existing
`eval-live.yml` step (`pnpm eval:llm -- --live --check-baseline`) already runs
its `runLive` + `evaluateQuality`; a transfer **error** increments
`qualityFailures` → the harness exits 1 → the weekly issue is filed. No new
workflow step. Per-PR, Tier-1 renders the opening mentor turn as a snapshot (no
LLM), exactly as `misconception-repair` does today.

---

## Feature 2 — Mastery-simulation tracked gate

### The gap

`simulate.ts` already drives non-scripted multi-turn Challenge Rounds and
computes the safety-critical metric — **over-credit rate** (gate said
`verified` when ground truth wasn't). But today it: writes to a gitignored
`corpus/`, has no committed baseline, no pass/fail, and runs nowhere automated.
A prompt change that makes the mentor grade leniently would silently raise
over-credit and nobody would see it.

### Design

**1. Hard over-credit ceiling (the real gate).** The mastery gate
(`decideMasteryAndReview`) is pure and conservative (`evaluation.ts:169-177`:
`verified` only when EVERY concept is `solid` with no partial/misconception), so
over-credit can only occur if the **grader emits a `solid` evaluation for a
wrong/vague answer** — exactly the false-mastery failure. On the
production-faithful pipeline that grader is now the **Sonnet 4.6 LLM**
(`runChallengeRoundGrader`, §3 below), not the mentor's inline envelope. A
correct system produces **zero** over-credit on the fixture grid. The hard
assertion is absolute, not drift-based:

```
overCreditCount === 0   →  pass
overCreditCount  >  0   →  FAIL (exit 1), name the offending scenario(s)
```

**Non-flakiness must be engineered, not assumed (HIGH-1).** The "not flaky"
claim only holds if the grader *never* slips even once across the grid × `--runs`
— but the grader is an LLM, and `--runs 3` triples the chances for a single
borderline-lenient call to trip a strict `=== 0` gate and file a false-positive
`ci` issue. Zero-tolerance on LLM output is only safe under two conditions, both
of which are **requirements**, not nice-to-haves:

- **Fixture constraint.** Every answer in the over-credit grid MUST be
  *unambiguously* wrong/vague — no borderline items a competent grader could
  defensibly credit. A scenario whose "wrong" answer is genuinely arguable does
  not belong in the hard-gate grid (move it to the soft drift metrics instead).
- **Empirical seed validation.** Before committing `simulation-baseline.json`,
  run the grid **≥5×** and confirm `overCreditCount === 0` on *every* run. If any
  run shows a non-zero count on a fixture believed correct, the fixture is
  borderline (fix or demote it) — do not commit a baseline whose hard gate has
  not been shown stable.

With those satisfied, a non-zero count is a genuine regression, not noise.
(Contrast under-credit and outcome-distribution, which *are* noisy even on a
correct system — those get drift tolerance, not a hard gate.)

**2. Drift tracking for the soft metrics.** A committed
`simulation-baseline.json` captures `outcomeRates`, `masteryVerifiedRate`,
`underCreditRate`, and `signalEmissionRateByMentor` from a seed run. A new pure
`compareSimulationBaseline(current, baseline, tolerancePp)` in
`simulation-metrics.ts` flags drift beyond tolerance, reusing the small-N
widening idea from `runner/metrics.ts`. Drift is a **warning/alert**, not a hard
fail (these rates legitimately move with model updates).

**3. Production-faithful pipeline + pinned models.** Two corrections grounded in
`docs/registers/llm-models/master.md`:

- **The sim must run the *grader* path, not the legacy inline path.** As written,
  `runSimulatedRound` reads `challenge_round_evaluation` straight from the mentor
  envelope (the flag-OFF inline path). But the production V2 tutor is
  **`gpt-oss-120b`**, which **drops that signal** (`[]`) — the entire reason the
  dedicated grader exists (register dependency note 2026-06-26; memory
  `project_gptoss_drops_challenge_eval_signal`). So pinning tutor = gpt-oss with
  today's sim is a degenerate gate (every round `invalid`, masteryVerified ≈ 0).
  Feature 2 wires the real `runChallengeRoundGrader` (Sonnet 4.6 via the *real
  router*, `capability:'judge'`) to supply the evaluation when the tutor omits
  it — measuring the **actual production pipeline: gpt-oss tutor + Sonnet
  grader**, the one hardened in #1538. Feasible without collision: the grader
  routes via `routeAndCall`, untouched by the harness's `--mentor-model`
  OpenRouter override (which only pins `runHarnessLlm`/tutor calls).
  **Match the production invocation condition (LOW-2):** the sim must call the
  grader under the *same* condition production does (verify in
  `session-exchange.ts:~1131` — unconditional vs only-when-signal-empty). For the
  pinned gpt-oss tutor the envelope is always `[]`, so both always call the
  grader and the paths agree; but if a *candidate* tutor that emits the signal is
  ever A/B'd, a "call grader only when the tutor omits it" shortcut would diverge
  from production. Mirror production's actual trigger, don't approximate it.

- **The two-model guard is learner-vs-*grader* — and the existing guard must be
  re-pointed (HIGH-2).** The entity producing the mastery judgment must not share
  blind spots with the learner. On the grader path that is the **grader (Sonnet
  4.6)**, not the tutor — so the guard pins learner ≠ Anthropic family. Register,
  verbatim: *"an evaluator sharing the tutor's vendor shares its blind spots."*
  **But `simulate.ts:122` ships an `--allow-same-family` guard that today compares
  learner-vs-*mentor*.** With the pinned set below, learner `openai/gpt-4o` and
  tutor `openai/gpt-oss-120b` are the **same `openai/` family**, so a
  learner-vs-mentor guard would **hard-error before any LLM call** — and the
  weekly CI command (§ CI wiring) passes no `--allow-same-family`. The fix is to
  **re-point the guard to learner-vs-grader** (in scope, `simulated-conversation.ts`
  / `simulate.ts`); learner sharing the *tutor's* family is acceptable precisely
  because the tutor does not produce the mastery judgment. The Failure-Modes F2
  row is corrected to "learner == grader family" to match.

**Pinned set (register-grounded; ruled with the user 2026-06-27):**

| Role | Slug | Source | Routed via |
|---|---|---|---|
| tutor | `gpt-oss-120b` | approved production primary text | harness override (`--mentor-model openai/gpt-oss-120b`) |
| grader | **production judge-of-record** via `capability:'judge'` (today resolves to `claude-sonnet-4-6` non-reasoning) | approved production `capability:'judge'` | real router (`runChallengeRoundGrader`) |
| learner | `openai/gpt-4o` | test-only OpenRouter role-player (NOT production-approved) | `--learner-model` |

**The grader is pinned by *capability*, not by hardcoded slug (HIGH-3).**
`master.md:49` marks the Sonnet 4.6 judge "Eval-selected (**T10 bake-off
pending**)," with Haiku 4.5 as a demotion candidate — i.e. the judge model is
**not yet locked**. The sim must therefore let `runChallengeRoundGrader` resolve
the judge through the real `capability:'judge'` router (so it always tracks the
production judge-of-record), and the committed `simulation-baseline.json` MUST be
**re-seeded when T10 lands** if the selection changes — otherwise the baseline
silently goes stale and the over-credit grid is graded by a model the baseline
never saw. This makes the spec's pre-sign-off probe (Open Questions) a real
dependency, not a one-line nicety. See the Rollout re-seed step.

**Gemini is excluded everywhere** (owner ruling 2026-06-23, age-independent;
`FALLBACK_FORBIDDEN={gemini,vertex}`) — never tutor, grader, or learner. A fixed
learner + tutor + grader is what makes the committed baseline comparable
run-to-run, so deltas reflect *prompt/grader* changes, not model swaps.

**4. CLI modes** (mirror the main harness verbs):
- `--validate-baseline` — deterministic, key-free structural check (every
  required scenario present, `n > 0`). **CI-safe on every PR.**
- `--check-baseline` — live run, compares to committed baseline, enforces the
  over-credit ceiling + drift tolerance; exits 1 on ceiling breach.
- `--update-baseline` — seed/re-baseline; writes `simulation-baseline.json`,
  commit after.

### Concrete shapes

```ts
// simulation-metrics.ts — additions
export interface SimulationBaseline {
  version: 1;
  updatedAt: string;            // stamped by caller; `simulate.ts` is a plain tsx entry point where Date is available (the Date.* ban is Workflow-script-only — NIT-1)
  learnerModel: string;
  mentorModel: string;
  scenarioCount: number;
  rates: {
    outcome: Record<MasteryOutcome, number>;
    masteryVerified: number;
    underCredit: number;
    signalEmissionByMentor: Record<string, number>;
  };
}

export interface SimulationGateResult {
  overCreditCount: number;      // HARD ceiling input
  overCreditScenarioIds: string[];
  drift: Array<{ metric: string; baseline: number; current: number; delta: number }>;
  pass: boolean;                // overCreditCount === 0
}

export function compareSimulationBaseline(
  current: SimMetrics,
  baseline: SimulationBaseline,
  tolerancePp: number,
): SimulationGateResult;
```

### CI wiring

- **Per-PR (deterministic, `api-quality-gate.yml`):** add
  `pnpm --filter @eduagent/api eval:llm:sim -- --validate-baseline` under the
  existing `eval` change-class gate. Key-free, never flaky — proves the
  committed baseline isn't a placebo.
- **Weekly + label (`eval-live.yml`):** add a step after the existing live step:
  ```yaml
  - name: Mastery-simulation gate (over-credit ceiling + drift)
    env: { DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN_STG }} }
    run: >-
      doppler run -- pnpm --filter @eduagent/api eval:llm:sim --
      --mentor-model openai/gpt-oss-120b --learner-model openai/gpt-4o
      --runs 3 --max-live-calls 90 --check-baseline
  ```
  The grader (Sonnet 4.6) is supplied by the real router inside the sim, so it is
  *not* a CLI flag — needs `ANTHROPIC_API_KEY` (grader) + `OPENROUTER_API_KEY`
  (tutor + learner) in the stg Doppler config.
  Reuses the existing `Notify on scheduled failure` issue-filing — an over-credit
  breach files/【comments the same `ci`-labelled issue.

---

## Failure Modes

| State | Trigger | User (engineer) sees | Recovery |
|---|---|---|---|
| Judge LLM unavailable (F1) | timeout / unparseable verdict | `…judge-unavailable` **warning**, transcript not judged | Re-run; never blocks (matches `misconception-repair`) |
| Learner sim fails mid-session (F1) | OpenRouter 429/5xx | `[learner sim failed …]` line, loop breaks, judge still runs on partial transcript | Re-run; warning only |
| Mentor call fails (F1) | provider error | `[mentor call failed …]` in transcript; judge likely rules `no` | Investigate provider; weekly issue filed |
| Over-credit > 0 (F2) | **grader (Sonnet) emitted `solid` for a wrong/vague answer** | **Hard fail**, exit 1, offending scenario id named | First **re-run the offending scenario**: a single non-reproducing breach is an LLM slip → the fixture is borderline; fix or demote it (HIGH-1). A **reproducible** breach is a real regression — fix the grader/prompt; do NOT raise the ceiling |
| Leniency regression ships green, caught late (F2) | per-PR gate is only structural `--validate-baseline`; the real over-credit gate runs **weekly** (`eval-live.yml` cron) | nothing on the PR; up to **~7 days** later a weekly `ci` issue is filed | Accepted-risk window by design (gate is off the required-PR path, non-deterministic). Tighten only by promoting the live gate, which the spec deliberately declines (MEDIUM-3) |
| Soft-metric drift (F2) | model update shifts under-credit/outcome rates | drift warning in output + weekly issue | If intentional, `--update-baseline` + commit with justification |
| Placebo baseline (F2) | someone commits `{scenarios:{}}` | per-PR `--validate-baseline` **fails** | Seed a real baseline before merge |
| Two-model guard trips (F2) | learner == **grader** family (corrected per HIGH-2) | hard error before any LLM call | Pick a learner outside the grader's family (learner sharing the *tutor* family is allowed) |
| Small-N flake (F2 soft only) | few scenarios × few runs | drift false positive | `--runs ≥ 3`; tolerance widened for small N; hard gate (over-credit) is immune *once the HIGH-1 fixture constraint + seed validation hold* |

## Test strategy (code profile)

Pure, deterministic, no-LLM unit tests are the verification seam — the LLM
boundary is exercised only in the live gate, never in jest:

- `teaching-session.test.ts` — `evaluateTeachingVerdict()`: transfer `no` →
  error; `partial` → warning; each soft dimension → warning; missing/unparseable
  verdict → warning; reinforced-style miseducation maps correctly. (Red-green:
  assert error count per crafted verdict.)
- `simulation-metrics.test.ts` — `compareSimulationBaseline()`: `overCredit > 0`
  → `pass:false` + named ids; within tolerance → no drift; beyond tolerance →
  drift entry; small-N widening; `--validate-baseline` rejects empty baseline.

Both follow the harness's existing "pure verdict→issue" pattern
(`evaluateMisconceptionVerdict` is the reference) so no internal mocks are
needed (GC1-clean).

## Rollout

1. Land Feature 1 + Feature 2 code + unit tests (off-path; no required-check risk).
2. **Validate the hard gate before trusting it (HIGH-1).** Run the over-credit
   grid **≥5×** on `stg`; the seed is acceptable only if every run shows
   `overCreditCount === 0`. Any non-zero on a fixture believed correct = borderline
   fixture → fix or demote to soft metrics before seeding.
3. **Validate Feature 1's transfer signal has teeth (HIGH-4).** Run the
   not-taught control (mentor teaches nothing); confirm it scores `transfer: no`.
   If it scores `yes`, the probe is reading pretraining — rework the scenario.
4. Seed both baselines from one live `stg` run; commit with the run's metrics in
   the message.
5. Add the CI steps. Confirm per-PR `--validate-baseline` is green and the weekly
   workflow runs end-to-end via `workflow_dispatch` once before relying on the cron.
6. Watch one weekly cycle; tune tolerance if the soft metrics flag noise.
7. **Re-seed on judge reselection (HIGH-3).** When the T10 judge bake-off lands,
   if it changes the `capability:'judge'` model, re-run steps 2 + 4 and commit a
   fresh `simulation-baseline.json` — the old one is graded by a model the new
   judge replaced.

## Adversarial review (2026-06-27)

This spec was hardened against a codebase-grounded red-team pass. Inline `(HIGH-n
/ MEDIUM-n / LOW-n / NIT-n)` tags above reference these findings:

- **HIGH-1** — over-credit `=== 0` hard gate runs on an LLM grader; non-flakiness
  now requires unambiguous-wrong fixtures + a ≥5× zero-over-credit seed
  validation, with a re-run/reproduce recovery branch.
- **HIGH-2** — pinned learner (`gpt-4o`) and tutor (`gpt-oss-120b`) share the
  `openai/` family; the existing `simulate.ts:122` learner-vs-mentor guard must be
  re-pointed to learner-vs-grader, and the Failure-Modes row corrected.
- **HIGH-3** — the judge model is "T10 bake-off pending" (`master.md:49`), not
  locked; grader pinned by `capability:'judge'` resolution, baseline re-seeded on
  reselection, and the sign-off probe elevated to a dependency.
- **HIGH-4** — frontier learner can answer the transfer probe from pretraining;
  competence-brief constraint must carry into the probe + a not-taught control
  must score `transfer: no` at seed time.
- **MEDIUM-1** — corrected the learner-machinery citation (inline
  `misconception-repair.ts:156-192`, not `learner-agent.ts`).
- **MEDIUM-2** — pinned exact `EvalProfile.id`s and required a hard-error startup
  guard against the silent profile-skip false-green.
- **MEDIUM-3** — documented the up-to-7-day leniency-regression detection window
  as accepted risk.
- **LOW-1 / LOW-2 / NIT-1** — clarified the sim `--validate-baseline` is a new
  separate step, required matching production's grader-invocation condition, and
  fixed the misleading `Date.*`-ban comment.

What the review confirmed *correct* and left unchanged: the "CI free" claim for
Feature 1 (`eval-live.yml:95` already runs `--live --check-baseline`); the
`--max-live-calls` invocation-not-internal-call accounting; `decideMasteryAndReview`
being pure/conservative (`evaluation.ts:169-177`); the gpt-oss-drops-signal →
grader-needed rationale (`master.md:132`); and the synthetic-pre-screen honesty
framing.

## Resolved decisions

- **OQ1 — pinned gate models — RESOLVED 2026-06-27.** Approved production models
  for tutor + grader, distinct non-approved family for the learner: tutor
  `gpt-oss-120b`, grader `claude-sonnet-4-6`, learner `openai/gpt-4o`. This makes
  Feature 2 production-faithful, which adds the grader-wiring task to the plan
  (see Feature 2 §3). Verified feasible — the grader routes via the real router,
  independent of the harness's tutor override.
- **OQ2 — scenario count — RESOLVED 2026-06-27.** Feature 1 starts at 4 scenarios
  (one per subject family, cost-bounded ~68 internal calls/week) and grows later.

## Open questions (for sign-off)

- **Dependency, not a nicety (HIGH-3).** Before seeding the baseline, confirm the
  eval-env `capability:'judge'` routing resolves to the intended production
  judge-of-record (today `claude-sonnet-4-6`, not a fallback) when
  `runChallengeRoundGrader` runs under stg Doppler. This is load-bearing because
  the committed `simulation-baseline.json` and the over-credit grid are both
  graded by whatever this resolves to; a silent fallback would seed a baseline the
  weekly run can't reproduce. Run the live probe *before* step 2 of Rollout, and
  re-confirm whenever T10 changes the judge selection.
