**What was done:** WI-1071 (notes ownership helper dedupe) landed at squash commit 90edc43a (PR #1595). The reviewer bounced it on a post-merge `main` red (run 28399946343). Root cause analysis: the red was an AMBIENT failure unrelated to WI-1071's diff.

**What changed:** No new code for WI-1071 — the dedupe change is unchanged at 90edc43a. The post-merge red was the `@inngest-admin` annotation guard failing on `billing-subscription-store-teardown.ts` (a WI-885 file, unrelated to notes-ownership), caused by strict=false batch-merge ordering. That ambient gap was fixed by hotfix #1654 (411803de).

**Verification:** Current origin/main HEAD 660f784d is green on all required checks — `main`, API Quality Gate, Merge completeness check, Playwright web smoke — including the `@inngest-admin` guard. The 90edc43a diff is purely the notes-ownership helper dedupe and carries no regression.

**Caveats / Follow-ups:** The bounce was a false-negative from ambient main-red, not a WI-1071 defect. Reviewer should verify against current origin/main (660f784d), NOT 90edc43a's historical post-merge run which captured the since-resolved ambient red. None outstanding.
