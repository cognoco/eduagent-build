# WI-1405 Builder Report - Billing v2 coverage

## Implementation plan
1. Add real-DB integration tests for quota-provision-v2 role resolution and provisioning edge cases.
2. Add live metering middleware coverage for absent per-profile quota rows, exact decrement behavior, and child 402 detail hygiene.
3. Add real-DB family-v2 service coverage for list/count/status/add/remove semantics across family/pro/free/plus/cross-org/archived cases.
4. Add mobile headless coverage for child in-chat quota actions and top-up success-to-poll behavior.
5. Add a seeded Maestro child quota flow tagged verify-at-e2e-run, keeping device/live-store claims separate.
6. Verify focused suites, run red-green-revert checks where practical, then commit/push/open PR if the runtime permits git/network writes.

## Status
Blocked after implementation and verification: git commit/push/PR creation could not be completed in this executor.

- Commit SHAs: blocked - git add failed creating C:/Dev/Projects/Products/Apps/eduagent-build/.git/worktrees/WI-1405/index.lock with Permission denied.
- PR URL: blocked - no commit could be created. A prior gh pr view WI-1405 --json number,url,state,title also failed through refused proxy 127.0.0.1:9.
- Expected report path write: blocked - C:/Dev/Projects/Products/Apps/eduagent-build/.cosmo-watch/coverage-debt/WI-1405-builder-report.md returned Access denied.
- Fallback report path: C:/Dev/Projects/Products/Apps/eduagent-build/.worktrees/WI-1405/WI-1405-builder-report.md.
- Cosmo completion: not run, per brief.
- apps/mobile/eas.json: not modified.

## Files changed
- apps/api/src/services/billing/billing-v2/quota-provision-v2.integration.test.ts - new real-DB role/provisioning/stale-limit/no-membership coverage.
- apps/api/src/middleware/metering.integration.test.ts - new live Hono metering middleware per-profile lazy-provision/decrement/child-402 coverage.
- apps/api/src/services/billing/billing-v2/family-v2.integration.test.ts - new real-DB family/pro/free/plus/cap/cross-org/archive/remove coverage.
- apps/api/src/services/test-seed.ts - new child-quota-exceeded seed scenario.
- apps/api/src/services/test-seed.test.ts - scenario registry expectation updated.
- apps/mobile/src/components/session/QuotaExceededCard.test.tsx - child view hides owner upgrade/top-up actions.
- apps/mobile/src/app/(app)/session/index.test.tsx - child structured 402 disables composer and renders child quota actions.
- apps/mobile/src/app/(app)/subscription.test.tsx - paid-tier top-up purchase enters polling and confirms only after credits increase.
- apps/mobile/e2e/flows/billing/child-in-chat-quota-exceeded.yaml - seeded Maestro flow tagged verify-at-e2e-run.

Excluded/untracked not staged:
- .workitem-artifacts/ - pre-existing/unrelated artifact directory.
- tmp-powershell-write-check.txt - scratch file from earlier write-check; deletion failed with access denied.

## Verification
Formatting:
- node node_modules/.pnpm/prettier@3.8.3/node_modules/prettier/bin/prettier.cjs --write -- apps/api/src/services/billing/billing-v2/quota-provision-v2.integration.test.ts apps/api/src/services/billing/billing-v2/family-v2.integration.test.ts apps/api/src/middleware/metering.integration.test.ts apps/api/src/services/test-seed.ts apps/api/src/services/test-seed.test.ts apps/mobile/src/components/session/QuotaExceededCard.test.tsx apps/mobile/src/app/(app)/session/index.test.tsx apps/mobile/src/app/(app)/subscription.test.tsx apps/mobile/e2e/flows/billing/child-in-chat-quota-exceeded.yaml - passed.
- git diff --check - passed.

Focused tests:
- node <jest@30.2.0>/node_modules/jest/bin/jest.js --config apps/api/jest.integration.config.cjs --runInBand apps/api/src/services/billing/billing-v2/quota-provision-v2.integration.test.ts apps/api/src/services/billing/billing-v2/family-v2.integration.test.ts apps/api/src/middleware/metering.integration.test.ts - 3 suites passed, 13 tests passed, 0 snapshots.
- node <jest@30.2.0>/node_modules/jest/bin/jest.js --config apps/api/jest.config.cjs --runInBand apps/api/src/services/test-seed.test.ts - 1 suite passed, 145 tests passed, 0 snapshots.
- node <jest@30.2.0>/node_modules/jest/bin/jest.js --config apps/mobile/jest.config.cjs --runInBand --no-coverage --runTestsByPath "apps/mobile/src/components/session/QuotaExceededCard.test.tsx" "apps/mobile/src/app/(app)/session/index.test.tsx" "apps/mobile/src/app/(app)/subscription.test.tsx" --forceExit - 3 suites passed, 127 tests passed, 0 snapshots.

Known test-run warnings:
- API integration Jest reported the existing open-handle warning after passing.
- Mobile Jest reported existing Expo native-module / EXPO_OS / React act warnings and required --forceExit for open handles.
- pnpm exec jest and pnpm exec prettier were unavailable in this worktree because .bin links were missing, so local package entrypoints were invoked directly.

Device/live-store verification:
- Maestro flow was added and tagged verify-at-e2e-run; not executed on a configured device.
- No RevenueCat sandbox/live purchase was executed or claimed.

## Red-green-revert evidence
1. Quota role resolution fault injection:
   - Temporary change: quota-provision-v2.ts returned owner for every membership role.
   - Command: node <jest@30.2.0>/node_modules/jest/bin/jest.js --config apps/api/jest.integration.config.cjs --runInBand apps/api/src/services/billing/billing-v2/quota-provision-v2.integration.test.ts.
   - Expected failure observed: 1 suite failed, 2 tests failed; child role resolved as owner and child provisioning used owner limits.
   - Reverted from HEAD; rerun passed 1 suite, 4 tests.

2. Metering decrement fault injection:
   - Temporary change: apps/api/src/services/billing/metering.ts changed profile quota monthly/daily increments from + 1 to + 0.
   - Command: node <jest@30.2.0>/node_modules/jest/bin/jest.js --config apps/api/jest.integration.config.cjs --runInBand --no-cache apps/api/src/middleware/metering.integration.test.ts.
   - Expected failure observed: 1 suite failed, 1 test failed; lazy-provisioned child row stayed at usedThisMonth=0 and usedToday=0 instead of 1.
   - Reverted from HEAD; rerun passed 1 suite, 2 tests.

3. Family archived-member fault injection:
   - Temporary change: removed isNull(person.archivedAt) filters from family-v2.ts.
   - Command: node <jest@30.2.0>/node_modules/jest/bin/jest.js --config apps/api/jest.integration.config.cjs --runInBand --no-cache apps/api/src/services/billing/billing-v2/family-v2.integration.test.ts.
   - Expected failure observed: 1 suite failed, 4 tests failed; archived/removed profiles appeared in list/count and over-cap status changed.
   - Reverted from HEAD; rerun passed 1 suite, 7 tests.

4. Top-up confirmation fault injection:
   - Temporary change: subscription.tsx changed topUpCreditsRemaining > baseCredits to >= baseCredits.
   - Command: node <jest@30.2.0>/node_modules/jest/bin/jest.js --config apps/mobile/jest.config.cjs --runInBand --no-coverage --runTestsByPath "apps/mobile/src/app/(app)/subscription.test.tsx" --testNamePattern "enters polling after top-up purchase" --forceExit.
   - Expected failure observed: 1 suite failed, 1 test failed; success alert fired on the unchanged-credit poll.
   - Reverted from HEAD; rerun passed 1 focused test.

## Acceptance criteria notes
- AC1 satisfied by real-DB quota-provision-v2 integration coverage and role-resolution/provisioning revert evidence.
- AC2 satisfied by live metering middleware coverage for absent child row, exact per-profile decrement, shared-pool non-decrement, and child 402 detail hygiene. Revert evidence covers exact decrement.
- AC3 satisfied by real-DB family-v2 integration coverage and archived-member revert evidence.
- AC4 headless code coverage satisfied; Maestro YAML added and tagged verify-at-e2e-run. Device execution not performed.
- AC5 satisfied by mobile top-up polling unit coverage and >= revert evidence.
- AC6 respected: no live RevenueCat purchase or sandbox confirmation claimed.

## Blocker details
- git -C C:/Dev/Projects/Products/Apps/eduagent-build/.worktrees/WI-1405 add -- <intended files> failed: fatal: Unable to create C:/Dev/Projects/Products/Apps/eduagent-build/.git/worktrees/WI-1405/index.lock: Permission denied.
- gh pr view WI-1405 --json number,url,state,title failed: proxyconnect tcp: dial tcp 127.0.0.1:9: connectex: No connection could be made because the target machine actively refused it.
- Because commit creation was blocked, push and PR creation were not possible from this executor.
