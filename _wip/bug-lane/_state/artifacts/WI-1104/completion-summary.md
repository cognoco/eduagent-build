What was done: Added row-level-security isolation policies for the concepts and concept_mastery tables, with coverage bookkeeping and negative-path break tests. This re-finalization follows a review bounce whose cause was a misnamed migration meta snapshot — not the policy work itself — and that filename defect was corrected separately under `WI-1163`.

What changed: A forward migration adds the RLS policies; `apps/api/src/services/database-rls-coverage.ts` marks the two tables as covered; and `tests/integration/profile-isolation.integration.test.ts` gains break tests asserting cross-profile reads and inserts are rejected. The snapshot-filename defect that bounced this item at review was corrected under `WI-1163` via pull request number one six four six.

Verification: the original landing pull request number one five eight nine had its required checks green at merge; the post-merge database-package gate that bounced this item is now green after `WI-1163` corrected the snapshot filename, and `nx run @eduagent/database:test` passes.

Caveats / Follow-ups: the snapshot-filename correction landed under `WI-1163`; the change-class router gap that allowed the defect to merge is captured as `WI-1164` with a red-green regression requirement. Fixed In remains the original migration commit.
