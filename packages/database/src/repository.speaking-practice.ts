import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { Database } from './client';
import { speakingPracticeAttempts } from './schema/index';
import type { ScopedWhere } from './repository._shared';

/**
 * Speaking-practice attempt namespace of the profile-scoped repository
 * (WI-1777). Mirrors the `sessionEvents` read shape in
 * `repository.session.ts` — same triple-FK scoping (profile+subject+session).
 */
export function createSpeakingPracticeRepository(
  db: Database,
  profileId: string,
  scopedWhere: ScopedWhere,
) {
  return {
    speakingPracticeAttempts: {
      async findMany(extraWhere?: SQL, orderBy?: SQL | SQL[]) {
        return db.query.speakingPracticeAttempts.findMany({
          where: scopedWhere(speakingPracticeAttempts, extraWhere),
          ...(orderBy ? { orderBy } : {}),
        });
      },
      /**
       * Count existing attempts for this (session, targetText) pair, used to
       * derive the next `attemptNumber`. This is a single-scoped-table
       * aggregate `findFirst`/`findMany` can't express — the sanctioned
       * direct-`db.select` deviation, scoped through `scopedWhere` the same
       * as any other read here.
       */
      async countByTarget(
        sessionId: string,
        targetText: string,
      ): Promise<number> {
        const rows = await db
          .select({ count: sql<number>`count(*)` })
          .from(speakingPracticeAttempts)
          .where(
            scopedWhere(
              speakingPracticeAttempts,
              and(
                eq(speakingPracticeAttempts.sessionId, sessionId),
                eq(speakingPracticeAttempts.targetText, targetText),
              ),
            ),
          );
        return Number(rows[0]?.count ?? 0);
      },
      async insert(values: {
        sessionId: string;
        subjectId: string;
        mode: 'repeat_after_me' | 'shadowing';
        targetText: string;
        transcript: string;
        locale: string;
        attemptNumber: number;
        lexicalMatchScore: number;
        missingWords: string[];
        extraWords: string[];
      }) {
        const [row] = await db
          .insert(speakingPracticeAttempts)
          .values({ profileId, ...values })
          .returning();
        return row;
      },
    },
  };
}
