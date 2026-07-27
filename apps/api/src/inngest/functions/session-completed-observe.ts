// @inngest-admin: no-db (logging/Sentry observer; no DB access)
// ---------------------------------------------------------------------------
// Session-Completed Observability — observable terminus for three events
// emitted by session-completed.ts (and summary-regenerate.ts for the
// summary signals):
//
//   app/session.completed_with_errors  — emitted when >=1 soft step fails
//   app/session.summary.generated      — emitted on successful LLM summary
//   app/session.summary.failed         — emitted when LLM summary is skipped
//
// Bug-369: all three fired into the void with no registered listener, making
// enrichment-degradation and summary-generation rates invisible in the
// Inngest dashboard. This module provides the observable terminus so a future
// alerting rule can page on rate spikes without instrumenting Sentry first.
//
// Pattern mirrors ask-classification-observe.ts.
// ---------------------------------------------------------------------------

import {
  sessionSummaryFailedEventSchema,
  sessionSummaryGeneratedEventSchema,
  sessionCompletedWithErrorsEventSchema,
  summarizeRawPayload,
} from '@eduagent/schemas';
import { inngest } from '../client';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const sessionSummaryGeneratedObserve = inngest.createFunction(
  {
    id: 'session-summary-generated-observe',
    name: 'Session summary generated observability',
  },
  { event: 'app/session.summary.generated' },
  async ({ event }) => {
    const parsed = sessionSummaryGeneratedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.error('session.summary.generated.schema_drift', {
        issues: parsed.error.issues,
        rawData: summarizeRawPayload(event.data),
      });
      captureException(
        new Error(
          '[session-summary-generated] invalid event payload — schema drift or bad event',
        ),
        {
          extra: {
            issues: parsed.error.issues,
            rawData: summarizeRawPayload(event.data),
          },
        },
      );
      return { status: 'schema_error' as const };
    }
    const data = parsed.data;

    logger.info('session.summary.generated.received', {
      profileId: data.profileId,
      sessionId: data.sessionId,
      sessionSummaryId: data.sessionSummaryId ?? null,
      sessionState: data.sessionState ?? null,
      topicsCount: data.topicsCount ?? null,
      narrativeLength: data.narrativeLength ?? null,
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      sessionId: data.sessionId,
      profileId: data.profileId,
    };
  },
);

export const sessionSummaryFailedObserve = inngest.createFunction(
  {
    id: 'session-summary-failed-observe',
    name: 'Session summary failed observability',
  },
  { event: 'app/session.summary.failed' },
  async ({ event }) => {
    const parsed = sessionSummaryFailedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.error('session.summary.failed.schema_drift', {
        issues: parsed.error.issues,
        rawData: summarizeRawPayload(event.data),
      });
      captureException(
        new Error(
          '[session-summary-failed] invalid event payload — schema drift or bad event',
        ),
        {
          extra: {
            issues: parsed.error.issues,
            rawData: summarizeRawPayload(event.data),
          },
        },
      );
      return { status: 'schema_error' as const };
    }
    const data = parsed.data;

    logger.warn('session.summary.failed.received', {
      profileId: data.profileId,
      sessionId: data.sessionId,
      sessionSummaryId: data.sessionSummaryId ?? null,
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      sessionId: data.sessionId,
      profileId: data.profileId,
    };
  },
);

export const sessionCompletedWithErrorsObserve = inngest.createFunction(
  {
    id: 'session-completed-with-errors-observe',
    name: 'Session completed with errors observability',
  },
  { event: 'app/session.completed_with_errors' },
  async ({ event }) => {
    const parsed = sessionCompletedWithErrorsEventSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.error('session.completed_with_errors.schema_drift', {
        issues: parsed.error.issues,
        rawData: summarizeRawPayload(event.data),
      });
      captureException(
        new Error(
          '[session-completed-with-errors] invalid event payload — schema drift or bad event',
        ),
        {
          extra: {
            issues: parsed.error.issues,
            rawData: summarizeRawPayload(event.data),
          },
        },
      );
      return { status: 'schema_error' as const };
    }
    const data = parsed.data;

    logger.warn('session.completed_with_errors.received', {
      profileId: data.profileId,
      sessionId: data.sessionId,
      failedStepCount: data.failedSteps.length,
      failedSteps: data.failedSteps.map((s) => s.step),
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      sessionId: data.sessionId,
      profileId: data.profileId,
      failedStepCount: data.failedSteps.length,
    };
  },
);
