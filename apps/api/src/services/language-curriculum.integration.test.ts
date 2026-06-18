/**
 * Integration: regenerateLanguageCurriculum atomicity (F-167)
 *
 * The regenerate sequence (ownership-check → delete-all → insert curriculum →
 * insert topics) must run inside a transaction. Without it, two concurrent
 * same-user regenerations can interleave into duplicate `curricula` rows (or a
 * unique-violation mid-swap that leaves the learner with a deleted-but-
 * unreplaced curriculum). This test drives the real DB with two concurrent
 * calls and asserts exactly one complete curriculum survives.
 *
 * No internal mocks — real DB connections only.
 */

import { eq } from 'drizzle-orm';
import {
  createDatabase,
  curricula,
  curriculumTopics,
  generateUUIDv7,
  subjects,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';
import {
  generateLanguageCurriculum,
  regenerateLanguageCurriculum,
} from './language-curriculum';
import {
  deleteLegacyAccountsForTest,
  deleteV2IdentitiesForTest,
  ensureLegacyProfileAnchorForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';

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

const RUN_ID = generateUUIDv7();
const PREFIX = `integration-language-curriculum-${RUN_ID}`;
const ACCOUNT = {
  clerkUserId: `${PREFIX}-01`,
  email: `${PREFIX}-user1@integration.test`,
};

let accountId = '';
let profileId = '';

async function cleanupTestAccounts() {
  if (!accountId && !profileId) return;
  const db = createIntegrationDb();
  await deleteV2IdentitiesForTest(db, {
    accountIds: accountId ? [accountId] : [],
    profileIds: profileId ? [profileId] : [],
  });
  await deleteLegacyAccountsForTest(db, accountId ? [accountId] : []);
  accountId = '';
  profileId = '';
}

let subjectId: string;
let subjectCounter = 0;

beforeAll(async () => {
  await cleanupTestAccounts();
  const db = createIntegrationDb();
  accountId = generateUUIDv7();
  profileId = generateUUIDv7();

  await ensureLegacyProfileAnchorForTest(db, {
    accountId,
    profileId,
    clerkUserId: ACCOUNT.clerkUserId,
    email: ACCOUNT.email,
    displayName: 'Language Learner',
    birthYear: 2010,
    isOwner: true,
  });
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    clerkUserId: ACCOUNT.clerkUserId,
    email: ACCOUNT.email,
    displayName: 'Language Learner',
    birthYear: 2010,
    isOwner: true,
  });
});

beforeEach(async () => {
  // Fresh subject per test so curriculum state does not leak between cases.
  const db = createIntegrationDb();
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: `Spanish ${++subjectCounter}`,
      pedagogyMode: 'four_strands',
      languageCode: 'es',
    })
    .returning();
  subjectId = subject!.id;
});

afterAll(async () => {
  await cleanupTestAccounts();
});

describe('regenerateLanguageCurriculum atomicity (integration)', () => {
  it('[F-167] concurrent regenerations leave exactly one complete curriculum', async () => {
    const expectedTopicCount = generateLanguageCurriculum('es', 'A1').length;

    // Two genuinely-concurrent regenerations on separate connections. The
    // transaction wraps ownership-check → delete → insert curriculum → insert
    // topics, so the swaps serialize: the result is one complete curriculum
    // whose topics belong to the surviving curriculum row, never a half-applied
    // swap (deleted-but-unreplaced) or topics orphaned to a curriculum the other
    // writer's delete removed.
    //
    // Scope note: the curricula_subject_version_idx unique index independently
    // blocks two version-1 rows, so this test alone does not isolate the
    // transaction from that index. The transaction's distinct guarantee is
    // rollback-on-mid-sequence-failure (delete committed but topics insert
    // throws → old curriculum preserved); proving that deterministically would
    // require mid-transaction fault injection, which here would mean mocking the
    // DB internals (GC1/GC6 ban). The serialization + completeness assertions
    // below are the real-DB proof; the rollback property follows from mirroring
    // the transactional sibling in curriculum.ts.
    const dbA = createIntegrationDb();
    const dbB = createIntegrationDb();

    const results = await Promise.allSettled([
      regenerateLanguageCurriculum(dbA, profileId, subjectId, 'es', 'A1'),
      regenerateLanguageCurriculum(dbB, profileId, subjectId, 'es', 'A1'),
    ]);

    // At least one must succeed; a loser that hit the serialized unique
    // contention may reject, but it must not have left partial state behind —
    // the surviving curriculum (below) proves atomicity regardless.
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);

    const db = createIntegrationDb();
    const rows = await db
      .select({ id: curricula.id })
      .from(curricula)
      .where(eq(curricula.subjectId, subjectId));

    // Exactly one curriculum row — no duplicate from interleaved inserts.
    expect(rows).toHaveLength(1);

    // The surviving curriculum has its complete topic set — never a
    // deleted-but-unreplaced or half-inserted state.
    const topics = await db
      .select({ id: curriculumTopics.id })
      .from(curriculumTopics)
      .where(eq(curriculumTopics.curriculumId, rows[0]!.id));
    expect(topics.length).toBe(expectedTopicCount);
  });

  it('[F-167] a successful regeneration is fully present (no partial swap)', async () => {
    const expectedTopicCount = generateLanguageCurriculum('es', 'A1').length;
    const db = createIntegrationDb();

    await regenerateLanguageCurriculum(db, profileId, subjectId, 'es', 'A1');

    const [curriculum] = await db
      .select({ id: curricula.id })
      .from(curricula)
      .where(eq(curricula.subjectId, subjectId));
    expect(curriculum).toBeDefined();

    const topics = await db
      .select({ id: curriculumTopics.id })
      .from(curriculumTopics)
      .where(eq(curriculumTopics.curriculumId, curriculum!.id));
    expect(topics.length).toBe(expectedTopicCount);
  });

  it('[BUG-655] ownership check inside the transaction blocks cross-profile delete', async () => {
    const db = createIntegrationDb();
    // Seed a real curriculum for the owner.
    await regenerateLanguageCurriculum(db, profileId, subjectId, 'es', 'A1');

    // An attacker profile passing the owner's subjectId must be rejected and
    // must NOT delete the owner's curriculum.
    await expect(
      regenerateLanguageCurriculum(
        db,
        '00000000-0000-4000-8000-000000000000',
        subjectId,
        'es',
        'A1',
      ),
    ).rejects.toThrow(/does not belong to profile/);

    const rows = await db
      .select({ id: curricula.id })
      .from(curricula)
      .where(eq(curricula.subjectId, subjectId));
    expect(rows).toHaveLength(1);
  });
});
