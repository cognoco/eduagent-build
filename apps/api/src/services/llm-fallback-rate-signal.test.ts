import {
  createLlmFallbackRateTracker,
  type LlmFallbackRateSignal,
} from './llm-fallback-rate-signal';

describe('LLM fallback-rate launch-health signal', () => {
  let nowMs = Date.parse('2026-07-25T10:00:00.000Z');
  let emitted: LlmFallbackRateSignal[];

  beforeEach(() => {
    emitted = [];
  });

  function tracker() {
    return createLlmFallbackRateTracker({
      now: () => nowMs,
      emit: (signal) => emitted.push(signal),
    });
  }

  function recordCalls(
    monitor: ReturnType<typeof tracker>,
    total: number,
    fallbacks: number,
  ): void {
    for (let index = 0; index < total; index++) {
      monitor.record({
        environment: 'production',
        fallbackUsed: index < fallbacks,
        provider: index < fallbacks ? 'openai' : 'cerebras',
        capability: 'text',
      });
    }
  }

  it('does not evaluate before the 20-call minimum volume', () => {
    const monitor = tracker();

    recordCalls(monitor, 19, 19);

    expect(emitted).toEqual([]);
  });

  it('warns above 2% but does not warn at exactly 2%', () => {
    const boundary = tracker();
    recordCalls(boundary, 49, 0);
    boundary.record({
      environment: 'production',
      fallbackUsed: true,
      provider: 'openai',
      capability: 'text',
    });
    expect(emitted).toEqual([]);

    const above = tracker();
    recordCalls(above, 20, 1);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      event: 'llm.fallback_rate_threshold_exceeded',
      surface: 'llm_fallback_rate',
      signal: 'fallback-rate-threshold',
      tier: 'warn',
      environment: 'production',
      numerator: 1,
      denominator: 20,
      rate_pct: 5,
      window_seconds: 900,
      minimum_calls: 20,
      warn_threshold_pct: 2,
      page_threshold_pct: 10,
      provider: 'cerebras',
      capability: 'text',
    });
  });

  it('pages above 10% but remains warning-only at exactly 10%', () => {
    const boundary = tracker();
    recordCalls(boundary, 20, 2);
    expect(emitted.at(-1)?.tier).toBe('warn');

    emitted = [];
    const above = tracker();
    recordCalls(above, 20, 3);
    expect(emitted.at(-1)?.tier).toBe('page');
  });

  it('recovers after old fallback samples leave the rolling window', () => {
    const monitor = tracker();
    recordCalls(monitor, 20, 3);
    expect(emitted.at(-1)?.tier).toBe('page');

    nowMs += 15 * 60 * 1000 + 1;
    recordCalls(monitor, 20, 0);

    expect(emitted.at(-1)).toMatchObject({
      event: 'llm.fallback_rate_recovered',
      tier: 'recovered',
      numerator: 0,
      rate_pct: 0,
    });
  });

  it('emits only the bounded diagnostic contract', () => {
    const monitor = tracker();
    monitor.record({
      environment: 'production',
      fallbackUsed: true,
      provider: 'openai',
      capability: 'vision',
    });
    recordCalls(monitor, 19, 0);

    expect(Object.keys(emitted[0] ?? {}).sort()).toEqual(
      [
        'capability',
        'denominator',
        'environment',
        'event',
        'minimum_calls',
        'numerator',
        'page_threshold_pct',
        'provider',
        'rate_pct',
        'signal',
        'surface',
        'tier',
        'window_seconds',
        'warn_threshold_pct',
      ].sort(),
    );
    expect(JSON.stringify(emitted[0])).not.toMatch(
      /session|prompt|content|message|user|payer|payment/i,
    );
  });
});
