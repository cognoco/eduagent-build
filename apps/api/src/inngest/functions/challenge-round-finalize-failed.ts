// ---------------------------------------------------------------------------
// Challenge Round Finalize Failed — observable terminus for the
// app/challenge-round.finalize.failed event emitted by session-exchange.ts
// when the post-claim mastery/deepening write throws AFTER the atomic
// drafting -> complete claim has already committed.
//
// At that point the finalize claim has been released back to `drafting` (so a
// later exchange can retry), but the write that should have recorded mastery /
// routed weak concepts to deepening failed terminally. That is exactly the
// "silent recovery without escalation" pattern AGENTS.md bans in
// state-machine-critical flows — so the dispatch carries the failure here.
//
// This handler is the queryable terminus: structured log + Sentry escalation
// so the failure stream is observable and alertable. A real retry strategy
// (re-run decideMasteryAndReview off the released claim, page on rate spikes)
// is intentionally deferred — the escalation contract is enough to stop the
// loss from being invisible today.
// ---------------------------------------------------------------------------

import { inngest } from '../client';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';

const logger = createLogger();

export const challengeRoundFinalizeFailed = inngest.createFunction(
  {
    id: 'challenge-round-finalize-failed',
    name: 'Challenge round finalize failure observability',
  },
  { event: 'app/challenge-round.finalize.failed' },
  async ({ event }) => {
    const data = event.data as {
      profileId?: string;
      sessionId?: string;
      topicId?: string;
      markMasteryVerified?: boolean;
      error?: string;
    };

    logger.error('challenge-round.finalize.failed.received', {
      profileId: data.profileId ?? 'unknown',
      sessionId: data.sessionId ?? 'unknown',
      topicId: data.topicId ?? 'unknown',
      markMasteryVerified: data.markMasteryVerified ?? null,
      error: data.error ?? 'unknown',
      receivedAt: new Date().toISOString(),
    });

    captureException(new Error('challenge round finalize failed'), {
      profileId: data.profileId,
      extra: {
        surface: 'challenge-round.finalize.failed.observer',
        sessionId: data.sessionId,
        topicId: data.topicId,
        markMasteryVerified: data.markMasteryVerified,
        error: data.error,
      },
    });

    return {
      status: 'logged' as const,
      sessionId: data.sessionId ?? null,
      topicId: data.topicId ?? null,
      retryDeferred: 'pending_challenge_round_finalize_retry_strategy',
    };
  },
);
