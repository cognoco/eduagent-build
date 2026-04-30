import { Hono } from 'hono';
import { streamSSEUtf8 } from '../services/llm/sse-utf8';
import { zValidator } from '@hono/zod-validator';
import {
  ERROR_CODES,
  interviewMessageSchema,
  type InterviewResult,
  extractedInterviewSignalsSchema,
  streamFallbackFrameSchema,
  type ExchangeFallback,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { getSubject } from '../services/subject';
import { getProfileDisplayName } from '../services/profile';
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
import { captureException } from '../services/sentry';

type InterviewRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    // Mirrors the Zod enum in config.ts (z.enum(['true', 'false'])) so the
    // binary contract is enforced at the type level too — Cloudflare provides
    // the binding as a raw string, but env-validation middleware guarantees
    // it's one of these two values at runtime.
    EMPTY_REPLY_GUARD_ENABLED?: 'true' | 'false';
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

type InterviewStreamRouteResult = InterviewResult & {
  fallback?: ExchangeFallback;
};

export const interviewRoutes = new Hono<InterviewRouteEnv>()
  // Start or continue an interview for a subject
  .post(
    '/subjects/:subjectId/interview',
    zValidator('json', interviewMessageSchema),
    async (c) => {
      assertNotProxyMode(c);
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

      const [draft, learnerName] = await Promise.all([
        getOrCreateDraft(db, profileId, subjectId),
        getProfileDisplayName(db, profileId),
      ]);

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
        learnerName,
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
      assertNotProxyMode(c);
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

      const [draft, learnerName] = await Promise.all([
        getOrCreateDraft(db, profileId, subjectId),
        getProfileDisplayName(db, profileId),
      ]);

      const context = {
        subjectName: subject.name,
        exchangeHistory: draft.exchangeHistory,
        ...(bookTitle ? { bookTitle } : {}),
      };

      // [BUG-464] Pass exchange count so the service can enforce the hard cap
      const exchangeCount =
        draft.exchangeHistory.filter((e) => e.role === 'user').length + 1;

      let stream: AsyncIterable<string>;
      let onComplete: (
        fullResponse: string
      ) => Promise<InterviewStreamRouteResult>;
      try {
        const streamResult = await streamInterviewExchange(context, message, {
          exchangeCount,
          profileId,
          learnerName,
          emptyReplyGuardEnabled: c.env.EMPTY_REPLY_GUARD_ENABLED !== 'false',
        });
        stream = streamResult.stream;
        onComplete = streamResult.onComplete;
      } catch (err) {
        captureException(err, {
          profileId,
          extra: {
            route: 'interview/stream',
            phase: 'stream_start',
            subjectId,
          },
        });
        return c.json(
          {
            code: ERROR_CODES.LLM_UNAVAILABLE,
            message:
              'Interview service is temporarily unavailable. Please try again.',
          },
          503
        );
      }

      return streamSSEUtf8(c, async (sseStream) => {
        let fullResponse = '';

        for await (const chunk of stream) {
          fullResponse += chunk;
          await sseStream.writeSSE({
            data: JSON.stringify({ type: 'chunk', content: chunk }),
          });
        }

        try {
          const result = await onComplete(fullResponse);
          const currentExchangeCount = draft.exchangeHistory.filter(
            (e) => e.role === 'user'
          ).length;

          if (result.fallback) {
            // Validate on emit so a server change that drifts from the
            // wire schema fails loudly in tests rather than shipping an
            // unparseable frame to mobile (which would silently re-route
            // through the finalizer's zero-chunk branch).
            const frame = streamFallbackFrameSchema.parse({
              type: 'fallback',
              reason: result.fallback.reason,
              fallbackText: result.fallback.fallbackText,
            });
            await sseStream.writeSSE({ data: JSON.stringify(frame) });
            await sseStream.writeSSE({
              data: JSON.stringify({
                type: 'done',
                isComplete: false,
                exchangeCount: currentExchangeCount,
              }),
            });
            return;
            // Interview has no paid quota today (free during onboarding),
            // so no incrementQuota refund here. Add one if interview becomes
            // a metered flow; mirror the quotaRefunded guard in sessions.ts.
          }

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
          captureException(err, {
            profileId,
            extra: {
              route: 'interview/stream',
              phase: 'post_stream_write',
              subjectId,
              draftId: draft.id,
            },
          });
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
    assertNotProxyMode(c);
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
      // [A-3] safeParse replaces the unsafe double cast — validates JSONB shape at runtime.
      const parsed = extractedInterviewSignalsSchema.safeParse(
        draft?.extractedSignals
      );
      return c.json({
        isComplete: true,
        exchangeCount:
          draft?.exchangeHistory.filter((e) => e.role === 'user').length ?? 0,
        ...(parsed.success ? { extractedSignals: parsed.data } : {}),
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
    // [A-3] safeParse replaces the unsafe double cast — validates JSONB shape at runtime.
    const parsedSignals =
      draft.status === 'completed'
        ? extractedInterviewSignalsSchema.safeParse(draft.extractedSignals)
        : undefined;

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
        ...(parsedSignals?.success
          ? { extractedSignals: parsedSignals.data }
          : {}),
      },
    });
  });
