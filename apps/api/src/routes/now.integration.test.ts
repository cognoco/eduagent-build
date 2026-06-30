import { resolve } from 'node:path';
import { Hono } from 'hono';
import {
  createDatabase,
  generateUUIDv7,
  mentorActivityLedger,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { nowRoutes } from './now';
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
  app.route('/v1', nowRoutes);
  return app;
}

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `integ-now-${RUN_ID}`;
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

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
    displayName: `Now ${label}`,
    birthYear: 2010,
    isOwner: true,
  });
  await ensureV2IdentityForLegacyProfileTest(database, {
    accountId,
    profileId,
    clerkUserId,
    email,
    displayName: `Now ${label}`,
    birthYear: 2010,
    isOwner: true,
  });

  return profileId;
}

async function cleanup(database: Database): Promise<void> {
  await deleteV2IdentitiesForTest(database, {
    accountIds: seededAccountIds,
    profileIds: seededProfileIds,
  });
  await deleteLegacyAccountsForTest(database, seededAccountIds);
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

describe('Integration: now routes', () => {
  it('serves only self-scoped ledger candidates for the active profile', async () => {
    const profileA = await seedProfile(db, 'profile-a');
    const profileB = await seedProfile(db, 'profile-b');

    await db.insert(mentorActivityLedger).values([
      {
        profileId: profileA,
        actorJob: 'test',
        kind: 'milestone_reached',
        params: {
          marker: 'profile-a-only',
          milestoneId: 'milestone-a',
          milestoneType: 'session_count',
          threshold: 1,
        },
      },
      {
        profileId: profileB,
        actorJob: 'test',
        kind: 'milestone_reached',
        params: {
          marker: 'profile-b-only',
          milestoneId: 'milestone-b',
          milestoneType: 'session_count',
          threshold: 1,
        },
      },
    ]);

    const res = await makeApp(db, profileA).request('/v1/now?scope=self');

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cards: Array<{ params: Record<string, unknown> }>;
    };
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]?.params.marker).toBe('profile-a-only');
    expect(JSON.stringify(body)).not.toContain('profile-b-only');
  });
});
