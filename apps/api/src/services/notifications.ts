// ---------------------------------------------------------------------------
// Push Notification Service Stub — Story 4.8
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import type { ConsentType } from '@eduagent/schemas';

export interface NotificationPayload {
  profileId: string;
  title: string;
  body: string;
  type:
    | 'review_reminder'
    | 'daily_reminder'
    | 'trial_expiry'
    | 'streak_warning'
    | 'consent_request'
    | 'consent_reminder'
    | 'consent_warning'
    | 'consent_expired';
}

export interface NotificationResult {
  sent: boolean;
  ticketId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum push notifications per day per profile */
export const MAX_DAILY_PUSH = 3;

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Sends a push notification.
 *
 * TODO: Integrate Expo Push SDK
 * Currently returns a mock result.
 */
export async function sendPushNotification(
  payload: NotificationPayload
): Promise<NotificationResult> {
  void payload;
  // TODO: Integrate Expo Push SDK
  return { sent: true, ticketId: 'mock-ticket' };
}

/**
 * Formats the body for a review reminder notification.
 *
 * Coaching voice: empathetic, encouraging, time-conscious.
 */
export function formatReviewReminderBody(
  fadingTopicCount: number,
  subjects: string[]
): string {
  const subjectList = subjects.join(' and ');
  return `Your ${subjectList} topics are fading \u2014 ${
    fadingTopicCount === 1 ? '4 minutes' : `${fadingTopicCount * 2} minutes`
  } would help`;
}

/**
 * Formats the body for a daily reminder notification.
 */
export function formatDailyReminderBody(streakDays: number): string {
  if (streakDays === 0) {
    return 'Start a new streak today! A quick review goes a long way.';
  }
  return `Keep your ${streakDays}-day streak going! Quick review?`;
}

// ---------------------------------------------------------------------------
// Email Notification Types — Story 0.5 (Parental Consent)
// ---------------------------------------------------------------------------

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  type:
    | 'consent_request'
    | 'consent_reminder'
    | 'consent_warning'
    | 'consent_expired';
}

export interface EmailResult {
  sent: boolean;
  messageId?: string;
}

/**
 * Sends an email notification.
 *
 * TODO: Integrate email provider (Resend/SendGrid)
 * Currently returns a mock result.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  void payload;
  // TODO: Integrate email provider (Resend/SendGrid)
  return { sent: true, messageId: 'mock-email-id' };
}

/**
 * Formats a consent request email to send to a parent.
 */
export function formatConsentRequestEmail(
  parentEmail: string,
  childName: string,
  consentType: ConsentType,
  tokenUrl: string
): EmailPayload {
  const regulation = consentType === 'GDPR' ? 'GDPR (EU)' : 'COPPA (US)';
  return {
    to: parentEmail,
    subject: `Parental consent required for ${childName}'s EduAgent account`,
    body: `Your child ${childName} wants to use EduAgent. Under ${regulation}, we need your consent. Please click the link to approve or deny: ${tokenUrl}`,
    type: 'consent_request',
  };
}

/**
 * Formats a consent reminder email for a parent who hasn't responded yet.
 */
export function formatConsentReminderEmail(
  parentEmail: string,
  childName: string,
  daysRemaining: number
): EmailPayload {
  return {
    to: parentEmail,
    subject: `Reminder: Consent pending for ${childName}'s EduAgent account`,
    body: `We're still waiting for your consent for ${childName}'s EduAgent account. You have ${daysRemaining} days remaining to respond before the account is automatically removed.`,
    type: 'consent_reminder',
  };
}
