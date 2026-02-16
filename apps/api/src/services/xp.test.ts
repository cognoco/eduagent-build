import { calculateTopicXp, verifyXp, decayXp } from './xp';

// ---------------------------------------------------------------------------
// calculateTopicXp
// ---------------------------------------------------------------------------

describe('calculateTopicXp', () => {
  it('calculates XP for recall depth (1x multiplier)', () => {
    const xp = calculateTopicXp(0.8, 'recall');

    expect(xp).toBe(80); // 100 * 0.8 * 1
  });

  it('calculates XP for explain depth (1.5x multiplier)', () => {
    const xp = calculateTopicXp(0.8, 'explain');

    expect(xp).toBe(120); // 100 * 0.8 * 1.5
  });

  it('calculates XP for transfer depth (2x multiplier)', () => {
    const xp = calculateTopicXp(0.8, 'transfer');

    expect(xp).toBe(160); // 100 * 0.8 * 2
  });

  it('returns 0 for zero mastery', () => {
    const xp = calculateTopicXp(0, 'transfer');

    expect(xp).toBe(0);
  });

  it('returns full XP for perfect mastery at transfer', () => {
    const xp = calculateTopicXp(1.0, 'transfer');

    expect(xp).toBe(200); // 100 * 1.0 * 2
  });

  it('rounds to nearest integer', () => {
    const xp = calculateTopicXp(0.33, 'explain');

    // 100 * 0.33 * 1.5 = 49.5 -> rounds to 50
    expect(xp).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// verifyXp
// ---------------------------------------------------------------------------

describe('verifyXp', () => {
  it('returns the same amount as pending', () => {
    expect(verifyXp(100)).toBe(100);
  });

  it('handles zero amount', () => {
    expect(verifyXp(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// decayXp
// ---------------------------------------------------------------------------

describe('decayXp', () => {
  it('decays proportionally based on mastery drop', () => {
    // 100 XP with 0.3 mastery drop => 100 - (100 * 0.3) = 70
    const result = decayXp(100, 0.3);

    expect(result).toBe(70);
  });

  it('never returns below 0', () => {
    const result = decayXp(50, 1.5);

    expect(result).toBe(0);
  });

  it('returns full amount when mastery drop is 0', () => {
    const result = decayXp(100, 0);

    expect(result).toBe(100);
  });

  it('returns 0 when mastery drop is 1 (total loss)', () => {
    const result = decayXp(100, 1.0);

    expect(result).toBe(0);
  });
});
