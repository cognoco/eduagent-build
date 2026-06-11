---
name: Deploy pipeline — drizzle-kit migrate (not push) for production
description: deploy.yml changed 2026-04-04 to use drizzle-kit migrate instead of push --force. Committed SQL migrations for prod. Push only for dev.
type: project
---

**Change (2026-04-04):** `deploy.yml` "Sync database schema" step changed from `npx drizzle-kit push --force` to `npx drizzle-kit migrate`.

**Why:** `drizzle-kit push --force` bypasses interactive confirmation and can silently drop columns/tables to align the live DB with schema. This violates the architecture rule: "drizzle-kit push for dev, drizzle-kit generate + committed SQL for prod." The `--force` flag made it even more dangerous — no prompts at all. Also, the DEPLOY_ENV variable was computed but never used to select different DB URLs, so staging and production used the same DATABASE_URL secret.

**How to apply:**
- Production/staging deploys now run committed SQL migrations via `drizzle-kit migrate`
- Dev environments still use `drizzle-kit push` (the `db:push` script in packages/database)
- CI quality gate (ci.yml) still uses `db:push` for test postgres — this is correct (disposable DB)
- When adding schema changes: `pnpm run db:generate` to create migration SQL, commit it
