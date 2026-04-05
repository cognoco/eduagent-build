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

/** Checks whether an error message looks like a raw API error from customFetch. */
function parseApiStatus(message: string): number | null {
  const match = /^API error (\d{3}):/.exec(message);
  return match ? Number(match[1]) : null;
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

    // 2a. QuotaExceededError — pass through its message
    if (error.name === 'QuotaExceededError') {
      return msg;
    }

    // 2b. Parse 'API error {status}: {body}' from customFetch
    const status = parseApiStatus(msg);
    if (status !== null) {
      const bodyStart = msg.indexOf(': ') + 2;
      const body = msg.slice(bodyStart).trim();
      // Try to parse JSON body for a message field — works for both 4xx and 5xx.
      // The API may include a user-facing message even on server errors
      // (e.g. email delivery failure returns 502 with a specific message).
      try {
        const parsed: unknown = JSON.parse(body);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'message' in parsed &&
          typeof (parsed as { message: unknown }).message === 'string'
        ) {
          const apiMessage = (parsed as { message: string }).message;
          if (apiMessage.length < 200) {
            return apiMessage;
          }
        }
      } catch {
        // Body is not JSON — for 4xx, use plain text if it's short and readable.
        // For 5xx, fall through to the generic server message.
        if (
          status < 500 &&
          body.length > 0 &&
          body.length < 200 &&
          !body.includes('{')
        ) {
          return body;
        }
      }
      if (status >= 500) {
        return SERVER_MESSAGE;
      }
      return "That didn't work. Please check your input and try again.";
    }

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
