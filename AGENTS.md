# Codex

## Snapshot

- Mobile: ~80 screens, 239 test suites, ~2,446 tests
- API: 43 route groups, 187 test suites, ~3,718 tests, 45 Inngest functions
- Cross-package integration tests: 43 suites in `tests/integration/`, ~290 cases
- Monorepo: `apps/api`, `apps/mobile`, shared packages in `packages/`
- Core docs: `docs/project_context.md`, `docs/architecture.md`, relevant spec/plan under `docs/plans/` or `docs/specs/`

> Counts verified 2026-05-11 (synced with CLAUDE.md). Test-case totals are a heuristic grep of `it(` / `test(` line starts; jest-reported totals may be slightly higher due to `it.each(...)` expansion at runtime. Re-verify with `git ls-files | grep '\.test\.'` for suite counts.

## Codex Initialization

1. Read this file before editing.
2. Start with the relevant plan/spec if one exists for the task.
3. Use `docs/project_context.md` for repo-specific implementation rules.
4. Use `docs/architecture.md` when the change touches routing, data access, background jobs, or deployment.
5. For substantial repo work, durable decisions, repeated feedback, or any request involving "memory", use `$project-memory` and read `.claude/memory/MEMORY.md` plus only the relevant linked memory files.

Memory is context, not law. If memory conflicts with this file, current docs, code, or explicit user instructions, follow the higher-priority source and update/archive the stale memory when appropriate.

## Codex Native Support

- Repo-scoped Codex skills live in `.agents/skills/<skill-name>/SKILL.md`.
- Use `$commit` for commits in Codex. This is the Codex-native equivalent of Claude's `/commit` workflow.
- Use `$project-memory` to read, create, update, or archive project memory.
- Use `$build` for safe EAS build checks/triggers, `$e2e` for mobile Maestro smoke runs, and `$maestro-testing` when writing or debugging Maestro flows.
- Use `$deep-bugfixing` for adversarial runtime-assumption reviews, `$audit-status` for `docs/audit/cleanup-plan.md`, `$learning-evolution-next` for the learning-product evolution audit, and `$notion` before touching EduAgent/MentoMate Notion work items.
- `.codex/prompts/` contains BMAD-generated prompt stubs, but it is not the reliable Codex-native slash-command mechanism in this setup. Do not add new repo workflows there unless Codex prompt discovery is re-verified.
- Do not symlink Claude commands into Codex. Port useful workflows into `.agents/skills/` instead.

## Git Commits

Always use `$commit` for all commits in Codex. Never use ad-hoc commit flows, `--no-verify`, or broad staging without first checking scope. `$commit` is the single source of truth for staging, message format, hook handling, and push behavior.

Subagents must never run `git add`, `git commit`, or `git push`, except when a structured workflow explicitly prescribes the git step or the user explicitly asks for a one-off commit subagent. The coordinator commits sequentially.

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
- Commit-specific rules such as finding IDs, Verified-By tables, and sweep-audit blocks live in `$commit`.

## Code Quality Guards

- No internal mocks in integration tests. Mock only true external boundaries such as Stripe, Clerk JWKS, email providers, push notification services, and LLM providers.
- No new internal relative-path `jest.mock()` in tests unless genuinely required; use `jest.requireActual()` with targeted overrides. If unavoidable, append `// gc1-allow: <reason>` on the same line.
- Response bodies are single-use. Never call both `.json()` and `.text()` on the same `fetch` Response.
- Classify raw errors before formatting. Never string-match on `formatApiError` output.
- When removing a feature, grep the entire project for all references: types, imports, constants, SecureStore keys, commented-out JSX, and fallback branches.
- Verify JSX handler references exist after adding any `Pressable` or `Button`.

## Secrets Management

All secrets are managed through Doppler. Never suggest `wrangler secret put`, direct Cloudflare dashboard entry, AWS console, or platform-specific secret management. When secrets need to be set, say "add to Doppler."

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
pnpm run db:generate
pnpm run db:migrate:dev

# LLM Eval Harness
pnpm eval:llm
pnpm eval:llm --live

# Playwright E2E (web)
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web:smoke
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web
```

Last updated: 2026-05-12
