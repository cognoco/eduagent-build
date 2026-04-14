import { shouldAutoFile } from './use-session-actions';

describe('shouldAutoFile', () => {
  it('returns true when all conditions met', () => {
    expect(
      shouldAutoFile({
        effectiveMode: 'freeform',
        effectiveSubjectId: 'sub-1',
        exchangeCount: 5,
        topicId: undefined,
      })
    ).toBe(true);
  });

  it('returns false for non-freeform mode', () => {
    expect(
      shouldAutoFile({
        effectiveMode: 'learning',
        effectiveSubjectId: 'sub-1',
        exchangeCount: 5,
        topicId: undefined,
      })
    ).toBe(false);
  });

  it('returns false when subject not classified', () => {
    expect(
      shouldAutoFile({
        effectiveMode: 'freeform',
        effectiveSubjectId: null,
        exchangeCount: 5,
        topicId: undefined,
      })
    ).toBe(false);
  });

  it('returns false when fewer than 5 exchanges', () => {
    expect(
      shouldAutoFile({
        effectiveMode: 'freeform',
        effectiveSubjectId: 'sub-1',
        exchangeCount: 4,
        topicId: undefined,
      })
    ).toBe(false);
  });

  it('returns false when topic already filed', () => {
    expect(
      shouldAutoFile({
        effectiveMode: 'freeform',
        effectiveSubjectId: 'sub-1',
        exchangeCount: 5,
        topicId: 'topic-1',
      })
    ).toBe(false);
  });
});
