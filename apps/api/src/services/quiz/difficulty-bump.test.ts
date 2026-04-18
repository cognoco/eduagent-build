import { shouldApplyDifficultyBump } from './difficulty-bump';

interface MockRound {
  score: number | null;
  total: number;
  status: string;
  completedAt: Date | null;
}

describe('shouldApplyDifficultyBump', () => {
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

  function perfect(daysBack: number): MockRound {
    return {
      score: 8,
      total: 8,
      status: 'completed',
      completedAt: daysAgo(daysBack),
    };
  }

  function imperfect(daysBack: number): MockRound {
    return {
      score: 6,
      total: 8,
      status: 'completed',
      completedAt: daysAgo(daysBack),
    };
  }

  it('returns true for 3 consecutive perfect rounds within 14 days', () => {
    expect(
      shouldApplyDifficultyBump([perfect(1), perfect(3), perfect(5)])
    ).toBe(true);
  });

  it('returns false when fewer than 3 rounds exist', () => {
    expect(shouldApplyDifficultyBump([perfect(1), perfect(3)])).toBe(false);
    expect(shouldApplyDifficultyBump([perfect(1)])).toBe(false);
    expect(shouldApplyDifficultyBump([])).toBe(false);
  });

  it('returns false when any of the last 3 is non-perfect', () => {
    expect(
      shouldApplyDifficultyBump([perfect(1), imperfect(3), perfect(5)])
    ).toBe(false);
  });

  it('returns false when rounds are older than 14 days', () => {
    expect(
      shouldApplyDifficultyBump([perfect(1), perfect(3), perfect(20)])
    ).toBe(false);
  });

  it('only checks the last 3 rounds, not all rounds', () => {
    expect(
      shouldApplyDifficultyBump([
        perfect(1),
        perfect(2),
        perfect(3),
        imperfect(10),
      ])
    ).toBe(true);
  });
});
