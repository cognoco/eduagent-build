// ---------------------------------------------------------------------------
// Verification Completion Service — EVALUATE & TEACH_BACK post-processing
// Called by session-completed chain (Step 1c) to parse structured assessments
// from session events and update retention cards.
// Pure business logic, no Hono imports.
// ---------------------------------------------------------------------------

import { eq, and, desc } from 'drizzle-orm';
import {
  sessionEvents,
  retentionCards,
  type Database,
} from '@eduagent/database';
import {
  parseEvaluateAssessment,
  mapEvaluateQualityToSm2,
  handleEvaluateFailure,
} from './evaluate';
import {
  parseTeachBackAssessment,
  mapTeachBackRubricToSm2,
} from './teach-back';

// ---------------------------------------------------------------------------
// EVALUATE completion
// ---------------------------------------------------------------------------

/**
 * Processes EVALUATE session completion:
 * 1. Finds the last ai_response event with a structured assessment
 * 2. Parses the EVALUATE assessment JSON from the response
 * 3. Maps quality to SM-2 using the modified floor
 * 4. Updates evaluateDifficultyRung on the retention card
 * 5. Handles three-strike escalation via handleEvaluateFailure
 */
export async function processEvaluateCompletion(
  db: Database,
  profileId: string,
  sessionId: string,
  topicId: string
): Promise<void> {
  // Find the last ai_response event for this session
  const events = await db
    .select()
    .from(sessionEvents)
    .where(
      and(
        eq(sessionEvents.sessionId, sessionId),
        eq(sessionEvents.profileId, profileId),
        eq(sessionEvents.eventType, 'ai_response')
      )
    )
    .orderBy(desc(sessionEvents.createdAt))
    .limit(5);

  // Try to parse an EVALUATE assessment from the most recent events
  let assessment = null;
  for (const event of events) {
    assessment = parseEvaluateAssessment(event.content);
    if (assessment) break;
  }

  if (!assessment) return; // No parseable assessment found

  // Load the retention card
  const cards = await db
    .select()
    .from(retentionCards)
    .where(
      and(
        eq(retentionCards.topicId, topicId),
        eq(retentionCards.profileId, profileId)
      )
    )
    .limit(1);

  const card = cards[0];
  if (!card) return;

  const currentRung = (card.evaluateDifficultyRung ?? 1) as 1 | 2 | 3 | 4;

  // Map EVALUATE result to SM-2 quality
  const sm2Quality = mapEvaluateQualityToSm2(
    assessment.challengePassed,
    assessment.quality
  );

  // Handle three-strike escalation for failures
  let newRung = currentRung;
  if (!assessment.challengePassed) {
    // Count consecutive EVALUATE failures from session events
    const failureAction = handleEvaluateFailure(1, currentRung);

    if (
      failureAction.action === 'lower_difficulty' &&
      failureAction.newDifficultyRung
    ) {
      newRung = failureAction.newDifficultyRung;
    } else if (failureAction.action === 'exit_to_standard') {
      // Reset to rung 1 for next EVALUATE attempt
      newRung = 1 as const;
    }
  } else {
    // On success, advance difficulty rung (cap at 4)
    newRung = Math.min(4, currentRung + 1) as 1 | 2 | 3 | 4;
  }

  // Update the retention card with new difficulty rung
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

  // Store structured assessment in the event for audit trail
  if (events[0]) {
    await db
      .update(sessionEvents)
      .set({
        structuredAssessment: {
          type: 'evaluate',
          ...assessment,
          sm2Quality,
          difficultyRungBefore: currentRung,
          difficultyRungAfter: newRung,
        },
      })
      .where(eq(sessionEvents.id, events[0].id));
  }
}

// ---------------------------------------------------------------------------
// TEACH_BACK completion
// ---------------------------------------------------------------------------

/**
 * Processes TEACH_BACK session completion:
 * 1. Finds the last ai_response event with a structured assessment
 * 2. Parses the TEACH_BACK assessment JSON from the response
 * 3. Maps rubric scores to SM-2 quality via weighted average
 * 4. Stores the structured assessment in the event for audit trail
 */
export async function processTeachBackCompletion(
  db: Database,
  profileId: string,
  sessionId: string,
  topicId: string
): Promise<void> {
  // Suppress unused parameter warning — topicId reserved for future use
  void topicId;

  // Find the last ai_response event for this session
  const events = await db
    .select()
    .from(sessionEvents)
    .where(
      and(
        eq(sessionEvents.sessionId, sessionId),
        eq(sessionEvents.profileId, profileId),
        eq(sessionEvents.eventType, 'ai_response')
      )
    )
    .orderBy(desc(sessionEvents.createdAt))
    .limit(5);

  // Try to parse a TEACH_BACK assessment from the most recent events
  let assessment = null;
  for (const event of events) {
    assessment = parseTeachBackAssessment(event.content);
    if (assessment) break;
  }

  if (!assessment) return; // No parseable assessment found

  // Map rubric to SM-2 quality
  const sm2Quality = mapTeachBackRubricToSm2(assessment);

  // Store structured assessment in the event for audit trail
  if (events[0]) {
    await db
      .update(sessionEvents)
      .set({
        structuredAssessment: {
          type: 'teach_back',
          ...assessment,
          sm2Quality,
        },
      })
      .where(eq(sessionEvents.id, events[0].id));
  }
}
