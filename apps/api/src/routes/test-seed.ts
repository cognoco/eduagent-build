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
import { eq } from 'drizzle-orm';
import {
  type Database,
  accounts,
  profiles,
  subjects,
} from '@eduagent/database';
import {
  seedScenario,
  resetDatabase,
  VALID_SCENARIOS,
  type SeedScenario,
  type SeedEnv,
} from '../services/test-seed';

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

  // When TEST_SEED_SECRET is configured, require it via X-Test-Secret header.
  // This prevents unauthorized access to seed/reset endpoints on dev/staging.
  const secret = c.env.TEST_SEED_SECRET;
  if (secret) {
    const headerSecret = c.req.header('X-Test-Secret');
    if (headerSecret !== secret) {
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

  const accountRows = await db.query.accounts.findMany({
    where: eq(accounts.email, email),
  });

  const result = await Promise.all(
    accountRows.map(async (acc) => {
      const profileRows = await db.query.profiles.findMany({
        where: eq(profiles.accountId, acc.id),
      });
      const profilesWithSubjects = await Promise.all(
        profileRows.map(async (prof) => {
          const subjectRows = await db.query.subjects.findMany({
            where: eq(subjects.profileId, prof.id),
          });
          return {
            id: prof.id,
            displayName: prof.displayName,
            personaType: prof.personaType,
            isOwner: prof.isOwner,
            subjects: subjectRows.map((s) => ({
              id: s.id,
              name: s.name,
              status: s.status,
            })),
          };
        })
      );
      return {
        id: acc.id,
        clerkUserId: acc.clerkUserId,
        email: acc.email,
        profiles: profilesWithSubjects,
      };
    })
  );

  return c.json({ accounts: result, count: result.length });
});

/**
 * Debug endpoint: simulate the exact subjects query path the app uses.
 * Walks: clerkUserId → account → profile (owner) → subjects.
 * Also tests listSubjects service directly.
 */
testSeedRoutes.get('/__test/debug-subjects/:clerkUserId', async (c) => {
  const db = c.get('db');
  const clerkUserId = c.req.param('clerkUserId');

  // Step 1: findOrCreateAccount path
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.clerkUserId, clerkUserId),
  });

  if (!account) {
    return c.json(
      { error: 'No account found for clerkUserId', clerkUserId },
      404
    );
  }

  // Step 2: listProfiles path
  const profileRows = await db.query.profiles.findMany({
    where: eq(profiles.accountId, account.id),
  });

  // Step 3: pick owner profile (same logic as mobile app)
  const ownerProfile = profileRows.find((p) => p.isOwner) ?? profileRows[0];
  if (!ownerProfile) {
    return c.json({ error: 'No profiles found', accountId: account.id }, 404);
  }

  // Step 4: listSubjects using scoped repository (exact same path as GET /v1/subjects)
  const { listSubjects } = await import('../services/subject');
  const subjectList = await listSubjects(db, ownerProfile.id);

  return c.json({
    account: {
      id: account.id,
      clerkUserId: account.clerkUserId,
      email: account.email,
    },
    profile: {
      id: ownerProfile.id,
      displayName: ownerProfile.displayName,
      isOwner: ownerProfile.isOwner,
    },
    subjects: subjectList,
    subjectCount: subjectList.length,
  });
});
