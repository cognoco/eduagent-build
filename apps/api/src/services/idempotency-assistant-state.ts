import { and, asc, desc, eq, gte } from 'drizzle-orm';
import {
  createScopedRepository,
  onboardingDrafts,
  sessionEvents,
  type Database,
} from '@eduagent/database';
import type { ExchangeEntry } from '@eduagent/schemas';
import type { IdempotencyFlow } from './idempotency-marker';
import { addBreadcrumb, captureException } from './sentry';
import { createLogger } from './logger';

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

    if (flow === 'session') {
      const userRow = await repo.sessionEvents.findFirst(
        and(
          eq(sessionEvents.eventType, 'user_message'),
          eq(sessionEvents.clientId, key)
        ),
        [desc(sessionEvents.createdAt), desc(sessionEvents.id)]
      );

      if (!userRow) {
        return SAFE_ASSISTANT_TURN_STATE;
      }

      const assistantRow = await repo.sessionEvents.findFirst(
        and(
          eq(sessionEvents.sessionId, userRow.sessionId),
          eq(sessionEvents.eventType, 'ai_response'),
          gte(sessionEvents.createdAt, userRow.createdAt)
        ),
        [asc(sessionEvents.createdAt), asc(sessionEvents.id)]
      );

      return {
        assistantTurnReady: assistantRow !== undefined,
        latestExchangeId: assistantRow?.id ?? null,
      };
    }

    // [I7] Cap to the 5 most recent drafts. The historical implementation scanned
    // every draft for the profile linearly to find the matching client_id —
    // unbounded growth meant idempotency replay latency degraded silently as
    // draft count grew. 5 covers the realistic concurrent-onboarding window.
    const drafts = await repo.onboardingDrafts.findMany(
      undefined,
      [desc(onboardingDrafts.updatedAt), desc(onboardingDrafts.id)],
      5
    );

    for (const draft of drafts) {
      const history = Array.isArray(draft.exchangeHistory)
        ? (draft.exchangeHistory as ExchangeEntry[])
        : [];
      const userIndex = history.findIndex(
        (entry) => entry.role === 'user' && entry.client_id === key
      );
      if (userIndex === -1) {
        continue;
      }

      const hasAssistant = history
        .slice(userIndex + 1)
        .some((entry) => entry.role === 'assistant');
      return {
        assistantTurnReady: hasAssistant,
        latestExchangeId: null,
      };
    }

    return SAFE_ASSISTANT_TURN_STATE;
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
    return SAFE_ASSISTANT_TURN_STATE;
  }
}
