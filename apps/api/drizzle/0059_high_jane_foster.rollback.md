# Rollback: 0059_high_jane_foster

## What this migration does

Adds two enum values to `assessment_status`:

- `borderline` — assessment ended on a marginal pass/fail boundary
- `failed_exhausted` — learner exhausted attempts without reaching pass

## Rollback

**Rollback is not possible.** PostgreSQL does not support removing values
from an enum type via DDL. Once `borderline` and `failed_exhausted` are
added to `assessment_status`, the values persist for the lifetime of the
database. Reverting application code does **not** remove the enum members.

Data loss: none — no rows or columns are dropped, but historical rows
written with the new statuses cannot be expressed in the previous code's
type signature.

Mitigation procedure:

1. Deploy application code that **never writes** `'borderline'` or
   `'failed_exhausted'` (revert the assessment outcome wiring).
2. Optionally rewrite any rows that already use the new statuses to a
   pre-existing value:

   ```sql
   UPDATE "assessments"
   SET "status" = 'failed'
   WHERE "status" IN ('borderline', 'failed_exhausted');
   ```

3. The enum members remain on the type. Subsequent code can ignore them
   safely as long as no INSERT/UPDATE writes them.

A full enum rebuild (CREATE TYPE assessment_status_v2; UPDATE; ALTER COLUMN
TYPE; DROP TYPE) is technically possible but requires downtime and table
rewrite, and is not warranted for a soft revert.
