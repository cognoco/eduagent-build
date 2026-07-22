import { and, eq, gte, inArray, sql, type SQL } from 'drizzle-orm';
import type { Database } from './client';
import {
  learningSessions,
  assessments,
  retrievalEvents,
  sessionEvents,
  sessionSummaries,
  bookmarks,
  evidenceLinks,
  needsDeepeningTopics,
  onboardingDrafts,
  parkingLotItems,
  sessionEmbeddings,
  mentorNotices,
} from './schema/index';
import type { ScopedWhere } from './repository._shared';

/**
 * Session / assessment namespaces of the profile-scoped repository
 * (extracted from repository.ts, WI-1089). Behavior unchanged.
 */
export function createSessionRepository(
  db: Database,
  profileId: string,
  scopedWhere: ScopedWhere,
) {
  return {
    sessions: {
      async findMany(extraWhere?: SQL, limit?: number, orderBy?: SQL | SQL[]) {
        return db.query.learningSessions.findMany({
          where: scopedWhere(learningSessions, extraWhere),
          ...(limit ? { limit } : {}),
          ...(orderBy ? { orderBy } : {}),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.learningSessions.findFirst({
          where: scopedWhere(learningSessions, extraWhere),
        });
      },
      /**
       * Return topicIds this profile has *meaningfully completed* in a
       * learning session. Used by `resolveNextTopic` to skip topics the
       * learner has already worked through.
       *
       * Filters:
       * - `status IN ('completed','auto_closed')` — terminal states only.
       *   Active/paused sessions don't count: a learner mid-session or
       *   paused for later hasn't finished the topic.
       * - `exchange_count >= 3` — matches the recap-firing threshold in
       *   `session-recap.ts`. Below this, the session was too short to
       *   represent meaningful work; counting it would lock the learner
       *   out of topics they only briefly touched.
       */
      async listCompletedTopicIds(): Promise<string[]> {
        const rows = await db
          .select({ topicId: learningSessions.topicId })
          .from(learningSessions)
          .where(
            and(
              eq(learningSessions.profileId, profileId),
              sql`${learningSessions.topicId} IS NOT NULL`,
              inArray(learningSessions.status, ['completed', 'auto_closed']),
              gte(learningSessions.exchangeCount, 3),
            ),
          );
        return rows
          .map((row) => row.topicId)
          .filter((id): id is string => typeof id === 'string');
      },
    },

    assessments: {
      async findMany(extraWhere?: SQL) {
        return db.query.assessments.findMany({
          where: scopedWhere(assessments, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.assessments.findFirst({
          where: scopedWhere(assessments, extraWhere),
        });
      },
    },

    sessionEvents: {
      async findMany(extraWhere?: SQL, orderBy?: SQL | SQL[]) {
        return db.query.sessionEvents.findMany({
          where: scopedWhere(sessionEvents, extraWhere),
          ...(orderBy ? { orderBy } : {}),
        });
      },
      async findFirst(extraWhere?: SQL, orderBy?: SQL | SQL[]) {
        return db.query.sessionEvents.findFirst({
          where: scopedWhere(sessionEvents, extraWhere),
          ...(orderBy ? { orderBy } : {}),
        });
      },
      async findId(extraWhere?: SQL): Promise<{ id: string } | undefined> {
        const [row] = await db
          .select({ id: sessionEvents.id })
          .from(sessionEvents)
          .where(scopedWhere(sessionEvents, extraWhere))
          .limit(1);
        return row;
      },
    },

    retrievalEvents: {
      async findFirst(extraWhere?: SQL) {
        return db.query.retrievalEvents.findFirst({
          where: scopedWhere(retrievalEvents, extraWhere),
        });
      },
    },

    sessionSummaries: {
      async findMany(extraWhere?: SQL) {
        return db.query.sessionSummaries.findMany({
          where: scopedWhere(sessionSummaries, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.sessionSummaries.findFirst({
          where: scopedWhere(sessionSummaries, extraWhere),
        });
      },
    },

    bookmarks: {
      async findMany(extraWhere?: SQL) {
        return db.query.bookmarks.findMany({
          where: scopedWhere(bookmarks, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.bookmarks.findFirst({
          where: scopedWhere(bookmarks, extraWhere),
        });
      },
    },

    evidenceLinks: {
      async findMany(extraWhere?: SQL) {
        return db.query.evidenceLinks.findMany({
          where: scopedWhere(evidenceLinks, extraWhere),
        });
      },
    },

    needsDeepeningTopics: {
      async findMany(extraWhere?: SQL) {
        return db.query.needsDeepeningTopics.findMany({
          where: scopedWhere(needsDeepeningTopics, extraWhere),
        });
      },
    },

    onboardingDrafts: {
      async findMany(extraWhere?: SQL, orderBy?: SQL | SQL[], limit?: number) {
        return db.query.onboardingDrafts.findMany({
          where: scopedWhere(onboardingDrafts, extraWhere),
          ...(orderBy ? { orderBy } : {}),
          ...(limit !== undefined ? { limit } : {}),
        });
      },
      async findFirst(extraWhere?: SQL, orderBy?: SQL | SQL[]) {
        return db.query.onboardingDrafts.findFirst({
          where: scopedWhere(onboardingDrafts, extraWhere),
          ...(orderBy ? { orderBy } : {}),
        });
      },
    },

    parkingLotItems: {
      async findMany(extraWhere?: SQL) {
        return db.query.parkingLotItems.findMany({
          where: scopedWhere(parkingLotItems, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.parkingLotItems.findFirst({
          where: scopedWhere(parkingLotItems, extraWhere),
        });
      },
    },

    sessionEmbeddings: {
      async findMany(extraWhere?: SQL) {
        return db.query.sessionEmbeddings.findMany({
          where: scopedWhere(sessionEmbeddings, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.sessionEmbeddings.findFirst({
          where: scopedWhere(sessionEmbeddings, extraWhere),
        });
      },
    },

    mentorNotices: {
      async findMany(extraWhere?: SQL, orderBy?: SQL | SQL[]) {
        return db.query.mentorNotices.findMany({
          where: scopedWhere(mentorNotices, extraWhere),
          ...(orderBy ? { orderBy } : {}),
        });
      },
      async findFirst(extraWhere?: SQL, orderBy?: SQL | SQL[]) {
        return db.query.mentorNotices.findFirst({
          where: scopedWhere(mentorNotices, extraWhere),
          ...(orderBy ? { orderBy } : {}),
        });
      },
    },
  };
}
