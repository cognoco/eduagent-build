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
import { applyRetentionUpdate } from './apply-retention-update';

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
  topicId: string,
): Promise<number | undefined> {
  // Find the last ai_response event for this session
  const events = await db
    .select()
    .from(sessionEvents)
    .where(
      and(
        eq(sessionEvents.sessionId, sessionId),
        eq(sessionEvents.profileId, profileId),
        eq(sessionEvents.eventType, 'ai_response'),
      ),
    )
    // [BUG-913 sweep] Tie-break by id when created_at collides — see
    // session-crud.ts getSessionTranscript for the full rationale. With
    // limit:5 the tiebreak prevents a flapping "last 5 ai_response events"
    // set when a batch insert lands several events at the same NOW().
    .orderBy(desc(sessionEvents.createdAt), desc(sessionEvents.id))
    .limit(5);

  // Try to parse an EVALUATE assessment from the most recent events.
  // Track which event produced the assessment so we write to the correct row.
  let assessment = null;
  let assessmentEventIndex = -1;
  for (let i = 0; i < events.length; i++) {
    const candidate = events[i];
    if (!candidate) continue;
    assessment = parseEvaluateAssessment({
      content: candidate.content,
      metadata: candidate.metadata,
    });
    if (assessment) {
      assessmentEventIndex = i;
      break;
    }
  }

  if (!assessment || assessmentEventIndex === -1) return undefined; // No parseable assessment found

  const assessmentEvent = events[assessmentEventIndex];
  if (!assessmentEvent) return undefined;

  // Load the retention card
  const cards = await db
    .select()
    .from(retentionCards)
    .where(
      and(
        eq(retentionCards.topicId, topicId),
        eq(retentionCards.profileId, profileId),
      ),
    )
    .limit(1);

  const card = cards[0];
  if (!card) return undefined;

  const currentRung = (card.evaluateDifficultyRung ?? 1) as 1 | 2 | 3 | 4;

  // Map EVALUATE result to SM-2 quality
  const sm2Quality = mapEvaluateQualityToSm2(
    assessment.challengePassed,
    assessment.quality,
  );

  // Handle three-strike escalation for failures
  let newRung = currentRung;
  if (!assessment.challengePassed) {
    // Count consecutive EVALUATE failures from prior events in this session.
    // Walk backward from the event *after* the matched assessment event.
    // Parse from event content (not structuredAssessment column) because
    // the column is only written at the end of this function for the matched event.
    let consecutiveFailures = 1; // Current failure counts as 1
    for (let i = assessmentEventIndex + 1; i < events.length; i++) {
      const evt = events[i];
      if (!evt) break;
      const priorAssessment = parseEvaluateAssessment({
        content: evt.content,
        metadata: evt.metadata,
      });
      if (priorAssessment && !priorAssessment.challengePassed) {
        consecutiveFailures++;
      } else {
        break; // Stop at first non-failure (consecutive = unbroken)
      }
    }

    const failureAction = handleEvaluateFailure(
      consecutiveFailures,
      currentRung,
    );

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
    // On success, advance difficulty rung (cap at 4) — BUT only when the LLM
    // supplied a non-empty flaw_identified string as evidence. A bare
    // challenge_passed=true without that description is a weakly-supported pass:
    // the SM-2 quality update proceeds normally (no penalty for the learner)
    // but the difficulty rung does not advance. This mirrors the Challenge-Round
    // mastery policy: the server never trusts a bare LLM boolean without
    // structured evidence. If flaw_identified is missing, newRung stays at
    // currentRung (i.e. no rung advancement for an unsupported pass).
    if (
      typeof assessment.flawIdentified === 'string' &&
      assessment.flawIdentified.trim().length > 0
    ) {
      newRung = Math.min(4, currentRung + 1) as 1 | 2 | 3 | 4;
    }
    // else: keep newRung = currentRung — pass is noted but not promoted
  }

  // Update the retention card with new difficulty rung
  await applyRetentionUpdate({
    db,
    profileId,
    cardId: card.id,
    set: { evaluateDifficultyRung: newRung },
    guard: { kind: 'none' },
    updatedAt: new Date(),
  });

  // Store structured assessment in the event that produced it (not blindly events[0])
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
    .where(
      and(
        eq(sessionEvents.id, assessmentEvent.id),
        eq(sessionEvents.profileId, profileId),
      ),
    );

  return sm2Quality;
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
): Promise<number | undefined> {
  // Find the last ai_response event for this session
  const events = await db
    .select()
    .from(sessionEvents)
    .where(
      and(
        eq(sessionEvents.sessionId, sessionId),
        eq(sessionEvents.profileId, profileId),
        eq(sessionEvents.eventType, 'ai_response'),
      ),
    )
    // [BUG-913 sweep] Tie-break by id when created_at collides — see
    // session-crud.ts getSessionTranscript for the full rationale. With
    // limit:5 the tiebreak prevents a flapping "last 5 ai_response events"
    // set when a batch insert lands several events at the same NOW().
    .orderBy(desc(sessionEvents.createdAt), desc(sessionEvents.id))
    .limit(5);

  // Try to parse a TEACH_BACK assessment from the most recent events.
  // Track which event produced the assessment so we write to the correct row.
  let assessment = null;
  let assessmentEvent: (typeof events)[number] | null = null;
  for (const event of events) {
    const parsed = parseTeachBackAssessment({
      content: event.content,
      metadata: event.metadata,
    });
    if (parsed) {
      assessment = parsed;
      assessmentEvent = event;
      break;
    }
  }

  if (!assessment || !assessmentEvent) return undefined; // No parseable assessment found

  // Map rubric to SM-2 quality, then apply the accuracy-floor gate.
  // SERVER-SIDE EVIDENCE FLOOR: the overall SM-2 quality is capped at the
  // accuracy score (the 50%-weighted primary dimension). This prevents an LLM
  // that returns inflated completeness/clarity scores from pushing the total
  // beyond what factual correctness supports. A teach-back where accuracy is
  // low should never produce a high SM-2 quality. Analogous to the EVALUATE
  // rung-advance gate: the server imposes a conservative ceiling on
  // self-reported LLM numbers rather than trusting them unconditionally.
  const rawSm2Quality = mapTeachBackRubricToSm2(assessment);
  const sm2Quality = Math.min(rawSm2Quality, assessment.accuracy);

  // Store structured assessment in the event that produced it (not blindly events[0])
  await db
    .update(sessionEvents)
    .set({
      structuredAssessment: {
        type: 'teach_back',
        ...assessment,
        sm2Quality,
      },
    })
    .where(
      and(
        eq(sessionEvents.id, assessmentEvent.id),
        eq(sessionEvents.profileId, profileId),
      ),
    );

  return sm2Quality;
}
