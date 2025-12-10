# Sentry – Next.js 15+ Turbopack Client Configuration Migration (2025-12-10)

## TL;DR

Next.js 15+ with Turbopack requires `instrumentation-client.ts` instead of `sentry.client.config.ts` for browser-side Sentry initialization.

## Context

When upgrading to Next.js 15+ or enabling Turbopack, the traditional Sentry client configuration pattern stops working.

## Problem Discovered

**Symptom:** Sentry client-side error tracking stops working silently after enabling Turbopack.

**Root Cause:** Turbopack doesn't process `sentry.client.config.ts` because it's not a standard Next.js file convention. The file is simply ignored during the build.

**Old pattern (doesn't work with Turbopack):**
```
apps/web/sentry.client.config.ts  ← Ignored by Turbopack
```

## Solution

Use the Next.js instrumentation API which is supported by both Webpack and Turbopack:

**New pattern (works with Turbopack):**
```
apps/web/instrumentation-client.ts  ← Next.js standard file convention
apps/web/src/app/global-error.tsx   ← App Router error boundary
apps/web/instrumentation.ts         ← Server + RSC error handling
```

### File Changes

| Old File | New File | Notes |
|----------|----------|-------|
| `sentry.client.config.ts` | `instrumentation-client.ts` | Same `Sentry.init()` content |
| N/A | `src/app/global-error.tsx` | Catches unhandled errors |
| `instrumentation.ts` | `instrumentation.ts` | Added `onRequestError` export |

### Key Code Changes

**`instrumentation-client.ts`** (new):
```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // ... same config as before
});

// New: Export for router transition tracking
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

**`instrumentation.ts`** (updated):
```typescript
import * as Sentry from '@sentry/nextjs';

// NEW: Capture React Server Component errors
export const onRequestError = Sentry.captureRequestError;
```

**`src/app/global-error.tsx`** (new):
```tsx
'use client';
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  // ... render error UI
}
```

## Gotchas

1. **Unit tests break** if they import the old `sentry.client.config.ts` path
2. The new `instrumentation-client.ts` file MUST be in `apps/web/` root (not in `src/`)
3. `global-error.tsx` MUST be a Client Component (`'use client'`)

## Verification

After migration:
- [ ] `pnpm exec nx run web:build` succeeds
- [ ] `pnpm exec nx run web:test` passes (tests import new file)
- [ ] Sentry test page (`/sentry-test`) shows errors in Sentry dashboard
- [ ] Browser console shows no Sentry initialization errors

## References

- Sentry Next.js Manual Setup: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
- Next.js Instrumentation: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
- Turbopack compatibility: https://nextjs.org/docs/app/api-reference/turbopack

---

**Discovery Date:** 2025-12-10
**Applies To:** Next.js 15+, @sentry/nextjs 8.28.0+, Turbopack
**Severity:** Breaking change (silent failure)

