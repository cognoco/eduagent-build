import { and, eq } from 'drizzle-orm';
import {
  generateUUIDv7,
  learningSessions,
  mentorNotices,
  notificationLog,
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
  reserveMentorNoticeNudge,
  startMentorNoticeRecheck,
} from '../../apps/api/src/services/mentor-notices';
import { createIntegrationDb } from './helpers';
import { clearFetchCalls } from './fetch-interceptor';
import { getCapturedInngestEvents, mockInngestEvents } from './mocks';

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

afterAll(async () => {
  await deleteV2IdentitiesForTest(db, { accountIds, profileIds });
});

describe('mentor notice lifecycle — real database', () => {
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
});
