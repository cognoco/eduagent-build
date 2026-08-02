# WI-2981 completion summary

## What was done

Changed CI workflow concurrency so pull-request heads retain PR-scoped
cancellation while main pushes use an independently attributable commit-SHA
group.

## What changed

- Updated `.github/workflows/ci.yml` concurrency group and explanatory comments.
- Added `scripts/ci-concurrency-contract.test.ts` covering the four acceptance variants.
- Captured deterministic RED/GREEN and revert/restoration evidence in
  `red-green.md` and `evidence.json`.

## Verification

- Focused contract suite: RED baseline `3 failed / 1 passed`; GREEN and restored
  candidate `4 passed`.
- Historical cancelled zero-job runs recorded: `30688886377`, `30688890531`,
  and `30688912863`.
- No deployment authority, permissions, triggers, required checks, or merge
  gates changed.

## Caveats

GitHub-hosted rapid-merge execution was not reproduced in this branch; the
deterministic contract proves the concurrency-key invariant that prevents
distinct main SHAs from sharing the one-running/one-pending slot.

## Follow-ups

The shepherd should review the opened PR and retain the contract suite as the
regression guard for future CI concurrency edits.
