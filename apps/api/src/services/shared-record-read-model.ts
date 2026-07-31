import { and, desc, eq, isNotNull } from 'drizzle-orm';
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
  opts: {
    context:
      | 'projectSharedRecordForSupportee'
      | 'projectSharedArtifactForSupportee';
    invalidRow: 'skip' | 'throw';
  },
): CandidateReportFact | null {
  const parsed = weeklyReportDataSchema.safeParse(row.reportData);
  if (!parsed.success) {
    // [WI-2232 P2] Capture BEFORE the mode branch. The list path skips the row
    // so one drifted report cannot take the whole Journal down, but skipping is
    // not the same as silence: the failure is always reported to Sentry, and the
    // caller counts the skips so the response can surface them to the user.
    captureException(parsed.error, {
      profileId: row.profileId,
      extra: {
        context: opts.context,
        reportId: row.id,
        childProfileId: row.childProfileId,
        issues: parsed.error.issues,
      },
    });
    if (opts.invalidRow === 'skip') return null;
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
): CandidateReportFact | null {
  if (row.learnerRecap === null) return null;

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
  const supporteeRepo = createScopedRepository(db, input.supporteePersonId);
  const supporterRepo = createScopedRepository(db, input.supporterPersonId);

  const [
    supportee,
    selfOwnedRows,
    supporterOwnedRows,
    recapRows,
    milestoneRows,
  ] = await Promise.all([
    db.query.person.findFirst({
      where: eq(person.id, input.supporteePersonId),
      columns: { displayName: true },
    }),
    // Shape A — the learner's own weekly report (weekly-self-reports.ts writes
    // profileId === childProfileId === the learner).
    supporteeRepo.weeklyReports.findMany(
      eq(weeklyReports.childProfileId, input.supporteePersonId),
    ),
    // Shape B — the digest delivered to this supporter (weekly-digest.ts writes
    // profileId = the supporter, childProfileId = the supportee). Only these two
    // owners are authorized: childProfileId pins the row to this supportee, and
    // the scoped profileId keeps a third party's digest about the same supportee
    // out of this supporter's Journal.
    supporterRepo.weeklyReports.findMany(
      eq(weeklyReports.childProfileId, input.supporteePersonId),
    ),
    supporteeRepo.sessionSummaries.findMany(
      and(
        eq(sessionSummaries.status, 'accepted'),
        isNotNull(sessionSummaries.learnerRecap),
      ),
    ),
    supporteeRepo.milestones.findMany(undefined, desc(milestones.createdAt)),
  ]);

  // Dedupe strictly by report identity — never by week. Two distinct rows may
  // legitimately describe the same week, and choosing a winner between them is a
  // product decision that has not been ruled; both stay visible.
  const weeklyRows = [
    ...new Map(
      [...selfOwnedRows, ...supporterOwnedRows].map((row) => [row.id, row]),
    ).values(),
  ].sort(
    (a, b) =>
      b.reportWeek.localeCompare(a.reportWeek) || a.id.localeCompare(b.id),
  );

  let unavailableFactCount = 0;
  const weeklyFacts = weeklyRows.flatMap((row) => {
    const fact = projectWeeklyReportFact(row, {
      context: 'projectSharedRecordForSupportee',
      invalidRow: 'skip',
    });
    if (!fact) {
      unavailableFactCount += 1;
      return [];
    }
    return [fact];
  });

  const recapFacts: CandidateReportFact[] = recapRows.flatMap((row) => {
    const fact = projectSessionRecapFact(row);
    return fact ? [fact] : [];
  });

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
      unavailableFactCount,
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
  const supporteeRepo = createScopedRepository(db, input.supporteePersonId);
  const supporterRepo = createScopedRepository(db, input.supporterPersonId);

  // The exact link must resolve through the same two authorized ownership shapes
  // the list reads. weeklyReports.id is the primary key, so at most one of these
  // lookups can match — there is no precedence question on this path.
  const findAuthorizedWeeklyReport = async () => {
    const artifactWhere = and(
      eq(weeklyReports.id, input.artifactId),
      eq(weeklyReports.childProfileId, input.supporteePersonId),
    );
    return (
      (await supporteeRepo.weeklyReports.findFirst(artifactWhere)) ??
      (await supporterRepo.weeklyReports.findFirst(artifactWhere)) ??
      null
    );
  };

  const [supportee, fact] = await Promise.all([
    db.query.person.findFirst({
      where: eq(person.id, input.supporteePersonId),
      columns: { displayName: true },
    }),
    input.artifactKind === 'weekly_report'
      ? findAuthorizedWeeklyReport().then((row) =>
          row
            ? projectWeeklyReportFact(row, {
                context: 'projectSharedArtifactForSupportee',
                invalidRow: 'throw',
              })
            : null,
        )
      : supporteeRepo.sessionSummaries
          .findFirst(
            and(
              eq(sessionSummaries.sessionId, input.artifactId),
              eq(sessionSummaries.status, 'accepted'),
              isNotNull(sessionSummaries.learnerRecap),
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
