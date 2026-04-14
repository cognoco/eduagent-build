/**
 * Integration: Profile Data Scoping (STAB-3.3)
 *
 * Verifies that createScopedRepository correctly isolates data by profileId
 * using a real database. No mocks of internal services or database.
 *
 * Also includes a regression test for the vocabulary cross-subject deletion
 * bug fixed in commit a75ef375.
 */

import { and, eq, inArray } from 'drizzle-orm';
import {
  accounts,
  profiles,
  subjects,
  learningSessions,
  vocabulary,
  createDatabase,
} from '@eduagent/database';
import { createScopedRepository } from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import { deleteVocabulary } from './vocabulary';

// ---------------------------------------------------------------------------
// DB setup — real connection
// ---------------------------------------------------------------------------

loadDatabaseEnv(resolve(__dirname, '../../../..'));

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
// Test account identifiers — unique prefix prevents collisions
// ---------------------------------------------------------------------------

const PREFIX = 'integration-auth-scope';
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
      displayName: `Test Profile ${index}`,
      birthYear: 2000,
      isOwner: true,
    })
    .returning();

  return { account: account!, profile: profile! };
}

async function seedSubject(profileId: string, name: string) {
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
  return subject!;
}

async function seedSession(profileId: string, subjectId: string) {
  const db = createIntegrationDb();
  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      sessionType: 'learning',
      inputMode: 'text',
      status: 'active',
      escalationRung: 1,
      exchangeCount: 0,
    })
    .returning();
  return session!;
}

async function seedVocabularyItem(
  profileId: string,
  subjectId: string,
  term: string
) {
  const db = createIntegrationDb();
  const [item] = await db
    .insert(vocabulary)
    .values({
      profileId,
      subjectId,
      term,
      termNormalized: term.toLowerCase(),
      translation: `${term} translation`,
      type: 'word',
    })
    .returning();
  return item!;
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
// Tests
// ---------------------------------------------------------------------------

describe('Profile data scoping (integration)', () => {
  it('profile A cannot read profile B sessions', async () => {
    const { profile: profileA } = await seedAccountAndProfile(0);
    const { profile: profileB } = await seedAccountAndProfile(1);

    // Seed a subject for B (needed as FK for session)
    const subjectB = await seedSubject(profileB.id, 'Science');
    // Seed a session owned by profile B
    await seedSession(profileB.id, subjectB.id);

    // Try to read B's session using a repository scoped to profile A
    const repoA = createScopedRepository(createIntegrationDb(), profileA.id);
    const sessionsViaA = await repoA.sessions.findMany();

    // Profile A has no sessions — B's session must not appear
    expect(sessionsViaA).toHaveLength(0);
  });

  it('profile A cannot read profile B subjects', async () => {
    const { profile: profileA } = await seedAccountAndProfile(0);
    const { profile: profileB } = await seedAccountAndProfile(1);

    // Seed a subject owned by profile B
    await seedSubject(profileB.id, 'History');

    // Try to read B's subject using a repository scoped to profile A
    const repoA = createScopedRepository(createIntegrationDb(), profileA.id);
    const subjectsViaA = await repoA.subjects.findMany();

    // Profile A has no subjects — B's subject must not appear
    expect(subjectsViaA).toHaveLength(0);
  });

  it('scoped repository enforces profileId on all reads', async () => {
    const { profile: profileA } = await seedAccountAndProfile(0);
    const { profile: profileB } = await seedAccountAndProfile(1);

    // Create subjects for both profiles
    const subjectA = await seedSubject(profileA.id, 'Mathematics');
    await seedSubject(profileB.id, 'Physics');

    // Repo scoped to A must return only A's subject
    const repoA = createScopedRepository(createIntegrationDb(), profileA.id);
    const subjectsViaA = await repoA.subjects.findMany();

    expect(subjectsViaA).toHaveLength(1);
    expect(subjectsViaA[0]!.id).toBe(subjectA.id);
    expect(subjectsViaA[0]!.profileId).toBe(profileA.id);

    // Repo scoped to B must return only B's subject
    const repoB = createScopedRepository(createIntegrationDb(), profileB.id);
    const subjectsViaB = await repoB.subjects.findMany();

    expect(subjectsViaB).toHaveLength(1);
    expect(subjectsViaB[0]!.profileId).toBe(profileB.id);
  });

  it('delete subject scoped to subjectId prevents cross-subject deletion', async () => {
    // Regression test for fix in commit a75ef375
    // Profile A has subject X and Y → delete vocab for X → verify Y vocab untouched

    const { profile: profileA } = await seedAccountAndProfile(0);

    const subjectX = await seedSubject(profileA.id, 'Spanish');
    const subjectY = await seedSubject(profileA.id, 'French');

    const vocabX = await seedVocabularyItem(profileA.id, subjectX.id, 'hola');
    const vocabY = await seedVocabularyItem(
      profileA.id,
      subjectY.id,
      'bonjour'
    );

    // Delete vocab item from subject X — should NOT affect subject Y's vocab
    const deleted = await deleteVocabulary(
      createIntegrationDb(),
      profileA.id,
      subjectX.id,
      vocabX.id
    );

    expect(deleted).toBe(true);

    // Subject Y's vocab must still exist
    const db = createIntegrationDb();
    const remaining = await db.query.vocabulary.findFirst({
      where: and(
        eq(vocabulary.id, vocabY.id),
        eq(vocabulary.profileId, profileA.id),
        eq(vocabulary.subjectId, subjectY.id)
      ),
    });

    expect(remaining).not.toBeNull();
    expect(remaining!.id).toBe(vocabY.id);

    // Confirm cross-subject delete is blocked: trying to delete vocabY using subjectX's ID must fail
    const crossDeleteResult = await deleteVocabulary(
      createIntegrationDb(),
      profileA.id,
      subjectX.id,
      vocabY.id
    );

    expect(crossDeleteResult).toBe(false);
  });
});
