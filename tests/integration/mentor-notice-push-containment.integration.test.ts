/**
 * [WI-2573] Mentor-notice push containment — real database, real transport
 * boundary.
 *
 * MMT-ADR-0036 §3.1 makes the mentor-notice MVP in-app only: no push, no
 * primer, no scheduled nudge, no background notification fan-out. The nudge
 * scan/send machinery merged before that ruling is retained dormant behind the
 * default-off MENTOR_NOTICE_PUSH_POST_MVP_ENABLED boundary.
 *
 * What makes this a real regression test rather than a flag assertion:
 *
 * - The Inngest handlers run for real against a real PostgreSQL database, with
 *   the real reserve/send services underneath (nothing in
 *   services/mentor-notices is mocked).
 * - The only faked boundary is the outbound network. `sendPushNotification`
 *   delivers by calling `fetch(EXPO_PUSH_API_URL)`, so "zero external
 *   notification side effects" is asserted at that boundary: the Expo push URL
 *   receives no fetch call at all.
 * - Every containment case is paired with a POSITIVE CONTROL that opens the
 *   boundary over the *same* fixture and observes the push actually leaving.
 *   Without it a green here could just mean the fixture was never eligible.
 * - Preconditions (notice open/pending, permissive prefs, valid push token)
 *   are asserted before the behavior, so a fixture that silently stopped
 *   qualifying fails loudly instead of passing vacuously.
 */

import { and, eq } from 'drizzle-orm';
import {
  generateUUIDv7,
  learningSessions,
  mentorNotices,
  notificationLog,
  notificationPreferences,
  subjects,
} from '@eduagent/database';

import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../../apps/api/src/test-utils/legacy-identity-anchors';
import { createInngestStepRunner } from '../../apps/api/src/test-utils/inngest-step-runner';
import { runWithInngestRequestContext } from '../../apps/api/src/inngest/helpers';
import { mentorNoticeNudgeSend } from '../../apps/api/src/inngest/functions/mentor-notice-nudge-send';
import { mentorNoticeNudgeScan } from '../../apps/api/src/inngest/functions/mentor-notice-nudge-scan';
import { createIntegrationDb } from './helpers';
import { clearFetchCalls, getFetchCalls } from './fetch-interceptor';
import { mockInngestEvents } from './mocks';
import { mockExpoPush } from './external-mocks';

const EXPO_PUSH_URL_FRAGMENT = 'exp.host/--/api/v2/push/send';

const db = createIntegrationDb();
const accountIds: string[] = [];
const profileIds: string[] = [];

beforeAll(() => {
  mockInngestEvents();
  mockExpoPush();
});
beforeEach(() => clearFetchCalls());

function databaseUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL required for this suite');
  return url;
}

/**
 * Env bindings for one Inngest invocation.
 *
 * `mentorNoticeEnabled: 'true'` is the AC-6 mandatory condition: the in-app
 * mentor-notice feature is ENABLED. `mentorNoticePushPostMvpEnabled` is the
 * containment seam under test and defaults to absent (= contained).
 */
function bindings(pushPostMvp?: 'true' | 'false') {
  return {
    databaseUrl: databaseUrl(),
    mentorNoticeEnabled: 'true',
    ...(pushPostMvp === undefined
      ? {}
      : { mentorNoticePushPostMvpEnabled: pushPostMvp }),
  };
}

/**
 * Seeds a learner whose notification settings are maximally PERMISSIVE — push
 * on, review reminders on, a valid Expo token, room under the daily cap — plus
 * one open/pending mentor notice. Everything a delivery needs is present, so
 * the only thing that can stop a push is the containment seam.
 */
async function seedPermissiveFixture(
  label: string,
  sessionType: 'homework' | 'learning',
) {
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  accountIds.push(accountId);
  profileIds.push(profileId);
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    clerkUserId: `notice-push-${label}-${profileId}`,
    email: `notice-push-${label}-${profileId}@test.invalid`,
    displayName: `Notice Push ${label}`,
    birthYear: 2010,
    isOwner: true,
    seedBaselineSubscription: false,
  });
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: `Algebra ${label}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });
  if (!subject) throw new Error('subject insert failed');

  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId: subject.id,
      sessionType,
      status: 'completed',
      exchangeCount: 2,
      startedAt: new Date(),
      endedAt: new Date(),
      wallClockSeconds: 120,
    })
    .returning({ id: learningSessions.id });
  if (!session) throw new Error('session insert failed');

  await db.insert(notificationPreferences).values({
    profileId,
    pushEnabled: true,
    reviewReminders: true,
    dailyReminders: true,
    maxDailyPush: 3,
    expoPushToken: 'ExponentPushToken[wi2573-containment-fixture]',
  });

  const [notice] = await db
    .insert(mentorNotices)
    .values({
      profileId,
      subjectId: subject.id,
      sourceSessionId: session.id,
      concept: 'Changing signs across the equals sign',
      correctionHint: 'Apply the inverse operation to both sides.',
      status: 'open',
      nudgeStatus: 'pending',
    })
    .returning({ id: mentorNotices.id });
  if (!notice) throw new Error('notice insert failed');

  return { profileId, subjectId: subject.id, noticeId: notice.id };
}

/** Fails loudly if the fixture is not actually push-eligible. */
async function assertPreconditions(fixture: {
  profileId: string;
  noticeId: string;
}) {
  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.profileId, fixture.profileId));
  expect(prefs).toMatchObject({
    pushEnabled: true,
    reviewReminders: true,
  });
  expect(prefs?.expoPushToken).toMatch(/^ExponentPushToken\[/);

  const [notice] = await db
    .select()
    .from(mentorNotices)
    .where(eq(mentorNotices.id, fixture.noticeId));
  expect(notice).toMatchObject({ status: 'open', nudgeStatus: 'pending' });

  const logs = await db
    .select({ id: notificationLog.id })
    .from(notificationLog)
    .where(eq(notificationLog.profileId, fixture.profileId));
  expect(logs).toHaveLength(0);
}

function expoCalls() {
  return getFetchCalls(EXPO_PUSH_URL_FRAGMENT);
}

async function noticeRecheckLogs(profileId: string) {
  return db
    .select({ id: notificationLog.id })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.profileId, profileId),
        eq(notificationLog.type, 'notice_recheck'),
      ),
    );
}

/**
 * Runs the send handler exactly as a queued `app/mentor-notice.nudge` event
 * would. `eventId` distinguishes a REPLAY of an event enqueued before the
 * containment landed from a fresh one — the handler must treat both the same.
 */
async function runSend(
  fixture: { profileId: string; noticeId: string },
  options: { pushPostMvp?: 'true' | 'false'; eventId: string },
) {
  const runner = createInngestStepRunner();
  const result = await runWithInngestRequestContext(
    bindings(options.pushPostMvp),
    () =>
      (
        mentorNoticeNudgeSend as unknown as {
          fn: (args: unknown) => Promise<unknown>;
        }
      ).fn({
        event: {
          id: options.eventId,
          name: 'app/mentor-notice.nudge',
          data: { profileId: fixture.profileId, noticeId: fixture.noticeId },
        },
        step: runner.step,
      }),
  );
  return { result, runner };
}

async function runScan(options: { pushPostMvp?: 'true' | 'false' }) {
  const runner = createInngestStepRunner();
  const result = await runWithInngestRequestContext(
    bindings(options.pushPostMvp),
    () =>
      (
        mentorNoticeNudgeScan as unknown as {
          fn: (args: unknown) => Promise<unknown>;
        }
      ).fn({ step: runner.step }),
  );
  return { result, runner };
}

describe('mentor-notice push containment — real database', () => {
  afterAll(async () => {
    await deleteV2IdentitiesForTest(db, { accountIds, profileIds });
  });

  // -------------------------------------------------------------------------
  // AC-6 mandatory case: in-app flag ENABLED + PERMISSIVE notification
  // settings + a REPLAYED pre-existing send event.
  // -------------------------------------------------------------------------
  it.each([
    ['homework', 'homework'],
    ['ordinary learning', 'learning'],
  ] as const)(
    'delivers nothing for a replayed pre-existing send event (%s session) with the in-app flag on and permissive settings',
    async (_label, sessionType) => {
      const fixture = await seedPermissiveFixture(
        `replay-${sessionType}`,
        sessionType,
      );
      await assertPreconditions(fixture);

      const { result } = await runSend(fixture, {
        // Boundary binding entirely ABSENT — the ordinary MVP deployment
        // shape. Not 'false': absent must contain too.
        eventId: 'pre-existing-queued-event-wi2573',
      });

      // Observable outcome 1: the push transport was never invoked.
      expect(expoCalls()).toEqual([]);
      // Observable outcome 2: no notification-log row was written.
      expect(await noticeRecheckLogs(fixture.profileId)).toHaveLength(0);
      // Observable outcome 3: no reservation happened — the notice is
      // untouched and still eligible for a post-MVP re-enable.
      const [after] = await db
        .select()
        .from(mentorNotices)
        .where(eq(mentorNotices.id, fixture.noticeId));
      expect(after).toMatchObject({ status: 'open', nudgeStatus: 'pending' });
      expect(after?.nudgedAt).toBeNull();
      // And it terminated cleanly (did not throw), so Inngest fans out no
      // retry (AC-2).
      expect(result).toEqual({ status: 'skipped', reason: 'push_post_mvp' });
    },
  );

  it('delivers nothing when the boundary is explicitly false', async () => {
    const fixture = await seedPermissiveFixture('explicit-false', 'learning');
    await assertPreconditions(fixture);

    const { result } = await runSend(fixture, {
      pushPostMvp: 'false',
      eventId: 'fresh-event-explicit-false',
    });

    expect(expoCalls()).toEqual([]);
    expect(await noticeRecheckLogs(fixture.profileId)).toHaveLength(0);
    expect(result).toEqual({ status: 'skipped', reason: 'push_post_mvp' });
  });

  it('delivers nothing on repeated retry-shaped replays of the same event', async () => {
    const fixture = await seedPermissiveFixture('retries', 'homework');
    await assertPreconditions(fixture);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { result } = await runSend(fixture, {
        eventId: 'replayed-event-retry',
      });
      expect(result).toEqual({ status: 'skipped', reason: 'push_post_mvp' });
    }

    expect(expoCalls()).toEqual([]);
    expect(await noticeRecheckLogs(fixture.profileId)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // POSITIVE CONTROL — same fixture, boundary explicitly opened. Proves the
  // containment cases above are not vacuously green.
  // -------------------------------------------------------------------------
  it('POSITIVE CONTROL: the same fixture does send when the post-MVP boundary is explicitly enabled', async () => {
    const fixture = await seedPermissiveFixture('positive-control', 'homework');
    await assertPreconditions(fixture);

    const { result } = await runSend(fixture, {
      pushPostMvp: 'true',
      eventId: 'positive-control-event',
    });

    expect(result).toMatchObject({ status: 'sent' });
    // The transport WAS invoked — exactly once, with this learner's token.
    const calls = expoCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toContain(
      'ExponentPushToken[wi2573-containment-fixture]',
    );
    expect(await noticeRecheckLogs(fixture.profileId)).toHaveLength(1);
    const [after] = await db
      .select()
      .from(mentorNotices)
      .where(eq(mentorNotices.id, fixture.noticeId));
    expect(after).toMatchObject({ nudgeStatus: 'sent' });
  });

  // -------------------------------------------------------------------------
  // Scan path — no fan-out, and no database scan at all.
  // -------------------------------------------------------------------------
  it('scan enqueues nothing and reads nothing while contained', async () => {
    const fixture = await seedPermissiveFixture('scan', 'learning');
    await assertPreconditions(fixture);

    const { result, runner } = await runScan({});

    expect(runner.sendEventCalls).toHaveLength(0);
    expect(runner.runNames()).toEqual(['check-post-mvp-push-boundary']);
    expect(result).toEqual({
      eligibleCount: 0,
      sentEvents: 0,
      reason: 'push_post_mvp',
    });
    expect(expoCalls()).toEqual([]);
    expect(await noticeRecheckLogs(fixture.profileId)).toHaveLength(0);
  });

  it('POSITIVE CONTROL: scan reaches the eligibility query once the boundary is enabled', async () => {
    const { runner } = await runScan({ pushPostMvp: 'true' });

    // The query ran (its result depends on the org-local 16:00–17:00 window,
    // so the fan-out itself is not asserted here — reaching the query is what
    // distinguishes an open boundary from a contained one).
    expect(runner.runNames()).toEqual([
      'check-post-mvp-push-boundary',
      'check-feature-flag',
      'find-eligible-notices',
    ]);
  });

  // -------------------------------------------------------------------------
  // AC-3 — the containment cannot be opened by MVP configuration.
  // -------------------------------------------------------------------------
  it('cannot be activated by the in-app mentor-notice flag or by review-reminder preferences', async () => {
    const fixture = await seedPermissiveFixture('ac3', 'learning');
    await assertPreconditions(fixture);

    // In-app flag on, review reminders on, push enabled, token present — the
    // whole of ordinary MVP configuration at its most permissive.
    const { result } = await runSend(fixture, { eventId: 'ac3-event' });

    expect(result).toEqual({ status: 'skipped', reason: 'push_post_mvp' });
    expect(expoCalls()).toEqual([]);
    expect(await noticeRecheckLogs(fixture.profileId)).toHaveLength(0);
  });
});
