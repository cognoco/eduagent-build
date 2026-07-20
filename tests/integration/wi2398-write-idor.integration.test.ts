/**
 * Integration: WI-2398 — assertNotProxyMode has the same header-trust IDOR
 * root cause as WI-1989/WI-1301, on the WRITE side.
 *
 * THE ATTACK: assertNotProxyMode (middleware/proxy-guard.ts) derives its
 * allow decision from profileMeta.isOwner / resolvedVia — both resolved from
 * the client-supplied X-Profile-Id header by profileScopeMiddleware /
 * getPersonScope. Those checks only prove X-Profile-Id resolves to SOME
 * owner-role profile in the caller's org — never that it is the CALLER's own
 * identity. An authenticated non-owner member of a multi-person org (a
 * credentialed peer, e.g. an adult sibling with their own login) can send
 * `X-Profile-Id: <the owner's profile id>` and have profileScopeMiddleware
 * resolve `profileMeta.isOwner = true` / `resolvedVia = 'explicit-header'`
 * for that (impersonated) profile — assertNotProxyMode alone then wrongly
 * authorizes the write AS the owner, mutating the owner's self-service data
 * (curriculum skip/unskip/challenge/topics/adapt, onboarding
 * pronouns/interests).
 *
 * The fix closes this at the single shared primitive: assertNotProxyMode now
 * also calls assertCanWriteProfile (services/family-access.ts) — the
 * write-authority twin of assertCanReadProfile (WI-2416) — which derives
 * authority from callerPersonId (resolved server-side by accountMiddleware
 * from the authenticated login->person binding, never request-supplied) and
 * requires self-or-guardian, not merely org membership.
 *
 * These tests authenticate as the real peer/owner (a distinct login/person,
 * same org) and let the real middleware chain resolve callerPersonId from
 * that login binding — the header spoof is the only attacker lever.
 *
 * AC-1 representative route: POST /v1/subjects/:subjectId/curriculum/skip
 * (curriculum self-service write). AC-1's red-green-revert (executed
 * manually, recorded in wi2398-rgr-evidence.md) uses the [MANDATORY] test
 * below as the representative regression.
 *
 * AC-2 representative route: PATCH /v1/onboarding/pronouns (onboarding
 * self-service write), plus the owner-still-allowed positive control.
 */

import { eq } from 'drizzle-orm';
import {
  createDatabase,
  generateUUIDv7,
  curriculumTopics,
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
import { createSubjectWithCurriculum } from '../../apps/api/src/services/test-seed';

const TEST_ENV = buildIntegrationEnv();

const RUN_ID = generateUUIDv7();
const OWNER_CLERK_ID = `wi2398-owner-${RUN_ID}`;
const OWNER_EMAIL = `wi2398-owner-${RUN_ID}@integration.test`;
const PEER_CLERK_ID = `wi2398-peer-${RUN_ID}`;
const PEER_EMAIL = `wi2398-peer-${RUN_ID}@integration.test`;

let db: Database;

beforeAll(() => {
  mockInngestEvents();
  db = createDatabase(requireDatabaseUrl());
});

beforeEach(async () => {
  jest.clearAllMocks();
  clearFetchCalls();
  await cleanupAccounts({
    emails: [OWNER_EMAIL, PEER_EMAIL],
    clerkUserIds: [OWNER_CLERK_ID, PEER_CLERK_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [OWNER_EMAIL, PEER_EMAIL],
    clerkUserIds: [OWNER_CLERK_ID, PEER_CLERK_ID],
  });
});

/** Bootstraps a real owner via POST /v1/profiles (the real graph-creation path). */
async function createOwner(): Promise<{ profileId: string; orgId: string }> {
  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders({ sub: OWNER_CLERK_ID, email: OWNER_EMAIL }),
      body: JSON.stringify({ displayName: 'WI-2398 Owner', birthYear: 1985 }),
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
 * Seeds a second, credentialed person in the SAME org with their OWN login
 * (distinct clerkUserId/email) — a non-owner member with no authority
 * relationship to the owner at all (the strongest attack shape, same pattern
 * as WI-2416's createCredentialedPeer).
 */
async function createCredentialedPeer(orgId: string): Promise<string> {
  const [p] = await db
    .insert(person)
    .values({
      displayName: 'WI-2398 Peer',
      birthDate: '2008-01-01',
      residenceJurisdiction: 'US',
    })
    .returning({ id: person.id });
  const peerPersonId = p!.id;
  await db.insert(login).values({
    personId: peerPersonId,
    clerkUserId: PEER_CLERK_ID,
    email: PEER_EMAIL,
  });
  await db.insert(membership).values({
    personId: peerPersonId,
    organizationId: orgId,
    roles: ['learner'],
  });
  return peerPersonId;
}

describe('WI-2398: write-side profile-authority check rejects a spoofed X-Profile-Id', () => {
  // ---------------------------------------------------------------------
  // AC-1: curriculum self-service write — the [MANDATORY] red-green-revert
  // representative (see wi2398-rgr-evidence.md for the executed cycle).
  // ---------------------------------------------------------------------

  it('[MANDATORY][AC-1] POST /v1/subjects/:subjectId/curriculum/skip: peer spoofing X-Profile-Id=owner is denied (403) and the topic is not skipped', async () => {
    const { profileId: ownerProfileId, orgId } = await createOwner();
    await createCredentialedPeer(orgId);
    const { subjectId, topicIds } = await createSubjectWithCurriculum(
      db,
      ownerProfileId,
      'WI-2398 Curriculum Subject',
    );
    const topicId = topicIds[0]!;

    const res = await app.request(
      `/v1/subjects/${subjectId}/curriculum/skip`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: PEER_CLERK_ID, email: PEER_EMAIL },
          ownerProfileId,
        ),
        body: JSON.stringify({ topicId }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);

    const topic = await db.query.curriculumTopics.findFirst({
      where: eq(curriculumTopics.id, topicId),
      columns: { skipped: true },
    });
    expect(topic?.skipped).toBe(false);
  });

  it('[AC-1] control: owner acting as themselves (no spoof) can skip their own topic', async () => {
    const { profileId: ownerProfileId } = await createOwner();
    const { subjectId, topicIds } = await createSubjectWithCurriculum(
      db,
      ownerProfileId,
      'WI-2398 Curriculum Subject (owner control)',
    );
    const topicId = topicIds[0]!;

    const res = await app.request(
      `/v1/subjects/${subjectId}/curriculum/skip`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: OWNER_CLERK_ID, email: OWNER_EMAIL },
          ownerProfileId,
        ),
        body: JSON.stringify({ topicId }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);

    const topic = await db.query.curriculumTopics.findFirst({
      where: eq(curriculumTopics.id, topicId),
      columns: { skipped: true },
    });
    expect(topic?.skipped).toBe(true);
  });

  // ---------------------------------------------------------------------
  // AC-2: onboarding self-service write (pronouns) + owner-still-allowed.
  // ---------------------------------------------------------------------

  it('[AC-2] PATCH /v1/onboarding/pronouns: peer spoofing X-Profile-Id=owner is denied (403) and pronouns are not mutated', async () => {
    const { profileId: ownerProfileId, orgId } = await createOwner();
    await createCredentialedPeer(orgId);

    const res = await app.request(
      '/v1/onboarding/pronouns',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: PEER_CLERK_ID, email: PEER_EMAIL },
          ownerProfileId,
        ),
        body: JSON.stringify({ pronouns: 'they/them' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);

    const ownerRow = await db.query.person.findFirst({
      where: eq(person.id, ownerProfileId),
      columns: { pronouns: true },
    });
    expect(ownerRow?.pronouns ?? null).toBeNull();
  });

  it('[AC-2] control: owner acting as themselves (no spoof) can set their own pronouns', async () => {
    const { profileId: ownerProfileId } = await createOwner();

    const res = await app.request(
      '/v1/onboarding/pronouns',
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: OWNER_CLERK_ID, email: OWNER_EMAIL },
          ownerProfileId,
        ),
        body: JSON.stringify({ pronouns: 'they/them' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);

    const ownerRow = await db.query.person.findFirst({
      where: eq(person.id, ownerProfileId),
      columns: { pronouns: true },
    });
    expect(ownerRow?.pronouns).toBe('they/them');
  });
});
