---
name: Archon spike — .archon/-only changes can be merged directly to main
description: During the Archon harness spike, changes scoped to .archon/ can bypass normal product-PR review and be merged directly to main, with consistency2 rebased onto main afterwards. Captures the merge-first loop and its bounds.
type: project
---

Direct merge of `.archon/`-only changes to `main` is allowed during the Archon harness spike. The loop is: edit `.archon/` on `consistency2` (or any branch) → commit → merge to `main` directly (PR or push, your choice) → rebase `consistency2` onto `main` to keep them aligned. The next workflow run then tests against the merged harness on `main` (so `worktree.baseBranch` is `main` under this model).

**Why:** `.archon/` is harness configuration with no app-code coupling — CI lint/typecheck/test on the app is a no-op for these changes. Routing harness tweaks through long-running cleanup PRs would put unrelated tooling commits in every cleanup-PR diff and force every PR review to dispose of them. The merge-first model keeps cleanup PRs clean and makes workflow test runs real (against the harness that will actually ship). Decided 2026-05-07 in the conversation that produced PR #176.

**How to apply:**
- Before merging, verify the delta is `.archon/`-only: `git log --name-only origin/main..<branch>` and confirm every listed file starts with `.archon/`. If anything outside `.archon/` is in the delta, this exception does NOT apply — fall back to normal PR review.
- After merge, `git fetch && git rebase origin/main` (or merge) on `consistency2` so the working branch stays aligned with `main`.
- Under this model `worktree.baseBranch: main` is correct. Worktrees branch from `main`, which by then has the latest harness.
- Do not extend the exception to non-`.archon/` files. Product code follows normal PR review.
- When the harness stabilizes and the spike ends, remove this exception and route `.archon/` changes through normal review.
