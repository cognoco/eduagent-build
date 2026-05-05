# 0054 Rollback — Session summary retention columns

## Rollback (before any purge has run)

Reversible. Drop the three added columns:

```sql
ALTER TABLE session_summaries DROP COLUMN llm_summary;
ALTER TABLE session_summaries DROP COLUMN summary_generated_at;
ALTER TABLE session_summaries DROP COLUMN purged_at;
```

No data is lost — these are net-new columns. The pre-existing `narrative`
text column is untouched.

## Rollback (after any purge has run)

**NOT FULLY REVERSIBLE.** For rows where `purged_at IS NOT NULL`, the
corresponding `session_events` rows have been **permanently destroyed**. The
`llm_summary.narrative` and the re-embedded `session_embeddings` row are the
only remaining representations of those conversations. Dropping the columns
also drops `llm_summary`, leaving only the embedding vector — recovery of
original transcript text is **impossible**.

Before rollback after purge has run, decide whether you still want the
post-purge `session_summaries` rows; they cannot be reconstructed.
