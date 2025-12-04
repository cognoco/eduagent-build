# Observability Setup Guide

This document describes the observability infrastructure for the nx-monorepo template, including Sentry error tracking and performance monitoring setup.

## Overview

The monorepo uses **Sentry** for:
- **Error Tracking**: Capture and report runtime errors from both server and client
- **Performance Monitoring**: Track transactions and spans for performance analysis
- **Breadcrumbs**: Track user actions leading up to errors
- **Release Tracking**: Correlate errors with specific deployments

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Sentry Dashboard                          │
│   (Issues, Performance, Releases, Alerts)                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Express API  │   │  Next.js Web  │   │   Mobile App  │
│ @sentry/node  │   │@sentry/nextjs │   │ @sentry/react │
│ (v10.28.0+)   │   │  (v8.x API)   │   │   (future)    │
└───────────────┘   └───────────────┘   └───────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                    ┌───────────────┐
                    │   Supabase    │
                    │   PostgreSQL  │
                    └───────────────┘
```

## Environment Configuration

### Required Environment Variables

Add these to your `.env.local` or environment-specific files:

```bash
# Server (Express API)
SENTRY_DSN_SERVER=https://your-key@your-org.ingest.sentry.io/your-project-id

# Web (Next.js)
NEXT_PUBLIC_SENTRY_DSN=https://your-key@your-org.ingest.sentry.io/your-project-id

# Sentry organization and project (for source map uploads)
SENTRY_ORG=your-organization-slug
SENTRY_PROJECT=your-project-slug
SENTRY_AUTH_TOKEN=your-auth-token  # For source map uploads
```

### Environment File Locations

| File | Purpose |
|------|---------|
| `.env.local` | Local development secrets (git-ignored) |
| `.env.development.local` | Development-specific overrides |
| `.env.production.local` | Production secrets (CI/CD injection) |

## Server Integration (@sentry/node v8+)

### Initialization

The server initializes Sentry in `apps/server/src/instrumentation.ts`:

```typescript
import * as Sentry from '@sentry/node';

export function initSentry(): void {
  if (!process.env.SENTRY_DSN_SERVER) {
    console.warn('⚠️  Sentry DSN not configured. Error tracking disabled.');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN_SERVER,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version || 'unknown',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    debug: process.env.NODE_ENV === 'development',
    maxBreadcrumbs: 50,
    attachStacktrace: true,
  });
}
```

### Express Error Handler

Sentry v8+ uses a single function to set up error handling:

```typescript
// In apps/server/src/app.ts
import * as Sentry from '@sentry/node';

// After all routes are registered:
Sentry.setupExpressErrorHandler(app);

// Your custom error handler comes AFTER Sentry's
app.use((err, req, res, next) => {
  // Handle error response
});
```

**Important v8+ Changes:**
- No more `Sentry.Handlers.requestHandler()` - automatic via OpenTelemetry
- No more `Sentry.Handlers.tracingHandler()` - automatic via OpenTelemetry
- No more `Sentry.Handlers.errorHandler()` - use `setupExpressErrorHandler(app)`

## Web Integration (@sentry/nextjs v8+)

### Configuration Files

| File | Purpose |
|------|---------|
| `apps/web/sentry.client.config.ts` | Browser-side Sentry initialization |
| `apps/web/sentry.server.config.ts` | Server-side Sentry initialization |
| `apps/web/sentry.edge.config.ts` | Edge runtime Sentry initialization |
| `apps/web/instrumentation.ts` | Next.js instrumentation hook |
| `apps/web/next.config.js` | Wraps config with `withSentryConfig` |

### Next.js Config Integration

```javascript
// apps/web/next.config.js
const { withSentryConfig } = require('@sentry/nextjs');

// Wrap your config with Sentry
module.exports = withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  hideSourceMaps: true,
  tunnelRoute: '/monitoring',  // Bypass ad-blockers
});
```

## Test Endpoints

### Server Test Endpoint

**Endpoint:** `GET /api/debug/sentry-test`

Throws an intentional error to verify Sentry captures server-side errors.

```bash
# Test locally
curl http://localhost:4000/api/debug/sentry-test
# Expected: 500 Internal Server Error
```

**Security:** Only available in non-production environments (`NODE_ENV !== 'production'`).

### Web Test Page

**URL:** `http://localhost:3000/sentry-test`

Interactive page with multiple error trigger buttons:

1. **Synchronous Error** - Uncaught error in render
2. **Async Error** - Unhandled promise rejection
3. **Captured Exception** - `Sentry.captureException()`
4. **Message** - `Sentry.captureMessage()`
5. **Breadcrumbs + Error** - Error with custom breadcrumb trail

**Security:** Mark as development-only or remove before production.

## Verification Checklist

When Sentry DSNs are configured, verify the following:

### Server Verification

- [ ] Start server with `SENTRY_DSN_SERVER` set
- [ ] Call `GET /api/debug/sentry-test`
- [ ] Check Sentry Issues dashboard for the error
- [ ] Verify stack trace is readable (source maps working)
- [ ] Verify environment tag is correct

### Web Verification

- [ ] Start web app with `NEXT_PUBLIC_SENTRY_DSN` set
- [ ] Navigate to `/sentry-test`
- [ ] Click "Capture Exception" button
- [ ] Check Sentry Issues dashboard for the error
- [ ] Verify browser context (URL, user agent) captured
- [ ] Check Performance tab for page load transactions

### Cross-Service Correlation

- [ ] Trigger API error from web client
- [ ] Verify both client and server events appear in Sentry
- [ ] Check for trace correlation between events

## Troubleshooting

### "Sentry DSN not configured" Warning

**Cause:** `SENTRY_DSN_SERVER` or `NEXT_PUBLIC_SENTRY_DSN` not set.

**Solution:** Add the DSN to your environment:
```bash
# .env.local
SENTRY_DSN_SERVER=https://...
NEXT_PUBLIC_SENTRY_DSN=https://...
```

### Errors Not Appearing in Dashboard

**Possible Causes:**
1. DSN is incorrect or project doesn't exist
2. Environment is filtered out in Sentry settings
3. Rate limiting (check Sentry quota)
4. Source maps not uploading (auth token issue)

**Debug Steps:**
1. Enable debug mode: `debug: true` in Sentry config
2. Check browser console for Sentry SDK logs
3. Verify DSN in Sentry project settings

### Source Maps Not Working

**Symptoms:** Stack traces show minified code instead of original source.

**Solution:**
1. Ensure `SENTRY_AUTH_TOKEN` is set with correct permissions
2. Verify `SENTRY_ORG` and `SENTRY_PROJECT` match exactly
3. Check build logs for source map upload errors

### Performance Data Missing

**Symptoms:** No transactions in Performance tab.

**Check:**
1. `tracesSampleRate` is not 0
2. OpenTelemetry integrations are active (automatic in v8+)
3. Request has sufficient duration to be sampled

## Sample Rates

| Environment | `tracesSampleRate` | Notes |
|-------------|-------------------|-------|
| Development | 1.0 (100%) | Capture all for debugging |
| Staging | 0.5 (50%) | Balance visibility with quota |
| Production | 0.1 (10%) | Reduce costs, capture representative sample |

## Alerting (Future Enhancement)

Configure alerts in Sentry dashboard for:
- **Error spike**: > X errors/minute
- **New error types**: First occurrence of unique error
- **Performance regression**: p95 latency > threshold
- **Release health**: Error rate increase after deployment

## Related Documentation

- [Sentry Node.js SDK](https://docs.sentry.io/platforms/javascript/guides/node/)
- [Sentry Next.js SDK](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Story 3.1: Sentry Project Setup](./sprint-artifacts/3-1-set-up-sentry-project-and-configuration.md)
- [Story 3.2: Express Integration](./sprint-artifacts/3-2-integrate-sentry-with-express-server.md)
- [Story 3.3: Next.js Integration](./sprint-artifacts/3-3-integrate-sentry-with-nextjs-web-app.md)
