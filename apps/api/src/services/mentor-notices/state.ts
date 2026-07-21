import {
  createScopedRepository,
  mentorNotices,
  type Database,
} from '@eduagent/database';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { MentorNoticeAccepted } from '@eduagent/schemas';
import type { MentorNoticeRecheckOutcome } from '@eduagent/schemas';

import { scrubClinicalInferenceFromLearningRecord } from '../persisted-learning-text-guard';
import {
  acquireCoordinationLock,
  mentorNoticeDeliveryKey,
} from '../notification-coordination';
import { DELIVERY_LOCK_HOLD_MS } from './nudge';

/** How long a notice state transition waits for an in-flight delivery. */
const NOTICE_LOCK_WAIT_MS = DELIVERY_LOCK_HOLD_MS + 1_000;
import { safeSend } from '../safe-non-core';
import { inngest } from '../../inngest/client';

interface MentorNoticeCopyInput {
  concept: string;
  correctionHint?: string | null;
}

interface AcceptMentorNoticeInput extends MentorNoticeCopyInput {
  profileId: string;
  subjectId: string;
  topicId: string | null;
  sourceSessionId: string;
}

export function prepareMentorNoticeCopy(
  input: MentorNoticeCopyInput,
): { concept: string; correctionHint: string | null } | null {
  const concept = scrubClinicalInferenceFromLearningRecord(
    input.concept.trim(),
  );
  if (!concept) return null;

  const rawHint = input.correctionHint?.trim() || null;
  const correctionHint = scrubClinicalInferenceFromLearningRecord(rawHint);
  return { concept, correctionHint };
}

export async function acceptMentorNotice(
  db: Database,
  input: AcceptMentorNoticeInput,
): Promise<MentorNoticeAccepted | null> {
  const copy = prepareMentorNoticeCopy(input);
  if (!copy) return null;

  const [accepted] = await db
    .insert(mentorNotices)
    .values({
      profileId: input.profileId,
      subjectId: input.subjectId,
      topicId: input.topicId,
      sourceSessionId: input.sourceSessionId,
      concept: copy.concept,
      correctionHint: copy.correctionHint,
    })
    .onConflictDoNothing({ target: mentorNotices.sourceSessionId })
    .returning({
      id: mentorNotices.id,
      concept: mentorNotices.concept,
      correctionHint: mentorNotices.correctionHint,
    });

  if (!accepted) return null;
  await safeSend(
    () =>
      inngest.send({
        // orphan-allow: observability-only lifecycle marker; no in-process handler.
        name: 'app/notice.created',
        data: { noticeId: accepted.id, profileId: input.profileId },
      }),
    'notice.created',
    { profileId: input.profileId, noticeId: accepted.id },
  );
  return accepted;
}

export async function getMentorNoticeReceipt(
  db: Database,
  profileId: string,
  sourceSessionId: string,
): Promise<MentorNoticeAccepted | null> {
  const repo = createScopedRepository(db, profileId);
  const notice = await repo.mentorNotices.findFirst(
    eq(mentorNotices.sourceSessionId, sourceSessionId),
  );
  if (!notice) return null;
  return {
    id: notice.id,
    concept: notice.concept,
    correctionHint: notice.correctionHint,
  };
}

export async function findOpenMentorNotice(
  db: Database,
  profileId: string,
  noticeId: string,
) {
  const repo = createScopedRepository(db, profileId);
  return (
    (await repo.mentorNotices.findFirst(
      and(eq(mentorNotices.id, noticeId), eq(mentorNotices.status, 'open')),
    )) ?? null
  );
}

export async function stampMentorNoticeOffer(
  db: Database,
  input: {
    profileId: string;
    noticeId: string;
    sessionId: string;
    offeredAt?: Date;
  },
) {
  const offeredAt = input.offeredAt ?? new Date();
  const [notice] = await db
    .update(mentorNotices)
    .set({
      lastOfferedSessionId: input.sessionId,
      lastOfferedAt: offeredAt,
      offerCount: sql`${mentorNotices.offerCount} + 1`,
    })
    .where(
      and(
        eq(mentorNotices.id, input.noticeId),
        eq(mentorNotices.profileId, input.profileId),
        eq(mentorNotices.status, 'open'),
        or(
          isNull(mentorNotices.lastOfferedSessionId),
          sql`${mentorNotices.lastOfferedSessionId} <> ${input.sessionId}`,
        ),
      ),
    )
    .returning();
  return notice ?? null;
}

/**
 * [WI-2503] Runs `fn` in a transaction holding Knotice — the once-ever
 * mentor-notice delivery/defer identity — so every notice state transition
 * linearizes against the nudge sender's delivery claim.
 */
async function withNoticeDeliveryLock<T>(
  db: Database,
  input: { profileId: string; noticeId: string },
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Database;
    // Defers arrive on a synchronous learner request. The delivery transaction
    // caps its own hold at DELIVERY_LOCK_HOLD_MS, so waiting slightly longer
    // than that means something else is wrong — fail loudly instead of hanging
    // the request.
    // SET LOCAL takes no bind parameters; the value is a numeric constant.
    await tx.execute(
      sql.raw(`SET LOCAL lock_timeout = ${NOTICE_LOCK_WAIT_MS}`),
    );
    await acquireCoordinationLock(
      tx,
      mentorNoticeDeliveryKey(input.profileId, input.noticeId),
    );
    return fn(tx);
  });
}

export async function applyMentorNoticeOutcome(
  db: Database,
  input: {
    profileId: string;
    noticeId: string;
    outcome: MentorNoticeRecheckOutcome;
    occurredAt?: Date;
    /** Start of the current shifted learning day; required for idempotent defer. */
    learningDayStart?: Date;
  },
) {
  const occurredAt = input.occurredAt ?? new Date();

  if (input.outcome === 'deferred') {
    const dayStart = input.learningDayStart ?? occurredAt;
    // [WI-2503] Knotice — the once-ever delivery/defer identity. Taking it here
    // linearizes the defer against the nudge sender's claim: the defer either
    // commits before the claim (suppressing a still-`pending` notice, so no push
    // is sent) or after it (the notice is `sending`/`sent`, so the suppression
    // is a no-op and the single push stands). No interleaving delivers a push
    // after a committed defer.
    const deferred = await withNoticeDeliveryLock(db, input, async (tx) => {
      const [row] = await tx
        .update(mentorNotices)
        .set({
          lastDeferredAt: occurredAt,
          lastRecheckOutcome: 'deferred',
          nudgeStatus: sql`case when ${mentorNotices.nudgeStatus} in ('pending', 'reserved') then 'suppressed'::mentor_notice_nudge_status else ${mentorNotices.nudgeStatus} end`,
        })
        .where(
          and(
            eq(mentorNotices.id, input.noticeId),
            eq(mentorNotices.profileId, input.profileId),
            eq(mentorNotices.status, 'open'),
            or(
              isNull(mentorNotices.lastDeferredAt),
              lt(mentorNotices.lastDeferredAt, dayStart),
            ),
          ),
        )
        .returning();
      return row;
    });
    if (deferred) {
      await safeSend(
        () =>
          inngest.send({
            // orphan-allow: observability-only lifecycle marker; no in-process handler.
            name: 'app/notice.recheck_outcome',
            data: {
              noticeId: deferred.id,
              profileId: input.profileId,
              outcome: 'deferred',
            },
          }),
        'notice.recheck_outcome',
        { profileId: input.profileId, noticeId: deferred.id },
      );
      return deferred;
    }

    const existing = await findOpenMentorNotice(
      db,
      input.profileId,
      input.noticeId,
    );
    return existing?.lastDeferredAt && existing.lastDeferredAt >= dayStart
      ? existing
      : null;
  }

  const terminal =
    input.outcome === 'locked_in' || input.outcome === 'dismissed';
  const nextStatus =
    input.outcome === 'locked_in'
      ? 'locked_in'
      : input.outcome === 'dismissed'
        ? 'dismissed'
        : 'open';
  // Terminal outcomes also suppress a pending nudge, so they linearize under
  // Knotice for the same reason the defer branch does. [WI-2503]
  const updated = await withNoticeDeliveryLock(db, input, async (tx) => {
    const [row] = await tx
      .update(mentorNotices)
      .set({
        status: nextStatus,
        resolvedAt: terminal ? occurredAt : null,
        firstRecheckAt: sql`coalesce(${mentorNotices.firstRecheckAt}, ${occurredAt})`,
        lastRecheckAt: occurredAt,
        lastRecheckOutcome: input.outcome,
        recheckAttemptCount: sql`${mentorNotices.recheckAttemptCount} + 1`,
        nudgeStatus: sql`case when ${mentorNotices.nudgeStatus} in ('pending', 'reserved') then 'suppressed'::mentor_notice_nudge_status else ${mentorNotices.nudgeStatus} end`,
      })
      .where(
        and(
          eq(mentorNotices.id, input.noticeId),
          eq(mentorNotices.profileId, input.profileId),
          eq(mentorNotices.status, 'open'),
        ),
      )
      .returning();
    return row;
  });
  if (!updated) return null;
  await safeSend(
    () =>
      inngest.send({
        // orphan-allow: observability-only lifecycle marker; no in-process handler.
        name: 'app/notice.recheck_outcome',
        data: {
          noticeId: updated.id,
          profileId: input.profileId,
          outcome: input.outcome,
        },
      }),
    'notice.recheck_outcome',
    { profileId: input.profileId, noticeId: updated.id },
  );
  return updated;
}

export async function fadeStaleMentorNotices(
  db: Database,
  cutoff: Date,
): Promise<number> {
  // scope-allow: system maintenance job intentionally fades stale open notices across profiles.
  const faded = await db
    .update(mentorNotices)
    .set({
      status: 'faded',
      resolvedAt: new Date(),
      nudgeStatus: sql`case when ${mentorNotices.nudgeStatus} in ('pending', 'reserved') then 'suppressed'::mentor_notice_nudge_status else ${mentorNotices.nudgeStatus} end`,
    })
    .where(
      and(
        eq(mentorNotices.status, 'open'),
        lt(
          sql`greatest(${mentorNotices.createdAt}, coalesce(${mentorNotices.lastOfferedAt}, '-infinity'::timestamptz), coalesce(${mentorNotices.lastDeferredAt}, '-infinity'::timestamptz), coalesce(${mentorNotices.lastRecheckAt}, '-infinity'::timestamptz))`,
          cutoff,
        ),
      ),
    )
    .returning({ id: mentorNotices.id });
  return faded.length;
}
