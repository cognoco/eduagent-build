import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  prepareHomeworkInputSchema,
  prepareHomeworkOutputSchema,
  generateDictationOutputSchema,
  recordDictationResultInputSchema,
  recordDictationResultResponseSchema,
  dictationReviewInputSchema,
  dictationReviewResultSchema,
  dictationReviewPromptCharCount,
  dictationStreakSchema,
  DICTATION_REVIEW_MAX_PROMPT_CHARS,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import type { ProfileMeta } from '../middleware/profile-scope';
import { requireProfileId, requireAccount } from '../middleware/profile-scope';
import { parseConversationLanguage } from '../services/llm';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { apiError, validationError } from '../errors';
import {
  prepareHomework,
  generateDictation,
  reviewDictation,
  recordDictationResult,
  getDictationStreak,
  fetchGenerateContext,
} from '../services/dictation';
import { getLearningProfile } from '../services/learner-profile';
import { checkAndLogRateLimit } from '../services/settings';
import { createLogger } from '../services/logger';
import { captureException } from '../services/sentry';

const logger = createLogger();

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
    account: Account;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
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
  const serverDate = getServerDate();
  const serverDateMs = new Date(serverDate).getTime();
  const clientDateMs = new Date(localDate).getTime();
  const diffDays =
    Math.abs(serverDateMs - clientDateMs) / (24 * 60 * 60 * 1000);
  if (diffDays > 1) {
    return `localDate "${localDate}" is more than 1 day from server UTC date "${serverDate}". Use the current local date.`;
  }
  return null;
}

export const dictationRoutes = new Hono<DictationRouteEnv>()

  // -------------------------------------------------------------------------
  // POST /dictation/prepare-homework
  // Splits raw homework text into dictation sentences with punctuation variants.
  // -------------------------------------------------------------------------
  // [BUG-833] zValidator middleware replaces manual c.req.json() + safeParse.
  .post(
    '/dictation/prepare-homework',
    zValidator('json', prepareHomeworkInputSchema, (result, c) => {
      if (result.success) return;
      return validationError(
        c,
        'text is required and must be between 1 and 10000 characters',
      );
    }),
    async (c) => {
      requireProfileId(c.get('profileId'));
      const { text } = c.req.valid('json');
      // i18n Phase 1 — read conversation_language from the active profile so
      // the LLM-detected language detection still produces the JSON in the
      // learner's locale.
      const profileMeta = c.get('profileMeta');
      const result = await prepareHomework(text, {
        conversationLanguage: parseConversationLanguage(
          profileMeta?.conversationLanguage,
        ),
      });
      return c.json(prepareHomeworkOutputSchema.parse(result), 200);
    },
  )

  // -------------------------------------------------------------------------
  // POST /dictation/generate
  // Generates age-appropriate dictation content from the learner's study context.
  // -------------------------------------------------------------------------
  .post('/dictation/generate', async (c) => {
    assertNotProxyMode(c);
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const profileMeta = c.get('profileMeta');
    if (!profileMeta) {
      throw new Error(
        `[dictation/generate] profileMeta missing for profileId=${profileId}`,
      );
    }

    const ctx = await fetchGenerateContext(
      db,
      profileId,
      profileMeta.birthYear,
    );
    // i18n Phase 1 — forward the learner's UI locale into the dictation LLM.
    const result = await generateDictation({
      ...ctx,
      conversationLanguage: parseConversationLanguage(
        profileMeta?.conversationLanguage,
      ),
    });

    return c.json(generateDictationOutputSchema.parse(result), 200);
  })

  // -------------------------------------------------------------------------
  // POST /dictation/result
  // Records a completed dictation session result (RF-04: accepts localDate from client).
  // -------------------------------------------------------------------------
  // [BUG-833] zValidator middleware replaces manual c.req.json() + safeParse.
  .post(
    '/dictation/result',
    zValidator('json', recordDictationResultInputSchema, (result, c) => {
      if (result.success) return;
      return validationError(
        c,
        'Invalid input: localDate, sentenceCount, and mode are required',
      );
    }),
    async (c) => {
      assertNotProxyMode(c);
      const profileId = requireProfileId(c.get('profileId'));
      const db = c.get('db');
      const input = c.req.valid('json');

      // RF-04: Validate client-supplied date is within ±1 day of server UTC
      const dateError = validateLocalDate(input.localDate);
      if (dateError) {
        return apiError(c, 400, ERROR_CODES.VALIDATION_ERROR, dateError);
      }

      const row = await recordDictationResult(db, profileId, {
        completionKey: input.completionKey,
        localDate: input.localDate,
        sentenceCount: input.sentenceCount,
        mistakeCount: input.mistakeCount ?? null,
        mode: input.mode,
        reviewed: input.reviewed,
        subjectId: input.subjectId ?? null,
      });

      return c.json(
        recordDictationResultResponseSchema.parse({ result: row }),
        201,
      );
    },
  )

  // -------------------------------------------------------------------------
  // POST /dictation/review
  // Accepts a photo of handwritten dictation and original sentences, returns
  // an AI-powered review of spelling/punctuation mistakes.
  // -------------------------------------------------------------------------
  // [BUG-833] zValidator middleware replaces manual c.req.json() + safeParse.
  .post(
    '/dictation/review',
    zValidator('json', dictationReviewInputSchema, (result, c) => {
      if (result.success) return;
      return validationError(
        c,
        'imageBase64 (max 2MB), imageMimeType (jpeg/png/webp), sentences (min 1), and language are required',
      );
    }),
    async (c) => {
      // [WI-150/WI-206 precedence] zod's schema cap (max 50 sentences, max
      // 500 chars per sentence/withPunctuation) fires first → 400
      // VALIDATION_ERROR. The aggregate prompt-character budget below
      // (DICTATION_REVIEW_MAX_PROMPT_CHARS, currently 12_000 total) fires
      // only on requests that pass schema validation → 413 PAYLOAD_TOO_LARGE.
      // Clients switching UX on status code should handle both.
      const profileId = requireProfileId(c.get('profileId'));
      const db = c.get('db');
      const input = c.req.valid('json');

      // [CR-4] Per-profile rate limit: 10 requests per minute.
      // Placed after validation so invalid input gets 400, not a DB hit.
      // Placed before the LLM call so the expensive operation is gated.
      // Atomic check-and-log avoids TOCTOU where two concurrent requests
      // both read count=9, both pass, and both fire the expensive LLM call.
      // [CR-657] requireAccount() throws 401 if account is unset at runtime
      // (TS declares it non-nullable but that depends on middleware ordering).
      const account = requireAccount(c.get('account'));
      const rateLimited = await checkAndLogRateLimit(
        db,
        profileId,
        account.id,
        'dictation_review',
        { hours: 1 / 60, maxCount: 10 },
      );
      if (rateLimited) {
        return apiError(
          c,
          429,
          ERROR_CODES.RATE_LIMITED,
          'Dictation review is limited to 10 requests per minute.',
        );
      }

      // [WI-150 / WI-206] Total-prompt-character budget. The per-field zod
      // caps bound (count × per-sentence length); this final guard bounds
      // the AGGREGATE so an attacker can't get 50 sentences * 500 chars
      // through (= 25_000 chars of prompt material) when the legitimate
      // workflow needs ~2_000-4_000. Service layer enforces the same
      // budget as defense-in-depth (WI-206).
      const promptCharCount = dictationReviewPromptCharCount({
        sentences: input.sentences,
      });
      if (promptCharCount > DICTATION_REVIEW_MAX_PROMPT_CHARS) {
        return apiError(
          c,
          413,
          ERROR_CODES.PAYLOAD_TOO_LARGE,
          `Dictation review payload too large: ${promptCharCount} prompt chars exceeds limit of ${DICTATION_REVIEW_MAX_PROMPT_CHARS}.`,
        );
      }

      // Derive ageYears from profileMeta birthYear (same pattern as generate route).
      const profileMeta = c.get('profileMeta');
      if (!profileMeta) {
        throw new Error(
          `[dictation/review] profileMeta missing for profileId=${profileId}`,
        );
      }
      const ageYears = new Date().getFullYear() - profileMeta.birthYear;

      // Fetch struggles best-effort — if DB fails, review proceeds without them.
      let recentStruggles: string[] = [];
      try {
        const profile = await getLearningProfile(db, profileId);
        if (profile && Array.isArray(profile.struggles)) {
          recentStruggles = (profile.struggles as unknown[])
            .filter(
              (entry): entry is { topic: string; confidence?: string } =>
                typeof entry === 'object' &&
                entry !== null &&
                typeof (entry as { topic?: unknown }).topic === 'string',
            )
            .filter((entry) => entry.confidence !== 'low')
            .slice(0, 10)
            .map((entry) => entry.topic);
        }
      } catch (err) {
        // Graceful degradation — review proceeds without struggle-aware feedback.
        // Log so a systematic DB failure (e.g. connection-pool exhaustion, schema
        // drift) is queryable; the degradation rate must not be invisible to ops.
        logger.warn('[dictation] struggle fetch failed; degrading review', {
          event: 'dictation.struggle_fetch_failed',
          profileId,
          error: err instanceof Error ? err.message : String(err),
        });
        captureException(err, {
          extra: { context: 'dictation.review.struggles', profileId },
        });
      }

      const result = await reviewDictation({
        sentences: input.sentences,
        imageBase64: input.imageBase64,
        imageMimeType: input.imageMimeType,
        language: input.language,
        ageYears,
        recentStruggles,
        // i18n Phase 1 — feedback prose follows the learner's UI locale.
        conversationLanguage: parseConversationLanguage(
          profileMeta?.conversationLanguage,
        ),
      });

      return c.json(dictationReviewResultSchema.parse(result), 200);
    },
  )

  // -------------------------------------------------------------------------
  // GET /dictation/streak
  // Returns consecutive days of dictation practice for the profile.
  // -------------------------------------------------------------------------
  .get('/dictation/streak', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    const result = await getDictationStreak(db, profileId);
    return c.json(dictationStreakSchema.parse(result));
  });
