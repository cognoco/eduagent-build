---
name: build
description: Use when the user asks to trigger, inspect, or reason about EAS builds for the EduAgent mobile app, including preview/development/production profiles, Android/iOS platform selection, build status checks, and duplicate-build avoidance.
---

# Build

Trigger EAS builds only after proving another build is not already covering the same commit. EAS builds consume budget and mobile merges may auto-trigger preview builds.

## Arguments

Treat the user request as optional arguments:

- `--profile <name>`: `development`, `preview` (default), or `production`
- `--platform <name>`: `android` (default), `ios`, or `all`
- `--status`: inspect build status only; do not trigger a build

## Workflow

1. Check existing builds before triggering anything:

   ```bash
   cd apps/mobile && eas build:list --platform android --limit 3
   gh run list --workflow="Mobile CI" --limit 3
   ```

   If a build is in progress for the current commit, report it and stop. If a build is in progress for a different commit, warn the user and ask before triggering another.

2. Verify what will be built:

   ```bash
   git log --oneline -1
   git status
   ```

   Warn if there are uncommitted changes, because EAS builds the remote commit, not local dirty state.

3. If the user requested `--status`, report current EAS and Mobile CI state and stop.

4. Trigger exactly one build:

   ```bash
   cd apps/mobile && eas build --profile <profile> --platform <platform> --non-interactive
   ```

   Never retry this command immediately after failure. Diagnose and report common causes such as missing `EXPO_TOKEN`, network failure, or fingerprint/native-build mismatch.

5. After about 30 seconds, verify exactly one build was created:

   ```bash
   cd apps/mobile && eas build:list --platform <platform> --limit 3
   ```

   If duplicates exist for the same commit/profile, cancel extras with `eas build:cancel <build-id>`.

## Report

Return the build ID/link, profile, platform, commit SHA, whether Mobile CI is also running, and the rough ETA (preview APK 10-15 min; dev client 15-20 min).

## Rules

- Run EAS commands from `apps/mobile/`.
- Do not trigger a second build "just in case."
- Do not retry failed build commands without diagnosis.
- Remember that merges touching `apps/mobile/**` may auto-trigger `Mobile CI` preview builds.
