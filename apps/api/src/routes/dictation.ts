import { Hono } from 'hono';
import {
  prepareHomeworkInputSchema,
  recordDictationResultInputSchema,
  dictationReviewInputSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import { requireProfileId } from '../middleware/profile-scope';
import { apiError, validationError } from '../errors';
import {
  prepareHomework,
  generateDictation,
  reviewDictation,
  recordDictationResult,
  getDictationStreak,
  fetchGenerateContext,
} from '../services/dictation';

// ---------------------------------------------------------------------------
// Dictation Routes
//
// POST /dictation/prepare-homework — splits OCR'd/typed homework text into
//   dictation sentences with spoken-punctuation variants.
//
// POST /dictation/generate — generates age-appropriate dictation content
//   themed around the learner's recent study topics.
//
// POST /dictation/result — records a completed dictation session result
//   (for streak tracking and progress history).
//
// GET /dictation/streak — returns consecutive-days dictation streak for profile.
// ---------------------------------------------------------------------------

type DictationRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    profileMeta: ProfileMeta;
  };
};

// [MIN-1] Input schemas now live in @eduagent/schemas (shared contract rule).
// Imported above as recordDictationResultInputSchema and dictationReviewInputSchema.

function getServerDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Validates that the client-supplied localDate is within ±1 day of server UTC.
 * Returns null if the date is acceptable, or an error message string if not.
 */
function validateLocalDate(localDate: string): string | null {
  const serverDateMs = new Date(getServerDate()).getTime();
  const clientDateMs = new Date(localDate).getTime();
  const diffDays =
    Math.abs(serverDateMs - clientDateMs) / (24 * 60 * 60 * 1000);
  if (diffDays > 1) {
    return `localDate "${localDate}" is more than 1 day from server UTC date "${getServerDate()}". Use the current local date.`;
  }
  return null;
}

export const dictationRoutes = new Hono<DictationRouteEnv>()

  // -------------------------------------------------------------------------
  // POST /dictation/prepare-homework
  // Splits raw homework text into dictation sentences with punctuation variants.
  // -------------------------------------------------------------------------
  .post('/dictation/prepare-homework', async (c) => {
    requireProfileId(c.get('profileId'));

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return validationError(c, 'Request body must be valid JSON');
    }

    const parsed = prepareHomeworkInputSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(
        c,
        'text is required and must be between 1 and 10000 characters'
      );
    }

    const result = await prepareHomework(parsed.data.text);
    return c.json(result, 200);
  })

  // -------------------------------------------------------------------------
  // POST /dictation/generate
  // Generates age-appropriate dictation content from the learner's study context.
  // -------------------------------------------------------------------------
  .post('/dictation/generate', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const profileMeta = c.get('profileMeta');

    const ctx = await fetchGenerateContext(
      db,
      profileId,
      profileMeta?.birthYear ?? null
    );
    const result = await generateDictation(ctx);

    return c.json(result, 200);
  })

  // -------------------------------------------------------------------------
  // POST /dictation/result
  // Records a completed dictation session result (RF-04: accepts localDate from client).
  // -------------------------------------------------------------------------
  .post('/dictation/result', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return validationError(c, 'Request body must be valid JSON');
    }

    const parsed = recordDictationResultInputSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(
        c,
        'Invalid input: localDate, sentenceCount, and mode are required'
      );
    }

    // RF-04: Validate client-supplied date is within ±1 day of server UTC
    const dateError = validateLocalDate(parsed.data.localDate);
    if (dateError) {
      return apiError(c, 400, ERROR_CODES.VALIDATION_ERROR, dateError);
    }

    const row = await recordDictationResult(db, profileId, {
      localDate: parsed.data.localDate,
      sentenceCount: parsed.data.sentenceCount,
      mistakeCount: parsed.data.mistakeCount ?? null,
      mode: parsed.data.mode,
      reviewed: parsed.data.reviewed,
    });

    return c.json({ result: row }, 201);
  })

  // -------------------------------------------------------------------------
  // POST /dictation/review
  // Accepts a photo of handwritten dictation and original sentences, returns
  // an AI-powered review of spelling/punctuation mistakes.
  // -------------------------------------------------------------------------
  .post('/dictation/review', async (c) => {
    requireProfileId(c.get('profileId'));

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return validationError(c, 'Request body must be valid JSON');
    }

    const parsed = dictationReviewInputSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(
        c,
        'imageBase64 (max 2MB), imageMimeType (jpeg/png/webp), sentences (min 1), and language are required'
      );
    }

    const result = await reviewDictation({
      sentences: parsed.data.sentences,
      imageBase64: parsed.data.imageBase64,
      imageMimeType: parsed.data.imageMimeType,
      language: parsed.data.language,
    });

    return c.json(result, 200);
  })

  // -------------------------------------------------------------------------
  // GET /dictation/streak
  // Returns consecutive days of dictation practice for the profile.
  // -------------------------------------------------------------------------
  .get('/dictation/streak', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    const result = await getDictationStreak(db, profileId);
    return c.json(result);
  });
