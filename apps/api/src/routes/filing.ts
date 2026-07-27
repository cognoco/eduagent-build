import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Database } from '@eduagent/database';
import {
  ConflictError,
  ERROR_CODES,
  RateLimitedError,
  filingRequestSchema,
  filingResultSchema,
  filingQueuedResponseSchema,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { assertLlmConsent } from '../services/identity-v2/consent-status-v2';
import { notFound } from '../errors';
import {
  buildLibraryIndex,
  fileToLibrary,
  resolveFilingResult,
  buildFallbackFilingResponse,
} from '../services/filing';
import {
  markBookSuggestionPicked,
  markTopicSuggestionUsed,
} from '../services/suggestions';
import {
  getSession,
  getSessionTranscript,
  markSessionFiled,
  claimSessionForFilingRetry,
} from '../services/session';
import { routeAndCall } from '../services/llm';
import { captureException } from '../services/sentry';
import { inngest } from '../inngest/client';
import { createLogger } from '../services/logger';
import { safeSend } from '../services/safe-non-core';
import { FILING_CONFIG } from '../config/filing';

const logger = createLogger();

type FilingRouteEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

// [CR-2026-05-19-H34] sessionId MUST be a UUID. The handler also verifies the
// caller owns this session (IDOR fix) and enforces an atomic per-session
// retry-count gate via claimSessionForFilingRetry (max 3 retries, matching
// /sessions/:sessionId/retry-filing). Without these guards any authenticated
// user could dispatch app/filing.retry against arbitrary session IDs and
// drain Inngest quota in a tight loop.
const retryRequestSchema = z.object({
  sessionId: z.string().uuid(),
  sessionMode: z.enum(['freeform', 'homework']).default('freeform'),
});

export const filingRoutes = new Hono<FilingRouteEnv>()
  .post(
    '/filing/request-retry',
    zValidator('json', retryRequestSchema),
    async (c) => {
      // [WI-153 / DS-064] Server-derived proxy-mode write guard.
      await assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { sessionId, sessionMode } = c.req.valid('json');

      // [CR-2026-05-19-H34] IDOR guard — verify the session belongs to the
      // caller's profile BEFORE dispatching the Inngest event. getSession
      // uses createScopedRepository(profileId) and returns null for any
      // session owned by a different profile, so we return 404 (matching
      // /sessions/:sessionId/retry-filing — never leak existence).
      const session = await getSession(db, profileId, sessionId);
      if (!session) return notFound(c, 'Session not found');

      // [CR-2026-05-19-H34] Per-session retry-count rate gate — atomic
      // UPDATE that only succeeds while filingRetryCount < 3 AND
      // filingStatus = 'filing_failed'. Mirrors the canonical pattern in
      // /sessions/:sessionId/retry-filing so both endpoints share the same
      // cap. If the claim fails, re-read state to distinguish 429 (cap
      // reached) from 409 (wrong status).
      const claimed = await claimSessionForFilingRetry(
        db,
        profileId,
        sessionId,
      );
      if (!claimed) {
        const fresh = await getSession(db, profileId, sessionId);
        if (!fresh) return notFound(c, 'Session not found');
        if ((fresh.filingRetryCount ?? 0) >= FILING_CONFIG.maxRetries) {
          throw new RateLimitedError(
            'Retry limit reached for this session.',
            ERROR_CODES.RATE_LIMITED,
          );
        }
        throw new ConflictError(
          `Session is not in a retriable state (status: ${
            fresh.filingStatus ?? 'null'
          })`,
        );
      }

      // core-send: user-initiated filing retry — dispatch must throw on
      // failure so the user is not told "queued" when nothing was queued.
      await inngest.send({
        name: 'app/filing.retry',
        data: { sessionId, sessionMode, profileId },
      });
      return c.json(filingQueuedResponseSchema.parse({ queued: true }));
    },
  )
  .post('/filing', zValidator('json', filingRequestSchema), async (c) => {
    // [WI-153 / DS-064] Server-derived proxy-mode write guard.
    await assertNotProxyMode(c);
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    // [WI-2396] Consent-withdrawal gate before LLM dispatch (canon R5).
    // /filing/request-retry only dispatches an Inngest event (no direct LLM
    // call, per the metering-allowlist comment above) — not gated here; the
    // consumer (freeform-filing, AC-2) carries its own basis-inclusive check.
    await assertLlmConsent(db, profileId);
    const body = c.req.valid('json');

    // If sessionId provided without transcript, build transcript server-side
    // from stored session events (avoids 50K client upload)
    let sessionTranscript = body.sessionTranscript;
    if (body.sessionId && !sessionTranscript && !body.rawInput) {
      const transcript = await getSessionTranscript(
        db,
        profileId,
        body.sessionId,
      );
      if (transcript?.archived === false) {
        sessionTranscript = transcript.exchanges
          .map(
            (e) => `${e.role === 'user' ? 'Learner' : 'Tutor'}: ${e.content}`,
          )
          .join('\n');
      }
    }

    // Build library index for this learner
    const libraryIndex = await buildLibraryIndex(db, profileId);

    // Call LLM to determine placement
    let filingResponse;
    let usedFallback = false;
    try {
      filingResponse = await fileToLibrary(
        {
          rawInput: body.rawInput,
          selectedSuggestion: body.selectedSuggestion,
          sessionTranscript,
          sessionMode: body.sessionMode,
        },
        libraryIndex,
        routeAndCall,
      );
    } catch (err) {
      // [FIX-API-2] Capture primary fileToLibrary failure to Sentry BEFORE
      // dispatching the async retry — this makes LLM/quota errors visible in
      // Sentry even when the retry path succeeds or the fallback is used.
      captureException(err, {
        profileId,
        extra: { sessionId: body.sessionId, phase: 'fileToLibrary' },
      });
      // [logging sweep] structured logger so PII fields land as JSON context
      logger.error('[filing] fileToLibrary failed', {
        sessionId: body.sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Fire async retry for freeform/homework sessions.
      // PII egress: The transcript itself must NOT ride in the
      // event payload — Inngest persists payloads in its third-party event
      // store. The consumer (freeform-filing) re-fetches the transcript from
      // the DB by sessionId, scoped by profileId. `sessionTranscript` here
      // only gates WHETHER this is a session filing worth retrying.
      if (sessionTranscript && body.sessionId) {
        await safeSend(
          () =>
            inngest.send({
              name: 'app/filing.retry',
              data: {
                profileId,
                sessionId: body.sessionId,
                sessionMode: body.sessionMode ?? 'freeform',
              },
            }),
          'filing.retry.fileToLibrary',
          { profileId, sessionId: body.sessionId },
        );
      }
      // [BUG-871] Pre-session fallback: when the LLM filing call fails we
      // forward the user's `selectedSuggestion` so the fallback book is
      // named after the topic the user actually picked (e.g. "Geometry
      // Foundations") rather than always landing under "Uncategorized".
      // The user can still move/rename the topic later via long-press.
      if (body.subjectId && body.rawInput) {
        filingResponse = buildFallbackFilingResponse(
          body.subjectId,
          body.rawInput,
          body.selectedSuggestion,
        );
        usedFallback = true;
      } else {
        return c.json(
          { code: 'FILING_FAILED', message: "Couldn't organize this topic." },
          500,
        );
      }
    }

    // Resolve into actual DB records
    // Note: 'pre_generated' is only set via the migration default on existing rows.
    // The filing route always produces 'session_filing' or 'freeform_filing'.
    // A sessionTranscript means the user just finished a chat session and is
    // filing its outcome — that is `session_filing`. Pre-session/ad-hoc adds
    // (no transcript, raw user input) are `freeform_filing`. [CR-652]
    const filedFrom = sessionTranscript
      ? ('session_filing' as const)
      : ('freeform_filing' as const);

    let result;
    try {
      result = await resolveFilingResult(db, {
        profileId,
        filingResponse,
        filedFrom,
        sessionId: body.sessionId,
      });

      // Mark session filed so retry/recovery paths do not file it again.
      if (body.sessionId && result.topicId) {
        await markSessionFiled(db, profileId, body.sessionId, result.topicId);
      }
    } catch (err) {
      // [logging sweep] structured logger so PII fields land as JSON context
      logger.error('[filing] resolveFilingResult failed', {
        sessionId: body.sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Fire async retry for freeform/homework sessions — but only if
      // the first catch block didn't already enqueue a retry (usedFallback).
      // Without this guard, two app/filing.retry events fire for the same
      // sessionId, causing duplicate topic rows + ghost filing.completed events.
      // PII egress: As above: no transcript in the event payload;
      // the consumer rehydrates from the DB.
      if (!usedFallback && sessionTranscript && body.sessionId) {
        await safeSend(
          () =>
            inngest.send({
              name: 'app/filing.retry',
              data: {
                profileId,
                sessionId: body.sessionId,
                sessionMode: body.sessionMode ?? 'freeform',
              },
            }),
          'filing.retry.resolveFilingResult',
          { profileId, sessionId: body.sessionId },
        );
      }
      return c.json(
        {
          code: 'FILING_RESOLUTION_FAILED',
          message: "Couldn't organize this topic. Please try again.",
        },
        500,
      );
    }

    // Mark suggestion as picked/used (prevents reappearing in picker)
    if (body.pickedSuggestionId) {
      await markBookSuggestionPicked(db, profileId, body.pickedSuggestionId);
    }
    if (body.usedTopicSuggestionId) {
      await markTopicSuggestionUsed(db, profileId, body.usedTopicSuggestionId);
    }

    // core-send: filing.completed — the session-completed chain waits 60s for
    // this event via waitForEvent. Silent dispatch loss would hang that chain
    // until timeout and leave the user with a broken post-filing flow.
    try {
      await inngest.send({
        name: 'app/filing.completed',
        data: {
          bookId: result.bookId,
          topicTitle: result.topicTitle,
          profileId,
          sessionId: body.sessionId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      // Capture context BEFORE rethrowing so Sentry has the session/profile
      // attached. The global onError handler will also see the throw and
      // return a 5xx to the client so it retries — exactly what we want for
      // a CORE event whose silent drop would hang the session-completed
      // waitForEvent chain (streaks/XP/memory extraction).
      captureException(err, {
        profileId,
        extra: {
          event: 'app/filing.completed',
          bookId: result.bookId,
          sessionId: body.sessionId,
        },
      });
      logger.error('[filing] CORE app/filing.completed dispatch failed', {
        profileId,
        sessionId: body.sessionId,
        bookId: result.bookId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    return c.json(
      filingResultSchema.parse(
        usedFallback ? { ...result, fallback: true } : result,
      ),
      200,
    );
  });
