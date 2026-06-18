// ---------------------------------------------------------------------------
// WI-821 — parent Recaps gate live-repro under IDENTITY_V2_ENABLED=true
//
// Question: does a correctly-seeded v2 guardian see recaps (HTTP 200),
// or does the gate reject them (401/403)?
//
// Verdict:
//   200 + recap  → STAGING-SEED ARTIFACT (gate correct; prod had incomplete seed)
//   200 + empty  → gate passes but data seed gap (no session visible)
//   401          → Gate A: requireAccountMiddleware / login row missing
//   403          → Gate B: assertOwnerProfile / membership.roles @> ['admin'] missing
//
// Seed: full v2 graph per CUT-B1 (identity-graph.ts §2.2a writer):
//   organization → person×2 → login (guardian) → membership×2 (admin+learner,learner)
//   → guardianship → learning tree + session for child
//
// NOTE: M-DROP confirmed applied on Neon DB (accounts/profiles tables absent).
// NOTE: isChildLearningDataVisible(null) === true so no consent_grant needed.
//
// NO internal jest.mock (GC1/GC6 compliant). JWKS is mocked by setup.ts via
// installFetchInterceptor() + mockClerkJWKS(). DB driver shim in setup.ts.
// ---------------------------------------------------------------------------

import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  guardianship,
  learningSessions,
  login,
  membership,
  organization,
  person,
  subjects,
} from '@eduagent/database';
import { eq, inArray } from 'drizzle-orm';

import { app } from '../../apps/api/src/index';
import { buildAuthHeaders } from './test-keys';
import { buildIntegrationEnv } from './helpers';

const RUN = !!process.env.DATABASE_URL;

const CLERK_USER_ID = 'wi-821-repro-guardian';
const EMAIL = 'wi-821-repro@integration.test';

// Force v2 on for this repro regardless of CI lane. buildIntegrationEnv()
// propagates process.env.IDENTITY_V2_ENABLED when set; set it before the call.
process.env.IDENTITY_V2_ENABLED = 'true';
const ENV = buildIntegrationEnv();

// ---------------------------------------------------------------------------
// Seed + teardown helpers
// ---------------------------------------------------------------------------

type Db = ReturnType<typeof createDatabase>;

async function cleanupStaleFixture(db: Db): Promise<void> {
  // Remove any stale row from a failed previous run.
  const stale = await db.query.login.findFirst({
    where: eq(login.clerkUserId, CLERK_USER_ID),
    columns: { personId: true },
  });
  if (!stale) return;

  const memberships = await db.query.membership.findMany({
    where: eq(membership.personId, stale.personId),
    columns: { organizationId: true },
  });
  const orgId = memberships[0]?.organizationId;

  if (orgId) {
    const orgMembers = await db.query.membership.findMany({
      where: eq(membership.organizationId, orgId),
      columns: { personId: true },
    });
    const personIds = orgMembers.map((m) => m.personId);
    await db
      .delete(guardianship)
      .where(inArray(guardianship.guardianPersonId, personIds));
    await db
      .delete(guardianship)
      .where(inArray(guardianship.chargePersonId, personIds));
    await db.delete(person).where(inArray(person.id, personIds));
    await db.delete(organization).where(eq(organization.id, orgId));
  } else {
    await db.delete(person).where(eq(person.id, stale.personId));
  }
}

async function seedV2Family(db: Db): Promise<{
  guardianId: string;
  childId: string;
  orgId: string;
  sessionId: string;
}> {
  const orgId = generateUUIDv7();
  const guardianId = generateUUIDv7();
  const childId = generateUUIDv7();

  // 1. v2 identity graph
  await db
    .insert(organization)
    .values({ id: orgId, name: `WI-821 org ${orgId.slice(0, 8)}` });
  await db.insert(person).values([
    {
      id: guardianId,
      displayName: 'WI821-Parent',
      birthDate: '1985-03-15',
      residenceJurisdiction: 'US',
    },
    {
      id: childId,
      displayName: 'WI821-Child',
      birthDate: '2013-06-20',
      residenceJurisdiction: 'US',
    },
  ]);
  // login: guardian only (children don't log in directly)
  await db
    .insert(login)
    .values({ personId: guardianId, clerkUserId: CLERK_USER_ID, email: EMAIL });
  // membership: real writer (identity-graph.ts §2.2a) writes ['admin', 'learner'] for the adult;
  // findOwnerPersonScope queries roles @> ARRAY['admin'] — containment passes.
  await db.insert(membership).values([
    {
      personId: guardianId,
      organizationId: orgId,
      roles: ['admin', 'learner'],
    },
    { personId: childId, organizationId: orgId, roles: ['learner'] },
  ]);
  await db
    .insert(guardianship)
    .values({ guardianPersonId: guardianId, chargePersonId: childId });

  // 2. Learning tree for child (needed for listRecapsForParent to return data)
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: childId,
      name: 'Mathematics',
      rawInput: 'Mathematics',
      status: 'active',
      pedagogyMode: 'socratic',
      languageCode: 'en',
    })
    .returning();
  if (!subject) throw new Error('Subject seed failed');

  const [curriculum] = await db
    .insert(curricula)
    .values({
      subjectId: subject.id,
      version: 1,
    })
    .returning();
  if (!curriculum) throw new Error('Curriculum seed failed');

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject.id,
      title: 'Arithmetic Foundations',
      description: null,
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning();
  if (!book) throw new Error('Book seed failed');

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum.id,
      bookId: book.id,
      title: 'Addition and Subtraction',
      description: 'Basic addition and subtraction.',
      sortOrder: 0,
      estimatedMinutes: 20,
      relevance: 'core',
      source: 'generated',
    })
    .returning();
  if (!topic) throw new Error('Topic seed failed');

  // Session: exchangeCount >= 1, status != 'active' — required for getProfileSessions
  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId: childId,
      subjectId: subject.id,
      topicId: topic.id,
      sessionType: 'learning',
      status: 'completed',
      exchangeCount: 5,
      escalationRung: 1,
    })
    .returning();
  if (!session) throw new Error('Session seed failed');

  return { guardianId, childId, orgId, sessionId: session.id };
}

async function teardownV2Family(
  db: Db,
  orgId: string,
  guardianId: string,
  childId: string,
): Promise<void> {
  // FK-safe teardown (v2 / M-DROP applied — accounts/profiles gone):
  // guardianship → person (cascades login, membership) → organization
  await db
    .delete(guardianship)
    .where(eq(guardianship.guardianPersonId, guardianId));
  await db.delete(guardianship).where(eq(guardianship.chargePersonId, childId));
  await db.delete(person).where(inArray(person.id, [guardianId, childId]));
  await db.delete(organization).where(eq(organization.id, orgId));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

(RUN ? describe : describe.skip)(
  'GET /v1/recaps — v2 identity gate live-repro (WI-821)',
  () => {
    let db: Db;
    let fixture: Awaited<ReturnType<typeof seedV2Family>>;

    beforeAll(async () => {
      db = createDatabase(process.env.DATABASE_URL!);
      await cleanupStaleFixture(db);
      fixture = await seedV2Family(db);
    });

    afterAll(async () => {
      if (fixture) {
        await teardownV2Family(
          db,
          fixture.orgId,
          fixture.guardianId,
          fixture.childId,
        );
      }
    });

    it('[WI-821] correctly-seeded v2 guardian gets 200 + ≥1 recap', async () => {
      const res = await app.request(
        '/v1/recaps',
        {
          method: 'GET',
          headers: buildAuthHeaders({ sub: CLERK_USER_ID, email: EMAIL }),
        },
        ENV,
      );

      const body = await res.json().catch(() => null);

      // Log for verdict evidence
      console.log('[WI-821] HTTP status:', res.status);
      console.log('[WI-821] Body:', JSON.stringify(body));

      // VERDICT: 200 = STAGING-SEED ARTIFACT; 401/403 = REAL GATE DEFECT
      expect(res.status).toBe(200);
      expect(body).toHaveProperty('recaps');
      expect(
        (body as { recaps: unknown[] }).recaps.length,
      ).toBeGreaterThanOrEqual(1);
    });

    // Break test: confirms Gate A (login row) is the actual rejection gate
    it('[WI-821][BREAK-A] no login row → 401 (requireAccountMiddleware / Gate A)', async () => {
      // No login row for this clerk ID → resolveIdentityV2 returns null → no account → 401
      const res = await app.request(
        '/v1/recaps',
        {
          method: 'GET',
          headers: buildAuthHeaders({
            sub: 'wi-821-ghost-no-login',
            email: 'ghost@integration.test',
          }),
        },
        ENV,
      );
      console.log('[WI-821][BREAK-A] status:', res.status);
      expect(res.status).toBe(401);
    });
  },
);
