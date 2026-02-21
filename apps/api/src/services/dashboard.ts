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
  curricula,
  curriculumTopics,
  type Database,
} from '@eduagent/database';
import type { DashboardChild, TopicProgress } from '@eduagent/schemas';
import { getOverallProgress, getTopicProgress } from './progress';

export interface DashboardInput {
  childProfileId: string;
  displayName: string;
  sessionsThisWeek: number;
  sessionsLastWeek: number;
  totalTimeThisWeekMinutes: number;
  totalTimeLastWeekMinutes: number;
  subjectRetentionData: Array<{
    name: string;
    status: 'strong' | 'fading' | 'weak';
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
  subjectRetentionData: Array<{ status: 'strong' | 'fading' | 'weak' }>
): 'improving' | 'declining' | 'stable' {
  if (subjectRetentionData.length === 0) return 'stable';
  const strongCount = subjectRetentionData.filter(
    (s) => s.status === 'strong'
  ).length;
  const weakCount = subjectRetentionData.filter(
    (s) => s.status === 'weak' || s.status === 'fading'
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

  const children: DashboardChild[] = [];

  for (const link of links) {
    const childProfileId = link.childProfileId;

    // 2. Get child's display name
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.id, childProfileId),
    });
    if (!profile) continue;

    // 3. Get subject progress (includes retention status per subject)
    const progress = await getOverallProgress(db, childProfileId);

    // 4. Count sessions this week and last week
    const now = new Date();
    const startOfThisWeek = getStartOfWeek(now);
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const recentSessions = await db.query.learningSessions.findMany({
      where: and(
        eq(learningSessions.profileId, childProfileId),
        gte(learningSessions.startedAt, startOfLastWeek)
      ),
    });

    const sessionsThisWeek = recentSessions.filter(
      (s) => s.startedAt >= startOfThisWeek
    ).length;
    const sessionsLastWeek = recentSessions.filter(
      (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek
    ).length;

    // 5. Sum duration for time tracking (seconds -> minutes)
    const totalTimeThisWeek = recentSessions
      .filter((s) => s.startedAt >= startOfThisWeek)
      .reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
    const totalTimeLastWeek = recentSessions
      .filter(
        (s) => s.startedAt >= startOfLastWeek && s.startedAt < startOfThisWeek
      )
      .reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);

    // 6. Count guided metrics from session events
    const guidedMetrics = await countGuidedMetrics(
      db,
      childProfileId,
      startOfLastWeek
    );

    // 7. Build DashboardInput for summary generation
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
      subjectRetentionData,
      guidedCount: guidedMetrics.guidedCount,
      totalProblemCount: guidedMetrics.totalProblemCount,
    };

    const summary = generateChildSummary(dashboardInput);
    const trend = calculateTrend(sessionsThisWeek, sessionsLastWeek);
    const retentionTrend = calculateRetentionTrend(subjectRetentionData);

    children.push({
      profileId: childProfileId,
      displayName: profile.displayName,
      summary,
      sessionsThisWeek,
      sessionsLastWeek,
      totalTimeThisWeek: dashboardInput.totalTimeThisWeekMinutes,
      totalTimeLastWeek: dashboardInput.totalTimeLastWeekMinutes,
      trend,
      subjects: subjectRetentionData.map((s) => ({
        name: s.name,
        retentionStatus: s.status,
      })),
      guidedVsImmediateRatio: calculateGuidedRatio(
        guidedMetrics.guidedCount,
        guidedMetrics.totalProblemCount
      ),
      retentionTrend,
    });
  }

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
  // Verify parent-child relationship
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.parentProfileId, parentProfileId),
      eq(familyLinks.childProfileId, childProfileId)
    ),
  });
  if (!link) return null;

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
  // Verify parent-child relationship
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.parentProfileId, parentProfileId),
      eq(familyLinks.childProfileId, childProfileId)
    ),
  });
  if (!link) return [];

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
  // Verify parent-child relationship
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.parentProfileId, parentProfileId),
      eq(familyLinks.childProfileId, childProfileId)
    ),
  });
  if (!link) return [];

  const sessions = await db.query.learningSessions.findMany({
    where: eq(learningSessions.profileId, childProfileId),
    orderBy: desc(learningSessions.startedAt),
    limit: 50,
  });

  return sessions.map((s) => ({
    sessionId: s.id,
    subjectId: s.subjectId,
    topicId: s.topicId,
    sessionType: s.sessionType,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
    exchangeCount: s.exchangeCount,
    escalationRung: s.escalationRung,
    durationSeconds: s.durationSeconds,
  }));
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
  // Verify parent-child relationship
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.parentProfileId, parentProfileId),
      eq(familyLinks.childProfileId, childProfileId)
    ),
  });
  if (!link) return null;

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

  return {
    session: {
      sessionId: session.id,
      subjectId: session.subjectId,
      topicId: session.topicId,
      sessionType: session.sessionType,
      startedAt: session.startedAt.toISOString(),
      exchangeCount: session.exchangeCount,
    },
    exchanges,
  };
}
