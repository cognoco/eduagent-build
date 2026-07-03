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
  profiles,
  subjects,
  subscription as subscriptionV2,
  subscriptions,
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
import { legacyIdentityTableExistsForTest } from '../../apps/api/src/test-utils/legacy-identity-anchors';

const TEST_ENV = buildIntegrationEnv();

const PRIMARY_USER_ID = 'integration-profile-primary';
const PRIMARY_EMAIL = 'integration-profile-primary@integration.test';
const SECONDARY_USER_ID = 'integration-profile-secondary';
const SECONDARY_EMAIL = 'integration-profile-secondary@integration.test';
const FABRICATED_PROFILE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

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
  if (await legacyIdentityTableExistsForTest(db, 'subscriptions')) {
    await db
      .update(subscriptions)
      .set({ tier: 'family', status: 'active' })
      .where(eq(subscriptions.accountId, accountId));
  }

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
 * directly.  The workaround: each test creates a temporary non-superuser role
 * with minimal grants, switches to it with SET LOCAL ROLE (superusers may set
 * role to any role), and performs the RLS-gated operation.  Non-superuser roles
 * are subject to ENABLE ROW LEVEL SECURITY without needing FORCE.  Each
 * transaction rolls back atomically, dropping the ephemeral role and any
 * inserted rows.
 *
 * CONCEPT_CAPTURE_ENABLED is now true (WI-781), so the concept-capture write
 * path is live-capable; these tests validate the RLS policy predicate that
 * isolates the rows it writes. (Actual production traffic through the gated
 * call site additionally requires CHALLENGE_ROUND_RUNTIME_ENABLED.)
 */
describe('concepts RLS policy enforcement (WI-1104)', () => {
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
    // Unique role name avoids cross-test collisions on concurrent runs.
    const testRole = `rls_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

        // Create a temporary non-superuser role to observe RLS.
        // PostgreSQL DDL is transactional: this role is dropped on rollback.
        await tx.execute(sql.raw(`CREATE ROLE ${testRole} NOLOGIN`));
        await tx.execute(sql.raw(`GRANT SELECT ON concepts TO ${testRole}`));

        // Switch to the non-owner role; RLS is now enforced by ENABLE ROW
        // LEVEL SECURITY (set in migration 0107) without needing FORCE.
        await tx.execute(sql.raw(`SET LOCAL ROLE ${testRole}`));

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
        throw new Error('test-rollback'); // drops role + rows atomically
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
    const testRole = `rls_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // profile B's GUC + profileId = profile A → WITH CHECK rejects.
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`CREATE ROLE ${testRole} NOLOGIN`));
        await tx.execute(sql.raw(`GRANT INSERT ON concepts TO ${testRole}`));
        await tx.execute(sql.raw(`SET LOCAL ROLE ${testRole}`));
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
    const testRole = `rls_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

        await tx.execute(sql.raw(`CREATE ROLE ${testRole} NOLOGIN`));
        await tx.execute(
          sql.raw(`GRANT SELECT ON concept_mastery TO ${testRole}`),
        );
        await tx.execute(sql.raw(`SET LOCAL ROLE ${testRole}`));

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
    const testRole = `rls_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
        await tx.execute(sql.raw(`CREATE ROLE ${testRole} NOLOGIN`));
        await tx.execute(
          sql.raw(`GRANT INSERT ON concept_mastery TO ${testRole}`),
        );
        await tx.execute(sql.raw(`SET LOCAL ROLE ${testRole}`));
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
