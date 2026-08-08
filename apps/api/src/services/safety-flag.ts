import { and, eq } from 'drizzle-orm';
import { learningSessions, type Database } from '@eduagent/database';

import { createLogger } from './logger';
import { captureException } from './sentry';

const logger = createLogger();

/**
 * [WI-3140] Tripwire-to-memory firewall — the write half.
 *
 * Stamps `learning_sessions.safety_flagged_at` for a session whose exchange was
 * handled as a crisis redirect (deterministic tripwire hit, unscreenable image,
 * or a model envelope carrying `signals.crisis_redirect`). The enforcement half
 * lives in the session-completed pipeline: a non-null stamp skips the whole
 * `analyze-learner-profile` step and the `generate-embeddings` step, so a
 * safeguarding conversation never reaches persistent memory or the embeddings
 * index.
 *
 * CONTENT-FREE BY DESIGN: the column holds a timestamp and nothing else — no
 * category, no quote, no disclosure text. Same metadata-only constraint that
 * governs `emitCrisisRedirectEvent` (services/exchanges.ts, ruling se-032):
 * recording *that* a disclosure happened must not re-persist *what* was said in
 * a second location.
 *
 * FAILURE POSTURE: safety paths never recover silently, but they also must
 * never break the learner-facing crisis reply — the empathy + helpline response
 * is the thing that actually matters in the moment. A write failure is
 * therefore escalated (structured `logger.error` + Sentry) and swallowed,
 * exactly as `emitCrisisRedirectEvent` treats its own sinks. A lost stamp is
 * fail-open on the memory firewall, which is why the escalation is loud.
 *
 * The write is `profileId`-scoped (PRIN-04) so a crafted session id cannot
 * stamp another learner's session.
 */
export async function flagSessionSafety(
  db: Database,
  profileId: string,
  sessionId: string,
  flow: string,
): Promise<void> {
  try {
    await db
      .update(learningSessions)
      .set({ safetyFlaggedAt: new Date() })
      .where(
        and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.profileId, profileId),
        ),
      );
  } catch (error) {
    logger.error('safety.session_flag_write_failed', {
      flow,
      session_id: sessionId,
      profile_id: profileId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Content-free wrapper, never the raw driver error: a Postgres driver
    // message can echo the failing statement, and this module writes on the
    // safeguarding path (gov/no-raw-error-to-sentry).
    captureException(
      new Error('safety.session_flag_write_failed', {
        cause: { errorName: error instanceof Error ? error.name : 'unknown' },
      }),
      {
        profileId,
        tags: { surface: 'safety.session_flag', flow },
        extra: { sessionId },
      },
    );
  }
}
