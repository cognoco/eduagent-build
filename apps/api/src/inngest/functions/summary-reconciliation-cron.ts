// @inngest-admin: cross-profile
import { and, eq, gte, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { learningSessions, sessionSummaries } from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';

const CREATE_LIMIT = 50;
const REGENERATE_LIMIT = 50;
const RECAP_LIMIT = 50;

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export const summaryReconciliationCron = inngest.createFunction(
  {
    id: 'session-summary-reconciliation-cron',
    name: 'Reconcile missing session summaries',
  },
  { cron: '0 4 * * *' },
  async ({ step }) => {
    const now = new Date();
    const since = new Date(now);
    since.setUTCDate(since.getUTCDate() - 37);
    const sixHoursAgo = new Date(now.getTime() - SIX_HOURS_MS);

    const missingSummaries = await step.run(
      'find-missing-summaries',
      async () => {
        const db = getStepDatabase();
        return db
          .select({
            sessionId: learningSessions.id,
            profileId: learningSessions.profileId,
            subjectId: learningSessions.subjectId,
            topicId: learningSessions.topicId,
          })
          .from(learningSessions)
          .leftJoin(
            sessionSummaries,
            and(
              eq(sessionSummaries.sessionId, learningSessions.id),
              eq(sessionSummaries.profileId, learningSessions.profileId)
            )
          )
          .where(
            and(
              isNotNull(learningSessions.endedAt),
              gte(learningSessions.endedAt, since),
              lt(learningSessions.endedAt, sixHoursAgo),
              isNull(sessionSummaries.id)
            )
          )
          .limit(CREATE_LIMIT);
      }
    );

    const missingLlmSummaries = await step.run(
      'find-missing-llm-summaries',
      async () => {
        const db = getStepDatabase();
        return db
          .select({
            sessionSummaryId: sessionSummaries.id,
            sessionId: sessionSummaries.sessionId,
            profileId: sessionSummaries.profileId,
            subjectId: learningSessions.subjectId,
            topicId: sessionSummaries.topicId,
          })
          .from(sessionSummaries)
          .innerJoin(
            learningSessions,
            and(
              eq(learningSessions.id, sessionSummaries.sessionId),
              eq(learningSessions.profileId, sessionSummaries.profileId)
            )
          )
          .where(
            and(
              gte(learningSessions.endedAt, since),
              lt(learningSessions.endedAt, sixHoursAgo),
              or(
                isNull(sessionSummaries.summaryGeneratedAt),
                isNull(sessionSummaries.llmSummary)
              ),
              isNull(sessionSummaries.purgedAt)
            )
          )
          .limit(REGENERATE_LIMIT);
      }
    );

    const recapSince = new Date();
    recapSince.setUTCDate(recapSince.getUTCDate() - 30);
    const missingRecaps = await step.run(
      'find-missing-learner-recaps',
      async () => {
        const db = getStepDatabase();
        return db
          .select({
            sessionSummaryId: sessionSummaries.id,
            sessionId: sessionSummaries.sessionId,
            profileId: sessionSummaries.profileId,
            subjectId: learningSessions.subjectId,
            topicId: sessionSummaries.topicId,
          })
          .from(sessionSummaries)
          .innerJoin(
            learningSessions,
            and(
              eq(learningSessions.id, sessionSummaries.sessionId),
              eq(learningSessions.profileId, sessionSummaries.profileId)
            )
          )
          .where(
            and(
              gte(learningSessions.endedAt, recapSince),
              lt(learningSessions.endedAt, sixHoursAgo),
              isNotNull(sessionSummaries.summaryGeneratedAt),
              isNull(sessionSummaries.learnerRecap),
              isNull(sessionSummaries.purgedAt)
            )
          )
          .limit(RECAP_LIMIT);
      }
    );

    const timestamp = new Date().toISOString();

    if (missingSummaries.length > 0) {
      await step.sendEvent(
        'fan-out-create-summaries',
        missingSummaries.map((row) => ({
          name: 'app/session.summary.create' as const,
          data: { ...row, timestamp },
        }))
      );
    }

    if (missingLlmSummaries.length > 0) {
      await step.sendEvent(
        'fan-out-regenerate-summaries',
        missingLlmSummaries.map((row) => ({
          name: 'app/session.summary.regenerate' as const,
          data: { ...row, timestamp },
        }))
      );
    }

    if (missingRecaps.length > 0) {
      await step.sendEvent(
        'fan-out-regenerate-recaps',
        missingRecaps.map((row) => ({
          name: 'app/session.learner-recap.regenerate' as const,
          data: { ...row, timestamp },
        }))
      );
    }

    await step.sendEvent('notify-summary-reconciliation-scanned', {
      name: 'app/summary.reconciliation.scanned',
      data: {
        createCount: missingSummaries.length,
        regenerateCount: missingLlmSummaries.length,
        recapCount: missingRecaps.length,
        timestamp,
      },
    });

    await step.sendEvent('notify-summary-reconciliation-requeued', {
      name: 'app/summary.reconciliation.requeued',
      data: {
        createCount: missingSummaries.length,
        regenerateCount: missingLlmSummaries.length,
        recapCount: missingRecaps.length,
        totalCount:
          missingSummaries.length +
          missingLlmSummaries.length +
          missingRecaps.length,
        timestamp,
      },
    });

    return {
      status: 'completed',
      createCount: missingSummaries.length,
      regenerateCount: missingLlmSummaries.length,
      recapCount: missingRecaps.length,
    };
  }
);
