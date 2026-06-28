# Eval-LLM Harness

A fixture-driven eval harness for all LLM prompt builders in `apps/api/src/services/`. Lets you tune prompts by diffing snapshots instead of running the app end-to-end.

## Why this exists

Prompt tuning without a repeatable eval is vibes-based. You change one line, check one output, ship it, and regress other user profiles silently. This harness runs a fixed matrix of synthetic learner profiles through every registered prompt flow and writes the output to markdown snapshots committed to the repo. Prompt changes become reviewable diffs in PRs.

See [`docs/specs/2026-04-18-llm-personalization-audit.md`](../../../docs/specs/2026-04-18-llm-personalization-audit.md) for the audit that motivated this harness.

## Two tiers

| Tier | What it captures | Cost | Determinism |
|---|---|---|---|
| **Tier 1** (default) | The rendered prompt string | Free | Fully deterministic |
| **Tier 2** (`--live`) | Tier 1 + real LLM response | Burns credits | Non-deterministic |

Use Tier 1 for prompt-regression checks on every push. Use Tier 2 for tuning sessions where you want to see how the model actually responds to personalization.

> **Status note (2026-05-02 audit / [AUDIT-EVAL-2]):** The `exchanges` flow now implements `runLive` (the first in the harness) — running `pnpm eval:llm --flow exchanges --live` hits the production LLM router via `runner/llm-client.ts`, which tags telemetry with `flow: "eval-harness"` so dashboards can filter eval calls. `expectedResponseSchema: llmResponseEnvelopeSchema` and the per-sample envelope-drift metrics on `exchanges` are now both active. The remaining ~12 flows still report `runLive not implemented for this flow`; copy the `exchanges` pattern when wiring them up. There is one known prompt-fidelity divergence tracked as `AUDIT-EVAL-3`: production `processExchange` concatenates `buildOrphanSystemAddendum(...)` onto the system prompt; the harness does not (yet).

## Usage

```bash
# list all registered flows and profiles
pnpm eval:llm -- --list

# run all tier-1 snapshots (no LLM calls)
pnpm eval:llm

# run only one flow
pnpm eval:llm -- --flow quiz-capitals

# run a named adversarial suite within an enumerated flow
pnpm eval:llm -- --flow probes --scenarios source-grounding
pnpm eval:llm -- --flow probes --scenarios personalization
pnpm eval:llm -- --flow probes --scenarios homework-source
pnpm eval:llm -- --flow book-suggestion-regeneration --scenarios book-suggestions

# run only one profile across all flows
pnpm eval:llm -- --profile 09yo-dinosaurs

# combine: single flow × single profile
pnpm eval:llm -- --flow dictation-generate --profile 06yo-fairytales

# tier 2 — real LLM calls (requires Doppler for API keys)
doppler run -- pnpm eval:llm -- --live
```

## Signal-distribution baseline (Layer 1 drift guard)

The harness can detect *aggregate envelope-signal drift* — e.g. the model
silently dropping valid JSON, or `partial_progress` collapsing from 20% to 2%
after a prompt tweak. It does this by histogramming the live envelope
responses of the `emitsEnvelope` flows (`exchanges`, `probes`) and comparing
them to a checked-in `baseline.json`.

| Command | LLM calls? | Deterministic? | Use |
|---|---|---|---|
| `pnpm eval:llm -- --validate-baseline` | **No** | **Yes** | CI/PR guard: fails if `baseline.json` is a placebo (`flows: {}` / `n=0`). No Doppler, no credits. |
| `doppler run -- pnpm eval:llm -- --live --update-baseline` | Yes | No | **One-time seed / intentional re-baseline.** Writes real metrics to `baseline.json`; commit after. |
| `doppler run -- pnpm eval:llm -- --live --check-baseline` | Yes | No | Compare a live run against the committed baseline; exits 1 on drift > tolerance (default 5pp, widened to 2/n for small flows). Run manually / on a schedule, never on every PR (it burns credits and is noisy by nature). |

> **Why the split.** `--check-baseline` needs live, non-deterministic LLM
> output, so it cannot run key-free on every PR without flakiness. The
> deterministic `--validate-baseline` is the part CI *can* run on every PR: it
> guarantees the committed baseline is real (not the empty stub that silently
> hides drift). **`baseline.json` must be seeded once** with
> `--live --update-baseline` against staging keys before `--validate-baseline`
> will pass; until then it intentionally fails to flag the missing baseline.

### Seeding semantics (WI-556)

The seed run must cover **every** `emitsEnvelope` flow with enough budget:

```bash
doppler run -- pnpm eval:llm -- --live \
  --flow exchanges --flow probes --flow safety-probes --flow language-quality \
  --max-live-calls 250 --update-baseline
```

- **Structural guard:** `--update-baseline` refuses to write a baseline whose
  flows map is empty or missing any envelope-emitting flow (the same rule set
  as `--validate-baseline`). A budget-starved run cannot produce the placebo
  baseline the validator exists to catch.
- **Quality failures do not block the write — but they are never silent.**
  The baseline tracks envelope-signal *distribution*; failed samples are part
  of that distribution (`envelopeOk < 1.0` is itself a tracked rate). When a
  seed run has scenario-level quality failures, `baseline.json` IS written,
  the failures are printed, and the run still **exits 1** — triage each
  failure (fix the prompt/evaluator, or file a work item) before committing
  the seeded baseline.
- **Small-sample tolerance:** the drift comparison widens its tolerance to
  `2/n` per flow, so a flow with n=6 samples (language-quality) does not flag
  16.7pp "drift" every time a single sample flakes, while large flows keep
  the flat 5pp sensitivity.

Snapshots land in `apps/api/eval-llm/snapshots/<flow-id>/<profile-id>.md`.

## Focused Live Gates

The root `package.json` exposes focused runners for launch-risk areas:

| Script | Coverage |
|---|---|
| `pnpm test:llm:source-grounding` | no source, thin source, reliable source, unsupported learner claim, memory-only claim, forum/chat-like source |
| `pnpm test:llm:personalization-matrix` | ages 11/13/17/18, ADHD-style support, autism-style support, no accommodation, serious/casual study, returning learner history |
| `pnpm test:llm:provider-degradation` | Gemini/OpenAI/Claude timeout, 503, malformed JSON, and rate-limit degradation; includes Gemini-only policy protection |
| `pnpm test:llm:homework-source` | enough problem text, too little problem text, conflicting learner answer, photo-like/source context |
| `pnpm test:llm:post-session-artifacts` | session summaries, learner recaps, session analysis/memory notes, parent progress summaries, and assessment/challenge evaluation artifacts |
| `pnpm test:llm:artifact-personalization` | internal summaries, learner recaps, learner-memory insights, parent summaries, and challenge feedback for current details, updated learner preferences, concrete next actions, and cross-artifact variation |
| `pnpm test:llm:book-suggestions` | relevance, diversity, age register, Four Strands language suggestions, source-neutral descriptions, duplicate/tiny-book avoidance |

The probe-based suites intentionally include learning, review/practice, homework, free chat, and Four Strands language scenarios so failures are not hidden behind the happy-path tutoring loop.

## Adding a flow

1. Export the prompt builder from its source file if it isn't already. The builder must be a **pure function** — input → string.
2. Create `apps/api/eval-llm/flows/<flow-id>.ts` that exports a `FlowDefinition`:

   ```ts
   import { buildYourPrompt } from '../../src/services/your-flow';
   import type { FlowDefinition, PromptMessages } from '../runner/types';
   import type { EvalProfile } from '../fixtures/profiles';

   export const yourFlow: FlowDefinition = {
     id: 'your-flow',
     name: 'Your Flow',
     sourceFile: 'apps/api/src/services/your-flow.ts:buildYourPrompt',
     buildPromptInput(profile) {
       return { /* map profile fields to builder input */ };
     },
     buildPrompt(input) {
       return { system: buildYourPrompt(input), user: '…' };
     },
   };
   ```

3. Register it in `apps/api/eval-llm/index.ts` by pushing onto `FLOWS`.
4. Run `pnpm eval:llm -- --flow your-flow` and commit the generated snapshot files.

## Adding a profile

Append to `PROFILES` in `apps/api/eval-llm/fixtures/profiles.ts`. Every registered flow picks it up automatically on the next run.

## Snapshot format

Each snapshot is a single markdown file:

- **Profile summary** — one-line plus a table of every personalization field
- **Builder input** — the JSON shape handed to the real builder
- **Generated prompt** — system + user messages (fenced)
- **Builder notes** — annotations flagging what the builder isn't using (gaps)
- **Live LLM response** — present only under `--live`

Markdown lets you eyeball differences in a PR diff without the harness needing to render anything clever.

## Challenge-Round simulated-learner harness (`eval:llm:sim`)

A **standalone** dual-agent simulator (not a `FlowDefinition` — flows are
single-turn). One LLM plays the **learner** in character from a hidden
competence brief. Each learner answer is then **graded by the production judge**
(`buildChallengeRoundGraderPrompt` → rung 1, `capability:'judge'`) — the
component production actually runs when `CHALLENGE_ROUND_GRADER_ENABLED` is on
(the V2 default). A separate **tutor** turn (`buildSystemPrompt`, pinned to
`MENTOR_MODEL` = `openai/gpt-oss-120b` via the OpenRouter candidate path —
the harness router can't reach the production gpt-oss host, and under stg
production routing would resolve a minor's tutor to Gemini/gpt-4o, never
gpt-oss) only produces the next question. The pure state machine
(`transitionChallengeState`) and the pure mastery gate (`decideMasteryAndReview`)
run in-memory over the judge's verdicts. The driver compares the gate's outcome to
each scenario's ground-truth `expectedOutcome` to compute over-/under-credit and
**per-grader** signal-emission rates.

> **The GRADER is the measured component, not the tutor.** With the grader flag
> on, the tutor emits **no** inline `challenge_round_evaluation` — a separate
> judge call owns it (the gpt-oss signal-drop was the very reason the judge was
> introduced). The candidate-under-test is therefore the **grader** (`--grader-model`),
> production-routed by default; the tutor is never routed to the candidate slug.

```bash
# List the scenario grid — no LLM call, no Doppler, no provider bootstrap.
pnpm --filter @eduagent/api eval:llm:sim -- --list

# Live grid: a DISTINCT learner is graded by the production judge (default) or
# by an explicit grader candidate. Learner and grader must differ (see guard).
# The learner must be a valid OpenRouter slug AND a different family from the
# resolved grader — under stg the minor judge is gpt-4o-mini, so `openai/gpt-4o`
# COLLIDES (guard hard-fails); use a non-gpt learner like llama-3.3-70b.
# Omit --max-live-calls to auto-fit the budget to the full grid (no silent truncation).
doppler run -c stg -- pnpm --filter @eduagent/api eval:llm:sim -- \
  --learner-model meta-llama/llama-3.3-70b-instruct --runs 2 --max-live-calls 30

# Pin an explicit grader candidate instead of production routing (any valid
# OpenRouter slug; must differ from the learner family):
doppler run -c stg -- pnpm --filter @eduagent/api eval:llm:sim -- \
  --learner-model meta-llama/llama-3.3-70b-instruct --grader-model deepseek/deepseek-chat \
  --runs 2 --max-live-calls 30
```

Flags: `--learner-model <slug>` (required for a run), `--grader-model <slug>`
(optional candidate; default = production judge routing), `--provider <slug>`,
`--topics <csv|all>`, `--runs <n>`, `--max-live-calls <n>` (optional **hard
cap**; when omitted the budget auto-fits to `grid × 9 calls/round`
(**9 calls/round** = 3 calls/question × `MAX_CHALLENGE_QUESTIONS=3`) so a run
never silently truncates the grid), `--list`, `--allow-same-family`, and the
three **baseline verbs** below (`--validate-baseline`, `--check-baseline`,
`--update-baseline`). Output lands in `eval-llm/corpus/<timestamp>/` (gitignored)
as one transcript JSON per round plus `metrics.json`.

### Over-credit gate + baseline (three verbs)

The simulator is a **tracked gate**, not just an observation tool. The committed
`eval-llm/simulation-baseline.json` (provenance-stamped, seeded operationally —
see the seeding note) anchors three verbs:

- **`--validate-baseline`** — **key-free, no LLM call.** Structurally validates
  the committed baseline (`validateBaselineStructure`: version, `learnerModel`,
  `graderModel`, `provenance`, `scenarioCount`, and the `rates` block) **and**
  re-resolves the live `capability:'judge'` slug, exiting 1 if it ≠
  `baseline.graderModel`. That **judge-slug drift check** closes the silent-
  staleness hole: if the production judge is reselected, the baseline is
  declared stale on the very next PR rather than scoring against the wrong model.
  This is the per-PR step in `api-quality-gate.yml` (deterministic, no secrets).
- **`--check-baseline`** — live grid (needs Doppler `-c stg`), then
  `compareSimulationBaseline` vs the committed baseline. The over-credit ceiling
  is **reproduce-gated**: a first-pass over-credit is re-tested `REPRODUCE_N=3`×
  and exits 1 only if it **reproduces** — so a one-off LLM slip does not red CI.
  It **fails closed**, never open: if the re-test can't fully requalify every
  offender within the `--max-live-calls` budget, or any re-test round is skipped,
  the detected breach stands (exit 1) — a breach is never exonerated by missing
  data. The committed baseline is loaded + validated **before** the paid run, and
  a 0-round (empty) corpus hard-fails rather than passing green. Soft drift
  beyond tolerance only warns. This is the **weekly** step in `eval-live.yml`.
- **`--update-baseline`** — re-seed: runs the grid, writes
  `simulation-baseline.json` via `toBaseline` (stamps the resolved `graderModel`
  + `provenance: 'update-baseline'`). Run this — and commit — whenever the
  judge-slug drift check reds, or when a quality change intentionally moves the
  distribution.

> **`signalEmitted` now means "the GRADER emitted evals"** (its fail-open rate),
> not "the tutor emitted the inline signal" — the metric (`signalEmissionByMentor`
> in the baseline, kept for shape-compatibility) is reinterpreted accordingly and
> remains the gpt-oss/grader health indicator, now also a drift metric in
> `compareSimulationBaseline`.

> **Disclosed empty-grader divergence.** On a `[]` grader result the simulator
> falls open to the legacy inline-state `answer_complete` path; **production
> instead** bumps `questionsAsked` and runs `resolveGraderStallTermination`. This
> affects only the **soft** outcome/termination distribution — the **hard
> over-credit ceiling is unaffected** (empty ⇒ no `solid` ⇒ no `verified`). Do
> not read the empty branch as "production-faithful".

> **Weekly-gate ownership (F11).** The weekly `eval-live.yml` run files a
> `ci`-labelled issue on failure. Triage owner: **@jojorgen** (API / eval-harness
> owner per `.github/CODEOWNERS`). A reproduced over-credit breach is a real
> grader-leniency regression — fix the grader/prompt and re-seed; **never raise
> the ceiling.**

### Why this complements RR-2 but does NOT discharge it

A model playing a 14-year-old emits **model-shaped, not teen-shaped** answers.
Per spec **CH-4**, any mastery bar tuned on this synthetic corpus is
**provisional**: it is a **pre-screen**, not the real-staging-transcript corpus
RR-2 requires. RR-6 *depends* RR-2 and RR-12 *depends* RR-2+RR-6, so the
synthetic corpus must **not** be read as "RR-2 done", and the post-launch
recalibration against real learner data still stands.

### The two-model guardrail

The learner model and the **grader** model **must differ**, or correlated
errors inflate the `solid` rate and produce a falsely lenient bar. The axis that
matters is learner-vs-**grader** (the model answering vs the model judging), not
learner-vs-tutor — a learner sharing the *tutor's* family is explicitly allowed.
The guard refuses to run when:

1. The slugs are identical (explicit `--grader-model` candidate or the
   production-routing default — the null case resolves the router's concrete
   **judge** slug for the profile's age bracket and applies the same check).
2. They share a **base family** (heuristic: provider prefix stripped, size/date
   suffixes dropped, first two tokens compared — `openai/gpt-oss-120b` and
   `gpt-oss-120b` both collapse to `gpt-oss`). This is heuristic (the same model
   can be served under different slugs/providers); pass `--allow-same-family`
   for a deliberate same-family A/B.

A third, **soft** axis warns but does not throw: a same-**vendor-root**,
different-family pair (e.g. `deepseek-chat` vs `deepseek-r1`) — distinct enough
to clear the family guard, but close enough lineage to be worth a `console.warn`
so a correlated-error A/B isn't run unknowingly.

### Scope limits (read before trusting a number)

- **DB-free → results are an UPPER BOUND.** `decideMasteryAndReview` runs for
  real, but the production-only `validateEvaluationEventIds` (DB lookup that
  **rejects the *whole* evaluation** — `throw` on *any* `answerEventId` that
  can't be matched to a real `session_events` row, routing the round to
  `invalid`) is **not** called — there is no seeded DB. That step can only ever
  *remove* a verdict, never upgrade one, so skipping it biases in one direction:
  the harness's `verified`/over-credit rates are an **upper bound** on
  production, never a lower bound (the all-or-nothing rejection makes production
  *more* aggressive at dropping, so the bound holds). `metrics.json` stamps this
  caveat. DB-anchoring stays covered by `evaluation.test.ts` + integration tests.
- **Under-18 gate collapses the judge to the gpt-oss fallback for the shipped
  grid.** Every sim scenario profile is a minor, and production's under-18 gate
  (`router.ts`) short-circuits `capability:'judge'` to the approved text
  fallback (Cerebras gpt-oss) *before* the vendor-independent grader model is
  ever reached. The harness reflects this faithfully — `resolveProductionGraderModel`
  and the null-routing path both hit the same gate, and the two-model guard
  compares the learner against that *real resolved* slug — but it means the
  default-routing run validates the **gpt-oss judge**, not a distinct anthropic
  grader. Read "production JUDGE" as "the judge production actually runs for
  these ages", not "a separate vendor's model". To exercise a distinct judge,
  pass an explicit `--grader-model` (and accept it isn't what minors hit in prod).
- **Low N is flagged, not hidden.** Below `MIN_ROUNDS_FOR_CALIBRATION` (30 — i.e.
  ≥5 runs across the 6-scenario grid) the corpus is marked
  `sufficientForCalibration:false` and every headline rate ships a **Wilson 95%
  CI + denominator**. A 6×1 grid moves a rate ~17pp on a single flip; the CI and
  the INSUFFICIENT-N note exist so that number can't be screenshotted as "the
  bar is calibrated".
- **Note-overlap calibration is NOT in scope.** `MIN_LEXICAL_OVERLAP_NOTE_DRAFT`
  is consumed only by the note-draft path against DB-verified content this
  harness does not produce. RR-6's **note-overlap** half stays blocked on a
  drafting-path harness or real transcripts; this feeds only the **mastery-bar**
  half.
- **The grader parse contract is the production path** (`extractFirstJsonObject`
  → `JSON.parse` → `challengeRoundGraderVerdictSchema`, mirroring
  `runChallengeRoundGrader`): a no-JSON / parse-error / schema-invalid / `items:[]`
  grader turn counts as a dropped signal (`signalEmitted=false`), exactly as
  production fails open. That is the **gpt-oss signal-drop** indicator on RR-12.
  (Soft termination on that `[]` differs from production — see the disclosed
  empty-grader divergence above.)
- **`OPENROUTER_API_KEY` must be in the resolved Doppler config (`-c stg`)** for
  any live run — the learner *and the tutor* (`MENTOR_MODEL`) always call
  OpenRouter, and bootstrap treats the key as optional (it only fails at call
  time otherwise).
- **`--provider` is a GLOBAL OpenRouter host pin** — it affects *every*
  OpenRouter call this run, including the tutor and an OpenRouter grader
  candidate. Only use it when the grader is production-routed or all OpenRouter
  calls deliberately share the pinned host.
- **Language:** v1 learner answers are in plain English regardless of the
  profile's conversation language — a deliberate simplification for the
  synthetic pre-screen; language-faithful calibration comes from real-staging
  transcripts (RR-2).
- **The "production judge" for this grid is the minor-routed model, which may not
  be the adult judge.** Every challenge-sim scenario is a minor, and the router's
  under-18 gate resolves BEFORE the `capability:'judge'` branch, so the resolved
  grader is the age-appropriate approved model — under the current routing that
  can be the **same family as the tutor** (gpt-oss), not the adult judge
  (claude-sonnet). This is faithful to what minors actually get in production, but
  it means the all-minor grid does **not** exercise the adult claude judge; that
  coverage needs the adult `EvalProfile`s + scenarios tracked as **T13**. The
  two-model guard still holds (the learner is a distinct family from the grader),
  so the over-credit measurement remains valid — it is a coverage limit, not a
  guard bypass.

## Teaching-quality flow (`teaching-session`)

A multi-turn, LLM-judged flow (registered in `FLOWS`, runs under `--live`) that
answers a different question from the mastery gate: **"across a realistic
session, does the mentor teach a concept well enough that the learner can use it
afterward — without looping, losing context, or just handing over the answer?"**
The real mentor pipeline (`buildSystemPrompt` → `runHarnessLlm`) teaches up to
`MAX_MENTOR_TURNS = 8`; an **inline** simulated learner (copied from the
`misconception-repair` pattern, **not** `learner-agent.ts`) stays pinned at its
hidden `startingGap` competence the whole loop — it only advances on a concept
the mentor *explicitly taught*, never via the model's own pretraining, so a
too-capable learner cannot mask bad teaching. A final **transfer probe** (a novel
question the mentor does **not** answer) is solved by the learner "using only what
was taught", then an LLM judge returns a 4-field `TeachingVerdict`:

| Dimension | Severity if bad |
|---|---|
| Transfer / retention (unaided novel probe) | **error** if `transfer: 'no'` |
| Scaffolding / pace (matched age + gap) | warning |
| Coherence (no looping / contradiction) | warning |
| Told-not-taught (reasoned, not asserted) | warning |

`evaluateTeachingVerdict()` is exported pure and unit-tested for the severity
mapping; `assertScenarioProfilesResolve(PROFILES)` runs at import time so a
mistyped `profileId` fails loud rather than silently dropping a scenario.

> **⚠️ BAND SCOPE — `SCENARIO_BAND_LABEL`:** the 5 scenarios are
> **PRE-TEEN/TEEN-BAND PRE-SCREEN ONLY (11–17yo)** — `12yo-dinosaurs`,
> `15yo-football-gaming`, `13yo-spanish-beginner`, `17yo-french-advanced`, and
> `11yo-czech-animals` (the last gives non-English tutor-prose coverage). They say
> **nothing** about teaching quality for **under-10s** (on a parent's account) or
> **adults** — the two bands with no `EvalProfile` yet. A green run is **not**
> all-ages teaching quality. Authoring under-10 + adult scenarios is a tracked
> follow-up (plan **T13**), not silently in-scope. The label is surfaced in the
> flow snapshot header, here, and the weekly issue body so a non-coder reader
> cannot misread the gate's reach.

> **Judge temperature (M8/F3) — known limitation.** The plan calls for a pinned
> `temperature: 0` judge, but `callLlm` exposes no temperature parameter, so the
> judge runs at the harness default. The real flakiness defense is therefore the
> operational **≥5× seed-stability calibration** (a known-good control scores
> `transfer: 'yes'/'partial'` and a known-bad *not-taught* control scores
> `transfer: 'no'` on every run) gated in T12 — not a per-call temperature pin.
> Pinning the judge temperature would require threading the parameter through the
> LLM service layer (out of scope for this feature).

Like the mastery gate, this is **CI-free per-PR** beyond the Tier-1 snapshot —
the transfer probe is only ever exercised against a real model in the T12 stg
grid and the weekly cron.

## Review loop during tuning

1. Run Tier 1 baseline: `pnpm eval:llm` and commit the baseline snapshots
2. Make a prompt builder change (e.g. inject `interests`)
3. Run Tier 1 again — the diff in the snapshot files shows what changed per profile
4. Run Tier 2 on a small subset: `doppler run -- pnpm eval:llm -- --live --flow your-flow --profile 09yo-dinosaurs` — see if the LLM actually uses the new signal well
5. If good, commit both baseline and response snapshots. If not, revert and try again.

## What the harness deliberately does NOT do

- **No assertions.** This is not a test framework. Snapshots are observations, not pass/fail. Use `pnpm test` for real tests.
- **No LLM mocking in Tier 2.** If you're paying to see responses, you see the real ones.
- **No streaming support.** Flows that only produce streamed output would need adaptation.
- **No DB reads.** Builders that need DB data should have a separate accessor that returns plain data, so the eval harness can feed fixture data directly.
