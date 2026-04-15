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
  };
  Variables: { db: Database };
};

const seedInputSchema = z.object({
  scenario: z.enum(VALID_SCENARIOS as [SeedScenario, ...SeedScenario[]]),
  email: z.string().email().default('test-e2e@example.com'),
});

export const testSeedRoutes = new Hono<TestEnv>();

// ---------------------------------------------------------------------------
// Environment + secret guard — protects ALL /__test/* routes
// ---------------------------------------------------------------------------
testSeedRoutes.use('/__test/*', async (c, next) => {
  if (c.env.ENVIRONMENT === 'production') {
    return c.json(
      { code: ERROR_CODES.FORBIDDEN, message: 'Not available in production' },
      403
    );
  }

  // Require TEST_SEED_SECRET on non-development environments (e.g., staging).
  // On local development, the secret is optional to simplify the dev workflow.
  const secret = c.env.TEST_SEED_SECRET;
  const isDev = c.env.ENVIRONMENT === 'development';

  if (!secret && !isDev) {
    return c.json(
      {
        code: ERROR_CODES.FORBIDDEN,
        message:
          'TEST_SEED_SECRET must be configured on non-development environments',
      },
      403
    );
  }

  if (secret) {
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
      ['sign']
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
        403
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
  }
);

testSeedRoutes.post('/__test/reset', async (c) => {
  const db = c.get('db');
  const seedEnv: SeedEnv = {
    CLERK_SECRET_KEY: c.env.CLERK_SECRET_KEY,
    SEED_PASSWORD: c.env.SEED_PASSWORD,
  };
  const { deletedCount, clerkUsersDeleted } = await resetDatabase(db, seedEnv);
  return c.json({
    message: 'Database reset complete',
    deletedCount,
    clerkUsersDeleted,
  });
});

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
      500
    );
  }
});
