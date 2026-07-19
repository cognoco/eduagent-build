import { and, eq, sql } from 'drizzle-orm';
import {
  learningSessions,
  mentorNotices,
  type Database,
} from '@eduagent/database';
import type {
  MentorNoticeDeferResponse,
  MentorNoticeRecheckResponse,
} from '@eduagent/schemas';

import { createSessionWithStartEvent } from '../session/session-crud';
import { applyMentorNoticeOutcome } from './state';
import { safeSend } from '../safe-non-core';
import { inngest } from '../../inngest/client';

export class MentorNoticeUnavailableError extends Error {
  constructor(public readonly reason: 'not_found' | 'terminal') {
    super(
      reason === 'not_found'
        ? 'Mentor notice not found'
        : 'Mentor notice is no longer open',
    );
    this.name = 'MentorNoticeUnavailableError';
  }
}

async function lockNotice(tx: Database, profileId: string, noticeId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${noticeId}, 0))`,
  );
  const [notice] = await tx
    .select()
    .from(mentorNotices)
    .where(
      and(
        eq(mentorNotices.id, noticeId),
        eq(mentorNotices.profileId, profileId),
      ),
    )
    .limit(1)
    .for('update');
  return notice ?? null;
}

export async function startMentorNoticeRecheck(
  db: Database,
  profileId: string,
  noticeId: string,
): Promise<MentorNoticeRecheckResponse> {
  const result = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Database;
    const notice = await lockNotice(tx, profileId, noticeId);
    if (!notice) throw new MentorNoticeUnavailableError('not_found');
    if (notice.status !== 'open') {
      throw new MentorNoticeUnavailableError('terminal');
    }

    const [active] = await tx
      .select({ id: learningSessions.id })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.profileId, profileId),
          eq(learningSessions.subjectId, notice.subjectId),
          eq(learningSessions.status, 'active'),
          sql`${learningSessions.metadata} @> ${JSON.stringify({ recheckNoticeId: noticeId })}::jsonb`,
        ),
      )
      .limit(1);
    if (active) return { sessionId: active.id, created: false };

    const session = await createSessionWithStartEvent(
      tx,
      profileId,
      notice.subjectId,
      {
        subjectId: notice.subjectId,
        sessionType: 'learning',
        inputMode: 'text',
        topicId: notice.topicId ?? undefined,
        metadata: { recheckNoticeId: notice.id },
      },
    );
    await tx
      .update(mentorNotices)
      .set({
        lastOfferedSessionId: session.id,
        lastOfferedAt: new Date(),
        offerCount: sql`${mentorNotices.offerCount} + 1`,
      })
      .where(
        and(
          eq(mentorNotices.id, notice.id),
          eq(mentorNotices.profileId, profileId),
          eq(mentorNotices.status, 'open'),
        ),
      );
    return { sessionId: session.id, created: true };
  });
  if (result.created) {
    await safeSend(
      () =>
        inngest.send({
          // orphan-allow: observability-only lifecycle marker; no in-process handler.
          name: 'app/notice.recheck_started',
          data: { noticeId, profileId, sessionId: result.sessionId },
        }),
      'notice.recheck_started',
      { profileId, noticeId, sessionId: result.sessionId },
    );
  }
  return { sessionId: result.sessionId };
}

export async function deferMentorNotice(
  db: Database,
  profileId: string,
  noticeId: string,
  input: { now?: Date; learningDayStart: Date },
): Promise<MentorNoticeDeferResponse> {
  const now = input.now ?? new Date();
  const notice = await applyMentorNoticeOutcome(db, {
    profileId,
    noticeId,
    outcome: 'deferred',
    occurredAt: now,
    learningDayStart: input.learningDayStart,
  });
  if (!notice) {
    const [existing] = await db
      .select({ status: mentorNotices.status })
      .from(mentorNotices)
      .where(
        and(
          eq(mentorNotices.id, noticeId),
          eq(mentorNotices.profileId, profileId),
        ),
      )
      .limit(1);
    throw new MentorNoticeUnavailableError(existing ? 'terminal' : 'not_found');
  }
  return {
    noticeId: notice.id,
    deferredAt: (notice.lastDeferredAt ?? now).toISOString(),
  };
}
