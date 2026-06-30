import { and, desc, eq, lte, sql, type SQL } from 'drizzle-orm';
import type { Database } from './client';
import type { QuizActivityType } from '@eduagent/schemas';
import {
  quizRounds,
  quizMissedItems,
  quizMasteryItems,
  practiceActivityEvents,
} from './schema/index';
import type { ScopedWhere } from './repository._shared';

/**
 * Quiz/practice namespaces of the profile-scoped repository
 * (extracted from repository.ts, WI-1089). Behavior unchanged.
 */
export function createQuizRepository(
  db: Database,
  profileId: string,
  scopedWhere: ScopedWhere,
) {
  return {
    quizRounds: {
      async findMany(extraWhere?: SQL) {
        return db.query.quizRounds.findMany({
          where: scopedWhere(quizRounds, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.quizRounds.findFirst({
          where: scopedWhere(quizRounds, extraWhere),
        });
      },
      /** Look up a single round by id (scoped to the current profile). */
      async findById(roundId: string) {
        return db.query.quizRounds.findFirst({
          where: scopedWhere(quizRounds, eq(quizRounds.id, roundId)),
        });
      },
      /**
       * [BUG-851] Lock-and-read a round row inside a transaction. Used by
       * `completeQuizRound` to serialize the read-then-write window against
       * concurrent `appendRecordedAttempt` writes from `/quiz/check`. Without
       * `FOR UPDATE`, READ COMMITTED lets a check-call append (jsonb || UPDATE)
       * between this SELECT and the subsequent completion UPDATE — that
       * in-flight attempt is then overwritten by the stale snapshot. The
       * status='active' guard prevents double-completion but not lost writes.
       *
       * **Invariant [WI-350]:** must be called as the FIRST operation inside
       * `db.transaction()`. `.for('update')` is a no-op outside a transaction
       * (lock releases immediately on statement end), so calling this outside
       * a transaction silently removes all concurrency protection. Future
       * quiz-like multi-write flows that skip this lock reintroduce the race.
       *
       * Returns null when no row matches.
       */
      async findByIdForUpdate(roundId: string) {
        const rows = await db
          .select()
          .from(quizRounds)
          .where(scopedWhere(quizRounds, eq(quizRounds.id, roundId)))
          .for('update')
          .limit(1);
        return rows[0] ?? null;
      },
      async findRecentByActivity(
        activityType: (typeof quizRounds.$inferSelect)['activityType'],
        limit: number,
      ) {
        return db.query.quizRounds.findMany({
          where: scopedWhere(
            quizRounds,
            eq(quizRounds.activityType, activityType),
          ),
          orderBy: [desc(quizRounds.createdAt)],
          limit,
        });
      },
      /**
       * [CR-2026-05-19-H10] Fetch the most-recent COMPLETED rounds for a
       * given activity type. Used by the difficulty-bump check, which counts
       * perfect-score completions toward the bump threshold. The status
       * predicate is enforced in SQL — never filter status in application
       * code after a bare `findRecentByActivity` call, because abandoned
       * (prefetched-but-never-played) rounds will occupy slots in the
       * `limit` window and the bump will silently never fire.
       */
      async findRecentCompletedByActivity(
        activityType: (typeof quizRounds.$inferSelect)['activityType'],
        limit: number,
      ) {
        return db.query.quizRounds.findMany({
          where: scopedWhere(
            quizRounds,
            and(
              eq(quizRounds.activityType, activityType),
              eq(quizRounds.status, 'completed'),
            ),
          ),
          orderBy: [desc(quizRounds.completedAt)],
          limit,
        });
      },
      async findCompletedRecent(limit: number) {
        return db.query.quizRounds.findMany({
          where: scopedWhere(quizRounds, eq(quizRounds.status, 'completed')),
          orderBy: [desc(quizRounds.completedAt)],
          limit,
          columns: {
            id: true,
            activityType: true,
            theme: true,
            score: true,
            total: true,
            xpEarned: true,
            createdAt: true,
            completedAt: true,
          },
        });
      },
      async findCompletedForStreaks(limit: number) {
        return db.query.quizRounds.findMany({
          where: scopedWhere(quizRounds, eq(quizRounds.status, 'completed')),
          orderBy: [desc(quizRounds.completedAt)],
          limit,
          columns: {
            activityType: true,
            languageCode: true,
            results: true,
          },
        });
      },
      /**
       * [Q-10] [CR-3] Per-activity completed-round aggregates in a single
       * query. Uses `array_agg(... ORDER BY ratio DESC)[1]` to resolve the
       * best-round score/total in the same GROUP BY scan — no correlated
       * subqueries, single table pass regardless of activity type count.
       *
       * [BUG-926] Groups by (activityType, languageCode) so vocabulary rounds
       * for different languages produce separate stat rows. languageCode is
       * NULL for capitals and guess_who rounds.
       */
      async aggregateCompletedStats() {
        const rows = await db
          .select({
            activityType: quizRounds.activityType,
            languageCode: quizRounds.languageCode,
            roundsPlayed: sql<number>`count(*)::int`,
            totalXp: sql<number>`coalesce(sum(${quizRounds.xpEarned}), 0)::int`,
            bestScore: sql<number | null>`(array_agg(
              ${quizRounds.score}
              order by cast(${quizRounds.score} as float)
                / nullif(${quizRounds.total}, 0) desc nulls last
            ))[1]::int`,
            bestTotal: sql<number | null>`(array_agg(
              ${quizRounds.total}
              order by cast(${quizRounds.score} as float)
                / nullif(${quizRounds.total}, 0) desc nulls last
            ))[1]::int`,
          })
          .from(quizRounds)
          .where(
            and(
              eq(quizRounds.profileId, profileId),
              eq(quizRounds.status, 'completed'),
            ),
          )
          .groupBy(quizRounds.activityType, quizRounds.languageCode);

        return rows.map((row) => ({
          activityType: row.activityType,
          languageCode: row.languageCode ?? null,
          roundsPlayed: row.roundsPlayed,
          totalXp: row.totalXp,
          bestScore: row.bestScore ?? null,
          bestTotal: row.bestTotal ?? null,
        }));
      },
      async insert(values: Omit<typeof quizRounds.$inferInsert, 'profileId'>) {
        const [row] = await db
          .insert(quizRounds)
          .values({ ...values, profileId })
          .returning({ id: quizRounds.id });
        return row;
      },
      /**
       * Atomically mark an ACTIVE round completed. Returns the affected row if
       * the UPDATE actually changed status 'active' → 'completed' (under the
       * profile scope). Returns undefined if another caller has already
       * completed the round, which callers MUST translate to a ConflictError.
       *
       * Uses `WHERE status = 'active'` so concurrent complete calls can't
       * double-award XP — only one UPDATE wins.
       */
      async completeActive(
        roundId: string,
        values: {
          results: unknown;
          score: number;
          xpEarned: number;
          completedAt: Date;
        },
      ) {
        const rows = await db
          .update(quizRounds)
          .set({
            results: values.results,
            score: values.score,
            xpEarned: values.xpEarned,
            status: 'completed',
            completedAt: values.completedAt,
          })
          .where(
            and(
              eq(quizRounds.id, roundId),
              eq(quizRounds.profileId, profileId),
              eq(quizRounds.status, 'active'),
            ),
          )
          .returning({ id: quizRounds.id });
        return rows[0];
      },
    },

    quizMissedItems: {
      async findMany(extraWhere?: SQL) {
        return db.query.quizMissedItems.findMany({
          where: scopedWhere(quizMissedItems, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.quizMissedItems.findFirst({
          where: scopedWhere(quizMissedItems, extraWhere),
        });
      },
      async insertMany(
        values: Array<Omit<typeof quizMissedItems.$inferInsert, 'profileId'>>,
      ) {
        if (values.length === 0) return [];

        // [BUG-566] Validate every distinct sourceRoundId belongs to this
        // profileId. The FK only guarantees the round exists — it does not
        // guarantee it belongs to the current profile. A caller could supply
        // a sourceRoundId from a different profile, breaking cross-account
        // audit invariants.
        const distinctRoundIds = [
          ...new Set(values.map((v) => v.sourceRoundId)),
        ];
        for (const roundId of distinctRoundIds) {
          const round = await db.query.quizRounds.findFirst({
            where: scopedWhere(quizRounds, eq(quizRounds.id, roundId)),
          });
          if (!round) {
            throw new Error(
              `[BUG-566] quizMissedItems.insertMany: sourceRoundId ${roundId} does not belong to profileId ${profileId}`,
            );
          }
        }

        return db
          .insert(quizMissedItems)
          .values(values.map((v) => ({ ...v, profileId })))
          .returning({ id: quizMissedItems.id });
      },
      async markSurfaced(
        activityType: (typeof quizMissedItems.$inferSelect)['activityType'],
      ) {
        const rows = await db
          .update(quizMissedItems)
          .set({ surfaced: true })
          .where(
            and(
              eq(quizMissedItems.profileId, profileId),
              eq(quizMissedItems.activityType, activityType),
              eq(quizMissedItems.surfaced, false),
            ),
          )
          .returning({ id: quizMissedItems.id });
        return rows.length;
      },
    },

    quizMasteryItems: {
      async findDueByActivity(activityType: QuizActivityType, limit: number) {
        return db.query.quizMasteryItems.findMany({
          where: scopedWhere(
            quizMasteryItems,
            and(
              eq(quizMasteryItems.activityType, activityType),
              lte(quizMasteryItems.nextReviewAt, new Date()),
            ),
          ),
          orderBy: [quizMasteryItems.nextReviewAt],
          limit,
        });
      },

      async upsertFromCorrectAnswer(values: {
        activityType: QuizActivityType;
        itemKey: string;
        itemAnswer: string;
      }) {
        const now = new Date();
        const nextReview = new Date(now);
        nextReview.setDate(nextReview.getDate() + 1);

        const [row] = await db
          .insert(quizMasteryItems)
          .values({
            profileId,
            activityType: values.activityType,
            itemKey: values.itemKey,
            itemAnswer: values.itemAnswer,
            easeFactor: 2.5,
            interval: 1,
            repetitions: 0,
            nextReviewAt: nextReview,
            // [CR-2026-05-19-H9] Initialize lastReviewedAt to the moment of
            // the discovery answer. SM-2's first re-review will compute the
            // inter-review gap from this timestamp.
            lastReviewedAt: now,
          })
          .onConflictDoNothing({
            target: [
              quizMasteryItems.profileId,
              quizMasteryItems.activityType,
              quizMasteryItems.itemKey,
            ],
          })
          .returning({ id: quizMasteryItems.id });
        return row ?? null;
      },

      async updateSm2(
        itemKey: string,
        activityType: QuizActivityType,
        values: {
          easeFactor: number;
          interval: number;
          repetitions: number;
          nextReviewAt: Date;
        },
      ) {
        // [CR-2026-05-19-H9] `lastReviewedAt` is set ONLY here (and on initial
        // insert in upsertFromCorrectAnswer). MC-streak writes
        // (incrementMcSuccessCount / resetMcSuccessCount) must NOT touch this
        // column, or SM-2's next-review interval math will be computed from a
        // bogus "just reviewed" timestamp and items will resurface too soon.
        const now = new Date();
        return db
          .update(quizMasteryItems)
          .set({
            easeFactor: values.easeFactor,
            interval: values.interval,
            repetitions: values.repetitions,
            nextReviewAt: values.nextReviewAt,
            lastReviewedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(quizMasteryItems.profileId, profileId),
              eq(quizMasteryItems.activityType, activityType),
              eq(quizMasteryItems.itemKey, itemKey),
            ),
          )
          .returning({ id: quizMasteryItems.id });
      },

      async findByKey(activityType: QuizActivityType, itemKey: string) {
        return db.query.quizMasteryItems.findFirst({
          where: scopedWhere(
            quizMasteryItems,
            and(
              eq(quizMasteryItems.activityType, activityType),
              eq(quizMasteryItems.itemKey, itemKey),
            ),
          ),
        });
      },

      async incrementMcSuccessCount(
        itemKey: string,
        activityType: QuizActivityType,
      ) {
        return db
          .update(quizMasteryItems)
          .set({
            mcSuccessCount: sql`${quizMasteryItems.mcSuccessCount} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(quizMasteryItems.profileId, profileId),
              eq(quizMasteryItems.activityType, activityType),
              eq(quizMasteryItems.itemKey, itemKey),
            ),
          )
          .returning({
            id: quizMasteryItems.id,
            mcSuccessCount: quizMasteryItems.mcSuccessCount,
          });
      },

      async resetMcSuccessCount(
        itemKey: string,
        activityType: QuizActivityType,
        resetTo: number,
      ) {
        return db
          .update(quizMasteryItems)
          .set({
            mcSuccessCount: resetTo,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(quizMasteryItems.profileId, profileId),
              eq(quizMasteryItems.activityType, activityType),
              eq(quizMasteryItems.itemKey, itemKey),
            ),
          )
          .returning({ id: quizMasteryItems.id });
      },
    },

    practiceActivityEvents: {
      async findMany(extraWhere?: SQL) {
        return db.query.practiceActivityEvents.findMany({
          where: scopedWhere(practiceActivityEvents, extraWhere),
        });
      },
    },
  };
}
