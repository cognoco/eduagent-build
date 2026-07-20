// @inngest-admin: parent-chain (createScopedRepository(db, profileId); curriculumTopics→books→subjects.profileId chain)
import { and, desc, eq, lt, ne } from 'drizzle-orm';
import {
  createScopedRepository,
  retentionCards,
  retrievalEvents,
  sessionEvents,
  type Database,
} from '@eduagent/database';
import { findOwnedCurriculumTopic } from '../../services/curriculum-topic-ownership';
import { reviewCalibrationRequestedEventSchema } from '@eduagent/schemas';
import type { ReviewCalibrationRequestedEvent } from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  evaluateRecallQuality,
  getOpenTopicWeakConcepts,
  rowToRetentionState,
} from '../../services/retention-data';
import {
  recordRetrievalEvent,
  type RetrievalNextAction,
  type RetrievalVerdict,
} from '../../services/retrieval-events';
import { canRetestTopic, processRecallResult } from '../../services/retention';
import { stampMasteryOnVerify } from '../../services/retention-mastery';
import {
  applyRetentionUpdate,
  syncRewardStatusFromRetention,
} from '../../services/apply-retention-update';
import { createLogger } from '../../services/logger';

const logger = createLogger();
const RETEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type CalibrationGradeStepResult =
  | { outcome: 'skip' }
  | { outcome: 'graded'; quality: number; verdict: RetrievalVerdict }
  | { outcome: 'fallback'; capped: boolean };

function parseEventData(data: unknown): ReviewCalibrationRequestedEvent | null {
  const parsed = reviewCalibrationRequestedEventSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

async function wasPreviousAttemptFallback(
  db: Database,
  input: {
    profileId: string;
    topicId: string;
    eventAt: Date;
    receiptId: string;
  },
): Promise<boolean> {
  // [T12 / EU-7] Read only rows strictly before this invocation's eventAt.
  // The receipt id exclusion is defensive against database clock skew; the
  // current invocation must never become its own "previous" failure.
  //
  // [EU-7 scoped-repo exception] Direct db.select() is intentional here and
  // POLICY-SANCTIONED. The query needs a strict time bound, descending order,
  // and limit together — clauses the scoped repository cannot express.
  const [previous] = await db
    .select({ gradedBy: retrievalEvents.gradedBy })
    .from(retrievalEvents)
    .where(
      and(
        eq(retrievalEvents.profileId, input.profileId),
        eq(retrievalEvents.topicId, input.topicId),
        ne(retrievalEvents.id, input.receiptId),
        lt(retrievalEvents.createdAt, input.eventAt),
      ),
    )
    .orderBy(desc(retrievalEvents.createdAt))
    .limit(1);
  return previous?.gradedBy === 'fallback_heuristic';
}

async function loadCommittedGradeReceipt(
  db: Database,
  input: {
    profileId: string;
    sessionId: string;
    topicId: string;
    learnerMessageEventId: string;
    eventAt: Date;
  },
): Promise<CalibrationGradeStepResult | null> {
  const repo = createScopedRepository(db, input.profileId);
  const receipt = await repo.retrievalEvents.findFirst(
    eq(retrievalEvents.id, input.learnerMessageEventId),
  );
  if (!receipt) return null;

  if (
    receipt.answerEventId !== input.learnerMessageEventId ||
    receipt.sessionId !== input.sessionId ||
    receipt.topicId !== input.topicId
  ) {
    throw new Error('Calibration grade receipt context invariant failed');
  }

  if (receipt.gradedBy === 'fallback_heuristic') {
    if (receipt.quality !== null || receipt.verdict !== null) {
      throw new Error('Calibration fallback receipt shape invariant failed');
    }
    return {
      outcome: 'fallback',
      capped: await wasPreviousAttemptFallback(db, {
        profileId: input.profileId,
        topicId: input.topicId,
        eventAt: input.eventAt,
        receiptId: input.learnerMessageEventId,
      }),
    };
  }

  if (
    receipt.gradedBy !== 'llm' ||
    receipt.quality === null ||
    receipt.verdict === null ||
    !Number.isInteger(receipt.quality) ||
    receipt.quality < 0 ||
    receipt.quality > 5
  ) {
    throw new Error('Calibration graded receipt shape invariant failed');
  }

  // C-3: only the structured decision crosses into Inngest memoized state.
  // The receipt's learner text, rationale, and misconception remain DB-local.
  return {
    outcome: 'graded',
    quality: receipt.quality,
    verdict: receipt.verdict,
  };
}

export async function handleReviewCalibrationGrade({
  event,
  step,
}: {
  event: { data: unknown };
  step: { run: <T>(name: string, fn: () => Promise<T> | T) => Promise<T> };
}) {
  const payload = parseEventData(event.data);
  if (!payload) {
    return { skipped: 'invalid_payload' };
  }

  const { profileId, sessionId, topicId, learnerMessageEventId } = payload;
  const eventAt = new Date(payload.timestamp);

  const card = await step.run('load-retention-card', async () => {
    const db = getStepDatabase();
    const repo = createScopedRepository(db, profileId);
    return repo.retentionCards.findFirst(eq(retentionCards.topicId, topicId));
  });
  if (!card) {
    return { skipped: 'no_retention_card', sessionId };
  }

  const cardRow: typeof retentionCards.$inferSelect = {
    ...card,
    lastReviewedAt: card.lastReviewedAt ? new Date(card.lastReviewedAt) : null,
    nextReviewAt: card.nextReviewAt ? new Date(card.nextReviewAt) : null,
    createdAt: new Date(card.createdAt),
    updatedAt: new Date(card.updatedAt),
  };

  const state = rowToRetentionState(cardRow);
  const lastTestAt = cardRow.lastReviewedAt?.toISOString() ?? null;
  if (!canRetestTopic(state, lastTestAt)) {
    return { skipped: 'cooldown_active', sessionId };
  }

  const cooldownThreshold = new Date(eventAt.getTime() - RETEST_COOLDOWN_MS);

  // Claim the cooldown slot BEFORE the paid LLM grade call. Previously the
  // grade ran first, so losing the CAS claim still burned an LLM call. The
  // claim is a slim CAS write (timestamps only); the SM-2 fields are written
  // by finalize-retention-update once the grade is known.
  //
  // Partial-state trade: if the claim succeeds but the function permanently
  // exhausts retries before finalize, the cooldown slot is consumed with the
  // SM-2 fields unchanged. Accepted — Inngest retries cover the transient
  // case, and the alternative wastes a paid LLM call on every lost claim.
  //
  // Grader-unavailable trade [T12/EU-7]: when the grade step returns a
  // fallback (grader down/unparseable), the cooldown slot stays consumed and
  // SM-2 ease/interval/reps are NOT advanced — only nextReviewAt nudges to
  // retry on the next cron, and a back-to-back fallback is capped so the topic
  // can't be trapped in a daily loop.
  const claimed = await step.run('claim-cooldown-slot', async () => {
    const db = getStepDatabase();
    const { updated } = await applyRetentionUpdate({
      db,
      profileId,
      cardId: card.id,
      set: { lastReviewedAt: eventAt },
      guard: {
        kind: 'cooldownClaim',
        cooldownThreshold,
        // Re-entrancy: lastReviewedAt === eventAt means OUR claim from an
        // earlier at-least-once execution of this step (eventAt derives
        // deterministically from the event payload), not a competitor's —
        // a retry after a lost step checkpoint must not lose its own slot.
        allowLastReviewedAt: eventAt,
      },
      updatedAt: eventAt,
    });
    return updated ? [{ id: card.id }] : [];
  });

  if (claimed.length === 0) {
    return { skipped: 'cooldown_claim_lost', sessionId };
  }

  // PII egress: rehydrate the learner's calibration answer + topic title from
  // the DB, grade, AND record the recall-log row in ONE step closure so the raw
  // text (and the grader's rationale/misconception) stay local variables. Only
  // the non-PII decision ({ outcome, quality, verdict }) crosses the step
  // boundary (Inngest memoizes step returns into its third-party state store,
  // so PII must never be returned). Both reads are scoped by profileId — the
  // message via its session_events row id (opaque event reference), the title
  // via the curriculum_topics → curriculum_books → subjects parent chain. A
  // missing row (transcript purged / topic changed since dispatch) skips
  // grading rather than guessing. A grader-unavailable result is recorded as a
  // fallback_heuristic row and never advances SM-2. [WI-620 / C-3 / T12]
  const graded = await step.run(
    'rehydrate-grade-and-record',
    async (): Promise<CalibrationGradeStepResult> => {
      const db = getStepDatabase();
      // A retrieval_events row is the first-party durable receipt for this
      // opaque learner-answer event. If Postgres committed the row but Inngest
      // lost the step acknowledgement, replay resolves the structured result
      // before rehydrating raw text or invoking the paid grader again.
      // Scope: this covers the ratified committed-write/lost-ack replay. Two
      // truly simultaneous first executions can both miss before the primary
      // key arbitrates; normal serialization remains Inngest's idempotency job.
      const committedReceipt = await loadCommittedGradeReceipt(db, {
        profileId,
        sessionId,
        topicId,
        learnerMessageEventId,
        eventAt,
      });
      if (committedReceipt) return committedReceipt;

      // Canonical single-topic ownership join (scoped by profileId) — avoids
      // re-implementing the join inline (SWEEP-topic-ownership-join ratchet).
      const topic = await findOwnedCurriculumTopic(db, { profileId, topicId });
      if (!topic?.topicTitle) return { outcome: 'skip' };

      // sessionEvents is a single scoped table — read it through the scoped
      // repository (profileId enforced by scopedWhere).
      const repo = createScopedRepository(db, profileId);
      const learnerMessageRow = await repo.sessionEvents.findFirst(
        and(
          eq(sessionEvents.id, learnerMessageEventId),
          eq(sessionEvents.sessionId, sessionId),
          eq(sessionEvents.eventType, 'user_message'),
        ),
      );
      if (!learnerMessageRow?.content) return { outcome: 'skip' };

      // [WI-1454] Concept-targeted review: query the topic's open weak concepts
      // BEFORE constructing the recall grade scope (AC-1). This is the live
      // due-topic-review grading path (Now-feed retention_due card → mode=review
      // session → this calibration grade). When open weak concepts exist the
      // grader focuses on them; when none exist it grades the whole topic as
      // before (AC-3). SM-2 scheduling below is untouched (AC-4).
      const focusConcepts = await getOpenTopicWeakConcepts(
        db,
        profileId,
        topicId,
        eventAt,
      );

      const grade = await evaluateRecallQuality(
        learnerMessageRow.content,
        topic.topicTitle,
        topic.topicDescription ?? undefined,
        focusConcepts,
      );

      if (!grade.graded) {
        const capped = await wasPreviousAttemptFallback(db, {
          profileId,
          topicId,
          eventAt,
          receiptId: learnerMessageEventId,
        });

        const inserted = await recordRetrievalEvent(db, {
          receiptId: learnerMessageEventId,
          profileId,
          subjectId: topic.subjectId,
          topicId,
          sessionId,
          answerEventId: learnerMessageEventId,
          promptText: topic.topicTitle,
          learnerAnswer: learnerMessageRow.content,
          quality: null,
          verdict: null,
          nextAction: 'reschedule_soon',
          gradedBy: 'fallback_heuristic',
        });
        if (!inserted) {
          const concurrentReceipt = await loadCommittedGradeReceipt(db, {
            profileId,
            sessionId,
            topicId,
            learnerMessageEventId,
            eventAt,
          });
          if (!concurrentReceipt) {
            throw new Error('Calibration grade receipt conflict without row');
          }
          return concurrentReceipt;
        }
        return { outcome: 'fallback', capped };
      }

      // Derive the recorded next-action from a pure SM-2 evaluation (the
      // authoritative finalize write happens outside the step).
      const evaluated = processRecallResult(
        state,
        grade.quality,
        eventAt.toISOString(),
      );
      // [WI-1462] retrievalNextActionEnum keeps its existing
      // 'redirect_to_library' value for the topic_parked case — see the
      // matching comment in retention-data.ts's processRecallTest.
      const nextAction: RetrievalNextAction =
        evaluated.failureAction === 'topic_parked'
          ? 'redirect_to_library'
          : evaluated.passed
            ? 'advance'
            : 'reschedule_soon';

      const inserted = await recordRetrievalEvent(db, {
        receiptId: learnerMessageEventId,
        profileId,
        subjectId: topic.subjectId,
        topicId,
        sessionId,
        answerEventId: learnerMessageEventId,
        promptText: topic.topicTitle,
        learnerAnswer: learnerMessageRow.content,
        quality: grade.quality,
        verdict: grade.verdict,
        nextAction,
        gradedBy: 'llm',
        rubricRationale: grade.rationale,
        misconception: grade.misconception,
        llmRoutingRung: grade.rung,
      });
      if (!inserted) {
        const concurrentReceipt = await loadCommittedGradeReceipt(db, {
          profileId,
          sessionId,
          topicId,
          learnerMessageEventId,
          eventAt,
        });
        if (!concurrentReceipt) {
          throw new Error('Calibration grade receipt conflict without row');
        }
        return concurrentReceipt;
      }

      return {
        outcome: 'graded',
        quality: grade.quality,
        verdict: grade.verdict,
      };
    },
  );

  if (graded.outcome === 'skip') {
    return { skipped: 'rehydration_failed', sessionId };
  }

  if (graded.outcome === 'fallback') {
    // [T12/EU-7] Grader unavailable. Reschedule soon (unless capped by a
    // back-to-back prior failure). SM-2 ease/interval/reps are NOT advanced —
    // only nextReviewAt nudges, so the calibration retries on the next cron.
    if (!graded.capped) {
      await step.run('reschedule-after-grader-failure', async () => {
        const db = getStepDatabase();
        await applyRetentionUpdate({
          db,
          profileId,
          cardId: card.id,
          set: {
            nextReviewAt: new Date(eventAt.getTime() + RETEST_COOLDOWN_MS),
          },
          guard: { kind: 'none' },
          updatedAt: eventAt,
        });
      });
    }
    // [L-3] Observability: the fallback_heuristic row is the queryable record;
    // this log line surfaces the rate for alerting.
    logger.error('[review-calibration] recall grader unavailable', {
      profileId,
      topicId,
      sessionId,
      capped: graded.capped,
    });
    return { skipped: 'grader_unavailable', sessionId };
  }

  const quality = graded.quality;
  const result = processRecallResult(state, quality, eventAt.toISOString());

  await step.run('finalize-retention-update', async () => {
    const db = getStepDatabase();
    // Only the cooldown CAS condition is intentionally absent here — the
    // claim-cooldown-slot step above already holds the slot. The card-id +
    // profileId conditions remain (explicit profileId write protection).
    // Idempotent under retry: values derive deterministically from the
    // state loaded above, the graded quality, and the event timestamp.
    await applyRetentionUpdate({
      db,
      profileId,
      cardId: card.id,
      set: {
        easeFactor: result.newState.easeFactor,
        intervalDays: result.newState.intervalDays,
        repetitions: result.newState.repetitions,
        failureCount: result.newState.failureCount,
        consecutiveSuccesses: result.newState.consecutiveSuccesses,
        xpStatus: result.newState.xpStatus,
        nextReviewAt: result.newState.nextReviewAt
          ? new Date(result.newState.nextReviewAt)
          : null,
        lastReviewedAt: eventAt,
      },
      guard: { kind: 'none' },
      updatedAt: eventAt,
    });
    // [WI-848] Mirror decay to xp_ledger.status. The verified write is already
    // handled at insert time by insertSessionXpEntry (post-sunset, 5fed808e9).
    // No-op when no ledger row exists (topic never completed a session).
    if (result.xpChange === 'decayed') {
      await syncRewardStatusFromRetention({
        db,
        profileId,
        topicId,
        status: 'decayed',
      });
    }
  });

  await step.run('stamp-mastery-on-verify', async () => {
    const db = getStepDatabase();
    await stampMasteryOnVerify(db, {
      profileId,
      topicId,
      cardId: card.id,
      xpChange: result.xpChange,
      masteredAt: eventAt,
    });
  });

  return {
    sessionId,
    topicId,
    quality,
    verdict: graded.verdict,
    passed: result.passed,
    xpChange: result.xpChange,
  };
}
export const reviewCalibrationGrade = inngest.createFunction(
  {
    id: 'review-calibration-grade',
    retries: 2,
    idempotency: 'event.data.sessionId + "-" + event.data.topicId',
  },
  { event: 'app/review.calibration.requested' },
  handleReviewCalibrationGrade,
);
