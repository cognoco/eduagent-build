// ---------------------------------------------------------------------------
// Maintenance Gate Middleware — the two-stage convergence freeze gate
// (WI-586 runbook §4 step 1 / cutover-plan §2.1).
//
// Mounted at the TOP of the chain in index.ts — BEFORE authMiddleware and
// accountMiddleware. This placement is load-bearing: accountMiddleware's
// findOrCreateAccount() JIT-inserts legacy `accounts` + a trial `subscriptions`
// row on ANY authenticated request (including a GET), so a route- or
// method-scoped "reject writes" gate would let a fresh user's GET create legacy
// rows after the final reseed. Gating before account resolution kills that JIT
// provisioning by construction.
//
// Two stages, both default-off (typed config, eslint G4):
//   - MAINTENANCE_READONLY (stage 1): 503 every request EXCEPT the health check
//     and the signed Inngest delivery endpoint /v1/inngest. /v1/inngest stays
//     open so in-flight Inngest runs can drain to zero through their step
//     callbacks (a blanket gate would deadlock the drain).
//   - MAINTENANCE_BLOCK_INNGEST (stage 2): after the drain reads zero, also 503
//     /v1/inngest — belt-and-braces against a stray late delivery or manual
//     replay landing mid-reseed.
//
// The gate is inert (passes through) in every normal deploy because both flags
// default to 'false'; it only activates during the operator-run convergence
// window.
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { isMaintenanceReadonly, isMaintenanceBlockInngest } from '../config';

type MaintenanceEnv = {
  Bindings: {
    MAINTENANCE_READONLY?: string;
    MAINTENANCE_BLOCK_INNGEST?: string;
  };
};

// Paths read here include the worker's /v1 basePath, because this middleware
// runs after index.ts applies basePath('/v1') (same convention auth.ts's
// PUBLIC_PATHS uses). The health check is ALWAYS exempt so liveness probes and
// the operator's own status polling keep working through the freeze.
const HEALTH_PATH = '/v1/health';
const INNGEST_PATH = '/v1/inngest';

/** Path match: exact equality or a sub-path under the segment separator. */
function pathMatches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/');
}

export const maintenanceGateMiddleware = createMiddleware<MaintenanceEnv>(
  async (c, next) => {
    const readonly = isMaintenanceReadonly(c.env?.MAINTENANCE_READONLY);
    // Stage 1 not active → gate is fully inert (the normal-deploy path).
    if (!readonly) {
      return next();
    }

    const path = c.req.path;

    // Health check is exempt in both stages.
    if (pathMatches(path, HEALTH_PATH)) {
      return next();
    }

    // The signed Inngest delivery endpoint is exempt in stage 1 (so the drain
    // can complete) and hard-blocked only once stage 2 is set.
    if (pathMatches(path, INNGEST_PATH)) {
      const blockInngest = isMaintenanceBlockInngest(
        c.env?.MAINTENANCE_BLOCK_INNGEST,
      );
      if (!blockInngest) {
        return next();
      }
    }

    // Everything else (all user/API/webhook traffic) is 503'd with a
    // Retry-After hint. Stripe and RevenueCat retry on 5xx, so webhook events
    // are deferred, not lost.
    c.header('Retry-After', '120');
    return c.json(
      {
        code: 'SERVICE_UNAVAILABLE',
        message:
          'Service temporarily in maintenance mode. Please retry shortly.',
      },
      503,
    );
  },
);
