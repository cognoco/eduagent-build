import {
  BadRequestError,
  ConflictError,
  ConsentRequiredError,
  ForbiddenError,
  QuotaExceededError,
  RateLimitedError,
  ResourceGoneError,
  UpstreamError,
} from './api-errors';
import { quotaExceededSchema } from '@eduagent/schemas';

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

  // [BUG-544] Mirror customFetch's full typed-error hierarchy so Hono RPC
  // calls through assertOk get the same typed errors as customFetch calls.
  // Previously only 409 was mapped; everything else became a generic Error
  // with a status property, causing 403 → sign-out instead of go-back, etc.
  if (res.status === 400) {
    throw attachResponseFields(
      new BadRequestError(message),
      res.status,
      code,
      details,
      bodyText,
    );
  }

  if (res.status === 402) {
    // Try to parse as a quota-exceeded structured body first
    if (bodyText) {
      try {
        const rawParsed: unknown = JSON.parse(bodyText);
        const quotaResult = quotaExceededSchema.safeParse(rawParsed);
        if (quotaResult.success) {
          throw new QuotaExceededError(
            quotaResult.data.message,
            quotaResult.data.details,
          );
        }
      } catch (e) {
        // Re-throw guard: the outer catch (e) above wraps both the body-text read
        // and quotaExceededSchema.safeParse. If a QuotaExceededError was already
        // constructed (happy path), preserve it; otherwise fall through to
        // UpstreamError with the truncated body.
        // Re-throw if it's a QuotaExceededError we just constructed
        if (e instanceof QuotaExceededError) throw e;
        // Otherwise fall through to UpstreamError
      }
    }
    throw attachResponseFields(
      new UpstreamError(message, code ?? 'PAYMENT_REQUIRED', 402),
      res.status,
      code,
      details,
      bodyText,
    );
  }

  if (res.status === 403) {
    if (code === 'CONSENT_REQUIRED') {
      throw attachResponseFields(
        new ConsentRequiredError(message, code),
        res.status,
        code,
        details,
        bodyText,
      );
    }
    throw attachResponseFields(
      new ForbiddenError(message, code ?? undefined),
      res.status,
      code,
      details,
      bodyText,
    );
  }

  if (res.status === 409) {
    throw attachResponseFields(
      new ConflictError(message),
      res.status,
      code,
      details,
      bodyText,
    );
  }

  if (res.status === 410) {
    throw attachResponseFields(
      new ResourceGoneError(message, code ?? undefined, details),
      res.status,
      code,
      details,
      bodyText,
    );
  }

  if (res.status === 429) {
    throw attachResponseFields(
      new RateLimitedError(message, code ?? undefined, undefined, undefined),
      res.status,
      code,
      details,
      bodyText,
    );
  }

  if (res.status >= 500) {
    throw attachResponseFields(
      new UpstreamError(message, code ?? 'UPSTREAM_ERROR', res.status),
      res.status,
      code,
      details,
      bodyText,
    );
  }

  // Remaining unhandled status codes
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

/** Attach ApiResponseError fields to any typed error subclass. */
function attachResponseFields<T extends Error>(
  err: T,
  status: number,
  code: string | undefined,
  details: unknown,
  bodyText: string | undefined,
): T & ApiResponseError {
  const apiErr = err as T & ApiResponseError;
  apiErr.status = status;
  if (code) apiErr.code = code;
  if (details !== undefined) apiErr.details = details;
  if (bodyText) apiErr.bodyText = bodyText;
  return apiErr;
}
