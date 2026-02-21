// ---------------------------------------------------------------------------
// Sentry Error Tracking — Thin wrapper for @sentry/cloudflare
// Pure service, no Hono imports. Gracefully no-ops when DSN is missing.
// ---------------------------------------------------------------------------

import * as Sentry from '@sentry/cloudflare';

export interface ErrorContext {
  userId?: string;
  profileId?: string;
  requestPath?: string;
}

/**
 * Captures an exception in Sentry with optional user/request context.
 *
 * Safe to call even when Sentry is not configured — the SDK no-ops
 * when no DSN was provided to `withSentry()`.
 */
export function captureException(err: unknown, context?: ErrorContext): void {
  Sentry.withScope((scope) => {
    if (context?.userId) {
      scope.setUser({ id: context.userId });
    }
    if (context?.profileId) {
      scope.setTag('profileId', context.profileId);
    }
    if (context?.requestPath) {
      scope.setTag('requestPath', context.requestPath);
    }
    Sentry.captureException(err);
  });
}

/**
 * Adds a breadcrumb to the current Sentry scope.
 */
export function addBreadcrumb(
  message: string,
  category?: string,
  level?: Sentry.SeverityLevel
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    level: level ?? 'info',
  });
}
