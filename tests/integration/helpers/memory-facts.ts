import { eq } from 'drizzle-orm';
import {
  accounts,
  createDatabase,
  generateUUIDv7,
  learningProfiles,
  memoryFacts,
  profiles,
  type Database,
} from '@eduagent/database';

import { buildBackfillRowsForProfile } from '../../../apps/api/src/services/memory/backfill-mapping';

const seededAccountIds = new Set<string>();

export async function setupTestDb(): Promise<{
  db: Database;
  cleanup: () => Promise<void>;
}> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL must be set for integration tests');
  const db = createDatabase(url);

  return {
    db,
    cleanup: async () => {
      for (const accountId of seededAccountIds) {
        await db.delete(accounts).where(eq(accounts.id, accountId));
        seededAccountIds.delete(accountId);
      }
    },
  };
}

export type LearningProfileFixture = {
  strengths?: unknown[];
  struggles?: unknown[];
  interests?: unknown[];
  communicationNotes?: unknown[];
  suppressedInferences?: unknown[];
  interestTimestamps?: Record<string, string>;
  memoryConsentStatus?: 'pending' | 'granted' | 'declined';
  memoryCollectionEnabled?: boolean;
};

export async function seedLearningProfile(
  db: Database,
  fixture: LearningProfileFixture = {}
): Promise<{ profileId: string; accountId: string }> {
  const profileId = generateUUIDv7();
  const accountId = generateUUIDv7();
  await db.insert(accounts).values({
    id: accountId,
    clerkUserId: `integration-memory-${accountId}`,
    email: `memory-${accountId}@integration.test`,
  });
  seededAccountIds.add(accountId);
  await db.insert(profiles).values({
    id: profileId,
    accountId,
    displayName: 'Memory Fixture',
    birthYear: 2012,
    isOwner: false,
  });
  await db.insert(learningProfiles).values({
    profileId,
    interests: fixture.interests ?? [],
    strengths: fixture.strengths ?? [],
    struggles: fixture.struggles ?? [],
    communicationNotes: fixture.communicationNotes ?? [],
    suppressedInferences: fixture.suppressedInferences ?? [],
    interestTimestamps: fixture.interestTimestamps ?? {},
    memoryConsentStatus: fixture.memoryConsentStatus ?? 'granted',
    memoryCollectionEnabled: fixture.memoryCollectionEnabled ?? true,
  });
  return { profileId, accountId };
}

export async function runBackfillForOneProfile(
  db: Database,
  profileId: string
): Promise<void> {
  const profile = await db.query.learningProfiles.findFirst({
    where: eq(learningProfiles.profileId, profileId),
  });
  if (!profile) throw new Error(`Missing learning profile ${profileId}`);
  const built = buildBackfillRowsForProfile(profile);
  if (built.malformed.length > 0) {
    throw new Error(
      `Malformed memory-facts backfill for ${profileId}: ${JSON.stringify(
        built.malformed
      )}`
    );
  }
  await db.transaction(async (tx) => {
    await tx.delete(memoryFacts).where(eq(memoryFacts.profileId, profileId));
    if (built.rows.length > 0) {
      await tx.insert(memoryFacts).values(built.rows);
    }
    await tx
      .update(learningProfiles)
      .set({ memoryFactsBackfilledAt: new Date(), updatedAt: new Date() })
      .where(eq(learningProfiles.profileId, profileId));
  });
}

export async function runInngestFunction<T>(
  fn: T,
  event: { name: string; data: unknown }
): Promise<unknown> {
  const step = {
    run: async (_name: string, callback: () => Promise<unknown>) => callback(),
  };
  return (fn as { fn: (input: unknown) => Promise<unknown> }).fn({
    event,
    step,
  });
}
