import { and, eq, sql } from 'drizzle-orm';
import {
  mentorNotices,
  notificationLog,
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
          name: 'app/notice.nudge_sent',
          data: { noticeId: input.noticeId, profileId: input.profileId },
        }),
      'notice.nudge_sent',
      input,
    );
  }
  return result;
}
