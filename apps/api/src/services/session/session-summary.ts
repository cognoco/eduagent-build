// ---------------------------------------------------------------------------
// Session Summary — get, skip, and submit session summaries
// ---------------------------------------------------------------------------

import { eq, and, sql } from 'drizzle-orm';
import {
  curriculumBooks,
  curriculumTopics,
  sessionSummaries,
  subjects,
  type Database,
} from '@eduagent/database';
import {
  ConflictError,
  type SessionSummary,
  type SummarySubmitInput,
} from '@eduagent/schemas';
import { createPendingSessionSummary, evaluateSummary } from '../summaries';
import { getSubject } from '../subject';
import { applyReflectionMultiplier, getSessionXpEntry } from '../xp';
import { createLogger } from '../logger';
import { captureException } from '../sentry';
import { createNoteForSession } from '../notes';
import { getSession } from './session-crud';
import { findSessionSummaryRow, mapSummaryRow } from './session-events';

const logger = createLogger();

export async function getSessionSummary(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<SessionSummary | null> {
  const row = await findSessionSummaryRow(db, profileId, sessionId);
  if (!row) {
    return null;
  }

  const xpInfo = await getSessionXpEntry(db, profileId, sessionId);
  const summary = mapSummaryRow(row);
  const enrichedSummary: SessionSummary = {
    ...summary,
    baseXp: xpInfo?.baseXp ?? null,
    reflectionBonusXp: xpInfo?.reflectionBonusXp ?? null,
  };
  if (!row.nextTopicId) {
    return enrichedSummary;
  }

  // Scope the next-topic title lookup through subjects.profileId so a
  // hallucinated or cross-profile UUID can't leak a foreign topic title.
  const [topic] = await db
    .select({ title: curriculumTopics.title })
    .from(curriculumTopics)
    .innerJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
    .innerJoin(
      subjects,
      and(
        eq(curriculumBooks.subjectId, subjects.id),
        eq(subjects.profileId, profileId),
      ),
    )
    .where(eq(curriculumTopics.id, row.nextTopicId))
    .limit(1);

  return {
    ...enrichedSummary,
    nextTopicTitle: topic?.title ?? null,
  };
}

export async function skipSummary(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<{
  summary: {
    id: string;
    sessionId: string;
    content: string;
    aiFeedback: string | null;
    status: 'skipped' | 'submitted' | 'accepted';
  };
}> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const existing = await findSessionSummaryRow(db, profileId, sessionId);
  const existingStatus = existing?.status as
    | 'pending'
    | 'submitted'
    | 'accepted'
    | 'skipped'
    | 'auto_closed'
    | undefined;

  if (
    existing &&
    (existingStatus === 'submitted' || existingStatus === 'accepted')
  ) {
    return {
      summary: {
        id: existing.id,
        sessionId: existing.sessionId,
        content: existing.content ?? '',
        aiFeedback: existing.aiFeedback ?? null,
        status: existingStatus,
      },
    };
  }

  const row = await createPendingSessionSummary(
    db,
    sessionId,
    profileId,
    session.topicId ?? null,
    'skipped',
  );

  return {
    summary: {
      id: row.id,
      sessionId: row.sessionId,
      content: row.content ?? '',
      aiFeedback: row.aiFeedback ?? null,
      status: 'skipped',
    },
  };
}

export async function submitSummary(
  db: Database,
  profileId: string,
  sessionId: string,
  input: SummarySubmitInput,
): Promise<{
  summary: {
    id: string;
    sessionId: string;
    content: string;
    aiFeedback: string;
    status: 'accepted' | 'submitted';
    baseXp: number | null;
    reflectionBonusXp: number | null;
  };
}> {
  // Fetch session for topicId and subject name
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }
  const subject = await getSubject(db, profileId, session.subjectId);

  // Evaluate summary via LLM
  const evaluation = await evaluateSummary(
    subject?.name ?? 'Unknown topic',
    'Session learning content',
    input.content,
  );

  const finalStatus = evaluation.isAccepted ? 'accepted' : 'submitted';

  // [CR-2026-05-19-M3] SITE 1: Wrap the existence-check + INSERT/UPDATE +
  // applyReflectionMultiplier in a single transaction with a per-session
  // advisory lock. Two concurrent submitSummary calls for the same session
  // both pass the pre-tx findSessionSummaryRow check (both see "no summary"),
  // both insert, and applyReflectionMultiplier runs twice → doubled XP.
  // The advisory lock serialises concurrent calls; the second waits, then
  // sees the already-submitted row and returns it idempotently.
  // Known Drizzle pattern: PgTransaction → Database cast
  // (see feedback_drizzle_transaction_cast.md).
  const { finalRow, xpInfo } = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    // Per-session advisory lock — prevents concurrent submits from both
    // passing the existence check and double-inserting / double-multiplying.
    const lockKey = `session-summary:${profileId}:${sessionId}`;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );

    const now = new Date();
    let row: typeof sessionSummaries.$inferSelect;

    const existingInTx = await findSessionSummaryRow(
      txDb,
      profileId,
      sessionId,
    );

    if (existingInTx) {
      // Idempotent path: summary already exists (concurrent or prior submission).
      // If it was already accepted/submitted, return as-is without re-running
      // the multiplier or re-writing the row.
      if (
        existingInTx.status === 'accepted' ||
        existingInTx.status === 'submitted'
      ) {
        const xpInfoIdempotent = await getSessionXpEntry(
          txDb,
          profileId,
          sessionId,
        );
        return { finalRow: existingInTx, xpInfo: xpInfoIdempotent };
      }

      await tx
        .update(sessionSummaries)
        .set({
          topicId: existingInTx.topicId ?? session.topicId ?? null,
          content: input.content,
          aiFeedback: evaluation.feedback,
          status: finalStatus,
          updatedAt: now,
        })
        .where(
          and(
            eq(sessionSummaries.id, existingInTx.id),
            eq(sessionSummaries.profileId, profileId),
          ),
        );

      row = {
        ...existingInTx,
        topicId: existingInTx.topicId ?? session.topicId ?? null,
        content: input.content,
        aiFeedback: evaluation.feedback,
        status: finalStatus,
        updatedAt: now,
      };
    } else {
      const [inserted] = await tx
        .insert(sessionSummaries)
        .values({
          sessionId,
          profileId,
          topicId: session.topicId ?? null,
          content: input.content,
          aiFeedback: evaluation.feedback,
          status: finalStatus,
        })
        .returning();

      if (!inserted)
        throw new Error('Insert session summary did not return a row');
      row = inserted;
    }

    await applyReflectionMultiplier(txDb, profileId, sessionId);
    const xpInfoTx = await getSessionXpEntry(txDb, profileId, sessionId);

    return { finalRow: row, xpInfo: xpInfoTx };
  });

  if (session.topicId) {
    try {
      await createNoteForSession(db, {
        profileId,
        topicId: session.topicId,
        sessionId,
        content: input.content,
      });
    } catch (err) {
      // Cap-reached is expected (50 notes per topic) — log at info, don't
      // page Sentry. Any other error is unexpected and worth capturing.
      if (err instanceof ConflictError) {
        logger.info(
          '[submitSummary] Auto-note skipped — topic note cap reached',
          {
            sessionId,
            topicId: session.topicId,
          },
        );
      } else {
        logger.error('[submitSummary] Note creation failed (non-fatal)', {
          sessionId,
          topicId: session.topicId,
          error: err instanceof Error ? err.message : String(err),
        });
        captureException(err, {
          profileId,
          extra: {
            site: 'submitSummary.autoNoteCreation',
            sessionId,
            topicId: session.topicId,
          },
        });
      }
    }
  }

  return {
    summary: {
      id: finalRow.id,
      sessionId: finalRow.sessionId,
      content: finalRow.content ?? input.content,
      aiFeedback: (finalRow.aiFeedback ?? evaluation.feedback) as string,
      status: (finalRow.status === 'accepted' ? 'accepted' : 'submitted') as
        | 'accepted'
        | 'submitted',
      baseXp: xpInfo?.baseXp ?? null,
      reflectionBonusXp: xpInfo?.reflectionBonusXp ?? null,
    },
  };
}
