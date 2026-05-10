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
    // rates. (CLAUDE.md: "Silent recovery without escalation is banned.")
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
    inngest
      .send({
        name: 'app/idempotency.assistant_turn_lookup_failed',
        data: { profileId, flow },
      })
      .catch(() => {
        // Fire-and-forget: best-effort event; failure is non-fatal.
      });
    return SAFE_ASSISTANT_TURN_STATE;
  }
}
