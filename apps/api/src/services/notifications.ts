// ---------------------------------------------------------------------------
// Push Notification Service — Story 4.8 (ARCH-18)
// Pure business logic, no Hono imports.
// Uses Expo Push API via fetch (CF Workers-compatible, no Node SDK needed).
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import type { ConsentType } from '@eduagent/schemas';
import {
  familyLinks,
  profiles,
  consentStates,
  type Database,
} from '@eduagent/database';
import {
  getPushToken,
  getDailyNotificationCount,
  logNotification,
  getRecentNotificationCount,
} from './settings';

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
    | 'consent_expired'
    | 'subscribe_request';
}

export interface NotificationResult {
  sent: boolean;
  ticketId?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum push notifications per day per profile */
export const MAX_DAILY_PUSH = 3;

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

// ---------------------------------------------------------------------------
// Token validation
// ---------------------------------------------------------------------------

/** Checks if a string is a valid Expo push token format */
export function isExpoPushToken(token: string): boolean {
  return (
    token.startsWith('ExponentPushToken[') ||
    token.startsWith('ExpoPushToken[') ||
    /^[a-zA-Z0-9-_]+$/.test(token)
  );
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Sends a push notification via the Expo Push API.
 *
 * Checks:
 * 1. Push token exists for the profile
 * 2. Token is a valid Expo Push Token
 * 3. Daily notification cap not exceeded
 *
 * Logs the sent notification and returns the ticket ID.
 */
export async function sendPushNotification(
  db: Database,
  payload: NotificationPayload
): Promise<NotificationResult> {
  // 1. Get push token
  const token = await getPushToken(db, payload.profileId);
  if (!token) {
    return { sent: false, reason: 'no_push_token' };
  }

  // 2. Validate token format
  if (!isExpoPushToken(token)) {
    return { sent: false, reason: 'invalid_token' };
  }

  // 3. Check daily cap
  const dailyCount = await getDailyNotificationCount(db, payload.profileId);
  if (dailyCount >= MAX_DAILY_PUSH) {
    return { sent: false, reason: 'daily_cap_exceeded' };
  }

  // 4. Send via Expo Push API
  try {
    const response = await fetch(EXPO_PUSH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title: payload.title,
        body: payload.body,
        sound: 'default',
        data: { type: payload.type },
      }),
    });

    if (!response.ok) {
      return { sent: false, reason: `expo_api_error_${response.status}` };
    }

    const result = (await response.json()) as {
      data?: { id?: string; status?: string };
    };
    const ticketId = result.data?.id;

    // 5. Log the notification
    await logNotification(db, payload.profileId, payload.type, ticketId);

    return { sent: true, ticketId };
  } catch {
    return { sent: false, reason: 'network_error' };
  }
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
    | 'consent_expired'
    | 'subscribe_request';
}

export interface EmailOptions {
  resendApiKey?: string;
  emailFrom?: string;
}

export interface EmailResult {
  sent: boolean;
  messageId?: string;
  reason?: string;
}

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Sends an email notification via the Resend API.
 *
 * Uses pure fetch() — no SDK needed on Cloudflare Workers.
 * Degrades gracefully when RESEND_API_KEY is not configured.
 */
export async function sendEmail(
  payload: EmailPayload,
  options?: EmailOptions
): Promise<EmailResult> {
  const apiKey = options?.resendApiKey;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not configured — skipping email send');
    return { sent: false, reason: 'no_api_key' };
  }

  const from = options?.emailFrom ?? 'noreply@eduagent.com';

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        text: payload.body,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown');
      console.error(
        `[email] Resend API error ${response.status}: ${errorBody}`
      );
      return { sent: false, reason: `resend_api_error_${response.status}` };
    }

    const result = (await response.json()) as { id?: string };
    return { sent: true, messageId: result.id };
  } catch {
    console.error('[email] Network error sending email');
    return { sent: false, reason: 'network_error' };
  }
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

// ---------------------------------------------------------------------------
// Parent Subscribe Notification — Child-Friendly Paywall
// ---------------------------------------------------------------------------

export interface ParentSubscribeResult {
  sent: boolean;
  rateLimited: boolean;
  reason?: string;
}

/** Rate limit: 1 subscribe notification per 24 hours per child profile */
const SUBSCRIBE_RATE_LIMIT_HOURS = 24;

/**
 * Notifies a child's parent to subscribe. Sends push notification + email.
 * Rate limited to 1 notification per 24 hours per child profile.
 */
export async function notifyParentToSubscribe(
  db: Database,
  childProfileId: string,
  emailOptions?: EmailOptions
): Promise<ParentSubscribeResult> {
  // 1. Check rate limit — look for recent subscribe_request notifications
  const recentCount = await getRecentNotificationCount(
    db,
    childProfileId,
    'subscribe_request',
    SUBSCRIBE_RATE_LIMIT_HOURS
  );
  if (recentCount > 0) {
    return { sent: false, rateLimited: true, reason: 'rate_limited' };
  }

  // 2. Find parent via familyLinks
  const link = await db.query.familyLinks.findFirst({
    where: eq(familyLinks.childProfileId, childProfileId),
  });
  if (!link) {
    return { sent: false, rateLimited: false, reason: 'no_parent_link' };
  }

  // 3. Get child profile info
  const childProfile = await db.query.profiles.findFirst({
    where: eq(profiles.id, childProfileId),
    columns: { displayName: true },
  });

  const childName = childProfile?.displayName ?? 'Your child';

  // 4. Send push notification to parent
  await sendPushNotification(db, {
    profileId: link.parentProfileId,
    title: `${childName} wants to keep learning!`,
    body: `${childName} has been making great progress. Subscribe to continue their learning journey.`,
    type: 'subscribe_request',
  });

  // 5. Send email to parent (via consent state parentEmail)
  const consentState = await db.query.consentStates.findFirst({
    where: eq(consentStates.profileId, childProfileId),
  });
  const parentEmail = consentState?.parentEmail;

  if (parentEmail) {
    await sendEmail(
      {
        to: parentEmail,
        subject: `${childName} wants to keep learning on EduAgent`,
        body: `${childName} has been making great progress on EduAgent and wants to continue. Their free trial has ended. Subscribe to keep their learning going: https://app.eduagent.com/subscribe`,
        type: 'subscribe_request',
      },
      emailOptions
    );
  }

  // 6. Log notification for rate limiting
  await logNotification(db, childProfileId, 'subscribe_request');

  return { sent: true, rateLimited: false };
}
