# Project Overview

## Purpose
- Walking-skeleton Nx monorepo proving the end-to-end infrastructure before feature work, per `docs/P1-plan.md` and `.ruler/AGENTS.md`.
- Validates the health check flow spanning web → API client → Express server → Prisma → Supabase.

## Architecture Snapshot
- Applications: `apps/web` (Next.js 15.2 + React 19 + Tailwind), `apps/server` (Express REST+OpenAPI), `apps/web-e2e` (Playwright suite). Source: `README.md`, `docs/P1-plan.md`.
- Shared packages: `packages/database` (Prisma client + migrations), `packages/schemas` (Zod schemas/types), `packages/api-client` (OpenAPI-generated client), `packages/supabase-client` (Supabase browser/server factories). Dependency rule: apps → api-client → schemas and apps/server → database → schemas → supabase-client (`README.md`).
- Governance: follow Cogno (`docs/memories/README.md`) to keep patterns aligned with canonical docs (`docs/index.md`).

## Tooling & Quality Gates
- Toolchain: Nx 21.6.5, pnpm 10.19.0 (`package.json`), TypeScript 5.9 strict, ESLint 9 flat config, Prettier (`docs/tech-stack.md`).
- Testing: Jest 30 (unit/integration) with co-located `src/**.(spec|test).tsx?` files; Playwright 1.56 for `apps/web-e2e` (`docs/memories/testing-reference/core`, `adopted-patterns` Pattern 1).
- CI: GitHub Actions runs `pnpm exec nx run-many -t lint test build typecheck e2e`, using Nx Cloud caching and CodeRabbit reviews (`README.md`, `AGENTS.md`).

## Current Phase
- Phase 1 Stage 5 complete (walking skeleton) with Stage 6 (E2E expansion + docs) next, per `docs/P1-plan.md` and README status badges.
