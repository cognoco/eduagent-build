# Migration 0020 — Rollback Assessment

## What it does

Additive Epic 15 (Visible Progress) schema changes:

- Adds 3 values to `notification_type` enum: `weekly_progress`, `monthly_report`, `progress_refresh`
- Creates `progress_snapshots` table — daily precomputed progress metrics (JSONB)
- Creates `milestones` table — append-only learning milestones with partial unique index
- Creates `monthly_reports` table — parent-facing monthly reports per child
- Adds `weekly_progress_push boolean NOT NULL DEFAULT true` column to `notification_preferences`

## Rollback possibility

**Rollback is partially possible.**

| Change | Reversible? | Notes |
|---|---|---|
| New tables (3) | Yes | `DROP TABLE … CASCADE` — drops the tables and their data. |
| New enum values (3) | **No** | PostgreSQL does not allow removing enum values (`ALTER TYPE … DROP VALUE` does not exist). Leaving the values in place after a rollback is harmless — existing rows never use them. |
| New `weekly_progress_push` column | Yes | `ALTER TABLE notification_preferences DROP COLUMN weekly_progress_push;` — destroys user preferences. |

## Recovery procedure

If a rollback is required:

```sql
DROP TABLE IF EXISTS "progress_snapshots" CASCADE;
DROP TABLE IF EXISTS "milestones" CASCADE;
DROP TABLE IF EXISTS "monthly_reports" CASCADE;
ALTER TABLE "notification_preferences" DROP COLUMN IF EXISTS "weekly_progress_push";
-- Enum values cannot be removed; leave them in place.
```

Data loss on rollback:
- All snapshot history (progress_snapshots.metrics JSONB)
- All detected milestones (milestones rows)
- All generated monthly reports (monthly_reports.report_data JSONB)
- All user weekly-progress push preferences (everyone reverts to opt-in-by-default)

## Context

Epic 15 (Visible Progress). The missing SQL for these tables was introduced as part of a bundled commit (54d657e) that only generated the Epic 16 migration; this follow-up migration restores drift between the TypeScript schema and the committed SQL. See `docs/superpowers/plans/2026-04-07-epic-15-visible-progress.md` and code review `project_epic15_code_review.md` finding `EP15-C1`.
