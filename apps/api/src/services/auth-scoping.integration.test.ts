/**
 * Integration: Profile Data Scoping (STAB-3.3)
 *
 * Verifies that createScopedRepository correctly isolates data by profileId
 * using a real database. No mocks of internal services or database.
 *
 * Also includes a regression test for the vocabulary cross-subject deletion
 * bug fixed in commit a75ef375.
 */

import { and, eq } from 'drizzle-orm';
import {
  subjects,
  learningSessions,
  vocabulary,
  createDatabase,
  generateUUIDv7,
} from '@eduagent/database';
import { createScopedRepository } from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';
import { deleteVocabulary } from './vocabulary';

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

// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded v2 ids for cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedAccountAndProfile(index: number) {
  const db = createIntegrationDb();

  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  // [WI-1128] Key clerkUserId/email off the freshly-generated accountId
  // rather than a fixed per-index string. This function is called
  // repeatedly (once per test, per beforeEach cleanup cycle) with the
  // same `index`; legacy `accounts` has unique clerkUserId/email columns,
  // so a fixed-string collision across calls silently no-ops the legacy
  // insert (onConflictDoNothing), leaving the fresh profiles.account_id
  // FK dangling. Per-call uniqueness avoids the collision.
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    displayName: `Test Profile ${index}`,
    birthYear: 2000,
    clerkUserId: `integration-auth-scope-${accountId}`,
    email: `integration-auth-scope-${accountId}@integration.test`,
    isOwner: true,
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  return {
    account: { id: accountId },
    profile: { id: profileId },
  };
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
  term: string,
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
  await deleteV2IdentitiesForTest(db, {
    accountIds: [...seededAccountIds],
    profileIds: [...seededProfileIds],
  });
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
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
      'bonjour',
    );

    // Delete vocab item from subject X — should NOT affect subject Y's vocab
    const deleted = await deleteVocabulary(
      createIntegrationDb(),
      profileA.id,
      subjectX.id,
      vocabX.id,
    );

    expect(deleted).toBe(true);

    // Subject Y's vocab must still exist
    const db = createIntegrationDb();
    const remaining = await db.query.vocabulary.findFirst({
      where: and(
        eq(vocabulary.id, vocabY.id),
        eq(vocabulary.profileId, profileA.id),
        eq(vocabulary.subjectId, subjectY.id),
      ),
    });

    expect(remaining).not.toBeNull();
    expect(remaining!.id).toBe(vocabY.id);

    // Confirm cross-subject delete is blocked: trying to delete vocabY using subjectX's ID must fail
    const crossDeleteResult = await deleteVocabulary(
      createIntegrationDb(),
      profileA.id,
      subjectX.id,
      vocabY.id,
    );

    expect(crossDeleteResult).toBe(false);
  });
});
