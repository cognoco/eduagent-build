import type { Database } from '@eduagent/database';
import type { WeeklyReportData } from '@eduagent/schemas';

import { readSharedRecordForSupportee } from './shared-record-read-model';

const UUID = {
  supporter: '00000000-0000-4000-8000-000000000001',
  supportee: '00000000-0000-4000-8000-000000000002',
  supportership: '00000000-0000-4000-8000-000000000003',
  weeklyReport: '00000000-0000-4000-8000-000000000004',
  session: '00000000-0000-4000-8000-000000000005',
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

function createDb(): Database {
  return {
    query: {
      person: {
        findFirst: jest.fn().mockResolvedValue({ displayName: 'Emma' }),
      },
      weeklyReports: {
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
            metadata: null,
            celebratedAt: null,
            createdAt: new Date('2026-06-27T12:00:00.000Z'),
          },
        ]),
      },
    },
  } as unknown as Database;
}

describe('readSharedRecordForSupportee', () => {
  it('projects real report, recap, and milestone facts without raw artifacts', async () => {
    const record = await readSharedRecordForSupportee(createDb(), {
      supportershipId: UUID.supportership,
      supporterPersonId: UUID.supporter,
      supporteePersonId: UUID.supportee,
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
    expect(record.supporterView.factIds).toEqual(record.supporteeView.factIds);
    expect(JSON.stringify(record)).not.toContain('raw parent-facing recap');
    expect(JSON.stringify(record)).not.toContain('raw highlight');
    expect(JSON.stringify(record)).not.toContain('raw prompt');
  });
});
