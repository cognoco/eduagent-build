// @inngest-admin: no-db (logging/Sentry observer; no DB access)
// ---------------------------------------------------------------------------
// Transcript-Purge Observability — observable terminus for four events
// emitted by transcript-purge-cron.ts:
//
//   app/session.purge.delayed            — sessions past day-37 with incomplete purge prerequisites
//   app/session.purge.backlog            — eligible volume above daily dispatch capacity
//   app/session.transcript.purged        — successful purge (SLO success signal)
//   app/session.transcript.purge.skipped — purge skipped (missing preconditions)
//
// Bug-369: the original three fired into the void with no registered listener. Purge
// success/skip rates and delayed-purge counts were completely invisible in the
// Inngest dashboard. This module provides the observable terminus.
//
// Pattern mirrors ask-classification-observe.ts.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import {
  sessionPurgeBacklogEventSchema,
  sessionPurgeDelayedEventSchema,
  sessionTranscriptPurgedEventSchema,
  summarizeRawPayload,
} from '@eduagent/schemas';
import { inngest } from '../client';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Inline schema for the skipped event (not yet in @eduagent/schemas)
// ---------------------------------------------------------------------------

const sessionTranscriptPurgeSkippedEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string(),
  reason: z.string(),
  missingPreconditions: z.array(z.string()).optional(),
  timestamp: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const sessionPurgeDelayedObserve = inngest.createFunction(
  {
    id: 'session-purge-delayed-observe',
    name: 'Session purge delayed observability',
  },
  { event: 'app/session.purge.delayed' },
  async ({ event }) => {
    const parsed = sessionPurgeDelayedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.error('session.purge.delayed.schema_drift', {
        issues: parsed.error.issues,
        rawData: summarizeRawPayload(event.data),
      });
      captureException(
        new Error(
          '[session-purge-delayed] invalid event payload — schema drift or bad event',
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

    logger.warn('session.purge.delayed.received', {
      delayedCount: data.delayedCount,
      missingPreconditionCount: data.missingPreconditionCount,
      nullSummaryGeneratedAtCount: data.nullSummaryGeneratedAtCount,
      sessionIdSample: data.sessionIds.slice(0, 5),
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      delayedCount: data.delayedCount,
    };
  },
);

export const sessionPurgeBacklogObserve = inngest.createFunction(
  {
    id: 'session-purge-backlog-observe',
    name: 'Session purge backlog observability',
  },
  { event: 'app/session.purge.backlog' },
  async ({ event }) => {
    const parsed = sessionPurgeBacklogEventSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.error('session.purge.backlog.schema_drift', {
        issues: parsed.error.issues,
        rawData: summarizeRawPayload(event.data),
      });
      captureException(
        new Error(
          '[session-purge-backlog] invalid event payload — schema drift or bad event',
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

    logger.warn('session.purge.backlog.received', {
      dailyCapacity: data.dailyCapacity,
      minimumEligibleCount: data.minimumEligibleCount,
      minimumDeferredCount: data.minimumDeferredCount,
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      minimumEligibleCount: data.minimumEligibleCount,
    };
  },
);

export const sessionTranscriptPurgedObserve = inngest.createFunction(
  {
    id: 'session-transcript-purged-observe',
    name: 'Session transcript purged observability',
  },
  { event: 'app/session.transcript.purged' },
  async ({ event }) => {
    const parsed = sessionTranscriptPurgedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.error('session.transcript.purged.schema_drift', {
        issues: parsed.error.issues,
        rawData: summarizeRawPayload(event.data),
      });
      captureException(
        new Error(
          '[session-transcript-purged] invalid event payload — schema drift or bad event',
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

    logger.info('session.transcript.purged.received', {
      profileId: data.profileId,
      sessionId: data.sessionId,
      sessionSummaryId: data.sessionSummaryId ?? null,
      eventsDeleted: data.eventsDeleted,
      embeddingRowsReplaced: data.embeddingRowsReplaced,
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      sessionId: data.sessionId,
      profileId: data.profileId,
      eventsDeleted: data.eventsDeleted,
    };
  },
);

export const sessionTranscriptPurgeSkippedObserve = inngest.createFunction(
  {
    id: 'session-transcript-purge-skipped-observe',
    name: 'Session transcript purge skipped observability',
  },
  { event: 'app/session.transcript.purge.skipped' },
  async ({ event }) => {
    const parsed = sessionTranscriptPurgeSkippedEventSchema.safeParse(
      event.data,
    );
    if (!parsed.success) {
      logger.error('session.transcript.purge.skipped.schema_drift', {
        issues: parsed.error.issues,
        rawData: summarizeRawPayload(event.data),
      });
      captureException(
        new Error(
          '[session-transcript-purge-skipped] invalid event payload — schema drift or bad event',
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

    logger.warn('session.transcript.purge.skipped.received', {
      profileId: data.profileId,
      sessionId: data.sessionId,
      reason: data.reason,
      missingPreconditions: data.missingPreconditions ?? [],
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      sessionId: data.sessionId,
      profileId: data.profileId,
      reason: data.reason,
    };
  },
);
