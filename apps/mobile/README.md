# @eduagent/mobile

Expo (React Native) mobile app for MentoMate — the AI-powered tutoring platform.

## Overview

| Attribute | Value |
|-----------|-------|
| Framework | Expo SDK 54, React Native |
| Styling | NativeWind 4.2.1 (Tailwind CSS 3.4.19) |
| Navigation | Expo Router (file-system based) |
| Auth | Clerk (`@clerk/clerk-expo`) |
| Server state | TanStack Query v5 |
| API client | Hono RPC (`import type { AppType } from '@eduagent/api'`) |

## Structure

```
src/
  app/              Expo Router pages
    (auth)/         Unauthenticated screens (sign-in, sign-up)
    (app)/          Authenticated app screens
  components/       Shared UI components (persona-unaware)
  hooks/            Custom React hooks
  lib/              Utilities: api-client, secure-storage, design-tokens, error classes
  providers/        React context providers (auth, active profile)
  i18n/             Internationalization (7 locales: en, es, nb, pt, pl, de, ja)
  test-utils/       Mobile-specific test helpers
```

## Tab Shapes

Two tab shapes exist — selected by `resolveTabShape()`:

| Shape | Who | Tabs |
|-------|-----|------|
| **guardian** | Owner with linked children | Home, Own Learning, Library, Progress, More |
| **learner** | Everyone else | Home, Library, Progress, More |

Use `isOwner` / `role` for content gating inside screens. Never use `personaFromBirthYear()` for feature gating (theming only).

## Key Rules

- Shared components are persona-unaware. Use NativeWind semantic classes (`bg-surface`, `text-primary`), not hardcoded hex colors or persona checks.
- No direct `expo-secure-store` imports — use `src/lib/secure-storage.ts`. Keys must use only letters, digits, `.`, `-`, `_`.
- Default exports only for Expo Router page components under `src/app/**`.
- No global `crypto` (Hermes doesn't have it) — use `Crypto.randomUUID()` from `expo-crypto`.
- Every `.mutateAsync()` call needs visible error handling.
- Cross-tab `router.push` must push the full ancestor chain, not just the leaf.

## Development

```bash
# iOS
pnpm exec nx run mobile:ios

# Android
pnpm exec nx run mobile:android

# Tests
cd apps/mobile && pnpm exec jest --findRelatedTests src/path/to/file.tsx --no-coverage

# Type check
cd apps/mobile && pnpm exec tsc --noEmit

# Lint
pnpm exec nx lint mobile
```

## OTA Updates

```bash
# Preview channel
pnpm run ota:preview

# Production channel
pnpm run ota:production
```

Both commands use Doppler for environment injection (`-c stg` / `-c prd`).
