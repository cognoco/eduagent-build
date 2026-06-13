// @inngest-admin: parent-chain (sessionSummaries and learningSessions scoped by profileId)
import { and, eq } from 'drizzle-orm';
import {
  learningSessions,
  profiles,
  sessionSummaries,
} from '@eduagent/database';
import { NonRetriableError } from 'inngest';
import type { LlmSummary, SummaryEventPayload } from '@eduagent/schemas';
import { summaryEventPayloadSchema } from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase, isIdentityV2EnabledInStep } from '../helpers';
import { parseConversationLanguage } from '../../services/llm';
import { getPersonLlmContext } from '../../services/identity-v2/helpers';
import { createPendingSessionSummary } from '../../services/summaries';
import { generateAndStoreLlmSummary } from '../../services/session-llm-summary';
import { generateLearnerRecap } from '../../services/session-recap';
import { captureException } from '../../services/sentry';

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

  // [CUT-B1 §2.5(iii)] v2 seam: birthYear + conversation_language from person.
  let profile: {
    birthYear: number;
    conversationLanguage: string | null;
  } | null;
  if (isIdentityV2EnabledInStep()) {
    const ctx = await getPersonLlmContext(db, payload.profileId);
    profile = ctx
      ? {
          birthYear: ctx.birthYear,
          conversationLanguage: ctx.conversationLanguage,
        }
      : null;
  } else {
    const [row] = await db
      .select({
        birthYear: profiles.birthYear,
        conversationLanguage: profiles.conversationLanguage,
      })
      .from(profiles)
      .where(eq(profiles.id, payload.profileId))
      .limit(1);
    profile = row ?? null;
  }

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
    // DB returns string | null; parse to union before passing to LLM call.
    conversationLanguage: parseConversationLanguage(
      profile?.conversationLanguage,
    ),
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
    // [FIX-428] Idempotency: duplicate app/session.summary.create events (daily
    // reconciliation cron re-fires, operator replay) dedup within 24 h so only
    // one execution runs per sessionId — prevents a second LLM call burning
    // tokens for an already-created summary.
    idempotency: 'event.data.sessionId',
  },
  { event: 'app/session.summary.create' },
  async ({ event, step }) => {
    // [FIX-428] Validate payload at function entry so a malformed event throws
    // NonRetriableError and never enters the retry queue.
    const parsed = summaryEventPayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      throw new NonRetriableError(
        `[session-summary-create] invalid payload: ${parsed.error.message}`,
      );
    }
    const payload: SummaryEventPayload = parsed.data;

    const result = await step.run('create-summary', async () => {
      const db = getStepDatabase();
      const summaryRow = await createPendingSessionSummary(
        db,
        payload.sessionId,
        payload.profileId,
        payload.topicId ?? null,
        'pending',
      );

      // i18n Phase 1 — load conversation_language for summary prose.
      // [CUT-B1 §2.5(iii)] v2 seam: person.conversation_language.
      let createConversationLanguage: string | null | undefined;
      if (isIdentityV2EnabledInStep()) {
        const ctx = await getPersonLlmContext(db, payload.profileId);
        createConversationLanguage = ctx?.conversationLanguage;
      } else {
        const [createProfile] = await db
          .select({ conversationLanguage: profiles.conversationLanguage })
          .from(profiles)
          .where(eq(profiles.id, payload.profileId))
          .limit(1);
        createConversationLanguage = createProfile?.conversationLanguage;
      }

      const summary = await generateAndStoreLlmSummary(db, {
        sessionId: payload.sessionId,
        profileId: payload.profileId,
        summaryId: summaryRow.id,
        subjectId: payload.subjectId ?? null,
        topicId: payload.topicId ?? null,
        // DB returns string | null; parse to union before passing to LLM call.
        conversationLanguage: parseConversationLanguage(
          createConversationLanguage,
        ),
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
    // [SWEEP-428] Same idempotency guard applied across all three summary
    // handlers — dedup on sessionId within 24 h prevents duplicate LLM calls
    // from reconciliation-cron fan-out.
    idempotency: 'event.data.sessionId',
  },
  { event: 'app/session.summary.regenerate' },
  async ({ event, step }) => {
    // [SWEEP-428] Validate payload at function entry.
    const parsed = summaryEventPayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      throw new NonRetriableError(
        `[session-summary-regenerate] invalid payload: ${parsed.error.message}`,
      );
    }
    const payload: SummaryEventPayload = parsed.data;

    const result = await step.run('regenerate-summary', async () => {
      const db = getStepDatabase();
      // i18n Phase 1 — load conversation_language for the regenerated summary.
      const [regenerateProfile] = await db
        .select({ conversationLanguage: profiles.conversationLanguage })
        .from(profiles)
        .where(eq(profiles.id, payload.profileId))
        .limit(1);
      const summary = await generateAndStoreLlmSummary(db, {
        sessionId: payload.sessionId,
        profileId: payload.profileId,
        summaryId: payload.sessionSummaryId,
        subjectId: payload.subjectId ?? null,
        topicId: payload.topicId ?? null,
        // DB returns string | null; parse to union before passing to LLM call.
        conversationLanguage: parseConversationLanguage(
          regenerateProfile?.conversationLanguage,
        ),
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
    // [FIX-429] Idempotency: duplicate app/session.learner-recap.regenerate
    // events (daily reconciliation cron re-fires, operator replay) dedup within
    // 24 h so only one execution runs per sessionId — prevents a second LLM
    // recap call burning tokens for an already-regenerated recap.
    idempotency: 'event.data.sessionId',
  },
  { event: 'app/session.learner-recap.regenerate' },
  async ({ event, step }) => {
    // [FIX-429] Validate payload at function entry so a malformed event throws
    // NonRetriableError and never enters the retry queue.
    const parsed = summaryEventPayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      throw new NonRetriableError(
        `[session-learner-recap-regenerate] invalid payload: ${parsed.error.message}`,
      );
    }
    const payload: SummaryEventPayload = parsed.data;

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
