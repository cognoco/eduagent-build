import { desc, eq } from 'drizzle-orm';
import {
  createScopedRepository,
  milestones,
  sessionSummaries,
  weeklyReports,
  person,
  type Database,
} from '@eduagent/database';
import {
  sharedRecordSchema,
  weeklyReportDataSchema,
  type SharedRecord,
} from '@eduagent/schemas';

import { projectSharedRecord } from './shared-record';
import type { CandidateReportFact } from './reportability';

function compactFactParts(parts: Array<string | number | null | undefined>) {
  return parts
    .filter(
      (part): part is string | number => part !== null && part !== undefined,
    )
    .join(' ');
}

const WEEKLY_METRIC_KEY_BY_LABEL = {
  'Topics mastered': 'topicsMastered',
  'Words learned': 'wordsLearned',
  'Topics explored': 'topicsExplored',
} as const;

function metadataString(metadata: unknown, key: string): string | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const value = (metadata as Record<string, unknown>)[key];
  const trimmed = typeof value === 'string' ? value.trim() : undefined;
  return trimmed || undefined;
}

export async function readSharedRecordForSupportee(
  db: Database,
  input: {
    supportershipId: string;
    supporterPersonId: string;
    supporteePersonId: string;
  },
): Promise<SharedRecord> {
  const supporterRepo = createScopedRepository(db, input.supporterPersonId);
  const supporteeRepo = createScopedRepository(db, input.supporteePersonId);

  const [supportee, weeklyRows, recapRows, milestoneRows] = await Promise.all([
    db.query.person.findFirst({
      where: eq(person.id, input.supporteePersonId),
      columns: { displayName: true },
    }),
    supporterRepo.weeklyReports.findMany(
      eq(weeklyReports.childProfileId, input.supporteePersonId),
      { limit: 3 },
    ),
    supporteeRepo.sessionSummaries.findMany(
      eq(sessionSummaries.status, 'accepted'),
    ),
    supporteeRepo.milestones.findMany(undefined, desc(milestones.createdAt)),
  ]);

  const weeklyFacts: CandidateReportFact[] = weeklyRows.flatMap((row) => {
    const parsed = weeklyReportDataSchema.safeParse(row.reportData);
    if (!parsed.success) return [];
    const stat = parsed.data.headlineStat;
    const metricKey =
      WEEKLY_METRIC_KEY_BY_LABEL[
        stat.label as keyof typeof WEEKLY_METRIC_KEY_BY_LABEL
      ];
    return [
      {
        id: `weekly-report:${row.id}`,
        kind: 'observable_engagement',
        title: compactFactParts([
          'Weekly report',
          row.reportWeek,
          `${stat.label}:`,
          stat.value,
        ]),
        detail: stat.comparison,
        occurredAt: row.createdAt.toISOString(),
        source: 'weekly_report_summary',
        metadata: metricKey
          ? {
              templateKey: 'weeklyReport',
              reportWeek: row.reportWeek,
              stats: [{ metricKey, value: stat.value }],
            }
          : undefined,
      },
    ];
  });

  const recapFacts: CandidateReportFact[] = recapRows
    .slice(0, 5)
    .map((row) => ({
      id: `recap:${row.sessionId}`,
      kind: 'effort',
      title: 'Session recap ready',
      detail: 'A shareable learning recap was produced.',
      occurredAt: row.createdAt.toISOString(),
      source: 'session_recap_presence',
      metadata: {
        templateKey: 'sessionRecap',
        sessionDate: row.createdAt.toISOString(),
      },
    }));

  const milestoneFacts: CandidateReportFact[] = milestoneRows
    .slice(0, 5)
    .map((row) => {
      const subjectName = metadataString(row.metadata, 'subjectName');
      return {
        id: `milestone:${row.id}`,
        kind: 'mastery' as const,
        title: compactFactParts([
          'Milestone reached:',
          row.milestoneType.replaceAll('_', ' '),
        ]),
        detail: compactFactParts(['Threshold', row.threshold]),
        occurredAt: row.createdAt.toISOString(),
        source: 'milestone',
        metadata: {
          templateKey: 'milestone',
          milestoneType: row.milestoneType,
          threshold: row.threshold,
          ...(subjectName ? { subjectName } : {}),
        },
      };
    });

  return sharedRecordSchema.parse(
    projectSharedRecord({
      supportershipId: input.supportershipId,
      supporteeDisplayName: supportee?.displayName,
      facts: [...weeklyFacts, ...recapFacts, ...milestoneFacts],
    }),
  );
}
