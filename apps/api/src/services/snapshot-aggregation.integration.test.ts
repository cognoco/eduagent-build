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
  createDatabase,
  generateUUIDv7,
  milestones,
  progressSnapshots,
  subjects,
  type Database,
} from '@eduagent/database';
import { and, eq } from 'drizzle-orm';
import type { SubjectInventory } from '@eduagent/schemas';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';
import {
  buildKnowledgeInventory,
  listRecentMilestones,
} from './snapshot-aggregation';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

const RUN_ID = generateUUIDv7();
let seedCounter = 0;
// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded v2 ids for cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function seedProfile(): Promise<string> {
  const idx = ++seedCounter;
  const clerkUserId = `clerk_snapshot_${RUN_ID}_${idx}`;
  const email = `snapshot-${RUN_ID}-${idx}@test.invalid`;

  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    displayName: `Test ${idx}`,
    birthYear: 2010,
    clerkUserId,
    email,
    isOwner: true,
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  return profileId;
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
  staleSubjectName: string,
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
  await deleteV2IdentitiesForTest(db, {
    accountIds: [...seededAccountIds],
    profileIds: [...seededProfileIds],
  });
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
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

    const returnedIds = inventory.subjects
      .map((s: SubjectInventory) => s.subjectId)
      .sort();
    const expectedIds = [mathId, biologyId].sort();

    // Both must be present. Before the fix, only Math appears — Biology is
    // silently dropped because metrics.subjects (cached) didn't include it.
    expect(returnedIds).toEqual(expectedIds);
    expect(inventory.subjects.length).toBe(2);

    const biology = inventory.subjects.find(
      (s: SubjectInventory) => s.subjectId === biologyId,
    );
    expect(biology).toEqual(expect.objectContaining({}));
    expect(biology?.subjectName).toBe('Biology');
  });

  it('still uses the cached snapshot when no divergence exists', async () => {
    const profileId = await seedProfile();
    const mathId = await seedSubject(profileId, 'Mathematics');
    await seedStaleSnapshot(profileId, mathId, 'Mathematics');
    // No new subjects — cache is current.

    const inventory = await buildKnowledgeInventory(db, profileId);
    expect(
      inventory.subjects.map((s: SubjectInventory) => s.subjectId),
    ).toEqual([mathId]);
  });
});

// ---------------------------------------------------------------------------
// [F-144] listRecentMilestones performs a write-on-read: it backfills missed
// session_count milestones. A parent proxy session (acting on a child via
// X-Profile-Id) reaching GET /progress/milestones would otherwise MUTATE the
// child's milestone rows. The route passes allowBackfill=false in proxy mode;
// this verifies the suppression actually prevents the write while the read
// still returns existing rows.
// ---------------------------------------------------------------------------

async function seedSnapshotWithSessions(
  profileId: string,
  totalSessions: number,
): Promise<void> {
  await db.insert(progressSnapshots).values({
    profileId,
    snapshotDate: new Date().toISOString().slice(0, 10),
    metrics: {
      totalSessions,
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
      subjects: [],
    },
  });
}

async function countSessionMilestones(profileId: string): Promise<number> {
  const rows = await db.query.milestones.findMany({
    where: and(
      eq(milestones.profileId, profileId),
      eq(milestones.milestoneType, 'session_count'),
    ),
    columns: { id: true },
  });
  return rows.length;
}

describe('[F-144] listRecentMilestones backfill suppression in proxy mode', () => {
  it('does NOT backfill milestones when allowBackfill=false (proxy read)', async () => {
    const profileId = await seedProfile();
    // 5 sessions → thresholds 1, 3, 5 missed; zero milestone rows exist.
    await seedSnapshotWithSessions(profileId, 5);
    expect(await countSessionMilestones(profileId)).toBe(0);

    const result = await listRecentMilestones(db, profileId, 5, false);

    // No write happened — the child's milestone state is untouched.
    expect(await countSessionMilestones(profileId)).toBe(0);
    expect(result).toEqual([]);
  });

  it('DOES backfill when allowBackfill=true (self read) — suppression is proxy-scoped, not a blanket disable', async () => {
    const profileId = await seedProfile();
    await seedSnapshotWithSessions(profileId, 5);
    expect(await countSessionMilestones(profileId)).toBe(0);

    const result = await listRecentMilestones(db, profileId, 5, true);

    // Backfill wrote the missed thresholds (1, 3, 5).
    expect(await countSessionMilestones(profileId)).toBe(3);
    expect(result.length).toBe(3);
  });
});
