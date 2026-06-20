import { and, eq } from 'drizzle-orm';
import {
  createScopedRepository,
  curriculumBooks,
  curriculumTopics,
  retentionCards,
  sessionEvents,
  subjects,
} from '@eduagent/database';
import { reviewCalibrationRequestedEventSchema } from '@eduagent/schemas';
import type { ReviewCalibrationRequestedEvent } from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  evaluateRecallQuality,
  rowToRetentionState,
} from '../../services/retention-data';
import { canRetestTopic, processRecallResult } from '../../services/retention';
import { stampMasteryOnVerify } from '../../services/retention-mastery';
import {
  applyRetentionUpdate,
  syncRewardStatusFromRetention,
} from '../../services/apply-retention-update';

const RETEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function parseEventData(data: unknown): ReviewCalibrationRequestedEvent | null {
  const parsed = reviewCalibrationRequestedEventSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
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

  // PII egress: rehydrate the learner's calibration answer and topic title from
  // the DB by the event's opaque `learnerMessageEventId` / `topicId` — the raw
  // text never rides in the event payload. Both are scoped by profileId (the
  // message via the session_events row, the title via the
  // curriculum_topics → curriculum_books → subjects parent chain). A missing
  // row (transcript purged / topic changed since dispatch) skips grading
  // rather than guessing. [WI-620, mirrors topic-probe-extract rehydration]
  const rehydrated = await step.run(
    'rehydrate-calibration-inputs',
    async (): Promise<{
      learnerMessage: string;
      topicTitle: string;
    } | null> => {
      const db = getStepDatabase();
      const [topic] = await db
        .select({ title: curriculumTopics.title })
        .from(curriculumTopics)
        .innerJoin(
          curriculumBooks,
          eq(curriculumBooks.id, curriculumTopics.bookId),
        )
        .innerJoin(subjects, eq(subjects.id, curriculumBooks.subjectId))
        .where(
          and(
            eq(curriculumTopics.id, topicId),
            eq(subjects.profileId, profileId),
          ),
        )
        .limit(1);
      if (!topic?.title) return null;

      const [learnerMessageRow] = await db
        .select({ content: sessionEvents.content })
        .from(sessionEvents)
        .where(
          and(
            eq(sessionEvents.id, learnerMessageEventId),
            eq(sessionEvents.profileId, profileId),
            eq(sessionEvents.sessionId, sessionId),
            eq(sessionEvents.eventType, 'user_message'),
          ),
        )
        .limit(1);
      if (!learnerMessageRow?.content) return null;

      return {
        learnerMessage: learnerMessageRow.content,
        topicTitle: topic.title,
      };
    },
  );

  if (!rehydrated) {
    return { skipped: 'rehydration_failed', sessionId };
  }

  const quality = await step.run('grade-recall-quality', () =>
    evaluateRecallQuality(rehydrated.learnerMessage, rehydrated.topicTitle),
  );
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
