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

/**
 * [WI-2625 rework] The ratified three-response re-check cap, single-sourced.
 *
 * Two readers, deliberately OPPOSITE comparisons — keep them complementary:
 *  - here (`exchangeNumber <= MAX`) GATES the re-check context: past the cap
 *    this ATTEMPT is over and the judge is never consulted again for it.
 *  - session-exchange.ts (`exchangeNumber >= MAX`) FIRES the cap, ending the
 *    attempt (see {@link detachMentorNoticeRecheckAttempt}) — and, only when
 *    the evaluator produced no usable verdict, terminalizing `not_yet`.
 * An off-by-one in the gate caps a turn early; one in the fire leaves the
 * attempt bookkeeping attached to a session that can never advance it — the
 * zombie-notice trap.
 */
export const MENTOR_NOTICE_RECHECK_MAX_EXCHANGES = 3;

export interface MentorNoticeRecheckContext {
  id: string;
  concept: string;
  correctionHint: string | null;
  exchangeNumber: number;
}

function metadataOf(session: SessionForNoticeOffer): Record<string, unknown> {
  return (session.metadata as Record<string, unknown> | null) ?? {};
}

/**
 * [WI-2625 rework] End the current re-check ATTEMPT without touching the
 * notice — the attempt lifecycle is separate bookkeeping from notice status
 * (ruled 2026-07-26).
 *
 * These two session-metadata keys ARE the attempt: they bind one notice to one
 * session and anchor the per-attempt exchange counter. Written here at offer
 * time and by `startMentorNoticeRecheck` (recheck.ts); removed here when the
 * attempt is over. Removing them is what keeps a still-`open` notice genuinely
 * re-offerable rather than trapped:
 *  - `startMentorNoticeRecheck` looks for an ACTIVE session carrying
 *    `recheckNoticeId` and hands it back; while the key survives on a session
 *    already past the cap, the learner is handed a session whose re-check
 *    context is permanently null. After detaching, it mints a FRESH session
 *    and a fresh attempt at exchange 1.
 *  - the natural-resurfacing branch below is likewise no longer short-circuited
 *    by an `existingId` it can never advance.
 *
 * The notice row is deliberately untouched — no status change, no outcome, no
 * attempt-count increment. A later re-offer is then governed by the ordinary
 * eligibility/cooldown rules alone (same-session re-offer of the SAME notice
 * still blocked by `lastOfferedSessionId`).
 *
 * Both keys are `.optional()` in the session-metadata schema
 * (packages/schemas/src/sessions.ts), so their absence is schema-valid; the
 * `-` operator removes exactly these keys and preserves everything else.
 */
export async function detachMentorNoticeRecheckAttempt(
  db: Database,
  input: { profileId: string; sessionId: string },
): Promise<void> {
  await db
    .update(learningSessions)
    .set({
      metadata: sql`coalesce(${learningSessions.metadata}, '{}'::jsonb) - 'recheckNoticeId'::text - 'recheckOfferExchangeCount'::text`,
    })
    .where(
      and(
        eq(learningSessions.id, input.sessionId),
        eq(learningSessions.profileId, input.profileId),
      ),
    );
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
    return exchangeNumber <= MENTOR_NOTICE_RECHECK_MAX_EXCHANGES
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
