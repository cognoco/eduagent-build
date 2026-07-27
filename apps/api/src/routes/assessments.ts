import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  assessmentAnswerSchema,
  quickCheckRequestSchema,
  createAssessmentResponseSchema,
  submitAssessmentAnswerResponseSchema,
  getAssessmentResponseSchema,
  quickCheckFeedbackResponseSchema,
  chatExchangeSchema,
  declineAssessmentRefreshResponseSchema,
  getActiveAssessmentResponseSchema,
  computeAgeBracketFromDate,
  type QuotaModel,
} from '@eduagent/schemas';
import { parseConversationLanguage } from '../services/llm';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { assertLlmConsent } from '../services/identity-v2/consent-status-v2';
import { withProfile, type RouteEnv } from '../route-utils/route-context';
import {
  createAssessmentIfNoneActive,
  getAssessment,
  getActiveAssessmentForTopic,
  loadAssessmentTopicContext,
  evaluateQuickCheckAnswer,
  isTerminalAssessmentStatus,
  submitAssessmentAnswer,
} from '../services/assessments';
import { getSession } from '../services/session';
import { refundQuotaOrEscalate } from '../services/billing';
import { notFound } from '../errors';
import { createLogger } from '../services/logger';

const logger = createLogger();

// Extends the base RouteEnv with quota variables set by the metering
// middleware. Typed here rather than in RouteEnv itself because these variables
// are only meaningful for metered routes — adding them globally would mislead
// readers of unmetered route handlers.
type AssessmentRouteEnv = RouteEnv & {
  Variables: RouteEnv['Variables'] & {
    subscriptionId: string | undefined;
    quotaDecrementSource: 'monthly' | 'top_up' | undefined;
    quotaDecrementTopUpCreditId: string | undefined;
    quotaDecrementQuotaModel: QuotaModel | undefined;
    quotaRefunded: boolean | undefined;
  };
};

export const assessmentRoutes = new Hono<AssessmentRouteEnv>()
  // Start a topic completion assessment
  .post('/subjects/:subjectId/topics/:topicId/assessments', async (c) => {
    await assertNotProxyMode(c);
    const { db, profileId } = withProfile(c);
    const subjectId = c.req.param('subjectId');
    const topicId = c.req.param('topicId');

    // Race-safe get-or-create. The read-then-create is serialized inside the
    // service under db.transaction + SELECT ... FOR UPDATE on the parent topic
    // row; a bare `getActive ?? create` let two concurrent POSTs both INSERT,
    // leaving a duplicate orphaned in_progress row that still consumed quota
    // tracking.
    const assessment = await createAssessmentIfNoneActive(
      db,
      profileId,
      subjectId,
      topicId,
    );

    return c.json(
      createAssessmentResponseSchema.parse({
        assessment: {
          id: assessment.id,
          topicId: assessment.topicId,
          verificationDepth: assessment.verificationDepth,
          status: assessment.status,
          masteryScore: assessment.masteryScore,
          createdAt: assessment.createdAt,
        },
      }),
      201,
    );
  })

  .get('/subjects/:subjectId/topics/:topicId/assessments/active', async (c) => {
    const { db, profileId } = withProfile(c);
    const subjectId = c.req.param('subjectId');
    const topicId = c.req.param('topicId');

    const assessment = await getActiveAssessmentForTopic(
      db,
      profileId,
      subjectId,
      topicId,
    );

    return c.json(getActiveAssessmentResponseSchema.parse({ assessment }));
  })

  // Submit an assessment answer
  .post(
    '/assessments/:assessmentId/answer',
    zValidator('json', assessmentAnswerSchema),
    async (c) => {
      await assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const assessmentId = c.req.param('assessmentId');
      const { answer } = c.req.valid('json');

      // [WI-2396] Consent-withdrawal gate before LLM dispatch (canon R5).
      // Gated unconditionally — the app_help/forceReview branches inside
      // submitAssessmentAnswer are DB-only, but this endpoint's primary
      // purpose (evaluateAssessmentAnswer) dispatches the LLM.
      await assertLlmConsent(db, profileId);

      // [WI-2432] Safety-adjacent age gate (mirrors exchanges.ts's
      // ageBracket derivation) — the router consumes this to enforce the
      // under-18 Gemini/Vertex vendor exclusion (MMT-ADR-0016 §1.5) on the
      // legacy routing path.
      const profileMeta = c.get('profileMeta');
      const result = await submitAssessmentAnswer(
        db,
        profileId,
        assessmentId,
        answer,
        {
          conversationLanguage: parseConversationLanguage(
            profileMeta?.conversationLanguage,
          ),
          ageBracket:
            profileMeta?.birthYear != null
              ? computeAgeBracketFromDate(profileMeta.birthYear)
              : undefined,
        },
      );
      if (!result) return notFound(c, 'Assessment not found');

      if (result.kind === 'app_help') {
        // The app-help branch returns a canned response without calling
        // the LLM. The metering middleware has already decremented the quota pool
        // before this handler ran. Refund it here so the learner is not charged
        // for a turn that consumed no LLM capacity. Mark quotaRefunded so the
        // middleware's post-handler status-based branch does not double-refund.
        const subscriptionId = c.get('subscriptionId');
        if (!c.get('quotaRefunded')) {
          // [BUG-821] refundQuotaOrEscalate escalates (Sentry + structured log)
          // when a decrement happened but subscriptionId is missing, instead of
          // silently skipping the refund and charging the user for a no-LLM turn.
          const { refunded } = await refundQuotaOrEscalate(db, subscriptionId, {
            route: 'assessments.answer.app_help',
            profileId,
            source: c.get('quotaDecrementSource'),
            quotaModel: c.get('quotaDecrementQuotaModel'),
            topUpCreditId: c.get('quotaDecrementTopUpCreditId'),
          });
          // [WI-776 / WP-7] Only claim the refund happened when it actually did.
          // Marking quotaRefunded=true on a failed refund would charge the user
          // for a no-LLM branch — silent recovery in billing is banned. On
          // failure escalate (safeRefundQuota already logged+Sentry'd a genuine
          // outage; a structured warn here surfaces the unrefunded charge) and
          // leave quotaRefunded unset so the failure is visible, not swallowed.
          if (refunded) {
            c.set('quotaRefunded', true);
          } else {
            logger.warn(
              '[assessments] app-help quota refund did not complete — user may be charged for a no-LLM turn',
              {
                event: 'assessments.app_help.refund_incomplete',
                subscriptionId,
                profileId,
              },
            );
          }
        }
        return c.json(
          submitAssessmentAnswerResponseSchema.parse({
            evaluation: result.evaluation,
            status: result.status,
          }),
        );
      }

      return c.json(
        submitAssessmentAnswerResponseSchema.parse({
          evaluation: result.evaluation,
          status: result.status,
        }),
      );
    },
  )

  .patch('/assessments/:assessmentId/decline-refresh', async (c) => {
    await assertNotProxyMode(c);
    const { db, profileId } = withProfile(c);
    const assessmentId = c.req.param('assessmentId');

    const assessment = await getAssessment(db, profileId, assessmentId);
    if (!assessment) return notFound(c, 'Assessment not found');
    if (!isTerminalAssessmentStatus(assessment.status)) {
      return c.json(
        {
          code: 'BAD_REQUEST',
          message: 'Assessment is not in a terminal state',
        },
        400,
      );
    }

    logger.info('[assessments] learner declined assessment refresher', {
      event: 'assessment.refresh_declined',
      assessmentId,
      profileId,
      topicId: assessment.topicId,
      status: assessment.status,
      masteryScore: assessment.masteryScore,
    });

    return c.json(declineAssessmentRefreshResponseSchema.parse({ ok: true }));
  })

  // Get assessment state
  .get('/assessments/:assessmentId', async (c) => {
    const { db, profileId } = withProfile(c);
    const assessmentId = c.req.param('assessmentId');

    const assessment = await getAssessment(db, profileId, assessmentId);
    if (!assessment) return notFound(c, 'Assessment not found');

    // exchangeHistory is jsonb in the DB and may carry rows written under an
    // older schema (renamed roles, missing fields). A strict .parse() here
    // would 500 on any drift; safeParse + per-entry filtering keeps the
    // endpoint serving the rest of the assessment and surfaces drift via
    // logs instead. Same pattern recommended in AGENTS.md > Code Quality
    // Guards (classify before formatting / fail-loud-but-don't-crash).
    const parsed = getAssessmentResponseSchema.safeParse({ assessment });
    if (parsed.success) {
      return c.json(parsed.data);
    }

    const sanitizedHistory = Array.isArray(assessment.exchangeHistory)
      ? assessment.exchangeHistory.filter(
          (entry) => chatExchangeSchema.safeParse(entry).success,
        )
      : [];
    logger.warn(
      '[assessments] response schema drift on get; sanitized exchangeHistory',
      {
        assessmentId,
        droppedEntries:
          (assessment.exchangeHistory?.length ?? 0) - sanitizedHistory.length,
      },
    );
    return c.json(
      getAssessmentResponseSchema.parse({
        assessment: { ...assessment, exchangeHistory: sanitizedHistory },
      }),
    );
  })

  // Submit quick check response during session
  .post(
    '/sessions/:sessionId/quick-check',
    zValidator('json', quickCheckRequestSchema),
    async (c) => {
      const { db, profileId } = withProfile(c);
      const sessionId = c.req.param('sessionId');
      const { answer } = c.req.valid('json');

      // [WI-2396] Consent-withdrawal gate before LLM dispatch (canon R5).
      await assertLlmConsent(db, profileId);

      const session = await getSession(db, profileId, sessionId);
      if (!session) return notFound(c, 'Session not found');

      // Load topic scope for LLM context.
      const topicContext = session.topicId
        ? await loadAssessmentTopicContext(db, session.topicId, profileId)
        : {
            topicTitle: 'General',
            topicDescription: '',
            subjectName: undefined,
            pedagogyMode: undefined,
            languageCode: null,
          };

      // i18n Phase 1 — thread conversation_language into the quick-check
      // feedback prose.
      const quickCheckProfileMeta = c.get('profileMeta');
      const evaluation = await evaluateQuickCheckAnswer(
        {
          ...topicContext,
          currentDepth: 'recall',
          exchangeHistory: [],
        },
        answer,
        {
          conversationLanguage: parseConversationLanguage(
            quickCheckProfileMeta?.conversationLanguage,
          ),
          // [WI-2432] Safety-adjacent age gate — see submitAssessmentAnswer
          // call above for rationale.
          ageBracket:
            quickCheckProfileMeta?.birthYear != null
              ? computeAgeBracketFromDate(quickCheckProfileMeta.birthYear)
              : undefined,
        },
      );

      return c.json(
        quickCheckFeedbackResponseSchema.parse({
          feedback: evaluation.feedback,
          isCorrect: evaluation.passed,
        }),
      );
    },
  );
