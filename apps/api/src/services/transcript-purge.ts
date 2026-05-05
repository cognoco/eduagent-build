import { and, eq, isNull } from 'drizzle-orm';
import {
  sessionEmbeddings,
  sessionEvents,
  sessionSummaries,
  type Database,
} from '@eduagent/database';
import { llmSummarySchema, type LlmSummary } from '@eduagent/schemas';
import { generateEmbedding } from './embeddings';
import { createLogger } from './logger';

const logger = createLogger();

export interface TranscriptPurgeResult {
  status: 'purged' | 'skipped';
  reason?: string;
  sessionId?: string;
  sessionSummaryId?: string;
  eventsDeleted?: number;
  embeddingRowsReplaced?: number;
  purgedAt?: Date;
}

export function buildSummaryEmbeddingText(
  summary: LlmSummary,
  learnerRecap: string | null
): string {
  const lines = [
    `Narrative: ${summary.narrative}`,
    `Topics: ${summary.topicsCovered.join(', ')}`,
    `Session state: ${summary.sessionState}`,
  ];
  if (learnerRecap) {
    lines.push(`Learner recap: ${learnerRecap}`);
  }
  lines.push(`Resume here: ${summary.reEntryRecommendation}`);
  return lines.join('\n');
}

export async function purgeSessionTranscript(
  db: Database,
  profileId: string,
  sessionSummaryId: string,
  voyageApiKey: string
): Promise<TranscriptPurgeResult> {
  const row = await db.query.sessionSummaries.findFirst({
    where: and(
      eq(sessionSummaries.id, sessionSummaryId),
      eq(sessionSummaries.profileId, profileId)
    ),
    columns: {
      id: true,
      sessionId: true,
      profileId: true,
      topicId: true,
      llmSummary: true,
      learnerRecap: true,
      purgedAt: true,
    },
  });

  if (!row) {
    logger.warn('transcript-purge.skipped', {
      surface: 'transcript-purge',
      reason: 'summary_missing',
      profileId,
      sessionSummaryId,
    });
    return {
      status: 'skipped',
      reason: 'summary_missing',
      sessionSummaryId,
    };
  }

  if (row.purgedAt) {
    logger.warn('transcript-purge.skipped', {
      surface: 'transcript-purge',
      reason: 'already_purged',
      profileId,
      sessionId: row.sessionId,
      sessionSummaryId,
    });
    return {
      status: 'skipped',
      reason: 'already_purged',
      sessionId: row.sessionId,
      sessionSummaryId,
      purgedAt: row.purgedAt,
    };
  }

  if (!row.learnerRecap) {
    logger.warn('transcript-purge.skipped', {
      surface: 'transcript-purge',
      reason: 'missing_learner_recap',
      profileId,
      sessionId: row.sessionId,
      sessionSummaryId,
    });
    return {
      status: 'skipped',
      reason: 'missing_learner_recap',
      sessionId: row.sessionId,
      sessionSummaryId,
    };
  }

  const parsed = llmSummarySchema.safeParse(row.llmSummary);
  if (!parsed.success) {
    logger.warn('transcript-purge.skipped', {
      surface: 'transcript-purge',
      reason: 'invalid_llm_summary',
      profileId,
      sessionId: row.sessionId,
      sessionSummaryId,
      validationIssues: parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; '),
    });
    return {
      status: 'skipped',
      reason: 'invalid_llm_summary',
      sessionId: row.sessionId,
      sessionSummaryId,
    };
  }

  const content = buildSummaryEmbeddingText(parsed.data, row.learnerRecap);
  const embedding = await generateEmbedding(content, voyageApiKey);
  const now = new Date();

  const outcome = await db.transaction(async (tx) => {
    const updated = await tx
      .update(sessionSummaries)
      .set({
        purgedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(sessionSummaries.id, sessionSummaryId),
          eq(sessionSummaries.profileId, profileId),
          isNull(sessionSummaries.purgedAt)
        )
      )
      .returning({ id: sessionSummaries.id });

    if (updated.length === 0) {
      return {
        alreadyPurged: true,
        eventsDeleted: 0,
        embeddingRowsReplaced: 0,
      };
    }

    const replacedEmbeddings = await tx
      .delete(sessionEmbeddings)
      .where(
        and(
          eq(sessionEmbeddings.sessionId, row.sessionId),
          eq(sessionEmbeddings.profileId, profileId)
        )
      )
      .returning({ id: sessionEmbeddings.id });

    await tx
      .insert(sessionEmbeddings)
      .values({
        sessionId: row.sessionId,
        profileId,
        topicId: row.topicId ?? null,
        content,
        embedding: embedding.vector,
      })
      .onConflictDoUpdate({
        target: [sessionEmbeddings.sessionId, sessionEmbeddings.profileId],
        set: {
          topicId: row.topicId ?? null,
          content,
          embedding: embedding.vector,
        },
      });

    const deletedEvents = await tx
      .delete(sessionEvents)
      .where(
        and(
          eq(sessionEvents.sessionId, row.sessionId),
          eq(sessionEvents.profileId, profileId)
        )
      )
      .returning({ id: sessionEvents.id });

    return {
      alreadyPurged: false,
      eventsDeleted: deletedEvents.length,
      embeddingRowsReplaced: replacedEmbeddings.length,
    };
  });

  if (outcome.alreadyPurged) {
    logger.warn('transcript-purge.skipped', {
      surface: 'transcript-purge',
      reason: 'already_purged',
      profileId,
      sessionId: row.sessionId,
      sessionSummaryId,
    });
    return {
      status: 'skipped',
      reason: 'already_purged',
      sessionId: row.sessionId,
      sessionSummaryId,
    };
  }

  logger.info('transcript-purge.completed', {
    profileId,
    sessionId: row.sessionId,
    sessionSummaryId,
    eventsDeleted: outcome.eventsDeleted,
    embeddingRowsReplaced: outcome.embeddingRowsReplaced,
  });

  return {
    status: 'purged',
    sessionId: row.sessionId,
    sessionSummaryId,
    eventsDeleted: outcome.eventsDeleted,
    embeddingRowsReplaced: outcome.embeddingRowsReplaced,
    purgedAt: now,
  };
}
