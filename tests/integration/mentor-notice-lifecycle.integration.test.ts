import { and, eq } from 'drizzle-orm';
import {
  generateUUIDv7,
  learningSessions,
  membership,
  mentorNotices,
  notificationLog,
  organization,
  sessionEvents,
  subjects,
} from '@eduagent/database';

import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../../apps/api/src/test-utils/legacy-identity-anchors';
import {
  acceptMentorNotice,
  applyMentorNoticeOutcome,
  fadeStaleMentorNotices,
  getLearningDayStart,
  getProfileTimeZone,
  reserveMentorNoticeNudge,
  resolveMentorNoticeRecheckContext,
  stampMentorNoticeOffer,
  startMentorNoticeRecheck,
} from '../../apps/api/src/services/mentor-notices';
import { isMentorNoticePushPostMvpEnabled } from '../../apps/api/src/config';
import { buildNowFeed } from '../../apps/api/src/services/now-feed';
import { createIntegrationDb } from './helpers';
import { clearFetchCalls } from './fetch-interceptor';
import { getCapturedInngestEvents, mockInngestEvents } from './mocks';

// [WI-2573] Quarantine for the retained-but-dormant mentor-notice PUSH path.
//
// MMT-ADR-0036 §3.1 makes the mentor-notice MVP in-app only; the nudge
// scan/send machinery is isolated behind the default-off
// MENTOR_NOTICE_PUSH_POST_MVP_ENABLED boundary rather than deleted. A test that
// exercises that machinery is quarantined behind the SAME boundary, so it is
// dormant exactly when the code it covers is dormant, and returns automatically
// if the boundary is ever reopened post-MVP. The in-app cases in this file are
// retained MVP scope and always run.
const itPostMvpPush = isMentorNoticePushPostMvpEnabled(
  process.env['MENTOR_NOTICE_PUSH_POST_MVP_ENABLED'],
)
  ? it
  : it.skip;

const db = createIntegrationDb();
const accountIds: string[] = [];
const profileIds: string[] = [];

beforeAll(() => mockInngestEvents());
beforeEach(() => clearFetchCalls());

async function seedFixture(label: string) {
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  accountIds.push(accountId);
  profileIds.push(profileId);
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    clerkUserId: `mentor-notice-${label}-${profileId}`,
    email: `mentor-notice-${label}-${profileId}@test.invalid`,
    displayName: `Mentor Notice ${label}`,
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
  return { profileId, subjectId: subject.id };
}

async function seedSourceSession(
  fixture: { profileId: string; subjectId: string },
  createdAt = new Date(),
) {
  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId: fixture.profileId,
      subjectId: fixture.subjectId,
      sessionType: 'homework',
      status: 'completed',
      exchangeCount: 2,
      startedAt: createdAt,
      endedAt: createdAt,
      wallClockSeconds: 120,
    })
    .returning({ id: learningSessions.id });
  if (!session) throw new Error('source session insert failed');
  return session.id;
}

// getProfileTimeZone reads organization.timezone, which is nullable with no
// default — an unset fixture resolves to UTC and any learning-day assertion
// below would pass while proving nothing. Set it explicitly, and the tests
// assert the resolved zone before asserting behavior.
async function setOrganizationTimeZone(profileId: string, timeZone: string) {
  const [row] = await db
    .select({ organizationId: membership.organizationId })
    .from(membership)
    .where(eq(membership.personId, profileId))
    .limit(1);
  if (!row) throw new Error('membership lookup failed');
  await db
    .update(organization)
    .set({ timezone: timeZone })
    .where(eq(organization.id, row.organizationId));
}

describe('mentor notice lifecycle — real database', () => {
  afterAll(async () => {
    await deleteV2IdentitiesForTest(db, {
      accountIds,
      profileIds,
    });
  });

  it('is idempotent under concurrent create, defer, and re-check start calls', async () => {
    const fixture = await seedFixture('concurrency');
    const sourceSessionId = await seedSourceSession(fixture);
    const createInput = {
      ...fixture,
      topicId: null,
      sourceSessionId,
      concept: 'Changing signs across the equals sign',
      correctionHint: 'Apply the inverse operation to both sides.',
    };

    const created = await Promise.all([
      acceptMentorNotice(db, createInput),
      acceptMentorNotice(db, createInput),
    ]);
    expect(created.filter(Boolean)).toHaveLength(1);
    const noticeId = created.find(Boolean)!.id;

    const occurredAt = new Date('2026-07-19T12:00:00.000Z');
    const learningDayStart = new Date('2026-07-19T04:00:00.000Z');
    const deferred = await Promise.all([
      applyMentorNoticeOutcome(db, {
        profileId: fixture.profileId,
        noticeId,
        outcome: 'deferred',
        occurredAt,
        learningDayStart,
      }),
      applyMentorNoticeOutcome(db, {
        profileId: fixture.profileId,
        noticeId,
        outcome: 'deferred',
        occurredAt: new Date(occurredAt.getTime() + 1_000),
        learningDayStart,
      }),
    ]);
    const deferredAt = deferred[0]?.lastDeferredAt?.getTime();
    expect(deferredAt).toBeDefined();
    expect(deferred[1]?.lastDeferredAt?.getTime()).toBe(deferredAt);
    expect([occurredAt.getTime(), occurredAt.getTime() + 1_000]).toContain(
      deferredAt,
    );

    const [afterDefer] = await db
      .select()
      .from(mentorNotices)
      .where(eq(mentorNotices.id, noticeId));
    expect(afterDefer).toMatchObject({
      status: 'open',
      nudgeStatus: 'suppressed',
      lastRecheckOutcome: 'deferred',
      recheckAttemptCount: 0,
    });

    const starts = await Promise.all([
      startMentorNoticeRecheck(db, fixture.profileId, noticeId),
      startMentorNoticeRecheck(db, fixture.profileId, noticeId),
    ]);
    expect(starts[0]?.sessionId).toBe(starts[1]?.sessionId);
    const recheckSessionId = starts[0]!.sessionId;
    const activeSessions = await db
      .select({ id: learningSessions.id })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.profileId, fixture.profileId),
          eq(learningSessions.status, 'active'),
        ),
      );
    expect(activeSessions).toEqual([{ id: recheckSessionId }]);
    const startsForSession = await db
      .select({ id: sessionEvents.id })
      .from(sessionEvents)
      .where(
        and(
          eq(sessionEvents.sessionId, recheckSessionId),
          eq(sessionEvents.eventType, 'session_start'),
        ),
      );
    expect(startsForSession).toHaveLength(1);
    expect(
      getCapturedInngestEvents().filter(
        (event) => event.name === 'app/notice.recheck_started',
      ),
    ).toEqual([
      {
        name: 'app/notice.recheck_started',
        ts: expect.any(Number),
        data: {
          noticeId,
          profileId: fixture.profileId,
          sessionId: recheckSessionId,
        },
      },
    ]);
  });

  it('keeps terminal outcomes immutable and exposes the funnel fields', async () => {
    const fixture = await seedFixture('terminal');
    const sourceSessionId = await seedSourceSession(fixture);
    const notice = await acceptMentorNotice(db, {
      ...fixture,
      topicId: null,
      sourceSessionId,
      concept: 'Changing signs across the equals sign',
      correctionHint: null,
    });
    if (!notice) throw new Error('notice insert failed');
    const occurredAt = new Date();

    const locked = await applyMentorNoticeOutcome(db, {
      profileId: fixture.profileId,
      noticeId: notice.id,
      outcome: 'locked_in',
      occurredAt,
    });
    expect(locked).toMatchObject({
      status: 'locked_in',
      lastRecheckOutcome: 'locked_in',
      recheckAttemptCount: 1,
    });
    expect(locked!.lastRecheckAt!.getTime()).toBeLessThanOrEqual(
      locked!.createdAt.getTime() + 48 * 60 * 60 * 1_000,
    );

    await expect(
      applyMentorNoticeOutcome(db, {
        profileId: fixture.profileId,
        noticeId: notice.id,
        outcome: 'dismissed',
      }),
    ).resolves.toBeNull();
    const [preserved] = await db
      .select()
      .from(mentorNotices)
      .where(eq(mentorNotices.id, notice.id));
    expect(preserved).toMatchObject({
      status: 'locked_in',
      lastRecheckOutcome: 'locked_in',
      recheckAttemptCount: 1,
    });
    const events = getCapturedInngestEvents();
    expect(events).toEqual([
      {
        name: 'app/notice.created',
        ts: expect.any(Number),
        data: { noticeId: notice.id, profileId: fixture.profileId },
      },
      {
        name: 'app/notice.recheck_outcome',
        ts: expect.any(Number),
        data: {
          noticeId: notice.id,
          profileId: fixture.profileId,
          outcome: 'locked_in',
        },
      },
    ]);
    expect(JSON.stringify(events)).not.toMatch(
      /Changing signs|correctionHint|learnerQuote|message/i,
    );
  });

  // [WI-2501] Root cause: applyMentorNoticeOutcome recorded 'not_yet' but
  // mapped the row back to status='open', so every open-notice reader
  // (offer, Now-feed, re-check-context) remained eligible to re-offer a
  // completed record. A completed not_yet re-check must move to its own
  // canonical terminal status — never 'open', never mistaken for
  // 'locked_in'/'dismissed' mastery or dismissal — atomically and
  // idempotently, exactly like the locked_in/dismissed transition above.
  it('terminalizes a completed not_yet re-check atomically, hides it from every open reader, and stays idempotent', async () => {
    const fixture = await seedFixture('not-yet-terminal');
    const sourceSessionId = await seedSourceSession(fixture);
    const notice = await acceptMentorNotice(db, {
      ...fixture,
      topicId: null,
      sourceSessionId,
      concept: 'Not-yet terminalization concept',
      correctionHint: null,
    });
    if (!notice) throw new Error('notice insert failed');

    // Genuinely offer the notice into a real re-check session BEFORE
    // terminalizing it, so the existing-id offer-context assertion below is
    // non-vacuous: lastOfferedSessionId must actually match this session, or
    // that branch would return null regardless of status and prove nothing.
    const recheckSessionId = await seedSourceSession(fixture);
    const stamped = await stampMentorNoticeOffer(db, {
      profileId: fixture.profileId,
      noticeId: notice.id,
      sessionId: recheckSessionId,
    });
    expect(stamped).not.toBeNull();

    const occurredAt = new Date();
    const resolved = await applyMentorNoticeOutcome(db, {
      profileId: fixture.profileId,
      noticeId: notice.id,
      outcome: 'not_yet',
      occurredAt,
    });
    expect(resolved).toMatchObject({
      status: 'not_yet',
      lastRecheckOutcome: 'not_yet',
      recheckAttemptCount: 1,
    });
    expect(resolved!.resolvedAt?.getTime()).toBe(occurredAt.getTime());

    // Clause 3 — no open-offer / re-check-context query returns the
    // now-terminal record. Neither offer path (no existing metadata → the
    // natural-resurfacing branch; the real offer stamped above → the
    // existing-id branch) can find it, because both filter on status='open'.
    await expect(
      resolveMentorNoticeRecheckContext(db, fixture.profileId, {
        id: generateUUIDv7(),
        subjectId: fixture.subjectId,
        exchangeCount: 5,
        metadata: null,
      }),
    ).resolves.toBeNull();
    await expect(
      resolveMentorNoticeRecheckContext(db, fixture.profileId, {
        id: recheckSessionId,
        subjectId: fixture.subjectId,
        exchangeCount: 1,
        metadata: { recheckNoticeId: notice.id },
      }),
    ).resolves.toBeNull();

    // Clause 3 — no Now-feed query returns it either: neither the open
    // mentor_notice offer card nor the locked_in celebration moment (the
    // not_yet record is neither open nor locked_in).
    const feed = await buildNowFeed(db, fixture.profileId, 'self', {
      mentorNoticeEnabled: true,
    });
    expect(
      feed.cards.some(
        (card) =>
          card.kind === 'mentor_notice' ||
          (card.kind === 'ledger_moment' &&
            (card.params as { ledgerKind?: string } | undefined)?.ledgerKind ===
              'notice_locked_in'),
      ),
    ).toBe(false);

    // Clause 2 — idempotent retry: the winning transition already moved the
    // row off status='open', so a same-outcome retry finds no open row to
    // update and must not double-increment the attempt count or re-emit the
    // lifecycle event.
    await expect(
      applyMentorNoticeOutcome(db, {
        profileId: fixture.profileId,
        noticeId: notice.id,
        outcome: 'not_yet',
        occurredAt: new Date(occurredAt.getTime() + 1_000),
      }),
    ).resolves.toBeNull();
    const [afterRetry] = await db
      .select()
      .from(mentorNotices)
      .where(eq(mentorNotices.id, notice.id));
    expect(afterRetry).toMatchObject({
      status: 'not_yet',
      recheckAttemptCount: 1,
    });
    expect(afterRetry!.resolvedAt?.getTime()).toBe(occurredAt.getTime());
    const outcomeEvents = getCapturedInngestEvents().filter(
      (event) => event.name === 'app/notice.recheck_outcome',
    );
    expect(outcomeEvents).toHaveLength(1);

    // Clause 2 — competing/concurrent terminal submissions on a SEPARATE
    // fresh notice cannot double-increment, emit twice, or overwrite the
    // winner: exactly one of a racing locked_in/not_yet pair survives.
    const raceSourceSessionId = await seedSourceSession(fixture);
    const raceNotice = await acceptMentorNotice(db, {
      ...fixture,
      topicId: null,
      sourceSessionId: raceSourceSessionId,
      concept: 'Not-yet terminalization race concept',
      correctionHint: null,
    });
    if (!raceNotice) throw new Error('race notice insert failed');

    const raced = await Promise.all([
      applyMentorNoticeOutcome(db, {
        profileId: fixture.profileId,
        noticeId: raceNotice.id,
        outcome: 'not_yet',
      }),
      applyMentorNoticeOutcome(db, {
        profileId: fixture.profileId,
        noticeId: raceNotice.id,
        outcome: 'locked_in',
      }),
    ]);
    const winners = raced.filter((r) => r !== null);
    expect(winners).toHaveLength(1);
    const winner = winners[0]!;
    expect(['not_yet', 'locked_in']).toContain(winner.status);

    const [afterRace] = await db
      .select()
      .from(mentorNotices)
      .where(eq(mentorNotices.id, raceNotice.id));
    expect(afterRace).toMatchObject({
      status: winner.status,
      lastRecheckOutcome: winner.status,
      recheckAttemptCount: 1,
    });
    expect(
      getCapturedInngestEvents().filter(
        (event) =>
          event.name === 'app/notice.recheck_outcome' &&
          (event.data as { noticeId?: string }).noticeId === raceNotice.id,
      ),
    ).toHaveLength(1);
  });

  it('atomically reserves one review-family slot and suppresses stale notices', async () => {
    const fixture = await seedFixture('reservation-fade');
    const sourceSessionId = await seedSourceSession(fixture);
    const notice = await acceptMentorNotice(db, {
      ...fixture,
      topicId: null,
      sourceSessionId,
      concept: 'Changing signs across the equals sign',
      correctionHint: null,
    });
    if (!notice) throw new Error('notice insert failed');
    const now = new Date();
    const reservations = await Promise.all([
      reserveMentorNoticeNudge(db, {
        profileId: fixture.profileId,
        noticeId: notice.id,
        localDayStart: new Date(now.getTime() - 12 * 60 * 60 * 1_000),
        now,
      }),
      reserveMentorNoticeNudge(db, {
        profileId: fixture.profileId,
        noticeId: notice.id,
        localDayStart: new Date(now.getTime() - 12 * 60 * 60 * 1_000),
        now,
      }),
    ]);
    expect(reservations.filter(Boolean)).toHaveLength(1);
    const logs = await db
      .select({ id: notificationLog.id })
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.profileId, fixture.profileId),
          eq(notificationLog.type, 'notice_recheck'),
        ),
      );
    expect(logs).toHaveLength(1);

    const staleCreatedAt = new Date(now.getTime() - 22 * 24 * 60 * 60 * 1_000);
    await db
      .update(mentorNotices)
      .set({ createdAt: staleCreatedAt, nudgeStatus: 'pending' })
      .where(eq(mentorNotices.id, notice.id));
    await expect(
      fadeStaleMentorNotices(
        db,
        new Date(now.getTime() - 21 * 24 * 60 * 60 * 1_000),
      ),
    ).resolves.toBeGreaterThanOrEqual(1);
    const [faded] = await db
      .select()
      .from(mentorNotices)
      .where(eq(mentorNotices.id, notice.id));
    expect(faded).toMatchObject({ status: 'faded', nudgeStatus: 'suppressed' });
  });

  // [WI-2557] The learning day is local 04:00, not "now minus four absolute
  // hours". Chile moves -04 to -03 at 2026-09-06T04:00:00Z, so at 07:30Z the
  // learner's clock reads 04:30 on 2026-09-06 and the day began at
  // 2026-09-06T07:00:00Z. Subtracting four absolute hours lands at 03:30Z,
  // before the transition, whose local reading is 23:30 on 2026-09-05 — a
  // boundary 23 hours early. Both tests below flip on that difference.
  const SANTIAGO_NOW = new Date('2026-09-06T07:30:00.000Z');
  // Local 03:00 on 2026-09-06 — inside the PREVIOUS learning day.
  const PREVIOUS_LEARNING_DAY_INSTANT = new Date('2026-09-06T06:00:00.000Z');

  it('offers a notice deferred in the previous learning day across an offset transition', async () => {
    const fixture = await seedFixture('santiago-offer');
    await setOrganizationTimeZone(fixture.profileId, 'America/Santiago');
    expect(await getProfileTimeZone(db, fixture.profileId)).toBe(
      'America/Santiago',
    );

    const sourceSessionId = await seedSourceSession(fixture);
    const notice = await acceptMentorNotice(db, {
      ...fixture,
      topicId: null,
      sourceSessionId,
      concept: 'Changing signs across the equals sign',
      correctionHint: 'Apply the inverse operation to both sides.',
    });
    if (!notice) throw new Error('notice insert failed');

    // Deferred at local 03:00 on 2026-09-06 — the tail of the learning day
    // that started at local 04:00 on 2026-09-05 (2026-09-05T08:00:00Z).
    const deferred = await applyMentorNoticeOutcome(db, {
      profileId: fixture.profileId,
      noticeId: notice.id,
      outcome: 'deferred',
      occurredAt: PREVIOUS_LEARNING_DAY_INSTANT,
      learningDayStart: new Date('2026-09-05T08:00:00.000Z'),
    });
    expect(deferred?.lastDeferredAt).toEqual(PREVIOUS_LEARNING_DAY_INSTANT);

    const [session] = await db
      .insert(learningSessions)
      .values({
        profileId: fixture.profileId,
        subjectId: fixture.subjectId,
        sessionType: 'homework',
        status: 'active',
        exchangeCount: 1,
        startedAt: SANTIAGO_NOW,
      })
      .returning({ id: learningSessions.id });
    if (!session) throw new Error('session insert failed');

    // A new learning day has begun, so the deferral no longer suppresses the
    // notice and it is offered. Under the four-absolute-hour boundary the
    // deferral would still fall inside "today" and this returns null.
    await expect(
      resolveMentorNoticeRecheckContext(
        db,
        fixture.profileId,
        {
          id: session.id,
          subjectId: fixture.subjectId,
          exchangeCount: 1,
          metadata: null,
        },
        SANTIAGO_NOW,
      ),
    ).resolves.toMatchObject({ id: notice.id, exchangeNumber: 1 });

    const [offered] = await db
      .select({ lastOfferedSessionId: mentorNotices.lastOfferedSessionId })
      .from(mentorNotices)
      .where(eq(mentorNotices.id, notice.id));
    expect(offered?.lastOfferedSessionId).toBe(session.id);
  });

  // [WI-2573] Quarantined with the push machinery it covers — see itPostMvpPush
  // above. Introduced by WI-2557 (PR #2461) as SUPPLEMENTARY evidence; that
  // item's acceptance rests on its offer-eligibility sibling above, which is
  // retained MVP scope and still runs.
  itPostMvpPush(
    'reserves a nudge when the daily cap was filled in the previous learning day',
    async () => {
      const fixture = await seedFixture('santiago-nudge');
      await setOrganizationTimeZone(fixture.profileId, 'America/Santiago');
      expect(await getProfileTimeZone(db, fixture.profileId)).toBe(
        'America/Santiago',
      );

      const sourceSessionId = await seedSourceSession(fixture);
      const notice = await acceptMentorNotice(db, {
        ...fixture,
        topicId: null,
        sourceSessionId,
        concept: 'Changing signs across the equals sign',
        correctionHint: null,
      });
      if (!notice) throw new Error('notice insert failed');

      // Three sends at local 02:00, 02:30 and 03:00 on 2026-09-06 — the whole
      // daily budget, but spent in the PREVIOUS learning day. The type is
      // outside REVIEW_FAMILY_DEDUP_TYPES so the rolling 24-hour family limit
      // (which is not learning-day scoped) cannot mask the boundary.
      await db.insert(notificationLog).values(
        [
          '2026-09-06T05:00:00.000Z',
          '2026-09-06T05:30:00.000Z',
          '2026-09-06T06:00:00.000Z',
        ].map((sentAt) => ({
          profileId: fixture.profileId,
          type: 'weekly_progress' as const,
          sentAt: new Date(sentAt),
        })),
      );

      // The Inngest nudge-send function derives the boundary exactly this way.
      const localDayStart = getLearningDayStart(
        SANTIAGO_NOW,
        await getProfileTimeZone(db, fixture.profileId),
      );

      // Today's budget is untouched, so the reservation succeeds. Under the
      // four-absolute-hour boundary all three sends count as "today" and the
      // three-per-day cap refuses it.
      await expect(
        reserveMentorNoticeNudge(db, {
          profileId: fixture.profileId,
          noticeId: notice.id,
          localDayStart,
          now: SANTIAGO_NOW,
        }),
      ).resolves.toBe(true);

      const reserved = await db
        .select({ id: notificationLog.id })
        .from(notificationLog)
        .where(
          and(
            eq(notificationLog.profileId, fixture.profileId),
            eq(notificationLog.type, 'notice_recheck'),
          ),
        );
      expect(reserved).toHaveLength(1);
      const [afterReserve] = await db
        .select({ nudgeStatus: mentorNotices.nudgeStatus })
        .from(mentorNotices)
        .where(eq(mentorNotices.id, notice.id));
      expect(afterReserve?.nudgeStatus).toBe('pending');
    },
  );
});
