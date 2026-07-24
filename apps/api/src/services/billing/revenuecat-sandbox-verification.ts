import { z } from 'zod';
import {
  extractTierFromProductId,
  type RevenueCatEvent,
} from './revenuecat-shared';

export const MAX_REVENUECAT_SANDBOX_VERIFICATION_WINDOW_MS = 15 * 60 * 1000;

const boundedString = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value === value.trim());

const revenuecatSandboxVerificationAuthorizationSchema = z
  .object({
    version: z.literal(1),
    authorizationId: boundedString,
    issuedAtMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    expiresAtMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    eventId: boundedString,
    eventType: z.enum(['INITIAL_PURCHASE', 'EXPIRATION']),
    appId: boundedString,
    appUserId: boundedString,
    productId: boundedString.refine(
      (productId) =>
        productId.includes('.android:') &&
        extractTierFromProductId(productId) !== null,
    ),
    periodType: z.literal('NORMAL'),
    store: z.literal('PLAY_STORE'),
    transactionId: boundedString,
  })
  .strict();

export type RevenuecatSandboxVerificationDenialReason =
  | 'missing_authorization'
  | 'malformed_authorization'
  | 'invalid_authorization_window'
  | 'authorization_not_yet_valid'
  | 'authorization_expired'
  | 'unsupported_event'
  | 'authorization_mismatch';

export type RevenuecatSandboxVerificationResult =
  | { authorized: true; authorizationId: string }
  | {
      authorized: false;
      reason: RevenuecatSandboxVerificationDenialReason;
    };

export function authorizeRevenuecatSandboxVerification(
  rawAuthorization: string | undefined,
  event: RevenueCatEvent,
  nowMs: number = Date.now(),
): RevenuecatSandboxVerificationResult {
  if (!rawAuthorization) {
    return { authorized: false, reason: 'missing_authorization' };
  }

  let rawValue: unknown;
  try {
    rawValue = JSON.parse(rawAuthorization);
  } catch {
    return { authorized: false, reason: 'malformed_authorization' };
  }

  const parsed =
    revenuecatSandboxVerificationAuthorizationSchema.safeParse(rawValue);
  if (!parsed.success) {
    return { authorized: false, reason: 'malformed_authorization' };
  }

  const authorization = parsed.data;
  const windowMs = authorization.expiresAtMs - authorization.issuedAtMs;
  if (
    windowMs <= 0 ||
    windowMs > MAX_REVENUECAT_SANDBOX_VERIFICATION_WINDOW_MS
  ) {
    return { authorized: false, reason: 'invalid_authorization_window' };
  }

  if (nowMs < authorization.issuedAtMs) {
    return { authorized: false, reason: 'authorization_not_yet_valid' };
  }
  if (nowMs >= authorization.expiresAtMs) {
    return { authorized: false, reason: 'authorization_expired' };
  }

  if (
    (event.type !== 'INITIAL_PURCHASE' && event.type !== 'EXPIRATION') ||
    event.environment !== 'SANDBOX'
  ) {
    return { authorized: false, reason: 'unsupported_event' };
  }

  if (
    event.id !== authorization.eventId ||
    event.type !== authorization.eventType ||
    event.app_id !== authorization.appId ||
    event.app_user_id !== authorization.appUserId ||
    event.product_id !== authorization.productId ||
    event.period_type !== authorization.periodType ||
    event.store !== authorization.store ||
    event.transaction_id !== authorization.transactionId
  ) {
    return { authorized: false, reason: 'authorization_mismatch' };
  }

  return {
    authorized: true,
    authorizationId: authorization.authorizationId,
  };
}
