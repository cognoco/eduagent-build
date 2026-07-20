/**
 * Integration: WI-2416 — read-side profile-authority check across the 8
 * audited read surfaces (G1-G8; WI-2006 spike 010-findings.md).
 *
 * THE ATTACK: profileScopeMiddleware / getPersonScope (profile-v2.ts:370)
 * resolve the client-supplied X-Profile-Id against org membership ONLY —
 * never caller-self. An authenticated member of a multi-person org (owner +
 * a credentialed peer, e.g. an adult sibling with their own login) can send
 * `X-Profile-Id: <peer's profile id>` and read the peer's learning memory,
 * recaps, notes, and exports with no caller-ownership check at all.
 *
 * assertCanReadProfile (services/family-access.ts) closes this: it derives
 * authority from callerPersonId — resolved server-side by accountMiddleware
 * from the authenticated login->person binding, never request-supplied —
 * and authorizes SELF or an active guardianship edge over an uncredentialed
 * charge (mirrors verifyPersonOwnershipV2 / assertCallerIsAccountOwner). Per
 * PM ruling 2026-07-20, org-admin is deliberately NOT a standalone OR-clause
 * (see family-access.ts doc comment) — an owner's read of their own child
 * works via the guardian-of-uncredentialed-charge path, not admin role.
 *
 * These tests authenticate as the real peer/owner (a distinct login/person,
 * same org) and let the real middleware chain resolve callerPersonId from
 * that login binding — the header spoof is the only attacker lever.
 *
 * AC-2 representative HIGH route per cluster (per the locked plan,
 * _plan-WI-2416.md Part C): GET /recaps/self (G1), GET /learner-profile
 * (G2), GET /learner-profile/export-text (G3), GET
 * /subjects/:subjectId/books/:bookId/notes (G4). AC-4's red-green-revert
 * (executed manually, recorded in wi2416-rgr-evidence.md) uses the
 * [MANDATORY] G1 test below as the representative regression.
 */

import { eq } from 'drizzle-orm';
import {
  createDatabase,
  generateUUIDv7,
  guardianship,
  learningProfiles,
  login,
  membership,
  person,
  topicNotes,
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
import {
  createSubjectWithCurriculum,
  insertSessionWithRecap,
} from '../../apps/api/src/services/test-seed';

const TEST_ENV = buildIntegrationEnv();

const RUN_ID = generateUUIDv7();
const OWNER_CLERK_ID = `wi2416-owner-${RUN_ID}`;
const OWNER_EMAIL = `wi2416-owner-${RUN_ID}@integration.test`;
const PEER_CLERK_ID = `wi2416-peer-${RUN_ID}`;
const PEER_EMAIL = `wi2416-peer-${RUN_ID}@integration.test`;

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
      body: JSON.stringify({ displayName: 'WI-2416 Owner', birthYear: 1985 }),
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
 * (distinct clerkUserId/email) — an adult sibling / family "charge" with
 * their own credential, per MMT-ADR-0007 (Person != Login). This is the
 * attacker: a real authenticated caller, resolved to their OWN
 * callerPersonId by the real middleware, who then spoofs X-Profile-Id to
 * the peer's id. NOT a guardianship charge of the owner — a same-org peer
 * with no authority relationship at all (the strongest attack shape).
 */
async function createCredentialedPeer(orgId: string): Promise<string> {
  const [p] = await db
    .insert(person)
    .values({
      displayName: 'WI-2416 Peer',
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

/**
 * Seeds an uncredentialed charge (no login row) under an active guardianship
 * edge from `guardianPersonId` — the AC-3 positive control: a guardian
 * reading their own managed child's data via X-Profile-Id=<charge>.
 */
async function createUncredentialedCharge(
  orgId: string,
  guardianPersonId: string,
): Promise<string> {
  const [p] = await db
    .insert(person)
    .values({
      displayName: 'WI-2416 Charge',
      birthDate: '2014-01-01',
      residenceJurisdiction: 'US',
    })
    .returning({ id: person.id });
  const chargePersonId = p!.id;
  await db.insert(membership).values({
    personId: chargePersonId,
    organizationId: orgId,
    roles: ['learner'],
  });
  await db.insert(guardianship).values({
    guardianPersonId,
    chargePersonId,
  });
  return chargePersonId;
}

// Short unique suffix (not the full 36-char RUN_ID) — the learner-profile
// `interests[].label` field caps at 60 chars (interestEntrySchema,
// packages/schemas/src/learning-profiles.ts); a full-UUID marker silently
// fails that validation and getOrCreateMemoryProjection falls back to an
// empty interests array, which would make a false-negative "no leak"
// assertion look like a pass. Keep every marker well under the cap.
const RUN_SUFFIX = RUN_ID.split('-')[0]!;

function secretMarker(label: string): string {
  return `wi2416-${label}-${RUN_SUFFIX}`;
}

async function seedLearnerProfileData(
  profileId: string,
  marker: string,
): Promise<void> {
  await db.insert(learningProfiles).values({
    profileId,
    interests: [{ label: marker, context: 'both' }],
  });
}

async function seedNotesData(
  profileId: string,
  marker: string,
): Promise<{ subjectId: string; bookId: string }> {
  const { subjectId, bookId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    `WI-2416 Notes Subject ${marker}`,
  );
  await db.insert(topicNotes).values({
    topicId: topicIds[0]!,
    profileId,
    content: marker,
  });
  return { subjectId, bookId };
}

async function seedRecapData(profileId: string, marker: string): Promise<void> {
  const { subjectId, topicIds } = await createSubjectWithCurriculum(
    db,
    profileId,
    `WI-2416 Recap Subject ${marker}`,
  );
  await insertSessionWithRecap(db, {
    profileId,
    subjectId,
    topicId: topicIds[0]!,
    recapContent: marker,
    recapHighlight: marker,
  });
}

describe('WI-2416: read-side profile-authority check rejects a spoofed X-Profile-Id (G1-G8)', () => {
  // ---------------------------------------------------------------------
  // AC-2: the attack — representative confirmed-HIGH route per cluster.
  // Caller authenticated as OWNER (real login), X-Profile-Id spoofed to the
  // credentialed PEER (same org, no authority relationship). Every route
  // must reject 403 and leak none of the peer's seeded data.
  // ---------------------------------------------------------------------

  it('[MANDATORY][AC-2/AC-4][G1] GET /v1/recaps/self: peer spoofing X-Profile-Id is denied (403) and their recap data is not leaked', async () => {
    const { orgId } = await createOwner();
    const peerProfileId = await createCredentialedPeer(orgId);
    const marker = secretMarker('recap-g1');
    await seedRecapData(peerProfileId, marker);

    const res = await app.request(
      '/v1/recaps/self',
      {
        headers: buildAuthHeaders(
          { sub: OWNER_CLERK_ID, email: OWNER_EMAIL },
          peerProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).not.toContain(marker);
  });

  it('[AC-2][G2] GET /v1/learner-profile: peer spoofing X-Profile-Id is denied (403) and their memory is not leaked', async () => {
    const { orgId } = await createOwner();
    const peerProfileId = await createCredentialedPeer(orgId);
    const marker = secretMarker('memory-g2');
    await seedLearnerProfileData(peerProfileId, marker);

    const res = await app.request(
      '/v1/learner-profile',
      {
        headers: buildAuthHeaders(
          { sub: OWNER_CLERK_ID, email: OWNER_EMAIL },
          peerProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).not.toContain(marker);
  });

  it('[AC-2][G3] GET /v1/learner-profile/export-text: peer spoofing X-Profile-Id is denied (403) and their memory export is not leaked', async () => {
    const { orgId } = await createOwner();
    const peerProfileId = await createCredentialedPeer(orgId);
    const marker = secretMarker('export-g3');
    await seedLearnerProfileData(peerProfileId, marker);

    const res = await app.request(
      '/v1/learner-profile/export-text',
      {
        headers: buildAuthHeaders(
          { sub: OWNER_CLERK_ID, email: OWNER_EMAIL },
          peerProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).not.toContain(marker);
  });

  it('[AC-2][G4] GET /v1/subjects/:subjectId/books/:bookId/notes: peer spoofing X-Profile-Id is denied (403) and their notes are not leaked', async () => {
    const { orgId } = await createOwner();
    const peerProfileId = await createCredentialedPeer(orgId);
    const marker = secretMarker('note-g4');
    const { subjectId, bookId } = await seedNotesData(peerProfileId, marker);

    const res = await app.request(
      `/v1/subjects/${subjectId}/books/${bookId}/notes`,
      {
        headers: buildAuthHeaders(
          { sub: OWNER_CLERK_ID, email: OWNER_EMAIL },
          peerProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).not.toContain(marker);
  });

  // ---------------------------------------------------------------------
  // AC-3: guardian/self allowed — negative control. Proves the gate is
  // authorizing, not just universally blocking.
  // ---------------------------------------------------------------------

  it('[AC-3] GET /v1/recaps/self: caller reading their OWN profile (no spoof) returns 200 with their own data', async () => {
    const { profileId: ownerProfileId } = await createOwner();
    const marker = secretMarker('self-recap');
    await seedRecapData(ownerProfileId, marker);

    const res = await app.request(
      '/v1/recaps/self',
      {
        headers: buildAuthHeaders(
          { sub: OWNER_CLERK_ID, email: OWNER_EMAIL },
          ownerProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(marker);
  });

  it('[AC-3] GET /v1/recaps/self: guardian reading an uncredentialed charge (X-Profile-Id=charge) returns 200 with the charge data', async () => {
    const { profileId: ownerProfileId, orgId } = await createOwner();
    const chargeProfileId = await createUncredentialedCharge(
      orgId,
      ownerProfileId,
    );
    const marker = secretMarker('charge-recap');
    await seedRecapData(chargeProfileId, marker);

    const res = await app.request(
      '/v1/recaps/self',
      {
        headers: buildAuthHeaders(
          { sub: OWNER_CLERK_ID, email: OWNER_EMAIL },
          chargeProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(marker);
  });

  it('[AC-3] GET /v1/learner-profile: guardian reading an uncredentialed charge (X-Profile-Id=charge) returns 200 with the charge memory', async () => {
    const { profileId: ownerProfileId, orgId } = await createOwner();
    const chargeProfileId = await createUncredentialedCharge(
      orgId,
      ownerProfileId,
    );
    const marker = secretMarker('charge-memory');
    await seedLearnerProfileData(chargeProfileId, marker);

    const res = await app.request(
      '/v1/learner-profile',
      {
        headers: buildAuthHeaders(
          { sub: OWNER_CLERK_ID, email: OWNER_EMAIL },
          chargeProfileId,
        ),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(marker);
  });

  it('[AC-3] control: a non-owner PEER reading their OWN profile (self, no spoof) is not blocked — self-authorization is not owner-gated', async () => {
    // The credentialed peer has no owner status and no guardianship edge to
    // anyone — self-authorization must still work for a plain non-owner
    // member reading their own data. Confirms the gate authorizes on
    // callerPersonId === targetProfileId, not on isOwner/admin status.
    const { orgId } = await createOwner();
    const peerProfileId = await createCredentialedPeer(orgId);

    const res = await app.request(
      '/v1/learner-profile',
      {
        headers: buildAuthHeaders(
          { sub: PEER_CLERK_ID, email: PEER_EMAIL },
          peerProfileId,
        ),
      },
      TEST_ENV,
    );

    // Not 403: the peer IS reading their own profile (self), which is
    // always authorized regardless of owner status. Confirms the gate isn't
    // blanket-denying — only the cross-account spoof (AC-2 above) is
    // rejected.
    expect(res.status).not.toBe(403);
  });
});
