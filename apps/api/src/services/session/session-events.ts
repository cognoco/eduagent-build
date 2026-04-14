// ---------------------------------------------------------------------------
// Session Events — event insertion, mappers, and event-related operations
// ---------------------------------------------------------------------------

import { eq, and } from 'drizzle-orm';
import {
  learningSessions,
  sessionEvents,
  sessionSummaries,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type {
  LearningSession,
  SessionSummary,
  SessionInputModeInput,
  InputMode,
  VerificationType,
  SessionMetadata,
} from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Mappers — Drizzle Date → API ISO string
// ---------------------------------------------------------------------------

export function mapSessionRow(
  row: typeof learningSessions.$inferSelect
): LearningSession {
  const metadata =
    row.metadata &&
    typeof row.metadata === 'object' &&
    !Array.isArray(row.metadata) &&
    Object.keys(row.metadata as Record<string, unknown>).length > 0
      ? (row.metadata as SessionMetadata)
      : undefined;
  const inputMode =
    (row.inputMode as InputMode) ?? metadata?.inputMode ?? 'text';

  return {
    id: row.id,
    subjectId: row.subjectId,
    topicId: row.topicId ?? null,
    sessionType: row.sessionType,
    inputMode,
    verificationType: (row.verificationType as VerificationType) ?? null,
    status: row.status,
    escalationRung: row.escalationRung,
    exchangeCount: row.exchangeCount,
    startedAt: row.startedAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds ?? null,
    wallClockSeconds: row.wallClockSeconds ?? null,
    rawInput: row.rawInput ?? null,
    ...(metadata ? { metadata } : {}),
  };
}

export function mapSummaryRow(
  row: typeof sessionSummaries.$inferSelect
): SessionSummary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    content: row.content ?? '',
    aiFeedback: row.aiFeedback ?? null,
    status: row.status,
  };
}

export async function findSessionSummaryRow(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<typeof sessionSummaries.$inferSelect | undefined> {
  const repo = createScopedRepository(db, profileId);
  return repo.sessionSummaries.findFirst(
    eq(sessionSummaries.sessionId, sessionId)
  );
}

// ---------------------------------------------------------------------------
// Event insertion
// ---------------------------------------------------------------------------

export type RecordableSessionEventType =
  | 'system_prompt'
  | 'quick_action'
  | 'user_feedback'
  | 'flag';

export async function insertSessionEvent(
  db: Database,
  session: LearningSession,
  profileId: string,
  input: {
    sessionId: string;
    eventType: RecordableSessionEventType;
    content: string;
    metadata?: Record<string, unknown>;
    touchSession?: boolean;
  }
): Promise<void> {
  await db.insert(sessionEvents).values({
    sessionId: input.sessionId,
    profileId,
    subjectId: session.subjectId,
    topicId: session.topicId,
    eventType: input.eventType,
    content: input.content,
    metadata: input.metadata ?? {},
  });

  if (!input.touchSession) {
    return;
  }

  await db
    .update(learningSessions)
    .set({
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningSessions.id, input.sessionId),
        eq(learningSessions.profileId, profileId)
      )
    );
}

export async function setSessionInputMode(
  db: Database,
  profileId: string,
  sessionId: string,
  input: SessionInputModeInput
): Promise<LearningSession> {
  const repo = createScopedRepository(db, profileId);
  const row = await repo.sessions.findFirst(eq(learningSessions.id, sessionId));
  if (!row) {
    throw new Error('Session not found');
  }

  const existingMetadata =
    row.metadata &&
    typeof row.metadata === 'object' &&
    !Array.isArray(row.metadata)
      ? (row.metadata as SessionMetadata)
      : {};

  const [updated] = await db
    .update(learningSessions)
    .set({
      inputMode: input.inputMode,
      metadata: {
        ...existingMetadata,
        inputMode: input.inputMode,
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId)
      )
    )
    .returning();

  if (!updated) {
    throw new Error('Session not found');
  }

  return mapSessionRow(updated);
}
