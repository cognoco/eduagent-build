// @inngest-admin: no-db (logging/Sentry observer; no DB access)
// ---------------------------------------------------------------------------
// Filing Observability — observable terminus for two events emitted by
// filing-timed-out-observe.ts and filing-completed-observe.ts:
//
//   app/session.filing_resolved     — terminal state reached after a filing
//                                     timeout (late_completion, retry_succeeded,
//                                     unrecoverable, recovered, recovered_after_window)
//   app/filing.auto_retry_attempted — emitted each time the observer claims a
//                                     retry slot and dispatches app/filing.retry
//
// Bug-369: both events fired into the void. app/session.filing_resolved is
// the canonical terminus for the filing-timeout -> retry -> resolution flow -
// without a listener, the resolution distribution (how often retries succeed,
// how often sessions become unrecoverable) is invisible. app/filing.auto_retry_attempted
// tracks how many times the watchdog consumed a retry slot, which is critical
// for the MAX_FILING_RETRIES cap correctness audit.
//
// Schemas live in @eduagent/schemas:
//   filingResolvedEventSchema -- already exported (used by both emitters).
//
// Pattern mirrors ask-classification-observe.ts.
// ---------------------------------------------------------------------------

import {
  filingResolvedEventSchema,
  filingAutoRetryAttemptedEventSchema,
  summarizeRawPayload,
} from '@eduagent/schemas';
import { inngest } from '../client';
import { createLogger } from '../../services/logger';
import { captureException, captureMessage } from '../../services/sentry';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const sessionFilingResolvedObserve = inngest.createFunction(
  {
    id: 'session-filing-resolved-observe',
    name: 'Session filing resolved observability',
  },
  { event: 'app/session.filing_resolved' },
  async ({ event }) => {
    const parsed = filingResolvedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.error('session.filing_resolved.schema_drift', {
        issues: parsed.error.issues,
        rawData: summarizeRawPayload(event.data),
      });
      captureException(
        new Error(
          '[session-filing-resolved] invalid event payload — schema drift or bad event',
        ),
        {
          tags: { surface: 'filing', signal: 'schema-drift' },
          extra: {
            issues: parsed.error.issues,
            rawData: summarizeRawPayload(event.data),
          },
        },
      );
      return { status: 'schema_error' as const };
    }

    const data = parsed.data;
    if (data.resolution === 'unrecoverable') {
      captureMessage('session.filing_resolved', {
        level: 'error',
        tags: {
          surface: 'filing',
          signal: 'resolved',
          resolution: data.resolution,
        },
        extra: {
          sessionId: data.sessionId,
          eventTimestamp: data.timestamp,
        },
      });
    }
    // Level varies by resolution:
    //   unrecoverable -> error (session data permanently un-filed)
    //   late_completion / retry_succeeded / recovered / recovered_after_window -> info
    if (data.resolution === 'unrecoverable') {
      logger.error('session.filing_resolved.received', {
        sessionId: data.sessionId,
        profileId: data.profileId,
        resolution: data.resolution,
        receivedAt: new Date().toISOString(),
      });
    } else {
      logger.info('session.filing_resolved.received', {
        sessionId: data.sessionId,
        profileId: data.profileId,
        resolution: data.resolution,
        receivedAt: new Date().toISOString(),
      });
    }

    return {
      status: 'logged' as const,
      sessionId: data.sessionId,
      resolution: data.resolution,
    };
  },
);

export const filingAutoRetryAttemptedObserve = inngest.createFunction(
  {
    id: 'filing-auto-retry-attempted-observe',
    name: 'Filing auto retry attempted observability',
  },
  { event: 'app/filing.auto_retry_attempted' },
  async ({ event }) => {
    const parsed = filingAutoRetryAttemptedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.error('filing.auto_retry_attempted.schema_drift', {
        issues: parsed.error.issues,
        rawData: summarizeRawPayload(event.data),
      });
      captureException(
        new Error(
          '[filing-auto-retry-attempted] invalid event payload — schema drift or bad event',
        ),
        {
          tags: { surface: 'filing', signal: 'schema-drift' },
          extra: {
            issues: parsed.error.issues,
            rawData: summarizeRawPayload(event.data),
          },
        },
      );
      return { status: 'schema_error' as const };
    }
    const data = parsed.data;

    // Warn-level: auto-retries indicate the primary filing path timed out.
    // A rate spike signals upstream filing latency or systematic failures.
    logger.warn('filing.auto_retry_attempted.received', {
      sessionId: data.sessionId,
      profileId: data.profileId,
      attemptNumber: data.attemptNumber,
      receivedAt: new Date().toISOString(),
    });
    captureMessage('filing.auto_retry_attempted', {
      level: 'warning',
      tags: { surface: 'filing', signal: 'auto-retry-attempted' },
      extra: {
        sessionId: data.sessionId,
        attemptNumber: data.attemptNumber,
        eventTimestamp: data.timestamp,
      },
    });

    return {
      status: 'logged' as const,
      sessionId: data.sessionId,
      attemptNumber: data.attemptNumber,
    };
  },
);
