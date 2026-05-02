/**
 * Integration: Snapshot Aggregation — stale-snapshot subject divergence (BUG-872)
 *
 * Repro before fix:
 *   `buildKnowledgeInventory` reads `metrics.subjects` from the latest cached
 *   snapshot when one exists, but loads `state.subjects` live. If a user adds
 *   a new subject AFTER the snapshot was persisted, that subject never appears
 *   on the Progress tab until the next snapshot refresh fires from the
 *   session-completed Inngest pipeline. Library shows the live subjects table
 *   directly, so the new subject is visible in Library but missing from
 *   Progress — hence "Biology missing from Progress tab" in BUG-872.
 *
 * Break test: seed a profile with two subjects (Math + Biology) and a
 * progress_snapshots row whose `metrics.subjects` only contains Math. Calling
 * buildKnowledgeInventory must include BOTH subjects in the returned
 * inventory — divergence detection should force a live recompute.
 */
import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  createDatabase,
  generateUUIDv7,
  progressSnapshots,
  profiles,
  subjects,
  type Database,
} from '@eduagent/database';
import { like } from 'drizzle-orm';
import { buildKnowledgeInventory } from './snapshot-aggregation';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

const RUN_ID = generateUUIDv7();
let seedCounter = 0;

async function seedProfile(): Promise<string> {
  const idx = ++seedCounter;
  const clerkUserId = `clerk_snapshot_${RUN_ID}_${idx}`;
  const email = `snapshot-${RUN_ID}-${idx}@test.invalid`;

  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning({ id: accounts.id });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `Test ${idx}`,
      birthYear: 2010,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  return profile!.id;
}

async function seedSubject(profileId: string, name: string): Promise<string> {
  const [row] = await db
    .insert(subjects)
    .values({
      profileId,
      name,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });
  return row!.id;
}

async function seedStaleSnapshot(
  profileId: string,
  staleSubjectId: string,
  staleSubjectName: string
): Promise<void> {
  // Snapshot persisted BEFORE the second subject was added. metrics.subjects
  // therefore only mentions the original subject — exactly the state
  // BUG-872 describes ("Library shows Biology, Progress doesn't").
  await db.insert(progressSnapshots).values({
    profileId,
    snapshotDate: new Date().toISOString().slice(0, 10),
    metrics: {
      totalSessions: 0,
      totalActiveMinutes: 0,
      totalWallClockMinutes: 0,
      totalExchanges: 0,
      topicsAttempted: 0,
      topicsMastered: 0,
      topicsInProgress: 0,
      vocabularyTotal: 0,
      vocabularyMastered: 0,
      vocabularyLearning: 0,
      vocabularyNew: 0,
      retentionCardsDue: 0,
      retentionCardsStrong: 0,
      retentionCardsFading: 0,
      currentStreak: 0,
      longestStreak: 0,
      subjects: [
        {
          subjectId: staleSubjectId,
          subjectName: staleSubjectName,
          pedagogyMode: 'socratic',
          topicsAttempted: 0,
          topicsMastered: 0,
          topicsTotal: 0,
          topicsExplored: 0,
          vocabularyTotal: 0,
          vocabularyMastered: 0,
          sessionsCount: 0,
          activeMinutes: 0,
          wallClockMinutes: 0,
          lastSessionAt: null,
        },
      ],
    },
  });
}

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set for snapshot integration tests');
  }
  db = createDatabase(databaseUrl);
});

afterAll(async () => {
  await db
    .delete(accounts)
    .where(like(accounts.clerkUserId, `clerk_snapshot_${RUN_ID}%`));
});

describe('[BUG-872] buildKnowledgeInventory includes subjects added after the cached snapshot', () => {
  it('returns BOTH live subjects even when the cached snapshot only mentions one', async () => {
    const profileId = await seedProfile();

    // Original subject — was present when the snapshot was taken.
    const mathId = await seedSubject(profileId, 'Mathematics');
    // Stale snapshot mentions only Math.
    await seedStaleSnapshot(profileId, mathId, 'Mathematics');

    // A second subject is added AFTER the snapshot — exactly the BUG-872 scenario.
    const biologyId = await seedSubject(profileId, 'Biology');

    const inventory = await buildKnowledgeInventory(db, profileId);

    const returnedIds = inventory.subjects.map((s) => s.subjectId).sort();
    const expectedIds = [mathId, biologyId].sort();

    // Both must be present. Before the fix, only Math appears — Biology is
    // silently dropped because metrics.subjects (cached) didn't include it.
    expect(returnedIds).toEqual(expectedIds);
    expect(inventory.subjects.length).toBe(2);

    const biology = inventory.subjects.find((s) => s.subjectId === biologyId);
    expect(biology).toEqual(expect.objectContaining({}));
    expect(biology?.subjectName).toBe('Biology');
  });

  it('still uses the cached snapshot when no divergence exists', async () => {
    const profileId = await seedProfile();
    const mathId = await seedSubject(profileId, 'Mathematics');
    await seedStaleSnapshot(profileId, mathId, 'Mathematics');
    // No new subjects — cache is current.

    const inventory = await buildKnowledgeInventory(db, profileId);
    expect(inventory.subjects.map((s) => s.subjectId)).toEqual([mathId]);
  });
});
