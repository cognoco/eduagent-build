/**
 * Sentry Server-Side Configuration
 *
 * This configuration runs on the Next.js server and captures:
 * - Server-side rendering (SSR) errors
 * - API route errors
 * - Server component errors
 * - Node.js runtime errors
 *
 * Environment Variables Required:
 * - NEXT_PUBLIC_SENTRY_DSN: Sentry project DSN (same as client config)
 * - NEXT_PUBLIC_VERCEL_ENV: Vercel environment (or falls back to NODE_ENV)
 * - VERCEL_GIT_COMMIT_SHA: Git commit SHA for release tracking (optional)
 *
 * Note: Uses NEXT_PUBLIC_SENTRY_DSN because Next.js shares this between
 * client and server. Server-only env vars would require separate DSN.
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  // Data Source Name - same as client config for unified project
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment tagging
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,

  // Release tracking - must match client config for correlation
  release: process.env.VERCEL_GIT_COMMIT_SHA
    ? `nx-monorepo@${process.env.VERCEL_GIT_COMMIT_SHA}`
    : undefined,

  // Performance monitoring sample rate for server operations
  // Production: 10% (reduce cost, backend operations are high volume)
  // Development: 100% (full visibility)
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Integrations for server-side monitoring
  integrations: [
    // HTTP integration for tracking incoming requests
    Sentry.httpIntegration({
      tracing: true,
    }),

    // Node.js-specific integrations are automatically included
  ],

  // Enable only in production or when DSN is provided
  enabled:
    process.env.NODE_ENV === 'production' ||
    !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Debugging
  debug: false,

  // Breadcrumbs configuration
  maxBreadcrumbs: 50,

  // Attach stack traces to messages
  attachStacktrace: true,

  // Sample rate for error events (100% = capture all errors)
  sampleRate: 1.0,
});
