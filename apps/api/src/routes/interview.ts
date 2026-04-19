import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import {
  interviewMessageSchema,
  type InterviewResult,
  type ExtractedInterviewSignals,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { getSubject } from '../services/subject';
import {
  getBookTitle,
  processInterviewExchange,
  streamInterviewExchange,
  extractSignals,
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
      const bookId = c.req.query('bookId');

      const subject = await getSubject(db, profileId, subjectId);
      if (!subject) return notFound(c, 'Subject not found');

      const bookTitle = bookId
        ? await getBookTitle(db, profileId, bookId, subjectId)
        : undefined;

      const draft = await getOrCreateDraft(db, profileId, subjectId);

      const context = {
        subjectName: subject.name,
        exchangeHistory: draft.exchangeHistory,
        ...(bookTitle ? { bookTitle } : {}),
      };

      // [BUG-464] Pass exchange count so the service can enforce the hard cap
      const exchangeCount =
        draft.exchangeHistory.filter((e) => e.role === 'user').length + 1;
      const result = await processInterviewExchange(context, message, {
        exchangeCount,
        profileId,
      });

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
        await persistCurriculum(
          db,
          profileId,
          subjectId,
          subject.name,
          {
            ...draft,
            exchangeHistory: updatedHistory,
            extractedSignals: result.extractedSignals ?? draft.extractedSignals,
          },
          bookId,
          bookTitle
        );
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
      const bookId = c.req.query('bookId');

      const subject = await getSubject(db, profileId, subjectId);
      if (!subject) return notFound(c, 'Subject not found');

      const bookTitle = bookId
        ? await getBookTitle(db, profileId, bookId, subjectId)
        : undefined;

      const draft = await getOrCreateDraft(db, profileId, subjectId);

      const context = {
        subjectName: subject.name,
        exchangeHistory: draft.exchangeHistory,
        ...(bookTitle ? { bookTitle } : {}),
      };

      // [BUG-464] Pass exchange count so the service can enforce the hard cap
      const exchangeCount =
        draft.exchangeHistory.filter((e) => e.role === 'user').length + 1;

      let stream: AsyncIterable<string>;
      let onComplete: (fullResponse: string) => Promise<InterviewResult>;
      try {
        const streamResult = await streamInterviewExchange(context, message, {
          exchangeCount,
          profileId,
        });
        stream = streamResult.stream;
        onComplete = streamResult.onComplete;
      } catch (err) {
        console.error('[interview/stream] Failed to start stream:', err);
        return c.json(
          {
            code: 'LLM_UNAVAILABLE',
            message:
              'Interview service is temporarily unavailable. Please try again.',
          },
          503
        );
      }

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
            await persistCurriculum(
              db,
              profileId,
              subjectId,
              subject.name,
              {
                ...draft,
                exchangeHistory: updatedHistory,
                extractedSignals:
                  result.extractedSignals ?? draft.extractedSignals,
              },
              bookId,
              bookTitle
            );
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
  // [BUG-464] Force-complete: client escape button triggers this to skip ahead
  .post('/subjects/:subjectId/interview/complete', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const subjectId = c.req.param('subjectId');
    const bookId = c.req.query('bookId');

    const subject = await getSubject(db, profileId, subjectId);
    if (!subject) return notFound(c, 'Subject not found');

    const draft = await getDraftState(db, profileId, subjectId);
    if (!draft || draft.status !== 'in_progress') {
      // Already completed or no draft — return signals from the persisted
      // draft if present, so a second /complete call is still navigable.
      return c.json({
        isComplete: true,
        exchangeCount:
          draft?.exchangeHistory.filter((e) => e.role === 'user').length ?? 0,
        ...(draft?.extractedSignals &&
        typeof draft.extractedSignals === 'object' &&
        Object.keys(draft.extractedSignals as Record<string, unknown>).length >
          0
          ? { extractedSignals: draft.extractedSignals }
          : {}),
      });
    }

    const bookTitle = bookId
      ? await getBookTitle(db, profileId, bookId, subjectId)
      : undefined;

    // Extract whatever signals we have from the conversation so far
    const signals = await extractSignals(draft.exchangeHistory);

    await updateDraft(db, profileId, draft.id, {
      extractedSignals: signals,
    });

    await persistCurriculum(
      db,
      profileId,
      subjectId,
      subject.name,
      { ...draft, extractedSignals: signals },
      bookId,
      bookTitle
    );

    await updateDraft(db, profileId, draft.id, {
      status: 'completed',
    });

    // Return extracted signals alongside completion so the mobile force-complete
    // mutation can route into interests-context without waiting for a state
    // refetch round-trip. The shape matches extractedInterviewSignalsSchema.
    return c.json({
      isComplete: true,
      exchangeCount: draft.exchangeHistory.filter((e) => e.role === 'user')
        .length,
      extractedSignals: signals,
    });
  })
  // Get current interview state
  .get('/subjects/:subjectId/interview', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const subjectId = c.req.param('subjectId');

    const draft = await getDraftState(db, profileId, subjectId);
    if (!draft) return c.json({ state: null });

    const subject = await getSubject(db, profileId, subjectId);

    // Surface extractedSignals on completed drafts so the mobile client can
    // read extracted interests and route through the interests-context picker
    // before the downstream onboarding fork. The shape is validated by
    // @eduagent/schemas/extractedInterviewSignalsSchema.
    const hasExtractedSignals =
      draft.status === 'completed' &&
      draft.extractedSignals &&
      typeof draft.extractedSignals === 'object' &&
      Object.keys(draft.extractedSignals as Record<string, unknown>).length > 0;

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
        ...(hasExtractedSignals
          ? {
              extractedSignals:
                draft.extractedSignals as unknown as ExtractedInterviewSignals,
            }
          : {}),
      },
    });
  });
