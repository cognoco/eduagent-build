**Checkpoint for WI-950**

Stopped immediately on user instruction after the initial worktree setup attempt was interrupted.

Current known state:
- No WI-950 implementation work was performed in this resumed run.
- No source files were intentionally edited for WI-950.
- No commit, push, PR, or Cosmo complete action was performed.
- Cosmo fetch/claim had not been reached before the stop instruction.
- The main checkout already had unrelated memory edits before this run; those were observed only and left untouched.
- A setup attempt was started with `bash scripts/setup-worktree.sh WI-950` through PowerShell/RTK, then the turn was interrupted. Coordinator reports the resulting `.worktrees/WI-950` is broken with `/mnt/c/...` git metadata.
- A first repair attempt rewrote the `.git` pointer files to Windows paths, which made `git status` runnable but exposed the partial checkout as structurally corrupt: files appeared as deleted and re-added. No WI-950 source changes were intentionally made, so the partial checkout should be discarded and recreated cleanly.
- A removal command was then attempted but was malformed by PowerShell quoting before it could repair the worktree. The coordinator still sees `/mnt/c/...` metadata, so the hard gate remains active.

Hard gate before any future coding:
1. Repair or recreate `.worktrees/WI-950` using Windows/PowerShell/Git-for-Windows only.
2. Confirm `git -C .worktrees\WI-950 status --short --branch` works.
3. Confirm the worktree is on branch `WI-950`, not `ongoing` or `main`.
4. Confirm no `/mnt/c/...` metadata remains.
5. Inspect any existing source changes in `.worktrees/WI-950`; preserve them only if intentional, otherwise report exactly what is discarded before coding.

Repair outcome:
- The stale partial `.worktrees/WI-950` checkout and its broken `.git/worktrees/WI-950` metadata were removed/recreated with Git-for-Windows.
- The partial checkout was discarded because it contained no intentional WI-950 implementation edits from this run and showed repository-wide delete/add corruption after pointer repair.
- Recreated `.worktrees/WI-950` from local branch `WI-950`, which matched `origin/main` at `dc9c5f3244620a52c1d4b5b500e6d6331a08ef4a`.
- Hard gate passed after recreation:
  - `git -C .worktrees/WI-950 status --short --branch` -> `## WI-950`
  - `git -C .worktrees/WI-950 branch --show-current` -> `WI-950`
  - `.worktrees/WI-950/.git` and `.git/worktrees/WI-950/gitdir` now use `C:/Dev/...` paths.
  - No `/mnt/c` match remains in the WI-950 pointer metadata checked.
