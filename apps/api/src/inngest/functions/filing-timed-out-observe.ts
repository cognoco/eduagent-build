import { and, count, desc, eq, lt, sql } from 'drizzle-orm';
import { learningSessions, sessionEvents } from '@eduagent/database';
import {
  filingResolvedEventSchema,
  filingRetryEventSchema,
  filingTimedOutEventSchema,
} from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';
import {
  formatFilingFailedPush,
  sendPushNotification,
} from '../../services/notifications';

const logger = createLogger();
const MAX_FILING_RETRIES = 3;

export const filingTimedOutObserve = inngest.createFunction(
  {
    id: 'filing-timed-out-observe',
    name: 'Filing timed-out observer + active reconciliation',
  },
  { event: 'app/session.filing_timed_out' },
  async ({ event, step }) => {
    const parsed = filingTimedOutEventSchema.parse(event.data);
    const { sessionId, profileId } = parsed;

    const snapshot = await step.run('capture-diagnostic-snapshot', async () => {
      const db = getStepDatabase();
      const session = await db.query.learningSessions.findFirst({
        where: and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.profileId, profileId)
        ),
      });
      const [{ count: eventCount } = { count: 0 }] = await db
        .select({ count: count() })
        .from(sessionEvents)
        .where(eq(sessionEvents.sessionId, sessionId));
      // [BUG-913 sweep] Tie-break by id when created_at collides — see
      // session-crud.ts getSessionTranscript for the full rationale.
      const lastEvent = await db.query.sessionEvents.findFirst({
        where: eq(sessionEvents.sessionId, sessionId),
        orderBy: [desc(sessionEvents.createdAt), desc(sessionEvents.id)],
      });

      return {
        sessionRow: session
          ? {
              topicId: session.topicId,
              filedAt: session.filedAt?.toISOString() ?? null,
              filingStatus: session.filingStatus,
              filingRetryCount: session.filingRetryCount,
              exchangeCount: session.exchangeCount,
              updatedAt: session.updatedAt.toISOString(),
            }
          : null,
        eventCount: Number(eventCount),
        lastEventAt: lastEvent?.createdAt.toISOString() ?? null,
        msSinceTimeoutDispatch:
          Date.now() - new Date(parsed.timestamp).getTime(),
      };
    });

    logger.warn('[filing-timed-out-observe] snapshot captured', {
      sessionId,
      profileId,
      ...snapshot,
    });

    const recheck = await step.run('re-read-session', async () => {
      const db = getStepDatabase();
      return db.query.learningSessions.findFirst({
        where: and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.profileId, profileId)
        ),
      });
    });

    if (recheck?.filedAt != null) {
      if (
        recheck.filingStatus === 'filing_failed' ||
        recheck.filingStatus === 'filing_pending'
      ) {
        await step.run('mark-recovered', async () => {
          const db = getStepDatabase();
          await db
            .update(learningSessions)
            .set({
              filingStatus: 'filing_recovered',
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(learningSessions.id, sessionId),
                eq(learningSessions.profileId, profileId)
              )
            );
        });
      }

      await step.sendEvent('emit-resolved', {
        name: 'app/session.filing_resolved',
        data: filingResolvedEventSchema.parse({
          sessionId,
          profileId,
          resolution: 'late_completion',
          timestamp: new Date().toISOString(),
        }),
      });

      return { resolution: 'late_completion' as const, snapshot };
    }

    let retryResult: unknown | null = null;
    const attemptNumber = await step.run(
      'mark-pending-and-claim-retry-slot',
      async () => {
        const db = getStepDatabase();
        const result = await db
          .update(learningSessions)
          .set({
            filingStatus: 'filing_pending',
            filingRetryCount: sql`${learningSessions.filingRetryCount} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(learningSessions.id, sessionId),
              eq(learningSessions.profileId, profileId),
              lt(learningSessions.filingRetryCount, MAX_FILING_RETRIES)
            )
          )
          .returning({
            filingRetryCount: learningSessions.filingRetryCount,
          });
        return result[0]?.filingRetryCount ?? null;
      }
    );

    if (attemptNumber != null) {
      const retryPayload = filingRetryEventSchema.parse({
        profileId,
        sessionId,
        sessionMode:
          recheck?.sessionType === 'homework' ? 'homework' : 'freeform',
      });

      await step.sendEvent('dispatch-filing-retry', {
        name: 'app/filing.retry',
        data: retryPayload,
      });

      await step.sendEvent('emit-auto-retry-attempted', {
        name: 'app/filing.auto_retry_attempted',
        data: {
          sessionId,
          profileId,
          attemptNumber,
          timestamp: new Date().toISOString(),
        },
      });

      retryResult = await step.waitForEvent('wait-for-retry-completion', {
        event: 'app/filing.retry_completed',
        match: 'data.sessionId',
        timeout: '60s',
      });
    }

    if (retryResult != null) {
      await step.run('mark-recovered-after-retry', async () => {
        const db = getStepDatabase();
        await db
          .update(learningSessions)
          .set({ filingStatus: 'filing_recovered', updatedAt: new Date() })
          .where(
            and(
              eq(learningSessions.id, sessionId),
              eq(learningSessions.profileId, profileId)
            )
          );
      });

      await step.sendEvent('emit-resolved', {
        name: 'app/session.filing_resolved',
        data: filingResolvedEventSchema.parse({
          sessionId,
          profileId,
          resolution: 'retry_succeeded',
          timestamp: new Date().toISOString(),
        }),
      });

      return { resolution: 'retry_succeeded' as const, snapshot };
    }

    // [CR-FIL-RACE-01] CAS guard: only flip to filing_failed when the status is
    // still filing_pending. If filing-completed-observe already set the status
    // to filing_recovered (race: retry succeeded AFTER the waitForEvent window
    // closed), the UPDATE will match 0 rows and we return early to avoid
    // permanently corrupting the recovered state.
    const markFailedResult = await step.run('mark-failed', async () => {
      const db = getStepDatabase();
      const result = await db
        .update(learningSessions)
        .set({ filingStatus: 'filing_failed', updatedAt: new Date() })
        .where(
          and(
            eq(learningSessions.id, sessionId),
            eq(learningSessions.profileId, profileId),
            eq(learningSessions.filingStatus, 'filing_pending')
          )
        )
        .returning({ id: learningSessions.id });
      return result.length > 0;
    });

    if (!markFailedResult) {
      // The status was already advanced (e.g. to filing_recovered) by a
      // concurrent filing-completed-observe run — the retry succeeded but
      // app/filing.retry_completed arrived after the 60 s waitForEvent window.
      // Do NOT overwrite the recovered state. Emit a structured event so ops
      // can query "how many sessions recovered after the wait window closed?"
      // against Inngest run history. [CR-FIL-SILENT-01]
      logger.info(
        '[filing-timed-out-observe] mark-failed no-op: status already advanced, treating as recovered_after_window',
        { sessionId, profileId }
      );
      await step.sendEvent('emit-resolved-recovered-after-window', {
        name: 'app/session.filing_resolved',
        data: filingResolvedEventSchema.parse({
          sessionId,
          profileId,
          resolution: 'recovered_after_window',
          timestamp: new Date().toISOString(),
        }),
      });
      return { resolution: 'recovered_after_window' as const, snapshot };
    }

    await step.sendEvent('emit-resolved', {
      name: 'app/session.filing_resolved',
      data: filingResolvedEventSchema.parse({
        sessionId,
        profileId,
        resolution: 'unrecoverable',
        timestamp: new Date().toISOString(),
      }),
    });

    await step.run('send-failure-push', async () => {
      const db = getStepDatabase();
      const { title, body } = formatFilingFailedPush();
      await sendPushNotification(db, {
        profileId,
        title,
        body,
        type: 'session_filing_failed',
      });
    });

    const escalation = new Error(
      `filing-timed-out-observe: retry failed for session ${sessionId}`
    );
    captureException(escalation, {
      profileId,
      extra: {
        sessionId,
        snapshot,
        retryAttempted: attemptNumber != null,
        hint: 'See Inngest run history for freeform-filing-retry filtered by sessionId for root cause.',
      },
    });

    return { resolution: 'unrecoverable' as const, snapshot };
  }
);
