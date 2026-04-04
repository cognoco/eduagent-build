import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  assessmentAnswerSchema,
  quickCheckResponseSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import {
  evaluateAssessmentAnswer,
  createAssessment,
  getAssessment,
  updateAssessment,
  loadTopicTitle,
} from '../services/assessments';
import { updateRetentionFromSession } from '../services/retention-data';
import { insertSessionXpEntry } from '../services/xp';
import { getSession } from '../services/session';
import { notFound } from '../errors';

type AssessmentRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const assessmentRoutes = new Hono<AssessmentRouteEnv>()
  // Start a topic completion assessment
  .post('/subjects/:subjectId/topics/:topicId/assessments', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const subjectId = c.req.param('subjectId');
    const topicId = c.req.param('topicId');

    const assessment = await createAssessment(
      db,
      profileId,
      subjectId,
      topicId
    );

    return c.json(
      {
        assessment: {
          id: assessment.id,
          topicId: assessment.topicId,
          verificationDepth: assessment.verificationDepth,
          status: assessment.status,
          masteryScore: assessment.masteryScore,
          createdAt: assessment.createdAt,
        },
      },
      201
    );
  })

  // Submit an assessment answer
  .post(
    '/assessments/:assessmentId/answer',
    zValidator('json', assessmentAnswerSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const assessmentId = c.req.param('assessmentId');
      const { answer } = c.req.valid('json');

      const assessment = await getAssessment(db, profileId, assessmentId);
      if (!assessment) return notFound(c, 'Assessment not found');

      const topicTitle = await loadTopicTitle(db, assessment.topicId);

      const evaluation = await evaluateAssessmentAnswer(
        {
          topicTitle,
          topicDescription: '',
          currentDepth: assessment.verificationDepth,
          exchangeHistory: assessment.exchangeHistory,
        },
        answer
      );

      const updatedHistory = [
        ...assessment.exchangeHistory,
        { role: 'user' as const, content: answer },
        { role: 'assistant' as const, content: evaluation.feedback },
      ];

      const newStatus = evaluation.passed
        ? evaluation.shouldEscalateDepth
          ? 'in_progress'
          : 'passed'
        : 'in_progress';

      await updateAssessment(db, profileId, assessmentId, {
        verificationDepth: evaluation.nextDepth ?? assessment.verificationDepth,
        status: newStatus as 'in_progress' | 'passed' | 'failed',
        masteryScore: evaluation.masteryScore,
        qualityRating: evaluation.qualityRating,
        exchangeHistory: updatedHistory,
      });

      // Wire passed standalone assessments into the retention lifecycle (Epic 3)
      // Ensures assessment-only topics get SM-2 retention cards + XP tracking.
      if (
        newStatus === 'passed' &&
        evaluation.qualityRating != null &&
        assessment.topicId &&
        assessment.subjectId
      ) {
        await updateRetentionFromSession(
          db,
          profileId,
          assessment.topicId,
          evaluation.qualityRating
        );
        await insertSessionXpEntry(
          db,
          profileId,
          assessment.topicId,
          assessment.subjectId
        );
      }

      return c.json({ evaluation });
    }
  )

  // Get assessment state
  .get('/assessments/:assessmentId', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const assessmentId = c.req.param('assessmentId');

    const assessment = await getAssessment(db, profileId, assessmentId);
    if (!assessment) return notFound(c, 'Assessment not found');
    return c.json({ assessment });
  })

  // Submit quick check response during session
  .post(
    '/sessions/:sessionId/quick-check',
    zValidator('json', quickCheckResponseSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const sessionId = c.req.param('sessionId');
      const { answer } = c.req.valid('json');

      const session = await getSession(db, profileId, sessionId);
      if (!session) return notFound(c, 'Session not found');

      // Load topic title for LLM context
      const topicTitle = session.topicId
        ? await loadTopicTitle(db, session.topicId)
        : 'General';

      const evaluation = await evaluateAssessmentAnswer(
        {
          topicTitle,
          topicDescription: '',
          currentDepth: 'recall',
          exchangeHistory: [],
        },
        answer
      );

      return c.json({
        feedback: evaluation.feedback,
        isCorrect: evaluation.passed,
      });
    }
  );
