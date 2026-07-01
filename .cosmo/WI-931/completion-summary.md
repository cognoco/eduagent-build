**What was done:**
- Strengthened WI-931 positive-path coverage for consent self-service.
- The legitimate self-service test now verifies the route forwards the expected profile/account/consent arguments into `requestConsent`, not merely that the service was called.

**What changed:**
- Changed `apps/api/src/routes/consent.test.ts`.
- In the `[BUG-791] legitimate self-service still works` case, replaced `expect(mockRequestConsent).toHaveBeenCalled()` with a `toHaveBeenCalledWith(...)` assertion covering:
  - mocked db argument (`undefined` in this route-unit harness),
  - `childProfileId: SIBLING_PROFILE_ID`,
  - `parentEmail: 'my-parent@example.com'`,
  - `consentType: 'GDPR'`,
  - API origin,
  - account id `test-account-id`,
  - audit payload shape with `policyVersion: undefined`.
- `apps/api/src/routes/consent.ts` was temporarily mutated only for red proof, then restored before commit; it has no final diff.

**Verification:**
- Red proof:
  - Command: `pnpm test:api:unit -- apps/api/src/routes/consent.test.ts -t 'legitimate self-service still works' --no-coverage`
  - Temporary mutation: changed the legacy route call from `requestConsent(db, input, ...)` to pass `{ ...input, childProfileId: account.id }`.
  - Output summary: failed as expected; assertion showed expected `childProfileId: a1111111-1111-4111-8111-111111111111` and received `childProfileId: test-account-id`.
- Focused green:
  - Command: `pnpm test:api:unit -- apps/api/src/routes/consent.test.ts -t 'legitimate self-service still works' --no-coverage`
  - Output summary: `Test Suites: 1 passed, 1 total`; `Tests: 48 skipped, 1 passed, 49 total`.
- Full consent route test file:
  - Command: `pnpm test:api:unit -- apps/api/src/routes/consent.test.ts --no-coverage`
  - Output summary: `Test Suites: 1 passed, 1 total`; `Tests: 49 passed, 49 total`.
- Lint:
  - Command: `pnpm exec eslint apps/api/src/routes/consent.test.ts`
  - Output summary: exit 0, no reported problems.
- Typecheck:
  - Command: `pnpm exec tsc --build apps/api/tsconfig.spec.json --pretty false`
  - Output summary: exit 0, no reported problems.
- Pre-push gate:
  - Command: `git push origin HEAD:WI-931`
  - Output summary: pre-push validation passed for 1 pushed file; `tsc --build passed`; related Jest run passed with `49 passed, 49 total`.
- Remote branch:
  - `origin/WI-931` points to `61c857e0d5390347f10d4ccfd716b6674e52d5c4`.

**Caveats / Follow-ups:**
- Known test-environment noise appeared during Jest runs: LLM provider warning, route logger output, ts-jest `esModuleInterop` warning, and Jest force-exit open-handle note from the existing harness.
- `apps/api/src/routes/consent.test.ts` still has 5 pre-existing internal `jest.mock` sites with `gc1-allow`; no new mocks were added. Removing the route-unit harness mocks is deferred because it would exceed WI-931 scope.
- Cosmo complete was not run, per coordinator instruction.
