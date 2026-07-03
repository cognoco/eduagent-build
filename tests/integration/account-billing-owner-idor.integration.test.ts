/**
 * Integration: WI-1301 — /account/* and /billing/* owner gates trust
 * callerPersonId, not the client-supplied X-Profile-Id header.
 *
 * THE ATTACK: profileScopeMiddleware verifies X-Profile-Id belongs to the
 * caller's organization, but not that it is the caller's OWN identity. In a
 * family org (owner + non-owner child), an authenticated NON-OWNER can send
 * `X-Profile-Id: <owner's person id>` and have profileScopeMiddleware resolve
 * `profileMeta.isOwner = true` for that (impersonated) profile —
 * `assertOwnerProfile` alone would then wrongly authorize the request.
 *
 * These tests authenticate as the real non-owner (a distinct login/person,
 * same org) and let the real middleware chain resolve `callerPersonId` from
 * that login binding — the header spoof is the only attacker lever. Each
 * route must reject with 403 regardless of what X-Profile-Id claims.
 */

import { eq } from 'drizzle-orm';
import {
  createDatabase,
  generateUUIDv7,
  login,
  membership,
  person,
  type Database,
} from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
  requireDatabaseUrl,
} from './helpers';
import { buildAuthHeaders } from './test-keys';
import { mockInngestEvents } from './mocks';
import { clearFetchCalls } from './fetch-interceptor';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();

const RUN_ID = generateUUIDv7();
const OWNER_CLERK_ID = `wi1301-owner-${RUN_ID}`;
const OWNER_EMAIL = `wi1301-owner-${RUN_ID}@integration.test`;
const CHILD_CLERK_ID = `wi1301-child-${RUN_ID}`;
const CHILD_EMAIL = `wi1301-child-${RUN_ID}@integration.test`;

let db: Database;

beforeAll(() => {
  mockInngestEvents();
  db = createDatabase(requireDatabaseUrl());
});

beforeEach(async () => {
  jest.clearAllMocks();
  clearFetchCalls();
  await cleanupAccounts({
    emails: [OWNER_EMAIL, CHILD_EMAIL],
    clerkUserIds: [OWNER_CLERK_ID, CHILD_CLERK_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [OWNER_EMAIL, CHILD_EMAIL],
    clerkUserIds: [OWNER_CLERK_ID, CHILD_CLERK_ID],
  });
});

/** Bootstraps a real owner via POST /v1/profiles (the real graph-creation path). */
async function createOwner(): Promise<{ profileId: string; orgId: string }> {
  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders({ sub: OWNER_CLERK_ID, email: OWNER_EMAIL }),
      body: JSON.stringify({ displayName: 'WI-1301 Owner', birthYear: 1985 }),
    },
    TEST_ENV,
  );
  expect(res.status).toBe(201);
  const body = await res.json();
  const profileId = body.profile.id as string;

  const membershipRow = await db.query.membership.findFirst({
    where: eq(membership.personId, profileId),
    columns: { organizationId: true },
  });
  if (!membershipRow) {
    throw new Error(`Owner membership not found after create: ${profileId}`);
  }
  return { profileId, orgId: membershipRow.organizationId };
}

/**
 * Seeds a second, non-owner person in the SAME org with their OWN login
 * (distinct clerkUserId/email) — a family "charge" with their own credential,
 * per MMT-ADR-0007 (Person != Login) / MMT-ADR-0001. This is the attacker:
 * a real authenticated caller, resolved to their OWN callerPersonId by the
 * real middleware, who then spoofs X-Profile-Id to the owner's id.
 */
async function createNonOwnerSibling(orgId: string): Promise<string> {
  const [p] = await db
    .insert(person)
    .values({
      displayName: 'WI-1301 Non-Owner Child',
      birthDate: '2012-01-01',
      residenceJurisdiction: 'US',
    })
    .returning({ id: person.id });
  const childPersonId = p!.id;
  await db.insert(login).values({
    personId: childPersonId,
    clerkUserId: CHILD_CLERK_ID,
    email: CHILD_EMAIL,
  });
  await db.insert(membership).values({
    personId: childPersonId,
    organizationId: orgId,
    roles: ['learner'],
  });
  return childPersonId;
}

describe('WI-1301: /account/* and /billing/* owner gates reject a spoofed X-Profile-Id', () => {
  it('GET /v1/account/deletion-status: non-owner spoofing X-Profile-Id=owner is denied (403)', async () => {
    const { profileId: ownerProfileId, orgId } = await createOwner();
    await createNonOwnerSibling(orgId);

    const res = await app.request(
      '/v1/account/deletion-status',
      {
        headers: buildAuthHeaders(
          { sub: CHILD_CLERK_ID, email: CHILD_EMAIL },
          ownerProfileId, // spoofed: not the child's own profile id
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
  });

  it('GET /v1/subscription/family: non-owner spoofing X-Profile-Id=owner is denied (403)', async () => {
    const { profileId: ownerProfileId, orgId } = await createOwner();
    await createNonOwnerSibling(orgId);

    const res = await app.request(
      '/v1/subscription/family',
      {
        headers: buildAuthHeaders(
          { sub: CHILD_CLERK_ID, email: CHILD_EMAIL },
          ownerProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
  });

  it('POST /v1/byok-waitlist: non-owner spoofing X-Profile-Id=owner is denied (403) — previously guarded only by assertNotProxyMode', async () => {
    const { profileId: ownerProfileId, orgId } = await createOwner();
    await createNonOwnerSibling(orgId);

    const res = await app.request(
      '/v1/byok-waitlist',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: CHILD_CLERK_ID, email: CHILD_EMAIL },
          ownerProfileId,
        ),
        body: JSON.stringify({}),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
  });

  it('control: the real owner (no spoof) is still allowed through the same gates', async () => {
    const { profileId: ownerProfileId } = await createOwner();

    const res = await app.request(
      '/v1/account/deletion-status',
      {
        headers: buildAuthHeaders(
          { sub: OWNER_CLERK_ID, email: OWNER_EMAIL },
          ownerProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
  });

  it('control: the non-owner acting on their OWN profile (no spoof) is still denied (403)', async () => {
    const { orgId } = await createOwner();
    const childProfileId = await createNonOwnerSibling(orgId);

    const res = await app.request(
      '/v1/account/deletion-status',
      {
        headers: buildAuthHeaders(
          { sub: CHILD_CLERK_ID, email: CHILD_EMAIL },
          childProfileId, // not spoofed — genuinely their own profile
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
  });
});
