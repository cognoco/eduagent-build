# WI-2976 red-green-revert evidence

1. RED — capture-callback mutation: replacing the event-time capture callback with a no-op left both matching responses at zero early reads; the targeted test failed at `now-refresh-observation.test.ts:85` (`expected 1, received 0`) before any fallback read.
2. RED — fallback-selection mutation: forcing the settled path to discard the captured payload and perform the late fallback `readPayload(response)` caused the simulated released body to fail with `Network.getResponseBody: No data found`.
3. GREEN: restoring both event-time capture and captured-payload selection made the mutation run's focused helper suite pass, 23 tests; the final suite after adding the source contract test passes 24 tests, including the shared-predicate source contract, released-body freshness capture, rejection/abort, bounded non-settlement, hard-fail body disappearance, unmatched filtering, first-match-only capture, and listener cleanup cases.
4. REVERT: both mutations were restored before final validation; no production, API, schema, config, secret, or parallelism changes were made.

Commands:

- `pnpm exec jest apps/mobile/e2e-web/helpers/now-refresh-observation.test.ts --runInBand --no-cache -t "starts the body read"` — RED under the mutation.
- `pnpm exec jest apps/mobile/e2e-web/helpers/now-refresh-observation.test.ts --runInBand --no-cache -t "returns settled only after"` — RED under the fallback-selection mutation.
- `pnpm exec jest apps/mobile/e2e-web/helpers/now-refresh-observation.test.ts --runInBand --no-cache` — GREEN, 23 tests passed after restoration; final run with the source contract test: 24 passed.
