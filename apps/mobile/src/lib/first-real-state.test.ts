import { hasFirstRealState } from './first-real-state';

describe('hasFirstRealState', () => {
  it('stays false for an opened profile with no subject, feed card, or completed exchange', () => {
    expect(
      hasFirstRealState({
        activeSubjectCount: 0,
        feedCardCount: 0,
        completedExchangeCount: 0,
      }),
    ).toBe(false);
  });

  it('turns true after the learner has created a subject', () => {
    expect(
      hasFirstRealState({
        activeSubjectCount: 1,
        feedCardCount: 0,
        completedExchangeCount: 0,
      }),
    ).toBe(true);
  });

  it('turns true when a real feed card or completed exchange exists', () => {
    expect(
      hasFirstRealState({
        activeSubjectCount: 0,
        feedCardCount: 1,
        completedExchangeCount: 0,
      }),
    ).toBe(true);
    expect(
      hasFirstRealState({
        activeSubjectCount: 0,
        feedCardCount: 0,
        completedExchangeCount: 1,
      }),
    ).toBe(true);
  });
});
