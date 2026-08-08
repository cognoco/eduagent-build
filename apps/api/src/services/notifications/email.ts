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
    | 'consent_approved'
    | 'consent_reminder'
    | 'consent_warning'
    | 'consent_expired'
    | 'consent_archived'
    | 'subscribe_request'
    | 'feedback'
    | 'weekly_progress'
    | 'monthly_progress'
    | 'security_notification'
    | 'account_reclaim'
    | 'payment_failed'
    | 'family_join_store_cancel'
    | 'family_join_invite'
    | 'blocked_safety_digest';
}

export interface EmailOptions {
  /**
   * Runtime environment for the delivery boundary. Any value other than the
   * exact production environment fails closed unless the recipient appears in
   * the explicit non-production allowlist below.
   */
  environment: string | undefined;
  nonProductionRecipientAllowlist?: readonly string[];
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

export type EmailResult =
  | { sent: true; messageId?: string }
  | {
      sent: false;
      retryability: 'none';
      reason: 'no_api_key' | 'suppressed' | 'non_production_recipient';
    }
  | {
      sent: false;
      retryability: 'permanent' | 'transient';
      reason: 'resend_api_error';
      statusCode: number;
      providerCode: string;
    }
  | {
      sent: false;
      retryability: 'transient';
      reason: 'network_error';
    };

export type EmailTransport = (
  payload: EmailPayload,
  options?: EmailOptions,
) => Promise<EmailResult>;

let emailTransportForTesting: EmailTransport | undefined;

/**
 * Installs a process-local email boundary for test-only Worker entrypoints.
 * Production boot never calls this function, so its send path remains Resend.
 */
export function registerEmailTransportForTesting(
  transport: EmailTransport,
): () => void {
  const previous = emailTransportForTesting;
  emailTransportForTesting = transport;
  return () => {
    if (emailTransportForTesting === transport) {
      emailTransportForTesting = previous;
    }
  };
}

const RESEND_API_URL = 'https://api.resend.com/emails';
const RESEND_PROVIDER_CODE_PATTERN = /^[a-z0-9_]{1,64}$/;

function parseResendProviderCode(body: unknown): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'name' in body &&
    typeof body.name === 'string' &&
    RESEND_PROVIDER_CODE_PATTERN.test(body.name)
  ) {
    return body.name;
  }
  return 'unknown';
}

function isTransientResendFailure(
  statusCode: number,
  providerCode: string,
): boolean {
  return (
    statusCode === 408 ||
    statusCode === 429 ||
    statusCode >= 500 ||
    (statusCode === 409 && providerCode === 'concurrent_idempotent_requests')
  );
}

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
  if (emailTransportForTesting) {
    return emailTransportForTesting(payload, options);
  }

  const apiKey = options?.resendApiKey;
  if (!apiKey) {
    logger.warn('[email] RESEND_API_KEY not configured — skipping email send');
    return { sent: false, retryability: 'none', reason: 'no_api_key' };
  }

  const normalizedRecipient = payload.to.trim().toLowerCase();
  const recipientAllowed =
    options.environment === 'production' ||
    options.nonProductionRecipientAllowlist?.some(
      (recipient) => recipient.trim().toLowerCase() === normalizedRecipient,
    ) === true;

  if (!recipientAllowed) {
    logger.warn(
      '[email] non-production recipient not allowlisted — skipping send',
      {
        event: 'notification.email.non_production_recipient',
        type: payload.type,
        environment: options.environment,
      },
    );
    return {
      sent: false,
      retryability: 'none',
      reason: 'non_production_recipient',
    };
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
    return { sent: false, retryability: 'none', reason: 'suppressed' };
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
      const responseBody: unknown = await response.json().catch(() => null);
      const providerCode = parseResendProviderCode(responseBody);
      const retryability = isTransientResendFailure(
        response.status,
        providerCode,
      )
        ? 'transient'
        : 'permanent';

      // Provider response messages can echo recipient addresses. Record only
      // the stable provider code and HTTP status at this boundary.
      logger.error('[email] Resend API error', {
        event: 'notification.email.resend_api_error',
        type: payload.type,
        status: response.status,
        providerCode,
        retryability,
      });
      if (retryability === 'permanent') {
        captureException(new Error('Resend API request permanently rejected'), {
          tags: {
            surface: 'email',
            reason: 'resend_api_error',
            providerCode,
          },
          extra: {
            type: payload.type,
            statusCode: response.status,
            providerCode,
          },
        });
      }
      return {
        sent: false,
        retryability,
        reason: 'resend_api_error',
        statusCode: response.status,
        providerCode,
      };
    }

    const result = (await response.json()) as { id?: string };
    return { sent: true, messageId: result.id };
  } catch (err) {
    logger.error('[email] Network error sending email', {
      event: 'notification.email.network_error',
      type: payload.type,
      errorName: err instanceof Error ? err.name : 'UnknownError',
    });
    return {
      sent: false,
      retryability: 'transient',
      reason: 'network_error',
    };
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
 * Formats the post-approval confirmation email for an email-consenting parent.
 *
 * This is the **durable home** of the withdrawal link: the email a parent will
 * actually return to later when they decide to withdraw. The original consent
 * *request* email is archived/deleted once actioned, so it is not a reliable
 * home — hence a dedicated confirmation email (P0 spec Rev 2, GDPR Art. 7(3):
 * withdrawal must be as easy as giving).
 *
 * @param withdrawalUrl - The signed, non-expiring withdrawal link
 *   (`/v1/consent-page/withdraw?token=…`). Built from a withdrawal token; this
 *   formatter never sees the secret.
 */
export function formatConsentApprovedEmail(
  parentEmail: string,
  childName: string,
  withdrawalUrl: string,
): EmailPayload {
  return {
    to: parentEmail,
    subject: `You approved ${childName}'s MentoMate account`,
    body: `Thank you — you approved ${childName}'s MentoMate account, and they can now start learning.\n\nYou can manage or withdraw your consent at any time using the link below. Please keep this email so you can find it later:\n\n${withdrawalUrl}`,
    type: 'consent_approved',
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

export function formatAccountReclaimAttemptEmail(
  to: string,
  supportEmail: string,
): EmailPayload {
  return {
    to,
    subject: 'MentoMate account recovery',
    body:
      'Someone tried to sign in to MentoMate using this email address from a ' +
      'different login identity. We blocked the sign-in to protect your account.\n\n' +
      `If this was you and you need help recovering access, contact ${supportEmail}. ` +
      'Support will verify ownership before making any account changes.',
    type: 'account_reclaim',
  };
}

export function formatPaymentFailedEmail(
  to: string,
  manageBillingUrl: string,
): EmailPayload {
  return {
    to,
    subject: 'Action needed: update your MentoMate payment',
    body:
      'We could not process your latest MentoMate payment. Open MentoMate to review your payment method and restore your plan:\n\n' +
      manageBillingUrl,
    type: 'payment_failed',
  };
}

// TODO(WI-1753 operator gate: AC-6 disclosure copy) — placeholder subject/body.
// The final disclosure wording (double-charge warning + self-cancel steps) is a
// pre-close operator gate and must be reviewed before this ships to a real teen.
export function formatFamilyJoinStoreCancelEmail(to: string): EmailPayload {
  return {
    to,
    subject: 'Cancel your MentoMate subscription to avoid a double charge',
    body:
      "You've joined a family plan, so MentoMate is now paid for you. You still " +
      'have your own separate subscription that will keep charging until you ' +
      'cancel it in the App Store or Google Play. Open your store subscription ' +
      'settings to cancel it — your learning history and family access are ' +
      'unaffected.',
    type: 'family_join_store_cancel',
  };
}

// ANTI-ENUM (AC-1): this email
// is sent to the typed address REGARDLESS of whether it matches an account, so
// the copy must not confirm or deny that a MentoMate account exists — it invites
// the reader to open the app and accept IF they have one.
//
// NO ACTION LINK (operator ruling 2026-07-12). This email deliberately carries
// NO url. It used to emit a route nothing served. The authenticated app journey
// now accepts the opaque invite token as a manual code, so the exact token is
// delivered without pretending universal/app-link configuration exists.
// GUARDED BY family-join-invite-email.guard.test.ts: every url this email emits
// must resolve to a route the API actually serves — re-adding an unserved link
// fails that test.
export function formatFamilyJoinInviteEmail(
  to: string,
  manualCode: string,
): EmailPayload {
  return {
    to,
    subject: "You've been invited to a MentoMate family",
    body:
      'Someone has invited you to join their MentoMate family plan. If you ' +
      'already use MentoMate, open MentoMate, sign in to the invited account, ' +
      `choose Join a family, and enter this one-time family code:\n\n${manualCode}\n\n` +
      'You will review the family move, support, and visibility choices ' +
      'separately before anything changes. Your learning history stays with you.',
    type: 'family_join_invite',
  };
}
