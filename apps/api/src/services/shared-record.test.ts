import {
  RenderEquivalenceError,
  assertRenderEquivalent,
  projectSharedRecord,
} from './shared-record';

const SUPPORTERSHIP_ID = '00000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-06-20T12:00:00.000Z');

describe('shared record projection', () => {
  it('renders the same reportable fact ids for supporter and supportee', () => {
    const record = projectSharedRecord({
      supportershipId: SUPPORTERSHIP_ID,
      generatedAt: NOW,
      supporteeDisplayName: 'Emma',
      facts: [
        {
          id: 'fact-1',
          kind: 'effort',
          title: 'Practiced fractions',
          source: 'session',
        },
        {
          id: 'fact-2',
          kind: 'confided_affect',
          title: 'I was scared',
          source: 'journal',
        },
      ],
    });

    expect(record.factIds).toEqual(['fact-1']);
    expect(record.supporterView.factIds).toEqual(record.supporteeView.factIds);
    expect(JSON.stringify(record)).not.toContain('I was scared');
  });

  it('fails when a caller attempts a one-sided render', () => {
    const record = projectSharedRecord({
      supportershipId: SUPPORTERSHIP_ID,
      generatedAt: NOW,
      facts: [
        {
          id: 'fact-1',
          kind: 'mastery',
          title: 'Knows equivalent fractions',
          source: 'assessment',
        },
      ],
    });
    const broken = {
      ...record,
      supporteeView: { ...record.supporteeView, factIds: [] },
    };

    expect(() => assertRenderEquivalent(broken)).toThrow(
      RenderEquivalenceError,
    );
  });
});
