/**
 * Sentry Client-Side Configuration
 *
 * This configuration runs in the browser and captures:
 * - JavaScript runtime errors
 * - React component errors
 * - Unhandled promise rejections
 * - Performance metrics (Core Web Vitals)
 *
 * Environment Variables Required:
 * - NEXT_PUBLIC_SENTRY_DSN: Sentry project DSN (must have NEXT_PUBLIC_ prefix)
 * - NEXT_PUBLIC_VERCEL_ENV: Vercel environment (or falls back to NODE_ENV)
 * - VERCEL_GIT_COMMIT_SHA: Git commit SHA for release tracking (optional)
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  // Data Source Name - identifies which Sentry project receives events
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment tagging (staging, production, etc.)
  // Uses Vercel environment if deployed, otherwise falls back to NODE_ENV
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,

  // Release tracking - ties errors to specific code versions
  // Uses Vercel git commit SHA if available
  release: process.env.VERCEL_GIT_COMMIT_SHA
    ? `nx-monorepo@${process.env.VERCEL_GIT_COMMIT_SHA}`
    : undefined,

  // Performance monitoring sample rate
  // Production: 10% of transactions (reduce cost while maintaining visibility)
  // Development: 100% of transactions (full visibility during development)
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Integrations - additional tracking capabilities
  integrations: [
    // Browser tracing for performance monitoring
    // Automatically tracks:
    // - Page load performance
    // - Navigation timing
    // - Core Web Vitals (LCP, FID, CLS)
    // - XHR/Fetch requests
    Sentry.browserTracingIntegration(),

    // Replay integration for session recording (optional - can be enabled later)
    // Captures user interactions leading to errors
    // Sentry.replayIntegration({
    //   maskAllText: true,
    //   blockAllMedia: true,
    // }),
  ],

  // Only enable Sentry in production or when DSN is explicitly provided
  // Prevents noise during local development without DSN configured
  enabled:
    process.env.NODE_ENV === 'production' ||
    !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Debugging (disabled in production)
  debug: false,

  // Breadcrumbs - capture context leading up to errors
  maxBreadcrumbs: 50,

  // Attach stack traces to captured messages (not just errors)
  attachStacktrace: true,
});
