import {
  createScopedRepository,
  mentorNotices,
  type Database,
} from '@eduagent/database';
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { MentorNoticeAccepted } from '@eduagent/schemas';
import type { MentorNoticeRecheckOutcome } from '@eduagent/schemas';

import { evaluateLearningTextFields } from '../learning-text-safety/gate';
import { safeSend } from '../safe-non-core';
import { inngest } from '../../inngest/client';

interface MentorNoticeCopyInput {
  concept: string;
  correctionHint?: string | null;
  /**
   * [WI-2628] The vendor whose model authored this copy. Present on the exchange
   * path (`result.provider`, the same `result` that produced `noticedGap`), so
   * the gate can refer ambiguous copy to a judge that excludes it. Nullable
   * because an untyped or future caller may not have it — and a genuinely
   * unknown producer must fail closed, which AC-4 requires and the scan enforces.
   */
  producerVendor?: string | null;
}

interface AcceptMentorNoticeInput extends MentorNoticeCopyInput {
  profileId: string;
  subjectId: string;
  topicId: string | null;
  sourceSessionId: string;
  /** [WI-2629] The validated learner-answer event this notice's evidence is
   *  anchored to. `evidence.ts`'s exchange-boundary path never returns
   *  without one, and this is now the write boundary's hard requirement: a
   *  NEW notice must always carry evidence identity (AC-5). Legacy rows
   *  written before this change may still hold `answer_event_id IS NULL` in
   *  the database — the column itself stays nullable and both partial
   *  unique indexes below are still targeted so those rows remain readable
   *  and their invariants intact — but no new write is allowed to create
   *  one. `acceptMentorNotice` enforces this with a runtime guard below,
   *  since an untyped caller could still pass null/undefined at runtime. */
  answerEventId: string;
}

/**
 * [WI-2628] Notice copy is LLM-DERIVED, so this is the derived-write half of
 * AC-5's asymmetry: unsafe data is DROPPED, never raised. An unsafe `concept`
 * returns null and `acceptMentorNotice` writes no row at all; an unsafe
 * `correctionHint` is nulled and the notice persists without it. That is exactly
 * the shape the English-only guard had — only the gate behind it changed.
 *
 * ASYNC because the gate is: an ambiguous verdict is resolved by the independent
 * judge. The single caller (`acceptMentorNotice`) already awaited, and this runs
 * before its `db.insert`, so no LLM round-trip happens inside a transaction.
 *
 * `producerVendor` is THREADED, not defaulted. An earlier revision hard-coded
 * null here with a comment claiming the vendor was "not reachable" — that was
 * false: the exchange path has `result.provider` in scope and already passes it
 * as `tutorVendor` a few lines below its `createMentorNoticeFromExchange` call.
 * Hard-coding null meant every ambiguous notice concept blocked with `unclear`
 * and the notice was never written at all, with the judge never consulted.
 * AC-4's fail-closed-on-missing-producer exists for a GENUINELY unknown
 * producer, not for one the caller declined to thread. It still applies when the
 * value really is absent.
 *
 * `conversationLanguage: undefined` — no profile read on this path; the gate then
 * scans all ten attribution grammars and keeps the strictest verdict. Stricter
 * than any single language, and never `'en'`, which would reinstate the
 * English-only bug.
 */
export async function prepareMentorNoticeCopy(
  input: MentorNoticeCopyInput,
): Promise<{ concept: string; correctionHint: string | null } | null> {
  const trimmedConcept = input.concept.trim();
  const rawHint = input.correctionHint?.trim() || null;

  const gate = await evaluateLearningTextFields({
    conversationLanguage: undefined,
    provenance: 'llm',
    producerVendor: input.producerVendor,
    fields: [
      {
        key: 'concept',
        fieldKind: 'mentor_notice_concept',
        text: trimmedConcept,
      },
      {
        key: 'correctionHint',
        fieldKind: 'mentor_notice_correction_hint',
        text: rawHint,
      },
    ],
  });

  // An empty concept was already a no-write case before this change; keep that.
  if (!trimmedConcept || !gate.isSafe('concept')) return null;

  return {
    concept: trimmedConcept,
    correctionHint: gate.isSafe('correctionHint') ? rawHint : null,
  };
}

export async function acceptMentorNotice(
  db: Database,
  input: AcceptMentorNoticeInput,
): Promise<MentorNoticeAccepted | null> {
  // [WI-2629 AC-5] Write-boundary guard: a NEW notice must always carry a
  // validated answer-event identity. The type above requires a `string`, but
  // an untyped caller (JS, a stale build, a loosened cast) could still pass
  // null/undefined at runtime — reject rather than silently persist an
  // evidence-absent row. Legacy rows with `answer_event_id IS NULL` remain in
  // the database and readable; this only guards new writes.
  if (!input.answerEventId) return null;

  const copy = await prepareMentorNoticeCopy(input);
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
    // [WI-2500] Every new write now always carries evidence, so it always
    // collides on the (source_session_id, answer_event_id) partial index.
    // Postgres requires an EXACT target/predicate match to infer a conflict
    // against a partial index — a mismatched target doesn't silently no-op,
    // it raises the raw duplicate-key error. The evidence-absent
    // (`answer_event_id IS NULL`) partial index still exists in the schema
    // to preserve legacy row integrity, but it is unreachable from this
    // write path now that the guard above rejects null evidence.
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
        data: {
          noticeId: accepted.id,
          profileId: input.profileId,
          timestamp: new Date().toISOString(),
        },
      }),
    'notice.created',
    { profileId: input.profileId, noticeId: accepted.id },
  );
  return accepted;
}

/**
 * [WI-2599] The session receipt's projection semantics: **the NEWEST notice the
 * session produced**, ordered `createdAt DESC` with `id DESC` as the tiebreaker.
 *
 * This is a deliberate product decision, not a default. WI-2500 made a session
 * able to hold MORE THAN ONE notice (one per distinct answer event), but this
 * reader still had to hand `getSessionSummary` exactly one — and it was picking
 * with an unordered `findFirst`, so a two-gap session could surface either gap
 * depending on the query plan. Three candidate semantics were considered:
 *
 *   1. **Latest-by-createdAt — CHOSEN.** MMT-ADR-0036 §2.1 says the product
 *      exposes at most one actionable notice at a time while multiple durable
 *      records may exist, so a projection is required and must pick one. Newest
 *      is the defensible pick: the receipt is shown at session end, and the gap
 *      noticed last is the one closest to what the learner just did.
 *   2. **The notice matching the summary's answer event — REJECTED, no carrier.**
 *      `session_summaries` holds no answer-event reference (nor does any
 *      migration add one), and a summary covers the whole session rather than a
 *      single answer. Implementing it would mean a new column and write path,
 *      which is a product change, not a determinism fix.
 *   3. **An explicit one-notice-per-session invariant — REJECTED, contradicts
 *      landed canon.** It would revert WI-2500's two partial unique indexes
 *      (which exist precisely to allow a second, differently-evidenced notice)
 *      and contradict ADR-0036 §2.1's "multiple durable records may exist."
 *
 * The `id` tiebreaker is what makes the order TOTAL, and therefore the result
 * deterministic as the acceptance criterion words it: nothing constrains two
 * rows to distinct `createdAt` values (no unique index on it, and `defaultNow()`
 * is transaction-scoped, so rows written in one transaction share an instant).
 * `id` is a UUIDv7, so its order agrees with creation order rather than fighting
 * it. Same shape as `repository.memory.ts`'s `[asc(createdAt), asc(id)]`.
 *
 * Ordering is passed THROUGH the scoped repository (`mentorNotices.findFirst`
 * already takes an `orderBy`) rather than dropping to `db.select()` — the
 * ordering-inexpressibility deviation in AGENTS.md does not apply when the
 * scoped API can express it, and profile isolation must stay in the repo layer.
 *
 * No `status` filter is added: the receipt records what happened in that session
 * (ADR-0036 §2.2 lists the session receipt alongside cards), and filtering
 * would also silently change the recall-bridge suppression check in
 * `routes/sessions.ts` — beyond this item's scope.
 */
export async function getMentorNoticeReceipt(
  db: Database,
  profileId: string,
  sourceSessionId: string,
): Promise<MentorNoticeAccepted | null> {
  const repo = createScopedRepository(db, profileId);
  const notice = await repo.mentorNotices.findFirst(
    eq(mentorNotices.sourceSessionId, sourceSessionId),
    [desc(mentorNotices.createdAt), desc(mentorNotices.id)],
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
              timestamp: new Date().toISOString(),
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
          timestamp: new Date().toISOString(),
        },
      }),
    'notice.recheck_outcome',
    { profileId: input.profileId, noticeId: updated.id },
  );
  return updated;
}

/**
 * [WI-2627] The inactivity window a mentor notice must stay inside to remain
 * eligible, in days. ONE constant, because it now bounds two different things:
 * the nightly fade WRITE and the read-time collection FILTER. Two numbers would
 * drift, and a collection window wider than the fade window is exactly the
 * re-enable hole this closes.
 */
export const MENTOR_NOTICE_INACTIVITY_DAYS = 21;

/**
 * [WI-2627] "Last activity" for a mentor notice — the newest of its creation and
 * any offer / defer / recheck touch.
 *
 * Extracted from {@link fadeStaleMentorNotices}, whose WHERE clause was the only
 * definition, so the read-time filter in `now-feed.ts`'s
 * `collectMentorNoticeCandidates` applies the SAME expression. Filtering on
 * `createdAt` alone there would have been the near-miss: an old notice the
 * learner deferred yesterday is ACTIVE, and excluding it would hide a live
 * notice rather than a stale one.
 */
export function mentorNoticeLastActivityExpr() {
  return sql`greatest(${mentorNotices.createdAt}, coalesce(${mentorNotices.lastOfferedAt}, '-infinity'::timestamptz), coalesce(${mentorNotices.lastDeferredAt}, '-infinity'::timestamptz), coalesce(${mentorNotices.lastRecheckAt}, '-infinity'::timestamptz))`;
}

/** [WI-2627] The inactivity cutoff instant for a given `now`. */
export function mentorNoticeInactivityCutoff(now: Date): Date {
  return new Date(
    now.getTime() - MENTOR_NOTICE_INACTIVITY_DAYS * 24 * 60 * 60 * 1000,
  );
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
        lt(mentorNoticeLastActivityExpr(), cutoff),
      ),
    )
    .returning({ id: mentorNotices.id });
  return faded.length;
}
