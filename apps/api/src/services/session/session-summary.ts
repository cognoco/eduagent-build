// ---------------------------------------------------------------------------
// Session Summary — get, skip, and submit session summaries
// ---------------------------------------------------------------------------

import { eq, and } from 'drizzle-orm';
import { sessionSummaries, type Database } from '@eduagent/database';
import type { SessionSummary, SummarySubmitInput } from '@eduagent/schemas';
import { createPendingSessionSummary, evaluateSummary } from '../summaries';
import { getSubject } from '../subject';
import { incrementSummarySkips, resetSummarySkips } from '../settings';
import { getSession } from './session-crud';
import { findSessionSummaryRow, mapSummaryRow } from './session-events';

export async function getSessionSummary(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<SessionSummary | null> {
  const row = await findSessionSummaryRow(db, profileId, sessionId);
  return row ? mapSummaryRow(row) : null;
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

  if (existingStatus !== 'skipped') {
    await incrementSummarySkips(db, profileId);
  }

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
  input: SummarySubmitInput
): Promise<{
  summary: {
    id: string;
    sessionId: string;
    content: string;
    aiFeedback: string;
    status: 'accepted' | 'submitted';
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

    finalRow = inserted!;
  }

  await resetSummarySkips(db, profileId);

  return {
    summary: {
      id: finalRow.id,
      sessionId: finalRow.sessionId,
      content: finalRow.content ?? input.content,
      aiFeedback: evaluation.feedback,
      status: finalStatus,
    },
  };
}
