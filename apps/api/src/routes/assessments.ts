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
  type QuotaModel,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import { parseConversationLanguage } from '../services/llm';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { withProfile, type RouteEnv } from '../route-utils/route-context';
import {
  evaluateAssessmentAnswer,
  buildAssessmentAppHelpEvaluation,
  createAssessmentIfNoneActive,
  getAssessment,
  getActiveAssessmentForTopic,
  updateAssessment,
  loadAssessmentTopicContext,
  evaluateQuickCheckAnswer,
  recordAssessmentCompletionActivity,
  buildNeedsReviewEvaluation,
  resolveAssessmentStatus,
  shouldEndAssessmentForReview,
  lockAssessmentForAnswerSubmission,
  isTerminalAssessmentStatus,
} from '../services/assessments';
import { mapEvaluateQualityToSm2 } from '../services/evaluate';
import { updateRetentionFromSession } from '../services/retention-data';
import { insertSessionXpEntry } from '../services/xp';
import { getSession } from '../services/session';
import { refundQuotaOrEscalate } from '../services/billing';
import { notFound } from '../errors';
import { createLogger } from '../services/logger';
import { captureException } from '../services/sentry';

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
    // [WI-776 / WP-7] Cutover flag the decrement ran under; threaded into
    // safeRefundQuota so the refund's ownership check uses the same store.
    quotaIdentityV2: boolean | undefined;
  };
};

function countLearnerAnswers(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): number {
  return history.filter((entry) => entry.role === 'user').length;
}

export const assessmentRoutes = new Hono<AssessmentRouteEnv>()
  // Start a topic completion assessment
  .post('/subjects/:subjectId/topics/:topicId/assessments', async (c) => {
    assertNotProxyMode(c);
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
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const assessmentId = c.req.param('assessmentId');
      const { answer } = c.req.valid('json');

      // Non-transactional pre-fetch — used only for the app-help branch and
      // the topic context fetch (both read-only). The authoritative read +
      // terminal-state check + LLM + UPDATE is serialized below under
      // db.transaction with SELECT ... FOR UPDATE.
      const assessment = await getAssessment(db, profileId, assessmentId);
      if (!assessment) return notFound(c, 'Assessment not found');

      const appHelpEvaluation = buildAssessmentAppHelpEvaluation(
        answer,
        assessment.masteryScore ?? 0,
      );
      if (appHelpEvaluation) {
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
            // [WI-776 / WP-7] Use the store the decrement ran under.
            identityV2: c.get('quotaIdentityV2'),
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
            evaluation: appHelpEvaluation,
            status: assessment.status,
          }),
        );
      }

      const topicContext = await loadAssessmentTopicContext(
        db,
        assessment.topicId,
        profileId,
      );

      // [WI-136 H4] Concurrent-submission lock. Two near-simultaneous
      // POSTs would otherwise both pass the non-transactional terminal
      // check, both call the LLM, and both UPDATE. Wrapping the
      // critical section in a tx + SELECT ... FOR UPDATE serializes
      // them: the loser blocks at the SELECT, observes the winner's
      // terminal-state UPDATE, and exits with 409. Holding the lock
      // during the LLM call is the explicit trade-off (see
      // lockAssessmentForAnswerSubmission jsdoc for rationale).
      const {
        snapshot: lockedAssessment,
        evaluation,
        updated: updatedAssessment,
        newStatus,
        updatedHistory,
        forceReview,
      } = await db.transaction(async (tx) => {
        const txDb = tx as unknown as Database;
        const snapshot = await lockAssessmentForAnswerSubmission(
          txDb,
          profileId,
          assessmentId,
        );

        const forceReview = shouldEndAssessmentForReview(
          answer,
          snapshot.exchangeHistory,
        );
        // i18n Phase 1 — pass the learner's conversation_language so the
        // LLM-evaluated feedback prose renders in their UI locale.
        const assessmentProfileMeta = c.get('profileMeta');
        const evaluation = forceReview
          ? buildNeedsReviewEvaluation()
          : await evaluateAssessmentAnswer(
              {
                ...topicContext,
                currentDepth: snapshot.verificationDepth,
                exchangeHistory: snapshot.exchangeHistory,
              },
              answer,
              // Terminal-replay guard is now enforced upstream by
              // lockAssessmentForAnswerSubmission under FOR UPDATE — pass
              // the snapshot's status for defense-in-depth in case the
              // service signature drifts.
              {
                assessmentStatus: snapshot.status,
                conversationLanguage: parseConversationLanguage(
                  assessmentProfileMeta?.conversationLanguage,
                ),
              },
            );

        const updatedHistory = [
          ...snapshot.exchangeHistory,
          { role: 'user' as const, content: answer },
          { role: 'assistant' as const, content: evaluation.feedback },
        ];

        const answerCount = countLearnerAnswers(updatedHistory);
        const newStatus = resolveAssessmentStatus({
          evaluation,
          answerCount,
          forceReview,
        });

        const updated = await updateAssessment(txDb, profileId, assessmentId, {
          verificationDepth: evaluation.nextDepth ?? snapshot.verificationDepth,
          status: newStatus,
          masteryScore: evaluation.masteryScore,
          qualityRating: evaluation.qualityRating,
          exchangeHistory: updatedHistory,
        });

        // [CR #8] Fold retention + XP into the SAME transaction as the status
        // UPDATE so a terminal assessment can never commit `passed` while the
        // SM-2/retention update or XP grant silently fails. Previously these
        // ran in a separate tx2 after tx1 committed: if tx2 failed, the
        // assessment was permanently `passed` (the FOR UPDATE terminal-state
        // guard now blocks resubmission) but XP/retention were never applied,
        // and the failure was invisible. Co-committing makes the whole
        // terminal transition atomic — a retention/XP failure rolls back the
        // status UPDATE, the lock releases, and the learner can retry.
        // `recordAssessmentCompletionActivity` (an activity-log write) stays
        // OUTSIDE the tx: it is observability, not learner-facing state, and a
        // failure there must not roll back a correctly-scored assessment.
        if (
          newStatus !== 'in_progress' &&
          !forceReview &&
          snapshot.topicId &&
          snapshot.subjectId
        ) {
          const sm2Quality = mapEvaluateQualityToSm2(
            evaluation.passed,
            Math.round(evaluation.masteryScore * 5),
          );
          const sessionTimestamp =
            updated?.updatedAt ?? new Date().toISOString();
          await updateRetentionFromSession(
            txDb,
            profileId,
            snapshot.topicId,
            sm2Quality,
            sessionTimestamp,
          );
          if (newStatus === 'passed') {
            await insertSessionXpEntry(
              txDb,
              profileId,
              snapshot.topicId,
              snapshot.subjectId,
            );
          }
        }

        return {
          snapshot,
          evaluation,
          updated,
          newStatus,
          updatedHistory,
          forceReview,
        };
      });
      // Keep the transaction result explicit; post-tx activity still reads the
      // pre-fetch `assessment` for immutable topic/subject fields.
      void lockedAssessment;
      void updatedHistory;

      // Terminal-assessment retention + XP are now applied atomically inside
      // the transaction above (see [CR #8]). The only post-tx work is the
      // activity-log write, which is observability and intentionally tolerant
      // of failure — a failed activity log must not undo a committed,
      // correctly-scored assessment.
      //
      // A learner acknowledgement like "OK" after a prior answer is a review
      // handoff, not a scored recall attempt; forceReview turns are excluded
      // from completion activity just as they are from retention/XP above.
      if (
        newStatus !== 'in_progress' &&
        !forceReview &&
        assessment.topicId &&
        assessment.subjectId
      ) {
        try {
          await recordAssessmentCompletionActivity(
            db,
            profileId,
            updatedAssessment ?? assessment,
            newStatus,
            evaluation,
          );
        } catch (err) {
          captureException(err, {
            profileId,
            requestPath: '/v1/assessments/:assessmentId/answer',
            extra: {
              assessmentId,
              topicId: assessment.topicId,
              status: newStatus,
            },
          });
        }
      }

      return c.json(
        submitAssessmentAnswerResponseSchema.parse({
          evaluation,
          status: newStatus,
        }),
      );
    },
  )

  .patch('/assessments/:assessmentId/decline-refresh', async (c) => {
    assertNotProxyMode(c);
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
