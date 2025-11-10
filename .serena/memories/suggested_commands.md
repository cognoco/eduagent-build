# Suggested Commands

## Setup & Maintenance
- `pnpm install` – install workspace dependencies (README quick start).
- `pnpm run validate:env` – ensure required environment variables are present (`package.json`).
- `pnpm run validate:governance` and `pnpm run validate:research` – run policy-as-code gates before major changes (`package.json`, AGENTS).

## Development Servers
- `pnpm run dev` – run web and server targets in parallel (`package.json`).
- `pnpm exec nx run web:dev` – start the Next.js dev server.
- `pnpm exec nx run server:serve` – start the Express API.

## Quality Gates
- `pnpm exec nx run-many -t lint` – lint all affected projects (README, AGENTS).
- `pnpm exec nx run-many -t test` – run all unit/integration suites (README).
- `pnpm exec nx run-many -t build` – build all projects to validate compilation.
- `pnpm exec nx run-many -t e2e` – run Playwright suites in `apps/web-e2e`.
- `pnpm run format:check` / `pnpm run format:write` – Prettier formatting check or write.
- `pnpm exec nx affected -t lint test build --base=<sha>` – scoped CI-equivalent preflight (AGENTS).

## Targeted Nx Operations
- `pnpm exec nx run <project>:<target>` – invoke a single Nx target (e.g. `web:test`).
- `pnpm exec nx graph` – visualize dependency graph and confirm clean edges (README).
- `pnpm exec nx show project <name>` – inspect project configuration.

## Database & Prisma
- `pnpm run db:push:dev` / `pnpm run db:migrate:dev` – apply schema changes against Supabase dev instance.
- `pnpm run db:migrate:deploy:dev` – deploy migrations (package scripts).
- `pnpm run db:studio:dev` – open Prisma Studio for the dev database.
- `pnpm run db:generate` – regenerate Prisma client (packages/database setup).

## Serena Operations
- `uvx --from git+https://github.com/oraios/serena serena project generate-yml --language typescript` – regenerate `.serena/project.yml` when languages change (Serena docs).
- `uvx --from git+https://github.com/oraios/serena serena project index` – refresh the cached symbol index after large refactors.

## Everyday Utilities (Linux)
- `git status`, `git diff`, `git restore` – inspect and manage changes (standard tooling).
- `ls`, `cd`, `pwd`, `find`, `grep -R "pattern"` – filesystem and search helpers for `/home/jojorgen/Projects/nx-monorepo`.
