/**
 * Integration: WI-2516 — consent request/resend authorization must bind to
 * callerPersonId, never the client-supplied X-Profile-Id selection.
 *
 * The matrix below runs through the real auth/account/profile middleware and
 * real database. It proves both write endpoints ignore honest or spoofed
 * profile headers when deciding whether the authenticated caller is self, or
 * is an org admin with an active guardianship edge to the target.
 */

import { eq } from 'drizzle-orm';
import {
  consentRequest,
  createDatabase,
  generateUUIDv7,
  guardianship,
  login,
  membership,
  person,
  type Database,
} from '@eduagent/database';
import { ERROR_CODES } from '@eduagent/schemas';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  requireDatabaseUrl,
} from './helpers';
import { buildAuthHeaders } from './test-keys';
import { getCapturedInngestEvents, mockInngestEvents } from './mocks';
import { clearFetchCalls } from './fetch-interceptor';

import { app } from '../../apps/api/src/index';
import {
  createPendingConsentRequest,
  requestConsentV2,
} from '../../apps/api/src/services/identity-v2/consent-v2';

const TEST_ENV = buildIntegrationEnv({
  CONSENT_POLICY_VERSION: 'wi-2516-test',
});
const RUN_ID = generateUUIDv7();
const OWNER_CLERK_ID = `wi2516-owner-${RUN_ID}`;
const OWNER_EMAIL = `wi2516-owner-${RUN_ID}@integration.test`;
const PEER_CLERK_ID = `wi2516-peer-${RUN_ID}`;
const PEER_EMAIL = `wi2516-peer-${RUN_ID}@integration.test`;
const CONSENT_EMAIL = `wi2516-guardian-${RUN_ID}@integration.test`;
const FORBIDDEN_MESSAGE = 'Not authorized to request consent for this profile';

type HeaderMode = 'honest' | 'target' | 'owner';
type Relationship = 'self' | 'admin-with-edge' | 'admin-no-edge' | 'peer';

type RelationshipCase = {
  label: string;
  relationship: Relationship;
  header: HeaderMode;
  allowed: boolean;
};

const RELATIONSHIP_CASES: RelationshipCase[] = [
  {
    label: 'self with honest header',
    relationship: 'self',
    header: 'honest',
    allowed: true,
  },
  {
    label: 'self with mismatched same-org header',
    relationship: 'self',
    header: 'target',
    allowed: true,
  },
  {
    label: 'admin guardian with honest header',
    relationship: 'admin-with-edge',
    header: 'honest',
    allowed: true,
  },
  {
    label: 'admin guardian with target-shaped header',
    relationship: 'admin-with-edge',
    header: 'target',
    allowed: true,
  },
  {
    label: 'admin without guardianship with honest header',
    relationship: 'admin-no-edge',
    header: 'honest',
    allowed: false,
  },
  {
    label: 'admin without guardianship spoofing target header',
    relationship: 'admin-no-edge',
    header: 'target',
    allowed: false,
  },
  {
    label: 'same-org peer with honest header',
    relationship: 'peer',
    header: 'honest',
    allowed: false,
  },
  {
    label: 'same-org peer spoofing target header',
    relationship: 'peer',
    header: 'target',
    allowed: false,
  },
  {
    label: 'same-org peer spoofing owner-shaped header',
    relationship: 'peer',
    header: 'owner',
    allowed: false,
  },
];

const MATRIX = (['request', 'resend'] as const).flatMap((endpoint) =>
  RELATIONSHIP_CASES.map((testCase) => ({ endpoint, ...testCase })),
);

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

async function createOwner(): Promise<{ profileId: string; orgId: string }> {
  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders({ sub: OWNER_CLERK_ID, email: OWNER_EMAIL }),
      body: JSON.stringify({ displayName: 'WI-2516 Owner', birthYear: 1985 }),
    },
    TEST_ENV,
  );
  expect(res.status).toBe(201);
  const body = (await res.json()) as { profile: { id: string } };
  const membershipRow = await db.query.membership.findFirst({
    where: eq(membership.personId, body.profile.id),
    columns: { organizationId: true },
  });
  if (!membershipRow) throw new Error('Owner membership was not created');
  return { profileId: body.profile.id, orgId: membershipRow.organizationId };
}

async function createPerson(input: {
  orgId: string;
  displayName: string;
  credential?: { clerkUserId: string; email: string };
}): Promise<string> {
  const [created] = await db
    .insert(person)
    .values({
      displayName: input.displayName,
      birthDate: '2012-01-01',
      residenceJurisdiction: 'US',
    })
    .returning({ id: person.id });
  const personId = created!.id;
  if (input.credential) {
    await db.insert(login).values({ personId, ...input.credential });
  }
  await db.insert(membership).values({
    personId,
    organizationId: input.orgId,
    roles: ['learner'],
  });
  return personId;
}

async function readConsentState(chargePersonId: string) {
  return db.query.consentRequest.findFirst({
    where: eq(consentRequest.chargePersonId, chargePersonId),
    columns: {
      status: true,
      guardianEmail: true,
      resendCount: true,
      recipientChangeCount: true,
      token: true,
      requestedAt: true,
    },
  });
}

describe('WI-2516: consent write authorization uses callerPersonId', () => {
  it.each(MATRIX)(
    '$endpoint: $label => allowed=$allowed',
    async ({ endpoint, relationship, header, allowed }) => {
      const { profileId: ownerId, orgId } = await createOwner();
      const peerId = await createPerson({
        orgId,
        displayName: 'WI-2516 Credentialed Peer',
        credential: { clerkUserId: PEER_CLERK_ID, email: PEER_EMAIL },
      });
      const childId = await createPerson({
        orgId,
        displayName: 'WI-2516 Target Child',
      });

      if (relationship === 'admin-with-edge' || header === 'owner') {
        await db.insert(guardianship).values({
          guardianPersonId: ownerId,
          chargePersonId: childId,
        });
      }

      const callerIsPeer = relationship === 'peer';
      const callerId = callerIsPeer ? peerId : ownerId;
      const targetId = relationship === 'self' ? callerId : childId;
      const selectedProfileId =
        header === 'honest'
          ? callerId
          : header === 'owner'
            ? ownerId
            : relationship === 'self'
              ? childId
              : targetId;
      const auth = callerIsPeer
        ? { sub: PEER_CLERK_ID, email: PEER_EMAIL }
        : { sub: OWNER_CLERK_ID, email: OWNER_EMAIL };

      await createPendingConsentRequest(db, targetId, orgId, 'GDPR');
      if (endpoint === 'resend') {
        await requestConsentV2(db, {
          chargePersonId: targetId,
          organizationId: orgId,
          consentType: 'GDPR',
          guardianEmail: CONSENT_EMAIL,
          childName: 'WI-2516 Target',
          appUrl: 'https://api.integration.test',
        });
      }
      const before = await readConsentState(targetId);
      clearFetchCalls();

      const res = await app.request(
        `/v1/consent/${endpoint}`,
        {
          method: 'POST',
          headers: buildAuthHeaders(auth, selectedProfileId),
          body: JSON.stringify({
            childProfileId: targetId,
            consentType: 'GDPR',
            ...(endpoint === 'request' ? { parentEmail: CONSENT_EMAIL } : {}),
          }),
        },
        TEST_ENV,
      );

      const after = await readConsentState(targetId);
      if (!allowed) {
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({
          code: ERROR_CODES.FORBIDDEN,
          message: FORBIDDEN_MESSAGE,
        });
        expect(after).toEqual(before);
        expect(getCapturedInngestEvents()).toEqual([]);
        return;
      }

      expect(res.status).toBe(201);
      expect(after?.status).toBe('requested');
      expect(after?.guardianEmail).toBe(CONSENT_EMAIL);
      expect(after?.resendCount).toBe(endpoint === 'resend' ? 1 : 0);
      expect(getCapturedInngestEvents()).toEqual([
        expect.objectContaining({
          name: 'app/consent.requested',
          data: expect.objectContaining({ profileId: targetId }),
        }),
      ]);
    },
  );
});
