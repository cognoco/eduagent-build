import { render, screen } from '@testing-library/react-native';
import type { DashboardChild } from '@eduagent/schemas';

import { translate } from '../../test-utils/mock-i18n';
import type { Translate } from '../../i18n';
import { MentorSlot } from './MentorSlot';

const t = translate as unknown as Translate;

function makeChild(overrides: Partial<DashboardChild> = {}): DashboardChild {
  return {
    profileId: 'child-1',
    displayName: 'Lilly',
    consentStatus: null,
    respondedAt: null,
    summary: '',
    sessionsThisWeek: 3,
    sessionsLastWeek: 0,
    totalTimeThisWeek: 0,
    totalTimeLastWeek: 0,
    exchangesThisWeek: 0,
    exchangesLastWeek: 0,
    trend: 'stable',
    subjects: [],
    guidedVsImmediateRatio: 0,
    retentionTrend: 'stable',
    totalSessions: 5,
    currentlyWorkingOn: [],
    currentStreak: 0,
    longestStreak: 0,
    totalXp: 0,
    ...overrides,
  };
}

function progress(
  overrides: Partial<NonNullable<DashboardChild['progress']>> = {},
): DashboardChild['progress'] {
  return {
    snapshotDate: '2026-05-29',
    topicsMastered: 0,
    vocabularyTotal: 0,
    minutesThisWeek: 0,
    weeklyDeltaTopicsMastered: 0,
    weeklyDeltaVocabularyTotal: 0,
    weeklyDeltaTopicsExplored: 0,
    engagementTrend: 'stable',
    guidance: null,
    ...overrides,
  };
}

describe('MentorSlot', () => {
  it('shows a celebration when the streak reaches the threshold', () => {
    render(<MentorSlot child={makeChild({ currentStreak: 7 })} t={t} />);

    const celebration = screen.getByTestId(
      'parent-home-mentor-slot-celebration',
    );
    expect(celebration).toBeTruthy();
    // Reframes rather than restating the streak number (Challenge LOW-3).
    expect(celebration.props.children).not.toContain('7');
  });

  it('shows a celebration for a big mastery week', () => {
    render(
      <MentorSlot
        child={makeChild({
          progress: progress({ weeklyDeltaTopicsMastered: 3 }),
        })}
        t={t}
      />,
    );

    expect(
      screen.getByTestId('parent-home-mentor-slot-celebration'),
    ).toBeTruthy();
  });

  it('shows the guidance line when no celebration fires', () => {
    render(
      <MentorSlot
        child={makeChild({
          currentStreak: 2,
          progress: progress({
            guidance: 'Short sessions land best for Lilly.',
          }),
        })}
        t={t}
      />,
    );

    const guidance = screen.getByTestId('parent-home-mentor-slot-guidance');
    expect(guidance.props.children).toBe('Short sessions land best for Lilly.');
  });

  it('renders nothing when there is no celebration and no guidance', () => {
    render(
      <MentorSlot
        child={makeChild({ currentStreak: 1, progress: progress() })}
        t={t}
      />,
    );

    expect(screen.queryByTestId('parent-home-mentor-slot')).toBeNull();
  });

  it('renders nothing when progress is null', () => {
    render(
      <MentorSlot
        child={makeChild({ currentStreak: 0, progress: null })}
        t={t}
      />,
    );

    expect(screen.queryByTestId('parent-home-mentor-slot')).toBeNull();
  });
});
