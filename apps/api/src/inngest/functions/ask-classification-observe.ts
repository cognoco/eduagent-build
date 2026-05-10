// ---------------------------------------------------------------------------
// Ask Classification Observability — observable terminus for the three
// app/ask.classification_{skipped,completed,failed} events emitted by
// ask-silent-classify.ts. [BUG-836 / F-SVC-002]
//
// Pre-fix: ask-silent-classify fanned out three signals (skipped / completed
// / failed) but no consumer existed, so the analytics + escalation channel
// for the silent-classification feature was silently dropped. Especially bad
// for the _failed event, which is the onFailure escalation handler's only
// observable surface — its loss meant terminal classification failures
// vanished entirely.
//
// This module wires three handlers (one per event) so each fan-out has a
// real listener and produces a queryable structured log. A real analytics
// pipeline / drift alerting is intentionally deferred.
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';
import {
  classificationCompletedEventSchema,
  classificationSkippedEventSchema,
  classificationFailedEventSchema,
} from '@eduagent/schemas';

const logger = createLogger();

export const askClassificationCompletedObserve = inngest.createFunction(
  {
    id: 'ask-classification-completed-observe',
    name: 'Ask classification completed observability',
  },
  { event: 'app/ask.classification_completed' },
  async ({ event }) => {
    const parsed = classificationCompletedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn('ask.classification_completed.invalid_payload', {
        issues: parsed.error.issues,
      });
      captureException(
        new Error(
          '[ask-classification-completed] invalid event payload — schema drift or bad event',
        ),
        { extra: { issues: parsed.error.issues, rawData: event.data } },
      );
      return { status: 'skipped' as const, reason: 'invalid_payload' };
    }
    const data = parsed.data;
    logger.info('ask.classification_completed.received', {
      sessionId: data.sessionId ?? 'unknown',
      exchangeCount: data.exchangeCount ?? 0,
      subjectId: data.subjectId ?? 'unknown',
      subjectName: data.subjectName ?? 'unknown',
      confidence: data.confidence ?? null,
    });
    return {
      status: 'logged' as const,
      sessionId: data.sessionId ?? null,
      analyticsDeferred: 'pending_classification_analytics_pipeline',
    };
  },
);

export const askClassificationSkippedObserve = inngest.createFunction(
  {
    id: 'ask-classification-skipped-observe',
    name: 'Ask classification skipped observability',
  },
  { event: 'app/ask.classification_skipped' },
  async ({ event }) => {
    const parsed = classificationSkippedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn('ask.classification_skipped.invalid_payload', {
        issues: parsed.error.issues,
      });
      captureException(
        new Error(
          '[ask-classification-skipped] invalid event payload — schema drift or bad event',
        ),
        { extra: { issues: parsed.error.issues, rawData: event.data } },
      );
      return { status: 'skipped' as const, reason: 'invalid_payload' };
    }
    const data = parsed.data;
    logger.info('ask.classification_skipped.received', {
      sessionId: data.sessionId ?? 'unknown',
      exchangeCount: data.exchangeCount ?? 0,
      reason: data.reason ?? 'unknown',
      topConfidence: data.topConfidence ?? null,
    });
    return {
      status: 'logged' as const,
      sessionId: data.sessionId ?? null,
      reason: data.reason ?? 'unknown',
      analyticsDeferred: 'pending_classification_analytics_pipeline',
    };
  },
);

export const askClassificationFailedObserve = inngest.createFunction(
  {
    id: 'ask-classification-failed-observe',
    name: 'Ask classification failed observability',
  },
  { event: 'app/ask.classification_failed' },
  async ({ event }) => {
    const parsed = classificationFailedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.error('ask.classification_failed.invalid_payload', {
        issues: parsed.error.issues,
      });
      captureException(
        new Error(
          '[ask-classification-failed] invalid event payload — schema drift or bad event',
        ),
        { extra: { issues: parsed.error.issues, rawData: event.data } },
      );
      return { status: 'skipped' as const, reason: 'invalid_payload' };
    }
    const data = parsed.data;
    // Error-level so a future on-call rule can page on rate spikes — this
    // is the terminal-failure escalation channel, the most consequential
    // of the three signals.
    logger.error('ask.classification_failed.received', {
      sessionId: data.sessionId ?? 'unknown',
      exchangeCount: data.exchangeCount ?? 0,
      error: data.error ?? 'unknown',
    });
    return {
      status: 'logged' as const,
      sessionId: data.sessionId ?? null,
      error: data.error ?? 'unknown',
      escalationDeferred: 'pending_classification_failure_alerting',
    };
  },
);
