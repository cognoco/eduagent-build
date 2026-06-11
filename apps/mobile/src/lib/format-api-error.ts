import { i18next } from '../i18n';
import type { TranslateKey } from '../i18n';

/**
 * Centralized error formatter for API and network errors.
 * Provides actionable, user-friendly messages based on error type.
 *
 * Does NOT handle:
 * - Clerk auth errors (use extractClerkError from clerk-error.ts)
 * - RevenueCat purchase errors (have their own discriminator in subscription.tsx)
 *
 * Error shapes in this codebase:
 * - NetworkError for fetch-layer rejections (see api-client.ts customFetch)
 * - BadRequestError for 400 responses (see api-client.ts)
 * - QuotaExceededError for 402 responses (see api-client.ts)
 * - ForbiddenError for 403 responses (see api-client.ts)
 * - NotFoundError for 404 responses (see api-client.ts)
 * - ResourceGoneError for 410 responses (see api-client.ts)
 * - RateLimitedError for 429 responses (see api-client.ts)
 * - UpstreamError for 5xx responses with a parsed JSON code (see api-client.ts)
 * - TypeError from native fetch for network failures (legacy path)
 * - Standard Error for other caught exceptions
 */
// ---------------------------------------------------------------------------
// HMR-safe type guards [BUG-947]
//
// Metro HMR can reload api-errors.ts and create a new class identity without
// updating all consumers, breaking instanceof. These guards match on the stable
// .name string (set in every constructor) plus required property shape, so error
// classification survives hot reloads. Built-in `instanceof Error` is stable.
// ---------------------------------------------------------------------------

type UpstreamLike = Error & { code: string; status: number };
function isUpstreamError(error: unknown): error is UpstreamLike {
  return (
    error instanceof Error &&
    error.name === 'UpstreamError' &&
    'code' in error &&
    'status' in error
  );
}

function isNetworkError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'NetworkError';
}

function isNotFoundError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'NotFoundError';
}

function isResourceGoneError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'ResourceGoneError';
}

function isRateLimitedError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'RateLimitedError';
}

function isBadRequestError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'BadRequestError';
}

type QuotaExceededLike = Error & { code: string; details: unknown };
function isQuotaExceededError(error: unknown): error is QuotaExceededLike {
  return (
    error instanceof Error &&
    error.name === 'QuotaExceededError' &&
    'code' in error &&
    'details' in error
  );
}

type ForbiddenLike = Error & { errorCode: string; apiCode?: string };
function isForbiddenError(error: unknown): error is ForbiddenLike {
  return (
    error instanceof Error &&
    error.name === 'ForbiddenError' &&
    'errorCode' in error
  );
}

// [CCR PR #282] ConsentRequiredError carries the stable name and an
// `errorCode = 'CONSENT_REQUIRED'` property (see packages/schemas/src/errors.ts).
// Requiring BOTH (name + errorCode shape) is the anti-spoofing pattern used by
// the other typed-error guards in this file — a plain Error with a spoofed
// `name = 'ConsentRequiredError'` and no errorCode property will not match.
type ConsentRequiredLike = Error & { errorCode: string };
function isConsentRequiredError(error: unknown): error is ConsentRequiredLike {
  return (
    error instanceof Error &&
    error.name === 'ConsentRequiredError' &&
    'errorCode' in error &&
    (error as { errorCode?: unknown }).errorCode === 'CONSENT_REQUIRED'
  );
}

// Thunks resolve at call time so they reflect the active language, not
// whatever language i18next had at module-load time.
//
// [I18N-LIVE-SWITCH TODO] These — and every t(...) call inside classifyApiError
// below — translate at *classify time*, which today equals render time because
// classification happens in a render path. Once live language switching lands
// (FEATURE_FLAGS.I18N_ENABLED true with mid-session changeLanguage), the
// classified string can be cached in component state across a language switch
// and end up out-of-date. When wiring live switch, change the FormattedApiError
// shape to carry a translation *key* (or token + interpolation values) instead
// of a pre-translated string, and translate in the consuming component.
const NETWORK_MESSAGE = () => i18next.t('errors.networkError');
const SERVER_MESSAGE = () => i18next.t('errors.serverError');
const DEFAULT_MESSAGE = () => i18next.t('errors.generic');

function isGenericServerMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/\.+$/, '');
  return (
    normalized === 'internal server error' ||
    normalized === 'bad gateway' ||
    normalized === 'service unavailable' ||
    normalized === 'gateway timeout' ||
    normalized === 'server error' ||
    normalized === 'request failed'
  );
}

/**
 * [BUG-465] Maps server-side technical messages to kid-friendly alternatives.
 * Server validation strings use schema/DB vocabulary that reads like jargon
 * to young users. This layer intercepts those before they reach the UI.
 */
const FRIENDLY_MESSAGE_MAP: Array<{
  pattern: RegExp;
  key: TranslateKey;
}> = [
  {
    pattern: /not configured for language learning/i,
    key: 'friendlyErrors.notLanguageLearning',
  },
  {
    pattern: /subject.*(paused|archived|inactive)/i,
    key: 'friendlyErrors.subjectPaused',
  },
  {
    pattern: /curriculum.*not.*found/i,
    key: 'friendlyErrors.curriculumNotFound',
  },
  { pattern: /topic.*not.*found/i, key: 'friendlyErrors.topicNotFound' },
  { pattern: /draft.*not.*found/i, key: 'friendlyErrors.draftNotFound' },
  { pattern: /profile.*not.*found/i, key: 'friendlyErrors.profileNotFound' },
  { pattern: /session.*not.*found/i, key: 'friendlyErrors.sessionNotFound' },
  { pattern: /already.*completed/i, key: 'friendlyErrors.alreadyCompleted' },
  {
    pattern: /validation.*failed|invalid.*input|expected.*string/i,
    key: 'friendlyErrors.validationFailed',
  },
];

/**
 * [F-Q-01] Detects messages that are technical/internal and should never
 * reach a user — LLM provider errors, JSON fragments, stack traces, JS
 * runtime errors (ReferenceError / TypeError shapes), etc.
 *
 * The runtime-error patterns prevent Hermes / V8 messages from leaking to
 * the chat UI when an unhandled exception is caught and routed through
 * `formatApiError`. A real example surfaced as a chat bubble showing
 * `Property 'crypto' doesn't exist` (Hermes ReferenceError, BUG fixed by
 * the expo-crypto migration) — that class of message must never reach a
 * user even after the underlying bug is fixed.
 */
function isTechnicalMessage(msg: string): boolean {
  return (
    /\bLLM\b|structured output|upstream|provider|JSON|malformed|parse error/i.test(
      msg,
    ) ||
    // Cloudflare Worker error codes (e.g. "error code: 1102") — infrastructure
    // errors that should never reach users.
    /\berror code:\s*\d+/i.test(msg) ||
    // JSON fragment or object literal in the message
    /\{"|\{\\"|^\[/.test(msg) ||
    // Stack trace indicators
    /\bat\b.*\.(ts|js):\d+/i.test(msg) ||
    // Hermes / V8 runtime-error shapes — never surfaced to users.
    // Includes ASCII and curly quote variants (Hermes uses ASCII; the
    // curly variants are belt-and-braces in case logging or i18n
    // pipelines normalize quotes before reaching the formatter).
    /Property\s+['"`‘’“”].+['"`‘’“”]\s+doesn[’']?t\s+exist/i.test(msg) ||
    /\bis not (defined|a function|an object|iterable)\b/i.test(msg) ||
    /Cannot read propert(y|ies) of (undefined|null)/i.test(msg) ||
    /\bundefined is not an? (object|function)\b/i.test(msg) ||
    /^(Reference|Type|Syntax|Range)Error:/i.test(msg)
  );
}

/**
 * Single gate for "is this short message safe to render as user-facing copy?"
 * Used by both the typed-BadRequestError branch, the generic 4xx fallback, and
 * the bare-error tail to keep the technical-message rejection consistent. If
 * any branch skips this check, JS engine errors (`Property 'crypto' doesn't
 * exist`) and stack-traced strings can leak into chat bubbles.
 */
function shouldPassThroughUserMessage(msg: string): boolean {
  const looksLikeStack =
    /\n\s+at /.test(msg) || /at [A-Z]\w*\./.test(msg) || /^at \S/.test(msg);
  return (
    msg.length > 0 &&
    msg.length < 200 &&
    !looksLikeStack &&
    !msg.toLowerCase().includes('undefined') &&
    !isTechnicalMessage(msg)
  );
}

/** Returns a friendly version if the message matches known jargon patterns. */
function friendlyMessage(raw: string): string | null {
  for (const entry of FRIENDLY_MESSAGE_MAP) {
    if (entry.pattern.test(raw)) {
      return i18next.t(entry.key);
    }
  }
  return null;
}

/** Checks if message contains network-related keywords. */
function isNetworkRelated(msg: string): boolean {
  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('abort') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ENOTFOUND')
  );
}

// [BUG-545] parseApiBody removed — customFetch and classifyXhrError now always
// throw typed errors (UpstreamError with code + status fields) instead of plain
// Error("API error {status}: …"). Classification uses typed shape checks, not
// regex parsing of formatted message strings. This eliminates the
// "classify errors before formatting" anti-pattern (see AGENTS.md Code Quality
// Guards). The statuses this handled (401, 403, 404, 402, 429, 5xx) are now
// covered by the UpstreamError instanceof / shape-guard branches above.

/**
 * Structured error classification result.
 *
 * - `category` — what kind of error it is (drives icon / heading choice in UI)
 * - `recovery` — what the user should do next (drives which action buttons to show)
 * - `message` — kid-friendly body text (reuses all FRIENDLY_MESSAGE_MAP logic)
 * - `blocksManualEntry` — true when the current resource/profile context is
 *   invalid enough that screens should not keep manual fallback entry open
 */
type ApiErrorCategory =
  | 'network'
  | 'not-found'
  | 'quota'
  | 'auth'
  | 'server'
  | 'unknown';
type ApiErrorRecovery = 'retry' | 'go-back' | 'sign-out' | 'none';

interface ClassifiedApiErrorCore {
  message: string;
  category: ApiErrorCategory;
  recovery: ApiErrorRecovery;
}

export interface FormattedApiError extends ClassifiedApiErrorCore {
  blocksManualEntry: boolean;
}

function blocksManualEntryForCategory(category: ApiErrorCategory): boolean {
  return (
    category === 'not-found' || category === 'quota' || category === 'auth'
  );
}

function formatClassifiedApiError(
  error: ClassifiedApiErrorCore,
): FormattedApiError {
  return {
    ...error,
    blocksManualEntry: blocksManualEntryForCategory(error.category),
  };
}

interface RecoveryAction {
  label: string;
  onPress: () => void;
  testID: string;
}

/**
 * Maps a classified error's `recovery` field into primary + secondary actions
 * suitable for `ErrorFallback` or `platformAlert` buttons.
 *
 * - `retry`    → primary "Try Again",   secondary "Go Home"
 * - `go-back`  → primary "Go Back",     secondary "Go Home"
 * - `sign-out` → primary "Sign Out",    secondary "Go Home"
 * - `none`     → primary "Go Home" only (quota screens — nothing to retry)
 */
export function recoveryActions(
  classified: FormattedApiError,
  handlers: {
    retry?: () => void;
    goBack?: () => void;
    goHome?: () => void;
    signOut?: () => void;
  },
): { primary?: RecoveryAction; secondary?: RecoveryAction } {
  const goHome = handlers.goHome
    ? {
        label: i18next.t('recovery.goHome'),
        onPress: handlers.goHome,
        testID: 'recovery-go-home',
      }
    : undefined;

  switch (classified.recovery) {
    case 'retry':
      return {
        primary: handlers.retry
          ? {
              label: i18next.t('recovery.tryAgain'),
              onPress: handlers.retry,
              testID: 'recovery-retry',
            }
          : goHome,
        secondary: handlers.retry ? goHome : undefined,
      };
    case 'go-back':
      return {
        primary: handlers.goBack
          ? {
              label: i18next.t('recovery.goBack'),
              onPress: handlers.goBack,
              testID: 'recovery-go-back',
            }
          : goHome,
        secondary: handlers.goBack ? goHome : undefined,
      };
    case 'sign-out':
      return {
        primary: handlers.signOut
          ? {
              label: i18next.t('recovery.signOut'),
              onPress: handlers.signOut,
              testID: 'recovery-sign-out',
            }
          : goHome,
        secondary: handlers.signOut ? goHome : undefined,
      };
    case 'none':
      return { primary: goHome };
  }
}

/**
 * Classifies an error into a structured `FormattedApiError`.
 *
 * Classification order (each step narrows the raw error, NOT the formatted
 * message — per the "Classify Before Format" rule):
 *  1. Typed NetworkError / TypeError network failures → network / retry
 *  2. Typed error classes from api-client.ts boundary (HMR-safe name guards)
 *  3. Error codes on the error object (apiCode, code)
 *  4. HTTP status on Error objects or the "API error {status}: …" fallback
 *  5. Message pattern heuristics (network keywords)
 *  6. Anything else → unknown / retry
 *
 * The message is derived AFTER classification so the classifier never
 * string-matches on formatted output.
 */
function classifyApiErrorCore(error: unknown): ClassifiedApiErrorCore {
  // [CR-145] Precondition: null/undefined cannot be coerced to an Error, and
  // any attempt to read .message on them throws. Return early so no branch
  // below can accidentally dereference a null/undefined error.
  if (error == null) {
    return {
      message: DEFAULT_MESSAGE(),
      category: 'unknown',
      recovery: 'retry',
    };
  }

  // [CR-2026-05-21-156] Typed NetworkError — thrown by customFetch AND by
  // fetchOrThrowNetworkError (the standalone wrapper used by raw-fetch
  // callsites outside customFetch: OCR upload, challenge round). The legacy
  // TypeError string-match fallback was removed once those callsites were
  // audited and migrated — Hermes/RN message-format drift could otherwise
  // silently classify offline errors as 'unknown' instead of 'network'.
  if (isNetworkError(error)) {
    return {
      message: NETWORK_MESSAGE(),
      category: 'network',
      recovery: 'retry',
    };
  }

  // [I-13] UpstreamError — typed 5xx from api-client.ts. Classify before the
  // generic `instanceof Error` path so any .code value (not just
  // UPSTREAM_ERROR/INTERNAL_ERROR) is caught here rather than falling through
  // to parseApiBody heuristics.
  if (isUpstreamError(error)) {
    // [BUG-947] 402 PROFILE_LIMIT_EXCEEDED is a subscription-tier upgrade gate,
    // not a server fault. The route layer returns 402 with a clear actionable
    // message ("Please upgrade to Family or Pro"), but the generic UpstreamError
    // path below would replace it with "Something went wrong on our end" — the
    // exact symptom QA reported as a fake 500. Route it through the quota
    // category and surface the server's message verbatim so the user knows the
    // real reason and the create-profile screen can detect the code and route
    // to the upgrade flow.
    if (error.status === 402 && error.code === 'PROFILE_LIMIT_EXCEEDED') {
      return {
        category: 'quota' as const,
        message: friendlyMessage(error.message) ?? error.message,
        recovery: 'go-back' as const,
      };
    }
    return {
      category: 'server' as const,
      message:
        friendlyMessage(error.message) ?? i18next.t('errors.serverError'),
      recovery: 'retry' as const,
    };
  }

  // Typed 404 — NotFoundError from api-client.ts
  if (isNotFoundError(error)) {
    return {
      message: friendlyMessage(error.message) ?? i18next.t('errors.notFound'),
      category: 'not-found',
      recovery: 'go-back',
    };
  }

  // Typed 410 — ResourceGoneError from api-client.ts
  if (isResourceGoneError(error)) {
    return {
      message:
        friendlyMessage(error.message) ?? i18next.t('errors.resourceGone'),
      category: 'not-found',
      recovery: 'go-back',
    };
  }

  // Typed 429 — RateLimitedError from api-client.ts
  if (isRateLimitedError(error)) {
    return {
      message:
        friendlyMessage(error.message) ?? i18next.t('errors.rateLimited'),
      category: 'quota',
      recovery: 'retry',
    };
  }

  // Typed 400 — BadRequestError from api-client.ts. Pass through the server
  // message when it's short and non-technical (same logic as the short
  // user-facing message passthrough below), with a friendly override if matched.
  if (isBadRequestError(error)) {
    const msg = error.message;
    const passThrough = shouldPassThroughUserMessage(msg);
    return {
      message: passThrough
        ? (friendlyMessage(msg) ?? msg)
        : i18next.t('errors.badRequest'),
      category: 'unknown',
      // [CR-157] 400 Bad Request cannot be resolved by retrying with the same
      // payload — the server will reject it again. Go-back so the user can
      // correct their input or navigate away.
      recovery: 'go-back',
    };
  }

  // Typed 402 — QuotaExceededError from api-client.ts
  // [BUG-774 / I-11] Spoofing guard: name-based guard requires .code + .details,
  // so a plain Error with a spoofed .name won't match.
  if (isQuotaExceededError(error)) {
    return { message: error.message, category: 'quota', recovery: 'none' };
  }

  // Typed 403 — ConsentRequiredError from api-client.ts. Consent gating cannot
  // be retried by tapping a button — the parent must complete the consent flow
  // off-screen first. Surface go-back so the standard ErrorFallback hides the
  // Retry primary action; otherwise users would loop on Retry hitting the same
  // 403/CONSENT_REQUIRED. Classified BEFORE ForbiddenError so the more
  // specific consent branch wins (api-client throws ConsentRequiredError for
  // 403/CONSENT_REQUIRED and ForbiddenError for all other 403s).
  if (isConsentRequiredError(error)) {
    return {
      message:
        friendlyMessage(error.message) ??
        (error.message || i18next.t('errors.forbidden')),
      category: 'auth',
      recovery: 'go-back',
    };
  }

  // Typed 403 — ForbiddenError from api-client.ts
  if (isForbiddenError(error)) {
    const effectiveCode = error.apiCode ?? error.errorCode;
    if (
      effectiveCode === 'SUBJECT_INACTIVE' ||
      effectiveCode === 'SUBJECT_PAUSED'
    ) {
      return {
        message: friendlyMessage(error.message) ?? error.message,
        category: 'not-found',
        recovery: 'go-back',
      };
    }
    if (
      effectiveCode === 'EMAIL_NOT_AVAILABLE' ||
      effectiveCode === 'EMAIL_NOT_VERIFIED'
    ) {
      return {
        message: friendlyMessage(error.message) ?? error.message,
        category: 'auth',
        recovery: 'retry',
      };
    }
    // Proxy-mode rejection (parent acting on a child profile that can't perform
    // a write op) is a 403 but must NOT trigger sign-out — the user just needs
    // to switch back to their owner profile or skip the action.
    if (effectiveCode === 'PROXY_MODE') {
      return {
        message: friendlyMessage(error.message) ?? error.message,
        category: 'auth',
        recovery: 'go-back',
      };
    }
    return {
      message:
        friendlyMessage(error.message) ??
        (error.message || i18next.t('errors.forbidden')),
      category: 'auth',
      recovery: 'sign-out',
    };
  }

  if (error instanceof Error) {
    const msg = error.message;
    const msgLower = msg.toLowerCase();
    const apiErrorLike = error as Error & {
      status?: number;
      code?: string;
      errorCode?: string;
      apiCode?: string;
    };

    // Read errorCode (typed-error field, e.g. ForbiddenError) before falling
    // back to the legacy `code` duck-type — HMR can break the `instanceof`
    // branch above and drop a typed error into this generic path; without
    // errorCode here the EXCHANGE_LIMIT_EXCEEDED / PROXY_MODE classifications
    // would silently miss.
    const effectiveCode =
      apiErrorLike.apiCode ?? apiErrorLike.errorCode ?? apiErrorLike.code;

    // 3. Typed error codes
    if (effectiveCode === 'EXCHANGE_LIMIT_EXCEEDED') {
      return {
        message: i18next.t('errors.sessionLimitReached'),
        category: 'quota',
        recovery: 'go-back',
      };
    }
    if (effectiveCode === 'SUBJECT_INACTIVE') {
      return {
        message: friendlyMessage(msg) ?? msg,
        category: 'not-found',
        recovery: 'go-back',
      };
    }
    if (
      effectiveCode === 'EMAIL_NOT_AVAILABLE' ||
      effectiveCode === 'EMAIL_NOT_VERIFIED'
    ) {
      return {
        message: friendlyMessage(msg) ?? msg,
        category: 'auth',
        recovery: 'retry',
      };
    }
    if (
      effectiveCode === 'UPSTREAM_ERROR' ||
      effectiveCode === 'INTERNAL_ERROR'
    ) {
      return {
        message: SERVER_MESSAGE(),
        category: 'server',
        recovery: 'retry',
      };
    }

    if (typeof apiErrorLike.status === 'number') {
      const status = apiErrorLike.status;
      const userMsg =
        msg.length < 200 ? (friendlyMessage(msg) ?? msg) : undefined;

      // [BUG-546] Distinguish 401 (session expired) from 403 (forbidden).
      // For 401: triggerAuthExpired() has already initiated async sign-out
      // (wave 1 / BUG-547). Showing a 'sign-out' recovery button on top of
      // an in-progress sign-out creates a double-sign-out + guard race.
      // Use recovery:'none' so no action button is rendered — the in-progress
      // sign-out will navigate away shortly.
      // For 403: this is a genuine auth/permission failure; 'sign-out' is correct.
      if (status === 401) {
        return {
          message: i18next.t('errors.sessionExpired'),
          category: 'auth',
          recovery: 'none',
        };
      }
      if (status === 403) {
        return {
          message: userMsg ?? i18next.t('errors.forbidden'),
          category: 'auth',
          recovery: 'sign-out',
        };
      }

      if (status === 404 || status === 410) {
        return {
          message: userMsg ?? i18next.t('errors.notFound'),
          category: 'not-found',
          recovery: 'go-back',
        };
      }

      if (status === 429) {
        return {
          message: userMsg ?? i18next.t('errors.rateLimited'),
          category: 'quota',
          recovery: 'retry',
        };
      }

      if (status >= 500) {
        return {
          message:
            userMsg && !isGenericServerMessage(userMsg)
              ? userMsg
              : SERVER_MESSAGE(),
          category: 'server',
          recovery: 'retry',
        };
      }
    }

    // 3b. SSE timeout — classify by the stable `isTimeout` property set by
    // sse.ts, then fall back to message heuristic only for legacy paths that
    // don't set the property. [BUG-389] The property check is the primary
    // gate: it survives message text changes and i18n refactors. The message
    // heuristic is retained solely as a belt-and-braces fallback for
    // third-party or test paths that construct the error without `isTimeout`.
    if (
      (error as Error & { isTimeout?: unknown }).isTimeout === true ||
      msgLower.includes('timed out while waiting for a reply')
    ) {
      return {
        message: i18next.t('errors.timedOut'),
        category: 'network',
        recovery: 'retry',
      };
    }

    // [BUG-545] Step 4 (parseApiBody regex classifier) removed. customFetch and
    // classifyXhrError now always throw typed errors (UpstreamError with .code
    // and .status), so the "API error {status}: …" plain-Error path is dead.
    // EXCHANGE_LIMIT_EXCEEDED and SUBJECT_INACTIVE codes are handled in the
    // UpstreamError shape-guard branch above (steps 2–3).

    // 4. Network keyword heuristics on the raw message
    if (isNetworkRelated(msgLower)) {
      return {
        message: NETWORK_MESSAGE(),
        category: 'network',
        recovery: 'retry',
      };
    }

    // 6. Short, user-facing messages — pass through via the shared gate.
    // Recovery is 'retry': this path is a generic fallback that also fires for
    // spoofed errors (see anti-spoofing test). Only the explicit BadRequestError
    // path above (branch 5) uses 'go-back' for CR-157. [CR-157]
    if (shouldPassThroughUserMessage(msg)) {
      return {
        message: friendlyMessage(msg) ?? msg,
        category: 'unknown',
        recovery: 'retry',
      };
    }
  }

  // 7. Fallback for non-Error values (plain objects, strings, numbers, etc.)
  return { message: DEFAULT_MESSAGE(), category: 'unknown', recovery: 'retry' };
}

export function classifyApiError(error: unknown): FormattedApiError {
  return formatClassifiedApiError(classifyApiErrorCore(error));
}

/**
 * [CCR PR #282] Centralized error-code extraction.
 *
 * Screens MUST NOT inspect `error.name === 'ForbiddenError' | ...` directly.
 * Classification — including extracting a stable error code — belongs at the
 * API-client boundary (this module), per the UX Resilience rule in AGENTS.md.
 *
 * Returns the canonical code used elsewhere in the codebase:
 *   - `apiCode` / `code` / `errorCode` on the typed error object (preferred)
 *   - 'FORBIDDEN'         for typed ForbiddenError instances
 *   - 'CONSENT_REQUIRED'  for typed ConsentRequiredError instances
 *   - 'QUOTA_EXCEEDED'    for typed QuotaExceededError instances
 *   - `undefined` if none of the above apply
 *
 * Uses the SAME HMR-safe name+shape guards as the classifier, so a plain Error
 * with a spoofed `.name` and no required shape property cannot impersonate a
 * typed error.
 */
export function extractApiErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;

  const apiError = error as {
    apiCode?: unknown;
    errorCode?: unknown;
    code?: unknown;
  };

  if (typeof apiError.apiCode === 'string') return apiError.apiCode;
  if (typeof apiError.errorCode === 'string') return apiError.errorCode;
  if (typeof apiError.code === 'string') return apiError.code;

  // Anti-spoofing: only return name-based codes when the typed-error shape
  // guards match (require both name AND the matching shape property).
  if (isForbiddenError(error)) return 'FORBIDDEN';
  if (isConsentRequiredError(error)) return 'CONSENT_REQUIRED';
  if (isQuotaExceededError(error)) return 'QUOTA_EXCEEDED';

  return undefined;
}

/**
 * Formats an error into a user-friendly, actionable message.
 *
 * Delegates to `classifyApiError` — the classify-before-format pattern
 * ensures classification logic lives in a single place.
 *
 * @param error - The caught error (unknown type from catch blocks)
 * @returns A user-facing error string
 */
export function formatApiError(error: unknown): string {
  return classifyApiError(error).message;
}
