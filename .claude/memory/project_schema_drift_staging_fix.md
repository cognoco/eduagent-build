---
name: Staging DB schema drift — manual column fix (2026-04-15)
description: Migration journal desync caused missing column on staging. Fixed manually. Pattern to watch for on all future deploys.
type: project
---

## Incident: Staging session streaming broken (2026-04-15)

**Symptom:** All session streaming requests returned 500. Books (non-streaming LLM) worked fine. Health endpoint returned OK.

**Root cause:** `NeonDbError: column "last_revenuecat_event_timestamp_ms" does not exist` on the `subscriptions` table. The drizzle migration journal (`__drizzle_migrations`) had migration `0011_good_harrier.sql` marked as "applied," but the column was never actually created. Running `drizzle-kit migrate` was a no-op because the journal said "done."

**Fix:** Added the column manually via `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_revenuecat_event_timestamp_ms text`.

**Why:** This is the `push → migrate` transition gap documented in `project_schema_drift_pattern.md`. Dev uses `db:push` (compares actual schema), staging/prod use `drizzle-kit migrate` (trusts the journal). If the journal says a migration ran but the DDL silently failed or was rolled back, `migrate` will never retry it.

**How to apply:**
- After any `drizzle-kit migrate` on staging or production, **verify the actual column/table exists** — don't trust "migrations applied successfully" alone.
- If a deploy causes 500s with `NeonDbError: column ... does not exist`, check the journal vs reality, then `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` as a hotfix.
- For staging, `db:push:dev` pointed at the staging DB would have self-healed this.

## Also discovered in this session

- **Production API is down** — `CLERK_AUDIENCE` missing from Doppler `prd`. Tracked in pre-launch checklist.
- **Client-server version skew** — Mobile OTA deployed from `stabilization`, staging API auto-deploys from `main` (20 API commits behind). Merging stabilization → main will fix.
