import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { assertLlmConsent } from '../services/identity-v2/consent-status-v2';
import {
  OCR_CONSTRAINTS,
  ocrResultSchema,
  homeworkStartResponseSchema,
  ERROR_CODES,
  type SubscriptionTier,
} from '@eduagent/schemas';
import { validationError, apiError } from '../errors';
import { startSession, SubjectInactiveError } from '../services/session';
import { getOcrProvider } from '../services/ocr';
import { getTierConfig } from '../services/subscription';
import { captureException } from '../services/sentry';

type HomeworkRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    // Set by meteringMiddleware (/ocr is a metered LLM route); used to pick the
    // tier-correct vision model. [Gemini-retirement Phase A / T-A4]
    subscriptionTier: SubscriptionTier | undefined;
  };
};

export const homeworkRoutes = new Hono<HomeworkRouteEnv>()
  // Start a homework help session
  .post('/subjects/:subjectId/homework', async (c) => {
    await assertNotProxyMode(c);
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const subjectId = c.req.param('subjectId');

    try {
      const session = await startSession(db, profileId, subjectId, {
        subjectId,
        sessionType: 'homework',
        inputMode: 'text',
      });
      return c.json(homeworkStartResponseSchema.parse({ session }), 201);
    } catch (err) {
      if (err instanceof SubjectInactiveError) {
        return apiError(c, 403, ERROR_CODES.SUBJECT_INACTIVE, err.message);
      }
      throw err;
    }
  })

  // Server-side OCR endpoint (fallback for ML Kit)
  .post('/ocr', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    // [WI-2396] Consent-withdrawal gate before LLM dispatch (canon R5). The
    // OCR provider (getOcrProvider -> extractText) routes through the LLM
    // vision model unconditionally.
    await assertLlmConsent(db, profileId);

    // [BUG-283] Reject oversize requests BEFORE parseBody() pulls the whole
    // multipart body into memory. Multipart boundary + headers add overhead
    // on top of the file bytes, so allow up to 2x the file cap before the
    // header-level reject; the per-file size check later still enforces the
    // exact maxFileSizeBytes limit on the parsed File.
    //
    // [ACCEPTED LIMITATION] This guard only fires when the client sends a
    // Content-Length header. HTTP/1.1 chunked-transfer-encoding requests omit
    // the header and bypass this check — the body is not buffered until
    // parseBody() is called, so there is no header to read upfront. We accept
    // this limitation because:
    //   1. Cloudflare Workers enforce a platform-level 100MB request body limit
    //      regardless of transfer encoding, so oversized chunked requests are
    //      still rejected at the edge before reaching application code.
    //   2. The React Native fetch client used by the mobile app sends
    //      Content-Length on form-data uploads, so the common path is covered.
    //   3. Enforcing chunked-body buffering at the framework level (buffering
    //      the entire stream before checking size) would add latency and memory
    //      pressure for all requests to gain a guard that Cloudflare already
    //      provides at the platform level.
    // If this endpoint ever needs a tighter application-level cap on chunked
    // bodies, buffer the stream manually before parseBody() and check .size.
    const contentLengthHeader = c.req.header('content-length');
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (
        Number.isFinite(contentLength) &&
        contentLength > OCR_CONSTRAINTS.maxFileSizeBytes * 2
      ) {
        return apiError(
          c,
          413,
          ERROR_CODES.VALIDATION_ERROR,
          `Request body too large: ${contentLength} bytes. Maximum: ${
            OCR_CONSTRAINTS.maxFileSizeBytes * 2
          } bytes (~10MB including multipart envelope).`,
        );
      }
    }

    const body = await c.req.parseBody();
    const file = body['image'];

    if (!(file instanceof File)) {
      return validationError(c, 'Missing required field: image');
    }

    if (
      !OCR_CONSTRAINTS.acceptedMimeTypes.includes(
        file.type as (typeof OCR_CONSTRAINTS.acceptedMimeTypes)[number],
      )
    ) {
      return validationError(
        c,
        `Unsupported file type: ${
          file.type
        }. Accepted: ${OCR_CONSTRAINTS.acceptedMimeTypes.join(', ')}`,
      );
    }

    if (file.size > OCR_CONSTRAINTS.maxFileSizeBytes) {
      return validationError(
        c,
        `File too large: ${file.size} bytes. Maximum: ${OCR_CONSTRAINTS.maxFileSizeBytes} bytes (5MB)`,
      );
    }

    const imageBuffer = await file.arrayBuffer();
    // [Gemini-retirement Phase A / T-A4] OCR no longer keys on GEMINI_API_KEY.
    // Always route through the registered LLM provider, threading the request's
    // subscription tier so the V2 vision matrix picks free→Mistral / paid→GPT-5
    // mini. subscriptionTier is set by meteringMiddleware (/ocr is metered);
    // absent → free/'flash' (cheapest, safest default).
    const subscriptionTier = c.get('subscriptionTier');
    const llmTier = subscriptionTier
      ? getTierConfig(subscriptionTier).llmTier
      : 'flash';
    let provider;
    try {
      provider = getOcrProvider(true, false, llmTier);
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
        'OCR service is not configured. Please contact support.',
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
        'OCR provider returned a malformed result. Please try again.',
      );
    }
    return c.json(parsed.data);
  });
