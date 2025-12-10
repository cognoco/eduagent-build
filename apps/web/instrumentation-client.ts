/**
 * Next.js Client Instrumentation File
 *
 * This file is automatically loaded by Next.js in the browser before the
 * application starts. It's the recommended place to initialize client-side
 * monitoring and instrumentation tools in Next.js 15+.
 *
 * This replaces the legacy sentry.client.config.ts approach for better
 * Turbopack compatibility and follows the standard Next.js instrumentation pattern.
 *
 * What this captures:
 * - JavaScript runtime errors
 * - React component errors
 * - Unhandled promise rejections
 * - Performance metrics (Core Web Vitals)
 *
 * Environment Variables Required:
 * - NEXT_PUBLIC_SENTRY_DSN: Sentry project DSN (must have NEXT_PUBLIC_ prefix)
 * - NEXT_PUBLIC_VERCEL_ENV: Vercel environment (or falls back to NODE_ENV)
 * - VERCEL_GIT_COMMIT_SHA: Git commit SHA for release tracking (optional)
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 * Sentry: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
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

  // Only enable Sentry when DSN is explicitly provided
  // This ensures Sentry doesn't run with overhead but no destination
  // In development: disabled unless DSN is set for testing
  // In production: disabled if DSN is missing (avoids silent failure)
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Debugging (disabled in production)
  debug: false,

  // Breadcrumbs - capture context leading up to errors
  maxBreadcrumbs: 50,

  // Attach stack traces to captured messages (not just errors)
  attachStacktrace: true,
});

/**
 * Capture client-side route transitions for performance monitoring.
 *
 * This hook is called when the Next.js App Router transitions between routes,
 * allowing Sentry to track navigation performance metrics.
 *
 * Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
