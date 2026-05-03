import { Sentry } from './sentry';

export type HomeworkOcrGateSource = 'local' | 'server';
export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

export type HomeworkOcrGateTelemetry = {
  source?: HomeworkOcrGateSource;
  tokens: number;
  words: number;
  confidence?: number;
  droppedCount?: number;
};

function emitHomeworkOcrGateEvent(
  event: string,
  payload: HomeworkOcrGateTelemetry
): void {
  Sentry.withScope((scope) => {
    scope.setTag('event', event);
    scope.setContext('homework_ocr_gate', {
      ...payload,
      ...(payload.confidence == null
        ? {}
        : { confidence: Number(payload.confidence.toFixed(3)) }),
    });
    Sentry.captureMessage(event, 'info');
  });
}

export function track(
  event: string,
  properties: AnalyticsProperties = {}
): void {
  Sentry.withScope((scope) => {
    scope.setTag('analytics_event', event);
    scope.setContext('analytics', { event, ...properties });
    Sentry.captureMessage(event, 'info');
  });
}

export function trackHomeworkOcrGateAccepted(
  payload: HomeworkOcrGateTelemetry & { source: HomeworkOcrGateSource }
): void {
  emitHomeworkOcrGateEvent('homework_ocr_gate_accepted', payload);
}

export function trackHomeworkOcrGateRejected(
  payload: HomeworkOcrGateTelemetry & { source: HomeworkOcrGateSource }
): void {
  emitHomeworkOcrGateEvent('homework_ocr_gate_rejected', payload);
}

export function trackHomeworkOcrGateShortcircuit(
  payload: HomeworkOcrGateTelemetry
): void {
  emitHomeworkOcrGateEvent('homework_ocr_gate_shortcircuit', payload);
}
