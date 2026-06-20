import {
  buildAttentionReport,
  buildCuratedSupporterReport,
} from './supporter-report';

const SUPPORTERSHIP_ID = '00000000-0000-4000-8000-000000000001';
const REQUESTER_ID = '00000000-0000-4000-8000-000000000002';
const NOW = new Date('2026-06-20T12:00:00.000Z');

describe('supporter report', () => {
  it('never reports confided affect or legacy LLM prose in curated reads', () => {
    const report = buildCuratedSupporterReport({
      supportershipId: SUPPORTERSHIP_ID,
      supporteeDisplayName: 'Emma',
      generatedAt: NOW,
      facts: [
        {
          id: 'fact-1',
          kind: 'observable_engagement',
          title: 'Opened the fractions review',
          source: 'activity',
        },
        {
          id: 'fact-2',
          kind: 'confided_affect',
          title: 'I hate maths',
          source: 'journal',
        },
        {
          id: 'legacy-1',
          kind: 'effort',
          title: 'Raw persisted LLM prose',
          detail: 'legacy highlight should not become a V2 supporter surface',
          source: 'monthly_report_highlights',
        },
      ],
    });

    const serialized = JSON.stringify(report);
    expect(report.facts).toHaveLength(1);
    expect(serialized).not.toContain('I hate maths');
    expect(serialized).not.toContain('legacy highlight');
  });

  it('writes a core appeal audit and keeps raw artifacts out of attention reports', async () => {
    const auditWriter = jest.fn().mockResolvedValue(undefined);
    const report = await buildAttentionReport({
      supportershipId: SUPPORTERSHIP_ID,
      requestedByPersonId: REQUESTER_ID,
      reason: 'Need detail',
      generatedAt: NOW,
      auditWriter,
      facts: [
        {
          id: 'fact-1',
          kind: 'effort',
          title: 'Kept trying the review set',
          detail: 'structural detail only',
          source: 'assessment',
        },
        {
          id: 'artifact-1',
          kind: 'confided_affect',
          title: 'raw chat: I feel stupid',
          source: 'chat_artifact',
        },
      ],
    });

    expect(report.artifactWall).toBe(true);
    expect(JSON.stringify(report)).not.toContain('raw chat');
    expect(auditWriter).toHaveBeenCalledWith(
      expect.objectContaining({
        supportershipId: SUPPORTERSHIP_ID,
        eventType: 'appeal_requested',
      }),
    );
  });
});
