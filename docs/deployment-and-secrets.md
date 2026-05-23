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
│  (secrets)  │         │  env bindings    │        │  custom domains     │
└─────────────┘         └──────────────────┘        │  api*.mentomate.com │
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
│  ├─ pnpm install + db:migrate (test DB)│
│  ├─ Lint (nx run api:lint)             │
│  ├─ Typecheck (nx run api:typecheck)   │
│  └─ Push-to-main skips unit/integration │
│     here because PR CI already ran them │
└──────────────┬──────────────────────────┘
               │ all pass
               ▼
┌─────────────────────────────────────────┐
│  api-deploy                             │
│  ├─ environment: staging (auto-approve) │
│  ├─ nx run api:build                   │
│  ├─ verify DB target + db:migrate      │
│  └─ wrangler deploy --env staging      │
│     → deploys "mentomate-api-stg"      │
└─────────────────────────────────────────┘
               │ deployed
               ▼
┌─────────────────────────────────────────┐
│  api-smoke-test                         │
│  └─ GET https://api-stg.mentomate.com   │
│     /v1/health plus auth route checks   │
└─────────────────────────────────────────┘
```

### How secrets get there

Secrets come from **three sources**:

1. **Non-sensitive vars** — committed in `wrangler.toml` under `[env.staging.vars]`:
   ```toml
   ENVIRONMENT = "staging"
   APP_URL = "https://www.mentomate.com"
   API_ORIGIN = "https://api-stg.mentomate.com"
   LOG_LEVEL = "warn"
   EMAIL_FROM = "staging-noreply@mentomate.com"
   ```

2. **Sensitive secrets** — synced from Doppler `stg` config to Cloudflare Workers via `pnpm secrets:sync stg`. Stored as Workers Secrets on the `mentomate-api-stg` worker.

3. **GitHub Actions secrets** — `CLOUDFLARE_API_TOKEN` authenticates `wrangler deploy`, `DATABASE_URL_STAGING` is used for staging migrations, and `DOPPLER_TOKEN_STG` syncs Doppler secrets to the staging Worker before the deploy. `deploy.yml` hard-fails if `DOPPLER_TOKEN_STG` is unset (unless `SKIP_DOPPLER_SYNC` is set after a local sync). Same pattern for production with `DOPPLER_TOKEN_PRD`.

### Approval gate

**None.** If the quality gate passes, staging deploys automatically. This is intentional for fast iteration.

### Concurrency

`concurrency: deploy-${{ github.ref }}` with `cancel-in-progress: false` — only one deploy runs at a time, and in-progress deploys are not cancelled.

### Worker name

`mentomate-api-stg`

### Public URL

`https://api-stg.mentomate.com`

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
│  ├─ verify DB target + db:migrate      │
│  └─ wrangler deploy --env production   │
│     → deploys "mentomate-api-prd"      │
└─────────────────────────────────────────┘
               │ deployed
               ▼
┌─────────────────────────────────────────┐
│  api-production-smoke-test              │
│  └─ GET https://api.mentomate.com       │
│     /v1/health                          │
└─────────────────────────────────────────┘
```

### How secrets get there

Same pattern as staging:

- **`[env.production.vars]`** in `wrangler.toml`: `APP_URL=https://www.mentomate.com`, `API_ORIGIN=https://api.mentomate.com`, `LOG_LEVEL=info`, `EMAIL_FROM=noreply@mentomate.com`
- **Workers Secrets**: synced from Doppler `prd` config via `pnpm secrets:sync prd`
- **GitHub Actions secret**: `DATABASE_URL_PRODUCTION` is used for production migrations in `deploy.yml`

### Runtime safety net

`apps/api/src/config.ts` enforces a two-tier required-keys check at startup:

**Staging and production required keys** (missing → worker throws in both staging and production):

- `CLERK_SECRET_KEY`
- `CLERK_JWKS_URL`
- `CLERK_AUDIENCE`
- `INNGEST_SIGNING_KEY`
- `INNGEST_EVENT_KEY`

**Production-only required keys** (missing → worker throws in production only):

- `GEMINI_API_KEY`
- `VOYAGE_API_KEY`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `API_ORIGIN`
- `REVENUECAT_WEBHOOK_SECRET`

Production also requires the `IDEMPOTENCY_KV` binding unless Doppler `prd`
explicitly sets `ALLOW_MISSING_IDEMPOTENCY_KV=true` as a temporary prelaunch
override. Without the binding or override, env validation returns a 500 before
serving traffic.

Clerk session tokens should include `email` and may include `email_verified`
for the account-middleware fast path. If either claim is missing or stale, the
API verifies the primary email through Clerk's Backend API using
`CLERK_SECRET_KEY`; this prevents a Clerk session-token template drift from
blocking all signed-in users.

### Approval gate

**Double gate:**
1. GitHub Environment `production` protection rule requires manual approval
2. Quality gate must pass first (lint + typecheck + unit + integration tests)

### Worker name

`mentomate-api-prd`

### Public URL

`https://api.mentomate.com`

### KV namespaces

| Binding | Namespace ID |
|---------|-------------|
| `SUBSCRIPTION_KV` | `cde9f81f19a34022b6dc6951928a0511` |
| `COACHING_KV` | `76b36f4748fe4d77b27387a5bebf4be6` |

---

## Database Schema Rollouts

Cloudflare Worker deploys do **not** update the Neon schema by themselves.
The GitHub deploy workflow applies committed migrations to the selected target
database before `wrangler deploy`; direct local `wrangler deploy` does not.

### What each command is for

- **Dev / ephemeral CI databases:** `db:push` is fine for fast schema sync.
- **Staging / production:** use committed migration SQL plus `db:migrate`.
- **Important:** a green API build or mobile build does **not** mean the target
  Neon database is ready for the new code.

### Current workflow

`.github/workflows/deploy.yml` validates committed migration SQL against an
ephemeral Postgres service, verifies the target Neon host, baselines the
migration journal when needed, and then runs `drizzle-kit migrate` against the
selected staging or production database before deploying the Worker.

### Release checklist when schema changes

1. Generate and commit the migration SQL under `apps/api/drizzle/`.
2. Prefer `.github/workflows/deploy.yml`, which applies the target migration
   before deploying the Worker.
3. If deploying outside the workflow, point `DATABASE_URL` at the target
   environment and run `pnpm --filter @eduagent/database db:migrate`.
4. **Verify migration succeeded** before proceeding — new columns must exist
   before the Workers bundle that references them is deployed. A deploy-first
   ordering causes `column "..." does not exist` 500s on every affected route.
5. Deploy the API worker with `wrangler deploy`.
6. Rebuild or at least re-test the mobile app if the API contract changed.
7. Check Sentry and the affected API route immediately after rollout for
   `column "... does not exist"` or similar schema drift errors.

### Known migration-to-code dependencies

| Migration | Column | Code that fails without it |
|-----------|--------|---------------------------|
| `0006_watery_birth_year.sql` | `profiles.birth_year` | `profileScopeMiddleware` → `ProfileMeta.birthYear`, LLM context injection, Sentry age-gating, consent checks |
| `0069_learning_profile_celebration_level.sql` | `learning_profiles.celebration_level` | `getChildCelebrationLevel`, `upsertChildCelebrationLevel` in `services/settings.ts` — parent-controlled per-child celebration preference |

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

After a successful production build, `eas submit` can upload the AAB/IPA to the respective store. Apple Developer and Google Play access is available as of 2026-05-15; the remaining work is to create the App Store Connect / Play Console app records and provide the real submit metadata.

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

Mobile builds contain **no server secrets**. Public config splits between two sinks: non-secret identifiers live in the committed `eas.json`, while client-side secrets (publishable keys, DSNs, store API keys) live in **EAS Environment Variables** and are injected at build time by EAS Build.

> **BUG-235 / BUG-345 (2026-05-20):** Until 2026-05-20, the Clerk publishable key and Sentry DSN were hardcoded in committed `eas.json` — including the **production** `pk_live_*` Clerk key and prod Sentry DSN. They have been removed from the committed file, and `scripts/setup-env.js` now strips them on every sync via `EAS_JSON_DENYLIST`. **The leaked production Clerk publishable key and Sentry DSN must be rotated before the next production build.** See the "Rotating leaked client secrets" section below.

#### Sink 1 — Committed `eas.json` (non-secret identifiers only)

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_API_URL` | Which backend the app talks to (public URL) |
| `SENTRY_DISABLE_AUTO_UPLOAD` | Build-time flag (disables Sentry source map upload) |

These are synced from Doppler (`stg` → development/preview, `prd` → production) into `eas.json` by `pnpm env:sync`. Since `eas.json` is committed, run `pnpm env:sync` and commit the result after changing values in Doppler. `scripts/setup-env.js` filters out any key in `EAS_JSON_DENYLIST` (see Sink 2), so legacy secret entries get stripped on the next run.

#### Sink 2 — EAS Environment Variables (client-side secrets)

These are **not** in the committed `eas.json`. They are stored as EAS Environment Variables on the Expo project and injected by EAS Build at build time. They are still publishable (mobile bundles are reverse-engineerable), but keeping them out of git avoids accidental rotation pain and limits blast radius if a fork or leak occurs.

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Auth (publishable key — still public, but rotated independently of git history) |
| `EXPO_PUBLIC_SENTRY_DSN` | Error reporting (DSN is public but quota-bearing) |
| `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` | RevenueCat iOS (public API key) |
| `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID` | RevenueCat Android (public API key) |

##### Setting EAS Environment Variables

Run these commands once per project (or after rotating a secret). They cover 4 secrets × 3 environments = 12 entries:

```bash
# Production
eas env:create --environment production --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value '<pk_live_…>' --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN --value '<https://…sentry.io/…>' --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_API_KEY_IOS --value '<appl_…>' --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID --value '<goog_…>' --visibility plaintext

# Preview (staging builds)
eas env:create --environment preview --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value '<pk_test_…>' --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_SENTRY_DSN --value '<https://…sentry.io/…>' --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_REVENUECAT_API_KEY_IOS --value '<appl_…>' --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID --value '<goog_…>' --visibility plaintext

# Development (dev client builds)
eas env:create --environment development --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value '<pk_test_…>' --visibility plaintext
eas env:create --environment development --name EXPO_PUBLIC_SENTRY_DSN --value '<https://…sentry.io/…>' --visibility plaintext
eas env:create --environment development --name EXPO_PUBLIC_REVENUECAT_API_KEY_IOS --value '<appl_…>' --visibility plaintext
eas env:create --environment development --name EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID --value '<goog_…>' --visibility plaintext
```

To update an existing value, use `eas env:update` (or delete + create). Run `eas env:list --environment <env>` to confirm all four are present before the next build.

#### Rotating leaked client secrets (BUG-235 / BUG-345)

The production Clerk `pk_live_*` key and Sentry DSN previously committed to `eas.json` are in git history forever. Both are technically "publishable" (mobile bundles expose them), but treat them as compromised and rotate before the next production build:

1. **Clerk:** In the Clerk dashboard → API Keys, rotate the production Frontend API key. Update the value in Doppler `prd` AND run `eas env:update --environment production --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value '<new pk_live_…>'`.
2. **Sentry:** In Sentry → Project Settings → Client Keys (DSN), rotate the DSN for the production project. Update the value in Doppler `prd` AND run `eas env:update --environment production --name EXPO_PUBLIC_SENTRY_DSN --value '<new DSN>'`.
3. Rebuild the production AAB and IPA. The first build after rotation must come from EAS (so the new EAS env vars are picked up).
4. Repeat steps 1-3 with `--environment preview` for the staging keys (`pk_test_*`) if you also want to invalidate them.

The only GitHub secret needed for CI-triggered builds is `EXPO_TOKEN` (authenticates `eas build`).

`apps/mobile/app.json` has the Sentry Expo plugin configured with
`uploadSourceMaps: true`, but every committed EAS profile currently sets
`SENTRY_DISABLE_AUTO_UPLOAD=true`. That means source-map upload is intentionally
disabled until Sentry auth/project upload credentials are ready; do not remove
the flag casually.

### API URL mapping

Each EAS build profile points to the correct environment-specific Cloudflare Worker:

| EAS Profile | Worker | URL |
|-------------|--------|-----|
| `preview` | `mentomate-api-stg` | `https://api-stg.mentomate.com` |
| `production` | `mentomate-api-prd` | `https://api.mentomate.com` |

The fallback URL in `apps/mobile/src/lib/api.ts` is dev-only. Production builds
fail fast if `EXPO_PUBLIC_API_URL` is missing instead of silently talking to
staging.

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

## EAS Update (Over-the-Air)

JS-only changes can be deployed in ~5 minutes via EAS Update instead of a full native build (~30 min). This is the primary deployment path — most pushes to main are JS-only.

### How it works

`expo-updates` is installed in the mobile app. On every cold launch, the app checks for a new JS bundle from EAS Update servers. If one is available, it downloads (~2-3 sec) and applies. If download exceeds 5 seconds (bad network), it falls back to the cached bundle.

### Runtime Version Strategy

Uses **`appVersion` policy** for `runtimeVersion`. The runtime version is `"<version>:<versionCode>"` (e.g. `"1.0.0:1"`), derived from `version`/`android.versionCode` in app.json.

**Why not fingerprint?** Expo's fingerprint policy was originally specified but fails in this pnpm monorepo: `@expo/fingerprint` hashes `node_modules/.pnpm/` virtual-store paths that differ between Windows (local) and Linux (EAS) even when the actual packages are identical. This causes spurious runtime-version divergence and "Configure expo-updates" build errors. A `.fingerprintignore` ignores most file-type sources but cannot ignore the 76 `type: "dir"` autolinking entries — an upstream limitation in `@expo/fingerprint` ≤0.15.4.

**Trade-off:** When native dependencies change (app.json, new native modules, etc.), `version` in app.json must be bumped manually to block incompatible OTA updates. If you forget, OTA could ship a JS bundle expecting a native API not present in the installed build. See the risk table below.

### Update Channels

| Build Profile | Channel | Purpose |
|--------------|---------|---------|
| `development` | `development` | Dev client builds (local Metro, no OTA) |
| `preview` | `preview` | Internal testing — primary OTA target |
| `production` | `production` | Store releases |

### CI Integration

The `ci.yml` workflow has an `ota-update` job that runs after the main CI job passes:
- Only triggers on push to main (not PRs)
- Publishes `eas update --branch preview` with the commit message
- Takes ~3 min after CI passes
- The installed preview APK receives the new bundle on next launch

Full native builds (`mobile-ci.yml: build-preview`) only trigger when native-affecting files change: `app.json`, `package.json`, `eas.json`, `plugins/`, `android/`, `ios/`.

### Typical flow

```
push to main (JS-only — 95% of merges)
  ├── ci.yml: main job (lint, test, typecheck)    ~2 min
  ├── ci.yml: ota-update (after main passes)      ~3 min  ← OTA live on device
  └── mobile-ci.yml: build-preview                SKIPPED (no native changes)

push to main (native change — rare)
  ├── ci.yml: main job                            ~2 min
  ├── ci.yml: ota-update (after main)             ~3 min
  └── mobile-ci.yml: build-preview (after tests)  ~30 min
```

### App config

```json
{
  "updates": {
    "url": "https://u.expo.dev/cbb7c7e1-cf56-45f2-9df8-f043bb8bb361",
    "enabled": true,
    "checkAutomatically": "ON_LOAD",
    "fallbackToCacheTimeout": 5000
  },
  "runtimeVersion": { "policy": "appVersion" }
}
```

### Risks

| Risk | Mitigation |
|------|-----------|
| JS update calls native API not in installed build | Bump `version` in app.json when native deps change — this produces a new runtime version that OTA clients won't accept, preventing mismatched updates |
| Broken JS update shipped | Fix forward with another push; `eas update:rollback` available |
| 5-second launch delay on slow networks | Falls back to cached bundle after timeout |
| Native dep bump without version bump | OTA clients silently receive incompatible JS — see appVersion trade-off above |

> **Restoring fingerprint policy:** Re-evaluate when `@expo/fingerprint` gains support for ignoring `type: "dir"` autolinking sources in `.fingerprintignore` (blocked in ≤0.15.4). Also blocked by the ExpoConfigLoader Unicode-path error on Windows (`ZuzanaKopečná` username). Check `docs/known-issues/` or memory `project_fingerprint_pnpm_mismatch.md` before re-attempting.

---

## Secrets Inventory

All secrets managed in Doppler (project: `mentomate`, configs: `dev` / `stg` / `prd`):

| Category | Secret | Required in Prod? |
|----------|--------|:-:|
| **Core** | `DATABASE_URL` | Yes (implicit) |
| **Auth (Clerk)** | `CLERK_SECRET_KEY` | Yes |
| | `CLERK_PUBLISHABLE_KEY` | No |
| | `CLERK_JWKS_URL` | Yes |
| | `CLERK_AUDIENCE` | Yes |
| **LLM** | `GEMINI_API_KEY` | Yes |
| | `OPENAI_API_KEY` | No (optional — OpenAI provider only active when key present) |
| | `ANTHROPIC_API_KEY` | No (optional — Anthropic provider only active when key present) |
| | `VOYAGE_API_KEY` | Yes |
| **Email** | `RESEND_API_KEY` | Yes |
| | `RESEND_WEBHOOK_SECRET` | Yes |
| **API** | `API_ORIGIN` | Yes |
| **Payments** | `REVENUECAT_WEBHOOK_SECRET` | Yes |
| | `STRIPE_SECRET_KEY` | No (dormant) |
| | `STRIPE_WEBHOOK_SECRET` | No (dormant) |
| | `STRIPE_PRICE_*` (6 keys) | No (dormant) |
| | `STRIPE_CUSTOMER_PORTAL_URL` | No (dormant) |
| **Background Jobs** | `INNGEST_SIGNING_KEY` | Yes (also staging) |
| | `INNGEST_EVENT_KEY` | Yes (also staging) |
| **Observability** | `SENTRY_DSN` | No |
| **Testing** | `TEST_SEED_SECRET` | No (dev/staging only) |
| **Prelaunch override** | `ALLOW_MISSING_IDEMPOTENCY_KV` | Only if temporarily launching without the production KV binding |

GitHub Actions secrets (set in GitHub, not Doppler):

| Secret | Used By |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | `deploy.yml` — authenticates `wrangler deploy` |
| `DATABASE_URL_STAGING` | `deploy.yml` — staging Neon migrations before staging deploys |
| `DATABASE_URL_PRODUCTION` | `deploy.yml` — production Neon migrations before production deploys |
| `DATABASE_URL_STAGING_HOST` | `deploy.yml` — expected host guard for staging DB target verification |
| `DATABASE_URL_PRODUCTION_HOST` | `deploy.yml` — expected host guard for production DB target verification |
| `DOPPLER_TOKEN_STG` | `deploy.yml`, `e2e-web.yml` — staging Doppler service token for Worker secret sync |
| `DOPPLER_TOKEN_PRD` | `deploy.yml` — production Doppler service token for Worker secret sync |
| `SKIP_DOPPLER_SYNC` | `deploy.yml` — opt-out flag when Doppler→Worker sync was run locally before dispatch |
| `STAGING_API_URL` | Optional deploy smoke override; defaults to `https://api-stg.mentomate.com` |
| `PRODUCTION_API_URL` | Optional deploy smoke override; defaults to `https://api.mentomate.com` |
| `EXPO_TOKEN` | `deploy.yml`, `mobile-ci.yml`, `ci.yml` — authenticates EAS CLI |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY_PREVIEW` | `ci.yml` (OTA update step), `e2e-ci.yml`, `e2e-web.yml` — Clerk publishable key for preview/staging |
| `EXPO_PUBLIC_SENTRY_DSN` | `ci.yml` — Sentry DSN injected into preview OTA updates |
| `TEST_SEED_SECRET` | `e2e-ci.yml`, `e2e-web.yml`, `e2e-web-cleanup.yml` — auth for test seed endpoint |
| `CLAUDE_CODE_OAUTH_TOKEN` (+ `_2`, `_3`) | `claude.yml`, `claude-code-review.yml` — AI review |

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
| **E2E Web** | `e2e-web.yml` | PRs | Playwright web E2E suite against staging |
| **E2E Web Cleanup** | `e2e-web-cleanup.yml` | Nightly cron | Cleans up orphaned Playwright staging seed accounts |
| **API Quality Gate** | `api-quality-gate.yml` | PRs | Dedicated API lint + typecheck + test gate |
| **Docs Checks** | `docs-checks.yml` | Push (doc-only paths) | Lightweight checks for plan/spec doc changes |
| **Claude Code** | `claude.yml` | Issue/PR comments, issue assignment | Claude Code agentic tasks triggered from GitHub |
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
| **Approval gate** | None | None (auto after quality gate) | GitHub Environment rule |
| **Worker name** | `mentomate-api-dev` | `mentomate-api-stg` | `mentomate-api-prd` |
| **Config validation** | Zod parse (lenient) | Zod + Clerk auth keys | Zod + production required keys + production binding gate |
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
