# CLAUDE

## Snapshot

- Mobile: 38+ screens (85 test suites),
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

## Repo-Specific Guardrails

- Default exports are only for Expo Router page components.
- Tests are co-located with source files. Do not create `__tests__/` folders.
- Package imports go through the package barrel (`@eduagent/schemas`, `@eduagent/database`, etc.).
- SecureStore keys must use Expo-safe characters only: letters, numbers, `.`, `-`, `_`.
- In API code, use the typed config object instead of raw `process.env` reads.

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
```

Last updated: 2026-04-04
