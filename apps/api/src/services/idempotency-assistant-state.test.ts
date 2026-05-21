import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  accounts,
  profiles,
  subjects,
  learningSessions,
  sessionEvents,
  generateUUIDv7,
} from '@eduagent/database';
import { like } from 'drizzle-orm';
import type { Database } from '@eduagent/database';
import { lookupAssistantTurnState } from './idempotency-assistant-state';

const mockCaptureException = jest.fn();
const mockLoggerWarn = jest.fn();
const mockInngestSend = jest.fn();

jest.mock('./sentry' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('./sentry') as typeof import('./sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
    addBreadcrumb: jest.fn(),
  };
});
jest.mock('./logger' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('./logger') as typeof import('./logger');
  return {
    ...actual,
    createLogger: () => ({
      info: jest.fn(),
      warn: (...args: unknown[]) => mockLoggerWarn(...args),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  };
});
jest.mock('../inngest/client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
  };
});

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const RUN_ID = generateUUIDv7();

let db: Database;

async function seedAccountAndProfile(suffix = '') {
  const clerkUserId = `integ-idem-${suffix}-${RUN_ID}`;
  const email = `idem-${suffix}-${RUN_ID}@test.local`;

  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning();

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `Idem Test ${suffix}`,
      birthYear: 2010,
    })
    .returning();

  return { account: account!, profile: profile! };
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
  if (!dbUrl) throw new Error('DATABASE_URL is not set');
  db = createDatabase(dbUrl);
});

afterAll(async () => {
  if (db) {
    await db
      .delete(accounts)
      .where(like(accounts.clerkUserId, `integ-idem-%-${RUN_ID}`));
  }
});

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// [BUG-420] Break tests — dispatch failure is captured, not swallowed
// ---------------------------------------------------------------------------
// These run without a real DB by passing a db that throws on first use,
// so the catch branch fires deterministically.

describe('[BUG-420] lookupAssistantTurnState — safeSend on dispatch failure', () => {
  it('returns safe default, calls logger.warn, and does NOT throw when dispatch fails', async () => {
    // Arrange: inngest.send rejects so we can verify safeSend captures it
    mockInngestSend.mockRejectedValueOnce(new Error('Inngest unavailable'));

    // A db that throws to trigger the catch path
    const brokenDb = {
      select: () => {
        throw new Error('DB connection lost');
      },
    } as unknown as Database;

    // Act
    const result = await lookupAssistantTurnState({
      db: brokenDb,
      profileId: 'a1b2c3d4-e5f6-4111-8111-a1b2c3d4e5f6',
      flow: 'session',
      key: 'any-key',
    });

    // Assert — safe default returned, no throw
    expect(result).toEqual({
      assistantTurnReady: false,
      latestExchangeId: null,
    });
    // captureException called for the DB error (not the dispatch failure — that's
    // inside safeSend which also captures it internally)
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'idempotency.lookupAssistantTurnState',
        }),
      }),
    );
    // logger.warn called (observable escalation present)
    expect(mockLoggerWarn).toHaveBeenCalled();
    // inngest.send was attempted (via safeSend — NOT fire-and-forget)
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/idempotency.assistant_turn_lookup_failed',
      }),
    );
  });

  it('returns safe default and emits inngest event when DB lookup fails', async () => {
    mockInngestSend.mockResolvedValueOnce(undefined);

    const brokenDb = {
      select: () => {
        throw new Error('query timed out');
      },
    } as unknown as Database;

    const result = await lookupAssistantTurnState({
      db: brokenDb,
      profileId: 'a1b2c3d4-e5f6-4111-8111-a1b2c3d4e5f6',
      flow: 'session',
      key: 'any-key',
    });

    expect(result).toEqual({
      assistantTurnReady: false,
      latestExchangeId: null,
    });
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/idempotency.assistant_turn_lookup_failed',
        data: expect.objectContaining({ flow: 'session' }),
      }),
    );
  });
});

const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('lookupAssistantTurnState (integration)', () => {
  // Neon HTTP round-trips on first connection can be slow. 30 s matches the
  // integration test suite default in tests/integration/setup.ts.
  jest.setTimeout(30_000);

  it('returns safe default when db is undefined', async () => {
    const result = await lookupAssistantTurnState({
      db: undefined,
      profileId: 'any-profile-id',
      flow: 'session',
      key: 'any-key',
    });
    expect(result).toEqual({
      assistantTurnReady: false,
      latestExchangeId: null,
    });
  });

  it('returns safe default when profileId is undefined', async () => {
    const result = await lookupAssistantTurnState({
      db,
      profileId: undefined,
      flow: 'session',
      key: 'any-key',
    });
    expect(result).toEqual({
      assistantTurnReady: false,
      latestExchangeId: null,
    });
  });

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
