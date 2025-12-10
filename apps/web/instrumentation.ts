/**
 * Next.js Instrumentation File
 *
 * This file is automatically loaded by Next.js when the server starts.
 * It's the recommended place to initialize server-side monitoring and
 * instrumentation tools in Next.js 15+.
 *
 * This file runs once per server instance and is ideal for:
 * - Setting up error tracking (Sentry)
 * - Initializing APM tools
 * - Registering global instrumentation
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 * Sentry: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */

import * as Sentry from '@sentry/nextjs';

export async function register() {
  // Only run on the server (Node.js runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Import and initialize Sentry server configuration
    await import('./sentry.server.config');
  }

  // Only run in Edge runtime (middleware, edge functions)
  if (process.env.NEXT_RUNTIME === 'edge') {
    // Import and initialize Sentry edge configuration
    await import('./sentry.edge.config');
  }
}

/**
 * Capture errors from React Server Components and other server-side requests.
 *
 * This hook is called for all server-side errors including:
 * - React Server Component rendering errors
 * - Route handlers
 * - Server Actions
 *
 * Requires @sentry/nextjs >= 8.28.0 and Next.js 15+
 *
 * Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation#onrequesterror-optional
 * Sentry: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#errors-from-nested-react-server-components
 */
export const onRequestError = Sentry.captureRequestError;
