/**
 * Asserts that an API response is successful (2xx status).
 * Extracts the server's error message when available.
 * Throws an Error that TanStack Query will catch and surface as query/mutation error.
 */
export async function assertOk(res: Response): Promise<void> {
  if (res.ok) return;

  let message = `Request failed (${res.status})`;
  try {
    // Try to extract structured error message from API response body.
    // The API returns errors as { error: { code, message } } (apiErrorSchema).
    const body = await res.json();
    if (typeof body?.error?.message === 'string') {
      message = body.error.message;
    }
  } catch {
    // Response body isn't JSON — use generic message with status code
  }
  throw new Error(message);
}
