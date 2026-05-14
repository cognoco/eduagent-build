## Rollback

Rollback is safe — dropping the table loses only cached LLM-generated progress summaries, which are regenerated on next dashboard visit.

```sql
DROP INDEX IF EXISTS "progress_summaries_profile_uq";
DROP TABLE IF EXISTS "progress_summaries";
```
