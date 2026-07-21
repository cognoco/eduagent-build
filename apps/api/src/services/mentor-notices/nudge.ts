import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  membership,
  mentorNotices,
  notificationLog,
  notificationPreferences,
  organization,
  person,
  subjects,
  type Database,
} from '@eduagent/database';

import {
  MAX_DAILY_PUSH,
  REVIEW_FAMILY_DEDUP_TYPES,
  sendPushNotification,
  type NotificationResult,
} from '../notifications';
import {
  acquireCoordinationLock,
  budgetExhausted,
  mentorNoticeDeliveryKey,
  reviewFamilyBudgetKey,
} from '../notification-coordination';
import { safeSend } from '../safe-non-core';
import { inngest } from '../../inngest/client';
import { consentGateSatisfiedSql } from '../identity-v2/consent-status-v2';

export async function findEligibleMentorNoticeNudges(db: Database) {
  return db
    .select({
      noticeId: mentorNotices.id,
      profileId: mentorNotices.profileId,
    })
    .from(mentorNotices)
    .innerJoin(person, eq(person.id, mentorNotices.profileId))
    .innerJoin(membership, eq(membership.personId, person.id))
    .innerJoin(organization, eq(organization.id, membership.organizationId))
    .innerJoin(
      notificationPreferences,
      and(
        eq(notificationPreferences.profileId, person.id),
        eq(notificationPreferences.pushEnabled, true),
        eq(notificationPreferences.reviewReminders, true),
      ),
    )
    .where(
      and(
        isNull(person.archivedAt),
        eq(mentorNotices.status, 'open'),
        eq(mentorNotices.nudgeStatus, 'pending'),
        consentGateSatisfiedSql(sql`${person.id}`),
        sql`(now() at time zone coalesce(${organization.timezone}, 'UTC'))::time >= time '16:00'`,
        sql`(now() at time zone coalesce(${organization.timezone}, 'UTC'))::time < time '17:00'`,
        sql`((now() at time zone coalesce(${organization.timezone}, 'UTC')) - interval '4 hours')::date = (((${mentorNotices.createdAt} at time zone coalesce(${organization.timezone}, 'UTC')) - interval '4 hours')::date + 1)`,
      ),
    )
    .limit(500);
}

/**
 * Upper bound on how long the delivery transaction may hold Knotice while the
 * push is in flight — and therefore on how long a concurrent defer can wait.
 */
export const DELIVERY_LOCK_HOLD_MS = 5_000;

/**
 * Abort the push slightly before the transaction's own hold cap, so the normal
 * path unwinds through the sender (transaction commits, lock released) rather
 * than through Postgres terminating the session.
 */
const DELIVERY_PUSH_TIMEOUT_MS = DELIVERY_LOCK_HOLD_MS - 1_000;

export async function reserveMentorNoticeNudge(
  db: Database,
  input: {
    profileId: string;
    noticeId: string;
    localDayStart: Date;
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Database;
    // [WI-2503] Kbudget first, then Knotice — the estate-wide lock order.
    // Kbudget is the SAME key recall-nudge-send / review-due-send take, so the
    // three review-family senders now serialize against each other (before this
    // they locked `notification:<profileId>` vs `rate-limit:<profileId>:<types>`
    // and could each consume the one family slot).
    await acquireCoordinationLock(tx, reviewFamilyBudgetKey(input.profileId));
    await acquireCoordinationLock(
      tx,
      mentorNoticeDeliveryKey(input.profileId, input.noticeId),
    );
    const [notice] = await tx
      .select({ id: mentorNotices.id })
      .from(mentorNotices)
      .where(
        and(
          eq(mentorNotices.id, input.noticeId),
          eq(mentorNotices.profileId, input.profileId),
          eq(mentorNotices.status, 'open'),
          eq(mentorNotices.nudgeStatus, 'pending'),
        ),
      )
      .limit(1)
      .for('update');
    if (!notice) return false;

    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const exhausted = await budgetExhausted(tx, {
      profileId: input.profileId,
      dedupTypes: REVIEW_FAMILY_DEDUP_TYPES,
      familySince: dayAgo,
      familyMaxCount: 1,
      dailyCap: { since: input.localDayStart, maxCount: MAX_DAILY_PUSH },
    });
    if (exhausted) {
      await tx
        .update(mentorNotices)
        .set({ nudgeStatus: 'skipped' })
        .where(
          and(
            eq(mentorNotices.id, input.noticeId),
            eq(mentorNotices.profileId, input.profileId),
            eq(mentorNotices.nudgeStatus, 'pending'),
          ),
        );
      return false;
    }
    await tx.insert(notificationLog).values({
      profileId: input.profileId,
      type: 'notice_recheck',
      sentAt: now,
    });
    // Claim the notice. A duplicate event for the same notice now fails the
    // `pending` predicate above and returns without re-marking it `skipped`,
    // which would otherwise cancel this delivery after its budget was spent.
    await tx
      .update(mentorNotices)
      .set({ nudgeStatus: 'reserved' })
      .where(
        and(
          eq(mentorNotices.id, input.noticeId),
          eq(mentorNotices.profileId, input.profileId),
          eq(mentorNotices.nudgeStatus, 'pending'),
        ),
      );
    return true;
  });
}

export async function sendReservedMentorNoticeNudge(
  db: Database,
  input: { profileId: string; noticeId: string },
) {
  // [WI-2503] The final eligibility recheck, the push itself and the send-state
  // transition all happen inside ONE transaction holding Knotice — the once-ever
  // delivery/defer identity. Defers take the same key
  // (applyMentorNoticeOutcome), which makes the two operations strictly
  // ordered:
  //   • defer wins the lock  → it commits `suppressed`; the recheck below finds
  //     no `pending` notice and NO push is sent.
  //   • delivery wins the lock → the defer waits until this transaction
  //     commits, then sees a non-`pending` notice and no-ops; exactly one
  //     durable `sent` row exists.
  // Previously the recheck read and the push were unsynchronized, so a defer
  // committing between them still let the push go out.
  //
  // A worker that dies mid-push rolls back to `pending`, but the reservation row
  // in notification_log is already committed and counts against the family cap,
  // so a replay re-reserving this notice is refused — no second logical send.
  const outcome = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Database;
    // Holding a transaction across the Expo round-trip is what makes the defer
    // ordering above possible, but an unbounded hold would stall the learner's
    // synchronous "Not now" request (and pin a pooled connection) for as long
    // as Expo hangs. Bound it: Postgres terminates this session if the push has
    // not returned in time, which rolls the delivery back to `reserved` — the
    // same fail-closed state a crashed worker leaves, and the replay is refused
    // by the committed budget row.
    // SET LOCAL takes no bind parameters; the value is a numeric constant.
    await tx.execute(
      sql.raw(
        `SET LOCAL idle_in_transaction_session_timeout = ${DELIVERY_LOCK_HOLD_MS}`,
      ),
    );
    await acquireCoordinationLock(
      tx,
      mentorNoticeDeliveryKey(input.profileId, input.noticeId),
    );
    const [notice] = await tx
      .select({
        id: mentorNotices.id,
        subjectId: mentorNotices.subjectId,
        subjectName: subjects.name,
      })
      .from(mentorNotices)
      .innerJoin(subjects, eq(subjects.id, mentorNotices.subjectId))
      .where(
        and(
          eq(mentorNotices.id, input.noticeId),
          eq(mentorNotices.profileId, input.profileId),
          eq(subjects.profileId, input.profileId),
          eq(mentorNotices.status, 'open'),
          eq(mentorNotices.nudgeStatus, 'reserved'),
        ),
      )
      .limit(1);
    if (!notice) {
      const suppressed: NotificationResult = {
        sent: false,
        reason: 'suppressed',
      };
      return { result: suppressed };
    }

    const result = await sendPushNotification(
      tx,
      {
        profileId: input.profileId,
        title: `A quick ${notice.subjectName} check`,
        body: 'Your mentor noticed one small idea worth revisiting.',
        type: 'notice_recheck',
        data: { noticeId: notice.id, subjectId: notice.subjectId },
      },
      {
        skipRateLimitLog: true,
        skipDailyCap: true,
        pushTimeoutMs: DELIVERY_PUSH_TIMEOUT_MS,
      },
    );
    const [updated] = await tx
      .update(mentorNotices)
      .set({
        nudgeStatus: result.sent ? 'sent' : 'skipped',
        ...(result.sent ? { nudgedAt: new Date() } : {}),
      })
      .where(
        and(
          eq(mentorNotices.id, input.noticeId),
          eq(mentorNotices.profileId, input.profileId),
          eq(mentorNotices.nudgeStatus, 'reserved'),
        ),
      )
      .returning({ id: mentorNotices.id });
    return { result, updated };
  });

  if (outcome.result.sent && outcome.updated) {
    await safeSend(
      () =>
        inngest.send({
          // orphan-allow: observability-only lifecycle marker; no in-process handler.
          name: 'app/notice.nudge_sent',
          data: { noticeId: input.noticeId, profileId: input.profileId },
        }),
      'notice.nudge_sent',
      input,
    );
  }
  return outcome.result;
}
