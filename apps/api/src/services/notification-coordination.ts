// ---------------------------------------------------------------------------
// Notification coordination identities — [WI-2503]
//
// Two canonical identities, defined here ONCE and consumed by every sender.
// Do not derive either key anywhere else.
//
//   Kbudget(profileId)            — the single review-family coordination key.
//     Guards the shared rolling-family cap AND the local-day global push cap
//     for mentor-notice, recall-nudge and review-due sends. Before WI-2503 the
//     mentor-notice reserve locked on `notification:<profileId>` while
//     recall/review-due locked on `rate-limit:<profileId>:<types>`, so the two
//     families never serialized against each other and could both consume the
//     same single family slot.
//
//   Knotice(profileId, noticeId)  — the once-ever mentor-notice delivery/defer
//     identity. Every reservation, final eligibility recheck, defer and
//     send-state transition for one notice takes this lock, so a defer that
//     commits before the delivery claim always suppresses the push, and a
//     delivery that wins the claim always produces exactly one durable sent
//     result. Notice provenance (source session) is deliberately NOT part of
//     the key — a source-session class must not create a separate lane.
//
// Lock ordering: whenever both are taken, Kbudget is acquired BEFORE Knotice.
// ---------------------------------------------------------------------------

import { and, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { notificationLog, type Database } from '@eduagent/database';
import type { NotificationPayload } from '@eduagent/schemas';

/**
 * The notification_log-backed helpers operate on the LOGGABLE subset of push
 * types — `store_cancel_nudge` is push-only and never logged.
 */
export type LoggableNotificationType = Exclude<
  NotificationPayload['type'],
  'store_cancel_nudge'
>;

/** Notification types that share the one review-family slot. */
export const REVIEW_FAMILY_DEDUP_TYPES = [
  'review_reminder',
  'recall_nudge',
  'notice_recheck',
] as const;

/** Kbudget — the single review-family coordination key. */
export function reviewFamilyBudgetKey(profileId: string): string {
  return `review-family-budget:${profileId}`;
}

/** Knotice — the once-ever mentor-notice delivery/defer identity. */
export function mentorNoticeDeliveryKey(
  profileId: string,
  noticeId: string,
): string {
  return `mentor-notice-delivery:${profileId}:${noticeId}`;
}

/**
 * Takes a transaction-scoped advisory lock on a coordination key. Released
 * automatically on commit/rollback, so a crashed worker cannot wedge the key.
 */
export async function acquireCoordinationLock(
  tx: Database,
  key: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}

/** Start of the current UTC day — the global push-cap window boundary. */
export function utcDayStart(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export interface BudgetCheck {
  profileId: string;
  /** Types sharing the rolling cap window. */
  dedupTypes: readonly LoggableNotificationType[];
  /** Start of the rolling window for the shared family cap. */
  familySince: Date;
  familyMaxCount: number;
  /**
   * Local-day global push cap. Omit for callers that do not participate in the
   * global cap (they still get the rolling per-bucket cap).
   */
  dailyCap?: { since: Date; maxCount: number };
}

/**
 * Counts both caps in a single statement. MUST be called inside a transaction
 * that already holds the relevant Kbudget lock — the count and the subsequent
 * log insert are only atomic because of that lock.
 *
 * The daily count mirrors getDailyNotificationCount's predicate: push sends
 * only, excluding email evidence rows and rate-limit sentinels.
 */
export async function budgetExhausted(
  tx: Database,
  check: BudgetCheck,
): Promise<boolean> {
  const dailySince = check.dailyCap?.since ?? check.familySince;
  const [counts] = await tx
    .select({
      family: sql<number>`count(*) filter (
        where ${inArray(notificationLog.type, [...check.dedupTypes])}
          and ${gte(notificationLog.sentAt, check.familySince)}
      )::int`,
      daily: sql<number>`count(*) filter (
        where ${gte(notificationLog.sentAt, dailySince)}
          and ${ne(notificationLog.type, 'support_outbox_spillover')}
          and (${notificationLog.ticketId} IS NULL
               OR ${notificationLog.ticketId} NOT LIKE 'email-%')
      )::int`,
    })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.profileId, check.profileId),
        gte(
          notificationLog.sentAt,
          dailySince < check.familySince ? dailySince : check.familySince,
        ),
      ),
    );

  if ((counts?.family ?? 0) >= check.familyMaxCount) return true;
  if (check.dailyCap && (counts?.daily ?? 0) >= check.dailyCap.maxCount) {
    return true;
  }
  return false;
}
