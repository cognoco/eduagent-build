/**
 * Test-only seed and reset endpoints.
 *
 * ALL routes under /__test/* are guarded by a single route-level middleware
 * that rejects requests in production. Auth is skipped via PUBLIC_PATHS
 * in auth middleware.
 *
 * POST /__test/seed              — Create a pre-configured test scenario
 * POST /__test/reset             — Delete seed-created data (clerk_seed_* accounts only)
 * GET  /__test/scenarios          — List valid scenario names
 * GET  /__test/debug/:email       — Debug: account→profile→subject chain by email
 * GET  /__test/debug-subjects/:id — Debug: simulate app's subject query path
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
// Local z import: this schema is test-infrastructure-only and does not belong in @eduagent/schemas
import { z } from 'zod';
import { ERROR_CODES } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import {
  seedScenario,
  resetDatabase,
  debugAccountsByEmail,
  debugSubjectsByClerkUserId,
  VALID_SCENARIOS,
  type SeedScenario,
  type SeedEnv,
} from '../services/test-seed';
import {
  routeAndCall,
  routeAndStream,
  getRegisteredProviders,
} from '../services/llm';

type TestEnv = {
  Bindings: {
    ENVIRONMENT: string;
    CLERK_SECRET_KEY?: string;
    TEST_SEED_SECRET?: string;
    SEED_PASSWORD?: string;
    /**
     * Neon connection string. Used by the destructive `/__test/reset` route as a
     * SECOND, independent guard (see isProductionDatabaseUrl): the single
     * ENVIRONMENT+secret check would re-open reset against the production DB if
     * Doppler ever mislabelled ENVIRONMENT (e.g. 'staging' in prod). The DB host
     * is an independent signal that a single env mislabel cannot forge.
     */
    DATABASE_URL?: string;
    /**
     * [BUG-725 / SEC-9] Opt-in flag for /__test/llm-ping. Defaults to disabled
     * even when TEST_SEED_SECRET is configured, so an exposed seed secret
     * cannot be used to burn LLM tokens. Set to 'true' explicitly when you
     * need the diagnostic in staging.
     */
    LLM_PING_ENABLED?: string;
  };
  Variables: { db: Database };
};

/**
 * [BUG-902] Production-database host markers. The destructive `/__test/reset`
 * endpoint is otherwise protected only by the single ENVIRONMENT+secret check
 * in the `/__test/*` middleware. A Doppler mislabel (ENVIRONMENT='staging' in
 * the production Worker) would defeat that one check and let `/reset` seed/wipe
 * the production database. The DB host is an independent signal: refuse reset
 * whenever the connection string points at a known production Neon endpoint,
 * regardless of what ENVIRONMENT claims.
 *
 * A denylist (not an allowlist) is used deliberately: an allowlist of non-prod
 * hosts would break every time Neon rotates a dev/staging endpoint, whereas the
 * production endpoint marker is long-lived and the one host we must never wipe.
 * The marker is the Neon project-id slug (stable across branch/compute rotation)
 * for the production database — see the verified env→DB map (prd =
 * `ep-holy-leaf`). Keep this in lockstep with the production DATABASE_URL.
 */
const PRODUCTION_DATABASE_HOST_MARKERS: readonly string[] = ['ep-holy-leaf'];
const NATIVE_SEED_SLOTS = [
  'native-01',
  'native-02',
  'native-03',
  'native-04',
  'native-05',
  'native-06',
  'native-07',
  'native-08',
] as const;

function nativeSeedSlotEmail(slot: (typeof NATIVE_SEED_SLOTS)[number]): string {
  return `test-e2e-${slot}+clerk_test@example.com`;
}

/**
 * Returns true when the given connection string points at a known production
 * database host. Case-insensitive substring match against
 * PRODUCTION_DATABASE_HOST_MARKERS. An undefined/empty URL returns false (the
 * primary ENVIRONMENT+secret guard still applies); this guard only adds a
 * second, independent refusal when the host is positively identified as prod.
 *
 * Exported for testing.
 */
export function isProductionDatabaseUrl(
  databaseUrl: string | undefined,
): boolean {
  if (!databaseUrl) return false;
  const lower = databaseUrl.toLowerCase();
  return PRODUCTION_DATABASE_HOST_MARKERS.some((marker) =>
    lower.includes(marker.toLowerCase()),
  );
}

const seedInputSchema = z
  .object({
    scenario: z.enum(VALID_SCENARIOS as [SeedScenario, ...SeedScenario[]]),
    email: z.string().email().optional(),
    nativeSeedSlot: z.enum(NATIVE_SEED_SLOTS).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.email && input.nativeSeedSlot) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nativeSeedSlot'],
        message: 'Provide either email or nativeSeedSlot, not both',
      });
    }
  })
  .transform((input) => ({
    scenario: input.scenario,
    email:
      input.email ??
      (input.nativeSeedSlot
        ? nativeSeedSlotEmail(input.nativeSeedSlot)
        : 'test-e2e@example.com'),
    nativeSeedSlot: input.nativeSeedSlot,
  }));

// [WI-983] Local schema for /__test/reset — test-infrastructure only, not in @eduagent/schemas.
// The whole body is optional. This preserves the pre-WI-983 contract for the CI seed-cleanup
// callers (`.github/workflows/e2e-web.yml:222-225`, `e2e-web-cleanup.yml:67-70`), which POST
// with NO body and NO Content-Type: Hono's json validator only calls c.req.json() when a JSON
// Content-Type is present, so an absent body is passed to the schema as `{}` → parses cleanly
// to `verifiedSeedClerkUserIds = undefined`, exactly as the old handler behaved. A present body
// is still strictly validated (a non-string array element → 400). See the bodyless-POST
// regression test in test-seed.test.ts.
const resetBodySchema = z.object({
  verifiedSeedClerkUserIds: z.array(z.string()).optional(),
});

export const testSeedRoutes = new Hono<TestEnv>();

// ---------------------------------------------------------------------------
// Environment + secret guard — protects ALL /__test/* routes
// ---------------------------------------------------------------------------
testSeedRoutes.use('/__test/*', async (c, next) => {
  // Fail-closed: only allow recognised non-production environments.
  // If ENVIRONMENT is undefined (e.g., a partial Doppler sync in production),
  // treat the request as production (403). Previously the guard only blocked
  // the literal string 'production', so an unset binding silently allowed
  // /__test/* routes through.
  if (c.env.ENVIRONMENT !== 'development' && c.env.ENVIRONMENT !== 'staging') {
    return c.json(
      { code: ERROR_CODES.FORBIDDEN, message: 'Not available in production' },
      403,
    );
  }

  // Require TEST_SEED_SECRET on non-development environments (e.g., staging).
  // On local development, the secret is optional to simplify the dev workflow.
  // IMPORTANT: never deploy with ENVIRONMENT=development pointing at a shared or
  // real database — that would expose seeding, reset, and account-enumeration
  // endpoints without a secret guard. Use 'staging' or 'production' for
  // any shared environment.
  const secret = c.env.TEST_SEED_SECRET;
  const isDev = c.env.ENVIRONMENT === 'development';

  if (!secret && !isDev) {
    return c.json(
      {
        code: ERROR_CODES.FORBIDDEN,
        message:
          'TEST_SEED_SECRET must be configured on non-development environments',
      },
      403,
    );
  }

  if (secret) {
    // Secret is read from a request header (not a query param) — headers are
    // not logged by proxies/CDNs or visible in browser history. Never accept
    // this secret via a query string parameter.
    const headerSecret = c.req.header('X-Test-Secret') ?? '';
    // CI-06: HMAC-based constant-time comparison to prevent timing attacks.
    // Both inputs are hashed to fixed-length SHA-256 digests before XOR
    // comparison, eliminating the length-leak side-channel.
    const encoder = new TextEncoder();
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode('test-seed-compare'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const [digestA, digestB] = await Promise.all([
      crypto.subtle.sign('HMAC', hmacKey, encoder.encode(headerSecret)),
      crypto.subtle.sign('HMAC', hmacKey, encoder.encode(secret)),
    ]);
    const hashA = new Uint8Array(digestA);
    const hashB = new Uint8Array(digestB);
    let diff = 0;
    for (let i = 0; i < hashA.length; i++) {
      diff |= (hashA[i] ?? 0) ^ (hashB[i] ?? 0);
    }
    if (diff !== 0) {
      return c.json(
        {
          code: ERROR_CODES.FORBIDDEN,
          message: 'Invalid or missing test secret',
        },
        403,
      );
    }
  }

  return next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

testSeedRoutes.post(
  '/__test/seed',
  zValidator('json', seedInputSchema),
  async (c) => {
    const db = c.get('db');
    const { scenario, email } = c.req.valid('json');
    const seedEnv: SeedEnv = {
      CLERK_SECRET_KEY: c.env.CLERK_SECRET_KEY,
      SEED_PASSWORD: c.env.SEED_PASSWORD,
    };
    const result = await seedScenario(db, scenario, email, seedEnv);
    return c.json(result, 201);
  },
);

testSeedRoutes.post(
  '/__test/reset',
  // [WI-983] Validate the optional reset body — replaces the old manual `as` casts
  // and Array.isArray/typeof checks with a proper Zod parse at the route boundary.
  // Unlike `zValidator('json', …)` (which calls c.req.json() and 400s on an absent
  // or empty body), this custom validator tolerates a bodyless POST by defaulting to
  // `{}` — preserving the pre-WI-983 contract relied on by the CI seed-cleanup curls,
  // while still rejecting a present-but-malformed body via resetBodySchema.
  zValidator('json', resetBodySchema),
  async (c) => {
    // [BUG-902] Second, independent guard for the destructive reset. The
    // `/__test/*` middleware already rejects production via ENVIRONMENT+secret,
    // but a single Doppler mislabel (ENVIRONMENT='staging' in prod) would defeat
    // that one check. Refuse the wipe whenever the connection string points at a
    // known production DB host, regardless of what ENVIRONMENT claims — so no
    // single env mislabel can re-open reset against production data.
    if (isProductionDatabaseUrl(c.env.DATABASE_URL)) {
      return c.json(
        {
          code: ERROR_CODES.FORBIDDEN,
          message:
            'Refusing /__test/reset: DATABASE_URL points at a production database host',
        },
        403,
      );
    }

    const db = c.get('db');
    const seedEnv: SeedEnv = {
      CLERK_SECRET_KEY: c.env.CLERK_SECRET_KEY,
      SEED_PASSWORD: c.env.SEED_PASSWORD,
    };
    const prefix = c.req.query('prefix')?.trim() || undefined;
    const preserveClerkUsers = c.req.query('preserveClerkUsers') === 'true';
    const { verifiedSeedClerkUserIds } = c.req.valid('json');

    const { deletedCount, clerkUsersDeleted } = await resetDatabase(
      db,
      seedEnv,
      {
        prefix,
        preserveClerkUsers,
        verifiedSeedClerkUserIds,
      },
    );
    return c.json({
      message: 'Database reset complete',
      deletedCount,
      clerkUsersDeleted,
    });
  },
);

testSeedRoutes.get('/__test/scenarios', (c) => {
  return c.json({ scenarios: VALID_SCENARIOS });
});

/**
 * Debug endpoint: returns account → profiles → subjects chain for a given email.
 * Used to verify seed data matches what the app sees after Clerk sign-in.
 */
testSeedRoutes.get('/__test/debug/:email', async (c) => {
  const db = c.get('db');
  const email = c.req.param('email');
  const result = await debugAccountsByEmail(db, email);
  return c.json({ accounts: result, count: result.length });
});

/**
 * Debug endpoint: simulate the exact subjects query path the app uses.
 * Walks: clerkUserId → account → profile (owner) → subjects.
 */
testSeedRoutes.get('/__test/debug-subjects/:clerkUserId', async (c) => {
  const db = c.get('db');
  const clerkUserId = c.req.param('clerkUserId');
  const outcome = await debugSubjectsByClerkUserId(db, clerkUserId);

  if ('error' in outcome) {
    return c.json(outcome, 404);
  }
  return c.json(outcome.result);
});

/**
 * LLM diagnostic endpoint — test-only.
 * GET /__test/llm-ping — calls routeAndCall with a simple prompt.
 * GET /__test/llm-ping?stream=1 — tests streaming via routeAndStream.
 */
testSeedRoutes.get('/__test/llm-ping', async (c) => {
  // [BUG-725 / SEC-9] Opt-in environment guard layered on top of the existing
  // shared-secret check. The shared secret alone is not enough because anyone
  // with the secret could burn LLM tokens at will (cost-DoS). Default-deny in
  // non-development environments unless `LLM_PING_ENABLED='true'` is set.
  // Production is already blocked at the route-level middleware above.
  const isDev = c.env.ENVIRONMENT === 'development';
  const explicitlyEnabled = c.env.LLM_PING_ENABLED === 'true';
  if (!isDev && !explicitlyEnabled) {
    return c.json(
      {
        code: ERROR_CODES.FORBIDDEN,
        message:
          'LLM ping is dev-only by default. Set LLM_PING_ENABLED=true to opt in on this environment.',
      },
      403,
    );
  }

  const providers = getRegisteredProviders();
  const useStream = c.req.query('stream') === '1';

  const messages = [
    { role: 'system' as const, content: 'Reply with exactly one word.' },
    { role: 'user' as const, content: 'Say hello.' },
  ];

  try {
    if (useStream) {
      const result = await routeAndStream(messages, 1);
      let fullText = '';
      for await (const chunk of result.stream) {
        fullText += chunk;
      }
      return c.json({
        ok: true,
        mode: 'stream',
        provider: result.provider,
        model: result.model,
        fallbackUsed: result.fallbackUsed ?? false,
        response: fullText.trim(),
        registeredProviders: providers,
      });
    }

    // conversationLanguage not threaded: test-seeding infrastructure, not learner-facing
    const result = await routeAndCall(messages, 1);
    return c.json({
      ok: true,
      mode: 'call',
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      response: result.response.trim(),
      registeredProviders: providers,
    });
  } catch (err) {
    return c.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        registeredProviders: providers,
      },
      500,
    );
  }
});
