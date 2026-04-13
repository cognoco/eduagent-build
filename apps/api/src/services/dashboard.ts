// ---------------------------------------------------------------------------
// Parent Dashboard Data — Story 4.11
// Pure business logic + DB-aware query functions, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, gte, inArray, desc } from 'drizzle-orm';
import {
  familyLinks,
  profiles,
  learningSessions,
  sessionEvents,
  subjects,
  curricula,
  curriculumTopics,
  type Database,
} from '@eduagent/database';
import type {
  DashboardChild,
  HomeworkSummary,
  KnowledgeInventory,
  MonthlyReportRecord,
  MonthlyReportSummary,
  ProgressHistory,
  SessionMetadata,
  TopicProgress,
} from '@eduagent/schemas';
import { getOverallProgress, getTopicProgress } from './progress';
import {
  buildKnowledgeInventory,
  buildProgressHistory,
  getLatestSnapshot,
  getLatestSnapshotOnOrBefore,
} from './snapshot-aggregation';
import {
  getMonthlyReportForParentChild,
  listMonthlyReportsForParentChild,
  markMonthlyReportViewed,
} from './monthly-report';
import { ForbiddenError } from '../errors';

/**
 * [EP15-I5] Central enforcement of parent→child access checks.
 *
 * Prior implementation scattered `if (!(await hasParentAccess(...))) return null`
 * across seven functions, and the routes blindly serialized the null result
 * as `{ inventory: null }` / `{ reports: [] }` with HTTP 200. That masked
 * authorization denials as empty states — an attacker iterating child IDs
 * could not tell a forbidden child apart from a genuinely empty one, and
 * legitimate users saw "no reports yet" instead of "you lost access to this
 * child". Both outcomes are wrong.
 *
 * `assertParentAccess` throws `ForbiddenError` on failure, and the global
 * `app.onError` handler in `index.ts` converts it to HTTP 403 once.
 */
async function assertParentAccess(
  db: Database,
  parentProfileId: string,
  childProfileId: string
): Promise<void> {
  if (!(await hasParentAccess(db, parentProfileId, childProfileId))) {
    throw new ForbiddenError('You do not have access to this child profile.');
  }
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
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Generates a one-sentence summary for a child's progress.
 *
 * Example: "Alex: Math — 5 problems, 3 guided. Science fading. 4 sessions this week (up from 2 last week)."
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

  // Session trend
  const trend = calculateTrend(input.sessionsThisWeek, input.sessionsLastWeek);
  const trendArrow =
    trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192';
  const trendWord =
    trend === 'up'
      ? `up from ${input.sessionsLastWeek}`
      : trend === 'down'
      ? `down from ${input.sessionsLastWeek}`
      : 'same as';

  parts.push(
    `${input.sessionsThisWeek} sessions this week (${trendArrow} ${trendWord} last week)`
  );

  return `${input.displayName}: ${parts.join('. ')}.`;
}

/**
 * Calculates retention trend as a snapshot heuristic.
 * Compares strong count vs weak+fading count across all subjects.
 */
export function calculateRetentionTrend(
  subjectRetentionData: Array<{
    status: 'strong' | 'fading' | 'weak' | 'forgotten';
  }>
): 'improving' | 'declining' | 'stable' {
  if (subjectRetentionData.length === 0) return 'stable';
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
): Promise<{ guidedCount: number; totalProblemCount: number }> {
  const events = await db.query.sessionEvents.findMany({
    where: and(
      eq(sessionEvents.profileId, childProfileId),
      eq(sessionEvents.eventType, 'ai_response'),
      gte(sessionEvents.createdAt, startDate)
    ),
  });

  let guidedCount = 0;
  for (const event of events) {
    const meta = event.metadata as Record<string, unknown> | null;
    const rung =
      typeof meta?.escalationRung === 'number' ? meta.escalationRung : 0;
    if (rung >= 3) {
      guidedCount++;
    }
  }

  return { guidedCount, totalProblemCount: events.length };
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

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function subtractDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

function sumTopicsExplored(metrics: {
  subjects: Array<{ topicsExplored?: number }>;
}): number {
  return metrics.subjects.reduce(
    (sum, subject) => sum + (subject.topicsExplored ?? 0),
    0
  );
}

function buildProgressGuidance(
  childName: string,
  subjectNames: string[],
  sessionsThisWeek: number,
  previousSessions: number
): string | null {
  const primarySubject = subjectNames[0];

  if (sessionsThisWeek === 0 && primarySubject) {
    return `Quiet week — maybe suggest a quick session on ${primarySubject}?`;
  }

  if (sessionsThisWeek < previousSessions && primarySubject) {
    return `${childName} is still building knowledge. ${primarySubject} might be a good next nudge.`;
  }

  return null;
}

async function hasParentAccess(
  db: Database,
  parentProfileId: string,
  childProfileId: string
): Promise<boolean> {
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.parentProfileId, parentProfileId),
      eq(familyLinks.childProfileId, childProfileId)
    ),
  });

  return !!link;
}

async function buildChildProgressSummary(
  db: Database,
  childProfileId: string,
  childName: string,
  sessionsThisWeek: number,
  sessionsLastWeek: number,
  totalTimeThisWeekMinutes: number,
  subjectNames: string[]
): Promise<DashboardChild['progress']> {
  const latestSnapshot = await getLatestSnapshot(db, childProfileId);
  if (!latestSnapshot) {
    return null;
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
          sumTopicsExplored(currentMetrics) - sumTopicsExplored(previousMetrics)
        )
      : null,
    engagementTrend:
      sessionsThisWeek === 0
        ? 'quiet'
        : sessionsThisWeek > sessionsLastWeek
        ? 'growing'
        : 'steady',
    guidance: buildProgressGuidance(
      childName,
      subjectNames,
      sessionsThisWeek,
      sessionsLastWeek
    ),
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
      gte(learningSessions.startedAt, startOfLastWeek)
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
  const [progressResults, guidedMetricsResults] = await Promise.all([
    Promise.all(
      validLinks.map((l) => getOverallProgress(db, l.childProfileId))
    ),
    Promise.all(
      validLinks.map((l) =>
        countGuidedMetrics(db, l.childProfileId, startOfLastWeek)
      )
    ),
  ]);

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
    const childProfileId = validLinks[i]!.childProfileId;
    const profile = profilesById.get(childProfileId)!;
    const progress = progressResults[i]!;
    const guidedMetrics = guidedMetricsResults[i]!;
    const recentSessions = sessionsByProfile.get(childProfileId) ?? [];

    const sessionsThisWeek = recentSessions.filter(
      (s) => s.startedAt >= startOfThisWeek
    ).length;
    const sessionsLastWeek = recentSessions.filter(
      (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek
    ).length;

    // Prefer wall-clock time with active-time fallback for legacy sessions.
    const getDisplaySeconds = (session: {
      wallClockSeconds: number | null;
      durationSeconds: number | null;
    }): number => session.wallClockSeconds ?? session.durationSeconds ?? 0;

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
    };

    prepared.push({
      childProfileId,
      displayName: profile.displayName,
      sessionsThisWeek,
      sessionsLastWeek,
      totalTimeThisWeekMinutes: dashboardInput.totalTimeThisWeekMinutes,
      subjectNames: progress.subjects.map((subject) => subject.name),
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
        p.subjectNames
      )
    )
  );

  const children: DashboardChild[] = prepared.map((p, i) => {
    const summary = generateChildSummary(p.dashboardInput);
    const trend = calculateTrend(p.sessionsThisWeek, p.sessionsLastWeek);
    const retentionTrend = calculateRetentionTrend(
      p.dashboardInput.subjectRetentionData
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
      progress: progressSummaries[i]!,
    };
  });

  return children;
}

/**
 * Fetches detailed dashboard data for a single child, with parent access check.
 */
export async function getChildDetail(
  db: Database,
  parentProfileId: string,
  childProfileId: string
): Promise<DashboardChild | null> {
  // [EP15-I5] Throws ForbiddenError (→ 403) on access denial instead of
  // returning null. A null return here now means "parent has access but
  // the child was not present in the dashboard list" — a genuine not-found.
  await assertParentAccess(db, parentProfileId, childProfileId);

  const children = await getChildrenForParent(db, parentProfileId);
  return children.find((c) => c.profileId === childProfileId) ?? null;
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

  // Get curriculum for subject
  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
  });
  if (!curriculum) return [];

  // Get all topics in the curriculum
  const topics = await db.query.curriculumTopics.findMany({
    where: eq(curriculumTopics.curriculumId, curriculum.id),
  });

  // Get progress for each topic
  const results = await Promise.all(
    topics.map((t) => getTopicProgress(db, childProfileId, subjectId, t.id))
  );

  return results.filter((r): r is TopicProgress => r !== null);
}

// ---------------------------------------------------------------------------
// Child session list + transcript (parent trust feature)
// ---------------------------------------------------------------------------

export interface ChildSession {
  sessionId: string;
  subjectId: string;
  topicId: string | null;
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
}

export interface TranscriptExchange {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  escalationRung?: number;
}

export interface ChildSessionTranscript {
  session: {
    sessionId: string;
    subjectId: string;
    topicId: string | null;
    sessionType: string;
    startedAt: string;
    exchangeCount: number;
    displayTitle: string;
    displaySummary: string | null;
    homeworkSummary: HomeworkSummary | null;
  };
  exchanges: TranscriptExchange[];
}

/**
 * Lists recent sessions for a child, with parent access check.
 * Returns up to 50 most recent sessions ordered by startedAt descending.
 */
export async function getChildSessions(
  db: Database,
  parentProfileId: string,
  childProfileId: string
): Promise<ChildSession[]> {
  // [EP15-I5] ForbiddenError → 403. Empty array now means "parent has
  // access and the child has no sessions", not "access denied".
  await assertParentAccess(db, parentProfileId, childProfileId);

  const sessions = await db.query.learningSessions.findMany({
    where: eq(learningSessions.profileId, childProfileId),
    orderBy: desc(learningSessions.startedAt),
    limit: 50,
  });

  return sessions.map((s) => {
    const metadata = getSessionMetadata(s.metadata);
    const homeworkSummary = metadata.homeworkSummary ?? null;

    return {
      sessionId: s.id,
      subjectId: s.subjectId,
      topicId: s.topicId,
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
    };
  });
}

/**
 * Gets full transcript of a session, with parent access check.
 * Returns null when the session doesn't belong to the child or no link exists.
 */
export async function getChildSessionTranscript(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  sessionId: string
): Promise<ChildSessionTranscript | null> {
  // [EP15-I5] ForbiddenError → 403. null from here now means "access
  // granted but that session doesn't belong to this child" — 404-like.
  await assertParentAccess(db, parentProfileId, childProfileId);

  // Get session scoped to child
  const session = await db.query.learningSessions.findFirst({
    where: and(
      eq(learningSessions.id, sessionId),
      eq(learningSessions.profileId, childProfileId)
    ),
  });
  if (!session) return null;

  // Get message events ordered chronologically
  const events = await db.query.sessionEvents.findMany({
    where: and(
      eq(sessionEvents.sessionId, sessionId),
      inArray(sessionEvents.eventType, ['user_message', 'ai_response'])
    ),
    orderBy: sessionEvents.createdAt,
  });

  const exchanges: TranscriptExchange[] = events.map((e) => {
    const exchange: TranscriptExchange = {
      role: e.eventType === 'user_message' ? 'user' : 'assistant',
      content: e.content,
      timestamp: e.createdAt.toISOString(),
    };

    if (e.eventType === 'ai_response') {
      const meta = e.metadata as Record<string, unknown> | null;
      const rung =
        typeof meta?.escalationRung === 'number'
          ? meta.escalationRung
          : undefined;
      if (rung !== undefined) {
        exchange.escalationRung = rung;
      }
    }

    return exchange;
  });

  const metadata = getSessionMetadata(session.metadata);
  const homeworkSummary = metadata.homeworkSummary ?? null;

  return {
    session: {
      sessionId: session.id,
      subjectId: session.subjectId,
      topicId: session.topicId,
      sessionType: session.sessionType,
      startedAt: session.startedAt.toISOString(),
      exchangeCount: session.exchangeCount,
      displayTitle: formatSessionDisplayTitle(
        session.sessionType,
        homeworkSummary
      ),
      displaySummary: homeworkSummary?.summary ?? null,
      homeworkSummary,
    },
    exchanges,
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
