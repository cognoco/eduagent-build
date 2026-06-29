**What was done:**
- Added a guarded mobile date formatter for short, locale-aware dates.
- Replaced direct date rendering across the affected mobile date surfaces with the shared formatter.
- Added a regression test for unparseable short-date input and guarded newly added locale reads so test mocks or edge runtimes without an i18n object do not crash.

**What changed:**
- `apps/mobile/src/lib/format-datetime.ts` now exposes `formatShortDate()`, returning raw invalid string input instead of throwing.
- Progress, child-report, subscription, note, session, revocation, and profile date displays now use the helper.
- Remaining raw `toLocaleDateString` calls are limited to the helper fallback and an existing test-only exact-format replication.

**Verification:**
- `pnpm exec tsc --noEmit` from `apps/mobile` passed.
- `pnpm exec jest apps/mobile/src/lib/format-datetime.test.ts --runInBand --silent=false` passed: 6 tests.
- `git diff --check` passed.
- Raw `toLocaleDateString|toLocaleTimeString` sweep found only the helper fallback and existing test-only exact-format replication.
- Commit hooks passed on both commits.
- `git push origin HEAD:WI-1083` passed the pre-push gate: incremental `tsc --build`, related mobile Jest, and i18n checks.

**Caveats / Follow-ups:**
- Local Jest initially hit broken package-local links in the worktree's `node_modules`; those were repaired locally before the focused and pre-push tests ran.
- Pre-push still prints existing Expo/native-module and act() warnings, but exited successfully.
- None for this item.
