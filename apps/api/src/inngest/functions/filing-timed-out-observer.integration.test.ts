import { resolve } from 'path';
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
import { eq, like } from 'drizzle-orm';

import { filingTimedOutObserve } from './filing-timed-out-observe';
import { filingCompletedObserve } from './filing-completed-observe';

// ── Database env bootstrap ──────────────────────────────────────────────────
loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `clerk_filing_obs_${RUN_ID}`;
let seedCounter = 0;

// ── Seed helpers ────────────────────────────────────────────────────────────

async function seedAccount(): Promise<{ accountId: string }> {
  const idx = ++seedCounter;
  const clerkUserId = `${CLERK_PREFIX}_${idx}`;
  const email = `filing-obs-${RUN_ID}-${idx}@test.invalid`;

  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning({ id: accounts.id });

  return { accountId: account!.id };
}

async function seedProfile(accountId: string): Promise<{ profileId: string }> {
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId,
      displayName: 'Test User',
      birthYear: 1990,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  return { profileId: profile!.id };
}

async function seedSubject(profileId: string): Promise<{ subjectId: string }> {
  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: 'Test Subject' })
    .returning({ id: subjects.id });

  return { subjectId: subject!.id };
}

async function seedSession(
  profileId: string,
  subjectId: string
): Promise<{ sessionId: string }> {
  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      sessionType: 'learning',
      status: 'completed',
    })
    .returning({ id: learningSessions.id });

  return { sessionId: session!.id };
}

// ── Step mock builder ────────────────────────────────────────────────────────
//
// Runs the real step.run implementation for all step names EXCEPT those
// explicitly overridden in the `overrides` map. The override map receives
// the step name as key and a synchronous factory that returns the mock value.
//
// step.waitForEvent defaults to returning null (simulating a timeout).
// step.sendEvent is always a jest.fn() mock.

type StepRunFn = (name: string, fn: () => Promise<unknown>) => Promise<unknown>;

function buildStep(overrides: Record<string, () => unknown> = {}): {
  run: jest.MockedFunction<StepRunFn>;
  waitForEvent: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
  sendEvent: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
} {
  const run = jest.fn(async (name: string, fn: () => Promise<unknown>) => {
    if (overrides[name] !== undefined) {
      return overrides[name]();
    }
    return fn();
  }) as jest.MockedFunction<StepRunFn>;

  const waitForEvent = jest.fn().mockResolvedValue(null) as jest.MockedFunction<
    (...args: unknown[]) => Promise<unknown>
  >;

  const sendEvent = jest
    .fn()
    .mockResolvedValue(undefined) as jest.MockedFunction<
    (...args: unknown[]) => Promise<unknown>
  >;

  return { run, waitForEvent, sendEvent };
}

// ── Handler extractors ───────────────────────────────────────────────────────

type HandlerFn = (ctx: unknown) => Promise<unknown>;

function getTimedOutHandler(): HandlerFn {
  return (filingTimedOutObserve as unknown as { fn: HandlerFn }).fn;
}

function getCompletedHandler(): HandlerFn {
  return (filingCompletedObserve as unknown as { fn: HandlerFn }).fn;
}

function buildTimedOutEvent(sessionId: string, profileId: string) {
  return {
    name: 'app/session.filing_timed_out',
    data: {
      sessionId,
      profileId,
      sessionType: 'learning',
      timeoutMs: 30_000,
      timestamp: new Date().toISOString(),
    },
  };
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set for filing-timed-out-observer integration tests'
    );
  }
  db = createDatabase(databaseUrl);
}, 30_000);

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(async () => {
  // FK cascades clean child rows (profiles → subjects → sessions)
  await db
    .delete(accounts)
    .where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
}, 30_000);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('filing-timed-out observer integration', () => {
  it('emits recovered_after_window when no retry slot is claimed and CAS does not match', async () => {
    // Seed: session with filingStatus=null (default)
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { sessionId } = await seedSession(profileId, subjectId);

    const step = buildStep({
      // Override the snapshot step — it queries session_events.client_id which
      // may not exist in the staging schema; bypass to avoid unrelated failures.
      'capture-diagnostic-snapshot': () => ({
        sessionRow: null,
        eventCount: 0,
        lastEventAt: null,
        msSinceTimeoutDispatch: 0,
      }),
      // Override CAS step to return null — no retry slot claimed
      'mark-pending-and-claim-retry-slot': () => null,
    });

    const handler = getTimedOutHandler();
    const result = (await handler({
      event: buildTimedOutEvent(sessionId, profileId),
      step,
    })) as { resolution: string; snapshot: unknown };

    expect(result.resolution).toBe('recovered_after_window');

    // Row should not have been modified (filingStatus still null, filedAt null, retryCount=0)
    const row = await db.query.learningSessions.findFirst({
      where: eq(learningSessions.id, sessionId),
    });
    expect(row?.filingStatus).toBeNull();
    expect(row?.filedAt).toBeNull();
    expect(row?.filingRetryCount).toBe(0);
  });

  it('emits unrecoverable + filingStatus=filing_failed when status was already filing_pending', async () => {
    // Seed: session then set filingStatus='filing_pending' to simulate a prior retry attempt
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { sessionId } = await seedSession(profileId, subjectId);

    await db
      .update(learningSessions)
      .set({ filingStatus: 'filing_pending', updatedAt: new Date() })
      .where(eq(learningSessions.id, sessionId));

    const step = buildStep({
      // Override the snapshot step — it queries session_events.client_id which
      // may not exist in the staging schema; bypass to avoid unrelated failures.
      'capture-diagnostic-snapshot': () => ({
        sessionRow: null,
        eventCount: 0,
        lastEventAt: null,
        msSinceTimeoutDispatch: 0,
      }),
      // Override CAS step to return null — waitForEvent path is skipped
      'mark-pending-and-claim-retry-slot': () => null,
      // mark-failed runs real: WHERE filingStatus='filing_pending' matches → returns true
      // Override push step — notification_type enum may not include 'session_filing_failed'
      // in the staging schema; the real CAS+mark-failed path is what we're testing here.
      'send-failure-push': () => ({ sent: false, reason: 'test_override' }),
    });

    const handler = getTimedOutHandler();
    const result = (await handler({
      event: buildTimedOutEvent(sessionId, profileId),
      step,
    })) as { resolution: string; snapshot: unknown };

    expect(result.resolution).toBe('unrecoverable');

    const row = await db.query.learningSessions.findFirst({
      where: eq(learningSessions.id, sessionId),
    });
    expect(row?.filingStatus).toBe('filing_failed');
  });

  it('full terminal-failure → filing-completed-observe recovery round trip', async () => {
    // Seed: session in filing_failed state
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { sessionId } = await seedSession(profileId, subjectId);

    await db
      .update(learningSessions)
      .set({ filingStatus: 'filing_failed', updatedAt: new Date() })
      .where(eq(learningSessions.id, sessionId));

    // Invoke filing-completed-observe — simulates the downstream filer completing
    const step = buildStep();
    const handler = getCompletedHandler();
    const result = (await handler({
      event: {
        name: 'app/filing.completed',
        data: { sessionId, profileId },
      },
      step,
    })) as { recovered: boolean; priorStatus: string | null };

    expect(result.recovered).toBe(true);
    expect(result.priorStatus).toBe('filing_failed');

    // Verify DB: filingStatus flipped to filing_recovered, filedAt now set
    const row = await db.query.learningSessions.findFirst({
      where: eq(learningSessions.id, sessionId),
    });
    expect(row?.filingStatus).toBe('filing_recovered');
    expect(row?.filedAt).not.toBeNull();

    // sendEvent should have been called to emit app/session.filing_resolved
    expect(step.sendEvent).toHaveBeenCalledWith(
      'emit-resolved',
      expect.objectContaining({
        name: 'app/session.filing_resolved',
        data: expect.objectContaining({
          sessionId,
          profileId,
          resolution: 'recovered',
        }),
      })
    );
  });
});
