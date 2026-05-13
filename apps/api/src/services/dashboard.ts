// ---------------------------------------------------------------------------
// Parent Dashboard Data — Story 4.11
// Pure business logic + DB-aware query functions, no Hono imports
// ---------------------------------------------------------------------------

import {
  eq,
  and,
  gte,
  ne,
  inArray,
  desc,
  asc,
  sum,
  sql,
  isNotNull,
  isNull,
} from 'drizzle-orm';
import {
  familyLinks,
  profiles,
  learningSessions,
  sessionEvents,
  subjects,
  consentStates,
  curricula,
  curriculumTopics,
  sessionSummaries,
  streaks,
  xpLedger,
  createScopedRepository,
  applyStreakDecay,
  type Database,
} from '@eduagent/database';
import {
  ForbiddenError,
  NEW_LEARNER_SESSION_THRESHOLD,
} from '@eduagent/schemas';
import type {
  DashboardChild,
  DemoDashboardData,
  KnowledgeInventory,
  MonthlyReportRecord,
  MonthlyReportSummary,
  ProgressHistory,
  ConsentStatus,
  ProgressMetrics,
  TopicProgress,
} from '@eduagent/schemas';
import { getOverallProgress, getTopicProgressBatch } from './progress';
import {
  buildKnowledgeInventory,
  buildProgressHistory,
  getLatestSnapshot,
  getLatestSnapshotOnOrBefore,
  MAX_SESSION_WALL_CLOCK_SECONDS,
} from './snapshot-aggregation';
import {
  getMonthlyReportForParentChild,
  listMonthlyReportsForParentChild,
  markMonthlyReportViewed,
} from './monthly-report';
import { getCurrentlyWorkingOn } from './learner-profile';
import { assertParentAccess } from './family-access';
import { generateWeeklyReportData } from './weekly-report';
import {
  isoDate,
  subtractDays,
  computeWeeklyDeltas,
  getActiveSubjectsByRecency,
  calculateTrend,
  calculateRetentionTrend,
  calculateGuidedRatio,
  buildProgressGuidance,
  MIN_TREND_SESSIONS,
} from './progress-helpers';
import {
  countGuidedMetrics,
  countGuidedMetricsBatch,
} from './session/session-analytics';
import {
  getProfileSessions,
  getSessionMetadata,
  formatSessionDisplayTitle,
  parseEngagementSignal,
} from './session/session-crud';
import type {
  ChildSession,
  ChildSessionDrillScore,
} from './session/session-crud';

/** Returns today's date as an ISO-8601 date string (YYYY-MM-DD, UTC). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface DashboardInput {
  childProfileId: string;
  displayName: string;
  sessionsThisWeek: number;
  sessionsLastWeek: number;
  totalTimeThisWeekMinutes: number;
  totalTimeLastWeekMinutes: number;
  exchangesThisWeek: number;
  exchangesLastWeek: number;
  subjectRetentionData: Array<{
    name: string;
    status: 'strong' | 'fading' | 'weak' | 'forgotten';
  }>;
  guidedCount: number;
  totalProblemCount: number;
  /**
   * Lifetime session count (exchangeCount >= 1). Optional for backwards-compat
   * with existing callers; when supplied, generateChildSummary uses lifetime
   * framing for new learners (< NEW_LEARNER_SESSION_THRESHOLD) so the dashboard
   * subtext stops contradicting the "After N more sessions" teaser. [BUG-906]
   */
  totalSessions?: number;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Generates a one-sentence summary for a child's progress.
 *
 * Example: "Alex: Mathematics — 5 problems, 3 guided. Science fading. 4 sessions this week (up from 2 last week)."
 */
export function generateChildSummary(input: DashboardInput): string {
  const parts: string[] = [];

  // Subject details
  const subjectParts: string[] = [];
  for (const subject of input.subjectRetentionData) {
    if (subject.status === 'fading' || subject.status === 'weak') {
      subjectParts.push(`${subject.name} ${subject.status}`);
    }
  }

  // Problem stats
  if (input.totalProblemCount > 0) {
    parts.push(
      `${input.totalProblemCount} problems, ${input.guidedCount} guided`,
    );
  }

  // Fading/weak subjects
  if (subjectParts.length > 0) {
    parts.push(subjectParts.join(', '));
  }

  const sw = (n: number): string => (n === 1 ? 'session' : 'sessions');
  const newLearner =
    input.totalSessions != null &&
    input.totalSessions < NEW_LEARNER_SESSION_THRESHOLD;

  if (newLearner) {
    // [BUG-906] Lifetime framing \u2014 matches the dashboard teaser. Specifically
    // do NOT mention "this week" here. Saying "0 this week" alongside a
    // "2 sessions completed" lifetime number reads as a contradiction even
    // when both are individually correct; new-learner mode collapses to the
    // single meaningful number until the cadence trend is statistically real.
    const total = input.totalSessions ?? 0;
    if (total === 0) {
      parts.push('no sessions yet');
    } else {
      parts.push(`${total} ${sw(total)} so far`);
    }
  } else {
    // Active-learner cadence. Trend arrow + up/down/same framing.
    const trend = calculateTrend(
      input.sessionsThisWeek,
      input.sessionsLastWeek,
    );
    const trendArrow =
      trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192';
    const trendWord =
      trend === 'up'
        ? `up from ${input.sessionsLastWeek}`
        : trend === 'down'
          ? `down from ${input.sessionsLastWeek}`
          : 'same as';

    parts.push(
      `${input.sessionsThisWeek} ${sw(
        input.sessionsThisWeek,
      )} this week (${trendArrow} ${trendWord} last week)`,
    );
  }

  return `${input.displayName}: ${parts.join('. ')}.`;
}

// calculateRetentionTrend, calculateTrend, calculateGuidedRatio moved to
// ./progress-helpers (PR-2 surface-ownership-boundaries). Re-exported below
// for backward compatibility.

function isChildLearningDataVisible(
  status: ConsentStatus | null | undefined,
): boolean {
  return status == null || status === 'CONSENTED';
}

function redactedConsentSummary(
  displayName: string,
  status: ConsentStatus | null | undefined,
): string {
  switch (status) {
    case 'PENDING':
      return `${displayName}: consent is pending. Learning metrics are hidden until consent is active.`;
    case 'PARENTAL_CONSENT_REQUESTED':
      return `${displayName}: waiting for parent approval. Learning metrics are hidden until consent is active.`;
    case 'WITHDRAWN':
      return `${displayName}: consent has been withdrawn. Learning metrics are hidden.`;
    default:
      return `${displayName}: learning metrics are hidden until consent is active.`;
  }
}

function hiddenWeeklyHeadline(): DashboardChild['weeklyHeadline'] {
  return undefined;
}

function emptyProgressMetrics(): ProgressMetrics {
  return {
    totalSessions: 0,
    totalActiveMinutes: 0,
    totalWallClockMinutes: 0,
    totalExchanges: 0,
    topicsAttempted: 0,
    topicsMastered: 0,
    topicsInProgress: 0,
    booksCompleted: 0,
    vocabularyTotal: 0,
    vocabularyMastered: 0,
    vocabularyLearning: 0,
    vocabularyNew: 0,
    retentionCardsDue: 0,
    retentionCardsStrong: 0,
    retentionCardsFading: 0,
    currentStreak: 0,
    longestStreak: 0,
    subjects: [],
  };
}

function redactDashboardChild(child: DashboardChild): DashboardChild {
  if (isChildLearningDataVisible(child.consentStatus)) return child;

  return {
    profileId: child.profileId,
    displayName: child.displayName,
    consentStatus: child.consentStatus,
    respondedAt: child.respondedAt,
    summary: redactedConsentSummary(child.displayName, child.consentStatus),
    sessionsThisWeek: 0,
    sessionsLastWeek: 0,
    totalTimeThisWeek: 0,
    totalTimeLastWeek: 0,
    exchangesThisWeek: 0,
    exchangesLastWeek: 0,
    trend: 'stable',
    subjects: [],
    guidedVsImmediateRatio: 0,
    retentionTrend: 'stable',
    totalSessions: 0,
    weeklyHeadline: hiddenWeeklyHeadline(),
    currentlyWorkingOn: [],
    progress: null,
    currentStreak: 0,
    longestStreak: 0,
    totalXp: 0,
  };
}

async function getLatestConsentStatus(
  db: Database,
  childProfileId: string,
): Promise<ConsentStatus | null> {
  const consentState = await db.query.consentStates.findFirst({
    where: and(
      eq(consentStates.profileId, childProfileId),
      eq(consentStates.consentType, 'GDPR'),
    ),
    orderBy: desc(consentStates.requestedAt),
    columns: { status: true },
  });

  return consentState?.status ?? null;
}

export async function assertChildDashboardDataVisible(
  db: Database,
  childProfileId: string,
): Promise<void> {
  const status = await getLatestConsentStatus(db, childProfileId);
  if (!isChildLearningDataVisible(status)) {
    throw new ForbiddenError(
      'Child learning data is hidden until consent is active.',
    );
  }
}

// GuidedMetrics, countGuidedMetrics, countGuidedMetricsBatch moved to
// ./session/session-analytics (PR-2 surface-ownership-boundaries). Re-exported below.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns Monday 00:00:00 UTC of the week containing the given date. */
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// getSessionMetadata, formatSessionDisplayTitle moved to ./session/session-crud
// and imported above for use by getChildSessionDetail.

/**
 * @deprecated For new code, use `getActiveSubjectsByRecency` from
 * `./progress-helpers` instead. That function lives at the service layer and
 * applies the same sort order while fetching fresh session data from the DB.
 * `sortSubjectsByActivityPriority` remains here for the batch path in
 * `getChildrenForParent` where subject progress is already in memory.
 *
 * [BUG-913] Order subjects so the most recently active ones come first.
 * The coaching nudge in `buildProgressGuidance` picks `subjectNames[0]`, so
 * recommending "Biology" when a child only ever practised "Mathematics"
 * looks broken — even though Biology is technically a linked subject. Pass
 * the result of this helper as `subjectNames` to the guidance builder so
 * empty / never-touched subjects fall to the back.
 */
export function sortSubjectsByActivityPriority<
  T extends {
    name: string;
    lastSessionAt?: string | null;
    topicsCompleted?: number;
  },
>(subjects: T[]): T[] {
  // Sort tiebreaks are deterministic because Array.prototype.sort is stable
  // (ES2019+). The comparator below intentionally returns 0 for unrelated
  // subjects so original order is preserved — DO NOT add `id` as a final
  // tiebreak unless the comparator becomes total.
  // [BUG-913]
  //  1. lastSessionAt non-null (most recent first)
  //  2. topicsCompleted > 0 (any progress at all)
  //  3. name (alphabetical) — deterministic tiebreaker within each tier
  return [...subjects].sort((a, b) => {
    const aActive = a.lastSessionAt ? Date.parse(a.lastSessionAt) : 0;
    const bActive = b.lastSessionAt ? Date.parse(b.lastSessionAt) : 0;
    if (aActive !== bActive) return bActive - aActive;
    const aCompleted = a.topicsCompleted ?? 0;
    const bCompleted = b.topicsCompleted ?? 0;
    if (aCompleted !== bCompleted) return bCompleted - aCompleted;
    return a.name.localeCompare(b.name);
  });
}

// buildProgressGuidance moved to ./progress-helpers (PR-2). Re-exported below.

async function buildChildProgressSummary(
  db: Database,
  childProfileId: string,
  childName: string,
  sessionsThisWeek: number,
  sessionsLastWeek: number,
  totalTimeThisWeekMinutes: number,
  subjectNames: string[],
  currentStreak?: number,
): Promise<{
  progress: DashboardChild['progress'];
  totalSessions: number;
  weeklyHeadline: DashboardChild['weeklyHeadline'];
  currentlyWorkingOn: DashboardChild['currentlyWorkingOn'];
}> {
  // [F-PV-07] Compute totalSessions live with the same filter as getChildSessions
  // (exchangeCount >= 1) instead of reading the stale snapshot value. This
  // prevents the dashboard aggregate from disagreeing with the sessions list.
  const [latestSnapshot, liveCountRows, currentlyWorkingOn] = await Promise.all(
    [
      getLatestSnapshot(db, childProfileId),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(learningSessions)
        .where(
          and(
            eq(learningSessions.profileId, childProfileId),
            // "Completed session" = exchangeCount >= 1 AND status !== 'active'.
            // SYNC: apps/mobile/src/lib/progressive-disclosure.ts
            //       apps/api/src/services/snapshot-aggregation.ts computeProgressMetrics()
            gte(learningSessions.exchangeCount, 1),
            ne(learningSessions.status, 'active'),
          ),
        ),
      getCurrentlyWorkingOn(db, childProfileId),
    ],
  );
  const liveSessionCount = liveCountRows[0]?.count ?? 0;
  const weekStart = isoDate(getStartOfWeek(new Date()));
  if (!latestSnapshot) {
    return {
      progress: null,
      totalSessions: liveSessionCount,
      weeklyHeadline: generateWeeklyReportData(
        childName,
        weekStart,
        emptyProgressMetrics(),
        null,
      ).headlineStat,
      currentlyWorkingOn,
    };
  }

  const previousSnapshot = await getLatestSnapshotOnOrBefore(
    db,
    childProfileId,
    isoDate(
      subtractDays(new Date(`${latestSnapshot.snapshotDate}T00:00:00Z`), 7),
    ),
  );

  const previousMetrics = previousSnapshot?.metrics ?? null;
  const currentMetrics = latestSnapshot.metrics;
  const weeklyDeltas = computeWeeklyDeltas(previousMetrics, currentMetrics);
  const weeklyHeadline = generateWeeklyReportData(
    childName,
    weekStart,
    currentMetrics,
    previousMetrics,
  ).headlineStat;

  return {
    progress: {
      snapshotDate: latestSnapshot.snapshotDate,
      topicsMastered: currentMetrics.topicsMastered,
      vocabularyTotal: currentMetrics.vocabularyTotal,
      minutesThisWeek: totalTimeThisWeekMinutes,
      weeklyDeltaTopicsMastered: weeklyDeltas.topicsMastered,
      weeklyDeltaVocabularyTotal: weeklyDeltas.vocabularyTotal,
      weeklyDeltaTopicsExplored: weeklyDeltas.topicsExplored,
      engagementTrend:
        liveSessionCount < MIN_TREND_SESSIONS
          ? 'stable'
          : sessionsThisWeek === 0
            ? 'declining'
            : sessionsThisWeek > sessionsLastWeek
              ? 'increasing'
              : 'stable',
      guidance: buildProgressGuidance(
        childName,
        subjectNames,
        sessionsThisWeek,
        sessionsLastWeek,
        currentStreak,
      ),
    },
    totalSessions: liveSessionCount,
    weeklyHeadline,
    currentlyWorkingOn,
  };
}

// ---------------------------------------------------------------------------
// DB-aware query functions (Sprint 8 — route wiring)
// ---------------------------------------------------------------------------

/**
 * Fetches aggregated dashboard data for all children linked to a parent.
 */
export async function getChildrenForParent(
  db: Database,
  parentProfileId: string,
): Promise<DashboardChild[]> {
  // 1. Query familyLinks for this parent
  const links = await db.query.familyLinks.findMany({
    where: eq(familyLinks.parentProfileId, parentProfileId),
  });
  if (links.length === 0) return [];

  // Pre-fetch all subjects for all child profiles in a single query (avoids N+1)
  const childProfileIds = links.map((l) => l.childProfileId);
  const allChildSubjects = await db.query.subjects.findMany({
    where: inArray(subjects.profileId, childProfileIds),
  });
  const subjectsByProfile = new Map<string, Map<string, string | null>>();
  for (const s of allChildSubjects) {
    let profileMap = subjectsByProfile.get(s.profileId);
    if (!profileMap) {
      profileMap = new Map();
      subjectsByProfile.set(s.profileId, profileMap);
    }
    profileMap.set(s.id, s.rawInput ?? null);
  }

  // R-03: Batch queries to avoid N+1 per child profile.
  // Fetch all child profiles in a single query instead of one per loop iteration.
  const allChildProfiles = await db.query.profiles.findMany({
    where: and(
      inArray(profiles.id, childProfileIds),
      isNull(profiles.archivedAt),
    ),
  });
  const profilesById = new Map(allChildProfiles.map((p) => [p.id, p]));

  // Batch recent sessions for all children in one query
  const now = new Date();
  const startOfThisWeek = getStartOfWeek(now);
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  const allRecentSessions = await db.query.learningSessions.findMany({
    where: and(
      inArray(learningSessions.profileId, childProfileIds),
      gte(learningSessions.startedAt, startOfLastWeek),
      gte(learningSessions.exchangeCount, 1),
    ),
  });
  const sessionsByProfile = new Map<string, typeof allRecentSessions>();
  for (const s of allRecentSessions) {
    let arr = sessionsByProfile.get(s.profileId);
    if (!arr) {
      arr = [];
      sessionsByProfile.set(s.profileId, arr);
    }
    arr.push(s);
  }

  // Batch guided metrics and progress in parallel per child (still parallelized)
  const validLinks = links.filter((l) => profilesById.has(l.childProfileId));
  // [EP15-I9] `buildChildProgressSummary` makes two sequential snapshot
  // reads per child. Previously it was called inside the per-child for-loop
  // below, which serialized N × 2 = 2N DB roundtrips (a parent with 4
  // children did 8 sequential round trips for progress summaries alone,
  // ignoring the parallel work above). Hoisted here into Promise.all so
  // all children's progress summaries fan out in parallel, matching the
  // batching pattern used for `getOverallProgress` and `countGuidedMetrics`.
  //
  // Note: the per-child summary needs `sessionsThisWeek`/`sessionsLastWeek`/
  // `totalTimeThisWeekMinutes`/`subjectNames`, which are computed inside
  // the for-loop below. We therefore do the parallel fan-out AFTER we've
  // precomputed those inputs per child in a first pass.
  // [BUG-734 / PERF-4] countGuidedMetrics was previously called once per
  // child via Promise.all — N parallel round-trips with identical SQL
  // shape. Replaced with a single GROUP BY aggregate that returns a Map
  // keyed by profileId, dropping the dashboard-build cost from O(N) to
  // O(1) on this segment.
  const [progressResults, guidedMetricsByProfile] = await Promise.all([
    Promise.all(
      validLinks.map((l) => getOverallProgress(db, l.childProfileId)),
    ),
    countGuidedMetricsBatch(
      db,
      validLinks.map((l) => l.childProfileId),
      startOfLastWeek,
    ),
  ]);
  const guidedMetricsResults = validLinks.map(
    (l) =>
      guidedMetricsByProfile.get(l.childProfileId) ?? {
        guidedCount: 0,
        totalProblemCount: 0,
      },
  );

  // Batch streaks + XP for all children (reuse childProfileIds from links)
  const [streakResults, xpResults] = await Promise.all([
    db.query.streaks.findMany({
      where: inArray(streaks.profileId, childProfileIds),
    }),
    db
      .select({
        profileId: xpLedger.profileId,
        totalXp: sum(xpLedger.amount).mapWith(Number),
      })
      .from(xpLedger)
      .where(inArray(xpLedger.profileId, childProfileIds))
      .groupBy(xpLedger.profileId),
  ]);

  // [BUG-912] Streaks decay lazily — they only update when the next session
  // is recorded. For dashboard reads we apply decay-on-read so the parent
  // never sees "2-day streak" when the child has been inactive past the
  // grace window. Compute today once so all children share the same boundary.
  // applyStreakDecay (from @eduagent/database) is the shared source of truth.
  const today = todayIso();
  const streaksByProfile = new Map(
    streakResults.map((s) => {
      const decayed = applyStreakDecay(s, today);
      return [
        s.profileId,
        {
          profileId: s.profileId,
          currentStreak: decayed.currentStreak,
          longestStreak: decayed.longestStreak,
        },
      ];
    }),
  );
  const xpByProfile = new Map(
    xpResults.map((x) => [x.profileId, x.totalXp ?? 0]),
  );
  const allConsentStates = await db.query.consentStates.findMany({
    where: inArray(consentStates.profileId, childProfileIds),
    orderBy: desc(consentStates.requestedAt),
  });
  const consentByProfile = new Map<
    string,
    { status: ConsentStatus; respondedAt: Date | null }
  >();
  for (const state of allConsentStates) {
    if (!consentByProfile.has(state.profileId)) {
      consentByProfile.set(state.profileId, {
        status: state.status,
        respondedAt: state.respondedAt ?? null,
      });
    }
  }

  // Pre-compute per-child display inputs (first pass) so that the
  // progress-summary fan-out can run in parallel without needing the
  // `children.push` loop to complete sequentially.
  interface PreparedChild {
    childProfileId: string;
    displayName: string;
    sessionsThisWeek: number;
    sessionsLastWeek: number;
    totalTimeThisWeekMinutes: number;
    subjectNames: string[];
    dashboardInput: DashboardInput;
    progress: (typeof progressResults)[number];
    guidedMetrics: (typeof guidedMetricsResults)[number];
    rawInputMap: Map<string, string | null>;
    consentStatus: ConsentStatus | null;
    respondedAt: string | null;
  }

  const prepared: PreparedChild[] = [];
  for (let i = 0; i < validLinks.length; i++) {
    const link = validLinks[i];
    if (!link) throw new Error(`validLinks[${i}] is unexpectedly undefined`);
    const childProfileId = link.childProfileId;
    const profile = profilesById.get(childProfileId);
    if (!profile)
      throw new Error(`Profile not found for childProfileId=${childProfileId}`);
    const progress = progressResults[i];
    if (!progress)
      throw new Error(`progressResults[${i}] is unexpectedly undefined`);
    const guidedMetrics = guidedMetricsResults[i];
    if (!guidedMetrics)
      throw new Error(`guidedMetricsResults[${i}] is unexpectedly undefined`);
    const recentSessions = sessionsByProfile.get(childProfileId) ?? [];

    const sessionsThisWeek = recentSessions.filter(
      (s) => s.startedAt >= startOfThisWeek,
    ).length;
    const sessionsLastWeek = recentSessions.filter(
      (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek,
    ).length;

    // Prefer wall-clock time with active-time fallback for legacy sessions.
    // Cap per session to prevent abandoned sessions from inflating the total.
    const getDisplaySeconds = (session: {
      wallClockSeconds: number | null;
      durationSeconds: number | null;
    }): number =>
      Math.min(
        session.wallClockSeconds ?? session.durationSeconds ?? 0,
        MAX_SESSION_WALL_CLOCK_SECONDS,
      );

    const totalTimeThisWeek = recentSessions
      .filter((s) => s.startedAt >= startOfThisWeek)
      .reduce((sum, s) => sum + getDisplaySeconds(s), 0);
    const totalTimeLastWeek = recentSessions
      .filter(
        (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek,
      )
      .reduce((sum, s) => sum + getDisplaySeconds(s), 0);

    // FR215.4: "X minutes, Y exchanges"
    const exchangesThisWeek = recentSessions
      .filter((s) => s.startedAt >= startOfThisWeek)
      .reduce((sum, s) => sum + s.exchangeCount, 0);
    const exchangesLastWeek = recentSessions
      .filter(
        (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek,
      )
      .reduce((sum, s) => sum + s.exchangeCount, 0);

    // Look up rawInput from pre-fetched subjects (keyed by subjectId)
    const rawInputMap = subjectsByProfile.get(childProfileId) ?? new Map();

    // Build DashboardInput for summary generation
    const subjectRetentionData = progress.subjects.map((s) => ({
      name: s.name,
      status: s.retentionStatus,
    }));

    const dashboardInput: DashboardInput = {
      childProfileId,
      displayName: profile.displayName,
      sessionsThisWeek,
      sessionsLastWeek,
      totalTimeThisWeekMinutes: Math.round(totalTimeThisWeek / 60),
      totalTimeLastWeekMinutes: Math.round(totalTimeLastWeek / 60),
      exchangesThisWeek,
      exchangesLastWeek,
      subjectRetentionData,
      guidedCount: guidedMetrics.guidedCount,
      totalProblemCount: guidedMetrics.totalProblemCount,
      // totalSessions is filled in below once the per-child progress summary
      // resolves (it owns the live count). [BUG-906]
    };

    prepared.push({
      childProfileId,
      displayName: profile.displayName,
      sessionsThisWeek,
      sessionsLastWeek,
      totalTimeThisWeekMinutes: dashboardInput.totalTimeThisWeekMinutes,
      // [BUG-913] Sort by activity so coaching nudges reference subjects
      // the child has actually practised. See sortSubjectsByActivityPriority.
      subjectNames: sortSubjectsByActivityPriority(progress.subjects).map(
        (subject) => subject.name,
      ),
      dashboardInput,
      progress,
      guidedMetrics,
      rawInputMap,
      consentStatus: consentByProfile.get(childProfileId)?.status ?? null,
      respondedAt:
        consentByProfile.get(childProfileId)?.respondedAt?.toISOString() ??
        null,
    });
  }

  // [EP15-I9] Parallel fan-out of progress summaries. Each call is a pair
  // of snapshot reads; fanning out turns N × 2 sequential roundtrips into
  // ~2 roundtrips (bounded by the slowest child). Bounded by `validLinks`
  // (typically ≤ 4 children per parent), so no explicit batching needed.
  const progressSummaries = await Promise.all(
    prepared.map((p) =>
      buildChildProgressSummary(
        db,
        p.childProfileId,
        p.displayName,
        p.sessionsThisWeek,
        p.sessionsLastWeek,
        p.totalTimeThisWeekMinutes,
        p.subjectNames,
        streaksByProfile.get(p.childProfileId)?.currentStreak ?? 0,
      ),
    ),
  );

  const children: DashboardChild[] = prepared.map((p, i) => {
    const progressSummary = progressSummaries[i];
    if (!progressSummary)
      throw new Error(`progressSummaries[${i}] is unexpectedly undefined`);
    const { progress, totalSessions, weeklyHeadline, currentlyWorkingOn } =
      progressSummary;
    // [BUG-906] Inject lifetime count so generateChildSummary can pick the
    // right framing (lifetime for new learners, weekly cadence otherwise).
    const summary = generateChildSummary({
      ...p.dashboardInput,
      totalSessions,
    });
    const trend = calculateTrend(p.sessionsThisWeek, p.sessionsLastWeek);
    const retentionTrend = calculateRetentionTrend(
      p.dashboardInput.subjectRetentionData,
      totalSessions,
    );

    return redactDashboardChild({
      profileId: p.childProfileId,
      displayName: p.displayName,
      consentStatus: p.consentStatus,
      respondedAt: p.respondedAt,
      summary,
      sessionsThisWeek: p.sessionsThisWeek,
      sessionsLastWeek: p.sessionsLastWeek,
      totalTimeThisWeek: p.dashboardInput.totalTimeThisWeekMinutes,
      totalTimeLastWeek: p.dashboardInput.totalTimeLastWeekMinutes,
      exchangesThisWeek: p.dashboardInput.exchangesThisWeek,
      exchangesLastWeek: p.dashboardInput.exchangesLastWeek,
      trend,
      subjects: p.progress.subjects.map((s) => ({
        subjectId: s.subjectId,
        name: s.name,
        retentionStatus: s.retentionStatus,
        rawInput: p.rawInputMap.get(s.subjectId) ?? null,
      })),
      guidedVsImmediateRatio: calculateGuidedRatio(
        p.guidedMetrics.guidedCount,
        p.guidedMetrics.totalProblemCount,
      ),
      retentionTrend,
      totalSessions,
      weeklyHeadline,
      currentlyWorkingOn,
      progress,
      currentStreak: streaksByProfile.get(p.childProfileId)?.currentStreak ?? 0,
      longestStreak: streaksByProfile.get(p.childProfileId)?.longestStreak ?? 0,
      totalXp: xpByProfile.get(p.childProfileId) ?? 0,
    });
  });

  return children;
}

/**
 * Fetches detailed dashboard data for a single child, with parent access check.
 *
 * [F-PV-06] Replaces the previous all-children fan-out (getChildrenForParent →
 * find) which hit 7 + 10N subrequests and breached the Cloudflare Workers 50-
 * subrequest cap at N≥5. This implementation queries only the requested child,
 * targeting ≤16 subrequests.
 */
export async function getChildDetail(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
): Promise<DashboardChild | null> {
  // [EP15-I5] Throws ForbiddenError (→ 403) on access denial instead of
  // returning null. A null return here now means "parent has access but
  // the child was not present in the dashboard list" — a genuine not-found.
  await assertParentAccess(db, parentProfileId, childProfileId); // 1 query

  // Step 1: Get the child's profile — 1 query
  const profile = await db.query.profiles.findFirst({
    where: and(eq(profiles.id, childProfileId), isNull(profiles.archivedAt)),
  });
  if (!profile) return null;
  const consentState = await db.query.consentStates.findFirst({
    where: eq(consentStates.profileId, childProfileId),
    orderBy: desc(consentStates.requestedAt),
  });

  // Step 2: Get the child's subjects — 1 query
  const childSubjects = await db.query.subjects.findMany({
    where: eq(subjects.profileId, childProfileId),
  });
  const rawInputMap = new Map<string, string | null>(
    childSubjects.map((s) => [s.id, s.rawInput ?? null]),
  );

  // Step 3: Get recent sessions (last 2 weeks, exchangeCount >= 1) — 1 query
  const now = new Date();
  const startOfThisWeek = getStartOfWeek(now);
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  const recentSessions = await db.query.learningSessions.findMany({
    where: and(
      eq(learningSessions.profileId, childProfileId),
      gte(learningSessions.startedAt, startOfLastWeek),
      gte(learningSessions.exchangeCount, 1),
    ),
  });

  // Step 4: Compute derived session metrics
  const sessionsThisWeek = recentSessions.filter(
    (s) => s.startedAt >= startOfThisWeek,
  ).length;
  const sessionsLastWeek = recentSessions.filter(
    (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek,
  ).length;

  // Cap per session to prevent abandoned sessions from inflating the total
  // (same constant as snapshot-aggregation / getChildrenForParent).
  const getDisplaySeconds = (session: {
    wallClockSeconds: number | null;
    durationSeconds: number | null;
  }): number =>
    Math.min(
      session.wallClockSeconds ?? session.durationSeconds ?? 0,
      MAX_SESSION_WALL_CLOCK_SECONDS,
    );

  const totalTimeThisWeek = recentSessions
    .filter((s) => s.startedAt >= startOfThisWeek)
    .reduce((acc, s) => acc + getDisplaySeconds(s), 0);
  const totalTimeLastWeek = recentSessions
    .filter(
      (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek,
    )
    .reduce((acc, s) => acc + getDisplaySeconds(s), 0);

  const exchangesThisWeek = recentSessions
    .filter((s) => s.startedAt >= startOfThisWeek)
    .reduce((acc, s) => acc + s.exchangeCount, 0);
  const exchangesLastWeek = recentSessions
    .filter(
      (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek,
    )
    .reduce((acc, s) => acc + s.exchangeCount, 0);

  // Step 5: Parallel fan-out — getOverallProgress (~6 queries), countGuidedMetrics
  // (1 query), streaks + XP (2 queries) — all concurrent.
  // [BUG-912] Use repo.streaks.findCurrentForToday() so decay-on-read is
  // guaranteed at the repository layer; callers no longer need to apply
  // decay manually before exposing streak counts.
  const childRepo = createScopedRepository(db, childProfileId);
  const [progress, guidedMetrics, streakData, xpResult] = await Promise.all([
    getOverallProgress(db, childProfileId),
    countGuidedMetrics(db, childProfileId, startOfLastWeek),
    childRepo.streaks.findCurrentForToday(todayIso()),
    db
      .select({
        profileId: xpLedger.profileId,
        totalXp: sum(xpLedger.amount).mapWith(Number),
      })
      .from(xpLedger)
      .where(eq(xpLedger.profileId, childProfileId))
      .groupBy(xpLedger.profileId),
  ]);

  const totalTimeThisWeekMinutes = Math.round(totalTimeThisWeek / 60);
  const totalTimeLastWeekMinutes = Math.round(totalTimeLastWeek / 60);
  // [BUG-913] Sort by activity so coaching nudges reference subjects the
  // child has actually practised. getActiveSubjectsByRecency returns subjects
  // ordered by lastSessionAt DESC so the most-recently-used subject is first.
  const activeSubjectsByRecency = await getActiveSubjectsByRecency(
    db,
    childProfileId,
  );
  const subjectNames =
    activeSubjectsByRecency.length > 0
      ? activeSubjectsByRecency.map((s) => s.name)
      : sortSubjectsByActivityPriority(progress.subjects).map((s) => s.name);

  // Step 6: buildChildProgressSummary — 2 queries (snapshot reads)
  const {
    progress: progressSummary,
    totalSessions,
    weeklyHeadline,
    currentlyWorkingOn,
  } = await buildChildProgressSummary(
    db,
    childProfileId,
    profile.displayName,
    sessionsThisWeek,
    sessionsLastWeek,
    totalTimeThisWeekMinutes,
    subjectNames,
    // streakData.currentStreak is already decay-adjusted by the repo layer.
    streakData?.currentStreak ?? 0,
  );

  // Step 7: Compute all derived fields using the same helpers as getChildrenForParent
  const subjectRetentionData = progress.subjects.map((s) => ({
    name: s.name,
    status: s.retentionStatus,
  }));

  const dashboardInput: DashboardInput = {
    childProfileId,
    displayName: profile.displayName,
    sessionsThisWeek,
    sessionsLastWeek,
    totalTimeThisWeekMinutes,
    totalTimeLastWeekMinutes,
    exchangesThisWeek,
    exchangesLastWeek,
    subjectRetentionData,
    guidedCount: guidedMetrics.guidedCount,
    totalProblemCount: guidedMetrics.totalProblemCount,
    // [BUG-906] Lifetime count routes generateChildSummary to lifetime framing
    // for new learners — keeps the headline subtext aligned with the teaser.
    totalSessions,
  };

  const summary = generateChildSummary(dashboardInput);
  const trend = calculateTrend(sessionsThisWeek, sessionsLastWeek);
  const retentionTrend = calculateRetentionTrend(
    subjectRetentionData,
    totalSessions,
  );

  return redactDashboardChild({
    profileId: childProfileId,
    displayName: profile.displayName,
    consentStatus: consentState?.status ?? null,
    respondedAt: consentState?.respondedAt?.toISOString() ?? null,
    summary,
    sessionsThisWeek,
    sessionsLastWeek,
    totalTimeThisWeek: totalTimeThisWeekMinutes,
    totalTimeLastWeek: totalTimeLastWeekMinutes,
    exchangesThisWeek,
    exchangesLastWeek,
    trend,
    subjects: progress.subjects.map((s) => ({
      subjectId: s.subjectId,
      name: s.name,
      retentionStatus: s.retentionStatus,
      rawInput: rawInputMap.get(s.subjectId) ?? null,
    })),
    guidedVsImmediateRatio: calculateGuidedRatio(
      guidedMetrics.guidedCount,
      guidedMetrics.totalProblemCount,
    ),
    retentionTrend,
    totalSessions,
    weeklyHeadline,
    currentlyWorkingOn,
    progress: progressSummary,
    // streakData is already decay-adjusted (repo.streaks.findCurrentForToday).
    currentStreak: streakData?.currentStreak ?? 0,
    longestStreak: streakData?.longestStreak ?? 0,
    totalXp: xpResult[0]?.totalXp ?? 0,
  });
}

/**
 * Fetches topic-level progress for a child's subject, with parent access check.
 */
export async function getChildSubjectTopics(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  subjectId: string,
): Promise<TopicProgress[]> {
  // [EP15-I5] See assertParentAccess comment — ForbiddenError → 403.
  await assertParentAccess(db, parentProfileId, childProfileId);
  await assertChildDashboardDataVisible(db, childProfileId);

  // Verify the subject belongs to the child before querying curriculum (IDOR guard).
  const childSubject = await db.query.subjects.findFirst({
    where: and(
      eq(subjects.id, subjectId),
      eq(subjects.profileId, childProfileId),
    ),
  });
  if (!childSubject) return [];

  // Get curriculum for subject
  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
  });
  if (!curriculum) return [];

  // Get all topics in the curriculum
  const topics = await db.query.curriculumTopics.findMany({
    where: eq(curriculumTopics.curriculumId, curriculum.id),
  });

  const topicIds = topics.map((topic) => topic.id);
  const topicSessionCounts =
    topicIds.length > 0
      ? await db
          .select({
            topicId: learningSessions.topicId,
            totalSessions: sql<number>`count(*)::int`,
          })
          .from(learningSessions)
          .where(
            and(
              eq(learningSessions.profileId, childProfileId),
              eq(learningSessions.subjectId, subjectId),
              inArray(learningSessions.topicId, topicIds),
              gte(learningSessions.exchangeCount, 1),
            ),
          )
          .groupBy(learningSessions.topicId)
      : [];
  const totalSessionsByTopic = new Map(
    topicSessionCounts
      .filter(
        (
          row,
        ): row is {
          topicId: string;
          totalSessions: number;
        } => typeof row.topicId === 'string',
      )
      .map((row) => [row.topicId, row.totalSessions]),
  );

  // [F-PV-06] Batch all per-topic queries into ~6 inArray queries (constant
  // subrequest count) instead of 7 queries × N topics which blows past the
  // Cloudflare Workers 50-subrequest limit for subjects with > 6 topics.
  const results = await getTopicProgressBatch(db, childProfileId, topics);

  // Only return topics where the student had at least 1 exchange.
  // Topics with no sessions have no connection to the student.
  return results
    .map((topic) => ({
      ...topic,
      totalSessions: totalSessionsByTopic.get(topic.topicId) ?? 0,
    }))
    .filter((topic) => topic.totalSessions >= 1);
}

// ---------------------------------------------------------------------------
// Child session list + transcript (parent trust feature)
// ChildSessionDrillScore, ChildSession, getProfileSessions moved to
// ./session/session-crud (PR-2 surface-ownership-boundaries). Re-exported below.
// ---------------------------------------------------------------------------

export async function getChildSessions(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
): Promise<ChildSession[]> {
  // [EP15-I5] ForbiddenError → 403. Empty array now means "parent has
  // access and the child has no sessions", not "access denied".
  await assertParentAccess(db, parentProfileId, childProfileId);
  await assertChildDashboardDataVisible(db, childProfileId);
  const activeProfile = await db.query.profiles.findFirst({
    where: and(eq(profiles.id, childProfileId), isNull(profiles.archivedAt)),
    columns: { id: true },
  });
  if (!activeProfile) return [];
  return getProfileSessions(db, childProfileId);
}

// parseEngagementSignal moved to ./session/session-crud and imported above.

export async function getChildSessionDetail(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  sessionId: string,
): Promise<ChildSession | null> {
  await assertParentAccess(db, parentProfileId, childProfileId);
  await assertChildDashboardDataVisible(db, childProfileId);

  const session = await db.query.learningSessions.findFirst({
    where: and(
      eq(learningSessions.id, sessionId),
      eq(learningSessions.profileId, childProfileId),
    ),
  });
  if (!session) return null;

  const metadata = getSessionMetadata(session.metadata);
  const homeworkSummary = metadata.homeworkSummary ?? null;

  // [BUG-526] Fetch highlight + structured subject/topic names + drill scores
  // in parallel. Drill rows mirror the sparse query pattern in
  // getProfileSessions: filter by IS NOT NULL so the per-event ai_response
  // count stays bounded.
  const [summary, subjectRow, topicRow, drillRows] = await Promise.all([
    db.query.sessionSummaries.findFirst({
      where: eq(sessionSummaries.sessionId, sessionId),
      columns: {
        highlight: true,
        narrative: true,
        conversationPrompt: true,
        engagementSignal: true,
      },
    }),
    db.query.subjects.findFirst({
      where: eq(subjects.id, session.subjectId),
      columns: { name: true },
    }),
    session.topicId
      ? db.query.curriculumTopics.findFirst({
          where: eq(curriculumTopics.id, session.topicId),
          columns: { title: true },
        })
      : Promise.resolve(null),
    db
      .select({
        drillCorrect: sessionEvents.drillCorrect,
        drillTotal: sessionEvents.drillTotal,
        createdAt: sessionEvents.createdAt,
      })
      .from(sessionEvents)
      .where(
        and(
          eq(sessionEvents.sessionId, sessionId),
          eq(sessionEvents.eventType, 'ai_response'),
          isNotNull(sessionEvents.drillTotal),
        ),
      )
      .orderBy(asc(sessionEvents.createdAt)),
  ]);

  const drills: ChildSessionDrillScore[] = [];
  for (const row of drillRows) {
    if (row.drillCorrect == null || row.drillTotal == null) continue;
    drills.push({
      correct: row.drillCorrect,
      total: row.drillTotal,
      createdAt: row.createdAt.toISOString(),
    });
  }

  return {
    sessionId: session.id,
    subjectId: session.subjectId,
    subjectName: subjectRow?.name ?? null,
    topicId: session.topicId,
    topicTitle: topicRow?.title ?? null,
    sessionType: session.sessionType,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    exchangeCount: session.exchangeCount,
    escalationRung: session.escalationRung,
    durationSeconds: session.durationSeconds,
    wallClockSeconds: session.wallClockSeconds,
    displayTitle: formatSessionDisplayTitle(
      session.sessionType,
      homeworkSummary,
    ),
    displaySummary: homeworkSummary?.summary ?? null,
    homeworkSummary,
    highlight: summary?.highlight ?? null,
    narrative: summary?.narrative ?? null,
    conversationPrompt: summary?.conversationPrompt ?? null,
    engagementSignal: parseEngagementSignal(summary?.engagementSignal),
    drills,
  };
}

export async function getChildInventory(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
): Promise<KnowledgeInventory> {
  // [EP15-I5] Return type tightened from `| null`. Access denial now
  // throws (→ 403); the only remaining path is a valid inventory.
  await assertParentAccess(db, parentProfileId, childProfileId);
  await assertChildDashboardDataVisible(db, childProfileId);
  return buildKnowledgeInventory(db, childProfileId);
}

export async function getChildProgressHistory(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  input?: {
    from?: string;
    to?: string;
    granularity?: 'daily' | 'weekly';
  },
): Promise<ProgressHistory> {
  // [EP15-I5] Return type tightened — access denial throws, not returns null.
  await assertParentAccess(db, parentProfileId, childProfileId);
  await assertChildDashboardDataVisible(db, childProfileId);
  return buildProgressHistory(db, childProfileId, input);
}

export async function getChildReports(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
): Promise<MonthlyReportSummary[]> {
  // [EP15-I5] Access denial throws (→ 403). Empty array now means "no
  // reports yet for this child" — semantically distinct from forbidden.
  await assertParentAccess(db, parentProfileId, childProfileId);
  await assertChildDashboardDataVisible(db, childProfileId);
  return listMonthlyReportsForParentChild(db, parentProfileId, childProfileId);
}

export async function getChildReportDetail(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  reportId: string,
): Promise<MonthlyReportRecord | null> {
  // [EP15-I5] null now only means "access granted but report not found".
  await assertParentAccess(db, parentProfileId, childProfileId);
  await assertChildDashboardDataVisible(db, childProfileId);
  return getMonthlyReportForParentChild(
    db,
    parentProfileId,
    childProfileId,
    reportId,
  );
}

export async function markChildReportViewed(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  reportId: string,
): Promise<void> {
  // [EP15-I5] Previously silently returned on access denial, letting an
  // unauthorized POST pretend to succeed. Now throws → 403.
  await assertParentAccess(db, parentProfileId, childProfileId);
  await assertChildDashboardDataVisible(db, childProfileId);
  await markMonthlyReportViewed(db, parentProfileId, childProfileId, reportId);
}

export function buildDemoDashboard(): DemoDashboardData {
  const alexThisWeek: ProgressMetrics = {
    ...emptyProgressMetrics(),
    totalSessions: 12,
    totalActiveMinutes: 180,
    topicsMastered: 2,
    vocabularyTotal: 17,
    subjects: [
      {
        subjectId: 'demo-math',
        subjectName: 'Mathematics',
        pedagogyMode: 'four_strands',
        topicsAttempted: 5,
        topicsMastered: 2,
        topicsTotal: 10,
        topicsExplored: 3,
        vocabularyTotal: 17,
        vocabularyMastered: 10,
        sessionsCount: 4,
        activeMinutes: 180,
        wallClockMinutes: 180,
        lastSessionAt: null,
      },
    ],
  };
  const alexLastWeek: ProgressMetrics = {
    ...emptyProgressMetrics(),
    totalSessions: 8,
    totalActiveMinutes: 90,
    topicsMastered: 1,
    vocabularyTotal: 5,
  };
  const alexReport = generateWeeklyReportData(
    'Alex',
    '2026-01-06',
    alexThisWeek,
    alexLastWeek,
  );

  const samThisWeek = emptyProgressMetrics();
  const samLastWeek = emptyProgressMetrics();
  const samReport = generateWeeklyReportData(
    'Sam',
    '2026-01-06',
    samThisWeek,
    samLastWeek,
  );

  return {
    demoMode: true,
    pendingNotices: [],
    children: [
      {
        profileId: 'demo-child-1',
        displayName: 'Alex',
        consentStatus: null,
        respondedAt: null,
        // [BUG-876] Demo summary must mention every subject by its canonical
        // name so the dashboard, library, and shelf all read the same word.
        // generateChildSummary only surfaces fading/weak subjects, so we
        // hardcode the showcase summary here.
        summary:
          'Alex: Mathematics — 5 problems, 3 guided. Science fading. 4 sessions this week (↑ from 2 last week).',
        sessionsThisWeek: 4,
        sessionsLastWeek: 2,
        totalTimeThisWeek: 180,
        totalTimeLastWeek: 90,
        exchangesThisWeek: 0,
        exchangesLastWeek: 0,
        trend: 'up',
        subjects: [
          { name: 'Mathematics', retentionStatus: 'strong' },
          { name: 'Science', retentionStatus: 'fading' },
        ],
        guidedVsImmediateRatio: 0.6,
        retentionTrend: 'stable',
        totalSessions: 12,
        weeklyHeadline: alexReport.headlineStat,
        currentlyWorkingOn: ['Fractions', 'Cell structure'],
        currentStreak: 3,
        longestStreak: 7,
        totalXp: 450,
      },
      {
        profileId: 'demo-child-2',
        displayName: 'Sam',
        consentStatus: null,
        respondedAt: null,
        summary:
          'Sam: English — steady progress. 3 sessions this week (→ same as last week).',
        sessionsThisWeek: 3,
        sessionsLastWeek: 3,
        totalTimeThisWeek: 120,
        totalTimeLastWeek: 115,
        exchangesThisWeek: 0,
        exchangesLastWeek: 0,
        trend: 'stable',
        subjects: [{ name: 'English', retentionStatus: 'strong' }],
        guidedVsImmediateRatio: 0.3,
        retentionTrend: 'improving',
        totalSessions: 8,
        weeklyHeadline: samReport.headlineStat,
        currentlyWorkingOn: ['Essay structure'],
        currentStreak: 1,
        longestStreak: 5,
        totalXp: 280,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Re-export shims — PR-2 surface-ownership-boundaries
// Functions have moved to better-fitting homes. These shims keep all existing
// internal consumers compiling without a sweep in this PR. Remove once call
// sites are updated.
// ---------------------------------------------------------------------------

export {
  calculateTrend,
  calculateRetentionTrend,
  calculateGuidedRatio,
  buildProgressGuidance,
} from './progress-helpers';

export {
  countGuidedMetrics,
  countGuidedMetricsBatch,
} from './session/session-analytics';
export type { GuidedMetrics } from './session/session-analytics';

export {
  getProfileSessions,
  getSessionMetadata,
  formatSessionDisplayTitle,
  parseEngagementSignal,
} from './session/session-crud';
export type {
  ChildSession,
  ChildSessionDrillScore,
} from './session/session-crud';
