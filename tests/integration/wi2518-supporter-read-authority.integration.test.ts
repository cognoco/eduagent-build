/**
 * End-to-end regression for WI-2518 (G30/G32).
 *
 * A credentialed non-owner authenticates through the real middleware chain,
 * then selects a different same-organization profile via X-Profile-Id. Only
 * that selected profile initially owns the accepted supportership edge. The
 * server-resolved callerPersonId must remain the authorization anchor.
 */

import { eq } from 'drizzle-orm';
import {
  createDatabase,
  generateUUIDv7,
  login,
  membership,
  person,
  retentionCards,
  type Database,
} from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  requireDatabaseUrl,
} from './helpers';
import { buildAuthHeaders } from './test-keys';
import { clearFetchCalls } from './fetch-interceptor';
import { mockInngestEvents } from './mocks';

import { app } from '../../apps/api/src/index';
import {
  acceptLink,
  initiateLink,
} from '../../apps/api/src/services/linking-ceremony';
import { createSubjectWithCurriculum } from '../../apps/api/src/services/test-seed';

const TEST_ENV = buildIntegrationEnv();
const RUN_ID = generateUUIDv7();
const EDGE_HOLDER = {
  userId: `wi2518-edge-holder-${RUN_ID}`,
  email: `wi2518-edge-holder-${RUN_ID}@integration.test`,
};
const CALLER = {
  userId: `wi2518-caller-${RUN_ID}`,
  email: `wi2518-caller-${RUN_ID}@integration.test`,
};
const SUPPORTEE = {
  userId: `wi2518-supportee-${RUN_ID}`,
  email: `wi2518-supportee-${RUN_ID}@integration.test`,
};
const ALL_EMAILS = [EDGE_HOLDER.email, CALLER.email, SUPPORTEE.email];
const ALL_USER_IDS = [EDGE_HOLDER.userId, CALLER.userId, SUPPORTEE.userId];

let db: Database;

beforeAll(() => {
  mockInngestEvents();
  db = createDatabase(requireDatabaseUrl());
});

beforeEach(async () => {
  jest.clearAllMocks();
  clearFetchCalls();
  await cleanupAccounts({ emails: ALL_EMAILS, clerkUserIds: ALL_USER_IDS });
});

afterAll(async () => {
  await cleanupAccounts({ emails: ALL_EMAILS, clerkUserIds: ALL_USER_IDS });
});

async function createOwner(user: {
  userId: string;
  email: string;
}): Promise<{ personId: string; organizationId: string }> {
  const response = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders({ sub: user.userId, email: user.email }),
      body: JSON.stringify({ displayName: user.userId, birthYear: 1985 }),
    },
    TEST_ENV,
  );
  expect(response.status).toBe(201);
  const body = (await response.json()) as { profile: { id: string } };
  const membershipRow = await db.query.membership.findFirst({
    where: eq(membership.personId, body.profile.id),
    columns: { organizationId: true },
  });
  if (!membershipRow) throw new Error('Owner membership was not created');
  return {
    personId: body.profile.id,
    organizationId: membershipRow.organizationId,
  };
}

async function createCredentialedNonOwner(
  organizationId: string,
): Promise<string> {
  const [caller] = await db
    .insert(person)
    .values({
      displayName: 'WI-2518 credentialed non-owner',
      birthDate: '2000-01-01',
      residenceJurisdiction: 'US',
    })
    .returning({ id: person.id });
  if (!caller) throw new Error('Caller person was not created');
  await db.insert(login).values({
    personId: caller.id,
    clerkUserId: CALLER.userId,
    email: CALLER.email,
  });
  await db.insert(membership).values({
    personId: caller.id,
    organizationId,
    roles: ['learner'],
  });
  return caller.id;
}

async function acceptSupportership(
  supporterPersonId: string,
  supporteePersonId: string,
): Promise<void> {
  const initiated = await initiateLink(db, {
    supporterPersonId,
    supporteePersonId,
    relation: 'other',
    managedTier: false,
  });
  await acceptLink(db, initiated.id, {
    actorPersonId: supporterPersonId,
    audience: 'supporter',
    contractVersion: initiated.contractVersion,
  });
  const accepted = await acceptLink(db, initiated.id, {
    actorPersonId: supporteePersonId,
    audience: 'supportee',
    contractVersion: initiated.contractVersion,
  });
  expect(accepted.status).toBe('accepted');
}

async function seedVisibleNowCards(
  supporteePersonId: string,
  marker: string,
): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    const curriculum = await createSubjectWithCurriculum(
      db,
      supporteePersonId,
      `${marker}-${index}`,
    );
    await db.insert(retentionCards).values({
      profileId: supporteePersonId,
      topicId: curriculum.topicIds[0]!,
      xpStatus: 'pending',
      nextReviewAt: new Date(`2020-01-0${index + 1}T00:00:00.000Z`),
    });
  }
}

describe('WI-2518: supporter reads bind authority to the authenticated caller', () => {
  it('rejects a borrowed selected-profile edge on Now and structural subjects, then accepts the caller own edge', async () => {
    const edgeHolder = await createOwner(EDGE_HOLDER);
    const callerPersonId = await createCredentialedNonOwner(
      edgeHolder.organizationId,
    );
    const supportee = await createOwner(SUPPORTEE);
    const marker = `wi2518-private-${RUN_ID}`;

    await acceptSupportership(edgeHolder.personId, supportee.personId);
    await seedVisibleNowCards(supportee.personId, marker);

    const borrowedHeaders = buildAuthHeaders(
      { sub: CALLER.userId, email: CALLER.email },
      edgeHolder.personId,
    );
    for (const path of [
      `/v1/now?scope=person&personId=${supportee.personId}`,
      `/v1/now/overflow?scope=person&personId=${supportee.personId}`,
      `/v1/scopes/${supportee.personId}/subjects`,
    ]) {
      const response = await app.request(
        path,
        { headers: borrowedHeaders },
        TEST_ENV,
      );
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain(marker);
    }
    for (const path of [
      '/v1/now?scope=supporter-hub',
      '/v1/now/overflow?scope=supporter-hub',
    ]) {
      const response = await app.request(
        path,
        { headers: borrowedHeaders },
        TEST_ENV,
      );
      expect(response.status).toBe(200);
      expect(await response.text()).not.toContain(marker);
    }

    await acceptSupportership(callerPersonId, supportee.personId);
    const honestHeaders = buildAuthHeaders(
      { sub: CALLER.userId, email: CALLER.email },
      callerPersonId,
    );
    for (const path of [
      `/v1/now?scope=person&personId=${supportee.personId}`,
      `/v1/now/overflow?scope=person&personId=${supportee.personId}`,
      '/v1/now?scope=supporter-hub',
      '/v1/now/overflow?scope=supporter-hub',
      `/v1/scopes/${supportee.personId}/subjects`,
    ]) {
      const response = await app.request(
        path,
        { headers: honestHeaders },
        TEST_ENV,
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(marker);
    }
  });
});
