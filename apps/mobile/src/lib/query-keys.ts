/**
 * Typed query-key registry.
 *
 * Rules:
 * - Every key array is byte-identical to the inline literal it replaces.
 * - All factory functions return `readonly unknown[]` via `as const`.
 * - Parameters use `string | undefined` to match how hooks pass
 *   `activeProfile?.id` — React Query disables queries via `enabled:` when
 *   the profile is absent.
 * - Broad-prefix invalidations (`['progress']`, `['dashboard']`, etc.) in
 *   `_layout.tsx` and `invalidateSessionDerivedQueries` are handled in PR 10
 *   and remain as inline literals for now.
 */

// Shared type for the progress-history query parameter
interface ProgressHistoryQuery {
  from?: string;
  to?: string;
  granularity?: 'daily' | 'weekly';
}

export const queryKeys = {
  // ------------------------------------------------------------------
  // progress domain
  // ------------------------------------------------------------------
  progress: {
    subject: (subjectId: string, profileId: string | undefined) =>
      ['progress', 'subject', subjectId, profileId] as const,

    overview: (profileId: string | undefined) =>
      ['progress', 'overview', profileId] as const,

    continue: (profileId: string | undefined) =>
      ['progress', 'continue', profileId] as const,

    resumeTarget: (
      profileId: string | undefined,
      scope: { subjectId?: string; bookId?: string; topicId?: string },
    ) =>
      [
        'progress',
        'resume-target',
        profileId,
        scope.subjectId ?? null,
        scope.bookId ?? null,
        scope.topicId ?? null,
      ] as const,

    activeSessionForTopic: (
      topicId: string | undefined,
      profileId: string | undefined,
    ) => ['progress', 'topic', topicId, 'active-session', profileId] as const,

    resolveTopicSubject: (
      topicId: string | undefined,
      profileId: string | undefined,
    ) => ['progress', 'topic', topicId, 'resolve', profileId] as const,

    reviewSummary: (profileId: string | undefined) =>
      ['progress', 'review-summary', profileId] as const,

    overdueTopics: (profileId: string | undefined) =>
      ['progress', 'overdue-topics', profileId] as const,

    topicProgress: (
      subjectId: string,
      topicId: string,
      profileId: string | undefined,
    ) => ['progress', 'topic', subjectId, topicId, profileId] as const,

    inventory: (profileId: string | undefined) =>
      ['progress', 'inventory', profileId] as const,

    history: (
      profileId: string | undefined,
      query: ProgressHistoryQuery | undefined,
    ) => ['progress', 'history', profileId, query] as const,

    milestones: (profileId: string | undefined, limit: number) =>
      ['progress', 'milestones', profileId, limit] as const,

    profileSessions: (
      profileId: string | undefined,
      activeProfileId: string | undefined,
    ) =>
      ['progress', 'profile', profileId, 'sessions', activeProfileId] as const,

    profileReports: (
      profileId: string | undefined,
      activeProfileId: string | undefined,
    ) =>
      ['progress', 'profile', profileId, 'reports', activeProfileId] as const,

    profileWeeklyReports: (
      profileId: string | undefined,
      activeProfileId: string | undefined,
    ) =>
      [
        'progress',
        'profile',
        profileId,
        'weekly-reports',
        activeProfileId,
      ] as const,

    profileReportDetail: (
      activeProfileId: string | undefined,
      reportId: string | undefined,
    ) => ['progress', 'profile', activeProfileId, 'report', reportId] as const,

    profileWeeklyReportDetail: (
      activeProfileId: string | undefined,
      reportId: string | undefined,
    ) =>
      [
        'progress',
        'profile',
        activeProfileId,
        'weekly-report',
        reportId,
      ] as const,
  },

  // ------------------------------------------------------------------
  // dashboard domain
  //
  // PR 10: 'children' (plural) → 'child' (singular) normalisation applied to
  // childSessions, childSessionDetail, and childMemory. All three were
  // inconsistent with every other 'child'-prefixed key. The broad ['dashboard']
  // invalidation still covers these; no targeted invalidation was skipped.
  // ------------------------------------------------------------------
  dashboard: {
    root: (profileId: string | undefined) => ['dashboard', profileId] as const,

    childDetail: (childProfileId: string | undefined) =>
      ['dashboard', 'child', childProfileId] as const,

    childSubject: (
      childProfileId: string | undefined,
      subjectId: string | undefined,
    ) => ['dashboard', 'child', childProfileId, 'subject', subjectId] as const,

    childSessions: (childProfileId: string | undefined) =>
      ['dashboard', 'child', childProfileId, 'sessions'] as const,

    childSessionDetail: (
      childProfileId: string | undefined,
      sessionId: string | undefined,
    ) => ['dashboard', 'child', childProfileId, 'session', sessionId] as const,

    childMemory: (childProfileId: string | undefined) =>
      ['dashboard', 'child', childProfileId, 'memory'] as const,

    childInventory: (childProfileId: string | undefined) =>
      ['dashboard', 'child', childProfileId, 'inventory'] as const,

    childHistory: (
      childProfileId: string | undefined,
      query: ProgressHistoryQuery | undefined,
    ) => ['dashboard', 'child', childProfileId, 'history', query] as const,

    childProgressSummary: (childProfileId: string | undefined) =>
      ['dashboard', 'child', childProfileId, 'progress-summary'] as const,

    childReports: (childProfileId: string | undefined) =>
      ['dashboard', 'child', childProfileId, 'reports'] as const,

    childReportDetail: (
      childProfileId: string | undefined,
      reportId: string | undefined,
    ) => ['dashboard', 'child', childProfileId, 'report', reportId] as const,

    childWeeklyReports: (childProfileId: string | undefined) =>
      ['dashboard', 'child', childProfileId, 'weekly-reports'] as const,

    childWeeklyReportDetail: (
      childProfileId: string | undefined,
      reportId: string | undefined,
    ) =>
      [
        'dashboard',
        'child',
        childProfileId,
        'weekly-report',
        reportId,
      ] as const,
  },

  // ------------------------------------------------------------------
  // sessions domain
  // ------------------------------------------------------------------
  sessions: {
    detail: (sessionId: string, profileId: string | undefined) =>
      ['session', sessionId, profileId] as const,

    transcript: (sessionId: string, profileId: string | undefined) =>
      ['session-transcript', sessionId, profileId] as const,

    summary: (sessionId: string, profileId: string | undefined) =>
      ['session-summary', sessionId, profileId] as const,

    parkingLot: (sessionId: string, profileId: string | undefined) =>
      ['parking-lot', sessionId, profileId] as const,

    topicParkingLot: (
      subjectId: string,
      topicId: string,
      profileId: string | undefined,
    ) => ['parking-lot', 'topic', subjectId, topicId, profileId] as const,
  },

  // ------------------------------------------------------------------
  // retention domain
  // ------------------------------------------------------------------
  retention: {
    subject: (subjectId: string, profileId: string | undefined) =>
      ['retention', 'subject', subjectId, profileId] as const,

    topic: (topicId: string, profileId: string | undefined) =>
      ['retention', 'topic', topicId, profileId] as const,

    // PR 10: moved from top-level 'evaluate-eligibility' → under 'retention'.
    // The old top-level prefix was not covered by broad ['retention'] invalidations,
    // meaning recall-test / relearn mutations silently left eligibility stale.
    // Callers in use-retention.ts use this factory — no inline literals remain.
    evaluateEligibility: (topicId: string, profileId: string | undefined) =>
      ['retention', 'evaluate-eligibility', topicId, profileId] as const,

    teachingPreference: (
      subjectId: string | undefined,
      profileId: string | undefined,
    ) => ['retention', 'teaching-preference', subjectId, profileId] as const,
  },

  // ------------------------------------------------------------------
  // languageProgress domain
  // ------------------------------------------------------------------
  languageProgress: {
    subject: (profileId: string | undefined, subjectId: string) =>
      ['language-progress', profileId, subjectId] as const,
  },

  // ------------------------------------------------------------------
  // vocabulary domain
  // ------------------------------------------------------------------
  vocabulary: {
    subject: (profileId: string | undefined, subjectId: string) =>
      ['vocabulary', profileId, subjectId] as const,
  },

  // ------------------------------------------------------------------
  // resumeNudge domain
  // ------------------------------------------------------------------
  resumeNudge: {
    root: (profileId: string | undefined) =>
      ['resume-nudge', profileId] as const,
  },
} as const;
