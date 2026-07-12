import { and, eq } from 'drizzle-orm';
import {
  SubjectNotFoundError,
  LearningSessionNotFoundError,
  type RecordSpeakingPracticeAttemptInput,
  type RecordSpeakingPracticeAttemptResponse,
} from '@eduagent/schemas';
import {
  createScopedRepository,
  learningSessions,
  subjects,
} from '@eduagent/database';
import type { Database } from '@eduagent/database';
import { scoreSpeakingPracticeAttempt } from './scoring';

// ---------------------------------------------------------------------------
// WI-1777: records a repeat-after-me/shadowing speaking-practice attempt.
// Deterministic server-side scoring is the source of truth (WI-1549 AC2) —
// the response returned here is the exact record persisted, never a
// separately-computed client-facing estimate.
// ---------------------------------------------------------------------------

// WI-1777 review rework (SHOULD_FIX): bound on the countByTarget-then-insert
// retry loop below. Each retry only fires when a concurrent submit won the
// race for the current attemptNumber slot — a handful of learners hammering
// the same target concurrently, never an unbounded contention scenario.
const MAX_ATTEMPT_NUMBER_RETRIES = 5;

export async function recordSpeakingPracticeAttempt(
  db: Database,
  profileId: string,
  input: RecordSpeakingPracticeAttemptInput,
): Promise<RecordSpeakingPracticeAttemptResponse> {
  // [SECURITY] Verify ownership of BOTH subjectId and sessionId before
  // writing anything — both are client-supplied. Without this, an attacker
  // could plant a speaking_practice_attempts row tagged with another
  // profile's subject or session (write-side IDOR), matching the dictation
  // precedent's rationale (apps/api/src/services/dictation/result.ts).
  const ownershipRepo = createScopedRepository(db, profileId);
  const subject = await ownershipRepo.subjects.findFirst(
    eq(subjects.id, input.subjectId),
  );
  if (!subject) {
    throw new SubjectNotFoundError();
  }
  // Also require the session to belong to the SAME subject as input.subjectId
  // — a profile can own two subjects, each with its own session, and without
  // this the independent ownership checks above would both pass for a
  // cross-subject (subjectId, sessionId) pair, persisting a row whose
  // denormalized subject_id doesn't match the session it's attached to.
  const session = await ownershipRepo.sessions.findFirst(
    and(
      eq(learningSessions.id, input.sessionId),
      eq(learningSessions.subjectId, input.subjectId),
    ),
  );
  if (!session) {
    throw new LearningSessionNotFoundError();
  }

  const score = scoreSpeakingPracticeAttempt(
    input.targetText,
    input.transcript,
  );

  const row = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    const repo = createScopedRepository(txDb, profileId);
    // attemptNumber is derived from a count-then-insert read, which races
    // under concurrent submits for the same (profile, session, targetText):
    // two submits can both read the same prior count and both try to insert
    // the same attemptNumber. The unique constraint on
    // (profileId, sessionId, targetText, attemptNumber) makes the losing
    // insert a no-op (onConflictDoNothing) instead of corrupting the numbering,
    // and we retry with a fresh count — by then the winner's row is visible,
    // so the retry reads the correct next attemptNumber.
    for (let retry = 0; retry < MAX_ATTEMPT_NUMBER_RETRIES; retry++) {
      const priorCount = await repo.speakingPracticeAttempts.countByTarget(
        input.sessionId,
        input.targetText,
      );
      const inserted = await repo.speakingPracticeAttempts.insert({
        sessionId: input.sessionId,
        subjectId: input.subjectId,
        mode: input.mode,
        targetText: input.targetText,
        transcript: input.transcript,
        locale: input.locale,
        attemptNumber: priorCount + 1,
        lexicalMatchScore: score.lexicalMatchScore,
        missingWords: score.missingWords,
        extraWords: score.extraWords,
      });
      if (inserted) return inserted;
    }
    throw new Error(
      `Speaking-practice attempt insert exhausted ${MAX_ATTEMPT_NUMBER_RETRIES} retries on attemptNumber conflict`,
    );
  });

  return {
    attemptNumber: row.attemptNumber,
    lexicalMatchScore: row.lexicalMatchScore,
    missingWords: row.missingWords,
    extraWords: row.extraWords,
    isComplete: score.isComplete,
  };
}
