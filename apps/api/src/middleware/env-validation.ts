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
import { validateEnv, validateProductionBindings } from '../config';
import type { Env, ProductionBindings } from '../config';
import { createLogger } from '../services/logger';

const logger = createLogger();

type EnvValidationEnv = {
  Bindings: Record<string, string | undefined> & ProductionBindings;
};

// [BUG-486] Replace the simple `validated` boolean with an env-key hash so
// that:
//  (a) a transient validation failure on request N does NOT permanently lock
//      the isolate into "validated" state — the hash stays null and request
//      N+1 retries validation.
//  (b) if the Worker is reused across different env objects (preview → prod)
//      the new env is validated fresh.
//
// Strategy: hash the env bindings that are meaningful for validation into a
// string.  After SUCCESSFUL validation, store the hash.  On failure, leave
// the hash unset so the next request retries.  The hash is only updated
// AFTER the full validation block passes — there is no try/finally flip.
let _validatedEnvHash: string | null = null;

function _envValidationHash(
  env: Record<string, string | undefined> & Partial<ProductionBindings>,
): string {
  // Use DATABASE_URL + ENVIRONMENT as the minimal discriminator — these are
  // the two values that change between environments and trigger re-validation.
  // Separator `|` is safe: URLs and environment names never contain it.
  return `${env['DATABASE_URL'] ?? ''}|${env['ENVIRONMENT'] ?? ''}`;
}

export const envValidationMiddleware = createMiddleware<EnvValidationEnv>(
  async (c, next): Promise<Response | void> => {
    const currentHash = _envValidationHash(
      c.env as Record<string, string | undefined>,
    );

    if (_validatedEnvHash !== currentHash) {
      // Skip in tests and local development — tests mock bindings selectively,
      // and Wrangler local bindings can differ slightly from deployed envs.
      // Optional chain on c.env: app.request() tests run without bindings.
      if (
        process.env['NODE_ENV'] !== 'test' &&
        c.env?.ENVIRONMENT !== 'development'
      ) {
        let parsedEnv: Env;
        try {
          parsedEnv = validateEnv(
            c.env as unknown as Record<string, string | undefined>,
          );
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : 'Environment validation failed';
          logger.error('[env-validation]', { message });
          // [BUG-486] Do NOT update _validatedEnvHash on failure — next
          // request with the same env will retry validation.
          return c.json({ code: 'ENV_VALIDATION_ERROR', message }, 500);
        }

        const bindingResult = validateProductionBindings(
          parsedEnv,
          c.env as ProductionBindings,
        );
        if (bindingResult.missing.length > 0) {
          // Production deploy gate: refuse to serve traffic when a binding
          // gating replay-dedup / idempotency is absent. The override flag
          // is checked inside validateProductionBindings.
          const message = `Production environment missing required bindings: ${bindingResult.missing.join(', ')}. Set the binding in wrangler.toml or opt into the prelaunch override flag (e.g. ALLOW_MISSING_IDEMPOTENCY_KV='true') to bypass — see config.ts for the risk this carries.`;
          logger.error('[env-validation] binding gate failed', {
            event: 'env-validation.binding_gate_failed',
            missing: bindingResult.missing,
          });
          // [BUG-486] Do NOT update _validatedEnvHash — binding failures are
          // retried on the next request (binding may become available).
          return c.json({ code: 'ENV_VALIDATION_ERROR', message }, 500);
        }
        if (bindingResult.overrideApplied) {
          // Loud structured warning so the override is queryable in
          // telemetry. CLAUDE.md "Silent recovery without escalation is
          // banned" applies — running prod without IDEMPOTENCY_KV is a
          // real risk and must be visible.
          logger.warn(
            '[env-validation] production running without IDEMPOTENCY_KV — prelaunch override active',
            {
              event: 'env-validation.idempotency_kv_override_active',
            },
          );
        }
      }
      // [BUG-486] Hash is updated ONLY after the full validation block
      // succeeds.  A failed validation leaves the hash unset so the next
      // request retries — unlike the old boolean which flipped to `true`
      // even when the validation block was bypassed (test/dev) making the
      // "only validates once" test pass vacuously.
      _validatedEnvHash = currentHash;
    }
    await next();
  },
);

/** Reset validation state — only for testing */
export function resetEnvValidation(): void {
  _validatedEnvHash = null;
}
