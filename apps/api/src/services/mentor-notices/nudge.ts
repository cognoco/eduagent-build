import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  membership,
  mentorNotices,
  notificationLog,
  notificationPreferences,
  organization,
  person,
  subjects,
  type Database,
} from '@eduagent/database';

import {
  MAX_DAILY_PUSH,
  REVIEW_FAMILY_DEDUP_TYPES,
  sendPushNotification,
} from '../notifications';
import { safeSend } from '../safe-non-core';
import { inngest } from '../../inngest/client';
import { consentGateSatisfiedSql } from '../identity-v2/consent-status-v2';

export async function findEligibleMentorNoticeNudges(db: Database) {
  return db
    .select({
      noticeId: mentorNotices.id,
      profileId: mentorNotices.profileId,
    })
    .from(mentorNotices)
    .innerJoin(person, eq(person.id, mentorNotices.profileId))
    .innerJoin(membership, eq(membership.personId, person.id))
    .innerJoin(organization, eq(organization.id, membership.organizationId))
    .innerJoin(
      notificationPreferences,
      and(
        eq(notificationPreferences.profileId, person.id),
        eq(notificationPreferences.pushEnabled, true),
        eq(notificationPreferences.reviewReminders, true),
      ),
    )
    .where(
      and(
        isNull(person.archivedAt),
        eq(mentorNotices.status, 'open'),
        eq(mentorNotices.nudgeStatus, 'pending'),
        consentGateSatisfiedSql(sql`${person.id}`),
        sql`(now() at time zone coalesce(${organization.timezone}, 'UTC'))::time >= time '16:00'`,
        sql`(now() at time zone coalesce(${organization.timezone}, 'UTC'))::time < time '17:00'`,
        sql`((now() at time zone coalesce(${organization.timezone}, 'UTC')) - interval '4 hours')::date = (((${mentorNotices.createdAt} at time zone coalesce(${organization.timezone}, 'UTC')) - interval '4 hours')::date + 1)`,
      ),
    )
    .limit(500);
}

export async function reserveMentorNoticeNudge(
  db: Database,
  input: {
    profileId: string;
    noticeId: string;
    localDayStart: Date;
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Database;
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`notification:${input.profileId}`}, 0))`,
    );
    const [notice] = await tx
      .select({ id: mentorNotices.id })
      .from(mentorNotices)
      .where(
        and(
          eq(mentorNotices.id, input.noticeId),
          eq(mentorNotices.profileId, input.profileId),
          eq(mentorNotices.status, 'open'),
          eq(mentorNotices.nudgeStatus, 'pending'),
        ),
      )
      .limit(1)
      .for('update');
    if (!notice) return false;

    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [counts] = await tx
      .select({
        family: sql<number>`count(*) filter (where ${notificationLog.type} in (${sql.join(
          REVIEW_FAMILY_DEDUP_TYPES.map((type) => sql`${type}`),
          sql`, `,
        )}) and ${notificationLog.sentAt} >= ${dayAgo})::int`,
        daily: sql<number>`count(*) filter (where ${notificationLog.sentAt} >= ${input.localDayStart})::int`,
      })
      .from(notificationLog)
      .where(eq(notificationLog.profileId, input.profileId));
    if ((counts?.family ?? 0) >= 1 || (counts?.daily ?? 0) >= MAX_DAILY_PUSH) {
      await tx
        .update(mentorNotices)
        .set({ nudgeStatus: 'skipped' })
        .where(
          and(
            eq(mentorNotices.id, input.noticeId),
            eq(mentorNotices.profileId, input.profileId),
            eq(mentorNotices.nudgeStatus, 'pending'),
          ),
        );
      return false;
    }
    await tx.insert(notificationLog).values({
      profileId: input.profileId,
      type: 'notice_recheck',
      sentAt: now,
    });
    return true;
  });
}

export async function sendReservedMentorNoticeNudge(
  db: Database,
  input: { profileId: string; noticeId: string },
) {
  const [notice] = await db
    .select({
      id: mentorNotices.id,
      subjectId: mentorNotices.subjectId,
      subjectName: subjects.name,
    })
    .from(mentorNotices)
    .innerJoin(subjects, eq(subjects.id, mentorNotices.subjectId))
    .where(
      and(
        eq(mentorNotices.id, input.noticeId),
        eq(mentorNotices.profileId, input.profileId),
        eq(subjects.profileId, input.profileId),
        eq(mentorNotices.status, 'open'),
        eq(mentorNotices.nudgeStatus, 'pending'),
      ),
    )
    .limit(1);
  if (!notice) return { sent: false, reason: 'suppressed' as const };

  const result = await sendPushNotification(
    db,
    {
      profileId: input.profileId,
      title: `A quick ${notice.subjectName} check`,
      body: 'Your mentor noticed one small idea worth revisiting.',
      type: 'notice_recheck',
      data: { noticeId: notice.id, subjectId: notice.subjectId },
    },
    { skipRateLimitLog: true, skipDailyCap: true },
  );
  const nextStatus = result.sent ? 'sent' : 'skipped';
  const [updated] = await db
    .update(mentorNotices)
    .set({
      nudgeStatus: nextStatus,
      ...(result.sent ? { nudgedAt: new Date() } : {}),
    })
    .where(
      and(
        eq(mentorNotices.id, input.noticeId),
        eq(mentorNotices.profileId, input.profileId),
        eq(mentorNotices.nudgeStatus, 'pending'),
      ),
    )
    .returning({ id: mentorNotices.id });
  if (result.sent && updated) {
    await safeSend(
      () =>
        inngest.send({
          // orphan-allow: observability-only lifecycle marker; no in-process handler.
          name: 'app/notice.nudge_sent',
          data: { noticeId: input.noticeId, profileId: input.profileId },
        }),
      'notice.nudge_sent',
      input,
    );
  }
  return result;
}
