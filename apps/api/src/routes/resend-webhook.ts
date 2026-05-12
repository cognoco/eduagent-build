// ---------------------------------------------------------------------------
// Resend Webhook Route — BUG-29
// NOT behind Clerk auth — verifies Resend/Svix webhook signature.
// Handles email.bounced, email.complained, email.delivered events.
// Resend uses Svix for webhook delivery and signing.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import { apiError } from '../errors';
import { inngest } from '../inngest/client';
import { createLogger } from '../services/logger';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Svix signature verification (Resend uses Svix for webhook signing)
// Implements https://docs.svix.com/receiving/verifying-payloads/how
//
// Svix signs webhooks using HMAC-SHA256 with base64url-encoded secret.
// The signed content is: `${msgId}.${timestamp}.${rawBody}`
// The signature header is: `v1,<base64-encoded-hmac-sha256>`
// ---------------------------------------------------------------------------

/**
 * Verifies a Resend/Svix webhook signature.
 *
 * @param rawBody - Raw request body string (must not be parsed before verification)
 * @param webhookId - Value of `svix-id` header
 * @param webhookTimestamp - Value of `svix-timestamp` header (Unix epoch seconds)
 * @param webhookSignature - Value of `svix-signature` header (comma-separated `v1,<sig>`)
 * @param secret - Webhook signing secret from Resend dashboard (whsec_... format)
 * @returns true if signature is valid
 */
export async function verifyResendSignature(
  rawBody: string,
  webhookId: string,
  webhookTimestamp: string,
  webhookSignature: string,
  secret: string,
): Promise<boolean> {
  // Decode the secret — Svix secrets are base64url-encoded after the "whsec_" prefix
  const secretBytes = decodeBase64Secret(secret);
  if (!secretBytes) return false;

  // Reject stale timestamps — Svix recommends 5-minute tolerance window
  const timestampSeconds = parseInt(webhookTimestamp, 10);
  if (isNaN(timestampSeconds)) return false;
  const ageMs = Date.now() - timestampSeconds * 1000;
  if (Math.abs(ageMs) > 5 * 60 * 1000) return false;

  // Build signed content: `${msgId}.${timestamp}.${rawBody}`
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;

  // Import the HMAC key
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  // Compute expected signature
  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signedContent),
  );
  const expectedSig = bufferToBase64(signatureBuffer);

  // svix-signature may contain multiple space-separated signatures (v1,<base64>)
  // Accept if any provided signature matches
  const signatures = webhookSignature.split(' ');
  for (const sigEntry of signatures) {
    const parts = sigEntry.split(',');
    if (parts.length < 2) continue;
    const version = parts[0];
    const providedSig = parts.slice(1).join(',');
    if (version !== 'v1') continue;
    if (timingSafeEqual(expectedSig, providedSig)) {
      return true;
    }
  }

  return false;
}

/**
 * Decodes a Svix webhook secret.
 * Svix secrets are either base64url or base64 after stripping the "whsec_" prefix.
 */
function decodeBase64Secret(secret: string): Uint8Array | null {
  try {
    const stripped = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    // Replace base64url chars with standard base64 chars, then decode
    const b64 = stripped.replace(/-/g, '+').replace(/_/g, '/');
    // Pad to multiple of 4 if needed
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Converts ArrayBuffer to base64 string.
 * Uses char-by-char concatenation because TextDecoder cannot safely decode
 * arbitrary binary buffers (HMAC digests). For 32-byte HMAC output the
 * performance overhead is negligible.
 */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

/**
 * [SEC-4] Constant-time base64 string comparison.
 *
 * `expectedSig` is our HMAC-SHA256 output (always 44 base64 chars / 32 bytes).
 * `providedSig` is attacker-controlled input from the webhook header, so its
 * length can differ. An early `if (a.length !== b.length) return false` leaks
 * the length of the expected signature via timing.
 *
 * Fix: decode both to byte arrays, then XOR over the LONGER of the two lengths.
 * The length difference is folded into `diff` so different-length inputs always
 * fail without short-circuiting.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const bytesA = base64ToBytes(a);
  const bytesB = base64ToBytes(b);
  const len = Math.max(bytesA.length, bytesB.length);
  // Fold length mismatch into diff so arrays of different lengths always fail.
  let diff = bytesA.length ^ bytesB.length;
  for (let i = 0; i < len; i++) {
    diff |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  }
  return diff === 0;
}

function base64ToBytes(b64: string): Uint8Array {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    // Invalid base64 (attacker-controlled input) — return empty array.
    // timingSafeEqual will treat it as a 0-byte array and the comparison will fail.
    return new Uint8Array(0);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mask an email address for logging: "user@example.com" → "u***@example.com" */
function maskEmail(email: string | undefined): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  return `${(local ?? '').charAt(0)}***@${domain}`;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/** email.bounced or email.complained — emit Inngest event for observability */
async function handleEmailBounced(
  eventType: 'email.bounced' | 'email.complained',
  data: ResendEmailEventData,
): Promise<void> {
  logger.warn('[resend] Email delivery failure', {
    event: eventType,
    type: eventType,
    to: maskEmail(data.to),
    emailId: data.email_id,
  });

  // Observability event — consumed by email-bounced-observe.ts (structured-log terminus).
  // [SEC-6 / BUG-722] Inngest event payloads are persisted in the Inngest
  // dashboard (third-party processor). Recipient email is bystander PII for
  // bounce/complaint observability — mask it before crossing the trust boundary.
  // emailId still uniquely identifies the message for support investigation.
  await inngest.send({
    name: 'app/email.bounced',
    data: {
      type: eventType,
      to: maskEmail(data.to),
      emailId: data.email_id ?? null,
      timestamp: new Date().toISOString(),
    },
  });
}

/** email.delivered — log for delivery confirmation audit trail */
function handleEmailDelivered(data: ResendEmailEventData): void {
  logger.info('[resend] Email delivered', {
    event: 'email.delivered',
    to: maskEmail(data.to),
    emailId: data.email_id,
  });
}

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

interface ResendEmailEventData {
  email_id?: string;
  from?: string;
  to?: string;
  subject?: string;
  [key: string]: unknown;
}

interface ResendWebhookPayload {
  type: string;
  data: ResendEmailEventData;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const resendWebhookRoute = new Hono<{
  Bindings: {
    RESEND_WEBHOOK_SECRET?: string;
  };
}>().post('/webhooks/resend', async (c) => {
  const webhookId = c.req.header('svix-id');
  const webhookTimestamp = c.req.header('svix-timestamp');
  const webhookSignature = c.req.header('svix-signature');

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    logger.warn('[resend] Missing Svix signature headers');
    return apiError(
      c,
      400,
      ERROR_CODES.MISSING_SIGNATURE,
      'Missing Svix signature headers',
    );
  }

  const webhookSecret = c.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error(
      '[resend] RESEND_WEBHOOK_SECRET not configured — rejecting unverified webhook',
    );
    return apiError(
      c,
      500,
      ERROR_CODES.INTERNAL_ERROR,
      'Webhook signature verification not configured',
    );
  }

  // Read raw body before parsing — signature verification requires raw bytes
  const rawBody = await c.req.text();

  const isValid = await verifyResendSignature(
    rawBody,
    webhookId,
    webhookTimestamp,
    webhookSignature,
    webhookSecret,
  );

  if (!isValid) {
    logger.warn('[resend] Invalid webhook signature');
    return apiError(
      c,
      401,
      ERROR_CODES.UNAUTHORIZED,
      'Invalid webhook signature',
    );
  }

  // Parse payload — rawBody already read, parse manually
  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ResendWebhookPayload;
  } catch {
    return apiError(
      c,
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid JSON payload',
    );
  }

  const { type, data } = payload;

  switch (type) {
    case 'email.bounced':
    case 'email.complained':
      await handleEmailBounced(type, data);
      break;
    case 'email.delivered':
      handleEmailDelivered(data);
      break;
    default:
      // Unknown event types: acknowledge and ignore (Resend may add new types)
      logger.info('[resend] Unhandled webhook event type — acknowledged', {
        type,
      });
      break;
  }

  return c.json({ received: true });
});
