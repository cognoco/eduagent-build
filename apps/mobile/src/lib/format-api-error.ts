import { i18next } from '../i18n';

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
  key: string;
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

function parseApiBody(message: string): {
  status: number;
  code?: string;
  apiMessage?: string;
} | null {
  const match = /^API error (\d{3}):\s*(.*)$/s.exec(message);
  if (!match) {
    return null;
  }

  const status = Number(match[1]);
  const body = match[2]?.trim() ?? '';
  if (!body) {
    return { status };
  }

  try {
    const parsed = JSON.parse(body) as {
      message?: string;
      code?: string;
      error?: { code?: string; message?: string };
    };
    return {
      status,
      code: parsed.error?.code ?? parsed.code,
      apiMessage: parsed.error?.message ?? parsed.message,
    };
  } catch {
    return {
      status,
      apiMessage: body.length < 200 ? body : undefined,
    };
  }
}

/**
 * Structured error classification result.
 *
 * - `category` — what kind of error it is (drives icon / heading choice in UI)
 * - `recovery` — what the user should do next (drives which action buttons to show)
 * - `message` — kid-friendly body text (reuses all FRIENDLY_MESSAGE_MAP logic)
 */
export interface FormattedApiError {
  message: string;
  category: 'network' | 'not-found' | 'quota' | 'auth' | 'server' | 'unknown';
  recovery: 'retry' | 'go-back' | 'sign-out' | 'none';
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
 *  4. HTTP status from the "API error {status}: …" shape (plain Error fallback)
 *  5. Message pattern heuristics (network keywords)
 *  6. Anything else → unknown / retry
 *
 * The message is derived AFTER classification so the classifier never
 * string-matches on formatted output.
 */
export function classifyApiError(error: unknown): FormattedApiError {
  // 1. Typed NetworkError — thrown by customFetch on fetch rejection
  if (isNetworkError(error)) {
    return {
      message: NETWORK_MESSAGE(),
      category: 'network',
      recovery: 'retry',
    };
  }

  // 1b. Legacy TypeError from native fetch (raw fetch calls outside customFetch)
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    if (msg.includes('fetch') || msg.includes('network')) {
      return {
        message: NETWORK_MESSAGE(),
        category: 'network',
        recovery: 'retry',
      };
    }
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
      recovery: 'retry',
    };
  }

  // Typed 402 — QuotaExceededError from api-client.ts
  // [BUG-774 / I-11] Spoofing guard: name-based guard requires .code + .details,
  // so a plain Error with a spoofed .name won't match.
  if (isQuotaExceededError(error)) {
    return { message: error.message, category: 'quota', recovery: 'none' };
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
      effectiveCode === 'UPSTREAM_ERROR' ||
      effectiveCode === 'INTERNAL_ERROR'
    ) {
      return {
        message: SERVER_MESSAGE(),
        category: 'server',
        recovery: 'retry',
      };
    }

    // 3b. SSE timeout
    if (msgLower.includes('timed out while waiting for a reply')) {
      return {
        message: i18next.t('errors.timedOut'),
        category: 'network',
        recovery: 'retry',
      };
    }

    // 4. HTTP status from "API error {status}: …" (plain Error fallback shape —
    // emitted for 402 without QUOTA_EXCEEDED code, and any other unclassified
    // statuses that fall through customFetch).
    const parsedApiBody = parseApiBody(msg);
    if (parsedApiBody) {
      const { status, code, apiMessage } = parsedApiBody;

      if (code === 'EXCHANGE_LIMIT_EXCEEDED') {
        return {
          message: i18next.t('errors.sessionLimitReached'),
          category: 'quota',
          recovery: 'go-back',
        };
      }

      if (code === 'SUBJECT_INACTIVE') {
        const userMsg =
          apiMessage && apiMessage.length < 200
            ? (friendlyMessage(apiMessage) ?? apiMessage)
            : i18next.t('friendlyErrors.subjectPaused');
        return { message: userMsg, category: 'not-found', recovery: 'go-back' };
      }

      if (status === 401 || status === 403) {
        const userMsg =
          apiMessage && apiMessage.length < 200
            ? (friendlyMessage(apiMessage) ?? apiMessage)
            : i18next.t('errors.forbidden');
        return { message: userMsg, category: 'auth', recovery: 'sign-out' };
      }

      if (status === 404) {
        const userMsg =
          apiMessage && apiMessage.length < 200
            ? (friendlyMessage(apiMessage) ?? apiMessage)
            : i18next.t('errors.notFound');
        return { message: userMsg, category: 'not-found', recovery: 'go-back' };
      }

      if (status === 429) {
        const userMsg =
          apiMessage && apiMessage.length < 200
            ? (friendlyMessage(apiMessage) ?? apiMessage)
            : i18next.t('errors.rateLimited');
        return { message: userMsg, category: 'quota', recovery: 'retry' };
      }

      if (status >= 500) {
        const hasUsefulMsg =
          apiMessage &&
          apiMessage.length < 200 &&
          !isGenericServerMessage(apiMessage) &&
          !isTechnicalMessage(apiMessage);
        return {
          message: hasUsefulMsg
            ? (friendlyMessage(apiMessage) ?? apiMessage)
            : SERVER_MESSAGE(),
          category: 'server',
          recovery: 'retry',
        };
      }

      // 4xx client errors — same passthrough gate as the typed
      // BadRequestError branch so technical / stack / runtime-error shapes
      // never become chat bubbles.
      if (apiMessage && shouldPassThroughUserMessage(apiMessage)) {
        return {
          message: friendlyMessage(apiMessage) ?? apiMessage,
          category: 'unknown',
          recovery: 'retry',
        };
      }
      return {
        message: i18next.t('errors.badRequest'),
        category: 'unknown',
        recovery: 'retry',
      };
    }

    // 5. Network keyword heuristics on the raw message
    if (isNetworkRelated(msgLower)) {
      return {
        message: NETWORK_MESSAGE(),
        category: 'network',
        recovery: 'retry',
      };
    }

    // 6. Short, user-facing messages — pass through via the shared gate.
    if (shouldPassThroughUserMessage(msg)) {
      return {
        message: friendlyMessage(msg) ?? msg,
        category: 'unknown',
        recovery: 'retry',
      };
    }
  }

  // 7. Fallback for null / undefined / non-Error values
  return { message: DEFAULT_MESSAGE(), category: 'unknown', recovery: 'retry' };
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
