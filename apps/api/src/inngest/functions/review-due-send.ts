// @inngest-admin: parent-chain (curriculumTopics joined through book+curriculum subject chains)
// ---------------------------------------------------------------------------
// Review Due Send — Handles a single app/retention.review-due event,
// resolves subject names from the topic chain, and sends a push notification.
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { getStepDatabase, isIdentityV2EnabledInStep } from '../helpers';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import {
  curriculumBooks,
  curriculumTopics,
  curricula,
  profiles,
  subjects,
} from '@eduagent/database';
import { isPersonLive } from '../../services/identity-v2/helpers';
import {
  formatReviewReminderBody,
  sendPushNotification,
} from '../../services/notifications';
import { checkAndLogRateLimitInternal } from '../../services/settings';
import { captureException } from '../../services/sentry';

export const reviewDueSend = inngest.createFunction(
  {
    id: 'review-due-send',
    name: 'Review Due Send',
    // [FIX-INNGEST-4] Inngest replay / operator re-fire must not push twice.
    // event.id is unique per sendEvent call; dedupes within 24h.
    idempotency: 'event.id',
  },
  { event: 'app/retention.review-due' },
  async ({ event, step }) => {
    const { profileId, overdueCount, topTopicIds } = event.data;

    const result = await step.run('send-review-reminder', async () => {
      const db = getStepDatabase();

      // [CUT-B2] Liveness dispatch (person.archived_at vs profiles.archived_at).
      const live = isIdentityV2EnabledInStep()
        ? await isPersonLive(db, profileId)
        : !!(await db.query.profiles.findFirst({
            where: and(eq(profiles.id, profileId), isNull(profiles.archivedAt)),
            columns: { id: true },
          }));
      if (!live) {
        return {
          status: 'skipped' as const,
          reason: 'profile_archived',
          profileId,
        };
      }

      // [BUG-699-FOLLOWUP / BUG-839] Atomic dedup. Inngest's idempotency
      // key (event.id) covers exact-duplicate events within 24h, but an
      // operator replay or a re-fire with a *new* event.id would bypass it
      // and push the same recipient again — and the prior implementation
      // (getRecentNotificationCount → conditional send) was a read-then-write
      // pair: two concurrent step.run invocations could both observe
      // count===0 and both fire the push.
      //
      // checkAndLogRateLimitInternal wraps the count check and the log
      // insert in a single transaction with a pg_advisory_xact_lock keyed
      // on ('rate-limit:<profileId>:review_reminder'); concurrent callers
      // serialize on the lock and the second caller observes the first's
      // row. Mirrors the BUG-838 fix in daily-reminder-send.ts.
      //
      // [BUG-976 / CCR-PR129-M-3] Fail closed on DB error: skip this cycle
      // rather than throwing uncaught (which would cause Inngest to retry
      // indefinitely and block the notification pipeline). captureException
      // makes the failure queryable in Sentry so we can measure transient
      // DB hiccup frequency.
      let limited: boolean;
      try {
        limited = await checkAndLogRateLimitInternal(
          db,
          profileId,
          'review_reminder',
          { hours: 24, maxCount: 1 },
        );
      } catch (err) {
        captureException(err, {
          profileId,
          extra: {
            context: 'review-due-send:checkAndLogRateLimitInternal',
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

      // Resolve topic → curriculum → subject names for the push body
      let subjectNames: string[] = [];
      if (topTopicIds.length > 0) {
        const topicRows = await db
          .select({
            subjectName: subjects.name,
          })
          .from(curriculumTopics)
          .innerJoin(
            curriculumBooks,
            eq(curriculumBooks.id, curriculumTopics.bookId),
          )
          .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
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
          );

        // Deduplicate subject names (multiple topics may share a subject)
        subjectNames = [...new Set(topicRows.map((r) => r.subjectName))];
      }

      if (subjectNames.length === 0) {
        subjectNames = ['your subjects'];
      }

      const body = formatReviewReminderBody(overdueCount, subjectNames);

      // [BUG-839] checkAndLogRateLimitInternal already inserted the
      // notificationLog row in the same transaction that gated us — pass
      // skipRateLimitLog so sendPushNotification does not double-log this
      // push toward the daily cap.
      const sendResult = await sendPushNotification(
        db,
        {
          profileId,
          title: 'Topics fading',
          body,
          type: 'review_reminder',
        },
        { skipRateLimitLog: true },
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
          notificationType: 'review_reminder',
          reason: result.reason,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return result;
  },
);
