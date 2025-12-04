/**
 * Sentry Edge Runtime Configuration
 *
 * This configuration runs in the Edge Runtime (Vercel Edge Functions, Middleware).
 * Edge runtime has limited Node.js API access and requires lightweight configuration.
 *
 * Captures:
 * - Middleware errors
 * - Edge API route errors
 * - Edge runtime exceptions
 *
 * Environment Variables Required:
 * - NEXT_PUBLIC_SENTRY_DSN: Sentry project DSN
 * - NEXT_PUBLIC_VERCEL_ENV: Vercel environment
 * - VERCEL_GIT_COMMIT_SHA: Git commit SHA (optional)
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  // Data Source Name - same as client/server for unified project
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment tagging
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,

  // Release tracking - must match client/server config
  release: process.env.VERCEL_GIT_COMMIT_SHA
    ? `nx-monorepo@${process.env.VERCEL_GIT_COMMIT_SHA}`
    : undefined,

  // Performance monitoring sample rate
  // Edge functions are lightweight, so we can afford higher sampling
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  // Edge runtime has limited integration support
  // Most integrations are automatically handled by the SDK
  integrations: [],

  // Enable only in production or when DSN is provided
  enabled:
    process.env.NODE_ENV === 'production' ||
    !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Debugging
  debug: false,

  // Reduced breadcrumb limit for edge runtime (memory constraints)
  maxBreadcrumbs: 25,

  // Attach stack traces
  attachStacktrace: true,
});
