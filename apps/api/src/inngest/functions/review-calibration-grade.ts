import { and, eq, isNull, lt, or } from 'drizzle-orm';
import {
  createScopedRepository,
  retentionCards,
  type Database,
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
import { syncXpLedgerStatus } from '../../services/xp';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';

const logger = createLogger();
const RETEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function parseEventData(data: unknown): ReviewCalibrationRequestedEvent | null {
  const parsed = reviewCalibrationRequestedEventSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

async function syncXpBestEffort(
  db: Database,
  profileId: string,
  topicId: string,
  xpChange: 'none' | 'verified' | 'decayed'
): Promise<void> {
  if (xpChange !== 'verified' && xpChange !== 'decayed') return;

  try {
    await syncXpLedgerStatus(db, profileId, topicId, xpChange);
  } catch (err) {
    logger.error('[review-calibration-grade] XP sync failed (non-fatal)', {
      event: 'review_calibration.xp_sync_failed',
      profileId,
      topicId,
      xpChange,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, {
      profileId,
      extra: {
        site: 'reviewCalibrationGrade.syncXpLedgerStatus',
        topicId,
        xpChange,
      },
    });
  }
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

  const { profileId, sessionId, topicId, learnerMessage, topicTitle } = payload;
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

  const quality = await step.run('grade-recall-quality', () =>
    evaluateRecallQuality(learnerMessage, topicTitle)
  );
  const result = processRecallResult(state, quality, eventAt.toISOString());
  const cooldownThreshold = new Date(eventAt.getTime() - RETEST_COOLDOWN_MS);

  const persisted = await step.run('persist-retention-update', async () => {
    const db = getStepDatabase();
    return db
      .update(retentionCards)
      .set({
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
        updatedAt: eventAt,
      })
      .where(
        and(
          eq(retentionCards.id, card.id),
          eq(retentionCards.profileId, profileId),
          or(
            isNull(retentionCards.lastReviewedAt),
            lt(retentionCards.lastReviewedAt, cooldownThreshold)
          )
        )
      )
      .returning({ id: retentionCards.id });
  });

  if (persisted.length === 0) {
    return { skipped: 'cooldown_claim_lost', sessionId };
  }

  await step.run('sync-xp-ledger', async () => {
    const db = getStepDatabase();
    await syncXpBestEffort(db, profileId, topicId, result.xpChange);
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
  { id: 'review-calibration-grade', retries: 2 },
  { event: 'app/review.calibration.requested' },
  handleReviewCalibrationGrade
);
