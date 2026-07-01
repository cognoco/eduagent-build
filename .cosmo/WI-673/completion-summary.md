What was done:
- Implemented WI-673 (Extend the i18n ratchet to JSX attribute literals) and merged PR #1576.

What changed:
- Extended `scripts/check-i18n-jsx-literals.ts` so the existing hardcoded JSX copy ratchet also scans known user-copy JSX attributes such as `label`, `title`, `placeholder`, and `accessibilityLabel`.
- Kept non-copy props, unknown custom props, translation-key-like literals, metadata, IDs, route/path/source values, style values, and roles outside the attribute ratchet.
- Refreshed the baseline with six existing `accessibilityLabel` entries and updated AGENTS, project context, CI comments, and focused tests for the new scope.
- Addressed CodeRabbit review by removing the suffix-based classifier fallback so only explicit copy-prop allowlist entries are scanned.

Verification:
- Local focused checks passed: `pnpm exec jest --config scripts/jest.config.cjs scripts/check-i18n-jsx-literals.test.ts --no-coverage --runInBand`, `pnpm check:i18n:jsx-literals`, `pnpm check:i18n:orphans`, and `git diff --check`.
- Negative smoke passed: a temporary `label="Temporary English Copy"` failed the checker as `jsx-attribute-string label`, then was reverted.
- Pre-push validation passed, including TypeScript build; the first push also ran `pnpm eval:llm` with 34 flows and 438 snapshots.
- PR #1576 required GitHub checks passed: main, API Quality Gate, Merge completeness check, Claude Code Review, CodeRabbit, and web smoke checks.
- The flag-on identity-v2 integration lane failed with the known non-blocking diagnostic failure; the workflow marks that lane informational and mergeStateStatus was UNSTABLE for that reason only.

Caveats / Follow-ups:
- A broader scripts Jest run still has unrelated Windows/shell-sensitive failures in `check-merge-invariant` and deploy-yml suites. The WI-specific checker suite and CI-required checks are green.
