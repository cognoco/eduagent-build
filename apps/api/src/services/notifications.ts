// ---------------------------------------------------------------------------
// Push Notification Service Stub — Story 4.8
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

export interface NotificationPayload {
  profileId: string;
  title: string;
  body: string;
  type:
    | 'review_reminder'
    | 'daily_reminder'
    | 'trial_expiry'
    | 'streak_warning';
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
