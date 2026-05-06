## Rollback

Rollback is possible if no profile has selected one of the newly allowed
conversation languages (`de`, `it`, `pt`, `pl`, `ja`, `nb`).

Data loss: none if all rows are migrated back to the previous language set
before restoring the narrower check constraint. If any profile still has a
newly allowed value, the rollback statement will fail rather than silently
destroying data.

## UX impact

The recovery `UPDATE` silently resets every affected profile's
`conversation_language` to `'en'`. Operators must communicate this change
to the affected users before running the rollback — their mentor will
abruptly switch to English on the next session, which is jarring without
notice. If the population is small, a per-profile email or in-app
notification ahead of the rollback is the recommended posture.

Recovery procedure:

```sql
UPDATE "profiles"
SET "conversation_language" = 'en'
WHERE "conversation_language" IN ('de', 'it', 'pt', 'pl', 'ja', 'nb');

ALTER TABLE "profiles"
  DROP CONSTRAINT IF EXISTS "profiles_conversation_language_check";

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_conversation_language_check"
  CHECK ("conversation_language" IN ('en','cs','es','fr'));
```

After rollback, deploy mobile/API code that only writes the previous language
set.
