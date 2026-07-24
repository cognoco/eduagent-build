import type { LogEntry } from './logger';

const LLM_VOLUME_ALERT_EVENT = 'llm.volume.daily_threshold_exceeded';
const LLM_VOLUME_ALERT_SURFACE = 'llm_volume_alert';
const UTC_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
