import { and, eq } from 'drizzle-orm';
import {
  learningSessions,
  profiles,
  sessionSummaries,
} from '@eduagent/database';
import type { LlmSummary } from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { createPendingSessionSummary } from '../../services/summaries';
import { generateAndStoreLlmSummary } from '../../services/session-llm-summary';
import { generateLearnerRecap } from '../../services/session-recap';
import { captureException } from '../../services/sentry';

interface SummaryEventPayload {
  profileId: string;
  sessionId: string;
  timestamp: string;
  subjectId?: string | null;
  topicId?: string | null;
  sessionSummaryId?: string;
}

function buildSummaryGeneratedEvent(
  payload: SummaryEventPayload,
  sessionSummaryId: string | null,
  summary: LlmSummary,
) {
  return {
    name: 'app/session.summary.generated' as const,
    data: {
      profileId: payload.profileId,
      sessionId: payload.sessionId,
      sessionSummaryId,
      sessionState: summary.sessionState,
      topicsCount: summary.topicsCovered.length,
      narrativeLength: summary.narrative.length,
      timestamp: new Date().toISOString(),
    },
  };
}

function buildSummaryFailedEvent(
  payload: SummaryEventPayload,
  sessionSummaryId?: string,
) {
  return {
    name: 'app/session.summary.failed' as const,
    data: {
      profileId: payload.profileId,
      sessionId: payload.sessionId,
      sessionSummaryId: sessionSummaryId ?? null,
      timestamp: new Date().toISOString(),
    },
  };
}

async function regenerateLearnerRecapForSession(
  payload: SummaryEventPayload,
): Promise<{ status: string }> {
  const db = getStepDatabase();
  const [summaryRow] = await db
    .select({
      id: sessionSummaries.id,
      profileId: sessionSummaries.profileId,
      sessionId: sessionSummaries.sessionId,
    })
    .from(sessionSummaries)
    .where(
      and(
        eq(sessionSummaries.sessionId, payload.sessionId),
        eq(sessionSummaries.profileId, payload.profileId),
      ),
    )
    .limit(1);

  if (!summaryRow) {
    return { status: 'skipped_summary_missing' };
  }

  const [sessionRow] = await db
    .select({
      subjectId: learningSessions.subjectId,
      topicId: learningSessions.topicId,
      exchangeCount: learningSessions.exchangeCount,
    })
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.id, payload.sessionId),
        eq(learningSessions.profileId, payload.profileId),
      ),
    )
    .limit(1);

  if (!sessionRow?.subjectId) {
    return { status: 'skipped_subject_missing' };
  }

  const [profile] = await db
    .select({ birthYear: profiles.birthYear })
    .from(profiles)
    .where(eq(profiles.id, payload.profileId))
    .limit(1);

  if (!profile) {
    throw new Error(
      `[summary-regenerate] Profile not found for profileId=${payload.profileId} — aborting`,
    );
  }

  const recap = await generateLearnerRecap(db, {
    sessionId: payload.sessionId,
    profileId: payload.profileId,
    topicId: sessionRow.topicId ?? null,
    subjectId: sessionRow.subjectId,
    exchangeCount: sessionRow.exchangeCount ?? 0,
    birthYear: profile.birthYear,
  });

  if (!recap) {
    return { status: 'skipped_no_recap' };
  }

  await db
    .update(sessionSummaries)
    .set({
      closingLine: recap.closingLine,
      learnerRecap: recap.learnerRecap,
      nextTopicId: recap.nextTopicId,
      nextTopicReason: recap.nextTopicReason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sessionSummaries.id, summaryRow.id),
        eq(sessionSummaries.profileId, payload.profileId),
      ),
    );

  return { status: 'completed' };
}

export const sessionSummaryCreate = inngest.createFunction(
  {
    id: 'session-summary-create',
    name: 'Create and generate a missing session summary',
  },
  { event: 'app/session.summary.create' },
  async ({ event, step }) => {
    const payload = event.data as SummaryEventPayload;

    const result = await step.run('create-summary', async () => {
      const db = getStepDatabase();
      const summaryRow = await createPendingSessionSummary(
        db,
        payload.sessionId,
        payload.profileId,
        payload.topicId ?? null,
        'pending',
      );

      const summary = await generateAndStoreLlmSummary(db, {
        sessionId: payload.sessionId,
        profileId: payload.profileId,
        summaryId: summaryRow.id,
        subjectId: payload.subjectId ?? null,
        topicId: payload.topicId ?? null,
      });

      if (!summary) {
        return {
          status: 'skipped_no_summary' as const,
          summaryId: summaryRow.id,
        };
      }

      return {
        status: 'completed' as const,
        summaryId: summaryRow.id,
        summary,
      };
    });

    if (result.status === 'skipped_no_summary') {
      await step.sendEvent(
        'notify-session-summary-create-failed',
        buildSummaryFailedEvent(payload, result.summaryId),
      );
    } else {
      await step.sendEvent(
        'notify-session-summary-created',
        buildSummaryGeneratedEvent(payload, result.summaryId, result.summary),
      );
    }

    return {
      status: result.status,
      summaryId: result.summaryId,
    };
  },
);

export const sessionSummaryRegenerate = inngest.createFunction(
  {
    id: 'session-summary-regenerate',
    name: 'Regenerate an existing session llm summary',
  },
  { event: 'app/session.summary.regenerate' },
  async ({ event, step }) => {
    const payload = event.data as SummaryEventPayload;

    const result = await step.run('regenerate-summary', async () => {
      const db = getStepDatabase();
      const summary = await generateAndStoreLlmSummary(db, {
        sessionId: payload.sessionId,
        profileId: payload.profileId,
        summaryId: payload.sessionSummaryId,
        subjectId: payload.subjectId ?? null,
        topicId: payload.topicId ?? null,
      });

      return {
        status: summary ? 'completed' : 'skipped_no_summary',
        regenerated: summary != null,
        summary,
      };
    });

    if (!result.summary) {
      await step.sendEvent(
        'notify-session-summary-regenerate-failed',
        buildSummaryFailedEvent(payload, payload.sessionSummaryId),
      );
    } else {
      await step.sendEvent(
        'notify-session-summary-regenerated',
        buildSummaryGeneratedEvent(
          payload,
          payload.sessionSummaryId ?? null,
          result.summary,
        ),
      );
    }

    return {
      status: result.status,
      regenerated: result.regenerated,
    };
  },
);

export const learnerRecapRegenerate = inngest.createFunction(
  {
    id: 'session-learner-recap-regenerate',
    name: 'Regenerate a missing learner recap',
    retries: 3,
  },
  { event: 'app/session.learner-recap.regenerate' },
  async ({ event, step }) => {
    const payload = event.data as SummaryEventPayload;

    return step.run('regenerate-learner-recap', async () => {
      try {
        return await regenerateLearnerRecapForSession(payload);
      } catch (error) {
        captureException(error, {
          profileId: payload.profileId,
          extra: {
            sessionId: payload.sessionId,
            surface: 'learner-recap-regenerate',
          },
        });
        throw error;
      }
    });
  },
);
