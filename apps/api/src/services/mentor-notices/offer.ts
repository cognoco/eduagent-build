import { and, asc, eq, isNull, lt, ne, or, sql } from 'drizzle-orm';
import {
  learningSessions,
  mentorNotices,
  type Database,
} from '@eduagent/database';

import { getLearningDayStart, getProfileTimeZone } from './learning-day';

interface SessionForNoticeOffer {
  id: string;
  subjectId: string;
  exchangeCount: number;
  metadata?: unknown;
}

export interface MentorNoticeRecheckContext {
  id: string;
  concept: string;
  correctionHint: string | null;
  exchangeNumber: number;
}

function metadataOf(session: SessionForNoticeOffer): Record<string, unknown> {
  return (session.metadata as Record<string, unknown> | null) ?? {};
}

export async function resolveMentorNoticeRecheckContext(
  db: Database,
  profileId: string,
  session: SessionForNoticeOffer,
  now = new Date(),
): Promise<MentorNoticeRecheckContext | null> {
  const metadata = metadataOf(session);
  const existingId =
    typeof metadata.recheckNoticeId === 'string'
      ? metadata.recheckNoticeId
      : null;
  const startCount =
    typeof metadata.recheckOfferExchangeCount === 'number'
      ? metadata.recheckOfferExchangeCount
      : 0;

  if (existingId) {
    const [notice] = await db
      .select()
      .from(mentorNotices)
      .where(
        and(
          eq(mentorNotices.id, existingId),
          eq(mentorNotices.profileId, profileId),
          eq(mentorNotices.status, 'open'),
          eq(mentorNotices.lastOfferedSessionId, session.id),
        ),
      )
      .limit(1);
    if (!notice) return null;
    if (
      notice.lastRecheckOutcome === 'deferred' &&
      notice.lastDeferredAt &&
      notice.lastOfferedAt &&
      notice.lastDeferredAt >= notice.lastOfferedAt
    ) {
      return null;
    }
    const exchangeNumber = session.exchangeCount - startCount + 1;
    return exchangeNumber <= 3
      ? {
          id: notice.id,
          concept: notice.concept,
          correctionHint: notice.correctionHint,
          exchangeNumber,
        }
      : null;
  }

  // Natural resurfacing never opens a session or interrupts its first turn.
  if (session.exchangeCount < 1) return null;

  const timezone = await getProfileTimeZone(db, profileId);
  const dayStart = getLearningDayStart(now, timezone);
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Database;
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${profileId}:${session.subjectId}`}, 0))`,
    );
    const [notice] = await tx
      .select()
      .from(mentorNotices)
      .where(
        and(
          eq(mentorNotices.profileId, profileId),
          eq(mentorNotices.subjectId, session.subjectId),
          eq(mentorNotices.status, 'open'),
          or(
            isNull(mentorNotices.lastDeferredAt),
            lt(mentorNotices.lastDeferredAt, dayStart),
          ),
          or(
            isNull(mentorNotices.lastOfferedSessionId),
            ne(mentorNotices.lastOfferedSessionId, session.id),
          ),
        ),
      )
      .orderBy(asc(mentorNotices.createdAt))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!notice) return null;

    await tx
      .update(mentorNotices)
      .set({
        lastOfferedSessionId: session.id,
        lastOfferedAt: now,
        offerCount: sql`${mentorNotices.offerCount} + 1`,
      })
      .where(
        and(
          eq(mentorNotices.id, notice.id),
          eq(mentorNotices.profileId, profileId),
          eq(mentorNotices.status, 'open'),
        ),
      );
    await tx
      .update(learningSessions)
      .set({
        metadata: sql`coalesce(${learningSessions.metadata}, '{}'::jsonb) || ${JSON.stringify(
          {
            recheckNoticeId: notice.id,
            recheckOfferExchangeCount: session.exchangeCount,
          },
        )}::jsonb`,
      })
      .where(
        and(
          eq(learningSessions.id, session.id),
          eq(learningSessions.profileId, profileId),
        ),
      );
    return {
      id: notice.id,
      concept: notice.concept,
      correctionHint: notice.correctionHint,
      exchangeNumber: 1,
    };
  });
}
