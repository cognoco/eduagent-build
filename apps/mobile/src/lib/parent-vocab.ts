/**
 * Parent-facing vocabulary canon for progress and recap surfaces.
 */

import type { TFunction } from 'i18next';

export interface ParentRetentionInfo {
  label: string;
  colorKey: 'retentionStrong' | 'retentionFading' | 'retentionWeak';
}

type ParentMetricTooltip = {
  title: string;
  body: string;
};

export type ParentMetricKey =
  | 'time-on-app'
  | 'sessions-this-week'
  | 'engagement-trend'
  | 'exchange-delta'
  | 'streak-xp'
  | 'understanding'
  | 'review-status'
  | 'milestone';

const PARENT_METRIC_KEYS: readonly ParentMetricKey[] = [
  'time-on-app',
  'sessions-this-week',
  'engagement-trend',
  'exchange-delta',
  'streak-xp',
  'understanding',
  'review-status',
  'milestone',
];

// Maps a tooltip metric key to its full i18n keys under
// `parentView.metricTooltips.<suffix>.{title,body}`. Keeping the full literal
// strings (rather than building them via template literals at call time)
// satisfies i18next's static key union — dynamic templates aren't inferable.
// `as const` preserves the literal-string types through the Record so each
// .title/.body remains assignable to i18next's typed key union.
const METRIC_TOOLTIP_I18N_KEYS = {
  'time-on-app': {
    title: 'parentView.metricTooltips.timeOnApp.title',
    body: 'parentView.metricTooltips.timeOnApp.body',
  },
  'sessions-this-week': {
    title: 'parentView.metricTooltips.sessionsThisWeek.title',
    body: 'parentView.metricTooltips.sessionsThisWeek.body',
  },
  'engagement-trend': {
    title: 'parentView.metricTooltips.engagementTrend.title',
    body: 'parentView.metricTooltips.engagementTrend.body',
  },
  'exchange-delta': {
    title: 'parentView.metricTooltips.exchangeDelta.title',
    body: 'parentView.metricTooltips.exchangeDelta.body',
  },
  'streak-xp': {
    title: 'parentView.metricTooltips.streakXp.title',
    body: 'parentView.metricTooltips.streakXp.body',
  },
  understanding: {
    title: 'parentView.metricTooltips.understanding.title',
    body: 'parentView.metricTooltips.understanding.body',
  },
  'review-status': {
    title: 'parentView.metricTooltips.reviewStatus.title',
    body: 'parentView.metricTooltips.reviewStatus.body',
  },
  milestone: {
    title: 'parentView.metricTooltips.milestone.title',
    body: 'parentView.metricTooltips.milestone.body',
  },
} as const satisfies Record<ParentMetricKey, { title: string; body: string }>;

/**
 * Returns the localized title + body for a parent-facing metric tooltip, or
 * null when the key is unknown. Callers must hold a `t` from `useTranslation`.
 */
export function getParentMetricTooltip(
  t: TFunction,
  metricKey: string,
): ParentMetricTooltip | null {
  if (!(PARENT_METRIC_KEYS as readonly string[]).includes(metricKey)) {
    return null;
  }
  const keys = METRIC_TOOLTIP_I18N_KEYS[metricKey as ParentMetricKey];
  return {
    title: t(keys.title),
    body: t(keys.body),
  };
}

export type UnderstandingLabelKey =
  | 'parentView.topic.understandingLevels.justStarting'
  | 'parentView.topic.understandingLevels.gettingFamiliar'
  | 'parentView.topic.understandingLevels.findingTheirFeet'
  | 'parentView.topic.understandingLevels.gettingComfortable'
  | 'parentView.topic.understandingLevels.nearlyMastered'
  | 'parentView.topic.understandingLevels.mastered';

// Returns an i18n key; callers translate via useTranslation. Decouples this
// pure helper from i18n setup so it stays testable without React context.
export function getUnderstandingLabel(
  scorePercent: number,
): UnderstandingLabelKey {
  if (scorePercent === 0)
    return 'parentView.topic.understandingLevels.justStarting';
  if (scorePercent <= 30)
    return 'parentView.topic.understandingLevels.gettingFamiliar';
  if (scorePercent <= 60)
    return 'parentView.topic.understandingLevels.findingTheirFeet';
  if (scorePercent <= 85)
    return 'parentView.topic.understandingLevels.gettingComfortable';
  if (scorePercent <= 99)
    return 'parentView.topic.understandingLevels.nearlyMastered';
  return 'parentView.topic.understandingLevels.mastered';
}

export function getParentRetentionInfo(
  retentionStatus: string | null | undefined,
  totalSessions: number,
  completionStatus: string,
): ParentRetentionInfo | null {
  if (
    !retentionStatus ||
    totalSessions < 1 ||
    completionStatus === 'not_started'
  ) {
    return null;
  }

  switch (retentionStatus) {
    case 'strong':
      return { label: 'Still remembered', colorKey: 'retentionStrong' };
    case 'fading':
      return {
        label: 'A few things to refresh',
        colorKey: 'retentionFading',
      };
    case 'weak':
      return { label: 'Needs a quick refresh', colorKey: 'retentionWeak' };
    case 'forgotten':
      return { label: 'Needs a fresh pass', colorKey: 'retentionWeak' };
    default:
      return null;
  }
}

export function getReconciliationLine(
  scorePercent: number,
  retentionInfo: ParentRetentionInfo | null,
): string | null {
  if (!retentionInfo) return null;
  if (scorePercent >= 61 && retentionInfo.colorKey !== 'retentionStrong') {
    return 'Understood well in-session, now due for a quick review.';
  }
  return null;
}
