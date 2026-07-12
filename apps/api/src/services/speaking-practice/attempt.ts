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
    // Best-effort attempt numbering (§ see plan doc) — not a gapless/race-proof
    // sequence, only an ordering signal; the UI allows one recording at a time
    // so concurrent submits for the same target are not the expected path.
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
    if (!inserted) {
      throw new Error('Speaking-practice attempt insert did not return a row');
    }
    return inserted;
  });

  return {
    attemptNumber: row.attemptNumber,
    lexicalMatchScore: row.lexicalMatchScore,
    missingWords: row.missingWords,
    extraWords: row.extraWords,
    isComplete: score.isComplete,
  };
}
