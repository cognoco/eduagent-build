---
name: Eval-LLM harness — apps/api/eval-llm
description: All 9 flows wired. Fixture-driven snapshot harness for every LLM prompt builder.
type: project
---

## What it is

`apps/api/eval-llm/` — a tool that runs a fixed matrix of synthetic learner profiles through every registered LLM prompt builder and writes markdown snapshots. Lets prompt tuning be diff-reviewed in PRs instead of vibes-tested.

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

## Directory layout

```
apps/api/eval-llm/
├── README.md                              # usage + how to add flows
├── index.ts                               # entry point; FLOWS registry
├── fixtures/profiles.ts                   # 5 synthetic learners (ages 11-17)
├── runner/
│   ├── types.ts                           # FlowDefinition, PromptMessages, ResponseValidator
│   ├── runner.ts                          # CLI + orchestration + schema validation
│   └── snapshot.ts                        # markdown writer
├── flows/
│   ├── quiz-capitals.ts, quiz-vocabulary.ts, quiz-guess-who.ts
│   ├── dictation-generate.ts, dictation-review.ts, dictation-prepare-homework.ts
│   ├── session-analysis.ts
│   └── filing-pre-session.ts
└── snapshots/                             # committed markdown
```

## Fixture profiles (all 11-17 per product constraint)

`11yo-czech-animals`, `12yo-dinosaurs`, `13yo-spanish-beginner`, `15yo-football-gaming`, `17yo-french-advanced`. Each carries `conversationLanguage`, `interests: Array<{label, context: 'free_time'|'school'|'both'}>`, optional `pronouns`, struggles, strengths, recentQuizAnswers, learningMode, preferredExplanations.

## Adding a flow

1. Ensure the prompt builder is exported (pure function, input → string). Past session exported these: `buildGeneratePrompt`, `SESSION_ANALYSIS_PROMPT`, `buildPreSessionPrompt`, `buildPostSessionPrompt`, `SYSTEM_PROMPT` (prepare-homework + review).
2. Create `apps/api/eval-llm/flows/<flow-id>.ts` exporting a `FlowDefinition`:
   ```ts
   export const myFlow: FlowDefinition<Input> = {
     id: 'my-flow',
     name: 'Human Name',
     sourceFile: 'path/to/builder.ts:functionName',
     buildPromptInput(profile) { return {...}; },  // null to skip profile
     buildPrompt(input) { return { system: buildMyPrompt(input), user: '...' }; },
     expectedResponseSchema?: zodSchema,  // optional, for --live validation
     runLive?: async (input, messages) => { /* real LLM call */ },
   };
   ```
3. Register in `apps/api/eval-llm/index.ts` `FLOWS` array.
4. Run `pnpm eval:llm -- --flow <id>`. Commit the generated snapshot files.

## What's wired (2026-04-19)

**All 9 LLM flows wired:** quiz-capitals, quiz-vocabulary, quiz-guess-who, dictation-generate, dictation-review, dictation-prepare-homework, session-analysis, filing-pre-session, exchanges (added 002f5bad).

**Also available:** `filing-post-session` (trivial copy of filing-pre-session, wired as needed).

## Response-shape validation (added in commit 3b32b0a1)

`FlowDefinition.expectedResponseSchema?: ResponseValidator` — any object with `.safeParse(value)`. When Tier 2 `--live` runs, the response is parsed as JSON and validated against the schema. Violations render as a `## ⚠️ Schema violation` block in the snapshot. Use this when migrating flows to the response envelope so the new contract is enforced in the harness.

## Costs

- **Tier 1** is free, instant, deterministic. Can run on every push in CI.
- **Tier 2 `--live`** burns real provider credits (Gemini/OpenAI/Anthropic per router config). Requires Doppler for API keys. Run manually during tuning sessions, not in CI.

## Architectural note — why this earns its keep

Every snapshot has a **Profile summary** table (rich: 13 fields) and a **Builder input** JSON block (narrow: whatever the builder accepts). The gap between the two is the personalization gap — visible at a glance, no audit cross-reference needed. Every builder's notes section explicitly calls out what's not being passed, with references to audit P0/P1 findings.
