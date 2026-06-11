import { and, asc, desc, eq, gte } from 'drizzle-orm';
import {
  createScopedRepository,
  sessionEvents,
  type Database,
} from '@eduagent/database';
import type { IdempotencyFlow } from './idempotency-marker';
import { addBreadcrumb, captureException } from './sentry';
import { createLogger } from './logger';
import { inngest } from '../inngest/client';
import { safeSend } from './safe-non-core';

const logger = createLogger();

export interface AssistantTurnState {
  assistantTurnReady: boolean;
  latestExchangeId: string | null;
}

const SAFE_ASSISTANT_TURN_STATE: AssistantTurnState = {
  assistantTurnReady: false,
  latestExchangeId: null,
};

export async function lookupAssistantTurnState(params: {
  db?: Database;
  profileId?: string;
  flow: IdempotencyFlow;
  key: string;
}): Promise<AssistantTurnState> {
  const { db, profileId, flow, key } = params;
  if (!db || !profileId) {
    return SAFE_ASSISTANT_TURN_STATE;
  }

  try {
    const repo = createScopedRepository(db, profileId);

    const userRow = await repo.sessionEvents.findFirst(
      and(
        eq(sessionEvents.eventType, 'user_message'),
        eq(sessionEvents.clientId, key),
      ),
      [desc(sessionEvents.createdAt), desc(sessionEvents.id)],
    );

    if (!userRow) {
      return SAFE_ASSISTANT_TURN_STATE;
    }

    const assistantRow = await repo.sessionEvents.findFirst(
      and(
        eq(sessionEvents.sessionId, userRow.sessionId),
        eq(sessionEvents.eventType, 'ai_response'),
        gte(sessionEvents.createdAt, userRow.createdAt),
      ),
      [asc(sessionEvents.createdAt), asc(sessionEvents.id)],
    );

    return {
      assistantTurnReady: assistantRow !== undefined,
      latestExchangeId: assistantRow?.id ?? null,
    };
  } catch (err) {
    // Auth-adjacent silent recovery: bypass the idempotency replay rather than
    // failing the request, but emit a queryable counter so a sustained DB
    // outage shows up in metrics instead of as elevated duplicate-message
    // rates. (AGENTS.md: "Silent recovery without escalation is banned.")
    addBreadcrumb('assistant turn lookup failed', 'idempotency', 'warning');
    logger.warn('[idempotency] assistant turn lookup failed', {
      event: 'idempotency.assistant_turn_lookup_failed',
      profileId,
      flow,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, {
      profileId,
      extra: { context: 'idempotency.lookupAssistantTurnState', flow, key },
    });
    // [BUG-420] Non-core telemetry dispatch must go through safeSend per
    // AGENTS.md "Silent recovery without escalation is banned" — bare
    // inngest.send(...).catch(() => {}) erases all observability of dispatch
    // failures. safeSend captures dispatch failures + timeouts in Sentry and
    // logs them with `surface` while still never throwing into the caller.
    await safeSend(
      () =>
        inngest.send({
          // orphan-allow: structured telemetry signal required by AGENTS.md
          // (silent recovery must emit a structured metric/Inngest event). The
          // lookup failure recovers in-line (returns SAFE_ASSISTANT_TURN_STATE)
          // and escalates via logger.warn + captureException(Sentry). The event
          // is a dashboard-queryable failure-rate signal — no handler needed.
          name: 'app/idempotency.assistant_turn_lookup_failed',
          data: { profileId, flow },
        }),
      'idempotency.assistant_turn_lookup_failed',
      { profileId, flow },
    );
    return SAFE_ASSISTANT_TURN_STATE;
  }
}
