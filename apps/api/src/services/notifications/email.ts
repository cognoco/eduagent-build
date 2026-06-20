// ---------------------------------------------------------------------------
// Email notification primitives — pure send + formatters, no DB dependencies
//
// Extracted from notifications.ts (WI-572: break the 4-node SCC). Keeping
// email send/format here means consent.ts can import email primitives without
// pulling in the notifications→settings edge, severing the
// consent⇄notifications cycle (F-029 structural half).
//
// Consumers:
//   - consent.ts   → imports sendEmail, formatConsentRequestEmail, EmailOptions
//   - notifications.ts → imports everything here (re-exports or direct use)
// ---------------------------------------------------------------------------

import type { ConsentType, SecurityNotificationType } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import { createLogger } from '../logger';
import { captureException } from '../sentry';
import { isEmailSuppressed } from '../email-suppression';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Email types
// ---------------------------------------------------------------------------

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  type:
    | 'consent_request'
    | 'consent_reminder'
    | 'consent_warning'
    | 'consent_expired'
    | 'consent_archived'
    | 'subscribe_request'
    | 'feedback'
    | 'weekly_progress'
    | 'monthly_progress'
    | 'security_notification';
}

export interface EmailOptions {
  resendApiKey?: string;
  emailFrom?: string;
  /**
   * [BUG-699] Optional idempotency key forwarded as the `Idempotency-Key`
   * header to the Resend API. Used by Inngest-driven email steps so that
   * transient failures + step retries do not result in the same email being
   * delivered to the user multiple times. Resend dedupes within a 24h window.
   */
  idempotencyKey?: string;
  /**
   * Optional DB handle. When provided, `sendEmail` first checks the
   * `email_suppressions` table and SKIPS the send if the recipient is a
   * permanently-dead address (prior hard bounce / spam complaint) — so we stop
   * re-sending to dead addresses, burning quota and sender reputation. When
   * absent (no DB in scope), the check is skipped and the send proceeds as
   * before (backward-compatible).
   */
  db?: Database;
}

export interface EmailResult {
  sent: boolean;
  messageId?: string;
  reason?: string;
}

const RESEND_API_URL = 'https://api.resend.com/emails';

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

/**
 * Sends an email notification via the Resend API.
 *
 * Uses pure fetch() — no SDK needed on Cloudflare Workers.
 * Degrades gracefully when RESEND_API_KEY is not configured.
 */
export async function sendEmail(
  payload: EmailPayload,
  options?: EmailOptions,
): Promise<EmailResult> {
  const apiKey = options?.resendApiKey;
  if (!apiKey) {
    logger.warn('[email] RESEND_API_KEY not configured — skipping email send');
    return { sent: false, reason: 'no_api_key' };
  }

  // Skip permanently-dead addresses (prior hard bounce / spam complaint). This
  // is the send-path half of the bounce-suppression fix: the Resend webhook
  // persists the address, and this guard stops the re-send. isEmailSuppressed
  // fails OPEN (returns false) on a DB error and escalates internally, so a
  // transient DB outage never silently drops a legitimate email.
  if (options?.db && (await isEmailSuppressed(options.db, payload.to))) {
    logger.warn('[email] recipient suppressed — skipping send', {
      event: 'notification.email.suppressed',
      type: payload.type,
    });
    return { sent: false, reason: 'suppressed' };
  }

  const from = options?.emailFrom ?? 'noreply@mentomate.com';

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    // [BUG-699] Forward idempotency key when provided. Inngest step retries
    // can otherwise replay sendEmail calls and double-send to the user.
    if (options?.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        text: payload.body,
      }),
    });

    if (!response.ok) {
      // Log only status code — error body may contain PII (echoed email addresses)
      // [logging sweep] structured logger so PII fields land as JSON context
      // [C-2] Escalate via Sentry too — `logger.error` alone is not queryable
      // for the "how often did this fire in 24h" question, the same reason the
      // network-error path below captures. Status only, no PII in tags.
      logger.error('[email] Resend API error', {
        event: 'notification.email.resend_api_error',
        type: payload.type,
        status: response.status,
      });
      captureException(new Error(`Resend API ${response.status}`), {
        tags: { surface: 'email', reason: `http_${response.status}` },
        extra: { type: payload.type },
      });
      return { sent: false, reason: `resend_api_error_${response.status}` };
    }

    const result = (await response.json()) as { id?: string };
    return { sent: true, messageId: result.id };
  } catch (err) {
    // [logging sweep] structured logger so PII fields land as JSON context.
    // Escalate via Sentry too — `logger.error` alone is not queryable for
    // the "how often did this fire in 24h" question.
    logger.error('[email] Network error sending email', {
      event: 'notification.email.network_error',
      type: payload.type,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, {
      tags: { surface: 'email', reason: 'network_error' },
    });
    return { sent: false, reason: 'network_error' };
  }
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Formats a consent request email to send to a parent.
 */
export function formatConsentRequestEmail(
  parentEmail: string,
  childName: string,
  consentType: ConsentType,
  tokenUrl: string,
): EmailPayload {
  return {
    to: parentEmail,
    subject: `Parental consent required for ${childName}'s MentoMate account`,
    body: `Your child ${childName} wants to use MentoMate. Under applicable data protection regulations, we need your consent before processing their personal data. Please click the link to approve or deny: ${tokenUrl}`,
    type: 'consent_request',
  };
}

/**
 * Formats a consent reminder email for a parent who hasn't responded yet.
 *
 * @param tokenUrl - Direct consent page URL so the parent can act immediately.
 *   Must be provided — every reminder must include an actionable link [UX-DE-H9].
 */
export function formatConsentReminderEmail(
  parentEmail: string,
  childName: string,
  daysRemaining: number,
  tokenUrl: string,
): EmailPayload {
  return {
    to: parentEmail,
    subject: `Reminder: Consent pending for ${childName}'s MentoMate account`,
    body: `We're still waiting for your consent for ${childName}'s MentoMate account. You have ${daysRemaining} days remaining to respond before the account is automatically removed.\n\nClick here to approve or deny: ${tokenUrl}`,
    type: 'consent_reminder',
  };
}

// ---------------------------------------------------------------------------
// Account Security Notification — [CRITICAL-2a]
// ---------------------------------------------------------------------------

// The credential-change event union (`SecurityNotificationType`) lives in
// `@eduagent/schemas` (multi-file shared contract). `email_changed` mails the
// OLD address (alerting whoever may be losing access); password events mail
// the current account address.

/**
 * Formats a security-notification email. The body always tells the recipient
 * what changed and what to do if it wasn't them — the recovery path is the
 * point of the notification (a silent credential change is the takeover risk
 * this guards against).
 */
export function formatSecurityNotificationEmail(
  to: string,
  type: SecurityNotificationType,
): EmailPayload {
  const supportLine =
    "If you didn't make this change, your account may be compromised. " +
    'Contact support@mentomate.com right away.';

  let subject: string;
  let lead: string;
  switch (type) {
    case 'email_changed':
      subject = 'Your MentoMate login email was changed';
      lead =
        'The login email for your MentoMate account was just changed. This ' +
        'address is still kept as a verified recovery email.';
      break;
    case 'password_added':
      subject = 'A password was added to your MentoMate account';
      lead =
        'A password was just added to your MentoMate account, which until now ' +
        'used only social sign-in.';
      break;
    case 'password_changed':
      subject = 'Your MentoMate password was changed';
      lead = 'The password for your MentoMate account was just changed.';
      break;
  }

  return {
    to,
    subject,
    body: `${lead}\n\n${supportLine}`,
    type: 'security_notification',
  };
}
