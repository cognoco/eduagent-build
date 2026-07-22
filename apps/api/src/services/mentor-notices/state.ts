import {
  createScopedRepository,
  mentorNotices,
  type Database,
} from '@eduagent/database';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { MentorNoticeAccepted } from '@eduagent/schemas';
import type { MentorNoticeRecheckOutcome } from '@eduagent/schemas';

import { scrubClinicalInferenceFromLearningRecord } from '../persisted-learning-text-guard';
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
  /** [WI-2500] The validated learner-answer event this notice's evidence is
   *  anchored to. `evidence.ts`'s exchange-boundary path never returns
   *  without one, but callers that predate WI-2500 (e.g. the pre-existing
   *  concurrency test in `tests/integration/mentor-notice-lifecycle.integration.test.ts`)
   *  still insert with no evidence, so this stays nullable and both
   *  partial unique indexes below must be targeted, not just one. */
  answerEventId: string | null;
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
      answerEventId: input.answerEventId,
      concept: copy.concept,
      correctionHint: copy.correctionHint,
    })
    // [WI-2500] Target must match whichever partial index this row would
    // violate: evidence-present rows collide on the (source_session_id,
    // answer_event_id) index, evidence-absent rows on the source_session_id-only
    // index. Postgres requires an EXACT target/predicate match to infer a
    // conflict against a partial index — a mismatched target doesn't
    // silently no-op, it raises the raw duplicate-key error (caught in CI by
    // the pre-existing null-evidence concurrency test).
    .onConflictDoNothing(
      input.answerEventId
        ? {
            target: [
              mentorNotices.sourceSessionId,
              mentorNotices.answerEventId,
            ],
            where: sql`${mentorNotices.answerEventId} IS NOT NULL`,
          }
        : {
            target: [mentorNotices.sourceSessionId],
            where: sql`${mentorNotices.answerEventId} IS NULL`,
          },
    )
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
    const [deferred] = await db
      .update(mentorNotices)
      .set({
        lastDeferredAt: occurredAt,
        lastRecheckOutcome: 'deferred',
        nudgeStatus: sql`case when ${mentorNotices.nudgeStatus} = 'pending' then 'suppressed'::mentor_notice_nudge_status else ${mentorNotices.nudgeStatus} end`,
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

  // [WI-2501] 'deferred' returned above; every remaining outcome
  // (locked_in, dismissed, not_yet) is itself a terminal, non-open status —
  // a completed not_yet re-check must stop being open-offer/Now-feed/
  // re-check-context eligible exactly like locked_in/dismissed do, so it
  // gets its own canonical terminal status rather than falling back to
  // 'open'.
  const nextStatus = input.outcome;
  const [updated] = await db
    .update(mentorNotices)
    .set({
      status: nextStatus,
      resolvedAt: occurredAt,
      firstRecheckAt: sql`coalesce(${mentorNotices.firstRecheckAt}, ${occurredAt})`,
      lastRecheckAt: occurredAt,
      lastRecheckOutcome: input.outcome,
      recheckAttemptCount: sql`${mentorNotices.recheckAttemptCount} + 1`,
      nudgeStatus: sql`case when ${mentorNotices.nudgeStatus} = 'pending' then 'suppressed'::mentor_notice_nudge_status else ${mentorNotices.nudgeStatus} end`,
    })
    .where(
      and(
        eq(mentorNotices.id, input.noticeId),
        eq(mentorNotices.profileId, input.profileId),
        eq(mentorNotices.status, 'open'),
      ),
    )
    .returning();
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
      nudgeStatus: sql`case when ${mentorNotices.nudgeStatus} = 'pending' then 'suppressed'::mentor_notice_nudge_status else ${mentorNotices.nudgeStatus} end`,
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
