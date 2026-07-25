import { createLogger } from './logger';
import type { LogEntry } from './logger';

const LLM_VOLUME_ALERT_EVENT = 'llm.volume.daily_threshold_exceeded';
const LLM_VOLUME_ALERT_SURFACE = 'llm_volume_alert';
const LLM_FALLBACK_RATE_ALERT_EVENT = 'llm.fallback_rate_threshold_exceeded';
const LLM_FALLBACK_RATE_ALERT_SURFACE = 'llm_fallback_rate';
const UTC_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const logger = createLogger();

export interface LlmVolumeAlertAttributes extends Record<string, unknown> {
  event: typeof LLM_VOLUME_ALERT_EVENT;
  surface: typeof LLM_VOLUME_ALERT_SURFACE;
  provider: string;
  environment: string;
  count: number;
  threshold: number;
  utc_date: string;
}

export type LlmVolumeAlertSink = (
  message: typeof LLM_VOLUME_ALERT_EVENT,
  attributes: LlmVolumeAlertAttributes,
) => void;

export interface LlmFallbackRateAlertAttributes extends Record<
  string,
  unknown
> {
  event: typeof LLM_FALLBACK_RATE_ALERT_EVENT;
  surface: typeof LLM_FALLBACK_RATE_ALERT_SURFACE;
  signal: 'fallback-rate-threshold';
  tier: 'warn' | 'page';
  environment: string;
  numerator: number;
  denominator: number;
  rate_pct: number;
  window_seconds: 900;
  minimum_calls: 20;
  warn_threshold_pct: 2;
  page_threshold_pct: 10;
  provider: string;
  capability: string;
}

export type LaunchHealthAlertAttributes =
  | LlmVolumeAlertAttributes
  | LlmFallbackRateAlertAttributes;

export type LaunchHealthAlertSink = (
  message: typeof LLM_VOLUME_ALERT_EVENT | typeof LLM_FALLBACK_RATE_ALERT_EVENT,
  attributes: LaunchHealthAlertAttributes,
) => void;

export function emitLlmVolumeAlertProbe(environment?: string): {
  emitted: true;
  provider: string;
  emittedAt: string;
  utcDate: string;
} {
  const provider = 'synthetic-operator-probe';
  const emittedAt = new Date().toISOString();
  const utcDate = emittedAt.slice(0, 10);
  const context: LlmVolumeAlertAttributes = {
    event: LLM_VOLUME_ALERT_EVENT,
    surface: LLM_VOLUME_ALERT_SURFACE,
    provider,
    environment: environment ?? 'unknown',
    count: 1,
    threshold: 1,
    utc_date: utcDate,
  };
  logger.warn(LLM_VOLUME_ALERT_EVENT, context);

  return { emitted: true, provider, emittedAt, utcDate };
}

function selectLlmVolumeAlertAttributes(
  level: string,
  message: unknown,
  context: Record<string, unknown> | undefined,
): LlmVolumeAlertAttributes | null {
  if (level !== 'warn' || message !== LLM_VOLUME_ALERT_EVENT) {
    return null;
  }

  if (
    context?.event !== LLM_VOLUME_ALERT_EVENT ||
    context.surface !== LLM_VOLUME_ALERT_SURFACE ||
    typeof context.provider !== 'string' ||
    context.provider.length === 0 ||
    typeof context.environment !== 'string' ||
    context.environment.length === 0 ||
    typeof context.count !== 'number' ||
    !Number.isFinite(context.count) ||
    typeof context.threshold !== 'number' ||
    !Number.isFinite(context.threshold) ||
    typeof context.utc_date !== 'string' ||
    !UTC_DATE_PATTERN.test(context.utc_date)
  ) {
    return null;
  }

  return {
    event: LLM_VOLUME_ALERT_EVENT,
    surface: LLM_VOLUME_ALERT_SURFACE,
    provider: context.provider,
    environment: context.environment,
    count: context.count,
    threshold: context.threshold,
    utc_date: context.utc_date,
  };
}

function selectLlmFallbackRateAlertAttributes(
  level: string,
  message: unknown,
  context: Record<string, unknown> | undefined,
): LlmFallbackRateAlertAttributes | null {
  if (level !== 'warn' || message !== LLM_FALLBACK_RATE_ALERT_EVENT) {
    return null;
  }
  if (
    context?.event !== LLM_FALLBACK_RATE_ALERT_EVENT ||
    context.surface !== LLM_FALLBACK_RATE_ALERT_SURFACE ||
    context.signal !== 'fallback-rate-threshold' ||
    (context.tier !== 'warn' && context.tier !== 'page') ||
    typeof context.environment !== 'string' ||
    typeof context.numerator !== 'number' ||
    !Number.isFinite(context.numerator) ||
    typeof context.denominator !== 'number' ||
    !Number.isFinite(context.denominator) ||
    typeof context.rate_pct !== 'number' ||
    !Number.isFinite(context.rate_pct) ||
    context.window_seconds !== 900 ||
    context.minimum_calls !== 20 ||
    context.warn_threshold_pct !== 2 ||
    context.page_threshold_pct !== 10 ||
    typeof context.provider !== 'string' ||
    typeof context.capability !== 'string'
  ) {
    return null;
  }

  return {
    event: LLM_FALLBACK_RATE_ALERT_EVENT,
    surface: LLM_FALLBACK_RATE_ALERT_SURFACE,
    signal: 'fallback-rate-threshold',
    tier: context.tier,
    environment: context.environment,
    numerator: context.numerator,
    denominator: context.denominator,
    rate_pct: context.rate_pct,
    window_seconds: 900,
    minimum_calls: 20,
    warn_threshold_pct: 2,
    page_threshold_pct: 10,
    provider: context.provider,
    capability: context.capability,
  };
}

/**
 * Routes only the canonical daily LLM-volume warning to an alertable sink.
 *
 * The output object is reconstructed from an explicit allowlist so unrelated
 * logger context, learner text, model output, and identifiers cannot cross
 * this boundary even if they are accidentally attached upstream.
 */
export function forwardLlmVolumeAlertToSink(
  entry: Readonly<LogEntry>,
  send: LlmVolumeAlertSink,
): void {
  const attributes = selectLlmVolumeAlertAttributes(
    entry.level,
    entry.message,
    entry.context,
  );
  if (!attributes) {
    return;
  }

  send(LLM_VOLUME_ALERT_EVENT, attributes);
}

export function forwardLaunchHealthAlertToSink(
  entry: Readonly<LogEntry>,
  send: LaunchHealthAlertSink,
): void {
  const volumeAttributes = selectLlmVolumeAlertAttributes(
    entry.level,
    entry.message,
    entry.context,
  );
  if (volumeAttributes) {
    send(LLM_VOLUME_ALERT_EVENT, volumeAttributes);
    return;
  }

  const fallbackAttributes = selectLlmFallbackRateAlertAttributes(
    entry.level,
    entry.message,
    entry.context,
  );
  if (fallbackAttributes) {
    send(LLM_FALLBACK_RATE_ALERT_EVENT, fallbackAttributes);
  }
}

/**
 * Final Sentry Logs boundary. The SDK adds user, release, SDK, replay, and
 * trace attributes before this hook runs, so reconstruct the same seven-field
 * allowlist again immediately before serialization. Unexpected direct Sentry
 * logs fail closed.
 */
export function scrubLlmVolumeAlertSentryLog<
  T extends {
    level: string;
    message: unknown;
    attributes?: Record<string, unknown>;
  },
>(log: T): T | null {
  const attributes = selectLlmVolumeAlertAttributes(
    log.level,
    log.message,
    log.attributes,
  );
  if (!attributes) {
    return null;
  }

  return { ...log, attributes };
}

export function scrubLaunchHealthSentryLog<
  T extends {
    level: string;
    message: unknown;
    attributes?: Record<string, unknown>;
  },
>(log: T): T | null {
  const attributes =
    selectLlmVolumeAlertAttributes(log.level, log.message, log.attributes) ??
    selectLlmFallbackRateAlertAttributes(
      log.level,
      log.message,
      log.attributes,
    );
  if (!attributes) return null;
  return { ...log, attributes };
}
