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
  accounts,
  profiles,
  learningProfiles,
  createDatabase,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';
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
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.'
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

const ALL_EMAILS = ACCOUNTS.map((a) => a.email);
const ALL_CLERK_IDS = ACCOUNTS.map((a) => a.clerkUserId);

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedAccountAndProfile(index: number) {
  const db = createIntegrationDb();
  const acc = ACCOUNTS[index]!;

  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId: acc.clerkUserId, email: acc.email })
    .returning();

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `Onboarding Test ${index}`,
      birthYear: 2012,
      isOwner: true,
    })
    .returning();

  return { account: account!, profile: profile! };
}

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  const byEmail = await db.query.accounts.findMany({
    where: inArray(accounts.email, ALL_EMAILS),
  });
  const byClerk = await db.query.accounts.findMany({
    where: inArray(accounts.clerkUserId, ALL_CLERK_IDS),
  });
  const ids = [...new Set([...byEmail, ...byClerk].map((r) => r.id))];

  if (ids.length > 0) {
    await db.delete(accounts).where(inArray(accounts.id, ids));
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
// ---------------------------------------------------------------------------

describe('updateConversationLanguage (integration)', () => {
  it('updates language when profileId + accountId match', async () => {
    const { account, profile } = await seedAccountAndProfile(0);
    const db = createIntegrationDb();

    await updateConversationLanguage(db, profile.id, account.id, 'cs');

    const updated = await db.query.profiles.findFirst({
      where: eq(profiles.id, profile.id),
    });
    expect(updated?.conversationLanguage).toBe('cs');
  });

  it('throws OnboardingNotFoundError when accountId does not match', async () => {
    const { profile: profileA } = await seedAccountAndProfile(0);
    const { account: accountB } = await seedAccountAndProfile(1);
    const db = createIntegrationDb();

    await expect(
      updateConversationLanguage(db, profileA.id, accountB.id, 'es')
    ).rejects.toThrow(OnboardingNotFoundError);

    // Verify the value was NOT changed
    const unchanged = await db.query.profiles.findFirst({
      where: eq(profiles.id, profileA.id),
    });
    expect(unchanged?.conversationLanguage).toBe('en');
  });
});

// ---------------------------------------------------------------------------
// Tests — updatePronouns
// ---------------------------------------------------------------------------

describe('updatePronouns (integration)', () => {
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
      updatePronouns(db, profileA.id, accountB.id, 'he/him')
    ).rejects.toThrow(OnboardingNotFoundError);
  });
});

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
      ])
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
    const fakeProfileId = '00000000-0000-4000-8000-000000000099';

    await expect(
      updateInterestsContext(db, fakeProfileId, account.id, [
        { label: 'Music', context: 'both' as const },
      ])
    ).rejects.toThrow(OnboardingNotFoundError);
  });
});
