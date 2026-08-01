/**
 * Integration: Profile Isolation (P0-006)
 *
 * Exercises the real profile-scope middleware through the full app + real DB.
 * JWT verification is the only mocked boundary in this suite.
 *
 * Validates:
 * 1. X-Profile-Id for an owned profile returns that profile's scoped subjects
 * 2. X-Profile-Id for another account's profile returns 403
 * 3. Missing X-Profile-Id auto-resolves to the owner profile
 * 4. Explicitly selecting a second profile routes downstream reads correctly
 * 5. Fabricated profile IDs are rejected
 */

import { eq, sql } from 'drizzle-orm';
import {
  conceptMastery,
  concepts,
  subjects,
  subscription as subscriptionV2,
} from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import { seedCurriculum } from './route-fixtures';
import { buildAuthHeaders } from './test-keys';
import { resolveAccountId } from './route-fixtures';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();

const PRIMARY_USER_ID = 'integration-profile-primary';
const PRIMARY_EMAIL = 'integration-profile-primary@integration.test';
const SECONDARY_USER_ID = 'integration-profile-secondary';
const SECONDARY_EMAIL = 'integration-profile-secondary@integration.test';
const FABRICATED_PROFILE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const RLS_TEST_ROLE = 'rls_isolation_test';

type RlsRoleState = {
  currentUser: string;
  roleExists: boolean;
  canLogin: boolean;
  isSuperuser: boolean;
  canBypassRls: boolean;
  canSetRole: boolean;
  hasSchemaUsage: boolean;
  hasConceptsSelect: boolean;
  hasConceptsInsert: boolean;
  hasMasterySelect: boolean;
  hasMasteryInsert: boolean;
};

function rowsFromExecute<T>(raw: unknown): T[] {
  return Array.isArray(raw)
    ? (raw as T[])
    : ((raw as { rows?: T[] }).rows ?? []);
}

async function assertRlsTestRoleReady(): Promise<void> {
  const db = createIntegrationDb();
  const raw = await db.execute(
    sql.raw(`
    SELECT
      current_user AS "currentUser",
      r.oid IS NOT NULL AS "roleExists",
      coalesce(r.rolcanlogin, false) AS "canLogin",
      coalesce(r.rolsuper, false) AS "isSuperuser",
      coalesce(r.rolbypassrls, false) AS "canBypassRls",
      coalesce(pg_has_role(current_user, r.oid, 'SET'), false) AS "canSetRole",
      coalesce(has_schema_privilege(r.oid, 'public', 'USAGE'), false) AS "hasSchemaUsage",
      coalesce(has_table_privilege(r.oid, 'public.concepts', 'SELECT'), false) AS "hasConceptsSelect",
      coalesce(has_table_privilege(r.oid, 'public.concepts', 'INSERT'), false) AS "hasConceptsInsert",
      coalesce(has_table_privilege(r.oid, 'public.concept_mastery', 'SELECT'), false) AS "hasMasterySelect",
      coalesce(has_table_privilege(r.oid, 'public.concept_mastery', 'INSERT'), false) AS "hasMasteryInsert"
    FROM (SELECT 1) AS singleton
    LEFT JOIN pg_catalog.pg_roles r ON r.rolname = '${RLS_TEST_ROLE}'
  `),
  );
  const state = rowsFromExecute<RlsRoleState>(raw)[0];
  const ready =
    state?.roleExists &&
    !state.canLogin &&
    !state.isSuperuser &&
    !state.canBypassRls &&
    state.canSetRole &&
    state.hasSchemaUsage &&
    state.hasConceptsSelect &&
    state.hasConceptsInsert &&
    state.hasMasterySelect &&
    state.hasMasteryInsert;
  if (!ready) {
    throw new Error(
      `${RLS_TEST_ROLE} is not ready for ${state?.currentUser ?? 'current_user'}; ` +
        'run the guarded local setup or the operator-owned shared setup in ' +
        'docs/runbooks/rls-isolation-test-role.md.',
    );
  }
}

async function assertCurrentRlsRole(tx: {
  execute(query: ReturnType<typeof sql.raw>): Promise<unknown>;
}): Promise<void> {
  const raw = await tx.execute(
    sql.raw(
      `SELECT current_user AS "currentUser", session_user AS "sessionUser"`,
    ),
  );
  const row = rowsFromExecute<{ currentUser: string; sessionUser: string }>(
    raw,
  )[0];
  expect(row?.currentUser).toBe(RLS_TEST_ROLE);
  expect(row?.sessionUser).not.toBe(RLS_TEST_ROLE);
}

async function createProfile(input: {
  userId: string;
  email: string;
  displayName: string;
  birthYear: number;
  kind?: 'owner' | 'child';
  /** Owner's profile id — required when kind === 'child'. */
  actingProfileId?: string;
}): Promise<{
  id: string;
  isOwner: boolean;
}> {
  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders(
        { sub: input.userId, email: input.email },
        input.actingProfileId,
      ),
      body: JSON.stringify({
        ...(input.kind ? { kind: input.kind } : {}),
        displayName: input.displayName,
        birthYear: input.birthYear,
      }),
    },
    TEST_ENV,
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.profile as { id: string; isOwner: boolean };
}

async function seedSubject(
  profileId: string,
  name: string,
): Promise<{ id: string; profileId: string; name: string }> {
  const db = createIntegrationDb();
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning();

  return {
    id: subject!.id,
    profileId: subject!.profileId,
    name: subject!.name,
  };
}

/**
 * Seeds a family-tier subscription so the billing guard allows
 * non-first profile creation on this account.
 */
async function seedFamilySubscription(profileId: string) {
  const db = createIntegrationDb();
  // [WI-1145] Resolve the org/account v2-first (membership) then legacy profiles —
  // the owner is route-created (v2-unconditional post-WI-867 collapse; legacy
  // profiles empty on the flag-off main lane).
  const accountId = await resolveAccountId(db, profileId);
  if (!accountId) throw new Error('Profile not found for subscription seed');

  // Account creation auto-provisions a 'plus' trial subscription,
  // so we UPDATE the existing row to 'family' tier instead of inserting.

  // [WI-1145] Update the v2 subscription unconditionally (dual-store consistency) —
  // the product reads subscription-v2 unconditionally post-collapse.
  await db
    .update(subscriptionV2)
    .set({ planTier: 'family', status: 'active', updatedAt: new Date() })
    .where(eq(subscriptionV2.organizationId, accountId));
}

async function listSubjectsForUser(input: {
  userId: string;
  email: string;
  profileId?: string;
}) {
  return app.request(
    '/v1/subjects',
    {
      method: 'GET',
      headers: buildAuthHeaders(
        { sub: input.userId, email: input.email },
        input.profileId,
      ),
    },
    TEST_ENV,
  );
}

beforeEach(async () => {
  await cleanupAccounts({
    emails: [PRIMARY_EMAIL, SECONDARY_EMAIL],
    clerkUserIds: [PRIMARY_USER_ID, SECONDARY_USER_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [PRIMARY_EMAIL, SECONDARY_EMAIL],
    clerkUserIds: [PRIMARY_USER_ID, SECONDARY_USER_ID],
  });
});

describe('Integration: Profile Isolation (P0-006)', () => {
  it('returns 200 with subjects when X-Profile-Id belongs to the account', async () => {
    const ownerProfile = await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'Primary Learner',
      birthYear: 2000,
    });
    const subject = await seedSubject(ownerProfile.id, 'Mathematics');

    const res = await listSubjectsForUser({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      profileId: ownerProfile.id,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects[0]).toMatchObject({
      id: subject.id,
      profileId: ownerProfile.id,
      name: 'Mathematics',
    });
  });

  it('returns 403 FORBIDDEN when X-Profile-Id does not belong to the account', async () => {
    await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'Primary Learner',
      birthYear: 2000,
    });
    const foreignProfile = await createProfile({
      userId: SECONDARY_USER_ID,
      email: SECONDARY_EMAIL,
      displayName: 'Secondary Learner',
      birthYear: 2001,
    });

    const res = await listSubjectsForUser({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      profileId: foreignProfile.id,
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('auto-resolves to the owner profile when X-Profile-Id is absent', async () => {
    const ownerProfile = await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'Owner Profile',
      birthYear: 2000,
    });
    await seedFamilySubscription(ownerProfile.id);
    const secondProfile = await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'Second Profile',
      birthYear: 2012,
      kind: 'child',
      actingProfileId: ownerProfile.id,
    });

    expect(ownerProfile.isOwner).toBe(true);
    expect(secondProfile.isOwner).toBe(false);

    const ownerSubject = await seedSubject(ownerProfile.id, 'Owner Subject');
    await seedSubject(secondProfile.id, 'Second Subject');

    const res = await listSubjectsForUser({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects[0]).toMatchObject({
      id: ownerSubject.id,
      profileId: ownerProfile.id,
      name: 'Owner Subject',
    });
  });

  it('correctly propagates a second profileId to downstream scoped reads', async () => {
    const ownerProfile = await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'Owner Profile',
      birthYear: 2000,
    });
    await seedFamilySubscription(ownerProfile.id);
    const secondProfile = await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'Teen Profile',
      birthYear: 2001,
      kind: 'child',
      actingProfileId: ownerProfile.id,
    });

    await seedSubject(ownerProfile.id, 'Owner Mathematics');
    const secondSubject = await seedSubject(secondProfile.id, 'Teen Science');

    const res = await listSubjectsForUser({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      profileId: secondProfile.id,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects[0]).toMatchObject({
      id: secondSubject.id,
      profileId: secondProfile.id,
      name: 'Teen Science',
    });
  });

  it('prevents access with a fabricated profile ID', async () => {
    await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'Primary Learner',
      birthYear: 2000,
    });

    const res = await listSubjectsForUser({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      profileId: FABRICATED_PROFILE_ID,
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });
});

/**
 * WI-1104: DB-level RLS enforcement for the concepts table.
 *
 * PostgreSQL superusers bypass row-level security even with FORCE ROW LEVEL
 * SECURITY, so the integration test DB's owner role cannot observe RLS effects
 * directly. A dedicated NOLOGIN, non-owner role has only the table privileges
 * needed by these assertions, and the integration harness has SET membership.
 * Role setup is explicit: CI provisions it only on disposable loopback
 * PostgreSQL; shared Neon setup remains an operator-owned action. Tests only
 * switch role and never mutate external role catalog state.
 *
 * CONCEPT_CAPTURE_ENABLED is now true (WI-781), so the concept-capture write
 * path is live-capable; these tests validate the RLS policy predicate that
 * isolates the rows it writes. (Actual production traffic through the gated
 * call site additionally requires CHALLENGE_ROUND_RUNTIME_ENABLED.)
 */
describe('concepts RLS policy enforcement (WI-1104)', () => {
  beforeAll(assertRlsTestRoleReady);

  it('USING: row written under profile A not visible under profile B GUC (non-owner role)', async () => {
    const profileA = await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'Learner A',
      birthYear: 2000,
    });
    const profileB = await createProfile({
      userId: SECONDARY_USER_ID,
      email: SECONDARY_EMAIL,
      displayName: 'Learner B',
      birthYear: 2001,
    });
    const db = createIntegrationDb();
    const subject = await seedSubject(profileA.id, 'rls-using-test-subject');
    const { topicIds } = await seedCurriculum({
      subjectId: subject.id,
      topics: [{ title: 'rls-using-test-topic' }],
    });
    let assertionsRan = false;
    try {
      await db.transaction(async (tx) => {
        // Seed as superuser (bypasses RLS — simulates server-side insert).
        await tx.insert(concepts).values({
          profileId: profileA.id,
          subjectId: subject.id,
          topicId: topicIds[0]!,
          label: 'rls-using-test',
          normalizedLabel: 'rls-using-test',
        });

        // Switch to the non-owner role; RLS is now enforced by ENABLE ROW
        // LEVEL SECURITY (set in migration 0107) without needing FORCE.
        await tx.execute(sql.raw(`SET LOCAL ROLE ${RLS_TEST_ROLE}`));
        await assertCurrentRlsRole(tx);

        // Sanity: own profile sees its row (guards against a false pass where
        // the table is simply empty for both profiles).
        await tx.execute(
          sql`SELECT set_config('app.current_profile_id', ${profileA.id}, true)`,
        );
        const own = await tx
          .select({ id: concepts.id })
          .from(concepts)
          .where(eq(concepts.profileId, profileA.id));
        expect(own).toHaveLength(1);

        // Cross-profile: profile B's GUC must not see profile A's row.
        await tx.execute(
          sql`SELECT set_config('app.current_profile_id', ${profileB.id}, true)`,
        );
        const leaked = await tx
          .select({ id: concepts.id })
          .from(concepts)
          .where(eq(concepts.profileId, profileA.id));
        expect(leaked).toHaveLength(0);

        assertionsRan = true;
        throw new Error('test-rollback'); // rolls back the seeded row atomically
      });
    } catch (e: unknown) {
      if (!(e instanceof Error && e.message === 'test-rollback')) throw e;
    }

    expect(assertionsRan).toBe(true);
  });

  it('WITH CHECK: cross-profile concept insert rejected (non-owner role)', async () => {
    const profileA = await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'Target A',
      birthYear: 2000,
    });
    const profileB = await createProfile({
      userId: SECONDARY_USER_ID,
      email: SECONDARY_EMAIL,
      displayName: 'Attacker B',
      birthYear: 2001,
    });
    const db = createIntegrationDb();
    const subject = await seedSubject(profileA.id, 'rls-check-test-subject');
    const { topicIds } = await seedCurriculum({
      subjectId: subject.id,
      topics: [{ title: 'rls-check-test-topic' }],
    });
    // profile B's GUC + profileId = profile A → WITH CHECK rejects.
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL ROLE ${RLS_TEST_ROLE}`));
        await assertCurrentRlsRole(tx);
        await tx.execute(
          sql`SELECT set_config('app.current_profile_id', ${profileB.id}, true)`,
        );
        await tx.insert(concepts).values({
          profileId: profileA.id,
          subjectId: subject.id,
          topicId: topicIds[0]!,
          label: 'cross-profile-attempt',
          normalizedLabel: 'cross-profile-attempt',
        });
      }),
      // Drizzle wraps the PostgreSQL error as "Failed query: <SQL>" with the
      // original PG error in `.cause`. The PG RLS WITH CHECK violation sets
      // cause.code = '42501' (SQLSTATE insufficient_privilege). Asserting the
      // cause code pins this to the specific RLS rejection, not just any throw.
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ code: '42501' }),
    });
  });
});

/**
 * WI-1104: DB-level RLS enforcement for the concept_mastery table.
 *
 * Mirrors the concepts block above. concept_mastery references concepts.id
 * (FK), so a valid concept row is seeded as superuser before switching role.
 */
describe('concept_mastery RLS policy enforcement (WI-1104)', () => {
  beforeAll(assertRlsTestRoleReady);

  it('USING: row written under profile A not visible under profile B GUC (non-owner role)', async () => {
    const profileA = await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'CM Learner A',
      birthYear: 2000,
    });
    const profileB = await createProfile({
      userId: SECONDARY_USER_ID,
      email: SECONDARY_EMAIL,
      displayName: 'CM Learner B',
      birthYear: 2001,
    });
    const db = createIntegrationDb();
    const subject = await seedSubject(profileA.id, 'cm-rls-using-subject');
    const { topicIds } = await seedCurriculum({
      subjectId: subject.id,
      topics: [{ title: 'cm-rls-using-topic' }],
    });
    let assertionsRan = false;
    try {
      await db.transaction(async (tx) => {
        // Seed concept + mastery as superuser (bypasses RLS).
        const [concept] = await tx
          .insert(concepts)
          .values({
            profileId: profileA.id,
            subjectId: subject.id,
            topicId: topicIds[0]!,
            label: 'cm-rls-using',
            normalizedLabel: 'cm-rls-using',
          })
          .returning({ id: concepts.id });
        await tx.insert(conceptMastery).values({
          conceptId: concept!.id,
          profileId: profileA.id,
          status: 'solid',
          lastEvaluatedAt: new Date(),
        });

        await tx.execute(sql.raw(`SET LOCAL ROLE ${RLS_TEST_ROLE}`));
        await assertCurrentRlsRole(tx);

        // Sanity: own profile sees its row.
        await tx.execute(
          sql`SELECT set_config('app.current_profile_id', ${profileA.id}, true)`,
        );
        const own = await tx
          .select({ id: conceptMastery.id })
          .from(conceptMastery)
          .where(eq(conceptMastery.profileId, profileA.id));
        expect(own).toHaveLength(1);

        // Cross-profile: profile B's GUC must not see profile A's row.
        await tx.execute(
          sql`SELECT set_config('app.current_profile_id', ${profileB.id}, true)`,
        );
        const leaked = await tx
          .select({ id: conceptMastery.id })
          .from(conceptMastery)
          .where(eq(conceptMastery.profileId, profileA.id));
        expect(leaked).toHaveLength(0);

        assertionsRan = true;
        throw new Error('test-rollback');
      });
    } catch (e: unknown) {
      if (!(e instanceof Error && e.message === 'test-rollback')) throw e;
    }

    expect(assertionsRan).toBe(true);
  });

  it('WITH CHECK: cross-profile concept_mastery insert rejected (non-owner role)', async () => {
    const profileA = await createProfile({
      userId: PRIMARY_USER_ID,
      email: PRIMARY_EMAIL,
      displayName: 'CM Target A',
      birthYear: 2000,
    });
    const profileB = await createProfile({
      userId: SECONDARY_USER_ID,
      email: SECONDARY_EMAIL,
      displayName: 'CM Attacker B',
      birthYear: 2001,
    });
    const db = createIntegrationDb();
    const subject = await seedSubject(profileA.id, 'cm-rls-check-subject');
    const { topicIds } = await seedCurriculum({
      subjectId: subject.id,
      topics: [{ title: 'cm-rls-check-topic' }],
    });
    // Seed parent concept as superuser (bypasses RLS); need a valid concept FK.
    const [concept] = await db
      .insert(concepts)
      .values({
        profileId: profileA.id,
        subjectId: subject.id,
        topicId: topicIds[0]!,
        label: 'cm-rls-check',
        normalizedLabel: 'cm-rls-check',
      })
      .returning({ id: concepts.id });

    // profileB's GUC + profileId = profileA → WITH CHECK rejects.
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL ROLE ${RLS_TEST_ROLE}`));
        await assertCurrentRlsRole(tx);
        await tx.execute(
          sql`SELECT set_config('app.current_profile_id', ${profileB.id}, true)`,
        );
        await tx.insert(conceptMastery).values({
          conceptId: concept!.id,
          profileId: profileA.id,
          status: 'solid',
          lastEvaluatedAt: new Date(),
        });
      }),
      // Drizzle wraps the PostgreSQL error as "Failed query: <SQL>" with the
      // original PG error in `.cause`. The PG RLS WITH CHECK violation sets
      // cause.code = '42501' (SQLSTATE insufficient_privilege). Asserting the
      // cause code pins this to the specific RLS rejection, not just any throw.
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ code: '42501' }),
    });

    // Clean up the seeded concept (not inside the rolled-back transaction).
    await db.delete(concepts).where(eq(concepts.id, concept!.id));
  });
});
