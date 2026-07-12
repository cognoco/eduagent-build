import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  recordSpeakingPracticeAttemptInputSchema,
  recordSpeakingPracticeAttemptResponseSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import type { ProfileMeta } from '../middleware/profile-scope';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import {
  notFound,
  validationError,
  SubjectNotFoundError,
  LearningSessionNotFoundError,
} from '../errors';
import { recordSpeakingPracticeAttempt } from '../services/speaking-practice';

// ---------------------------------------------------------------------------
// Speaking-Practice Routes (WI-1777)
//
// POST /language/speaking-practice/attempts — records a repeat-after-me/
//   shadowing attempt with a deterministic server-computed transcript-
//   comparison score (no LLM self-grading, no raw audio).
// ---------------------------------------------------------------------------

type SpeakingPracticeRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    callerPersonId: string | undefined;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

export const speakingPracticeRoutes = new Hono<SpeakingPracticeRouteEnv>().post(
  '/language/speaking-practice/attempts',
  zValidator('json', recordSpeakingPracticeAttemptInputSchema, (result, c) => {
    if (result.success) return;
    return validationError(
      c,
      'sessionId, subjectId, mode, targetText, transcript, and locale are required',
    );
  }),
  async (c) => {
    assertNotProxyMode(c);
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const input = c.req.valid('json');

    try {
      const result = await recordSpeakingPracticeAttempt(db, profileId, input);
      return c.json(
        recordSpeakingPracticeAttemptResponseSchema.parse(result),
        201,
      );
    } catch (err) {
      if (err instanceof SubjectNotFoundError) {
        return notFound(c, 'Subject not found');
      }
      if (err instanceof LearningSessionNotFoundError) {
        return notFound(c, 'Learning session not found');
      }
      throw err;
    }
  },
);
