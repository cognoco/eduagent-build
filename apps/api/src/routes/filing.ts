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
import { getSessionTranscript } from '../services/session';
import { routeAndCall } from '../services/llm';
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
    } catch {
      return c.json(
        { code: 'FILING_FAILED', message: "Couldn't organize this topic." },
        500
      );
    }

    // Resolve into actual DB records
    const filedFrom = sessionTranscript
      ? ('freeform_filing' as const)
      : ('session_filing' as const);

    const result = await resolveFilingResult(db, {
      profileId,
      filingResponse,
      filedFrom,
      sessionId: body.sessionId,
    });

    // Mark suggestion as picked/used (prevents reappearing in picker)
    if (body.pickedSuggestionId) {
      await markBookSuggestionPicked(db, body.pickedSuggestionId);
    }
    if (body.usedTopicSuggestionId) {
      await markTopicSuggestionUsed(db, body.usedTopicSuggestionId);
    }

    // Fire async suggestion generation (non-blocking)
    void inngest.send({
      name: 'app/filing.completed',
      data: {
        bookId: result.bookId,
        topicTitle: result.topicTitle,
        profileId,
        sessionId: body.sessionId,
        timestamp: new Date().toISOString(),
      },
    });

    return c.json(result, 200);
  }
);
