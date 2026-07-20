/**
 * Typed query-key registry.
 *
 * Rules:
 * - Factory tests define the exact array shape. Replacements preserve existing
 *   shapes unless a scoped factory intentionally moves the active scope id to
 *   the final segment.
 * - All factory functions return `readonly unknown[]` via `as const`.
 * - New scoped factories accept `null | undefined` because some identity
 *   providers expose unloaded identifiers as null; factories normalize both to
 *   undefined.
 * - Broad-prefix invalidations (`['progress']`, `['dashboard']`, etc.) in
 *   `_layout.tsx` and `invalidateSessionDerivedQueries` are handled in PR 10
 *   and remain as inline literals for now.
 */

// Shared type for the progress-history query parameter
import type { AppMode } from './app-context';

interface ProgressHistoryQuery {
  from?: string;
  to?: string;
  granularity?: 'daily' | 'weekly';
}

type ModeSegment = AppMode | null | undefined;
type QueryScopeId = string | null | undefined;

const scopeId = (id: QueryScopeId): string | undefined => id ?? undefined;

export const queryKeys = {
  // ------------------------------------------------------------------
  // progress domain
  // ------------------------------------------------------------------
  progress: {
    subject: (
      mode: ModeSegment,
      subjectId: string,
      profileId: string | undefined,
    ) => ['progress', mode, 'subject', subjectId, profileId] as const,

    overview: (mode: ModeSegment, profileId: string | undefined) =>
      ['progress', mode, 'overview', profileId] as const,

    continue: (mode: ModeSegment, profileId: string | undefined) =>
      ['progress', mode, 'continue', profileId] as const,

    resumeTarget: (
      mode: ModeSegment,
      profileId: string | undefined,
      scope: { subjectId?: string; bookId?: string; topicId?: string },
    ) =>
      [
        'progress',
        mode,
        'resume-target',
        profileId,
        scope.subjectId ?? null,
        scope.bookId ?? null,
        scope.topicId ?? null,
      ] as const,

    activeSessionForTopic: (
      mode: ModeSegment,
      topicId: string | undefined,
      profileId: string | undefined,
    ) =>
      [
        'progress',
        mode,
        'topic',
        topicId,
        'active-session',
        profileId,
      ] as const,

    resolveTopicSubject: (
      mode: ModeSegment,
      topicId: string | undefined,
      profileId: string | undefined,
      attempt?: number,
      // ponytail: conditional spread keeps the 6-element prefix for callers that omit `attempt`
      // (e.g. invalidateQueries in use-filing.ts) so partial-key matching still busts this query.
    ) =>
      [
        'progress',
        mode,
        'topic',
        topicId,
        'resolve',
        profileId,
        ...(attempt !== undefined ? [attempt] : []),
      ] as const,

    reviewSummary: (mode: ModeSegment, profileId: string | undefined) =>
      ['progress', mode, 'review-summary', profileId] as const,

    overdueTopics: (mode: ModeSegment, profileId: string | undefined) =>
      ['progress', mode, 'overdue-topics', profileId] as const,

    topicProgress: (
      mode: ModeSegment,
      subjectId: string,
      topicId: string,
      profileId: string | undefined,
    ) => ['progress', mode, 'topic', subjectId, topicId, profileId] as const,

    inventory: (mode: ModeSegment, profileId: string | undefined) =>
      ['progress', mode, 'inventory', profileId] as const,

    history: (
      mode: ModeSegment,
      profileId: string | undefined,
      query: ProgressHistoryQuery | undefined,
    ) => ['progress', mode, 'history', profileId, query] as const,

    milestones: (
      mode: ModeSegment,
      profileId: string | undefined,
      limit: number,
    ) => ['progress', mode, 'milestones', profileId, limit] as const,

    profileSessions: (
      mode: ModeSegment,
      profileId: string | undefined,
      activeProfileId: string | undefined,
    ) =>
      [
        'progress',
        mode,
        'profile',
        profileId,
        'sessions',
        activeProfileId,
      ] as const,

    profileReports: (
      mode: ModeSegment,
      profileId: string | undefined,
      activeProfileId: string | undefined,
    ) =>
      [
        'progress',
        mode,
        'profile',
        profileId,
        'reports',
        activeProfileId,
      ] as const,

    profileWeeklyReports: (
      mode: ModeSegment,
      profileId: string | undefined,
      activeProfileId: string | undefined,
    ) =>
      [
        'progress',
        mode,
        'profile',
        profileId,
        'weekly-reports',
        activeProfileId,
      ] as const,

    profileReportDetail: (
      mode: ModeSegment,
      activeProfileId: string | undefined,
      reportId: string | undefined,
    ) =>
      [
        'progress',
        mode,
        'profile',
        activeProfileId,
        'report',
        reportId,
      ] as const,

    profileWeeklyReportDetail: (
      mode: ModeSegment,
      activeProfileId: string | undefined,
      reportId: string | undefined,
    ) =>
      [
        'progress',
        mode,
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
    root: (mode: ModeSegment, profileId: string | undefined) =>
      ['dashboard', mode, profileId] as const,

    childDetail: (mode: ModeSegment, childProfileId: string | undefined) =>
      ['dashboard', mode, 'child', childProfileId] as const,

    // [WI-1658]
    childVerifiedProof: (
      mode: ModeSegment,
      childProfileId: string | undefined,
    ) =>
      ['dashboard', mode, 'child', childProfileId, 'verified-proof'] as const,

    childSubject: (
      mode: ModeSegment,
      childProfileId: string | undefined,
      subjectId: string | undefined,
    ) =>
      [
        'dashboard',
        mode,
        'child',
        childProfileId,
        'subject',
        subjectId,
      ] as const,

    childSessions: (mode: ModeSegment, childProfileId: string | undefined) =>
      ['dashboard', mode, 'child', childProfileId, 'sessions'] as const,

    childSessionDetail: (
      mode: ModeSegment,
      childProfileId: string | undefined,
      sessionId: string | undefined,
    ) =>
      [
        'dashboard',
        mode,
        'child',
        childProfileId,
        'session',
        sessionId,
      ] as const,

    childMemory: (mode: ModeSegment, childProfileId: string | undefined) =>
      ['dashboard', mode, 'child', childProfileId, 'memory'] as const,

    childInventory: (mode: ModeSegment, childProfileId: string | undefined) =>
      ['dashboard', mode, 'child', childProfileId, 'inventory'] as const,

    childHistory: (
      mode: ModeSegment,
      childProfileId: string | undefined,
      query: ProgressHistoryQuery | undefined,
    ) =>
      ['dashboard', mode, 'child', childProfileId, 'history', query] as const,

    childProgressSummary: (
      mode: ModeSegment,
      childProfileId: string | undefined,
    ) =>
      ['dashboard', mode, 'child', childProfileId, 'progress-summary'] as const,

    childReports: (mode: ModeSegment, childProfileId: string | undefined) =>
      ['dashboard', mode, 'child', childProfileId, 'reports'] as const,

    childReportDetail: (
      mode: ModeSegment,
      childProfileId: string | undefined,
      reportId: string | undefined,
    ) =>
      ['dashboard', mode, 'child', childProfileId, 'report', reportId] as const,

    childWeeklyReports: (
      mode: ModeSegment,
      childProfileId: string | undefined,
    ) =>
      ['dashboard', mode, 'child', childProfileId, 'weekly-reports'] as const,

    childWeeklyReportDetail: (
      mode: ModeSegment,
      childProfileId: string | undefined,
      reportId: string | undefined,
    ) =>
      [
        'dashboard',
        mode,
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
    detail: (
      mode: ModeSegment,
      sessionId: string,
      profileId: string | undefined,
    ) => ['session', mode, sessionId, profileId] as const,

    transcript: (
      mode: ModeSegment,
      sessionId: string,
      profileId: string | undefined,
    ) => ['session-transcript', mode, sessionId, profileId] as const,

    summary: (
      mode: ModeSegment,
      sessionId: string,
      profileId: string | undefined,
    ) => ['session-summary', mode, sessionId, profileId] as const,

    parkingLot: (
      mode: ModeSegment,
      sessionId: string,
      profileId: string | undefined,
    ) => ['parking-lot', mode, sessionId, profileId] as const,

    topicParkingLot: (
      mode: ModeSegment,
      subjectId: string,
      topicId: string,
      profileId: string | undefined,
    ) => ['parking-lot', mode, 'topic', subjectId, topicId, profileId] as const,

    // [BUG-553] profileId is required so invalidation never crosses account
    // boundaries on a shared device. The previous single-argument form matched
    // by sessionId only — it would invalidate User A's session cache when User B
    // triggered a mutation using the same sessionId. All call sites must pass
    // the active profile's id as the second argument.
    matchAnyMode:
      (sessionId: string, profileId: string | undefined) =>
      (queryKey: readonly unknown[]) =>
        queryKey[0] === 'session' &&
        queryKey[2] === sessionId &&
        queryKey[3] === profileId,

    matchTranscriptAnyMode:
      (sessionId: string, profileId: string | undefined) =>
      (queryKey: readonly unknown[]) =>
        queryKey[0] === 'session-transcript' &&
        queryKey[2] === sessionId &&
        queryKey[3] === profileId,

    matchSummaryAnyMode:
      (sessionId: string, profileId: string | undefined) =>
      (queryKey: readonly unknown[]) =>
        queryKey[0] === 'session-summary' &&
        queryKey[2] === sessionId &&
        queryKey[3] === profileId,
  },

  // ------------------------------------------------------------------
  // recaps domain
  // ------------------------------------------------------------------
  recaps: {
    list: (
      mode: ModeSegment,
      profileId: string | undefined,
      childProfileId: string | undefined,
    ) => ['recaps', mode, profileId, childProfileId ?? null] as const,

    detail: (
      mode: ModeSegment,
      profileId: string | undefined,
      recapId: string | undefined,
    ) => ['recaps', mode, profileId, 'detail', recapId] as const,
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
  // library domain
  //
  // CCR PR #251: `/library/retention` aggregate query previously used an
  // inline literal `['library', 'retention', activeProfile?.id]` in
  // use-library-context.ts. Promoted to the typed registry so callers (and
  // tests that prime the cache via `setLibraryRetention`) consume a single
  // key factory rather than duplicating the literal.
  // ------------------------------------------------------------------
  library: {
    retention: (profileId: string | undefined) =>
      ['library', 'retention', profileId] as const,

    conceptMastery: (
      profileId: string | undefined,
      topicIds: readonly string[],
    ) => ['library', 'concept-mastery', profileId, [...topicIds]] as const,
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

  // ------------------------------------------------------------------
  // subscription / usage domains
  // ------------------------------------------------------------------
  subscription: (profileId: QueryScopeId) =>
    ['subscription', scopeId(profileId)] as const,

  usage: (profileId: QueryScopeId) => ['usage', scopeId(profileId)] as const,

  subscriptionFamily: (profileId: QueryScopeId) =>
    ['subscription-family', scopeId(profileId)] as const,

  subscriptionStatus: (profileId: QueryScopeId) =>
    ['subscription-status', scopeId(profileId)] as const,

  // ------------------------------------------------------------------
  // RevenueCat domain
  // ------------------------------------------------------------------
  revenuecat: {
    customerInfo: (userId: QueryScopeId) =>
      ['revenuecat', 'customerInfo', scopeId(userId)] as const,

    offerings: (userId: QueryScopeId) =>
      ['revenuecat', 'offerings', scopeId(userId)] as const,
  },

  // ------------------------------------------------------------------
  // profiles domain
  // ------------------------------------------------------------------
  profiles: {
    list: (userId: QueryScopeId) => ['profiles', scopeId(userId)] as const,

    active: (profileId: QueryScopeId) =>
      ['profile', scopeId(profileId)] as const,
  },

  // ------------------------------------------------------------------
  // settings domain
  // ------------------------------------------------------------------
  settings: {
    notifications: (profileId: QueryScopeId) =>
      ['settings', 'notifications', scopeId(profileId)] as const,

    celebrationLevel: (profileId: QueryScopeId) =>
      ['settings', 'celebration-level', scopeId(profileId)] as const,

    childCelebrationLevel: (
      childProfileId: QueryScopeId,
      profileId: QueryScopeId,
    ) =>
      [
        'settings',
        'celebration-level',
        scopeId(childProfileId),
        scopeId(profileId),
      ] as const,

    withdrawalArchive: (profileId: QueryScopeId) =>
      ['settings', 'withdrawal-archive', scopeId(profileId)] as const,

    familyPoolBreakdownSharing: (profileId: QueryScopeId) =>
      [
        'settings',
        'family-pool-breakdown-sharing',
        scopeId(profileId),
      ] as const,

    analogyDomain: (subjectId: QueryScopeId, profileId: QueryScopeId) =>
      [
        'settings',
        'analogy-domain',
        scopeId(subjectId),
        scopeId(profileId),
      ] as const,

    nativeLanguage: (subjectId: QueryScopeId, profileId: QueryScopeId) =>
      [
        'settings',
        'native-language',
        scopeId(subjectId),
        scopeId(profileId),
      ] as const,
  },

  // ------------------------------------------------------------------
  // onboarding invalidation domains
  // ------------------------------------------------------------------
  onboarding: {
    learnerProfile: (profileId: QueryScopeId) =>
      ['learner-profile', scopeId(profileId)] as const,
  },

  // ------------------------------------------------------------------
  // scoped session lists (book / topic / subject)
  //
  // Byte-identical to the inline literals the three session hooks used, so
  // TanStack cache identity and invalidation are unchanged.
  // ------------------------------------------------------------------
  bookSessions: (
    subjectId: string | undefined,
    bookId: string | undefined,
    profileId: string | undefined,
  ) => ['book-sessions', subjectId, bookId, profileId] as const,

  topicSessions: (
    subjectId: string | undefined,
    topicId: string | undefined,
    profileId: string | undefined,
  ) => ['topic-sessions', subjectId, topicId, profileId] as const,

  subjectSessions: (
    subjectId: string | undefined,
    profileId: string | undefined,
  ) => ['subject-sessions', subjectId, profileId] as const,

  historySessionsMatch:
    (profileId: string | undefined) => (queryKey: readonly unknown[]) =>
      ((queryKey[0] === 'topic-sessions' || queryKey[0] === 'book-sessions') &&
        queryKey.length === 4 &&
        queryKey[3] === profileId) ||
      (queryKey[0] === 'subject-sessions' &&
        queryKey.length === 3 &&
        queryKey[2] === profileId),
} as const;
