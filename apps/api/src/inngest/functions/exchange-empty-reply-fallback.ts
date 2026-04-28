// ---------------------------------------------------------------------------
// Exchange Empty-Reply Fallback — observable terminus for the
// app/exchange.empty_reply_fallback event emitted by streamInterviewExchange
// when the LLM returns an unparseable / empty envelope. [BUG-851 / F-SVC-022]
//
// Pre-fix: services/interview.ts called inngest.send({ name:
// 'app/exchange.empty_reply_fallback', ... }) but no handler was registered,
// so the very escalation channel meant to surface broken LLM responses was
// silently dropped — exactly the "wired-but-untriggered" anti-pattern called
// out in CLAUDE.md ("worse than dead code because it creates false
// confidence").
//
// This handler is the observable terminus: every empty-reply event lands
// here and emits a structured warn log so the rate of empty-reply events
// is queryable in observability. A real escalation strategy (page on-call
// when rate spikes, drift-track LLM provider) is intentionally deferred —
// this stub is the missing handler the bug demands, not the full feature.
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { createLogger } from '../../services/logger';

const logger = createLogger();

export const exchangeEmptyReplyFallback = inngest.createFunction(
  {
    id: 'exchange-empty-reply-fallback',
    name: 'Exchange empty-reply fallback escalation',
  },
  { event: 'app/exchange.empty_reply_fallback' },
  async ({ event }) => {
    const data = event.data as {
      sessionId?: string;
      profileId?: string;
      flow?: string;
      exchangeCount?: number;
      reason?: string;
      rawResponsePreview?: string;
    };

    // Warn-level so observability buckets these without paging on-call —
    // a single empty reply is recoverable; the escalation matters when
    // the rate spikes.
    logger.warn('exchange.empty_reply_fallback.received', {
      sessionId: data.sessionId ?? 'unknown',
      profileId: data.profileId ?? 'unknown',
      flow: data.flow ?? 'unknown',
      exchangeCount: data.exchangeCount ?? 0,
      reason: data.reason ?? 'unknown',
      // Preview is intentionally bounded at the emitter (200 chars) so this
      // is safe to surface in logs without leaking large LLM payloads.
      rawResponsePreview: data.rawResponsePreview ?? null,
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      sessionId: data.sessionId ?? null,
      reason: data.reason ?? 'unknown',
      // Greppable marker so a future feature ticket can find every spot
      // where escalation behavior is deferred.
      escalationDeferred: 'pending_llm_drift_alerting',
    };
  }
);
