import type { RecordPracticeActivityEventInput } from './practice-activity-events';
import { captureException } from './sentry';
import { createLogger } from './logger';

const logger = createLogger();

export interface DeferredActivityEvent {
  input: RecordPracticeActivityEventInput;
  surface: string;
  context?: Record<string, unknown>;
}

/**
 * Fire an Inngest event that is not part of the core user action.
 * Failures are captured in Sentry and logged — never thrown.
 */
export async function safeSend(
  send: () => Promise<unknown>,
  surface: string,
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    await send();
  } catch (err) {
    captureException(err, {
      extra: { surface, kind: 'non-core-send', ...context },
    });
    logger.error('[safe-send] non-core Inngest dispatch failed', {
      surface,
      error: err instanceof Error ? err.message : String(err),
      ...context,
    });
  }
}

/**
 * Execute a non-core DB write (activity event, audit log, metadata update).
 * Failures are captured in Sentry and logged — never thrown.
 */
export async function safeWrite(
  fn: () => Promise<unknown>,
  surface: string,
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    captureException(err, {
      extra: { surface, kind: 'non-core-write', ...context },
    });
    logger.error('[safe-write] non-core DB write failed', {
      surface,
      error: err instanceof Error ? err.message : String(err),
      ...context,
    });
  }
}
