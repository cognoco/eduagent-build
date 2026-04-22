/**
 * Asserts that an API response is successful (2xx status).
 * Extracts the server's error message when available.
 * Throws an Error that TanStack Query will catch and surface as query/mutation error.
 */
export interface ApiResponseError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  bodyText?: string;
}

export async function assertOk(res: Response): Promise<void> {
  if (res.ok) return;

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
