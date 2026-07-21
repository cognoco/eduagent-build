/**
 * Integration: WI-2557 — the shifted learning day is local 04:00, and the
 * route defer consumer must derive its boundary from that one primitive.
 *
 * THE NAMED CASE. `getLearningDayStart` used to subtract four ABSOLUTE hours
 * before choosing the local civil date. Chile moves -04 to -03 at
 * 2026-09-06T04:00:00Z: at 07:30Z the learner's clock reads 04:30 on
 * 2026-09-06, so the learning day began at local 04:00 that same day
 * (2026-09-06T07:00:00Z). Subtracting four absolute hours lands at 03:30Z —
 * before the transition — whose local reading is 23:30 on 2026-09-05, selecting
 * the previous civil day and a boundary 23 hours early.
 *
 * WHY A CONSUMER TEST. Defer is idempotent PER LEARNING DAY: a second defer
 * inside the same day is swallowed, and the first defer of a NEW day re-fires.
 * The pre-existing defer tests all use an ordinary current-time boundary, where
 * the local-04:00 definition and the four-hour subtraction agree — none of them
 * would notice this consumer drifting off the shared primitive. Here a notice
 * deferred at local 03:00 (the tail of the PREVIOUS learning day) must be
 * deferrable again at local 04:30; under the old boundary the route swallows
 * the second defer and echoes yesterday's timestamp.
 *
 * The route reads the wall clock (`const now = new Date()` in the handler), so
 * Date alone is faked — timers and socket IO stay real so the live pg
 * connection and the Hono request path are unaffected.
 */

import { eq } from 'drizzle-orm';
import { membership, mentorNotices, organization } from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  seedLearningSession,
  seedSubject,
} from './route-fixtures';
import { mockInngestEvents } from './mocks';
import { clearFetchCalls } from './fetch-interceptor';

import { getProfileTimeZone } from '../../apps/api/src/services/mentor-notices';
import { app } from '../../apps/api/src/index';

const TEST_ENV = {
  ...buildIntegrationEnv(),
  MENTOR_NOTICE_ENABLED: 'true',
};

const LEARNER = {
  userId: 'user_wi2557_learning_day',
  email: 'wi2557-learning-day@test.invalid',
};

// Chile: -04 -> -03 at 2026-09-06T04:00:00Z.
const SANTIAGO_NOW = new Date('2026-09-06T07:30:00.000Z'); // local 04:30
const PREVIOUS_LEARNING_DAY_INSTANT = new Date('2026-09-06T06:00:00.000Z'); // local 03:00

// Everything jest's modern fake timers can fake EXCEPT Date.
const DO_NOT_FAKE_EXCEPT_DATE = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

type Fixture = { profileId: string; noticeId: string };

let fixture: Fixture;

async function seedFixture(): Promise<Fixture> {
  const db = createIntegrationDb();

  const learner = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: LEARNER,
    displayName: 'WI-2557 Learner',
    birthYear: 1990,
  });

  // getProfileTimeZone resolves through organization.timezone, which is
  // nullable with no default — an unset fixture resolves to UTC and this test
  // would pass while proving nothing.
  const [row] = await db
    .select({ organizationId: membership.organizationId })
    .from(membership)
    .where(eq(membership.personId, learner.id))
    .limit(1);
  if (!row) throw new Error('membership lookup failed');
  await db
    .update(organization)
    .set({ timezone: 'America/Santiago' })
    .where(eq(organization.id, row.organizationId));

  const subject = await seedSubject(learner.id, 'WI2557 Algebra');
  const sourceSessionId = await seedLearningSession({
    profileId: learner.id,
    subjectId: subject.id,
    overrides: { sessionType: 'homework', status: 'completed' },
  });

  const [notice] = await db
    .insert(mentorNotices)
    .values({
      profileId: learner.id,
      subjectId: subject.id,
      sourceSessionId,
      concept: 'Changing signs across the equals sign',
      correctionHint: 'Apply the inverse operation to both sides.',
      status: 'open',
      // Deferred at local 03:00 on 2026-09-06 — the tail of the learning day
      // that started at local 04:00 on 2026-09-05.
      lastDeferredAt: PREVIOUS_LEARNING_DAY_INSTANT,
      lastRecheckOutcome: 'deferred',
    })
    .returning({ id: mentorNotices.id });
  if (!notice) throw new Error('mentor notice insert failed');

  return { profileId: learner.id, noticeId: notice.id };
}

beforeAll(async () => {
  mockInngestEvents();
  clearFetchCalls();
  await cleanupAccounts({
    emails: [LEARNER.email],
    clerkUserIds: [LEARNER.userId],
  });
  fixture = await seedFixture();
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [LEARNER.email],
    clerkUserIds: [LEARNER.userId],
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('WI-2557 route defer idempotency across an offset transition', () => {
  it('resolves the learner zone the boundary depends on', async () => {
    const db = createIntegrationDb();
    expect(await getProfileTimeZone(db, fixture.profileId)).toBe(
      'America/Santiago',
    );
  });

  it('re-fires a defer whose previous defer fell in the previous learning day', async () => {
    jest.useFakeTimers({
      now: SANTIAGO_NOW,
      doNotFake: [...DO_NOT_FAKE_EXCEPT_DATE] as never,
    });

    const res = await app.request(
      `/v1/mentor-notices/${fixture.noticeId}/defer`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: LEARNER.userId, email: LEARNER.email },
          fixture.profileId,
        ) as Record<string, string>,
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      noticeId: string;
      deferredAt: string;
    };
    expect(body.noticeId).toBe(fixture.noticeId);
    // A new learning day began at local 04:00, so this defer TAKES and stamps
    // the current instant. Under the four-absolute-hour boundary the route
    // treats yesterday's 03:00 defer as "already deferred today", swallows this
    // one, and echoes 2026-09-06T06:00:00.000Z instead.
    expect(body.deferredAt).toBe(SANTIAGO_NOW.toISOString());
    expect(body.deferredAt).not.toBe(
      PREVIOUS_LEARNING_DAY_INSTANT.toISOString(),
    );

    const db = createIntegrationDb();
    const [persisted] = await db
      .select({ lastDeferredAt: mentorNotices.lastDeferredAt })
      .from(mentorNotices)
      .where(eq(mentorNotices.id, fixture.noticeId));
    expect(persisted?.lastDeferredAt).toEqual(SANTIAGO_NOW);
  });

  it('still swallows a second defer inside the same learning day', async () => {
    // Fences the fix from over-firing: at local 05:30, the defer stamped at
    // local 04:30 above is inside the SAME learning day, so the route must
    // remain idempotent and echo the earlier timestamp.
    jest.useFakeTimers({
      now: new Date('2026-09-06T08:30:00.000Z'),
      doNotFake: [...DO_NOT_FAKE_EXCEPT_DATE] as never,
    });

    const res = await app.request(
      `/v1/mentor-notices/${fixture.noticeId}/defer`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: LEARNER.userId, email: LEARNER.email },
          fixture.profileId,
        ) as Record<string, string>,
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { deferredAt: string };
    expect(body.deferredAt).toBe(SANTIAGO_NOW.toISOString());
  });
});
