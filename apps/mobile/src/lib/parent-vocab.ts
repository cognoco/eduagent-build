/**
 * Parent-facing vocabulary canon for progress and recap surfaces.
 */

export interface ParentRetentionInfo {
  label: string;
  colorKey: 'retentionStrong' | 'retentionFading' | 'retentionWeak';
}

type ParentMetricTooltip = {
  title: string;
  body: string;
};

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

export const PARENT_METRIC_TOOLTIPS: Record<string, ParentMetricTooltip> = {
  'time-on-app': {
    title: 'Time on app',
    body: 'How long your child spent in the app during this session, measured in real-world minutes.',
  },
  'sessions-this-week': {
    title: 'Sessions this week',
    body: 'The number of learning conversations your child had with the mentor this week.',
  },
  'engagement-trend': {
    title: 'Engagement trend',
    body: 'Whether your child is using the mentor more, less, or about the same compared with recent activity.',
  },
  'exchange-delta': {
    title: 'Exchanges this week',
    body: 'How many message turns happened this week compared with last week. It is a lightweight signal for learning activity.',
  },
  'guided-ratio': {
    title: 'Guided practice',
    body: 'The share of mentor replies where your child needed a worked example or stronger guidance instead of light prompting.',
  },
  'streak-xp': {
    title: 'Streak and XP',
    body: 'Motivation signals from regular practice and completed learning work. They are not grades.',
  },
  understanding: {
    title: 'Understanding',
    body: 'How well your child understands this topic, based on their answers and conversations with the mentor.',
  },
  'review-status': {
    title: 'Memory check',
    body: 'Whether your child still remembers what they learned. Based on spaced review, so topics come back at increasing intervals.',
  },
  milestone: {
    title: 'Milestones',
    body: 'Milestones mark real achievements, like first sessions, topics explored, and vocabulary learned.',
  },
};
