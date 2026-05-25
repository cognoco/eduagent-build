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
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { withProfile, type RouteEnv } from '../route-utils/route-context';
import {
  evaluateAssessmentAnswer,
  buildAssessmentAppHelpEvaluation,
  createAssessment,
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
} from '../services/assessments';
import { mapEvaluateQualityToSm2 } from '../services/evaluate';
import { updateRetentionFromSession } from '../services/retention-data';
import { insertSessionXpEntry } from '../services/xp';
import { getSession } from '../services/session';
import { notFound } from '../errors';
import { createLogger } from '../services/logger';
import { captureException } from '../services/sentry';

const logger = createLogger();

function countLearnerAnswers(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): number {
  return history.filter((entry) => entry.role === 'user').length;
}

export const assessmentRoutes = new Hono<RouteEnv>()
  // Start a topic completion assessment
  .post('/subjects/:subjectId/topics/:topicId/assessments', async (c) => {
    assertNotProxyMode(c);
    const { db, profileId } = withProfile(c);
    const subjectId = c.req.param('subjectId');
    const topicId = c.req.param('topicId');

    const assessment =
      (await getActiveAssessmentForTopic(db, profileId, subjectId, topicId)) ??
      (await createAssessment(db, profileId, subjectId, topicId));

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
              { assessmentStatus: snapshot.status },
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

        return {
          snapshot,
          evaluation,
          updated,
          newStatus,
          updatedHistory,
          forceReview,
        };
      });
      // Alias for downstream code that read `assessment.*` after the update.
      // The post-tx code uses snapshot for assessment.topicId / subjectId etc.
      void lockedAssessment;
      void updatedHistory;

      // Wire terminal standalone assessments into the retention lifecycle.
      // Retention uses the same aggregate mastery signal as the pass gate.
      // A learner acknowledgement like "OK" after a prior answer is a review
      // handoff, not a scored recall attempt; do not let that light-touch turn
      // mutate SM-2 or block the chat with retention-side validation.
      if (
        newStatus !== 'in_progress' &&
        !forceReview &&
        assessment.topicId &&
        assessment.subjectId
      ) {
        const sm2Quality = mapEvaluateQualityToSm2(
          evaluation.passed,
          Math.round(evaluation.masteryScore * 5),
        );
        const sessionTimestamp =
          updatedAssessment?.updatedAt ?? new Date().toISOString();
        await db.transaction(async (tx) => {
          // Cast: PgTransaction has all query methods; services only use
          // select/insert/update — $withAuth/batch are not called.
          const txDb = tx as unknown as Database;
          await updateRetentionFromSession(
            txDb,
            profileId,
            assessment.topicId,
            sm2Quality,
            sessionTimestamp,
          );
          if (newStatus === 'passed') {
            await insertSessionXpEntry(
              txDb,
              profileId,
              assessment.topicId,
              assessment.subjectId,
            );
          }
        });
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
    if (
      !['passed', 'borderline', 'failed_exhausted'].includes(assessment.status)
    ) {
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
    // logs instead. Same pattern recommended in CLAUDE.md > Code Quality
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

      const evaluation = await evaluateQuickCheckAnswer(
        {
          ...topicContext,
          currentDepth: 'recall',
          exchangeHistory: [],
        },
        answer,
      );

      return c.json(
        quickCheckFeedbackResponseSchema.parse({
          feedback: evaluation.feedback,
          isCorrect: evaluation.passed,
        }),
      );
    },
  );
