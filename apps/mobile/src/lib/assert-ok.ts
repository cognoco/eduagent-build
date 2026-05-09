import { ConflictError } from './api-errors';

/**
 * Asserts that an API response is successful (2xx status).
 * Extracts the server's error message when available.
 * Throws an Error that TanStack Query will catch and surface as query/mutation error.
 *
 * [BUG-982 / CCR-PR127-M-9] Returns the response narrowed to the success
 * branch (`Extract<T, { ok: true }>`). TypeScript forbids `asserts` predicates
 * on async functions, so we encode the same narrowing via the return value.
 * `Extract` distributes over the response union (Hono RPC `ClientResponse`
 * has `ok: true` only on success-status members) and drops error-status
 * members at the type level. Callers can therefore do
 *   `const okRes = await assertOk(res); return await okRes.json();`
 * and TypeScript will infer the success-body type without an `as` cast.
 *
 * Existing callsites that still pattern as `await assertOk(res); ...res.json()`
 * continue to work — the return value is simply discarded and `res` keeps its
 * original union type. New code should prefer the narrowed return.
 */
export interface ApiResponseError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  bodyText?: string;
}

type AssertedOk<T> = T extends { ok: false } ? never : T;

export async function assertOk<T extends Response>(
  res: T,
): Promise<AssertedOk<T>> {
  if (res.ok) return res as AssertedOk<T>;

  let message = `Request failed (${res.status})`;
  let code: string | undefined;
  let details: unknown;
  // Read body as text first — Response body is a single-use stream, so calling
  // res.json() then res.text() in a catch would return empty on most runtimes.
  const bodyText = await res.text().catch(() => undefined);

  if (bodyText) {
    try {
      // [BUG-543] The API returns flat { code, message, details? } via
      // apiError() — NOT nested under an `error` key. The previous code read
      // body.error.code which was always undefined, making every error generic.
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      if (typeof body?.code === 'string') {
        code = body.code as string;
      }
      if (typeof body?.message === 'string') {
        message = body.message as string;
      }
      if (body?.details !== undefined) {
        details = body.details;
      }
    } catch {
      // Response body isn't JSON — use raw text if short enough
      if (bodyText.length > 0 && bodyText.length < 200) {
        message = bodyText;
      }
    }
  }

  if (res.status === 409) {
    const error = new ConflictError(message) as ConflictError &
      ApiResponseError;
    error.status = res.status;
    if (code) {
      error.code = code;
    }
    if (details !== undefined) {
      error.details = details;
    }
    if (bodyText) {
      error.bodyText = bodyText;
    }
    throw error;
  }

  const error = new Error(message) as ApiResponseError;
  error.name = 'ApiResponseError';
  error.status = res.status;
  if (code) {
    error.code = code;
  }
  if (details !== undefined) {
    error.details = details;
  }
  if (bodyText) {
    error.bodyText = bodyText;
  }
  throw error;
}
