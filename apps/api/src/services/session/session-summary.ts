// ---------------------------------------------------------------------------
// Session Summary — get, skip, and submit session summaries
// ---------------------------------------------------------------------------

import { eq, and, sql } from 'drizzle-orm';
import { sessionSummaries, type Database } from '@eduagent/database';
import {
  ConflictError,
  NotFoundError,
  type ConversationLanguage,
  type RetrySummaryFeedbackResult,
  type SessionSummary,
  type SummarySubmitInput,
} from '@eduagent/schemas';
import {
  createPendingSessionSummary,
  evaluateSummary,
  hasAvailableSummaryFeedback,
} from '../summaries';
import { getSubject } from '../subject';
import { applyReflectionMultiplier, getSessionXpEntry } from '../xp';
import { createLogger } from '../logger';
import { captureException } from '../sentry';
import { createNoteForSession } from '../notes';
import { getSession } from './session-crud';
import { findSessionSummaryRow, mapSummaryRow } from './session-events';
import { findOwnedCurriculumTopic } from '../curriculum-topic-ownership';
import {
  claimExpiringCoordinationKey,
  deferCoordinationClaim,
  lockActiveCoordinationClaim,
  releaseCoordinationClaim,
  type ExpiringCoordinationClaim,
} from '../webhook-idempotency';
import { getMentorNoticeReceipt } from '../mentor-notices';

const logger = createLogger();

export async function getSessionSummary(
  db: Database,
  profileId: string,
  sessionId: string,
  options: { mentorNoticeEnabled?: boolean } = {},
): Promise<SessionSummary | null> {
  const row = await findSessionSummaryRow(db, profileId, sessionId);
  if (!row) {
    return null;
  }

  const [xpInfo, mentorNotice] = await Promise.all([
    getSessionXpEntry(db, profileId, sessionId),
    options.mentorNoticeEnabled === true
      ? getMentorNoticeReceipt(db, profileId, sessionId)
      : Promise.resolve(null),
  ]);
  const summary = mapSummaryRow(row);
  const enrichedSummary: SessionSummary = {
    ...summary,
    baseXp: xpInfo?.baseXp ?? null,
    reflectionBonusXp: xpInfo?.reflectionBonusXp ?? null,
    mentorNotice: mentorNotice ?? undefined,
  };
  if (!row.nextTopicId) {
    return enrichedSummary;
  }

  const topic = await findOwnedCurriculumTopic(db, {
    profileId,
    topicId: row.nextTopicId,
  });

  return {
    ...enrichedSummary,
    nextTopicTitle: topic?.topicTitle ?? null,
  };
}

export async function skipSummary(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<{
  summary: {
    id: string;
    sessionId: string;
    content: string;
    aiFeedback: string | null;
    status: 'skipped' | 'submitted' | 'accepted';
  };
}> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new NotFoundError('Session');
  }

  const existing = await findSessionSummaryRow(db, profileId, sessionId);
  const existingStatus = existing?.status as
    | 'pending'
    | 'submitted'
    | 'accepted'
    | 'skipped'
    | 'auto_closed'
    | undefined;

  if (
    existing &&
    (existingStatus === 'submitted' || existingStatus === 'accepted')
  ) {
    return {
      summary: {
        id: existing.id,
        sessionId: existing.sessionId,
        content: existing.content ?? '',
        aiFeedback: existing.aiFeedback ?? null,
        status: existingStatus,
      },
    };
  }

  const row = await createPendingSessionSummary(
    db,
    sessionId,
    profileId,
    session.topicId ?? null,
    'skipped',
  );

  return {
    summary: {
      id: row.id,
      sessionId: row.sessionId,
      content: row.content ?? '',
      aiFeedback: row.aiFeedback ?? null,
      status: 'skipped',
    },
  };
}

export async function submitSummary(
  db: Database,
  profileId: string,
  sessionId: string,
  input: SummarySubmitInput,
  options?: { conversationLanguage?: ConversationLanguage },
): Promise<{
  summary: {
    id: string;
    sessionId: string;
    content: string;
    aiFeedback: string | null;
    feedbackStatus: 'available' | 'unavailable';
    status: 'accepted' | 'submitted';
    baseXp: number | null;
    reflectionBonusXp: number | null;
  };
}> {
  // Fetch session for topicId and subject name
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new NotFoundError('Session');
  }

  // Idempotent short-circuit: a saved summary is terminal for content. Feedback
  // recovery uses retrySummaryFeedback and never re-runs submission side effects.
  // — return the existing row as-is. Without this guard, every retry of an
  // already-accepted summary would re-bill quota AND risk re-applying the
  // reflection multiplier (the in-tx existence check below caps the worst
  // case but only AFTER the LLM call has already burned quota).
  //
  // Both accepted and submitted are terminal content states. A submitted row
  // with unavailable feedback is recovered only through the dedicated retry.
  const preExisting = await findSessionSummaryRow(db, profileId, sessionId);
  if (
    preExisting &&
    (preExisting.status === 'accepted' || preExisting.status === 'submitted')
  ) {
    const xpInfo = await getSessionXpEntry(db, profileId, sessionId);
    const feedbackAvailable = hasAvailableSummaryFeedback(
      preExisting.aiFeedback,
    );
    return {
      summary: {
        id: preExisting.id,
        sessionId: preExisting.sessionId,
        content: preExisting.content ?? '',
        aiFeedback: feedbackAvailable ? preExisting.aiFeedback : null,
        feedbackStatus: feedbackAvailable ? 'available' : 'unavailable',
        status: preExisting.status,
        baseXp: xpInfo?.baseXp ?? null,
        reflectionBonusXp: xpInfo?.reflectionBonusXp ?? null,
      },
    };
  }

  const subject = await getSubject(db, profileId, session.subjectId);

  // Evaluate summary via LLM
  const evaluation = await evaluateSummary(
    subject?.name ?? 'Unknown topic',
    'Session learning content',
    input.content,
    { conversationLanguage: options?.conversationLanguage },
  );

  const finalStatus = evaluation.isAccepted ? 'accepted' : 'submitted';

  // [CR-2026-05-19-M3] SITE 1: Wrap the existence-check + INSERT/UPDATE +
  // applyReflectionMultiplier in a single transaction with a per-session
  // advisory lock. Two concurrent submitSummary calls for the same session
  // both pass the pre-tx findSessionSummaryRow check (both see "no summary"),
  // both insert, and applyReflectionMultiplier runs twice → doubled XP.
  // The advisory lock serialises concurrent calls; the second waits, then
  // sees the already-submitted row and returns it idempotently.
  // Known Drizzle pattern: PgTransaction → Database cast
  // (see feedback_drizzle_transaction_cast.md).
  const { finalRow, xpInfo, didPersist } = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    // Per-session advisory lock — prevents concurrent submits from both
    // passing the existence check and double-inserting / double-multiplying.
    const lockKey = `session-summary:${profileId}:${sessionId}`;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );

    const now = new Date();
    let row: typeof sessionSummaries.$inferSelect;

    const existingInTx = await findSessionSummaryRow(
      txDb,
      profileId,
      sessionId,
    );

    if (existingInTx) {
      // Idempotent path: summary already exists (concurrent or prior submission).
      // If it was already accepted/submitted, return as-is without re-running
      // the multiplier or re-writing the row.
      if (
        existingInTx.status === 'accepted' ||
        existingInTx.status === 'submitted'
      ) {
        const xpInfoIdempotent = await getSessionXpEntry(
          txDb,
          profileId,
          sessionId,
        );
        return {
          finalRow: existingInTx,
          xpInfo: xpInfoIdempotent,
          didPersist: false,
        };
      }

      await tx
        .update(sessionSummaries)
        .set({
          topicId: existingInTx.topicId ?? session.topicId ?? null,
          content: input.content,
          aiFeedback: evaluation.feedback,
          status: finalStatus,
          updatedAt: now,
        })
        .where(
          and(
            eq(sessionSummaries.id, existingInTx.id),
            eq(sessionSummaries.profileId, profileId),
          ),
        );

      row = {
        ...existingInTx,
        topicId: existingInTx.topicId ?? session.topicId ?? null,
        content: input.content,
        aiFeedback: evaluation.feedback,
        status: finalStatus,
        updatedAt: now,
      };
    } else {
      const [inserted] = await tx
        .insert(sessionSummaries)
        .values({
          sessionId,
          profileId,
          topicId: session.topicId ?? null,
          content: input.content,
          aiFeedback: evaluation.feedback,
          status: finalStatus,
        })
        .returning();

      if (!inserted)
        throw new Error('Insert session summary did not return a row');
      row = inserted;
    }

    await applyReflectionMultiplier(txDb, profileId, sessionId);
    const xpInfoTx = await getSessionXpEntry(txDb, profileId, sessionId);

    return { finalRow: row, xpInfo: xpInfoTx, didPersist: true };
  });

  if (didPersist && session.topicId) {
    try {
      await createNoteForSession(db, {
        profileId,
        topicId: session.topicId,
        sessionId,
        content: input.content,
      });
    } catch (err) {
      // Cap-reached is expected (50 notes per topic) — log at info, don't
      // page Sentry. Any other error is unexpected and worth capturing.
      if (err instanceof ConflictError) {
        logger.info(
          '[submitSummary] Auto-note skipped — topic note cap reached',
          {
            sessionId,
            topicId: session.topicId,
          },
        );
      } else {
        logger.error('[submitSummary] Note creation failed (non-fatal)', {
          sessionId,
          topicId: session.topicId,
          error: err instanceof Error ? err.message : String(err),
        });
        captureException(err, {
          profileId,
          extra: {
            site: 'submitSummary.autoNoteCreation',
            sessionId,
            topicId: session.topicId,
          },
        });
      }
    }
  }

  return {
    summary: {
      id: finalRow.id,
      sessionId: finalRow.sessionId,
      content: finalRow.content ?? input.content,
      aiFeedback: hasAvailableSummaryFeedback(finalRow.aiFeedback)
        ? finalRow.aiFeedback
        : null,
      feedbackStatus: hasAvailableSummaryFeedback(finalRow.aiFeedback)
        ? 'available'
        : 'unavailable',
      status: (finalRow.status === 'accepted' ? 'accepted' : 'submitted') as
        | 'accepted'
        | 'submitted',
      baseXp: xpInfo?.baseXp ?? null,
      reflectionBonusXp: xpInfo?.reflectionBonusXp ?? null,
    },
  };
}

const SUMMARY_FEEDBACK_RETRY_COOLDOWN_MS = 60_000;
const SUMMARY_FEEDBACK_RETRY_LEASE_MS = 30_000;
const SUMMARY_FEEDBACK_RETRY_COORDINATION_SOURCE = 'summary-feedback-retry';

async function summaryFeedbackRetryCoordinationId(
  profileId: string,
  sessionId: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${profileId}\0${sessionId}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function claimSummaryFeedbackRetry(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<ExpiringCoordinationClaim | null> {
  return claimExpiringCoordinationKey(
    db,
    SUMMARY_FEEDBACK_RETRY_COORDINATION_SOURCE,
    await summaryFeedbackRetryCoordinationId(profileId, sessionId),
    SUMMARY_FEEDBACK_RETRY_LEASE_MS,
  );
}

async function completeSummaryFeedbackRetry(
  db: Database,
  profileId: string,
  sessionId: string,
  claim: ExpiringCoordinationClaim,
  recoveredFeedback: string | null,
): Promise<typeof sessionSummaries.$inferSelect | null> {
  return db.transaction(async (tx) => {
    if (
      !(await lockActiveCoordinationClaim(
        tx as unknown as Database,
        claim,
        SUMMARY_FEEDBACK_RETRY_LEASE_MS,
      ))
    ) {
      return null;
    }

    const [current] = await tx
      .select()
      .from(sessionSummaries)
      .where(
        and(
          eq(sessionSummaries.profileId, profileId),
          eq(sessionSummaries.sessionId, sessionId),
        ),
      )
      .for('update')
      .limit(1);

    if (
      !current ||
      (current.status !== 'accepted' && current.status !== 'submitted') ||
      hasAvailableSummaryFeedback(current.aiFeedback)
    ) {
      await releaseCoordinationClaim(tx as unknown as Database, claim);
      return current ?? null;
    }

    if (recoveredFeedback !== null) {
      const [completed] = await tx
        .update(sessionSummaries)
        .set({ aiFeedback: recoveredFeedback })
        .where(
          and(
            eq(sessionSummaries.id, current.id),
            eq(sessionSummaries.profileId, profileId),
            eq(sessionSummaries.sessionId, sessionId),
          ),
        )
        .returning();
      await releaseCoordinationClaim(tx as unknown as Database, claim);
      return completed ?? null;
    }

    // One column serves both phases without learner-visible state: an active
    // claim expires after LEASE_MS; shifting its DB timestamp forward by the
    // difference makes an unavailable result eligible after COOLDOWN_MS.
    await deferCoordinationClaim(
      tx as unknown as Database,
      claim,
      SUMMARY_FEEDBACK_RETRY_COOLDOWN_MS - SUMMARY_FEEDBACK_RETRY_LEASE_MS,
    );
    return current;
  });
}

function toRetrySummaryResult(
  row: typeof sessionSummaries.$inferSelect,
): RetrySummaryFeedbackResult {
  const feedbackAvailable = hasAvailableSummaryFeedback(row.aiFeedback);
  return {
    summary: {
      id: row.id,
      sessionId: row.sessionId,
      content: row.content ?? '',
      aiFeedback: feedbackAvailable ? row.aiFeedback : null,
      feedbackStatus: feedbackAvailable ? 'available' : 'unavailable',
      status: row.status === 'accepted' ? 'accepted' : 'submitted',
    },
  };
}

/**
 * Re-evaluates only the feedback attached to a saved Session Summary.
 *
 * The existing webhook-idempotency table supplies an isolated atomic claim;
 * its namespaced row is untouched by summary writers and read models. Only
 * short claim/finalization transactions are held. The provider call happens
 * between them, and completion matches the exact claim timestamp so a stale
 * worker cannot overwrite a later lease holder.
 */
export async function retrySummaryFeedback(
  db: Database,
  profileId: string,
  sessionId: string,
  options?: { conversationLanguage?: ConversationLanguage },
): Promise<RetrySummaryFeedbackResult> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) throw new NotFoundError('Session');

  const observed = await findSessionSummaryRow(db, profileId, sessionId);
  if (
    !observed ||
    (observed.status !== 'accepted' && observed.status !== 'submitted')
  ) {
    throw new ConflictError('Submit the summary before retrying feedback');
  }
  if (hasAvailableSummaryFeedback(observed.aiFeedback)) {
    return toRetrySummaryResult(observed);
  }

  const claim = await claimSummaryFeedbackRetry(db, profileId, sessionId);
  if (!claim) {
    const current = await findSessionSummaryRow(db, profileId, sessionId);
    if (
      !current ||
      (current.status !== 'accepted' && current.status !== 'submitted')
    ) {
      throw new ConflictError('Submit the summary before retrying feedback');
    }
    return toRetrySummaryResult(current);
  }

  const reserved = await findSessionSummaryRow(db, profileId, sessionId);
  if (
    !reserved ||
    (reserved.status !== 'accepted' && reserved.status !== 'submitted')
  ) {
    await completeSummaryFeedbackRetry(db, profileId, sessionId, claim, null);
    throw new ConflictError('Submit the summary before retrying feedback');
  }
  if (hasAvailableSummaryFeedback(reserved.aiFeedback)) {
    const current = await completeSummaryFeedbackRetry(
      db,
      profileId,
      sessionId,
      claim,
      null,
    );
    return toRetrySummaryResult(current ?? reserved);
  }

  const subject = await getSubject(db, profileId, session.subjectId);
  const evaluation = await evaluateSummary(
    subject?.name ?? 'Unknown topic',
    'Session learning content',
    reserved.content ?? '',
    { conversationLanguage: options?.conversationLanguage },
  );
  const recoveredFeedback = hasAvailableSummaryFeedback(evaluation.feedback)
    ? evaluation.feedback
    : null;
  const completed = await completeSummaryFeedbackRetry(
    db,
    profileId,
    sessionId,
    claim,
    evaluation.feedbackStatus === 'available' ? recoveredFeedback : null,
  );

  if (completed) return toRetrySummaryResult(completed);

  const current = await findSessionSummaryRow(db, profileId, sessionId);
  if (
    !current ||
    (current.status !== 'accepted' && current.status !== 'submitted')
  ) {
    throw new ConflictError('Submit the summary before retrying feedback');
  }
  return toRetrySummaryResult(current);
}
