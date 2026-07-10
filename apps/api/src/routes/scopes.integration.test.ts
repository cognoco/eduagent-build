import { resolve } from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  createDatabase,
  generateUUIDv7,
  person,
  supportership,
  type Database,
} from '@eduagent/database';
import { ERROR_CODES, ForbiddenError } from '@eduagent/schemas';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { scopesRoutes } from './scopes';
import {
  deleteLegacyAccountsForTest,
  deleteV2IdentitiesForTest,
  ensureLegacyProfileAnchorForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

type TestEnv = {
  Variables: {
    db: Database;
    profileId: string | undefined;
    profileMeta: undefined;
    user: unknown;
  };
};

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return url;
}

function createIntegrationDb(): Database {
  return createDatabase(requireDatabaseUrl());
}

function makeApp(db: Database, profileId: string) {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('profileId', profileId);
    c.set('profileMeta', undefined);
    await next();
  });
  app.route('/v1', scopesRoutes);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    if (err instanceof ForbiddenError) {
      return c.json({ code: ERROR_CODES.FORBIDDEN, message: err.message }, 403);
    }
    throw err;
  });
  return app;
}

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `integ-scopes-coldstart-${RUN_ID}`;
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];
const seededSupportershipIds: string[] = [];

async function seedProfile(database: Database, label: string): Promise<string> {
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  const clerkUserId = `${CLERK_PREFIX}-${label}`;
  const email = `${CLERK_PREFIX}-${label}@test.invalid`;

  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  await ensureLegacyProfileAnchorForTest(database, {
    accountId,
    profileId,
    clerkUserId,
    email,
    displayName: `Coldstart ${label}`,
    birthYear: 2010,
    isOwner: true,
  });
  await ensureV2IdentityForLegacyProfileTest(database, {
    accountId,
    profileId,
    clerkUserId,
    email,
    displayName: `Coldstart ${label}`,
    birthYear: 2010,
    isOwner: true,
  });

  return profileId;
}

async function seedSupportership(
  database: Database,
  supporterPersonId: string,
  supporteePersonId: string,
): Promise<string> {
  const [row] = await database
    .insert(supportership)
    .values({
      supporterPersonId,
      supporteePersonId,
    })
    .returning({ id: supportership.id });

  if (!row) throw new Error('Failed to seed supportership');
  seededSupportershipIds.push(row.id);
  return row.id;
}

async function cleanup(database: Database): Promise<void> {
  if (seededSupportershipIds.length > 0) {
    await database
      .delete(supportership)
      .where(inArray(supportership.id, seededSupportershipIds));
  }
  await deleteV2IdentitiesForTest(database, {
    accountIds: seededAccountIds,
    profileIds: seededProfileIds,
  });
  await deleteLegacyAccountsForTest(database, seededAccountIds);
  seededSupportershipIds.length = 0;
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
}

let db: Database;

beforeAll(async () => {
  db = createIntegrationDb();
  await cleanup(db);
});

afterAll(async () => {
  await cleanup(db);
});

describe('Integration: GET /scopes/coldstart', () => {
  it('returns variant-zero with a single add-child card when no active supportership edges exist', async () => {
    const supporterId = await seedProfile(db, 'variant-zero');

    const res = await makeApp(db, supporterId).request('/v1/scopes/coldstart');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      variant: 'variant-zero',
      cards: [{ state: 'none', anchor: 'add-child' }],
      selfLearningDoorway: true,
    });
  });

  it('returns per-child variant with a granted-idle card when an active supportership edge is seeded', async () => {
    const supporterId = await seedProfile(db, 'per-child-supporter');
    const childId = await seedProfile(db, 'per-child-child');
    const edgeId = await seedSupportership(db, supporterId, childId);

    await db
      .update(person)
      .set({ hasOwnAccount: true })
      .where(eq(person.id, childId));

    const res = await makeApp(db, supporterId).request('/v1/scopes/coldstart');

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      variant: string;
      cards: Array<{
        state: string;
        anchor: string;
        personId?: string;
        edgeId?: string;
        displayName?: string;
        staleIdleStep?: number;
      }>;
      selfLearningDoorway: boolean;
    };

    expect(body.variant).toBe('per-child');
    expect(body.selfLearningDoorway).toBe(true);
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]).toMatchObject({
      state: 'granted-idle',
      anchor: 'kickstart',
      personId: childId,
      edgeId,
    });
    expect(body.cards[0]?.staleIdleStep).toBeUndefined();
  });
});
