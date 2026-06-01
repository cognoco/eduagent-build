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
    return {
      ok: false,
      reason: 'lookup-unavailable',
      message:
        'We could not verify your account right now. Please try again in a moment.',
    };
  }

  const payload = await res.json().catch(() => null);
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
