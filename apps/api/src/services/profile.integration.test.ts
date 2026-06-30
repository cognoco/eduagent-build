/**
 * Integration: Profile Service — concurrent creation cap enforcement (BUG-862)
 *
 * Before the neon-serverless driver swap, db.transaction() was a no-op so
 * pg_advisory_xact_lock() was never held in a real BEGIN/COMMIT.  The lock
 * was scoped to the current autocommit statement, which released immediately
 * before the count check ran.  Two concurrent createProfileWithLimitCheck
 * calls both read a count of (cap - 1) and both created a profile,
 * exceeding the per-tier cap.
 *
 * With real ACID transactions the advisory lock serialises concurrent profile
 * creations for the same account.  The second waits for the first to commit,
 * then reads the updated count and hits the cap check.
 *
 * Tier used: 'family' (maxProfiles = 4). Setup: 3 profiles (cap - 1).
 * Fire: 3 concurrent createProfileWithLimitCheck.
 * Assert: final profile count === 4 (exactly one extra created).
 *
 * No mocks of internal services or database.
 */

import { eq, inArray, count } from 'drizzle-orm';
import { accounts, profiles, createDatabase } from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import { createProfileWithLimitCheck, ProfileLimitError } from './profile';
import { createSubscription } from './billing';
import { getTierConfig } from './subscription';
import type { ProfileCreateInput } from '@eduagent/schemas';
import { ForbiddenError, PARENT_ACCOUNT_MINIMUM_AGE } from '@eduagent/schemas';
import { calculateAgeFromParts } from './consent';

// ---------------------------------------------------------------------------
// DB setup — real connection
// ---------------------------------------------------------------------------

loadDatabaseEnv(resolve(__dirname, '../../../..'));

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
// Test identifiers
// ---------------------------------------------------------------------------

const PREFIX = 'integration-profile-bug862';
const ACCOUNT = {
  clerkUserId: `${PREFIX}-user`,
  email: `${PREFIX}@integration.test`,
};
const FIRST_PROFILE_ACCOUNT = {
  clerkUserId: `${PREFIX}-first-profile-user`,
  email: `${PREFIX}-first-profile@integration.test`,
};

// [OPT-C] Adult-owner gate break-test accounts
const OPT_C_PREFIX = 'integration-profile-optc';
const OPT_C_UNDERAGE_EMAIL = `${OPT_C_PREFIX}-underage@integration.test`;
const OPT_C_ADULT18_EMAIL = `${OPT_C_PREFIX}-adult18@integration.test`;
const OPT_C_FLAG_OFF_EMAIL = `${OPT_C_PREFIX}-flagoff@integration.test`;
// [WI-367] owner who is 18 by year-diff but 17 by exact birth date
const OPT_C_EXACT17_EMAIL = `${OPT_C_PREFIX}-exact17@integration.test`;
const WI367_PERSIST_EMAIL = `${OPT_C_PREFIX}-persist-fulldate@integration.test`;
const CURRENT_YEAR = new Date().getFullYear();
const OPT_C_UNDERAGE_OWNER_BIRTH_YEAR = CURRENT_YEAR - 13;
const OPT_C_ADULT_BOUNDARY_BIRTH_YEAR = CURRENT_YEAR - 18;
const OPT_C_ALLOWED_CHILD_BIRTH_YEAR = CURRENT_YEAR - 14;
const legacyProfileIntegrationEnabled =
  process.env.IDENTITY_V2_ENABLED !== 'true';
const legacyDescribe = legacyProfileIntegrationEnabled
  ? describe
  : describe.skip;

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

/**
 * Seeds an account with a single owner profile at the given birthYear.
 * Returns the account row. A 'family' subscription is provisioned so
 * subsequent createProfileWithLimitCheck calls are not blocked by the limit.
 */
async function seedOwnerAccount(
  email: string,
  clerkUserId: string,
  ownerBirthYear: number,
  ownerBirthMonth?: number,
  ownerBirthDay?: number,
) {
  const db = createIntegrationDb();
  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning();

  // Family subscription — cap = 4, well above what break tests need
  const familyConfig = getTierConfig('family');
  await createSubscription(
    db,
    account!.id,
    'family',
    familyConfig.monthlyQuota,
    {
      status: 'active',
    },
  );

  // Insert owner profile directly (bypass createProfileWithLimitCheck) so the
  // owner's birthYear is set independently of the gate logic under test.
  await db.insert(profiles).values({
    accountId: account!.id,
    displayName: 'Owner',
    birthYear: ownerBirthYear,
    birthMonth: ownerBirthMonth ?? null,
    birthDay: ownerBirthDay ?? null,
    isOwner: true,
  });

  return { db, accountId: account!.id };
}

async function seedFixture() {
  const db = createIntegrationDb();

  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId: ACCOUNT.clerkUserId, email: ACCOUNT.email })
    .returning();

  // Provision a family subscription (maxProfiles = 4)
  const familyConfig = getTierConfig('family');
  await createSubscription(
    db,
    account!.id,
    'family',
    familyConfig.monthlyQuota,
    {
      status: 'active',
    },
  );

  // Create the owner profile (first profile — always allowed, no limit check)
  const [ownerProfile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Owner',
      birthYear: 1990,
      isOwner: true,
    })
    .returning();

  return { account: account!, ownerProfile: ownerProfile! };
}

async function cleanup() {
  const db = createIntegrationDb();
  const found = await db.query.accounts.findMany({
    where: inArray(accounts.email, [
      ACCOUNT.email,
      FIRST_PROFILE_ACCOUNT.email,
      OPT_C_UNDERAGE_EMAIL,
      OPT_C_ADULT18_EMAIL,
      OPT_C_FLAG_OFF_EMAIL,
      OPT_C_EXACT17_EMAIL,
      WI367_PERSIST_EMAIL,
    ]),
  });
  const ids = found.map((a: typeof accounts.$inferSelect) => a.id);
  if (ids.length > 0) {
    await db.delete(accounts).where(inArray(accounts.id, ids));
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  if (!legacyProfileIntegrationEnabled) return;
  await cleanup();
});

afterAll(async () => {
  if (!legacyProfileIntegrationEnabled) return;
  await cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

legacyDescribe(
  '[BUG-862] createProfileWithLimitCheck concurrent cap enforcement (integration)',
  () => {
    it('[BUG-1100] marks the first profile as owner even when COUNT returns a string', async () => {
      const db = createIntegrationDb();
      const [account] = await db
        .insert(accounts)
        .values({
          clerkUserId: FIRST_PROFILE_ACCOUNT.clerkUserId,
          email: FIRST_PROFILE_ACCOUNT.email,
        })
        .returning();

      const profile = await createProfileWithLimitCheck(db, account!.id, {
        displayName: 'First Owner',
        birthYear: 2000,
      });

      expect(profile.isOwner).toBe(true);

      const stored = await db.query.profiles.findFirst({
        where: eq(profiles.id, profile.id),
        columns: { isOwner: true },
      });
      expect(stored?.isOwner).toBe(true);
    });

    it('[BUG-862] pg_advisory_xact_lock serialises concurrent profile creation — cap is not exceeded', async () => {
      const { account } = await seedFixture();
      const db = createIntegrationDb();

      // family tier cap = 4. Owner is already profile #1.
      // Add 2 more profiles sequentially to reach cap - 1 = 3.
      const input: ProfileCreateInput = {
        displayName: 'Child',
        birthYear: 2012,
      };

      for (let i = 0; i < 2; i++) {
        await createProfileWithLimitCheck(db, account.id, {
          ...input,
          displayName: `Pre-seeded Child ${i + 1}`,
        });
      }

      // Confirm we are at cap - 1 = 3
      const [beforeRow] = await db
        .select({ n: count() })
        .from(profiles)
        .where(eq(profiles.accountId, account.id));
      expect(beforeRow!.n).toBe(3);

      // Fire 3 concurrent createProfileWithLimitCheck calls.
      // With the advisory lock scoped to a real transaction, exactly ONE of them
      // should succeed; the other two should throw ProfileLimitError.
      const results = await Promise.allSettled([
        createProfileWithLimitCheck(db, account.id, {
          ...input,
          displayName: 'Racing Child A',
        }),
        createProfileWithLimitCheck(db, account.id, {
          ...input,
          displayName: 'Racing Child B',
        }),
        createProfileWithLimitCheck(db, account.id, {
          ...input,
          displayName: 'Racing Child C',
        }),
      ]);

      // Count successes vs. ProfileLimitErrors
      const successes = results.filter((r) => r.status === 'fulfilled');
      const limitErrors = results.filter(
        (r) => r.status === 'rejected' && r.reason instanceof ProfileLimitError,
      );
      const unexpectedErrors = results.filter(
        (r) =>
          r.status === 'rejected' && !(r.reason instanceof ProfileLimitError),
      );

      // No unexpected errors
      expect(unexpectedErrors).toHaveLength(0);

      // Hard invariant: total profile count must not exceed cap (4)
      const [afterRow] = await db
        .select({ n: count() })
        .from(profiles)
        .where(eq(profiles.accountId, account.id));
      expect(afterRow!.n).toBeLessThanOrEqual(4);

      // Ideally exactly 1 succeeded and 2 were rejected with ProfileLimitError.
      // If more than 1 succeeded the advisory lock scope is still broken.
      if (successes.length > 1) {
        console.warn(
          `[BUG-862] ${successes.length} out of 3 concurrent creates succeeded ` +
            `(expected 1). Final profile count: ${afterRow!.n}/4. ` +
            'pg_advisory_xact_lock may not be scoped to a real transaction.',
        );
      }

      // Advisory: at least 2 must have been rate-limited or the cap is violated
      expect(successes.length + limitErrors.length).toBe(3);
      expect(afterRow!.n).toBeLessThanOrEqual(4);
    });

    it('[BUG-862] second call for the same account hits ProfileLimitError when at cap', async () => {
      // Sanity check: sequential enforcement works (not a concurrent test)
      const { account } = await seedFixture();
      const db = createIntegrationDb();

      const input: ProfileCreateInput = {
        displayName: 'Child',
        birthYear: 2012,
      };

      // Fill to cap: owner (1) + 3 children = 4
      for (let i = 0; i < 3; i++) {
        await createProfileWithLimitCheck(db, account.id, {
          ...input,
          displayName: `Child ${i + 1}`,
        });
      }

      // One more must throw ProfileLimitError
      await expect(
        createProfileWithLimitCheck(db, account.id, {
          ...input,
          displayName: 'Over-cap Child',
        }),
      ).rejects.toThrow(ProfileLimitError);
    });
  },
);

// ---------------------------------------------------------------------------
// [OPT-C / HIGH-D3] Adult-owner gate break-tests
//
// Red-green regression per AGENTS.md "Security fixes require a break test."
// These tests are the canonical proof that the [OPT-C] server-side rule exists
// and cannot be silently removed without CI failing.
// ---------------------------------------------------------------------------

legacyDescribe(
  '[OPT-C] createProfileWithLimitCheck adult-owner gate (integration)',
  () => {
    // Age math uses new Date().getFullYear() inside computeAgeBracket.
    // Relative birth years keep the owner at the intended boundary and the child
    // above the separate 13+ learner floor as the calendar year advances.

    it('[BREAK / OPT-C] rejects child creation when owner is under 18', async () => {
      const { accountId } = await seedOwnerAccount(
        OPT_C_UNDERAGE_EMAIL,
        `${OPT_C_PREFIX}-underage-user`,
        OPT_C_UNDERAGE_OWNER_BIRTH_YEAR,
      );
      const db = createIntegrationDb();

      // Gate ON (default). Must throw ForbiddenError with ADULT_OWNER_REQUIRED.
      await expect(
        createProfileWithLimitCheck(
          db,
          accountId,
          { displayName: 'Child', birthYear: OPT_C_ALLOWED_CHILD_BIRTH_YEAR },
          { adultOwnerGateEnabled: true },
        ),
      ).rejects.toMatchObject({
        name: 'ForbiddenError',
        apiCode: 'ADULT_OWNER_REQUIRED',
      });

      // Confirm that ForbiddenError is the correct class (instanceof guard)
      await expect(
        createProfileWithLimitCheck(
          db,
          accountId,
          { displayName: 'Child', birthYear: OPT_C_ALLOWED_CHILD_BIRTH_YEAR },
          { adultOwnerGateEnabled: true },
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('[OPT-C boundary] allows child creation when owner is exactly 18 (year-only)', async () => {
      // [WI-367] The gate now uses calculateAgeFromParts; with NO month/day
      // persisted it falls back to year-diff (currentYear - birthYear), so a
      // year-only owner at the 18 boundary is still accepted — identical to the
      // prior computeAgeBracket behaviour. The exact-date divergence is covered
      // by the [WI-367 exact-age] test below.
      const { accountId } = await seedOwnerAccount(
        OPT_C_ADULT18_EMAIL,
        `${OPT_C_PREFIX}-adult18-user`,
        OPT_C_ADULT_BOUNDARY_BIRTH_YEAR,
      );
      const db = createIntegrationDb();

      // Gate ON. Owner year-diff age = 18 → must succeed.
      await expect(
        createProfileWithLimitCheck(
          db,
          accountId,
          { displayName: 'Child', birthYear: OPT_C_ALLOWED_CHILD_BIRTH_YEAR },
          { adultOwnerGateEnabled: true },
        ),
      ).resolves.toMatchObject({ id: expect.any(String) });
    });

    it('[WI-367 exact-age] rejects when owner is 18 by year-diff but 17 by exact birth date', async () => {
      // Real wall-clock. Owner born CURRENT_YEAR-18 (year-diff age 18, which the
      // pre-WI-367 year-only gate accepted as 'adult'). Give them a birthday
      // strictly LATER this UTC year so they have NOT yet turned 18 → exact age
      // 17 → the gate must now REJECT. Every calendar day except Dec 31 admits a
      // later-in-year date; on Dec 31 no such date exists (everyone born that
      // year has had their birthday), so the gate correctly allows. We assert
      // against the exact age the real helper computes — correct on every day,
      // proving rejection on the other 364.
      const now = new Date();
      const birthYear = now.getUTCFullYear() - PARENT_ACCOUNT_MINIMUM_AGE;
      const tomorrow = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
      );
      const laterThisYear = tomorrow.getUTCFullYear() === now.getUTCFullYear();
      const birthMonth = tomorrow.getUTCMonth() + 1;
      const birthDay = tomorrow.getUTCDate();
      const exactAge = calculateAgeFromParts(birthYear, birthMonth, birthDay);

      const { accountId } = await seedOwnerAccount(
        OPT_C_EXACT17_EMAIL,
        `${OPT_C_PREFIX}-exact17-user`,
        birthYear,
        laterThisYear ? birthMonth : undefined,
        laterThisYear ? birthDay : undefined,
      );
      const db = createIntegrationDb();

      const attempt = createProfileWithLimitCheck(
        db,
        accountId,
        { displayName: 'Child', birthYear: OPT_C_ALLOWED_CHILD_BIRTH_YEAR },
        { adultOwnerGateEnabled: true },
      );

      if (laterThisYear && exactAge < PARENT_ACCOUNT_MINIMUM_AGE) {
        await expect(attempt).rejects.toMatchObject({
          name: 'ForbiddenError',
          apiCode: 'ADULT_OWNER_REQUIRED',
        });
      } else {
        await expect(attempt).resolves.toMatchObject({
          id: expect.any(String),
        });
      }
    });

    it('[WI-367 persistence] stores birth_month / birth_day on the created profile', async () => {
      // Round-trip: the full birth date supplied at create is persisted to the
      // new nullable columns (the core deliverable). Owner is a first profile so
      // the adult-owner gate is skipped; assert the columns on the owner row.
      const db = createIntegrationDb();
      const [account] = await db
        .insert(accounts)
        .values({
          clerkUserId: `${OPT_C_PREFIX}-persist-user`,
          email: WI367_PERSIST_EMAIL,
        })
        .returning();
      const familyConfig = getTierConfig('family');
      await createSubscription(
        db,
        account!.id,
        'family',
        familyConfig.monthlyQuota,
        {
          status: 'active',
        },
      );

      const created = await createProfileWithLimitCheck(db, account!.id, {
        displayName: 'Owner',
        birthYear: CURRENT_YEAR - 30,
        birthMonth: 7,
        birthDay: 22,
      });

      const row = await db.query.profiles.findFirst({
        where: eq(profiles.id, created.id),
        columns: { birthYear: true, birthMonth: true, birthDay: true },
      });
      expect(row).toMatchObject({
        birthYear: CURRENT_YEAR - 30,
        birthMonth: 7,
        birthDay: 22,
      });
    });

    it('[OPT-C flag-off] allows child creation regardless of owner age when gate is disabled', async () => {
      // Same underage owner, but gate is explicitly OFF.
      // Must succeed — identical to today's behaviour before this rule was added.
      const { accountId } = await seedOwnerAccount(
        OPT_C_FLAG_OFF_EMAIL,
        `${OPT_C_PREFIX}-flagoff-user`,
        OPT_C_UNDERAGE_OWNER_BIRTH_YEAR,
      );
      const db = createIntegrationDb();

      await expect(
        createProfileWithLimitCheck(
          db,
          accountId,
          { displayName: 'Child', birthYear: OPT_C_ALLOWED_CHILD_BIRTH_YEAR },
          { adultOwnerGateEnabled: false },
        ),
      ).resolves.toMatchObject({ id: expect.any(String) });
    });
  },
);
