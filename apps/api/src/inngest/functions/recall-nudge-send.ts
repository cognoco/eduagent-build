// @inngest-admin: parent-chain (curriculumTopics looked up by IDs from event; familyLinks enforced by profileId)
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import {
  curriculumBooks,
  curricula,
  curriculumTopics,
  familyLinks,
  profiles,
  subjects,
} from '@eduagent/database';
import { resolveProfileRole } from '../../services/profile';
import {
  formatRecallNudge,
  sendPushNotification,
} from '../../services/notifications';
import { checkAndLogRateLimitInternal } from '../../services/settings';
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

      const activeProfile = await db.query.profiles.findFirst({
        where: and(eq(profiles.id, profileId), isNull(profiles.archivedAt)),
        columns: { id: true },
      });
      if (!activeProfile) {
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
          { hours: 24, maxCount: 1 },
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
      const role = await resolveProfileRole(db, profileId);

      // For guardians, look up child name
      let childName: string | undefined;
      if (role === 'guardian') {
        const childLink = await db.query.familyLinks.findFirst({
          where: eq(familyLinks.parentProfileId, profileId),
        });
        if (childLink) {
          const childProfile = await db.query.profiles.findFirst({
            where: and(
              eq(profiles.id, childLink.childProfileId),
              isNull(profiles.archivedAt),
            ),
          });
          childName = childProfile?.displayName ?? undefined;
        }
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
          notificationType: 'recall_nudge',
          reason: result.reason,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return result;
  },
);
