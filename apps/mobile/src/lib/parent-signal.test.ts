import {
  AGGREGATE_SIGNAL_CONFIG,
  deriveAggregateSignal,
  type AggregateSignal,
} from './parent-signal';

describe('deriveAggregateSignal', () => {
  it('returns null when no statuses are provided', () => {
    expect(deriveAggregateSignal([])).toBeNull();
  });

  it('returns on-track when every status is strong', () => {
    expect(deriveAggregateSignal(['strong', 'strong'])).toBe('on-track');
  });

  it('returns needs-attention when any status is fading', () => {
    expect(deriveAggregateSignal(['strong', 'fading'])).toBe('needs-attention');
  });

  it('returns falling-behind when any status is weak', () => {
    expect(deriveAggregateSignal(['strong', 'weak'])).toBe('falling-behind');
  });

  it('returns falling-behind when any status is forgotten', () => {
    expect(deriveAggregateSignal(['strong', 'forgotten'])).toBe(
      'falling-behind',
    );
  });

  it('prioritises falling-behind over needs-attention when both signals are present', () => {
    expect(deriveAggregateSignal(['fading', 'weak'])).toBe('falling-behind');
  });
});

describe('AGGREGATE_SIGNAL_CONFIG', () => {
  const signals: AggregateSignal[] = [
    'on-track',
    'needs-attention',
    'falling-behind',
  ];

  it('has an entry for every AggregateSignal', () => {
    for (const signal of signals) {
      expect(AGGREGATE_SIGNAL_CONFIG[signal]).toBeDefined();
    }
  });

  it('binds each signal to a retention-* theme color key and Tailwind class', () => {
    for (const signal of signals) {
      const config = AGGREGATE_SIGNAL_CONFIG[signal];
      expect(config.colorKey).toMatch(/^retention/);
      expect(config.textColorClass.startsWith('text-retention-')).toBe(true);
    }
  });
});
