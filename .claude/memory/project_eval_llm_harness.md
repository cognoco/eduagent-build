---
name: Eval-LLM harness — apps/api/eval-llm
description: 23 flows registered — the FLOWS array in apps/api/eval-llm/index.ts is the authoritative list. Fixture-driven snapshot harness for every LLM prompt builder.
type: project
---

## What it is

`apps/api/eval-llm/` — a tool that runs a fixed matrix of synthetic learner profiles through every registered LLM prompt builder and writes markdown snapshots. Lets prompt tuning be diff-reviewed in PRs instead of vibes-tested. **23 flows registered** (verified 2026-06-11) — the `FLOWS` array in `apps/api/eval-llm/index.ts` is the authoritative list; don't trust counts written elsewhere.

## How to run

```bash
pnpm eval:llm                              # tier 1 (prompts only, no LLM calls)
pnpm eval:llm -- --list                    # list flows and profiles
pnpm eval:llm -- --flow quiz-capitals       # one flow across all profiles
pnpm eval:llm -- --profile 12yo-dinosaurs   # one profile across all flows
pnpm eval:llm -- --flow X --profile Y       # single pair
doppler run -- pnpm eval:llm -- --live      # tier 2 (real LLM calls, costs credits)
```

Snapshots land in `apps/api/eval-llm/snapshots/<flow-id>/<profile-id>.md`.

## Snapshot-trigger trap

`apps/api/src/services/app-help-map.ts` contributes APP HELP wording used by the `exchanges` eval flow. Treat user-visible wording changes there like prompt changes: run `pnpm eval:llm` and stage the resulting `apps/api/eval-llm/snapshots/**` updates, even though the file is not named `*-prompts.ts`.

## Layout, flow anatomy, adding a flow

See `apps/api/eval-llm/README.md` — usage, directory layout, `FlowDefinition` anatomy, and how to add/register a flow.

## Fixture profiles (all 11-17 per product constraint)

`11yo-czech-animals`, `12yo-dinosaurs`, `13yo-spanish-beginner`, `15yo-football-gaming`, `17yo-french-advanced`. Each carries `conversationLanguage`, `interests: Array<{label, context: 'free_time'|'school'|'both'}>`, optional `pronouns`, struggles, strengths, recentQuizAnswers, learningMode, preferredExplanations.
