import {
  forwardLlmVolumeAlertToSink,
  scrubLlmVolumeAlertSentryLog,
} from './llm-volume-alert-sink';
import type { LogEntry } from './logger';

const canonicalContext = {
  event: 'llm.volume.daily_threshold_exceeded',
  surface: 'llm_volume_alert',
  provider: 'openai',
  environment: 'production',
  count: 5000,
  threshold: 5000,
  utc_date: '2026-07-24',
};

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: '2026-07-24T12:00:00.000Z',
    level: 'warn',
    message: 'llm.volume.daily_threshold_exceeded',
    context: canonicalContext,
    ...overrides,
  };
}

describe('forwardLlmVolumeAlertToSink', () => {
  it('forwards only the canonical bounded fields to the alert sink', () => {
    const send = jest.fn();

    forwardLlmVolumeAlertToSink(
      entry({
        context: {
          ...canonicalContext,
          rawInput: 'learner free text must never leave the process',
          content: 'raw LLM output must never leave the process',
          sessionId: 'not required by the alert contract',
        },
      }),
      send,
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      'llm.volume.daily_threshold_exceeded',
      canonicalContext,
    );
  });

  it('ignores unrelated structured warnings', () => {
    const send = jest.fn();

    forwardLlmVolumeAlertToSink(
      entry({
        message: 'llm.provider.fallback',
        context: { event: 'llm.provider.fallback', rawInput: 'private' },
      }),
      send,
    );

    expect(send).not.toHaveBeenCalled();
  });

  it('fails closed when a required canonical field has the wrong type', () => {
    const send = jest.fn();

    forwardLlmVolumeAlertToSink(
      entry({
        context: {
          ...canonicalContext,
          count: '5000',
        },
      }),
      send,
    );

    expect(send).not.toHaveBeenCalled();
  });

  it('rebuilds the allowlist after Sentry SDK enrichment', () => {
    expect(
      scrubLlmVolumeAlertSentryLog({
        level: 'warn',
        message: 'llm.volume.daily_threshold_exceeded',
        attributes: {
          ...canonicalContext,
          'user.id': 'learner-id',
          'sentry.sdk.name': 'sentry.javascript.cloudflare',
          'sentry.sdk.version': '10.39.0',
          'sentry.trace.parent_span_id': 'span-id',
        },
      }),
    ).toEqual({
      level: 'warn',
      message: 'llm.volume.daily_threshold_exceeded',
      attributes: canonicalContext,
    });
  });

  it('drops unrelated direct Sentry logs at the final boundary', () => {
    expect(
      scrubLlmVolumeAlertSentryLog({
        level: 'warn',
        message: 'llm.provider.fallback',
        attributes: canonicalContext,
      }),
    ).toBeNull();
  });
});
