# Build — Safe EAS Build Trigger with Deduplication

Trigger an EAS build for the mobile app, ensuring no duplicate builds are created.

## Arguments

$ARGUMENTS — Optional flags:
- `--profile <name>` — EAS build profile: `development`, `preview` (default), or `production`
- `--platform <name>` — Target platform: `android` (default), `ios`, or `all`
- `--status` — Just check current build status, don't trigger anything

## Workflow

### 1. Pre-flight: Check for Existing Builds

**CRITICAL: Before triggering ANY build, check if one already exists.**

```bash
cd apps/mobile && eas build:list --platform android --limit 3
```

Also check if a Mobile CI workflow is already running (merges to main auto-trigger preview builds):

```bash
gh run list --workflow="Mobile CI" --limit 3
```

**Decision logic:**
- If a build is **in progress** for the current commit → report it and STOP. Do NOT trigger another.
- If a build is **in progress** for a different commit → warn the user and ask before triggering.
- If no build is in progress → safe to proceed.

### 2. Verify Current Commit

Confirm what will be built:

```bash
git log --oneline -1
git status
```

If there are uncommitted changes, warn the user — EAS builds from the remote HEAD, not local state.

### 3. Trigger the Build (Once Only)

Parse the profile and platform from $ARGUMENTS (defaults: `preview`, `android`).

```bash
cd apps/mobile && eas build --profile <profile> --platform <platform> --non-interactive
```

**NEVER retry this command if it fails.** Report the error and stop. Common failures:
- `EXPO_TOKEN` not set → user must configure EAS credentials
- Network timeout → check EAS status page, do not retry
- Fingerprint mismatch → may need a native rebuild, explain to user

### 4. Post-trigger Verification

Wait 30 seconds, then verify exactly ONE build was created:

```bash
cd apps/mobile && eas build:list --platform <platform> --limit 3
```

If duplicate builds appear (same commit, same profile), cancel the extras immediately:

```bash
eas build:cancel <build-id>
```

### 5. Report

Output:
- Build ID and link to EAS dashboard
- Profile and platform
- Which commit is being built
- Estimated time (preview APK ~10-15 min, dev client ~15-20 min)

## Safety Rules

1. **ONE build only.** Never trigger a second build "just in case."
2. **Never retry on failure.** Diagnose first, ask the user.
3. **Merges auto-trigger.** After merging a PR that touches `apps/mobile/**`, the `Mobile CI` workflow triggers `build-preview` automatically. Check before manually triggering.
4. **EAS builds cost money.** Each build consumes EAS build minutes. Duplicates waste budget.
5. **Run from `apps/mobile/` directory.** EAS CLI needs the `eas.json` in the working directory.
