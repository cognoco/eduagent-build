/**
 * Sentry Instrumentation
 *
 * This file initializes Sentry for error tracking and performance monitoring.
 * It must be imported BEFORE any other application code to ensure proper error capture.
 *
 * Configuration:
 * - DSN: Set via SENTRY_DSN_SERVER environment variable
 * - Environment: Automatically tagged using NODE_ENV
 * - Performance: Trace sampling rates differ by environment
 * - Release: Uses package version for release tracking
 */

import * as Sentry from '@sentry/node';

/**
 * Initialize Sentry SDK
 *
 * This function configures Sentry with environment-specific settings.
 * It should be called as early as possible in the application lifecycle.
 *
 * Environment Variables:
 * - SENTRY_DSN_SERVER: Sentry Data Source Name (required for Sentry to work)
 * - NODE_ENV: Environment name (development, test, production)
 * - npm_package_version: Package version for release tracking
 */
export function initSentry(): void {
  // Only initialize if DSN is provided
  if (!process.env.SENTRY_DSN_SERVER) {
    console.warn(
      '⚠️  Sentry DSN not configured (SENTRY_DSN_SERVER). Error tracking disabled.'
    );
    return;
  }

  const environment = process.env.NODE_ENV || 'development';
  const isProduction = environment === 'production';

  Sentry.init({
    dsn: process.env.SENTRY_DSN_SERVER,

    // Environment identification
    environment,

    // Release tracking (uses package.json version)
    release: process.env.npm_package_version || 'unknown',

    // Performance monitoring configuration
    // Production: 10% sample rate to reduce costs
    // Non-production: 100% to catch all issues during development
    tracesSampleRate: isProduction ? 0.1 : 1.0,

    // Enable debug mode in development for troubleshooting
    debug: environment === 'development',

    // Configure breadcrumbs for better error context
    maxBreadcrumbs: 50,

    // Attach stack traces to all messages
    attachStacktrace: true,

    // Note: In Sentry v8+, HTTP and Express integrations are automatic
    // via OpenTelemetry. No manual configuration needed.
  });

  console.log(`✅ Sentry initialized for environment: ${environment}`);
}

/**
 * Get Sentry instance for manual error reporting
 *
 * Use this to manually capture errors or add context to Sentry events.
 *
 * @example
 * import { getSentry } from './instrumentation';
 * const Sentry = getSentry();
 * Sentry.captureException(new Error('Something went wrong'));
 */
export function getSentry() {
  return Sentry;
}
