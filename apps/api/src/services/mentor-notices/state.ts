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
   *  anchored to. Always present for new notices — `evidence.ts` never
   *  returns without one — required so the DB unique constraint below can
   *  be evidence-aware instead of source-session-only. */
  answerEventId: string;
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
    // [WI-2500] Target the evidence-backed partial unique index — every
    // fresh notice always carries an answerEventId (evidence.ts guarantees
    // it), so this is always the applicable index, not the legacy
    // NULL-evidence one. A stale/mismatched target here would silently
    // no-op instead of erroring, masking a real duplicate-insert bug.
    .onConflictDoNothing({
      target: [mentorNotices.sourceSessionId, mentorNotices.answerEventId],
      where: sql`${mentorNotices.answerEventId} IS NOT NULL`,
    })
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

  const terminal =
    input.outcome === 'locked_in' || input.outcome === 'dismissed';
  const nextStatus =
    input.outcome === 'locked_in'
      ? 'locked_in'
      : input.outcome === 'dismissed'
        ? 'dismissed'
        : 'open';
  const [updated] = await db
    .update(mentorNotices)
    .set({
      status: nextStatus,
      resolvedAt: terminal ? occurredAt : null,
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
