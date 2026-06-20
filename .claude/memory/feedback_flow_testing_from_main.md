---
name: Flow testing from main
description: Use when running or reporting mobile flow-plan reruns and flow-status evidence.
type: feedback
---

Flow testing and flow-status evidence must be run from `main` unless the user explicitly names another branch.

**Why:** On 2026-06-20, a not-passing flow rerun was accidentally run from `ongoing`, producing evidence that was branch-valid but not valid as mainline flow status.

**How to apply:** Before any flow rerun, check the branch/head. If the current checkout is not `main`, create or use a clean worktree based on `origin/main`; do not report branch evidence as main evidence.
