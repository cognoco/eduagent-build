import { Hono } from 'hono';
import type { Context } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import { inngest } from '../inngest/client';
import { captureException } from '../services/sentry';
import { apiError } from '../errors';
import { isMaintenanceProductionEnabled } from '../config';

type MaintenanceEnv = {
  Bindings: {
    ENVIRONMENT?: string;
    MAINTENANCE_SECRET?: string;
    /**
     * [BUG-875] Explicit opt-in to run the backfill routes in production.
     * Default-closed: only the literal string 'true' enables them. See
     * isMaintenanceProductionEnabled in config.ts.
     */
    MAINTENANCE_PRODUCTION_ENABLED?: string;
    SENTRY_DSN?: string;
  };
};

// Private domain-separation label — not a secret, not caller-visible.
// Mirrors the canonical HMAC compare pattern at
// apps/api/src/routes/revenuecat-webhook.ts:59 (constantTimeCompare).
const HMAC_COMPARISON_LABEL = 'eduagent-maintenance-hmac-comparison-v1';

/**
 * HMAC-based constant-time comparison. Both inputs are hashed with SHA-256
 * HMAC before XOR comparison, producing fixed-length 32-byte digests
 * regardless of input length. This eliminates the length-leak timing
 * side-channel — no early-exit on length mismatch.
 */
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(HMAC_COMPARISON_LABEL),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const [digestA, digestB] = await Promise.all([
    crypto.subtle.sign('HMAC', hmacKey, encoder.encode(a)),
    crypto.subtle.sign('HMAC', hmacKey, encoder.encode(b)),
  ]);

  const bytesA = new Uint8Array(digestA);
  const bytesB = new Uint8Array(digestB);

  // Fixed-length XOR — always 32 bytes, constant time.
  let diff = 0;
  for (let i = 0; i < bytesA.length; i += 1) {
    diff |= (bytesA[i] as number) ^ (bytesB[i] as number);
  }
  return diff === 0;
}

async function verifyMaintenanceSecret(c: {
  env: MaintenanceEnv['Bindings'];
  req: { header: (name: string) => string | undefined };
}): Promise<boolean> {
  const expected = c.env.MAINTENANCE_SECRET;
  // Secret is read from a request header (not a query param) — headers are
  // not logged by proxies/CDNs or visible in browser history. Never accept
  // this secret via a query string parameter.
  const provided = c.req.header('X-Maintenance-Secret');
  if (!expected || !provided) return false;
  return constantTimeEqual(provided, expected);
}

/**
 * [BUG-875] Fail-closed environment gate for the backfill routes. Mirrors the
 * test-seed.ts `/__test/*` guard: development and staging are always allowed;
 * production (and any unrecognised/undefined ENVIRONMENT — e.g. a partial
 * Doppler sync) is treated as production and refused UNLESS the explicit
 * MAINTENANCE_PRODUCTION_ENABLED='true' opt-in is set.
 *
 * Returns a 403 Response when the backfill must be refused, or null when the
 * caller may proceed. The MAINTENANCE_SECRET check is a separate, additional
 * layer applied by each route handler.
 */
function refuseBackfillByEnvironment(
  c: Context<MaintenanceEnv>,
): Response | null {
  const environment = c.env.ENVIRONMENT;
  // Recognised non-production environments may always run backfills.
  if (environment === 'development' || environment === 'staging') {
    return null;
  }
  // Production (and any unrecognised/undefined value) is fail-closed unless the
  // operator has explicitly opted in for this environment.
  if (isMaintenanceProductionEnabled(c.env.MAINTENANCE_PRODUCTION_ENABLED)) {
    return null;
  }
  return apiError(
    c,
    403,
    ERROR_CODES.FORBIDDEN,
    'Maintenance backfills are disabled in production. Set MAINTENANCE_PRODUCTION_ENABLED=true to opt in.',
  );
}

async function sendMaintenanceBackfillOrError(
  c: Context<MaintenanceEnv>,
  surface: string,
  eventName: string,
): Promise<Response> {
  try {
    // orphan-allow: generic relay — callers pass string-literal event names
    // (admin/memory-facts-backfill.requested, admin/progress-self-reports-backfill.requested),
    // both of which have registered handlers (memory-facts-backfill.ts:45,
    // weekly-self-reports.ts:362). The `name: eventName` indirection is a shared
    // helper, not an orphan; the literal names are caught by the harvest above.
    // core-send: maintenance backfill endpoints must report real dispatch status.
    await inngest.send({
      name: eventName,
      data: {
        requestedAt: new Date().toISOString(),
        environment: c.env.ENVIRONMENT ?? 'unknown',
      },
    });
  } catch (error) {
    captureException(error, {
      requestPath: c.req.path,
      extra: {
        surface,
        environment: c.env.ENVIRONMENT ?? 'unknown',
      },
    });
    return apiError(
      c,
      502,
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to queue maintenance backfill',
    );
  }

  return c.json({ queued: true });
}

export const maintenanceRoutes = new Hono<MaintenanceEnv>()
  .post('/maintenance/sentry-smoke', async (c) => {
    if (!(await verifyMaintenanceSecret(c))) {
      return apiError(
        c,
        403,
        ERROR_CODES.FORBIDDEN,
        'Maintenance secret required',
      );
    }

    const smokeId = crypto.randomUUID();
    captureException(new Error('Sentry smoke test'), {
      requestPath: c.req.path,
      extra: {
        surface: 'maintenance.sentry-smoke',
        smokeId,
        environment: c.env.ENVIRONMENT ?? 'unknown',
        sentryConfigured: Boolean(c.env.SENTRY_DSN),
      },
    });

    return c.json({
      captured: true,
      smokeId,
      sentryConfigured: Boolean(c.env.SENTRY_DSN),
    });
  })
  .post('/maintenance/memory-facts-backfill', async (c) => {
    const environmentRefusal = refuseBackfillByEnvironment(c);
    if (environmentRefusal) return environmentRefusal;

    if (!(await verifyMaintenanceSecret(c))) {
      return apiError(
        c,
        403,
        ERROR_CODES.FORBIDDEN,
        'Maintenance secret required',
      );
    }

    return sendMaintenanceBackfillOrError(
      c,
      'maintenance.memory-facts-backfill',
      'admin/memory-facts-backfill.requested',
    );
  })
  .post('/maintenance/progress-self-reports-backfill', async (c) => {
    const environmentRefusal = refuseBackfillByEnvironment(c);
    if (environmentRefusal) return environmentRefusal;

    if (!(await verifyMaintenanceSecret(c))) {
      return apiError(
        c,
        403,
        ERROR_CODES.FORBIDDEN,
        'Maintenance secret required',
      );
    }

    return sendMaintenanceBackfillOrError(
      c,
      'maintenance.progress-self-reports-backfill',
      'admin/progress-self-reports-backfill.requested',
    );
  });
