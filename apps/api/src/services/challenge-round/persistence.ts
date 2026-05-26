/**
 * [CR-2026-05-21-071] Challenge Round mastery-gate persistence.
 *
 * This module is the production wiring that closes the dead-code gap reported
 * in CR-2026-05-21-071: today the LLM emits `signals.challenge_round_evaluation`
 * via the response envelope, but nothing on the server reads it, so
 * `assessments.mastery_challenge_verified_at` never moves and weak concepts
 * never reach `needs_deepening_topics`.
 *
 * `applyChallengeRoundEvaluation` is the single entry-point called from the
 * session-exchange persistence path immediately after the AI response row is
 * written.  It runs the contract documented in CLAUDE.md →
 * "Challenge Round mastery policy is server-owned and conservative":
 *
 *   1.  Validate each evaluation item references a real `user_message`
 *       session_event owned by this profile + session
 *       (`validateEvaluationEventIds`).  ANY mismatch ⇒ outcome `invalid`,
 *       no DB writes — the LLM is unreliable, so the server refuses to
 *       grant mastery on un-attested evidence.
 *   2.  Run the conservative `decideMasteryAndReview()` gate.  Mastery is
 *       set only when every concept is `solid`; any `partial` /
 *       `misconception` blocks mastery and routes the weak concepts to
 *       `needs_deepening_topics` with `source = 'challenge_round'`.
 *       `missing` items block mastery but do not produce a deepening row
 *       (no learner text to attach).
 *   3.  When a note draft is present AND the decision yielded solid
 *       answer quotes, the draft is passed through `validateNoteDraft`
 *       with the *verified* event contents (BUG-483).  Only drafts that
 *       clear the lexical-overlap guard land in `topic_notes`.
 *
 * Failure semantics: this is a non-core enrichment of the exchange.  The
 * exchange must not fail because the LLM emitted a bad evaluation item, so
 * callers should wrap this function in `safeWrite()` from
 * `services/safe-non-core.ts`.  All thrown errors are surfaced as structured
 * `outcome` values via the return shape so the caller can decide whether
 * to log / metric.
 */

import { and, eq, sql } from 'drizzle-orm';
import {
  assessments,
  needsDeepeningTopics,
  type Database,
} from '@eduagent/database';
import type {
  ChallengeRoundEvaluationItem,
  ChallengeRoundNoteDraftHint,
} from '@eduagent/schemas';

import { createNoteForSession } from '../notes';
import { createLogger } from '../logger';
import {
  decideMasteryAndReview,
  validateEvaluationEventIds,
  type MasteryOutcome,
} from './evaluation';
import { validateNoteDraft } from './note-draft';

const logger = createLogger();

export interface ApplyChallengeRoundEvaluationInput {
  /** The owning profile — required for scoped reads and writes. */
  profileId: string;
  /** Active session id; used to scope event-id validation. */
  sessionId: string;
  /**
   * The topic that owns the assessment row.  When null, mastery cannot be
   * persisted and no needs_deepening rows are written (defensive — sessions
   * are expected to have a topicId for any flow that triggers a Challenge
   * Round, so this is logged as an anomaly).
   */
  topicId: string | null;
  /**
   * The subject the topic belongs to — required for any needs_deepening_topics
   * write because that table is keyed by (profile_id, subject_id, topic_id).
   * When null, the deepening write is skipped (anomaly logged).
   */
  subjectId: string | null;
  /** Raw evaluation items emitted by the LLM via the envelope. */
  evaluations: ChallengeRoundEvaluationItem[];
  /**
   * Optional draft hint from `envelope.ui_hints.note_draft`.  When present
   * AND the mastery decision yielded `solidAnswerQuotes`, the draft is
   * validated against the verified learner text and (on pass) persisted to
   * `topic_notes` via `createNoteForSession`.
   */
  noteDraft?: ChallengeRoundNoteDraftHint | null;
}

export interface ApplyChallengeRoundEvaluationResult {
  outcome: MasteryOutcome;
  masteryVerified: boolean;
  /** Number of rows inserted into `needs_deepening_topics`. */
  deepeningRowsInserted: number;
  /** True when a note row was inserted into `topic_notes`. */
  noteDraftPersisted: boolean;
  /** Reason a draft was rejected, when one was present but not persisted. */
  noteDraftRejectionReason?:
    | 'empty'
    | 'no_content_tokens'
    | 'low_lexical_overlap'
    | 'no_solid_concepts'
    | 'note_write_failed';
}

const SKIPPED_RESULT: ApplyChallengeRoundEvaluationResult = {
  outcome: 'invalid',
  masteryVerified: false,
  deepeningRowsInserted: 0,
  noteDraftPersisted: false,
};

/**
 * Entry point — see file header for the contract.  Returns a structured
 * result so the caller can log / emit metrics without re-deriving the
 * decision.
 */
export async function applyChallengeRoundEvaluation(
  db: Database,
  input: ApplyChallengeRoundEvaluationInput,
): Promise<ApplyChallengeRoundEvaluationResult> {
  const { profileId, sessionId, topicId, subjectId, evaluations, noteDraft } =
    input;

  if (evaluations.length === 0) {
    return SKIPPED_RESULT;
  }

  // Step 1 — verify every answerEventId belongs to this profile + session
  // and rewrite learnerQuote to the verified event content.  Throws on any
  // mismatch — the caller is expected to wrap us in safeWrite so the throw
  // is captured to Sentry without breaking the exchange.
  let verified: ChallengeRoundEvaluationItem[];
  try {
    verified = await validateEvaluationEventIds(
      db,
      profileId,
      sessionId,
      evaluations,
    );
  } catch (err) {
    logger.warn('challenge_round_evaluation.validation_failed', {
      profileId,
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return SKIPPED_RESULT;
  }

  // Step 2 — conservative mastery decision.  Every concept must be solid
  // for mastery to be marked; any partial/misconception/missing blocks it.
  const decision = decideMasteryAndReview(verified);

  // Step 3 — persist mastery (server-owned write) only when the gate
  // permits and we have an assessment row to update.  No throw on missing
  // topicId — log + continue.  No row created: assessments are written by
  // the verification pipeline, not here.
  let masteryVerified = false;
  if (decision.markMasteryVerified) {
    if (topicId) {
      const updated = await db
        .update(assessments)
        .set({
          masteryChallengeVerifiedAt: sql`NOW()`,
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(assessments.profileId, profileId),
            eq(assessments.topicId, topicId),
          ),
        )
        .returning({ id: assessments.id });
      masteryVerified = updated.length > 0;
      if (!masteryVerified) {
        logger.warn('challenge_round_evaluation.mastery_no_assessment_row', {
          profileId,
          sessionId,
          topicId,
        });
      }
    } else {
      logger.warn('challenge_round_evaluation.mastery_skipped_no_topic_id', {
        profileId,
        sessionId,
      });
    }
  }

  // Step 4 — route weak concepts (partial / misconception) to
  // needs_deepening_topics with source = 'challenge_round'.  `missing`
  // items intentionally produce no row (no learner text to attach).
  let deepeningRowsInserted = 0;
  if (decision.reviewTargets.length > 0) {
    if (topicId && subjectId) {
      const inserted = await db
        .insert(needsDeepeningTopics)
        .values(
          decision.reviewTargets.map((target) => ({
            profileId,
            subjectId,
            topicId,
            status: 'active' as const,
            source: 'challenge_round',
            concept: target.concept,
            misconception: target.misconception ?? null,
            correction: target.correction ?? null,
          })),
        )
        .returning({ id: needsDeepeningTopics.id });
      deepeningRowsInserted = inserted.length;
    } else {
      logger.warn(
        'challenge_round_evaluation.deepening_skipped_no_topic_or_subject',
        {
          profileId,
          sessionId,
          topicId,
          subjectId,
          weakConceptCount: decision.reviewTargets.length,
        },
      );
    }
  }

  // Step 5 — note draft.  Only consider drafting when the decision yielded
  // at least one solid answer quote (per CLAUDE.md: "Notes drafted from
  // Challenge Rounds must use only solidAnswerQuotes").
  let noteDraftPersisted = false;
  let noteDraftRejectionReason: ApplyChallengeRoundEvaluationResult['noteDraftRejectionReason'];

  if (noteDraft && noteDraft.content) {
    if (decision.solidAnswerQuotes.length === 0) {
      noteDraftRejectionReason = 'no_solid_concepts';
    } else if (!topicId) {
      // Cannot create a note without a topic; record the anomaly via the
      // existing logger but do not set a draft-specific reason — the
      // anomaly is the missing topicId, not the draft itself.
      logger.warn('challenge_round_evaluation.note_skipped_no_topic_id', {
        profileId,
        sessionId,
      });
    } else {
      const verifiedContents = verified.map((item) => item.learnerQuote);
      const validation = validateNoteDraft(
        noteDraft.content,
        decision.solidAnswerQuotes,
        verifiedContents,
      );
      if (!validation.ok) {
        noteDraftRejectionReason = validation.reason ?? 'empty';
        logger.warn('challenge_round_evaluation.note_draft_rejected', {
          profileId,
          sessionId,
          topicId,
          reason: validation.reason,
          overlapRatio: validation.overlapRatio,
        });
      } else {
        try {
          await createNoteForSession(db, {
            profileId,
            topicId,
            sessionId,
            content: noteDraft.content,
          });
          noteDraftPersisted = true;
        } catch (err) {
          // ConflictError when the per-topic note cap is reached is benign
          // — the learner already has 50 notes for this topic.  Surface
          // through Sentry but do not retry.
          noteDraftRejectionReason = 'note_write_failed';
          logger.warn('challenge_round_evaluation.note_write_failed', {
            profileId,
            sessionId,
            topicId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  return {
    outcome: decision.outcome,
    masteryVerified,
    deepeningRowsInserted,
    noteDraftPersisted,
    noteDraftRejectionReason,
  };
}
