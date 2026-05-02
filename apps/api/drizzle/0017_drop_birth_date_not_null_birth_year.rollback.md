# Migration 0017 — Rollback Assessment

Per CLAUDE.md "Schema And Deploy Safety" — every migration that drops columns,
tables, or types must document rollback possibility, data loss, and recovery
procedure.

## What it does

- Backfills `profiles.birth_year` from `EXTRACT(YEAR FROM birth_date)` where
  `birth_year IS NULL AND birth_date IS NOT NULL`.
- Backfills `profiles.birth_year = 2000` for any remaining NULL rows (fallback
  intended for dev databases — see PRODUCTION RISK note in the SQL header).
- Sets `profiles.birth_year` to `NOT NULL`.
- Drops `profiles.birth_date` column.

## Rollback possibility

**Rollback is NOT possible.** This is a destructive, one-way migration.

| Change | Reversible? | Notes |
|---|---|---|
| `birth_date` column drop | **No** | Month/day precision is permanently destroyed. Only year survives, in `birth_year`. |
| `birth_year` NOT NULL | Yes | `ALTER TABLE profiles ALTER COLUMN birth_year DROP NOT NULL;` — reversible at the schema level only; nullability of historical rows cannot be restored. |
| `birth_year = 2000` fallback | **No** | Rows that had NULL `birth_year` AND NULL `birth_date` pre-migration are now indistinguishable from rows actually born in 2000. The original NULL signal ("unknown") is lost. |

## Data lost

- **`birth_date` (full date)**: month and day values are permanently destroyed for every row. Year is preserved in `birth_year` for rows that had a non-NULL `birth_date`.
- **NULL-vs-2000 distinction**: any row that had `birth_year IS NULL AND birth_date IS NULL` pre-migration is now silently set to `birth_year = 2000`. After migration, "user born in 2000" and "user with unknown birth year" cannot be told apart. Verify pre-migration with:
  ```sql
  SELECT count(*) FROM profiles WHERE birth_year IS NULL AND birth_date IS NULL;
  ```

## Recovery procedure

If `birth_date` data is needed again:

```sql
-- Restore the column at the schema level (data cannot be recovered)
ALTER TABLE "profiles" ADD COLUMN "birth_date" date;
ALTER TABLE "profiles" ALTER COLUMN "birth_year" DROP NOT NULL;
```

After running the above:
1. The column is re-added but every row's `birth_date` is NULL — original month/day values are gone.
2. The application must be redeployed with pre-0017 code so writes/reads target `birth_date` again.
3. Affected users would need to re-enter their birth date through the onboarding/profile UI to repopulate the column.

## Context

Migration 0017 was part of the persona/birth-year refactor — the application
moved from full birth dates (`birth_date`) to year-only (`birth_year`) because
month/day precision was never used downstream. The column drop is intentional
and the data was deemed unrecoverable by design. This file exists to document
that decision against the CLAUDE.md governance rule, not to suggest a recovery
path is available.

Tracked under audit punch-list item `AUDIT-MIGRATIONS-3`.
