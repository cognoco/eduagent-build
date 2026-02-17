import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { interviewMessageSchema } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { getSubject } from '../services/subject';
import {
  processInterviewExchange,
  getOrCreateDraft,
  getDraftState,
  updateDraft,
  persistCurriculum,
} from '../services/interview';
import { notFound } from '../lib/errors';

type InterviewRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string;
  };
};

export const interviewRoutes = new Hono<InterviewRouteEnv>()
  // Start or continue an interview for a subject
  .post(
    '/subjects/:subjectId/interview',
    zValidator('json', interviewMessageSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const subjectId = c.req.param('subjectId');
      const { message } = c.req.valid('json');

      const subject = await getSubject(db, profileId, subjectId);
      if (!subject) return notFound(c, 'Subject not found');

      const draft = await getOrCreateDraft(db, profileId, subjectId);

      const result = await processInterviewExchange(
        { subjectName: subject.name, exchangeHistory: draft.exchangeHistory },
        message
      );

      const updatedHistory = [
        ...draft.exchangeHistory,
        { role: 'user' as const, content: message },
        { role: 'assistant' as const, content: result.response },
      ];

      if (result.isComplete) {
        await updateDraft(db, draft.id, {
          exchangeHistory: updatedHistory,
          extractedSignals: result.extractedSignals ?? draft.extractedSignals,
          status: 'completed',
        });
        await persistCurriculum(db, subjectId, subject.name, {
          ...draft,
          exchangeHistory: updatedHistory,
          extractedSignals: result.extractedSignals ?? draft.extractedSignals,
        });
      } else {
        await updateDraft(db, draft.id, {
          exchangeHistory: updatedHistory,
        });
      }

      return c.json({
        response: result.response,
        isComplete: result.isComplete,
        exchangeCount: updatedHistory.filter((e) => e.role === 'user').length,
      });
    }
  )
  // Get current interview state
  .get('/subjects/:subjectId/interview', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const subjectId = c.req.param('subjectId');

    const draft = await getDraftState(db, profileId, subjectId);
    if (!draft) return c.json({ state: null });

    const subject = await getSubject(db, profileId, subjectId);

    return c.json({
      state: {
        draftId: draft.id,
        status: draft.status,
        exchangeCount: draft.exchangeHistory.filter((e) => e.role === 'user')
          .length,
        subjectName: subject?.name ?? 'Unknown',
      },
    });
  });
