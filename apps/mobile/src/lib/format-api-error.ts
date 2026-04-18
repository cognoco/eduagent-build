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
 * Formats an error into a user-friendly, actionable message.
 *
 * @param error - The caught error (unknown type from catch blocks)
 * @returns A user-facing error string
 */
export function formatApiError(error: unknown): string {
  // 1. Network errors (TypeError from fetch failures)
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    if (msg.includes('fetch') || msg.includes('network')) {
      return NETWORK_MESSAGE;
    }
  }

  // 2. Error instances (most common — from Hono RPC customFetch)
  if (error instanceof Error) {
    const msg = error.message;
    const msgLower = msg.toLowerCase();
    const apiErrorLike = error as Error & {
      status?: number;
      code?: string;
      apiCode?: string;
      details?: unknown;
    };

    // [BUG-100] Check both .code and .apiCode — ForbiddenError stores the
    // server's error code in .apiCode while .code stays 'FORBIDDEN'.
    const effectiveCode = apiErrorLike.apiCode ?? apiErrorLike.code;

    if (effectiveCode === 'EXCHANGE_LIMIT_EXCEEDED') {
      return 'Session limit reached. Start a new session to keep going.';
    }

    if (effectiveCode === 'SUBJECT_INACTIVE') {
      return msg;
    }

    // 2a. QuotaExceededError — pass through its message
    if (error.name === 'QuotaExceededError') {
      return msg;
    }

    // [EP15-I5] ForbiddenError — pass through the server's message
    if (error.name === 'ForbiddenError') {
      return msg || 'You do not have permission to view this.';
    }

    if (msgLower.includes('timed out while waiting for a reply')) {
      return 'That reply took too long. Tap reconnect to try again.';
    }

    // 2b. Parse 'API error {status}: {body}' from customFetch
    const parsedApiBody = parseApiBody(msg);
    if (parsedApiBody) {
      if (parsedApiBody.code === 'EXCHANGE_LIMIT_EXCEEDED') {
        return 'Session limit reached. Start a new session to keep going.';
      }
      if (parsedApiBody.code === 'SUBJECT_INACTIVE') {
        return (
          parsedApiBody.apiMessage ??
          'This subject is paused or archived. Resume it before starting a session.'
        );
      }
      if (parsedApiBody.status >= 500) {
        if (
          parsedApiBody.apiMessage &&
          parsedApiBody.apiMessage.length < 200 &&
          !isGenericServerMessage(parsedApiBody.apiMessage)
        ) {
          return parsedApiBody.apiMessage;
        }
        return SERVER_MESSAGE;
      }
      if (parsedApiBody.apiMessage && parsedApiBody.apiMessage.length < 200) {
        return parsedApiBody.apiMessage;
      }
      return "That didn't work. Please check your input and try again.";
    }

    // Note: parseApiStatus was removed here — it matched the exact same
    // "API error (\d{3}):" regex as parseApiBody, so if parseApiBody returned
    // null the status fallback was also unreachable (dead code).

    // 2c. Network-related error messages
    if (isNetworkRelated(msgLower)) {
      return NETWORK_MESSAGE;
    }

    // 2d. If the message looks user-facing (short, no stack traces), pass through.
    // Stack traces contain patterns like "at Object.foo" or "at Module._compile".
    // V8 stack frames: "\n    at " prefix, or "at CapitalizedWord." pattern.
    const looksLikeStack =
      /\n\s+at /.test(msg) || /at [A-Z]\w*\./.test(msg) || /^at \S/.test(msg);
    if (
      msg.length > 0 &&
      msg.length < 200 &&
      !looksLikeStack &&
      !msgLower.includes('undefined')
    ) {
      return msg;
    }
  }

  // 3. null/undefined/non-Error values
  return DEFAULT_MESSAGE;
}
