# Mobile Environment Strategy

> **Purpose:** Comprehensive guide for mobile app development, building, and deployment in the nx-monorepo template.
> **Audience:** Developers working with the Expo mobile app
> **Last Updated:** 2025-12-13 (v1.1 - Development profile API URL strategy revised)

---

## Table of Contents

1. [Overview](#overview)
2. [Development Workflow](#development-workflow)
3. [Build & Distribution](#build--distribution)
4. [Environment Configuration](#environment-configuration)
5. [CI/CD Integration](#cicd-integration)
6. [App Store Deployment](#app-store-deployment)
7. [Quick Reference](#quick-reference)

---

## Overview

This document defines the mobile environment strategy for the nx-monorepo template. It covers the complete lifecycle from local development through production deployment.

### Key Decisions

| Area | Strategy |
|------|----------|
| **Primary Dev Method** | Hybrid: Android Emulator for daily dev, physical device for validation |
| **Build System** | EAS Build (cloud) as primary, local as fallback |
| **Distribution** | EAS Internal for dev/preview, TestFlight/Play Console for production |
| **Backend Connectivity** | Tiered: emulator → localhost, device → staging |
| **CI/CD** | Smart triggers via Nx affected, separate mobile workflow |
| **Releases** | Semi-automated: auto-build, manual submission |
| **OTA Updates** | Enabled via EAS Update for JS-only changes |

### Platform Constraints

**Current:** Android-only development and testing (no iOS device/Mac available)
**Future:** iOS support documented but deferred until hardware available

---

## Development Workflow

### Daily Development (Recommended)

Use **Development Builds** on **Android Emulator** for daily development:

```bash
# Terminal 1: Start backend
pnpm exec nx run server:serve

# Terminal 2: Start Metro bundler for mobile
pnpm exec nx run mobile:start

# The dev build on emulator auto-connects to Metro
```

**Why this works:**
- Development build has `expo-dev-client` built in
- Connects to Metro bundler automatically (no QR code needed)
- Emulator uses `10.0.2.2` to reach host's `localhost:4000`
- Hot reload works instantly for JS changes

### When to Use Each Method

| Method | When to Use | Backend |
|--------|-------------|---------|
| **Emulator + Dev Build** | Daily development, API testing | localhost:4000 |
| **Physical Device + Dev Build** | Touch/gesture testing, performance validation | Staging API |
| **Expo Go** | Onboarding new devs, quick smoke tests | Staging API (via tunnel) |

### Nx Commands

| Task | Command |
|------|---------|
| Start Metro | `pnpm exec nx run mobile:start` |
| Run tests | `pnpm exec nx run mobile:test` |
| Lint | `pnpm exec nx run mobile:lint` |
| Build (local) | `pnpm exec nx run mobile:build` |

**Expo Go edge case** (when interactivity needed):
```bash
cd apps/mobile && npx expo start --tunnel
```

### Backend Connectivity

```
┌─────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT ENVIRONMENTS                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Android Emulator ──────► localhost:4000 (via 10.0.2.2)    │
│       (Daily dev)              │                            │
│                                ▼                            │
│                         Local Express                       │
│                         (your machine)                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Physical Device ───────► Staging API (Railway)            │
│    (Validation)                │                            │
│                                ▼                            │
│                    nx-monoreposerver-staging                │
│                      .up.railway.app                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Why tiered?**
- Emulator can test ALL backend changes (API logic, database)
- Physical device testing is for: touch, gestures, camera, performance
- These don't require local backend — staging is more reliable

---

## Build & Distribution

### Build Profiles

Three profiles configured in `eas.json`:

| Profile | Purpose | Distribution | API URL |
|---------|---------|--------------|---------|
| `development` | Daily dev, connects to Metro | EAS Internal | Platform-auto (see note) |
| `preview` | QA testing, production-like | EAS Internal | Staging (Railway) |
| `production` | App Store release | Play Store | Production (Railway) |

> **Note:** Development profile intentionally omits `EXPO_PUBLIC_API_URL` so that `api.ts` can use `Platform.select` at runtime: Android Emulator gets `10.0.2.2:4000`, iOS Simulator gets `localhost:4000`.

### Building

```bash
# Development build (for emulator/device dev work)
eas build --profile development --platform android

# Preview build (for QA, production-identical)
eas build --profile preview --platform android

# Production build (for Play Store)
eas build --profile production --platform android
```

**Build frequency:**
- **Development build:** Once per native change (SDK update, new native module)
- **Preview build:** Per feature/milestone for QA testing
- **Production build:** Per release

### Distribution Methods

| Build Type | Distribution | Access |
|------------|--------------|--------|
| Development | EAS Internal | Install link via Expo dashboard |
| Preview | EAS Internal | Install link via Expo dashboard |
| Production | Play Store | Public release or Internal Track |

### Installing Development Build on Emulator

```bash
# 1. Build via EAS
eas build --profile development --platform android

# 2. Download .apk from Expo dashboard or CLI
eas build:list --platform android --status finished

# 3. Install on emulator
adb install path/to/app.apk

# 4. Start Metro (app connects automatically)
pnpm exec nx run mobile:start
```

---

## Environment Configuration

### EAS Configuration (`eas.json`)

```json
{
  "build": {
    "production": {
      "android": {
        "buildType": "app-bundle"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://nx-monoreposerver-production.up.railway.app/api"
      }
    },
    "development": {
      "developmentClient": true,
      "distribution": "internal"
      // No env section - api.ts Platform.select handles platform differences
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": true
      },
      "android": {
        "buildType": "apk"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://nx-monoreposerver-staging.up.railway.app/api"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

> **Why no env in development?** EAS builds "bake in" environment variables at build time. If we set `EXPO_PUBLIC_API_URL` here, the smart platform-detection in `api.ts` would never run. By omitting it, the app uses `Platform.select` at runtime to choose the correct URL for each platform.

### API URL Resolution

The mobile app (`api.ts`) resolves API URLs in this priority order:

1. `EXPO_PUBLIC_API_URL` environment variable (set by EAS build)
2. `Constants.expoConfig.extra.apiUrl` (from app.json)
3. Platform-specific defaults (when `__DEV__` is true):
   - iOS: `http://localhost:4000/api`
   - Android: `http://10.0.2.2:4000/api`
4. Production fallback: `https://api.example.com/api`

**In practice:**
- **Development builds**: No env var set → Falls through to option 3 → Platform-appropriate URL
- **Preview/Production builds**: Env var set → Uses option 1 → Explicit staging/production URL

---

## CI/CD Integration

### Workflow Structure

Two separate workflows:

| Workflow | File | Purpose | Duration |
|----------|------|---------|----------|
| Main CI | `.github/workflows/ci.yml` | Web + Server (lint, test, build) | ~3-5 min |
| Mobile CI | `.github/workflows/mobile-ci.yml` | Mobile builds via EAS | ~10-30 min |

**Why separate?** Mobile builds are slow and shouldn't block web/server PRs.

### Smart Triggers

Mobile CI only runs when mobile code is affected:

```yaml
# .github/workflows/mobile-ci.yml
name: Mobile CI

on:
  pull_request:
    paths:
      - 'apps/mobile/**'
      - 'packages/api-client/**'
      - 'packages/schemas/**'
  push:
    branches: [main]

jobs:
  check-affected:
    runs-on: ubuntu-latest
    outputs:
      mobile-affected: ${{ steps.check.outputs.affected }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Check if mobile affected
        id: check
        run: |
          affected=$(pnpm exec nx show projects --affected --base=origin/main)
          if echo "$affected" | grep -q "mobile"; then
            echo "affected=true" >> $GITHUB_OUTPUT
          else
            echo "affected=false" >> $GITHUB_OUTPUT
          fi

  build-preview:
    needs: check-affected
    if: needs.check-affected.outputs.mobile-affected == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: eas build --profile preview --platform android --non-interactive

  build-production:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: eas build --profile production --platform android --non-interactive
```

### CI Flow

```
PR Created
    │
    ▼
Check if mobile affected (Nx)
    │
    ├── No ──► Skip mobile CI
    │
    └── Yes ─► EAS Preview Build
                    │
                    ▼
              PR Merged to main
                    │
                    ▼
              EAS Production Build
                    │
                    ▼
              Auto-upload to Play Console
                    │
                    ▼
              Manual: Submit for review
```

---

## App Store Deployment

### Release Strategy: Semi-Automated

| Stage | Trigger | Action |
|-------|---------|--------|
| Build | Merge to main | Automatic EAS production build |
| Upload | Build complete | Automatic upload to Play Console |
| Submit | Manual | `workflow_dispatch` or EAS CLI |
| Review | N/A | Google reviews (1-7 days) |
| Release | Auto | After approval, release to users |

### OTA Updates (EAS Update)

For **JavaScript-only** changes, bypass App Store review:

```bash
# Push JS update to production channel
eas update --branch production --message "Fix: button alignment"

# Rollback if needed
eas update:rollback --branch production
```

**What CAN be updated OTA:**
- UI fixes and styling
- Logic bugs in JavaScript
- Text/copy changes
- Feature flag toggles
- API URL changes (if properly configured)

**What REQUIRES App Store:**
- New native modules
- Expo SDK upgrades
- Changes to `app.json` (name, icon, splash)
- Native code modifications

### Release Checklist

```markdown
## Pre-Release
- [ ] All tests passing on main
- [ ] Preview build tested by QA
- [ ] Release notes drafted
- [ ] Version bumped in app.json

## Release
- [ ] Production build triggered (merge to main)
- [ ] Build successful on EAS dashboard
- [ ] Uploaded to Play Console verified
- [ ] Submit for review (manual trigger)

## Post-Release
- [ ] Monitor Play Console for review status
- [ ] Announce release when approved
- [ ] Monitor error tracking (Sentry)
```

---

## Quick Reference

### Common Commands

```bash
# Development
pnpm exec nx run mobile:start          # Start Metro
pnpm exec nx run mobile:test           # Run tests
pnpm exec nx run server:serve          # Start backend

# Building
eas build --profile development --platform android
eas build --profile preview --platform android
eas build --profile production --platform android

# OTA Updates
eas update --branch production --message "description"
eas update:rollback --branch production

# Submission
eas submit --platform android
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Dev build won't connect to Metro | Check Metro is running, verify IP if on device |
| API calls fail from emulator | Use `10.0.2.2` instead of `localhost` |
| API calls fail from device | Use staging URL, not localhost |
| Build fails on EAS | Check `eas.json` config, verify credentials |
| App crashes on launch | Check native module compatibility with SDK |

### Key Files

| File | Purpose |
|------|---------|
| `apps/mobile/app.json` | Expo app configuration |
| `apps/mobile/eas.json` | EAS Build profiles |
| `apps/mobile/src/lib/api.ts` | API client with URL resolution |
| `.github/workflows/mobile-ci.yml` | Mobile CI workflow |

---

## Related Documentation

- [Expo Documentation](https://docs.expo.dev/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [EAS Update](https://docs.expo.dev/eas-update/introduction/)
- [Mobile README](../apps/mobile/README.md)
- [API Client Package](../packages/api-client/README.md)
