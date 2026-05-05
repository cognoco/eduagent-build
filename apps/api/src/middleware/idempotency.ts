import { createMiddleware } from 'hono/factory';
import { ERROR_CODES } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import {
  buildIdempotencyCacheKey,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  type IdempotencyFlow,
} from '../services/idempotency-marker';
import { lookupAssistantTurnState } from '../services/idempotency-assistant-state';
import { addBreadcrumb, captureException } from '../services/sentry';
import { createLogger } from '../services/logger';
import { inngest } from '../inngest/client';

const logger = createLogger();

type IdempotencyEnv = {
  Bindings: {
    IDEMPOTENCY_KV?: KVNamespace;
  };
  Variables: {
    db: Database;
    profileId: string | undefined;
  };
};

export function idempotencyPreflight(options: { flow: IdempotencyFlow }) {
  return createMiddleware<IdempotencyEnv>(async (c, next) => {
    const key = c.req.header('Idempotency-Key')?.trim();
    if (!key) {
      await next();
      return;
    }

    if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return c.json(
        {
          code: ERROR_CODES.INVALID_IDEMPOTENCY_KEY,
          message: `Idempotency-Key exceeds ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
        },
        400
      );
    }

    const profileId = c.get('profileId');
    if (!profileId) {
      addBreadcrumb(
        'idempotency preflight skipped: profile missing',
        'idempotency',
        'warning'
      );
      await next();
      return;
    }

    const kv = c.env.IDEMPOTENCY_KV;
    if (!kv) {
      addBreadcrumb(
        'idempotency preflight skipped: binding missing',
        'idempotency',
        'warning'
      );
      await next();
      return;
    }

    let existing: string | null = null;
    try {
      existing = await kv.get(
        buildIdempotencyCacheKey(profileId, options.flow, key)
      );
    } catch (err) {
      // Auth-adjacent silent recovery: continue to handler rather than failing
      // the request, but emit a queryable counter so KV outages surface in
      // metrics. (CLAUDE.md: "Silent recovery without escalation is banned.")
      addBreadcrumb('idempotency preflight lookup failed', 'idempotency');
      logger.warn('[idempotency] preflight KV read failed', {
        event: 'idempotency.preflight_lookup_failed',
        profileId,
        flow: options.flow,
        error: err instanceof Error ? err.message : String(err),
      });
      captureException(err, {
        profileId,
        extra: {
          context: 'idempotency.preflight.get',
          flow: options.flow,
          key,
        },
      });
      inngest
        .send({
          name: 'app/idempotency.preflight_lookup_failed',
          data: { profileId, flow: options.flow },
        })
        .catch(() => {
          // Fire-and-forget: failure already captured above via captureException.
        });
      await next();
      return;
    }

    if (!existing) {
      await next();
      return;
    }

    const state = await lookupAssistantTurnState({
      db: c.get('db'),
      profileId,
      flow: options.flow,
      key,
    });

    c.header('Idempotency-Replay', 'true');
    return c.json({
      replayed: true,
      clientId: key,
      status: 'persisted',
      assistantTurnReady: state.assistantTurnReady,
      latestExchangeId: state.latestExchangeId,
    });
  });
}
