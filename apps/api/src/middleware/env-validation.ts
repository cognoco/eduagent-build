// ---------------------------------------------------------------------------
// Env Validation Middleware — validates c.env against config schema
// ---------------------------------------------------------------------------
//
// In Cloudflare Workers, environment bindings are per-request (c.env), not
// global (process.env). This middleware validates them on the first request
// only, then skips on subsequent requests via a module-level flag.
//
// In test environments (NODE_ENV === 'test'), validation is skipped entirely
// because tests mock individual env bindings and rarely provide all of them.
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { validateEnv } from '../config';
import { createLogger } from '../services/logger';

const logger = createLogger();

type EnvValidationEnv = {
  Bindings: Record<string, string | undefined>;
};

let validated = false;

export const envValidationMiddleware = createMiddleware<EnvValidationEnv>(
  async (c, next): Promise<Response | void> => {
    if (!validated) {
      // Skip in tests and local development — tests mock bindings selectively,
      // and Wrangler local bindings can differ slightly from deployed envs.
      // Optional chain on c.env: app.request() tests run without bindings.
      if (
        process.env['NODE_ENV'] !== 'test' &&
        c.env?.ENVIRONMENT !== 'development'
      ) {
        try {
          validateEnv(c.env as Record<string, string | undefined>);
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : 'Environment validation failed';
          // [logging sweep] structured logger so PII fields land as JSON context
          logger.error('[env-validation]', { message });
          return c.json({ code: 'ENV_VALIDATION_ERROR', message }, 500);
        }
      }
      validated = true;
    }
    await next();
  }
);

/** Reset validation state — only for testing */
export function resetEnvValidation(): void {
  validated = false;
}
