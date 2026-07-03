import type { Database } from '@eduagent/database';
import { sessionAutoFileRequestedEventSchema } from '@eduagent/schemas';

import { inngest } from '../../inngest/client';
import { createLogger } from '../logger';
import { safeSend, safeWrite } from '../safe-non-core';
import { captureException } from '../sentry';
import { recordActivationEvent } from '../activation-events';
import {
  getSession,
  getSessionCompletionContext,
  isClosePathAutoFileEligible,
} from './session-crud';

const logger = createLogger();

// Canonical definition moved to session-crud so the stale-cleanup cron can
// share it without a circular import. Re-exported here for back-compat with
// existing importers (services/session barrel, tests).
export { isClosePathAutoFileEligible } from './session-crud';

export async function dispatchClosePathAutoFileIfEligible(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<void> {
  const session = await getSession(db, profileId, sessionId);
  if (!session || !isClosePathAutoFileEligible(session)) return;

  const dispatchId = 'initial';
  const payload = sessionAutoFileRequestedEventSchema.parse({
    profileId,
    sessionId,
    requestedAt: new Date().toISOString(),
    reason: 'freeform_session_closed',
    dispatchId,
  });

  await safeSend(
    () =>
      inngest.send({
        id: `auto-file-${sessionId}-${dispatchId}`,
        name: 'app/session.auto_file_requested',
        data: payload,
      }),
    'sessions.close.auto_file_requested',
    { profileId, sessionId },
  );
}

/**
 * Dispatches the CORE app/session.completed event that drives the entire
 * post-session pipeline (retention scoring, XP, streaks, embeddings, memory
 * extraction, dashboard rollups). A silent drop here was producing stranded
 * sessions — the user finished the session, but their streak, memories, and
 * dashboard never updated. Per AGENTS.md "Silent recovery without escalation
 * is banned" AND the explicit core-send vs safe-non-core rule: this is a CORE
 * dispatch and dispatch failure MUST short-circuit the user action so the
 * client retries.
 *
 * Returns `{ pipelineQueued: true }` on success — kept for response shape
 * compatibility with callers that include it in the response body. On
 * failure, the error propagates (captured first for Sentry context) so
 * the global onError handler converts it into a 5xx the client can retry.
 *
 * core-send: pipeline integrity — silent drop breaks dashboard/streaks/memory
 */
export async function dispatchSessionCompletedEvent(
  db: Database,
  profileId: string,
  sessionId: string,
  options: {
    summaryStatus:
      | 'pending'
      | 'submitted'
      | 'accepted'
      | 'skipped'
      | 'auto_closed';
    qualityRating?: number;
  },
): Promise<{ pipelineQueued: boolean }> {
  const completion = await getSessionCompletionContext(
    db,
    profileId,
    sessionId,
  );

  try {
    // core-send: pipeline integrity — silent drop breaks dashboard/streaks/memory
    // Inngest event-key dedup. Three routes can reach this dispatch
    // without idempotency middleware: POST /sessions/:id/close, /summary,
    // and /summary/skip. closeSession's CAS at session-crud.ts only protects
    // the DB write — `summaryStatus='skipped'` is not in the early-exit set,
    // so a retried /close (mobile retry, proxy retry, double-tap) re-runs
    // the dispatch. Without an explicit `id:`, Inngest treats each send as
    // a new event and the entire post-session pipeline (XP, streaks, memory
    // extraction, retention scoring, embeddings) double-applies. Keying by
    // (sessionId, summaryStatus) lets a legitimate status transition (e.g.
    // 'skipped' → 'submitted') still dispatch once per transition while a
    // retry within the same transition is deduped by Inngest.
    await inngest.send({
      id: `session-completed-${completion.sessionId}-${options.summaryStatus}`,
      name: 'app/session.completed',
      data: {
        profileId,
        sessionId: completion.sessionId,
        topicId: completion.topicId,
        subjectId: completion.subjectId,
        sessionType: completion.sessionType,
        ...(completion.mode ? { mode: completion.mode } : {}),
        verificationType: completion.verificationType,
        interleavedTopicIds: completion.interleavedTopicIds,
        escalationRungs: completion.escalationRungs,
        exchangeCount: completion.exchangeCount,
        summaryStatus: options.summaryStatus,
        ...(options.qualityRating != null
          ? { qualityRating: options.qualityRating }
          : {}),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    // Capture context BEFORE rethrowing so Sentry has the session/profile
    // attached. The global onError handler will also see the throw and
    // return a 5xx to the client so it retries — exactly what we want for
    // a CORE event whose silent drop breaks the entire post-session
    // pipeline (retention, XP, streaks, embeddings, memory).
    captureException(err, {
      profileId,
      extra: {
        sessionId,
        event: 'sessions.dispatch_completed_failed',
        summaryStatus: options.summaryStatus,
      },
    });
    logger.error('[sessions] CORE app/session.completed dispatch failed', {
      sessionId,
      profileId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  // WI-1504: launch activation instrumentation. occurrenceKey is
  // deliberately omitted — first_session_completed should record only the
  // FIRST session a profile completes, not every completion, so the
  // default profile-scoped dedupeKey (no occurrence suffix) lets
  // onConflictDoNothing keep only the earliest row. Non-core: must never
  // affect the pipeline-queued result computed above.
  await safeWrite(
    () =>
      recordActivationEvent(db, {
        eventType: 'first_session_completed',
        profileId,
        route: 'app/session.completed',
        metadata: { sessionId: completion.sessionId },
      }),
    'sessions.dispatch_completed.first_session_completed',
    { profileId, sessionId: completion.sessionId },
  );

  return { pipelineQueued: true };
}
