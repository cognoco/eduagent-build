> **STATUS: ACTIVE** — P5 execution tracker. Updated as sub-packages complete.

# P5 — E2E Speed Execution Status

## Sub-packages

| ID | Name | Status | Notes |
|---|---|---|---|
| **P5a** | Web parallelism unlock (custom domain) | **DONE** | Committed `af471c49`. 23m → 11m at 2 workers. |
| **P5b** | Tiering — web + mobile lanes | DEFERRED | Needs P1 + M1 to define core/extended/full sets. |
| **P5c** | Mobile parallelism strategy | DEFERRED | Decision (multi-emulator / Maestro Cloud / accept-sequential) after M1. |

## P5a — What was done

### Cloudflare infrastructure (not in git)

- **Custom domain:** `api-test.mentomate.com` bound to `mentomate-api-stg` worker.
- **Mechanism:** Workers on `*.workers.dev` are subject to Cloudflare's platform-level rate-limiting that users cannot configure. The custom domain routes through the `mentomate.com` zone, which has no rate-limiting rules, bypassing the bottleneck.
- **Verified:** Cloudflare API confirmed zero WAF rules, zero rate-limit rules, zero Bot Fight Mode on `mentomate.com` zone (2026-05-14).
- **Note:** A WAF bypass secret (`E2E_WAF_BYPASS_SECRET`) was generated but turned out to be unnecessary — the custom domain alone eliminates rate-limiting. The secret was cleaned up from Doppler.

### Code changes (this PR)

1. **`apps/mobile/e2e-web/helpers/runtime.ts`** — When `PLAYWRIGHT_SKIP_LOCAL_API=1`, defaults API URL to `https://api-test.mentomate.com` instead of `http://127.0.0.1:8787`.
2. **`apps/mobile/e2e-web/helpers/serve-exported-web.mjs`** — Same default. Replaced async request handler with synchronous one to prevent crashes under concurrent load. Added stream error handling and `keepAliveTimeout=0`.
3. **`apps/mobile/playwright.config.ts`** — `usesSharedStagingApi` narrowed to URLs containing `.workers.dev` (custom domain gets full parallelism). Setup project set to `fullyParallel: false` (prevents concurrent seed Worker exceptions). Web server set to `reuseExistingServer: true`.

### Measured results

| Config | Wall-clock | Passed | Failed | Flaky | ERR_CONNECTION_REFUSED |
|---|---|---|---|---|---|
| Baseline: 1 worker, `*.workers.dev` | **23m 01s** | 15 | 13 | 3 | 0 |
| P5a: 2 workers, `api-test.mentomate.com` | **11m 13s** | 16 | 10 | 5 | 0 |

The 10 failures are a strict subset of the baseline's 13 — same real-bug/spec-drift issues (P1 scope). Three tests improved: j01-ux-pass, w05-tab-routes, j12-pre-profile.

### External server requirement

For multi-worker execution, the web bundle server (`serve-exported-web.mjs`) must be started **independently** of Playwright's webServer block. Playwright's stdio pipe management kills the server process mid-run when managing it directly with >1 worker.

Local multi-worker run command:
```bash
# Terminal 1: start server
PLAYWRIGHT_SKIP_LOCAL_API=1 doppler run --project mentomate --config stg -- \
  node apps/mobile/e2e-web/helpers/serve-exported-web.mjs &

# Wait for "Static Expo web preview ready on http://127.0.0.1:19006"

# Terminal 2: run tests (--retries and --workers are CLI overrides;
# do NOT set CI=1 — it would set reuseExistingServer=false and reject
# the already-running server)
PLAYWRIGHT_SKIP_LOCAL_API=1 doppler run --project mentomate --config stg -- \
  pnpm run test:e2e:web --retries=1 --workers=2
```

### CI impact

- **No CI changes in this PR.** CI continues to use the workers.dev URL explicitly.
- CI currently runs smoke only (9 tests, ~2 min) — the speed gain is marginal for smoke.
- CI workflow changes deferred to stage 2 when the full suite is promoted to CI.

## What's next

- **P5b** and **P5c** activate after P1 (web fix-everything) and M1 (mobile drift repair) complete.
- The full E2E uplift sequencing is: **Phase 0 → P5a (done) → P1 → M1 → P3 → P5b/P5c**.
- Planning docs (scope-proposal-2, baseline, P5 breakdown HTML) live on the `consistency` branch under `docs/audit/e2e/`.

## Dependencies for P5b/P5c

- P5b (tiering) needs: the tag registry from M1, the fixed spec set from P1, and a decision on core wall-clock cap (5 min web / 10 min mobile agreed).
- P5c (mobile parallelism) needs: M1 flow count + per-flow timing data, Maestro Cloud pricing, and a budget decision.
