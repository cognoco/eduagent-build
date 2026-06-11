import { addBreadcrumb, captureException } from './sentry';
import { createLogger } from './logger';
import { inngest } from '../inngest/client';
import { safeSend } from './safe-non-core';

const logger = createLogger();

export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
// Matches the middleware enforcement limit; KV key prefix uses ~53 chars
// (idem:<36-char-uuid>:<flow>:), so 256 keeps the full key well under the
// 512-byte Cloudflare KV limit.
export const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

export type IdempotencyFlow = 'session';

export function buildIdempotencyCacheKey(
  profileId: string,
  flow: IdempotencyFlow,
  key: string,
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
      'warning',
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
      'warning',
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
    // [BUG-107] Non-core telemetry dispatch must go through safeSend per
    // AGENTS.md "Silent recovery without escalation is banned" — bare
    // inngest.send(...).catch(() => {}) erases all observability of dispatch
    // failures. safeSend captures dispatch failures + timeouts in Sentry and
    // logs them with `surface` while still never throwing into the caller.
    await safeSend(
      () =>
        inngest.send({
          // orphan-allow: structured telemetry signal required by AGENTS.md
          // (silent recovery must emit a structured metric/Inngest event). The
          // mark failure recovers in-line and escalates via logger.warn +
          // captureException(Sentry). The event is a dashboard-queryable
          // failure-rate signal — no remediation handler is needed.
          name: 'app/idempotency.mark_failed',
          data: { profileId, flow },
        }),
      'idempotency.mark_failed',
      { profileId, flow },
    );
  }
}
