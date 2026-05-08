// ---------------------------------------------------------------------------
// Push Notification Service — Story 4.8 (ARCH-18)
// Pure business logic, no Hono imports.
// Uses Expo Push API via fetch (CF Workers-compatible, no Node SDK needed).
// ---------------------------------------------------------------------------

import { and, desc, eq } from 'drizzle-orm';
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
  checkAndLogRateLimitInternal,
} from './settings';
import { createLogger } from './logger';

const logger = createLogger();

export interface NotificationPayload {
  profileId: string;
  title: string;
  body: string;
  type:
    | 'review_reminder'
    | 'daily_reminder'
    | 'trial_expiry'
    | 'consent_request'
    | 'consent_reminder'
    | 'consent_warning'
    | 'consent_expired'
    | 'consent_archived'
    | 'subscribe_request'
    | 'recall_nudge'
    | 'weekly_progress'
    | 'monthly_report'
    | 'progress_refresh'
    | 'struggle_noticed'
    | 'struggle_flagged'
    | 'struggle_resolved'
    | 'dictation_review'
    | 'session_filing_failed';
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
  payload: NotificationPayload,
  // [BUG-856] When the caller already reserved the rate-limit slot via
  // checkAndLogRateLimitInternal, set skipRateLimitLog to true so we do not
  // double-count this push toward the daily cap or per-type rate limit.
  options?: { skipRateLimitLog?: boolean },
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

    // 5. Log the notification (skipped when caller already reserved the slot
    // via checkAndLogRateLimitInternal — avoids double-counting toward the
    // daily cap on per-type rate-limited paths).
    if (!options?.skipRateLimitLog) {
      await logNotification(db, payload.profileId, payload.type, ticketId);
    }

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
  subjects: string[],
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

/**
 * Formats a recall nudge notification based on the user's role.
 * Guardians receive third-person overviews about their child;
 * self-learners receive direct first-person challenges.
 */
export function formatRecallNudge(
  fadingCount: number,
  topTopicTitle: string,
  role: 'guardian' | 'self_learner',
  childName?: string,
): { title: string; body: string } {
  if (role === 'guardian') {
    return {
      title: 'Review reminder',
      body: `${childName ?? 'Your learner'} has ${fadingCount} topic${
        fadingCount > 1 ? 's' : ''
      } due for review today.`,
    };
  }

  if (fadingCount === 1) {
    return {
      title: topTopicTitle,
      body: "This one's starting to fade — a quick check keeps it locked in.",
    };
  }

  return {
    title: `${fadingCount} topics need a refresh`,
    body: `Starting with ${topTopicTitle}. About ${fadingCount * 2} minutes.`,
  };
}

export function formatFilingFailedPush(): { title: string; body: string } {
  return {
    title: 'Topic placement needs attention',
    body: "We couldn't sort your last session into a topic. Tap to try again.",
  };
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
    | 'consent_archived'
    | 'subscribe_request'
    | 'feedback'
    | 'weekly_progress'
    | 'monthly_progress';
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
  options?: EmailOptions,
): Promise<EmailResult> {
  const apiKey = options?.resendApiKey;
  if (!apiKey) {
    logger.warn('[email] RESEND_API_KEY not configured — skipping email send');
    return { sent: false, reason: 'no_api_key' };
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
      logger.error('[email] Resend API error', { status: response.status });
      return { sent: false, reason: `resend_api_error_${response.status}` };
    }

    const result = (await response.json()) as { id?: string };
    return { sent: true, messageId: result.id };
  } catch {
    // [logging sweep] structured logger so PII fields land as JSON context
    logger.error('[email] Network error sending email');
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
// Parent Digest Email Formatters — Weekly + Monthly
// ---------------------------------------------------------------------------

/**
 * A single child's struggle watch-line for inclusion in a parent digest email.
 * Rendered from `learning_profiles.struggles` JSONB (topic + subject pairs).
 * Path A (v1): topic name only — no contextNote. Max 2 topics per child.
 */
export interface ChildStruggleLine {
  childName: string;
  topics: string[]; // max 2, empty = omit the watch-line for this child
}

/**
 * Formats the weekly progress digest email for a parent.
 * `childSummaries` is the same text lines built for the push notification body.
 * `struggleLines` adds per-child watch-lines below the summary (omitted when empty).
 */
export function formatWeeklyProgressEmail(
  parentEmail: string,
  childSummaries: string[],
  struggleLines: ChildStruggleLine[],
): EmailPayload {
  const summarySection = childSummaries.join('\n');

  const watchLines = struggleLines
    .filter((sl) => sl.topics.length > 0)
    .map((sl) => {
      const topicLines = sl.topics
        .slice(0, 2)
        .map((topic) => `You might want to keep an eye on **${topic}**.`)
        .join('\n');
      return topicLines;
    })
    .join('\n\n');

  const body = watchLines
    ? `${summarySection}\n\n${watchLines}`
    : summarySection;

  return {
    to: parentEmail,
    subject: "This week's learning progress",
    body,
    type: 'weekly_progress',
  };
}

/**
 * Formats the monthly report digest email for a parent.
 * `monthlyReportSummary` is the human-readable report line for the child.
 * `struggleLines` adds per-child watch-lines below (omitted when empty).
 */
export function formatMonthlyProgressEmail(
  parentEmail: string,
  monthlyReportSummary: string,
  struggleLines: ChildStruggleLine[],
): EmailPayload {
  const watchLines = struggleLines
    .filter((sl) => sl.topics.length > 0)
    .map((sl) => {
      return sl.topics
        .slice(0, 2)
        .map((topic) => `You might want to keep an eye on **${topic}**.`)
        .join('\n');
    })
    .join('\n\n');

  const body = watchLines
    ? `${monthlyReportSummary}\n\n${watchLines}`
    : monthlyReportSummary;

  return {
    to: parentEmail,
    subject: "This month's learning report",
    body,
    type: 'monthly_progress',
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
  emailOptions?: EmailOptions,
  appUrl?: string,
): Promise<ParentSubscribeResult> {
  // 1. [BUG-856] Atomic rate-limit check — counts recent subscribe_request
  // notifications and reserves the rate-limit slot in a single transaction
  // so two concurrent calls cannot both pass the count check and proceed.
  // The advisory lock + insert serializes for this (profile, type) bucket.
  const rateLimited = await checkAndLogRateLimitInternal(
    db,
    childProfileId,
    'subscribe_request',
    { hours: SUBSCRIBE_RATE_LIMIT_HOURS, maxCount: 1 },
  );
  if (rateLimited) {
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
        subject: `${childName} wants to keep learning on MentoMate`,
        body: `${childName} has been making great progress on MentoMate and wants to continue. Their free trial has ended.${
          appUrl
            ? ` Subscribe to keep their learning going: ${appUrl}/subscribe`
            : ''
        }`,
        type: 'subscribe_request',
      },
      emailOptions,
    );
  }

  // [BUG-856] Rate-limit slot was already reserved atomically in step 1.
  // No additional log needed here.

  return { sent: true, rateLimited: false };
}

// ---------------------------------------------------------------------------
// FR247.6/FR247.7: Struggle push notifications to parent
// ---------------------------------------------------------------------------

import type { StruggleNotification } from './learner-profile';

/**
 * Format push notification copy for struggle signals.
 * Two-tier system: softer "noticed" at medium confidence, stronger "flagged" at high.
 */
export function formatStruggleNotificationCopy(
  type: 'struggle_noticed' | 'struggle_flagged' | 'struggle_resolved',
  topic: string,
  childName: string | null,
): { title: string; body: string } {
  const name = childName ?? 'Your child';

  switch (type) {
    case 'struggle_noticed':
      return {
        title: 'Learning update',
        body: `It looks like ${name} is finding ${topic} challenging. Nothing to worry about — just keeping you in the loop.`,
      };
    case 'struggle_flagged':
      return {
        title: 'Learning update',
        body: `${name} has been working hard on ${topic} — they may need some extra support.`,
      };
    case 'struggle_resolved':
      return {
        title: 'Great news!',
        body: `${name} seems to have overcome their difficulty with ${topic}.`,
      };
  }
}

/**
 * Send struggle push notification to the parent of a child profile.
 * Looks up parent via familyLinks, resolves child display name, sends push.
 */
export async function sendStruggleNotification(
  db: Database,
  childProfileId: string,
  notification: StruggleNotification,
): Promise<NotificationResult> {
  const link = await db.query.familyLinks.findFirst({
    where: eq(familyLinks.childProfileId, childProfileId),
  });
  if (!link) {
    return { sent: false, reason: 'no_parent_link' };
  }

  // Privacy gate: only send when the child's most recent GDPR consent state
  // is CONSENTED. PENDING / PARENTAL_CONSENT_REQUESTED / WITHDRAWN must
  // suppress — a parent receiving "Mia is struggling with fractions" pushes
  // for a child who has not consented (or has withdrawn) is a privacy
  // violation. Mirrors the dashboard's consent visibility rule
  // (`hasRestrictedConsent` in ParentDashboardSummary).
  // Missing row = no restriction (consent presumed), per existing dashboard
  // behaviour for accounts created before the consent flow shipped.
  const consentState = await db.query.consentStates.findFirst({
    where: and(
      eq(consentStates.profileId, childProfileId),
      eq(consentStates.consentType, 'GDPR'),
    ),
    orderBy: desc(consentStates.requestedAt),
  });
  if (consentState != null && consentState.status !== 'CONSENTED') {
    logger.info('Struggle notification suppressed by consent', {
      event: 'notification.struggle.consent_blocked',
      childProfileId,
      type: notification.type,
      consentStatus: consentState.status,
    });
    return { sent: false, reason: 'consent_not_granted' };
  }

  // [CR-119.5]: Per-type dedup (intentionally NOT per-topic). A parent
  // receives at most ONE push per struggle type (e.g. struggle_noticed) in
  // any 24-hour window, even if multiple distinct topics trigger the signal.
  // Trade-off: some topic-specific alerts are suppressed, but this prevents
  // notification fatigue when a learner struggles across several topics in
  // quick succession. The daily global cap in sendPushNotification is an
  // additional layer; this check prevents same-type redundancy.
  //
  // [BUG-856] Atomic check + log via advisory lock — without this, two
  // concurrent strugle signals for the same type both observed count=0 and
  // both pushed, defeating the 24h dedup invariant.
  const rateLimited = await checkAndLogRateLimitInternal(
    db,
    link.parentProfileId,
    notification.type,
    { hours: 24, maxCount: 1 },
  );
  if (rateLimited) {
    logger.info('Struggle notification deduped', {
      event: 'notification.struggle.deduped',
      childProfileId,
      type: notification.type,
      topic: notification.topic,
    });
    return { sent: false, reason: 'dedup_24h' };
  }

  const childProfile = await db.query.profiles.findFirst({
    where: eq(profiles.id, childProfileId),
    columns: { displayName: true },
  });
  const childName = childProfile?.displayName ?? null;

  const copy = formatStruggleNotificationCopy(
    notification.type,
    notification.topic,
    childName,
  );

  return sendPushNotification(
    db,
    {
      profileId: link.parentProfileId,
      title: copy.title,
      body: copy.body,
      type: notification.type,
    },
    // [BUG-856] Slot already reserved by checkAndLogRateLimitInternal above
    // for the same (parentProfileId, type) bucket — skip the push log so we
    // do not record two rows for the same notification.
    { skipRateLimitLog: true },
  );
}
