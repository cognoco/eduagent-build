---
name: feedback_batch_merge_verify_main_green
description: "After batch-merging multiple PRs under strict=false, verify main's own CI is green before moving on — independently-green PRs can combine to a red main."
metadata: 
  node_type: memory
  type: feedback
  created: 2026-06-29
  last_confirmed: 2026-06-29
  status: active
  originSessionId: 53da2496-a6eb-41f0-966d-1130f2398bb1
---

When merging a batch of PRs under branch-protection `strict=false` (no up-to-date-before-merge),
each PR's CI only saw its own branch vs the pre-batch main — so two PRs can be green independently
yet turn main red once both land. Classic case (WS-27 PR-cleanup, 2026-06-29): PR-A added a new
file of a guarded class (`billing-subscription-store-teardown.ts`) and PR-B added the guard that
enforces the class (`@inngest-admin` annotation check); neither PR's CI saw the other's
contribution, so main went red on the guard after both merged — blocking every subsequent API PR.

**Rule:** after a green-sweep batch merge, **check main's own CI run** (`gh run list --branch main`)
before declaring the sweep done or moving to lifecycle finalization. Merge order doesn't save you;
the combination is the hazard. Mitigation if a guard + a new guarded file are in the same batch:
update-branch the second onto the first before merging, or expect to land a follow-up annotation.

**Why:** I finalized the 6 WIs to Reviewing without re-checking main; the shepherd caught the
ambient red first. A 30-second main-CI check after the batch would have surfaced it. Relates to
[[feedback_forward_ratchets_not_in_prepush]] (git-diff ratchets only fire on combined state).
