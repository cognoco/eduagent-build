/**
 * Centralized error formatter for API and network errors.
 * Provides actionable, user-friendly messages based on error type.
 *
 * Does NOT handle:
 * - Clerk auth errors (use extractClerkError from clerk-error.ts)
 * - RevenueCat purchase errors (have their own discriminator in subscription.tsx)
 *
 * Error shapes in this codebase:
 * - Hono RPC client throws Error('API error {status}: {body}') for non-ok responses
 *   (see api-client.ts customFetch)
 * - QuotaExceededError for 402 responses (see api-client.ts)
 * - UpstreamError for 5xx responses with a parsed JSON code (see api-client.ts)
 * - TypeError from native fetch for network failures
 * - Standard Error for other caught exceptions
 */

const NETWORK_MESSAGE =
  "Looks like you're offline or our servers can't be reached. Check your internet connection and try again.";

const SERVER_MESSAGE =
  'Something went wrong on our end. Please try again in a moment.';

const DEFAULT_MESSAGE = 'Something unexpected happened. Please try again.';

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
  message: string;
}> = [
  {
    pattern: /not configured for language learning/i,
    message:
      "This subject isn't set up for language learning. Try the standard learning path instead.",
  },
  {
    pattern: /subject.*(paused|archived|inactive)/i,
    message:
      'This subject is on pause right now. You can resume it from your subjects list.',
  },
  {
    pattern: /curriculum.*not.*found/i,
    message:
      "We haven't set up your learning path yet. Go back and start the interview first.",
  },
  {
    pattern: /topic.*not.*found/i,
    message:
      "That topic isn't available right now. Try picking a different one.",
  },
  {
    pattern: /draft.*not.*found/i,
    message: 'Your progress was lost. Please start again.',
  },
  {
    pattern: /profile.*not.*found/i,
    message:
      'We had trouble loading your profile. Please sign out and back in.',
  },
  {
    pattern: /session.*not.*found/i,
    message: "That session isn't available anymore. Start a new one.",
  },
  {
    pattern: /already.*completed/i,
    message: "You've already finished this. Head back and pick something new.",
  },
  {
    pattern: /validation.*failed|invalid.*input|expected.*string/i,
    message:
      "Something didn't look right. Please check what you entered and try again.",
  },
];

/**
 * [F-Q-01] Detects messages that are technical/internal and should never
 * reach a user — LLM provider errors, JSON fragments, stack traces, etc.
 */
function isTechnicalMessage(msg: string): boolean {
  return (
    /\bLLM\b|structured output|upstream|provider|JSON|malformed|parse error/i.test(
      msg
    ) ||
    // JSON fragment or object literal in the message
    /\{"|\{\\"|^\[/.test(msg) ||
    // Stack trace indicators
    /\bat\b.*\.(ts|js):\d+/i.test(msg)
  );
}

/** Returns a friendly version if the message matches known jargon patterns. */
function friendlyMessage(raw: string): string | null {
  for (const entry of FRIENDLY_MESSAGE_MAP) {
    if (entry.pattern.test(raw)) {
      return entry.message;
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
  }
): { primary?: RecoveryAction; secondary?: RecoveryAction } {
  const goHome = handlers.goHome
    ? { label: 'Go Home', onPress: handlers.goHome, testID: 'recovery-go-home' }
    : undefined;

  switch (classified.recovery) {
    case 'retry':
      return {
        primary: handlers.retry
          ? {
              label: 'Try Again',
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
              label: 'Go Back',
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
              label: 'Sign Out',
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
 *  1. Network / connectivity failures → network / retry
 *  2. Named error types (QuotaExceededError, ForbiddenError) → quota or auth
 *  3. Error codes on the error object (apiCode, code)
 *  4. HTTP status from the "API error {status}: …" shape
 *  5. Message pattern heuristics (network keywords)
 *  6. Anything else → unknown / retry
 *
 * The message is derived AFTER classification so the classifier never
 * string-matches on formatted output.
 */
export function classifyApiError(error: unknown): FormattedApiError {
  // 1. Network errors (TypeError from native fetch)
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    if (msg.includes('fetch') || msg.includes('network')) {
      return {
        message: NETWORK_MESSAGE,
        category: 'network',
        recovery: 'retry',
      };
    }
  }

  // [I-13] UpstreamError — typed 5xx from api-client.ts. Classify before the
  // generic `instanceof Error` path so any .code value (not just
  // UPSTREAM_ERROR/INTERNAL_ERROR) is caught here rather than falling through
  // to parseApiBody heuristics. Name-based check avoids circular import.
  if (error instanceof Error && error.name === 'UpstreamError') {
    return { message: SERVER_MESSAGE, category: 'server', recovery: 'retry' };
  }

  if (error instanceof Error) {
    const msg = error.message;
    const msgLower = msg.toLowerCase();
    const apiErrorLike = error as Error & {
      status?: number;
      code?: string;
      apiCode?: string;
    };

    const effectiveCode = apiErrorLike.apiCode ?? apiErrorLike.code;

    // 2. Named error types
    if (error.name === 'QuotaExceededError') {
      return { message: msg, category: 'quota', recovery: 'none' };
    }

    if (error.name === 'ForbiddenError') {
      // Sub-classify by apiCode: SUBJECT_INACTIVE is a content state, not auth
      if (
        effectiveCode === 'SUBJECT_INACTIVE' ||
        effectiveCode === 'SUBJECT_PAUSED'
      ) {
        return {
          message: friendlyMessage(msg) ?? msg,
          category: 'not-found',
          recovery: 'go-back',
        };
      }
      return {
        message:
          friendlyMessage(msg) ??
          (msg || 'You do not have permission to view this.'),
        category: 'auth',
        recovery: 'sign-out',
      };
    }

    // 3. Typed error codes
    if (effectiveCode === 'EXCHANGE_LIMIT_EXCEEDED') {
      return {
        message: 'Session limit reached. Start a new session to keep going.',
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
      return { message: SERVER_MESSAGE, category: 'server', recovery: 'retry' };
    }

    // 3b. SSE timeout
    if (msgLower.includes('timed out while waiting for a reply')) {
      return {
        message: 'That reply took too long. Tap reconnect to try again.',
        category: 'network',
        recovery: 'retry',
      };
    }

    // 4. HTTP status from "API error {status}: …"
    const parsedApiBody = parseApiBody(msg);
    if (parsedApiBody) {
      const { status, code, apiMessage } = parsedApiBody;

      if (code === 'EXCHANGE_LIMIT_EXCEEDED') {
        return {
          message: 'Session limit reached. Start a new session to keep going.',
          category: 'quota',
          recovery: 'go-back',
        };
      }

      if (code === 'SUBJECT_INACTIVE') {
        const userMsg =
          apiMessage && apiMessage.length < 200
            ? friendlyMessage(apiMessage) ?? apiMessage
            : 'This subject is paused or archived. Resume it before starting a session.';
        return { message: userMsg, category: 'not-found', recovery: 'go-back' };
      }

      if (status === 401 || status === 403) {
        const userMsg =
          apiMessage && apiMessage.length < 200
            ? friendlyMessage(apiMessage) ?? apiMessage
            : 'You do not have permission to view this.';
        return { message: userMsg, category: 'auth', recovery: 'sign-out' };
      }

      if (status === 404) {
        const userMsg =
          apiMessage && apiMessage.length < 200
            ? friendlyMessage(apiMessage) ?? apiMessage
            : 'That page or item no longer exists.';
        return { message: userMsg, category: 'not-found', recovery: 'go-back' };
      }

      if (status === 429) {
        const userMsg =
          apiMessage && apiMessage.length < 200
            ? friendlyMessage(apiMessage) ?? apiMessage
            : "You've hit the limit. Wait a moment and try again.";
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
            ? friendlyMessage(apiMessage) ?? apiMessage
            : SERVER_MESSAGE,
          category: 'server',
          recovery: 'retry',
        };
      }

      // 4xx client errors
      if (apiMessage && apiMessage.length < 200) {
        return {
          message: friendlyMessage(apiMessage) ?? apiMessage,
          category: 'unknown',
          recovery: 'retry',
        };
      }
      return {
        message: "That didn't work. Please check your input and try again.",
        category: 'unknown',
        recovery: 'retry',
      };
    }

    // 5. Network keyword heuristics on the raw message
    if (isNetworkRelated(msgLower)) {
      return {
        message: NETWORK_MESSAGE,
        category: 'network',
        recovery: 'retry',
      };
    }

    // 6. Short, user-facing messages — pass through
    const looksLikeStack =
      /\n\s+at /.test(msg) || /at [A-Z]\w*\./.test(msg) || /^at \S/.test(msg);
    if (
      msg.length > 0 &&
      msg.length < 200 &&
      !looksLikeStack &&
      !msgLower.includes('undefined')
    ) {
      return {
        message: friendlyMessage(msg) ?? msg,
        category: 'unknown',
        recovery: 'retry',
      };
    }
  }

  // 7. Fallback for null / undefined / non-Error values
  return { message: DEFAULT_MESSAGE, category: 'unknown', recovery: 'retry' };
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
