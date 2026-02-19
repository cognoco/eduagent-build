import { eq, and, type SQL, type Column } from 'drizzle-orm';
import type { Database } from './client.js';
import {
  profiles,
  consentStates,
  learningSessions,
  subjects,
  assessments,
  retentionCards,
  xpLedger,
  streaks,
  sessionEvents,
  sessionSummaries,
  needsDeepeningTopics,
  onboardingDrafts,
  parkingLotItems,
  teachingPreferences,
  curriculumAdaptations,
  notificationPreferences,
  learningModes,
  sessionEmbeddings,
} from './schema/index.js';

export function createScopedRepository(db: Database, profileId: string) {
  function scopedWhere(
    table: { profileId: Column },
    extraWhere?: SQL
  ): SQL | undefined {
    const profileFilter = eq(table.profileId, profileId);
    return extraWhere ? and(profileFilter, extraWhere) : profileFilter;
  }

  return {
    profileId,
    db,

    async getProfile() {
      return db.query.profiles.findFirst({
        where: eq(profiles.id, profileId),
      });
    },

    sessions: {
      async findMany(extraWhere?: SQL) {
        return db.query.learningSessions.findMany({
          where: scopedWhere(learningSessions, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.learningSessions.findFirst({
          where: scopedWhere(learningSessions, extraWhere),
        });
      },
    },

    subjects: {
      async findMany(extraWhere?: SQL) {
        return db.query.subjects.findMany({
          where: scopedWhere(subjects, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.subjects.findFirst({
          where: scopedWhere(subjects, extraWhere),
        });
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

    retentionCards: {
      async findMany(extraWhere?: SQL) {
        return db.query.retentionCards.findMany({
          where: scopedWhere(retentionCards, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.retentionCards.findFirst({
          where: scopedWhere(retentionCards, extraWhere),
        });
      },
    },

    xpLedger: {
      async findMany(extraWhere?: SQL) {
        return db.query.xpLedger.findMany({
          where: scopedWhere(xpLedger, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.xpLedger.findFirst({
          where: scopedWhere(xpLedger, extraWhere),
        });
      },
    },

    streaks: {
      async findFirst() {
        return db.query.streaks.findFirst({
          where: eq(streaks.profileId, profileId),
        });
      },
    },

    sessionEvents: {
      async findMany(extraWhere?: SQL) {
        return db.query.sessionEvents.findMany({
          where: scopedWhere(sessionEvents, extraWhere),
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

    needsDeepeningTopics: {
      async findMany(extraWhere?: SQL) {
        return db.query.needsDeepeningTopics.findMany({
          where: scopedWhere(needsDeepeningTopics, extraWhere),
        });
      },
    },

    onboardingDrafts: {
      async findMany(extraWhere?: SQL) {
        return db.query.onboardingDrafts.findMany({
          where: scopedWhere(onboardingDrafts, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.onboardingDrafts.findFirst({
          where: scopedWhere(onboardingDrafts, extraWhere),
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

    teachingPreferences: {
      async findMany(extraWhere?: SQL) {
        return db.query.teachingPreferences.findMany({
          where: scopedWhere(teachingPreferences, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.teachingPreferences.findFirst({
          where: scopedWhere(teachingPreferences, extraWhere),
        });
      },
    },

    curriculumAdaptations: {
      async findMany(extraWhere?: SQL) {
        return db.query.curriculumAdaptations.findMany({
          where: scopedWhere(curriculumAdaptations, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.curriculumAdaptations.findFirst({
          where: scopedWhere(curriculumAdaptations, extraWhere),
        });
      },
    },

    consentStates: {
      async findMany(extraWhere?: SQL) {
        return db.query.consentStates.findMany({
          where: scopedWhere(consentStates, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.consentStates.findFirst({
          where: scopedWhere(consentStates, extraWhere),
        });
      },
    },

    notificationPreferences: {
      async findMany(extraWhere?: SQL) {
        return db.query.notificationPreferences.findMany({
          where: scopedWhere(notificationPreferences, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.notificationPreferences.findFirst({
          where: scopedWhere(notificationPreferences, extraWhere),
        });
      },
    },

    learningModes: {
      async findMany(extraWhere?: SQL) {
        return db.query.learningModes.findMany({
          where: scopedWhere(learningModes, extraWhere),
        });
      },
      async findFirst(extraWhere?: SQL) {
        return db.query.learningModes.findFirst({
          where: scopedWhere(learningModes, extraWhere),
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
  };
}

export type ScopedRepository = ReturnType<typeof createScopedRepository>;
