import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Database } from '@eduagent/database';
import { filingRequestSchema } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import {
  buildLibraryIndex,
  fileToLibrary,
  resolveFilingResult,
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

type FilingRouteEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const filingRoutes = new Hono<FilingRouteEnv>().post(
  '/filing',
  zValidator('json', filingRequestSchema),
  async (c) => {
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
      console.error('[filing] fileToLibrary failed:', err);
      return c.json(
        { code: 'FILING_FAILED', message: "Couldn't organize this topic." },
        500
      );
    }

    // Resolve into actual DB records
    // Note: 'pre_generated' is only set via the migration default on existing rows.
    // The filing route always produces 'session_filing' or 'freeform_filing'.
    const filedFrom = sessionTranscript
      ? ('freeform_filing' as const)
      : ('session_filing' as const);

    let result;
    try {
      result = await resolveFilingResult(db, {
        profileId,
        filingResponse,
        filedFrom,
        sessionId: body.sessionId,
      });
    } catch (err) {
      console.error('[filing] resolveFilingResult failed:', err);
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

    return c.json(result, 200);
  }
);
