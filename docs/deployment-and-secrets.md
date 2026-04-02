# Deployment & Secrets Guide

How CI/CD pipelines, secret management, and deployments work across all three environments.

## Architecture Overview

```
┌─────────────┐         ┌──────────────────┐        ┌─────────────────────┐
│   DOPPLER   │────────▶│  Local Dev Files │───────▶│  Your Machine       │
│  (secrets)  │         │  .dev.vars       │        │  wrangler dev       │
│             │         │  .env.local      │        │  expo start         │
└─────────────┘         └──────────────────┘        └─────────────────────┘

┌─────────────┐         ┌──────────────────┐        ┌─────────────────────┐
│  CLOUDFLARE │────────▶│  Workers Runtime │───────▶│  Staging / Prod API │
│  (secrets)  │         │  env bindings    │        │  mentomate-api-stg  │
└─────────────┘         └──────────────────┘        │  mentomate-api-prd  │
                                                    └─────────────────────┘
```

**Key distinction:** Doppler is the single source of truth for all secrets. Local dev files are generated automatically on `pnpm install`. For Cloudflare Workers (dev/staging/production), secrets are synced from Doppler via `pnpm secrets:sync` — there is no auto-sync integration between Doppler and Cloudflare Workers.

---

## 1. Development (Local)

### Trigger

No CI/CD pipeline. Everything runs locally on your machine.

### How secrets get there

```
pnpm install  →  postinstall hook  →  scripts/setup-env.js  →  Doppler CLI
                                          │
                                          ├─ writes local files (.dev.vars, .env.local, etc.)
                                          ├─ updates apps/mobile/eas.json (EXPO_PUBLIC_* for all build profiles)
                                          └─ syncs dev secrets to Cloudflare Worker (via sync-secrets.js)
```

The `setup-env.js` script runs automatically after `pnpm install` (or manually via `pnpm env:sync`):

1. Checks: Are we in CI? Is Doppler CLI installed? Is the project configured?
2. Runs: `doppler secrets download --config dev --no-file --format env`
3. Writes **three files** (all `.gitignored`, mode `0o600`):

| File | Purpose | Contents |
|------|---------|----------|
| `.env.development.local` (root) | DB scripts, general config | Full config |
| `apps/api/.dev.vars` | Wrangler local dev server | Full config |
| `apps/mobile/.env.local` | Expo dev client | Filtered to `EXPO_PUBLIC_*` only |

4. Updates **one committed file** — `apps/mobile/eas.json`:

| Build Profile | Doppler Config | Contents |
|---------------|----------------|----------|
| `development` | `dev` | `EXPO_PUBLIC_*` + `SENTRY_DISABLE_AUTO_UPLOAD` |
| `preview` | `stg` | `EXPO_PUBLIC_*` + `SENTRY_DISABLE_AUTO_UPLOAD` |
| `production` | `prd` | `EXPO_PUBLIC_*` + `SENTRY_DISABLE_AUTO_UPLOAD` |

   Gracefully skips profiles if the developer lacks access to that Doppler config. Only writes if content changed (avoids git noise). Commit eas.json after running `pnpm env:sync` if values changed.

5. Calls `sync-secrets.js` to sync dev secrets to the `mentomate-api-dev` Cloudflare Worker (non-fatal — skips if wrangler not authenticated)

The script has a **7-day staleness check** — if local files are older than 7 days, it re-downloads automatically.

### Where secrets live at runtime

- **API:** `wrangler dev` reads `apps/api/.dev.vars` and injects values as `env` bindings in Hono handlers. Config is validated at startup by `apps/api/src/config.ts` (Zod schema).
- **Mobile:** Expo reads `apps/mobile/.env.local` and exposes `EXPO_PUBLIC_*` vars via `process.env`.

### Worker name

`mentomate-api-dev` (default environment in `wrangler.toml`)

---

## 2. Staging

### Trigger

**Every push to `main`** automatically triggers `.github/workflows/deploy.yml`.

### Pipeline steps

```
Push to main
    │
    ▼
┌─────────────────────────────────────────┐
│  api-quality-gate                       │
│  ├─ Spins up PostgreSQL 16 (test DB)    │
│  ├─ pnpm install + db:push (test DB)   │
│  ├─ Lint (nx run api:lint)             │
│  ├─ Typecheck (nx run api:typecheck)   │
│  ├─ Unit tests (nx run api:test)       │
│  └─ Integration tests (api:test:integ) │
└──────────────┬──────────────────────────┘
               │ all pass
               ▼
┌─────────────────────────────────────────┐
│  api-deploy                             │
│  ├─ environment: staging (auto-approve) │
│  ├─ nx run api:build                   │
│  └─ wrangler deploy --env staging      │
│     → deploys "mentomate-api-stg"      │
└─────────────────────────────────────────┘
```

### How secrets get there

Secrets come from **three sources**:

1. **Non-sensitive vars** — committed in `wrangler.toml` under `[env.staging.vars]`:
   ```toml
   ENVIRONMENT = "staging"
   APP_URL = "https://staging.mentomate.com"
   LOG_LEVEL = "debug"
   EMAIL_FROM = "staging-noreply@mentomate.com"
   ```

2. **Sensitive secrets** — synced from Doppler `stg` config to Cloudflare Workers via `pnpm secrets:sync stg`. Stored as Workers Secrets on the `mentomate-api-stg` worker.

3. **GitHub Actions secret** — only `CLOUDFLARE_API_TOKEN` is needed to authenticate `wrangler deploy`.

### Approval gate

**None.** If the quality gate passes, staging deploys automatically. This is intentional for fast iteration.

### Concurrency

`concurrency: deploy-${{ github.ref }}` with `cancel-in-progress: false` — only one deploy runs at a time, and in-progress deploys are not cancelled.

### Worker name

`mentomate-api-stg`

### KV namespaces

| Binding | Namespace ID |
|---------|-------------|
| `SUBSCRIPTION_KV` | `8cbb6e486dc64f80acb0214b7fc84e25` |
| `COACHING_KV` | `cbed5036c909416487c3b9362da521d0` |

---

## 3. Production

### Trigger

**Manual dispatch only** — go to GitHub Actions → `deploy.yml` → "Run workflow" and select `api_environment: production`.

### Pipeline steps

```
Manual dispatch (api_environment=production)
    │
    ▼
┌─────────────────────────────────────────┐
│  api-quality-gate                       │
│  (same as staging — full test suite)    │
└──────────────┬──────────────────────────┘
               │ all pass
               ▼
┌─────────────────────────────────────────┐
│  api-confirm-production                 │
│  ├─ environment: production             │
│  ├─ GitHub Environment protection rule  │
│  └─ WAITS for manual approval           │
│     (click "Approve" in GitHub UI)      │
└──────────────┬──────────────────────────┘
               │ approved
               ▼
┌─────────────────────────────────────────┐
│  api-deploy                             │
│  ├─ nx run api:build                   │
│  └─ wrangler deploy --env production   │
│     → deploys "mentomate-api-prd"      │
└─────────────────────────────────────────┘
```

### How secrets get there

Same pattern as staging:

- **`[env.production.vars]`** in `wrangler.toml`: `APP_URL=https://app.mentomate.com`, `LOG_LEVEL=info`, `EMAIL_FROM=noreply@mentomate.com`
- **Workers Secrets**: synced from Doppler `prd` config via `pnpm secrets:sync prd`

### Runtime safety net

`apps/api/src/config.ts` enforces **production-required keys** — if any are missing at startup, the worker throws and refuses to start:

- `CLERK_SECRET_KEY`
- `CLERK_JWKS_URL`
- `GEMINI_API_KEY`
- `VOYAGE_API_KEY`
- `RESEND_API_KEY`
- `REVENUECAT_WEBHOOK_SECRET`

### Approval gate

**Double gate:**
1. GitHub Environment `production` protection rule requires manual approval
2. Quality gate must pass first (lint + typecheck + unit + integration tests)

### Worker name

`mentomate-api-prd`

### KV namespaces

| Binding | Namespace ID |
|---------|-------------|
| `SUBSCRIPTION_KV` | `cde9f81f19a34022b6dc6951928a0511` |
| `COACHING_KV` | `76b36f4748fe4d77b27387a5bebf4be6` |

---

## Database Schema Rollouts

Cloudflare Worker deploys do **not** update the Neon schema. New columns,
tables, indexes, or constraints must be applied to the target database
separately from `wrangler deploy`.

### What each command is for

- **Dev / ephemeral CI databases:** `db:push` is fine for fast schema sync.
- **Staging / production:** use committed migration SQL plus `db:migrate`.
- **Important:** a green API build or mobile build does **not** mean the target
  Neon database is ready for the new code.

### Current workflow caveat

`.github/workflows/deploy.yml` validates the API against an ephemeral Postgres
service, but it does **not** currently apply staging or production migrations
to the real Neon database. Until that is automated, treat DB migration as a
required manual release step.

### Release checklist when schema changes

1. Generate and commit the migration SQL under `apps/api/drizzle/`.
2. Point `DATABASE_URL` at the target environment and run
   `pnpm --filter @eduagent/database db:migrate`.
3. Deploy the API worker with `wrangler deploy`.
4. Rebuild or at least re-test the mobile app if the API contract changed.
5. Check Sentry and the affected API route immediately after rollout for
   `column "... does not exist"` or similar schema drift errors.

---

## Mobile Builds (APK / AAB)

### How mobile and API deployments relate

The mobile app (APK/AAB) and the API backend (Cloudflare Worker) are **completely independent deployments**. Building an APK does **not** deploy the API. The APK just has the API URL baked in at build time — it's a static string.

```
┌─────────────────────┐          ┌─────────────────────┐
│  MOBILE BUILD (APK) │          │  API DEPLOY          │
│  Built by EAS       │          │  Deployed by Wrangler│
│  Runs on your phone │───HTTP──▶│  Runs on Cloudflare  │
│  Has API URL baked in│          │  Serves the backend  │
└─────────────────────┘          └─────────────────────┘
      These are separate.
      Building an APK does NOT deploy the API.
```

This means:
- You can build a new APK without touching the API
- You can deploy a new API version without rebuilding the APK
- **You must coordinate them manually** — if the API adds a new required field, the APK must be rebuilt to send it

### APK vs AAB — what goes to the store?

The APK you install on your phone for testing is **not** what gets uploaded to the stores.

| | **APK** (Android Package) | **AAB** (Android App Bundle) | **IPA** (iOS) |
|---|---|---|---|
| **What** | Complete, ready-to-install package | Intermediate format — Google builds optimized APKs from it | iOS app archive |
| **EAS profile** | `preview` | `production` | `production` |
| **Install** | Sideload directly onto device | Upload to Google Play Console | Upload to App Store Connect |
| **Size** | Full app, all architectures included | Smaller per-device (Google strips unused code/assets) | Optimized by Apple |
| **Signing** | Debug or ad-hoc key | Upload key (Google re-signs with app signing key) | Distribution certificate |
| **Use case** | Internal testing, QA | **Google Play submission** | **App Store submission** |

**Google Play requires AAB** (since August 2021) — APK uploads are rejected for new apps. The AAB lets Google use "Dynamic Delivery" to serve only the code and resources each device needs, reducing download size by ~15-20%.

**Apple App Store requires IPA** — EAS handles this format automatically when building for iOS.

```
Testing flow:       eas build --profile preview    → APK  → sideload to phone
Store submission:   eas build --profile production → AAB  → Google Play Console
                                                   → IPA  → App Store Connect
```

After a successful production build, `eas submit` can automatically upload the AAB/IPA to the respective store — but both store accounts must be active first (currently blocked: Apple enrollment pending, Google Play account under review).

### Build profiles (`apps/mobile/eas.json`)

| Profile | Output | Distribution | Use Case |
|---------|--------|-------------|----------|
| `development` | Dev client | Internal | Local development with hot reload |
| `preview` | APK (direct install) | Internal | Testing on real devices, QA |
| `production` | AAB / IPA | Store | Google Play / App Store submission |

### How to trigger a build

There are **two ways** to build, with different approval gates:

#### 1. From your terminal (no approval gate)

```bash
eas build --profile preview --platform android      # APK for testing
eas build --profile production --platform android    # AAB for store
```

This goes directly to EAS Build servers — **no GitHub Actions involved, no approval gate**. You authenticate with your Expo account (or `EXPO_TOKEN`).

**Monorepo guardrail:** run Expo bundle/export commands from `apps/mobile`
(or set an explicit entry file rooted there). Running `expo export:embed`
from the repository root can make Expo fall back to its default `AppEntry.js`
and try to resolve a nonexistent repository-root `App`.

#### 2. From GitHub Actions (approval gate for production)

Trigger `deploy.yml` manually with `mobile_profile: production`. This runs through the GitHub workflow which includes the `mobile-confirm-production` job — requiring manual approval via GitHub Environment protection rules.

```
Terminal:  eas build ──────────────────▶ EAS Build servers ──▶ APK/AAB
                                        (no gate)

GitHub:    deploy.yml ──▶ approval ──▶ EAS Build servers ──▶ APK/AAB
                          (gate)
```

**In practice:** Running `eas build` from your terminal skips all CI gates. For production store submissions, use the GitHub workflow to enforce the approval step.

### What gets baked into the build

Mobile builds contain **no server secrets**. Only public config is included, synced from Doppler into `eas.json` by `scripts/setup-env.js`:

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_API_URL` | Which backend the app talks to |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Auth (safe to expose — publishable key) |
| `EXPO_PUBLIC_SENTRY_DSN` | Error reporting (safe to expose) |
| `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` | RevenueCat iOS (safe to expose — public API key) |
| `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID` | RevenueCat Android (safe to expose — public API key) |
| `SENTRY_DISABLE_AUTO_UPLOAD` | Build-time flag (disables Sentry source map upload) |

These values are synced from Doppler (dev/stg/prd configs) into the corresponding `eas.json` build profiles (development/preview/production) by `pnpm env:sync`. Since `eas.json` is committed, run `pnpm env:sync` and commit the result after changing values in Doppler.

The only GitHub secret needed for CI-triggered builds is `EXPO_TOKEN` (authenticates `eas build`).

### API URL mapping

Each EAS build profile points to the correct environment-specific Cloudflare Worker:

| EAS Profile | Worker | URL |
|-------------|--------|-----|
| `preview` | `mentomate-api-stg` | `https://mentomate-api-stg.zwizzly.workers.dev` |
| `production` | `mentomate-api-prd` | `https://mentomate-api-prd.zwizzly.workers.dev` |

The fallback URL in `apps/mobile/src/lib/api.ts` (used when no env var is set in a non-dev build) also points to the staging worker.

### Local development

For local dev, `expo start` reads `apps/mobile/.env.local` (generated by Doppler via `scripts/setup-env.js`). This typically points to `http://localhost:8787` (your local wrangler dev server) or the dev worker URL.

### Auto-builds on push to main

`mobile-ci.yml` automatically builds a `preview` APK when mobile-related files change on push to main. This is for internal testing distribution only — not store submission.

### Post-release Sentry triage

Use these heuristics before assuming a fresh code regression:

- `column "... does not exist"` usually means schema drift first, not mobile UI.
- `Invalid key provided to SecureStore` means the key format is invalid.
  `expo-secure-store` keys must use only alphanumeric characters, `.`, `-`,
  and `_`.
- `CustomTabsConnectionHelper` / `Service not registered` usually means Android
  Custom Tabs was unavailable and browser prewarm cleanup was not guarded.
- Resolve old issue groups only after verifying them on the newest build or
  latest deployed API.

---

## Secrets Inventory

All secrets managed in Doppler (project: `mentomate`, configs: `dev` / `stg` / `prd`):

| Category | Secret | Required in Prod? |
|----------|--------|:-:|
| **Core** | `DATABASE_URL` | Yes (implicit) |
| **Auth (Clerk)** | `CLERK_SECRET_KEY` | Yes |
| | `CLERK_PUBLISHABLE_KEY` | No |
| | `CLERK_JWKS_URL` | Yes |
| | `CLERK_AUDIENCE` | No |
| **LLM** | `GEMINI_API_KEY` | Yes |
| | `VOYAGE_API_KEY` | Yes |
| **Email** | `RESEND_API_KEY` | Yes |
| **Payments** | `REVENUECAT_WEBHOOK_SECRET` | Yes |
| | `STRIPE_SECRET_KEY` | No (dormant) |
| | `STRIPE_WEBHOOK_SECRET` | No (dormant) |
| | `STRIPE_PRICE_*` (6 keys) | No (dormant) |
| | `STRIPE_CUSTOMER_PORTAL_URL` | No (dormant) |
| **Background Jobs** | `INNGEST_SIGNING_KEY` | No |
| | `INNGEST_EVENT_KEY` | No |
| **Observability** | `SENTRY_DSN` | No |
| **Testing** | `TEST_SEED_SECRET` | No (dev/staging only) |

GitHub Actions secrets (set in GitHub, not Doppler):

| Secret | Used By |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | `deploy.yml` — authenticates `wrangler deploy` |
| `EXPO_TOKEN` | `deploy.yml`, `mobile-ci.yml` — authenticates EAS CLI |
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude.yml`, `claude-code-review.yml` — AI review |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `e2e-ci.yml` — Clerk auth in E2E tests |

---

## Syncing Secrets from Doppler to Cloudflare Workers

Doppler does **not** have a native auto-sync integration for Cloudflare Workers. Secrets are pushed manually using `scripts/sync-secrets.js`, which downloads from Doppler and uploads via `wrangler secret bulk`.

### Commands

```bash
pnpm secrets:sync           # Sync all environments (dev, stg, prd)
pnpm secrets:sync dev       # Sync dev only
pnpm secrets:sync stg       # Sync staging only
pnpm secrets:sync prd       # Sync production only
pnpm env:sync               # Local files + dev Worker sync (also runs on pnpm install)
```

### When to run

- **After changing a secret in Doppler** — run `pnpm secrets:sync <env>` for the affected environment(s)
- **After changing an `EXPO_PUBLIC_*` var in Doppler** — run `pnpm env:sync`, then commit the updated `eas.json`
- **After first clone** — `pnpm install` automatically syncs dev; run `pnpm secrets:sync stg prd` for staging/production
- **Before first production deploy** — verify all production-required keys are set

### What gets filtered out

The sync script excludes keys that are not consumed by Cloudflare Workers:

| Excluded | Reason |
|----------|--------|
| `DOPPLER_*` | Doppler metadata (injected automatically, not real secrets) |
| `EXPO_*` | Mobile-only config (baked into EAS builds, not Workers) |
| `CLOUDFLARE_*` | CI/CD tokens (used by GitHub Actions, not by the Worker runtime) |
| `SENTRY_AUTH_*` | Build-time tokens (source map upload, not runtime) |
| Empty values (`""`) | Doppler placeholders — would fail Zod `.min(1)` validation |

### Prerequisites

- Doppler CLI installed and authenticated (`doppler login`)
- Wrangler CLI authenticated (`pnpm exec wrangler login`)
- Doppler project configured (`doppler setup` → project: `mentomate`)

If wrangler is not authenticated, the sync skips gracefully (does not break `pnpm install`).

---

## CI Workflows Reference

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| **CI** | `ci.yml` | Push to main, PRs | Lint + typecheck + test + build (all projects) |
| **Deploy** | `deploy.yml` | Push to main, manual dispatch | API deploy (staging/prod) + mobile builds |
| **Mobile CI** | `mobile-ci.yml` | PRs/push touching mobile paths, manual | Mobile lint + test + preview builds |
| **E2E** | `e2e-ci.yml` | Push/PR (relevant paths), nightly cron, manual | Integration tests + Maestro E2E flows |
| **Code Review** | `claude-code-review.yml` | PRs | AI-assisted code review |

---

## Summary Table

### API (Cloudflare Workers)

| | **Development** | **Staging** | **Production** |
|---|---|---|---|
| **Trigger** | Manual (local) | Push to `main` | Manual dispatch + approval |
| **Secret source** | Doppler → local files + Worker | Doppler → Worker via sync script | Doppler → Worker via sync script |
| **Secret truth** | Doppler `dev` config | Doppler `stg` config | Doppler `prd` config |
| **Sync command** | `pnpm env:sync` (auto on install) | `pnpm secrets:sync stg` | `pnpm secrets:sync prd` |
| **Approval gate** | None | None (auto after tests) | GitHub Environment rule |
| **Worker name** | `mentomate-api-dev` | `mentomate-api-stg` | `mentomate-api-prd` |
| **Config validation** | Zod parse (lenient) | Zod parse (lenient) | Zod + required keys check |
| **Deploy command** | `wrangler dev` | `wrangler deploy --env staging` | `wrangler deploy --env production` |

### Mobile (EAS Build)

| | **Development** | **Preview** | **Production** |
|---|---|---|---|
| **Trigger** | `expo start` (local) | Push to main (auto) or `eas build` (local) | `eas build` (local) or `deploy.yml` (GitHub) |
| **Output** | Dev client | APK (direct install) | AAB (App Bundle for stores) |
| **Config source** | `.env.local` from Doppler | `eas.json` (synced from Doppler) | `eas.json` (synced from Doppler) |
| **Approval gate** | None | None | Only if via GitHub workflow |
| **Distribution** | Local device | Internal (testers) | App Store / Google Play |
| **Contains secrets?** | No (public vars only) | No (public vars only) | No (public vars only) |

---

## Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/deploy.yml` | API + mobile deployment orchestration |
| `.github/workflows/ci.yml` | Main CI pipeline |
| `.github/workflows/mobile-ci.yml` | Mobile CI and preview builds |
| `.github/workflows/e2e-ci.yml` | E2E testing infrastructure |
| `apps/api/wrangler.toml` | Cloudflare Workers config, KV namespaces, env vars |
| `apps/api/src/config.ts` | Runtime env var validation (Zod schema) |
| `apps/mobile/eas.json` | EAS build profiles and public env vars |
| `scripts/setup-env.js` | Doppler → local files + eas.json env sync + dev Worker sync (postinstall hook) |
| `scripts/sync-secrets.js` | Doppler → Cloudflare Workers secret sync (all environments) |
