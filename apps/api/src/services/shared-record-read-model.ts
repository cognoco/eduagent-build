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
    }));

  const milestoneFacts: CandidateReportFact[] = milestoneRows
    .slice(0, 5)
    .map((row) => ({
      id: `milestone:${row.id}`,
      kind: 'mastery',
      title: compactFactParts([
        'Milestone reached:',
        row.milestoneType.replaceAll('_', ' '),
      ]),
      detail: compactFactParts(['Threshold', row.threshold]),
      occurredAt: row.createdAt.toISOString(),
      source: 'milestone',
    }));

  return sharedRecordSchema.parse(
    projectSharedRecord({
      supportershipId: input.supportershipId,
      supporteeDisplayName: supportee?.displayName,
      facts: [...weeklyFacts, ...recapFacts, ...milestoneFacts],
    }),
  );
}
