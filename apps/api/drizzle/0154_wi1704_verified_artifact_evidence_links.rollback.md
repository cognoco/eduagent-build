# Rollback — 0154 verified learning artifacts

- **Reversible?** Partially. Roll code back before removing the evidence-link
  table or artifact metadata.
- **Data loss:** Dropping `evidence_links` loses opaque provenance; dropping the
  artifact columns loses classifications and the Challenge-draft verification
  backfill.
- **Expand/contract caveat:** `topic_notes.artifact_source` intentionally remains
  nullable because the previously deployed Worker explicitly writes `NULL`.
  A later migration may add `NOT NULL` only after every active Worker writes a
  non-NULL source and a final backfill has completed.
- **Recovery:** Restore the database snapshot from before migration 0154 if the
  metadata itself must be recovered.
