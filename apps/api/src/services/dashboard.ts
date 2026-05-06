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
} from 'drizzle-orm';
import {
  familyLinks,
  profiles,
  learningSessions,
  sessionEvents,
  subjects,
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
  engagementSignalSchema,
  NEW_LEARNER_SESSION_THRESHOLD,
} from '@eduagent/schemas';
import type {
  DashboardChild,
  EngagementSignal,
  HomeworkSummary,
  KnowledgeInventory,
  MonthlyReportRecord,
  MonthlyReportSummary,
  ProgressHistory,
  SessionMetadata,
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
import { assertParentAccess } from './family-access';
import {
  isoDate,
  subtractDays,
  sumTopicsExplored,
  getActiveSubjectsByRecency,
} from './progress-helpers';

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
      `${input.totalProblemCount} problems, ${input.guidedCount} guided`
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
      input.sessionsLastWeek
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
        input.sessionsThisWeek
      )} this week (${trendArrow} ${trendWord} last week)`
    );
  }

  return `${input.displayName}: ${parts.join('. ')}.`;
}

/** Minimum completed sessions before trend signals carry meaning. [F-PV-03] */
const MIN_TREND_SESSIONS = 3;

/**
 * Calculates retention trend as a snapshot heuristic.
 * Compares strong count vs weak+fading count across all subjects.
 * Returns 'stable' when totalSessions < MIN_TREND_SESSIONS — the signal is
 * noise at low N.
 */
export function calculateRetentionTrend(
  subjectRetentionData: Array<{
    status: 'strong' | 'fading' | 'weak' | 'forgotten';
  }>,
  totalSessions?: number
): 'improving' | 'declining' | 'stable' {
  if (
    subjectRetentionData.length === 0 ||
    (totalSessions ?? 0) < MIN_TREND_SESSIONS
  )
    return 'stable';
  const strongCount = subjectRetentionData.filter(
    (s) => s.status === 'strong'
  ).length;
  const weakCount = subjectRetentionData.filter(
    (s) =>
      s.status === 'weak' || s.status === 'fading' || s.status === 'forgotten'
  ).length;
  if (strongCount > weakCount) return 'improving';
  if (strongCount < weakCount) return 'declining';
  return 'stable';
}

/**
 * Calculates the trend between current and previous values.
 */
export function calculateTrend(
  current: number,
  previous: number
): 'up' | 'down' | 'stable' {
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'stable';
}

/**
 * Calculates the guided-vs-immediate ratio.
 *
 * Returns 0-1 ratio where 1 means all problems were guided.
 * Returns 0 if totalCount is 0.
 */
export function calculateGuidedRatio(guided: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(1, Math.max(0, guided / total));
}

export interface GuidedMetrics {
  guidedCount: number;
  totalProblemCount: number;
}

/**
 * Counts AI-response events in sessionEvents for a child within a date range,
 * classifying those with escalationRung >= 3 as "guided".
 *
 * Rung 1-2 = Socratic (child thinking independently)
 * Rung 3+ = Parallel Example / Transfer Bridge / Teaching Mode (AI had to demonstrate)
 */
export async function countGuidedMetrics(
  db: Database,
  childProfileId: string,
  startDate: Date
): Promise<GuidedMetrics> {
  // BUG-731 [PERF-1]: previously loaded every ai_response event into JS to
  // count one JSONB field. Now aggregated in SQL: a single round-trip
  // returns COUNT(*) plus a conditional COUNT for rung >= 3.
  //
  // Rungs are stored on `metadata->>'escalationRung'` as JSON-encoded
  // numbers; the `->>` operator returns text, which casts cleanly to int
  // (Postgres rejects non-numeric text and we filter to ai_response rows
  // that always set the field, so the cast is safe in practice).
  const [row] = await db
    .select({
      guidedCount: sql<number>`COUNT(*) FILTER (WHERE (${sessionEvents.metadata}->>'escalationRung')::int >= 3)`,
      totalProblemCount: sql<number>`COUNT(*)`,
    })
    .from(sessionEvents)
    .where(
      and(
        eq(sessionEvents.profileId, childProfileId),
        eq(sessionEvents.eventType, 'ai_response'),
        gte(sessionEvents.createdAt, startDate)
      )
    );

  // drizzle returns aggregate counts as string from the pg driver. Coerce
  // to number so callers stay JSON-clean.
  return {
    guidedCount: Number(row?.guidedCount ?? 0),
    totalProblemCount: Number(row?.totalProblemCount ?? 0),
  };
}

/**
 * Batched variant of countGuidedMetrics for dashboards covering multiple
 * children. Replaces N parallel round-trips (one per child) with a single
 * GROUP BY query.
 *
 * [BUG-734 / PERF-4] The parent dashboard previously called
 * countGuidedMetrics inside Promise.all over every child link, which made
 * one connection-bound round-trip per child. For a parent of 4 children
 * that is 4× the latency tax with identical SQL shape on every call. This
 * variant collapses them into a single aggregate query keyed by profileId
 * and returns a Map so callers can index by child ID without losing the
 * "0 events" case (children with no events appear in the map with zeros).
 */
export async function countGuidedMetricsBatch(
  db: Database,
  childProfileIds: string[],
  startDate: Date
): Promise<Map<string, GuidedMetrics>> {
  const result = new Map<string, GuidedMetrics>();
  for (const id of childProfileIds) {
    result.set(id, { guidedCount: 0, totalProblemCount: 0 });
  }
  if (childProfileIds.length === 0) return result;

  const rows = await db
    .select({
      profileId: sessionEvents.profileId,
      guidedCount: sql<number>`COUNT(*) FILTER (WHERE (${sessionEvents.metadata}->>'escalationRung')::int >= 3)`,
      totalProblemCount: sql<number>`COUNT(*)`,
    })
    .from(sessionEvents)
    .where(
      and(
        inArray(sessionEvents.profileId, childProfileIds),
        eq(sessionEvents.eventType, 'ai_response'),
        gte(sessionEvents.createdAt, startDate)
      )
    )
    .groupBy(sessionEvents.profileId);

  for (const row of rows) {
    result.set(row.profileId, {
      guidedCount: Number(row.guidedCount ?? 0),
      totalProblemCount: Number(row.totalProblemCount ?? 0),
    });
  }
  return result;
}

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

function getSessionMetadata(metadata: unknown): SessionMetadata {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return metadata as SessionMetadata;
}

function formatSessionDisplayTitle(
  sessionType: string,
  homeworkSummary?: HomeworkSummary | null
): string {
  if (homeworkSummary?.displayTitle) {
    return homeworkSummary.displayTitle;
  }

  switch (sessionType) {
    case 'homework':
      return 'Homework';
    case 'interleaved':
      return 'Interleaved Practice';
    default:
      return 'Learning';
  }
}

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
  }
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

export function buildProgressGuidance(
  childName: string,
  subjectNames: string[],
  sessionsThisWeek: number,
  previousSessions: number,
  currentStreak?: number
): string | null {
  const primarySubject = subjectNames[0];

  if (sessionsThisWeek === 0 && primarySubject) {
    // [BUG-523] A non-zero streak proves recent activity — "Quiet week" would
    // contradict the visible streak badge. Show an encouraging nudge instead.
    if ((currentStreak ?? 0) > 0) {
      return `${childName} has a ${
        currentStreak ?? 0
      }-day streak — keep it going with ${primarySubject}!`;
    }
    return `Quiet week — maybe suggest a quick session on ${primarySubject}?`;
  }

  if (sessionsThisWeek < previousSessions && primarySubject) {
    return `${childName} is still building knowledge. ${primarySubject} might be a good next nudge.`;
  }

  return null;
}

async function buildChildProgressSummary(
  db: Database,
  childProfileId: string,
  childName: string,
  sessionsThisWeek: number,
  sessionsLastWeek: number,
  totalTimeThisWeekMinutes: number,
  subjectNames: string[],
  currentStreak?: number
): Promise<{ progress: DashboardChild['progress']; totalSessions: number }> {
  // [F-PV-07] Compute totalSessions live with the same filter as getChildSessions
  // (exchangeCount >= 1) instead of reading the stale snapshot value. This
  // prevents the dashboard aggregate from disagreeing with the sessions list.
  const [latestSnapshot, liveCountRows] = await Promise.all([
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
          ne(learningSessions.status, 'active')
        )
      ),
  ]);
  const liveSessionCount = liveCountRows[0]?.count ?? 0;
  if (!latestSnapshot) {
    return { progress: null, totalSessions: liveSessionCount };
  }

  const previousSnapshot = await getLatestSnapshotOnOrBefore(
    db,
    childProfileId,
    isoDate(
      subtractDays(new Date(`${latestSnapshot.snapshotDate}T00:00:00Z`), 7)
    )
  );

  const previousMetrics = previousSnapshot?.metrics ?? null;
  const currentMetrics = latestSnapshot.metrics;

  return {
    progress: {
      snapshotDate: latestSnapshot.snapshotDate,
      topicsMastered: currentMetrics.topicsMastered,
      vocabularyTotal: currentMetrics.vocabularyTotal,
      minutesThisWeek: totalTimeThisWeekMinutes,
      weeklyDeltaTopicsMastered: previousMetrics
        ? Math.max(
            0,
            currentMetrics.topicsMastered - previousMetrics.topicsMastered
          )
        : null,
      weeklyDeltaVocabularyTotal: previousMetrics
        ? Math.max(
            0,
            currentMetrics.vocabularyTotal - previousMetrics.vocabularyTotal
          )
        : null,
      weeklyDeltaTopicsExplored: previousMetrics
        ? Math.max(
            0,
            sumTopicsExplored(currentMetrics) -
              sumTopicsExplored(previousMetrics)
          )
        : null,
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
        currentStreak
      ),
    },
    totalSessions: liveSessionCount,
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
  parentProfileId: string
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
    where: inArray(profiles.id, childProfileIds),
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
      gte(learningSessions.exchangeCount, 1)
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
      validLinks.map((l) => getOverallProgress(db, l.childProfileId))
    ),
    countGuidedMetricsBatch(
      db,
      validLinks.map((l) => l.childProfileId),
      startOfLastWeek
    ),
  ]);
  const guidedMetricsResults = validLinks.map(
    (l) =>
      guidedMetricsByProfile.get(l.childProfileId) ?? {
        guidedCount: 0,
        totalProblemCount: 0,
      }
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
    })
  );
  const xpByProfile = new Map(
    xpResults.map((x) => [x.profileId, x.totalXp ?? 0])
  );

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
      (s) => s.startedAt >= startOfThisWeek
    ).length;
    const sessionsLastWeek = recentSessions.filter(
      (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek
    ).length;

    // Prefer wall-clock time with active-time fallback for legacy sessions.
    // Cap per session to prevent abandoned sessions from inflating the total.
    const getDisplaySeconds = (session: {
      wallClockSeconds: number | null;
      durationSeconds: number | null;
    }): number =>
      Math.min(
        session.wallClockSeconds ?? session.durationSeconds ?? 0,
        MAX_SESSION_WALL_CLOCK_SECONDS
      );

    const totalTimeThisWeek = recentSessions
      .filter((s) => s.startedAt >= startOfThisWeek)
      .reduce((sum, s) => sum + getDisplaySeconds(s), 0);
    const totalTimeLastWeek = recentSessions
      .filter(
        (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek
      )
      .reduce((sum, s) => sum + getDisplaySeconds(s), 0);

    // FR215.4: "X minutes, Y exchanges"
    const exchangesThisWeek = recentSessions
      .filter((s) => s.startedAt >= startOfThisWeek)
      .reduce((sum, s) => sum + s.exchangeCount, 0);
    const exchangesLastWeek = recentSessions
      .filter(
        (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek
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
        (subject) => subject.name
      ),
      dashboardInput,
      progress,
      guidedMetrics,
      rawInputMap,
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
        streaksByProfile.get(p.childProfileId)?.currentStreak ?? 0
      )
    )
  );

  const children: DashboardChild[] = prepared.map((p, i) => {
    const progressSummary = progressSummaries[i];
    if (!progressSummary)
      throw new Error(`progressSummaries[${i}] is unexpectedly undefined`);
    const { progress, totalSessions } = progressSummary;
    // [BUG-906] Inject lifetime count so generateChildSummary can pick the
    // right framing (lifetime for new learners, weekly cadence otherwise).
    const summary = generateChildSummary({
      ...p.dashboardInput,
      totalSessions,
    });
    const trend = calculateTrend(p.sessionsThisWeek, p.sessionsLastWeek);
    const retentionTrend = calculateRetentionTrend(
      p.dashboardInput.subjectRetentionData,
      totalSessions
    );

    return {
      profileId: p.childProfileId,
      displayName: p.displayName,
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
        p.guidedMetrics.totalProblemCount
      ),
      retentionTrend,
      totalSessions,
      progress,
      currentStreak: streaksByProfile.get(p.childProfileId)?.currentStreak ?? 0,
      longestStreak: streaksByProfile.get(p.childProfileId)?.longestStreak ?? 0,
      totalXp: xpByProfile.get(p.childProfileId) ?? 0,
    };
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
  childProfileId: string
): Promise<DashboardChild | null> {
  // [EP15-I5] Throws ForbiddenError (→ 403) on access denial instead of
  // returning null. A null return here now means "parent has access but
  // the child was not present in the dashboard list" — a genuine not-found.
  await assertParentAccess(db, parentProfileId, childProfileId); // 1 query

  // Step 1: Get the child's profile — 1 query
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, childProfileId),
  });
  if (!profile) return null;

  // Step 2: Get the child's subjects — 1 query
  const childSubjects = await db.query.subjects.findMany({
    where: eq(subjects.profileId, childProfileId),
  });
  const rawInputMap = new Map<string, string | null>(
    childSubjects.map((s) => [s.id, s.rawInput ?? null])
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
      gte(learningSessions.exchangeCount, 1)
    ),
  });

  // Step 4: Compute derived session metrics
  const sessionsThisWeek = recentSessions.filter(
    (s) => s.startedAt >= startOfThisWeek
  ).length;
  const sessionsLastWeek = recentSessions.filter(
    (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek
  ).length;

  // Cap per session to prevent abandoned sessions from inflating the total
  // (same constant as snapshot-aggregation / getChildrenForParent).
  const getDisplaySeconds = (session: {
    wallClockSeconds: number | null;
    durationSeconds: number | null;
  }): number =>
    Math.min(
      session.wallClockSeconds ?? session.durationSeconds ?? 0,
      MAX_SESSION_WALL_CLOCK_SECONDS
    );

  const totalTimeThisWeek = recentSessions
    .filter((s) => s.startedAt >= startOfThisWeek)
    .reduce((acc, s) => acc + getDisplaySeconds(s), 0);
  const totalTimeLastWeek = recentSessions
    .filter(
      (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek
    )
    .reduce((acc, s) => acc + getDisplaySeconds(s), 0);

  const exchangesThisWeek = recentSessions
    .filter((s) => s.startedAt >= startOfThisWeek)
    .reduce((acc, s) => acc + s.exchangeCount, 0);
  const exchangesLastWeek = recentSessions
    .filter(
      (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek
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
    childProfileId
  );
  const subjectNames =
    activeSubjectsByRecency.length > 0
      ? activeSubjectsByRecency.map((s) => s.name)
      : sortSubjectsByActivityPriority(progress.subjects).map((s) => s.name);

  // Step 6: buildChildProgressSummary — 2 queries (snapshot reads)
  const { progress: progressSummary, totalSessions } =
    await buildChildProgressSummary(
      db,
      childProfileId,
      profile.displayName,
      sessionsThisWeek,
      sessionsLastWeek,
      totalTimeThisWeekMinutes,
      subjectNames,
      // streakData.currentStreak is already decay-adjusted by the repo layer.
      streakData?.currentStreak ?? 0
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
    totalSessions
  );

  return {
    profileId: childProfileId,
    displayName: profile.displayName,
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
      guidedMetrics.totalProblemCount
    ),
    retentionTrend,
    totalSessions,
    progress: progressSummary,
    // streakData is already decay-adjusted (repo.streaks.findCurrentForToday).
    currentStreak: streakData?.currentStreak ?? 0,
    longestStreak: streakData?.longestStreak ?? 0,
    totalXp: xpResult[0]?.totalXp ?? 0,
  };
}

/**
 * Fetches topic-level progress for a child's subject, with parent access check.
 */
export async function getChildSubjectTopics(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  subjectId: string
): Promise<TopicProgress[]> {
  // [EP15-I5] See assertParentAccess comment — ForbiddenError → 403.
  await assertParentAccess(db, parentProfileId, childProfileId);

  // Verify the subject belongs to the child before querying curriculum (IDOR guard).
  const childSubject = await db.query.subjects.findFirst({
    where: and(
      eq(subjects.id, subjectId),
      eq(subjects.profileId, childProfileId)
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
              gte(learningSessions.exchangeCount, 1)
            )
          )
          .groupBy(learningSessions.topicId)
      : [];
  const totalSessionsByTopic = new Map(
    topicSessionCounts
      .filter(
        (
          row
        ): row is {
          topicId: string;
          totalSessions: number;
        } => typeof row.topicId === 'string'
      )
      .map((row) => [row.topicId, row.totalSessions])
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
// ---------------------------------------------------------------------------

export interface ChildSessionDrillScore {
  correct: number;
  total: number;
  createdAt: string;
}

export interface ChildSession {
  sessionId: string;
  subjectId: string;
  subjectName: string | null;
  topicId: string | null;
  topicTitle: string | null;
  sessionType: string;
  startedAt: string;
  endedAt: string | null;
  exchangeCount: number;
  escalationRung: number;
  durationSeconds: number | null;
  wallClockSeconds: number | null;
  displayTitle: string;
  displaySummary: string | null;
  homeworkSummary: HomeworkSummary | null;
  highlight: string | null;
  narrative: string | null;
  conversationPrompt: string | null;
  engagementSignal: EngagementSignal | null;
  /**
   * Fluency-drill outcomes recorded during this session, oldest first.
   * Empty when no scored drill happened. Used by per-topic detail to render
   * a "Recent drills: 4/5, 3/5, 5/5" strip without a separate endpoint.
   */
  drills: ChildSessionDrillScore[];
}

/**
 * Lists recent sessions for a child, with parent access check.
 * Returns up to 50 most recent sessions ordered by startedAt descending.
 */
export async function getProfileSessions(
  db: Database,
  profileId: string
): Promise<ChildSession[]> {
  const scoped = createScopedRepository(db, profileId);
  const sessions = await scoped.sessions.findMany(
    gte(learningSessions.exchangeCount, 1),
    50,
    desc(learningSessions.startedAt)
  );

  if (sessions.length === 0) return [];

  // Batch-fetch highlights from session_summaries for all sessions
  const sessionIds = sessions.map((s) => s.id);

  // [BUG-526] Batch-fetch subject names and topic titles so the mobile
  // client can render structured context instead of relying on the highlight string.
  const uniqueSubjectIds = [...new Set(sessions.map((s) => s.subjectId))];
  const uniqueTopicIds = [
    ...new Set(sessions.map((s) => s.topicId).filter(Boolean) as string[]),
  ];

  const [summaries, subjectRows, topicRows, drillRows] = await Promise.all([
    db.query.sessionSummaries.findMany({
      where: inArray(sessionSummaries.sessionId, sessionIds),
      columns: {
        sessionId: true,
        highlight: true,
        narrative: true,
        conversationPrompt: true,
        engagementSignal: true,
      },
    }),
    uniqueSubjectIds.length > 0
      ? db.query.subjects.findMany({
          where: inArray(subjects.id, uniqueSubjectIds),
          columns: { id: true, name: true },
        })
      : Promise.resolve([]),
    uniqueTopicIds.length > 0
      ? db.query.curriculumTopics.findMany({
          where: inArray(curriculumTopics.id, uniqueTopicIds),
          columns: { id: true, title: true },
        })
      : Promise.resolve([]),
    // Fluency-drill outcomes for each session, oldest first. Sparse: most
    // ai_response rows have null drill columns, so the IS NOT NULL filter
    // keeps the row count small even on the 50-session window.
    db
      .select({
        sessionId: sessionEvents.sessionId,
        drillCorrect: sessionEvents.drillCorrect,
        drillTotal: sessionEvents.drillTotal,
        createdAt: sessionEvents.createdAt,
      })
      .from(sessionEvents)
      .where(
        and(
          inArray(sessionEvents.sessionId, sessionIds),
          eq(sessionEvents.eventType, 'ai_response'),
          isNotNull(sessionEvents.drillTotal)
        )
      )
      .orderBy(asc(sessionEvents.createdAt)),
  ]);

  const summaryBySession = new Map(
    summaries.map((summary) => [summary.sessionId, summary])
  );
  const subjectNameById = new Map(subjectRows.map((s) => [s.id, s.name]));
  const topicTitleById = new Map(topicRows.map((t) => [t.id, t.title]));
  const drillsBySession = new Map<string, ChildSessionDrillScore[]>();
  for (const row of drillRows) {
    if (row.drillCorrect == null || row.drillTotal == null) continue;
    const list = drillsBySession.get(row.sessionId) ?? [];
    list.push({
      correct: row.drillCorrect,
      total: row.drillTotal,
      createdAt: row.createdAt.toISOString(),
    });
    drillsBySession.set(row.sessionId, list);
  }

  return sessions.map((s) => {
    const metadata = getSessionMetadata(s.metadata);
    const homeworkSummary = metadata.homeworkSummary ?? null;

    const summary = summaryBySession.get(s.id);

    return {
      sessionId: s.id,
      subjectId: s.subjectId,
      subjectName: subjectNameById.get(s.subjectId) ?? null,
      topicId: s.topicId,
      topicTitle: s.topicId ? topicTitleById.get(s.topicId) ?? null : null,
      sessionType: s.sessionType,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      exchangeCount: s.exchangeCount,
      escalationRung: s.escalationRung,
      durationSeconds: s.durationSeconds,
      wallClockSeconds: s.wallClockSeconds,
      displayTitle: formatSessionDisplayTitle(s.sessionType, homeworkSummary),
      displaySummary: homeworkSummary?.summary ?? null,
      homeworkSummary,
      highlight: summary?.highlight ?? null,
      narrative: summary?.narrative ?? null,
      conversationPrompt: summary?.conversationPrompt ?? null,
      engagementSignal: parseEngagementSignal(summary?.engagementSignal),
      drills: drillsBySession.get(s.id) ?? [],
    };
  });
}

export async function getChildSessions(
  db: Database,
  parentProfileId: string,
  childProfileId: string
): Promise<ChildSession[]> {
  // [EP15-I5] ForbiddenError → 403. Empty array now means "parent has
  // access and the child has no sessions", not "access denied".
  await assertParentAccess(db, parentProfileId, childProfileId);
  return getProfileSessions(db, childProfileId);
}

function parseEngagementSignal(
  raw: string | null | undefined
): EngagementSignal | null {
  if (!raw) return null;
  const parsed = engagementSignalSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function getChildSessionDetail(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  sessionId: string
): Promise<ChildSession | null> {
  await assertParentAccess(db, parentProfileId, childProfileId);

  const session = await db.query.learningSessions.findFirst({
    where: and(
      eq(learningSessions.id, sessionId),
      eq(learningSessions.profileId, childProfileId)
    ),
  });
  if (!session) return null;

  const metadata = getSessionMetadata(session.metadata);
  const homeworkSummary = metadata.homeworkSummary ?? null;

  // [BUG-526] Fetch highlight + structured subject/topic names in parallel
  const [summary, subjectRow, topicRow] = await Promise.all([
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
  ]);

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
      homeworkSummary
    ),
    displaySummary: homeworkSummary?.summary ?? null,
    homeworkSummary,
    highlight: summary?.highlight ?? null,
    narrative: summary?.narrative ?? null,
    conversationPrompt: summary?.conversationPrompt ?? null,
    engagementSignal: parseEngagementSignal(summary?.engagementSignal),
    drills: [],
  };
}

export async function getChildInventory(
  db: Database,
  parentProfileId: string,
  childProfileId: string
): Promise<KnowledgeInventory> {
  // [EP15-I5] Return type tightened from `| null`. Access denial now
  // throws (→ 403); the only remaining path is a valid inventory.
  await assertParentAccess(db, parentProfileId, childProfileId);
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
  }
): Promise<ProgressHistory> {
  // [EP15-I5] Return type tightened — access denial throws, not returns null.
  await assertParentAccess(db, parentProfileId, childProfileId);
  return buildProgressHistory(db, childProfileId, input);
}

export async function getChildReports(
  db: Database,
  parentProfileId: string,
  childProfileId: string
): Promise<MonthlyReportSummary[]> {
  // [EP15-I5] Access denial throws (→ 403). Empty array now means "no
  // reports yet for this child" — semantically distinct from forbidden.
  await assertParentAccess(db, parentProfileId, childProfileId);
  return listMonthlyReportsForParentChild(db, parentProfileId, childProfileId);
}

export async function getChildReportDetail(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  reportId: string
): Promise<MonthlyReportRecord | null> {
  // [EP15-I5] null now only means "access granted but report not found".
  await assertParentAccess(db, parentProfileId, childProfileId);
  return getMonthlyReportForParentChild(
    db,
    parentProfileId,
    childProfileId,
    reportId
  );
}

export async function markChildReportViewed(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  reportId: string
): Promise<void> {
  // [EP15-I5] Previously silently returned on access denial, letting an
  // unauthorized POST pretend to succeed. Now throws → 403.
  await assertParentAccess(db, parentProfileId, childProfileId);
  await markMonthlyReportViewed(db, parentProfileId, childProfileId, reportId);
}
