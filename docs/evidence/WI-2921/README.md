# WI-2921 local Playwright seed-secret evidence

Date: 2026-08-01  
Repository base: `3d5ae2ca67ebcb1ce55269f9b1ec0126c534e040`  
Original governed landing: `8a26201b90e503736427d3e1f6eb829dcad18dbf`

This is the durable, sanitized evidence for WI-2921 (Align local Playwright
seed secret with local API). It replaces the absent historical pointer
`.workitem-artifacts/WI-2833/local-run-record.md`.

No credential value, token, generated user identifier, database identifier, or
raw browser/server log is preserved here. The run used only ignored credential
files already present in the previously authorized local WI-2921 worktree. No
environment sync, credential fetch, shared database, staging, or production
target was used.

## Real local seeded Playwright proof

The host shell had unrelated ambient Clerk overrides. They were deliberately
unset so the local API's existing ignored configuration remained the single
identity source; no value was copied into the command.

```bash
env -u CLERK_SECRET_KEY -u CLERK_TESTING_TOKEN \
  pnpm exec playwright test \
  -c apps/mobile/playwright.config.ts \
  apps/mobile/e2e-web/flows/v2/returning-learner-resume.spec.ts \
  --project=v2-release \
  --workers=1 \
  --retries=0 \
  --reporter=line
```

Result: exit 0; `Running 4 tests using 1 worker`; `4 passed (1.7m)`.

The four executed cases were the three required local seeded setup cases
(`onboarding-complete`, `parent-multi-child`, and
`v2-account-non-owner-child`) plus the requested returning-learner browser
scenario. Before the tests, the local API health request returned 200, the
local reset endpoint returned 200, and the Expo web export reported ready.
This proves the standard local runner and local API completed seeded setup with
one aligned secret source, rather than only proving configuration discovery.

A first unprepared launch was refused before tests because the host's ambient
Clerk override did not match the existing local API identity. The refusal named
only the mismatched variable and disclosed no value. Removing that ambient
override produced the successful run above; no credential file was changed.

## Seed-source mutation proof

All three runs used the same command:

```bash
pnpm exec jest \
  --config apps/mobile/jest.config.cjs \
  apps/mobile/e2e-web/helpers/runtime.test.ts \
  --runInBand \
  --no-coverage
```

### 1. Baseline green

Unmodified source: exit 0; one suite passed; all five cases passed. The cases
cover local default, deferred import, explicit matching override, secret-safe
conflicting override refusal, and shared-mode isolation.

### 2. Deliberate disconnected-source mutation: red

Only the return value in `resolveTestSeedSecret` was temporarily changed:

```diff
-  return apiSecret;
+  return runnerSecret;
```

This recreates the defect: local default mode reads the API value but returns
the separately supplied runner value, which is absent in the standard flow.

Result: exit 1; one suite failed; one case failed and four passed. The exact
failing case was `uses the local API secret by default instead of requiring a
manual runner bridge`. Its expected seed header was present, but the mutated
implementation returned an empty header object. This is the required RED and
is specific to disconnected seed sources.

### 3. Exact restore: green

The one-line mutation was reversed exactly, restoring `return apiSecret`.

Result: exit 0; one suite passed; all five cases passed. A subsequent
`git diff --exit-code -- apps/mobile/e2e-web/helpers/runtime.ts` also exited 0,
confirming that no production mutation remains in this evidence-only branch.

## Focused compatibility verification

```bash
pnpm exec jest \
  --config apps/mobile/jest.config.cjs \
  apps/mobile/e2e-web/helpers/runtime.test.ts \
  apps/mobile/e2e-web/helpers/test-seed.test.ts \
  apps/mobile/e2e-web/helpers/clerk-secret-identity.test.ts \
  apps/mobile/e2e-web/helpers/global-setup.test.ts \
  --runInBand \
  --no-coverage
```

Result: exit 0; four suites passed; all 21 cases passed. This includes the
test-only remote-helper fixture repair recorded by FO-2087 and the later local
Clerk identity guard, alongside the WI-2921 seed-source contract.

## Scope conclusion

The committed change for this review bounce is this evidence document only.
Production code, test code, secret files, environment files, retry policy,
timeouts, quarantine, worker configuration, staging, and production are
unchanged.
