# Worktree Cleanup Decision Ledger

Updated: 2026-05-20
Current base checked: `main` at `c551d32d1`

This is the publish-facing summary for rescued work. The detailed rescue ledger lives in `stashes-rescued/README.md`.

## Bottom line

No rescued work is currently ambiguous enough to block publish.

The previously remaining clean-applying patch, `codex-worktree-8330`, was checked and deleted as obsolete. CI already sets `PLAYWRIGHT_API_URL` and `EXPO_PUBLIC_API_URL` consistently, while Playwright runtime still accepts `EXPO_PUBLIC_API_URL` as a compatibility fallback. The patch also removed current `.worktrees` Jest ignore protections, so applying it would be a regression.

The patch payloads were then removed from `stashes-rescued/`; only this decision record and `stashes-rescued/README.md` remain.

## Decisions

| Bucket | Items | Publish action |
|---|---|---|
| Merged rescue PRs | `#357`, `#358`, `#359`, `#360` | None |
| Already landed outside rescue PRs | `stash-23-ci-failure-readability-jest-reporter.patch` | None |
| Archive-only stale snapshots | `stash-17`, `stash-29`, `stash-30`, `stash-58`, `codex-worktree-4d97`, `codex-worktree-52f5` | None |
| Already present exactly | `codex-worktree-598e` | None |
| Deleted obsolete snapshot | `codex-worktree-8330` | None |

## Remote/PR state checked

- `gh pr list --state open` returned no open PRs.
- PRs `#357`-`#360` are merged into `main`.
- Remote branches `origin/rescue-stash-01`, `origin/rescue-stash-02`, `origin/rescue-stash-03`, and `origin/rescue-stash-10` still exist but are merged.
- No `origin/rescue-stash-23` branch exists, and it is not needed.

## Safe cleanup later

After publish, the team can delete merged remote rescue branches if desired.
