# Rollback: 0058_memory_facts_enable_rls

## Rollback

Rollback is possible at any time. No data is lost.

Disabling RLS does not drop rows, columns, or any table structure. It only
removes the enforcement flag. Because no RLS policies have been attached to
`memory_facts` yet (they are planned for a follow-up migration), disabling
the flag restores the table to its previous state with no side effects.

Recovery procedure:

```sql
ALTER TABLE "memory_facts" DISABLE ROW LEVEL SECURITY;
```

Deploy this SQL against the target database before or after rolling back the
API code — order does not matter since the flag is a no-op at runtime
(neon-http does not enforce RLS without per-request session context).
