import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { learningSessions } from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { classifySubject } from '../../services/subject-classify';
import { createLogger } from '../../services/logger';
import { SILENT_CLASSIFY_CONFIDENCE_THRESHOLD } from '../../services/session/session-depth.config';

const classifySilentlyEventDataSchema = z.object({
  sessionId: z.string(),
  profileId: z.string(),
  classifyInput: z.string(),
  exchangeCount: z.number(),
});

const logger = createLogger();

export const askSilentClassify = inngest.createFunction(
  {
    id: 'ask-silent-classify',
    name: 'Silently classify freeform ask sessions',
    retries: 2,
    concurrency: { key: 'event.data.sessionId', limit: 1 },
  },
  { event: 'app/ask.classify_silently' },
  async ({ event, step }) => {
    const { sessionId, profileId, classifyInput, exchangeCount } =
      classifySilentlyEventDataSchema.parse(event.data);
    const db = getStepDatabase();

    const existing = await step.run('check-existing', async () => {
      const [row] = await db
        .select({ metadata: learningSessions.metadata })
        .from(learningSessions)
        .where(
          and(
            eq(learningSessions.id, sessionId),
            eq(learningSessions.profileId, profileId)
          )
        )
        .limit(1);

      const metadata = ((row?.metadata as
        | Record<string, unknown>
        | undefined) ?? {}) as Record<string, unknown>;
      return Boolean(metadata['silentClassification']);
    });

    if (existing) {
      await step.sendEvent('already-classified', {
        name: 'app/ask.classification_skipped',
        data: {
          sessionId,
          exchangeCount,
          reason: 'already_classified',
          topConfidence: 1,
        },
      });
      return { skipped: true, reason: 'already_classified' };
    }

    const classification = await step.run('classify', async () =>
      classifySubject(db, profileId, classifyInput)
    );

    const topCandidate = [...classification.candidates]
      .sort((left, right) => right.confidence - left.confidence)
      .find(
        (candidate) =>
          candidate.confidence >= SILENT_CLASSIFY_CONFIDENCE_THRESHOLD
      );

    if (!topCandidate) {
      await step.sendEvent('classification-skipped', {
        name: 'app/ask.classification_skipped',
        data: {
          sessionId,
          exchangeCount,
          reason:
            classification.candidates.length === 0
              ? 'no_match'
              : 'below_threshold',
          topConfidence: classification.candidates[0]?.confidence ?? 0,
        },
      });
      return { skipped: true, reason: 'no_match_above_threshold' };
    }

    const payload = {
      subjectId: topCandidate.subjectId,
      subjectName: topCandidate.subjectName,
      confidence: topCandidate.confidence,
    };

    await step.run('write-metadata', async () => {
      await db
        .update(learningSessions)
        .set({
          metadata: sql`jsonb_set(
            COALESCE(${learningSessions.metadata}, '{}'::jsonb),
            '{silentClassification}',
            ${JSON.stringify(payload)}::jsonb,
            true
          )`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(learningSessions.id, sessionId),
            eq(learningSessions.profileId, profileId)
          )
        );
    });

    await step.sendEvent('classification-completed', {
      name: 'app/ask.classification_completed',
      data: {
        sessionId,
        exchangeCount,
        subjectId: topCandidate.subjectId,
        subjectName: topCandidate.subjectName,
        confidence: topCandidate.confidence,
      },
    });

    return {
      skipped: false,
      subjectId: topCandidate.subjectId,
      confidence: topCandidate.confidence,
    };
  }
);

export const askSilentClassifyOnFailure = inngest.createFunction(
  { id: 'ask-silent-classify-on-failure', name: 'Ask silent classify failure' },
  {
    event: 'inngest/function.failed',
    if: 'event.data.function_id == "ask-silent-classify"',
  },
  async ({ event, step }) => {
    const data = event.data as {
      error?: { message?: string };
      event?: { data?: { sessionId?: string; exchangeCount?: number } };
    };

    logger.warn('[ask-silent-classify] terminal failure', {
      sessionId: data.event?.data?.sessionId,
      error: data.error?.message ?? 'unknown',
    });

    await step.sendEvent('classification-failed', {
      name: 'app/ask.classification_failed',
      data: {
        sessionId: data.event?.data?.sessionId,
        exchangeCount: data.event?.data?.exchangeCount,
        error: data.error?.message ?? 'unknown',
      },
    });

    return { ok: true };
  }
);
