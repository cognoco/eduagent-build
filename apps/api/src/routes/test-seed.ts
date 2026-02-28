/**
 * Test-only seed and reset endpoints.
 *
 * ALL routes under /__test/* are guarded by a single route-level middleware
 * that rejects requests in production. Auth is skipped via PUBLIC_PATHS
 * in auth middleware.
 *
 * POST /__test/seed       — Create a pre-configured test scenario
 * POST /__test/reset      — Delete seed-created data (clerk_seed_* accounts only)
 * GET  /__test/scenarios   — List valid scenario names
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
  VALID_SCENARIOS,
  type SeedScenario,
  type SeedEnv,
} from '../services/test-seed';

type TestEnv = {
  Bindings: { ENVIRONMENT: string; CLERK_SECRET_KEY?: string };
  Variables: { db: Database };
};

const seedInputSchema = z.object({
  scenario: z.enum(VALID_SCENARIOS as [SeedScenario, ...SeedScenario[]]),
  email: z.string().email().default('test-e2e@example.com'),
});

export const testSeedRoutes = new Hono<TestEnv>();

// ---------------------------------------------------------------------------
// Production guard — single middleware protects ALL /__test/* routes
// ---------------------------------------------------------------------------
testSeedRoutes.use('/__test/*', async (c, next) => {
  if (c.env.ENVIRONMENT === 'production') {
    return c.json(
      { code: ERROR_CODES.FORBIDDEN, message: 'Not available in production' },
      403
    );
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
    };
    const result = await seedScenario(db, scenario, email, seedEnv);
    return c.json(result, 201);
  }
);

testSeedRoutes.post('/__test/reset', async (c) => {
  const db = c.get('db');
  const seedEnv: SeedEnv = {
    CLERK_SECRET_KEY: c.env.CLERK_SECRET_KEY,
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
