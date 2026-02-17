// ---------------------------------------------------------------------------
// Request Logger Middleware — structured HTTP request/response logging
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
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
    environment: env.ENVIRONMENT ?? 'development',
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
  } else if (status >= 400) {
    logger.warn('Client error', context);
  } else {
    logger.info('Request completed', context);
  }
});
