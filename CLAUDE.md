<!--
  This file is generated from AGENTS.md by scripts/sync-agent-docs.mjs.
  Edit AGENTS.md, then run `pnpm sync-agent-docs` (or rely on the
  pre-commit hook). Direct edits to this file will be overwritten.
-->

# CLAUDE

## Snapshot

- Mobile: ~88 screens, 311 test suites, ~3446 tests
- API: 43 route groups, 329 test suites, ~5118 tests, 53 Inngest functions
- Cross-package integration tests: 44 suites in `tests/integration/`, ~290 cases
- Monorepo: `apps/api`, `apps/mobile`, shared packages in `packages/`
- Core docs: `docs/project_context.md`, `docs/architecture.md`, relevant spec/plan under `docs/plans/` or `docs/specs/`

Test-case totals are a heuristic grep of `it(` / `test(` line starts; jest-reported totals may be slightly higher due to `it.each(...)` expansion at runtime. Re-verify with `git ls-files | grep '\.test\.'` for suite counts.

## Initialization

1. Read this file before editing.
2. Start with the relevant plan/spec if one exists for the task.
3. Use `docs/project_context.md` for repo-specific implementation rules.
4. Use `docs/architecture.md` when the change touches routing, data access, background jobs, or deployment.
5. For substantial repo work, durable decisions, repeated feedback, or any request involving "memory", load the project-memory skill from `.agents/skills/project-memory/SKILL.md` and follow its workflow. Memory lives in `.claude/memory/MEMORY.md` plus topic files.

Memory is context, not law. If memory conflicts with this file, current docs, code, or explicit user instructions, follow the higher-priority source and update/archive the stale memory when appropriate.

## Repo Skills

All agent-scoped skills live in `.agents/skills/<skill-name>/SKILL.md`. Load the relevant skill before acting on that topic. Skills are plain markdown — any agent that can read files can follow them.

Key skills:

| Skill | When to load | File |
|-------|-------------|------|
| commit | User asks to commit, save changes, or push | `.agents/skills/commit/SKILL.md` |
| project-memory | Substantial repo work, user says "remember" or "add to memory" | `.agents/skills/project-memory/SKILL.md` |
| worktree-setup | Starting isolated work (parallel agents, autonomous WI execution, risky changes) | `.agents/skills/worktree-setup/SKILL.md` |
| build | EAS build checks, triggers, or status for mobile app | `.agents/skills/build/SKILL.md` |
| e2e | Mobile Maestro smoke runs | `.agents/skills/e2e/SKILL.md` |
| maestro-testing | Writing or debugging Maestro flows | `.agents/skills/maestro-testing/SKILL.md` |
| deep-bugfixing | Adversarial runtime-assumption reviews | `.agents/skills/deep-bugfixing/SKILL.md` |
| learning-evolution-next | Learning-product evolution audit | `.agents/skills/learning-evolution-next/SKILL.md` |
| notion | EduAgent/MentoMate Notion work items | `.agents/skills/notion/SKILL.md` |
| receiving-code-review | Receiving review feedback (human or automated) | `.agents/skills/receiving-code-review/SKILL.md` |
| test-driven-development | Implementing any feature or bugfix, before writing code | `.agents/skills/test-driven-development/SKILL.md` |
| systematic-debugging | Any bug, test failure, or unexpected behavior | `.agents/skills/systematic-debugging/SKILL.md` |
| verification-before-completion | About to claim work is done, fixed, or passing | `.agents/skills/verification-before-completion/SKILL.md` |

## Git Commits

Always load the commit skill from `.agents/skills/commit/SKILL.md` before committing. It is the single source of truth for staging, message format, hook handling, and push behavior. Never use ad-hoc commit flows, `--no-verify`, or broad staging without first checking scope.

Subagents may run `/commit` only from within an isolated worktree they own (see Worktree Placement below). When operating in the coordinator's working tree (no worktree isolation), subagents must NOT run `git add`/`git commit`/`git push` — the coordinator handles all git operations there.

## Worktree Placement

All isolated worktrees go under `.worktrees/<branch-name>/` at the repo root. The path is gitignored.

- For Cosmo work items: use the WI ID as the branch name (e.g. `WI-78`).
- For other work: a short kebab-case slug derived from intent.

Always load the worktree-setup skill (`.agents/skills/worktree-setup/SKILL.md`) before creating a worktree — it handles placement, branch creation, `pnpm install`, and `pnpm env:sync`. Do not use Claude Code's `EnterWorktree` tool or `superpowers:using-git-worktrees` for this repo; both place the worktree in the wrong location.

Creating a worktree via this skill is NOT a "branch switch" — it creates a new branch in a separate directory while leaving your current CWD's branch untouched. This is allowed and is the standard pattern for parallel/isolated work.

## Skill Overrides

This repo overrides specific upstream skills. Use the repo version, not the upstream version. Adding a new override = adding a row.

| Upstream | Use instead | Why |
|----------|-------------|-----|
| `superpowers:using-git-worktrees` | `.agents/skills/worktree-setup/SKILL.md` | Canonical placement at `.worktrees/`; adds `pnpm install` + `pnpm env:sync` |
| `EnterWorktree` (Claude Code built-in) | `.agents/skills/worktree-setup/SKILL.md` | Same reason; built-in default `.claude/worktrees/` is wrong for this repo |
| `superpowers:finishing-a-development-branch` | `.agents/skills/commit/SKILL.md` (commit + push); manual PR creation via `gh pr create` | This repo has an opinionated PR/push flow via the commit skill; the superpowers menu would create competing guidance |
| `superpowers:writing-plans` | Native plan mode + the Planning Discipline section below | The superpowers skill's rigid TDD-step template fits greenfield feature work; this repo's plans are a mix of feature work, migrations, audits, and refactors |

## Skill Authoring

When writing or editing skills:

- The `description:` frontmatter field describes ONLY *when* to use, not what the skill does. Start with "Use when …" and list specific triggering conditions and symptoms.
- A description that summarizes workflow creates a shortcut agents take instead of reading the skill body. Trigger-only descriptions force agents to load the full skill before acting.

## Cross-runtime File Sync

Two derived files/directories are generated, not edited directly:

- `CLAUDE.md` is generated from `AGENTS.md` by `scripts/sync-agent-docs.mjs`. Edit `AGENTS.md`, then run `pnpm sync-agent-docs` (or rely on the pre-commit hook). Direct edits to `CLAUDE.md` will be overwritten.
- `.claude/skills/<name>/` is generated from `.agents/skills/<name>/` by `scripts/sync-skills.mjs`. Edit the master in `.agents/skills/`, then run `pnpm sync-skills` (or rely on the pre-commit hook). Direct edits to `.claude/skills/` will be overwritten on next sync.

The pre-commit hook runs `--check` on both. If drift is detected, the commit is blocked with an error pointing at the sync command.

When a rule applies to one runtime only, label it in-band inside the master document (e.g. "**For Claude Code only:** …"). Do NOT introduce per-platform sections that exist in CLAUDE.md but not AGENTS.md — the sync check enforces byte-equality apart from the H1 title and the generated-file header.

## Non-Negotiable Engineering Rules

- `@eduagent/schemas` is the shared contract. Do not redefine API-facing types locally.
- Business logic belongs in `services/`, not in route handlers. Route/service boundaries are lint-enforced (eslint G1 and G5 in `eslint.config.mjs`).
- Reads must use `createScopedRepository(profileId)` when the query operates on a single scoped table. For queries that join through a parent chain, use direct `db.select()` and enforce `profileId` through the closest owning ancestor in the WHERE clause. Existing examples: `services/session/session-topic.ts`, `session-book.ts`, `session-subject.ts`.
- Writes must include explicit `profileId` protection or verify ownership through the parent chain before updating child records.
- Shared mobile components stay persona-unaware. Use semantic tokens and CSS variables, not persona checks or hardcoded hex colors.
- Durable async work goes through Inngest. Do not fire-and-forget background work from route handlers.
- LLM calls go through `services/llm/router.ts` or its barrel, not direct provider SDK calls.
- LLM responses that drive state-machine decisions must use the structured response envelope (`llmResponseEnvelopeSchema` from `@eduagent/schemas`). Parse with `parseEnvelope()` from `services/llm/envelope.ts`. Never embed marker tokens or JSON blobs in free-text replies. Every envelope signal must have a server-side hard cap. See `docs/architecture.md` -> "LLM Response Envelope".
- When changing LLM prompts (`apps/api/src/services/**/*-prompts.ts` or `apps/api/src/services/llm/*.ts`), run `pnpm eval:llm` to snapshot before/after, and `pnpm eval:llm --live` when validating real LLM responses against `expectedResponseSchema`. The pre-commit hook only checks that snapshot files are staged; it does not run the harness.

## Known Exceptions

These deviations exist so reviewers do not try to fix them in unrelated PRs.

- `apps/mobile/tsconfig.json` declares `references[]: [{ "path": "../api" }]` so `import type { AppType } from '@eduagent/api'` resolves for the Hono RPC client. Type-only imports from `@eduagent/api` are accepted; runtime imports remain forbidden.

## Schema And Deploy Safety

- Dev schema iteration can use `drizzle-kit push`.
- Staging and production must use committed migration SQL plus `drizzle-kit migrate`.
- Never run `drizzle-kit push` against staging or production.
- A worker deploy does not migrate Neon. Apply the target migration before shipping code that reads new columns.
- Keep staging and production database credentials separate in CI. Never let staging deploys point at production data.
- Any migration that drops columns, tables, or types must include a `## Rollback` section in the plan specifying whether rollback is possible, what data is lost, and the recovery procedure. If rollback is impossible, say so explicitly.

## Required Validation

Unit tests, lint, typecheck, and formatting are enforced by pre-commit hooks (`lint-staged`, `tsc --build`, `scripts/pre-commit-tests.sh`). Verify locally while iterating, and focus on what hooks do not cover:

- Run integration tests when changing DB behavior, auth/profile scoping, Inngest flows, or cross-package contracts. The pre-commit hook intentionally skips `.integration.test.` files.
- Do not call work complete if related tests, lint, typecheck, required migrations, or required eval snapshots are still failing.
- No suppression, no shortcuts. Never use `eslint-disable` or suppress warnings to make lint pass. Fix the code or improve the lint rule.

## Repo-Specific Guardrails

- Default exports are only for Expo Router page components.
- Tests are co-located with source files. Do not create `__tests__/` folders.
- Package imports go through the package barrel, enforced by `@nx/enforce-module-boundaries`.
- SecureStore keys must use Expo-safe characters only: letters, numbers, `.`, `-`, `_`.
- In API code, use the typed config object instead of raw `process.env` reads.
- Cross-tab / cross-stack `router.push` calls must push the full ancestor chain, not just the leaf.
- Any new nested Expo Router layout that contains both an `index` screen and a deeper dynamic child must export `unstable_settings = { initialRouteName: 'index' }` as a safety net for cross-stack deep pushes.

## UX Resilience Rules

- Classify errors at the API client boundary, not per-screen. Screens must never parse HTTP status codes.
- Define and use a shared typed error hierarchy in the schema package.
- Primary error fallback action retries or fixes the specific problem; secondary action goes back, home, or signs out. Prefer reusable `ErrorFallback` and `TimeoutLoader`.
- Every feature spec/story must include a Failure Modes table with: State, Trigger, User sees, Recovery.
- For every event handler, cron function, or background job, verify something actually dispatches the event or schedules the cron in production code.

## Fix Development Rules

Changed code is not fixed code. Every fix must be verified.

- Security fixes tagged CRITICAL or HIGH require a negative-path break test that attempts the exact attack being prevented.
- Silent recovery without escalation is banned in billing, auth, and webhook code. Emit a structured metric or Inngest event; `console.warn` alone is not enough.
- When fixing a drift that has 3+ sibling locations, either install a forward-only guard test and sweep all current sites in the same PR, or document a deferred sweep with tracked ID, owner, and target date.
- Commit-specific rules such as finding IDs, Verified-By tables, and sweep-audit blocks live in the commit skill (`.agents/skills/commit/SKILL.md`).

## Code Quality Guards

- No internal mocks in integration tests. Mock only true external boundaries such as Stripe, Clerk JWKS, email providers, push notification services, and LLM providers.
- No new internal relative-path `jest.mock()` in tests unless genuinely required; use `jest.requireActual()` with targeted overrides. If unavoidable, append `// gc1-allow: <reason>` on the same line.
- Response bodies are single-use. Never call both `.json()` and `.text()` on the same `fetch` Response.
- Classify raw errors before formatting. Never string-match on `formatApiError` output.
- When removing a feature, grep the entire project for all references: types, imports, constants, SecureStore keys, commented-out JSX, and fallback branches.
- Verify JSX handler references exist after adding any `Pressable` or `Button`.

## Planning Discipline

When writing implementation plans (via Claude Code plan mode, written specs, or otherwise):

- No placeholders ("TBD", "implement later", "add validation"). If a step says what to do, include how.
- Show actual code/commands for steps that need them. A step that changes code must show the code.
- Check type and name consistency across tasks. A function called `clearLayers` in Task 3 must still be `clearLayers` in Task 7.
- Use TDD step decomposition for greenfield logic; use design-doc + acceptance criteria for migrations, audits, refactors.

## Secrets Management

All secrets are managed through Doppler. Assume the `doppler` CLI is installed and on PATH. Never suggest `wrangler secret put`, direct Cloudflare dashboard entry, AWS console, or platform-specific secret management. When secrets need to be set, say "add to Doppler."

## PR Review & CI Protocol

Before declaring a PR ready to merge:

1. Read the actual PR diff: `gh pr diff <number>`.
2. Check all CI checks: `gh pr checks <number>`.
3. Read automated review findings with `gh api repos/{owner}/{repo}/pulls/<number>/reviews` and `gh api repos/{owner}/{repo}/pulls/<number>/comments`.
4. Never dismiss review failures as OK to merge.

When rebasing PRs:

- After rebase, always verify the PR diff.
- Check for duplicate functions/tests, missing imports, and schema export gaps.
- Run type checking before pushing.

## On Compaction

When conversation context is compacted, preserve at minimum:

- Full list of files modified in this session.
- Names and reproductions of failing tests, lint errors, or typecheck errors not yet resolved.
- Active plan/task list, current step, next step, and anything blocked.
- Current branch name and which base branch it tracks.
- Decisions made in conversation that are not reflected in the diff yet.

## Handy Commands

```bash
# Workspace
pnpm exec nx run-many -t lint
pnpm exec nx run-many -t test
pnpm exec nx run-many -t typecheck

# API
pnpm exec nx run api:lint
pnpm exec nx run api:typecheck
pnpm exec nx run api:test

# Mobile
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec jest --findRelatedTests src/path/to/file.tsx --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit

# Database
pnpm run db:push:dev
pnpm run db:generate:dev
pnpm run db:migrate:dev
pnpm run db:studio:dev

# LLM Eval Harness
pnpm eval:llm
pnpm eval:llm --live

# Playwright E2E (web)
# IMPORTANT: Must use Doppler with -c stg to match .dev.vars (which is generated from stg config).
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web:smoke
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web
```

Last updated: 2026-05-24
