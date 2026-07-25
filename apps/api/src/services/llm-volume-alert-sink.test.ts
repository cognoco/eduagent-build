import {
  emitLlmVolumeAlertProbe,
  forwardLaunchHealthAlertToSink,
  forwardLlmVolumeAlertToSink,
  scrubLaunchHealthSentryLog,
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

describe('emitLlmVolumeAlertProbe', () => {
  it('constructs and emits the canonical bounded probe alert', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-24T12:34:56.789Z'));
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    try {
      expect(emitLlmVolumeAlertProbe('production')).toEqual({
        emitted: true,
        provider: 'synthetic-operator-probe',
        emittedAt: '2026-07-24T12:34:56.789Z',
        utcDate: '2026-07-24',
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(warnSpy.mock.calls[0]?.[0]))).toMatchObject({
        level: 'warn',
        message: 'llm.volume.daily_threshold_exceeded',
        context: {
          event: 'llm.volume.daily_threshold_exceeded',
          surface: 'llm_volume_alert',
          provider: 'synthetic-operator-probe',
          environment: 'production',
          count: 1,
          threshold: 1,
          utc_date: '2026-07-24',
        },
      });
    } finally {
      warnSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});

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

describe('LLM fallback-rate alert transport', () => {
  const fallbackContext = {
    event: 'llm.fallback_rate_threshold_exceeded',
    surface: 'llm_fallback_rate',
    signal: 'fallback-rate-threshold',
    tier: 'page',
    environment: 'production',
    numerator: 3,
    denominator: 20,
    rate_pct: 15,
    window_seconds: 900,
    minimum_calls: 20,
    warn_threshold_pct: 2,
    page_threshold_pct: 10,
    provider: 'openai',
    capability: 'text',
  };

  it('forwards the bounded threshold contract and drops attached private fields', () => {
    const send = jest.fn();

    forwardLaunchHealthAlertToSink(
      {
        timestamp: '2026-07-25T10:00:00.000Z',
        level: 'warn',
        message: 'llm.fallback_rate_threshold_exceeded',
        context: {
          ...fallbackContext,
          session_id: 'private',
          prompt: 'private',
          content: 'private',
        },
      },
      send,
    );

    expect(send).toHaveBeenCalledWith(
      'llm.fallback_rate_threshold_exceeded',
      fallbackContext,
    );
  });

  it('rebuilds the fallback-rate allowlist after SDK enrichment', () => {
    expect(
      scrubLaunchHealthSentryLog({
        level: 'warn',
        message: 'llm.fallback_rate_threshold_exceeded',
        attributes: {
          ...fallbackContext,
          'user.id': 'private',
          'sentry.trace.parent_span_id': 'private',
        },
      }),
    ).toEqual({
      level: 'warn',
      message: 'llm.fallback_rate_threshold_exceeded',
      attributes: fallbackContext,
    });
  });
});
