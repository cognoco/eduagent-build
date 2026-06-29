// @inngest-admin: no-db (logging observer; no DB access)
// ---------------------------------------------------------------------------
// Exchange Empty-Reply Fallback — observable terminus for the
// app/exchange.empty_reply_fallback event emitted by streamInterviewExchange
// when the LLM returns an unparseable / empty envelope. [BUG-851 / F-SVC-022]
//
// Pre-fix: services/interview.ts called inngest.send({ name:
// 'app/exchange.empty_reply_fallback', ... }) but no handler was registered,
// so the very escalation channel meant to surface broken LLM responses was
// silently dropped — exactly the "wired-but-untriggered" anti-pattern called
// out in AGENTS.md ("worse than dead code because it creates false
// confidence").
//
// This handler is the observable terminus: every empty-reply event lands
// here and emits a structured warn log so the rate of empty-reply events
// is queryable in observability. A real escalation strategy (page on-call
// when rate spikes, drift-track LLM provider) is intentionally deferred —
// this stub is the missing handler the bug demands, not the full feature.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { inngest } from '../client';
import { createLogger } from '../../services/logger';
import { summarizeRawPayload } from '@eduagent/schemas';

const logger = createLogger();

// Runtime schema for the event payload — guards against garbage data reaching
// the observability log (CR-2026-05-21-025). Fields are intentionally loose
// (z.string() not z.string().uuid()) to match what the emitter actually sends
// without being overly brittle. rawResponsePreview is optional because older
// emitter sites may not include it.
const exchangeEmptyReplyFallbackDataSchema = z.object({
  sessionId: z.string(),
  profileId: z.string(),
  flow: z.string(),
  exchangeCount: z.number().int().nonnegative(),
  reason: z.string(),
  rawResponsePreview: z.string().optional(),
});

export const exchangeEmptyReplyFallback = inngest.createFunction(
  {
    id: 'exchange-empty-reply-fallback',
    name: 'Exchange empty-reply fallback escalation',
  },
  { event: 'app/exchange.empty_reply_fallback' },
  async ({ event }) => {
    const parsed = exchangeEmptyReplyFallbackDataSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn('exchange.empty_reply_fallback.invalid_payload', {
        parseError: parsed.error.message,
        rawData: summarizeRawPayload(event.data),
      });
      return { status: 'invalid_payload' as const };
    }

    const data = parsed.data;

    // Warn-level so observability buckets these without paging on-call —
    // a single empty reply is recoverable; the escalation matters when
    // the rate spikes.
    logger.warn('exchange.empty_reply_fallback.received', {
      sessionId: data.sessionId,
      profileId: data.profileId,
      flow: data.flow,
      exchangeCount: data.exchangeCount,
      reason: data.reason,
      // Preview is intentionally bounded at the emitter (200 chars) so this
      // is safe to surface in logs without leaking large LLM payloads.
      rawResponsePreview: data.rawResponsePreview ?? null,
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      sessionId: data.sessionId,
      reason: data.reason,
      // Greppable marker so a future feature ticket can find every spot
      // where escalation behavior is deferred.
      escalationDeferred: 'pending_llm_drift_alerting',
    };
  },
);
