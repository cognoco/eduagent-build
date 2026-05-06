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

export function getUnderstandingLabel(scorePercent: number): string {
  if (scorePercent === 0) return 'Just starting';
  if (scorePercent <= 30) return 'Getting familiar';
  if (scorePercent <= 60) return 'Finding their feet';
  if (scorePercent <= 85) return 'Getting comfortable';
  if (scorePercent <= 99) return 'Nearly mastered';
  return 'Mastered';
}

export function getParentRetentionInfo(
  retentionStatus: string | null | undefined,
  totalSessions: number,
  completionStatus: string
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
  retentionInfo: ParentRetentionInfo | null
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
