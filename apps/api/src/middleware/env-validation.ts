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

type EnvValidationEnv = {
  Bindings: Record<string, string | undefined>;
};

let validated = false;

export const envValidationMiddleware = createMiddleware<EnvValidationEnv>(
  async (c, next) => {
    if (!validated) {
      // Skip in test environments — tests mock env bindings selectively
      if (process.env['NODE_ENV'] === 'test') {
        validated = true;
        await next();
        return;
      }

      try {
        validateEnv(c.env as Record<string, string | undefined>);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Environment validation failed';
        console.error('[env-validation]', message);
        return c.json({ code: 'ENV_VALIDATION_ERROR', message }, 500);
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
