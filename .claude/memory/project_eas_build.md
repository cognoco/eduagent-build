---
name: EAS Build configuration and known issues
description: EAS Build for Android APK — OTA operational, Sentry upload disabled, NX Cloud disconnected (2026-06-01), Doppler sync via pnpm env:sync
type: project
---

EAS Build is the primary path for Android APK builds (alternative to WSL2 Gradle).

**Key facts:**
- `eas.json` has `development`, `preview` (APK), and `production` (AAB) profiles
- Expo account: `@zuzanka14/mentomate`, free tier (queue delays)
- Android build credentials stored on Expo servers (remote keystore)

**EAS Update (OTA) — OPERATIONAL (2026-04-03):** `expo-updates` ~0.28.18 installed. JS-only changes deploy via OTA in ~5 min. Full native builds only for native file changes. See `project_eas_update_ota.md`.

**Doppler -> eas.json sync (implemented 2026-03-29):** `scripts/setup-env.js` downloads EXPO_PUBLIC_* vars from all 3 Doppler configs (dev/stg/prd) and writes them into the corresponding `eas.json` build profiles. Run `pnpm env:sync` after changing Doppler values, then commit eas.json.
- `EXPO_PUBLIC_*` client keys -> synced from Doppler into `eas.json` env blocks (safe, they're public)
- `SENTRY_AUTH_TOKEN` -> stored in EAS Secrets via `eas secret:create` (sensitive, cannot go in committed files)

**Sentry source map upload: DISABLED (2026-03-27).** Disabled via `SENTRY_DISABLE_AUTO_UPLOAD=true` env var in `eas.json` build profiles (synced from Doppler). The Sentry Gradle plugin couldn't find the auth token during build. Crash tracking still works, stack traces are minified. Re-enable when auth token issue is resolved.

**NX Cloud: DISCONNECTED (2026-06-01, IID-792).** Was connected 2026-04-03 (`nxCloudId` in `nx.json`; no access token was ever in `ci.yml` — connection was id-only). Disconnected because CI Pipeline Execution credits hit ~$617 for Apr30–May31, driven by a ~6.8× spike in CI run volume (148→964 PR runs) from agent-swarm activity — not by any premium feature (AI Fixes and Managed Compute both billed $0; distributed execution was never enabled). Removed `nxCloudId` from `nx.json` + the `nx fix-ci` step from `ci.yml`; added `actions/cache` for `.nx/cache` to keep cross-run caching for $0. `nx affected`/`run-many` are cloud-independent. Account-side cancellation (plan downgrade, workspace delete) is a manual follow-up for Jørn at cloud.nx.app.

**Runtime version policy (2026-04-05):** Switched from `fingerprint` to `appVersion` policy. Fingerprint policy breaks in pnpm monorepo because `.pnpm` store paths differ between Windows and Linux (EAS). See `project_fingerprint_pnpm_mismatch.md` for full analysis.

**Build status (2026-03-29):** `eas build` CLI reports "Build request failed" locally due to `@expo/fingerprint` ExpoConfigLoader failing (Unicode path issue with `c` in Windows username). BUT the build IS actually submitted to EAS servers — the error is misleading. Current no-retry and duplicate-build rules live in `.agents/skills/build/SKILL.md`.

**How to apply:** When building APKs, use `npx eas build --platform android --profile preview`. Don't suggest WSL2 Gradle as first option — WSL2 is unreliable (hung completely 2026-03-27). If EAS build fails, check build logs at the Expo dashboard URL in the output.
