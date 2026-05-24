import { eq, like } from 'drizzle-orm';
import { resolve } from 'path';
import {
  accounts,
  curriculumBooks,
  createDatabase,
  generateUUIDv7,
  profiles,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { releaseBookGenerationClaimIfEmpty } from './curriculum';

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

function createIntegrationDb(): Database {
  return createDatabase(requireDatabaseUrl());
}

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `integration-curriculum-release-${RUN_ID}`;

async function cleanupByPrefix(database: Database): Promise<void> {
  await database
    .delete(accounts)
    .where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
}

async function seedProfiles(database: Database) {
  const [ownerAccount] = await database
    .insert(accounts)
    .values({
      clerkUserId: `${CLERK_PREFIX}-owner`,
      email: `${CLERK_PREFIX}-owner@test.invalid`,
    })
    .returning({ id: accounts.id });
  const [attackerAccount] = await database
    .insert(accounts)
    .values({
      clerkUserId: `${CLERK_PREFIX}-attacker`,
      email: `${CLERK_PREFIX}-attacker@test.invalid`,
    })
    .returning({ id: accounts.id });

  const [ownerProfile] = await database
    .insert(profiles)
    .values({
      accountId: ownerAccount!.id,
      displayName: 'Claim Owner',
      birthYear: 2011,
      isOwner: true,
    })
    .returning({ id: profiles.id });
  const [attackerProfile] = await database
    .insert(profiles)
    .values({
      accountId: attackerAccount!.id,
      displayName: 'Claim Attacker',
      birthYear: 2011,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  return {
    ownerProfileId: ownerProfile!.id,
    attackerProfileId: attackerProfile!.id,
  };
}

async function seedClaimedEmptyBook(database: Database, profileId: string) {
  const [subject] = await database
    .insert(subjects)
    .values({
      profileId,
      name: `Release Guard ${RUN_ID}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  const [book] = await database
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: 'Guarded Book',
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });

  return { subjectId: subject!.id, bookId: book!.id };
}

let db: Database;

beforeAll(async () => {
  db = createIntegrationDb();
  await cleanupByPrefix(db);
});

afterAll(async () => {
  await cleanupByPrefix(db);
});

describe('releaseBookGenerationClaimIfEmpty (integration)', () => {
  it('[WI-78 review] does not clear another profile generation claim', async () => {
    const { ownerProfileId, attackerProfileId } = await seedProfiles(db);
    const { subjectId, bookId } = await seedClaimedEmptyBook(
      db,
      ownerProfileId,
    );

    await releaseBookGenerationClaimIfEmpty(
      db,
      subjectId,
      bookId,
      attackerProfileId,
    );

    const row = await db.query.curriculumBooks.findFirst({
      where: eq(curriculumBooks.id, bookId),
    });
    expect(row!.topicsGenerated).toBe(true);
  });
});
