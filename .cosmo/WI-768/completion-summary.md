What was done:
- Implemented WI-768 (Activity feed: mobile has no renderer for /now ledger-moment cards — build it or stop emitting) and merged PR #1580.

What changed:
- Kept `/now` ledger-moment emission intact and rendered `ledger_moment` cards on mobile through the Mentor ledger moment card path.
- Hardened `LedgerMomentCard` to use an explicit supported ledger-copy map for `session_filed` and a generic localized fallback for unsupported/future ledger kinds.
- Added focused regression tests for supported ledger copy, unsupported-kind fallback, dismiss behavior, and `NowCardStack` routing into the ledger renderer.

Verification:
- TDD red step passed: the new unsupported-kind test first failed because `future_kind` leaked an untranslated dynamic key.
- Local focused checks passed: `pnpm exec jest --config apps/mobile/jest.config.cjs apps/mobile/src/components/mentor/LedgerMomentCard.test.tsx apps/mobile/src/components/mentor/NowCardStack.test.tsx --runInBand --no-coverage`, `pnpm check:i18n:jsx-literals`, locale-key smoke, and `git diff --check`.
- Pre-push validation passed: TypeScript build, related API/mobile Jest suites, i18n orphan check, and i18n staleness check.
- PR #1580 required GitHub checks passed: main, API Quality Gate, Merge completeness check, Claude Code Review, CodeRabbit, and web smoke checks.
- The flag-on identity-v2 integration lane failed with the known non-blocking diagnostic failure; the workflow marks that lane informational and mergeStateStatus was UNSTABLE for that reason only.

Caveats / Follow-ups:
- Test output included existing Expo/baseline-browser-mapping and React act warnings from broader related mobile suites, but all selected suites passed.
