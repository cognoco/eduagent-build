// ---------------------------------------------------------------------------
// EVALUATE Data Service — DB-aware functions for EVALUATE verification
// Delegates pure logic to services/evaluate.ts
// FR128-133: Devil's Advocate verification
// ---------------------------------------------------------------------------

import { eq, and, desc } from 'drizzle-orm';
import {
  retentionCards,
  curriculumTopics,
  learningSessions,
  sessionEvents,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import {
  shouldTriggerEvaluate,
  handleEvaluateFailure,
  type EvaluateFailureAction,
} from './evaluate';
import type { EvaluateEligibility } from '@eduagent/schemas';

export type { EvaluateEligibility };

export interface EvaluateSessionState {
  sessionId: string;
  topicId: string;
  difficultyRung: 1 | 2 | 3 | 4;
  consecutiveFailures: number;
  lastFailureAction: EvaluateFailureAction | null;
}

// ---------------------------------------------------------------------------
// Eligibility check
// ---------------------------------------------------------------------------

/**
 * Checks whether a topic is eligible for EVALUATE verification.
 * Strong-retention gating: easeFactor >= 2.5, repetitions > 0 (FR129).
 */
export async function checkEvaluateEligibility(
  db: Database,
  profileId: string,
  topicId: string
): Promise<EvaluateEligibility> {
  const repo = createScopedRepository(db, profileId);

  // Look up the retention card
  const card = await repo.retentionCards.findFirst(
    eq(retentionCards.topicId, topicId)
  );

  // Look up topic title
  const topic = await db.query.curriculumTopics.findFirst({
    where: eq(curriculumTopics.id, topicId),
  });
  const topicTitle = topic?.title ?? topicId;

  if (!card) {
    return {
      eligible: false,
      topicId,
      topicTitle,
      currentRung: 1,
      easeFactor: 2.5,
      repetitions: 0,
      reason: 'No retention card exists for this topic',
    };
  }

  const easeFactor = card.easeFactor;
  const { repetitions } = card;
  const eligible = shouldTriggerEvaluate(easeFactor, repetitions);
  const currentRung = (card.evaluateDifficultyRung ?? 1) as 1 | 2 | 3 | 4;

  return {
    eligible,
    topicId,
    topicTitle,
    currentRung,
    easeFactor,
    repetitions,
    reason: eligible
      ? undefined
      : easeFactor < 2.5
      ? 'Ease factor below 2.5 — topic retention not strong enough'
      : 'No successful reviews yet',
  };
}

// ---------------------------------------------------------------------------
// Difficulty rung management
// ---------------------------------------------------------------------------

/**
 * Advances the EVALUATE difficulty rung on a retention card after a successful
 * challenge (caps at 4).
 */
export async function advanceEvaluateRung(
  db: Database,
  profileId: string,
  topicId: string
): Promise<1 | 2 | 3 | 4> {
  const repo = createScopedRepository(db, profileId);
  const card = await repo.retentionCards.findFirst(
    eq(retentionCards.topicId, topicId)
  );

  if (!card) return 1;

  const currentRung = (card.evaluateDifficultyRung ?? 1) as 1 | 2 | 3 | 4;
  const newRung = Math.min(4, currentRung + 1) as 1 | 2 | 3 | 4;

  await db
    .update(retentionCards)
    .set({
      evaluateDifficultyRung: newRung,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(retentionCards.id, card.id),
        eq(retentionCards.profileId, profileId)
      )
    );

  return newRung;
}

/**
 * Processes an EVALUATE failure using three-strike escalation (FR133):
 * 1st: reveal flaw, 2nd: lower difficulty, 3rd+: exit to standard review.
 *
 * Updates the retention card's evaluateDifficultyRung as needed.
 */
export async function processEvaluateFailureEscalation(
  db: Database,
  profileId: string,
  topicId: string,
  consecutiveFailures: number
): Promise<EvaluateFailureAction> {
  const repo = createScopedRepository(db, profileId);
  const card = await repo.retentionCards.findFirst(
    eq(retentionCards.topicId, topicId)
  );

  const currentRung = (card?.evaluateDifficultyRung ?? 1) as 1 | 2 | 3 | 4;
  const action = handleEvaluateFailure(consecutiveFailures, currentRung);

  if (card) {
    let newRung = currentRung;
    if (action.action === 'lower_difficulty' && action.newDifficultyRung) {
      newRung = action.newDifficultyRung;
    } else if (action.action === 'exit_to_standard') {
      // Reset to rung 1 for next EVALUATE attempt
      newRung = 1;
    }

    await db
      .update(retentionCards)
      .set({
        evaluateDifficultyRung: newRung,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(retentionCards.id, card.id),
          eq(retentionCards.profileId, profileId)
        )
      );
  }

  return action;
}

// ---------------------------------------------------------------------------
// Evaluate session state query
// ---------------------------------------------------------------------------

/**
 * Returns the EVALUATE-specific state for an active session.
 * Used by the client to display challenge mode UI and escalation status.
 */
export async function getEvaluateSessionState(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<EvaluateSessionState | null> {
  const repo = createScopedRepository(db, profileId);
  const session = await repo.sessions.findFirst(
    eq(learningSessions.id, sessionId)
  );

  if (!session || session.verificationType !== 'evaluate' || !session.topicId) {
    return null;
  }

  // Get the retention card for difficulty rung
  const card = await repo.retentionCards.findFirst(
    eq(retentionCards.topicId, session.topicId)
  );

  // C-01: compute actual consecutiveFailures from session events
  const evalEvents = await db.query.sessionEvents.findMany({
    where: and(
      eq(sessionEvents.sessionId, sessionId),
      eq(sessionEvents.eventType, 'evaluate_challenge')
    ),
    // [BUG-913 sweep] Tie-break by id when created_at collides — see
    // session-crud.ts getSessionTranscript for the full rationale.
    orderBy: [desc(sessionEvents.createdAt), desc(sessionEvents.id)],
  });
  let consecutiveFailures = 0;
  for (const evt of evalEvents) {
    const meta = evt.metadata as Record<string, unknown> | null;
    if (meta?.passed === true) break;
    consecutiveFailures++;
  }

  return {
    sessionId,
    topicId: session.topicId,
    difficultyRung: (card?.evaluateDifficultyRung ?? 1) as 1 | 2 | 3 | 4,
    consecutiveFailures,
    lastFailureAction: null,
  };
}
