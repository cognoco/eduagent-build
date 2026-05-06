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

export function hashProfileId(profileId: string): string {
  const secret =
    process.env.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1 ?? 'local-analytics-key-v1';
  const input = `${secret}:${profileId}`;
  let low = 0x811c9dc5;
  let high = 0x27d4eb2d;
  for (let i = 0; i < input.length; i += 1) {
    const char = input.charCodeAt(i);
    low = Math.imul(low ^ char, 0x01000193);
    high = Math.imul(high ^ char, 0x85ebca6b);
  }
  return `v2_${(high >>> 0).toString(16).padStart(8, '0')}${(low >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

export function bucketAccountAge(createdAt: string | null | undefined): string {
  if (!createdAt) return '0-7';
  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return '0-7';
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - createdAtMs) / 86_400_000)
  );
  if (ageDays <= 7) return '0-7';
  if (ageDays <= 30) return '8-30';
  if (ageDays <= 90) return '31-90';
  return '91+';
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
