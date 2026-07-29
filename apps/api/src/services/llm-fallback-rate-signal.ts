import { createLogger } from './logger';

export const LLM_FALLBACK_RATE_WINDOW_SECONDS = 900;
export const LLM_FALLBACK_RATE_WINDOW_MS =
  LLM_FALLBACK_RATE_WINDOW_SECONDS * 1000;
export const LLM_FALLBACK_RATE_MINIMUM_CALLS = 20;
export const LLM_FALLBACK_RATE_WARN_PERCENT = 2;
export const LLM_FALLBACK_RATE_PAGE_PERCENT = 10;
const BREACH_HEARTBEAT_MS = 5 * 60 * 1000;

type AlertTier = 'healthy' | 'warn' | 'page';
type EvaluatedAlertTier = AlertTier | null;

interface Sample {
  at: number;
  fallbackUsed: boolean;
}

interface EnvironmentWindow {
  samples: Sample[];
  tier: AlertTier;
  lastEmittedAt: number | null;
}

export interface LlmFallbackRateSignal extends Record<string, unknown> {
  event: 'llm.fallback_rate_threshold_exceeded' | 'llm.fallback_rate_recovered';
  surface: 'llm_fallback_rate';
  signal: 'fallback-rate-threshold';
  tier: 'warn' | 'page' | 'recovered';
  environment: string;
  numerator: number;
  denominator: number;
  rate_pct: number;
  window_seconds: typeof LLM_FALLBACK_RATE_WINDOW_SECONDS;
  minimum_calls: typeof LLM_FALLBACK_RATE_MINIMUM_CALLS;
  warn_threshold_pct: typeof LLM_FALLBACK_RATE_WARN_PERCENT;
  page_threshold_pct: typeof LLM_FALLBACK_RATE_PAGE_PERCENT;
  provider: string;
  capability: string;
}

interface RecordInput {
  environment: string;
  fallbackUsed: boolean;
  provider: string;
  capability: string;
}

interface TrackerOptions {
  now?: () => number;
  emit: (signal: LlmFallbackRateSignal) => void;
}

function tierFor(denominator: number, ratePercent: number): EvaluatedAlertTier {
  if (denominator < LLM_FALLBACK_RATE_MINIMUM_CALLS) return null;
  if (ratePercent > LLM_FALLBACK_RATE_PAGE_PERCENT) return 'page';
  if (ratePercent > LLM_FALLBACK_RATE_WARN_PERCENT) return 'warn';
  return 'healthy';
}

export function createLlmFallbackRateTracker(options: TrackerOptions): {
  record(input: RecordInput): void;
  reset(): void;
} {
  const now = options.now ?? Date.now;
  const windows = new Map<string, EnvironmentWindow>();

  return {
    record(input): void {
      const timestamp = now();
      const window = windows.get(input.environment) ?? {
        samples: [],
        tier: 'healthy',
        lastEmittedAt: null,
      };
      window.samples.push({ at: timestamp, fallbackUsed: input.fallbackUsed });
      window.samples = window.samples.filter(
        (sample) => timestamp - sample.at <= LLM_FALLBACK_RATE_WINDOW_MS,
      );

      const denominator = window.samples.length;
      const numerator = window.samples.reduce(
        (total, sample) => total + (sample.fallbackUsed ? 1 : 0),
        0,
      );
      const ratePercent =
        denominator === 0 ? 0 : (numerator / denominator) * 100;
      const tier = tierFor(denominator, ratePercent);
      if (tier === null) {
        windows.set(input.environment, window);
        return;
      }
      const changed = tier !== window.tier;
      const heartbeatDue =
        tier !== 'healthy' &&
        window.lastEmittedAt != null &&
        timestamp - window.lastEmittedAt >= BREACH_HEARTBEAT_MS;

      if (changed || heartbeatDue) {
        if (tier !== 'healthy' || window.tier !== 'healthy') {
          const signalTier = tier === 'healthy' ? 'recovered' : tier;
          try {
            options.emit({
              event:
                tier === 'healthy'
                  ? 'llm.fallback_rate_recovered'
                  : 'llm.fallback_rate_threshold_exceeded',
              surface: 'llm_fallback_rate',
              signal: 'fallback-rate-threshold',
              tier: signalTier,
              environment: input.environment,
              numerator,
              denominator,
              rate_pct: Number(ratePercent.toFixed(2)),
              window_seconds: LLM_FALLBACK_RATE_WINDOW_SECONDS,
              minimum_calls: LLM_FALLBACK_RATE_MINIMUM_CALLS,
              warn_threshold_pct: LLM_FALLBACK_RATE_WARN_PERCENT,
              page_threshold_pct: LLM_FALLBACK_RATE_PAGE_PERCENT,
              provider: input.provider,
              capability: input.capability,
            });
            window.lastEmittedAt = timestamp;
          } catch {
            // Observability must never reclassify a successful provider result
            // as a provider failure. Preserve the prior tier so the next sample
            // retries this transition instead of losing it.
            windows.set(input.environment, window);
            return;
          }
        }
        window.tier = tier;
      }

      windows.set(input.environment, window);
    },
    reset(): void {
      windows.clear();
    },
  };
}

const logger = createLogger();
const tracker = createLlmFallbackRateTracker({
  emit(signal) {
    logger.warn(signal.event, signal);
  },
});

export function recordLlmFallbackRateSample(input: RecordInput): void {
  try {
    tracker.record(input);
  } catch {
    // Launch-health instrumentation must never alter a provider outcome.
  }
}

/** Exported for deterministic tests that exercise the router. */
export function _resetLlmFallbackRateTracker(): void {
  tracker.reset();
}
