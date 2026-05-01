---
name: Playwright E2E setup and run commands
description: How to run Playwright web E2E tests — Doppler config, seed secret, Clerk token, common pitfalls
type: project
originSessionId: e2e6a319-a10e-4190-b5a0-3dcb2bd4434f
---
Playwright E2E tests live in `apps/mobile/e2e-web/` and run against the Expo web export.

## How to run

```bash
# Smoke tests (~1-2 min)
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web:smoke

# Full suite
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web
```

**Why:** `.dev.vars` (API secrets for wrangler dev) is generated from Doppler **stg** config via `pnpm env:sync`. The local Doppler default is **dev**. If you run `doppler run` without `-c stg`, the `TEST_SEED_SECRET` injected into the Playwright process won't match the one in `.dev.vars`, causing 403 on the `/__test/seed` endpoint.

**How to apply:** Always pass `-c stg` when running Playwright. If `.dev.vars` is missing or stale, run `pnpm env:sync` first.

## Key details

- Config: `apps/mobile/playwright.config.ts` — 5 projects (setup, smoke-auth, smoke-learner, smoke-parent, role-transitions, later-phases)
- Playwright auto-starts wrangler dev (port 8787) and Expo web export (port 19006)
- `CLERK_TESTING_TOKEN` is set to placeholder `"notsetyet"` in Doppler stg — tests work without it but Clerk may rate-limit sign-in. To fix: get token from Clerk Dashboard → API Keys → Testing Token, add to Doppler stg.
- Auth setup seeds users via `POST /v1/__test/seed` (requires `TEST_SEED_SECRET` header match), then signs in via Clerk and saves `storageState` JSON for downstream tests.
- 22 spec files, ~100 flow coverage. Plan: `docs/plans/2026-04-19-playwright-e2e-web-test-plan.md`
