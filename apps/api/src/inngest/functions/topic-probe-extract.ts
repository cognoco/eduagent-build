import { and, asc, eq } from 'drizzle-orm';

import {
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  retentionCards,
  sessionEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import {
  extractedInterviewSignalsSchema,
  topicProbeRequestedEventSchema,
  type ExchangeEntry,
  type TopicProbeRequestedEvent,
} from '@eduagent/schemas';

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  defaultExtractedSignals,
  extractSignalsFromExchangeHistory,
} from '../../services/session/topic-probe-extraction';
import {
  ensureRetentionCard,
  evaluateRecallQuality,
} from '../../services/retention-data';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';

const logger = createLogger();

function parseEventData(data: unknown): TopicProbeRequestedEvent | null {
  const parsed = topicProbeRequestedEventSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

async function loadTopicProbeHistory(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<ExchangeEntry[]> {
  const rows = await db
    .select({
      eventType: sessionEvents.eventType,
      content: sessionEvents.content,
    })
    .from(sessionEvents)
    .where(
      and(
        eq(sessionEvents.profileId, profileId),
        eq(sessionEvents.sessionId, sessionId)
      )
    )
    .orderBy(asc(sessionEvents.createdAt), asc(sessionEvents.id));

  return rows
    .filter(
      (row) =>
        row.eventType === 'user_message' || row.eventType === 'ai_response'
    )
    .map((row) => ({
      role: row.eventType === 'user_message' ? 'user' : 'assistant',
      content: row.content,
    }));
}

function buildRetentionSeed(
  quality: number,
  seededAt: Date
): {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewAt: Date;
} | null {
  const clamped = Math.max(0, Math.min(5, Math.round(quality)));
  if (clamped < 3) return null;

  const intervalDays = clamped >= 5 ? 4 : clamped === 4 ? 2 : 1;
  const easeFactor = clamped >= 5 ? 2.7 : clamped === 4 ? 2.6 : 2.5;
  const nextReviewAt = new Date(seededAt);
  nextReviewAt.setDate(nextReviewAt.getDate() + intervalDays);

  return {
    easeFactor,
    intervalDays,
    repetitions: 1,
    nextReviewAt,
  };
}

async function seedRetentionCard(params: {
  db: Database;
  profileId: string;
  topicId: string;
  learnerMessage: string;
  topicTitle: string;
  timestamp: string;
}): Promise<number | null> {
  const { db, profileId, topicId, learnerMessage, topicTitle, timestamp } =
    params;
  const { card, isNew } = await ensureRetentionCard(db, profileId, topicId);
  if (!isNew || card.repetitions > 0 || card.lastReviewedAt) {
    return null;
  }

  const quality = await evaluateRecallQuality(learnerMessage, topicTitle);
  const seededAt = new Date(timestamp);
  const seed = buildRetentionSeed(quality, seededAt);
  if (!seed) return quality;

  await db
    .update(retentionCards)
    .set({
      easeFactor: seed.easeFactor,
      intervalDays: seed.intervalDays,
      repetitions: seed.repetitions,
      nextReviewAt: seed.nextReviewAt,
      updatedAt: seededAt,
    })
    .where(
      and(
        eq(retentionCards.id, card.id),
        eq(retentionCards.profileId, profileId),
        eq(retentionCards.repetitions, 0)
      )
    );

  return quality;
}

export async function handleTopicProbeExtract({
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

  const session = await step.run('load-session', async () => {
    const db = getStepDatabase();
    const [row] = await db
      .select({
        id: learningSessions.id,
        profileId: learningSessions.profileId,
        subjectId: learningSessions.subjectId,
        topicId: learningSessions.topicId,
        metadata: learningSessions.metadata,
        sessionType: learningSessions.sessionType,
      })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.id, payload.sessionId),
          eq(learningSessions.profileId, payload.profileId)
        )
      )
      .limit(1);
    return row ?? null;
  });

  if (!session || session.topicId !== payload.topicId) {
    return { skipped: 'session_not_found_or_topic_changed' };
  }
  if (session.subjectId !== payload.subjectId) {
    return { skipped: 'subject_changed' };
  }

  const history = await step.run('load-transcript', async () => {
    const db = getStepDatabase();
    return loadTopicProbeHistory(db, payload.profileId, payload.sessionId);
  });
  if (history.length === 0) {
    return { skipped: 'empty_transcript', sessionId: payload.sessionId };
  }

  const extractedSignals = await step.run('extract-signals', () =>
    extractSignalsFromExchangeHistory(history)
  );
  const parsedSignalsResult =
    extractedInterviewSignalsSchema.safeParse(extractedSignals);
  const parsedSignals = parsedSignalsResult.success
    ? parsedSignalsResult.data
    : defaultExtractedSignals(history);
  if (!parsedSignalsResult.success) {
    logger.warn('[topic-probe-extract] extracted signals failed validation', {
      event: 'topic_probe.extract_invalid_signals',
      profileId: payload.profileId,
      sessionId: payload.sessionId,
      topicId: payload.topicId,
      issues: parsedSignalsResult.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const priorKnowledgeQuality = await step.run(
    'seed-retention-card',
    async () => {
      const db = getStepDatabase();
      const [topic] = await db
        .select({ id: curriculumTopics.id })
        .from(curriculumTopics)
        .innerJoin(
          curriculumBooks,
          eq(curriculumBooks.id, curriculumTopics.bookId)
        )
        .innerJoin(subjects, eq(subjects.id, curriculumBooks.subjectId))
        .where(
          and(
            eq(curriculumTopics.id, payload.topicId),
            eq(subjects.profileId, payload.profileId)
          )
        )
        .limit(1);
      if (!topic) return null;
      return seedRetentionCard({
        db,
        profileId: payload.profileId,
        topicId: payload.topicId,
        learnerMessage: payload.learnerMessage,
        topicTitle: payload.topicTitle,
        timestamp: payload.timestamp,
      });
    }
  );

  await step.run('persist-session-metadata', async () => {
    const db = getStepDatabase();
    const [fresh] = await db
      .select({ metadata: learningSessions.metadata })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.id, payload.sessionId),
          eq(learningSessions.profileId, payload.profileId)
        )
      )
      .limit(1);
    const metadata = {
      ...((fresh?.metadata as Record<string, unknown> | null) ?? {}),
      extractedSignals: parsedSignals,
      topicProbeExtractedAt: new Date().toISOString(),
      topicProbeExtractionStatus: 'completed',
      ...(priorKnowledgeQuality != null
        ? { topicProbePriorKnowledgeQuality: priorKnowledgeQuality }
        : {}),
    };
    await db
      .update(learningSessions)
      .set({ metadata, updatedAt: new Date() })
      .where(
        and(
          eq(learningSessions.id, payload.sessionId),
          eq(learningSessions.profileId, payload.profileId)
        )
      );
  });

  return {
    sessionId: payload.sessionId,
    topicId: payload.topicId,
    signalCount:
      parsedSignals.goals.length +
      (parsedSignals.interests?.length ?? 0) +
      (parsedSignals.currentKnowledge ? 1 : 0),
    priorKnowledgeQuality,
  };
}

export const topicProbeExtract = inngest.createFunction(
  {
    id: 'topic-probe-extract',
    retries: 2,
    onFailure: async ({
      event,
      error,
    }: {
      event: {
        data: { event: { data: Record<string, unknown> }; error: unknown };
      };
      error: unknown;
    }) => {
      const payload = parseEventData(event.data?.event?.data);
      if (!payload) return;

      logger.error('[topic-probe-extract] exhausted retries', {
        event: 'topic_probe.extract_failed',
        profileId: payload.profileId,
        sessionId: payload.sessionId,
        topicId: payload.topicId,
        error: error instanceof Error ? error.message : String(error),
      });
      captureException(error, {
        profileId: payload.profileId,
        extra: {
          site: 'topicProbeExtract.onFailure',
          sessionId: payload.sessionId,
          topicId: payload.topicId,
        },
      });

      try {
        const db = getStepDatabase();
        const [fresh] = await db
          .select({ metadata: learningSessions.metadata })
          .from(learningSessions)
          .where(
            and(
              eq(learningSessions.id, payload.sessionId),
              eq(learningSessions.profileId, payload.profileId)
            )
          )
          .limit(1);
        await db
          .update(learningSessions)
          .set({
            metadata: {
              ...((fresh?.metadata as Record<string, unknown> | null) ?? {}),
              topicProbeExtractionStatus: 'failed',
            },
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(learningSessions.id, payload.sessionId),
              eq(learningSessions.profileId, payload.profileId)
            )
          );
      } catch (cleanupError) {
        logger.error('[topic-probe-extract] failure cleanup failed', {
          event: 'topic_probe.failure_cleanup_failed',
          profileId: payload.profileId,
          sessionId: payload.sessionId,
          topicId: payload.topicId,
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        });
        captureException(cleanupError, {
          profileId: payload.profileId,
          extra: {
            site: 'topicProbeExtract.onFailure.cleanup',
            sessionId: payload.sessionId,
            topicId: payload.topicId,
          },
        });
      }
    },
  },
  { event: 'app/topic-probe.requested' },
  handleTopicProbeExtract
);
