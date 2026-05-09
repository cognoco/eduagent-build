import { render, screen, fireEvent } from '@testing-library/react-native';
import { ParentDashboardSummary } from './ParentDashboardSummary';

describe('ParentDashboardSummary', () => {
  const defaultProps = {
    profileId: 'test-profile-123',
    childName: 'Alex',
    summary: 'Alex: Math strong, Science fading. 4 sessions this week.',
    subjects: [
      { name: 'Mathematics', retentionStatus: 'strong' as const },
      { name: 'Science', retentionStatus: 'fading' as const },
    ],
    trend: 'up' as const,
    sessionsThisWeek: 4,
    sessionsLastWeek: 2,
    totalTimeThisWeek: 85,
    totalTimeLastWeek: 40,
    exchangesThisWeek: 14,
    exchangesLastWeek: 6,
    guidedVsImmediateRatio: 0.5,
    currentStreak: 4,
    totalXp: 120,
    onDrillDown: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders child name as headline', () => {
    render(<ParentDashboardSummary {...defaultProps} />);

    screen.getByText('Alex');
  });

  it('renders summary as subtext', () => {
    render(<ParentDashboardSummary {...defaultProps} />);

    screen.getByText(
      'Alex: Math strong, Science fading. 4 sessions this week.',
    );
  });

  it('renders temporal comparison with trend arrow', () => {
    render(<ParentDashboardSummary {...defaultProps} />);

    screen.getByText(
      '4 sessions, 1h 25m this week (\u2191 up from 2 sessions, 40m last week)',
    );
  });

  it('renders hidden family-summary chips', () => {
    render(
      <ParentDashboardSummary
        {...defaultProps}
        progress={{
          topicsMastered: 2,
          vocabularyTotal: 0,
          weeklyDeltaTopicsMastered: 1,
          weeklyDeltaVocabularyTotal: null,
          weeklyDeltaTopicsExplored: 1,
          engagementTrend: 'increasing',
          guidance: null,
        }}
      />,
    );

    screen.getByTestId('engagement-trend-chip');
    screen.getByText('Engagement increasing');
    screen.getByTestId('exchange-delta-chip');
    screen.getByText('+8 exchanges');
    screen.getByTestId('guided-ratio-chip');
    screen.getByText('50% guided');
    screen.getByTestId('streak-xp-chip');
    screen.getByText('4-day streak • 120 XP');
    screen.getByTestId('metric-info-engagement-trend');
    screen.getByTestId('metric-info-exchange-delta');
    screen.getByTestId('metric-info-guided-ratio');
    screen.getByTestId('metric-info-streak-xp');
  });

  it.each([
    ['WITHDRAWN', 'Consent withdrawn'],
    ['PENDING', 'Consent pending'],
    ['PARENTAL_CONSENT_REQUESTED', 'Waiting for parent approval'],
  ] as const)(
    'renders consent status and hides learning chips for restricted consent: %s',
    (consentStatus, expectedLabel) => {
      render(
        <ParentDashboardSummary
          {...defaultProps}
          consentStatus={consentStatus}
          progress={{
            topicsMastered: 2,
            vocabularyTotal: 0,
            weeklyDeltaTopicsMastered: 1,
            weeklyDeltaVocabularyTotal: null,
            weeklyDeltaTopicsExplored: 1,
            engagementTrend: 'increasing',
            guidance: null,
          }}
        />,
      );

      screen.getByTestId('consent-status-badge');
      screen.getByText(expectedLabel);
      screen.getByTestId('consent-redacted-message');
      screen.getByText('Progress is hidden for now');
      expect(screen.queryByTestId('engagement-trend-chip')).toBeNull();
      expect(screen.queryByTestId('exchange-delta-chip')).toBeNull();
      expect(screen.queryByTestId('guided-ratio-chip')).toBeNull();
      expect(screen.queryByTestId('streak-xp-chip')).toBeNull();
    },
  );

  it('uses a consent-focused primary action for restricted consent', () => {
    render(
      <ParentDashboardSummary
        {...defaultProps}
        consentStatus="PARENTAL_CONSENT_REQUESTED"
      />,
    );

    screen.getByText('Check consent status');
    fireEvent.press(
      screen.getByTestId('dashboard-child-test-profile-123-primary'),
    );
    expect(defaultProps.onDrillDown).toHaveBeenCalled();
  });

  it('renders down trend correctly', () => {
    render(
      <ParentDashboardSummary
        {...defaultProps}
        trend="down"
        sessionsThisWeek={1}
        sessionsLastWeek={4}
        totalTimeThisWeek={12}
        totalTimeLastWeek={90}
      />,
    );

    screen.getByText(
      '1 session, 12m this week (\u2193 down from 4 sessions, 1h 30m last week)',
    );
  });

  it('renders stable trend correctly', () => {
    render(
      <ParentDashboardSummary
        {...defaultProps}
        trend="stable"
        sessionsThisWeek={3}
        sessionsLastWeek={3}
        totalTimeThisWeek={60}
        totalTimeLastWeek={60}
      />,
    );

    screen.getByText(
      '3 sessions, 1h this week (\u2192 same as 3 sessions, 1h last week)',
    );
  });

  it('renders subject retention signals', () => {
    render(<ParentDashboardSummary {...defaultProps} />);

    screen.getByText('Mathematics');
    screen.getByText('Science');
    screen.getByText('Still remembered');
    screen.getByText('A few things to refresh');
  });

  it('card wrapper is not pressable (navigation via View details button only) [BUG-517]', () => {
    render(<ParentDashboardSummary {...defaultProps} />);

    // [BUG-517] The outer card no longer has onPress to avoid nested
    // <button> on web. Only the "View details" button navigates.
    fireEvent.press(screen.getByTestId('dashboard-child-test-profile-123'));
    expect(defaultProps.onDrillDown).not.toHaveBeenCalled();
  });

  it('calls onDrillDown when View details pressed', () => {
    render(<ParentDashboardSummary {...defaultProps} />);

    fireEvent.press(
      screen.getByTestId('dashboard-child-test-profile-123-primary'),
    );
    expect(defaultProps.onDrillDown).toHaveBeenCalled();
  });

  it('renders skeleton when loading', () => {
    render(<ParentDashboardSummary {...defaultProps} isLoading />);

    screen.getByTestId('coaching-card-skeleton');
    expect(screen.queryByText('Alex')).toBeNull();
  });

  it('handles empty subjects array', () => {
    render(<ParentDashboardSummary {...defaultProps} subjects={[]} />);

    screen.getByText('Alex');
    expect(screen.queryByText('Mathematics')).toBeNull();
    screen.getByTestId('aggregate-signal-empty');
  });

  it('renders retention trend badge when improving', () => {
    render(
      <ParentDashboardSummary {...defaultProps} retentionTrend="improving" />,
    );

    screen.getByTestId('retention-trend-badge');
    screen.getByText(/Review health/);
    screen.getByText(/Improving/);
  });

  it('renders retention trend badge when declining', () => {
    render(
      <ParentDashboardSummary {...defaultProps} retentionTrend="declining" />,
    );

    screen.getByTestId('retention-trend-badge');
    screen.getByText(/Needs review/);
  });

  it('renders retention trend badge when stable', () => {
    render(
      <ParentDashboardSummary {...defaultProps} retentionTrend="stable" />,
    );

    screen.getByTestId('retention-trend-badge');
    screen.getByText(/Stable/);
  });

  it('shows "No data yet" when retention trend not provided', () => {
    render(<ParentDashboardSummary {...defaultProps} />);

    expect(screen.queryByTestId('retention-trend-badge')).toBeNull();
    screen.getByTestId('retention-trend-empty');
  });

  it('renders "Needs Attention" aggregate signal when any subject is fading', () => {
    render(<ParentDashboardSummary {...defaultProps} />);

    screen.getByTestId('aggregate-signal');
    screen.getByText('Needs Attention');
  });

  it('renders "On Track" aggregate signal when all subjects are strong', () => {
    render(
      <ParentDashboardSummary
        {...defaultProps}
        subjects={[
          { name: 'Mathematics', retentionStatus: 'strong' },
          { name: 'Science', retentionStatus: 'strong' },
        ]}
      />,
    );

    screen.getByTestId('aggregate-signal');
    screen.getByText('On Track');
  });

  it('renders "Falling Behind" aggregate signal when any subject is weak', () => {
    render(
      <ParentDashboardSummary
        {...defaultProps}
        subjects={[
          { name: 'Mathematics', retentionStatus: 'strong' },
          { name: 'Science', retentionStatus: 'weak' },
        ]}
      />,
    );

    screen.getByTestId('aggregate-signal');
    screen.getByText('Falling Behind');
  });

  it('renders "Falling Behind" aggregate signal when any subject is forgotten', () => {
    render(
      <ParentDashboardSummary
        {...defaultProps}
        subjects={[{ name: 'Mathematics', retentionStatus: 'forgotten' }]}
      />,
    );

    screen.getByTestId('aggregate-signal');
    screen.getByText('Falling Behind');
  });

  it('renders "No data yet" for aggregate signal when no subjects', () => {
    render(<ParentDashboardSummary {...defaultProps} subjects={[]} />);

    screen.getByTestId('aggregate-signal-empty');
    expect(screen.queryByTestId('aggregate-signal')).toBeNull();
  });

  // --- Progressive disclosure tests ---

  describe('progressive disclosure (totalSessions)', () => {
    it('hides aggregate signal for new learner (< 4 sessions)', () => {
      render(<ParentDashboardSummary {...defaultProps} totalSessions={2} />);

      expect(screen.queryByTestId('aggregate-signal')).toBeNull();
      expect(screen.queryByTestId('aggregate-signal-empty')).toBeNull();
    });

    it('hides retention trend badge for new learner', () => {
      render(
        <ParentDashboardSummary
          {...defaultProps}
          totalSessions={1}
          retentionTrend="improving"
        />,
      );

      expect(screen.queryByTestId('retention-trend-badge')).toBeNull();
    });

    it('shows teaser text for new learner', () => {
      render(<ParentDashboardSummary {...defaultProps} totalSessions={1} />);

      screen.getByTestId('parent-dashboard-teaser');
      screen.getByText(/3 more sessions/);
    });

    it('shows singular "session" when only 1 remaining', () => {
      render(<ParentDashboardSummary {...defaultProps} totalSessions={3} />);

      screen.getByText(/1 more session,/);
    });

    it('shows full signals for established learner (>= 4 sessions)', () => {
      render(
        <ParentDashboardSummary
          {...defaultProps}
          totalSessions={10}
          retentionTrend="improving"
        />,
      );

      screen.getByTestId('aggregate-signal');
      screen.getByTestId('retention-trend-badge');
      expect(screen.queryByTestId('parent-dashboard-teaser')).toBeNull();
    });

    it('hides trend text for new learner (guarded by showFullSignals)', () => {
      render(<ParentDashboardSummary {...defaultProps} totalSessions={0} />);

      // trendText is guarded by showFullSignals — new learners see the teaser instead
      expect(screen.queryByText(/sessions, .* this week/)).toBeNull();
    });

    it('defaults to showing full signals when totalSessions is undefined', () => {
      render(
        <ParentDashboardSummary {...defaultProps} retentionTrend="stable" />,
      );

      screen.getByTestId('aggregate-signal');
      screen.getByTestId('retention-trend-badge');
      expect(screen.queryByTestId('parent-dashboard-teaser')).toBeNull();
    });
  });
});
