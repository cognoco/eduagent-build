import { and, desc, eq } from 'drizzle-orm';
import { monthlyReports, type Database } from '@eduagent/database';
import type {
  ConversationLanguage,
  MonthlyReportData,
  MonthlyReportRecord,
  MonthlyReportSummary,
  ProgressMetrics,
  ReportPracticeSummary,
} from '@eduagent/schemas';
import {
  monthlyReportDataSchema,
  monthlyReportRecordSchema,
  monthlyReportSummarySchema,
  SchemaDriftError,
} from '@eduagent/schemas';
import { assertParentAccess } from './family-access';
import { routeAndCall, type ChatMessage } from './llm';
import { extractFirstJsonObject } from './llm/extract-json';
import { createLogger } from './logger';
import { captureException } from './sentry';

const logger = createLogger();

function safeDelta(current: number, previous: number | undefined): number {
  return Math.max(0, current - (previous ?? 0));
}

// Coerce a JSONB-stored unknown value into a string[] safely. Mirrors the
// element-level guard used by generateReportHighlights when validating LLM
// output: bad rows produce an empty list rather than throwing on parse.
function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function subjectExploredTotal(metrics: ProgressMetrics): number {
  return metrics.subjects.reduce(
    (sum, subject) => sum + (subject.topicsExplored ?? 0),
    0,
  );
}

export function generateMonthlyReportData(
  childName: string,
  monthLabel: string,
  thisMonth: ProgressMetrics,
  lastMonth: ProgressMetrics | null,
  practiceSummary?: ReportPracticeSummary,
): MonthlyReportData {
  const topicsMasteredDelta = safeDelta(
    thisMonth.topicsMastered,
    lastMonth?.topicsMastered,
  );
  const topicsExploredDelta = safeDelta(
    subjectExploredTotal(thisMonth),
    lastMonth ? subjectExploredTotal(lastMonth) : undefined,
  );
  const vocabularyDelta = safeDelta(
    thisMonth.vocabularyTotal,
    lastMonth?.vocabularyTotal,
  );
  const activeMinutesDelta = safeDelta(
    thisMonth.totalActiveMinutes,
    lastMonth?.totalActiveMinutes,
  );
  const sessionsDelta = safeDelta(
    thisMonth.totalSessions,
    lastMonth?.totalSessions,
  );

  // [WI-922] The headline `value` is a per-month DELTA (e.g. vocabularyDelta).
  // The comparison copy must describe that SAME delta — pairing a delta value
  // with a prior CUMULATIVE total ("12 words / up from 340 last month") is
  // self-contradictory. We only have this month + last month here (not the
  // month-before-last), so a true delta-vs-delta comparison isn't computable;
  // the truthful, consistent basis is to restate the delta as "N new this
  // month". First-month copy (no previous month) is unchanged.
  const headlineMode =
    vocabularyDelta > topicsMasteredDelta
      ? {
          label: 'Words learned',
          value: vocabularyDelta,
          comparison: lastMonth
            ? `${vocabularyDelta} new this month`
            : 'in a first month',
        }
      : topicsExploredDelta > topicsMasteredDelta
        ? {
            label: 'Topics explored',
            value: topicsExploredDelta,
            comparison: lastMonth
              ? `${topicsExploredDelta} new this month`
              : 'in a first month',
          }
        : {
            label: 'Topics mastered',
            value: topicsMasteredDelta,
            comparison: lastMonth
              ? `${topicsMasteredDelta} new this month`
              : 'in a first month',
          };

  return monthlyReportDataSchema.parse({
    childName,
    month: monthLabel,
    // [EP15-I2 AR-6] `thisMonth` previously stored per-month *deltas* while
    // `lastMonth` stored *cumulative totals* under the same schema key —
    // a split-personality field that made apples-to-apples comparison
    // impossible without reading the generator source. Both now store
    // cumulative end-of-month values; the headline stat (below) is where
    // deltas live, which is semantically correct because "words learned
    // this month" IS a delta.
    thisMonth: {
      totalSessions: sessionsDelta,
      totalActiveMinutes: activeMinutesDelta,
      topicsMastered: topicsMasteredDelta,
      topicsExplored: topicsExploredDelta,
      vocabularyTotal: thisMonth.vocabularyTotal,
      streakBest: thisMonth.longestStreak,
    },
    lastMonth: lastMonth
      ? {
          totalSessions: lastMonth.totalSessions,
          totalActiveMinutes: lastMonth.totalActiveMinutes,
          topicsMastered: lastMonth.topicsMastered,
          topicsExplored: subjectExploredTotal(lastMonth),
          vocabularyTotal: lastMonth.vocabularyTotal,
          streakBest: lastMonth.longestStreak,
        }
      : null,
    highlights: [],
    nextSteps: [],
    subjects: thisMonth.subjects.map((subject) => {
      const previousSubject = lastMonth?.subjects.find(
        (candidate) => candidate.subjectId === subject.subjectId,
      );
      const activeDeltaForSubject = safeDelta(
        subject.activeMinutes,
        previousSubject?.activeMinutes,
      );

      return {
        subjectName: subject.subjectName,
        topicsMastered: safeDelta(
          subject.topicsMastered,
          previousSubject?.topicsMastered,
        ),
        topicsAttempted: safeDelta(
          subject.topicsAttempted,
          previousSubject?.topicsAttempted,
        ),
        topicsExplored: safeDelta(
          subject.topicsExplored ?? 0,
          previousSubject?.topicsExplored,
        ),
        // [EP15-I2] Cumulative end-of-month total for this subject,
        // matching the new `vocabularyTotal` contract. The per-month
        // vocabulary change can still be computed at render time as
        // `subject.vocabularyTotal - previousSubject?.vocabularyTotal`
        // if a delta view is needed.
        vocabularyTotal: subject.vocabularyTotal,
        activeMinutes: activeDeltaForSubject,
        trend:
          activeDeltaForSubject > 0
            ? 'growing'
            : activeDeltaForSubject === 0
              ? 'stable'
              : 'declining',
      };
    }),
    headlineStat: headlineMode,
    ...(practiceSummary ? { practiceSummary } : {}),
  });
}

export async function generateReportHighlights(
  reportData: MonthlyReportData,
  // i18n Phase 1 — learner-prose threading. Optional so existing callers
  // compile; callers should load profile.conversation_language and pass it.
  options?: { conversationLanguage?: ConversationLanguage },
): Promise<{
  highlights: string[];
  nextSteps: string[];
  comparison: string | null;
}> {
  // Zero-activity guard: when no new sessions were recorded this month there
  // is no evidence for the LLM to ground its highlights in. Calling the LLM
  // anyway causes it to fabricate "specific highlights" from nothing.
  // The existing `fallback` only fires on LLM ERROR — this guard closes the
  // gap where the fallback never fires because the call succeeds but the
  // output is hallucinated. Return a factual no-activity message instead.
  if (reportData.thisMonth.totalSessions === 0) {
    return {
      highlights: ['No learning sessions recorded this month.'],
      nextSteps: [],
      comparison: null,
    };
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'Write a warm monthly learning update for a parent. Respond as JSON with keys "highlights", "nextSteps", and "equivalent". Keep highlights specific, next steps supportive, and equivalent tangible.',
    },
    {
      role: 'user',
      // [SEC] Do NOT pass real child PII (name) to the external LLM. The
      // prompt must read identically regardless of which child it concerns;
      // `reportData.childName` remains available for client-side render.
      content: JSON.stringify({
        childName: 'the learner',
        month: reportData.month,
        thisMonth: reportData.thisMonth,
        lastMonth: reportData.lastMonth,
        subjects: reportData.subjects,
      }),
    },
  ];

  const fallback = {
    highlights: ['Great progress this month!'],
    nextSteps: [],
    comparison: null,
  };

  try {
    const result = await routeAndCall(messages, 1, {
      flow: 'monthly.report',
      conversationLanguage: options?.conversationLanguage,
    });
    // [SEC/BUG] Use the canonical brace-depth extractor instead of a raw
    // JSON.parse so leading/trailing prose from the model does not throw.
    const jsonStr = extractFirstJsonObject(result.response);
    if (jsonStr === null) {
      logger.warn(
        'generateReportHighlights: no JSON object found in LLM response',
        {
          // The prompt no longer contains a real name, so a truncated
          // response preview is PII-safe to log.
          responsePreview: result.response.slice(0, 200),
        },
      );
      return fallback;
    }

    const parsed = JSON.parse(jsonStr) as {
      equivalent?: unknown;
      highlights?: unknown;
      nextSteps?: unknown;
    };

    return {
      highlights: Array.isArray(parsed.highlights)
        ? parsed.highlights
            .filter((value): value is string => typeof value === 'string')
            .slice(0, 3)
        : ['Great progress this month!'],
      nextSteps: Array.isArray(parsed.nextSteps)
        ? parsed.nextSteps
            .filter((value): value is string => typeof value === 'string')
            .slice(0, 2)
        : [],
      comparison:
        typeof parsed.equivalent === 'string' ? parsed.equivalent : null,
    };
  } catch (error) {
    // AGENTS.md "Silent recovery without escalation is banned" — escalate
    // to Sentry AND structured logs so this fallback is observable.
    logger.error('generateReportHighlights: LLM call or parse failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    captureException(error, {
      tags: { surface: 'monthly_report' },
      extra: { context: 'monthly-report-highlights' },
    });
    return fallback;
  }
}

// [CCR PR #215] Previously returned `null` on safeParse failure, which the
// route conflated with "missing row" → 404 with no Sentry capture. Now:
//   - Row missing:           caller passes null upstream → 404 (no Sentry).
//   - Row exists but invalid: captureException + throw SchemaDriftError → 500.
// Schema drift is a server fault, not a client-visible "not found".
function mapMonthlyReportRow(
  row: typeof monthlyReports.$inferSelect,
): MonthlyReportRecord {
  const result = monthlyReportRecordSchema.safeParse({
    id: row.id,
    profileId: row.profileId,
    childProfileId: row.childProfileId,
    reportMonth: row.reportMonth,
    reportData: row.reportData,
    viewedAt: row.viewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  });
  if (!result.success) {
    logger.warn('mapMonthlyReportRow: schema validation failed', {
      reportId: row.id,
      profileId: row.profileId,
      error: result.error.message,
    });
    captureException(result.error, {
      profileId: row.profileId,
      extra: {
        context: 'mapMonthlyReportRow',
        reportId: row.id,
        childProfileId: row.childProfileId,
        issues: result.error.issues,
      },
    });
    throw new SchemaDriftError('MonthlyReport', result.error.issues);
  }
  return result.data;
}

function getMonthlyReportData(row: typeof monthlyReports.$inferSelect): {
  headlineStat: MonthlyReportData['headlineStat'];
  highlights: string[];
  nextSteps: string[];
  thisMonth: MonthlyReportData['thisMonth'] | undefined;
  practiceSummary: ReportPracticeSummary | undefined;
} {
  const reportData = row.reportData as Partial<MonthlyReportData>;
  return {
    headlineStat: reportData.headlineStat ?? {
      label: 'Progress',
      value: 0,
      comparison: '',
    },
    highlights: coerceStringArray(reportData.highlights).slice(0, 3),
    nextSteps: coerceStringArray(reportData.nextSteps).slice(0, 2),
    thisMonth: reportData.thisMonth,
    practiceSummary: reportData.practiceSummary,
  };
}

function mapMonthlyReportSummary(
  row: typeof monthlyReports.$inferSelect,
): MonthlyReportSummary {
  const reportData = getMonthlyReportData(row);
  return monthlyReportSummarySchema.parse({
    id: row.id,
    reportMonth: row.reportMonth,
    viewedAt: row.viewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    headlineStat: reportData.headlineStat,
    highlights: reportData.highlights,
    nextSteps: reportData.nextSteps,
    ...(reportData.thisMonth ? { thisMonth: reportData.thisMonth } : {}),
    ...(reportData.practiceSummary
      ? { practiceSummary: reportData.practiceSummary }
      : {}),
  });
}

export async function listMonthlyReportsForParentChild(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  opts?: { identityV2Enabled?: boolean },
): Promise<MonthlyReportSummary[]> {
  await assertParentAccess(db, parentProfileId, childProfileId, opts);
  const rows = await db.query.monthlyReports.findMany({
    where: and(
      eq(monthlyReports.profileId, parentProfileId),
      eq(monthlyReports.childProfileId, childProfileId),
    ),
    orderBy: desc(monthlyReports.reportMonth),
  });

  return rows.map(mapMonthlyReportSummary);
}

export async function listMonthlyReportsForProfile(
  db: Database,
  profileId: string,
): Promise<MonthlyReportSummary[]> {
  const rows = await db.query.monthlyReports.findMany({
    where: eq(monthlyReports.childProfileId, profileId),
    orderBy: desc(monthlyReports.reportMonth),
  });

  return rows.map(mapMonthlyReportSummary);
}

export async function getMonthlyReportForProfile(
  db: Database,
  profileId: string,
  reportId: string,
): Promise<MonthlyReportRecord | null> {
  const row = await db.query.monthlyReports.findFirst({
    where: and(
      eq(monthlyReports.id, reportId),
      eq(monthlyReports.childProfileId, profileId),
    ),
  });

  return row ? mapMonthlyReportRow(row) : null;
}

export async function getMonthlyReportForParentChild(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  reportId: string,
  opts?: { identityV2Enabled?: boolean },
): Promise<MonthlyReportRecord | null> {
  await assertParentAccess(db, parentProfileId, childProfileId, opts);
  const row = await db.query.monthlyReports.findFirst({
    where: and(
      eq(monthlyReports.id, reportId),
      eq(monthlyReports.profileId, parentProfileId),
      eq(monthlyReports.childProfileId, childProfileId),
    ),
  });

  return row ? mapMonthlyReportRow(row) : null;
}

export async function markMonthlyReportViewed(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  reportId: string,
  opts?: { identityV2Enabled?: boolean },
): Promise<void> {
  await assertParentAccess(db, parentProfileId, childProfileId, opts);
  await db
    .update(monthlyReports)
    .set({ viewedAt: new Date() })
    .where(
      and(
        eq(monthlyReports.id, reportId),
        eq(monthlyReports.profileId, parentProfileId),
        eq(monthlyReports.childProfileId, childProfileId),
      ),
    );
}

// [LEARN-29] Self-view mark-viewed: the learner marks their OWN monthly report
// read. Scoped on childProfileId = the active profile (the subject of the
// report), mirroring getMonthlyReportForProfile — so a guessed/foreign reportId
// updates nothing. Returns whether a row matched so the route can answer 404
// instead of silently 404ing the client (the previous behaviour: the self
// route did not exist at all, so every open POSTed into the void).
export async function markMonthlyReportViewedForProfile(
  db: Database,
  profileId: string,
  reportId: string,
): Promise<boolean> {
  const updated = await db
    .update(monthlyReports)
    .set({ viewedAt: new Date() })
    .where(
      and(
        eq(monthlyReports.id, reportId),
        eq(monthlyReports.childProfileId, profileId),
      ),
    )
    .returning({ id: monthlyReports.id });
  return updated.length > 0;
}
