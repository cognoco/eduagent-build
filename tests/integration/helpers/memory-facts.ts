import { eq } from 'drizzle-orm';
import {
  createDatabase,
  generateUUIDv7,
  learningProfiles,
  login,
  membership,
  memoryFacts,
  organization,
  person,
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
        // [WI-867] v2 path is unconditional: resolve org's persons via membership,
        // delete them (cascades login/membership/learning_profiles), then drop org.
        const memberRows = await db.query.membership.findMany({
          where: eq(membership.organizationId, accountId),
          columns: { personId: true },
        });
        for (const row of memberRows) {
          await db.delete(person).where(eq(person.id, row.personId));
        }
        await db.delete(organization).where(eq(organization.id, accountId));
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
  fixture: LearningProfileFixture = {},
): Promise<{ profileId: string; accountId: string }> {
  const profileId = generateUUIDv7();
  const accountId = generateUUIDv7();

  // [WI-867] v2 identity graph is unconditional. Also insert legacy rows because
  // learning_profiles.profile_id still FKs to profiles.id (M-REPOINT not yet committed).
  await db.insert(organization).values({
    id: accountId,
    name: `Memory org ${accountId.slice(0, 8)}`,
  });
  await db.insert(person).values({
    id: profileId,
    displayName: 'Memory Fixture',
    birthDate: '2012-01-01',
    residenceJurisdiction: 'US',
  });
  await db.insert(login).values({
    personId: profileId,
    clerkUserId: `integration-memory-${accountId}`,
    email: `memory-${accountId}@integration.test`,
  });
  await db.insert(membership).values({
    personId: profileId,
    organizationId: accountId,
    roles: ['learner'],
  });
  seededAccountIds.add(accountId);

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

/**
 * [WI-586] Flag-aware teardown of a single seeded account by its id.
 * Flag-ON (organization.id == accountId) deletes the org's persons (cascading
 * login/membership/learning_profiles) then the org; flag-OFF deletes the legacy
 * accounts row. Use this instead of an inline `db.delete(accounts)` so the
 * memory-facts suites tear down cleanly against the committed-migration DB.
 */
export async function cleanupSeededAccount(
  db: Database,
  accountId: string,
): Promise<void> {
  // [WI-867] v2 path is unconditional.
  const memberRows = await db.query.membership.findMany({
    where: eq(membership.organizationId, accountId),
    columns: { personId: true },
  });
  for (const row of memberRows) {
    await db.delete(person).where(eq(person.id, row.personId));
  }
  await db.delete(organization).where(eq(organization.id, accountId));
}

export async function runBackfillForOneProfile(
  db: Database,
  profileId: string,
): Promise<void> {
  const profile = await db.query.learningProfiles.findFirst({
    where: eq(learningProfiles.profileId, profileId),
  });
  if (!profile) throw new Error(`Missing learning profile ${profileId}`);
  const built = buildBackfillRowsForProfile(profile);
  if (built.malformed.length > 0) {
    throw new Error(
      `Malformed memory-facts backfill for ${profileId}: ${JSON.stringify(
        built.malformed,
      )}`,
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
  event: { name: string; data: unknown },
): Promise<unknown> {
  const step = {
    run: async (_name: string, callback: () => Promise<unknown>) => callback(),
  };
  return (fn as { fn: (input: unknown) => Promise<unknown> }).fn({
    event,
    step,
  });
}
