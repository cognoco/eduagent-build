import { and, desc, eq } from 'drizzle-orm';
import {
  createScopedRepository,
  milestones,
  sessionSummaries,
  weeklyReports,
  person,
  type Database,
} from '@eduagent/database';
import {
  SchemaDriftError,
  sharedRecordSchema,
  weeklyReportDataSchema,
  type SharedRecord,
  type SharedRecordArtifactKind,
} from '@eduagent/schemas';

import { NotFoundError } from '../errors';
import { findAcceptedContractForSupportee } from './linking-ceremony';
import { projectSharedRecord } from './shared-record';
import type { CandidateReportFact } from './reportability';
import { captureException } from './sentry';

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

function projectWeeklyReportFact(
  row: typeof weeklyReports.$inferSelect,
  invalidRow: 'skip' | 'throw' = 'skip',
): CandidateReportFact | null {
  const parsed = weeklyReportDataSchema.safeParse(row.reportData);
  if (!parsed.success) {
    if (invalidRow === 'skip') return null;
    captureException(parsed.error, {
      profileId: row.profileId,
      extra: {
        context: 'projectSharedArtifactForSupportee',
        reportId: row.id,
        childProfileId: row.childProfileId,
        issues: parsed.error.issues,
      },
    });
    throw new SchemaDriftError('WeeklyReport', parsed.error.issues);
  }
  const stat = parsed.data.headlineStat;
  const metricKey =
    WEEKLY_METRIC_KEY_BY_LABEL[
      stat.label as keyof typeof WEEKLY_METRIC_KEY_BY_LABEL
    ];
  return {
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
    artifact: {
      kind: 'weekly_report',
      id: row.id,
    },
    metadata: metricKey
      ? {
          templateKey: 'weeklyReport',
          reportWeek: row.reportWeek,
          stats: [{ metricKey, value: stat.value }],
        }
      : undefined,
  };
}

function projectSessionRecapFact(
  row: typeof sessionSummaries.$inferSelect,
): CandidateReportFact {
  return {
    id: `recap:${row.sessionId}`,
    kind: 'effort',
    title: 'Session recap ready',
    detail: 'A shareable learning recap was produced.',
    occurredAt: row.createdAt.toISOString(),
    source: 'session_recap_presence',
    artifact: {
      kind: 'session_recap',
      id: row.sessionId,
    },
    metadata: {
      templateKey: 'sessionRecap',
      sessionDate: row.createdAt.toISOString(),
    },
  };
}

async function projectSharedRecordForSupportee(
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

  const weeklyFacts = weeklyRows.flatMap((row) => {
    const fact = projectWeeklyReportFact(row);
    return fact ? [fact] : [];
  });

  const recapFacts: CandidateReportFact[] = recapRows
    .slice(0, 5)
    .map(projectSessionRecapFact);

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

async function projectSharedArtifactForSupportee(
  db: Database,
  input: {
    supportershipId: string;
    supporterPersonId: string;
    supporteePersonId: string;
    artifactKind: SharedRecordArtifactKind;
    artifactId: string;
  },
): Promise<SharedRecord> {
  const supporterRepo = createScopedRepository(db, input.supporterPersonId);
  const supporteeRepo = createScopedRepository(db, input.supporteePersonId);

  const [supportee, fact] = await Promise.all([
    db.query.person.findFirst({
      where: eq(person.id, input.supporteePersonId),
      columns: { displayName: true },
    }),
    input.artifactKind === 'weekly_report'
      ? supporterRepo.weeklyReports
          .findFirst(
            and(
              eq(weeklyReports.id, input.artifactId),
              eq(weeklyReports.childProfileId, input.supporteePersonId),
            ),
          )
          .then((row) => (row ? projectWeeklyReportFact(row, 'throw') : null))
      : supporteeRepo.sessionSummaries
          .findFirst(
            and(
              eq(sessionSummaries.sessionId, input.artifactId),
              eq(sessionSummaries.status, 'accepted'),
            ),
          )
          .then((row) => (row ? projectSessionRecapFact(row) : null)),
  ]);

  if (!fact) {
    throw new NotFoundError('Journal artifact');
  }

  return sharedRecordSchema.parse(
    projectSharedRecord({
      supportershipId: input.supportershipId,
      supporteeDisplayName: supportee?.displayName,
      facts: [fact],
    }),
  );
}

export async function readSharedRecordForSupportee(
  db: Database,
  input: {
    supporterPersonId: string;
    supporteePersonId: string;
  },
): Promise<SharedRecord> {
  return db.transaction(
    async (tx) => {
      const txDb = tx as unknown as Database;
      const contract = await findAcceptedContractForSupportee(txDb, input);
      return projectSharedRecordForSupportee(txDb, {
        ...input,
        supportershipId: contract.supportershipId,
      });
    },
    { isolationLevel: 'repeatable read' },
  );
}

export async function readSharedArtifactForSupportee(
  db: Database,
  input: {
    supporterPersonId: string;
    supporteePersonId: string;
    artifactKind: SharedRecordArtifactKind;
    artifactId: string;
  },
): Promise<SharedRecord> {
  return db.transaction(
    async (tx) => {
      const txDb = tx as unknown as Database;
      const contract = await findAcceptedContractForSupportee(txDb, input);
      return projectSharedArtifactForSupportee(txDb, {
        ...input,
        supportershipId: contract.supportershipId,
      });
    },
    { isolationLevel: 'repeatable read' },
  );
}
