import { resolve } from 'node:path';
import { inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  createDatabase,
  generateUUIDv7,
  learningSessions,
  milestones,
  sessionSummaries,
  subjects,
  supportership,
  type Database,
} from '@eduagent/database';
import {
  ERROR_CODES,
  ForbiddenError,
  sharedRecordSchema,
  type VisibilityContract,
} from '@eduagent/schemas';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { visibilityRoutes } from './visibility';
import * as linkingCeremonyService from '../services/linking-ceremony';
import {
  deleteLegacyAccountsForTest,
  deleteV2IdentitiesForTest,
  ensureLegacyProfileAnchorForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

// Raw fields planted on the seeded session summary. These must never appear
// in the supporter-facing response body — the WI-1201 no-leak assertion
// (AC 3) cross-checks the same exclusion already unit-tested in
// shared-record-read-model.test.ts, here against a real Drizzle round trip.
const RAW_HIGHLIGHT = 'integ raw highlight should not leak';
const RAW_NARRATIVE = 'integ raw parent-facing recap should not leak';
const RAW_PROMPT = 'integ raw conversation prompt should not leak';

type TestEnv = {
  Bindings: {
    MANAGED_TIER_ACTIVE?: string;
  };
  Variables: {
    user: unknown;
    db: Database;
    profileId: string | undefined;
    callerPersonId: string | undefined;
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

function makeApp(db: Database, callerPersonId: string) {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', { userId: 'integ-visibility-test-user' });
    c.set('profileId', callerPersonId);
    c.set('callerPersonId', callerPersonId);
    await next();
  });
  app.route('/v1', visibilityRoutes);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    // Mirrors apps/api/src/index.ts's global ForbiddenError branch exactly,
    // since that is the real response shape supporters see on a denied read.
    if (err instanceof ForbiddenError) {
      return c.json(
        {
          code: ERROR_CODES.FORBIDDEN,
          apiCode: err.apiCode,
          message: err.message,
        },
        403,
      );
    }
    throw err;
  });
  return app;
}

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `integ-visibility-${RUN_ID}`;
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
    displayName: `Visibility ${label}`,
    birthYear: 2010,
    isOwner: true,
  });
  await ensureV2IdentityForLegacyProfileTest(database, {
    accountId,
    profileId,
    clerkUserId,
    email,
    displayName: `Visibility ${label}`,
    birthYear: 2010,
    isOwner: true,
  });

  return profileId;
}

// Seeds a genuinely *accepted* visibility contract via the real
// initiateLink + acceptLink write path (both audiences), so
// findAcceptedContractForSupportee's real query finds it -- no raw INSERT
// of a fabricated 'accepted' row.
async function seedAcceptedContract(
  database: Database,
  supporterPersonId: string,
  supporteePersonId: string,
): Promise<VisibilityContract> {
  const initiated = await linkingCeremonyService.initiateLink(database, {
    supporterPersonId,
    supporteePersonId,
    relation: 'parent',
    managedTier: false,
  });
  seededSupportershipIds.push(initiated.supportershipId);

  await linkingCeremonyService.acceptLink(database, initiated.id, {
    actorPersonId: supporterPersonId,
    audience: 'supporter',
  });
  const accepted = await linkingCeremonyService.acceptLink(
    database,
    initiated.id,
    {
      actorPersonId: supporteePersonId,
      audience: 'supportee',
    },
  );

  if (accepted.status !== 'accepted') {
    throw new Error(
      `Expected seeded contract to reach status "accepted", got "${accepted.status}"`,
    );
  }
  return accepted;
}

// Seeds the shareable facts the supportee's read model projects: a
// completed session with an "accepted" summary (carrying the raw fields
// that must never leak), plus a milestone.
async function seedShareableFacts(
  database: Database,
  supporteePersonId: string,
): Promise<void> {
  const subjectId = generateUUIDv7();
  await database.insert(subjects).values({
    id: subjectId,
    profileId: supporteePersonId,
    name: 'Visibility Subject',
  });

  const [session] = await database
    .insert(learningSessions)
    .values({
      profileId: supporteePersonId,
      subjectId,
      sessionType: 'learning',
      inputMode: 'text',
      status: 'completed',
      escalationRung: 1,
      exchangeCount: 1,
    })
    .returning({ id: learningSessions.id });
  if (!session) throw new Error('Failed to seed learning session');

  await database.insert(sessionSummaries).values({
    sessionId: session.id,
    profileId: supporteePersonId,
    content: 'integ learner-facing summary',
    aiFeedback: 'integ raw AI feedback',
    highlight: RAW_HIGHLIGHT,
    narrative: RAW_NARRATIVE,
    conversationPrompt: RAW_PROMPT,
    status: 'accepted',
  });

  await database.insert(milestones).values({
    profileId: supporteePersonId,
    milestoneType: 'session_count',
    threshold: 3,
  });
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
let supporterPersonId: string;
let supporteePersonId: string;
let unlinkedSupporterPersonId: string;
let contract: VisibilityContract;

beforeAll(async () => {
  db = createIntegrationDb();
  await cleanup(db);

  supporterPersonId = await seedProfile(db, 'linked-supporter');
  supporteePersonId = await seedProfile(db, 'supportee');
  unlinkedSupporterPersonId = await seedProfile(db, 'unlinked-supporter');

  contract = await seedAcceptedContract(
    db,
    supporterPersonId,
    supporteePersonId,
  );
  await seedShareableFacts(db, supporteePersonId);
}, 30_000);

afterAll(async () => {
  await cleanup(db);
});

describe('Integration: GET /visibility/reports/:personId/shared-record', () => {
  it('returns the supportee shared-record facts for the linked supporter, with no raw fields', async () => {
    const res = await makeApp(db, supporterPersonId).request(
      `/v1/visibility/reports/${supporteePersonId}/shared-record`,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    const record = sharedRecordSchema.parse(body);

    expect(record.supportershipId).toBe(contract.supportershipId);
    expect(record.supporterView.facts.map((fact) => fact.source)).toEqual([
      'session_recap_presence',
      'milestone',
    ]);

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(RAW_HIGHLIGHT);
    expect(serialized).not.toContain(RAW_NARRATIVE);
    expect(serialized).not.toContain(RAW_PROMPT);
  });

  it("rejects an unlinked supporter requesting the same supportee, per findAcceptedContractForSupportee's real no-contract behavior", async () => {
    const res = await makeApp(db, unlinkedSupporterPersonId).request(
      `/v1/visibility/reports/${supporteePersonId}/shared-record`,
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      code: ERROR_CODES.FORBIDDEN,
      message: 'This support link is not active.',
    });
  });

  // [WI-1201 red-green-revert] Regression guard proving the 403 above is
  // load-bearing: bypassing findAcceptedContractForSupportee -- the only
  // gate standing between an unlinked supporter and the supportee's
  // shared-record -- must leak the exact same facts a linked supporter
  // sees. If this ever returns non-200 for the bypassed case, or a 200 for
  // the unlinked supporter once the spy is restored, the contract-scoping
  // gate has regressed.
  it('would leak the supportee shared-record to the unlinked supporter if the contract-scoping gate were bypassed', async () => {
    const spy = jest
      .spyOn(linkingCeremonyService, 'findAcceptedContractForSupportee')
      .mockResolvedValue({
        supportershipId: contract.supportershipId,
      } as VisibilityContract);

    try {
      const bypassed = await makeApp(db, unlinkedSupporterPersonId).request(
        `/v1/visibility/reports/${supporteePersonId}/shared-record`,
      );
      expect(bypassed.status).toBe(200);
      const bypassedBody = sharedRecordSchema.parse(await bypassed.json());
      expect(bypassedBody.supportershipId).toBe(contract.supportershipId);
      expect(bypassedBody.supporterView.facts.length).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }

    const restored = await makeApp(db, unlinkedSupporterPersonId).request(
      `/v1/visibility/reports/${supporteePersonId}/shared-record`,
    );
    expect(restored.status).toBe(403);
  });
});
