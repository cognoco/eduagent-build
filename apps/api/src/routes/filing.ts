import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Database } from '@eduagent/database';
import { filingRequestSchema } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
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
  getSessionTranscript,
  backfillSessionTopicId,
} from '../services/session';
import { routeAndCall } from '../services/llm';
import { captureException } from '../services/sentry';
import { inngest } from '../inngest/client';
import { createLogger } from '../services/logger';

const logger = createLogger();

type FilingRouteEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

const retryRequestSchema = z.object({
  sessionId: z.string(),
  sessionMode: z.enum(['freeform', 'homework']).default('freeform'),
});

export const filingRoutes = new Hono<FilingRouteEnv>()
  .post(
    '/filing/request-retry',
    zValidator('json', retryRequestSchema),
    async (c) => {
      const profileId = requireProfileId(c.get('profileId'));
      const { sessionId, sessionMode } = c.req.valid('json');
      await inngest.send({
        name: 'app/filing.retry',
        data: { sessionId, sessionMode, profileId },
      });
      return c.json({ queued: true });
    }
  )
  .post('/filing', zValidator('json', filingRequestSchema), async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const body = c.req.valid('json');

    // If sessionId provided without transcript, build transcript server-side
    // from stored session events (avoids 50K client upload)
    let sessionTranscript = body.sessionTranscript;
    if (body.sessionId && !sessionTranscript && !body.rawInput) {
      const transcript = await getSessionTranscript(
        db,
        profileId,
        body.sessionId
      );
      if (transcript) {
        sessionTranscript = transcript.exchanges
          .map(
            (e) => `${e.role === 'user' ? 'Learner' : 'Tutor'}: ${e.content}`
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
        routeAndCall
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
      // Fire async retry for freeform/homework sessions
      if (sessionTranscript && body.sessionId) {
        await inngest
          .send({
            name: 'app/filing.retry',
            data: {
              profileId,
              sessionId: body.sessionId,
              sessionTranscript,
              sessionMode: body.sessionMode ?? 'freeform',
            },
          })
          .catch((retryErr) => {
            captureException(retryErr, {
              profileId,
              extra: {
                event: 'app/filing.retry',
                sessionId: body.sessionId,
                phase: 'fileToLibrary',
              },
            });
          });
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
          body.selectedSuggestion
        );
        usedFallback = true;
      } else {
        return c.json(
          { code: 'FILING_FAILED', message: "Couldn't organize this topic." },
          500
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
      if (!usedFallback && sessionTranscript && body.sessionId) {
        await inngest
          .send({
            name: 'app/filing.retry',
            data: {
              profileId,
              sessionId: body.sessionId,
              sessionTranscript,
              sessionMode: body.sessionMode ?? 'freeform',
            },
          })
          .catch((retryErr) => {
            captureException(retryErr, {
              profileId,
              extra: {
                event: 'app/filing.retry',
                sessionId: body.sessionId,
                phase: 'resolveFilingResult',
              },
            });
          });
      }
      return c.json(
        {
          code: 'FILING_RESOLUTION_FAILED',
          message: "Couldn't organize this topic. Please try again.",
        },
        500
      );
    }

    // Backfill topicId on the session so it appears in getBookSessions
    if (body.sessionId && result.topicId) {
      await backfillSessionTopicId(
        db,
        profileId,
        body.sessionId,
        result.topicId
      );
    }

    // Mark suggestion as picked/used (prevents reappearing in picker)
    if (body.pickedSuggestionId) {
      await markBookSuggestionPicked(db, profileId, body.pickedSuggestionId);
    }
    if (body.usedTopicSuggestionId) {
      await markTopicSuggestionUsed(db, profileId, body.usedTopicSuggestionId);
    }

    // Fire async suggestion generation — await to prevent silent event loss
    // (session-completed chain waits 60s for this event via waitForEvent)
    await inngest
      .send({
        name: 'app/filing.completed',
        data: {
          bookId: result.bookId,
          topicTitle: result.topicTitle,
          profileId,
          sessionId: body.sessionId,
          timestamp: new Date().toISOString(),
        },
      })
      .catch((err) => {
        captureException(err, {
          profileId,
          extra: { event: 'app/filing.completed', bookId: result.bookId },
        });
      });

    return c.json(usedFallback ? { ...result, fallback: true } : result, 200);
  });
