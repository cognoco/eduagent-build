# Web E2E Runbook

These Playwright specs run the Expo web export against either the local API or the shared staging API. CI-equivalent staging runs must go through Doppler so the test seed secret is present.

## Commands

Shared staging full suite:

```bash
CI=1 PLAYWRIGHT_SKIP_LOCAL_API=1 E2E_ENV=staging \
  PLAYWRIGHT_API_URL="https://api-stg.mentomate.com" \
  EXPO_PUBLIC_API_URL="https://api-stg.mentomate.com" \
  EXPO_PUBLIC_ENABLE_MODE_NAV=true \
  EXPO_PUBLIC_ENABLE_MODE_NAV_V1=true \
  EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true \
  doppler run --project mentomate --config stg -- \
  pnpm run test:e2e:web --reporter=list,json
```

Target opt-in P1B coverage without retries:

```bash
CI=1 PLAYWRIGHT_SKIP_LOCAL_API=1 E2E_ENV=staging PLAYWRIGHT_INCLUDE_P1B=1 \
  PLAYWRIGHT_API_URL="https://api-stg.mentomate.com" \
  EXPO_PUBLIC_API_URL="https://api-stg.mentomate.com" \
  EXPO_PUBLIC_ENABLE_MODE_NAV=true \
  EXPO_PUBLIC_ENABLE_MODE_NAV_V1=true \
  EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true \
  doppler run --project mentomate --config stg -- \
  pnpm exec playwright test -c apps/mobile/playwright.config.ts \
  apps/mobile/e2e-web/flows/journeys/j20-vocabulary-quiz-answer-mapping.spec.ts \
  --project=later-phases --workers=1 --retries=0 --reporter=list
```

Local API mode starts `wrangler dev` unless `PLAYWRIGHT_SKIP_LOCAL_API=1` is set. The API server and Expo export are launched from `apps/mobile`, so `pnpm --dir ../api exec wrangler dev --port 8787` targets `apps/api` and `node e2e-web/helpers/serve-exported-web.mjs` serves `apps/mobile/dist`.

Before `expo export`, the web server rewrites `apps/mobile/.env.local` and `apps/mobile/.env.development.local` so the built web bundle uses the same API URL as the Playwright seed helpers. Set `PLAYWRIGHT_API_URL` to override it; `EXPO_PUBLIC_API_URL` is accepted as a fallback for compatibility. If neither is set, local mode uses `http://127.0.0.1:8787` and staging mode uses the default shared test API.

### Mentor Chrome audit registry smoke

Opt-in project that iterates over every `mentor-audit-*` seed scenario in
`fixtures/scenarios.ts`, seeds, signs in (or applies a storage-state mutator
for pre-shell entries), and asserts the documented `landingTestId` is
visible. Converts landing-route drift into a CI failure rather than letting
the audit silently go stale.

```bash
# Run on staging Cloudflare API (the canonical audit-re-run target)
CI=1 PLAYWRIGHT_SKIP_LOCAL_API=1 E2E_ENV=staging-cf \
  PLAYWRIGHT_API_URL="https://api-stg.mentomate.com" \
  EXPO_PUBLIC_API_URL="https://api-stg.mentomate.com" \
  EXPO_PUBLIC_ENABLE_MODE_NAV=true \
  EXPO_PUBLIC_ENABLE_MODE_NAV_V1=true \
  EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true \
  doppler run --project mentomate --config stg -- \
  pnpm exec playwright test -c apps/mobile/playwright.config.ts \
  --project=mentor-audit-registry-smoke --workers=1 --reporter=list
```

Release coverage should run with V2 enabled (`EXPO_PUBLIC_ENABLE_MODE_NAV`,
`EXPO_PUBLIC_ENABLE_MODE_NAV_V1`, and `EXPO_PUBLIC_ENABLE_MODE_NAV_V2` all
`true`). Historical V0/V1 matrix reruns are still useful before legacy-shell
changes, but they are not the publish gate for the V2 shell.

The smoke project is independent of `solo-learner` / `owner-with-children`
storage states; a single mentor-audit failure cannot poison the rest of the
suite.

On Windows, the static web wrapper bounds `expo export --platform web --clear`
with `PLAYWRIGHT_WEB_EXPORT_TIMEOUT_MS` before Playwright's generic
`webServer.timeout` fires. The default is 180000ms, below the Playwright
240000ms app-server wait, so a stalled cold export or warm retry should fail
with an Expo export preflight error instead of a raw webServer timeout. Raise the
export timeout only when collecting local evidence from an intentionally slow
machine; the wrapper still restores the temporary E2E env files and terminates
the export process tree before exiting.

## Safety

- Shared staging seed calls fail closed when `PLAYWRIGHT_TEST_SEED_SECRET` or `TEST_SEED_SECRET` is missing. Use Doppler config `stg`.
- Do not use port `19007` for staging web runs; staging CORS is configured for the default `http://127.0.0.1:19006`.
- Use `--retries=0` for suspected flakes before accepting a fix.
- Trace, video, and screenshot artifacts are retained on failure under `apps/mobile/e2e-web/test-results/`.

## Project Coverage

`apps/mobile/playwright.config.ts` groups specs by project:

| Project | Coverage |
| --- | --- |
| `setup` | Seeds shared auth states for solo learner and parent with children. |
| `smoke-auth` | Anonymous auth navigation and sign-up form smoke tests. |
| `smoke-learner` | Seeded learner home and UX crawl. |
| `smoke-parent` | Seeded parent home smoke. |
| `role-transitions` | Parent/child drill-down and back-chain journeys J04-J07. |
| `later-phases` | J08-J19 journey coverage, auth W03, and navigation W01-W05. |

J20 is opt-in P1B coverage for vocabulary answer mapping. Set `PLAYWRIGHT_INCLUDE_P1B=1` to select it under `later-phases`. It launches a vocabulary quiz from `language-subject-active` and asserts the `answerGiven` posted to `/quiz/rounds/:id/check` equals the exact option text tapped on web. Keep it out of the default project until it is stable inside the full serial staging run, then remove the env gate.

## Scenario Map

Useful seed scenarios that are not all fully covered yet:

| Scenario | Proposed journey | Primary assertion |
| --- | --- | --- |
| `quota-exceeded` | Learner hits usage limit from a learning action. | Paywall/error fallback uses typed recovery, not raw HTTP parsing. |
| `purchase-pending` | Subscription purchase pending state. | Pending UI blocks duplicate purchase and exposes a retry/status action. |
| `dictation-with-mistakes` | Dictation practice review. | Mistakes are shown with correction affordances. |
| `dictation-perfect-score` | Dictation perfect completion. | Success state awards completion without false error recovery. |
| `quiz-answer-check-fails` | Quiz answer-check API failure. | Non-blocking warning appears and round can continue. |
| `review-empty` | Empty review queue. | Review entry point shows the all-caught-up recovery path. |

When adding coverage, prefer direct route setup only when another journey already owns the navigation chain. Keep each new journey’s seed scenario, user path, and primary assertion in the spec header.
