/**
 * [WI-2503] Mentor-notice nudge serialization — real database concurrency.
 *
 * Two defects are reproduced here, both against a real Postgres with genuinely
 * concurrent transactions (separate pooled connections, no fakes for anything
 * internal):
 *
 *  1. CROSS-FAMILY OVER-BUDGET SEND. The mentor-notice reserve and the generic
 *     review-family rate limiter used incompatible advisory-lock keys
 *     (`notification:<profileId>` vs `rate-limit:<profileId>:<types>`), so the
 *     two families never serialized against each other and could each consume
 *     the single review-family slot — the learner gets two review-family pushes
 *     inside the shared cap of one.
 *
 *  2. DEFER-BEFORE-SEND DELIVERY. The nudge sender's final eligibility recheck
 *     and the push were unsynchronized, so a defer ("Not now") that COMMITTED
 *     after the recheck and before the push completed still resulted in a
 *     delivered push.
 *
 * External-boundary mocks only (AGENTS.md § Code Quality Guards):
 *   - `global.fetch` — the Expo Push API network call. Test 2 gates it so the
 *     defer can be committed while a push is genuinely in flight.
 */

import {
  createDatabase,
  generateUUIDv7,
  learningSessions,
  membership,
  mentorNotices,
  notificationLog,
  notificationPreferences,
  organization,
  person,
  subjects,
  type Database,
} from '@eduagent/database';
import { and, eq, inArray } from 'drizzle-orm';

import {
  applyMentorNoticeOutcome,
  DELIVERY_LOCK_HOLD_MS,
  reserveMentorNoticeNudge,
  sendReservedMentorNoticeNudge,
} from '../../services/mentor-notices';
import { REVIEW_FAMILY_DEDUP_TYPES } from '../../services/notifications';
import { recallNudgeSend } from './recall-nudge-send';

let db: Database;
let restoreFetch: () => void;
let pushCallCount: number;
/** Resolves the in-flight push; set only by the gated-fetch tests. */
let releasePush: (() => void) | null;
/** Resolves once the mocked Expo call has actually been entered. */
let pushEntered: Promise<void>;

const RUN_ID = generateUUIDv7();
const EXPO_TOKEN = 'ExponentPushToken[wi2503-integration]';
const createdOrgIds: string[] = [];
const createdProfileIds: string[] = [];
let seedCounter = 0;

type HandlerFn = (ctx: unknown) => Promise<unknown>;

function buildStep(): {
  run: (name: string, fn: () => Promise<unknown>) => Promise<unknown>;
  sendEvent: jest.Mock;
} {
  return {
    run: (_name: string, fn: () => Promise<unknown>) => fn(),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };
}

async function invokeRecallNudgeSend(profileId: string): Promise<unknown> {
  const handler = (recallNudgeSend as unknown as { fn: HandlerFn }).fn;
  return handler({
    event: {
      id: `evt-${generateUUIDv7()}`,
      data: { profileId, fadingCount: 1, topTopicIds: [] as string[] },
    },
    step: buildStep(),
  });
}

async function seedProfile(): Promise<string> {
  const idx = ++seedCounter;
  const [org] = await db
    .insert(organization)
    .values({ name: `WI2503 org ${RUN_ID}_${idx}` })
    .returning({ id: organization.id });
  createdOrgIds.push(org!.id);

  const [profile] = await db
    .insert(person)
    .values({
      displayName: 'Nudge Serialization User',
      birthDate: '1990-01-01',
      residenceJurisdiction: 'ROW',
    })
    .returning({ id: person.id });
  createdProfileIds.push(profile!.id);

  await db.insert(membership).values({
    personId: profile!.id,
    organizationId: org!.id,
    roles: ['learner'],
  });
  await db.insert(notificationPreferences).values({
    profileId: profile!.id,
    pushEnabled: true,
    reviewReminders: true,
    expoPushToken: EXPO_TOKEN,
  });
  return profile!.id;
}

/** Seeds an open mentor notice with a pending nudge for `profileId`. */
async function seedPendingNotice(profileId: string): Promise<string> {
  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: `WI2503 Subject ${generateUUIDv7()}` })
    .returning({ id: subjects.id });
  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId: subject!.id,
      sessionType: 'homework',
      status: 'completed',
      exchangeCount: 2,
      startedAt: new Date(),
      endedAt: new Date(),
      wallClockSeconds: 120,
    })
    .returning({ id: learningSessions.id });
  const [notice] = await db
    .insert(mentorNotices)
    .values({
      profileId,
      subjectId: subject!.id,
      topicId: null,
      sourceSessionId: session!.id,
      concept: 'Carrying across the decimal point',
      correctionHint: 'Line the decimal points up first.',
    })
    .returning({ id: mentorNotices.id });
  return notice!.id;
}

/** Reads a notice's committed state on an independent connection. */
async function readNotice(noticeId: string) {
  const [row] = await db
    .select({
      nudgeStatus: mentorNotices.nudgeStatus,
      lastDeferredAt: mentorNotices.lastDeferredAt,
    })
    .from(mentorNotices)
    .where(eq(mentorNotices.id, noticeId));
  if (!row) throw new Error('notice not found');
  return row;
}

async function reviewFamilyLogRows(profileId: string) {
  return db
    .select({ type: notificationLog.type })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.profileId, profileId),
        inArray(notificationLog.type, [...REVIEW_FAMILY_DEDUP_TYPES]),
      ),
    );
}

function installFetchMock(gated: boolean) {
  pushCallCount = 0;
  releasePush = null;
  let markEntered: () => void = () => undefined;
  pushEntered = new Promise<void>((resolve) => {
    markEntered = resolve;
  });
  const saved = globalThis.fetch;
  const mockFetch = jest
    .fn()
    .mockImplementation(
      async (_url: string, init?: { signal?: AbortSignal }) => {
        pushCallCount += 1;
        markEntered();
        if (gated) {
          // Honor the caller's abort signal exactly as a real fetch would.
          await new Promise<void>((resolve, reject) => {
            releasePush = resolve;
            init?.signal?.addEventListener('abort', () =>
              reject(new Error('The operation was aborted')),
            );
          });
        }
        return new Response(
          JSON.stringify({ data: { id: `ticket-wi2503-${pushCallCount}` } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    );
  Object.defineProperty(globalThis, 'fetch', {
    value: mockFetch,
    writable: true,
    configurable: true,
  });
  restoreFetch = () => {
    Object.defineProperty(globalThis, 'fetch', {
      value: saved,
      writable: true,
      configurable: true,
    });
  };
}

beforeAll(() => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set for WI-2503 integration tests');
  }
  db = createDatabase(databaseUrl);
  process.env['DATABASE_URL'] = databaseUrl; // getStepDatabase() reads this
}, 30_000);

afterEach(() => {
  restoreFetch?.();
});

afterAll(async () => {
  if (createdProfileIds.length > 0) {
    await db.delete(person).where(inArray(person.id, createdProfileIds));
  }
  if (createdOrgIds.length > 0) {
    await db
      .delete(organization)
      .where(inArray(organization.id, createdOrgIds));
  }
}, 30_000);

describe('[WI-2503] review-family senders serialize on one budget identity', () => {
  it('a mentor-notice nudge racing a recall nudge never exceeds the one-per-family cap', async () => {
    installFetchMock(false);
    // Several independent rounds: each round is one profile whose mentor-notice
    // delivery and recall-nudge delivery start simultaneously on separate
    // connections. Pre-fix the two lock families do not exclude each other, so
    // both reserve against a count of zero and both push.
    const rounds = 8;
    const overBudget: Array<{ profileId: string; rows: number }> = [];

    for (let round = 0; round < rounds; round += 1) {
      const profileId = await seedProfile();
      const noticeId = await seedPendingNotice(profileId);
      const pushesBefore = pushCallCount;

      await Promise.all([
        (async () => {
          const reserved = await reserveMentorNoticeNudge(db, {
            profileId,
            noticeId,
            localDayStart: new Date(Date.now() - 60 * 60 * 1000),
          });
          if (reserved) {
            await sendReservedMentorNoticeNudge(db, { profileId, noticeId });
          }
        })(),
        invokeRecallNudgeSend(profileId),
      ]);

      const rows = await reviewFamilyLogRows(profileId);
      const pushesThisRound = pushCallCount - pushesBefore;
      if (rows.length > 1 || pushesThisRound > 1) {
        overBudget.push({ profileId, rows: rows.length });
      }
    }

    // The guaranteed property of the named case: across ALL rounds, no profile
    // ever holds more than one review-family notification-log row, and no round
    // delivered more than one review-family push.
    expect(overBudget).toEqual([]);
  }, 120_000);
});

describe('[WI-2503] a defer committed before delivery suppresses the push', () => {
  it('never delivers a push after a defer has committed', async () => {
    installFetchMock(true);
    const profileId = await seedProfile();
    const noticeId = await seedPendingNotice(profileId);

    const reserved = await reserveMentorNoticeNudge(db, {
      profileId,
      noticeId,
      localDayStart: new Date(Date.now() - 60 * 60 * 1000),
    });
    expect(reserved).toBe(true);

    const sendPromise = sendReservedMentorNoticeNudge(db, {
      profileId,
      noticeId,
    });

    // Wait until the push is genuinely in flight, then commit the learner's
    // "Not now" on an independent connection.
    await pushEntered;
    const deferPromise = applyMentorNoticeOutcome(db, {
      profileId,
      noticeId,
      outcome: 'deferred',
      learningDayStart: new Date(Date.now() - 60 * 60 * 1000),
    });

    // Give the defer a generous window to COMMIT while the push is still in
    // flight (observed on an independent connection — the defer's own promise
    // also awaits a post-commit Inngest dispatch, so it is not a commit
    // signal). Post-fix the defer blocks on the notice's delivery lock and
    // nothing is committed here.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const deferCommittedBeforeDelivery =
      (await readNotice(noticeId)).lastDeferredAt !== null;

    releasePush?.();
    const [sendResult] = await Promise.all([sendPromise, deferPromise]);

    // Guaranteed property of the named case: a defer that committed before the
    // push was delivered must mean NO push was delivered.
    expect(deferCommittedBeforeDelivery && sendResult.sent).toBe(false);

    // Delivery won the race, so exactly one durable sent result exists and the
    // late defer did not rewrite it.
    expect(sendResult.sent).toBe(true);
    expect(pushCallCount).toBe(1);
    const noticeRow = await readNotice(noticeId);
    expect(noticeRow.nudgeStatus).toBe('sent');
    expect(noticeRow.lastDeferredAt).not.toBeNull();
    const rows = await reviewFamilyLogRows(profileId);
    expect(rows).toHaveLength(1);
  }, 60_000);
});

describe('[WI-2503] duplicate events, retries and crash/replay', () => {
  it('two duplicate deliveries of the same notice produce exactly one push', async () => {
    installFetchMock(false);
    const profileId = await seedProfile();
    const noticeId = await seedPendingNotice(profileId);
    const localDayStart = new Date(Date.now() - 60 * 60 * 1000);

    // Same event delivered twice (Inngest replay / operator re-fire), both
    // running concurrently against the real database.
    const deliver = async () => {
      const reserved = await reserveMentorNoticeNudge(db, {
        profileId,
        noticeId,
        localDayStart,
      });
      if (!reserved) return { sent: false };
      return sendReservedMentorNoticeNudge(db, { profileId, noticeId });
    };
    const results = await Promise.all([deliver(), deliver()]);

    expect(results.filter((r) => r.sent)).toHaveLength(1);
    expect(pushCallCount).toBe(1);
    expect((await readNotice(noticeId)).nudgeStatus).toBe('sent');
    expect(await reviewFamilyLogRows(profileId)).toHaveLength(1);

    // A later retry of the same event must not send again.
    const retry = await deliver();
    expect(retry.sent).toBe(false);
    expect(pushCallCount).toBe(1);
  }, 60_000);

  it('a worker lost between reservation and delivery cannot send twice on replay', async () => {
    installFetchMock(false);
    const profileId = await seedProfile();
    const noticeId = await seedPendingNotice(profileId);
    const localDayStart = new Date(Date.now() - 60 * 60 * 1000);

    // Crash/replay point: the reservation transaction committed, then the
    // worker died before (or during) delivery. Its delivery transaction rolled
    // back, so the durable state is exactly this — a `reserved` notice whose
    // budget row is already committed.
    expect(
      await reserveMentorNoticeNudge(db, {
        profileId,
        noticeId,
        localDayStart,
      }),
    ).toBe(true);
    expect((await readNotice(noticeId)).nudgeStatus).toBe('reserved');
    expect(await reviewFamilyLogRows(profileId)).toHaveLength(1);

    // Inngest replays the event on a fresh worker.
    const replayReserved = await reserveMentorNoticeNudge(db, {
      profileId,
      noticeId,
      localDayStart,
    });

    // Guaranteed property: the committed reservation row is the once-ever
    // marker, so the replay is refused, no second budget slot is taken, and no
    // push leaves. Fail-closed: an under-delivery, never a duplicate.
    expect(replayReserved).toBe(false);
    expect(pushCallCount).toBe(0);
    expect(await reviewFamilyLogRows(profileId)).toHaveLength(1);
    expect((await readNotice(noticeId)).nudgeStatus).toBe('reserved');
  }, 60_000);
});

describe('[WI-2503] a hung push cannot stall the learner', () => {
  it('releases the notice lock and lets a defer through when the push never returns', async () => {
    installFetchMock(true);
    const profileId = await seedProfile();
    const noticeId = await seedPendingNotice(profileId);
    const localDayStart = new Date(Date.now() - 60 * 60 * 1000);
    expect(
      await reserveMentorNoticeNudge(db, {
        profileId,
        noticeId,
        localDayStart,
      }),
    ).toBe(true);

    // The push is gated and never released — Expo hanging on us.
    const sendPromise = sendReservedMentorNoticeNudge(db, {
      profileId,
      noticeId,
    }).catch(() => ({ sent: false }));
    await pushEntered;

    // The learner taps "Not now" on a synchronous request. It must not wait on
    // the hung push indefinitely: the delivery transaction caps its own hold,
    // Postgres terminates it, and the lock is released.
    const startedAt = Date.now();
    const deferred = await applyMentorNoticeOutcome(db, {
      profileId,
      noticeId,
      outcome: 'deferred',
      learningDayStart: localDayStart,
    });
    const waitedMs = Date.now() - startedAt;

    expect(deferred).not.toBeNull();
    expect(waitedMs).toBeLessThan(DELIVERY_LOCK_HOLD_MS + 5_000);
    // The push was aborted, so the delivery settled as `skipped` and the defer
    // recorded its timestamp; no push was ever delivered.
    expect((await readNotice(noticeId)).nudgeStatus).toBe('skipped');
    expect(deferred!.lastDeferredAt).not.toBeNull();
    expect(await sendPromise).toEqual(expect.objectContaining({ sent: false }));
  }, 30_000);
});
