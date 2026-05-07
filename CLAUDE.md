# CLAUDE

## Snapshot

- Mobile: ~80 screens, 225 test suites, ~2,390 tests
- API: 42 route groups, 187 test suites, ~3,470 tests, 41 Inngest functions
- Cross-package integration tests: 42 suites in `tests/integration/`, ~290 cases
- Monorepo: `apps/api`, `apps/mobile`, shared packages in `packages/`
- Core docs: `docs/project_context.md`, `docs/architecture.md`, relevant spec/plan under `docs/plans/` or `docs/specs/`

> Counts verified 2026-05-06. Test-case totals are a heuristic grep of `it(` / `test(` line starts; jest-reported totals may be slightly higher due to `it.each(...)` expansion at runtime. Re-verify with `git ls-files | grep '\.test\.'` for suite counts.

## Read This Before Editing

1. Start with the relevant plan/spec if one exists for the task.
2. Use `docs/project_context.md` for repo-specific implementation rules.
3. Use `docs/architecture.md` when the change touches routing, data access, background jobs, or deployment.

## Git Commits

Always use `/commit` for all commits in this repo. Never use `/zdx:commit`, `/my:commit-old`, or the system prompt's built-in commit protocol. `/commit` is the single source of truth for staging, message format, hook handling, and push.

## Non-Negotiable Engineering Rules

- `@eduagent/schemas` is the shared contract. Do not redefine API-facing types locally.
- Business logic belongs in `services/`, not in route handlers. Route/service boundaries are lint-enforced (eslint G1 and G5 in `eslint.config.mjs`).
- Reads must use `createScopedRepository(profileId)` when the query operates on a single scoped table. For queries that join through a parent chain (e.g. `learning_sessions → curriculum_topics → curriculum_books → subjects`), use direct `db.select()` and enforce `profileId` via `subjects.profileId` (or the closest ancestor that owns it) in the WHERE clause. The scoped repo cannot express multi-table joins; the parent-chain pattern is the sanctioned alternative. Existing examples: `services/session/session-topic.ts`, `session-book.ts`, `session-subject.ts`.
- Writes must include explicit `profileId` protection or verify ownership through the parent chain before updating child records.
- Shared mobile components stay persona-unaware. Use semantic tokens and CSS variables, not persona checks or hardcoded hex colors.
- Durable async work goes through Inngest. Do not fire-and-forget background work from route handlers.
- LLM responses that drive state-machine decisions (close interview, hold escalation, trigger UI widget) must use the structured response envelope (`llmResponseEnvelopeSchema` from `@eduagent/schemas`). Parse with `parseEnvelope()` from `services/llm/envelope.ts`. Never embed `[MARKER]` tokens or JSON blobs in free-text replies. Every envelope signal must have a server-side hard cap (e.g., `MAX_INTERVIEW_EXCHANGES = 4`) so the flow terminates even if the LLM never emits the signal. See `docs/architecture.md` → "LLM Response Envelope" for the full contract.
- When changing LLM prompts (`apps/api/src/services/**/*-prompts.ts` or `apps/api/src/services/llm/*.ts`), run the eval harness (`pnpm eval:llm`) to snapshot before/after, and `pnpm eval:llm --live` (Tier 2) to validate real LLM responses against `expectedResponseSchema`. The pre-commit hook only checks that snapshot files are staged — it does NOT run the harness. Harness code: `apps/api/eval-llm/`.
- Subagents must never run `git add`, `git commit`, or `git push` — except (a) the `/commit` skill, which runs as an authorized `context: fork` subagent, and (b) when the commit is a step prescribed by a structured workflow. All other subagents write code, run tests, and report which files they changed. The coordinator commits their work using `/commit`.

## Known Exceptions to Engineering Rules

These deviations from the rules above exist in the codebase as of 2026-05-01. They are listed here so reviewers don't try to "fix" them in unrelated PRs and so new contributors don't take them as precedent. Each exception should either be tracked toward a refactor, or promoted into an explicit rule.

- **`apps/mobile/tsconfig.json` declares `references[]: [{ "path": "../api" }]`**, in tension with the conceptual "mobile must not depend on api" rule. This is required so `import type { AppType } from '@eduagent/api'` resolves for the Hono RPC client. **Type-only imports** from `@eduagent/api` are accepted; runtime imports remain forbidden (they would pull API server code into the mobile bundle). See `docs/architecture.md` → "AppType" example for the rationale.

## Schema And Deploy Safety

- Dev schema iteration can use `drizzle-kit push`.
- Staging and production must use committed migration SQL plus `drizzle-kit migrate`.
- Never run `drizzle-kit push` against staging or production.
- A worker deploy does not migrate Neon. Apply the target migration before shipping code that reads new columns.
- Keep staging and production database credentials separate in CI. Never let staging deploys point at production data.
- Any migration that drops columns, tables, or types must include a `## Rollback` section in the plan specifying: (a) whether rollback is possible, (b) what data is lost, (c) what the recovery procedure is. If rollback is impossible, say so explicitly — "rollback is not possible, data is permanently destroyed."

## Required Validation

Unit tests, lint, typecheck, and formatting are enforced by pre-commit hooks (lint-staged, `tsc --build`, `scripts/pre-commit-tests.sh`). You don't need to re-run them manually before committing — but verify locally while iterating. Focus on what the hooks do NOT cover:

- Run integration tests when changing DB behavior, auth/profile scoping, Inngest flows, or cross-package contracts. The pre-commit hook intentionally skips `.integration.test.` files.
- Do not call work complete if related tests, lint, typecheck, or required migrations are still failing.
- No suppression, no shortcuts — always address the root of the error. Never use `eslint-disable` or suppress warnings to make lint pass. Fix the actual code or improve the lint rule to handle the pattern correctly.

## Repo-Specific Guardrails

- Default exports are only for Expo Router page components.
- Tests are co-located with source files. Do not create `__tests__/` folders.
- Package imports go through the package barrel — enforced by `@nx/enforce-module-boundaries`.
- SecureStore keys must use Expo-safe characters only: letters, numbers, `.`, `-`, `_`.
- In API code, use the typed config object instead of raw `process.env` reads (eslint G4 enforces this; the violation message points back here).
- Cross-tab / cross-stack `router.push` calls must push the full ancestor chain, not just the leaf. A direct push to `shelf/[subjectId]/book/[bookId]` from another tab synthesizes a 1-deep stack containing only the leaf, so `router.back()` falls through to the Tabs first-route (Home). Either push the parent first then the child, or rely on `unstable_settings.initialRouteName` in the nested layout — but the rule of thumb is to push the chain. `unstable_settings` only seeds one level, so it does not protect future deeper paths (e.g. `shelf/[subjectId]/book/[bookId]/chapter/[chapterId]`).
- Any new nested Expo Router layout that contains both an `index` screen and a deeper dynamic child must export `unstable_settings = { initialRouteName: 'index' }` as a safety net for cross-stack deep pushes.

## UX Resilience Rules

These rules prevent dead-end states where users get stuck with no actionable escape. Learned from a full-app UX audit (2026-04-05) that found 44 dead-end issues across all flows.

- **Classify errors at the API client boundary, not per-screen.** Distinguish quota exhausted, forbidden, gone, network error, etc. in middleware. Screens must never parse HTTP status codes.
- **Typed error hierarchy.** Define a shared error class hierarchy in the schema package (e.g., `QuotaExhaustedError`, `ResourceGoneError`, `ForbiddenError`). The API client middleware classifies HTTP responses into typed errors ONCE. Screens switch on error type.
- **Standard error fallback pattern.** Primary action retries / fixes the specific problem; secondary action goes back / home / signs out. Build reusable `ErrorFallback` and `TimeoutLoader` components rather than ad-hoc per-screen handling.
- **Spec failure modes before coding.** Every feature spec / story must include a Failure Modes table with columns: State, Trigger, User sees, Recovery. If the Recovery column can't be filled, the design isn't complete.
- **End-to-end feature tracing.** For every event handler, cron function, or background job, verify something actually dispatches the event or schedules the cron in production code. Wired-but-untriggered code is worse than dead code — it creates false confidence.

## Fix Development Rules

Changed code is not fixed code. Every fix must be verified, not just applied. These rules apply to all bug fixes, security patches, and review-finding resolutions.

- **Security fixes require a "break test."** Every fix tagged CRITICAL or HIGH in a security or data-integrity context must include at least one negative-path test that attempts the exact attack being prevented (unauthorized access, missing auth, invalid input). Use the red-green regression pattern (see `superpowers:verification-before-completion` → "Regression tests"): write the test, watch it pass, revert the fix, watch it fail, restore.
- **Silent recovery without escalation is banned.** Any `catch` block or fallback path in billing, auth, or webhook code that silently recovers must also emit a structured metric or Inngest event. `console.warn` alone is never sufficient — if you can't query how many times the fallback fired in the last 24 hours, the "recovery" is invisible.

- **Sweep when you fix.** When you fix a drift that has 3+ sibling locations, you have two acceptable options: (a) install a forward-only guard test that fails CI on new violations AND sweep all current sites in the same PR, or (b) document a deferred sweep with a tracked ID, owner, and target date. Never silently fix one of N — the next contributor reads the partial state as "the team's preferred way" and the inconsistency perpetuates. 

- Commit-specific rules (finding-ID references, Verified-By tables, sweep-audit blocks) live in `/commit`.

## Code Quality Guards

These rules catch bugs that survive type-checking and only surface at runtime. Learned from adversarial review (2026-04-05).

- **No internal mocks in integration tests.** Never `jest.mock` your own database, services, or middleware in integration tests. Mock only true external boundaries (Stripe, Clerk JWKS, email providers, push notification services). Internal mocks hide real bugs.
- **No new internal `jest.mock()` (GC1 ratchet).** CI fails any PR that adds a relative-path `jest.mock('./...')` or `jest.mock('../...')` line in `*.test.ts` / `*.test.tsx`. Existing legacy sites are grandfathered — this is forward-only. To stub a few named exports of an internal module, use `jest.requireActual()` with targeted overrides (canonical pattern: `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts`). External-boundary mocks (LLM via `routeAndCall`, push, email, Stripe, Clerk JWKS) use bare specifiers and are unaffected. If you genuinely need a new internal mock, append `// gc1-allow: <reason>` on the same line as the `jest.mock(` call — review will check the reason.
- **Response bodies are single-use.** Never call both `.json()` and `.text()` on the same `fetch` Response — the body stream is consumed on first read. If you need both JSON parsing with a text fallback, read `.text()` once and `JSON.parse` it manually. Applies to `assertOk`-style helpers, error-extraction middleware, and SSE error handlers.
- **Classify errors before formatting.** When code branches on error *type* (reconnectable vs. fatal, quota vs. network) and also formats errors for display, classify the **raw** error object first, then format for the user. Never string-match on the output of `formatApiError` — the formatter strips status codes, error codes, and keywords classifiers depend on.
- **Clean up all artifacts when removing a feature.** Grep the entire project for all references: types, imports, constants, SecureStore keys, commented-out JSX, fallback branches. Orphaned types create false confidence, unreachable fallback branches inflate coverage, leaked storage keys waste device storage forever.

## Secrets Management

All secrets are managed through **Doppler**. Never suggest `wrangler secret put`, direct Cloudflare dashboard entry, AWS console, or any other platform-specific secret management. When secrets need to be set, say "add to Doppler."

## PR Review & CI Protocol

**ALL agents MUST follow this protocol when working with PRs. This is non-negotiable.**

### Before Declaring a PR "Ready to Merge"

1. **Read the actual PR diff** — run `gh pr diff <number>` to see what files are actually changed relative to the base branch. Do NOT assume from commit messages alone.
2. **Check all CI checks** — run `gh pr checks <number>`. ALL checks must pass, including automated code reviews (Claude Code Review, etc.).
3. **Read automated code review findings** — if a code review check exists, fetch and triage findings:
   ```bash
   gh pr checks <number>
   gh api repos/{owner}/{repo}/pulls/<number>/reviews
   gh api repos/{owner}/{repo}/pulls/<number>/comments
   ```
   - **High (Must fix):** Security issues, data loss risks, correctness bugs — MUST be fixed before merge
   - **Medium:** Best practice violations, missing validation, config issues — SHOULD be fixed before merge
   - **Low:** Style, docs, minor improvements — can be deferred but note them
4. **NEVER dismiss review failures as "OK to merge."** Automated code review catches real bugs, security issues, and architectural violations. Treat findings with the same weight as a senior engineer's review.

### When Rebasing PRs

- After rebase, always verify the PR diff (`gh pr diff`) — merge strategies like `-X theirs` can silently drop code.
- Check for duplicate functions/tests, missing imports, and schema export gaps.
- Run type checking (`tsc --noEmit`) to catch errors before pushing.

## On Compaction

When the conversation is compacted, preserve at minimum:

- The full list of files modified in this session (paths only, no diffs).
- Names and reproductions of any failing tests, lint errors, or typecheck errors not yet resolved.
- The active plan or task list — current step, next step, and anything blocked.
- The current branch name and which base branch it tracks.
- Any decisions made in conversation that aren't reflected in the diff yet (e.g., "we agreed to defer X").

It is fine to discard: tool-call output bodies, exploratory file reads that didn't change anything, and resolved error messages.

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
pnpm eval:llm                    # Tier 1: snapshot prompts (no LLM call)
pnpm eval:llm --live             # Tier 2: real LLM call + schema validation

# Playwright E2E (web)
# IMPORTANT: Must use Doppler with -c stg to match .dev.vars (which is generated from stg config).
# Using default Doppler config (dev) causes TEST_SEED_SECRET mismatch → 403 on seed endpoint.
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web:smoke   # smoke only (~1-2 min)
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web         # full suite
# CLERK_TESTING_TOKEN is currently a placeholder — tests work without it but Clerk may rate-limit.
```

Last updated: 2026-04-30
