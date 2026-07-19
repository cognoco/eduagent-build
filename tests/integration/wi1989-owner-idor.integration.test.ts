/**
 * Integration: WI-1989 — the 7 un-swept owner-gated route files (consent,
 * dashboard, recaps, curriculum, onboarding, settings, notifications) trust
 * profileMeta (resolved from the client-supplied X-Profile-Id header), not
 * callerPersonId.
 *
 * THE ATTACK (same root cause as WI-1301's /account* and /billing/* fix):
 * profileScopeMiddleware verifies X-Profile-Id belongs to the caller's
 * organization, but not that it is the caller's OWN identity. In a family org
 * (owner + non-owner child), an authenticated NON-OWNER can send
 * `X-Profile-Id: <owner's person id>` and have profileScopeMiddleware resolve
 * `profileMeta.isOwner = true` for that (impersonated) profile —
 * `assertOwnerProfile` / `assertOwnerAndParentAccess` alone would then wrongly
 * authorize the request.
 *
 * These tests authenticate as the real non-owner (a distinct login/person,
 * same org) and let the real middleware chain resolve `callerPersonId` from
 * that login binding — the header spoof is the only attacker lever. Each
 * route must reject with 403 regardless of what X-Profile-Id claims.
 *
 * The mandatory AC break test is `PUT /v1/consent/:childProfileId/revoke`
 * (the exact cross-account consent-revoke attack). The remaining tests cover
 * one representative owner-gated endpoint per file, proving the sweep is
 * complete across all 7 named routes.
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
  requireDatabaseUrl,
} from './helpers';
import { buildAuthHeaders } from './test-keys';
import { mockInngestEvents } from './mocks';
import { clearFetchCalls } from './fetch-interceptor';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();

const RUN_ID = generateUUIDv7();
const OWNER_CLERK_ID = `wi1989-owner-${RUN_ID}`;
const OWNER_EMAIL = `wi1989-owner-${RUN_ID}@integration.test`;
const CHILD_CLERK_ID = `wi1989-child-${RUN_ID}`;
const CHILD_EMAIL = `wi1989-child-${RUN_ID}@integration.test`;

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
      body: JSON.stringify({ displayName: 'WI-1989 Owner', birthYear: 1985 }),
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
      displayName: 'WI-1989 Non-Owner Child',
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

const DUMMY_CHILD_PROFILE_ID = '00000000-0000-4000-8000-000000000099';
const DUMMY_TOPIC_ID = '00000000-0000-4000-8000-000000000098';
const DUMMY_REQUEST_ID = '00000000-0000-4000-8000-000000000097';

describe('WI-1989: consent/dashboard/recaps/curriculum/onboarding/settings/notifications owner gates reject a spoofed X-Profile-Id', () => {
  // ---------------------------------------------------------------------
  // MANDATORY (AC): the exact cross-account attack — consent revoke.
  // ---------------------------------------------------------------------
  it('[MANDATORY] PUT /v1/consent/:childProfileId/revoke: non-owner spoofing X-Profile-Id=owner is denied (403)', async () => {
    const { profileId: ownerProfileId, orgId } = await createOwner();
    await createNonOwnerSibling(orgId);

    const res = await app.request(
      `/v1/consent/${DUMMY_CHILD_PROFILE_ID}/revoke`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(
          { sub: CHILD_CLERK_ID, email: CHILD_EMAIL },
          ownerProfileId, // spoofed: not the child's own profile id
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
  });

  it('control: the real owner (no spoof) reaches past the consent-revoke gate (not 403)', async () => {
    const { profileId: ownerProfileId } = await createOwner();

    const res = await app.request(
      `/v1/consent/${DUMMY_CHILD_PROFILE_ID}/revoke`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(
          { sub: OWNER_CLERK_ID, email: OWNER_EMAIL },
          ownerProfileId,
        ),
      },
      TEST_ENV,
    );

    // Not 403: the owner passes the gate. (The dummy child id then fails
    // downstream with a not-authorized/not-found error from the consent
    // service, which is not what this gate test is verifying.)
    expect(res.status).not.toBe(403);
  });

  it('control: the non-owner acting on their OWN profile (no spoof) is still denied (403)', async () => {
    const { orgId } = await createOwner();
    const childProfileId = await createNonOwnerSibling(orgId);

    const res = await app.request(
      `/v1/consent/${DUMMY_CHILD_PROFILE_ID}/revoke`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(
          { sub: CHILD_CLERK_ID, email: CHILD_EMAIL },
          childProfileId, // not spoofed — genuinely their own profile
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------------------------
  // One representative endpoint per remaining file, proving the sweep is
  // complete across all 7 named routes.
  // ---------------------------------------------------------------------
  it('GET /v1/dashboard/children/:profileId: non-owner spoofing X-Profile-Id=owner is denied (403)', async () => {
    const { profileId: ownerProfileId, orgId } = await createOwner();
    await createNonOwnerSibling(orgId);

    const res = await app.request(
      `/v1/dashboard/children/${DUMMY_CHILD_PROFILE_ID}`,
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

  it('GET /v1/recaps: non-owner spoofing X-Profile-Id=owner is denied (403)', async () => {
    const { profileId: ownerProfileId, orgId } = await createOwner();
    await createNonOwnerSibling(orgId);

    const res = await app.request(
      '/v1/recaps',
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

  it('POST /v1/curriculum/clone-from-child: non-owner spoofing X-Profile-Id=owner is denied (403)', async () => {
    const { profileId: ownerProfileId, orgId } = await createOwner();
    await createNonOwnerSibling(orgId);

    const res = await app.request(
      '/v1/curriculum/clone-from-child',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: CHILD_CLERK_ID, email: CHILD_EMAIL },
          ownerProfileId,
        ),
        body: JSON.stringify({
          childProfileId: DUMMY_CHILD_PROFILE_ID,
          topicId: DUMMY_TOPIC_ID,
          requestId: DUMMY_REQUEST_ID,
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
  });

  it('PATCH /v1/onboarding/language: non-owner spoofing X-Profile-Id=owner is denied (403)', async () => {
    const { profileId: ownerProfileId, orgId } = await createOwner();
    await createNonOwnerSibling(orgId);

    const res = await app.request(
      '/v1/onboarding/language',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: CHILD_CLERK_ID, email: CHILD_EMAIL },
          ownerProfileId,
        ),
        body: JSON.stringify({ conversationLanguage: 'en' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
  });

  it('GET /v1/settings/withdrawal-archive: non-owner spoofing X-Profile-Id=owner is denied (403)', async () => {
    const { profileId: ownerProfileId, orgId } = await createOwner();
    await createNonOwnerSibling(orgId);

    const res = await app.request(
      '/v1/settings/withdrawal-archive',
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

  it('GET /v1/notifications/child-cap: non-owner spoofing X-Profile-Id=owner is denied (403)', async () => {
    const { profileId: ownerProfileId, orgId } = await createOwner();
    await createNonOwnerSibling(orgId);

    const res = await app.request(
      '/v1/notifications/child-cap',
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
});
