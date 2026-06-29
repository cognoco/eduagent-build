**What was done:**

- Added fail-fast native-build environment injection and validation to `.github/workflows/mobile-ci.yml` for `build-preview` and `build-manual`.
- Added `scripts/mobile-ci-public-env.test.ts` to pin the native build env contract and committed `eas.json` profile environment mappings.
- Hardened `configureRevenueCat()` so a missing production native RevenueCat key reports through the mobile Sentry wrapper instead of only logging.

**What changed:**

- Required native build env now covers the public client keys still required after WI-1046: Clerk, Sentry DSN, RevenueCat iOS, and RevenueCat Android.
- `EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1` was intentionally excluded because WI-1046 moved analytics hashing server-side; re-injecting it would reintroduce the client-secret exposure this batch already fixed.
- `apps/mobile/eas.json` now declares `environment` per build profile so EAS Build selects the intended EAS environment-variable set.

**Verification:**

- `pnpm exec jest --config scripts/jest.config.cjs --testMatch "**/mobile-ci-public-env.test.ts" --no-coverage --runInBand`
- `pnpm check:github-workflow-security`
- `pnpm exec jest --config apps/mobile/jest.config.cjs apps/mobile/src/lib/revenuecat.test.ts --no-coverage --runInBand`
- `pnpm exec eslint -c apps/mobile/eslint.config.mjs apps/mobile/src/lib/revenuecat.ts apps/mobile/src/lib/revenuecat.test.ts`
- `cd apps/mobile && pnpm exec tsc --noEmit`
- `git diff --check`
- Pre-commit hooks passed.
- Pre-push validation passed, including incremental `tsc --build`, related mobile Jest, and i18n checks.

**Caveats / Follow-ups:**

- The original WI acceptance criteria mentioned `EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1`, but that criterion is stale after WI-1046 and was corrected in this implementation.
- `actionlint` is not installed locally, so workflow validation used the repo's `check:github-workflow-security` guard plus the new YAML contract test.
- Mobile Jest/pre-push emitted existing Expo native-module, baseline-browser-mapping, and React `act(...)` warnings; all relevant commands exited 0.
