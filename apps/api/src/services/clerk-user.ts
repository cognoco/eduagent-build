import { z } from 'zod';
import { captureException } from './sentry';
import { createLogger } from './logger';

const logger = createLogger();

const CLERK_API_BASE = 'https://api.clerk.com/v1';
const VERIFIED_EMAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_VERIFIED_EMAIL_CACHE_ENTRIES = 1_000;

const clerkVerificationSchema = z
  .object({
    status: z.string().optional(),
  })
  .passthrough()
  .nullable()
  .optional();

const clerkEmailAddressSchema = z
  .object({
    id: z.string().optional(),
    email_address: z.string().email(),
    verification: clerkVerificationSchema,
  })
  .passthrough();

const clerkUserSchema = z
  .object({
    primary_email_address_id: z.string().nullable().optional(),
    primary_email_address: clerkEmailAddressSchema.nullable().optional(),
    email_addresses: z.array(clerkEmailAddressSchema).default([]),
  })
  .passthrough();

export type VerifiedClerkEmailSource = 'jwt' | 'clerk-api' | 'clerk-api-cache';

export type VerifiedClerkEmailResult =
  | { ok: true; email: string; source: VerifiedClerkEmailSource }
  | {
      ok: false;
      reason: 'email-missing' | 'email-not-verified' | 'lookup-unavailable';
      message: string;
    };

interface VerifiedEmailCacheEntry {
  email: string;
  expiresAt: number;
}

const verifiedEmailCache = new Map<string, VerifiedEmailCacheEntry>();

function readCachedVerifiedEmail(userId: string): string | null {
  const cached = verifiedEmailCache.get(userId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    verifiedEmailCache.delete(userId);
    return null;
  }
  return cached.email;
}

function writeCachedVerifiedEmail(userId: string, email: string): void {
  if (verifiedEmailCache.size >= MAX_VERIFIED_EMAIL_CACHE_ENTRIES) {
    const oldestKey = verifiedEmailCache.keys().next().value as
      | string
      | undefined;
    if (oldestKey) verifiedEmailCache.delete(oldestKey);
  }
  verifiedEmailCache.set(userId, {
    email,
    expiresAt: Date.now() + VERIFIED_EMAIL_CACHE_TTL_MS,
  });
}

export function invalidateVerifiedClerkEmailCache(userId: string): void {
  verifiedEmailCache.delete(userId);
}

export function clearVerifiedClerkEmailCacheForTest(): void {
  verifiedEmailCache.clear();
}

function verificationStatus(
  address: z.infer<typeof clerkEmailAddressSchema>,
): string | undefined {
  return address.verification?.status;
}

function extractVerifiedPrimaryEmail(payload: unknown): string | null {
  const parsed = clerkUserSchema.safeParse(payload);
  if (!parsed.success) return null;

  const user = parsed.data;
  const primary =
    user.primary_email_address ??
    user.email_addresses.find(
      (address) => address.id === user.primary_email_address_id,
    ) ??
    null;

  if (primary && verificationStatus(primary) === 'verified') {
    return primary.email_address;
  }

  if (!user.primary_email_address_id && user.email_addresses.length === 1) {
    const [onlyAddress] = user.email_addresses;
    if (onlyAddress && verificationStatus(onlyAddress) === 'verified') {
      return onlyAddress.email_address;
    }
  }

  return null;
}

export async function resolveVerifiedClerkEmail({
  userId,
  tokenEmail,
  tokenEmailVerified,
  clerkSecretKey,
  fetchImpl = fetch,
}: {
  userId: string;
  tokenEmail?: string;
  tokenEmailVerified?: boolean;
  clerkSecretKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<VerifiedClerkEmailResult> {
  if (tokenEmail && tokenEmailVerified === true) {
    return { ok: true, email: tokenEmail, source: 'jwt' };
  }

  const cachedEmail = readCachedVerifiedEmail(userId);
  if (cachedEmail) {
    return { ok: true, email: cachedEmail, source: 'clerk-api-cache' };
  }

  if (!clerkSecretKey) {
    return {
      ok: false,
      reason: tokenEmail ? 'email-not-verified' : 'email-missing',
      message: tokenEmail
        ? 'Email not verified. Please verify your email address and try again.'
        : 'Email not available in session. Please verify your email and try again.',
    };
  }

  let res: Response;
  try {
    res = await fetchImpl(
      `${CLERK_API_BASE}/users/${encodeURIComponent(userId)}`,
      {
        headers: { Authorization: `Bearer ${clerkSecretKey}` },
      },
    );
  } catch (err) {
    logger.warn('[clerk-user] verified-email lookup failed', {
      event: 'clerk_user.lookup.network_error',
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, {
      userId,
      tags: { surface: 'clerk_lookup', reason: 'network_error' },
    });
    return {
      ok: false,
      reason: 'lookup-unavailable',
      message:
        'We could not verify your account right now. Please try again in a moment.',
    };
  }

  if (!res.ok) {
    // [C-4] A non-2xx from the Clerk API (bad key, user-not-found, rate-limit,
    // 5xx) gates email verification in the auth path. Mirror the network-error
    // branch above: escalate so auth-verification degradation is observable,
    // not a silently-returned `lookup-unavailable`.
    logger.warn('[clerk-user] verified-email lookup failed', {
      event: 'clerk_user.lookup.http_error',
      userId,
      status: res.status,
    });
    captureException(new Error(`Clerk lookup ${res.status}`), {
      userId,
      tags: { surface: 'clerk_lookup', reason: `http_${res.status}` },
    });
    return {
      ok: false,
      reason: 'lookup-unavailable',
      message:
        'We could not verify your account right now. Please try again in a moment.',
    };
  }

  // [L-2] A JSON parse failure on a 2xx response (malformed Clerk body) is
  // otherwise indistinguishable downstream from "user has no verified email".
  // Capture so the two cases can be told apart in triage.
  const payload = await res.json().catch((err: unknown) => {
    logger.warn('[clerk-user] verified-email lookup returned malformed JSON', {
      event: 'clerk_user.lookup.parse_error',
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err instanceof Error ? err : new Error(String(err)), {
      userId,
      tags: { surface: 'clerk_lookup', reason: 'parse_error' },
    });
    return null;
  });
  const verifiedEmail = extractVerifiedPrimaryEmail(payload);
  if (!verifiedEmail) {
    return {
      ok: false,
      reason: tokenEmail ? 'email-not-verified' : 'email-missing',
      message: tokenEmail
        ? 'Email not verified. Please verify your email address and try again.'
        : 'Email not available in session. Please verify your email and try again.',
    };
  }

  writeCachedVerifiedEmail(userId, verifiedEmail);
  return { ok: true, email: verifiedEmail, source: 'clerk-api' };
}

// ---------------------------------------------------------------------------
// [R1] Right-to-erasure: delete the Clerk-side login identity.
//
// Account deletion (executeDeletion) removes every in-app row via FK cascade,
// but the user's Clerk record (email, credentials, OAuth links) lives outside
// our database. Without this call the login identity survived account deletion
// — a GDPR Art 17 erasure gap. The scheduled-deletion Inngest function invokes
// this AFTER the DB delete is confirmed, so we only ever erase the credential
// of an account that was actually deleted (never a cancelled one).
// ---------------------------------------------------------------------------

export type DeleteClerkUserResult =
  | { deleted: true }
  | { deleted: false; reason: 'already-absent' };

/**
 * Deletes a Clerk user via the Backend API (`DELETE /v1/users/{id}`).
 *
 * - 2xx → `{ deleted: true }`.
 * - 404 → `{ deleted: false, reason: 'already-absent' }` — idempotent no-op so
 *   an Inngest retry after a partial success does not fail the function.
 * - Any other non-2xx, a network error, or a missing secret key → THROWS, so
 *   the calling Inngest step retries and ultimately surfaces in Sentry. We must
 *   never silently skip identity erasure (a "successful" account deletion that
 *   leaves the login alive is exactly the bug this closes).
 */
export async function deleteClerkUser({
  userId,
  clerkSecretKey,
  fetchImpl = fetch,
}: {
  userId: string;
  clerkSecretKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<DeleteClerkUserResult> {
  if (!clerkSecretKey) {
    const err = new Error(
      '[clerk-user] CLERK_SECRET_KEY unavailable — cannot erase Clerk identity',
    );
    captureException(err, {
      userId,
      tags: { surface: 'clerk_delete', reason: 'missing_secret' },
    });
    throw err;
  }

  let res: Response;
  try {
    res = await fetchImpl(
      `${CLERK_API_BASE}/users/${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${clerkSecretKey}` },
      },
    );
  } catch (err) {
    logger.warn('[clerk-user] delete failed (network)', {
      event: 'clerk_user.delete.network_error',
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, {
      userId,
      tags: { surface: 'clerk_delete', reason: 'network_error' },
    });
    throw err instanceof Error ? err : new Error(String(err));
  }

  if (res.status === 404) {
    // Already gone — treat as an idempotent success so a retry after a partial
    // run completes cleanly. The identity is erased, which is the goal.
    invalidateVerifiedClerkEmailCache(userId);
    logger.info('[clerk-user] delete: user already absent', {
      event: 'clerk_user.delete.already_absent',
      userId,
    });
    return { deleted: false, reason: 'already-absent' };
  }

  if (!res.ok) {
    const err = new Error(
      `[clerk-user] delete failed with status ${res.status}`,
    );
    captureException(err, {
      userId,
      tags: { surface: 'clerk_delete', reason: `http_${res.status}` },
    });
    throw err;
  }

  invalidateVerifiedClerkEmailCache(userId);
  logger.info('[clerk-user] identity erased', {
    event: 'clerk_user.delete.ok',
    userId,
  });
  return { deleted: true };
}
