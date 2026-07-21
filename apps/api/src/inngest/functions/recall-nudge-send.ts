// @inngest-admin: parent-chain (curriculumTopics looked up by IDs from event; familyLinks enforced by profileId)
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { and, eq, inArray, ne } from 'drizzle-orm';
import {
  curriculumBooks,
  curricula,
  curriculumTopics,
  subjects,
} from '@eduagent/database';
import { isPersonLive } from '../../services/identity-v2/helpers';
import {
  resolveProfileRoleV2,
  getFirstActiveChildNameV2,
} from '../../services/identity-v2/family-v2';
import {
  formatRecallNudge,
  MAX_DAILY_PUSH,
  REVIEW_FAMILY_DEDUP_TYPES,
  sendPushNotification,
} from '../../services/notifications';
import { checkAndLogRateLimitInternal } from '../../services/settings';
import {
  reviewFamilyBudgetKey,
  utcDayStart,
} from '../../services/notification-coordination';
import { captureException } from '../../services/sentry';

export const recallNudgeSend = inngest.createFunction(
  {
    id: 'recall-nudge-send',
    name: 'Recall Nudge Send',
    // [FIX-INNGEST-4] Inngest replay / operator re-fire must not push twice.
    // event.id is unique per sendEvent call; dedupes within 24h.
    idempotency: 'event.id',
  },
  { event: 'app/recall-nudge.send' },
  async ({ event, step }) => {
    const { profileId, fadingCount, topTopicIds } = event.data;

    const result = await step.run('send-nudge', async () => {
      const db = getStepDatabase();

      const live = await isPersonLive(db, profileId);
      if (!live) {
        return {
          status: 'skipped' as const,
          reason: 'profile_archived',
          profileId,
        };
      }

      // [BUG-699-FOLLOWUP / BUG-840] Atomic dedup. Inngest's idempotency
      // key (event.id) covers exact-duplicate events within 24h, but an
      // operator replay or a re-fire with a *new* event.id would bypass it
      // and push the same recipient again — and the prior implementation
      // (getRecentNotificationCount → conditional send) was a read-then-write
      // pair: two concurrent step.run invocations could both observe
      // count===0 and both fire the push.
      //
      // checkAndLogRateLimitInternal wraps the count check and the log
      // insert in a single transaction with a pg_advisory_xact_lock keyed
      // on ('rate-limit:<profileId>:recall_nudge'); concurrent callers
      // serialize on the lock and the second caller observes the first's
      // row. Mirrors the BUG-838 fix in daily-reminder-send.ts.
      //
      // [WI-1461] dedupTypes shares this bucket with review-due-send's
      // 'review_reminder' type: recall-nudge.ts and review-due-scan.ts scan
      // the same overdue-retention-card population, so without a shared
      // bucket a profile eligible for both crons could get both pushes the
      // same day for the same overdue cards. Whichever send handler's
      // transaction commits first consumes the day's review-family slot;
      // this is deliberately first-wins, not recall_nudge-preferred.
      //
      // Fail closed on DB error: skip this nudge cycle rather than risk
      // exceeding the rate-limit ceiling (spam). captureException makes the
      // failure queryable in Sentry so we can measure transient DB hiccup
      // frequency.
      let limited: boolean;
      try {
        limited = await checkAndLogRateLimitInternal(
          db,
          profileId,
          'recall_nudge',
          {
            hours: 24,
            maxCount: 1,
            dedupTypes: [...REVIEW_FAMILY_DEDUP_TYPES],
            // [WI-2503] Kbudget — the single review-family coordination key,
            // shared with the mentor-notice reserve so the two families cannot
            // both consume the one family slot. The local-day global cap moves
            // inside this same locked transaction (skipDailyCap below), where
            // the count and the log insert are atomic.
            coordinationKey: reviewFamilyBudgetKey(profileId),
            dailyCap: { since: utcDayStart(), maxCount: MAX_DAILY_PUSH },
          },
        );
      } catch (err) {
        captureException(err, {
          profileId,
          extra: {
            context: 'recall-nudge-send:checkAndLogRateLimitInternal',
          },
        });
        return {
          status: 'skipped' as const,
          reason: 'dedup_check_failed',
          profileId,
        };
      }
      if (limited) {
        return { status: 'skipped' as const, reason: 'dedup_24h', profileId };
      }

      // Look up topic titles through both topic parent chains. The event payload
      // is replayable/operator-controlled, so topTopicIds alone cannot prove
      // profile ownership.
      const topics =
        topTopicIds.length > 0
          ? await db
              .select({
                title: curriculumTopics.title,
              })
              .from(curriculumTopics)
              .innerJoin(
                curriculumBooks,
                eq(curriculumBooks.id, curriculumTopics.bookId),
              )
              .innerJoin(
                curricula,
                eq(curricula.id, curriculumTopics.curriculumId),
              )
              .innerJoin(
                subjects,
                and(
                  eq(subjects.id, curriculumBooks.subjectId),
                  eq(subjects.id, curricula.subjectId),
                  ne(subjects.status, 'archived'),
                ),
              )
              .where(
                and(
                  inArray(curriculumTopics.id, topTopicIds),
                  eq(subjects.profileId, profileId),
                ),
              )
          : [];

      const topTopicTitle = topics[0]?.title ?? 'your fading topic';

      // Resolve role
      const role = await resolveProfileRoleV2(db, profileId);

      // For guardians, look up child name
      let childName: string | undefined;
      if (role === 'guardian') {
        childName =
          (await getFirstActiveChildNameV2(db, profileId)) ?? undefined;
      }

      // Format notification message
      const { title, body } = formatRecallNudge(
        fadingCount,
        topTopicTitle,
        role,
        childName,
      );

      // [BUG-840] checkAndLogRateLimitInternal already inserted the
      // notificationLog row in the same transaction that gated us — pass
      // skipRateLimitLog so sendPushNotification does not double-log this
      // push toward the daily cap.
      const sendResult = await sendPushNotification(
        db,
        {
          profileId,
          title,
          body,
          type: 'recall_nudge',
        },
        { skipRateLimitLog: true, skipDailyCap: true },
      );

      if (sendResult.sent) {
        return {
          status: 'sent' as const,
          profileId,
          ticketId: sendResult.ticketId,
        };
      }

      return {
        status: 'skipped' as const,
        reason: sendResult.reason ?? 'daily_cap_reached',
        profileId,
      };
    });

    // AGENTS.md "Silent recovery without escalation is banned": the
    // dedup_check_failed path swallows a DB error and returns skipped.
    // captureException above feeds Sentry exception counts; this
    // app/notification.suppressed event is consumed by
    // notification-suppressed-observe which emits a structured
    // [notification-suppressed] log line, making the volume queryable via
    // Cloudflare Workers Logpush in addition to Sentry.
    if (result.status === 'skipped' && result.reason === 'dedup_check_failed') {
      await step.sendEvent('notify-notification-suppressed', {
        name: 'app/notification.suppressed',
        data: {
          profileId,
          notificationType: 'recall_nudge',
          reason: result.reason,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return result;
  },
);
