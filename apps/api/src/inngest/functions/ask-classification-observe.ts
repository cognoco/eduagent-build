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

const logger = createLogger();

interface ClassificationCompletedData {
  sessionId?: string;
  exchangeCount?: number;
  subjectId?: string;
  subjectName?: string;
  confidence?: number;
}

interface ClassificationSkippedData {
  sessionId?: string;
  exchangeCount?: number;
  reason?: string;
  topConfidence?: number;
}

interface ClassificationFailedData {
  sessionId?: string;
  exchangeCount?: number;
  error?: string;
}

export const askClassificationCompletedObserve = inngest.createFunction(
  {
    id: 'ask-classification-completed-observe',
    name: 'Ask classification completed observability',
  },
  { event: 'app/ask.classification_completed' },
  async ({ event }) => {
    const data = event.data as ClassificationCompletedData;
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
  }
);

export const askClassificationSkippedObserve = inngest.createFunction(
  {
    id: 'ask-classification-skipped-observe',
    name: 'Ask classification skipped observability',
  },
  { event: 'app/ask.classification_skipped' },
  async ({ event }) => {
    const data = event.data as ClassificationSkippedData;
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
  }
);

export const askClassificationFailedObserve = inngest.createFunction(
  {
    id: 'ask-classification-failed-observe',
    name: 'Ask classification failed observability',
  },
  { event: 'app/ask.classification_failed' },
  async ({ event }) => {
    const data = event.data as ClassificationFailedData;
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
  }
);
