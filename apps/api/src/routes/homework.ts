import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import {
  OCR_CONSTRAINTS,
  ocrResultSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import { validationError, apiError } from '../errors';
import { startSession, SubjectInactiveError } from '../services/session';
import { getOcrProvider } from '../services/ocr';
import { captureException } from '../services/sentry';

type HomeworkRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    GEMINI_API_KEY?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const homeworkRoutes = new Hono<HomeworkRouteEnv>()
  // Start a homework help session
  .post('/subjects/:subjectId/homework', async (c) => {
    assertNotProxyMode(c);
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const subjectId = c.req.param('subjectId');

    try {
      const session = await startSession(db, profileId, subjectId, {
        subjectId,
        sessionType: 'homework',
        inputMode: 'text',
      });
      return c.json({ session }, 201);
    } catch (err) {
      if (err instanceof SubjectInactiveError) {
        return apiError(c, 403, ERROR_CODES.SUBJECT_INACTIVE, err.message);
      }
      throw err;
    }
  })

  // Server-side OCR endpoint (fallback for ML Kit)
  .post('/ocr', async (c) => {
    requireProfileId(c.get('profileId'));

    const body = await c.req.parseBody();
    const file = body['image'];

    if (!(file instanceof File)) {
      return validationError(c, 'Missing required field: image');
    }

    if (
      !OCR_CONSTRAINTS.acceptedMimeTypes.includes(
        file.type as (typeof OCR_CONSTRAINTS.acceptedMimeTypes)[number]
      )
    ) {
      return validationError(
        c,
        `Unsupported file type: ${
          file.type
        }. Accepted: ${OCR_CONSTRAINTS.acceptedMimeTypes.join(', ')}`
      );
    }

    if (file.size > OCR_CONSTRAINTS.maxFileSizeBytes) {
      return validationError(
        c,
        `File too large: ${file.size} bytes. Maximum: ${OCR_CONSTRAINTS.maxFileSizeBytes} bytes (5MB)`
      );
    }

    const imageBuffer = await file.arrayBuffer();
    let provider;
    try {
      provider = getOcrProvider(c.env.GEMINI_API_KEY);
    } catch (err) {
      // [FIX-API-5] 500 (not 503): missing config is a permanent server error,
      // not a transient service unavailability. Capture to Sentry so ops can see
      // how many requests hit an unconfigured OCR provider.
      captureException(err, {
        requestPath: '/ocr',
        extra: { context: 'ocr.provider_config' },
      });
      return apiError(
        c,
        500,
        ERROR_CODES.INTERNAL_ERROR,
        'OCR service is not configured. Please contact support.'
      );
    }
    const result = await provider.extractText(imageBuffer, file.type);

    // [BUG-660 / A-19] Validate the provider's response before returning.
    // The OcrProvider interface promises an OcrResult, but the underlying
    // call (Gemini/Vision/etc.) is an LLM JSON parse — malformed JSON or a
    // schema drift would propagate downstream and crash mobile parsing.
    // Schema-validate at the trust boundary so the client never sees junk
    // typed as `OcrResult`.
    const parsed = ocrResultSchema.safeParse(result);
    if (!parsed.success) {
      captureException(parsed.error, {
        requestPath: '/ocr',
        extra: { issues: parsed.error.issues, mimeType: file.type },
      });
      return apiError(
        c,
        502,
        ERROR_CODES.INTERNAL_ERROR,
        'OCR provider returned a malformed result. Please try again.'
      );
    }
    return c.json(parsed.data);
  });
