// ---------------------------------------------------------------------------
// Resend Webhook Route — BUG-29
// NOT behind Clerk auth — verifies Resend/Svix webhook signature.
// Handles email.bounced, email.complained, email.delivered events.
// Resend uses Svix for webhook delivery and signing.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { z } from 'zod';
import { ERROR_CODES } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import { apiError } from '../errors';
import { claimWebhookId } from '../services/webhook-idempotency';
import { inngest } from '../inngest/client';
import { createLogger } from '../services/logger';
import { safeSend } from '../services/safe-non-core';
import { captureException } from '../services/sentry';
import { resendSignatureFailureEscalator } from '../services/webhooks/signature-failure-escalator';
import { suppressEmail } from '../services/email-suppression';
import {
  resendWebhookPayloadSchema,
  isHardBounce,
  type ResendEmailEventData,
} from '../services/notifications/resend-types';

const logger = createLogger();

// ---------------------------------------------------------------------------
// [BUG-319 / CCR PR #254] Atomic webhook idempotency source key.
//
// The svix-id is unique per delivered message; the source tag namespaces it
// so different webhook providers cannot collide on overlapping ID schemes.
// ---------------------------------------------------------------------------
const RESEND_WEBHOOK_SOURCE = 'resend';

// ---------------------------------------------------------------------------
// [CCR-PR120-M7] Svix-id replay deduplication
//
// Signature + timestamp checks reject forgeries and events older than 5
// minutes, but they do NOT stop replay of a captured valid request within
// that window. Each replay would re-fire side-effects (Inngest events for
// bounce/complaint, log entries, downstream email-bounced-observe runs).
//
// Fix: persist each accepted svix-id in IDEMPOTENCY_KV with a TTL that
// matches the timestamp tolerance window. On a duplicate svix-id, reject
// with 409 instead of re-processing.
// ---------------------------------------------------------------------------

const SVIX_DEDUP_PREFIX = 'svix-dedup:resend:';
// Match the signature timestamp tolerance window (5 minutes). Once a request
// is older than this it would fail timestamp verification anyway.
const SVIX_DEDUP_TTL_SECONDS = 5 * 60;

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

/** email.bounced or email.complained — persist suppression + emit Inngest event */
async function handleEmailBounced(
  eventType: 'email.bounced' | 'email.complained',
  data: ResendEmailEventData,
  db: Database | undefined,
): Promise<void> {
  logger.warn('[resend] Email delivery failure', {
    event: eventType,
    type: eventType,
    to: maskEmail(data.to),
    emailId: data.email_id,
  });

  // Persist a suppression record for PERMANENTLY-dead addresses so the send
  // path stops re-mailing them (burning quota + sender reputation). A HARD
  // bounce (`bounce.type === 'Permanent'`) or a spam complaint is permanent; a
  // SOFT/transient bounce (`Transient` / `Undetermined`) is NOT — the mailbox
  // may accept mail again later, so we deliberately do not suppress it.
  //
  // The RAW recipient address is used here (before the Inngest masking below):
  // suppression is matched against the real send-to address. db may be absent
  // in dev (no DB middleware); a missing binding in a deployed env is already
  // surfaced upstream via the dedup_db_missing observability signal.
  const shouldSuppress = eventType === 'email.complained' || isHardBounce(data);
  if (shouldSuppress && data.to && db) {
    const reason =
      eventType === 'email.complained' ? 'complaint' : 'hard_bounce';
    // suppressEmail escalates its own DB failures to Sentry + structured log
    // (silent recovery is banned). It never throws, so a persistence failure
    // does not turn a verified webhook into a 500 / Svix retry storm.
    await suppressEmail(db, data.to, reason, data.email_id ?? null);
  }

  // Observability event — consumed by email-bounced-observe.ts (structured-log terminus).
  // [SEC-6 / BUG-722] Inngest event payloads are persisted in the Inngest
  // dashboard (third-party processor). Recipient email is bystander PII for
  // bounce/complaint observability — mask it before crossing the trust boundary.
  // emailId still uniquely identifies the message for support investigation.
  await safeSend(
    () =>
      inngest.send({
        name: 'app/email.bounced',
        data: {
          type: eventType,
          to: maskEmail(data.to),
          emailId: data.email_id ?? null,
          timestamp: new Date().toISOString(),
        },
      }),
    'resend-webhook.email-bounced',
    { emailId: data.email_id },
  );
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
// Route
// ---------------------------------------------------------------------------

export const resendWebhookRoute = new Hono<{
  Bindings: {
    RESEND_WEBHOOK_SECRET?: string;
    IDEMPOTENCY_KV?: KVNamespace;
    ENVIRONMENT?: string;
  };
  Variables: {
    db?: Database;
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
    // Include webhook headers for diagnosability — no PII, no secret.
    // Timestamps let ops distinguish clock-skew failures from forged payloads.
    logger.warn('[resend] Invalid webhook signature', {
      event: 'resend.webhook.signature_verification_failed',
      webhookId,
      webhookTimestamp,
    });
    // Rate-limited escalation: a single failure stays log-only; sustained
    // failures within the window fire exactly one deduplicated Sentry event.
    // Per-isolate best-effort — see signature-failure-escalator.ts header.
    resendSignatureFailureEscalator.record();
    return apiError(
      c,
      401,
      ERROR_CODES.UNAUTHORIZED,
      'Invalid webhook signature',
    );
  }

  // [BUG-319 / CCR PR #254] Atomic dedup via DB unique constraint.
  //
  // The DB is the authoritative gate — `INSERT ... ON CONFLICT DO NOTHING
  // RETURNING` is evaluated atomically by Postgres, so two concurrent
  // identical webhooks cannot both claim the same (source, webhook_id) pair.
  // The previous KV-only check-then-write left a race window between the
  // .get() and the .put() that two parallel deliveries could slip through.
  //
  // The KV fast-path is kept as an opportunistic short-circuit (read is
  // cheap, propagation isn't atomic) — if the row exists in KV we can reject
  // without touching the DB. But the DB INSERT is the ONLY source of truth
  // for "was this webhook already processed?".
  const db = c.get('db');
  const dedupKv = c.env.IDEMPOTENCY_KV;
  const dedupKey = `${SVIX_DEDUP_PREFIX}${webhookId}`;

  if (db) {
    const claim = await claimWebhookId(db, RESEND_WEBHOOK_SOURCE, webhookId);
    if (claim === 'replay') {
      logger.warn('[resend] Replay detected — duplicate svix-id rejected', {
        event: 'resend.replay_rejected',
        webhookId,
        source: 'db',
      });
      return apiError(
        c,
        409,
        ERROR_CODES.CONFLICT,
        'Webhook already processed (svix-id replay)',
      );
    }
    if (claim === 'unavailable') {
      // DB unavailable: silent recovery is banned, escalate. We continue to
      // KV-based protection (weaker) rather than 500-ing — webhook stays
      // functional under DB outage.
      logger.warn(
        '[resend] DB dedup unavailable; falling back to KV (weaker guarantee)',
        {
          event: 'resend.dedup_db_unavailable',
          webhookId,
        },
      );
      await safeSend(
        () =>
          inngest.send({
            // orphan-allow: structured telemetry required by AGENTS.md (silent
            // recovery must emit a structured signal). The DB-dedup outage
            // recovers in-line (falls back to KV) + escalates via logger.warn.
            // The event is a dashboard-queryable signal for how often the weaker
            // KV path is used — no remediation handler is needed.
            name: 'app/resend-webhook.dedup_db_unavailable',
            data: { webhookId, timestamp: new Date().toISOString() },
          }),
        'resend-webhook.dedup-db-unavailable',
      );
    }
  } else if (
    c.env.ENVIRONMENT === 'production' ||
    c.env.ENVIRONMENT === 'staging'
  ) {
    // No DB middleware in a deployed environment means the atomic gate is
    // off — surface the regression instead of silently weakening.
    logger.warn('[resend] db not bound in middleware — atomic dedup disabled', {
      event: 'resend.dedup_db_missing',
      environment: c.env.ENVIRONMENT,
    });
    await safeSend(
      () =>
        inngest.send({
          // orphan-allow: structured telemetry required by AGENTS.md (silent
          // recovery must emit a structured signal). Missing DB binding in a
          // deployed env means the atomic dedup gate is off — escalated via
          // logger.warn. The event is a dashboard-queryable misconfiguration
          // alarm; remediation is a deploy/config fix, not an Inngest handler.
          name: 'app/resend-webhook.dedup_db_missing',
          data: {
            environment: c.env.ENVIRONMENT,
            timestamp: new Date().toISOString(),
          },
        }),
      'resend-webhook.dedup-db-missing',
    );
  }

  if (dedupKv) {
    let alreadySeen = false;
    try {
      alreadySeen = (await dedupKv.get(dedupKey)) !== null;
    } catch (err) {
      // KV read failure must not silently weaken replay protection.
      // (AGENTS.md: "Silent recovery without escalation is banned.")
      logger.warn('[resend] svix-id dedup read failed; allowing request', {
        event: 'resend.dedup_lookup_failed',
        webhookId,
        error: err instanceof Error ? err.message : String(err),
      });
      captureException(err, {
        extra: { context: 'resend-webhook.dedup.get', webhookId },
      });
      await safeSend(
        () =>
          inngest.send({
            // orphan-allow: structured telemetry required by AGENTS.md (silent
            // recovery must emit a structured signal). KV read failure recovers
            // in-line (allows the request) + escalates via logger.warn +
            // captureException(Sentry). The event is a dashboard-queryable
            // failure-rate signal — no remediation handler is needed.
            name: 'app/resend-webhook.dedup_lookup_failed',
            data: {
              webhookId,
              timestamp: new Date().toISOString(),
            },
          }),
        'resend-webhook.dedup-lookup-failed',
      );
    }
    if (alreadySeen) {
      logger.warn('[resend] Replay detected — duplicate svix-id rejected', {
        event: 'resend.replay_rejected',
        webhookId,
      });
      return apiError(
        c,
        409,
        ERROR_CODES.CONFLICT,
        'Webhook already processed (svix-id replay)',
      );
    }

    // [BUG-118] Record the dedup key BEFORE processing, not after. The prior
    // implementation wrote it fire-and-forget at the end of the handler; a
    // parallel duplicate that arrived between the .get() and the post-
    // processing .put() would also see no key and re-process. Writing first
    // shrinks the race window to the put-acknowledgement latency. If the put
    // fails we still escalate (silent recovery is banned) and continue — the
    // downstream handler is idempotent for our event types (Inngest event
    // emission with a stable timestamp, structured log), so a missed dedup
    // record is recoverable; a SILENT duplicate write is the regression we
    // are guarding against.
    try {
      await dedupKv.put(dedupKey, '1', {
        expirationTtl: SVIX_DEDUP_TTL_SECONDS,
      });
    } catch (err) {
      logger.warn(
        '[resend] svix-id dedup pre-write failed; continuing with weakened replay protection',
        {
          event: 'resend.dedup_prewrite_failed',
          webhookId,
          error: err instanceof Error ? err.message : String(err),
        },
      );
      captureException(err, {
        extra: { context: 'resend-webhook.dedup.prewrite', webhookId },
      });
      await safeSend(
        () =>
          inngest.send({
            // orphan-allow: structured telemetry required by AGENTS.md (silent
            // recovery must emit a structured signal). Dedup pre-write failure
            // recovers in-line (continues with weakened protection) + escalates
            // via logger.warn + captureException(Sentry). The event is a
            // dashboard-queryable failure-rate signal — no handler is needed.
            name: 'app/resend-webhook.dedup_prewrite_failed',
            data: {
              webhookId,
              timestamp: new Date().toISOString(),
            },
          }),
        'resend-webhook.dedup-prewrite-failed',
      );
    }
  } else if (
    c.env.ENVIRONMENT === 'production' ||
    c.env.ENVIRONMENT === 'staging'
  ) {
    // Binding missing in deployed environments must surface — production
    // without dedup means the protection is silently off.
    logger.warn(
      '[resend] IDEMPOTENCY_KV not bound — svix-id replay protection disabled',
      {
        event: 'resend.dedup_kv_missing',
        environment: c.env.ENVIRONMENT,
      },
    );
    await safeSend(
      () =>
        inngest.send({
          // orphan-allow: structured telemetry required by AGENTS.md (silent
          // recovery must emit a structured signal). Missing IDEMPOTENCY_KV
          // binding in a deployed env disables svix-id replay protection —
          // escalated via logger.warn. The event is a dashboard-queryable
          // misconfiguration alarm; remediation is a deploy/config fix.
          name: 'app/resend-webhook.dedup_kv_missing',
          data: {
            environment: c.env.ENVIRONMENT,
            timestamp: new Date().toISOString(),
          },
        }),
      'resend-webhook.dedup-kv-missing',
    );
  }

  // Parse payload — rawBody already read, parse manually
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody);
  } catch {
    return apiError(
      c,
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid JSON payload',
    );
  }

  // Validate the shape the handlers depend on. The Svix signature is already
  // verified above, so a malformed body is a provider-side bug, not an attack
  // or a transient outage. Ack with 200 (no Svix retry) + capture to Sentry
  // for ops review rather than throwing inside handleEmailBounced and 500ing.
  const parsed = resendWebhookPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    logger.warn('[resend] Malformed webhook payload — acknowledged', {
      event: 'resend.malformed_payload',
      issues: parsed.error.issues.map((i: z.core.$ZodIssue) =>
        i.path.join('.'),
      ),
    });
    captureException(new Error('Resend webhook payload failed validation'), {
      extra: {
        category: 'resend.malformed_payload',
        issues: parsed.error.flatten(),
      },
    });
    return c.json({ received: true, skipped: 'malformed_payload' }, 200);
  }

  const { type, data } = parsed.data;

  switch (type) {
    case 'email.bounced':
    case 'email.complained':
      await handleEmailBounced(type, data, db);
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

  // [BUG-118] The dedup key was written BEFORE processing (above) — no
  // post-processing put is needed. The previous fire-and-forget post-write
  // left a race window in which a parallel duplicate that arrived between
  // the .get() and the post-processing .put() would also see no key and
  // re-process.

  return c.json({ received: true });
});

// Internal exports for tests.
export const __internal = {
  SVIX_DEDUP_PREFIX,
  SVIX_DEDUP_TTL_SECONDS,
  RESEND_WEBHOOK_SOURCE,
};
