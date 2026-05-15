---
name: Playwright E2E setup and run commands
description: How to run Playwright web E2E tests — Doppler config, seed secret, Clerk token, common pitfalls. OS-aware (macOS/Windows/Linux).
type: project
---
Playwright E2E tests live in `apps/mobile/e2e-web/` and run against the Expo web export.

## How to run

```bash
# macOS / Linux
doppler run -c stg -- pnpm run test:e2e:web:smoke   # smoke (~1-2 min)
doppler run -c stg -- pnpm run test:e2e:web          # full suite (~23 min)

# Windows (MSYS)
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web:smoke
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web
```

**Why:** `.dev.vars` (API secrets for wrangler dev) is generated from Doppler **stg** config via `pnpm env:sync`. The local Doppler default is **dev**. If you run `doppler run` without `-c stg`, the `TEST_SEED_SECRET` injected into the Playwright process won't match the one in `.dev.vars`, causing 403 on the `/__test/seed` endpoint.

**How to apply:** Always pass `-c stg` when running Playwright. If `.dev.vars` is missing or stale, run `pnpm env:sync` first.

## Key details

- Config: `apps/mobile/playwright.config.ts` — 5 projects (setup, smoke-auth, smoke-learner, smoke-parent, role-transitions, later-phases)
- Playwright auto-starts wrangler dev (port 8787) and Expo web export (port 19006)
- `CLERK_TESTING_TOKEN` is vestigial — Clerk's Backend API fetches a fresh short-lived token at runtime. The Doppler stg slot can be removed (Phase 0 / P4 decision).
- Auth setup seeds users via `POST /v1/__test/seed` (requires `TEST_SEED_SECRET` header match), then signs in via Clerk and saves `storageState` JSON for downstream tests.
- Baseline (2026-05-14): 31 tests, 15 pass / 13 fail / 3 flaky, 23m wall-clock at 1 worker. See `docs/audit/e2e/baseline-2026-05-14.md`.
