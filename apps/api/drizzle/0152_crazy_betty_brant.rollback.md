# Rollback — 0152 verified learning artifacts

- **Reversible?** Partially. Drop the new objects only after rolling back code that reads them.
- **Data loss:** Dropping `evidence_links` loses opaque provenance; dropping artifact columns loses classifications, including the Challenge-draft backfill.
- **Recovery:** Restore the database snapshot/isolated branch from before migration.
