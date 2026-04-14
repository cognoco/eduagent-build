import {
  isNewLearner,
  sessionsUntilFullProgress,
} from './progressive-disclosure';

describe('isNewLearner', () => {
  it('returns false when totalSessions is undefined', () => {
    expect(isNewLearner(undefined)).toBe(false);
  });

  it('returns true when totalSessions is 0', () => {
    expect(isNewLearner(0)).toBe(true);
  });

  it('returns true when totalSessions is 3 (below threshold)', () => {
    expect(isNewLearner(3)).toBe(true);
  });

  it('returns false when totalSessions is 4 (at threshold)', () => {
    expect(isNewLearner(4)).toBe(false);
  });

  it('returns false when totalSessions is 100 (above threshold)', () => {
    expect(isNewLearner(100)).toBe(false);
  });
});

describe('sessionsUntilFullProgress', () => {
  it('returns 0 when totalSessions is undefined', () => {
    expect(sessionsUntilFullProgress(undefined)).toBe(0);
  });

  it('returns 3 when totalSessions is 1', () => {
    expect(sessionsUntilFullProgress(1)).toBe(3);
  });

  it('returns 0 when totalSessions is 4 (at threshold)', () => {
    expect(sessionsUntilFullProgress(4)).toBe(0);
  });
});
