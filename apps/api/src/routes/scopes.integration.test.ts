import { resolve } from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  createDatabase,
  generateUUIDv7,
  login,
  person,
  subjects,
  supportership,
  type Database,
} from '@eduagent/database';
import { ERROR_CODES, ForbiddenError } from '@eduagent/schemas';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { scopesRoutes } from './scopes';
import { acceptLink, initiateLink } from '../services/linking-ceremony';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

type TestEnv = {
  Variables: {
    db: Database;
    profileId: string | undefined;
    profileMeta: undefined;
    callerPersonId: string | undefined;
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

function makeApp(
  db: Database,
  profileId: string,
  callerPersonId: string = profileId,
) {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('profileId', profileId);
    c.set('profileMeta', undefined);
    c.set('callerPersonId', callerPersonId);
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
const seededSubjectIds: string[] = [];

async function seedProfile(database: Database, label: string): Promise<string> {
  return seedProfileInAccount(database, label, generateUUIDv7(), true);
}

async function seedProfileInAccount(
  database: Database,
  label: string,
  accountId: string,
  isOwner: boolean,
): Promise<string> {
  const profileId = generateUUIDv7();
  const clerkUserId = `${CLERK_PREFIX}-${label}`;
  const email = `${CLERK_PREFIX}-${label}@test.invalid`;

  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  await ensureV2IdentityForLegacyProfileTest(database, {
    accountId,
    profileId,
    clerkUserId,
    email,
    displayName: `Coldstart ${label}`,
    birthYear: 2010,
    isOwner,
  });

  if (!isOwner) {
    const [loginRow] = await database
      .insert(login)
      .values({
        id: generateUUIDv7(),
        personId: profileId,
        clerkUserId,
        email,
      })
      .returning({ id: login.id });
    if (!loginRow) throw new Error('Failed to seed credentialed non-owner');
    await database
      .update(person)
      .set({ loginId: loginRow.id })
      .where(eq(person.id, profileId));
  }

  return profileId;
}

async function seedAcceptedContract(
  database: Database,
  supporterPersonId: string,
  supporteePersonId: string,
): Promise<string> {
  const initiated = await initiateLink(database, {
    supporterPersonId,
    supporteePersonId,
    relation: 'other',
    managedTier: false,
  });
  seededSupportershipIds.push(initiated.supportershipId);
  await acceptLink(database, initiated.id, {
    actorPersonId: supporterPersonId,
    audience: 'supporter',
    contractVersion: initiated.contractVersion,
  });
  const accepted = await acceptLink(database, initiated.id, {
    actorPersonId: supporteePersonId,
    audience: 'supportee',
    contractVersion: initiated.contractVersion,
  });
  expect(accepted.status).toBe('accepted');
  return initiated.supportershipId;
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
  if (seededSubjectIds.length > 0) {
    await database
      .delete(subjects)
      .where(inArray(subjects.id, seededSubjectIds));
  }
  if (seededSupportershipIds.length > 0) {
    await database
      .delete(supportership)
      .where(inArray(supportership.id, seededSupportershipIds));
  }
  await deleteV2IdentitiesForTest(database, {
    accountIds: seededAccountIds,
    profileIds: seededProfileIds,
  });
  seededSupportershipIds.length = 0;
  seededSubjectIds.length = 0;
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

describe('Integration: GET /scopes/:personId/subjects read authority', () => {
  it('[WI-2518][RGR] rejects a same-account non-owner borrowing the selected profile edge and allows the caller own accepted edge', async () => {
    const accountId = generateUUIDv7();
    const selectedEdgeHolderId = await seedProfileInAccount(
      db,
      'subjects-idor-selected-edge-holder',
      accountId,
      true,
    );
    const callerPersonId = await seedProfileInAccount(
      db,
      'subjects-idor-credentialed-non-owner',
      accountId,
      false,
    );
    const supporteeId = await seedProfile(db, 'subjects-idor-supportee');
    await seedAcceptedContract(db, selectedEdgeHolderId, supporteeId);
    const [subject] = await db
      .insert(subjects)
      .values({
        profileId: supporteeId,
        name: 'Borrowed edge must not reveal this subject',
      })
      .returning({ id: subjects.id });
    if (!subject) throw new Error('Failed to seed structural subject');
    seededSubjectIds.push(subject.id);

    const borrowedRes = await makeApp(
      db,
      selectedEdgeHolderId,
      callerPersonId,
    ).request(`/v1/scopes/${supporteeId}/subjects`);

    expect(borrowedRes.status).toBe(403);

    await seedAcceptedContract(db, callerPersonId, supporteeId);
    const honestRes = await makeApp(db, callerPersonId, callerPersonId).request(
      `/v1/scopes/${supporteeId}/subjects`,
    );

    expect(honestRes.status).toBe(200);
    const body = (await honestRes.json()) as {
      personId: string;
      subjects: Array<{ id: string; name: string }>;
    };
    expect(body.personId).toBe(supporteeId);
    expect(body.subjects).toContainEqual({
      id: subject.id,
      name: 'Borrowed edge must not reveal this subject',
      status: 'active',
      books: [],
    });
  });
});
