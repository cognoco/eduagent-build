// ---------------------------------------------------------------------------
// Request Logger Middleware — structured HTTP request/response logging
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { captureMessage } from '../services/sentry';
import { createLogger, type LogLevel } from '../services/logger';

export const requestLogger = createMiddleware<{
  Bindings: { ENVIRONMENT?: string; LOG_LEVEL?: string };
  Variables: { user?: { userId: string; profileId?: string } };
}>(async (c, next) => {
  const start = Date.now();

  await next();

  const latencyMs = Date.now() - start;
  const status = c.res.status;
  const user = c.get('user') as
    | { userId: string; profileId?: string }
    | undefined;

  const env = c.env ?? {};
  const logger = createLogger({
    level: (env.LOG_LEVEL as LogLevel) ?? 'info',
  });

  const context: Record<string, unknown> = {
    method: c.req.method,
    path: c.req.path,
    status,
    latencyMs,
  };

  if (user?.profileId) {
    context.profileId = user.profileId;
  }

  if (status >= 500) {
    logger.error('Request failed', context);
    // Capture non-exception 5xx responses (e.g. explicit error() calls that
    // never throw). Thrown errors are already captured by the global error
    // handler — this is the complementary path for status-only failures.
    captureMessage('5xx response', {
      requestPath: c.req.path,
      extra: { status, method: c.req.method, latencyMs },
      level: 'error',
    });
  } else if (status >= 400) {
    logger.warn('Client error', context);
  } else {
    logger.info('Request completed', context);
  }
});
