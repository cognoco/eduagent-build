# Rollback — 0052_fixed_hex

## Changes in this migration

1. Pre-flight `UPDATE profiles SET pronouns = LEFT(pronouns, 32)` for any rows whose `pronouns` value exceeds 32 characters. Required so step 2 does not halt mid-deploy on legacy free-text values (the column was added in 0035 with no length limit).
2. Add `CHECK` constraint `profiles_pronouns_length_check` enforcing `pronouns IS NULL OR char_length(pronouns) <= 32`.

## Rollback

**Possible:** Partial. The CHECK constraint can be dropped trivially. The pre-flight UPDATE in step 1 cannot be undone — pronouns longer than 32 characters at migration time are permanently truncated. In practice these are expected to be near-zero count and almost certainly free-text noise (accidental paste, prose answers in a self-identification field) rather than legitimate identity strings, but rollback callers must accept the truncation.

**Data loss:**
- Pronouns text past character 32 for any profile whose value exceeded 32 characters before the migration. Original pre-truncation values are not preserved anywhere.

**Procedure:**
```sql
ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_pronouns_length_check";
```

**Side effects on rollback:**
- The API-layer 32-char validation (added alongside this migration) still rejects writes longer than 32 chars, so dropping the DB constraint does not re-open the long-pronoun write path on its own. It only removes the database-side belt-and-suspenders guarantee.
- If the application validation is also reverted, long pronouns can be inserted again. Already-truncated rows do not regrow.

**Recommendation:** Do not roll this migration back unless the truncation in step 1 is shown to have removed legitimate distinct pronouns. If rollback is unavoidable, accept the truncation and re-deploy with whatever new length policy is chosen.
