import type { Database } from '@eduagent/database';
import type { WeeklyReportData } from '@eduagent/schemas';

import {
  readSharedArtifactForSupportee,
  readSharedRecordForSupportee,
} from './shared-record-read-model';

const UUID = {
  supporter: '00000000-0000-4000-8000-000000000001',
  supportee: '00000000-0000-4000-8000-000000000002',
  supportership: '00000000-0000-4000-8000-000000000003',
  weeklyReport: '00000000-0000-4000-8000-000000000004',
  olderWeeklyReport: '00000000-0000-4000-8000-000000000009',
  session: '00000000-0000-4000-8000-000000000005',
  olderSession: '00000000-0000-4000-8000-000000000010',
  summary: '00000000-0000-4000-8000-000000000006',
  milestone: '00000000-0000-4000-8000-000000000007',
} as const;

const weeklyReportData: WeeklyReportData = {
  childName: 'Emma',
  weekStart: '2026-06-22',
  thisWeek: {
    totalSessions: 2,
    totalActiveMinutes: 30,
    topicsMastered: 1,
    topicsExplored: 3,
    vocabularyTotal: 10,
    streakBest: 4,
  },
  lastWeek: null,
  headlineStat: {
    label: 'Topics explored',
    value: 3,
    comparison: 'in a first week',
  },
};

function createDb(authorized = true): Database {
  const authChain = {
    from: jest.fn(),
    innerJoin: jest.fn(),
    where: jest.fn(),
    limit: jest.fn().mockResolvedValue(
      authorized
        ? [
            {
              support_visibility_contracts: {
                id: '00000000-0000-4000-8000-000000000008',
                supportershipId: UUID.supportership,
                supporterPersonId: UUID.supporter,
                supporteePersonId: UUID.supportee,
                relation: 'other',
                status: 'accepted',
                contractVersion: 1,
                reportableKinds: ['mastery', 'effort', 'observable_engagement'],
                artifactWall: true,
                renderEquivalence: true,
                safetyException: true,
                supporterAcceptedAt: new Date('2026-06-20T12:00:00.000Z'),
                supporteeAcceptedAt: new Date('2026-06-20T12:00:00.000Z'),
                createdAt: new Date('2026-06-20T12:00:00.000Z'),
                updatedAt: new Date('2026-06-20T12:00:00.000Z'),
              },
            },
          ]
        : [],
    ),
  };
  authChain.from.mockReturnValue(authChain);
  authChain.innerJoin.mockReturnValue(authChain);
  authChain.where.mockReturnValue(authChain);

  const db = {
    select: jest.fn().mockReturnValue(authChain),
    query: {
      person: {
        findFirst: jest.fn().mockResolvedValue({ displayName: 'Emma' }),
      },
      weeklyReports: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([
          {
            id: UUID.weeklyReport,
            profileId: UUID.supporter,
            childProfileId: UUID.supportee,
            reportWeek: '2026-06-22',
            reportData: weeklyReportData,
            viewedAt: null,
            createdAt: new Date('2026-06-29T12:00:00.000Z'),
          },
        ]),
      },
      sessionSummaries: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([
          {
            id: UUID.summary,
            sessionId: UUID.session,
            profileId: UUID.supportee,
            topicId: null,
            content: 'raw learner-facing summary',
            aiFeedback: 'raw AI feedback',
            highlight: 'raw highlight should not leak',
            narrative: 'raw parent-facing recap prose should not leak',
            conversationPrompt: 'raw prompt should not leak',
            engagementSignal: 'curious',
            closingLine: null,
            learnerRecap: null,
            nextTopicId: null,
            nextTopicReason: null,
            status: 'accepted',
            createdAt: new Date('2026-06-28T12:00:00.000Z'),
            updatedAt: new Date('2026-06-28T12:00:00.000Z'),
            llmSummary: null,
            summaryGeneratedAt: null,
            purgedAt: null,
          },
        ]),
      },
      milestones: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: UUID.milestone,
            profileId: UUID.supportee,
            milestoneType: 'session_count',
            threshold: 3,
            subjectId: null,
            bookId: null,
            metadata: { subjectName: 'Physics' },
            celebratedAt: null,
            createdAt: new Date('2026-06-27T12:00:00.000Z'),
          },
        ]),
      },
    },
  } as unknown as Database;
  Object.assign(db, {
    transaction: jest.fn(
      async (
        callback: (tx: Database) => Promise<unknown>,
        _config: { isolationLevel: string },
      ) => callback(db),
    ),
  });
  return db;
}

describe('readSharedRecordForSupportee', () => {
  it('projects real report, recap, and milestone facts without raw artifacts', async () => {
    const db = createDb();
    const record = await readSharedRecordForSupportee(db, {
      supporterPersonId: UUID.supporter,
      supporteePersonId: UUID.supportee,
    });

    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
    expect(record.supporterView.headline).toBe('Emma has 3 shareable updates.');
    expect(record.supporterView.facts.map((fact) => fact.source)).toEqual([
      'weekly_report_summary',
      'session_recap_presence',
      'milestone',
    ]);
    expect(record.supporterView.facts.map((fact) => fact.title)).toEqual([
      'Weekly report 2026-06-22 Topics explored: 3',
      'Session recap ready',
      'Milestone reached: session count',
    ]);
    expect(record.supporterView.facts.map((fact) => fact.metadata)).toEqual([
      {
        templateKey: 'weeklyReport',
        reportWeek: '2026-06-22',
        stats: [{ metricKey: 'topicsExplored', value: 3 }],
      },
      {
        templateKey: 'sessionRecap',
        sessionDate: '2026-06-28T12:00:00.000Z',
      },
      {
        templateKey: 'milestone',
        milestoneType: 'session_count',
        threshold: 3,
        subjectName: 'Physics',
      },
    ]);
    expect(record.supporterView.facts.map((fact) => fact.artifact)).toEqual([
      { kind: 'weekly_report', id: UUID.weeklyReport },
      { kind: 'session_recap', id: UUID.session },
      undefined,
    ]);
    expect(record.supporterView.factIds).toEqual(record.supporteeView.factIds);
    expect(JSON.stringify(record)).not.toContain('raw parent-facing recap');
    expect(JSON.stringify(record)).not.toContain('raw highlight');
    expect(JSON.stringify(record)).not.toContain('raw prompt');
  });

  it('does not read artifacts when accepted visibility is absent in the transaction snapshot', async () => {
    const db = createDb(false);

    await expect(
      readSharedRecordForSupportee(db, {
        supporterPersonId: UUID.supporter,
        supporteePersonId: UUID.supportee,
      }),
    ).rejects.toThrow('This support link is not active.');
    await expect(
      readSharedArtifactForSupportee(db, {
        supporterPersonId: UUID.supporter,
        supporteePersonId: UUID.supportee,
        artifactKind: 'weekly_report',
        artifactId: UUID.olderWeeklyReport,
      }),
    ).rejects.toThrow('This support link is not active.');

    expect(db.query.person.findFirst).not.toHaveBeenCalled();
    expect(db.query.weeklyReports.findFirst).not.toHaveBeenCalled();
    expect(db.query.weeklyReports.findMany).not.toHaveBeenCalled();
    expect(db.query.sessionSummaries.findFirst).not.toHaveBeenCalled();
    expect(db.query.sessionSummaries.findMany).not.toHaveBeenCalled();
    expect(db.query.milestones.findMany).not.toHaveBeenCalled();
  });

  it('loads an older weekly report by id without depending on the capped Journal projection', async () => {
    const db = createDb();
    jest.mocked(db.query.weeklyReports.findFirst).mockResolvedValueOnce({
      id: UUID.olderWeeklyReport,
      profileId: UUID.supporter,
      childProfileId: UUID.supportee,
      reportWeek: '2026-06-15',
      reportData: weeklyReportData,
      viewedAt: null,
      createdAt: new Date('2026-06-22T12:00:00.000Z'),
    });

    const record = await readSharedArtifactForSupportee(db, {
      supporterPersonId: UUID.supporter,
      supporteePersonId: UUID.supportee,
      artifactKind: 'weekly_report',
      artifactId: UUID.olderWeeklyReport,
    });

    expect(record.supporterView.facts).toHaveLength(1);
    expect(record.supporterView.facts[0]?.artifact).toEqual({
      kind: 'weekly_report',
      id: UUID.olderWeeklyReport,
    });
    expect(db.query.weeklyReports.findMany).not.toHaveBeenCalled();
    expect(db.query.sessionSummaries.findMany).not.toHaveBeenCalled();
  });

  it('loads an older accepted recap by session id without depending on list ordering', async () => {
    const db = createDb();
    jest.mocked(db.query.sessionSummaries.findFirst).mockResolvedValueOnce({
      id: UUID.summary,
      sessionId: UUID.olderSession,
      profileId: UUID.supportee,
      topicId: null,
      content: 'raw learner-facing summary',
      aiFeedback: null,
      highlight: null,
      narrative: null,
      conversationPrompt: null,
      engagementSignal: null,
      closingLine: null,
      learnerRecap: null,
      nextTopicId: null,
      nextTopicReason: null,
      status: 'accepted',
      createdAt: new Date('2026-06-21T12:00:00.000Z'),
      updatedAt: new Date('2026-06-21T12:00:00.000Z'),
      llmSummary: null,
      summaryGeneratedAt: null,
      purgedAt: null,
    });

    const record = await readSharedArtifactForSupportee(db, {
      supporterPersonId: UUID.supporter,
      supporteePersonId: UUID.supportee,
      artifactKind: 'session_recap',
      artifactId: UUID.olderSession,
    });

    expect(record.supporterView.facts).toHaveLength(1);
    expect(record.supporterView.facts[0]?.artifact).toEqual({
      kind: 'session_recap',
      id: UUID.olderSession,
    });
    expect(db.query.weeklyReports.findMany).not.toHaveBeenCalled();
    expect(db.query.sessionSummaries.findMany).not.toHaveBeenCalled();
  });
});
