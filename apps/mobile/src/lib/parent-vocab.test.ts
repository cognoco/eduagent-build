import i18next from 'i18next';
import {
  getParentMetricTooltip,
  getParentRetentionInfo,
  getReconciliationLine,
  getUnderstandingLabel,
} from './parent-vocab';

describe('getUnderstandingLabel', () => {
  const KEY = (suffix: string) =>
    `parentView.topic.understandingLevels.${suffix}` as const;
  it.each([
    [0, KEY('justStarting')],
    [1, KEY('gettingFamiliar')],
    [15, KEY('gettingFamiliar')],
    [30, KEY('gettingFamiliar')],
    [31, KEY('findingTheirFeet')],
    [60, KEY('findingTheirFeet')],
    [61, KEY('gettingComfortable')],
    [85, KEY('gettingComfortable')],
    [86, KEY('nearlyMastered')],
    [99, KEY('nearlyMastered')],
    [100, KEY('mastered')],
  ])('maps %i%% to %s', (score, expected) => {
    expect(getUnderstandingLabel(score)).toBe(expected);
  });
});

describe('getParentRetentionInfo', () => {
  it('returns null when completionStatus is not_started', () => {
    expect(getParentRetentionInfo('strong', 2, 'not_started')).toBeNull();
  });

  it('returns null when totalSessions is 0', () => {
    expect(getParentRetentionInfo('strong', 0, 'in_progress')).toBeNull();
  });

  it('returns null when retentionStatus is null', () => {
    expect(getParentRetentionInfo(null, 5, 'in_progress')).toBeNull();
  });

  it('maps strong to "Still remembered"', () => {
    expect(getParentRetentionInfo('strong', 3, 'in_progress')).toEqual({
      label: 'Still remembered',
      colorKey: 'retentionStrong',
    });
  });

  it('maps fading to "A few things to refresh"', () => {
    expect(getParentRetentionInfo('fading', 3, 'in_progress')).toEqual({
      label: 'A few things to refresh',
      colorKey: 'retentionFading',
    });
  });

  it('maps weak to "Needs a quick refresh"', () => {
    expect(getParentRetentionInfo('weak', 3, 'in_progress')).toEqual({
      label: 'Needs a quick refresh',
      colorKey: 'retentionWeak',
    });
  });

  it('maps forgotten to "Needs a fresh pass"', () => {
    expect(getParentRetentionInfo('forgotten', 3, 'in_progress')).toEqual({
      label: 'Needs a fresh pass',
      colorKey: 'retentionWeak',
    });
  });
});

describe('getParentMetricTooltip', () => {
  const t = i18next.getFixedT('en');

  it('returns null for an unknown metric key', () => {
    expect(getParentMetricTooltip(t, 'not-a-real-key')).toBeNull();
  });

  it('returns the localized title and body for understanding', () => {
    const tooltip = getParentMetricTooltip(t, 'understanding');
    expect(tooltip).not.toBeNull();
    expect(tooltip?.title).toBe('Understanding');
    expect(tooltip?.body.toLowerCase()).toContain('understands');
  });

  it.each([
    ['time-on-app', 'Time on app'],
    ['sessions-this-week', 'Sessions this week'],
    ['engagement-trend', 'Engagement trend'],
    ['exchange-delta', 'Exchanges this week'],
    ['streak-xp', 'Streak and XP'],
    ['review-status', 'Memory check'],
    ['milestone', 'Milestones'],
  ])('maps %s to the right title', (key, title) => {
    expect(getParentMetricTooltip(t, key)?.title).toBe(title);
  });
});

describe('getReconciliationLine', () => {
  it('returns a reconciliation line when understanding is strong but review is due', () => {
    const retentionInfo = getParentRetentionInfo('fading', 2, 'completed');

    expect(getReconciliationLine(80, retentionInfo)).toBe(
      'Understood well in-session, now due for a quick review.',
    );
  });

  it('returns null when retention is strong', () => {
    const retentionInfo = getParentRetentionInfo('strong', 2, 'completed');

    expect(getReconciliationLine(80, retentionInfo)).toBeNull();
  });
});
