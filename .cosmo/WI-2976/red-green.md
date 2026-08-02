# WI-2976 red-green-revert evidence

1. RED: with event-time listener registration replaced by a no-op, the targeted test `starts the body read from the response event before Chromium can release it` failed because both matching responses produced zero early reads; the settled observation then rejected with `Network.getResponseBody: No data found` after simulated release.
2. GREEN: restoring event-time registration made the focused helper suite pass, including the released-body freshness capture, rejection/abort, bounded non-settlement, hard-fail body disappearance, unmatched filtering, first-match-only capture, and listener cleanup cases.
3. REVERT: the mutation was restored before final validation; no production, API, schema, config, secret, or parallelism changes were made.

Commands:

- `pnpm exec jest apps/mobile/e2e-web/helpers/now-refresh-observation.test.ts --runInBand --no-cache -t "starts the body read"` — RED under the mutation.
- `pnpm exec jest apps/mobile/e2e-web/helpers/now-refresh-observation.test.ts --runInBand --no-cache` — GREEN, 22 tests passed after restoration.
