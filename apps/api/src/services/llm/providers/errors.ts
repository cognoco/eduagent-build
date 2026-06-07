export type ProviderHttpError = Error & {
  status: number;
  statusCode: number;
};

// ---------------------------------------------------------------------------
// Provider error construction — content-safe by design.
//
// Vendor error payloads can echo the request. Content-filter rejections in
// particular often include the flagged input text in the HTTP body or the
// `message` field. Those values flow into `Error.message` / `Error.cause`,
// and both `logger.warn` (line ~49 of router.ts) and Sentry (a US processor)
// capture them. For a minors product that is a special-category-data leak on
// exactly the sensitive prompts we most need to keep out of logs.
//
// So a provider error NEVER carries vendor free-text. We keep only the
// structured, non-content fields the router classifies on:
//   - HTTP status (`status` / `statusCode`) → findHttpStatus / isTransientError
//   - vendor `type` / `code` category tokens → isSafetyPolicyError /
//     isValidationPolicyError (e.g. 'content_policy_violation',
//     'authentication_error', 'rate_limit_exceeded')
// and discard everything else (the raw body, the vendor `message`). The first
// argument to each constructor MUST be a content-free constant label — never
// interpolate the response body or vendor message into it.
// ---------------------------------------------------------------------------

interface RedactedErrorDetail {
  /** Vendor category token (e.g. 'authentication_error', 'content_policy_violation'). Non-content. */
  type?: string;
  /**
   * Vendor code token (e.g. 'invalid_api_key', 'rate_limit_exceeded', or a
   * numeric HTTP-status mirror like 404). Non-content. Kept as string OR number
   * because the router's `findHttpStatus` reads a numeric `.code` as an HTTP
   * status for transient/client classification — dropping the number would
   * silently reclassify the error.
   */
  code?: string | number;
}

function asTypeToken(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asCodeToken(value: unknown): string | number | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

/**
 * Extract ONLY the non-content classification tokens (`type`, `code`) from a
 * vendor error object. Accepts either the parsed `data.error` object or a
 * `{ error: { ... } }` wrapper. The free-text `message` and any other fields
 * are intentionally dropped. Never returns body content.
 */
export function redactProviderErrorDetail(
  detail: unknown,
): RedactedErrorDetail {
  if (detail == null || typeof detail !== 'object') return {};
  const root = detail as Record<string, unknown>;
  const inner =
    root.error && typeof root.error === 'object'
      ? (root.error as Record<string, unknown>)
      : root;
  const result: RedactedErrorDetail = {};
  const type = asTypeToken(inner.type);
  const code = asCodeToken(inner.code);
  if (type !== undefined) result.type = type;
  if (code !== undefined) result.code = code;
  return result;
}

function detailSuffix(detail: RedactedErrorDetail): string {
  const parts = [detail.type, detail.code].filter((v) => v != null);
  return parts.length > 0 ? ` [${parts.join('/')}]` : '';
}

/**
 * Build an HTTP-status provider error with NO vendor body in the message or
 * cause. `label` must be a content-free constant (e.g. "Anthropic API
 * request"). Only the HTTP status and the body length survive — never the
 * body text. Status-only classification is preserved exactly (the prior
 * implementation also classified HTTP errors by status alone, not by body).
 */
export function createProviderHttpError(
  label: string,
  status: number,
  responseBody: string,
): ProviderHttpError {
  const err = new Error(`${label} failed (status ${status})`, {
    cause: { status, statusCode: status, bodyLength: responseBody.length },
  }) as ProviderHttpError;
  err.status = status;
  err.statusCode = status;
  return err;
}

/**
 * Build a provider API error for the case where the vendor returned a 2xx with
 * an `error` object in the body. `label` is a content-free constant (e.g.
 * "Anthropic API"); `detail` is the raw vendor error object — only its `type`
 * and `code` category tokens survive into the message and cause, never its
 * free-text `message`. This preserves `isSafetyPolicyError` /
 * `isValidationPolicyError` classification (both read `.type` / `.code`).
 */
export function createProviderApiError(label: string, detail: unknown): Error {
  const redacted = redactProviderErrorDetail(detail);
  return new Error(`${label} error${detailSuffix(redacted)}`, {
    cause: redacted,
  });
}
