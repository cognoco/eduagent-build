// @inngest-admin: no-db (logging/Sentry observer; no DB access)
// ---------------------------------------------------------------------------
// Summary-Reconciliation Observability — observable terminus for two events
// emitted by summary-reconciliation-cron.ts:
//
//   app/summary.reconciliation.scanned   — emitted at start of each cron run
//   app/summary.reconciliation.requeued  — emitted when sessions are requeued
//
// Bug-369: both events fired into the void with no registered listener,
// making reconciliation throughput and SLO-requeue rates invisible in the
// Inngest dashboard. This module provides the observable terminus.
//
// Pattern mirrors ask-classification-observe.ts.
// ---------------------------------------------------------------------------

import {
  summaryReconciliationRequeuedEventSchema,
  summaryReconciliationScannedEventSchema,
  summarizeRawPayload,
} from '@eduagent/schemas';
import { inngest } from '../client';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const summaryReconciliationScannedObserve = inngest.createFunction(
  {
    id: 'summary-reconciliation-scanned-observe',
    name: 'Summary reconciliation scanned observability',
  },
  { event: 'app/summary.reconciliation.scanned' },
  async ({ event }) => {
    const parsed = summaryReconciliationScannedEventSchema.safeParse(
      event.data,
    );
    if (!parsed.success) {
      logger.error('summary.reconciliation.scanned.schema_drift', {
        issues: parsed.error.issues,
        rawData: summarizeRawPayload(event.data),
      });
      captureException(
        new Error(
          '[summary-reconciliation-scanned] invalid event payload — schema drift or bad event',
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

    logger.info('summary.reconciliation.scanned.received', {
      queryACount: data.queryACount,
      queryBCount: data.queryBCount,
      queryCCount: data.queryCCount,
      totalScanned: data.totalScanned,
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      totalScanned: data.totalScanned,
    };
  },
);

export const summaryReconciliationRequeuedObserve = inngest.createFunction(
  {
    id: 'summary-reconciliation-requeued-observe',
    name: 'Summary reconciliation requeued observability',
  },
  { event: 'app/summary.reconciliation.requeued' },
  async ({ event }) => {
    const parsed = summaryReconciliationRequeuedEventSchema.safeParse(
      event.data,
    );
    if (!parsed.success) {
      logger.error('summary.reconciliation.requeued.schema_drift', {
        issues: parsed.error.issues,
        rawData: summarizeRawPayload(event.data),
      });
      captureException(
        new Error(
          '[summary-reconciliation-requeued] invalid event payload — schema drift or bad event',
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

    logger.warn('summary.reconciliation.requeued.received', {
      queryARequeued: data.queryARequeued,
      queryBRequeued: data.queryBRequeued,
      queryCRequeued: data.queryCRequeued,
      totalRequeued: data.totalRequeued,
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      totalRequeued: data.totalRequeued,
    };
  },
);
