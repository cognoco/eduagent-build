# CLAUDE

## Snapshot

- Mobile: 38+ screens (117 test suites), 1,228 mobile tests
- API: All 33 route groups, 2,136 API tests, 19 integration test suites, 16 Inngest functions
- Monorepo: `apps/api`, `apps/mobile`, shared packages in `packages/`
- Core docs: `docs/project_context.md`, `docs/architecture.md`, relevant spec/plan under `docs/plans/` or `docs/specs/`

## Read This Before Editing

1. Start with the relevant plan/spec if one exists for the task.
2. Use `docs/project_context.md` for repo-specific implementation rules.
3. Use `docs/architecture.md` when the change touches routing, data access, background jobs, or deployment.

## Non-Negotiable Engineering Rules

- `@eduagent/schemas` is the shared contract. Do not redefine API-facing types locally.
- Hono route files keep handlers inline for RPC inference, but business logic belongs in `services/`.
- Route files must not import ORM primitives, schema tables, or `createScopedRepository`.
- Reads must use `createScopedRepository(profileId)`.
- Writes must include explicit `profileId` protection or verify ownership through the parent chain before updating child records.
- Shared mobile components stay persona-unaware. Use semantic tokens and CSS variables, not persona checks or hardcoded hex colors.
- Durable async work goes through Inngest. Do not fire-and-forget background work from route handlers.
- LLM calls go through `services/llm/router.ts` (or its barrel), not direct provider SDK calls.
- LLM responses that drive state-machine decisions (close interview, hold escalation, trigger UI widget) must use the structured response envelope (`llmResponseEnvelopeSchema` from `@eduagent/schemas`). Parse with `parseEnvelope()` from `services/llm/envelope.ts`. Never embed `[MARKER]` tokens or JSON blobs in free-text replies. Every envelope signal must have a server-side hard cap (e.g., `MAX_INTERVIEW_EXCHANGES = 6`) so the flow terminates even if the LLM never emits the signal. See `docs/architecture.md` → "LLM Response Envelope" for the full contract.
- When changing LLM prompts, run the eval harness (`pnpm eval:llm`) to snapshot before/after across the 5 fixture profiles. Use `pnpm eval:llm --live` (Tier 2) to validate real LLM responses against `expectedResponseSchema` when set. Harness code: `apps/api/eval-llm/`.
- Subagents (agents spawned via the Agent tool) must NEVER run `git add`, `git commit`, or `git push`. Only the coordinator (main conversation) commits. Subagents write code, run tests, and report which files they changed — the coordinator commits their work sequentially using `/commit`.

## Schema And Deploy Safety

- Dev schema iteration can use `drizzle-kit push`.
- Staging and production must use committed migration SQL plus `drizzle-kit migrate`.
- Never run `drizzle-kit push` against staging or production.
- A worker deploy does not migrate Neon. Apply the target migration before shipping code that reads new columns.
- Keep staging and production database credentials separate in CI. Never let staging deploys point at production data.

## Required Validation

Run the smallest useful verification first, then the project-level checks for the touched area.

- Targeted tests: `pnpm exec jest --findRelatedTests <changed-files> --no-coverage`
- API lint/typecheck: `pnpm exec nx run api:lint` and `pnpm exec nx run api:typecheck`
- Mobile lint/typecheck: `pnpm exec nx lint mobile` and `cd apps/mobile && pnpm exec tsc --noEmit`
- Run integration tests when changing DB behavior, auth/profile scoping, Inngest flows, or cross-package contracts.

Do not call work complete if related tests, lint, typecheck, or required migrations are still failing.
- Follow the Fix Verification Rules in `~/.claude/CLAUDE.md` — every fix needs a verified-by entry, finding ID in commits, and break tests for security fixes.
- No suppression, no shortcuts — always address the root of the error. Never use `eslint-disable` or suppress warnings to make lint pass. Fix the actual code or improve the lint rule to handle the pattern correctly.

## Repo-Specific Guardrails

- Default exports are only for Expo Router page components.
- Tests are co-located with source files. Do not create `__tests__/` folders.
- Package imports go through the package barrel (`@eduagent/schemas`, `@eduagent/database`, etc.).
- SecureStore keys must use Expo-safe characters only: letters, numbers, `.`, `-`, `_`.
- In API code, use the typed config object instead of raw `process.env` reads.
- lint-staged uses `node --stack-size=65536` to work around Windows stack overflow in eslint AST traversal (see `project_nx_expo_plugin_bug.md`).
- Cross-tab / cross-stack `router.push` calls must push the full ancestor chain, not just the leaf. A direct push to `shelf/[subjectId]/book/[bookId]` from another tab synthesizes a 1-deep stack containing only the leaf, so `router.back()` falls through to the Tabs first-route (Home). Either push the parent first then the child, or rely on `unstable_settings.initialRouteName` in the nested layout — but the rule of thumb is to push the chain. `unstable_settings` only seeds one level, so it does not protect future deeper paths (e.g. `shelf/[subjectId]/book/[bookId]/chapter/[chapterId]`).
- Any new nested Expo Router layout that contains both an `index` screen and a deeper dynamic child must export `unstable_settings = { initialRouteName: 'index' }` as a safety net for cross-stack deep pushes.

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
pnpm run db:push:stg
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

Last updated: 2026-04-22
