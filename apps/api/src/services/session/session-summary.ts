// ---------------------------------------------------------------------------
// Session Summary — get, skip, and submit session summaries
// ---------------------------------------------------------------------------

import { eq, and } from 'drizzle-orm';
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
import {
  getConsecutiveSummarySkips,
  incrementSummarySkips,
  resetSummarySkips,
} from '../settings';
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
  sessionId: string
): Promise<SessionSummary | null> {
  const row = await findSessionSummaryRow(db, profileId, sessionId);
  if (!row) {
    return null;
  }

  const xpInfo = await getSessionXpEntry(db, profileId, sessionId);
  const consecutiveSummarySkips = await getConsecutiveSummarySkips(
    db,
    profileId
  );
  const summary = mapSummaryRow(row);
  const enrichedSummary: SessionSummary = {
    ...summary,
    baseXp: xpInfo?.baseXp ?? null,
    reflectionBonusXp: xpInfo?.reflectionBonusXp ?? null,
    consecutiveSummarySkips,
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
        eq(subjects.profileId, profileId)
      )
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
  sessionId: string
): Promise<{
  summary: {
    id: string;
    sessionId: string;
    content: string;
    aiFeedback: string | null;
    status: 'skipped' | 'submitted' | 'accepted';
  };
  consecutiveSummarySkips?: number;
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
    'skipped'
  );

  let consecutiveSummarySkips: number | undefined;
  if (existingStatus !== 'skipped') {
    consecutiveSummarySkips = await incrementSummarySkips(db, profileId);
  }

  return {
    summary: {
      id: row.id,
      sessionId: row.sessionId,
      content: row.content ?? '',
      aiFeedback: row.aiFeedback ?? null,
      status: 'skipped',
    },
    ...(consecutiveSummarySkips != null ? { consecutiveSummarySkips } : {}),
  };
}

export async function submitSummary(
  db: Database,
  profileId: string,
  sessionId: string,
  input: SummarySubmitInput
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
    input.content
  );

  const finalStatus = evaluation.isAccepted ? 'accepted' : 'submitted';
  const existing = await findSessionSummaryRow(db, profileId, sessionId);
  const now = new Date();
  let finalRow: typeof sessionSummaries.$inferSelect;

  if (existing) {
    await db
      .update(sessionSummaries)
      .set({
        topicId: existing.topicId ?? session.topicId ?? null,
        content: input.content,
        aiFeedback: evaluation.feedback,
        status: finalStatus,
        updatedAt: now,
      })
      .where(
        and(
          eq(sessionSummaries.id, existing.id),
          eq(sessionSummaries.profileId, profileId)
        )
      );

    finalRow = {
      ...existing,
      topicId: existing.topicId ?? session.topicId ?? null,
      content: input.content,
      aiFeedback: evaluation.feedback,
      status: finalStatus,
      updatedAt: now,
    };
  } else {
    const [inserted] = await db
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
    finalRow = inserted;
  }

  await resetSummarySkips(db, profileId);
  await applyReflectionMultiplier(db, profileId, sessionId);
  const xpInfo = await getSessionXpEntry(db, profileId, sessionId);

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
          }
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
      aiFeedback: evaluation.feedback,
      status: finalStatus,
      baseXp: xpInfo?.baseXp ?? null,
      reflectionBonusXp: xpInfo?.reflectionBonusXp ?? null,
    },
  };
}
