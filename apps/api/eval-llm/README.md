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

## Usage

```bash
# list all registered flows and profiles
pnpm eval:llm -- --list

# run all tier-1 snapshots (no LLM calls)
pnpm eval:llm

# run only one flow
pnpm eval:llm -- --flow quiz-capitals

# run only one profile across all flows
pnpm eval:llm -- --profile 09yo-dinosaurs

# combine: single flow × single profile
pnpm eval:llm -- --flow dictation-generate --profile 06yo-fairytales

# tier 2 — real LLM calls (requires Doppler for API keys)
doppler run -- pnpm eval:llm -- --live
```

Snapshots land in `apps/api/eval-llm/snapshots/<flow-id>/<profile-id>.md`.

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
