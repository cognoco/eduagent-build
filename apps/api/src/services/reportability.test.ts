import {
  NonReportableFactError,
  assertReportable,
  filterToReportable,
  shouldDeliverSafetyEscalation,
} from './reportability';

describe('reportability gate', () => {
  it('drops affect and self-doubt by allow-list, not deny-list', () => {
    const facts = filterToReportable([
      {
        id: 'fact-1',
        kind: 'mastery',
        title: 'Mastered equivalent fractions',
        source: 'assessment',
      },
      {
        id: 'fact-2',
        kind: 'confided_affect',
        title: 'I feel stupid',
        detail: 'raw affect must not travel upward',
        source: 'journal',
      },
      {
        id: 'fact-3',
        kind: 'unknown_future_affect',
        title: 'A future emotional signal',
        source: 'llm',
      },
    ]);

    expect(facts).toHaveLength(1);
    expect(facts[0]?.id).toBe('fact-1');
  });

  it('throws a typed error for non-reportable facts', () => {
    expect(() =>
      assertReportable({
        id: 'fact-2',
        kind: 'self_doubt',
        title: 'I cannot do this',
        source: 'journal',
      }),
    ).toThrow(NonReportableFactError);
  });

  it('does not suppress safety escalation delivery', () => {
    const escalation = {
      id: 'safety-1',
      kind: 'confided_affect',
      title: 'Escalate safety concern',
      source: 'safety-tripwire',
      safetyEscalation: true,
    };

    expect(shouldDeliverSafetyEscalation(escalation)).toBe(true);
    expect(filterToReportable([escalation])[0]).toMatchObject({
      kind: 'observable_engagement',
      metadata: { safetyEscalation: true },
    });
  });
});
