import { Hono } from 'hono';
import { streamSSEUtf8 } from '../services/streaming/sse-utf8';
import { zValidator } from '@hono/zod-validator';
import {
  ERROR_CODES,
  interviewMessageSchema,
  type InterviewResult,
  extractedInterviewSignalsSchema,
  streamFallbackFrameSchema,
  type ExchangeFallback,
  PersistCurriculumError,
  classifyOrphanError,
} from '@eduagent/schemas';
import { onboardingDrafts, type Database } from '@eduagent/database';
import { eq, and } from 'drizzle-orm';
import { interviewReadyToPersistEventSchema } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { getSubject } from '../services/subject';
import { getProfileDisplayName } from '../services/profile';
import {
  getBookTitle,
  processInterviewExchange,
  streamInterviewExchange,
  getOrCreateDraft,
  getDraftState,
  updateDraft,
  buildDraftResumeSummary,
} from '../services/interview';
import {
  appendInterviewAssistantExchange,
  appendInterviewUserExchange,
} from '../services/onboarding/exchange-history-writer';
import { idempotencyPreflight } from '../middleware/idempotency';
import { markPersisted } from '../services/idempotency-marker';
import { notFound } from '../errors';
import { captureException } from '../services/sentry';
import { appendOrphanInterviewTurn } from '../services/interview/append-orphan-interview-turn';
import { inngest } from '../inngest/client';

type InterviewRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    // Mirrors the Zod enum in config.ts (z.enum(['true', 'false'])) so the
    // binary contract is enforced at the type level too — Cloudflare provides
    // the binding as a raw string, but env-validation middleware guarantees
    // it's one of these two values at runtime.
    EMPTY_REPLY_GUARD_ENABLED?: 'true' | 'false';
    IDEMPOTENCY_KV?: KVNamespace;
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
  .use(
    '/subjects/:subjectId/interview/stream',
    idempotencyPreflight({ flow: 'interview' })
  )
  .use(
    '/subjects/:subjectId/interview/complete',
    idempotencyPreflight({ flow: 'interview' })
  )
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
      const clientId = c.req.header('Idempotency-Key')?.trim() || undefined;

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

      const updatedHistory = appendInterviewAssistantExchange(
        appendInterviewUserExchange(draft.exchangeHistory, message, clientId),
        result.response,
        clientId
      );

      if (result.isComplete) {
        await updateDraft(db, profileId, draft.id, {
          exchangeHistory: updatedHistory,
          extractedSignals: result.extractedSignals ?? draft.extractedSignals,
        });

        const claimed = await db
          .update(onboardingDrafts)
          .set({ status: 'completing', failureCode: null })
          .where(
            and(
              eq(onboardingDrafts.id, draft.id),
              eq(onboardingDrafts.profileId, profileId),
              eq(onboardingDrafts.status, 'in_progress')
            )
          )
          .returning({ id: onboardingDrafts.id });

        if (claimed.length > 0) {
          await inngest.send({
            id: `persist-${draft.id}`,
            name: 'app/interview.ready_to_persist',
            data: interviewReadyToPersistEventSchema.parse({
              version: 1,
              draftId: draft.id,
              profileId,
              subjectId,
              subjectName: subject.name,
              bookId,
            }),
          });
        }
      } else {
        await updateDraft(db, profileId, draft.id, {
          exchangeHistory: updatedHistory,
        });
      }

      await markPersisted({
        kv: c.env.IDEMPOTENCY_KV,
        profileId,
        flow: 'interview',
        key: clientId,
      });

      return c.json({
        response: result.response,
        isComplete: result.isComplete,
        status: result.isComplete ? 'completing' : undefined,
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
      const clientId = c.req.header('Idempotency-Key')?.trim() || undefined;

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

          const updatedHistory = appendInterviewAssistantExchange(
            appendInterviewUserExchange(
              draft.exchangeHistory,
              message,
              clientId
            ),
            result.response,
            clientId
          );

          if (result.isComplete) {
            try {
              await updateDraft(db, profileId, draft.id, {
                exchangeHistory: updatedHistory,
                extractedSignals:
                  result.extractedSignals ?? draft.extractedSignals,
              });

              const claimed = await db
                .update(onboardingDrafts)
                .set({ status: 'completing', failureCode: null })
                .where(
                  and(
                    eq(onboardingDrafts.id, draft.id),
                    eq(onboardingDrafts.profileId, profileId),
                    eq(onboardingDrafts.status, 'in_progress')
                  )
                )
                .returning({ id: onboardingDrafts.id });

              if (claimed.length > 0) {
                await inngest.send({
                  id: `persist-${draft.id}`,
                  name: 'app/interview.ready_to_persist',
                  data: interviewReadyToPersistEventSchema.parse({
                    version: 1,
                    draftId: draft.id,
                    profileId,
                    subjectId,
                    subjectName: subject.name,
                    bookId,
                  }),
                });
              }
            } catch (cause) {
              throw new PersistCurriculumError(
                'interview/stream: dispatch failed',
                cause
              );
            }
          } else {
            await updateDraft(db, profileId, draft.id, {
              exchangeHistory: updatedHistory,
            });
          }

          await markPersisted({
            kv: c.env.IDEMPOTENCY_KV,
            profileId,
            flow: 'interview',
            key: clientId,
          });

          await sseStream.writeSSE({
            data: JSON.stringify({
              type: 'done',
              isComplete: result.isComplete,
              status: result.isComplete ? 'completing' : undefined,
              exchangeCount: updatedHistory.filter((e) => e.role === 'user')
                .length,
            }),
          });
        } catch (err) {
          const orphanReason = classifyOrphanError(err);

          if (clientId) {
            try {
              await appendOrphanInterviewTurn(
                db,
                profileId,
                draft.id,
                message,
                {
                  clientId,
                  orphanReason,
                }
              );
            } catch (persistErr) {
              await inngest.send({
                name: 'app/orphan.persist.failed',
                data: {
                  profileId,
                  draftId: draft.id,
                  route: 'interview/stream',
                  reason: orphanReason,
                  error: String(persistErr),
                },
              });
              captureException(persistErr, {
                profileId,
                extra: { phase: 'orphan_persist_failed' },
              });
            }
          } else {
            captureException(
              new Error('interview/stream: clientId missing on orphan path'),
              {
                profileId,
                extra: { draftId: draft.id, phase: 'orphan_clientid_missing' },
              }
            );
          }

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

    const claimed = await db
      .update(onboardingDrafts)
      .set({ status: 'completing', failureCode: null })
      .where(
        and(
          eq(onboardingDrafts.id, draft.id),
          eq(onboardingDrafts.profileId, profileId),
          eq(onboardingDrafts.status, 'in_progress')
        )
      )
      .returning({ id: onboardingDrafts.id });

    if (claimed.length > 0) {
      await inngest.send({
        id: `persist-${draft.id}`,
        name: 'app/interview.ready_to_persist',
        data: interviewReadyToPersistEventSchema.parse({
          version: 1,
          draftId: draft.id,
          profileId,
          subjectId,
          subjectName: subject.name,
          bookId,
        }),
      });
    }

    return c.json({
      isComplete: true,
      status: 'completing',
      exchangeCount: draft.exchangeHistory.filter((e) => e.role === 'user')
        .length,
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
        failureCode: draft.failureCode ?? null,
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
  })
  .post('/subjects/:subjectId/interview/retry-persist', async (c) => {
    assertNotProxyMode(c);
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const subjectId = c.req.param('subjectId');
    const bookId = c.req.query('bookId');

    const subject = await getSubject(db, profileId, subjectId);
    if (!subject) return notFound(c, 'Subject not found');

    const draft = await getDraftState(db, profileId, subjectId);
    if (!draft) return notFound(c, 'Draft not found');

    const claimed = await db
      .update(onboardingDrafts)
      .set({ status: 'completing', failureCode: null })
      .where(
        and(
          eq(onboardingDrafts.id, draft.id),
          eq(onboardingDrafts.profileId, profileId),
          eq(onboardingDrafts.status, 'failed')
        )
      )
      .returning({ id: onboardingDrafts.id });

    if (claimed.length === 0) {
      return c.json({ error: 'not-failed', status: draft.status }, 409);
    }

    await inngest.send({
      id: `persist-${draft.id}-retry-${Date.now()}`,
      name: 'app/interview.ready_to_persist',
      data: interviewReadyToPersistEventSchema.parse({
        version: 1,
        draftId: draft.id,
        profileId,
        subjectId,
        subjectName: subject.name,
        bookId,
      }),
    });

    return c.json({ status: 'completing' });
  });
