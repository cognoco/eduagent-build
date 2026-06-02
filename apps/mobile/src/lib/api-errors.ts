/**
 * Typed error classes for API responses.
 *
 * Extracted into a standalone file (no React / Clerk dependencies) so that
 * `format-api-error.ts` can import them without triggering the full
 * `api-client.ts` module graph in tests.
 *
 * [BUG-644 / P-4] Shared typed error classes are sourced from
 * `@eduagent/schemas` so the API service can throw the same class that the
 * mobile client catches via `instanceof` — previously each side defined its
 * own copy and `instanceof` checks would only succeed within a single package.
 */

import {
  BadRequestError,
  ConflictError,
  ConsentRequiredError,
  ForbiddenError,
  NotFoundError,
  QuotaExceededError,
  quotaExceededSchema,
  RateLimitedError,
  ResourceGoneError,
  UnauthorizedError,
  type QuotaExceededDetails,
  type UpgradeOption,
} from '@eduagent/schemas';

export {
  BadRequestError,
  ConflictError,
  ConsentRequiredError,
  ForbiddenError,
  NotFoundError,
  QuotaExceededError,
  RateLimitedError,
  ResourceGoneError,
  UnauthorizedError,
  type QuotaExceededDetails,
  type UpgradeOption,
};

/**
 * Thrown when `fetch` itself rejects (no HTTP response received).
 * Distinguishes network-layer failures from API-layer errors.
 */
export class NetworkError extends Error {
  readonly errorCode = 'NETWORK_ERROR' as const;
  override readonly cause: unknown;

  constructor(
    message = "Looks like you're offline or our servers can't be reached. Check your internet connection and try again.",
    cause?: unknown,
  ) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * [CR-2026-05-21-156] Wraps `globalThis.fetch` so network-layer rejections
 * (no response received — DNS failure, offline, timeout, abort, etc.) become
 * typed `NetworkError` instead of leaking raw `TypeError` strings whose
 * format depends on the React Native / Hermes version.
 *
 * Use this from any code path that calls `fetch` directly OUTSIDE of
 * `api-client.ts`'s `customFetch` wrapper (e.g. health checks, OCR upload,
 * non-RPC endpoints). `customFetch` handles its own NetworkError wrapping
 * inside its closure.
 */
export async function fetchOrThrowNetworkError(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await globalThis.fetch(input, init);
  } catch (err) {
    throw new NetworkError(undefined, err);
  }
}

/**
 * [F-Q-01] Typed error for 5xx upstream responses.
 * Thrown by customFetch so callers can read `.code` and `.status` instead of
 * parsing raw JSON from Error.message.
 */
export class UpstreamError extends Error {
  readonly errorCode = 'UPSTREAM_ERROR' as const;
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status = 500) {
    super(message);
    this.name = 'UpstreamError';
    this.code = code;
    this.status = status;
    Object.setPrototypeOf(this, UpstreamError.prototype);
  }
}

// ---------------------------------------------------------------------------
// 402 quota-error classification (shared by every 402 classifier:
// api-client.customFetch, sse.classifyXhrError, assert-ok)
// ---------------------------------------------------------------------------

const VALID_TIERS: ReadonlyArray<QuotaExceededDetails['tier']> = [
  'free',
  'plus',
  'family',
  'pro',
];
const VALID_UPGRADE_TIERS: ReadonlyArray<UpgradeOption['tier']> = [
  'plus',
  'family',
  'pro',
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function asTier(
  value: unknown,
  fallback: QuotaExceededDetails['tier'],
): QuotaExceededDetails['tier'] {
  return VALID_TIERS.includes(value as QuotaExceededDetails['tier'])
    ? (value as QuotaExceededDetails['tier'])
    : fallback;
}

function asInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;
}

/**
 * Build a render-safe `QuotaExceededDetails` from a 402 body whose `details`
 * failed strict `quotaExceededSchema` validation. Every field the
 * `QuotaExceededCard` reads (reason, counters, resetsAt, topUpCreditsRemaining,
 * upgradeOptions) is defaulted to a safe, render-able value when the server's
 * `details` are absent or malformed.
 */
export function buildFallbackQuotaDetails(
  rawDetails: unknown,
): QuotaExceededDetails {
  const d = asRecord(rawDetails);
  const tier = asTier(d.tier, 'free');
  const upgradeOptions: UpgradeOption[] = Array.isArray(d.upgradeOptions)
    ? d.upgradeOptions.filter((option): option is UpgradeOption => {
        const opt = asRecord(option);
        return (
          VALID_UPGRADE_TIERS.includes(opt.tier as UpgradeOption['tier']) &&
          typeof opt.monthlyQuota === 'number' &&
          typeof opt.priceMonthly === 'number'
        );
      })
    : [];
  return {
    tier,
    effectiveAccessTier: asTier(d.effectiveAccessTier, tier),
    quotaModel: d.quotaModel === 'shared-pool' ? 'shared-pool' : 'per-profile',
    profileRole:
      d.profileRole === 'owner' || d.profileRole === 'child'
        ? d.profileRole
        : null,
    reason: d.reason === 'monthly' ? 'monthly' : 'daily',
    resetsAt:
      typeof d.resetsAt === 'string' ? d.resetsAt : new Date().toISOString(),
    monthlyLimit: asInt(d.monthlyLimit, 0),
    usedThisMonth: asInt(d.usedThisMonth, 0),
    dailyLimit:
      typeof d.dailyLimit === 'number' ? Math.trunc(d.dailyLimit) : null,
    usedToday: asInt(d.usedToday, 0),
    topUpCreditsRemaining: asInt(d.topUpCreditsRemaining, 0),
    upgradeOptions,
  };
}

/**
 * Classify a 402 response body. Returns a `QuotaExceededError` when the body is
 * a quota block — either a strict `quotaExceededSchema` match, OR a body
 * explicitly tagged `code: 'QUOTA_EXCEEDED'` whose `details` have drifted from
 * the schema (best-effort details via `buildFallbackQuotaDetails`). Returns
 * `null` for non-quota 402s so the caller constructs its own `UpstreamError`
 * (preserving per-call-site status/code semantics).
 *
 * Belt-and-braces: a server-side quota-details shape change can never silently
 * downgrade a quota block to a generic error (which would dead-end the user and
 * be mis-captured as an LLM/upstream error in telemetry).
 */
export function quotaErrorFromBody(
  raw: unknown,
  fallbackMessage?: string,
): QuotaExceededError | null {
  const strict = quotaExceededSchema.safeParse(raw);
  if (strict.success) {
    return new QuotaExceededError(strict.data.message, strict.data.details);
  }
  const body = asRecord(raw);
  const errObj = asRecord(body.error);
  const code = errObj.code ?? body.code;
  if (code !== 'QUOTA_EXCEEDED') return null;
  const message =
    (typeof body.message === 'string' && body.message) ||
    (typeof errObj.message === 'string' && errObj.message) ||
    fallbackMessage ||
    'Quota exceeded';
  return new QuotaExceededError(
    message,
    buildFallbackQuotaDetails(body.details),
  );
}
