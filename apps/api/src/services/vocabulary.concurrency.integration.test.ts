/**
 * Integration: reviewVocabulary SM-2 lost-update guard (F-169)
 *
 * reviewVocabulary wraps its read-compute-write in db.transaction(), but the
 * retention-card read (ensureVocabularyRetentionCard -> findFirst) takes NO row
 * lock. Under Postgres READ COMMITTED a transaction gives atomicity but not
 * serialization, so two concurrent reviews of the same vocabulary item both read
 * the same consecutiveSuccesses / repetitions and the later commit silently
 * overwrites the earlier — the SM-2 progression of one review is lost (corrupted
 * ease/interval/due scheduling).
 *
 * The fix acquires a SELECT ... FOR UPDATE row lock on the retention card inside
 * the existing transaction and computes from the locked row, serialising
 * concurrent reviews. After N concurrent successful (quality:5) reviews the
 * persisted card must reflect all N increments.
 *
 * No mocks of internal services or database — real Neon connection.
 */

import { resolve } from 'path';
import { and, eq } from 'drizzle-orm';
import {
  createDatabase,
  generateUUIDv7,
  subjects,
  vocabulary,
  vocabularyRetentionCards,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';
import { reviewVocabulary } from './vocabulary';

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

// Per-run unique suffix so concurrent runs on a shared DB cannot delete each
// other's fixtures during cleanup().
const PREFIX = 'integration-vocab-race-f169';
const RUN_SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ACCOUNT = {
  clerkUserId: `${PREFIX}-${RUN_SUFFIX}-user`,
  email: `${PREFIX}-${RUN_SUFFIX}@integration.test`,
};

// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded v2 ids for cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function seedVocabulary() {
  const db = createIntegrationDb();
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    displayName: 'Vocab Race Test User',
    birthYear: 2000,
    clerkUserId: ACCOUNT.clerkUserId,
    email: ACCOUNT.email,
    isOwner: true,
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: 'Spanish',
      pedagogyMode: 'four_strands',
    })
    .returning();
  const [vocab] = await db
    .insert(vocabulary)
    .values({
      profileId,
      subjectId: subject!.id,
      term: 'hola',
      termNormalized: 'hola',
      translation: 'hello',
      type: 'word',
    })
    .returning();
  return { profile: { id: profileId }, subject: subject!, vocab: vocab! };
}

async function cleanup() {
  const db = createIntegrationDb();
  await deleteV2IdentitiesForTest(db, {
    accountIds: [...seededAccountIds],
    profileIds: [...seededProfileIds],
  });
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
}

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe('[F-169] reviewVocabulary SM-2 concurrent lost-update guard (integration)', () => {
  it('[F-169] N concurrent successful reviews of the same card persist all increments', async () => {
    const { profile, vocab } = await seedVocabulary();
    const db = createIntegrationDb();

    // N concurrent reviews. Empirically the pre-fix lost-update reproduces
    // deterministically at N=5 on neon-serverless (final count landed at 2);
    // N=8 hardens the guard against network-pipelining flakiness. The post-fix
    // GREEN is deterministic regardless (the FOR UPDATE lock serialises).
    const N = 8;
    const results = await Promise.allSettled(
      Array.from({ length: N }, () =>
        reviewVocabulary(db, profile.id, vocab.id, { quality: 5 }),
      ),
    );

    // No deadlock / no error.
    const failures = results.filter((r) => r.status === 'rejected');
    expect(failures).toHaveLength(0);

    const card = await db.query.vocabularyRetentionCards.findFirst({
      where: and(
        eq(vocabularyRetentionCards.vocabularyId, vocab.id),
        eq(vocabularyRetentionCards.profileId, profile.id),
      ),
    });

    // Every successful review must have been counted. With the unlocked read,
    // interleaved reviews read the same stale value and the final count is < N.
    // With the FOR UPDATE row lock the reviews serialise -> exactly N.
    // consecutiveSuccesses increments by 1 per quality>=3 review unconditionally;
    // repetitions follows SM-2's prevReps+1 progression for quality>=3, so both
    // land at exactly N after N serialised quality:5 reviews from a fresh card.
    expect(card?.consecutiveSuccesses).toBe(N);
    expect(card?.repetitions).toBe(N);
  });
});
