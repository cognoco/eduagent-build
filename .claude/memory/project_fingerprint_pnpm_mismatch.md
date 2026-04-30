---
name: EAS fingerprint policy breaks in pnpm monorepo (Windows↔Linux)
description: runtimeVersion fingerprint policy fails because pnpm virtual store paths differ between Windows (local) and Linux (EAS). Switched to appVersion policy 2026-04-05.
type: project
---

## Problem

The `"runtimeVersion": { "policy": "fingerprint" }` in app.json causes EAS builds to fail with "Configure expo-updates" errors when the pnpm dependency tree changes.

**Root cause:** `@expo/fingerprint` hashes native-affecting files including paths inside `node_modules/.pnpm/`. In a pnpm monorepo, the `.pnpm` virtual store layout differs between Windows (local) and Linux (EAS) — same packages, different directory names and resolution hashes. This produces 274 file-level differences (246 removed, 26 added, 2 changed), all from `expoConfigPlugins` and autolinking resolution.

**Why it worked before:** The fingerprint matched when the dependency tree was identical between local and EAS (same lockfile, no native dep changes). After bumping `react-native-worklets` 0.5.1→0.7.4, the pnpm resolution changed enough to cause divergence.

## Fix applied (2026-04-05)

Switched `app.json` runtimeVersion to `{ "policy": "appVersion" }`. This uses `version:versionCode` (e.g. `"1.0.0:1"`) which is deterministic everywhere.

**Trade-off:** Must manually bump version when native deps change to ensure OTA compatibility. Fine for pre-release.

## Partial fix available: .fingerprintignore

Added `apps/mobile/.fingerprintignore` with `**/.pnpm/**` pattern. This ignores 218 of 294 problematic `type: "file"` sources but CANNOT ignore 76 `type: "dir"` autolinking entries (ignorePaths doesn't match dir-type sources in `@expo/fingerprint` v0.15.4).

## How to apply

- **To restore fingerprint policy later:** Fix the `.fingerprintignore` to also handle dir entries (may need upstream fix in `@expo/fingerprint`), OR wait for a version that normalizes pnpm paths.
- **If OTA update doesn't apply after native dep change:** Bump `version` in app.json to force a new runtime version.
- **If build fails with "Configure expo-updates":** Check if someone switched back to fingerprint policy.
