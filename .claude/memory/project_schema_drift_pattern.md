---
name: Schema drift from push→migrate transition
description: How dev/staging databases silently lose columns after switching from drizzle-kit push to drizzle-kit migrate, and how to diagnose and fix it
type: project
---

The dev and staging databases both had missing columns (has_premium_llm, birth_year_set_by, learning_profiles table, and others from migrations 0013–0020) despite migrations being recorded as "applied" in drizzle_migrations. Investigated 2026-04-14.

**Why:** The baseline-migrations.mjs script (runs on every deploy before drizzle-kit migrate) seeds the drizzle_migrations journal with ALL migrations from _journal.json when it detects a push→migrate transition (tables exist but no journal). It marks them as "applied" without running any SQL. If the DB was pushed BEFORE a migration was created, that migration's SQL never runs — but it's recorded as done. `drizzle-kit migrate` then skips it forever.

**How to apply:** When a dev/staging DB produces "column X does not exist" errors despite the column being in the Drizzle schema, the issue is almost always this drift pattern. The drizzle_migrations ledger is lying.

**Diagnosis:**
- Run `pnpm run db:push:dev` — it does a direct schema diff, ignoring the ledger
- If it shows ALTER TABLE / CREATE TABLE statements, those migrations were never applied
- `pnpm run db:migrate:dev` saying "success" with 0 changes is a false positive when drift exists

**Fix for dev:** `pnpm run db:push:dev` — confirm the prompted changes. Safe to run repeatedly. Then `pnpm run db:generate:dev` — checks if drift needs a committed migration (commit if it produces a file; the dev-DB fix is temporary if no migration is committed).

**Fix for staging/prod:** Manual SQL patch via Neon dashboard, or a new idempotent remediation migration (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS throughout). Never use push against staging/prod.

**Prevention:** Any new migration that adds columns should use ADD COLUMN IF NOT EXISTS when possible, so a future push→migrate transition can't silently skip it.

## The environment naming trap (dev API)

These are NOT the same thing:

| Name | What it is |
|------|-----------|
| `mentomate-api-dev` Worker | The Cloudflare Worker the mobile app talks to (`.env.local` → `EXPO_PUBLIC_API_URL`) |
| "staging" branch in Neon console | The Neon branch for `mentomate-api-stg` (the staging Worker) — DIFFERENT database |
| Doppler `dev` config | Holds `DATABASE_URL` for `mentomate-api-dev` Worker — points at a Neon branch NOT labeled "staging" |

Running diagnostic queries on the Neon "staging" branch will show clean results even when `mentomate-api-dev` is broken — you're looking at the wrong DB.

When you see `column "X" does not exist` on the dev API, do **NOT**:
- Ask the user to check Doppler `dev` config DATABASE_URL (they've done this before, it wastes time)
- Run pg_views/pg_policies/pg_proc queries on the Neon "staging" branch (wrong DB)
- Send the user to Cloudflare Workers Observability (it was disabled on `mentomate-api-dev`)

## Predecessor notes

This file is the canonical home for the schema-drift pattern. Three prior memory entries were folded into it and are now gone:

- `project_dev_schema_drift_trap.md` — the 2026-04-17 `mentomate-api-dev` incident note (WI-387 merge, 2026-06-10). Its durable content — the environment naming trap table and the do-not-do list — is absorbed above; the incident narrative and its expired follow-up list are in the archived file (`docs/_archive/memory/`).

- `project_neon_transaction_facts.md` — neon-http driver session-context constraints (no per-transaction RLS context). Acted on in commit `c80bb903` (RLS-driver-swap to neon-serverless WebSocket Pool). Architectural facts retain reference value through that commit and the surviving migrations (e.g. `apps/api/drizzle/0058_memory_facts_enable_rls.sql`).
- `project_schema_drift_staging_fix.md` — one-time 2026-04-15 incident note. The generic pattern lives above; the incident-specific details are in the git log around 2026-04-14/15.

If you searched for either filename and landed here, this file is what you wanted.
