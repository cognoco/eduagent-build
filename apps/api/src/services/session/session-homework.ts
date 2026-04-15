// ---------------------------------------------------------------------------
// Session Homework — homework state sync and tracking metadata
// ---------------------------------------------------------------------------

import { eq, and } from 'drizzle-orm';
import {
  learningSessions,
  sessionEvents,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type {
  HomeworkStateSyncInput,
  HomeworkSessionMetadata,
  SessionMetadata,
} from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HomeworkTrackingMetadata = SessionMetadata & {
  homework?: HomeworkSessionMetadata & {
    loggedCorrectionIds?: string[];
    loggedStartedProblemIds?: string[];
    loggedCompletedProblemIds?: string[];
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getHomeworkTrackingMetadata(
  metadata: unknown
): HomeworkTrackingMetadata {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return metadata as HomeworkTrackingMetadata;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

export async function syncHomeworkState(
  db: Database,
  profileId: string,
  sessionId: string,
  input: HomeworkStateSyncInput
): Promise<{ metadata: HomeworkSessionMetadata }> {
  const repo = createScopedRepository(db, profileId);
  const row = await repo.sessions.findFirst(eq(learningSessions.id, sessionId));
  if (!row) {
    throw new Error('Session not found');
  }
  if (row.sessionType !== 'homework') {
    throw new Error(
      'Homework state sync is only available for homework sessions'
    );
  }

  const existingMetadata = getHomeworkTrackingMetadata(row.metadata);
  const existingHomework = existingMetadata.homework;
  const loggedCorrectionIds = new Set(existingHomework?.loggedCorrectionIds);
  const loggedStartedProblemIds = new Set(
    existingHomework?.loggedStartedProblemIds
  );
  const loggedCompletedProblemIds = new Set(
    existingHomework?.loggedCompletedProblemIds
  );

  const eventsToInsert: Array<typeof sessionEvents.$inferInsert> = [];

  input.metadata.problems.forEach((problem, index) => {
    const text = problem.text.trim();
    const originalText = problem.originalText?.trim();

    if (
      problem.source === 'ocr' &&
      originalText &&
      originalText !== text &&
      !loggedCorrectionIds.has(problem.id)
    ) {
      loggedCorrectionIds.add(problem.id);
      eventsToInsert.push({
        sessionId,
        profileId,
        subjectId: row.subjectId,
        topicId: row.topicId ?? undefined,
        eventType: 'ocr_correction' as const,
        content: text,
        metadata: {
          problemId: problem.id,
          problemIndex: index,
          originalText,
          correctedText: text,
        },
      });
    }

    if (
      problem.status === 'active' &&
      !loggedStartedProblemIds.has(problem.id)
    ) {
      loggedStartedProblemIds.add(problem.id);
      eventsToInsert.push({
        sessionId,
        profileId,
        subjectId: row.subjectId,
        topicId: row.topicId ?? undefined,
        eventType: 'homework_problem_started' as const,
        content: text,
        metadata: {
          problemId: problem.id,
          problemIndex: index,
          selectedMode: problem.selectedMode ?? null,
        },
      });
    }

    if (
      problem.status === 'completed' &&
      !loggedCompletedProblemIds.has(problem.id)
    ) {
      loggedCompletedProblemIds.add(problem.id);
      eventsToInsert.push({
        sessionId,
        profileId,
        subjectId: row.subjectId,
        topicId: row.topicId ?? undefined,
        eventType: 'homework_problem_completed' as const,
        content: text,
        metadata: {
          problemId: problem.id,
          problemIndex: index,
          selectedMode: problem.selectedMode ?? null,
        },
      });
    }
  });

  const now = new Date();
  const nextHomeworkMetadata = {
    ...input.metadata,
    loggedCorrectionIds: [...loggedCorrectionIds],
    loggedStartedProblemIds: [...loggedStartedProblemIds],
    loggedCompletedProblemIds: [...loggedCompletedProblemIds],
  };

  await db
    .update(learningSessions)
    .set({
      metadata: {
        ...existingMetadata,
        homework: nextHomeworkMetadata,
      },
      updatedAt: now,
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId)
      )
    );

  if (eventsToInsert.length > 0) {
    await db.insert(sessionEvents).values(eventsToInsert);
  }

  // BD-04: return enriched metadata with accumulated tracking IDs, not raw input
  return { metadata: nextHomeworkMetadata };
}
