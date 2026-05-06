// @inngest-admin: cross-profile
//
// This function is intentionally cross-profile. It is a one-shot ops sweep
// that scans all learning sessions created in the last 14 days whose filing
// status is stranded (completed/auto-closed but never filed), then dispatches
// synthetic filing-timed-out events to recover them. Profile-scoping rules in
// CLAUDE.md ("Reads must use createScopedRepository") do NOT apply here —
// this is system-wide maintenance work running outside any single profile's
// request context.
//
// If you add raw drizzle queries to this file, ensure they cannot leak
// data between profiles in user-visible output (notifications,
// recommendations). When in doubt, scope by profileId at the leaf even
// when scanning broadly.
//
// Ops-only: fire manually from Inngest dashboard after a confirmed
// cold-start or deploy incident that left sessions stranded.
// No automatic trigger by design — see filing-timed-out-observer design doc
// (docs/_archive/specs/Done/2026-04-29-filing-timed-out-observer-design.md).
// A cron-driven janitor would silently file sessions that piled up because
// filing-completed-observe or filing-timed-out-observe regressed, masking the
// live-path bug. The manual trigger forces an operator to ask "why are there
// stranded sessions?" before recovering them. Do not fire speculatively.

import { and, asc, eq, gt, gte, inArray, isNull, or } from 'drizzle-orm';
import { learningSessions } from '@eduagent/database';
import { filingTimedOutEventSchema } from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';

// Optional cursor passed when a prior capped run self-reinvokes. Using a
// composite (createdAt, id) cursor guarantees deterministic pagination even
// when many sessions share the same createdAt timestamp.
interface BackfillCursor {
  lastCreatedAt: string; // ISO-8601
  lastId: string;
}

export const filingStrandedBackfill = inngest.createFunction(
  {
    id: 'filing-stranded-backfill',
    name: 'One-shot backfill of stranded filing sessions',
  },
  { event: 'app/maintenance.filing_stranded_backfill' },
  async ({ event, step }) => {
    // Cursor is absent on the first run; present on self-reinvoked runs.
    const rawData = (event.data ?? {}) as Partial<BackfillCursor>;
    const cursor: BackfillCursor | null =
      rawData.lastCreatedAt != null && rawData.lastId != null
        ? { lastCreatedAt: rawData.lastCreatedAt, lastId: rawData.lastId }
        : null;

    const stranded = await step.run('find-stranded', async () => {
      const db = getStepDatabase();
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      // [CR-PR129-M9] Composite (createdAt, id) cursor keeps the batch
      // boundary stable when multiple sessions share the same timestamp.
      // The cursor condition is: (createdAt > lastCreatedAt)
      //                       OR (createdAt = lastCreatedAt AND id > lastId)
      const cursorFilter = cursor
        ? or(
            gt(learningSessions.createdAt, new Date(cursor.lastCreatedAt)),
            and(
              eq(learningSessions.createdAt, new Date(cursor.lastCreatedAt)),
              gt(learningSessions.id, cursor.lastId)
            )
          )
        : undefined;

      return db.query.learningSessions.findMany({
        where: and(
          isNull(learningSessions.topicId),
          isNull(learningSessions.filedAt),
          isNull(learningSessions.filingStatus),
          inArray(learningSessions.sessionType, ['learning', 'homework']),
          inArray(learningSessions.status, ['completed', 'auto_closed']),
          gte(learningSessions.createdAt, cutoff),
          cursorFilter
        ),
        columns: {
          id: true,
          profileId: true,
          sessionType: true,
          createdAt: true,
        },
        // [CR-PR129-M9] Secondary sort on id breaks ties for rows sharing
        // the same createdAt, making the batch window fully deterministic.
        orderBy: [asc(learningSessions.createdAt), asc(learningSessions.id)],
        limit: 500,
      });
    });

    for (const session of stranded) {
      const createdAt = new Date(session.createdAt);
      await step.sendEvent(`synthetic-timeout-${session.id}`, {
        name: 'app/session.filing_timed_out',
        data: filingTimedOutEventSchema.parse({
          sessionId: session.id,
          profileId: session.profileId,
          sessionType: session.sessionType,
          timeoutMs: 60_000,
          timestamp: createdAt.toISOString(),
        }),
      });
    }

    const capped = stranded.length === 500;

    // [CR-FIL-LIMIT-AUTORESUME-09] When the limit was hit, self-trigger another
    // run so operators don't have to remember to manually re-fire after a
    // cold-start incident. The 5-minute cooldown gives the prior batch's
    // filing-timed-out-observe runs time to flip filingStatus on those rows
    // so the next query's `isNull(filingStatus)` filter excludes them.
    //
    // Status flip happens in TWO stages inside filing-timed-out-observe:
    //   (a) `mark-pending-and-claim-retry-slot` flips filingStatus to
    //       'filing_pending' immediately at step start (within seconds of
    //        dispatch).
    //   (b) After a 60s waitForEvent window, the observer flips to
    //       'filing_failed' (CAS-protected) or leaves the recovered status
    //       set by filing-completed-observe alone.
    // The 5-minute cooldown is generous slack on stage (b). DO NOT shorten
    // it to "just past 60s" — the wait is per-session-event, not aligned
    // with the backfill's dispatch tick, and Inngest scheduling jitter on
    // the dispatched events plus retry backoff can push real flip time
    // well past 60s. Stage (a) alone is enough for `isNull(filingStatus)`
    // to exclude the row, but only AFTER the dispatched event has been
    // picked up — which can lag under concurrency.
    //
    // Termination: each self-trigger consumes the oldest 500 still-stranded
    // sessions; the 14-day createdAt cutoff is the natural ceiling, so the
    // chain cannot loop indefinitely on a healthy database.
    let selfReinvoked = false;
    if (capped) {
      // Pass the last row's (createdAt, id) so the next run can use a
      // composite cursor and skip rows it has already processed, even in
      // the race window before filingStatus has been flipped.
      const last = stranded[stranded.length - 1];
      if (last) {
        const nextCursor: BackfillCursor = {
          lastCreatedAt: new Date(last.createdAt).toISOString(),
          lastId: last.id,
        };
        await step.sleep('backfill-cooldown', '5m');
        await step.sendEvent('continue-stranded-backfill', {
          name: 'app/maintenance.filing_stranded_backfill',
          data: nextCursor,
        });
        selfReinvoked = true;
      }
    }

    return { dispatched: stranded.length, capped, selfReinvoked };
  }
);
