# EAS Update (OTA) Integration — Design Spec

**Created:** 2026-04-02
**Status:** Approved
**Goal:** Reduce the mobile feedback loop from ~60 min to ~5 min for JS-only changes by adding EAS Update (over-the-air) to the CI pipeline.

---

## Problem

Every merge to main triggers a full EAS native build (~30 min), even when changes are JS-only (screens, hooks, styles). Combined with CI (~2 min) and E2E tests, the feedback loop is ~60 min. Most recent work has been JS-only — full native rebuilds are wasteful for these changes.

## Solution

Add `expo-updates` to the mobile app and an `ota-update` CI job that publishes a JS bundle update after CI passes. The installed preview APK receives the new bundle on next launch (within 5 seconds). Full native builds only trigger when native dependencies change.

---

## Design

### 1. Runtime Version Strategy

Use Expo's **fingerprint** policy for `runtimeVersion`. This auto-generates a hash of all native dependencies, plugins, and config. When native things change, the hash changes and OTA updates are ignored (preventing JS/native mismatches). When only JS changes, the hash stays the same and OTA applies.

No manual version management needed.

### 2. Update Channels

| Build Profile | Channel | Purpose |
|--------------|---------|---------|
| `development` | `development` | Dev client builds (local Metro, no OTA) |
| `preview` | `preview` | Internal testing — primary OTA target |
| `production` | `production` | Store releases |

### 3. Update-on-Launch Behavior

**Option B (block launch for up to 5 seconds):**
- App checks for updates on every cold launch
- If an update is found, downloads it (JS bundle, ~2-3 sec)
- If download exceeds 5 seconds (bad network), falls back to cached version
- User sees the new version on first open, not second

Config:
```json
{
  "updates": {
    "url": "https://u.expo.dev/cbb7c7e1-cf56-45f2-9df8-f043bb8bb361",
    "enabled": true,
    "checkAutomatically": "ON_LOAD",
    "fallbackToCacheTimeout": 5000
  }
}
```

### 4. App Config Changes (`app.json`)

Add to `expo` object:
- `runtimeVersion`: `{ "policy": "fingerprint" }`
- `updates`: block as described above

### 5. EAS Config Changes (`eas.json`)

Add `channel` to each build profile:
- `development` → `"channel": "development"`
- `preview` → `"channel": "preview"`
- `production` → `"channel": "production"`

### 6. Native-Change Detection

Add a detection step to the `check-affected` job in `mobile-ci.yml` that outputs `native-changed: true/false`. Native change is detected when any of these paths changed relative to the previous commit:

- `apps/mobile/app.json`
- `apps/mobile/package.json`
- `apps/mobile/eas.json`
- `apps/mobile/plugins/**`
- `apps/mobile/android/**`
- `apps/mobile/ios/**`

### 7. CI Workflow Changes

**`ci.yml` — new job: `ota-update`**
- Lives in `ci.yml` alongside the existing `main` job (avoids cross-workflow polling)
- Depends on: `main` job passing (lint, test, typecheck, build)
- Only runs on push to main (not on PRs)
- Detects whether mobile files changed (same path check as mobile-ci)
- Publishes `eas update --branch preview` with commit message
- Takes ~3 min after CI passes

**`mobile-ci.yml` — modified job: `build-preview`**
- Existing gate: depends on lint + test passing
- New gate: also requires `native-changed == 'true'`
- Only triggers when native files actually changed
- Most pushes skip this entirely

**`mobile-ci.yml` — new output: `native-changed`**
- Added to the existing `check-affected` job
- Detects changes in native-affecting paths (app.json, package.json, plugins/, etc.)

**Revised flow:**
```
push to main (JS-only — 95% of merges)
  ├── ci.yml: main job (lint, test, typecheck)    ~2 min
  ├── ci.yml: ota-update (after main passes)      ~3 min  ← OTA live on device
  ├── claude-code-review (parallel)               ~4 min (informational)
  ├── mobile-ci.yml: lint + test (parallel)       ~1 min
  └── mobile-ci.yml: build-preview                SKIPPED (no native changes)

push to main (native change — rare)
  ├── ci.yml: main job                            ~2 min
  ├── ci.yml: ota-update (after main)             ~3 min (harmless, publishes too)
  ├── mobile-ci.yml: lint + test                  ~1 min
  └── mobile-ci.yml: build-preview (after tests)  ~30 min
```

### 9. One-Time Bootstrap

After merging this change, one full native build is required to create a preview APK that includes `expo-updates`. All subsequent JS-only changes go through OTA.

### 10. Dependency Addition

Install `expo-updates` in the mobile app:
```
pnpm --filter @eduagent/mobile add expo-updates
```

Add `"expo-updates"` to the `plugins` array in `app.json`.

---

## What This Does NOT Change

- Tests still run on every push (CI main: lint, test, typecheck)
- Full native builds available via `workflow_dispatch` with `skip_tests` option
- Production builds unchanged — manual trigger only
- Deploy workflow (API to Cloudflare) unaffected
- E2E tests unaffected (run independently, informational)

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| JS update calls native API not in installed build | Fingerprint policy auto-detects native changes; mismatched updates are ignored |
| Broken JS update shipped after CI passes | Fix forward with another push; `eas update:rollback` available as escape hatch |
| 5-second launch delay on slow networks | Falls back to cached bundle after timeout; only affects cold launches when update is available |
| `expo-updates` adds native dependency | One-time cost; ~100KB APK size increase |
