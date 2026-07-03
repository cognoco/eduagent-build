import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  subjects,
  learningSessions,
  sessionEvents,
  generateUUIDv7,
} from '@eduagent/database';
import type { Database } from '@eduagent/database';
import { lookupAssistantTurnState } from './idempotency-assistant-state';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const RUN_ID = generateUUIDv7();

let db: Database;

// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded v2 ids for cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function seedAccountAndProfile(suffix = '') {
  const clerkUserId = `integ-idem-${suffix}-${RUN_ID}`;
  const email = `idem-${suffix}-${RUN_ID}@test.local`;

  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    displayName: `Idem Test ${suffix}`,
    birthYear: 2010,
    clerkUserId,
    email,
    isOwner: false,
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  return { profile: { id: profileId } };
}

async function seedSubject(profileId: string) {
  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: 'Test Subject' })
    .returning();
  return subject!;
}

async function seedLearningSession(profileId: string, subjectId: string) {
  const [session] = await db
    .insert(learningSessions)
    .values({ profileId, subjectId, sessionType: 'learning', status: 'active' })
    .returning();
  return session!;
}

beforeAll(async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return;
  db = createDatabase(dbUrl);
});

afterAll(async () => {
  if (db) {
    await deleteV2IdentitiesForTest(db, {
      accountIds: [...seededAccountIds],
      profileIds: [...seededProfileIds],
    });
    seededAccountIds.length = 0;
    seededProfileIds.length = 0;
  }
});

const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('lookupAssistantTurnState (integration)', () => {
  // Neon HTTP round-trips on first connection can be slow. 30 s matches the
  // integration test suite default in tests/integration/setup.ts.
  jest.setTimeout(30_000);

  it('session flow: no matching user_message returns safe default', async () => {
    const { profile } = await seedAccountAndProfile('s-no-msg');
    const subject = await seedSubject(profile.id);
    await seedLearningSession(profile.id, subject.id);

    const result = await lookupAssistantTurnState({
      db,
      profileId: profile.id,
      flow: 'session',
      key: 'nonexistent-client-id',
    });

    expect(result).toEqual({
      assistantTurnReady: false,
      latestExchangeId: null,
    });
  });

  it('session flow: user_message exists but no ai_response returns not ready', async () => {
    const { profile } = await seedAccountAndProfile('s-no-resp');
    const subject = await seedSubject(profile.id);
    const session = await seedLearningSession(profile.id, subject.id);
    const clientId = `client-${RUN_ID}-s-no-resp`;

    await db.insert(sessionEvents).values({
      sessionId: session.id,
      profileId: profile.id,
      subjectId: subject.id,
      eventType: 'user_message',
      content: 'Hello',
      clientId,
    });

    const result = await lookupAssistantTurnState({
      db,
      profileId: profile.id,
      flow: 'session',
      key: clientId,
    });

    expect(result).toEqual({
      assistantTurnReady: false,
      latestExchangeId: null,
    });
  });

  it('session flow: user_message followed by ai_response returns ready with exchange id', async () => {
    const { profile } = await seedAccountAndProfile('s-with-resp');
    const subject = await seedSubject(profile.id);
    const session = await seedLearningSession(profile.id, subject.id);
    const clientId = `client-${RUN_ID}-s-with-resp`;

    await db.insert(sessionEvents).values({
      sessionId: session.id,
      profileId: profile.id,
      subjectId: subject.id,
      eventType: 'user_message',
      content: 'Hello',
      clientId,
    });

    const [aiEvent] = await db
      .insert(sessionEvents)
      .values({
        sessionId: session.id,
        profileId: profile.id,
        subjectId: subject.id,
        eventType: 'ai_response',
        content: 'Hi there',
      })
      .returning();

    const result = await lookupAssistantTurnState({
      db,
      profileId: profile.id,
      flow: 'session',
      key: clientId,
    });

    expect(result.assistantTurnReady).toBe(true);
    expect(result.latestExchangeId).toBe(aiEvent!.id);
  });
});
