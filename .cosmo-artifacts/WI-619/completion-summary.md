What was done:
- Implemented WI-619 (Eval-snapshot pre-commit guard cannot accept verified zero-drift prompt changes) and merged PR #1574.

What changed:
- Replaced the eval-snapshot pre-commit shell path with a TypeScript guard that distinguishes prompt-only, snapshot-only, and paired prompt-plus-snapshot changes.
- Added a gitdir-local zero-drift receipt written by the full eval harness, with HEAD, staged prompt blob, snapshot tree, and receipt integrity checks.
- Documented the zero-drift workflow so verified no-op prompt edits can pass without committing snapshot churn.

Verification:
- Local focused checks passed: pre-commit eval guard tests, zero-drift receipt tests, eval runner tests, change-class tests, direct guard execution, `git diff --check`, TypeScript pre-push validation, and `pnpm eval:llm` with 34 flows and 438 snapshots.
- PR #1574 required GitHub checks passed: main, API Quality Gate, Merge completeness check, Claude Code Review, CodeRabbit, and web smoke checks.
- The flag-on identity-v2 integration lane failed with the known non-blocking diagnostic failure; the workflow marks that lane informational and mergeStateStatus was UNSTABLE for that reason only.

Caveats / Follow-ups:
- No follow-up is required for WI-619. The unrelated flag-on diagnostic failure remains outside this work item.
