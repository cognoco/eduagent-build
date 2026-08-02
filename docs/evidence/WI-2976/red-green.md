# WI-2976 red-green-revert evidence

Revision under test: PR head `e3941e042d331df605b8f76d41326858c0621cb5`.

1. RED — capture-callback mutation: replacing the event-time capture callback with a no-op left both matching responses at zero early reads; the targeted test failed at `apps/mobile/e2e-web/helpers/now-refresh-observation.test.ts:106` (`expected 1, received 0`). The full focused suite reported 1 failed, 23 passed, 24 total.
2. RED — fallback-selection mutation: forcing the settled path to discard the captured payload and perform the late fallback `readPayload(response)` caused the simulated released body to fail with `Network.getResponseBody: No data found`. The full focused suite reported 1 failed, 23 passed, 24 total.
3. GREEN — restoring both event-time capture and captured-payload selection made the full focused helper suite pass: 24 tests passed, 0 failed.
4. REVERT — both mutations were restored before final validation; no production, API, schema, config, secret, or parallelism changes were made.

Commands, each run with `pnpm exec jest apps/mobile/e2e-web/helpers/now-refresh-observation.test.ts --runInBand --no-cache`:

- RED — capture-callback no-op mutation: failed as above (1 failed, 23 passed).
- RED — fallback-selection mutation: failed as above (1 failed, 23 passed).
- GREEN/REVERT — restoration: passed (24 passed, 0 failed).
