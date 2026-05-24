import { resolve } from 'path';
import { eq, like } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  createDatabase,
  generateUUIDv7,
  learningSessions,
  profiles,
  subjects,
  type Database,
} from '@eduagent/database';
import { persistExchangeResult } from './session-exchange';
import { mapSessionRow } from './session-events';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

const RUN_ID = generateUUIDv7();

let seedCounter = 0;

async function seedProfile(
  db: Database,
): Promise<{ profileId: string; subjectId: string }> {
  const idx = ++seedCounter;
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: `clerk_exchange_idem_${RUN_ID}_${idx}`,
      email: `exchange-idem-${RUN_ID}-${idx}@test.invalid`,
    })
    .returning({ id: accounts.id });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `Exchange Idempotency ${idx}`,
      birthYear: 2010,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: profile!.id,
      name: `Exchange Subject ${idx}`,
    })
    .returning({ id: subjects.id });

  return { profileId: profile!.id, subjectId: subject!.id };
}

async function seedSession(db: Database, profileId: string, subjectId: string) {
  const [sessionRow] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      sessionType: 'learning',
      inputMode: 'text',
      status: 'active',
      escalationRung: 1,
      exchangeCount: 0,
      metadata: {
        continuationOpenerActive: true,
        continuationOpenerStartedExchange: 0,
      },
    })
    .returning();
  return mapSessionRow(sessionRow!);
}

async function readSessionMetadata(db: Database, sessionId: string) {
  const [row] = await db
    .select({ metadata: learningSessions.metadata })
    .from(learningSessions)
    .where(eq(learningSessions.id, sessionId));
  return row!.metadata as Record<string, unknown>;
}

describeIfDb('persistExchangeResult idempotency side effects', () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await db
      .delete(accounts)
      .where(like(accounts.clerkUserId, `clerk_exchange_idem_${RUN_ID}%`));
  });

  it('[WI-78 review] applies continuation scoring only for newly persisted client turns', async () => {
    const { profileId, subjectId } = await seedProfile(db);
    const session = await seedSession(db, profileId, subjectId);

    const first = await persistExchangeResult(
      db,
      profileId,
      session.id,
      session,
      'First attempt',
      'First answer',
      1,
      {
        isUnderstandingCheck: false,
        retrievalScore: 0.9,
      },
      'client-turn-1',
    );

    expect(first.persistedUserMessage).toBe(true);
    await expect(readSessionMetadata(db, session.id)).resolves.toMatchObject({
      continuationDepth: 'high',
    });

    const duplicate = await persistExchangeResult(
      db,
      profileId,
      session.id,
      session,
      'Duplicate attempt',
      'Duplicate answer',
      1,
      {
        isUnderstandingCheck: false,
        retrievalScore: 0.1,
      },
      'client-turn-1',
    );

    expect(duplicate.persistedUserMessage).toBe(false);
    await expect(readSessionMetadata(db, session.id)).resolves.toMatchObject({
      continuationDepth: 'high',
    });
  });
});
