## Completion Summary

**What was done:** Added deterministic coverage for the consent-gate preview and profile-switch eligibility surfaces ([ACCOUNT-32/38]), using the Chrome-intercept-seeded pattern established by WI-853 / PR #1242.

**What changed:** New Playwright journey `apps/mobile/e2e-web/flows/journeys/j23-consent-onboarding-states.spec.ts`; unit coverage in `apps/mobile/src/app/(app)/_lib/consent-gate-helpers.test.ts`; regression-manifest/inventory update in `docs/flows/mobile-app-flow-inventory.md`.

**Verification:** All required CI checks SUCCESS on the merged commit; claude-review check green (no blocking findings); no internal mocks added (real implementation exercised). Merged to main via PR #1247 (merge commit 14d420bf9).

**Caveats / Follow-ups:** Gates WI-857 (QA-02/15 manifest reconciliation), which is the terminal item of this coverage wave.
