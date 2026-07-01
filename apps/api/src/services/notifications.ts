// ---------------------------------------------------------------------------
// Push Notification Service — Story 4.8 (ARCH-18)
// Pure business logic, no Hono imports.
// Uses Expo Push API via fetch (CF Workers-compatible, no Node SDK needed).
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import type { NotificationPayload } from '@eduagent/schemas';
import { person, consentRequest, type Database } from '@eduagent/database';
import {
  getPushToken,
  getDailyNotificationCount,
  logNotification,
  checkAndLogRateLimitInternal,
  isPushEnabled,
} from './settings';
import { isGdprProcessingAllowedV2 } from './identity-v2/consent-status-v2';
import { getGuardianPersonIds } from './identity-v2/guardianship';
import { createLogger } from './logger';
import { captureException } from './sentry';
import {
  sendEmail,
  type EmailPayload,
  type EmailOptions,
} from './notifications/email';
export {
  sendEmail,
  formatConsentRequestEmail,
  formatConsentReminderEmail,
  formatSecurityNotificationEmail,
  formatAccountReclaimAttemptEmail,
  type EmailPayload,
  type EmailOptions,
  type EmailResult,
} from './notifications/email';

const logger = createLogger();

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
  options?: {
    skipRateLimitLog?: boolean;
    skipDailyCap?: boolean;
    /**
     * [WI-369] Push-preference check is ON by default. Set to true only for
     * transactional / regulatory notices that MUST always deliver (GDPR consent
     * notices, billing/trial-expiry), or when the caller has already verified
     * pushEnabled before calling (e.g. the struggle-notification path, which
     * checks before reserving the dedup slot so push-disabled parents do not
     * consume their slot). Reminders/nudges must NOT set this — they respect the
     * recipient's master push preference.
     */
    bypassPreferenceCheck?: boolean;
  },
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

  // [WI-226 / WI-369] Honor the recipient's master push preference unless the
  // caller opts out (bypassPreferenceCheck=true) for a transactional/regulatory
  // notice or because it already verified pushEnabled. Previously this check was
  // opt-in (respectPushPreference); it is now enforced by default so callers
  // cannot accidentally bypass user consent by omitting the flag.
  if (
    !options?.bypassPreferenceCheck &&
    !(await isPushEnabled(db, payload.profileId))
  ) {
    return { sent: false, reason: 'push_disabled' };
  }

  // 3. Check daily cap
  if (!options?.skipDailyCap) {
    const dailyCount = await getDailyNotificationCount(db, payload.profileId);
    if (dailyCount >= MAX_DAILY_PUSH) {
      return { sent: false, reason: 'daily_cap_exceeded' };
    }
  }

  // 4. Send via Expo Push API
  // [BUG-688] Separate the network boundary (fetch + json) from the DB write
  // (logNotification). The previous shape wrapped both in one catch and tagged
  // any thrown error as `network_error`, so a Postgres failure from
  // logNotification was misreported as a push-network error in Sentry and
  // metrics. Classification now branches on which boundary threw.
  let ticketId: string | undefined;
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
        data: { type: payload.type, ...(payload.data ?? {}) },
      }),
    });

    if (!response.ok) {
      // [C-1] An HTTP error from the Expo Push API (rate-limit, malformed
      // token, service outage) is a silent push-delivery failure. Mirror the
      // network-error path below: escalate to Sentry + structured log so the
      // failure is queryable, not just a reason string the caller swallows.
      logger.error('[push] Expo API error', {
        event: 'notification.push.expo_api_error',
        profileId: payload.profileId,
        type: payload.type,
        status: response.status,
      });
      captureException(new Error(`Expo Push API ${response.status}`), {
        profileId: payload.profileId,
        tags: {
          surface: 'push_notification',
          reason: `http_${response.status}`,
        },
        extra: { type: payload.type },
      });
      return { sent: false, reason: `expo_api_error_${response.status}` };
    }

    const result = (await response.json()) as {
      data?: { id?: string; status?: string };
    };
    ticketId = result.data?.id;
  } catch (err) {
    logger.error('[push] send failed', {
      event: 'notification.push.network_error',
      profileId: payload.profileId,
      type: payload.type,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, {
      profileId: payload.profileId,
      tags: { surface: 'push_notification', reason: 'network_error' },
    });
    return { sent: false, reason: 'network_error' };
  }

  // 5. Log the notification (skipped when caller already reserved the slot
  // via checkAndLogRateLimitInternal — avoids double-counting toward the
  // daily cap on per-type rate-limited paths).
  // [BUG-688] DB errors classified as `db_error` (not network_error). The push
  // itself succeeded — we still report `sent: true` because the user got it —
  // but escalate the log-write failure so on-call can see the divergence
  // between Expo tickets and our notification_log rows.
  if (!options?.skipRateLimitLog) {
    try {
      await logNotification(db, payload.profileId, payload.type, ticketId);
    } catch (err) {
      logger.error('[push] log write failed after successful send', {
        event: 'notification.push.db_error',
        profileId: payload.profileId,
        type: payload.type,
        ticketId,
        error: err instanceof Error ? err.message : String(err),
      });
      captureException(err, {
        profileId: payload.profileId,
        tags: { surface: 'push_notification', reason: 'db_error' },
        extra: { ticketId, type: payload.type },
      });
      // Push was delivered; surface success to the caller but with a reason
      // tag so tests/observability can detect the divergence.
      return { sent: true, ticketId, reason: 'log_write_failed' };
    }
  }

  return { sent: true, ticketId };
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
        .map(
          (topic) =>
            `${sl.childName}: You might want to keep an eye on ${topic}.`,
        )
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
        .map(
          (topic) =>
            `${sl.childName}: You might want to keep an eye on ${topic}.`,
        )
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
 *
 * [WI-802] Resolves the parent via `guardianship` (active guardian person ids).
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

  // 2. Find parent via guardianship (v2)
  const guardianIds = await getGuardianPersonIds(db, childProfileId);
  const parentProfileId = guardianIds[0];
  if (!parentProfileId) {
    return { sent: false, rateLimited: false, reason: 'no_parent_link' };
  }

  // 3. Get child display name
  // [WI-586] v2 path: read displayName from person (profiles dropped).
  const childPerson = await db.query.person.findFirst({
    where: eq(person.id, childProfileId),
    columns: { displayName: true },
  });
  const childName = childPerson?.displayName ?? 'Your child';

  // 4. Send push notification to parent
  // [WI-369] No options needed — push preference is enforced by default.
  await sendPushNotification(db, {
    profileId: parentProfileId,
    title: `${childName} wants to keep learning!`,
    body: `${childName} has been making great progress. Subscribe to continue their learning journey.`,
    type: 'subscribe_request',
  });

  // 5. Send email to parent (v2: guardianEmail lives on consentRequest)
  // [WI-586] v2 path: guardianEmail lives on consentRequest, not consent_states.
  const req = await db.query.consentRequest.findFirst({
    where: eq(consentRequest.chargePersonId, childProfileId),
    columns: { guardianEmail: true },
  });
  const parentEmail = req?.guardianEmail ?? undefined;

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
 * Looks up parent via guardianship, resolves child display name, sends push.
 */
export async function sendStruggleNotification(
  db: Database,
  childProfileId: string,
  notification: StruggleNotification,
): Promise<NotificationResult> {
  const guardianIds = await getGuardianPersonIds(db, childProfileId);
  const parentProfileId = guardianIds[0];
  if (!parentProfileId) {
    return { sent: false, reason: 'no_parent_link' };
  }

  // Privacy gate: only send when the child's GDPR consent permits processing.
  // [WI-586] v2 path: isGdprProcessingAllowedV2 reads consent_grant (not consent_states).
  const gdprAllowed = await isGdprProcessingAllowedV2(db, childProfileId);
  if (!gdprAllowed) {
    logger.info('Struggle notification suppressed by consent', {
      event: 'notification.struggle.consent_blocked',
      childProfileId,
      type: notification.type,
      // Keep the suppression reason queryable in observability tooling even
      // though the shared helper returns a boolean (not the raw status).
      reason: 'gdpr_processing_not_allowed',
    });
    return { sent: false, reason: 'consent_not_granted' };
  }

  // [WI-226] Honor the parent's push opt-out BEFORE reserving the 24h dedup
  // slot below. If we deferred this to sendPushNotification (post-reservation),
  // a push-disabled parent would still consume the dedup slot, so re-enabling
  // push within 24h could suppress their first real struggle alert as
  // `dedup_24h`. Checking here keeps the slot unconsumed when nothing is sent.
  if (!(await isPushEnabled(db, parentProfileId))) {
    return { sent: false, reason: 'push_disabled' };
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
    parentProfileId,
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

  // [WI-586] v2 path: read displayName from person (profiles dropped).
  const childPerson = await db.query.person.findFirst({
    where: eq(person.id, childProfileId),
    columns: { displayName: true },
  });
  const childName = childPerson?.displayName ?? null;

  const copy = formatStruggleNotificationCopy(
    notification.type,
    notification.topic,
    childName,
  );

  return sendPushNotification(
    db,
    {
      profileId: parentProfileId,
      title: copy.title,
      body: copy.body,
      type: notification.type,
    },
    // [BUG-856] Slot already reserved by checkAndLogRateLimitInternal above
    // for the same (parentProfileId, type) bucket — skip the push log so we
    // do not record two rows for the same notification.
    // [WI-369] pushEnabled was already verified above (before slot reservation)
    // so we skip the default check here to avoid double-querying the DB.
    { skipRateLimitLog: true, bypassPreferenceCheck: true },
  );
}
