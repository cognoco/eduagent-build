/**
 * [WI-1059] API response body boundary validator.
 *
 * Validates the parsed JSON body of a successful API response against a zod
 * schema. Throws `ApiResponseShapeError` (from `@eduagent/schemas`) on
 * mismatch so the failure is typed and catchable via `instanceof` at the
 * client boundary — screens never need to inspect the schema error directly.
 *
 * Per AGENTS.md UX Resilience Rules: "Classify errors at the API client
 * boundary, not per-screen." This helper enforces that contract for the
 * parse step that follows `assertOk`.
 *
 * Usage:
 *   ```ts
 *   const res = await client.foo.$get({ ... });
 *   await assertOk(res);
 *   return await parseJson(res, fooResponseSchema);
 *   ```
 *
 * Per AGENTS.md "Response bodies are single-use": assertOk already read the
 * body via `res.text()` when the response is NOT ok. For ok responses assertOk
 * returns early without reading the body, so `res.json()` here is the first
 * (and only) body read.
 *
 * JSON parse failures (e.g. a 2xx HTML error page) are caught and re-thrown as
 * `ApiResponseShapeError` so callers always see a typed, classified error — never
 * a raw `SyntaxError`.
 */
import type { ZodType } from 'zod';
import { ApiResponseShapeError } from '@eduagent/schemas';

export async function parseJson<T>(
  res: Response,
  schema: ZodType<T>,
  context?: string,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await res.json();
  } catch (e) {
    throw new ApiResponseShapeError(context ?? 'API response', [
      {
        message:
          e instanceof Error ? e.message : 'Response body is not valid JSON',
      },
    ]);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiResponseShapeError(
      context ?? 'API response',
      result.error.issues,
    );
  }
  return result.data;
}
