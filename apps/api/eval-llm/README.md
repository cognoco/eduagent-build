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
