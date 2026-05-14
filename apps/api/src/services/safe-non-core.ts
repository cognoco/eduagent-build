import type { RecordPracticeActivityEventInput } from './practice-activity-events';
import { captureException } from './sentry';
import { createLogger } from './logger';

const logger = createLogger();

const DEFAULT_TIMEOUT_MS = 2000;
const TIMEOUT_SENTINEL: unique symbol = Symbol('safe-send-timeout');

export interface SafeSendOptions {
  /**
   * Max milliseconds to wait for the underlying dispatch before giving up
   * and returning to the caller. The actual send() promise is NOT cancelled
   * (Inngest/fetch don't expose an abort signal here) — we just stop awaiting
   * it. A late rejection from the orphaned promise is captured separately so
   * it never surfaces as an unhandledRejection.
   *
   * Default: 2000ms. Telemetry pathways should never block the request path
   * for longer than that even under downstream stalls.
   */
  timeoutMs?: number;
}

export interface DeferredActivityEvent {
  input: RecordPracticeActivityEventInput;
  surface: string;
  context?: Record<string, unknown>;
}

/**
 * Run a non-core async dispatch (Inngest send, webhook, metric emit, etc.)
 * whose failure or stall must not break the surrounding user action. Failures
 * are captured in Sentry and logged — never thrown. Stalls are bounded by a
 * timeout so the request path is truly non-blocking even when downstream is
 * unreachable / hung at the TCP layer.
 */
export async function safeSend(
  send: () => Promise<unknown>,
  surface: string,
  context?: Record<string, unknown>,
  options?: SafeSendOptions,
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let timedOut = false;

  const sendPromise = Promise.resolve()
    .then(send)
    .catch((err: unknown) => {
      if (!timedOut) throw err;
      captureException(err, {
        extra: {
          surface,
          kind: 'non-core-send-late-rejection',
          ...context,
        },
      });
      logger.error('[safe-send] non-core dispatch rejected after timeout', {
        surface,
        error: err instanceof Error ? err.message : String(err),
        ...context,
      });
    });

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      resolve(TIMEOUT_SENTINEL);
    }, timeoutMs);
  });

  try {
    const winner = await Promise.race([sendPromise, timeoutPromise]);
    if (winner === TIMEOUT_SENTINEL) {
      const timeoutErr = new Error(
        `[safe-send] non-core dispatch timed out after ${timeoutMs}ms`,
      );
      captureException(timeoutErr, {
        extra: {
          surface,
          kind: 'non-core-send-timeout',
          timeoutMs,
          ...context,
        },
      });
      logger.error('[safe-send] non-core dispatch timed out', {
        surface,
        timeoutMs,
        ...context,
      });
    }
  } catch (err) {
    captureException(err, {
      extra: { surface, kind: 'non-core-send', ...context },
    });
    logger.error('[safe-send] non-core Inngest dispatch failed', {
      surface,
      error: err instanceof Error ? err.message : String(err),
      ...context,
    });
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
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
