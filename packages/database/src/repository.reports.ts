import { and, desc, eq, type SQL } from 'drizzle-orm';
import type { Database } from './client';
import {
  monthlyReports,
  weeklyReports,
  progressSummaries,
  milestones,
  pendingNotices,
} from './schema/index';
import type { ScopedWhere } from './repository._shared';

/**
 * Reports / progress / notices namespaces of the profile-scoped repository
 * (extracted from repository.ts, WI-1089). Behavior unchanged.
 */
export function createReportsRepository(
  db: Database,
  profileId: string,
  scopedWhere: ScopedWhere,
) {
  return {
    monthlyReports: {
      async findMany(extraWhere?: SQL, options?: { limit?: number }) {
        return db.query.monthlyReports.findMany({
          where: scopedWhere(monthlyReports, extraWhere),
          orderBy: desc(monthlyReports.reportMonth),
          ...(options?.limit ? { limit: options.limit } : {}),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.monthlyReports.findFirst({
          where: scopedWhere(monthlyReports, extraWhere),
        });
      },
    },
    weeklyReports: {
      async findMany(extraWhere?: SQL, options?: { limit?: number }) {
        return db.query.weeklyReports.findMany({
          where: scopedWhere(weeklyReports, extraWhere),
          orderBy: desc(weeklyReports.reportWeek),
          ...(options?.limit ? { limit: options.limit } : {}),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.weeklyReports.findFirst({
          where: scopedWhere(weeklyReports, extraWhere),
        });
      },
    },

    // [BUG-219 / P1-HIGH] progressSummaries — scoped-repo helpers. Previously
    // every caller had to repeat `eq(progressSummaries.profileId, X)` by hand
    // (or worse, query the table by id alone), opening the door to cross-
    // profile reads. Centralising the predicate here makes the contract
    // enforceable by `profile-isolation.test.ts` and matches every other
    // single-table scoped namespace above.
    progressSummaries: {
      async findMany(extraWhere?: SQL) {
        return db.query.progressSummaries.findMany({
          where: scopedWhere(progressSummaries, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.progressSummaries.findFirst({
          where: scopedWhere(progressSummaries, extraWhere),
        });
      },
    },

    // [BUG-219 / P1-HIGH] milestones — same rationale as progressSummaries.
    // `findById` enforces profileId in the WHERE clause so a caller cannot
    // accidentally read a milestone owned by a sibling profile by passing the
    // wrong id.
    milestones: {
      async findMany(extraWhere?: SQL, orderBy?: SQL | SQL[]) {
        return db.query.milestones.findMany({
          where: scopedWhere(milestones, extraWhere),
          ...(orderBy ? { orderBy } : {}),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.milestones.findFirst({
          where: scopedWhere(milestones, extraWhere),
        });
      },
      async findById(milestoneId: string) {
        return db.query.milestones.findFirst({
          where: scopedWhere(milestones, eq(milestones.id, milestoneId)),
        });
      },
    },

    // [BUG-224 / P2-MED] pendingNotices uses ownerProfileId (not profileId),
    // so it cannot share scopedWhere(). Implement it explicitly so callers
    // stop reaching for `db.query.pendingNotices.*` directly and the scoping
    // contract stays centralised.
    pendingNotices: {
      async findMany(extraWhere?: SQL, orderBy?: SQL | SQL[]) {
        const ownerFilter = eq(pendingNotices.ownerProfileId, profileId);
        return db.query.pendingNotices.findMany({
          where: extraWhere ? and(ownerFilter, extraWhere) : ownerFilter,
          ...(orderBy ? { orderBy } : {}),
        });
      },
      async findFirst(extraWhere?: SQL) {
        const ownerFilter = eq(pendingNotices.ownerProfileId, profileId);
        return db.query.pendingNotices.findFirst({
          where: extraWhere ? and(ownerFilter, extraWhere) : ownerFilter,
        });
      },
      async findById(noticeId: string) {
        return db.query.pendingNotices.findFirst({
          where: and(
            eq(pendingNotices.ownerProfileId, profileId),
            eq(pendingNotices.id, noticeId),
          ),
        });
      },
    },
  };
}
