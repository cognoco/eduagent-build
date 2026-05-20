# Rollback — 0089 Language Check Idempotent (BUG-405)

## Context

Migration 0089 adds a `VALIDATE CONSTRAINT` step to confirm that any existing
`profiles.conversation_language` values satisfy the CHECK constraint introduced
in migration 0035. The constraint was added with `NOT VALID` on databases that
were provisioned via `db:push` before 0035 was committed, leaving it unenforced
on pre-existing rows.

## Will VALIDATE succeed?

**On staging and production databases:** Yes. Both environments were migrated
through the ordered sequence (0035 → 0089). The CHECK constraint has been
enforced on all inserts and updates since 0035 was applied, so no out-of-range
values can exist.

**On dev databases provisioned via `db:push` before migration 0035 was
committed:** Not guaranteed. If any profile row was written with a
`conversation_language` value outside `('en','cs','es','fr','de','it','pt','pl')`
before the CHECK was present, `VALIDATE CONSTRAINT` will fail with:

```
ERROR: check constraint "profiles_conversation_language_check" of relation
"profiles" is violated by some row
```

### Recovery for dev DBs that fail VALIDATE

1. Identify the offending rows:
   ```sql
   SELECT id, conversation_language FROM profiles
   WHERE conversation_language NOT IN ('en','cs','es','fr','de','it','pt','pl');
   ```

2. Either delete or update the offending rows:
   ```sql
   -- Option A: reset to default
   UPDATE profiles
   SET conversation_language = 'en'
   WHERE conversation_language NOT IN ('en','cs','es','fr','de','it','pt','pl');

   -- Option B: delete the profile (only safe if no downstream FK rows exist)
   DELETE FROM profiles
   WHERE conversation_language NOT IN ('en','cs','es','fr','de','it','pt','pl');
   ```

3. Re-run `pnpm run db:push:dev` to sync the dev schema and validate.

## Is rollback of 0089 possible?

Yes. The migration is non-destructive — it only validates a constraint that
was already declared in 0035. To revert VALIDATE:

```sql
-- Re-mark the constraint NOT VALID (bypasses row scans on next enforce attempt)
ALTER TABLE "profiles"
  ALTER CONSTRAINT "profiles_conversation_language_check" NOT ENFORCED;
-- Note: PostgreSQL < 17 does not support NOT ENFORCED directly; instead drop
-- the validated constraint and re-add it as NOT VALID:
ALTER TABLE "profiles"
  DROP CONSTRAINT "profiles_conversation_language_check";
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_conversation_language_check"
  CHECK ("conversation_language" IN ('en','cs','es','fr','de','it','pt','pl'))
  NOT VALID;
```

## Data lost?

None. VALIDATE CONSTRAINT is a read-only operation.
