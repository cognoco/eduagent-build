/**
 * Integration: WI-1302 — POST /v1/profiles/switch owner-elevation
 * reverification trusts callerPersonId, not the client-supplied
 * X-Profile-Id header.
 *
 * THE ATTACK: the switch route's owner-elevation gate previously asked
 * `isExplicitOwnerContext(profileMeta)` — true whenever the resolved
 * X-Profile-Id belongs to the owner and was explicitly supplied.
 * profileScopeMiddleware verifies X-Profile-Id belongs to the caller's
 * organization, but not that it is the caller's OWN identity. In a family
 * org (owner + non-owner child), an authenticated NON-OWNER can send
 * `X-Profile-Id: <owner's person id>` and have profileScopeMiddleware
 * resolve `profileMeta.isOwner = true` / `resolvedVia = 'explicit-header'`
 * for that (impersonated) profile — which made isExplicitOwnerContext wrongly
 * report "the caller is already the owner", skipping the fresh
 * primary-factor reverification requirement while switching into the real
 * owner profile.
 *
 * These tests authenticate as the real non-owner (a distinct login/person,
 * same org) and let the real middleware chain resolve `callerPersonId` from
 * that login binding — the header spoof + a stale/absent `fva` claim is the
 * only attacker lever. The route must reject with 403
 * OWNER_ELEVATION_REQUIRED regardless of what X-Profile-Id claims.
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
const OWNER_CLERK_ID = `wi1302-owner-${RUN_ID}`;
const OWNER_EMAIL = `wi1302-owner-${RUN_ID}@integration.test`;
const CHILD_CLERK_ID = `wi1302-child-${RUN_ID}`;
const CHILD_EMAIL = `wi1302-child-${RUN_ID}@integration.test`;

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
      body: JSON.stringify({ displayName: 'WI-1302 Owner', birthYear: 1985 }),
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
      displayName: 'WI-1302 Non-Owner Child',
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

describe('WI-1302: POST /v1/profiles/switch owner-elevation gate rejects a spoofed X-Profile-Id', () => {
  it('[BREAK] non-owner spoofing X-Profile-Id=owner + stale fva is denied OWNER_ELEVATION_REQUIRED (403), not switched', async () => {
    const { profileId: ownerProfileId, orgId } = await createOwner();
    await createNonOwnerSibling(orgId);

    const res = await app.request(
      '/v1/profiles/switch',
      {
        method: 'POST',
        // No `fva` claim → hasRecentOwnerElevation() is false (no fresh
        // reverification). X-Profile-Id spoofed to the owner's id is the
        // only thing that could (pre-fix) have made the caller look like
        // "already the owner".
        headers: buildAuthHeaders(
          { sub: CHILD_CLERK_ID, email: CHILD_EMAIL },
          ownerProfileId, // spoofed: not the child's own profile id
        ),
        body: JSON.stringify({ profileId: ownerProfileId }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'OWNER_ELEVATION_REQUIRED' });
  });

  it('control: the real owner (no spoof) switching to themselves is still allowed without fresh fva', async () => {
    const { profileId: ownerProfileId } = await createOwner();

    const res = await app.request(
      '/v1/profiles/switch',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: OWNER_CLERK_ID, email: OWNER_EMAIL },
          ownerProfileId,
        ),
        body: JSON.stringify({ profileId: ownerProfileId }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ profileId: ownerProfileId });
  });

  it('control: a non-owner switching to their OWN (non-owner) profile is still allowed without fva', async () => {
    const { orgId } = await createOwner();
    const childProfileId = await createNonOwnerSibling(orgId);

    const res = await app.request(
      '/v1/profiles/switch',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: CHILD_CLERK_ID, email: CHILD_EMAIL },
          childProfileId, // not spoofed — genuinely their own profile
        ),
        body: JSON.stringify({ profileId: childProfileId }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ profileId: childProfileId });
  });

  it('control: a non-owner with FRESH fva switching to owner is still allowed (reverification path untouched)', async () => {
    const { profileId: ownerProfileId, orgId } = await createOwner();
    await createNonOwnerSibling(orgId);

    const res = await app.request(
      '/v1/profiles/switch',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          {
            sub: CHILD_CLERK_ID,
            email: CHILD_EMAIL,
            // Fresh primary-factor reverification (1 minute old) — the
            // legitimate bypass path, independent of X-Profile-Id.
            fva: [1, -1],
          },
          ownerProfileId,
        ),
        body: JSON.stringify({ profileId: ownerProfileId }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ profileId: ownerProfileId });
  });
});
