# Rescued work ledger

Snapshot updated: 2026-05-20
Current base checked: `main` at `c551d32d1`

This folder records WIP recovered during worktree and stash cleanup. It is a decision record, not a queue to apply wholesale.

The patch payloads were removed after classification; only this README and the root `worktree-cleanup.md` ledger are kept.

## Publish decision

No rescued patch in this folder is currently a publish blocker.

Use this rule:

- `merged`: already landed on `main`; keep patch only as provenance.
- `archive-only`: do not apply directly; either superseded by current code or too stale/mixed to revive safely.
- `deleted obsolete`: intentionally removed after verification showed it no longer carried useful code.

## Current action list

| Item | Decision | Action before publish |
|---|---|---|
| PR rescue patches `#357`-`#360` | Merged | None. Patch payloads removed; PRs and merge commits are the evidence. |
| `stash-23-ci-failure-readability-jest-reporter.patch` | Archive-only; functionality already landed via PR `#255` / commit `6724805ac` and later cleanup | None. Do not create `rescue-stash-23`. |
| `stash-17-day-d-pre-pr-288.patch` | Archive-only; key child-detail mode behavior is already present on `main` | None. Do not apply. |
| `stash-29-e2e-flows-and-test-exports.patch` | Archive-only; most content is stale overlap with current bookmark, deep-link, E2E, and test-export work | None. Do not apply. |
| `stash-30-sign-in-up-rewrites-and-pending-redirect.patch` | Archive-only; pending-auth-redirect and dev/E2E seed support are already present | None. Do not apply. |
| `stash-58-user-flows-superset-2026-05-12.patch` | Archive-only; old broad snapshot, current code already contains the important hardening patterns | None. Do not apply. |
| `codex-worktree-4d97-tracked-diff.patch` | Archive-only; mixed challenge/progress/notes snapshot, superseded by later rescue PRs and mainline work | None. Do not apply. |
| `codex-worktree-598e-tracked-diff.patch` | Merged/exactly present; reverse patch applied against current main before cleanup | None. Patch payload removed. |
| `codex-worktree-52f5-tracked-diff.patch` | Archive-only; stale variant of the deleted `codex-worktree-8330` patch plus a risky Metro block-list removal | None. Do not apply. |
| `codex-worktree-8330-tracked-diff.patch` | Deleted obsolete; removed after verifying the E2E URL-precedence change is not needed and the Jest ignore removal is harmful | None. File intentionally removed. |

## Merged rescue PRs

| Patch | PR | Merge commit | Decision |
|---|---:|---|---|
| `stash-cf-00-pre-merge-origin-main-WIP.patch` | `#357` | `fa67d1d0` | Merged |
| `stash-cf-01-other-agent-mock-cleanup.patch` | `#358` | `a026c611` | Merged |
| `stash-cf-02-mock-cleanup-wave.patch` | `#359` | `1120a63c` | Merged |
| `stash-10-family-access-ownership-refactor.patch` | `#360` | `c551d32d` | Merged |

GitHub currently has no open rescue PRs. Remote rescue branches `origin/rescue-stash-01`, `origin/rescue-stash-02`, `origin/rescue-stash-03`, and `origin/rescue-stash-10` are merged into `main`; they can be deleted later if the team wants a tidy remote.

## Patch notes

### `stash-23-ci-failure-readability-jest-reporter.patch`

Decision: archive-only.

Why:

- Current repo already has `scripts/jest-ci-reporter.cjs`.
- Current Jest configs already reference the CI reporter and `silent: true` defaults.
- The matching work appears in merged PR `#255` (`wip-2026-05-14-carryover`) and later commit `1f0a5bfd8`.

Do not create a rescue PR for this patch.

### `stash-17-day-d-pre-pr-288.patch`

Decision: archive-only.

Why:

- Current `ChildDetailScreen` already reads `mode` from route params.
- Current parent home already routes child profile/settings/progress using the explicit `mode` params.
- Patch no longer applies cleanly and would be a stale rewrite of current behavior.

### `stash-29-e2e-flows-and-test-exports.patch`

Decision: archive-only.

Why:

- Patch touches 46 files and no longer applies cleanly.
- Many files it wanted to add already exist.
- Current code already has topic-filtered bookmarks, deep-link redirect flows, E2E preflight harness changes, and test-only export checks from later mainline work.

Only use it for historical comparison if a very specific E2E flow is later found missing.

### `stash-30-sign-in-up-rewrites-and-pending-redirect.patch`

Decision: archive-only.

Why:

- Patch touches 53 files and no longer applies cleanly.
- Current code already has `pending-auth-redirect`, the dev-only pending redirect seed route, deep-link redirect flows, and bookmark query support.
- Applying this would re-open old auth/onboarding code over newer fixes.

### `stash-58-user-flows-superset-2026-05-12.patch`

Decision: archive-only.

Why:

- Patch is an older 56-file broad snapshot.
- Current code already contains the visible hardening themes: API spec test config, feedback delivery idempotency handling, quiz launch timeout/retry behavior, mutation error-handling lint rule, typed errors, and E2E harness hardening.
- Patch no longer applies cleanly and mixes unrelated API, mobile, schema, and integration-test changes.

### `codex-worktree-4d97-tracked-diff.patch`

Decision: archive-only.

Why:

- Patch is a mixed worktree snapshot across challenge round, notes, progress, prompt snapshots, mobile session UI, translations, and schema files.
- The large untracked companion list corresponds to challenge-round files now present on `main`.
- Patch no longer applies cleanly.

### `codex-worktree-598e-tracked-diff.patch`

Decision: merged/exactly present.

Why:

- `git apply --reverse --check` succeeds on current `main`, which means the patch content is already present.
- No action needed.

### `codex-worktree-52f5-tracked-diff.patch`

Decision: archive-only.

Why:

- Patch is a stale three-file variant overlapping with `codex-worktree-8330`.
- It also removes Metro block-list entries for test/story/mock files, which is not a publish-readiness cleanup.

### Deleted: `codex-worktree-8330-tracked-diff.patch`

Decision: deleted obsolete.

Why:

- Patch applied cleanly, so it was checked before deletion.
- It had two unrelated changes:
  - `serve-exported-web.mjs`: ignores inherited `EXPO_PUBLIC_API_URL` and uses `PLAYWRIGHT_API_URL` or the default test API URL.
  - `apps/mobile/jest.config.cjs`: removes `.worktrees` test/module ignore patterns.
- CI already sets `PLAYWRIGHT_API_URL` and `EXPO_PUBLIC_API_URL` to the same staging URL.
- `apps/mobile/e2e-web/helpers/runtime.ts` still intentionally accepts `EXPO_PUBLIC_API_URL` as a compatibility fallback, so changing only `serve-exported-web.mjs` could create seed/API mismatch in local runs.
- The Jest ignore removal conflicts with current worktree-scan protections in Jest config and would be a regression.

The tracked patch and its empty untracked-files manifest were removed on 2026-05-20.

## Re-check commands

```powershell
gh pr list --state open --limit 20
Test-Path stashes-rescued/codex-worktree-8330-tracked-diff.patch
Get-ChildItem stashes-rescued
```

Expected state before publish:

- No open rescue PRs.
- `codex-worktree-8330` path check returns `False`.
- `Get-ChildItem stashes-rescued` shows only `README.md`.
