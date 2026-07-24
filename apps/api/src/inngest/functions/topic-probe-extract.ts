// @inngest-admin: parent-chain (sessionEvents.profileId enforced in WHERE)
import { and, asc, eq, sql } from 'drizzle-orm';

import {
  curriculumBooks,
  curriculumTopics,
  learningSessions,
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
import {
  closeStepDatabases,
  getStepDatabase,
  runWithStepDatabaseScope,
} from '../helpers';
import {
  defaultExtractedSignals,
  extractSignalsFromExchangeHistory,
} from '../../services/session/topic-probe-extraction';
import {
  ensureRetentionCard,
  evaluateRecallQuality,
} from '../../services/retention-data';
import { applyRetentionUpdate } from '../../services/apply-retention-update';
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
  sessionId: string,
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
        eq(sessionEvents.sessionId, sessionId),
      ),
    )
    .orderBy(asc(sessionEvents.createdAt), asc(sessionEvents.id));

  return rows
    .filter(
      (row) =>
        row.eventType === 'user_message' || row.eventType === 'ai_response',
    )
    .map((row) => ({
      role: row.eventType === 'user_message' ? 'user' : 'assistant',
      content: row.content,
    }));
}

function buildRetentionSeed(
  quality: number,
  seededAt: Date,
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

  const grade = await evaluateRecallQuality(
    learnerMessage,
    topicTitle,
    profileId,
  );
  // [Flow 2 / T7] Never seed SM-2 state from a guess. If the grader was
  // unavailable, skip seeding entirely — the card stays unseeded and a later
  // real grade can seed it.
  if (!grade.graded) {
    return null;
  }
  const quality = grade.quality;
  const seededAt = new Date(timestamp);
  const seed = buildRetentionSeed(quality, seededAt);
  if (!seed) return quality;

  await applyRetentionUpdate({
    db,
    profileId,
    cardId: card.id,
    set: {
      easeFactor: seed.easeFactor,
      intervalDays: seed.intervalDays,
      repetitions: seed.repetitions,
      nextReviewAt: seed.nextReviewAt,
    },
    guard: { kind: 'repetitionsZero' },
    updatedAt: seededAt,
  });

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

  // PII egress: step returns are memoized into Inngest's third-party state
  // store. `metadata` (which can carry prior runs' extractedSignals) and
  // `sessionType` are deliberately not selected — the handler only needs the
  // identifiers to validate the event reference.
  const session = await step.run('load-session', async () => {
    const db = getStepDatabase();
    const [row] = await db
      .select({
        id: learningSessions.id,
        profileId: learningSessions.profileId,
        subjectId: learningSessions.subjectId,
        topicId: learningSessions.topicId,
      })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.id, payload.sessionId),
          eq(learningSessions.profileId, payload.profileId),
        ),
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

  // Runs before the extraction step so its memoized return (a bare quality
  // number, non-PII) is available to the metadata write inside the merged
  // extract-signals closure. On an empty/purged transcript the
  // learner-message lookup below comes up empty and this step no-ops (no
  // card row created, no LLM call) — matching the pre-reorder behavior where
  // seeding never ran for empty transcripts.
  const priorKnowledgeQuality = await step.run(
    'seed-retention-card',
    async () => {
      const db = getStepDatabase();
      const [topic] = await db
        .select({ id: curriculumTopics.id, title: curriculumTopics.title })
        .from(curriculumTopics)
        .innerJoin(
          curriculumBooks,
          eq(curriculumBooks.id, curriculumTopics.bookId),
        )
        .innerJoin(subjects, eq(subjects.id, curriculumBooks.subjectId))
        .where(
          and(
            eq(curriculumTopics.id, payload.topicId),
            eq(subjects.profileId, payload.profileId),
          ),
        )
        .limit(1);
      if (!topic) return null;
      // PII egress: Rehydrate the learner's probe answer from the DB by
      // the event's opaque reference — the raw text never rides in the event
      // payload, and as a local variable here it is never serialized into
      // Inngest state. A missing row (e.g. transcript purged since dispatch)
      // skips seeding rather than guessing at a different message.
      const [learnerMessageRow] = await db
        .select({ content: sessionEvents.content })
        .from(sessionEvents)
        .where(
          and(
            eq(sessionEvents.id, payload.learnerMessageEventId),
            eq(sessionEvents.profileId, payload.profileId),
            eq(sessionEvents.sessionId, payload.sessionId),
            eq(sessionEvents.eventType, 'user_message'),
          ),
        )
        .limit(1);
      if (!learnerMessageRow?.content) return null;
      return seedRetentionCard({
        db,
        profileId: payload.profileId,
        topicId: payload.topicId,
        learnerMessage: learnerMessageRow.content,
        topicTitle: topic.title,
        timestamp: payload.timestamp,
      });
    },
  );

  // PII egress: the transcript (F-028) and the inferred learner signals
  // (F-091) must never ride a memoized step return, so loading, extraction,
  // and persistence share ONE step closure — both stay local variables and
  // only an opaque signal count crosses the step boundary. Every operation
  // in here is idempotent under step-level retry: the transcript load is a
  // read, the LLM extraction is repeatable, and the metadata write is a
  // jsonb_set overwrite keyed on the same session row.
  const extraction = await step.run('extract-signals', async () => {
    const db = getStepDatabase();
    const history = await loadTopicProbeHistory(
      db,
      payload.profileId,
      payload.sessionId,
    );
    if (history.length === 0) {
      return { skipped: true as const };
    }

    const extractedSignals = await extractSignalsFromExchangeHistory(history);
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

    const extractedAt = new Date().toISOString();
    const basePatch = sql`jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE(${learningSessions.metadata}, '{}'::jsonb),
          '{extractedSignals}',
          ${JSON.stringify(parsedSignals)}::jsonb,
          true
        ),
        '{topicProbeExtractedAt}',
        ${JSON.stringify(extractedAt)}::jsonb,
        true
      ),
      '{topicProbeExtractionStatus}',
      '"completed"'::jsonb,
      true
    )`;
    const metadataPatch =
      priorKnowledgeQuality != null
        ? sql`jsonb_set(
            ${basePatch},
            '{topicProbePriorKnowledgeQuality}',
            ${JSON.stringify(priorKnowledgeQuality)}::jsonb,
            true
          )`
        : basePatch;
    await db
      .update(learningSessions)
      .set({ metadata: metadataPatch, updatedAt: new Date() })
      .where(
        and(
          eq(learningSessions.id, payload.sessionId),
          eq(learningSessions.profileId, payload.profileId),
        ),
      );

    return {
      skipped: false as const,
      signalCount:
        parsedSignals.goals.length +
        (parsedSignals.interests?.length ?? 0) +
        (parsedSignals.currentKnowledge ? 1 : 0),
    };
  });

  if (extraction.skipped) {
    return { skipped: 'empty_transcript', sessionId: payload.sessionId };
  }

  return {
    sessionId: payload.sessionId,
    topicId: payload.topicId,
    signalCount: extraction.signalCount,
    priorKnowledgeQuality,
  };
}

export const topicProbeExtract = inngest.createFunction(
  {
    id: 'topic-probe-extract',
    retries: 2,
    idempotency: 'event.data.sessionId + "-" + event.data.topicId',
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

      await runWithStepDatabaseScope(async () => {
        try {
          const db = getStepDatabase();
          await db
            .update(learningSessions)
            .set({
              metadata: sql`jsonb_set(
                COALESCE(${learningSessions.metadata}, '{}'::jsonb),
                '{topicProbeExtractionStatus}',
                '"failed"'::jsonb,
                true
              )`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(learningSessions.id, payload.sessionId),
                eq(learningSessions.profileId, payload.profileId),
                sql`COALESCE(${learningSessions.metadata} ->> 'topicProbeExtractionStatus', '') <> 'completed'`,
              ),
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
        } finally {
          await closeStepDatabases();
        }
      });
    },
  },
  { event: 'app/topic-probe.requested' },
  handleTopicProbeExtract,
);
