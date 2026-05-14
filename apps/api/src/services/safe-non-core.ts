import { captureException } from './sentry';
import { createLogger } from './logger';

const logger = createLogger();

function extractProfileId(
  context?: Record<string, unknown>,
): string | undefined {
  return typeof context?.profileId === 'string' ? context.profileId : undefined;
}

/**
 * Run a non-core async dispatch (Inngest send, webhook, metric emit, etc.)
 * whose failure must not break the surrounding user action. Failures are
 * captured in Sentry and logged — never thrown.
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
      profileId: extractProfileId(context),
      extra: { surface, kind: 'non-core-send', ...context },
    });
    logger.error('[safe-send] non-core Inngest dispatch failed', {
      surface,
      error: err instanceof Error ? err.message : String(err),
      ...context,
    });
  }
}
