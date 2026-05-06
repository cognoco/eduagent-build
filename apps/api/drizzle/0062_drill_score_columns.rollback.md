# Rollback: 0062_drill_score_columns

## What this migration does

Adds two nullable integer columns to `session_events`:
- `drill_correct` — number of correct answers in a fluency drill
- `drill_total` — total questions in a fluency drill

Sparse: non-null only on `ai_response` rows whose envelope's
`ui_hints.fluency_drill.score` was emitted by the LLM. Every existing row
and every non-drill row stays `NULL`.

## Rollback

Possible. Rollback drops both columns. Any drill scores written between
deploy and rollback are **permanently destroyed**. They are not duplicated
elsewhere (drill scores are only persisted on these columns; the metadata
JSONB does not carry them).

```sql
ALTER TABLE "session_events" DROP COLUMN IF EXISTS "drill_correct";
ALTER TABLE "session_events" DROP COLUMN IF EXISTS "drill_total";
```

Recovery procedure: none. If drill scores need to be reconstructed after
rollback, the only source is the LLM's raw response stored in `ai_response.content`,
which contains the envelope JSON only when the parser fell back (BUG-934 path).
For successfully-parsed envelopes, the raw envelope is **not** retained, so
the score is irrecoverable.
