/**
 * Integration: Onboarding PATCH routes (BKT-C.1 / BKT-C.2)
 *
 * Verifies the three onboarding update functions against a real database:
 * - updateConversationLanguage
 * - updatePronouns
 * - updateInterestsContext
 *
 * Key security assertion: the accountId guard prevents cross-account writes.
 * No mocks of internal services or database.
 */

import { eq, inArray } from 'drizzle-orm';
import {
  generateUUIDv7,
  membership,
  organization,
  person,
  profiles,
  learningProfiles,
  createDatabase,
} from '@eduagent/database';
import { loadDatabaseEnv, TEST_NONEXISTENT_ID } from '@eduagent/test-utils';
import { resolve } from 'path';
import { isIdentityV2Enabled } from '../../../../../tests/integration/helpers';
import {
  updateConversationLanguage,
  updatePronouns,
  updateInterestsContext,
  OnboardingNotFoundError,
} from './index';

// ---------------------------------------------------------------------------
// DB setup — real connection
// ---------------------------------------------------------------------------

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return url;
}

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

// ---------------------------------------------------------------------------
// Test identifiers — unique prefix prevents collisions
// ---------------------------------------------------------------------------

const PREFIX = 'integration-onboarding';
const ACCOUNTS = [
  { clerkUserId: `${PREFIX}-a1`, email: `${PREFIX}-a1@integration.test` },
  { clerkUserId: `${PREFIX}-b1`, email: `${PREFIX}-b1@integration.test` },
];

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded v2 ids for cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function seedAccountAndProfile(index: number) {
  const db = createIntegrationDb();
  const acc = ACCOUNTS[index]!;

  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();

  // [WI-1128] Legacy `accounts`/`profiles` are dropped (0130_m_drop.sql) — this
  // is now a pure v2 seed. `updateInterestsContext` (the only still-live
  // subject function this file exercises — see the dead-code note on the
  // updateConversationLanguage/updatePronouns describe blocks below) reads
  // membership unconditionally.
  await db.insert(organization).values({
    id: accountId,
    name: `Onboarding Test Org ${index}`,
  });
  await db.insert(person).values({
    id: profileId,
    displayName: `Onboarding Test ${index}`,
    birthDate: '2012-01-01',
    residenceJurisdiction: 'US',
  });
  await db.insert(membership).values({
    personId: profileId,
    organizationId: accountId,
    roles: ['learner'],
  });

  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  return {
    account: { id: accountId, clerkUserId: acc.clerkUserId, email: acc.email },
    profile: { id: profileId },
  };
}

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  if (seededProfileIds.length > 0) {
    await db
      .delete(learningProfiles)
      .where(inArray(learningProfiles.profileId, seededProfileIds));
    await db
      .delete(membership)
      .where(inArray(membership.personId, seededProfileIds));
    await db.delete(person).where(inArray(person.id, seededProfileIds));
    seededProfileIds.length = 0;
  }
  if (seededAccountIds.length > 0) {
    await db
      .delete(organization)
      .where(inArray(organization.id, seededAccountIds));
    seededAccountIds.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await cleanupTestAccounts();
});

afterAll(async () => {
  await cleanupTestAccounts();
});

// ---------------------------------------------------------------------------
// Tests — updateConversationLanguage
//
// WI-1128 quarantine: `updateConversationLanguage` (services/onboarding/index.ts)
// is orphaned dead code — it still writes directly to legacy `profiles`
// (dropped by 0130_m_drop.sql). Reachability: apps/api/src/routes/onboarding.ts
// imports `updateConversationLanguageV2` from services/identity-v2/onboarding-v2.ts
// (not this legacy function) for its PATCH /onboarding/language handler — the
// route dispatcher comment there reads "[WI-867] v2 always: collapsed from
// dispatch-with-flag pattern." No other apps/**/*.ts or packages/**/*.ts
// caller of the legacy `updateConversationLanguage` was found outside this
// test file and generated dist output. The v2 twin has its own live coverage
// in services/identity-v2/onboarding-v2.integration.test.ts. Fails
// post-0130/0129-repoint. Deletion + un-skip = WI-1139 dead-sweep.
// ---------------------------------------------------------------------------

(isIdentityV2Enabled() ? describe.skip : describe)(
  'updateConversationLanguage (integration)',
  () => {
    it('updates language when profileId + accountId match', async () => {
      const { account, profile } = await seedAccountAndProfile(0);
      const db = createIntegrationDb();

      await updateConversationLanguage(db, profile.id, account.id, 'cs');

      const updated = await db.query.profiles.findFirst({
        where: eq(profiles.id, profile.id),
      });
      expect(updated?.conversationLanguage).toBe('cs');
    });

    it('accepts widened UI locales', async () => {
      const { account, profile } = await seedAccountAndProfile(0);
      const db = createIntegrationDb();

      await updateConversationLanguage(db, profile.id, account.id, 'ja');
      await updateConversationLanguage(db, profile.id, account.id, 'nb');

      const updated = await db.query.profiles.findFirst({
        where: eq(profiles.id, profile.id),
      });
      expect(updated?.conversationLanguage).toBe('nb');
    });

    it('throws OnboardingNotFoundError when accountId does not match', async () => {
      const { profile: profileA } = await seedAccountAndProfile(0);
      const { account: accountB } = await seedAccountAndProfile(1);
      const db = createIntegrationDb();

      await expect(
        updateConversationLanguage(db, profileA.id, accountB.id, 'es'),
      ).rejects.toThrow(OnboardingNotFoundError);

      // Verify the value was NOT changed
      const unchanged = await db.query.profiles.findFirst({
        where: eq(profiles.id, profileA.id),
      });
      expect(unchanged?.conversationLanguage).toBe('en');
    });
  },
);

// ---------------------------------------------------------------------------
// Tests — updatePronouns
//
// WI-1128 quarantine: same DEAD verdict as updateConversationLanguage above:
// `updatePronouns` (services/onboarding/index.ts) is orphaned dead code — it
// still writes directly to legacy `profiles` (dropped by 0130_m_drop.sql), and
// apps/api/src/routes/onboarding.ts dispatches PATCH /onboarding/pronouns to
// `updatePronounsV2` (services/identity-v2/onboarding-v2.ts) instead, per the
// same "[WI-867] v2 always" collapse. No other live caller found. See the
// updateConversationLanguage note above for full reachability evidence. Fails
// post-0130/0129-repoint. Deletion + un-skip = WI-1139 dead-sweep.
// ---------------------------------------------------------------------------

(isIdentityV2Enabled() ? describe.skip : describe)(
  'updatePronouns (integration)',
  () => {
    it('updates pronouns when profileId + accountId match', async () => {
      const { account, profile } = await seedAccountAndProfile(0);
      const db = createIntegrationDb();

      await updatePronouns(db, profile.id, account.id, 'they/them');

      const updated = await db.query.profiles.findFirst({
        where: eq(profiles.id, profile.id),
      });
      expect(updated?.pronouns).toBe('they/them');
    });

    it('clears pronouns when null is passed', async () => {
      const { account, profile } = await seedAccountAndProfile(0);
      const db = createIntegrationDb();

      // Set first, then clear
      await updatePronouns(db, profile.id, account.id, 'she/her');
      await updatePronouns(db, profile.id, account.id, null);

      const updated = await db.query.profiles.findFirst({
        where: eq(profiles.id, profile.id),
      });
      expect(updated?.pronouns).toBeNull();
    });

    it('throws OnboardingNotFoundError when accountId does not match', async () => {
      const { profile: profileA } = await seedAccountAndProfile(0);
      const { account: accountB } = await seedAccountAndProfile(1);
      const db = createIntegrationDb();

      await expect(
        updatePronouns(db, profileA.id, accountB.id, 'he/him'),
      ).rejects.toThrow(OnboardingNotFoundError);
    });
  },
);

// ---------------------------------------------------------------------------
// Tests — updateInterestsContext
// ---------------------------------------------------------------------------

describe('updateInterestsContext (integration)', () => {
  it('creates learning_profiles row and persists interests', async () => {
    const { account, profile } = await seedAccountAndProfile(0);
    const db = createIntegrationDb();

    const interests = [
      { label: 'Dinosaurs', context: 'free_time' as const },
      { label: 'Maths', context: 'school' as const },
    ];

    await updateInterestsContext(db, profile.id, account.id, interests);

    const lp = await db.query.learningProfiles.findFirst({
      where: eq(learningProfiles.profileId, profile.id),
    });
    expect(lp).toEqual(expect.objectContaining({}));
    expect(lp?.interests).toEqual(interests);
  });

  it('replaces existing interests on subsequent calls', async () => {
    const { account, profile } = await seedAccountAndProfile(0);
    const db = createIntegrationDb();

    await updateInterestsContext(db, profile.id, account.id, [
      { label: 'Art', context: 'free_time' as const },
    ]);
    await updateInterestsContext(db, profile.id, account.id, [
      { label: 'Science', context: 'school' as const },
    ]);

    const lp = await db.query.learningProfiles.findFirst({
      where: eq(learningProfiles.profileId, profile.id),
    });
    expect(lp?.interests).toEqual([{ label: 'Science', context: 'school' }]);
  });

  it('throws OnboardingNotFoundError when accountId does not match [I-8]', async () => {
    const { profile: profileA } = await seedAccountAndProfile(0);
    const { account: accountB } = await seedAccountAndProfile(1);
    const db = createIntegrationDb();

    await expect(
      updateInterestsContext(db, profileA.id, accountB.id, [
        { label: 'Hacking', context: 'free_time' as const },
      ]),
    ).rejects.toThrow(OnboardingNotFoundError);

    // Verify no learning_profiles row was created for profileA
    const lp = await db.query.learningProfiles.findFirst({
      where: eq(learningProfiles.profileId, profileA.id),
    });
    expect(lp).toBeUndefined();
  });

  it('throws for a completely nonexistent profileId', async () => {
    const { account } = await seedAccountAndProfile(0);
    const db = createIntegrationDb();
    await expect(
      updateInterestsContext(db, TEST_NONEXISTENT_ID, account.id, [
        { label: 'Music', context: 'both' as const },
      ]),
    ).rejects.toThrow(OnboardingNotFoundError);
  });

  // [WI-737 / S5+C3] Regression guard for the TOCTOU gap: the accountId check
  // that sits before the CAS loop is not atomic with the version-gated UPDATE.
  // Profiles are not account-transferable today, so there is no live trigger for
  // this race window — but the defense-in-depth fix closes the gap permanently.
  // This test asserts the end-to-end behavior: a cross-account write on an
  // existing learning_profiles row is rejected (either at the outer pre-check
  // or, with the fix, at the atomic UPDATE WHERE) and the stored state is
  // untouched. Removing the EXISTS clause in the UPDATE WHERE would not cause
  // this test to fail because the outer pre-check catches it first; the test
  // instead confirms the invariant holds across the full call.
  it('[WI-737] CAS UPDATE rejects mismatched accountId even when learning_profiles row exists', async () => {
    const { account: accountA, profile: profileA } =
      await seedAccountAndProfile(0);
    const { account: accountB } = await seedAccountAndProfile(1);
    const db = createIntegrationDb();

    // Seed a real learning_profiles row for profileA so the retry path can be
    // exercised and the row is present in the DB.
    const originalInterests = [
      { label: 'Science', context: 'school' as const },
    ];
    await updateInterestsContext(
      db,
      profileA.id,
      accountA.id,
      originalInterests,
    );

    // Confirm the row exists and has the expected interests.
    const before = await db.query.learningProfiles.findFirst({
      where: eq(learningProfiles.profileId, profileA.id),
    });
    expect(before?.interests).toEqual(originalInterests);
    const versionBefore = before!.version;

    // Attempt a cross-account write: accountB tries to overwrite profileA's interests.
    await expect(
      updateInterestsContext(db, profileA.id, accountB.id, [
        { label: 'Hacking', context: 'free_time' as const },
      ]),
    ).rejects.toThrow(OnboardingNotFoundError);

    // The row must be completely unmodified — same interests, same version.
    const after = await db.query.learningProfiles.findFirst({
      where: eq(learningProfiles.profileId, profileA.id),
    });
    expect(after?.interests).toEqual(originalInterests);
    expect(after?.version).toBe(versionBefore);
  });

  // [F-164] The version bump alone (without a compare-and-set on the version
  // we read) was decorative: two concurrent picker submits both passed and
  // last-writer-wins silently dropped one. The CAS makes each write provably
  // land or retry. Two truly-concurrent writes (each via its own connection)
  // with distinct interest sets must leave the row in exactly one of the two
  // submitted states — never a torn or empty state — and the version must
  // advance once per landed write.
  it('[F-164] concurrent interest writes do not lose updates (CAS)', async () => {
    const { account, profile } = await seedAccountAndProfile(0);

    const setA = [{ label: 'Astronomy', context: 'free_time' as const }];
    const setB = [{ label: 'Biology', context: 'school' as const }];

    // Separate DB connections so the two writes genuinely race rather than
    // serialize on a single client.
    const dbA = createIntegrationDb();
    const dbB = createIntegrationDb();

    // Seed the learning_profiles row first so both writers start from the same
    // known version and actually contend on the UPDATE (rather than one of them
    // creating the row).
    await updateInterestsContext(dbA, profile.id, account.id, [
      { label: 'Seed', context: 'both' as const },
    ]);
    const seeded = await dbA.query.learningProfiles.findFirst({
      where: eq(learningProfiles.profileId, profile.id),
    });
    const seededVersion = seeded!.version;

    await Promise.all([
      updateInterestsContext(dbA, profile.id, account.id, setA),
      updateInterestsContext(dbB, profile.id, account.id, setB),
    ]);

    const lp = await createIntegrationDb().query.learningProfiles.findFirst({
      where: eq(learningProfiles.profileId, profile.id),
    });

    // The persisted interests equal exactly ONE of the two submitted sets — no
    // torn/empty state.
    expect([setA, setB]).toContainEqual(lp?.interests);

    // Both writes landed via CAS (one may have retried after a conflict), so the
    // version advanced by exactly two from the seeded value.
    expect(lp?.version).toBe(seededVersion + 2);
  });
});
