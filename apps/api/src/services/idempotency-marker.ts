import { addBreadcrumb, captureException } from './sentry';
import { createLogger } from './logger';

const logger = createLogger();

export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export type IdempotencyFlow = 'session' | 'interview';

export function buildIdempotencyCacheKey(
  profileId: string,
  flow: IdempotencyFlow,
  key: string
): string {
  return `idem:${profileId}:${flow}:${key}`;
}

export async function markPersisted(params: {
  kv?: KVNamespace;
  profileId?: string;
  flow: IdempotencyFlow;
  key?: string;
}): Promise<void> {
  const { kv, profileId, flow, key } = params;
  if (!key) {
    return;
  }

  if (!profileId) {
    addBreadcrumb(
      'idempotency mark skipped: profile missing',
      'idempotency',
      'warning'
    );
    logger.warn('[idempotency] mark skipped: profile missing', {
      event: 'idempotency.mark_skipped_no_profile',
      flow,
    });
    return;
  }

  if (!kv) {
    addBreadcrumb(
      'idempotency mark skipped: binding missing',
      'idempotency',
      'warning'
    );
    logger.warn('[idempotency] mark skipped: KV binding missing', {
      event: 'idempotency.mark_skipped_no_binding',
      profileId,
      flow,
    });
    return;
  }

  try {
    await kv.put(buildIdempotencyCacheKey(profileId, flow, key), '1', {
      expirationTtl: IDEMPOTENCY_TTL_SECONDS,
    });
  } catch (err) {
    addBreadcrumb('idempotency mark failed', 'idempotency', 'error');
    logger.warn('[idempotency] KV write failed', {
      event: 'idempotency.mark_failed',
      profileId,
      flow,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, {
      profileId,
      extra: {
        context: 'idempotency.markPersisted',
        flow,
        key,
      },
    });
  }
}
