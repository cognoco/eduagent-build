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

**Fix for dev:** `pnpm run db:push:dev` — confirm the prompted changes. Safe to run repeatedly.

**Fix for staging/prod:** Manual SQL patch via Neon dashboard, or a new idempotent remediation migration (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS throughout). Never use push against staging/prod.

**What was missing in dev and staging (2026-04-14):**
- profiles.has_premium_llm (migration 0013)
- profiles.birth_year_set_by (migration 0018)  
- learning_profiles table (migration 0019)
- Likely also: topic_notes, book_suggestions, topic_suggestions, milestones, monthly_reports, progress_snapshots, filed_from/session_id on curriculum_topics, weekly_progress_push on notification_preferences

**Prevention:** Any new migration that adds columns should use ADD COLUMN IF NOT EXISTS when possible, so a future push→migrate transition can't silently skip it.
