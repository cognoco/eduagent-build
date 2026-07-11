/**
 * recall-nudge-send / review-due-send — cross-type dedup integration test
 * (real database)
 *
 * [WI-1461] recall-nudge.ts and review-due-scan.ts are two independent
 * Inngest crons that scan the same overdue-retention-card population and,
 * pre-fix, never saw each other's sends: each cron's send handler
 * (recall-nudge-send.ts / review-due-send.ts) rate-limits only against its
 * OWN notificationLog type ('recall_nudge' / 'review_reminder'). A profile
 * eligible for both crons on the same day could receive BOTH pushes
 * referencing the same overdue material.
 *
 * The fix shares the atomic rate-limit check (checkAndLogRateLimitInternal,
 * apps/api/src/services/settings.ts) across both types for these two send
 * handlers specifically (dedupTypes), so whichever handler's atomic
 * check-and-log transaction commits first consumes the day's "review-family"
 * push slot for that profile — the second handler observes the row the
 * first inserted and skips. This is deliberately first-wins: the mechanism
 * does not guarantee recall_nudge is preferred over review_reminder or vice
 * versa, only that at most one of the two fires per profile per rolling 24h
 * window. Both send handlers are invoked directly here (as in
 * recall-nudge-send.integration.test.ts / review-due-send.integration.test.ts)
 * against the real DB, so the actual pg_advisory_xact_lock + notificationLog
 * transaction runs — not a mock of the rate limiter.
 *
 * External-boundary mocks only (AGENTS.md § Code Quality Guards):
 *   - `global.fetch` — the Expo Push API network call.
 *   - `step` — the Inngest step object, replaced by a thin runner that
 *     executes step.run fns inline.
 */

import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  curriculumBooks,
  curriculumTopics,
  curricula,
  generateUUIDv7,
  membership,
  notificationLog,
  notificationPreferences,
  organization,
  person,
  subjects,
  type Database,
} from '@eduagent/database';
import { and, eq, inArray } from 'drizzle-orm';

import { recallNudgeSend } from './recall-nudge-send';
import { reviewDueSend } from './review-due-send';

// ── Database env bootstrap ───────────────────────────────────────────────────
loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;
let fetchSpy: { mockRestore: () => void };
let pushCallCount: number;

const RUN_ID = generateUUIDv7();
const EXPO_TOKEN = 'ExponentPushToken[rrpd-integration]';
let seedCounter = 0;

const createdAccountIds: string[] = [];
const createdProfileIds: string[] = [];

// ── Step runner ──────────────────────────────────────────────────────────────

function buildStep(): {
  run: (name: string, fn: () => Promise<unknown>) => Promise<unknown>;
  sendEvent: jest.Mock;
} {
  const run = (_name: string, fn: () => Promise<unknown>) => fn();
  const sendEvent = jest.fn().mockResolvedValue(undefined);
  return { run, sendEvent };
}

type HandlerFn = (ctx: unknown) => Promise<unknown>;

async function invokeRecallNudgeSend(data: {
  profileId: string;
  fadingCount: number;
  topTopicIds: string[];
}): Promise<unknown> {
  const step = buildStep();
  const handler = (recallNudgeSend as unknown as { fn: HandlerFn }).fn;
  return handler({ event: { id: `evt-${generateUUIDv7()}`, data }, step });
}

async function invokeReviewDueSend(data: {
  profileId: string;
  overdueCount: number;
  topTopicIds: string[];
}): Promise<unknown> {
  const step = buildStep();
  const handler = (reviewDueSend as unknown as { fn: HandlerFn }).fn;
  return handler({ event: { id: `evt-${generateUUIDv7()}`, data }, step });
}

// ── Seed helpers ─────────────────────────────────────────────────────────────

async function seedProfileEligibleForBothCrons(): Promise<{
  profileId: string;
}> {
  const idx = ++seedCounter;
  const [org] = await db
    .insert(organization)
    .values({ name: `RRPD Seed org ${RUN_ID}_${idx}` })
    .returning({ id: organization.id });
  createdAccountIds.push(org!.id);

  const [profile] = await db
    .insert(person)
    .values({
      displayName: 'Cross-Cron Test User',
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

  // pushEnabled=true AND reviewReminders=true — eligible for both
  // recall-nudge (local 8am window, now also reviewReminders-gated) and
  // review-due-scan (pushEnabled + reviewReminders).
  await db.insert(notificationPreferences).values({
    profileId: profile!.id,
    pushEnabled: true,
    reviewReminders: true,
    expoPushToken: EXPO_TOKEN,
  });

  return { profileId: profile!.id };
}

/** Seeds a subject → curriculum → book → topic representing the overdue card. */
async function seedOverlappingTopic(
  profileId: string,
): Promise<{ topicId: string }> {
  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: `RRPD Subject ${generateUUIDv7()}` })
    .returning({ id: subjects.id });

  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `RRPD Book ${generateUUIDv7()}`,
      sortOrder: 1,
    })
    .returning({ id: curriculumBooks.id });

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: `RRPD Topic ${generateUUIDv7()}`,
      description: 'Integration test topic (overlapping card set)',
      sortOrder: 1,
      estimatedMinutes: 10,
    })
    .returning({ id: curriculumTopics.id });

  return { topicId: topic!.id };
}

async function notificationLogRowsFor(
  profileId: string,
): Promise<Array<{ type: string }>> {
  return db
    .select({ type: notificationLog.type })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.profileId, profileId),
        inArray(notificationLog.type, ['recall_nudge', 'review_reminder']),
      ),
    );
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set for recall-review-push-dedup integration tests',
    );
  }
  db = createDatabase(databaseUrl);
  process.env['DATABASE_URL'] = databaseUrl; // getStepDatabase() reads this
}, 30_000);

beforeEach(() => {
  jest.clearAllMocks();
  pushCallCount = 0;
  const savedFetch = globalThis.fetch;
  const mockFetch = jest.fn().mockImplementation(async () => {
    pushCallCount += 1;
    return new Response(
      JSON.stringify({ data: { id: `ticket-rrpd-${pushCallCount}` } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
  Object.defineProperty(globalThis, 'fetch', {
    value: mockFetch,
    writable: true,
    configurable: true,
  });
  fetchSpy = {
    mockRestore: () => {
      Object.defineProperty(globalThis, 'fetch', {
        value: savedFetch,
        writable: true,
        configurable: true,
      });
    },
  };
});

afterEach(() => {
  fetchSpy.mockRestore();
});

afterAll(async () => {
  if (createdProfileIds.length > 0) {
    await db.delete(person).where(inArray(person.id, createdProfileIds));
  }
  if (createdAccountIds.length > 0) {
    await db
      .delete(organization)
      .where(inArray(organization.id, createdAccountIds));
  }
}, 30_000);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('recall-nudge-send / review-due-send — cross-type dedup', () => {
  it('[WI-1461] a profile eligible for both crons on the same day gets exactly ONE notificationLog row for the overlapping card set', async () => {
    const { profileId } = await seedProfileEligibleForBothCrons();
    const { topicId } = await seedOverlappingTopic(profileId);

    // review-due-scan's fan-out fires first (simulating whichever cron's
    // event lands first for this profile on this day).
    const reviewResult = await invokeReviewDueSend({
      profileId,
      overdueCount: 1,
      topTopicIds: [topicId],
    });
    expect(reviewResult).toMatchObject({ status: 'sent', profileId });

    // recall-nudge's fan-out fires for the SAME profile, SAME overdue card,
    // same day. [WI-1461] Pre-fix, checkAndLogRateLimitInternal only counted
    // rows of type='recall_nudge' (finds 0 for this profile) and would log a
    // SECOND row here — this assertion is RED on main.
    const recallResult = await invokeRecallNudgeSend({
      profileId,
      fadingCount: 1,
      topTopicIds: [topicId],
    });
    expect(recallResult).toMatchObject({ status: 'skipped', profileId });

    const rows = await notificationLogRowsFor(profileId);
    expect(rows).toHaveLength(1);
    expect(pushCallCount).toBe(1);
  });

  it('[WI-1461] the reverse fire order (recall-nudge first) also yields exactly one row', async () => {
    const { profileId } = await seedProfileEligibleForBothCrons();
    const { topicId } = await seedOverlappingTopic(profileId);

    const recallResult = await invokeRecallNudgeSend({
      profileId,
      fadingCount: 1,
      topTopicIds: [topicId],
    });
    expect(recallResult).toMatchObject({ status: 'sent', profileId });

    const reviewResult = await invokeReviewDueSend({
      profileId,
      overdueCount: 1,
      topTopicIds: [topicId],
    });
    expect(reviewResult).toMatchObject({ status: 'skipped', profileId });

    const rows = await notificationLogRowsFor(profileId);
    expect(rows).toHaveLength(1);
    expect(pushCallCount).toBe(1);
  });
});
