// @inngest-admin: parent-chain (learningSessions.profileId enforced in WHERE)
import { and, count, desc, eq, lt, sql } from 'drizzle-orm';
import { learningSessions, sessionEvents } from '@eduagent/database';
import {
  filingResolvedEventSchema,
  filingRetryEventSchema,
  filingTimedOutEventSchema,
  getSessionEffectiveMode,
  sessionAutoFileRequestedEventSchema,
  summarizeRawPayload,
} from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';
import {
  formatFilingFailedPush,
  sendPushNotification,
} from '../../services/notifications';
import { getRecentNotificationCount } from '../../services/settings';

const logger = createLogger();
const MAX_FILING_RETRIES = 3;

export const filingTimedOutObserve = inngest.createFunction(
  {
    id: 'filing-timed-out-observe',
    name: 'Filing timed-out observer + active reconciliation',
    // [FIX-INNGEST-BUG-424] Idempotency: duplicate app/session.filing_timed_out
    // events (operator replay, double-dispatch, backfill re-fire) dedup within
    // 24 h so only one execution runs per sessionId. concurrency(limit:1)
    // serialises any concurrent runs that arrive before Inngest can deduplicate
    // them, preventing parallel mark-pending-and-claim-retry-slot calls from
    // incrementing filingRetryCount twice and dispatching two app/filing.retry
    // events for the same session.
    idempotency: 'event.data.sessionId',
    concurrency: { key: 'event.data.sessionId', limit: 1 },
  },
  { event: 'app/session.filing_timed_out' },
  async ({ event, step }) => {
    const parsedResult = filingTimedOutEventSchema.safeParse(event.data);
    if (!parsedResult.success) {
      captureException(
        new Error(
          `filing-timed-out-observe: invalid payload - ${parsedResult.error.message}`,
        ),
        {
          extra: {
            site: 'filingTimedOutObserve.invalid_payload',
            issues: parsedResult.error.issues,
            rawData: summarizeRawPayload(event.data),
          },
        },
      );
      logger.warn('filing_timed_out_observe.invalid_payload', {
        issues: parsedResult.error.issues,
      });
      return {
        status: 'invalid_payload' as const,
        error: parsedResult.error.message,
      };
    }

    const parsed = parsedResult.data;
    const { sessionId, profileId } = parsed;

    const snapshot = await step.run('capture-diagnostic-snapshot', async () => {
      const db = getStepDatabase();
      const session = await db.query.learningSessions.findFirst({
        where: and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.profileId, profileId),
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
          eq(learningSessions.profileId, profileId),
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
                eq(learningSessions.profileId, profileId),
              ),
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
              lt(learningSessions.filingRetryCount, MAX_FILING_RETRIES),
            ),
          )
          .returning({
            filingRetryCount: learningSessions.filingRetryCount,
          });
        return result[0]?.filingRetryCount ?? null;
      },
    );

    if (attemptNumber != null) {
      if (getSessionEffectiveMode(recheck ?? {}) === 'freeform') {
        const dispatchId = `observer-retry-${attemptNumber}-${Date.now()}`;
        const retryPayload = sessionAutoFileRequestedEventSchema.parse({
          profileId,
          sessionId,
          requestedAt: new Date().toISOString(),
          reason: 'retry',
          dispatchId,
        });

        await step.sendEvent('dispatch-filing-retry', {
          id: `auto-file-${sessionId}-${dispatchId}`,
          name: 'app/session.auto_file_requested',
          data: retryPayload,
        });
      } else {
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
      }

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
              eq(learningSessions.profileId, profileId),
            ),
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
            eq(learningSessions.filingStatus, 'filing_pending'),
          ),
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
        { sessionId, profileId },
      );

      // [H-2 / INNGEST-NESTED-STEP] Re-read the row inside one `step.run` that
      // returns only data — NO step tooling is invoked inside it. Inngest's
      // step tools (`step.sendEvent`, `step.run`, ...) must run at the top
      // level of the function body; calling `step.sendEvent` inside a
      // `step.run` callback throws a nesting error on the real executor. The
      // earlier [H-2] revision nested the send inside this run step (and
      // reused the same step id), which would throw whenever the CAS no-op
      // branch was hit. Here the re-read step returns `{ shouldEmit }` and the
      // dispatch is hoisted to the function-body level below.
      //
      // [line-243] The CAS no-op could also occur if the row was deleted or
      // transitioned to some other terminal state — only emit
      // 'recovered_after_window' when the row is genuinely filing_recovered.
      const recoveredAfterWindow = await step.run(
        're-read-recovered-after-window',
        async () => {
          const db = getStepDatabase();
          const currentRow = await db.query.learningSessions.findFirst({
            where: and(
              eq(learningSessions.id, sessionId),
              eq(learningSessions.profileId, profileId),
            ),
          });

          if (currentRow?.filingStatus !== 'filing_recovered') {
            logger.warn(
              '[filing-timed-out-observe] CAS no-op but row is not filing_recovered — skipping recovered_after_window emit',
              {
                sessionId,
                profileId,
                filingStatus: currentRow?.filingStatus ?? 'row_missing',
              },
            );
            return { shouldEmit: false, reason: 'not_recovered' as const };
          }

          return { shouldEmit: true, reason: 'recovered' as const };
        },
      );

      if (recoveredAfterWindow.shouldEmit) {
        // The payload is fixed/deterministic, so a Zod parse throw here cannot
        // loop forever — Inngest would retry the whole function but the CAS
        // re-read above is replay-stable (memoized) and the parse input never
        // changes. Wrap the parse defensively so a malformed schema surfaces
        // via Sentry rather than escaping as an opaque function failure.
        try {
          const payload = filingResolvedEventSchema.parse({
            sessionId,
            profileId,
            resolution: 'recovered_after_window',
            timestamp: new Date().toISOString(),
          });
          await step.sendEvent('emit-resolved-recovered-after-window', {
            name: 'app/session.filing_resolved',
            data: payload,
          });
        } catch (parseErr) {
          captureException(parseErr as Error, {
            profileId,
            extra: {
              sessionId,
              hint: 'filingResolvedEventSchema parse failed in recovered_after_window emit',
            },
          });
          logger.warn(
            '[filing-timed-out-observe] filingResolvedEventSchema parse failed — recovered_after_window event not emitted',
            { sessionId, profileId },
          );
        }
      }

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
      // [BUG-699-FOLLOWUP] 24h notification-log dedup. A duplicate
      // `app/session.filing_timed_out` event (operator re-fire, retry past
      // the waitForEvent window) would otherwise re-push the same "filing
      // failed" message to the user.
      const recentCount = await getRecentNotificationCount(
        db,
        profileId,
        'session_filing_failed',
        24,
      );
      if (recentCount > 0) {
        return { sent: false, reason: 'dedup_24h' };
      }
      const { title, body } = formatFilingFailedPush();
      // [line-278] Wrap sendPushNotification in try/catch so a notification
      // failure does not propagate out of step.run and trigger a full function
      // retry. The session is already permanently marked filing_failed at this
      // point — a push failure is non-fatal.
      try {
        await sendPushNotification(db, {
          profileId,
          title,
          body,
          type: 'session_filing_failed',
        });
        return { sent: true };
      } catch (pushErr) {
        captureException(pushErr as Error, {
          profileId,
          extra: {
            sessionId,
            hint: 'sendPushNotification failed in send-failure-push step',
          },
        });
        return { sent: false, reason: 'push_error' };
      }
    });

    const escalation = new Error(
      `filing-timed-out-observe: retry failed for session ${sessionId}`,
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
  },
);
