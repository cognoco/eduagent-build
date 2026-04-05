import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { interviewMessageSchema } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { getSubject } from '../services/subject';
import {
  processInterviewExchange,
  streamInterviewExchange,
  getOrCreateDraft,
  getDraftState,
  updateDraft,
  persistCurriculum,
  buildDraftResumeSummary,
} from '../services/interview';
import { notFound } from '../errors';

type InterviewRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const interviewRoutes = new Hono<InterviewRouteEnv>()
  // Start or continue an interview for a subject
  .post(
    '/subjects/:subjectId/interview',
    zValidator('json', interviewMessageSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
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
        // Save history first without marking complete — if persistCurriculum
        // fails, the draft stays in-progress and the user can retry.
        await updateDraft(db, profileId, draft.id, {
          exchangeHistory: updatedHistory,
          extractedSignals: result.extractedSignals ?? draft.extractedSignals,
        });
        await persistCurriculum(db, profileId, subjectId, subject.name, {
          ...draft,
          exchangeHistory: updatedHistory,
          extractedSignals: result.extractedSignals ?? draft.extractedSignals,
        });
        // Only mark complete after curriculum is persisted.
        await updateDraft(db, profileId, draft.id, {
          status: 'completed',
        });
      } else {
        await updateDraft(db, profileId, draft.id, {
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
  // Stream interview response via SSE (FR14)
  .post(
    '/subjects/:subjectId/interview/stream',
    zValidator('json', interviewMessageSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const subjectId = c.req.param('subjectId');
      const { message } = c.req.valid('json');

      const subject = await getSubject(db, profileId, subjectId);
      if (!subject) return notFound(c, 'Subject not found');

      const draft = await getOrCreateDraft(db, profileId, subjectId);

      const { stream, onComplete } = await streamInterviewExchange(
        { subjectName: subject.name, exchangeHistory: draft.exchangeHistory },
        message
      );

      return streamSSE(c, async (sseStream) => {
        let fullResponse = '';

        for await (const chunk of stream) {
          fullResponse += chunk;
          await sseStream.writeSSE({
            data: JSON.stringify({ type: 'chunk', content: chunk }),
          });
        }

        try {
          const result = await onComplete(fullResponse);

          const updatedHistory = [
            ...draft.exchangeHistory,
            { role: 'user' as const, content: message },
            { role: 'assistant' as const, content: result.response },
          ];

          if (result.isComplete) {
            // Save history first without marking complete — if persistCurriculum
            // fails, the draft stays in-progress and the user can retry.
            await updateDraft(db, profileId, draft.id, {
              exchangeHistory: updatedHistory,
              extractedSignals:
                result.extractedSignals ?? draft.extractedSignals,
            });
            await persistCurriculum(db, profileId, subjectId, subject.name, {
              ...draft,
              exchangeHistory: updatedHistory,
              extractedSignals:
                result.extractedSignals ?? draft.extractedSignals,
            });
            // Only mark complete after curriculum is persisted
            await updateDraft(db, profileId, draft.id, {
              status: 'completed',
            });
          } else {
            await updateDraft(db, profileId, draft.id, {
              exchangeHistory: updatedHistory,
            });
          }

          await sseStream.writeSSE({
            data: JSON.stringify({
              type: 'done',
              isComplete: result.isComplete,
              exchangeCount: updatedHistory.filter((e) => e.role === 'user')
                .length,
            }),
          });
        } catch (err) {
          console.error('[interview/stream] Post-stream write failed:', err);
          await sseStream.writeSSE({
            data: JSON.stringify({
              type: 'error',
              message: 'Failed to save interview progress. Please try again.',
            }),
          });
        }
      });
    }
  )
  // Get current interview state
  .get('/subjects/:subjectId/interview', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
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
        ...(draft.exchangeHistory.length > 0
          ? {
              exchangeHistory: draft.exchangeHistory,
              resumeSummary: buildDraftResumeSummary(draft),
            }
          : {}),
        ...(draft.expiresAt ? { expiresAt: draft.expiresAt } : {}),
      },
    });
  });
